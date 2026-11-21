---
status: diagnosed
trigger: "Investigate issue: in-game-chords-and-gamescope-overlay"
created: 2026-11-21T18:22:10Z
updated: 2026-11-21T18:28:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: All 4 reported symptoms in UAT Test 2 have confirmed root causes across chords defaults, STEAM button handling, in-game input capture, and Gamescope overlay composition.
test: Verified all 4 mechanisms directly in src/chords.ts, py_modules/common.py, src/components/tabs/ChordBindingsCard.tsx, src/index.tsx, src/components/DeckifyOverlay.tsx, src/components/SilentBanner.tsx, and @decky/ui SteamClient definitions.
expecting: N/A (diagnosis complete)
next_action: Return ROOT CAUSE FOUND to caller.

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: Hardware button indices match @decky/ui constants (STEAM=27, QAM=28, A=1, L4..R5=23..26), Valve reserved combos are rejected, in-game/QAM chords emit silent banners and optimistic updates/rollbacks, Expanded Modal pauses chords, and 4s guideHeld expiry prevents misfires.
actual: "Er staan standaard dingen controller actions ingesteld terwijl in discuss was afgesproken dat de user die zelf moest instellen. Combos met de STEAM button werken niet (beter om aan te geven als iemand probeert in te stellen via STEAM button dat dat niet werkt). Een combo werkt niet als ik in-game ben. Ook werkt de HUD met silent dingen niet in-game: alleen als er een stukje Steam UI in beeld komt (bijv. notificatie) dan werkt het wel, maar zodra de notificatie weg is gaat de HUD ook weer weg (ook als disappear HUD uitstaat). Tip: kijk hoe Steamcord (Decky Loader plugin) zijn overlay altijd zichtbaar houdt in-game."
errors: None reported
reproduction: Test 2 in UAT
started: Discovered during UAT

## Eliminated
<!-- APPEND only - prevents re-investigating -->

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-11-21T18:24:00Z
  checked: src/chords.ts (lines 77-86) and py_modules/common.py (lines 91-100, 257-293)
  found: DEFAULT_CHORD_BINDINGS pre-populates 5 actions (previous=[11,27], next=[12,27], play_pause=[1,27], volume_up=[9,27], volume_down=[10,27]) with STEAM/QAM (27) combos; only toggle_like, cycle_pinned, toggle_lyrics are [].
  implication: Violates user expectation that all controller actions start unbound for user configuration, and pre-populates broken STEAM-button combos.

- timestamp: 2026-11-21T18:25:00Z
  checked: src/chords.ts (lines 176-220) and src/components/tabs/ChordBindingsCard.tsx (lines 128-186)
  found: isValveReservedChord only blocks 2-button combos of [27/28/13/14, 3/5/6]. validateChordBinding and ChordBindingsCard allow recording/saving any other combo containing STEAM_GUIDE (27) or STEAM_QUICK_MENU (28) without warning, and both listen via FocusNavController.m_rgGamepadInputSources[0].
  implication: STEAM button presses are intercepted at the Steam/OS level (opening Steam menu / triggering Valve chords) so STEAM-button combos do not work, and the UI gives no warning when a user attempts to bind with the STEAM button.

- timestamp: 2026-11-21T18:26:00Z
  checked: src/index.tsx (lines 460-502) and node_modules/@decky/ui/dist/globals/steam-client/Input.d.ts (lines 41, 276-311)
  found: setupChordListener() only subscribes to FocusNavController.m_rgGamepadInputSources[0].RegisterForGamepadButtonDown/Up (Steam UI focus navigation). SteamClient.Input.RegisterForControllerInputMessages is not used, nor is any backend input listener.
  implication: When a game has focus in Gamescope, controller input is routed to the game and does not reach FocusNavController.m_rgGamepadInputSources[0], so in-game chords never fire.

- timestamp: 2026-11-21T18:27:00Z
  checked: src/index.tsx (lines 1573-1626), src/components/DeckifyOverlay.tsx, src/components/SilentBanner.tsx, and @decky/ui SteamClient Overlay.d.ts / Window.d.ts / shared.d.ts
  found: DeckifyOverlay and SilentBanner are mounted solely via routerHook.addGlobalComponent("DeckifyOverlay", ...) as fixed-position DOM elements inside Steam's GamepadUI CEF window. No Gamescope external overlay window/atom or SteamClient.Window.SetComposition / SteamClient.Overlay.SetOverlayState (EUIComposition.Notification) management exists.
  implication: Gamescope hides/uncomposites the SteamUI CEF plane (EUIComposition.Hidden=0) during gameplay unless a native Steam toast/menu/modal triggers Notification/Overlay composition. Thus DeckifyOverlay and SilentBanner only appear while another Steam UI element is on screen and vanish immediately when it closes.

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: "1) DEFAULT_CHORD_BINDINGS in src/chords.ts and py_modules/common.py pre-populates 5 actions with STEAM-button (27) combos instead of leaving all 8 actions unbound ([]) by default; 2) validateChordBinding (src/chords.ts) and ChordBindingsCard.tsx allow STEAM_GUIDE (27) / STEAM_QUICK_MENU (28) in user bindings without warning, even though Steam intercepts the STEAM button at the OS/SteamUI level; 3) setupChordListener() in src/index.tsx relies solely on FocusNavController.m_rgGamepadInputSources[0].RegisterForGamepadButtonDown/Up, which only receives input when Steam UI has focus and not when a game is focused in Gamescope (unlike SteamClient.Input.RegisterForControllerInputMessages or a backend input hook); 4) DeckifyOverlay and SilentBanner only render as DOM elements via routerHook.addGlobalComponent inside Steam's GamepadUI CEF window, which Gamescope uncomposites (EUIComposition.Hidden) during gameplay unless a native Steam notification/UI is active — unlike plugins that use a dedicated Gamescope overlay surface (e.g., Steamcord's external overlay window) or manage SteamUI Notification composition."
fix:
verification:
files_changed: []
