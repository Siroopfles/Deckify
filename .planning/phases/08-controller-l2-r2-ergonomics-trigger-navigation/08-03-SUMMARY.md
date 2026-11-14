---
phase: 08-controller-l2-r2-ergonomics-trigger-navigation
plan: 03
subsystem: ui
tags: [gamepad, triggers, list-navigation, focus, vitest, react]

# Dependency graph
requires:
  - phase: 08-controller-l2-r2-ergonomics-trigger-navigation
    provides: "Modal-scoped useTriggerNavigation hook (Plan 08-01) and floating trigger indicator pill + trigger_page_size setting (Plan 08-02)"
provides:
  - "Pure computeListJump(labels, currentIndex, direction, pageSize, sortedAz) helper in src/utils/listNavigation.ts"
  - "data-deckify-list-item and data-deckify-label pass-through in InteractiveRow and automatic tagging in TrackRowItem"
  - "contentPaneRef focus guard, scrollIntoView + focus transfer, onLoadMore pagination, and floating position pill in DeckifyExpandedModal"
  - "List row and A-Z sort container tagging across PlaylistsTab, AlbumsTab, ArtistsTab, PodcastsTab, SearchTab, QueueTab, and SoundtracksTab"
affects:
  - phase-08-verify

actuals:
  tokens: 6702
  tasks: 3
  commits: 3
commits: 3
plan_head_before: ad8f141980ea2c884bf2e9c3c651370a64664897
plan_head_after: ed3cb543b9dd6f11d026e0628abe46beb03d47ba

tech-stack:
  added: []
  patterns:
    - "DOM-queryable list row tagging via data-deckify-list-item='true', data-deckify-label, and data-deckify-sorted='az'"
    - "contentPaneRef.current?.contains(document.activeElement) guard isolating Sidebar focus from L2/R2 list jumps"

key-files:
  created:
    - src/utils/listNavigation.ts
    - src/utils/listNavigation.test.ts
  modified:
    - src/components/common/InteractiveRow.tsx
    - src/components/common/TrackRowItem.tsx
    - src/components/DeckifyExpandedModal.tsx
    - src/components/DeckifyExpandedModal.test.tsx
    - src/components/tabs/PlaylistsTab.tsx
    - src/components/tabs/AlbumsTab.tsx
    - src/components/tabs/ArtistsTab.tsx
    - src/components/tabs/PodcastsTab.tsx
    - src/components/tabs/SearchTab.tsx
    - src/components/tabs/QueueTab.tsx
    - src/components/tabs/SoundtracksTab.tsx

key-decisions:
  - "Computed list jumps directly from DOM-queried [data-deckify-list-item='true'] rows inside contentPaneRef so all 9 list tabs share one uniform scroll+focus mechanism without per-tab imperative refs."

patterns-established:
  - "List fast-paging contract: tag list rows with data-deckify-list-item='true' and data-deckify-label, and optionally data-deckify-sorted='az' on A-Z sorted containers."

requirements-completed: [CTRL-02]

coverage:
  - id: D1
    description: "computeListJump computes ±pageSize jumps, A-Z anchor jumps, short-list first/last jumps, empty/single-element edge cases, boundary clamping, and shouldLoadMore pagination."
    requirement: "CTRL-02"
    verification:
      - kind: unit
        ref: "src/utils/listNavigation.test.ts#computeListJump"
        status: pass
    human_judgment: false
  - id: D2
    description: "DeckifyExpandedModal enforces contentPaneRef focus guard (ignoring Sidebar focus), scrolls target row into view, transfers D-pad focus, triggers loadLikedTracks(true) at end, and displays floating position pill."
    requirement: "CTRL-02"
    verification:
      - kind: unit
        ref: "src/components/DeckifyExpandedModal.test.tsx#enforces contentPaneRef focus guard, jumps list rows with scrollIntoView + focus, and shows position pill"
        status: pass
    human_judgment: false
  - id: D3
    description: "All 9 list tabs (LikedSongsTab and RecentTab via TrackRowItem, plus PlaylistsTab, AlbumsTab, ArtistsTab, PodcastsTab, SearchTab, QueueTab, and SoundtracksTab) tag list items and A-Z sorted containers."
    requirement: "CTRL-02"
    verification:
      - kind: unit
        ref: "src/components/tabs/QueueTab.test.tsx"
        status: pass
      - kind: other
        ref: "pnpm typecheck && pnpm test -- --run && py -m unittest discover -s tests -p 'test_*.py'"
        status: pass
    human_judgment: false

duration: 5min
completed: 2026-11-14
status: complete
---

# Phase 08 Plan 03: Controller L2/R2 Ergonomics & Trigger Navigation Summary

**`computeListJump` (±N items and A–Z anchors), `contentPaneRef` focus-guarded scroll+focus transfer, `onLoadMore` pagination, floating position pill, and list row tagging across all 9 library/list tabs**

## Performance

- **Duration:** 5 min
- **Started:** 2026-11-14T21:06:10Z
- **Completed:** 2026-11-14T21:11:09Z
- **Tasks:** 3
- **Files modified:** 13 (2 created, 11 modified)

## Accomplishments
- Implemented `computeListJump` in `src/utils/listNavigation.ts` with full unit test coverage in `src/utils/listNavigation.test.ts` for ±pageSize paging, A–Z anchor jumps with equal adjacent labels, short-list first/last jumps, empty/single-element safety, `[0, length - 1]` clamping, and `shouldLoadMore` detection.
- Extended `InteractiveRow` and `TrackRowItem` to expose `data-deckify-list-item="true"` and `data-deckify-label`, automatically covering `LikedSongsTab`, `RecentTab`, and all tracklists.
- Wired `contentPaneRef` in `DeckifyExpandedModal.tsx` to guard L2/R2 list jumps against Sidebar focus (`D-10`), scroll the target row into view (`scrollIntoView({ block: "nearest", behavior: "smooth" })`), transfer focus (`targetEl.focus()`), trigger `loadLikedTracks(true)` on `shouldLoadMore`, and show the floating position pill (`"16 / 25"`, `"B"`).
- Tagged list rows and A–Z sort containers across `PlaylistsTab`, `AlbumsTab`, `ArtistsTab` (`data-deckify-sorted="az"`), `PodcastsTab`, `SearchTab`, `QueueTab`, and `SoundtracksTab` (`data-deckify-sorted="az"`).

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement computeListJump, InteractiveRow/TrackRowItem tagging, and DeckifyExpandedModal content-focus list paging** - `715d2ac` (feat)
2. **Task 2: Tag library list rows and A-Z sort container in PlaylistsTab, AlbumsTab, ArtistsTab, and PodcastsTab** - `21ad768` (feat)
3. **Task 3: Tag list rows and A-Z sort container in SearchTab, QueueTab, and SoundtracksTab** - `ed3cb54` (feat)

## Files Created/Modified
- `src/utils/listNavigation.ts` - Pure `computeListJump` helper for ±N and A–Z anchor list navigation.
- `src/utils/listNavigation.test.ts` - Unit tests for all `computeListJump` behaviors and edge cases.
- `src/components/common/InteractiveRow.tsx` - Optional `data-deckify-list-item` and `data-deckify-label` props forwarded to `<Focusable>`.
- `src/components/common/TrackRowItem.tsx` - Tags every track row with `data-deckify-list-item="true"` and `data-deckify-label={track.name || ""}`.
- `src/components/DeckifyExpandedModal.tsx` - `contentPaneRef` focus guard, list fast-paging dispatch, `scrollIntoView` + `.focus()`, `loadLikedTracks(true)`, and floating pill display.
- `src/components/DeckifyExpandedModal.test.tsx` - Tests verifying Sidebar focus guard, `scrollIntoView` + `.focus()`, and floating position pill in ±N and A–Z modes.
- `src/components/tabs/PlaylistsTab.tsx` - Tagged folder, folder playlist, and uncategorized playlist rows.
- `src/components/tabs/AlbumsTab.tsx` - Tagged saved album rows.
- `src/components/tabs/ArtistsTab.tsx` - Tagged artist list container (`data-deckify-sorted="az"`), artist rows, and artist album rows.
- `src/components/tabs/PodcastsTab.tsx` - Tagged followed show and saved episode rows.
- `src/components/tabs/SearchTab.tsx` - Tagged playlist, artist, and album search result rows.
- `src/components/tabs/QueueTab.tsx` - Tagged queue track rows.
- `src/components/tabs/SoundtracksTab.tsx` - Tagged games list container (`data-deckify-sorted="az"`) and game header rows.

## Decisions Made
- Computed list jumps directly from DOM-queried `[data-deckify-list-item="true"]` elements inside `contentPaneRef` so all 9 list tabs share a single uniform scroll+focus mechanism without per-tab imperative ref plumbing.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 08 (`08-01`, `08-02`, `08-03`) is complete with `CTRL-01` and `CTRL-02` implemented and verified (`pnpm typecheck`, 105 Vitest tests, 432 Python unittest tests passing). Ready for `/gsd-verify-work 08`.

## Self-Check: PASSED
- `src/utils/listNavigation.ts`: FOUND
- `src/utils/listNavigation.test.ts`: FOUND
- `src/components/common/InteractiveRow.tsx`: FOUND
- `src/components/common/TrackRowItem.tsx`: FOUND
- `src/components/DeckifyExpandedModal.tsx`: FOUND
- `src/components/DeckifyExpandedModal.test.tsx`: FOUND
- `src/components/tabs/PlaylistsTab.tsx`: FOUND
- `src/components/tabs/AlbumsTab.tsx`: FOUND
- `src/components/tabs/ArtistsTab.tsx`: FOUND
- `src/components/tabs/PodcastsTab.tsx`: FOUND
- `src/components/tabs/SearchTab.tsx`: FOUND
- `src/components/tabs/QueueTab.tsx`: FOUND
- `src/components/tabs/SoundtracksTab.tsx`: FOUND
- Commit `715d2ac`: FOUND
- Commit `21ad768`: FOUND
- Commit `ed3cb54`: FOUND

---
*Phase: 08-controller-l2-r2-ergonomics-trigger-navigation*
*Completed: 2026-11-14*
