---
status: testing
phase: 07-game-specific-soundtracks-appid-linking-lifecycle-automation
source: [07-VERIFICATION.md]
started: 2026-11-14T18:43:00Z
updated: 2026-11-14T18:43:00Z
---

## Current Test

number: 1
name: SteamOS GamepadUI Spatial Navigation & Visual Layout
expected: |
  Sidebar Soundtracks icon focuses cleanly, game cards and horizontal button/chip rows navigate without focus traps, PlaylistPickerModal selects playlists/albums/search results cleanly, and Steam CDN game covers render via base64 proxy without CSP errors.
awaiting: user response

## Tests

### 1. SteamOS GamepadUI Spatial Navigation & Visual Layout
expected: Sidebar Soundtracks icon focuses cleanly, game cards and horizontal button/chip rows navigate without focus traps, PlaylistPickerModal selects playlists/albums/search results cleanly, and Steam CDN game covers render via base64 proxy without CSP errors.
result: [pending]

### 2. Live Game Launch/Exit Lifecycle & Spotify Connect Wake-Up
expected: Soundtrack starts after ~3.5s launch debounce (waking Connect if idle), QAM bind button appears while running, and exiting restores pre-game playback context, track, and seek position after ~3.0s debounce (or stays paused if manually paused).
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
