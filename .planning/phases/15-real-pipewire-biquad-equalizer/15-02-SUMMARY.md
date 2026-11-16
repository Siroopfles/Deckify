---
phase: 15-real-pipewire-biquad-equalizer
plan: 02
subsystem: ui-equalizer
tags: [react, decky-ui, equalizer, spatial-navigation, vitest]
status: complete
requires:
  - phase: 15-real-pipewire-biquad-equalizer
    provides: EqualizerManager, set_eq_bands RPC, and 7-preset validation in main.py
provides:
  - 7-value EqualizerPreset union and eq_custom_bands on DeckifySettings in src/types.ts
  - 7-pill (2 horizontal Focusable rows) + 10-band ISO SliderField EQ UI in SettingsTab.tsx
  - Bypass (0.0 dB) / Preamp (-X.X dB) header indicator and preset-to-custom auto-fork
  - Vitest coverage for EQ preset rows, 10 ISO bands, preset click, and slider auto-fork
affects:
  - SettingsTab.tsx (QAM src/index.tsx kept untouched per D-08)
tech-stack:
  added: []
  patterns:
    - Two <Focusable flow-children="horizontal"> preset rows (4 + 3 pills) for GamepadUI D-pad navigation
    - Always-visible 10-band ISO SliderField stack with optimistic local state and set_eq_bands RPC
    - Preset-to-custom auto-fork on slider adjustment without deleting saved custom curve on Flat bypass
key-files:
  created: []
  modified:
    - src/types.ts
    - src/components/tabs/SettingsTab.tsx
    - src/components/tabs/SettingsTab.test.tsx
decisions:
  - "D-01/D-02/D-03: Rendered 7 preset pills across 2 horizontal Focusable rows (Flat, Bass Boost, Vocal Clarity, Gaming Balance / Deck Speakers, Late Night, Custom) and 10 always-visible ISO SliderFields (31 Hz-16 kHz, +/-12 dB, 0.5 dB step) with immediate preset-to-custom auto-fork"
  - "D-04/D-06: Added Bypass (0.0 dB) / Preamp: -X.X dB header indicator with -0.0 dB guard"
  - "D-08: Kept Quick Access Menu (src/index.tsx) untouched with zero EQ controls"
requirements-completed:
  - EQ-01
  - EQ-02
duration: 3min
completed: 2026-11-16
commits: 2
plan_head_before: d335e8f1fe44bee7a957d4a68f121f05e5928a14
plan_head_after: 9d6ae0829f5c19ce229b81a30f30d709ff69fcf8
actuals:
  tasks: 2
  commits: 2
---

# Phase 15 Plan 02: 7-Preset & 10-Band ISO Equalizer UI Summary

**7-preset (`Flat`..`Custom`) and always-visible 10-band ISO (`31 Hz`–`16 kHz`, `±12 dB`, `0.5 dB` step) graphic equalizer UI in `SettingsTab.tsx` with GamepadUI `flow-children="horizontal"` pill rows, `Bypass`/`Preamp` headroom indicator, and immediate preset-to-custom auto-fork.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-11-16T16:37:20Z
- **Completed:** 2026-11-16T16:40:40Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Expanded `EqualizerPreset` in `src/types.ts` to `"flat" | "bass" | "vocal" | "gaming" | "deck_speakers" | "late_night" | "custom"` and added `eq_custom_bands?: number[]` to `DeckifySettings`.
- Built the 7-pill + 10-band ISO EQ UI in `src/components/tabs/SettingsTab.tsx` with:
  - `backendSetEqBands` (`set_eq_bands`) callable and `EQ_PRESET_CURVES` matching `py_modules/equalizer.py`.
  - Two `<Focusable flow-children="horizontal">` preset rows (4 pills in Row 1, 3 pills in Row 2) with zero `flow-children="row"` containers.
  - Header status indicator showing `Bypass (0.0 dB)` when `flat` is active and `Preamp: -X.X dB` when a non-flat curve is active.
  - 10 always-visible `SliderField` controls (`31 Hz`–`16 kHz`, `min={-12}`, `max={12}`, `step={0.5}`, `showValue`) in a `<Focusable flow-children="column">` stack that immediately fork `localEqPreset` to `"custom"` and invoke `set_eq_bands` on adjustment.
  - Error toast fallback (`"Equalizer engine unavailable — routed directly to hardware output"`) when `set_setting` or `set_eq_bands` returns `{ ok: false }`.
  - Quick Access Menu (`src/index.tsx`) kept untouched per `D-08`.
- Added 4 Vitest unit tests in `src/components/tabs/SettingsTab.test.tsx` verifying the 2 horizontal preset rows, 10 ISO `SliderField` props, preset click & slider auto-fork RPC calls, and `Bypass` / `Preamp` header text.

## Task Commits

1. **Task 1: Expand EqualizerPreset types and build 7-pill + 10-band ISO EQ UI in SettingsTab.tsx** - `7c5f8c6` (feat)
2. **Task 2: Add Vitest unit tests for 7 EQ presets, 2 horizontal rows, and 10-band auto-fork in SettingsTab.test.tsx** - `9d6ae08` (test)

## Deviations from Plan

None - plan executed as written.

## Self-Check: PASSED

- `src/types.ts`, `src/components/tabs/SettingsTab.tsx`, `src/components/tabs/SettingsTab.test.tsx` verified on disk.
- Commits `7c5f8c6` and `9d6ae08` verified in git history (`plan_head_before=d335e8f1fe44bee7a957d4a68f121f05e5928a14`, `plan_head_after=9d6ae0829f5c19ce229b81a30f30d709ff69fcf8`, `commits=2`).
- `pnpm test -- --run src/components/tabs/SettingsTab.test.tsx` (19/19 passed), full Vitest suite via pre-commit (16 files, 159/159 tests passed), `pnpm typecheck` (0 errors), `pnpm lint` (0 errors), `rollup -c` build, and `py -3 -m unittest discover -s tests -p "test_equalizer.py"` (19/19 passed) all succeeded.
