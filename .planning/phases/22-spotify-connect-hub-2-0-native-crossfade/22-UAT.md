---
status: testing
phase: 22-spotify-connect-hub-2-0-native-crossfade
source: [22-VERIFICATION.md]
started: 2026-11-22T12:43:35Z
updated: 2026-11-22T12:43:35Z
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

### 3. Live Auto-Waking Pull Playback & Remote Volume
expected: Selecting *"Pull Playback to Steam Deck"* wakes an Eco-sleeping or stopped local engine and transfers active playback from an external device; adjusting the Remote Volume slider updates external Connect device volume without affecting local PipeWire ducking.
result: [pending]

### 4. Live Crossfade Audio & CDP Sync
expected: Setting `Crossfade` (`0–12s`) in `SettingsTab` updates Official Spotify Client via CDP port `9229` and drives smooth `librespot` PipeWire boundary fades without overriding Sleep Timer lock or per-game ducking.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
