#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const url = process.argv[2];
const screenshotDir = process.argv[3];
if (!url) throw new Error('Usage: rtk node scripts/test-gravity-well-preset-browser.js <url> [screenshot-directory]');

async function openControls(page) {
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true })));
  await page.waitForFunction(() => window.particleSettingsUi && !window.particleSettingsUi.container.querySelector('.particle-controls-body')?.hidden);
  await page.getByRole('button', { name: 'Wells', exact: true }).click();
}

async function openBrowser(page) {
  await page.getByRole('button', { name: 'Browse Presets', exact: true }).click();
  await page.locator('#well-preset-browser').waitFor({ state: 'visible' });
}

async function setOrbitAssist(page, enabled) {
  const input = page.getByLabel('Orbit Assist');
  await input.evaluate((node, value) => { if (node.checked !== value) node.click(); }, enabled);
  await page.waitForFunction(value =>
    document.querySelector('.orbit-assist-control input')?.checked === value &&
    window.particleInstance.gravityWellPresetOrbitAssist === value,
  enabled);
  assert.strictEqual(await input.isChecked(), enabled);
}

async function wellState(page) {
  return page.evaluate(() => {
    const pn = window.particleInstance;
    return {
      wells: pn.gravityWells.map(well => ({ ...well })),
      active: pn.activeGravityWellPreset,
      draft: pn.gravityWellDraft && { ...pn.gravityWellDraft },
      selection: [...pn.selectedGravityWellIds],
      undo: pn._selectionUndoStack.length,
      orbitAssist: pn.gravityWellPresetOrbitAssist !== false,
      orbitControllerRunning: pn._presetOrbitRunning === true,
      motion: [pn.options.velocity, pn.options.curvedDrift, pn.options.gravityWellSpin, pn.options.gravityWellForceMultiplier,
        pn.gravityWellAccelerationCapped, pn.gravityWellAccelerationLimit]
    };
  });
}

async function screenshot(page, name) {
  if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, `${name}.png`) });
}

async function desktop(browser, errors) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.particleInstance && window.GravityWellPresets);
  await openControls(page);
  const controlsFit = await page.locator('.particle-controls-body').evaluate(node => {
    const rect = node.getBoundingClientRect();
    return { bottom: rect.bottom, viewport: innerHeight, overflowY: getComputedStyle(node).overflowY };
  });
  assert.ok(controlsFit.bottom <= controlsFit.viewport, 'Open Controls must fit the desktop viewport');
  assert.strictEqual(controlsFit.overflowY, 'auto');
  assert.strictEqual(await page.getByLabel('Orbit Assist').isChecked(), true);
  assert.match(await page.getByLabel('Orbit Assist').evaluate(node => node.closest('.orbit-assist-control').title),
    /prevents collapse/i);
  const presetButtonLayout = await page.getByRole('button', { name: /^(Browse|Random) Presets?$/ }).evaluateAll(nodes =>
    nodes.map(node => node.getBoundingClientRect().toJSON()));
  assert.strictEqual(presetButtonLayout.length, 2);
  assert.ok(Math.abs(presetButtonLayout[0].top - presetButtonLayout[1].top) < 1,
    'Browse and Random must share one compact row');
  assert.ok(presetButtonLayout[0].right <= presetButtonLayout[1].left,
    'Browse must appear before Random');
  await screenshot(page, 'orbit-assist-desktop');
  await page.evaluate(() => {
    const pn = window.particleInstance;
    pn.applyGravityWellPreset('binary', { useRecommendedMotion: false });
    pn.options.velocity = 0;
    pn.options.curvedDrift = true;
    pn.options.gravityWellSpin = 0.55;
    pn.options.gravityWellForceMultiplier = 1.8;
    pn.gravityWellAccelerationCapped = false;
    pn.gravityWellAccelerationLimit = 2.7;
    pn.beginGravityWellPlacement('white', false);
    window.particleSettingsUi.syncGravityWellControls();
  });
  const beforeBrowse = await wellState(page);
  await openBrowser(page);
  assert.strictEqual(await page.locator('.well-preset-entry').count(), 96);
  assert.strictEqual(await page.getByLabel('Use recommended motion').count(), 0,
    'Preset motion mode belongs in the persistent Controls pane');
  assert.strictEqual(await page.locator('.well-preset-family option').count(), 12);
  assert.strictEqual(await page.getByLabel('Search presets').evaluate(node => node === document.activeElement), true);
  const initialWindow = await page.locator('#well-preset-browser').evaluate(dialog => {
    const rect = dialog.getBoundingClientRect();
    return {
      rect: rect.toJSON(),
      background: getComputedStyle(dialog).backgroundColor,
      backdrop: getComputedStyle(dialog, '::backdrop').backgroundColor,
      columns: getComputedStyle(dialog.querySelector('.well-preset-content')).gridTemplateColumns.split(' ').length
    };
  });
  assert.match(initialWindow.background, /0\.9\)/, 'preset surface should be slightly transparent');
  assert.match(initialWindow.backdrop, /0\.55\)/, 'preset backdrop should keep the canvas visible');
  assert.strictEqual(initialWindow.columns, 2, 'default preset browser should use gallery and detail columns');

  const headerBox = await page.locator('.well-preset-header').boundingBox();
  await page.mouse.move(headerBox.x + 120, headerBox.y + headerBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(headerBox.x + 160, headerBox.y + headerBox.height / 2 + 30);
  await page.mouse.up();
  const movedWindow = await page.locator('#well-preset-browser').evaluate(dialog => dialog.getBoundingClientRect().toJSON());
  assert.ok(movedWindow.x >= initialWindow.rect.x + 39 && movedWindow.y >= initialWindow.rect.y + 29,
    `preset browser did not follow its header drag: ${JSON.stringify({ initial: initialWindow.rect, moved: movedWindow })}`);

  const resizeBox = await page.locator('.well-preset-resize').boundingBox();
  await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + resizeBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(resizeBox.x + resizeBox.width / 2 - 400, resizeBox.y + resizeBox.height / 2 - 260);
  await page.mouse.up();
  const resizedWindow = await page.locator('#well-preset-browser').evaluate(dialog => {
    const rect = dialog.getBoundingClientRect();
    const gallery = dialog.querySelector('.well-preset-gallery').getBoundingClientRect();
    const detail = dialog.querySelector('.well-preset-detail').getBoundingClientRect();
    return { rect: rect.toJSON(), detailStacked: detail.top >= gallery.bottom - 1 };
  });
  assert.ok(Math.abs(resizedWindow.rect.width - 640) < 2 && Math.abs(resizedWindow.rect.height - 520) < 2,
    `preset browser resize did not retain the requested dimensions: ${JSON.stringify(resizedWindow.rect)}`);
  assert.strictEqual(resizedWindow.detailStacked, true, 'narrow preset browser should stack its detail panel');
  const resizeHandle = page.getByRole('button', { name: 'Resize preset window' });
  const resizeTarget = await resizeHandle.boundingBox();
  assert.ok(resizeTarget.width >= 44 && resizeTarget.height >= 44, 'preset resize target must be at least 44px');
  await resizeHandle.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowUp');
  const keyboardResizedWindow = await page.locator('#well-preset-browser').evaluate(dialog =>
    dialog.getBoundingClientRect().toJSON());
  assert.ok(['width', 'height'].every(key => Math.abs(keyboardResizedWindow[key] - resizedWindow.rect[key]) < 2),
    'keyboard resizing should update and restore both dimensions');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await openBrowser(page);
  const reopenedWindow = await page.locator('#well-preset-browser').evaluate(dialog => dialog.getBoundingClientRect().toJSON());
  assert.ok(['x', 'y', 'width', 'height'].every(key => Math.abs(reopenedWindow[key] - resizedWindow.rect[key]) < 2),
    'preset browser should remember its window geometry until reload');
  await page.getByLabel('Search presets').fill('bullseye');
  assert.strictEqual(await page.locator('.well-preset-entry').count(), 2);
  await page.getByLabel('Search presets').fill('unmatched constellation');
  assert.strictEqual(await page.locator('.well-preset-entry').count(), 0);
  assert.strictEqual(await page.getByRole('button', { name: 'Apply Preset', exact: true }).isDisabled(), true);
  await page.getByLabel('Search presets').fill('');
  await page.getByLabel('Family', { exact: true }).selectOption('Cages');
  assert.strictEqual(await page.locator('.well-preset-entry').count(), 6);
  await page.locator('[data-preset-id="cross-cage"]').focus();
  await page.keyboard.press('ArrowRight');
  assert.strictEqual(await page.evaluate(() => document.activeElement.dataset.presetId), 'diamond-cage');
  await page.keyboard.press('Enter');
  assert.strictEqual(await page.locator('#well-preset-selected-name').textContent(), 'Diamond Cage');
  for (const key of ['c', 'b', 'w', 'Delete', 'Control+a']) await page.keyboard.press(key);
  assert.deepStrictEqual(await wellState(page), beforeBrowse, 'Browsing and modal hotkeys must not mutate the canvas');
  await page.keyboard.press('Escape');
  assert.strictEqual(await page.locator('#well-preset-browser').isVisible(), false);
  assert.strictEqual(await page.getByRole('button', { name: 'Browse Presets', exact: true }).evaluate(node => node === document.activeElement), true);
  assert.deepStrictEqual(await wellState(page), beforeBrowse, 'Escape must preserve the pending placement as well as existing wells');

  await setOrbitAssist(page, false);
  await openBrowser(page);
  await page.locator('[data-preset-id="cross-cage"]').click();
  const expectedPreview = await page.locator('.well-preset-detail-preview circle').evaluateAll(circles =>
    circles.map(circle => ['cx', 'cy', 'r'].map(name => Number(circle.getAttribute(name)))));
  await screenshot(page, 'presets-desktop');
  await page.getByRole('button', { name: 'Apply Preset', exact: true }).click();
  const applied = await wellState(page);
  assert.strictEqual(applied.active.id, 'cross-cage');
  assert.strictEqual(applied.draft, null);
  assert.deepStrictEqual(applied.motion, [0.66, false, 0, 0.6, true, 1.5],
    'Orbit Assist off must still apply the preset recommended physics profile');
  assert.strictEqual(applied.orbitAssist, false);
  assert.strictEqual(applied.orbitControllerRunning, false);
  assert.deepStrictEqual(applied.wells.map(well => [well.x, well.y, well.radius]), expectedPreview, 'Preview and placement must resolve to identical geometry');
  assert.deepStrictEqual(applied.selection, [], 'Apply must not select all wells');
  assert.strictEqual(applied.undo, beforeBrowse.undo + 1);
  await page.evaluate(() => window.particleInstance.undoObjectSelection());
  assert.deepStrictEqual((await wellState(page)).wells, beforeBrowse.wells);
  assert.strictEqual((await wellState(page)).active.id, 'binary');

  await setOrbitAssist(page, true);
  await openBrowser(page);
  await page.locator('[data-preset-id="cross-cage"]').click();
  await page.evaluate(() => {
    const pn = window.particleInstance;
    window.__presetRebuilds = 0;
    const rebuild = pn._rebuildOnResize;
    pn._rebuildOnResize = function(...args) { window.__presetRebuilds++; return rebuild.apply(this, args); };
  });
  await page.getByRole('button', { name: 'Apply Preset', exact: true }).click();
  assert.deepStrictEqual((await wellState(page)).motion, [0.66, false, 0, 0.6, true, 1.5]);
  assert.strictEqual(await page.evaluate(() => window.__presetRebuilds), 0, 'Pane refresh must not rebuild particles during Apply');
  const synced = await page.evaluate(() => {
    const params = window.particleSettingsUi.params;
    return [params.speed, params.curvedDrift, params.gravityWellSpin, params.gravityWellForceMultiplier];
  });
  assert.deepStrictEqual([synced[0], synced[1], synced[3]], [0.66, false, 0.6]);
  assert.ok(Math.abs(synced[2]) < 1e-12, 'Trap spin must synchronize to zero');

  await setOrbitAssist(page, false);
  const assistOff = await page.evaluate(() => {
    const pn = window.particleInstance;
    if (pn._rafId != null) cancelAnimationFrame(pn._rafId);
    pn._rafId = null;
    pn._rafActive = false;
    pn._updateSoA();
    return {
      active: pn.activeGravityWellPreset?.id,
      enabled: pn.gravityWellPresetOrbitAssist,
      running: pn._presetOrbitRunning
    };
  });
  assert.deepStrictEqual(assistOff, { active: 'cross-cage', enabled: false, running: false },
    'Unchecking Orbit Assist must disable the controller live without detaching the preset');
  await setOrbitAssist(page, true);
  const assistOn = await page.evaluate(() => {
    const pn = window.particleInstance;
    if (pn._rafId != null) cancelAnimationFrame(pn._rafId);
    pn._rafId = null;
    pn._rafActive = false;
    pn._updateSoA();
    return {
      active: pn.activeGravityWellPreset?.id,
      enabled: pn.gravityWellPresetOrbitAssist,
      running: pn._presetOrbitRunning
    };
  });
  assert.deepStrictEqual(assistOn, { active: 'cross-cage', enabled: true, running: true },
    'Checking Orbit Assist must resume the controller live');

  const gestureBefore = await wellState(page);
  const slider = await page.evaluate(() => {
    let binding;
    function visit(api) {
      if (api.label === 'Spacing') binding = api;
      for (const child of api.children || []) visit(child);
      for (const child of api.pages || []) visit(child);
    }
    visit(window.particleSettingsUi.pane);
    const rect = binding.controller.valueController.sliderC_.view.element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  await page.mouse.move(slider.x + slider.width * 0.5, slider.y + slider.height / 2);
  await page.mouse.down();
  await page.mouse.move(slider.x + slider.width * 0.8, slider.y + slider.height / 2, { steps: 8 });
  await page.mouse.up();
  const gestureAfter = await wellState(page);
  assert.ok(gestureAfter.active.spacing > 110, 'Actual slider drag must update preset spacing');
  assert.strictEqual(gestureAfter.undo, gestureBefore.undo + 1, 'Completed slider gesture must create exactly one Undo entry');
  assert.deepStrictEqual(gestureAfter.wells.map(well => well.id), gestureBefore.wells.map(well => well.id));
  await page.evaluate(() => window.particleInstance.undoObjectSelection());
  assert.strictEqual((await wellState(page)).active.spacing, 100);
  await page.evaluate(() => {
    const pn = window.particleInstance;
    pn.updateGravityWell(pn.gravityWells[0].id, { x: pn.gravityWells[0].x + 10 });
  });
  assert.strictEqual(await page.evaluate(() => window.particleSettingsUi.gravityWellPresetParams.name), 'Custom');
  const controlsDisabled = await page.evaluate(() => {
    const result = [];
    function visit(api) {
      if (['Spacing', 'Rotation', 'Strength'].includes(api.label) && api.controller?.valueController?.sliderC_) result.push(api.disabled);
      for (const child of api.children || []) visit(child);
      for (const child of api.pages || []) visit(child);
    }
    visit(window.particleSettingsUi.pane);
    return result.slice(0, 3);
  });
  assert.deepStrictEqual(controlsDisabled, [true, true, true]);
  await page.getByRole('button', { name: 'Reapply Preset', exact: true }).click();
  const reapplied = await wellState(page);
  assert.strictEqual(reapplied.active.id, 'cross-cage');
  assert.strictEqual(reapplied.orbitAssist, true);
  assert.strictEqual(reapplied.orbitControllerRunning, true,
    'Reapply must honor the persistent Orbit Assist setting');
  await page.evaluate(() => {
    window.particleInstance.applyGravityWellPreset('binary', { useRecommendedMotion: false });
    window.__nativeRandom = Math.random;
    Math.random = () => 0;
  });
  await setOrbitAssist(page, false);
  await page.getByRole('button', { name: 'Random Preset', exact: true }).click();
  assert.strictEqual((await wellState(page)).active.id, 'cross-cage', 'Random must skip the current preset');
  assert.deepStrictEqual((await wellState(page)).motion, [0.66, false, 0, 0.6, true, 1.5],
    'Random must apply recommended motion');
  assert.strictEqual((await wellState(page)).orbitAssist, false, 'Random must respect the global Orbit Assist setting');
  await page.getByRole('button', { name: 'Random Preset', exact: true }).click();
  assert.strictEqual((await wellState(page)).active.id, 'diamond-cage', 'Repeated Random must not repeat the active preset');
  await page.evaluate(() => { Math.random = window.__nativeRandom; delete window.__nativeRandom; });
  await openBrowser(page);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.evaluate(() => window.particleSettingsUi.doReset());
  assert.strictEqual((await wellState(page)).active, null);
  assert.strictEqual(await page.getByRole('button', { name: 'Reapply Preset', exact: true }).isDisabled(), true);
  await openBrowser(page);
  await page.evaluate(() => window.destroyParticleExperience());
  assert.strictEqual(await page.locator('#well-preset-browser').count(), 0);
  await page.evaluate(() => window.createParticleExperience());
  await openControls(page);
  await openBrowser(page);
  assert.strictEqual(await page.locator('#well-preset-browser').count(), 1);
  assert.strictEqual(await page.locator('.well-preset-entry').count(), 96);
  await context.close();
}

async function responsive(browser, errors) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.particleInstance && window.GravityWellPresets);
  await openControls(page);
  assert.ok(await page.getByRole('button', { name: 'Random Preset', exact: true }).evaluate(node =>
    node.getBoundingClientRect().height >= 44), 'Random Preset must keep a 44px touch target');
  assert.ok(await page.getByLabel('Orbit Assist').evaluate(node =>
    node.closest('.orbit-assist-control').getBoundingClientRect().height >= 44),
  'Orbit Assist must keep a 44px touch target');
  await screenshot(page, 'orbit-assist-phone');
  await openBrowser(page);
  const fit = await page.evaluate(() => {
    const dialog = document.querySelector('#well-preset-browser');
    const rect = dialog.getBoundingClientRect();
    const gallery = dialog.querySelector('.well-preset-gallery');
    return { x: rect.x, right: rect.right, bottom: rect.bottom, width: innerWidth, height: innerHeight,
      overflow: dialog.scrollWidth > dialog.clientWidth, scrollable: gallery.scrollHeight > gallery.clientHeight,
      resizeHandleHidden: getComputedStyle(dialog.querySelector('.well-preset-resize')).display === 'none' };
  });
  assert.ok(fit.x >= 0 && fit.right <= fit.width && fit.bottom <= fit.height, 'Phone dialog must fit viewport');
  assert.strictEqual(fit.overflow, false);
  assert.strictEqual(fit.scrollable, true);
  assert.strictEqual(fit.resizeHandleHidden, true, 'Phone dialog must keep its fixed full-screen layout');
  const touchTargets = await page.locator('.well-preset-close, .well-preset-apply, .well-preset-filters input, .well-preset-filters select, .well-preset-entry').evaluateAll(nodes =>
    nodes.map(node => ({ name: node.textContent || node.type, height: node.getBoundingClientRect().height })));
  assert.ok(touchTargets.every(target => target.height >= 44), `Every touch target must be at least 44px: ${JSON.stringify(touchTargets.filter(target => target.height < 44))}`);
  await page.locator('[data-preset-id="compass"]').tap();
  assert.strictEqual(await page.locator('#well-preset-selected-name').textContent(), 'Compass');
  await screenshot(page, 'presets-phone');
  await page.getByRole('button', { name: 'Apply Preset', exact: true }).tap();
  assert.strictEqual((await wellState(page)).active.id, 'compass');
  await openBrowser(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.getByLabel('Family', { exact: true }).selectOption('Channels');
  assert.strictEqual(await page.locator('.well-preset-entry').count(), 9);
  await page.locator('[data-preset-id="funnel"]').tap();
  await screenshot(page, 'presets-phone-landscape');
  await page.getByRole('button', { name: 'Apply Preset', exact: true }).tap();
  assert.strictEqual((await wellState(page)).active.id, 'funnel');
  await context.close();
}

(async () => {
  if (screenshotDir) fs.mkdirSync(screenshotDir, { recursive: true });
  const errors = [];
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-first-run'] });
  try {
    await desktop(browser, errors);
    await responsive(browser, errors);
    assert.deepStrictEqual(errors, [], 'Browser must not report JavaScript errors');
    console.log('Preset browser: desktop search/filter, keyboard isolation/focus, preview/apply/undo, motion sync, slider transaction, Custom/Reapply/Reset, lifecycle, phone and landscape passed.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
