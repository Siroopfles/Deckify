---
phase: 22-spotify-connect-hub-2-0-native-crossfade
plan: 02
subsystem: audio-playback
tags: [crossfade, librespot, spotify_client, cdp, pipewire, settings-ui]
requires:
  - phase: 22-spotify-connect-hub-2-0-native-crossfade
    provides: "Spotify Connect Hub 2.0 (22-01)"
provides:
  - "Persistent crossfade_seconds (0..12s, default 0) in common.py and get_status().settings"
  - "Official Spotify Client prefs (audio.crossfade_v2, audio.crossfade.time_v2) and live CDP SettingsAPI sync"
  - "VolumeFader.trigger_crossfade_out and trigger_crossfade_in for librespot boundary fades"
  - "SettingsTab CrossfadeSettingRow SliderField (0-12s, 300ms debounce)"
affects: [settings, volume-fader, spotify-client-sync, playback-polling]
tech-stack:
  added: []
  patterns:
    - "3-path crossfade synchronization (Flatpak prefs + CDP SettingsAPI for spotify_client, PipeWire VolumeFader boundary fades for librespot)"
    - "Extracted CrossfadeSettingRow FC component with 300ms debounced set_setting and rollback on failure"
key-files:
  created:
    - tests/test_crossfade.py
  modified:
    - py_modules/common.py
    - py_modules/engine.py
    - py_modules/volume.py
    - main.py
    - src/types.ts
    - src/components/tabs/SettingsTab.tsx
    - src/components/tabs/SettingsTab.test.tsx
decisions:
  - "Exported CrossfadeSettingRow as a focused helper component in SettingsTab.tsx to isolate 300ms debounce state/timers and keep SettingsTab complexity unchanged."
  - "Guarded VolumeFader.trigger_crossfade_out and trigger_crossfade_in on _sleep_locked and restored via _compute_target_sink_volume() so Sleep Timer locks and per-game ducking/overrides are never overridden."
metrics:
  duration: 4m
  completed: 2026-11-22
status: complete
commits: 2
plan_head_before: 504f652031c5c9cd8fbb2b02407678ad34d5157b
plan_head_after: 963d07729714f493bcbaccb52fcc1fe6bdade743
actuals:
  tokens: 6836
  tasks: 2
  commits: 2
---

# Phase 22 Plan 02: Native Track Crossfade (RADIO-02) Summary

**Persistent `crossfade_seconds` (`0–12s`), 3-path Official Spotify Client `prefs`/CDP + `librespot` PipeWire `VolumeFader` boundary transitions, and debounced `SettingsTab` `SliderField`.**

## Performance

- **Duration:** 4m
- **Started:** 2026-11-22T12:31:32Z
- **Completed:** 2026-11-22T12:35:12Z
- **Tasks:** 2
- **Files modified:** 7 modified, 1 created

## Accomplishments

- **Task 1 (Tracer, TDD):** Added `crossfade_seconds: 0` to `DEFAULT_SETTINGS` and stopped stripping it in `_load_settings` (`py_modules/common.py`). Extended `_update_spotify_prefs_content` to write `audio.crossfade_v2` and `audio.crossfade.time_v2` (`py_modules/engine.py`). Added `VolumeFader.trigger_crossfade_out` and `VolumeFader.trigger_crossfade_in` respecting `_sleep_locked` and `_compute_target_sink_volume()` (`py_modules/volume.py`). Wired `crossfade_seconds` validation (`bool` rejection, `0..12` clamping), `public_keys` exposure, `_sync_spotify_client_crossfade_cdp`, and `_maybe_trigger_local_crossfade` in `main.py`. Added 5 unit tests in `tests/test_crossfade.py`.
- **Task 2 (Auto, TDD):** Added `crossfade_seconds?: number` to `EngineSettings` (`src/types.ts`), implemented `CrossfadeSettingRow` with a `0–12s` `SliderField` and `300ms` debounced `set_setting` + error toast in `SettingsTab.tsx`, and added unit tests in `src/components/tabs/SettingsTab.test.tsx`.

## Task Commits

1. **Task 1: Native Crossfade backend + tests** — `8b5f2a1` (`feat(22-02): add native crossfade backend persistence, prefs/CDP sync, and VolumeFader boundary transitions`)
2. **Task 2: SettingsTab Crossfade SliderField + tests** — `963d077` (`feat(22-02): add Crossfade SliderField (0-12s, 300ms debounce) to SettingsTab`)

## Deviations from Plan

### Out-of-Scope Pre-Existing Lint Warnings

- Running `pnpm exec eslint --max-warnings=0 src/components/tabs/SettingsTab.tsx src/types.ts` reported 22 pre-existing warnings in unrelated parts of `src/components/tabs/SettingsTab.tsx` (`@typescript-eslint/no-explicit-any`, `max-lines-per-function`, `complexity`, `no-empty`). `CrossfadeSettingRow` and `src/types.ts` had 0 warnings and 0 errors, and `tsc --noEmit` + `eslint` (via `lint-staged`) + `vitest` + `rollup` build all passed. Logged to `.planning/phases/22-spotify-connect-hub-2-0-native-crossfade/deferred-items.md`.

## Verification Results

- `py -3 -m unittest tests/test_crossfade.py -v`: 5/5 passed.
- Full Python suite (via pre-commit on Task 1): 634 tests passed.
- `pnpm test -- --run src/components/tabs/SettingsTab.test.tsx`: 43/43 passed.
- Full frontend suite (via pre-commit on Task 2): 23 test files, 282/282 tests passed, `tsc --noEmit` passed, `rollup` build passed.
- `pnpm exec eslint --max-warnings=0 src/types.ts`: 0 warnings, 0 errors.

## Self-Check: PASSED

- `tests/test_crossfade.py`: FOUND
- `py_modules/common.py`, `py_modules/engine.py`, `py_modules/volume.py`, `main.py`: FOUND
- `src/types.ts`, `src/components/tabs/SettingsTab.tsx`, `src/components/tabs/SettingsTab.test.tsx`: FOUND
- Commits `8b5f2a1` and `963d077`: FOUND in `git log`
