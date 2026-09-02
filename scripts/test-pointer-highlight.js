#!/usr/bin/env node

const { chromium } = require('playwright');

const url = process.argv[2];
const screenshotPath = process.argv[3] || null;
if (!url) throw new Error('Usage: rtk node scripts/test-pointer-highlight.js <url> [screenshot-path]');

async function waitForFrames(page, count) {
  await page.evaluate(frameCount => new Promise(resolve => {
    function next() {
      if (--frameCount <= 0) resolve();
      else requestAnimationFrame(next);
    }
    requestAnimationFrame(next);
  }), count);
}

async function runScenario(browser, dpr, screenshot) {
  const context = await browser.newContext({
    viewport: { width: 800, height: 600 },
    deviceScaleFactor: dpr
  });
  const page = await context.newPage();
  const browserErrors = [];
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', error => browserErrors.push(String(error)));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.particleInstance?.glRenderer?.gl);

  const pointer = { x: 400, y: 300 };
  await page.evaluate(() => {
    const pn = window.particleInstance;
    pn.options.velocity = 0;
    pn.options.lineConnectionDistance = 110;
    pn.options.proximityEffectDistance = 90;
    pn.options.lineColorCycling = false;
    pn.options.gradientEffect = false;
    pn.options.useDistanceEffect = false;
    pn.options.gradientColor1 = '#202020';
    pn.options.gradientColor2 = '#202020';
    pn.options.proximityEffectColor = '#ff0000';
    pn.initGrid();

    const columns = 12;
    for (let index = 0; index < pn.numParticles; index++) {
      const x = 150 + (index % columns) * 45;
      const y = 100 + Math.floor(index / columns) * 45;
      pn.posX[index] = x;
      pn.posY[index] = y;
      pn.velX[index] = 0;
      pn.velY[index] = 0;
      pn.o[index].x = x;
      pn.o[index].y = y;
      pn.o[index].velocity.x = 0;
      pn.o[index].velocity.y = 0;
    }
  });
  await page.mouse.move(pointer.x, pointer.y);
  await page.evaluate(() => window.particleInstance.update());
  await waitForFrames(page, 2);

  const evidence = await page.evaluate(pointerPosition => {
    const pn = window.particleInstance;
    const renderer = pn.glRenderer;
    const proximity = pn._frameProximityColor;
    const vertices = [];
    for (let vertex = 0; vertex < renderer.vertexCount; vertex++) {
      const colorOffset = vertex * 4;
      if (Math.abs(renderer.colors[colorOffset] - proximity[0]) > 0.001 ||
          Math.abs(renderer.colors[colorOffset + 1] - proximity[1]) > 0.001 ||
          Math.abs(renderer.colors[colorOffset + 2] - proximity[2]) > 0.001) continue;
      const positionOffset = vertex * 2;
      vertices.push({
        x: renderer.positions[positionOffset] / renderer.dpr,
        y: renderer.positions[positionOffset + 1] / renderer.dpr
      });
    }
    const distances = vertices.map(vertex => Math.hypot(
      vertex.x - pointerPosition.x,
      vertex.y - pointerPosition.y
    ));
    const positionCounts = {};
    for (const vertex of vertices) {
      const key = `${vertex.x},${vertex.y}`;
      positionCounts[key] = (positionCounts[key] || 0) + 1;
    }
    const nearbyParticles = pn.o
      .filter(particle => Math.hypot(particle.x - pointerPosition.x, particle.y - pointerPosition.y) < pn.options.proximityEffectDistance)
      .map(particle => `${particle.x},${particle.y}`);
    const centroid = vertices.reduce((sum, vertex) => ({
      x: sum.x + vertex.x,
      y: sum.y + vertex.y
    }), { x: 0, y: 0 });
    if (vertices.length) {
      centroid.x /= vertices.length;
      centroid.y /= vertices.length;
    }
    return {
      actualDpr: window.devicePixelRatio,
      pointer: { x: pn.p.x, y: pn.p.y },
      coloredVertexCount: vertices.length,
      coloredPositions: Object.entries(positionCounts).map(([position, count]) => ({ position, count })),
      nearbyParticles,
      centroid,
      centroidOffset: {
        x: centroid.x - pointerPosition.x,
        y: centroid.y - pointerPosition.y
      },
      nearestDistance: distances.length ? Math.min(...distances) : null,
      farthestDistance: distances.length ? Math.max(...distances) : null,
      proximityDistance: pn.options.proximityEffectDistance,
      contextLost: renderer.gl.isContextLost()
    };
  }, pointer);

  if (screenshot && dpr === 1.25) {
    await page.evaluate(pointerPosition => {
      const marker = document.createElement('div');
      marker.style.cssText = `position:fixed;left:${pointerPosition.x - 5}px;top:${pointerPosition.y - 5}px;` +
        'width:10px;height:10px;border:2px solid #00ff00;border-radius:50%;z-index:9999;pointer-events:none';
      document.body.appendChild(marker);
    }, pointer);
    await page.screenshot({ path: screenshot });
  }

  await context.close();
  return { requestedDpr: dpr, browserErrors, ...evidence };
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const results = [];
    for (const dpr of [1, 1.25, 2]) results.push(await runScenario(browser, dpr, screenshotPath));
    const passed = results.every(result =>
      result.pointer.x === 400 && result.pointer.y === 300 &&
      result.coloredVertexCount > 0 &&
      result.coloredPositions.length === result.nearbyParticles.length &&
      Math.hypot(result.centroidOffset.x, result.centroidOffset.y) < 5 &&
      result.farthestDistance < result.proximityDistance &&
      !result.contextLost && result.browserErrors.length === 0
    );
    console.log(JSON.stringify({ passed, results }));
    if (!passed) process.exitCode = 2;
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
