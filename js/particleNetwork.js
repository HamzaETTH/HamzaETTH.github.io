(function (a) {
  var b =
    ("object" == typeof self && self.self === self && self) ||
    ("object" == typeof global && global.global === global && global);
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
      (this.particleColor = a.options.particleColor),
      (this.x = Math.random() * this.canvas.width),
      (this.y = Math.random() * this.canvas.height),
      (this.velocity = {
        x: (Math.random() - 0.5) * a.options.velocity,
        y: (Math.random() - 0.5) * a.options.velocity,
      }),
      (this.size = a.options.particleSize),
      (this.options = a.options);
  };

  c.prototype.update = function (attractiveForce, repulsiveForce, forceDistance, forceStrength) {
    var originalSpeed = this.options.velocity;
    var speedRecoveryRate = 0.01;

    if (attractiveForce) {
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

    if (repulsiveForce) {
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
  };

  c.prototype.h = function () {
    this.g.beginPath(),
      (this.g.fillStyle = this.particleColor),
      (this.g.globalAlpha = this.options.opacity),
      this.g.arc(this.x, this.y, this.size, 0, 2 * Math.PI),
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
          particleColor: void 0 !== b.particleColor ? b.particleColor : "#fff",
          background: void 0 !== b.background ? b.background : "#000000",
          interactive: void 0 !== b.interactive ? b.interactive : !0,
          velocity: this.setVelocity(b.speed),
          density: this.j(b.density),
          particleSize: void 0 !== b.particleSize ? b.particleSize : 2,
          proximityEffectColor: void 0 !== b.proximityEffectColor ? b.proximityEffectColor : "#ff0000",
          proximityEffectDistance: void 0 !== b.proximityEffectDistance ? b.proximityEffectDistance : 100,
          gradientColor1: void 0 !== b.gradientColor1 ? b.gradientColor1 : "#00bfff",
          gradientColor2: void 0 !== b.gradientColor2 ? b.gradientColor2 : "#ff4500",
          opacity: void 0 !== b.opacity ? b.opacity : 0.7,
          forceDistance: void 0 !== b.forceDistance ? b.forceDistance : 1,
          forceStrength: void 0 !== b.forceStrength ? b.forceStrength : 1,
          useDistanceEffect: void 0 !== b.useDistanceEffect ? b.useDistanceEffect : false,
          maxColorChangeDistance: void 0 !== b.maxColorChangeDistance ? b.maxColorChangeDistance : 120,
          startColor: void 0 !== b.startColor ? b.startColor : "#0BDA51",
          endColor: void 0 !== b.endColor ? b.endColor : "#BF00FF",
          explosionRadius: void 0 !== b.explosionRadius ? b.explosionRadius : 50, // New option for explosion radius
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
              this.attractiveForce = { x: a.clientX - this.canvas.offsetLeft, y: a.clientX - this.canvas.offsetLeft };
            else if (a.button === 2)
              this.repulsiveForce = { x: a.clientX - this.canvas.offsetLeft, y: a.clientY - this.canvas.offsetTop };
          }.bind(this)
        ),
        this.canvas.addEventListener(
          "mouseup",
          function (a) {
            if (a.button === 0) this.attractiveForce = null;
            else if (a.button === 2) this.repulsiveForce = null;
          }.bind(this)
        )),
        requestAnimationFrame(this.update.bind(this));
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
          } else {
            gradient.addColorStop(0, this.options.gradientColor1);
            gradient.addColorStop(1, this.options.gradientColor2);
          }
          if (this.options.interactive && this.p) {
            var d = Math.sqrt(Math.pow(this.p.x - this.o[a].x, 2) + Math.pow(this.p.y - this.o[a].y, 2));
            if (d < this.options.proximityEffectDistance) {
              gradient = this.g.createLinearGradient(this.o[a].x, this.o[a].y, this.o[b].x, this.o[b].y);
              gradient.addColorStop(0, this.options.proximityEffectColor);
              if (this.options.useDistanceEffect) {
                gradient.addColorStop(1, colorString);
              } else {
                gradient.addColorStop(1, this.options.gradientColor2);
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
  particleColor: "#888",
  interactive: true,
  speed: "fast",
  density: "high",
  background: "#000000",
  particleSize: 2,
  proximityEffectColor: "#0080ff",
  proximityEffectDistance: 125,
  gradientColor1: "#ecf00c",
  gradientColor2: "#e00000",
  opacity: 0.7,
  forceDistance: 5,
  forceStrength: 5,
  useDistanceEffect: false,
  maxColorChangeDistance: 120,
  startColor: "#0BDA51",
  endColor: "#BF00FF",
  explosionRadius: 2,
};
var particleCanvas = new ParticleNetwork(canvasDiv, options);
