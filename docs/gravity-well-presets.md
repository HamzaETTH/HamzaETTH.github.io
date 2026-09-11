# Gravity-well preset library

Open **Controls → Wells → Browse Presets** to search 120 arrangements in 15 families. Select an entry to inspect its diagram, then choose **Apply Preset**. Selection alone leaves the canvas unchanged. Black holes use dark fills and outlines; white holes use light fills. Names describe well arrangements rather than guaranteed particle silhouettes.

Applying replaces the well collection in one Undo action. **Use recommended motion** starts checked and changes only speed, spin, all-wells force, acceleration limiting, and curved drift. Every preset recommends 60% all-wells force; turning recommended motion off preserves the current value. The original 48 arrangements gather existing particles once at the center when applied. The new scattered/wide/distributed presets spread existing particles deterministically across the usable canvas on initial apply, while preserving count, velocities, colors, sizes, lines, and particle-to-particle settings. Later preset slider edits and viewport reflows do not redistribute particles.

The Wells pane exposes **Spacing** (60–140%), **Rotation** (0–360°), and **Strength** (25–200%). Each completed slider gesture adds one Undo entry and retains well IDs. Moving, adding, deleting, resizing, changing individual strength, or reversing a well makes the arrangement **Custom**. Recoloring retains ownership. **Reapply Preset** regenerates the last recipe at its default layout settings while preserving current motion.

Untouched arrangements reflow on resize and phone rotation. Axial layouts follow the longer canvas dimension; other geometry uses a common scale. Reset clears the last/active preset, and reload starts normally. No preset state is persisted.

**Reset Physics** in **Controls → Main → Actions** restores interaction, collision, speed, boundary, curved-drift, pointer-force, capture, and global well-physics settings without rebuilding the particle scene. An intact active preset restores its recommended motion profile; custom arrangements use the physics captured when the pane opened. Particle count, positions, velocities, appearance, wells, individual strengths, selection, and preset ownership are preserved. Decorative well motion, Adaptive Line Detail, and performance controls are unchanged.

Trap presets use a zero-spin, no-curved-drift recommended profile so the preset itself does not inject rotational energy. The static balance check is:

```text
blackWeight = sum(black strength * radius^2)
whiteWeight = sum(white strength * radius^2)
```

For trap recipes, `blackWeight` must exceed `whiteWeight`, and the authored strengths are tuned so `blackWeight` is above `1.5 * whiteWeight` for the symmetric cages. The physics audit then samples the actual softened runtime force on each canvas edge and rejects any audited trap with outward boundary acceleration. This is a conservative indicator, not a universal proof that a particle can never touch the edge: inherited velocity, mobile geometry, and external particle forces can still push particles into bounce correction.

For one well, the runtime radial acceleration magnitude before the optional acceleration cap is:

```text
softening = max(12, 0.12 * radius)
acceleration = 0.012 * abs(strength) * radius^2 * globalForce
               / (distance^2 + softening^2)
```

White wells point that vector outward. Black wells attract outside their `1.8 × radius` safe shell and reverse smoothly inside it; the inner core adds a stronger escape term so overlapping fields cannot hold a particle at the center. Spin adds a perpendicular component, and all well vectors are summed before the acceleration limit is applied. There is no single exact launch threshold for the complete simulation because inherited velocity, damping, multiple vectors, mobile influence ranges, particle forces, and boundary mode all contribute. The weight ratio and sampled edge field are therefore authoring gates: they identify outward-biased traps before the actual integrator audit checks trajectories.

Adaptive Line Detail now has an automatic controller. On desktop, it starts off, watches live frame timing after a two-second startup grace, and turns itself on after two consecutive one-second windows below 30 FPS. It shows a 1.5 second toast: **Adaptive Line Detail enabled — low FPS.** If it was enabled by the controller, five consecutive one-second windows above 40 FPS turn it off silently. Manual checkbox changes win until Reset or reload. Touch/mobile still starts with Adaptive Line Detail on. When Adaptive Line Detail is active, a separate first-frame density guard predicts spatial-grid pair work. A catastrophic particle band temporarily renders every particle without connection lines, then restores lines after 12 safely sparse frames. It does not move particles or change pair-force physics.

## Implementation

- `js/GravityWellPresets.js`: immutable deterministic recipes, motion profiles, and a pure `resolve(id, options)` shared by SVG previews and placement. Classic browser global plus CommonJS export for geometry tests.
- `js/ParticleNetwork.js`: `applyGravityWellPreset(id, {useRecommendedMotion})` and `updateGravityWellPreset({spacing, rotation, strength}, {last})`. Percent values use 100 as their default. `last:false` continues a slider gesture; `last:true` completes it.
- `js/ui/gravityWellPresetBrowser.js` and `js/ui/pane.js`: native modal, search/filter, roving keyboard focus, focus restoration, preview, and live pane integration.
- `js/ui/applyParams.js` and `js/ui/pane.js`: physics-only reset application, pane synchronization, automatic Adaptive Line Detail lifecycle, manual override tracking, visibility pause/resume, full Reset integration, and teardown.

The fit includes safe-area insets, the compact button bank, and separate artwork and particle clearances. Artwork uses `1.65 × radius + 3px`; layout reserves `2.805 × radius + 3px` on desktop and the complete `2 × radius + 3px` mobile influence envelope. Orbit Assist keeps its independent target ratios, while pure physics shares the `1.8 × radius` black-hole safe shell. Radius limits are incorporated into one common fit calculation. Maximum spacing is reserved so changing separation does not shrink well radii. Uniform layouts keep one x/y scale. Wide layouts keep circular wells but let x and y center spacing expand independently, which fills wide, square, and phone canvases without clipping the particle envelope. No generated center is snapped or individually clamped. Catalogue radius coefficients were reviewed on desktop and emulated touch; no additional device-specific strength or radius coefficients were needed.

Undo restores replaced wells, IDs, selection, preset ownership, and changed motion settings without rewinding particle trajectories. Deleting a well, rotating/resizing the viewport, then undoing restores ownership and reflows the recovered arrangement. Influence snapshots are invalidated on geometry changes and refreshed on application/completed input when expanded information is enabled; redraws never initiate these scans. Browsing only builds DOM/SVG and performs no simulation updates.

## Verification (2026-09-11)

Use a static server; live-reload timers contaminate lifecycle checks.

```powershell
rtk proxy python -m http.server 8137 --bind 127.0.0.1
```

In another shell:

```powershell
rtk proxy node scripts/test-gravity-well-preset-geometry.js
rtk proxy node scripts/test-gravity-well-presets.js http://127.0.0.1:8137 C:\Temp\preset-review
rtk proxy node scripts/test-gravity-well-preset-browser.js http://127.0.0.1:8137 C:\Temp\preset-browser
rtk proxy node scripts/test-physics-reset.js http://127.0.0.1:8137 C:\Temp\physics-reset
rtk proxy node scripts/test-gravity-well-preset-physics.js http://127.0.0.1:8137
rtk proxy node scripts/test-auto-adaptive-line-detail.js --url http://127.0.0.1:8137
rtk proxy node scripts/benchmark-auto-adaptive-lines.js http://127.0.0.1:8137
```

The geometry suite covers all 120 exact well/type counts, recipe geometry, symmetry, distinct configurations, determinism, immutability, trap metadata, wide-layout scaling, axial orientation, particle envelopes, and CSS-pixel invariance: **45,360 fit cases and 1,782,871 geometry assertions**. The 24 latest recipes are additionally compared as signed 64×64 influence maps under rotation and reflection; no pair may exceed 0.92 similarity. Viewports include desktop, ultrawide, square, portrait phone, and landscape phone, with slider and radius-limit combinations.

The runtime suite covers 51 state assertions, five viewport reflows, and 180 evolved cases. Visual review covered every desktop arrangement after 240 physics steps with 1,000 seeded particles, then one representative per family on emulated touch, Trails, reduced motion, and forced Canvas fallback. Optional artifacts include all captures, desktop contact sheets, and `results.json`. Canvas fallback checks actual nonblack pixels in the main particle canvas, not just the well overlay. Browser automation uses installed Edge; mobile checks emulate touch and DPR rather than using physical phones.

The browser suite verifies search/filtering, all 15 family options, deterministic Random Preset reachability for every new recipe, keyboard selection, focus restoration, modal hotkey isolation, scrolling, 44px touch targets, preview/placement correspondence, motion settings, Apply/Undo, an actual multistep slider drag, Custom/Reapply/Reset, and destroy/recreate cleanup. The trap physics audit covers 16 trap presets across desktop plus focused ultrawide, square, and mobile viewports. The all-catalogue orbit audit covers 236 assisted desktop/touch cases plus every preset in pure physics, including black-core residence, movement, rotation, long stationary streaks, and unchanged particle/well storage. The auto-adaptive suite covers startup grace, low-FPS enable, high-FPS recovery, toast behavior, lazy pane sync, manual override, Reset, hidden/stopped-frame ignoring, config opt-out, teardown, and mobile defaults. Existing adaptive-line, startup, and mobile suites also pass.

Baseline repairs included with this feature:

- Gravity tests expected obsolete grid targets and omitted draft metadata. Capture tests now sample activation synchronously (zero displacement required) and track a fixed particle cohort when measuring pull.
- Startup checks now assert the exact local script order, including the catalogue before runtime, instead of a stale count that also included external analytics.
- Failed WebGL initialization previously retained a renderer with `gl:null`, sending particle drawing to no-op methods. Disposing that disabled renderer activates the existing Canvas drawing path.

Physics and dense-line cost measurements are recorded in `OPTIMIZATION.md`. Black-hole core repulsion and the assisted visible-halo escape term are intentionally stronger; white-hole force remains fully composed exactly once.
