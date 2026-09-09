#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const url = process.argv[2];
const output = process.argv[3];
if (!url) throw new Error('Usage: rtk node scripts/test-gravity-well-presets.js URL [artifact-directory]');
if (output) fs.mkdirSync(output, { recursive: true });
const errors = [];

async function load(context) {
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.particleInstance && window.GravityWellPresets);
  return page;
}

async function seedAndEvolve(page, id, steps = 240) {
  return page.evaluate(({ id, steps }) => {
    const pn = window.particleInstance;
    pn.setParticleCount(900);
    pn.options.particleAttraction = false;
    pn.options.particleRepulsion = false;
    pn.options.curvedDrift = false;
    pn.options.velocity = 0.66;
    pn.options.lineConnectionDistance = 44;
    pn.options.particleColor = '#cccccc';
    pn.options.particleColorCycling = false;
    pn.options.lineColor = '#888888';
    pn.options.lineColorCycling = false;
    pn.options.gradientEffect = false;
    pn.options.gradientColor1 = '#888888';
    pn.options.gradientColor2 = '#888888';
    pn.options.useDistanceEffect = false;
    pn.gravityWellInfoExpanded = false;
    pn.applyGravityWellPreset(id);
    for (let i = 0; i < pn.numParticles; i++) {
      pn.posX[i] = ((i % 30) + 0.5) * pn.i.size.width / 30;
      pn.posY[i] = (Math.floor(i / 30) + 0.5) * pn.i.size.height / 30;
      pn.velX[i] = Math.cos(i * 2.39996323) * 0.66;
      pn.velY[i] = Math.sin(i * 2.39996323) * 0.66;
    }
    for (let i = 0; i < steps; i++) pn._updateSoA();
    pn._syncObjectsFromSoA();
    pn._selectionUndoStack = [];
    const finite = [pn.posX, pn.posY, pn.velX, pn.velY].every(array => Array.from(array).every(Number.isFinite));
    const expected = window.GravityWellPresets.resolve(id, pn._getGravityWellPresetViewport());
    return { finite, fits: expected.fits, count: pn.gravityWells.length };
  }, { id, steps });
}

async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true,
    args: ['--no-first-run', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
  const result = { assertions: {}, viewports: [], evolved: [], benchmarks: [] };
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await load(context);
    result.assertions = await page.evaluate(() => {
      const pn = window.particleInstance;
      const checks = {};
      const check = (name, value) => { checks[name] = Boolean(value); if (!value) throw new Error(name); };
      const json = value => JSON.stringify(value);
      const particles = () => json([Array.from(pn.posX), Array.from(pn.posY), Array.from(pn.velX), Array.from(pn.velY)]);
      const ownership = () => json(pn.activeGravityWellPreset);
      pn.clearGravityWells();
      pn.setParticleCount(200);
      const original = pn.addGravityWell('white', 160, 200, 75);
      pn.updateGravityWell(original.id, { strength: 9, innerColor: '#123456' });
      pn.selectedParticleIndices.add(5);
      const oldWells = json(pn.gravityWells);
      pn.options.velocity = 1.13;
      pn.options.curvedDrift = true;
      pn.options.gravityWellSpin = 0.72;
      pn.options.gravityWellForceMultiplier = 2.3;
      pn.options.gravityWellAccelerationCapped = pn.gravityWellAccelerationCapped = false;
      pn.options.gravityWellAccelerationLimit = pn.gravityWellAccelerationLimit = 2.1;
      pn.options.particleAttraction = true;
      pn.options.particleRepulsion = false;
      pn.options.particleInteractionDistance = 47;
      const oldOptions = { ...pn.options };
      pn._selectionUndoStack = [];
      let notifications = 0;
      const onChange = () => notifications++;
      window.addEventListener('particle-gravity-wells-change', onChange);
      pn.applyGravityWellPreset('cross-cage');
      check('applyAtomic', notifications === 1 && pn._selectionUndoStack.length === 1 && pn.gravityWells.length === 5);
      const gathered = Array.from(pn.posX).every((x, index) =>
        Math.hypot(x - pn.i.size.width / 2, pn.posY[index] - pn.i.size.height / 2) <= pn.options.gatherRadius + 0.01) &&
        Array.from(pn.velX).every((x, index) => x === 0 && pn.velY[index] === 0);
      check('applyGathersParticlesOnce', gathered && pn._startupGravityState === 'stopped');
      check('applyClearsSelection', !pn.selectedGravityWellId && !pn.selectedGravityWellIds.size && !pn.selectedParticleIndices.size);
      const allowed = new Set(['velocity', 'curvedDrift', 'gravityWellSpin', 'gravityWellForceMultiplier',
        'gravityWellAccelerationCapped', 'gravityWellAccelerationLimit', 'gravityWellsEnabled']);
      check('recommendedOnlyChangesAllowedSettings', Object.keys(oldOptions).every(key => allowed.has(key) || json(oldOptions[key]) === json(pn.options[key])));
      check('recommendedProfile', pn.options.velocity === 0.66 && pn.options.gravityWellSpin === 0.12 && pn.gravityWellAccelerationCapped && pn.gravityWellAccelerationLimit === 1.5);
      for (let i = 0; i < 4; i++) pn._updateSoA();
      const beforeUndoParticles = particles();
      pn.undoObjectSelection();
      check('undoRestoresReplacedWells', json(pn.gravityWells) === oldWells);
      check('undoRestoresSelection', pn.selectedGravityWellId === original.id && pn.selectedParticleIndices.has(5));
      check('undoRestoresMotion', Object.keys(oldOptions).every(key => json(oldOptions[key]) === json(pn.options[key])));
      check('undoDoesNotRewindParticles', beforeUndoParticles === particles());
      check('undoRestoresOwnership', pn.activeGravityWellPreset === null && pn.lastGravityWellPresetId === null);
      pn.applyGravityWellPreset('binary', { useRecommendedMotion: false });
      check('motionTogglePreservesPhysics', Object.keys(oldOptions).every(key => json(oldOptions[key]) === json(pn.options[key])));
      const ids = pn.gravityWells.map(well => well.id);
      const initialGeometry = json(pn.gravityWells);
      const depth = pn._selectionUndoStack.length;
      pn.updateGravityWellPreset({ spacing: 110 }, { last: false });
      pn.updateGravityWellPreset({ spacing: 120 }, { last: false });
      check('sliderDefersUndoUntilEnd', pn._selectionUndoStack.length === depth);
      pn.updateGravityWellPreset({ spacing: 130 }, { last: true });
      check('sliderOneUndoPerGesture', pn._selectionUndoStack.length === depth + 1);
      check('sliderRetainsIds', json(ids) === json(pn.gravityWells.map(well => well.id)));
      check('spacingMovesCenters', initialGeometry !== json(pn.gravityWells));
      pn.undoObjectSelection();
      check('sliderUndoExact', initialGeometry === json(pn.gravityWells) && pn.activeGravityWellPreset.spacing === 100);
      pn.updateGravityWellPreset({ rotation: 90, strength: 200 });
      check('rotationAndStrength', Math.abs(pn.gravityWells[0].x - pn.gravityWells[1].x) < 1e-6 && pn.gravityWells.every(well => well.strength === 24));
      pn.updateGravityWell(ids[0], { innerColor: '#aabbcc', outerColor: '#ddeeff' });
      check('colorRetainsOwnership', pn.activeGravityWellPreset !== null);
      pn.updateGravityWellPreset({ spacing: 85 });
      check('adjustmentPreservesColors', pn.gravityWells[0].innerColor === '#aabbcc');
      const mutations = {
        move: () => pn.updateGravityWell(pn.gravityWells[0].id, { x: 125 }),
        add: () => pn.addGravityWell('black', 80, 80, 30),
        remove: () => pn.removeGravityWell(pn.gravityWells[0].id),
        radius: () => pn.updateGravityWell(pn.gravityWells[0].id, { radius: 90 }),
        strength: () => pn.updateGravityWell(pn.gravityWells[0].id, { strength: 4 }),
        reverse: () => pn.reverseGravityWell(pn.gravityWells[0].id),
        drag: () => { const w = pn.gravityWells[0]; pn._startGravityWellDrag(w, w.x, w.y, 'mouse'); pn._handleGravityWellPointerMove(w.x + 30, w.y + 20, 'mouse', true); pn._stopGravityWellDrag(); },
        group: () => { pn.selectAllObjects(); const w = pn.gravityWells[0]; pn._beginObjectSelectionDrag(w.x, w.y); pn._updateObjectSelectionDrag(w.x + 25, w.y + 12, true, 'mouse'); pn._stopObjectSelectionDrag(); }
      };
      for (const [name, mutate] of Object.entries(mutations)) {
        pn.applyGravityWellPreset('binary');
        mutate();
        check(`customAfter_${name}`, pn.activeGravityWellPreset === null && pn.lastGravityWellPresetId === 'binary');
        check(`customDisablesUpdate_${name}`, pn.updateGravityWellPreset({ spacing: 110 }) === null);
      }
      pn.applyGravityWellPreset('cross-cage');
      pn.selectGravityWell(pn.gravityWells[1].id);
      pn.deleteObjectSelection();
      check('deleteDetaches', pn.activeGravityWellPreset === null);
      pn.undoObjectSelection();
      check('deleteUndoRestoresOwnership', pn.activeGravityWellPreset?.id === 'cross-cage');
      pn.copyObjectSelection();
      pn.pasteObjectSelection();
      check('pasteDetaches', pn.activeGravityWellPreset === null);
      pn.undoObjectSelection();
      check('pasteUndoRestoresOwnership', pn.activeGravityWellPreset?.id === 'cross-cage');
      pn.beginGravityWellPlacement('white', true);
      notifications = 0;
      pn.gravityWellInfoExpanded = true;
      pn._gravityWellInfluenceSnapshots.set('obsolete', 999);
      const refreshes = pn._gravityWellInfluenceRefreshCount;
      pn.applyGravityWellPreset('triple-halo');
      check('replacementCancelsDraftAtomically', !pn.gravityWellDraft && !pn._gravityWellDrag && notifications === 1);
      check('replacementOneInfluenceSnapshot', pn._gravityWellInfluenceRefreshCount === refreshes + 1 && pn._gravityWellInfluenceSnapshots.size === 18 && !pn._gravityWellInfluenceSnapshots.has('obsolete'));
      pn._prepareGravityWellFrame(); pn._finishGravityWellFrame(); pn._prepareGravityWellFrame(); pn._finishGravityWellFrame();
      check('redrawDoesNotScanParticles', pn._gravityWellInfluenceRefreshCount === refreshes + 1);
      const invalidState = json([pn.gravityWells, pn.activeGravityWellPreset]);
      check('invalidPresetNoMutation', pn.applyGravityWellPreset('missing') === null && invalidState === json([pn.gravityWells, pn.activeGravityWellPreset]));
      const previousIds = pn.gravityWells.map(well => well.id);
      pn.applyGravityWellPreset('triple-halo');
      check('repeatedApplyGetsNewIds', pn.gravityWells.every(well => !previousIds.includes(well.id)));
      pn.undoObjectSelection();
      check('repeatedApplyUndoRestoresIds', json(pn.gravityWells.map(well => well.id)) === json(previousIds));
      window.removeEventListener('particle-gravity-wells-change', onChange);
      return checks;
    });

    // Resize uses the catalogue again, never anisotropic center clamping or motion reapplication.
    for (const viewport of [{ width: 2560, height: 720 }, { width: 800, height: 800 },
      { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 800 }]) {
      await page.evaluate(() => {
        const pn = window.particleInstance;
        pn.applyGravityWellPreset('corridor');
        pn.options.velocity = 0.91;
        window.presetResizeBefore = { ids: pn.gravityWells.map(well => well.id), depth: pn._selectionUndoStack.length };
      });
      await page.setViewportSize(viewport);
      await page.waitForFunction(size => window.particleInstance.i.size.width === size.width && window.particleInstance.i.size.height === size.height, viewport);
      const state = await page.evaluate(() => {
        const pn = window.particleInstance;
        const expected = window.GravityWellPresets.resolve('corridor', pn._getGravityWellPresetViewport());
        return {
          fits: expected.fits,
          geometry: expected.wells.every((well, i) => ['x', 'y', 'radius', 'strength'].every(key => Math.abs(well[key] - pn.gravityWells[i][key]) < 1e-6)),
          ids: JSON.stringify(pn.gravityWells.map(well => well.id)) === JSON.stringify(window.presetResizeBefore.ids),
          undo: pn._selectionUndoStack.length === window.presetResizeBefore.depth,
          motion: pn.options.velocity === 0.91
        };
      });
      assert(Object.values(state).every(Boolean), JSON.stringify({ viewport, state }));
      result.viewports.push({ viewport, ...state });
    }

    await page.evaluate(() => {
      const pn = window.particleInstance;
      pn.applyGravityWellPreset('binary');
      pn.selectGravityWell(pn.gravityWells[0].id);
      pn.deleteObjectSelection();
    });
    await page.setViewportSize({ width: 1200, height: 760 });
    await page.waitForFunction(() => window.particleInstance.i.size.width === 1200);
    result.assertions.deleteResizeUndoReflows = await page.evaluate(() => {
      const pn = window.particleInstance;
      pn.undoObjectSelection();
      const expected = window.GravityWellPresets.resolve('binary', pn._getGravityWellPresetViewport());
      return pn.activeGravityWellPreset?.id === 'binary' && expected.wells.every((well, i) => Math.abs(well.x - pn.gravityWells[i].x) < 1e-6);
    });
    assert(result.assertions.deleteResizeUndoReflows);
    await page.setViewportSize({ width: 1280, height: 800 });

    const presets = await page.evaluate(() => window.GravityWellPresets.presets.map(({ id, name, family }) => ({ id, name, family })));
    const shots = [];
    for (const preset of presets) {
      const state = await seedAndEvolve(page, preset.id);
      assert(state.finite && state.fits && state.count <= 18, JSON.stringify({ preset, state }));
      result.evolved.push({ id: preset.id, ...state });
      if (output) {
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const file = path.join(output, `${preset.id}.png`);
        await page.screenshot({ path: file });
        shots.push({ ...preset, data: fs.readFileSync(file).toString('base64') });
      }
    }
    if (output) {
      const sheet = await context.newPage();
      await sheet.setViewportSize({ width: 1440, height: 670 });
      for (const family of [...new Set(presets.map(preset => preset.family))]) {
        await sheet.setContent(`<style>body{margin:0;background:#111;color:#eee;font:16px monospace}main{display:grid;grid-template-columns:repeat(3,1fr)}figure{margin:0}figcaption{padding:8px}img{width:480px;height:300px}</style><main>${shots.filter(shot => shot.family === family).map(shot => `<figure><figcaption>${shot.name}</figcaption><img src="data:image/png;base64,${shot.data}"></figure>`).join('')}</main>`);
        await sheet.screenshot({ path: path.join(output, `sheet-${family.replace(/[^a-z0-9]+/gi, '-')}.png`) });
      }
      await sheet.close();
    }

    const representatives = presets.filter((preset, i) => i % 6 === 0);
    for (const mode of ['touch', 'trails', 'reduced', 'fallback']) {
      const modeContext = await browser.newContext(mode === 'touch'
        ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
        : { viewport: { width: 1280, height: 800 }, reducedMotion: mode === 'reduced' ? 'reduce' : 'no-preference' });
      if (mode === 'fallback') await modeContext.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function(type, ...args) {
          return /webgl/.test(type) ? null : original.call(this, type, ...args);
        };
      });
      const modePage = await load(modeContext);
      await modePage.evaluate(mode => {
        const pn = window.particleInstance;
        if (mode === 'trails') pn.options.trails = true;
        if (mode === 'reduced') pn.options.gravityWellMotion = 'system';
      }, mode);
      for (const preset of representatives) {
        const state = await seedAndEvolve(modePage, preset.id);
        assert(state.finite && state.fits, JSON.stringify({ mode, preset, state }));
        result.evolved.push({ mode, id: preset.id, ...state });
        await modePage.evaluate(frames => new Promise(resolve => {
          function next() { if (--frames <= 0) resolve(); else requestAnimationFrame(next); }
          requestAnimationFrame(next);
        }), mode === 'trails' ? 20 : 2);
        if (mode === 'fallback') {
          const drawn = await modePage.evaluate(() => {
            const pn = window.particleInstance;
            const data = pn.g.getImageData(0, 0, pn.canvas.width, pn.canvas.height).data;
            let colored = 0;
            for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] > 30) colored++;
            return !pn.glRenderer && colored > 100;
          });
          assert(drawn, `Canvas fallback must draw particles and lines for ${preset.id}`);
        }
        if (output) {
          await modePage.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          await modePage.screenshot({ path: path.join(output, `${mode}-${preset.id}.png`) });
        }
      }
      await modeContext.close();
    }

    result.benchmarks = await page.evaluate(() => {
      const pn = window.particleInstance;
      const samples = [];
      pn.gravityWellInfoExpanded = false;
      for (const count of [1000, 5000]) {
        pn.setParticleCount(count);
        for (const id of [null, 'binary', 'triple-halo']) {
          if (id) pn.applyGravityWellPreset(id); else pn.clearGravityWells();
          for (let i = 0; i < 30; i++) pn._updateSoA();
          const timings = [];
          for (let trial = 0; trial < 5; trial++) {
            const start = performance.now();
            for (let frame = 0; frame < 120; frame++) pn._updateSoA();
            timings.push((performance.now() - start) / 120);
          }
          timings.sort((a, b) => a - b);
          samples.push({ particles: count, wells: pn.gravityWells.length, medianPhysicsMs: timings[2] });
        }
      }
      return samples;
    });
    await page.evaluate(() => {
      const pn = window.particleInstance;
      pn.applyGravityWellPreset('binary');
      pn.resetGravityWellPreset();
      if (pn.activeGravityWellPreset || pn.lastGravityWellPresetId || pn._gravityWellPresetAdjustment) throw new Error('reset state');
      pn.destroy();
      if (pn.activeGravityWellPreset || pn.lastGravityWellPresetId || pn._gravityWellPresetAdjustment || pn._gravityWellPresetViewport) throw new Error('destroy state');
    });
    await context.close();
    assert.deepEqual(errors, []);
    result.browserErrors = errors;
    result.passed = true;
    if (output) fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
