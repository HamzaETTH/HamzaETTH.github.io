/**
 * Performance Monitoring Module for Particle Network
 * Provides FPS tracking and performance metrics
 */

(function(window) {
  'use strict';

  /**
   * Creates a performance monitoring overlay and tracks FPS
   * @param {HTMLElement} container - The container element to append the monitor to
   * @param {Object} options - Optional configuration settings
   */
  function PerformanceMonitor(container, options = {}) {
    // Options
    const o = options || {};
    this.options = {
      showOverlay: !!o.showOverlay,
      displayInterval: 1000, // ms between text refreshes
      memoryInterval: 1000  // ms between memory reads
    };

    // Ensure a single active monitor updates; others become no-ops
    if (!window.__PN_ACTIVE_MONITOR__) {
      window.__PN_ACTIVE_MONITOR__ = this;
    }
    this._isActive = window.__PN_ACTIVE_MONITOR__ === this;

    // Reuse existing overlay if present; otherwise create one and attach to body
    let overlay = document.querySelector('.performance-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'performance-overlay';
      document.body.appendChild(overlay);
    }
    this.performanceDiv = overlay;

    // Stable text node using <pre> to avoid reflow/jitter
    let pre = this.performanceDiv.querySelector('pre');
    if (!pre) {
      pre = document.createElement('pre');
      pre.textContent = '';
      pre.style.margin = '0';
      this.performanceDiv.appendChild(pre);
    }
    this._textEl = pre;

    // Initial visibility
    if (this.options.showOverlay) {
      this.performanceDiv.classList.add('visible');
    } else {
      this.performanceDiv.classList.remove('visible');
    }

    // Initialize tracking variables
    const now = performance.now();
    this._prevTime = now;
    this._displayAcc = 0;
    this._lastMemUpdate = 0;
    this._smoothedFps = 0;
    this.isRunning = true;

    // Metrics
    this.metrics = {
      currentFps: 0,
      avgFps: 0,
      peakFps: 0,
      lowestFps: Infinity,
      memoryUsage: null,
      particleCount: null
    };
  }

  /**
   * Updates FPS calculation and overlay display
   */
  PerformanceMonitor.prototype.update = function() {
    // Only the first constructed monitor is active; others are no-ops
    if (!this._isActive) return;
    if (!this.isRunning) return;

    const now = performance.now();
    const dt = now - (this._prevTime || now);
    this._prevTime = now;

    if (dt > 0 && dt < 1000) {
      const inst = 1000 / dt;
      this.metrics.currentFps = inst;
      // EMA with ~250ms time constant
      const alpha = 1 - Math.exp(-dt / 250);
      this._smoothedFps = this._smoothedFps ? (this._smoothedFps + alpha * (inst - this._smoothedFps)) : inst;
      this.metrics.avgFps = this._smoothedFps;
      this.metrics.peakFps = Math.max(this.metrics.peakFps, this._smoothedFps);
      this.metrics.lowestFps = Math.min(this.metrics.lowestFps, this._smoothedFps);
    }

    // Memory sampling
    if (now - this._lastMemUpdate >= this.options.memoryInterval) {
      this._lastMemUpdate = now;
      if (window.performance && window.performance.memory) {
        this.metrics.memoryUsage = window.performance.memory.usedJSHeapSize / (1024 * 1024);
      }
    }

    // Throttle text updates to avoid thrash
    this._displayAcc += dt;
    if (!this.options.showOverlay || this._displayAcc < this.options.displayInterval) return;
    this._displayAcc = 0;

    if (this.performanceDiv && this._textEl) {
      const fps = this._smoothedFps || this.metrics.currentFps || 0;
      const lines = [];
      lines.push(`FPS: ${fps.toFixed(1)}`);
      if (this.metrics.memoryUsage != null) lines.push(`Mem: ${this.metrics.memoryUsage.toFixed(1)} MB`);
      if (this.metrics.particleCount != null) lines.push(`Particles: ${this.metrics.particleCount}`);
      this._textEl.textContent = lines.join('\n');
    }
  };

  /**
   * Sets the particle count to show in the overlay. Cheap, only stored and printed on next overlay update.
   * @param {number} count
   */
  PerformanceMonitor.prototype.setParticleCount = function(count) {
    this.metrics.particleCount = count;
  };

  /**
   * Starts performance monitoring
   */
  PerformanceMonitor.prototype.start = function() {
    this.isRunning = true;
    this._prevTime = performance.now();
  };

  /**
   * Stops performance monitoring
   */
  PerformanceMonitor.prototype.stop = function() {
    this.isRunning = false;
  };

  /**
   * Marks the start of a frame for manual frame timing
   */
  PerformanceMonitor.prototype.startFrame = function() {
    this.frameStartTime = performance.now();
  };

  /**
   * Marks the end of a frame for manual frame timing
   * @returns {number} - The duration of the frame in milliseconds
   */
  PerformanceMonitor.prototype.endFrame = function() {
    const endTime = performance.now();
    const frameDuration = endTime - this.frameStartTime;
    return frameDuration;
  };

  /**
   * Gets the current performance metrics
   * @returns {Object} - Object containing performance metrics
   */
  PerformanceMonitor.prototype.getMetrics = function() {
    return {...this.metrics};
  };

  /**
   * Toggles the visibility of the performance overlay
   * @param {boolean} visible - Whether the overlay should be visible
   */
  PerformanceMonitor.prototype.toggleOverlay = function(visible) {
    if (!this.performanceDiv) return;
    const target = typeof visible === 'boolean' ? !!visible : !this.options.showOverlay;
    this.options.showOverlay = target;
    if (target) {
      this.performanceDiv.classList.add('visible');
    } else {
      this.performanceDiv.classList.remove('visible');
    }
  };

  // Export as module or global
  if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = PerformanceMonitor;
  } else {
    window.ParticleNetworkPerformanceMonitor = PerformanceMonitor;
  }
})(window); 