---
status: complete
phase: 07-game-specific-soundtracks-appid-linking-lifecycle-automation
source: [07-VERIFICATION.md]
started: 2026-11-14T19:51:00Z
updated: 2026-11-14T20:11:04.180Z
---

## Current Test

[testing complete]

## Tests

### 1. SteamOS GamepadUI Spatial Navigation, Steam CDN Covers, showModal() Picker & SliderField B-Button
expected: Sidebar Soundtracks icon focuses cleanly, Steam CDN game covers render via base64 proxy (or FaGamepad fallback), PlaylistPickerModal opens in its own modal focus layer via showModal() (B closes only the picker, selected playlist visibly appears in the game profile), and pressing B on a focused/selected SliderField exits slider adjustment without closing DeckifyExpandedModal.
result: pass

### 2. Live Game Launch/Exit Lifecycle, Router.MainRunningApp Startup Seed & Spotify Connect Wake-Up
expected: QAM shows the 1-click "Bind current music to game" button while a game is running (including if already running on plugin reload), soundtrack starts after ~3.5s launch debounce (waking Connect if idle), and exiting restores pre-game playback context, track, and seek position after ~3.0s debounce (or stays paused if manually paused).
result: pass

## Summary

total: 2
passed: 2
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
