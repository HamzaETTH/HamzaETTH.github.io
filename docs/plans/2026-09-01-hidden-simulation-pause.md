# Cycle 3: hidden-document simulation pause

**Application baseline:** `efd8d1f` (`perf: lazy-build settings controls`)

## Scope and isolation

This cycle changes only document-visibility ownership of the existing animation loop. It stays separate from `destroy()` because teardown must later cover every listener and resource, while this optimization needs a narrow A/B point and must not change physics, rendering, configuration, or hotkeys.

## Plan

1. Add a deterministic visibility lifecycle probe before changing the engine. Verify the current loop continues while hidden, and capture running/stopped state transitions.
2. Commit that test-only checkpoint as the exact implementation baseline.
3. Add one stored `visibilitychange` handler that cancels the queued frame while hidden and resumes only a loop that should be running. Reset `_lastUpdateTime` before resume and guard all scheduling against duplicate rAF callbacks.
4. Verify hidden work stops, visible resume produces one loop without a large `dt`, and a velocity-zero loop stays stopped across hide/show. Run the existing frame-color/settings/WebGL smoke and exact-tree quick benchmark.
5. Record results and the keep/revert decision in `OPTIMIZATION.md`, then commit the isolated optimization.

## Gates

- Hidden/running reaches `_rafActive=false`, `_rafId=null`, and does not execute simulation frames.
- Resume schedules exactly one animation chain and the first resumed `_dt` remains bounded to an ordinary frame rather than the hidden duration.
- Hidden/stopped and visible/stopped remain stopped.
- A non-zero velocity selected while hidden resumes once on visibility restoration.
- WebGL remains healthy, settings restore, and no browser error occurs.
- No uncapped average-FPS row regresses more than 5% in the quick exact-preceding-tree gate; confirm any crossing before deciding.
