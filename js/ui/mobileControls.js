let activeMobileControls = null;
const MOBILE_MIN_PARTICLE_COUNT = 16;
const MOBILE_MAX_PARTICLE_COUNT = 5000;
const COUNT_HOLD_DURATION_MS = 550;
const COUNT_HOLD_TOLERANCE_PX = 12;

function createButton(label, attributes = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-label', label);
  for (const [name, value] of Object.entries(attributes)) button.setAttribute(name, value);
  return button;
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

  const whiteHole = createButton('Drag white hole onto canvas', {
    'class': 'mobile-hole-token mobile-hole-token-white',
    'data-hole-type': 'white'
  });
  whiteHole.appendChild(document.createElement('span')).setAttribute('aria-hidden', 'true');

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
  countControls.append(decrease, countTrigger, increase);
  root.append(holeBank, countControls);

  const dialog = document.createElement('dialog');
  dialog.id = 'mobile-particle-count-dialog';
  dialog.className = 'mobile-particle-count-dialog';
  dialog.setAttribute('aria-labelledby', 'mobile-particle-count-title');
  dialog.setAttribute('data-mobile-particle-count-dialog', '');

  const form = document.createElement('form');
  form.className = 'mobile-particle-count-form';
  form.noValidate = true;
  const title = document.createElement('h2');
  title.id = 'mobile-particle-count-title';
  title.textContent = 'Set particle count';
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
  const dialogActions = document.createElement('div');
  dialogActions.className = 'mobile-particle-count-actions';
  const cancelDialog = createButton('Cancel');
  cancelDialog.textContent = 'Cancel';
  cancelDialog.setAttribute('data-mobile-particle-count-cancel', '');
  const submitDialog = document.createElement('button');
  submitDialog.type = 'submit';
  submitDialog.textContent = 'OK';
  submitDialog.setAttribute('data-mobile-particle-count-submit', '');
  dialogActions.append(cancelDialog, submitDialog);
  form.append(title, label, input, error, dialogActions);
  dialog.appendChild(form);

  document.body.append(root, dialog);

  let destroyed = false;
  let idleTimer = null;
  let drag = null;
  let repeatDelay = null;
  let repeatInterval = null;
  let countHold = null;
  let suppressCountClick = false;
  let suppressCountClickTimer = null;
  let restoreFocusAfterDialog = true;

  function setActive() {
    if (destroyed) return;
    root.classList.add('is-active');
    if (idleTimer != null) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      idleTimer = null;
      if (!drag && !countHold && !dialog.open && repeatDelay == null && repeatInterval == null &&
          !root.matches(':focus-within')) {
        root.classList.remove('is-active');
      }
    }, 1400);
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
    blackHole.classList.remove('is-delete-target');
    whiteHole.classList.remove('is-delete-target');
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
    const target = matchingDeleteTarget(event, well);
    if (target) target.classList.add('is-delete-target');
  }

  function dropExistingWellOnDeleteTarget(event) {
    const well = existingWellDragForPointer(event);
    const target = matchingDeleteTarget(event, well);
    clearExistingWellDeleteTarget();
    if (!well || !target) return;
    pn.removeGravityWell(well.id);
    event.preventDefault();
  }

  function beginHoleDrag(event) {
    if (destroyed || event.button > 0 || drag) return;
    const button = event.currentTarget;
    const point = mapClientPoint(event.clientX, event.clientY);
    drag = { pointerId: event.pointerId, button };
    root.classList.add('is-dragging');
    setActive();
    pn.beginGravityWellPaletteDrag(button.dataset.holeType, point.x, point.y);
    try { button.setPointerCapture(event.pointerId); } catch (_) {}
    event.preventDefault();
    event.stopPropagation();
  }

  function moveHoleDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const point = mapClientPoint(event.clientX, event.clientY);
    pn.updateGravityWellPaletteDrag(point.x, point.y);
    event.preventDefault();
  }

  function finishHoleDrag(event, cancelled) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const current = drag;
    drag = null;
    root.classList.remove('is-dragging');
    if (!cancelled && pointIsDropTarget(event.clientX, event.clientY)) {
      const point = mapClientPoint(event.clientX, event.clientY);
      pn.commitGravityWellPaletteDrag(point.x, point.y);
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

  function cancelDialogSubmission() {
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
    setActive();
  }

  function beginCountHold(event) {
    if (destroyed || dialog.open || event.button > 0 || !event.isPrimary) return;
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
    clearCountHold();
  }

  function loseCountHoldCapture(event) {
    if (!countHold || event.pointerId !== countHold.pointerId) return;
    clearCountHold(false);
  }

  function activateCountTrigger(event) {
    if (event.detail === 0) {
      suppressCountClick = false;
      openCountDialog();
      return;
    }
    if (suppressCountClick) suppressCountClick = false;
    event.preventDefault();
    event.stopPropagation();
  }

  function stopCountRepeat() {
    if (repeatDelay != null) clearTimeout(repeatDelay);
    if (repeatInterval != null) clearInterval(repeatInterval);
    repeatDelay = null;
    repeatInterval = null;
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

  function handleVisibilityChange() {
    if (document.hidden) {
      stopCountRepeat();
      clearCountHold();
      clearExistingWellDeleteTarget();
      if (drag) pn.cancelGravityWellPlacement();
      drag = null;
      root.classList.remove('is-dragging');
    }
  }

  function handleWindowBlur() {
    stopCountRepeat();
    clearCountHold();
    clearExistingWellDeleteTarget();
    if (drag) pn.cancelGravityWellPlacement();
    drag = null;
    root.classList.remove('is-dragging');
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
  form.addEventListener('submit', submitCount);
  cancelDialog.addEventListener('click', cancelDialogSubmission);
  dialog.addEventListener('cancel', cancelNativeDialog);
  dialog.addEventListener('click', dismissDialogBackdrop);
  dialog.addEventListener('close', handleDialogClose);
  input.addEventListener('input', clearDialogError);
  root.addEventListener('pointerdown', setActive);
  root.addEventListener('focusin', setActive);
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
      if (idleTimer != null) clearTimeout(idleTimer);
      stopCountRepeat();
      clearCountHold();
      if (suppressCountClickTimer != null) clearTimeout(suppressCountClickTimer);
      suppressCountClickTimer = null;
      suppressCountClick = false;
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
      form.removeEventListener('submit', submitCount);
      cancelDialog.removeEventListener('click', cancelDialogSubmission);
      dialog.removeEventListener('cancel', cancelNativeDialog);
      dialog.removeEventListener('click', dismissDialogBackdrop);
      dialog.removeEventListener('close', handleDialogClose);
      input.removeEventListener('input', clearDialogError);
      root.removeEventListener('pointerdown', setActive);
      root.removeEventListener('focusin', setActive);
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
