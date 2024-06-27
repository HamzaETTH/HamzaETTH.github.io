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

    if (this.options.randomIndividualParticleColor) {
      this.particleColor = `hsl(${Math.random() * 360}, 100%, 50%)`;
    } else if (this.options.randomParticleColor) {
      if (!this.options.calculatedParticleColor) {
        this.options.calculatedParticleColor = `hsl(${Math.random() * 360}, 100%, 50%)`;
      }
      this.particleColor = this.options.calculatedParticleColor;
    } else {
      this.particleColor = this.options.particleColor;
    }
    this.hue = Math.random() * 360;
  };

  c.prototype.update = function (attractiveForce, repulsiveForce, forceDistance, forceStrength) {
    var originalSpeed = this.options.velocity;
    var speedRecoveryRate = 0.01;

    if (this.options.interactive && attractiveForce) {
      var dx = attractiveForce.x - this.x;
      var dy = attractiveForce.y - this.y;
      var distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < 50) distance = 50;
      var forceDirectionX = dx / distance;
      var forceDirectionY = dy / distance;
      var force = (-100 / (distance * distance)) * forceDistance * forceStrength;
      var accelerationX = force * forceDirectionX;
      var accelerationY = force * forceDirectionY;
      this.velocity.x += accelerationX;
      this.velocity.y += accelerationY;
    }

    if (this.options.interactive && repulsiveForce) {
      var dx = repulsiveForce.x - this.x;
      var dy = repulsiveForce.y - this.y;
      var distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < 50) distance = 50;
      var forceDirectionX = dx / distance;
      var forceDirectionY = dy / distance;
      var force = (100 / (distance * distance)) * forceDistance * forceStrength;
      var accelerationX = force * forceDirectionX;
      var accelerationY = force * forceDirectionY;
      this.velocity.x += accelerationX;
      this.velocity.y += accelerationY;
    }

    var currentSpeed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.y * this.velocity.y);
    if (currentSpeed < originalSpeed) {
      this.velocity.x *= 1 + speedRecoveryRate;
      this.velocity.y *= 1 + speedRecoveryRate;
    } else if (currentSpeed > originalSpeed) {
      this.velocity.x *= 1 - speedRecoveryRate;
      this.velocity.y *= 1 - speedRecoveryRate;
    }

    if (this.x > this.canvas.width) {
      this.x = this.canvas.width;
      this.velocity.x = -this.velocity.x;
    } else if (this.x < 0) {
      this.x = 0;
      this.velocity.x = -this.velocity.x;
    }

    if (this.y > this.canvas.height) {
      this.y = this.canvas.height;
      this.velocity.y = -this.velocity.y;
    } else if (this.y < 0) {
      this.y = 0;
      this.velocity.y = -this.velocity.y;
    }

    this.x += this.velocity.x;
    this.y += this.velocity.y;

    if (this.options.particleColorCycling) {
      if (this.options.randomIndividualParticleColor) {
        this.hue += this.options.particleCyclingSpeed;
        if (this.hue >= 360) this.hue -= 360;
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

  var createExplosion = function (particles, centerX, centerY, explosionRadius) {
    particles.forEach(function (particle) {
      var dx = particle.x - centerX;
      var dy = particle.y - centerY;
      var distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < explosionRadius && distance > 0) {
        var forceDirectionX = dx / distance;
        var forceDirectionY = dy / distance;
        var force = (explosionRadius - distance) / explosionRadius;
        var explosionForce = force * 5;
        particle.velocity.x += forceDirectionX * explosionForce;
        particle.velocity.y += forceDirectionY * explosionForce;
      }
    });
  };

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
          particleCyclingSpeed: void 0 !== b.particleCyclingSpeed ? b.particleCyclingSpeed : 0.01, // Adjust the speed
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
          forceDistance: void 0 !== b.forceDistance ? b.forceDistance : 1,
          forceStrength: void 0 !== b.forceStrength ? b.forceStrength : 1,

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
          explosionRadius: void 0 !== b.explosionRadius ? b.explosionRadius : 50,

          // Performance overlay
          performanceOverlay: void 0 !== b.performanceOverlay ? b.performanceOverlay : false,
        }),
        this.init();
    }),
    (b.prototype.init = function () {
      if (
        ((this.k = document.createElement("div")),
        this.i.appendChild(this.k),
        this.l(this.k, { position: "absolute", top: 0, left: 0, bottom: 0, right: 0, "z-index": 1 }),
        /(^#[0-9A-F]{6}$)|(^#[0-9A-F]{3}$)/i.test(this.options.background))
      )
        this.l(this.k, { background: this.options.background });
      else {
        if (!/\.(gif|jpg|jpeg|tiff|png)$/i.test(this.options.background))
          return console.error("Invalid background image or hexadecimal color"), !1;
        this.l(this.k, {
          background: 'url("' + this.options.background + '") no-repeat center',
          "background-size": "cover",
        });
      }
      if (!/(^#[0-9A-F]{6}$)|(^#[0-9A-F]{3}$)/i.test(this.options.particleColor))
        return console.error("Invalid particleColor hexadecimal color"), !1;
      (this.canvas = document.createElement("canvas")),
        this.i.appendChild(this.canvas),
        (this.g = this.canvas.getContext("2d")),
        (this.canvas.width = this.i.size.width),
        (this.canvas.height = this.i.size.height),
        this.l(this.i, { position: "relative" }),
        this.l(this.canvas, { "z-index": "20", position: "relative" }),
        window.addEventListener(
          "resize",
          function () {
            return this.i.offsetWidth === this.i.size.width && this.i.offsetHeight === this.i.size.height
              ? !1
              : ((this.canvas.width = this.i.size.width = this.i.offsetWidth),
                (this.canvas.height = this.i.size.height = this.i.offsetHeight),
                clearTimeout(this.m),
                void (this.m = setTimeout(
                  function () {
                    this.o = [];
                    for (var a = 0; a < (this.canvas.width * this.canvas.height) / this.options.density; a++)
                      this.o.push(new c(this));
                    this.options.interactive && this.o.push(this.p), requestAnimationFrame(this.update.bind(this));
                  }.bind(this),
                  500
                )));
          }.bind(this)
        ),
        (this.o = []);
      for (var a = 0; a < (this.canvas.width * this.canvas.height) / this.options.density; a++)
        this.o.push(new c(this));
      this.options.interactive &&
        ((this.p = new c(this)),
        (this.p.velocity = { x: 0, y: 0 }),
        this.o.push(this.p),
        this.canvas.addEventListener(
          "mousemove",
          function (a) {
            if (this.attractiveForce) {
              this.attractiveForce.x = a.clientX - this.canvas.offsetLeft;
              this.attractiveForce.y = a.clientY - this.canvas.offsetTop;
            }
            if (this.repulsiveForce) {
              this.repulsiveForce.x = a.clientX - this.canvas.offsetLeft;
              this.repulsiveForce.y = a.clientY - this.canvas.offsetTop;
            }
            (this.p.x = a.clientX - this.canvas.offsetLeft), (this.p.y = a.clientY - this.canvas.offsetTop);
          }.bind(this)
        ),
        document.addEventListener("contextmenu", function (a) {
          a.preventDefault();
        }),
        this.canvas.addEventListener(
          "mousedown",
          function (a) {
            if (a.button === 0)
              this.repulsiveForce = { x: a.clientX - this.canvas.offsetLeft, y: a.clientY - this.canvas.offsetTop };
            else if (a.button === 2)
              this.attractiveForce = { x: a.clientX - this.canvas.offsetLeft, y: a.clientX - this.canvas.offsetLeft };
          }.bind(this)
        ),
        this.canvas.addEventListener(
          "mouseup",
          function (a) {
            if (a.button === 0) this.repulsiveForce = null;
            else if (a.button === 2) this.attractiveForce = null;
          }.bind(this)
        )),
        // Performance overlay setup
        this.options.performanceOverlay && this.setupPerformanceOverlay(),
        requestAnimationFrame(this.update.bind(this));
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
        var avgFps = this.fpsHistory.reduce((a, b) => a + b) / this.fpsHistory.length;
        this.performanceDiv.innerHTML = `FPS: ${fps.toFixed(2)}<br>Avg FPS (last 10s): ${avgFps.toFixed(2)}`;
        this.lastFrameTime = now;
        this.frameCount = 0;
      }
    }),
    (b.prototype.update = function () {
      this.g.clearRect(0, 0, this.canvas.width, this.canvas.height), (this.g.globalAlpha = 1);

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

      var startColorRgb = hexToRgb(this.options.startColor);
      var endColorRgb = hexToRgb(this.options.endColor);

      if (this.options.lineColorCycling) {
        this.lineHue1 = (this.lineHue1 || Math.random() * 360) + this.options.lineCyclingSpeed + (Math.random() - 0.5);
        this.lineHue2 = (this.lineHue2 || Math.random() * 360) + this.options.lineCyclingSpeed + (Math.random() - 0.5); // Start lineHue2 with a different value
        if (this.lineHue1 >= 360) this.lineHue1 -= 360;
        if (this.lineHue2 >= 360) this.lineHue2 -= 360;
        var currentLineColor1 = `hsl(${this.lineHue1}, 100%, 50%)`;
        var currentLineColor2 = `hsl(${this.lineHue2}, 100%, 50%)`;
      } else {
        var currentLineColor1 = this.options.gradientColor1;
        var currentLineColor2 = this.options.gradientColor2;
      }

      for (var a = 0; a < this.o.length; a++) {
        this.o[a].update(
          this.attractiveForce,
          this.repulsiveForce,
          this.options.forceDistance,
          this.options.forceStrength
        ),
          this.o[a].h();
        for (var b = this.o.length - 1; b > a; b--) {
          var c = Math.sqrt(Math.pow(this.o[a].x - this.o[b].x, 2) + Math.pow(this.o[a].y - this.o[b].y, 2));
          if (c < this.options.explosionRadius) {
            createExplosion(
              this.o,
              (this.o[a].x + this.o[b].x) / 2,
              (this.o[a].y + this.o[b].y) / 2,
              this.options.explosionRadius
            );
          }
          if (c > this.options.maxColorChangeDistance) continue;
          var gradient = this.g.createLinearGradient(this.o[a].x, this.o[a].y, this.o[b].x, this.o[b].y);
          if (this.options.useDistanceEffect) {
            var colorFactor = Math.min(c / this.options.maxColorChangeDistance, 1);
            var interpolatedColor = interpolateColor(startColorRgb, endColorRgb, colorFactor);
            var colorString = rgbToString(interpolatedColor);
            gradient.addColorStop(0, colorString);
            gradient.addColorStop(1, colorString);
          } else if (this.options.lineColorCycling && this.options.gradientEffect) {
            gradient.addColorStop(0, currentLineColor1);
            gradient.addColorStop(1, currentLineColor2);
          } else if (this.options.lineColorCycling) {
            gradient.addColorStop(0, currentLineColor1);
            gradient.addColorStop(1, currentLineColor1);
          } else if (this.options.gradientEffect) {
            gradient.addColorStop(0, this.options.gradientColor1);
            gradient.addColorStop(1, this.options.gradientColor2);
          } else {
            gradient.addColorStop(0, this.options.gradientColor1);
            gradient.addColorStop(1, this.options.gradientColor1);
          }
          if (this.options.interactive && this.p) {
            var d = Math.sqrt(Math.pow(this.p.x - this.o[a].x, 2) + Math.pow(this.p.y - this.o[a].y, 2));
            if (d < this.options.proximityEffectDistance) {
              gradient = this.g.createLinearGradient(this.o[a].x, this.o[a].y, this.o[b].x, this.o[b].y);
              gradient.addColorStop(0, this.options.proximityEffectColor);
              if (this.options.useDistanceEffect) {
                gradient.addColorStop(1, colorString);
              } else if (this.options.lineColorCycling && this.options.gradientEffect) {
                gradient.addColorStop(1, currentLineColor2);
              } else if (this.options.lineColorCycling) {
                gradient.addColorStop(1, currentLineColor1);
              } else if (this.options.gradientEffect) {
                gradient.addColorStop(1, this.options.gradientColor2);
              } else {
                gradient.addColorStop(1, this.options.gradientColor1);
              }
            }
          }
          this.g.beginPath(),
            (this.g.strokeStyle = gradient),
            (this.g.globalAlpha = (120 - c) / 120),
            (this.g.lineWidth = 1.2),
            this.g.moveTo(this.o[a].x, this.o[a].y),
            this.g.lineTo(this.o[b].x, this.o[b].y),
            this.g.stroke();
        }
      }
      // Update performance overlay
      if (this.options.performanceOverlay) {
        this.updatePerformanceOverlay();
      }
      0 !== this.options.velocity && requestAnimationFrame(this.update.bind(this));
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
});

var canvasDiv = document.getElementById("particle-canvas");
var options = {
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
  forceDistance: 5,
  forceStrength: 5,

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
  explosionRadius: 2,

  // Performance overlay
  performanceOverlay: false,
};

var particleCanvas = new ParticleNetwork(canvasDiv, options);
