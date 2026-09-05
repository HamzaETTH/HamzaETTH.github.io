# Gravity Well Drag Information And Snap Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task.

**Goal:** Give phone and desktop gravity-well movement complete spatial feedback: distance rulers, target radius and effective force labels, active-well X/Y guides, exact axis snapping, and aligned-target highlighting.

**Architecture:** Keep interaction state, snapping, and annotation drawing in the authoritative `js/ParticleNetwork.js` path. Extend the existing non-interactive gravity-well overlay canvas rather than changing `GravityWellRendererGL` or creating DOM labels, so WebGL, Trails, Canvas fallback, high-DPR, phone, and desktop modes share one implementation. Keep the current `_gravityWellMeasurements` array compatible while enriching its target data, and keep all snap/guide latches in a separate transient state that cannot enter persisted wells or selection clipboard snapshots.

**Tech Stack:** Vanilla JavaScript, Pointer Events, Canvas 2D overlay rendering, existing WebGL gravity-well composition, Node.js, Playwright, Edge/Chromium.

---

## Approved Interaction Contract

- Apply the behavior on phone and desktop whenever a well center is actively moved: an existing-well drag, a keyboard placement preview, a mobile palette drag, or a selected-well reposition operation. Radius-only sizing does not recalculate the center, but the annotations remain visible until commit, release, or cancellation.
- Preserve every existing center-to-center distance ruler and its `N px` distance label.
- Show one compact two-line information chip beside every non-active target well:
  - `Radius 60 px`
  - `Absorb 12` or `Repel 12`
- Treat `radius` as the displayed size value. Format strength as the absolute per-well magnitude with at most two decimal places; do not multiply it by the global force multiplier.
- Derive the behavior label from effective signed behavior, not the stored icon type alone. Negative strength swaps black/white behavior, so an inverted black well reads `Repel N` and an inverted white well reads `Absorb N`.
- Show coordinates only for the active well. Draw a translucent dashed vertical guide from the top edge to the active center labeled `X N px`, and a dashed horizontal guide from the left edge labeled `Y N px`.
- Snap center coordinates, never well edges or orbit radii. X and Y snap independently.
- Use logical canvas-pixel thresholds: enter snap at 8px for mouse/desktop and 12px for touch-primary layouts. Keep a latched axis snapped until the raw center moves more than 4px beyond its entry threshold, preventing finger and pointer jitter.
- Resolve each axis by smallest absolute axis delta, then shortest center-to-center distance, then existing `gravityWells` array order. This makes overlapping candidates deterministic.
- Persist snapped coordinates directly on the draft or well, so release requires no second correction and the exact coordinates survive commit.
- When multiple wells already share the snapped coordinate, highlight all matching targets on that axis. Use a cool cyan accent for X alignment, a warm amber accent for Y alignment, and a neutral bright combined glow when both axes match.
- Alignment changes only visuals and center coordinates. It must not change selection sets, well type, radius, strength, colors, particle count, or gravity physics.
- Clear snap latches, guide state, labels, and target glows on release, commit, cancellation, deletion, clear/reset, blur, hidden document, destroy, and recreate.
- On desktop, holding `Shift` during an active move temporarily bypasses snapping; releasing it while still in range reacquires the nearest valid axes. This is scoped to active movement, so it does not interfere with `Shift+B`. Phone/touch movement remains modifier-free.

## Existing Paths To Preserve

- `js/ParticleNetwork.js:2119-2214` owns placement, mobile palette drafts, reposition drafts, commit, and cancellation.
- `js/ParticleNetwork.js:2238-2336` owns existing-well drag start/move/stop and shared pointer-up behavior.
- `js/ParticleNetwork.js:2338-2366` creates the current center-distance measurement records.
- `js/ParticleNetwork.js:2408-2583` owns the shared high-DPR overlay, Canvas fallback, distance-ruler drawing, and final composition order.
- `js/ParticleNetwork.js:1232-1259` routes phone one-finger well movement through `_handleGravityWellPointerMove()`.
- `js/ParticleNetwork.js:2926-2987` routes desktop canvas/window mouse movement through the same drag path.
- `js/ui/mobileControls.js:132-166` has a separate palette-drag update path and must call the same snap resolver rather than duplicating snap math.
- `scripts/test-gravity-wells.js:255-301` covers placement rulers and overlay pixels; `scripts/test-gravity-wells.js:604-672` covers an existing desktop drag; `scripts/test-gravity-wells.js:1490-1604` covers touch and high DPR.
- `scripts/test-mobile-controls.js:386-535` covers phone one-finger movement, two-finger adjustment, cancellation, and randomization.
- `scripts/test-gravity-wells.js:1663-1670` currently rejects every `setLineDash` occurrence. Replace that blanket source assertion because dashed coordinate guides are now intentional; retain a focused assertion that no dashed radius/selection ring returns.
- Current `master` is based on `61f358b`, whose selection/clipboard pointer-priority paths must remain authoritative. Run `scripts/test-selection-clipboard.js` after the feature rather than relying only on gravity-specific tests.

### Task 1: Add Failing Drag-Annotation And Snap Coverage

**Files:**

- Modify: `scripts/test-gravity-wells.js:255-301`
- Modify: `scripts/test-gravity-wells.js:604-672`
- Modify: `scripts/test-gravity-wells.js:1490-1604`
- Modify: `scripts/test-mobile-controls.js:386-535`

**Step 1: Extend the desktop ruler fixture**

Create three fixed target wells with known positions, radii, types, and signed strengths. Start moving a fourth well and inspect `_gravityWellMeasurements` plus the new transient guide state. Assert:

- the active well is excluded;
- every other well remains represented exactly once;
- distance values remain center-to-center;
- metadata contains `Radius N px` and the correct effective `Absorb N`/`Repel N` text, including negative-strength inversion and a half-step magnitude;
- only the active source exposes X/Y coordinate labels.

**Step 2: Add independent desktop snap cases**

Move the active center within 8px of one target's X and a different target's Y. Assert exact stored coordinates, both latched target IDs, axis-specific aligned target sets, and persistence after mouse release. Move 9px from a fresh axis and assert no new snap. Then move a latched axis through the 12px release threshold and assert it detaches without changing the other axis. Hold `Shift` to assert both axes use their raw positions, then release `Shift` within range and assert snapping is reacquired.

**Step 3: Add deterministic candidate cases**

Create competing target coordinates and assert smallest axis delta wins. For equal axis deltas, assert shortest center distance wins; if both are equal, assert the earlier `gravityWells` entry wins. Assert all wells sharing the final snapped coordinate are marked aligned even though only one target owns the latch.

**Step 4: Add phone-path cases**

Use touch `PointerEvent`s at a 390 by 844 viewport with DPR 2. Assert a 10px approach snaps on phone while the equivalent desktop case does not, a 13px fresh approach does not snap, and the existing one-finger move and second-finger radius/strength controls still work.

**Step 5: Cover placement and cleanup**

Assert keyboard placement, mobile palette placement, and selected-well reposition use the same resolver. Verify a single well still draws coordinate guides even though there are no distance measurements. Assert release, commit, Escape, pointer cancellation, deletion, clear, destroy, and recreate leave no snap state or visible annotations.

**Step 6: Add rendering assertions**

At deterministic coordinates, sample overlay pixels to prove:

- both coordinate guides are dashed and lower-opacity than an aligned guide;
- X/Y labels are painted inside the viewport;
- target metadata chips are painted;
- aligned targets receive a visible halo;
- normal distance lines and endpoint ticks remain painted.

Run the fixture in normal WebGL, Trails, Canvas fallback, and high-DPR touch modes. Store screenshots only when `--screenshot-dir` is supplied.

**Step 7: Narrow the old dashed-radius assertion**

Remove the repository-wide `!networkSource.includes('setLineDash')` check. Keep the existing `selectionRing` rejection and add a scoped assertion that dashing appears only in the coordinate-guide drawing method, not in the well renderer or radius/selection rendering paths.

**Step 8: Run the focused suites and confirm failure**

Run:

```powershell
rtk node scripts/test-gravity-wells.js http://127.0.0.1:8000
rtk node scripts/test-mobile-controls.js http://127.0.0.1:8000
```

Expected: the new metadata, snap-state, coordinate-guide, and alignment assertions fail against the current implementation while all pre-existing assertions remain green.

### Task 2: Add One Shared Axis-Snap Resolver

**Files:**

- Modify: `js/ParticleNetwork.js:67-72`
- Modify: `js/ParticleNetwork.js:2119-2336`
- Modify: `js/ParticleLifecycle.js:73-164`

**Step 1: Add explicit constants**

Add named logical-pixel constants near the existing mobile gesture constants:

```javascript
var gravityWellSnapDistance = 8;
var mobileGravityWellSnapDistance = 12;
var gravityWellSnapReleasePadding = 4;
var gravityWellAlignmentEpsilon = 0.01;
```

Select the threshold from the active input kind: mouse uses 8px, while touch and pen use 12px. Do not scale thresholds by DPR.

**Step 2: Add separate transient snap state**

Initialize `_gravityWellSnapState` beside the existing drag/overlay state. Store the source identity, input kind, `snapXTargetId`, and `snapYTargetId` there; do not attach internal fields to `_gravityWellDrag`, drafts, stored wells, emitted records, selection snapshots, or clipboard data.

**Step 3: Implement `_resolveGravityWellSnappedPosition()`**

Give the helper raw center coordinates, the excluded active/edit ID, input kind, and a desktop bypass flag. It must:

1. Clamp the raw center to logical canvas bounds.
2. Return clamped raw coordinates and clear active latches while desktop `Shift` bypass is held.
3. Keep a valid existing latch while its raw axis delta is within `entry + releasePadding`.
4. Otherwise clear that axis and scan all non-active wells within the entry threshold.
5. Resolve candidates by axis delta, center distance, then array order.
6. Return exact snapped X/Y values and update `_gravityWellSnapState` without mutating any well-shaped object.

Return a small object per pointer move; this path runs only during direct interaction, not per particle or per idle animation frame.

**Step 4: Route every center-moving path through it**

Use the resolver from:

- `_handleGravityWellPointerMove()` for existing-well drag and positioning drafts;
- `_handleGravityWellPointerDown()` when an awaiting placement/reposition first receives its center;
- `updateGravityWellPaletteDrag()` for the top-right phone palette;
- final pointer-up/palette commit updates, which already call the move/update methods.

Pass `event.shiftKey` and the input kind through desktop canvas/window movement and final mouse-up. Mobile routing passes `touch` or `pen` and always disables modifier bypass. Do not change Ctrl/Cmd selection precedence.

Do not apply snapping while only radius or strength is changing. Preserve drag offsets, canvas bounds, phone deletion-target detection, selection, and all event consumption rules.

**Step 5: Clear latches on every terminal path**

Ensure `_stopGravityWellDrag()`, `_commitGravityWellPlacement()`, `cancelGravityWellPlacement()`, `removeGravityWell()`, `clearGravityWells()`, mobile pointer cancellation/reset, blur, visibility loss, and destroy cannot retain stale snap IDs. Null the state explicitly in `ParticleLifecycle.destroy()`.

**Step 6: Run focused snap tests**

Run the snap sections of both browser suites. Expected: exact coordinate, threshold, hysteresis, tie-break, placement, and cleanup assertions pass.

### Task 3: Enrich Measurement Data Without Breaking Existing Rulers

**Files:**

- Modify: `js/ParticleNetwork.js:2338-2394`

**Step 1: Centralize effective behavior formatting**

Add a small helper used by annotation data and `_getVisibleGravityWells()`:

```javascript
function effectiveGravityWellType(well) {
  return Number.isFinite(well.strength) && well.strength < 0
    ? (well.type === 'white' ? 'black' : 'white')
    : well.type;
}
```

Format the absolute strength with at most two decimals and map effective black to `Absorb`, effective white to `Repel`.

**Step 2: Preserve and extend `_getGravityWellMeasurements()`**

Keep the existing fields and `label: Math.round(distance) + ' px'`. Add target-only fields:

```javascript
targetRadius: well.radius,
radiusLabel: 'Radius ' + Math.round(well.radius) + ' px',
effectiveType: effectiveType,
forceLabel: behavior + ' ' + formattedMagnitude,
alignedX: Math.abs(well.x - source.x) <= gravityWellAlignmentEpsilon,
alignedY: Math.abs(well.y - source.y) <= gravityWellAlignmentEpsilon
```

Do not mutate stored wells while deriving effective behavior.

**Step 3: Add `_getGravityWellGuideState()`**

Return `null` while no draft/drag is active. Otherwise return the active source center, rounded `X N px`/`Y N px` labels, active ID, latched IDs, and all target IDs sharing each exact snapped axis. This separate state keeps `_gravityWellMeasurements` an array for current callers and allows coordinate guides when there are zero other wells.

### Task 4: Draw Coordinate Guides, Target Metadata, And Alignment Glow

**Files:**

- Modify: `js/ParticleNetwork.js:2408-2583`
- Test: `scripts/test-gravity-wells.js`

**Step 1: Add a reusable overlay-label primitive**

Extract the current rounded black label-box painting into a helper accepting one or two text lines. Return the painted rectangle so later labels can avoid it. Preserve the existing Fira Code typography and current distance-label appearance.

**Step 2: Draw coordinate guides first**

Add `_drawGravityWellCoordinateGuides(context, guideState)`. Use `context.save()`/`restore()`, `setLineDash([5, 5])`, one logical-pixel strokes, and low alpha. Draw top-to-center for X and left-to-center for Y. Put each coordinate chip near the midpoint of its guide and clamp it inside the logical canvas.

Brighten the aligned axis and use its axis accent, but keep the guide visually below distance rulers and metadata.

**Step 3: Preserve distance rulers**

Keep center lines, perpendicular endpoint ticks, and midpoint distance labels unchanged. Refactor only enough to share label-box collision bookkeeping.

**Step 4: Draw target metadata chips**

For every measurement, draw the two-line radius/force chip adjacent to the target well. Try deterministic positions below, above, right, then left of the target's visible vertical/core extent; choose the first viewport-safe rectangle that does not overlap an existing coordinate, distance, or metadata label. Clamp the fallback rectangle if all candidates are occupied.

Use the target's effective behavior only for text. Do not recolor the well or confuse this annotation with selection.

**Step 5: Draw aligned-target halos last**

Draw a compact overlay glow around each aligned target core, not a dashed radius ring. Use X/Y axis accents and combine them when both match. The halo belongs to the overlay and must not set `selectedGravityWellId`, add IDs to `selectedGravityWellIds`, or require changes to `GravityWellRendererGL.js`.

**Step 6: Update `_finishGravityWellFrame()`**

Compute both measurements and guide state. Ensure the overlay when either exists, even with a single well and zero distance measurements. In Trails mode, preserve the existing WebGL canvas copy before annotations; in fallback mode, preserve fallback well drawing before annotations. Clear both transient public diagnostics when interaction ends.

Set the overlay canvas `aria-hidden="true"` when it is created. Keep `pointer-events: none`; the information is temporary visual manipulation feedback and must add no focus target or event listener.

### Task 5: Verify All Rendering And Interaction Modes

**Files:**

- Verify: `js/ParticleNetwork.js`
- Verify: `js/ParticleLifecycle.js`
- Verify: `scripts/test-gravity-wells.js`
- Verify: `scripts/test-mobile-controls.js`
- Verify: `docs/plans/2026-09-05-gravity-well-drag-info-and-snap.md`

**Step 1: Run static checks**

```powershell
rtk node --check js/ParticleNetwork.js
rtk node --check js/ParticleLifecycle.js
rtk node --check scripts/test-gravity-wells.js
rtk node --check scripts/test-mobile-controls.js
rtk git diff --check
```

**Step 2: Start the local site**

```powershell
rtk python -m http.server 8000 --bind 127.0.0.1
```

**Step 3: Run browser regressions**

```powershell
rtk node scripts/test-gravity-wells.js http://127.0.0.1:8000
rtk node scripts/test-mobile-controls.js http://127.0.0.1:8000
rtk node scripts/test-selection-clipboard.js http://127.0.0.1:8000
rtk node scripts/test-destroy-lifecycle.js --url http://127.0.0.1:8000 --expect optimized
rtk node scripts/test-p0-2-resize.js http://127.0.0.1:8000
rtk node scripts/test-startup-loads.js --url http://127.0.0.1:8000 --require-manifest
```

Expected: all assertions pass with no browser errors or WebGL context loss.

**Step 4: Perform visual review**

Capture deterministic desktop 1280 by 720 and phone 390 by 844 DPR 2 screenshots during an active dual-axis snap. Confirm readable labels, visible dash gaps, clear axis accents, no clipping behind phone controls, no overlap with the active core, and no persistent overlay after release. Also review Trails and Canvas fallback screenshots.

**Step 5: Review scope**

Expected production changes are limited to `js/ParticleNetwork.js` and lifecycle nulling in `js/ParticleLifecycle.js`; test changes are limited to the two existing gravity/mobile browser suites. `GravityWellRendererGL.js`, `ParticleRendererGL.js`, `js/ui/mobileControls.js`, physics, configuration, and CSS should remain untouched unless visual verification proves the overlay cannot meet the contract.

**Step 6: Commit and publish after implementation**

Stage only the plan and scoped implementation/test files, then commit and push according to `AGENTS.md`:

```powershell
rtk git add docs/plans/2026-09-05-gravity-well-drag-info-and-snap.md js/ParticleNetwork.js js/ParticleLifecycle.js scripts/test-gravity-wells.js scripts/test-mobile-controls.js
rtk git commit -m "feat: add gravity-well drag guides"
rtk git push origin master
```

Verify local `HEAD`, `origin/master`, and `git ls-remote origin refs/heads/master` match, and verify the worktree is clean.

## Risks And Guardrails

- Coordinate guides must render even when no other wells exist; do not key overlay visibility only to `measurements.length`.
- The current blanket `setLineDash` source test will fail by design. Narrow it without allowing the removed dashed radius ring to return.
- Mobile palette movement bypasses `_handleGravityWellPointerMove()` today. Reuse one resolver in both paths or phone placement will drift from existing-well movement.
- Signed strength controls effective behavior. Do not label solely from stored `well.type` and do not lose half-step strength values.
- Snapping must exclude the active/edit well and must use logical coordinates at every DPR.
- Snap state must not leak into persisted wells, selection state, clipboard snapshots, or gravity physics.
- Preserve the newer selection/clipboard pointer priority on current `master`; snapping must run only after an actual well move has won gesture arbitration.
- Dense labels can obscure each other. Keep collision handling deterministic, viewport-clamped, and active only during interaction.
- Do not mark aligned targets as selected to obtain a glow; that would alter selection behavior and panel state.
- Preserve the overlay composition order for Trails and fallback, and restore Canvas context state after every dashed/styled draw.
