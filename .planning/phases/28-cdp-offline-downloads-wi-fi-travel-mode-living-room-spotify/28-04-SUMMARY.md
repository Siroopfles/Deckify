---
phase: 28-cdp-offline-downloads-wi-fi-travel-mode-living-room-spotify
plan: 04
subsystem: api
tags: [cdp, offline-downloads, travel-mode, spotify-jam, rpc, disk-guardrail]

# Dependency graph
requires:
  - phase: 28-01
    provides: "cdp_bridge OfflineAPI & Jam helpers, check_disk_guardrail, engine.configure_offline_storage_path"
  - phase: 28-02
    provides: "SessionBookmarkManager Travel Mode state and on_travel_mode_changed callback"
provides:
  - "annotate_offline_metadata in py_modules/rpc_library.py"
  - "9 Phase 28 RPCs on Plugin in main.py (offline downloads, storage path, Travel Mode, Spotify Jam)"
  - "get_status extensions for Travel Mode, offline storage, and jam_session"
  - "Active-download disk guardrail polling in _poll_playback and get_offline_status"
affects: [28-05, 28-06, 28-07]

# Actuals (#2632)
actuals:
  tokens: 7059
  tasks: 2
  commits: 2
plan_head_before: 529c47366f4e0d48499a20d909452339966b176b
plan_head_after: 6e8defa6f2f6d14b84995ef9ea0d96a7b5ee7b94

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "All blocking disk/CDP/subprocess calls offloaded via await _exec(...)"
    - "Active-download disk guardrail check inside _poll_playback when offline_downloads.json has downloading items"

key-files:
  created: []
  modified:
    - py_modules/rpc_library.py
    - main.py
    - tests/test_offline_downloads.py

key-decisions:
  - "Centralized SessionBookmarkManager instantiation in Plugin._create_bookmark_manager to wire travel_mode_* settings and _on_travel_mode_changed consistently across init, _main, and fallbacks"
  - "Returned both ok and success booleans from Phase 28 Plugin RPCs for consistent frontend/test consumption"

patterns-established:
  - "annotate_offline_metadata attaches offline_state, offline_progress, and offline_size_bytes to library responses without requiring spotify_client to be running"

requirements-completed: [CDP-01, CDP-02, JAM-01]

coverage:
  - id: D1
    description: "annotate_offline_metadata attaches offline_state, offline_progress, and offline_size_bytes to playlists, albums, shows, and episodes"
    requirement: "CDP-01"
    verification:
      - kind: unit
        ref: "tests/test_offline_downloads.py#test_annotate_offline_metadata"
        status: pass
    human_judgment: false
  - id: D2
    description: "Plugin exposes offline download, storage path, Travel Mode, and Jam RPCs offloading blocking I/O via _exec, with active-download low-disk-space abort"
    requirement: "CDP-01"
    verification:
      - kind: unit
        ref: "tests/test_offline_downloads.py#test_toggle_offline_download_guardrail_and_delegation"
        status: pass
      - kind: unit
        ref: "tests/test_offline_downloads.py#test_active_download_aborts_on_low_disk_space_during_poll"
        status: pass
      - kind: unit
        ref: "tests/test_offline_downloads.py#test_set_travel_mode_persists_and_updates_status"
        status: pass
      - kind: unit
        ref: "tests/test_offline_downloads.py#test_jam_rpcs_delegate_to_cdp_bridge"
        status: pass
    human_judgment: false

# Metrics
duration: 5min
completed: 2026-11-26
status: complete
---

# Phase 28 Plan 04: Backend RPCs, Offline Metadata Annotation & Guardrail Polling Summary

**Wired 9 Phase 28 Decky RPCs, `annotate_offline_metadata` in `rpc_library.py`, `get_status` Travel Mode / Jam / storage fields, and `_poll_playback` low-disk-space download abort in `main.py`.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-11-26T10:38:59Z
- **Completed:** 2026-11-26T10:44:04Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added `annotate_offline_metadata` in `py_modules/rpc_library.py` and wired it into `get_playlists`, `get_saved_albums`, `get_saved_shows`, `get_show_episodes`, and `get_artist_albums`.
- Wired `SessionBookmarkManager` in `main.py` via `_create_bookmark_manager` with persisted `travel_mode_*` settings and `_on_travel_mode_changed` (`decky.emit("travel_mode_changed", state)`).
- Exposed `toggle_offline_download`, `get_offline_status`, `get_offline_downloads_list`, `remove_all_offline_downloads`, `set_offline_storage_path`, `set_travel_mode`, `start_spotify_jam`, `get_jam_status`, and `end_spotify_jam` on `Plugin`, offloading all blocking calls via `await _exec(...)`.
- Added active-download `os.statvfs` guardrail polling in `_poll_playback` and `get_offline_status` that cancels active downloads and emits `low_disk_space` when free space drops below `offline_min_free_gb`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Annotate offline_state and offline_progress in py_modules/rpc_library.py** - `1c6b615` (feat)
2. **Task 2: Expose Phase 28 RPCs, active-download disk guardrail in _poll_playback, & Travel Mode / Jam wiring in main.py** - `6e8defa` (feat)

## Files Created/Modified
- `py_modules/rpc_library.py` - Added `annotate_offline_metadata` and applied it to playlists, albums, shows, and episodes.
- `main.py` - Added 9 Phase 28 RPCs, `get_status` extensions, `_create_bookmark_manager`, `_on_travel_mode_changed`, `set_setting` validation for `offline_min_free_gb` / `travel_mode_auto_enabled`, and `_poll_playback` active-download disk check.
- `tests/test_offline_downloads.py` - Added `TestPhase28PluginRPCs` covering guardrail blocking, polling abort, Travel Mode persistence/events, Jam RPCs, and `annotate_offline_metadata`.

## Decisions Made
- Centralized `SessionBookmarkManager` creation in `Plugin._create_bookmark_manager()` so `__init__`, `_main`, and lazy fallback sites all share identical `travel_mode_*` initialization and `on_travel_mode_changed` wiring.
- Included both `ok` and `success` keys in Phase 28 RPC responses for consistent handling across frontend and backend callers.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
- In `tests/test_offline_downloads.py`, `from test_token_refresh import main` imports `main` with its own reloaded `common`/`cdp_bridge` module instances, so `TestPhase28PluginRPCs` patches `main.common` and `main.cdp_bridge` directly.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Wave 2 backend RPCs and push events (`travel_mode_changed`, `low_disk_space`) are ready for Wave 3 frontend UI plans (`28-05`, `28-06`, `28-07`).

## Self-Check: PASSED
- `py_modules/rpc_library.py`: FOUND
- `main.py`: FOUND
- `tests/test_offline_downloads.py`: FOUND
- Commit `1c6b615`: FOUND
- Commit `6e8defa`: FOUND

---
*Phase: 28-cdp-offline-downloads-wi-fi-travel-mode-living-room-spotify*
*Completed: 2026-11-26*
