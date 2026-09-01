#!/usr/bin/env node

const fs = require('node:fs');
const { chromium } = require('playwright');

function parseArgs(argv) {
  const options = { output: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--baseline') options.baseline = argv[++i];
    else if (arg === '--optimized') options.optimized = argv[++i];
    else if (arg === '--output') options.output = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.baseline || !options.optimized) throw new Error('--baseline and --optimized are required');
  return options;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = stable(value[key]);
      return result;
    }, {});
  }
  return value;
}

async function snapshot(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await context.addInitScript(() => {
    let state = 0x12345678;
    Math.random = () => {
      state = (1664525 * state + 1013904223) >>> 0;
      return state / 0x100000000;
    };
  });
  const page = await context.newPage();
  const browserErrors = [];
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push({ type: 'console', text: message.text() });
  });
  page.on('pageerror', error => browserErrors.push({ type: 'pageerror', text: String(error) }));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.particleInstance && window.ParticleNetworkConfig);

  const data = await page.evaluate(() => {
    const typed = object => Object.keys(object).map(key => ({
      key,
      type: Array.isArray(object[key]) ? 'array' : object[key] === null ? 'null' : typeof object[key],
      value: object[key]
    }));
    const config = window.ParticleNetworkConfig;
    const mergeCases = [
      { name: 'defaults', user: {}, preset: null },
      { name: 'densePreset', user: {}, preset: 'dense' },
      { name: 'presetOverride', user: { density: '7777', particleSize: 0 }, preset: 'sparse' },
      { name: 'falsyMerge', user: { background: '', opacity: 0, interactive: false, colorDifferentiationOptions: null }, preset: null }
    ].map(testCase => ({
      name: testCase.name,
      config: typed(config.createConfig(testCase.user, testCase.preset))
    }));

    const constructorCases = [
      { name: 'defaults', options: {} },
      { name: 'shipped', options: { ...window.particleNetworkOptions } },
      {
        name: 'falsyAndStrings',
        options: {
          background: '', particleColor: '', particleSize: 0,
          particleColorCycling: false, particleCyclingSpeed: 0,
          gradientEffect: false, lineColorCycling: false, lineCyclingSpeed: 0,
          interactive: false, proximityEffectDistance: 0,
          attractionRange: 0, attractionIntensity: 0, repulsionRange: 0, repulsionIntensity: 0,
          speed: 'none', density: '7777', opacity: 0,
          maxColorChangeDistance: 0, particleInteractionDistance: 0,
          particleRepulsionForce: 0, lineConnectionDistance: 0,
          performanceOverlay: false, trailFade: 0,
          lineJitterSegments: 1, lineJitterAmplitude: 0,
          curvedDriftCurvature: 0, curvedDriftNoiseSpeed: 0,
          gatherRadius: 0, unknownOption: 'ignored'
        }
      },
      {
        name: 'nullFallbacks',
        options: {
          background: null, particleColor: null, particleSize: null,
          gradientColor1: null, gradientColor2: null,
          colorDifferentiationMethod: null, colorDifferentiationOptions: null,
          speed: null, density: null, boundaryMode: null,
          trailFade: null, lineJitterSegments: null,
          curvedDriftCurvature: null, gatherRadius: null
        }
      }
    ];

    const constructed = constructorCases.map((testCase, index) => {
      const target = document.createElement('div');
      target.style.cssText = `position:absolute;left:-2000px;top:${index * 400}px;width:640px;height:360px`;
      document.body.appendChild(target);
      const instance = new window.ParticleNetwork(target, testCase.options);
      if (instance._rafId != null) cancelAnimationFrame(instance._rafId);
      instance._rafActive = false;
      const result = { name: testCase.name, options: typed(instance.options) };
      target.remove();
      return result;
    });

    return {
      configDefaults: typed(config.DEFAULT_CONFIG),
      presets: Object.keys(config.PRESETS).sort().map(name => ({ name, config: typed(config.PRESETS[name]) })),
      mergeCases,
      shippedInput: typed(window.particleNetworkOptions),
      shippedRuntime: typed(window.particleInstance.options),
      constructed,
      particleCount: window.particleInstance.o.length,
      hasWebGl: Boolean(window.particleInstance.glRenderer && window.particleInstance.glRenderer.gl),
      webGlContextLost: window.particleInstance.glRenderer.gl.isContextLost()
    };
  });
  await context.close();
  return { data, browserErrors };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const baseline = await snapshot(browser, options.baseline);
    const optimized = await snapshot(browser, options.optimized);
    const baselineStable = stable(baseline.data);
    const optimizedStable = stable(optimized.data);
    const assertions = {
      exactConfigAndRuntimeContract: JSON.stringify(baselineStable) === JSON.stringify(optimizedStable),
      baselineHealthy: baseline.data.particleCount > 0 && baseline.data.hasWebGl && !baseline.data.webGlContextLost,
      optimizedHealthy: optimized.data.particleCount > 0 && optimized.data.hasWebGl && !optimized.data.webGlContextLost,
      noBrowserErrors: baseline.browserErrors.length === 0 && optimized.browserErrors.length === 0
    };
    const result = {
      passed: Object.values(assertions).every(Boolean),
      assertions,
      baseline: baseline.data,
      optimized: optimized.data,
      browserErrors: { baseline: baseline.browserErrors, optimized: optimized.browserErrors }
    };
    if (options.output) fs.writeFileSync(options.output, JSON.stringify(result, null, 2) + '\n');
    console.log('RESULTS_JSON=' + JSON.stringify(result));
    if (!result.passed) process.exitCode = 2;
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
