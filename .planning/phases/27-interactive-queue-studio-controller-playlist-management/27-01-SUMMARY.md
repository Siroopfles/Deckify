---
phase: 27-interactive-queue-studio-controller-playlist-management
plan: 01
subsystem: api
tags: [cdp, spotify, queue, playback, optimistic-cache, python]

# Dependency graph
requires:
  - phase: 26-deep-discovery-2-0-via-cdp
    provides: "CDP registry bridge (py_modules/cdp_bridge.py) and is_spotify_client_running guard"
provides:
  - "CDP PlayerAPI queue helpers: cdp_reorder_queue, cdp_remove_from_queue, cdp_clear_queue"
  - "Backend queue mutation RPCs: reorder_queue_track, remove_queue_track, clear_queue with URI-slice fallback"
  - "4.5s _optimistic_queue_snapshot with automatic invalidation on playback transitions"
  - "Unit test suite tests/test_queue_studio.py covering CDP escaping, fallback, pause preservation, and snapshot TTL"
affects: [27-02, 27-03, 27-04, 27-05, queue-tab, controller-playlist-management]

actuals:
  tokens: 7319
  tasks: 2
  commits: 2
  plan_head_before: 098ceabde1009e06531b262250ca49131e95f811
  plan_head_after: 35371c67f4964818e2f1c7041b0f9eeff3466edb

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CDP PlayerAPI first on spotify_client with automatic URI-slice PUT /v1/me/player/play fallback"
    - "4.5s monotonic _optimistic_queue_snapshot keyed by _poll_track_id and _shuffle_state"

key-files:
  created:
    - tests/test_queue_studio.py
  modified:
    - py_modules/cdp_bridge.py
    - py_modules/rpc_playback.py
    - main.py

key-decisions:
  - "Cap URI-slice fallback payload at 100 total URIs ([current_track_uri, *upcoming_uris[:99]]) and preserve paused state via immediate PUT /v1/me/player/pause"
  - "Short-circuit clear_queue on librespot without interrupting playback when upcoming queue is already empty"

patterns-established:
  - "Queue mutation RPCs store _optimistic_queue_snapshot(ttl_s=4.5) and clear it on track_id/shuffle change, play_tracks, add_to_queue, or next/previous"

requirements-completed: [QUEUE-03]

coverage:
  - id: D1
    description: "CDP PlayerAPI queue helpers (cdp_reorder_queue, cdp_remove_from_queue, cdp_clear_queue) with json.dumps escaping"
    requirement: "QUEUE-03"
    verification:
      - kind: unit
        ref: "tests/test_queue_studio.py#TestCdpQueueHelpers"
        status: pass
    human_judgment: false
  - id: D2
    description: "Backend reorder_queue_track, remove_queue_track, and clear_queue RPCs with URI-slice fallback preserving paused state"
    requirement: "QUEUE-03"
    verification:
      - kind: unit
        ref: "tests/test_queue_studio.py#TestQueueStudioRpc"
        status: pass
    human_judgment: false
  - id: D3
    description: "4.5s _optimistic_queue_snapshot in get_queue with automatic invalidation on state transitions"
    requirement: "QUEUE-03"
    verification:
      - kind: unit
        ref: "tests/test_queue_studio.py#TestQueueStudioRpc.test_optimistic_queue_snapshot_ttl_and_invalidation"
        status: pass
    human_judgment: false

# Metrics
duration: 5min
completed: 2026-11-25
status: complete
---

# Phase 27 Plan 01: Interactive Queue Studio Backend Tracer Summary

**CDP `PlayerAPI` queue mutation helpers, batched `reorder_queue_track` / `remove_queue_track` / `clear_queue` RPCs with paused-state-preserving URI-slice fallback, and a 4.5s `_optimistic_queue_snapshot` in `get_queue`**

## Performance

- **Duration:** 5 min
- **Started:** 2026-11-25T19:25:01Z
- **Completed:** 2026-11-25T19:29:28Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Added `cdp_remove_from_queue`, `cdp_clear_queue`, and `cdp_reorder_queue` to `py_modules/cdp_bridge.py` using `evaluate_with_registry` and `json.dumps` escaping.
- Implemented `reorder_queue_track`, `remove_queue_track`, `clear_queue`, `_mutate_queue_via_uri_slice`, and `_optimistic_queue_snapshot` helpers in `py_modules/rpc_playback.py`, wired into `main.py`.
- Added `tests/test_queue_studio.py` covering CDP escaping, `spotify_client` CDP-to-URI-slice fallback, `librespot` paused-state preservation, bounds/empty-clear idempotency, and 4.5s optimistic snapshot TTL/invalidation.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end Queue Studio backend tracer** - `f5aaa53` (feat)
2. **Task 2: Unit tests for Queue Studio backend** - `35371c6` (test)

## Files Created/Modified
- `py_modules/cdp_bridge.py` - Added `cdp_remove_from_queue`, `cdp_clear_queue`, and `cdp_reorder_queue`
- `py_modules/rpc_playback.py` - Added queue mutation RPCs, URI-slice fallback, and 4.5s `_optimistic_queue_snapshot` with invalidation hooks
- `main.py` - Exposed `reorder_queue_track`, `remove_queue_track`, and `clear_queue` RPCs on `Plugin`
- `tests/test_queue_studio.py` - Added 6 unit tests for `QUEUE-03` backend behavior

## Decisions Made
- Capped `_mutate_queue_via_uri_slice` payloads at 100 total URIs (`[current_track_uri, *upcoming_uris[:99]]`) and preserved paused playback via immediate `PUT /v1/me/player/pause`.
- Short-circuited `clear_queue` on `librespot` when the upcoming queue is already empty so current playback is not interrupted.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Backend `QUEUE-03` RPCs (`reorder_queue_track`, `remove_queue_track`, `clear_queue`) and `get_queue` optimistic snapshot are ready for frontend Grab/Move Mode and Queue Studio UI wiring in subsequent Phase 27 plans.

## Self-Check: PASSED
- `tests/test_queue_studio.py` verified present on disk.
- Commits `f5aaa53` and `35371c6` verified in `HEAD` history.
- `py -3 -m unittest tests/test_queue_studio.py tests/test_cdp_bridge.py -v` passed (12/12 tests).

---
*Phase: 27-interactive-queue-studio-controller-playlist-management*
*Completed: 2026-11-25*
