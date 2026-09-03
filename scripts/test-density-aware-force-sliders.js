#!/usr/bin/env node

const assert = require('assert');
const { chromium } = require('playwright');

const url = process.argv[2];
if (!url) {
  throw new Error('Usage: rtk node scripts/test-density-aware-force-sliders.js <url>');
}

function expectedMaximum(particleCount, interactionDistance, width, height, currentValue = 0) {
  const neighbors = (particleCount - 1) * Math.PI * interactionDistance * interactionDistance / (width * height);
  const scaled = 5 / Math.sqrt(Math.max(1, neighbors));
  const recommended = Math.ceil(Math.max(1.5, Math.min(5, scaled)) * 4) / 4;
  return Math.max(recommended, currentValue);
}

async function openControls(page) {
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'c',
      code: 'KeyC',
      bubbles: true
    }));
  });
  await page.waitForFunction(() => {
    const ui = window.particleSettingsUi;
    return ui && getComputedStyle(ui.container).display !== 'none';
  });
}

async function snapshot(page) {
  return page.evaluate(() => {
    const ui = window.particleSettingsUi;
    const pn = window.particleInstance;
    const bindings = {};
    function visit(api) {
      for (const child of Array.from(api.children || [])) visit(child);
      for (const tabPage of Array.from(api.pages || [])) visit(tabPage);
      if (api.label === 'Attraction Force' || api.label === 'Repulsion Force') {
        bindings[api.label] = api;
      }
    }
    visit(ui.pane);
    function forceBinding(label) {
      const valueController = bindings[label].controller.valueController;
      return {
        max: valueController.sliderC_.props.get('max'),
        min: valueController.sliderC_.props.get('min'),
        sliderKeyScale: valueController.sliderC_.props.get('keyScale'),
        textKeyScale: valueController.textC_.props.get('keyScale'),
        inputValue: valueController.textC_.view.element.querySelector('input').value
      };
    }
    return {
      particleCount: pn.numParticles,
      interactionDistance: pn.options.particleInteractionDistance,
      width: pn.i.size.width,
      height: pn.i.size.height,
      params: {
        attraction: ui.params.particleAttractionForce,
        repulsion: ui.params.particleRepulsionForce
      },
      options: {
        attraction: pn.options.particleAttractionForce,
        repulsion: pn.options.particleRepulsionForce
      },
      attraction: forceBinding('Attraction Force'),
      repulsion: forceBinding('Repulsion Force')
    };
  });
}

async function waitForRangeSync(page) {
  await page.waitForTimeout(180);
}

async function main() {
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
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1
  });
  const page = await context.newPage();
  const browserErrors = [];
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', error => browserErrors.push(String(error)));

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => {
      const manager = window.hotkeyManager;
      return window.particleInstance && manager && manager.handlers.has('c');
    }, null, { timeout: 30000 });
    assert.strictEqual(await page.evaluate(() => Boolean(window.particleSettingsUi)), false, 'settings should remain lazy while hidden');

    await openControls(page);
    const initial = await snapshot(page);
    assert.deepStrictEqual(initial.params, { attraction: 5, repulsion: 3 });
    assert.deepStrictEqual(initial.options, { attraction: 5, repulsion: 3 });
    assert.strictEqual(initial.attraction.sliderKeyScale, 0.05);
    assert.strictEqual(initial.attraction.textKeyScale, 0.05);
    assert.strictEqual(initial.repulsion.sliderKeyScale, 0.05);
    assert.strictEqual(initial.repulsion.textKeyScale, 0.05);
    assert.deepStrictEqual(initial.params, initial.options, 'opening the panel changed force values');

    await page.evaluate(async () => {
      const ui = window.particleSettingsUi;
      const pn = window.particleInstance;
      ui.params.speed = 0;
      ui.params.particleAttractionForce = 1;
      ui.params.particleRepulsionForce = 1;
      window.applyParamsToNetwork(pn, ui.params);
      await new Promise(resolve => {
        function stopped() {
          if (!pn._rafActive && pn._rafId == null) resolve();
          else setTimeout(stopped, 10);
        }
        stopped();
      });
    });

    const fixedScenarios = [];
    for (const scenario of [
      { particleCount: 816, interactionDistance: 41 },
      { particleCount: 1632, interactionDistance: 33 }
    ]) {
      await page.evaluate(({ particleCount, interactionDistance }) => {
        const ui = window.particleSettingsUi;
        const pn = window.particleInstance;
        pn.numParticles = particleCount;
        pn.options.particleInteractionDistance = interactionDistance;
        ui.params.particleInteractionDistance = interactionDistance;
      }, scenario);
      await waitForRangeSync(page);
      const state = await snapshot(page);
      const expected = expectedMaximum(
        scenario.particleCount,
        scenario.interactionDistance,
        state.width,
        state.height,
        1
      );
      assert.strictEqual(state.attraction.max, expected);
      assert.strictEqual(state.repulsion.max, expected);
      assert.deepStrictEqual(state.params, { attraction: 1, repulsion: 1 });
      assert.deepStrictEqual(state.options, { attraction: 1, repulsion: 1 });
      fixedScenarios.push({ ...scenario, canvas: `${state.width}x${state.height}`, maximum: expected });
    }

    await page.evaluate(() => {
      const ui = window.particleSettingsUi;
      const pn = window.particleInstance;
      ui.params.particleAttractionForce = 7.35;
      ui.params.particleRepulsionForce = 6.1;
      window.applyParamsToNetwork(pn, ui.params);
    });
    await waitForRangeSync(page);
    const aboveRecommendation = await snapshot(page);
    assert.strictEqual(aboveRecommendation.attraction.max, 7.35);
    assert.strictEqual(aboveRecommendation.repulsion.max, 6.1);
    assert.deepStrictEqual(aboveRecommendation.params, { attraction: 7.35, repulsion: 6.1 });
    assert.deepStrictEqual(aboveRecommendation.options, { attraction: 7.35, repulsion: 6.1 });

    const hiddenPanel = await page.evaluate(async () => {
      const ui = window.particleSettingsUi;
      const pn = window.particleInstance;
      const bindings = {};
      function visit(api) {
        for (const child of Array.from(api.children || [])) visit(child);
        for (const tabPage of Array.from(api.pages || [])) visit(tabPage);
        if (api.label === 'Attraction Force' || api.label === 'Repulsion Force') bindings[api.label] = api;
      }
      visit(ui.pane);
      ui.params.particleAttractionForce = 1;
      ui.params.particleRepulsionForce = 1;
      window.applyParamsToNetwork(pn, ui.params);
      pn.numParticles = 100;
      pn.options.particleInteractionDistance = 1;
      ui.params.particleInteractionDistance = 1;
      await new Promise(resolve => setTimeout(resolve, 150));

      const attractionBinding = bindings['Attraction Force'];
      const repulsionBinding = bindings['Repulsion Force'];
      const attractionProps = attractionBinding.controller.valueController.sliderC_.props;
      const repulsionProps = repulsionBinding.controller.valueController.sliderC_.props;
      const before = { attraction: attractionProps.get('max'), repulsion: repulsionProps.get('max') };
      let propertyWrites = 0;
      for (const props of [attractionProps, repulsionProps]) {
        const originalSet = props.set.bind(props);
        props.set = function(key, value) {
          propertyWrites++;
          return originalSet(key, value);
        };
      }

      ui.togglePane();
      pn.numParticles = 1632;
      pn.options.particleInteractionDistance = 33;
      ui.params.particleInteractionDistance = 33;
      await new Promise(resolve => setTimeout(resolve, 250));
      const whileHidden = {
        attraction: attractionProps.get('max'),
        repulsion: repulsionProps.get('max'),
        propertyWrites
      };
      ui.togglePane();
      const reopened = {
        attraction: attractionProps.get('max'),
        repulsion: repulsionProps.get('max'),
        propertyWrites
      };
      return { before, whileHidden, reopened };
    });
    assert.deepStrictEqual(hiddenPanel.before, { attraction: 5, repulsion: 5 });
    assert.deepStrictEqual(hiddenPanel.whileHidden, { attraction: 5, repulsion: 5, propertyWrites: 0 });
    assert.deepStrictEqual(hiddenPanel.reopened, { attraction: 2.25, repulsion: 2.25, propertyWrites: 2 });

    const reset = await page.evaluate(() => {
      const ui = window.particleSettingsUi;
      const pn = window.particleInstance;
      const before = {
        attraction: pn.options.particleAttractionForce,
        repulsion: pn.options.particleRepulsionForce
      };
      const objectCount = pn.p && pn.o[pn.o.length - 1] === pn.p ? pn.o.length - 1 : pn.o.length;
      pn._initSoAFromObjects(objectCount);
      ui.doReset();
      return {
        before,
        after: {
          attraction: pn.options.particleAttractionForce,
          repulsion: pn.options.particleRepulsionForce
        }
      };
    });
    assert.deepStrictEqual(reset.after, { attraction: 5, repulsion: 3 }, 'reset did not restore the force defaults');
    const resetRange = await snapshot(page);
    assert(resetRange.attraction.max >= resetRange.params.attraction);
    assert(resetRange.repulsion.max >= resetRange.params.repulsion);

    await page.evaluate(() => {
      const ui = window.particleSettingsUi;
      const pn = window.particleInstance;
      ui.params.particleAttractionForce = 1;
      ui.params.particleRepulsionForce = 1;
      ui.params.particleInteractionDistance = 41;
      window.applyParamsToNetwork(pn, ui.params);
    });
    await page.setViewportSize({ width: 1100, height: 700 });
    await page.waitForTimeout(300);
    const resized = await snapshot(page);
    const resizedExpected = expectedMaximum(
      resized.particleCount,
      resized.interactionDistance,
      resized.width,
      resized.height,
      1
    );
    assert.strictEqual(resized.attraction.max, resizedExpected);
    assert.strictEqual(resized.repulsion.max, resizedExpected);
    assert.deepStrictEqual(resized.params, { attraction: 1, repulsion: 1 });

    const focusPreserved = await page.evaluate(async () => {
      const ui = window.particleSettingsUi;
      const pn = window.particleInstance;
      let binding = null;
      function visit(api) {
        for (const child of Array.from(api.children || [])) visit(child);
        for (const tabPage of Array.from(api.pages || [])) visit(tabPage);
        if (api.label === 'Attraction Force') binding = api;
      }
      visit(ui.pane);
      binding.hidden = false;
      const input = binding.element.querySelector('input');
      input.focus();
      const controller = binding.controller;
      pn.options.particleInteractionDistance = 100;
      ui.params.particleInteractionDistance = 100;
      await new Promise(resolve => setTimeout(resolve, 150));
      return binding.controller === controller && document.activeElement === input;
    });
    assert.strictEqual(focusPreserved, true, 'range update recreated the binding or moved focus');

    const wheelBefore = await snapshot(page);
    await page.evaluate(() => window.particleInstance.clearGravityWells());
    const canvasBox = await page.locator('#particle-canvas canvas').first().boundingBox();
    assert(canvasBox, 'particle canvas was not visible');
    await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
    await page.mouse.wheel(0, -100);
    await waitForRangeSync(page);
    const wheelAfter = await snapshot(page);
    assert.strictEqual(wheelAfter.particleCount, wheelBefore.particleCount * 2);
    assert.deepStrictEqual(wheelAfter.params, wheelBefore.params, 'mouse-wheel count change altered force values');
    assert.strictEqual(
      wheelAfter.attraction.max,
      expectedMaximum(wheelAfter.particleCount, wheelAfter.interactionDistance, wheelAfter.width, wheelAfter.height, 1)
    );

    const middleBefore = wheelAfter.particleCount;
    await page.mouse.down({ button: 'middle' });
    await page.waitForTimeout(220);
    await page.mouse.up({ button: 'middle' });
    await waitForRangeSync(page);
    const middleAfter = await snapshot(page);
    assert(middleAfter.particleCount > middleBefore, 'middle-click did not spawn particles');
    assert.deepStrictEqual(middleAfter.params, wheelAfter.params, 'middle-click spawning altered force values');
    assert.strictEqual(
      middleAfter.attraction.max,
      expectedMaximum(middleAfter.particleCount, middleAfter.interactionDistance, middleAfter.width, middleAfter.height, 1)
    );

    const zeroAttraction = await page.evaluate(async () => {
      const pn = window.particleInstance;
      pn.options.velocity = 0;
      await new Promise(resolve => {
        function stopped() {
          if (!pn._rafActive && pn._rafId == null) resolve();
          else setTimeout(stopped, 10);
        }
        stopped();
      });
      pn.clearGravityWells();
      pn.attractionForce = null;
      pn.repulsionForce = null;
      pn.options.curvedDrift = false;
      pn.options.particleCollision = false;
      pn.options.particleRepulsion = false;
      pn.options.particleAttraction = true;
      pn.options.particleAttractionForce = 0;
      pn.options.particleInteractionDistance = 100;
      pn.options.lineConnectionDistance = 0;
      pn.options.maxColorChangeDistance = 0;
      pn.o = pn.o.slice(0, 2);
      pn.o[0].x = 100;
      pn.o[0].y = 100;
      pn.o[1].x = 140;
      pn.o[1].y = 100;
      for (const particle of pn.o) {
        particle.velocity.x = 0;
        particle.velocity.y = 0;
      }
      pn._initSoAFromObjects(2);
      pn.update();
      return pn.o.map(particle => [particle.velocity.x, particle.velocity.y]);
    });
    assert.deepStrictEqual(zeroAttraction, [[0, 0], [0, 0]], 'zero attraction still accelerated particles');

    const health = await page.evaluate(() => {
      const pn = window.particleInstance;
      return {
        hasWebGl: Boolean(pn.glRenderer && pn.glRenderer.gl),
        contextLost: Boolean(pn.glRenderer && pn.glRenderer.gl && pn.glRenderer.gl.isContextLost())
      };
    });
    assert.strictEqual(health.hasWebGl, true);
    assert.strictEqual(health.contextLost, false);
    assert.deepStrictEqual(browserErrors, [], 'browser errors were reported');

    console.log(JSON.stringify({
      fixedScenarios,
      aboveRecommendation: {
        attractionMaximum: aboveRecommendation.attraction.max,
        repulsionMaximum: aboveRecommendation.repulsion.max
      },
      hiddenPanel,
      reset,
      resized: {
        particleCount: resized.particleCount,
        canvas: `${resized.width}x${resized.height}`,
        maximum: resized.attraction.max
      },
      wheel: { before: wheelBefore.particleCount, after: wheelAfter.particleCount },
      middleSpawn: { before: middleBefore, after: middleAfter.particleCount },
      zeroAttraction,
      health,
      browserErrors
    }, null, 2));
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
