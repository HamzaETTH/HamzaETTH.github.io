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
    // Default options
    this.options = {
      showOverlay: true,
      historyLength: 10,
      updateInterval: 1000, // ms
      ...options
    };

    // Check for existing monitors and remove them (prevents duplicates)
    const existingMonitors = container.querySelectorAll('.performance-overlay');
    existingMonitors.forEach(monitor => {
      monitor.remove();
    });
    
    // Create overlay element if enabled
    this.performanceDiv = document.createElement("div");
    this.performanceDiv.className = "performance-overlay";
    this.performanceDiv.style.position = "absolute";
    this.performanceDiv.style.top = "10px";
    this.performanceDiv.style.left = "10px";
    this.performanceDiv.style.color = "white";
    this.performanceDiv.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
    this.performanceDiv.style.padding = "5px";
    this.performanceDiv.style.fontFamily = "monospace";
    this.performanceDiv.style.zIndex = "1000";
    
    // Set initial visibility based on options
    if (!this.options.showOverlay) {
      this.performanceDiv.style.display = 'none';
    }
    
    container.appendChild(this.performanceDiv);

    // Initialize tracking variables
    this.lastFrameTime = performance.now();
    this.frameCount = 0;
    this.fpsHistory = [];
    this.memoryHistory = [];
    this.isRunning = true;
    
    // Additional metrics
    this.metrics = {
      avgFps: 0,
      currentFps: 0,
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
    // Skip all calculations if not running or overlay is hidden
    if (!this.isRunning || !this.options.showOverlay) return;
    
    const now = performance.now();
    this.frameCount++;
    const delta = now - this.lastFrameTime;
    
    // Update every second
    if (delta >= this.options.updateInterval) {
      const fps = (this.frameCount / delta) * 1000;
      this.fpsHistory.push(fps);
      
      // Maintain history length
      if (this.fpsHistory.length > this.options.historyLength) {
        this.fpsHistory.shift();
      }
      
      // Calculate metrics
      this.metrics.currentFps = fps;
      this.metrics.avgFps = this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length;
      this.metrics.peakFps = Math.max(this.metrics.peakFps, fps);
      this.metrics.lowestFps = Math.min(this.metrics.lowestFps, fps);
      
      // Get memory usage if available
      if (window.performance && window.performance.memory) {
        this.metrics.memoryUsage = window.performance.memory.usedJSHeapSize / (1024 * 1024);
        this.memoryHistory.push(this.metrics.memoryUsage);
        
        if (this.memoryHistory.length > this.options.historyLength) {
          this.memoryHistory.shift();
        }
      }
      
      // Update display (we already know showOverlay is true at this point)
      if (this.performanceDiv) {
        let displayText = `FPS: ${fps.toFixed(1)}<br>`;
        displayText += `Avg FPS (${this.options.historyLength}s): ${this.metrics.avgFps.toFixed(1)}<br>`;
        
        if (this.metrics.memoryUsage) {
          displayText += `Memory: ${this.metrics.memoryUsage.toFixed(1)} MB`;
        }
        if (this.metrics.particleCount !== null) {
          displayText += `<br>Particles: ${this.metrics.particleCount}`;
        }
        
        this.performanceDiv.innerHTML = displayText;
      }
      
      // Reset for next interval
      this.lastFrameTime = now;
      this.frameCount = 0;
    }
  };

  /**
   * Sets the particle count to show in the overlay. Cheap, only stored and printed on next overlay update.
   * @param {number} count
   */
  PerformanceMonitor.prototype.setParticleCount = function(count) {
    this.metrics.particleCount = count;
    // If overlay visible, refresh text immediately without recomputing FPS
    if (this.options.showOverlay && this.performanceDiv) {
      const existing = this.performanceDiv.innerHTML;
      // regenerate minimal text with latest metrics; don't compute fps here
      let displayText = `FPS: ${this.metrics.currentFps.toFixed ? this.metrics.currentFps.toFixed(1) : '—'}<br>`;
      displayText += `Avg FPS (${this.options.historyLength}s): ${this.metrics.avgFps.toFixed ? this.metrics.avgFps.toFixed(1) : '—'}<br>`;
      if (this.metrics.memoryUsage) {
        displayText += `Memory: ${this.metrics.memoryUsage.toFixed(1)} MB`;
      }
      displayText += `<br>Particles: ${this.metrics.particleCount}`;
      this.performanceDiv.innerHTML = displayText;
    }
  };

  /**
   * Starts performance monitoring
   */
  PerformanceMonitor.prototype.start = function() {
    this.isRunning = true;
    this.lastFrameTime = performance.now();
    this.frameCount = 0;
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
    
    // Update visibility state
    this.options.showOverlay = visible !== undefined ? visible : !this.options.showOverlay;
    
    // Explicitly set display style
    this.performanceDiv.style.display = this.options.showOverlay ? 'block' : 'none';
    
    console.log('Performance overlay toggled:', this.options.showOverlay ? 'visible' : 'hidden');
    
    // Reset tracking if hiding to prevent unnecessary calculations when hidden
    if (!this.options.showOverlay) {
      this.frameCount = 0;
      this.lastFrameTime = performance.now();
    }
  };

  // Export as module or global
  if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = PerformanceMonitor;
  } else {
    window.ParticleNetworkPerformanceMonitor = PerformanceMonitor;
  }
})(window); 