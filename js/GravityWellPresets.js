(function(root) {
  'use strict';

  var TAU = Math.PI * 2;
  var presets = [];
  var byId = Object.create(null);
  // Include the GL halo and orbiting decorative points, not only the core.
  var visualExtentScale = 1.65;
  var visualPadding = 3;
  var familySpin = {
    'Cages': 0.12,
    'Pairs & axes': 0.18,
    'Rings': 0.2,
    'Nested': 0.15,
    'Grids': 0.04,
    'Channels': 0,
    'Spirals & curves': 0.3,
    'Clusters': 0.18,
    'Scattered anchors': 0.1,
    'Wide patterns': 0.08,
    'Distributed traps': 0
  };

  function well(x, y, type, radius, strength) {
    return { x: x, y: y, type: type || 'black', radius: radius || 0.26, strength: strength || 12 };
  }

  function center(type, strength) {
    return well(0, 0, type, 0.38, strength === undefined ? 18 : strength);
  }

  function ring(count, type, distance, phase, radius, strength) {
    distance = distance === undefined ? 1 : distance;
    phase = phase === undefined ? -Math.PI / 2 : phase;
    var result = [];
    for (var i = 0; i < count; i++) {
      var angle = phase + TAU * i / count;
      result.push(well(Math.cos(angle) * distance, Math.sin(angle) * distance,
        typeof type === 'function' ? type(i) : type, radius, strength));
    }
    return result;
  }

  function alternating(i) { return i % 2 ? 'white' : 'black'; }
  function inverseAlternating(i) { return i % 2 ? 'black' : 'white'; }

  function grid(count, type, strength) {
    var result = [];
    for (var row = 0; row < count; row++) {
      for (var col = 0; col < count; col++) {
        result.push(well(-1 + 2 * col / (count - 1), -1 + 2 * row / (count - 1),
          typeof type === 'function' ? type(row, col) : type, count === 4 ? 0.19 : 0.24,
          typeof strength === 'function' ? strength(row, col) : strength));
      }
    }
    return result;
  }

  function spiral(arms, count, type, turn, strength) {
    var result = [];
    turn = turn === undefined ? Math.PI : turn;
    for (var arm = 0; arm < arms; arm++) {
      for (var i = 0; i < count; i++) {
        var fraction = i / (count - 1);
        var angle = -Math.PI / 2 + arm * TAU / arms + fraction * turn;
        var distance = 0.3 + 0.7 * fraction;
        result.push(well(Math.cos(angle) * distance, Math.sin(angle) * distance,
          typeof type === 'function' ? type(i) : type, 0.21, strength));
      }
    }
    return result;
  }

  function galaxies(count, triangle) {
    var result = [];
    for (var i = 0; i < count; i++) {
      var angle = -Math.PI / 2 + TAU * i / count;
      var x = Math.cos(angle) * 0.65;
      var y = Math.sin(angle) * 0.65;
      result.push(well(x, y, 'black', 0.24));
      var local = triangle ? ring(3, 'white', 0.2, angle, 0.14) : [
        well(Math.cos(angle + Math.PI / 2) * 0.2, Math.sin(angle + Math.PI / 2) * 0.2, 'white', 0.14),
        well(Math.cos(angle - Math.PI / 2) * 0.2, Math.sin(angle - Math.PI / 2) * 0.2, 'white', 0.14)
      ];
      local.forEach(function(item) { item.x += x; item.y += y; result.push(item); });
    }
    return result;
  }

  function add(id, name, family, description, wells, axial, metadata) {
    metadata = metadata || {};
    var trap = metadata.trap === true;
    var preset = {
      id: id, name: name, family: family, description: description,
      wells: wells.map(function(item) { return Object.freeze(item); }), axial: !!axial,
      layout: metadata.layout === 'wide' ? 'wide' : 'uniform',
      initialParticlePlacement: metadata.initialParticlePlacement === 'spread' ? 'spread' : 'center',
      trap: trap,
      motion: Object.freeze({
        velocity: 0.66,
        gravityWellSpin: trap ? 0 : familySpin[family],
        gravityWellForceMultiplier: 1,
        gravityWellAccelerationCapped: true,
        gravityWellAccelerationLimit: 1.5,
        curvedDrift: false
      })
    };
    Object.freeze(preset.wells);
    Object.freeze(preset);
    presets.push(preset);
    byId[id] = preset;
  }

  var trapMetadata = Object.freeze({ trap: true });
  var wideMetadata = Object.freeze({ layout: 'wide', initialParticlePlacement: 'spread' });
  var wideTrapMetadata = Object.freeze({ layout: 'wide', initialParticlePlacement: 'spread', trap: true });

  add('cross-cage', 'Cross Cage', 'Cages', 'A central black hole enclosed by four cardinal white holes.',
    [center('black', 36)].concat(ring(4, 'white')), false, trapMetadata);
  add('diamond-cage', 'Diamond Cage', 'Cages', 'A central black hole with white holes on the four diagonals.',
    [center('black', 45)].concat(ring(4, 'white', 1, -Math.PI / 4)), false, trapMetadata);
  add('triangular-cage', 'Triangular Cage', 'Cages', 'An equilateral triangle of white holes around a black anchor.',
    [center('black', 36)].concat(ring(3, 'white')), false, trapMetadata);
  add('hexagonal-cage', 'Hexagonal Cage', 'Cages', 'Six evenly spaced white holes enclose a central black hole.',
    [center('black', 50)].concat(ring(6, 'white', 1, undefined, undefined, 11.5)), false, trapMetadata);
  add('octagonal-cage', 'Octagonal Cage', 'Cages', 'Eight white holes form a close perimeter around one black anchor.',
    [center('black', 50)].concat(ring(8, 'white', 1, undefined, 0.22, 8)), false, trapMetadata);
  add('split-cage', 'Split Cage', 'Cages', 'Two black anchors share a hexagonal enclosure of white holes.',
    [well(-0.25, 0, 'black', 0.3, 42), well(0.25, 0, 'black', 0.3, 42)].concat(ring(6, 'white')), false, trapMetadata);

  add('binary', 'Binary', 'Pairs & axes', 'Two equal black holes share a single axis.',
    [well(-0.65, 0, 'black', 0.42), well(0.65, 0, 'black', 0.42)], true);
  add('dipole', 'Dipole', 'Pairs & axes', 'A white repulsor faces a black attractor.',
    [well(-0.65, 0, 'white', 0.38), well(0.65, 0, 'black', 0.38)], true);
  add('triple-anchor', 'Triple Anchor', 'Pairs & axes', 'Three equal black holes along one axis.',
    [-0.85, 0, 0.85].map(function(x) { return well(x, 0, 'black', 0.3); }), true);
  add('repulsor-gate', 'Repulsor Gate', 'Pairs & axes', 'Two white holes stand between two outer black anchors.',
    [well(-0.95, 0), well(-0.35, 0, 'white'), well(0.35, 0, 'white'), well(0.95, 0)], true);
  add('quadrupole', 'Quadrupole', 'Pairs & axes', 'Black holes left and right; white holes above and below.',
    [well(-0.8, 0), well(0.8, 0), well(0, -0.8, 'white'), well(0, 0.8, 'white')]);
  var twinCages = [];
  [-0.55, 0.55].forEach(function(x) {
    twinCages.push(well(x, 0, 'black', 0.2, 32));
    ring(4, 'white', 0.24, undefined, 0.13).forEach(function(item) {
      item.x += x; twinCages.push(item);
    });
  });
  add('twin-cages', 'Twin Cages', 'Pairs & axes', 'Two miniature Cross Cages sit side by side.', twinCages, true, trapMetadata);

  add('black-triangle', 'Black Triangle', 'Rings', 'Three black holes at equilateral triangle vertices.', ring(3, 'black'));
  add('black-square', 'Black Square', 'Rings', 'Four black holes at exact square corners.', ring(4, 'black', 1, -Math.PI / 4));
  add('black-pentagon', 'Black Pentagon', 'Rings', 'Five black holes around a regular pentagon.', ring(5, 'black'));
  add('alternating-hexagon', 'Alternating Hexagon', 'Rings', 'Three black and three white holes alternate around a hexagon.', ring(6, alternating));
  add('alternating-octagon', 'Alternating Octagon', 'Rings', 'Four black and four white holes alternate around an octagon.', ring(8, alternating, 1, undefined, 0.23));
  add('alternating-dodecagon', 'Alternating Dodecagon', 'Rings', 'Six black and six white holes alternate around a twelve-sided ring.', ring(12, alternating, 1, undefined, 0.18));

  add('bullseye', 'Bullseye', 'Nested', 'A black center, six inner white holes, and six outer black holes.',
    [center()].concat(ring(6, 'white', 0.5, undefined, 0.17), ring(6, 'black', 1, undefined, 0.24)));
  add('inverse-bullseye', 'Inverse Bullseye', 'Nested', 'A white center, six inner black holes, and six outer white holes.',
    [center('white')].concat(ring(6, 'black', 0.5, undefined, 0.17), ring(6, 'white', 1, undefined, 0.24)));
  add('double-halo', 'Double Halo', 'Nested', 'Six black holes in an inner ring, surrounded by twelve white holes.',
    ring(6, 'black', 0.5, undefined, 0.17, 50).concat(ring(12, 'white', 1, undefined, 0.17)), false, trapMetadata);
  add('triple-halo', 'Triple Halo', 'Nested', 'Three concentric rings: three black, six white, and nine black holes.',
    ring(3, 'black', 0.3, undefined, 0.16).concat(ring(6, 'white', 0.65, undefined, 0.17), ring(9, 'black', 1, undefined, 0.18)));
  add('counterphase', 'Counterphase', 'Nested', 'Two alternating six-hole rings with opposite types along each radius.',
    ring(6, alternating, 0.5, undefined, 0.18).concat(ring(6, inverseAlternating, 1, undefined, 0.24)));
  add('triangle-in-hexagon', 'Triangle in Hexagon', 'Nested', 'An inner triangle of black holes inside a white hexagon.',
    ring(3, 'black', 0.45, undefined, 0.23, 48).concat(ring(6, 'white')), false, trapMetadata);

  add('checkerboard-nine', 'Checkerboard Nine', 'Grids', 'A three-by-three checkerboard with black center and corners.',
    grid(3, function(row, col) { return alternating(row + col); }));
  add('checkerboard-sixteen', 'Checkerboard Sixteen', 'Grids', 'A four-by-four grid of alternating black and white holes.',
    grid(4, function(row, col) { return alternating(row + col); }));
  add('nine-anchors', 'Nine Anchors', 'Grids', 'Nine black holes on a regular three-by-three grid.', grid(3, 'black'));
  add('white-fence', 'White Fence', 'Grids', 'Eight white holes trace a square fence around a central black hole.',
    grid(3, function(row, col) { return row === 1 && col === 1 ? 'black' : 'white'; },
      function(row, col) { return row === 1 && col === 1 ? 50 : 3.2; }), false, trapMetadata);
  var staggered = [];
  for (var row = 0; row < 3; row++) {
    var columns = row === 1 ? 3 : 4;
    for (var col = 0; col < columns; col++) {
      staggered.push(well((col - (columns - 1) / 2) * 2 / 3, (row - 1) * Math.sqrt(3) / 3,
        row === 1 ? 'white' : 'black', 0.2));
    }
  }
  add('staggered-lattice', 'Staggered Lattice', 'Grids', 'Rows of four black, three white, and four black holes with equal neighbor spacing.', staggered);
  add('four-rooms', 'Four Rooms', 'Grids', 'Four black anchors occupy quadrants divided by a white cardinal cross.',
    [well(-0.5, -0.5), well(0.5, -0.5), well(-0.5, 0.5), well(0.5, 0.5), well(0, 0, 'white')].concat(ring(4, 'white')));

  var corridor = [well(-1, 0), well(1, 0)];
  for (var i = 0; i < 5; i++) {
    corridor.push(well(-1 + i * 0.5, -0.65, 'white', 0.2), well(-1 + i * 0.5, 0.65, 'white', 0.2));
  }
  add('corridor', 'Corridor', 'Channels', 'Two parallel rows of five white holes connect two black endpoints.', corridor, true);
  var funnel = [well(1, 0, 'black', 0.32)];
  var hourglass = [well(-1, 0), well(1, 0)];
  for (var i = 0; i < 4; i++) {
    var x = -1 + i * 2 / 3;
    var funnelY = 0.65 - i * 0.15;
    var hourglassY = i === 0 || i === 3 ? 0.65 : 0.2;
    funnel.push(well(x, -funnelY, 'white', 0.2), well(x, funnelY, 'white', 0.2));
    hourglass.push(well(x, -hourglassY, 'white', 0.2), well(x, hourglassY, 'white', 0.2));
  }
  add('funnel', 'Funnel', 'Channels', 'Two mirrored rows of white holes narrow toward a black endpoint.', funnel, true);
  add('hourglass', 'Hourglass', 'Channels', 'Mirrored white sides narrow at the middle between black endpoints.', hourglass, true);
  var slalom = [well(-1, 0), well(1, 0)];
  for (var i = 0; i < 4; i++) slalom.push(well(-0.6 + i * 0.4, i % 2 ? -0.4 : 0.4, 'white', 0.23));
  add('slalom', 'Slalom', 'Channels', 'Four white holes alternate across the path between two black endpoints.', slalom, true);
  add('crossroads', 'Crossroads', 'Channels', 'A black center and four black endpoints, with white holes in the diagonal gaps.',
    [center()].concat(ring(4, 'black'), [well(-0.65, -0.65, 'white'), well(0.65, -0.65, 'white'),
      well(-0.65, 0.65, 'white'), well(0.65, 0.65, 'white')]), true);
  add('twin-jets', 'Twin Jets', 'Channels', 'A central white hole and four white flanks form passages toward two black endpoints.',
    [well(0, 0, 'white'), well(-1, 0), well(1, 0), well(-0.5, -0.45, 'white'),
      well(-0.5, 0.45, 'white'), well(0.5, -0.45, 'white'), well(0.5, 0.45, 'white')], true);

  add('double-spiral', 'Double Spiral', 'Spirals & curves', 'Two symmetric half-turn spiral arms, each with five black holes.', spiral(2, 5, 'black'));
  add('triple-spiral', 'Triple Spiral', 'Spirals & curves', 'Three rotated half-turn spiral arms, each with four black holes.', spiral(3, 4, 'black'));
  add('alternating-spiral', 'Alternating Spiral', 'Spirals & curves', 'Two five-hole spiral arms alternate black and white along their length.', spiral(2, 5, alternating));
  add('spiral-cage', 'Spiral Cage', 'Spirals & curves', 'A black center enclosed by two five-hole white spiral arms.',
    [center('black', 50)].concat(spiral(2, 5, 'white', undefined, 10)), false, trapMetadata);
  add('pinwheel', 'Pinwheel', 'Spirals & curves', 'Four curved arms each carry a black, white, and black hole.', spiral(4, 3, alternating, Math.PI / 3));
  var sCurve = [well(0, 0, 'white')];
  for (var i = 0; i < 6; i++) {
    var x = -1 + i * 0.4;
    sCurve.push(well(x, Math.sin(x * Math.PI) * 0.65, 'black', 0.23));
  }
  add('s-curve', 'S-Curve', 'Spirals & curves', 'Six black holes trace a symmetric S around a central white hole.', sCurve, true);

  add('triad-galaxies', 'Triad Galaxies', 'Clusters', 'Three equally spaced black anchors, each flanked by two white holes.', galaxies(3, false));
  add('four-galaxies', 'Four Galaxies', 'Clusters', 'Four black anchors, each surrounded by a small triangle of white holes.', galaxies(4, true));
  add('satellites', 'Satellites', 'Clusters', 'A central black hole with three black-and-white satellite groups.', [center()].concat(galaxies(3, false)));
  add('rosette', 'Rosette', 'Clusters', 'Six radial pairs each place an inner black hole beneath an outer white hole.',
    ring(6, 'black', 0.55, undefined, 0.21).concat(ring(6, 'white', 1, undefined, 0.24)));
  var bowTie = [well(0, -0.45, 'white', 0.22), well(0, 0.45, 'white', 0.22)];
  ring(3, 'black', 0.2, 0, 0.17).forEach(function(item) {
    bowTie.push(well(item.x - 0.65, item.y, 'black', 0.17), well(0.65 - item.x, item.y, 'black', 0.17));
  });
  add('bow-tie', 'Bow Tie', 'Clusters', 'Two mirrored triangular black clusters with white holes above and below the gap.', bowTie, true);
  add('compass', 'Compass', 'Clusters', 'A central black hole, four inner black anchors, and eight outer white holes.',
    [center('black', 30)].concat(ring(4, 'black', 0.45, undefined, 0.2, 20),
      ring(8, 'white', 1, undefined, 0.22)), false, trapMetadata);

  add('constellation', 'Constellation', 'Scattered anchors', 'Seven irregular anchors spread a loose constellation across the canvas.', [
    well(-0.92, -0.72, 'black', 0.18, 16), well(-0.36, -0.88, 'black', 0.16, 14),
    well(0.25, -0.62, 'white', 0.15, 7), well(0.88, -0.84, 'black', 0.2, 18),
    well(-0.72, 0.18, 'white', 0.15, 7), well(-0.08, 0.35, 'black', 0.22, 18),
    well(0.7, 0.64, 'black', 0.18, 16)
  ], false, wideMetadata);
  add('archipelago', 'Archipelago', 'Scattered anchors', 'Three separated black anchors form islands with gentle white-hole channels.', [
    well(-0.72, -0.48, 'black', 0.22, 24), well(-0.88, -0.34, 'white', 0.11, 6),
    well(-0.52, -0.62, 'white', 0.11, 6), well(0.58, -0.58, 'black', 0.22, 24),
    well(0.4, -0.72, 'white', 0.11, 6), well(0.78, -0.42, 'white', 0.11, 6),
    well(0.12, 0.58, 'black', 0.24, 26), well(-0.08, 0.72, 'white', 0.11, 6),
    well(0.34, 0.44, 'white', 0.11, 6)
  ], false, wideMetadata);
  add('open-field', 'Open Field', 'Scattered anchors', 'Twelve loose anchors leave broad open lanes across the full canvas.', [
    well(-0.9, -0.78, 'black', 0.14, 15), well(-0.35, -0.9, 'black', 0.14, 14),
    well(0.22, -0.68, 'white', 0.12, 6), well(0.86, -0.86, 'black', 0.14, 16),
    well(-0.76, -0.02, 'black', 0.15, 15), well(-0.18, -0.18, 'black', 0.14, 14),
    well(0.42, 0.08, 'black', 0.15, 15), well(0.92, -0.04, 'black', 0.14, 16),
    well(-0.88, 0.82, 'black', 0.14, 16), well(-0.28, 0.62, 'white', 0.12, 6),
    well(0.28, 0.88, 'black', 0.14, 14), well(0.8, 0.66, 'black', 0.15, 15)
  ], false, wideMetadata);
  add('drifting-islands', 'Drifting Islands', 'Scattered anchors', 'Four loose black-and-white pairs drift through separate canvas regions.', [
    well(-0.78, -0.66, 'black', 0.2, 22), well(-0.55, -0.48, 'white', 0.12, 6),
    well(0.52, -0.72, 'black', 0.2, 22), well(0.78, -0.54, 'white', 0.12, 6),
    well(-0.62, 0.58, 'black', 0.2, 22), well(-0.86, 0.76, 'white', 0.12, 6),
    well(0.68, 0.62, 'black', 0.2, 22), well(0.42, 0.8, 'white', 0.12, 6)
  ], false, wideMetadata);

  add('staggered-anchors', 'Staggered Anchors', 'Wide patterns', 'Three offset rows of anchors distribute attraction across the canvas.', [
    well(-0.72, -0.82, 'black', 0.16, 18), well(0, -0.82, 'white', 0.12, 6),
    well(0.72, -0.82, 'black', 0.16, 18), well(-0.92, 0, 'black', 0.16, 18),
    well(-0.3, 0, 'black', 0.16, 16), well(0.3, 0, 'white', 0.12, 6),
    well(0.92, 0, 'black', 0.16, 18), well(-0.72, 0.82, 'black', 0.16, 18),
    well(0, 0.82, 'white', 0.12, 6), well(0.72, 0.82, 'black', 0.16, 18)
  ], false, wideMetadata);
  add('diagonal-weave', 'Diagonal Weave', 'Wide patterns', 'Two crossing diagonal lanes weave black anchors around white guides.', [
    well(-0.9, -0.75, 'black', 0.16, 18), well(-0.45, -0.38, 'black', 0.16, 17),
    well(0, 0, 'black', 0.18, 20), well(0.45, 0.38, 'black', 0.16, 17),
    well(0.9, 0.75, 'black', 0.16, 18), well(-0.9, 0.72, 'white', 0.12, 6),
    well(-0.45, 0.36, 'black', 0.15, 16), well(0, 0.12, 'white', 0.1, 5),
    well(0.45, -0.36, 'black', 0.15, 16), well(0.9, -0.72, 'white', 0.12, 6)
  ], false, wideMetadata);
  add('braided-lanes', 'Braided Lanes', 'Wide patterns', 'Three gently braided lanes carry black anchors around a white center path.', [
    well(-0.82, -0.86, 'black', 0.15, 17), well(-0.08, -0.86, 'white', 0.11, 6),
    well(0.7, -0.86, 'black', 0.15, 17), well(-0.66, -0.3, 'black', 0.15, 17),
    well(0.12, -0.3, 'white', 0.11, 6), well(0.86, -0.3, 'black', 0.15, 17),
    well(-0.86, 0.3, 'black', 0.15, 17), well(-0.12, 0.3, 'white', 0.11, 6),
    well(0.66, 0.3, 'black', 0.15, 17), well(-0.7, 0.86, 'black', 0.15, 17),
    well(0.08, 0.86, 'white', 0.11, 6), well(0.82, 0.86, 'black', 0.15, 17)
  ], false, wideMetadata);
  add('perimeter-harbors', 'Perimeter Harbors', 'Wide patterns', 'Eight black perimeter harbors surround four gentle interior white guides.', [
    well(-0.88, -0.78, 'black', 0.16, 18), well(0, -0.9, 'black', 0.16, 18),
    well(0.88, -0.78, 'black', 0.16, 18), well(0.94, 0, 'black', 0.16, 18),
    well(0.88, 0.78, 'black', 0.16, 18), well(0, 0.9, 'black', 0.16, 18),
    well(-0.88, 0.78, 'black', 0.16, 18), well(-0.94, 0, 'black', 0.16, 18),
    well(-0.32, -0.26, 'white', 0.11, 6), well(0.32, -0.26, 'white', 0.11, 6),
    well(-0.32, 0.26, 'white', 0.11, 6), well(0.32, 0.26, 'white', 0.11, 6)
  ], false, wideMetadata);

  add('twin-havens', 'Twin Havens', 'Distributed traps', 'Two compact catching regions share the canvas without a central launch point.', [
    well(-0.62, 0, 'black', 0.22, 40), well(-0.62, -0.24, 'white', 0.11, 8),
    well(-0.38, 0, 'white', 0.11, 8), well(-0.62, 0.24, 'white', 0.11, 8),
    well(-0.86, 0, 'white', 0.11, 8), well(0.62, 0, 'black', 0.22, 40),
    well(0.62, -0.24, 'white', 0.11, 8), well(0.86, 0, 'white', 0.11, 8),
    well(0.62, 0.24, 'white', 0.11, 8), well(0.38, 0, 'white', 0.11, 8)
  ], false, wideTrapMetadata);
  add('four-havens', 'Four Havens', 'Distributed traps', 'Four quadrant anchors form separate havens around gentle white dividers.', [
    well(-0.58, -0.52, 'black', 0.2, 36), well(0.58, -0.52, 'black', 0.2, 36),
    well(-0.58, 0.52, 'black', 0.2, 36), well(0.58, 0.52, 'black', 0.2, 36),
    well(0, 0, 'white', 0.12, 8), well(0, -0.68, 'white', 0.12, 8),
    well(0.72, 0, 'white', 0.12, 8), well(0, 0.68, 'white', 0.12, 8),
    well(-0.72, 0, 'white', 0.12, 8)
  ], false, wideTrapMetadata);
  add('six-pockets', 'Six Pockets', 'Distributed traps', 'Six distributed black pockets catch particles between small white separators.', [
    well(-0.76, -0.55, 'black', 0.16, 34), well(0, -0.55, 'black', 0.16, 34),
    well(0.76, -0.55, 'black', 0.16, 34), well(-0.76, 0.55, 'black', 0.16, 34),
    well(0, 0.55, 'black', 0.16, 34), well(0.76, 0.55, 'black', 0.16, 34),
    well(-0.38, -0.55, 'white', 0.1, 6), well(0.38, -0.55, 'white', 0.1, 6),
    well(-0.38, 0.55, 'white', 0.1, 6), well(0.38, 0.55, 'white', 0.1, 6),
    well(-0.76, 0, 'white', 0.1, 6), well(0, 0, 'white', 0.1, 6),
    well(0.76, 0, 'white', 0.1, 6)
  ], false, wideTrapMetadata);
  add('corner-refuges', 'Corner Refuges', 'Distributed traps', 'Four corner refuges pull outward regions back toward nearby black anchors.', [
    well(-0.82, -0.72, 'black', 0.2, 38), well(0.82, -0.72, 'black', 0.2, 38),
    well(-0.82, 0.72, 'black', 0.2, 38), well(0.82, 0.72, 'black', 0.2, 38),
    well(-0.6, -0.5, 'white', 0.11, 8), well(0.6, -0.5, 'white', 0.11, 8),
    well(-0.6, 0.5, 'white', 0.11, 8), well(0.6, 0.5, 'white', 0.11, 8),
    well(0, 0, 'white', 0.11, 8)
  ], false, wideTrapMetadata);

  function finite(value, fallback) { return Number.isFinite(value) ? value : fallback; }
  function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }

  function resolve(id, options) {
    var preset = byId[id];
    if (!preset) return null;
    options = options || {};
    var width = Math.max(1, finite(options.width, 1000));
    var height = Math.max(1, finite(options.height, 700));
    var insets = options.insets || {};
    var left = clamp(finite(insets.left, 0), 0, width);
    var right = clamp(finite(insets.right, 0), 0, width - left);
    var top = clamp(finite(insets.top, 0), 0, height);
    var bottom = clamp(finite(insets.bottom, 0), 0, height - top);
    var halfWidth = (width - left - right) / 2;
    var halfHeight = (height - top - bottom) / 2;
    var centerX = left + halfWidth;
    var centerY = top + halfHeight;
    var spacing = clamp(finite(options.spacing, 100), 60, 140);
    var rotation = ((finite(options.rotation, 0) % 360) + 360) % 360;
    var strength = clamp(finite(options.strength, 100), 25, 200);
    var minRadius = Math.max(0, finite(options.minRadius, 24));
    var maxRadius = Math.max(minRadius, finite(options.maxRadius, 500));
    var orientation = preset.axial && height > width ? 90 : 0;
    var angle = (rotation + orientation) * Math.PI / 180;
    var cosine = Math.cos(angle);
    var sine = Math.sin(angle);
    var rotated = preset.wells.map(function(item) {
      return { x: item.x * cosine - item.y * sine, y: item.x * sine + item.y * cosine,
        radius: item.radius, type: item.type, strength: item.strength };
    });

    function radiusAt(item, scale) { return clamp(item.radius * scale, minRadius, maxRadius); }
    function fitsAt(scale) {
      return rotated.every(function(item) {
        var extent = radiusAt(item, scale) * visualExtentScale + visualPadding;
        // Reserve the maximum spacing so changing the slider moves centers while radii stay fixed.
        return Math.abs(item.x) * scale * 1.4 + extent <= halfWidth &&
          Math.abs(item.y) * scale * 1.4 + extent <= halfHeight;
      });
    }

    var fits = fitsAt(0);
    var low = 0;
    var high = Math.max(width, height) * 2;
    // Radius clamping changes the fit equation; solve one common scale for the entire collection.
    if (fits) {
      for (var iteration = 0; iteration < 48; iteration++) {
        var candidate = (low + high) / 2;
        if (fitsAt(candidate)) low = candidate;
        else high = candidate;
      }
    }
    var scaleX = low;
    var scaleY = low;
    if (preset.layout === 'wide' && fits) {
      function wideAxisScale(axis, halfExtent) {
        var result = Infinity;
        rotated.forEach(function(item) {
          var coordinate = Math.abs(item[axis]);
          if (coordinate <= 1e-9) return;
          var extent = radiusAt(item, low) * visualExtentScale + visualPadding;
          result = Math.min(result, Math.max(0, (halfExtent - extent) / (coordinate * 1.4)));
        });
        return Number.isFinite(result) ? result : low;
      }
      scaleX = wideAxisScale('x', halfWidth);
      scaleY = wideAxisScale('y', halfHeight);
    }

    var bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
    var wells = rotated.map(function(item) {
      var radius = radiusAt(item, low);
      var x = centerX + item.x * scaleX * spacing / 100;
      var y = centerY + item.y * scaleY * spacing / 100;
      var extent = radius * visualExtentScale + visualPadding;
      bounds.left = Math.min(bounds.left, x - extent);
      bounds.top = Math.min(bounds.top, y - extent);
      bounds.right = Math.max(bounds.right, x + extent);
      bounds.bottom = Math.max(bounds.bottom, y + extent);
      return { x: x, y: y, type: item.type, radius: radius, strength: item.strength * strength / 100 };
    });
    return {
      id: id, wells: wells, width: width, height: height,
      spacing: spacing, rotation: rotation, strength: strength, orientation: orientation,
      layout: preset.layout, initialParticlePlacement: preset.initialParticlePlacement, trap: preset.trap,
      center: { x: centerX, y: centerY }, scale: low, scaleX: scaleX, scaleY: scaleY,
      fits: fits, bounds: bounds,
      usableBounds: { left: left, top: top, right: width - right, bottom: height - bottom },
      visualExtentScale: visualExtentScale, visualPadding: visualPadding
    };
  }

  var api = Object.freeze({
    presets: Object.freeze(presets),
    get: function(id) { return byId[id] || null; },
    resolve: resolve,
    visualExtentScale: visualExtentScale,
    visualPadding: visualPadding
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.GravityWellPresets = api;
})(typeof window !== 'undefined' ? window : null);
