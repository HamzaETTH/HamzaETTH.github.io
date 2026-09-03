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
      defaultValue: window.particleSettingsUi.params.blackHoleLineColor,
      hasLabel: document.body.textContent.includes('Black Hole Line Color')
    }));

    const runtime = await page.evaluate(() => {
      const pn = window.particleInstance;
      const benchmark = new window.BenchmarkSystem(pn);
      const stop = () => {
        if (pn._rafId != null) cancelAnimationFrame(pn._rafId);
        pn._rafId = null;
        pn._rafActive = false;
      };
      const frame = () => {
        stop();
        pn._lastUpdateTime = performance.now() - 1000 / 60;
        pn.update();
        stop();
      };
      const captureGlVertices = () => {
        frame();
        const vertices = [];
        for (let i = 0; i < pn.glRenderer.vertexCount; i++) {
          vertices.push({
            x: pn.glRenderer.positions[i * 2],
            y: pn.glRenderer.positions[i * 2 + 1],
            r: pn.glRenderer.colors[i * 4],
            g: pn.glRenderer.colors[i * 4 + 1],
            b: pn.glRenderer.colors[i * 4 + 2]
          });
        }
        return vertices;
      };
      const isBaseGreen = vertex => Math.abs(vertex.r) < 0.001 &&
        Math.abs(vertex.g - 1) < 0.001 && Math.abs(vertex.b) < 0.001;

      const baseLineOptions = {
        adaptiveLineDetail: false,
        cellularLineClusters: false,
        interactive: false,
        velocity: 0,
        particleRepulsion: false,
        particleAttraction: false,
        particleCollision: false,
        gravityWellForceMultiplier: 0,
        gravityWellMotion: 'static',
        lineColorCycling: false,
        gradientEffect: false,
        gradientColor1: '#00ff00',
        gradientColor2: '#00ff00',
        useDistanceEffect: false,
        lineConnectionDistance: 400,
        maxColorChangeDistance: 400,
        lineJitter: false,
        trails: false
      };
      const applyLineOptions = enabled => Object.assign(
        pn.options,
        baseLineOptions,
        { blackHoleLineColor: enabled }
      );

      stop();
      applyLineOptions(false);
      benchmark.setParticleCount(4);
      stop();

      const centerX = pn.i.size.width * 0.5;
      const centerY = pn.i.size.height * 0.5;
      const positions = [
        [centerX + 8, centerY],
        [centerX + 30, centerY + 2],
        [centerX + 230, centerY],
        [centerX + 250, centerY + 2]
      ];
      positions.forEach(([x, y], index) => {
        const particle = pn.o[index];
        particle.x = x;
        particle.y = y;
        particle.velocity.x = 0;
        particle.velocity.y = 0;
        pn.posX[index] = x;
        pn.posY[index] = y;
        pn.velX[index] = 0;
        pn.velY[index] = 0;
      });
      pn.initGrid();
      pn.clearGravityWells();
      const blackHole = pn.addGravityWell('black', centerX, centerY, 120);
      pn.updateGravityWell(blackHole.id, { innerColor: '#ff0000', outerColor: '#0000ff' });
      stop();
      applyLineOptions(false);

      const offVertices = captureGlVertices();
      const buffersBeforeEnable = pn._blackHoleLineTintStrength;

      applyLineOptions(true);
      const onVertices = captureGlVertices();
      const nearVertices = onVertices.filter(vertex => vertex.x < centerX + 100);
      const farVertices = onVertices.filter(vertex => vertex.x > centerX + 200);

      pn.clearGravityWells();
      pn.addGravityWell('white', centerX, centerY, 120);
      stop();
      applyLineOptions(true);
      const whiteHoleVertices = captureGlVertices();
      pn.reverseGravityWell(pn.gravityWells[0].id);
      stop();
      applyLineOptions(true);
      const reversedWhiteVertices = captureGlVertices();
      const reversedWhiteNear = reversedWhiteVertices.filter(vertex => vertex.x < centerX + 100);

      pn.clearGravityWells();
      const fallbackBlackHole = pn.addGravityWell('black', centerX, centerY, 120);
      pn.updateGravityWell(fallbackBlackHole.id, { innerColor: '#ff0000', outerColor: '#0000ff' });
      stop();
      applyLineOptions(true);
      const savedRenderer = pn.glRenderer;
      const originalCreateGradient = pn.g.createLinearGradient;
      const canvasStops = [];
      pn.g.createLinearGradient = function(...args) {
        const gradient = originalCreateGradient.apply(this, args);
        const originalAddColorStop = gradient.addColorStop.bind(gradient);
        gradient.addColorStop = function(offset, color) {
          canvasStops.push(String(color));
          return originalAddColorStop(offset, color);
        };
        return gradient;
      };
      pn.glRenderer = null;
      frame();
      pn.glRenderer = savedRenderer;
      pn.g.createLinearGradient = originalCreateGradient;

      applyLineOptions(false);
      frame();

      return {
        optionEnabled: onVertices.length > 0 && pn._blackHoleLineTintStrength !== null,
        optionDisabledAfterApply: pn.options.blackHoleLineColor === false && pn._blackHoleLineTintActive === false,
        lazyAllocation: buffersBeforeEnable === null,
        offVertexCount: offVertices.length,
        onVertexCount: onVertices.length,
        offAllBase: offVertices.every(isBaseGreen),
        nearChanged: nearVertices.length > 0 && nearVertices.some(vertex => !isBaseGreen(vertex)),
        farUnchanged: farVertices.length > 0 && farVertices.every(isBaseGreen),
        whiteHoleUnchanged: whiteHoleVertices.length === offVertices.length && whiteHoleVertices.every(isBaseGreen),
        reversedWhiteTintsAsBlack: reversedWhiteNear.length > 0 &&
          reversedWhiteNear.some(vertex => !isBaseGreen(vertex)),
        canvasTintedStops: canvasStops.filter(color => color.startsWith('rgb(') && color !== 'rgb(0,255,0)').length,
        rendererHealthy: Boolean(savedRenderer && savedRenderer.gl && !savedRenderer.gl.isContextLost())
      };
    });

    const assertions = {
      defaultOffAndControlPresent: ui.defaultValue === false && ui.hasLabel,
      offStatePreservesBaseColor: runtime.offVertexCount > 0 && runtime.offAllBase,
      enabledTintsOnlyNearbyEndpoints: runtime.onVertexCount === runtime.offVertexCount &&
        runtime.nearChanged && runtime.farUnchanged,
      whiteHolesAreUnaffected: runtime.whiteHoleUnchanged,
      reversedWhiteUsesEffectiveBlackType: runtime.reversedWhiteTintsAsBlack,
      canvasFallbackUsesTint: runtime.canvasTintedStops > 0,
      buffersAreLazyAndDisableCleanly: runtime.lazyAllocation && runtime.optionEnabled && runtime.optionDisabledAfterApply,
      rendererHealthy: runtime.rendererHealthy,
      noBrowserErrors: browserErrors.length === 0
    };
    const result = { passed: Object.values(assertions).every(Boolean), assertions, ui, runtime, browserErrors };
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
