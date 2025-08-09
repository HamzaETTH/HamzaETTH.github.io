A dynamic  website featuring an interactive particle network background with advanced color theory and performance optimization.

## 🎯 Overview

This is a modern, minimalist personal portfolio website that showcases **Hamza E** with a sophisticated interactive particle network as the main visual element. The site combines clean typography with dynamic visual effects to create an engaging user experience.

## ✨ Features

### Interactive Particle Network
- **Real-time particle physics** with attraction/repulsion forces
- **Dynamic color cycling** with multiple color theory algorithms
- **Performance monitoring** with real-time FPS and particle count
- **Interactive controls** via keyboard shortcuts and UI panels
- **WebGL rendering** for optimal performance

### Visual Effects
- **Typewriter animation** for the main heading
- **Animated blob elements** with pulsing effects
- **Gradient line connections** between particles
- **Distance-based color differentiation**
- **Multiple color cycling methods** (hue distance, complementary, triadic, etc.)

### Technical Features
- **Modular JavaScript architecture** with separate modules for physics, rendering, and configuration
- **Performance optimization** with WebGL rendering and efficient algorithms
- **Responsive design** that works across devices
- **Accessibility considerations** with WCAG contrast options
- **Real-time configuration** via Tweakpane UI

## 🎮 Controls

- **M key**: Cycle through color differentiation methods
- **P key**: Toggle performance overlay
- **UI Panel**: Access detailed configuration options

## 🏗️ Architecture

### Core Modules
- `ParticleNetwork.js` - Main particle system orchestrator
- `ParticlePhysics.js` - Physics calculations and particle behavior
- `ParticleRenderer.js` - Canvas-based rendering
- `ParticleRendererGL.js` - WebGL rendering for performance
- `ColorUtils.js` - Advanced color theory and generation
- `PerformanceMonitor.js` - Real-time performance tracking
- `Config.js` - Centralized configuration management

### File Structure
```
├── index.html          # Main HTML file
├── css/
│   └── style.css      # Styling and animations
├── js/
│   ├── Config.js      # Configuration management
│   ├── ColorUtils.js  # Color theory utilities
│   ├── ParticleCore.js # Core particle system
│   ├── ParticleNetwork.js # Main orchestrator
│   ├── ParticlePhysics.js # Physics engine
│   ├── ParticleRenderer.js # Canvas renderer
│   ├── ParticleRendererGL.js # WebGL renderer
│   └── PerformanceMonitor.js # Performance tracking
└── [favicon files]    # Site icons
```

## 🎨 Color Theory

The project implements sophisticated color theory with multiple algorithms:
- **Hue Distance**: Simple hue-based color differentiation
- **Complementary**: Opposite colors on the color wheel
- **Triadic**: Three colors equally spaced on the wheel
- **Analogous**: Adjacent colors for harmony
- **LAB Perceptual**: Human-perceived color differences
- **WCAG Contrast**: Accessibility-focused color selection

## ⚡ Performance

- **WebGL rendering** for hardware acceleration
- **Efficient particle management** with spatial partitioning
- **Real-time performance monitoring** with FPS tracking
- **Configurable particle density** and rendering quality
- **Optimized color calculations** with caching

## 🚀 Getting Started

1. Clone the repository
2. Open `index.html` in a modern web browser
3. Interact with the particle network using mouse/touch
4. Use keyboard shortcuts for additional controls

## 🛠️ Technologies

- **HTML5** - Semantic markup
- **CSS3** - Styling and animations
- **Vanilla JavaScript** - No frameworks, pure performance
- **WebGL** - Hardware-accelerated rendering
- **Canvas API** - Fallback rendering
- **Tweakpane** - Real-time configuration UI

## 📱 Browser Support

- Modern browsers with WebGL support
- Chrome, Firefox, Safari, Edge
- Mobile browsers with touch interaction

## 🎯 Design Philosophy

- **Minimalist aesthetic** with maximum impact
- **Performance-first** approach with graceful degradation
- **Modular architecture** for maintainability
- **Accessibility** considerations throughout
- **Real-time interactivity** for engagement
