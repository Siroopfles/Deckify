---
phase: 14-gentle-sleep-timer-fade-out
plan: 01
subsystem: audio-fader-sleep-timer
tags: [sleep-timer, volume-fader, pipewire, tdd, python]
requires: []
provides:
  - VolumeFader._sleep_locked priority lock and _compute_target_sink_volume helper
  - VolumeFader.start_sleep_fade and release_sleep_lock async methods
  - sleep_timer_worker fade-out, pause, 1.2s PipeWire drain, and pre-shutdown volume restore
  - Deterministic task cancellation and 0.5s restore in set_sleep_timer / sleep_timer_worker
  - get_sleep_timer_status fading boolean and Plugin._sleep_timer_fading state field
affects:
  - py_modules/volume.py
  - py_modules/system.py
  - main.py
  - tests/test_volume.py
  - tests/test_features.py
tech-stack:
  added: []
  patterns:
    - Priority lock (_sleep_locked) on VolumeFader preserving _duck_reasons across sleep fade
    - Timed fade-out -> pause -> 1.2s PipeWire drain -> release_sleep_lock(0.0, wait=True) -> shutdown_system()
key-files:
  created: []
  modified:
    - py_modules/volume.py
    - py_modules/system.py
    - main.py
    - tests/test_volume.py
    - tests/test_features.py
decisions:
  - Extracted _compute_target_sink_volume() on VolumeFader so set_ducking() and release_sleep_lock() share one target-volume calculation.
  - Added did_fade guard in sleep_timer_worker so only timed fades perform the 1.2s PipeWire drain and release_sleep_lock(0.0, wait=True) before shutdown_system().
requirements-completed: [SLEEP-01]
metrics:
  duration: ~3m
  completed_date: "2026-11-16"
status: complete
commits: 2
plan_head_before: 93d391ad6cfe3aadbf96e0db56dce6208a868563
plan_head_after: 0690180bffa353deb2fd50d968489f11bfbc6028
actuals:
  tasks: 2
  commits: 2
---

# Phase 14 Plan 01: Backend Sleep Timer Fade-Out Engine Summary

**Implemented `"sleep"` priority locking in `VolumeFader` and orchestrated early fade-out, pause, 1.2s PipeWire drain, baseline restoration, and deterministic mid-fade cancellation in `sleep_timer_worker`.**

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | End-to-end `VolumeFader` `"sleep"` priority lock & `_duck_reasons` state machine | `250d72e` | `py_modules/volume.py`, `tests/test_volume.py` |
| 2 | Orchestrate early fade, pause, 1.2s drain, pre-shutdown restore, and mid-fade cancel | `0690180` | `py_modules/system.py`, `main.py`, `tests/test_features.py` |

## What Was Built

1. **`VolumeFader` Sleep Priority Lock (`py_modules/volume.py`):**
   - Added `self._sleep_locked: bool = False` in `VolumeFader.__init__`.
   - Extracted `_compute_target_sink_volume(self) -> float` from `set_ducking` so both `set_ducking` and `release_sleep_lock` compute identical proportional/fixed ducked or baseline (`100.0` / `150.0`) targets.
   - Updated `set_ducking` to update `self._duck_reasons` (`add`/`discard`) and return immediately when `self._sleep_locked` is `True`.
   - Added `start_sleep_fade(duration_sec)` to acquire `_sleep_locked = True`, call `fade_to(0.0, duration_sec)`, and await `self._fade_task`.
   - Added `release_sleep_lock(restore_duration=0.0, wait=False)` to release `_sleep_locked = False`, fade to `_compute_target_sink_volume()`, and optionally await `self._fade_task`.

2. **Sleep Timer Fade Orchestration (`py_modules/system.py`, `main.py`):**
   - Added `_sleep_timer_fading: bool = False` on `Plugin` (`main.py`).
   - Updated `get_sleep_timer_status(plugin)` to expose `"fading": bool(getattr(plugin, "_sleep_timer_fading", False))` (or `False` when inactive).
   - Updated `set_sleep_timer(...)` to deterministically `await` a cancelled `_sleep_timer_task` (catching `asyncio.CancelledError`) and reset `_sleep_timer_fading = False`.
   - Updated `sleep_timer_worker(plugin)` to begin fading at `T - fade_duration` (or immediately if remaining < `fade_duration`), pause at `0%`, wait `1.2s` for PipeWire buffer drain, and `await fader.release_sleep_lock(0.0, wait=True)` before `shutdown_system()`. `end_of_track=True` and `sleep_timer_fade_enabled=False` bypass fading. `asyncio.CancelledError` resets `_sleep_timer_fading` and restores in `0.5s` via `release_sleep_lock(0.5, wait=False)`.

## Verification Results

- `py -3 -m unittest discover -s tests -p "test_volume.py"`: **58 tests passed** (including `test_sleep_lock_blocks_ducking_fades_and_tracks_reasons` and `test_release_sleep_lock_restores_ducked_or_baseline`).
- `py -3 -m unittest discover -s tests -p "test_features.py"`: **24 tests passed** (including all 5 new sleep timer fade lifecycle tests).
- Full Python suite (pre-commit hook on `0690180`): **477 tests passed** with 0 failures/errors.

## Deviations from Plan

None - plan executed as written.

## Known Stubs

None.

## Self-Check: PASSED

- `py_modules/volume.py`: FOUND
- `py_modules/system.py`: FOUND
- `main.py`: FOUND
- `tests/test_volume.py`: FOUND
- `tests/test_features.py`: FOUND
- Commit `250d72e`: FOUND in `HEAD`
- Commit `0690180`: FOUND in `HEAD`
