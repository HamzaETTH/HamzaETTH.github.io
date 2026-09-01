# Deferred Startup and Lazy Settings Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete P1-7 and P1-8 while making the hidden settings pane load/build only on demand and preserving the measured P1-5 sync behavior.

**Architecture:** First isolate classic-script scheduling with ordered `defer`. Then move the inline controller to a cacheable local module that registers lightweight hotkeys at startup but dynamically imports Tweakpane and constructs bindings only on first C; pane-dependent sync state begins only when visible and is canceled when hidden.

**Tech Stack:** Static HTML, classic/deferred JavaScript, ES modules, Tweakpane 4.0.5, Microsoft Edge via Playwright.

---

### Task 1: Establish Cycle 2 baselines

**Files:**
- Create: `scripts/test-startup-lifecycle.js`
- Modify: `OPTIMIZATION.md`

1. Record `c68858a` and the clean tracked state.
2. Capture classic-script order, particle-instance timing, DCL/load timing, initial Tweakpane request/build state, hotkey availability, WebGL health, and hidden UI-sync state.
3. Commit the reusable baseline probe separately.

### Task 2: Complete P1-7 in isolation

**Files:**
- Modify: `index.html`
- Modify: `OPTIMIZATION.md`

1. Record the probe checkpoint as the exact baseline.
2. Add `defer` to the eight ordered classic scripts without changing their order or engine constructor.
3. Run lifecycle/startup probes, deterministic smoke, settings restoration, and the quick A/B benchmark.
4. Keep only if behavior is unchanged and the regression gate passes; document and commit separately.

### Task 3: Complete P1-8 and lazy pane construction

**Files:**
- Create: `js/ui/pane.js`
- Modify: `index.html`
- Modify: `scripts/benchmark-ui-sync.js`
- Modify: `scripts/test-startup-lifecycle.js`
- Modify: `OPTIMIZATION.md`

1. Record the P1-7 commit as baseline.
2. Move the inline controller to `js/ui/pane.js`; retain local utility/application imports.
3. Register all hotkeys after the particle instance is ready without importing Tweakpane.
4. On first C, share one dynamic-import/build promise for Tweakpane 4.0.5, create all bindings once, synchronously catch up runtime colors, and show the pane.
5. On later C presses, reuse the pane/container; hidden or unbuilt state must have no runtime-sync timer or binding refreshes.
6. Keep non-pane hotkeys functional before Tweakpane loads; handle a blocked CDN without breaking the engine or other hotkeys.
7. Adapt UI-sync instrumentation to build the pane through C before inspecting bindings.

### Task 4: Cycle 2 validation and checkpoint

1. Compare initial request lists and DCL behavior against the exact baseline.
2. Test first C, repeated/rapid C, populated controls, settings restoration, and zero duplicate panes.
3. Block jsDelivr and prove initial engine/WebGL/non-pane hotkeys still work.
4. Run the five-trial UI-sync benchmark and quick FPS gate; escalate any >5% uncapped regression.
5. Update `OPTIMIZATION.md`, commit the accepted P1-8/lazy state, verify the tracked tree, and reassess before Cycle 3.
