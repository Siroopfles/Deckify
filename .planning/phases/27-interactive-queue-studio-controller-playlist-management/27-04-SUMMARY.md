---
phase: 27-interactive-queue-studio-controller-playlist-management
plan: 04
subsystem: ui
tags: [react, decky-ui, playlists, queue, controller-navigation, vitest]

requires:
  - phase: 27-02
    provides: useGrabMoveOrder hook and TrackRowItem Grab/Move Mode controls
  - phase: 27-03
    provides: QueueTab Grab/Move Mode and queue/playlist mutation primitives
provides:
  - PlaylistsTab with Create/Edit forms, Delete/Unfollow confirmation modal, overview & track filters, ownership gating, and Grab/Move Mode
  - CollectionActionModal with Edit Playlist Details and Delete/Unfollow Playlist actions
  - TrackActionModal with Queue/Playlist Move & Remove actions and searchable editable-only playlist picker with + New Playlist with Track
  - Vitest coverage in PlaylistsTab.test.tsx and TrackActionModal.test.tsx
affects: [27-05, DeckifyExpandedModal]

actuals:
  tokens: 26580
  tasks: 3
  commits: 3
commits: 3
plan_head_before: 557ef6cbdddb0ca1532c175a87c11ae21c69fc14
plan_head_after: a0f626061dd44e3b3c2bccc48316a7db427228f8

tech-stack:
  added: []
  patterns:
    - "Render helpers (renderPlaylistDetailHeader, renderPlaylistDetailView) preserve single-call JSX tree inspection in unit tests"
    - "Secondary manage bar in PlaylistsTab keeps Edit/Delete/Unfollow accessible without crowding the main header Focusable"

key-files:
  created:
    - src/components/tabs/PlaylistsTab.test.tsx
  modified:
    - src/components/tabs/PlaylistsTab.tsx
    - src/components/common/CollectionActionModal.tsx
    - src/components/common/TrackActionModal.tsx
    - src/components/common/TrackActionModal.test.tsx

key-decisions:
  - "Placed Edit Details and Delete/Unfollow Playlist buttons in a dedicated secondary Focusable row below the main detail header so the primary header preserves its 3-button (librespot) / 4-button (spotify_client) layout"
  - "Filtered TrackActionModal playlist picker strictly on pl.is_editable !== false and added + New Playlist with Track at the top with inline Name + Description TextFields"

patterns-established:
  - "Preserve originalIndex before filtering playlistTracks so playback and single-instance removal remain index-accurate under active trackFilter"

requirements-completed: [PL-01, QUEUE-03]

coverage:
  - id: D1
    description: "PlaylistsTab CRUD forms, Delete/Unfollow confirmation modal with Cancel initial focus, local overview/track filters, ownership gating, and Grab/Move Mode"
    requirement: "PL-01"
    verification:
      - kind: unit
        ref: "src/components/tabs/PlaylistsTab.test.tsx"
        status: pass
    human_judgment: false
  - id: D2
    description: "CollectionActionModal and TrackActionModal queue/playlist Move & Remove actions and searchable editable-only playlist picker"
    requirement: "QUEUE-03"
    verification:
      - kind: unit
        ref: "src/components/common/TrackActionModal.test.tsx"
        status: pass
    human_judgment: false

duration: 11min
completed: 2026-11-25
status: complete
---

# Phase 27 Plan 04: PlaylistsTab, CollectionActionModal & TrackActionModal UI Summary

**Delivered controller-driven playlist CRUD, Delete/Unfollow confirmation modal, local overview/track filtering, ownership-gated Grab/Move Mode, and searchable editable-only playlist picker with inline playlist creation**

## Performance

- **Duration:** 11 min
- **Started:** 2026-11-25T19:48:23Z
- **Completed:** 2026-11-25T19:59:37Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- Upgraded `PlaylistsTab.tsx` with Create/Edit playlist forms (Name + optional Description, empty-name validation), context-aware `PlaylistDeleteConfirmModal` focusing `Cancel` on mount, local `TextField` filters for overview & tracks (preserving `originalIndex`), and ownership-gated `useGrabMoveOrder` Grab/Move Mode.
- Extended `CollectionActionModal.tsx` with `Edit Playlist Details` (editable playlists only) and `Delete Playlist` / `Unfollow Playlist`.
- Extended `TrackActionModal.tsx` with `Move in Queue` / `Remove from Queue` (`mode === "queue"`), `Move Track` / `Remove from Playlist` (`mode === "playlists"` when editable), and a searchable editable-only `Add to Playlist...` picker featuring `+ New Playlist with Track` at the top.
- Added `PlaylistsTab.test.tsx` (5 tests) and extended `TrackActionModal.test.tsx` (8 tests total), with all 29 Vitest suites (359 tests), `tsc --noEmit`, and `eslint` passing with 0 errors and 0 warnings on all modified files.

## Task Commits

Each task was committed atomically:

1. **Task 1: Upgrade PlaylistsTab.tsx with CRUD forms, Delete/Unfollow modal, local filters, and Grab/Move Mode** - `524f3f8` (feat)
2. **Task 2: Update CollectionActionModal.tsx and TrackActionModal.tsx (with updated TrackActionModal.test.tsx mocks)** - `42cbf0a` (feat)
3. **Task 3: Create PlaylistsTab.test.tsx** - `a0f6260` (test)

## Files Created/Modified
- `src/components/tabs/PlaylistsTab.tsx` - CRUD forms, `PlaylistDeleteConfirmModal`, overview/track filters, ownership gating, and `useGrabMoveOrder` integration.
- `src/components/common/CollectionActionModal.tsx` - `Edit Playlist Details` and `Delete Playlist` / `Unfollow Playlist` actions.
- `src/components/common/TrackActionModal.tsx` - Queue/Playlist Move & Remove actions and searchable editable-only playlist picker with `+ New Playlist with Track`.
- `src/components/common/TrackActionModal.test.tsx` - Updated mocks and added Phase 27 queue/playlist action & picker specs.
- `src/components/tabs/PlaylistsTab.test.tsx` - Added Vitest specs for CRUD validation, read-only gating, filter `originalIndex` preservation, empty states, and `PlaylistDeleteConfirmModal` Cancel focus.

## Decisions Made
- Placed `Edit Details` and `Delete Playlist` / `Unfollow Playlist` in a dedicated secondary `Focusable` manage bar below `renderPlaylistDetailHeader` so the primary header preserves its 3/4-button layout and avoids horizontal crowding.
- Filtered `allUserPlaylists` in `TrackActionModal` strictly on `pl.is_editable !== false` and rendered `+ New Playlist with Track` at the top of the picker.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated TrackActionModal.test.tsx mocks alongside Task 2 commit**
- **Found during:** Task 2 commit
- **Issue:** Adding `useState` and `TextField` to `TrackActionModal.tsx` caused Husky's pre-commit `vitest` run to require `useState` and `TextField` in `TrackActionModal.test.tsx`'s mocks.
- **Fix:** Extended `TrackActionModal.test.tsx` mocks and Phase 27 assertions in Task 2's commit so the pre-commit gate passed without `--no-verify`.
- **Files modified:** `src/components/common/TrackActionModal.test.tsx`
- **Verification:** `pnpm test -- --run src/components/common/TrackActionModal.test.tsx` (8/8 passed)
- **Committed in:** `42cbf0a`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to keep every atomic commit green under the pre-commit test hook. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `PlaylistsTab`, `CollectionActionModal`, and `TrackActionModal` are ready to be wired to backend RPC handlers and controller shortcuts in Plan `27-05` (`DeckifyExpandedModal.tsx`).

## Self-Check: PASSED
- Created file `src/components/tabs/PlaylistsTab.test.tsx` verified on disk.
- Task commits `524f3f8`, `42cbf0a`, and `a0f6260` verified in `HEAD` history.
