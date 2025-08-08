/**
 * ParticleRendererGL.js
 * WebGL line renderer for Particle Network (keeps gradients via per-vertex colors)
 */

(function(window) {
  'use strict';

  function createShader(gl, type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile failed:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function createProgram(gl, vsSource, fsSource) {
    var vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
    var fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) return null;
    var program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link failed:', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return null;
    }
    return program;
  }

  function ParticleRendererGL(container, options) {
    this.options = options || {};
    this.canvas = document.createElement('canvas');
    // Put lines under the 2D particles canvas (z-index 19 < 20)
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.zIndex = this.options.zIndex != null ? this.options.zIndex : 19;
    this.canvas.width = container.offsetWidth;
    this.canvas.height = container.offsetHeight;
    container.appendChild(this.canvas);

    var gl = this.canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true })
          || this.canvas.getContext('experimental-webgl', { alpha: true, antialias: true, premultipliedAlpha: true });
    if (!gl) {
      console.warn('WebGL not supported; ParticleRendererGL disabled');
      this.gl = null;
      return;
    }
    this.gl = gl;

    // Program for lines
    var vsLines = "\nattribute vec2 a_position;\nattribute vec4 a_color;\nuniform vec2 u_resolution;\nvarying vec4 v_color;\nvoid main() {\n  vec2 zeroToOne = a_position / u_resolution;\n  vec2 zeroToTwo = zeroToOne * 2.0;\n  vec2 clipSpace = zeroToTwo - 1.0;\n  gl_Position = vec4(clipSpace * vec2(1.0, -1.0), 0.0, 1.0);\n  v_color = a_color;\n}\n";
    var fsLines = "\nprecision mediump float;\nvarying vec4 v_color;\nvoid main() {\n  gl_FragColor = v_color;\n}\n";
    this.programLines = createProgram(gl, vsLines, fsLines);
    this.a_position = gl.getAttribLocation(this.programLines, 'a_position');
    this.a_color = gl.getAttribLocation(this.programLines, 'a_color');
    this.u_resolution = gl.getUniformLocation(this.programLines, 'u_resolution');

    this.positionBuffer = gl.createBuffer();
    this.colorBuffer = gl.createBuffer();

    // Program for points (circular particles)
    var vsPoints = "\nattribute vec2 a_position;\nattribute vec4 a_color;\nattribute float a_size;\nuniform vec2 u_resolution;\nvarying vec4 v_color;\nvoid main() {\n  vec2 zeroToOne = a_position / u_resolution;\n  vec2 zeroToTwo = zeroToOne * 2.0;\n  vec2 clipSpace = zeroToTwo - 1.0;\n  gl_Position = vec4(clipSpace * vec2(1.0, -1.0), 0.0, 1.0);\n  gl_PointSize = a_size;\n  v_color = a_color;\n}\n";
    var fsPoints = "\nprecision mediump float;\nvarying vec4 v_color;\nvoid main() {\n  vec2 c = gl_PointCoord - vec2(0.5, 0.5);\n  float d = dot(c, c);\n  if (d > 0.25) discard;\n  gl_FragColor = v_color;\n}\n";
    this.programPoints = createProgram(gl, vsPoints, fsPoints);
    this.p_a_position = gl.getAttribLocation(this.programPoints, 'a_position');
    this.p_a_color = gl.getAttribLocation(this.programPoints, 'a_color');
    this.p_a_size = gl.getAttribLocation(this.programPoints, 'a_size');
    this.p_u_resolution = gl.getUniformLocation(this.programPoints, 'u_resolution');

    this.pointPositionBuffer = gl.createBuffer();
    this.pointColorBuffer = gl.createBuffer();
    this.pointSizeBuffer = gl.createBuffer();

    // Dynamic buffers (reserve initial capacity)
    this.maxLines = 2048; // grows as needed; will be re-estimated from last frame
    this.positions = new Float32Array(this.maxLines * 2 * 2); // 2 vertices * (x,y)
    this.colors = new Float32Array(this.maxLines * 2 * 4); // 2 vertices * (r,g,b,a)
    this.vertexCount = 0; // number of vertices in current frame
    this.dpr = window.devicePixelRatio || 1;

    // Points storage
    this.maxPoints = 2048;
    this.pointPositions = new Float32Array(this.maxPoints * 2);
    this.pointColors = new Float32Array(this.maxPoints * 4);
    this.pointSizes = new Float32Array(this.maxPoints * 1);
    this.pointCount = 0;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Transparent clear
    gl.clearColor(0, 0, 0, 0);

    this.resize(this.canvas.width, this.canvas.height);
  }

  ParticleRendererGL.prototype.ensureCapacity = function(additionalLines) {
    var neededVertices = (this.vertexCount + additionalLines * 2);
    if (neededVertices <= (this.maxLines * 2)) return;
    // grow by 2x until enough
    while (neededVertices > this.maxLines * 2) {
      this.maxLines *= 2;
    }
    var newPositions = new Float32Array(this.maxLines * 2 * 2);
    newPositions.set(this.positions.subarray(0, this.vertexCount * 2));
    this.positions = newPositions;

    var newColors = new Float32Array(this.maxLines * 2 * 4);
    newColors.set(this.colors.subarray(0, this.vertexCount * 4));
    this.colors = newColors;
  };

  ParticleRendererGL.prototype.ensurePointCapacity = function(additionalPoints) {
    var needed = this.pointCount + additionalPoints;
    if (needed <= this.maxPoints) return;
    while (needed > this.maxPoints) this.maxPoints *= 2;
    var np = new Float32Array(this.maxPoints * 2); np.set(this.pointPositions.subarray(0, this.pointCount * 2)); this.pointPositions = np;
    var nc = new Float32Array(this.maxPoints * 4); nc.set(this.pointColors.subarray(0, this.pointCount * 4)); this.pointColors = nc;
    var ns = new Float32Array(this.maxPoints * 1); ns.set(this.pointSizes.subarray(0, this.pointCount * 1)); this.pointSizes = ns;
  };

  ParticleRendererGL.prototype.resize = function(width, height) {
    if (!this.gl) return;
    this.dpr = window.devicePixelRatio || 1;
    // Preserve CSS size via style; set drawing buffer to DPR size
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';
    this.canvas.width = Math.max(1, Math.floor(width * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(height * this.dpr));
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  };

  ParticleRendererGL.prototype.beginFrame = function() {
    if (!this.gl) return;
    // Pre-size based on last frame's line estimate
    if (this.lastFrameLines && this.lastFrameLines > 0) {
      var targetLines = Math.min(Math.max(this.lastFrameLines, 32), 262144);
      if (targetLines > this.maxLines) {
        this.maxLines = targetLines;
        this.positions = new Float32Array(this.maxLines * 2 * 2);
        this.colors = new Float32Array(this.maxLines * 2 * 4);
      }
    }
    this.vertexCount = 0;
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    // Pre-size points from last frame
    if (this.lastFramePoints && this.lastFramePoints > 0) {
      var tp = Math.min(Math.max(this.lastFramePoints, 32), 262144);
      if (tp > this.maxPoints) {
        this.maxPoints = tp;
        this.pointPositions = new Float32Array(this.maxPoints * 2);
        this.pointColors = new Float32Array(this.maxPoints * 4);
        this.pointSizes = new Float32Array(this.maxPoints * 1);
      }
    }
    this.pointCount = 0;
  };

  // color1/2 are arrays [r,g,b,a] with 0..1 floats
  ParticleRendererGL.prototype.addLine = function(x1, y1, color1, x2, y2, color2) {
    if (!this.gl) return;
    this.ensureCapacity(1);
    var pv = this.vertexCount * 2;
    var cv = this.vertexCount * 4;
    // v0
    this.positions[pv + 0] = x1 * this.dpr;
    this.positions[pv + 1] = y1 * this.dpr;
    this.colors[cv + 0] = color1[0];
    this.colors[cv + 1] = color1[1];
    this.colors[cv + 2] = color1[2];
    this.colors[cv + 3] = color1[3];
    // v1
    this.positions[pv + 2] = x2 * this.dpr;
    this.positions[pv + 3] = y2 * this.dpr;
    this.colors[cv + 4] = color2[0];
    this.colors[cv + 5] = color2[1];
    this.colors[cv + 6] = color2[2];
    this.colors[cv + 7] = color2[3];
    this.vertexCount += 2;
  };

  // color is [r,g,b,a] 0..1, size in CSS pixels
  ParticleRendererGL.prototype.addPoint = function(x, y, color, sizeCss) {
    if (!this.gl) return;
    this.ensurePointCapacity(1);
    var pv = this.pointCount * 2;
    var cv = this.pointCount * 4;
    this.pointPositions[pv + 0] = x * this.dpr;
    this.pointPositions[pv + 1] = y * this.dpr;
    this.pointColors[cv + 0] = color[0];
    this.pointColors[cv + 1] = color[1];
    this.pointColors[cv + 2] = color[2];
    this.pointColors[cv + 3] = color[3];
    // Clamp point size in device pixels to avoid oversized rasterization
    var minPx = 1.0;
    var maxPx = (this.options && this.options.maxPointSizePx != null) ? this.options.maxPointSizePx : 16.0;
    var sizePx = sizeCss * this.dpr * 2.0; // diameter in device pixels
    sizePx = Math.min(maxPx, Math.max(minPx, sizePx));
    this.pointSizes[this.pointCount] = sizePx;
    this.pointCount += 1;
  };

  ParticleRendererGL.prototype.endFrame = function() {
    if (!this.gl) return;
    var gl = this.gl;
    if (this.vertexCount > 0) {
      gl.useProgram(this.programLines);
      gl.uniform2f(this.u_resolution, this.canvas.width, this.canvas.height);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.positions.subarray(0, this.vertexCount * 2), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(this.a_position);
      gl.vertexAttribPointer(this.a_position, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.colors.subarray(0, this.vertexCount * 4), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(this.a_color);
      gl.vertexAttribPointer(this.a_color, 4, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.LINES, 0, this.vertexCount);
      this.lastFrameLines = Math.floor(this.vertexCount / 2);
    }

    if (this.pointCount > 0) {
      gl.useProgram(this.programPoints);
      gl.uniform2f(this.p_u_resolution, this.canvas.width, this.canvas.height);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.pointPositionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.pointPositions.subarray(0, this.pointCount * 2), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(this.p_a_position);
      gl.vertexAttribPointer(this.p_a_position, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.pointColorBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.pointColors.subarray(0, this.pointCount * 4), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(this.p_a_color);
      gl.vertexAttribPointer(this.p_a_color, 4, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.pointSizeBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.pointSizes.subarray(0, this.pointCount * 1), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(this.p_a_size);
      gl.vertexAttribPointer(this.p_a_size, 1, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.POINTS, 0, this.pointCount);
      this.lastFramePoints = this.pointCount;
    }
  };

  if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = ParticleRendererGL;
  } else {
    window.ParticleNetworkRendererGL = ParticleRendererGL;
  }
})(window);


