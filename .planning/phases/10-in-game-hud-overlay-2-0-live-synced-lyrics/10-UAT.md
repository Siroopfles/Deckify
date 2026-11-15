---
status: testing
phase: 10-in-game-hud-overlay-2-0-live-synced-lyrics
source: [10-VERIFICATION.md]
started: 2026-11-15T11:34:00+01:00
updated: 2026-11-15T11:34:00+01:00
---

## Current Test

number: 1
name: Gamescope CEF Long-Line Truncation & Frame Pacing
expected: |
  Long lyric lines truncate cleanly to a single 18px line with ellipsis within maxWidth: 320px without resizing or wrapping the HUD, and cross-fade smoothly at 200ms with no in-game frame drops.
awaiting: user response

## Tests

### 1. Gamescope CEF Long-Line Truncation & Frame Pacing
expected: Play a track with long synced lyric lines in SteamOS Gamescope with Overlay Lyrics enabled. Long lyric lines truncate cleanly to a single 18px line with ellipsis within maxWidth: 320px without resizing or wrapping the HUD, and cross-fade smoothly at 200ms with no in-game frame drops.
result: [pending]

### 2. QAM & SettingsTab Live Controls
expected: Toggle Overlay Lyrics in Quick Access Menu and adjust Auto-Hide Duration (3-15s) and Lyrics Latency Offset (-2000..+2000ms) sliders in Settings -> In-Game Mini Overlay (HUD). QAM remains compact with dynamic Auto-Hide Overlay (Ns) label; SettingsTab sliders smoothly adjust autohide duration and lyric sync offset in real time.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
