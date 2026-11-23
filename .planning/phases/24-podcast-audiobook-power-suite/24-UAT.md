---
status: testing
phase: 24-podcast-audiobook-power-suite
source: [24-VERIFICATION.md]
started: 2026-11-23T17:57:30Z
updated: 2026-11-23T17:57:30Z
---

## Current Test

number: 1
name: SteamOS GamepadUI Touchscreen / Mouse Drag on ProgressScrubBar (Re-test G-24-3)
expected: |
  The progress bar tracks finger/cursor smoothly without scroll-hijacking or focus capture blockage from @decky/ui Focusable, commits a single seek on release without duplicate synthetic click seeks, and still steps Left/Right with D-pad when focused.
awaiting: user response

## Tests

### 1. SteamOS GamepadUI Touchscreen / Mouse Drag on ProgressScrubBar (Re-test G-24-3)
expected: Drag the ProgressScrubBar in NowPlayingTab via touchscreen or mouse pointer on Steam Deck during music and podcast playback, and scrub Left/Right via D-pad when focused. The progress bar tracks finger/cursor smoothly without scroll-hijacking or focus capture blockage from @decky/ui Focusable, commits a single seek on release without duplicate synthetic click seeks, and still steps Left/Right with D-pad when focused.
result: [pending]

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
