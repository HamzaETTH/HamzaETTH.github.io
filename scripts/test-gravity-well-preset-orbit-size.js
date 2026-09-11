#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const url = process.argv[2];
if (!url) throw new Error('Usage: rtk node scripts/test-gravity-well-preset-orbit-size.js URL');

const namedProblemPresets = new Set([
  'cross-cage', 'diamond-cage', 'triangular-cage', 'hexagonal-cage', 'octagonal-cage',
  'split-cage', 'twin-cages', 'crossroads', 'corner-refuges', 'staggered-anchors',
  'spiral-cage', 'twin-havens', 'diagonal-weave'
]);

async function auditPreset(page, id, steps) {
  return page.evaluate(({ id, steps }) => {
    const pn = window.particleInstance;
    const preset = window.GravityWellPresets.get(id);
    const count = 64;
    pn.setParticleCount(count);
    for (let i = 0; i < count; i++) {
      const angle = i * 2.399963229728653;
      const magnitude = i === 0 ? 0 : 0.66;
      pn.velX[i] = Math.cos(angle) * magnitude;
      pn.velY[i] = Math.sin(angle) * magnitude;
    }
    pn._syncObjectsFromSoA();
    pn.applyGravityWellPreset(id);
    cancelAnimationFrame(pn._rafId);
    pn._rafActive = false;
    pn._clearInteractivePointerForces();
    pn._cursorCaptureActive = false;
    pn.options.interactive = false;
    pn.options.particleAttraction = false;
    pn.options.particleRepulsion = false;
    pn.options.boundaryMode = 'bounce';

    const bufferRefs = [pn.posX, pn.posY, pn.velX, pn.velY, pn.sizeA];
    const objectRefs = pn.o.slice(0, count);
    const wellsBefore = JSON.stringify(pn.gravityWells.map(well => ({
      id: well.id, type: well.type, x: well.x, y: well.y,
      radius: well.radius, strength: well.strength
    })));
    const blackWells = pn.gravityWells.filter(well =>
      (well.strength < 0 ? (well.type === 'white' ? 'black' : 'white') : well.type) === 'black');
    const insideBlackHalo = (x, y) => blackWells.some(well =>
      Math.hypot(x - well.x, y - well.y) <= well.radius * window.GravityWellPresets.visualExtentScale);
    const assignmentsAtLaunch = Array.from(pn._presetOrbitAssignments.slice(0, count));
    const launch = Array.from({ length: count }, (_, index) => [pn.posX[index], pn.posY[index]]);
    const launchOutsideHalo = launch.filter(([x, y], index) =>
      assignmentsAtLaunch[index] >= 0 && !insideBlackHalo(x, y)).length / count;

    const previousAngle = new Float64Array(count);
    const previousAnchor = new Int16Array(count);
    const angularTravel = new Float64Array(count);
    const slowStreak = new Uint16Array(count);
    const maxSlowStreak = new Uint16Array(count);
    previousAnchor.fill(-1);
    let insideSamples = 0;
    let insideCoreSamples = 0;
    let movingSamples = 0;
    let sampled = 0;
    const checkpoints = [];

    for (let step = 1; step <= steps; step++) {
      pn._updateSoA();
      for (let i = 0; i < count; i++) {
        const speed = Math.hypot(pn.velX[i], pn.velY[i]);
        if (speed <= 0.35) {
          slowStreak[i]++;
          maxSlowStreak[i] = Math.max(maxSlowStreak[i], slowStreak[i]);
        } else {
          slowStreak[i] = 0;
        }
        const anchorIndex = pn._presetOrbitAssignments[i];
        const anchor = pn._presetOrbitAnchors[anchorIndex];
        if (!anchor) continue;
        const angle = Math.atan2(pn.posY[i] - anchor.y, pn.posX[i] - anchor.x);
        if (previousAnchor[i] === anchorIndex) {
          let delta = angle - previousAngle[i];
          if (delta > Math.PI) delta -= Math.PI * 2;
          else if (delta < -Math.PI) delta += Math.PI * 2;
          if (step > 600 && step <= 1800) angularTravel[i] += Math.abs(delta);
        }
        previousAngle[i] = angle;
        previousAnchor[i] = anchorIndex;
      }
      if (step >= 600 && step % 30 === 0) {
        for (let i = 0; i < count; i++) {
          const anchor = pn._presetOrbitAnchors[pn._presetOrbitAssignments[i]];
          if (!anchor) continue;
          sampled++;
          if (insideBlackHalo(pn.posX[i], pn.posY[i])) insideSamples++;
          if (blackWells.some(well =>
              Math.hypot(pn.posX[i] - well.x, pn.posY[i] - well.y) < well.radius)) insideCoreSamples++;
          if (Math.hypot(pn.velX[i], pn.velY[i]) > 0.35) movingSamples++;
        }
      }
      if (step === 600 || step === 2400 || step === 10000) {
        let inside = 0;
        let moving = 0;
        for (let i = 0; i < count; i++) {
          const anchor = pn._presetOrbitAnchors[pn._presetOrbitAssignments[i]];
          if (anchor && insideBlackHalo(pn.posX[i], pn.posY[i])) inside++;
          if (Math.hypot(pn.velX[i], pn.velY[i]) > 0.35) moving++;
        }
        checkpoints.push({ step, insideFraction: inside / count, movingFraction: moving / count });
      }
    }

    const normalizedRadii = [];
    for (let i = 0; i < count; i++) {
      const anchor = pn._presetOrbitAnchors[pn._presetOrbitAssignments[i]];
      if (anchor) normalizedRadii.push(Math.hypot(pn.posX[i] - anchor.x, pn.posY[i] - anchor.y) / anchor.visualRadius);
    }
    normalizedRadii.sort((left, right) => left - right);
    const rotatingFraction = Array.from(angularTravel).filter(value => value >= Math.PI).length / count;
    const radialIqr = normalizedRadii.length
      ? normalizedRadii[Math.floor(normalizedRadii.length * 0.75)] - normalizedRadii[Math.floor(normalizedRadii.length * 0.25)]
      : 0;
    return {
      id, steps, placement: preset.initialParticlePlacement,
      launchOutsideHalo,
      insideFraction: sampled ? insideSamples / sampled : 0,
      insideCoreFraction: sampled ? insideCoreSamples / sampled : 0,
      movingFraction: sampled ? movingSamples / sampled : 0,
      rotatingFraction,
      radialIqr,
      maximumSlowStreak: Math.max(...maxSlowStreak),
      checkpoints,
      noRebuild: bufferRefs.every((buffer, index) => buffer === [pn.posX, pn.posY, pn.velX, pn.velY, pn.sizeA][index]) &&
        objectRefs.every((particle, index) => particle === pn.o[index]),
      wellsUnchanged: wellsBefore === JSON.stringify(pn.gravityWells.map(well => ({
        id: well.id, type: well.type, x: well.x, y: well.y,
        radius: well.radius, strength: well.strength
      }))),
      finite: Array.from(pn.posX.slice(0, count)).every(Number.isFinite) &&
        Array.from(pn.posY.slice(0, count)).every(Number.isFinite) &&
        Array.from(pn.velX.slice(0, count)).every(Number.isFinite) &&
        Array.from(pn.velY.slice(0, count)).every(Number.isFinite)
    };
  }, { id, steps });
}

async function auditPurePhysicsPreset(page, id, steps) {
  return page.evaluate(({ id, steps }) => {
    const pn = window.particleInstance;
    const count = 32;
    pn.setParticleCount(count);
    for (let i = 0; i < count; i++) {
      const angle = i * 2.399963229728653;
      pn.velX[i] = Math.cos(angle) * 0.66;
      pn.velY[i] = Math.sin(angle) * 0.66;
    }
    pn._syncObjectsFromSoA();
    pn.setGravityWellPresetOrbitAssist(false);
    pn.applyGravityWellPreset(id);
    cancelAnimationFrame(pn._rafId);
    pn._rafId = null;
    pn._rafActive = false;
    pn._clearInteractivePointerForces();
    pn._cursorCaptureActive = false;
    pn.options.interactive = false;
    pn.options.particleAttraction = false;
    pn.options.particleRepulsion = false;
    pn.options.boundaryMode = 'bounce';

    const buffers = [pn.posX, pn.posY, pn.velX, pn.velY, pn.sizeA];
    const wellsBefore = JSON.stringify(pn.gravityWells);
    const blackWells = pn.gravityWells.filter(well =>
      (well.strength < 0 ? (well.type === 'white' ? 'black' : 'white') : well.type) === 'black');
    const deepStreak = new Uint16Array(count);
    const centerStreak = new Uint16Array(count);
    let maximumDeepStreak = 0;
    let maximumCenterStreak = 0;
    let insideHaloSamples = 0;
    let deepCoreSamples = 0;
    let centerSamples = 0;
    let movingSamples = 0;
    let normalizedDistanceSum = 0;
    let samples = 0;
    let controllerRan = false;

    for (let step = 1; step <= steps; step++) {
      pn._updateSoA();
      controllerRan = controllerRan || pn._presetOrbitRunning;
      if (step < 300) continue;
      for (let i = 0; i < count; i++) {
        let nearest = Infinity;
        for (const well of blackWells) {
          nearest = Math.min(nearest, Math.hypot(pn.posX[i] - well.x, pn.posY[i] - well.y) / well.radius);
        }
        if (nearest < 1) {
          deepStreak[i]++;
          maximumDeepStreak = Math.max(maximumDeepStreak, deepStreak[i]);
        } else {
          deepStreak[i] = 0;
        }
        if (nearest < 0.35) {
          centerStreak[i]++;
          maximumCenterStreak = Math.max(maximumCenterStreak, centerStreak[i]);
        } else {
          centerStreak[i] = 0;
        }
        if (step % 10 !== 0) continue;
        samples++;
        normalizedDistanceSum += nearest;
        if (nearest < window.GravityWellPresets.visualExtentScale) insideHaloSamples++;
        if (nearest < 1) deepCoreSamples++;
        if (nearest < 0.35) centerSamples++;
        if (Math.hypot(pn.velX[i], pn.velY[i]) > 0.2) movingSamples++;
      }
    }

    return {
      id,
      controllerRan,
      insideHaloFraction: samples ? insideHaloSamples / samples : 0,
      deepCoreFraction: samples ? deepCoreSamples / samples : 0,
      centerFraction: samples ? centerSamples / samples : 0,
      movingFraction: samples ? movingSamples / samples : 0,
      meanNearestRadius: samples ? normalizedDistanceSum / samples : Infinity,
      maximumDeepStreak,
      maximumCenterStreak,
      noRebuild: buffers.every((buffer, index) =>
        buffer === [pn.posX, pn.posY, pn.velX, pn.velY, pn.sizeA][index]),
      wellsUnchanged: wellsBefore === JSON.stringify(pn.gravityWells),
      finite: Array.from(pn.posX.slice(0, count)).every(Number.isFinite) &&
        Array.from(pn.posY.slice(0, count)).every(Number.isFinite) &&
        Array.from(pn.velX.slice(0, count)).every(Number.isFinite) &&
        Array.from(pn.velY.slice(0, count)).every(Number.isFinite)
    };
  }, { id, steps });
}

async function main() {
  const browser = await chromium.launch({
    channel: 'msedge', headless: true,
    args: ['--no-first-run', '--disable-background-timer-throttling', '--disable-renderer-backgrounding']
  });
  const result = { cases: [], purePhysics: [], baseline: {}, gating: null, browserErrors: [] };
  try {
    const contexts = [
      { label: 'desktop', options: { viewport: { width: 1280, height: 900 } } },
      { label: 'touch', options: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }
    ];
    for (const contextSpec of contexts) {
      const context = await browser.newContext(contextSpec.options);
      const page = await context.newPage();
      page.on('pageerror', error => result.browserErrors.push(`${contextSpec.label}: ${error}`));
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.particleInstance && window.GravityWellPresets);
      const ids = await page.evaluate(() => window.GravityWellPresets.presets.map(preset => preset.id));
      for (const id of ids) {
        if (id === 'binary' || id === 'dipole') continue;
        const steps = contextSpec.label === 'desktop' && namedProblemPresets.has(id) ? 10000 : 2400;
        const state = await auditPreset(page, id, steps);
        state.mode = contextSpec.label;
        result.cases.push(state);
      }
      if (contextSpec.label === 'desktop') {
        for (const id of ids) {
          result.purePhysics.push(await auditPurePhysicsPreset(page, id, 1200));
        }
      }
      result.baseline[contextSpec.label] = await page.evaluate(() => {
          const pn = window.particleInstance;
          const catalogue = window.GravityWellPresets;
          const output = {};
          for (const id of ['binary', 'dipole']) {
            pn.setParticleCount(32);
            const velocities = [Array.from(pn.velX), Array.from(pn.velY)];
            pn.applyGravityWellPreset(id);
            output[id] = {
              stableOrbit: catalogue.get(id).stableOrbit,
              placement: catalogue.get(id).initialParticlePlacement,
              force: catalogue.get(id).motion.gravityWellForceMultiplier,
              controllerActive: pn._presetOrbitActive,
              gathered: Array.from(pn.posX).every((x, index) => Math.hypot(
                x - pn.i.size.width * 0.5, pn.posY[index] - pn.i.size.height * 0.5) <= pn.options.gatherRadius + 0.01),
              velocitiesPreserved: velocities[0].every((vx, index) => vx === pn.velX[index] && velocities[1][index] === pn.velY[index])
            };
          }
          return output;
      });
      if (contextSpec.label === 'desktop') {
        result.gating = await page.evaluate(() => {
          const pn = window.particleInstance;
          pn.options.gravityWellForceMultiplier = 1.73;
          pn.applyGravityWellPreset('cross-cage', { useRecommendedMotion: false });
          const unchecked = {
            force: pn.options.gravityWellForceMultiplier,
            active: pn._presetOrbitActive,
            ownership: pn._gravityWellPresetUsesRecommendedMotion
          };
          pn.applyGravityWellPreset('cross-cage');
          pn.options.gravityWellForceMultiplier = 0;
          pn.options.velocity = 0;
          pn.options.curvedDrift = false;
          pn.velX[0] = 0;
          pn.velY[0] = 0;
          const before = [pn.posX[0], pn.posY[0], pn.velX[0], pn.velY[0]];
          pn._updateSoA();
          const forceZeroUnchanged = before.every((value, index) => value === [pn.posX[0], pn.posY[0], pn.velX[0], pn.velY[0]][index]);
          pn.options.gravityWellForceMultiplier = 0.6;
          pn.updateGravityWell(pn.gravityWells[0].id, { x: pn.gravityWells[0].x + 1 });
          return {
            unchecked,
            forceZeroUnchanged,
            detached: pn.activeGravityWellPreset === null && !pn._presetOrbitActive && !pn._gravityWellPresetUsesRecommendedMotion
          };
        });
      }
      await context.close();
    }

    const failures = [];
    for (const state of result.cases) {
      const reasons = [];
      if (!state.finite) reasons.push('non-finite state');
      if (!state.noRebuild) reasons.push('particle rebuild');
      if (!state.wellsUnchanged) reasons.push('well mutation');
      if (state.placement === 'orbit' && state.launchOutsideHalo < 0.99) reasons.push(`launch ${state.launchOutsideHalo}`);
      // On a 390px viewport this dense grid's neighboring rendered halos overlap
      // the assisted paths. Transit is acceptable, but entering a core is not.
      const maximumInsideFraction = state.mode === 'touch' && state.id === 'checkerboard-sixteen'
        ? 0.3 : namedProblemPresets.has(state.id) ? 0.01 : 0.2;
      if (state.insideFraction > maximumInsideFraction) reasons.push(`inside ${state.insideFraction}`);
      if (state.insideCoreFraction > 0.01) reasons.push(`inside core ${state.insideCoreFraction}`);
      if (state.movingFraction < 0.95) reasons.push(`moving ${state.movingFraction}`);
      if (state.rotatingFraction < 0.8) reasons.push(`rotating ${state.rotatingFraction}`);
      if (state.radialIqr <= 0.0001) reasons.push(`radialIqr ${state.radialIqr}`);
      if (state.maximumSlowStreak >= 120) reasons.push(`slowStreak ${state.maximumSlowStreak}`);
      if (reasons.length) failures.push({ mode: state.mode, id: state.id, reasons, checkpoints: state.checkpoints });
    }
    if (failures.length) process.stderr.write(`${JSON.stringify(failures, null, 2)}\n`);
    assert.deepEqual(failures, [], 'stable-orbit audit failures');
    const purePhysicsFailures = result.purePhysics.filter(state =>
      !state.finite || !state.noRebuild || !state.wellsUnchanged || state.controllerRan ||
      state.meanNearestRadius < 1.2 || state.deepCoreFraction > 0.2 ||
      state.centerFraction > 0.005 || state.movingFraction < 0.9 ||
      state.maximumDeepStreak >= 60 || state.maximumCenterStreak >= 5 ||
      (namedProblemPresets.has(state.id) && state.deepCoreFraction > 0.005));
    if (purePhysicsFailures.length) {
      process.stderr.write(`Pure-physics failures:\n${JSON.stringify(purePhysicsFailures, null, 2)}\n`);
    }
    assert.deepEqual(purePhysicsFailures, [], 'pure-physics black-hole safety audit failures');
    for (const mode of ['desktop', 'touch']) {
      for (const id of ['binary', 'dipole']) {
        assert.deepEqual(result.baseline[mode][id], {
          stableOrbit: false, placement: 'center', force: 0.6,
          controllerActive: false, gathered: true, velocitiesPreserved: true
        }, `${id} ${mode} baseline behavior`);
      }
    }
    assert.deepEqual(result.gating.unchecked, { force: 1.73, active: false, ownership: false });
    assert.equal(result.gating.forceZeroUnchanged, true, 'zero force must disable orbit controller');
    assert.equal(result.gating.detached, true, 'manual well edits must detach orbit controller');
    assert.deepEqual(result.browserErrors, [], `browser errors: ${result.browserErrors.join('; ')}`);
    process.stdout.write(`${JSON.stringify({
      auditedCases: result.cases.length,
      namedProblemPresets: result.cases.filter(state => namedProblemPresets.has(state.id)).map(state => ({
        mode: state.mode, id: state.id, steps: state.steps,
        insideFraction: state.insideFraction,
        movingFraction: state.movingFraction,
        rotatingFraction: state.rotatingFraction,
        maximumSlowStreak: state.maximumSlowStreak
      })),
      purePhysics: {
        auditedPresets: result.purePhysics.length,
        maximumDeepCoreFraction: Math.max(...result.purePhysics.map(state => state.deepCoreFraction)),
        maximumCenterFraction: Math.max(...result.purePhysics.map(state => state.centerFraction)),
        maximumDeepStreak: Math.max(...result.purePhysics.map(state => state.maximumDeepStreak)),
        maximumCenterStreak: Math.max(...result.purePhysics.map(state => state.maximumCenterStreak)),
        minimumMovingFraction: Math.min(...result.purePhysics.map(state => state.movingFraction)),
        minimumMeanNearestRadius: Math.min(...result.purePhysics.map(state => state.meanNearestRadius))
      },
      baseline: result.baseline,
      gating: result.gating,
      browserErrors: result.browserErrors
    }, null, 2)}\n`);
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
