/**
 * HotkeyManager.js
 * 
 * Centralized hotkey management system for the particle network.
 * Handles all keyboard shortcuts in one place with conflict detection.
 */

(function(window) {
  'use strict';

  /**
   * HotkeyManager - Centralized keyboard shortcut handler
   */
  function HotkeyManager() {
    this.handlers = new Map(); // key -> {down, up, description, options}
    this.context = null;
    this._timerIds = new Set();
    this._transientNodes = new Set();
    this._destroyed = false;
    this.setupListeners();
  }

  /**
   * Set the context object that handlers will receive
   * @param {Object} context - Context object with particleInstance, params, etc.
   */
  HotkeyManager.prototype.setContext = function(context) {
    this.context = context;
  };

  /**
   * Register a hotkey handler
   * @param {string} key - Key to register (normalized to lowercase)
   * @param {Function} handler - Handler function(context, event)
   * @param {string} description - Description for help text
   * @param {Object} options - Options {preventDefault: bool, keyup: Function}
   */
  HotkeyManager.prototype.register = function(key, handler, description, options) {
    if (!key || typeof handler !== 'function') {
      console.warn('HotkeyManager: Invalid registration', key);
      return;
    }

    const normalizedKey = key.toLowerCase();
    options = options || {};

    // Check for conflicts
    if (this.handlers.has(normalizedKey)) {
      console.warn(`HotkeyManager: Key '${normalizedKey}' already registered. Overwriting.`);
    }

    this.handlers.set(normalizedKey, {
      down: handler,
      up: options.keyup || null,
      description: description || `Key: ${normalizedKey}`,
      preventDefault: options.preventDefault !== false // default true
    });
  };

  /**
   * Register a hold key (needs both keydown and keyup handlers)
   * @param {string} key - Key to register
   * @param {Function} onDown - Handler for keydown
   * @param {Function} onUp - Handler for keyup
   * @param {string} description - Description for help text
   */
  HotkeyManager.prototype.registerHold = function(key, onDown, onUp, description) {
    this.register(key, onDown, description, { keyup: onUp });
  };

  /**
   * Unregister a hotkey
   * @param {string} key - Key to unregister
   */
  HotkeyManager.prototype.unregister = function(key) {
    const normalizedKey = key.toLowerCase();
    this.handlers.delete(normalizedKey);
  };

  /**
   * Check if we should ignore this key event (e.g., typing in input)
   * @param {Event} event - Keyboard event
   * @returns {boolean} - True if should ignore
   */
  HotkeyManager.prototype.shouldIgnore = function(event) {
    const target = event.target;
    if (!target) return false;
    
    // Ignore if typing in input/textarea/contenteditable
    const tagName = target.tagName;
    if (tagName === 'INPUT' && target.type === 'text') return true;
    if (tagName === 'TEXTAREA') return true;
    if (target.isContentEditable) return true;
    
    return false;
  };

  /**
   * Handle keydown events
   * @param {Event} event - Keyboard event
   */
  HotkeyManager.prototype.handleKeyDown = function(event) {
    if (this.shouldIgnore(event)) return;

    const key = event.key.toLowerCase();
    const handler = this.handlers.get(key);

    if (handler && handler.down) {
      if (handler.preventDefault) {
        event.preventDefault();
      }
      try {
        handler.down(this.context, event);
      } catch (error) {
        console.error('HotkeyManager: Error in handler for', key, error);
      }
    }
  };

  /**
   * Handle keyup events
   * @param {Event} event - Keyboard event
   */
  HotkeyManager.prototype.handleKeyUp = function(event) {
    if (this.shouldIgnore(event)) return;

    const key = event.key.toLowerCase();
    const handler = this.handlers.get(key);

    if (handler && handler.up) {
      if (handler.preventDefault) {
        event.preventDefault();
      }
      try {
        handler.up(this.context, event);
      } catch (error) {
        console.error('HotkeyManager: Error in keyup handler for', key, error);
      }
    }
  };

  /**
   * Setup global event listeners
   */
  HotkeyManager.prototype.setupListeners = function() {
    this._onKeyDown = event => this.handleKeyDown(event);
    this._onKeyUp = event => this.handleKeyUp(event);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  };

  HotkeyManager.prototype.removeLater = function(node, duration) {
    this._transientNodes.add(node);
    const timerId = setTimeout(() => {
      this._timerIds.delete(timerId);
      this._transientNodes.delete(node);
      if (node.parentNode) node.parentNode.removeChild(node);
    }, duration);
    this._timerIds.add(timerId);
  };

  /**
   * Show help dialog with all registered hotkeys
   * @param {Object} options - Options {position: 'bottom-right'|'top-right', duration: number, includeMouse: bool}
   */
  HotkeyManager.prototype.showHelp = function(options) {
    options = options || {};
    const position = options.position || 'bottom-right';
    const duration = options.duration || 3000;
    const includeMouse = options.includeMouse !== false; // default true

    // Remove existing help if present
    const existing = document.getElementById('hotkey-guide');
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }

    // Build help text from registered handlers
    const entries = Array.from(this.handlers.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, data]) => `${key.toUpperCase()} = ${data.description}`);

    if (entries.length === 0) {
      console.warn('HotkeyManager: No hotkeys registered');
      return;
    }

    const guide = document.createElement('div');
    guide.id = 'hotkey-guide';
    
    // Build help text
    const helpLines = ['Shortcuts:', ''].concat(entries);
    
    // Optionally add mouse interactions
    if (includeMouse) {
      helpLines.push('');
      helpLines.push('Mouse:');
      helpLines.push('Left click = Repel');
      helpLines.push('Right click = Attract');
    }
    
    guide.textContent = helpLines.join('\n');
    
    const isBottom = position === 'bottom-right';
    guide.style.cssText = `
      position: fixed;
      ${isBottom ? 'bottom' : 'top'}: 10px;
      right: 10px;
      background: rgba(0,0,0,0.7);
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      font-family: 'Fira Code', monospace;
      z-index: 4000;
      white-space: pre;
    `;

    document.body.appendChild(guide);

    // Auto-remove after duration
    this.removeLater(guide, duration);
  };

  /**
   * Create a toast notification
   * @param {string} message - Message to show
   * @param {Object} options - Options {duration: number, position: string}
   */
  HotkeyManager.prototype.showToast = function(message, options) {
    options = options || {};
    const duration = options.duration || 2000;
    const position = options.position || 'top-right';

    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      ${position === 'bottom-right' ? 'bottom' : 'top'}: 10px;
      right: 10px;
      background: rgba(0,0,0,0.7);
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      font-family: 'Fira Code', monospace;
      z-index: 4000;
    `;

    document.body.appendChild(toast);
    this.removeLater(toast, duration);
  };

  HotkeyManager.prototype.destroy = function() {
    if (this._destroyed) return;
    this._destroyed = true;
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this._timerIds.forEach(timerId => clearTimeout(timerId));
    this._timerIds.clear();
    this._transientNodes.forEach(node => {
      if (node.parentNode) node.parentNode.removeChild(node);
    });
    this._transientNodes.clear();
    const guide = document.getElementById('hotkey-guide');
    if (guide && guide.parentNode) guide.parentNode.removeChild(guide);
    this.handlers.clear();
    this.context = null;
    this._onKeyDown = null;
    this._onKeyUp = null;
    if (window.hotkeyManager === this) window.hotkeyManager = null;
  };

  // Export to window
  window.HotkeyManager = HotkeyManager;

  // Create singleton instance
  if (!window.hotkeyManager) {
    window.hotkeyManager = new HotkeyManager();
  }

})(window);

