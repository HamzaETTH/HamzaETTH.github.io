(function (window) {
  'use strict';

  function callListener(listener, receiver, args) {
    if (typeof listener === 'function') return listener.apply(receiver, args);
    if (listener && typeof listener.handleEvent === 'function') {
      return listener.handleEvent.apply(listener, args);
    }
  }

  function invokeOwned(owner, listener, receiver, args) {
    if (!owner || owner._destroyed) return;
    var nativeSetTimeout = window.setTimeout;
    var nativeClearTimeout = window.clearTimeout;
    window.setTimeout = function (callback, delay) {
      var callbackArgs = Array.prototype.slice.call(arguments, 2);
      var id = null;
      id = nativeSetTimeout(function () {
        owner.__lifecycleTimeouts.delete(id);
        invokeOwned(owner, callback, window, callbackArgs);
      }, delay);
      owner.__lifecycleTimeouts.add(id);
      return id;
    };
    window.clearTimeout = function (id) {
      owner.__lifecycleTimeouts.delete(id);
      return nativeClearTimeout(id);
    };
    try {
      return callListener(listener, receiver, args);
    } finally {
      window.setTimeout = nativeSetTimeout;
      window.clearTimeout = nativeClearTimeout;
    }
  }

  function create(ParticleNetwork, target, options) {
    var baseAdd = EventTarget.prototype.addEventListener;
    var records = [];
    var owner = { value: null };
    var originalPosition = target.style.position;

    EventTarget.prototype.addEventListener = function (type, listener, listenerOptions) {
      var eventTarget = this;
      var wrapped = function () {
        return invokeOwned(owner.value, listener, eventTarget, arguments);
      };
      records.push({
        target: eventTarget,
        type: type,
        listener: wrapped,
        options: listenerOptions
      });
      return baseAdd.call(eventTarget, type, wrapped, listenerOptions);
    };

    var instance;
    try {
      instance = new ParticleNetwork(target, options);
    } finally {
      EventTarget.prototype.addEventListener = baseAdd;
    }
    owner.value = instance;
    instance.__lifecycleListeners = records;
    instance.__lifecycleTimeouts = new Set();
    instance.__containerPosition = originalPosition;
    instance._destroyed = false;
    return instance;
  }

  function install(ParticleNetwork) {
    if (ParticleNetwork.prototype.destroy) return;
    ParticleNetwork.prototype.destroy = function () {
      if (this._destroyed) return;
      this._destroyed = true;

      if (this._rafId != null) cancelAnimationFrame(this._rafId);
      this._rafId = null;
      this._rafActive = false;
      this._resumeOnVisible = false;
      if (this.m != null) clearTimeout(this.m);
      this.m = null;
      if (this.__lifecycleTimeouts) {
        this.__lifecycleTimeouts.forEach(function (id) { clearTimeout(id); });
        this.__lifecycleTimeouts.clear();
      }
      if (this._handleVisibilityChange) {
        document.removeEventListener('visibilitychange', this._handleVisibilityChange);
        this._handleVisibilityChange = null;
      }
      if (this.__lifecycleListeners) {
        this.__lifecycleListeners.forEach(function (record) {
          record.target.removeEventListener(record.type, record.listener, record.options);
        });
        this.__lifecycleListeners.length = 0;
      }

      Array.prototype.forEach.call(document.body.children, function (node) {
        if (node.textContent === 'Attract: HOLD A' && node.style.position === 'fixed') node.remove();
      });
      if (this._activePointers) this._activePointers.clear();
      this.attractionForce = null;
      this.repulsionForce = null;
      this.p = null;

      if (this.performanceMonitor && this.performanceMonitor.destroy) this.performanceMonitor.destroy();
      if (this.glRenderer && this.glRenderer.destroy) this.glRenderer.destroy();
      if (this.canvas && this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
      if (this.k && this.k.parentNode) this.k.parentNode.removeChild(this.k);
      if (this.i) {
        this.i.style.position = this.__containerPosition;
        delete this.i.size;
      }

      this.o = null;
      this.grid = null;
      this.posX = null;
      this.posY = null;
      this.velX = null;
      this.velY = null;
      this.sizeA = null;
      this.numParticles = 0;
      this._activePointers = null;
      this.performanceMonitor = null;
      this.glRenderer = null;
      this.g = null;
      this.canvas = null;
      this.k = null;
      this.i = null;
      this.options = null;
      this._rebuildOnResize = null;
      this.update = function () {};
      if (window.particleInstance === this) window.particleInstance = null;
    };
  }

  window.ParticleNetworkLifecycle = {
    create: create,
    install: install
  };
})(window);
