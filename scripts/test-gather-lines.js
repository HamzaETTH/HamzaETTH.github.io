#!/usr/bin/env node

const fs = require('node:fs');
const { chromium } = require('playwright');

function parseArgs(argv) {
  const options = { headless: false, output: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--url') options.url = argv[++i];
    else if (arg === '--output') options.output = argv[++i];
    else if (arg === '--headless') options.headless = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.url) throw new Error('--url is required');
  return options;
}

function arraysClose(actual, expected, epsilon = 1e-6) {
  return actual.length === expected.length && actual.every((row, rowIndex) =>
    row.length === expected[rowIndex].length && row.every((value, columnIndex) =>
      Math.abs(value - expected[rowIndex][columnIndex]) <= epsilon));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const browserErrors = [];
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: options.headless,
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

    await page.goto(options.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => window.particleInstance && window.BenchmarkSystem &&
      window.particleInstance.glRenderer && window.hotkeyManager, null, { timeout: 30000 });
    await page.keyboard.press('c');
    await page.waitForFunction(() => window.particleSettingsUi && window.particleSettingsUi.pane,
      null, { timeout: 30000 });

    const primary = await page.evaluate(async () => {
      const pn = window.particleInstance;
      const ui = window.particleSettingsUi;
      const benchmark = new window.BenchmarkSystem(pn);
      const { applyParamsToNetwork } = await import('./js/ui/applyParams.js');

      if (pn._rafId != null) cancelAnimationFrame(pn._rafId);
      pn._rafId = null;
      pn._rafActive = false;
      let fakeNow = performance.now();
      let fakeRafId = 1000;
      Object.defineProperty(performance, 'now', { configurable: true, value: () => fakeNow });
      window.requestAnimationFrame = () => ++fakeRafId;
      window.cancelAnimationFrame = () => {};
      let ensureLoopCalls = 0;
      pn._ensureAnimationLoop = function() {
        ensureLoopCalls++;
        this._rafActive = true;
        this._rafId = ++fakeRafId;
      };

      Object.assign(ui.params, {
        speed: 0,
        interactive: true,
        particleColorCycling: false,
        lineColorCycling: false,
        gradientEffect: true,
        useDistanceEffect: false,
        adaptiveLineDetail: true,
        cellularLineClusters: false,
        autoAdaptiveLineDetail: false,
        particleRepulsion: false,
        particleAttraction: false,
        particleCollision: false,
        lineConnectionDistance: 120,
        maxColorChangeDistance: 120,
        particleInteractionDistance: 50,
        lineJitter: false,
        trails: false,
        gatherRadius: 10,
        gravityWellsEnabled: false,
        gravityWellMotion: 'static',
        performanceOverlay: false
      });
      applyParamsToNetwork(pn, ui.params);
      if (typeof pn.clearGravityWells === 'function') pn.clearGravityWells();
      if (typeof ui.pane.refresh === 'function') ui.pane.refresh();

      const lineKeys = [
        'gradientEffect', 'gradientColor1', 'gradientColor2', 'lineColorCycling',
        'lineCyclingSpeed', 'randomizeDistanceColors', 'colorDifferentiationMethod',
        'distanceColorCyclingSpeed', 'useDistanceEffect', 'maxColorChangeDistance',
        'lineConnectionDistance', 'adaptiveLineDetail', 'cellularLineClusters',
        'blackHoleLineColor', 'lineJitter', 'lineJitterSegments', 'lineJitterAmplitude',
        'autoAdaptiveLineDetail'
      ];
      const pick = (object, keys) => Object.fromEntries(keys.map(key => [key, object[key]]));
      const findAdaptiveCheckbox = () => Array.from(document.querySelectorAll('input[type="checkbox"]')).find(input => {
        const row = input.closest('.tp-lblv') || input.parentElement;
        return row && row.textContent.includes('Adaptive Line Detail');
      });
      const lineState = () => ({
        options: pick(pn.options, lineKeys),
        pane: pick(ui.params, lineKeys),
        checkbox: findAdaptiveCheckbox() ? findAdaptiveCheckbox().checked : null,
        controller: pn._adaptiveLineDetailController ? pn._adaptiveLineDetailController.getState() : null,
        runtime: {
          qualityIndex: pn._lineDetailQualityIndex,
          lowFpsSeconds: pn._lineDetailLowFpsSeconds,
          recoverySeconds: pn._lineDetailRecoverySeconds,
          pressure: pn._lineDetailPressure,
          framePressure: pn._lineDetailFramePressure,
          previousCandidateSegments: pn._lineDetailPreviousCandidateSegments
        }
      });
      const stop = () => {
        pn._rafActive = false;
        pn._rafId = null;
      };
      const frame = () => {
        stop();
        fakeNow += 1000 / 60;
        pn._lastUpdateTime = fakeNow - 1000 / 60;
        pn.update();
        stop();
        return {
          diagnostics: { ...pn.lineDetailDiagnostics },
          vertexCount: pn.glRenderer ? pn.glRenderer.vertexCount : null,
          pointCount: pn.glRenderer ? pn.glRenderer.pointCount : null
        };
      };
      const setFixture = (positions, velocities) => {
        benchmark.setParticleCount(positions.length);
        for (let i = 0; i < positions.length; i++) {
          const particle = pn.o[i];
          particle.index = i;
          particle.x = positions[i][0];
          particle.y = positions[i][1];
          particle.velocity.x = velocities[i][0];
          particle.velocity.y = velocities[i][1];
          particle.size = 2;
          pn.posX[i] = positions[i][0];
          pn.posY[i] = positions[i][1];
          pn.velX[i] = velocities[i][0];
          pn.velY[i] = velocities[i][1];
          pn.sizeA[i] = 2;
        }
        pn.initGrid();
      };

      const gatherPositions = Array.from({ length: 16 }, (_, index) => [
        160 + (index % 4) * 130,
        120 + Math.floor(index / 4) * 110
      ]);
      const zeroVelocities = gatherPositions.map(() => [0, 0]);
      setFixture(gatherPositions, zeroVelocities);
      if (pn.p) {
        pn.p.x = pn.i.size.width * 0.5;
        pn.p.y = pn.i.size.height * 0.5;
      }

      const before = lineState();
      const originalGather = pn._gatherParticlesAt;
      let gatherCalls = 0;
      pn._gatherParticlesAt = function() {
        gatherCalls++;
        return originalGather.apply(this, arguments);
      };
      ensureLoopCalls = 0;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
      const positionsAfterFirst = Array.from({ length: pn.numParticles }, (_, index) =>
        [pn.posX[index], pn.posY[index]]);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', repeat: true, bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
      const positionsAfterIgnored = Array.from({ length: pn.numParticles }, (_, index) =>
        [pn.posX[index], pn.posY[index]]);
      const gatherActiveDuring = pn._gatherActive;

      const webgl = frame();
      const pointerVelocities = Array.from({ length: pn.numParticles }, (_, index) =>
        Math.hypot(pn.velX[index], pn.velY[index]));
      const during = lineState();

      let trailDraws = 0;
      const originalParticleDraws = pn.o.slice(0, pn.numParticles).map(particle => particle.h);
      pn.o.slice(0, pn.numParticles).forEach(particle => {
        const originalDraw = particle.h;
        particle.h = function() {
          trailDraws++;
          return originalDraw.apply(this, arguments);
        };
      });
      pn.options.trails = true;
      const trails = frame();
      pn.options.trails = false;
      const trailParticleDraws = trailDraws;
      pn.o.slice(0, pn.numParticles).forEach((particle, index) => {
        particle.h = originalParticleDraws[index];
      });
      let fallbackDraws = 0;
      pn.o.slice(0, pn.numParticles).forEach(particle => {
        const originalDraw = particle.h;
        particle.h = function() {
          fallbackDraws++;
          return originalDraw.apply(this, arguments);
        };
      });
      const savedRenderer = pn.glRenderer;
      pn.glRenderer = null;
      const fallback = frame();
      pn.glRenderer = savedRenderer;
      pn.o.slice(0, pn.numParticles).forEach((particle, index) => {
        particle.h = originalParticleDraws[index];
      });

      document.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', bubbles: true }));
      const afterRelease = lineState();
      const released = frame();
      pn._gatherParticlesAt = originalGather;

      const physicsScenarios = [
        {
          name: 'repulsion',
          positions: [[220, 220], [240, 220], [400, 300], [430, 300]],
          velocities: [[0.2, -0.1], [-0.15, 0.05], [0.1, 0.12], [-0.08, -0.04]],
          options: { particleRepulsion: true, particleAttraction: false, particleCollision: false }
        },
        {
          name: 'attraction',
          positions: [[220, 220], [240, 220], [400, 300], [430, 300]],
          velocities: [[0.2, -0.1], [-0.15, 0.05], [0.1, 0.12], [-0.08, -0.04]],
          options: { particleRepulsion: false, particleAttraction: true, particleCollision: false }
        },
        {
          name: 'collision',
          positions: [[220, 220], [223, 220], [400, 300], [430, 300]],
          velocities: [[0.5, 0], [-0.5, 0], [0, 0], [0, 0]],
          options: { particleRepulsion: false, particleAttraction: false, particleCollision: true }
        }
      ];
      const runPhysics = (scenario, gatherActive) => {
        Object.assign(pn.options, scenario.options, {
          velocity: 0,
          curvedDrift: false,
          trails: false,
          particleInteractionDistance: 50,
          particleRepulsionForce: 5,
          particleAttractionForce: 5,
          lineConnectionDistance: 120,
          maxColorChangeDistance: 120
        });
        setFixture(scenario.positions, scenario.velocities);
        pn._gatherActive = gatherActive;
        pn.attractionForce = null;
        pn.repulsionForce = null;
        const rendered = frame();
        const snapshot = {
          positions: Array.from({ length: pn.numParticles }, (_, index) => [pn.posX[index], pn.posY[index]]),
          velocities: Array.from({ length: pn.numParticles }, (_, index) => [pn.velX[index], pn.velY[index]]),
          diagnostics: rendered.diagnostics
        };
        pn._gatherActive = false;
        return snapshot;
      };
      const physics = physicsScenarios.map(scenario => ({
        name: scenario.name,
        normal: runPhysics(scenario, false),
        gather: runPhysics(scenario, true)
      }));

      return {
        gatherCalls,
        gatherActiveDuring,
        positionsChangedOnFirst: positionsAfterFirst.some((position, index) =>
          position[0] !== gatherPositions[index][0] || position[1] !== gatherPositions[index][1]),
        ignoredKeydownsPreservedPositions: positionsAfterIgnored.every((position, index) =>
          position[0] === positionsAfterFirst[index][0] && position[1] === positionsAfterFirst[index][1]),
        pointerForceMoved: pointerVelocities.some(speed => speed > 0),
        webgl,
        trails: { ...trails, particleDraws: trailParticleDraws },
        fallback: { ...fallback, particleDraws: fallbackDraws },
        released,
        gatherActiveAfterRelease: pn._gatherActive,
        ensureLoopCalls,
        settings: { before, during, afterRelease },
        physics
      };
    });

    await page.keyboard.press('Control+a');
    const ctrlA = await page.evaluate(() => {
      const pn = window.particleInstance;
      return {
        gatherActive: pn._gatherActive,
        selectedParticles: pn.selectedParticleIndices.size,
        selectedWells: pn.selectedGravityWellIds.size,
        particleCount: pn.numParticles,
        wellCount: pn.gravityWells.length
      };
    });

    const cleanup = await page.evaluate(() => {
      const pn = window.particleInstance;
      const ui = window.particleSettingsUi;
      const activate = () => {
        if (pn.p) {
          pn.p.x = pn.i.size.width * 0.5;
          pn.p.y = pn.i.size.height * 0.5;
        }
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
        return pn._gatherActive;
      };
      const results = {};

      results.beforeCentralClear = activate();
      pn._clearInteractivePointerForces();
      results.centralClear = !pn._gatherActive && !pn.attractionForce && !pn.repulsionForce;

      results.beforeBlur = activate();
      window.dispatchEvent(new Event('blur'));
      results.blur = !pn._gatherActive && !pn.attractionForce && !pn.repulsionForce;

      let hidden = false;
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => hidden ? 'hidden' : 'visible'
      });
      results.beforeVisibility = activate();
      hidden = true;
      document.dispatchEvent(new Event('visibilitychange'));
      results.visibility = !pn._gatherActive && !pn.attractionForce && !pn.repulsionForce;
      hidden = false;
      document.dispatchEvent(new Event('visibilitychange'));

      results.beforeResetPhysics = activate();
      ui.doResetPhysics();
      results.resetPhysics = !pn._gatherActive && !pn.attractionForce && !pn.repulsionForce;

      results.beforeResetDefault = activate();
      ui.doReset();
      results.resetDefault = !pn._gatherActive && !pn.attractionForce && !pn.repulsionForce;
      return results;
    });

    const physicsEquivalent = primary.physics.every(scenario =>
      arraysClose(scenario.gather.positions, scenario.normal.positions) &&
      arraysClose(scenario.gather.velocities, scenario.normal.velocities));
    const heldDiagnosticsZero = snapshot => snapshot.diagnostics.candidateConnections === 0 &&
      snapshot.diagnostics.candidateSegments === 0 && snapshot.diagnostics.emittedSegments === 0;
    const settingsPreserved = JSON.stringify(primary.settings.before) === JSON.stringify(primary.settings.during) &&
      JSON.stringify(primary.settings.before) === JSON.stringify(primary.settings.afterRelease);
    const assertions = {
      firstKeydownGatheredOnce: primary.gatherActiveDuring && primary.gatherCalls === 1 &&
        primary.positionsChangedOnFirst,
      repeatAndDuplicateKeydownsIgnored: primary.ignoredKeydownsPreservedPositions,
      defaultGatherSkippedAllConnectionWork: heldDiagnosticsZero(primary.webgl) &&
        heldDiagnosticsZero(primary.trails) && heldDiagnosticsZero(primary.fallback),
      webGlParticlesRemainVisible: primary.webgl.pointCount === 16 && primary.webgl.vertexCount === 0,
      trailsParticlesRemainVisible: primary.trails.particleDraws === 16,
      canvasFallbackParticlesRemainVisible: primary.fallback.particleDraws === 16,
      pointerGatherForceStillMovesParticles: primary.pointerForceMoved,
      releaseRestoresLinesImmediately: !primary.gatherActiveAfterRelease && primary.ensureLoopCalls === 1 &&
        primary.released.diagnostics.candidateConnections > 0 &&
        primary.released.diagnostics.emittedSegments > 0 && primary.released.vertexCount > 0,
      lineAdaptiveAndPaneStatePreserved: settingsPreserved,
      pairForcesAndCollisionsMatchNormalPath: physicsEquivalent && primary.physics.every(scenario =>
        scenario.gather.diagnostics.candidateConnections === 0 &&
        scenario.gather.diagnostics.emittedSegments === 0),
      ctrlASelectsWithoutGathering: !ctrlA.gatherActive &&
        ctrlA.selectedParticles === ctrlA.particleCount && ctrlA.selectedWells === ctrlA.wellCount,
      cancellationPathsClearGather: Object.values(cleanup).every(Boolean),
      webGlHealthy: await page.evaluate(() => {
        const renderer = window.particleInstance.glRenderer;
        return Boolean(renderer && renderer.gl && !renderer.gl.isContextLost());
      }),
      noBrowserErrors: browserErrors.length === 0
    };
    const result = {
      passed: Object.values(assertions).every(Boolean),
      assertions,
      evidence: { primary, ctrlA, cleanup },
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
