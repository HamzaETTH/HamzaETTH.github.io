#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const url = process.argv[2];
if (!url) throw new Error('Usage: rtk node scripts/test-gravity-well-preset-orbits.js URL');

const softOrbitIds = new Set([
  'cross-cage', 'diamond-cage', 'triangular-cage', 'hexagonal-cage', 'octagonal-cage',
  'split-cage', 'twin-cages', 'double-halo', 'triangle-in-hexagon', 'checkerboard-nine',
  'checkerboard-sixteen', 'nine-anchors', 'white-fence', 'staggered-lattice', 'four-rooms',
  'corridor', 'slalom', 'crossroads', 'twin-jets', 'spiral-cage', 'satellites', 'bow-tie',
  'compass', 'constellation', 'open-field', 'staggered-anchors', 'diagonal-weave',
  'braided-lanes', 'perimeter-harbors', 'twin-havens', 'four-havens', 'six-pockets',
  'corner-refuges'
]);
const particleCount = 200;
const warmupSteps = 2400;
const sampleSteps = 600;

function expectedOrbitScale(id, type) {
  return softOrbitIds.has(id) && type === 'black' ? (id === 'spiral-cage' ? 1.05 : 1.65) : undefined;
}

async function main() {
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
    args: ['--no-first-run', '--disable-background-timer-throttling', '--disable-renderer-backgrounding']
  });
  const browserErrors = [];
  const results = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('pageerror', error => browserErrors.push(String(error)));
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.particleInstance && window.GravityWellPresets);

    const staticState = await page.evaluate(() => {
      const catalogue = window.GravityWellPresets;
      return {
        initialWellsMarked: window.particleInstance.gravityWells.some(well =>
          Object.prototype.hasOwnProperty.call(well, 'orbitRadiusScale')),
        presets: catalogue.presets.map(preset => ({
          id: preset.id,
          softOrbit: preset.softOrbit,
          force: preset.motion.gravityWellForceMultiplier,
          authoredTypes: preset.wells.map(well => well.type),
          resolvedScales: catalogue.resolve(preset.id, { width: 1280, height: 900 }).wells
            .map(well => well.orbitRadiusScale)
        }))
      };
    });
    assert.equal(staticState.initialWellsMarked, false, 'startup wells must retain legacy attraction');
    assert.equal(staticState.presets.length, 60, 'expected the complete preset catalogue');
    for (const preset of staticState.presets) {
      assert.equal(preset.softOrbit, softOrbitIds.has(preset.id), `${preset.id} soft orbit metadata`);
      assert.equal(preset.force, 0.6, `${preset.id} recommended force`);
      preset.authoredTypes.forEach((type, index) => {
        assert.equal(preset.resolvedScales[index], expectedOrbitScale(preset.id, type),
          `${preset.id} resolved well ${index}`);
      });
    }

    const persistence = await page.evaluate(() => {
      const pn = window.particleInstance;
      pn.applyGravityWellPreset('cross-cage');
      cancelAnimationFrame(pn._rafId);
      pn._rafActive = false;
      const initialScales = pn.gravityWells.map(well => well.orbitRadiusScale);
      pn.updateGravityWellPreset({ spacing: 110 });
      const reflowScales = pn.gravityWells.map(well => well.orbitRadiusScale);
      pn.undoObjectSelection();
      const undoScales = pn.gravityWells.map(well => well.orbitRadiusScale);
      const blackWell = pn.gravityWells.find(well => well.type === 'black');
      const previousRadius = blackWell.radius;
      pn.updateGravityWell(blackWell.id, { radius: previousRadius + 5 });
      return {
        initialScales,
        reflowScales,
        undoScales,
        detachedScale: blackWell.orbitRadiusScale,
        detachedOwnership: pn.activeGravityWellPreset,
        targetGrowth: blackWell.radius * blackWell.orbitRadiusScale - previousRadius * blackWell.orbitRadiusScale
      };
    });
    assert.deepEqual(persistence.reflowScales, persistence.initialScales, 'preset reflow must retain orbit metadata');
    assert.deepEqual(persistence.undoScales, persistence.initialScales, 'preset undo must restore orbit metadata');
    assert.equal(persistence.detachedScale, 1.65, 'customized preset wells must retain orbit metadata');
    assert.equal(persistence.detachedOwnership, null, 'customizing a well must still detach preset ownership');
    assert.equal(persistence.targetGrowth, 5 * 1.65, 'the orbit target must scale with a resized well');

    const forceShape = await page.evaluate(() => {
      const pn = window.particleInstance;
      cancelAnimationFrame(pn._rafId);
      pn._rafActive = false;
      pn.setParticleCount(1);
      pn.options.interactive = false;
      pn.options.particleAttraction = false;
      pn.options.particleRepulsion = false;
      pn.options.velocity = 0;
      pn.options.boundaryMode = 'bounce';
      pn.options.gravityWellForceMultiplier = 1;
      pn.options.gravityWellSpin = 0;
      pn.gravityWellAccelerationCapped = false;
      const radius = 100;
      const center = { x: 500, y: 400 };

      function accelerationAt(distance, marked, type, strength, spin) {
        pn.options.gravityWellSpin = spin || 0;
        pn.gravityWells = [{
          id: 'force-shape', x: center.x, y: center.y, radius,
          strength: strength === undefined ? 20 : strength,
          type: type || 'black',
          ...(marked ? { orbitRadiusScale: 1.65 } : {})
        }];
        pn.posX[0] = center.x + distance;
        pn.posY[0] = center.y;
        pn.velX[0] = 0;
        pn.velY[0] = 0;
        pn.sizeA[0] = 1;
        pn._updateSoA();
        return { x: pn.velX[0], y: pn.velY[0] };
      }

      const manual = pn.addGravityWell('black', 200, 200, 60);
      return {
        inner: accelerationAt(radius * 1.25, true),
        target: accelerationAt(radius * 1.65, true),
        outer: accelerationAt(radius * 2.05, true),
        legacyOuter: accelerationAt(radius * 2.05, false),
        innerSpin: accelerationAt(radius * 1.25, true, 'black', 20, 0.25),
        legacyInnerSpin: accelerationAt(radius * 1.25, false, 'black', 20, 0.25),
        white: accelerationAt(radius * 1.25, true, 'white'),
        manualMarked: Object.prototype.hasOwnProperty.call(manual, 'orbitRadiusScale')
      };
    });
    assert.ok(forceShape.inner.x > 0, 'inside a marked black well orbit zone must push outward');
    assert.ok(Math.abs(forceShape.target.x) < 1e-7, 'target orbit radius must have zero radial force');
    assert.deepEqual(forceShape.outer, forceShape.legacyOuter, 'outer attraction must match legacy physics');
    assert.equal(forceShape.innerSpin.y, forceShape.legacyInnerSpin.y, 'soft orbit must preserve tangential spin');
    assert.ok(forceShape.white.x > 0, 'white holes must retain repulsion');
    assert.equal(forceShape.manualMarked, false, 'manually added wells must retain legacy attraction');

    for (const preset of staticState.presets) {
      const result = await page.evaluate(({ id, expectedScale, particleCount, warmupSteps, sampleSteps }) => {
        const pn = window.particleInstance;
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

        const width = pn.i.size.width;
        const height = pn.i.size.height;
        for (let i = 0; i < particleCount; i++) {
          pn.posX[i] = 20 + ((i % 20) + 0.5) / 20 * (width - 40);
          pn.posY[i] = 20 + (Math.floor(i / 20) + 0.5) / 10 * (height - 40);
          const angle = i * 2.399963229728653;
          pn.velX[i] = Math.cos(angle) * 0.66;
          pn.velY[i] = Math.sin(angle) * 0.66;
          pn.sizeA[i] = 1;
        }

        const blackWells = pn.gravityWells.filter(well => {
          const type = well.strength < 0 ? (well.type === 'white' ? 'black' : 'white') : well.type;
          return type === 'black';
        });
        const distances = [];
        let deepCoreSamples = 0;
        const totalSteps = warmupSteps + sampleSteps;
        for (let step = 0; step < totalSteps; step++) {
          pn._updateSoA();
          if (step < warmupSteps) continue;
          for (let i = 0; i < particleCount; i++) {
            let nearest = Infinity;
            for (const well of blackWells) {
              nearest = Math.min(nearest,
                Math.hypot(pn.posX[i] - well.x, pn.posY[i] - well.y) / well.radius);
            }
            distances.push(nearest);
            if (nearest < 0.35) deepCoreSamples++;
          }
        }
        distances.sort((left, right) => left - right);
        return {
          id,
          medianRadius: distances[Math.floor(distances.length / 2)],
          deepCoreFraction: deepCoreSamples / distances.length,
          runtimeScalesMatch: pn.gravityWells.filter(well => well.type === 'black')
            .every(well => well.orbitRadiusScale === expectedScale),
          runtimeHasMarker: pn.gravityWells.some(well =>
            Object.prototype.hasOwnProperty.call(well, 'orbitRadiusScale'))
        };
      }, {
        id: preset.id,
        expectedScale: expectedOrbitScale(preset.id, 'black'),
        particleCount,
        warmupSteps,
        sampleSteps
      });
      results.push(result);
      if (softOrbitIds.has(result.id)) {
        assert.equal(result.runtimeScalesMatch, true, `${result.id} runtime orbit metadata`);
        assert.ok(result.medianRadius >= (result.id === 'diagonal-weave' ? 1.5 : 0.8),
          `${result.id} median orbit radius ${result.medianRadius}`);
        assert.ok(result.deepCoreFraction <= 0.25,
          `${result.id} deep-core fraction ${result.deepCoreFraction}`);
      } else {
        assert.equal(result.runtimeHasMarker, false, `${result.id} must retain legacy well physics`);
      }
    }
    assert.equal(browserErrors.length, 0, `browser errors: ${browserErrors.join('; ')}`);
    console.log(JSON.stringify({ presets: results.length, softOrbitPresets: softOrbitIds.size,
      minSoftOrbitMedian: Math.min(...results.filter(result => softOrbitIds.has(result.id))
        .map(result => result.medianRadius)), browserErrors }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
