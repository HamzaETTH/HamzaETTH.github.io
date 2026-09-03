#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const { chromium } = require('playwright');

function parseArgs(argv) {
  const options = { output: null, allowParticleSizeFix: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--baseline') options.baseline = argv[++i];
    else if (arg === '--optimized') options.optimized = argv[++i];
    else if (arg === '--output') options.output = argv[++i];
    else if (arg === '--allow-particle-size-fix') options.allowParticleSizeFix = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.baseline || !options.optimized) throw new Error('--baseline and --optimized are required');
  return options;
}

function stable(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return String(value);
    return Object.is(value, -0) ? 0 : Number(value.toFixed(9));
  }
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = stable(value[key]);
      return result;
    }, {});
  }
  return value;
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function snapshot(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await context.addInitScript(() => {
    let state = 0x5a17c9e3;
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

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.particleInstance && window.BenchmarkSystem, null, { timeout: 30000 });

  const data = await page.evaluate(async () => {
    const pn = window.particleInstance;
    if (pn._rafId) cancelAnimationFrame(pn._rafId);
    pn._rafActive = false;
    pn._rafId = null;

    let fakeNow = 1000;
    Object.defineProperty(performance, 'now', {
      configurable: true,
      value: () => fakeNow
    });
    let fakeRafId = 100;
    window.requestAnimationFrame = () => ++fakeRafId;
    window.cancelAnimationFrame = () => {};

    const glCalls = { points: [], lines: [] };
    const canvasCalls = [];
    const renderer = pn.glRenderer;
    const gl = renderer.gl;
    renderer.beginFrame = () => {
      glCalls.points.length = 0;
      glCalls.lines.length = 0;
    };
    const addPoint = (...args) => glCalls.points.push(args);
    const addLine = (...args) => glCalls.lines.push(args);
    renderer.addPoint = addPoint;
    renderer.addLine = addLine;
    renderer.endFrame = () => {};
    renderer.resize = () => false;

    const context2d = pn.g;
    const recordMethod = name => (...args) => canvasCalls.push([name, ...args]);
    for (const name of ['beginPath', 'fill', 'arc', 'moveTo', 'lineTo', 'stroke', 'fillRect', 'clearRect']) {
      context2d[name] = recordMethod(name);
    }
    context2d.createLinearGradient = (...args) => {
      const stops = [];
      canvasCalls.push(['createLinearGradient', ...args, stops]);
      return { addColorStop: (offset, color) => stops.push([offset, color]) };
    };

    const Particle = pn.o[0].constructor;
    const baseOptions = {
      interactive: false,
      velocity: 0.66,
      boundaryMode: 'wrap',
      particleSize: 2,
      particleColor: '#888888',
      particleColorCycling: false,
      particleCyclingSpeed: 10,
      particleInteractionDistance: 60,
      particleRepulsion: false,
      particleAttraction: false,
      particleRepulsionForce: 3,
      particleAttractionForce: 5,
      particleCollision: false,
      lineConnectionDistance: 120,
      maxColorChangeDistance: 120,
      gradientEffect: true,
      gradientColor1: '#ecf00c',
      gradientColor2: '#e00000',
      lineColorCycling: false,
      useDistanceEffect: false,
      randomizeDistanceColors: false,
      proximityEffectDistance: 125,
      proximityEffectColor: '#0080ff',
      opacity: 0.7,
      trails: false,
      trailFade: 0.08,
      lineJitter: false,
      lineJitterSegments: 4,
      lineJitterAmplitude: 0.12,
      curvedDrift: false,
      curvedDriftCurvature: 0.12,
      curvedDriftNoiseSpeed: 1.5,
      repulsionRange: 5,
      repulsionIntensity: 5,
      attractionRange: 5,
      attractionIntensity: 5
    };

    const fixture = [
      [6, 7, 0.31, 0.17],
      [45, 12, -0.28, 0.09],
      [118, 26, 0.13, -0.22],
      [126, 34, -0.19, -0.14],
      [238, 118, 0.21, 0.25],
      [244, 126, -0.16, 0.18],
      [1274, 714, 0.34, 0.27],
      [3, 716, -0.27, -0.31]
    ];

    function configure(overrides = {}, pointer = null, useGl = true) {
      Object.assign(pn.options, baseOptions, overrides);
      pn.options.particleHue = 0;
      pn.lineHue1 = 30;
      pn.lineHue2 = 210;
      pn._lineHue2Offset = 180;
      pn._lineOffsetDriftRateDegPerSec = 0.1;
      pn._distanceHue = 0;
      pn._pulsePhase = 0;
      pn.attractionForce = overrides.attractionForce || null;
      pn.repulsionForce = overrides.repulsionForce || null;
      pn.o = fixture.map((entry, index) => {
        const particle = new Particle(pn);
        particle.index = index;
        particle.x = entry[0];
        particle.y = entry[1];
        particle.velocity = { x: entry[2], y: entry[3] };
        particle.size = index % 3 === 0 ? 3 : 2;
        particle.particleColor = '#888888';
        return particle;
      });
      pn._initSoAFromObjects(pn.o.length);
      if (pointer) {
        pn.options.interactive = true;
        pn.p = pn.p || new Particle(pn);
        pn.p.index = pn.numParticles;
        pn.p.x = pointer.x;
        pn.p.y = pointer.y;
        pn.p.velocity = { x: 0, y: 0 };
        pn.p.size = 2;
        pn.o.push(pn.p);
      }
      pn.initGrid();
      renderer.addPoint = addPoint;
      renderer.addLine = useGl ? addLine : null;
      pn._lastUpdateTime = fakeNow - (1000 / 60);
      pn._rafActive = true;
      pn._rafId = null;
    }

    function captureFrame() {
      return {
        objects: pn.o.map(particle => ({
          index: particle.index,
          x: particle.x,
          y: particle.y,
          velocityX: particle.velocity.x,
          velocityY: particle.velocity.y,
          size: particle.size,
          color: particle.particleColor
        })),
        soa: {
          numParticles: pn.numParticles,
          posX: Array.from(pn.posX),
          posY: Array.from(pn.posY),
          velX: Array.from(pn.velX),
          velY: Array.from(pn.velY),
          sizeA: Array.from(pn.sizeA)
        },
        grid: pn.grid.map(cell => cell.map(value => typeof value === 'number' ? value : value.index)),
        glPoints: glCalls.points.map(args => args.map(value => ArrayBuffer.isView(value) ? Array.from(value) : value)),
        glLines: glCalls.lines.map(args => args.map(value => ArrayBuffer.isView(value) ? Array.from(value) : value)),
        canvasCalls: canvasCalls.splice(0),
        rafActive: pn._rafActive,
        rafIdPresent: pn._rafId != null
      };
    }

    function runFrames(count) {
      const frames = [];
      for (let frame = 0; frame < count; frame++) {
        fakeNow += 1000 / 60;
        canvasCalls.length = 0;
        pn.update();
        frames.push(captureFrame());
      }
      pn._rafActive = false;
      pn._rafId = null;
      return frames;
    }

    const scenarios = {};
    configure({ boundaryMode: 'wrap' });
    scenarios.staticWrap = runFrames(4);

    configure({ boundaryMode: 'bounce', curvedDrift: true, curvedDriftCurvature: 0.08 });
    scenarios.bounceCurved = runFrames(3);

    configure({ particleRepulsion: true, particleInteractionDistance: 80 });
    scenarios.pairRepulsion = runFrames(3);

    configure({ particleAttraction: true, particleInteractionDistance: 80 });
    scenarios.pairAttraction = runFrames(3);

    configure({ particleCollision: true, particleSize: 6 });
    scenarios.collision = runFrames(3);

    configure(
      { interactive: true, lineColorCycling: true, gradientEffect: true },
      { x: 48, y: 18 }
    );
    scenarios.pointerProximity = runFrames(2);

    configure(
      { trails: true, lineJitter: true, lineColorCycling: false, gradientEffect: false },
      null,
      false
    );
    scenarios.trailsJitter2d = runFrames(2);

    configure({ particleColorCycling: true, lineColorCycling: false });
    scenarios.particleCycling = runFrames(2);

    configure({});
    const applyModule = await import('./js/ui/applyParams.js');
    applyModule.applyParamsToNetwork(pn, { particleSize: 3.5, particleColor: '#123456' });
    const appearance = {
      objectSizes: pn.o.map(particle => particle.size),
      objectColors: pn.o.map(particle => particle.particleColor),
      typedSizes: Array.from(pn.sizeA)
    };

    const benchmark = new window.BenchmarkSystem(pn);
    benchmark.setParticleCount(12);
    const exactCount = {
      objects: pn.o.length,
      numParticles: pn.numParticles,
      buffers: [pn.posX.length, pn.posY.length, pn.velX.length, pn.velY.length, pn.sizeA.length]
    };
    pn.adjustParticleCount(false);
    const halvedCount = {
      objects: pn.o.length,
      numParticles: pn.numParticles,
      buffers: [pn.posX.length, pn.posY.length, pn.velX.length, pn.velY.length, pn.sizeA.length]
    };

    return {
      scenarios,
      appearance,
      counts: { exactCount, halvedCount },
      storageTypes: {
        objectsArray: Array.isArray(pn.o),
        posX: pn.posX.constructor.name,
        posY: pn.posY.constructor.name,
        velX: pn.velX.constructor.name,
        velY: pn.velY.constructor.name,
        sizeA: pn.sizeA.constructor.name
      },
      health: {
        hasGl: Boolean(gl),
        glContextLost: gl.isContextLost(),
        particleCount: pn.o.length
      }
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
    const comparableData = data => {
      if (!options.allowParticleSizeFix) return data;
      const { appearance, ...rest } = data;
      return rest;
    };
    const baselineStable = stable(comparableData(baseline.data));
    const optimizedStable = stable(comparableData(optimized.data));
    const optimizedAppearance = optimized.data.appearance;
    const particleSizeFixValid = !options.allowParticleSizeFix || (
      optimizedAppearance.objectSizes.every(size => size === 3.5) &&
      optimizedAppearance.typedSizes.every(size => size === 3.5)
    );
    const assertions = {
      exactStateContract: JSON.stringify(baselineStable) === JSON.stringify(optimizedStable),
      particleSizeFixValid,
      baselineHealthy: baseline.data.health.hasGl && !baseline.data.health.glContextLost,
      optimizedHealthy: optimized.data.health.hasGl && !optimized.data.health.glContextLost,
      noBrowserErrors: baseline.browserErrors.length === 0 && optimized.browserErrors.length === 0
    };
    const result = {
      passed: Object.values(assertions).every(Boolean),
      assertions,
      hashes: { baseline: digest(baselineStable), optimized: digest(optimizedStable) },
      scenarioNames: Object.keys(baseline.data.scenarios),
      frameCounts: Object.fromEntries(Object.entries(baseline.data.scenarios).map(([name, frames]) => [name, frames.length])),
      baseline: baselineStable,
      optimized: optimizedStable,
      browserErrors: { baseline: baseline.browserErrors, optimized: optimized.browserErrors }
    };
    if (options.output) fs.writeFileSync(options.output, JSON.stringify(result, null, 2) + '\n');
    console.log('RESULTS_JSON=' + JSON.stringify({
      passed: result.passed,
      assertions,
      hashes: result.hashes,
      scenarioNames: result.scenarioNames,
      frameCounts: result.frameCounts,
      browserErrors: result.browserErrors
    }));
    if (!result.passed) process.exitCode = 2;
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
