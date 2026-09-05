# Mobile Particle Controls Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task.

**Goal:** Add phone-first controls that make one-finger input absorb particles, support persistent drag-and-drop black and white holes, allow direct touch editing, expose deliberate particle-count controls, and leave desktop behavior unchanged.

**Architecture:** Keep simulation and gesture arbitration in `ParticleNetwork.js`, where pointer priority and gravity-well state already live. Add a small ES module for the phone-only palette and count UI, mount it from the existing `pane.js` bootstrap, and style it in the current monochrome visual language. Extend the Playwright coverage with a dedicated mobile-control suite, then rerun the existing gravity-well, lifecycle, resize, and startup regressions.

**Tech Stack:** Vanilla JavaScript, Pointer Events, CSS media queries and safe-area environment variables, existing ParticleNetwork prototype API, Node.js, Playwright, Edge/Chromium.

---

## Approved Interaction Contract

| Context | Gesture | Result |
| --- | --- | --- |
| Empty canvas | One finger | Absorb particles toward that finger. |
| Empty canvas | Two fingers | Repel particles from the centroid of both fingers. |
| Empty canvas | Three-finger tap | Run the existing `R` visual randomization while preserving particle size and particle count. |
| Top-right palette | Drag black token onto canvas | Place one persistent black hole at the drop point. |
| Top-right palette | Drag white token onto canvas | Place one persistent white hole at the drop point. |
| Existing hole | Drag with one finger | Move and select that hole. |
| Existing hole | Hold it with one finger, then move a second finger anywhere on the canvas | Move the second finger up/down to enlarge/shrink the hole at 1 radius px per pointer px and right/left to increase/decrease its strength-derived speed by 0.5 per 8 pointer px. Each axis has a 12 px dead zone before those changes begin. |
| Existing hole | Drag it onto its matching top-right hole icon | Highlight the icon as a delete target, then remove the hole on release. This behavior exists only while the phone palette is visible. |
| Existing hole | Hold for 700 ms, then drag vertically | Up increases force magnitude; down decreases it. Preserve the current force sign so the gesture never silently reverses the hole. |
| Count control | Tap `-` or `+` | Decrease or increase the particle target by 25 percent, with a minimum step of 16 particles. |
| Count control | Hold `-` or `+` | Repeat the same count step at a controlled interval until release or cancellation. |

Additional rules:

- Placed holes persist until removed or cleared through the existing controls.
- A three-finger tap is valid only when all three touches begin within 180 ms, move no more than 12 CSS pixels, and finish within 350 ms.
- A well long-press is cancelled when movement exceeds 10 CSS pixels before 700 ms, when another unrelated finger appears, or when the pointer is cancelled.
- Palette controls are shown only for touch-primary devices using `(hover: none) and (pointer: coarse)`, including phone landscape. They stay hidden for mouse/trackpad desktop sessions.
- Palette controls use at least 44 by 44 CSS pixel targets, safe-area offsets, accessible names, and visible keyboard focus.
- The palette starts legible, then settles to low opacity after inactivity. Touch, focus, or active dragging restores full opacity. Reduced-motion mode changes opacity without animated movement.
- Opening the existing Tweakpane may cover the palette; the palette must remain below Tweakpane in the established z-index order and must not intercept panel input.

## Important Existing Behavior

- `js/ParticleNetwork.js:2204-2264` currently documents one finger as attraction, but `_updateSoA` near `js/ParticleNetwork.js:3073` applies a negative sign to `attractionForce` and a positive sign to `repulsionForce`. The mobile fix must map one finger to the physically inward channel and two fingers to the physically outward channel. Tests must assert particle displacement, not property names.
- `js/ParticleNetwork.js:1427-1620` already owns gravity-well placement, hit testing, one-pointer dragging, selection, and commit behavior. Extend this state instead of adding a second independent canvas interaction system.
- `js/ui/pane.js:669-718` owns `randomizeVisualParams()`. It currently randomizes `particleSize`; the mobile call needs an option that preserves size while keyboard `R` keeps its current behavior.
- `js/ParticleNetwork.js:2938-2970` owns particle-count rebuilding. Reuse one target-count implementation so mobile controls, wheel input, arrow keys, monitoring, selection trimming, SoA buffers, and the grid cannot drift apart.
- The checkout already has unrelated modifications in `js/ParticleLifecycle.js`, `js/ParticleNetwork.js`, `js/ui/pane.js`, and `scripts/test-gravity-wells.js`. Preserve them exactly. Do not reset, stage, commit, or push during implementation unless the user separately asks.

### Task 1: Add Failing Mobile Interaction Coverage

**Files:**

- Create: `scripts/test-mobile-controls.js`
- Reference: `scripts/test-gravity-wells.js:32-54`
- Reference: `scripts/test-gravity-wells.js:1489-1605`

**Step 1: Build deterministic pointer helpers**

Add helpers that dispatch touch `pointerdown`, `pointermove`, `pointerup`, and `pointercancel` events with independent pointer IDs, explicit timestamps/waits, and CSS-logical coordinates. Include helpers for simultaneous two-finger movement, three-finger taps, palette-to-canvas dragging, and hold-then-drag.

**Step 2: Write force-direction assertions**

Freeze unrelated motion, position a particle to one side of the touch point, dispatch one finger, advance one update, and assert velocity points toward the finger. Repeat with two fingers and assert velocity points away from their centroid. Do not assert only that `attractionForce` or `repulsionForce` is non-null.

**Step 3: Write palette and persistence assertions**

At a 390 by 844 mobile viewport, assert that the two hole tokens and count controls are visible, are at least 44 by 44 CSS pixels, and fit inside the safe viewport. Drag each token to the canvas, release it, and assert one black and one white well remain after release. Assert the palette is absent or hidden at a 1280 by 720 desktop viewport.

**Step 4: Write well-edit assertions**

Place a known well, then verify:

- one-finger movement changes its center but not its radius or strength;
- a second finger anywhere on the canvas changes radius vertically and strength-derived speed horizontally, while movement inside the 12 px per-axis dead zone changes neither;
- a dragged existing black or white hole is deleted when released on its matching palette icon, with visible delete-target feedback;
- default 60 px phone wells affect particles only within 120 px, while desktop wells keep their existing unbounded inverse-square falloff;
- a 700 ms hold followed by an upward drag increases strength magnitude;
- a downward strength drag decreases magnitude without changing its sign;
- pointer cancellation clears timers, captures, drafts, and gesture state.

**Step 5: Write three-finger randomization assertions**

Snapshot `particleSize`, `numParticles`, and representative visual fields. Dispatch a valid three-finger tap and assert at least one visual field changed while size and count remained exactly equal. Add rejected cases for a three-finger drag and for three fingers that arrive outside the 180 ms chord window.

**Step 6: Write count-control assertions**

Tap `+`, verify the count target rises by 25 percent with a minimum delta of 16, then tap `-` and verify it falls using the same rule. Hold one button long enough for two repeats, release it, and assert the count stops changing. Verify the readout matches `pn.numParticles` after every update and after experience destroy/recreate.

**Step 7: Run the focused test and confirm failure**

Run:

```powershell
rtk node scripts/test-mobile-controls.js http://127.0.0.1:8000
```

Expected: FAIL because the palette, gesture state, preserve-size randomization option, and mobile count API do not exist, and because current one-finger physics moves particles outward.

### Task 2: Centralize Safe Particle Count Changes

**Files:**

- Modify: `js/ParticleNetwork.js:2938-3018`
- Test: `scripts/test-mobile-controls.js`
- Regression: `scripts/test-density-aware-force-sliders.js:296-322`

**Step 1: Add a target-count method**

Extract the rebuilding portion of `adjustParticleCount(increase)` into `setParticleCount(target)`. Normalize to a finite non-negative integer, preserve existing particles up to the new target, create only missing particles, trim selected indices, rebuild SoA/grid state, update the pointer sentinel index, notify the performance monitor, and ensure the animation loop can resume.

**Step 2: Emit a count-change event**

After a successful target change, dispatch `particle-count-change` with `{ count }`. Do not emit when the normalized target equals the current count.

**Step 3: Preserve desktop count semantics**

Keep `adjustParticleCount(true)` as doubling and `adjustParticleCount(false)` as halving by delegating to `setParticleCount`. Mouse wheel and arrow-key behavior must remain byte-for-byte equivalent from the user's perspective.

**Step 4: Run count regressions**

Run:

```powershell
rtk node scripts/test-density-aware-force-sliders.js http://127.0.0.1:8000
```

Expected: PASS, including the existing wheel count update and force-slider synchronization.

### Task 3: Implement Mobile Gesture Arbitration

**Files:**

- Modify: `js/ParticleNetwork.js:749-779`
- Modify: `js/ParticleNetwork.js:1002-1007`
- Modify: `js/ParticleNetwork.js:1427-1620`
- Modify: `js/ParticleNetwork.js:2204-2420`
- Modify: `js/ParticleLifecycle.js:145-181`
- Test: `scripts/test-mobile-controls.js`

**Step 1: Add one mobile gesture state object**

Initialize one `_mobileGesture` owner with active pointer records, mode, candidate timestamps, movement origins, selected well ID, starting radius/strength, and timer IDs. Use explicit modes such as `canvas-force`, `three-tap`, `well-pending`, `well-move`, `well-adjust`, and `well-strength` so only one behavior can own a pointer sequence.

**Step 2: Add one cleanup path**

Create `_cancelMobileGesture()` to clear the hold timer, release internal pointer records, stop a well drag, hide labels, and clear interactive forces. Call it from pointer cancellation, window blur, document hiding, experience destruction, and gravity-well cancellation. Extend `ParticleLifecycle.destroy()` to null any new state after listeners/timers are stopped.

**Step 3: Correct empty-canvas force mapping on touch only**

Update the current `updateForcesFromPointers` path so one touch produces inward physical acceleration and two touches produce outward physical acceleration from their centroid. Do not alter mouse button behavior, keyboard gather, `_updateSoA` signs, option names, or desktop hotkeys.

**Step 4: Recognize a three-finger tap before force handling**

When three empty-canvas touches form a valid candidate, clear transient forces and reserve the sequence. On successful release, dispatch a `particle-mobile-randomize` event once. If timing or movement invalidates the candidate, fall back to the normal two-or-more-finger repulsion behavior without leaving stale state.

**Step 5: Add delayed well movement and long-press strength mode**

On first touch over a well, select it and enter `well-pending`. Start the 700 ms timer but do not move the well yet. Movement beyond 10 pixels before the timer enters `well-move`; timer completion while still within slop enters `well-strength`. In strength mode, quantize vertical travel to 0.5-point increments, clamp magnitude to 0 through 100, preserve the starting sign, and reuse `_showGravityWellStrengthLabel()` for feedback.

**Step 6: Add two-axis second-finger adjustment**

If a second touch begins anywhere on the canvas while a well is held, cancel the hold timer and enter `well-adjust`. Keep the first pointer as the center/move anchor. Relative to the second touch origin, vertical travel changes radius at 1:1 and horizontal travel changes strength magnitude by 0.5 per 8 px without changing its sign. Apply an independent 12 px dead zone to each axis before scaling, clamp radius with `_clampGravityWellRadius()`, clamp strength magnitude to 0 through 100, and keep the existing labels updated.

**Step 7: Verify the gesture-state test subset**

Run:

```powershell
rtk node scripts/test-mobile-controls.js http://127.0.0.1:8000 --section gestures
```

Expected: PASS for force direction, gesture priority, well move/adjust/strength, three-finger recognition, and cancellation cleanup.

### Task 4: Add the Phone-Only Palette

**Files:**

- Create: `js/ui/mobileControls.js`
- Modify: `js/ui/pane.js:1-10`
- Modify: `js/ui/pane.js:985-1082`
- Modify: `css/style.css:44-119`
- Test: `scripts/test-mobile-controls.js`

**Step 1: Build a lifecycle-safe module**

Export `mountMobileControls(pn, actions)` and return a `destroy()` function. Mount once during `registerBootstrapHotkeys()`, destroy it in `destroySettingsOwnership()`, and remount it during `createParticleExperience()`. Guard against duplicate DOM, duplicate listeners, and stale ParticleNetwork instances.

**Step 2: Build semantic controls**

Create a fixed `nav` or `div` with an accessible label, two real buttons for black and white hole tokens, and a `- / count / +` control. Give every button a concise `aria-label`; keep the compact visible treatment icon-led. Do not inject inline styles.

**Step 3: Implement palette drag placement**

On a hole token's pointerdown, capture the pointer, begin an existing gravity-well draft at the mobile-only 60 px default radius, and update the draft from window pointer moves mapped into canvas coordinates. On release inside the canvas, commit one well at the drop point. On release outside the canvas or on cancellation, cancel the draft. Suppress the canvas attract/repel gesture for this pointer sequence.

Add small public placement wrappers to `ParticleNetwork.js` if needed; do not make the UI module depend directly on underscore-prefixed private methods.

**Step 4: Implement count buttons**

Calculate the mobile target as 25 percent of the current count with a minimum absolute step of 16, then call `pn.setParticleCount(target)`. Start repeat only after a 450 ms hold, repeat every 180 ms, and stop on pointerup, pointercancel, lost capture, blur, visibility change, or destroy. Subscribe to `particle-count-change` for the readout.

**Step 5: Style the palette in the existing visual language**

Use the existing black surface, white/code-oriented typography, and gravity-well colors. Position at:

```css
top: calc(12px + env(safe-area-inset-top));
right: calc(12px + env(safe-area-inset-right));
```

Use a touch-primary media query rather than a portrait-only width breakpoint. Keep idle opacity low but controls readable, restore opacity on `:hover`, `:focus-within`, `.is-active`, and touch activity, and provide a reduced-motion override. Keep the palette below `#tp-container` and above the canvas.

**Step 6: Verify palette behavior**

Run:

```powershell
rtk node scripts/test-mobile-controls.js http://127.0.0.1:8000 --section palette
```

Expected: PASS in portrait and landscape touch contexts; controls remain hidden in the desktop context.

### Task 5: Reuse Randomization Without Changing Keyboard R

**Files:**

- Modify: `js/ui/pane.js:669-718`
- Modify: `js/ui/pane.js:801-804`
- Modify: `js/ui/pane.js:1017`
- Test: `scripts/test-mobile-controls.js`

**Step 1: Parameterize the existing randomizer**

Change `randomizeVisualParams()` to accept an options object with `preserveParticleSize: false` by default. Skip only the `PARAMS.particleSize = randInt(1, 6)` assignment when preservation is requested; keep every other existing randomization rule and `applyParamsToNetwork()`/refresh behavior unchanged.

**Step 2: Connect the mobile event through pane ownership**

Pass an action to `mountMobileControls` that invokes the lazy pane action as `ui.randomizeVisualParams({ preserveParticleSize: true })`. The gesture handler should not duplicate randomization logic inside `ParticleNetwork.js`.

**Step 3: Preserve keyboard behavior**

Keep the `R` hotkey and Randomize button calling the default mode, so both continue to randomize particle size exactly as before.

**Step 4: Verify both paths**

Extend the test to prove that mobile three-finger randomization preserves size/count and keyboard `R` can still change size across deterministic or repeated trials.

### Task 6: Full Regression and Visual Verification

**Files:**

- Verify: `scripts/test-mobile-controls.js`
- Verify: `scripts/test-gravity-wells.js`
- Verify: `scripts/test-destroy-lifecycle.js`
- Verify: `scripts/test-p0-2-resize.js`
- Verify: `scripts/test-startup-loads.js`

**Step 1: Run syntax checks**

Run:

```powershell
rtk node --check js/ui/mobileControls.js
rtk node --check js/ui/pane.js
rtk node --check scripts/test-mobile-controls.js
```

Expected: all commands exit 0.

**Step 2: Run focused and existing browser suites**

Run:

```powershell
rtk node scripts/test-mobile-controls.js http://127.0.0.1:8000 --screenshot-dir .playwright-mcp/mobile-controls
rtk node scripts/test-gravity-wells.js http://127.0.0.1:8000
rtk node scripts/test-destroy-lifecycle.js http://127.0.0.1:8000
rtk node scripts/test-p0-2-resize.js http://127.0.0.1:8000
rtk node scripts/test-startup-loads.js http://127.0.0.1:8000 --require-manifest
```

Expected: all suites pass with no browser errors, context loss, stale timers, duplicate controls, or request failures.

**Step 3: Inspect representative phone layouts**

Capture and inspect at least:

- 390 by 844 portrait at DPR 2;
- 844 by 390 landscape at DPR 2;
- a notched/safe-area emulation if available;
- reduced motion;
- WebGL fallback;
- Tweakpane open over the top-right controls.

Confirm the palette is subtle when idle, legible when active, reachable by thumb, clear of safe-area insets, and does not hide the gravity-well strength/radius labels at common drop points.

**Step 4: Verify desktop parity**

At 1280 by 720, verify no mobile palette is visible and retest mouse attraction/repulsion, wheel count adjustment, wheel well strength/radius adjustment, `B`, `W`, `R`, `C`, `Delete`, and `Escape`.

**Step 5: Review the final diff without publishing**

Run:

```powershell
rtk git diff --check
rtk git status --short
rtk git diff -- js/ParticleNetwork.js js/ParticleLifecycle.js js/ui/pane.js js/ui/mobileControls.js css/style.css scripts/test-mobile-controls.js
```

Expected: only the planned additions plus the user's pre-existing edits are present. Do not stage, commit, or push until separately requested.

## Acceptance Criteria

- On touch-primary mobile, one finger visibly pulls particles inward and two fingers visibly push them outward.
- A visitor can drag either hole token from the top-right palette, drop it once, and keep the resulting hole after releasing.
- Existing holes support one-finger move, dead-zone-protected two-axis second-finger radius/speed adjustment, and 700 ms hold plus vertical strength adjustment without accidental mode switching.
- Dragging an existing hole onto its matching phone palette icon clearly marks the delete target and removes the hole on release.
- Phone wells limit their attraction or repulsion to twice their visible radius; desktop wells retain the existing unbounded falloff.
- Three-finger tap randomizes the same visual family as `R` while preserving particle size and count.
- Particle count has explicit, understandable, repeatable phone controls and the displayed count stays synchronized.
- All mobile gesture paths clean up on release, cancellation, blur, hidden document, destroy, and recreate.
- The palette is phone/touch-primary only, safe-area aware, accessible, restrained, and visually subordinate to the particle canvas.
- Existing desktop pointer, wheel, keyboard, Tweakpane, reduced-motion, Trails, WebGL fallback, resize/DPR, and lifecycle behavior remains intact.

## Primary Risks

- Pointer-event priority is the highest risk. Gravity-well gestures, three-finger recognition, and empty-canvas forces must share one owner so capture-phase handlers cannot leave the bubble-phase force map stale.
- The existing force property names do not match physical direction. Tests must measure actual movement to prevent another semantic inversion.
- Long-press and drag compete by nature. The 10-pixel movement threshold and 700 ms timer must be deterministic and fully cancelled on every exit path.
- Current runtime and gravity-well tests have substantial uncommitted work. Implementation must patch around that work rather than replacing whole functions or test sections.
