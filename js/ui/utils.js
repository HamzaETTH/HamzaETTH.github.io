/**
 * Pure utility functions for UI parameter handling
 */

export function normalizeHex(hex) {
  if (typeof hex !== 'string') return hex;
  const m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex);
  if (!m) return hex;
  return `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`;
}

export function toCssColor(val) {
  if (typeof val === 'string') return normalizeHex(val);
  if (val && typeof val === 'object') {
    const r = 'r' in val ? val.r : 0;
    const g = 'g' in val ? val.g : 0;
    const b = 'b' in val ? val.b : 0;
    const a = 'a' in val ? val.a : 1;
    const ri = r > 1 ? Math.round(r) : Math.round(r * 255);
    const gi = g > 1 ? Math.round(g) : Math.round(g * 255);
    const bi = b > 1 ? Math.round(b) : Math.round(b * 255);
    const aa = a > 1 ? a / 255 : a;
    return `rgba(${ri}, ${gi}, ${bi}, ${aa})`;
  }
  return val;
}

export function rgbArrayToHex(arr) {
  if (!arr || arr.length < 3) return '#000000';
  const r = Math.max(0, Math.min(255, Math.round(arr[0])));
  const g = Math.max(0, Math.min(255, Math.round(arr[1])));
  const b = Math.max(0, Math.min(255, Math.round(arr[2])));
  const to2 = (n) => n.toString(16).padStart(2, '0');
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

export function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function rand01() {
  return Math.random();
}

export function randBool(p = 0.5) {
  return Math.random() < p;
}

export function randHex() {
  const to2 = (n) => n.toString(16).padStart(2, '0');
  const r = randInt(0, 255), g = randInt(0, 255), b = randInt(0, 255);
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

