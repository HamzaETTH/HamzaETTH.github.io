/**
 * Parameter application logic - split into focused functions for easier debugging
 */

import { toCssColor } from './utils.js';

function applyScalarParams(o, p) {
  const keys = [
    'particleColor','particleColorCycling','particleCyclingSpeed','particleRepulsion','particleCollision','particleAttraction','particleAttractionForce',
    'gradientEffect','gradientColor1','gradientColor2','lineColorCycling','lineCyclingSpeed',
    'interactive','proximityEffectColor','proximityEffectDistance','attractionIntensity','repulsionIntensity',
    'opacity','useDistanceEffect','randomizeDistanceColors','maxColorChangeDistance','startColor','endColor','lineConnectionDistance','distanceColorCyclingSpeed',
    'particleInteractionDistance','particleRepulsionForce','performanceOverlay','boundaryMode','colorDifferentiationMethod',
    'trails','trailFade',
    'lineJitter','lineJitterSegments','lineJitterAmplitude',
    'curvedDrift','curvedDriftNoiseSpeed',
    'gatherRadius'
  ];
  keys.forEach(k => { o[k] = p[k]; });

  // Map UI px radius (0..300) to internal engine units (0..30) by /10
  if (typeof p.attractionRange === 'number') {
    o.attractionRange = Math.max(0, Math.min(300, p.attractionRange)) / 10;
  }
  if (typeof p.repulsionRange === 'number') {
    o.repulsionRange = Math.max(0, Math.min(300, p.repulsionRange)) / 10;
  }

  // Map UI curvedDriftCurvature 1..100 to internal 0..0.2
  if (typeof p.curvedDriftCurvature === 'number') {
    o.curvedDriftCurvature = Math.max(1, Math.min(100, Math.round(p.curvedDriftCurvature))) / 500;
  }
}

function applyColorParams(o, p) {
  o.particleColor = toCssColor(o.particleColor);
  o.gradientColor1 = toCssColor(o.gradientColor1);
  o.gradientColor2 = toCssColor(o.gradientColor2);
  o.proximityEffectColor = toCssColor(o.proximityEffectColor);
  o.startColor = toCssColor(o.startColor);
  o.endColor = toCssColor(o.endColor);
}

function applyBackground(pn, o, p) {
  if (!pn || !pn.k) return;
  
  o.background = toCssColor(p.background);
  const isHex = typeof o.background === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(o.background);
  const isRgba = typeof o.background === 'string' && /^rgba?\(/i.test(o.background);
  const isColor = isHex || isRgba;
  
  if (isColor) {
    pn.k.style.background = o.background;
    pn.k.style.backgroundImage = '';
    if (document.body) {
      document.body.style.background = o.background;
      document.body.style.backgroundImage = '';
    }
  } else if (typeof o.background === 'string' && o.background.length > 0) {
    const url = o.background;
    pn.k.style.background = '';
    pn.k.style.backgroundImage = 'url("' + url + '")';
    pn.k.style.backgroundRepeat = 'no-repeat';
    pn.k.style.backgroundPosition = 'center';
    pn.k.style.backgroundSize = 'cover';

    if (document.body) {
      document.body.style.background = '';
      document.body.style.backgroundImage = 'url("' + url + '")';
      document.body.style.backgroundRepeat = 'no-repeat';
      document.body.style.backgroundPosition = 'center';
      document.body.style.backgroundSize = 'cover';
    }
  }
}

function applyVelocityAndDensity(pn, o, p) {
  if (!pn) return;
  
  // Speed/Velocity: support both PARAMS.speed and direct PARAMS.velocity
  if (typeof p.velocity === 'number') {
    o.velocity = p.velocity;
  } else {
    o.velocity = typeof p.speed === 'number' ? p.speed : (typeof pn.setVelocity === 'function' ? pn.setVelocity(p.speed) : 0.66);
  }
  
  // If the loop was stopped (velocity 0) and we now have non-zero velocity, restart it
  const shouldAnimate = typeof pn._shouldAnimate === 'function' ? pn._shouldAnimate() : o.velocity !== 0;
  if ((!pn._rafActive || pn._rafId == null) && shouldAnimate && typeof pn.update === 'function') {
    if (document.hidden) {
      pn._resumeOnVisible = true;
    } else {
      pn.update();
    }
  }

  // Density: rebuild particle arrays based on new density
  if (typeof p.density === 'number' && p.density > 0) {
    o.density = p.density;
    if (typeof pn._rebuildOnResize === 'function') {
      pn._rebuildOnResize();
    }
  }

  // Line grid impact
  if (typeof pn.initGrid === 'function') {
    pn.initGrid();
  }
}

function applyGravityWells(pn, o, p) {
  if (typeof p.gravityWellMotion === 'string' && window.ParticleNetworkConfig) {
    const motion = window.ParticleNetworkConfig.normalizeGravityWellMotion(p.gravityWellMotion);
    o.gravityWellMotion = motion;
    window.ParticleNetworkConfig.saveGravityWellMotion(motion);
  }
  if (typeof p.gravityWellsEnabled !== 'boolean' || o.gravityWellsEnabled === p.gravityWellsEnabled) return;
  if (typeof pn.setGravityWellsEnabled === 'function') pn.setGravityWellsEnabled(p.gravityWellsEnabled);
  else o.gravityWellsEnabled = p.gravityWellsEnabled;
}

function applyParticleAppearance(pn, o, p) {
  if (!pn || !p || typeof p.particleSize === 'undefined') return;
  
  o.particleSize = p.particleSize;
  
  if (Array.isArray(pn.o)) {
    for (let i = 0; i < pn.o.length; i++) {
      const part = pn.o[i];
      if (part) {
        part.size = p.particleSize;
        if (p.particleColor) {
          part.particleColor = p.particleColor;
        }
      }
    }
    // sync SoA size array if present
    if (pn.sizeA && Array.isArray(pn.sizeA)) {
      for (let i = 0; i < pn.sizeA.length; i++) {
        pn.sizeA[i] = p.particleSize;
      }
    }
  }
}

function applyColorMethod(pn, o, p) {
  if (!pn || !p) return;
  
  // Update lineHue2 if method changed
  if (window.ColorUtils && window.ColorDiffMethod && typeof window.ColorUtils.generateDistinctColor === 'function') {
    const method = window.ColorDiffMethod[(p.colorDifferentiationMethod || 'hueDistance').toUpperCase()] || window.ColorDiffMethod.HUE_DISTANCE;
    if (typeof pn.lineHue1 === 'number') {
      pn.lineHue2 = window.ColorUtils.generateDistinctColor(pn.lineHue1 || 0, method, o.colorDifferentiationOptions || {});
    }
  }
}

function applyPerformanceOverlay(pn, p) {
  if (!pn || !p) return;
  
  if (pn.performanceMonitor && typeof pn.performanceMonitor.toggleOverlay === 'function') {
    pn.performanceMonitor.toggleOverlay(!!p.performanceOverlay);
  }
}

export function applyParamsToNetwork(pn, p) {
  if (!pn || !pn.options || !p) return;
  
  const o = pn.options;

  try {
    applyScalarParams(o, p);
    applyGravityWells(pn, o, p);
    applyColorParams(o, p);
    applyBackground(pn, o, p);
    applyVelocityAndDensity(pn, o, p);
    applyParticleAppearance(pn, o, p);
    applyColorMethod(pn, o, p);
    applyPerformanceOverlay(pn, p);
  } catch (error) {
    console.error('Error applying parameters:', error);
  }
}

