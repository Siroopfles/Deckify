---
phase: 27-interactive-queue-studio-controller-playlist-management
plan: 02
subsystem: api
tags: [spotify, cdp, playlists, rpc, python]

# Dependency graph
requires:
  - phase: 27-01
    provides: Unified CDP bridge and Interactive Queue Studio backend patterns
provides:
  - CDP PlaylistAPI & RootlistAPI fallback helpers in py_modules/cdp_bridge.py
  - Ownership-enriched get_playlists, playlist CRUD, track reordering, single-instance removal, and QAM/folder cleanup in py_modules/rpc_library.py
  - Plugin RPC bindings in main.py
  - Unit tests in tests/test_playlist_management.py
affects: [27-03, 27-04, 27-05]

# Actuals
actuals:
  tokens: 10792
  tasks: 3
  commits: 3
plan_head_before: c7854fdccd953a0543d8aa941c9d66f5efc8273f
plan_head_after: 138b20435aa4d04675b6d216587f9e6e615ea5a7

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Web-API-first (/items then /tracks) with automatic CDP PlaylistAPI/RootlistAPI fallback on HTTP 400/403/404 when spotify_client is running"
    - "Conditional /v1/me user ID caching on plugin._current_user_id only when playlist ownership requires disambiguation"

key-files:
  created:
    - tests/test_playlist_management.py
  modified:
    - py_modules/cdp_bridge.py
    - py_modules/rpc_library.py
    - main.py

key-decisions:
  - "Fetch /v1/me/playlists before /v1/me and only query _get_current_user_id when at least one non-collaborative playlist has a non-spotify owner_id"
  - "Serialize all CDP playlist strings via json.dumps in cdp_bridge.py and clean pinned_playlists and playlist_folders atomically via _save_settings after playlist deletion"

patterns-established:
  - "All playlist CRUD and track curation RPCs try Spotify Web API first and fall back to CDP when spotify_client is running"

requirements-completed: [PL-01]

coverage:
  - id: D1
    description: "CDP PlaylistAPI & RootlistAPI fallback helpers (create, update details, delete, reorder, remove, add) with json.dumps serialization"
    requirement: "PL-01"
    verification:
      - kind: unit
        ref: "tests/test_playlist_management.py#test_cdp_playlist_helpers_serialize_strings_with_json_dumps"
        status: pass
    human_judgment: false
  - id: D2
    description: "Ownership-enriched get_playlists (is_editable, owner_id, collaborative, description) and playlist CRUD with QAM/folder cleanup"
    requirement: "PL-01"
    verification:
      - kind: unit
        ref: "tests/test_playlist_management.py#test_get_playlists_ownership_and_enrichment"
        status: pass
      - kind: unit
        ref: "tests/test_playlist_management.py#test_create_and_update_playlist_validation_and_cdp_fallback"
        status: pass
      - kind: unit
        ref: "tests/test_playlist_management.py#test_delete_playlist_cleans_pinned_and_folders_idempotently"
        status: pass
    human_judgment: false
  - id: D3
    description: "Playlist track reordering (insert_before math) and single-instance track removal by position/uid with Web API and CDP fallbacks"
    requirement: "PL-01"
    verification:
      - kind: unit
        ref: "tests/test_playlist_management.py#test_reorder_playlist_tracks_insert_before_and_fallbacks"
        status: pass
      - kind: unit
        ref: "tests/test_playlist_management.py#test_remove_track_single_instance_position_and_cdp_uid_fallback"
        status: pass
    human_judgment: false

# Metrics
duration: 7 min
completed: 2026-11-25
status: complete
---

# Phase 27 Plan 02: Controller Playlist Management Backend Summary

**Web-API-first + CDP-fallback playlist CRUD, ownership enrichment, track reordering, single-instance removal, and atomic QAM/folder cleanup**

## Performance

- **Duration:** 7 min
- **Started:** 2026-11-25T19:31:01Z
- **Completed:** 2026-11-25T19:37:31Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Added six `PlaylistAPI` / `RootlistAPI` CDP helpers in `py_modules/cdp_bridge.py` (`cdp_create_playlist`, `cdp_update_playlist_details`, `cdp_delete_playlist`, `cdp_reorder_playlist_track`, `cdp_remove_from_playlist`, `cdp_add_to_playlist`) with `json.dumps` string escaping.
- Enriched `get_playlists` in `py_modules/rpc_library.py` with `description`, `collaborative`, `owner_id`, and `is_editable` (false for `spotify`-owned mixes), and implemented `update_playlist_details`, `delete_playlist` (cleaning `pinned_playlists` and `playlist_folders` atomically via `_save_settings`), `reorder_playlist_tracks`, single-instance `remove_track_from_playlist`, and CDP fallbacks across all playlist RPCs.
- Exposed `update_playlist_details`, `delete_playlist`, `reorder_playlist_tracks`, and updated `create_playlist` / `remove_track_from_playlist` on `Plugin` in `main.py`, backed by `tests/test_playlist_management.py`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add CDP PlaylistAPI and RootlistAPI fallback helpers** - `93d8248` (feat)
2. **Task 2: Implement playlist CRUD, ownership, reorder, and CDP fallbacks** - `90dfc57` (feat)
3. **Task 3: Add unit tests for Playlist Management backend** - `138b204` (test)

## Files Created/Modified
- `py_modules/cdp_bridge.py` - Added `cdp_create_playlist`, `cdp_update_playlist_details`, `cdp_delete_playlist`, `cdp_reorder_playlist_track`, `cdp_remove_from_playlist`, `cdp_add_to_playlist`.
- `py_modules/rpc_library.py` - Added `_get_current_user_id`, `_cleanup_deleted_playlist_refs`, `update_playlist_details`, `delete_playlist`, `reorder_playlist_tracks`; updated `get_playlists`, `create_playlist`, `add_track_to_playlist`, `remove_track_from_playlist`.
- `main.py` - Exposed `update_playlist_details`, `delete_playlist`, `reorder_playlist_tracks`, and updated `create_playlist` & `remove_track_from_playlist`.
- `tests/test_playlist_management.py` - Unit tests covering PL-01 ownership, validation, CRUD, `insert_before` math, single-instance removal, QAM/folder cleanup, and CDP fallbacks.

## Decisions Made
- Fetch `me/playlists` before `/v1/me` and only call `_get_current_user_id` when at least one non-collaborative playlist has a non-`spotify` `owner_id`, avoiding an extra `/me` call when unnecessary and preserving compatibility with single-response mocked tests.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Avoided unconditional `/v1/me` call in `get_playlists` when ownership check is not needed**
- **Found during:** Task 2 (pre-commit verification)
- **Issue:** Calling `_get_current_user_id` before `me/playlists` consumed the sole mocked response in `tests/test_century_coverage.py::test_main_settings_and_playback_branches`, causing `KeyError: 'playlists'`.
- **Fix:** Moved `_get_current_user_id` after `me/playlists` and gated it on `any(not p.get("collaborative") and owner_id not in ("", "spotify") ...)`.
- **Files modified:** `py_modules/rpc_library.py`
- **Verification:** `py -3 -m unittest tests/test_century_coverage.py tests/test_playlist_management.py -q` and full 715-test pre-commit suite passed.
- **Committed in:** `90dfc57` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary for correctness and backward compatibility with existing test mocks. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Playlist Management backend (`PL-01`) is complete and verified; ready for `27-03` / `27-04` / `27-05` frontend integration.

## Self-Check: PASSED
- Verified `py_modules/cdp_bridge.py`, `py_modules/rpc_library.py`, `main.py`, and `tests/test_playlist_management.py` exist on disk.
- Verified commits `93d8248`, `90dfc57`, and `138b204` are ancestors of `HEAD`.
- Verified `tests/test_playlist_management.py` and `tests/test_cdp_bridge.py` (12 tests) and full pre-commit suite (715 tests) pass.

---
*Phase: 27-interactive-queue-studio-controller-playlist-management*
*Completed: 2026-11-25*
