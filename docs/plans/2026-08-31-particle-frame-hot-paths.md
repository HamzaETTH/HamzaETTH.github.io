# Particle Frame Hot Paths Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task.

**Goal:** Improve high-count particle FPS by computing particle colors once per frame, then by removing repeated threshold multiplication and NaN validation from the particle-pair loop.

**Architecture:** Implement and benchmark the two optimizations independently so each gain is attributable. The first change creates one frame-level CSS color and one reusable RGBA buffer used by both WebGL and the 2D/trails fallback. The second snapshots interaction distances once per frame, passes those cached values into pair processing, and validates velocities once per particle after interactions instead of once per pair.

**Tech Stack:** Browser JavaScript, raw WebGL, Canvas 2D fallback, Playwright-controlled Microsoft Edge, Node.js, CodeGraph, and `scripts/benchmark-particle-network.js`.

---

## Scope and acceptance rules

- Start from commit `e18889b` (`perf: pause hidden UI synchronization`).
- Exclude the unrelated `webgl-black-hole/` checkout from worktrees, diffs, tests, and commits.
- Prefix every shell command with `rtk`.
- Preserve the existing benchmark's default `static` and `cyclingGradient` profiles so old results remain comparable.
- Add no public application API. Frame caches may remain private properties on `particleInstance` for browser-test inspection.
- Preserve WebGL, Canvas 2D/trails, static colors, cycling colors, opacity, attraction, repulsion, distance coloring, line gradients, pointer effects, and stopped-animation behavior.
- Run each optimization against its own immediately preceding checkpoint. Do not benchmark both changes as one combined delta.
- Keep an optimization only when deterministic checks pass, browser/WebGL smoke checks pass, and no focused three-trial median confirms an average-FPS regression over 5% at an uncapped count.
- Append evidence to `OPTIMIZATION.md`; do not edit or replace prior benchmark results.
- Do not run the full 60-measurement matrix by default. Use the focused high-count matrices specified below.

### Task 1: Add particle-color instrumentation and an opt-in benchmark profile

**Files:**

- Create: `scripts/test-particle-frame-color.js`
- Modify: `scripts/benchmark-particle-network.js:18-21,23-59,106-134,206-299`
- Modify: `OPTIMIZATION.md:295-305,351-357`

**Step 1: Mark P1-10 in progress**

Change P1-10 to **IN PROGRESS**, record baseline commit `e18889b`, and state that the adjacent P2 static color-lock loop is included because both loops feed the same rendered particle color. Do not change previous evidence.

**Step 2: Add an opt-in particle-cycling benchmark profile**

Extend `PROFILES` with:

```javascript
particleCycling: {
  particleColorCycling: true,
  lineColorCycling: false,
  gradientEffect: false
}
```

Add `particleColorCycling: false` explicitly to the two existing profiles. Add `--profiles <list>` parsing and validation, but keep the default profile list exactly `static,cyclingGradient`. In `runOne()`, apply `profile.particleColorCycling` instead of the current hard-coded `false`.

Verify help text explains that `--profiles static,particleCycling` is the focused color benchmark and that omitting the option preserves historical behavior.

**Step 3: Build the browser color regression**

In `scripts/test-particle-frame-color.js`, accept one URL and `--expect-optimized`. Launch Edge at 1280x720 and DPR 1, collect console/page errors, reduce the live fixture to a small known particle count, and test these cases after parameter application has settled:

1. Static `#123456` at opacity `0.4` renders every WebGL point as `[0x12/255, 0x34/255, 0x56/255, 0.4]`.
2. Short static `#888` renders every point as `[0x88/255, 0x88/255, 0x88/255, opacity]`.
3. Cycling at hue `120` with cycling speed `0` renders green `[0, 1, 0, opacity]`.
4. During each sampled WebGL frame, all `addPoint` calls receive the same RGBA object reference.
5. Redefine each particle's `particleColor` with a counting setter after setup; five settled static frames and five cycling frames cause zero property writes in the optimized build.
6. With trails enabled, wrap each particle's `h()` method and assert it receives the correct static or cycling CSS frame color.
7. Restore the original particle count/options and confirm rAF state, WebGL context, and canvases recover with no errors.

Without `--expect-optimized`, print the write count and unique color-reference count without enforcing the new structural limits. With it, enforce all limits and exit nonzero on failure.

**Step 4: Characterize the baseline**

Run:

```powershell
rtk node scripts/test-particle-frame-color.js http://127.0.0.1:8123/
rtk node scripts/test-particle-frame-color.js http://127.0.0.1:8123/ --expect-optimized
```

Expected: the characterization run preserves rendered colors; the optimized-expectation run fails because the baseline writes `particleColor` N times and allocates/parses one RGBA array per WebGL point.

**Step 5: Commit the measurement checkpoint**

```powershell
rtk git add scripts/test-particle-frame-color.js scripts/benchmark-particle-network.js OPTIMIZATION.md
rtk git commit -m "test: measure particle color hot path"
```

Record the resulting commit as the isolated color baseline.

### Task 2: Compute particle color once per frame

**Files:**

- Modify: `js/ParticleNetwork.js:42-69,219-225,825-900,1028-1086`

**Step 1: Make the existing hex helper correct for short colors**

Update `hexToRgb01()` to expand `#rgb` to `#rrggbb` before `parseInt`. Retain its existing invalid-value fallback. This is required because shipped/default particle colors include three-digit hex values.

**Step 2: Add one private frame-color preparation helper**

Add `prepareFrameParticleColor(network, dt)` beside `prepareFrameLineColors()`. It must:

- Lazily allocate `network._frameParticleColor = new Float32Array(4)` once.
- When cycling is enabled, advance `options.particleHue` once, create one `hsl(...)` CSS string, and call `hslToRgb01()` once.
- When cycling is disabled, retain `options.particleColor` as the CSS frame color and call `hexToRgb01()` once.
- Apply `options.opacity` to the RGBA alpha every frame.
- Store the CSS value in `network._frameParticleCssColor` for Canvas 2D/trails rendering.

Do not cache across frames: opacity and UI parameters may change between frames, while same-frame values cannot change during the synchronous frame loop.

**Step 3: Remove both full-array color-write loops**

Delete the static lock loop at the start of `update()` and the cycling loop before grid construction. Call `prepareFrameParticleColor(this, dt)` once after `beginFrame()` and before particle rendering.

**Step 4: Reuse the prepared values in both renderers**

Replace the per-particle hex/HSL/RGB parsing block with:

```javascript
this.glRenderer.addPoint(
  particleA.x,
  particleA.y,
  this._frameParticleColor,
  particleA.size || options.particleSize
);
```

Change `c.prototype.h` to accept an optional frame CSS color and render with `frameColor || this.particleColor`. Call `particleA.h(this._frameParticleCssColor)` in the 2D/trails branch. Do not write the frame color back to every particle.

**Step 5: Run syntax and deterministic checks**

```powershell
rtk node --check js/ParticleNetwork.js
rtk node scripts/test-particle-frame-color.js http://127.0.0.1:8124/ --expect-optimized
```

Expected: all seven color contracts pass, zero settled property writes, one RGBA reference per frame, and no browser errors or lost context.

### Task 3: Benchmark and decide P1-10

**Files:**

- Modify: `OPTIMIZATION.md` P1-10 section, execution order, and ledger

**Step 1: Create isolated A/B worktrees**

Create a detached baseline worktree from the Task 1 checkpoint and an optimized worktree from the current tree. Serve them on ports 8123 and 8124. Verify the only runtime application difference is `js/ParticleNetwork.js`; benchmark scripts and documentation may differ only as part of the measurement checkpoint.

**Step 2: Run the quick regression gate**

```powershell
rtk node scripts/benchmark-particle-network.js --baseline http://127.0.0.1:8123/ --optimized http://127.0.0.1:8124/ --quick --profiles static,particleCycling --headless --output <temp-path>\p1-10-quick.json
```

Expected: exact particle counts, WebGL active, restoration pass, no errors, and no obvious regression.

**Step 3: Run the focused reportable matrix**

```powershell
rtk node scripts/benchmark-particle-network.js --baseline http://127.0.0.1:8123/ --optimized http://127.0.0.1:8124/ --counts 5000,10000,15000 --trials 3 --profiles static,particleCycling --headless --output <temp-path>\p1-10-focused.json
```

Keep the change when the deterministic work removal is proven, the aggregate high-count median improves, and no confirmed regression violates the acceptance rule. If any quick average regresses by more than 5%, repeat only that count/profile for three trials and reject only when the median remains over 5% lower and at least two trials regress.

**Step 4: Document and commit**

Append baseline/optimized commits, environment, deterministic counts, all focused medians, duration, smoke evidence, regressions, and keep/reject decision to `OPTIMIZATION.md`. Mark P1-10 **COMPLETE** only if all gates pass.

```powershell
rtk codegraph sync .
rtk git add js/ParticleNetwork.js OPTIMIZATION.md
rtk git commit -m "perf: cache particle frame colors"
```

Remove temporary worktrees and raw artifacts only after their evidence is recorded.

### Task 4: Add pair-loop instrumentation and equivalence coverage

**Files:**

- Create: `scripts/test-pair-hot-path.js`
- Modify: `OPTIMIZATION.md:309-324,351-357`

**Step 1: Give the pair cleanup its own tracked status**

Mark the combined per-pair NaN/threshold cleanup **IN PROGRESS** and record the Task 3 commit as its baseline. Keep P1-4 separate: this task does not change grid traversal or which particle pairs are visited.

**Step 2: Build a deterministic alternating A/B harness**

Make `scripts/test-pair-hot-path.js` accept `--baseline`, `--optimized`, `--trials`, and `--headless`. Run both variants in one Edge context. For each variant:

- Stop continuous animation, set a fixed small particle fixture with stable positions, velocities, sizes, and indices, and run exactly one manual frame.
- Cover pairs below and above interaction, line, and maximum-color distances.
- Run separate no-force, repulsion, and attraction scenarios.
- Capture resulting velocities plus WebGL line positions/colors and compare baseline/optimized values within a small floating-point epsilon.
- Wrap `pn.options` in a Proxy that counts reads of `particleInteractionDistance`, `lineConnectionDistance`, and `maxColorChangeDistance` during the frame.
- Wrap `window.isNaN` to count calls during the frame.
- Run an invalid-force scenario that creates non-finite interaction velocities and assert every particle velocity is finite at frame end.
- Restore every wrapped global/property and the original application settings even when an assertion fails.

Acceptance: optimized threshold-option reads are constant per frame rather than proportional to candidate pairs; optimized `isNaN` calls are bounded by the existing SoA particle validation rather than pair count; visual buffers and finite-scenario velocities match baseline; invalid velocities are reset by frame end.

**Step 3: Prove the new structural test fails on two baseline copies**

```powershell
rtk node scripts/test-pair-hot-path.js --baseline http://127.0.0.1:8123/ --optimized http://127.0.0.1:8123/ --trials 1 --headless
```

Expected: behavior-equivalence checks pass, but the optimized-work assertions fail because threshold reads and NaN calls have not been reduced.

**Step 4: Commit the pair measurement checkpoint**

```powershell
rtk git add scripts/test-pair-hot-path.js OPTIMIZATION.md
rtk git commit -m "test: measure particle pair hot path"
```

Record this commit as the isolated baseline for Task 5.

### Task 5: Cache pair thresholds and validate velocities once

**Files:**

- Modify: `js/ParticleNetwork.js:227-251,940-944,1089-1113,1165-1175,1332-1368,1544-1554`

**Step 1: Prepare a reusable per-frame threshold context**

Replace the currently dead squared-distance locals with a lazily allocated private object such as `this._frameInteractionThresholds`. Update these six fields once before pair traversal:

```javascript
thresholds.interactionDistance = options.particleInteractionDistance;
thresholds.interactionDistanceSq = thresholds.interactionDistance * thresholds.interactionDistance;
thresholds.lineDistance = options.lineConnectionDistance;
thresholds.lineDistanceSq = thresholds.lineDistance * thresholds.lineDistance;
thresholds.maxColorDistance = options.maxColorChangeDistance;
thresholds.maxColorDistanceSq = thresholds.maxColorDistance * thresholds.maxColorDistance;
```

Delete the unused `maxOffset`. Passing a stable reused object avoids a new allocation per frame and avoids changing public state.

**Step 2: Thread the frame context through pair processing**

Pass the threshold object to both same-cell and neighboring-cell `interactParticles()` calls. Inside `interactParticles()`, use the cached squared values for comparisons and cached unsquared values for force, alpha, and color-factor calculations. Pass the cached interaction square into `applyParticleInteraction()` so it does not multiply the same threshold again.

Do not alter loop order, index guards, grid offsets, distance formulas, force formulas, or rendering branches.

**Step 3: Move NaN recovery out of the pair function**

Delete both velocity guards at the end of `interactParticles()`. Extend the existing post-interaction velocity persistence loop to validate each object velocity once before copying it into SoA:

```javascript
var vx = Number.isFinite(vpo.velocity.x) ? vpo.velocity.x : 0;
var vy = Number.isFinite(vpo.velocity.y) ? vpo.velocity.y : 0;
vpo.velocity.x = vx;
vpo.velocity.y = vy;
```

Validate all entries in `particles`, including the interactive pointer if present; copy only the first `numParticles` entries into `velX`/`velY`. This retains end-of-frame recovery without allowing validation cost to grow with pair count.

**Step 4: Run syntax and deterministic A/B checks**

```powershell
rtk node --check js/ParticleNetwork.js
rtk node scripts/test-pair-hot-path.js --baseline http://127.0.0.1:8123/ --optimized http://127.0.0.1:8124/ --trials 3 --headless
```

Expected: equivalent line buffers and finite-scenario velocities, finite invalid-force recovery, constant threshold reads, pair-proportional NaN calls removed, no console/page errors, and no lost WebGL context.

### Task 6: Benchmark and decide the pair-loop cleanup

**Files:**

- Modify: `OPTIMIZATION.md` pair-cleanup section, execution order, and ledger

**Step 1: Verify A/B isolation**

Serve the Task 4 checkpoint as baseline and the current implementation as optimized. Confirm that the only runtime application difference is the Task 5 hunk in `js/ParticleNetwork.js`.

**Step 2: Run quick and focused FPS gates**

```powershell
rtk node scripts/benchmark-particle-network.js --baseline http://127.0.0.1:8123/ --optimized http://127.0.0.1:8124/ --quick --profiles static,cyclingGradient --headless --output <temp-path>\pair-hot-path-quick.json
rtk node scripts/benchmark-particle-network.js --baseline http://127.0.0.1:8123/ --optimized http://127.0.0.1:8124/ --counts 5000,10000,15000 --trials 3 --profiles static,cyclingGradient --headless --output <temp-path>\pair-hot-path-focused.json
```

Apply the same focused-confirmation rule for any greater-than-5% quick regression. Do not claim a gain from one-trial quick results; use the focused medians.

**Step 3: Run final smoke and visual checks**

Run the existing smoke-only path and save one optimized screenshot. Visually inspect particles, static/cycling colors, lines, and controls. Exercise attraction and repulsion briefly with the browser visible.

```powershell
rtk node scripts/benchmark-particle-network.js --baseline http://127.0.0.1:8123/ --optimized http://127.0.0.1:8124/ --smoke-only --headless --screenshot <temp-path>\pair-hot-path.png
```

**Step 4: Document, sync, and commit**

Append the A/B commit hashes, environment, getter/NaN counts, equivalence results, focused FPS medians, duration, smoke evidence, and keep/reject decision. Mark the pair cleanup **COMPLETE** only if every deterministic condition passes and no confirmed FPS regression remains.

```powershell
rtk codegraph sync .
rtk git add js/ParticleNetwork.js OPTIMIZATION.md
rtk git commit -m "perf: cache particle pair thresholds"
rtk git status --short --branch
```

Expected final status: branch ahead by the new commits, with only the unrelated `webgl-black-hole/` checkout untracked. Remove temporary worktrees and raw JSON/screenshots after the ledger contains their results. Leave P1-4 as the next lower-risk FPS candidate; do not start it in this plan.

---

## Stop/go checkpoints

1. Stop if the color harness cannot prove identical WebGL and 2D/trails colors; revise the frame-color design before benchmarking.
2. Benchmark and decide the color optimization before creating the pair baseline.
3. Stop if pair outputs differ beyond floating-point tolerance; cached thresholds must not change pair selection or formulas.
4. Do not remove end-of-frame velocity validation merely to improve a benchmark.
5. Complete the plan only after both decisions, including rejected decisions, are recorded append-only in `OPTIMIZATION.md`.
