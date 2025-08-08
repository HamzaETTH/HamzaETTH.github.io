/**
 * Color utilities for particle network (PascalCase export)
 * Mirrors content of colorUtils.js but keeps globals on window.ColorUtils
 */

// Color space conversion utilities
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

function hslToRgb(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  let r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b); const min = Math.min(r, g, b);
  let h, s; let l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

// RGB to LAB is omitted; if needed, import from original file

function rgbArrayToString(rgb) {
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}

var ColorDiffMethod = {
  HUE_DISTANCE: 'hueDistance',
  COMPLEMENTARY: 'complementary',
  TRIADIC: 'triadic',
  ANALOGOUS: 'analogous',
  LAB_PERCEPTUAL: 'labPerceptual',
  WCAG_CONTRAST: 'wcagContrast'
};

var ColorUtils = {
  hexToRgb: function(hex) { return hexToRgb(hex); },
  hslToRgb: function(h, s, l) { return hslToRgb(h, s, l); },
  rgbToHsl: function(r, g, b) { return rgbToHsl(r, g, b); },
  // Convenience: array forms
  hexToRgbArray: function(hex) { const o = hexToRgb(hex); return o ? [o.r, o.g, o.b] : [255,255,255]; },
  interpolateRgb: function(startArr, endArr, factor) {
    const out = [0,0,0];
    for (var i=0;i<3;i++) out[i] = Math.round(startArr[i] + factor * (endArr[i] - startArr[i]));
    return out;
  },
  rgbArrayToString: function(rgb) { return rgbArrayToString(rgb); },
  hueDistance: function(baseHue, minDifference = 50) {
    const range = 360 - 2 * minDifference;
    const randomValue = Math.floor(Math.random() * range);
    return (baseHue + minDifference + randomValue) % 360;
  },
  complementary: function(baseHue) { return (baseHue + 180) % 360; },
  triadic: function(baseHue, index = 1) { return (baseHue + 120 * index) % 360; },
  analogous: function(baseHue, index = 1, spread = 30) { return (baseHue + spread * index) % 360; },
  generateDistinctColor: function(baseHue, method = ColorDiffMethod.HUE_DISTANCE, options = {}) {
    switch(method) {
      case ColorDiffMethod.HUE_DISTANCE: return this.hueDistance(baseHue, options.minDifference || 50);
      case ColorDiffMethod.COMPLEMENTARY: return this.complementary(baseHue);
      case ColorDiffMethod.TRIADIC: return this.triadic(baseHue, options.index || 1);
      case ColorDiffMethod.ANALOGOUS: return this.analogous(baseHue, options.index || 1, options.spread || 30);
      default: return this.hueDistance(baseHue);
    }
  }
};

window.ColorUtils = window.ColorUtils || ColorUtils;
window.ColorDiffMethod = window.ColorDiffMethod || ColorDiffMethod;

/**
 * Color utilities for particle network
 * Provides multiple color differentiation methods
 */

// Color space conversion utilities
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

function hslToRgb(h, s, l) {
  h /= 360;
  s /= 100;
  l /= 100;
  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }

  return { 
    r: Math.round(r * 255), 
    g: Math.round(g * 255), 
    b: Math.round(b * 255) 
  };
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0; // achromatic
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    
    h /= 6;
  }

  return { 
    h: Math.round(h * 360), 
    s: Math.round(s * 100), 
    l: Math.round(l * 100) 
  };
}

// RGB to LAB conversion (simplified)
function rgbToLab(r, g, b) {
  // Convert RGB to XYZ
  r /= 255; g /= 255; b /= 255;
  
  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
  
  // Observer = 2°, Illuminant = D65
  const x = r * 0.4124 + g * 0.3576 + b * 0.1805;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = r * 0.0193 + g * 0.1192 + b * 0.9505;
  
  // Convert XYZ to LAB
  const xn = 0.95047;
  const yn = 1.0;
  const zn = 1.08883;
  
  const fx = x > 0.008856 ? Math.pow(x / xn, 1/3) : (7.787 * x / xn) + 16/116;
  const fy = y > 0.008856 ? Math.pow(y / yn, 1/3) : (7.787 * y / yn) + 16/116;
  const fz = z > 0.008856 ? Math.pow(z / zn, 1/3) : (7.787 * z / zn) + 16/116;
  
  const L = (116 * fy) - 16;
  const a = 500 * (fx - fy);
  const b2 = 200 * (fy - fz);
  
  return { L, a, b: b2 };
}

// Calculate color difference in LAB space (Delta E)
function deltaE(lab1, lab2) {
  return Math.sqrt(
    Math.pow(lab1.L - lab2.L, 2) +
    Math.pow(lab1.a - lab2.a, 2) +
    Math.pow(lab1.b - lab2.b, 2)
  );
}

// Calculate WCAG contrast ratio
function contrastRatio(rgb1, rgb2) {
  const getLuminance = (rgb) => {
    const rsrgb = rgb.r / 255;
    const gsrgb = rgb.g / 255;
    const bsrgb = rgb.b / 255;
    
    const r = rsrgb <= 0.03928 ? rsrgb / 12.92 : Math.pow((rsrgb + 0.055) / 1.055, 2.4);
    const g = gsrgb <= 0.03928 ? gsrgb / 12.92 : Math.pow((gsrgb + 0.055) / 1.055, 2.4);
    const b = bsrgb <= 0.03928 ? bsrgb / 12.92 : Math.pow((bsrgb + 0.055) / 1.055, 2.4);
    
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  
  const l1 = getLuminance(rgb1);
  const l2 = getLuminance(rgb2);
  
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// Generate a random color
function generateRandomColor() {
  return Math.floor(Math.random() * 360);
}

// Color differentiation methods
var ColorDiffMethod = {
  HUE_DISTANCE: 'hueDistance',
  COMPLEMENTARY: 'complementary',
  TRIADIC: 'triadic',
  ANALOGOUS: 'analogous',
  LAB_PERCEPTUAL: 'labPerceptual',
  WCAG_CONTRAST: 'wcagContrast'
};

// Color generation methods
var ColorUtils = {
  // Expose basic converters so callers don't reimplement
  hexToRgb: function(hex) { return hexToRgb(hex); },
  hslToRgb: function(h, s, l) { return hslToRgb(h, s, l); },
  rgbToHsl: function(r, g, b) { return rgbToHsl(r, g, b); },
  // Original method - ensure minimum hue distance
  hueDistance: function(baseHue, minDifference = 50) {
    const range = 360 - 2 * minDifference;
    const randomValue = Math.floor(Math.random() * range);
    return (baseHue + minDifference + randomValue) % 360;
  },
  // Convert [r,g,b] to css rgb()
  rgbArrayToString: function(rgb) {
    return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  },
  
  // Complementary colors (opposite on color wheel)
  complementary: function(baseHue) {
    return (baseHue + 180) % 360;
  },
  
  // Triadic colors (three colors equally spaced)
  triadic: function(baseHue, index = 1) {
    return (baseHue + 120 * index) % 360;
  },
  
  // Analogous colors (adjacent on color wheel)
  analogous: function(baseHue, index = 1, spread = 30) {
    return (baseHue + spread * index) % 360;
  },
  
  // Generate a color with sufficient perceptual difference using LAB space
  labPerceptual: function(baseColor, minDeltaE = 30) {
    // Convert base color to LAB
    const baseRgb = hslToRgb(baseColor, 80, 60);
    const baseLab = rgbToLab(baseRgb.r, baseRgb.g, baseRgb.b);
    
    // Try random colors until we find one with sufficient difference
    let attempts = 0;
    let newHue, newRgb, newLab;
    
    do {
      newHue = Math.floor(Math.random() * 360);
      newRgb = hslToRgb(newHue, 80, 60);
      newLab = rgbToLab(newRgb.r, newRgb.g, newRgb.b);
      attempts++;
    } while (deltaE(baseLab, newLab) < minDeltaE && attempts < 100);
    
    return newHue;
  },
  
  // Generate a color with sufficient contrast ratio for accessibility
  wcagContrast: function(baseColor, minRatio = 4.5) {
    const baseRgb = hslToRgb(baseColor, 80, 60);
    
    // Try random colors until we find one with sufficient contrast
    let attempts = 0;
    let newHue, newRgb;
    
    do {
      newHue = Math.floor(Math.random() * 360);
      newRgb = hslToRgb(newHue, 80, 60);
      attempts++;
    } while (contrastRatio(baseRgb, newRgb) < minRatio && attempts < 100);
    
    return newHue;
  },
  
  // Wrapper function that uses the specified method
  generateDistinctColor: function(baseHue, method = ColorDiffMethod.HUE_DISTANCE, options = {}) {
    switch(method) {
      case ColorDiffMethod.HUE_DISTANCE:
        return this.hueDistance(baseHue, options.minDifference || 50);
      case ColorDiffMethod.COMPLEMENTARY:
        return this.complementary(baseHue);
      case ColorDiffMethod.TRIADIC:
        return this.triadic(baseHue, options.index || 1);
      case ColorDiffMethod.ANALOGOUS:
        return this.analogous(baseHue, options.index || 1, options.spread || 30);
      case ColorDiffMethod.LAB_PERCEPTUAL:
        return this.labPerceptual(baseHue, options.minDeltaE || 30);
      case ColorDiffMethod.WCAG_CONTRAST:
        return this.wcagContrast(baseHue, options.minRatio || 4.5);
      default:
        return this.hueDistance(baseHue);
    }
  }
};

// Export in a way that works with or without module system
window.ColorUtils = window.ColorUtils || ColorUtils;
window.ColorDiffMethod = window.ColorDiffMethod || ColorDiffMethod; 