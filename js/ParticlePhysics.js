/**
 * ParticlePhysics.js
 * 
 * A module for handling particle physics calculations in the Particle Network
 * This includes forces, motion, boundaries, and interactions between particles
 */

(function(window) {
  'use strict';
  
  // Constants
  const MINIMUM_INTERACTION_DISTANCE = 50;
  const FORCE_MULTIPLIER = 100;
  const SPEED_RECOVERY_RATE = 0.01;
  
  /**
   * Physics engine for particle simulations
   * @param {Object} options - Configuration options
   */
  function ParticlePhysics(options = {}) {
    this.options = {
      // Boundary handling
      boundaryMode: 'wrap', // 'wrap', 'bounce', or 'none'
      
      // Force parameters
      attractionRange: 5,
      attractionIntensity: 5,
      repulsionRange: 5,
      repulsionIntensity: 5,
      
      // Interaction parameters
      particleInteractionDistance: 50,
      particleRepulsionForce: 5,
      
      // Override with provided options
      ...options
    };
  }
  
  /**
   * Updates the position and velocity of a particle based on forces
   * @param {Object} particle - Particle to update
   * @param {Object} attractionForce - Attraction force position {x, y}
   * @param {Object} repulsionForce - Repulsion force position {x, y}
   */
  ParticlePhysics.prototype.updateParticle = function(particle, attractionForce, repulsionForce) {
    const originalSpeed = particle.options.velocity;
    
    // Apply attraction force if present
    if (particle.options.interactive && attractionForce) {
      this.applyAttractionForce(
        particle, 
        attractionForce, 
        this.options.attractionRange, 
        this.options.attractionIntensity
      );
    }
    
    // Apply repulsion force if present
    if (particle.options.interactive && repulsionForce) {
      this.applyRepulsionForce(
        particle, 
        repulsionForce, 
        this.options.repulsionRange, 
        this.options.repulsionIntensity
      );
    }
    
    // Regulate particle speed
    this.regulateParticleSpeed(particle, originalSpeed);
    
    // Update position based on velocity
    particle.x += particle.velocity.x;
    particle.y += particle.velocity.y;
    
    // Handle boundaries
    this.handleBoundaries(particle);
  };
  
  /**
   * Applies an attraction force to a particle
   * @param {Object} particle - Particle to apply force to
   * @param {Object} forcePosition - Position of the force {x, y}
   * @param {number} range - Range multiplier for the force
   * @param {number} intensity - Intensity multiplier for the force
   */
  ParticlePhysics.prototype.applyAttractionForce = function(particle, forcePosition, range, intensity) {
    const dx = forcePosition.x - particle.x;
    const dy = forcePosition.y - particle.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Ensure minimum distance to prevent extreme forces
    const safeDistance = Math.max(distance, MINIMUM_INTERACTION_DISTANCE);
    
    const directionX = dx / safeDistance;
    const directionY = dy / safeDistance;
    
    // Calculate attraction force (negative to pull toward the force position)
    const forceMagnitude = (-FORCE_MULTIPLIER / (safeDistance * safeDistance)) * range * intensity;
    
    // Apply force to particle velocity
    particle.velocity.x += forceMagnitude * directionX;
    particle.velocity.y += forceMagnitude * directionY;
  };
  
  /**
   * Applies a repulsion force to a particle
   * @param {Object} particle - Particle to apply force to
   * @param {Object} forcePosition - Position of the force {x, y}
   * @param {number} range - Range multiplier for the force
   * @param {number} intensity - Intensity multiplier for the force
   */
  ParticlePhysics.prototype.applyRepulsionForce = function(particle, forcePosition, range, intensity) {
    const dx = forcePosition.x - particle.x;
    const dy = forcePosition.y - particle.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Ensure minimum distance to prevent extreme forces
    const safeDistance = Math.max(distance, MINIMUM_INTERACTION_DISTANCE);
    
    const directionX = dx / safeDistance;
    const directionY = dy / safeDistance;
    
    // Calculate repulsion force (positive to push away from the force position)
    const forceMagnitude = (FORCE_MULTIPLIER / (safeDistance * safeDistance)) * range * intensity;
    
    // Apply force to particle velocity
    particle.velocity.x += forceMagnitude * directionX;
    particle.velocity.y += forceMagnitude * directionY;
  };
  
  /**
   * Regulates particle speed to maintain consistent movement
   * @param {Object} particle - Particle to regulate
   * @param {number} targetSpeed - Target speed to maintain
   */
  ParticlePhysics.prototype.regulateParticleSpeed = function(particle, targetSpeed) {
    const currentSpeed = Math.sqrt(
      particle.velocity.x * particle.velocity.x + 
      particle.velocity.y * particle.velocity.y
    );
    
    // Speed recovery to maintain consistent particle speed
    if (currentSpeed < targetSpeed) {
      particle.velocity.x *= 1 + SPEED_RECOVERY_RATE;
      particle.velocity.y *= 1 + SPEED_RECOVERY_RATE;
    } else if (currentSpeed > targetSpeed) {
      particle.velocity.x *= 1 - SPEED_RECOVERY_RATE;
      particle.velocity.y *= 1 - SPEED_RECOVERY_RATE;
    }
    
    // Handle NaN velocities (which can happen with extreme values)
    if (isNaN(particle.velocity.x) || isNaN(particle.velocity.y)) {
      particle.velocity.x = (Math.random() - 0.5) * targetSpeed;
      particle.velocity.y = (Math.random() - 0.5) * targetSpeed;
    }
  };
  
  /**
   * Handles boundaries for particles
   * @param {Object} particle - Particle to check boundaries for
   */
  ParticlePhysics.prototype.handleBoundaries = function(particle) {
    const canvas = particle.canvas;
    const size = particle.size;
    
    switch(this.options.boundaryMode) {
      case 'wrap':
        // Wrap around boundaries
        if (particle.x > canvas.width + size) {
          particle.x = -size;
        } else if (particle.x < -size) {
          particle.x = canvas.width + size;
        }
        
        if (particle.y > canvas.height + size) {
          particle.y = -size;
        } else if (particle.y < -size) {
          particle.y = canvas.height + size;
        }
        break;
        
      case 'bounce':
        // Bounce off boundaries
        if (particle.x + size > canvas.width || particle.x - size < 0) {
          particle.velocity.x = -particle.velocity.x;
          // Ensure particle stays within bounds
          if (particle.x + size > canvas.width) {
            particle.x = canvas.width - size;
          } else if (particle.x - size < 0) {
            particle.x = size;
          }
        }
        
        if (particle.y + size > canvas.height || particle.y - size < 0) {
          particle.velocity.y = -particle.velocity.y;
          // Ensure particle stays within bounds
          if (particle.y + size > canvas.height) {
            particle.y = canvas.height - size;
          } else if (particle.y - size < 0) {
            particle.y = size;
          }
        }
        break;
        
      case 'none':
      default:
        // No boundary handling, particles can go outside canvas
        break;
    }
  };
  
  /**
   * Handles interactions between particles
   * @param {Array} particles - Array of all particles
   * @param {Object} options - Interaction options
   */
  ParticlePhysics.prototype.handleParticleInteractions = function(particles, options) {
    const interactionDistance = options.particleInteractionDistance;
    const repulsionForce = options.particleRepulsionForce;
    
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        this.interactParticles(particles[i], particles[j], interactionDistance, repulsionForce);
      }
    }
  };
  
  /**
   * Applies interaction forces between two particles
   * @param {Object} particleA - First particle
   * @param {Object} particleB - Second particle
   * @param {number} interactionDistance - Maximum distance for interaction
   * @param {number} repulsionForce - Strength of repulsion
   */
  ParticlePhysics.prototype.interactParticles = function(particleA, particleB, interactionDistance, repulsionForce) {
    const dx = particleA.x - particleB.x;
    const dy = particleA.y - particleB.y;
    const distanceSq = dx * dx + dy * dy;
    
    // Skip extremely close or distant particles
    if (distanceSq < 0.0001 || distanceSq > interactionDistance * interactionDistance) {
      return;
    }
    
    const distance = Math.sqrt(distanceSq);
    const centerX = (particleA.x + particleB.x) / 2;
    const centerY = (particleA.y + particleB.y) / 2;
    
    // Apply interaction forces
    this.applyParticleInteraction(
      [particleA, particleB],
      centerX,
      centerY,
      interactionDistance,
      repulsionForce
    );
  };
  
  /**
   * Applies interaction forces from a center point to multiple particles
   * @param {Array} particles - Array of particles to affect
   * @param {number} centerX - X coordinate of the interaction center
   * @param {number} centerY - Y coordinate of the interaction center
   * @param {number} interactionDistance - Maximum distance for interaction
   * @param {number} repulsionForce - Strength of repulsion
   */
  ParticlePhysics.prototype.applyParticleInteraction = function(
    particles,
    centerX,
    centerY,
    interactionDistance,
    repulsionForce
  ) {
    for (let i = 0; i < particles.length; i++) {
      const particle = particles[i];
      const dx = particle.x - centerX;
      const dy = particle.y - centerY;
      const distanceSq = dx * dx + dy * dy;
      
      if (distanceSq < interactionDistance * interactionDistance && distanceSq > 0) {
        const distance = Math.sqrt(distanceSq);
        const forceDirectionX = dx / distance;
        const forceDirectionY = dy / distance;
        
        // Calculate force (decreases linearly with distance)
        const force = (repulsionForce * (interactionDistance - distance)) / interactionDistance;
        
        // Apply force to particle velocity
        particle.velocity.x += forceDirectionX * force;
        particle.velocity.y += forceDirectionY * force;
      }
    }
  };
  
  /**
   * Convert velocity settings from string to numeric values
   * @param {string|number} speed - Velocity setting (fast, medium, slow, none or numeric)
   * @returns {number} - Numeric velocity value
   */
  ParticlePhysics.prototype.setVelocity = function(speed) {
    if (typeof speed === 'number') {
      return speed;
    }
    
    switch(speed) {
      case 'fast': return 1;
      case 'slow': return 0.33;
      case 'none': return 0;
      default: return 0.66; // medium speed
    }
  };
  
  /**
   * Initialize a particle with physics properties
   * @param {Object} particle - Particle to initialize
   * @param {Object} options - Physics options
   */
  ParticlePhysics.prototype.initializeParticle = function(particle, options) {
    const velocity = this.setVelocity(options.speed);
    
    // Set initial velocity
    particle.velocity = {
      x: (Math.random() - 0.5) * velocity,
      y: (Math.random() - 0.5) * velocity
    };
  };
  
  // Export module
  if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = ParticlePhysics;
  } else {
    window.ParticleNetworkPhysics = ParticlePhysics;
  }
})(window); 