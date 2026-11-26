---
phase: 28-cdp-offline-downloads-wi-fi-travel-mode-living-room-spotify
plan: 02
subsystem: resilience
tags: [python, travel-mode, wifi-resilience, offline-filtering, unittest]

requires:
  - phase: 17-suspend-wake-resilience-onevent-bridge
    provides: SessionBookmarkManager, _last_recovery_ts cooldown, and on_poll_network_result Wi-Fi drop detector
provides:
  - WAKE_GRACE_WINDOW_S (10.0s) wake-from-suspend suppression in SessionBookmarkManager.on_poll_network_result
  - Travel Mode state machine (set_manual_travel_mode, set_auto_travel_mode_enabled, get_travel_mode_state) with sticky manual lock and auto-exit on Wi-Fi stabilization
  - filter_items_for_travel_mode helper for filtering library collections/episodes to downloaded URIs
  - Wave 0 unit test suite tests/test_travel_mode.py
affects: [28-04, 28-05, 28-06, 28-07]

actuals:
  tokens: 3333
  tasks: 2
  commits: 2
plan_head_before: 336841e630566c02f926806b02b3111f6137cd15
plan_head_after: dbc7a0d41cf41905b2da8bf087954ff04dc4516a

tech-stack:
  added: []
  patterns:
    - "10-second WAKE_GRACE_WINDOW_S guard after _last_recovery_ts before auto-activating Travel Mode"
    - "Idempotent manual Travel Mode toggle with sticky travel_mode_manual flag preserved across Wi-Fi reconnects"

key-files:
  created:
    - tests/test_travel_mode.py
  modified:
    - py_modules/resilience.py

key-decisions:
  - "Evaluated auto Travel Mode activation in on_poll_network_result(False) independently of _network_lost_session so sustained disconnects that span past WAKE_GRACE_WINDOW_S still transition into Travel Mode"
  - "Checked travel_mode_enabled and not travel_mode_manual at the top of on_poll_network_result(True) before early wake-recovery returns so auto-exit fires reliably"

patterns-established:
  - "Travel Mode filtering: filter_items_for_travel_mode preserves original ordering and accepts both downloaded_uris set/list and item.offline_state == 'downloaded'"

requirements-completed: [CDP-02]

coverage:
  - id: D1
    description: "WAKE_GRACE_WINDOW_S (10.0s) suppresses auto Travel Mode during wake-from-suspend Wi-Fi re-association"
    requirement: CDP-02
    verification:
      - kind: unit
        ref: "tests/test_travel_mode.py#TestTravelModeStateMachine.test_wake_grace_window_suppresses_auto_travel_mode"
        status: pass
    human_judgment: false
  - id: D2
    description: "Sustained Wi-Fi disconnect past wifi_grace_s and WAKE_GRACE_WINDOW_S auto-activates Travel Mode, and Wi-Fi stabilization auto-exits unless travel_mode_manual is sticky ON"
    requirement: CDP-02
    verification:
      - kind: unit
        ref: "tests/test_travel_mode.py#TestTravelModeStateMachine.test_sustained_disconnect_after_wake_grace_activates_auto_travel_mode_idempotently"
        status: pass
      - kind: unit
        ref: "tests/test_travel_mode.py#TestTravelModeStateMachine.test_wifi_stabilization_auto_exits_auto_travel_mode_but_preserves_sticky_manual"
        status: pass
    human_judgment: false
  - id: D3
    description: "Manual Travel Mode toggle is idempotent and auto-activation respects travel_mode_auto_enabled=False"
    requirement: CDP-02
    verification:
      - kind: unit
        ref: "tests/test_travel_mode.py#TestTravelModeStateMachine.test_manual_travel_mode_toggle_is_idempotent"
        status: pass
      - kind: unit
        ref: "tests/test_travel_mode.py#TestTravelModeStateMachine.test_auto_travel_mode_disabled_never_auto_activates"
        status: pass
    human_judgment: false
  - id: D4
    description: "filter_items_for_travel_mode filters library collections/episodes to downloaded URIs when Travel Mode is active and returns all items when inactive"
    requirement: CDP-02
    verification:
      - kind: unit
        ref: "tests/test_travel_mode.py#TestTravelModeFiltering"
        status: pass
    human_judgment: false

duration: 5min
completed: 2026-11-26
status: complete
---

# Phase 28 Plan 02: Offline / Travel Mode Resilience State Machine Summary

**Implemented 10s wake-from-suspend grace window (`WAKE_GRACE_WINDOW_S`), sticky manual vs auto Travel Mode state machine in `SessionBookmarkManager`, and `filter_items_for_travel_mode` offline filtering helper**

## Performance

- **Duration:** 5 min
- **Started:** 2026-11-26T10:25:50Z
- **Completed:** 2026-11-26T10:30:23Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added `WAKE_GRACE_WINDOW_S = 10.0` and extended `SessionBookmarkManager` with `set_manual_travel_mode`, `set_auto_travel_mode_enabled`, `get_travel_mode_state`, and `on_travel_mode_changed` callback notification.
- Updated `SessionBookmarkManager.on_poll_network_result` to suppress auto Travel Mode during the 10-second wake grace window after `_last_recovery_ts`, auto-activate after `wifi_grace_s` + `wake_grace_s`, and auto-exit on Wi-Fi stabilization unless `travel_mode_manual` is locked `True`.
- Added `filter_items_for_travel_mode` to `py_modules/resilience.py` and verified all 8 tests in `tests/test_travel_mode.py` alongside the full 742-test Python suite.

## Task Commits

Each task was committed atomically:

1. **Task 1: 10s wake-from-suspend grace window, sticky manual vs auto Travel Mode in SessionBookmarkManager, & Wave 0 tests/test_travel_mode.py** - `44757af` (feat)
2. **Task 2: Offline library filtering helpers (filter_items_for_travel_mode) & cached lyrics/mixes verification** - `dbc7a0d` (feat)

## Files Created/Modified
- `py_modules/resilience.py` - Added `WAKE_GRACE_WINDOW_S`, Travel Mode state machine methods on `SessionBookmarkManager`, and `filter_items_for_travel_mode`
- `tests/test_travel_mode.py` - Added 8 unit tests covering wake grace suppression, sustained disconnect auto-activation, Wi-Fi stabilization auto-exit vs sticky manual lock, idempotency, and offline item filtering

## Decisions Made
- Evaluated auto Travel Mode activation in `on_poll_network_result(False)` independently of `_network_lost_session` so sustained disconnects spanning past `WAKE_GRACE_WINDOW_S` still transition into Travel Mode.
- Placed the auto-exit check (`self.travel_mode_enabled and not self.travel_mode_manual`) at the top of `on_poll_network_result(True)` before early wake-recovery returns so Wi-Fi stabilization always clears auto Travel Mode.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `SessionBookmarkManager` Travel Mode state machine and `filter_items_for_travel_mode` are ready for `main.py` RPC wiring and frontend UI integration in subsequent Phase 28 plans.

---
*Phase: 28-cdp-offline-downloads-wi-fi-travel-mode-living-room-spotify*
*Completed: 2026-11-26*

## Self-Check: PASSED
- FOUND: `py_modules/resilience.py`
- FOUND: `tests/test_travel_mode.py`
- FOUND: `44757af`
- FOUND: `dbc7a0d`
