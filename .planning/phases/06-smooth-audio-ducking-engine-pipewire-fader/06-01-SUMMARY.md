---
phase: 06-smooth-audio-ducking-engine-pipewire-fader
plan: 01
subsystem: audio-engine
tags:
  - pipewire
  - pactl
  - audio-ducking
  - volume-fader
  - cosine-easing
  - game-lifecycle
dependency_graph:
  requires:
    - py_modules/common.py
    - py_modules/volume.py
    - main.py
    - src/types.ts
    - src/index.tsx
  provides:
    - VolumeFader
    - cosine_ease
    - trigger_ducking
    - get_ducking_state
    - ducking_state_changed
  affects:
    - py_modules/volume.py
    - main.py
    - src/index.tsx
tech_stack:
  added: []
  patterns:
    - Non-blocking S-curve cosine volume easing loop (50ms slices)
    - One-time PipeWire sink-input ID caching preventing subprocess storms
    - Clean mid-flight asyncio task cancellation and smooth continuous ramping
    - 3-second multi-process launcher exit debounce in Steam GamepadUI
    - Real-time QAM visual feedback with elevated DUCKED pill badge
key_files:
  created:
    - tests/test_volume.py
  modified:
    - py_modules/common.py
    - py_modules/volume.py
    - main.py
    - src/types.ts
    - src/index.tsx
    - tests/test_e2e_requirements.py
decisions:
  - D-01: Used cosine easing S-curve (0.5 * (1 - cos(pi * t))) with 50ms time slices executed in non-blocking asyncio tasks.
  - D-01: One-time resolution of PipeWire sink input ID at fade start with invalidation on completion or error to eliminate subprocess storms.
  - D-05: Implemented proportional (-50% default) and fixed absolute target volume attenuation modes.
  - D-06: 100% local PipeWire sink-input volume manipulation via pactl set-sink-input-volume without Spotify Web API volume calls or rate limit impact.
  - D-06: QAM volume slider displays elevated green DUCKED badge and dynamically mirrors audible effective volume.
  - DUCK-01: 3.0-second exit debounce window in AppLifetime notifications prevents EA/Ubisoft/Proton helper launcher flapping.
metrics:
  duration: 14m
  completed_date: "2026-11-12"
status: complete
actuals:
  tokens: 9117
  tasks: 3
  commits: 3
  plan_head_before: a5848b4ae9dea4e2067050f1a4cc6869b52d6d75
  plan_head_after: 3ce8b832045d921b156336e2942db74cc1bda4e1
---

# Phase 06 Plan 01: Core Local PipeWire Audio Fader & Game Ducking Summary

Non-blocking PipeWire sink-input volume fader using cosine easing, 3s launcher exit debounce, and QAM DUCKED visual feedback with zero Spotify Web API calls.

## Overview of Work Executed

1. **VolumeFader Service (`py_modules/volume.py`):**
   - Implemented `VolumeFader` class with non-blocking `asyncio` task execution at 50ms time slices.
   - Implemented exact cosine easing formula `cosine_ease(progress)` (`0.5 * (1.0 - math.cos(math.pi * progress))`) to ensure zero-derivative boundaries without audio clicks or abrupt volume steps.
   - Built one-time `resolve_sink_input_id` resolution with integer ID caching (`self._cached_sink_input_id`), eliminating subprocess storms during fading (mitigating T-06-01).
   - Validated sink input ID as strictly numeric digits and clamped volume percentages to 0–150% (mitigating T-06-02).
   - Implemented mid-flight task cancellation safety: when interrupted, the active fade task is cleanly cancelled, intermediate volume is preserved as the start level, and the new transition begins smoothly without jumping.
   - Added support for both `proportional` (relative reduction, e.g. -50%) and `fixed` (absolute ceiling) ducking modes per D-05.
   - Broadcasts real-time state changes via `decky.emit("ducking_state_changed", ...)`.

2. **Backend Daemon & Settings Integration (`py_modules/common.py`, `main.py`):**
   - Added ducking configuration keys (`duck_fade_down_duration`, `duck_fade_up_duration`, `ducking_mode`, `ducking_proportional_pct`, `voice_ducking_enabled`, `voice_ducking_volume`, `voice_ducking_hold_delay`) to `DEFAULT_SETTINGS` and boundary sanitization in `_load_settings`.
   - Exposed `trigger_ducking(active, reason, app_id)` and `get_ducking_state()` RPC endpoints in `main.py`.
   - Extended `set_setting` with parameter validation and bounds clamping for all ducking options.
   - Whitelisted ducking keys in `get_status` public settings.

3. **Frontend Game Lifecycle & QAM Visuals (`src/types.ts`, `src/index.tsx`):**
   - Declared `DuckingMode` and `DuckingState` types, and extended `EngineSettings`.
   - Replaced old remote `backendSetVolume` Web API calls in `RegisterForAppLifetimeNotifications` with local `backendTriggerDucking`.
   - Implemented 3.0-second multi-process exit debounce: when `running: false` fires, a 3000ms timer starts; if child launchers or game binaries fire `running: true` within 3.0s, the timer is cleared and ducked volume is preserved.
   - Added `ducking_state_changed` event subscription in QAM `Content`.
   - Enhanced QAM volume slider to display an elevated `#1db954` green `DUCKED` pill badge and animate slider values to match live effective volume.

4. **Comprehensive Unit & E2E Test Suite (`tests/test_volume.py`, `tests/test_e2e_requirements.py`):**
   - Created `tests/test_volume.py` with 10 unit tests covering PID and application-name sink input resolution, argument sanitization, cosine easing mathematics, one-time caching, mid-flight interruption continuity, and proportional vs. fixed calculation modes.
   - Added E2E test cases in `tests/test_e2e_requirements.py` validating `DEFAULT_SETTINGS` ducking schema, setting validation bounds, RPC responses, and frontend debounce/pill-badge configurations.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Self-healing lazy initialization for VolumeFader in test environments**
- **Found during:** Task 3 E2E test run
- **Issue:** Tests instantiating `Plugin()` directly without invoking `_main()` found `_volume_fader` uninitialized, causing `trigger_ducking` RPC to decline with error.
- **Fix:** Initialized `self._volume_fader = volume.VolumeFader(self)` in `Plugin.__init__` and added lazy fallback instantiation inside `trigger_ducking` and `get_ducking_state`.
- **Files modified:** `main.py`
- **Commit:** `3ce8b83`

## Threat Surface Scan

| Flag | File | Description | Mitigation Status |
|------|------|-------------|-------------------|
| T-06-01 | `py_modules/volume.py` | Subprocess flooding during 50ms time slices | Mitigated: Resolved and cached `sink_input_id` once at fade start; direct `pactl set-sink-input-volume` per tick. |
| T-06-02 | `py_modules/volume.py` | Command injection via sink ID or volume | Mitigated: Strictly verified numeric digits for sink ID, clamped volume float 0–150, passed as argument list without `shell=True`. |
| T-06-SC | Dependencies | External package supply chain attacks | Mitigated: Zero new dependencies added; built entirely with native stdlib and existing packages. |

## Verification Results

- `py -m unittest tests/test_volume.py`: 20 tests PASSED (0.34s)
- `py -m unittest tests/test_volume.py -k test_volume_fader`: 10 tests PASSED (0.18s)
- `py -m unittest tests/test_e2e_requirements.py -k duck`: 5 tests PASSED (0.13s)
- `pnpm run typecheck`: PASSED (`tsc --noEmit` exited 0)
- `pnpm test`: 55 tests PASSED across 5 files (680ms)
- Full Python test suite in pre-commit hook: 350 tests PASSED (14.8s)

## Self-Check: PASSED

- FOUND: `tests/test_volume.py`
- FOUND: `py_modules/volume.py`
- FOUND: `py_modules/common.py`
- FOUND: `main.py`
- FOUND: `src/types.ts`
- FOUND: `src/index.tsx`
- FOUND: Commit `5a025c8`
- FOUND: Commit `e725f83`
- FOUND: Commit `3ce8b83`
