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
  await page.evaluate(({ start, end, pointerId }) => {
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
    send('pointerup', end, 0);
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
      pointBufferCreates: pn.glRenderer.gravityWellRenderer.diagnostics.pointBufferCreates,
      pointBuffer: pn.glRenderer.gravityWellRenderer.pointBuffer,
      contextLost: pn.glRenderer.gl.isContextLost()
    };
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
    return {
      count: pn.numParticles,
      active: pn._middleSpawnActive,
      nearPointer: pn.o.slice(start, pn.numParticles).some(particle => Math.hypot(particle.x - 640, particle.y - 560) < 20),
      forcesClear: !pn.attractionForce && !pn.repulsionForce
    };
  }, middleSpawnBaseline);
  await page.mouse.move(720, 560);
  await page.waitForTimeout(160);
  const middleSpawnSecond = await page.evaluate(start => {
    const pn = window.particleInstance;
    return {
      count: pn.numParticles,
      active: pn._middleSpawnActive,
      nearPointer: pn.o.slice(start, pn.numParticles).some(particle => Math.hypot(particle.x - 720, particle.y - 560) < 20),
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

  await page.mouse.move(300, 250);
  await page.keyboard.press('b');
  await page.mouse.move(420, 250);
  const blackDraft = await page.evaluate(() => ({ ...window.particleInstance.gravityWellDraft }));
  await page.mouse.click(420, 250);

  await page.mouse.move(820, 350);
  await page.keyboard.press('w');
  await page.mouse.move(960, 350);
  const whiteDraft = await page.evaluate(() => ({ ...window.particleInstance.gravityWellDraft }));
  await page.mouse.click(960, 350);
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

  const particleCountBeforeWellWheel = await page.evaluate(() => window.particleInstance.o.length);
  await page.mouse.move(360, 250);
  await page.mouse.wheel(0, -100);
  await waitForFrames(page, 2);
  const wheelIncreased = await page.evaluate(() => {
    const pn = window.particleInstance;
    const well = pn.gravityWells[0];
    return {
      strength: well.strength,
      selectedId: pn.selectedGravityWellId,
      wellId: well.id,
      particleCount: pn.o.length,
      visualSpeed: pn.glRenderer.gravityWellRenderer.diagnostics.maxVisualSpeed
    };
  });
  await page.mouse.wheel(0, 100);
  await waitForFrames(page, 2);
  const wheelDecreased = await page.evaluate(() => window.particleInstance.gravityWells[0].strength);

  await page.keyboard.press('Escape');
  if (options.screenshotDir) {
    await page.screenshot({ path: path.join(options.screenshotDir, 'desktop-black-white.png') });
  }

  await page.mouse.click(300, 250);
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
  await page.keyboard.press('Escape');
  const cancelState = await page.evaluate(() => ({
    count: window.particleInstance.gravityWells.length,
    draft: window.particleInstance.gravityWellDraft
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

  await page.keyboard.press('c');
  await page.waitForFunction(() => window.particleSettingsUi && document.getElementById('tp-container')?.style.display !== 'none');
  await page.getByText('Advanced', { exact: true }).click();
  const panelText = await page.locator('#tp-container').textContent();
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

  await page.getByRole('button', { name: 'Reposition/Resize' }).click();
  await page.mouse.move(360, 300);
  await page.mouse.down();
  await page.mouse.move(480, 300);
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
  const afterReset = await page.evaluate(() => window.particleInstance.gravityWells.length);

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

    const black = sample([{ type: 'black', ...center }], center.x + 72, center.y);
    const white = sample([{ type: 'white', ...center }], center.x + 72, center.y);
    const a = { type: 'black', x: 570, y: 310, radius: 160, strength: 1 };
    const b = { type: 'white', x: 720, y: 420, radius: 140, strength: 1 };
    const onlyA = sample([a], 640, 360);
    const onlyB = sample([b], 640, 360);
    const together = sample([a, b], 640, 360);

    setWells([{ type: 'black', ...center }]);
    setParticle(center.x + 5, center.y + 5);
    const countBefore = pn.numParticles;
    pn._updateSoA();
    const swallowed = {
      onEdge: pn.posX[0] === 0 || pn.posX[0] === pn.i.size.width || pn.posY[0] === 0 || pn.posY[0] === pn.i.size.height,
      countStable: pn.numParticles === countBefore && pn.posX.length === countBefore
    };

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
    return { black, white, onlyA, onlyB, together, swallowed, finite };
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

  await page.evaluate(() => { window.particleInstance.options.trails = true; });
  await waitForFrames(page, 3);
  const trails = await page.evaluate(() => ({
    overlayVisible: window.particleInstance._gravityWellOverlay?.style.display === 'block',
    overlayZ: window.particleInstance._gravityWellOverlay?.style.zIndex,
    trailZ: window.particleInstance.canvas.style.zIndex,
    velocityFinite: Number.isFinite(window.particleInstance.velX[0]) && Number.isFinite(window.particleInstance.velY[0])
  }));

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
  await waitForFrames(page, 2);
  const fallback = await page.evaluate(() => ({
    overlayVisible: window.particleInstance._gravityWellOverlay?.style.display === 'block',
    overlayCanvas: window.particleInstance._gravityWellOverlay instanceof HTMLCanvasElement,
    physicsFinite: Number.isFinite(window.particleInstance.velX[0]) && Number.isFinite(window.particleInstance.velY[0])
  }));
  if (options.screenshotDir) {
    await page.screenshot({ path: path.join(options.screenshotDir, 'fallback.png') });
  }

  const assertions = {
    startsEmpty: initial.wellCount === 0 && initial.pointBufferCreates === 1 && !initial.contextLost,
    middleHoldSpawnsAtPointer: middleSpawnFirst.active && middleSpawnSecond.active &&
      middleSpawnFirst.count > middleSpawnBaseline && middleSpawnSecond.count > middleSpawnFirst.count &&
      middleSpawnFirst.nearPointer && middleSpawnSecond.nearPointer,
    middleReleaseStopsSpawning: !middleSpawnReleased.active && !middleSpawnReleased.rafActive &&
      middleSpawnSettledCount === middleSpawnReleased.count,
    middleSpawnStateFinite: middleSpawnFirst.forcesClear && middleSpawnSecond.finite,
    blackPlacementPreview: blackDraft && blackDraft.type === 'black' && Math.abs(blackDraft.radius - 120) <= 2,
    whitePlacementPreview: whiteDraft && whiteDraft.type === 'white' && Math.abs(whiteDraft.radius - 140) <= 2,
    placedBothTypes: placed.wells.length === 2 && placed.wells[0].type === 'black' && placed.wells[1].type === 'white',
    framebuffersSized: placed.fbo.sceneWidth === placed.backing.width && placed.fbo.sceneHeight === placed.backing.height &&
      placed.fbo.fieldWidth === Math.ceil(placed.backing.width / 2) && placed.fbo.fieldHeight === Math.ceil(placed.backing.height / 2),
    compositionRan: placed.renderPasses > 0,
    wheelAdjustsHoveredStrength: wheelIncreased.strength === 13 && wheelDecreased === 12 &&
      wheelIncreased.selectedId === wheelIncreased.wellId && wheelIncreased.particleCount === particleCountBeforeWellWheel,
    strengthDrivesVisualSpeed: wheelIncreased.visualSpeed > 1,
    coreSelectionConsumesClick: coreSelection.selectedType === 'black' && !coreSelection.attractionForce && !coreSelection.repulsionForce,
    escapeDeselects: deselected,
    escapeCancelsDraft: cancelState.count === countBeforeCancel && cancelState.draft === null,
    shiftBRunsBenchmark: benchmarkState.starts === 1 && benchmarkState.draft === null && benchmarkState.count === countBeforeCancel,
    panelComplete: ['Gravity Wells', 'Global Enabled', 'Motion', 'Add Black Hole', 'Add White Hole', 'Radius', 'Strength',
      'Inner Color', 'Outer Color', 'Reposition/Resize', 'Remove Selected', 'Clear All'].every(label => panelText.includes(label)),
    settingsSynchronize: synchronized,
    repositionResize: repositioned && Math.abs(repositioned.x - 360) <= 2 && Math.abs(repositioned.y - 300) <= 2 && Math.abs(repositioned.radius - 120) <= 2,
    removeClearReset: afterRemove === 1 && afterClear === 0 && afterReset === 0,
    blackAttractsAndSpirals: physics.black.vx < 0 && Math.abs(physics.black.vy) > 0,
    whiteRepelsAndSpirals: physics.white.vx > 0 && Math.abs(physics.white.vy) > 0,
    overlappingForcesSum: Math.abs(physics.together.vx - (physics.onlyA.vx + physics.onlyB.vx)) < 0.0002 &&
      Math.abs(physics.together.vy - (physics.onlyA.vy + physics.onlyB.vy)) < 0.0002,
    blackRespawnsAtEdge: physics.swallowed.onEdge && physics.swallowed.countStable,
    manyWellsRemainFinite: physics.finite,
    zeroSpeedKeepsAnimating: zeroSpeedActive.rafActive && zeroSpeedActive.renderPasses > placed.renderPasses,
    visibleWellAnimation: visibleAnimation.changedRatio > 0.01 && visibleAnimation.meanDelta > 0.25,
    disablingPausesWithoutDeleting: disabledState.disabled && disabledState.forcePaused && disabledState.preservedCount && disabledState.reenabled,
    resourcesReused: resourceAfter.samePointBuffer && resourceAfter.sameSceneFramebuffer && resourceAfter.sameFieldFramebuffer &&
      resourceAfter.pointBufferCreates === 1 && resourceAfter.activeWellCount === 41 && !resourceAfter.contextLost,
    resizedTargets: resizedTargets.sceneWidth === resizedTargets.backingWidth && resizedTargets.sceneHeight === resizedTargets.backingHeight &&
      resizedTargets.fieldWidth === Math.ceil(resizedTargets.backingWidth / 2) && resizedTargets.fieldHeight === Math.ceil(resizedTargets.backingHeight / 2),
    trailsStayBelowWells: trails.overlayVisible && Number(trails.overlayZ) > Number(trails.trailZ) && trails.velocityFinite,
    fallbackIsFunctional: fallback.overlayVisible && fallback.overlayCanvas && fallback.physicsFinite
  };

  await context.close();
  return { assertions, initial, placed, physics, visibleAnimation, resourceAfter, resizedTargets, trails, fallback };
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
  await page.getByText('Advanced', { exact: true }).click();

  await page.getByRole('button', { name: 'Add Black Hole' }).click();
  await dispatchTouchDrag(page, { x: 95, y: 520 }, { x: 175, y: 520 }, 11);
  await page.getByRole('button', { name: 'Add White Hole' }).click();
  await dispatchTouchDrag(page, { x: 285, y: 650 }, { x: 365, y: 650 }, 12);
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
    touchStateClean: touchState.draft === null && touchState.activePointers === 0,
    hoverUsesLogicalCoordinates: highDprPointerState.dpr === 2 &&
      Math.abs(highDprPointerState.x - 95) <= 1 && Math.abs(highDprPointerState.y - 320) <= 1,
    panelFitsViewport: touchState.panelWidth <= 366,
    reducedMotionFreezesDecoration: touchState.animationTime === 0,
    reducedMotionKeepsPhysics: touchState.physicsMoved,
    animateOverrideAdvancesDecoration: animateOverride === 'animate' && overrideAnimationTime > 0,
    motionOverrideRestored: restoredMotion === 'animate',
    dprTargetsSized: sizes.sceneWidth === sizes.backingWidth && sizes.sceneHeight === sizes.backingHeight &&
      sizes.fieldWidth === Math.ceil(sizes.backingWidth / 2) && sizes.fieldHeight === Math.ceil(sizes.backingHeight / 2),
    touchContextHealthy: !touchState.contextLost
  };
  await context.close();
  return { assertions, highDprPointerState, touchState, animateOverride, overrideAnimationTime, restoredMotion };
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
    const rendererSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'GravityWellRendererGL.js'), 'utf8');
    const networkSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'ParticleNetwork.js'), 'utf8');
    const assertions = {
      ...desktop.assertions,
      ...touch.assertions,
      noDashedGravityRadius: !rendererSource.includes('selectionRing') && !networkSource.includes('setLineDash'),
      noBrowserErrors: browserErrors.length === 0
    };
    const passed = Object.values(assertions).every(Boolean);
    const result = { url: options.url, passed, assertions, browserErrors, desktop, touch };
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
