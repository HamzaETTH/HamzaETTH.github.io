#!/usr/bin/env node

const fs = require('node:fs');
const { chromium } = require('playwright');

const SCENARIOS = [
  { name: 'normal', count: 185, inactiveBatch: 1000, gatherBatch: 30 },
  { name: 'catastrophic', count: 1000, inactiveBatch: 10, gatherBatch: 10, clustered: true },
  { name: 'dense', count: 5000, inactiveBatch: 1, gatherBatch: 1 },
  { name: 'dense10k', count: 10000, inactiveBatch: 1, gatherBatch: 1 }
];

function usage() {
  console.log(`Usage:
  rtk node scripts/benchmark-gather-lines.js --baseline <url> --optimized <url> [options]

Options:
  --trials <n>       Alternating trials per count and variant (default: 3)
  --samples <n>      Timing samples per phase (default: 5)
  --counts <list>    Comma-separated 185,1000,5000,10000 selection
  --output <path>    Save complete JSON output
  --headless         Run Edge headlessly
  --help             Show this help`);
}

function parseArgs(argv) {
  const options = { trials: 3, samples: 5, headless: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--baseline') options.baseline = argv[++i];
    else if (arg === '--optimized') options.optimized = argv[++i];
    else if (arg === '--trials') options.trials = Number(argv[++i]);
    else if (arg === '--samples') options.samples = Number(argv[++i]);
    else if (arg === '--counts') options.counts = argv[++i].split(',').map(Number);
    else if (arg === '--output') options.output = argv[++i];
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

function summarize(records, scenarios) {
  return scenarios.map(scenario => {
    const baseline = records.filter(row => row.scenario === scenario.name && row.variant === 'baseline');
    const optimized = records.filter(row => row.scenario === scenario.name && row.variant === 'optimized');
    const baselineInactiveMs = median(baseline.map(row => row.inactive.medianFrameMs));
    const optimizedInactiveMs = median(optimized.map(row => row.inactive.medianFrameMs));
    const baselineGatherMs = median(baseline.map(row => row.gather.medianFrameMs));
    const optimizedGatherMs = median(optimized.map(row => row.gather.medianFrameMs));
    return {
      scenario: scenario.name,
      count: scenario.count,
      baselineInactiveMs,
      optimizedInactiveMs,
      inactiveChangePct: (optimizedInactiveMs - baselineInactiveMs) / baselineInactiveMs * 100,
      baselineGatherMs,
      optimizedGatherMs,
      gatherImprovementPct: (baselineGatherMs - optimizedGatherMs) / baselineGatherMs * 100,
      baselineGatherCandidates: median(baseline.map(row => row.gather.candidateConnections)),
      optimizedGatherCandidates: median(optimized.map(row => row.gather.candidateConnections)),
      baselineGatherSegments: median(baseline.map(row => row.gather.emittedSegments)),
      optimizedGatherSegments: median(optimized.map(row => row.gather.emittedSegments))
    };
  });
}

async function launchEdge(headless) {
  return chromium.launch({
    channel: 'msedge',
    headless,
    args: [
      '--no-first-run',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding'
    ]
  });
}

async function runScenario(page, url, scenario, sampleCount) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.particleInstance && window.BenchmarkSystem &&
    window.particleInstance.glRenderer, null, { timeout: 30000 });

  return page.evaluate(async ({ scenario, sampleCount }) => {
    const pn = window.particleInstance;
    const benchmark = new window.BenchmarkSystem(pn);
    const { applyParamsToNetwork } = await import('./js/ui/applyParams.js');
    const localMedian = values => {
      const sorted = [...values].sort((a, b) => a - b);
      const middle = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    };
    const stop = () => {
      if (pn._rafId != null) cancelAnimationFrame(pn._rafId);
      pn._rafId = null;
      pn._rafActive = false;
    };
    stop();

    applyParamsToNetwork(pn, {
      ...pn.options,
      autoAdaptiveLineDetail: false,
      adaptiveLineDetail: true,
      cellularLineClusters: false,
      particleSize: 2,
      interactive: true,
      particleColorCycling: false,
      lineColorCycling: false,
      gradientEffect: true,
      useDistanceEffect: false,
      velocity: 0,
      boundaryMode: 'wrap',
      particleRepulsion: false,
      particleAttraction: false,
      particleCollision: false,
      lineConnectionDistance: 120,
      maxColorChangeDistance: 120,
      particleInteractionDistance: 50,
      lineJitter: false,
      trails: false,
      performanceOverlay: false,
      gravityWellsEnabled: false,
      gravityWellMotion: 'static'
    });
    if (typeof pn.clearGravityWells === 'function') pn.clearGravityWells();
    benchmark.setParticleCount(scenario.count);
    stop();

    let seed = 0x19f4a2b3 ^ scenario.count;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    const width = pn.i.size.width;
    const height = pn.i.size.height;
    for (let i = 0; i < scenario.count; i++) {
      const angle = i * 2.399963229728653;
      const radius = 8 + (i % 19) * 0.7;
      const x = scenario.clustered ? width * 0.5 + Math.cos(angle) * radius : random() * width;
      const y = scenario.clustered ? height * 0.5 + Math.sin(angle) * radius : random() * height;
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
    pn.initGrid();
    pn._lineDetailQualityIndex = 0;
    pn._lineDetailStartupTime = performance.now() + 3600000;
    if (pn.p) {
      pn.p.x = width * 0.5;
      pn.p.y = height * 0.5;
    }

    const lineKeys = [
      'gradientEffect', 'gradientColor1', 'gradientColor2', 'lineColorCycling',
      'lineCyclingSpeed', 'randomizeDistanceColors', 'colorDifferentiationMethod',
      'distanceColorCyclingSpeed', 'useDistanceEffect', 'maxColorChangeDistance',
      'lineConnectionDistance', 'adaptiveLineDetail', 'cellularLineClusters',
      'blackHoleLineColor', 'lineJitter', 'lineJitterSegments', 'lineJitterAmplitude',
      'autoAdaptiveLineDetail'
    ];
    const settings = () => Object.fromEntries(lineKeys.map(key => [key, pn.options[key]]));
    const beforeSettings = settings();

    const oneFrame = () => {
      stop();
      pn._lastUpdateTime = performance.now() - 1000 / 60;
      const started = performance.now();
      pn.update();
      const elapsed = performance.now() - started;
      stop();
      return elapsed;
    };
    const measure = batchSize => {
      oneFrame();
      oneFrame();
      const frameTimes = [];
      for (let sample = 0; sample < sampleCount; sample++) {
        const started = performance.now();
        for (let iteration = 0; iteration < batchSize; iteration++) oneFrame();
        frameTimes.push((performance.now() - started) / batchSize);
      }
      return {
        medianFrameMs: localMedian(frameTimes),
        frameTimes,
        candidateConnections: pn.lineDetailDiagnostics.candidateConnections,
        emittedSegments: pn.lineDetailDiagnostics.emittedSegments,
        predictedPairWork: pn.lineDetailDiagnostics.predictedPairWork || 0,
        denseOverload: pn.lineDetailDiagnostics.denseOverload === true,
        vertexCount: pn.glRenderer.vertexCount,
        pointCount: pn.glRenderer.pointCount
      };
    };

    const inactive = measure(scenario.inactiveBatch);

    seed = 0x51a7c0de ^ scenario.count;
    const originalRandom = Math.random;
    Math.random = random;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    Math.random = originalRandom;
    const gather = measure(scenario.gatherBatch);
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', bubbles: true }));
    stop();
    const afterSettings = settings();
    const released = {
      frameMs: oneFrame(),
      candidateConnections: pn.lineDetailDiagnostics.candidateConnections,
      emittedSegments: pn.lineDetailDiagnostics.emittedSegments,
      vertexCount: pn.glRenderer.vertexCount,
      pointCount: pn.glRenderer.pointCount
    };
    stop();

    return {
      particleCount: pn.numParticles,
      defaultPairForces: !pn.options.particleRepulsion && !pn.options.particleAttraction,
      inactive,
      gather,
      released,
      gatherInactiveAfterRelease: !pn._gatherActive,
      settingsRestored: JSON.stringify(beforeSettings) === JSON.stringify(afterSettings),
      hasGl: Boolean(pn.glRenderer && pn.glRenderer.gl),
      glContextLost: Boolean(pn.glRenderer && pn.glRenderer.gl && pn.glRenderer.gl.isContextLost())
    };
  }, { scenario, sampleCount });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return usage();
  if (!options.baseline || !options.optimized) throw new Error('--baseline and --optimized are required');
  if (!Number.isInteger(options.trials) || options.trials < 1 ||
      !Number.isInteger(options.samples) || options.samples < 1) {
    throw new Error('--trials and --samples must be positive integers');
  }
  const scenarios = options.counts
    ? SCENARIOS.filter(scenario => options.counts.includes(scenario.count))
    : SCENARIOS;
  if (!scenarios.length || (options.counts && scenarios.length !== new Set(options.counts).size)) {
    throw new Error('--counts contains an unknown or duplicate count');
  }

  const browserErrors = [];
  const records = [];
  const browser = await launchEdge(options.headless);
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    let currentRun = 'startup';
    page.on('console', message => {
      if (message.type() === 'error') browserErrors.push({ run: currentRun, type: 'console', text: message.text() });
    });
    page.on('pageerror', error => browserErrors.push({ run: currentRun, type: 'pageerror', text: String(error) }));

    const variants = ['baseline', 'optimized'];
    const urls = { baseline: options.baseline, optimized: options.optimized };
    const total = scenarios.length * options.trials * variants.length;
    let completed = 0;
    for (const scenario of scenarios) {
      for (let trial = 1; trial <= options.trials; trial++) {
        const order = trial % 2 === 1 ? variants : [...variants].reverse();
        for (const variant of order) {
          currentRun = `${scenario.name}/trial-${trial}/${variant}`;
          const result = await runScenario(page, urls[variant], scenario, options.samples);
          const record = { variant, scenario: scenario.name, count: scenario.count, trial, ...result };
          records.push(record);
          completed++;
          console.log('RUN', JSON.stringify(record));
          console.log(`PROGRESS ${completed}/${total}`);
        }
      }
    }
    const environment = await page.evaluate(() => ({
      userAgent: navigator.userAgent,
      viewport: `${innerWidth}x${innerHeight}`,
      devicePixelRatio
    }));
    environment.browserVersion = browser.version();
    const summary = summarize(records, scenarios);
      const highCountRows = summary.filter(row => row.count >= 5000);
      const catastrophicRows = records.filter(row => row.scenario === 'catastrophic');
      const assertions = {
      gatherImprovesAtLeast50PctAtHighCounts: highCountRows.every(row => row.gatherImprovementPct >= 50),
      inactiveRegressionAtMost1Pct: summary.every(row => row.inactiveChangePct <= 1),
      optimizedGatherSkipsConnections: records.filter(row => row.variant === 'optimized').every(row =>
        row.gather.candidateConnections === 0 && row.gather.emittedSegments === 0 && row.gather.vertexCount === 0),
      particlesRemainVisible: records.every(row => row.gather.pointCount === row.count),
      catastrophicAutoProtection: catastrophicRows.every(row => row.variant === 'baseline'
        ? row.inactive.candidateConnections > 0
        : row.inactive.denseOverload && row.inactive.predictedPairWork >= 250000 &&
          row.inactive.candidateConnections === 0 && row.inactive.emittedSegments === 0 &&
          row.inactive.pointCount === row.count),
      releaseRestoresLinesAndSettings: records.every(row => row.gatherInactiveAfterRelease && row.settingsRestored &&
        (row.scenario === 'catastrophic' && row.variant === 'optimized'
          ? row.released.candidateConnections === 0
          : row.released.candidateConnections > 0 && row.released.emittedSegments > 0 && row.released.vertexCount > 0)),
      exactCountsAndDefaultPairForces: records.every(row => row.particleCount === row.count && row.defaultPairForces),
      webGlHealthy: records.every(row => row.hasGl && !row.glContextLost),
      noBrowserErrors: browserErrors.length === 0
    };
    const result = {
      passed: Object.values(assertions).every(Boolean),
      environment,
      trials: options.trials,
      samples: options.samples,
      records,
      summary,
      assertions,
      browserErrors
    };
    if (options.output) fs.writeFileSync(options.output, JSON.stringify(result, null, 2) + '\n');
    console.log('RESULTS_JSON=' + JSON.stringify(result));
    if (!result.passed) process.exitCode = 2;
    await context.close();
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
