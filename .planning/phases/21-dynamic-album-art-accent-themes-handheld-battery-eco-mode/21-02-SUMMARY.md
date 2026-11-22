---
phase: 21-dynamic-album-art-accent-themes-handheld-battery-eco-mode
plan: 02
subsystem: backend-power-governor
tags: [eco-mode, power-governor, sysfs, settings, wake-on-play, python]
requires: []
provides:
  - "PowerGovernor and read_power_supply_state() in py_modules/eco.py"
  - "Phase 21 settings defaults and validation (accent_theme, eco_mode_enabled, eco_timeout_minutes, eco_sleep_spotify_client)"
  - "Transparent wake_for_playback() in control_playback, play_tracks, and quick_play_pinned"
affects:
  - py_modules/eco.py
  - py_modules/common.py
  - py_modules/rpc_playback.py
  - main.py
  - tests/test_eco.py
tech-stack:
  added: []
  patterns:
    - "Linux sysfs /sys/class/power_supply/* reader with Steam Machine / desktop (False, False) safety"
    - "asyncio.Lock supervision loop in PowerGovernor matching DockAudioSwitcher"
key-files:
  created:
    - py_modules/eco.py
    - tests/test_eco.py
  modified:
    - py_modules/common.py
    - main.py
    - py_modules/rpc_playback.py
decisions:
  - "Require explicit type=='Battery' and status=='Discharging' in read_power_supply_state() so Steam Machine / desktop hardware without a Battery sysfs entry is always treated as AC-powered"
  - "Snap eco_timeout_minutes to 5-minute steps within [5, 30] while rejecting bool and non-integer values"
  - "Emit decky.emit('eco_status_changed', status_dict) only on state signature changes (or forced on wake_for_playback) guarded with try/except"
status: complete
metrics:
  duration: 6m
  completed_date: 2026-11-22
actuals:
  tasks: 2
  commits: 2
---

# Phase 21 Plan 02: Backend PowerGovernor, Phase 21 Settings & Wake-on-Play Summary

Implemented the `ECO-01` backend `PowerGovernor` (`py_modules/eco.py`), Phase 21 settings schema and `set_setting()` validation (`py_modules/common.py`, `main.py`), `get_status().eco_status` exposure, and transparent `wake_for_playback()` integration in `py_modules/rpc_playback.py`.

## Tasks Completed

1. **Task 1: Create PowerGovernor (`py_modules/eco.py`) and Wave 0 test suite (`tests/test_eco.py`)** (`372c73b`)
   - Implemented `read_power_supply_state()` reading `/sys/class/power_supply/<entry>/{type,status}` via `os.scandir` with `OSError` guards, returning `(False, False)` when sysfs is missing or no `Battery` entry exists.
   - Implemented `PowerGovernor` with 5.0s background supervision loop, `asyncio.Lock` evaluation, dock/AC/desktop bypass, gameplay `animations_suspended` flag, idle paused timeout (`5–30` min) engine sleep (`librespot` by default, or `spotify_client` when `eco_sleep_spotify_client=True`), and `wake_for_playback()`.
   - Verified with 9 unit tests in `tests/test_eco.py`.

2. **Task 2: Register Phase 21 settings, PowerGovernor lifecycle in `main.py`, and `wake_for_playback` in `rpc_playback.py`** (`8ee8eca`)
   - Added `accent_theme` (`"spotify_green"`), `eco_mode_enabled` (`True`), `eco_timeout_minutes` (`15`), and `eco_sleep_spotify_client` (`False`) to `DEFAULT_SETTINGS` in `py_modules/common.py`.
   - Wired `self._power_governor` lifecycle in `main.py` `_main()` and `_unload()`, exposed all 4 keys in `get_status().settings` and `eco_status` in `get_status()`, and added strict validation in `set_setting()`.
   - Integrated `wake_for_playback()` into `control_playback`, `play_tracks`, and `quick_play_pinned` in `py_modules/rpc_playback.py`.
   - Extended `tests/test_eco.py` to 13 tests and verified full Python suite (`624` tests OK).

## Deviations from Plan

None - plan executed as written.

## Verification

- `py -3 -m unittest discover -s tests -p "test_eco.py"` — 13 tests ran, OK.
- `py -3 -m unittest discover -s tests -p "test_*.py"` — 624 tests ran, OK.

## Self-Check: PASSED

- `py_modules/eco.py`: FOUND
- `tests/test_eco.py`: FOUND
- `py_modules/common.py`: FOUND
- `main.py`: FOUND
- `py_modules/rpc_playback.py`: FOUND
- Commits `372c73b` and `8ee8eca`: FOUND in git history
