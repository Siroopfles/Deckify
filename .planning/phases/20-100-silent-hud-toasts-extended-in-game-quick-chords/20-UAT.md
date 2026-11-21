---
status: diagnosed
phase: 20-100-silent-hud-toasts-extended-in-game-quick-chords
source: [20-VERIFICATION.md]
started: 2026-11-21T12:32:00Z
updated: 2026-11-21T19:24:10Z
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
  root_cause: "1) DeckifyOverlayWrapper in src/index.tsx:1575 computes bannerPosition = settings?.overlay_position || settings?.toast_position || 'top-right', so overlay_position (default 'top-right') always shadows toast_position, and the corner picker UI in SettingsTab.tsx:1345 is gated behind overlay_enabled. 2) handleTrackMetadataNotification in src/index.tsx:333-343 gates emitBanner on !toastSoundEnabled, falling back to Steam's toaster.toast() when notification sound is enabled instead of playing a configurable, volume-linked non-Steam chime."
  artifacts:
    - path: "src/index.tsx"
      issue: "overlay_position shadows toast_position for bannerPosition; !toastSoundEnabled gates out SilentBanner and falls back to toaster.toast()"
    - path: "src/components/tabs/SettingsTab.tsx"
      issue: "Corner picker is gated behind overlay_enabled; no independent notification corner selector"
    - path: "py_modules/common.py"
      issue: "No dedicated silent_banner_position setting or clear precedence"
  missing:
    - "Expose independent notification/SilentBanner corner selector in SettingsTab regardless of overlay_enabled and prioritize it in DeckifyOverlayWrapper"
    - "Keep SilentBanner active when toast_sound_enabled is true (no Steam native toast fallback) and play a configurable subtle non-Steam chime scaled by the Deckify volume slider"
  debug_session: .planning/debug/silent-banner-corner-and-sound.md

- gap_id: G-20-2
  truth: "Controller chords work reliably in-game, default bindings respect discuss decision, STEAM button binding warns user, and SilentBanner/HUD overlay stays visible in-game above Gamescope without requiring Steam UI toast"
  status: failed
  reason: "User reported: Er staan standaard dingen controller actions ingesteld terwijl in discuss was afgesproken dat de user die zelf moest instellen. Combos met de STEAM button werken niet (beter om aan te geven als iemand probeert in te stellen via STEAM button dat dat niet werkt). Een combo werkt niet als ik in-game ben. Ook werkt de HUD met silent dingen niet in-game: alleen als er een stukje Steam UI in beeld komt (bijv. notificatie) dan werkt het wel, maar zodra de notificatie weg is gaat de HUD ook weer weg (ook als disappear HUD uitstaat). Tip: kijk hoe Steamcord (Decky Loader plugin) zijn overlay altijd zichtbaar houdt in-game."
  severity: major
  test: 2
  root_cause: "1) DEFAULT_CHORD_BINDINGS in src/chords.ts:77-86 and py_modules/common.py:91-100 pre-populates 5 actions with [..., 27] instead of leaving all 8 actions unbound ([]). 2) validateChordBinding (src/chords.ts:188-220) and ChordBindingsCard.tsx do not warn/reject when user attempts to bind with STEAM_GUIDE (27) / STEAM_QUICK_MENU (28) outside the 3 Valve-reserved pairs. 3) setupChordListener() in src/index.tsx:460-502 listens only on FocusNavController.m_rgGamepadInputSources[0], which stops receiving events when a game is focused in Gamescope (unlike SteamClient.Input.RegisterForControllerInputMessages). 4) DeckifyOverlay and SilentBanner are only mounted inside SteamUI's GamepadUI DOM via routerHook.addGlobalComponent, which Gamescope uncomposites (EUIComposition.Hidden) whenever no Steam UI element is active."
  artifacts:
    - path: "src/chords.ts"
      issue: "DEFAULT_CHORD_BINDINGS pre-populates 5 actions; validateChordBinding lacks STEAM/QAM button warning"
    - path: "py_modules/common.py"
      issue: "DEFAULT_CHORD_BINDINGS pre-populates 5 actions"
    - path: "src/components/tabs/ChordBindingsCard.tsx"
      issue: "Recorder does not warn user when STEAM button is pressed"
    - path: "src/index.tsx"
      issue: "setupChordListener uses FocusNavController only (fails in-game); DeckifyOverlayWrapper has no Gamescope EUIComposition/overlay visibility handling"
  missing:
    - "Set all 8 DEFAULT_CHORD_BINDINGS entries to [] in src/chords.ts and py_modules/common.py"
    - "Warn/reject in validateChordBinding and ChordBindingsCard when user attempts to record with STEAM/QAM button"
    - "Subscribe to SteamClient.Input.RegisterForControllerInputMessages in setupChordListener (with FocusNavController fallback) so chords work in-game"
    - "Ensure DeckifyOverlay and SilentBanner remain composited in-game above Gamescope (e.g. EUIComposition.Notification / SteamClient.Overlay or external Gamescope overlay surface)"
  debug_session: .planning/debug/in-game-chords-and-gamescope-overlay.md
