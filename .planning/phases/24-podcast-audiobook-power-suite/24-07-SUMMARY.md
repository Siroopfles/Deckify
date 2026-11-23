---
phase: 24-podcast-audiobook-power-suite
plan: 07
subsystem: playback-ui
tags: [podcast, audiobook, progress-scrub-bar, pointer-drag, touch, cef, uat-gap-closure]

requires:
  - phase: 24-podcast-audiobook-power-suite
    provides: "ProgressScrubBar in NowPlayingTab.tsx with D-pad onGamepadDirection scrubbing"
provides:
  - "Native <div role=\"slider\"> hit-target pointer/touch drag in ProgressScrubBar with 10px vertical padding, touchAction: none, userSelect: none, and pointerEvents: none on visual children"
  - "Window-level pointermove, pointerup, and pointercancel listeners scoped to activePointerIdRef with unmount cleanup and post-drag synthetic onClick deduplication"
  - "Unit test suite covering native div role=slider drag lifecycle, window listener teardown, pointercancel abort, and post-drag click suppression"
affects: [NowPlayingTab, 24-UAT]

commits: 2
plan_head_before: b069f28c7788257d39d09350854c1700a1a0bee5
plan_head_after: d776f80838aaa7d9c270a8bed34f46e5144420b3

tech-stack:
  added: []
  patterns:
    - "Separate @decky/ui <Focusable> D-pad/keyboard focus wrapper from native <div role=\"slider\"> pointer/touch hit-target to prevent SteamOS GamepadUI Focusable from swallowing pointer drags"
    - "Track active pointer drags via window pointermove/pointerup/pointercancel listeners filtered by pointerId and suppress trailing synthetic click events via suppressNextClickRef"

key-files:
  created: []
  modified:
    - src/components/tabs/NowPlayingTab.tsx
    - src/components/tabs/NowPlayingTab.test.tsx

key-decisions:
  - "Keep @decky/ui <Focusable> strictly for D-pad/keyboard focus and onGamepadDirection Left/Right scrubbing while delegating pointer/touch drag to an inner native <div role=\"slider\"> hit-target with window-level listeners"
  - "Extract bindWindowScrubListeners and createScrubHandlers in NowPlayingTab.tsx so ProgressScrubBar satisfies ESLint max-lines-per-function and complexity rules with zero warnings"

patterns-established:
  - "CEF Touch/Mouse Slider Pattern: Native div hit-target (padding: 10px 0, touchAction: none, userSelect: none, e.preventDefault/stopPropagation on pointerdown) + window pointermove/pointerup/pointercancel listeners + suppressNextClickRef"

requirements-completed: [POD-02]

coverage:
  - id: D1
    description: "ProgressScrubBar delegates pointer/touch dragging to a native <div role=\"slider\"> hit-target inside <Focusable> with window-level pointermove/pointerup/pointercancel listeners and post-drag onClick deduplication (G-24-3)"
    requirement: "POD-02"
    verification:
      - kind: unit
        ref: "pnpm test -- --run src/components/tabs/NowPlayingTab.test.tsx"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-11-23
status: complete
---

# Phase 24 Plan 07: UAT Gap Closure (G-24-3 ProgressScrubBar Native Pointer-Drag) Summary

**Moved `ProgressScrubBar` pointer/touch dragging off `@decky/ui` `<Focusable>` onto a native `<div role="slider">` hit-target with `10px` vertical hit padding, `window`-level pointer tracking, and post-drag click deduplication.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-11-23T17:41:46Z
- **Completed:** 2026-11-23T17:52:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Separated `@decky/ui` `<Focusable>` D-pad/keyboard scrubbing (`onGamepadDirection` `DIR_LEFT`/`DIR_RIGHT` and `ArrowLeft`/`ArrowRight`) from pointer/touch interaction by removing pointer/click handlers from `<Focusable>` and rendering an inner native `<div role="slider">` hit-target (`ref={hitTargetRef}`).
- Styled the native `<div role="slider">` hit-target with generous vertical hit padding (`padding: "10px 0"`), `touchAction: "none"`, `userSelect: "none"`, and `pointerEvents: "none"` on the inner 12px track and `ProgressFillTrack` so child thumb/fill elements never intercept pointer events or lose capture in SteamOS CEF.
- Implemented `bindWindowScrubListeners` and `createScrubHandlers` in `src/components/tabs/NowPlayingTab.tsx` with `e.preventDefault?.()` and `e.stopPropagation?.()` on `pointerdown`, `window`-level `pointermove`/`pointerup`/`pointercancel` listeners filtered by `activePointerIdRef`, unmount cleanup via `useEffect`, and `suppressNextClickRef` deduplication so trailing synthetic `click` events after `pointerup` do not double-seek.
- Updated `src/components/tabs/NowPlayingTab.test.tsx` to verify that `<Focusable>` retains `onGamepadDirection` without `onPointerDown`, and that `<div role="slider">` handles `pointerdown` → `window` `pointermove` → `window` `pointerup`, suppresses duplicate trailing `onClick`, allows standalone clicks, and cleans up on `pointercancel`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Move ProgressScrubBar pointer-drag to a native div hit-target with window listeners and click deduplication (G-24-3)** - `9a01a83` (fix)
2. **Task 2: Update NowPlayingTab.test.tsx to test native div pointer-drag, window listeners, and click deduplication (G-24-3)** - `d776f80` (test)

## Files Created/Modified
- `src/components/tabs/NowPlayingTab.tsx` - Extracts `computeTargetMs`, `bindWindowScrubListeners`, and `createScrubHandlers`, moves pointer/click handlers from `<Focusable>` to a native `<div role="slider">` hit-target with `window`-level drag listeners and `pointerEvents: "none"` on visual track children.
- `src/components/tabs/NowPlayingTab.test.tsx` - Adds unit tests verifying `<Focusable>` D-pad scrubbing without `onPointerDown`, native `<div role="slider">` pointer-drag via `window` `pointermove`/`pointerup`, post-drag `onClick` deduplication, and `pointercancel` cleanup.

## Decisions Made
- Kept `@decky/ui` `<Focusable>` strictly for controller/keyboard focus and `onGamepadDirection` `DIR_LEFT`/`DIR_RIGHT` scrubbing while delegating pointer/touch drag to a native `<div role="slider">` hit-target with `window` listeners, matching the proven `EqBandFaders.tsx` pattern in SteamOS GamepadUI CEF.
- Extracted `bindWindowScrubListeners` and `createScrubHandlers` module helpers in `src/components/tabs/NowPlayingTab.tsx` so `ProgressScrubBar` has zero ESLint line-count or complexity warnings.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 24 UAT gap G-24-3 is closed and verified by unit tests (`325 passed`), ESLint (`0 errors`, `0 warnings` on modified files), TypeScript (`tsc --noEmit`), and Rollup bundle build.
- Ready for `/gsd-verify-work` or Phase 25 planning.

---
*Phase: 24-podcast-audiobook-power-suite*
*Completed: 2026-11-23*

## Self-Check: PASSED
