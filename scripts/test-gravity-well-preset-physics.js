#!/usr/bin/env node

const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const url = process.argv[2];
if (!url) throw new Error('Usage: rtk node scripts/test-gravity-well-preset-physics.js URL');

const expectedTraps = [
  'cross-cage', 'diamond-cage', 'triangular-cage', 'hexagonal-cage', 'octagonal-cage', 'split-cage',
  'twin-cages', 'double-halo', 'triangle-in-hexagon', 'white-fence', 'spiral-cage', 'compass',
  'twin-havens', 'four-havens', 'six-pockets', 'corner-refuges'
];
const cohorts = ['centered', 'scattered', 'inherited-fast', 'incoming'];
const steps = 2400;
const particleCount = 200;
const expectedRecommendedForce = 0.6;
const desktopScatteredRetentionMin = 0.98;

async function audit(page, id, cohort) {
  return page.evaluate(({ id, cohort, steps, particleCount }) => {
    const pn = window.particleInstance;
    const catalogue = window.GravityWellPresets;
    const preset = catalogue.get(id);
    pn.setParticleCount(particleCount);
    pn.applyGravityWellPreset(id);
    cancelAnimationFrame(pn._rafId);
    pn._rafActive = false;
    pn._clearInteractivePointerForces();
    pn._cursorCaptureActive = false;
    pn._cursorCapturePoint = null;
    pn._objectSelectionDrag = null;
    pn.options.interactive = false;
    pn.options.particleAttraction = false;
    pn.options.particleRepulsion = false;
    pn.options.boundaryMode = 'bounce';

    const viewport = pn._getGravityWellPresetViewport(true);
    const resolved = catalogue.resolve(id, viewport);
    const width = pn.i.size.width;
    const height = pn.i.size.height;
    const mobile = Boolean(pn._mobileLayoutMedia && pn._mobileLayoutMedia.matches);
    const bounds = resolved.usableBounds;
    // The entire arrangement is the coarse trap envelope, including wide layouts.
    const envelope = {
      left: Math.max(bounds.left, resolved.bounds.left),
      right: Math.min(bounds.right, resolved.bounds.right),
      top: Math.max(bounds.top, resolved.bounds.top),
      bottom: Math.min(bounds.bottom, resolved.bounds.bottom)
    };
    const wells = pn.gravityWells.map(well => {
      const type = well.strength < 0 ? (well.type === 'white' ? 'black' : 'white') : well.type;
      return { ...well, type, strength: Math.abs(well.strength) };
    });
    const blackWells = wells.filter(well => well.type === 'black');
    const forceMultiplier = pn.options.gravityWellForceMultiplier;
    let blackWeight = 0;
    let whiteWeight = 0;
    for (const well of wells) {
      const weight = well.strength * well.radius * well.radius;
      if (well.type === 'black') blackWeight += weight;
      else whiteWeight += weight;
    }

    function boundaryField(x, y, nx, ny, localRange) {
      let blackInward = 0;
      let whiteOutward = 0;
      for (const well of wells) {
        const dx = well.x - x;
        const dy = well.y - y;
        const distance = Math.hypot(dx, dy);
        if (distance < 0.0001) continue;
        if (localRange) {
          const range = well.type === 'black'
            ? Math.max(well.radius, Math.min(2 * well.radius, 0.45 * Math.min(width, height)))
            : 2 * well.radius;
          if (distance > range + (well.type === 'black' ? 0.01 : 0)) continue;
        }
        const softening = Math.max(12, 0.12 * well.radius);
        const magnitude = 0.012 * well.strength * well.radius * well.radius * forceMultiplier /
          (distance * distance + softening * softening);
        const inward = -(dx * nx + dy * ny) / distance * magnitude;
        if (well.type === 'black') blackInward += inward;
        else whiteOutward += inward;
      }
      return { blackInward, whiteOutward, outward: whiteOutward - blackInward };
    }

    let maximumOutward = -Infinity;
    let maximumMobileOutward = -Infinity;
    let boundaryScale = 0;
    let outwardSamples = 0;
    let samples = 0;
    for (let i = 0; i <= 256; i++) {
      for (const [x, y, nx, ny] of [
        [width * i / 256, 0, 0, -1], [width * i / 256, height, 0, 1],
        [0, height * i / 256, -1, 0], [width, height * i / 256, 1, 0]
      ]) {
        const field = boundaryField(x, y, nx, ny, false);
        maximumOutward = Math.max(maximumOutward, field.outward);
        if (field.outward > 1e-9) outwardSamples++;
        boundaryScale = Math.max(boundaryScale,
          field.blackInward > 0 ? field.whiteOutward / field.blackInward : Infinity);
        if (mobile) maximumMobileOutward = Math.max(maximumMobileOutward,
          boundaryField(x, y, nx, ny, true).outward);
        samples++;
      }
    }

    const n = pn.numParticles;
    const particleRadius = 1;
    const margin = particleRadius + 1;
    const left = bounds.left + margin;
    const right = bounds.right - margin;
    const top = bounds.top + margin;
    const bottom = bounds.bottom - margin;
    for (let i = 0; i < n; i++) {
      const angle = i * 2.399963229728653;
      const distance = Math.min(100, (right - left) / 2, (bottom - top) / 2) * Math.sqrt((i + 1) / (n + 1));
      let x = width / 2 + Math.cos(angle) * distance;
      let y = height / 2 + Math.sin(angle) * distance;
      let vx = Math.cos(angle) * (cohort === 'inherited-fast' ? 10 : 0.66);
      let vy = Math.sin(angle) * (cohort === 'inherited-fast' ? 10 : 0.66);
      if (cohort === 'scattered') {
        x = left + ((i % 20) + 0.5) / 20 * (right - left);
        y = top + (Math.floor(i / 20) + 0.5) / 10 * (bottom - top);
      } else if (cohort === 'incoming') {
        const fraction = (Math.floor(i / 4) + 0.5) / (n / 4);
        x = i % 4 < 2 ? left + fraction * (right - left) : (i % 4 === 2 ? left : right);
        y = i % 4 < 2 ? (i % 4 === 0 ? top : bottom) : top + fraction * (bottom - top);
        const dx = resolved.center.x - x;
        const dy = resolved.center.y - y;
        const length = Math.hypot(dx, dy) || 1;
        vx = 10 * dx / length;
        vy = 10 * dy / length;
      } else if (cohort === 'captured') {
        const well = blackWells[i % blackWells.length];
        const range = Math.max(well.radius, Math.min(2 * well.radius, 0.45 * Math.min(width, height)));
        const fraction = (Math.floor(i / blackWells.length) + 1) / (Math.ceil(n / blackWells.length) + 1);
        const radius = range * 0.5 * Math.sqrt(fraction);
        x = well.x + Math.cos(angle) * radius;
        y = well.y + Math.sin(angle) * radius;
      }
      pn.posX[i] = x;
      pn.posY[i] = y;
      pn.velX[i] = vx;
      pn.velY[i] = vy;
      pn.sizeA[i] = particleRadius;
    }

    const arrays = [pn.posX, pn.posY, pn.velX, pn.velY];
    const before = arrays.map(array => new Float32Array(array.length));
    const touched = new Set();
    let crossingSteps = 0;
    let corrections = 0;
    let peakSpeed = 0;
    let finite = true;
    for (let step = 0; step < steps && finite; step++) {
      for (let i = 0; i < arrays.length; i++) before[i].set(arrays[i]);
      // Observe the exact integrator's proposal before canvas correction, then
      // restore and execute its normal bounce path. No duplicated force law.
      pn.options.boundaryMode = 'audit-unbounded';
      pn._updateSoA();
      for (let i = 0; i < n; i++) {
        if (pn.posX[i] - particleRadius < 0 || pn.posX[i] + particleRadius > width ||
            pn.posY[i] - particleRadius < 0 || pn.posY[i] + particleRadius > height) {
          crossingSteps++;
          touched.add(i);
        }
        finite = finite && Number.isFinite(pn.posX[i]) && Number.isFinite(pn.posY[i]) &&
          Number.isFinite(pn.velX[i]) && Number.isFinite(pn.velY[i]);
      }
      for (let i = 0; i < arrays.length; i++) arrays[i].set(before[i]);
      pn.options.boundaryMode = 'bounce';
      pn._updateSoA();
      for (let i = 0; i < n; i++) {
        if (pn.posX[i] === particleRadius || pn.posX[i] === width - particleRadius ||
            pn.posY[i] === particleRadius || pn.posY[i] === height - particleRadius) corrections++;
        peakSpeed = Math.max(peakSpeed, Math.hypot(pn.velX[i], pn.velY[i]));
        finite = finite && Number.isFinite(pn.posX[i]) && Number.isFinite(pn.posY[i]) &&
          Number.isFinite(pn.velX[i]) && Number.isFinite(pn.velY[i]);
      }
    }
    let retained = 0;
    for (let i = 0; i < n; i++) {
      if (pn.posX[i] >= envelope.left && pn.posX[i] <= envelope.right &&
          pn.posY[i] >= envelope.top && pn.posY[i] <= envelope.bottom) retained++;
    }
    pn._syncObjectsFromSoA();
    pn._selectionUndoStack = [];
    return {
      id, cohort, viewport: { width, height }, mobile, particles: n, steps,
      trap: preset.trap === true, fits: resolved.fits,
      geometryFinite: wells.every(well => ['x', 'y', 'radius', 'strength'].every(key => Number.isFinite(well[key])) && well.radius > 0),
      fieldFinite: [blackWeight, whiteWeight, maximumOutward, boundaryScale].every(Number.isFinite),
      recommendedSpin: preset.motion.gravityWellSpin,
      curvedDrift: preset.motion.curvedDrift,
      recommendedForce: preset.motion.gravityWellForceMultiplier,
      maxAuthoredStrength: Math.max(...preset.wells.map(well => Math.abs(well.strength))),
      balance: {
        blackWeight, whiteWeight, net: blackWeight - whiteWeight,
        blackToWhiteRatio: whiteWeight > 0 ? blackWeight / whiteWeight : null,
        edgeBlackScale: Number.isFinite(boundaryScale) ? boundaryScale : null,
        suggestedBlackScale: Number.isFinite(boundaryScale) && blackWeight > 0
          ? Math.max(1.5 * whiteWeight / blackWeight, 1.15 * boundaryScale) : null,
        maximumOutwardAcceleration: maximumOutward, outwardSamples, samples,
        mobileMaximumOutwardAcceleration: mobile ? maximumMobileOutward : null
      },
      finite, crossingSteps, particlesTouchingEdge: touched.size, corrections,
      retained, retention: retained / n, peakSpeed, envelope
    };
  }, { id, cohort, steps, particleCount });
}

async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true,
    args: ['--no-first-run', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
  const result = {
    method: 'Actual _updateSoA, isolated well physics, deterministic cohorts, normal bounce; 257 samples per canvas edge.',
    containment: 'Resolved visual bounds intersected with usable canvas bounds; a coarse arrangement envelope, not an individual orbit.',
    gates: 'Desktop: no nominal centered edge contacts and at least 98% ordinary scattered retention under softened 60% preset force. Touch/mobile: no edge contacts for nominal particles seeded inside black-well capture regions; full centered/scattered cohorts are diagnostic.',
    limitations: 'Fast inherited/incoming cohorts are diagnostic. Existing mobile force ranges cannot capture every full-layout seed. No universal capture or speed guarantee.',
    cases: [], failures: [], browserErrors: []
  };
  try {
    const matrix = [
      { width: 1280, height: 900 },
      { width: 2560, height: 1440, ids: ['cross-cage', 'hexagonal-cage', 'four-havens'] },
      { width: 800, height: 800, ids: ['cross-cage', 'white-fence', 'six-pockets'] },
      { width: 390, height: 844, mobile: true, ids: ['cross-cage', 'hexagonal-cage', 'four-havens'] }
    ];
    for (const viewport of matrix) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        isMobile: Boolean(viewport.mobile), hasTouch: Boolean(viewport.mobile)
      });
      const page = await context.newPage();
      page.on('pageerror', error => result.browserErrors.push(String(error)));
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.particleInstance && window.GravityWellPresets);
      const presets = await page.evaluate(() => window.GravityWellPresets.presets.map(preset => ({ id: preset.id, trap: preset.trap })));
      for (const id of expectedTraps) {
        assert(presets.some(preset => preset.id === id && preset.trap === true), `Missing trap metadata: ${id}`);
      }
      const ids = viewport.ids || presets.filter(preset => preset.trap === true).map(preset => preset.id);
      for (const id of ids) {
        for (const cohort of viewport.mobile ? cohorts.concat('captured') : cohorts) {
          const state = await audit(page, id, cohort);
          result.cases.push(state);
          const failures = [];
          if (!state.trap || !state.fits || !state.geometryFinite || !state.fieldFinite || !state.finite) failures.push('trap metadata, geometry or finite state');
          if (state.recommendedSpin !== 0 || state.curvedDrift !== false) failures.push('trap profile must disable energy-injecting spin and drift');
          if (state.recommendedForce !== expectedRecommendedForce) failures.push('trap profile must recommend 60% all-wells force');
          if (state.maxAuthoredStrength > 50 + 1e-9) failures.push('authored strength exceeds 50 (100 at 200%)');
          if (!(state.balance.net > 0)) failures.push('net far-field attraction');
          if (state.balance.maximumOutwardAcceleration > 1e-9) failures.push('outward radial force on sampled canvas boundary');
          if (((!state.mobile && cohort === 'centered') || (state.mobile && cohort === 'captured')) && state.particlesTouchingEdge !== 0) {
            failures.push('nominal centered desktop or captured mobile particles touched canvas edge');
          }
          if (!state.mobile && cohort === 'scattered' && state.retention < desktopScatteredRetentionMin) failures.push('ordinary scattered retention below 98%');
          if (failures.length) result.failures.push({ id, cohort, viewport: state.viewport, failures });
        }
        process.stderr.write(`Audited ${id} at ${viewport.width}x${viewport.height}\n`);
      }
      await context.close();
    }
    assert.equal(result.browserErrors.length, 0, 'Browser errors occurred');
    assert.equal(result.failures.length, 0, 'Trap physics audit failed; see JSON summary');
  } finally {
    await browser.close();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
