#!/usr/bin/env node

const fs = require('node:fs');
const { chromium } = require('playwright');

function parseArgs(argv) {
  const options = {
    blockTweakpane: false,
    expectDeferred: false,
    expectLazy: false,
    output: null
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--url') options.url = argv[++i];
    else if (arg === '--output') options.output = argv[++i];
    else if (arg === '--block-tweakpane') options.blockTweakpane = true;
    else if (arg === '--expect-deferred') options.expectDeferred = true;
    else if (arg === '--expect-lazy') options.expectLazy = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.url) throw new Error('--url is required');
  return options;
}

function isTweakpaneUrl(url) {
  return url.includes('cdn.jsdelivr.net/npm/tweakpane@4.0.5/');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    if (options.blockTweakpane) {
      await context.route(url => isTweakpaneUrl(url.toString()), route => route.abort('blockedbyclient'));
    }
    const page = await context.newPage();
    const browserErrors = [];
    const responses = [];
    const failedRequests = [];
    page.on('console', message => {
      if (message.type() === 'error') browserErrors.push({ type: 'console', text: message.text() });
    });
    page.on('pageerror', error => browserErrors.push({ type: 'pageerror', text: String(error) }));
    page.on('response', response => responses.push(response.url()));
    page.on('requestfailed', request => failedRequests.push({
      url: request.url(),
      error: request.failure() && request.failure().errorText
    }));
    await page.addInitScript(() => {
      let instance;
      Object.defineProperty(window, 'particleInstance', {
        configurable: true,
        get: () => instance,
        set: value => {
          instance = value;
          window.__particleInstanceSetAt = performance.now();
          window.__particleInstanceReadyState = document.readyState;
        }
      });
    });

    await page.goto(options.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => window.particleInstance, null, { timeout: 30000 });
    await page.waitForTimeout(300);
    const initial = await page.evaluate(() => {
      const pn = window.particleInstance;
      const navigation = performance.getEntriesByType('navigation')[0];
      const container = document.getElementById('tp-container');
      const classicScripts = Array.from(document.querySelectorAll('script[src]:not([type])')).map(script => ({
        src: new URL(script.getAttribute('src'), document.baseURI).href,
        defer: script.defer,
        async: script.async
      }));
      return {
        readyState: document.readyState,
        particleInstanceSetAt: window.__particleInstanceSetAt,
        particleInstanceReadyState: window.__particleInstanceReadyState,
        domContentLoaded: navigation && navigation.domContentLoadedEventEnd,
        loadEvent: navigation && navigation.loadEventEnd,
        classicScripts,
        hotkeys: window.hotkeyManager ? Array.from(window.hotkeyManager.handlers.keys()).sort() : [],
        paneContainerCount: document.querySelectorAll('#tp-container').length,
        paneExists: Boolean(container),
        paneVisible: Boolean(container && getComputedStyle(container).display !== 'none'),
        paneHasControls: Boolean(container && container.querySelector('.tp-dfwv, .tp-rotv')),
        particleCount: pn.o.length,
        rafActive: pn._rafActive,
        hasWebGl: Boolean(pn.glRenderer && pn.glRenderer.gl),
        webGlContextLost: Boolean(pn.glRenderer && pn.glRenderer.gl && pn.glRenderer.gl.isContextLost())
      };
    });
    initial.tweakpaneRequested = responses.some(isTweakpaneUrl);

    let afterFirstOpen = null;
    if (!options.blockTweakpane && initial.hotkeys.includes('c')) {
      const startedAt = performance.now();
      await page.keyboard.press('c');
      await page.waitForFunction(() => {
        const container = document.getElementById('tp-container');
        return container && getComputedStyle(container).display !== 'none';
      }, null, { timeout: 30000 });
      afterFirstOpen = await page.evaluate(() => {
        const container = document.getElementById('tp-container');
        return {
          paneContainerCount: document.querySelectorAll('#tp-container').length,
          paneVisible: getComputedStyle(container).display !== 'none',
          paneHasControls: Boolean(container.querySelector('.tp-dfwv, .tp-rotv')),
          hotkeys: Array.from(window.hotkeyManager.handlers.keys()).sort()
        };
      });
      afterFirstOpen.firstOpenMs = performance.now() - startedAt;
      afterFirstOpen.tweakpaneRequested = responses.some(isTweakpaneUrl);
      await page.keyboard.press('c');
      await page.waitForFunction(() => {
        const container = document.getElementById('tp-container');
        return container && getComputedStyle(container).display === 'none';
      }, null, { timeout: 5000 });
    }

    const expectedHotkeys = ['b', 'c', 'd', 'h', 'm', 'p', 'r'];
    const assertions = {
      particleRuntimeHealthy: initial.particleCount > 0 && initial.rafActive &&
        initial.hasWebGl && !initial.webGlContextLost,
      expectedClassicScriptCount: initial.classicScripts.length === 8
    };
    if (!options.blockTweakpane) {
      assertions.hotkeysAvailable = JSON.stringify(initial.hotkeys) === JSON.stringify(expectedHotkeys);
      assertions.firstOpenWorked = Boolean(
        afterFirstOpen && afterFirstOpen.paneVisible && afterFirstOpen.paneHasControls &&
        afterFirstOpen.paneContainerCount === 1
      );
      assertions.noBrowserErrors = browserErrors.length === 0 && failedRequests.length === 0;
    }
    if (options.expectDeferred) {
      assertions.allClassicScriptsDeferred = initial.classicScripts.every(script => script.defer && !script.async);
      assertions.engineStartedAfterParse = initial.particleInstanceReadyState === 'interactive';
    }
    if (options.expectLazy) {
      assertions.paneSkippedInitially = !initial.paneExists && !initial.tweakpaneRequested;
      assertions.tweakpaneLoadedOnOpen = Boolean(afterFirstOpen && afterFirstOpen.tweakpaneRequested);
    }
    if (options.blockTweakpane && options.expectLazy) {
      assertions.blockedCdnDidNotAffectStartup = JSON.stringify(initial.hotkeys) === JSON.stringify(expectedHotkeys) &&
        !initial.paneExists && !initial.tweakpaneRequested;
    }

    const passed = Object.values(assertions).every(Boolean);
    const result = {
      passed,
      assertions,
      initial,
      afterFirstOpen,
      browserErrors,
      failedRequests
    };
    if (options.output) fs.writeFileSync(options.output, JSON.stringify(result, null, 2) + '\n');
    console.log('RESULTS_JSON=' + JSON.stringify(result));
    if (!passed) process.exitCode = 2;
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
