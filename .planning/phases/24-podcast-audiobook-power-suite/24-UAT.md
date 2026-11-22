---
status: diagnosed
phase: 24-podcast-audiobook-power-suite
source: [24-01-SUMMARY.md, 24-02-SUMMARY.md, 24-03-SUMMARY.md, 24-04-SUMMARY.md, 24-05-SUMMARY.md, 24-06-SUMMARY.md]
started: 2026-11-22T20:53:05Z
updated: 2026-11-22T20:53:19.218Z
---

## Current Test

[testing complete]

## Tests

### 1. Live Official Spotify Client CDP Speed Control
expected: Audible 0.5x–2.0x speed changes work via NowPlayingTab Dropdown and QAM speed cycle pill without any false error toast, playback speed auto-resets to 1.0x when transitioning to a music track, and preferred_podcast_speed is restored when returning to a podcast episode or audiobook.
result: pass

### 2. SteamOS GamepadUI Controller Navigation, Scrubbing & Spoken-Content Options
expected: NowPlayingTab has no duplicate -15s/+15s row under ProgressScrubBar, ProgressScrubBar is draggable via pointer/touch and scrubbable via D-pad Left/Right when focused, music keeps Previous/Next and L2/R2, podcasts keep -15s/+15s in the transport row, and TrackActionModal shows "Play Episode" / "Go to Show (...)" without "Start Track Radio" or "Go to Album".
result: issue
reported: "alleen de playbackbar niet sleepbaar is dat is het enige"
severity: major

## Summary

total: 2
passed: 1
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-24-3
  truth: "ProgressScrubBar is draggable via pointer/touch and scrubbable via D-pad Left/Right when focused"
  status: failed
  reason: "User reported: alleen de playbackbar niet sleepbaar is dat is het enige"
  severity: major
  test: 2
  root_cause: "ProgressScrubBar (src/components/tabs/NowPlayingTab.tsx:176-252) attaches pointer-drag handlers and touchAction: none directly onto @decky/ui's <Focusable> component with a 12px-tall hit target inside an overflowY: auto scroll container (DeckifyExpandedModal.tsx), without calling e.preventDefault() or using a native <div> hit-target with window-level pointermove/pointerup listeners. In SteamOS GamepadUI CEF, <Focusable>'s internal pointer/focus handling and touch-scroll interception drops pointer-drag tracking."
  artifacts:
    - path: "src/components/tabs/NowPlayingTab.tsx"
      issue: "Pointer-drag handlers attached to <Focusable> with 12px hit area, no e.preventDefault(), element-only move/up listeners, and duplicate onClick commit"
    - path: "src/components/tabs/NowPlayingTab.test.tsx"
      issue: "Pointer drag test mocks Focusable and calls prop callbacks directly rather than testing native div hit-target and window pointermove/pointerup listeners"
  missing:
    - "Keep <Focusable> for D-pad/keyboard focus and onGamepadDirection Left/Right scrubbing, and place pointer-drag hit target on a native <div> inside it with generous vertical hit padding (e.g. padding: 10px 0), touchAction: none, userSelect: none, pointerEvents: none on visual children, e.preventDefault() on pointerdown, and window-level pointermove/pointerup/pointercancel listeners during active drag"
    - "Skip duplicate onClick seek commit immediately after a drag"
    - "Update NowPlayingTab.test.tsx to test native div pointer-drag and window listener cleanup"
  debug_session: .planning/debug/progress-scrub-bar-not-draggable.md
