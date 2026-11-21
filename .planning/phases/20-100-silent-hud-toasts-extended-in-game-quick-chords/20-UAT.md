---
status: testing
phase: 20-100-silent-hud-toasts-extended-in-game-quick-chords
source: [20-VERIFICATION.md]
started: 2026-11-21T22:52:00Z
updated: 2026-11-21T22:52:00Z
---

## Current Test

number: 1
name: Silent HUD Banner Corner, Volume-Scaled Chime & Gamescope Compositor Layering (G-20-1 & G-20-2)
expected: |
  3.5-second SilentBanner renders above the active game window via EUIComposition.Notification (1) in bottom-left even with Mini Overlay HUD off, plays zero Steam chime when Notification Sound is OFF, plays the subtle Web Audio chime scaled by Deckify volume (never Steam native toast) when Notification Sound is ON, and offsets by 140px when Mini Overlay HUD is visible in the same corner.
awaiting: user response

## Tests

### 1. Silent HUD Banner Corner, Volume-Scaled Chime & Gamescope Compositor Layering (G-20-1 & G-20-2)
On physical Steam Deck in Gaming Mode (G-20-1 & G-20-2), disable Mini Overlay HUD (overlay_enabled: false), set Notification / Banner Corner to bottom-left, keep Track Change Notifications ON and Silent HUD Banner ON, launch a Vulkan/Gamescope game, skip tracks with Notification Sound OFF then ON, and finally re-enable Mini Overlay HUD in bottom-left.
expected: 3.5-second SilentBanner renders above the active game window via EUIComposition.Notification (1) in bottom-left even with Mini Overlay HUD off, plays zero Steam chime when Notification Sound is OFF, plays the subtle Web Audio chime scaled by Deckify volume (never Steam native toast) when Notification Sound is ON, and offsets by 140px when Mini Overlay HUD is visible in the same corner.
result: [pending]

### 2. Physical Controller Unbound Defaults, STEAM Rejection & In-Game Chord Execution (G-20-2)
On physical Steam Deck in Gaming Mode (G-20-2), verify all 8 In-Game Quick Chords rows start Unbound, attempt to record a combo using the STEAM or (...) button, then bind L4 + X for Like/Unlike, L5 for Cycle Pinned Playlists, and R4 for Toggle Lyrics HUD, and trigger them while actively playing a game.
expected: All 8 actions default to Unbound; pressing STEAM/QAM immediately cancels recording with the inline SteamOS interception warning; SteamClient.Input.RegisterForControllerInputMessages delivers rear-paddle + face button events in-game so chords trigger optimistic updates/rollbacks and SilentBanner confirmations above Gamescope; Expanded Modal suppresses chords.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
