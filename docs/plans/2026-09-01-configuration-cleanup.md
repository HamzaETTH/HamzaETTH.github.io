# Cycle 5: configuration cleanup

**Application baseline:** `4d024f9` (`docs: complete lifecycle teardown cycle`)

## Scope and isolation

This cycle removes duplicated runtime-default/fallback assembly while preserving the public Config defaults/presets and exact shipped runtime values and types. It stays separate from P1-4 because moving constructor code can affect V8 layout even when values are equivalent; its own A/B point must remain attributable.

## Plan

1. Capture deterministic snapshots of the shipped runtime options, option key order/types, public defaults, presets, `createConfig()` merges, and representative constructor overrides. Fix `Math.random` before page scripts so randomized color-method selection is comparable.
2. Commit that test-only fixture as the exact implementation checkpoint.
3. Add a Config-owned runtime option assembler that preserves the constructor's current property order, fallback operators, clamps/transforms, ignored unknown keys, and string `speed`/`density` inputs. The engine should delegate option construction to it rather than retain a second fallback map.
4. Do not convert strings to numbers, alter falsy/null handling, add unknown runtime keys, or change default/preset objects merely to make them look cleaner.
5. Run exact config equivalence plus settings restoration, lazy controls, recreation/teardown, visibility, pair/color, WebGL/error, and exact-preceding-tree quick FPS gates. Document and commit the isolated result.

## Gates

- Every shipped runtime option key, order, value, and JavaScript type matches exactly under deterministic random input.
- Representative null/falsy/string/number/boolean overrides produce the exact same runtime options.
- Existing `DEFAULT_CONFIG`, presets, and `createConfig()` outputs remain deep-equal for their existing contracts.
- Settings restoration and pane source values remain exact.
- No uncapped quick-gate average regresses more than 5%; confirm any crossing before deciding.
