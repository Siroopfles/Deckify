---
phase: 27-interactive-queue-studio-controller-playlist-management
plan: 10
subsystem: ui
tags: [react, controller-navigation, grab-move, focus-lock, queue, track-row]
dependency-graph:
  requires:
    - phase: 27-03
      provides: useGrabMoveOrder hook and InteractiveRow data-row-key forwarding
  provides:
    - Focus-locked Grab/Move Mode in InteractiveRow, TrackRowItem, QueueTab, and useGrabMoveOrder
    - preGrabSnapshot forwarding in useGrabMoveOrder onCommit
    - suppressFocusHalo prop on InteractiveRow
  affects:
    - 27-11 (Playlist Grab/Move & CRUD integration)
tech-stack:
  added: []
  patterns:
    - suppressFocusHalo gating on non-grabbed InteractiveRow items during active grab
    - Synchronous + rAF FocusNavController row focus locking in useGrabMoveOrder
    - Inline Focusable button suppression during active grab so spatial navigation stays at row level
key-files:
  created: []
  modified:
    - src/types.ts
    - src/hooks/useGrabMoveOrder.ts
    - src/components/common/InteractiveRow.tsx
    - src/components/common/InteractiveRow.test.tsx
    - src/components/common/TrackRowItem.tsx
    - src/components/tabs/QueueTab.tsx
    - src/components/tabs/QueueTab.test.tsx
decisions:
  - "Combined Task 1 and Task 2 into a single atomic commit (149a739) because Husky lint-staged runs the full Vitest suite and QueueTab.test.tsx line 436 required updating for synchronous + rAF scheduleRowFocus."
  - "Extracted renderQueueInlineControls helper in QueueTab.tsx to keep renderQueueRow complexity below ESLint's threshold of 15."
metrics:
  duration: 4m
  completed: 2026-11-26
status: complete
commits: 1
plan_head_before: 440114d11c0396046a17faa190a61c18ecaaf2b9
plan_head_after: 149a739746037b29601a1b0b199806bc8a2ff908
actuals:
  tokens: 2000
  tasks: 2
  commits: 1
---

# Phase 27 Plan 10: Grab/Move Focus Lock & A-Button Drop Summary

Eliminated dual green+white selection and accidental A-button playback during Grab/Move Mode by suppressing `focusHalo` on non-grabbed rows, removing nested `<InteractiveRow>` inline buttons while dragging, and routing any row activation during active grab to `commitGrab` with `preGrabSnapshot` forwarding.

## Tasks Completed

1. **Task 1: Upgrade InteractiveRow, useGrabMoveOrder, and TrackItem types for focus lock and pre-grab snapshot**
   - Added `added_at?: string;` to `TrackItem` in `src/types.ts`.
   - Added `suppressFocusHalo?: boolean;` to `InteractiveRow` in `src/components/common/InteractiveRow.tsx`, computing `showFocus = focused && !suppressFocusHalo` for `data-deckify-focused`, background highlight, and `focusHalo(showFocus)`.
   - Updated `UseGrabMoveOrderOptions.onCommit` in `src/hooks/useGrabMoveOrder.ts` to receive `preGrabSnapshotRef.current` as its 4th argument and enhanced `scheduleRowFocus` to apply focus + `scrollIntoView({ block: "nearest" })` + `FocusNavController.GetActiveNavTree().SetActiveNode` synchronously and on `requestAnimationFrame`.
2. **Task 2: Lock Grab/Move focus & A-button drop in TrackRowItem and QueueTab**
   - Added `hasActiveGrab` and `onCommitGrab` to `TrackRowItem` (`src/components/common/TrackRowItem.tsx`), passing `suppressFocusHalo={Boolean(hasActiveGrab && !isGrabbed)}`, gating `onClick` to commit grab instead of playing, and replacing nested `<InteractiveRow>` buttons with a non-focusable indicator on the grabbed row while dragging.
   - Added `grabCommitRef`, `hasActiveGrab`, `onCommitGrab`, and `suppressFocusHalo` gating to `QueueTab` (`src/components/tabs/QueueTab.tsx`), hiding nested `Reorder track` / `Remove track` `<InteractiveRow>` buttons during active grab via `renderQueueInlineControls`.
   - Added unit tests in `src/components/common/InteractiveRow.test.tsx` and `src/components/tabs/QueueTab.test.tsx`.

## Verification

- `pnpm typecheck`: passed (0 errors)
- `pnpm exec eslint` on all 7 modified files: passed (0 errors)
- `pnpm test` (full Vitest suite via Husky pre-commit): 30 test files passed, 388 tests passed
- `pnpm build` (`rollup -c` via Husky pre-commit): succeeded (`dist/` built)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated `QueueTab.test.tsx` focus assertion and `Fragment` mock**
- **Found during:** Task 1 & Task 2 verification
- **Issue:** `QueueTab.test.tsx` previously asserted `expect(focusMock).toHaveBeenCalledTimes(1)` which failed once `scheduleRowFocus` invoked focus both synchronously and in `requestAnimationFrame`; `QueueTab.test.tsx` also lacked `Fragment` in its `react/jsx-runtime` mocks when testing `TrackRowItem`.
- **Fix:** Updated the assertion to `expect(focusMock).toHaveBeenCalled()` and added `Fragment: "Fragment"` to the JSX runtime mocks.
- **Files modified:** `src/components/tabs/QueueTab.test.tsx`
- **Commit:** `149a739`

## Known Stubs

None.

## Self-Check: PASSED

- All 7 modified files exist and were verified in commit `149a739`.
- `git merge-base --is-ancestor 149a739 HEAD` verified.
- Full `tsc --noEmit`, `eslint`, `vitest run` (388/388), and `rollup -c` passed.
