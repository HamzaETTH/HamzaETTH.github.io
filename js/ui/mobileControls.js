let activeMobileControls = null;
const MOBILE_MIN_PARTICLE_COUNT = 16;

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
  const count = document.createElement('output');
  count.setAttribute('aria-label', 'Particle count');
  count.setAttribute('aria-live', 'polite');
  count.setAttribute('data-mobile-particle-count', '');
  count.textContent = String(pn.numParticles || 0);
  const increase = createButton('Increase particle count', {
    'data-mobile-count': 'increase'
  });
  increase.textContent = '+';
  countControls.append(decrease, count, increase);
  root.append(holeBank, countControls);
  document.body.appendChild(root);

  let destroyed = false;
  let idleTimer = null;
  let drag = null;
  let repeatDelay = null;
  let repeatInterval = null;

  function setActive() {
    if (destroyed) return;
    root.classList.add('is-active');
    if (idleTimer != null) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      idleTimer = null;
      if (!drag && repeatDelay == null && repeatInterval == null && !root.matches(':focus-within')) {
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

  function updateCount(event) {
    if (!event || !event.detail) return;
    count.textContent = String(event.detail.count);
  }

  function stepCount(direction, requestedDelta) {
    if (destroyed || pn._destroyed) return;
    const current = pn.numParticles | 0;
    const delta = requestedDelta || Math.max(16, Math.round(current * 0.25));
    pn.setParticleCount(direction > 0
      ? current + delta
      : Math.max(MOBILE_MIN_PARTICLE_COUNT, current - delta));
    count.textContent = String(pn.numParticles);
    setActive();
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
    stepCount(direction, delta);
    repeatDelay = setTimeout(() => {
      repeatDelay = null;
      repeatInterval = setInterval(() => stepCount(direction, delta), 180);
    }, 450);
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch (_) {}
    event.preventDefault();
  }

  function handleRandomize() {
    if (typeof actions.randomizeVisuals === 'function') actions.randomizeVisuals();
    setActive();
  }

  function handleVisibilityChange() {
    if (document.hidden) {
      stopCountRepeat();
      if (drag) pn.cancelGravityWellPlacement();
      drag = null;
      root.classList.remove('is-dragging');
    }
  }

  function handleWindowBlur() {
    stopCountRepeat();
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
  root.addEventListener('pointerdown', setActive);
  root.addEventListener('focusin', setActive);
  window.addEventListener('pointermove', moveHoleDrag, { passive: false });
  window.addEventListener('pointerup', commitHoleDrag, { passive: false });
  window.addEventListener('pointercancel', cancelHoleDrag, { passive: false });
  window.addEventListener('particle-count-change', updateCount);
  window.addEventListener('particle-mobile-randomize', handleRandomize);
  window.addEventListener('blur', handleWindowBlur);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  setActive();

  const controller = {
    root,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (idleTimer != null) clearTimeout(idleTimer);
      stopCountRepeat();
      if (drag && pn && !pn._destroyed) pn.cancelGravityWellPlacement();
      drag = null;
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
      root.removeEventListener('pointerdown', setActive);
      root.removeEventListener('focusin', setActive);
      window.removeEventListener('pointermove', moveHoleDrag, { passive: false });
      window.removeEventListener('pointerup', commitHoleDrag, { passive: false });
      window.removeEventListener('pointercancel', cancelHoleDrag, { passive: false });
      window.removeEventListener('particle-count-change', updateCount);
      window.removeEventListener('particle-mobile-randomize', handleRandomize);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (root.parentNode) root.parentNode.removeChild(root);
      if (activeMobileControls === controller) activeMobileControls = null;
    }
  };
  activeMobileControls = controller;
  return controller;
}
