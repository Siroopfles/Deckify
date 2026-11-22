---
status: diagnosed
phase: 22-spotify-connect-hub-2-0-native-crossfade
source: [22-VERIFICATION.md]
started: 2026-11-22T12:43:35Z
updated: 2026-11-22T16:36:00Z
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
  root_cause: "Hardcoded 'Steam Deck Engine', 'Pull Playback to Steam Deck', ' · This Deck', and 'Steam Deck' strings in DevicesTab.tsx without host hardware/platform detection in get_devices(); plus InteractiveRow lacks minWidth: 0 / boxSizing: border-box and Fixed Volume / Active badges lack whiteSpace: nowrap."
  artifacts:
    - path: "src/components/tabs/DevicesTab.tsx"
      issue: "Hardcoded Steam Deck labels and missing whiteSpace: nowrap on badges"
    - path: "src/components/common/InteractiveRow.tsx"
      issue: "Missing minWidth: 0 and boxSizing: border-box on row container"
    - path: "py_modules/rpc_playback.py"
      issue: "get_devices() does not detect/return host hardware platform label"
    - path: "src/types.ts"
      issue: "DevicesResponse lacks optional hardware/platform label field"
  missing:
    - "Detect host hardware (Steam Deck vs Steam Machine / Local Device) in get_devices() and expose via DevicesResponse"
    - "Replace hardcoded Steam Deck strings in DevicesTab.tsx with detected hardware label"
    - "Add minWidth: 0 / boxSizing: border-box to InteractiveRow and whiteSpace: nowrap to badges"
  debug_session: .planning/debug/g-22-1-local-device-label-and-truncation.md

- gap_id: G-22-2
  truth: "Multiple Connect devices scroll smoothly inside DeckifyExpandedModal contentPaneRef while preserving flow-children=column D-pad focus navigation without duplicate/ambiguous local device entries."
  status: failed
  reason: "User reported: Ja vgm wel ja aleen zie ik dus wel 2 keer de naam van de Steammachine er tussen staan een keer met hoofletters andere keer zonder hoe zit dat."
  severity: minor
  test: 2
  root_cause: "DevicesTab renders both a non-selectable LocalDeckStatusCard (using lowercase socket.gethostname() from get_devices) and the unfiltered me/player/devices list as selectable DeviceRow items (which includes the local device, and Official Spotify Client registers with OS capitalization), causing the local machine to appear twice—one selectable and one not."
  artifacts:
    - path: "src/components/tabs/DevicesTab.tsx"
      issue: "Renders both LocalDeckStatusCard and unfiltered local DeviceRow entries"
    - path: "py_modules/rpc_playback.py"
      issue: "get_devices returns raw me/player/devices without deduplicating/marking local device entries cleanly"
  missing:
    - "Filter or deduplicate local device entries from the remote DeviceRow list (or unify local card & Connect entry) with clear hardware/engine context"
  debug_session: .planning/debug/g-22-2-duplicate-connect-device-entries.md

- gap_id: G-22-3
  truth: "Setting Crossfade (0–12s) in SettingsTab updates Official Spotify Client via CDP port 9229 and either provides true/non-jarring crossfade on librespot or clearly disables/scopes the setting to Official Spotify Client."
  status: failed
  reason: "User reported: Ja bij official werkt die maar bij libre heb ik het idee van niet want die kan vgm maar 1 nummer tegelijk streamen kunnen we dat fixen op een manier of helemaal niet het moet namelijk niet gek gaan klinken en anders setting uitzetten voor libre misschien"
  severity: major
  test: 4
  root_cause: "librespot outputs a single PulseAudio/PipeWire stream with no dual-track mixer or native crossfade; Deckify's PipeWire dip-to-silence workaround (_maybe_trigger_local_crossfade) only ducks to 0% silence and is called inside _poll_playback() on a 20s relaxed poll interval, missing track boundaries; and CrossfadeSettingRow in SettingsTab.tsx is always enabled regardless of audio_backend."
  artifacts:
    - path: "src/components/tabs/SettingsTab.tsx"
      issue: "CrossfadeSettingRow is always enabled even when audio_backend is librespot"
    - path: "main.py"
      issue: "_maybe_trigger_local_crossfade attempts single-sink PipeWire dip-to-silence on 20s poll"
    - path: "py_modules/volume.py"
      issue: "trigger_crossfade_out/in single-sink dip-to-silence helper"
  missing:
    - "Scope/disable CrossfadeSettingRow in SettingsTab.tsx when audio_backend !== 'spotify_client' with clear explanation"
    - "Disable/remove librespot PipeWire dip-to-silence fallback in _maybe_trigger_local_crossfade so librespot track transitions are never unexpectedly muted"
  debug_session: .planning/debug/g-22-3-librespot-crossfade-behavior.md
