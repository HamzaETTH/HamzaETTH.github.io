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

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const browserErrors = [];
    page.on('console', message => {
      if (message.type() === 'error') browserErrors.push({ type: 'console', text: message.text() });
    });
    page.on('pageerror', error => browserErrors.push({ type: 'pageerror', text: String(error) }));

    await page.goto(options.url, { waitUntil: 'load' });
    await page.waitForFunction(() => window.particleInstance && window.particleInstance._rafActive);

    const lifecycle = await page.evaluate(async () => {
      const pn = window.particleInstance;
      const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
      const originalVelocity = pn.options.velocity;
      const originalUpdate = pn.update;
      let frameCount = 0;
      let dts = [];
      let testHidden = false;

      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: () => testHidden
      });
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => testHidden ? 'hidden' : 'visible'
      });

      pn.update = function () {
        frameCount++;
        const result = originalUpdate.apply(pn, arguments);
        dts.push(pn._dt);
        return result;
      };

      const resetSample = () => {
        const sample = { frames: frameCount, dts: dts.slice() };
        frameCount = 0;
        dts = [];
        return sample;
      };
      const setHidden = hidden => {
        testHidden = hidden;
        document.dispatchEvent(new Event('visibilitychange'));
      };
      const state = () => ({
        rafActive: pn._rafActive,
        rafIdPresent: pn._rafId != null,
        resumeOnVisible: pn._resumeOnVisible,
        velocity: pn.options.velocity
      });

      await wait(250);
      const visibleRunning = resetSample();

      setHidden(true);
      await wait(250);
      const hiddenRunning = { ...resetSample(), state: state() };

      setHidden(false);
      document.dispatchEvent(new Event('visibilitychange'));
      await wait(250);
      const resumedRunning = { ...resetSample(), state: state() };

      pn.options.velocity = 0;
      await wait(100);
      resetSample();
      setHidden(true);
      await wait(100);
      setHidden(false);
      document.dispatchEvent(new Event('visibilitychange'));
      await wait(100);
      const stoppedRoundTrip = { ...resetSample(), state: state() };

      setHidden(true);
      pn.options.velocity = originalVelocity || 1;
      pn.update();
      await wait(150);
      const restartedWhileHidden = { ...resetSample(), state: state() };

      setHidden(false);
      document.dispatchEvent(new Event('visibilitychange'));
      await wait(250);
      const resumedAfterHiddenRestart = { ...resetSample(), state: state() };

      return {
        visibleRunning,
        hiddenRunning,
        resumedRunning,
        stoppedRoundTrip,
        restartedWhileHidden,
        resumedAfterHiddenRestart,
        particleCount: pn.o.length,
        hasWebGl: Boolean(pn.glRenderer && pn.glRenderer.gl),
        webGlContextLost: Boolean(pn.glRenderer && pn.glRenderer.gl && pn.glRenderer.gl.isContextLost())
      };
    });

    const firstFiniteDt = sample => sample.dts.find(value => Number.isFinite(value));
    const commonAssertions = {
      initialLoopRan: lifecycle.visibleRunning.frames >= 10,
      webGlHealthy: lifecycle.hasWebGl && !lifecycle.webGlContextLost,
      particleStateHealthy: lifecycle.particleCount > 0,
      noBrowserErrors: browserErrors.length === 0
    };
    const baselineAssertions = {
      hiddenLoopStillRuns: lifecycle.hiddenRunning.frames >= 10,
      hiddenRestartStillRuns: lifecycle.restartedWhileHidden.frames >= 10
    };
    const optimizedAssertions = {
      hiddenLoopPaused: lifecycle.hiddenRunning.frames <= 1 &&
        !lifecycle.hiddenRunning.state.rafActive && !lifecycle.hiddenRunning.state.rafIdPresent,
      runningLoopResumedOnce: lifecycle.resumedRunning.frames >= 10 &&
        lifecycle.resumedRunning.frames <= lifecycle.visibleRunning.frames * 1.5 + 2 &&
        lifecycle.resumedRunning.state.rafActive && lifecycle.resumedRunning.state.rafIdPresent,
      resumeTimebaseReset: firstFiniteDt(lifecycle.resumedRunning) < 0.05,
      stoppedStatePreserved: lifecycle.stoppedRoundTrip.frames === 0 &&
        !lifecycle.stoppedRoundTrip.state.rafActive && !lifecycle.stoppedRoundTrip.state.rafIdPresent,
      hiddenRestartDeferred: lifecycle.restartedWhileHidden.frames === 1 &&
        !lifecycle.restartedWhileHidden.state.rafActive && !lifecycle.restartedWhileHidden.state.rafIdPresent,
      hiddenRestartResumedOnce: lifecycle.resumedAfterHiddenRestart.frames >= 10 &&
        lifecycle.resumedAfterHiddenRestart.frames <= lifecycle.visibleRunning.frames * 1.5 + 2 &&
        lifecycle.resumedAfterHiddenRestart.state.rafActive &&
        lifecycle.resumedAfterHiddenRestart.state.rafIdPresent,
      hiddenRestartTimebaseReset: firstFiniteDt(lifecycle.resumedAfterHiddenRestart) < 0.05
    };
    const assertions = {
      ...commonAssertions,
      ...(options.expect === 'optimized' ? optimizedAssertions : baselineAssertions)
    };
    const result = {
      passed: Object.values(assertions).every(Boolean),
      expected: options.expect,
      assertions,
      lifecycle,
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
