---
phase: 22-spotify-connect-hub-2-0-native-crossfade
plan: 04
subsystem: audio
tags: [crossfade, librespot, spotify_client, settings-tab, pipewire]

# Dependency graph
requires:
  - phase: 22-spotify-connect-hub-2-0-native-crossfade
    provides: Native crossfade setting, Flatpak prefs + CDP 9229 sync, and VolumeFader crossfade helpers from 22-02
provides:
  - No-op _maybe_trigger_local_crossfade for librespot with stale _crossfade_active recovery guard
  - CrossfadeSettingRow scoped to spotify_client and disabled with explanation for librespot
affects: [settings-tab, crossfade, librespot, spotify_client]

# Actuals (#2632)
actuals:
  tokens: 2428
  tasks: 2
  commits: 2
plan_head_before: e6c1732f5ebcaabc98ee9f8c2d8f910fb5bf5d03
plan_head_after: 7c03f810bfaca6bd55aca29517941ba0b1c38aa4
commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Scope multi-stream-only audio features (crossfade) to spotify_client in UI while keeping backend poll loop non-destructive for librespot"

key-files:
  created: []
  modified:
    - main.py
    - tests/test_crossfade.py
    - src/components/tabs/SettingsTab.tsx
    - src/components/tabs/SettingsTab.test.tsx

key-decisions:
  - "Removed librespot single-sink PipeWire dip-to-silence fallback in _maybe_trigger_local_crossfade while keeping a stale _crossfade_active recovery guard via trigger_crossfade_in(1.0)"
  - "Scoped CrossfadeSettingRow in SettingsTab.tsx to audioBackend === 'spotify_client' with disabled state, 0.6 opacity, early-return onChange guard, and explicit librespot explanation"

patterns-established:
  - "Retain recovery guard when retiring a volume-ducking workaround so no playback state can remain stuck muted"

requirements-completed: [RADIO-02]

coverage:
  - id: D1
    description: "librespot track transitions are never muted or dipped to silence by _maybe_trigger_local_crossfade, while stale _crossfade_active state is safely restored"
    requirement: RADIO-02
    verification:
      - kind: unit
        ref: "tests/test_crossfade.py#test_maybe_trigger_local_crossfade_never_ducks_librespot"
        status: pass
    human_judgment: false
  - id: D2
    description: "CrossfadeSettingRow in SettingsTab is enabled when audio_backend is spotify_client and disabled with explanation when audio_backend is librespot"
    requirement: RADIO-02
    verification:
      - kind: unit
        ref: "src/components/tabs/SettingsTab.test.tsx#Native Crossfade (RADIO-02)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Setting Crossfade (0-12s) when Official Spotify Client is active persists crossfade_seconds and syncs via Flatpak prefs and CDP port 9229"
    requirement: RADIO-02
    verification:
      - kind: unit
        ref: "tests/test_crossfade.py#test_set_setting_crossfade_validation_clamping_and_spotify_client_sync"
        status: pass
    human_judgment: false

# Metrics
duration: 4 min
completed: 2026-11-22
status: complete
---

# Phase 22 Plan 04: Close UAT Gap G-22-3 (Native Crossfade Scoping) Summary

**Removed the jarring `librespot` PipeWire dip-to-silence fallback in `main.py` and scoped `CrossfadeSettingRow` in `SettingsTab.tsx` to `spotify_client` with a disabled explanation for `librespot`**

## Performance

- **Duration:** 4 min
- **Started:** 2026-11-22T15:50:45Z
- **Completed:** 2026-11-22T15:54:50Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Removed the `trigger_crossfade_out` dip-to-silence branch from `main.py:_maybe_trigger_local_crossfade` so `librespot` track transitions are never unexpectedly muted, while retaining a `_crossfade_active` recovery guard calling `trigger_crossfade_in(1.0)`.
- Updated `CrossfadeSettingRow` in `src/components/tabs/SettingsTab.tsx` to accept `audioBackend` (defaulting to `"librespot"`), disabling the `SliderField` with `opacity: 0.6`, an early-return `onChange` guard, and an explicit explanation when `audio_backend !== "spotify_client"`.
- Verified all 5 tests in `tests/test_crossfade.py`, all 44 tests in `src/components/tabs/SettingsTab.test.tsx`, full Python suite (637 tests), full Vitest suite (23 files / 286 tests), `tsc --noEmit`, `eslint` (0 errors), and `rollup -c` build.

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove librespot PipeWire dip-to-silence fallback in _maybe_trigger_local_crossfade** - `2546b1f` (fix)
2. **Task 2: Scope and disable CrossfadeSettingRow in SettingsTab when audio_backend !== 'spotify_client'** - `7c03f81` (fix)

## Files Created/Modified
- `main.py` - Simplified `_maybe_trigger_local_crossfade` to a safe recovery guard for stale `_crossfade_active` state without dipping `librespot` audio.
- `tests/test_crossfade.py` - Replaced boundary fade-out test with `test_maybe_trigger_local_crossfade_never_ducks_librespot` verifying no fade-out calls and stale state recovery.
- `src/components/tabs/SettingsTab.tsx` - Added `audioBackend` prop to `CrossfadeSettingRow`, disabled slider with `0.6` opacity and clear description for `librespot`, and passed `status?.audio_backend ?? audioBackend`.
- `src/components/tabs/SettingsTab.test.tsx` - Updated `Native Crossfade (RADIO-02)` tests for `spotify_client` enabled/debounce behavior and `librespot` disabled behavior.

## Decisions Made
- Passed `status?.audio_backend ?? audioBackend` (where `audioBackend` falls back to `status?.settings?.audio_backend || "librespot"`) so `CrossfadeSettingRow` stays consistent whether `audio_backend` is read from top-level `StatusResponse` or `status.settings`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- UAT gap G-22-3 is closed; all Phase 22 plans (22-01 through 22-04) are complete and verified.

## Self-Check: PASSED
- `main.py`, `tests/test_crossfade.py`, `src/components/tabs/SettingsTab.tsx`, `src/components/tabs/SettingsTab.test.tsx` exist on disk.
- Commits `2546b1f` and `7c03f81` are ancestors of `HEAD`.

---
*Phase: 22-spotify-connect-hub-2-0-native-crossfade*
*Completed: 2026-11-22*
