# Performance Audit — Particle Network Site

Generated 2026-08-30. Four parallel review lanes (UI/main-thread, memory lifecycle, startup/bundle, architecture), all findings grounded in read code. Validation tools already in repo: Benchmark.js (hotkey **B**, 1500→15000 particles), PerformanceMonitor overlay (hotkey **P**), Chrome DevTools Performance/Memory/Allocation.

Estimated combined win: **1.3–2x at default particle count, 2–5x at 1.5k–15k particles**, plus ~30 KB off the load path and render-blocking cleanup.

## Optimization progress ledger

This file is the permanent optimization record. Every optimization must be isolated, benchmarked against the exact tree that preceded it, and updated here before moving to the next item. Results are append-only: regressions and rejected experiments stay documented.

| Order | Item | Status | Evidence | Next gate |
|---:|---|---|---|---|
| 1 | P0-1 — pair-loop allocations | **COMPLETE** | Full two-profile A/B matrix below | Keep |
| 2 | P0-2 — redundant GL resize | **COMPLETE** | Resize regression plus full two-profile A/B matrix below | Keep |
| 3 | P0-3 — unconditional UI rebuild | **REJECTED** | 2026-08-31 live rebuild-count validation below | Audit premise was stale; no production change |
| 4 | P1-4 — duplicate neighbor scan | **NEXT** | Rationale corrected after index-guard review | Deterministic pair-set equivalence test, then full A/B matrix |
| 5 | P1-5 — permanent UI-sync rAF | **COMPLETE** | Five-trial UI instrumentation and quick FPS gate below | Keep |

Progress protocol:

1. Mark one item **IN PROGRESS** and record the baseline commit before editing code.
2. Run the smallest relevant correctness test and the automated `--quick` benchmark gate.
3. Use the full 60-measurement matrix only for steady-state render/physics changes; use an interaction-latency benchmark for event-driven UI changes.
4. Append dated environment, method, median average FPS, minimum instantaneous FPS, regressions, smoke results, and the keep/revert decision to that item's section.
5. Mark the item **COMPLETE**, **INCOMPLETE**, or **REJECTED** before starting another optimization. Never claim completion from code inspection alone.

---

# P0 — Do first (big wins, low risk)

## P0-1 — COMPLETE. Per-pair closures + per-pair color math (biggest single win)

**Locations:**
- `js/ParticleNetwork.js:1301-1320` — `hexToRgb01` and `hslToRgb01` declared *inside* `interactParticles`, capturing `alphaFactor`
- `js/ParticleNetwork.js:1337-1341` — `hslToRgb01(lineHue1/2)` per connected pair (cycling on, default); `:1358-1361` — `hexToRgb01(options.gradientColor1)` with `parseInt`+`slice` per pair (cycling off)
- `js/ParticleNetwork.js:1325-1330` — distance-effect branch allocates `interpolateColor` array, `rgbToString` string, `c` array per pair
- `js/ParticleNetwork.js:1340-1341` — fresh GL color arrays per pair
- `js/ParticleNetwork.js:1281, 1286` — fresh pair array per pair
- `js/ParticleNetwork.js:181` — `particleInteractionDistance * particleInteractionDistance` recomputed per particle per pair in `applyParticleInteraction`

**Trigger:** every candidate/connected pair, every frame.

**Why expensive (magnitudes):**
- 2 new closure objects **per candidate pair per frame — even pairs that early-return**. Default scene (~414 particles at 1080p, density 5000): ~5.4k candidates/frame → ~10k allocs/frame; 15k particles: ~7M candidates → ~14M allocations/frame. Young-gen GC storm, not a math problem — the benchmark is literally measuring this.
- Frame-constant hues reconverted per pair. `hslToRgb01` returns a fresh array each call; default cycling+gradient branch = 2 array allocs per connected pair (~900–1500 pairs/frame default; ~270k at 5000 particles; ~2.4M at 15000).

**Fix:**
1. Hoist `hexToRgb01`/`hslToRgb01` to module scope; pass `alphaFactor` as parameter (no closure materialization).
2. Precompute frame-constant line colors once per frame; only alpha varies per pair.
3. Write line colors into preallocated module-scratch `Float32Array`s (the GL renderer copies them immediately anyway).
4. Change `applyParticleInteraction` to take two particle args instead of a fresh array.

**Validation:** Benchmark.js A/B across all five steps (1500→15000); DevTools Allocation Sampling during 5000/10000-particle run — closure/array allocs should vanish from the pair loop.

**Confidence:** high (mechanism certain; visible magnitude scales with link count).

### Benchmark results — 2026-08-30

**Environment:** Windows 10 Pro 22H2 (build 19045), AMD Ryzen 7 5800X3D (8C/16T), 32 GB RAM, NVIDIA GeForce RTX 5080 (driver 32.0.16.1062), Microsoft Edge 152.0.4191.53, ANGLE D3D11 WebGL. The agent launched Edge through Playwright in headed mode with a 1280×720 viewport and DPR 1; the display refresh cap observed by the benchmark was approximately 144 Hz.

**Method:** two temporary copies were made from the exact dirty working tree. The optimized copy retained P0-1; the baseline copy reversed only P0-1 in `js/ParticleNetwork.js`. A recursive comparison confirmed that this was the only A/B application-code difference. Both copies were served on separate localhost ports and measured in the same browser/context. Each profile used the existing `Benchmark.js` control settings, a 500 ms warmup, and the existing 2/2/2/2/3-second windows for 1,500/3,000/5,000/10,000/15,000 particles. Variant order alternated across three trials. Values below are medians; "minimum" is the minimum instantaneous FPS sample, not a 1% low.

**Static control** (`lineColorCycling=false`, `gradientEffect=false`):

| Particles | Baseline avg | Baseline minimum | Optimized avg | Optimized minimum | Avg change | Minimum change |
|---:|---:|---:|---:|---:|---:|---:|
| 1,500 | 144.00 | 117.65 | 143.52 | 48.08 | -0.3% | -59.1%* |
| 3,000 | 50.72 | 43.48 | 80.68 | 57.47 | +59.1% | +32.2% |
| 5,000 | 17.09 | 15.20 | 27.29 | 23.04 | +59.7% | +51.6% |
| 10,000 | 4.29 | 4.46 | 6.18 | 5.55 | +43.9% | +24.5% |
| 15,000 | 1.77 | 1.77 | 2.76 | 2.91 | +56.5% | +64.9% |

**Cycling/gradient** (same control settings except `lineColorCycling=true`, `gradientEffect=true`):

| Particles | Baseline avg | Baseline minimum | Optimized avg | Optimized minimum | Avg change | Minimum change |
|---:|---:|---:|---:|---:|---:|---:|
| 1,500 | 143.97 | 106.38 | 143.06 | 58.82 | -0.6% | -44.7%* |
| 3,000 | 47.87 | 36.36 | 65.84 | 49.26 | +37.5% | +35.5% |
| 5,000 | 16.17 | 13.89 | 20.68 | 16.67 | +27.9% | +20.0% |
| 10,000 | 4.12 | 4.11 | 4.81 | 4.44 | +16.6% | +7.9% |
| 15,000 | 1.49 | 1.49 | 2.01 | 2.00 | +35.1% | +34.3% |

\* At 1,500 particles, both variants were refresh-rate-capped and the initial minimum samples were dominated by isolated page-load hitches. A separate three-trial alternating confirmation at only 1,500 particles did not reproduce the regression: static average was unchanged (-0.01%) and minimum improved 10.4%; cycling/gradient average was unchanged (+0.01%) and minimum improved 6.9%.

**Verification:** all 60 reportable measurements reached the exact requested particle count with the rAF loop active, WebGL present, and no context loss. Optimized smoke checks found no console or page errors, rendered correctly at 1280×720, prepared cycling frame colors, and restored the original particle count and settings. The smoke check exposed a pre-existing unit-remapping bug in `BenchmarkSystem.restoreSettings()`; `js/Benchmark.js` now reapplies the exact engine snapshot after UI side effects, and two subsequent restoration checks passed. Dynamic gradient values continue changing after restoration when line-color cycling resumes, as expected.

**Reusable runner:** `scripts/benchmark-particle-network.js` launches Edge without user interaction and accepts baseline/optimized URLs. The default command runs the full reportable matrix; `--quick` runs 12 diagnostic measurements, `--smoke-only` skips performance measurements, and `--counts`/`--trials` support targeted confirmation. Run `rtk node scripts/benchmark-particle-network.js --help` for the exact command line.

**Conclusion:** P0-1 is complete. At the refresh-rate cap it is neutral; from 3,000 through 15,000 particles it consistently improves median average FPS and minimum instantaneous FPS in both profiles, with no repeatable regression or functional failure.

## P0-2 — COMPLETE. Per-frame GL canvas resize (drawing buffer destroyed 60x/sec)

**Locations:**
- Call site: `js/ParticleNetwork.js:881-885` — `update()` called `this.glRenderer.resize(this.i.size.width, this.i.size.height)` at the top of every frame, unconditionally
- Implementation: `js/ParticleRendererGL.js:131-140` — `resize()` assigns `this.canvas.width/height` with **no change-check**
- Aggravation: `beginFrame()` clears again at `ParticleRendererGL.js:154` (double clear)

**Trigger:** every animation frame — the default path on every page load (GL renderer created in `init` at `ParticleNetwork.js:403-414`).

**Why expensive:** assigning `canvas.width`/`height` on a WebGL canvas — even to the same values — is spec-defined to discard the drawing buffer and force the browser/driver to allocate a fresh backing store, plus resets GL state (the subsequent `viewport` set exists *because* of the reset). Several ms/frame on some drivers; defeats the capacity pre-sizing done in `beginFrame()`.

**Fix:** cache last `width`/`height`/`dpr` in `resize()` and early-return when unchanged; call it only from `_rebuildOnResize` / DPR-change paths, not from the frame loop. (The 2D canvas has the same pattern at `ParticleNetwork.js:458-464` but only on actual resize events — that one is fine.)

**Validation:** FPS overlay (P) before/after; Performance trace — recurring GPU buffer-realloc tasks disappear.

**Confidence:** high.

### Benchmark results — 2026-08-31

**Environment:** Windows 10 Pro 22H2, AMD Ryzen 7 5800X3D, 32 GB RAM, NVIDIA GeForce RTX 5080, Microsoft Edge 152.0.4191.53, and ANGLE D3D11 WebGL. Playwright launched Edge headlessly with a 1280×720 viewport and DPR 1. Both variants ran in the same browser context; the observed refresh cap was approximately 144 Hz.

**Method:** the benchmark baseline was detached worktree `30eb954` (benchmark progress and the failing resize regression present, P0-2 production code absent). The optimized worktree copied in only the current `js/ParticleNetwork.js` and `js/ParticleRendererGL.js`; both worktrees otherwise came from the same commit, the baseline was clean, and the optimized status listed only those two files. The unrelated nested `webgl-black-hole` repository was excluded. The quick gate used one trial at 1,500/5,000/15,000 particles. The reportable run used both profiles, all five particle counts, a 500 ms warmup, 2/2/2/2/3-second measurement windows, and three alternating trials per variant/profile. Values below are medians; "minimum" means minimum instantaneous FPS, not a 1% low.

**Static control** (`lineColorCycling=false`, `gradientEffect=false`):

| Particles | Baseline avg | Baseline minimum | Optimized avg | Optimized minimum | Avg change | Minimum change |
|---:|---:|---:|---:|---:|---:|---:|
| 1,500 | 143.49 | 51.55 | 143.96 | 117.65 | +0.33% | +128.24% |
| 3,000 | 70.53 | 57.47 | 70.99 | 54.95 | +0.65% | -4.40% |
| 5,000 | 23.28 | 17.67 | 23.55 | 20.75 | +1.18% | +17.43% |
| 10,000 | 5.33 | 5.09 | 6.05 | 5.16 | +13.61% | +1.39% |
| 15,000 | 2.40 | 2.49 | 2.56 | 2.59 | +6.45% | +3.83% |

**Cycling/gradient** (`lineColorCycling=true`, `gradientEffect=true`):

| Particles | Baseline avg | Baseline minimum | Optimized avg | Optimized minimum | Avg change | Minimum change |
|---:|---:|---:|---:|---:|---:|---:|
| 1,500 | 143.53 | 55.25 | 144.11 | 101.01 | +0.40% | +82.83% |
| 3,000 | 60.49 | 47.62 | 59.04 | 49.75 | -2.40% | +4.48% |
| 5,000 | 18.98 | 15.08 | 20.10 | 15.58 | +5.93% | +3.27% |
| 10,000 | 4.62 | 5.18 | 5.26 | 4.20 | +14.01% | -18.83% |
| 15,000 | 1.94 | 1.94 | 1.74 | 1.74 | -10.20% | -10.20% |

**Low-FPS confirmation:** the full matrix's 15,000-particle cycling/gradient result sampled only about 5–8 frames per trial and conflicted with the static improvement. A focused second three-trial alternating run at 15,000 particles did not reproduce the same magnitude: static average/minimum changed by +2.72%/+3.48%, while cycling/gradient changed by -1.79%/-1.79%. The direction and magnitude varied across trials, so no consistent regression was established. The refresh-capped 1,500-particle minimums were likewise dominated by isolated page-load hitches and are not treated as a claimed 2× improvement.

**Verification:** the regression test recorded 30 stable-frame `resize()` calls on baseline and zero on optimized; a real 1200×700 container resize produced exactly one optimized call, correct CSS/backing dimensions, an active non-lost WebGL context, and no console/page errors. All quick, full, and focused-confirmation measurements reached the requested particle counts with rAF active, WebGL present, and no context loss. Smoke checks rendered cycling/gradient colors and restored the original count and settings with no unexpected mismatch or browser error; visual inspection of the restored 1280×720 screenshot confirmed full-canvas particles and gradient lines with no blank/reset frame or rendering artifact.

**Duration:** the quick gate completed 12 measurements in 0:29; the full 60-measurement matrix completed in 3:16; the focused 12-measurement confirmation completed in 1:04. `scripts/benchmark-particle-network.js` now prints completed/total measurements, elapsed time, and ETA after every run, so future optimization benchmarks expose their progress without user interaction.

**Conclusion:** keep P0-2 and mark it complete. The change removes all stable-frame canvas resize/reset calls while preserving initialization, actual container resize, and DPR-change handling. Median average FPS improved in 8 of 10 reportable rows; the two negative rows and low-FPS minimum variation did not reproduce consistently in focused confirmation, and no functional failure occurred.

## P0-3. Every UI change rebuilds the entire particle system

**Locations:**
- `js/ui/applyParams.js:92-98` — `if (typeof p.density === 'number' && p.density > 0) { o.density = p.density; pn._rebuildOnResize(); }`
- `index.html:115` — `buildParamsFromNetwork` sets `density: pn.options.density || 10000` → **density is always a number**, guard always true
- Every pane binding `.on('change')` calls `applyParamsToNetwork(pn, PARAMS)` with the full PARAMS object (`index.html:286, 296-399`)
- Rebuild: `js/ParticleNetwork.js:443-495` (`_rebuildOnResize`); SoA re-alloc: `:1162-1178` (`_initSoAFromObjects`)
- Double rebuild: `index.html:267` — `doReset` calls `pn._rebuildOnResize()` explicitly *after* `applyParamsToNetwork` already did it

**Trigger:** any tweakpane change event, hotkey toggle (R/D), Randomize, or Reset. Sliders/color pickers fire `change` per drag step → tens of full rebuilds per second while dragging.

**Why expensive:** `_rebuildOnResize` tears down `this.o`, allocates `area/density` fresh particle objects (each with several `Math.random()` calls + object literals), reallocates 5–6 SoA `Float32Array`s, re-inits the spatial grid, resizes GL — all synchronously on the main thread. Default density 10000 → ~200 objects/event; after wheel-scaling up, tens of thousands per drag event. Reset does two full rebuilds back-to-back.

**Fix:**
- Only rebuild when density actually changed: `p.density !== o.density`
- Remove the redundant `_rebuildOnResize()` in `doReset`
- Optionally debounce (e.g. trailing 50–100ms)

**Validation:** drag a slider while recording a Performance trace — rebuild clusters appear per drag step; Allocation Timeline shows heap sawtooth. After fix: flat.

**Confidence:** high (code path unambiguous).

### Runtime validation — 2026-08-31

**Evidence:** live instrumentation against baseline commit `46da522` found that the shipped density is the string `"5000"`, not a number. The numeric guard in `applyParamsToNetwork` therefore rejects density during ordinary full-`PARAMS` UI applies. Ordinary control changes caused zero `_rebuildOnResize()` calls, while Reset caused exactly one call from its explicit reset path.

**Conclusion:** reject P0-3 without a production change. Its audit premise was stale, and adding a density comparison or removing the reset rebuild would not eliminate a repeated rebuild in the shipped UI path. Preserve the one reset rebuild because Reset intentionally restores a pristine particle state.

---

# P1 — High value

## P1-4. 8-neighbor grid scan visits every pair twice

**Status:** NEXT.

**Locations:** `js/ParticleNetwork.js:1029-1050` — 3×3 neighbor loop visits all 8 offsets; dedup guard `particleA.index < particleB.index` at `:1045` runs *after* visiting; same-cell pairs handled at `:1024-1027`.

**Why expensive:** ~half of the neighboring-cell traversal and pair-index comparisons are redundant: the pair (A,B) is reached from A's cell and again from B's cell, but the existing `particleA.index < particleB.index` guard skips the second visit before interaction and distance calculations run. A half-neighborhood scan would remove the duplicate traversal and comparisons, not duplicate distance math, so the expected gain is smaller than originally documented.

**Fix:** replace the 8-offset loop with the 4 half-neighborhood offsets `(0,1), (1,-1), (1,0), (1,1)` — same-cell already covered. Existing index guard keeps it correct and deduped. Identical math, zero visual change.

**Validation:** Benchmark.js at 5000/10000/15000 before/after; DevTools self-time of update loop.

**Confidence:** high.

## P1-5 — COMPLETE. Second permanent rAF loop doing DOM writes every frame

**Baseline commit:** `46da522` (implementation benchmarked from instrumentation checkpoint `b264500`).

**Locations:** `index.html:479-515` — `syncRuntimeToControls`; self-reschedules in the early-return branch (`:480`, even when `!pn` — would spin forever) and in `finally` (`:512`); starts unconditionally at `:515` in DOMContentLoaded.

**Why expensive:** runs forever alongside the sim loop, even when the animation is stopped (velocity 0 halts the sim loop at `ParticleNetwork.js:1120-1124`; this loop does not halt). With shipped defaults (`lineColorCycling: true`, `gradientEffect: true`), every frame:
- allocates strings via `rgbArrayToHex`
- calls `bindGradient1.refresh()` / `bindGradient2.refresh()` (`:489-500`) — tweakpane re-renders the color views → DOM style writes at 60Hz on a pane that is `display:none` by default
- with `randomizeDistanceColors` on, also refreshes start/end color bindings every frame

Latent feedback-loop risk: if a refresh emits `change`, it re-triggers the full `applyParamsToNetwork` path every frame. The 2026-08-31 P0-3 validation confirmed that this does not rebuild particles with the shipped string density, but the repeated apply work would still be wasteful.

**Fix:** only refresh when the computed hex actually changed (string compare against last synced value); throttle to ~10Hz; skip entirely while pane is hidden; or drive the sync event-based from the change handlers. Store the rAF id so it can be cancelled.

**Validation:** Performance trace shows 2 rAF callbacks per frame; set speed to 0 — this loop still fires. Toggle `lineColorCycling` off and observe frame-time drop.

**Confidence:** high.

### Benchmark results — 2026-08-31

**Environment:** Windows 10 Pro 22H2, AMD Ryzen 7 5800X3D, 32 GB RAM, NVIDIA GeForce RTX 5080, Microsoft Edge 152.0.4191.53, and ANGLE D3D11 WebGL. Playwright launched Edge headlessly with a 1280×720 viewport and DPR 1. Both detached worktrees came from `b264500`; the baseline was clean and the optimized tree differed only in `index.html`.

**Method:** `scripts/benchmark-ui-sync.js` ran five alternating A/B trials in one Edge context. Each state used a 1.1-second measurement window; stopped states followed a 500 ms settling period. The runner recursively instrumented Tweakpane leaf bindings through both `children` and tab `pages`, counted executed rAF callbacks, binding refresh calls, and refresh execution time, and exercised the real `C` hotkey toggle. Values below are medians.

| State | Baseline rAF callbacks | Optimized rAF callbacks | Baseline binding refreshes | Optimized binding refreshes | Baseline refresh time | Optimized refresh time |
|---|---:|---:|---:|---:|---:|---:|
| Hidden / running | 318 | 159 | 318 | 0 | 80.4 ms | 0 ms |
| Visible / running | 320 | 159 | 320 | 20 | 79.5 ms | 8.8 ms |
| Visible / stopped | 159 | 0 | 318 | 0 | 1.1 ms | 0 ms |
| Hidden / stopped | 159 | 0 | 318 | 0 | 1.2 ms | 0 ms |

The optimized visible/running result stayed below the 24-refresh gate in every trial while both gradient values advanced. Hidden/running, visible/stopped, and hidden/stopped produced zero binding refreshes in every optimized trial. Hidden/stopped also produced zero continuing rAF callbacks. Showing the pane synchronously updated its gradient sources to `#123456` and `#654321` in all five trials.

**Quick FPS gate:** the existing 12-measurement runner used one trial at 1,500/5,000/15,000 particles for static and cycling/gradient profiles. This diagnostic is a regression gate, not a reportable performance claim.

| Profile | Particles | Baseline avg | Optimized avg | Avg change | Baseline minimum | Optimized minimum |
|---|---:|---:|---:|---:|---:|---:|
| Static | 1,500 | 144.00 | 144.01 | +0.00% | 128.21 | 111.11 |
| Static | 5,000 | 21.71 | 27.47 | +26.51% | 19.69 | 22.32 |
| Static | 15,000 | 1.29 | 2.26 | +74.79% | 1.29 | 2.26 |
| Cycling/gradient | 1,500 | 144.05 | 143.07 | -0.68% | 123.46 | 52.08 |
| Cycling/gradient | 5,000 | 20.20 | 26.82 | +32.75% | 16.29 | 23.31 |
| Cycling/gradient | 15,000 | 1.91 | 2.46 | +29.10% | 1.91 | 2.46 |

No uncapped average-FPS row regressed by more than 5%, so the focused confirmation rule did not trigger. The 1,500-particle minimum variation occurred at the approximately 144 Hz refresh cap and did not affect the gate decision.

**Verification:** all UI-sync and FPS measurements retained WebGL with no context loss, console error, or page error. The FPS smoke restored the original particle count and settings with no mismatch. A final focused UI-sync trial also asserted the rendered Tweakpane HEX inputs and swatches, not only the shared parameter sources; they synchronously showed `#123456` and `#654321`. A targeted controls-visible smoke updated randomized distance colors to `#abcdef` / `#012345` and particle cycling to `#00ff00`. Visual inspection of the 1280×720 controls-visible screenshot confirmed a correctly rendered pane over the live particle canvas, matching color swatches, and no blank frame or layout artifact.

**Duration:** the five-trial UI-sync A/B completed in 0:54; the quick FPS gate completed in 0:28.

**Conclusion:** keep P1-5 and mark it complete. Synchronization now starts with an immediate refresh when controls become visible, continues through one 100 ms timer only while visible, refreshes only changed color bindings, and cancels when hidden. Promote P1-4 to NEXT.

## P1-6. Startup: unused Inter font @import (render-blocking chain)

**Locations:** `css/style.css:1` — `@import url(https://fonts.googleapis.com/css?family=Inter:400,500,600,700,800&display=swap)`; separate Fira Code link at `index.html:15`.

**Why expensive:** `@import` inside the main stylesheet creates a serial render-blocking chain (HTML → style.css → fonts.googleapis.com). Inter — 5 weights, 5 font files — is **never used**: the entire CSS and body use `"Fira code"` (`style.css:16`, `HotkeyManager.js:203`). Two separate Google Fonts CSS requests instead of one; no `preconnect` to fonts.gstatic.com means font file downloads start late.

**Fix:** delete the Inter `@import` entirely; keep the single Fira Code `<link>`; add `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`.

**Validation:** network waterfall shows two fonts.googleapis.com CSS requests before, one after; Lighthouse render-blocking resources audit.

**Confidence:** high (Inter usage verified absent by full CSS read).

## P1-7. Startup: parser-blocking scripts + parse-time engine init

**Locations:**
- `index.html:48-55` — 8 classic scripts (~136 KB unminified total), no `defer`/`async`
- `js/ParticleNetwork.js:1557-1562` — `new ParticleNetwork(canvasDiv, options)` is **top-level code**, running during script evaluation

**Why expensive:** the parser stops at each `<script src>`, downloads, and executes serially. `ParticleNetwork.js` (69 KB) runs its *entire* synchronous init mid-queue — `init()` at `:285` creates the container div, constructs PerformanceMonitor, creates the 2D canvas, creates the WebGL context + compiles 2 shader programs (`:403-414`), registers ~10 event listeners, allocates the particle array (`viewportArea/density`; density `"5000"` at `:1511-1555` → ~210 particles at 1366×768, ~830 at 2560×1440), allocates SoA typed arrays, and starts the rAF loop — all before `Benchmark.js` and `HotkeyManager.js` even parse. Blocks DOMContentLoaded and the first animation frame.

**Fix:** add `defer` to all 8 script tags (order is preserved; `offsetWidth` reads then hit settled layout — actually *improves* init); and/or move the `new ParticleNetwork` call into the module's DOMContentLoaded handler or `requestIdleCallback`.

**Validation:** Performance trace "Evaluate Script" blocks; FCP/DCL delta before/after.

**Confidence:** high.

## P1-8. Startup: tweakpane CDN gates DOMContentLoaded

**Location:** `index.html:57` — `import {Pane} from 'https://cdn.jsdelivr.net/npm/tweakpane@4.0.5/dist/tweakpane.min.js'` (measured: 152,084 bytes, ~0.26s on a good connection).

**Why expensive:** the single largest JS payload on the page — larger than all local JS combined. Because it's a static import of a deferred module, DOMContentLoaded is delayed until the import graph resolves — so the whole pane build (`index.html:231`) and hotkey registration (`:701`) wait on cross-origin DNS+TCP+TLS+download. If the CDN is down or blocked, the page silently loses the controls pane and all hotkeys (the animation still runs).

**Fix:** vendor tweakpane locally (~152 KB minified), or lazy-load: dynamic `import()` inside a user gesture / `requestIdleCallback` so the animation is never gated on it.

**Validation:** devtools request blocking of `cdn.jsdelivr.net`; Network tab DCL timestamp tied to the tweakpane response.

**Confidence:** high.

## P1-9. Dead loads: ~30 KB waste + dead code

| Item | Location | Detail | Fix |
|---|---|---|---|
| `ParticleRenderer.js` loaded, never used | `index.html:51`; 10.5 KB; exports `window.ParticleNetworkRenderer` at `:310` | Only consumer is `ParticleCore.js:116`, itself never loaded. ~100% unused bytes | Remove script tag (and file) |
| `Benchmark.js` ships to all visitors | `index.html:54`; 16 KB | Dev-only; used solely by 'b' hotkey (`index.html:688-697`) which lazily constructs `BenchmarkSystem` | Lazy `import('./js/Benchmark.js')` inside the hotkey handler |
| Dead `buildDefaultParams()` | `index.html:151-225` | Defined, never called (~2.5 KB); third copy of the default-parameter map | Delete |
| Unused imports | `index.html:58` | `normalizeHex`, `toCssColor` never used | Trim import to `rgbArrayToHex, randInt, rand01, randBool, randHex` |
| `ColorUtils.js` duplicated first half | `js/ColorUtils.js:7-102` vs `:104-347` | Both top-level function declarations; hoisting makes the second copy (the superset, adds `rgbToLab`, `deltaE`, `contrastRatio`) win; first block ~5 KB dead | Delete lines 1-102 |
| Dead velocity-persist loops | `js/ParticleNetwork.js:416-439` | Two byte-identical loops copying `this.o[i].velocity` into `this.velX/velY`; guard `if (this.velX && this.velY && Array.isArray(this.o))` is always false at that point (`this.o` created `:509`, `velX` at `:517`) | Delete both blocks |
| Orphaned engine files | `js/ParticleCore.js` (18.8 KB), `js/ParticlePhysics.js` (11.6 KB) | Referenced by no HTML or JS anywhere (verified index.html, grid.html, full-repo search); features reimplemented inside `ParticleNetwork.js` | Delete |

**Validation:** DevTools Coverage tab.

**Confidence:** high for all rows.

## P1-10. Per-particle color string parsing every frame

**Locations:** `js/ParticleNetwork.js:828-835` — when cycling is on, writes the *identical* `hsl(...)` string to all N particles; `:977-1018` — parses each particle's `particleColor` string to RGBA (including an `hsl(...)` regex match) every frame.

**Why expensive:** same string parsed N times per frame, forever. Pure waste growing with particle count.

**Fix:** cache the RGBA once per frame (or once per param-apply when cycling is off — see P2: full-array color lock loop).

**Validation:** CPU profile delta; fold into the P0-1 hot-loop cleanup A/B.

**Confidence:** high.

---

# P2 — Smaller / conditional

- **Per-pair NaN guards** — `js/ParticleNetwork.js:1493-1503`: `isNaN(particleA.velocity.x)` checks on every processed pair; NaN already guarded in `_updateSoA` (`:1247`). ~2M wasted checks/frame at benchmark scale. Drop.
- **Dead precomputed squared thresholds** — `js/ParticleNetwork.js:877-881`: `interactionDistanceSq`, `lineConnectionDistanceSq`, `maxColorChangeDistanceSq`, `maxOffset` computed per frame, never used. Instead, `interactParticles` recomputes the products per pair (`:1275, :1291, :1293`, including `options.*` property-chain loads). Pass the precomputed squares (or a per-frame context object) through.
- **Full sync frame outside rAF on velocity restart** — `js/ui/applyParams.js:88-90`: when loop stopped (velocity 0) and a change sets non-zero velocity, `pn.update()` runs a complete physics+render frame *inside* the change handler, followed by the P0-3 rebuild in the same handler. Long task on resume input. Replace with `pn._rafActive = true; pn._rafId = requestAnimationFrame(pn.update)`.
- **2D fallback unbatched** — `js/ParticleNetwork.js:160-166`: per-particle `beginPath`+`fillStyle` string assign (parsed on assign)+`globalAlpha`+`arc`+`fill`; `:1332, :1343, :1354, :1363, :1393`: a new `createLinearGradient` native object **per link per frame**; `:1456-1490`: per-link `beginPath`/`stroke`. ~5–11k canvas calls/frame at defaults. A sprite-based renderer already exists (`js/ParticleRenderer.js`, `drawImage` of cached sprites) but is never wired. Fix (only if fallback/trails matters): reuse sprite path, batch links by color bucket into one `beginPath`+`stroke` per bucket, reuse cached gradients. A `cachedGradient2` exists for one branch only (`:1372-1378`).
- **No teardown / destroy()** — `js/ParticleNetwork.js` contains **zero** `removeEventListener` / `cancelAnimationFrame` calls. Listeners: window `resize` `:497-506`, document `contextmenu` `:545-547`, document `keydown` `:658-726`, `keyup` `:729-737`, canvas `:529-543, :549-568, :604-630, :641-656`; rAF `:744-747, :1116-1124`. All are anonymous `.bind(this)` closures retaining the whole instance (particles, SoA, canvases) on window/document forever; the file auto-instantiates at `:1558-1562`, so re-running the script orphans the previous instance, its DOM (`this.k` appended `:288, :316`), its 2D canvas, and its GL context (`loseContext` never called). Add `destroy()`: store handler refs at add-time, remove all listeners, `cancelAnimationFrame`, `clearTimeout(this.m)`, remove DOM, dispose GL buffers/programs + `WEBGL_lose_context`, null arrays; guard constructor against duplicates (`if (window.particleInstance) return`). Also clear `PerformanceMonitor`'s `window.__PN_ACTIVE_MONITOR__` flag + overlay div (`js/PerformanceMonitor.js:24-36`) and `HotkeyManager`'s anonymous window handlers (`js/HotkeyManager.js:142-150` — store bound refs). Validation: heap snapshot after re-running script N times → N retained instances.
- **Unbounded growth** — `js/ParticleNetwork.js:1131-1151`: `adjustParticleCount` does `target = currentCount * 2`, no maximum; wheel handler `:641-656`. `js/ParticleRendererGL.js:106-129`: `ensureCapacity`/`ensurePointCapacity` double `maxLines`/`maxPoints` with no cap; the 262144 cap at `:145-163` only bounds pre-sizing in `beginFrame` and only ever grows. After wheel-down, peak-capacity buffers (potentially hundreds of MB at extreme counts) stay allocated for page lifetime. Cap count (~30k) and shrink buffers when actual usage stays far below capacity for several frames.
- **dt not scaling physics** — `js/ParticleNetwork.js:767-769`: dt computed and clamped to 0.1s, but only drives colors (`dt*60`); physics is per-frame: `x += vx` at `:1234`, speed recovery constant per-frame at `:1231-1233`. On 120/144Hz displays the sim runs 2–2.4x fast, inconsistent with dt-scaled colors. Fix: dt-scale motion + recovery rate (note: changes visible speed on >60Hz — it *fixes* it). Also add `if (document.hidden) return` at the top of `update()` — no `visibilitychange`/`document.hidden` handling exists anywhere; a 1Hz-throttled background tab still runs the full pair loop once per second for nothing.
- **Hotkey duplication** — engine keydown at `js/ParticleNetwork.js:658-726` (arrows, f, a) vs `HotkeyManager.js:142-150` + `index.html:701-721` (c/p/r/d/h/m/b). Both fire per keystroke; conflict surface ('a' gather vs HotkeyManager preventDefault). Consolidate into one listener.
- **Missing `site.webmanifest` 404** — `index.html:13` references `/site.webmanifest`; file doesn't exist in repo. Guaranteed 404 every load. Create it or remove the link.
- **Triplicated config defaults** — `js/Config.js:10-74` (DEFAULT_CONFIG) vs constructor remap with per-key fallbacks `js/ParticleNetwork.js:204-274` vs `index.html:77-149`. The page actually runs the 45-line options literal at `js/ParticleNetwork.js:1511-1555` (`density: "5000"`, `speed: "1"`, custom gradients) which overrides Config.js — so Config.js's values mostly *aren't* what runs. Single source of truth: Config.js, `createConfig(b)` in the constructor, inline module reads `pn.options` without its own default map.
- **36 KB inline module script** — `index.html:56-727` (measured 35,979 bytes — 94% of the 38 KB document; second-largest JS payload on the page). Cannot be cached independently; builds ~50 tweakpane bindings at DOMContentLoaded even though the pane container is `display:none` (`:71`). Externalize to `js/ui/pane.js`, build pane lazily on first toggle.
- **Stale pointer entries on focus loss** — `js/ParticleNetwork.js:574-630`: `_activePointers` Map retains `pointerId → {x,y}` if pointer capture ends without `pointerup`/`leave` (tab switch, gesture cancel) — forces stay applied. Add a window `blur` listener that clears the Map and forces.
- **Per-frame color lock loop when cycling off** — `js/ParticleNetwork.js:771-778`: O(n) loop writing the same color string into every particle object every frame, even though the value never changes. Skip when lock value unchanged, or set once at init/param-apply.
- **Minor timer/DOM leftovers** — `index.html:588-591` `togglePane` 420ms `setTimeout` per toggle (rapid toggles stack out-of-order); `js/ParticleNetwork.js:300-311` `init()` appends `this.k` then returns `false` on invalid background/color, leaving orphan div; `js/ParticleRendererGL.js:48-56` appends canvas before `this.gl = null; return` on WebGL-unavailable → inert canvas in DOM; `:711-717` "HOLD A" toast two `setTimeout`s per engagement.

---

# Skip (verified no-win)

- **WebGL migration** — already done. `ParticleRendererGL.js` draws both lines and points via batched dynamic buffers: exactly **2 `drawArrays` calls per frame** plus one clear (`:212-248`); 2D canvas does only `clearRect` (or fade fill for trails) per frame (`ParticleNetwork.js:788-817`). The bottleneck is CPU work feeding the GPU, not the renderer. The `webgl-black-hole/` demo is a three.js 0.141 project with zero reuse potential — porting adds ~600 KB dependency to replace a 257-line raw-WebGL renderer that already does the job. **Don't.**
- **Worker + OffscreenCanvas** — feasible but not the best payoff path. Coupling evidence: sim reads/writes `this.options` directly; tweakpane UI mutates `pn.options` and calls `_rebuildOnResize`/`initGrid`/`adjustParticleCount` on the instance (`applyParams.js:150-166`, `index.html:232-410`); `update()` calls `window.ColorUtils`, DOM events, draws synchronously from inside the pair loop. A worker needs options mirroring via postMessage, pointer-event forwarding, and ~7MB/s of pair indices at 15k particles (SharedArrayBuffer/transferables). Cost large, risk high (input latency, behavior drift, debug difficulty). Only pays off when sim-bound at sustained 10k+ particles — at the default 414 particles the constraint is per-pair garbage (P0-1), not the main thread. **Defer.**
- **webgl-black-hole/** — not referenced from any HTML/JS/CSS/README; `git ls-files` returns 0 files (entirely untracked, never deployed to Pages; `dist/index.html` is a separate Vercel deployment). Zero cost to the main page. Local hygiene only: 8.6 MB `dist/`, 21 MB `resources/preview-*.mp4`, 57 MB `node_modules/` — watch that the MP4s never get `git add`ed.
- **Full SoA / index-based grid** — physics already runs on Float32 SoA (`_updateSoA`, `ParticleNetwork.js:1180-1250`), but every frame it's copied back to objects (`_syncObjectsFromSoA`, `:1252-1262`), the grid/pair loop/renderer read the objects, and velocities copy back into SoA (`:1100-1109`) — 2 full sync passes/frame, dual storage, hottest loop dereferences AoS objects. Full conversion buys 1.3–2x at high N, cache-friendly access — but the file is a minified 1563-line engine and every feature touches the object fields. Large refactor, high regression risk. **Second wave only** if P0/P1 wins aren't enough and 10k+ particles becomes a goal.

---

# Verified non-issues (checked, no problem)

- **ResizeObserver / matchMedia:** none used anywhere — no leak surface.
- **setInterval:** none; only `setTimeout` (debounce/toast) and rAF.
- **localStorage:** single read at `BenchmarkSystem` construction (`Benchmark.js:15`), one capped write per run (history trimmed to 5, `:325-335`) — no hot-path churn.
- **Growing collections otherwise bounded:** spatial grid + `_touchedCells` reset per frame (`ParticleNetwork.js:845-859`); benchmark `results` reset per run; HotkeyManager `handlers` fixed set of 7.
- **dt clamping:** present and correct (`ParticleNetwork.js:768`, clamp 0.1s); dt used for all time-based effects.
- **2D canvas DPR handling:** correct (transform-based, `:325-328`); resize path debounced 500ms (`:503-504`).
- **Spatial grid cell size:** 120px = `max(interactionDistance=50, lineConnectionDistance=120, maxColorChangeDistance=120, proximityEffectDistance=100)` (`:750-761`) — optimal for line drawing. (Collision/interaction passes reuse the 120px grid — a dedicated ~8px collision grid would be ~1000x fewer candidates when collision is on; conditional, toggle defaults off.)
- **Single instance on the static page:** exactly one `ParticleNetwork` created (`:1559`); duplicate-instance risk is from re-injection/console only.
- **Assets:** all icons ~1 KB each (favicon 15 KB) — negligible; only external assets are the two font stylesheets and tweakpane.

---

# Execution order

1. **P0-1, P0-2** — hot pair loop and resize guard. Core wins, small patches, low risk. P0-3 was rejected after live validation disproved its premise.
2. **P1-5, then P1-4** — pause hidden UI synchronization first; defer the smaller half-neighborhood traversal win.
3. **P1-6 → P1-9** — startup batch: fonts, defer, dead loads, tweakpane lazy-load.
4. **P1-10 + P2 cleanup** — per-frame color cache, NaN guards, dead thresholds, reset path, color lock loop.
5. **Optional:** dt-scaling, destroy(), growth caps, SoA second wave.

Validate each step with Benchmark.js (B) and FPS overlay (P) A/B, plus DevTools Performance/Allocation traces.
