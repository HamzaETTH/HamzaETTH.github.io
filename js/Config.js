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
    particleCyclingSpeed: 0.01,
    randomParticleColor: false,
    randomIndividualParticleColor: false,

    // Line options
    gradientEffect: true,
    gradientColor1: "#00bfff",
    gradientColor2: "#ff4500",
    lineColorCycling: true, 
    lineCyclingSpeed: 1,
    
    // Color differentiation options
    colorDifferentiationMethod: 'hueDistance',
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
      randomIndividualParticleColor: true,
      particleColorCycling: true,
      lineColorCycling: true,
      lineCyclingSpeed: 2,
      particleCyclingSpeed: 0.02
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

  // Public API
  const Config = {
    DEFAULT_CONFIG,
    PRESETS,
    createConfig
  };

  // Export as module or global
  if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = Config;
  } else {
    window.ParticleNetworkConfig = Config;
  }
})(window); 