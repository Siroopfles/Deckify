---
phase: 13-like-button-403-fix-sink-input-guardrails
plan: 01
subsystem: api
tags: [spotify-web-api, cdp, library-api, liked-songs, python]
requires:
  - phase: 12-resolve-open-todos-polish
    provides: Stable playback and toast metadata pipeline
provides:
  - "toggle_like_track migrated to PUT/DELETE /v1/me/library?uris=spotify:track:{id} with CDP LibraryAPI 403 fallback"
  - "check_tracks_liked migrated to GET /v1/me/library/contains with 40-URI batching and 300s _liked_cache TTL"
  - "get_liked_tracks with CDP LibraryAPI 403 fallback for spotify_client mode"
  - "Unit tests in tests/test_phase13.py for >40-URI batching and CDP LibraryAPI 403 fallbacks"
affects: [13-02, playback, library]
tech-stack:
  added: []
  patterns:
    - "Spotify Web API /v1/me/library and /v1/me/library/contains URI-based endpoints (40-URI max batch)"
    - "React Fiber Platform.getRegistry() -> LibraryAPI CDP fallback on HTTP 403 in spotify_client mode"
key-files:
  created:
    - tests/test_phase13.py
  modified:
    - py_modules/engine.py
    - py_modules/rpc_playback.py
    - py_modules/rpc_library.py
    - tests/test_features.py
    - tests/test_final_coverage.py
key-decisions:
  - "D-01/D-02: toggle_like_track uses PUT/DELETE /v1/me/library?uris=spotify:track:{id} primary, falls back to _cdp_toggle_like_track on 403 when spotify_client is active and running, and returns actionable 403 error otherwise"
  - "D-03: check_tracks_liked normalizes spotify:track: prefixes to bare IDs for _liked_cache while batching at 40 URIs on /v1/me/library/contains"
  - "D-04: get_liked_tracks retains GET me/tracks as primary and falls back to _cdp_get_liked_tracks on 403 when spotify_client is active"
patterns-established:
  - "CDP LibraryAPI fallback gated on audio_backend == 'spotify_client' and running _spotify_client_process"
requirements-completed: [LIB-01]
duration: 3min
completed: 2026-11-16
status: complete
commits: 2
plan_head_before: 7fc1f272f65db22303f42462cca2f97e0eb904fa
plan_head_after: d118aa4b94ca397dd0a07bc7a261f1e7b44e8721
actuals:
  tokens: 5770
  tasks: 2
  commits: 2
---

# Phase 13 Plan 01: Like Button 403 Fix & CDP LibraryAPI Fallbacks Summary

**Migrated `toggle_like_track` and `check_tracks_liked` from deprecated `/v1/me/tracks` endpoints to `/v1/me/library` and `/v1/me/library/contains` (40-URI batching), with Official Spotify Client CDP `LibraryAPI` 403 fallbacks for `toggle_like_track` and `get_liked_tracks`.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-11-16T13:11:48Z
- **Completed:** 2026-11-16T13:14:50Z
- **Tasks:** 2
- **Files modified:** 6 (1 created, 5 modified)

## Accomplishments

- Added `_cdp_toggle_like_track` and `_cdp_get_liked_tracks` in `py_modules/engine.py` using `#main` React Fiber traversal (`visited` capped at 5000 nodes) to resolve `LibraryAPI` from `Platform.getRegistry()`, serializing `uri` and `offset` safely via `json.dumps()` / `int()`.
- Migrated `toggle_like_track` in `py_modules/rpc_playback.py` to `PUT`/`DELETE` `me/library` with `{"uris": f"spotify:track:{target_id}"}`, adding `_cdp_toggle_like_track` fallback on HTTP 403 when `spotify_client` is active and running, and preserving the actionable 403 error message on failure or `librespot` mode.
- Migrated `check_tracks_liked` in `py_modules/rpc_playback.py` to `GET` `me/library/contains` with 40-URI chunks, normalizing `spotify:track:` prefixes to bare track IDs for `_liked_cache` (300s TTL preserved).
- Added `_cdp_get_liked_tracks` HTTP 403 fallback to `get_liked_tracks` in `py_modules/rpc_library.py` while keeping `GET me/tracks` as primary.
- Updated `tests/test_features.py` and `tests/test_final_coverage.py`, and created `tests/test_phase13.py` (`TestPhase13LibraryAndGuardrails`) covering 85-URI (40/40/5) batching, cache TTL, and CDP 403 fallbacks.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end toggle_like_track /v1/me/library migration and CDP LibraryAPI 403 fallback** - `c9ec486` (feat)
2. **Task 2: Migrate check_tracks_liked to 40-URI /v1/me/library/contains and add get_liked_tracks CDP 403 fallback** - `d118aa4` (feat)

## Files Created/Modified

- `py_modules/engine.py` - Added `_cdp_toggle_like_track` and `_cdp_get_liked_tracks`
- `py_modules/rpc_playback.py` - Migrated `toggle_like_track` and `check_tracks_liked` to `/v1/me/library` and `/v1/me/library/contains`
- `py_modules/rpc_library.py` - Added `_cdp_get_liked_tracks` 403 fallback to `get_liked_tracks`
- `tests/test_features.py` - Updated `test_toggle_like_updates_current_track_metadata` to assert `me/library`
- `tests/test_final_coverage.py` - Extended `test_toggle_like_track_403_forbidden` for `spotify_client` CDP failure path
- `tests/test_phase13.py` - Created unit tests for 40-URI batching and CDP LibraryAPI 403 fallbacks

## Decisions Made

None - followed plan as specified.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. Live Steam Deck CDP verification remains a manual check in `13-VALIDATION.md`.

## Next Phase Readiness

- `LIB-01` implementation and unit tests are complete; ready for Plan `13-02` (`LIB-02` sink-input guardrails in `py_modules/volume.py` and `py_modules/engine.py`).

## Self-Check: PASSED

- Verified files exist: `py_modules/engine.py`, `py_modules/rpc_playback.py`, `py_modules/rpc_library.py`, `tests/test_features.py`, `tests/test_final_coverage.py`, `tests/test_phase13.py`
- Verified commits exist in HEAD: `c9ec486`, `d118aa4`
- Verified test suites passed: `test_phase13.py` (3 tests), `test_features.py` (19 tests), `test_final_coverage.py` (22 tests), and full pre-commit suite (461 tests)
