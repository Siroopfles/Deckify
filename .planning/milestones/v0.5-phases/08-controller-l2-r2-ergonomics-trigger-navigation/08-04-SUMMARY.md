---
phase: 08-controller-l2-r2-ergonomics-trigger-navigation
plan: "08-04"
subsystem: ui, controller, rpc
tags: [gamepadui, focus, trigger-navigation, seek, track-action-modal, spotify-403]
requires:
  - phase: 08-controller-l2-r2-ergonomics-trigger-navigation
    provides: "useTriggerNavigation, computeListJump, TrackActionModal, toggle_like_track"
provides:
  - "Native div contentPaneRef wrapper around Focusable in DeckifyExpandedModal"
  - "SEEK_ACCUMULATION_WINDOW_MS = 600 for consecutive L2/R2 seek pulls"
  - "TrackActionModal initial focus transfer on open and focus restoration on close"
  - "Actionable 403 Forbidden error toast and backend message in toggle_like_track"
affects: [08-UAT, DeckifyExpandedModal, TrackActionModal, rpc_playback]
tech-stack:
  added: []
  patterns:
    - "Wrap @decky/ui Focusable in a native HTMLDivElement when DOM ref queries (.contains/.querySelectorAll) are needed"
    - "Keep seek accumulation window (600ms) strictly greater than trigger debounce/repeat intervals (300ms)"
    - "Use requestAnimationFrame + previousFocusRef for modal focus transfer and restoration"
key-files:
  created:
    - src/components/common/TrackActionModal.test.tsx
  modified:
    - src/components/DeckifyExpandedModal.tsx
    - src/components/DeckifyExpandedModal.test.tsx
    - src/components/common/TrackActionModal.tsx
    - py_modules/rpc_playback.py
    - tests/test_final_coverage.py
decisions-made:
  - "Wrapped the right-hand Focusable in a native <div ref={contentPaneRef} data-testid='content-pane'> so contentPaneRef.current is always a real HTMLDivElement in SteamOS GamepadUI"
  - "Set SEEK_ACCUMULATION_WINDOW_MS = 600 (> TRIGGER_DEBOUNCE_MS = 300) so consecutive trigger pulls accumulate before flushing a single seek_playback RPC"
  - "Transferred focus to the first tabIndex={0} InteractiveRow in TrackActionModal via requestAnimationFrame and restored previousFocusRef on close or unmount"
  - "Surfaced actionable 403 Forbidden guidance from toggle_like_track and displayed !res?.ok errors via showToast in handleToggleLike"
requirements-completed: [CTRL-01, CTRL-02, CTRL-03]
status: complete
commits: 3
plan_head_before: 5c2b05ba8a6ada348cc832e3e3cffbe7a1b901d2
plan_head_after: 77d0fcdb91fab2223d8adb6d3a4afbc6377d783a
actuals:
  tasks: 3
  commits: 3
duration: 6min
completed: 2026-11-14
---

# Phase 08 Plan 04: UAT Gap Closure Summary

**Closed all 3 Phase 8 UAT gaps: native `div` `contentPaneRef` wrapper for library list fast-paging, 600ms seek accumulation window across consecutive trigger pulls, `TrackActionModal` focus transfer/restoration, and actionable Spotify 403 Forbidden Like error feedback.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-11-14T22:44:08Z
- **Completed:** 2026-11-14T22:49:41Z
- **Tasks:** 3
- **Files modified:** 6 (1 created, 5 modified)

## Accomplishments

1. **Gap 1 — Native `div` `contentPaneRef` wrapper (`DeckifyExpandedModal.tsx`)**:
   - Wrapped the right-hand `<Focusable>` in `<div ref={contentPaneRef} data-testid="content-pane" style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex" }}>` and moved `data-testid="content-pane-focusable"` onto `<Focusable>`.
   - Ensures `contentPaneRef.current.contains(document.activeElement)` and `querySelectorAll('[data-deckify-list-item="true"]')` operate on a real DOM element in SteamOS GamepadUI while keeping Sidebar focus suppression intact.
2. **Gap 2 — 600ms Seek Accumulation Window (`DeckifyExpandedModal.tsx`)**:
   - Exported `SEEK_ACCUMULATION_WINDOW_MS = 600` (> `TRIGGER_DEBOUNCE_MS = 300` and `TRIGGER_REPEAT_INTERVAL_MS = 300`) and replaced the `250ms` `seekDebounceTimerRef` timeout.
   - Verified consecutive R2 pulls spaced 350ms apart accumulate to `+20s` and flush `handleSeekPlayback(45000)` once after 600ms of inactivity.
3. **Gap 3 — `TrackActionModal` Focus Transfer & 403 Like Error Surfacing (`TrackActionModal.tsx`, `DeckifyExpandedModal.tsx`, `py_modules/rpc_playback.py`)**:
   - Added `modalContainerRef`, `pickerContainerRef`, `previousFocusRef`, and `tabIndex={0}` on the first `InteractiveRow` (`Play Track`, first playlist row, or `Cancel` when playlists are empty), transferring focus via `requestAnimationFrame` on open and restoring `previousFocusRef` on close/unmount.
   - Added error toast surfacing in `handleToggleLike` (`showToast(res?.error || "Failed to update Liked Songs")` + `try/catch`).
   - Updated `toggle_like_track` in `py_modules/rpc_playback.py` to return an actionable 403 Forbidden message without exposing tokens or stack traces.

## Task Commits

Each task was committed atomically with Husky pre-commit verification passing:

1. **Task 1: Fix contentPaneRef DOM wrapper, 600ms seek accumulation window, and Like error toast in DeckifyExpandedModal** — `70859eb` (`fix(08-04): attach contentPaneRef to native div, increase seek window to 600ms, and surface Like error toast`)
2. **Task 2: Transfer focus into TrackActionModal on open and restore on close** — `605f630` (`fix(08-04): transfer focus into TrackActionModal on open and restore on close`)
3. **Task 3: Handle Spotify HTTP 403 Forbidden cleanly in toggle_like_track and add Python unit test** — `77d0fcd` (`fix(08-04): return actionable 403 Forbidden error in toggle_like_track`)

## Files Created/Modified

- [DeckifyExpandedModal.tsx](file:///C:/Users/djdje/Deckify/src/components/DeckifyExpandedModal.tsx) — Exported `SEEK_ACCUMULATION_WINDOW_MS = 600`, wrapped `<Focusable>` in native `<div ref={contentPaneRef} data-testid="content-pane">`, and surfaced `!res?.ok` / thrown errors in `handleToggleLike`.
- [DeckifyExpandedModal.test.tsx](file:///C:/Users/djdje/Deckify/src/components/DeckifyExpandedModal.test.tsx) — Updated seek accumulation test to 350ms/600ms, asserted `content-pane` is a native `div` wrapping `Focusable`, and added 403 Forbidden Like error toast test.
- [TrackActionModal.tsx](file:///C:/Users/djdje/Deckify/src/components/common/TrackActionModal.tsx) — Added `requestAnimationFrame` focus transfer to first `tabIndex={0}` row on open and `previousFocusRef` restoration on close/unmount.
- [TrackActionModal.test.tsx](file:///C:/Users/djdje/Deckify/src/components/common/TrackActionModal.test.tsx) — Added unit tests for initial focus transfer, playlist picker focus transfer, and focus restoration on close/unmount.
- [rpc_playback.py](file:///C:/Users/djdje/Deckify/py_modules/rpc_playback.py) — Added HTTP 403 Forbidden handling in `toggle_like_track` with actionable user guidance.
- [test_final_coverage.py](file:///C:/Users/djdje/Deckify/tests/test_final_coverage.py) — Added `test_toggle_like_track_403_forbidden` covering 403 and 500 `HTTPError` responses.

## Deviations from Plan

None - plan executed as written.

## Verification

- `pnpm run typecheck` (`tsc --noEmit`): 0 errors.
- `pnpm test -- --run`: 14 test files passed, 109 tests passed.
- `pnpm run build` (`rollup -c`): built `dist/` cleanly.
- `py -m unittest discover -s tests -p "test_*.py"`: 433 tests passed (`OK`).

## Self-Check: PASSED

- All 6 created/modified files verified on disk.
- All 3 task commits (`70859eb`, `605f630`, `77d0fcd`) verified in `git log`.

---
*Phase: 08-controller-l2-r2-ergonomics-trigger-navigation*
*Completed: 2026-11-14*
