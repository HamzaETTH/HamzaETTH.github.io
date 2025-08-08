/**
 * ParticleRenderer.js
 * 
 * Handles all rendering aspects of the Particle Network system
 * Including drawing particles, connections, and visual effects
 */

(function(window) {
  'use strict';
  
  /**
   * Creates a renderer for particle network visualization
   * @param {HTMLElement} container - Container element to add the canvas to
   * @param {Object} options - Rendering options
   */
  function ParticleRenderer(container, options = {}) {
    // Default options with overrides
    this.options = {
      // Canvas options
      zIndex: 20,
      
      // Visual options
      particleColor: "#fff",
      particleSize: 2,
      opacity: 0.7,
      
      // Line options
      lineWidth: 1,
      gradientEffect: true,
      gradientColor1: "#00bfff",
      gradientColor2: "#ff4500",
      
      // Color cycling
      lineColorCycling: true,
      
      // Proximity effect
      proximityEffectColor: "#ff0000",
      
      // Override with provided options
      ...options
    };
    
    // Initialize canvas
    this.setupCanvas(container);
    
    // Cache for gradients to improve performance
    this.cachedGradients = {};
    // Cache for particle sprites (per color+size+DPR)
    this.particleSpriteCache = new Map();
    
    // Color state
    this.currentLineColor1 = this.options.gradientColor1;
    this.currentLineColor2 = this.options.gradientColor2;
  }
  
  /**
   * Sets up the canvas element
   * @param {HTMLElement} container - Container to append canvas to
   */
  ParticleRenderer.prototype.setupCanvas = function(container) {
    // Create canvas
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.dpr = window.devicePixelRatio || 1;
    
    // Apply styles for perfect overlay with GL canvas
    this.canvas.style.position = "absolute";
    this.canvas.style.top = "0";
    this.canvas.style.left = "0";
    this.canvas.style.zIndex = this.options.zIndex;
    
    // Set initial size (CSS size and DPR-scaled backing store)
    var w = container.offsetWidth;
    var h = container.offsetHeight;
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.canvas.width = Math.max(1, Math.floor(w * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(h * this.dpr));
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    
    // Add to container
    container.appendChild(this.canvas);
    
    // Store size for reference in CSS units
    this.width = w;
    this.height = h;
  };
  
  /**
   * Clears the canvas for the next frame
   */
  ParticleRenderer.prototype.clear = function() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.globalAlpha = 1;
  };
  
  /**
   * Resizes the canvas when the container size changes
   * @param {number} width - New width
   * @param {number} height - New height
   */
  ParticleRenderer.prototype.resize = function(width, height) {
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.style.width = width + "px";
    this.canvas.style.height = height + "px";
    this.canvas.width = Math.max(1, Math.floor(width * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(height * this.dpr));
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.width = width;
    this.height = height;
  };
  
  /**
   * Draws a single particle
   * @param {Object} particle - Particle to draw
   */
  ParticleRenderer.prototype.drawParticle = function(particle) {
    const ctx = this.ctx;
    const size = particle.size || this.options.particleSize;
    const color = particle.particleColor || this.options.particleColor;
    const key = `${color}|${size}|${this.dpr}`;

    let sprite = this.particleSpriteCache.get(key);
    if (!sprite) {
      const d = Math.max(2, Math.ceil(size * 2 * this.dpr));
      const off = document.createElement('canvas');
      off.width = d; off.height = d;
      const octx = off.getContext('2d');
      octx.fillStyle = color;
      octx.globalAlpha = this.options.opacity;
      octx.beginPath();
      octx.arc(d/2, d/2, (size * this.dpr), 0, Math.PI * 2);
      octx.fill();
      sprite = off;
      this.particleSpriteCache.set(key, sprite);
    }
    // drawImage uses CSS pixels due to transform set to DPR
    ctx.drawImage(sprite, particle.x - size, particle.y - size, size * 2, size * 2);
  };
  
  /**
   * Updates the cycling colors based on time
   * @param {number} timestamp - Current timestamp for animation
   */
  ParticleRenderer.prototype.updateCyclingColors = function(timestamp, cyclingSpeed) {
    if (!this.options.lineColorCycling) return;
    
    const hue1 = ((timestamp * (cyclingSpeed || 0.1)) / 1000) % 360;
    const hue2 = (window.ColorUtils && window.ColorDiffMethod) ? 
      window.ColorUtils.generateDistinctColor(hue1, window.ColorDiffMethod.HUE_DISTANCE, {}) :
      (hue1 + 180) % 360; // Default to complementary if ColorUtils not available
    
    this.currentLineColor1 = `hsl(${hue1}, 100%, 50%)`;
    this.currentLineColor2 = `hsl(${hue2}, 100%, 50%)`;
    
    // Clear cached gradients when colors change
    this.cachedGradients = {};
  };
  
  /**
   * Draws a connection line between two particles
   * @param {Object} particleA - First particle
   * @param {Object} particleB - Second particle
   * @param {Object} options - Drawing options
   */
  ParticleRenderer.prototype.drawConnection = function(particleA, particleB, options = {}) {
    const ctx = this.ctx;
    const opts = { ...this.options, ...options };
    
    // Start drawing
    ctx.beginPath();
    ctx.moveTo(particleA.x, particleA.y);
    ctx.lineTo(particleB.x, particleB.y);
    
    // Determine line style using distance-based effects or gradients
    let gradient;
    
    if (opts.useDistanceEffect) {
      // Distance-based color
      const dx = particleA.x - particleB.x;
      const dy = particleA.y - particleB.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      const colorFactor = Math.min(distance / opts.maxColorChangeDistance, 1);
      const interpolatedColor = this.interpolateColor(
        this.hexToRgbArray(opts.startColor), 
        this.hexToRgbArray(opts.endColor), 
        colorFactor
      );
      const colorString = this.rgbArrayToString(interpolatedColor);
      
      gradient = ctx.createLinearGradient(particleA.x, particleA.y, particleB.x, particleB.y);
      gradient.addColorStop(0, colorString);
      gradient.addColorStop(1, colorString);
    } 
    else if (opts.lineColorCycling && opts.gradientEffect) {
      // Dynamic gradient with cycling colors
      gradient = ctx.createLinearGradient(particleA.x, particleA.y, particleB.x, particleB.y);
      gradient.addColorStop(0, this.currentLineColor1);
      gradient.addColorStop(1, this.currentLineColor2);
    } 
    else if (opts.lineColorCycling) {
      // Solid cycling color
      if (!this.cachedGradients.cycling) {
        gradient = ctx.createLinearGradient(0, 0, 0, 0);
        gradient.addColorStop(0, this.currentLineColor1);
        gradient.addColorStop(1, this.currentLineColor1);
        this.cachedGradients.cycling = gradient;
      } else {
        gradient = this.cachedGradients.cycling;
      }
    } 
    else if (opts.gradientEffect) {
      // Static gradient
      gradient = ctx.createLinearGradient(particleA.x, particleA.y, particleB.x, particleB.y);
      gradient.addColorStop(0, opts.gradientColor1);
      gradient.addColorStop(1, opts.gradientColor2);
    } 
    else {
      // Static solid color
      if (!this.cachedGradients.solid) {
        gradient = ctx.createLinearGradient(0, 0, 0, 0);
        gradient.addColorStop(0, opts.gradientColor1);
        gradient.addColorStop(1, opts.gradientColor1);
        this.cachedGradients.solid = gradient;
      } else {
        gradient = this.cachedGradients.solid;
      }
    }
    
    // Apply the determined style
    ctx.strokeStyle = gradient;
    ctx.lineWidth = opts.lineWidth || 1;
    ctx.stroke();
  };
  
  /**
   * Render the entire system
   * @param {Array} particles - Array of particles to render
   * @param {Array} connections - Array of particle pairs to connect
   * @param {number} timestamp - Current timestamp for animations
   */
  ParticleRenderer.prototype.render = function(particles, connections, timestamp) {
    // Clear canvas
    this.clear();
    
    // Update cycling colors if enabled
    if (this.options.lineColorCycling) {
      this.updateCyclingColors(timestamp, this.options.lineCyclingSpeed);
    }
    
    // Draw connections first (under particles)
    if (connections && connections.length) {
      for (let i = 0; i < connections.length; i++) {
        this.drawConnection(
          connections[i][0], 
          connections[i][1]
        );
      }
    }
    
    // Draw all particles
    for (let i = 0; i < particles.length; i++) {
      this.drawParticle(particles[i]);
    }
  };
  
  /**
   * Convert hex color to RGB array
   * @param {string} hex - Hex color code
   * @returns {Array} - RGB values as array [r,g,b]
   */
  ParticleRenderer.prototype.hexToRgbArray = function(hex) {
    if (window.ColorUtils && window.ColorUtils.hexToRgb) {
      const rgb = window.ColorUtils.hexToRgb(hex);
      return [rgb.r, rgb.g, rgb.b];
    }
    const bigint = parseInt(hex.slice(1), 16);
    return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
  };
  
  /**
   * Interpolate between two colors
   * @param {Array} startColor - RGB start color as array
   * @param {Array} endColor - RGB end color as array
   * @param {number} factor - Interpolation factor (0-1)
   * @returns {Array} - Interpolated RGB color as array
   */
  ParticleRenderer.prototype.interpolateColor = function(startColor, endColor, factor) {
    const result = [];
    for (let i = 0; i < 3; i++) {
      result[i] = Math.round(startColor[i] + factor * (endColor[i] - startColor[i]));
    }
    return result;
  };
  
  /**
   * Convert RGB array to CSS color string
   * @param {Array} rgb - RGB values as array
   * @returns {string} - CSS RGB color string
   */
  ParticleRenderer.prototype.rgbArrayToString = function(rgb) {
    return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  };
  
  // Export as module or global
  if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = ParticleRenderer;
  } else {
    window.ParticleNetworkRenderer = ParticleRenderer;
  }
})(window); 