---
status: complete
phase: 18-mpris2-d-bus-bridge
source: [18-VERIFICATION.md]
started: 2026-11-18T16:39:27Z
updated: 2026-11-18T17:13:34.669Z
---

## Current Test

[testing complete]

## Tests

### 1. On-Device SteamOS D-Bus Registration & BlueZ mpris-proxy Badge
expected: On a Steam Deck running SteamOS 3.5+ with a paired Bluetooth headset/earbuds, open Deckify Settings -> Bluetooth & Media Controls (MPRIS2). `org.mpris.MediaPlayer2.deckify` is registered on `/run/user/1000/bus`, BlueZ `mpris-proxy` is running under UID 1000 (`deck`), and the SettingsTab badge displays `Active (Bluetooth Ready)` in green (`#1db954`).
result: pass

### 2. Bluetooth Headset AVRCP Playback Control & Metadata Display
expected: Press Play, Pause, Play/Pause, Next, and Previous buttons on the connected Bluetooth headset/earbuds, and check the headset/car display or `playerctl` metadata. Deckify playback responds immediately to each AVRCP button press, and connected Bluetooth devices/D-Bus controllers display current track title, artist, album, artwork, and playback status.
result: pass
notes: "User verified Play/Pause and Skip on Bluetooth headset on Steam Deck; live dbus-send Properties.GetAll on deck@192.168.178.208 confirmed PlaybackStatus, Metadata (xesam:title, xesam:artist, xesam:album, mpris:length, mpris:trackid, file:// mpris:artUrl), Position, and Can* flags."

## Summary

total: 2
passed: 2
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
