---
phase: 20-100-silent-hud-toasts-extended-in-game-quick-chords
plan: 05
subsystem: ui, controller, overlay
tags: [gamepad-chords, steamclient, gamescope, silent-banner, overlay, tdd]

requires:
  - phase: 20-04
    provides: Volume-scaled Web Audio chime and unified SilentBanner gating
provides:
  - Unbound [] DEFAULT_CHORD_BINDINGS across TypeScript and Python
  - Immediate STEAM/QAM guide-button rejection and inline warning in ChordBindingsCard, validateChordBinding, and _normalize_chord_buttons
  - ControllerInputGamepadButton -> GAMEPAD_BUTTON mapper (mapControllerInputButton) and SteamClient.Input.RegisterForControllerInputMessages in-game chord capture
  - Gamescope EUIComposition.Notification (1) lifecycle in DeckifyOverlayWrapper driven by SilentBanner and DeckifyOverlay visibility
affects: [phase-20-verification, quick-chords, overlay-hud]

actuals:
  tokens: 12723
  tasks: 2
  commits: 1
plan_head_before: 029792680db3e1923e752d1e33264ef760c62b11
plan_head_after: 077abc176f83057aff6a81129fb16867df362af4
commits: 1

tech-stack:
  added: []
  patterns:
    - "SteamClient.Input.RegisterForControllerInputMessages primary listener with FocusNavController fallback"
    - "useGamescopeNotificationComposition asserting EUIComposition.Notification (1) while HUD/banner visible and !steamOverlayActive"

key-files:
  created: []
  modified:
    - src/chords.ts
    - src/chords.test.ts
    - py_modules/common.py
    - tests/test_chord_settings.py
    - src/components/tabs/ChordBindingsCard.tsx
    - src/components/tabs/ChordBindingsCard.test.tsx
    - src/components/SilentBanner.tsx
    - src/components/DeckifyOverlay.tsx
    - src/index.tsx
    - src/index.test.tsx

key-decisions:
  - "Ship all 8 DEFAULT_CHORD_BINDINGS entries as [] so users start with a clean slate and legacy STEAM+button defaults migrate cleanly to [] on load"
  - "Reject all chords containing guide/STEAM/QAM buttons (13, 14, 27, 28) on both frontend and backend with an inline SteamOS interception warning"
  - "Prefer SteamClient.Input.RegisterForControllerInputMessages (mapped via mapControllerInputButton) for in-game chord capture while retaining FocusNavController fallback"
  - "Assert SteamClient.Window.SetComposition(1, [], 0) while SilentBanner or DeckifyOverlay is visible and !steamOverlayActive, resetting to 0 when hidden without overriding active Steam Overlay/QAM"

patterns-established:
  - "onVisibilityChange callback pattern on SilentBanner and DeckifyOverlay feeding DeckifyOverlayWrapper composition state"

requirements-completed: [CHORD-01, TOAST-01]

coverage:
  - id: D1
    description: "All 8 DEFAULT_CHORD_BINDINGS entries ship unbound ([]) in src/chords.ts and py_modules/common.py"
    requirement: CHORD-01
    verification:
      - kind: unit
        ref: "src/chords.test.ts#chords schema and defaults"
        status: pass
      - kind: unit
        ref: "tests/test_chord_settings.py#test_defaults_have_silent_banner_and_eight_chord_actions"
        status: pass
    human_judgment: false
  - id: D2
    description: "Attempting to bind or record any combo containing STEAM/QAM buttons (27, 28, 13, 14) warns and rejects with SteamOS interception message"
    requirement: CHORD-01
    verification:
      - kind: unit
        ref: "src/chords.test.ts#validateChordBinding"
        status: pass
      - kind: unit
        ref: "src/components/tabs/ChordBindingsCard.test.tsx#immediately cancels recording and warns on STEAM/QAM button press"
        status: pass
      - kind: unit
        ref: "tests/test_chord_settings.py#test_set_setting_gamepad_chord_bindings_rejects_invalid_and_reserved_without_mutation"
        status: pass
    human_judgment: false
  - id: D3
    description: "In-game quick-chords capture controller input via SteamClient.Input.RegisterForControllerInputMessages (mapped with mapControllerInputButton) with FocusNavController fallback"
    requirement: CHORD-01
    verification:
      - kind: unit
        ref: "src/chords.test.ts#mapControllerInputButton"
        status: pass
      - kind: unit
        ref: "src/index.test.tsx#captures in-game chords via SteamClient.Input.RegisterForControllerInputMessages"
        status: pass
    human_judgment: true
    rationale: "Requires live SteamOS Gamescope + GamepadUI verification that SteamClient.Input.RegisterForControllerInputMessages delivers rear-paddle (L4/R4/L5/R5) events during an active game"
  - id: D4
    description: "DeckifyOverlay and SilentBanner assert EUIComposition.Notification (1) via SteamClient.Window.SetComposition while visible and reset to 0 when hidden"
    requirement: TOAST-01
    verification:
      - kind: unit
        ref: "src/index.test.tsx#manages Gamescope EUIComposition.Notification (1) in DeckifyOverlayWrapper"
        status: pass
    human_judgment: true
    rationale: "Requires live SteamOS Gamescope verification that SetComposition(1, [], 0) composites DeckifyOverlay and SilentBanner above a running game without stealing input or overriding Steam QAM"

duration: 13min
completed: 2026-11-21
status: complete
---

# Phase 20 Plan 05: Unbound Chord Defaults, In-Game Input Capture & Gamescope Composition Summary

**Shipped unbound `[]` default chord bindings with STEAM/QAM button rejection, `SteamClient.Input.RegisterForControllerInputMessages` in-game chord capture, and `EUIComposition.Notification` Gamescope compositing for `DeckifyOverlay` and `SilentBanner`.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-11-21T18:38:34Z
- **Completed:** 2026-11-21T18:51:13Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Cleared all 8 `DEFAULT_CHORD_BINDINGS` entries to `[]` in both `src/chords.ts` and `py_modules/common.py` so new and migrated configs start cleanly without OS-intercepted STEAM combos.
- Added immediate inline rejection and SteamOS interception warning for guide/STEAM/QAM buttons (`13`, `14`, `27`, `28`) in `ChordBindingsCard.tsx`, `validateChordBinding`, and `_normalize_chord_buttons`.
- Added `mapControllerInputButton` in `src/chords.ts` and wired `SteamClient.Input.RegisterForControllerInputMessages` in `setupChordListener()` (`src/index.tsx`) with `FocusNavController` fallback.
- Added `onVisibilityChange` reporting to `SilentBanner` and `DeckifyOverlay`, and wired `useGamescopeNotificationComposition` in `DeckifyOverlayWrapper` to assert `SteamClient.Window.SetComposition(1, [], 0)` while visible and reset to `0` when hidden (without downgrading active Steam Overlay/QAM).

## Task Commits

1. **Tasks 1 & 2: Unbound defaults, STEAM rejection, in-game input capture & Gamescope composition** - `077abc1` (feat)

_Note: Husky pre-commit runs the full `vitest run` suite alongside `tsc --noEmit`; because Task 1's removal of `[27, 11]` defaults required Task 2's `src/index.test.tsx` updates to pass pre-commit, Tasks 1 and 2 were committed together in `077abc1` after full RED -> GREEN verification._

## Files Created/Modified
- `src/chords.ts` - Set `DEFAULT_CHORD_BINDINGS` to `[]`, rejected guide buttons in `validateChordBinding`, added `mapControllerInputButton`.
- `src/chords.test.ts` - Updated default/validation assertions and added `mapControllerInputButton` unit tests.
- `py_modules/common.py` - Set `DEFAULT_CHORD_BINDINGS` to `[]` and rejected guide buttons in `_normalize_chord_buttons`.
- `tests/test_chord_settings.py` - Updated default, migration, and rejection tests.
- `src/components/tabs/ChordBindingsCard.tsx` - Immediate inline warning/cancel on `GUIDE_BUTTON_IDS` during recording and updated helper copy.
- `src/components/tabs/ChordBindingsCard.test.tsx` - Updated default `Unbound` assertions and added STEAM/QAM press rejection test.
- `src/components/SilentBanner.tsx` - Added `onVisibilityChange` prop and unmount cleanup.
- `src/components/DeckifyOverlay.tsx` - Added `onVisibilityChange` prop reporting effective visibility.
- `src/index.tsx` - Wired `RegisterForControllerInputMessages` + `mapControllerInputButton` in `setupChordListener` and `useGamescopeNotificationComposition` in `DeckifyOverlayWrapper`.
- `src/index.test.tsx` - Updated legacy default chord tests to explicit bindings and added G-20-2 tests for `RegisterForControllerInputMessages` and `SetComposition`.

## Decisions Made
- Combined Task 1 and Task 2 into a single atomic commit `077abc1` because the repository's Husky pre-commit hook runs `tsc --noEmit` and the full `vitest run` suite, which requires `src/index.test.tsx` (Task 2) to be updated when `DEFAULT_CHORD_BINDINGS` changes (Task 1).

## Deviations from Plan

None - plan executed as specified (Tasks 1 and 2 committed together due to pre-commit full-suite gate).

## Issues Encountered
- Husky pre-commit runs `tsc --noEmit` and `vitest run` across all files, blocking an intermediate Task 1 commit while `src/index.test.tsx` still expected legacy `[27, 11]` defaults. Resolved by completing Task 2 and committing both tasks together once all 604 Python tests, 21 Vitest files, `tsc --noEmit`, `eslint`, and `rollup` build passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 20 Gap G-20-2 is closed and verified across unit tests, typecheck, lint, and production build.
- Ready for on-device Steam Deck UAT of in-game rear-paddle chords and Gamescope overlay compositing.

## Self-Check: PASSED

- Verified all 10 modified files exist on disk.
- Verified commit `077abc1` is in `HEAD` (`git merge-base --is-ancestor 077abc1 HEAD`).
- Verified `py -3 -m unittest discover -s tests -p "test_*.py"` (604 tests OK), `pnpm test -- --run` (21 files passed), `pnpm run typecheck` (0 errors), `pnpm run lint` (0 errors), and `pnpm run build` (`dist` built) all exited 0.

---
*Phase: 20-100-silent-hud-toasts-extended-in-game-quick-chords*
*Completed: 2026-11-21*
