# Gravity-well preset library

Open **Controls → Wells → Browse Presets** to search 48 arrangements in eight families. Select an entry to inspect its diagram, then choose **Apply Preset**. Selection alone leaves the canvas unchanged. Black holes use dark fills and outlines; white holes use light fills. Names describe well arrangements rather than guaranteed particle silhouettes.

Applying replaces the well collection in one Undo action. **Use recommended motion** starts checked and changes only speed, spin, global well force, acceleration limiting, and curved drift. Turning it off preserves current physics. Neither choice changes particle positions, velocities, count, colors, lines, or particle-to-particle settings at application time.

The Wells pane exposes **Spacing** (60–140%), **Rotation** (0–360°), and **Strength** (25–200%). Each completed slider gesture adds one Undo entry and retains well IDs. Moving, adding, deleting, resizing, changing individual strength, or reversing a well makes the arrangement **Custom**. Recoloring retains ownership. **Reapply Preset** regenerates the last recipe at its default layout settings while preserving current motion.

Untouched arrangements reflow on resize and phone rotation. Axial layouts follow the longer canvas dimension; other geometry uses a common scale. Reset clears the last/active preset, and reload starts normally. No preset state is persisted.

## Implementation

- `js/GravityWellPresets.js`: immutable deterministic recipes, motion profiles, and a pure `resolve(id, options)` shared by SVG previews and placement. Classic browser global plus CommonJS export for geometry tests.
- `js/ParticleNetwork.js`: `applyGravityWellPreset(id, {useRecommendedMotion})` and `updateGravityWellPreset({spacing, rotation, strength}, {last})`. Percent values use 100 as their default. `last:false` continues a slider gesture; `last:true` completes it.
- `js/ui/gravityWellPresetBrowser.js` and `js/ui/pane.js`: native modal, search/filter, roving keyboard focus, focus restoration, preview, and live pane integration.

The fit includes safe-area insets, the compact button bank, and a conservative `1.65 × radius + 3px` visual extent. Radius limits are incorporated into one common fit calculation. Maximum spacing is reserved so changing separation does not shrink well radii. No generated center is snapped or individually clamped. Catalogue radius coefficients were reviewed on desktop and emulated touch; no additional device-specific strength or radius coefficients were needed.

Undo restores replaced wells, IDs, selection, preset ownership, and changed motion settings without rewinding particle trajectories. Deleting a well, rotating/resizing the viewport, then undoing restores ownership and reflows the recovered arrangement. Influence snapshots are invalidated on geometry changes and refreshed on application/completed input when expanded information is enabled; redraws never initiate these scans. Browsing only builds DOM/SVG and performs no simulation updates.

## Verification (2026-09-09)

Use a static server; live-reload timers contaminate lifecycle checks.

```powershell
rtk proxy python -m http.server 8137 --bind 127.0.0.1
```

In another shell:

```powershell
rtk proxy node scripts/test-gravity-well-preset-geometry.js
rtk proxy node scripts/test-gravity-well-presets.js http://127.0.0.1:8137 C:\Temp\preset-review
rtk proxy node scripts/test-gravity-well-preset-browser.js http://127.0.0.1:8137 C:\Temp\preset-browser
```

The geometry suite covers all 48 exact well/type counts, recipe geometry, symmetry, distinct configurations, determinism, immutability, axial orientation, and CSS-pixel invariance: **18,144 fit cases and 163,554 geometry assertions**. Viewports include desktop, ultrawide, square, portrait phone, and landscape phone, with slider and radius-limit combinations.

The runtime suite covers 46 state assertions, five viewport reflows, and 80 evolved cases. Visual review covered every desktop arrangement after 240 physics steps with 900 seeded particles, then eight family representatives on emulated touch, Trails, reduced motion, and forced Canvas fallback. Optional artifacts include all captures, eight desktop contact sheets, and `results.json`. Canvas fallback checks actual nonblack pixels in the main particle canvas, not just the well overlay. Browser automation uses installed Edge; mobile checks emulate touch and DPR rather than using physical phones.

The browser suite verifies search/filtering, keyboard selection, focus restoration, modal hotkey isolation, scrolling, 44px touch targets, preview/placement correspondence, motion settings, Apply/Undo, an actual multistep slider drag, Custom/Reapply/Reset, and destroy/recreate cleanup. Existing gravity, selection, mobile, resize, startup, visibility, and destruction suites also pass.

Baseline repairs included with this feature:

- Gravity tests expected obsolete grid targets and omitted draft metadata. Capture tests now sample activation synchronously (zero displacement required) and track a fixed particle cohort when measuring pull.
- Startup checks now assert the exact local script order, including the catalogue before runtime, instead of a stale count that also included external analytics.
- Failed WebGL initialization previously retained a renderer with `gl:null`, sending particle drawing to no-op methods. Disposing that disabled renderer activates the existing Canvas drawing path.

Physics cost measurements are recorded in `OPTIMIZATION.md`. The underlying force laws are unchanged.
