---
phase: 22-spotify-connect-hub-2-0-native-crossfade
plan: 01
subsystem: connect-hub-ui-and-rpc
tags: [spotify-connect, devices-tab, librespot, eco-mode, remote-volume, react, python]

# Dependency graph
requires:
  - phase: 21-eco-mode-amp-accent-themes
    provides: PowerGovernor.wake_for_playback() and engine_sleeping state
provides:
  - Enriched get_devices RPC with local_device_name, audio_backend, engine_running, engine_sleeping
  - Auto-waking pull_playback_to_deck RPC with 10-attempt polling and play=True transfer
  - Clamped and URL-encoded set_device_volume RPC for remote Connect devices
  - Upgraded DevicesTab UI with pinned Steam Deck card, device type icons, 300ms-debounced remote volume slider, Fixed Volume badge, and empty-state recovery
affects: [22-02, devices-tab, connect-hub]

# Actuals (#2632)
actuals:
  tokens: 11737
  tasks: 2
  commits: 2

commits: 2
plan_head_before: a5b03da1d93d63e7c66b5bd6c1302c09d498dfe1
plan_head_after: ed24b67b90894125340f85bb9f4bbec8a5c58578

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Auto-wake + Connect registration polling loop in pull_playback_to_deck"
    - "300ms useRef-debounced remote SliderField with optimistic state rollback on RPC error"

key-files:
  created:
    - tests/test_connect_hub.py
    - src/components/tabs/DevicesTab.test.tsx
  modified:
    - py_modules/rpc_playback.py
    - py_modules/volume.py
    - main.py
    - src/types.ts
    - src/components/tabs/DevicesTab.tsx

key-decisions:
  - "Enrich get_devices in-place with local_device_name, audio_backend, engine_running, and engine_sleeping instead of adding a second status RPC."
  - "Extract useDebouncedDeviceVolume and useDevicesHub hooks in DevicesTab.tsx to keep all functions under ESLint's 80-line limit with 0 warnings."

patterns-established:
  - "canControlVolume(device): requires volume_percent !== null && !is_restricted && supports_volume !== false before rendering interactive SliderField."

requirements-completed: [CONNECT-01]

coverage:
  - id: D1
    description: "get_devices returns Connect devices enriched with local_device_name, audio_backend, engine_running, and engine_sleeping."
    requirement: CONNECT-01
    verification:
      - kind: unit
        ref: "tests/test_connect_hub.py#test_get_devices_enriches_metadata_from_settings_and_hostname"
        status: pass
    human_judgment: false
  - id: D2
    description: "pull_playback_to_deck wakes sleeping/stopped local engine, polls up to 10 times for registration, and transfers playback with play: True."
    requirement: CONNECT-01
    verification:
      - kind: unit
        ref: "tests/test_connect_hub.py#test_pull_playback_to_deck_wakes_sleeping_engine_and_transfers"
        status: pass
      - kind: unit
        ref: "tests/test_connect_hub.py#test_pull_playback_to_deck_starts_librespot_when_no_power_governor"
        status: pass
      - kind: unit
        ref: "tests/test_connect_hub.py#test_pull_playback_to_deck_unauthenticated_and_timeout"
        status: pass
    human_judgment: false
  - id: D3
    description: "set_device_volume rejects bool, clamps 0..100, and updates remote Connect device volume via PUT me/player/volume."
    requirement: CONNECT-01
    verification:
      - kind: unit
        ref: "tests/test_connect_hub.py#test_set_device_volume_clamps_rejects_bool_and_handles_errors"
        status: pass
    human_judgment: false
  - id: D4
    description: "DevicesTab renders pinned Steam Deck card, device type icons, 1-click Pull Playback CTA, 300ms-debounced Remote Volume SliderField, Fixed Volume badge, and empty-state recovery."
    requirement: CONNECT-01
    verification:
      - kind: unit
        ref: "src/components/tabs/DevicesTab.test.tsx"
        status: pass
    human_judgment: false

# Metrics
duration: 5min
completed: 2026-11-22
status: complete
---

# Phase 22 Plan 01: Spotify Connect Hub 2.0 Summary

**Enriched Connect device discovery, auto-waking 1-click playback pull, clamped remote device volume RPC, and upgraded DevicesTab UI with device type icons, engine badges, and debounced volume control**

## Performance

- **Duration:** 5 min
- **Started:** 2026-11-22T12:25:52Z
- **Completed:** 2026-11-22T12:30:45Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Enriched `py_modules/rpc_playback.py:get_devices` with `local_device_name`, `audio_backend`, `engine_running`, and `engine_sleeping`, and implemented `_match_local_device` + `pull_playback_to_deck` (waking sleeping `PowerGovernor` or starting `librespot`, polling up to 10 times, and transferring playback with `play: True`).
- Added `py_modules/volume.py:set_device_volume` with `bool` rejection, `0..100` clamping, `device_id` query param forwarding, and `HTTPError` handling, and exposed both `pull_playback_to_deck` and `set_device_volume` on `main.Plugin`.
- Extended `src/types.ts` (`SpotifyDevice.is_restricted`, `SpotifyDevice.supports_volume`, `DevicesResponse`) and rebuilt `src/components/tabs/DevicesTab.tsx` with `LocalDeckStatusCard`, `getDeviceTypeIcon`, `DeviceRow` ellipsis truncation, `RemoteVolumeSection` (300ms debounce + optimistic rollback + `Fixed Volume` fallback), and `EmptyDevicesCard`.

## Task Commits

1. **Task 1: Connect Hub 2.0 backend RPCs + tests** - `050681a` (`feat(22-01): add Connect Hub 2.0 backend RPCs and tests`)
2. **Task 2: DevicesTab Spotify Connect Hub 2.0 UI + Vitest suite** - `ed24b67` (`feat(22-01): upgrade DevicesTab to Spotify Connect Hub 2.0`)

## Files Created/Modified

- `py_modules/rpc_playback.py` - Enriched `get_devices`, added `_match_local_device` and `pull_playback_to_deck`
- `py_modules/volume.py` - Added `set_device_volume`
- `main.py` - Exposed `Plugin.pull_playback_to_deck` and `Plugin.set_device_volume`
- `tests/test_connect_hub.py` - Added 5 unit tests for `CONNECT-01` backend RPCs
- `src/types.ts` - Extended `SpotifyDevice` and exported `DevicesResponse`
- `src/components/tabs/DevicesTab.tsx` - Implemented Spotify Connect Hub 2.0 UI
- `src/components/tabs/DevicesTab.test.tsx` - Added 5 Vitest tests for `DevicesTab`

## Decisions Made

- Enriched `get_devices` directly rather than introducing a second RPC so `DevicesTab` receives device list and local engine state atomically in one call.
- Split `useDebouncedDeviceVolume` and `useDevicesHub` hooks in `DevicesTab.tsx` to satisfy ESLint `max-lines-per-function` (80 lines) with 0 warnings.

## Deviations from Plan

None - plan executed as written (with minor helper hook extraction in `DevicesTab.tsx` to satisfy ESLint `--max-warnings=0`).

## Known Stubs

None.

## Verification Results

- `py -3 -m unittest tests/test_connect_hub.py -v`: 5/5 passed (plus full 629-test Python suite passed during pre-commit hook).
- `pnpm test -- --run src/components/tabs/DevicesTab.test.tsx`: 5/5 passed (plus full 23-file / 280-test Vitest suite and `rollup -c` build passed during pre-commit hook).
- `pnpm exec eslint --max-warnings=0 src/components/tabs/DevicesTab.tsx src/types.ts`: 0 errors, 0 warnings.
- `pnpm exec tsc --noEmit`: 0 errors.

## Self-Check: PASSED

- Created/modified files verified on disk (`py_modules/rpc_playback.py`, `py_modules/volume.py`, `main.py`, `tests/test_connect_hub.py`, `src/types.ts`, `src/components/tabs/DevicesTab.tsx`, `src/components/tabs/DevicesTab.test.tsx`).
- Commits `050681a` and `ed24b67` verified in `git log`.

## Next Phase Readiness

- Ready for Plan `22-02` (Native Crossfade `RADIO-02` backend + `SettingsTab` Crossfade slider).
