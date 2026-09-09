#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const catalogue = require('../js/GravityWellPresets.js');
const tolerance = 1e-8;
const expectedCounts = [5, 5, 4, 7, 9, 8, 2, 2, 3, 4, 4, 10, 3, 4, 5, 6, 8, 12,
  13, 13, 18, 18, 12, 9, 9, 16, 9, 9, 11, 9, 12, 9, 10, 6, 9, 7, 10, 12, 10, 11, 12, 7,
  9, 16, 10, 12, 8, 13];
const expectedBlackCounts = [1, 1, 1, 1, 1, 2, 2, 1, 3, 2, 2, 2, 3, 4, 5, 3, 4, 6,
  7, 6, 6, 12, 6, 3, 5, 8, 9, 1, 8, 4, 2, 1, 2, 2, 5, 2, 10, 12, 6, 1, 8, 6,
  3, 4, 4, 6, 6, 5];
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

assert.equal(catalogue.presets.length, 48);
assert.equal(new Set(catalogue.presets.map(preset => preset.id)).size, 48);
assert.equal(new Set(catalogue.presets.map(preset => preset.name)).size, 48);
const families = [...new Set(catalogue.presets.map(preset => preset.family))];
assert.equal(families.length, 8);
families.forEach(family => assert.equal(catalogue.presets.filter(preset => preset.family === family).length, 6));
const signatures = new Set();
const spins = [0.12, 0.18, 0.2, 0.15, 0.04, 0, 0.3, 0.18];
catalogue.presets.forEach((preset, index) => {
  assert.equal(preset.wells.length, expectedCounts[index], preset.id);
  assert.equal(preset.wells.filter(well => well.type === 'black').length, expectedBlackCounts[index], `${preset.id} black count`);
  assert.ok(preset.wells.length <= 18, preset.id);
  assert.ok(preset.description.length > 15, preset.id);
  assert.deepEqual(preset.motion, {
    velocity: 0.66, gravityWellSpin: spins[Math.floor(index / 6)], gravityWellForceMultiplier: 1,
    gravityWellAccelerationCapped: true, gravityWellAccelerationLimit: 1.5, curvedDrift: false
  });
  const positions = new Set();
  preset.wells.forEach(well => {
    ['x', 'y', 'radius', 'strength'].forEach(key => assert.ok(Number.isFinite(well[key]), `${preset.id}.${key}`));
    assert.ok(well.radius > 0 && well.strength > 0, preset.id);
    assert.ok(well.type === 'black' || well.type === 'white', preset.id);
    const position = `${well.x.toFixed(7)},${well.y.toFixed(7)}`;
    assert.ok(!positions.has(position), `${preset.id}: duplicate position`);
    positions.add(position);
  });
  const signature = preset.wells.map(well => `${well.type}:${well.x.toFixed(7)},${well.y.toFixed(7)}`).sort().join(';');
  assert.ok(!signatures.has(signature), `${preset.id}: duplicate arrangement`);
  signatures.add(signature);
});

// Exact independent recipe expectations protect counts, radii, phases and explicit coordinates.
['cross-cage', 'diamond-cage', 'triangular-cage', 'hexagonal-cage', 'octagonal-cage'].forEach((id, index) => {
  const count = [4, 4, 3, 6, 8][index];
  assert.ok(pointAt(points(id), 0, 0, 'black'));
  assert.equal(points(id)[0].strength, 18);
  for (let i = 0; i < count; i++) {
    const angle = (id === 'diamond-cage' ? -Math.PI / 4 : -Math.PI / 2) + Math.PI * 2 * i / count;
    assert.ok(pointAt(points(id), Math.cos(angle), Math.sin(angle), 'white'), `${id} vertex ${i}`);
  }
  symmetric(id, Math.PI * 2 / count);
});
assert.ok(pointAt(points('split-cage'), -0.25, 0, 'black'));
assert.ok(pointAt(points('split-cage'), 0.25, 0, 'black'));
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
          assert.equal(layout.wells.length, preset.wells.length);
          assert.ok(layout.bounds.left + tolerance >= layout.usableBounds.left, `${preset.id} left fit`);
          assert.ok(layout.bounds.top + tolerance >= layout.usableBounds.top, `${preset.id} top fit`);
          assert.ok(layout.bounds.right - tolerance <= layout.usableBounds.right, `${preset.id} right fit`);
          assert.ok(layout.bounds.bottom - tolerance <= layout.usableBounds.bottom, `${preset.id} bottom fit`);
          layout.wells.forEach((well, index) => {
            assert.ok(well.radius >= minRadius && well.radius <= maxRadius, `${preset.id} radius limits`);
            assert.equal(well.type, preset.wells[index].type);
            assert.ok([well.x, well.y, well.radius, well.strength].every(Number.isFinite), `${preset.id} resolved finite`);
            // One scale preserves every pairwise separation, including clamped-radius cases.
            if (index > 0) {
              const templateDistance = Math.hypot(preset.wells[index].x - preset.wells[0].x, preset.wells[index].y - preset.wells[0].y);
              near(Math.hypot(well.x - layout.wells[0].x, well.y - layout.wells[0].y), templateDistance * layout.scale * spacing / 100, `${preset.id} uniform separation`);
            }
          });
          fitCases++;
        }
      }
    }
    const compact = catalogue.resolve(preset.id, { width, height, insets, spacing: 60 });
    const wide = catalogue.resolve(preset.id, { width, height, insets, spacing: 140 });
    near(compact.scale, wide.scale, `${preset.id} stable spacing scale`);
    compact.wells.forEach((well, index) => {
      near(well.radius, wide.wells[index].radius, `${preset.id} spacing keeps radius`);
      near((well.x - compact.center.x) * 140 / 60, wide.wells[index].x - wide.center.x, `${preset.id} spacing x`);
      near((well.y - compact.center.y) * 140 / 60, wide.wells[index].y - wide.center.y, `${preset.id} spacing y`);
    });
    const weak = catalogue.resolve(preset.id, { width, height, strength: 25 });
    const strong = catalogue.resolve(preset.id, { width, height, strength: 200 });
    weak.wells.forEach((well, index) => {
      near(well.strength * 8, strong.wells[index].strength, `${preset.id} strength scale`);
      near(well.x, strong.wells[index].x, `${preset.id} strength keeps position`);
      near(well.radius, strong.wells[index].radius, `${preset.id} strength keeps radius`);
    });
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

console.log(`PASS: 48 recipes, 8 families, ${fitCases} viewport/slider/radius fits and ${checks} geometry assertions.`);
