#!/usr/bin/env node

const { chromium } = require('playwright');

function usage() {
  console.log(`Usage:
  rtk node scripts/test-pair-hot-path.js \\
    --baseline http://127.0.0.1:8123/ \\
    --optimized http://127.0.0.1:8124/ \\
    --expect <thresholds|velocity> [--trials 3] [--headless]`);
}

function parseArgs(argv) {
  const options = { trials: 1, headless: false, expect: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--baseline') options.baseline = argv[++i];
    else if (arg === '--optimized') options.optimized = argv[++i];
    else if (arg === '--expect') options.expect = argv[++i];
    else if (arg === '--trials') options.trials = Number(argv[++i]);
    else if (arg === '--headless') options.headless = true;
    else if (arg === '--help') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function close(actual, expected, epsilon = 1e-6) {
  return Math.abs(actual - expected) <= epsilon;
}

function numericArraysMatch(actual, expected) {
  return actual.length === expected.length && actual.every((value, index) => close(value, expected[index]));
}

function snapshotsMatch(actual, expected) {
  if (actual.positions.length !== expected.positions.length ||
      actual.velocities.length !== expected.velocities.length ||
      actual.lines.length !== expected.lines.length) return false;
  return actual.positions.every((value, index) => numericArraysMatch(value, expected.positions[index])) &&
    actual.velocities.every((value, index) => numericArraysMatch(value, expected.velocities[index])) &&
    actual.lines.every((value, index) => numericArraysMatch(value, expected.lines[index]));
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

async function loadPage(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    () => window.particleInstance && window.BenchmarkSystem && window.particleInstance.glRenderer,
    null,
    { timeout: 30000 }
  );
}

async function runVariant(page, url, includeInvalidPointer) {
  await loadPage(page, url);
  return page.evaluate(({ includeInvalidPointer }) => {
    const pn = window.particleInstance;
    const benchmark = new window.BenchmarkSystem(pn);
    const renderer = pn.glRenderer;
    const originalOptions = pn.options;
    const originalIsNaN = window.isNaN;
    const originalAddLine = renderer.addLine;

    if (pn._rafId) cancelAnimationFrame(pn._rafId);
    pn._rafActive = false;
    benchmark.setParticleCount(8);

    const positions = [
      [100, 100], [120, 100], [155, 100], [225, 100],
      [100, 220], [220, 220], [340, 220], [460, 220]
    ];
    const baseVelocities = [
      [0.20, -0.10], [-0.15, 0.05], [0.10, 0.12], [-0.08, -0.04],
      [0.03, 0.07], [-0.06, 0.02], [0.04, -0.05], [-0.02, 0.09]
    ];
    const thresholdKeys = [
      'particleInteractionDistance',
      'lineConnectionDistance',
      'maxColorChangeDistance'
    ];
    const scenarios = [
      { name: 'no-force', repulsion: false, attraction: false, force: 5 },
      { name: 'repulsion', repulsion: true, attraction: false, force: 5 },
      { name: 'attraction', repulsion: false, attraction: true, force: 5 },
      { name: 'invalid-force', repulsion: true, attraction: false, force: Number.NaN }
    ];
    const results = [];

    function resetFixture(scenario) {
      pn.options = originalOptions;
      Object.assign(originalOptions, {
        velocity: 0,
        interactive: false,
        particleCollision: false,
        curvedDrift: false,
        trails: false,
        lineJitter: false,
        particleColorCycling: false,
        lineColorCycling: false,
        gradientEffect: false,
        useDistanceEffect: true,
        randomizeDistanceColors: false,
        particleInteractionDistance: 50,
        lineConnectionDistance: 120,
        maxColorChangeDistance: 120,
        proximityEffectDistance: 100,
        particleRepulsion: scenario.repulsion,
        particleAttraction: scenario.attraction,
        particleRepulsionForce: scenario.force,
        particleAttractionForce: scenario.force,
        gradientColor1: '#ff0000',
        gradientColor2: '#0000ff'
      });
      pn.startColorRgb = [255, 0, 0];
      pn.endColorRgb = [0, 0, 255];
      pn.attractionForce = null;
      pn.repulsionForce = null;

      while (pn.o.length > 8) pn.o.pop();
      for (let i = 0; i < 8; i++) {
        const particle = pn.o[i];
        particle.index = i;
        particle.x = positions[i][0];
        particle.y = positions[i][1];
        particle.velocity.x = baseVelocities[i][0];
        particle.velocity.y = baseVelocities[i][1];
        particle.size = 2;
      }
      pn._initSoAFromObjects(8);

      if (scenario.name === 'invalid-force' && includeInvalidPointer) {
        const pointer = pn.p || new pn.o[0].constructor(pn);
        pointer.index = 8;
        pointer.x = 700;
        pointer.y = 600;
        pointer.velocity.x = Number.NaN;
        pointer.velocity.y = 1;
        pointer.size = 2;
        pn.p = pointer;
        pn.o.push(pointer);
      }

      pn.initGrid();
      pn._lastUpdateTime = performance.now();
    }

    try {
      for (const scenario of scenarios) {
        resetFixture(scenario);
        const reads = Object.fromEntries(thresholdKeys.map(key => [key, 0]));
        const optionProxy = new Proxy(originalOptions, {
          get(target, property, receiver) {
            if (Object.hasOwn(reads, property)) reads[property]++;
            return Reflect.get(target, property, receiver);
          },
          set(target, property, value, receiver) {
            return Reflect.set(target, property, value, receiver);
          }
        });
        for (const particle of pn.o) particle.options = optionProxy;
        pn.options = optionProxy;

        let isNaNCalls = 0;
        window.isNaN = function(value) {
          isNaNCalls++;
          return originalIsNaN(value);
        };
        const lines = [];
        renderer.addLine = function(x1, y1, color1, x2, y2, color2) {
          lines.push([x1, y1, ...Array.from(color1), x2, y2, ...Array.from(color2)]);
          return originalAddLine.call(this, x1, y1, color1, x2, y2, color2);
        };

        pn.update();

        results.push({
          name: scenario.name,
          particleCount: pn.o.length,
          regularParticleCount: pn.numParticles,
          thresholdReads: reads,
          isNaNCalls,
          positions: pn.o.map(particle => [particle.x, particle.y]),
          velocities: pn.o.map(particle => [particle.velocity.x, particle.velocity.y]),
          soaVelocities: Array.from({ length: pn.numParticles }, (_, index) => [pn.velX[index], pn.velY[index]]),
          lines,
          allObjectVelocitiesFinite: pn.o.every(particle =>
            Number.isFinite(particle.velocity.x) && Number.isFinite(particle.velocity.y)),
          allSoAVelocitiesFinite: Array.from({ length: pn.numParticles }, (_, index) =>
            Number.isFinite(pn.velX[index]) && Number.isFinite(pn.velY[index])).every(Boolean)
        });

        renderer.addLine = originalAddLine;
        window.isNaN = originalIsNaN;
        pn.options = originalOptions;
        for (const particle of pn.o) particle.options = originalOptions;
      }
    } finally {
      renderer.addLine = originalAddLine;
      window.isNaN = originalIsNaN;
      pn.options = originalOptions;
      for (const particle of pn.o) particle.options = originalOptions;
    }

    return {
      scenarios: results,
      hasWebGl: Boolean(renderer.gl),
      contextLost: Boolean(renderer.gl && renderer.gl.isContextLost())
    };
  }, { includeInvalidPointer });
}

function structuralTotals(run, scenarioNames) {
  const selected = run.scenarios.filter(scenario => scenarioNames.includes(scenario.name));
  return {
    thresholdReads: selected.reduce((total, scenario) => {
      for (const [key, value] of Object.entries(scenario.thresholdReads)) total[key] += value;
      return total;
    }, { particleInteractionDistance: 0, lineConnectionDistance: 0, maxColorChangeDistance: 0 }),
    isNaNCalls: selected.reduce((total, scenario) => total + scenario.isNaNCalls, 0)
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  if (!options.baseline || !options.optimized || !['thresholds', 'velocity'].includes(options.expect)) {
    usage();
    throw new Error('--baseline, --optimized, and --expect thresholds|velocity are required');
  }
  if (!Number.isInteger(options.trials) || options.trials < 1) {
    throw new Error('--trials must be a positive integer');
  }

  const browserErrors = [];
  let currentRun = 'startup';
  const browser = await launchEdge(options.headless);
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('console', message => {
      if (message.type() === 'error') browserErrors.push({ run: currentRun, type: 'console', text: message.text() });
    });
    page.on('pageerror', error => browserErrors.push({ run: currentRun, type: 'pageerror', text: String(error) }));

    const records = [];
    for (let trial = 1; trial <= options.trials; trial++) {
      const order = trial % 2 === 1 ? ['baseline', 'optimized'] : ['optimized', 'baseline'];
      for (const variant of order) {
        currentRun = `${variant}/trial-${trial}`;
        const url = variant === 'baseline' ? options.baseline : options.optimized;
        const result = await runVariant(page, url, options.expect === 'velocity');
        records.push({ variant, trial, ...result });
        console.log('RUN', JSON.stringify({
          variant,
          trial,
          totals: structuralTotals(result, ['no-force', 'repulsion', 'attraction']),
          invalidFinite: result.scenarios.find(scenario => scenario.name === 'invalid-force').allObjectVelocitiesFinite
        }));
      }
    }

    const finiteScenarioNames = ['no-force', 'repulsion', 'attraction'];
    let equivalent = true;
    for (let trial = 1; trial <= options.trials; trial++) {
      const baseline = records.find(record => record.variant === 'baseline' && record.trial === trial);
      const optimized = records.find(record => record.variant === 'optimized' && record.trial === trial);
      for (const name of finiteScenarioNames) {
        const baselineScenario = baseline.scenarios.find(scenario => scenario.name === name);
        const optimizedScenario = optimized.scenarios.find(scenario => scenario.name === name);
        if (!snapshotsMatch(baselineScenario, optimizedScenario)) equivalent = false;
      }
    }

    const baselineTotals = records
      .filter(record => record.variant === 'baseline')
      .map(record => structuralTotals(record, finiteScenarioNames));
    const optimizedTotals = records
      .filter(record => record.variant === 'optimized')
      .map(record => structuralTotals(record, finiteScenarioNames));
    const optimizedThresholdsConstant = optimizedTotals.every(total =>
      Object.values(total.thresholdReads).every(value => value <= finiteScenarioNames.length));
    const thresholdReadsReduced = optimizedTotals.every((total, index) => {
      const optimizedReads = Object.values(total.thresholdReads).reduce((sum, value) => sum + value, 0);
      const baselineReads = Object.values(baselineTotals[index].thresholdReads).reduce((sum, value) => sum + value, 0);
      return optimizedReads < baselineReads;
    });
    const isNaNCallsReduced = optimizedTotals.every((total, index) =>
      total.isNaNCalls < baselineTotals[index].isNaNCalls);
    const optimizedInvalidFinite = records
      .filter(record => record.variant === 'optimized')
      .every(record => {
        const invalid = record.scenarios.find(scenario => scenario.name === 'invalid-force');
        return invalid.allObjectVelocitiesFinite && invalid.allSoAVelocitiesFinite;
      });
    const webGlHealthy = records.every(record => record.hasWebGl && !record.contextLost);
    const assertions = {
      finiteScenarioEquivalence: equivalent,
      webGlHealthy,
      noBrowserErrors: browserErrors.length === 0
    };
    if (options.expect === 'thresholds') {
      assertions.thresholdReadsReduced = thresholdReadsReduced;
      assertions.optimizedThresholdReadsConstant = optimizedThresholdsConstant;
      assertions.invalidForceRecovered = optimizedInvalidFinite;
    } else {
      assertions.isNaNCallsReduced = isNaNCallsReduced;
      assertions.invalidVelocityRecovered = optimizedInvalidFinite;
    }

    const passed = Object.values(assertions).every(Boolean);
    const result = {
      expect: options.expect,
      trials: options.trials,
      passed,
      assertions,
      baselineTotals,
      optimizedTotals,
      browserErrors
    };
    console.log('RESULTS_JSON=' + JSON.stringify(result));
    if (!passed) process.exitCode = 2;
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
