---
phase: 26-unified-cdp-platform-bridge-deep-discovery-2-0
plan: 02
subsystem: api
tags: [spotify, cdp, discovery, mixes, cache, librespot, python]

# Dependency graph
requires:
  - phase: 26-unified-cdp-platform-bridge-deep-discovery-2-0
    provides: py_modules/cdp_bridge.py (cdp_fetch_discovery_mixes, cdp_get_playlist_tracks, cdp_fetch_browse_categories, load_discovery_mixes_cache, save_discovery_mixes_cache, is_spotify_client_running)
provides:
  - Personalized algorithmic mix discovery and priority sorting (_sort_algorithmic_mixes, _fetch_made_for_you_section, get_discovery_feed)
  - Atomic ~/.cache/deckify/discovery_mixes.json persistence with eager top-12 tracklist pre-fetch (up to 100 tracks each)
  - Cross-engine librespot cached mix browsing with ' · Cached' subtitle and get_playlist_tracks 403/404/empty fallback
  - get_search_browse_categories RPC with 0ms empty fallback on librespot
affects: [26-03, 26-04, SearchTab, PlaylistsTab, Discovery]

commits: 2
plan_head_before: 028197a9f0ae1c622721eeeffdb30c4867fc6164
plan_head_after: 690ed738b846913a1b30a5560f60eac57eb55b99

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Priority-sorted algorithmic mix deduplication by URI (Daylist -> Discover Weekly -> Release Radar -> Daily Mix 1..6 -> On Repeat)"
    - "Read-only disk cache serving on librespot with ' · Cached' subtitle and zero port 9229 connections"

key-files:
  created: []
  modified:
    - py_modules/rpc_library.py
    - tests/test_discovery.py

key-decisions:
  - "Never write or wipe ~/.cache/deckify/discovery_mixes.json when is_spotify_client_running(plugin) is False, preserving cached mixes across librespot Refresh Feed"
  - "Merge Web API me/playlists Spotify-owned mixes with cached discovery_mixes.json entries on librespot rather than discarding cached mixes"

patterns-established:
  - "_refresh_cached_mix_tracks and _get_cached_mix_tracks helpers shared across empty-response and 403/404 HTTPError paths in get_playlist_tracks"

requirements-completed: [DISC-04]

coverage:
  - id: D1
    description: "get_discovery_feed merges CDP algorithmic mixes with Web API me/playlists, deduplicates by URI, sorts core mixes first, eagerly pre-fetches top 12 tracklists (<=100 tracks each), and persists atomically to discovery_mixes.json"
    requirement: DISC-04
    verification:
      - kind: unit
        ref: "tests/test_discovery.py#TestDiscoveryAlgorithmicMixes.test_cdp_mixes_merged_sorted_prefetched_and_persisted"
        status: pass
    human_judgment: false
  - id: D2
    description: "On librespot (including force_refresh=True), get_discovery_feed preserves discovery_mixes.json, serves cached mixes with ' · Cached' subtitle, and makes zero port 9229 connections"
    requirement: DISC-04
    verification:
      - kind: unit
        ref: "tests/test_discovery.py#TestDiscoveryAlgorithmicMixes.test_librespot_preserves_cache_and_appends_cached_subtitle"
        status: pass
    human_judgment: false
  - id: D3
    description: "get_playlist_tracks serves cached mix tracklists with is_liked annotated on 403/404/empty when librespot is active and refreshes cached tracks on disk when live CDP succeeds"
    requirement: DISC-04
    verification:
      - kind: unit
        ref: "tests/test_discovery.py#TestDiscoveryAlgorithmicMixes.test_get_playlist_tracks_serves_cached_mix_on_403_404_librespot"
        status: pass
      - kind: unit
        ref: "tests/test_discovery.py#TestDiscoveryAlgorithmicMixes.test_get_playlist_tracks_live_cdp_refreshes_disk_cache"
        status: pass
    human_judgment: false
  - id: D4
    description: "get_search_browse_categories returns CDP browse categories on spotify_client and [] in 0ms on librespot"
    requirement: DISC-04
    verification:
      - kind: unit
        ref: "tests/test_discovery.py#TestDiscoveryAlgorithmicMixes.test_get_search_browse_categories"
        status: pass
    human_judgment: false

# Metrics
duration: 5min
completed: 2026-11-24
status: complete
---

# Phase 26 Plan 02: Deep Discovery 2.0 & Cross-Engine Mix Cache Summary

**Unlocked personalized Spotify algorithmic mixes (*Daylist*, *Discover Weekly*, *Release Radar*, *Daily Mix 1–6*, *On Repeat*) via `cdp_bridge.py`, persisted them atomically in `~/.cache/deckify/discovery_mixes.json` for cross-engine `librespot` browsing, and added `get_search_browse_categories`.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-11-24T18:25:05Z
- **Completed:** 2026-11-24T18:29:48Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Implemented `_sort_algorithmic_mixes` and upgraded `_fetch_made_for_you_section` / `get_discovery_feed` in `py_modules/rpc_library.py` to merge CDP mixes with Web API `me/playlists`, eagerly pre-fetch top 12 tracklists (up to 100 tracks each), and atomically persist to `~/.cache/deckify/discovery_mixes.json`.
- Preserved `discovery_mixes.json` on `librespot` (including `force_refresh=True`), serving cached mixes with `" · Cached"` appended to `subtitle` and falling back to *"Jump Back In"* only when both live and disk caches are empty.
- Added `_refresh_cached_mix_tracks` and `_get_cached_mix_tracks` to `get_playlist_tracks` so cached mixes open seamlessly on `librespot` with `is_liked` annotated (`cached: True`) and refresh on disk when live CDP succeeds.
- Added `get_search_browse_categories` returning CDP categories when `spotify_client` is running and `[]` in 0ms on `librespot`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Upgrade _fetch_made_for_you_section and get_discovery_feed with CDP mixes, priority sorting, and ~/.cache/deckify/discovery_mixes.json persistence** - `f2f4486` (feat)
2. **Task 2: Add discovery_mixes.json fallback and live CDP refresh to get_playlist_tracks** - `690ed73` (feat)

## Files Created/Modified
- `py_modules/rpc_library.py` - `_sort_algorithmic_mixes`, `_fetch_made_for_you_section`, `get_discovery_feed`, `get_search_browse_categories`, `_refresh_cached_mix_tracks`, `_get_cached_mix_tracks`, and `get_playlist_tracks` fallback/refresh
- `tests/test_discovery.py` - Added `TestDiscoveryAlgorithmicMixes` (6 new unit tests; all 14 tests in `tests/test_discovery.py` and full 692-test suite pass)

## Decisions Made
- Preserved `discovery_mixes.json` untouched whenever `is_spotify_client_running(plugin)` is `False` so `librespot` users never lose cached algorithmic mixes on Refresh Feed.
- Merged Web API `me/playlists` Spotify-owned mixes with cached `discovery_mixes.json` entries on `librespot` so both saved Spotify playlists and cached algorithmic mixes remain visible.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `py_modules/rpc_library.py` is ready for Plan `26-03` (`rpc_playback.py` Tier 1 CDP station radio) and `26-04` (`main.py` RPC wiring + `SearchTab.tsx` / `PlaylistsTab.tsx` UI integration).

## Self-Check: PASSED
- `py_modules/rpc_library.py`: FOUND
- `tests/test_discovery.py`: FOUND
- `f2f4486`: FOUND
- `690ed73`: FOUND

---
*Phase: 26-unified-cdp-platform-bridge-deep-discovery-2-0*
*Completed: 2026-11-24*
