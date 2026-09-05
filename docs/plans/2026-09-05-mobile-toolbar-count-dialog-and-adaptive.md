# Mobile Toolbar, Exact Count, and Adaptive Detail Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task.

**Goal:** Make the phone controls compact, support safe exact particle-count entry by long press, and enable Adaptive Line Detail by default on phone-class coarse-pointer layouts without changing desktop defaults.

**Architecture:** Keep all phone-toolbar behavior and lifecycle ownership in `mobileControls.js`, with presentation in the existing coarse-pointer CSS block. Add a mobile-only contextual default in `Config.js`; do not force the setting after startup or change the global desktop default. Extend browser tests first, then implement the smallest production changes.

**Tech Stack:** Vanilla JavaScript modules, CSS media queries, HTML dialog/form controls, Canvas/WebGL runtime, Node.js and Playwright regression scripts.

---

## Approved Interaction Contract

- The current phone toolbar measures about 160 by 108 CSS pixels at both 390 by 844 portrait and 844 by 390 landscape sizes.
- Phone toolbar becomes one horizontal strip: black hole, white hole, separator, minus, count, plus.
- Every interactive target remains at least 44 by 44 CSS pixels. The toolbar should be approximately 236-240px wide and 52-56px tall, with a very-narrow fallback only when the full strip cannot fit.
- Existing phone opacity, safe-area placement, well palette drag, drag-back deletion, landscape behavior, and desktop hiding remain unchanged.
- The count is a real button containing the existing live `<output>`. A short tap does nothing; holding for 550ms and releasing without moving more than 12 CSS pixels opens an exact-count dialog.
- Keyboard Enter or Space on the count button opens the dialog immediately.
- The dialog uses a numeric keyboard hint but validates in JavaScript. Leading and trailing spaces are trimmed. Only ASCII digits are accepted; empty input, signs, decimals, exponents, letters, and internal whitespace are rejected.
- Accepted range is 16 through 5,000 inclusive. The same bounds apply to exact entry and the held minus/plus controls.
- Invalid input leaves the dialog open, shows an inline error, and does not change the simulation. OK or Enter submits valid input; Cancel, Escape, or backdrop dismissal changes nothing.
- `Adaptive Line Detail` defaults to on when the startup environment matches `(hover: none) and (pointer: coarse)`. Desktop remains off by default, and an explicit caller-provided boolean always wins.
- Phone detection is startup-only. Do not dynamically override a user who turns Adaptive Line Detail off during the current session.

## Task 1: Lock the Behavior With Failing Tests

**Files:**
- Modify: `scripts/test-mobile-controls.js`
- Modify only if needed for explicit option coverage: `scripts/test-adaptive-lines.js`

1. Add toolbar geometry assertions in the phone palette test:
   - The toolbar uses one row.
   - Its normal-phone height is at most 56 CSS pixels and width is at most 240 CSS pixels.
   - Black, white, minus, count, and plus controls each have a 44 by 44 minimum hit area.
   - The space between the well bank and count controls is at most 4 CSS pixels, excluding the visual separator.
   - The toolbar remains inside portrait and landscape safe-area bounds.

2. Preserve existing palette behavior assertions:
   - Dragging black and white wells still places the correct type.
   - Dragging a well back to its source still deletes it.
   - The live count remains queryable through `[data-mobile-particle-count]`.

3. Add deterministic long-press coverage:
   - A short tap does not open the dialog.
   - Movement beyond 12 CSS pixels before release cancels the hold.
   - A hold of at least 550ms followed by release opens exactly one dialog.
   - Pointer cancel, lost capture, blur, hidden visibility, and destroy cancel pending holds.
   - Enter and Space open the dialog for keyboard users.

4. Assert the input contract:
   - `inputmode="numeric"`, `pattern="[0-9]*"`, `enterkeyhint="done"`, and autocomplete disabled.
   - Reject `""`, whitespace-only, `abc`, `1e3`, `12.5`, `-20`, `+20`, `1 20`, `15`, and `5001`.
   - Accept `" 256 "` as exactly 256.
   - Invalid submission keeps the dialog open with an accessible inline error and leaves the count unchanged.
   - Valid changed submission calls the normal count update path once, refreshes the output, closes the dialog, and restores focus to the trigger.
   - Submitting the existing count may close without an event because `setParticleCount()` intentionally returns early for unchanged values.
   - Cancel, Escape, and backdrop dismissal leave the count unchanged.

5. Extend repeat-button coverage so held minus/plus stops at 16 and 5,000, disables the corresponding button at its boundary, and stops all timers on release, cancellation, blur, hidden visibility, or destroy.

6. Add contextual-config assertions:
   - Coarse-pointer phone startup with no explicit option gets `adaptiveLineDetail === true`.
   - Desktop startup with no explicit option remains false.
   - Explicit false on phone remains false.
   - Explicit true on desktop remains true.

7. Run the focused suites and confirm the new assertions fail against unchanged production code:

```powershell
rtk node scripts/test-mobile-controls.js http://127.0.0.1:8000
rtk node scripts/test-adaptive-lines.js http://127.0.0.1:8000 --headless
```

## Task 2: Compact the Phone Toolbar

**Files:**
- Modify: `js/ui/mobileControls.js`
- Modify: `css/style.css`

1. Keep the existing root and well-bank structure, but make the coarse-pointer toolbar a horizontal flex row with 2px internal spacing and 2px outer padding. Add a very-narrow media fallback below the width required by the complete strip rather than shrinking touch targets.

2. Remove the nested particle-count row padding/background that currently creates a second bulky block. Add only a subtle divider between the well bank and count group, without reducing any hit target.

3. Replace the bare count output with a 44 by 44 button containing the existing `<output data-mobile-particle-count>`:

```html
<button class="mobile-particle-count-trigger"
        type="button"
        aria-haspopup="dialog"
        aria-controls="mobile-particle-count-dialog">
  <output data-mobile-particle-count>...</output>
</button>
```

4. Update the trigger's accessible label whenever `particle-count-change` refreshes the visible count.

5. Verify the Task 1 geometry and existing palette tests pass before adding dialog behavior.

## Task 3: Add Safe Exact Count Entry

**Files:**
- Modify: `js/ui/mobileControls.js`
- Modify: `css/style.css`
- Test: `scripts/test-mobile-controls.js`

1. Add `MOBILE_MAX_PARTICLE_COUNT = 5000` beside the existing minimum and clamp `stepCount()` to the same range. Keep the existing proportional step size and repeat timing.

2. Create one custom `<dialog>` owned by `mountMobileControls()` and append it to `document.body`, not inside the toolbar. Include:
   - A labeled text input.
   - Inline `role="alert"` validation feedback.
   - Cancel and OK buttons in a form using `method="dialog"` only where it does not bypass validation.

3. Configure the input as:

```html
<input type="text"
       inputmode="numeric"
       pattern="[0-9]*"
       enterkeyhint="done"
       autocomplete="off"
       spellcheck="false">
```

`type="text"` is deliberate: `type="number"` commonly permits exponent notation and signs. The keyboard hint is best-effort and remains OS/browser dependent.

4. Implement long-press state local to the mounted controls:
   - Record pointer id, origin, and start time on primary pointer down.
   - Arm after 550ms.
   - Cancel when movement exceeds 12 CSS pixels.
   - Open on pointer up only if armed, keeping dialog focus/opening tied to a trusted user gesture.
   - Suppress duplicate click activation after a completed hold.

5. Validate on submit with the equivalent of:

```js
const trimmed = input.value.trim();
const validDigits = /^\d+$/.test(trimmed);
const count = validDigits ? Number(trimmed) : NaN;
const validCount = Number.isSafeInteger(count)
  && count >= MOBILE_MIN_PARTICLE_COUNT
  && count <= MOBILE_MAX_PARTICLE_COUNT;
```

6. On success, call `pn.setParticleCount(count)` exactly once and rely on the existing `particle-count-change` event to synchronize the output. If the value is unchanged, close normally without requiring an event. On failure, keep focus in the input and leave the simulation untouched.

7. Extend `destroy()` to clear hold/repeat timers, remove all trigger/dialog listeners, close and remove the dialog, and leave no duplicate controls after remounting.

## Task 4: Default Adaptive Line Detail On for Phone Layouts

**Files:**
- Modify: `js/Config.js`
- Test: `scripts/test-mobile-controls.js`
- Verify: `scripts/test-adaptive-lines.js`

1. Keep `DEFAULT_CONFIG.adaptiveLineDetail` false. This preserves the public desktop default and existing configuration contract.

2. In `createRuntimeConfig(userOptions, ...)`, resolve the runtime value in this order:
   - If `userOptions.adaptiveLineDetail` is explicitly boolean, use it.
   - Otherwise use `window.matchMedia('(hover: none) and (pointer: coarse)').matches` when available.
   - Otherwise fall back to the existing false default.

3. Do not set this from `mountMobileControls()`, add persistence, or add a media-query change listener. Those approaches would unexpectedly override explicit configuration or a user's in-session Tweakpane choice.

4. Confirm the existing Tweakpane binding reads the runtime value and needs no production change in `js/ui/pane.js` or `js/ui/applyParams.js`.

5. Run both focused suites and verify phone/desktop and explicit-override cases.

## Task 5: Regression, Visual Review, and Publish

**Files:**
- Review only: `js/ParticleNetwork.js`
- Review only: `js/ParticleLifecycle.js`
- Review only: `js/ui/pane.js`
- Review only: `js/ui/applyParams.js`

1. Run syntax and whitespace checks:

```powershell
rtk node --check js/ui/mobileControls.js
rtk node --check js/Config.js
rtk node --check scripts/test-mobile-controls.js
rtk node --check scripts/test-adaptive-lines.js
rtk git diff --check
```

2. Run regression suites:

```powershell
rtk node scripts/test-mobile-controls.js http://127.0.0.1:8000
rtk node scripts/test-adaptive-lines.js http://127.0.0.1:8000 --headless
rtk node scripts/test-gravity-wells.js http://127.0.0.1:8000
rtk node scripts/test-selection-clipboard.js http://127.0.0.1:8000
rtk node scripts/test-destroy-lifecycle.js --url http://127.0.0.1:8000 --expect optimized
rtk node scripts/test-p0-2-resize.js http://127.0.0.1:8000
rtk node scripts/test-startup-loads.js --url http://127.0.0.1:8000 --require-manifest
```

3. Visually inspect portrait and landscape phone viewports at DPR 2:
   - Toolbar compactness and safe-area placement.
   - Black/white drag and drag-back deletion.
   - Dialog before and after the virtual keyboard opens.
   - Invalid error, valid submit, Cancel, and focus restoration.
   - Adaptive Line Detail shown as enabled if the settings pane is opened.

4. Confirm desktop toolbar visibility and default Adaptive Line Detail are unchanged.

5. Stage only the intended files, commit the complete feature, push `master`, and verify local and remote refs match:

```powershell
rtk git add js/ui/mobileControls.js css/style.css js/Config.js scripts/test-mobile-controls.js scripts/test-adaptive-lines.js docs/plans/2026-09-05-mobile-toolbar-count-dialog-and-adaptive.md
rtk git commit -m "feat: compact mobile particle controls"
rtk git push origin master
rtk git rev-parse HEAD
rtk git rev-parse origin/master
rtk git ls-remote origin refs/heads/master
```

## Risks and Guardrails

- A numeric keyboard cannot be guaranteed across every mobile OS; `inputmode` is only a hint, so strict submit validation is mandatory.
- Adaptive Line Detail reduces line-rendering work, but 5,000 particles can still be expensive on a phone. The cap prevents pathological allocation, not poor performance on weak hardware.
- Keep hold and repeat state separate so holding the count never triggers minus/plus repetition or an accidental click.
- A body-level dialog must be removed on teardown to avoid stale focus traps, timers, or duplicate IDs after remount.
- Keep the existing output selector and event-driven refresh path so current tests and other code do not silently break.
- Recheck palette drag-back deletion after changing toolbar bounds; deletion uses the controls' geometry.
- Do not dynamically toggle Adaptive Line Detail when pointer media changes, because that could overwrite an explicit or in-session user choice.
