---
phase: 26-unified-cdp-platform-bridge-deep-discovery-2-0
plan: 15
subsystem: ui
tags: [react, search, vitest, cdp-browse, epoch-race]

requires:
  - phase: 26-unified-cdp-platform-bridge-deep-discovery-2-0
    provides: SearchTab 2.0 Gaming & Mood tiles, Recent Searches pills, and optional CDP Browse Categories section
provides:
  - Fixed skipNextDebounceRef ordering in useSearchController so tile and history selections preserve runSearch epoch
  - Non-latching empty/error browse categories retry in SearchTab when returning to idle
  - Vitest regression tests covering G-26-13 and G-26-14
affects: [phase-26-uat, search-tab]

actuals:
  tokens: 6708
  tasks: 2
  commits: 2

plan_head_before: f99c6a37561a7845adb4b5e12dfe1d180ceba5d0
plan_head_after: 963997e46a46592bd6f9402588b285de2c346f00
commits: 2

tech-stack:
  added: []
  patterns:
    - "Check skipNextDebounceRef before resetPaging() in searchQuery effect so programmatic runSearch epochs survive React state commits"
    - "Reset fetchedBrowseRef.current on empty/error/unpopulated cleanup so transient CDP warm-up empties retry on idle return"

key-files:
  created: []
  modified:
    - src/components/tabs/SearchTab.tsx
    - src/components/tabs/SearchTab.test.tsx

key-decisions:
  - "Extracted useSearchDebounceEffect, useSearchPaging, useRunSearchCallback, useBrowseCategories, renderSearchFilterBar, buildSearchHandlers, and renderIdleSearchView in SearchTab.tsx while keeping hook slot order intact for zero-warning ESLint compliance"
  - "Left 2 pre-existing max-lines-per-function warnings in SearchTab.test.tsx (lines 263 and 358) untouched per scope boundary while keeping new regression tests under 80 lines"

patterns-established:
  - "Persistent-ref simulation (withPersistentRefs) in SearchTab.test.tsx for testing async epoch races across React re-renders"

requirements-completed: [DISC-04]

coverage:
  - id: D1
    description: "Preserve active searchEpochRef when selecting Gaming & Mood tiles or Recent Searches history pills in SearchTab"
    requirement: "DISC-04"
    verification:
      - kind: unit
        ref: "src/components/tabs/SearchTab.test.tsx#preserves searchEpochRef across re-render on tile selection with deferred search_spotify (G-26-13)"
        status: pass
      - kind: unit
        ref: "src/components/tabs/SearchTab.test.tsx#preserves searchEpochRef across re-render on history pill selection with deferred search_spotify (G-26-13)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Retry get_search_browse_categories on return to idle when an earlier fetch returned empty or failed"
    requirement: "DISC-04"
    verification:
      - kind: unit
        ref: "src/components/tabs/SearchTab.test.tsx#retries get_search_browse_categories on return to idle after an empty response (G-26-14)"
        status: pass
    human_judgment: false

duration: 5min
completed: 2026-11-26
status: complete
---

# Phase 26 Plan 15: SearchTab Tile Epoch Race & Browse Categories Retry Summary

**Fixed the `useSearchController` `searchEpochRef` invalidation race on Gaming & Mood tile and history pill clicks (G-26-13) and made `SearchTab` retry empty `get_search_browse_categories` responses on return to idle (G-26-14)**

## Performance

- **Duration:** 5 min
- **Started:** 2026-11-26T19:46:36Z
- **Completed:** 2026-11-26T19:51:32Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Fixed `useSearchDebounceEffect` in `src/components/tabs/SearchTab.tsx` to check `!searchQuery.trim()` and `skipNextDebounceRef.current === searchQuery` before calling `resetPaging()`, preserving the in-flight `runSearch` epoch when clicking any of the 12 Gaming & Mood tiles or Recent Searches pills.
- Updated `useBrowseCategories` in `src/components/tabs/SearchTab.tsx` so `fetchedBrowseRef.current` only latches `true` when `res?.ok && Array.isArray(res.categories) && res.categories.length > 0`, resetting to `false` on empty/error responses or unpopulated cleanup so returning to idle retries.
- Added 3 Vitest regression tests in `src/components/tabs/SearchTab.test.tsx` using persistent refs and deferred `search_spotify` promises (16/16 tests passing; full suite 396/396 passing).

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix useSearchController epoch race on tile/history selection and browse categories retry (G-26-13, G-26-14)** - `79e2185` (fix)
2. **Task 2: Add SearchTab regression tests for tile/history epoch preservation and browse retry** - `963997e` (test)

## Files Created/Modified
- `src/components/tabs/SearchTab.tsx` - Fixed `skipNextDebounceRef` ordering before `resetPaging()`, reset `fetchedBrowseRef.current` on empty/error/unpopulated browse category responses, and extracted helper functions for zero-warning ESLint compliance.
- `src/components/tabs/SearchTab.test.tsx` - Added `withPersistentRefs` helper and 3 regression tests for G-26-13 (tile + history pill epoch preservation) and G-26-14 (browse categories retry on idle return).

## Decisions Made
- Extracted `useSearchDebounceEffect`, `useSearchPaging`, `useRunSearchCallback`, `useBrowseCategories`, `renderSearchFilterBar`, `buildSearchHandlers`, and `renderIdleSearchView` in `src/components/tabs/SearchTab.tsx` without altering hook call order so `pnpm exec eslint --max-warnings=0 src/components/tabs/SearchTab.tsx` passes cleanly.
- Left 2 pre-existing `max-lines-per-function` warnings in `src/components/tabs/SearchTab.test.tsx` (lines 263 and 358) untouched per scope boundary while keeping all newly added tests under 80 lines.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extracted helper functions in SearchTab.tsx for zero-warning ESLint gate**
- **Found during:** Task 1 (`pnpm exec eslint --max-warnings=0 src/components/tabs/SearchTab.tsx`)
- **Issue:** Pre-existing functions `SearchResultsView`, `useSearchController`, and `SearchTab` exceeded the 80-line `max-lines-per-function` rule, causing `eslint --max-warnings=0` to fail.
- **Fix:** Extracted cohesive sub-hooks and render helpers (`renderSearchFilterBar`, `useSearchDebounceEffect`, `useSearchPaging`, `useRunSearchCallback`, `useBrowseCategories`, `buildSearchHandlers`, `renderIdleSearchView`) while preserving exact React hook slot ordering.
- **Files modified:** `src/components/tabs/SearchTab.tsx`
- **Verification:** `pnpm typecheck` and `pnpm exec eslint --max-warnings=0 src/components/tabs/SearchTab.tsx` both exited 0.
- **Committed in:** `79e2185` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to pass the Task 1 `--max-warnings=0` verification gate; no scope creep.

## Issues Encountered
- `src/components/tabs/SearchTab.test.tsx` contains 2 pre-existing `max-lines-per-function` warnings in existing `describe`/`it` blocks (lines 263 and 358). All newly added tests in Task 2 were kept under 80 lines with zero new warnings, and the full Vitest suite (30 files, 396 tests), `pnpm typecheck`, and `pnpm run build` all pass.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Frontend G-26-13 and G-26-14 fixes are complete and covered by regression tests; ready for remaining Phase 26 gap-closure plans (26-16, 26-17).

## Self-Check: PASSED
- `src/components/tabs/SearchTab.tsx`: FOUND
- `src/components/tabs/SearchTab.test.tsx`: FOUND
- `79e2185`: FOUND
- `963997e`: FOUND

---
*Phase: 26-unified-cdp-platform-bridge-deep-discovery-2-0*
*Completed: 2026-11-26*
