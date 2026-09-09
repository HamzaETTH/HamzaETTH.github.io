#!/usr/bin/env node
'use strict';

const { chromium } = require('playwright');

const url = process.argv[2];
if (!url) throw new Error('Usage: rtk node scripts/benchmark-auto-adaptive-lines.js URL');

async function main() {
  const browserErrors = [];
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
    args: ['--no-first-run', '--disable-background-timer-throttling', '--disable-renderer-backgrounding']
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('console', message => {
      if (message.type() === 'error') browserErrors.push({ type: 'console', text: message.text() });
    });
    page.on('pageerror', error => browserErrors.push({ type: 'pageerror', text: String(error) }));
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => window.particleInstance?._adaptiveLineDetailController, null, { timeout: 30000 });

    const result = await page.evaluate(async () => {
      const pn = window.particleInstance;
      const count = 1200;
      const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
      const localMedian = values => {
        const sorted = [...values].sort((a, b) => a - b);
        const middle = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
      };
      if (pn._rafId != null) cancelAnimationFrame(pn._rafId);
      pn._rafId = null;
      pn._rafActive = false;
      Object.assign(pn.options, {
        autoAdaptiveLineDetail: true,
        adaptiveLineDetail: false,
        cellularLineClusters: false,
        interactive: false,
        velocity: 0.001,
        particleAttraction: false,
        particleRepulsion: false,
        particleCollision: false,
        lineConnectionDistance: 120,
        maxColorChangeDistance: 120,
        lineJitter: false,
        trails: false,
        gravityWellsEnabled: false
      });
      pn.clearGravityWells();
      pn.setParticleCount(count);
      if (pn._rafId != null) cancelAnimationFrame(pn._rafId);
      pn._rafId = null;
      pn._rafActive = false;
      const width = pn.i.size.width;
      const height = pn.i.size.height;
      const clusterRadius = 70;
      for (let i = 0; i < count; i++) {
        const angle = i * 2.399963229728653;
        const radius = clusterRadius * Math.sqrt((i + 0.5) / count);
        const x = width * 0.5 + Math.cos(angle) * radius;
        const y = height * 0.5 + Math.sin(angle) * radius;
        pn.posX[i] = x;
        pn.posY[i] = y;
        pn.velX[i] = 0;
        pn.velY[i] = 0;
      }
      pn._syncObjectsFromSoA();
      pn.initGrid();

      const samples = { before: [], after: [] };
      let phase = 'before';
      let activatedAt = null;
      let previous = performance.now();
      let sampling = true;
      function sample(now) {
        if (!sampling) return;
        const elapsed = now - previous;
        previous = now;
        const diagnostics = pn.lineDetailDiagnostics;
        if (elapsed > 0 && elapsed < 1000 && diagnostics && samples[phase]) {
          samples[phase].push({
            frameMs: elapsed,
            emittedSegments: diagnostics.emittedSegments,
            quality: diagnostics.qualityLevel
          });
        }
        if (phase === 'before' && pn.options.adaptiveLineDetail === true) {
          activatedAt = now;
          phase = 'settling';
        } else if (phase === 'settling' && now - activatedAt >= 1250) {
          phase = 'after';
        }
        requestAnimationFrame(sample);
      }

      pn._adaptiveLineDetailController.reset(performance.now() - 2001);
      requestAnimationFrame(sample);
      pn._ensureAnimationLoop();
      const deadline = performance.now() + 20000;
      while (phase !== 'after' && performance.now() < deadline) await wait(50);
      if (phase !== 'after') throw new Error('Dense scene did not trigger automatic Adaptive Line Detail');
      await wait(1750);
      sampling = false;
      if (pn._rafId != null) cancelAnimationFrame(pn._rafId);
      pn._rafId = null;
      pn._rafActive = false;

      const summarize = rows => ({
        frames: rows.length,
        medianFrameMs: localMedian(rows.map(row => row.frameMs)),
        medianFps: 1000 / localMedian(rows.map(row => row.frameMs)),
        medianEmittedSegments: localMedian(rows.map(row => row.emittedSegments)),
        qualityLevels: [...new Set(rows.map(row => row.quality))]
      });
      return {
        particleCount: count,
        activated: pn.options.adaptiveLineDetail === true,
        controller: pn._adaptiveLineDetailController.getState(),
        before: summarize(samples.before.slice(Math.floor(samples.before.length * 0.2))),
        after: summarize(samples.after),
        rendererHealthy: Boolean(pn.glRenderer?.gl && !pn.glRenderer.gl.isContextLost())
      };
    });

    result.frameTimeChangePct = (result.after.medianFrameMs - result.before.medianFrameMs) /
      result.before.medianFrameMs * 100;
    result.segmentChangePct = (result.after.medianEmittedSegments - result.before.medianEmittedSegments) /
      result.before.medianEmittedSegments * 100;
    result.browserErrors = browserErrors;
    result.passed = result.activated && result.rendererHealthy && browserErrors.length === 0 &&
      result.before.frames > 0 && result.after.frames > 0 &&
      result.after.medianEmittedSegments < result.before.medianEmittedSegments;
    console.log('RESULTS_JSON=' + JSON.stringify(result));
    if (!result.passed) process.exitCode = 2;
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
