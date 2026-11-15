---
phase: 09-qam-pinned-playlists-quick-in-game-switch
plan: "02"
subsystem: ui
tags: [qam, pinned-playlists, collection-action-modal, decky-ui, react, vitest]

# Dependency graph
requires:
  - phase: 09-qam-pinned-playlists-quick-in-game-switch
    plan: "01"
    provides: "PinnedPlaylistItem types, set_setting('pinned_playlists') max-4 validation, and QAM pill strip"
provides:
  - "CollectionActionModal component for Y-button collection Play and Pin/Unpin actions"
  - "handleTogglePin, focusedCollectionRef, actionCollection state, Y-button dispatch, and B-button cancel in DeckifyExpandedModal"
  - "FaThumbtack row badges, focus tracking, and detail-header Pin/Unpin toggles in PlaylistsTab, AlbumsTab, and LikedSongsTab"
  - "Vitest coverage for detail-header Pin/Unpin, Y-menu CollectionActionModal, Liked Songs toggle, and non-evicting max-4 limit"
affects: [phase-10, verify-work]

# Actuals (#2632)
actuals:
  tokens: 9865
  tasks: 3
  commits: 3
plan_head_before: b6e2c706690bc6dc041ccf108d03113d64663152
plan_head_after: 4f4b9980dc665567730b5eaf144e30ecb22e43e5

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CollectionActionModal mirrors TrackActionModal focus capture/restoration and zIndex 100 overlay for playable collections"
    - "Library tabs expose both Y-button row focus tracking (onFocusCollection) and detail-header FaThumbtack InteractiveRow toggles"

key-files:
  created:
    - src/components/common/CollectionActionModal.tsx
  modified:
    - src/components/DeckifyExpandedModal.tsx
    - src/components/tabs/PlaylistsTab.tsx
    - src/components/tabs/AlbumsTab.tsx
    - src/components/tabs/LikedSongsTab.tsx
    - src/components/DeckifyExpandedModal.test.tsx

key-decisions:
  - "Non-evicting max-4 limit enforced in handleTogglePin with Decky toaster feedback ('Max 4 pinned items — unpin one first') and explicit Y-menu label ('Max 4 Pinned — Unpin One First')"

patterns-established:
  - "Collection rows clear focusedTrackRef when focused so Y-button dispatch cleanly falls back to focusedCollectionRef"

requirements-completed: [QAM-01]

coverage:
  - id: D1
    description: "Users can pin or unpin Playlists, Albums, and Liked Songs from detail-view header FaThumbtack toggle buttons"
    requirement: QAM-01
    verification:
      - kind: unit
        ref: "src/components/DeckifyExpandedModal.test.tsx#pins a playlist from PlaylistsTab detail header and shows Pinned to QAM toast"
        status: pass
      - kind: unit
        ref: "src/components/DeckifyExpandedModal.test.tsx#unpins an already-pinned item from detail header and shows Unpinned from QAM toast"
        status: pass
      - kind: unit
        ref: "src/components/DeckifyExpandedModal.test.tsx#renders Pin to QAM / Unpin from QAM toggle in LikedSongsTab for spotify:collection:tracks"
        status: pass
    human_judgment: false
  - id: D2
    description: "Focusing a playlist or album row shows FaThumbtack badge when pinned and opens CollectionActionModal on Y press with B-button cancel"
    requirement: QAM-01
    verification:
      - kind: unit
        ref: "src/components/DeckifyExpandedModal.test.tsx#focuses an album row, opens CollectionActionModal on Y, and shows row FaThumbtack badge when pinned"
        status: pass
    human_judgment: false
  - id: D3
    description: "Attempting to pin a 5th item while 4 items are already pinned does not auto-evict and shows non-evicting toast and Y-menu label"
    requirement: QAM-01
    verification:
      - kind: unit
        ref: "src/components/DeckifyExpandedModal.test.tsx#does not auto-evict when 4 items are already pinned and shows max-4 toast and Y-menu label"
        status: pass
    human_judgment: false

# Metrics
duration: 6min
completed: 2026-11-14
status: complete
---

# Phase 09 Plan 02: Expanded Modal Pin/Unpin UI & CollectionActionModal Summary

**Controller-friendly `CollectionActionModal` (`Y` menu) and detail-header `FaThumbtack` Pin/Unpin toggles across `PlaylistsTab`, `AlbumsTab`, and `LikedSongsTab` with row badges and non-evicting 4-item limit feedback**

## Performance

- **Duration:** 6 min
- **Started:** 2026-11-14T22:53:31Z
- **Completed:** 2026-11-14T22:59:28Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- Created `src/components/common/CollectionActionModal.tsx` with focus capture/restoration (`previousFocusRef` + `requestAnimationFrame`), `DeckifyImage` artwork/fallback icon, `Play`, and `Pin to QAM` / `Unpin from QAM` / `Max 4 Pinned — Unpin One First` actions.
- Wired `handleTogglePin`, `focusedCollectionRef`, `actionCollection` state, `Y`-button collection dispatch, and `vgp_oncancel` (`B`) dismissal in `src/components/DeckifyExpandedModal.tsx`, persisting via `set_setting("pinned_playlists", ...)` and showing Decky toasts without auto-evicting at 4 items.
- Added `FaThumbtack` row pin badges, `onFocusCollection` row tracking, and detail-header `FaThumbtack` toggle buttons to `PlaylistsTab.tsx`, `AlbumsTab.tsx`, and `LikedSongsTab.tsx`.
- Added 5 Vitest tests in `src/components/DeckifyExpandedModal.test.tsx` covering detail-header pin/unpin, `Y`-menu `CollectionActionModal`, row pin badges, `LikedSongsTab` toggle, and max-4 non-evicting behavior.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create CollectionActionModal and wire Pin/Unpin state + Y-button dispatch in DeckifyExpandedModal** - `65039d1` (feat)
2. **Task 2: Add Pin/Unpin badges, focus tracking, and detail-header toggles in PlaylistsTab, AlbumsTab, and LikedSongsTab** - `b80815c` (feat)
3. **Task 3: Add Vitest coverage for Pin/Unpin workflows, Y-menu CollectionActionModal, and max-4 limit** - `4f4b998` (test)

## Files Created/Modified
- `src/components/common/CollectionActionModal.tsx` - Controller-focused `Y` action modal for playable collections (`Play`, `Pin to QAM` / `Unpin from QAM` / `Max 4 Pinned — Unpin One First`).
- `src/components/DeckifyExpandedModal.tsx` - Added `handleTogglePin`, `pinnedUris`, `focusedCollectionRef`, `actionCollection`, `Y`-button fallback, and `B`-button cancel.
- `src/components/tabs/PlaylistsTab.tsx` - Added `FaThumbtack` row badges, `onFocusCollection`, and detail-header Pin/Unpin toggle.
- `src/components/tabs/AlbumsTab.tsx` - Added `FaThumbtack` row badges, `onFocusCollection`, and detail-header Pin/Unpin toggle.
- `src/components/tabs/LikedSongsTab.tsx` - Added horizontal header `Focusable` with `FaThumbtack` Pin/Unpin toggle for `spotify:collection:tracks`.
- `src/components/DeckifyExpandedModal.test.tsx` - Added 5 Vitest tests for Pin/Unpin workflows, `CollectionActionModal`, and max-4 limit.

## Decisions Made
- Enforced non-evicting 4-item limit in `handleTogglePin` with Decky toaster feedback (`"Max 4 pinned items — unpin one first"`) and explicit `CollectionActionModal` label (`"Max 4 Pinned — Unpin One First"`).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Vitest's ESM named-import check rejected the original empty-object `Proxy` mock for `react-icons/fa` when rendering `PlaylistsTab`, `AlbumsTab`, and `LikedSongsTab` directly; updated the mock in `src/components/DeckifyExpandedModal.test.tsx` to use `importOriginal` keys mapped to the mock `Icon` component, after which all 16 tests in `DeckifyExpandedModal.test.tsx` and all 121 Vitest tests across 15 files passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 09 (`09-01` and `09-02`) is complete and ready for phase verification (`/gsd-verify-work 9`).

## Self-Check: PASSED

- Created/modified files verified on disk (`src/components/common/CollectionActionModal.tsx`, `src/components/DeckifyExpandedModal.tsx`, `src/components/tabs/PlaylistsTab.tsx`, `src/components/tabs/AlbumsTab.tsx`, `src/components/tabs/LikedSongsTab.tsx`, `src/components/DeckifyExpandedModal.test.tsx`).
- All 3 task commits verified in git history (`65039d1`, `b80815c`, `4f4b998`).
- Full verification passed: `eslint`, `pnpm run typecheck`, `pnpm test` (15 files, 121 tests), `pnpm run build`, and `py -m unittest discover -s tests -p "test_*.py"` (440 tests).

---
*Phase: 09-qam-pinned-playlists-quick-in-game-switch*
*Completed: 2026-11-14*
