import { rgbArrayToHex, randInt, rand01, randBool, randHex } from './utils.js';
import { applyParamsToNetwork } from './applyParams.js';
import { mountMobileControls } from './mobileControls.js';

const TWEAKPANE_URL = 'https://cdn.jsdelivr.net/npm/tweakpane@4.0.5/dist/tweakpane.min.js';
const PARTICLE_FORCE_SLIDER_STEP = 0.05;
const PARTICLE_FORCE_RECOMMENDED_MIN = 1.5;
const PARTICLE_FORCE_RECOMMENDED_MAX = 5;
let paneBuildPromise = null;
let activeUi = null;
let mobileControls = null;
let lifecycleGeneration = 0;

function describeObjectSelection(action, result) {
  if (!result || (!result.particles && !result.wells)) return action === 'Copied' ? 'Nothing selected' : 'Nothing to paste';
  const parts = [];
  if (result.particles) parts.push(`${result.particles} particle${result.particles === 1 ? '' : 's'}`);
  if (result.wells) parts.push(`${result.wells} well${result.wells === 1 ? '' : 's'}`);
  return `${action} ${parts.join(' + ')}`;
}

function showObjectSelectionToast(message) {
  if (window.hotkeyManager && typeof window.hotkeyManager.showToast === 'function') {
    window.hotkeyManager.showToast(message, { duration: 1500 });
  }
}

function isEditableHotkeyTarget(event) {
  const target = event && event.target;
  return Boolean(target && target.closest && target.closest('input, textarea, select, [contenteditable="true"]'));
}

function handleContextualControlsHotkey(pn, event, toggleControls) {
  if (event && event.repeat) return;
  if (event && (event.ctrlKey || event.metaKey)) {
    if (isEditableHotkeyTarget(event)) return;
    const result = pn && typeof pn.copyObjectSelection === 'function' ? pn.copyObjectSelection() : null;
    if (result) {
      event.preventDefault();
      showObjectSelectionToast(describeObjectSelection('Copied', result));
    }
    return;
  }
  toggleControls();
}

function handlePasteSelectionHotkey(pn, event) {
  if (!event || (!event.ctrlKey && !event.metaKey) || event.repeat) return;
  if (isEditableHotkeyTarget(event)) return;
  event.preventDefault();
  const result = pn && typeof pn.pasteObjectSelection === 'function' ? pn.pasteObjectSelection() : null;
  showObjectSelectionToast(describeObjectSelection('Pasted', result));
}

function recommendedParticleForceMaximum(pn) {
  const particleCount = Number.isFinite(pn && pn.numParticles) ? Math.max(0, pn.numParticles) : 0;
  const distance = Number.isFinite(pn && pn.options && pn.options.particleInteractionDistance)
    ? Math.max(0, pn.options.particleInteractionDistance)
    : 0;
  const width = Number.isFinite(pn && pn.i && pn.i.size && pn.i.size.width) ? Math.max(0, pn.i.size.width) : 0;
  const height = Number.isFinite(pn && pn.i && pn.i.size && pn.i.size.height) ? Math.max(0, pn.i.size.height) : 0;
  const canvasArea = width * height;
  if (canvasArea <= 0) return PARTICLE_FORCE_RECOMMENDED_MAX;

  const neighbors = Math.max(0, particleCount - 1) * Math.PI * distance * distance / canvasArea;
  const scaledMaximum = PARTICLE_FORCE_RECOMMENDED_MAX / Math.sqrt(Math.max(1, neighbors));
  const clampedMaximum = Math.max(
    PARTICLE_FORCE_RECOMMENDED_MIN,
    Math.min(PARTICLE_FORCE_RECOMMENDED_MAX, scaledMaximum)
  );
  return Math.ceil(clampedMaximum * 4) / 4;
}

// Utility: create container for pane we can show/hide
function ensurePaneContainer() {
  let el = document.getElementById('tp-container');
  if (!el) {
    el = document.createElement('div');
    el.id = 'tp-container';
    el.style.position = 'fixed';
    el.style.top = '12px';
    el.style.right = '12px';
    el.style.zIndex = '2000';
    el.style.display = 'none';
    document.body.appendChild(el);
  }
  return el;
}

function buildParamsFromNetwork(pn) {
  const o = pn.options || {};
  return {
    // Background
    background: o.background || '#000000',

    // Particles
    particleColor: o.particleColor || '#ffffff',
    particleSize: o.particleSize != null ? o.particleSize : 1,
    particleColorCycling: !!o.particleColorCycling,
    particleCyclingSpeed: o.particleCyclingSpeed != null ? o.particleCyclingSpeed : 10,
    particleRepulsion: !!o.particleRepulsion,
    particleAttraction: !!o.particleAttraction,
    particleAttractionForce: o.particleAttractionForce != null ? o.particleAttractionForce : 5,
    particleCollision: !!o.particleCollision,

    // Lines
    gradientEffect: o.gradientEffect !== false,
    gradientColor1: o.gradientColor1 || '#00bfff',
    gradientColor2: o.gradientColor2 || '#ff4500',
    lineColorCycling: o.lineColorCycling !== false,
    lineCyclingSpeed: o.lineCyclingSpeed != null ? o.lineCyclingSpeed : 50,
    randomizeDistanceColors: !!o.randomizeDistanceColors,
    colorDifferentiationMethod: (o.colorDifferentiationMethod || 'hueDistance'),
    distanceColorCyclingSpeed: o.distanceColorCyclingSpeed != null ? o.distanceColorCyclingSpeed : (o.lineCyclingSpeed != null ? o.lineCyclingSpeed : 50),

    // Interaction
    interactive: o.interactive !== false,
    proximityEffectColor: o.proximityEffectColor || '#ff0000',
    proximityEffectDistance: o.proximityEffectDistance != null ? o.proximityEffectDistance : 100,
    // UI shows radius in px; internal stores units (px/10)
    attractionRange: o.attractionRange != null ? (o.attractionRange * 10) : 10,
    attractionIntensity: o.attractionIntensity != null ? o.attractionIntensity : 1,
    repulsionRange: o.repulsionRange != null ? (o.repulsionRange * 10) : 10,
    repulsionIntensity: o.repulsionIntensity != null ? o.repulsionIntensity : 1,

    // Physics
    speed: typeof o.velocity === 'number' ? o.velocity : 0.66,
    density: pn.options && pn.options.density ? pn.options.density : 10000,
    boundaryMode: o.boundaryMode || 'bounce',

    // Effects
    opacity: o.opacity != null ? o.opacity : 0.7,
    useDistanceEffect: !!o.useDistanceEffect,
    maxColorChangeDistance: o.maxColorChangeDistance != null ? o.maxColorChangeDistance : 120,
    startColor: o.startColor || '#0BDA51',
    endColor: o.endColor || '#BF00FF',
    lineConnectionDistance: o.lineConnectionDistance != null ? o.lineConnectionDistance : 120,
    adaptiveLineDetail: o.adaptiveLineDetail === true,
    cellularLineClusters: o.cellularLineClusters === true,
    blackHoleLineColor: o.blackHoleLineColor === true,
    particleInteractionDistance: o.particleInteractionDistance != null ? o.particleInteractionDistance : 50,
    particleRepulsionForce: o.particleRepulsionForce != null ? o.particleRepulsionForce : 5,

    // Perf
    performanceOverlay: !!o.performanceOverlay,

    // Trails
    trails: !!o.trails,
    trailFade: o.trailFade != null ? o.trailFade : 0.08,

    // Electric lines
    lineJitter: !!o.lineJitter,
    lineJitterSegments: o.lineJitterSegments != null ? o.lineJitterSegments : 6,
    lineJitterAmplitude: o.lineJitterAmplitude != null ? o.lineJitterAmplitude : 0.12,

    // Curved drift motion
    curvedDrift: !!o.curvedDrift,
    // Expose UI 1..100 (100 => internal 0.20)
    curvedDriftCurvature: o.curvedDriftCurvature != null ? Math.round(o.curvedDriftCurvature * 500) : 60,
    curvedDriftNoiseSpeed: o.curvedDriftNoiseSpeed != null ? o.curvedDriftNoiseSpeed : 1.5,

    // Gather
    gatherRadius: o.gatherRadius != null ? o.gatherRadius : 100,

    // Gravity wells
    gravityWellsEnabled: o.gravityWellsEnabled !== false,
    gravityWellMotion: o.gravityWellMotion || 'system',
    gravityWellAccelerationCapped: pn.gravityWellAccelerationCapped !== false,
    gravityWellAccelerationLimit: Number.isFinite(pn.gravityWellAccelerationLimit) ? pn.gravityWellAccelerationLimit : 1.5,
    gravityWellForceMultiplier: Number.isFinite(o.gravityWellForceMultiplier) ? o.gravityWellForceMultiplier : 1,
    gravityWellSpin: Number.isFinite(o.gravityWellSpin) ? o.gravityWellSpin : 0.2,
    cursorCaptureForceMultiplier: Number.isFinite(o.cursorCaptureForceMultiplier) ? o.cursorCaptureForceMultiplier : 1,
    cursorCaptureMaxSpeed: Number.isFinite(o.cursorCaptureMaxSpeed) ? o.cursorCaptureMaxSpeed : 2.64,
  };
}

// Ensure global access for scripted tweaks
window.applyParamsToNetwork = applyParamsToNetwork;

async function buildPane() {
  const pn = window.particleInstance;
  const generation = lifecycleGeneration;
  if (!pn || pn._destroyed) return null;
  const { Pane } = await import(TWEAKPANE_URL);
  if (generation !== lifecycleGeneration || pn !== window.particleInstance || pn._destroyed) return null;

  // Color methods array (shared by hotkey handler and randomize function)
  const colorMethods = ['hueDistance','complementary','triadic','analogous','labPerceptual','wcagContrast'];
  let currentColorMethodIndex = 0;

  const container = ensurePaneContainer();
  const pane = new Pane({ title: 'Controls', container });

  const PARAMS = buildParamsFromNetwork(pn);
  // Snapshot current as reset baseline rather than global defaults
  const DEFAULTS = { ...PARAMS };
  const initialRecommendedParticleForceMaximum = recommendedParticleForceMaximum(pn);
  const WELL_PARAMS = {
    radius: pn.options.gravityWellRadius || 150,
    strength: pn.options.gravityWellStrength || 12,
    innerColor: pn.options.blackHoleInnerColor || '#ff8080',
    outerColor: pn.options.blackHoleOuterColor || '#3633ff'
  };

  // Shared reset that truly restores defaults and clears transient state
  function doReset() {
    Object.keys(DEFAULTS).forEach(k => { PARAMS[k] = DEFAULTS[k]; });
    applyParamsToNetwork(pn, PARAMS);
    // Clear transient forces and effects
    try {
      if (pn) {
        pn.attractionForce = null;
        pn.repulsionForce = null;
        pn._gatherActive = false;
        if (typeof pn._stopCursorCapture === 'function') pn._stopCursorCapture();
        pn.forceHueSweep = false;
        if (typeof pn.clearGravityWells === 'function') pn.clearGravityWells();
        // Wipe 2D canvas (clear trails immediately)
        if (pn.g && pn.i && pn.i.size) {
          pn.g.clearRect(0, 0, pn.i.size.width, pn.i.size.height);
        }
        // Wipe GL buffers
        if (pn.glRenderer && pn.glRenderer.gl) {
          const gl = pn.glRenderer.gl;
          gl.clear(gl.COLOR_BUFFER_BIT);
        }
        // Rebuild particles for a pristine state
        if (typeof pn._rebuildOnResize === 'function') pn._rebuildOnResize();
      }
    } catch (_) {}
    updateParticleForceRanges(true);
    if (typeof pane.refresh === 'function') pane.refresh();
  }

  // Top-level Performance Overlay checkbox (pinned at top)
  pane.addBinding(PARAMS, 'performanceOverlay', { label: 'Performance Overlay' })
    .on('change', () => applyParamsToNetwork(pn, PARAMS));

  // Tabs to compact the UI
  const tabs = pane.addTab({ pages: [
    { title: 'Main' },
    { title: 'Wells' },
    { title: 'Advanced' },
  ]});

  // Quick
  const main = tabs.pages[0];
  const mainBg = main.addFolder({ title: 'Background', expanded: true });
  mainBg.addBinding(PARAMS, 'background', { view: 'color', label: 'Background' }).on('change', () => applyParamsToNetwork(pn, PARAMS));
  // Lines (core)
  const mainLines = main.addFolder({ title: 'Lines', expanded: true });
  mainLines.addBinding(PARAMS, 'adaptiveLineDetail', { label: 'Adaptive Line Detail' })
    .on('change', () => applyParamsToNetwork(pn, PARAMS));
  mainLines.addBinding(PARAMS, 'cellularLineClusters', { label: 'Grid Effect' })
    .on('change', () => applyParamsToNetwork(pn, PARAMS));
  mainLines.addBinding(PARAMS, 'blackHoleLineColor', { label: 'Black Hole Line Color' })
    .on('change', () => applyParamsToNetwork(pn, PARAMS));
  const bindUseDistance = mainLines.addBinding(PARAMS, 'useDistanceEffect', { label: 'Distance Color Effect' }).on('change', () => {
    if (PARAMS.useDistanceEffect) {
      PARAMS.gradientEffect = false;
    }
    applyParamsToNetwork(pn, PARAMS);
    updateVisibility();
  });
  const bindMaxColorDist = mainLines.addBinding(PARAMS, 'maxColorChangeDistance', { min: 20, max: 400, step: 5, label: 'Max Color Change Distance' }).on('change', () => applyParamsToNetwork(pn, PARAMS));
  const bindStartColor = mainLines.addBinding(PARAMS, 'startColor', { view: 'color', label: 'Start Color' }).on('change', () => applyParamsToNetwork(pn, PARAMS));
  const bindEndColor = mainLines.addBinding(PARAMS, 'endColor', { view: 'color', label: 'End Color' }).on('change', () => applyParamsToNetwork(pn, PARAMS));
  const bindRandDistColors = mainLines.addBinding(PARAMS, 'randomizeDistanceColors', { label: 'Randomize Distance Colors' }).on('change', () => {
    if (PARAMS.randomizeDistanceColors && PARAMS.useDistanceEffect) {
      PARAMS.lineColorCycling = false;
    }
    applyParamsToNetwork(pn, PARAMS);
  });
  const bindDistCycleSpeed = mainLines.addBinding(PARAMS, 'distanceColorCyclingSpeed', { min: 0, max: 100, step: 1, label: 'Distance Cycling Speed' }).on('change', () => applyParamsToNetwork(pn, PARAMS));
  // Gradient Effect
  const bindGradientEffect = mainLines.addBinding(PARAMS, 'gradientEffect', { label: 'Gradient Color Effect' }).on('change', () => {
    if (PARAMS.gradientEffect) {
      PARAMS.useDistanceEffect = false;
    }
    applyParamsToNetwork(pn, PARAMS);
    updateVisibility();
  });
  const bindGradient1 = mainLines.addBinding(PARAMS, 'gradientColor1', { view: 'color', label: 'Gradient Color 1' }).on('change', () => applyParamsToNetwork(pn, PARAMS));
  const bindGradient2 = mainLines.addBinding(PARAMS, 'gradientColor2', { view: 'color', label: 'Gradient Color 2' }).on('change', () => applyParamsToNetwork(pn, PARAMS));
  const bindLineColorCycling = mainLines.addBinding(PARAMS, 'lineColorCycling', { label: 'Line Color Cycling' }).on('change', () => { applyParamsToNetwork(pn, PARAMS); updateVisibility(); });
  const bindLineCyclingSpeed = mainLines.addBinding(PARAMS, 'lineCyclingSpeed', { min: 0, max: 100, step: 1, label: 'Line Color Cycling Speed' }).on('change', () => applyParamsToNetwork(pn, PARAMS));
  
  mainLines.addBinding(PARAMS, 'lineConnectionDistance', { min: 20, max: 300, step: 5, label: 'Line Connection Distance' }).on('change', () => applyParamsToNetwork(pn, PARAMS));
  mainLines.addBinding(PARAMS, 'colorDifferentiationMethod', { 
    label: 'Color Differentiation Method',
    options: {
      "Hue Distance": 'hueDistance', 
      Complementary: 'complementary', 
      Triadic: 'triadic', 
      Analogous: 'analogous', 
      "Lab Perceptual": 'labPerceptual', 
      "WCAG Contrast": 'wcagContrast'
    }
  }).on('change', () => {
    // Regenerate colors when method changes
    if (pn && pn.regenerateLineColors) {
      pn.regenerateLineColors();
    }
    applyParamsToNetwork(pn, PARAMS);
  });
  // Effects (combined)
  const mainEffects = main.addFolder({ title: 'Effects', expanded: true });
  mainEffects.addBinding(PARAMS, 'trails', { label: 'Trails (Hide Lines)' }).on('change', () => applyParamsToNetwork(pn, PARAMS));
  mainEffects.addBinding(PARAMS, 'trailFade', { min: 0.01, max: 0.3, step: 0.01, label: 'Trail Fade' }).on('change', () => applyParamsToNetwork(pn, PARAMS));
  const bindLineJitter = mainEffects.addBinding(PARAMS, 'lineJitter', { label: 'Electric Lines' }).on('change', () => { applyParamsToNetwork(pn, PARAMS); updateVisibility(); });
  const bindJitterSegments = mainEffects.addBinding(PARAMS, 'lineJitterSegments', { min: 6, max: 24, step: 1, label: 'Jitter Segments' }).on('change', () => applyParamsToNetwork(pn, PARAMS));
  const bindJitterAmplitude = mainEffects.addBinding(PARAMS, 'lineJitterAmplitude', { min: 0.0, max: 0.5, step: 0.01, label: 'Jitter Amplitude' }).on('change', () => applyParamsToNetwork(pn, PARAMS));

  // Particles
  const mainParticles = main.addFolder({ title: 'Particles', expanded: true });
  mainParticles.addBinding(PARAMS, 'particleSize', { min: 1, max: 8, step: 1, label: 'Size' }).on('change', () => applyParamsToNetwork(pn, PARAMS));
  const bindParticleColor = mainParticles.addBinding(PARAMS, 'particleColor', { view: 'color', label: 'Particle Color' }).on('change', () => applyParamsToNetwork(pn, PARAMS));
  const bindParticleColorCycling = mainParticles.addBinding(PARAMS, 'particleColorCycling', { label: 'Particle Color Cycling' }).on('change', () => { applyParamsToNetwork(pn, PARAMS); updateVisibility(); });
  const bindParticleCyclingSpeed = mainParticles.addBinding(PARAMS, 'particleCyclingSpeed', { min: 0, max: 10, step: 0.1, label: 'Particle Color Cycling Speed' }).on('change', () => applyParamsToNetwork(pn, PARAMS));

  // Particle collisions and forces
  const bindParticleCollision = mainParticles.addBinding(PARAMS, 'particleCollision', { label: 'Particle Collision' }).on('change', () => { applyParamsToNetwork(pn, PARAMS); updateVisibility(); });
  const bindParticleAttraction = mainParticles.addBinding(PARAMS, 'particleAttraction', { label: 'Particle Attraction' }).on('change', () => {
    if (PARAMS.particleAttraction) {
      PARAMS.particleRepulsion = false;
      bindParticleRepulsion.refresh();
    }
    applyParamsToNetwork(pn, PARAMS);
    updateVisibility();
  });
  const bindParticleRepulsion = mainParticles.addBinding(PARAMS, 'particleRepulsion', { label: 'Particle Repulsion' }).on('change', () => {
    if (PARAMS.particleRepulsion) {
      PARAMS.particleAttraction = false;
      bindParticleAttraction.refresh();
    }
    applyParamsToNetwork(pn, PARAMS);
    updateVisibility();
  });
  const bindParticleInteractionDistance = mainParticles.addBinding(PARAMS, 'particleInteractionDistance', { min: 0, max: 200, step: 1, label: 'Interaction Distance' }).on('change', () => {
    applyParamsToNetwork(pn, PARAMS);
    updateParticleForceRanges();
  });
  const bindParticleAttractionForce = mainParticles.addBinding(PARAMS, 'particleAttractionForce', {
    min: 0,
    max: Math.max(initialRecommendedParticleForceMaximum, PARAMS.particleAttractionForce),
    step: PARTICLE_FORCE_SLIDER_STEP,
    label: 'Attraction Force'
  }).on('change', () => {
    applyParamsToNetwork(pn, PARAMS);
    updateParticleForceRanges();
  });
  const bindParticleRepulsionForce = mainParticles.addBinding(PARAMS, 'particleRepulsionForce', {
    min: 0,
    max: Math.max(initialRecommendedParticleForceMaximum, PARAMS.particleRepulsionForce),
    step: PARTICLE_FORCE_SLIDER_STEP,
    label: 'Repulsion Force'
  }).on('change', () => {
    applyParamsToNetwork(pn, PARAMS);
    updateParticleForceRanges();
  });

  const wellsPage = tabs.pages[1];
  const globalWellsFolder = wellsPage.addFolder({ title: 'Global Physics', expanded: true });
  const bindGravityWellsEnabled = globalWellsFolder.addBinding(PARAMS, 'gravityWellsEnabled', { label: 'Global Enabled' })
    .on('change', () => applyParamsToNetwork(pn, PARAMS));
  globalWellsFolder.addBinding(PARAMS, 'gravityWellMotion', {
    label: 'Motion',
    options: { System: 'system', Animate: 'animate', Static: 'static' }
  }).on('change', () => applyParamsToNetwork(pn, PARAMS));
  const bindGravityAccelerationCapped = globalWellsFolder.addBinding(PARAMS, 'gravityWellAccelerationCapped', {
    label: 'Limit Acceleration'
  }).on('change', () => {
    applyParamsToNetwork(pn, PARAMS);
    updateGravityLimitState();
  });
  const bindGravityAccelerationLimit = globalWellsFolder.addBinding(PARAMS, 'gravityWellAccelerationLimit', {
    min: 0, max: 10, step: 0.1, label: 'Maximum Acceleration'
  }).on('change', () => applyParamsToNetwork(pn, PARAMS));
  const bindGravityForceMultiplier = globalWellsFolder.addBinding(PARAMS, 'gravityWellForceMultiplier', {
    min: 0, max: 5, step: 0.1, label: 'Global Force'
  }).on('change', () => applyParamsToNetwork(pn, PARAMS));
  const bindGravitySpin = globalWellsFolder.addBinding(PARAMS, 'gravityWellSpin', {
    min: -1, max: 1, step: 0.05, label: 'Particle Spin'
  }).on('change', () => applyParamsToNetwork(pn, PARAMS));

  function updateGravityLimitState() {
    bindGravityAccelerationLimit.disabled = !PARAMS.gravityWellAccelerationCapped;
  }

  const manageWellsFolder = wellsPage.addFolder({ title: 'Add / Manage', expanded: true });
  manageWellsFolder.addButton({ title: 'Add Black Hole' }).on('click', () => {
    PARAMS.gravityWellsEnabled = true;
    bindGravityWellsEnabled.refresh();
    pn.beginGravityWellPlacement('black', false);
  });
  manageWellsFolder.addButton({ title: 'Add White Hole' }).on('click', () => {
    PARAMS.gravityWellsEnabled = true;
    bindGravityWellsEnabled.refresh();
    pn.beginGravityWellPlacement('white', false);
  });
  const clearWellsButton = manageWellsFolder.addButton({ title: 'Clear All' });
  clearWellsButton.on('click', () => pn.clearGravityWells());

  const selectedWellFolder = wellsPage.addFolder({ title: 'Selected Hole', expanded: true });
  const bindWellRadius = selectedWellFolder.addBinding(WELL_PARAMS, 'radius', {
    min: 24, max: 500, step: 1, label: 'Radius'
  }).on('change', () => pn.updateSelectedGravityWell({ radius: WELL_PARAMS.radius }));
  const bindWellStrength = selectedWellFolder.addBinding(WELL_PARAMS, 'strength', {
    min: -100, max: 100, step: 0.5, label: 'Strength'
  }).on('change', () => pn.updateSelectedGravityWell({ strength: WELL_PARAMS.strength }));
  const bindWellInnerColor = selectedWellFolder.addBinding(WELL_PARAMS, 'innerColor', {
    view: 'color', label: 'Inner Color'
  }).on('change', () => pn.updateSelectedGravityWell({ innerColor: WELL_PARAMS.innerColor }));
  const bindWellOuterColor = selectedWellFolder.addBinding(WELL_PARAMS, 'outerColor', {
    view: 'color', label: 'Outer Color'
  }).on('change', () => pn.updateSelectedGravityWell({ outerColor: WELL_PARAMS.outerColor }));
  const reverseWellButton = selectedWellFolder.addButton({ title: 'Reverse Selected' });
  reverseWellButton.on('click', () => {
    const selected = pn.getSelectedGravityWell();
    if (selected) pn.reverseGravityWell(selected.id);
  });
  const repositionWellButton = selectedWellFolder.addButton({ title: 'Reposition/Resize' });
  repositionWellButton.on('click', () => pn.beginSelectedGravityWellPlacement());
  const removeWellButton = selectedWellFolder.addButton({ title: 'Remove Selected' });
  removeWellButton.on('click', () => pn.removeSelectedGravityWell());

  const captureFolder = wellsPage.addFolder({ title: 'Cursor Capture', expanded: true });
  const bindGatherRadius = captureFolder.addBinding(PARAMS, 'gatherRadius', {
    min: 0, max: 500, step: 1, label: 'Capture / Gather Radius'
  }).on('change', () => applyParamsToNetwork(pn, PARAMS));
  const bindCaptureForceMultiplier = captureFolder.addBinding(PARAMS, 'cursorCaptureForceMultiplier', {
    min: 0, max: 5, step: 0.1, label: 'Capture Pull'
  }).on('change', () => applyParamsToNetwork(pn, PARAMS));
  const bindCaptureMaxSpeed = captureFolder.addBinding(PARAMS, 'cursorCaptureMaxSpeed', {
    min: 0, max: 10, step: 0.01, label: 'Captured Max Speed'
  }).on('change', () => applyParamsToNetwork(pn, PARAMS));

  function syncGravityWellControls() {
    PARAMS.gravityWellsEnabled = pn.options.gravityWellsEnabled !== false;
    PARAMS.gravityWellAccelerationCapped = pn.gravityWellAccelerationCapped !== false;
    PARAMS.gravityWellAccelerationLimit = Number.isFinite(pn.gravityWellAccelerationLimit) ? pn.gravityWellAccelerationLimit : 1.5;
    PARAMS.gravityWellForceMultiplier = Number.isFinite(pn.options.gravityWellForceMultiplier) ? pn.options.gravityWellForceMultiplier : 1;
    PARAMS.gravityWellSpin = Number.isFinite(pn.options.gravityWellSpin) ? pn.options.gravityWellSpin : 0.2;
    PARAMS.cursorCaptureForceMultiplier = Number.isFinite(pn.options.cursorCaptureForceMultiplier) ? pn.options.cursorCaptureForceMultiplier : 1;
    PARAMS.cursorCaptureMaxSpeed = Number.isFinite(pn.options.cursorCaptureMaxSpeed) ? pn.options.cursorCaptureMaxSpeed : 2.64;
    PARAMS.gatherRadius = Number.isFinite(pn.options.gatherRadius) ? pn.options.gatherRadius : 100;
    bindGravityWellsEnabled.refresh();
    bindGravityAccelerationCapped.refresh();
    bindGravityAccelerationLimit.refresh();
    bindGravityForceMultiplier.refresh();
    bindGravitySpin.refresh();
    bindGatherRadius.refresh();
    bindCaptureForceMultiplier.refresh();
    bindCaptureMaxSpeed.refresh();
    updateGravityLimitState();
    const selected = pn.getSelectedGravityWell();
    const disabled = !selected;
    [bindWellRadius, bindWellStrength, bindWellInnerColor, bindWellOuterColor,
      reverseWellButton, repositionWellButton, removeWellButton].forEach(control => { control.disabled = disabled; });
    clearWellsButton.disabled = pn.gravityWells.length === 0;
    if (!selected) return;
    WELL_PARAMS.radius = selected.radius;
    WELL_PARAMS.strength = selected.strength;
    WELL_PARAMS.innerColor = selected.innerColor;
    WELL_PARAMS.outerColor = selected.outerColor;
    bindWellRadius.refresh();
    bindWellStrength.refresh();
    bindWellInnerColor.refresh();
    bindWellOuterColor.refresh();
  }

  const onGravityWellsChange = () => syncGravityWellControls();
  window.addEventListener('particle-gravity-wells-change', onGravityWellsChange);
  syncGravityWellControls();

  const adv = tabs.pages[2];

  // Motion
  const motionMain = adv.addFolder({ title: 'Motion', expanded: true });
  motionMain.addBinding(PARAMS, 'speed', { min: 0, max: 2, step: 0.01, label: 'Speed' }).on('change', () => applyParamsToNetwork(pn, PARAMS));
  motionMain.addBinding(PARAMS, 'boundaryMode', { label: 'Boundary Mode', options: { bounce: 'bounce', wrap: 'wrap', none: 'none' }}).on('change', () => applyParamsToNetwork(pn, PARAMS));
  const bindCurvedDrift = motionMain.addBinding(PARAMS, 'curvedDrift', { label: 'Curved Drift' }).on('change', () => { applyParamsToNetwork(pn, PARAMS); updateVisibility(); });
  const bindCurvedCurv = motionMain.addBinding(PARAMS, 'curvedDriftCurvature', { min: 1, max: 100, step: 1, label: 'Curve Intensity' }).on('change', () => applyParamsToNetwork(pn, PARAMS));
  const bindCurvedNoise = motionMain.addBinding(PARAMS, 'curvedDriftNoiseSpeed', { min: 0.1, max: 4.0, step: 0.1, label: 'Noise Speed' }).on('change', () => applyParamsToNetwork(pn, PARAMS));

  // Interaction
  const inter = adv.addFolder({ title: 'Interaction', expanded: true });
  const bindInteractive = inter.addBinding(PARAMS, 'interactive', { label: 'Interactive' })
    .on('change', () => { applyParamsToNetwork(pn, PARAMS); updateVisibility(); });

  const proximityFolder = inter.addFolder({ title: 'Pointer Highlight', expanded: true });
  const bindProxColor = proximityFolder.addBinding(PARAMS, 'proximityEffectColor', { view: 'color', label: 'Highlight Color' })
    .on('change', () => applyParamsToNetwork(pn, PARAMS));
  const bindProxDistance = proximityFolder.addBinding(PARAMS, 'proximityEffectDistance', { min: 20, max: 250, step: 5, label: 'Highlight Distance' })
    .on('change', () => applyParamsToNetwork(pn, PARAMS));

  const mouseForces = inter.addFolder({ title: 'Mouse Forces', expanded: true });
  const bindAttractionRange = mouseForces.addBinding(PARAMS, 'attractionRange', { min: 0, max: 300, step: 5, label: 'Repulsion Radius (px)' })
    .on('change', () => applyParamsToNetwork(pn, PARAMS));
  const bindAttractionIntensity = mouseForces.addBinding(PARAMS, 'attractionIntensity', { min: 0, max: 30, step: 0.5, label: 'Repulsion Intensity' })
    .on('change', () => applyParamsToNetwork(pn, PARAMS));
  const bindRepulsionRange = mouseForces.addBinding(PARAMS, 'repulsionRange', { min: 0, max: 300, step: 5, label: 'Attraction Radius (px)' })
    .on('change', () => applyParamsToNetwork(pn, PARAMS));
  const bindRepulsionIntensity = mouseForces.addBinding(PARAMS, 'repulsionIntensity', { min: 0, max: 30, step: 0.5, label: 'Attraction Intensity' })
    .on('change', () => applyParamsToNetwork(pn, PARAMS));

  // Dependent visibility logic
  function updateVisibility() {
    // Gradient colors visible only when gradient effect is on
    bindGradient1.hidden = !PARAMS.gradientEffect;
    bindGradient2.hidden = !PARAMS.gradientEffect;
    // Show line cycling speed only when cycling is enabled
    const lineCycleOn = !!PARAMS.lineColorCycling;
    bindLineCyclingSpeed.hidden = !lineCycleOn;
    // Mutual exclusion handled by on-change; keep both toggles enabled
    // Show particle cycling speed only when particle cycling is enabled
    const particleCycleOn = !!PARAMS.particleColorCycling;
    bindParticleCyclingSpeed.hidden = !particleCycleOn;
    // Show inter-particle interaction controls
    const particleRepulsionOn = !!PARAMS.particleRepulsion;
    const particleAttractionOn = !!PARAMS.particleAttraction;
    bindParticleInteractionDistance.hidden = !(particleRepulsionOn || particleAttractionOn);
    bindParticleRepulsionForce.hidden = !particleRepulsionOn;
    bindParticleAttractionForce.hidden = !particleAttractionOn;
    // Distance Effect children
    const distOn = !!PARAMS.useDistanceEffect;
    bindMaxColorDist.hidden = !distOn;
    bindStartColor.hidden = !distOn;
    bindEndColor.hidden = !distOn;
    bindRandDistColors.hidden = !distOn;
    bindDistCycleSpeed.hidden = !distOn;
    // Electric lines advanced controls
    const jitterOn = !!PARAMS.lineJitter;
    bindJitterSegments.hidden = !jitterOn;
    bindJitterAmplitude.hidden = !jitterOn;
    // Curved drift controls hidden when off (keep Attraction Radius visible)
    const curvedOn = !!PARAMS.curvedDrift;
    bindCurvedCurv.hidden = !curvedOn;
    bindCurvedNoise.hidden = !curvedOn;
    // Interaction: hide dependents when Interactive is OFF
    const interactiveOn = !!PARAMS.interactive;
    bindProxColor.hidden = !interactiveOn;
    bindProxDistance.hidden = !interactiveOn;
    bindAttractionRange.hidden = !interactiveOn;
    bindAttractionIntensity.hidden = !interactiveOn;
    bindRepulsionRange.hidden = !interactiveOn;
    bindRepulsionIntensity.hidden = !interactiveOn;
  }
  updateVisibility();

  // Actions at bottom of Main tab
  const mainActions = main.addFolder({ title: 'Actions', expanded: true });
  const actionsRandBtn = mainActions.addButton({ title: 'Randomize Visuals' });
  actionsRandBtn.on('click', randomizeVisualParams);
  const actionsResetBtn = mainActions.addButton({ title: 'Reset to Default' });
  actionsResetBtn.on('click', doReset);
  const actionsResetEffectsBtn = mainActions.addButton({ title: 'Reset Effects Only' });
  actionsResetEffectsBtn.on('click', () => {
    PARAMS.trails = DEFAULTS.trails;
    PARAMS.trailFade = DEFAULTS.trailFade;
    PARAMS.lineJitter = DEFAULTS.lineJitter;
    PARAMS.lineJitterSegments = DEFAULTS.lineJitterSegments;
    PARAMS.lineJitterAmplitude = DEFAULTS.lineJitterAmplitude;
    PARAMS.curvedDrift = DEFAULTS.curvedDrift;
    PARAMS.curvedDriftCurvature = DEFAULTS.curvedDriftCurvature;
    PARAMS.curvedDriftNoiseSpeed = DEFAULTS.curvedDriftNoiseSpeed;
    applyParamsToNetwork(pn, PARAMS);
    if (typeof pane.refresh === 'function') pane.refresh();
  });

  // Runtime → UI sync without feedback loops

  const syncIntervalMs = 100;
  let syncTimerId = null;
  let featureHideTimerId = null;
  let featureRestore = null;
  let particleForceRangeState = null;

  function setParticleForceBindingMaximum(binding, maximum) {
    const valueController = binding && binding.controller && binding.controller.valueController;
    const sliderController = valueController && valueController.sliderC_;
    const props = sliderController && sliderController.props;
    if (!props || typeof props.get !== 'function' || typeof props.set !== 'function') return false;
    if (props.get('max') === maximum) return false;
    props.set('max', maximum);
    return true;
  }

  function updateParticleForceRanges(force = false) {
    const particleCount = Number.isFinite(pn.numParticles) ? pn.numParticles : 0;
    const interactionDistance = Number.isFinite(pn.options.particleInteractionDistance)
      ? pn.options.particleInteractionDistance
      : 0;
    const width = Number.isFinite(pn.i && pn.i.size && pn.i.size.width) ? pn.i.size.width : 0;
    const height = Number.isFinite(pn.i && pn.i.size && pn.i.size.height) ? pn.i.size.height : 0;
    const attractionForce = Number.isFinite(PARAMS.particleAttractionForce) ? PARAMS.particleAttractionForce : 0;
    const repulsionForce = Number.isFinite(PARAMS.particleRepulsionForce) ? PARAMS.particleRepulsionForce : 0;
    const nextState = [particleCount, interactionDistance, width, height, attractionForce, repulsionForce].join(':');
    if (!force && nextState === particleForceRangeState) return;
    particleForceRangeState = nextState;

    const recommendedMaximum = recommendedParticleForceMaximum(pn);
    setParticleForceBindingMaximum(bindParticleAttractionForce, Math.max(recommendedMaximum, attractionForce));
    setParticleForceBindingMaximum(bindParticleRepulsionForce, Math.max(recommendedMaximum, repulsionForce));
  }

  function syncColorBinding(key, color, binding) {
    if (PARAMS[key] === color) return;
    PARAMS[key] = color;
    if (binding) binding.refresh();
  }

  function syncRuntimeToControls() {
    if (!pn) return;
    updateParticleForceRanges();
    if (PARAMS.useDistanceEffect && PARAMS.randomizeDistanceColors && pn.startColorRgb && pn.endColorRgb) {
      syncColorBinding('startColor', rgbArrayToHex(pn.startColorRgb), bindStartColor);
      syncColorBinding('endColor', rgbArrayToHex(pn.endColorRgb), bindEndColor);
    }
    if (PARAMS.lineColorCycling && pn.currentLineColor1Rgb) {
      const color1Hex = rgbArrayToHex(pn.currentLineColor1Rgb);
      const color2Hex = PARAMS.gradientEffect && pn.currentLineColor2Rgb
        ? rgbArrayToHex(pn.currentLineColor2Rgb)
        : color1Hex;
      syncColorBinding('gradientColor1', color1Hex, bindGradient1);
      syncColorBinding('gradientColor2', color2Hex, bindGradient2);
    }
    // Sync particle color control to cycling hue when particle cycling is enabled
    if (PARAMS.particleColorCycling && typeof pn.options.particleHue === 'number') {
      const h = ((pn.options.particleHue % 360) + 360) % 360;
      if (window.ColorUtils && window.ColorUtils.hslToRgb) {
        const rgb = window.ColorUtils.hslToRgb(h, 100, 50);
        const to2 = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
        syncColorBinding('particleColor', `#${to2(rgb.r)}${to2(rgb.g)}${to2(rgb.b)}`, bindParticleColor);
      }
    }
  }

  function scheduleRuntimeSync() {
    if (syncTimerId !== null || container.style.display === 'none') return;
    syncTimerId = setTimeout(() => {
      syncTimerId = null;
      if (container.style.display === 'none') return;
      try {
        syncRuntimeToControls();
      } finally {
        scheduleRuntimeSync();
      }
    }, syncIntervalMs);
  }

  function startRuntimeSync() {
    if (syncTimerId !== null) {
      clearTimeout(syncTimerId);
      syncTimerId = null;
    }
    syncRuntimeToControls();
    scheduleRuntimeSync();
  }

  function stopRuntimeSync() {
    if (syncTimerId === null) return;
    clearTimeout(syncTimerId);
    syncTimerId = null;
  }

  // Randomize visuals (no interaction, no background, no speed, no particle amount)

  function randomizeVisualParams({ preserveParticleSize = false } = {}) {
    // Particles
    if (!preserveParticleSize) PARAMS.particleSize = randInt(1, 6);
    if (!PARAMS.particleColorCycling) {
      PARAMS.particleColor = randHex();
    }
    PARAMS.opacity = Math.round((0.4 + rand01()*0.6) * 100) / 100; // 0.4..1.0
    // Only vary particle cycling speed if particle cycling is enabled
    if (PARAMS.particleColorCycling) {
      PARAMS.particleCyclingSpeed = randInt(0, 100);
    }

    // Lines
    // If distance effect is ON, keep gradientEffect OFF to avoid conflict; otherwise randomize gradientEffect
    if (!PARAMS.useDistanceEffect) {
      PARAMS.gradientEffect = randBool();
    } else {
      PARAMS.gradientEffect = false;
    }
    PARAMS.gradientColor1 = randHex();
    PARAMS.gradientColor2 = randHex();
    // Do not toggle lineColorCycling; only tweak speed
    PARAMS.lineCyclingSpeed = randInt(0, 100);
    
    PARAMS.lineConnectionDistance = randInt(60, 220);
    PARAMS.colorDifferentiationMethod = colorMethods[randInt(0, colorMethods.length-1)];

    // Distance effect (visual only)
    // Keep flags as-is (user choice). Only tweak colors/speeds.
    // Ensure randomizeDistanceColors defaults to true when distance effect is enabled
    if (PARAMS.useDistanceEffect) {
      PARAMS.randomizeDistanceColors = true;
    }
    PARAMS.startColor = randHex();
    PARAMS.endColor = randHex();
    PARAMS.maxColorChangeDistance = randInt(60, 240);
    PARAMS.distanceColorCyclingSpeed = randInt(0, 100);

    // Effects
    // 25% chance to enable trails
    PARAMS.trails = randBool(0.25);
    PARAMS.trailFade = Math.round((0.03 + rand01()*0.18) * 100) / 100; // 0.03..0.21
    PARAMS.lineJitter = randBool();
    PARAMS.lineJitterSegments = randInt(4, 14);
    PARAMS.lineJitterAmplitude = Math.round((0.06 + rand01()*0.18) * 100) / 100; // 0.06..0.24
    PARAMS.curvedDrift = randBool();
    PARAMS.curvedDriftCurvature = Math.round((0.05 + rand01()*0.25) * 100) / 100; // 0.05..0.3
    PARAMS.curvedDriftNoiseSpeed = Math.round((0.5 + rand01()*2.5) * 10) / 10; // 0.5..3.0

    // Respect constraints from distance effect: if distanceEffect ON, keep gradientEffect OFF
    if (PARAMS.useDistanceEffect) {
      PARAMS.gradientEffect = false;
    }
    applyParamsToNetwork(pn, PARAMS);
    if (typeof pane.refresh === 'function') pane.refresh();
  }

  // --- Unified Key Controls via HotkeyManager ---
  function togglePane() {
    const isHidden = container.style.display === 'none';
    const showing = isHidden;
    container.style.display = showing ? 'block' : 'none';
    if (showing) {
      startRuntimeSync();
      // Fade away the features-tiles section once controls are shown
      const features = document.querySelector('.features-tiles.section');
      if (features && !features.dataset.hidden) {
        featureRestore = {
          transition: features.style.transition,
          opacity: features.style.opacity,
          pointerEvents: features.style.pointerEvents,
          display: features.style.display,
          hidden: features.dataset.hidden
        };
        features.style.transition = features.style.transition || 'opacity 400ms ease';
        features.style.opacity = '0';
        features.style.pointerEvents = 'none';
        featureHideTimerId = setTimeout(() => {
          featureHideTimerId = null;
          features.style.display = 'none';
          features.dataset.hidden = '1';
        }, 420);
      }
    } else {
      stopRuntimeSync();
    }
  }

  // Hotkey handler functions
  const hotkeyHandlers = {
    // C - Toggle controls or copy selection
    handleToggleControls: function(context, event) {
      handleContextualControlsHotkey(pn, event, togglePane);
    },

    // P - Toggle Performance Overlay (merged from both handlers)
    handlePerformanceOverlay: function(context) {
      const { particleInstance, params, pane, applyParamsToNetwork } = context;
      
      if (!particleInstance) {
        console.error('Particle instance not available');
        return;
      }

      // Toggle via PARAMS if available (preferred path)
      if (params && applyParamsToNetwork) {
        params.performanceOverlay = !params.performanceOverlay;
        applyParamsToNetwork(particleInstance, params);
        if (pane && typeof pane.refresh === 'function') {
          pane.refresh();
        }
        window.hotkeyManager.showToast(
          `Performance Overlay: ${params.performanceOverlay ? 'Enabled' : 'Disabled'}`,
          { duration: 1500 }
        );
      } else if (particleInstance.performanceMonitor && particleInstance.options) {
        // Fallback: direct monitor access
        const monitor = particleInstance.performanceMonitor;
        monitor.toggleOverlay();
        const overlayEnabled = monitor.options.showOverlay;
        particleInstance.options.performanceOverlay = overlayEnabled;
        window.hotkeyManager.showToast(
          `Performance Overlay: ${overlayEnabled ? 'Enabled' : 'Disabled'}`,
          { duration: 2000 }
        );
      } else {
        console.error('Could not access performanceMonitor.');
      }
    },

    // R - Randomize Visuals
    handleRandomize: function(context) {
      const { randomizeVisualParams } = context;
      if (typeof randomizeVisualParams === 'function') {
        randomizeVisualParams();
      }
    },

    // D - Reset to Default
    handleReset: function(context) {
      const { doReset } = context;
      if (typeof doReset === 'function') {
        doReset();
      }
    },

    // H - Show Help
    handleHelp: function(context) {
      if (window.hotkeyManager && typeof window.hotkeyManager.showHelp === 'function') {
        window.hotkeyManager.showHelp({ position: 'bottom-right', duration: 3000, includeMouse: true });
      } else {
        console.error('HotkeyManager.showHelp not available');
      }
    },

    // M - Cycle Color Method
    handleColorMethod: function(context) {
      currentColorMethodIndex = (currentColorMethodIndex + 1) % colorMethods.length;
      const newMethod = colorMethods[currentColorMethodIndex];
      
      console.log('Color method changed to:', newMethod);
      
      window.hotkeyManager.showToast(`Color Method: ${newMethod}`, { duration: 2000 });
      
      // Update particle instance colors
      if (window.ColorUtils && window.ColorDiffMethod && window.particleInstance) {
        const methodName = newMethod.toUpperCase();
        const method = window.ColorDiffMethod[methodName] || window.ColorDiffMethod.HUE_DISTANCE;
        
        if (window.particleInstance.lineHue1) {
          window.particleInstance.lineHue2 = window.ColorUtils.generateDistinctColor(
            window.particleInstance.lineHue1, 
            method,
            {}
          );
        }
      }
    },

    // B - Benchmark
    handleBenchmark: function(context) {
      if (window.BenchmarkSystem && window.particleInstance) {
        if (!window._benchmarkRunner) {
          window._benchmarkRunner = new window.BenchmarkSystem(window.particleInstance);
        }
        window._benchmarkRunner.start();
      } else {
        console.warn("Benchmark system not loaded or particle instance missing");
      }
    }
  };

  // Register all hotkeys with HotkeyManager
  if (window.hotkeyManager) {
    const context = {
      particleInstance: pn,
      params: PARAMS,
      pane: pane,
      container: container,
      applyParamsToNetwork: applyParamsToNetwork,
      randomizeVisualParams: randomizeVisualParams,
      doReset: doReset,
      togglePane: togglePane
    };
    
    window.hotkeyManager.setContext(context);
    
    window.hotkeyManager.register('c', hotkeyHandlers.handleToggleControls, 'Copy Selection (Ctrl+C) / Toggle Controls', { preventDefault: false });
    window.hotkeyManager.register('v', (context, event) => handlePasteSelectionHotkey(pn, event), 'Paste Selection (Ctrl+V)', { preventDefault: false });
    window.hotkeyManager.register('p', hotkeyHandlers.handlePerformanceOverlay, 'Performance Overlay');
    window.hotkeyManager.register('r', hotkeyHandlers.handleRandomize, 'Randomize Visuals');
    window.hotkeyManager.register('d', hotkeyHandlers.handleReset, 'Reset to Default');
    window.hotkeyManager.register('h', hotkeyHandlers.handleHelp, 'Show Help');
    window.hotkeyManager.register('m', hotkeyHandlers.handleColorMethod, 'Cycle Color Method');
    window.hotkeyManager.register('b', (context, event) => {
      if (event && event.shiftKey) hotkeyHandlers.handleBenchmark(context);
      else pn.beginGravityWellPlacement('black', true);
    }, 'Add Black Hole (Shift+B Benchmark)');
    window.hotkeyManager.register('w', () => pn.beginGravityWellPlacement('white', true), 'Add White Hole');
    window.hotkeyManager.register('l', () => {
      const capped = pn.toggleGravityWellAccelerationCap();
      window.hotkeyManager.showToast(`Gravity acceleration: ${capped ? `Capped at ${pn.gravityWellAccelerationLimit}` : 'Unlimited'}`, { duration: 1500 });
    }, 'Toggle Unlimited Gravity Acceleration');
    window.hotkeyManager.register('delete', () => pn.removeGravityWellUnderPointer(), 'Remove Gravity Well Under Pointer');
    window.hotkeyManager.register('escape', () => pn.cancelGravityWellPlacement(), 'Cancel or Deselect Gravity Well');
    
    console.log('HotkeyManager: All hotkeys registered', Array.from(window.hotkeyManager.handlers.keys()));
  } else {
    console.error('HotkeyManager not available - hotkeys will not work');
  }

  const ui = {
    pane,
    container,
    params: PARAMS,
    gravityWellParams: WELL_PARAMS,
    syncGravityWellControls,
    doReset,
    randomizeVisualParams,
    togglePane,
    hotkeyHandlers,
    destroy() {
      stopRuntimeSync();
      window.removeEventListener('particle-gravity-wells-change', onGravityWellsChange);
      if (window.particleSettingsUi === ui) window.particleSettingsUi = null;
      if (featureHideTimerId !== null) clearTimeout(featureHideTimerId);
      featureHideTimerId = null;
      if (featureRestore) {
        const features = document.querySelector('.features-tiles.section');
        if (features) {
          features.style.transition = featureRestore.transition;
          features.style.opacity = featureRestore.opacity;
          features.style.pointerEvents = featureRestore.pointerEvents;
          features.style.display = featureRestore.display;
          if (typeof featureRestore.hidden === 'undefined') delete features.dataset.hidden;
          else features.dataset.hidden = featureRestore.hidden;
        }
        featureRestore = null;
      }
      if (pane && typeof pane.dispose === 'function') pane.dispose();
      if (container.parentNode) container.parentNode.removeChild(container);
    }
  };
  activeUi = ui;
  window.particleSettingsUi = ui;
  return ui;
}

function ensurePaneBuilt() {
  if (!paneBuildPromise) {
    paneBuildPromise = buildPane().catch(error => {
      paneBuildPromise = null;
      throw error;
    });
  }
  return paneBuildPromise;
}

async function invokePaneAction(action) {
  try {
    const ui = await ensurePaneBuilt();
    if (ui) action(ui);
  } catch (error) {
    console.error('Failed to load settings controls', error);
  }
}

function installVisibilityLifecycle(pn) {
  if (pn._handleVisibilityChange) return;

  pn._resumeOnVisible = false;
  pn._handleVisibilityChange = function () {
    if (document.hidden) {
      pn._resumeOnVisible = pn._shouldAnimate() &&
        (pn._resumeOnVisible || pn._rafActive || pn._rafId != null);
      if (pn._rafId != null) cancelAnimationFrame(pn._rafId);
      pn._rafActive = false;
      pn._rafId = null;
      return;
    }

    const shouldResume = pn._resumeOnVisible && pn._shouldAnimate();
    pn._resumeOnVisible = false;
    if (shouldResume && !pn._rafActive && pn._rafId == null) {
      pn._lastUpdateTime = performance.now();
      pn._rafActive = true;
      pn._rafId = requestAnimationFrame(pn.update);
    }
  };
  document.addEventListener('visibilitychange', pn._handleVisibilityChange);

  if (document.hidden) pn._handleVisibilityChange();
}

function registerBootstrapHotkeys() {
  window.removeEventListener('DOMContentLoaded', registerBootstrapHotkeys);
  const pn = window.particleInstance;
  const manager = window.hotkeyManager;
  if (!pn || !manager) {
    console.error('Particle controls bootstrap unavailable');
    return;
  }

  installVisibilityLifecycle(pn);
  const params = buildParamsFromNetwork(pn);
  manager.setContext({
    particleInstance: pn,
    params,
    pane: null,
    container: null,
    applyParamsToNetwork
  });

  if (mobileControls) mobileControls.destroy();
  mobileControls = mountMobileControls(pn, {
    randomizeVisuals: () => invokePaneAction(ui =>
      ui.randomizeVisualParams({ preserveParticleSize: true }))
  });

  manager.register('c', (context, event) => {
    handleContextualControlsHotkey(pn, event, () => invokePaneAction(ui => ui.togglePane()));
  }, 'Copy Selection (Ctrl+C) / Toggle Controls', { preventDefault: false });
  manager.register('v', (context, event) => handlePasteSelectionHotkey(pn, event), 'Paste Selection (Ctrl+V)', { preventDefault: false });
  manager.register('p', () => {
    const monitor = pn.performanceMonitor;
    if (!monitor || !pn.options) return;
    monitor.toggleOverlay();
    pn.options.performanceOverlay = monitor.options.showOverlay;
    params.performanceOverlay = monitor.options.showOverlay;
    manager.showToast(
      `Performance Overlay: ${monitor.options.showOverlay ? 'Enabled' : 'Disabled'}`,
      { duration: 1500 }
    );
  }, 'Performance Overlay');
  manager.register('r', () => invokePaneAction(ui => ui.randomizeVisualParams()), 'Randomize Visuals');
  manager.register('d', () => invokePaneAction(ui => ui.doReset()), 'Reset to Default');
  manager.register('h', () => manager.showHelp({
    position: 'bottom-right',
    duration: 3000,
    includeMouse: true
  }), 'Show Help');
  manager.register('m', () => invokePaneAction(ui => ui.hotkeyHandlers.handleColorMethod(manager.context)), 'Cycle Color Method');
  manager.register('b', (context, event) => {
    if (!event || !event.shiftKey) {
      pn.beginGravityWellPlacement('black', true);
      return;
    }
    if (!window.BenchmarkSystem) return;
    if (!window._benchmarkRunner) window._benchmarkRunner = new window.BenchmarkSystem(pn);
    window._benchmarkRunner.start();
  }, 'Add Black Hole (Shift+B Benchmark)');
  manager.register('w', () => pn.beginGravityWellPlacement('white', true), 'Add White Hole');
  manager.register('l', () => {
    const capped = pn.toggleGravityWellAccelerationCap();
    manager.showToast(`Gravity acceleration: ${capped ? `Capped at ${pn.gravityWellAccelerationLimit}` : 'Unlimited'}`, { duration: 1500 });
  }, 'Toggle Unlimited Gravity Acceleration');
  manager.register('delete', () => pn.removeGravityWellUnderPointer(), 'Remove Gravity Well Under Pointer');
  manager.register('escape', () => pn.cancelGravityWellPlacement(), 'Cancel or Deselect Gravity Well');

  console.log('HotkeyManager: Bootstrap hotkeys registered', Array.from(manager.handlers.keys()));
}

function destroySettingsOwnership() {
  lifecycleGeneration++;
  if (mobileControls) mobileControls.destroy();
  mobileControls = null;
  if (activeUi) activeUi.destroy();
  activeUi = null;
  window.particleSettingsUi = null;
  paneBuildPromise = null;
  const strayContainer = document.getElementById('tp-container');
  if (strayContainer && strayContainer.parentNode) strayContainer.parentNode.removeChild(strayContainer);
}

window.destroyParticleExperience = function () {
  const pn = window.particleInstance;
  destroySettingsOwnership();
  if (pn && pn._handleVisibilityChange) {
    document.removeEventListener('visibilitychange', pn._handleVisibilityChange);
    pn._handleVisibilityChange = null;
  }
  if (window._benchmarkRunner) {
    if (typeof window._benchmarkRunner.destroy === 'function') window._benchmarkRunner.destroy();
    window._benchmarkRunner = null;
  }
  if (window.hotkeyManager && typeof window.hotkeyManager.destroy === 'function') {
    window.hotkeyManager.destroy();
  }
  if (pn && typeof pn.destroy === 'function') pn.destroy();
  window.particleInstance = null;
};

window.createParticleExperience = function () {
  if (window.particleInstance && !window.particleInstance._destroyed) return window.particleInstance;
  if (!window.hotkeyManager || window.hotkeyManager._destroyed) {
    window.hotkeyManager = new window.HotkeyManager();
  }
  const pn = window.createParticleNetwork();
  if (pn) registerBootstrapHotkeys();
  return pn;
};

window.addEventListener('DOMContentLoaded', registerBootstrapHotkeys);
