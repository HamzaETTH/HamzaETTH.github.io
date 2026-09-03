#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const SCENARIOS = [
  { name: 'normal', count: 185, layout: 'uniform', warmupMs: 750, durationMs: 1250 },
  { name: 'dense', count: 5000, layout: 'uniform', warmupMs: 4000, durationMs: 1750 },
  { name: 'blackHole10k', count: 10000, layout: 'cluster', warmupMs: 4000, durationMs: 2250 }
];

function usage() {
  console.log(`Usage:
  rtk node scripts/benchmark-adaptive-lines.js --baseline <url> [options]

Options:
  --optimized <url>       Run alternating baseline/optimized trials
  --baseline-only         Measure only the untouched baseline
  --trials <n>            Trials per scenario and variant (default: 3)
  --scenarios <list>      Comma-separated normal,dense,blackHole10k selection
  --output <path>         Save complete JSON output
  --screenshot-dir <dir>  Save representative black-hole screenshots
  --headless              Run Edge headlessly
  --help                  Show this help`);
}

function parseArgs(argv) {
  const options = { trials: 3, headless: false, baselineOnly: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--baseline') options.baseline = argv[++i];
    else if (arg === '--optimized') options.optimized = argv[++i];
    else if (arg === '--trials') options.trials = Number(argv[++i]);
    else if (arg === '--scenarios') options.scenarios = argv[++i].split(',');
    else if (arg === '--output') options.output = argv[++i];
    else if (arg === '--screenshot-dir') options.screenshotDir = argv[++i];
    else if (arg === '--baseline-only') options.baselineOnly = true;
    else if (arg === '--headless') options.headless = true;
    else if (arg === '--help') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function summarize(records, variants, scenarios) {
  const summary = [];
  for (const scenario of scenarios) {
    for (const variant of variants) {
      const rows = records.filter(row => row.scenario === scenario.name && row.variant === variant);
      summary.push({
        scenario: scenario.name,
        variant,
        medianFrameMs: median(rows.map(row => row.medianFrameMs)),
        medianFps: median(rows.map(row => row.fps)),
        medianLines: median(rows.map(row => row.medianLines)),
        peakLines: Math.max(...rows.map(row => row.peakLines)),
        peakLineCapacity: Math.max(...rows.map(row => row.peakLineCapacity)),
        finalQualityLevel: rows.at(-1)?.diagnostics?.qualityLevel ?? null
      });
    }
  }
  if (variants.length === 2) {
    for (const scenario of scenarios) {
      const before = summary.find(row => row.scenario === scenario.name && row.variant === 'baseline');
      const after = summary.find(row => row.scenario === scenario.name && row.variant === 'optimized');
      after.frameTimeChangePct = ((after.medianFrameMs - before.medianFrameMs) / before.medianFrameMs) * 100;
      after.fpsChangePct = ((after.medianFps - before.medianFps) / before.medianFps) * 100;
    }
  }
  return summary;
}

async function launchEdge(headless) {
  const args = [
    '--no-first-run',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding'
  ];
  try {
    return await chromium.launch({ channel: 'msedge', headless, args });
  } catch (error) {
    if (headless) throw error;
    console.warn('Headed Edge failed; retrying headless:', String(error));
    return chromium.launch({ channel: 'msedge', headless: true, args });
  }
}

async function loadScenario(page, url, scenario) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.particleInstance && window.BenchmarkSystem, null, { timeout: 30000 });
  await page.evaluate(async ({ count, layout }) => {
    if (!window.applyParamsToNetwork) {
      const module = await import('./js/ui/applyParams.js');
      window.applyParamsToNetwork = module.applyParamsToNetwork;
    }
    const pn = window.particleInstance;
    const benchmark = new window.BenchmarkSystem(pn);
    window.applyParamsToNetwork(pn, {
      ...pn.options,
      adaptiveLineDetail: true,
      cellularLineClusters: false,
      particleSize: 2,
      interactive: false,
      particleColorCycling: false,
      lineColorCycling: false,
      gradientEffect: true,
      speed: 0.001,
      boundaryMode: 'wrap',
      particleRepulsion: false,
      particleAttraction: false,
      particleCollision: false,
      lineConnectionDistance: 120,
      maxColorChangeDistance: 120,
      lineJitter: false,
      trails: false,
      performanceOverlay: false,
      gravityWellMotion: 'static'
    });
    if (typeof pn.clearGravityWells === 'function') pn.clearGravityWells();
    benchmark.setParticleCount(count);

    let seed = layout === 'cluster' ? 0x51a7c0de : 0x19f4a2b3;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    const width = pn.i.size.width;
    const height = pn.i.size.height;
    const centerX = width * 0.5;
    const centerY = height * 0.52;
    for (let i = 0; i < count; i++) {
      let x;
      let y;
      if (layout === 'cluster') {
        const angle = random() * Math.PI * 2;
        const radius = 45 + Math.sqrt(random()) * 190;
        x = centerX + Math.cos(angle) * radius;
        y = centerY + Math.sin(angle) * radius * 0.72;
      } else {
        x = random() * width;
        y = random() * height;
      }
      const particle = pn.o[i];
      particle.x = x;
      particle.y = y;
      particle.velocity.x = 0;
      particle.velocity.y = 0;
      pn.posX[i] = x;
      pn.posY[i] = y;
      pn.velX[i] = 0;
      pn.velY[i] = 0;
    }
    if (layout === 'cluster' && typeof pn.addGravityWell === 'function') {
      const well = pn.addGravityWell('black', centerX, centerY, 165);
      pn.updateGravityWell(well.id, { strength: 0 });
    }
    pn._ensureAnimationLoop();
  }, scenario);
  await page.waitForTimeout(scenario.warmupMs);
}

async function measureScenario(page, variant, scenario, trial) {
  const result = await page.evaluate(async durationMs => {
    const pn = window.particleInstance;
    const frameTimes = [];
    const lineCounts = [];
    let peakLineCapacity = pn.glRenderer ? pn.glRenderer.maxLines : 0;
    let previous = performance.now();
    const started = previous;
    await new Promise(resolve => {
      function sample(now) {
        const dt = now - previous;
        previous = now;
        if (dt > 0 && dt < 1000) frameTimes.push(dt);
        if (pn.glRenderer) {
          lineCounts.push(pn.glRenderer.lastFrameLines || 0);
          peakLineCapacity = Math.max(peakLineCapacity, pn.glRenderer.maxLines || 0);
        }
        if (now - started >= durationMs) resolve();
        else requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    });
    const elapsed = performance.now() - started;
    const sortedTimes = [...frameTimes].sort((a, b) => a - b);
    const sortedLines = [...lineCounts].sort((a, b) => a - b);
    const middle = Math.floor(sortedTimes.length / 2);
    const lineMiddle = Math.floor(sortedLines.length / 2);
    const medianFrameMs = sortedTimes.length % 2
      ? sortedTimes[middle]
      : (sortedTimes[middle - 1] + sortedTimes[middle]) / 2;
    const medianLines = sortedLines.length % 2
      ? sortedLines[lineMiddle]
      : (sortedLines[lineMiddle - 1] + sortedLines[lineMiddle]) / 2;
    return {
      elapsed,
      sampledFrames: frameTimes.length,
      fps: frameTimes.length * 1000 / elapsed,
      medianFrameMs,
      medianLines,
      peakLines: lineCounts.length ? Math.max(...lineCounts) : 0,
      peakLineCapacity,
      diagnostics: pn.lineDetailDiagnostics ? { ...pn.lineDetailDiagnostics } : null,
      particleCount: pn.numParticles,
      hasGl: Boolean(pn.glRenderer && pn.glRenderer.gl),
      glContextLost: Boolean(pn.glRenderer && pn.glRenderer.gl && pn.glRenderer.gl.isContextLost())
    };
  }, scenario.durationMs);
  return { variant, scenario: scenario.name, trial, ...result };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return usage();
  if (!options.baseline) throw new Error('--baseline is required');
  if (!options.baselineOnly && !options.optimized) throw new Error('--optimized is required unless --baseline-only is used');
  if (!Number.isInteger(options.trials) || options.trials < 1) throw new Error('--trials must be a positive integer');
  if (options.screenshotDir) fs.mkdirSync(options.screenshotDir, { recursive: true });
  const scenarios = options.scenarios
    ? SCENARIOS.filter(scenario => options.scenarios.includes(scenario.name))
    : SCENARIOS;
  if (!scenarios.length || (options.scenarios && scenarios.length !== new Set(options.scenarios).size)) {
    throw new Error('--scenarios contains an unknown or duplicate scenario');
  }

  const variants = options.baselineOnly ? ['baseline'] : ['baseline', 'optimized'];
  const urls = { baseline: options.baseline, optimized: options.optimized };
  const records = [];
  const browserErrors = [];
  const browser = await launchEdge(options.headless);
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    let currentRun = 'startup';
    page.on('console', message => {
      if (message.type() === 'error') browserErrors.push({ run: currentRun, type: 'console', text: message.text() });
    });
    page.on('pageerror', error => browserErrors.push({ run: currentRun, type: 'pageerror', text: String(error) }));

    const total = scenarios.length * options.trials * variants.length;
    let completed = 0;
    for (const scenario of scenarios) {
      for (let trial = 1; trial <= options.trials; trial++) {
        const order = variants.length === 1 || trial % 2 === 1 ? variants : [...variants].reverse();
        for (const variant of order) {
          currentRun = `${scenario.name}/trial-${trial}/${variant}`;
          await loadScenario(page, urls[variant], scenario);
          if (options.screenshotDir && scenario.name === 'blackHole10k' && trial === 1) {
            await page.screenshot({ path: path.join(options.screenshotDir, `${variant}-black-hole.png`), fullPage: true });
          }
          const record = await measureScenario(page, variant, scenario, trial);
          records.push(record);
          completed++;
          console.log('RUN', JSON.stringify(record));
          console.log(`PROGRESS ${completed}/${total}`);
          if (
            options.screenshotDir &&
            variant === 'optimized' &&
            scenario.name === 'blackHole10k' &&
            trial === 1
          ) {
            await page.evaluate(() => {
              const pn = window.particleInstance;
              pn._lineDetailQualityIndex = 0;
              pn._lineDetailStartupTime = performance.now();
              pn.options.adaptiveLineDetail = false;
              pn.options.cellularLineClusters = true;
            });
            await page.waitForTimeout(1500);
            await page.screenshot({
              path: path.join(options.screenshotDir, 'optimized-cellular-black-hole.png'),
              fullPage: true
            });
          }
        }
      }
    }

    const environment = await page.evaluate(() => ({
      userAgent: navigator.userAgent,
      viewport: `${innerWidth}x${innerHeight}`,
      devicePixelRatio
    }));
    environment.browserVersion = browser.version();
    const result = { environment, records, summary: summarize(records, variants, scenarios), browserErrors };
    if (options.output) fs.writeFileSync(options.output, JSON.stringify(result, null, 2) + '\n');
    console.log('RESULTS_JSON=' + JSON.stringify(result));

    const invalid = records.some(row => row.particleCount !== SCENARIOS.find(s => s.name === row.scenario).count);
    const renderFailure = records.some(row => !row.hasGl || row.glContextLost || !Number.isFinite(row.medianFrameMs));
    if (invalid || renderFailure || browserErrors.length) process.exitCode = 2;
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
