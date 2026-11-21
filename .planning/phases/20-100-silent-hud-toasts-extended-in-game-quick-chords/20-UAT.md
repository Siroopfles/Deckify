---
status: testing
phase: 20-100-silent-hud-toasts-extended-in-game-quick-chords
source: [20-VERIFICATION.md]
started: 2026-11-21T12:32:00Z
updated: 2026-11-21T12:32:00Z
---

## Current Test

number: 1
name: Silent HUD Banner Compositor Layering & Audio Silence (TOAST-01)
expected: |
  3.5-second SilentBanner renders cleanly above the active game window with zero audible Steam UI toast chime, zero controller focus or game input interception, and offsets by 140px when Mini Overlay HUD is visible in the same corner.
awaiting: user response

## Tests

### 1. Silent HUD Banner Compositor Layering & Audio Silence (TOAST-01)
On physical Steam Deck in Gaming Mode: disable Mini Overlay HUD (overlay_enabled: false), keep Track Change Notifications ON, Notification Sound OFF, Silent HUD Banner ON; launch a Vulkan/Gamescope game and skip tracks via Deckify or QAM, then re-enable Mini Overlay HUD in the same corner.
expected: 3.5-second SilentBanner renders cleanly above the active game window with zero audible Steam UI toast chime, zero controller focus or game input interception, and offsets by 140px when Mini Overlay HUD is visible in the same corner.
result: [pending]

### 2. Physical Controller Hardware Button Parity & Chord Safety (CHORD-01)
Bind custom chords (e.g. L4 + X for Like/Unlike, L5 for Cycle Pinned Playlists, R4 for Toggle Lyrics HUD), attempt STEAM/QAM + X/R1/L1, trigger chords in-game and with QAM open, open Deckify Expanded Modal to confirm suppression, and hold STEAM >4s before pressing D-pad Right.
expected: Hardware button indices match @decky/ui constants (STEAM=27, QAM=28, A=1, L4..R5=23..26), Valve reserved combos are rejected, in-game/QAM chords emit silent banners and optimistic updates/rollbacks, Expanded Modal pauses chords, and 4s guideHeld expiry prevents misfires.
result: [pending]

### 3. Live SteamOS GamepadUI CSS & D-Pad Focus Traversal (CHORD-01)
Open Deckify Settings -> Notifications & Controller Shortcuts -> In-Game Quick Chords and navigate rows/buttons with the D-pad while recording, clearing, resetting, and using Reset All Chords -> Confirm Reset / Keep Chords.
expected: Compact inline DialogButtons stay inline without crushing row titles/chips under SteamOS `.DialogButton { width: 100% }`, and D-pad spatial navigation traverses all horizontal strips cleanly.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
