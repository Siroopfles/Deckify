---
phase: 20-100-silent-hud-toasts-extended-in-game-quick-chords
plan: 06
subsystem: backend-input
tags: [hidraw, evdev, gamepad, chords, python-stdlib, decky-emit]
requires:
  - phase: 20-01
    provides: gamepad_chords_enabled setting and CHORD-01 schema
provides:
  - Passive pure-Python stdlib hidraw/evdev controller input watcher (py_modules/input_watch.py)
  - Plugin lifecycle wiring and controller_input decky.emit bridge in main.py
affects:
  - 20-07-PLAN (frontend controller_input event listener)
tech-stack:
  added: []
  patterns:
    - "Passive read-only /dev/hidraw* and /dev/input/event* monitoring via asyncio loop.add_reader without EVIOCGRAB"
    - "Cross-device 30ms event deduplication and virtual pad (0x28DE:0x11FF) suppression when Valve hidraw is active"
key-files:
  created:
    - py_modules/input_watch.py
    - tests/test_input_watch.py
  modified:
    - main.py
decisions:
  - "Used 64-bit Linux struct input_event format (<qqHHi, 24 bytes) and 64-bit sysfs capabilities/key word shifting for SteamOS x86_64 accuracy"
  - "Used getattr(os, 'O_NONBLOCK', 0o4000) so the module imports and tests cleanly on Windows dev machines as well as SteamOS Linux"
metrics:
  duration: ~5m
  completed: 2026-11-22
status: complete
commits: 2
plan_head_before: 799cb438ad40f1bef97618b3bd9f78753476fa00
plan_head_after: 5b0a5a17c4924de3bd24ac0ccae395aa194b22d0
actuals:
  tokens: 8512
  tasks: 2
  commits: 2
---

# Phase 20 Plan 06: Passive Backend Controller Input Watcher Summary

**Pure-Python stdlib `/dev/hidraw*` and `/dev/input/event*` passive watcher emitting normalized `controller_input` events via `decky.emit` so in-game chords fire even when Gamescope/Proton holds exclusive JS focus.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-11-22T00:19:34Z
- **Completed:** 2026-11-22T00:24:18Z
- **Tasks:** 2 (TDD)
- **Files modified:** 3 (`py_modules/input_watch.py`, `main.py`, `tests/test_input_watch.py`)

## Accomplishments

- Created `py_modules/input_watch.py` using only Python stdlib (`asyncio`, `dataclasses`, `glob`, `inspect`, `os`, `re`, `struct`, `time`, `typing`) with zero external pip dependencies.
- Implemented `parse_valve_hidraw_report` and `diff_valve_button_masks` for Valve Steam Deck (`0x28DE:0x1205`, report `0x09`) and Steam Controller 2026 / Triton (`0x28DE:0x1302..0x1305`, reports `0x42`, `0x45`, `0x47`), mapping button bitmasks into Deckify `GAMEPAD_BUTTON` IDs (`1..28`).
- Implemented `parse_evdev_event` for 24-byte Linux `struct input_event` (`EV_KEY` excluding auto-repeat `value == 2`, and `EV_ABS` `ABS_HAT0X`/`ABS_HAT0Y` D-pad transitions).
- Implemented `ControllerInputWatcher` with strict read-only device opening (`os.O_RDONLY | O_NONBLOCK`, never `EVIOCGRAB`), automatic suppression of `0x28DE:0x11FF` virtual pad when Valve `hidraw` is active, 30ms cross-device `(button, pressed)` deduplication, 5s periodic + on-demand `rescan()`, and graceful `PermissionError`/`FileNotFoundError`/`OSError` handling.
- Wired `ControllerInputWatcher` into `main.py` (`Plugin._main`, `Plugin._unload`, `Plugin.set_setting("gamepad_chords_enabled", ...)`, `Plugin._on_deck_resume`, and `Plugin._on_controller_input_event` emitting `controller_input`).

## Task Commits

Each task was committed atomically:

1. **Task 1: Create py_modules/input_watch.py passive hidraw/evdev controller watcher** - `1165279` (`feat`)
2. **Task 2: Wire ControllerInputWatcher lifecycle and controller_input emission in main.py** - `5b0a5a1` (`feat`)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed 24-byte `struct input_event` unpack format (`<qqHHi` instead of `<llHHi`)**
- **Found during:** Task 1 implementation
- **Issue:** Plan specified `len(raw) == 24` with `struct.unpack("<llHHi", raw)`, but in Python `struct`, `<llHHi` is 16 bytes (because `<` forces standard 4-byte `long`), which raises `struct.error` on 24-byte 64-bit Linux `input_event` structs.
- **Fix:** Used `<qqHHi` (24 bytes: two 8-byte `int64` `timeval` fields + `HHi`) and 64-bit word shifting in `_parse_hex_bitmask` for sysfs `capabilities/key`.
- **Files modified:** `py_modules/input_watch.py`, `tests/test_input_watch.py`
- **Commit:** `1165279`

**2. [Rule 3 - Blocking] Cross-platform `O_NONBLOCK` lookup for Windows test runner**
- **Found during:** Task 1 verification
- **Issue:** `os.O_NONBLOCK` is not defined on Windows `os` module.
- **Fix:** Used `getattr(os, "O_NONBLOCK", 0o4000)` in `py_modules/input_watch.py` and `tests/test_input_watch.py`.
- **Files modified:** `py_modules/input_watch.py`, `tests/test_input_watch.py`
- **Commit:** `1165279`

## Verification

- `py -3 -m unittest tests.test_input_watch tests.test_chord_settings` — Ran 15 tests in 0.551s, OK.
- `py -3 -m unittest discover -s tests` (via pre-commit hook on `5b0a5a1`) — Ran 611 tests in 67.825s, OK.

## Self-Check: PASSED

- `py_modules/input_watch.py`: FOUND
- `main.py`: FOUND
- `tests/test_input_watch.py`: FOUND
- Commit `1165279`: FOUND
- Commit `5b0a5a1`: FOUND
