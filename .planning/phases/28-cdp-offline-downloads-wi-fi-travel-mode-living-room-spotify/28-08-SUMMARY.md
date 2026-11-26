---
phase: 28-cdp-offline-downloads-wi-fi-travel-mode-living-room-spotify
plan: 08
subsystem: cdp-bridge, travel-mode, settings
tags: [cdp, offline-downloads, spotify-jam, travel-mode, python]
requires:
  - phase: 28-cdp-offline-downloads-wi-fi-travel-mode-living-room-spotify
    provides: Initial CDP OfflineAPI, SocialConnectAPI Jam, and Travel Mode RPCs
provides:
  - CDP Platform.Registry readiness polling (wait_for_cdp_ready)
  - Expanded AlbumAPI.setOffline and OfflineAPI download/remove fallbacks
  - Nested/polled Spotify Jam join_url extraction with active=False guard when join_url is missing
  - travel_mode_show_when_online default/validation and deduplicated travel_mode_changed emission
affects: [28-09, 28-10]
tech-stack:
  added: []
  patterns: [monotonic CDP readiness polling, single-retry on CDP not-ready error, deduplicated event emission]
key-files:
  created: []
  modified:
    - py_modules/cdp_bridge.py
    - py_modules/common.py
    - main.py
    - tests/test_offline_downloads.py
    - tests/test_travel_mode.py
decisions:
  - "Wait up to 12s for CDP Platform.Registry readiness in start_spotify_client and retry once after 6s wait on not-ready errors in toggle_offline_download and start_spotify_jam."
  - "Never report active=True for Spotify Jam when join_url is null or empty; poll getSession/getShareUrl briefly before returning an explicit error."
  - "Yield to the event loop with asyncio.sleep(0) when set_manual_travel_mode triggers _on_travel_mode_changed so travel_mode_changed emits once before set_travel_mode returns."
requirements-completed: [CDP-01, CDP-02, JAM-01]
status: complete
commits: 2
plan_head_before: 3d861fc0e8bb355921788d744660feb1daf801ed
plan_head_after: 58548e0fa3bc33212c5f8aeb59b24164bcc47b50
actuals:
  tokens: 6960
  tasks: 2
  commits: 2
metrics:
  duration: 6m
  completed: 2026-11-26
---

# Phase 28 Plan 08: CDP Readiness, Offline/Jam Fallbacks & Travel Mode Deduplication Summary

**Added CDP Platform.Registry readiness polling on Spotify client launch, expanded AlbumAPI/OfflineAPI download fallbacks, fixed nested/polled Spotify Jam invite URL extraction, and deduplicated `travel_mode_changed` events.**

## Performance

- **Duration:** ~6 min
- **Completed:** 2026-11-26
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added `wait_for_cdp_ready` in `py_modules/cdp_bridge.py` with monotonic deadline and 2.0s per-probe timeout to poll `Platform.Registry` until core services (`OfflineAPI`, `PlayerAPI`, `SocialConnectAPI`, `PlaylistAPI`) are available.
- Expanded `cdp_set_offline_download` in `py_modules/cdp_bridge.py` to query `AlbumAPI` alongside `PlaylistAPI`/`ShowAPI` and support `setOffline`, `download`, `remove`, and `makeAvailableOffline` fallbacks.
- Updated `cdp_start_spotify_jam`, `cdp_get_jam_status`, and `_normalize_jam_response` in `py_modules/cdp_bridge.py` to extract nested `joinUrl`/`shareUrl`/`inviteUrl` properties, call `getShareUrl`/`getJoinUrl` and poll `getSession` up to 6 times, and enforce `active=False` whenever `join_url` is `None` or empty.
- Added `travel_mode_show_when_online: False` to `DEFAULT_SETTINGS` and boolean coercion in `_load_settings` in `py_modules/common.py`.
- Wired `wait_for_cdp_ready` into `start_spotify_client`, `toggle_offline_download`, and `start_spotify_jam` in `main.py`, and deduplicated `travel_mode_changed` emissions in `set_travel_mode`.

## Task Commits

1. **Task 1: Add wait_for_cdp_ready, expand cdp_set_offline_download fallbacks, and fix Jam join_url extraction** - `dc7fdd5` (`feat(28-08): add CDP readiness wait, AlbumAPI/OfflineAPI fallbacks, and Jam join_url extraction`)
2. **Task 2: Add travel_mode_show_when_online setting in common.py and wire CDP readiness + event deduplication in main.py** - `58548e0` (`feat(28-08): wire CDP readiness wait, travel_mode_show_when_online, and travel_mode_changed deduplication`)

## Files Created/Modified

- `py_modules/cdp_bridge.py` - Added `wait_for_cdp_ready`, expanded `cdp_set_offline_download` fallbacks, and hardened Jam `join_url` extraction and `_normalize_jam_response`.
- `py_modules/common.py` - Added `travel_mode_show_when_online` default (`False`) and boolean coercion in `_load_settings`.
- `main.py` - Wired CDP readiness wait in `start_spotify_client`, single-retry on CDP not-ready errors in `toggle_offline_download` and `start_spotify_jam`, `travel_mode_show_when_online` coercion in `set_setting`, and deduplicated `travel_mode_changed` emission in `set_travel_mode`.
- `tests/test_offline_downloads.py` - Added unit tests for `wait_for_cdp_ready`, `AlbumAPI`/`OfflineAPI` fallbacks, and Jam nested `join_url` + missing-URL `active=False` guard.
- `tests/test_travel_mode.py` - Added unit tests for `travel_mode_show_when_online` default/validation, `start_spotify_client` CDP wait, and single `travel_mode_changed` emission.

## Deviations from Plan

- `py_modules/common.py` performs settings validation/coercion inside `_load_settings` rather than a separate `validate_settings` function; coercion for `travel_mode_show_when_online` was added to `_load_settings` (and `main.py:set_setting`).

## Verification

- `py -3 -m unittest tests/test_travel_mode.py tests/test_offline_downloads.py` — 29 tests passed.
- Full backend test suite (`python -m unittest discover` via Husky pre-commit on `58548e0`) — 771 tests passed.

## Self-Check: PASSED

- Created `.planning/phases/28-cdp-offline-downloads-wi-fi-travel-mode-living-room-spotify/28-08-SUMMARY.md`
- Verified commits `dc7fdd5` and `58548e0` exist in `HEAD`
- Verified all modified files exist on disk and all targeted + full-suite tests pass
