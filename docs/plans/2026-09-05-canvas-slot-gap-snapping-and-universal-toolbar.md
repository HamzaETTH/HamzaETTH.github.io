# Canvas Slot/Equal-Gap Snapping and Universal Toolbar Implementation Plan

> **For implementation:** Follow this plan test-first. The authorized workflow is the current clean `master`; do not stage, commit, or push.

**Goal:** Add reusable fractional-canvas and equal-gap gravity-well snapping, including restrained overlay feedback, and make the quick well/particle toolbar available on desktop with predictable inactivity fading.

**Architecture:** Extend `ParticleNetwork._resolveGravityWellSnappedPosition()` with per-axis interaction candidates so every existing placement/reposition path inherits the behavior. Store only transient snap/preview descriptors, then render them through the existing decorative gravity-well overlay. Keep toolbar activity in `mobileControls.js` behind one deadline-based timer and CSS state classes.

**Tech stack:** Vanilla JavaScript, Canvas 2D/WebGL overlay composition, CSS media features, Node assertions, Playwright/Edge browser tests.

---

## Task 1: Lock the snapping contract in browser tests

**Files:**

- Modify: `scripts/test-gravity-wells.js`
- Modify: `scripts/test-mobile-controls.js`

1. Add desktop assertions for independent quarter/third/center/two-thirds/three-quarter X/Y snaps using the current logical canvas dimensions.
2. Add resize assertions proving fraction positions are recalculated, deterministic tie assertions with center priority, and Shift-bypass/reacquisition assertions.
3. Add horizontal and vertical midpoint/extension cases with three and four wells, including orthogonal misalignment rejection.
4. Inspect transient guide state/layout for preview versus snapped intensity, center crosshair/label, equal-gap label/segments, and source halos.
5. Exercise existing-well drag, keyboard placement, palette placement, and selected-well reposition through the shared resolver.
6. Run the focused suites and capture the expected pre-implementation failures.

## Task 2: Add shared fractional and equal-gap snap candidates

**Files:**

- Modify: `js/ParticleNetwork.js`

1. Add constants for virtual fractions, preview distance, and equal-gap orthogonal alignment tolerance.
2. Build deterministic per-axis candidates during active placement/drag only: existing-well coordinates, current-dimension canvas fractions, and midpoint/one-gap extensions derived from valid source pairs.
3. Resolve the nearest candidate by axis delta, give the canvas center priority on true ties, and keep stable fallback ordering for every other tie.
4. Preserve the existing 8/12px mouse thresholds, 12/16px touch/pen thresholds, per-axis latching, and mouse Shift bypass.
5. Expose one nearest preview or one active snap descriptor per axis without altering committed well metadata.

## Task 3: Render restrained snap feedback

**Files:**

- Modify: `js/ParticleNetwork.js`

1. Extend guide/layout state with virtual-target and equal-gap descriptors while retaining current coordinate guides and aligned-well IDs.
2. Draw full-axis virtual guides faintly during preview and more brightly when snapped.
3. Draw a crosshair and `Centered` label when both axes are snapped to one-half.
4. Draw restrained equal-gap segments/ticks and a single `Equal gap` label per active axis; include source wells in the existing halo pass.
5. Clear all descriptors through the existing cancel, commit, delete, clear, destroy, and recreate paths.

## Task 4: Make the toolbar universal and deadline-driven

**Files:**

- Modify: `js/ui/mobileControls.js`
- Modify: `css/style.css`
- Modify: `scripts/test-mobile-controls.js`

1. Make the toolbar visible at desktop and coarse-pointer breakpoints while retaining 44px targets, safe-area placement, translucent styling, and the narrow stacked fallback.
2. Reveal the toolbar at 0.72 opacity for fine pointers and 0.96 for coarse pointers; fade both toward 0.1 after inactivity.
3. Open the exact-count dialog immediately for primary mouse clicks; keep touch/pen on the existing 550ms hold with 12px tolerance.
4. Keep the dialog compact with a top-right close button and an inline input/OK row. Accept only trimmed whole numbers from 16 through 20,000.
5. Prove palette drag and count stepping/repeat with real mouse and touch pointer input. Touch/pen wells default to 60px while mouse placement retains the configured desktop radius.
6. Replace timeout-reset activity handling with a 3000ms deadline and one scheduled expiry check. Global `pointermove`, `pointerdown`, and `keydown` extend the deadline without clearing/recreating a timer.
7. Keep the toolbar active while dragging, repeating, holding, focused, or showing the dialog, then fade over roughly 900ms. Disable transitions under reduced motion.
8. Remove every new listener/timer on destroy and cover destroy/recreate behavior.

## Task 5: Verify the integrated behavior

**Files:**

- Test: `scripts/test-gravity-wells.js`
- Test: `scripts/test-mobile-controls.js`
- Test: `scripts/test-adaptive-lines.js`
- Test: `scripts/test-selection-clipboard.js`
- Test: `scripts/test-destroy-lifecycle.js`
- Test: `scripts/test-resize.js`
- Test: `scripts/test-startup-loads.js`

1. Run syntax checks for every changed JavaScript file and `git diff --check`.
2. Run the focused gravity-well and toolbar suites, followed by adaptive-line, selection/clipboard, destroy-lifecycle, resize, and startup-load suites.
3. Capture desktop and phone screenshots from the browser suites, inspect them at original resolution, and record artifact paths.
4. Review the final diff for scope, transient-state cleanup, deterministic behavior, and absence of particle hot-loop work.
