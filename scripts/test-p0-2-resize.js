#!/usr/bin/env node

const { chromium } = require('playwright');

function usage() {
  console.log('Usage: rtk node scripts/test-p0-2-resize.js <url>');
}

async function waitForAnimationFrames(page, count) {
  await page.evaluate(frameCount => new Promise(resolve => {
    let remaining = frameCount;
    function next() {
      remaining--;
      if (remaining <= 0) resolve();
      else requestAnimationFrame(next);
    }
    requestAnimationFrame(next);
  }), count);
}

async function main() {
  const url = process.argv[2];
  if (!url) {
    usage();
    process.exitCode = 1;
    return;
  }

  const browserErrors = [];
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
    args: [
      '--no-first-run',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding'
    ]
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1
    });
    const page = await context.newPage();
    page.on('console', message => {
      if (message.type() === 'error') browserErrors.push({ type: 'console', text: message.text() });
    });
    page.on('pageerror', error => browserErrors.push({ type: 'pageerror', text: String(error) }));

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(
      () => window.particleInstance && window.particleInstance.glRenderer,
      null,
      { timeout: 30000 }
    );

    await page.evaluate(() => {
      const renderer = window.particleInstance.glRenderer;
      const originalResize = renderer.resize;
      renderer.__resizeCalls = 0;
      renderer.resize = function(...args) {
        renderer.__resizeCalls++;
        return originalResize.apply(this, args);
      };
    });

    await waitForAnimationFrames(page, 30);
    const stableCalls = await page.evaluate(() => window.particleInstance.glRenderer.__resizeCalls);

    await page.evaluate(() => {
      window.particleInstance.glRenderer.__resizeCalls = 0;
    });
    await page.setViewportSize({ width: 1200, height: 700 });
    await page.waitForTimeout(50);
    await page.evaluate(() => {
      const container = window.particleInstance.i;
      container.style.width = '1200px';
      container.style.height = '700px';
      window.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(800);
    const resized = await page.evaluate(() => {
      const renderer = window.particleInstance.glRenderer;
      const canvas = renderer.canvas;
      const gl = renderer.gl;
      return {
        calls: renderer.__resizeCalls,
        cssWidth: canvas.style.width,
        cssHeight: canvas.style.height,
        backingWidth: canvas.width,
        backingHeight: canvas.height,
        devicePixelRatio: window.devicePixelRatio,
        hasWebGl: Boolean(gl),
        contextLost: Boolean(gl && gl.isContextLost())
      };
    });

    const expectedBackingWidth = Math.floor(1200 * resized.devicePixelRatio);
    const expectedBackingHeight = Math.floor(700 * resized.devicePixelRatio);
    const assertions = {
      stableResizeCalls: stableCalls === 0,
      resizeEventCalls: resized.calls === 1,
      cssDimensions: resized.cssWidth === '1200px' && resized.cssHeight === '700px',
      backingDimensions: resized.backingWidth === expectedBackingWidth && resized.backingHeight === expectedBackingHeight,
      webGlHealthy: resized.hasWebGl && !resized.contextLost,
      noBrowserErrors: browserErrors.length === 0
    };
    const passed = Object.values(assertions).every(Boolean);
    const result = { url, passed, stableCalls, resized, browserErrors, assertions };
    console.log(JSON.stringify(result));
    if (!passed) process.exitCode = 2;
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
