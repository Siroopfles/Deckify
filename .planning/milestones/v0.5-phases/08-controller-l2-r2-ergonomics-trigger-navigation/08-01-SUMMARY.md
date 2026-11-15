---
phase: 08-controller-l2-r2-ergonomics-trigger-navigation
plan: 01
subsystem: ui
tags: [gamepad, triggers, controller-navigation, react, decky-ui, vitest]

# Dependency graph
requires: []
provides:
  - "Pure Schmidt hysteresis (0.75/0.25), 300ms debounce, and 500ms/300ms hold-to-repeat TriggerController state machine"
  - "Modal-scoped useTriggerNavigation hook wiring FocusNavController, navigator.getGamepads() rAF loop, and deduped vgp_onbuttondown/keydown fallbacks"
  - "Reliable Y (ActionMenu) and X (Like) controller actions across focused list rows, NowPlayingTab, and LyricsTab"
  - "Pinned Back to Steam (B) footer in Sidebar outside the scrollable tab list"
affects:
  - 08-02-PLAN
  - 08-03-PLAN

actuals:
  tokens: 10472
  tasks: 2
  commits: 2
commits: 2
plan_head_before: eb3331d829894c2cdcd77925c75597c3c6f4ad30
plan_head_after: 45b6070829f048e60bf14f25ae674a197ae0b913

tech-stack:
  added: []
  patterns:
    - "Schmidt hysteresis + software debounce + hold-to-repeat state machine for analog triggers"
    - "Modal-scoped gamepad hook with 80ms per-action dedup and strict unmount cleanup"
    - "Outer Focusable flow-children='column' with flex:1 minHeight:0 overflowY:auto inner tabs and flexShrink:0 pinned footer"

key-files:
  created:
    - src/utils/triggerController.ts
    - src/utils/triggerController.test.ts
    - src/hooks/useTriggerNavigation.ts
    - src/components/common/Sidebar.test.tsx
  modified:
    - src/components/DeckifyExpandedModal.tsx
    - src/components/DeckifyExpandedModal.test.tsx
    - src/components/common/Sidebar.tsx

key-decisions:
  - "useTriggerNavigation uses refs for enabled/suppressed/callbacks so FocusNavController subscriptions and the rAF loop are registered once on modal mount and torn down cleanly on unmount."
  - "ActionMenu (actionTrack), PlaylistPickerModal (showAddToPlaylistModal), and INPUT/TEXTAREA focus suppress L2/R2 trigger firing and reset TriggerController state."

patterns-established:
  - "Modal-scoped controller input: useTriggerNavigation isolates all gamepad listeners and rAF polling to DeckifyExpandedModal lifecycle."
  - "Pinned modal sidebar footer: Back to Steam (B) sits outside the scrollable tab wrapper inside the parent Focusable flow-children='column'."

requirements-completed: [CTRL-03]

coverage:
  - id: D1
    description: "TriggerController enforces Schmidt hysteresis (0.75 press / 0.25 release), 300ms debounce, and 500ms/300ms hold-to-repeat."
    requirement: "CTRL-03"
    verification:
      - kind: unit
        ref: "src/utils/triggerController.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "useTriggerNavigation scopes FocusNavController, navigator.getGamepads() rAF polling, and deduped vgp_onbuttondown/keydown fallbacks to modal mount/unmount with sub-modal and text-input suppression."
    requirement: "CTRL-03"
    verification:
      - kind: unit
        ref: "src/components/DeckifyExpandedModal.test.tsx"
        status: pass
    human_judgment: false
  - id: D3
    description: "Back to Steam (B) is pinned in a fixed Sidebar footer outside the scrollable tab list inside a parent Focusable flow-children='column'."
    requirement: "CTRL-03"
    verification:
      - kind: unit
        ref: "src/components/common/Sidebar.test.tsx"
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-11-14
status: complete
---

# Phase 08 Plan 01: Controller L2/R2 Ergonomics & Trigger Navigation Summary

**Modal-scoped `TriggerController` (0.75/0.25 Schmidt hysteresis, 300ms debounce, 500ms/300ms hold-to-repeat), `useTriggerNavigation` hook with deduped `FocusNavController` + `vgp_onbuttondown` Y/X/L2/R2 dispatch, and pinned `Back to Steam (B)` Sidebar footer**

## Performance

- **Duration:** 6 min
- **Started:** 2026-11-14T20:52:18Z
- **Completed:** 2026-11-14T20:57:47Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Built `TriggerController` (`src/utils/triggerController.ts`) with independent L2/R2 channels enforcing Schmidt hysteresis (`0.75` activate / `0.25` release), `300ms` software debounce, and `500ms` initial / `300ms` interval hold-to-repeat.
- Built `useTriggerNavigation` (`src/hooks/useTriggerNavigation.ts`) subscribing to `FocusNavController.m_rgGamepadInputSources[0]`, a guarded `navigator.getGamepads()` rAF polling loop, and `vgp_onbuttondown`/`keydown` fallbacks with `80ms` per-action deduplication and full unmount cleanup.
- Wired `useTriggerNavigation` into `DeckifyExpandedModal.tsx`, restoring reliable `Y` (ActionMenu) and `X` (Like) actions on focused rows as well as active tracks in `now_playing` and `lyrics` modes, with `L2`/`R2` suppression when `ActionMenu`, `PlaylistPickerModal`, or an `INPUT`/`TEXTAREA` has focus.
- Refactored `Sidebar.tsx` so the root `<Focusable flow-children="column">` wraps an `overflowY: "auto"` tab container and a `flexShrink: 0` pinned footer containing `Back to Steam (B)` (`minHeight: 44`).

## Task Commits

Each task was committed atomically:

1. **Task 1: Build TriggerController state machine, modal-scoped useTriggerNavigation hook, and reliable Y/X/L2/R2 modal dispatch** - `21dbc20` (feat)
2. **Task 2: Pin Back to Steam (B) footer in Sidebar outside scrollable tab list** - `45b6070` (feat)

## Files Created/Modified
- `src/utils/triggerController.ts` - Pure Schmidt hysteresis, debounce, and hold-to-repeat `TriggerController` state machine.
- `src/utils/triggerController.test.ts` - 7 unit tests covering thresholds, chatter rejection, release reset, debounce, repeat, channel independence, and `reset()`.
- `src/hooks/useTriggerNavigation.ts` - Modal-scoped gamepad/trigger/keyboard navigation hook with 80ms dedup and unmount cleanup.
- `src/components/DeckifyExpandedModal.tsx` - Replaced inline gamepad `useEffect` with `useTriggerNavigation`, supporting `Y`/`X` in `now_playing`/`lyrics` and sub-modal suppression.
- `src/components/DeckifyExpandedModal.test.tsx` - Added 4 tests covering `FocusNavController`, 80ms `vgp_onbuttondown` dedup, `INPUT`/sub-modal suppression, and unmount cleanup.
- `src/components/common/Sidebar.tsx` - Pinned `Back to Steam (B)` footer outside the scrollable navigation menu inside `<Focusable flow-children="column">`.
- `src/components/common/Sidebar.test.tsx` - 3 JSX tree-inspection tests verifying root `Focusable`, scrollable tab wrapper, and pinned footer `closeModal` invocation.

## Decisions Made
- Stored `enabled`, `suppressed`, `onTrigger`, and `onAction` in refs inside `useTriggerNavigation` so `FocusNavController` registrations and the `requestAnimationFrame` loop bind once on modal mount and tear down strictly on unmount without re-subscribing on state renders.
- Preserved the inline `// Gamepad Y button opens action menu` and `// Gamepad X button toggles track like status` comments in `DeckifyExpandedModal.tsx` to maintain compatibility with `tests/test_e2e_requirements.py` regex assertions.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-commit hook (`tests/test_e2e_requirements.py`) failed on the first commit attempt because `test_r10_gamepad_y_button_opens_action_menu` and `test_r10_gamepad_x_button_toggles_focused_track_like` expect `action`/`like` on the same line as `"Y"`/`"X"` in `DeckifyExpandedModal.tsx`. Restored the descriptive inline comments on those two `else if` lines, after which all 12 Vitest suites (96 tests), `tsc --noEmit`, Rollup build, and all 432 Python tests passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `TriggerController` and `useTriggerNavigation` are ready for Plan 08-02 to wire `L2`/`R2` playback seeking (CTRL-01) and library fast-paging (CTRL-02) via the `onTrigger` callback in `DeckifyExpandedModal.tsx`.

## Self-Check: PASSED
- `src/utils/triggerController.ts`: FOUND
- `src/utils/triggerController.test.ts`: FOUND
- `src/hooks/useTriggerNavigation.ts`: FOUND
- `src/components/DeckifyExpandedModal.tsx`: FOUND
- `src/components/DeckifyExpandedModal.test.tsx`: FOUND
- `src/components/common/Sidebar.tsx`: FOUND
- `src/components/common/Sidebar.test.tsx`: FOUND
- Commit `21dbc20`: FOUND
- Commit `45b6070`: FOUND

---
*Phase: 08-controller-l2-r2-ergonomics-trigger-navigation*
*Completed: 2026-11-14*
