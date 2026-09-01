# Cycle 7: requested-scope cumulative milestone

**Requested-scope baseline:** `5d017c4` (HEAD before the 2026-09-01 startup/lifecycle/configuration/P1-4 work)

**Final application checkpoint:** `2cabf86` (`perf: scan neighboring cells once`), with ledger-only HEAD `2bd5164`

## Scope and isolation

This cycle makes no application change. It validates and measures the cumulative accepted tree after P1-4, P1-6 through P1-9, lazy settings construction, hidden-document pausing, lifecycle teardown, the manifest fix, and configuration consolidation. The result becomes the rollbackable pre-SoA milestone.

## Plan

1. Serve exact baseline `5d017c4` from the detached worktree and the current tree from the existing optimized server. Record environment and commit identities.
2. Run the cumulative quick diagnostic, then the reportable three-trial alternating matrix at 5,000/10,000/15,000 particles for static, cycling/gradient, and particle-cycling workloads.
3. Run the final tree through startup/load and lazy-pane behavior (including blocked CDN), exact configuration contract, grid and live-pair equivalence, frame colors/settings restoration, hidden pause/resume, repeated destroy/recreate and pending-build abort, resize/context health, manifest fetch/JSON, console/page/request errors, and source/reference checks for accepted dead-code work.
4. Record all requested items, rejected experiments, benchmark tables, regression results, and the final keep decision in `OPTIMIZATION.md`.
5. Commit the documentation-only milestone. Do not begin SoA investigation until this commit exists.

## Gates

- Every final-tree correctness/lifecycle assertion must pass.
- Every benchmark measurement must reach the requested particle count with active rAF and healthy WebGL; settings must restore exactly and browser errors must remain empty.
- Any repeatable cumulative regression must be traced to its individual BEFORE/AFTER point before the milestone is accepted.
