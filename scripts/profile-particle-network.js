#!/usr/bin/env node

const fs = require('node:fs');
const { chromium } = require('playwright');

function parseArgs(argv) {
  const options = { count: 10000, duration: 4000, trials: 3, output: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--baseline') options.baseline = argv[++i];
    else if (arg === '--optimized') options.optimized = argv[++i];
    else if (arg === '--count') options.count = Number(argv[++i]);
    else if (arg === '--duration') options.duration = Number(argv[++i]);
    else if (arg === '--trials') options.trials = Number(argv[++i]);
    else if (arg === '--output') options.output = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.baseline || !options.optimized) throw new Error('--baseline and --optimized are required');
  return options;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function summarizeProfile(profile, frameCount) {
  const nodes = new Map(profile.nodes.map(node => [node.id, node]));
  const selfMicros = new Map();
  for (let i = 0; i < profile.samples.length; i++) {
    const nodeId = profile.samples[i];
    selfMicros.set(nodeId, (selfMicros.get(nodeId) || 0) + profile.timeDeltas[i]);
  }

  const particleNodes = [...selfMicros.entries()].flatMap(([nodeId, micros]) => {
    const callFrame = nodes.get(nodeId).callFrame;
    if (!callFrame.url.includes('/js/ParticleNetwork.js')) return [];
    return [{
      functionName: callFrame.functionName || '(anonymous)',
      line: callFrame.lineNumber + 1,
      selfMs: micros / 1000
    }];
  }).sort((a, b) => b.selfMs - a.selfMs);

  const particleNetworkSelfMs = particleNodes.reduce((sum, node) => sum + node.selfMs, 0);
  return {
    frameCount,
    particleNetworkSelfMs,
    particleNetworkSelfMsPerFrame: particleNetworkSelfMs / frameCount,
    hottestParticleNodes: particleNodes.slice(0, 8)
  };
}

async function runProfile(browser, url, variant, trial, options) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const browserErrors = [];
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push({ type: 'console', text: message.text() });
  });
  page.on('pageerror', error => browserErrors.push({ type: 'pageerror', text: String(error) }));

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.particleInstance && window.BenchmarkSystem, null, { timeout: 30000 });
  await page.evaluate(async count => {
    if (!window.applyParamsToNetwork) {
      const module = await import('./js/ui/applyParams.js');
      window.applyParamsToNetwork = module.applyParamsToNetwork;
    }
    const pn = window.particleInstance;
    window.applyParamsToNetwork(pn, {
      interactive: false,
      particleColorCycling: false,
      lineColorCycling: false,
      gradientEffect: false,
      speed: 1.0,
      boundaryMode: 'wrap',
      performanceOverlay: false
    });
    const benchmark = new window.BenchmarkSystem(pn);
    benchmark.setParticleCount(count);
    await benchmark.wait(750);

    if (pn._rafId) cancelAnimationFrame(pn._rafId);
    const originalUpdate = pn.update;
    window.__profileFrameCount = 0;
    pn.update = function(timestamp) {
      window.__profileFrameCount++;
      return originalUpdate(timestamp);
    };
    pn._rafActive = true;
    pn._rafId = requestAnimationFrame(pn.update);
  }, options.count);

  const client = await context.newCDPSession(page);
  await client.send('Profiler.enable');
  await client.send('Profiler.setSamplingInterval', { interval: 100 });
  await client.send('Profiler.start');
  await page.waitForTimeout(options.duration);
  const { profile } = await client.send('Profiler.stop');
  const health = await page.evaluate(() => ({
    frameCount: window.__profileFrameCount,
    particleCount: window.particleInstance.o.length,
    rafActive: window.particleInstance._rafActive,
    hasGl: Boolean(window.particleInstance.glRenderer && window.particleInstance.glRenderer.gl),
    glContextLost: Boolean(window.particleInstance.glRenderer.gl.isContextLost())
  }));
  await context.close();

  return {
    variant,
    trial,
    ...summarizeProfile(profile, health.frameCount),
    ...health,
    browserErrors
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const records = [];
  try {
    for (let trial = 1; trial <= options.trials; trial++) {
      const order = trial % 2
        ? [['baseline', options.baseline], ['optimized', options.optimized]]
        : [['optimized', options.optimized], ['baseline', options.baseline]];
      for (const [variant, url] of order) {
        const record = await runProfile(browser, url, variant, trial, options);
        records.push(record);
        console.log('RUN ' + JSON.stringify({
          variant,
          trial,
          frameCount: record.frameCount,
          particleNetworkSelfMsPerFrame: record.particleNetworkSelfMsPerFrame
        }));
      }
    }
  } finally {
    await browser.close();
  }

  const baseline = records.filter(record => record.variant === 'baseline');
  const optimized = records.filter(record => record.variant === 'optimized');
  const baselineMedian = median(baseline.map(record => record.particleNetworkSelfMsPerFrame));
  const optimizedMedian = median(optimized.map(record => record.particleNetworkSelfMsPerFrame));
  const result = {
    passed: records.every(record =>
      record.particleCount === options.count &&
      record.rafActive && record.hasGl && !record.glContextLost &&
      record.browserErrors.length === 0
    ),
    environment: { count: options.count, duration: options.duration, trials: options.trials },
    summary: {
      baselineMedianSelfMsPerFrame: baselineMedian,
      optimizedMedianSelfMsPerFrame: optimizedMedian,
      changePct: ((optimizedMedian - baselineMedian) / baselineMedian) * 100
    },
    records
  };
  if (options.output) fs.writeFileSync(options.output, JSON.stringify(result, null, 2) + '\n');
  console.log('RESULTS_JSON=' + JSON.stringify(result));
  if (!result.passed) process.exitCode = 2;
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
