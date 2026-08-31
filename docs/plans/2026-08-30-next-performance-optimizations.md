# Particle Network Next Performance Optimizations Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve particle-network performance through four isolated, measurable changes while keeping `OPTIMIZATION.md` as the permanent progress and benchmark ledger.

**Architecture:** Execute one optimization at a time in priority order: P0-2, P0-3, P1-4, then P1-5. For each item, create baseline and optimized copies from the exact same current tree, change only the named optimization, run a correctness-specific test plus the appropriate automated A/B benchmark, and append the result before continuing. Never combine items in one benchmark because attribution matters more than speed of implementation.

**Tech Stack:** Browser JavaScript, WebGL canvas, Tweakpane UI, Node.js, Playwright-controlled Microsoft Edge, CodeGraph, `scripts/benchmark-particle-network.js`.

---

## Non-negotiable benchmark workflow

- Exclude the unrelated nested `webgl-black-hole` repository from every copy, diff, test, and commit.
- Preserve unrelated working-tree changes. Do not reset the main checkout.
- Prefix every shell command with `rtk`.
- Before each item, update its ledger row in `OPTIMIZATION.md` to **IN PROGRESS** and record `rtk git rev-parse --short HEAD`.
- Run `--quick` first. Run the full 60-measurement matrix only when the quick gate and correctness checks pass.
- Keep the existing full-run controls: two profiles, five particle counts, 500 ms warmup, 2/2/2/2/3-second windows, three alternating trials, same Edge context, 1280×720 viewport, DPR 1.
- Label the minimum metric as “minimum instantaneous FPS,” never “1% low.”
- Append results to `OPTIMIZATION.md`; never replace earlier results.
- If correctness fails or a repeatable regression appears, document it and mark the item **INCOMPLETE** or **REJECTED** instead of continuing.

### Task 1: Add visible benchmark progress and ETA

**Files:**
- Modify: `scripts/benchmark-particle-network.js:100-129, 208-251`
- Modify: `OPTIMIZATION.md:5-35`

**Step 1: Mark P0-2 in progress**

Change the P0-2 ledger status from **NEXT** to **IN PROGRESS** and add the current baseline commit hash to its evidence cell.

**Step 2: Add duration formatting**

Add a small helper after `median()`:

```javascript
function formatDuration(ms) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}
```

**Step 3: Print progress after every measurement**

Track `completedMeasurements` and `benchmarkStartedAt` in `main()`. After each `RUN`, print:

```javascript
completedMeasurements++;
const elapsed = performance.now() - benchmarkStartedAt;
const eta = completedMeasurements > 0
  ? (elapsed / completedMeasurements) * (measurementCount - completedMeasurements)
  : 0;
console.log(
  `PROGRESS ${completedMeasurements}/${measurementCount}` +
  ` elapsed=${formatDuration(elapsed)} eta=${formatDuration(eta)}`
);
```

**Step 4: Verify targeted progress output**

Serve two identical copies, then run:

```powershell
rtk node scripts/benchmark-particle-network.js --baseline http://127.0.0.1:8123/ --optimized http://127.0.0.1:8124/ --counts 1500 --trials 1 --headless
```

Expected: four `PROGRESS` lines ending in `PROGRESS 4/4`, followed by a passing smoke result.

**Step 5: Commit benchmark UX separately**

```powershell
rtk git add scripts/benchmark-particle-network.js OPTIMIZATION.md
rtk git commit -m "chore: show benchmark progress and ETA"
```

### Task 2: Write the P0-2 resize regression test

**Files:**
- Create: `scripts/test-p0-2-resize.js`
- Inspect: `js/ParticleNetwork.js:464-469, 504-550, 880-884`
- Inspect: `js/ParticleRendererGL.js:37-104, 131-140`

**Step 1: Build a browser regression harness**

The script must accept one URL, launch Edge with the same viewport/DPR as the benchmark, wrap `particleInstance.glRenderer.resize`, and assert:

1. During 30 stable animation frames, `resize` is called zero times.
2. After `page.setViewportSize({ width: 1200, height: 700 })` and the existing resize debounce settles, `resize` is called exactly once.
3. The GL canvas CSS dimensions are `1200px × 700px` and backing dimensions equal CSS size times DPR.
4. WebGL exists, its context is not lost, and no console/page errors occurred.

Exit 0 only when all assertions pass; print one JSON result for documentation.

**Step 2: Run against the current baseline**

```powershell
rtk node scripts/test-p0-2-resize.js http://127.0.0.1:8123/
```

Expected before the fix: FAIL because stable animation frames repeatedly call `resize`.

**Step 3: Commit the failing regression test**

```powershell
rtk git add scripts/test-p0-2-resize.js
rtk git commit -m "test: cover redundant WebGL resize"
```

### Task 3: Implement P0-2 with the smallest safe diff

**Files:**
- Modify: `js/ParticleRendererGL.js:37-104, 131-140`
- Modify: `js/ParticleNetwork.js:880-884`

**Step 1: Cache effective resize state**

In `ParticleRendererGL.prototype.resize`, compute CSS width, CSS height, DPR, backing width, and backing height. Return `false` before any DOM or GL write when all cached values match. On a real resize, update style/backing dimensions, call `viewport`, store the cache, and return `true`.

Use this shape:

```javascript
ParticleRendererGL.prototype.resize = function(width, height) {
  if (!this.gl) return false;
  var dpr = window.devicePixelRatio || 1;
  var backingWidth = Math.max(1, Math.floor(width * dpr));
  var backingHeight = Math.max(1, Math.floor(height * dpr));
  if (this._cssWidth === width && this._cssHeight === height &&
      this.dpr === dpr && this.canvas.width === backingWidth &&
      this.canvas.height === backingHeight) return false;

  this._cssWidth = width;
  this._cssHeight = height;
  this.dpr = dpr;
  this.canvas.style.width = width + 'px';
  this.canvas.style.height = height + 'px';
  this.canvas.width = backingWidth;
  this.canvas.height = backingHeight;
  this.gl.viewport(0, 0, backingWidth, backingHeight);
  return true;
};
```

**Step 2: Remove the unconditional per-frame call**

At the start of the GL frame, call `resize` only when DPR changed:

```javascript
if (this.glRenderer && this.glRenderer.beginFrame) {
  if (this.glRenderer.dpr !== (window.devicePixelRatio || 1)) {
    this.glRenderer.resize(this.i.size.width, this.i.size.height);
  }
  this.glRenderer.beginFrame();
}
```

Keep the constructor and `_rebuildOnResize` resize calls unchanged.

**Step 3: Verify syntax and regression**

```powershell
rtk node --check js/ParticleRendererGL.js
rtk node --check js/ParticleNetwork.js
rtk node scripts/test-p0-2-resize.js http://127.0.0.1:8124/
```

Expected: all pass; stable calls 0, resize-event calls 1.

### Task 4: Benchmark and document P0-2

**Files:**
- Modify: `OPTIMIZATION.md` P0-2 section and ledger

**Step 1: Verify A/B isolation**

Create exact current-tree baseline/optimized copies and confirm the application files differ only in `js/ParticleRendererGL.js` and `js/ParticleNetwork.js`, with every differing hunk belonging to P0-2.

**Step 2: Run the quick gate**

```powershell
rtk node scripts/benchmark-particle-network.js --baseline http://127.0.0.1:8123/ --optimized http://127.0.0.1:8124/ --quick --output p0-2-quick.json
```

Expected: exact counts, WebGL active, no context loss/errors, restoration pass, and no repeatable regression.

**Step 3: Run the full matrix**

```powershell
rtk node scripts/benchmark-particle-network.js --baseline http://127.0.0.1:8123/ --optimized http://127.0.0.1:8124/ --output p0-2-full.json
```

**Step 4: Append evidence to `OPTIMIZATION.md`**

Add date, commit hashes, environment, exact A/B diff, both result tables, progress duration, smoke result, resize-test result, regressions, and keep/revert decision. Mark P0-2 **COMPLETE** only if the resize regression and benchmark pass; otherwise mark it **INCOMPLETE** or **REJECTED**.

**Step 5: Resync and commit**

```powershell
rtk codegraph sync .
rtk git add js/ParticleRendererGL.js js/ParticleNetwork.js OPTIMIZATION.md
rtk git commit -m "perf: avoid redundant WebGL resizes"
```

### Task 5: Write P0-3 rebuild-count and latency coverage

**Files:**
- Create: `scripts/test-p0-3-rebuilds.js`
- Create: `scripts/benchmark-ui-apply.js`
- Inspect: `js/ui/applyParams.js:77-104`
- Inspect: `index.html:247-270`

**Step 1: Add deterministic rebuild-count assertions**

Launch the page, wrap `pn._rebuildOnResize`, and assert:

1. Applying a full parameter object with unchanged density causes zero rebuilds.
2. Changing only density causes exactly one rebuild and changes the particle count.
3. Resetting from a changed density through the `D` hotkey causes exactly one rebuild.
4. Applying a non-density control after reset causes zero rebuilds.

**Step 2: Add an interaction-latency benchmark**

At 10,000 particles, measure 50 synchronous full-parameter applies that change opacity but retain density. Run five alternating baseline/optimized trials and report median and p95 handler duration plus rebuild count. Restore settings after each trial.

**Step 3: Demonstrate current failure**

```powershell
rtk node scripts/test-p0-3-rebuilds.js http://127.0.0.1:8123/
```

Expected before the fix: unchanged-density and reset assertions fail because rebuilds occur.

### Task 6: Implement, benchmark, and document P0-3

**Files:**
- Modify: `js/ui/applyParams.js:92-98`
- Modify: `index.html:247-270`
- Modify: `OPTIMIZATION.md` P0-3 section and ledger

**Step 1: Rebuild only for a numeric density change**

```javascript
var nextDensity = Number(p.density);
if (Number.isFinite(nextDensity) && nextDensity > 0 &&
    nextDensity !== Number(o.density)) {
  o.density = nextDensity;
  if (typeof pn._rebuildOnResize === 'function') pn._rebuildOnResize();
}
```

**Step 2: Remove the explicit second reset rebuild**

Delete only the `_rebuildOnResize()` call in `doReset`; retain force clearing, GL clearing, and pane refresh.

**Step 3: Run correctness and latency tests**

```powershell
rtk node scripts/test-p0-3-rebuilds.js http://127.0.0.1:8124/
rtk node scripts/benchmark-ui-apply.js --baseline http://127.0.0.1:8123/ --optimized http://127.0.0.1:8124/
```

Expected: rebuild counts `0/1/1/0`; optimized non-density apply latency materially lower with no regression in density changes.

**Step 4: Run only the steady-state regression gate**

Use `--quick`, not the full 60-run matrix, because P0-3 is event-driven and should not change steady-state FPS. Run the full matrix only if quick results unexpectedly move.

**Step 5: Append and commit**

Record rebuild counts, median/p95 event latency, quick FPS regression results, smoke status, and decision in `OPTIMIZATION.md`. Then:

```powershell
rtk codegraph sync .
rtk git add js/ui/applyParams.js index.html scripts/test-p0-3-rebuilds.js scripts/benchmark-ui-apply.js OPTIMIZATION.md
rtk git commit -m "perf: rebuild particles only for density changes"
```

### Task 7: Prove P1-4 pair-set equivalence

**Files:**
- Create: `scripts/test-grid-neighborhood.js`
- Modify later: `js/ParticleNetwork.js:1088-1120`

**Step 1: Build a deterministic 3×3-grid fixture**

Generate particles with stable IDs in same-cell, edge-neighbor, diagonal-neighbor, and non-neighbor cells. Enumerate pairs with both algorithms:

- Current 8-neighbor scan plus `particleA.index < particleB.index`.
- Half-neighborhood offsets `[[0, 1], [1, -1], [1, 0], [1, 1]]`, with no index guard for cross-cell pairs.

Assert exact equality of unique pair IDs and assert that the half-neighborhood performs fewer candidate visits.

**Step 2: Run before production changes**

```powershell
rtk node scripts/test-grid-neighborhood.js
```

Expected: test proves the proposed algorithm has the same pair set.

### Task 8: Implement, benchmark, and document P1-4

**Files:**
- Modify: `js/ParticleNetwork.js:1088-1120`
- Modify: `OPTIMIZATION.md` P1-4 section and ledger

**Step 1: Replace nested -1..1 offsets**

Use the four half-neighborhood offsets. Keep same-cell processing unchanged. Remove the cross-cell particle-index guard because every unordered cell pair is now visited once.

**Step 2: Verify correctness**

```powershell
rtk node --check js/ParticleNetwork.js
rtk node scripts/test-grid-neighborhood.js
```

Also smoke collision, interaction, line rendering, and boundary cells in the automated browser.

**Step 3: Run quick then full A/B**

P1-4 changes the steady-state hot path, so use the same quick gate and full two-profile matrix as P0-2.

**Step 4: Append and commit**

Document pair-set equivalence, candidate-visit reduction, full benchmark tables, smoke status, and decision. Then:

```powershell
rtk codegraph sync .
rtk git add js/ParticleNetwork.js scripts/test-grid-neighborhood.js OPTIMIZATION.md
rtk git commit -m "perf: scan each neighboring cell pair once"
```

### Task 9: Gate P1-5 behind UI-sync instrumentation

**Files:**
- Create: `scripts/test-ui-sync-loop.js`
- Modify later: `index.html:477-515`
- Modify: `OPTIMIZATION.md` P1-5 section and ledger

**Step 1: Instrument before choosing an implementation**

Measure binding refreshes and UI-sync callback work for two seconds in three states: pane hidden, pane visible with cycling, and velocity zero. Record callbacks, refresh calls, and total callback duration.

**Step 2: Require these behaviors**

- Hidden pane: zero binding refreshes.
- Visible pane: refresh only when the displayed color changes and no more than 10 batches/second.
- Velocity zero: no hidden-pane UI work.
- Showing the pane catches controls up immediately.

**Step 3: Implement the minimum behavior that passes**

Prefer hidden-pane early return, last-value string comparisons, and a 100 ms throttle. Do not replace the whole pane system or introduce an event bus.

**Step 4: Benchmark appropriately**

Use the instrumentation A/B plus `--quick` FPS regression. Run the full matrix only if the callback change affects steady-state results while the pane is visible.

**Step 5: Document before proceeding to startup work**

Append results and mark P1-5 **COMPLETE**, **INCOMPLETE**, or **REJECTED**. Stop for review before beginning P1-6 through P1-9.

---

## Recommended execution order and stop/go gates

1. **P0-2 first:** smallest diff, hottest universal renderer path, strongest expected steady-state gain.
2. **P0-3 second:** obvious UI responsiveness and allocation win, measured with event latency rather than inflated FPS claims.
3. **P1-4 third:** high-count CPU win, but requires pair-set correctness proof before changing traversal.
4. **P1-5 fourth:** meaningful default-page main-thread cleanup, but higher UI behavior risk; instrument before editing.

Stop after every item. Continue only when correctness passes, the relevant benchmark has no repeatable regression, `OPTIMIZATION.md` contains the dated evidence, and CodeGraph is resynced.
