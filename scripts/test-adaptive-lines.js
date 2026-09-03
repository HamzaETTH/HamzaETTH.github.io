#!/usr/bin/env node

const { chromium } = require('playwright');

function parseArgs(argv) {
  const options = { headless: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--url') options.url = argv[++i];
    else if (argv[i] === '--headless') options.headless = true;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!options.url) throw new Error('--url is required');
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const browserErrors = [];
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: options.headless,
    args: [
      '--no-first-run',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding'
    ]
  });

  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('console', message => {
      if (message.type() === 'error') browserErrors.push({ type: 'console', text: message.text() });
    });
    page.on('pageerror', error => browserErrors.push({ type: 'pageerror', text: String(error) }));
    await page.goto(options.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => window.particleInstance && window.BenchmarkSystem, null, { timeout: 30000 });

    await page.keyboard.press('c');
    await page.waitForFunction(
      () => window.particleSettingsUi && document.getElementById('tp-container')?.style.display !== 'none',
      null,
      { timeout: 30000 }
    );
    const ui = await page.evaluate(() => ({
      adaptiveDefault: window.particleSettingsUi.params.adaptiveLineDetail,
      cellularDefault: window.particleSettingsUi.params.cellularLineClusters,
      particleSizeDefault: window.particleSettingsUi.params.particleSize,
      hasAdaptiveLabel: document.body.textContent.includes('Adaptive Line Detail'),
      hasCellularLabel: document.body.textContent.includes('Grid Effect')
    }));

    const runtime = await page.evaluate(() => {
      const pn = window.particleInstance;
      const benchmark = new window.BenchmarkSystem(pn);
      const stop = () => {
        if (pn._rafId != null) cancelAnimationFrame(pn._rafId);
        pn._rafId = null;
        pn._rafActive = false;
      };
      const setScene = (count, clustered = true) => {
        stop();
        Object.assign(pn.options, {
          adaptiveLineDetail: true,
          cellularLineClusters: false,
          interactive: false,
          velocity: 0,
          particleRepulsion: false,
          particleAttraction: false,
          particleCollision: false,
          lineConnectionDistance: 120,
          maxColorChangeDistance: 120,
          lineJitter: false,
          trails: false,
          gravityWellMotion: 'static'
        });
        if (typeof pn.clearGravityWells === 'function') pn.clearGravityWells();
        benchmark.setParticleCount(count);
        stop();
        const width = pn.i.size.width;
        const height = pn.i.size.height;
        for (let i = 0; i < count; i++) {
          const angle = i * 2.399963229728653;
          const radius = clustered ? 8 + (i % 19) * 0.7 : Math.min(width, height) * 0.4;
          const x = clustered
            ? width * 0.25 + Math.cos(angle) * radius
            : ((i * 131) % (width - 40)) + 20;
          const y = clustered
            ? height * 0.25 + Math.sin(angle) * radius
            : ((i * 79) % (height - 40)) + 20;
          const particle = pn.o[i];
          particle.x = x;
          particle.y = y;
          particle.velocity.x = 0;
          particle.velocity.y = 0;
          pn.posX[i] = x;
          pn.posY[i] = y;
          pn.velX[i] = 0;
          pn.velY[i] = 0;
        }
        pn.initGrid();
      };
      const frame = elapsedSeconds => {
        stop();
        pn._lastUpdateTime = performance.now() - elapsedSeconds * 1000;
        pn.update();
        stop();
        return { ...pn.lineDetailDiagnostics };
      };

      const levelLimits = [
        { name: 'Full', maxLinks: 48, maxSegments: 96000 },
        { name: 'Balanced', maxLinks: 16, maxSegments: 32000 },
        { name: 'Reduced', maxLinks: 8, maxSegments: 16000 }
      ];
      const qualityLevels = [];
      for (let index = 0; index < levelLimits.length; index++) {
        setScene(600);
        pn._lineDetailQualityIndex = index;
        pn._lineDetailStartupTime = performance.now() + 10000;
        const diagnostics = frame(1 / 60);
        qualityLevels.push({
          index,
          diagnostics,
          withinLinkLimit: diagnostics.acceptedLogicalLines <= 600 * levelLimits[index].maxLinks / 2,
          withinSegmentLimit: diagnostics.emittedSegments <= levelLimits[index].maxSegments,
          correctName: diagnostics.qualityLevel === levelLimits[index].name
        });
      }

      setScene(120);
      pn._lineDetailQualityIndex = 0;
      pn._lineDetailStartupTime = performance.now() - 5000;
      pn._lineDetailLowFpsSeconds = 0;
      frame(0.51);
      const degradationBeforeSecondHalf = pn._lineDetailQualityIndex;
      frame(0.51);
      const degradationAfterOneSecond = pn._lineDetailQualityIndex;

      setScene(12, false);
      pn._lineDetailQualityIndex = 2;
      pn._lineDetailStartupTime = performance.now() - 5000;
      pn._lineDetailPressure = false;
      pn._lineDetailRecoverySeconds = 0;
      for (let i = 0; i < 6; i++) frame(0.5);
      const recoveryAfterThreeSeconds = pn._lineDetailQualityIndex;

      setScene(120);
      pn._lineDetailQualityIndex = 1;
      pn._lineDetailStartupTime = performance.now() - 5000;
      for (let i = 0; i < 180; i++) frame(1 / 53);
      const hysteresisQuality = pn._lineDetailQualityIndex;

      setScene(12, false);
      pn._lineDetailQualityIndex = 1;
      pn._lineDetailStartupTime = performance.now() - 5000;
      pn._lineDetailPressure = false;
      for (let i = 0; i < 3; i++) frame(0.5);
      const unrelatedLowFpsQuality = pn._lineDetailQualityIndex;

      setScene(80);
      pn.options.adaptiveLineDetail = false;
      pn.options.lineJitter = false;
      const bypass = frame(1 / 60);
      const expectedBypassLines = 80 * 79 / 2;

      setScene(240);
      pn._lineDetailQualityIndex = 0;
      pn._lineDetailStartupTime = performance.now() + 10000;
      pn.options.lineJitter = true;
      pn.options.lineJitterSegments = 6;
      const jitter = frame(1 / 60);

      pn.options.trails = true;
      const trails = frame(1 / 60);

      pn.options.trails = false;
      pn.options.lineJitter = false;
      const savedRenderer = pn.glRenderer;
      pn.glRenderer = null;
      const fallback = frame(1 / 60);
      pn.glRenderer = savedRenderer;

      setScene(160);
      pn._lineDetailStartupTime = performance.now() + 10000;
      pn.options.gravityWellMotion = 'static';
      pn.addGravityWell('black', pn.i.size.width * 0.25, pn.i.size.height * 0.25, 120);
      const reducedMotion = frame(1 / 60);

      setScene(600);
      pn.options.cellularLineClusters = false;
      pn._lineDetailQualityIndex = 0;
      pn._lineDetailStartupTime = performance.now() + 10000;
      const coverageMode = frame(1 / 60);
      pn.options.cellularLineClusters = true;
      const cellularMode = frame(1 / 60);

      setScene(600);
      pn.options.adaptiveLineDetail = false;
      pn.options.cellularLineClusters = true;
      pn._lineDetailQualityIndex = 2;
      pn._lineDetailStartupTime = performance.now() - 10000;
      const gridOnlyMode = frame(0.5);

      setScene(5000, false);
      pn.options.cellularLineClusters = false;
      pn._lineDetailQualityIndex = 0;
      pn._lineDetailStartupTime = performance.now() + 10000;
      const spatialDiagnostics = frame(1 / 60);
      const spatialBudget = { left: 0, right: 0 };
      const coverageColumns = pn._lineDetailCoverageColumns;
      for (let tileIndex = 0; tileIndex < pn._lineDetailTileSegments.length; tileIndex++) {
        const side = tileIndex % coverageColumns < coverageColumns / 2 ? 'left' : 'right';
        spatialBudget[side] += pn._lineDetailTileSegments[tileIndex];
      }
      spatialBudget.total = spatialBudget.left + spatialBudget.right;

      setScene(40, false);
      window.applyParamsToNetwork(pn, { ...pn.options, particleSize: 6 });
      const particleSizeAfterApply = {
        option: pn.options.particleSize,
        objects: pn.o.slice(0, pn.numParticles).every(particle => particle.size === 6),
        typed: Array.from(pn.sizeA).every(size => size === 6)
      };
      frame(1 / 60);
      const particleSizeAfterFrame = {
        objects: pn.o.slice(0, pn.numParticles).every(particle => particle.size === 6),
        typed: Array.from(pn.sizeA).every(size => size === 6),
        renderedPointSize: pn.glRenderer.pointSizes[0]
      };

      return {
        qualityLevels,
        degradationBeforeSecondHalf,
        degradationAfterOneSecond,
        recoveryAfterThreeSeconds,
        hysteresisQuality,
        unrelatedLowFpsQuality,
        bypass,
        expectedBypassLines,
        jitter,
        trails,
        fallback,
        reducedMotion,
        coverageMode,
        cellularMode,
        gridOnlyMode,
        spatialDiagnostics,
        spatialBudget,
        particleSizeAfterApply,
        particleSizeAfterFrame,
        cellularIsGentlerInitially: cellularMode.acceptedLogicalLines > coverageMode.acceptedLogicalLines,
        rendererHealthy: Boolean(savedRenderer && savedRenderer.gl && !savedRenderer.gl.isContextLost())
      };
    });

    await page.setViewportSize({ width: 1024, height: 640 });
    await page.waitForTimeout(650);
    const resize = await page.evaluate(() => {
      const pn = window.particleInstance;
      if (pn._rafId != null) cancelAnimationFrame(pn._rafId);
      pn._rafActive = false;
      pn.options.velocity = 0;
      pn.options.adaptiveLineDetail = true;
      pn.options.cellularLineClusters = false;
      pn._lastUpdateTime = performance.now() - 1000 / 60;
      pn.update();
      if (pn._rafId != null) cancelAnimationFrame(pn._rafId);
      pn._rafActive = false;
      const expected = Math.ceil(pn.i.size.width / 24) * Math.ceil(pn.i.size.height / 24);
      return {
        width: pn.i.size.width,
        height: pn.i.size.height,
        coverageLength: pn._lineDetailCoverage.length,
        expected,
        matches: pn._lineDetailCoverage.length === expected
      };
    });

    const assertions = {
      defaultsAndControls: ui.adaptiveDefault === false && ui.cellularDefault === false &&
        ui.particleSizeDefault === 1 &&
        ui.hasAdaptiveLabel && ui.hasCellularLabel,
      allQualityLevels: runtime.qualityLevels.every(level =>
        level.withinLinkLimit && level.withinSegmentLimit && level.correctName && level.diagnostics.pressure
      ),
      oneSecondDegradation: runtime.degradationBeforeSecondHalf === 0 && runtime.degradationAfterOneSecond === 1,
      threeSecondRecovery: runtime.recoveryAfterThreeSeconds === 1,
      hysteresisStable: runtime.hysteresisQuality === 1,
      lowFpsWithoutPressureDoesNotReduce: runtime.unrelatedLowFpsQuality <= 1,
      bypassRestoresUnlimited: runtime.bypass.candidateConnections === runtime.expectedBypassLines &&
        runtime.bypass.acceptedLogicalLines === runtime.expectedBypassLines &&
        runtime.bypass.emittedSegments === runtime.expectedBypassLines &&
        runtime.bypass.coverageRejections === 0 && runtime.bypass.hardBudgetRejections === 0 &&
        runtime.bypass.pressure === false,
      jitterAccounting: runtime.jitter.emittedSegments === runtime.jitter.acceptedLogicalLines * 6 &&
        runtime.jitter.emittedSegments <= 96000,
      trailsAndFallback: runtime.trails.acceptedLogicalLines > 0 && runtime.fallback.acceptedLogicalLines > 0,
      reducedMotionAndGravityWell: runtime.reducedMotion.pressure === true,
      cellularOptionIsGentler: runtime.cellularIsGentlerInitially,
      gridWorksWithoutAdaptive: runtime.gridOnlyMode.pressure === true &&
        runtime.gridOnlyMode.qualityLevel === 'Full' &&
        runtime.gridOnlyMode.acceptedLogicalLines > 0 &&
        runtime.gridOnlyMode.acceptedLogicalLines < runtime.gridOnlyMode.candidateConnections,
      spatialBudgetCoversBothSides: runtime.spatialBudget.total > 0 &&
        runtime.spatialBudget.left > runtime.spatialBudget.total * 0.3 &&
        runtime.spatialBudget.right > runtime.spatialBudget.total * 0.3,
      particleSizeControlPersists: runtime.particleSizeAfterApply.option === 6 &&
        runtime.particleSizeAfterApply.objects && runtime.particleSizeAfterApply.typed &&
        runtime.particleSizeAfterFrame.objects && runtime.particleSizeAfterFrame.typed &&
        runtime.particleSizeAfterFrame.renderedPointSize === 12,
      resizeCoverageGrid: resize.matches,
      rendererHealthy: runtime.rendererHealthy,
      noBrowserErrors: browserErrors.length === 0
    };
    const result = { passed: Object.values(assertions).every(Boolean), assertions, ui, runtime, resize, browserErrors };
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
