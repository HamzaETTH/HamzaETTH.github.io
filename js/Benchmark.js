/**
 * Benchmark.js
 * A standalone module to stress-test the ParticleNetwork instance.
 * It controls the instance externally, measures performance, and reports results.
 */

(function(window) {
  'use strict';

  class BenchmarkSystem {
    constructor(networkInstance) {
      this.pn = networkInstance;
      this.isRunning = false;
      this.results = [];
      this.history = JSON.parse(localStorage.getItem('pn_bench_history') || '[]');
      
      // Configuration for the test steps
      this.steps = [
        { count: 1500, duration: 2000 },
        { count: 3000, duration: 2000 },
        { count: 5000, duration: 2000 },
        { count: 10000, duration: 2000 },
        { count: 15000, duration: 3000 }
      ];

      // UI Elements
      this.overlay = null;
      this.statusEl = null;
      this._destroyed = false;
      this._rafIds = new Set();
      this._waits = new Set();
    }

    /**
     * Starts the benchmark process
     */
    async start() {
      if (this.isRunning || this._destroyed) return;
      if (!this.pn) {
        console.error("Benchmark: No ParticleNetwork instance found.");
        return;
      }

      this.isRunning = true;
      this.results = [];
      this.createOverlay();
      
      // 1. Snapshot current settings to restore later
      this.originalOptions = { ...this.pn.options };
      this.originalCount = this.pn.numParticles || this.pn.o.length;

      // 2. Apply "Control" settings (Scientific standard)
      // We disable interaction and fancy variations to test raw engine throughput
      const controlParams = {
        interactive: false,
        particleColorCycling: false,
        lineColorCycling: false, // simplified color
        gradientEffect: false,   // simplified render
        speed: 1.0,
        boundaryMode: 'wrap',
        performanceOverlay: false, // hide internal overlay
        gradientColor1: this.pn.options.gradientColor1 || "#00bfff", // ensure defaults
        gradientColor2: this.pn.options.gradientColor2 || "#ff4500"  // ensure defaults
      };
            
      // Use the global apply helper if available, else manual override
      if (window.applyParamsToNetwork) {
        window.applyParamsToNetwork(this.pn, controlParams);
      } else {
        Object.assign(this.pn.options, controlParams);
      }

      // 3. Run Steps
      for (let i = 0; i < this.steps.length; i++) {
        if (this._destroyed) return;
        const step = this.steps[i];
        this.updateStatus(`Testing: ${step.count} particles...`);
        
        // Set count
        this.setParticleCount(step.count);
        
        // Warmup (let GC settle) - 500ms
        await this.wait(500);
        if (this._destroyed) return;
        
        // Measure
        const metrics = await this.measure(step.duration);
        if (this._destroyed) return;
        
        this.results.push({
          count: step.count,
          avgFps: metrics.avg,
          minFps: metrics.min
        });
      }

      // 4. Restore & Report
      this.restoreSettings();
      this.saveResult();
      this.showReport();
      this.isRunning = false;
    }

    /**
     * Helper to set particle count exactly
     */
    setParticleCount(target) {
      if (!this.pn || !this.pn.i) {
        console.error("Benchmark: ParticleNetwork instance not available");
        return;
      }
      
      // Pause update loop temporarily to avoid race conditions
      const wasActive = this.pn._rafActive;
      if (wasActive && this.pn._rafId) {
        cancelAnimationFrame(this.pn._rafId);
        this.pn._rafActive = false;
      }
      
      // Ensure valid canvas size - get from multiple sources
      const w = this.pn.i.offsetWidth || this.pn.i.size?.width || 1920;
      const h = this.pn.i.offsetHeight || this.pn.i.size?.height || 1080;
      
      if (!w || !h || w <= 0 || h <= 0 || !isFinite(w) || !isFinite(h)) {
        console.error("Benchmark: Invalid canvas dimensions", w, h);
        if (wasActive) {
          this.pn._rafActive = true;
          this.pn._rafId = requestAnimationFrame(this.pn.update);
        }
        return;
      }
      
      // Ensure size object exists and is properly set
      if (!this.pn.i.size) {
        this.pn.i.size = { width: w, height: h };
      } else {
        this.pn.i.size.width = w;
        this.pn.i.size.height = h;
      }
      
      // Double-check size is valid after setting
      if (!this.pn.i.size.width || !this.pn.i.size.height || 
          !isFinite(this.pn.i.size.width) || !isFinite(this.pn.i.size.height)) {
        console.error("Benchmark: Size object invalid after setting", this.pn.i.size);
        if (wasActive) {
          this.pn._rafActive = true;
          this.pn._rafId = requestAnimationFrame(this.pn.update);
        }
        return;
      }
      
      // Calculate density needed to get exact target count
      const area = w * h;
      const requiredDensity = area / target;
      
      // Validate density
      if (!isFinite(requiredDensity) || requiredDensity <= 0) {
        console.error("Benchmark: Invalid density calculation", requiredDensity);
        if (wasActive) {
          this.pn._rafActive = true;
          this.pn._rafId = requestAnimationFrame(this.pn.update);
        }
        return;
      }
      
      // Save original density
      const originalDensity = this.pn.options.density;
      
      // Set new density
      this.pn.options.density = requiredDensity;
      
      // Save particle constructor from existing particles before clearing
      let ParticleConstructor = null;
      if (this.pn.o && this.pn.o.length > 0) {
        ParticleConstructor = this.pn.o[0].constructor;
      }
      
      // Rebuild particles using the same logic as _rebuildOnResize
      this.pn.o = [];
      const logicalArea = w * h;
      const particleCount = Math.floor(logicalArea / requiredDensity);
      
      // Create particles using saved constructor
      if (ParticleConstructor) {
        for (let a = 0; a < particleCount; a++) {
          const particle = new ParticleConstructor(this.pn);
          particle.index = a;
          this.pn.o.push(particle);
        }
      } else {
        console.warn("Benchmark: Could not find particle constructor, using fallback");
        // Fallback: try to use _rebuildOnResize if available
        if (typeof this.pn._rebuildOnResize === 'function') {
          this.pn._rebuildOnResize();
          // Restore density after rebuild
          this.pn.options.density = originalDensity;
          if (wasActive && !this.pn._rafActive) {
            this.pn._rafActive = true;
            this.pn._rafId = requestAnimationFrame(this.pn.update);
          }
          return;
        } else {
          console.error("Benchmark: Cannot create particles - no constructor or rebuild method");
          this.pn.options.density = originalDensity;
          if (wasActive) {
            this.pn._rafActive = true;
            this.pn._rafId = requestAnimationFrame(this.pn.update);
          }
          return;
        }
      }
      
      // Re-init SoA buffers (must happen before initGrid)
      if (this.pn._initSoAFromObjects) {
        this.pn._initSoAFromObjects(this.pn.o.length);
      }
      
      // Ensure all grid-related options exist and are valid before calling initGrid
      const opts = this.pn.options;
      if (!opts.particleInteractionDistance) opts.particleInteractionDistance = 50;
      if (!opts.lineConnectionDistance) opts.lineConnectionDistance = 120;
      if (!opts.maxColorChangeDistance) opts.maxColorChangeDistance = 120;
      if (!opts.proximityEffectDistance) opts.proximityEffectDistance = 100;
      
      // Validate gridCellSize calculation won't be 0
      const gridCellSize = Math.max(
        opts.particleInteractionDistance || 50,
        opts.lineConnectionDistance || 120,
        opts.maxColorChangeDistance || 120,
        opts.proximityEffectDistance || 100
      );
      
      if (gridCellSize <= 0 || !isFinite(gridCellSize)) {
        console.error("Benchmark: Invalid gridCellSize", gridCellSize);
        this.pn.options.density = originalDensity;
        if (wasActive) {
          this.pn._rafActive = true;
          this.pn._rafId = requestAnimationFrame(this.pn.update);
        }
        return;
      }
      
      // Validate grid dimensions before calling initGrid
      const testGridWidth = Math.ceil(w / gridCellSize);
      const testGridHeight = Math.ceil(h / gridCellSize);
      const testGridSize = testGridWidth * testGridHeight;
      
      if (!isFinite(testGridSize) || testGridSize <= 0 || testGridSize > 10000000) {
        console.error("Benchmark: Invalid gridSize calculation", {
          w, h, gridCellSize, testGridWidth, testGridHeight, testGridSize
        });
        this.pn.options.density = originalDensity;
        if (wasActive) {
          this.pn._rafActive = true;
          this.pn._rafId = requestAnimationFrame(this.pn.update);
        }
        return;
      }
      
      // Re-init grid (must happen after SoA init and size is set)
      if (this.pn.initGrid) {
        this.pn.initGrid();
      }
      
      // Update performance monitor if available
      if (this.pn.performanceMonitor && this.pn.performanceMonitor.setParticleCount) {
        this.pn.performanceMonitor.setParticleCount(this.pn.numParticles || this.pn.o.length);
      }
      
      // Restore original density for next rebuild
      this.pn.options.density = originalDensity;
      
      // Resume update loop if it was active
      if (wasActive && !this.pn._rafActive) {
        this.pn._rafActive = true;
        this.pn._rafId = requestAnimationFrame(this.pn.update);
      }
    }

    /**
     * Measurement loop
     */
    measure(duration) {
      return new Promise(resolve => {
        let frames = 0;
        let minFps = Infinity;
        const startTime = performance.now();
        let lastFrameTime = startTime;
        let settled = false;
        const finish = metrics => {
          if (settled) return;
          settled = true;
          this._measureFinishers.delete(cancel);
          resolve(metrics);
        };
        const cancel = () => finish({ avg: 0, min: 0 });
        if (!this._measureFinishers) this._measureFinishers = new Set();
        this._measureFinishers.add(cancel);

        const schedule = callback => {
          let id = null;
          id = requestAnimationFrame(timestamp => {
            this._rafIds.delete(id);
            callback(timestamp);
          });
          this._rafIds.add(id);
        };

        const loop = () => {
          if (this._destroyed) {
            cancel();
            return;
          }
          const now = performance.now();
          const dt = now - lastFrameTime;
          
          if (dt > 0) {
            const currentFps = 1000 / dt;
            if (frames > 5) { // Ignore first few frames of variance
              minFps = Math.min(minFps, currentFps);
            }
            frames++;
          }
          lastFrameTime = now;

          if (now - startTime < duration) {
            schedule(loop);
          } else {
            // Done
            const totalTime = now - startTime;
            const avg = (frames / totalTime) * 1000;
            finish({ avg, min: minFps === Infinity ? avg : minFps });
          }
        };
        schedule(loop);
      });
    }

    wait(ms) {
      return new Promise(resolve => {
        const entry = { id: null, resolve };
        entry.id = setTimeout(() => {
          this._waits.delete(entry);
          resolve();
        }, ms);
        this._waits.add(entry);
      });
    }

    restoreSettings() {
      this.updateStatus("Restoring settings...");
      // Restore options
      Object.assign(this.pn.options, this.originalOptions);
      // Restore count
      this.setParticleCount(this.originalCount);
      if (window.applyParamsToNetwork) {
        window.applyParamsToNetwork(this.pn, this.originalOptions);
        // The UI mapper converts display units to engine units. Reapply the
        // exact engine snapshot after its DOM/particle side effects.
        Object.assign(this.pn.options, this.originalOptions);
      }
    }

    saveResult() {
      const runData = {
        id: Date.now(),
        date: new Date().toLocaleTimeString(),
        data: this.results
      };
      this.history.push(runData);
      // Keep last 5 runs
      if (this.history.length > 5) this.history.shift();
      localStorage.setItem('pn_bench_history', JSON.stringify(this.history));
    }

    // --- UI Helpers ---

    createOverlay() {
      if (document.getElementById('bench-overlay')) return;
      
      const div = document.createElement('div');
      div.id = 'bench-overlay';
      div.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.85); z-index: 9999;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        color: #00ff00; font-family: 'Fira Code', monospace; pointer-events: all;
      `;
      
      this.statusEl = document.createElement('h2');
      this.statusEl.innerText = "Initializing Benchmark...";
      div.appendChild(this.statusEl);
      
      document.body.appendChild(div);
      this.overlay = div;
    }

    updateStatus(text) {
      if (this.statusEl) this.statusEl.innerText = text;
    }

    showReport() {
      if (!this.overlay) return;
      
      // Clear overlay
      this.overlay.innerHTML = '';
      
      const container = document.createElement('div');
      container.style.cssText = "background: #111; padding: 40px; border-radius: 8px; border: 1px solid #333; max-width: 800px; width: 90%; max-height: 90vh; overflow-y: auto;";
      
      const h1 = document.createElement('h1');
      h1.innerText = "Benchmark Results";
      h1.style.color = "#fff";
      container.appendChild(h1);

      // Comparison Table
      const table = document.createElement('table');
      table.style.cssText = "width: 100%; border-collapse: collapse; margin-top: 20px; color: #ccc;";
      
      // Get previous run for comparison
      const prevRun = this.history.length > 1 ? this.history[this.history.length - 2] : null;

      // Header
      const thead = `
        <tr style="border-bottom: 1px solid #444; text-align: left;">
          <th style="padding: 10px;">Particles</th>
          <th style="padding: 10px;">Avg FPS (Current)</th>
          <th style="padding: 10px;">1% Low (Stutter)</th>
          <th style="padding: 10px;">vs Previous</th>
        </tr>`;
      table.innerHTML = thead;

      this.results.forEach((res, idx) => {
        const prevRes = prevRun ? prevRun.data.find(d => d.count === res.count) : null;
        let diffStr = "-";
        let color = "#888";
        
        if (prevRes) {
          const diff = res.avgFps - prevRes.avgFps;
          const percent = ((diff / prevRes.avgFps) * 100).toFixed(1);
          if (diff > 0.5) { diffStr = `+${percent}% 🚀`; color = "#0f0"; }
          else if (diff < -0.5) { diffStr = `${percent}% 🔻`; color = "#f00"; }
          else { diffStr = "~0%"; }
        }

        const row = document.createElement('tr');
        row.style.borderBottom = "1px solid #222";
        row.innerHTML = `
          <td style="padding: 10px; font-weight: bold;">${res.count}</td>
          <td style="padding: 10px; color: #fff;">${res.avgFps.toFixed(1)}</td>
          <td style="padding: 10px; color: #aaa;">${res.minFps.toFixed(1)}</td>
          <td style="padding: 10px; color: ${color};">${diffStr}</td>
        `;
        table.appendChild(row);
      });

      container.appendChild(table);

      // Buttons
      const btnContainer = document.createElement('div');
      btnContainer.style.marginTop = "30px";
      
      const closeBtn = document.createElement('button');
      closeBtn.innerText = "Close Report";
      closeBtn.style.cssText = "padding: 10px 20px; background: #444; color: white; border: none; cursor: pointer; margin-right: 10px;";
      closeBtn.onclick = () => { document.body.removeChild(this.overlay); this.overlay = null; };
      
      const rerunBtn = document.createElement('button');
      rerunBtn.innerText = "Run Again";
      rerunBtn.style.cssText = "padding: 10px 20px; background: #0066cc; color: white; border: none; cursor: pointer;";
      rerunBtn.onclick = () => { document.body.removeChild(this.overlay); this.overlay = null; this.start(); };

      btnContainer.appendChild(closeBtn);
      btnContainer.appendChild(rerunBtn);
      container.appendChild(btnContainer);

      this.overlay.appendChild(container);
    }

    destroy() {
      if (this._destroyed) return;
      this._destroyed = true;
      this.isRunning = false;
      this._rafIds.forEach(id => cancelAnimationFrame(id));
      this._rafIds.clear();
      this._waits.forEach(entry => {
        clearTimeout(entry.id);
        entry.resolve();
      });
      this._waits.clear();
      if (this._measureFinishers) {
        this._measureFinishers.forEach(finish => finish());
        this._measureFinishers.clear();
      }
      if (this.overlay && this.overlay.parentNode) this.overlay.parentNode.removeChild(this.overlay);
      this.overlay = null;
      this.statusEl = null;
      this.pn = null;
    }
  }

  // Expose to window
  window.BenchmarkSystem = BenchmarkSystem;

})(window);

