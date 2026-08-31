#!/usr/bin/env node

const fs = require('node:fs');
const { chromium } = require('playwright');

const FULL_STEPS = [
  { count: 1500, duration: 2000 },
  { count: 3000, duration: 2000 },
  { count: 5000, duration: 2000 },
  { count: 10000, duration: 2000 },
  { count: 15000, duration: 3000 }
];
const QUICK_STEPS = [
  { count: 1500, duration: 1000 },
  { count: 5000, duration: 1000 },
  { count: 15000, duration: 1500 }
];
const PROFILES = {
  static: { lineColorCycling: false, gradientEffect: false },
  cyclingGradient: { lineColorCycling: true, gradientEffect: true }
};

function usage() {
  console.log(`Usage:
  rtk node scripts/benchmark-particle-network.js \\
    --baseline http://127.0.0.1:8123/ \\
    --optimized http://127.0.0.1:8124/ [options]

Options:
  --quick          One short diagnostic trial at 1,500, 5,000, and 15,000 particles
  --smoke-only     Skip performance measurements and only verify the optimized URL
  --counts <list>  Test selected full-run counts, for example 1500,5000
  --trials <n>     Override the trial count
  --headless       Run without a visible Edge window
  --output <path>  Save the complete JSON result
  --screenshot <path>  Save the restored optimized page for visual smoke review
  --help           Show this help

The default full run is the reportable benchmark: three alternating trials for
both profiles at 1,500, 3,000, 5,000, 10,000, and 15,000 particles.`);
}

function parseArgs(argv) {
  const options = { quick: false, smokeOnly: false, headless: false, output: null, screenshot: null, counts: null, trials: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--baseline') options.baseline = argv[++i];
    else if (arg === '--optimized') options.optimized = argv[++i];
    else if (arg === '--output') options.output = argv[++i];
    else if (arg === '--screenshot') options.screenshot = argv[++i];
    else if (arg === '--counts') options.counts = argv[++i].split(',').map(Number);
    else if (arg === '--trials') options.trials = Number(argv[++i]);
    else if (arg === '--quick') options.quick = true;
    else if (arg === '--smoke-only') options.smokeOnly = true;
    else if (arg === '--headless') options.headless = true;
    else if (arg === '--help') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function launchEdge(headless, browserErrors) {
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
    browserErrors.push({ run: 'launch', type: 'headed-launch', text: String(error) });
    return {
      browser: await chromium.launch({ channel: 'msedge', headless: true, args }),
      launchMode: 'headless-fallback'
    };
  }
}

async function loadVariant(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.particleInstance && window.BenchmarkSystem, null, { timeout: 30000 });
  await page.evaluate(async () => {
    if (!window.applyParamsToNetwork) {
      const module = await import('./js/ui/applyParams.js');
      window.applyParamsToNetwork = module.applyParamsToNetwork;
    }
  });
}

async function runOne(page, url, variant, profileName, trial, step) {
  await loadVariant(page, url);
  const result = await page.evaluate(async ({ profile, count, duration }) => {
    const pn = window.particleInstance;
    const benchmark = new window.BenchmarkSystem(pn);
    window.applyParamsToNetwork(pn, {
      interactive: false,
      particleColorCycling: false,
      lineColorCycling: profile.lineColorCycling,
      gradientEffect: profile.gradientEffect,
      speed: 1.0,
      boundaryMode: 'wrap',
      performanceOverlay: false,
      gradientColor1: pn.options.gradientColor1 || '#00bfff',
      gradientColor2: pn.options.gradientColor2 || '#ff4500'
    });
    benchmark.setParticleCount(count);
    await benchmark.wait(500);
    const metrics = await benchmark.measure(duration);
    return {
      avgFps: metrics.avg,
      minFps: metrics.min,
      actualCount: pn.o.length,
      rafActive: pn._rafActive,
      hasGl: Boolean(pn.glRenderer && pn.glRenderer.gl),
      glContextLost: Boolean(pn.glRenderer && pn.glRenderer.gl && pn.glRenderer.gl.isContextLost())
    };
  }, { profile: PROFILES[profileName], count: step.count, duration: step.duration });
  return { variant, profile: profileName, trial, count: step.count, ...result };
}

async function smokeTest(page, optimizedUrl) {
  await loadVariant(page, optimizedUrl);
  return page.evaluate(async () => {
    const pn = window.particleInstance;
    const benchmark = new window.BenchmarkSystem(pn);
    const originalOptions = { ...pn.options };
    const originalCount = pn.o.length;
    benchmark.originalOptions = originalOptions;
    benchmark.originalCount = originalCount;
    window.applyParamsToNetwork(pn, {
      ...originalOptions,
      interactive: false,
      particleColorCycling: false,
      lineColorCycling: true,
      gradientEffect: true,
      speed: 1.0,
      performanceOverlay: false
    });
    benchmark.setParticleCount(1500);
    await benchmark.wait(750);
    const during = {
      count: pn.o.length,
      canvases: document.querySelectorAll('canvas').length,
      glContextLost: Boolean(pn.glRenderer && pn.glRenderer.gl && pn.glRenderer.gl.isContextLost()),
      canvasWidth: pn.canvas.width,
      canvasHeight: pn.canvas.height,
      frameColorsReady: Boolean(pn._frameLineColor1 && pn._frameLineColor2)
    };
    benchmark.restoreSettings();
    const findMismatches = () => Object.keys(originalOptions).flatMap(key => {
      const before = originalOptions[key];
      const after = pn.options[key];
      const matches = before && typeof before === 'object'
        ? JSON.stringify(before) === JSON.stringify(after)
        : Object.is(before, after);
      return matches ? [] : [{ key, before, after }];
    });
    const immediateMismatches = findMismatches();
    const restoredCount = pn.o.length;
    await benchmark.wait(750);
    const settledMismatches = findMismatches();
    const expectedDynamicKeys = originalOptions.lineColorCycling
      ? new Set(['gradientColor1', 'gradientColor2'])
      : new Set();
    const unexpectedSettledMismatches = settledMismatches.filter(item => !expectedDynamicKeys.has(item.key));
    return {
      during,
      restoredCount,
      originalCount,
      immediateMismatches,
      settledMismatches,
      unexpectedSettledMismatches,
      restored: restoredCount === originalCount && immediateMismatches.length === 0 && unexpectedSettledMismatches.length === 0,
      rafActive: pn._rafActive
    };
  });
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

  let steps = options.quick ? QUICK_STEPS : FULL_STEPS;
  if (options.counts) {
    if (options.counts.some(count => !Number.isFinite(count))) throw new Error('--counts must contain only numbers');
    steps = FULL_STEPS.filter(step => options.counts.includes(step.count));
    if (steps.length !== new Set(options.counts).size) throw new Error('--counts contains an unsupported particle count');
  }
  const trials = options.trials == null ? (options.quick ? 1 : 3) : options.trials;
  if (!Number.isInteger(trials) || trials < 1) throw new Error('--trials must be a positive integer');
  const measurementCount = options.smokeOnly ? 0 : Object.keys(PROFILES).length * steps.length * trials * 2;
  const mode = options.smokeOnly ? 'Smoke check' : (options.quick ? 'Quick diagnostic' : 'Full benchmark');
  console.log(`${mode}: ${measurementCount} measurements.`);

  const records = [];
  const browserErrors = [];
  let currentRun = 'startup';
  const { browser, launchMode } = await launchEdge(options.headless, browserErrors);
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('console', message => {
      if (message.type() === 'error') browserErrors.push({ run: currentRun, type: 'console', text: message.text() });
    });
    page.on('pageerror', error => browserErrors.push({ run: currentRun, type: 'pageerror', text: String(error) }));

    await loadVariant(page, options.optimized);
    const environment = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl');
      const debug = gl && gl.getExtension('WEBGL_debug_renderer_info');
      return {
        userAgent: navigator.userAgent,
        viewport: `${innerWidth}x${innerHeight}`,
        devicePixelRatio,
        webglVendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : null,
        webglRenderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null
      };
    });
    environment.browserVersion = browser.version();
    environment.launchMode = launchMode;

    if (!options.smokeOnly) {
      for (const profileName of Object.keys(PROFILES)) {
        for (let trial = 1; trial <= trials; trial++) {
          for (const step of steps) {
            const order = trial % 2 === 1 ? ['baseline', 'optimized'] : ['optimized', 'baseline'];
            for (const variant of order) {
              currentRun = `${profileName}/trial-${trial}/${step.count}/${variant}`;
              const url = variant === 'baseline' ? options.baseline : options.optimized;
              const record = await runOne(page, url, variant, profileName, trial, step);
              records.push(record);
              console.log('RUN', JSON.stringify(record));
            }
          }
        }
      }
    }

    const summary = [];
    if (!options.smokeOnly) {
      for (const profile of Object.keys(PROFILES)) {
        for (const step of steps) {
          const baseline = records.filter(r => r.profile === profile && r.count === step.count && r.variant === 'baseline');
          const optimized = records.filter(r => r.profile === profile && r.count === step.count && r.variant === 'optimized');
          const baselineAvg = median(baseline.map(r => r.avgFps));
          const baselineMin = median(baseline.map(r => r.minFps));
          const optimizedAvg = median(optimized.map(r => r.avgFps));
          const optimizedMin = median(optimized.map(r => r.minFps));
          summary.push({
            profile,
            count: step.count,
            baselineAvg,
            baselineMin,
            optimizedAvg,
            optimizedMin,
            avgChangePct: ((optimizedAvg - baselineAvg) / baselineAvg) * 100,
            minChangePct: ((optimizedMin - baselineMin) / baselineMin) * 100
          });
        }
      }
    }

    currentRun = 'optimized-smoke';
    const smoke = await smokeTest(page, options.optimized);
    if (options.screenshot) await page.screenshot({ path: options.screenshot, fullPage: true });
    const result = { environment, mode: options.smokeOnly ? 'smoke-only' : (options.quick ? 'quick' : 'full'), records, summary, smoke, browserErrors };
    if (options.output) fs.writeFileSync(options.output, JSON.stringify(result, null, 2) + '\n');
    console.log('RESULTS_JSON=' + JSON.stringify(result));

    const invalidCount = records.some(record => record.actualCount !== record.count);
    const renderFailure = records.some(record => !record.rafActive || !record.hasGl || record.glContextLost);
    if (invalidCount || renderFailure || !smoke.restored || browserErrors.length) process.exitCode = 2;
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
