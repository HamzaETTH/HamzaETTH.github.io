#!/usr/bin/env node

const { chromium } = require('playwright');

const url = process.argv[2];
if (!url) throw new Error('Usage: rtk node scripts/test-resize-pointer.js <url>');

function sizeSnapshot() {
  const pn = window.particleInstance;
  const rect = pn.canvas.getBoundingClientRect();
  const glRect = pn.glRenderer.canvas.getBoundingClientRect();
  return {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    container: {
      offsetWidth: pn.i.offsetWidth,
      offsetHeight: pn.i.offsetHeight,
      logicalWidth: pn.i.size.width,
      logicalHeight: pn.i.size.height
    },
    canvas: {
      rectWidth: rect.width,
      rectHeight: rect.height,
      cssWidth: pn.canvas.style.width,
      cssHeight: pn.canvas.style.height,
      backingWidth: pn.canvas.width,
      backingHeight: pn.canvas.height
    },
    webgl: {
      rectWidth: glRect.width,
      rectHeight: glRect.height,
      cssWidth: pn.glRenderer.canvas.style.width,
      cssHeight: pn.glRenderer.canvas.style.height,
      backingWidth: pn.glRenderer.canvas.width,
      backingHeight: pn.glRenderer.canvas.height,
      contextLost: pn.glRenderer.gl.isContextLost()
    },
    dpr: window.devicePixelRatio
  };
}

async function openPage(browser) {
  const context = await browser.newContext({
    viewport: { width: 720, height: 480 },
    deviceScaleFactor: 1.25
  });
  const page = await context.newPage();
  const browserErrors = [];
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', error => browserErrors.push(String(error)));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.particleInstance?.glRenderer?.gl);
  return { context, page, browserErrors };
}

async function realViewportResize(browser) {
  const { context, page, browserErrors } = await openPage(browser);
  const before = await page.evaluate(sizeSnapshot);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(750);
  const after = await page.evaluate(sizeSnapshot);

  const raw = { x: 640, y: 360 };
  await page.mouse.move(raw.x, raw.y);
  await page.mouse.down({ button: 'left' });
  const pointer = await page.evaluate(({ x, y }) => {
    const pn = window.particleInstance;
    const mapped = pn._mapToLogicalCanvas({ clientX: x, clientY: y });
    const startX = x - 100;
    pn.posX[0] = startX;
    pn.posY[0] = y;
    pn.velX[0] = 0;
    pn.velY[0] = 0;
    pn._updateSoA();
    return {
      raw: { x, y },
      mapped,
      particle: { x: pn.p.x, y: pn.p.y },
      repulsionForce: pn.repulsionForce && { ...pn.repulsionForce },
      attractionForce: pn.attractionForce && { ...pn.attractionForce },
      forceProbe: {
        startX,
        endX: pn.posX[0],
        velocityX: pn.velX[0],
        velocityY: pn.velY[0]
      }
    };
  }, raw);
  await page.mouse.up({ button: 'left' });

  const passed = after.container.logicalWidth === 1280 && after.container.logicalHeight === 720 &&
    after.canvas.rectWidth === 1280 && after.canvas.rectHeight === 720 &&
    after.canvas.backingWidth === 1600 && after.canvas.backingHeight === 900 &&
    after.webgl.rectWidth === 1280 && after.webgl.rectHeight === 720 &&
    after.webgl.backingWidth === 1600 && after.webgl.backingHeight === 900 &&
    pointer.mapped.x === raw.x && pointer.mapped.y === raw.y &&
    pointer.particle.x === raw.x && pointer.particle.y === raw.y &&
    pointer.repulsionForce?.x === raw.x && pointer.repulsionForce?.y === raw.y &&
    pointer.forceProbe.endX > pointer.forceProbe.startX && pointer.forceProbe.velocityX > 0 &&
    !after.webgl.contextLost && browserErrors.length === 0;

  await context.close();
  return { passed, before, after, pointer, browserErrors };
}

async function earlyResizeEvent(browser) {
  const { context, page, browserErrors } = await openPage(browser);
  await page.evaluate(() => {
    const pn = window.particleInstance;
    window.dispatchEvent(new Event('resize'));
    pn.i.style.width = '1280px';
    pn.i.style.height = '720px';
  });
  await page.waitForTimeout(750);
  const result = await page.evaluate(sizeSnapshot);

  const passed = result.container.logicalWidth === 1280 && result.container.logicalHeight === 720 &&
    result.canvas.rectWidth === 1280 && result.canvas.rectHeight === 720 &&
    result.webgl.rectWidth === 1280 && result.webgl.rectHeight === 720 &&
    !result.webgl.contextLost && browserErrors.length === 0;
  await context.close();
  return { passed, result, browserErrors };
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const real = await realViewportResize(browser);
    const early = await earlyResizeEvent(browser);
    const passed = real.passed && early.passed;
    console.log(JSON.stringify({ passed, real, early }));
    if (!passed) process.exitCode = 2;
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
