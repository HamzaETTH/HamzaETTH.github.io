#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

function parseArgs(argv) {
  const options = { url: null, screenshotDir: null, headed: false, output: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--url') options.url = argv[++i];
    else if (arg === '--screenshot-dir') options.screenshotDir = argv[++i];
    else if (arg === '--output') options.output = argv[++i];
    else if (arg === '--headed') options.headed = true;
    else if (!options.url) options.url = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

async function waitForFrames(page, count) {
  await page.evaluate(frameCount => new Promise(resolve => {
    let remaining = frameCount;
    function next() {
      if (--remaining <= 0) resolve();
      else requestAnimationFrame(next);
    }
    requestAnimationFrame(next);
  }), count);
}

async function dispatchTouchDrag(page, start, end, pointerId) {
  return page.evaluate(({ start, end, pointerId }) => {
    const canvas = window.particleInstance.canvas;
    const rect = canvas.getBoundingClientRect();
    function send(type, point, buttons) {
      canvas.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId,
        pointerType: 'touch',
        isPrimary: true,
        buttons,
        clientX: rect.left + point.x,
        clientY: rect.top + point.y
      }));
    }
    send('pointerdown', start, 1);
    send('pointermove', end, 1);
    const measurements = window.particleInstance._getGravityWellMeasurements()
      .map(measurement => ({ ...measurement }));
    send('pointerup', end, 0);
    return measurements;
  }, { start, end, pointerId });
}

async function load(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.particleInstance && window.particleInstance.glRenderer, null, { timeout: 30000 });
}

async function runDesktop(browser, options, browserErrors) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push({ surface: 'desktop', type: 'console', text: message.text() });
  });
  page.on('pageerror', error => browserErrors.push({ surface: 'desktop', type: 'pageerror', text: String(error) }));
  await load(page, options.url);

  const initial = await page.evaluate(() => {
    const pn = window.particleInstance;
    return {
      wellCount: pn.gravityWells.length,
      defaultRadius: pn.options.gravityWellRadius,
      gravityWellAccelerationCapped: pn.gravityWellAccelerationCapped,
      gravityWellAccelerationLimit: pn.gravityWellAccelerationLimit,
      gravityWellForceMultiplier: pn.options.gravityWellForceMultiplier,
      gravityWellSpin: pn.options.gravityWellSpin,
      cursorCaptureForceMultiplier: pn.options.cursorCaptureForceMultiplier,
      cursorCaptureMaxSpeed: pn.options.cursorCaptureMaxSpeed,
      pointBufferCreates: pn.glRenderer.gravityWellRenderer.diagnostics.pointBufferCreates,
      pointBuffer: pn.glRenderer.gravityWellRenderer.pointBuffer,
      contextLost: pn.glRenderer.gl.isContextLost()
    };
  });

  const heroFade = await page.evaluate(() => {
    const hero = document.querySelector('.center-text');
    const animation = hero?.getAnimations().find(candidate => candidate.animationName === 'hero-overlay-fade');
    if (!animation) return null;
    animation.pause();
    const sample = time => {
      animation.currentTime = time;
      const style = getComputedStyle(hero);
      return { opacity: Number(style.opacity), visibility: style.visibility };
    };
    const start = sample(0);
    const fading = sample(5000);
    const finished = sample(10000);
    const timing = animation.effect.getTiming();
    animation.currentTime = 0;
    animation.play();
    return { start, fading, finished, delay: timing.delay, duration: timing.duration };
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reducedHeroFade = await page.evaluate(() => {
    const animation = document.querySelector('.center-text')?.getAnimations()
      .find(candidate => candidate.animationName === 'hero-overlay-fade');
    if (!animation) return null;
    const timing = animation.effect.getTiming();
    return { delay: timing.delay, duration: timing.duration };
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  await page.mouse.move(1100, 100);
  await page.keyboard.press('w');
  await page.mouse.move(1050, 120);
  const defaultClickDraft = await page.evaluate(() => ({
    x: window.particleInstance.gravityWellDraft?.x,
    y: window.particleInstance.gravityWellDraft?.y,
    radius: window.particleInstance.gravityWellDraft?.radius,
    label: document.querySelector('.gravity-well-radius-label')?.textContent
  }));
  await page.mouse.click(1050, 120);
  const defaultClickPlacement = await page.evaluate(() => {
    const pn = window.particleInstance;
    const well = pn.getSelectedGravityWell();
    const result = well ? { type: well.type, x: well.x, y: well.y, radius: well.radius } : null;
    pn.removeSelectedGravityWell();
    return result;
  });

  await page.evaluate(() => {
    const pn = window.particleInstance;
    pn.options.velocity = 0;
    if (pn._rafId != null) cancelAnimationFrame(pn._rafId);
    pn._rafId = null;
    pn._rafActive = false;
  });
  const middleSpawnBaseline = await page.evaluate(() => window.particleInstance.numParticles);
  await page.mouse.move(640, 560);
  await page.mouse.down({ button: 'middle' });
  await page.waitForTimeout(160);
  const middleSpawnFirst = await page.evaluate(start => {
    const pn = window.particleInstance;
    const spawned = Array.from({ length: pn.numParticles - start }, (_, offset) => ({
      x: pn.posX[start + offset],
      y: pn.posY[start + offset]
    }));
    return {
      count: pn.numParticles,
      active: pn._middleSpawnActive,
      allNearPointer: spawned.length > 0 && spawned.every(particle => Math.hypot(particle.x - 640, particle.y - 560) < 20),
      noneOnEdge: spawned.every(particle => particle.x > 0 && particle.x < pn.i.size.width && particle.y > 0 && particle.y < pn.i.size.height),
      forcesClear: !pn.attractionForce && !pn.repulsionForce
    };
  }, middleSpawnBaseline);
  await page.mouse.move(720, 560);
  await page.waitForTimeout(160);
  const middleSpawnSecond = await page.evaluate(start => {
    const pn = window.particleInstance;
    const spawned = Array.from({ length: pn.numParticles - start }, (_, offset) => ({
      x: pn.posX[start + offset],
      y: pn.posY[start + offset]
    }));
    return {
      count: pn.numParticles,
      active: pn._middleSpawnActive,
      allNearPointer: spawned.length > 0 && spawned.every(particle => Math.hypot(particle.x - 720, particle.y - 560) < 20),
      noneOnEdge: spawned.every(particle => particle.x > 0 && particle.x < pn.i.size.width && particle.y > 0 && particle.y < pn.i.size.height),
      finite: pn.o.slice(0, pn.numParticles).every(particle =>
        Number.isFinite(particle.x) && Number.isFinite(particle.y) &&
        Number.isFinite(particle.velocity.x) && Number.isFinite(particle.velocity.y))
    };
  }, middleSpawnFirst.count);
  await page.mouse.up({ button: 'middle' });
  await page.waitForTimeout(120);
  const middleSpawnReleased = await page.evaluate(() => ({
    count: window.particleInstance.numParticles,
    active: window.particleInstance._middleSpawnActive,
    rafActive: window.particleInstance._rafActive
  }));
  await page.waitForTimeout(120);
  const middleSpawnSettledCount = await page.evaluate(() => window.particleInstance.numParticles);
  await page.evaluate(baseline => {
    const pn = window.particleInstance;
    pn.o = pn.o.slice(0, baseline);
    pn._initSoAFromObjects(baseline);
    if (pn.p) pn.p.index = baseline;
    pn.options.velocity = 0.66;
    pn._ensureAnimationLoop();
  }, middleSpawnBaseline);

  const particleCountBeforePlacementWheel = await page.evaluate(() => window.particleInstance.o.length);
  await page.mouse.move(300, 250);
  await page.keyboard.press('b');
  await page.mouse.move(420, 250);
  await page.mouse.wheel(0, -100);
  const blackPreview = await page.evaluate(() => {
    const label = document.querySelector('.gravity-well-radius-label');
    return {
      draft: { ...window.particleInstance.gravityWellDraft },
      particleCount: window.particleInstance.o.length,
      labelText: label?.textContent,
      labelVisible: !!label && getComputedStyle(label).display !== 'none'
    };
  });
  const blackDraft = blackPreview.draft;
  await page.mouse.click(420, 250);
  const blackLabelHiddenAfterCommit = await page.evaluate(() => {
    const label = document.querySelector('.gravity-well-radius-label');
    return !!label && getComputedStyle(label).display === 'none';
  });

  await page.mouse.move(820, 350);
  await page.keyboard.press('w');
  await page.mouse.move(960, 350);
  await page.mouse.wheel(0, 100);
  const whitePreview = await page.evaluate(() => {
    const label = document.querySelector('.gravity-well-radius-label');
    return {
      draft: { ...window.particleInstance.gravityWellDraft },
      particleCount: window.particleInstance.o.length,
      labelText: label?.textContent,
      labelVisible: !!label && getComputedStyle(label).display !== 'none'
    };
  });
  const whiteDraft = whitePreview.draft;
  await page.mouse.click(960, 350);
  const whiteLabelHiddenAfterCommit = await page.evaluate(() => {
    const label = document.querySelector('.gravity-well-radius-label');
    return !!label && getComputedStyle(label).display === 'none';
  });
  await waitForFrames(page, 4);

  const placed = await page.evaluate(() => {
    const pn = window.particleInstance;
    const diagnostics = pn.glRenderer.gravityWellRenderer.diagnostics;
    return {
      wells: pn.gravityWells.map(well => ({ ...well })),
      selectedId: pn.selectedGravityWellId,
      fbo: {
        sceneWidth: diagnostics.sceneWidth,
        sceneHeight: diagnostics.sceneHeight,
        fieldWidth: diagnostics.fieldWidth,
        fieldHeight: diagnostics.fieldHeight
      },
      backing: { width: pn.glRenderer.canvas.width, height: pn.glRenderer.canvas.height },
      pointBufferCreates: diagnostics.pointBufferCreates,
      renderPasses: diagnostics.renderPasses
    };
  });

  const rulerOriginalPositions = await page.evaluate(() => {
    const pn = window.particleInstance;
    const positions = pn.gravityWells.map(well => ({ id: well.id, x: well.x, y: well.y }));
    pn.updateGravityWell(pn.gravityWells[0].id, { x: 300, y: 360 });
    pn.updateGravityWell(pn.gravityWells[1].id, { x: 900, y: 360 });
    return positions;
  });
  await page.mouse.move(600, 360);
  await page.keyboard.press('b');
  await waitForFrames(page, 2);
  const centeredRulers = await page.evaluate(() => {
    const pn = window.particleInstance;
    const context = pn._gravityWellOverlayContext;
    const dpr = window.devicePixelRatio || 1;
    const sampleAlpha = (x, y) => {
      const radius = Math.max(1, Math.ceil(dpr));
      const pixelX = Math.round(x * dpr);
      const pixelY = Math.round(y * dpr);
      const image = context.getImageData(pixelX - radius, pixelY - radius, radius * 2 + 1, radius * 2 + 1).data;
      let alpha = 0;
      for (let i = 3; i < image.length; i += 4) alpha = Math.max(alpha, image[i]);
      return alpha;
    };
    return {
      measurements: pn._gravityWellMeasurements.map(measurement => ({ ...measurement })),
      overlayVisible: pn._gravityWellOverlay?.style.display === 'block',
      paintedPixels: {
        lineAlpha: sampleAlpha(375, 360),
        tickAlpha: sampleAlpha(300, 357),
        labelAlpha: sampleAlpha(450, 360)
      }
    };
  });
  if (options.screenshotDir) {
    await page.screenshot({ path: path.join(options.screenshotDir, 'distance-rulers.png') });
  }
  await page.mouse.move(650, 360);
  await waitForFrames(page, 2);
  const movedRulers = await page.evaluate(() =>
    window.particleInstance._gravityWellMeasurements.map(measurement => ({ ...measurement }))
  );
  await page.keyboard.press('Escape');
  await waitForFrames(page, 2);
  const cancelledRulers = await page.evaluate(() => ({
    count: window.particleInstance._gravityWellMeasurements.length,
    overlayHidden: window.particleInstance._gravityWellOverlay?.style.display === 'none'
  }));
  await page.evaluate(positions => {
    const pn = window.particleInstance;
    positions.forEach(position => pn.updateGravityWell(position.id, position));
  }, rulerOriginalPositions);

  const particleCountBeforeDoubleClick = await page.evaluate(() => {
    const pn = window.particleInstance;
    pn.updateGravityWell(pn.gravityWells[0].id, { strength: 100 });
    return pn.o.length;
  });
  await page.mouse.dblclick(420, 250);
  await waitForFrames(page, 2);
  const blackReversed = await page.evaluate(() => {
    const pn = window.particleInstance;
    const well = pn.gravityWells[0];
    const visible = pn._frameGravityWells.find(candidate => candidate.id === well.id);
    return {
      strength: well.strength,
      visualType: visible?.type,
      innerColor: visible?.innerColor,
      outerColor: visible?.outerColor,
      selected: pn.selectedGravityWellId === well.id,
      particleCount: pn.o.length,
      forcesClear: !pn.attractionForce && !pn.repulsionForce,
      cursorCaptureInactive: !pn._cursorCaptureActive && !pn._cursorCapturePending
    };
  });
  await page.mouse.dblclick(420, 250);
  await waitForFrames(page, 2);
  const blackRestored = await page.evaluate(() => {
    const pn = window.particleInstance;
    const well = pn.gravityWells[0];
    const visible = pn._frameGravityWells.find(candidate => candidate.id === well.id);
    return { strength: well.strength, visualType: visible?.type };
  });

  await page.evaluate(() => {
    const pn = window.particleInstance;
    pn.updateGravityWell(pn.gravityWells[1].id, { strength: 25 });
  });
  await page.mouse.dblclick(960, 350);
  await waitForFrames(page, 2);
  const whiteReversed = await page.evaluate(() => {
    const pn = window.particleInstance;
    const well = pn.gravityWells[1];
    const visible = pn._frameGravityWells.find(candidate => candidate.id === well.id);
    return {
      strength: well.strength,
      visualType: visible?.type,
      innerColor: visible?.innerColor,
      outerColor: visible?.outerColor
    };
  });
  await page.mouse.dblclick(960, 350);
  await page.evaluate(() => {
    const pn = window.particleInstance;
    pn.updateGravityWell(pn.gravityWells[0].id, { strength: 12 });
    pn.updateGravityWell(pn.gravityWells[1].id, { strength: 12 });
  });

  const capturePoint = { x: 720, y: 540 };
  await page.mouse.dblclick(capturePoint.x, capturePoint.y, { delay: 20 });
  await page.waitForTimeout(160);
  const quickDoubleClickCapture = await page.evaluate(() => ({
    active: window.particleInstance._cursorCaptureActive,
    pending: window.particleInstance._cursorCapturePending
  }));

  const aGatherState = await page.evaluate(point => {
    const pn = window.particleInstance;
    if (pn.p) { pn.p.x = point.x; pn.p.y = point.y; }
    for (let i = 0; i < pn.numParticles; i++) {
      pn.posX[i] = 80;
      pn.posY[i] = 80;
      pn.velX[i] = 0;
      pn.velY[i] = 0;
    }
    pn._syncObjectsFromSoA();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    const distances = Array.from({ length: pn.numParticles }, (_, index) =>
      Math.hypot(pn.posX[index] - point.x, pn.posY[index] - point.y)
    );
    const activeDuringKey = pn._gatherActive;
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', bubbles: true }));
    return {
      activeDuringKey,
      activeAfterKey: pn._gatherActive,
      maxDistance: Math.max(...distances),
      radius: pn.options.gatherRadius
    };
  }, capturePoint);

  const captureSetup = await page.evaluate(point => {
    const pn = window.particleInstance;
    const insideCount = Math.min(12, pn.numParticles);
    const initialPositions = [];
    for (let i = 0; i < pn.numParticles; i++) {
      const angle = i * 2.399963229728653;
      const distance = i < insideCount ? 55 : 145;
      const x = point.x + Math.cos(angle) * distance;
      const y = point.y + Math.sin(angle) * distance;
      pn.posX[i] = x;
      pn.posY[i] = y;
      pn.velX[i] = 0;
      pn.velY[i] = 0;
      initialPositions.push({ x, y });
    }
    pn._syncObjectsFromSoA();
    pn.options.velocity = 0;
    pn.options.cursorCaptureForceMultiplier = 1.5;
    pn.options.cursorCaptureMaxSpeed = 0.75;
    return {
      count: pn.numParticles,
      radius: pn.options.gatherRadius,
      insideCount,
      initialPositions,
      initialOutsideMeanDistance: 145
    };
  }, capturePoint);
  await page.mouse.move(capturePoint.x, capturePoint.y);
  await page.mouse.down({ button: 'left' });
  await page.waitForTimeout(30);
  await page.mouse.up({ button: 'left' });
  await page.waitForTimeout(40);
  await page.mouse.down({ button: 'left' });
  await page.waitForFunction(() => window.particleInstance._cursorCaptureActive);
  const captureActivated = await page.evaluate(({ point, setup }) => {
    const pn = window.particleInstance;
    const capturedCount = pn._cursorCapturedParticles.reduce((total, captured) => total + captured, 0);
    const displacements = setup.initialPositions.map((position, index) =>
      Math.hypot(pn.posX[index] - position.x, pn.posY[index] - position.y)
    );
    const uncapturedDistances = setup.initialPositions
      .map((_, index) => index)
      .filter(index => !pn._cursorCapturedParticles[index])
      .map(index => Math.hypot(pn.posX[index] - point.x, pn.posY[index] - point.y));
    return {
      active: pn._cursorCaptureActive,
      pending: pn._cursorCapturePending,
      point: pn._cursorCapturePoint && { ...pn._cursorCapturePoint },
      capturedCount,
      uncapturedCount: pn.numParticles - capturedCount,
      maxActivationDisplacement: Math.max(...displacements),
      meanUncapturedDistance: uncapturedDistances.reduce((sum, distance) => sum + distance, 0) / uncapturedDistances.length,
      radius: pn.options.gatherRadius,
      forceMultiplier: pn.options.cursorCaptureForceMultiplier,
      count: pn.numParticles,
      cursorActive: pn.canvas.classList.contains('cursor-capture-active')
    };
  }, { point: capturePoint, setup: captureSetup });
  await waitForFrames(page, 12);
  const capturePulled = await page.evaluate(point => {
    const pn = window.particleInstance;
    const distances = Array.from({ length: pn.numParticles }, (_, index) => index)
      .filter(index => !pn._cursorCapturedParticles[index])
      .map(index => Math.hypot(pn.posX[index] - point.x, pn.posY[index] - point.y));
    return {
      meanUncapturedDistance: distances.reduce((sum, distance) => sum + distance, 0) / distances.length,
      uncapturedCount: distances.length
    };
  }, capturePoint);
  const captureOpposition = await page.evaluate(point => {
    const pn = window.particleInstance;
    const well = pn.addGravityWell('white', point.x - 360, point.y, 120);
    well.strength = 1000000000;
    window.__captureWellId = well.id;
    pn.gravityWellAccelerationCapped = false;
    return { wellId: well.id, strength: well.strength };
  }, capturePoint);
  const movedCapturePoint = { x: 1100, y: 120 };
  await page.mouse.move(movedCapturePoint.x, movedCapturePoint.y);
  await waitForFrames(page, 3);
  const captureMoved = await page.evaluate(point => {
    const pn = window.particleInstance;
    const capturedIndices = Array.from({ length: pn.numParticles }, (_, index) => index)
      .filter(index => pn._cursorCapturedParticles[index]);
    const capturedDistances = capturedIndices.map(index =>
      Math.hypot(pn.posX[index] - point.x, pn.posY[index] - point.y));
    return {
      point: pn._cursorCapturePoint && { ...pn._cursorCapturePoint },
      maxCapturedDistance: Math.max(...capturedDistances),
      capturedCount: capturedIndices.length,
      count: pn.numParticles,
      opposingWellStrength: pn.getGravityWell(window.__captureWellId)?.strength,
      gravityCapDisabled: !pn.gravityWellAccelerationCapped
    };
  }, movedCapturePoint);
  await page.mouse.up({ button: 'left' });
  const captureReleased = await page.evaluate(wellId => {
    const pn = window.particleInstance;
    const state = {
      active: pn._cursorCaptureActive,
      pending: pn._cursorCapturePending,
      point: pn._cursorCapturePoint,
      capturedParticles: pn._cursorCapturedParticles,
      force: pn.repulsionForce,
      cursorActive: pn.canvas.classList.contains('cursor-capture-active')
    };
    pn.removeGravityWell(wellId);
    pn.gravityWellAccelerationCapped = true;
    pn.options.cursorCaptureForceMultiplier = 1;
    pn.options.cursorCaptureMaxSpeed = 2.64;
    pn.options.velocity = 0.66;
    return state;
  }, captureOpposition.wellId);

  const auraWheelTarget = await page.evaluate(() => {
    const pn = window.particleInstance;
    const well = pn.gravityWells[0];
    pn._hideGravityWellStrengthLabel();
    pn.__auraWheelParticleAdjustments = 0;
    pn.adjustParticleCount = function() { this.__auraWheelParticleAdjustments++; };
    return {
      id: well.id,
      x: well.x + well.radius * 0.4,
      y: well.y,
      strength: well.strength,
      particleCount: pn.o.length
    };
  });
  await page.mouse.move(auraWheelTarget.x, auraWheelTarget.y);
  await page.mouse.wheel(0, -100);
  const auraWheelState = await page.evaluate(target => {
    const pn = window.particleInstance;
    const label = document.querySelector('.gravity-well-strength-label');
    const state = {
      strength: pn.getGravityWell(target.id).strength,
      particleCount: pn.o.length,
      particleAdjustments: pn.__auraWheelParticleAdjustments,
      forceLabelVisible: label?.classList.contains('is-visible')
    };
    delete pn.adjustParticleCount;
    delete pn.__auraWheelParticleAdjustments;
    return state;
  }, auraWheelTarget);

  const particleCountBeforeWellWheel = await page.evaluate(() => window.particleInstance.o.length);
  await page.mouse.move(420, 250);
  await page.mouse.wheel(0, -100);
  await waitForFrames(page, 2);
  const wheelIncreased = await page.evaluate(() => {
    const pn = window.particleInstance;
    const well = pn.gravityWells[0];
    const label = document.querySelector('.gravity-well-strength-label');
    return {
      strength: well.strength,
      selectedId: pn.selectedGravityWellId,
      wellId: well.id,
      particleCount: pn.o.length,
      visualSpeed: pn.glRenderer.gravityWellRenderer.diagnostics.maxVisualSpeed,
      forceLabel: label?.textContent,
      forceLabelType: label?.dataset.force,
      forceLabelVisible: label?.classList.contains('is-visible')
    };
  });
  await page.mouse.wheel(0, 100);
  await waitForFrames(page, 2);
  const wheelDecreased = await page.evaluate(() => window.particleInstance.gravityWells[0].strength);
  await page.mouse.move(960, 350);
  await page.mouse.wheel(0, -100);
  const whiteForceLabel = await page.evaluate(() => {
    const label = document.querySelector('.gravity-well-strength-label');
    return {
      text: label?.textContent,
      type: label?.dataset.force,
      visible: label?.classList.contains('is-visible')
    };
  });
  await page.mouse.wheel(0, 100);
  await page.mouse.move(420, 250);
  await page.evaluate(() => {
    const pn = window.particleInstance;
    pn.updateGravityWell(pn.gravityWells[0].id, { strength: 40 });
  });
  await page.mouse.wheel(0, -100);
  await waitForFrames(page, 2);
  const wheelAboveFormerLimit = await page.evaluate(() => ({
    strength: window.particleInstance.gravityWells[0].strength,
    visualSpeed: window.particleInstance.glRenderer.gravityWellRenderer.diagnostics.maxVisualSpeed
  }));
  await page.evaluate(() => {
    const pn = window.particleInstance;
    pn.updateGravityWell(pn.gravityWells[0].id, { strength: 1 });
  });
  await page.mouse.wheel(0, 100);
  await page.mouse.wheel(0, 100);
  await waitForFrames(page, 2);
  const wheelAtZero = await page.evaluate(() => {
    const pn = window.particleInstance;
    const visibleWell = pn._frameGravityWells.find(well => well.id === pn.gravityWells[0].id);
    return {
      strength: pn.gravityWells[0].strength,
      visualType: visibleWell?.type,
      visualInnerColor: visibleWell?.innerColor,
      visualOuterColor: visibleWell?.outerColor
    };
  });
  await page.evaluate(() => {
    const pn = window.particleInstance;
    pn.updateGravityWell(pn.gravityWells[0].id, { strength: 12 });
  });

  const dragBefore = await page.evaluate(() => {
    const pn = window.particleInstance;
    const well = pn.gravityWells[0];
    return { id: well.id, x: well.x, y: well.y, radius: well.radius, strength: well.strength, particleCount: pn.o.length };
  });
  await page.mouse.move(dragBefore.x, dragBefore.y);
  await page.mouse.down({ button: 'left' });
  await page.mouse.wheel(0, -100);
  await page.mouse.move(dragBefore.x + 80, dragBefore.y + 50);
  await waitForFrames(page, 2);
  const dragHeld = await page.evaluate(id => {
    const pn = window.particleInstance;
    const well = pn.getGravityWell(id);
    const radiusLabel = document.querySelector('.gravity-well-radius-label');
    const strengthLabel = document.querySelector('.gravity-well-strength-label');
    return {
      dragId: pn._gravityWellDrag?.id,
      selectedId: pn.selectedGravityWellId,
      x: well.x,
      y: well.y,
      radius: well.radius,
      strength: well.strength,
      particleCount: pn.o.length,
      draggingCursor: pn.canvas.classList.contains('gravity-well-dragging'),
      radiusLabel: radiusLabel?.textContent,
      radiusLabelVisible: !!radiusLabel && getComputedStyle(radiusLabel).display !== 'none',
      strengthLabelVisible: !!strengthLabel && strengthLabel.classList.contains('is-visible'),
      measurementCount: pn._gravityWellMeasurements.length,
      attractionForce: pn.attractionForce,
      repulsionForce: pn.repulsionForce
    };
  }, dragBefore.id);
  await page.evaluate(id => window.particleInstance.updateGravityWell(id, { radius: 500 }), dragBefore.id);
  await page.mouse.wheel(0, -100);
  const heldRadiusMaximum = await page.evaluate(id => ({
    radius: window.particleInstance.getGravityWell(id).radius,
    label: document.querySelector('.gravity-well-radius-label')?.textContent
  }), dragBefore.id);
  await page.evaluate(id => window.particleInstance.updateGravityWell(id, { radius: 24 }), dragBefore.id);
  await page.mouse.wheel(0, 100);
  const heldRadiusMinimum = await page.evaluate(id => ({
    radius: window.particleInstance.getGravityWell(id).radius,
    label: document.querySelector('.gravity-well-radius-label')?.textContent
  }), dragBefore.id);
  await page.evaluate(({ id, radius }) => window.particleInstance.updateGravityWell(id, { radius }), {
    id: dragBefore.id,
    radius: dragHeld.radius
  });
  await waitForFrames(page, 2);
  if (options.screenshotDir) {
    await page.screenshot({ path: path.join(options.screenshotDir, 'grabbed-wheel-radius.png') });
  }
  await page.mouse.up({ button: 'left' });
  await waitForFrames(page, 2);
  const dragReleased = await page.evaluate(id => {
    const pn = window.particleInstance;
    const well = pn.getGravityWell(id);
    const radiusLabel = document.querySelector('.gravity-well-radius-label');
    return {
      drag: pn._gravityWellDrag,
      x: well.x,
      y: well.y,
      radius: well.radius,
      strength: well.strength,
      draggingCursor: pn.canvas.classList.contains('gravity-well-dragging'),
      radiusLabelHidden: !!radiusLabel && getComputedStyle(radiusLabel).display === 'none',
      measurementCount: pn._gravityWellMeasurements.length
    };
  }, dragBefore.id);
  await page.mouse.wheel(0, -100);
  const dragAfterReleasedWheel = await page.evaluate(id => {
    const well = window.particleInstance.getGravityWell(id);
    return { radius: well.radius, strength: well.strength };
  }, dragBefore.id);
  await page.evaluate(({ id, x, y, radius, strength }) => {
    window.particleInstance.updateGravityWell(id, { x, y, radius, strength });
  }, dragBefore);

  await page.keyboard.press('Escape');
  if (options.screenshotDir) {
    await page.screenshot({ path: path.join(options.screenshotDir, 'desktop-black-white.png') });
  }

  await page.mouse.click(420, 250);
  const coreSelection = await page.evaluate(() => ({
    selectedType: window.particleInstance.getSelectedGravityWell()?.type,
    attractionForce: window.particleInstance.attractionForce,
    repulsionForce: window.particleInstance.repulsionForce
  }));
  if (options.screenshotDir) {
    await page.screenshot({ path: path.join(options.screenshotDir, 'desktop-selected-aura.png') });
  }
  await page.keyboard.press('Escape');
  const deselected = await page.evaluate(() => window.particleInstance.selectedGravityWellId === null);

  const countBeforeCancel = await page.evaluate(() => window.particleInstance.gravityWells.length);
  await page.mouse.move(500, 180);
  await page.keyboard.press('b');
  const cancelLabelBeforeEscape = await page.evaluate(() => {
    const label = document.querySelector('.gravity-well-radius-label');
    return {
      text: label?.textContent,
      visible: !!label && getComputedStyle(label).display !== 'none'
    };
  });
  await page.keyboard.press('Escape');
  const cancelState = await page.evaluate(() => ({
    count: window.particleInstance.gravityWells.length,
    draft: window.particleInstance.gravityWellDraft,
    labelHidden: getComputedStyle(document.querySelector('.gravity-well-radius-label')).display === 'none'
  }));

  await page.keyboard.press('w');
  await page.mouse.click(540, 180, { button: 'right' });
  const rightClickCancelState = await page.evaluate(() => ({
    count: window.particleInstance.gravityWells.length,
    draft: window.particleInstance.gravityWellDraft,
    attractionForce: window.particleInstance.attractionForce,
    repulsionForce: window.particleInstance.repulsionForce,
    labelHidden: getComputedStyle(document.querySelector('.gravity-well-radius-label')).display === 'none'
  }));

  const gravityCapInitial = await page.evaluate(() => window.particleInstance.gravityWellAccelerationCapped);
  await page.keyboard.press('l');
  const gravityCapUnlimited = await page.evaluate(() => window.particleInstance.gravityWellAccelerationCapped);
  await page.keyboard.press('l');
  const gravityCapRestored = await page.evaluate(() => window.particleInstance.gravityWellAccelerationCapped);

  const countBeforeDelete = await page.evaluate(() => {
    const pn = window.particleInstance;
    pn.addGravityWell('white', 1100, 600, 90);
    return pn.gravityWells.length;
  });
  await page.mouse.move(1100, 600);
  await page.keyboard.press('Delete');
  const deleteState = await page.evaluate(() => ({
    count: window.particleInstance.gravityWells.length,
    hoveredWellGone: !window.particleInstance.gravityWells.some(well => well.x === 1100 && well.y === 600)
  }));

  await page.evaluate(() => {
    window.__gravityBenchmarkStarts = 0;
    window._benchmarkRunner = { start() { window.__gravityBenchmarkStarts++; } };
  });
  await page.keyboard.press('Shift+B');
  const benchmarkState = await page.evaluate(() => ({
    starts: window.__gravityBenchmarkStarts,
    draft: window.particleInstance.gravityWellDraft,
    count: window.particleInstance.gravityWells.length
  }));

  await page.mouse.move(420, 250);
  const bootstrapColorBefore = await page.evaluate(() => {
    const container = document.getElementById('tp-container');
    return {
      wells: window.particleInstance.gravityWells.map(well => ({ ...well })),
      selectedId: window.particleInstance.selectedGravityWellId,
      controlsVisible: !!container && container.style.display !== 'none'
    };
  });
  await page.evaluate(() => {
    const values = [1 / 3, 0];
    window.__gravityOriginalRandom = Math.random;
    window.__gravityColorRandomCalls = 0;
    Math.random = () => {
      window.__gravityColorRandomCalls++;
      return values.length ? values.shift() : 0.5;
    };
  });
  await page.keyboard.press('c');
  await page.evaluate(() => {
    const well = window.particleInstance.gravityWells[0];
    const colorsAfterFirstPress = { innerColor: well.innerColor, outerColor: well.outerColor };
    window.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'c', repeat: true, bubbles: true, cancelable: true
    }));
    window.__gravityRepeatPreservedColors = well.innerColor === colorsAfterFirstPress.innerColor &&
      well.outerColor === colorsAfterFirstPress.outerColor;
  });
  await waitForFrames(page, 2);
  const bootstrapColorState = await page.evaluate(before => {
    const pn = window.particleInstance;
    const wells = pn.gravityWells.map(well => ({ ...well }));
    const container = document.getElementById('tp-container');
    const result = {
      target: wells[0],
      other: wells[1],
      targetBefore: before.wells[0],
      otherBefore: before.wells[1],
      selectedId: pn.selectedGravityWellId,
      controlsVisible: !!container && container.style.display !== 'none',
      randomCalls: window.__gravityColorRandomCalls,
      repeatPreservedColors: window.__gravityRepeatPreservedColors
    };
    Math.random = window.__gravityOriginalRandom;
    delete window.__gravityOriginalRandom;
    delete window.__gravityColorRandomCalls;
    delete window.__gravityRepeatPreservedColors;
    return result;
  }, bootstrapColorBefore);

  await page.mouse.move(40, 40);
  await page.keyboard.press('c');
  await page.waitForFunction(() => window.particleSettingsUi && document.getElementById('tp-container')?.style.display !== 'none');
  await page.getByText('Wells', { exact: true }).click();
  const panelText = await page.locator('#tp-container').textContent();
  const sliderControls = await page.evaluate(() => {
    const expectedLabels = [
      'Max Color Change Distance', 'Distance Cycling Speed', 'Line Color Cycling Speed',
      'Line Connection Distance', 'Trail Fade', 'Jitter Segments', 'Jitter Amplitude',
      'Size', 'Particle Color Cycling Speed', 'Interaction Distance', 'Attraction Force',
      'Repulsion Force', 'Maximum Acceleration', 'Global Force', 'Particle Spin', 'Radius',
      'Strength', 'Capture / Gather Radius', 'Capture Pull', 'Captured Max Speed', 'Speed',
      'Curve Intensity', 'Noise Speed', 'Highlight Distance', 'Repulsion Radius (px)',
      'Repulsion Intensity', 'Attraction Radius (px)', 'Attraction Intensity'
    ];
    const expected = new Set(expectedLabels);
    const controls = {};
    function visit(api) {
      for (const child of Array.from(api.children || [])) visit(child);
      for (const tabPage of Array.from(api.pages || [])) visit(tabPage);
      if (!expected.has(api.label)) return;
      const slider = api.controller?.valueController?.sliderC_;
      controls[api.label] = slider ? {
        min: slider.props.get('min'),
        max: slider.props.get('max')
      } : null;
    }
    visit(window.particleSettingsUi.pane);
    return { expectedLabels, controls };
  });
  if (options.screenshotDir) {
    await page.screenshot({ path: path.join(options.screenshotDir, 'desktop-wells-tab.png') });
  }
  await page.evaluate(() => {
    const pn = window.particleInstance;
    pn.selectGravityWell(pn.gravityWells[0].id);
  });
  await page.waitForTimeout(50);
  const synchronized = await page.evaluate(() => {
    const selected = window.particleInstance.getSelectedGravityWell();
    const params = window.particleSettingsUi.gravityWellParams;
    return selected && params.radius === selected.radius && params.strength === selected.strength &&
      params.innerColor === selected.innerColor && params.outerColor === selected.outerColor;
  });

  await page.evaluate(() => {
    const pn = window.particleInstance;
    const well = pn.gravityWells[1];
    pn.selectGravityWell(well.id);
    pn.updateGravityWell(well.id, { x: 700, y: 350 });
  });
  await page.waitForTimeout(30);
  await page.mouse.move(700, 350);
  await page.evaluate(() => {
    const values = [0.75, 0.5];
    window.__gravityFullColorBefore = { ...window.particleInstance.getSelectedGravityWell() };
    window.__gravityOriginalRandom = Math.random;
    window.__gravityColorRandomCalls = 0;
    Math.random = () => {
      window.__gravityColorRandomCalls++;
      return values.length ? values.shift() : 0.5;
    };
  });
  await page.keyboard.press('c');
  await page.waitForTimeout(50);
  const fullPaneColorState = await page.evaluate(() => {
    const pn = window.particleInstance;
    const selected = pn.getSelectedGravityWell();
    const params = window.particleSettingsUi.gravityWellParams;
    const result = {
      well: selected && { ...selected },
      before: window.__gravityFullColorBefore,
      params: { innerColor: params.innerColor, outerColor: params.outerColor },
      controlsVisible: document.getElementById('tp-container')?.style.display !== 'none',
      randomCalls: window.__gravityColorRandomCalls
    };
    Math.random = window.__gravityOriginalRandom;
    delete window.__gravityOriginalRandom;
    delete window.__gravityColorRandomCalls;
    delete window.__gravityFullColorBefore;
    return result;
  });
  await page.mouse.move(40, 40);
  await page.keyboard.press('c');
  const fullPaneHidden = await page.evaluate(() => document.getElementById('tp-container')?.style.display === 'none');
  await page.keyboard.press('c');
  const fullPaneVisible = await page.evaluate(() => document.getElementById('tp-container')?.style.display !== 'none');

  const appliedWellSettings = await page.evaluate(() => {
    const pn = window.particleInstance;
    const params = window.particleSettingsUi.params;
    Object.assign(params, {
      gravityWellAccelerationCapped: true,
      gravityWellAccelerationLimit: 0.4,
      gravityWellForceMultiplier: 2.5,
      gravityWellSpin: -0.35,
      gatherRadius: 135,
      cursorCaptureForceMultiplier: 1.8,
      cursorCaptureMaxSpeed: 3.2
    });
    window.applyParamsToNetwork(pn, params);
    return {
      capped: pn.gravityWellAccelerationCapped,
      accelerationLimit: pn.gravityWellAccelerationLimit,
      forceMultiplier: pn.options.gravityWellForceMultiplier,
      spin: pn.options.gravityWellSpin,
      gatherRadius: pn.options.gatherRadius,
      capturePull: pn.options.cursorCaptureForceMultiplier,
      captureMaxSpeed: pn.options.cursorCaptureMaxSpeed
    };
  });
  await page.keyboard.press('l');
  await page.waitForTimeout(30);
  const panelCapUnlimited = await page.evaluate(() => ({
    runtime: window.particleInstance.gravityWellAccelerationCapped,
    control: window.particleSettingsUi.params.gravityWellAccelerationCapped
  }));
  await page.keyboard.press('l');
  await page.waitForTimeout(30);
  const panelCapRestored = await page.evaluate(() => ({
    runtime: window.particleInstance.gravityWellAccelerationCapped,
    control: window.particleSettingsUi.params.gravityWellAccelerationCapped,
    limit: window.particleInstance.gravityWellAccelerationLimit
  }));

  const strengthBeforePanelReverse = await page.evaluate(() => window.particleInstance.getSelectedGravityWell()?.strength);
  await page.getByRole('button', { name: 'Reverse Selected' }).click();
  const strengthAfterPanelReverse = await page.evaluate(() => window.particleInstance.getSelectedGravityWell()?.strength);
  await page.getByRole('button', { name: 'Reverse Selected' }).click();
  const strengthAfterPanelRestore = await page.evaluate(() => window.particleInstance.getSelectedGravityWell()?.strength);

  await page.getByRole('button', { name: 'Reposition/Resize' }).click();
  await page.mouse.move(360, 300);
  await page.mouse.down();
  await page.mouse.move(480, 300);
  await waitForFrames(page, 2);
  const repositionRulers = await page.evaluate(() => ({
    count: window.particleInstance._gravityWellMeasurements.length,
    targetIds: window.particleInstance._gravityWellMeasurements.map(measurement => measurement.targetId),
    editingId: window.particleInstance.gravityWellDraft?.editId
  }));
  await page.mouse.up();
  const repositioned = await page.evaluate(() => {
    const well = window.particleInstance.getSelectedGravityWell();
    return well ? { x: well.x, y: well.y, radius: well.radius } : null;
  });

  await page.getByRole('button', { name: 'Remove Selected' }).click();
  const afterRemove = await page.evaluate(() => window.particleInstance.gravityWells.length);
  await page.getByRole('button', { name: 'Clear All' }).click();
  const afterClear = await page.evaluate(() => window.particleInstance.gravityWells.length);

  await page.evaluate(() => window.particleInstance.addGravityWell('black', 500, 300, 120));
  await page.keyboard.press('d');
  await page.waitForFunction(() => window.particleInstance.gravityWells.length === 0);
  const afterReset = await page.evaluate(() => {
    const pn = window.particleInstance;
    return {
      wellCount: pn.gravityWells.length,
      capped: pn.gravityWellAccelerationCapped,
      accelerationLimit: pn.gravityWellAccelerationLimit,
      forceMultiplier: pn.options.gravityWellForceMultiplier,
      spin: pn.options.gravityWellSpin,
      gatherRadius: pn.options.gatherRadius,
      capturePull: pn.options.cursorCaptureForceMultiplier,
      captureMaxSpeed: pn.options.cursorCaptureMaxSpeed
    };
  });

  const physics = await page.evaluate(() => {
    const pn = window.particleInstance;
    if (pn._rafId != null) cancelAnimationFrame(pn._rafId);
    pn._rafId = null;
    pn._rafActive = false;
    pn.options.velocity = 0;
    pn.options.interactive = false;
    pn.options.curvedDrift = false;
    pn.options.boundaryMode = 'none';
    pn.o = pn.o.slice(0, 1);
    pn._initSoAFromObjects(1);
    const center = { x: 640, y: 360 };

    function setParticle(x, y) {
      pn.posX[0] = x; pn.posY[0] = y; pn.velX[0] = 0; pn.velY[0] = 0;
      pn.o[0].x = x; pn.o[0].y = y; pn.o[0].velocity.x = 0; pn.o[0].velocity.y = 0;
    }
    function setWells(wells) {
      pn.gravityWells = wells.map((well, index) => ({
        id: `physics-${index}`,
        type: well.type,
        x: well.x,
        y: well.y,
        radius: well.radius || 120,
        strength: well.strength == null ? 12 : well.strength,
        innerColor: '#ff8080',
        outerColor: '#3633ff'
      }));
    }
    function sample(wells, x, y) {
      setWells(wells); setParticle(x, y); pn._updateSoA();
      return { x: pn.posX[0], y: pn.posY[0], vx: pn.velX[0], vy: pn.velY[0] };
    }

    const black = sample([{ type: 'black', ...center }], center.x + 200, center.y);
    const white = sample([{ type: 'white', ...center }], center.x + 200, center.y);
    const invertedBlack = sample([{ type: 'black', ...center, strength: -12 }], center.x + 200, center.y);
    const invertedWhite = sample([{ type: 'white', ...center, strength: -12 }], center.x + 200, center.y);
    const a = { type: 'black', x: 570, y: 310, radius: 160, strength: 1 };
    const b = { type: 'white', x: 720, y: 420, radius: 140, strength: 1 };
    const onlyA = sample([a], 1000, 600);
    const onlyB = sample([b], 1000, 600);
    const together = sample([a, b], 1000, 600);

    pn.gravityWellAccelerationCapped = false;
    pn.options.gravityWellSpin = 0;
    pn.options.gravityWellForceMultiplier = 1;
    const globalForceOne = sample([{ type: 'black', ...center }], center.x + 200, center.y);
    pn.options.gravityWellForceMultiplier = 2;
    const globalForceTwo = sample([{ type: 'black', ...center }], center.x + 200, center.y);
    pn.options.gravityWellForceMultiplier = 0;
    const globalForceZero = sample([{ type: 'black', ...center }], center.x + 200, center.y);
    pn.options.gravityWellForceMultiplier = 1;
    pn.options.gravityWellSpin = 0;
    const spinZero = sample([{ type: 'black', ...center }], center.x + 200, center.y);
    pn.options.gravityWellSpin = 0.4;
    const spinPositive = sample([{ type: 'black', ...center }], center.x + 200, center.y);
    pn.options.gravityWellSpin = -0.4;
    const spinNegative = sample([{ type: 'black', ...center }], center.x + 200, center.y);
    pn.options.gravityWellSpin = 0.2;

    const strongWell = [{ type: 'black', ...center, radius: 150, strength: 10000 }];
    pn.gravityWellAccelerationCapped = true;
    pn.gravityWellAccelerationLimit = 0.4;
    const cappedStrong = sample(strongWell, center.x + 220, center.y);
    pn.gravityWellAccelerationCapped = false;
    const uncappedStrong = sample(strongWell, center.x + 220, center.y);
    pn.gravityWellAccelerationCapped = true;
    pn.gravityWellAccelerationLimit = 1.5;

    setWells([]);
    pn.options.interactive = true;
    pn.options.gatherRadius = 100;
    pn.options.cursorCaptureMaxSpeed = 100;
    pn._cursorCaptureActive = true;
    pn._cursorCapturePoint = { ...center };
    pn._cursorCaptureAppliedPoint = { ...center };
    pn.repulsionForce = { ...center };
    pn.options.cursorCaptureForceMultiplier = 0;
    setParticle(center.x + 80, center.y);
    pn._updateSoA();
    const capturePullZero = { vx: pn.velX[0], vy: pn.velY[0] };
    pn.options.cursorCaptureForceMultiplier = 2;
    setParticle(center.x + 80, center.y);
    pn._updateSoA();
    const capturePullTwo = { vx: pn.velX[0], vy: pn.velY[0] };
    pn._cursorCaptureActive = false;
    pn._cursorCapturePoint = null;
    pn._cursorCaptureAppliedPoint = null;
    pn.repulsionForce = null;
    pn.options.cursorCaptureForceMultiplier = 1;
    pn.options.cursorCaptureMaxSpeed = 2.64;
    pn.options.interactive = false;

    setWells([{ type: 'black', ...center }]);
    setParticle(center.x + 5, center.y + 5);
    const countBefore = pn.numParticles;
    const coreStart = { x: pn.posX[0], y: pn.posY[0] };
    pn._updateSoA();
    const coreTraversal = {
      distanceFromCenter: Math.hypot(pn.posX[0] - center.x, pn.posY[0] - center.y),
      distanceFromStart: Math.hypot(pn.posX[0] - coreStart.x, pn.posY[0] - coreStart.y),
      finite: [pn.posX[0], pn.posY[0], pn.velX[0], pn.velY[0]].every(Number.isFinite),
      countStable: pn.numParticles === countBefore && pn.posX.length === countBefore
    };
    setParticle(center.x, center.y);
    pn._updateSoA();
    const exactCenterTraversal = {
      distance: Math.hypot(pn.posX[0] - center.x, pn.posY[0] - center.y),
      finite: [pn.posX[0], pn.posY[0], pn.velX[0], pn.velY[0]].every(Number.isFinite),
      countStable: pn.numParticles === countBefore
    };

    const flowSize = 64;
    pn.o = Array.from({ length: flowSize }, (_, index) => {
      const angle = index * 2.399963229728653;
      const distance = 45 + (index % 11) * 19;
      return {
        x: center.x + Math.cos(angle) * distance,
        y: center.y + Math.sin(angle) * distance,
        velocity: { x: 0, y: 0 },
        size: 2
      };
    });
    pn._initSoAFromObjects(flowSize);
    setWells([{ type: 'black', ...center, radius: 150, strength: 12 }]);
    for (let frame = 0; frame < 180; frame++) {
      pn._lastUpdateTime = frame * (1000 / 60);
      pn._updateSoA();
    }
    const flowDistances = Array.from({ length: flowSize }, (_, index) =>
      Math.hypot(pn.posX[index] - center.x, pn.posY[index] - center.y)
    );
    const naturalFlow = {
      minDistance: Math.min(...flowDistances),
      maxDistance: Math.max(...flowDistances),
      countStable: pn.numParticles === flowSize,
      finite: flowDistances.every(Number.isFinite) &&
        Array.from(pn.velX).every(Number.isFinite) && Array.from(pn.velY).every(Number.isFinite)
    };
    pn.o = pn.o.slice(0, 1);
    pn._initSoAFromObjects(1);
    pn.gravityWellAccelerationCapped = true;

    const many = [];
    for (let i = 0; i < 64; i++) {
      many.push({
        type: i % 2 ? 'white' : 'black',
        x: 40 + (i % 8) * 160,
        y: 40 + Math.floor(i / 8) * 80,
        radius: 80 + (i % 5) * 20,
        strength: 2
      });
    }
    setWells(many);
    setParticle(500, 300);
    for (let frame = 0; frame < 120; frame++) pn._updateSoA();
    const finite = [pn.posX[0], pn.posY[0], pn.velX[0], pn.velY[0]].every(Number.isFinite);

    pn.clearGravityWells();
    return { black, white, invertedBlack, invertedWhite, onlyA, onlyB, together,
      globalForceOne, globalForceTwo, globalForceZero, spinZero, spinPositive, spinNegative,
      cappedStrong, uncappedStrong, capturePullZero, capturePullTwo,
      coreTraversal, exactCenterTraversal, naturalFlow, finite };
  });

  await page.evaluate(() => {
    const pn = window.particleInstance;
    pn.options.velocity = 0;
    pn.options.trails = false;
    pn.addGravityWell('black', 460, 320, 120);
  });
  await page.waitForTimeout(120);
  const zeroSpeedActive = await page.evaluate(() => ({
    rafActive: window.particleInstance._rafActive,
    renderPasses: window.particleInstance.glRenderer.gravityWellRenderer.diagnostics.renderPasses
  }));

  const visibleAnimation = await page.evaluate(async () => {
    const pn = window.particleInstance;
    const gl = pn.glRenderer.gl;
    const well = pn.gravityWells[0];
    pn.selectedGravityWellId = null;
    const dpr = pn.glRenderer.canvas.width / Math.max(1, pn.glRenderer.canvas.clientWidth);
    const extent = well.radius * 1.5 * dpr;
    const x = Math.max(0, Math.floor(well.x * dpr - extent));
    const y = Math.max(0, Math.floor(pn.glRenderer.canvas.height - well.y * dpr - extent));
    const width = Math.min(pn.glRenderer.canvas.width - x, Math.ceil(extent * 2));
    const height = Math.min(pn.glRenderer.canvas.height - y, Math.ceil(extent * 2));

    function readRegion() {
      const pixels = new Uint8Array(width * height * 4);
      gl.finish();
      gl.readPixels(x, y, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return pixels;
    }

    await new Promise(resolve => requestAnimationFrame(resolve));
    const first = readRegion();
    await new Promise(resolve => setTimeout(resolve, 420));
    await new Promise(resolve => requestAnimationFrame(resolve));
    const second = readRegion();
    let changedPixels = 0;
    let totalDelta = 0;
    for (let i = 0; i < first.length; i += 4) {
      const delta = Math.abs(first[i] - second[i]) + Math.abs(first[i + 1] - second[i + 1]) +
        Math.abs(first[i + 2] - second[i + 2]) + Math.abs(first[i + 3] - second[i + 3]);
      totalDelta += delta;
      if (delta > 12) changedPixels++;
    }
    const pixelCount = first.length / 4;
    return {
      changedRatio: changedPixels / pixelCount,
      meanDelta: totalDelta / pixelCount
    };
  });

  const disabledState = await page.evaluate(() => {
    const pn = window.particleInstance;
    const count = pn.gravityWells.length;
    pn.posX[0] = 600; pn.posY[0] = 320; pn.velX[0] = 0; pn.velY[0] = 0;
    window.particleSettingsUi.params.gravityWellsEnabled = false;
    window.applyParamsToNetwork(pn, window.particleSettingsUi.params);
    pn._updateSoA();
    const result = {
      preservedCount: pn.gravityWells.length === count,
      forcePaused: pn.velX[0] === 0 && pn.velY[0] === 0,
      disabled: pn.options.gravityWellsEnabled === false
    };
    window.particleSettingsUi.params.gravityWellsEnabled = true;
    window.applyParamsToNetwork(pn, window.particleSettingsUi.params);
    result.reenabled = pn.options.gravityWellsEnabled === true;
    return result;
  });
  await waitForFrames(page, 2);

  const resourceBefore = await page.evaluate(() => {
    const renderer = window.particleInstance.glRenderer;
    window.__gravityResourceRefs = {
      pointBuffer: renderer.gravityWellRenderer.pointBuffer,
      sceneFramebuffer: renderer.gravityWellRenderer.sceneTarget.framebuffer,
      fieldFramebuffer: renderer.gravityWellRenderer.fieldTarget.framebuffer
    };
    return {
      pointBufferCreates: renderer.gravityWellRenderer.diagnostics.pointBufferCreates,
    };
  });
  await page.evaluate(() => {
    const pn = window.particleInstance;
    for (let i = 0; i < 40; i++) pn.addGravityWell(i % 2 ? 'white' : 'black', 30 + i * 25, 80 + (i % 6) * 75, 60 + i);
  });
  await waitForFrames(page, 3);
  const resourceAfter = await page.evaluate(() => {
    const renderer = window.particleInstance.glRenderer;
    const diagnostics = renderer.gravityWellRenderer.diagnostics;
    const before = window.__gravityResourceRefs;
    return {
      samePointBuffer: renderer.gravityWellRenderer.pointBuffer === before.pointBuffer,
      sameSceneFramebuffer: renderer.gravityWellRenderer.sceneTarget.framebuffer === before.sceneFramebuffer,
      sameFieldFramebuffer: renderer.gravityWellRenderer.fieldTarget.framebuffer === before.fieldFramebuffer,
      pointBufferCreates: diagnostics.pointBufferCreates,
      activeWellCount: diagnostics.activeWellCount,
      contextLost: renderer.gl.isContextLost()
    };
  });

  await page.setViewportSize({ width: 1180, height: 680 });
  await page.evaluate(() => {
    const pn = window.particleInstance;
    pn.i.style.width = '1180px';
    pn.i.style.height = '680px';
    window.dispatchEvent(new Event('resize'));
  });
  await page.waitForTimeout(750);
  await waitForFrames(page, 2);
  const resizedTargets = await page.evaluate(() => {
    const pn = window.particleInstance;
    const diagnostics = pn.glRenderer.gravityWellRenderer.diagnostics;
    return {
      backingWidth: pn.glRenderer.canvas.width,
      backingHeight: pn.glRenderer.canvas.height,
      sceneWidth: diagnostics.sceneWidth,
      sceneHeight: diagnostics.sceneHeight,
      fieldWidth: diagnostics.fieldWidth,
      fieldHeight: diagnostics.fieldHeight
    };
  });

  await page.evaluate(() => {
    const pn = window.particleInstance;
    window.particleSettingsUi.params.trails = true;
    window.applyParamsToNetwork(pn, window.particleSettingsUi.params);
  });
  await page.mouse.move(500, 340);
  await page.keyboard.press('b');
  await waitForFrames(page, 3);
  const trails = await page.evaluate(() => ({
    overlayVisible: window.particleInstance._gravityWellOverlay?.style.display === 'block',
    overlayZ: window.particleInstance._gravityWellOverlay?.style.zIndex,
    trailZ: window.particleInstance.canvas.style.zIndex,
    measurementCount: window.particleInstance._gravityWellMeasurements.length,
    wellCount: window.particleInstance.gravityWells.length,
    velocityFinite: Number.isFinite(window.particleInstance.velX[0]) && Number.isFinite(window.particleInstance.velY[0])
  }));
  await page.keyboard.press('Escape');

  await page.evaluate(() => {
    const renderer = window.particleInstance.glRenderer;
    const pn = window.particleInstance;
    pn.clearGravityWells();
    pn.addGravityWell('black', 320, 250, 120);
    pn.addGravityWell('white', 760, 400, 140);
    pn.selectedGravityWellId = null;
    renderer.gravityWellRenderer.failed = true;
    renderer.gravityWellCompositionFailed = true;
    pn.options.trails = false;
  });
  await page.mouse.move(520, 330);
  await page.keyboard.press('b');
  await waitForFrames(page, 2);
  const fallback = await page.evaluate(() => ({
    overlayVisible: window.particleInstance._gravityWellOverlay?.style.display === 'block',
    overlayCanvas: window.particleInstance._gravityWellOverlay instanceof HTMLCanvasElement,
    measurementCount: window.particleInstance._gravityWellMeasurements.length,
    physicsFinite: Number.isFinite(window.particleInstance.velX[0]) && Number.isFinite(window.particleInstance.velY[0])
  }));
  if (options.screenshotDir) {
    await page.screenshot({ path: path.join(options.screenshotDir, 'fallback.png') });
  }
  await page.keyboard.press('Escape');

  const assertions = {
    startsEmpty: initial.wellCount === 0 && initial.pointBufferCreates === 1 && !initial.contextLost,
    heroOverlayFadesAfterTenSeconds: heroFade?.delay === 0 && heroFade.duration === 10000 && heroFade.start.opacity === 1 &&
      heroFade.fading.opacity > 0 && heroFade.fading.opacity < 1 && heroFade.finished.opacity === 0 &&
      reducedHeroFade?.delay === 0 && reducedHeroFade.duration === 10000,
    defaultRadiusIs150: initial.defaultRadius === 150,
    focusedPhysicsDefaults: initial.gravityWellAccelerationCapped && initial.gravityWellAccelerationLimit === 1.5 &&
      initial.gravityWellForceMultiplier === 1 && initial.gravityWellSpin === 0.2 &&
      initial.cursorCaptureForceMultiplier === 1 && initial.cursorCaptureMaxSpeed === 2.64,
    clickWithoutResizeKeepsDefaultRadius: defaultClickDraft.x === 1050 && defaultClickDraft.y === 120 &&
      defaultClickDraft.radius === 150 && defaultClickDraft.label === '150 px' && defaultClickPlacement?.type === 'white' &&
      defaultClickPlacement.x === 1050 && defaultClickPlacement.y === 120 && defaultClickPlacement.radius === 150,
    middleHoldSpawnsAtPointer: middleSpawnFirst.active && middleSpawnSecond.active &&
      middleSpawnFirst.count > middleSpawnBaseline && middleSpawnSecond.count > middleSpawnFirst.count &&
      middleSpawnFirst.allNearPointer && middleSpawnSecond.allNearPointer &&
      middleSpawnFirst.noneOnEdge && middleSpawnSecond.noneOnEdge,
    middleReleaseStopsSpawning: !middleSpawnReleased.active && !middleSpawnReleased.rafActive &&
      middleSpawnSettledCount === middleSpawnReleased.count,
    middleSpawnStateFinite: middleSpawnFirst.forcesClear && middleSpawnSecond.finite,
    blackPlacementPreview: blackDraft && blackDraft.type === 'black' && blackDraft.x === 420 && blackDraft.y === 250 && blackDraft.radius === 155,
    whitePlacementPreview: whiteDraft && whiteDraft.type === 'white' && whiteDraft.x === 960 && whiteDraft.y === 350 && whiteDraft.radius === 145,
    placementWheelOnlyResizesDraft: blackPreview.particleCount === particleCountBeforePlacementWheel &&
      whitePreview.particleCount === particleCountBeforePlacementWheel,
    radiusLabelTracksPlacement: blackPreview.labelVisible && blackPreview.labelText === '155 px' &&
      whitePreview.labelVisible && whitePreview.labelText === '145 px' && cancelLabelBeforeEscape.visible && cancelLabelBeforeEscape.text === '150 px',
    radiusLabelDisappears: blackLabelHiddenAfterCommit && whiteLabelHiddenAfterCommit && cancelState.labelHidden,
    placedBothTypes: placed.wells.length === 2 && placed.wells[0].type === 'black' && placed.wells[1].type === 'white',
    placementRulersUseCenterDistance: centeredRulers.overlayVisible && centeredRulers.measurements.length === 2 &&
      centeredRulers.measurements.every(measurement => measurement.distance === 300 && measurement.label === '300 px' &&
        measurement.fromX === 600 && measurement.fromY === 360),
    placementRulersPaintOverlay: centeredRulers.paintedPixels.lineAlpha > 40 &&
      centeredRulers.paintedPixels.tickAlpha > 40 &&
      centeredRulers.paintedPixels.labelAlpha > centeredRulers.paintedPixels.lineAlpha,
    placementRulersUpdateLive: movedRulers.length === 2 &&
      movedRulers.map(measurement => measurement.label).sort().join(',') === '250 px,350 px' &&
      movedRulers.every(measurement => measurement.fromX === 650 && measurement.fromY === 360),
    placementRulersClearOnCancel: cancelledRulers.count === 0 && cancelledRulers.overlayHidden,
    doubleClickReversesBlackHole: blackReversed.strength === -100 && blackReversed.visualType === 'white' &&
      blackReversed.innerColor === '#dffcff' && blackReversed.outerColor === '#6b5cff' && blackReversed.selected &&
      blackReversed.particleCount === particleCountBeforeDoubleClick && blackReversed.forcesClear &&
      blackReversed.cursorCaptureInactive,
    secondDoubleClickRestoresBlackHole: blackRestored.strength === 100 && blackRestored.visualType === 'black',
    doubleClickReversesWhiteHole: whiteReversed.strength === -25 && whiteReversed.visualType === 'black' &&
      whiteReversed.innerColor === '#ff8080' && whiteReversed.outerColor === '#3633ff',
    quickDoubleClickDoesNotCapture: !quickDoubleClickCapture.active && !quickDoubleClickCapture.pending,
    aGatherStillTeleportsParticles: aGatherState.activeDuringKey && !aGatherState.activeAfterKey &&
      aGatherState.maxDistance <= aGatherState.radius + 0.1,
    doublePressHoldStartsWithoutTeleport: captureActivated.active && !captureActivated.pending && captureActivated.cursorActive &&
      captureActivated.point.x === capturePoint.x && captureActivated.point.y === capturePoint.y &&
      captureActivated.capturedCount >= captureSetup.insideCount && captureActivated.uncapturedCount > 0 &&
      captureActivated.maxActivationDisplacement < captureSetup.initialOutsideMeanDistance &&
      captureActivated.meanUncapturedDistance > captureSetup.radius && captureActivated.count === captureSetup.count,
    doublePressHoldPullsLikeLeftClick: captureActivated.forceMultiplier === 1.5 && capturePulled.uncapturedCount > 0 &&
      capturePulled.meanUncapturedDistance < captureActivated.meanUncapturedDistance &&
      capturePulled.meanUncapturedDistance < captureSetup.initialOutsideMeanDistance,
    cursorCaptureContainsAgainstUnlimitedGravity: captureMoved.opposingWellStrength === 1000000000 &&
      captureMoved.gravityCapDisabled && captureMoved.maxCapturedDistance <= captureSetup.radius + 0.1,
    cursorCaptureFollowsPointer: captureMoved.point.x === movedCapturePoint.x && captureMoved.point.y === movedCapturePoint.y &&
      captureMoved.maxCapturedDistance <= captureSetup.radius + 0.1 &&
      captureMoved.capturedCount >= captureSetup.insideCount && captureMoved.count === captureSetup.count,
    cursorCaptureReleasesCleanly: !captureReleased.active && !captureReleased.pending && !captureReleased.point &&
      !captureReleased.capturedParticles && !captureReleased.force && !captureReleased.cursorActive,
    framebuffersSized: placed.fbo.sceneWidth === placed.backing.width && placed.fbo.sceneHeight === placed.backing.height &&
      placed.fbo.fieldWidth === Math.ceil(placed.backing.width / 2) && placed.fbo.fieldHeight === Math.ceil(placed.backing.height / 2),
    compositionRan: placed.renderPasses > 0,
    wheelAdjustsHoveredStrength: wheelIncreased.strength === 13 && wheelDecreased === 12 &&
      wheelIncreased.selectedId === wheelIncreased.wellId && wheelIncreased.particleCount === particleCountBeforeWellWheel,
    wheelStrengthRequiresCoreOrb: auraWheelState.strength === auraWheelTarget.strength &&
      auraWheelState.particleCount === auraWheelTarget.particleCount && auraWheelState.particleAdjustments === 1 &&
      !auraWheelState.forceLabelVisible,
    wheelShowsForceValue: wheelIncreased.forceLabel === 'Absorption 13' && wheelIncreased.forceLabelType === 'black' &&
      wheelIncreased.forceLabelVisible && whiteForceLabel.text === 'Repulsion 13' && whiteForceLabel.type === 'white' &&
      whiteForceLabel.visible,
    wheelStrengthHasNoUpperCap: wheelAboveFormerLimit.strength === 41,
    wheelStrengthStopsAtZeroWithoutFlipping: wheelAtZero.strength === 0 && wheelAtZero.visualType === 'black' &&
      wheelAtZero.visualInnerColor === '#ff8080' && wheelAtZero.visualOuterColor === '#3633ff',
    strengthDrivesVisualSpeed: wheelIncreased.visualSpeed > 1 && wheelAboveFormerLimit.visualSpeed > wheelIncreased.visualSpeed,
    clickDragMovesExistingWell: dragHeld.dragId === dragBefore.id && dragHeld.selectedId === dragBefore.id &&
      dragHeld.x === dragBefore.x + 80 && dragHeld.y === dragBefore.y + 50 && dragHeld.draggingCursor &&
      !dragHeld.attractionForce && !dragHeld.repulsionForce,
    grabbedWheelResizesOnly: dragHeld.radius === dragBefore.radius + 5 && dragHeld.strength === dragBefore.strength &&
      dragHeld.particleCount === dragBefore.particleCount,
    grabbedWheelShowsRadius: dragHeld.radiusLabelVisible && dragHeld.radiusLabel === `${Math.round(dragHeld.radius)} px` &&
      !dragHeld.strengthLabelVisible && dragHeld.measurementCount === 1,
    grabbedWheelRespectsRadiusBounds: heldRadiusMaximum.radius === 500 && heldRadiusMaximum.label === '500 px' &&
      heldRadiusMinimum.radius === 24 && heldRadiusMinimum.label === '24 px',
    dragReleaseCleansState: !dragReleased.drag && !dragReleased.draggingCursor &&
      dragReleased.x === dragHeld.x && dragReleased.y === dragHeld.y && dragReleased.radiusLabelHidden &&
      dragReleased.measurementCount === 0,
    releasedWheelReturnsToStrength: dragAfterReleasedWheel.radius === dragReleased.radius &&
      dragAfterReleasedWheel.strength === dragReleased.strength + 1,
    coreSelectionConsumesClick: coreSelection.selectedType === 'black' && !coreSelection.attractionForce && !coreSelection.repulsionForce,
    escapeDeselects: deselected,
    escapeCancelsDraft: cancelState.count === countBeforeCancel && cancelState.draft === null,
    rightClickCancelsDraft: rightClickCancelState.count === countBeforeCancel && rightClickCancelState.draft === null &&
      !rightClickCancelState.attractionForce && !rightClickCancelState.repulsionForce && rightClickCancelState.labelHidden,
    lTogglesGravityAccelerationCap: gravityCapInitial && !gravityCapUnlimited && gravityCapRestored,
    deleteRemovesHoveredWell: countBeforeDelete === countBeforeCancel + 1 && deleteState.count === countBeforeCancel && deleteState.hoveredWellGone,
    shiftBRunsBenchmark: benchmarkState.starts === 1 && benchmarkState.draft === null && benchmarkState.count === countBeforeCancel,
    bootstrapCRecolorsOnlyHoveredWell: bootstrapColorState.target.id === bootstrapColorState.targetBefore.id &&
      bootstrapColorState.target.type === bootstrapColorState.targetBefore.type &&
      bootstrapColorState.target.x === bootstrapColorState.targetBefore.x &&
      bootstrapColorState.target.y === bootstrapColorState.targetBefore.y &&
      bootstrapColorState.target.radius === bootstrapColorState.targetBefore.radius &&
      bootstrapColorState.target.strength === bootstrapColorState.targetBefore.strength &&
      (bootstrapColorState.target.innerColor !== bootstrapColorState.targetBefore.innerColor ||
        bootstrapColorState.target.outerColor !== bootstrapColorState.targetBefore.outerColor) &&
      /^#[0-9a-f]{6}$/i.test(bootstrapColorState.target.innerColor) &&
      /^#[0-9a-f]{6}$/i.test(bootstrapColorState.target.outerColor) &&
      bootstrapColorState.other.innerColor === bootstrapColorState.otherBefore.innerColor &&
      bootstrapColorState.other.outerColor === bootstrapColorState.otherBefore.outerColor &&
      bootstrapColorState.selectedId === bootstrapColorBefore.selectedId && !bootstrapColorState.controlsVisible &&
      bootstrapColorState.randomCalls >= 2 && bootstrapColorState.repeatPreservedColors,
    panelComplete: ['Main', 'Wells', 'Advanced', 'Global Physics', 'Global Enabled', 'Motion', 'Limit Acceleration',
      'Maximum Acceleration', 'Global Force', 'Particle Spin', 'Add / Manage', 'Add Black Hole', 'Add White Hole',
      'Selected Hole', 'Radius', 'Strength', 'Inner Color', 'Outer Color', 'Reverse Selected', 'Reposition/Resize',
      'Remove Selected', 'Clear All', 'Cursor Capture', 'Capture / Gather Radius', 'Capture Pull',
      'Captured Max Speed'].every(label => panelText.includes(label)),
    allNumericControlsUseSliders: sliderControls.expectedLabels.every(label => sliderControls.controls[label]) &&
      sliderControls.controls.Strength.min === -100 && sliderControls.controls.Strength.max === 100 &&
      sliderControls.controls['Particle Spin'].min === -1 && sliderControls.controls['Particle Spin'].max === 1,
    settingsSynchronize: synchronized,
    fullPaneCRecolorsAndSynchronizes: fullPaneColorState.well.type === 'white' &&
      fullPaneColorState.well.x === fullPaneColorState.before.x && fullPaneColorState.well.y === fullPaneColorState.before.y &&
      fullPaneColorState.well.radius === fullPaneColorState.before.radius &&
      fullPaneColorState.well.strength === fullPaneColorState.before.strength &&
      (fullPaneColorState.well.innerColor !== fullPaneColorState.before.innerColor ||
        fullPaneColorState.well.outerColor !== fullPaneColorState.before.outerColor) &&
      fullPaneColorState.params.innerColor === fullPaneColorState.well.innerColor &&
      fullPaneColorState.params.outerColor === fullPaneColorState.well.outerColor &&
      fullPaneColorState.controlsVisible && fullPaneColorState.randomCalls >= 2,
    contextualCFallsBackToControls: fullPaneHidden && fullPaneVisible,
    focusedSettingsApply: appliedWellSettings.capped && appliedWellSettings.accelerationLimit === 0.4 &&
      appliedWellSettings.forceMultiplier === 2.5 && appliedWellSettings.spin === -0.35 &&
      appliedWellSettings.gatherRadius === 135 && appliedWellSettings.capturePull === 1.8 &&
      appliedWellSettings.captureMaxSpeed === 3.2,
    lHotkeySynchronizesPanel: !panelCapUnlimited.runtime && !panelCapUnlimited.control &&
      panelCapRestored.runtime && panelCapRestored.control && Math.abs(panelCapRestored.limit - 0.4) < 0.000001,
    panelReversesSelectedHole: strengthAfterPanelReverse === -strengthBeforePanelReverse &&
      strengthAfterPanelRestore === strengthBeforePanelReverse,
    repositionRulersExcludeEditedWell: repositionRulers.count === 1 &&
      !repositionRulers.targetIds.includes(repositionRulers.editingId),
    repositionResize: repositioned && Math.abs(repositioned.x - 360) <= 2 && Math.abs(repositioned.y - 300) <= 2 && Math.abs(repositioned.radius - 120) <= 2,
    removeClearReset: afterRemove === 1 && afterClear === 0 && afterReset.wellCount === 0 && afterReset.capped &&
      afterReset.accelerationLimit === 1.5 && afterReset.forceMultiplier === 1 && afterReset.spin === 0.2 &&
      afterReset.gatherRadius === 100 && afterReset.capturePull === 1 && afterReset.captureMaxSpeed === 2.64,
    blackAttractsAndSpirals: physics.black.vx < 0 && Math.abs(physics.black.vy) > 0,
    whiteRepelsAndSpirals: physics.white.vx > 0 && Math.abs(physics.white.vy) > 0,
    negativeStrengthSwapsBehavior: physics.invertedBlack.vx > 0 && physics.invertedWhite.vx < 0,
    overlappingForcesSum: Math.abs(physics.together.vx - (physics.onlyA.vx + physics.onlyB.vx)) < 0.0002 &&
      Math.abs(physics.together.vy - (physics.onlyA.vy + physics.onlyB.vy)) < 0.0002,
    globalForceScalesAndDisables: Math.abs(physics.globalForceTwo.vx - physics.globalForceOne.vx * 2) < 0.0002 &&
      Math.abs(physics.globalForceZero.vx) < 0.000001 && Math.abs(physics.globalForceZero.vy) < 0.000001,
    particleSpinControlsTangentialForce: Math.abs(physics.spinZero.vy) < 0.000001 && physics.spinPositive.vy < 0 &&
      physics.spinNegative.vy > 0 && Math.abs(Math.abs(physics.spinPositive.vy) - Math.abs(physics.spinNegative.vy)) < 0.0002,
    configuredGravityCapWorks: Math.hypot(physics.cappedStrong.vx, physics.cappedStrong.vy) <= 0.4001 &&
      Math.hypot(physics.uncappedStrong.vx, physics.uncappedStrong.vy) > 0.4,
    capturePullIsIndependent: Math.abs(physics.capturePullZero.vx) < 0.000001 && physics.capturePullTwo.vx < 0,
    blackCorePreservesParticlesWithoutSnapping: physics.coreTraversal.finite && physics.coreTraversal.countStable &&
      physics.coreTraversal.distanceFromCenter < 20 && physics.coreTraversal.distanceFromStart < 10,
    exactCenterPreservesParticle: physics.exactCenterTraversal.finite && physics.exactCenterTraversal.countStable &&
      physics.exactCenterTraversal.distance < 0.001,
    blackHoleFlowDoesNotCollapseIntoRing: physics.naturalFlow.finite && physics.naturalFlow.countStable &&
      physics.naturalFlow.maxDistance - physics.naturalFlow.minDistance > 40,
    manyWellsRemainFinite: physics.finite,
    zeroSpeedKeepsAnimating: zeroSpeedActive.rafActive && zeroSpeedActive.renderPasses > placed.renderPasses,
    visibleWellAnimation: visibleAnimation.changedRatio > 0.01 && visibleAnimation.meanDelta > 0.25,
    disablingPausesWithoutDeleting: disabledState.disabled && disabledState.forcePaused && disabledState.preservedCount && disabledState.reenabled,
    resourcesReused: resourceAfter.samePointBuffer && resourceAfter.sameSceneFramebuffer && resourceAfter.sameFieldFramebuffer &&
      resourceAfter.pointBufferCreates === 1 && resourceAfter.activeWellCount === 41 && !resourceAfter.contextLost,
    resizedTargets: resizedTargets.sceneWidth === resizedTargets.backingWidth && resizedTargets.sceneHeight === resizedTargets.backingHeight &&
      resizedTargets.fieldWidth === Math.ceil(resizedTargets.backingWidth / 2) && resizedTargets.fieldHeight === Math.ceil(resizedTargets.backingHeight / 2),
    trailsStayBelowWells: trails.overlayVisible && Number(trails.overlayZ) > Number(trails.trailZ) && trails.velocityFinite &&
      trails.measurementCount === trails.wellCount,
    fallbackIsFunctional: fallback.overlayVisible && fallback.overlayCanvas && fallback.measurementCount === 2 && fallback.physicsFinite
  };

  await context.close();
  return { assertions, initial, placed, centeredRulers, movedRulers, cancelledRulers,
    bootstrapColorState, fullPaneColorState, aGatherState, captureActivated, capturePulled, captureMoved, captureReleased,
    panelCapUnlimited, panelCapRestored, sliderControls,
    physics, visibleAnimation,
    resourceAfter, resizedTargets, trails, fallback };
}

async function runTouch(browser, options, browserErrors) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true
  });
  const page = await context.newPage();
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push({ surface: 'touch', type: 'console', text: message.text() });
  });
  page.on('pageerror', error => browserErrors.push({ surface: 'touch', type: 'pageerror', text: String(error) }));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await load(page, options.url);
  const defaultMotion = await page.evaluate(() => window.particleInstance.options.gravityWellMotion);
  const highDprPointerState = await page.evaluate(point => {
    const pn = window.particleInstance;
    const rect = pn.canvas.getBoundingClientRect();
    pn.canvas.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      clientX: rect.left + point.x,
      clientY: rect.top + point.y
    }));
    return { x: pn.p.x, y: pn.p.y, dpr: window.devicePixelRatio };
  }, { x: 95, y: 320 });
  await page.keyboard.press('c');
  await page.waitForFunction(() => window.particleSettingsUi && document.getElementById('tp-container')?.style.display !== 'none');
  await page.getByText('Wells', { exact: true }).click();
  const systemOverride = await page.evaluate(() => {
    const ui = window.particleSettingsUi;
    ui.params.gravityWellMotion = 'system';
    window.applyParamsToNetwork(window.particleInstance, ui.params);
    return localStorage.getItem('pn_gravity_well_motion');
  });

  await page.getByRole('button', { name: 'Add Black Hole' }).click();
  const firstTouchMeasurements = await dispatchTouchDrag(page, { x: 95, y: 520 }, { x: 175, y: 520 }, 11);
  await page.getByRole('button', { name: 'Add White Hole' }).click();
  const secondTouchMeasurements = await dispatchTouchDrag(page, { x: 285, y: 650 }, { x: 365, y: 650 }, 12);
  const directTouchMeasurements = await dispatchTouchDrag(page, { x: 95, y: 520 }, { x: 115, y: 540 }, 13);
  await waitForFrames(page, 4);

  const beforePhysics = await page.evaluate(() => ({ x: window.particleInstance.posX[0], y: window.particleInstance.posY[0] }));
  await waitForFrames(page, 4);
  const touchState = await page.evaluate(before => {
    const pn = window.particleInstance;
    const diagnostics = pn.glRenderer.gravityWellRenderer.diagnostics;
    return {
      wells: pn.gravityWells.map(well => ({ type: well.type, radius: well.radius })),
      draft: pn.gravityWellDraft,
      activePointers: pn._activePointers ? pn._activePointers.size : 0,
      panelWidth: document.getElementById('tp-container').getBoundingClientRect().width,
      animationTime: diagnostics.lastAnimationTime,
      physicsMoved: pn.posX[0] !== before.x || pn.posY[0] !== before.y,
      targetSizes: {
        backingWidth: pn.glRenderer.canvas.width,
        backingHeight: pn.glRenderer.canvas.height,
        sceneWidth: diagnostics.sceneWidth,
        sceneHeight: diagnostics.sceneHeight,
        fieldWidth: diagnostics.fieldWidth,
        fieldHeight: diagnostics.fieldHeight
      },
      contextLost: pn.glRenderer.gl.isContextLost()
    };
  }, beforePhysics);

  const animateOverride = await page.evaluate(() => {
    const ui = window.particleSettingsUi;
    ui.params.gravityWellMotion = 'animate';
    window.applyParamsToNetwork(window.particleInstance, ui.params);
    return localStorage.getItem('pn_gravity_well_motion');
  });
  await waitForFrames(page, 4);
  const overrideAnimationTime = await page.evaluate(() =>
    window.particleInstance.glRenderer.gravityWellRenderer.diagnostics.lastAnimationTime
  );

  await page.keyboard.press('Escape');
  if (options.screenshotDir) {
    await page.screenshot({ path: path.join(options.screenshotDir, 'touch-black-white.png') });
  }

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.particleInstance && window.ParticleNetworkConfig);
  const restoredMotion = await page.evaluate(() => {
    const motion = window.particleInstance.options.gravityWellMotion;
    localStorage.removeItem('pn_gravity_well_motion');
    return motion;
  });

  const sizes = touchState.targetSizes;
  const assertions = {
    touchPlacesBoth: touchState.wells.length === 2 && touchState.wells[0].type === 'black' && touchState.wells[1].type === 'white',
    touchDragSizes: touchState.wells.every(well => Math.abs(well.radius - 80) <= 2),
    touchRulersTrackPlacementAndDrag: firstTouchMeasurements.length === 0 && secondTouchMeasurements.length === 1 &&
      directTouchMeasurements.length === 1 && secondTouchMeasurements[0].label === '230 px',
    touchStateClean: touchState.draft === null && touchState.activePointers === 0,
    hoverUsesLogicalCoordinates: highDprPointerState.dpr === 2 &&
      Math.abs(highDprPointerState.x - 95) <= 1 && Math.abs(highDprPointerState.y - 320) <= 1,
    panelFitsViewport: touchState.panelWidth <= 366,
    animationEnabledByDefault: defaultMotion === 'animate',
    systemOverrideRespectsReducedMotion: systemOverride === 'system' && touchState.animationTime === 0,
    reducedMotionFreezesDecoration: touchState.animationTime === 0,
    reducedMotionKeepsPhysics: touchState.physicsMoved,
    animateOverrideAdvancesDecoration: animateOverride === 'animate' && overrideAnimationTime > 0,
    motionOverrideRestored: restoredMotion === 'animate',
    dprTargetsSized: sizes.sceneWidth === sizes.backingWidth && sizes.sceneHeight === sizes.backingHeight &&
      sizes.fieldWidth === Math.ceil(sizes.backingWidth / 2) && sizes.fieldHeight === Math.ceil(sizes.backingHeight / 2),
    touchContextHealthy: !touchState.contextLost
  };
  await context.close();
  return { assertions, highDprPointerState, defaultMotion, systemOverride, firstTouchMeasurements,
    secondTouchMeasurements, directTouchMeasurements, touchState,
    animateOverride, overrideAnimationTime, restoredMotion };
}

async function runReloadCursor(browser, options, browserErrors) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push({ surface: 'reload-cursor', type: 'console', text: message.text() });
  });
  page.on('pageerror', error => browserErrors.push({ surface: 'reload-cursor', type: 'pageerror', text: String(error) }));
  await load(page, options.url);

  const target = { x: 375, y: 245 };
  await page.mouse.move(target.x, target.y);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.particleInstance && window.particleInstance.glRenderer, null, { timeout: 30000 });

  const restored = await page.evaluate(() => ({
    pointer: { ...window.particleInstance._gravityPointer },
    inside: window.particleInstance._gravityPointerInsideCanvas,
    stored: JSON.parse(sessionStorage.getItem('pn_gravity_pointer') || 'null')
  }));
  await page.keyboard.press('b');
  const blackDraft = await page.evaluate(() => ({ ...window.particleInstance.gravityWellDraft }));
  await page.keyboard.press('Escape');
  await page.keyboard.press('w');
  const whiteDraft = await page.evaluate(() => ({ ...window.particleInstance.gravityWellDraft }));

  const assertions = {
    cursorSavedProportionallyOnRefresh: restored.inside &&
      Math.abs(restored.stored.x - target.x / 1280) < 0.000001 &&
      Math.abs(restored.stored.y - target.y / 720) < 0.000001,
    keyboardWellsUseRestoredCursor: Math.abs(restored.pointer.x - target.x) < 1 &&
      Math.abs(restored.pointer.y - target.y) < 1 &&
      blackDraft.type === 'black' && blackDraft.x === restored.pointer.x && blackDraft.y === restored.pointer.y &&
      whiteDraft.type === 'white' && whiteDraft.x === restored.pointer.x && whiteDraft.y === restored.pointer.y
  };
  await context.close();
  return { assertions, target, restored, blackDraft, whiteDraft };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.url) {
    console.log('Usage: rtk node scripts/test-gravity-wells.js <url> [--headed] [--screenshot-dir DIR] [--output FILE]');
    process.exitCode = 1;
    return;
  }
  if (options.screenshotDir) fs.mkdirSync(options.screenshotDir, { recursive: true });

  const browserErrors = [];
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: !options.headed,
    args: ['--no-first-run', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding']
  });
  try {
    const desktop = await runDesktop(browser, options, browserErrors);
    const touch = await runTouch(browser, options, browserErrors);
    const reloadCursor = await runReloadCursor(browser, options, browserErrors);
    const rendererSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'GravityWellRendererGL.js'), 'utf8');
    const networkSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'ParticleNetwork.js'), 'utf8');
    const assertions = {
      ...desktop.assertions,
      ...touch.assertions,
      ...reloadCursor.assertions,
      noDashedGravityRadius: !rendererSource.includes('selectionRing') && !networkSource.includes('setLineDash'),
      noBrowserErrors: browserErrors.length === 0
    };
    const passed = Object.values(assertions).every(Boolean);
    const result = { url: options.url, passed, assertions, browserErrors, desktop, touch, reloadCursor };
    const json = JSON.stringify(result);
    console.log(json);
    if (options.output) fs.writeFileSync(options.output, JSON.stringify(result, null, 2) + '\n');
    if (!passed) process.exitCode = 2;
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
