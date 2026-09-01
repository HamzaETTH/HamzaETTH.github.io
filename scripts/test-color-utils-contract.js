#!/usr/bin/env node

const { chromium } = require('playwright');

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--baseline') options.baseline = argv[++i];
    else if (arg === '--optimized') options.optimized = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.baseline || !options.optimized) {
    throw new Error('--baseline and --optimized are required');
  }
  return options;
}

async function snapshot(page, url) {
  const errors = [];
  const onConsole = message => {
    if (message.type() === 'error') errors.push({ type: 'console', text: message.text() });
  };
  const onPageError = error => errors.push({ type: 'pageerror', text: String(error) });
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => window.ColorUtils && window.particleInstance, null, { timeout: 30000 });
    const contract = await page.evaluate(() => {
      const utils = window.ColorUtils;
      const originalRandom = Math.random;
      Math.random = () => 0.25;
      try {
        return {
          keys: Object.keys(utils).sort(),
          methods: { ...window.ColorDiffMethod },
          samples: {
            hexToRgb: utils.hexToRgb('#12abef'),
            hslToRgb: utils.hslToRgb(210, 75, 40),
            rgbToHsl: utils.rgbToHsl(18, 171, 239),
            rgbArrayToString: utils.rgbArrayToString([18, 171, 239]),
            hueDistance: utils.hueDistance(30, 50),
            complementary: utils.complementary(30),
            triadic: utils.triadic(30, 2),
            analogous: utils.analogous(30, -1, 25),
            generated: Object.values(window.ColorDiffMethod).map(method => [
              method,
              utils.generateDistinctColor(30, method, {
                minDifference: 50,
                index: 2,
                spread: 25,
                minDeltaE: 30,
                minRatio: 4.5
              })
            ])
          },
          runtime: {
            particleCount: window.particleInstance.o.length,
            hasWebGl: Boolean(window.particleInstance.glRenderer && window.particleInstance.glRenderer.gl),
            webGlContextLost: Boolean(
              window.particleInstance.glRenderer &&
              window.particleInstance.glRenderer.gl &&
              window.particleInstance.glRenderer.gl.isContextLost()
            )
          }
        };
      } finally {
        Math.random = originalRandom;
      }
    });
    return { contract, errors };
  } finally {
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const baseline = await snapshot(page, options.baseline);
    const optimized = await snapshot(page, options.optimized);
    const equivalent = JSON.stringify(baseline.contract) === JSON.stringify(optimized.contract);
    const result = { equivalent, baseline, optimized };
    console.log('RESULTS_JSON=' + JSON.stringify(result));
    if (!equivalent || baseline.errors.length || optimized.errors.length) process.exitCode = 2;
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
