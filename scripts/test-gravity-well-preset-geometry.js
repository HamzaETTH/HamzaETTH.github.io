#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const catalogue = require('../js/GravityWellPresets.js');
const tolerance = 1e-8;
const expectedCounts = [5, 5, 4, 7, 9, 8, 2, 2, 3, 4, 4, 10, 3, 4, 5, 6, 8, 12,
  13, 13, 18, 18, 12, 9, 9, 16, 9, 9, 11, 9, 12, 9, 10, 6, 9, 7, 10, 12, 10, 11, 12, 7,
  9, 16, 10, 12, 8, 13, 7, 9, 12, 8, 10, 10, 12, 12, 10, 9, 13, 9,
  10, 12, 13, 13, 15, 10, 13, 11, 10, 12, 12, 12];
const expectedBlackCounts = [1, 1, 1, 1, 1, 2, 2, 1, 3, 2, 2, 2, 3, 4, 5, 3, 4, 6,
  7, 6, 6, 12, 6, 3, 5, 8, 9, 1, 8, 4, 2, 1, 2, 2, 5, 2, 10, 12, 6, 1, 8, 6,
  3, 4, 4, 6, 6, 5, 5, 3, 10, 4, 7, 7, 8, 8, 2, 4, 6, 4,
  5, 7, 10, 6, 12, 6, 10, 6, 7, 4, 8, 8];
const newPresets = [
  ['constellation', 'Constellation', 'Scattered anchors'],
  ['archipelago', 'Archipelago', 'Scattered anchors'],
  ['open-field', 'Open Field', 'Scattered anchors'],
  ['drifting-islands', 'Drifting Islands', 'Scattered anchors'],
  ['staggered-anchors', 'Staggered Anchors', 'Wide patterns'],
  ['diagonal-weave', 'Diagonal Weave', 'Wide patterns'],
  ['braided-lanes', 'Braided Lanes', 'Wide patterns'],
  ['perimeter-harbors', 'Perimeter Harbors', 'Wide patterns'],
  ['twin-havens', 'Twin Havens', 'Distributed traps'],
  ['four-havens', 'Four Havens', 'Distributed traps'],
  ['six-pockets', 'Six Pockets', 'Distributed traps'],
  ['corner-refuges', 'Corner Refuges', 'Distributed traps'],
  ['shattered-halo', 'Shattered Halo', 'Rings'],
  ['eclipse-crown', 'Eclipse Crown', 'Rings'],
  ['event-horizon', 'Event Horizon', 'Nested'],
  ['gravity-lens', 'Gravity Lens', 'Nested'],
  ['whirlpool-gates', 'Whirlpool Gates', 'Spirals & curves'],
  ['comet-tail', 'Comet Tail', 'Spirals & curves'],
  ['supernova-remnant', 'Supernova Remnant', 'Clusters'],
  ['binary-nebula', 'Binary Nebula', 'Clusters'],
  ['rogue-constellation', 'Rogue Constellation', 'Scattered anchors'],
  ['void-archipelago', 'Void Archipelago', 'Scattered anchors'],
  ['quantum-rift', 'Quantum Rift', 'Wide patterns'],
  ['tidal-storm', 'Tidal Storm', 'Wide patterns']
];
const trapIds = new Set([
  'cross-cage', 'diamond-cage', 'triangular-cage', 'hexagonal-cage', 'octagonal-cage',
  'split-cage', 'twin-cages', 'double-halo', 'triangle-in-hexagon', 'white-fence',
  'spiral-cage', 'compass', 'twin-havens', 'four-havens', 'six-pockets', 'corner-refuges'
]);
let checks = 0;

function near(actual, expected, message) {
  checks++;
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} != ${expected}`);
}
function points(id) { return catalogue.get(id).wells; }
function pointAt(wells, x, y, type) {
  return wells.find(well => Math.abs(well.x - x) <= tolerance && Math.abs(well.y - y) <= tolerance && (!type || well.type === type));
}
function symmetric(id, angle, preserveType = true) {
  const wells = points(id);
  wells.forEach(well => {
    const x = well.x * Math.cos(angle) - well.y * Math.sin(angle);
    const y = well.x * Math.sin(angle) + well.y * Math.cos(angle);
    const mate = pointAt(wells, x, y, preserveType ? well.type : null);
    checks++;
    assert.ok(mate, `${id}: missing symmetry partner for ${well.x}, ${well.y}`);
    if (preserveType) near(mate.radius, well.radius, `${id} symmetric radius`);
  });
}
function reflected(id, axis) {
  const wells = points(id);
  wells.forEach(well => {
    checks++;
    assert.ok(pointAt(wells, axis === 'y' ? -well.x : well.x, axis === 'x' ? -well.y : well.y, well.type), `${id}: missing ${axis} reflection`);
  });
}

assert.equal(catalogue.presets.length, 72);
assert.equal(new Set(catalogue.presets.map(preset => preset.id)).size, 72);
assert.equal(new Set(catalogue.presets.map(preset => preset.name)).size, 72);
const families = [...new Set(catalogue.presets.map(preset => preset.family))];
assert.deepEqual(families, ['Cages', 'Pairs & axes', 'Rings', 'Nested', 'Grids', 'Channels',
  'Spirals & curves', 'Clusters', 'Scattered anchors', 'Wide patterns', 'Distributed traps']);
const familyCounts = {
  'Cages': 6, 'Pairs & axes': 6, 'Rings': 8, 'Nested': 8, 'Grids': 6, 'Channels': 6,
  'Spirals & curves': 8, 'Clusters': 8, 'Scattered anchors': 6, 'Wide patterns': 6,
  'Distributed traps': 4
};
families.forEach(family => assert.equal(catalogue.presets.filter(preset => preset.family === family).length,
  familyCounts[family]));
assert.deepEqual(catalogue.presets.slice(48).map(preset => [preset.id, preset.name, preset.family]), newPresets);
const signatures = new Set();
const familySpins = {
  'Cages': 0.12, 'Pairs & axes': 0.18, 'Rings': 0.2, 'Nested': 0.15,
  'Grids': 0.04, 'Channels': 0, 'Spirals & curves': 0.3, 'Clusters': 0.18,
  'Scattered anchors': 0.1, 'Wide patterns': 0.08, 'Distributed traps': 0
};
const spinOverrides = {
  'diagonal-weave': 0.18, 'rogue-constellation': 0.16, 'void-archipelago': 0.16,
  'quantum-rift': 0.18, 'tidal-storm': 0.18
};
catalogue.presets.forEach((preset, index) => {
  assert.equal(preset.wells.length, expectedCounts[index], preset.id);
  assert.equal(preset.wells.filter(well => well.type === 'black').length, expectedBlackCounts[index], `${preset.id} black count`);
  assert.ok(preset.wells.length <= 18, preset.id);
  assert.ok(preset.description.length > 15, preset.id);
  assert.deepEqual(preset.motion, {
    velocity: 0.66, gravityWellSpin: spinOverrides[preset.id] === undefined
      ? (preset.trap ? 0 : familySpins[preset.family]) : spinOverrides[preset.id], gravityWellForceMultiplier: 0.6,
    gravityWellAccelerationCapped: true, gravityWellAccelerationLimit: 1.5, curvedDrift: false
  });
  const wide = index >= 48;
  assert.equal(preset.layout, wide ? 'wide' : 'uniform', `${preset.id} layout`);
  assert.equal(preset.initialParticlePlacement, wide ? 'spread' : 'center', `${preset.id} particle placement`);
  assert.equal(preset.trap, trapIds.has(preset.id), `${preset.id} trap classification`);
  assert.ok(Object.isFrozen(preset) && Object.isFrozen(preset.wells) && Object.isFrozen(preset.motion), `${preset.id} metadata immutable`);
  const positions = new Set();
  preset.wells.forEach(well => {
    ['x', 'y', 'radius', 'strength'].forEach(key => assert.ok(Number.isFinite(well[key]), `${preset.id}.${key}`));
    assert.ok(well.radius > 0 && well.strength > 0 && well.strength <= 50, preset.id);
    assert.ok(well.type === 'black' || well.type === 'white', preset.id);
    const position = `${well.x.toFixed(7)},${well.y.toFixed(7)}`;
    assert.ok(!positions.has(position), `${preset.id}: duplicate position`);
    positions.add(position);
  });
  const signature = preset.wells.map(well => `${well.type}:${well.x.toFixed(7)},${well.y.toFixed(7)}`).sort().join(';');
  assert.ok(!signatures.has(signature), `${preset.id}: duplicate arrangement`);
  signatures.add(signature);
  if (preset.trap) {
    const balance = preset.wells.reduce((sum, well) =>
      sum + (well.type === 'black' ? 1 : -1.5) * well.strength * well.radius * well.radius, 0);
    assert.ok(balance > 0, `${preset.id}: attraction must exceed 1.5x repulsion (${balance})`);
  }
});

// Exact independent recipe expectations protect counts, radii, phases and explicit coordinates.
['cross-cage', 'diamond-cage', 'triangular-cage', 'hexagonal-cage', 'octagonal-cage'].forEach((id, index) => {
  const count = [4, 4, 3, 6, 8][index];
  const centerStrength = [36, 45, 36, 50, 50][index];
  assert.ok(pointAt(points(id), 0, 0, 'black'));
  assert.equal(points(id)[0].strength, centerStrength);
  for (let i = 0; i < count; i++) {
    const angle = (id === 'diamond-cage' ? -Math.PI / 4 : -Math.PI / 2) + Math.PI * 2 * i / count;
    assert.ok(pointAt(points(id), Math.cos(angle), Math.sin(angle), 'white'), `${id} vertex ${i}`);
  }
  symmetric(id, Math.PI * 2 / count);
});
assert.ok(pointAt(points('split-cage'), -0.25, 0, 'black'));
assert.ok(pointAt(points('split-cage'), 0.25, 0, 'black'));
assert.ok(points('split-cage').filter(well => well.type === 'black').every(well => well.strength === 42));
['binary', 'dipole'].forEach(id => {
  assert.ok(pointAt(points(id), -0.65, 0, id === 'dipole' ? 'white' : 'black'));
  assert.ok(pointAt(points(id), 0.65, 0, 'black'));
});
[-0.85, 0, 0.85].forEach(x => assert.ok(pointAt(points('triple-anchor'), x, 0, 'black')));
[-0.95, 0.95].forEach(x => assert.ok(pointAt(points('repulsor-gate'), x, 0, 'black')));
[-0.35, 0.35].forEach(x => assert.ok(pointAt(points('repulsor-gate'), x, 0, 'white')));
[-0.55, 0.55].forEach(x => {
  assert.ok(pointAt(points('twin-cages'), x, 0, 'black'));
  [[0, -0.24], [0.24, 0], [0, 0.24], [-0.24, 0]].forEach(([dx, dy]) => assert.ok(pointAt(points('twin-cages'), x + dx, dy, 'white')));
});
['black-triangle', 'black-square', 'black-pentagon', 'alternating-hexagon', 'alternating-octagon', 'alternating-dodecagon'].forEach((id, index) => {
  const wells = points(id);
  const phase = id === 'black-square' ? -Math.PI / 4 : -Math.PI / 2;
  wells.forEach((well, i) => {
    near(well.x, Math.cos(phase + Math.PI * 2 * i / wells.length), `${id} vertex x`);
    near(well.y, Math.sin(phase + Math.PI * 2 * i / wells.length), `${id} vertex y`);
  });
  symmetric(id, Math.PI * 2 / wells.length, index < 3);
  if (index >= 3) symmetric(id, Math.PI * 4 / wells.length);
});
[
  ['bullseye', [[0, 1], [0.5, 6], [1, 6]]],
  ['inverse-bullseye', [[0, 1], [0.5, 6], [1, 6]]],
  ['double-halo', [[0.5, 6], [1, 12]]],
  ['triple-halo', [[0.3, 3], [0.65, 6], [1, 9]]],
  ['counterphase', [[0.5, 6], [1, 6]]],
  ['triangle-in-hexagon', [[0.45, 3], [1, 6]]]
].forEach(([id, rings]) => rings.forEach(([radius, count]) => {
  assert.equal(points(id).filter(well => Math.abs(Math.hypot(well.x, well.y) - radius) <= tolerance).length, count, `${id} ring ${radius}`);
}));
points('counterphase').slice(0, 6).forEach(inner => {
  const outer = pointAt(points('counterphase'), inner.x * 2, inner.y * 2);
  assert.ok(outer && inner.type !== outer.type, 'counterphase opposite radial types');
});
['checkerboard-nine', 'checkerboard-sixteen', 'nine-anchors', 'white-fence'].forEach(id => {
  const size = id === 'checkerboard-sixteen' ? 4 : 3;
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const type = id === 'nine-anchors' ? 'black' : id === 'white-fence' ?
        row === 1 && col === 1 ? 'black' : 'white' : (row + col) % 2 ? 'white' : 'black';
      assert.ok(pointAt(points(id), -1 + col * 2 / (size - 1), -1 + row * 2 / (size - 1), type), `${id} grid coordinate`);
    }
  }
});
points('staggered-lattice').forEach(well => {
  const nearest = Math.min(...points('staggered-lattice').filter(other => well !== other).map(other => Math.hypot(other.x - well.x, other.y - well.y)));
  near(nearest, 2 / 3, 'staggered equal neighbor spacing');
});
['corridor', 'funnel', 'hourglass', 'twin-jets'].forEach(id => reflected(id, 'x'));
['corridor', 'hourglass', 'twin-jets', 'bow-tie', 'twin-cages', 'four-rooms', 'staggered-lattice'].forEach(id => reflected(id, 'y'));
['slalom', 's-curve', 'quadrupole', 'split-cage', 'checkerboard-sixteen'].forEach(id => symmetric(id, Math.PI));
['double-spiral', 'triple-spiral', 'alternating-spiral', 'spiral-cage'].forEach(id => {
  const arms = id === 'triple-spiral' ? 3 : 2;
  const wells = points(id).slice(id === 'spiral-cage' ? 1 : 0);
  const count = wells.length / arms;
  wells.forEach((well, i) => {
    const sample = i % count;
    const arm = Math.floor(i / count);
    const fraction = sample / (count - 1);
    const radius = 0.3 + 0.7 * fraction;
    const angle = -Math.PI / 2 + arm * Math.PI * 2 / arms + fraction * Math.PI;
    near(well.x, Math.cos(angle) * radius, `${id} spiral x`);
    near(well.y, Math.sin(angle) * radius, `${id} spiral y`);
  });
  symmetric(id, Math.PI * 2 / arms);
});
symmetric('pinwheel', Math.PI / 2);
['triad-galaxies', 'satellites'].forEach(id => symmetric(id, Math.PI * 2 / 3));
symmetric('four-galaxies', Math.PI / 2);
symmetric('rosette', Math.PI / 3);
symmetric('compass', Math.PI / 2);
['triad-galaxies', 'four-galaxies', 'satellites'].forEach(id => {
  const wells = points(id);
  const anchors = wells.filter(well => well.type === 'black' && Math.hypot(well.x, well.y) > tolerance);
  anchors.forEach(anchor => {
    near(Math.hypot(anchor.x, anchor.y), 0.65, `${id} group center`);
    const neighbors = wells.filter(well => well.type === 'white' && Math.abs(Math.hypot(well.x - anchor.x, well.y - anchor.y) - 0.2) <= tolerance);
    assert.equal(neighbors.length, id === 'four-galaxies' ? 3 : 2, `${id} local group`);
  });
});

const viewports = [[1440, 900], [3440, 1440], [800, 800], [390, 844], [844, 390], [320, 568], [568, 320]];
let fitCases = 0;
catalogue.presets.forEach(preset => {
  viewports.forEach(([width, height]) => {
    const insets = width < 900 ? { top: 76, right: 12, bottom: 20, left: 12 } : { top: 24, right: 24, bottom: 24, left: 24 };
    for (const spacing of [60, 100, 140]) {
      for (const rotation of [0, 33, 90, 177, 270, 360]) {
        for (const [minRadius, maxRadius] of [[24, 500], [24, 30], [40, 500]]) {
          const options = { width, height, insets, spacing, rotation, minRadius, maxRadius };
          const layout = catalogue.resolve(preset.id, options);
          assert.ok(layout.fits && layout.scale > 0, `${preset.id}: fit ${JSON.stringify(options)}`);
          assert.equal(layout.layout, preset.layout);
          assert.equal(layout.initialParticlePlacement, preset.initialParticlePlacement);
          assert.equal(layout.trap, preset.trap);
          assert.equal(layout.wells.length, preset.wells.length);
          assert.ok(layout.bounds.left + tolerance >= layout.usableBounds.left, `${preset.id} left fit`);
          assert.ok(layout.bounds.top + tolerance >= layout.usableBounds.top, `${preset.id} top fit`);
          assert.ok(layout.bounds.right - tolerance <= layout.usableBounds.right, `${preset.id} right fit`);
          assert.ok(layout.bounds.bottom - tolerance <= layout.usableBounds.bottom, `${preset.id} bottom fit`);
          layout.wells.forEach((well, index) => {
            assert.ok(well.radius >= minRadius && well.radius <= maxRadius, `${preset.id} radius limits`);
            assert.equal(well.type, preset.wells[index].type);
            assert.ok([well.x, well.y, well.radius, well.strength].every(Number.isFinite), `${preset.id} resolved finite`);
            const angle = (rotation + layout.orientation) * Math.PI / 180;
            const templateX = preset.wells[index].x * Math.cos(angle) - preset.wells[index].y * Math.sin(angle);
            const templateY = preset.wells[index].x * Math.sin(angle) + preset.wells[index].y * Math.cos(angle);
            near(well.x - layout.center.x, templateX * layout.scaleX * spacing / 100, `${preset.id} resolved x`);
            near(well.y - layout.center.y, templateY * layout.scaleY * spacing / 100, `${preset.id} resolved y`);
            near(well.radius, Math.max(minRadius, Math.min(maxRadius, preset.wells[index].radius * layout.scale)), `${preset.id} circular radius`);
            // Existing recipes retain one scale and every pairwise separation.
            if (index > 0) {
              const templateDistance = Math.hypot(preset.wells[index].x - preset.wells[0].x, preset.wells[index].y - preset.wells[0].y);
              if (preset.layout === 'uniform') {
                near(Math.hypot(well.x - layout.wells[0].x, well.y - layout.wells[0].y), templateDistance * layout.scale * spacing / 100, `${preset.id} uniform separation`);
              }
            }
          });
          if (preset.layout === 'uniform') {
            near(layout.scaleX, layout.scale, `${preset.id} legacy x scale`);
            near(layout.scaleY, layout.scale, `${preset.id} legacy y scale`);
          } else {
            assert.ok(layout.scaleX + tolerance >= layout.scale && layout.scaleY + tolerance >= layout.scale,
              `${preset.id}: wide center scales must not contract the legacy fit`);
          }
          fitCases++;
        }
      }
    }
    const compact = catalogue.resolve(preset.id, { width, height, insets, spacing: 60 });
    const wide = catalogue.resolve(preset.id, { width, height, insets, spacing: 140 });
    near(compact.scale, wide.scale, `${preset.id} stable spacing scale`);
    near(compact.scaleX, wide.scaleX, `${preset.id} stable spacing x scale`);
    near(compact.scaleY, wide.scaleY, `${preset.id} stable spacing y scale`);
    compact.wells.forEach((well, index) => {
      near(well.radius, wide.wells[index].radius, `${preset.id} spacing keeps radius`);
      near((well.x - compact.center.x) * 140 / 60, wide.wells[index].x - wide.center.x, `${preset.id} spacing x`);
      near((well.y - compact.center.y) * 140 / 60, wide.wells[index].y - wide.center.y, `${preset.id} spacing y`);
    });
    const weak = catalogue.resolve(preset.id, { width, height, strength: 25 });
    const strong = catalogue.resolve(preset.id, { width, height, strength: 200 });
    weak.wells.forEach((well, index) => {
      near(well.strength * 8, strong.wells[index].strength, `${preset.id} strength scale`);
      assert.ok(strong.wells[index].strength <= 100, `${preset.id} 200% strength within controls`);
      near(well.x, strong.wells[index].x, `${preset.id} strength keeps position`);
      near(well.radius, strong.wells[index].radius, `${preset.id} strength keeps radius`);
    });
  });
});
newPresets.forEach(([id]) => {
  viewports.forEach(([width, height]) => {
    const insets = width < 900 ? { top: 76, right: 12, bottom: 20, left: 12 } :
      { top: 24, right: 24, bottom: 24, left: 24 };
    const layout = catalogue.resolve(id, { width, height, insets });
    const centerWidth = Math.max(...layout.wells.map(well => well.x)) - Math.min(...layout.wells.map(well => well.x));
    const centerHeight = Math.max(...layout.wells.map(well => well.y)) - Math.min(...layout.wells.map(well => well.y));
    const usableWidth = layout.usableBounds.right - layout.usableBounds.left;
    const usableHeight = layout.usableBounds.bottom - layout.usableBounds.top;
    const visualWidth = layout.bounds.right - layout.bounds.left;
    const visualHeight = layout.bounds.bottom - layout.bounds.top;
    assert.ok(centerWidth / usableWidth >= 0.35, `${id}: wide centers must span width at ${width}x${height}`);
    assert.ok(centerHeight / usableHeight >= 0.35, `${id}: wide centers must span height at ${width}x${height}`);
    assert.ok(visualWidth / usableWidth >= 0.65, `${id}: wide visuals must fill width at ${width}x${height}`);
    assert.ok(visualHeight / usableHeight >= 0.65, `${id}: wide visuals must fill height at ${width}x${height}`);
  });
});
const axialDesktop = catalogue.resolve('binary', { width: 1440, height: 900 });
const axialPhone = catalogue.resolve('binary', { width: 390, height: 844 });
near(axialDesktop.wells[0].y, axialDesktop.wells[1].y, 'desktop horizontal axis');
near(axialPhone.wells[0].x, axialPhone.wells[1].x, 'portrait vertical axis');
assert.ok(axialPhone.wells[0].y < axialPhone.wells[1].y, 'portrait positive orientation');
assert.deepEqual(catalogue.resolve('cross-cage', { width: 390, height: 844, dpr: 1 }), catalogue.resolve('cross-cage', { width: 390, height: 844, dpr: 3 }));
assert.deepEqual(catalogue.resolve('binary', { rotation: 0 }), catalogue.resolve('binary', { rotation: 360 }));
assert.equal(catalogue.get('missing'), null);
assert.equal(catalogue.resolve('missing'), null);
assert.equal(catalogue.resolve('binary', { width: 30, height: 30 }).fits, false, 'impossible minimum radius is explicit');
const snapshot = JSON.stringify(catalogue.presets);
catalogue.resolve('binary').wells[0].x = 99999;
assert.equal(JSON.stringify(catalogue.presets), snapshot, 'resolving returns fresh wells');
assert.ok(Object.isFrozen(catalogue.presets) && Object.isFrozen(catalogue.get('binary').wells[0]), 'templates are immutable');

console.log(`PASS: 72 recipes, 11 families, ${fitCases} viewport/slider/radius fits and ${checks} geometry assertions.`);
