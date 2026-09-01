#!/usr/bin/env node

const fs = require('node:fs');
const { chromium } = require('playwright');

const STATE_DURATION_MS = 1100;
const STOP_SETTLE_MS = 500;

function usage() {
  console.log(`Usage:
  rtk node scripts/benchmark-ui-sync.js \\
    --baseline http://127.0.0.1:8123/ \\
    --optimized http://127.0.0.1:8124/ [options]

Options:
  --trials <n>     Alternating A/B trial count (default: 5)
  --headless       Run without a visible Edge window
  --output <path>  Save the complete JSON result
  --help           Show this help`);
}

function parseArgs(argv) {
  const options = { trials: 5, headless: false, output: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--baseline') options.baseline = argv[++i];
    else if (arg === '--optimized') options.optimized = argv[++i];
    else if (arg === '--trials') options.trials = Number(argv[++i]);
    else if (arg === '--headless') options.headless = true;
    else if (arg === '--output') options.output = argv[++i];
    else if (arg === '--help') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function formatDuration(ms) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

function installUiSyncInstrumentation() {
  const metrics = { rafCallbacks: 0, bindingRefreshes: 0, refreshTimeMs: 0 };
  const visited = new WeakSet();
  const wrappedBindings = new WeakSet();
  const bindingsByLabel = new Map();
  const context = window.hotkeyManager.context;
  const originalRaf = window.requestAnimationFrame.bind(window);
  let bindingCount = 0;

  window.requestAnimationFrame = function(callback) {
    return originalRaf(function(timestamp) {
      metrics.rafCallbacks++;
      return callback(timestamp);
    });
  };

  function list(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    try { return Array.from(value); } catch (_) { return []; }
  }

  function instrumentApi(api) {
    if (!api || (typeof api !== 'object' && typeof api !== 'function') || visited.has(api)) return;
    visited.add(api);
    const children = list(api.children);
    const pages = list(api.pages);
    for (const child of children) instrumentApi(child);
    for (const page of pages) instrumentApi(page);

    if (children.length || pages.length || typeof api.refresh !== 'function' || wrappedBindings.has(api)) return;
    wrappedBindings.add(api);
    bindingCount++;
    if (typeof api.label === 'string') bindingsByLabel.set(api.label, api);
    const originalRefresh = api.refresh;
    const wrappedRefresh = function(...args) {
      const startedAt = performance.now();
      try {
        return originalRefresh.apply(this, args);
      } finally {
        metrics.bindingRefreshes++;
        metrics.refreshTimeMs += performance.now() - startedAt;
      }
    };
    try {
      Object.defineProperty(api, 'refresh', { configurable: true, writable: true, value: wrappedRefresh });
    } catch (_) {
      api.refresh = wrappedRefresh;
    }
  }

  instrumentApi(context.pane);
  window.__uiSyncBenchmark = {
    resetMetrics() {
      metrics.rafCallbacks = 0;
      metrics.bindingRefreshes = 0;
      metrics.refreshTimeMs = 0;
    },
    snapshotMetrics() {
      return { ...metrics };
    },
    bindingSnapshot(key) {
      return { sourceValue: context.params[key] };
    },
    renderedColorSnapshot(label) {
      const api = bindingsByLabel.get(label);
      const input = api && api.element ? api.element.querySelector('.tp-colv_t input.tp-txtv_i') : null;
      const swatch = api && api.element ? api.element.querySelector('.tp-colswv_sw') : null;
      return {
        inputValue: input ? input.value : null,
        swatchColor: swatch ? swatch.style.backgroundColor : null
      };
    },
    bindingCount() {
      return bindingCount;
    }
  };
}

function dispatchControlToggle() {
  window.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'c',
    code: 'KeyC',
    bubbles: true,
    cancelable: true
  }));
  window.dispatchEvent(new KeyboardEvent('keyup', {
    key: 'c',
    code: 'KeyC',
    bubbles: true,
    cancelable: true
  }));
}

async function launchEdge(headless) {
  const args = [
    '--no-first-run',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding'
  ];
  try {
    return {
      browser: await chromium.launch({ channel: 'msedge', headless, args }),
      launchMode: headless ? 'headless' : 'headed'
    };
  } catch (error) {
    if (headless) throw error;
    return {
      browser: await chromium.launch({ channel: 'msedge', headless: true, args }),
      launchMode: 'headless-fallback',
      launchWarning: String(error)
    };
  }
}

async function measureState(page, name) {
  await page.evaluate(() => window.__uiSyncBenchmark.resetMetrics());
  await page.waitForTimeout(STATE_DURATION_MS);
  return page.evaluate(stateName => ({
    name: stateName,
    ...window.__uiSyncBenchmark.snapshotMetrics(),
    gradientColor1: window.__uiSyncBenchmark.bindingSnapshot('gradientColor1'),
    gradientColor2: window.__uiSyncBenchmark.bindingSnapshot('gradientColor2')
  }), name);
}

async function loadVariant(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => {
    const manager = window.hotkeyManager;
    return window.particleInstance && manager && manager.context && manager.context.params && manager.handlers.has('c');
  }, null, { timeout: 30000 });
  const paneBuilt = await page.evaluate(() => Boolean(window.hotkeyManager.context.pane));
  if (!paneBuilt) {
    await page.evaluate(dispatchControlToggle);
    await page.waitForFunction(() => {
      const manager = window.hotkeyManager;
      const container = document.getElementById('tp-container');
      return manager.context.pane && container && getComputedStyle(container).display !== 'none';
    }, null, { timeout: 30000 });
    await page.evaluate(dispatchControlToggle);
    await page.waitForFunction(() => {
      const container = document.getElementById('tp-container');
      return container && getComputedStyle(container).display === 'none';
    }, null, { timeout: 5000 });
  }
  await page.evaluate(installUiSyncInstrumentation);
  await page.waitForTimeout(100);
}

async function runVariant(page, url, variant, trial) {
  await loadVariant(page, url);
  const initial = await page.evaluate(() => ({
    paneHidden: getComputedStyle(document.getElementById('tp-container')).display === 'none',
    bindingCount: window.__uiSyncBenchmark.bindingCount()
  }));

  const hiddenRunning = await measureState(page, 'hidden/running');

  await page.evaluate(dispatchControlToggle);
  const visibleStart = await page.evaluate(() => ({
    paneVisible: getComputedStyle(document.getElementById('tp-container')).display !== 'none',
    gradientColor1: window.hotkeyManager.context.params.gradientColor1,
    gradientColor2: window.hotkeyManager.context.params.gradientColor2
  }));
  const visibleRunning = await measureState(page, 'visible/running');
  visibleRunning.gradientAdvanced =
    visibleStart.gradientColor1 !== visibleRunning.gradientColor1.sourceValue ||
    visibleStart.gradientColor2 !== visibleRunning.gradientColor2.sourceValue;

  await page.evaluate(() => {
    const app = window.hotkeyManager.context;
    app.params.speed = 0;
    app.applyParamsToNetwork(app.particleInstance, app.params);
  });
  await page.waitForFunction(() => !window.particleInstance._rafActive && window.particleInstance._rafId == null);
  await page.waitForTimeout(STOP_SETTLE_MS);
  const visibleStopped = await measureState(page, 'visible/stopped');

  await page.evaluate(dispatchControlToggle);
  await page.waitForTimeout(150);
  const hiddenStopped = await measureState(page, 'hidden/stopped');

  const catchUp = await page.evaluate(() => {
    const app = window.hotkeyManager.context;
    const state = window.__uiSyncBenchmark;
    const before = {
      gradientColor1: state.bindingSnapshot('gradientColor1'),
      gradientColor2: state.bindingSnapshot('gradientColor2')
    };
    app.particleInstance.currentLineColor1Rgb = [0x12, 0x34, 0x56];
    app.particleInstance.currentLineColor2Rgb = [0x65, 0x43, 0x21];
    state.resetMetrics();
    window.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'c',
      code: 'KeyC',
      bubbles: true,
      cancelable: true
    }));
    window.dispatchEvent(new KeyboardEvent('keyup', {
      key: 'c',
      code: 'KeyC',
      bubbles: true,
      cancelable: true
    }));
    const after = {
      gradientColor1: state.bindingSnapshot('gradientColor1'),
      gradientColor2: state.bindingSnapshot('gradientColor2'),
      renderedGradientColor1: state.renderedColorSnapshot('Gradient Color 1'),
      renderedGradientColor2: state.renderedColorSnapshot('Gradient Color 2')
    };
    const metrics = state.snapshotMetrics();
    return {
      before,
      after,
      ...metrics,
      paneVisible: getComputedStyle(document.getElementById('tp-container')).display !== 'none',
      immediate: after.gradientColor1.sourceValue.toLowerCase() === '#123456' &&
        after.gradientColor2.sourceValue.toLowerCase() === '#654321' &&
        after.renderedGradientColor1.inputValue &&
        after.renderedGradientColor1.inputValue.toLowerCase() === '#123456' &&
        after.renderedGradientColor2.inputValue &&
        after.renderedGradientColor2.inputValue.toLowerCase() === '#654321' &&
        metrics.bindingRefreshes >= 2
    };
  });

  const health = await page.evaluate(() => {
    const pn = window.particleInstance;
    return {
      hasGl: Boolean(pn.glRenderer && pn.glRenderer.gl),
      glContextLost: Boolean(pn.glRenderer && pn.glRenderer.gl && pn.glRenderer.gl.isContextLost()),
      paneVisible: getComputedStyle(document.getElementById('tp-container')).display !== 'none'
    };
  });

  return {
    variant,
    trial,
    initial,
    visibleStart,
    states: { hiddenRunning, visibleRunning, visibleStopped, hiddenStopped },
    catchUp,
    health
  };
}

function summarize(records) {
  const states = ['hiddenRunning', 'visibleRunning', 'visibleStopped', 'hiddenStopped'];
  const summary = {};
  for (const variant of ['baseline', 'optimized']) {
    const selected = records.filter(record => record.variant === variant);
    summary[variant] = { states: {} };
    for (const state of states) {
      summary[variant].states[state] = {
        medianRafCallbacks: median(selected.map(record => record.states[state].rafCallbacks)),
        medianBindingRefreshes: median(selected.map(record => record.states[state].bindingRefreshes)),
        medianRefreshTimeMs: median(selected.map(record => record.states[state].refreshTimeMs))
      };
    }
    summary[variant].catchUpPasses = selected.filter(record => record.catchUp.immediate).length;
  }
  return summary;
}

function optimizedAcceptance(records, browserErrors) {
  const failures = [];
  for (const record of records.filter(item => item.variant === 'optimized')) {
    const prefix = `trial ${record.trial}`;
    if (!record.initial.paneHidden) failures.push(`${prefix}: pane was not initially hidden`);
    if (record.states.hiddenRunning.bindingRefreshes !== 0) failures.push(`${prefix}: hidden/running refreshed bindings`);
    if (!record.visibleStart.paneVisible) failures.push(`${prefix}: pane did not become visible`);
    if (!record.states.visibleRunning.gradientAdvanced) failures.push(`${prefix}: visible/running gradients did not advance`);
    if (record.states.visibleRunning.bindingRefreshes > 24) failures.push(`${prefix}: visible/running exceeded 24 binding refreshes`);
    if (record.states.visibleStopped.bindingRefreshes !== 0) failures.push(`${prefix}: visible/stopped refreshed unchanged bindings`);
    if (record.states.hiddenStopped.bindingRefreshes !== 0) failures.push(`${prefix}: hidden/stopped refreshed bindings`);
    if (record.states.hiddenStopped.rafCallbacks !== 0) failures.push(`${prefix}: hidden/stopped retained rAF callbacks`);
    if (!record.catchUp.immediate) failures.push(`${prefix}: pane show did not synchronously catch up colors`);
    if (!record.health.hasGl || record.health.glContextLost) failures.push(`${prefix}: WebGL health check failed`);
  }
  if (browserErrors.length) failures.push(`${browserErrors.length} browser error(s) recorded`);
  return { passed: failures.length === 0, failures };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  if (!options.baseline || !options.optimized) {
    usage();
    throw new Error('--baseline and --optimized are required');
  }
  if (!Number.isInteger(options.trials) || options.trials < 1) {
    throw new Error('--trials must be a positive integer');
  }

  const totalRuns = options.trials * 2;
  console.log(`UI sync benchmark: ${totalRuns} alternating variant trials.`);
  const records = [];
  const browserErrors = [];
  const startedAt = performance.now();
  let completed = 0;
  let currentRun = 'startup';
  const { browser, launchMode, launchWarning } = await launchEdge(options.headless);

  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('console', message => {
      if (message.type() === 'error') browserErrors.push({ run: currentRun, type: 'console', text: message.text() });
    });
    page.on('pageerror', error => browserErrors.push({ run: currentRun, type: 'pageerror', text: String(error) }));

    for (let trial = 1; trial <= options.trials; trial++) {
      const order = trial % 2 === 1 ? ['baseline', 'optimized'] : ['optimized', 'baseline'];
      for (const variant of order) {
        currentRun = `${variant}/trial-${trial}`;
        const url = variant === 'baseline' ? options.baseline : options.optimized;
        const record = await runVariant(page, url, variant, trial);
        records.push(record);
        console.log('RUN', JSON.stringify(record));
        completed++;
        const elapsed = performance.now() - startedAt;
        const eta = (elapsed / completed) * (totalRuns - completed);
        console.log(`PROGRESS ${completed}/${totalRuns} elapsed=${formatDuration(elapsed)} eta=${formatDuration(eta)}`);
      }
    }

    const environment = await page.evaluate(() => ({
      userAgent: navigator.userAgent,
      viewport: `${innerWidth}x${innerHeight}`,
      devicePixelRatio
    }));
    environment.browserVersion = browser.version();
    environment.launchMode = launchMode;
    if (launchWarning) environment.launchWarning = launchWarning;

    const summary = summarize(records);
    const acceptance = optimizedAcceptance(records, browserErrors);
    const result = { environment, trials: options.trials, records, summary, browserErrors, acceptance };
    if (options.output) fs.writeFileSync(options.output, JSON.stringify(result, null, 2) + '\n');
    console.log('RESULTS_JSON=' + JSON.stringify(result));
    if (!acceptance.passed) process.exitCode = 2;
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
