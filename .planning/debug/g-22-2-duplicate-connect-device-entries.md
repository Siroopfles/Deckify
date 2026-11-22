---
status: diagnosed
trigger: "Investigate issue: g-22-2-duplicate-connect-device-entries — Multiple Connect devices scroll smoothly inside DeckifyExpandedModal contentPaneRef while preserving flow-children=column D-pad focus navigation without duplicate/ambiguous local device entries."
created: 2026-11-22T15:33:03Z
updated: 2026-11-22T15:35:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: "Confirmed: DevicesTab renders both a non-selectable LocalDeckStatusCard (showing local_device_name from socket.gethostname(), e.g. lowercase 'bazzite', labeled 'Steam Deck Engine') AND the raw Spotify me/player/devices list as selectable DeviceRow items without filtering/deduplicating the local device; additionally, Official Spotify Client registers with OS-capitalized hostname (e.g. 'Bazzite') while librespot/get_devices uses lowercase socket.gethostname() ('bazzite')."
test: "Static trace of DevicesTab.tsx, rpc_playback.py, and main.py"
expecting: "Confirmed in code"
next_action: "Return ROOT CAUSE FOUND to orchestrator"
bug_class: Bohrbug
reasoning_checkpoint:
  hypothesis: "Duplicate/ambiguous local device entries with differing capitalization and selectability occur because (1) DevicesTab renders LocalDeckStatusCard as a non-focusable div at the top AND renders all raw me/player/devices entries (including the local device) as selectable DeviceRow items below it, and (2) local_device_name / librespot --name defaults to socket.gethostname() (lowercase 'bazzite') while Official Spotify Client (launched without --name) registers its Connect name using capitalized OS/pretty hostname ('Bazzite')."
  confirming_evidence:
    - "src/components/tabs/DevicesTab.tsx:72-138 & 448-455: LocalDeckStatusCard is a non-focusable <div> displaying localDeviceName and 'Steam Deck Engine · {engineStatus}'."
    - "src/components/tabs/DevicesTab.tsx:460-479: DevicesTab maps over raw devices from get_devices without filtering out isLocalDevice(d, localDeviceName) or deduplicating stale/secondary local Connect entries."
    - "py_modules/rpc_playback.py:466 & main.py:629: local_device_name and librespot --name use settings.get('device_name') or socket.gethostname() (lowercase 'bazzite' on Bazzite)."
    - "main.py:562-570: start_spotify_client launches Flatpak Spotify without any --name argument, so Spotify Desktop registers its own Connect name (e.g. capitalized 'Bazzite')."
  falsification_test: "If DevicesTab filtered localDevice from the DeviceRow list (or made LocalDeckStatusCard the sole local representation) and normalized/deduplicated local Connect entries, only one local entry would appear."
  fix_rationale: "Deduplicating/filtering the local device from the remote Connect list (or unifying LocalDeckStatusCard with the local DeviceRow) and normalizing local device naming/matching eliminates both the duplicate entry and the selectable-vs-non-selectable confusion."
  blind_spots: "Did not inspect live Spotify me/player/devices JSON payload on the user's Bazzite machine, so exact capitalization of the Official Spotify Client entry ('Bazzite' vs 'BAZZITE') is inferred from Linux pretty-hostname behavior and user report."
  candidate_causes:
    - "code: DevicesTab.tsx renders both LocalDeckStatusCard (non-selectable div) and the unfiltered devices[] list containing the local device (selectable DeviceRow)"
    - "environment/data: Linux socket.gethostname() is lowercase ('bazzite') while Official Spotify Client Connect registration uses capitalized hostname ('Bazzite') and/or stale Connect session remains visible briefly after engine switch"
  and_gate: "yes — UI rendering both LocalDeckStatusCard and the unfiltered local DeviceRow explains the duplicate + 'one selectable, one not' symptom, while the hostname casing difference between socket.gethostname()/librespot and Official Spotify Client explains why one appears lowercase and the other capitalized."

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: Multiple Connect devices scroll smoothly inside `DeckifyExpandedModal` `contentPaneRef` while preserving `flow-children="column"` D-pad focus navigation without duplicate/ambiguous local device entries.
actual: User reported: "Ja vgm wel ja aleen zie ik dus wel 2 keer de naam van de Steammachine er tussen staan een keer met hoofletters andere keer zonder hoe zit dat." (And follow-up on Test 3: "alleen of over dat steam os en de bazzite is dat niet een beetj on obverzichterlijk en eentje kan ik selecteren en de andere niet")
errors: None reported
reproduction: Test 2 in UAT (22-UAT.md)
started: Discovered during UAT

## Eliminated
<!-- APPEND only - prevents re-investigating -->

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-11-22T15:34:00Z
  checked: py_modules/rpc_playback.py:457-497 (get_devices and _match_local_device)
  found: get_devices returns raw Spotify me/player/devices list plus local_device_name = settings.get("device_name") or socket.gethostname(). _match_local_device matches case-insensitively.
  implication: Backend does not deduplicate or filter the local device out of devices[], and defaults local_device_name to raw socket.gethostname() (lowercase 'bazzite' on Bazzite).

- timestamp: 2026-11-22T15:34:30Z
  checked: main.py:562-570 (start_spotify_client) and main.py:627-634 (start_librespot)
  found: start_librespot passes "--name", settings.get("device_name") or socket.gethostname() (lowercase 'bazzite'). start_spotify_client launches Flatpak Spotify with no --name flag, so Spotify Desktop uses its own OS-derived Connect name (e.g. capitalized 'Bazzite').
  implication: Local engine name differs in casing between socket.gethostname()/librespot and Official Spotify Client, and switching engines can also leave a brief stale Connect entry in me/player/devices.

- timestamp: 2026-11-22T15:35:00Z
  checked: src/components/tabs/DevicesTab.tsx:72-138, 223-293, 448-480
  found: DevicesTab renders LocalDeckStatusCard (a non-focusable <div> showing localDeviceName and "Steam Deck Engine · {engineStatus}") AND immediately below it renders <Focusable flow-children="column"> mapping over all devices[] (including the local device) as selectable InteractiveRow (<DeviceRow>).
  implication: Directly explains both user observations: (1) local machine appears twice (once in LocalDeckStatusCard as lowercase 'bazzite' / 'Steam Deck Engine', once in DeviceRow as 'Bazzite' from me/player/devices), and (2) one entry is selectable (DeviceRow InteractiveRow) while the other is not (LocalDeckStatusCard <div>).

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: "DevicesTab renders both a non-selectable LocalDeckStatusCard (using local_device_name from socket.gethostname(), e.g. lowercase 'bazzite', labeled 'Steam Deck Engine') and the unfiltered Spotify me/player/devices list as selectable DeviceRow items (which also includes the local device); combined with Official Spotify Client registering its Connect name with OS capitalization (e.g. 'Bazzite') while librespot/get_devices uses lowercase socket.gethostname(), the local Steam Machine appears twice with different casing—one selectable and one not."
fix: ""
verification: ""
files_changed: []
