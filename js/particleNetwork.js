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
  function hexToRgb(hex) {
    var bigint = parseInt(hex.slice(1), 16);
    return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
  }

  function interpolateColor(startColor, endColor, factor) {
    var result = [];
    for (var i = 0; i < 3; i++) {
      result[i] = Math.round(startColor[i] + factor * (endColor[i] - startColor[i]));
    }
    return result;
  }

  function rgbToString(rgb) {
    return "rgb(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ")";
  }

  function generateRandomColor() {
    return Math.floor(Math.random() * 360);
  }

  function generateDistinctColor(hue1, minDifference) {
    let hue2;
    const range = 360 - 2 * minDifference;
    const randomValue = Math.floor(Math.random() * range);
    hue2 = (hue1 + minDifference + randomValue) % 360;
    return hue2;
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

    // Wrap particles around the edges
    if (this.x > this.canvas.width + this.size) {
      this.x = -this.size;
    } else if (this.x < -this.size) {
      this.x = this.canvas.width + this.size;
    }

    if (this.y > this.canvas.height + this.size) {
      this.y = -this.size;
    } else if (this.y < -this.size) {
      this.y = this.canvas.height + this.size;
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
        (b = void 0 !== b ? b : {}),
        (this.options = {
          // Background options
          background: void 0 !== b.background ? b.background : "#000000",

          // Particle options
          particleColor: void 0 !== b.particleColor ? b.particleColor : "#fff",
          particleSize: void 0 !== b.particleSize ? b.particleSize : 2,
          particleColorCycling: void 0 !== b.particleColorCycling ? b.particleColorCycling : false,
          particleCyclingSpeed: void 0 !== b.particleCyclingSpeed ? b.particleCyclingSpeed : 0.01,
          randomParticleColor: void 0 !== b.randomParticleColor ? b.randomParticleColor : false,
          randomIndividualParticleColor:
            void 0 !== b.randomIndividualParticleColor ? b.randomIndividualParticleColor : false,

          // Line options
          gradientEffect: void 0 !== b.gradientEffect ? b.gradientEffect : true,
          gradientColor1: void 0 !== b.gradientColor1 ? b.gradientColor1 : "#00bfff",
          gradientColor2: void 0 !== b.gradientColor2 ? b.gradientColor2 : "#ff4500",
          lineColorCycling: void 0 !== b.lineColorCycling ? b.lineColorCycling : true,
          lineCyclingSpeed: void 0 !== b.lineCyclingSpeed ? b.lineCyclingSpeed : 1,

          // Interaction options
          interactive: void 0 !== b.interactive ? b.interactive : true,
          proximityEffectColor: void 0 !== b.proximityEffectColor ? b.proximityEffectColor : "#ff0000",
          proximityEffectDistance: void 0 !== b.proximityEffectDistance ? b.proximityEffectDistance : 100,
          attractionRange: void 0 !== b.attractionRange ? b.attractionRange : 1,
          attractionIntensity: void 0 !== b.attractionIntensity ? b.attractionIntensity : 1,
          repulsionRange: void 0 !== b.repulsionRange ? b.repulsionRange : 1,
          repulsionIntensity: void 0 !== b.repulsionIntensity ? b.repulsionIntensity : 1,

          // Velocity and density options
          velocity: this.setVelocity(b.speed),
          density: this.j(b.density),

          // Color effect options
          opacity: void 0 !== b.opacity ? b.opacity : 0.7,
          useDistanceEffect: void 0 !== b.useDistanceEffect ? b.useDistanceEffect : false,
          maxColorChangeDistance: void 0 !== b.maxColorChangeDistance ? b.maxColorChangeDistance : 120,
          startColor: void 0 !== b.startColor ? b.startColor : "#0BDA51",
          endColor: void 0 !== b.endColor ? b.endColor : "#BF00FF",

          // Explosion options
          particleInteractionDistance: void 0 !== b.particleInteractionDistance ? b.particleInteractionDistance : 50,
          particleRepulsionForce: void 0 !== b.particleRepulsionForce ? b.particleRepulsionForce : 5,

          lineConnectionDistance: void 0 !== b.lineConnectionDistance ? b.lineConnectionDistance : 120,

          // Performance overlay
          performanceOverlay: void 0 !== b.performanceOverlay ? b.performanceOverlay : false,
        }),
        this.init();
    }),
    (b.prototype.init = function () {
      if (
        ((this.k = document.createElement("div")),
        this.i.appendChild(this.k),
        (this.performanceMonitor = new PerformanceMonitor(this.i)),
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

      // Canvas setup
      this.canvas = document.createElement("canvas");
      this.i.appendChild(this.canvas);
      this.g = this.canvas.getContext("2d");
      this.canvas.width = this.i.size.width;
      this.canvas.height = this.i.size.height;
      this.l(this.i, { position: "relative" });
      this.l(this.canvas, { "z-index": "20", position: "relative" });

      // Color setups
      this.startColorRgb = hexToRgb(this.options.startColor);
      this.endColorRgb = hexToRgb(this.options.endColor);
      if (this.options.lineColorCycling) {
        this.lineHue1 = generateRandomColor();
        this.lineHue2 = generateDistinctColor(this.lineHue1, 50);
      }

      // Initialize grid variables
      this.initGrid();

      // Resize event listener
      window.addEventListener(
        "resize",
        function () {
          if (this.i.offsetWidth === this.i.size.width && this.i.offsetHeight === this.i.size.height) {
            return false;
          } else {
            this.canvas.width = this.i.size.width = this.i.offsetWidth;
            this.canvas.height = this.i.size.height = this.i.offsetHeight;
            clearTimeout(this.m);
            this.m = setTimeout(
              function () {
                this.o = [];
                for (var a = 0; a < (this.canvas.width * this.canvas.height) / this.options.density; a++) {
                  var particle = new c(this);
                  particle.index = a;
                  this.o.push(particle);
                }
                if (this.options.interactive) {
                  this.o.push(this.p);
                }
                // Re-initialize the grid on resize
                this.initGrid();
                requestAnimationFrame(this.update);
              }.bind(this),
              500
            );
          }
        }.bind(this)
      );

      // Particle array initialization
      this.o = [];
      for (var a = 0; a < (this.canvas.width * this.canvas.height) / this.options.density; a++) {
        var particle = new c(this);
        particle.index = a;
        this.o.push(particle);
      }

      // Interactive particle setup
      if (this.options.interactive) {
        this.p = new c(this);
        this.p.velocity = { x: 0, y: 0 };
        this.p.index = this.o.length;
        this.o.push(this.p);

        // Mouse events
        this.canvas.addEventListener(
          "mousemove",
          function (a) {
            var rect = this.canvas.getBoundingClientRect();
            var x = (a.clientX - rect.left) * (this.canvas.width / rect.width);
            var y = (a.clientY - rect.top) * (this.canvas.height / rect.height);

            if (this.attractionForce) {
              this.attractionForce.x = x;
              this.attractionForce.y = y;
            }
            if (this.repulsionForce) {
              this.repulsionForce.x = x;
              this.repulsionForce.y = y;
            }
            this.p.x = x;
            this.p.y = y;
          }.bind(this)
        );

        document.addEventListener("contextmenu", function (a) {
          a.preventDefault();
        });

        this.canvas.addEventListener(
          "mousedown",
          function (a) {
            var rect = this.canvas.getBoundingClientRect();
            var x = (a.clientX - rect.left) * (this.canvas.width / rect.width);
            var y = (a.clientY - rect.top) * (this.canvas.height / rect.height);
            if (a.button === 0) {
              this.repulsionForce = { x: x, y: y };
            } else if (a.button === 2) {
              this.attractionForce = { x: x, y: y };
            }
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
      var particles = this.o;
      var numParticles = particles.length;
      var g = this.g;

      g.clearRect(0, 0, this.canvas.width, this.canvas.height);
      g.globalAlpha = 1;

      if (options.performanceOverlay) {
        this.updatePerformanceOverlay();
      }

      // Update particles
      for (var i = 0; i < numParticles; i++) {
        particles[i].update(
          this.attractionForce,
          this.repulsionForce,
          options.attractionRange,
          options.attractionIntensity,
          options.repulsionRange,
          options.repulsionIntensity
        );
      }

      // Build the grid
      var gridCellSize = this.gridCellSize;
      var gridWidth = this.gridWidth;
      var gridHeight = this.gridHeight;
      var gridSize = this.gridSize;

      var grid = new Array(gridSize);
      for (i = 0; i < gridSize; i++) {
        grid[i] = [];
      }

      // Assign particles to grid cells
      for (i = 0; i < numParticles; i++) {
        var particle = particles[i];

        var gridX = Math.floor(particle.x / gridCellSize);
        var gridY = Math.floor(particle.y / gridCellSize);

        gridX = Math.min(Math.max(gridX, 0), gridWidth - 1);
        gridY = Math.min(Math.max(gridY, 0), gridHeight - 1);

        var cellIndex = gridX + gridY * gridWidth;
        grid[cellIndex].push(particle);
      }

      var interactionDistanceSq = options.particleInteractionDistance * options.particleInteractionDistance;
      var lineConnectionDistanceSq = options.lineConnectionDistance * options.lineConnectionDistance;
      var maxColorChangeDistanceSq = options.maxColorChangeDistance * options.maxColorChangeDistance;

      var maxOffset = Math.ceil(options.lineConnectionDistance / gridCellSize);

      // Update line hues if cycling
      if (options.lineColorCycling) {
        var minDifference = 50;
        var cyclingSpeed = options.lineCyclingSpeed;

        // Gradually change hues
        this.lineHue1 = (this.lineHue1 + cyclingSpeed) % 360;
        this.lineHue2 = (this.lineHue2 + cyclingSpeed) % 360;

        // Ensure minimum difference is maintained
        var diff = Math.abs(this.lineHue1 - this.lineHue2);
        diff = diff > 180 ? 360 - diff : diff;

        if (diff < minDifference) {
          // Adjust hue2 gradually
          var adjustment = (minDifference - diff) * 0.1; // Gradual adjustment
          this.lineHue2 = (this.lineHue2 + adjustment) % 360;
        }

        this.currentLineColor1 = "hsl(" + this.lineHue1 + ", 100%, 50%)";
        this.currentLineColor2 = "hsl(" + this.lineHue2 + ", 100%, 50%)";
      } else {
        this.currentLineColor1 = options.gradientColor1;
        this.currentLineColor2 = options.gradientColor2;
      }

      // Process interactions
      for (var x = 0; x < gridWidth; x++) {
        for (var y = 0; y < gridHeight; y++) {
          var cellIndex = x + y * gridWidth;
          var cellParticles = grid[cellIndex];
          var numCellParticles = cellParticles.length;

          for (var m = 0; m < numCellParticles; m++) {
            var particleA = cellParticles[m];

            particleA.h(); // Draw particle

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

      if (options.velocity !== 0) {
        requestAnimationFrame(this.update);
      }
    }),
    (b.prototype.adjustParticleCount = function (increase) {
      if (increase) {
        // Double the number of particles
        var currentCount = this.o.length;
        for (var i = 0; i < currentCount; i++) {
          var particle = new c(this);
          particle.index = this.o.length;
          this.o.push(particle);
        }
      } else {
        // Halve the number of particles
        var halfCount = Math.floor(this.o.length / 2);
        this.o = this.o.slice(0, halfCount);
      }

      // Recalculate indices
      for (var i = 0; i < this.o.length; i++) {
        this.o[i].index = i;
      }

      // Re-initialize the grid with the new particle count
      this.initGrid();
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
      var gradient;

      if (options.useDistanceEffect) {
        var colorFactor = Math.min(distance / options.maxColorChangeDistance, 1);
        var interpolatedColor = interpolateColor(network.startColorRgb, network.endColorRgb, colorFactor);
        var colorString = rgbToString(interpolatedColor);
        gradient = g.createLinearGradient(particleA.x, particleA.y, particleB.x, particleB.y);
        gradient.addColorStop(0, colorString);
        gradient.addColorStop(1, colorString);
      } else if (options.lineColorCycling && options.gradientEffect) {
        gradient = g.createLinearGradient(particleA.x, particleA.y, particleB.x, particleB.y);
        gradient.addColorStop(0, network.currentLineColor1);
        gradient.addColorStop(1, network.currentLineColor2);
      } else if (options.lineColorCycling) {
        gradient = network.cachedGradient1;
        if (!gradient) {
          gradient = g.createLinearGradient(0, 0, 0, 0);
          gradient.addColorStop(0, network.currentLineColor1);
          gradient.addColorStop(1, network.currentLineColor1);
          network.cachedGradient1 = gradient;
        }
      } else if (options.gradientEffect) {
        gradient = g.createLinearGradient(particleA.x, particleA.y, particleB.x, particleB.y);
        gradient.addColorStop(0, options.gradientColor1);
        gradient.addColorStop(1, options.gradientColor2);
      } else {
        gradient = network.cachedGradient2;
        if (!gradient) {
          gradient = g.createLinearGradient(0, 0, 0, 0);
          gradient.addColorStop(0, options.gradientColor1);
          gradient.addColorStop(1, options.gradientColor1);
          network.cachedGradient2 = gradient;
        }
      }

      if (options.interactive && network.p) {
        var dX = network.p.x - particleA.x;
        var dY = network.p.y - particleA.y;
        var dSq = dX * dX + dY * dY;
        var d = Math.sqrt(dSq);
        if (d < options.proximityEffectDistance) {
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
      g.beginPath();
      g.strokeStyle = gradient;
      g.globalAlpha = (options.lineConnectionDistance - distance) / options.lineConnectionDistance;
      g.lineWidth = 1.2;
      g.moveTo(particleA.x, particleA.y);
      g.lineTo(particleB.x, particleB.y);
      g.stroke();
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

  // Include the PerformanceMonitor class within the scope
  function PerformanceMonitor(container) {
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
    container.appendChild(this.performanceDiv);

    this.lastFrameTime = performance.now();
    this.frameCount = 0;
    this.fpsHistory = [];
  }

  PerformanceMonitor.prototype.update = function () {
    var now = performance.now();
    this.frameCount++;
    var delta = now - this.lastFrameTime;
    if (delta >= 1000) {
      var fps = (this.frameCount / delta) * 1000;
      this.fpsHistory.push(fps);
      if (this.fpsHistory.length > 10) this.fpsHistory.shift();
      var avgFps = this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length;
      this.performanceDiv.innerHTML = `FPS: ${fps.toFixed(2)}<br>
            Avg FPS (last 10s): ${avgFps.toFixed(2)}`;
      this.lastFrameTime = now;
      this.frameCount = 0;
    }
  };
});

// Usage example (unchanged)
var canvasDiv = document.getElementById("particle-canvas");
var options = {
  performanceOverlay: false,
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
  repulsionRange: 2,
  repulsionIntensity: 2,

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

var particleCanvas = new ParticleNetwork(canvasDiv, options);
