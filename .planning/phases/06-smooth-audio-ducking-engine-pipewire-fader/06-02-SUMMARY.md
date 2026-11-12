---
phase: 06-smooth-audio-ducking-engine-pipewire-fader
plan: 02
subsystem: audio-engine
tags:
  - pipewire
  - pactl
  - vad
  - voice-activity-detection
  - hysteresis
  - audio-ducking
  - settings-ui
dependency_graph:
  requires:
    - py_modules/common.py
    - py_modules/volume.py
    - main.py
    - src/types.ts
    - src/components/tabs/SettingsTab.tsx
  provides:
    - VoiceActivityDetector
    - check_recording_streams
    - silence_hold_hysteresis
    - settings_tab_ducking_card
  affects:
    - py_modules/volume.py
    - main.py
    - src/components/tabs/SettingsTab.tsx
tech_stack:
  added: []
  patterns:
    - pactl list source-outputs metadata parsing for active uncorked microphone recording streams
    - 1.2s silence hold hysteresis delay window eliminating speech oscillation and volume pumping
    - Non-blocking asyncio background poller with power-saving idle sleep when playback is paused
    - Spatial GamepadUI navigation card with flow-children="horizontal" duration and mode selector pills
key_files:
  created:
    - src/components/tabs/SettingsTab.test.tsx
  modified:
    - py_modules/volume.py
    - main.py
    - src/components/tabs/SettingsTab.tsx
    - tests/test_volume.py
    - tests/test_e2e_requirements.py
decisions:
  - D-03: Implemented VoiceActivityDetector inspecting pactl list source-outputs for uncorked, unmuted voice streams (Discord, Steamcord, Steam Voice, webrtc) with a 1.2s silence hold delay preventing volume pumping.
  - D-04: Upgraded SettingsTab with dedicated Voice Chat Ducking toggle and interactive silence hold delay duration pills (0.8s, 1.2s, 1.6s, 2.0s).
  - D-05: Provided Attenuation Mode selector between Proportional (-50%) and Fixed Level (25%) ducking.
  - D-02: Added interactive pills for Fade Down duration (0.5s, 1.0s, 1.5s, 2.0s) and Fade Up duration (1.0s, 1.5s, 2.0s, 3.0s).
metrics:
  duration: 12m
  completed_date: "2026-11-12"
status: complete
actuals:
  tokens: 11200
  tasks: 3
  commits: 3
  plan_head_before: 9388a4cb91a6abd7f9748d7c7c6b6cfe3cbd3abd
  plan_head_after: 554fe9005fb3aae7cae5eaeeb3fe23c073a33fa6
---

# Phase 06 Plan 02: Voice Activity Detector & SettingsTab Audio Ducking UI Summary

Background Voice Activity Detection (`VoiceActivityDetector`) with 1.2s silence hold hysteresis, full SettingsTab ducking configuration card, and comprehensive Vitest/Python test coverage.

## Overview of Work Executed

1. **Voice Activity Detector (`py_modules/volume.py`, `main.py`):**
   - Implemented `VoiceActivityDetector` background polling service inspecting `pactl list source-outputs` for active recording streams.
   - Filtered out corked (`corked: yes`) or muted (`mute: yes`) streams, matching known voice communication clients (`discord`, `steamcord`, `steam`, `steamwebhelper`, `webrtc`) per D-03.
   - Enforced 1.2s silence hold delay window after speech ceases before releasing ducking, eliminating annoying volume pumping between words or natural conversational pauses.
   - Incorporated power-saving throttling: idles and sleeps 2.0s when voice ducking is disabled, and sleeps 1.0s when Spotify music playback is paused.
   - Supervised lifecycle in `main.py`: initialized and started in `_main()`, cleanly cancelled and stopped in `_unload()`.
   - Added `_is_playing` helper on `Plugin` to dynamically detect playback state.

2. **SettingsTab Audio Ducking & Voice Configuration UI (`src/components/tabs/SettingsTab.tsx`):**
   - Replaced legacy game balance controls with a comprehensive "Smooth Audio Ducking Engine" card.
   - Added Game Audio Ducking master toggle with active status display.
   - Built spatial navigation horizontal rows (`flow-children="horizontal"`) for:
     - Attenuation Mode: "Proportional (-50%)" vs "Fixed Level (25%)" (D-05).
     - Fade Down Speed pills: 0.5s, 1.0s, 1.5s, 2.0s (D-02).
     - Fade Up Speed pills: 1.0s, 1.5s, 2.0s, 3.0s (D-02).
     - Voice Chat Ducking (Discord / Steam Voice) master toggle (D-04).
     - Silence Hold Delay pills: 0.8s, 1.2s, 1.6s, 2.0s (D-04).
   - Validated backend settings persistence and boundary clamping in `main.py` and `tests/test_e2e_requirements.py`.

3. **Complete Ducking Validation Suite (`src/components/tabs/SettingsTab.test.tsx`, `tests/test_volume.py`):**
   - Created `src/components/tabs/SettingsTab.test.tsx` with 10 unit tests verifying rendering of all ducking pill groups, active pill states, toggle reactions, and parameter dispatching via `backendSetSetting`.
   - Added 16 unit tests in `tests/test_volume.py` for `VoiceActivityDetector` covering Discord stream parsing, uncorked/unmuted filtering, non-voice application rejection, pactl failure fallbacks, silence hold hysteresis timing, power throttling, and task lifecycle.
   - Added fallback tests for `VolumeFader` handling subprocess exceptions and unavailable `pactl` environments.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected StatusResponse mock typing in SettingsTab.test.tsx**
- **Found during:** Task 3 typecheck
- **Issue:** Mock test status object contained obsolete `username` and `device_name` properties not declared in `StatusResponse`, and spread `settings` had inferred undefined union types.
- **Fix:** Aligned `mockStatus` and `disabledStatus` exactly with `StatusResponse` and `EngineSettings` in `src/types.ts`.
- **Files modified:** `src/components/tabs/SettingsTab.test.tsx`
- **Commit:** `554fe90`

## Threat Surface Scan

| Flag | File | Description | Mitigation Status |
|------|------|-------------|-------------------|
| T-06-03 | `py_modules/volume.py` | Information Disclosure via microphone stream inspection | Mitigated: Inspected only metadata headers (`application.name`, `corked`, `mute`) from `pactl list source-outputs`; zero raw PCM audio buffers accessed or stored. |
| T-06-04 | `py_modules/volume.py` | Audio oscillation / DoS through voice activity poller | Mitigated: 1.2s silence hold delay eliminates rapid volume pumping; polling loop sleeps 1.0s–2.0s when paused or disabled. |
| T-06-SC | Dependencies | External package supply chain attacks | Mitigated: Zero new dependencies introduced. |

## Verification Results

- `py -m unittest tests/test_volume.py`: 42 tests PASSED (2.27s)
- `py -m unittest tests/test_volume.py -k test_vad`: 16 tests PASSED (0.60s)
- `py -m unittest tests/test_e2e_requirements.py -k test_set_setting_validates_duck`: 3 tests PASSED (0.11s)
- `pnpm test src/components/tabs/SettingsTab.test.tsx`: 10 tests PASSED (0.33s)
- `pnpm test`: 65 tests PASSED across 6 test files (0.76s)
- `pnpm run typecheck`: PASSED (`tsc --noEmit` exited 0)
- Full Python test suite in pre-commit hook: 374 tests PASSED (16.3s)

## Self-Check: PASSED

- FOUND: `src/components/tabs/SettingsTab.test.tsx`
- FOUND: `src/components/tabs/SettingsTab.tsx`
- FOUND: `py_modules/volume.py`
- FOUND: `main.py`
- FOUND: `tests/test_volume.py`
- FOUND: `tests/test_e2e_requirements.py`
- FOUND: Commit `63d36a4`
- FOUND: Commit `adecfbb`
- FOUND: Commit `554fe90`
