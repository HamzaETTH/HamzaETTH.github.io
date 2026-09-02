#!/usr/bin/env node

const fs = require('node:fs');
const { chromium } = require('playwright');

function parseArgs(argv) {
  const options = { expect: 'baseline', output: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--url') options.url = argv[++i];
    else if (arg === '--expect') options.expect = argv[++i];
    else if (arg === '--output') options.output = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.url) throw new Error('--url is required');
  if (!['baseline', 'optimized'].includes(options.expect)) {
    throw new Error('--expect must be baseline or optimized');
  }
  return options;
}

async function installProbe(page) {
  await page.addInitScript(() => {
    const nativeAdd = EventTarget.prototype.addEventListener;
    const nativeRemove = EventTarget.prototype.removeEventListener;
    const nativeRaf = window.requestAnimationFrame.bind(window);
    const nativeCancelRaf = window.cancelAnimationFrame.bind(window);
    const nativeSetTimeout = window.setTimeout.bind(window);
    const nativeClearTimeout = window.clearTimeout.bind(window);
    const listeners = [];
    const activeRafs = new Set();
    const activeTimeouts = new Set();

    function capture(options) {
      return typeof options === 'boolean' ? options : Boolean(options && options.capture);
    }
    function targetName(target) {
      if (target === window) return 'window';
      if (target === document) return 'document';
      if (target && target.id) return `#${target.id}`;
      return target && target.nodeName ? target.nodeName.toLowerCase() : 'other';
    }

    EventTarget.prototype.addEventListener = function (type, listener, options) {
      listeners.push({ target: this, targetName: targetName(this), type, listener, capture: capture(options), active: true });
      return nativeAdd.call(this, type, listener, options);
    };
    EventTarget.prototype.removeEventListener = function (type, listener, options) {
      const useCapture = capture(options);
      for (let i = listeners.length - 1; i >= 0; i--) {
        const item = listeners[i];
        if (item.active && item.target === this && item.type === type &&
            item.listener === listener && item.capture === useCapture) {
          item.active = false;
          break;
        }
      }
      return nativeRemove.call(this, type, listener, options);
    };
    window.requestAnimationFrame = callback => {
      let id = null;
      id = nativeRaf(timestamp => {
        activeRafs.delete(id);
        callback(timestamp);
      });
      activeRafs.add(id);
      return id;
    };
    window.cancelAnimationFrame = id => {
      activeRafs.delete(id);
      return nativeCancelRaf(id);
    };
    window.setTimeout = (callback, delay, ...args) => {
      let id = null;
      id = nativeSetTimeout(() => {
        activeTimeouts.delete(id);
        callback(...args);
      }, delay);
      activeTimeouts.add(id);
      return id;
    };
    window.clearTimeout = id => {
      activeTimeouts.delete(id);
      return nativeClearTimeout(id);
    };

    window.__lifecycleProbe = {
      snapshot() {
        const activeListeners = listeners.filter(item => item.active);
        const byTargetType = {};
        for (const item of activeListeners) {
          const key = `${item.targetName}:${item.type}`;
          byTargetType[key] = (byTargetType[key] || 0) + 1;
        }
        return {
          activeListenerCount: activeListeners.length,
          byTargetType,
          activeRafCount: activeRafs.size,
          activeTimeoutCount: activeTimeouts.size
        };
      }
    };
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await installProbe(page);
    const browserErrors = [];
    page.on('console', message => {
      if (message.type() === 'error') browserErrors.push({ type: 'console', text: message.text() });
    });
    page.on('pageerror', error => browserErrors.push({ type: 'pageerror', text: String(error) }));

    await page.goto(options.url, { waitUntil: 'load' });
    await page.waitForFunction(() => window.particleInstance && window.particleInstance._rafActive);
    await page.keyboard.press('c');
    await page.waitForFunction(() => {
      const container = document.getElementById('tp-container');
      return container && getComputedStyle(container).display !== 'none';
    }, null, { timeout: 30000 });
    await page.keyboard.press('c');

    let evidence;
    if (options.expect === 'baseline') {
      evidence = await page.evaluate(async () => {
        const before = window.__lifecycleProbe.snapshot();
        const target = document.createElement('div');
        target.id = 'destroy-baseline-target';
        target.style.cssText = 'position:absolute;width:640px;height:360px;left:-2000px;top:0';
        document.body.appendChild(target);
        const leaked = new window.ParticleNetwork(target, { ...window.options });
        await new Promise(resolve => setTimeout(resolve, 100));
        const afterCreate = window.__lifecycleProbe.snapshot();
        target.remove();
        await new Promise(resolve => setTimeout(resolve, 100));
        const afterDetach = window.__lifecycleProbe.snapshot();
        const rafWasActive = leaked._rafActive || leaked._rafId != null;
        if (leaked._rafId != null) cancelAnimationFrame(leaked._rafId);
        leaked._rafActive = false;
        return {
          contracts: {
            engineDestroy: typeof leaked.destroy,
            rendererDestroy: typeof leaked.glRenderer.destroy,
            monitorDestroy: typeof leaked.performanceMonitor.destroy,
            hotkeyDestroy: typeof window.hotkeyManager.destroy,
            experienceDestroy: typeof window.destroyParticleExperience,
            experienceCreate: typeof window.createParticleExperience
          },
          before,
          afterCreate,
          afterDetach,
          detachedInstance: {
            rafWasActive,
            containerConnected: target.isConnected,
            engineContainerConnected: leaked.k.isConnected,
            canvasConnected: leaked.canvas.isConnected,
            glCanvasConnected: leaked.glRenderer.canvas.isConnected,
            particleCount: leaked.o.length,
            webGlContextLost: leaked.glRenderer.gl.isContextLost()
          }
        };
      });
    } else {
      await page.keyboard.press('h');
      await page.keyboard.press('p');
      evidence = await page.evaluate(async () => {
        if (typeof window.destroyParticleExperience !== 'function' ||
            typeof window.createParticleExperience !== 'function') return null;
        const cycles = [];
        for (let cycle = 0; cycle < 2; cycle++) {
          const old = window.particleInstance;
          const oldGl = old.glRenderer && old.glRenderer.gl;
          let staleFrames = 0;
          const oldUpdate = old.update;
          old.update = function () {
            staleFrames++;
            return oldUpdate.apply(old, arguments);
          };
          await new Promise(resolve => setTimeout(resolve, 50));
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
          window.destroyParticleExperience();
          window.destroyParticleExperience();
          const framesAtDestroy = staleFrames;
          await new Promise(resolve => setTimeout(resolve, 100));
          const snapshot = window.__lifecycleProbe.snapshot();
          cycles.push({
            destroyed: old._destroyed === true,
            rafActive: old._rafActive,
            rafIdPresent: old._rafId != null,
            containerConnected: Boolean(old.k && old.k.isConnected),
            canvasConnected: Boolean(old.canvas && old.canvas.isConnected),
            glContextLost: oldGl ? oldGl.isContextLost() : true,
            staleFramesAfterDestroy: staleFrames - framesAtDestroy,
            storageReleased: old.o === null && old.grid === null && old.posX === null &&
              old.posY === null && old.velX === null && old.velY === null && old.sizeA === null,
            listenersReleased: old.__lifecycleListeners.length === 0,
            globalsReleased: window.particleInstance === null && window.hotkeyManager === null &&
              window.__PN_ACTIVE_MONITOR__ === null && window._benchmarkRunner == null &&
              document.querySelectorAll('#tp-container').length === 0,
            snapshot
          });
          window.createParticleExperience();
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        const live = window.particleInstance;
        return {
          cycles,
          final: {
            particleCount: live.o.length,
            containerOffset: [live.i.offsetWidth, live.i.offsetHeight],
            containerSize: [live.i.size.width, live.i.size.height],
            density: live.options.density,
            rafActive: live._rafActive,
            rafIdPresent: live._rafId != null,
            canvases: document.querySelectorAll('#particle-canvas canvas').length,
            containers: document.querySelectorAll('#particle-canvas > div').length,
            overlays: document.querySelectorAll('.performance-overlay').length,
            paneContainers: document.querySelectorAll('#tp-container').length,
            hotkeys: Array.from(window.hotkeyManager.handlers.keys()).sort(),
            webGlContextLost: live.glRenderer.gl.isContextLost(),
            snapshot: window.__lifecycleProbe.snapshot()
          }
        };
      });
    }

    if (options.expect === 'optimized' && evidence) {
      await page.keyboard.press('c');
      await page.waitForFunction(() => {
        const container = document.getElementById('tp-container');
        return container && getComputedStyle(container).display !== 'none';
      }, null, { timeout: 30000 });
      evidence.recreatedUi = await page.evaluate(() => {
        const container = document.getElementById('tp-container');
        return {
          paneContainers: document.querySelectorAll('#tp-container').length,
          populated: Boolean(container && container.querySelector('.tp-dfwv, .tp-rotv')),
          visible: Boolean(container && getComputedStyle(container).display !== 'none'),
          hotkeys: Array.from(window.hotkeyManager.handlers.keys()).sort()
        };
      });
      await page.keyboard.press('c');

      const racePage = await context.newPage();
      racePage.on('console', message => {
        if (message.type() === 'error') browserErrors.push({ type: 'console', text: message.text() });
      });
      racePage.on('pageerror', error => browserErrors.push({ type: 'pageerror', text: String(error) }));
      await racePage.goto(options.url, { waitUntil: 'load' });
      await racePage.waitForFunction(() => window.hotkeyManager && window.hotkeyManager.handlers.has('c'));
      await racePage.keyboard.press('b');
      await racePage.keyboard.press('c');
      await racePage.evaluate(() => window.destroyParticleExperience());
      await racePage.waitForTimeout(1000);
      evidence.pendingBuild = await racePage.evaluate(() => ({
        particleInstance: window.particleInstance,
        hotkeyManager: window.hotkeyManager,
        activeMonitor: window.__PN_ACTIVE_MONITOR__,
        paneContainers: document.querySelectorAll('#tp-container').length,
        canvases: document.querySelectorAll('#particle-canvas canvas').length,
        benchmarkOverlays: document.querySelectorAll('#bench-overlay').length
      }));
      await racePage.close();
    }

    const missingContracts = evidence && Object.values(evidence.contracts || {}).every(value => value === 'undefined');
    const ownedGlobalListenerKeys = [
      'window:resize', 'window:keydown', 'window:keyup',
      'document:contextmenu', 'document:keydown', 'document:keyup', 'document:visibilitychange'
    ];
    const assertions = options.expect === 'baseline' ? {
      teardownContractsMissing: missingContracts,
      detachedEngineStayedRetained: Boolean(evidence &&
        !evidence.detachedInstance.containerConnected &&
        !evidence.detachedInstance.engineContainerConnected &&
        !evidence.detachedInstance.canvasConnected &&
        !evidence.detachedInstance.glCanvasConnected &&
        evidence.detachedInstance.particleCount > 0 &&
        !evidence.detachedInstance.webGlContextLost),
      listenersAccumulated: Boolean(evidence &&
        evidence.afterCreate.activeListenerCount > evidence.before.activeListenerCount)
    } : {
      lifecycleApiPresent: Boolean(evidence),
      twoCleanDestroyCycles: Boolean(evidence && evidence.cycles.length === 2 && evidence.cycles.every(cycle =>
        cycle.destroyed && !cycle.rafActive && !cycle.rafIdPresent &&
        !cycle.containerConnected && !cycle.canvasConnected && cycle.glContextLost &&
        cycle.staleFramesAfterDestroy === 0 && cycle.storageReleased &&
        cycle.listenersReleased && cycle.globalsReleased &&
        cycle.snapshot.activeRafCount === 0 && cycle.snapshot.activeTimeoutCount === 0 &&
        ownedGlobalListenerKeys.every(key => !cycle.snapshot.byTargetType[key]))),
      oneHealthyLiveInstance: Boolean(evidence && evidence.final.particleCount > 0 &&
        evidence.final.rafActive && evidence.final.rafIdPresent &&
        evidence.final.canvases === 2 && evidence.final.containers === 1 &&
        evidence.final.overlays === 1 && evidence.final.paneContainers === 0 &&
        !evidence.final.webGlContextLost),
      hotkeysRecreatedOnce: Boolean(evidence &&
        JSON.stringify(evidence.final.hotkeys) === JSON.stringify(['b', 'c', 'd', 'escape', 'h', 'm', 'p', 'r', 'w'])),
      lazyPaneRecreatedOnce: Boolean(evidence && evidence.recreatedUi &&
        evidence.recreatedUi.paneContainers === 1 && evidence.recreatedUi.populated &&
        evidence.recreatedUi.visible &&
        JSON.stringify(evidence.recreatedUi.hotkeys) === JSON.stringify(['b', 'c', 'd', 'escape', 'h', 'm', 'p', 'r', 'w'])),
      pendingPaneBuildStayedDestroyed: Boolean(evidence && evidence.pendingBuild &&
        evidence.pendingBuild.particleInstance === null && evidence.pendingBuild.hotkeyManager === null &&
        evidence.pendingBuild.activeMonitor === null && evidence.pendingBuild.paneContainers === 0 &&
        evidence.pendingBuild.canvases === 0 && evidence.pendingBuild.benchmarkOverlays === 0)
    };
    assertions.noBrowserErrors = browserErrors.length === 0;
    const result = {
      passed: Object.values(assertions).every(Boolean),
      expected: options.expect,
      assertions,
      evidence,
      browserErrors
    };
    if (options.output) fs.writeFileSync(options.output, JSON.stringify(result, null, 2) + '\n');
    console.log('RESULTS_JSON=' + JSON.stringify(result));
    if (!result.passed) process.exitCode = 2;
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
