---
status: testing
phase: 24-podcast-audiobook-power-suite
source: [24-VERIFICATION.md]
started: 2026-11-22T20:07:37Z
updated: 2026-11-22T20:07:37Z
---

## Current Test

number: 1
name: Live Official Spotify Client CDP Speed Control
expected: |
  Audible 0.5x–2.0x speed changes work via NowPlayingTab Dropdown and QAM speed cycle pill, playback speed auto-resets to 1.0x when transitioning to a music track, and preferred_podcast_speed is restored when returning to a podcast episode or audiobook.
awaiting: user response

## Tests

### 1. Live Official Spotify Client CDP Speed Control
expected: Audible 0.5x–2.0x speed changes work via NowPlayingTab Dropdown and QAM speed cycle pill, playback speed auto-resets to 1.0x when transitioning to a music track, and preferred_podcast_speed is restored when returning to a podcast episode or audiobook.
result: [pending]

### 2. SteamOS GamepadUI Controller Navigation & Visual Layout
expected: Horizontal D-pad focus moves cleanly across All/Unplayed/In Progress filter pills and -15s/+15s transport buttons, L2/R2 perform 15s smart-skip during spoken content, B-button dismisses ShowEpisodesView back to Followed Podcasts, and bottom 4px green progress bars plus "Played"/"Xm left" badges are legible.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
