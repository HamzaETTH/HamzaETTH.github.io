# Cinematic Gravity-Well Presets Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Grow the gravity-well catalogue from 96 to 120 genuinely distinctive presets while keeping every particle orbit on-screen, preventing black-hole collapse, and protecting frame rate when a preset compresses particles into a dense band.

**Architecture:** Harden the shared systems before adding recipes. Make preset fitting reserve the complete particle-orbit envelope, not only the rendered well halo. Extend Adaptive Line Detail with an immediate, hysteretic dense-band overload path that reuses the point-only gather renderer without changing physics. Then add four six-preset themed collections using the existing immutable catalogue format, wide/spread placement where appropriate, recommended 60% well force, and Orbit Assist-compatible motion. Gate the batch with geometry, motion, uniqueness, performance, browser, mobile, and visual-review checks.

**Tech Stack:** Vanilla JavaScript, WebGL plus Canvas 2D fallback, typed-array particle runtime, Node.js assertions, Playwright/Edge browser tests.

---

### Task 1: Capture the edge-contact and dense-band regressions

**Files:**
- Modify: `scripts/test-gravity-well-preset-geometry.js`
- Modify: `scripts/test-gravity-well-preset-orbit-size.js`
- Modify: `scripts/test-adaptive-lines.js`

**Step 1: Add a complete orbit-envelope assertion**

For every existing preset, resolve desktop, ultrawide, square, portrait-phone, and landscape-phone layouts at 60%, 100%, and 140% spacing. Expand each black well by the maximum Orbit Assist target radius and each white well by its effective influence envelope. Assert the expanded bounds stay within `usableBounds` with a small numeric tolerance.

Include focused assertions for `binary`, `dipole`, `cross-cage`, `twin-cages`, `six-pockets`, and `diagonal-weave`, since these expose large or edge-adjacent particle bands most clearly.

**Step 2: Add a live boundary-contact audit**

Apply each preset with 1,000 deterministic particles, let its recommended motion evolve, and record the share of samples touching the outer 2% of the usable canvas. Assert no preset continuously pins a visible particle band to an edge. Run both Orbit Assist on and off; keep the existing safe-black-core assertions intact.

**Step 3: Add a catastrophic-density test**

Arrange 1,000 particles into the tight ring/band shown by the reported preset failure. Assert that the first dense frame has bounded pair work, renders every particle, leaves positions and velocities unchanged by the rendering shortcut, and enters/exits overload mode with hysteresis rather than flickering frame-by-frame.

**Step 4: Run the tests to verify they fail**

Run:
- `rtk node scripts/test-gravity-well-preset-geometry.js`
- `rtk node scripts/test-gravity-well-preset-orbit-size.js http://127.0.0.1:8765/`
- `rtk node scripts/test-adaptive-lines.js --url http://127.0.0.1:8765/ --headless`

Expected: the current `1.65x` visual-halo fit is too small for the assisted orbit envelope, and the current FPS-driven controller does not guarantee an immediate point-only path on the first catastrophic dense frame.

### Task 2: Fit presets to particles, not only well artwork

**Files:**
- Modify: `js/GravityWellPresets.js`
- Modify: `js/ParticleNetwork.js`
- Modify: `scripts/test-gravity-well-preset-geometry.js`
- Modify: `scripts/test-mobile-controls.js`

**Step 1: Establish one shared envelope contract**

Expose desktop and touch particle-envelope scales from `GravityWellPresets`. Derive them from the well artwork extent and the maximum Orbit Assist radius instead of copying unrelated magic numbers. The desktop envelope must cover the current `1.65 * 1.70` maximum assisted radius; touch must cover `1.65 * 1.20`. Both must also exceed the pure-physics `1.8x` black-hole safe shell.

**Step 2: Use the envelope during layout solving**

Pass the existing `mobile` viewport flag into `resolve()`. Use the appropriate particle envelope in `fitsAt()`, `wideAxisScale()`, and returned bounds. Preserve one uniform scale for legacy layouts and independent non-contracting axes for `layout: 'wide'`.

Do not change authored strengths, black/white balance, 60% recommended force, individual well APIs, spacing semantics, or rotation semantics.

**Step 3: Make Orbit Assist consume the same contract**

Replace duplicated visual/radius constants in `ParticleNetwork.js` with the catalogue contract when available, retaining safe fallbacks for isolated tests. This prevents future renderer, controller, and layout values from drifting apart.

**Step 4: Verify the geometry and mobile contracts**

Run:
- `rtk node scripts/test-gravity-well-preset-geometry.js`
- `rtk node scripts/test-mobile-controls.js http://127.0.0.1:8765/ --section gestures`
- `rtk node scripts/test-gravity-well-preset-orbit-size.js http://127.0.0.1:8765/`

Expected: all visual and particle envelopes fit, phone wells remain usable rather than microscopic, oversized user-created wells retain their documented best-effort behavior, and desktop particle bands no longer touch the viewport edge.

**Step 5: Commit the envelope fix**

Run:
- `rtk git add js/GravityWellPresets.js js/ParticleNetwork.js scripts/test-gravity-well-preset-geometry.js scripts/test-gravity-well-preset-orbit-size.js scripts/test-mobile-controls.js`
- `rtk git commit -m "fix(presets): keep orbit envelopes on screen"`

### Task 3: Reuse the gather shortcut for catastrophic line density

**Files:**
- Modify: `js/ParticleNetwork.js`
- Modify: `js/ui/pane.js`
- Modify: `scripts/test-adaptive-lines.js`
- Modify: `scripts/benchmark-gather-lines.js`

**Step 1: Separate physics necessity from line necessity**

Extract the existing gathered-state point rendering and optional grid-force traversal into a small shared frame path. It must be callable when either A-gather is active or automatic dense-band overload is active. Particle attraction/repulsion and collision behavior must remain identical; only connection generation may be skipped.

**Step 2: Detect catastrophic bands before pair traversal**

Use the already-built spatial grid and occupied-cell count. Enter overload only when Adaptive Line Detail is enabled and cell occupancy or predicted candidate pairs exceeds a tested hard threshold. Exit at a lower threshold after consecutive safe frames. Do not use the user's currently reported FPS as input to tests, because another live particle tab may be consuming resources.

On ordinary pressure, retain sampled/budgeted lines so the preset shape stays visible. On catastrophic pressure, draw particles and wells but skip connection generation for that frame, matching the proven A-gather optimization. Do not teleport, damp, gather, or otherwise modify particles.

**Step 3: Preserve manual ownership**

If the user unchecks Adaptive Line Detail, immediately disable both its controller and the dense-band shortcut. Reset/reload may restore automatic ownership. Keep Cellular Line Clusters and the performance overlay independent.

**Step 4: Expand diagnostics**

Add explicit diagnostics for overload state, predicted pair work, point-only frames, and hysteresis transitions. Keep existing Full/Balanced/Reduced counters meaningful.

**Step 5: Verify behavior and measured benefit**

Run:
- `rtk node scripts/test-adaptive-lines.js --url http://127.0.0.1:8765/ --headless`
- `rtk node scripts/benchmark-gather-lines.js --baseline http://127.0.0.1:8766/ --optimized http://127.0.0.1:8765/ --counts 1000 --headless`

Acceptance:
- ordinary distributed 1,000-particle frames retain connection lines;
- the synthetic tight band immediately enters bounded or point-only rendering;
- median dense-band frame time falls materially relative to the current path;
- particle positions and velocities match a rendering-disabled control;
- unchecking Adaptive Line Detail disables the shortcut live.

**Step 6: Commit the dense-band safeguard**

Run:
- `rtk git add js/ParticleNetwork.js js/ui/pane.js scripts/test-adaptive-lines.js scripts/benchmark-gather-lines.js`
- `rtk git commit -m "perf(lines): bound catastrophic dense bands"`

### Task 4: Add six Impossible Machines presets

**Files:**
- Modify: `js/GravityWellPresets.js`
- Modify: `scripts/test-gravity-well-preset-geometry.js`

**Step 1: Add exact recipe assertions**

Specify well counts, black/white counts, key coordinates, open-space regions, and intended symmetry for:

1. `mobius-engine` — two interleaved figure-eight black tracks crossing through sparse white gates.
2. `orrery-rupture` — offset orbital systems whose broken rings exchange a diagonal stream.
3. `gyroscope-temple` — three tilted open arcs around a displaced white pivot.
4. `clockwork-nova` — unequal black gear teeth with white exhaust gaps and an open core.
5. `quantum-loom` — three wide woven lanes with white shuttle gates; use wide/spread placement.
6. `tidal-gearbox` — two unequal black wheel clusters coupled through a white clutch.

**Step 2: Implement the six immutable recipes**

Use existing `well`, `ring`, `arc`, and `spiral` helpers. Add a new helper only if at least three recipes use it. Prefer asymmetry, broken arcs, unequal radii, and negative space over another closed regular polygon.

All six use recommended velocity `0.66`, capped acceleration `1.5`, and force multiplier `0.6`. Assign nonzero spin where visible rotation is part of the design; do not classify a preset as a trap merely because it contains white holes.

**Step 3: Run geometry tests and commit**

Run:
- `rtk node scripts/test-gravity-well-preset-geometry.js`
- `rtk git add js/GravityWellPresets.js scripts/test-gravity-well-preset-geometry.js`
- `rtk git commit -m "feat(presets): add impossible machines"`

### Task 5: Add six Living Cosmos presets

**Files:**
- Modify: `js/GravityWellPresets.js`
- Modify: `scripts/test-gravity-well-preset-geometry.js`

**Step 1: Add exact recipe assertions**

Specify the visual silhouette and independent coordinates for:

1. `dragonfly-rift` — four swept wing clusters around a narrow black thorax and white spine.
2. `manta-ray` — a broad black chevron with white wake points and an empty belly.
3. `jellyfish-gate` — an open black bell above uneven white/black tendrils.
4. `serpent-crown` — one asymmetric curling path passing through a broken crown.
5. `phoenix-wake` — raised wing arcs and three separated tail currents; use wide/spread placement.
6. `spider-nebula` — eight deliberately uneven legs around an off-center black body, not a regular radial ring.

**Step 2: Implement and verify the six recipes**

Keep silhouettes legible in the preset preview and at desktop/touch canvas sizes. Avoid overlapping well artwork and preserve broad particle corridors between limbs.

Run:
- `rtk node scripts/test-gravity-well-preset-geometry.js`
- `rtk git add js/GravityWellPresets.js scripts/test-gravity-well-preset-geometry.js`
- `rtk git commit -m "feat(presets): add living cosmos"`

### Task 6: Add six Portals and Monuments presets

**Files:**
- Modify: `js/GravityWellPresets.js`
- Modify: `scripts/test-gravity-well-preset-geometry.js`

**Step 1: Add exact recipe assertions**

Specify and then implement:

1. `cathedral-window` — a pointed black arch, white rose-window guides, and an open nave.
2. `split-horizon` — two broken horizontal event bands joined by a vertical transfer gate.
3. `void-compass` — unequal cardinal singularities with a deliberately false white north.
4. `parallax-gate` — two staggered rectangular portals creating a deep diagonal corridor; use wide/spread placement.
5. `mirrorfall` — mirrored cascades that diverge at the bottom instead of closing into a cage.
6. `infinity-chamber` — offset figure-eight chambers with open exterior escape lanes.

**Step 2: Verify and commit**

Run:
- `rtk node scripts/test-gravity-well-preset-geometry.js`
- `rtk git add js/GravityWellPresets.js scripts/test-gravity-well-preset-geometry.js`
- `rtk git commit -m "feat(presets): add portals and monuments"`

### Task 7: Add six Chaotic Arenas presets

**Files:**
- Modify: `js/GravityWellPresets.js`
- Modify: `scripts/test-gravity-well-preset-geometry.js`

**Step 1: Add exact recipe assertions**

Specify and then implement:

1. `razor-bloom` — skewed black petal blades around a displaced white seed.
2. `thunderhead` — a heavy asymmetric upper storm with an open lower strike field.
3. `shrapnel-halo` — separated arc fragments at unequal radii and phases.
4. `rift-storm` — opposing black fronts throwing particles through offset white tears.
5. `antimatter-orchard` — staggered black trunks and white crowns with wide vertical lanes.
6. `crownless-king` — an open seven-point crown with a missing apex and off-center core.

**Step 2: Verify and commit**

Run:
- `rtk node scripts/test-gravity-well-preset-geometry.js`
- `rtk git add js/GravityWellPresets.js scripts/test-gravity-well-preset-geometry.js`
- `rtk git commit -m "feat(presets): add chaotic arenas"`

### Task 8: Prove the 24 designs are distinct and alive

**Files:**
- Modify: `scripts/test-gravity-well-preset-geometry.js`
- Modify: `scripts/test-gravity-well-presets.js`
- Modify: `scripts/test-gravity-well-preset-orbit-size.js`
- Modify: `scripts/test-gravity-well-preset-physics.js`

**Step 1: Update catalogue invariants**

Assert exactly 120 unique IDs and names, expected family totals, immutable metadata, no duplicate coordinates, no duplicate type/position signatures, at most 18 wells per recipe, and inclusion in the existing Random Preset pool.

Add a normalized distance-signature check so a new recipe cannot be merely a translated, rotated, reflected, or uniformly scaled copy of an existing one.

**Step 2: Add composition checks**

For each new preset, declare its intended composition in the test manifest: symmetry class or intentional asymmetry, required negative-space region, minimum canvas coverage, and number of spatial bands/regions. Reject accidental cages, central pileups, overlapping well art, and layouts that collapse into one small cluster after resolution.

**Step 3: Run real-motion audits**

With deterministic 1,000-particle seeds, test Orbit Assist on and pure physics separately. Require finite state, visible motion, a minimum moving fraction, nontrivial median displacement, low deep-black-core residence, low stationary streaks, no sustained viewport-edge contact, and a visible particle population outside all well artwork.

Explicitly probe white-hole acceleration immediately after preset load so the earlier inactive-until-wheel-edit regression cannot return.

**Step 4: Run the full catalogue checks**

Run:
- `rtk node scripts/test-gravity-well-preset-geometry.js`
- `rtk node scripts/test-gravity-well-presets.js http://127.0.0.1:8765/`
- `rtk node scripts/test-gravity-well-preset-orbit-size.js http://127.0.0.1:8765/`
- `rtk node scripts/test-gravity-well-preset-physics.js http://127.0.0.1:8765/`

Expected: all 120 presets satisfy geometry and motion gates with both black and white forces active.

### Task 9: Verify browser discovery, randomization, and touch behavior

**Files:**
- Modify: `scripts/test-gravity-well-preset-browser.js`
- Modify: `scripts/test-mobile-controls.js`
- Modify only if required by a failing contract: `js/ui/gravityWellPresetBrowser.js`

**Step 1: Test catalogue discovery**

Assert all 24 additions appear in search and family filters, previews remain distinguishable at dialog minimum size, and the footer count reports 120.

**Step 2: Test Random Preset**

Stub randomness deterministically and prove every new ID is reachable. Verify the Orbit Assist checkbox still controls whether the stable controller runs, while Random Preset changes only the preset and preserves the user's current randomization mode.

**Step 3: Test keyboard, resize, and touch**

At desktop, 390×844, 844×390, and 240×480 widths, verify focus order, 44px targets, dialog resizing, previews, and selected-card visibility. Keep reduced-motion transitions and Canvas fallback usable.

**Step 4: Run browser suites**

Run:
- `rtk node scripts/test-gravity-well-preset-browser.js http://127.0.0.1:8765/`
- `rtk node scripts/test-mobile-controls.js http://127.0.0.1:8765/`

### Task 10: Produce an evidence-led visual and performance review

**Files:**
- Create: `scripts/review-gravity-well-preset-showcase.js`
- Modify: `OPTIMIZATION.md`

**Step 1: Generate contact sheets**

Capture all 24 new presets at 1440×900 and representative selections at 390×844, each after the same deterministic warm-up. Produce Orbit Assist on/off pairs for `mobius-engine`, `dragonfly-rift`, `cathedral-window`, and `rift-storm`.

**Step 2: Review against explicit visual criteria**

Reject or revise any preset that:
- reads as a minor variation of an existing recipe;
- hides most particles inside well artwork;
- produces a tiny, nearly stationary orbit;
- becomes a closed cage when the design calls for flow;
- touches canvas edges under default spacing;
- loses its silhouette at preview size;
- enters dense-band overload for most of its steady-state run.

**Step 3: Benchmark without the user's live tab contaminating evidence**

Run isolated headless trials for representative sparse, ordinary, dense, and catastrophic presets at 1,000 particles. Record median frame time, 95th percentile, candidate connections, emitted segments, and point-only frame share. Do not infer performance from the user's concurrently running page.

**Step 4: Update the optimization ledger**

Document measured before/after results, any rejected recipes, and whether dense-band protection changed visual output. Distinguish measurement from qualitative review.

### Task 11: Run the regression matrix

**Files:**
- Modify only if a regression is found in an already-touched file.

Run:
- `rtk node scripts/test-gravity-wells.js --url http://127.0.0.1:8765/`
- `rtk node scripts/test-physics-reset.js http://127.0.0.1:8765/`
- `rtk node scripts/test-density-aware-force-sliders.js http://127.0.0.1:8765/`
- `rtk node scripts/test-startup-gravity-well.js --url http://127.0.0.1:8765/`
- `rtk node scripts/test-startup-lifecycle.js --url http://127.0.0.1:8765/ --expect-deferred --expect-lazy`
- `rtk node scripts/test-visibility-lifecycle.js --url http://127.0.0.1:8765/ --expect optimized`
- `rtk node scripts/test-destroy-lifecycle.js --url http://127.0.0.1:8765/ --expect optimized`
- `rtk node scripts/test-adaptive-lines.js --url http://127.0.0.1:8765/ --headless`

Expected: presets, white-hole forces, pure physics, Orbit Assist, Reset Physics, density-aware controls, mobile, fallback, lifecycle, and Adaptive Line Detail all pass.

### Task 12: Publish the scoped preset expansion

**Files:**
- Stage only files changed by Tasks 1–11.

**Step 1: Validate syntax and diff hygiene**

Run:
- `rtk git diff --check`
- `rtk node --check js/GravityWellPresets.js`
- `rtk node --check js/ParticleNetwork.js`
- `rtk node --check js/ui/pane.js`
- `rtk node --check scripts/review-gravity-well-preset-showcase.js`

**Step 2: Commit the final review artifacts**

Run:
- `rtk git add OPTIMIZATION.md scripts/review-gravity-well-preset-showcase.js scripts/test-gravity-well-preset-browser.js`
- `rtk git commit -m "test(presets): verify cinematic showcase"`

**Step 3: Push and verify delivery**

Run:
- `rtk git push origin master`
- `rtk git fetch origin master`
- `rtk git rev-parse HEAD`
- `rtk git rev-parse origin/master`
- `rtk git status --short`

Expected: local `HEAD` equals `origin/master`, the worktree is clean, and the deployed catalogue exposes 120 presets.
