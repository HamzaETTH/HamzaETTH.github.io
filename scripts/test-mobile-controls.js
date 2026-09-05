#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

function parseArgs(argv) {
  const options = { url: null, section: 'all', screenshotDir: null, headed: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--section') options.section = argv[++i];
    else if (arg === '--screenshot-dir') options.screenshotDir = argv[++i];
    else if (arg === '--headed') options.headed = true;
    else if (!options.url) options.url = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.url) throw new Error('Usage: rtk node scripts/test-mobile-controls.js <url> [--section gestures|palette] [--screenshot-dir DIR]');
  if (!['all', 'gestures', 'palette'].includes(options.section)) throw new Error(`Unknown section: ${options.section}`);
  return options;
}

async function load(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.particleInstance && window.particleInstance.canvas, null, { timeout: 30000 });
}

async function sendCanvasPointer(page, type, pointerId, point, buttons = 1) {
  await page.evaluate(({ type, pointerId, point, buttons }) => {
    const canvas = window.particleInstance.canvas;
    const rect = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId,
      pointerType: 'touch',
      isPrimary: pointerId === 1,
      buttons,
      clientX: rect.left + point.x,
      clientY: rect.top + point.y
    }));
  }, { type, pointerId, point, buttons });
}

async function tapControl(page, selector, pointerId) {
  await page.evaluate(({ selector, pointerId }) => {
    const control = document.querySelector(selector);
    if (!control) throw new Error(`Missing control: ${selector}`);
    const rect = control.getBoundingClientRect();
    const init = {
      bubbles: true,
      cancelable: true,
      pointerId,
      pointerType: 'touch',
      isPrimary: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2
    };
    control.dispatchEvent(new PointerEvent('pointerdown', { ...init, buttons: 1 }));
    control.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
  }, { selector, pointerId });
}

async function holdControl(page, selector, pointerId, duration) {
  const point = await page.evaluate(({ selector, pointerId }) => {
    const control = document.querySelector(selector);
    if (!control) throw new Error(`Missing control: ${selector}`);
    const rect = control.getBoundingClientRect();
    const point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    control.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      pointerId,
      pointerType: 'touch',
      isPrimary: true,
      buttons: 1,
      clientX: point.x,
      clientY: point.y
    }));
    return point;
  }, { selector, pointerId });
  await page.waitForTimeout(duration);
  await page.evaluate(({ selector, pointerId, point }) => {
    const control = document.querySelector(selector);
    control.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      cancelable: true,
      pointerId,
      pointerType: 'touch',
      isPrimary: true,
      buttons: 0,
      clientX: point.x,
      clientY: point.y
    }));
  }, { selector, pointerId, point });
}

async function dragPaletteToken(page, type, destination, pointerId) {
  await page.evaluate(({ type, destination, pointerId }) => {
    const token = document.querySelector(`[data-hole-type="${type}"]`);
    if (!token) throw new Error(`Missing ${type} hole token`);
    const tokenRect = token.getBoundingClientRect();
    const start = { x: tokenRect.left + tokenRect.width / 2, y: tokenRect.top + tokenRect.height / 2 };
    const init = {
      bubbles: true,
      cancelable: true,
      pointerId,
      pointerType: 'touch',
      isPrimary: true
    };
    token.dispatchEvent(new PointerEvent('pointerdown', {
      ...init,
      buttons: 1,
      clientX: start.x,
      clientY: start.y
    }));
    window.dispatchEvent(new PointerEvent('pointermove', {
      ...init,
      buttons: 1,
      clientX: destination.x,
      clientY: destination.y
    }));
    window.dispatchEvent(new PointerEvent('pointerup', {
      ...init,
      buttons: 0,
      clientX: destination.x,
      clientY: destination.y
    }));
  }, { type, destination, pointerId });
}

async function dragExistingWellToToken(page, well, type, pointerId) {
  const destination = await page.evaluate(type => {
    const canvasRect = window.particleInstance.canvas.getBoundingClientRect();
    const tokenRect = document.querySelector(`[data-hole-type="${type}"]`).getBoundingClientRect();
    return {
      x: tokenRect.left + tokenRect.width / 2 - canvasRect.left,
      y: tokenRect.top + tokenRect.height / 2 - canvasRect.top
    };
  }, type);
  await sendCanvasPointer(page, 'pointerdown', pointerId, well);
  await sendCanvasPointer(page, 'pointermove', pointerId, destination);
  await sendCanvasPointer(page, 'pointermove', pointerId, destination);
  const ready = await page.evaluate(type =>
    document.querySelector(`[data-hole-type="${type}"]`).classList.contains('is-delete-target'), type);
  await sendCanvasPointer(page, 'pointerup', pointerId, destination, 0);
  return ready;
}

async function resetSingleParticle(page) {
  await page.evaluate(() => {
    const pn = window.particleInstance;
    pn.options.interactive = true;
    pn.options.velocity = 0;
    pn.options.curvedDrift = false;
    pn.options.particleCollision = false;
    pn.options.particleAttraction = false;
    pn.options.particleRepulsion = false;
    pn.setParticleCount(1);
    pn.clearGravityWells();
    if (pn._rafId != null) cancelAnimationFrame(pn._rafId);
    pn._rafId = null;
    pn._rafActive = false;
    pn.posX[0] = 100;
    pn.posY[0] = 300;
    pn.velX[0] = 0;
    pn.velY[0] = 0;
    pn.o[0].x = 100;
    pn.o[0].y = 300;
    pn.o[0].velocity.x = 0;
    pn.o[0].velocity.y = 0;
  });
}

async function runGestures(page) {
  await resetSingleParticle(page);
  await sendCanvasPointer(page, 'pointerdown', 1, { x: 220, y: 300 });
  const oneFingerVelocity = await page.evaluate(() => {
    const pn = window.particleInstance;
    pn._updateSoA();
    return pn.velX[0];
  });
  await sendCanvasPointer(page, 'pointerup', 1, { x: 220, y: 300 }, 0);
  assert(oneFingerVelocity > 0, `one finger should pull inward, got vx=${oneFingerVelocity}`);

  await resetSingleParticle(page);
  await sendCanvasPointer(page, 'pointerdown', 1, { x: 200, y: 280 });
  await sendCanvasPointer(page, 'pointerdown', 2, { x: 240, y: 320 });
  const twoFingerVelocity = await page.evaluate(() => {
    const pn = window.particleInstance;
    pn._updateSoA();
    return pn.velX[0];
  });
  await sendCanvasPointer(page, 'pointerup', 2, { x: 240, y: 320 }, 0);
  await sendCanvasPointer(page, 'pointerup', 1, { x: 200, y: 280 }, 0);
  assert(twoFingerVelocity < 0, `two fingers should push outward, got vx=${twoFingerVelocity}`);

  const mobileWellInfluence = await page.evaluate(() => {
    const pn = window.particleInstance;
    const previousSpin = pn.options.gravityWellSpin;
    const sample = (type, distance) => {
      pn.clearGravityWells();
      pn.addGravityWell(type, 195, 422, 60);
      pn.posX[0] = 195 + distance;
      pn.posY[0] = 422;
      pn.velX[0] = 0;
      pn.velY[0] = 0;
      pn.options.gravityWellSpin = 0;
      pn._updateSoA();
      return pn.velX[0];
    };
    const result = {
      mobileLayout: pn._mobileLayoutMedia?.matches === true,
      blackInside: sample('black', 100),
      blackOutside: sample('black', 150),
      whiteInside: sample('white', 100),
      whiteOutside: sample('white', 150)
    };
    pn.options.gravityWellSpin = previousSpin;
    pn.clearGravityWells();
    return result;
  });
  assert.strictEqual(mobileWellInfluence.mobileLayout, true);
  assert(mobileWellInfluence.blackInside < 0, 'black hole should absorb inside the mobile influence radius');
  assert.strictEqual(mobileWellInfluence.blackOutside, 0, 'black hole should stop beyond its mobile influence radius');
  assert(mobileWellInfluence.whiteInside > 0, 'white hole should repel inside the mobile influence radius');
  assert.strictEqual(mobileWellInfluence.whiteOutside, 0, 'white hole should stop beyond its mobile influence radius');

  const mobileBlackHoleOrbit = await page.evaluate(() => {
    const pn = window.particleInstance;
    const previous = {
      interactive: pn.options.interactive,
      velocity: pn.options.velocity,
      curvedDrift: pn.options.curvedDrift,
      boundaryMode: pn.options.boundaryMode,
      gravityWellSpin: pn.options.gravityWellSpin
    };
    const center = { x: pn.i.size.width * 0.5, y: pn.i.size.height * 0.5 };
    const stopLoop = () => {
      if (pn._rafId != null) cancelAnimationFrame(pn._rafId);
      pn._rafId = null;
      pn._rafActive = false;
    };

    pn.options.interactive = false;
    pn.options.velocity = 0.66;
    pn.options.curvedDrift = false;
    pn.options.boundaryMode = 'bounce';
    pn.options.gravityWellSpin = 0.2;
    pn.attractionForce = null;
    pn.repulsionForce = null;
    pn.setParticleCount(1);
    pn.clearGravityWells();
    const well = pn.addGravityWell('black', center.x, center.y, 60);
    stopLoop();
    pn.posX[0] = center.x + well.radius;
    pn.posY[0] = center.y;
    pn.velX[0] = 0;
    pn.velY[0] = 0.66;
    pn.sizeA[0] = 1;

    const envelope = Math.max(
      well.radius,
      Math.min(well.radius * 2, Math.min(pn.i.size.width, pn.i.size.height) * 0.45)
    );
    let maxDistance = 0;
    let wallHits = 0;
    for (let frame = 0; frame < 1000; frame++) {
      pn._updateSoA();
      maxDistance = Math.max(maxDistance, Math.hypot(pn.posX[0] - center.x, pn.posY[0] - center.y));
      const size = pn.sizeA[0];
      if (pn.posX[0] <= size || pn.posX[0] >= pn.i.size.width - size ||
          pn.posY[0] <= size || pn.posY[0] >= pn.i.size.height - size) wallHits++;
    }

    const result = { radius: well.radius, envelope, maxDistance, wallHits };
    pn.clearGravityWells();
    Object.assign(pn.options, previous);
    return result;
  });
  assert.strictEqual(mobileBlackHoleOrbit.radius, 60, 'orbit containment must not resize the visible phone well');
  assert(mobileBlackHoleOrbit.maxDistance <= mobileBlackHoleOrbit.envelope + 0.01,
    `default mobile black-hole orbit escaped ${mobileBlackHoleOrbit.envelope}px: ${mobileBlackHoleOrbit.maxDistance}`);
  assert.strictEqual(mobileBlackHoleOrbit.wallHits, 0, 'default mobile black-hole orbit reached a viewport wall');

  const mobileOrbitEnvelopes = await page.evaluate(() => {
    const pn = window.particleInstance;
    const previous = {
      interactive: pn.options.interactive,
      velocity: pn.options.velocity,
      curvedDrift: pn.options.curvedDrift,
      boundaryMode: pn.options.boundaryMode,
      gravityWellSpin: pn.options.gravityWellSpin
    };
    const center = { x: pn.i.size.width * 0.5, y: pn.i.size.height * 0.5 };
    const viewportLimit = Math.min(pn.i.size.width, pn.i.size.height) * 0.45;
    const stopLoop = () => {
      if (pn._rafId != null) cancelAnimationFrame(pn._rafId);
      pn._rafId = null;
      pn._rafActive = false;
    };
    const setParticle = (distance, tangentialVelocity, outwardVelocity) => {
      pn.posX[0] = center.x;
      pn.posY[0] = center.y + distance;
      pn.velX[0] = tangentialVelocity;
      pn.velY[0] = outwardVelocity;
      pn.sizeA[0] = 1;
    };
    const resultAfterStep = envelope => {
      pn._updateSoA();
      const dx = pn.posX[0] - center.x;
      const dy = pn.posY[0] - center.y;
      const distance = Math.hypot(dx, dy);
      const unitX = dx / distance;
      const unitY = dy / distance;
      return {
        envelope,
        distance,
        radialVelocity: pn.velX[0] * unitX + pn.velY[0] * unitY,
        tangentialVelocity: -pn.velX[0] * unitY + pn.velY[0] * unitX
      };
    };
    const sampleBlackHole = radius => {
      pn.clearGravityWells();
      const well = pn.addGravityWell('black', center.x, center.y, radius);
      stopLoop();
      const envelope = Math.max(well.radius, Math.min(well.radius * 2, viewportLimit));
      setParticle(envelope - 1, 3, 20);
      return { radius: well.radius, ...resultAfterStep(envelope) };
    };

    pn.options.interactive = false;
    pn.options.velocity = 0;
    pn.options.curvedDrift = false;
    pn.options.boundaryMode = 'none';
    pn.options.gravityWellSpin = 0;
    pn.attractionForce = null;
    pn.repulsionForce = null;
    pn.setParticleCount(1);
    stopLoop();

    const cases = [60, 150, 220].map(sampleBlackHole);

    pn.clearGravityWells();
    const strong = pn.addGravityWell('black', center.x, center.y, 60);
    strong.strength = 100;
    const weak = pn.addGravityWell('black', center.x, center.y, 150);
    weak.strength = 0.1;
    stopLoop();
    setParticle(119, 3, 20);
    const strongestOverlap = resultAfterStep(120);

    pn.clearGravityWells();
    pn.addGravityWell('white', center.x, center.y, 60);
    stopLoop();
    setParticle(119, 3, 20);
    const whiteHole = resultAfterStep(120);

    pn.clearGravityWells();
    Object.assign(pn.options, previous);
    return { viewportLimit, cases, strongestOverlap, whiteHole };
  });
  const expectedEnvelopes = new Map([[60, 120], [150, 175.5], [220, 220]]);
  for (const sample of mobileOrbitEnvelopes.cases) {
    const expected = expectedEnvelopes.get(sample.radius);
    assert(Math.abs(sample.envelope - expected) < 0.001,
      `unexpected ${sample.radius}px mobile orbit envelope: ${sample.envelope}`);
    assert(sample.distance <= expected + 0.01,
      `${sample.radius}px mobile black hole escaped its ${expected}px envelope: ${sample.distance}`);
    assert(sample.radialVelocity <= 0.001,
      `${sample.radius}px mobile containment retained outward radial velocity: ${sample.radialVelocity}`);
    assert(Math.abs(sample.tangentialVelocity) > 1,
      `${sample.radius}px mobile containment removed tangential motion: ${sample.tangentialVelocity}`);
  }
  const intentionallyLarge = mobileOrbitEnvelopes.cases.find(sample => sample.radius === 220);
  assert(intentionallyLarge.distance > mobileOrbitEnvelopes.viewportLimit,
    'an intentionally large mobile black hole was clamped below its own radius');
  assert(mobileOrbitEnvelopes.strongestOverlap.distance <= 120.01,
    `overlapping black holes did not use the strongest envelope: ${mobileOrbitEnvelopes.strongestOverlap.distance}`);
  assert(mobileOrbitEnvelopes.strongestOverlap.radialVelocity <= 0.001 &&
    Math.abs(mobileOrbitEnvelopes.strongestOverlap.tangentialVelocity) > 1,
  'strongest-envelope containment must remove only outward radial velocity');
  assert(mobileOrbitEnvelopes.whiteHole.distance > 120 && mobileOrbitEnvelopes.whiteHole.radialVelocity > 0,
    'mobile white-hole motion should remain unconstrained outside its influence radius');

  const movedWell = await page.evaluate(() => {
    const pn = window.particleInstance;
    pn.clearGravityWells();
    return pn.addGravityWell('black', 180, 420, 80).id;
  });
  await sendCanvasPointer(page, 'pointerdown', 1, { x: 180, y: 420 });
  await sendCanvasPointer(page, 'pointermove', 1, { x: 215, y: 445 });
  await sendCanvasPointer(page, 'pointerup', 1, { x: 215, y: 445 }, 0);
  const moved = await page.evaluate(id => {
    const well = window.particleInstance.getGravityWell(id);
    return { x: well.x, y: well.y, radius: well.radius, strength: well.strength };
  }, movedWell);
  assert(moved.x > 200 && moved.y > 435, 'one-finger well drag did not move the well');
  assert.strictEqual(moved.radius, 80);

  const adjustOrigin = { x: 150, y: 700 };
  await sendCanvasPointer(page, 'pointerdown', 1, { x: moved.x, y: moved.y });
  await sendCanvasPointer(page, 'pointerdown', 2, adjustOrigin);
  await sendCanvasPointer(page, 'pointermove', 2, { x: adjustOrigin.x + 8, y: adjustOrigin.y - 8 });
  const withinTolerance = await page.evaluate(id => {
    const pn = window.particleInstance;
    const well = pn.getGravityWell(id);
    return { mode: pn._mobileGesture.mode, radius: well.radius, strength: well.strength };
  }, movedWell);
  assert.deepStrictEqual(withinTolerance, { mode: 'well-adjust', radius: 80, strength: 12 });

  await sendCanvasPointer(page, 'pointermove', 2, { x: adjustOrigin.x, y: adjustOrigin.y - 72 });
  const larger = await page.evaluate(id => {
    const well = window.particleInstance.getGravityWell(id);
    return { radius: well.radius, strength: well.strength };
  }, movedWell);
  assert(larger.radius > 120, `upward second-finger movement did not increase radius, got ${larger.radius}`);
  assert.strictEqual(larger.strength, 12, 'vertical movement should not change strength');

  await sendCanvasPointer(page, 'pointermove', 2, { x: adjustOrigin.x, y: adjustOrigin.y + 52 });
  const smaller = await page.evaluate(id => {
    const well = window.particleInstance.getGravityWell(id);
    return { radius: well.radius, strength: well.strength };
  }, movedWell);
  assert(smaller.radius < 60, `downward second-finger movement did not decrease radius, got ${smaller.radius}`);
  assert.strictEqual(smaller.strength, 12, 'vertical movement should not change strength');

  await sendCanvasPointer(page, 'pointermove', 2, { x: adjustOrigin.x + 76, y: adjustOrigin.y });
  const faster = await page.evaluate(id => {
    const well = window.particleInstance.getGravityWell(id);
    return { radius: well.radius, strength: well.strength };
  }, movedWell);
  assert(Math.abs(faster.strength) > 12, `rightward second-finger movement did not increase speed, got ${faster.strength}`);
  assert.strictEqual(faster.radius, 80, 'horizontal movement should not change radius');

  await sendCanvasPointer(page, 'pointermove', 2, { x: adjustOrigin.x - 76, y: adjustOrigin.y });
  const slower = await page.evaluate(id => {
    const well = window.particleInstance.getGravityWell(id);
    return { radius: well.radius, strength: well.strength };
  }, movedWell);
  assert(Math.abs(slower.strength) < 12, `leftward second-finger movement did not decrease speed, got ${slower.strength}`);
  assert.strictEqual(slower.radius, 80, 'horizontal movement should not change radius');
  assert.strictEqual(Math.sign(slower.strength), Math.sign(faster.strength));

  await sendCanvasPointer(page, 'pointerup', 2, { x: adjustOrigin.x - 76, y: adjustOrigin.y }, 0);
  const resumedMode = await page.evaluate(() => window.particleInstance._mobileGesture.mode);
  assert.strictEqual(resumedMode, 'well-move', 'releasing the second finger should resume one-finger well movement');
  await sendCanvasPointer(page, 'pointerup', 1, { x: moved.x, y: moved.y }, 0);

  await page.evaluate(id => window.particleInstance.updateGravityWell(id, { radius: 80, strength: -12 }), movedWell);
  await sendCanvasPointer(page, 'pointerdown', 1, { x: moved.x, y: moved.y });
  await sendCanvasPointer(page, 'pointerdown', 2, adjustOrigin);
  await sendCanvasPointer(page, 'pointermove', 2, { x: adjustOrigin.x + 76, y: adjustOrigin.y });
  const reversedFaster = await page.evaluate(id => window.particleInstance.getGravityWell(id).strength, movedWell);
  assert(reversedFaster < -12, `rightward movement should increase reversed-well speed, got ${reversedFaster}`);
  await sendCanvasPointer(page, 'pointermove', 2, { x: adjustOrigin.x - 76, y: adjustOrigin.y });
  const reversedSlower = await page.evaluate(id => window.particleInstance.getGravityWell(id).strength, movedWell);
  assert(reversedSlower > -12 && reversedSlower < 0, `leftward movement should decrease reversed-well speed, got ${reversedSlower}`);
  await sendCanvasPointer(page, 'pointerup', 2, { x: adjustOrigin.x - 76, y: adjustOrigin.y }, 0);
  await sendCanvasPointer(page, 'pointerup', 1, { x: moved.x, y: moved.y }, 0);

  const strengthBefore = await page.evaluate(id => window.particleInstance.getGravityWell(id).strength, movedWell);
  const strengthPoint = await page.evaluate(id => {
    const well = window.particleInstance.getGravityWell(id);
    return { x: well.x, y: well.y };
  }, movedWell);
  await sendCanvasPointer(page, 'pointerdown', 1, strengthPoint);
  await page.waitForTimeout(740);
  await sendCanvasPointer(page, 'pointermove', 1, { x: strengthPoint.x, y: strengthPoint.y - 48 });
  await sendCanvasPointer(page, 'pointerup', 1, { x: strengthPoint.x, y: strengthPoint.y - 48 }, 0);
  const strengthAfter = await page.evaluate(id => window.particleInstance.getGravityWell(id).strength, movedWell);
  assert(Math.abs(strengthAfter) > Math.abs(strengthBefore), 'upward long-press drag did not increase strength');
  assert.strictEqual(Math.sign(strengthAfter), Math.sign(strengthBefore));

  const decreasePoint = await page.evaluate(id => {
    const well = window.particleInstance.getGravityWell(id);
    return { x: well.x, y: well.y };
  }, movedWell);
  await sendCanvasPointer(page, 'pointerdown', 1, decreasePoint);
  await page.waitForTimeout(740);
  await sendCanvasPointer(page, 'pointermove', 1, { x: decreasePoint.x, y: decreasePoint.y + 24 });
  await sendCanvasPointer(page, 'pointerup', 1, { x: decreasePoint.x, y: decreasePoint.y + 24 }, 0);
  const strengthDecreased = await page.evaluate(id => window.particleInstance.getGravityWell(id).strength, movedWell);
  assert(Math.abs(strengthDecreased) < Math.abs(strengthAfter), 'downward long-press drag did not decrease strength');
  assert.strictEqual(Math.sign(strengthDecreased), Math.sign(strengthAfter));

  await sendCanvasPointer(page, 'pointerdown', 1, decreasePoint);
  await sendCanvasPointer(page, 'pointercancel', 1, decreasePoint, 0);
  const cancelled = await page.evaluate(() => {
    const pn = window.particleInstance;
    return {
      mode: pn._mobileGesture.mode,
      pointers: pn._activePointers.size,
      timer: pn._mobileGesture.holdTimer,
      drag: pn._gravityWellDrag
    };
  });
  assert.deepStrictEqual(cancelled, { mode: 'idle', pointers: 0, timer: null, drag: null });

  const beforeRandom = await page.evaluate(() => {
    const pn = window.particleInstance;
    window.__mobileRandomizeEvents = 0;
    window.addEventListener('particle-mobile-randomize', () => { window.__mobileRandomizeEvents++; });
    pn.setParticleCount(64);
    pn.options.particleSize = 7;
    if (window.particleSettingsUi) window.particleSettingsUi.params.particleSize = 7;
    return { size: pn.options.particleSize, count: pn.numParticles, opacity: pn.options.opacity };
  });
  for (const [id, point] of [[1, { x: 70, y: 620 }], [2, { x: 120, y: 620 }], [3, { x: 170, y: 620 }]]) {
    await sendCanvasPointer(page, 'pointerdown', id, point);
  }
  for (const [id, point] of [[3, { x: 170, y: 620 }], [2, { x: 120, y: 620 }], [1, { x: 70, y: 620 }]]) {
    await sendCanvasPointer(page, 'pointerup', id, point, 0);
  }
  await page.waitForFunction(before => {
    const pn = window.particleInstance;
    return pn.options.opacity !== before.opacity || pn.options.lineConnectionDistance !== 120;
  }, beforeRandom, { timeout: 5000 });
  const afterRandom = await page.evaluate(() => ({
    size: window.particleInstance.options.particleSize,
    count: window.particleInstance.numParticles,
    events: window.__mobileRandomizeEvents
  }));
  assert.deepStrictEqual(afterRandom, { size: beforeRandom.size, count: beforeRandom.count, events: 1 });

  for (const [id, point] of [[4, { x: 70, y: 660 }], [5, { x: 120, y: 660 }], [6, { x: 170, y: 660 }]]) {
    await sendCanvasPointer(page, 'pointerdown', id, point);
  }
  await sendCanvasPointer(page, 'pointermove', 4, { x: 100, y: 660 });
  for (const [id, point] of [[6, { x: 170, y: 660 }], [5, { x: 120, y: 660 }], [4, { x: 100, y: 660 }]]) {
    await sendCanvasPointer(page, 'pointerup', id, point, 0);
  }
  await page.waitForTimeout(100);
  assert.strictEqual(await page.evaluate(() => window.__mobileRandomizeEvents), 1, 'three-finger drag randomized visuals');

  return {
    oneFingerVelocity,
    twoFingerVelocity,
    mobileWellInfluence,
    mobileBlackHoleOrbit,
    mobileOrbitEnvelopes,
    moved,
    wellAdjust: { withinTolerance, larger, smaller, faster, slower, resumedMode, reversedFaster, reversedSlower },
    strengthBefore,
    strengthAfter,
    strengthDecreased,
    cancelled,
    beforeRandom,
    afterRandom
  };
}

async function runPalette(page) {
  await page.waitForSelector('[data-mobile-particle-controls]');
  await page.waitForTimeout(1500);
  const layout = await page.evaluate(() => {
    const root = document.querySelector('[data-mobile-particle-controls]');
    const controls = Array.from(root.querySelectorAll('button')).map(button => {
      const rect = button.getBoundingClientRect();
      return { label: button.getAttribute('aria-label'), width: rect.width, height: rect.height };
    });
    const rect = root.getBoundingClientRect();
    return {
      display: getComputedStyle(root).display,
      opacity: Number(getComputedStyle(root).opacity),
      rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
      controls
    };
  });
  assert.notStrictEqual(layout.display, 'none');
  assert(layout.opacity < 0.6, `idle palette should be translucent, got ${layout.opacity}`);
  assert(layout.controls.every(control => control.width >= 44 && control.height >= 44), 'mobile touch targets must be at least 44px');
  assert(layout.rect.left >= 0 && layout.rect.top >= 0 && layout.rect.right <= 390 && layout.rect.bottom <= 844);

  await page.evaluate(() => window.particleInstance.clearGravityWells());
  await dragPaletteToken(page, 'black', { x: 110, y: 360 }, 31);
  await dragPaletteToken(page, 'white', { x: 280, y: 540 }, 32);
  const wells = await page.evaluate(() => window.particleInstance.gravityWells.map(well => ({
    type: well.type,
    x: well.x,
    y: well.y,
    radius: well.radius
  })));
  assert.deepStrictEqual(wells.map(well => well.type), ['black', 'white']);
  assert(wells.every(well => well.radius === 60), `mobile well default radius should be 60px: ${JSON.stringify(wells)}`);

  const blackDeleteReady = await dragExistingWellToToken(page, wells[0], 'black', 33);
  assert.strictEqual(blackDeleteReady, true, 'black-hole icon did not show delete feedback');
  const afterBlackDelete = await page.evaluate(() => window.particleInstance.gravityWells.map(well => well.type));
  assert.deepStrictEqual(afterBlackDelete, ['white'], 'dropping a black hole on its icon should delete it');

  const whiteDeleteReady = await dragExistingWellToToken(page, wells[1], 'white', 34);
  assert.strictEqual(whiteDeleteReady, true, 'white-hole icon did not show delete feedback');
  const afterWhiteDelete = await page.evaluate(() => window.particleInstance.gravityWells.map(well => well.type));
  assert.deepStrictEqual(afterWhiteDelete, [], 'dropping a white hole on its icon should delete it');

  const countBefore = await page.evaluate(() => window.particleInstance.numParticles);
  await tapControl(page, '[data-mobile-count="increase"]', 41);
  const countAfter = await page.evaluate(() => window.particleInstance.numParticles);
  assert.strictEqual(countAfter, countBefore + Math.max(16, Math.round(countBefore * 0.25)));
  const readout = await page.textContent('[data-mobile-particle-count]');
  assert.strictEqual(Number(readout), countAfter);

  await holdControl(page, '[data-mobile-count="increase"]', 42, 850);
  const repeatedCount = await page.evaluate(() => window.particleInstance.numParticles);
  assert(repeatedCount > countAfter + Math.max(16, Math.round(countAfter * 0.25)), 'held count control did not repeat');
  await page.waitForTimeout(250);
  assert.strictEqual(await page.evaluate(() => window.particleInstance.numParticles), repeatedCount, 'count repeated after release');

  await page.evaluate(() => window.particleInstance.setParticleCount(20));
  await tapControl(page, '[data-mobile-count="decrease"]', 43);
  await tapControl(page, '[data-mobile-count="decrease"]', 44);
  const minimumCount = await page.evaluate(() => window.particleInstance.numParticles);
  assert.strictEqual(minimumCount, 16, 'mobile count control did not preserve its minimum');
  assert.strictEqual(Number(await page.textContent('[data-mobile-particle-count]')), 16);

  const recreated = await page.evaluate(() => {
    window.destroyParticleExperience();
    const pn = window.createParticleExperience();
    return {
      roots: document.querySelectorAll('[data-mobile-particle-controls]').length,
      count: pn.numParticles,
      readout: Number(document.querySelector('[data-mobile-particle-count]').textContent)
    };
  });
  assert.deepStrictEqual(recreated, { roots: 1, count: recreated.count, readout: recreated.count });

  return {
    layout,
    wells,
    deleted: { blackDeleteReady, afterBlackDelete, whiteDeleteReady, afterWhiteDelete },
    countBefore,
    countAfter,
    readout,
    repeatedCount,
    minimumCount,
    recreated
  };
}

async function runDesktop(browser, url, browserErrors) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push({ surface: 'desktop', text: message.text() });
  });
  page.on('pageerror', error => browserErrors.push({ surface: 'desktop', text: String(error) }));
  await load(page, url);
  const hidden = await page.evaluate(() => {
    const root = document.querySelector('[data-mobile-particle-controls]');
    return !root || getComputedStyle(root).display === 'none';
  });
  assert.strictEqual(hidden, true, 'mobile controls should be hidden on desktop');
  const distantWellVelocity = await page.evaluate(() => {
    const pn = window.particleInstance;
    pn.options.velocity = 0;
    pn.options.gravityWellSpin = 0;
    pn.setParticleCount(1);
    pn.clearGravityWells();
    pn.addGravityWell('black', 400, 360, 60);
    pn.posX[0] = 550;
    pn.posY[0] = 360;
    pn.velX[0] = 0;
    pn.velY[0] = 0;
    pn._updateSoA();
    return pn.velX[0];
  });
  assert(distantWellVelocity < 0, 'desktop gravity wells should retain their existing unbounded falloff');
  const unconstrainedOrbit = await page.evaluate(() => {
    const pn = window.particleInstance;
    pn.options.interactive = false;
    pn.options.velocity = 0;
    pn.options.curvedDrift = false;
    pn.options.boundaryMode = 'none';
    pn.options.gravityWellSpin = 0;
    pn.attractionForce = null;
    pn.repulsionForce = null;
    pn.clearGravityWells();
    pn.addGravityWell('black', 400, 360, 60);
    pn.posX[0] = 519;
    pn.posY[0] = 360;
    pn.velX[0] = 20;
    pn.velY[0] = 3;
    pn.sizeA[0] = 1;
    pn._updateSoA();
    const dx = pn.posX[0] - 400;
    const dy = pn.posY[0] - 360;
    const distance = Math.hypot(dx, dy);
    return {
      distance,
      radialVelocity: (pn.velX[0] * dx + pn.velY[0] * dy) / distance
    };
  });
  assert(unconstrainedOrbit.distance > 120 && unconstrainedOrbit.radialVelocity > 0,
    `desktop black-hole orbit should remain unconstrained: ${JSON.stringify(unconstrainedOrbit)}`);
  await context.close();
  return { hidden, distantWellVelocity, unconstrainedOrbit };
}

async function runLandscape(browser, options, browserErrors) {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true
  });
  const page = await context.newPage();
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push({ surface: 'landscape', text: message.text() });
  });
  page.on('pageerror', error => browserErrors.push({ surface: 'landscape', text: String(error) }));
  await load(page, options.url);
  await page.waitForSelector('[data-mobile-particle-controls]');
  await page.waitForTimeout(1500);
  const layout = await page.evaluate(() => {
    const root = document.querySelector('[data-mobile-particle-controls]');
    const rect = root.getBoundingClientRect();
    return {
      display: getComputedStyle(root).display,
      opacity: Number(getComputedStyle(root).opacity),
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom
    };
  });
  assert.notStrictEqual(layout.display, 'none');
  assert(layout.left >= 0 && layout.top >= 0 && layout.right <= 844 && layout.bottom <= 390);
  assert(layout.opacity < 0.6);
  if (options.screenshotDir) {
    fs.mkdirSync(options.screenshotDir, { recursive: true });
    await page.screenshot({ path: path.join(options.screenshotDir, 'mobile-controls-landscape.png') });
  }
  await context.close();
  return layout;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const browser = await chromium.launch({ channel: 'msedge', headless: !options.headed });
  const browserErrors = [];
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true
  });
  const page = await context.newPage();
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push({ surface: 'mobile', text: message.text() });
  });
  page.on('pageerror', error => browserErrors.push({ surface: 'mobile', text: String(error) }));

  try {
    await load(page, options.url);
    const result = {};
    if (options.section === 'all' || options.section === 'gestures') result.gestures = await runGestures(page);
    if (options.section === 'all' || options.section === 'palette') result.palette = await runPalette(page);
    if (options.screenshotDir) {
      fs.mkdirSync(options.screenshotDir, { recursive: true });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(options.screenshotDir, 'mobile-controls.png') });
    }
    if (options.section === 'all' || options.section === 'palette') {
      result.landscape = await runLandscape(browser, options, browserErrors);
      result.desktop = await runDesktop(browser, options.url, browserErrors);
    }
    assert.deepStrictEqual(browserErrors, []);
    console.log(JSON.stringify({ passed: true, ...result, browserErrors }, null, 2));
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
