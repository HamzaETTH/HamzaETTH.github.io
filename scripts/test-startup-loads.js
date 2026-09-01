#!/usr/bin/env node

const fs = require('node:fs');
const { chromium } = require('playwright');

function parseArgs(argv) {
  const options = { headless: true, output: null, requireManifest: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--url') options.url = argv[++i];
    else if (arg === '--output') options.output = argv[++i];
    else if (arg === '--headed') options.headless = false;
    else if (arg === '--require-manifest') options.requireManifest = true;
    else if (arg === '--help') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function usage() {
  console.log(`Usage:
  rtk node scripts/test-startup-loads.js --url http://127.0.0.1:8123/ [options]

Options:
  --output <path>       Save the complete JSON result
  --headed              Show the Edge window
  --require-manifest    Fail unless site.webmanifest is valid JSON with HTTP 200
  --help                Show this help`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  if (!options.url) throw new Error('--url is required');

  const responses = [];
  const requestFailures = [];
  const browserErrors = [];
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: options.headless,
    args: ['--no-first-run']
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1
    });
    const page = await context.newPage();
    page.on('response', response => {
      responses.push({
        url: response.url(),
        status: response.status(),
        resourceType: response.request().resourceType()
      });
    });
    page.on('requestfailed', request => {
      requestFailures.push({
        url: request.url(),
        resourceType: request.resourceType(),
        error: request.failure() && request.failure().errorText
      });
    });
    page.on('console', message => {
      if (message.type() === 'error') browserErrors.push({ type: 'console', text: message.text() });
    });
    page.on('pageerror', error => browserErrors.push({ type: 'pageerror', text: String(error) }));

    await page.goto(options.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(
      () => window.particleInstance && window.particleInstance.glRenderer,
      null,
      { timeout: 30000 }
    );
    await page.waitForTimeout(500);

    const runtime = await page.evaluate(() => {
      const pn = window.particleInstance;
      const navigation = performance.getEntriesByType('navigation')[0];
      const resources = performance.getEntriesByType('resource').map(entry => ({
        name: entry.name,
        initiatorType: entry.initiatorType,
        duration: entry.duration,
        transferSize: entry.transferSize,
        encodedBodySize: entry.encodedBodySize
      }));
      return {
        navigation: navigation ? {
          domContentLoaded: navigation.domContentLoadedEventEnd,
          loadEvent: navigation.loadEventEnd,
          transferSize: navigation.transferSize,
          encodedBodySize: navigation.encodedBodySize
        } : null,
        resources,
        hasParticleInstance: Boolean(pn),
        particleCount: pn && pn.o ? pn.o.length : null,
        rafActive: Boolean(pn && pn._rafActive),
        hasWebGl: Boolean(pn && pn.glRenderer && pn.glRenderer.gl),
        webGlContextLost: Boolean(
          pn && pn.glRenderer && pn.glRenderer.gl && pn.glRenderer.gl.isContextLost()
        ),
        benchmarkLoaded: typeof window.BenchmarkSystem === 'function'
      };
    });

    await page.keyboard.press('c');
    await page.waitForFunction(() => {
      const pane = document.getElementById('tp-container');
      return pane && getComputedStyle(pane).display !== 'none';
    }, null, { timeout: 30000 });
    const pane = await page.evaluate(() => {
      const element = document.getElementById('tp-container');
      return {
        exists: Boolean(element),
        visible: Boolean(element && getComputedStyle(element).display !== 'none'),
        hasControls: Boolean(element && element.querySelector('.tp-dfwv, .tp-rotv'))
      };
    });
    await page.keyboard.press('c');

    const manifest = await page.evaluate(async () => {
      const response = await fetch('/site.webmanifest', { cache: 'no-store' });
      const text = await response.text();
      let json = null;
      let parseError = null;
      try {
        json = JSON.parse(text);
      } catch (error) {
        parseError = String(error);
      }
      return {
        status: response.status,
        ok: response.ok,
        contentType: response.headers.get('content-type'),
        json,
        parseError
      };
    });

    const localResponses = responses.filter(response => response.url.startsWith(options.url));
    const scriptResponses = localResponses.filter(response => response.resourceType === 'script');
    const fontStylesheets = runtime.resources.filter(resource =>
      resource.name.startsWith('https://fonts.googleapis.com/')
    );
    const result = {
      environment: {
        browserVersion: browser.version(),
        viewport: '1280x720',
        devicePixelRatio: 1
      },
      runtime,
      pane,
      manifest,
      summary: {
        localResponseCount: localResponses.length,
        localScriptCount: scriptResponses.length,
        localScriptUrls: scriptResponses.map(response => response.url),
        fontStylesheetCount: fontStylesheets.length,
        fontStylesheetUrls: fontStylesheets.map(resource => resource.name),
        localEncodedBodyBytes: runtime.resources
          .filter(resource => resource.name.startsWith(options.url))
          .reduce((sum, resource) => sum + resource.encodedBodySize, 0)
      },
      requestFailures,
      browserErrors
    };

    if (options.output) fs.writeFileSync(options.output, JSON.stringify(result, null, 2) + '\n');
    console.log('RESULTS_JSON=' + JSON.stringify(result));

    const runtimeFailed = !runtime.hasParticleInstance || !runtime.rafActive ||
      !runtime.hasWebGl || runtime.webGlContextLost || !pane.visible || !pane.hasControls;
    const manifestFailed = options.requireManifest &&
      (manifest.status !== 200 || !manifest.ok || !manifest.json || manifest.parseError);
    if (runtimeFailed || manifestFailed || requestFailures.length || browserErrors.length) {
      process.exitCode = 2;
    }
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
