---
phase: 21-dynamic-album-art-accent-themes-handheld-battery-eco-mode
plan: 05
subsystem: ui
tags: [react, theme-bus, accent-theme, eco-mode, quick-access-menu, settings-tab, vitest]
dependency_graph:
  requires:
    - phase: 21-01
      provides: accent_theme & eco_* backend settings + EcoModeManager
    - phase: 21-02
      provides: themeBus.ts (syncThemeFromState) & accentTheme.ts
    - phase: 21-03
      provides: common & first-wave tab --deckify-accent migration
    - phase: 21-04
      provides: second-wave tab --deckify-accent migration
  provides:
    - SettingsTab Accent Theme selector card (Classic Spotify Green, Dynamic Album Glow, SteamOS Deck Blue)
    - SettingsTab Handheld Battery Eco-Mode card with live status badge and controls
    - src/index.tsx themeBus synchronization, eco_status_changed listener, and QAM Eco-Sleep Active + Wake & Play banner
  affects:
    - src/components/tabs/SettingsTab.tsx
    - src/index.tsx
    - src/components/tabs/SettingsTab.test.tsx
    - src/index.test.tsx
tech_stack:
  added: []
  patterns:
    - Cross-root CSS custom property synchronization via themeBus.ts on status, settings_changed, track_metadata, and eco_status_changed
    - Plain module-level render helpers (renderAccentThemeCard, renderEcoModeCard) in SettingsTab.tsx for shallow JSX testability and ESLint compliance
key_files:
  created: []
  modified:
    - src/components/tabs/SettingsTab.tsx
    - src/index.tsx
    - src/components/tabs/SettingsTab.test.tsx
    - src/index.test.tsx
decisions:
  - Read ecoStatus ?? status?.eco_status directly in SettingsTab.tsx and persist via existing backendSetSetting RPC so DeckifyExpandedModal.tsx requires no modification
  - Keep var(--deckify-accent, #1db954) lowercase fallback on QAM DUCKED badge so existing Python E2E contract check passes alongside dynamic theming
  - Return handleTrackMetadataNotification(meta) from definePlugin track_metadata listener so async notification handlers remain awaitable in unit tests
metrics:
  duration: 10min
  completed_date: 2026-11-22
  tasks_completed: 2
  files_modified: 4
status: complete
actuals:
  tasks: 2
  commits: 1
  plan_head_before: f7b853d82f9b7e547bea255250f3b3d7e406d338
  plan_head_after: 6b0145951e4dfd864ed10e84a5edbab799fc252b
---

# Phase 21 Plan 05: SettingsTab Accent Theme & Eco-Mode UI, QAM Eco-Sleep & Final Verification Summary

**Implemented Accent Theme and Handheld Battery Eco-Mode cards in SettingsTab.tsx, wired themeBus sync, eco_status_changed events, and QAM Eco-Sleep Active + Wake & Play in src/index.tsx, and verified all 624 Python and 273 Vitest tests.**

## Performance

- **Duration:** ~10 min
- **Completed:** 2026-11-22
- **Tasks:** 2 / 2
- **Files modified:** 4

## Accomplishments

- **Accent Theme Card (`SettingsTab.tsx`):** Added `renderAccentThemeCard` with 3 compact `DialogButton` pills (`width: "auto"`, `minWidth: "auto"`, `minHeight: 44`) inside `Focusable flow-children="horizontal"` for `Classic Spotify Green`, `Dynamic Album Glow` (with WCAG luminance-clamped helper copy), and `SteamOS Deck Blue`. Clicking a pill updates `themeBus` immediately and persists `accent_theme` via `set_setting`.
- **Handheld Battery Eco-Mode Card (`SettingsTab.tsx`):** Added `renderEcoModeCard` with live status badge (`Engine Sleeping`, `On Battery — Active`, `Bypassed (AC / Docked / Desktop)`), `Enable Battery Eco-Mode` toggle, `Inactivity Sleep Timeout` slider (`5..30` min, step `5`, disabled when Eco-Mode is off), and `Sleep Official Spotify Client` toggle. Subscribes to `eco_status_changed` and reads `ecoStatus ?? status?.eco_status`.
- **Cross-Root Theme Sync & QAM Eco-Sleep (`src/index.tsx`):** Migrated hardcoded `#1db954` / `#1DB954` / `29, 185, 84` tokens to `var(--deckify-accent, #1DB954)` / `rgba(var(--deckify-accent-rgb, 29, 185, 84), ...)`, wired `syncThemeFromState` on `status`, `settings_changed`, `track_metadata`, and `eco_status_changed`, and added the QAM `Eco-Sleep Active` banner card with `Wake & Play` `DialogButton` (`control_playback("play", "")`).
- **Tests & Full Suite Verification:** Extended `SettingsTab.test.tsx` (41 tests) and `src/index.test.tsx` (36 tests); verified Python `unittest` (624 tests), Vitest (22 files, 273 tests), TypeScript `tsc --noEmit`, ESLint, and Rollup `dist/index.js` build.

## Task Commits

- `6b01459` — `test(21-05): add SettingsTab Accent Theme & Eco-Mode tests and QAM Eco-Sleep Wake & Play tests` (includes `src/index.tsx`, `src/components/tabs/SettingsTab.test.tsx`, `src/index.test.tsx`; note `SettingsTab.tsx` and initial `src/index.tsx` edits were swept into `c04bea4` during concurrent Wave 2 commit on `main`)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Restored async return on `track_metadata` listener & preserved `#1db954` fallback on DUCKED badge**
- **Found during:** Task 2 verification
- **Issue:** Wrapping `handleTrackMetadataNotification(meta)` in a block arrow without `return` prevented tests from awaiting async toast/banner delivery; uppercasing `#1db954` to `#1DB954` on the QAM `DUCKED` badge broke `test_ducking_frontend_exit_debounce_and_pill_badge` in `tests/test_e2e_requirements.py`.
- **Fix:** Returned `handleTrackMetadataNotification(meta)` in `src/index.tsx` and used `var(--deckify-accent, #1db954)` on the `DUCKED` badge.
- **Files modified:** `src/index.tsx`
- **Commit:** `6b01459`

**2. [Rule 3 - Blocking] Updated existing `#1db954` color assertions in `SettingsTab.test.tsx` and `src/index.test.tsx`**
- **Found during:** Task 2 verification
- **Issue:** Two pre-existing tests asserted exact `"#1db954"` / `"1px solid #1db954"` inline style strings that now use `var(--deckify-accent, #1DB954)`.
- **Fix:** Updated assertions to expect `"var(--deckify-accent, #1DB954)"` and added `FaPalette`, `FaLeaf`, and `FaMoon` to `react-icons/fa` test mocks.
- **Files modified:** `src/components/tabs/SettingsTab.test.tsx`, `src/index.test.tsx`
- **Commit:** `6b01459`

## Known Stubs

None.

## Self-Check: PASSED

- Verified `src/components/tabs/SettingsTab.tsx`, `src/index.tsx`, `src/components/tabs/SettingsTab.test.tsx`, and `src/index.test.tsx` exist and are committed on `main` (`6b01459` is an ancestor of `HEAD`).
- Verified full test suite (`py -3 -m unittest discover -s tests -p "test_*.py"` — 624 passed; `pnpm test -- --run` — 273 passed), `pnpm run typecheck`, `pnpm run lint`, and `pnpm run build` all exited 0.
