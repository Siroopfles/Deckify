---
phase: 23-lyrics-2-0-offline-lrc-cache-per-track-sync-nudge-cjk-romani
plan: 05
subsystem: ui
tags: [react, typescript, decky-ui, lyrics, gamepad-navigation, vitest]
status: complete

requires:
  - phase: 23-04
    provides: Lyrics mode X/Y quick nudge shortcuts in DeckifyExpandedModal onAction
provides:
  - Dedicated mode === 'lyrics' controller-hint-bar label ('L2/R2 Seek · X -0.5s · Y +0.5s · L1/R1 Tabs')
  - Removal of unreachable modeRef.current === 'lyrics' dead code in onAction isActiveTrackMode
  - Regression assertion for lyrics mode controller-hint-bar in DeckifyExpandedModal.test.tsx
affects: [lyrics, gamepad-navigation]

actuals:
  tokens: 250
  tasks: 1
  commits: 1
  plan_head_before: f992b518482a661ba4a1108f171e3ee018f83d33
  plan_head_after: 20bdb5b898a4037d6fcd115cd4a51ab31d9c8904

tech-stack:
  added: []
  patterns:
    - "Explicit per-mode hintText branch for lyrics mode aligned with onAction X/Y sync nudge interception"

key-files:
  created: []
  modified:
    - src/components/DeckifyExpandedModal.tsx
    - src/components/DeckifyExpandedModal.test.tsx

key-decisions:
  - "Split hintText mode === 'now_playing' and mode === 'lyrics' branches so the bottom controller-hint-bar accurately displays X -0.5s · Y +0.5s in Lyrics mode"

patterns-established:
  - "Controller hint bar labels must match onAction mode-specific button interceptions"

requirements-completed: [LYRICS-01]

coverage:
  - id: D1
    description: "Dedicated lyrics mode controller-hint-bar label ('L2/R2 Seek · X -0.5s · Y +0.5s · L1/R1 Tabs') and dead-code removal in onAction isActiveTrackMode"
    requirement: "LYRICS-01"
    verification:
      - kind: unit
        ref: "src/components/DeckifyExpandedModal.test.tsx#renders context-aware controller hint bar per tab and hides when show_controller_hints is false"

duration: 2min
completed: 2026-11-22
---

# Phase 23 Plan 05: Lyrics Controller Hint Bar Alignment Summary

**Aligned the `DeckifyExpandedModal` bottom `controller-hint-bar` in Lyrics mode with `X -0.5s · Y +0.5s` sync nudge shortcuts and removed unreachable `lyrics` dead code from `onAction`**

## Performance

- **Duration:** 2 min
- **Started:** 2026-11-22T18:50:01Z
- **Completed:** 2026-11-22T18:51:44Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

- Split `hintText` in `src/components/DeckifyExpandedModal.tsx` so `mode === "lyrics"` renders `"L2/R2 Seek · X -0.5s · Y +0.5s · L1/R1 Tabs"` while `mode === "now_playing"` keeps `"L2/R2 Seek · X Like · Y Options · L1/R1 Tabs"`.
- Removed unreachable `|| modeRef.current === "lyrics"` checks from `isActiveTrackMode` in the fallback `X` and `Y` branches of `onAction` (already intercepted earlier at `modeRef.current === "lyrics" && (action === "X" || action === "Y")`).
- Added a `lyrics` mode assertion to `"renders context-aware controller hint bar per tab and hides when show_controller_hints is false"` in `src/components/DeckifyExpandedModal.test.tsx` (verified RED before fix, GREEN after).

## Task Commits

1. **Task 1: Give Lyrics mode its own controller-hint-bar text, remove dead isActiveTrackMode checks, and add unit test assertion** - `20bdb5b` (fix)

## Files Created/Modified

- `src/components/DeckifyExpandedModal.tsx` - Added dedicated `mode === "lyrics"` `hintText` branch and cleaned up `isActiveTrackMode` in `onAction`.
- `src/components/DeckifyExpandedModal.test.tsx` - Added `lyrics` mode assertion for `[data-testid="controller-hint-bar"]`.

## Decisions Made

None - plan executed as written.

## Deviations from Plan

### Verification Notes

- `pnpm exec eslint --max-warnings=0 src/components/DeckifyExpandedModal.tsx src/components/DeckifyExpandedModal.test.tsx` exits non-zero due to 100 pre-existing ESLint warnings (`@typescript-eslint/no-explicit-any`, `max-lines-per-function`, `complexity`, `react-hooks/exhaustive-deps`) in `DeckifyExpandedModal.tsx` and `DeckifyExpandedModal.test.tsx`, with 0 errors and 0 new warnings introduced by this change. Husky pre-commit `eslint` (default warning threshold) passed cleanly.

## Issues Encountered

None.

## Self-Check: PASSED

- `src/components/DeckifyExpandedModal.tsx` verified present and modified.
- `src/components/DeckifyExpandedModal.test.tsx` verified present and modified.
- Commit `20bdb5b898a4037d6fcd115cd4a51ab31d9c8904` verified in git history (`main`).
- `pnpm test -- --run` passed (24 test files, 295 tests).
- `pnpm typecheck` passed (0 errors).
- `pnpm build` passed via pre-commit hook (`dist/` built).
