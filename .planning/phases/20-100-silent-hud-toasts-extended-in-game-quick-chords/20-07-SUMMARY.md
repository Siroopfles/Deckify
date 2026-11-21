---
phase: 20-100-silent-hud-toasts-extended-in-game-quick-chords
plan: 07
subsystem: frontend-input
tags: [gamepad, chords, steam-client, controller-input, resume, deduplication]
requires:
  - phase: 20-06
    provides: Backend controller_input event emission via py_modules/input_watch.py and main.py
provides:
  - Steam Controller 2026 D-pad 20..23 mappings in src/chords.ts
  - Dual-signature RegisterForControllerInputMessages, RegisterForControllerStateChanges fallback, .unregister()/.Unregister() cleanup, deck_resumed re-subscription, and deduplicated backend controller_input subscription in src/index.tsx
affects:
  - 20-UAT (closes gap G-20-3)
tech-stack:
  added: []
  patterns:
    - "Cross-source 50ms (button, pressed) deduplication between frontend SteamClient.Input and backend controller_input"
    - "Dual-signature RegisterForControllerInputMessages (Array<{ nA, bS }> and 3-arg) with RegisterForControllerStateChanges ulButtons bitmask fallback"
key-files:
  created: []
  modified:
    - src/chords.ts
    - src/chords.test.ts
    - src/index.tsx
    - src/index.test.tsx
key-decisions:
  - "Keyed 50ms deduplication by (btn, isPressed) with source tracking ('frontend' | 'backend') so simultaneous dual-source deliveries are deduplicated while rapid sequential presses from a single source are preserved"
  - "Used BigInt bitmask diffing (bits 1..28) in RegisterForControllerStateChanges fallback to match GAMEPAD_BUTTON indices cleanly"
requirements-completed:
  - CHORD-01
metrics:
  duration: 5 min
  completed: 2026-11-22T00:29:36Z
  status: complete
  commits: 2
  plan_head_before: 47264de722ec7061f3191716502a07d672fa5343
  plan_head_after: a35c76e285680a29b963d785c49f2bf85b6edc7e
actuals:
  tokens: 45243
  tasks: 2
  commits: 2
coverage:
  - deliverable: "D-pad 20..23 mappings in CONTROLLER_INPUT_TO_GAMEPAD_BUTTON (src/chords.ts)"
    human_judgment: false
    verification:
      - kind: vitest
        ref: "src/chords.test.ts#mapControllerInputButton"
        status: pass
  - deliverable: "Dual-signature RegisterForControllerInputMessages, RegisterForControllerStateChanges fallback, .unregister()/.Unregister() cleanup, deck_resumed re-subscription, and deduplicated backend controller_input subscription (src/index.tsx)"
    human_judgment: false
    verification:
      - kind: vitest
        ref: "src/index.test.tsx#Phase 20: Configurable Quick-Chords & Silent Confirmations (CHORD-01)"
        status: pass
---

# Phase 20 Plan 07: Frontend Quick-Chord Dual-Signature, State Fallback, Resume & Backend Bridge Summary

**Added Steam Controller 2026 D-pad `20..23` mappings in `src/chords.ts` and upgraded `setupChordListener()` / `unregisterHandle()` in `src/index.tsx` for dual `RegisterForControllerInputMessages` signatures, `RegisterForControllerStateChanges` bitmask fallback, lowercase `.unregister()`, `deck_resumed` re-subscription, and 50ms-deduplicated backend `controller_input` events.**

## Performance

- **Duration:** 5 min
- **Completed:** 2026-11-22T00:29:36Z
- **Tasks:** 2 (TDD)
- **Files modified:** 4 (`src/chords.ts`, `src/chords.test.ts`, `src/index.tsx`, `src/index.test.tsx`)

## Accomplishments

- Added `20..23` -> `GAMEPAD_BUTTON.DIR_UP`/`DIR_RIGHT`/`DIR_DOWN`/`DIR_LEFT` mappings in `CONTROLLER_INPUT_TO_GAMEPAD_BUTTON` (`src/chords.ts`) alongside `4..7`, verified by `src/chords.test.ts`.
- Updated `unregisterHandle()` in `src/index.tsx` to invoke function handles, `.unregister()` (lowercase), and `.Unregister()` (uppercase).
- Upgraded `setupChordListener()` in `src/index.tsx` with:
  - `subscribeFrontendInput()` supporting both `Array<{ nA, bS }>` and 3-arg `(idx, btn, pressed)` `RegisterForControllerInputMessages` payloads, `RegisterForControllerStateChanges` `ulButtons` `BigInt` bitmask diffing fallback, and `FocusNavController` fallback.
  - Persistent `controller_input` backend event subscription with `1..28` integer + boolean payload validation and 50ms cross-source `(btn, isPressed)` deduplication.
  - `deck_resumed` and `SteamClient.System.RegisterForOnResumeFromSuspend` re-subscription with full teardown on `onDismount`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add D-pad 20..23 mappings to CONTROLLER_INPUT_TO_GAMEPAD_BUTTON in src/chords.ts** - `2b8b04c` (`feat`)
2. **Task 2: Upgrade setupChordListener() and unregisterHandle() in src/index.tsx** - `a35c76e` (`feat`)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Scoped 50ms deduplication to cross-source (`frontend` vs `backend`) deliveries**
- **Found during:** Task 2 verification
- **Issue:** Keying deduplication solely by `(btn, isPressed)` timestamp caused rapid same-source button presses within 50ms (including consecutive `pressChord()` calls in unit tests) to be dropped.
- **Fix:** Tracked `{ ts, source }` per `(btn, isPressed)` key so identical events arriving from different sources (`"frontend"` vs `"backend"`) within 50ms are deduplicated, while sequential presses from the same source pass through cleanly.
- **Files modified:** `src/index.tsx`
- **Commit:** `a35c76e`

**Total deviations:** 1 auto-fixed (1 Rule 1 bug). **Impact:** Preserves rapid single-source presses while preventing double-fires when both frontend and backend deliver the same transition.

## Verification

- `pnpm test -- --run`: 21 test files, 263 tests passed.
- `pnpm run lint`: 0 errors (762 pre-existing warnings in other files).
- `pnpm run typecheck`: Passed (`tsc --noEmit` exit 0).
- `pnpm run build`: Passed (`rollup -c` created `dist` cleanly).

## Self-Check: PASSED

- `src/chords.ts`: FOUND
- `src/chords.test.ts`: FOUND
- `src/index.tsx`: FOUND
- `src/index.test.tsx`: FOUND
- Commit `2b8b04c`: FOUND
- Commit `a35c76e`: FOUND
