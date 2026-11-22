---
status: complete
phase: 22-spotify-connect-hub-2-0-native-crossfade
source: [22-VERIFICATION.md]
started: 2026-11-22T12:43:35Z
updated: 2026-11-22T15:31:14.666Z
---

## Current Test

[testing complete]

## Tests

### 1. Long Device Name Truncation (backstop)
expected: Device rows with 40+ character Connect device names truncate cleanly with ellipsis in SteamOS CEF without wrapping or clipping `Active` or `Fixed Volume` badges.
result: issue
reported: "Ik zie active ja allen kan ik 40+ niet checken. want heb niks met zn lange naam. En er staat steam deck engine maar ik heb een steam machine"
severity: minor

### 2. D-Pad Scroll & Focus Navigation (backstop)
expected: Multiple Connect devices scroll smoothly inside `DeckifyExpandedModal` `contentPaneRef` while preserving `flow-children="column"` D-pad focus navigation.
result: issue
reported: "Ja vgm wel ja aleen zie ik dus wel 2 keer de naam van de Steammachine er tussen staan een keer met hoofletters andere keer zonder hoe zit dat."
severity: minor

### 3. Live Auto-Waking Pull Playback & Remote Volume
expected: Selecting *"Pull Playback to Steam Deck"* wakes an Eco-sleeping or stopped local engine and transfers active playback from an external device; adjusting the Remote Volume slider updates external Connect device volume without affecting local PipeWire ducking.
result: pass

### 4. Live Crossfade Audio & CDP Sync
expected: Setting `Crossfade` (`0–12s`) in `SettingsTab` updates Official Spotify Client via CDP port `9229` and drives smooth `librespot` PipeWire boundary fades without overriding Sleep Timer lock or per-game ducking.
result: issue
reported: "Ja bij official werkt die maar bij libre heb ik het idee van niet want die kan vgm maar 1 nummer tegelijk streamen kunnen we dat fixen op een manier of helemaal niet het moet namelijk niet gek gaan klinken en anders setting uitzetten voor libre misschien"
severity: major

## Summary

total: 4
passed: 1
issues: 3
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-22-1
  truth: "Device rows with 40+ character Connect device names truncate cleanly with ellipsis in SteamOS CEF without wrapping or clipping Active or Fixed Volume badges, and local device status label accurately reflects non-Deck hardware (e.g. Steam Machine)."
  status: failed
  reason: "User reported: Ik zie active ja allen kan ik 40+ niet checken. want heb niks met zn lange naam. En er staat steam deck engine maar ik heb een steam machine"
  severity: minor
  test: 1
  artifacts: []
  missing: []

- gap_id: G-22-2
  truth: "Multiple Connect devices scroll smoothly inside DeckifyExpandedModal contentPaneRef while preserving flow-children=column D-pad focus navigation without duplicate/ambiguous local device entries."
  status: failed
  reason: "User reported: Ja vgm wel ja aleen zie ik dus wel 2 keer de naam van de Steammachine er tussen staan een keer met hoofletters andere keer zonder hoe zit dat."
  severity: minor
  test: 2
  artifacts: []
  missing: []

- gap_id: G-22-3
  truth: "Setting Crossfade (0–12s) in SettingsTab updates Official Spotify Client via CDP port 9229 and either provides true/non-jarring crossfade on librespot or clearly disables/scopes the setting to Official Spotify Client."
  status: failed
  reason: "User reported: Ja bij official werkt die maar bij libre heb ik het idee van niet want die kan vgm maar 1 nummer tegelijk streamen kunnen we dat fixen op een manier of helemaal niet het moet namelijk niet gek gaan klinken en anders setting uitzetten voor libre misschien"
  severity: major
  test: 4
  artifacts: []
  missing: []
