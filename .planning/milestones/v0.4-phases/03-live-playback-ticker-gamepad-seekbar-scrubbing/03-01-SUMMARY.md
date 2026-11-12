---
phase: 03-live-playback-ticker-gamepad-seekbar-scrubbing
plan: "01"
subsystem: playback-ui
tags:
  - playback-clock
  - monotonic-time
  - drift-gating
  - gamepad-scrubbing
  - seekbar
  - focus-halo
  - spatial-navigation
requires: []
provides:
  - PLAY-01
  - PLAY-02
  - PLAY-03
affects:
  - usePlaybackClock
  - usePlaybackStatus
  - NowPlayingTab
  - QuickAccessMenu
tech-stack:
  added: []
  patterns:
    - Monotonic local clock interpolation (`Date.now() - syncTime`)
    - Drift tolerance threshold resync (1200ms)
    - Optimistic UI scrubbing with 300ms RPC debouncing
    - Post-seek server update suppression window (1500ms)
    - Variable scrub step sizing curve (5s / 10s / 30s)
    - GamepadUI spatial navigation key interception (`flow-children="horizontal"`)
key-files:
  created:
    - src/hooks/usePlaybackClock.ts
    - src/hooks/usePlaybackClock.test.ts
  modified:
    - src/hooks/usePlaybackStatus.ts
    - src/components/tabs/NowPlayingTab.tsx
    - src/index.tsx
decisions:
  - Implemented monotonic clock interpolation (`Date.now() - syncTime`) in usePlaybackClock and PlaybackClockController, ticking smoothly at 250ms intervals.
  - Gated server status updates with a 1200ms drift threshold to completely eliminate rubberbanding second-counter jitter per D-01.
  - Implemented variable scrub step curve (5s for < 5m, 10s for 5-30m, 30s for > 30m) per D-03.
  - Added optimistic visual scrubbing with 300ms debounced RPC commits per D-04, protecting Spotify API rate limits.
  - Suppressed incoming server position updates for 1500ms after seeking per D-05, preventing Spotify Connect race conditions.
  - Replaced InteractiveRow seekbar with dedicated Focusable element featuring a visible circular thumb handle (16px idle, 18px focused with green focus halo) and prevented GamepadUI focus escape on ArrowLeft/ArrowRight per D-02.
  - Unified Quick Access Menu mini-player to consume usePlaybackClock and fixed spatial navigation bug (changed flow-children="row" to "horizontal" on line 355) per D-06.
metrics:
  duration: 18m
  completed_date: "2026-11-11"
status: complete
actuals:
  tokens: 28000
  tasks: 3
  commits: 3
  plan_head_before: 44311a85b78f56e28e415184e49180f6ce405e12
  plan_head_after: 3340762898f0977ddf67b6ace1a5a52f4345763f
---

# Phase 03 Plan 01: Live Playback Ticker & Gamepad Seekbar Scrubbing Summary

Implemented monotonic playback clock interpolation, drift-tolerant resynchronization, interactive D-pad seekbar scrubbing with focus halo and thumb handle, debounced seeking, and unified playback timing across the expanded modal and Quick Access Menu.

## Overview of Implemented Capabilities

### 1. Monotonic Playback Clock & Drift Filtering (PLAY-01, D-01, D-05)
- Created [`src/hooks/usePlaybackClock.ts`](file:///C:/Users/djdje/Deckify/src/hooks/usePlaybackClock.ts) with `PlaybackClockController` and `usePlaybackClock`.
- Monotonic elapsed time calculation: `pos = basePosition + (now - syncTime)` while playing, ticking every 250ms for smooth visual updates.
- 1200ms drift threshold gating: incoming periodic server status responses (`status.position_ms`) with drift <= 1200ms are ignored, eliminating the 200–600ms rubberbanding jitter caused by polling variance.
- Re-anchoring triggers: explicit state changes (track change, play/pause toggle, or drift > 1200ms) smoothly reset the base anchor and sync timestamp.
- 1500ms post-seek suppression window: incoming server updates within 1500ms of an active seek commit are dropped to prevent race conditions with librespot / Spotify Connect backend audio engine settling.
- Variable scrub step sizing: `getScrubStepMs` returns 5000ms for tracks < 5m, 10000ms for 5–30m, and 30000ms for tracks > 30m.

### 2. Interactive D-pad Seekbar Scrubbing in NowPlayingTab (PLAY-02, PLAY-03, D-02, D-03)
- Updated [`src/components/tabs/NowPlayingTab.tsx`](file:///C:/Users/djdje/Deckify/src/components/tabs/NowPlayingTab.tsx) to bind the elapsed time text label (`formatMs(currentPositionMs)`) and the progress bar fill width directly to `currentPositionMs`, completely eliminating the stale fallback `status?.position_ms || currentPositionMs || 0`.
- Replaced `<InteractiveRow>` with a dedicated `@decky/ui` `<Focusable>` element styled with `focusHalo(isFocused)`, `tabIndex={0}`, and `noFocusRing`.
- Intercepted `ArrowLeft` and `ArrowRight` on the seekbar with `e.preventDefault?.()` and `e.stopPropagation?.()`, preventing SteamOS GamepadUI horizontal focus loss while stepping position by `getScrubStepMs(track.duration_ms)`.
- Added a prominent circular thumb handle on the progress fill edge: 16px diameter idle with subtle drop shadow, expanding to 18px with a green focus ring (`0 0 0 2px #1db954, 0 2px 8px rgba(0,0,0,0.8)`) when focused.
- Supported direct click/tap navigation with relative offset calculation (`(clientX - left) / width * durationMs`).
- Maintained `flow-children="horizontal"` on the `-15s / +15s` quick skip button group.

### 3. Quick Access Menu Consolidation & Spatial Navigation Fix (D-06)
- Updated [`src/index.tsx`](file:///C:/Users/djdje/Deckify/src/index.tsx) to wire `usePlaybackClock` directly to server status snapshots, duration, and track metadata.
- Removed the legacy crude 1-second `seekTimerRef` interval that previously drifted and fought server polling.
- Replaced `formatDuration` with `formatMs` from [`src/components/common/InteractiveRow.tsx`](file:///C:/Users/djdje/Deckify/src/components/common/InteractiveRow.tsx).
- Bound `SliderField` `onChange` to `clock.scrubTo(sec * 1000)` with 300ms debounced RPC commits per D-04.
- Fixed the spatial navigation container bug on the quick jump buttons: replaced `flow-children="row"` with `flow-children="horizontal"`, preventing vertical focus jumps in SteamOS CEF.

### 4. Integration into usePlaybackStatus (D-06)
- Updated [`src/hooks/usePlaybackStatus.ts`](file:///C:/Users/djdje/Deckify/src/hooks/usePlaybackStatus.ts) to integrate `usePlaybackClock`, expose `currentPositionMs: clock.positionMs`, and return `clock` alongside status and refresh helpers.
- Removed legacy `setInterval` that attempted manual 1000ms position increments.

### 5. Automated Unit Test Coverage
- Created [`src/hooks/usePlaybackClock.test.ts`](file:///C:/Users/djdje/Deckify/src/hooks/usePlaybackClock.test.ts) with 15 tests covering:
  - Variable scrub step sizing (`getScrubStepMs`) across all duration bands.
  - Monotonic ticking and paused position freezing.
  - End-of-track clamping to `durationMs`.
  - Drift tolerance threshold gating (<= 1200ms ignored, > 1200ms re-anchors).
  - Track change and play state toggle re-anchoring.
  - Optimistic scrubbing and 300ms debounce before `onSeekCommit` execution.
  - Synchronous `seekImmediate` execution.
  - 1500ms post-seek suppression window.
  - Full suite: 33 Vitest tests and 318 Python unit tests pass with zero errors.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed duplicate position style property on seekbar Focusable**
- **Found during:** Task 2 verification (`pnpm typecheck`)
- **Issue:** TypeScript reported `TS2783: 'position' is specified more than once` because `focusHalo` includes `position: "relative"` and the style object also declared `position: "relative"`.
- **Fix:** Removed redundant `position: "relative"` property from the style object on `<Focusable>`.
- **Files modified:** `src/components/tabs/NowPlayingTab.tsx`
- **Commit:** `1476c56`

## Known Stubs

None. All interfaces, hooks, controllers, and components are fully implemented with real logic.

## Self-Check: PASSED

- [x] All 5 files exist on disk:
  - `src/hooks/usePlaybackClock.ts`
  - `src/hooks/usePlaybackClock.test.ts`
  - `src/hooks/usePlaybackStatus.ts`
  - `src/components/tabs/NowPlayingTab.tsx`
  - `src/index.tsx`
- [x] All 3 task commits exist in git history:
  - `2f7de3e`: `feat(03-01): implement live playback clock interpolation and debounced seeking`
  - `1476c56`: `feat(03-01): add interactive D-pad seekbar scrubbing and focus halo to NowPlayingTab`
  - `3340762`: `refactor(03-01): unify Quick Access Menu playback clock and fix button navigation`
