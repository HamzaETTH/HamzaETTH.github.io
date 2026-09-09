#!/usr/bin/env node

const assert = require('node:assert/strict');
const { chromium } = require('playwright');

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--url') options.url = argv[++i];
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!options.url) throw new Error('--url is required');
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const browserErrors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    page.on('pageerror', error => browserErrors.push(String(error)));
    page.on('console', message => {
      if (message.type() === 'error') browserErrors.push(message.text());
    });
    await page.goto(options.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => window.particleInstance?.numParticles > 0);

    const initial = await page.evaluate(() => {
      const pn = window.particleInstance;
      const point = { x: pn.i.size.width / 2, y: pn.i.size.height / 2 };
      let farthest = 0;
      for (let i = 0; i < pn.numParticles; i++) {
        farthest = Math.max(farthest, Math.hypot(pn.posX[i] - point.x, pn.posY[i] - point.y));
      }
      return {
        state: pn._startupGravityState,
        center: point,
        size: { ...pn.i.size },
        count: pn.gravityWells.length,
        farthest,
        movingParticles: Array.from(pn.velX).filter((x, index) => x !== 0 || pn.velY[index] !== 0).length,
        gatherRadius: pn.options.gatherRadius,
        introTimer: pn._startupGravityIntroTimer != null
      };
    });
    assert.equal(initial.state, 'waiting');
    assert.deepEqual(initial.center, { x: initial.size.width / 2, y: initial.size.height / 2 });
    assert.equal(initial.count, 0);
    assert(initial.farthest <= initial.gatherRadius + 4,
      'startup particles were not initially clustered at the center');
    assert(initial.movingParticles > 0, 'startup gather discarded all particle velocity');
    assert.equal(initial.introTimer, true);

    const oneShot = await page.evaluate(() => {
      const pn = window.particleInstance;
      pn.options.particleAttraction = false;
      pn.options.particleRepulsion = false;
      pn.options.curvedDrift = false;
      pn.__startupOriginalGather = pn._gatherParticlesAt;
      pn.__startupGatherCallsAfterInit = 0;
      pn._gatherParticlesAt = function() {
        pn.__startupGatherCallsAfterInit++;
        return pn.__startupOriginalGather.apply(this, arguments);
      };
      pn.posX[0] = 40;
      pn.posY[0] = 40;
      pn.velX[0] = 0;
      pn.velY[0] = 0;
      for (let i = 0; i < 60; i++) pn._updateSoA();
      return { x: pn.posX[0], y: pn.posY[0] };
    });
    assert(Math.abs(oneShot.x - 40) < 0.01 && Math.abs(oneShot.y - 40) < 0.01,
      'startup gather continued applying force after its initial placement');

    await page.setViewportSize({ width: 900, height: 700 });
    await page.waitForFunction(() => window.particleInstance.i.size.width === 900 &&
      window.particleInstance.i.size.height === 700);
    const resized = await page.evaluate(() => {
      const pn = window.particleInstance;
      const result = {
        state: pn._startupGravityState,
        gatherCalls: pn.__startupGatherCallsAfterInit
      };
      pn._gatherParticlesAt = pn.__startupOriginalGather;
      delete pn.__startupOriginalGather;
      delete pn.__startupGatherCallsAfterInit;
      return result;
    });
    assert.equal(resized.state, 'waiting');
    assert.equal(resized.gatherCalls, 0, 'resize repeated the one-shot startup gather');

    await page.evaluate(() => {
      document.querySelector('.center-text').dispatchEvent(new AnimationEvent('animationend', {
        animationName: 'hero-overlay-fade',
        bubbles: true
      }));
    });
    const black = await page.evaluate(() => {
      const pn = window.particleInstance;
      const well = pn.gravityWells[0];
      return {
        state: pn._startupGravityState,
        well: { ...well },
        trackedId: pn._startupGravityWellId,
        selectedId: pn.selectedGravityWellId,
        selectedIds: Array.from(pn.selectedGravityWellIds),
        introTimer: pn._startupGravityIntroTimer,
        cycleTimer: pn._startupGravityWellTimer != null
      };
    });
    assert.equal(black.state, 'cycling');
    assert.equal(black.well.type, 'black');
    assert.equal(black.well.id, black.trackedId);
    assert.equal(black.well.x, 450);
    assert.equal(black.well.y, 350);
    assert.equal(black.selectedId, null);
    assert.deepEqual(black.selectedIds, []);
    assert.equal(black.introTimer, null);
    assert.equal(black.cycleTimer, true);

    const switching = await page.evaluate(() => {
      const pn = window.particleInstance;
      clearTimeout(pn._startupGravityWellTimer);
      pn._startupGravityWellTimer = null;
      const trackedId = pn._startupGravityWellId;
      const other = pn.addGravityWell('white', 100, 100, 80);
      pn._cycleStartupGravityWell();
      const whiteType = pn.getGravityWell(trackedId).type;
      const otherAfterWhite = { ...pn.getGravityWell(other.id) };
      pn._cycleStartupGravityWell();
      const blackType = pn.getGravityWell(trackedId).type;
      const otherAfterBlack = { ...pn.getGravityWell(other.id) };

      let scheduledDelay = null;
      const nativeSetTimeout = window.setTimeout;
      const nativeClearTimeout = window.clearTimeout;
      window.setTimeout = (callback, delay) => {
        scheduledDelay = delay;
        return 987654321;
      };
      window.clearTimeout = () => {};
      pn._startupGravityWellTimer = null;
      pn._scheduleStartupGravityWellCycle();
      window.setTimeout = nativeSetTimeout;
      window.clearTimeout = nativeClearTimeout;
      pn._startupGravityWellTimer = null;
      return { trackedId, otherId: other.id, whiteType, blackType, otherAfterWhite, otherAfterBlack, scheduledDelay };
    });
    assert.equal(switching.whiteType, 'white');
    assert.equal(switching.blackType, 'black');
    assert.equal(switching.otherAfterWhite.type, 'white');
    assert.deepEqual(switching.otherAfterBlack, switching.otherAfterWhite);
    assert.equal(switching.scheduledDelay, 10000);

    const presetUndo = await page.evaluate(() => {
      const pn = window.particleInstance;
      const trackedId = pn._startupGravityWellId;
      pn.applyGravityWellPreset('cross-cage', { useRecommendedMotion: false });
      const applied = { state: pn._startupGravityState, trackedId: pn._startupGravityWellId };
      pn.undoObjectSelection();
      const restored = {
        state: pn._startupGravityState,
        trackedId: pn._startupGravityWellId,
        exists: Boolean(pn.getGravityWell(trackedId)),
        timer: pn._startupGravityWellTimer != null
      };
      return { applied, restored };
    });
    assert.deepEqual(presetUndo.applied, { state: 'stopped', trackedId: null });
    assert.deepEqual(presetUndo.restored, {
      state: 'cycling',
      trackedId: switching.trackedId,
      exists: true,
      timer: true
    });

    const deleted = await page.evaluate(trackedId => {
      const pn = window.particleInstance;
      pn.removeGravityWell(trackedId);
      return {
        state: pn._startupGravityState,
        trackedId: pn._startupGravityWellId,
        timer: pn._startupGravityWellTimer,
        cycleResult: pn._cycleStartupGravityWell(),
        remainingIds: pn.gravityWells.map(well => well.id)
      };
    }, switching.trackedId);
    assert.equal(deleted.state, 'stopped');
    assert.equal(deleted.trackedId, null);
    assert.equal(deleted.timer, null);
    assert.equal(deleted.cycleResult, false);
    assert(!deleted.remainingIds.includes(switching.trackedId));
    assert.equal(deleted.remainingIds.includes(switching.otherId), true);
    assert.deepEqual(browserErrors, []);

    console.log('RESULTS_JSON=' + JSON.stringify({ passed: true, initial, black, switching, presetUndo, deleted }));
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
