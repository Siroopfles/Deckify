---
phase: 19-per-game-eq-volume-profiles
plan: 05
subsystem: ui
tags: [react, soundtracks-tab, game-eq-modal, eq-band-faders, settings-tab, qam, soundtrack-manager, vdf-parser, gap-closure]

requires:
  - phase: 19-03
    provides: Shared EqBandFaders renderer, GameEqModal 10-band modal editor, and SettingsTab Active Game EQ Override badge
  - phase: 19-04
    provides: SoundtracksTab EQ modal launcher, dual override sliders, DeckifyExpandedModal wiring, and QuickAccessMenu game volume sync
provides:
  - SoundtracksTab explicit Volume Override and Custom Ducking Level ToggleFields gating dedicated-row SliderFields, width: 'auto' compact DialogButtons, and app_name backfill preserving useState slots 0..6
  - GameEqModal native ModalRoot surface inheritance, overflowX hidden bounds, body initial focus via requestAnimationFrame, two non-wrapping 4-item MAINTAIN_X preset rows, and aligned width: 'auto' / flex: 1 footer buttons
  - EqBandFaders NavEntryPositionPreferences.MAINTAIN_X horizontal D-pad column alignment
  - SettingsTab full-width dedicated Active Game EQ Override banner row preserving prefix and preset suffix while truncating long game names
  - QAM handleQuickBind display_name propagation and SoundtrackManager._resolve_app_name vdf_parser.get_installed_games() fallback with legacy empty app_name self-healing
affects: [SoundtracksTab, GameEqModal, EqBandFaders, SettingsTab, QuickAccessMenu, SoundtrackManager, Phase 19 UAT]

actuals:
  tokens: 102247
  tasks: 3
  commits: 3
  plan_head_before: 578214b5dda079cec672a2a1ed269de87de6d0f8
  plan_head_after: c979368e3426451db307fbcbade8efeb81707ea9

tech-stack:
  added: []
  patterns:
    - "Explicit ToggleField gating dedicated full-width SliderField rows rather than inline conditional Reset DialogButtons beside flex: 1 sliders"
    - "width: 'auto' override on all compact/inline @decky/ui DialogButtons to neutralize SteamOS .DialogButton { width: 100% } squeezing"
    - "Two non-wrapping 4-item Focusable flow-children='horizontal' rows with NavEntryPositionPreferences.MAINTAIN_X aligned into EqBandFaders and footer buttons"
    - "Three-tier _resolve_app_name (profile -> persisted profile -> vdf_parser.get_installed_games) self-healing legacy empty app_name entries on launch"

key-files:
  created: []
  modified:
    - src/components/tabs/SoundtracksTab.tsx
    - src/components/tabs/SoundtracksTab.test.tsx
    - src/components/common/EqBandFaders.tsx
    - src/components/tabs/GameEqModal.tsx
    - src/components/tabs/GameEqModal.test.tsx
    - src/components/tabs/SettingsTab.tsx
    - src/components/tabs/SettingsTab.test.tsx
    - src/index.tsx
    - src/index.test.tsx
    - py_modules/soundtrack.py
    - tests/test_soundtrack.py

key-decisions:
  - "Replaced SoundtracksTab inline Reset DialogButtons with full-width Volume Override and Custom Ducking Level ToggleFields gating dedicated-row SliderFields while keeping useState slots 0..6 unchanged"
  - "Applied width: 'auto' on all compact/inline DialogButtons across SoundtracksTab and GameEqModal to override SteamOS .DialogButton width: 100% layout collapse"
  - "Aligned GameEqModal preset rows, EqBandFaders, and footer actions on NavEntryPositionPreferences.MAINTAIN_X and focused the modal body via requestAnimationFrame to eliminate initial Close focus and horizontal scroll"
  - "Self-healed legacy empty app_name profiles in SoundtrackManager via vdf_parser.get_installed_games() fallback and moved SettingsTab Active Game EQ Override badge onto a dedicated full-width banner row"

patterns-established:
  - "Set width: 'auto' on any compact or flex-row @decky/ui DialogButton to prevent SteamOS 100% width expansion"
  - "Use non-wrapping Focusable flow-children='horizontal' rows paired with NavEntryPositionPreferences.MAINTAIN_X and body requestAnimationFrame initial focus inside modals"

requirements-completed: [GAME-01]

coverage:
  - id: D1
    description: "SoundtracksTab explicit Volume Override & Custom Ducking Level ToggleFields gating dedicated-row SliderFields, width: 'auto' compact DialogButtons, and app_name backfill"
    requirement: "GAME-01"
    verification:
      - kind: unit
        ref: "pnpm test -- --run src/components/tabs/SoundtracksTab.test.tsx && pnpm run typecheck && pnpm exec eslint --max-warnings=0 src/components/tabs/SoundtracksTab.tsx"
        status: pass
    human_judgment: false
  - id: D2
    description: "GameEqModal native ModalRoot surface, overflow-safe container, body initial focus, two non-wrapping MAINTAIN_X preset rows, EqBandFaders MAINTAIN_X alignment, and SettingsTab full-width override banner row"
    requirement: "GAME-01"
    verification:
      - kind: unit
        ref: "pnpm test -- --run src/components/tabs/GameEqModal.test.tsx src/components/tabs/SettingsTab.test.tsx && pnpm run typecheck && pnpm exec eslint --max-warnings=0 src/components/common/EqBandFaders.tsx src/components/tabs/GameEqModal.tsx"
        status: pass
    human_judgment: false
  - id: D3
    description: "QAM handleQuickBind display_name propagation, SoundtrackManager._resolve_app_name VDF fallback & self-healing, and full Python/Vitest/typecheck/lint/build verification"
    requirement: "GAME-01"
    verification:
      - kind: integration
        ref: "py -3 -m unittest discover -s tests -p \"test_*.py\" && pnpm test -- --run && pnpm run typecheck && pnpm run lint && pnpm exec eslint --max-warnings=0 src/components/tabs/SoundtracksTab.tsx src/components/tabs/GameEqModal.tsx src/components/common/EqBandFaders.tsx && pnpm run build"
        status: pass
    human_judgment: false
  - id: D4
    description: "Live Steam Deck GamepadUI 1280x800 visual and D-pad controller re-verification for UAT gap G-19-2"
    requirement: "GAME-01"
    verification: []
    human_judgment: true
    rationale: "SteamOS GamepadUI 1280x800 rendering, FocusNavController D-pad traversal, and native ModalRoot surface appearance require physical Steam Deck verification beyond headless shallow-JSX Vitest mocks."

duration: 11min
completed: 2026-11-19
status: complete
---

# Phase 19 Plan 05: Gap Closure (G-19-2) Layout, Spatial Nav & App Name Persistence Summary

**Closed all 4 UAT `G-19-2` root causes with explicit `SoundtracksTab` volume/ducking `ToggleField`s, `width: "auto"` `DialogButton`s, `GameEqModal` native `ModalRoot` surface & `MAINTAIN_X` two-row layout, QAM/VDF `app_name` resolution & self-healing, and a dedicated full-width `SettingsTab` override banner**

## Performance
- **Duration:** 11min
- **Started:** 2026-11-19T17:01:43Z
- **Completed:** 2026-11-19T17:12:47Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments
- Replaced `SoundtracksTab` inline `Clear Volume Override` / `Use Global Ducking` `DialogButton`s with explicit full-width `"Volume Override"` and `"Custom Ducking Level"` `ToggleField`s gating dedicated full-width `SliderField` rows, applied `width: "auto"` to all 6 compact/inline `DialogButton` roles, and backfilled empty `app_name` from `game.name` on load, render, and modal saves while preserving `useState` slots `0..6`.
- Fixed `GameEqModal` surface clash, horizontal scroll, initial `Close` focus, wrapped preset bar, leftward D-pad Down jump, and footer button widths by inheriting `<ModalRoot>`, setting `overflowX: "hidden"` and `maxWidth: "min(680px, 88vw)"`, moving initial focus to `[tabindex="0"]` inside the body via `useBodyInitialFocus` (`requestAnimationFrame`), splitting `Copy from Preset` + `Reset to Flat` into two non-wrapping 4-item `MAINTAIN_X` rows, and adding `NavEntryPositionPreferences.MAINTAIN_X` to `EqBandFaders.tsx` and the modal footer.
- Moved `SettingsTab`'s `Active Game EQ Override` badge onto its own dedicated full-width flex row below the `Equalizer & Audio Presets` header with `flexShrink: 0` on prefix/preset suffix spans and ellipsis truncation confined to the game title.
- Updated `QuickAccessMenu` `handleQuickBind` in `src/index.tsx` to forward `Router.MainRunningApp?.display_name` (guarded by `appid` match) into `bind_current_music_to_game`, and added `SoundtrackManager._resolve_app_name` with `vdf_parser.get_installed_games()` fallback across `save_profile`, `bind_current_music_to_game`, and `apply_active_audio_profile` (self-healing legacy `app_name: ""` profiles on disk).

## Task Commits

Each task was committed atomically:

1. **Task 1: Upgrade SoundtracksTab Volume/Ducking ToggleFields, width: 'auto' DialogButtons, and app_name backfill** - `4306b40` (fix)
2. **Task 2: Fix GameEqModal surface/scroll/D-pad navigation (with EqBandFaders MAINTAIN_X) and SettingsTab dedicated override banner row** - `fb4e5f8` (fix)
3. **Task 3: Propagate QAM display_name, add backend SoundtrackManager._resolve_app_name fallback, and run full verification gates** - `c979368` (fix)

## Files Created/Modified
- `src/components/tabs/SoundtracksTab.tsx` - Explicit Volume Override & Custom Ducking Level ToggleFields, dedicated-row SliderFields, `width: "auto"` compact DialogButtons, and `patchProfileAppName` / `backfillProfileAppNames` helpers.
- `src/components/tabs/SoundtracksTab.test.tsx` - Updated slider/toggle assertions, `style.width === "auto"` checks across all 6 button roles, and `app_name` backfill tests (26 tests passing).
- `src/components/common/EqBandFaders.tsx` - Added `NavEntryPositionPreferences.MAINTAIN_X` to the 10-band horizontal strip.
- `src/components/tabs/GameEqModal.tsx` - Native `ModalRoot` surface inheritance, overflow-safe sizing, `Focusable` header, two non-wrapping 4-item `MAINTAIN_X` preset rows, `useBodyInitialFocus`, and `width: "auto"` / `flex: 1` footer buttons.
- `src/components/tabs/GameEqModal.test.tsx` - Verified native modal constraints, `Close` / footer auto-widths, two non-wrapping `MAINTAIN_X` preset rows, and `requestAnimationFrame` body focus (12 tests passing).
- `src/components/tabs/SettingsTab.tsx` - Dedicated full-width `active-game-eq-override-badge` row below the Equalizer header with `flexShrink: 0` prefix/suffix spans.
- `src/components/tabs/SettingsTab.test.tsx` - Verified dedicated banner placement outside header row and prefix/suffix/title flex & ellipsis styling (35 tests passing).
- `src/index.tsx` - Forwarded verified `Router.MainRunningApp?.display_name` from `handleQuickBind` into `bind_current_music_to_game`.
- `src/index.test.tsx` - Verified `bind_current_music_to_game(1091500, "Cyberpunk 2077")` and `appid`-mismatch sanitization (16 tests passing).
- `py_modules/soundtrack.py` - Added `SoundtrackManager._resolve_app_name` (`vdf_parser.get_installed_games()` fallback) and wired it into `save_profile`, `bind_current_music_to_game`, and `apply_active_audio_profile`.
- `tests/test_soundtrack.py` - Added tests for `_resolve_app_name` fallback/exception safety, Non-Steam uint32 (`2429414104`) name resolution, and legacy profile self-healing on launch (51 tests passing).

## Decisions Made
- Replaced inline reset buttons with explicit `"Volume Override"` and `"Custom Ducking Level"` `ToggleField`s gating dedicated full-width `SliderField` rows while keeping `SoundtracksTab` hook slots `0..6` intact.
- Overrode SteamOS `.DialogButton { width: 100% }` with `width: "auto"` on every compact/inline button across `SoundtracksTab` and `GameEqModal`.
- Used two non-wrapping 4-item `Focusable[flow-children="horizontal"]` rows plus `NavEntryPositionPreferences.MAINTAIN_X` across `GameEqModal` presets, `EqBandFaders`, and footer buttons, paired with `requestAnimationFrame` body focus.
- Wired three-tier `_resolve_app_name` resolution (`profile` -> persisted store -> `vdf_parser.get_installed_games()`) in `SoundtrackManager` to repair legacy `app_name: ""` records on disk alongside QAM `display_name` forwarding and a dedicated full-width `SettingsTab` banner row.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All 4 diagnosed UAT `G-19-2` root causes are resolved and verified across full Python suite (`593` tests OK, including `51` in `test_soundtrack.py`), full Vitest suite (`17` files, `209` tests passed), `pnpm run typecheck`, `pnpm run lint` (`0` errors across `src/`), `eslint --max-warnings=0` on `SoundtracksTab.tsx`, `GameEqModal.tsx`, and `EqBandFaders.tsx`, and production `rollup -c` build.
- Ready for Phase 19 hardware UAT re-verification of Test 2 on Steam Deck (`1280x800`).

## Self-Check: PASSED
- Verified all 11 modified files exist on disk (`src/components/tabs/SoundtracksTab.tsx`, `src/components/tabs/SoundtracksTab.test.tsx`, `src/components/common/EqBandFaders.tsx`, `src/components/tabs/GameEqModal.tsx`, `src/components/tabs/GameEqModal.test.tsx`, `src/components/tabs/SettingsTab.tsx`, `src/components/tabs/SettingsTab.test.tsx`, `src/index.tsx`, `src/index.test.tsx`, `py_modules/soundtrack.py`, `tests/test_soundtrack.py`).
- Verified commits `4306b40`, `fb4e5f8`, and `c979368` are ancestors of `HEAD` (`commits: 3`, `plan_head_before: 578214b5dda079cec672a2a1ed269de87de6d0f8`, `plan_head_after: c979368e3426451db307fbcbade8efeb81707ea9`).
- Verified `py -3 -m unittest discover -s tests -p "test_*.py"` (`593` tests OK), `pnpm test -- --run` (`17` files, `209` tests passed), `pnpm run typecheck` (`0` errors), `pnpm run lint` (`0` errors), `--max-warnings=0` on `SoundtracksTab.tsx`, `GameEqModal.tsx`, and `EqBandFaders.tsx` (`0` warnings), and `pnpm run build` all passed cleanly.
