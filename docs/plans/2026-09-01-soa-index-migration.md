# Full SoA / index-based particle architecture plan

**Planning/tooling checkpoint:** `1b66fb1` (`test: profile current particle workloads`)

**Production baseline:** `2cabf86` (`perf: scan neighboring cells once`)

## Goal and measured premise

Improve sustained high-count performance only where the final engine profile supports it, while preserving particle motion, pair selection/order, forces, collisions, pointer behavior, trails, rendering, settings, lifecycle, and configuration. The old 1.3-2x full-SoA estimate is not a target: final profiles show the explicit physics and object-sync helpers together consume less than 0.4 ms/frame at 10,000 particles. More than 91% of sampled engine self-time is inside object-based pair geometry and line rendering. The project therefore migrates toward indexed pair access first and stops if that path does not produce a measured gain.

## Architectural invariants

- Regular particles use contiguous indices `0..numParticles-1`; the interactive pointer remains a separate object represented by sentinel index `numParticles` only while enabled.
- Cell iteration order, particle insertion order, same-cell pair order, half-neighborhood order, comparison operators, color branches, GL call order, and frame scheduling stay unchanged unless a dedicated test proves the change intentional.
- Current frame precision is part of behavior: physics writes Float32 positions/velocities, object pair forces then accumulate in double precision, and one final write rounds velocity back to Float32. Typed pair forces must preserve that sequence, using Float64 staging if necessary; repeated Float32 rounding per pair is not equivalent.
- Collision currently mutates object positions after the SoA-to-object sync. A typed collision stage must persist both corrected positions and velocities before object synchronization is removed.
- The pointer is not allocated in regular typed buffers. Pointer proximity, lines, and pair participation require an explicit sentinel branch rather than extending buffer length silently.
- `pn.o` is an internal compatibility surface used by BenchmarkSystem, settings appearance updates, teardown, and tests. Each stage must state whether objects are authoritative, mirrored, metadata-only, or removed; no consumer may observe a partially migrated state.

## Stage 0 — deterministic architecture contract

**Files:** add `scripts/test-soa-state-contract.js`; extend test helpers only as required; update the ledger.

1. Capture the exact current tree with a fixed PRNG and controlled manual frames.
2. Cover multi-frame static wrap and bounce; mouse/touch attraction and repulsion; pair attraction and repulsion; pointer sentinel/proximity color; collision overlap/velocity reflection; line distance/color branches; jitter; trails/2D particle drawing; count grow/shrink/rebuild; appearance/settings; and destroy/recreate.
3. Record ordered object state, typed-array state/types, grid pair order, GL point/line values, 2D calls, finite recovery, pointer state, settings restoration, and resource health. Use exact equality where operations are unchanged and explicit tolerances only where current Float32 storage already requires them.
4. Commit the test-only checkpoint before any production migration.

**Gate:** no production edit until baseline-to-baseline trials are stable and every semantic hazard above is represented.

## Stage 1 — store indices in the spatial grid

**Production files:** `js/ParticleNetwork.js` only.

Replace per-cell object references with integer indices while preserving sequential insertion and all pair traversal order. Resolve indices back to existing objects at point draw and pair/collision call sites; the pointer sentinel resolves to `pn.p`. Do not change SoA physics, object synchronization, pair math, renderer APIs, or collision math.

**Why first:** smallest reversible step that establishes index identity for later direct array access. It also tests whether number storage/object lookup helps or hurts V8 before deeper work.

**Verification:** Stage 0 contract, pure grid contract, three live pair-equivalence trials, frame colors, pointer/collision/trails cases, lifecycle suite, quick A/B, three-trial 5k/10k/15k static+cycling matrix, and current-only CPU profile.

**Keep gate:** no repeatable average-FPS regression above 5%; exact behavior; and either a measurable hot-path improvement or a neutral result that is immediately consumed by Stage 2. If Stage 2 is rejected, reassess and revert neutral Stage 1 rather than retain scaffolding for its own sake.

## Stage 2 — indexed position geometry and rendering

**Production files:** `js/ParticleNetwork.js`; renderer API changes only if scalar call order cannot be preserved otherwise.

Use grid indices to read regular-particle `posX`, `posY`, and `sizeA` directly for point rendering, distance tests, midpoint/alpha/color calculations, jitter geometry, and GL/2D line endpoints. Use the pointer object only for the sentinel. Keep object velocity mutation and current sync/writeback in place so this stage changes read representation, not force precision or ownership.

Avoid per-pair wrapper objects, closures, tuple arrays, or generic property accessors. Pass scalar coordinates/indices through the hot function. Preserve the current line/point emission sequence exactly.

**Verification:** all Stage 1 gates plus profiler attribution for indexed pair self-time.

**Keep gate:** at least two high-count average rows improve by 5% or more, no repeatable row regresses beyond 5%, and the profiler shows reduced pair-path self-time. Otherwise revert Stage 2 and decide whether Stage 1 still has an independent measured benefit.

## Stage 3 — typed pair forces and collision state

**Production files:** `js/ParticleNetwork.js`; optional dedicated force/collision benchmark script.

Move pair attraction/repulsion and collision position/velocity mutations to indexed buffers. Preserve current precision by copying post-physics Float32 velocities into reusable Float64 pair-work buffers only when a mutating pair feature is enabled, accumulating there in pair order, then committing once to Float32 at frame end. Migrate collision corrections to position work storage in the same stage. Default force/collision-off frames must not pay for Float64 copying.

**Verification:** multi-frame force/collision exactness is the primary gate, including invalid values and pointer exclusion. Add force-enabled and collision-enabled performance profiles; also rerun ordinary static/cycling matrices to prove disabled features remain free.

**Keep gate:** exact/tolerance-approved state sequence, no disabled-path regression above 5%, and no meaningful enabled-feature regression. A cleaner ownership model is not sufficient.

## Stage 4 — remove per-frame regular-object synchronization

**Production files:** `js/ParticleNetwork.js`, `js/ui/applyParams.js`, `js/Benchmark.js`, `js/ParticleLifecycle.js`; related tests.

Make typed arrays authoritative for regular runtime state. Render trails/2D particles from indexed scalar data, update particle appearance in `sizeA`, make gather write typed state once, migrate BenchmarkSystem away from direct object construction/mutation, and remove `_syncObjectsFromSoA` plus the object-velocity persistence loop. Keep pointer handling separate. Provide an explicit snapshot/debug adapter only if a real consumer still needs object-shaped state; do not rebuild transient objects per frame.

The current appearance code's `Array.isArray(pn.sizeA)` check is false for Float32Array, so it never updates `sizeA`; preserve the observed shipped contract during earlier stages and address this only here with a dedicated appearance regression.

**Verification:** complete functional/lifecycle suite, appearance and trails tests, benchmark count/restoration, allocation profile, CPU profile, and full three-workload matrix.

**Keep gate:** measurable CPU or allocation improvement with no behavior regression. Because current sync costs only about 0.15-0.21 ms/frame at 10,000 particles, reject this stage if the broader consumer migration does not produce a measurable benefit.

## Stage 5 — direct typed-array creation and regular-object removal

**Production files:** `js/ParticleNetwork.js`, `js/Benchmark.js`, lifecycle/tests.

Allocate and initialize regular positions, velocities, and sizes directly for startup, resize rebuild, wheel/key count changes, and benchmark exact counts. Remove regular particle instances only after Stage 4 leaves no live consumer. Retain a dedicated pointer object and a scalar 2D draw helper. Replace constructor discovery in BenchmarkSystem with an engine-owned exact-count API.

**Verification:** fixed-PRNG initialization equivalence, count grow/shrink preservation, startup/rebuild latency, allocation/heap measurements, teardown release, full correctness suite, and steady-state matrix.

**Keep gate:** a measured startup/rebuild or memory reduction plus no steady-state regression above 5%. Do not keep object removal merely for architectural purity.

## Stage 6 — re-profile and stop or target renderer staging

Profile the accepted final architecture again. If pair math remains dominant, identify the specific color/line branch rather than performing another general rewrite. Consider a direct indexed renderer batch API only if scalar `addLine`/`addPoint` calls and staging writes are now proven hot. Otherwise mark SoA complete and stop.

## Commit and rollback protocol

For every stage:

1. Re-read the SoA ledger and this plan; inspect the tracked/untracked state.
2. Record the current commit as the exact BEFORE point and add/commit test instrumentation first when needed.
3. Change only that stage's ownership boundary.
4. Run deterministic gates before performance work.
5. Run quick, focused/full, profile, allocation, or startup tests appropriate to the stage.
6. Revert a failing candidate in production while retaining its test and ledger evidence.
7. Commit an accepted implementation separately, then commit the ledger result before planning the next stage.

The user-owned untracked `webgl-black-hole/` directory remains excluded from every command and commit.
