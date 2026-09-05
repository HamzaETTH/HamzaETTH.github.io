/**
 * Configuration module for Particle Network
 * Centralizes all configuration options and presets
 */

(function(window) {
  'use strict';

  const GRAVITY_WELL_MOTION_STORAGE_KEY = 'pn_gravity_well_motion';
  const GRAVITY_WELL_MOTION_MODES = ['system', 'animate', 'static'];

  function normalizeGravityWellMotion(value, fallback = 'system') {
    return GRAVITY_WELL_MOTION_MODES.includes(value) ? value : fallback;
  }

  function loadGravityWellMotion(fallback = 'system') {
    try {
      return normalizeGravityWellMotion(window.localStorage.getItem(GRAVITY_WELL_MOTION_STORAGE_KEY), fallback);
    } catch (_) {
      return fallback;
    }
  }

  function saveGravityWellMotion(value) {
    const normalized = normalizeGravityWellMotion(value);
    try { window.localStorage.setItem(GRAVITY_WELL_MOTION_STORAGE_KEY, normalized); } catch (_) {}
    return normalized;
  }

  // Default configuration settings
  const DEFAULT_CONFIG = {
    // Background options
    background: "#000000",

    // Particle options
    particleColor: "#fff",
    particleSize: 1,
    particleColorCycling: false,
    // Particle hue cycling speed (0..100 UI range; mapped internally to time-based degrees/frame)
    particleCyclingSpeed: 10,
    particleRepulsion: false,
    particleAttraction: false,
    particleAttractionForce: 5,
    // Enable simple elastic collisions between particles
    particleCollision: false,


    // Line options
    gradientEffect: true,
    gradientColor1: "#00bfff",
    gradientColor2: "#ff4500",
    lineColorCycling: true, 
    // Line hue cycling speed (0..100 UI range; mapped internally to time-based degrees/frame)
    lineCyclingSpeed: 50,
    
    // Color differentiation options
    colorDifferentiationMethod: (() => {
      const methods = ['hueDistance', 'complementary', 'triadic', 'analogous', 'labPerceptual', 'wcagContrast'];
      return methods[Math.floor(Math.random() * methods.length)];
    })(),
    colorDifferentiationOptions: {},

    // Interaction options
    interactive: true,
    proximityEffectColor: "#ff0000",
    proximityEffectDistance: 100,
    attractionRange: 1,
    attractionIntensity: 1,
    repulsionRange: 5,
    repulsionIntensity: 5,

    // Color effect options
    opacity: 0.7,
    useDistanceEffect: false,
    maxColorChangeDistance: 120,
    startColor: "#0BDA51",
    endColor: "#BF00FF",

    randomizeDistanceColors: false,
    // Match UI semantics with lineCyclingSpeed (0..100)
    distanceColorCyclingSpeed: 50,

    // Explosion options
    particleInteractionDistance: 50,
    particleRepulsionForce: 5,

    // Connection options
    lineConnectionDistance: 120,
    adaptiveLineDetail: false,
    cellularLineClusters: false,
    blackHoleLineColor: false,

    // Performance options
    performanceOverlay: false,

    // Physics/boundary
    boundaryMode: 'bounce',

    // Gravity-well defaults
    gravityWellsEnabled: true,
    gravityWellMotion: 'animate',
    gravityWellRadius: 150,
    gravityWellStrength: 12,
    gravityWellMinRadius: 24,
    gravityWellMaxRadius: 500,
    gravityWellAccelerationCapped: true,
    gravityWellAccelerationLimit: 1.5,
    gravityWellForceMultiplier: 1,
    gravityWellSpin: 0.2,
    cursorCaptureForceMultiplier: 1,
    cursorCaptureMaxSpeed: 2.64,
    blackHoleInnerColor: '#ff8080',
    blackHoleOuterColor: '#3633ff',
    whiteHoleInnerColor: '#dffcff',
    whiteHoleOuterColor: '#6b5cff'
  };

  // Preset configurations for different visual styles
  const PRESETS = {
    // Dense network with slow particles
    dense: {
      speed: "0.5",
      density: "8000",
      particleSize: 1.5,
      lineConnectionDistance: 100
    },
    
    // Sparse network with fast particles
    sparse: {
      speed: "2",
      density: "3000",
      particleSize: 2.5,
      lineConnectionDistance: 150
    },
    
    // High contrast for accessibility
    highContrast: {
      particleColor: "#ffffff",
      background: "#000000",
      colorDifferentiationMethod: 'wcagContrast',
      opacity: 1.0
    },
    
    // Colorful mode
    colorful: {
      particleColorCycling: true,
      lineColorCycling: true,
      lineCyclingSpeed: 2,
      particleCyclingSpeed: 10
    },
    
    // Performance mode - optimized for lower-end devices
    performance: {
      speed: "1",
      density: "2000",
      particleSize: 2,
      lineConnectionDistance: 100,
      performanceOverlay: true,
      boundaryMode: 'bounce'
    }
  };

  /**
   * Creates a configuration object by merging default config with user options
   * @param {Object} userOptions - User provided configuration options
   * @param {String} preset - Optional preset to apply before user options
   * @returns {Object} - The merged configuration object
   */
  function createConfig(userOptions = {}, preset = null) {
    let config = {...DEFAULT_CONFIG};
    
    // Apply preset if specified
    if (preset && PRESETS[preset]) {
      config = {...config, ...PRESETS[preset]};
    }
    
    // Apply user options (overrides defaults and presets)
    config = {...config, ...userOptions};
    
    return config;
  }

  function createRuntimeConfig(userOptions = {}, setVelocity, normalizeDensity) {
    const cfg = createConfig(userOptions);
    const hasExplicitAdaptiveLineDetail = typeof userOptions.adaptiveLineDetail === 'boolean';
    let adaptiveLineDetail = hasExplicitAdaptiveLineDetail
      ? userOptions.adaptiveLineDetail
      : cfg.adaptiveLineDetail === true;
    if (!hasExplicitAdaptiveLineDetail && typeof window.matchMedia === 'function') {
      try {
        adaptiveLineDetail = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
      } catch (_) {}
    }
    return {
      background: cfg.background || "#000000",
      particleColor: cfg.particleColor || "#fff",
      particleSize: cfg.particleSize != null ? cfg.particleSize : 1,
      particleColorCycling: !!cfg.particleColorCycling,
      particleCyclingSpeed: cfg.particleCyclingSpeed != null ? cfg.particleCyclingSpeed : 10,
      gradientEffect: cfg.gradientEffect != null ? cfg.gradientEffect : true,
      gradientColor1: cfg.gradientColor1 || "#00bfff",
      gradientColor2: cfg.gradientColor2 || "#ff4500",
      lineColorCycling: cfg.lineColorCycling != null ? cfg.lineColorCycling : true,
      lineCyclingSpeed: cfg.lineCyclingSpeed != null ? cfg.lineCyclingSpeed : 50,
      colorDifferentiationMethod: cfg.colorDifferentiationMethod || (() => {
        const methods = ['hueDistance', 'complementary', 'triadic', 'analogous', 'labPerceptual', 'wcagContrast'];
        return methods[Math.floor(Math.random() * methods.length)];
      })(),
      colorDifferentiationOptions: cfg.colorDifferentiationOptions || {},
      interactive: cfg.interactive != null ? cfg.interactive : true,
      proximityEffectColor: cfg.proximityEffectColor || "#ff0000",
      proximityEffectDistance: cfg.proximityEffectDistance != null ? cfg.proximityEffectDistance : 100,
      attractionRange: cfg.attractionRange != null ? cfg.attractionRange : 1,
      attractionIntensity: cfg.attractionIntensity != null ? cfg.attractionIntensity : 1,
      repulsionRange: cfg.repulsionRange != null ? cfg.repulsionRange : 1,
      repulsionIntensity: cfg.repulsionIntensity != null ? cfg.repulsionIntensity : 1,
      velocity: setVelocity(cfg.speed != null ? cfg.speed : userOptions.speed),
      density: normalizeDensity(cfg.density != null ? cfg.density : userOptions.density),
      opacity: cfg.opacity != null ? cfg.opacity : 0.7,
      useDistanceEffect: cfg.useDistanceEffect != null ? cfg.useDistanceEffect : false,
      maxColorChangeDistance: cfg.maxColorChangeDistance != null ? cfg.maxColorChangeDistance : 120,
      startColor: cfg.startColor || "#0BDA51",
      endColor: cfg.endColor || "#BF00FF",
      particleInteractionDistance: cfg.particleInteractionDistance != null ? cfg.particleInteractionDistance : 50,
      particleRepulsion: cfg.particleRepulsion != null ? cfg.particleRepulsion : false,
      particleAttraction: cfg.particleAttraction != null ? cfg.particleAttraction : false,
      particleCollision: cfg.particleCollision != null ? cfg.particleCollision : false,
      particleRepulsionForce: cfg.particleRepulsionForce != null ? cfg.particleRepulsionForce : 5,
      particleAttractionForce: cfg.particleAttractionForce != null ? cfg.particleAttractionForce : 5,
      lineConnectionDistance: cfg.lineConnectionDistance != null ? cfg.lineConnectionDistance : 120,
      adaptiveLineDetail,
      cellularLineClusters: cfg.cellularLineClusters === true,
      blackHoleLineColor: cfg.blackHoleLineColor === true,
      performanceOverlay: cfg.performanceOverlay != null ? cfg.performanceOverlay : false,
      randomizeDistanceColors: cfg.randomizeDistanceColors != null ? cfg.randomizeDistanceColors : false,
      distanceColorCyclingSpeed: cfg.distanceColorCyclingSpeed != null
        ? cfg.distanceColorCyclingSpeed
        : (cfg.lineCyclingSpeed != null ? cfg.lineCyclingSpeed : 50),
      boundaryMode: cfg.boundaryMode || 'bounce',
      trails: cfg.trails != null ? cfg.trails : false,
      trailFade: (typeof cfg.trailFade === 'number') ? cfg.trailFade : 0.08,
      lineJitter: cfg.lineJitter != null ? cfg.lineJitter : false,
      lineJitterSegments: (typeof cfg.lineJitterSegments === 'number') ? Math.max(2, Math.floor(cfg.lineJitterSegments)) : 6,
      lineJitterAmplitude: (typeof cfg.lineJitterAmplitude === 'number') ? cfg.lineJitterAmplitude : 0.12,
      curvedDrift: cfg.curvedDrift != null ? cfg.curvedDrift : false,
      curvedDriftCurvature: (typeof cfg.curvedDriftCurvature === 'number') ? cfg.curvedDriftCurvature : 0.12,
      curvedDriftNoiseSpeed: (typeof cfg.curvedDriftNoiseSpeed === 'number') ? cfg.curvedDriftNoiseSpeed : 1.5,
      gatherRadius: (typeof cfg.gatherRadius === 'number') ? cfg.gatherRadius : 100,
      gravityWellsEnabled: cfg.gravityWellsEnabled !== false,
      gravityWellMotion: Object.prototype.hasOwnProperty.call(userOptions, 'gravityWellMotion')
        ? normalizeGravityWellMotion(cfg.gravityWellMotion)
        : loadGravityWellMotion(cfg.gravityWellMotion),
      gravityWellRadius: (typeof cfg.gravityWellRadius === 'number') ? cfg.gravityWellRadius : 150,
      gravityWellStrength: (typeof cfg.gravityWellStrength === 'number') ? cfg.gravityWellStrength : 12,
      gravityWellMinRadius: (typeof cfg.gravityWellMinRadius === 'number') ? cfg.gravityWellMinRadius : 24,
      gravityWellMaxRadius: (typeof cfg.gravityWellMaxRadius === 'number') ? cfg.gravityWellMaxRadius : 500,
      gravityWellAccelerationCapped: cfg.gravityWellAccelerationCapped !== false,
      gravityWellAccelerationLimit: Number.isFinite(cfg.gravityWellAccelerationLimit) ? Math.max(0, cfg.gravityWellAccelerationLimit) : 1.5,
      gravityWellForceMultiplier: Number.isFinite(cfg.gravityWellForceMultiplier) ? Math.max(0, cfg.gravityWellForceMultiplier) : 1,
      gravityWellSpin: Number.isFinite(cfg.gravityWellSpin) ? cfg.gravityWellSpin : 0.2,
      cursorCaptureForceMultiplier: Number.isFinite(cfg.cursorCaptureForceMultiplier) ? Math.max(0, cfg.cursorCaptureForceMultiplier) : 1,
      cursorCaptureMaxSpeed: Number.isFinite(cfg.cursorCaptureMaxSpeed) ? Math.max(0, cfg.cursorCaptureMaxSpeed) : 2.64,
      blackHoleInnerColor: cfg.blackHoleInnerColor || '#ff8080',
      blackHoleOuterColor: cfg.blackHoleOuterColor || '#3633ff',
      whiteHoleInnerColor: cfg.whiteHoleInnerColor || '#dffcff',
      whiteHoleOuterColor: cfg.whiteHoleOuterColor || '#6b5cff'
    };
  }

  // Public API
  const Config = {
    DEFAULT_CONFIG,
    PRESETS,
    createConfig,
    createRuntimeConfig,
    normalizeGravityWellMotion,
    loadGravityWellMotion,
    saveGravityWellMotion
  };

  // Export as module or global
  if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = Config;
  } else {
    window.ParticleNetworkConfig = Config;
  }
})(window); 
