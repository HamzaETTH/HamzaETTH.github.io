# Cycle 4: complete lifecycle teardown

**Application baseline:** `3bbe80c` (`docs: complete hidden simulation cycle`)

## Scope and isolation

This cycle adds explicit ownership and disposal for the particle engine, WebGL renderer, performance monitor, hotkey singleton, lazy settings UI, visibility lifecycle, DOM, timers, and globals. It stays separate from configuration cleanup and P1-4 so recreation failures can be bisected without mixing behavior or hot-path changes.

## Ownership matrix

| Owner | Must release |
|---|---|
| ParticleNetwork | rAF, resize debounce, gather timers/toast, window/document/canvas listeners, pointer state, canvases/container, particles, grid, SoA arrays, monitor, GL renderer, public instance global |
| ParticleRendererGL | five buffers, two programs and attached shaders, canvas, typed staging arrays, WebGL context |
| PerformanceMonitor | active-monitor global, overlay/pre DOM references, running state |
| HotkeyManager | stored window keydown/keyup listeners, registered handlers/context, guide/toast timers and DOM |
| Settings bootstrap | visibility listener, sync/toggle timers, lazy pane/container, Tweakpane instance, hotkey context/handlers, benchmark runner global |

## Plan

1. Instrument listener additions/removals, rAF/cancel, timeout/clear, stale callbacks, DOM nodes, WebGL context state, and globals. Capture repeated recreation failure on the unchanged baseline and commit the test-only checkpoint.
2. Store every handler and timer at creation. Add idempotent `destroy()` methods from leaf resources upward, then one page-level lifecycle function that destroys UI ownership before the engine and supports clean recreation.
3. Guard stale async pane builds and callbacks with generation/destroy state. Repeated destroy calls must be harmless.
4. Run at least two create-destroy cycles followed by a healthy live third instance. Assert zero owned listener/timer/rAF balance for destroyed instances, removed DOM/resources/globals, no stale callback activity, exactly one final engine/pane/hotkey owner, and a non-lost final WebGL context.
5. Run startup/lazy-pane, visibility, deterministic pair/color, settings restoration, error, and exact-preceding-tree quick FPS gates. Document and commit the isolated result.

## Risks

- The engine currently uses anonymous bound listeners, so converting them must preserve options and event semantics exactly.
- Tweakpane imports/builds asynchronously; destroying during the promise must not resurrect UI.
- WebGL test contexts are intentionally lost on destroy, but the newly created live instance must have a fresh healthy context.
- A global hotkey singleton is loaded once by a classic script; recreation must reattach it without loading the script twice.
