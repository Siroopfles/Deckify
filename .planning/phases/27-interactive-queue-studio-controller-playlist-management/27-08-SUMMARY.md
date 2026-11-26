---
phase: 27-interactive-queue-studio-controller-playlist-management
plan: 08
subsystem: ui
tags: [react, decky-ui, gamepad, queue, playlists, localstorage]

# Dependency graph
requires:
  - phase: 27-interactive-queue-studio-controller-playlist-management
    provides: Verified backend queue mutation persistence (27-06) and PlaylistDeleteConfirmModal vgp_oncancel trapping (27-07)
provides:
  - Row focus locking and external list reconciliation in useGrabMoveOrder
  - DeckifyImage cover art thumbnails and localStorage frequency-sorted playlists in TrackActionModal
  - isGrabbingRef poll guard, _rowKey preservation, pre-removal prevTracks fix, isCrudModalOpenRef vgp_oncancel guard, and playlist add frequency tracking in DeckifyExpandedModal
affects: [QueueTab, TrackActionModal, DeckifyExpandedModal, UAT]

# Actuals
actuals:
  tasks: 3
  commits: 3
plan_head_before: b2d7e863124a1f3eb9615bf4d5cf0ee1bda717ba
plan_head_after: f7f93246b40ca018074af1909d170ab87bd517ec

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "mergeQueueRowKeys preserves existing _rowKey identifiers across 10s background queue polls by uid then occurrence-indexed uri/id"
    - "Ref mirrors (isGrabbingRef, isCrudModalOpenRef) guard async callbacks and DOM event listeners without altering useState hook slot order"

key-files:
  created: []
  modified:
    - src/hooks/useGrabMoveOrder.ts
    - src/components/common/TrackActionModal.tsx
    - src/components/common/TrackActionModal.test.tsx
    - src/components/DeckifyExpandedModal.tsx
    - src/components/tabs/QueueTab.test.tsx

key-decisions:
  - "Check isGrabbingRef.current both before and after await backendGetQueue() in loadQueue so in-flight polls cannot overwrite active Grab/Move state"
  - "Validate localStorage deckify_playlist_add_counts entries with Number.isFinite and try/catch so corrupted JSON safely falls back to {}"

patterns-established:
  - "TrackActionModal playlist picker sorts editable playlists by descending localStorage selection frequency while preserving API order on ties"

requirements-completed: [QUEUE-03, PL-01]

coverage:
  - id: D1
    description: "useGrabMoveOrder schedules row focus on moveGrabbed and cleanly exits Grab/Move Mode when items replaces/removes grabbedKey"
    requirement: "QUEUE-03"
    verification:
      - kind: unit
        ref: "src/components/tabs/QueueTab.test.tsx#useGrabMoveOrder hook"
        status: pass
    human_judgment: false
  - id: D2
    description: "TrackActionModal playlist picker renders DeckifyImage thumbnails with FaFolder fallback and sorts frequently chosen playlists first"
    requirement: "PL-01"
    verification:
      - kind: unit
        ref: "src/components/common/TrackActionModal.test.tsx#renders DeckifyImage cover art on playlist picker rows and sorts frequent playlists first while preserving tie order"
        status: pass
    human_judgment: false
  - id: D3
    description: "DeckifyExpandedModal guards loadQueue with isGrabbingRef, preserves _rowKey across polls, passes prevTracks to backendRemoveQueueTrack, guards vgp_oncancel with isCrudModalOpenRef, and records playlist add counts"
    requirement: "QUEUE-03"
    verification:
      - kind: integration
        ref: "pnpm test -- --run && pnpm run build && py -3 -m unittest tests/test_queue_studio.py tests/test_playlist_management.py"
        status: pass
    human_judgment: false

# Metrics
duration: 4min
completed: 2026-11-26
status: complete
---

# Phase 27 Plan 08: Grab/Move Focus Lock, Queue Poll Guard & Playlist Picker Polish Summary

**Locked controller row focus and reconciled external queue updates in `useGrabMoveOrder`, added `isGrabbingRef`/`isCrudModalOpenRef`/`prevTracks` guards in `DeckifyExpandedModal`, and added `DeckifyImage` thumbnails with frequency-sorted playlists in `TrackActionModal`.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-11-26T08:07:03Z
- **Completed:** 2026-11-26T08:10:44Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- Updated `useGrabMoveOrder.ts` to call `scheduleRowFocus(key)` alongside `scheduleRowScroll(key)` in `moveGrabbed`, and added a `[items]` `useEffect` that cleanly exits Grab/Move Mode if `grabbedKeyRef.current` disappears from `items`.
- Exported `getPlaylistAddCounts` and `recordPlaylistAddCount` (with `try/catch` and `Number.isFinite` validation on `localStorage` key `deckify_playlist_add_counts`) in `TrackActionModal.tsx`, sorted `editablePlaylists` by descending selection count, and rendered 28x28 `<DeckifyImage>` cover art with `<FaFolder>` fallback on every picker row.
- Updated `DeckifyExpandedModal.tsx` to guard `loadQueue` with `isGrabbingRef.current`, preserve existing `_rowKey`s across queue polls via `mergeQueueRowKeys`, pass pre-removal `prevTracks` to `backendRemoveQueueTrack`, guard `vgp_oncancel` with `isCrudModalOpenRef.current`, and call `recordPlaylistAddCount` on successful playlist add/create-with-track.

## Task Commits

Each task was committed atomically:

1. **Task 1: Lock row focus and reconcile external item changes in useGrabMoveOrder.ts** - `149a643` (fix)
2. **Task 2: Render DeckifyImage thumbnails and frequency-sorted playlists in TrackActionModal.tsx** - `1c067ee` (feat)
3. **Task 3: Wire poll guard, prevTracks fix, CRUD B-button guard, and frequency recording in DeckifyExpandedModal.tsx** - `f7f9324` (fix)

## Files Created/Modified
- `src/hooks/useGrabMoveOrder.ts` - Added `scheduleRowFocus(key)` in `moveGrabbed` and external `items` reconciliation `useEffect`.
- `src/components/common/TrackActionModal.tsx` - Added `getPlaylistAddCounts`/`recordPlaylistAddCount`, frequency sorting, and `DeckifyImage` thumbnails in `renderPlaylistPickerOverlay`.
- `src/components/common/TrackActionModal.test.tsx` - Added unit tests for `DeckifyImage` rendering, frequency sorting with tie stability, and corrupted `localStorage` handling.
- `src/components/DeckifyExpandedModal.tsx` - Added `isGrabbingRef`, `isCrudModalOpenRef`, `mergeQueueRowKeys`, `prevTracks` fix in `handleRemoveQueueTrack`, `vgp_oncancel` CRUD modal guard, and `recordPlaylistAddCount` calls.
- `src/components/tabs/QueueTab.test.tsx` - Added unit tests for `moveGrabbed` focus scheduling and orphaned `grabbedKey` reconciliation.

## Decisions Made
- Checked `isGrabbingRef.current` both before and after `await backendGetQueue()` in `loadQueue` so an in-flight 10s poll started prior to entering Grab/Move Mode cannot overwrite active drag state.
- Validated `localStorage` JSON values with `Number.isFinite` and `try/catch` in `getPlaylistAddCounts` to prevent corrupted storage data from crashing `TrackActionModal`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All Phase 27 frontend and backend gap-closure plans (`27-06`, `27-07`, `27-08`) are complete and verified (`29` Vitest test files / `368` tests passed, `tsc --noEmit` clean, `rollup -c` build succeeded, `14` backend Phase 27 tests OK).

## Self-Check: PASSED

- FOUND: `src/hooks/useGrabMoveOrder.ts`
- FOUND: `src/components/common/TrackActionModal.tsx`
- FOUND: `src/components/common/TrackActionModal.test.tsx`
- FOUND: `src/components/DeckifyExpandedModal.tsx`
- FOUND: `src/components/tabs/QueueTab.test.tsx`
- FOUND: `149a643`
- FOUND: `1c067ee`
- FOUND: `f7f9324`

---
*Phase: 27-interactive-queue-studio-controller-playlist-management*
*Completed: 2026-11-26*
