# Pure-Physics Safe Black-Hole Orbits Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent black holes from holding particles at their centers or deep inside their visible halos when Orbit Assist is disabled, while retaining natural attraction and orbital motion outside the halo.

**Architecture:** Replace the black hole's always-inward radial component with a smooth signed radial profile whose zero-force shell sits just outside the rendered aura. Inside that shell the radial component points outward; outside it remains attractive. Keep the tangential spin term, white-hole force, authored strengths, global force multiplier, acceleration cap, and Orbit Assist controller independent and unchanged.

**Tech Stack:** Vanilla JavaScript, typed-array particle runtime, Playwright browser tests, Node.js assertions.

---

### Task 1: Specify the isolated force contract

**Files:**
- Modify: `scripts/test-gravity-wells.js`

**Step 1: Write the failing tests**

- Sample an isolated black hole outside the safe shell and assert inward acceleration.
- Sample it inside the visible halo and assert outward acceleration with the same spin direction.
- Seed a stationary particle at the exact center and assert a finite, deterministic escape impulse without deleting or rebuilding particles.
- Retain the existing white-hole, signed-strength, force-multiplier, acceleration-cap, and overlap assertions.

**Step 2: Run the test to verify it fails**

Run: `rtk node scripts/test-gravity-wells.js --url http://127.0.0.1:8765/`

Expected: FAIL because the current black radial force always points inward and exact-center force is skipped.

### Task 2: Specify the catalogue-wide pure-physics contract

**Files:**
- Modify: `scripts/test-gravity-well-preset-orbit-size.js`

**Step 1: Add a raw-physics audit**

- Disable Orbit Assist before applying each of the 96 presets.
- Evolve deterministic particles through the real `_updateSoA` path.
- Measure visible-halo residence, deep-halo residence, stationary-in-halo streaks, moving fraction, and minimum normalized black-hole distance.
- Assert the controller never runs, buffers and wells are unchanged, all values remain finite, and no preset can hold particles deep and stationary near a black-hole center.

**Step 2: Run the test to verify it fails**

Run: `rtk node scripts/test-gravity-well-preset-orbit-size.js http://127.0.0.1:8765/`

Expected: FAIL for the strong cage/trap presets under raw physics.

### Task 3: Implement the safe black-hole potential

**Files:**
- Modify: `js/ParticleNetwork.js`

**Step 1: Add focused constants and a radial-profile helper**

- Define one safe-orbit radius relative to the physical well radius and rendered `1.65x` aura.
- Use a continuous profile such as `(distanceSquared - shellSquared) / (distanceSquared + shellSquared)` so the force reverses smoothly instead of snapping at the boundary.

**Step 2: Apply the profile only to effective black wells**

- Multiply only the radial component by the signed profile.
- Keep the tangential spin component continuous and in the configured direction.
- Leave effective white wells byte-for-byte equivalent.
- At an exact black-hole center, use a deterministic per-particle/per-well direction so a zero-velocity particle cannot remain there.

**Step 3: Run focused tests**

Run:
- `rtk node scripts/test-gravity-wells.js --url http://127.0.0.1:8765/`
- `rtk node scripts/test-gravity-well-preset-orbit-size.js http://127.0.0.1:8765/`

Expected: PASS with no controller activity in the pure-physics audit.

### Task 4: Verify interactions and presentation

**Files:**
- Modify only if a regression is found in an already-touched file.

**Step 1: Run regression suites**

Run:
- `rtk node scripts/test-gravity-well-presets.js http://127.0.0.1:8765/`
- `rtk node scripts/test-gravity-well-preset-physics.js http://127.0.0.1:8765/`
- `rtk node scripts/test-gravity-well-preset-browser.js http://127.0.0.1:8765/`
- `rtk node scripts/test-physics-reset.js http://127.0.0.1:8765/`
- `rtk node scripts/test-mobile-controls.js http://127.0.0.1:8765/`
- `rtk node scripts/test-startup-gravity-well.js --url http://127.0.0.1:8765/`
- `rtk node scripts/test-visibility-lifecycle.js --url http://127.0.0.1:8765/ --expect optimized`
- `rtk node scripts/test-destroy-lifecycle.js --url http://127.0.0.1:8765/ --expect optimized`

Expected: PASS with white repulsion, Orbit Assist, mobile containment, fallback rendering, reset, and lifecycle behavior intact.

**Step 2: Visually review representative presets**

- Capture Cross Cage, Split Cage, Twin Cages, Six Pockets, and Diagonal Weave with Orbit Assist off.
- Confirm particles remain visible outside black-hole halos and continue moving without a hard positional snap.

### Task 5: Publish the scoped change

**Files:**
- Stage only the plan, runtime, and related regression tests.

**Step 1: Validate the diff**

Run:
- `rtk git diff --check`
- `rtk node --check js/ParticleNetwork.js`
- `rtk node --check scripts/test-gravity-wells.js`
- `rtk node --check scripts/test-gravity-well-preset-orbit-size.js`

Expected: all commands exit zero.

**Step 2: Commit and push**

Run:
- `rtk git add docs/plans/2026-09-11-pure-physics-safe-black-hole-orbits.md js/ParticleNetwork.js scripts/test-gravity-wells.js scripts/test-gravity-well-preset-orbit-size.js scripts/test-gravity-well-preset-physics.js scripts/test-gravity-well-preset-browser.js scripts/test-mobile-controls.js`
- `rtk git commit -m "fix(wells): keep particles outside black cores"`
- `rtk git push origin master`

**Step 3: Verify delivery**

Run:
- `rtk git fetch origin master`
- `rtk git rev-parse HEAD`
- `rtk git rev-parse origin/master`
- `rtk git status --short`

Expected: local and remote hashes match and the working tree is clean.
