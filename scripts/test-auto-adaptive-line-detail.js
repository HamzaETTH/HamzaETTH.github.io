#!/usr/bin/env node

const { chromium } = require('playwright');

function parseArgs(argv) {
  const options = { headless: true };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--url') options.url = argv[++i];
    else if (argv[i] === '--headed') options.headless = false;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!options.url) throw new Error('--url is required');
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const browserErrors = [];
  const browser = await chromium.launch({ channel: 'msedge', headless: options.headless });

  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('console', message => {
      if (message.type() === 'error') browserErrors.push({ type: 'console', text: message.text() });
    });
    page.on('pageerror', error => browserErrors.push({ type: 'pageerror', text: String(error) }));
    await page.goto(options.url, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => {
      const pn = window.particleInstance;
      return pn && pn._adaptiveLineDetailController && window.hotkeyManager;
    }, null, { timeout: 30000 });

    const evidence = await page.evaluate(async () => {
      const pn = window.particleInstance;
      const controller = pn._adaptiveLineDetailController;
      const manager = window.hotkeyManager;
      const monitor = pn.performanceMonitor;
      const wrappedMonitorUpdate = monitor.update;
      const toastCalls = [];
      const originalShowToast = manager.showToast;
      manager.showToast = function (message, options) {
        toastCalls.push({ message, duration: options && options.duration });
      };

      if (pn._rafId != null) cancelAnimationFrame(pn._rafId);
      pn._rafId = null;
      pn._rafActive = false;
      pn.options.velocity = 0;
      if (typeof pn.clearGravityWells === 'function') pn.clearGravityWells();
      if (pn._rafId != null) cancelAnimationFrame(pn._rafId);
      pn._rafId = null;
      pn._rafActive = false;

      let now = 0;
      const setActive = active => {
        pn._rafActive = active;
        pn._rafId = active ? -1 : null;
      };
      const reset = () => {
        controller.reset(now);
        now += 2001;
        setActive(true);
        controller.recordFrame(now);
      };
      const sampleSecond = fps => {
        const frameCount = Math.round(fps);
        const frameTime = 1001 / frameCount;
        for (let frame = 0; frame < frameCount; frame++) {
          now += frameTime;
          controller.recordFrame(now);
        }
      };

      const config = window.ParticleNetworkConfig;
      const configContract = {
        defaultEnabled: config.DEFAULT_CONFIG.autoAdaptiveLineDetail === true,
        runtimeDefaultEnabled: config.createRuntimeConfig({}, value => value, value => value).autoAdaptiveLineDetail === true,
        runtimeOptOut: config.createRuntimeConfig(
          { autoAdaptiveLineDetail: false }, value => value, value => value
        ).autoAdaptiveLineDetail === false,
        networkDefaultEnabled: pn.options.autoAdaptiveLineDetail === true
      };

      controller.reset(now);
      setActive(true);
      controller.recordFrame(now);
      sampleSecond(20);
      sampleSecond(20);
      const startupIgnored = {
        enabled: pn.options.adaptiveLineDetail,
        state: controller.getState()
      };
      sampleSecond(20);
      const startupAndFirstLow = {
        enabled: pn.options.adaptiveLineDetail,
        state: controller.getState()
      };
      sampleSecond(60);
      sampleSecond(20);
      const interruptedLow = {
        enabled: pn.options.adaptiveLineDetail,
        state: controller.getState()
      };
      sampleSecond(20);
      const enabledBeforePane = {
        enabled: pn.options.adaptiveLineDetail,
        contextValue: manager.context.params.adaptiveLineDetail,
        paneAbsent: !document.getElementById('tp-container'),
        state: controller.getState(),
        toastCalls: toastCalls.slice()
      };

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }));
      const waitUntil = predicate => new Promise((resolve, reject) => {
        const started = performance.now();
        const check = () => {
          if (predicate()) return resolve();
          if (performance.now() - started > 10000) return reject(new Error('Timed out waiting for settings pane'));
          setTimeout(check, 20);
        };
        check();
      });
      await waitUntil(() => window.particleSettingsUi && document.getElementById('tp-container'));
      const ui = window.particleSettingsUi;
      const paneSyncAfterLazyBuild = ui.params.adaptiveLineDetail === true;

      controller.recordFrame(now);
      for (let second = 0; second < 4; second++) sampleSecond(45);
      const beforeRecovery = {
        enabled: pn.options.adaptiveLineDetail,
        paneValue: ui.params.adaptiveLineDetail,
        state: controller.getState()
      };
      sampleSecond(45);
      const recovered = {
        enabled: pn.options.adaptiveLineDetail,
        paneValue: ui.params.adaptiveLineDetail,
        state: controller.getState(),
        toastCalls: toastCalls.slice()
      };

      controller.recordFrame(now);
      sampleSecond(20);
      sampleSecond(20);
      const repeatedEnable = {
        enabled: pn.options.adaptiveLineDetail,
        paneValue: ui.params.adaptiveLineDetail,
        state: controller.getState(),
        toastCalls: toastCalls.slice()
      };

      reset();
      const adaptiveCheckbox = Array.from(document.querySelectorAll('input[type="checkbox"]')).find(input => {
        const row = input.closest('.tp-lblv') || input.parentElement;
        return row && row.textContent.includes('Adaptive Line Detail');
      });
      if (!adaptiveCheckbox) throw new Error('Adaptive Line Detail checkbox not found');
      adaptiveCheckbox.click();
      for (let second = 0; second < 6; second++) sampleSecond(60);
      const manualEnable = {
        enabled: pn.options.adaptiveLineDetail,
        paneValue: ui.params.adaptiveLineDetail,
        state: controller.getState()
      };
      adaptiveCheckbox.click();
      sampleSecond(20);
      sampleSecond(20);
      sampleSecond(20);
      const manualDisable = {
        enabled: pn.options.adaptiveLineDetail,
        paneValue: ui.params.adaptiveLineDetail,
        state: controller.getState()
      };
      ui.doReset();
      now += 2001;
      setActive(true);
      controller.recordFrame(now);
      sampleSecond(20);
      sampleSecond(20);
      const resetClearsOverride = {
        enabled: pn.options.adaptiveLineDetail,
        paneValue: ui.params.adaptiveLineDetail,
        state: controller.getState()
      };

      reset();
      sampleSecond(20);
      controller.pause();
      now += 10000;
      controller.resume();
      controller.recordFrame(now);
      sampleSecond(20);
      const afterOnePostResumeLow = {
        enabled: pn.options.adaptiveLineDetail,
        state: controller.getState()
      };
      sampleSecond(20);
      const afterTwoPostResumeLow = {
        enabled: pn.options.adaptiveLineDetail,
        state: controller.getState()
      };

      reset();
      setActive(false);
      for (let second = 0; second < 4; second++) sampleSecond(20);
      const stoppedIgnored = {
        enabled: pn.options.adaptiveLineDetail,
        state: controller.getState()
      };

      reset();
      sampleSecond(20);
      sampleSecond(20);
      ui.params.autoAdaptiveLineDetail = false;
      window.applyParamsToNetwork(pn, ui.params);
      const optOut = {
        configValue: pn.options.autoAdaptiveLineDetail,
        enabled: pn.options.adaptiveLineDetail,
        paneValue: ui.params.adaptiveLineDetail,
        state: controller.getState()
      };

      manager.showToast = originalShowToast;
      setActive(false);
      window.destroyParticleExperience();
      const destroyedState = controller.getState();
      controller.recordFrame(now + 10000);
      const destroyed = {
        controllerDestroyed: destroyedState.destroyed,
        propertyReleased: pn._adaptiveLineDetailController === null,
        monitorRestored: monitor.update !== wrappedMonitorUpdate,
        optionStorageReleased: pn.options === null
      };

      return {
        configContract,
        startupIgnored,
        startupAndFirstLow,
        interruptedLow,
        enabledBeforePane,
        paneSyncAfterLazyBuild,
        beforeRecovery,
        recovered,
        repeatedEnable,
        manualEnable,
        manualDisable,
        resetClearsOverride,
        afterOnePostResumeLow,
        afterTwoPostResumeLow,
        stoppedIgnored,
        optOut,
        destroyed
      };
    });

    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      hasTouch: true,
      isMobile: true
    });
    const mobilePage = await mobileContext.newPage();
    mobilePage.on('console', message => {
      if (message.type() === 'error') browserErrors.push({ type: 'mobile-console', text: message.text() });
    });
    mobilePage.on('pageerror', error => browserErrors.push({ type: 'mobile-pageerror', text: String(error) }));
    await mobilePage.goto(options.url, { waitUntil: 'load', timeout: 30000 });
    await mobilePage.waitForFunction(() => {
      const pn = window.particleInstance;
      return pn && pn._adaptiveLineDetailController;
    }, null, { timeout: 30000 });
    evidence.mobileInitial = await mobilePage.evaluate(() => {
      const pn = window.particleInstance;
      const controller = pn._adaptiveLineDetailController;
      const initialEnabled = pn.options.adaptiveLineDetail;
      if (pn._rafId != null) cancelAnimationFrame(pn._rafId);
      pn._rafId = -1;
      pn._rafActive = true;
      pn.options.velocity = 0;
      controller.reset(0);
      let now = 2001;
      controller.recordFrame(now);
      for (let second = 0; second < 6; second++) {
        for (let frame = 0; frame < 60; frame++) {
          now += 1001 / 60;
          controller.recordFrame(now);
        }
      }
      const result = {
        initialEnabled,
        afterHighFps: pn.options.adaptiveLineDetail,
        state: controller.getState()
      };
      pn._rafId = null;
      pn._rafActive = false;
      window.destroyParticleExperience();
      return result;
    });
    await mobileContext.close();

    const toastIsCorrect = calls => calls.some(call =>
      call.message === 'Adaptive Line Detail enabled — low FPS.' && call.duration === 1500
    );
    const assertions = {
      configContract: Object.values(evidence.configContract).every(Boolean),
      startupFramesIgnored: !evidence.startupIgnored.enabled &&
        evidence.startupIgnored.state.lowWindows === 0,
      oneLowWindowDoesNotEnable: !evidence.startupAndFirstLow.enabled &&
        evidence.startupAndFirstLow.state.lowWindows === 1,
      nonLowWindowBreaksStreak: !evidence.interruptedLow.enabled &&
        evidence.interruptedLow.state.lowWindows === 1,
      twoLowWindowsEnableBeforePane: evidence.enabledBeforePane.enabled &&
        evidence.enabledBeforePane.contextValue && evidence.enabledBeforePane.paneAbsent &&
        evidence.enabledBeforePane.state.autoOwned && toastIsCorrect(evidence.enabledBeforePane.toastCalls),
      lazyPaneSynchronizes: evidence.paneSyncAfterLazyBuild,
      fourHighWindowsDoNotRecover: evidence.beforeRecovery.enabled &&
        evidence.beforeRecovery.paneValue && evidence.beforeRecovery.state.highWindows === 4,
      fifthHighWindowRecoversSilently: !evidence.recovered.enabled &&
        !evidence.recovered.paneValue && !evidence.recovered.state.autoOwned &&
        evidence.recovered.toastCalls.length === evidence.enabledBeforePane.toastCalls.length,
      repeatedCycleWorks: evidence.repeatedEnable.enabled && evidence.repeatedEnable.paneValue &&
        evidence.repeatedEnable.toastCalls.length === evidence.enabledBeforePane.toastCalls.length + 1,
      mobileInitialEnableIsNeverAutoDisabled: evidence.mobileInitial.initialEnabled &&
        evidence.mobileInitial.afterHighFps && !evidence.mobileInitial.state.autoOwned &&
        !evidence.mobileInitial.state.manualOverride,
      manualEnableNeverAutoDisables: evidence.manualEnable.enabled && evidence.manualEnable.paneValue &&
        evidence.manualEnable.state.manualOverride && !evidence.manualEnable.state.autoOwned,
      manualDisableBlocksAutoEnable: !evidence.manualDisable.enabled && !evidence.manualDisable.paneValue &&
        evidence.manualDisable.state.manualOverride && !evidence.manualDisable.state.autoOwned,
      resetClearsManualOverride: evidence.resetClearsOverride.enabled && evidence.resetClearsOverride.paneValue &&
        !evidence.resetClearsOverride.state.manualOverride && evidence.resetClearsOverride.state.autoOwned,
      hiddenTimeBreaksLowStreak: !evidence.afterOnePostResumeLow.enabled &&
        evidence.afterOnePostResumeLow.state.lowWindows === 1,
      resumedMeasurementCanEnable: evidence.afterTwoPostResumeLow.enabled &&
        evidence.afterTwoPostResumeLow.state.autoOwned,
      stoppedFramesIgnored: !evidence.stoppedIgnored.enabled &&
        evidence.stoppedIgnored.state.lowWindows === 0,
      configOptOutDisablesOwnedSetting: !evidence.optOut.configValue && !evidence.optOut.enabled &&
        !evidence.optOut.paneValue && !evidence.optOut.state.autoOwned,
      destroyReleasesController: Object.values(evidence.destroyed).every(Boolean),
      noBrowserErrors: browserErrors.length === 0
    };
    const result = {
      passed: Object.values(assertions).every(Boolean),
      assertions,
      evidence,
      browserErrors
    };
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
