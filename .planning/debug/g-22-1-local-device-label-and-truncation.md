---
status: diagnosed
trigger: "Investigate issue: g-22-1-local-device-label-and-truncation"
created: 2026-11-22T15:31:32Z
updated: 2026-11-22T15:33:00Z
---

## Current Focus

hypothesis: Hardware label issue is caused by hardcoded "Steam Deck Engine" / "This Deck" / "Pull Playback to Steam Deck" strings in DevicesTab.tsx combined with no hardware detection in py_modules/rpc_playback.py:get_devices(). Truncation could not be observed in UAT due to lack of a 40+ char device on user's LAN, while DeviceRow also lacks whiteSpace: "nowrap" on Fixed Volume / Active badges and minWidth: 0 / boxSizing: "border-box" on InteractiveRow.
test: Verified source code in DevicesTab.tsx, InteractiveRow.tsx, rpc_playback.py, types.ts, eco.py, and DevicesTab.test.tsx.
expecting: N/A (goal: find_root_cause_only)
next_action: Return ROOT CAUSE FOUND to caller.
bug_class: Bohrbug
candidate_causes:
  - "code: DevicesTab.tsx hardcodes 'Steam Deck Engine', 'Pull Playback to Steam Deck', 'This Deck', and 'Steam Deck' in toasts/empty-state; rpc_playback.py:get_devices() does not detect or return hardware platform label; DeviceRow badges lack whiteSpace: 'nowrap' and InteractiveRow lacks minWidth: 0 / boxSizing: 'border-box'."
  - "environment/data: User is running Deckify on a Steam Machine (non-Deck hardware) and had no 40+ character Connect device name on their LAN during UAT."
and_gate: "Yes — the Steam Deck label bug requires both non-Deck hardware (Steam Machine) and hardcoded 'Steam Deck' strings without backend hardware detection. The truncation UAT gap is due to no 40+ char device in the test environment plus minor CSS hardening gaps in DeviceRow."

## Symptoms

expected: Device rows with 40+ character Connect device names truncate cleanly with ellipsis in SteamOS CEF without wrapping or clipping `Active` or `Fixed Volume` badges, and local device status label accurately reflects non-Deck hardware (e.g. Steam Machine).
actual: User reported: "Ik zie active ja allen kan ik 40+ niet checken. want heb niks met zn lange naam. En er staat steam deck engine maar ik heb een steam machine"
errors: None reported
reproduction: Test 1 in UAT (22-UAT.md)
started: Discovered during UAT

## Eliminated

## Evidence

- timestamp: 2026-11-22T15:32:00Z
  checked: src/components/tabs/DevicesTab.tsx (lines 123, 133, 194, 266, 380-385)
  found: Hardcoded strings: "Steam Deck Engine" (line 123), "Pull Playback to Steam Deck" (line 133), "Steam Deck engine" (line 194), " · This Deck" (line 266), "Playback pulled to Steam Deck" / "Could not pull playback to Steam Deck..." (lines 380-385).
  implication: UI unconditionally labels the local hardware as "Steam Deck" / "This Deck" regardless of actual host hardware.

- timestamp: 2026-11-22T15:32:15Z
  checked: py_modules/rpc_playback.py (lines 457-481) and src/types.ts (lines 335-343)
  found: get_devices() returns ok, devices, local_device_name, audio_backend, engine_running, engine_sleeping — no hardware/platform identifier or label field exists in DevicesResponse.
  implication: Backend never informs the frontend whether the host is a Steam Deck (Jupiter/Galileo) vs Steam Machine / desktop Linux.

- timestamp: 2026-11-22T15:32:30Z
  checked: py_modules/eco.py (lines 22-50) and codebase search for DMI/hardware detection
  found: Only eco.py distinguishes Steam Machine / desktop from Steam Deck by checking /sys/class/power_supply for type=="Battery"; no DMI product_name/board_name detection exists anywhere in py_modules/.
  implication: Hardware detection helper can read DMI (/sys/devices/virtual/dmi/id/product_name or board_name) and/or power_supply battery presence to classify "Steam Deck" vs "Steam Machine" vs generic "Local Device".

- timestamp: 2026-11-22T15:32:45Z
  checked: src/components/tabs/DevicesTab.tsx (lines 223-293) and src/components/common/InteractiveRow.tsx (lines 139-152)
  found: DeviceRow has minWidth: 0, flex: 1 on inner wrappers and whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" on device.name span, and flexShrink: 0 on the right-hand badges container. However: (1) InteractiveRow does not set minWidth: 0 or boxSizing: "border-box" / maxWidth: "100%", (2) Fixed Volume (line 274) and Active (line 288) badges lack whiteSpace: "nowrap", and (3) user had no 40+ char Connect device on LAN during UAT.
  implication: Adding whiteSpace: "nowrap" to badges and minWidth: 0 / boxSizing: "border-box" to InteractiveRow prevents any badge wrapping or flex-item expansion in CEF, and a unit/CSS test or mock long-name check can verify 40+ char truncation.

## Resolution

root_cause: "Hardcoded 'Steam Deck Engine' / 'This Deck' / 'Pull Playback to Steam Deck' labels in src/components/tabs/DevicesTab.tsx with no host hardware detection in py_modules/rpc_playback.py:get_devices() (coupled with running on Steam Machine hardware); additionally, DeviceRow's InteractiveRow lacks minWidth: 0 / boxSizing: 'border-box' and its Fixed Volume / Active badges lack whiteSpace: 'nowrap' (while UAT could not observe 40+ char truncation due to no 40+ char Connect device on the user's LAN)."
fix: 
verification: 
files_changed: []
