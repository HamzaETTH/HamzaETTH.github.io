/**
 * Configuration module for Particle Network
 * Centralizes all configuration options and presets
 */

(function(window) {
  'use strict';

  // Default configuration settings
  const DEFAULT_CONFIG = {
    // Background options
    background: "#000000",

    // Particle options
    particleColor: "#fff",
    particleSize: 2,
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

    // Performance options
    performanceOverlay: false,

    // Physics/boundary
    boundaryMode: 'bounce'
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
    return {
      background: cfg.background || "#000000",
      particleColor: cfg.particleColor || "#fff",
      particleSize: cfg.particleSize != null ? cfg.particleSize : 2,
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
      gatherRadius: (typeof cfg.gatherRadius === 'number') ? cfg.gatherRadius : 100
    };
  }

  // Public API
  const Config = {
    DEFAULT_CONFIG,
    PRESETS,
    createConfig,
    createRuntimeConfig
  };

  // Export as module or global
  if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = Config;
  } else {
    window.ParticleNetworkConfig = Config;
  }
})(window); 
