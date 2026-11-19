---
phase: 19-per-game-eq-volume-profiles
plan: 02
subsystem: audio
tags: [python, controller-rpc, equalizer, volume-fader, soundtrack, crash-recovery]

requires:
  - phase: 19-01
    provides: 3-layer EqualizerManager (ephemeral/preview), local PipeWire VolumeFader game overrides, sequenced SoundtrackManager lifecycle, and active_game_override_snapshot persistence
provides:
  - Boot-time stale eq.pid cleanup and active_game_override_snapshot crash recovery in Plugin._main() with _sleep_locked protection
  - Post-debounce ducking delegation in Plugin.handle_app_lifetime_event and pending-exit guard in Plugin.trigger_ducking(False, "game")
  - Immediate mid-game override refresh hooks in Plugin.save_game_soundtrack_profile and Plugin.delete_game_soundtrack_profile
  - Validated Plugin.preview_eq_bands and Plugin.clear_eq_preview RPCs via shared _validate_eq_bands helper
  - Mid-game librespot restart routing check (has_ephemeral_override) and status exposure (active_game_app_id, active_game_override, has_game_override) excluding internal snapshot from public settings
affects: [19-03, 19-04, SoundtracksTab, SettingsTab, GameEqModal, QuickAccessMenu]

actuals:
  tokens: 41898
  tasks: 2
  commits: 2
  plan_head_before: 6b12338e176a96a2299d690f9465c2690ae6c5b3
  plan_head_after: f56272bcad38b292b204e37bdd83a4588da3b290

tech-stack:
  added: []
  patterns:
    - "Shared _validate_eq_bands helper enforcing list length 10, bool/non-numeric/NaN rejection, and [-12.0, 12.0] 2-decimal clamping across set_eq_bands and preview_eq_bands"
    - "Boot-time crash recovery gated on active_game_override_snapshot vs _soundtrack_manager._active_game_app_id and VolumeFader._sleep_locked"
    - "Post-debounce lifecycle delegation separating AppLifetime debounced launch/exit from QAM manual ducking while guarding pending _exit_task"

key-files:
  created: []
  modified:
    - main.py
    - tests/test_soundtrack.py
    - tests/test_equalizer.py

key-decisions:
  - "Extracted module-level _validate_eq_bands in main.py so set_eq_bands and preview_eq_bands share identical T-19-04 input validation without duplicating logic"
  - "Checked isinstance(raw_app_id, int) and not isinstance(raw_app_id, bool) alongside is True checks in get_status, start_librespot, and trigger_ducking to keep MagicMock test doubles safe"
  - "Unconditionally re-applied initial_eq (including flat teardown) during _main() stale snapshot recovery unless frontend already reported the same app_id running"

patterns-established:
  - "Use _validate_eq_bands for all frontend-supplied 10-band float array RPCs in main.py"
  - "Exclude internal recovery keys (active_game_override_snapshot) from get_status().settings and reject external writes at the top of set_setting"

requirements-completed: [GAME-01]

coverage:
  - id: D1
    description: "Boot crash recovery in Plugin._main() cleaning stale eq.pid, clearing active_game_override_snapshot, tearing down or re-applying persistent global EQ, and resetting VolumeFader baseline while respecting _sleep_locked"
    requirement: "GAME-01"
    verification:
      - kind: unit
        ref: "tests/test_soundtrack.py#test_main_boot_crash_recovery_flat_running_and_sleep_locked"
        status: pass
    human_judgment: false
  - id: D2
    description: "Post-debounce ducking delegation in handle_app_lifetime_event, pending _exit_task guard in trigger_ducking, live refresh hooks in save/delete_game_soundtrack_profile, and status/ducking/snapshot isolation"
    requirement: "GAME-01"
    verification:
      - kind: unit
        ref: "py -3 -m unittest discover -s tests -p \"test_soundtrack.py\" && py -3 -m unittest discover -s tests -p \"test_plugin_lifecycle.py\""
        status: pass
    human_judgment: false
  - id: D3
    description: "Validated preview_eq_bands and clear_eq_preview RPCs via shared _validate_eq_bands helper without mutating persistent global EQ settings"
    requirement: "GAME-01"
    verification:
      - kind: unit
        ref: "tests/test_equalizer.py#test_preview_eq_bands_validates_clamps_and_isolates_settings & test_clear_eq_preview_delegates_and_handles_uninitialized_or_errors"
        status: pass
    human_judgment: false
  - id: D4
    description: "Mid-game librespot restart ephemeral EQ retention in start_librespot and active_game_app_id / active_game_override exposure in get_status"
    requirement: "GAME-01"
    verification:
      - kind: unit
        ref: "py -3 -m unittest discover -s tests -p \"test_equalizer.py\" && py -3 -m unittest discover -s tests -p \"test_volume.py\" && py -3 -m unittest discover -s tests -p \"test_e2e_requirements.py\""
        status: pass
    human_judgment: false

duration: 7min
completed: 2026-11-19
status: complete
---

# Phase 19 Plan 02: Controller Wiring, Crash Recovery & Preview RPCs Summary

**Boot-time EQ/volume crash recovery, post-debounce ducking coordination, live profile override hot-apply, and validated `preview_eq_bands`/`clear_eq_preview` RPCs wired in `main.py`**

## Performance
- **Duration:** 7min
- **Started:** 2026-11-19T07:33:33Z
- **Completed:** 2026-11-19T07:40:16Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Wired `EqualizerManager.cleanup_stale_process()` and stale `active_game_override_snapshot` recovery into `Plugin._main()`, tearing down any leftover `deckify_eq_sink` even when persistent `eq_preset == "flat"` and restoring `VolumeFader` to baseline while skipping recovery if the same game already reported running and preserving `_sleep_locked`.
- Updated `Plugin.handle_app_lifetime_event()` to delegate exclusively to `SoundtrackManager.handle_app_lifecycle()` without firing `trigger_ducking` at `t=0`, added an `_exit_task` pending guard to `Plugin.trigger_ducking(False, "game")`, and wired `refresh_active_overrides()` into `save_game_soundtrack_profile()` and `delete_game_soundtrack_profile()` for running games.
- Exposed `active_game_app_id` and `active_game_override` in `Plugin.get_status()` (omitting `active_game_override_snapshot` from `settings`), rejected untrusted writes to `active_game_override_snapshot` in `Plugin.set_setting()`, exposed `has_game_override` in `trigger_ducking()` and `get_ducking_state()`, and updated `Plugin.start_librespot()` to re-route ephemeral game EQ when `has_ephemeral_override` is `True`.
- Extracted `_validate_eq_bands()` in `main.py` and added `Plugin.preview_eq_bands()` and `Plugin.clear_eq_preview()` RPCs with full test coverage in `tests/test_soundtrack.py` and `tests/test_equalizer.py`.

## Task Commits
1. **Task 1: Wire boot crash recovery, post-debounce ducking, live hot-apply, and status exposure in main.py** - `18dc912` (feat)
2. **Task 2: Add validated preview_eq_bands and clear_eq_preview RPCs and mid-game librespot EQ restart routing in main.py** - `f56272b` (feat)

## Files Created/Modified
- `main.py` - Added `_validate_eq_bands`, `preview_eq_bands`, `clear_eq_preview`, `_main()` crash recovery, post-debounce `handle_app_lifetime_event`, `_exit_task` guard in `trigger_ducking`, `has_game_override` in `get_ducking_state`, `active_game_app_id`/`active_game_override` in `get_status`, `set_setting` snapshot rejection, live `refresh_active_overrides` hooks, and `start_librespot` ephemeral EQ check.
- `tests/test_soundtrack.py` - Updated `TestPluginRpc` lifecycle ducking tests for D-10 and added unit tests for live profile refresh, pending exit ducking skip, `get_status`/`get_ducking_state` exposure, `active_game_override_snapshot` rejection, and `_main()` boot crash recovery.
- `tests/test_equalizer.py` - Extended `TestMainEqualizerIntegration` with unit tests for `preview_eq_bands` validation/clamping/isolation, `clear_eq_preview` error/uninitialized handling, `start_librespot` ephemeral EQ routing when global is `"flat"`, and `get_status` override fields.

## Decisions Made
- Extracted module-level `_validate_eq_bands()` in `main.py` so `set_eq_bands` and `preview_eq_bands` enforce identical list/length/numeric/bool/NaN checks and `[-12.0, 12.0]` clamping.
- Guarded `get_status()`, `start_librespot()`, and `trigger_ducking()` against unconfigured `MagicMock` truthiness via explicit `isinstance(..., int)` and `is True` checks.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Plan `19-02` controller RPCs and lifecycle wiring in `main.py` are complete and verified across all targeted suites (`test_soundtrack.py` 46 tests, `test_equalizer.py` 31 tests, `test_volume.py` 68 tests, `test_e2e_requirements.py` 152 tests, `test_plugin_lifecycle.py` 14 tests) and full 580-test Python suite.
- Ready for Wave 3 frontend UI plans (`19-03` `GameEqModal` / `SettingsTab` / `DeckifyExpandedModal`, `19-04` `SoundtracksTab` / `QuickAccessMenu`).

## Self-Check: PASSED
- Verified modified files `main.py`, `tests/test_soundtrack.py`, and `tests/test_equalizer.py` exist on disk and match commits `6b12338..f56272b`.
- Verified commits `18dc912` and `f56272b` are ancestors of `HEAD` (`commits: 2`, `plan_head_before: 6b12338e176a96a2299d690f9465c2690ae6c5b3`, `plan_head_after: f56272bcad38b292b204e37bdd83a4588da3b290`).
- Verified `test_equalizer.py` (31 tests), `test_soundtrack.py` (46 tests), `test_volume.py` (68 tests), `test_e2e_requirements.py` (152 tests), `test_plugin_lifecycle.py` (14 tests), and the full pre-commit Python suite (580 tests) all passed.
