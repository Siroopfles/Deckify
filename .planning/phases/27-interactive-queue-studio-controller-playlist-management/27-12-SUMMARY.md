---
phase: 27-interactive-queue-studio-controller-playlist-management
plan: 12
subsystem: queue-studio
tags: [cdp, queue, playback, focus, gap-closure]
requires:
  - phase: 27-09
    provides: CDP queue removal/clear helpers and optimistic queue snapshot
provides:
  - Non-interrupting queue reorder, remove, and clear via CDP UID resolution and deferred track-transition flush
  - preGrabTracks forwarding in handleReorderQueueTrack and adjacent-row focus restoration on inline remove
affects: [py_modules/cdp_bridge.py, py_modules/rpc_playback.py, main.py, DeckifyExpandedModal, QueueTab]
tech-stack:
  added: []
  patterns:
    - Deferred _pending_queue_override flushed on _poll_track_id transition in _poll_playback
    - Adjacent [data-row-key] focus restoration via requestAnimationFrame on inline row removal
key-files:
  created: []
  modified:
    - py_modules/cdp_bridge.py
    - py_modules/rpc_playback.py
    - main.py
    - tests/test_queue_studio.py
    - src/components/DeckifyExpandedModal.tsx
    - src/components/tabs/QueueTab.tsx
    - src/components/tabs/QueueTab.test.tsx
key-decisions:
  - "Defer non-CDP and context-track queue mutations in _pending_queue_override until natural _poll_track_id transition instead of calling PUT me/player/play mid-track"
  - "Keep _get_valid_optimistic_queue valid across get_queue() polls for the duration of _poll_track_id while _pending_queue_override is active"
  - "Forward preGrabTracks to backendReorderQueueTrack so rpc_playback does not double-mutate an already-reordered queue array"
patterns-established:
  - "Deferred queue override pattern: _schedule_deferred_queue_override -> _get_valid_optimistic_queue -> flush_pending_queue_override"
requirements-completed: [QUEUE-03]
duration: 5min
completed: 2026-11-26
status: complete
commits: 2
plan_head_before: a57baeb
plan_head_after: f79ffa4f7570e25b933a16e31c5379ee3cd3aba7
---

# Phase 27 Plan 12: Queue Drop/Remove Stutter & Focus Closure Summary

**Eliminated mid-track `PUT /v1/me/player/play` audio stutters on queue reorder/remove/clear by resolving CDP UIDs and deferring context-track mutations until natural track transition, while forwarding `preGrabTracks` and restoring focus on inline remove.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-11-26T20:15:21Z
- **Completed:** 2026-11-26T20:20:13Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Updated `cdp_reorder_queue` in `py_modules/cdp_bridge.py` to resolve missing `uid`/`target_uid` from `PlayerAPI.getQueue()`/`getState()`, wrap reorder calls in `try/catch`, and flag `is_context_track=True` when context tracks cannot be reordered.
- Updated `cdp_remove_from_queue` in `py_modules/cdp_bridge.py` to distinguish `nextTracks` vs `futureTracks`/`future` and return `is_context_track=True` when a context track cannot be removed by `PlayerAPI.removeFromQueue`.
- Added `_schedule_deferred_queue_override` and `flush_pending_queue_override` in `py_modules/rpc_playback.py`, updated `_get_valid_optimistic_queue` to persist across `get_queue()` polls for the active `_poll_track_id`, and updated `reorder_queue_track`, `remove_queue_track`, and `clear_queue` to defer instead of calling `_mutate_queue_via_uri_slice` mid-track.
- Wired `rpc_playback.flush_pending_queue_override` into `main.py`'s `_poll_playback` on `track_id != self._poll_track_id` transition.
- Updated `handleReorderQueueTrack` in `src/components/DeckifyExpandedModal.tsx` to forward `preGrabTracks ?? nextTracks` to `backendReorderQueueTrack`, and updated `QueueTab.tsx` inline `✕` remove to focus the adjacent `[data-row-key]` row via `requestAnimationFrame`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Eliminate mid-track PUT me/player/play stutters in cdp_bridge, rpc_playback, and main.py** - `e8f039e` (fix)
2. **Task 2: Pass preGrabTracks in handleReorderQueueTrack and restore adjacent row focus on inline remove** - `f79ffa4` (fix)

## Files Created/Modified
- `py_modules/cdp_bridge.py` - UID resolution in `cdp_reorder_queue` and `is_context_track` detection in `cdp_remove_from_queue` / `cdp_reorder_queue`.
- `py_modules/rpc_playback.py` - Deferred `_pending_queue_override` scheduling, optimistic snapshot persistence, and `flush_pending_queue_override` on track boundary.
- `main.py` - `_poll_playback` track transition flush hook for `_pending_queue_override`.
- `tests/test_queue_studio.py` - 13 unit tests covering deferred queue mutations, CDP UID/context detection, and track-transition flushing.
- `src/components/DeckifyExpandedModal.tsx` - `handleReorderQueueTrack` forwarding `preGrabTracks ?? nextTracks`.
- `src/components/tabs/QueueTab.tsx` - Adjacent `[data-row-key]` focus restoration on inline `✕` remove click.
- `src/components/tabs/QueueTab.test.tsx` - Added test verifying adjacent row focus restoration on inline remove.

## Decisions Made
- Deferring non-CDP and context-track queue mutations until `_poll_track_id` transitions avoids restarting the active audio stream via `PUT /v1/me/player/play` while keeping `get_queue()` consistent via `_get_valid_optimistic_queue`.
- `flush_pending_queue_override` is cleared immediately in `_invalidate_optimistic_queue` as well as on track transition so new playback commands (`play_tracks`, `add_to_queue`, `next`) never apply stale overrides.

## Deviations from Plan

None - plan executed as written. (Existing tests in `tests/test_queue_studio.py` that asserted mid-track `PUT me/player/play` while `_poll_track_id` was active were updated to assert deferred `_pending_queue_override` behavior, while preserving the stopped-state `_poll_track_id=None` URI-slice fallback test.)

## Verification

- `py -3 -m unittest tests.test_queue_studio -v`: 13/13 passed (plus full 789-test Python suite passed in Task 1 pre-commit hook).
- `pnpm test -- --run src/components/tabs/QueueTab.test.tsx`: 17/17 passed (plus full 30-file / 397-test Vitest suite, `tsc --noEmit`, and `eslint` passed in Task 2 pre-commit hook).
- `pnpm run build`: succeeded (`created dist in 14.1s`).

## Self-Check: PASSED
- Verified all 7 modified files exist and commits `e8f039e` and `f79ffa4` are ancestors of `HEAD`.
