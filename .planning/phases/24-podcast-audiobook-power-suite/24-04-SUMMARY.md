---
phase: 24-podcast-audiobook-power-suite
plan: 04
subsystem: ui
tags: [react, decky-ui, podcasts, episodes, filtering, progress-bar, vitest]

# Dependency graph
requires:
  - phase: 24-01
    provides: EpisodeItem resume_position_ms / fully_played fields and ShowItem type
  - phase: 24-02
    provides: filterEpisodes and formatRemainingTime utilities in src/utils/playback.ts
provides:
  - ShowEpisodesView with Back to Podcasts navigation, show header, and episode filtering
  - EpisodeFilterBar with horizontal Focusable All / Unplayed / In Progress DialogButtons
  - EpisodeRow with bottom-pinned 4px green progress bar and Played / remaining time badges
  - Wave 0 unit tests in src/components/tabs/PodcastsTab.test.tsx
affects:
  - 24-05 (DeckifyExpandedModal wiring for activeShow / showEpisodes / onOpenShow / onCloseShow)

# Actuals (#2632)
actuals:
  tokens: 6480
  tasks: 2
  commits: 1

commits: 1
plan_head_before: 99769878dcffd623267f3eff12ce43da47456725
plan_head_after: 04fdf273733a796259c9e00033b249109c4a288e

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Horizontal Focusable filter pill bar (flow-children='horizontal') with auto-width DialogButtons"
    - "Bottom-pinned 4px progress bar inside InteractiveRow with duration_ms > 0 division guard"

key-files:
  created:
    - src/components/tabs/PodcastsTab.test.tsx
  modified:
    - src/components/tabs/PodcastsTab.tsx

key-decisions:
  - "Extracted FollowedShowsSection, EpisodeFilterBar, EpisodeRow, and ShowEpisodesView in PodcastsTab.tsx to satisfy ESLint 80-line max-lines-per-function and zero-warning rules"
  - "Kept onOpenShow optional with fallback to onPlayTrack(s.uri) so existing callers remain backwards-compatible until 24-05 modal wiring"

patterns-established:
  - "EpisodeRow progress clamping: guard duration_ms > 0 and clamp percentage to [0, 100]"

requirements-completed:
  - POD-02

coverage:
  - id: D1
    description: "ShowEpisodesView with Back to Podcasts button, show header, and EpisodeFilterBar when activeShow is provided"
    requirement: POD-02
    verification:
      - kind: unit
        ref: "src/components/tabs/PodcastsTab.test.tsx#opens a show on click and renders ShowEpisodesView with Back to Podcasts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Horizontal Focusable EpisodeFilterBar (All, Unplayed, In Progress) and No Matching Episodes empty state"
    requirement: POD-02
    verification:
      - kind: unit
        ref: "src/components/tabs/PodcastsTab.test.tsx#filters episodes via Unplayed / In Progress pills and renders No Matching Episodes when empty"
        status: pass
    human_judgment: false
  - id: D3
    description: "EpisodeRow bottom 4px green progress bar and Played / remaining time badges"
    requirement: POD-02
    verification:
      - kind: unit
        ref: "src/components/tabs/PodcastsTab.test.tsx#renders Played badge + 100% bar, remaining time badge + partial bar, and omits bar/badge when unplayed"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-11-22
status: complete
---

# Phase 24 Plan 04: PodcastsTab Show Drill-Down, Progress Bars & Episode Filtering Summary

**Added `ShowEpisodesView`, horizontal `EpisodeFilterBar` (`All` / `Unplayed` / `In Progress`), and `EpisodeRow` bottom-pinned `4px` green progress bars with `"Played"` / `"{N}m left"` badges in `PodcastsTab.tsx`, backed by 4 passing Wave 0 unit tests.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-11-22T19:53:01Z
- **Completed:** 2026-11-22T19:56:59Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Extended `PodcastsTabProps` with optional `activeShow`, `showEpisodes`, `loadingShowEpisodes`, `onOpenShow`, and `onCloseShow` props while preserving `onPlayTrack` fallback.
- Implemented `EpisodeFilterBar` inside `<Focusable flow-children="horizontal">` with auto-width `DialogButton` pills (`All`, `Unplayed`, `In Progress`) and `"No Matching Episodes"` empty-filter handling in both `Saved Episodes` and `ShowEpisodesView`.
- Implemented `EpisodeRow` with `DeckifyImage` (`42x42`), `"Played"` / `formatRemainingTime(...)` badges, and a bottom-pinned `4px` green progress bar (`duration_ms > 0` guarded and clamped to `[0, 100]`).
- Added 4 Wave 0 unit tests in `src/components/tabs/PodcastsTab.test.tsx` covering layout, `flow-children="horizontal"`, show drill-down, progress bars/badges, and filter state transitions.

## Task Commits

Each task was committed atomically (combined into a single pre-commit-validated commit because `tsc --noEmit` in the pre-commit hook required `PodcastsTabProps` updates alongside `PodcastsTab.test.tsx`):

1. **Task 1 & Task 2: PodcastsTab POD-02 implementation + Wave 0 tests** - `04fdf27` (feat)

## Files Created/Modified
- `src/components/tabs/PodcastsTab.tsx` - Added `EpisodeFilterBar`, `EpisodeRow`, `ShowEpisodesView`, `FollowedShowsSection`, and `PodcastsTab` filtering/drill-down state.
- `src/components/tabs/PodcastsTab.test.tsx` - Added 4 Vitest unit tests verifying POD-02 behavior and horizontal focus layout.

## Decisions Made
- Extracted `FollowedShowsSection` alongside `EpisodeFilterBar`, `EpisodeRow`, and `ShowEpisodesView` in `PodcastsTab.tsx` to stay under ESLint's 80-line `max-lines-per-function` limit with zero warnings.
- Kept `onOpenShow` optional in `PodcastsTabProps` with `onPlayTrack(s.uri)` fallback so existing `DeckifyExpandedModal.tsx` usage compiles cleanly until Plan 24-05 wires show drill-down state.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Combined RED test and implementation into one commit for pre-commit `tsc --noEmit` gate**
- **Found during:** Task 2 (RED test commit attempt)
- **Issue:** The repository's Husky pre-commit hook runs `pnpm typecheck` (`tsc --noEmit`), which rejected committing `PodcastsTab.test.tsx` before `PodcastsTabProps` in `PodcastsTab.tsx` declared `onOpenShow` and `activeShow`.
- **Fix:** Verified all 4 tests failed on their planned assertions in Vitest first (RED), then implemented `PodcastsTab.tsx` (GREEN), verified `typecheck`, `eslint --max-warnings=0`, and all 319 Vitest tests passed, and committed both files together in `04fdf27`.
- **Files modified:** `src/components/tabs/PodcastsTab.tsx`, `src/components/tabs/PodcastsTab.test.tsx`
- **Verification:** `pnpm typecheck`, `pnpm exec eslint --max-warnings=0`, `pnpm test -- --run` (27 files, 319 tests passed), and `rollup -c` build all passed.
- **Committed in:** `04fdf27`

---

**Total deviations:** 1 auto-fixed (1 blocking pre-commit typecheck gate)
**Impact on plan:** None — all planned code, tests, and verifications completed cleanly.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `PodcastsTab.tsx` is ready for Plan `24-05` to wire `activeShow`, `showEpisodes`, `loadingShowEpisodes`, `onOpenShow`, and `onCloseShow` in `DeckifyExpandedModal.tsx`.

## Self-Check: PASSED
- `src/components/tabs/PodcastsTab.tsx`: FOUND
- `src/components/tabs/PodcastsTab.test.tsx`: FOUND
- Commit `04fdf27`: FOUND

---
*Phase: 24-podcast-audiobook-power-suite*
*Completed: 2026-11-22*
