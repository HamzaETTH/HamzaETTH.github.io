#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const url = process.argv[2];
const output = process.argv[3];
if (!url) throw new Error('Usage: rtk node scripts/test-physics-reset.js URL [artifact-directory]');
if (output) fs.mkdirSync(output, { recursive: true });

const browserErrors = [];

async function load(context) {
  const page = await context.newPage();
  page.on('pageerror', error => browserErrors.push(String(error)));
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => window.particleInstance && window.hotkeyManager);
  await page.evaluate(() => {
    const pn = window.particleInstance;
    if (typeof pn._stopStartupGravitySequence === 'function') pn._stopStartupGravitySequence();
    if (typeof pn.clearGravityWells === 'function') pn.clearGravityWells();
  });
  await page.keyboard.press('c');
  await page.waitForFunction(() => window.particleSettingsUi && document.getElementById('tp-container'));
  return page;
}

async function testDesktop(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await load(context);
  const evidence = await page.evaluate(async () => {
    const pn = window.particleInstance;
    const ui = window.particleSettingsUi;
    const manager = window.hotkeyManager;
    const { applyPhysicsParamsToNetwork } = await import('./js/ui/applyParams.js');
    const physicsKeys = [
      'particleRepulsion', 'particleCollision', 'particleAttraction', 'particleAttractionForce',
      'particleInteractionDistance', 'particleRepulsionForce', 'interactive', 'attractionRange',
      'attractionIntensity', 'repulsionRange', 'repulsionIntensity', 'speed', 'boundaryMode',
      'curvedDrift', 'curvedDriftCurvature', 'curvedDriftNoiseSpeed', 'gatherRadius',
      'gravityWellsEnabled', 'gravityWellAccelerationCapped', 'gravityWellAccelerationLimit',
      'gravityWellForceMultiplier', 'gravityWellSpin', 'cursorCaptureForceMultiplier',
      'cursorCaptureMaxSpeed'
    ];
    const runtimePhysicsOptionKeys = new Set([
      'particleRepulsion', 'particleCollision', 'particleAttraction', 'particleAttractionForce',
      'particleInteractionDistance', 'particleRepulsionForce', 'interactive', 'attractionRange',
      'attractionIntensity', 'repulsionRange', 'repulsionIntensity', 'velocity', 'boundaryMode',
      'curvedDrift', 'curvedDriftCurvature', 'curvedDriftNoiseSpeed', 'gatherRadius',
      'gravityWellsEnabled', 'gravityWellAccelerationCapped', 'gravityWellAccelerationLimit',
      'gravityWellForceMultiplier', 'gravityWellSpin', 'cursorCaptureForceMultiplier',
      'cursorCaptureMaxSpeed'
    ]);
    const visualParamKeys = [
      'particleColor', 'particleSize', 'trails', 'trailFade', 'lineJitter', 'lineJitterAmplitude',
      'gravityWellMotion', 'adaptiveLineDetail', 'autoAdaptiveLineDetail', 'performanceOverlay'
    ];
    const pick = (source, keys) => Object.fromEntries(keys.map(key => [key, source[key]]));
    const startupPhysics = pick(ui.params, physicsKeys);
    const json = value => JSON.stringify(value);
    const stopAnimation = () => {
      if (pn._rafId != null) cancelAnimationFrame(pn._rafId);
      pn._rafId = null;
      pn._rafActive = false;
    };
    const runtimePhysics = () => ({
      particleRepulsion: pn.options.particleRepulsion,
      particleCollision: pn.options.particleCollision,
      particleAttraction: pn.options.particleAttraction,
      particleAttractionForce: pn.options.particleAttractionForce,
      particleInteractionDistance: pn.options.particleInteractionDistance,
      particleRepulsionForce: pn.options.particleRepulsionForce,
      interactive: pn.options.interactive,
      attractionRange: pn.options.attractionRange * 10,
      attractionIntensity: pn.options.attractionIntensity,
      repulsionRange: pn.options.repulsionRange * 10,
      repulsionIntensity: pn.options.repulsionIntensity,
      speed: pn.options.velocity,
      boundaryMode: pn.options.boundaryMode,
      curvedDrift: pn.options.curvedDrift,
      curvedDriftCurvature: Math.round(pn.options.curvedDriftCurvature * 500),
      curvedDriftNoiseSpeed: pn.options.curvedDriftNoiseSpeed,
      gatherRadius: pn.options.gatherRadius,
      gravityWellsEnabled: pn.options.gravityWellsEnabled,
      gravityWellAccelerationCapped: pn.gravityWellAccelerationCapped,
      gravityWellAccelerationLimit: pn.gravityWellAccelerationLimit,
      gravityWellForceMultiplier: pn.options.gravityWellForceMultiplier,
      gravityWellSpin: pn.options.gravityWellSpin,
      cursorCaptureForceMultiplier: pn.options.cursorCaptureForceMultiplier,
      cursorCaptureMaxSpeed: pn.options.cursorCaptureMaxSpeed
    });
    const sceneSnapshot = () => {
      const nonPhysicsOptions = {};
      Object.keys(pn.options).sort().forEach(key => {
        if (!runtimePhysicsOptionKeys.has(key)) nonPhysicsOptions[key] = pn.options[key];
      });
      return json({
        count: pn.numParticles,
        arrays: [pn.posX, pn.posY, pn.velX, pn.velY, pn.sizeA].map(array => Array.from(array)),
        objects: pn.o.slice(0, pn.numParticles).map(particle => ({
          x: particle.x,
          y: particle.y,
          size: particle.size,
          particleColor: particle.particleColor,
          velocity: particle.velocity && { x: particle.velocity.x, y: particle.velocity.y }
        })),
        wells: pn.gravityWells,
        selection: {
          selectedGravityWellId: pn.selectedGravityWellId,
          selectedGravityWellIds: Array.from(pn.selectedGravityWellIds).sort(),
          selectedParticleIndices: Array.from(pn.selectedParticleIndices).sort((a, b) => a - b)
        },
        preset: {
          active: pn.activeGravityWellPreset,
          lastId: pn.lastGravityWellPresetId,
          adjustment: pn._gravityWellPresetAdjustment,
          viewport: pn._gravityWellPresetViewport
        },
        nonPhysicsOptions,
        visualParams: pick(ui.params, visualParamKeys)
      });
    };
    const alternateNumber = (current, a, b) => current === a ? b : a;
    const mutatePhysics = expected => ({
      particleRepulsion: !expected.particleRepulsion,
      particleCollision: !expected.particleCollision,
      particleAttraction: !expected.particleAttraction,
      particleAttractionForce: alternateNumber(expected.particleAttractionForce, 1.25, 2.25),
      particleInteractionDistance: alternateNumber(expected.particleInteractionDistance, 31, 73),
      particleRepulsionForce: alternateNumber(expected.particleRepulsionForce, 1.75, 2.75),
      interactive: !expected.interactive,
      attractionRange: alternateNumber(expected.attractionRange, 35, 75),
      attractionIntensity: alternateNumber(expected.attractionIntensity, 2, 4),
      repulsionRange: alternateNumber(expected.repulsionRange, 45, 85),
      repulsionIntensity: alternateNumber(expected.repulsionIntensity, 2.5, 4.5),
      speed: alternateNumber(expected.speed, 0, 1.37),
      boundaryMode: expected.boundaryMode === 'wrap' ? 'none' : 'wrap',
      curvedDrift: !expected.curvedDrift,
      curvedDriftCurvature: alternateNumber(expected.curvedDriftCurvature, 25, 85),
      curvedDriftNoiseSpeed: alternateNumber(expected.curvedDriftNoiseSpeed, 0.7, 3.1),
      gatherRadius: alternateNumber(expected.gatherRadius, 75, 220),
      gravityWellsEnabled: !expected.gravityWellsEnabled,
      gravityWellAccelerationCapped: !expected.gravityWellAccelerationCapped,
      gravityWellAccelerationLimit: alternateNumber(expected.gravityWellAccelerationLimit, 0.4, 3.4),
      gravityWellForceMultiplier: alternateNumber(expected.gravityWellForceMultiplier, 0.2, 2.2),
      gravityWellSpin: alternateNumber(expected.gravityWellSpin, -0.55, 0.55),
      cursorCaptureForceMultiplier: alternateNumber(expected.cursorCaptureForceMultiplier, 0.4, 2.4),
      cursorCaptureMaxSpeed: alternateNumber(expected.cursorCaptureMaxSpeed, 0.8, 4.8)
    });
    const startTransients = () => {
      pn._startCursorCapture(240, 220);
      stopAnimation();
      pn._gatherActive = true;
      pn.attractionForce = { x: 111, y: 122 };
      pn.repulsionForce = { x: 211, y: 222 };
      pn._activePointers.set('physics-reset-test', { x: 10, y: 20 });
    };
    const transientsCleared = () => !pn._gatherActive && !pn.attractionForce && !pn.repulsionForce &&
      !pn._cursorCaptureActive && !pn._cursorCapturePending && pn._cursorCaptureHoldTimer == null &&
      !pn._cursorCapturePoint && !pn._cursorCaptureAppliedPoint && !pn._cursorCapturedParticles &&
      pn._activePointers.size === 0;
    const findControl = (api, label) => {
      if (api && api.label === label) return api;
      for (const child of Array.from(api && api.children || [])) {
        const match = findControl(child, label);
        if (match) return match;
      }
      for (const tabPage of Array.from(api && api.pages || [])) {
        const match = findControl(tabPage, label);
        if (match) return match;
      }
      return null;
    };
    const resetButton = Array.from(document.querySelectorAll('#tp-container button'))
      .find(button => button.textContent.trim() === 'Reset Physics');
    const defaultResetButton = Array.from(document.querySelectorAll('#tp-container button'))
      .find(button => button.textContent.trim() === 'Reset to Default');
    const forceControl = findControl(ui.pane, 'All Wells Force');
    const toastCalls = [];
    const originalShowToast = manager.showToast;
    manager.showToast = (message, options) => toastCalls.push({ message, duration: options && options.duration });

    pn.setParticleCount(24);
    pn.applyGravityWellPreset('cross-cage');
    ui.syncGravityWellControls();
    const selectedWell = pn.gravityWells[1];
    pn.updateGravityWell(selectedWell.id, { innerColor: '#abcdef', outerColor: '#123456' });
    pn.selectGravityWell(selectedWell.id);
    pn.selectedParticleIndices.add(3);
    Object.assign(ui.params, {
      particleColor: '#35c47a',
      particleSize: 3,
      trails: true,
      trailFade: 0.17,
      lineJitter: true,
      lineJitterAmplitude: 0.31,
      gravityWellMotion: 'static',
      adaptiveLineDetail: true,
      autoAdaptiveLineDetail: false,
      performanceOverlay: true
    });
    window.applyParamsToNetwork(pn, ui.params);
    stopAnimation();
    for (let i = 0; i < pn.numParticles; i++) {
      pn.posX[i] = 40 + i * 3;
      pn.posY[i] = 80 + i * 2;
      pn.velX[i] = (i + 1) * 0.01;
      pn.velY[i] = -(i + 1) * 0.02;
    }
    pn._syncObjectsFromSoA();

    let rebuilds = 0;
    let canvasClears = 0;
    const originalRebuild = pn._rebuildOnResize;
    const originalClearRect = pn.g.clearRect;
    pn._rebuildOnResize = function () { rebuilds++; return originalRebuild.apply(this, arguments); };
    pn.g.clearRect = function () { canvasClears++; return originalClearRect.apply(this, arguments); };

    const recommended = window.GravityWellPresets.get('cross-cage').motion;
    const presetExpected = {
      ...startupPhysics,
      speed: recommended.velocity,
      gravityWellSpin: recommended.gravityWellSpin,
      gravityWellForceMultiplier: recommended.gravityWellForceMultiplier,
      gravityWellAccelerationCapped: recommended.gravityWellAccelerationCapped,
      gravityWellAccelerationLimit: recommended.gravityWellAccelerationLimit,
      curvedDrift: recommended.curvedDrift
    };
    const presetMutation = mutatePhysics(presetExpected);
    Object.assign(ui.params, presetMutation);
    const helperScopeBefore = sceneSnapshot();
    applyPhysicsParamsToNetwork(pn, {
      ...presetMutation,
      density: 1,
      particleSize: 8,
      particleColor: '#ff00ff',
      trails: false,
      gravityWellMotion: 'animate',
      adaptiveLineDetail: false,
      performanceOverlay: false,
      background: '#ffffff'
    });
    stopAnimation();
    const helperScopeAfter = sceneSnapshot();
    const helperIgnoresUnrelatedParams = helperScopeBefore === helperScopeAfter && rebuilds === 0 && canvasClears === 0;
    pn._setPresetRecommendedMotionActive(false);
    const presetSceneBefore = sceneSnapshot();
    startTransients();
    resetButton.click();
    stopAnimation();
    const presetSceneAfter = sceneSnapshot();
    const presetResult = {
      uiPhysics: pick(ui.params, physicsKeys),
      runtimePhysics: runtimePhysics(),
      scenePreserved: presetSceneBefore === presetSceneAfter,
      transientsCleared: transientsCleared(),
      ownership: json(pn.activeGravityWellPreset),
      expectedOwnership: json({ id: 'cross-cage', spacing: 100, rotation: 0, strength: 100 }),
      stableOrbitReenabled: pn._gravityWellPresetUsesRecommendedMotion && pn._presetOrbitActive &&
        pn._presetOrbitAnchors.length > 0,
      forceDisplay: forceControl && forceControl.element.querySelector('input')?.value,
      toast: toastCalls.at(-1)
    };

    const movedWell = pn.gravityWells[0];
    pn.updateGravityWell(movedWell.id, { x: movedWell.x + 1 });
    const customExpected = { ...startupPhysics };
    const customMutation = mutatePhysics(customExpected);
    Object.assign(ui.params, customMutation);
    applyPhysicsParamsToNetwork(pn, customMutation);
    stopAnimation();
    const customSceneBefore = sceneSnapshot();
    startTransients();
    resetButton.click();
    stopAnimation();
    const customSceneAfter = sceneSnapshot();
    const customResult = {
      uiPhysics: pick(ui.params, physicsKeys),
      runtimePhysics: runtimePhysics(),
      scenePreserved: customSceneBefore === customSceneAfter,
      transientsCleared: transientsCleared(),
      activePreset: pn.activeGravityWellPreset,
      lastPresetId: pn.lastGravityWellPresetId,
      stableOrbitInactive: !pn._gravityWellPresetUsesRecommendedMotion && !pn._presetOrbitActive,
      toast: toastCalls.at(-1)
    };

    resetButton.focus();
    const uiContract = {
      helperIgnoresUnrelatedParams,
      noRebuilds: rebuilds === 0,
      noCanvasClears: canvasClears === 0,
      resetButtonBeforeFullReset: resetButton.compareDocumentPosition(defaultResetButton) & Node.DOCUMENT_POSITION_FOLLOWING ? true : false,
      resetButtonFocused: document.activeElement === resetButton,
      forceLabel: forceControl && forceControl.label,
      forceTooltip: forceControl && forceControl.element.title,
      toastCount: toastCalls.filter(call => call.message === 'Physics reset' && call.duration === 1500).length
    };

    pn._rebuildOnResize = originalRebuild;
    pn.g.clearRect = originalClearRect;
    manager.showToast = originalShowToast;
    return { startupPhysics, presetExpected, customExpected, presetResult, customResult, uiContract };
  });

  assert.equal(evidence.presetExpected.gravityWellForceMultiplier, 0.6);
  assert.deepEqual(evidence.presetResult.uiPhysics, evidence.presetExpected);
  assert.deepEqual(evidence.presetResult.runtimePhysics, evidence.presetExpected);
  assert.equal(evidence.presetResult.scenePreserved, true);
  assert.equal(evidence.presetResult.stableOrbitReenabled, true);
  assert.equal(evidence.presetResult.transientsCleared, true);
  assert.equal(evidence.presetResult.ownership, evidence.presetResult.expectedOwnership);
  assert.equal(evidence.presetResult.forceDisplay, '60%');
  assert.deepEqual(evidence.presetResult.toast, { message: 'Physics reset', duration: 1500 });
  assert.deepEqual(evidence.customResult.uiPhysics, evidence.customExpected);
  assert.deepEqual(evidence.customResult.runtimePhysics, evidence.customExpected);
  assert.equal(evidence.customResult.scenePreserved, true);
  assert.equal(evidence.customResult.stableOrbitInactive, true);
  assert.equal(evidence.customResult.transientsCleared, true);
  assert.equal(evidence.customResult.activePreset, null);
  assert.equal(evidence.customResult.lastPresetId, 'cross-cage');
  assert.deepEqual(evidence.customResult.toast, { message: 'Physics reset', duration: 1500 });
  assert.deepEqual(evidence.uiContract, {
    helperIgnoresUnrelatedParams: true,
    noRebuilds: true,
    noCanvasClears: true,
    resetButtonBeforeFullReset: true,
    resetButtonFocused: true,
    forceLabel: 'All Wells Force',
    forceTooltip: 'Scales every black and white hole equally without changing their balance.',
    toastCount: 2
  });

  if (output) {
    await page.getByText('Main', { exact: true }).click();
    await page.screenshot({ path: path.join(output, 'physics-reset-desktop-main.png') });
    await page.getByText('Wells', { exact: true }).click();
    await page.screenshot({ path: path.join(output, 'physics-reset-desktop-wells.png') });
  }
  await context.close();
  return evidence;
}

async function testTouch(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true
  });
  const page = await load(context);
  const touch = await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll('#tp-container button'))
      .find(candidate => candidate.textContent.trim() === 'Reset Physics');
    button.focus();
    return {
      coarsePointer: matchMedia('(hover: none) and (pointer: coarse)').matches,
      height: button.getBoundingClientRect().height,
      focused: document.activeElement === button,
      visible: button.getClientRects().length > 0
    };
  });
  assert.equal(touch.coarsePointer, true);
  assert.equal(touch.visible, true);
  assert.equal(touch.focused, true);
  assert.ok(touch.height >= 44, `Reset Physics touch target must be at least 44px, got ${touch.height}`);
  if (output) await page.screenshot({ path: path.join(output, 'physics-reset-touch.png'), fullPage: true });
  await context.close();
  return touch;
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-first-run'] });
  try {
    const desktop = await testDesktop(browser);
    const touch = await testTouch(browser);
    assert.deepEqual(browserErrors, []);
    console.log(JSON.stringify({
      presetForce: desktop.presetExpected.gravityWellForceMultiplier,
      customForce: desktop.customExpected.gravityWellForceMultiplier,
      helperScoped: desktop.uiContract.helperIgnoresUnrelatedParams,
      scenePreserved: desktop.presetResult.scenePreserved && desktop.customResult.scenePreserved,
      touchTargetHeight: touch.height,
      browserErrors
    }, null, 2));
    console.log('Physics reset: preset/custom profiles, exact scene preservation, UI sync, transient cleanup, scoped application, tooltip, focus and touch target passed.');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
