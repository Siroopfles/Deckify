---
phase: 24-podcast-audiobook-power-suite
plan: 06
subsystem: playback-ui-and-rpc
tags: [podcast, audiobook, playback-speed, progress-scrub-bar, track-action-modal, uat-gap-closure]

requires:
  - phase: 24-podcast-audiobook-power-suite
    provides: "Podcast speed RPC, NowPlayingTab spoken transport/speed controls, TrackActionModal"
provides:
  - "Error-free preferred_podcast_speed persistence in set_playback_speed via py_modules.common._save_settings"
  - "Un-stubbed make_plugin() in tests/test_podcast_suite.py"
  - "Pointer-draggable and D-pad Left/Right scrubbable ProgressScrubBar without duplicate -15s/+15s row"
  - "Spoken-content-aware TrackActionModal labels via isSpokenContent(actionTrack)"
affects: [NowPlayingTab, TrackActionModal, rpc_playback, 24-UAT]

commits: 3
plan_head_before: 87cdc3fce389346f2e95f2c4722b77e4d78026d6
plan_head_after: f371a77a3f22fc10b21d30cd9744fd6a01553c45

tech-stack:
  added: []
  patterns:
    - "Call module-level _save_settings(plugin._settings) in py_modules/rpc_* rather than plugin._save_settings()"
    - "Use onPointerDown/onPointerMove/onPointerUp with setPointerCapture and onGamepadDirection DIR_LEFT/DIR_RIGHT on ProgressScrubBar"
    - "Gate music-only modal actions (Start Track Radio, Go to Album) and adapt Play/Go-to labels via isSpokenContent"

key-files:
  created: []
  modified:
    - py_modules/rpc_playback.py
    - tests/test_podcast_suite.py
    - src/components/tabs/NowPlayingTab.tsx
    - src/components/tabs/NowPlayingTab.test.tsx
    - src/components/common/TrackActionModal.tsx
    - src/components/common/TrackActionModal.test.tsx

key-decisions:
  - "Export ProgressScrubBar from NowPlayingTab.tsx so shallow JSX unit tests can exercise pointer drag and onGamepadDirection directly"
  - "Pass plugin._settings to module-level _save_settings imported from py_modules.common in set_playback_speed"

patterns-established:
  - "Spoken content modal adaptation: reuse isSpokenContent(actionTrack) from src/utils/playback.ts"

requirements-completed: [POD-01, POD-02]

coverage:
  - id: D1
    description: "set_playback_speed persists preferred_podcast_speed via py_modules.common._save_settings(plugin._settings) and make_plugin() no longer stubs _save_settings"
    requirement: "POD-01"
    verification:
      - kind: unit
        ref: "py -3 -m unittest tests.test_podcast_suite -v"
        status: pass
    human_judgment: false
  - id: D2
    description: "NowPlayingTab removes duplicate -15s/+15s row under ProgressScrubBar and adds pointer drag and onGamepadDirection Left/Right scrubbing"
    requirement: "POD-01"
    verification:
      - kind: unit
        ref: "pnpm test -- --run src/components/tabs/NowPlayingTab.test.tsx"
        status: pass
    human_judgment: false
  - id: D3
    description: "TrackActionModal uses isSpokenContent(actionTrack) to render Play Episode and Go to Show (...) and hide Start Track Radio and Go to Album for podcasts and audiobooks"
    requirement: "POD-02"
    verification:
      - kind: unit
        ref: "pnpm test -- --run src/components/common/TrackActionModal.test.tsx"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-11-22
status: complete
---

# Phase 24 Plan 06: UAT Gap Closure (G-24-1 & G-24-2) Summary

**Fixed QAM `set_playback_speed` `_save_settings` `AttributeError`, removed duplicate `-15s`/`+15s` seek bar row with pointer-drag and D-pad Left/Right scrubbing on `ProgressScrubBar`, and adapted `TrackActionModal` wording for spoken content.**

## Performance

- **Duration:** 4 min (265s)
- **Started:** 2026-11-22T20:36:04Z
- **Completed:** 2026-11-22T20:40:29Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- Imported `_save_settings` from `py_modules.common` into `py_modules/rpc_playback.py` and replaced `plugin._save_settings()` with `_save_settings(plugin._settings)` in `set_playback_speed`, eliminating the `AttributeError` that triggered false QAM error toasts (G-24-1).
- Removed the masking `_save_settings=MagicMock()` stub from `make_plugin()` in `tests/test_podcast_suite.py` and patched `rpc_playback._save_settings` directly.
- Removed the redundant `-15s`/`+15s` `InteractiveRow` strip under `ProgressScrubBar` in `src/components/tabs/NowPlayingTab.tsx`, and added pointer-drag seeking (`onPointerDown`/`onPointerMove`/`onPointerUp`/`onPointerCancel` with clamped `[0, 1]` ratio and `rect.width > 0` guard) plus `onGamepadDirection` `DIR_LEFT`/`DIR_RIGHT` scrubbing.
- Adapted `src/components/common/TrackActionModal.tsx` using `isSpokenContent(actionTrack)` so podcast episodes and audiobooks display `"Play Episode"` and `"Go to Show (...)"` while hiding `"Start Track Radio"` and `"Go to Album"`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix set_playback_speed _save_settings call and un-stub make_plugin in test_podcast_suite.py (G-24-1)** - `9309af4` (fix)
2. **Task 2: Remove duplicate -15s/+15s row and add pointer-drag + onGamepadDirection scrubbing to ProgressScrubBar (G-24-2)** - `1ec527a` (fix)
3. **Task 3: Adapt TrackActionModal wording for spoken content via isSpokenContent (G-24-2)** - `f371a77` (fix)

## Files Created/Modified
- `py_modules/rpc_playback.py` - Imports `_save_settings` from `py_modules.common` and calls `_save_settings(plugin._settings)` in `set_playback_speed`.
- `tests/test_podcast_suite.py` - Removes `_save_settings` stub from `make_plugin()` and asserts `rpc_playback._save_settings` call behavior.
- `src/components/tabs/NowPlayingTab.tsx` - Removes duplicate `-15s`/`+15s` row under `ProgressScrubBar`, adds pointer-drag and `onGamepadDirection` Left/Right scrubbing, and exports `ProgressScrubBar`.
- `src/components/tabs/NowPlayingTab.test.tsx` - Adds `GamepadButton` mock and unit tests for `ProgressScrubBar` cleanup, D-pad scrubbing, and pointer drag.
- `src/components/common/TrackActionModal.tsx` - Uses `isSpokenContent(actionTrack)` to adapt modal labels and hide music-only actions for spoken content.
- `src/components/common/TrackActionModal.test.tsx` - Adds unit tests verifying music vs. spoken-content modal labels.

## Decisions Made
- Exported `ProgressScrubBar` from `src/components/tabs/NowPlayingTab.tsx` so shallow JSX tests in `NowPlayingTab.test.tsx` can exercise its pointer and gamepad handlers directly without altering `NowPlayingTab` rendering.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 24 UAT gaps G-24-1 and G-24-2 are closed and verified by unit tests, ESLint (`0 errors`), and Rollup build.
- Ready for `/gsd-verify-work` or Phase 25 planning.

---
*Phase: 24-podcast-audiobook-power-suite*
*Completed: 2026-11-22*


## Self-Check: PASSED
