# Cycle 6: P1-4 half-neighborhood traversal

**Application baseline:** `2908723` (`docs: complete configuration cleanup cycle`)

## Scope and isolation

This cycle changes only the spatial-grid cross-cell traversal in `ParticleNetwork.js`. It stays isolated from cumulative milestone work and the later SoA investigation because it changes the steady-state simulation hot path and needs an attributable A/B point.

The old ledger wording is partially stale: once every unordered neighboring-cell pair is visited in only one direction, the cross-cell particle-index guard must be removed. Retaining it would omit pairs whenever the particle in the current cell has the larger index.

## Plan

1. Add a deterministic 3x3-grid fixture covering same-cell, horizontal, vertical, diagonal, boundary, empty-cell, and deliberately reversed particle-index cases. Compare the current eight-neighbor algorithm with the proposed offsets `(0,1)`, `(1,-1)`, `(1,0)`, `(1,1)`; require exact unordered pair-set equality, no duplicates, and fewer candidate visits.
2. Commit that test-only fixture as the exact implementation checkpoint and move the detached baseline server to it.
3. Replace only the cross-cell traversal. Keep same-cell handling, grid construction, particle drawing, interaction math, collision handling, and ordering within each retained cell pair unchanged. Remove the now-invalid cross-cell index guard.
4. Run syntax, the pure grid fixture, three alternating live pair-path equivalence trials, frame-color/settings restoration, visibility, teardown/recreation, resize/WebGL, and browser-error checks.
5. Run the quick A/B gate, then the full alternating static and cycling/gradient 5,000/10,000/15,000 matrix because this is a steady-state hot-path change. Use a focused confirmation for any repeatable row that crosses the 5% regression gate.
6. Record exact commits, candidate-visit counts, correctness results, complete benchmark tables, anomalies, smoke results, and the keep/revert decision in `OPTIMIZATION.md`. Commit an accepted implementation separately from its ledger update; if rejected, restore the production loop and preserve the experiment in the ledger.

## Stop/go gates

- Stop before production editing if the deterministic fixture does not prove exact pair-set equality.
- Reject or redesign if live pair state or rendered line data differs, lifecycle/resource checks fail, WebGL is lost, settings do not restore, or browser errors appear.
- Reject a repeatable meaningful performance regression. Do not claim a gain from operation counts alone.
