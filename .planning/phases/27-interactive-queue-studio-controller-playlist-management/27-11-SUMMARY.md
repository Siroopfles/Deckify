---
phase: 27-interactive-queue-studio-controller-playlist-management
plan: 11
subsystem: ui
tags: [react, playlists, grab-move, sorting, controller-nav]
dependency-graph:
  requires:
    - 27-09
    - 27-10
  provides:
    - PlaylistsTab horizontal track sort chip bar (Custom Order, Title, Artist, Album, Duration, Date Added)
    - PlaylistsTab Grab/Move focus-halo suppression and any-row A-drop commit
    - DeckifyExpandedModal global vgp_onok grabCommitRef interception and preGrabTracks uid/rollback fix
  affects:
    - src/components/tabs/PlaylistsTab.tsx
    - src/components/DeckifyExpandedModal.tsx
    - src/components/tabs/PlaylistsTab.test.tsx
tech-stack:
  added: []
  patterns:
    - Reused renderMetaFilterBar and TrackRowItem hasActiveGrab/onCommitGrab props from QueueTab
    - Capture-phase vgp_onok interception in DeckifyExpandedModal attachNav during active Grab/Move
key-files:
  created: []
  modified:
    - src/components/tabs/PlaylistsTab.tsx
    - src/components/DeckifyExpandedModal.tsx
    - src/components/tabs/PlaylistsTab.test.tsx
decisions:
  - "Reused renderMetaFilterBar with TRACK_SORT_CHIPS for the horizontal track-sort-bar in PlaylistsTab"
  - "Registered vgp_onok in capture phase (true) on DeckifyExpandedModal attachNav so A-button drops active grabs before child row handlers fire"
metrics:
  duration: ~6m
  completed: 2026-11-26
status: complete
commits: 2
plan_head_before: 1ac6c279bb5520998d301023856316aff3c30c89
plan_head_after: 6c032a2c9ff93f1ac0fd5c4099775f6dba7efef1
actuals:
  tokens: 6025
  tasks: 2
  commits: 2
---

# Phase 27 Plan 11: PlaylistsTab Track Sort, Grab/Move A-Drop, and Pre-Grab Snapshot Summary

Added horizontal controller track sorting (`Custom Order`, `Title`, `Artist`, `Album`, `Duration`, `Date Added`) to `PlaylistsTab`, gated Grab/Move reordering on `custom` sort order, wired `hasActiveGrab`/`onCommitGrab` + global capture-phase `vgp_onok` drop handling, and fixed `handleReorderPlaylistTrack` to resolve `uid`/`targetUid` and rollback state from the pre-grab snapshot.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Add PlaylistsTab track sort controls and Grab/Move focus-lock + pre-grab snapshot forwarding (G-27-8) | `a5908a5` | `src/components/tabs/PlaylistsTab.tsx`, `src/components/tabs/PlaylistsTab.test.tsx` |
| 2 | Fix handleReorderPlaylistTrack pre-grab snapshot and wire global grabCommitRef in DeckifyExpandedModal (G-27-6, G-27-8) | `6c032a2` | `src/components/DeckifyExpandedModal.tsx` |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Mocked `document.querySelector` in `PlaylistsTab.test.tsx`**
- **Found during:** Task 1
- **Issue:** `useGrabMoveOrder` calls `document.querySelector` when scheduling row focus on grab entry, which threw `TypeError: document.querySelector is not a function` in the minimal `PlaylistsTab.test.tsx` `document` stub.
- **Fix:** Added `querySelector: vi.fn(() => null)` to the `beforeEach` `document` mock in `src/components/tabs/PlaylistsTab.test.tsx`.
- **Files modified:** `src/components/tabs/PlaylistsTab.test.tsx`
- **Commit:** `a5908a5`

## Verification

- `pnpm typecheck` — passed (0 errors)
- `pnpm lint` — passed (0 errors; pre-existing `no-explicit-any` warnings only)
- `pnpm test -- --run` — passed (30 test files, 390 tests, including 10 in `src/components/tabs/PlaylistsTab.test.tsx`)
- `py -3 -m unittest discover -s tests -p "test_*.py"` — passed (765 tests in 86.382s, OK)
- `pnpm build` (via husky pre-commit hook) — passed (`rollup -c` -> `dist`)

## Known Stubs

None.

## Self-Check: PASSED

- Verified `src/components/tabs/PlaylistsTab.tsx`, `src/components/DeckifyExpandedModal.tsx`, and `src/components/tabs/PlaylistsTab.test.tsx` exist on disk.
- Verified commits `a5908a5` and `6c032a2` are ancestors of `HEAD`.
