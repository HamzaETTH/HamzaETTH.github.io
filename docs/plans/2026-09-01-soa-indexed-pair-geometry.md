# Cycle 9: indexed pair geometry experiment

**Exact baseline:** `230e626` (`docs: record rejected index grid`)

**Application baseline:** unchanged `2cabf86` (`perf: scan neighboring cells once`)

## Why the plan changed

Stage 1 proved that integer grid cells plus `particles[index]` resolution regress the unchanged object pair path by 7.85-20.48% in five of six reportable rows. This cycle keeps the current fast object-reference grid and targets the measured 91.8-92.1% `interactParticles` hotspot directly.

## Plan

1. Keep grid storage, traversal, object synchronization, force/collision ownership, pair order, and renderer call order unchanged.
2. At point draw and the start of `interactParticles`, use each object's stable `index`. For regular indices `< numParticles`, read `posX`, `posY`, and `sizeA`; for the pointer sentinel, read the pointer object's fields.
3. Thread four scalar endpoint coordinates through distance, midpoint, gradient, proximity, jitter, GL, and 2D line geometry. Keep object references only for existing force/NaN velocity behavior and trails particle drawing. Do not introduce coordinate wrapper objects or per-pair arrays.
4. Run syntax, the exact Stage 0 multi-frame hash, pure grid contract, three live pair trials, frame color/settings, visibility, teardown, resize/WebGL, and browser-error gates.
5. Run quick and full alternating 5k/10k/15k static+cycling A/B, then compare DevTools pair-path self-time at 10k. Confirm any row crossing the 5% rejection threshold.
6. Accept only if at least two high-count average rows improve by 5% or more, no repeatable average row regresses beyond 5%, and pair self-time falls. Otherwise reverse the production change and preserve the result in the ledger.

## Precision and rollback

Regular object positions are copied from the same Float32 arrays immediately before grid construction, so scalar coordinate values must be exactly equal. Pair forces continue accumulating in object velocity fields and are rounded once during the existing end-of-frame Float32 write. The exact BEFORE commit stays served from the detached worktree; an accepted implementation and its ledger update receive separate commits.
