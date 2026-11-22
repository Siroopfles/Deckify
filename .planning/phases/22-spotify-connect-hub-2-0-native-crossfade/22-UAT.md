---
status: complete
phase: 22-spotify-connect-hub-2-0-native-crossfade
source: [22-VERIFICATION.md]
started: 2026-11-22T17:00:18Z
updated: 2026-11-22T16:19:55.449Z
---

## Current Test

[testing complete]

## Tests

### 1. Long Device Name Truncation (backstop)
expected: Device rows with 40+ character Connect device names truncate cleanly with ellipsis in SteamOS CEF without wrapping or clipping `Active` or `Fixed Volume` badges.
result: pass

### 2. D-Pad Scroll & Focus Navigation (backstop)
expected: Multiple Connect devices scroll smoothly inside `DeckifyExpandedModal` `contentPaneRef` while preserving `flow-children="column"` D-pad focus navigation.
result: pass

### 3. Live Auto-Waking Pull Playback, Hardware Label & Remote Volume
expected: Local hardware card displays accurate platform label (`Steam Deck` vs `Steam Machine` vs `Local Device`), local device is not duplicated in the remote list regardless of hostname capitalization, *"Pull Playback to {Hardware}"* wakes an Eco-sleeping or stopped local engine and transfers playback, and the Remote Volume slider updates external Connect device volume without affecting local PipeWire ducking.
result: issue
reported: "Er staat local device maar het is de steam machine opzich niet heel erg maar het is wel de steam machine Voor de rest werkt het perfect en weet ook niet of we dit moeten fixen"
severity: minor

### 4. Live Crossfade Audio & CDP Sync
expected: `Crossfade` (`0–12s`) in `SettingsTab` is enabled when Official Spotify Client is active (syncing via Flatpak `prefs` + CDP port `9229`) and disabled with a clear explanation when `librespot` is active; `librespot` track transitions are never muted or dipped to silence.
result: pass

## Summary

total: 4
passed: 3
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-22-4
  truth: "Local hardware card displays accurate platform label (Steam Machine on non-Deck desktop/living-room hosts instead of Local Device)."
  status: failed
  reason: "User reported: Er staat local device maar het is de steam machine opzich niet heel erg maar het is wel de steam machine Voor de rest werkt het perfect en weet ook niet of we dit moeten fixen"
  severity: minor
  test: 3
  root_cause: "1) Valve Steam Machine DMI product_name/board_name is 'Fremont' (not matched by detect_host_hardware_label in py_modules/rpc_playback.py); 2) read_power_supply_state in py_modules/eco.py treats peripheral batteries with scope='Device' (e.g. corsair-void-1-battery) as system batteries, causing has_battery=True on desktops with wireless headsets/controllers."
  artifacts:
    - path: "py_modules/eco.py"
      issue: "read_power_supply_state counts scope='Device' peripheral batteries as system batteries"
    - path: "py_modules/rpc_playback.py"
      issue: "detect_host_hardware_label does not recognize Valve Steam Machine DMI codename 'fremont'"
  missing:
    - "Ignore power_supply entries with scope == 'Device' in py_modules/eco.py:read_power_supply_state so wireless peripherals never masquerade as system batteries"
    - "Recognize 'fremont' alongside 'steam machine' in py_modules/rpc_playback.py:detect_host_hardware_label"
    - "Add unit tests in tests/test_connect_hub.py (and/or tests/test_eco.py) for Fremont DMI and scope='Device' peripheral battery filtering"
