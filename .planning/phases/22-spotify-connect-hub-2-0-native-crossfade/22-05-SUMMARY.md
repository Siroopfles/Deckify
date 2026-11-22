---
phase: 22-spotify-connect-hub-2-0-native-crossfade
plan: 05
subsystem: backend
tags: [eco-mode, sysfs, dmi, steam-machine, fremont, hardware-detection]

requires:
  - phase: 22-03
    provides: "detect_host_hardware_label() in py_modules/rpc_playback.py using read_power_supply_state()"
provides:
  - "read_power_supply_state() skips scope == 'Device' peripheral batteries so wireless headsets/controllers do not trigger has_battery=True"
  - "detect_host_hardware_label() recognizes Valve Steam Machine 'Fremont' DMI codename alongside 'Steam Machine'"
affects: [eco-mode, devices-tab, connect-hub]

actuals:
  tokens: 1588
  tasks: 2
  commits: 2
plan_head_before: 35ee0ee9416cef8c7411f5cfea5994d5b7a8598a
plan_head_after: cf6bb7eabffc807a07d3f598627b88855a807ecc

tech-stack:
  added: []
  patterns:
    - "Filter Linux /sys/class/power_supply/* entries by scope != 'Device' before classifying system battery presence"
    - "Match Valve Steam Machine DMI codename 'fremont' case-insensitively in product_name and board_name"

key-files:
  created: []
  modified:
    - py_modules/eco.py
    - py_modules/rpc_playback.py
    - tests/test_eco.py
    - tests/test_connect_hub.py

key-decisions:
  - "Skip sysfs Battery entries with scope == 'Device' in read_power_supply_state() while preserving System and missing/empty scope entries"
  - "Include 'fremont' alongside 'steam machine' in detect_host_hardware_label() DMI token matching"

patterns-established:
  - "Peripheral battery exclusion: sysfs scope=='Device' entries are ignored by both PowerGovernor and detect_host_hardware_label()"

requirements-completed: [CONNECT-01]

coverage:
  - id: D1
    description: "read_power_supply_state() skips scope == 'Device' peripheral batteries while preserving System and missing-scope batteries"
    requirement: "CONNECT-01"
    verification:
      - kind: unit
        ref: "tests/test_eco.py#TestReadPowerSupplyState"
        status: pass
    human_judgment: false
  - id: D2
    description: "detect_host_hardware_label() matches 'fremont' DMI codename and resolves peripheral-battery-only desktops to 'Steam Machine'"
    requirement: "CONNECT-01"
    verification:
      - kind: unit
        ref: "tests/test_connect_hub.py#TestConnectHub.test_detect_host_hardware_label_fremont_dmi_and_peripheral_battery"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-11-22
status: complete
---

# Phase 22 Plan 05: Gap Closure G-22-4 (Steam Machine Fremont DMI & Peripheral Battery Filtering) Summary

**Excluded `scope == "Device"` wireless peripheral batteries from `read_power_supply_state()` and added `"fremont"` DMI matching in `detect_host_hardware_label()` so Steam Machine hosts report `"Steam Machine"` instead of `"Local Device"`.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-11-22T16:26:53Z
- **Completed:** 2026-11-22T16:30:50Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Updated `read_power_supply_state()` in `py_modules/eco.py` to skip `/sys/class/power_supply/*` entries with `scope == "Device"` (such as `corsair-void-1-battery` or wireless controllers), while preserving `scope == "System"` and missing/empty `scope` batteries.
- Updated `detect_host_hardware_label()` in `py_modules/rpc_playback.py` to match `"fremont"` alongside `"steam machine"` in DMI `product_name` and `board_name`.
- Added unit tests in `tests/test_eco.py` and `tests/test_connect_hub.py` covering both fixes (24/24 targeted tests pass; 640/640 full Python test suite pass via pre-commit hooks).

## Task Commits

Each task was committed atomically:

1. **Task 1: Ignore scope="Device" peripheral batteries in read_power_supply_state** - `74527c5` (fix)
2. **Task 2: Match Fremont DMI codename in detect_host_hardware_label** - `cf6bb7e` (fix)

## Files Created/Modified
- `py_modules/eco.py` - Skip `scope == "Device"` entries in `read_power_supply_state()`
- `py_modules/rpc_playback.py` - Match `"fremont"` alongside `"steam machine"` in `detect_host_hardware_label()`
- `tests/test_eco.py` - Extended `_make_supply` with `scope` and added `TestReadPowerSupplyState` peripheral battery tests
- `tests/test_connect_hub.py` - Added `test_detect_host_hardware_label_fremont_dmi_and_peripheral_battery`

## Decisions Made
None - followed plan as specified.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- UAT gap G-22-4 is closed and verified by unit tests.
- Ready for Phase 22 verification / UAT re-check.

## Self-Check: PASSED
- `py_modules/eco.py`: FOUND
- `py_modules/rpc_playback.py`: FOUND
- `tests/test_eco.py`: FOUND
- `tests/test_connect_hub.py`: FOUND
- Commit `74527c5`: FOUND
- Commit `cf6bb7e`: FOUND
