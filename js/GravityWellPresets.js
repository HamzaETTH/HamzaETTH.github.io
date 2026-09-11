(function(root) {
  'use strict';

  var TAU = Math.PI * 2;
  var presets = [];
  var byId = Object.create(null);
  // Include the GL halo and orbiting decorative points, not only the core.
  var visualExtentScale = 1.65;
  var visualPadding = 3;
  var particleEnvelopeScale = Object.freeze({
    desktop: visualExtentScale * 1.7,
    // Mobile force influence reaches 2r. Keep that layout clearance separate
    // from Orbit Assist's deliberately tighter 1.2x visual-radius target.
    touch: 2,
    purePhysics: 1.8
  });
  var orbitAssistRadiusRatio = Object.freeze({
    desktop: Object.freeze({ min: 1.25, max: 1.7 }),
    touch: Object.freeze({ min: 1.08, max: 1.2 })
  });
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
    'Distributed traps': 0,
    'Impossible Machines': 0.18,
    'Living Cosmos': 0.16,
    'Monuments & Relics': 0.1,
    'Chaotic Arenas': 0.22
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

  function arc(count, type, radiusX, radiusY, startAngle, endAngle, radius, strength) {
    var result = [];
    for (var i = 0; i < count; i++) {
      var fraction = count === 1 ? 0.5 : i / (count - 1);
      var angle = startAngle + (endAngle - startAngle) * fraction;
      result.push(well(Math.cos(angle) * radiusX, Math.sin(angle) * radiusY,
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
    var stableOrbit = metadata.stableOrbit !== false;
    var spin = Number.isFinite(metadata.spin) ? metadata.spin : (trap ? 0 : familySpin[family]);
    var preset = {
      id: id, name: name, family: family, description: description,
      wells: wells.map(function(item) { return Object.freeze(item); }), axial: !!axial,
      layout: metadata.layout === 'wide' ? 'wide' : 'uniform',
      initialParticlePlacement: metadata.initialParticlePlacement === 'spread'
        ? 'spread'
        : (stableOrbit ? 'orbit' : 'center'),
      trap: trap, stableOrbit: stableOrbit,
      motion: Object.freeze({
        velocity: 0.66,
        gravityWellSpin: spin,
        gravityWellForceMultiplier: 0.6,
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
  var wideFlowMetadata = Object.freeze({ layout: 'wide', initialParticlePlacement: 'spread', spin: 0.18 });
  var wideSurgeMetadata = Object.freeze({ layout: 'wide', initialParticlePlacement: 'spread', spin: 0.24 });
  var wideScatterMetadata = Object.freeze({ layout: 'wide', initialParticlePlacement: 'spread', spin: 0.16 });
  var wideTrapMetadata = Object.freeze({ layout: 'wide', initialParticlePlacement: 'spread', trap: true });
  var naturalOrbitMetadata = Object.freeze({ stableOrbit: false });

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
    [well(-0.65, 0, 'black', 0.42), well(0.65, 0, 'black', 0.42)], true, naturalOrbitMetadata);
  add('dipole', 'Dipole', 'Pairs & axes', 'A white repulsor faces a black attractor.',
    [well(-0.65, 0, 'white', 0.38), well(0.65, 0, 'black', 0.38)], true, naturalOrbitMetadata);
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
  ], false, wideFlowMetadata);
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

  add('shattered-halo', 'Shattered Halo', 'Rings', 'Opposing black and white arcs leave two open breaks in an elliptical orbit.',
    arc(5, 'black', 1, 0.78, -Math.PI * 0.9, -Math.PI * 0.15, 0.16, 18)
      .concat(arc(5, 'white', 1, 0.78, Math.PI * 0.1, Math.PI * 0.85, 0.13, 7)), false, wideMetadata);
  add('eclipse-crown', 'Eclipse Crown', 'Rings', 'A broad black outer crown faces a smaller white counter-arc across an open center.',
    arc(7, 'black', 1, 0.82, Math.PI, TAU, 0.15, 18)
      .concat(arc(5, 'white', 0.68, 0.82, 0, Math.PI, 0.12, 7)), false, wideMetadata);

  add('event-horizon', 'Event Horizon', 'Nested', 'A white core drives particles through a dense inner ring and a broken outer horizon.',
    [center('white', 8)].concat(
      ring(6, 'black', 0.58, -Math.PI / 2, 0.17, 20),
      ring(6, function(i) { return i % 3 === 0 ? 'white' : 'black'; }, 1, -Math.PI / 2, 0.14, 12)
    ), false, wideMetadata);
  add('gravity-lens', 'Gravity Lens', 'Nested', 'Twin black focal points bend flow around a vertical chain of white lensing guides.', [
    well(-0.62, 0, 'black', 0.22, 24), well(0.62, 0, 'black', 0.22, 24),
    well(-0.86, -0.62, 'black', 0.15, 16), well(-0.86, 0.62, 'black', 0.15, 16),
    well(0.86, -0.62, 'black', 0.15, 16), well(0.86, 0.62, 'black', 0.15, 16),
    well(0, 0, 'white', 0.15, 8), well(0, -0.78, 'white', 0.12, 7),
    well(0, 0.78, 'white', 0.12, 7), well(-0.28, -0.34, 'white', 0.1, 5),
    well(0.28, -0.34, 'white', 0.1, 5), well(-0.28, 0.34, 'white', 0.1, 5),
    well(0.28, 0.34, 'white', 0.1, 5)
  ], false, wideMetadata);

  add('whirlpool-gates', 'Whirlpool Gates', 'Spirals & curves', 'Three black spiral arms curl past white gates positioned between their inner turns.',
    spiral(3, 4, 'black', Math.PI * 0.8, 16)
      .concat(ring(3, 'white', 0.62, -Math.PI / 6, 0.12, 7)), false, wideMetadata);
  add('comet-tail', 'Comet Tail', 'Spirals & curves', 'A heavy black head pulls a curved diagonal tail past four offset white deflectors.', [
    well(0.82, 0.72, 'black', 0.25, 26), well(0.48, 0.36, 'black', 0.19, 21),
    well(0.12, 0.08, 'black', 0.16, 18), well(-0.26, -0.18, 'black', 0.14, 16),
    well(-0.62, -0.44, 'black', 0.13, 15), well(-0.92, -0.7, 'black', 0.12, 14),
    well(0.68, 0.18, 'white', 0.11, 6), well(0.28, -0.12, 'white', 0.11, 6),
    well(-0.18, -0.42, 'white', 0.11, 6), well(-0.58, -0.7, 'white', 0.11, 6)
  ], false, wideMetadata);

  add('supernova-remnant', 'Supernova Remnant', 'Clusters', 'Broken black shock fronts surround a white core and two distant white ejecta knots.',
    [center('white', 9)].concat(
      arc(6, 'black', 0.86, 0.58, -Math.PI * 0.9, Math.PI * 0.15, 0.15, 17),
      arc(4, 'black', 0.72, 0.92, Math.PI * 0.35, Math.PI * 0.85, 0.14, 16),
      [well(-0.92, 0.76, 'white', 0.11, 6), well(0.88, -0.72, 'white', 0.11, 6)]
    ), false, wideMetadata);
  add('binary-nebula', 'Binary Nebula', 'Clusters', 'Two offset three-anchor nebulae exchange particles across a chain of white bridge points.', [
    well(-0.58, -0.22, 'black', 0.22, 24), well(-0.82, -0.55, 'black', 0.14, 16),
    well(-0.35, -0.55, 'black', 0.14, 16), well(0.58, 0.22, 'black', 0.22, 24),
    well(0.35, 0.55, 'black', 0.14, 16), well(0.82, 0.55, 'black', 0.14, 16),
    well(0, 0, 'white', 0.14, 7), well(-0.85, 0.05, 'white', 0.1, 5),
    well(-0.32, 0.05, 'white', 0.1, 5), well(0.32, -0.05, 'white', 0.1, 5),
    well(0.85, -0.05, 'white', 0.1, 5)
  ], false, wideMetadata);

  add('rogue-constellation', 'Rogue Constellation', 'Scattered anchors', 'An asymmetric star map alternates isolated black anchors with three distant white disruptors.', [
    well(-0.92, -0.75, 'black', 0.16, 18), well(-0.52, -0.3, 'white', 0.11, 6),
    well(-0.12, -0.82, 'black', 0.15, 17), well(0.24, -0.25, 'black', 0.18, 20),
    well(0.82, -0.68, 'white', 0.11, 6), well(-0.78, 0.52, 'black', 0.16, 18),
    well(-0.28, 0.18, 'black', 0.14, 16), well(0.12, 0.72, 'white', 0.11, 6),
    well(0.55, 0.34, 'black', 0.17, 19), well(0.92, 0.82, 'black', 0.15, 17)
  ], false, wideScatterMetadata);
  add('void-archipelago', 'Void Archipelago', 'Scattered anchors', 'Four separated black islands carry paired white currents with a large empty sea between them.', [
    well(-0.72, -0.56, 'black', 0.2, 22), well(-0.92, -0.7, 'white', 0.1, 6),
    well(-0.5, -0.36, 'white', 0.1, 6), well(0.62, -0.68, 'black', 0.2, 22),
    well(0.42, -0.82, 'white', 0.1, 6), well(0.84, -0.5, 'white', 0.1, 6),
    well(-0.48, 0.58, 'black', 0.2, 22), well(-0.7, 0.42, 'white', 0.1, 6),
    well(-0.24, 0.78, 'white', 0.1, 6), well(0.78, 0.5, 'black', 0.2, 22),
    well(0.56, 0.7, 'white', 0.1, 6), well(0.96, 0.32, 'white', 0.1, 6)
  ], false, wideScatterMetadata);

  add('quantum-rift', 'Quantum Rift', 'Wide patterns', 'Two staggered black walls frame an empty rift crossed by four small white sparks.', [
    well(-0.72, -0.86, 'black', 0.15, 18), well(-0.86, -0.28, 'black', 0.15, 18),
    well(-0.66, 0.28, 'black', 0.15, 18), well(-0.82, 0.86, 'black', 0.15, 18),
    well(0.82, -0.86, 'black', 0.15, 18), well(0.66, -0.28, 'black', 0.15, 18),
    well(0.86, 0.28, 'black', 0.15, 18), well(0.72, 0.86, 'black', 0.15, 18),
    well(-0.14, -0.62, 'white', 0.1, 6), well(0.14, -0.18, 'white', 0.1, 6),
    well(-0.14, 0.22, 'white', 0.1, 6), well(0.14, 0.68, 'white', 0.1, 6)
  ], false, wideFlowMetadata);
  add('tidal-storm', 'Tidal Storm', 'Wide patterns', 'Eight black anchors sweep around a rotated perimeter while four white eyes twist the center.', [
    well(-0.86, -0.25, 'black', 0.15, 18), well(-0.5, -0.78, 'black', 0.15, 18),
    well(0.25, -0.88, 'black', 0.15, 18), well(0.78, -0.5, 'black', 0.15, 18),
    well(0.88, 0.25, 'black', 0.15, 18), well(0.5, 0.78, 'black', 0.15, 18),
    well(-0.25, 0.88, 'black', 0.15, 18), well(-0.78, 0.5, 'black', 0.15, 18),
    well(-0.32, -0.1, 'white', 0.11, 6), well(0.1, -0.32, 'white', 0.11, 6),
    well(0.32, 0.1, 'white', 0.11, 6), well(-0.1, 0.32, 'white', 0.11, 6)
  ], false, wideFlowMetadata);

  add('slingshot', 'Slingshot', 'Pairs & axes', 'Three offset black anchors bend a fast diagonal current through white aiming points.', [
    well(-0.92, 0.52, 'black', 0.22, 24), well(-0.15, 0.05, 'black', 0.18, 20),
    well(0.88, -0.68, 'black', 0.2, 22), well(-0.62, -0.15, 'white', 0.11, 6),
    well(0.15, 0.66, 'white', 0.11, 6), well(0.52, -0.18, 'white', 0.11, 6)
  ], false, wideMetadata);
  add('lagrange-run', 'Lagrange Run', 'Pairs & axes', 'Four black waypoints and three white pivots create a sweeping orbital transfer path.', [
    well(-0.9, 0, 'black', 0.18, 20), well(-0.25, -0.55, 'black', 0.18, 20),
    well(0.35, 0.48, 'black', 0.18, 20), well(0.92, -0.1, 'black', 0.18, 20),
    well(-0.58, 0.58, 'white', 0.11, 6), well(0.05, 0, 'white', 0.12, 7),
    well(0.68, -0.62, 'white', 0.11, 6)
  ], false, wideMetadata);
  add('orbital-relay', 'Orbital Relay', 'Pairs & axes', 'A zigzag relay of black stations trades particle streams across four white handoff gates.', [
    well(-0.92, -0.72, 'black', 0.17, 19), well(-0.5, -0.1, 'black', 0.17, 19),
    well(0, 0.55, 'black', 0.19, 21), well(0.48, -0.18, 'black', 0.17, 19),
    well(0.92, 0.68, 'black', 0.17, 19), well(-0.72, -0.38, 'white', 0.1, 6),
    well(-0.25, 0.25, 'white', 0.1, 6), well(0.25, 0.18, 'white', 0.1, 6),
    well(0.72, 0.28, 'white', 0.1, 6)
  ], false, wideMetadata);

  add('broken-orbit', 'Broken Orbit', 'Rings', 'Two uneven arcs trade particles through broad gaps instead of closing into a rigid ring.',
    arc(6, 'black', 1, 0.76, -Math.PI * 0.15, Math.PI * 0.9, 0.16, 18)
      .concat(arc(5, 'white', 0.82, 0.92, Math.PI * 1.08, Math.PI * 1.82, 0.11, 6)), false, wideMetadata);
  add('solar-flare', 'Solar Flare', 'Rings', 'A black shock arc throws a white flare plume across an open side of the canvas.',
    arc(8, 'black', 1, 0.62, Math.PI * 0.15, Math.PI * 0.95, 0.15, 18)
      .concat(arc(4, 'white', 0.8, 0.9, -Math.PI * 0.35, Math.PI * 0.05, 0.11, 6)), false, wideMetadata);
  add('crescent-engine', 'Crescent Engine', 'Rings', 'A heavy black crescent drives against a smaller white counter-crescent across empty space.',
    arc(7, 'black', 1, 0.88, Math.PI * 0.55, Math.PI * 1.45, 0.16, 19)
      .concat(arc(5, 'white', 0.86, 0.7, -Math.PI * 0.45, Math.PI * 0.45, 0.11, 6)), false, wideMetadata);

  add('pulsar-core', 'Pulsar Core', 'Nested', 'A hexagonal black pulse ring pushes around a white core and two distant polar beacons.',
    ring(6, 'black', 0.58, Math.PI / 6, 0.18, 20).concat([
      center('white', 8), well(-0.95, 0, 'white', 0.11, 6), well(0.95, 0, 'white', 0.11, 6)
    ]), false, wideSurgeMetadata);
  add('accretion-bloom', 'Accretion Bloom', 'Nested', 'Five black inner petals rotate against offset white outer petals and a repulsive seed.',
    ring(5, 'black', 0.5, -Math.PI / 2, 0.18, 20)
      .concat(ring(5, 'white', 1, -Math.PI / 2 + Math.PI / 5, 0.12, 7), [center('white', 7)]), false, wideMetadata);
  add('fractured-core', 'Fractured Core', 'Nested', 'Three broken sub-cores pull in different directions while white cracks keep their flows apart.', [
    well(-0.55, -0.45, 'black', 0.2, 22), well(-0.28, -0.2, 'black', 0.15, 17),
    well(-0.42, 0.05, 'white', 0.1, 6), well(0.5, 0.4, 'black', 0.2, 22),
    well(0.22, 0.18, 'black', 0.15, 17), well(0.38, -0.08, 'white', 0.1, 6),
    well(-0.72, 0.62, 'black', 0.17, 19), well(-0.92, 0.42, 'white', 0.1, 6),
    well(0.78, -0.62, 'black', 0.17, 19), well(0.95, -0.4, 'white', 0.1, 6)
  ], false, wideSurgeMetadata);

  add('serpentine-gate', 'Serpentine Gate', 'Channels', 'A loose S-shaped black current snakes between four offset white deflection gates.', [
    well(-0.92, -0.62, 'black', 0.16, 18), well(-0.55, -0.18, 'black', 0.16, 18),
    well(-0.1, 0.25, 'black', 0.16, 18), well(0.35, 0.55, 'black', 0.16, 18),
    well(0.75, 0.2, 'black', 0.16, 18), well(0.92, -0.35, 'black', 0.16, 18),
    well(-0.75, 0.1, 'white', 0.1, 6), well(-0.3, -0.55, 'white', 0.1, 6),
    well(0.18, -0.2, 'white', 0.1, 6), well(0.62, 0.65, 'white', 0.1, 6)
  ], false, wideFlowMetadata);
  add('crosswind', 'Crosswind', 'Channels', 'Two black diagonal fronts cross around a four-point white calm zone without sealing it.', [
    well(-0.9, -0.72, 'black', 0.15, 18), well(-0.45, -0.38, 'black', 0.15, 18),
    well(0.45, 0.38, 'black', 0.15, 18), well(0.9, 0.72, 'black', 0.15, 18),
    well(-0.88, 0.68, 'black', 0.15, 18), well(-0.42, 0.34, 'black', 0.15, 18),
    well(0.42, -0.34, 'black', 0.15, 18), well(0.88, -0.68, 'black', 0.15, 18),
    well(-0.25, 0, 'white', 0.1, 6), well(0, -0.22, 'white', 0.1, 6),
    well(0.25, 0, 'white', 0.1, 6), well(0, 0.22, 'white', 0.1, 6)
  ], false, wideFlowMetadata);
  add('jetstream', 'Jetstream', 'Channels', 'Curved upper and lower black banks accelerate flow through four staggered white nozzles.', [
    well(-0.92, -0.58, 'black', 0.15, 18), well(-0.35, -0.78, 'black', 0.15, 18),
    well(0.32, -0.66, 'black', 0.15, 18), well(0.9, -0.28, 'black', 0.15, 18),
    well(-0.9, 0.28, 'black', 0.15, 18), well(-0.32, 0.66, 'black', 0.15, 18),
    well(0.35, 0.78, 'black', 0.15, 18), well(0.92, 0.58, 'black', 0.15, 18),
    well(-0.58, -0.02, 'white', 0.1, 6), well(-0.18, 0.12, 'white', 0.1, 6),
    well(0.22, -0.12, 'white', 0.1, 6), well(0.62, 0.02, 'white', 0.1, 6)
  ], false, wideFlowMetadata);

  add('helix-wake', 'Helix Wake', 'Spirals & curves', 'Twin black spiral wakes coil past four white guide stars on the open diagonals.',
    spiral(2, 5, 'black', Math.PI * 1.3, 17)
      .concat(ring(4, 'white', 0.48, Math.PI / 4, 0.11, 6)), false, wideMetadata);
  add('pinwheel-surge', 'Pinwheel Surge', 'Spirals & curves', 'Four short black arms burst around an offset white guide ring for fast rotating flow.',
    spiral(4, 3, 'black', Math.PI * 0.9, 18)
      .concat(ring(4, 'white', 0.42, Math.PI / 4, 0.11, 6)), false, wideMetadata);
  add('vortex-ladder', 'Vortex Ladder', 'Spirals & curves', 'A rising black curve climbs through five white rungs before curling back across the top.', [
    well(-0.82, 0.78, 'black', 0.16, 18), well(-0.55, 0.35, 'black', 0.16, 18),
    well(-0.35, -0.08, 'black', 0.16, 18), well(-0.08, -0.48, 'black', 0.16, 18),
    well(0.32, -0.72, 'black', 0.16, 18), well(0.72, -0.48, 'black', 0.16, 18),
    well(0.88, -0.02, 'black', 0.16, 18), well(-0.72, 0.52, 'white', 0.1, 6),
    well(-0.45, 0.08, 'white', 0.1, 6), well(-0.2, -0.34, 'white', 0.1, 6),
    well(0.15, -0.62, 'white', 0.1, 6), well(0.55, -0.62, 'white', 0.1, 6)
  ], false, wideMetadata);

  add('quasar-chain', 'Quasar Chain', 'Clusters', 'Three double-black quasars exchange particles through paired white bridge points.', [
    well(-0.78, -0.52, 'black', 0.2, 22), well(-0.56, -0.35, 'black', 0.14, 16),
    well(-0.9, -0.22, 'white', 0.1, 6), well(-0.38, -0.7, 'white', 0.1, 6),
    well(0, 0, 'black', 0.22, 24), well(0.22, 0.18, 'black', 0.14, 16),
    well(-0.22, 0.28, 'white', 0.1, 6), well(0.3, -0.18, 'white', 0.1, 6),
    well(0.68, 0.58, 'black', 0.2, 22), well(0.9, 0.42, 'black', 0.14, 16),
    well(0.48, 0.78, 'white', 0.1, 6), well(0.88, 0.82, 'white', 0.1, 6)
  ], false, wideMetadata);
  add('nova-choir', 'Nova Choir', 'Clusters', 'Five black voices sweep across a broad arc while white echoes answer from inside it.',
    arc(5, 'black', 1, 0.82, Math.PI * 0.12, Math.PI * 0.88, 0.18, 20)
      .concat(arc(5, 'white', 0.62, 0.82, Math.PI * 1.08, Math.PI * 1.92, 0.11, 6)), false, wideMetadata);
  add('celestial-forge', 'Celestial Forge', 'Clusters', 'A heavy black anvil cluster throws particles toward four white exhaust vents.', [
    well(-0.72, 0.18, 'black', 0.24, 26), well(-0.48, -0.18, 'black', 0.19, 21),
    well(-0.22, 0.42, 'black', 0.17, 19), well(0.08, 0.08, 'black', 0.18, 20),
    well(0.38, -0.38, 'black', 0.17, 19), well(0.68, -0.62, 'black', 0.16, 18),
    well(0.92, -0.78, 'black', 0.15, 17), well(-0.9, -0.48, 'white', 0.11, 6),
    well(-0.28, -0.72, 'white', 0.11, 6), well(0.38, 0.42, 'white', 0.11, 6),
    well(0.82, 0.68, 'white', 0.11, 6)
  ], false, wideSurgeMetadata);

  add('dark-matter-map', 'Dark Matter Map', 'Scattered anchors', 'Eight uneven black masses reveal their shape through four distant white survey lights.', [
    well(-0.94, -0.72, 'black', 0.16, 18), well(-0.52, -0.18, 'black', 0.18, 20),
    well(-0.1, -0.82, 'black', 0.15, 17), well(0.32, -0.35, 'black', 0.17, 19),
    well(0.88, -0.66, 'black', 0.16, 18), well(-0.78, 0.62, 'black', 0.17, 19),
    well(0.08, 0.52, 'black', 0.19, 21), well(0.82, 0.78, 'black', 0.16, 18),
    well(-0.78, -0.12, 'white', 0.1, 6), well(0.12, -0.12, 'white', 0.1, 6),
    well(-0.35, 0.82, 'white', 0.1, 6), well(0.55, 0.25, 'white', 0.1, 6)
  ], false, wideScatterMetadata);
  add('meteor-garden', 'Meteor Garden', 'Scattered anchors', 'Black meteor heads and white wakes scatter along three unrelated trajectories.', [
    well(-0.9, -0.72, 'black', 0.18, 20), well(-0.6, -0.48, 'black', 0.15, 17),
    well(-0.72, -0.18, 'white', 0.1, 6), well(-0.12, -0.82, 'black', 0.18, 20),
    well(0.15, -0.52, 'black', 0.15, 17), well(0.42, -0.22, 'white', 0.1, 6),
    well(0.88, -0.05, 'black', 0.18, 20), well(0.62, 0.24, 'black', 0.15, 17),
    well(0.35, 0.52, 'white', 0.1, 6), well(-0.68, 0.72, 'black', 0.18, 20),
    well(-0.32, 0.58, 'black', 0.15, 17), well(-0.05, 0.85, 'white', 0.1, 6),
    well(0.82, 0.78, 'white', 0.1, 6)
  ], false, wideScatterMetadata);
  add('deep-space-buoys', 'Deep Space Buoys', 'Scattered anchors', 'Five isolated black buoys drift between matching white markers with large quiet crossings.', [
    well(-0.88, -0.7, 'black', 0.19, 21), well(-0.62, -0.42, 'white', 0.1, 6),
    well(0.08, -0.78, 'black', 0.19, 21), well(0.36, -0.52, 'white', 0.1, 6),
    well(0.82, -0.05, 'black', 0.19, 21), well(0.52, 0.18, 'white', 0.1, 6),
    well(-0.58, 0.58, 'black', 0.19, 21), well(-0.85, 0.8, 'white', 0.1, 6),
    well(0.45, 0.72, 'black', 0.19, 21), well(0.78, 0.52, 'white', 0.1, 6)
  ], false, wideScatterMetadata);

  add('gravity-highway', 'Gravity Highway', 'Wide patterns', 'Two offset black express lanes race past four white interchanges from edge to edge.', [
    well(-0.95, -0.62, 'black', 0.14, 17), well(-0.55, -0.52, 'black', 0.14, 17),
    well(-0.1, -0.68, 'black', 0.14, 17), well(0.38, -0.48, 'black', 0.14, 17),
    well(0.9, -0.62, 'black', 0.14, 17), well(-0.9, 0.56, 'black', 0.14, 17),
    well(-0.42, 0.72, 'black', 0.14, 17), well(0.08, 0.52, 'black', 0.14, 17),
    well(0.55, 0.68, 'black', 0.14, 17), well(0.95, 0.48, 'black', 0.14, 17),
    well(-0.68, 0.02, 'white', 0.1, 6), well(-0.18, -0.02, 'white', 0.1, 6),
    well(0.32, 0.04, 'white', 0.1, 6), well(0.78, -0.06, 'white', 0.1, 6)
  ], false, wideFlowMetadata);
  add('cosmic-current', 'Cosmic Current', 'Wide patterns', 'Eight black anchors trace a rolling wave around four white counter-current eddies.', [
    well(-0.95, 0.18, 'black', 0.15, 18), well(-0.68, -0.42, 'black', 0.15, 18),
    well(-0.3, -0.72, 'black', 0.15, 18), well(0.08, -0.38, 'black', 0.15, 18),
    well(0.38, 0.25, 'black', 0.15, 18), well(0.62, 0.72, 'black', 0.15, 18),
    well(0.88, 0.42, 'black', 0.15, 18), well(0.95, -0.18, 'black', 0.15, 18),
    well(-0.58, 0.38, 'white', 0.1, 6), well(-0.08, 0.22, 'white', 0.1, 6),
    well(0.28, -0.52, 'white', 0.1, 6), well(0.72, -0.48, 'white', 0.1, 6)
  ], false, wideFlowMetadata);
  add('singularity-parade', 'Singularity Parade', 'Wide patterns', 'Seven unequal black singularities march diagonally past four off-beat white conductors.', [
    well(-0.92, 0.78, 'black', 0.14, 16), well(-0.62, 0.42, 'black', 0.17, 19),
    well(-0.28, 0.1, 'black', 0.2, 22), well(0.08, -0.12, 'black', 0.23, 25),
    well(0.4, -0.38, 'black', 0.19, 21), well(0.68, -0.62, 'black', 0.16, 18),
    well(0.94, -0.82, 'black', 0.14, 16), well(-0.78, -0.28, 'white', 0.1, 6),
    well(-0.12, 0.62, 'white', 0.1, 6), well(0.42, 0.32, 'white', 0.1, 6),
    well(0.82, 0.05, 'white', 0.1, 6)
  ], false, wideSurgeMetadata);

  add('mobius-engine', 'Mobius Engine', 'Impossible Machines', 'Two interleaved figure-eight tracks exchange particles through four crossing gates.', [
    well(-0.92, 0, 'black', 0.16, 19), well(-0.58, -0.5, 'black', 0.16, 18),
    well(-0.18, -0.22, 'black', 0.15, 17), well(0.58, 0.5, 'black', 0.16, 19),
    well(0.92, 0, 'black', 0.16, 19), well(0.58, -0.5, 'black', 0.16, 18),
    well(0.18, 0.22, 'black', 0.15, 17), well(-0.58, 0.5, 'black', 0.16, 19),
    well(-0.3, -0.02, 'white', 0.1, 6), well(0.3, 0.02, 'white', 0.1, 6),
    well(-0.02, -0.34, 'white', 0.1, 6), well(0.02, 0.34, 'white', 0.1, 6)
  ]);
  add('gyroscope-temple', 'Gyroscope Temple', 'Impossible Machines', 'Three incomplete tilted orbital planes turn around displaced repulsive pivots.', [
    well(-0.92, 0, 'black', 0.15, 18), well(0, -0.34, 'black', 0.17, 20),
    well(0.92, 0, 'black', 0.15, 18), well(-0.65, -0.72, 'black', 0.15, 18),
    well(0, 0.18, 'black', 0.16, 19), well(0.65, 0.72, 'black', 0.15, 18),
    well(-0.65, 0.72, 'black', 0.15, 18), well(0, 0.48, 'black', 0.16, 19),
    well(0.65, -0.72, 'black', 0.15, 18), well(-0.2, -0.04, 'white', 0.1, 6),
    well(0.2, 0.05, 'white', 0.1, 6), well(0, -0.68, 'white', 0.11, 7)
  ]);
  add('parallax-gate', 'Parallax Gate', 'Impossible Machines', 'Two staggered rectangular frames form a deep diagonal passage through the canvas.', [
    well(-0.92, -0.72, 'black', 0.15, 18), well(-0.25, -0.55, 'black', 0.15, 18),
    well(-0.25, 0.55, 'black', 0.15, 18), well(-0.92, 0.72, 'black', 0.15, 18),
    well(0.1, -0.88, 'black', 0.15, 18), well(0.92, -0.65, 'black', 0.15, 18),
    well(0.92, 0.65, 'black', 0.15, 18), well(0.1, 0.88, 'black', 0.15, 18),
    well(-0.55, -0.14, 'white', 0.1, 6), well(-0.12, 0.16, 'white', 0.1, 6),
    well(0.32, -0.15, 'white', 0.1, 6), well(0.68, 0.16, 'white', 0.1, 6)
  ], true, wideMetadata);
  add('gravity-prism', 'Gravity Prism', 'Impossible Machines', 'An open triangular prism splits one incoming particle stream into two exits.', [
    well(-0.82, -0.62, 'black', 0.16, 19), well(-0.82, 0.62, 'black', 0.16, 19),
    well(-0.18, 0, 'black', 0.18, 21), well(0.12, -0.78, 'black', 0.16, 19),
    well(0.12, 0.46, 'black', 0.16, 19), well(0.9, -0.16, 'black', 0.18, 21),
    well(-0.98, 0, 'white', 0.1, 6), well(-0.48, -0.22, 'white', 0.1, 6),
    well(-0.48, 0.22, 'white', 0.1, 6), well(0.5, -0.36, 'white', 0.11, 7),
    well(0.72, 0.14, 'white', 0.11, 7)
  ]);
  add('kinetic-mobile', 'Kinetic Mobile', 'Impossible Machines', 'Asymmetric suspended rods carry unequal hanging masses around five live pivots.', [
    well(-0.9, -0.62, 'black', 0.15, 18), well(-0.25, -0.62, 'black', 0.17, 20),
    well(0.45, -0.62, 'black', 0.15, 18), well(0.9, -0.32, 'black', 0.16, 19),
    well(-0.62, 0.05, 'black', 0.18, 22), well(0.12, 0.18, 'black', 0.16, 19),
    well(0.66, 0.58, 'black', 0.2, 24), well(-0.58, -0.82, 'white', 0.1, 6),
    well(0.2, -0.82, 'white', 0.1, 6), well(-0.6, -0.25, 'white', 0.1, 6),
    well(0.12, -0.18, 'white', 0.1, 6), well(0.65, 0.08, 'white', 0.11, 7)
  ]);
  add('wave-interferometer', 'Wave Interferometer', 'Impossible Machines', 'Separated slit gates divide a source wave before an open receiver curve.', [
    well(-0.95, 0, 'black', 0.2, 24), well(-0.65, -0.45, 'black', 0.15, 18),
    well(-0.65, 0.45, 'black', 0.15, 18), well(0.55, -0.72, 'black', 0.15, 18),
    well(0.78, 0, 'black', 0.17, 20), well(0.55, 0.72, 'black', 0.15, 18),
    well(-0.25, -0.65, 'white', 0.1, 6), well(-0.25, -0.18, 'white', 0.1, 6),
    well(-0.25, 0.18, 'white', 0.1, 6), well(-0.25, 0.65, 'white', 0.1, 6),
    well(0.18, -0.35, 'white', 0.11, 7), well(0.18, 0.35, 'white', 0.11, 7)
  ], true, wideMetadata);

  add('dragonfly-rift', 'Dragonfly Rift', 'Living Cosmos', 'Four swept wings orbit a narrow thorax crossed by five repulsive seams.', [
    well(0, -0.65, 'black', 0.17, 21), well(0, -0.15, 'black', 0.18, 22),
    well(0, 0.48, 'black', 0.16, 19), well(-0.88, -0.55, 'black', 0.15, 18),
    well(0.88, -0.55, 'black', 0.15, 18), well(-0.72, 0.55, 'black', 0.16, 19),
    well(0.72, 0.55, 'black', 0.16, 19), well(0, -0.9, 'white', 0.1, 6),
    well(-0.42, -0.14, 'white', 0.1, 6), well(0.42, -0.14, 'white', 0.1, 6),
    well(-0.3, 0.2, 'white', 0.1, 6), well(0.3, 0.2, 'white', 0.1, 6)
  ]);
  add('jellyfish-gate', 'Jellyfish Gate', 'Living Cosmos', 'An open bell releases five uneven repulsive tendrils into the current below.', [
    well(-0.82, -0.1, 'black', 0.15, 18), well(-0.55, -0.62, 'black', 0.16, 19),
    well(0, -0.82, 'black', 0.18, 22), well(0.55, -0.62, 'black', 0.16, 19),
    well(0.82, -0.1, 'black', 0.15, 18), well(-0.32, 0.45, 'black', 0.16, 19),
    well(0.36, 0.72, 'black', 0.17, 20), well(-0.68, 0.35, 'white', 0.1, 6),
    well(-0.18, 0.08, 'white', 0.1, 6), well(0.18, 0.2, 'white', 0.1, 6),
    well(0.7, 0.28, 'white', 0.1, 6), well(0, 0.9, 'white', 0.11, 7)
  ]);
  add('phoenix-wake', 'Phoenix Wake', 'Living Cosmos', 'Raised wings surround a bright spine while three tail currents diverge behind it.', [
    well(0, -0.2, 'black', 0.19, 23), well(0, 0.25, 'black', 0.17, 20),
    well(0, 0.68, 'black', 0.16, 19), well(-0.25, -0.12, 'black', 0.16, 19),
    well(-0.58, -0.48, 'black', 0.16, 19), well(-0.95, -0.2, 'black', 0.15, 18),
    well(0.25, -0.12, 'black', 0.16, 19), well(0.58, -0.48, 'black', 0.16, 19),
    well(0.95, -0.2, 'black', 0.15, 18), well(-0.48, 0.82, 'white', 0.1, 6),
    well(0, 0.95, 'white', 0.11, 7), well(0.48, 0.82, 'white', 0.1, 6),
    well(0, -0.72, 'white', 0.11, 7)
  ], false, wideMetadata);
  add('world-tree', 'World Tree', 'Living Cosmos', 'One trunk branches into an asymmetric canopy above five exposed repulsive roots.', [
    well(0, 0.8, 'black', 0.18, 22), well(0, 0.38, 'black', 0.17, 20),
    well(0, 0, 'black', 0.19, 23), well(-0.72, -0.05, 'black', 0.15, 18),
    well(-0.52, -0.5, 'black', 0.16, 19), well(-0.15, -0.78, 'black', 0.16, 19),
    well(0.3, -0.7, 'black', 0.16, 19), well(0.62, -0.4, 'black', 0.16, 19),
    well(0.82, 0, 'black', 0.15, 18), well(-0.65, 0.72, 'white', 0.1, 6),
    well(-0.25, 0.92, 'white', 0.1, 6), well(0.25, 0.92, 'white', 0.1, 6),
    well(0.68, 0.72, 'white', 0.1, 6), well(0, -0.4, 'white', 0.11, 7)
  ]);
  add('skull-nebula', 'Skull Nebula', 'Living Cosmos', 'A broken skull outline surrounds two white eye cavities and an open jaw.', [
    well(-0.7, -0.45, 'black', 0.16, 19), well(-0.32, -0.78, 'black', 0.16, 19),
    well(0.32, -0.78, 'black', 0.16, 19), well(0.7, -0.45, 'black', 0.16, 19),
    well(-0.82, 0.05, 'black', 0.15, 18), well(0.82, 0.05, 'black', 0.15, 18),
    well(-0.5, 0.62, 'black', 0.16, 19), well(0.5, 0.62, 'black', 0.16, 19),
    well(-0.32, -0.15, 'white', 0.12, 8), well(0.32, -0.15, 'white', 0.12, 8),
    well(-0.18, 0.5, 'white', 0.1, 6), well(0.18, 0.5, 'white', 0.1, 6)
  ]);
  add('leviathan-jaw', 'Leviathan Jaw', 'Living Cosmos', 'Unequal upper and lower jaws surround a broad mouth of five repulsive teeth.', [
    well(-0.95, -0.5, 'black', 0.15, 18), well(-0.45, -0.72, 'black', 0.16, 19),
    well(0.15, -0.62, 'black', 0.17, 20), well(0.85, -0.28, 'black', 0.16, 19),
    well(-0.82, 0.48, 'black', 0.16, 19), well(-0.32, 0.72, 'black', 0.17, 20),
    well(0.25, 0.64, 'black', 0.16, 19), well(0.95, 0.18, 'black', 0.15, 18),
    well(-0.58, -0.15, 'white', 0.1, 6), well(-0.12, -0.28, 'white', 0.1, 6),
    well(0.35, -0.2, 'white', 0.1, 6), well(-0.28, 0.2, 'white', 0.1, 6),
    well(0.38, 0.18, 'white', 0.1, 6)
  ], false, wideMetadata);

  add('cathedral-window', 'Cathedral Window', 'Monuments & Relics', 'A pointed arch surrounds sparse rose-window guides and an open central nave.', [
    well(-0.85, 0.72, 'black', 0.15, 18), well(-0.85, 0.05, 'black', 0.15, 18),
    well(-0.65, -0.48, 'black', 0.16, 19), well(-0.3, -0.82, 'black', 0.16, 19),
    well(0, -0.98, 'black', 0.17, 21), well(0.3, -0.82, 'black', 0.16, 19),
    well(0.65, -0.48, 'black', 0.16, 19), well(0.85, 0.05, 'black', 0.15, 18),
    well(0.85, 0.72, 'black', 0.15, 18), well(-0.35, 0.12, 'white', 0.1, 6),
    well(0, -0.2, 'white', 0.11, 7), well(0.35, 0.12, 'white', 0.1, 6),
    well(0, 0.55, 'white', 0.11, 7)
  ]);
  add('crownless-king', 'Crownless King', 'Monuments & Relics', 'A seven-point crown leaves its apex missing around a displaced inner core.', [
    well(-0.82, 0.55, 'black', 0.15, 18), well(-0.42, 0.48, 'black', 0.16, 19),
    well(0, 0.62, 'black', 0.18, 22), well(0.42, 0.48, 'black', 0.16, 19),
    well(0.82, 0.55, 'black', 0.15, 18), well(-0.62, -0.55, 'black', 0.17, 20),
    well(0.62, -0.55, 'black', 0.17, 20), well(-0.32, -0.05, 'white', 0.1, 6),
    well(0, 0.15, 'white', 0.11, 7), well(0.32, -0.05, 'white', 0.1, 6),
    well(0, -0.5, 'white', 0.11, 7)
  ]);
  add('singularity-throne', 'Singularity Throne', 'Monuments & Relics', 'A tall-backed throne holds a floating seat between unequal open arms.', [
    well(-0.72, -0.88, 'black', 0.15, 18), well(0, -0.78, 'black', 0.18, 22),
    well(0.72, -0.88, 'black', 0.15, 18), well(-0.72, 0.2, 'black', 0.16, 19),
    well(0.72, 0.2, 'black', 0.16, 19), well(-0.92, 0.48, 'black', 0.16, 19),
    well(0.92, 0.48, 'black', 0.16, 19), well(0, 0.72, 'black', 0.19, 23),
    well(-0.4, -0.38, 'white', 0.1, 6), well(0.4, -0.38, 'white', 0.1, 6),
    well(-0.45, 0.35, 'white', 0.11, 7), well(0.45, 0.35, 'white', 0.11, 7)
  ]);
  add('cosmic-keyhole', 'Cosmic Keyhole', 'Monuments & Relics', 'A broken circular head flows into a long asymmetric notched shaft.', [
    well(-0.58, -0.62, 'black', 0.16, 19), well(0, -0.9, 'black', 0.18, 22),
    well(0.58, -0.62, 'black', 0.16, 19), well(0.72, -0.05, 'black', 0.16, 19),
    well(0.38, 0.28, 'black', 0.17, 20), well(0.38, 0.88, 'black', 0.16, 19),
    well(-0.38, 0.88, 'black', 0.16, 19), well(-0.32, -0.1, 'white', 0.11, 7),
    well(0.32, -0.1, 'white', 0.11, 7), well(0, 0.5, 'white', 0.12, 8)
  ]);
  add('space-anchor', 'Space Anchor', 'Monuments & Relics', 'A central shank meets a crossbar, curved flukes, and separated chain points.', [
    well(0, -0.92, 'black', 0.17, 20), well(0, -0.4, 'black', 0.16, 19),
    well(0, 0.1, 'black', 0.18, 22), well(0, 0.72, 'black', 0.17, 20),
    well(-0.72, -0.28, 'black', 0.16, 19), well(0.72, -0.28, 'black', 0.16, 19),
    well(-0.9, 0.65, 'black', 0.16, 19), well(0.9, 0.65, 'black', 0.16, 19),
    well(-0.42, 0.48, 'white', 0.1, 6), well(0.42, 0.48, 'white', 0.1, 6),
    well(-0.55, 0.82, 'white', 0.1, 6), well(0.55, 0.82, 'white', 0.1, 6)
  ]);
  add('torii-rift', 'Torii Rift', 'Monuments & Relics', 'A curved upper beam and offset pillars preserve a wide active passage.', [
    well(-0.95, -0.65, 'black', 0.15, 18), well(-0.35, -0.78, 'black', 0.16, 19),
    well(0.35, -0.78, 'black', 0.16, 19), well(0.95, -0.65, 'black', 0.15, 18),
    well(-0.72, -0.28, 'black', 0.16, 19), well(0.72, -0.28, 'black', 0.16, 19),
    well(-0.58, 0.82, 'black', 0.18, 22), well(0.58, 0.82, 'black', 0.18, 22),
    well(-0.45, 0.12, 'white', 0.1, 6), well(0.45, 0.12, 'white', 0.1, 6),
    well(-0.18, 0.55, 'white', 0.11, 7), well(0.18, 0.55, 'white', 0.11, 7)
  ]);

  add('thunderhead', 'Thunderhead', 'Chaotic Arenas', 'An asymmetric storm mass hangs above a jagged repulsive strike lane.', [
    well(-0.95, -0.28, 'black', 0.15, 18), well(-0.68, -0.62, 'black', 0.16, 19),
    well(-0.25, -0.82, 'black', 0.17, 20), well(0.2, -0.68, 'black', 0.18, 22),
    well(0.62, -0.88, 'black', 0.16, 19), well(0.95, -0.45, 'black', 0.15, 18),
    well(0.55, -0.08, 'black', 0.17, 20), well(-0.22, -0.08, 'black', 0.17, 20),
    well(0.15, 0.2, 'white', 0.1, 6), well(-0.08, 0.5, 'white', 0.1, 6),
    well(0.25, 0.62, 'white', 0.1, 6), well(0, 0.92, 'white', 0.11, 7)
  ], false, wideMetadata);
  add('gravity-harp', 'Gravity Harp', 'Chaotic Arenas', 'A curved soundbox stretches graduated nonparallel strings across empty space.', [
    well(-0.88, -0.72, 'black', 0.16, 19), well(-0.68, -0.25, 'black', 0.16, 19),
    well(-0.55, 0.25, 'black', 0.17, 20), well(-0.32, 0.72, 'black', 0.18, 22),
    well(0.85, -0.72, 'black', 0.15, 18), well(0.68, -0.2, 'black', 0.15, 18),
    well(0.52, 0.3, 'black', 0.15, 18), well(0.32, 0.82, 'black', 0.16, 19),
    well(-0.35, -0.45, 'white', 0.1, 6), well(-0.15, -0.2, 'white', 0.1, 6),
    well(0.05, 0.05, 'white', 0.1, 6), well(0.22, 0.32, 'white', 0.11, 7)
  ]);
  add('volcano-rift', 'Volcano Rift', 'Chaotic Arenas', 'Broken mountain slopes surround a white vent and an asymmetric ejecta plume.', [
    well(-0.92, 0.65, 'black', 0.15, 18), well(-0.62, 0.15, 'black', 0.16, 19),
    well(-0.3, -0.25, 'black', 0.17, 20), well(0, -0.4, 'black', 0.19, 23),
    well(0.32, -0.2, 'black', 0.17, 20), well(0.65, 0.28, 'black', 0.16, 19),
    well(0.92, 0.68, 'black', 0.15, 18), well(0, -0.12, 'white', 0.12, 8),
    well(-0.32, -0.65, 'white', 0.1, 6), well(0.1, -0.8, 'white', 0.1, 6),
    well(0.5, -0.58, 'white', 0.1, 6), well(0.75, -0.35, 'white', 0.1, 6)
  ]);
  add('solar-sail', 'Solar Sail', 'Chaotic Arenas', 'A huge skewed sail pulls against a narrow mast and trailing counterweights.', [
    well(-0.9, -0.75, 'black', 0.15, 18), well(0.4, -0.88, 'black', 0.17, 20),
    well(0.15, 0.42, 'black', 0.18, 22), well(-0.65, 0.05, 'black', 0.16, 19),
    well(0.3, 0.7, 'black', 0.17, 20), well(0.6, 0.42, 'black', 0.16, 19),
    well(0.92, 0.72, 'black', 0.15, 18), well(-0.05, -0.55, 'white', 0.1, 6),
    well(0.05, -0.05, 'white', 0.11, 7), well(0.18, 0.52, 'white', 0.1, 6),
    well(0.72, 0.82, 'white', 0.1, 6)
  ], false, wideMetadata);
  add('orbital-fountain', 'Orbital Fountain', 'Chaotic Arenas', 'A central nozzle feeds unequal rising and falling arcs on both sides.', [
    well(-0.18, 0.82, 'black', 0.16, 19), well(0.18, 0.82, 'black', 0.16, 19),
    well(0, 0.45, 'black', 0.18, 22), well(-0.28, 0.12, 'black', 0.17, 20),
    well(-0.6, -0.2, 'black', 0.16, 19), well(-0.85, -0.55, 'black', 0.15, 18),
    well(0.35, -0.08, 'black', 0.17, 20), well(0.75, -0.42, 'black', 0.16, 19),
    well(0, 0.7, 'white', 0.11, 7), well(0, 0.18, 'white', 0.11, 7),
    well(-0.45, -0.48, 'white', 0.1, 6), well(0.45, -0.35, 'white', 0.1, 6),
    well(0.9, -0.65, 'white', 0.1, 6)
  ]);
  add('quasar-lighthouse', 'Quasar Lighthouse', 'Chaotic Arenas', 'A tall beacon throws one sweeping beam from its displaced repulsive core.', [
    well(0, -0.65, 'black', 0.18, 22), well(0, -0.2, 'black', 0.17, 20),
    well(0, 0.25, 'black', 0.17, 20), well(-0.28, 0.8, 'black', 0.16, 19),
    well(0.28, 0.8, 'black', 0.16, 19), well(-0.85, -0.35, 'black', 0.15, 18),
    well(0.78, -0.68, 'black', 0.15, 18), well(0, -0.9, 'white', 0.12, 8),
    well(-0.42, -0.52, 'white', 0.1, 6), well(0.35, -0.42, 'white', 0.1, 6),
    well(0.9, -0.22, 'white', 0.1, 6)
  ], false, wideMetadata);

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
    var particleExtentScale = options.mobile === true
      ? particleEnvelopeScale.touch
      : particleEnvelopeScale.desktop;
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
        var extent = radiusAt(item, scale) * particleExtentScale + visualPadding;
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
          var extent = radiusAt(item, low) * particleExtentScale + visualPadding;
          result = Math.min(result, Math.max(0, (halfExtent - extent) / (coordinate * 1.4)));
        });
        return Number.isFinite(result) ? result : low;
      }
      scaleX = wideAxisScale('x', halfWidth);
      scaleY = wideAxisScale('y', halfHeight);
    }

    var bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
    var particleBounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
    var wells = rotated.map(function(item) {
      var radius = radiusAt(item, low);
      var x = centerX + item.x * scaleX * spacing / 100;
      var y = centerY + item.y * scaleY * spacing / 100;
      var extent = radius * visualExtentScale + visualPadding;
      bounds.left = Math.min(bounds.left, x - extent);
      bounds.top = Math.min(bounds.top, y - extent);
      bounds.right = Math.max(bounds.right, x + extent);
      bounds.bottom = Math.max(bounds.bottom, y + extent);
      var particleExtent = radius * particleExtentScale + visualPadding;
      particleBounds.left = Math.min(particleBounds.left, x - particleExtent);
      particleBounds.top = Math.min(particleBounds.top, y - particleExtent);
      particleBounds.right = Math.max(particleBounds.right, x + particleExtent);
      particleBounds.bottom = Math.max(particleBounds.bottom, y + particleExtent);
      return { x: x, y: y, type: item.type, radius: radius, strength: item.strength * strength / 100 };
    });
    return {
      id: id, wells: wells, width: width, height: height,
      spacing: spacing, rotation: rotation, strength: strength, orientation: orientation,
      layout: preset.layout, initialParticlePlacement: preset.initialParticlePlacement,
      trap: preset.trap, stableOrbit: preset.stableOrbit,
      center: { x: centerX, y: centerY }, scale: low, scaleX: scaleX, scaleY: scaleY,
      fits: fits, bounds: bounds, particleBounds: particleBounds,
      usableBounds: { left: left, top: top, right: width - right, bottom: height - bottom },
      visualExtentScale: visualExtentScale, particleExtentScale: particleExtentScale,
      visualPadding: visualPadding
    };
  }

  var api = Object.freeze({
    presets: Object.freeze(presets),
    get: function(id) { return byId[id] || null; },
    resolve: resolve,
    visualExtentScale: visualExtentScale,
    particleEnvelopeScale: particleEnvelopeScale,
    orbitAssistRadiusRatio: orbitAssistRadiusRatio,
    visualPadding: visualPadding
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.GravityWellPresets = api;
})(typeof window !== 'undefined' ? window : null);
