#!/usr/bin/env node

const assert = require('node:assert/strict');

function pairKey(a, b) {
  return a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
}

function scanLegacy(grid, gridWidth, gridHeight) {
  const pairs = [];
  let sameCellCandidates = 0;
  let crossCellCandidates = 0;

  for (let x = 0; x < gridWidth; x++) {
    for (let y = 0; y < gridHeight; y++) {
      const particles = grid[x + y * gridWidth];
      for (let m = 0; m < particles.length; m++) {
        const particleA = particles[m];
        for (let n = m + 1; n < particles.length; n++) {
          sameCellCandidates++;
          pairs.push(pairKey(particleA, particles[n]));
        }

        for (let offsetX = -1; offsetX <= 1; offsetX++) {
          const neighborX = x + offsetX;
          if (neighborX < 0 || neighborX >= gridWidth) continue;
          for (let offsetY = -1; offsetY <= 1; offsetY++) {
            const neighborY = y + offsetY;
            if (neighborY < 0 || neighborY >= gridHeight) continue;
            if (offsetX === 0 && offsetY === 0) continue;

            const neighbors = grid[neighborX + neighborY * gridWidth];
            for (const particleB of neighbors) {
              crossCellCandidates++;
              if (particleA.index < particleB.index) {
                pairs.push(pairKey(particleA, particleB));
              }
            }
          }
        }
      }
    }
  }

  return { pairs, sameCellCandidates, crossCellCandidates };
}

function scanHalfNeighborhood(grid, gridWidth, gridHeight, keepIndexGuard = false) {
  const pairs = [];
  let sameCellCandidates = 0;
  let crossCellCandidates = 0;

  for (let x = 0; x < gridWidth; x++) {
    for (let y = 0; y < gridHeight; y++) {
      const particles = grid[x + y * gridWidth];
      for (let m = 0; m < particles.length; m++) {
        const particleA = particles[m];
        for (let n = m + 1; n < particles.length; n++) {
          sameCellCandidates++;
          pairs.push(pairKey(particleA, particles[n]));
        }

        for (let offsetX = 0; offsetX <= 1; offsetX++) {
          const neighborX = x + offsetX;
          if (neighborX >= gridWidth) continue;
          const firstOffsetY = offsetX === 0 ? 1 : -1;
          for (let offsetY = firstOffsetY; offsetY <= 1; offsetY++) {
            const neighborY = y + offsetY;
            if (neighborY < 0 || neighborY >= gridHeight) continue;

            const neighbors = grid[neighborX + neighborY * gridWidth];
            for (const particleB of neighbors) {
              crossCellCandidates++;
              if (!keepIndexGuard || particleA.index < particleB.index) {
                pairs.push(pairKey(particleA, particleB));
              }
            }
          }
        }
      }
    }
  }

  return { pairs, sameCellCandidates, crossCellCandidates };
}

function makeGrid(gridWidth, gridHeight, cells) {
  const grid = Array.from({ length: gridWidth * gridHeight }, () => []);
  for (const [cellIndex, particles] of Object.entries(cells)) {
    grid[Number(cellIndex)] = particles.map(([id, index]) => ({ id, index }));
  }
  return grid;
}

const scenarios = [
  {
    name: 'full-grid-with-same-cell-pairs',
    width: 3,
    height: 3,
    cells: {
      0: [['a', 90]], 1: [['b', 80]], 2: [['c', 70]],
      3: [['d', 60]], 4: [['e', 50], ['f', 5]], 5: [['g', 40]],
      6: [['h', 30]], 7: [['i', 20]], 8: [['j', 10]]
    }
  },
  {
    name: 'sparse-boundaries-and-empty-cells',
    width: 4,
    height: 3,
    cells: {
      0: [['k', 100], ['l', 1]],
      1: [['m', 90]],
      4: [['n', 80]],
      5: [['o', 70]],
      7: [['p', 60]],
      10: [['q', 50]],
      11: [['r', 40], ['s', 2]]
    }
  }
];

const results = scenarios.map(scenario => {
  const grid = makeGrid(scenario.width, scenario.height, scenario.cells);
  const legacy = scanLegacy(grid, scenario.width, scenario.height);
  const candidate = scanHalfNeighborhood(grid, scenario.width, scenario.height);
  const incorrectlyGuarded = scanHalfNeighborhood(grid, scenario.width, scenario.height, true);
  const legacySet = [...new Set(legacy.pairs)].sort();
  const candidateSet = [...new Set(candidate.pairs)].sort();

  assert.deepEqual(candidateSet, legacySet, `${scenario.name}: unordered pair set changed`);
  assert.equal(candidate.pairs.length, candidateSet.length, `${scenario.name}: candidate emitted duplicate pairs`);
  assert.equal(legacy.pairs.length, legacySet.length, `${scenario.name}: legacy fixture emitted duplicate pairs`);
  assert.equal(candidate.sameCellCandidates, legacy.sameCellCandidates, `${scenario.name}: same-cell work changed`);
  assert.equal(candidate.crossCellCandidates * 2, legacy.crossCellCandidates, `${scenario.name}: cross-cell visits were not halved`);
  assert.notDeepEqual(
    [...new Set(incorrectlyGuarded.pairs)].sort(),
    legacySet,
    `${scenario.name}: fixture failed to expose the invalid retained index guard`
  );

  return {
    name: scenario.name,
    pairs: candidateSet.length,
    sameCellCandidates: candidate.sameCellCandidates,
    legacyCrossCellCandidates: legacy.crossCellCandidates,
    halfCrossCellCandidates: candidate.crossCellCandidates,
    pairsLostWithRetainedIndexGuard: legacySet.length - new Set(incorrectlyGuarded.pairs).size
  };
});

console.log('RESULTS_JSON=' + JSON.stringify({ passed: true, scenarios: results }));
