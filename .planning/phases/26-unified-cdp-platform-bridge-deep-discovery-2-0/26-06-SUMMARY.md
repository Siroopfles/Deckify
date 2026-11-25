---
phase: 26-unified-cdp-platform-bridge-deep-discovery-2-0
plan: 06
subsystem: ui
tags: [react, search, pagination, controller-navigation, gap-closure]
requires:
  - phase: 26-unified-cdp-platform-bridge-deep-discovery-2-0
    provides: SearchTab 2.0 idle screen, 7 filter chips, and search_spotify RPC
provides:
  - Per-section Load More paging in SearchTab with singular entity-type queries
  - data-testid forwarding in InteractiveRow
affects: [search, modal-navigation]
tech-stack:
  added: []
  patterns: [Per-section offset/hasMore state keyed by SearchSectionKey, static SECTION_CONFIG whitelist]
key-files:
  created: []
  modified:
    - src/components/tabs/SearchTab.tsx
    - src/components/tabs/SearchTab.test.tsx
    - src/components/common/InteractiveRow.tsx
key-decisions:
  - "Mapped SearchSectionKey through a static SECTION_CONFIG whitelist to singular Spotify entity types (track, playlist, artist, album, show, episode) and placed each Load More row inside its section's column Focusable so D-pad focus stays within the expanded section."
  - "Added data-testid prop forwarding to InteractiveRow so per-section Load More rows (search-load-more-{section}) are directly targetable by tests and automation."
patterns-established:
  - "Per-section paging state (sectionOffsets, sectionHasMore, loadingSection) with monotonic searchEpochRef cancellation on query reset."
requirements-completed: [SEARCH-02]
duration: 4min
completed: 2026-11-25
status: complete
commits: 1
plan_head_before: ec7c799470459f601603a7fb9a35f1a7fb6cf198
plan_head_after: c4abddc
---

# Phase 26 Plan 06: Per-Section SearchTab Load More Paging Summary

**Replaced the global "Load More Results" button and shared `searchOffset` in `SearchTab` with per-section offset/`hasMore` state and singular-type `search_spotify` paging (`G-26-2`).**

## Performance

- **Duration:** 4 min
- **Started:** 2026-11-25T17:11:04Z
- **Completed:** 2026-11-25T17:15:08Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments

- Replaced `searchOffset` / `handleLoadMore` in `useSearchController` with per-section `sectionOffsets`, `sectionHasMore`, `loadingSection`, and `handleLoadMoreSection(section)`, guarded by `searchEpochRef` to ignore stale in-flight responses after a query change.
- Defined `SECTION_CONFIG` mapping each `Exclude<SearchFilterTab, "all">` key to its singular Spotify `apiType`, `resultKey`, and `"Load More {Category}"` label.
- Removed the global `"Load More Results"` row from `SearchResultsView` and rendered `<InteractiveRow data-testid="search-load-more-{section}">` at the end of each section's `<Focusable flow-children="column">`.
- Updated `SearchTab.test.tsx` with 4 unit tests covering per-section Load More visibility, singular-type `search_spotify` calls with isolated merging, exhausted-section hiding, and new-query paging reset.

## Task Commits

Each task was committed atomically:

1. **Task 1: Per-section SearchTab Load More state, singular-type RPC paging, and tests** - `c4abddc` (feat)

## Files Created/Modified

- `src/components/tabs/SearchTab.tsx` - Added `SECTION_CONFIG`, `renderSectionLoadMore`, per-section `sectionOffsets`/`sectionHasMore`/`loadingSection` state, and `handleLoadMoreSection`.
- `src/components/tabs/SearchTab.test.tsx` - Replaced global Load More test with 4 per-section paging tests for `G-26-2`.
- `src/components/common/InteractiveRow.tsx` - Added `"data-testid"` prop forwarding to `<Focusable>`.

## Decisions Made

- Mapped section keys through a static `SECTION_CONFIG` whitelist to singular Spotify entity types (`track`, `playlist`, `artist`, `album`, `show`, `episode`) per threat `T-26-09`.
- Forwarded `data-testid` in `InteractiveRow` so `<InteractiveRow data-testid={\`search-load-more-${section}\`}>` renders the attribute onto `<Focusable>`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Forwarded `data-testid` prop in `InteractiveRow.tsx`**
- **Found during:** Task 1 (Per-section SearchTab Load More state, singular-type RPC paging, and tests)
- **Issue:** `InteractiveRowProps` did not declare or forward `data-testid` to `<Focusable>`, which would fail TypeScript checking and omit `data-testid="search-load-more-${section}"` from the rendered DOM/VNode.
- **Fix:** Added `"data-testid"?: string` to `InteractiveRowProps` and passed `data-testid={dataTestId}` to `<Focusable>` in `src/components/common/InteractiveRow.tsx`.
- **Files modified:** `src/components/common/InteractiveRow.tsx`
- **Verification:** `pnpm test -- --run src/components/tabs/SearchTab.test.tsx src/components/DeckifyExpandedModal.test.tsx` (44 passed), `pnpm run build`, `pnpm run lint`, and pre-commit `tsc --noEmit` + full `vitest run` (347 passed).
- **Committed in:** `c4abddc`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for `InteractiveRow` to accept and render `data-testid` as specified in Task 1. No scope creep.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Gap `G-26-2` is closed; `SearchTab` pages each category independently without expanding unrelated sections.
- Ready for remaining Phase 26 gap-closure plans (`26-05`, `26-07`).

## Self-Check: PASSED

- FOUND: `src/components/tabs/SearchTab.tsx`
- FOUND: `src/components/tabs/SearchTab.test.tsx`
- FOUND: `src/components/common/InteractiveRow.tsx`
- FOUND: `c4abddc` (ancestor of `HEAD`)
