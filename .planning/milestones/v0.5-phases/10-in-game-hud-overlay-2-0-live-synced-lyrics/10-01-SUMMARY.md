---
phase: 10-in-game-hud-overlay-2-0-live-synced-lyrics
plan: 01
subsystem: ui
tags: [react, overlay, lyrics, lrc, gamescope, python, settings]

# Dependency graph
requires:
  - phase: 05-in-game-hud-overlay
    provides: DeckifyOverlay component, DeckifyOverlayWrapper, and overlay settings keys
provides:
  - Discrete setTimeout synced lyric scheduler in DeckifyOverlay with 18px fixed-height cross-fade row
  - Modal-open HUD suppression via modalOpenListeners and unmount cleanup in DeckifyExpandedModal
  - Gated get_lyrics RPC fetching in DeckifyOverlayWrapper with per-track deduplication
  - Strict autoHide respect and configurable autoHideDurationMs (3000..15000ms)
  - Backend persistence, clamping, and settings_changed emission for overlay_lyrics_enabled, overlay_lyrics_offset_ms, and overlay_autohide_duration_s
affects: [10-02-PLAN.md, QAM, SettingsTab]

# Actuals (#2632)
actuals:
  tokens: 9235
  tasks: 3
  commits: 3
plan_head_before: 1fd46d021c7c723bf611b8b86deb6caf59e5b016
plan_head_after: 15bc79d3b020b696dcb36cf15cc48e3eeb0d29a4
commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Discrete recursive setTimeout lyric scheduler anchored to posAnchorRef without setInterval or rAF"
    - "modalOpenListeners pub/sub with closeModalRef unmount guard preventing stuck modal-open state"

key-files:
  created: []
  modified:
    - src/types.ts
    - src/components/DeckifyOverlay.tsx
    - src/index.tsx
    - src/components/DeckifyExpandedModal.tsx
    - py_modules/common.py
    - main.py
    - tests/test_e2e_requirements.py
    - src/components/DeckifyOverlay.test.tsx
    - src/index.test.tsx

key-decisions:
  - "Updated posAnchorRef in its own useEffect prior to the lyric scheduler useEffect so changing lyricsOffsetMs preserves elapsed wall-clock time"
  - "Guarded DeckifyOverlayWrapper get_lyrics responses against stale async overwrites using currentTrackKeyRef"

patterns-established:
  - "HUD lyric slot renders fixed 18px height with JSX text interpolation and 200ms deckifyLyricFadeIn keyframe"

requirements-completed: [HUD-03, HUD-04]

coverage:
  - id: D1
    description: "Discrete setTimeout synced lyric scheduler and 18px fixed-height cross-fade row in DeckifyOverlay with pause freeze/dimming and pointerEvents: none"
    requirement: "HUD-03"
    verification:
      - kind: unit
        ref: "src/components/DeckifyOverlay.test.tsx#Live Synced Lyrics & Autohide 2.0 (Phase 10)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Strict autoHide respect, configurable autoHideDurationMs, modalOpenListeners suppression, and gated get_lyrics RPC in DeckifyOverlayWrapper"
    requirement: "HUD-04"
    verification:
      - kind: unit
        ref: "src/index.test.tsx#DeckifyOverlayWrapper Phase 10 Gating & Modal Suppression"
        status: pass
      - kind: unit
        ref: "src/components/DeckifyOverlay.test.tsx#strictly respects autoHide=false and configurable autoHideDurationMs=10000 (D-08, D-09)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Backend DEFAULT_SETTINGS, _load_settings clamping, and Plugin.set_setting validation/emission for overlay_lyrics_enabled, overlay_lyrics_offset_ms, and overlay_autohide_duration_s"
    requirement: "HUD-04"
    verification:
      - kind: unit
        ref: "tests/test_e2e_requirements.py#TestPhase10OverlaySettings"
        status: pass
    human_judgment: false

# Metrics
duration: 9min
completed: 2026-11-15
status: complete
---

# Phase 10 Plan 01: Live Synced Lyrics HUD & Settings Pipeline Summary

**Discrete `setTimeout` synced lyrics engine in `DeckifyOverlay` with 18px fixed-height cross-fade row, `/deckify` modal suppression, gated `get_lyrics` RPCs, and clamped backend settings**

## Performance

- **Duration:** 9 min
- **Started:** 2026-11-15T11:10:25Z
- **Completed:** 2026-11-15T11:18:53Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments
- Implemented discrete `setTimeout` lyric scheduling in `src/components/DeckifyOverlay.tsx` anchored to `posAnchorRef` (`positionMs + elapsed + clampedOffsetMs`), with 18px fixed-height row, 200ms `deckifyLyricFadeIn`, `♪ •••` / `"No synced lyrics"` fallbacks, `opacity: 0.5` pause freeze/dimming, strict `autoHide` respect, configurable `autoHideDurationMs` (`3000..15000ms`), and `pointerEvents: "none"`.
- Added `modalOpenListeners` pub/sub and `closeModalRef` unmount cleanup across `src/index.tsx` and `src/components/DeckifyExpandedModal.tsx`, plus gated `get_lyrics` RPC fetching in `DeckifyOverlayWrapper` deduplicated by track key and guarded against stale async responses.
- Added `overlay_lyrics_enabled` (`False`), `overlay_lyrics_offset_ms` (`0`, clamped `-2000..2000`), and `overlay_autohide_duration_s` (`6`, clamped `3..15`) to `py_modules/common.py` (`DEFAULT_SETTINGS` and `_load_settings`) and `main.py` (`Plugin.set_setting`), with unit tests in `tests/test_e2e_requirements.py`, `src/components/DeckifyOverlay.test.tsx`, and `src/index.test.tsx`.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end discrete synced lyrics HUD, modal suppression, and strict autohide tracer** - `69db064` (feat)
2. **Task 2: Persist and clamp overlay lyrics and autohide duration settings in backend** - `9725e69` (feat)
3. **Task 3: Add Vitest unit tests for discrete lyric scheduler, autohide, and modal suppression** - `15bc79d` (test)

## Files Created/Modified
- `src/types.ts` - Extended `EngineSettings` with `overlay_lyrics_enabled`, `overlay_lyrics_offset_ms`, and `overlay_autohide_duration_s`
- `src/components/DeckifyOverlay.tsx` - Discrete `setTimeout` lyric scheduler, 18px cross-fade lyric row, strict `autoHide`, configurable `autoHideDurationMs`
- `src/index.tsx` - `modalOpenListeners`, `setModalOpenState`, gated `backendGetLyrics` in `DeckifyOverlayWrapper`
- `src/components/DeckifyExpandedModal.tsx` - `closeModalRef` unmount cleanup
- `py_modules/common.py` - `DEFAULT_SETTINGS` and `_load_settings` clamping for new overlay keys
- `main.py` - `Plugin.set_setting` validation, clamping, and `settings_changed` emission
- `tests/test_e2e_requirements.py` - `TestPhase10OverlaySettings` unit tests
- `src/components/DeckifyOverlay.test.tsx` - 6 new Vitest tests for Phase 10 HUD lyrics and autohide
- `src/index.test.tsx` - 2 new Vitest tests for `DeckifyOverlayWrapper` gating and modal suppression

## Decisions Made
- Updated `posAnchorRef` in a dedicated `useEffect` before the lyric scheduler `useEffect` so changing `lyricsOffsetMs` preserves elapsed wall-clock time since the last `positionMs` update.
- Guarded `DeckifyOverlayWrapper` async `get_lyrics` responses with `currentTrackKeyRef` so slow responses from a previous track never overwrite the active track's lyrics.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed `no-useless-assignment` ESLint error in `DeckifyOverlay.tsx` and `ran` tracking in `DeckifyOverlay.test.tsx` hook mock**
- **Found during:** Task 1 (pre-commit ESLint) and Task 3 (Vitest execution)
- **Issue:** Initialized `displayLyricText`/`lyricDisplayKey` were flagged by `no-useless-assignment` when overwritten in `else if`; `DeckifyOverlay.test.tsx`'s `flushEffects()` re-ran cleanup-less `useEffect`s on `setState` re-renders.
- **Fix:** Simplified the `else if` branch in `DeckifyOverlay.tsx` and added `ran?: boolean` tracking to `effectSlots` in `DeckifyOverlay.test.tsx`.
- **Files modified:** `src/components/DeckifyOverlay.tsx`, `src/components/DeckifyOverlay.test.tsx`
- **Verification:** `npx eslint --quiet`, `pnpm run typecheck`, `npx vitest run` (131/131), and `py -3 -m unittest` (443/443) all passed.
- **Committed in:** `69db064` (Task 1) and `15bc79d` (Task 3)

---

**Total deviations:** 1 auto-fixed (Rule 1)
**Impact on plan:** Necessary for lint compliance and accurate `useEffect` mock semantics. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan `10-01` is complete; Plan `10-02` can now wire the QAM `Overlay Lyrics` toggle, `SettingsTab` sliders (`Auto-Hide Duration`, `Lyrics Latency Offset`), and `LyricsTab` clickable source pills against these props and backend settings.

## Self-Check: PASSED
- Created/modified files verified on disk.
- Task commits `69db064`, `9725e69`, `15bc79d` verified in git history.
- `pnpm run typecheck`, `vitest run` (131 passed), `rollup -c`, and Python `unittest` (443 passed) all succeeded.

---
*Phase: 10-in-game-hud-overlay-2-0-live-synced-lyrics*
*Completed: 2026-11-15*
