let activeMobileControls = null;
const MOBILE_MIN_PARTICLE_COUNT = 16;
const MOBILE_MAX_PARTICLE_COUNT = 20000;
const COUNT_HOLD_DURATION_MS = 550;
const COUNT_HOLD_TOLERANCE_PX = 12;
const TOOLBAR_ACTIVE_DURATION_MS = 3000;
const TOOLBAR_BUSY_RECHECK_MS = 250;

function createButton(label, attributes = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-label', label);
  for (const [name, value] of Object.entries(attributes)) button.setAttribute(name, value);
  return button;
}

function createTrashIcon() {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.classList.add('mobile-hole-trash');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M4 7h16M9 4h6l1 3M7 9l1 11h8l1-11M10 11v6M14 11v6');
  icon.appendChild(path);
  return icon;
}

export function mountMobileControls(pn, actions = {}) {
  if (!pn || pn._destroyed) return null;
  if (activeMobileControls) activeMobileControls.destroy();

  const root = document.createElement('nav');
  root.className = 'mobile-particle-controls is-active';
  root.setAttribute('aria-label', 'Particle controls');
  root.setAttribute('data-mobile-particle-controls', '');

  const holeBank = document.createElement('div');
  holeBank.className = 'mobile-hole-bank';

  const blackHole = createButton('Drag black hole onto canvas', {
    'class': 'mobile-hole-token mobile-hole-token-black',
    'data-hole-type': 'black'
  });
  blackHole.appendChild(document.createElement('span')).setAttribute('aria-hidden', 'true');
  blackHole.appendChild(createTrashIcon());

  const whiteHole = createButton('Drag white hole onto canvas', {
    'class': 'mobile-hole-token mobile-hole-token-white',
    'data-hole-type': 'white'
  });
  whiteHole.appendChild(document.createElement('span')).setAttribute('aria-hidden', 'true');
  whiteHole.appendChild(createTrashIcon());

  holeBank.append(blackHole, whiteHole);

  const countControls = document.createElement('div');
  countControls.className = 'mobile-particle-count-controls';
  const decrease = createButton('Decrease particle count', {
    'data-mobile-count': 'decrease'
  });
  decrease.textContent = '-';
  const countTrigger = createButton('', {
    'class': 'mobile-particle-count-trigger',
    'aria-haspopup': 'dialog',
    'aria-controls': 'mobile-particle-count-dialog',
    'data-mobile-particle-count-trigger': ''
  });
  const count = document.createElement('output');
  count.setAttribute('aria-label', 'Particle count');
  count.setAttribute('aria-live', 'polite');
  count.setAttribute('data-mobile-particle-count', '');
  count.textContent = String(pn.numParticles || 0);
  countTrigger.appendChild(count);
  const increase = createButton('Increase particle count', {
    'data-mobile-count': 'increase'
  });
  increase.textContent = '+';
  const helpButton = createButton('Show keyboard and mouse shortcuts', {
    'class': 'mobile-hotkey-help',
    'aria-controls': 'hotkey-guide',
    'aria-expanded': 'false',
    'data-mobile-hotkey-help': ''
  });
  helpButton.textContent = '!';
  countControls.append(decrease, countTrigger, increase, helpButton);
  root.append(holeBank, countControls);

  const dialog = document.createElement('dialog');
  dialog.id = 'mobile-particle-count-dialog';
  dialog.className = 'mobile-particle-count-dialog';
  dialog.setAttribute('aria-labelledby', 'mobile-particle-count-title');
  dialog.setAttribute('data-mobile-particle-count-dialog', '');

  const form = document.createElement('form');
  form.className = 'mobile-particle-count-form';
  form.noValidate = true;
  const dialogHeader = document.createElement('div');
  dialogHeader.className = 'mobile-particle-count-header';
  const title = document.createElement('h2');
  title.id = 'mobile-particle-count-title';
  title.textContent = 'Set particle count';
  const closeDialog = createButton('Close particle count dialog', {
    'class': 'mobile-particle-count-close',
    'data-mobile-particle-count-close': ''
  });
  closeDialog.textContent = '\u00d7';
  dialogHeader.append(title, closeDialog);
  const label = document.createElement('label');
  label.htmlFor = 'mobile-particle-count-input';
  label.textContent = `Exact count (${MOBILE_MIN_PARTICLE_COUNT}-${MOBILE_MAX_PARTICLE_COUNT.toLocaleString('en-US')})`;
  const input = document.createElement('input');
  input.id = 'mobile-particle-count-input';
  input.type = 'text';
  input.inputMode = 'numeric';
  input.pattern = '[0-9]*';
  input.enterKeyHint = 'done';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('aria-describedby', 'mobile-particle-count-error');
  input.setAttribute('data-mobile-particle-count-input', '');
  const error = document.createElement('p');
  error.id = 'mobile-particle-count-error';
  error.className = 'mobile-particle-count-error';
  error.setAttribute('role', 'alert');
  error.setAttribute('aria-live', 'assertive');
  error.setAttribute('data-mobile-particle-count-error', '');
  const dialogEntry = document.createElement('div');
  dialogEntry.className = 'mobile-particle-count-entry';
  const submitDialog = document.createElement('button');
  submitDialog.type = 'submit';
  submitDialog.textContent = 'OK';
  submitDialog.setAttribute('data-mobile-particle-count-submit', '');
  dialogEntry.append(input, submitDialog);
  form.append(dialogHeader, label, dialogEntry, error);
  dialog.appendChild(form);

  document.body.append(root, dialog);

  let destroyed = false;
  let activityTimer = null;
  let activityDeadline = 0;
  let drag = null;
  let repeatDelay = null;
  let repeatInterval = null;
  let countHold = null;
  let countPointerKind = null;
  let suppressCountClick = false;
  let suppressCountClickTimer = null;
  let restoreFocusAfterDialog = true;
  let helpOpen = false;
  let helpPointerKind = null;
  const helpOwner = helpButton;

  function toolbarIsBusy() {
    return !!(drag || countHold || dialog.open || repeatDelay != null || repeatInterval != null ||
      helpOpen || pn._gravityWellDrag || root.matches(':focus-within'));
  }

  function handleActivityDeadline() {
    activityTimer = null;
    if (destroyed) return;
    const remaining = activityDeadline - performance.now();
    if (remaining > 0) {
      activityTimer = setTimeout(handleActivityDeadline, remaining);
      return;
    }
    if (toolbarIsBusy()) {
      activityTimer = setTimeout(handleActivityDeadline, TOOLBAR_BUSY_RECHECK_MS);
      return;
    }
    root.classList.remove('is-active');
  }

  function scheduleActivityDeadline() {
    if (activityTimer != null || destroyed) return;
    activityTimer = setTimeout(handleActivityDeadline, Math.max(0, activityDeadline - performance.now()));
  }

  function setActive() {
    if (destroyed) return;
    root.classList.add('is-active');
    activityDeadline = performance.now() + TOOLBAR_ACTIVE_DURATION_MS;
    scheduleActivityDeadline();
  }

  function mapClientPoint(clientX, clientY) {
    const rect = pn.canvas.getBoundingClientRect();
    const width = pn.i.size.width;
    const height = pn.i.size.height;
    return {
      x: Math.max(0, Math.min(width, (clientX - rect.left) * width / (rect.width || width || 1))),
      y: Math.max(0, Math.min(height, (clientY - rect.top) * height / (rect.height || height || 1)))
    };
  }

  function pointIsDropTarget(clientX, clientY) {
    const rect = pn.canvas.getBoundingClientRect();
    const paletteRect = root.getBoundingClientRect();
    const insideCanvas = clientX >= rect.left && clientX <= rect.right &&
      clientY >= rect.top && clientY <= rect.bottom;
    const insidePalette = clientX >= paletteRect.left && clientX <= paletteRect.right &&
      clientY >= paletteRect.top && clientY <= paletteRect.bottom;
    return insideCanvas && !insidePalette;
  }

  function clearExistingWellDeleteTarget() {
    root.classList.remove('is-delete-ready');
    blackHole.classList.remove('is-delete-option', 'is-delete-target');
    whiteHole.classList.remove('is-delete-option', 'is-delete-target');
    blackHole.setAttribute('aria-label', 'Drag black hole onto canvas');
    whiteHole.setAttribute('aria-label', 'Drag white hole onto canvas');
  }

  function existingWellDragForPointer(event) {
    const activeDrag = pn._gravityWellDrag;
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return null;
    return pn.getGravityWell(activeDrag.id);
  }

  function matchingDeleteTarget(event, well) {
    if (!well || typeof document.elementFromPoint !== 'function') return null;
    const element = document.elementFromPoint(event.clientX, event.clientY);
    const button = element?.closest?.('.mobile-hole-token[data-hole-type]');
    return button?.dataset.holeType === well.type ? button : null;
  }

  function trackExistingWellDeleteTarget(event) {
    const well = existingWellDragForPointer(event);
    clearExistingWellDeleteTarget();
    if (!well) return;
    root.classList.add('is-delete-ready');
    const matchingButton = well.type === 'white' ? whiteHole : blackHole;
    matchingButton.classList.add('is-delete-option');
    matchingButton.setAttribute('aria-label', `Delete held ${well.type} hole`);
    const target = matchingDeleteTarget(event, well);
    if (target) target.classList.add('is-delete-target');
  }

  function dropExistingWellOnDeleteTarget(event) {
    const well = existingWellDragForPointer(event);
    const target = matchingDeleteTarget(event, well);
    clearExistingWellDeleteTarget();
    if (well) setActive();
    if (!well || !target) return;
    pn.removeGravityWell(well.id);
    event.preventDefault();
  }

  function beginHoleDrag(event) {
    if (destroyed || event.button > 0 || drag) return;
    const button = event.currentTarget;
    const point = mapClientPoint(event.clientX, event.clientY);
    drag = { pointerId: event.pointerId, button, inputKind: event.pointerType || 'mouse' };
    root.classList.add('is-dragging');
    setActive();
    pn.beginGravityWellPaletteDrag(button.dataset.holeType, point.x, point.y, drag.inputKind);
    try { button.setPointerCapture(event.pointerId); } catch (_) {}
    event.preventDefault();
    event.stopPropagation();
  }

  function moveHoleDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const point = mapClientPoint(event.clientX, event.clientY);
    pn.updateGravityWellPaletteDrag(point.x, point.y, drag.inputKind);
    event.preventDefault();
  }

  function finishHoleDrag(event, cancelled) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const current = drag;
    drag = null;
    root.classList.remove('is-dragging');
    if (!cancelled && pointIsDropTarget(event.clientX, event.clientY)) {
      const point = mapClientPoint(event.clientX, event.clientY);
      pn.commitGravityWellPaletteDrag(point.x, point.y, current.inputKind);
    } else {
      pn.cancelGravityWellPlacement();
    }
    try { current.button.releasePointerCapture(event.pointerId); } catch (_) {}
    setActive();
    event.preventDefault();
  }

  function commitHoleDrag(event) {
    finishHoleDrag(event, false);
  }

  function cancelHoleDrag(event) {
    finishHoleDrag(event, true);
  }

  function renderCount(value = pn.numParticles) {
    const current = Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : 0;
    count.textContent = String(current);
    countTrigger.setAttribute('aria-label', `Set exact particle count, currently ${current}`);
    decrease.disabled = current <= MOBILE_MIN_PARTICLE_COUNT;
    increase.disabled = current >= MOBILE_MAX_PARTICLE_COUNT;
  }

  function updateCount(event) {
    if (!event || !event.detail) return;
    renderCount(event.detail.count);
  }

  function stepCount(direction, requestedDelta) {
    if (destroyed || pn._destroyed) return;
    const current = pn.numParticles | 0;
    if ((direction > 0 && current >= MOBILE_MAX_PARTICLE_COUNT) ||
        (direction < 0 && current <= MOBILE_MIN_PARTICLE_COUNT)) {
      renderCount(current);
      return false;
    }
    const delta = requestedDelta || Math.max(16, Math.round(current * 0.25));
    const next = direction > 0
      ? Math.min(MOBILE_MAX_PARTICLE_COUNT, current + delta)
      : Math.max(MOBILE_MIN_PARTICLE_COUNT, current - delta);
    pn.setParticleCount(next);
    renderCount(pn.numParticles);
    setActive();
    return next > MOBILE_MIN_PARTICLE_COUNT && next < MOBILE_MAX_PARTICLE_COUNT;
  }

  function clearDialogError() {
    error.textContent = '';
    input.removeAttribute('aria-invalid');
  }

  function showDialogError(message) {
    error.textContent = message;
    input.setAttribute('aria-invalid', 'true');
    input.focus();
  }

  function handleDialogClose() {
    root.classList.remove('is-dialog-open');
    clearDialogError();
    if (restoreFocusAfterDialog && !destroyed && countTrigger.isConnected) countTrigger.focus();
    restoreFocusAfterDialog = true;
    setActive();
  }

  function closeCountDialog(restoreFocus = true) {
    restoreFocusAfterDialog = restoreFocus;
    if (dialog.open) dialog.close();
    else handleDialogClose();
  }

  function openCountDialog() {
    if (destroyed || pn._destroyed || dialog.open) return;
    renderCount(pn.numParticles);
    input.value = String(pn.numParticles);
    clearDialogError();
    root.classList.add('is-dialog-open');
    setActive();
    dialog.showModal();
    input.focus();
    input.select();
  }

  function submitCount(event) {
    event.preventDefault();
    if (destroyed || pn._destroyed) return;
    const trimmed = input.value.trim();
    if (!/^[0-9]+$/.test(trimmed)) {
      showDialogError('Enter a whole number using digits only.');
      return;
    }
    const requestedCount = Number(trimmed);
    if (!Number.isSafeInteger(requestedCount) || requestedCount < MOBILE_MIN_PARTICLE_COUNT ||
        requestedCount > MOBILE_MAX_PARTICLE_COUNT) {
      showDialogError(`Enter a count from ${MOBILE_MIN_PARTICLE_COUNT} to ${MOBILE_MAX_PARTICLE_COUNT.toLocaleString('en-US')}.`);
      return;
    }
    pn.setParticleCount(requestedCount);
    renderCount(pn.numParticles);
    closeCountDialog();
  }

  function closeDialogSubmission() {
    closeCountDialog();
  }

  function cancelNativeDialog(event) {
    event.preventDefault();
    closeCountDialog();
  }

  function dismissDialogBackdrop(event) {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    const outside = event.clientX < rect.left || event.clientX > rect.right ||
      event.clientY < rect.top || event.clientY > rect.bottom;
    if (outside) closeCountDialog();
  }

  function clearCountHold(releaseCapture = true) {
    if (!countHold) return;
    const current = countHold;
    countHold = null;
    if (current.timer != null) clearTimeout(current.timer);
    if (releaseCapture) {
      try { countTrigger.releasePointerCapture(current.pointerId); } catch (_) {}
    }
    root.classList.remove('is-holding');
    setActive();
  }

  function beginCountHold(event) {
    if (destroyed || dialog.open || event.button > 0 || !event.isPrimary) return;
    countPointerKind = event.pointerType || 'mouse';
    if (countPointerKind === 'mouse') {
      setActive();
      return;
    }
    clearCountHold();
    suppressCountClick = false;
    countHold = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startedAt: performance.now(),
      armed: false,
      timer: null
    };
    root.classList.add('is-holding');
    countHold.timer = setTimeout(() => {
      if (!countHold || countHold.pointerId !== event.pointerId) return;
      countHold.timer = null;
      countHold.armed = true;
    }, COUNT_HOLD_DURATION_MS);
    try { countTrigger.setPointerCapture(event.pointerId); } catch (_) {}
    setActive();
    event.preventDefault();
    event.stopPropagation();
  }

  function moveCountHold(event) {
    if (!countHold || event.pointerId !== countHold.pointerId) return;
    if (Math.hypot(event.clientX - countHold.x, event.clientY - countHold.y) > COUNT_HOLD_TOLERANCE_PX) {
      clearCountHold();
    }
    event.preventDefault();
    event.stopPropagation();
  }

  function finishCountHold(event) {
    if (!countHold || event.pointerId !== countHold.pointerId) return;
    const armed = countHold.armed || performance.now() - countHold.startedAt >= COUNT_HOLD_DURATION_MS;
    clearCountHold();
    if (armed) {
      suppressCountClick = true;
      if (suppressCountClickTimer != null) clearTimeout(suppressCountClickTimer);
      suppressCountClickTimer = setTimeout(() => {
        suppressCountClick = false;
        suppressCountClickTimer = null;
      }, 0);
      openCountDialog();
    }
    event.preventDefault();
    event.stopPropagation();
  }

  function cancelCountHold(event) {
    if (event && countHold && event.pointerId !== countHold.pointerId) return;
    countPointerKind = null;
    clearCountHold();
  }

  function loseCountHoldCapture(event) {
    if (!countHold || event.pointerId !== countHold.pointerId) return;
    clearCountHold(false);
  }

  function activateCountTrigger(event) {
    const opensImmediately = event.detail === 0 || countPointerKind === 'mouse';
    countPointerKind = null;
    if (opensImmediately) {
      suppressCountClick = false;
      openCountDialog();
      return;
    }
    if (suppressCountClick) suppressCountClick = false;
    event.preventDefault();
    event.stopPropagation();
  }

  function stopCountRepeat() {
    const wasRepeating = repeatDelay != null || repeatInterval != null;
    if (repeatDelay != null) clearTimeout(repeatDelay);
    if (repeatInterval != null) clearInterval(repeatInterval);
    repeatDelay = null;
    repeatInterval = null;
    root.classList.remove('is-repeating');
    if (wasRepeating) setActive();
  }

  function beginCountRepeat(event) {
    if (destroyed || event.button > 0) return;
    stopCountRepeat();
    const direction = event.currentTarget.dataset.mobileCount === 'increase' ? 1 : -1;
    const delta = Math.max(16, Math.round((pn.numParticles | 0) * 0.25));
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch (_) {}
    if (!stepCount(direction, delta)) {
      event.preventDefault();
      return;
    }
    root.classList.add('is-repeating');
    repeatDelay = setTimeout(() => {
      repeatDelay = null;
      repeatInterval = setInterval(() => {
        if (!stepCount(direction, delta)) stopCountRepeat();
      }, 180);
    }, 450);
    event.preventDefault();
  }

  function handleRandomize() {
    if (typeof actions.randomizeVisuals === 'function') actions.randomizeVisuals();
    setActive();
  }

  function openHelp() {
    const manager = window.hotkeyManager;
    if (!manager || typeof manager.showHelp !== 'function') return;
    manager.showHelp({
      position: 'top-right',
      persistent: true,
      includeMouse: true,
      anchor: helpButton,
      owner: helpOwner
    });
    helpOpen = true;
    helpButton.setAttribute('aria-expanded', 'true');
    root.classList.add('is-help-open');
    setActive();
  }

  function closeHelp(immediate = false, releaseFocus = false) {
    if (window.hotkeyManager && typeof window.hotkeyManager.hideHelp === 'function') {
      window.hotkeyManager.hideHelp(helpOwner, { immediate });
    }
    helpOpen = false;
    helpButton.setAttribute('aria-expanded', 'false');
    root.classList.remove('is-help-open');
    if (releaseFocus && document.activeElement === helpButton) helpButton.blur();
  }

  function handleHelpPointerDown(event) {
    helpPointerKind = event.pointerType || 'mouse';
  }

  function handleHelpPointerEnter(event) {
    if ((event.pointerType || 'mouse') === 'mouse') openHelp();
  }

  function handleHelpPointerLeave(event) {
    if ((event.pointerType || 'mouse') === 'mouse' && document.activeElement !== helpButton) closeHelp();
  }

  function handleHelpFocus() {
    const coarsePointer = window.matchMedia && window.matchMedia('(hover: none), (pointer: coarse)').matches;
    if (helpPointerKind !== 'touch' && !coarsePointer) openHelp();
  }

  function handleHelpBlur() {
    const coarsePointer = window.matchMedia && window.matchMedia('(hover: none), (pointer: coarse)').matches;
    if (helpPointerKind !== 'touch' && !coarsePointer && !helpButton.matches(':hover')) closeHelp();
  }

  function toggleTouchHelp(event) {
    const coarsePointer = window.matchMedia && window.matchMedia('(hover: none), (pointer: coarse)').matches;
    const touchActivation = helpPointerKind === 'touch' || coarsePointer;
    helpPointerKind = null;
    if (!touchActivation) return;
    if (helpOpen) closeHelp(false, true);
    else openHelp();
    event.preventDefault();
    event.stopPropagation();
  }

  function dismissHelpOutside(event) {
    const target = event.target;
    const targetIsNode = target instanceof Node;
    if (!helpOpen || (targetIsNode && (helpButton.contains(target) ||
        document.getElementById('hotkey-guide')?.contains(target)))) return;
    closeHelp(false, true);
  }

  function dismissHelpWithEscape(event) {
    if (helpOpen && event.key === 'Escape') closeHelp(false, true);
  }

  function handleVisibilityChange() {
    if (document.hidden) {
      stopCountRepeat();
      clearCountHold();
      clearExistingWellDeleteTarget();
      if (drag) pn.cancelGravityWellPlacement();
      drag = null;
      root.classList.remove('is-dragging');
      closeHelp(true);
    }
  }

  function handleWindowBlur() {
    stopCountRepeat();
    clearCountHold();
    clearExistingWellDeleteTarget();
    if (drag) pn.cancelGravityWellPlacement();
    drag = null;
    root.classList.remove('is-dragging');
    closeHelp(true);
  }

  function handleToolbarActivity() {
    setActive();
  }

  function handleToolbarFocusOut() {
    setActive();
  }

  blackHole.addEventListener('pointerdown', beginHoleDrag);
  whiteHole.addEventListener('pointerdown', beginHoleDrag);
  decrease.addEventListener('pointerdown', beginCountRepeat);
  increase.addEventListener('pointerdown', beginCountRepeat);
  decrease.addEventListener('pointerup', stopCountRepeat);
  increase.addEventListener('pointerup', stopCountRepeat);
  decrease.addEventListener('pointercancel', stopCountRepeat);
  increase.addEventListener('pointercancel', stopCountRepeat);
  decrease.addEventListener('lostpointercapture', stopCountRepeat);
  increase.addEventListener('lostpointercapture', stopCountRepeat);
  countTrigger.addEventListener('pointerdown', beginCountHold);
  countTrigger.addEventListener('pointermove', moveCountHold);
  countTrigger.addEventListener('pointerup', finishCountHold);
  countTrigger.addEventListener('pointercancel', cancelCountHold);
  countTrigger.addEventListener('lostpointercapture', loseCountHoldCapture);
  countTrigger.addEventListener('click', activateCountTrigger);
  helpButton.addEventListener('pointerdown', handleHelpPointerDown);
  helpButton.addEventListener('pointerenter', handleHelpPointerEnter);
  helpButton.addEventListener('pointerleave', handleHelpPointerLeave);
  helpButton.addEventListener('focus', handleHelpFocus);
  helpButton.addEventListener('blur', handleHelpBlur);
  helpButton.addEventListener('click', toggleTouchHelp);
  form.addEventListener('submit', submitCount);
  closeDialog.addEventListener('click', closeDialogSubmission);
  dialog.addEventListener('cancel', cancelNativeDialog);
  dialog.addEventListener('click', dismissDialogBackdrop);
  dialog.addEventListener('close', handleDialogClose);
  input.addEventListener('input', clearDialogError);
  root.addEventListener('pointerdown', setActive);
  root.addEventListener('focusin', setActive);
  root.addEventListener('focusout', handleToolbarFocusOut);
  window.addEventListener('pointermove', handleToolbarActivity, { passive: true });
  window.addEventListener('pointerdown', handleToolbarActivity, { passive: true });
  window.addEventListener('keydown', handleToolbarActivity);
  window.addEventListener('pointerdown', dismissHelpOutside, true);
  window.addEventListener('keydown', dismissHelpWithEscape);
  window.addEventListener('pointermove', moveHoleDrag, { passive: false });
  window.addEventListener('pointermove', trackExistingWellDeleteTarget, { capture: true, passive: false });
  window.addEventListener('pointerup', commitHoleDrag, { passive: false });
  window.addEventListener('pointerup', dropExistingWellOnDeleteTarget, true);
  window.addEventListener('pointercancel', cancelHoleDrag, { passive: false });
  window.addEventListener('pointercancel', clearExistingWellDeleteTarget, true);
  window.addEventListener('particle-count-change', updateCount);
  window.addEventListener('particle-mobile-randomize', handleRandomize);
  window.addEventListener('blur', handleWindowBlur);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  renderCount();
  setActive();

  const controller = {
    root,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (activityTimer != null) clearTimeout(activityTimer);
      activityTimer = null;
      stopCountRepeat();
      clearCountHold();
      if (suppressCountClickTimer != null) clearTimeout(suppressCountClickTimer);
      suppressCountClickTimer = null;
      suppressCountClick = false;
      closeHelp(true);
      clearExistingWellDeleteTarget();
      if (drag && pn && !pn._destroyed) pn.cancelGravityWellPlacement();
      drag = null;
      closeCountDialog(false);
      blackHole.removeEventListener('pointerdown', beginHoleDrag);
      whiteHole.removeEventListener('pointerdown', beginHoleDrag);
      decrease.removeEventListener('pointerdown', beginCountRepeat);
      increase.removeEventListener('pointerdown', beginCountRepeat);
      decrease.removeEventListener('pointerup', stopCountRepeat);
      increase.removeEventListener('pointerup', stopCountRepeat);
      decrease.removeEventListener('pointercancel', stopCountRepeat);
      increase.removeEventListener('pointercancel', stopCountRepeat);
      decrease.removeEventListener('lostpointercapture', stopCountRepeat);
      increase.removeEventListener('lostpointercapture', stopCountRepeat);
      countTrigger.removeEventListener('pointerdown', beginCountHold);
      countTrigger.removeEventListener('pointermove', moveCountHold);
      countTrigger.removeEventListener('pointerup', finishCountHold);
      countTrigger.removeEventListener('pointercancel', cancelCountHold);
      countTrigger.removeEventListener('lostpointercapture', loseCountHoldCapture);
      countTrigger.removeEventListener('click', activateCountTrigger);
      helpButton.removeEventListener('pointerdown', handleHelpPointerDown);
      helpButton.removeEventListener('pointerenter', handleHelpPointerEnter);
      helpButton.removeEventListener('pointerleave', handleHelpPointerLeave);
      helpButton.removeEventListener('focus', handleHelpFocus);
      helpButton.removeEventListener('blur', handleHelpBlur);
      helpButton.removeEventListener('click', toggleTouchHelp);
      form.removeEventListener('submit', submitCount);
      closeDialog.removeEventListener('click', closeDialogSubmission);
      dialog.removeEventListener('cancel', cancelNativeDialog);
      dialog.removeEventListener('click', dismissDialogBackdrop);
      dialog.removeEventListener('close', handleDialogClose);
      input.removeEventListener('input', clearDialogError);
      root.removeEventListener('pointerdown', setActive);
      root.removeEventListener('focusin', setActive);
      root.removeEventListener('focusout', handleToolbarFocusOut);
      window.removeEventListener('pointermove', handleToolbarActivity);
      window.removeEventListener('pointerdown', handleToolbarActivity);
      window.removeEventListener('keydown', handleToolbarActivity);
      window.removeEventListener('pointerdown', dismissHelpOutside, true);
      window.removeEventListener('keydown', dismissHelpWithEscape);
      window.removeEventListener('pointermove', moveHoleDrag, { passive: false });
      window.removeEventListener('pointermove', trackExistingWellDeleteTarget, true);
      window.removeEventListener('pointerup', commitHoleDrag, { passive: false });
      window.removeEventListener('pointerup', dropExistingWellOnDeleteTarget, true);
      window.removeEventListener('pointercancel', cancelHoleDrag, { passive: false });
      window.removeEventListener('pointercancel', clearExistingWellDeleteTarget, true);
      window.removeEventListener('particle-count-change', updateCount);
      window.removeEventListener('particle-mobile-randomize', handleRandomize);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (root.parentNode) root.parentNode.removeChild(root);
      if (dialog.parentNode) dialog.parentNode.removeChild(dialog);
      if (activeMobileControls === controller) activeMobileControls = null;
    }
  };
  activeMobileControls = controller;
  return controller;
}
