(function (a) {
  var b =
    ("object" == typeof self && self.self === self && self) || ("object" == typeof global && global.global === global);
  "function" == typeof define && define.amd
    ? define(["exports"], function (c) {
        b.ParticleNetwork = a(b, c);
      })
    : "object" == typeof module && module.exports
    ? (module.exports = a(b, {}))
    : (b.ParticleNetwork = a(b, {}));
})(function (a, b) {
  // Keep these for backward compatibility and internal use
  function hexToRgb(hex) {
    if (window.ColorUtils && window.ColorUtils.hexToRgbArray) {
      return window.ColorUtils.hexToRgbArray(hex);
    }
    var bigint = parseInt(hex.slice(1), 16);
    return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
  }

  function interpolateColor(startColor, endColor, factor) {
    if (window.ColorUtils && window.ColorUtils.interpolateRgb) {
      return window.ColorUtils.interpolateRgb(startColor, endColor, factor);
    }
    var result = [];
    for (var i = 0; i < 3; i++) result[i] = Math.round(startColor[i] + factor * (endColor[i] - startColor[i]));
    return result;
  }

  function rgbToString(rgb) {
    if (window.ColorUtils && window.ColorUtils.rgbArrayToString) {
      return window.ColorUtils.rgbArrayToString(rgb);
    }
    return "rgb(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ")";
  }

  // We'll use the ColorUtils functions if available, otherwise use these
  function generateRandomColor() {
    return Math.floor(Math.random() * 360);
  }

  // Legacy function kept for backward compatibility
  function generateDistinctColor(hue1, minDifference) {
    // Use ColorUtils if available, otherwise use the original implementation
    if (window.ColorUtils) {
      return window.ColorUtils.hueDistance(hue1, minDifference);
    } else {
      let hue2;
      const range = 360 - 2 * minDifference;
      const randomValue = Math.floor(Math.random() * range);
      hue2 = (hue1 + minDifference + randomValue) % 360;
      return hue2;
    }
  }

  var c = function (a) {
    (this.canvas = a.canvas),
      (this.g = a.g),
      (this.x = Math.random() * this.canvas.width),
      (this.y = Math.random() * this.canvas.height),
      (this.velocity = {
        x: (Math.random() - 0.5) * a.options.velocity,
        y: (Math.random() - 0.5) * a.options.velocity,
      }),
      (this.size = a.options.particleSize),
      (this.options = a.options);

    this.hue = generateRandomColor();
    if (this.options.randomIndividualParticleColor) {
      this.particleColor = `hsl(${this.hue}, 100%, 50%)`;
    } else if (this.options.randomParticleColor) {
      if (!this.options.calculatedParticleColor) {
        this.options.calculatedParticleColor = `hsl(${this.hue}, 100%, 50%)`;
      }
      this.particleColor = this.options.calculatedParticleColor;
    } else {
      this.particleColor = this.options.particleColor;
    }
  };

  c.prototype.update = function (
    attractionForce,
    repulsionForce,
    repulsionRange,
    repulsionIntensity,
    attractionRange,
    attractionIntensity
  ) {
    var originalSpeed = this.options.velocity;
    var speedRecoveryRate = 0.01;

    if (this.options.interactive && attractionForce) {
      var attractionDx = attractionForce.x - this.x;
      var attractionDy = attractionForce.y - this.y;
      var attractionDistance = Math.sqrt(attractionDx * attractionDx + attractionDy * attractionDy);
      if (attractionDistance < 50) attractionDistance = 50; // Ensure minimum distance
      var attractionForceDirectionX = attractionDx / attractionDistance;
      var attractionForceDirectionY = attractionDy / attractionDistance;
      var attractionforce = (-100 / (attractionDistance * attractionDistance)) * attractionRange * attractionIntensity;
      this.velocity.x += attractionforce * attractionForceDirectionX;
      this.velocity.y += attractionforce * attractionForceDirectionY;
    }

    if (this.options.interactive && repulsionForce) {
      var repulsiveDx = repulsionForce.x - this.x;
      var repulsiveDy = repulsionForce.y - this.y;
      var repulsiveDistance = Math.sqrt(repulsiveDx * repulsiveDx + repulsiveDy * repulsiveDy);
      if (repulsiveDistance < 50) repulsiveDistance = 50; // Ensure minimum distance
      var repulsiveForceDirectionX = repulsiveDx / repulsiveDistance;
      var repulsiveForceDirectionY = repulsiveDy / repulsiveDistance;
      var repulsiveforce = (100 / (repulsiveDistance * repulsiveDistance)) * repulsionRange * repulsionIntensity;
      this.velocity.x += repulsiveforce * repulsiveForceDirectionX;
      this.velocity.y += repulsiveforce * repulsiveForceDirectionY;
    }

    var currentSpeed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.y * this.velocity.y);
    if (currentSpeed < originalSpeed) {
      this.velocity.x *= 1 + speedRecoveryRate;
      this.velocity.y *= 1 + speedRecoveryRate;
    } else if (currentSpeed > originalSpeed) {
      this.velocity.x *= 1 - speedRecoveryRate;
      this.velocity.y *= 1 - speedRecoveryRate;
    }

    // Update positions
    this.x += this.velocity.x;
    this.y += this.velocity.y;

    // Boundary handling (bounce by default)
    var mode = this.options && this.options.boundaryMode ? this.options.boundaryMode : 'bounce';
    if (mode === 'wrap') {
      if (this.x > this.canvas.width + this.size) this.x = -this.size;
      else if (this.x < -this.size) this.x = this.canvas.width + this.size;
      if (this.y > this.canvas.height + this.size) this.y = -this.size;
      else if (this.y < -this.size) this.y = this.canvas.height + this.size;
    } else if (mode === 'bounce') {
      if (this.x + this.size > this.canvas.width) { this.x = this.canvas.width - this.size; this.velocity.x = -Math.abs(this.velocity.x); }
      else if (this.x - this.size < 0) { this.x = this.size; this.velocity.x = Math.abs(this.velocity.x); }
      if (this.y + this.size > this.canvas.height) { this.y = this.canvas.height - this.size; this.velocity.y = -Math.abs(this.velocity.y); }
      else if (this.y - this.size < 0) { this.y = this.size; this.velocity.y = Math.abs(this.velocity.y); }
    }

    if (this.options.particleColorCycling) {
      if (this.options.randomIndividualParticleColor) {
        this.hue = (this.hue + this.options.particleCyclingSpeed) % 360;
        this.particleColor = `hsl(${this.hue}, 100%, 50%)`;
      } else {
        this.options.globalHue = (this.options.globalHue || 0) + this.options.particleCyclingSpeed;
        if (this.options.globalHue >= 360) this.options.globalHue -= 360;
        this.particleColor = `hsl(${this.options.globalHue}, 100%, 50%)`;
      }
    }
  };

  c.prototype.h = function () {
    this.g.beginPath();
    this.g.fillStyle = this.particleColor;
    this.g.globalAlpha = this.options.opacity;
    this.g.arc(this.x, this.y, this.size, 0, 2 * Math.PI);
    this.g.fill();
  };

  var applyParticleInteraction = function (
    particles,
    centerX,
    centerY,
    particleInteractionDistance,
    particleRepulsionForce
  ) {
    for (var i = 0; i < particles.length; i++) {
      var particle = particles[i];
      var dx = particle.x - centerX;
      var dy = particle.y - centerY;
      var distanceSq = dx * dx + dy * dy;

      if (distanceSq < particleInteractionDistance * particleInteractionDistance && distanceSq > 0) {
        var distance = Math.sqrt(distanceSq);
        var forceDirectionX = dx / distance;
        var forceDirectionY = dy / distance;
        var force = (particleRepulsionForce * (particleInteractionDistance - distance)) / particleInteractionDistance;
        particle.velocity.x += forceDirectionX * force;
        particle.velocity.y += forceDirectionY * force;
      }
    }
  };

  // ParticleNetwork Class
  return (
    (b = function (a, b) {
      (this.i = a),
        (this.i.size = { width: this.i.offsetWidth, height: this.i.offsetHeight }),
        (b = void 0 !== b ? b : {});

      // Unify config: prefer Config.js defaults and presets, then apply explicit overrides
      var cfg = (window.ParticleNetworkConfig && window.ParticleNetworkConfig.createConfig)
        ? window.ParticleNetworkConfig.createConfig(b)
        : {};

      this.options = {
        // pull from cfg or fallback to sensible defaults
        background: cfg.background || "#000000",
        particleColor: cfg.particleColor || "#fff",
        particleSize: cfg.particleSize != null ? cfg.particleSize : 2,
        particleColorCycling: !!cfg.particleColorCycling,
        particleCyclingSpeed: cfg.particleCyclingSpeed != null ? cfg.particleCyclingSpeed : 0.01,
        randomParticleColor: !!cfg.randomParticleColor,
        randomIndividualParticleColor: !!cfg.randomIndividualParticleColor,
        gradientEffect: cfg.gradientEffect != null ? cfg.gradientEffect : true,
        gradientColor1: cfg.gradientColor1 || "#00bfff",
        gradientColor2: cfg.gradientColor2 || "#ff4500",
        lineColorCycling: cfg.lineColorCycling != null ? cfg.lineColorCycling : true,
        lineCyclingSpeed: cfg.lineCyclingSpeed != null ? cfg.lineCyclingSpeed : 1,
        colorDifferentiationMethod: cfg.colorDifferentiationMethod || 'hueDistance',
        colorDifferentiationOptions: cfg.colorDifferentiationOptions || {},
        interactive: cfg.interactive != null ? cfg.interactive : true,
        proximityEffectColor: cfg.proximityEffectColor || "#ff0000",
        proximityEffectDistance: cfg.proximityEffectDistance != null ? cfg.proximityEffectDistance : 100,
        attractionRange: cfg.attractionRange != null ? cfg.attractionRange : 1,
        attractionIntensity: cfg.attractionIntensity != null ? cfg.attractionIntensity : 1,
        repulsionRange: cfg.repulsionRange != null ? cfg.repulsionRange : 1,
        repulsionIntensity: cfg.repulsionIntensity != null ? cfg.repulsionIntensity : 1,
        // Velocity/density: from cfg if present, else from provided b
        velocity: this.setVelocity(cfg.speed != null ? cfg.speed : b.speed),
        density: this.j(cfg.density != null ? cfg.density : b.density),
        opacity: cfg.opacity != null ? cfg.opacity : 0.7,
        useDistanceEffect: cfg.useDistanceEffect != null ? cfg.useDistanceEffect : false,
        maxColorChangeDistance: cfg.maxColorChangeDistance != null ? cfg.maxColorChangeDistance : 120,
        startColor: cfg.startColor || "#0BDA51",
        endColor: cfg.endColor || "#BF00FF",
        particleInteractionDistance: cfg.particleInteractionDistance != null ? cfg.particleInteractionDistance : 50,
        particleRepulsionForce: cfg.particleRepulsionForce != null ? cfg.particleRepulsionForce : 5,
        lineConnectionDistance: cfg.lineConnectionDistance != null ? cfg.lineConnectionDistance : 120,
        performanceOverlay: cfg.performanceOverlay != null ? cfg.performanceOverlay : false,
        // New: boundary handling
        boundaryMode: cfg.boundaryMode || 'bounce'
      };

      this.init();
    }),
    // Map DOM event client coordinates to canvas coordinates accounting for CSS scaling
    (b.prototype._mapToCanvas = function(evt) {
      var rect = this.canvas.getBoundingClientRect();
      var x = (evt.clientX - rect.left) * (this.canvas.width / rect.width);
      var y = (evt.clientY - rect.top) * (this.canvas.height / rect.height);
      return { x: x, y: y };
    }),
    (b.prototype.init = function () {
      if (
        ((this.k = document.createElement("div")),
        this.i.appendChild(this.k),
        // Always use the external PerformanceMonitor module
        (this.performanceMonitor = window.ParticleNetworkPerformanceMonitor ? 
          new window.ParticleNetworkPerformanceMonitor(this.i, {
            showOverlay: this.options.performanceOverlay // Pass initial visibility from options
          }) : null),
        this.l(this.k, { position: "absolute", top: 0, left: 0, bottom: 0, right: 0, "z-index": 1 }),
        /(^#[0-9A-F]{6}$)|(^#[0-9A-F]{3}$)/i.test(this.options.background))
      ) {
        this.l(this.k, { background: this.options.background });
      } else {
        if (!/\.(gif|jpg|jpeg|tiff|png)$/i.test(this.options.background)) {
          console.error("Invalid background image or hexadecimal color");
          return false;
        }
        this.l(this.k, {
          background: 'url("' + this.options.background + '") no-repeat center',
          "background-size": "cover",
        });
      }

      if (!/(^#[0-9A-F]{6}$)|(^#[0-9A-F]{3}$)/i.test(this.options.particleColor)) {
        console.error("Invalid particleColor hexadecimal color");
        return false;
      }

      // Canvas setup (DPR-aware, absolute overlay)
      this.canvas = document.createElement("canvas");
      this.i.appendChild(this.canvas);
      this.g = this.canvas.getContext("2d");
      this.dpr = window.devicePixelRatio || 1;
      this.l(this.i, { position: "relative" });
      this.l(this.canvas, { "z-index": "20", position: "absolute", top: 0, left: 0 });
      // CSS size
      this.canvas.style.width = this.i.size.width + 'px';
      this.canvas.style.height = this.i.size.height + 'px';
      // Backing store size
      this.canvas.width = Math.max(1, Math.floor(this.i.size.width * this.dpr));
      this.canvas.height = Math.max(1, Math.floor(this.i.size.height * this.dpr));
      // Scale so drawing uses CSS pixels
      this.g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

      // Color setups
      this.startColorRgb = hexToRgb(this.options.startColor);
      this.endColorRgb = hexToRgb(this.options.endColor);
      if (this.options.lineColorCycling) {
        this.lineHue1 = generateRandomColor();
        
        // Use the selected color differentiation method if ColorUtils is available
        if (window.ColorUtils && window.ColorDiffMethod) {
          // Convert string method name to ColorDiffMethod enum value if needed
          let methodName = this.options.colorDifferentiationMethod;
          let method = window.ColorDiffMethod[methodName.toUpperCase()] || window.ColorDiffMethod.HUE_DISTANCE;
          
          // Generate the second color using the selected method
          this.lineHue2 = window.ColorUtils.generateDistinctColor(
            this.lineHue1, 
            method,
            this.options.colorDifferentiationOptions
          );
        } else {
          // Fallback to original implementation
          this.lineHue2 = generateDistinctColor(this.lineHue1, 50);
        }
      }

      // Initialize grid variables
      this.initGrid();

      // Try WebGL line renderer (keeps gradients at scale) under the 2D particles
      if (window.ParticleNetworkRendererGL) {
        try {
          this.glRenderer = new window.ParticleNetworkRendererGL(this.i, { zIndex: 19 });
          // Ensure initial size
          if (this.glRenderer && this.glRenderer.resize) {
            this.glRenderer.resize(this.canvas.style.width ? this.i.size.width : this.canvas.width, this.canvas.style.height ? this.i.size.height : this.canvas.height);
          }
        } catch (e) {
          this.glRenderer = null;
          console.warn('GL renderer init failed:', e);
        }
      }

      // Resize event listener
      // Unified resize helper
      this._rebuildOnResize = function() {
        // Update container size
        this.i.size.width = this.i.offsetWidth;
        this.i.size.height = this.i.offsetHeight;
        // Update DPR-aware canvas sizing
        this.dpr = window.devicePixelRatio || 1;
        this.canvas.style.width = this.i.size.width + 'px';
        this.canvas.style.height = this.i.size.height + 'px';
        this.canvas.width = Math.max(1, Math.floor(this.i.size.width * this.dpr));
        this.canvas.height = Math.max(1, Math.floor(this.i.size.height * this.dpr));
        this.g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        // Rebuild particles to match new area
        this.o = [];
        for (var a = 0; a < (this.canvas.width * this.canvas.height) / this.options.density; a++) {
          var particle = new c(this);
          particle.index = a;
          this.o.push(particle);
        }
        // Re-init SoA buffers
        this._initSoAFromObjects(this.o.length);
        if (this.performanceMonitor && this.performanceMonitor.setParticleCount) {
          this.performanceMonitor.setParticleCount(this.numParticles);
        }
        // Keep interactive pointer particle out of SoA; ensure it exists
        if (this.options.interactive && this.p) {
          this.p.index = this.o.length; // keep index outside SoA range
          this.o.push(this.p);
        }
        // Re-initialize the grid
        this.initGrid();
        // Resize GL renderer once
        if (this.glRenderer && this.glRenderer.resize) {
          this.glRenderer.resize(this.i.size.width, this.i.size.height);
        }
        requestAnimationFrame(this.update);
      }.bind(this);

      window.addEventListener(
        "resize",
        function () {
          if (this.i.offsetWidth === this.i.size.width && this.i.offsetHeight === this.i.size.height) {
            return false;
          }
          clearTimeout(this.m);
          this.m = setTimeout(this._rebuildOnResize, 500);
        }.bind(this)
      );

      // Particle array initialization
      this.o = [];
      for (var a = 0; a < (this.canvas.width * this.canvas.height) / this.options.density; a++) {
        var particle = new c(this);
        particle.index = a;
        this.o.push(particle);
      }
      // Initialize SoA typed arrays from created particles (exclude interactive pointer)
      this._initSoAFromObjects(this.o.length);
      if (this.performanceMonitor && this.performanceMonitor.setParticleCount) {
        this.performanceMonitor.setParticleCount(this.numParticles);
      }

      // Interactive particle setup
      if (this.options.interactive) {
        this.p = new c(this);
        this.p.velocity = { x: 0, y: 0 };
        this.p.index = this.o.length; // not part of SoA buffers

        // Mouse events
        this.canvas.addEventListener(
          "mousemove",
          function (a) {
            var pos = this._mapToCanvas(a);
            var x = pos.x, y = pos.y;
            if (this.attractionForce) { this.attractionForce.x = x; this.attractionForce.y = y; }
            if (this.repulsionForce) { this.repulsionForce.x = x; this.repulsionForce.y = y; }
            this.p.x = x; this.p.y = y;
          }.bind(this)
        );

        document.addEventListener("contextmenu", function (a) {
          a.preventDefault();
        });

        this.canvas.addEventListener(
          "mousedown",
          function (a) {
            var pos = this._mapToCanvas(a);
            var x = pos.x, y = pos.y;
            if (a.button === 0) { this.repulsionForce = { x: x, y: y }; }
            else if (a.button === 2) { this.attractionForce = { x: x, y: y }; }
          }.bind(this)
        );

        this.canvas.addEventListener(
          "mouseup",
          function (a) {
            if (a.button === 0) {
              this.repulsionForce = null;
            } else if (a.button === 2) {
              this.attractionForce = null;
            }
          }.bind(this)
        );

        // Pointer/touch events (unified). Behavior:
        // - 1 finger: attract toward finger
        // - 2+ fingers: repel from centroid of touches
        this.canvas.style.touchAction = 'none';
        this._activePointers = new Map(); // pointerId -> {x,y}

        var updateForcesFromPointers = function() {
          var count = this._activePointers.size;
          if (count === 0) {
            this.attractionForce = null;
            this.repulsionForce = null;
            return;
          }
          // Compute position: first pointer for 1-finger, centroid for 2+
          var sumX = 0, sumY = 0, first = null;
          this._activePointers.forEach(function(pos){
            if (!first) first = pos;
            sumX += pos.x; sumY += pos.y;
          });
          if (count === 1) {
            var fx = first.x, fy = first.y;
            if (!this.attractionForce) this.attractionForce = { x: fx, y: fy };
            this.attractionForce.x = fx; this.attractionForce.y = fy;
            this.repulsionForce = null;
            this.p.x = fx; this.p.y = fy;
          } else {
            var cx = sumX / count, cy = sumY / count;
            if (!this.repulsionForce) this.repulsionForce = { x: cx, y: cy };
            this.repulsionForce.x = cx; this.repulsionForce.y = cy;
            this.attractionForce = null;
            this.p.x = cx; this.p.y = cy;
          }
        }.bind(this);

        this.canvas.addEventListener('pointerdown', function(evt){
          if (evt.pointerType !== 'touch' && evt.pointerType !== 'pen') return; // leave mouse to existing handlers
          var pos = this._mapToCanvas(evt);
          this._activePointers.set(evt.pointerId, { x: pos.x, y: pos.y });
          try { this.canvas.setPointerCapture && this.canvas.setPointerCapture(evt.pointerId); } catch(e) {}
          updateForcesFromPointers();
          evt.preventDefault();
        }.bind(this), { passive: false });

        this.canvas.addEventListener('pointermove', function(evt){
          if (!this._activePointers.has(evt.pointerId)) return;
          var pos = this._mapToCanvas(evt);
          this._activePointers.set(evt.pointerId, { x: pos.x, y: pos.y });
          updateForcesFromPointers();
          evt.preventDefault();
        }.bind(this), { passive: false });

        var clearPointer = function(evt){
          if (!this._activePointers.has(evt.pointerId)) return;
          this._activePointers.delete(evt.pointerId);
          updateForcesFromPointers();
          evt.preventDefault();
        }.bind(this);

        this.canvas.addEventListener('pointerup', clearPointer, { passive: false });
        this.canvas.addEventListener('pointercancel', clearPointer, { passive: false });
        this.canvas.addEventListener('pointerleave', clearPointer, { passive: false });
      }

      // Performance overlay setup
      if (this.options.performanceOverlay) {
        this.setupPerformanceOverlay();
      }

      // **Event listeners for particle count adjustment**
      this.canvas.addEventListener(
        "wheel",
        function (event) {
          if (event.deltaY < 0) {
            // mwheelup - Increase particles by X2
            this.adjustParticleCount(true);
          } else {
            // mwheeldown - Decrease particles by /2
            this.adjustParticleCount(false);
          }
          event.preventDefault();
          if (this.performanceMonitor && this.performanceMonitor.setParticleCount) {
            this.performanceMonitor.setParticleCount(this.o.length);
          }
        }.bind(this)
      );

      document.addEventListener(
        "keydown",
        function (event) {
          if (event.key === "ArrowUp") {
            // Up arrow key - Increase particles by X2
            this.adjustParticleCount(true);
          } else if (event.key === "ArrowDown") {
            // Down arrow key - Decrease particles by /2
            this.adjustParticleCount(false);
          }
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            if (this.performanceMonitor && this.performanceMonitor.setParticleCount) {
              this.performanceMonitor.setParticleCount(this.o.length);
            }
          }
        }.bind(this)
      );

      // Bind update function once
      this.update = this.update.bind(this);
      requestAnimationFrame(this.update);
    }),
      // Initialize grid dimensions and variables
    (b.prototype.initGrid = function () {
      this.gridCellSize = Math.max(
        this.options.particleInteractionDistance,
        this.options.lineConnectionDistance,
        this.options.maxColorChangeDistance,
        this.options.proximityEffectDistance
      );

      this.gridWidth = Math.ceil(this.canvas.width / this.gridCellSize);
      this.gridHeight = Math.ceil(this.canvas.height / this.gridCellSize);
      this.gridSize = this.gridWidth * this.gridHeight;
    }),
    (b.prototype.setupPerformanceOverlay = function () {
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
      this.i.appendChild(this.performanceDiv);

      this.lastFrameTime = performance.now();
      this.frameCount = 0;
      this.fpsHistory = [];
    }),
    (b.prototype.updatePerformanceOverlay = function () {
      var now = performance.now();
      this.frameCount++;
      var delta = now - this.lastFrameTime;
      if (delta >= 1000) {
        var fps = (this.frameCount / delta) * 1000;
        this.fpsHistory.push(fps);
        if (this.fpsHistory.length > 10) this.fpsHistory.shift();
        var avgFps =
          this.fpsHistory.reduce(function (a, b) {
            return a + b;
          }, 0) / this.fpsHistory.length;
        this.performanceDiv.innerHTML = "FPS: " + fps.toFixed(2) + "<br>Avg FPS (last 10s): " + avgFps.toFixed(2);
        this.lastFrameTime = now;
        this.frameCount = 0;
      }
    }),
    (b.prototype.update = function () {
      var options = this.options;
      // Update motion using SoA for performance, then sync back to objects for rendering/grid
      if (this.numParticles > 0) {
        this._updateSoA();
        this._syncObjectsFromSoA();
      }
      var particles = this.o;
      var numParticles = particles.length;
      var g = this.g;

      g.clearRect(0, 0, this.canvas.width, this.canvas.height);
      g.globalAlpha = 1;

      // Begin GL frame if available
      if (this.glRenderer && this.glRenderer.beginFrame) {
        this.glRenderer.resize(this.canvas.width, this.canvas.height);
        this.glRenderer.beginFrame();
      }

      if (options.performanceOverlay) {
        this.updatePerformanceOverlay();
      }

      // Update particles
      for (var i = 0; i < numParticles; i++) {
        // NOTE: c.prototype.update signature expects (attractionForce, repulsionForce, repulsionRange, repulsionIntensity, attractionRange, attractionIntensity)
        particles[i].update(
          this.attractionForce,
          this.repulsionForce,
          options.repulsionRange,
          options.repulsionIntensity,
          options.attractionRange,
          options.attractionIntensity
        );
      }

      // Build the grid
      var gridCellSize = this.gridCellSize;
      var gridWidth = this.gridWidth;
      var gridHeight = this.gridHeight;
      var gridSize = this.gridSize;

      // Touch-clearing grid reuse
      if (!this.grid) {
        this.grid = new Array(gridSize);
        for (i = 0; i < gridSize; i++) this.grid[i] = [];
        this._touchedCells = [];
      } else if (this.grid.length !== gridSize) {
        this.grid = new Array(gridSize);
        for (i = 0; i < gridSize; i++) this.grid[i] = [];
        this._touchedCells = [];
      } else {
        for (i = 0; i < (this._touchedCells ? this._touchedCells.length : 0); i++) {
          this.grid[this._touchedCells[i]].length = 0;
        }
        if (this._touchedCells) this._touchedCells.length = 0; else this._touchedCells = [];
      }
      var grid = this.grid;

      // Assign particles to grid cells
      for (i = 0; i < numParticles; i++) {
        var particle = particles[i];

        var gridX = Math.floor(particle.x / gridCellSize);
        var gridY = Math.floor(particle.y / gridCellSize);

        gridX = Math.min(Math.max(gridX, 0), gridWidth - 1);
        gridY = Math.min(Math.max(gridY, 0), gridHeight - 1);

        var cellIndex = gridX + gridY * gridWidth;
        if (grid[cellIndex].length === 0) this._touchedCells.push(cellIndex);
        grid[cellIndex].push(particle);
      }

      var interactionDistanceSq = options.particleInteractionDistance * options.particleInteractionDistance;
      var lineConnectionDistanceSq = options.lineConnectionDistance * options.lineConnectionDistance;
      var maxColorChangeDistanceSq = options.maxColorChangeDistance * options.maxColorChangeDistance;

      var maxOffset = Math.ceil(options.lineConnectionDistance / gridCellSize);

      // Update line hues if cycling (and precompute RGB once per frame)
      if (options.lineColorCycling) {
        var minDifference = 50;
        var cyclingSpeed = options.lineCyclingSpeed;

        this.lineHue1 = (this.lineHue1 + cyclingSpeed) % 360;
        this.lineHue2 = (this.lineHue2 + cyclingSpeed) % 360;

        var diff = Math.abs(this.lineHue1 - this.lineHue2);
        diff = diff > 180 ? 360 - diff : diff;
        if (diff < minDifference) {
          var adjustment = (minDifference - diff) * 0.1;
          this.lineHue2 = (this.lineHue2 + adjustment) % 360;
        }

        this.currentLineColor1 = "hsl(" + this.lineHue1 + ", 100%, 50%)";
        this.currentLineColor2 = "hsl(" + this.lineHue2 + ", 100%, 50%)";
        if (window.ColorUtils && window.ColorUtils.hslToRgb) {
          var c1 = window.ColorUtils.hslToRgb(this.lineHue1, 100, 50);
          var c2 = window.ColorUtils.hslToRgb(this.lineHue2, 100, 50);
          this.currentLineColor1Rgb = [c1.r, c1.g, c1.b];
          this.currentLineColor2Rgb = [c2.r, c2.g, c2.b];
        }
      } else {
        this.currentLineColor1 = options.gradientColor1;
        this.currentLineColor2 = options.gradientColor2;
        if (window.ColorUtils && window.ColorUtils.hexToRgb) {
          var r1o = window.ColorUtils.hexToRgb(this.currentLineColor1);
          var r2o = window.ColorUtils.hexToRgb(this.currentLineColor2);
          this.currentLineColor1Rgb = r1o ? [r1o.r, r1o.g, r1o.b] : [255, 255, 255];
          this.currentLineColor2Rgb = r2o ? [r2o.r, r2o.g, r2o.b] : [255, 255, 255];
        } else {
          // Fallback: parse assuming #rrggbb
          var p1 = parseInt((this.currentLineColor1 || '#ffffff').slice(1), 16);
          var p2 = parseInt((this.currentLineColor2 || '#ffffff').slice(1), 16);
          this.currentLineColor1Rgb = [(p1>>16)&255, (p1>>8)&255, p1&255];
          this.currentLineColor2Rgb = [(p2>>16)&255, (p2>>8)&255, p2&255];
        }
      }

      // Process interactions
      for (var x = 0; x < gridWidth; x++) {
        for (var y = 0; y < gridHeight; y++) {
          var cellIndex = x + y * gridWidth;
          var cellParticles = grid[cellIndex];
          var numCellParticles = cellParticles.length;

          for (var m = 0; m < numCellParticles; m++) {
            var particleA = cellParticles[m];

            // Draw particle (prefer GL point rendering if available)
            if (this.glRenderer && this.glRenderer.addPoint) {
              // Use precomputed RGB if available; alpha from options.opacity
              var rgb;
              if (particleA.particleColor && particleA.particleColor[0] === '#') {
                if (window.ColorUtils && window.ColorUtils.hexToRgb) {
                  var rr = window.ColorUtils.hexToRgb(particleA.particleColor);
                  if (rr) rgb = [rr.r/255, rr.g/255, rr.b/255, this.options.opacity];
                }
                if (!rgb) {
                  var val = parseInt((particleA.particleColor || '#ffffff').slice(1), 16);
                  rgb = [((val>>16)&255)/255, ((val>>8)&255)/255, (val&255)/255, this.options.opacity];
                }
              } else if (this.currentLineColor1Rgb) {
                rgb = [this.currentLineColor1Rgb[0]/255, this.currentLineColor1Rgb[1]/255, this.currentLineColor1Rgb[2]/255, this.options.opacity];
              } else {
                rgb = [1,1,1,this.options.opacity];
              }
              this.glRenderer.addPoint(particleA.x, particleA.y, rgb, particleA.size || this.options.particleSize);
            } else {
              particleA.h(); // 2D fallback draw
            }

            // Interactions within the same cell
            for (var n = m + 1; n < numCellParticles; n++) {
              var particleB = cellParticles[n];
              interactParticles(this, particleA, particleB);
            }

            // Interactions with neighboring cells
            for (var offsetX = -1; offsetX <= 1; offsetX++) {
              var neighborX = x + offsetX;
              if (neighborX < 0 || neighborX >= gridWidth) continue;

              for (var offsetY = -1; offsetY <= 1; offsetY++) {
                var neighborY = y + offsetY;
                if (neighborY < 0 || neighborY >= gridHeight) continue;
                if (offsetX === 0 && offsetY === 0) continue;

                var neighborIndex = neighborX + neighborY * gridWidth;
                var neighborParticles = grid[neighborIndex];
                var numNeighborParticles = neighborParticles.length;

              for (var k = 0; k < numNeighborParticles; k++) {
                  var particleB = neighborParticles[k];
                  if (particleA.index < particleB.index) {
                    interactParticles(this, particleA, particleB);
                  }
                }
              }
            }
          }
        }
      }

      // Flush GL frame if available
      if (this.glRenderer && this.glRenderer.endFrame) {
        this.glRenderer.endFrame();
      }

      if (options.velocity !== 0) {
        requestAnimationFrame(this.update);
      }

      // Update performance monitor if available
      if (this.performanceMonitor) {
        this.performanceMonitor.update();
      }
    }),
    (b.prototype.adjustParticleCount = function (increase) {
      // SoA-aware particle count change
      var currentCount = this.numParticles|0;
      var target = increase ? currentCount * 2 : Math.floor(currentCount / 2);
      target = Math.max(0, target);
      var newObjects = new Array(target);
      var copyCount = Math.min(currentCount, target);
      for (var i = 0; i < copyCount; i++) newObjects[i] = this.o[i];
      for (var a = copyCount; a < target; a++) {
        var np = new c(this);
        np.index = a;
        newObjects[a] = np;
      }
      this.o = newObjects;
      // Re-init SoA and grid
      this._initSoAFromObjects(target);
      this.initGrid();
      if (this.performanceMonitor && this.performanceMonitor.setParticleCount) {
        this.performanceMonitor.setParticleCount(this.numParticles);
      }
    }),
    (b.prototype.setVelocity = function (a) {
      return "fast" === a ? 1 : "slow" === a ? 0.33 : "none" === a ? 0 : 0.66;
    }),
    (b.prototype.j = function (a) {
      return "high" === a ? 5e3 : "low" === a ? 2e4 : isNaN(parseInt(a, 10)) ? 1e4 : a;
    }),
    (b.prototype.l = function (a, b) {
      for (var c in b) a.style[c] = b[c];
    }),
    // Initialize Structure-of-Arrays buffers from current object particles (excluding interactive pointer)
    (b.prototype._initSoAFromObjects = function(count) {
      this.numParticles = count|0;
      var n = this.numParticles;
      this.posX = new Float32Array(n);
      this.posY = new Float32Array(n);
      this.velX = new Float32Array(n);
      this.velY = new Float32Array(n);
      this.sizeA = new Float32Array(n);
      for (var i = 0; i < n; i++) {
        var p = this.o[i];
        this.posX[i] = p.x;
        this.posY[i] = p.y;
        this.velX[i] = p.velocity.x;
        this.velY[i] = p.velocity.y;
        this.sizeA[i] = p.size || this.options.particleSize;
      }
    }),
    // Update SoA physics for all particles
    (b.prototype._updateSoA = function() {
      var n = this.numParticles|0;
      var ax = this.attractionForce ? this.attractionForce.x : 0;
      var ay = this.attractionForce ? this.attractionForce.y : 0;
      var rx = this.repulsionForce ? this.repulsionForce.x : 0;
      var ry = this.repulsionForce ? this.repulsionForce.y : 0;
      var hasA = !!this.attractionForce;
      var hasR = !!this.repulsionForce;
      var repR = this.options.repulsionRange;
      var repI = this.options.repulsionIntensity;
      var attR = this.options.attractionRange;
      var attI = this.options.attractionIntensity;
      var speed = this.options.velocity;
      var speedRecoveryRate = 0.01;
      var width = this.canvas.width;
      var height = this.canvas.height;
      for (var i = 0; i < n; i++) {
        var x = this.posX[i];
        var y = this.posY[i];
        var vx = this.velX[i];
        var vy = this.velY[i];
        if (this.options.interactive && hasA) {
          var dxA = ax - x; var dyA = ay - y;
          var dA = Math.sqrt(dxA*dxA + dyA*dyA); if (dA < 50) dA = 50;
          var fxA = dxA / dA; var fyA = dyA / dA;
          var fA = (-100 / (dA*dA)) * attR * attI;
          vx += fA * fxA; vy += fA * fyA;
        }
        if (this.options.interactive && hasR) {
          var dxR = rx - x; var dyR = ry - y;
          var dR = Math.sqrt(dxR*dxR + dyR*dyR); if (dR < 50) dR = 50;
          var fxR = dxR / dR; var fyR = dyR / dR;
          var fR = (100 / (dR*dR)) * repR * repI;
          vx += fR * fxR; vy += fR * fyR;
        }
        var currS = Math.sqrt(vx*vx + vy*vy);
        if (currS < speed) { vx *= 1 + speedRecoveryRate; vy *= 1 + speedRecoveryRate; }
        else if (currS > speed) { vx *= 1 - speedRecoveryRate; vy *= 1 - speedRecoveryRate; }
        x += vx; y += vy;
        // boundary bounce
        if (this.options.boundaryMode === 'wrap') {
          var sz = this.sizeA[i];
          if (x > width + sz) x = -sz; else if (x < -sz) x = width + sz;
          if (y > height + sz) y = -sz; else if (y < -sz) y = height + sz;
        } else if (this.options.boundaryMode === 'bounce') {
          var s = this.sizeA[i];
          if (x + s > width) { x = width - s; vx = -Math.abs(vx); }
          else if (x - s < 0) { x = s; vx = Math.abs(vx); }
          if (y + s > height) { y = height - s; vy = -Math.abs(vy); }
          else if (y - s < 0) { y = s; vy = Math.abs(vy); }
        }
        if (isNaN(vx) || isNaN(vy)) { vx = 0; vy = 0; }
        this.posX[i] = x; this.posY[i] = y; this.velX[i] = vx; this.velY[i] = vy;
      }
    }),
    // Sync object array from SoA for rendering and grid assignment
    (b.prototype._syncObjectsFromSoA = function() {
      var n = this.numParticles|0;
      for (var i = 0; i < n; i++) {
        var p = this.o[i];
        p.x = this.posX[i];
        p.y = this.posY[i];
        p.velocity.x = this.velX[i];
        p.velocity.y = this.velY[i];
        p.size = this.sizeA[i];
      }
    }),
    b
  );

  function interactParticles(network, particleA, particleB) {
    var options = network.options;
    var dx = particleA.x - particleB.x;
    var dy = particleA.y - particleB.y;
    var distanceSq = dx * dx + dy * dy;

    if (distanceSq < 0.0001) return;

    if (distanceSq < options.particleInteractionDistance * options.particleInteractionDistance) {
      var distance = Math.sqrt(distanceSq);
      applyParticleInteraction(
        [particleA, particleB],
        (particleA.x + particleB.x) / 2,
        (particleA.y + particleB.y) / 2,
        options.particleInteractionDistance,
        options.particleRepulsionForce
      );
    }

    if (distanceSq > options.maxColorChangeDistance * options.maxColorChangeDistance) return;

    if (distanceSq <= options.lineConnectionDistance * options.lineConnectionDistance) {
      var distance = Math.sqrt(distanceSq);
      var g = network.g;
      var gradient = null;
      var glColor1 = null;
      var glColor2 = null;
      var alphaFactor = (options.lineConnectionDistance - distance) / options.lineConnectionDistance;

      function hexToRgb01(hex){
        var bigint = parseInt(hex.slice(1), 16);
        return [((bigint>>16)&255)/255, ((bigint>>8)&255)/255, (bigint&255)/255, alphaFactor];
      }
      function hslToRgb01(h) {
        var c = 1; // s=1,l=0.5
        var x = 1 - Math.abs(((h/60) % 2) - 1);
        var r=0,g=0,b=0;
        if (0 <= h && h < 60) { r = c; g = x; b = 0; }
        else if (60 <= h && h < 120) { r = x; g = c; b = 0; }
        else if (120 <= h && h < 180) { r = 0; g = c; b = x; }
        else if (180 <= h && h < 240) { r = 0; g = x; b = c; }
        else if (240 <= h && h < 300) { r = x; g = 0; b = c; }
        else { r = c; g = 0; b = x; }
        return [r, g, b, alphaFactor];
      }
      function extractHue(hslStr) {
        var m = /hsl\((\d+),/i.exec(hslStr);
        return m ? parseFloat(m[1]) : 0;
      }

      if (options.useDistanceEffect) {
        var colorFactor = Math.min(distance / options.maxColorChangeDistance, 1);
        var interpolatedColor = interpolateColor(network.startColorRgb, network.endColorRgb, colorFactor);
        var colorString = rgbToString(interpolatedColor);
        if (network.glRenderer && network.glRenderer.addLine) {
          var n = interpolatedColor;
          var c = [n[0]/255, n[1]/255, n[2]/255, alphaFactor];
          glColor1 = c; glColor2 = c;
        } else {
          gradient = g.createLinearGradient(particleA.x, particleA.y, particleB.x, particleB.y);
          gradient.addColorStop(0, colorString);
          gradient.addColorStop(1, colorString);
        }
      } else if (options.lineColorCycling && options.gradientEffect) {
        if (network.glRenderer && network.glRenderer.addLine) {
          var h1 = extractHue(network.currentLineColor1);
          var h2 = extractHue(network.currentLineColor2);
          glColor1 = hslToRgb01(h1);
          glColor2 = hslToRgb01(h2);
        } else {
          gradient = g.createLinearGradient(particleA.x, particleA.y, particleB.x, particleB.y);
          gradient.addColorStop(0, network.currentLineColor1);
          gradient.addColorStop(1, network.currentLineColor2);
        }
      } else if (options.lineColorCycling) {
        if (network.glRenderer && network.glRenderer.addLine) {
          var h = extractHue(network.currentLineColor1);
          var csol = hslToRgb01(h);
          glColor1 = csol; glColor2 = csol;
        } else {
          gradient = network.cachedGradient1;
          if (!gradient) {
            gradient = g.createLinearGradient(0, 0, 0, 0);
            gradient.addColorStop(0, network.currentLineColor1);
            gradient.addColorStop(1, network.currentLineColor1);
            network.cachedGradient1 = gradient;
          }
        }
      } else if (options.gradientEffect) {
        if (network.glRenderer && network.glRenderer.addLine) {
          glColor1 = hexToRgb01(options.gradientColor1);
          glColor2 = hexToRgb01(options.gradientColor2);
        } else {
          gradient = g.createLinearGradient(particleA.x, particleA.y, particleB.x, particleB.y);
          gradient.addColorStop(0, options.gradientColor1);
          gradient.addColorStop(1, options.gradientColor2);
        }
      } else {
        if (network.glRenderer && network.glRenderer.addLine) {
          var cflat = hexToRgb01(options.gradientColor1);
          glColor1 = cflat; glColor2 = cflat;
        } else {
          gradient = network.cachedGradient2;
          if (!gradient) {
            gradient = g.createLinearGradient(0, 0, 0, 0);
            gradient.addColorStop(0, options.gradientColor1);
            gradient.addColorStop(1, options.gradientColor1);
            network.cachedGradient2 = gradient;
          }
        }
      }

      if (options.interactive && network.p) {
        var dX = network.p.x - particleA.x;
        var dY = network.p.y - particleA.y;
        var dSq = dX * dX + dY * dY;
        var d = Math.sqrt(dSq);
        if (d < options.proximityEffectDistance) {
          if (network.glRenderer && network.glRenderer.addLine) {
            // override start color with proximity color
            var prox = hexToRgb01(options.proximityEffectColor || '#ff0000');
            glColor1 = prox;
          } else {
            gradient = g.createLinearGradient(particleA.x, particleA.y, particleB.x, particleB.y);
            gradient.addColorStop(0, options.proximityEffectColor);
            if (options.useDistanceEffect) {
              gradient.addColorStop(1, colorString);
            } else if (options.lineColorCycling && options.gradientEffect) {
              gradient.addColorStop(1, network.currentLineColor2);
            } else if (options.lineColorCycling) {
              gradient.addColorStop(1, network.currentLineColor1);
            } else if (options.gradientEffect) {
              gradient.addColorStop(1, options.gradientColor2);
            } else {
              gradient.addColorStop(1, options.gradientColor1);
            }
          }
        }
      }

      if (network.glRenderer && network.glRenderer.addLine && glColor1 && glColor2) {
        network.glRenderer.addLine(
          particleA.x, particleA.y, glColor1,
          particleB.x, particleB.y, glColor2
        );
      } else {
        g.beginPath();
        g.strokeStyle = gradient;
        g.globalAlpha = alphaFactor;
        g.lineWidth = 1.2;
        g.moveTo(particleA.x, particleA.y);
        g.lineTo(particleB.x, particleB.y);
        g.stroke();
      }
    }
    if (isNaN(particleA.velocity.x) || isNaN(particleA.velocity.y)) {
      console.warn("particleA velocity is NaN. Resetting to zero.");
      particleA.velocity.x = 0;
      particleA.velocity.y = 0;
    }

    if (isNaN(particleB.velocity.x) || isNaN(particleB.velocity.y)) {
      console.warn("particleB velocity is NaN. Resetting to zero.");
      particleB.velocity.x = 0;
      particleB.velocity.y = 0;
    }
  }

  // Remove internal PerformanceMonitor - we'll only use the external one from PerformanceMonitor.js

});

// Usage example with explicit PerformanceMonitor module
var options = {
  performanceOverlay: false, // Disable by default, let user toggle with 'P' key
  // Background options
  background: "#000000",

  // Particle options
  particleColor: "#888",
  particleSize: 2,
  particleColorCycling: false,
  particleCyclingSpeed: 0.001,
  randomParticleColor: false,
  randomIndividualParticleColor: false,

  // Line options
  gradientEffect: true,
  gradientColor1: "#ecf00c",
  gradientColor2: "#e00000",
  lineColorCycling: true,
  lineCyclingSpeed: 0.5,

  // Interaction options
  interactive: true,
  proximityEffectColor: "#0080ff",
  proximityEffectDistance: 125,
  attractionRange: 5,
  attractionIntensity: 5,
  repulsionRange: 5,
  repulsionIntensity: 5,

  // Velocity and density options
  speed: "1",
  density: "5000",

  // Color effect options
  opacity: 0.7,
  useDistanceEffect: false,
  maxColorChangeDistance: 120,
  startColor: "#0BDA51",
  endColor: "#BF00FF",

  // Explosion options
  particleInteractionDistance: 1,
  particleRepulsionForce: 3,

  lineConnectionDistance: 120,
};

// Restore the auto-initialization to keep mouse interaction working
var canvasDiv = document.getElementById("particle-canvas");
var particleCanvas = new ParticleNetwork(canvasDiv, options);

// Export the instance for external access
window.particleInstance = particleCanvas;
