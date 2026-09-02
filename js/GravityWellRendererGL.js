/**
 * Gravity-well post processor for the particle renderer.
 * Shares the ParticleRendererGL WebGL 1 context and allocates targets only
 * while the feature is in use.
 */
(function(window) {
  'use strict';

  var MAX_ORBIT_POINTS = 50000;

  function compileShader(gl, type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      var message = gl.getShaderInfoLog(shader) || 'Unknown shader error';
      gl.deleteShader(shader);
      throw new Error(message);
    }
    return shader;
  }

  function createProgram(gl, vertexSource, fragmentSource) {
    var vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
    var fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    var program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      var message = gl.getProgramInfoLog(program) || 'Unknown program link error';
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      throw new Error(message);
    }
    return program;
  }

  function deleteProgram(gl, program) {
    if (!program) return;
    var shaders = gl.getAttachedShaders(program) || [];
    for (var i = 0; i < shaders.length; i++) {
      gl.detachShader(program, shaders[i]);
      gl.deleteShader(shaders[i]);
    }
    gl.deleteProgram(program);
  }

  function parseColor(hex, fallback) {
    var value = typeof hex === 'string' ? hex : fallback;
    var match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value || '');
    if (!match) match = /^#([0-9a-f]{6})$/i.exec(fallback);
    var digits = match ? match[1] : 'ffffff';
    if (digits.length === 3) {
      digits = digits[0] + digits[0] + digits[1] + digits[1] + digits[2] + digits[2];
    }
    var packed = parseInt(digits, 16);
    return [((packed >> 16) & 255) / 255, ((packed >> 8) & 255) / 255, (packed & 255) / 255];
  }

  function finiteOr(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function visualSpeedForStrength(strength) {
    return 0.25 + 0.75 * Math.max(0, Math.min(40, finiteOr(strength, 12))) / 12;
  }

  function createTarget(gl, width, height) {
    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    var framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(texture);
      throw new Error('Gravity-well framebuffer is incomplete');
    }
    return { framebuffer: framebuffer, texture: texture, width: width, height: height };
  }

  function deleteTarget(gl, target) {
    if (!target) return;
    if (target.framebuffer) gl.deleteFramebuffer(target.framebuffer);
    if (target.texture) gl.deleteTexture(target.texture);
  }

  var fullscreenVertex = [
    'attribute vec2 a_position;',
    'varying vec2 v_uv;',
    'void main() {',
    '  v_uv = a_position * 0.5 + 0.5;',
    '  gl_Position = vec4(a_position, 0.0, 1.0);',
    '}'
  ].join('\n');

  var fieldFragment = [
    'precision mediump float;',
    'varying vec2 v_uv;',
    'uniform vec2 u_resolution;',
    'uniform vec2 u_center;',
    'uniform float u_radius;',
    'uniform float u_strength;',
    'uniform float u_direction;',
    'void main() {',
    '  vec2 deltaPx = (v_uv - u_center) * u_resolution;',
    '  float distancePx = length(deltaPx);',
    '  float reach = u_radius * 1.75;',
    '  if (distancePx >= reach) discard;',
    '  float normalized = distancePx / max(reach, 1.0);',
    '  float falloff = pow(1.0 - normalized, 2.0);',
    '  float lensRing = exp(-pow((distancePx / max(u_radius, 1.0) - 0.36) * 4.5, 2.0));',
    '  vec2 direction = distancePx > 0.5 ? deltaPx / distancePx : vec2(0.0);',
    '  vec2 offset = direction * u_direction * (falloff * 0.014 + lensRing * 0.006);',
    '  offset *= clamp(u_strength / 12.0, 0.0, 4.0) * (u_radius / u_resolution);',
    '  gl_FragColor = vec4(max(offset.x, 0.0), max(-offset.x, 0.0), max(offset.y, 0.0), max(-offset.y, 0.0));',
    '}'
  ].join('\n');

  var compositeFragment = [
    'precision mediump float;',
    'varying vec2 v_uv;',
    'uniform sampler2D u_scene;',
    'uniform sampler2D u_field;',
    'void main() {',
    '  vec4 fieldSample = texture2D(u_field, v_uv);',
    '  vec2 offset = vec2(fieldSample.r - fieldSample.g, fieldSample.b - fieldSample.a);',
    '  float shift = min(length(offset) * 0.7, 0.004);',
    '  vec2 uv = clamp(v_uv + offset, vec2(0.001), vec2(0.999));',
    '  vec4 base = texture2D(u_scene, uv);',
    '  float red = texture2D(u_scene, clamp(uv + vec2(shift, 0.0), vec2(0.001), vec2(0.999))).r;',
    '  float blue = texture2D(u_scene, clamp(uv - vec2(shift, 0.0), vec2(0.001), vec2(0.999))).b;',
    '  gl_FragColor = vec4(red, base.g, blue, base.a);',
    '}'
  ].join('\n');

  var discFragment = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'varying vec2 v_uv;',
    'uniform vec2 u_resolution;',
    'uniform vec2 u_center;',
    'uniform float u_radius;',
    'uniform float u_time;',
    'uniform float u_speed;',
    'uniform float u_type;',
    'uniform float u_selected;',
    'uniform vec3 u_inner;',
    'uniform vec3 u_outer;',
    'float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    'float noise(vec2 p) {',
    '  vec2 i = floor(p); vec2 f = fract(p);',
    '  f = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), f.x), f.y);',
    '}',
    'void main() {',
    '  vec2 pixel = v_uv * u_resolution;',
    '  vec2 local = (pixel - u_center) / max(u_radius, 1.0);',
    '  float radial = length(local);',
    '  if (radial > 1.65) discard;',
    '  float angle = atan(local.y, local.x);',
    '  vec2 flattenedDisc = vec2(local.x, local.y * 4.2);',
    '  float discRadius = length(flattenedDisc);',
    '  float flowDirection = u_type > 0.0 ? -1.0 : 1.0;',
    '  float flowAngle = angle + u_time * u_speed * flowDirection * (1.15 + (1.0 - min(discRadius, 1.0)) * 1.25);',
    '  vec2 flowVector = vec2(cos(flowAngle), sin(flowAngle)) * discRadius;',
    '  float grain = noise(flowVector * 6.0 + vec2(discRadius * 11.0, -discRadius * 7.0));',
    '  float fineGrain = noise(flowVector * 13.0 - vec2(discRadius * 17.0, discRadius * 5.0) + vec2(u_time * u_speed * flowDirection * 0.18));',
    '  grain = grain * 0.72 + fineGrain * 0.28;',
    '  float band = 0.0;',
    '  band += smoothstep(0.58, 0.42, abs(discRadius - 0.70 + (grain - 0.5) * 0.12));',
    '  band += 0.65 * smoothstep(0.42, 0.30, abs(discRadius - 1.04 + (grain - 0.5) * 0.16));',
    '  band *= smoothstep(1.45, 0.22, discRadius);',
    '  float horizon = 1.0 - smoothstep(0.16, 0.205, radial);',
    '  float rim = smoothstep(0.30, 0.205, radial) * smoothstep(0.16, 0.205, radial);',
    '  float halo = exp(-radial * 3.3) * 0.34;',
    '  vec3 discColor = mix(u_inner, u_outer, clamp(discRadius / 1.35, 0.0, 1.0));',
    '  vec3 color = discColor * (band * (0.45 + grain * 0.75) + rim * 1.5 + halo);',
    '  float alpha = clamp(band * 0.72 + rim + halo, 0.0, 0.94);',
    '  if (horizon > 0.0) {',
    '    vec3 core = u_type > 0.0 ? vec3(0.0) : mix(vec3(1.0), u_inner, radial * 3.0);',
    '    color = mix(color, core, horizon);',
    '    alpha = max(alpha, horizon * (u_type > 0.0 ? 0.99 : 0.96));',
    '  }',
    '  float auraPulse = 0.84 + 0.16 * sin(u_time * u_speed * 1.6);',
    '  float selectionAura = u_selected * smoothstep(1.58, 0.24, radial) * smoothstep(0.16, 0.30, radial);',
    '  selectionAura *= 0.18 * auraPulse;',
    '  color += selectionAura * mix(u_outer, u_inner, 0.28);',
    '  alpha = max(alpha, selectionAura * 0.72);',
    '  gl_FragColor = vec4(color, alpha);',
    '}'
  ].join('\n');

  var pointVertex = [
    'precision highp float;',
    'attribute vec3 a_seed;',
    'uniform vec2 u_resolution;',
    'uniform vec2 u_center;',
    'uniform float u_radius;',
    'uniform float u_time;',
    'uniform float u_speed;',
    'uniform float u_type;',
    'uniform vec3 u_inner;',
    'uniform vec3 u_outer;',
    'varying vec3 v_color;',
    'varying float v_alpha;',
    'void main() {',
    '  float outer = mix(0.05, a_seed.x, pow(a_seed.z, 1.7));',
    '  float direction = u_type > 0.0 ? -1.0 : 1.0;',
    '  float phase = u_time * u_speed * (0.42 + (1.0 - outer) * 2.6) * direction;',
    '  float angle = outer * 4.6 + (a_seed.y - 0.5) * 1.15 + phase;',
    '  float radius = u_radius * (0.30 + outer * 1.18);',
    '  if (u_type < 0.0) radius = u_radius * (0.22 + fract(outer + u_time * u_speed * (0.035 + a_seed.z * 0.04)) * 1.25);',
    '  vec2 offset = vec2(sin(angle) * radius, cos(angle) * radius * 0.22);',
    '  vec2 pixel = u_center + offset;',
    '  vec2 clip = pixel / u_resolution * 2.0 - 1.0;',
    '  gl_Position = vec4(clip, 0.0, 1.0);',
    '  gl_PointSize = max(1.0, (0.7 + a_seed.y * 2.3) * min(u_resolution.y / 720.0, 2.0));',
    '  v_color = mix(u_inner, u_outer, outer);',
    '  float shimmer = 0.76 + 0.24 * sin(u_time * u_speed * 2.4 + a_seed.x * 31.0 + a_seed.z * 17.0);',
    '  v_alpha = mix(0.82, 0.16, outer) * shimmer;',
    '}'
  ].join('\n');

  var pointFragment = [
    'precision mediump float;',
    'varying vec3 v_color;',
    'varying float v_alpha;',
    'void main() {',
    '  float distanceToCenter = length(gl_PointCoord - vec2(0.5));',
    '  if (distanceToCenter > 0.5) discard;',
    '  float glow = 1.0 - smoothstep(0.12, 0.5, distanceToCenter);',
    '  gl_FragColor = vec4(v_color, v_alpha * glow);',
    '}'
  ].join('\n');

  function GravityWellRendererGL(gl, canvas) {
    this.gl = gl;
    this.canvas = canvas;
    this.ready = false;
    this.failed = false;
    this.sceneTarget = null;
    this.fieldTarget = null;
    this.width = 0;
    this.height = 0;
    this.diagnostics = {
      pointBufferCreates: 0,
      maxOrbitPoints: MAX_ORBIT_POINTS,
      sceneWidth: 0,
      sceneHeight: 0,
      fieldWidth: 0,
      fieldHeight: 0,
      renderPasses: 0,
      compositionFailures: 0,
      lastAnimationTime: 0,
      activeWellCount: 0,
      maxVisualSpeed: 0
    };

    try {
      this.fieldProgram = createProgram(gl, fullscreenVertex, fieldFragment);
      this.compositeProgram = createProgram(gl, fullscreenVertex, compositeFragment);
      this.discProgram = createProgram(gl, fullscreenVertex, discFragment);
      this.pointProgram = createProgram(gl, pointVertex, pointFragment);

      this.fullscreenBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.fullscreenBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

      var seeds = new Float32Array(MAX_ORBIT_POINTS * 3);
      for (var i = 0; i < MAX_ORBIT_POINTS; i++) {
        seeds[i * 3] = Math.random();
        seeds[i * 3 + 1] = Math.random();
        seeds[i * 3 + 2] = Math.random();
      }
      this.pointBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.pointBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
      this.diagnostics.pointBufferCreates = 1;
      this.ready = true;
    } catch (error) {
      this.failed = true;
      this.diagnostics.compositionFailures++;
      console.warn('Gravity-well WebGL renderer disabled:', error);
    } finally {
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
  }

  GravityWellRendererGL.prototype.resize = function(width, height) {
    if (!this.ready || this.failed) return false;
    width = Math.max(1, width | 0);
    height = Math.max(1, height | 0);
    if (this.width === width && this.height === height && this.sceneTarget && this.fieldTarget) return false;
    var gl = this.gl;
    try {
      deleteTarget(gl, this.sceneTarget);
      deleteTarget(gl, this.fieldTarget);
      this.sceneTarget = createTarget(gl, width, height);
      this.fieldTarget = createTarget(gl, Math.max(1, Math.ceil(width / 2)), Math.max(1, Math.ceil(height / 2)));
      this.width = width;
      this.height = height;
      this.diagnostics.sceneWidth = width;
      this.diagnostics.sceneHeight = height;
      this.diagnostics.fieldWidth = this.fieldTarget.width;
      this.diagnostics.fieldHeight = this.fieldTarget.height;
      return true;
    } catch (error) {
      this.failed = true;
      this.diagnostics.compositionFailures++;
      console.warn('Gravity-well framebuffer setup failed:', error);
      return false;
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
  };

  GravityWellRendererGL.prototype.beginScene = function() {
    if (!this.ready || this.failed || !this.sceneTarget) return false;
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.sceneTarget.framebuffer);
    this.gl.viewport(0, 0, this.width, this.height);
    return true;
  };

  GravityWellRendererGL.prototype._bindFullscreen = function(program) {
    var gl = this.gl;
    var location = gl.getAttribLocation(program, 'a_position');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.fullscreenBuffer);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
  };

  GravityWellRendererGL.prototype.render = function(wells, elapsedSeconds, reducedMotion) {
    if (!this.ready || this.failed || !this.sceneTarget || !this.fieldTarget || !wells.length) return false;
    var gl = this.gl;
    var animationTime = reducedMotion ? 0 : elapsedSeconds;
    this.diagnostics.lastAnimationTime = animationTime;
    this.diagnostics.activeWellCount = wells.length;
    try {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fieldTarget.framebuffer);
      gl.viewport(0, 0, this.fieldTarget.width, this.fieldTarget.height);
      gl.disable(gl.SCISSOR_TEST);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(this.fieldProgram);
      this._bindFullscreen(this.fieldProgram);
      gl.uniform2f(gl.getUniformLocation(this.fieldProgram, 'u_resolution'), this.width, this.height);
      for (var i = 0; i < wells.length; i++) {
        var well = wells[i];
        var fieldDpr = this.canvas.width / Math.max(1, this.canvas.clientWidth || this.canvas.width);
        gl.uniform2f(gl.getUniformLocation(this.fieldProgram, 'u_center'), finiteOr(well.x, 0) * fieldDpr / this.width, 1 - finiteOr(well.y, 0) * fieldDpr / this.height);
        gl.uniform1f(gl.getUniformLocation(this.fieldProgram, 'u_radius'), Math.max(1, finiteOr(well.radius, 120)) * fieldDpr);
        gl.uniform1f(gl.getUniformLocation(this.fieldProgram, 'u_strength'), finiteOr(well.strength, 0));
        gl.uniform1f(gl.getUniformLocation(this.fieldProgram, 'u_direction'), well.type === 'white' ? 1 : -1);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.width, this.height);
      gl.disable(gl.BLEND);
      gl.useProgram(this.compositeProgram);
      this._bindFullscreen(this.compositeProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.sceneTarget.texture);
      gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'u_scene'), 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.fieldTarget.texture);
      gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'u_field'), 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(this.discProgram);
      this._bindFullscreen(this.discProgram);
      gl.uniform2f(gl.getUniformLocation(this.discProgram, 'u_resolution'), this.width, this.height);
      gl.uniform1f(gl.getUniformLocation(this.discProgram, 'u_time'), animationTime);
      this.diagnostics.maxVisualSpeed = 0;
      for (var j = 0; j < wells.length; j++) {
        var discWell = wells[j];
        var dpr = this.canvas.width / Math.max(1, this.canvas.clientWidth || this.canvas.width);
        var inner = parseColor(discWell.innerColor, discWell.type === 'white' ? '#dffcff' : '#ff8080');
        var outer = parseColor(discWell.outerColor, discWell.type === 'white' ? '#6b5cff' : '#3633ff');
        gl.uniform2f(gl.getUniformLocation(this.discProgram, 'u_center'), finiteOr(discWell.x, 0) * dpr, this.height - finiteOr(discWell.y, 0) * dpr);
        gl.uniform1f(gl.getUniformLocation(this.discProgram, 'u_radius'), Math.max(1, finiteOr(discWell.radius, 120)) * dpr);
        var discSpeed = visualSpeedForStrength(discWell.strength);
        this.diagnostics.maxVisualSpeed = Math.max(this.diagnostics.maxVisualSpeed, discSpeed);
        gl.uniform1f(gl.getUniformLocation(this.discProgram, 'u_speed'), discSpeed);
        gl.uniform1f(gl.getUniformLocation(this.discProgram, 'u_type'), discWell.type === 'white' ? -1 : 1);
        gl.uniform1f(gl.getUniformLocation(this.discProgram, 'u_selected'), discWell.selected || discWell.draft ? 1 : 0);
        gl.uniform3fv(gl.getUniformLocation(this.discProgram, 'u_inner'), inner);
        gl.uniform3fv(gl.getUniformLocation(this.discProgram, 'u_outer'), outer);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }

      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.useProgram(this.pointProgram);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.pointBuffer);
      var seedLocation = gl.getAttribLocation(this.pointProgram, 'a_seed');
      gl.enableVertexAttribArray(seedLocation);
      gl.vertexAttribPointer(seedLocation, 3, gl.FLOAT, false, 0, 0);
      gl.uniform2f(gl.getUniformLocation(this.pointProgram, 'u_resolution'), this.width, this.height);
      gl.uniform1f(gl.getUniformLocation(this.pointProgram, 'u_time'), animationTime);
      for (var k = 0; k < wells.length; k++) {
        var pointWell = wells[k];
        var pointDpr = this.canvas.width / Math.max(1, this.canvas.clientWidth || this.canvas.width);
        var pointInner = parseColor(pointWell.innerColor, pointWell.type === 'white' ? '#dffcff' : '#ff8080');
        var pointOuter = parseColor(pointWell.outerColor, pointWell.type === 'white' ? '#6b5cff' : '#3633ff');
        var pointRadius = Math.max(1, finiteOr(pointWell.radius, 120));
        gl.uniform2f(gl.getUniformLocation(this.pointProgram, 'u_center'), finiteOr(pointWell.x, 0) * pointDpr, this.height - finiteOr(pointWell.y, 0) * pointDpr);
        gl.uniform1f(gl.getUniformLocation(this.pointProgram, 'u_radius'), pointRadius * pointDpr);
        gl.uniform1f(gl.getUniformLocation(this.pointProgram, 'u_speed'), visualSpeedForStrength(pointWell.strength));
        gl.uniform1f(gl.getUniformLocation(this.pointProgram, 'u_type'), pointWell.type === 'white' ? -1 : 1);
        gl.uniform3fv(gl.getUniformLocation(this.pointProgram, 'u_inner'), pointInner);
        gl.uniform3fv(gl.getUniformLocation(this.pointProgram, 'u_outer'), pointOuter);
        var scale = Math.min(1, (pointRadius * pointRadius) / (240 * 240));
        var pointCount = Math.min(MAX_ORBIT_POINTS, Math.max(4000, Math.floor(MAX_ORBIT_POINTS * scale)));
        gl.drawArrays(gl.POINTS, 0, pointCount);
      }

      this.diagnostics.renderPasses++;
      return true;
    } catch (error) {
      this.failed = true;
      this.diagnostics.compositionFailures++;
      console.warn('Gravity-well composition failed; using 2D fallback:', error);
      return false;
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.width, this.height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }
  };

  GravityWellRendererGL.prototype.destroy = function() {
    var gl = this.gl;
    if (!gl) return;
    deleteTarget(gl, this.sceneTarget);
    deleteTarget(gl, this.fieldTarget);
    if (this.fullscreenBuffer) gl.deleteBuffer(this.fullscreenBuffer);
    if (this.pointBuffer) gl.deleteBuffer(this.pointBuffer);
    deleteProgram(gl, this.fieldProgram);
    deleteProgram(gl, this.compositeProgram);
    deleteProgram(gl, this.discProgram);
    deleteProgram(gl, this.pointProgram);
    this.ready = false;
    this.gl = null;
  };

  window.GravityWellRendererGL = GravityWellRendererGL;
})(window);
