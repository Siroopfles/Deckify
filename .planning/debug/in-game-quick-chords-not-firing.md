---
status: diagnosed
trigger: "UAT gap G-20-3 for Phase 20 (Deckify): Quick chords configured in settings (3 bound) do not fire when outside the menu / in-game."
created: 2026-11-21T23:11:24Z
updated: 2026-11-21T23:13:30Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: Confirmed — `setupChordListener()` in `src/index.tsx` relies solely on frontend `SteamClient.Input.RegisterForControllerInputMessages` with a single 3-arg callback signature, which (1) delivers 0 events in SteamOS SharedJSContext while a game has focus, and (2) drops events if SteamOS invokes the callback with the array-of-`{nA, bS}` signature.
test: Verified against Steamcord's deployed implementation on the target Steam Machine (`<STEAM_MACHINE_IP>`) and Deckify's live `settings.json`.
expecting: N/A (diagnosis complete).
next_action: Return ROOT CAUSE FOUND to orchestrator (diagnose-only mode).

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: All 8 actions default to Unbound; pressing STEAM/QAM immediately cancels recording with the inline SteamOS interception warning; SteamClient.Input.RegisterForControllerInputMessages delivers rear-paddle + face button events in-game so chords trigger optimistic updates/rollbacks and SilentBanner confirmations above Gamescope; Expanded Modal suppresses chords.
actual: "Yes hij blokeert op steam en qam button dus das goed. Alleen werken de quick chords die ik instel niet ik heb er namelijk 3 ingesteld en als ik uit het menu ben werken ze niet" (STEAM/QAM blocking works, but the 3 configured quick chords do not fire when outside the menu).
errors: None reported by user (silent non-triggering).
reproduction: Configure 3 quick chords in Deckify settings, exit the menu, press the configured chords in-game / outside the menu.
started: Phase 20 UAT Test 2.

## Eliminated
<!-- APPEND only - prevents re-investigating -->

- hypothesis: Settings persistence or live propagation from `ChordBindingsCard.tsx` / `SettingsTab.tsx` to `src/index.tsx` (`cachedBindings` / `activeChordMatcher`) is broken.
  evidence: Live `/home/deck/homebrew/settings/Deckify/settings.json` on the Steam Machine contains `gamepad_chords_enabled: true` and all 3 configured chords (`previous: [23, 24]`, `next: [25, 26]`, `play_pause: [24, 26]`). `SettingsTab.tsx:271-292` calls `backendSetSetting("gamepad_chord_bindings", fullNext)`, `main.py:908` emits `settings_changed`, and `src/index.tsx:194-197,1710-1712` calls `activeChordMatcher?.setBindings(cachedBindings)`.
  timestamp: 2026-11-21T23:12:40Z

- hypothesis: `bigOpen` or `isChordRecordingActive()` remains stuck `true` after exiting Settings / Expanded Modal, suppressing chords.
  evidence: `openExpandedView` (`src/index.tsx:142-152`) resets `setModalOpenState(false)` in `closeModal`; `ChordBindingsCard.tsx:88-105` resets `setChordRecordingActive(false)` on save, cancel, timeout, and unmount.
  timestamp: 2026-11-21T23:12:58Z

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-11-21T23:11:52Z
  checked: `/home/deck/homebrew/settings/Deckify/settings.json` on `<STEAM_MACHINE_IP>`
  found: `device_name: "steammachine"`, `gamepad_chords_enabled: true`, `silent_banner_enabled: false`, `gamepad_chord_bindings: { previous: [23, 24], next: [25, 26], play_pause: [24, 26], ... }`.
  implication: Recording and persistence worked; rear-paddle bindings L4+L5, R4+R5, L5+R5 are saved.

- timestamp: 2026-11-21T23:12:06Z
  checked: `/home/deck/homebrew/plugins/Steamcord/dist/index.js` (lines 9043-9067, 9205-9207, 9282-9294, 9503-9585)
  found: (1) Steamcord handles dual `RegisterForControllerInputMessages` signatures (`Array.isArray(args[0])` of `{ nA, bS }` vs `(idx, btn, pressed)`), `RegisterForControllerStateChanges` fallback, lowercase `reg.unregister()`, and sleep/resume re-subscription. (2) Steamcord maps D-pad `20..23` in addition to `4..7` for Steam Controller 2026. (3) Steamcord documents issue #60: Steam stops delivering `RegisterForControllerInputMessages` to the frontend whenever a game has focus, so Steamcord reads Valve controllers (`hidraw`) and standard/virtual gamepads (`evdev`) passively in its Python backend (`input_watch.py`).
  implication: Frontend-only `RegisterForControllerInputMessages` cannot receive button events while a game has focus, and single-signature `(idx, btn, pressed)` drops array-form `{ nA, bS }` messages even in Steam UI.

- timestamp: 2026-11-21T23:12:26Z
  checked: `/home/deck/homebrew/plugins/Steamcord/input_watch.py` (lines 540-620) and `/sys/class/hidraw/hidraw*/device/uevent` on `<STEAM_MACHINE_IP>`
  found: Target machine has `HID_ID=0003:000028DE:00001304` and `0x1305` ("Valve Software Steam Controller Puck") connected. `input_watch.py` confirms `SteamClient.Input` delivers 0 events during Proton/game focus and reads `hidraw` (reports `0x42/0x45/0x47` for Triton `0x1302..0x1305`, `0x09` for Deck `0x1205`) + `evdev` (`0x11FF` virtual pad / third-party pads).
  implication: Deckify needs a backend `hidraw`/`evdev` passive listener (or backend-to-frontend button events) to fire chords in-game, plus dual-signature handling in `setupChordListener()`.

- timestamp: 2026-11-21T23:12:40Z
  checked: `src/index.tsx` (`setupChordListener`, lines 475-552) and `src/chords.ts` (`CONTROLLER_INPUT_TO_GAMEPAD_BUTTON`, lines 88-118)
  found: `setupChordListener()` only binds `RegisterForControllerInputMessages((_controllerIndex, gamepadButton, isPressed) => ...)` with no array `{ nA, bS }` handling, no `RegisterForControllerStateChanges` fallback, no `.unregister()` (only `.Unregister()`), no sleep/resume re-subscription, and no backend `hidraw`/`evdev` input source.
  implication: Chords silently fail to fire in-game (0 events from `SteamClient.Input`) and also fail in Steam UI on builds using the array `{ nA, bS }` signature.

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: "AND-gate / multi-part root cause: (1) SteamOS `SteamClient.Input.RegisterForControllerInputMessages` delivers 0 controller button events to the frontend SharedJSContext while a game has focus (SteamOS routes input to Gamescope/the game, not SteamUI JS), so Deckify's frontend-only `setupChordListener()` (`src/index.tsx:483-552`) never receives button events in-game — whereas working plugins like Steamcord (`input_watch.py`) passively read `/dev/hidraw*` (Valve Steam Controller 2026 `0x1302-0x1305` & Steam Deck `0x1205`) and `/dev/input/event*` (`evdev`) in the Python backend. (2) Additionally, `src/index.tsx:514-520` only handles the 3-argument `(controllerIndex, gamepadButton, isPressed)` callback signature of `RegisterForControllerInputMessages`, silently dropping events (`mapControllerInputButton(undefined) -> null`) on Steam builds that pass an array of `{ nA, bS }` objects as `args[0]`, lacks `RegisterForControllerStateChanges` fallback and sleep/resume re-subscription, and `unregisterHandle` (`src/index.tsx:478`) checks `.Unregister` instead of `.unregister`."
fix: ""
verification: ""
files_changed: []
