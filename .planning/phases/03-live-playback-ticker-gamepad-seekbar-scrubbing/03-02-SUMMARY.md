---
phase: 03-live-playback-ticker-gamepad-seekbar-scrubbing
plan: "02"
subsystem: playback-ui
tags:
  - gap-closure
  - playback-clock
  - debouncing
  - post-seek-suppression
  - modal-navigation
requires:
  - 03-01
provides:
  - PLAY-02
  - PLAY-03
affects:
  - DeckifyExpandedModal
  - NowPlayingTab
  - LyricsTab
tech-stack:
  added: []
  patterns:
    - Destructured clock from usePlaybackStatus into DeckifyExpandedModal
    - Delegated handleSeekDelta to clock.scrubDelta (300ms debounce + optimistic UI)
    - Delegated handleSeekPlayback to clock.scrubTo (1500ms post-seek suppression)
    - Passed onSeekPlayback to NowPlayingTab
key-files:
  created: []
  modified:
    - src/components/DeckifyExpandedModal.tsx
decisions:
  - Wired `clock` directly into `DeckifyExpandedModal.tsx`, replacing raw unthrottled `backendSeekPlayback` calls with `clock.scrubDelta` and `clock.scrubTo`.
  - Passed `onSeekPlayback={handleSeekPlayback}` down to `NowPlayingTab` so clicking or targeting specific positions routes through the debounced, suppressed clock controller.
metrics:
  duration: 6m
  completed_date: "2026-11-11"
status: complete
actuals:
  tokens: 12000
  tasks: 1
  commits: 1
  plan_head_before: 6085333eb5a4208a946b627be9b311736780c109
  plan_head_after: aa066cb8835f8664ecb213b2e53316f7fb1b6d0c
---

# Phase 03 Plan 02: Playback Clock Gap Closure Summary

Wired `usePlaybackClock` into `DeckifyExpandedModal.tsx` and connected `onSeekPlayback` to `<NowPlayingTab>`.

## Gaps Addressed

1. **Modal Scrubbing Debounce & Optimistic UI (D-04):**
   - In `DeckifyExpandedModal.tsx`, `handleSeekDelta` now calls `clock.scrubDelta(seconds * 1000)` instead of unthrottled immediate `backendSeekPlayback`.
   - Rapid D-pad scrubbing updates the seekbar and elapsed time immediately without stutter, debouncing backend commits by 300ms.

2. **Post-Seek Suppression Window (D-05):**
   - Routing modal scrubbing and seeking through `clock.scrubDelta` and `clock.scrubTo` triggers `scheduleCommitSeek` / `commitSeek`, which sets `lastSeekTimeRef.current = Date.now()`.
   - Background status polling cannot overwrite the scrubbed position for 1500ms after a seek commit, preventing Spotify Connect race conditions and rubberbanding.

3. **NowPlayingTab Seek Wiring:**
   - `<NowPlayingTab>` now receives `onSeekPlayback={handleSeekPlayback}` in addition to `handleSeekDelta`.

## Verification

- Vitest: 33/33 tests passing (including 15/15 `usePlaybackClock` tests).
- TypeScript: `tsc --noEmit` passes with 0 errors.
- Rollup: `rollup -c` compiles clean bundle to `dist/index.js`.
- Python backend: 318/318 unit tests passing.
