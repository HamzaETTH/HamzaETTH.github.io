/**
 * ParticleCore.js
 * 
 * Core simulation engine for the Particle Network
 * Coordinates between modules and manages the main loop
 */

(function(window) {
  'use strict';
  
  /**
   * Core particle system that coordinates all modules
   * @param {HTMLElement} container - Container element for the simulation
   * @param {Object} options - Configuration options
   */
  function ParticleCore(container, options = {}) {
    // Store container reference
    this.container = container;
    this.container.size = {
      width: container.offsetWidth,
      height: container.offsetHeight
    };
    
    // Load configuration - use Config module if available
    this.options = window.ParticleNetworkConfig && window.ParticleNetworkConfig.createConfig ?
      window.ParticleNetworkConfig.createConfig(options) :
      this.createDefaultConfig(options);
    
    // Initialize component modules
    this.initializeModules();
    
    // Create particles
    this.particles = [];
    this.initializeParticles();
    
    // Setup grid for optimized collision detection
    this.initializeGrid();
    
    // Set up interaction forces
    this.attractionForce = null;
    this.repulsionForce = null;
    
    // Initialize state
    this.isRunning = false;
    this.lastTimestamp = 0;
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Start the simulation
    this.start();
  }
  
  /**
   * Creates a default configuration when Config module isn't available
   * @param {Object} userOptions - User provided options
   * @returns {Object} - Complete configuration with defaults
   */
  ParticleCore.prototype.createDefaultConfig = function(userOptions) {
    const defaultOptions = {
      // Background options
      background: "#000000",
      
      // Particle options
      particleColor: "#fff",
      particleSize: 2,
      opacity: 0.7,
      
      // Line options
      gradientEffect: true,
      gradientColor1: "#00bfff",
      gradientColor2: "#ff4500",
      lineColorCycling: true,
      lineCyclingSpeed: 40,
      
      // Color differentiation options
      colorDifferentiationMethod: (() => {
        const methods = ['hueDistance', 'complementary', 'triadic', 'analogous', 'labPerceptual', 'wcagContrast'];
        return methods[Math.floor(Math.random() * methods.length)];
      })(),
      colorDifferentiationOptions: {},
      
      // Interaction options
      interactive: true,
      proximityEffectColor: "#ff0000",
      proximityEffectDistance: 100,
      attractionRange: 5,
      attractionIntensity: 5,
      repulsionRange: 5,
      repulsionIntensity: 5,
      
      // Connection options
      lineConnectionDistance: 120,
      
      // Physics options
      velocity: 0.66,
      density: 10000,
      particleRepulsion: false,
      particleInteractionDistance: 50,
      particleRepulsionForce: 5,
      boundaryMode: 'wrap',
      
      // Performance options
      performanceOverlay: false
    };
    
    // Merge with user options
    return { ...defaultOptions, ...userOptions };
  };
  
  /**
   * Initializes all component modules
   */
  ParticleCore.prototype.initializeModules = function() {
    // Initialize renderer
    if (window.ParticleNetworkRenderer) {
      this.renderer = new window.ParticleNetworkRenderer(this.container, {
        zIndex: 20,
        particleColor: this.options.particleColor,
        particleSize: this.options.particleSize,
        opacity: this.options.opacity,
        gradientEffect: this.options.gradientEffect,
        gradientColor1: this.options.gradientColor1,
        gradientColor2: this.options.gradientColor2,
        lineColorCycling: this.options.lineColorCycling,
        lineCyclingSpeed: this.options.lineCyclingSpeed,
        proximityEffectColor: this.options.proximityEffectColor
      });
    } else {
      console.warn('ParticleNetworkRenderer not found. Rendering will not work properly.');
      this.renderer = null;
    }
    
    // Initialize physics
    if (window.ParticleNetworkPhysics) {
      this.physics = new window.ParticleNetworkPhysics({
        boundaryMode: this.options.boundaryMode,
        attractionRange: this.options.attractionRange,
        attractionIntensity: this.options.attractionIntensity,
        repulsionRange: this.options.repulsionRange,
        repulsionIntensity: this.options.repulsionIntensity,
        particleInteractionDistance: this.options.particleInteractionDistance,
        particleRepulsionForce: this.options.particleRepulsionForce
      });
    } else {
      console.warn('ParticleNetworkPhysics not found. Physics calculations will not work properly.');
      this.physics = null;
    }
    
    // Initialize performance monitor
    if (window.ParticleNetworkPerformanceMonitor) {
      this.performanceMonitor = new window.ParticleNetworkPerformanceMonitor(this.container, {
        showOverlay: this.options.performanceOverlay
      });
    } else {
      this.performanceMonitor = null;
    }
  };
  
  /**
   * Creates and initializes particles
   */
  ParticleCore.prototype.initializeParticles = function() {
    const particleCount = Math.floor((this.container.size.width * this.container.size.height) / this.options.density);
    
    for (let i = 0; i < particleCount; i++) {
      const particle = this.createParticle(i);
      this.particles.push(particle);
    }
  };
  
  /**
   * Creates a single particle with initialized properties
   * @param {number} index - Particle index
   * @returns {Object} - New particle object
   */
  ParticleCore.prototype.createParticle = function(index) {
    // Create basic particle structure
    const particle = {
      index: index,
      x: Math.random() * this.container.size.width,
      y: Math.random() * this.container.size.height,
      size: this.options.particleSize,
      canvas: {
        width: this.container.size.width,
        height: this.container.size.height
      },
      options: this.options
    };
    
    // Generate color
    if (this.options.randomIndividualParticleColor) {
      const hue = Math.floor(Math.random() * 360);
      particle.particleColor = `hsl(${hue}, 100%, 50%)`;
    } else if (this.options.randomParticleColor) {
      if (!this.calculatedParticleColor) {
        const hue = Math.floor(Math.random() * 360);
        this.calculatedParticleColor = `hsl(${hue}, 100%, 50%)`;
      }
      particle.particleColor = this.calculatedParticleColor;
    } else {
      particle.particleColor = this.options.particleColor;
    }
    
    // Initialize physics properties if physics module available
    if (this.physics) {
      this.physics.initializeParticle(particle, this.options);
    } else {
      // Fallback velocity initialization
      particle.velocity = {
        x: (Math.random() - 0.5) * this.options.velocity,
        y: (Math.random() - 0.5) * this.options.velocity
      };
    }
    
    return particle;
  };
  
  /**
   * Initialize spatial grid for optimized collision detection
   */
  ParticleCore.prototype.initializeGrid = function() {
    // Initialize grid parameters
    this.gridCellSize = this.options.lineConnectionDistance;
    this.gridWidth = Math.ceil(this.container.size.width / this.gridCellSize);
    this.gridHeight = Math.ceil(this.container.size.height / this.gridCellSize);
    
    // Create grid
    this.grid = new Array(this.gridWidth * this.gridHeight);
    
    // Add particles to grid
    this.updateGrid();
  };
  
  /**
   * Updates the spatial partitioning grid
   */
  ParticleCore.prototype.updateGrid = function() {
    // Clear grid
    for (let i = 0; i < this.grid.length; i++) {
      this.grid[i] = [];
    }
    
    // Add particles to grid cells
    for (let i = 0; i < this.particles.length; i++) {
      const particle = this.particles[i];
      
      // Get grid position
      const cellX = Math.floor(particle.x / this.gridCellSize);
      const cellY = Math.floor(particle.y / this.gridCellSize);
      
      // Handle boundary cases
      if (cellX < 0 || cellX >= this.gridWidth || cellY < 0 || cellY >= this.gridHeight) {
        continue;
      }
      
      // Add to grid
      const cellIndex = cellY * this.gridWidth + cellX;
      if (!this.grid[cellIndex]) {
        this.grid[cellIndex] = [];
      }
      this.grid[cellIndex].push(particle);
    }
  };
  
  /**
   * Sets up interactive event listeners
   */
  ParticleCore.prototype.setupEventListeners = function() {
    if (!this.options.interactive) return;
    
    // Mouse move handler
    const mouseMoveHandler = (event) => {
      const rect = this.container.getBoundingClientRect();
      const x = (event.clientX - rect.left) * (this.container.size.width / rect.width);
      const y = (event.clientY - rect.top) * (this.container.size.height / rect.height);
      
      if (this.attractionForce) {
        this.attractionForce.x = x;
        this.attractionForce.y = y;
      }
      
      if (this.repulsionForce) {
        this.repulsionForce.x = x;
        this.repulsionForce.y = y;
      }
    };
    
    // Left button press handler (attraction)
    const mouseDownHandler = (event) => {
      if (event.button === 0) { // Left mouse button
        const rect = this.container.getBoundingClientRect();
        const x = (event.clientX - rect.left) * (this.container.size.width / rect.width);
        const y = (event.clientY - rect.top) * (this.container.size.height / rect.height);
        
        this.repulsionForce = null;
        this.attractionForce = { x, y };
      }
    };
    
    // Right button press handler (repulsion)
    const rightMouseDownHandler = (event) => {
      if (event.button === 2) { // Right mouse button
        event.preventDefault();
        
        const rect = this.container.getBoundingClientRect();
        const x = (event.clientX - rect.left) * (this.container.size.width / rect.width);
        const y = (event.clientY - rect.top) * (this.container.size.height / rect.height);
        
        this.attractionForce = null;
        this.repulsionForce = { x, y };
      }
    };
    
    // Mouse up handler
    const mouseUpHandler = () => {
      this.attractionForce = null;
      this.repulsionForce = null;
    };
    
    // Add event listeners
    this.container.addEventListener('mousemove', mouseMoveHandler);
    this.container.addEventListener('mousedown', mouseDownHandler);
    this.container.addEventListener('contextmenu', rightMouseDownHandler);
    this.container.addEventListener('mouseup', mouseUpHandler);
    this.container.addEventListener('mouseleave', mouseUpHandler);
    
    // Store handlers for potential cleanup
    this.eventHandlers = {
      mousemove: mouseMoveHandler,
      mousedown: mouseDownHandler,
      contextmenu: rightMouseDownHandler,
      mouseup: mouseUpHandler,
      mouseleave: mouseUpHandler
    };
  };
  
  /**
   * Starts the simulation loop
   */
  ParticleCore.prototype.start = function() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.lastTimestamp = performance.now();
    requestAnimationFrame(this.update.bind(this));
  };
  
  /**
   * Stops the simulation loop
   */
  ParticleCore.prototype.stop = function() {
    this.isRunning = false;
  };
  
  /**
   * Main update loop
   * @param {number} timestamp - Current animation timestamp
   */
  ParticleCore.prototype.update = function(timestamp) {
    if (!this.isRunning) return;
    
    // Request next frame
    requestAnimationFrame(this.update.bind(this));
    
    // Update physics for all particles
    this.updateParticles(timestamp);
    
    // Update grid after particles have moved
    this.updateGrid();
    
    // Detect and handle collisions/connections
    this.handleInteractions();
    
    // Render the scene
    this.renderScene(timestamp);
    
    // Update performance monitor
    if (this.performanceMonitor) {
      this.performanceMonitor.update();
    }
  };
  
  /**
   * Updates all particles' positions and velocities
   * @param {number} timestamp - Current animation timestamp
   */
  ParticleCore.prototype.updateParticles = function(timestamp) {
    for (let i = 0; i < this.particles.length; i++) {
      const particle = this.particles[i];
      
      // Use physics module if available
      if (this.physics) {
        this.physics.updateParticle(
          particle, 
          this.attractionForce, 
          this.repulsionForce
        );
      } else {
        // Very basic fallback if physics module not available
        if (particle.velocity) {
          particle.x += particle.velocity.x;
          particle.y += particle.velocity.y;
          
          // Wrap around edges
          if (particle.x > this.container.size.width) particle.x = 0;
          if (particle.x < 0) particle.x = this.container.size.width;
          if (particle.y > this.container.size.height) particle.y = 0;
          if (particle.y < 0) particle.y = this.container.size.height;
        }
      }
    }
  };
  
  /**
   * Detects and handles interactions between particles
   */
  ParticleCore.prototype.handleInteractions = function() {
    // Skip if no interactions needed
    if (!this.options.lineConnectionDistance && !this.options.particleInteractionDistance) {
      return;
    }
    
    // Store connections for rendering
    this.connections = [];
    
    // Process each cell and its neighbors in the grid
    for (let cellY = 0; cellY < this.gridHeight; cellY++) {
      for (let cellX = 0; cellX < this.gridWidth; cellX++) {
        const cellIndex = cellY * this.gridWidth + cellX;
        const cell = this.grid[cellIndex];
        
        if (!cell || cell.length === 0) continue;
        
        // Check interactions within the same cell
        this.processInteractionsInCell(cell);
        
        // Check interactions with neighboring cells
        for (let nY = Math.max(0, cellY - 1); nY <= Math.min(this.gridHeight - 1, cellY + 1); nY++) {
          for (let nX = Math.max(0, cellX - 1); nX <= Math.min(this.gridWidth - 1, cellX + 1); nX++) {
            // Skip same cell (already processed)
            if (nX === cellX && nY === cellY) continue;
            
            const neighborIndex = nY * this.gridWidth + nX;
            const neighborCell = this.grid[neighborIndex];
            
            if (!neighborCell || neighborCell.length === 0) continue;
            
            // Process interactions between cells
            this.processInteractionsBetweenCells(cell, neighborCell);
          }
        }
      }
    }
  };
  
  /**
   * Processes interactions between particles in the same cell
   * @param {Array} cell - Array of particles in the cell
   */
  ParticleCore.prototype.processInteractionsInCell = function(cell) {
    for (let i = 0; i < cell.length; i++) {
      for (let j = i + 1; j < cell.length; j++) {
        this.checkParticleInteraction(cell[i], cell[j]);
      }
    }
  };
  
  /**
   * Processes interactions between particles in different cells
   * @param {Array} cell1 - Array of particles in first cell
   * @param {Array} cell2 - Array of particles in second cell
   */
  ParticleCore.prototype.processInteractionsBetweenCells = function(cell1, cell2) {
    for (let i = 0; i < cell1.length; i++) {
      for (let j = 0; j < cell2.length; j++) {
        this.checkParticleInteraction(cell1[i], cell2[j]);
      }
    }
  };
  
  /**
   * Checks and handles interaction between two particles
   * @param {Object} particleA - First particle
   * @param {Object} particleB - Second particle
   */
  ParticleCore.prototype.checkParticleInteraction = function(particleA, particleB) {
    const dx = particleA.x - particleB.x;
    const dy = particleA.y - particleB.y;
    const distanceSq = dx * dx + dy * dy;
    
    // Skip if too close
    if (distanceSq < 0.01) return;
    
    // Check if within connection distance
    const connectionDistSq = this.options.lineConnectionDistance * this.options.lineConnectionDistance;
    if (distanceSq <= connectionDistSq) {
      // Add to connections for rendering
      this.connections.push([particleA, particleB]);
    }
    
    // Apply physics interactions if enabled
    if (this.physics && this.options.particleInteractionDistance) {
      const interactionDistSq = this.options.particleInteractionDistance * this.options.particleInteractionDistance;
      if (distanceSq <= interactionDistSq) {
        this.physics.interactParticles(
          particleA, 
          particleB, 
          this.options.particleInteractionDistance, 
          this.options.particleRepulsionForce
        );
      }
    }
  };
  
  /**
   * Renders the current state of the particle system
   * @param {number} timestamp - Current animation timestamp
   */
  ParticleCore.prototype.renderScene = function(timestamp) {
    if (!this.renderer) return;
    
    // Render everything
    this.renderer.render(
      this.particles,
      this.connections,
      timestamp
    );
  };
  
  /**
   * Handles window resize
   */
  ParticleCore.prototype.handleResize = function() {
    // Update container size
    this.container.size.width = this.container.offsetWidth;
    this.container.size.height = this.container.offsetHeight;
    
    // Update renderer if available
    if (this.renderer) {
      this.renderer.resize(
        this.container.size.width,
        this.container.size.height
      );
    }
    
    // Reinitialize grid
    this.initializeGrid();
    
    // Update particle canvas references
    for (let i = 0; i < this.particles.length; i++) {
      this.particles[i].canvas = {
        width: this.container.size.width,
        height: this.container.size.height
      };
    }
  };
  
  /**
   * Cleans up resources used by the particle system
   */
  ParticleCore.prototype.destroy = function() {
    // Stop animation
    this.stop();
    
    // Remove event listeners
    if (this.eventHandlers) {
      Object.entries(this.eventHandlers).forEach(([event, handler]) => {
        this.container.removeEventListener(event, handler);
      });
    }
    
    // Clear particles
    this.particles = [];
    this.grid = null;
    
    // Clean up renderer (if it has cleanup)
    if (this.renderer && typeof this.renderer.destroy === 'function') {
      this.renderer.destroy();
    }
    
    // Clean up physics (if it has cleanup)
    if (this.physics && typeof this.physics.destroy === 'function') {
      this.physics.destroy();
    }
    
    // Clean up performance monitor
    if (this.performanceMonitor && typeof this.performanceMonitor.destroy === 'function') {
      this.performanceMonitor.destroy();
    }
  };
  
  // Export as module or global
  if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = ParticleCore;
  } else {
    window.ParticleNetworkCore = ParticleCore;
  }
})(window); 