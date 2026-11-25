---
phase: 27-interactive-queue-studio-controller-playlist-management
plan: 03
subsystem: ui
tags: [react, typescript, gamepad, queue, vitest, decky-ui]

requires:
  - phase: 27-interactive-queue-studio-controller-playlist-management
    provides: Backend queue mutation RPCs and playlist editability metadata (27-01)
provides:
  - Extended TrackItem (_rowKey, uid) and PlaylistItem (description, is_editable, collaborative) types
  - Reusable useGrabMoveOrder hook and assignStableRowKeys helper
  - TrackRowItem and InteractiveRow support for data-row-key, isGrabbed highlight, and inline reorder/remove controls
  - QueueTab Grab/Move Mode, inline remove, and 2-tap Clear Queue confirmation
affects: [27-04, 27-05, DeckifyExpandedModal, PlaylistsTab]

actuals:
  tokens: 8441
  tasks: 3
  commits: 3

commits: 3
plan_head_before: c99bc2918695901e0afc70ec1bda306951ab972b
plan_head_after: 8d336885a2d7645286dcb41f87275cbaff95bf44

tech-stack:
  added: []
  patterns:
    - "Stable _rowKey identity (uid: or prefix:seq:uri) for duplicate-safe controller Grab/Move reordering"
    - "Ref-backed Grab/Move state in useGrabMoveOrder preventing stale closures in GamepadUI direction/cancel handlers"
    - "2-tap inline confirmation ('Clear Queue' -> 'Confirm Clear?' / 'Cancel') for destructive queue actions"

key-files:
  created:
    - src/hooks/useGrabMoveOrder.ts
  modified:
    - src/types.ts
    - src/components/common/InteractiveRow.tsx
    - src/components/common/TrackRowItem.tsx
    - src/components/tabs/QueueTab.tsx
    - src/components/tabs/QueueTab.test.tsx

key-decisions:
  - "Forwarded data-row-key through InteractiveRowProps so Focusable DOM nodes expose [data-row-key] for focus lock and scrollIntoView"
  - "Gated inline reorder/remove/Clear Queue InteractiveRows on callback presence and preserved rawTrack identity on play click for backward compatibility with existing QueueTab tests"
  - "Avoided React.Fragment in QueueTab row actions to keep shallow JSX test trees flat and compatible with QueueTab.test.tsx jsx-dev-runtime mocks"

patterns-established:
  - "useGrabMoveOrder: shared controller reorder state machine for QueueTab and PlaylistsTab"

requirements-completed: [QUEUE-03, PL-01]

coverage:
  - id: D1
    description: "Extended TrackItem (_rowKey, uid) and PlaylistItem (description, is_editable, collaborative) in src/types.ts"
    requirement: "PL-01"
    verification:
      - kind: unit
        ref: "pnpm run typecheck && pnpm exec eslint --max-warnings 0 src/types.ts src/hooks/useGrabMoveOrder.ts src/components/common/TrackRowItem.tsx"
        status: pass
    human_judgment: false
  - id: D2
    description: "Created useGrabMoveOrder hook with assignStableRowKeys, DIR_UP/DIR_DOWN swapping, commitGrab, and cancelGrab snapshot restoration"
    requirement: "QUEUE-03"
    verification:
      - kind: unit
        ref: "src/components/tabs/QueueTab.test.tsx#handles Grab/Move Mode highlight and DIR_UP/DIR_DOWN direction interception"
        status: pass
    human_judgment: false
  - id: D3
    description: "Upgraded QueueTab with Grab/Move Mode, inline reorder/remove buttons, and 2-tap Clear Queue confirmation"
    requirement: "QUEUE-03"
    verification:
      - kind: unit
        ref: "pnpm test -- --run src/components/tabs/QueueTab.test.tsx"
        status: pass
    human_judgment: false

duration: 8 min
completed: 2026-11-25
status: complete
---

# Phase 27 Plan 03: Shared Grab/Move Foundation & Interactive QueueTab Summary

**Controller Grab/Move reordering hook (`useGrabMoveOrder`), stable `_rowKey` track identity, inline `⇅`/`✕` row controls, and 2-tap `"Clear Queue"` confirmation in `QueueTab`**

## Performance

- **Duration:** 8 min
- **Started:** 2026-11-25T19:39:02Z
- **Completed:** 2026-11-25T19:46:35Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- Extended `TrackItem` (`_rowKey`, `uid`) and `PlaylistItem` (`description`, `is_editable`, `collaborative`) in `src/types.ts`, and added `data-row-key` pass-through in `src/components/common/InteractiveRow.tsx`.
- Created `src/hooks/useGrabMoveOrder.ts` with `assignStableRowKeys` and `useGrabMoveOrder` supporting ref-safe Grab/Move Mode, `DIR_UP`/`DIR_DOWN` live swapping clamped to list bounds, `scrollIntoView({ block: "nearest" })`, batched commit with rollback on failure, and `B` (`cancelGrab`) snapshot restoration.
- Updated `src/components/common/TrackRowItem.tsx` and `src/components/tabs/QueueTab.tsx` with `_rowKey` / `data-row-key` identity, grabbed accent highlight, compact inline `⇅`/`✕` buttons (`width: "auto"`, `flexShrink: 0`, `minHeight: 36`), and 2-tap `"Clear Queue"` -> `"Confirm Clear?"` / `"Cancel"` confirmation.
- Extended `src/components/tabs/QueueTab.test.tsx` (11/11 passing; full suite 351/351 passing).

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend src/types.ts, create src/hooks/useGrabMoveOrder.ts, and update TrackRowItem.tsx** - `f53e120` (feat)
2. **Task 2: Upgrade QueueTab.tsx with Grab/Move Mode, inline remove, and 2-tap Clear Queue** - `6451c12` (feat)
3. **Task 3: Extend QueueTab.test.tsx for Grab/Move Mode, inline remove, and 2-tap Clear Queue** - `8d33688` (test)

## Files Created/Modified
- `src/types.ts` - Added `_rowKey`, `uid` on `TrackItem` and `description`, `is_editable`, `collaborative` on `PlaylistItem`.
- `src/components/common/InteractiveRow.tsx` - Added `data-row-key` prop forwarding to `<Focusable>`.
- `src/hooks/useGrabMoveOrder.ts` - Created `assignStableRowKeys` and `useGrabMoveOrder`.
- `src/components/common/TrackRowItem.tsx` - Added `data-row-key`, `isGrabbed` highlight, and inline `⇅`/`✕` controls.
- `src/components/tabs/QueueTab.tsx` - Wired `useGrabMoveOrder`, `onGamepadDirection`, inline `⇅`/`✕` actions, and 2-tap `"Clear Queue"` header flow.
- `src/components/tabs/QueueTab.test.tsx` - Added unit tests for duplicate `_rowKey` uniqueness, inline remove, 2-tap Clear Queue, and Grab/Move `DIR_UP` interception.

## Decisions Made
- Forwarded `data-row-key` explicitly in `InteractiveRow.tsx` so `<InteractiveRow>` passes it to `<Focusable>` for DOM focus lock and `scrollIntoView`.
- Gated inline `⇅`/`✕`/`Clear Queue` `InteractiveRow` buttons on callback presence and passed `rawTrack` on row play click so existing `QueueTab.test.tsx` assertions remain intact.
- Kept `renderQueueRow` children flat (no `React.Fragment`) so shallow JSX test walkers in `QueueTab.test.tsx` traverse every child element directly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `data-row-key` prop pass-through to `InteractiveRow.tsx`**
- **Found during:** Task 1 (`TrackRowItem.tsx` update)
- **Issue:** `InteractiveRow` explicitly destructures its allowed `data-*` props instead of spreading `...rest`, so `data-row-key` would be dropped before reaching `<Focusable>`.
- **Fix:** Added `"data-row-key"?: string` to `InteractiveRowProps` and forwarded `data-row-key={dataRowKey}` to `<Focusable>`.
- **Files modified:** `src/components/common/InteractiveRow.tsx`
- **Verification:** `pnpm run typecheck` and `QueueTab.test.tsx` `data-row-key` assertions pass.
- **Committed in:** `f53e120` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minimal 2-line addition in `InteractiveRow.tsx` required for `TrackRowItem` and `QueueTab` `data-row-key` DOM attributes. No scope creep.

## Issues Encountered
- Initial Task 2 pre-commit hook failed in `QueueTab.test.tsx` because `renderQueueRowActions` used `<>...</>` (`Fragment`) which was not defined on the test file's `react/jsx-dev-runtime` mock. Replaced with flat child helpers in `QueueTab.tsx` before committing `6451c12`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Shared `useGrabMoveOrder` hook, `assignStableRowKeys`, `TrackRowItem`, and `QueueTab` are ready for `DeckifyExpandedModal` wiring (Plan 27-05) and `PlaylistsTab` controller management (Plan 27-04).

---
*Phase: 27-interactive-queue-studio-controller-playlist-management*
*Completed: 2026-11-25*

## Self-Check: PASSED
