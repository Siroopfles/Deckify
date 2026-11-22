---
status: testing
phase: 22-spotify-connect-hub-2-0-native-crossfade
source: [22-VERIFICATION.md]
started: 2026-11-22T17:00:18Z
updated: 2026-11-22T17:00:18Z
---

## Current Test

number: 1
name: Long Device Name Truncation (backstop)
expected: |
  Device rows with 40+ character Connect device names truncate cleanly with ellipsis in SteamOS CEF without wrapping or clipping `Active` or `Fixed Volume` badges.
awaiting: user response

## Tests

### 1. Long Device Name Truncation (backstop)
expected: Device rows with 40+ character Connect device names truncate cleanly with ellipsis in SteamOS CEF without wrapping or clipping `Active` or `Fixed Volume` badges.
result: [pending]

### 2. D-Pad Scroll & Focus Navigation (backstop)
expected: Multiple Connect devices scroll smoothly inside `DeckifyExpandedModal` `contentPaneRef` while preserving `flow-children="column"` D-pad focus navigation.
result: [pending]

### 3. Live Auto-Waking Pull Playback, Hardware Label & Remote Volume
expected: Local hardware card displays accurate platform label (`Steam Deck` vs `Steam Machine` vs `Local Device`), local device is not duplicated in the remote list regardless of hostname capitalization, *"Pull Playback to {Hardware}"* wakes an Eco-sleeping or stopped local engine and transfers playback, and the Remote Volume slider updates external Connect device volume without affecting local PipeWire ducking.
result: [pending]

### 4. Live Crossfade Audio & CDP Sync
expected: `Crossfade` (`0–12s`) in `SettingsTab` is enabled when Official Spotify Client is active (syncing via Flatpak `prefs` + CDP port `9229`) and disabled with a clear explanation when `librespot` is active; `librespot` track transitions are never muted or dipped to silence.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
