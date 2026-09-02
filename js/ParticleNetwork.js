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

  var glLineColor1Scratch = new Float32Array(4);
  var glLineColor2Scratch = new Float32Array(4);
  var glSegmentColor1Scratch = new Float32Array(4);
  var glSegmentColor2Scratch = new Float32Array(4);
  function hexToRgb01(hex, target, alphaFactor) {
    if (!hex || typeof hex !== 'string') {
      console.warn('hexToRgb01: invalid hex value:', hex, 'using default #00bfff');
      hex = '#00bfff';
    }
    var normalized = hex.slice(1);
    if (normalized.length === 3) {
      normalized = normalized[0] + normalized[0] +
        normalized[1] + normalized[1] +
        normalized[2] + normalized[2];
    }
    var bigint = parseInt(normalized, 16);
    target[0] = ((bigint >> 16) & 255) / 255;
    target[1] = ((bigint >> 8) & 255) / 255;
    target[2] = (bigint & 255) / 255;
    target[3] = alphaFactor;
    return target;
  }

  function hslToRgb01(h, target, alphaFactor) {
    var x = 1 - Math.abs(((h / 60) % 2) - 1);
    var r = 0, g = 0, b = 0;
    if (0 <= h && h < 60) { r = 1; g = x; }
    else if (60 <= h && h < 120) { r = x; g = 1; }
    else if (120 <= h && h < 180) { g = 1; b = x; }
    else if (180 <= h && h < 240) { g = x; b = 1; }
    else if (240 <= h && h < 300) { r = x; b = 1; }
    else { r = 1; b = x; }
    target[0] = r;
    target[1] = g;
    target[2] = b;
    target[3] = alphaFactor;
    return target;
  }

  function copyRgb01WithAlpha(source, target, alphaFactor) {
    target[0] = source[0];
    target[1] = source[1];
    target[2] = source[2];
    target[3] = alphaFactor;
    return target;
  }

  function prepareFrameLineColors(network) {
    var options = network.options;
    var lineColor1 = network._frameLineColor1 || (network._frameLineColor1 = new Float32Array(4));
    var lineColor2 = network._frameLineColor2 || (network._frameLineColor2 = new Float32Array(4));
    var proximityColor = network._frameProximityColor || (network._frameProximityColor = new Float32Array(4));

    if (options.lineColorCycling) {
      hslToRgb01(Number.isFinite(network.lineHue1) ? network.lineHue1 : 0, lineColor1, 1);
      hslToRgb01(Number.isFinite(network.lineHue2) ? network.lineHue2 : 0, lineColor2, 1);
    } else {
      hexToRgb01(options.gradientColor1, lineColor1, 1);
      hexToRgb01(options.gradientColor2, lineColor2, 1);
    }
    hexToRgb01(options.proximityEffectColor || '#ff0000', proximityColor, 1);
  }

  function prepareFrameParticleColor(network, dt) {
    var options = network.options;
    var particleColor = network._frameParticleColor ||
      (network._frameParticleColor = new Float32Array(4));

    if (options.particleColorCycling) {
      var hueDelta = (options.particleCyclingSpeed * 0.0003) * (dt * 60);
      options.particleHue = (options.particleHue || 0) + hueDelta;
      if (options.particleHue >= 360) options.particleHue -= 360;
      network._frameParticleCssColor = `hsl(${options.particleHue}, 100%, 50%)`;
      hslToRgb01(options.particleHue, particleColor, options.opacity);
    } else {
      network._frameParticleCssColor = options.particleColor;
      hexToRgb01(options.particleColor, particleColor, options.opacity);
    }
  }

  // We'll use the ColorUtils functions if available, otherwise use these
  function generateRandomColor() {
    return Math.floor(Math.random() * 360);
  }

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
    (this.network = a),
      (this.canvas = a.canvas),
      (this.g = a.g),
      (this.x = Math.random() * a.i.size.width),
      (this.y = Math.random() * a.i.size.height),
      (this.velocity = {
        x: (Math.random() - 0.5) * a.options.velocity,
        y: (Math.random() - 0.5) * a.options.velocity,
      }),
      (this.size = a.options.particleSize),
      (this.options = a.options);

      this.hue = generateRandomColor();
      if (!Number.isFinite(this.hue)) this.hue = 0;
      this.particleColor = this.options.particleColor;
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
      // Treat attractionRange as radius in pixels (UI 0..30 -> 0..300px)
      var attractionRadiusPx = (typeof attractionRange === 'number' ? attractionRange : 0) * 10;
      if (attractionRadiusPx > 0 && attractionDistance > attractionRadiusPx) {
        // Outside radius: no attraction effect
      } else {
        var safeAttractDist = Math.max(attractionDistance, 50); // Ensure minimum distance
        var attractionForceDirectionX = attractionDx / (safeAttractDist || 1);
        var attractionForceDirectionY = attractionDy / (safeAttractDist || 1);
        // Use intensity for magnitude; range is spatial radius only
        var attractionforce = (-100 / (safeAttractDist * safeAttractDist)) * attractionIntensity;
        this.velocity.x += attractionforce * attractionForceDirectionX;
        this.velocity.y += attractionforce * attractionForceDirectionY;
      }
    }

    if (this.options.interactive && repulsionForce) {
      var repulsiveDx = repulsionForce.x - this.x;
      var repulsiveDy = repulsionForce.y - this.y;
      var repulsiveDistance = Math.sqrt(repulsiveDx * repulsiveDx + repulsiveDy * repulsiveDy);
      // Treat repulsionRange as radius in pixels (UI 0..30 -> 0..300px)
      var repulsionRadiusPx = (typeof repulsionRange === 'number' ? repulsionRange : 0) * 10;
      if (repulsionRadiusPx > 0 && repulsiveDistance > repulsionRadiusPx) {
        // Outside radius: no repulsion effect
      } else {
        var safeRepulseDist = Math.max(repulsiveDistance, 50); // Ensure minimum distance
        var repulsiveForceDirectionX = repulsiveDx / (safeRepulseDist || 1);
        var repulsiveForceDirectionY = repulsiveDy / (safeRepulseDist || 1);
        // Use intensity for magnitude; range is spatial radius only
        var repulsiveforce = (100 / (safeRepulseDist * safeRepulseDist)) * repulsionIntensity;
        this.velocity.x += repulsiveforce * repulsiveForceDirectionX;
        this.velocity.y += repulsiveforce * repulsiveForceDirectionY;
      }
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
      var dtLocalG = (this.network && typeof this.network._dt === 'number') ? this.network._dt : (1/60);
      var hueDeltaG = (this.options.particleCyclingSpeed * 0.0003) * (dtLocalG * 60);
      this.options.particleHue = (this.options.particleHue || 0) + hueDeltaG;
      if (this.options.particleHue >= 360) this.options.particleHue -= 360;
      this.particleColor = `hsl(${this.options.particleHue}, 100%, 50%)`;
    } else {
      // Hard lock particle color when cycling is OFF, regardless of line cycling
      this.particleColor = this.options.particleColor;
    }
  };

  c.prototype.h = function (frameColor) {
    this.g.beginPath();
    this.g.fillStyle = frameColor || this.particleColor;
    this.g.globalAlpha = this.options.opacity;
    this.g.arc(this.x, this.y, this.size, 0, 2 * Math.PI);
    this.g.fill();
  };

  var applyParticleInteraction = function (
    particleA,
    particleB,
    centerX,
    centerY,
    particleInteractionDistance,
    particleRepulsionForce
  ) {
    var interactionDistanceSq = particleInteractionDistance * particleInteractionDistance;
    for (var i = 0; i < 2; i++) {
      var particle = i === 0 ? particleA : particleB;
      var dx = particle.x - centerX;
      var dy = particle.y - centerY;
      var distanceSq = dx * dx + dy * dy;

      if (distanceSq < interactionDistanceSq && distanceSq > 0) {
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

      this.options = window.ParticleNetworkConfig.createRuntimeConfig(
        b,
        this.setVelocity,
        this.j
      );

      this.gravityWells = [];
      this.selectedGravityWellId = null;
      this.gravityWellDraft = null;
      this._nextGravityWellId = 1;
      this._gravityPointer = null;
      this._gravityPointerId = null;
      this._gravityWellOverlay = null;
      this._middleSpawnActive = false;
      this._middleSpawnPointer = null;
      this._middleSpawnAccumulator = 0;

      this.init();
    }),
    // Compatibility alias for the CSS-logical coordinates used by simulation physics.
    (b.prototype._mapToCanvas = function(evt) {
      return this._mapToLogicalCanvas(evt);
    }),
    // Map DOM client coordinates to CSS-logical simulation coordinates.
    (b.prototype._mapToLogicalCanvas = function(evt) {
      // A pointer event can arrive in the same turn as a window resize. Keep
      // the simulation/canvases current before translating the coordinates.
      if (this._rebuildOnResize && this.i) {
        var currentWidth = this.i.offsetWidth || 0;
        var currentHeight = this.i.offsetHeight || 0;
        var currentDpr = window.devicePixelRatio || 1;
        if ((currentWidth && currentWidth !== this.i.size.width) ||
            (currentHeight && currentHeight !== this.i.size.height) ||
            currentDpr !== this.dpr) {
          this._rebuildOnResize();
        }
      }
      var rect = this.canvas.getBoundingClientRect();
      var width = this.i.size.width;
      var height = this.i.size.height;
      var scaleX = width / (rect.width || width || 1);
      var scaleY = height / (rect.height || height || 1);
      return {
        x: Math.max(0, Math.min(width, (evt.clientX - rect.left) * scaleX)),
        y: Math.max(0, Math.min(height, (evt.clientY - rect.top) * scaleY))
      };
    }),
    (b.prototype._gravityWellDefaults = function(type) {
      var white = type === 'white';
      return {
        radius: this.options.gravityWellRadius || 120,
        strength: this.options.gravityWellStrength || 12,
        innerColor: white ? this.options.whiteHoleInnerColor : this.options.blackHoleInnerColor,
        outerColor: white ? this.options.whiteHoleOuterColor : this.options.blackHoleOuterColor
      };
    }),
    (b.prototype._clampGravityWellRadius = function(radius) {
      var min = this.options.gravityWellMinRadius || 24;
      var max = this.options.gravityWellMaxRadius || 500;
      return Math.max(min, Math.min(max, Number.isFinite(radius) ? radius : this.options.gravityWellRadius || 120));
    }),
    (b.prototype._emitGravityWellsChange = function() {
      var detail = {
        wells: this.gravityWells.map(function(well) { return Object.assign({}, well); }),
        selectedId: this.selectedGravityWellId,
        draft: this.gravityWellDraft ? Object.assign({}, this.gravityWellDraft) : null,
        enabled: this.options.gravityWellsEnabled !== false
      };
      window.dispatchEvent(new CustomEvent('particle-gravity-wells-change', { detail: detail }));
    }),
    (b.prototype._shouldAnimate = function() {
      return !!(this.options && (
        this.options.velocity !== 0 ||
        this._middleSpawnActive ||
        (this.options.gravityWellsEnabled !== false && (this.gravityWells.length > 0 || this.gravityWellDraft))
      ));
    }),
	    (b.prototype._ensureAnimationLoop = function() {
	      if (this._destroyed || this._rafActive || this._rafId != null || typeof this.update !== 'function') return;
	      if (document.hidden) {
	        this._resumeOnVisible = true;
	        return;
	      }
	      this._lastUpdateTime = performance.now();
	      this._rafActive = true;
	      this._rafId = requestAnimationFrame(this.update);
	    }),
	    (b.prototype._clearInteractivePointerForces = function() {
	      this.attractionForce = null;
	      this.repulsionForce = null;
	      if (this._activePointers) this._activePointers.clear();
	    }),
	    (b.prototype.getGravityWell = function(id) {
      for (var i = 0; i < this.gravityWells.length; i++) {
        if (this.gravityWells[i].id === id) return this.gravityWells[i];
      }
      return null;
    }),
    (b.prototype.getSelectedGravityWell = function() {
      return this.getGravityWell(this.selectedGravityWellId);
    }),
    (b.prototype.addGravityWell = function(type, x, y, radius) {
      type = type === 'white' ? 'white' : 'black';
      var defaults = this._gravityWellDefaults(type);
      var well = {
        id: 'gravity-well-' + this._nextGravityWellId++,
        type: type,
        x: Math.max(0, Math.min(this.i.size.width, Number.isFinite(x) ? x : this.i.size.width / 2)),
        y: Math.max(0, Math.min(this.i.size.height, Number.isFinite(y) ? y : this.i.size.height / 2)),
        radius: this._clampGravityWellRadius(radius),
        strength: defaults.strength,
        innerColor: defaults.innerColor,
        outerColor: defaults.outerColor
      };
      this.gravityWells.push(well);
      this.selectedGravityWellId = well.id;
      this.gravityWellDraft = null;
      this._emitGravityWellsChange();
      this._ensureAnimationLoop();
      return well;
    }),
    (b.prototype.selectGravityWell = function(id) {
      this.selectedGravityWellId = this.getGravityWell(id) ? id : null;
      this._emitGravityWellsChange();
      return this.getSelectedGravityWell();
    }),
    (b.prototype.updateGravityWell = function(id, patch) {
      var well = this.getGravityWell(id);
      if (!well || !patch) return null;
      if (Number.isFinite(patch.x)) well.x = Math.max(0, Math.min(this.i.size.width, patch.x));
      if (Number.isFinite(patch.y)) well.y = Math.max(0, Math.min(this.i.size.height, patch.y));
      if (Number.isFinite(patch.radius)) well.radius = this._clampGravityWellRadius(patch.radius);
      if (Number.isFinite(patch.strength)) well.strength = Math.max(0, Math.min(40, patch.strength));
      if (typeof patch.innerColor === 'string') well.innerColor = patch.innerColor;
      if (typeof patch.outerColor === 'string') well.outerColor = patch.outerColor;
      this._emitGravityWellsChange();
      this._ensureAnimationLoop();
      return well;
    }),
    (b.prototype.updateSelectedGravityWell = function(patch) {
      return this.updateGravityWell(this.selectedGravityWellId, patch);
    }),
    (b.prototype.removeGravityWell = function(id) {
      var index = -1;
      for (var i = 0; i < this.gravityWells.length; i++) {
        if (this.gravityWells[i].id === id) { index = i; break; }
      }
      if (index < 0) return false;
      this.gravityWells.splice(index, 1);
      if (this.selectedGravityWellId === id) this.selectedGravityWellId = null;
      if (this.gravityWellDraft && this.gravityWellDraft.editId === id) this.gravityWellDraft = null;
      this._emitGravityWellsChange();
      return true;
    }),
    (b.prototype.removeSelectedGravityWell = function() {
      return this.removeGravityWell(this.selectedGravityWellId);
    }),
    (b.prototype.clearGravityWells = function() {
      this.gravityWells.length = 0;
      this.selectedGravityWellId = null;
      this.gravityWellDraft = null;
      this._gravityPointerId = null;
      this._clearGravityWellOverlay();
      this._emitGravityWellsChange();
    }),
    (b.prototype.setGravityWellsEnabled = function(enabled) {
      this.options.gravityWellsEnabled = !!enabled;
      this._emitGravityWellsChange();
      if (enabled) this._ensureAnimationLoop();
      else this._clearGravityWellOverlay();
    }),
	    (b.prototype.beginGravityWellPlacement = function(type, keyboardPlacement) {
	      type = type === 'white' ? 'white' : 'black';
	      var defaults = this._gravityWellDefaults(type);
	      var pointer = this._gravityPointer || { x: this.i.size.width / 2, y: this.i.size.height / 2 };
	      this._clearInteractivePointerForces();
	      this.options.gravityWellsEnabled = true;
	      this.selectedGravityWellId = null;
      this.gravityWellDraft = {
        type: type,
        x: keyboardPlacement ? pointer.x : null,
        y: keyboardPlacement ? pointer.y : null,
        radius: defaults.radius,
        strength: defaults.strength,
        innerColor: defaults.innerColor,
        outerColor: defaults.outerColor,
        phase: keyboardPlacement ? 'sizing' : 'awaiting',
        dragging: false,
        editId: null
      };
      this._emitGravityWellsChange();
      this._ensureAnimationLoop();
      return this.gravityWellDraft;
    }),
    (b.prototype.beginSelectedGravityWellPlacement = function() {
      var selected = this.getSelectedGravityWell();
      if (!selected) return null;
      this.gravityWellDraft = Object.assign({}, selected, {
        phase: 'awaiting',
        dragging: false,
        editId: selected.id
      });
      delete this.gravityWellDraft.id;
      this._emitGravityWellsChange();
      this._ensureAnimationLoop();
      return this.gravityWellDraft;
    }),
    (b.prototype.cancelGravityWellPlacement = function() {
      if (this.gravityWellDraft) {
        this.gravityWellDraft = null;
        this._gravityPointerId = null;
        this._emitGravityWellsChange();
        return true;
      }
      if (this.selectedGravityWellId) {
        this.selectedGravityWellId = null;
        this._emitGravityWellsChange();
        return true;
      }
      return false;
    }),
    (b.prototype._commitGravityWellPlacement = function() {
      var draft = this.gravityWellDraft;
      if (!draft || !Number.isFinite(draft.x) || !Number.isFinite(draft.y)) return null;
      this.gravityWellDraft = null;
      this._gravityPointerId = null;
      if (draft.editId) {
        this.selectedGravityWellId = draft.editId;
        return this.updateGravityWell(draft.editId, draft);
      }
      var well = this.addGravityWell(draft.type, draft.x, draft.y, draft.radius);
      well.strength = draft.strength;
      well.innerColor = draft.innerColor;
      well.outerColor = draft.outerColor;
      this._emitGravityWellsChange();
      return well;
    }),
    (b.prototype._hitTestGravityWell = function(x, y) {
      if (this.options.gravityWellsEnabled === false) return null;
      for (var i = this.gravityWells.length - 1; i >= 0; i--) {
        var well = this.gravityWells[i];
        var dx = x - well.x;
        var dy = y - well.y;
        var coreRadius = Math.max(10, well.radius * 0.18);
        if (dx * dx + dy * dy <= coreRadius * coreRadius) return well;
      }
      return null;
    }),
    (b.prototype._hitTestGravityWellVisual = function(x, y) {
      if (this.options.gravityWellsEnabled === false) return null;
      for (var i = this.gravityWells.length - 1; i >= 0; i--) {
        var well = this.gravityWells[i];
        var radius = Math.max(1, well.radius);
        var normalizedX = (x - well.x) / (radius * 1.5);
        var normalizedY = (y - well.y) / (radius * 0.48);
        if (normalizedX * normalizedX + normalizedY * normalizedY <= 1) return well;
      }
      return null;
    }),
    (b.prototype._handleGravityWellPointerMove = function(x, y) {
      this._gravityPointer = { x: x, y: y };
      var draft = this.gravityWellDraft;
      if (!draft || draft.phase !== 'sizing' || !Number.isFinite(draft.x) || !Number.isFinite(draft.y)) return false;
      var dx = x - draft.x;
      var dy = y - draft.y;
      draft.radius = this._clampGravityWellRadius(Math.sqrt(dx * dx + dy * dy));
      this._emitGravityWellsChange();
      return true;
    }),
    (b.prototype._handleGravityWellPointerDown = function(x, y, pointerId) {
      var draft = this.gravityWellDraft;
	      if (draft) {
	        this._clearInteractivePointerForces();
	        if (draft.phase === 'awaiting') {
          draft.x = x;
          draft.y = y;
          draft.radius = this._clampGravityWellRadius(draft.radius);
          draft.phase = 'sizing';
          draft.dragging = true;
          this._gravityPointerId = pointerId;
          this._emitGravityWellsChange();
        } else if (!draft.dragging) {
          this._handleGravityWellPointerMove(x, y);
          this._commitGravityWellPlacement();
        }
        return true;
      }
	      var hit = this._hitTestGravityWell(x, y);
	      if (hit) {
	        this._clearInteractivePointerForces();
	        this.selectedGravityWellId = hit.id;
        this._emitGravityWellsChange();
        return true;
      }
      return false;
    }),
    (b.prototype._handleGravityWellPointerUp = function(x, y, pointerId) {
      var draft = this.gravityWellDraft;
      if (!draft || !draft.dragging || this._gravityPointerId !== pointerId) return false;
      this._handleGravityWellPointerMove(x, y);
      this._commitGravityWellPlacement();
      return true;
    }),
    (b.prototype._getVisibleGravityWells = function() {
      if (this.options.gravityWellsEnabled === false) return [];
      var selectedId = this.selectedGravityWellId;
      var draft = this.gravityWellDraft;
      var visible = [];
      for (var i = 0; i < this.gravityWells.length; i++) {
        var well = this.gravityWells[i];
        if (draft && draft.editId === well.id) continue;
        visible.push(Object.assign({}, well, { selected: well.id === selectedId }));
      }
      if (draft && Number.isFinite(draft.x) && Number.isFinite(draft.y)) {
        visible.push(Object.assign({}, draft, { draft: true, selected: true }));
      }
      return visible;
    }),
    (b.prototype._prepareGravityWellFrame = function() {
      this._frameGravityWells = this._getVisibleGravityWells();
      var reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      if (this.glRenderer && this.glRenderer.setGravityWells) {
        this.glRenderer.setGravityWells(this._frameGravityWells, {
          reducedMotion: reducedMotion,
          trails: !!this.options.trails
        });
      }
      if (!this._frameGravityWells.length) this._clearGravityWellOverlay();
    }),
    (b.prototype._ensureGravityWellOverlay = function() {
      if (!this._gravityWellOverlay) {
        var canvas = document.createElement('canvas');
        canvas.className = 'gravity-well-overlay';
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.zIndex = '21';
        canvas.style.pointerEvents = 'none';
        this.i.appendChild(canvas);
        this._gravityWellOverlay = canvas;
        this._gravityWellOverlayContext = canvas.getContext('2d');
      }
      var dpr = window.devicePixelRatio || 1;
      var width = this.i.size.width;
      var height = this.i.size.height;
      var backingWidth = Math.max(1, Math.floor(width * dpr));
      var backingHeight = Math.max(1, Math.floor(height * dpr));
      var overlay = this._gravityWellOverlay;
      if (overlay.width !== backingWidth || overlay.height !== backingHeight) {
        overlay.width = backingWidth;
        overlay.height = backingHeight;
        overlay.style.width = width + 'px';
        overlay.style.height = height + 'px';
      }
      overlay.style.display = 'block';
      var context = this._gravityWellOverlayContext;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      return context;
    }),
    (b.prototype._clearGravityWellOverlay = function() {
      if (!this._gravityWellOverlay || !this._gravityWellOverlayContext || !this.i) return;
      var dpr = window.devicePixelRatio || 1;
      this._gravityWellOverlayContext.setTransform(dpr, 0, 0, dpr, 0, 0);
      this._gravityWellOverlayContext.clearRect(0, 0, this.i.size.width, this.i.size.height);
      this._gravityWellOverlay.style.display = 'none';
    }),
    (b.prototype._drawGravityWellFallback = function(wells) {
      var context = this._ensureGravityWellOverlay();
      for (var i = 0; i < wells.length; i++) {
        var well = wells[i];
        var radius = well.radius;
        context.save();
        context.translate(well.x, well.y);
        context.scale(1, 0.24);
        context.globalCompositeOperation = 'lighter';
        var disc = context.createRadialGradient(0, 0, radius * 0.18, 0, 0, radius * 1.35);
        disc.addColorStop(0, well.innerColor);
        disc.addColorStop(0.42, well.innerColor);
        disc.addColorStop(0.72, well.outerColor);
        disc.addColorStop(1, 'rgba(0,0,0,0)');
        context.strokeStyle = disc;
        context.lineWidth = Math.max(8, radius * 0.18);
        context.beginPath();
        context.arc(0, 0, radius * 0.78, 0, Math.PI * 2);
        context.stroke();
        context.restore();

        context.save();
        context.globalCompositeOperation = 'source-over';
        var coreRadius = radius * 0.18;
        if (well.type === 'white') {
          var coreGlow = context.createRadialGradient(well.x, well.y, 0, well.x, well.y, coreRadius * 1.8);
          coreGlow.addColorStop(0, '#ffffff');
          coreGlow.addColorStop(0.55, well.innerColor);
          coreGlow.addColorStop(1, 'rgba(223,252,255,0)');
          context.fillStyle = coreGlow;
        } else {
          context.fillStyle = '#000000';
        }
        context.beginPath();
        context.arc(well.x, well.y, well.type === 'white' ? coreRadius * 1.8 : coreRadius, 0, Math.PI * 2);
        context.fill();
        if (well.selected || well.draft) {
          context.globalCompositeOperation = 'lighter';
          context.globalAlpha = 0.2;
          var selectionAura = context.createRadialGradient(
            well.x, well.y, coreRadius * 0.9,
            well.x, well.y, radius * 1.5
          );
          selectionAura.addColorStop(0, 'rgba(0,0,0,0)');
          selectionAura.addColorStop(0.38, well.innerColor);
          selectionAura.addColorStop(0.72, well.outerColor);
          selectionAura.addColorStop(1, 'rgba(0,0,0,0)');
          context.fillStyle = selectionAura;
          context.beginPath();
          context.arc(well.x, well.y, radius * 1.5, 0, Math.PI * 2);
          context.fill();
        }
        context.restore();
      }
    }),
    (b.prototype._finishGravityWellFrame = function() {
      var wells = this._frameGravityWells || [];
      if (!wells.length) {
        this._clearGravityWellOverlay();
        return;
      }
      var renderer = this.glRenderer;
      var webglRendered = !!(renderer && renderer.gl && renderer.gravityWellRenderer &&
        !renderer.gravityWellCompositionFailed && !renderer.gravityWellRenderer.failed);
      if (webglRendered && this.options.trails) {
        var context = this._ensureGravityWellOverlay();
        context.drawImage(
          renderer.canvas,
          0, 0, renderer.canvas.width, renderer.canvas.height,
          0, 0, this.i.size.width, this.i.size.height
        );
      } else if (!webglRendered) {
        this._drawGravityWellFallback(wells);
      } else {
        this._clearGravityWellOverlay();
      }
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
      this.l(this.canvas, { "z-index": "20", position: "absolute", top: 0, left: 0 });
      // CSS size
      this.canvas.style.width = this.i.size.width + 'px';
      this.canvas.style.height = this.i.size.height + 'px';
      // Backing store size
      this.canvas.width = Math.max(1, Math.floor(this.i.size.width * this.dpr));
      this.canvas.height = Math.max(1, Math.floor(this.i.size.height * this.dpr));
      // Scale so drawing uses CSS pixels
      this.g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

      // Ensure this canvas sits above GL lines canvas (which uses zIndex 19)
      // so particles (and trail effect) render on top
      this.canvas.style.position = 'absolute';
      this.canvas.style.top = '0';
      this.canvas.style.left = '0';
      this.canvas.style.zIndex = '20';

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

        // Guards: ensure valid numeric line hues
        if (!Number.isFinite(this.lineHue1)) this.lineHue1 = 0;
        if (!Number.isFinite(this.lineHue2)) this.lineHue2 = (this.lineHue1 + 180) % 360;

        // Store initial offset between hues to keep a consistent separation while cycling
        this._lineHue2Offset = ((this.lineHue2 - this.lineHue1) + 360) % 360;
      }

      // Method to regenerate line colors when differentiation method changes
      this.regenerateLineColors = function() {
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

          // Guards: ensure valid numeric line hues
          if (!Number.isFinite(this.lineHue1)) this.lineHue1 = 0;
          if (!Number.isFinite(this.lineHue2)) this.lineHue2 = (this.lineHue1 + 180) % 360;

          // Store initial offset between hues to keep a consistent separation while cycling
          this._lineHue2Offset = ((this.lineHue2 - this.lineHue1) + 360) % 360;
        }
      };

      // Initialize grid variables
      this.initGrid();

      // Try WebGL line renderer (keeps gradients at scale) under the 2D particles
      if (window.ParticleNetworkRendererGL) {
        try {
          this.glRenderer = new window.ParticleNetworkRendererGL(this.i, { zIndex: 19 });
          // Ensure initial size
          if (this.glRenderer && this.glRenderer.resize) {
            this.glRenderer.resize(this.i.size.width, this.i.size.height);
          }
        } catch (e) {
          this.glRenderer = null;
          console.warn('GL renderer init failed:', e);
        }
      }

      // Resize event listener
      // Unified resize helper
      this._rebuildOnResize = function() {
        // Read CSS size
        const w = this.i.offsetWidth || 0;
        const h = this.i.offsetHeight || 0;
        // If layout not settled, retry shortly
        if (!w || !h) {
          clearTimeout(this.m);
          this.m = setTimeout(this._rebuildOnResize, 100);
          return;
        }

        const nextDpr = window.devicePixelRatio || 1;
        if (w === this.i.size.width && h === this.i.size.height && nextDpr === this.dpr) {
          return;
        }

        // Update container size
        this.i.size.width = w;
        this.i.size.height = h;

        // Update DPR-aware canvas sizing
        this.dpr = nextDpr;
        this.canvas.style.width = w + 'px';
        this.canvas.style.height = h + 'px';
        this.canvas.width = Math.max(1, Math.floor(w * this.dpr));
        this.canvas.height = Math.max(1, Math.floor(h * this.dpr));
        this.g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

        // Rebuild particles (use CSS logical dimensions)
        this.o = [];
        var logicalArea = w * h;
        for (var a = 0; a < logicalArea / this.options.density; a++) {
          var particle = new c(this);
          particle.index = a;
          this.o.push(particle);
        }
        this._initSoAFromObjects(this.o.length);
        if (this.performanceMonitor && this.performanceMonitor.setParticleCount) {
          this.performanceMonitor.setParticleCount(this.numParticles);
        }
        if (this.options.interactive && this.p) {
          this.p.index = this.o.length;
          this.o.push(this.p);
        }

        // Re-init grid
        this.initGrid();

        // Resize GL with CSS size (not DPR-scaled backing store)
        if (this.glRenderer && this.glRenderer.resize) {
          this.glRenderer.resize(w, h);
        }

        if (!this._rafActive) {
          this._rafActive = true;
          this._rafId = requestAnimationFrame(this.update);
        }
      }.bind(this);

      if (typeof ResizeObserver !== 'undefined') {
        this._resizeObserver = new ResizeObserver(function() {
          if (!this._destroyed && this._rebuildOnResize) this._rebuildOnResize();
        }.bind(this));
        this._resizeObserver.observe(this.i);
      }

      window.addEventListener(
        "resize",
        function () {
          clearTimeout(this.m);
          this._rebuildOnResize();
          // Some layout changes settle just after the resize event. The
          // leading sync fixes interaction immediately; this trailing sync
          // catches the final container dimensions without a 500 ms gap.
          this.m = setTimeout(this._rebuildOnResize, 100);
        }.bind(this)
      );

      // Particle array initialization (use logical dimensions, not DPR-scaled)
      this.o = [];
      var initialLogicalArea = this.i.size.width * this.i.size.height;
      for (var a = 0; a < initialLogicalArea / this.options.density; a++) {
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
        var updateMousePosition = function (a) {
            var pos = this._mapToCanvas(a);
            var x = pos.x, y = pos.y;
            if (this.attractionForce) { this.attractionForce.x = x; this.attractionForce.y = y; }
            if (this.repulsionForce) { this.repulsionForce.x = x; this.repulsionForce.y = y; }
            this.p.x = x; this.p.y = y;
            // If hold-to-gather active, keep repulsion-based gather locked to pointer (repulsionForce is attractive here)
            if (this._gatherActive) {
              if (!this.repulsionForce) this.repulsionForce = { x: x, y: y };
              this.repulsionForce.x = x; this.repulsionForce.y = y;
            }
            if (this._middleSpawnActive) {
              if ((a.buttons & 4) === 0) this._stopMiddleMouseSpawn();
              else this._middleSpawnPointer = { x: x, y: y };
            }
          }.bind(this);

        this.canvas.addEventListener("mousemove", updateMousePosition);
        window.addEventListener("mousemove", function(a) {
          if (!this.repulsionForce && !this.attractionForce && !this._middleSpawnActive) return;
          updateMousePosition(a);
        }.bind(this));

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
            else if (a.button === 1) {
              this._startMiddleMouseSpawn(x, y);
              a.preventDefault();
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
            } else if (a.button === 1) {
              this._stopMiddleMouseSpawn();
              a.preventDefault();
            }
          }.bind(this)
        );

        this.canvas.addEventListener('auxclick', function(a) {
          if (a.button === 1) a.preventDefault();
        });
        this.canvas.addEventListener('mouseleave', function() {
          this._stopMiddleMouseSpawn();
        }.bind(this));
        document.addEventListener('mouseup', function(a) {
          if (a.button === 0) this.repulsionForce = null;
          else if (a.button === 2) this.attractionForce = null;
          else if (a.button === 1) this._stopMiddleMouseSpawn();
        }.bind(this));
        window.addEventListener('blur', function() {
          this._stopMiddleMouseSpawn();
          this._clearInteractivePointerForces();
        }.bind(this));
        document.addEventListener('visibilitychange', function() {
          if (document.hidden) {
            this._stopMiddleMouseSpawn();
            this._clearInteractivePointerForces();
          }
        }.bind(this));

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

      // Gravity-well placement and core selection take precedence over normal forces.
      this.canvas.addEventListener('mousemove', function(evt) {
        var pos = this._mapToLogicalCanvas(evt);
        this._handleGravityWellPointerMove(pos.x, pos.y);
      }.bind(this), true);

      this.canvas.addEventListener('mousedown', function(evt) {
        if (evt.button === 1) return;
        var pos = this._mapToLogicalCanvas(evt);
        if (!this._handleGravityWellPointerDown(pos.x, pos.y, 'mouse')) return;
        evt.preventDefault();
        evt.stopImmediatePropagation();
      }.bind(this), true);

      this.canvas.addEventListener('mouseup', function(evt) {
        if (evt.button === 1) return;
        var pos = this._mapToLogicalCanvas(evt);
        if (!this._handleGravityWellPointerUp(pos.x, pos.y, 'mouse')) return;
        evt.preventDefault();
        evt.stopImmediatePropagation();
      }.bind(this), true);

      this.canvas.addEventListener('pointerdown', function(evt) {
        if (evt.pointerType !== 'touch' && evt.pointerType !== 'pen') return;
        var pos = this._mapToLogicalCanvas(evt);
        this._gravityPointer = pos;
        if (!this._handleGravityWellPointerDown(pos.x, pos.y, evt.pointerId)) return;
        try { this.canvas.setPointerCapture && this.canvas.setPointerCapture(evt.pointerId); } catch (_) {}
        evt.preventDefault();
        evt.stopImmediatePropagation();
      }.bind(this), { capture: true, passive: false });

      this.canvas.addEventListener('pointermove', function(evt) {
        if (evt.pointerType !== 'touch' && evt.pointerType !== 'pen') return;
        var pos = this._mapToLogicalCanvas(evt);
        var handled = this._handleGravityWellPointerMove(pos.x, pos.y);
        if (!handled) return;
        evt.preventDefault();
        evt.stopImmediatePropagation();
      }.bind(this), { capture: true, passive: false });

      this.canvas.addEventListener('pointerup', function(evt) {
        if (evt.pointerType !== 'touch' && evt.pointerType !== 'pen') return;
        var pos = this._mapToLogicalCanvas(evt);
        if (!this._handleGravityWellPointerUp(pos.x, pos.y, evt.pointerId)) return;
        evt.preventDefault();
        evt.stopImmediatePropagation();
      }.bind(this), { capture: true, passive: false });

      this.canvas.addEventListener('pointercancel', function(evt) {
        if (this._gravityPointerId !== evt.pointerId) return;
        this.cancelGravityWellPlacement();
      }.bind(this), true);

      // RAF control flags
      this._rafActive = false;
      this._rafId = null;
      // Force test flags
      this.forceHueSweep = false;
      this._forceHue = 0;

      // **Event listeners for particle count adjustment**
      this.canvas.addEventListener(
        "wheel",
        function (event) {
          var position = this._mapToLogicalCanvas(event);
          var hoveredWell = this._hitTestGravityWellVisual(position.x, position.y);
          if (hoveredWell) {
            this.selectedGravityWellId = hoveredWell.id;
            this.updateGravityWell(hoveredWell.id, {
              strength: hoveredWell.strength + (event.deltaY < 0 ? 1 : -1)
            });
            event.preventDefault();
            return;
          }
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
          } else if (event.key === 'f' || event.key === 'F') {
            this.forceHueSweep = !this.forceHueSweep;
            if (!this._forceHue) this._forceHue = 0;
            console.warn('[PN] Force hue sweep:', this.forceHueSweep ? 'ON' : 'OFF');
          } else if (event.key === 'a' || event.key === 'A') {
            // Hold-to-gather: while A is held, attract particles to pointer (use repulsionForce, which is attractive in this codebase)
            this._gatherActive = true;
            if (this.p && Number.isFinite(this.p.x) && Number.isFinite(this.p.y)) {
              if (!this.repulsionForce) this.repulsionForce = { x: this.p.x, y: this.p.y };
              this.repulsionForce.x = this.p.x; this.repulsionForce.y = this.p.y;

              // Teleport all particles to the cursor immediately, then let attraction keep them there
              var tx = this.p.x, ty = this.p.y;
              var nTP = this.numParticles|0;
              if (nTP > 0) {
                // Spread within a small disc to avoid overlap
                var radius = Math.max(0, (this.options && this.options.gatherRadius) ? this.options.gatherRadius : 24);
                // Golden angle for even-ish distribution
                var golden = 2.399963229728653; // ~137.5 deg
                for (var ii = 0; ii < nTP; ii++) {
                  var ang = ii * golden;
                  // Fibonacci-ish radial spread within [0, radius]
                  var r = radius * Math.sqrt((ii + 1) / (nTP + 1));
                  var gx = tx + Math.cos(ang) * r;
                  var gy = ty + Math.sin(ang) * r;
                  this.posX[ii] = gx; this.posY[ii] = gy;
                  this.velX[ii] = 0; this.velY[ii] = 0;
                }
                // Sync objects immediately for visual effect this frame
                for (var jj = 0; jj < this.o.length; jj++) {
                  var op = this.o[jj];
                  var ang2 = jj * golden;
                  var r2 = radius * Math.sqrt((jj + 1) / (nTP + 1));
                  op.x = tx + Math.cos(ang2) * r2;
                  op.y = ty + Math.sin(ang2) * r2;
                  if (op.velocity) { op.velocity.x = 0; op.velocity.y = 0; }
                }
                // No need to re-init SoA sizes; we only changed positions/velocities
              }
            }
            // small toast on engage
            try {
              if (!this._gatherToastShown) {
                this._gatherToastShown = true;
                var toast = document.createElement('div');
               toast.textContent = 'Attract: HOLD A';
                toast.style.cssText = "position:fixed; top:10px; right:10px; background:rgba(0,0,0,0.7); color:#fff; padding:8px 12px; border-radius:4px; font-family:'Fira Code',monospace; z-index:4000;";
                document.body.appendChild(toast);
                setTimeout(function(){ if (toast.parentNode) document.body.removeChild(toast); }, 800);
                setTimeout(function(){ this._gatherToastShown = false; }.bind(this), 1200);
              }
            } catch(e) {}
          }
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            if (this.performanceMonitor && this.performanceMonitor.setParticleCount) {
              this.performanceMonitor.setParticleCount(this.o.length);
            }
          }
        }.bind(this)
      );

      // Keyup to end gather
      document.addEventListener('keyup', function(event){
        if (event.key === 'a' || event.key === 'A') {
          this._gatherActive = false;
          // Clear our repulsion-driven gather unless the user is still holding left mouse (handled by mousedown elsewhere)
          if (!(this._activePointers && this._activePointers.size > 0)) {
            this.repulsionForce = null;
          }
        }
      }.bind(this));

      // Bind update function once and start loop if not already active
      this.update = this.update.bind(this);
      // Initialize timebase for dt-based animations
      this._lastUpdateTime = performance.now();
      this._debugNextLogTime = this._lastUpdateTime + 1000; // 1s throttle for debug logs
      if (!this._rafActive) {
        this._rafActive = true;
        this._rafId = requestAnimationFrame(this.update);
      }
    }),
      // Initialize grid dimensions and variables
    (b.prototype.initGrid = function () {
      this.gridCellSize = Math.max(
        this.options.particleInteractionDistance,
        this.options.lineConnectionDistance,
        this.options.maxColorChangeDistance,
        this.options.proximityEffectDistance
      );

      this.gridWidth = Math.ceil(this.i.size.width / this.gridCellSize);
      this.gridHeight = Math.ceil(this.i.size.height / this.gridCellSize);
      this.gridSize = this.gridWidth * this.gridHeight;
    }),
    (b.prototype.setupPerformanceOverlay = function () { /* no-op */ }),
    (b.prototype.updatePerformanceOverlay = function () { /* no-op */ }),
    (b.prototype.update = function () {
      var options = this.options;
      // Compute dt in seconds, clamp to avoid huge jumps on tab re-activation
      var now = performance.now();
      var dt = Math.min(Math.max((now - (this._lastUpdateTime || now)) / 1000, 0), 0.1);
      this._lastUpdateTime = now;
      this._dt = dt;
      this._emitMiddleMouseParticles(dt);
      // Update motion using SoA for performance, then sync back to objects for rendering/grid
      if (this.numParticles > 0) {
        this._updateSoA();
        this._syncObjectsFromSoA();
      }
      var particles = this.o;
      var numParticles = particles.length;
      var g = this.g;
      var i;

      // Clear or fade the canvas for trails
      if (this.options.trails) {
        // Fill with a translucent background to gradually fade previous frame
        var fade = (typeof this.options.trailFade === 'number') ? this.options.trailFade : 0.08;
        // Choose fade color based on configured background if it's a color; otherwise use black
        var bg = this.options.background || '#000000';
        var fillStyle = 'rgba(0,0,0,' + fade + ')';
        if (typeof bg === 'string') {
          var mHex = /^#([0-9a-f]{6})$/i.exec(bg) || /^#([0-9a-f]{3})$/i.exec(bg);
          var mRgb = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(bg);
          if (mRgb) {
            fillStyle = 'rgba(' + mRgb[1] + ',' + mRgb[2] + ',' + mRgb[3] + ',' + fade + ')';
          } else if (mHex) {
            // Expand short hex
            var hex = mHex[1];
            if (hex.length === 3) hex = hex.split('').map(function(c){return c+c;}).join('');
            var val = parseInt(hex, 16);
            var r = (val >> 16) & 255, gg = (val >> 8) & 255, bb = val & 255;
            fillStyle = 'rgba(' + r + ',' + gg + ',' + bb + ',' + fade + ')';
          }
        }
        g.globalAlpha = 1;
        g.fillStyle = fillStyle;
        g.fillRect(0, 0, this.i.size.width, this.i.size.height);
        g.globalAlpha = 1;
      } else {
        // Standard clear when trails disabled
        g.clearRect(0, 0, this.i.size.width, this.i.size.height);
        g.globalAlpha = 1;
      }

      this._prepareGravityWellFrame();

      // Begin GL frame if available
      if (this.glRenderer && this.glRenderer.beginFrame) {
        if (this.glRenderer.dpr !== (window.devicePixelRatio || 1)) {
          this.glRenderer.resize(this.i.size.width, this.i.size.height);
        }
        this.glRenderer.beginFrame();
      }

      prepareFrameParticleColor(this, dt);

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
        // Map UI range 0..100 to degrees per 60fps frame using 0.01 factor, then scale by dt
        var hueDelta = (cyclingSpeed * 0.01) * (dt * 60);
        // Very slow drift of the hue separation between ends (deg/sec)
        if (!Number.isFinite(this._lineOffsetDriftRateDegPerSec)) this._lineOffsetDriftRateDegPerSec = 0.1; // ~6 deg/min
        if (!Number.isFinite(this._lineHue2Offset)) this._lineHue2Offset = 180;
        this._lineHue2Offset = (this._lineHue2Offset + this._lineOffsetDriftRateDegPerSec * dt) % 360;
        // Keep offset within allowed bounds so ends are never too close
        if (this._lineHue2Offset < minDifference) this._lineHue2Offset = minDifference;
        if (this._lineHue2Offset > 360 - minDifference) this._lineHue2Offset = 360 - minDifference;
        if (this.forceHueSweep) {
          this._forceHue = (this._forceHue + 120 * dt) % 360; // 120 deg/sec sweep
          this.lineHue1 = this._forceHue;
          this.lineHue2 = (this._forceHue + 180) % 360;
        } else {

        // Guards: ensure valid numeric hues before math
        if (!Number.isFinite(this.lineHue1)) this.lineHue1 = 0;
        if (!Number.isFinite(this.lineHue2)) this.lineHue2 = (this.lineHue1 + 180) % 360;

          this.lineHue1 = (this.lineHue1 + hueDelta) % 360;
          // Maintain (slowly drifting) offset so both ends advance at same rate
          this.lineHue2 = (this.lineHue1 + this._lineHue2Offset) % 360;
        }

        // Ensure minimum separation (should already be true due to clamped offset)

        this.currentLineColor1 = "hsl(" + this.lineHue1 + ", 100%, 50%)";
        this.currentLineColor2 = "hsl(" + this.lineHue2 + ", 100%, 50%)";
        // Debug throttle (once per ~1s)
        if (now >= (this._debugNextLogTime || 0)) {
          // console.debug('[PN] GL?', !!(this.glRenderer && this.glRenderer.addLine), 'hues', this.lineHue1.toFixed(1), this.lineHue2.toFixed(1), 'speed', cyclingSpeed, 'dt', dt.toFixed(3));
          this._debugNextLogTime = now + 1000;
        }
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

      // Update distance-effect randomized colors once per frame (not per connection)
      if (options.useDistanceEffect && options.randomizeDistanceColors) {
        var uiSpeedDist = (options.distanceColorCyclingSpeed != null
          ? options.distanceColorCyclingSpeed
          : (options.lineCyclingSpeed || 50)); // Default to lineCyclingSpeed
        var distHueDelta = (uiSpeedDist * 0.01) * (dt * 60);
        if (!Number.isFinite(this._distanceHue)) this._distanceHue = 0;
        this._distanceHue = (this._distanceHue + distHueDelta) % 360;
        var hueAFrame = this._distanceHue;
        var hueBFrame = (this._distanceHue + 180) % 360;
        if (window.ColorUtils && window.ColorUtils.hslToRgb) {
          var scf = window.ColorUtils.hslToRgb(hueAFrame, 100, 50);
          var ecf = window.ColorUtils.hslToRgb(hueBFrame, 100, 50);
          this.startColorRgb = [scf.r, scf.g, scf.b];
          this.endColorRgb = [ecf.r, ecf.g, ecf.b];
        } else {
          // Fallback to red/blue if ColorUtils is not available
          this.startColorRgb = [255, 0, 0];
          this.endColorRgb = [0, 0, 255];
        }
      }

      if (this.glRenderer && this.glRenderer.addLine) {
        prepareFrameLineColors(this);
      }

      // Process interactions
      for (var x = 0; x < gridWidth; x++) {
        for (var y = 0; y < gridHeight; y++) {
          var cellIndex = x + y * gridWidth;
          var cellParticles = grid[cellIndex];
          var numCellParticles = cellParticles.length;

          for (var m = 0; m < numCellParticles; m++) {
            var particleA = cellParticles[m];

            // Draw particle
            // When trails are enabled, render particles on 2D canvas to accumulate trails
            if (!this.options.trails && this.glRenderer && this.glRenderer.addPoint) {
              this.glRenderer.addPoint(
                particleA.x,
                particleA.y,
                this._frameParticleColor,
                particleA.size || options.particleSize
              );
            } else {
              particleA.h(this._frameParticleCssColor); // 2D fallback draw
            }

            // Interactions within the same cell
            for (var n = m + 1; n < numCellParticles; n++) {
              var particleB = cellParticles[n];
              interactParticles(this, particleA, particleB);
            }

            // Interactions with neighboring cells
            for (var offsetX = 0; offsetX <= 1; offsetX++) {
              var neighborX = x + offsetX;
              if (neighborX >= gridWidth) continue;

              var firstOffsetY = offsetX === 0 ? 1 : -1;
              for (var offsetY = firstOffsetY; offsetY <= 1; offsetY++) {
                var neighborY = y + offsetY;
                if (neighborY < 0 || neighborY >= gridHeight) continue;

                var neighborIndex = neighborX + neighborY * gridWidth;
                var neighborParticles = grid[neighborIndex];
                var numNeighborParticles = neighborParticles.length;

                for (var k = 0; k < numNeighborParticles; k++) {
                  var particleB = neighborParticles[k];
                  interactParticles(this, particleA, particleB);
                }
              }
            }
          }
        }
      }

      // Optional simple particle collisions (elastic bounce)
      if (options.particleCollision) {
        var radius = (this.options.particleSize || 2);
        var rad2 = radius + radius;
        var rad2Sq = rad2 * rad2;
        for (var gx = 0; gx < gridWidth; gx++) {
          for (var gy = 0; gy < gridHeight; gy++) {
            var ci = gx + gy * gridWidth;
            var arr = grid[ci];
            var len = arr.length;
            for (var a = 0; a < len; a++) {
              var pa = arr[a];
              for (var b = a + 1; b < len; b++) {
                var pb = arr[b];
                var dx = pb.x - pa.x;
                var dy = pb.y - pa.y;
                var d2 = dx*dx + dy*dy;
                if (d2 > 0 && d2 <= rad2Sq) {
                  var d = Math.sqrt(d2) || 1e-6;
                  var nx = dx / d;
                  var ny = dy / d;
                  // separate overlap
                  var overlap = rad2 - d;
                  var half = overlap * 0.5;
                  pa.x -= nx * half; pa.y -= ny * half;
                  pb.x += nx * half; pb.y += ny * half;
                  // reflect velocities along normal (equal mass)
                  var rvx = pb.velocity.x - pa.velocity.x;
                  var rvy = pb.velocity.y - pa.velocity.y;
                  var vn = rvx * nx + rvy * ny;
                  if (vn < 0) {
                    var imp = -vn; // coefficient of restitution = 1
                    pa.velocity.x -= imp * nx;
                    pa.velocity.y -= imp * ny;
                    pb.velocity.x += imp * nx;
                    pb.velocity.y += imp * ny;
                  }
                }
              }
            }
          }
        }
      }

      // After interactions, persist object velocities back into SoA for next frame
      if (this.numParticles > 0 && this.velX && this.velY) {
        var nnSync = this.numParticles | 0;
        for (var vi = 0; vi < nnSync; vi++) {
          var vpo = particles[vi];
          if (vpo && vpo.velocity) {
            this.velX[vi] = vpo.velocity.x;
            this.velY[vi] = vpo.velocity.y;
          }
        }
      }

      // Flush GL frame if available
      if (this.glRenderer && this.glRenderer.endFrame) {
        this.glRenderer.endFrame();
      }

      this._finishGravityWellFrame();

      if (this._shouldAnimate()) {
        // Keep RAF ID and active flag consistent
        this._rafActive = true;
        this._rafId = requestAnimationFrame(this.update);
      } else {
        // Stop loop when velocity is zero; allow manual restart later
        this._rafActive = false;
        this._rafId = null;
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
    (b.prototype._ensureParticleCapacity = function(required) {
      var currentCapacity = this.posX ? this.posX.length : 0;
      if (currentCapacity >= required) return;
      var capacity = Math.max(required, 64, Math.ceil(currentCapacity * 1.5));
      var nextPosX = new Float32Array(capacity);
      var nextPosY = new Float32Array(capacity);
      var nextVelX = new Float32Array(capacity);
      var nextVelY = new Float32Array(capacity);
      var nextSizeA = new Float32Array(capacity);
      if (this.posX) nextPosX.set(this.posX.subarray(0, this.numParticles));
      if (this.posY) nextPosY.set(this.posY.subarray(0, this.numParticles));
      if (this.velX) nextVelX.set(this.velX.subarray(0, this.numParticles));
      if (this.velY) nextVelY.set(this.velY.subarray(0, this.numParticles));
      if (this.sizeA) nextSizeA.set(this.sizeA.subarray(0, this.numParticles));
      this.posX = nextPosX;
      this.posY = nextPosY;
      this.velX = nextVelX;
      this.velY = nextVelY;
      this.sizeA = nextSizeA;
    }),
    (b.prototype._spawnParticlesAt = function(x, y, count) {
      count = Math.max(0, count | 0);
      if (!count || !this.o || !this.i) return 0;
      x = Math.max(0, Math.min(this.i.size.width, Number.isFinite(x) ? x : this.i.size.width * 0.5));
      y = Math.max(0, Math.min(this.i.size.height, Number.isFinite(y) ? y : this.i.size.height * 0.5));
      var start = this.numParticles | 0;
      var target = start + count;
      this._ensureParticleCapacity(target);
      var spawned = new Array(count);
      var baseSpeed = Math.max(0.25, Math.abs(this.options.velocity || 0));
      for (var i = 0; i < count; i++) {
        var particle = new c(this);
        var angle = Math.random() * Math.PI * 2;
        var spread = Math.random() * 3;
        var speed = baseSpeed * (0.45 + Math.random() * 0.75);
        var index = start + i;
        particle.index = index;
        particle.x = x + Math.cos(angle) * spread;
        particle.y = y + Math.sin(angle) * spread;
        particle.velocity.x = Math.cos(angle) * speed;
        particle.velocity.y = Math.sin(angle) * speed;
        spawned[i] = particle;
        this.posX[index] = particle.x;
        this.posY[index] = particle.y;
        this.velX[index] = particle.velocity.x;
        this.velY[index] = particle.velocity.y;
        this.sizeA[index] = particle.size;
      }
      if (this.p && this.o[start] === this.p) {
        Array.prototype.splice.apply(this.o, [start, 0].concat(spawned));
      } else {
        Array.prototype.push.apply(this.o, spawned);
      }
      this.numParticles = target;
      if (this.p) this.p.index = target;
      if (this.performanceMonitor && this.performanceMonitor.setParticleCount) {
        this.performanceMonitor.setParticleCount(target);
      }
      return count;
    }),
    (b.prototype._startMiddleMouseSpawn = function(x, y) {
      this._middleSpawnActive = true;
      this._middleSpawnPointer = { x: x, y: y };
      this._middleSpawnAccumulator = 0;
      this._spawnParticlesAt(x, y, 1);
      this._ensureAnimationLoop();
    }),
    (b.prototype._stopMiddleMouseSpawn = function() {
      this._middleSpawnActive = false;
      this._middleSpawnPointer = null;
      this._middleSpawnAccumulator = 0;
    }),
    (b.prototype._emitMiddleMouseParticles = function(dt) {
      if (!this._middleSpawnActive || !this._middleSpawnPointer) return 0;
      this._middleSpawnAccumulator += Math.max(0, Number.isFinite(dt) ? dt : 0) * 60;
      var count = Math.min(8, Math.floor(this._middleSpawnAccumulator));
      if (count <= 0) return 0;
      this._middleSpawnAccumulator -= count;
      return this._spawnParticlesAt(this._middleSpawnPointer.x, this._middleSpawnPointer.y, count);
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
      var width = this.i.size.width;
      var height = this.i.size.height;
      var gravityWells = this.options.gravityWellsEnabled !== false ? this.gravityWells : [];
      for (var i = 0; i < n; i++) {
        var x = this.posX[i];
        var y = this.posY[i];
        var vx = this.velX[i];
        var vy = this.velY[i];
        var gravityRespawned = false;
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
        if (gravityWells.length) {
          var gravityX = 0;
          var gravityY = 0;
	          for (var wi = 0; wi < gravityWells.length; wi++) {
	            var gravityWell = gravityWells[wi];
	            var wellX = Number.isFinite(gravityWell.x) ? gravityWell.x : width * 0.5;
	            var wellY = Number.isFinite(gravityWell.y) ? gravityWell.y : height * 0.5;
	            var wellRadius = Math.max(1, Number.isFinite(gravityWell.radius) ? gravityWell.radius : 120);
	            var wellStrength = Math.max(0, Number.isFinite(gravityWell.strength) ? gravityWell.strength : 0);
	            var gravityDx = wellX - x;
	            var gravityDy = wellY - y;
	            var gravityDistanceSq = gravityDx * gravityDx + gravityDy * gravityDy;
	            var swallowRadius = wellRadius * 0.18;

	            if (gravityWell.type === 'black' && gravityDistanceSq <= swallowRadius * swallowRadius) {
              var edge = Math.floor(Math.random() * 4);
              if (edge === 0) { x = 0; y = Math.random() * height; }
              else if (edge === 1) { x = width; y = Math.random() * height; }
              else if (edge === 2) { x = Math.random() * width; y = 0; }
              else { x = Math.random() * width; y = height; }
              var respawnSpeed = Math.max(Math.abs(speed), 0.25);
              vx = (Math.random() - 0.5) * respawnSpeed;
              vy = (Math.random() - 0.5) * respawnSpeed;
              gravityRespawned = true;
	              gravityDx = wellX - x;
	              gravityDy = wellY - y;
	              gravityDistanceSq = gravityDx * gravityDx + gravityDy * gravityDy;
	            }

	            var gravityDistance = Math.sqrt(gravityDistanceSq);
	            if (gravityDistance < 0.0001) continue;
	            var softenedRadius = Math.max(12, wellRadius * 0.12);
	            var softenedSq = gravityDistanceSq + softenedRadius * softenedRadius;
	            var gravityMagnitude = wellStrength * wellRadius * wellRadius / softenedSq * 0.012;
            var gravitySign = gravityWell.type === 'white' ? -1 : 1;
            var gravityUnitX = gravityDx / gravityDistance;
            var gravityUnitY = gravityDy / gravityDistance;
            gravityX += (gravityUnitX * gravitySign - gravityUnitY * gravitySign * 0.2) * gravityMagnitude;
            gravityY += (gravityUnitY * gravitySign + gravityUnitX * gravitySign * 0.2) * gravityMagnitude;
          }
          var gravityAcceleration = Math.sqrt(gravityX * gravityX + gravityY * gravityY);
          var maxGravityAcceleration = 1.5;
          if (gravityAcceleration > maxGravityAcceleration) {
            gravityX *= maxGravityAcceleration / gravityAcceleration;
            gravityY *= maxGravityAcceleration / gravityAcceleration;
          }
          vx += gravityX;
          vy += gravityY;
        }
        // Curved drift motion: apply perpendicular bias to velocity
        if (this.options.curvedDrift) {
          // Pseudo-random but temporal: use particle index + time
          var t = (this._lastUpdateTime || 0) * 0.001 * this.options.curvedDriftNoiseSpeed; // seconds
          var phase = i * 12.9898 + t * 6.283185307179586; // 2π per second scaled
          var s = Math.sin(phase);
          // Perpendicular normalized direction to current velocity (fallback when near zero)
          var m = Math.sqrt(vx*vx + vy*vy) || 1e-6;
          var pxn = -vy / m;
          var pyn =  vx / m;
          // ORIGINAL behavior: curvature as fraction of speed without clamping/renorm
          var k = this.options.curvedDriftCurvature; // fraction of speed
          vx += pxn * (k * m * s);
          vy += pyn * (k * m * s);
        }

        var currS = Math.sqrt(vx*vx + vy*vy);
        if (currS < speed) { vx *= 1 + speedRecoveryRate; vy *= 1 + speedRecoveryRate; }
        else if (currS > speed) { vx *= 1 - speedRecoveryRate; vy *= 1 - speedRecoveryRate; }
        if (!gravityRespawned) { x += vx; y += vy; }
        // boundary bounce
        if (!gravityRespawned && this.options.boundaryMode === 'wrap') {
          var sz = this.sizeA[i];
          if (x > width + sz) x = -sz; else if (x < -sz) x = width + sz;
          if (y > height + sz) y = -sz; else if (y < -sz) y = height + sz;
        } else if (!gravityRespawned && this.options.boundaryMode === 'bounce') {
          var s = this.sizeA[i];
          if (x + s > width) { x = width - s; vx = -Math.abs(vx); }
          else if (x - s < 0) { x = s; vx = Math.abs(vx); }
          if (y + s > height) { y = height - s; vy = -Math.abs(vy); }
          else if (y - s < 0) { y = s; vy = Math.abs(vy); }
        }
        if (!Number.isFinite(x) || !Number.isFinite(y)) { x = Math.random() * width; y = Math.random() * height; }
        if (!Number.isFinite(vx) || !Number.isFinite(vy)) { vx = 0; vy = 0; }
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

  // Respect toggle: only apply particle repulsion when enabled
  var interDistSq = options.particleInteractionDistance * options.particleInteractionDistance;
  if (distanceSq < interDistSq) {
    var distance = Math.sqrt(distanceSq);
    var cx = (particleA.x + particleB.x) / 2;
    var cy = (particleA.y + particleB.y) / 2;
    if (options.particleRepulsion) {
      applyParticleInteraction(particleA, particleB, cx, cy, options.particleInteractionDistance, options.particleRepulsionForce);
    } else if (options.particleAttraction) {
      applyParticleInteraction(
        particleA,
        particleB,
        cx,
        cy,
        options.particleInteractionDistance,
        -Math.abs(options.particleAttractionForce || 5)
      );
    }
  }

    if (distanceSq > options.maxColorChangeDistance * options.maxColorChangeDistance) return;

    if (distanceSq <= options.lineConnectionDistance * options.lineConnectionDistance) {
      var distance = Math.sqrt(distanceSq);
      var g = network.g;
      var gradient = null;
      var glColor1 = null;
      var glColor2 = null;
      var cssColor1 = null;
      var cssColor2 = null;
      var alphaFactor = (options.lineConnectionDistance - distance) / options.lineConnectionDistance;

      if (options.useDistanceEffect) {
        var colorFactor = Math.min(distance / options.maxColorChangeDistance, 1);

        if (network.glRenderer && network.glRenderer.addLine) {
          var startColor = network.startColorRgb;
          var endColor = network.endColorRgb;
          glLineColor1Scratch[0] = Math.round(startColor[0] + colorFactor * (endColor[0] - startColor[0])) / 255;
          glLineColor1Scratch[1] = Math.round(startColor[1] + colorFactor * (endColor[1] - startColor[1])) / 255;
          glLineColor1Scratch[2] = Math.round(startColor[2] + colorFactor * (endColor[2] - startColor[2])) / 255;
          glLineColor1Scratch[3] = alphaFactor;
          copyRgb01WithAlpha(glLineColor1Scratch, glLineColor2Scratch, alphaFactor);
          glColor1 = glLineColor1Scratch;
          glColor2 = glLineColor2Scratch;
        } else {
          var interpolatedColor = interpolateColor(network.startColorRgb, network.endColorRgb, colorFactor);
          var colorString = rgbToString(interpolatedColor);
          cssColor1 = colorString;
          cssColor2 = colorString;
          gradient = g.createLinearGradient(particleA.x, particleA.y, particleB.x, particleB.y);
          gradient.addColorStop(0, cssColor1);
          gradient.addColorStop(1, cssColor2);
        }
      } else if (options.lineColorCycling && options.gradientEffect) {
        if (network.glRenderer && network.glRenderer.addLine) {
          glColor1 = copyRgb01WithAlpha(network._frameLineColor1, glLineColor1Scratch, alphaFactor);
          glColor2 = copyRgb01WithAlpha(network._frameLineColor2, glLineColor2Scratch, alphaFactor);
        } else {
          cssColor1 = network.currentLineColor1;
          cssColor2 = network.currentLineColor2;
          gradient = g.createLinearGradient(particleA.x, particleA.y, particleB.x, particleB.y);
          gradient.addColorStop(0, cssColor1);
          gradient.addColorStop(1, cssColor2);
        }
      } else if (options.lineColorCycling) {
        if (network.glRenderer && network.glRenderer.addLine) {
          glColor1 = copyRgb01WithAlpha(network._frameLineColor1, glLineColor1Scratch, alphaFactor);
          glColor2 = copyRgb01WithAlpha(network._frameLineColor1, glLineColor2Scratch, alphaFactor);
        } else {
          // Use current cycling color per draw; do not reuse cached gradient
          cssColor1 = network.currentLineColor1;
          cssColor2 = network.currentLineColor1;
          gradient = g.createLinearGradient(particleA.x, particleA.y, particleB.x, particleB.y);
          gradient.addColorStop(0, cssColor1);
          gradient.addColorStop(1, cssColor2);
        }
      } else if (options.gradientEffect) {
        if (network.glRenderer && network.glRenderer.addLine) {
          glColor1 = copyRgb01WithAlpha(network._frameLineColor1, glLineColor1Scratch, alphaFactor);
          glColor2 = copyRgb01WithAlpha(network._frameLineColor2, glLineColor2Scratch, alphaFactor);
        } else {
          cssColor1 = options.gradientColor1;
          cssColor2 = options.gradientColor2;
          gradient = g.createLinearGradient(particleA.x, particleA.y, particleB.x, particleB.y);
          gradient.addColorStop(0, cssColor1);
          gradient.addColorStop(1, cssColor2);
        }
      } else {
        if (network.glRenderer && network.glRenderer.addLine) {
          glColor1 = copyRgb01WithAlpha(network._frameLineColor1, glLineColor1Scratch, alphaFactor);
          glColor2 = copyRgb01WithAlpha(network._frameLineColor1, glLineColor2Scratch, alphaFactor);
        } else {
          cssColor1 = options.gradientColor1;
          cssColor2 = options.gradientColor1;
          gradient = network.cachedGradient2;
          if (!gradient) {
            gradient = g.createLinearGradient(0, 0, 0, 0);
            gradient.addColorStop(0, cssColor1);
            gradient.addColorStop(1, cssColor2);
            network.cachedGradient2 = gradient;
          }
        }
      }

      if (options.interactive && network.p) {
        var proximityDistanceSq = options.proximityEffectDistance * options.proximityEffectDistance;
        var pointerAX = network.p.x - particleA.x;
        var pointerAY = network.p.y - particleA.y;
        var pointerBX = network.p.x - particleB.x;
        var pointerBY = network.p.y - particleB.y;
        var particleANearPointer = pointerAX * pointerAX + pointerAY * pointerAY < proximityDistanceSq;
        var particleBNearPointer = pointerBX * pointerBX + pointerBY * pointerBY < proximityDistanceSq;
        if (network.glRenderer && network.glRenderer.addLine) {
          if (particleANearPointer) {
            glColor1 = copyRgb01WithAlpha(network._frameProximityColor, glLineColor1Scratch, alphaFactor);
          }
          if (particleBNearPointer) {
            glColor2 = copyRgb01WithAlpha(network._frameProximityColor, glLineColor2Scratch, alphaFactor);
          }
        } else if (particleANearPointer || particleBNearPointer) {
          gradient = g.createLinearGradient(particleA.x, particleA.y, particleB.x, particleB.y);
          gradient.addColorStop(0, particleANearPointer ? options.proximityEffectColor : cssColor1);
          gradient.addColorStop(1, particleBNearPointer ? options.proximityEffectColor : cssColor2);
        }
      }

      if (network.glRenderer && network.glRenderer.addLine && glColor1 && glColor2) {
        // if ((network._lastUpdateTime || 0) >= (network._debugNextLogTime || 0)) {
        //   console.debug('[PN] addLine colors', glColor1, glColor2);
        // }
        if (network.options.lineJitter) {
          // Jittered polyline approximation in GL: split into segments
          var segs = Math.max(2, network.options.lineJitterSegments|0);
          var dxj = particleB.x - particleA.x; var dyj = particleB.y - particleA.y;
          var lenj = Math.max(1e-6, Math.hypot(dxj, dyj));
          var nxj = -dyj / lenj, nyj = dxj / lenj; // perpendicular unit
          var ampFrac = network.options.lineJitterAmplitude != null ? network.options.lineJitterAmplitude : 0.12;
          var amp = Math.min(6, ampFrac * lenj);
          var tphase = (network._pulsePhase || 0);
          var prevX = particleA.x;
          var prevY = particleA.y;
          var color1R = glColor1[0], color1G = glColor1[1], color1B = glColor1[2], color1A = glColor1[3];
          var color2R = glColor2[0], color2G = glColor2[1], color2B = glColor2[2], color2A = glColor2[3];
          for (var si = 1; si <= segs; si++) {
            var t = si / segs;
            var bx = particleA.x + dxj * t;
            var by = particleA.y + dyj * t;
            var jitter = Math.sin(t * 12.9898 + tphase) * 0.5 + Math.cos(t * 78.233 + tphase * 0.5) * 0.5;
            var taper = 1 - Math.abs(0.5 - t) * 1.6;
            var off = jitter * amp * taper;
            var cx = bx + nxj * off;
            var cy = by + nyj * off;
            // interpolate colors per segment end
            var leftT = t - 1 / segs;
            glSegmentColor1Scratch[0] = color1R + (color2R - color1R) * leftT;
            glSegmentColor1Scratch[1] = color1G + (color2G - color1G) * leftT;
            glSegmentColor1Scratch[2] = color1B + (color2B - color1B) * leftT;
            glSegmentColor1Scratch[3] = color1A + (color2A - color1A) * leftT;
            glSegmentColor2Scratch[0] = color1R + (color2R - color1R) * t;
            glSegmentColor2Scratch[1] = color1G + (color2G - color1G) * t;
            glSegmentColor2Scratch[2] = color1B + (color2B - color1B) * t;
            glSegmentColor2Scratch[3] = color1A + (color2A - color1A) * t;
            network.glRenderer.addLine(prevX, prevY, glSegmentColor1Scratch, cx, cy, glSegmentColor2Scratch);
            prevX = cx;
            prevY = cy;
          }
        } else {
          network.glRenderer.addLine(
            particleA.x, particleA.y, glColor1,
            particleB.x, particleB.y, glColor2
          );
        }
      } else {
        // 2D Canvas path
        g.globalAlpha = alphaFactor;
        g.lineWidth = 1.2;
        if (network.options.lineJitter) {
          var segs2 = Math.max(2, network.options.lineJitterSegments|0);
          var dx2 = particleB.x - particleA.x; var dy2 = particleB.y - particleA.y;
          var len2 = Math.max(1e-6, Math.hypot(dx2, dy2));
          var nx2 = -dy2 / len2, ny2 = dx2 / len2;
          var ampFrac2 = network.options.lineJitterAmplitude != null ? network.options.lineJitterAmplitude : 0.12;
          var amp2 = Math.min(6, ampFrac2 * len2);
          var tphase2 = (network._pulsePhase || 0);
          // build jittered polyline
          g.beginPath();
          var sx = particleA.x, sy = particleA.y;
          g.moveTo(sx, sy);
          for (var si2 = 1; si2 <= segs2; si2++) {
            var t2 = si2 / segs2;
            var bx2 = particleA.x + dx2 * t2;
            var by2 = particleA.y + dy2 * t2;
            var jitter2 = Math.sin(t2 * 12.9898 + tphase2) * 0.5 + Math.cos(t2 * 78.233 + tphase2 * 0.5) * 0.5;
            var taper2 = 1 - Math.abs(0.5 - t2) * 1.6;
            var off2 = jitter2 * amp2 * taper2;
            var cx2 = bx2 + nx2 * off2;
            var cy2 = by2 + ny2 * off2;
            g.lineTo(cx2, cy2);
          }
          g.strokeStyle = gradient;
          g.stroke();
        } else {
          g.beginPath();
          g.strokeStyle = gradient;
          g.moveTo(particleA.x, particleA.y);
          g.lineTo(particleB.x, particleB.y);
          g.stroke();
        }
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
  particleCyclingSpeed: 10,
  

  // Line options
  gradientEffect: true,
  gradientColor1: "#ecf00c",
  gradientColor2: "#e00000",
  lineColorCycling: true,
  lineCyclingSpeed: 40,

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

window.particleNetworkOptions = options;
window.ParticleNetworkLifecycle.install(ParticleNetwork);
window.createParticleNetwork = function () {
  if (window.particleInstance && !window.particleInstance._destroyed) {
    return window.particleInstance;
  }
  var canvasDiv = document.getElementById("particle-canvas");
  if (!canvasDiv) return null;
  window.particleInstance = window.ParticleNetworkLifecycle.create(
    ParticleNetwork,
    canvasDiv,
    window.particleNetworkOptions
  );
  return window.particleInstance;
};

// Auto-initialize the first instance; the same factory supports tested recreation.
var particleCanvas = window.createParticleNetwork();
