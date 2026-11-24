---
phase: 26-unified-cdp-platform-bridge-deep-discovery-2-0
plan: 01
subsystem: api
tags: [cdp, spotify-client, platform-registry, python, cache]

requires:
  - phase: 25-artist-album-radio-search-2-0
    provides: "_try_cdp_station_radio Tier 1 hook in py_modules/rpc_playback.py and Browse Categories fallback in SearchTab"
provides:
  - "py_modules/cdp_bridge.py unified Platform.Registry evaluator with window.__deckifyRegistry caching and 4.0s default timeout"
  - "is_spotify_client_running() 0ms fast-fail guard for librespot"
  - "Atomic ~/.cache/deckify/discovery_mixes.json read/write helpers"
  - "CDP discovery mixes, station radio URIs, and browse categories probes"
  - "Delegation of all 6 engine.py CDP walkers and rpc_library.set_native_playlist_mix through cdp_bridge.py"
affects: [26-02, 26-03, 26-04, 27-queue-cdp, 28-offline-cdp]

actuals:
  tokens: 16764
  tasks: 2
  commits: 2
  plan_head_before: 88f60eecc291cf58406c3a1721556db16313fee0
  plan_head_after: 7b262f2651c2cd9edf68c08ec0d7c9e99a6146e4

tech-stack:
  added: []
  patterns:
    - "window.__deckifyRegistry + window.__deckifyRegistryEl === el React Fiber cache with automatic reload re-walk"
    - "eval_fn injection parameter on cdp_bridge helpers so engine._cdp_evaluate mock patches remain intact"
    - "json.dumps() escaping for all dynamic strings interpolated into CDP Runtime.evaluate JS"

key-files:
  created:
    - py_modules/cdp_bridge.py
    - tests/test_cdp_bridge.py
  modified:
    - py_modules/engine.py
    - py_modules/rpc_library.py

key-decisions:
  - "Passed eval_fn=_cdp_evaluate from engine.py wrappers into cdp_bridge helpers so existing unittest.mock.patch.object(engine, '_cdp_evaluate') tests continue intercepting calls without modification."
  - "Initialized test_cdp_bridge.py with test_token_refresh's decky sys.modules mock because test_cdp_bridge.py sorts first alphabetically in unittest discover."

patterns-established:
  - "All Platform.Registry CDP operations go through py_modules/cdp_bridge.py:evaluate_with_registry."

requirements-completed: [DISC-04]

coverage:
  - id: D1
    description: "py_modules/cdp_bridge.py resolves and caches Platform.Registry on window.__deckifyRegistry with 4.0s timeout, reload re-walk, atomic discovery_mixes.json helpers, and discovery/radio/browse probes"
    requirement: "DISC-04"
    verification:
      - kind: unit
        ref: "tests/test_cdp_bridge.py#TestCdpBridge"
        status: pass
    human_judgment: false
  - id: D2
    description: "All 6 CDP walkers in py_modules/engine.py and set_native_playlist_mix in py_modules/rpc_library.py delegate through py_modules/cdp_bridge.py with zero test regressions"
    requirement: "DISC-04"
    verification:
      - kind: unit
        ref: "py -3 -m unittest tests/test_cdp_bridge.py tests/test_device_and_engine.py tests/test_podcast_suite.py tests/test_phase13.py -q"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-11-24
status: complete
---

# Phase 26 Plan 01: Unified CDP Platform Bridge Summary

**Centralized `py_modules/cdp_bridge.py` (`Platform.Registry` cache on `window.__deckifyRegistry`, `4.0s` timeout, atomic `discovery_mixes.json` cache, and discovery/radio/browse probes) with all 7 legacy React Fiber walkers delegated from `engine.py` and `rpc_library.py`**

## Performance

- **Duration:** 8 min
- **Started:** 2026-11-24T19:15:28Z
- **Completed:** 2026-11-24T19:23:21Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created `py_modules/cdp_bridge.py` with `DEFAULT_CDP_TIMEOUT = 4.0`, `window.__deckifyRegistry` caching with `#main` identity invalidation (`window.__deckifyRegistryEl === el`), `is_spotify_client_running()` `0ms` fast-fail guard, and atomic `.tmp` + `os.replace` `discovery_mixes.json` cache helpers.
- Implemented `cdp_fetch_discovery_mixes`, `cdp_fetch_station_radio_uris` (capped at 30 unique `spotify:track:` URIs), `cdp_fetch_browse_categories`, and all migrated CDP operations (`cdp_fetch_folder_tree`, `cdp_toggle_like_track`, `cdp_get_liked_tracks`, `cdp_get_playlist_tracks`, `cdp_get_saved_episodes`, `cdp_set_playback_speed`, `cdp_set_playlist_mix`) with `json.dumps()` escaping.
- Migrated all 6 CDP walkers in `py_modules/engine.py` and `set_native_playlist_mix` in `py_modules/rpc_library.py` to delegate to `py_modules/cdp_bridge.py`, eliminating 521 lines of duplicated React Fiber BFS loops while preserving all existing test mocks (`686` Python tests passing).

## Task Commits

Each task was committed atomically:

1. **Task 1: Build py_modules/cdp_bridge.py and tests/test_cdp_bridge.py** - `8d11352` (feat)
2. **Task 2: Delegate existing CDP walkers in py_modules/engine.py and py_modules/rpc_library.py** - `7b262f2` (refactor)

## Files Created/Modified
- `py_modules/cdp_bridge.py` - Centralized `Platform.Registry` JS bridge, probes, and atomic `discovery_mixes.json` cache helpers
- `tests/test_cdp_bridge.py` - Unit tests for `cdp_bridge.py` preamble, timeout/error fallback, probes, atomic cache, and `engine.py` delegation
- `py_modules/engine.py` - Delegated `_fetch_spotify_cdp_folder_tree`, `_cdp_toggle_like_track`, `_cdp_get_liked_tracks`, `_cdp_get_playlist_tracks`, `_cdp_get_saved_episodes`, `_cdp_set_playback_speed` to `cdp_bridge`
- `py_modules/rpc_library.py` - Delegated `set_native_playlist_mix` to `cdp_bridge.cdp_set_playlist_mix`

## Decisions Made
- Passed `eval_fn=_cdp_evaluate` from `engine.py` wrappers into `cdp_bridge` helpers so existing `unittest.mock.patch.object(engine, "_cdp_evaluate")` tests continue intercepting calls without modification.
- Imported `main` from `test_token_refresh` at the top of `tests/test_cdp_bridge.py` so `unittest discover` (which loads `test_cdp_bridge.py` first alphabetically) initializes `py_modules.common` with the shared `decky` test mock.

## Deviations from Plan

None - plan executed as specified (with the `test_cdp_bridge.py` import-order alignment discovered during pre-commit `unittest discover` verification).

## Issues Encountered
- `tests/test_cdp_bridge.py` sorts first alphabetically in `unittest discover`, which initially caused `py_modules.common` to initialize before `tests/test_token_refresh.py` patched `sys.modules["decky"]`. Importing `from test_token_refresh import main` at the top of `tests/test_cdp_bridge.py` resolved this cleanly; all 686 Python tests pass.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `py_modules/cdp_bridge.py` is ready for Plan 26-02 (`_try_cdp_station_radio` wiring, Deep Discovery 2.0 `get_discovery_mixes` RPC, and `SearchTab` browse categories enrichment).

## Self-Check: PASSED
- `py_modules/cdp_bridge.py`: FOUND
- `tests/test_cdp_bridge.py`: FOUND
- `py_modules/engine.py`: FOUND
- `py_modules/rpc_library.py`: FOUND
- Commit `8d11352`: FOUND
- Commit `7b262f2`: FOUND
