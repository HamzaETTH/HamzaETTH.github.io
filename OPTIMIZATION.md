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
| 4 | P1-4 — duplicate neighbor scan | **PENDING** | Rationale corrected after index-guard review | Isolate after lifecycle work; deterministic pair-set equivalence then full A/B |
| 5 | P1-5 — permanent UI-sync rAF | **COMPLETE** | Five-trial UI instrumentation and quick FPS gate below | Keep |
| 6 | P1-10 — per-particle color work | **COMPLETE** | Deterministic color-path test plus focused three-trial A/B matrix below | Keep |
| 7 | P2-1 — repeated pair thresholds | **REJECTED** | Deterministic win, but focused FPS gate confirmed a regression | Production change removed |
| 8 | P2-2 — per-pair velocity validation | **REJECTED** | Deterministic win, but focused FPS gate confirmed a regression | Production change removed |
| 9 | P1-6 — unused Inter load | **COMPLETE** | Deterministic two-to-one font stylesheet request result below | Keep |
| 10 | Missing `site.webmanifest` | **COMPLETE** | Explicit HTTP/JSON gate and full startup smoke below | Keep |
| 11 | P1-9 — dead startup loads/code | **COMPLETE** | Three accepted subchanges and two documented benchmark rejections below | Keep accepted tree `5f52b88` |
| 12 | P1-7 — deferred classic scripts | **COMPLETE** | Deterministic ready-state/lifecycle and quick FPS gates below | Keep |
| 13 | P1-8 + lazy-build settings UI | **COMPLETE** | Lifecycle, blocked-CDN, UI-sync, deterministic color, and quick FPS gates below | Keep |
| 14 | Pause simulation while hidden | **COMPLETE** | Deterministic visibility lifecycle plus focused five-trial 10k gate below | Keep `b47c8f1` |
| 15 | Proper `destroy()` / teardown | **COMPLETE** | Two destroy/recreate cycles, pending-build abort, resource release, UI-sync, and FPS gates below | Keep `5da077d` |
| 16 | Configuration cleanup | **COMPLETE** | Exact configuration contract, lifecycle suite, pair equivalence, and focused FPS confirmation below | Keep `9e51979` |
| 17 | Full SoA/index architecture | **DEFERRED** | Start only after the requested cumulative milestone | Re-profile and write a staged plan |

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

**Status:** COMPLETE.

**Baseline:** `e2b6218` (`test: capture startup load baseline`), recorded 2026-09-01. Its application code matches plan checkpoint `c19f747`; the tracked tree was otherwise clean, and the unrelated untracked `webgl-black-hole/` directory remains excluded.

**Locations:** `css/style.css:1` — `@import url(https://fonts.googleapis.com/css?family=Inter:400,500,600,700,800&display=swap)`; separate Fira Code link at `index.html:15`.

**Why expensive:** `@import` inside the main stylesheet creates a serial render-blocking chain (HTML → style.css → fonts.googleapis.com). Inter — 5 weights, 5 font files — is **never used**: the entire CSS and body use `"Fira code"` (`style.css:16`, `HotkeyManager.js:203`). Two separate Google Fonts CSS requests instead of one; no `preconnect` to fonts.gstatic.com means font file downloads start late.

**Fix:** delete the Inter `@import` entirely; keep the single Fira Code `<link>`; add `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`.

**Validation:** network waterfall shows two fonts.googleapis.com CSS requests before, one after; Lighthouse render-blocking resources audit.

**Confidence:** high (Inter usage verified absent by full CSS read).

### Startup baseline — 2026-09-01

**Method:** `scripts/test-startup-loads.js` launched Microsoft Edge 152.0.4191.53 headlessly at 1280×720 and DPR 1 against the unchanged local site. It captured response/resource entries, console/page errors, explicit manifest fetch results, the live particle/WebGL state, and a real `C`-hotkey settings-pane open. Timing values are diagnostic only; request counts and response status are the deterministic gates for this startup batch.

**Result:** the page requested two Google Fonts stylesheets: Fira Code plus the unused Inter family. The local startup path loaded ten scripts, including `ParticleRenderer.js` and `Benchmark.js`, and transferred 165,563 encoded local resource bytes under the uncompressed local server. The particle network was active with 185 particles, WebGL was present and not lost, the settings pane opened with populated controls, and `BenchmarkSystem` was already loaded. The explicit `/site.webmanifest` fetch returned HTTP 404 with HTML rather than JSON; that missing resource produced the only console error. There were no request failures or page errors.

**Decision:** keep the harness as the startup regression gate. Remove only the unused Inter request for P1-6, then fix the manifest and dead loads in their own commits.

### Validation results — 2026-09-01

**Change:** removed the unused Inter `@import` from `css/style.css` and added a cross-origin preconnect for the retained Fira Code font files. No font-family declarations or shipped font weights changed.

**Deterministic result:** the startup probe's Google Fonts stylesheet count fell from two to one, and the Inter URL disappeared. The local stylesheet body fell by 94 bytes. The page remained active at the shipped 185-particle state, WebGL was present and not lost, `BenchmarkSystem` remained available, and the `C` hotkey opened a populated settings pane. There were no request failures or page errors. The known manifest 404 remained the only console error and is deliberately isolated as the next change.

**Timing note:** single-load DOMContentLoaded moved from 420.4 ms to 410.6 ms, but one networked trial is not treated as a performance claim. P1-6 is accepted from the deterministic removal of an unused serial CSS/font request chain plus the unchanged runtime smoke.

**Conclusion:** keep P1-6 and mark it complete.

## P1-7. Startup: parser-blocking scripts + parse-time engine init

**Status:** COMPLETE.

**Application baseline:** `f2146c5` (`docs: plan deferred settings cycle`), recorded 2026-09-01. The tracked tree was otherwise clean, with the unrelated untracked `webgl-black-hole/` directory excluded.

**Exact P1-7 baseline:** `92cb342` (`test: capture startup lifecycle baseline`). This adds only the lifecycle probe and baseline ledger entry to the same application tree.

**Locations:**
- `index.html:48-55` — 8 classic scripts (~136 KB unminified total), no `defer`/`async`
- `js/ParticleNetwork.js:1557-1562` — `new ParticleNetwork(canvasDiv, options)` is **top-level code**, running during script evaluation

**Why expensive:** the parser stops at each `<script src>`, downloads, and executes serially. `ParticleNetwork.js` (69 KB) runs its *entire* synchronous init mid-queue — `init()` at `:285` creates the container div, constructs PerformanceMonitor, creates the 2D canvas, creates the WebGL context + compiles 2 shader programs (`:403-414`), registers ~10 event listeners, allocates the particle array (`viewportArea/density`; density `"5000"` at `:1511-1555` → ~210 particles at 1366×768, ~830 at 2560×1440), allocates SoA typed arrays, and starts the rAF loop — all before `Benchmark.js` and `HotkeyManager.js` even parse. Blocks DOMContentLoaded and the first animation frame.

**Fix:** add `defer` to all 8 script tags (order is preserved; `offsetWidth` reads then hit settled layout — actually *improves* init); and/or move the `new ParticleNetwork` call into the module's DOMContentLoaded handler or `requestIdleCallback`.

**Validation:** Performance trace "Evaluate Script" blocks; FCP/DCL delta before/after.

**Confidence:** high.

### Lifecycle baseline — 2026-09-01

**Method:** `scripts/test-startup-lifecycle.js` launched Edge 152.0.4191.53 headlessly at 1280×720/DPR 1, instrumented the `window.particleInstance` assignment before page code, inspected all classic script attributes, recorded navigation timings, and exercised the real C hotkey.

**Result:** all eight classic scripts had `defer=false`/`async=false`, and the engine instance was assigned while `document.readyState` was `loading`. In this diagnostic load the instance appeared at 281.5 ms and DOMContentLoaded ended at 412.5 ms. The hidden pane was already built with controls and Tweakpane had already been requested; first C only revealed it in 19.0 ms. All seven hotkeys were registered, the shipped 185-particle loop and WebGL were healthy, and there were no browser errors. Timing values are single-load diagnostics; script attributes, ready state, request/build state, and runtime health are the deterministic gates.

### Validation results — 2026-09-01

**Change:** added ordered `defer` attributes to all eight classic scripts. Their source order and the engine's top-level constructor remain unchanged.

**Deterministic result:** all eight scripts reported `defer=true`/`async=false`, and `window.particleInstance` moved from `document.readyState="loading"` to `"interactive"`, proving the engine now starts after parsing. The shipped 185-particle loop, WebGL context, all seven hotkeys, pre-existing settings pane, manifest, and settings restoration remained healthy with zero browser errors. Request counts and bodies were unchanged.

**Timing note:** the paired diagnostic load's DOMContentLoaded value moved from 412.5 ms to 341.0 ms (−17.3%), while engine assignment moved from 281.5 ms to 299.1 ms because execution now waits for parsing. One networked load is not a reportable speed claim; the deterministic scheduling change is the accepted result.

**Quick FPS gate:** no uncapped average row regressed beyond 5%. Static changed +28.4% at 5,000 and +10.3% at low-sample 15,000; cycling/gradient changed −3.7% and +13.7%. Refresh-capped 1,500 averages were unchanged/−0.7%; isolated minimum variation did not affect the gate.

**Conclusion:** keep P1-7 and mark it complete.

## P1-8. Startup: tweakpane CDN gates DOMContentLoaded

**Status:** COMPLETE.

**Baseline:** `1385205` (`perf: defer ordered startup scripts`), recorded 2026-09-01. Its lifecycle probe shows Tweakpane requested and one fully populated hidden pane built before first C; all seven hotkeys are registered only inside that Tweakpane-dependent module path. The tracked tree was otherwise clean, excluding untracked `webgl-black-hole/`.

**Location:** `index.html:57` — `import {Pane} from 'https://cdn.jsdelivr.net/npm/tweakpane@4.0.5/dist/tweakpane.min.js'` (measured: 152,084 bytes, ~0.26s on a good connection).

**Why expensive:** the single largest JS payload on the page — larger than all local JS combined. Because it's a static import of a deferred module, DOMContentLoaded is delayed until the import graph resolves — so the whole pane build (`index.html:231`) and hotkey registration (`:701`) wait on cross-origin DNS+TCP+TLS+download. If the CDN is down or blocked, the page silently loses the controls pane and all hotkeys (the animation still runs).

**Change:** extracted the inline settings module to cacheable `js/ui/pane.js`, replaced the static cross-origin import with one shared dynamic-import/build promise, and installed lightweight bootstrap hotkeys at DOMContentLoaded. C builds and shows the pane on first use; R/D/M build it before their pane-dependent actions; P/H/B remain immediately usable without Tweakpane. Repeated C actions reuse one pane. The full settings code and `applyParams()` contract are otherwise unchanged.

The HTML body changed from 35,847 bytes to 2,625 bytes and the extracted local module is 32,295 bytes under the uncompressed server (34,920 combined, 927 bytes smaller before transfer overhead). More importantly, initial startup makes no Tweakpane request and creates no `#tp-container`; the 152,084-byte CDN dependency and all control construction move behind the first pane-dependent action. One observed first C build took 146.8 ms and produced one populated visible pane.

**Deterministic lifecycle gate:** all seven hotkeys were available before pane construction; the shipped 185-particle loop and WebGL context were healthy; first C loaded Tweakpane and built the controls; two further open/close cycles retained exactly one hidden pane and one CDN request. With the CDN explicitly blocked, initial startup still registered all hotkeys, created no pane, made no Tweakpane request, and kept the engine/WebGL healthy. The startup, color contract, and particle-frame-color probes reported no console/page/request errors; settings restoration returned all 185 values.

**P1-5 interaction gate:** five focused alternating trials retained the intended state machine in both trees: hidden/running had 159 median rAF callbacks and zero binding refreshes; visible/running had 159 callbacks and 20 refreshes; both stopped states had zero callbacks/refreshes; every visible catch-up check passed. Visible refresh work changed from 9.0 ms to 8.6 ms median. No browser errors occurred, so lazy construction did not reintroduce permanent hidden-pane polling.

**Quick FPS gate:** no uncapped average row regressed beyond 5%. At 5,000 particles, static changed -3.82% and cycling/gradient -0.42%; refresh-capped 1,500 averages changed +0.03%/-1.39%. The very low-sample 15,000 rows improved and are not treated as claimed gains. WebGL stayed healthy, the loop remained active, and settings restored exactly.

**Decision:** keep P1-8 and the lazy-built settings UI. It removes the guaranteed cross-origin startup gate while preserving startup hotkeys, settings behavior, P1-5 refresh semantics, and the performance gate.

## Pause simulation while the document is hidden

**Status:** COMPLETE.

**Application baseline:** `efd8d1f` (`perf: lazy-build settings controls`). **Exact implementation baseline:** `95f1593` (`test: capture hidden loop baseline`), which adds only `scripts/test-visibility-lifecycle.js` on top of the Cycle 3 plan/checkpoint. The tracked tree was otherwise clean apart from excluded untracked `webgl-black-hole/`.

**Baseline method and result:** the headless Edge lifecycle probe overrides the document visibility properties, dispatches the real `visibilitychange` event, and counts calls through the live bound update chain. A visible/running 250 ms sample ran 36 frames. The hidden/running sample still ran 37 frames with `_rafActive=true` and an rAF id. After a stopped velocity was changed back to non-zero while hidden, the synchronous restart plus queued loop ran 23 frames in 150 ms and its first `dt` hit the 0.1 s clamp. A zero-velocity hide/show round trip correctly remained stopped. The shipped 185-particle state and WebGL context stayed healthy with no browser errors.

**Required change:** one stored visibility handler must cancel and clear the active frame while hidden, remember only valid running intent, reset the timebase on visible resume, and schedule at most one frame chain. Direct restart attempts while hidden must record resume intent without simulating a frame. A loop stopped by zero velocity must remain stopped across hide/show.

**Accepted change:** `b47c8f1` (`perf: pause hidden simulation`) installs the stored visibility lifecycle from the already-loaded bootstrap module and teaches the parameter-application restart path to defer while hidden. Hide cancels the queued frame and records running intent; show resets `_lastUpdateTime` and schedules only when that intent and non-zero velocity agree. Keeping this lifecycle outside `ParticleNetwork.js` leaves the visible per-frame engine byte-for-byte unchanged.

**Deterministic result:** over 250 ms, visible/running produced 36 frames, hidden/running produced zero with `_rafActive=false` and no rAF id, and visible resume produced one normal 36-37-frame chain. Repeated visible events did not duplicate it. The first resumed `dt` was 0-6.8 ms rather than the baseline's 100 ms clamp. A zero-velocity hide/show remained stopped with zero frames. Applying non-zero velocity while hidden also produced zero hidden frames, then resumed one chain on show. The 185-particle scene and WebGL context stayed healthy with no browser errors.

**Rejected internal placement:** the first candidate put a `document.hidden` guard directly at the top of `ParticleNetwork.update()`. It passed lifecycle and exact pair/color checks, but its required focused three-trial 10k/15k cycling test measured the 15k median average -10.33%. Removing the per-frame check and retaining only constructor/event handling still produced a five-trial 10k regression (static -5.40%, cycling/gradient -9.02%). Both engine-file variants were discarded, not hidden from the record.

**Final performance gate:** the event-driven implementation's quick gate crossed only the one-frame cycling/gradient 15k row (-9.24%), so the prescribed five-trial alternating 10k confirmation was run for both profiles. Static median average changed from 6.52 to 6.95 FPS (+6.45%) and median minimum from 5.85 to 6.18 (+5.50%). Cycling/gradient median average changed from 6.07 to 6.66 (+9.78%) and minimum from 5.80 to 5.82 (+0.35%). These noisy confirmation values are not claimed gains; they show the repeatable regression disappeared. Every run reached 10,000 particles with active rAF, healthy WebGL, exact settings restoration, and no browser errors.

**Cumulative smoke:** startup retained all seven bootstrap hotkeys, deferred scripts, no initial Tweakpane request/pane, exactly one pane after repeated C toggles, and a healthy active engine. The deterministic particle-frame-color contract passed all static/cycling/trail checks and restored all 185 settings values.

**Decision:** keep the event-driven implementation. It eliminates all tested hidden simulation frames and resume jumps without adding work to the visible frame loop or changing stopped/running semantics.

## Proper `destroy()` / teardown

**Status:** COMPLETE.

**Application baseline:** `3bbe80c` (`docs: complete hidden simulation cycle`). **Exact test checkpoint:** `8dd8c84` (`test: capture teardown leak baseline`) on top of the Cycle 4 plan. The tracked tree was otherwise clean apart from excluded untracked `webgl-black-hole/`.

**Current ownership audit:** a live engine owns one window resize listener; document contextmenu/keydown/keyup listeners; ten canvas mouse/pointer/wheel listeners; one rAF chain; resize and gather timeouts; a container plus 2D canvas; the GL renderer canvas, two programs, five buffers, and staging arrays; particle/grid/SoA storage; and a performance monitor. The hotkey singleton owns window keydown/keyup listeners plus guide/toast DOM/timeouts. The settings bootstrap owns its DOMContentLoaded and document visibility listeners, pane sync/toggle timers, lazy Tweakpane instance/container, hotkey closures/context, and benchmark runner global. None currently has a `destroy()` contract.

**Baseline reproduction:** after building then hiding the real pane, the test created a second engine in a temporary target. Active tracked listeners increased from 699 to 712 (the 13 engine listeners duplicated) and active rAF chains from one to two. Detaching the target changed neither count. The detached 47-particle engine remained rAF-active, retained both disconnected canvases and a healthy—not released—WebGL context. Engine, renderer, monitor, hotkey manager, integrated destroy, and integrated create APIs were all absent. No browser error occurred.

**Gate:** implement idempotent leaf-to-root cleanup and prove two integrated create-destroy cycles followed by one healthy live instance, with stale callbacks silent, old rAF/timers/listeners released, old GL contexts intentionally lost, old DOM/globals removed, one final owner for each singleton/resource, settings/hotkeys/visibility behavior preserved, and no visible performance regression.

**Accepted change:** `5da077d` (`feat: add particle lifecycle teardown`) adds leaf `destroy()` contracts for the GL renderer, performance monitor, hotkey manager, and benchmark runner; generation-safe pane disposal; and integrated `destroyParticleExperience()` / `createParticleExperience()` APIs. `ParticleLifecycle.js` captures the engine's existing anonymous listeners and any timeouts they create without rewriting the simulation hot path, then installs the engine teardown externally. The factory also restores the particle container's original fixed positioning before recreation, avoiding the zero-height second-instance failure found during development.

The accepted tree adds one 4,788-byte deferred local lifecycle script plus disposal code in the existing owners. This is an intentional startup/resource tradeoff, not claimed as a load-path optimization. The lifecycle startup probe now expects nine ordered classic scripts; all remain deferred, and Tweakpane remains absent from initial startup.

**Rejected internal design:** the first implementation rewrote all 13 engine listener registrations and placed the 65-line destroy method inside `ParticleNetwork.js`. The quick gate triggered at cycling/gradient 5,000 (-6.15%). Three alternating confirmation trials then measured 5,000 at +4.20%, but 10,000 median average FPS at -20.98% and minimum at -40.34%; every 10,000 candidate average was lower. That design was discarded. The accepted external owner leaves the complete simulation/update implementation unchanged and changes only the file's final construction/factory hook.

**Repeated lifecycle result:** two consecutive integrated destroy calls were each followed by recreation, then a third live instance was retained. Every destroyed engine was idempotently marked destroyed, had zero queued rAF ids, zero stale post-destroy frames, zero tracked timeouts, zero app-owned window/document listeners, disconnected DOM, cleared pointer/force state, nulled particle/grid/SoA storage, cleared singleton globals, and an intentionally lost old WebGL context. Help/performance/gather timers were active before teardown and still cleared. The final instance had 185 particles, one active rAF chain, one engine container, two canvases, one performance overlay, seven unique hotkeys, and a fresh non-lost WebGL context.

**Async/UI/benchmark result:** destroying during simultaneous lazy-pane import and a running benchmark left no pane, benchmark overlay, canvas, active monitor, hotkey manager, or particle global after one second; the delayed import did not resurrect UI. A subsequent normal recreation lazily built exactly one populated pane. Tweakpane's detached-node listeners remain visible only inside the test's deliberately retaining listener registry; all app-owned global listeners are removed, the pane is disposed and detached, and no production reference remains. No browser/page error occurred.

**Correctness and interaction gates:** startup/lazy-pane lifecycle, hidden simulation pause/resume, P0-2 resize, deterministic frame-color/settings restoration, and three alternating pair-equivalence trials all passed. Pair positions, velocities, GL line values, threshold reads, and validation counts matched exactly. The five-trial P1-5 instrumentation also passed: hidden/running and both stopped states performed zero binding refreshes; visible/running retained 20 refreshes; all five immediate catch-up checks passed; visible refresh work changed from 8.5 to 8.8 ms median with no errors.

**Final performance gate:** the accepted external-owner quick run had no uncapped average regression beyond 5%. At 5,000 particles, static changed +3.22% and cycling/gradient +0.60%; refresh-capped 1,500 changed +12.38%/+0.70% because the baseline static sample contained a large startup hitch. Low-sample 15,000 rows were positive. These diagnostic numbers are not claimed gains; the result is that the prior repeatable regression disappeared while settings restored, rAF stayed active, and WebGL remained healthy.

**Decision:** keep the external lifecycle architecture and mark teardown complete. It provides deterministic, repeatable leaf-to-root release without changing the simulation hot path that failed the focused benchmark.

## Configuration cleanup

**Status:** COMPLETE.

**Application baseline:** `4d024f9` (`docs: complete lifecycle teardown cycle`). **Exact test checkpoint:** `11afb23` (`test: capture configuration contract`) on top of the Cycle 5 plan. The tracked tree was otherwise clean apart from excluded untracked `webgl-black-hole/`.

**Baseline contract:** `scripts/test-config-contract.js` fixes the page's random source before scripts load and records ordered key/value/type entries rather than relying on numeric-looking equality. It captures the 35-key public `DEFAULT_CONFIG`, all five presets, four `createConfig()` merge/falsy cases, the shipped raw input, the shipped 48-key runtime options object, and four constructor cases covering defaults, shipped inputs, zeros/false/string types, null fallbacks, clamps, and ignored unknown keys. Baseline-to-baseline snapshots matched exactly; both retained 185 particles, healthy WebGL, and zero browser errors.

**Required change:** Config.js should own the existing runtime assembly contract while leaving its public defaults, presets, and merge behavior unchanged. `ParticleNetwork.js` may delegate construction, but it must retain exact runtime property order, fallback operators, string density behavior, velocity mapping, clamps, randomized method selection, and unknown-key filtering. A cleaner-looking but type-different result is a failure.

**Exact implementation baseline:** `1cb241f` (`docs: record configuration baseline`). **Accepted implementation:** `9e51979` (`refactor: centralize runtime configuration`). `Config.js` now owns `createRuntimeConfig()`, while the engine constructor delegates only the assembly step. The existing public 35-key defaults, five presets, `createConfig()` merge behavior, all fallback operators, property order, string density, velocity mapping, clamps, random-method fallback, and unknown-key filtering are unchanged. Across `Config.js` and `ParticleNetwork.js`, the served source fell from 74,850 to 73,729 bytes (-1,121 bytes); this is recorded as code consolidation, not a performance claim.

**Deterministic result:** the fixed-PRNG configuration contract matched the exact baseline for every ordered key, value, and JavaScript type across public defaults, presets, four merge/falsy cases, the shipped raw input, the shipped 48-key runtime object, and four direct-constructor cases. Both trees retained 185 particles, healthy WebGL, and zero browser errors. Three alternating pair trials also matched positions, velocities, every captured GL line value, threshold reads, and validation counts exactly.

**Lifecycle and rendering result:** deferred/lazy startup passed with Tweakpane blocked and no startup request for it; all seven hotkeys, the running loop, and WebGL remained healthy. Hidden pause/resume and stopped-state behavior passed. Two destroy/recreate cycles plus the pending-pane/benchmark abort case left no stale instances or resources. The deterministic frame-color/settings test, P0-2 resize test, settings restoration, context-health checks, and console/page-error gates all passed.

**Performance gate:** the quick 12-measurement diagnostic changed static average FPS by +0.05%, +30.94%, and -27.39% at 1,500/5,000/15,000 particles, and cycling/gradient by -0.72%, +6.65%, and -0.16%. The contradictory low-sample 15,000 result triggered the established 10,000-particle confirmation. Five alternating trials measured static +1.05% average and -1.34% minimum; cycling/gradient measured +6.02% average and +0.06% minimum, narrowly crossing the 5% threshold amid high trial variance. A second seven-trial cycling-only confirmation measured -0.18% average and +2.52% minimum. Both focused runs restored settings, retained active rAF and healthy WebGL, and reported no browser errors.

**Decision:** keep `9e51979` and mark configuration cleanup complete. Exact shipped behavior is preserved, the runtime assembly contract now has one owner, and the marginal first focused signal did not reproduce in the larger confirmation.

## P1-9. Dead loads: ~30 KB waste + dead code

**Status:** IN PROGRESS.

**P1-9a baseline:** `537df2b` (`fix: add site web manifest`), recorded 2026-09-01. A tracked-reference check across the deployed HTML, alternate HTML, CSS, `js/`, and `scripts/` found only the `index.html` load of `ParticleRenderer.js`; `ParticleCore.js` and `ParticlePhysics.js` had no consumers, and the live engine refers only to the distinct `ParticleNetworkRendererGL` global. The tracked tree was clean apart from the excluded untracked `webgl-black-hole/` directory.

| Item | Location | Detail | Fix |
|---|---|---|---|
| `ParticleRenderer.js` loaded, never used | `index.html:51`; 10.5 KB; exports `window.ParticleNetworkRenderer` at `:310` | Only consumer is `ParticleCore.js:116`, itself never loaded. ~100% unused bytes | **REJECTED:** removal crossed the focused FPS gate; keep load/file |
| `Benchmark.js` ships to all visitors | `index.html:54`; 16 KB | Dev-only; used solely by 'b' hotkey (`index.html:688-697`) which lazily constructs `BenchmarkSystem` | **REJECTED:** lazy import crossed the focused 15k FPS gate |
| Dead `buildDefaultParams()` | `index.html:151-225` | Defined, never called (~2.5 KB); third copy of the default-parameter map | Delete |
| Unused imports | `index.html:58` | `normalizeHex`, `toCssColor` never used | Trim import to `rgbArrayToHex, randInt, rand01, randBool, randHex` |
| `ColorUtils.js` duplicated first half | `js/ColorUtils.js:7-102` vs `:104-347` | Both top-level function declarations; hoisting makes the second copy (the superset, adds `rgbToLab`, `deltaE`, `contrastRatio`) win; first block ~5 KB dead | Delete lines 1-102 |
| Dead velocity-persist loops | `js/ParticleNetwork.js:416-439` | Two byte-identical loops copying `this.o[i].velocity` into `this.velX/velY`; guard `if (this.velX && this.velY && Array.isArray(this.o))` is always false at that point (`this.o` created `:509`, `velX` at `:517`) | Delete both blocks |
| Orphaned engine files | `js/ParticleCore.js` (18.8 KB), `js/ParticlePhysics.js` (11.6 KB) | Referenced by no HTML or JS anywhere (verified index.html, grid.html, full-repo search); features reimplemented inside `ParticleNetwork.js` | **REJECTED with P1-9a:** combined cleanup reverted after FPS gate |

**Validation:** DevTools Coverage tab.

**Confidence:** high for all rows.

### P1-9a rejected experiment — orphaned modules and renderer load, 2026-09-01

**Candidate:** remove the deployed `ParticleRenderer.js` script tag and delete the unreferenced `ParticleRenderer.js`, `ParticleCore.js`, and `ParticlePhysics.js` files. The candidate startup probe reduced local script requests from ten to nine and encoded local resource bytes from 165,469 to 155,014 (−10,455 bytes). Particle/WebGL/settings/manifest smoke checks passed with no browser errors.

**Quick gate:** the 12-measurement diagnostic was highly variable and crossed the 5% confirmation threshold at static 5,000 (−10.2%) and cycling/gradient 15,000 (−6.6%), while other uncapped rows ranged from +12.5% to +167.6%.

**Focused result:** a three-trial alternating 5,000/15,000 matrix remained contradictory. Static 5,000 improved 6.5% and cycling 5,000 changed −0.6%, but static 15,000 changed −25.6% and cycling 15,000 changed −8.9%. The 15,000 measurements sampled very few frames, so a five-trial alternating 10,000-particle confirmation was run: static median average FPS changed from 6.69 to 6.34 (−5.24%) and cycling/gradient from 6.11 to 6.08 (−0.54%). Static minimum changed −3.4%; cycling minimum changed −3.8%.

**Decision:** reject and fully revert P1-9a because the higher-sample static confirmation still crossed the predeclared 5% average-FPS rejection rule. The source-reference evidence remains valid, but measured behavior takes precedence. No application, README, or file-removal change from this experiment is retained.

### P1-9b — dead inline settings defaults and imports

**Baseline:** `8ccded5` (`docs: record rejected renderer cleanup`), recorded 2026-09-01. Current-reference checks found `buildDefaultParams()` only at its definition and found the inline module's `normalizeHex` and `toCssColor` names only in its import list. The separate `applyParams.js` import of `toCssColor` is live and remains untouched.

**Change and deterministic result:** removed the uncalled 75-line default map and trimmed only the two unused inline imports. The served HTML body fell from 39,876 to 35,845 bytes (−4,031 bytes). Reference checks found no remaining `buildDefaultParams` definition or old import shape. The startup probe retained ten local script loads, one font stylesheet, an active 185-particle loop, healthy WebGL, eager benchmark availability, a populated settings pane, a valid manifest, and zero browser errors.

**Quick FPS gate:** one alternating trial at 1,500/5,000/15,000 particles showed no uncapped average-FPS regression beyond 5%. Static changed −2.6% at 5,000 and +140.8% at the low-sample 15,000 row; cycling/gradient changed +3.7% and +18.1%. Refresh-capped 1,500 averages were effectively unchanged. The large 15,000 swings are treated as diagnostic noise, not claimed gains.

**Decision:** keep P1-9b. It removes a verified-unreachable configuration copy without changing runtime behavior or crossing the quick regression gate.

### P1-9c — duplicated ColorUtils declaration block

**Baseline:** `c57852d` (`perf: remove dead inline settings defaults`), recorded 2026-09-01. `ColorUtils.js` declares the same global function and `var` names twice. Classic-script global `var` assignment makes the second, larger `ColorUtils` object the shipped `window.ColorUtils`; a live snapshot confirmed its LAB/WCAG methods are present and the first block's `interpolateRgb` helper is absent. This subchange must preserve the exact exported keys, enum, and deterministic method results.

**Change and deterministic result:** removed the first 102-line declaration/export block and added `scripts/test-color-utils-contract.js`. Against the exact baseline and candidate, the test matched all 11 exported keys, all six `ColorDiffMethod` values, deterministic results for converters and every differentiation method, the shipped 185-particle count, and WebGL health. Both variants had zero console/page errors. The served `ColorUtils.js` body fell from 11,220 to 7,190 bytes (−4,030 bytes).

**Performance gate:** the quick diagnostic's static 5,000 row showed a −23.0% outlier and triggered focused confirmation. Three alternating static 5,000 trials did not reproduce it: median average FPS changed from 26.34 to 28.23 (+7.18%) and minimum from 20.04 to 23.26 (+16.05%). The startup and benchmark smokes restored settings, retained the active loop and healthy WebGL, and reported no browser errors.

**Decision:** keep P1-9c. Exact contract equivalence passed and the required focused gate rejected the quick-run regression signal.

### P1-9d — unreachable velocity-persist loops

**Baseline:** `165425c` (`perf: remove duplicate color utilities`), recorded 2026-09-01. Both constructor loops are guarded by `this.velX && this.velY && Array.isArray(this.o)` before `this.o` or the SoA arrays are initialized, so neither can execute. The live per-frame object-to-SoA velocity persistence later in `update()` remains out of scope and must stay unchanged.

**Change and deterministic result:** removed both unreachable constructor loops and extended `scripts/test-pair-hot-path.js` with a generic equivalence mode. Three alternating trials matched finite-scenario positions, velocities, every captured WebGL line value, threshold-read counts, and `isNaN` counts exactly. WebGL stayed healthy and no browser error occurred. The served `ParticleNetwork.js` body fell by 998 bytes.

**Quick FPS gate:** no uncapped average row regressed by more than 5%. Static changed +0.2% at 5,000 and +20.9% at low-sample 15,000; cycling/gradient changed −2.4% and +17.1%. The refresh-capped 1,500 average changes were below 1.5%; its minimum variation was an isolated load hitch and not a gate failure.

**Decision:** keep P1-9d. The removed branches were provably unreachable, deterministic pair behavior is identical, and the quick gate passed.

### P1-9e — lazy benchmark loading

**Baseline:** `5f52b88` (`perf: remove unreachable velocity syncs`), recorded 2026-09-01. `Benchmark.js` is an eager classic script used only by the B hotkey and automated validation. The baseline startup probe reports `BenchmarkSystem` present before interaction and a 16,167-byte local `Benchmark.js` body on every page load. The B handler, main benchmark runner, pair-path test, and particle-color test are the complete current consumer set.

**Candidate and functional result:** removed the eager script, dynamically imported it from the async B handler, and made all three automated consumers import it explicitly. A dedicated hotkey test proved the optimized page made no initial request and exposed no initial global, then made exactly one request, created one runner, and invoked it once on B without changing particle count or WebGL health. The real particle-color test and startup smoke passed with zero browser errors; the initial local script count fell from ten to nine and 16,167 encoded bytes left the initial load path.

**Performance result:** the quick diagnostic triggered confirmation because cycling/gradient at 15,000 changed −12.9%. A focused three-trial cycling/gradient run then measured 10,000 improving from 6.23 to 7.05 average FPS (+13.05%), but 15,000 regressing from 2.63 to 2.28 (−13.33%); minimum changed −14.87%. All three paired 15,000 trials were lower for the candidate.

**Decision:** reject and fully revert P1-9e. The functional lazy-load behavior and 16 KB startup reduction were real, but the repeatable 15,000-particle regression crossed the stated gate. The eager script and original automated-runner bootstrap remain shipped.

### P1-9 cumulative result — 2026-09-01

**Accepted commits:** `c57852d` removed the dead inline default map/imports, `165425c` removed the duplicate ColorUtils declaration block with an exact contract test, and `5f52b88` removed unreachable constructor velocity-sync loops with deterministic pair equivalence. P1-9a renderer/orphan removal and P1-9e lazy benchmark loading were both fully reverted after their focused gates confirmed regressions.

**Cumulative startup comparison:** against exact pre-P1-9 application baseline `537df2b`, the accepted tree reduced the served HTML body from 39,876 to 35,847 bytes and the local resource-entry bodies from 167,008 to 161,098 bytes under the uncompressed local server. Request counts intentionally remain ten local scripts and one font stylesheet because both request-removal experiments were rejected. Both variants retained the shipped 185-particle state, healthy WebGL, populated settings pane, valid manifest, eager benchmark availability, and zero browser errors. Network timings were dominated by a roughly three-second CDN response in this pass and are not used as a speed claim.

**Cumulative correctness:** ColorUtils keys, enum values, and deterministic results were exact across the baseline/accepted trees. Three alternating pair-path trials matched positions, velocities, rendered line data, option-read counts, and validation counts exactly with healthy WebGL and no errors.

**Cumulative quick FPS gate:** no uncapped average row regressed. At 5,000 particles, static changed +17.4% and cycling/gradient +3.3%; at the low-sample 15,000 rows they changed +174.4% and +9.6%. Refresh-capped 1,500 averages changed −0.7%/−1.8%; isolated minimum hitches are not treated as a performance claim. These are diagnostic gate results, not attributed gains from dead-code deletion.

**Conclusion:** mark P1-9 complete with the accepted dead-code reductions retained and both failed request-removal experiments preserved as rejected evidence.

## Missing `site.webmanifest`

**Status:** COMPLETE.

**Baseline:** `88ea324` (`perf: remove unused Inter font load`), recorded 2026-09-01. The tracked tree was clean apart from the excluded untracked `webgl-black-hole/` directory.

**Baseline evidence:** `index.html` references `/site.webmanifest`, but no tracked file exists. The startup probe's explicit fetch returned HTTP 404, `text/html`, and an HTML error page that failed JSON parsing; this was the only browser console error. Existing Android icons are tracked at 192×192 and 256×256, so the fix can describe already-shipped assets without creating or transforming images.

**Gate:** require HTTP 200, valid manifest JSON, the expected name/colors/icon paths, no request/console/page error, and an unchanged particle/WebGL/settings smoke.

### Validation results — 2026-09-01

**Change:** added a 416-byte `site.webmanifest` describing the existing Hamza E site, black theme/background, standalone display, root scope/start URL, and the already-tracked 192×192 and 256×256 Android icons. No icon was regenerated or relabeled as maskable.

**Result:** the explicit fetch changed from HTTP 404 `text/html` with a JSON parse failure to HTTP 200 `application/manifest+json` with the expected parsed fields. The prior console 404 disappeared; there were zero console errors, page errors, or request failures. The shipped 185-particle runtime remained active, WebGL was present and not lost, and the `C` hotkey still opened a populated settings pane.

**Conclusion:** keep the manifest and mark the missing-resource finding complete.

## P1-10 — COMPLETE. Per-particle color string parsing every frame

**Baseline:** `e18889b` (`perf: pause hidden UI synchronization`), recorded 2026-08-31. This experiment also includes the adjacent P2 per-frame static color-lock loop because both loops feed the same rendered particle color and can be removed by one frame-level cache.

**Locations:** `js/ParticleNetwork.js:828-835` — when cycling is on, writes the *identical* `hsl(...)` string to all N particles; `:977-1018` — parses each particle's `particleColor` string to RGBA (including an `hsl(...)` regex match) every frame.

**Why expensive:** same string parsed N times per frame, forever. Pure waste growing with particle count.

**Fix:** cache the RGBA once per frame (or once per param-apply when cycling is off — see P2: full-array color lock loop).

**Validation:** CPU profile delta; fold into the P0-1 hot-loop cleanup A/B.

**Confidence:** high.

### Benchmark results — 2026-08-31

**Environment:** Windows 10 Pro 22H2, AMD Ryzen 7 5800X3D, 32 GB RAM, NVIDIA GeForce RTX 5080, Microsoft Edge 152.0.4191.53, and ANGLE D3D11 WebGL. Playwright launched Edge headlessly at 1280×720 and DPR 1. The baseline was instrumentation checkpoint `8442cfd`; the optimized application differed only in `js/ParticleNetwork.js`.

**Deterministic behavior:** a 32-particle WebGL/Canvas fixture sampled static `#123456`, short `#888`, and cycling hue 120. Baseline made 160 `particleColor` writes in five settled static frames and another 160 in five cycling frames, passed 32 distinct RGBA arrays per WebGL frame, supplied no shared frame color to the trails path, and decoded `#888` incorrectly. Optimized made zero particle-property writes, passed one reusable RGBA buffer per frame, decoded `#888` as equal RGB channels, and supplied `#123456` / `hsl(120, 100%, 50%)` to every Canvas 2D particle. Both static and cycling rendered RGBA values matched within floating-point tolerance; restoration, rAF, and WebGL checks passed with no console or page errors.

**Quick diagnostic (one trial; not a reportable performance claim):**

| Profile | Particles | Baseline avg | Optimized avg | Change |
|---|---:|---:|---:|---:|
| Static | 1,500 | 144.08 | 144.09 | +0.0% |
| Static | 5,000 | 26.10 | 24.58 | -5.8% |
| Static | 15,000 | 2.80 | 2.81 | +0.4% |
| Particle cycling | 1,500 | 144.05 | 142.00 | -1.4% |
| Particle cycling | 5,000 | 22.30 | 24.02 | +7.7% |
| Particle cycling | 15,000 | 2.78 | 2.65 | -4.5% |

**Focused high-count matrix:** three alternating trials per variant at each count. Values are medians; "minimum" is minimum instantaneous FPS, not a 1% low.

| Profile | Particles | Baseline avg | Baseline minimum | Optimized avg | Optimized minimum | Avg change | Minimum change |
|---|---:|---:|---:|---:|---:|---:|---:|
| Static | 5,000 | 25.20 | 15.58 | 24.24 | 17.89 | -3.8% | +14.8% |
| Static | 10,000 | 5.32 | 3.89 | 5.76 | 5.77 | +8.3% | +48.5% |
| Static | 15,000 | 1.97 | 1.97 | 2.57 | 2.54 | +30.4% | +29.0% |
| Particle cycling | 5,000 | 21.48 | 17.79 | 21.49 | 17.61 | +0.1% | -1.1% |
| Particle cycling | 10,000 | 5.34 | 4.96 | 5.30 | 5.20 | -0.7% | +4.8% |
| Particle cycling | 15,000 | 2.52 | 2.46 | 2.67 | 2.72 | +5.7% | +10.6% |

**Duration:** quick diagnostic 0:28; focused matrix 2:10.

**Conclusion:** keep P1-10. The quick static 5,000-particle regression exceeded 5%, but its required focused three-trial median was only 3.8% lower, so it did not confirm the rejection condition. All deterministic work-removal and renderer behavior checks passed, four high-count average-FPS medians improved, and neither of the two lower medians exceeded the 5% regression gate.

## P2-1 — REJECTED. Cache repeated particle-pair thresholds

**Baseline:** `ae34186` (`perf: cache particle frame colors`), recorded 2026-08-31.

The frame loop already computes squared interaction, line-connection, and maximum-color distances, but `interactParticles()` ignores them and repeats the option reads and multiplications for every candidate pair. The experiment will reuse one private threshold object per network, update its six numeric fields once per frame, and pass it through the existing pair path without changing traversal, pair selection, comparison operators, force formulas, or rendering branches.

**Deterministic gate:** `scripts/test-pair-hot-path.js` runs alternating baseline/optimized fixtures for no force, repulsion, attraction, and invalid force. It compares object positions and velocities plus every WebGL `addLine()` value, while a Proxy counts the three threshold option reads and a wrapped global `isNaN` counts velocity checks. The threshold build must reduce each tracked option to one read per frame and preserve finite-scenario output within floating-point tolerance.

### Benchmark results — 2026-08-31

**Method:** baseline `58bad1f` was served from a detached worktree and the candidate differed only in `js/ParticleNetwork.js`. Microsoft Edge 152.0.4191.53 ran headlessly at 1280×720, DPR 1, using ANGLE D3D11 on an NVIDIA GeForce RTX 5080. The focused matrix used three alternating trials per variant at 5,000, 10,000, and 15,000 particles under the static and cycling/gradient profiles.

**Deterministic result:** across no-force, repulsion, and attraction frames, tracked threshold reads fell from 358 to 9: each optimized threshold was read once per frame instead of once per candidate/connected pair. Positions, velocities, and all WebGL line values matched within tolerance in three alternating trials. Invalid-force recovery, WebGL health, and browser-error checks passed. Pair-scaled `isNaN` calls were intentionally unchanged at this stage.

| Profile | Particles | Baseline avg | Optimized avg | Avg change |
|---|---:|---:|---:|---:|
| Static | 5,000 | 25.79 | 25.68 | -0.4% |
| Static | 10,000 | 6.07 | 6.09 | +0.5% |
| Static | 15,000 | 2.60 | 3.01 | +15.8% |
| Cycling/gradient | 5,000 | 25.57 | 25.36 | -0.8% |
| Cycling/gradient | 10,000 | 6.40 | 6.03 | -5.8% |
| Cycling/gradient | 15,000 | 2.49 | 2.78 | +11.7% |

**Duration and smoke:** quick diagnostic 0:27 plus smoke; focused matrix 2:08 plus smoke. Every measurement reached its requested count with rAF and WebGL active. Settings restored to the shipped 185-particle state, the context remained healthy, and there were no console or page errors.

**Conclusion:** reject P2-1 and remove its production change. Although the structural work removal was exact and the median change across the six rows was non-negative, cycling/gradient at 10,000 particles regressed by 5.8%, with two of three paired trials lower. That meets the predeclared rejection rule, so threshold caching is not included in the final build.

## P2-2 — REJECTED. Validate velocities once after particle interactions

**Baseline:** `58bad1f` (`test: measure particle pair hot path`). P2-1 was rejected, so this experiment starts from the unchanged particle engine. Valid finite-input behavior must remain equivalent; invalid object and SoA velocities must be finite by frame end, including an interactive pointer outside the SoA buffers.

### Benchmark results — 2026-08-31

**Method:** the same isolated baseline, Edge environment, viewport, profiles, particle counts, and alternating three-trial procedure as P2-1 were used. The candidate differed only in `js/ParticleNetwork.js`: four pair-tail `isNaN` calls were removed and one linear post-interaction validation pass covered every particle object while copying regular-particle velocities to SoA.

**Deterministic result:** across the three finite scenarios, global `isNaN` calls fell from 132 to 48, leaving only the existing two checks per regular particle in `_updateSoA`. Positions, velocities, and every WebGL line value matched in three alternating trials. An injected NaN force was repaired in both object and SoA storage, and the optimized pass additionally repaired an invalid interactive pointer excluded from SoA. WebGL and browser-error checks passed.

| Profile | Particles | Baseline avg | Optimized avg | Avg change |
|---|---:|---:|---:|---:|
| Static | 5,000 | 26.06 | 28.62 | +9.8% |
| Static | 10,000 | 7.04 | 6.82 | -3.2% |
| Static | 15,000 | 3.05 | 2.80 | -8.1% |
| Cycling/gradient | 5,000 | 27.81 | 27.12 | -2.5% |
| Cycling/gradient | 10,000 | 6.97 | 7.13 | +2.2% |
| Cycling/gradient | 15,000 | 2.89 | 3.06 | +5.7% |

**Duration and smoke:** quick diagnostic 0:27 plus smoke; focused matrix 2:08 plus smoke. Every measurement reached its requested count with rAF and WebGL active. Settings restored to 185 particles, the context remained healthy, and no console or page errors occurred.

**Conclusion:** reject P2-2 and remove its production change. Static at 15,000 particles regressed by 8.1%, with two of three paired trials lower, which meets the rejection rule. The structural improvement and stronger non-finite recovery are real, but they do not justify a confirmed high-count FPS regression.

## Cumulative optimized-engine benchmark — 2026-08-31

**Comparison:** the baseline was detached commit `6bb19b8` with only the documented P0-1 application-code hunks reversed, recreating the pre-P0-1 particle engine while retaining its compatible profiling controls. The optimized variant was `a846ec5`, whose runtime application code matches accepted optimization commit `ae34186`; both P2 experiments above were removed. This comparison therefore includes the accepted P0-1 pair-loop cleanup, P0-2 WebGL resize guard, P1-5 hidden-pane synchronization pause, and P1-10 frame particle-color cache without mixing in unrelated pre-`6bb19b8` UI changes.

**Method:** Edge 152.0.4191.53 ran headlessly at 1280×720 and DPR 1 using ANGLE D3D11 on an NVIDIA GeForce RTX 5080. The reportable matrix used three alternating trials per variant at 5,000, 10,000, and 15,000 particles under static, cycling/gradient, and particle-cycling profiles. Values are medians.

| Profile | Particles | Original avg | Optimized avg | Total gain |
|---|---:|---:|---:|---:|
| Static | 5,000 | 17.11 | 26.29 | +53.7% |
| Static | 10,000 | 4.26 | 6.93 | +62.6% |
| Static | 15,000 | 1.83 | 3.04 | +66.7% |
| Cycling/gradient | 5,000 | 15.99 | 26.55 | +66.0% |
| Cycling/gradient | 10,000 | 4.00 | 6.74 | +68.2% |
| Cycling/gradient | 15,000 | 1.56 | 2.94 | +89.3% |
| Particle cycling | 5,000 | 16.82 | 27.03 | +60.7% |
| Particle cycling | 10,000 | 4.10 | 6.96 | +70.0% |
| Particle cycling | 15,000 | 1.81 | 2.92 | +61.4% |

**Duration and smoke:** the cumulative quick diagnostic completed 18 measurements in 0:43; the reportable matrix completed 54 measurements in 3:20, followed by the restoration smoke. All 72 measurements reached the requested particle count with rAF active, WebGL available, and no context loss or browser errors. At the shipped 185-particle state, the page remained refresh-rate capped; the settings pane opened with the `C` hotkey, displayed current runtime values, and a 1280×720 visual inspection showed intact particles, gradient lines, controls, and canvas coverage.

**Overall conclusion:** the accepted optimization series improves median high-count average FPS by 53.7% to 89.3% across every tested workload. The ordinary shipped scene is already display-refresh capped, so its benefit is lower CPU/background overhead and more headroom rather than a visible FPS-number increase. P1-4 remains the next candidate, but it is expected to be smaller because it removes duplicate traversal and index comparisons rather than distance calculations.

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
4. **P1-10 COMPLETE** — per-frame particle color cache plus the adjacent static color-lock loop.
5. **P2-1, then P2-2** — dead pair thresholds and per-pair velocity validation, each measured against its immediately preceding checkpoint.
6. **Optional:** dt-scaling, destroy(), growth caps, SoA second wave.

Validate each step with Benchmark.js (B) and FPS overlay (P) A/B, plus DevTools Performance/Allocation traces.
