---
status: complete
phase: 20-100-silent-hud-toasts-extended-in-game-quick-chords
source: [20-VERIFICATION.md]
started: 2026-11-21T12:32:00Z
updated: 2026-11-21T18:20:31.077Z
---

## Current Test

[testing complete]

## Tests

### 1. Silent HUD Banner Compositor Layering & Audio Silence (TOAST-01)
On physical Steam Deck in Gaming Mode: disable Mini Overlay HUD (overlay_enabled: false), keep Track Change Notifications ON, Notification Sound OFF, Silent HUD Banner ON; launch a Vulkan/Gamescope game and skip tracks via Deckify or QAM, then re-enable Mini Overlay HUD in the same corner.
expected: 3.5-second SilentBanner renders cleanly above the active game window with zero audible Steam UI toast chime, zero controller focus or game input interception, and offsets by 140px when Mini Overlay HUD is visible in the same corner.
result: issue
reported: "Hoor geen steam audio als de instelling uitstaat dus das goed. Offset werkt ook. Kan alleen de corner van alleen de notificatie niet aanpassen dus das beetje apart. Ook moeten de silent hud meldingen als notificatie geluid aanstaat misschien een apart geluidje afspelen, want dan krijg wel notificatie vanuit steam."
severity: minor

### 2. Physical Controller Hardware Button Parity & Chord Safety (CHORD-01)
Bind custom chords (e.g. L4 + X for Like/Unlike, L5 for Cycle Pinned Playlists, R4 for Toggle Lyrics HUD), attempt STEAM/QAM + X/R1/L1, trigger chords in-game and with QAM open, open Deckify Expanded Modal to confirm suppression, and hold STEAM >4s before pressing D-pad Right.
expected: Hardware button indices match @decky/ui constants (STEAM=27, QAM=28, A=1, L4..R5=23..26), Valve reserved combos are rejected, in-game/QAM chords emit silent banners and optimistic updates/rollbacks, Expanded Modal pauses chords, and 4s guideHeld expiry prevents misfires.
result: issue
reported: "Er staan standaard dingen controller actions ingesteld terwijl in discuss was afgesproken dat de user die zelf moest instellen. Combos met de STEAM button werken niet (beter om aan te geven als iemand probeert in te stellen via STEAM button dat dat niet werkt). Een combo werkt niet als ik in-game ben. Ook werkt de HUD met silent dingen niet in-game: alleen als er een stukje Steam UI in beeld komt (bijv. notificatie) dan werkt het wel, maar zodra de notificatie weg is gaat de HUD ook weer weg (ook als disappear HUD uitstaat). Tip: kijk hoe Steamcord (Decky Loader plugin) zijn overlay altijd zichtbaar houdt in-game."
severity: major

### 3. Live SteamOS GamepadUI CSS & D-Pad Focus Traversal (CHORD-01)
Open Deckify Settings -> Notifications & Controller Shortcuts -> In-Game Quick Chords and navigate rows/buttons with the D-pad while recording, clearing, resetting, and using Reset All Chords -> Confirm Reset / Keep Chords.
expected: Compact inline DialogButtons stay inline without crushing row titles/chips under SteamOS `.DialogButton { width: 100% }`, and D-pad spatial navigation traverses all horizontal strips cleanly.
result: pass

## Summary

total: 3
passed: 1
issues: 2
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-20-1
  truth: "SilentBanner renders cleanly in a configurable corner without falling back to Steam native toast popup when notification sound is desired"
  status: failed
  reason: "User reported: Hoor geen steam audio als de instelling uitstaat dus das goed. Offset werkt ook. Kan alleen de corner van alleen de notificatie niet aanpassen dus das beetje apart. Ook moeten de silent hud meldingen als notificatie geluid aanstaat misschien een apart geluidje afspelen, want dan krijg wel notificatie vanuit steam."
  severity: minor
  test: 1
  artifacts: []
  missing: []

- gap_id: G-20-2
  truth: "Controller chords work reliably in-game, default bindings respect discuss decision, STEAM button binding warns user, and SilentBanner/HUD overlay stays visible in-game above Gamescope without requiring Steam UI toast"
  status: failed
  reason: "User reported: Er staan standaard dingen controller actions ingesteld terwijl in discuss was afgesproken dat de user die zelf moest instellen. Combos met de STEAM button werken niet (beter om aan te geven als iemand probeert in te stellen via STEAM button dat dat niet werkt). Een combo werkt niet als ik in-game ben. Ook werkt de HUD met silent dingen niet in-game: alleen als er een stukje Steam UI in beeld komt (bijv. notificatie) dan werkt het wel, maar zodra de notificatie weg is gaat de HUD ook weer weg (ook als disappear HUD uitstaat). Tip: kijk hoe Steamcord (Decky Loader plugin) zijn overlay altijd zichtbaar houdt in-game."
  severity: major
  test: 2
  artifacts: []
  missing: []
