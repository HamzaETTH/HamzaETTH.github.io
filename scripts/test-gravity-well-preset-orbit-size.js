#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const url = process.argv[2];
if (!url) throw new Error('Usage: rtk node scripts/test-gravity-well-preset-orbit-size.js URL');

async function main() {
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
    args: ['--no-first-run', '--disable-background-timer-throttling', '--disable-renderer-backgrounding']
  });
  const browserErrors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('pageerror', error => browserErrors.push(String(error)));
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.particleInstance && window.GravityWellPresets);

    const result = await page.evaluate(() => {
      const pn = window.particleInstance;
      const preset = window.GravityWellPresets.get('diagonal-weave');
      const particleCount = 300;
      const warmupSteps = 1600;
      const sampleSteps = 400;

      function run(spin) {
        pn.setParticleCount(particleCount);
        pn.applyGravityWellPreset('diagonal-weave');
        cancelAnimationFrame(pn._rafId);
        pn._rafActive = false;
        pn._clearInteractivePointerForces();
        pn.options.interactive = false;
        pn.options.particleAttraction = false;
        pn.options.particleRepulsion = false;
        pn.options.boundaryMode = 'bounce';
        pn.options.gravityWellSpin = spin;

        const width = pn.i.size.width;
        const height = pn.i.size.height;
        for (let i = 0; i < particleCount; i++) {
          pn.posX[i] = 20 + ((i % 20) + 0.5) / 20 * (width - 40);
          pn.posY[i] = 20 + (Math.floor(i / 20) + 0.5) / 15 * (height - 40);
          const angle = i * 2.399963229728653;
          pn.velX[i] = Math.cos(angle) * 0.66;
          pn.velY[i] = Math.sin(angle) * 0.66;
          pn.sizeA[i] = 1;
        }

        const blackWells = pn.gravityWells.filter(well => well.type === 'black');
        const distances = [];
        let movingSamples = 0;
        let speedSum = 0;
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
            const speed = Math.hypot(pn.velX[i], pn.velY[i]);
            distances.push(nearest);
            speedSum += speed;
            if (speed > 0.1) movingSamples++;
          }
        }
        distances.sort((left, right) => left - right);
        return {
          spin,
          medianNormalizedDistance: distances[Math.floor(distances.length / 2)],
          interquartileRange: distances[Math.floor(distances.length * 0.75)] -
            distances[Math.floor(distances.length * 0.25)],
          meanSpeed: speedSum / distances.length,
          movingFraction: movingSamples / distances.length
        };
      }

      const baseline = run(0.08);
      const recommended = run(preset.motion.gravityWellSpin);
      return {
        recommendedSpin: preset.motion.gravityWellSpin,
        hasOrbitRadiusLock: preset.wells.some(well => 'orbitRadiusScale' in well),
        runtimeHasOrbitRadiusLock: pn.gravityWells.some(well => 'orbitRadiusScale' in well),
        baseline,
        recommended
      };
    });

    assert.equal(result.recommendedSpin, 0.18, 'Diagonal Weave recommended spin');
    assert.equal(result.hasOrbitRadiusLock, false, 'preset must use only natural well physics');
    assert.equal(result.runtimeHasOrbitRadiusLock, false, 'runtime wells must use only natural well physics');
    assert.ok(result.recommended.medianNormalizedDistance >= result.baseline.medianNormalizedDistance * 2,
      `recommended orbit ${result.recommended.medianNormalizedDistance} must exceed old orbit ${result.baseline.medianNormalizedDistance}`);
    assert.ok(result.recommended.movingFraction > 0.95, 'particles must remain actively moving');
    assert.deepEqual(browserErrors, [], `browser errors: ${browserErrors.join('; ')}`);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
