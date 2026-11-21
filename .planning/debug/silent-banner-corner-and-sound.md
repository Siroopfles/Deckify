---
status: diagnosed
trigger: "silent-banner-corner-and-sound: SilentBanner renders cleanly in a configurable corner without falling back to Steam native toast popup when notification sound is desired"
created: 2026-11-21T18:20:48Z
updated: 2026-11-21T18:22:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

bug_class: Bohrbug
hypothesis: "Two coupled design gaps cause UAT Test 1 failures: (1) SilentBanner has no independent corner setting or UI control — DeckifyOverlayWrapper binds bannerPosition to settings.overlay_position first (which is only exposed in SettingsTab/QAM when overlay_enabled is true), shadowing toast_position and offering no silent_banner_position setting; (2) handleTrackMetadataNotification explicitly gates SilentBanner on !toastSoundEnabled, falling back to Steam's native toaster.toast() whenever toast_sound_enabled is true because SilentBanner has no built-in/custom sound playback."
test: "Inspect src/index.tsx, src/components/SilentBanner.tsx, src/components/tabs/SettingsTab.tsx, src/components/tabs/ChordBindingsCard.tsx, main.py, and py_modules/common.py"
expecting: "Confirm exact line-level root causes for both corner configuration and sound fallback"
next_action: "Return ROOT CAUSE FOUND to orchestrator"

reasoning_checkpoint:
  hypothesis: "SilentBanner corner cannot be configured independently because DeckifyOverlayWrapper prioritizes settings.overlay_position over settings.toast_position and no UI exists for a banner corner (overlay_position UI is gated behind overlay_enabled); and SilentBanner falls back to Steam native toaster.toast() when toast_sound_enabled is true because handleTrackMetadataNotification checks `if (!toastSoundEnabled && silentBannerEnabled !== false)` and no non-Steam chime mechanism exists."
  confirming_evidence:
    - "src/index.tsx:1575 sets `const bannerPosition = settings?.overlay_position || settings?.toast_position || \"top-right\";` — overlay_position (default \"top-right\" in py_modules/common.py:138) always shadows toast_position, and no silent_banner_position setting exists."
    - "src/components/tabs/SettingsTab.tsx:1345 and src/index.tsx:1082 only render the corner selector (`overlay_position`) when `overlay_enabled` is truthy; ChordBindingsCard.tsx:603-610 and SettingsTab.tsx:1450-1546 have no corner selector for SilentBanner/toasts."
    - "src/index.tsx:333-343 checks `if (!toastSoundEnabled && silentBannerEnabled !== false)` and returns after `emitBanner(...)`; when `toastSoundEnabled` is true, it skips `emitBanner` and calls `showTrackToaster(parsed, resolvedArtwork, toastSoundEnabled)` -> `toaster.toast({ playSound: true, sound: 1 })`."
    - "git grep across src/, py_modules/, main.py confirms zero Web Audio (AudioContext/Audio) or PipeWire chime utilities exist."
  falsification_test: "If a silent_banner_position setting/UI existed and took precedence in DeckifyOverlayWrapper, or if handleTrackMetadataNotification emitted SilentBanner with a non-Steam chime when toast_sound_enabled is true, UAT Test 1 would not exhibit either symptom."
  fix_rationale: "Adding a dedicated banner corner setting (e.g., silent_banner_position or wiring toast_position with UI in SettingsTab/ChordBindingsCard and prioritizing it over overlay_position) decouples banner placement from overlay_enabled; playing a lightweight non-Steam audio chime (e.g. Web Audio API / local PipeWire chime) when silentBannerEnabled && toastSoundEnabled lets handleTrackMetadataNotification keep using SilentBanner without invoking Steam's toaster.toast()."
  blind_spots: "Whether SteamOS GamepadUI CEF allows Web Audio API (`AudioContext`) playback in-game without user gesture or if a PipeWire/backend chime (e.g. `pw-play`/`paplay` or a short synthesized WAV) is more reliable on SteamOS 3.5+ was not tested on hardware."
  candidate_causes:
    - "code: Missing independent banner corner setting/UI and `!toastSoundEnabled` gate in handleTrackMetadataNotification falling back to `toaster.toast()`"
    - "config: Default settings in py_modules/common.py define `overlay_position: 'top-right'` and `toast_position: 'top_right'` without `silent_banner_position`, and `overlay_position` takes precedence in frontend"
  and_gate: "no — each of the two symptoms in Test 1 has a direct deterministic code+config cause (coupled corner setting + `!toastSoundEnabled` fallback to `toaster.toast`); neither requires a multi-factor runtime race."

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: 3.5-second SilentBanner renders cleanly above the active game window with zero audible Steam UI toast chime, zero controller focus or game input interception, and offsets by 140px when Mini Overlay HUD is visible in the same corner.
actual: "Hoor geen steam audio als de instelling uitstaat dus das goed. Offset werkt ook. Kan alleen de corner van alleen de notificatie niet aanpassen dus das beetje apart. Ook moeten de silent hud meldingen als notificatie geluid aanstaat misschien een apart geluidje afspelen, want dan krijg wel notificatie vanuit steam."
errors: None reported
reproduction: Test 1 in UAT
timeline: Discovered during UAT

## Eliminated
<!-- APPEND only - prevents re-investigating -->

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-11-21T18:21:12Z
  checked: "src/index.tsx:1575, 1596-1601; src/components/SilentBanner.tsx:8-13, 194-196; src/components/tabs/SettingsTab.tsx:1345-1363"
  found: "SilentBanner itself accepts an independent `position` prop and compares it against `hudPosition` for the 140px offset. However, DeckifyOverlayWrapper computes `const bannerPosition = settings?.overlay_position || settings?.toast_position || \"top-right\"`. Since `py_modules/common.py:138` defaults `overlay_position` to `\"top-right\"`, `overlay_position` always overrides `toast_position`. Furthermore, `SettingsTab.tsx:1345` and `src/index.tsx:1082` only render the corner selector when `overlay_enabled` is true, and there is no `silent_banner_position` setting or UI anywhere."
  implication: "Users cannot configure SilentBanner's corner independently of the Mini Overlay HUD, and when Mini Overlay HUD is disabled (`overlay_enabled: false`), no corner selector is visible in the UI at all."

- timestamp: 2026-11-21T18:21:26Z
  checked: "src/index.tsx:333-344, 537-556; git grep for AudioContext/new Audio/paplay/pw-play/aplay"
  found: "In `handleTrackMetadataNotification` (`src/index.tsx:333`), the SilentBanner branch is `if (!toastSoundEnabled && silentBannerEnabled !== false)`. When `toastSoundEnabled` is `true`, execution skips `emitBanner(...)` and calls `showTrackToaster(parsed, resolvedArtwork, toastSoundEnabled)`, which invokes `toaster.toast({ ..., sound: 1, playSound: true })`. There is no custom/non-Steam chime utility anywhere in `src/` or `py_modules/`."
  implication: "Turning Notification Sound ON forces track change notifications back onto Steam's native toast popup (`toaster.toast`), defeating Silent HUD Banner."

- timestamp: 2026-11-21T18:22:10Z
  checked: "User clarification on G-20-1 & src/index.tsx:160, 1384; SettingsTab.tsx:1481-1504"
  found: "User clarified that HUD notification sound must be toggleable (`toast_sound_enabled` already exists in SettingsTab) AND linked to the Deckify volume/sound slider (`cachedVolume` / `volume` / `effectiveVolume` in `src/index.tsx`, 0-100)."
  implication: "When `silentBannerEnabled !== false && toastSoundEnabled === true`, `SilentBanner` should still be emitted (never falling back to Steam's `toaster.toast`), and a custom non-Steam chime should play with its gain/volume scaled by the current Deckify volume slider."

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: "1) Corner not independently configurable: `DeckifyOverlayWrapper` (`src/index.tsx:1575`) derives `bannerPosition` from `settings?.overlay_position || settings?.toast_position || \"top-right\"` — `overlay_position` (default `\"top-right\"` in `py_modules/common.py:138`) always shadows `toast_position`, no `silent_banner_position` setting exists, and the only corner UI (`SettingsTab.tsx:1345`, `src/index.tsx:1082`) is gated behind `overlay_enabled`. 2) Steam native toast fallback when Notification Sound is ON: `handleTrackMetadataNotification` (`src/index.tsx:333-343`) gates `emitBanner(...)` on `!toastSoundEnabled`; when `toast_sound_enabled` is `true`, it falls through to `showTrackToaster(...)` -> `toaster.toast({ playSound: true })` because SilentBanner has no non-Steam sound/chime playback."
fix: ""
verification: ""
files_changed: []
