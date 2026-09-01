# Cycle 8: final-engine SoA investigation and staged design

**Pre-SoA milestone baseline:** `bc3ba54` (`docs: record cumulative optimization milestone`)

**Application baseline:** `2cabf86` (`perf: scan neighboring cells once`)

## Scope and isolation

This cycle profiles and maps the final engine before any architectural edit. It may add profiling/correctness tooling and a detailed staged SoA plan, but it does not migrate production storage or hot paths. That keeps the pre-SoA milestone exact and prevents an audit assumption from becoming a rewrite.

## Investigation plan

1. Extend the existing DevTools CPU-profile harness with current-only and workload selection modes. Profile the exact final tree at 10,000 particles for static, cycling/gradient, and particle-cycling workloads; report per-frame self time and hottest source nodes.
2. Map the frame in execution order: SoA physics, object synchronization, grid insertion, point rendering, pair geometry/forces/line rendering, optional collisions, velocity persistence, and GL flush. Quantify which part is actually hot after P1-4.
3. Map every object/SoA creator, mutator, and consumer outside the frame loop, including rebuild/count changes, pointer state, keyboard gather, settings applies, BenchmarkSystem, teardown, and regression tooling.
4. Identify semantic hazards before design: the interactive pointer is outside typed arrays; pair forces currently accumulate in double-precision object fields before one Float32 write; collision changes object positions after the SoA-to-object sync; trails use particle methods; tests and benchmark utilities manipulate `pn.o` directly.
5. Define deterministic multi-frame gates for static motion, wrap/bounce, attraction/repulsion, pointer proximity, collision, trails/2D fallback, line effects, count rebuilds, settings restoration, and teardown. Define per-stage quick/focused/full performance gates and exact rollback commits.
6. Write a detailed incremental SoA/index migration plan based on measured bottlenecks. Each stage must be independently implementable, testable, benchmarkable, documentable, and revertible. If profiling makes a proposed stage unjustified, reject it before production editing.

## Gate

No production SoA change begins until final-tree profiles, the ownership/consumer map, deterministic gates, migration boundaries, and stop/go thresholds are written into `OPTIMIZATION.md` and the detailed plan is committed.
