#!/usr/bin/env node

const { chromium } = require('playwright');

function usage() {
  console.log('Usage: rtk node scripts/test-particle-frame-color.js <url> [--expect-optimized]');
}

function parseArgs(argv) {
  const options = { url: null, expectOptimized: false };
  for (const arg of argv) {
    if (arg === '--expect-optimized') options.expectOptimized = true;
    else if (!options.url) options.url = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

async function loadPage(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    () => window.particleInstance && window.BenchmarkSystem && window.particleInstance.glRenderer,
    null,
    { timeout: 30000 }
  );
  await page.evaluate(async () => {
    if (!window.applyParamsToNetwork) {
      const module = await import('./js/ui/applyParams.js');
      window.applyParamsToNetwork = module.applyParamsToNetwork;
    }
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.url) {
    usage();
    process.exitCode = 1;
    return;
  }

  const browserErrors = [];
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
    args: [
      '--no-first-run',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding'
    ]
  });

  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('console', message => {
      if (message.type() === 'error') browserErrors.push({ type: 'console', text: message.text() });
    });
    page.on('pageerror', error => browserErrors.push({ type: 'pageerror', text: String(error) }));

    await loadPage(page, options.url);
    const original = await page.evaluate(() => ({
      count: window.particleInstance.o.length,
      options: { ...window.particleInstance.options },
      canvases: document.querySelectorAll('canvas').length
    }));

    const measurements = await page.evaluate(() => {
      const pn = window.particleInstance;
      const benchmark = new window.BenchmarkSystem(pn);
      const renderer = pn.glRenderer;

      if (pn._rafId) cancelAnimationFrame(pn._rafId);
      pn._rafActive = false;
      window.applyParamsToNetwork(pn, {
        ...pn.options,
        interactive: false,
        lineColorCycling: false,
        gradientEffect: false,
        particleColorCycling: false,
        particleColor: '#123456',
        particleSize: pn.options.particleSize,
        opacity: 0.4,
        speed: 0
      });
      pn.options.velocity = 0;
      benchmark.setParticleCount(32);

      let writes = 0;
      const trailArgs = [];
      for (const particle of pn.o) {
        let value = particle.particleColor;
        Object.defineProperty(particle, 'particleColor', {
          configurable: true,
          get() { return value; },
          set(next) { writes++; value = next; }
        });
        const originalDraw = particle.h;
        particle.h = function(...args) {
          trailArgs.push(args[0]);
          return originalDraw.apply(this, args);
        };
      }

      const frames = [];
      let activeFrame = null;
      const originalBeginFrame = renderer.beginFrame;
      const originalAddPoint = renderer.addPoint;
      renderer.beginFrame = function(...args) {
        activeFrame = { colorRefs: [], colors: [] };
        frames.push(activeFrame);
        return originalBeginFrame.apply(this, args);
      };
      renderer.addPoint = function(x, y, color, size) {
        activeFrame.colorRefs.push(color);
        activeFrame.colors.push(Array.from(color));
        return originalAddPoint.call(this, x, y, color, size);
      };

      function runFrame(settings) {
        Object.assign(pn.options, settings, { velocity: 0 });
        pn.update();
        const frame = frames[frames.length - 1];
        return {
          pointCount: frame.colors.length,
          uniqueColorRefs: new Set(frame.colorRefs).size,
          colors: frame.colors
        };
      }

      const staticFrame = runFrame({
        trails: false,
        particleColorCycling: false,
        particleColor: '#123456',
        opacity: 0.4
      });
      const shortHexFrame = runFrame({
        trails: false,
        particleColorCycling: false,
        particleColor: '#888',
        opacity: 0.6
      });
      const cyclingFrame = runFrame({
        trails: false,
        particleColorCycling: true,
        particleCyclingSpeed: 0,
        particleHue: 120,
        opacity: 0.5
      });

      writes = 0;
      const settledUniqueRefs = [];
      for (let i = 0; i < 5; i++) {
        settledUniqueRefs.push(runFrame({
          trails: false,
          particleColorCycling: false,
          particleColor: '#123456',
          opacity: 0.4
        }).uniqueColorRefs);
      }
      const staticWrites = writes;

      writes = 0;
      pn.options.particleHue = 120;
      for (let i = 0; i < 5; i++) {
        settledUniqueRefs.push(runFrame({
          trails: false,
          particleColorCycling: true,
          particleCyclingSpeed: 0,
          opacity: 0.5
        }).uniqueColorRefs);
      }
      const cyclingWrites = writes;

      trailArgs.length = 0;
      runFrame({
        trails: true,
        particleColorCycling: false,
        particleColor: '#123456',
        opacity: 0.4
      });
      const staticTrailArgs = trailArgs.slice();

      trailArgs.length = 0;
      pn.options.particleHue = 120;
      runFrame({
        trails: true,
        particleColorCycling: true,
        particleCyclingSpeed: 0,
        opacity: 0.5
      });
      const cyclingTrailArgs = trailArgs.slice();

      renderer.beginFrame = originalBeginFrame;
      renderer.addPoint = originalAddPoint;

      return {
        particleCount: pn.o.length,
        staticFrame,
        shortHexFrame,
        cyclingFrame,
        staticWrites,
        cyclingWrites,
        settledUniqueRefs,
        staticTrailArgs,
        cyclingTrailArgs,
        hasWebGl: Boolean(renderer.gl),
        contextLost: Boolean(renderer.gl && renderer.gl.isContextLost())
      };
    });

    await loadPage(page, options.url);
    const restored = await page.evaluate(() => ({
      count: window.particleInstance.o.length,
      options: { ...window.particleInstance.options },
      rafActive: window.particleInstance._rafActive,
      canvases: document.querySelectorAll('canvas').length,
      contextLost: Boolean(
        window.particleInstance.glRenderer.gl &&
        window.particleInstance.glRenderer.gl.isContextLost()
      )
    }));

    const close = (actual, expected, epsilon = 1e-5) => Math.abs(actual - expected) <= epsilon;
    const colorsMatch = (colors, expected) => colors.length === measurements.particleCount &&
      colors.every(color => color.length === expected.length && color.every((value, i) => close(value, expected[i])));
    const stableOptionKeys = [
      'particleColor',
      'particleColorCycling',
      'particleCyclingSpeed',
      'opacity',
      'density',
      'trails',
      'velocity'
    ];
    const restoredOptions = stableOptionKeys.every(key => {
      const before = original.options[key];
      const after = restored.options[key];
      return before && typeof before === 'object'
        ? JSON.stringify(before) === JSON.stringify(after)
        : Object.is(before, after);
    });

    const assertions = {
      staticColor: colorsMatch(measurements.staticFrame.colors, [0x12 / 255, 0x34 / 255, 0x56 / 255, 0.4]),
      cyclingColor: colorsMatch(measurements.cyclingFrame.colors, [0, 1, 0, 0.5]),
      webGlHealthy: measurements.hasWebGl && !measurements.contextLost && !restored.contextLost,
      restored: restored.count === original.count && restoredOptions && restored.rafActive && restored.canvases === original.canvases,
      noBrowserErrors: browserErrors.length === 0
    };

    if (options.expectOptimized) {
      Object.assign(assertions, {
        shortHexColor: colorsMatch(measurements.shortHexFrame.colors, [0x88 / 255, 0x88 / 255, 0x88 / 255, 0.6]),
        sharedWebGlColor: measurements.settledUniqueRefs.every(count => count === 1),
        noStaticWrites: measurements.staticWrites === 0,
        noCyclingWrites: measurements.cyclingWrites === 0,
        staticTrailColor: measurements.staticTrailArgs.length === measurements.particleCount &&
          measurements.staticTrailArgs.every(color => color === '#123456'),
        cyclingTrailColor: measurements.cyclingTrailArgs.length === measurements.particleCount &&
          measurements.cyclingTrailArgs.every(color => color === 'hsl(120, 100%, 50%)')
      });
    }

    const passed = Object.values(assertions).every(Boolean);
    const summarizeFrame = frame => ({
      pointCount: frame.pointCount,
      uniqueColorRefs: frame.uniqueColorRefs,
      sampleColor: frame.colors[0] || null
    });
    const measurementSummary = {
      ...measurements,
      staticFrame: summarizeFrame(measurements.staticFrame),
      shortHexFrame: summarizeFrame(measurements.shortHexFrame),
      cyclingFrame: summarizeFrame(measurements.cyclingFrame)
    };
    const result = { url: options.url, expectOptimized: options.expectOptimized, passed, measurements: measurementSummary, restored, browserErrors, assertions };
    console.log(JSON.stringify(result));
    if (!passed) process.exitCode = 2;
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
