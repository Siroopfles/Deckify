---
status: complete
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
  artifacts: []
  missing: []
