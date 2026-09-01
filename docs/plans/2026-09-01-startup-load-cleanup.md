# Startup Load Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the safest startup/dead-load findings and the missing manifest with exact before/after commits and reproducible browser evidence.

**Architecture:** Keep the deployed particle engine behavior unchanged while reducing avoidable startup requests and unused code. Add one Playwright startup probe first, then make P1-6, the manifest fix, and P1-9 independently reversible; defer parser timing and lazy Tweakpane construction to the next cycle because they share initialization state.

**Tech Stack:** Static HTML/CSS, classic and ES-module JavaScript, Microsoft Edge via Playwright, Git.

---

### Task 1: Establish the startup baseline

**Files:**
- Create: `scripts/test-startup-loads.js`
- Modify: `OPTIMIZATION.md`

1. Record the current commit and tracked-tree state.
2. Add a Playwright probe that captures requests, failed responses, console/page errors, DOMContentLoaded, the running ParticleNetwork/WebGL state, and settings-pane behavior.
3. Run the probe against the unchanged site and save the baseline facts in `OPTIMIZATION.md`.
4. Commit the harness/checkpoint separately.

### Task 2: Complete P1-6

**Files:**
- Modify: `css/style.css`
- Modify: `index.html`
- Modify: `OPTIMIZATION.md`

1. Mark P1-6 in progress and record the exact preceding commit.
2. Remove only the unused Inter `@import`; add the Fira Code font-origin preconnect.
3. Run the startup probe and page/WebGL/settings smoke checks.
4. Record request/load evidence and commit P1-6 alone.

### Task 3: Fix the missing manifest

**Files:**
- Create: `site.webmanifest`
- Modify: `OPTIMIZATION.md`

1. Record the P1-6 commit as the manifest baseline.
2. Add a minimal manifest using the already-shipped name, theme, background, and Android icons.
3. Assert `/site.webmanifest` is valid JSON with a successful response and no page request failure.
4. Document and commit the manifest fix alone.

### Task 4: Complete P1-9 dead-load cleanup

**Files:**
- Modify: `index.html`
- Modify: `js/ColorUtils.js`
- Modify: `js/ParticleNetwork.js`
- Modify: benchmark/test scripts if lazy benchmark loading requires it
- Delete only after current-reference verification: `js/ParticleRenderer.js`, `js/ParticleCore.js`, `js/ParticlePhysics.js`
- Modify: `OPTIMIZATION.md`

1. Re-run tracked-reference checks immediately before each removal.
2. Remove the unused renderer entry load and orphaned files in a dedicated commit.
3. Remove `buildDefaultParams`, unused module imports, duplicated ColorUtils declarations, and unreachable velocity-persist loops in narrowly scoped commits where practical.
4. Lazy-load `Benchmark.js` from the B-hotkey path and make automated benchmark setup explicitly request it.
5. Run syntax/reference checks, startup probe, quick benchmark, WebGL/error/settings smoke, and a B-hotkey benchmark-construction check.
6. Record byte/request reductions, correctness results, and the keep decision; commit the completed P1-9 state.

### Cycle gate

Run `git diff --check`, the startup probe, the relevant deterministic scripts, and the existing quick benchmark. Confirm every tracked change is committed, `webgl-black-hole/` remains untouched, and `OPTIMIZATION.md` names every baseline/optimized commit before planning Cycle 2.
