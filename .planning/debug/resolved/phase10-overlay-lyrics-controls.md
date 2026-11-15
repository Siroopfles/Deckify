---
status: diagnosed
trigger: "phase10-overlay-lyrics-controls: QAM Overlay Lyrics toggle turns on for 1 second then turns back off; SettingsTab Overlay Lyrics toggle stays off; SettingsTab sliders (including other slider settings) cannot be operated."
created: 2026-11-15T10:48:34Z
updated: 2026-11-15T10:52:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: Confirmed — `main.py:get_status()` filters `self._settings` through a `public_keys` allowlist that omits `overlay_lyrics_enabled`, `overlay_lyrics_offset_ms`, `overlay_autohide_duration_s`, `trigger_seek_seconds`, `trigger_page_size`, `trigger_nav_enabled`, and `show_controller_hints`.
test: Verified `main.py:494-513` against `py_modules/common.py:70-114`, `src/index.tsx`, and `src/components/tabs/SettingsTab.tsx`.
expecting: Adding the missing keys to `public_keys` in `main.py:get_status()` (and optionally preserving optimistic state / listening to `settings_changed` in `DeckifyExpandedModal`) will resolve all three symptoms.
next_action: Return ROOT CAUSE FOUND to orchestrator.

```yaml
reasoning_checkpoint:
  hypothesis: "main.py:get_status() omits Phase 10 and Phase 08 setting keys from its public_keys tuple, so every get_status() poll/refresh strips overlay_lyrics_enabled, overlay_lyrics_offset_ms, overlay_autohide_duration_s, trigger_seek_seconds, trigger_page_size, trigger_nav_enabled, and show_controller_hints from status.settings, causing DeckifyOverlayWrapper to overwrite settings_changed within 1-4s and locking SettingsTab toggles/sliders at their fallback defaults."
  confirming_evidence:
    - "main.py:494-505 public_keys tuple omits overlay_lyrics_enabled, overlay_lyrics_offset_ms, overlay_autohide_duration_s, trigger_nav_enabled, trigger_seek_seconds, trigger_page_size, and show_controller_hints (all defined in py_modules/common.py:105-112)."
    - "src/index.tsx:888 DeckifyOverlayWrapper syncStatus overwrites local settings state with `setSettings(s.settings)` on every 4s get_status() poll (src/index.tsx:917-922), wiping out the `settings_changed` event emitted by main.py:669."
    - "src/components/tabs/SettingsTab.tsx:661-705,774-818 binds Overlay Lyrics toggle and all 4 SliderFields (`overlay_autohide_duration_s`, `overlay_lyrics_offset_ms`, `trigger_seek_seconds`, `trigger_page_size`) directly to `status?.settings?.<key>` and calls `refreshStatus()` (get_status()), which always returns `undefined` for those keys."
  falsification_test: "If `public_keys` in main.py:494-505 included those keys, `get_status().settings` would return the persisted values and neither DeckifyOverlayWrapper nor SettingsTab would see `undefined` after refreshStatus()."
  fix_rationale: "Adding the missing public setting keys to `public_keys` in `main.py:get_status()` fixes the root cause across QAM, DeckifyOverlayWrapper, DeckifyExpandedModal, and SettingsTab."
  blind_spots: "Did not run live on Steam Deck hardware to verify whether @decky/ui SliderField inside SettingsTab's plain <div> (without PanelSectionRow) has any secondary D-pad focus quirk once value updates work."
  candidate_causes:
    - "code: main.py:get_status() public_keys allowlist omits Phase 10 & Phase 08 keys"
    - "data: settings.json persistence or set_setting() validation rejecting values"
  and_gate: "no — single root cause in main.py:get_status() public_keys explains all 3 symptoms simultaneously (and in DeckifyOverlayWrapper, `setSettings(s.settings)` amplifies it by replacing rather than merging)."
```

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: Toggle Overlay Lyrics in Quick Access Menu and adjust Auto-Hide Duration (3-15s) and Lyrics Latency Offset (-2000..+2000ms) sliders in Settings -> In-Game Mini Overlay (HUD). QAM remains compact with dynamic Auto-Hide Overlay (Ns) label; SettingsTab sliders smoothly adjust autohide duration and lyric sync offset in real time.
actual: User reported: "Uh nou er is een prob leem als ik in qam lyrics aan zet dan gaat hij een seconde aan. en daarna weer uit. Als ik in settings overlay lyrics aanzet dan blijft hij op off staan. Ook zijn de sliders op de settingstab niet te bedienen. (ook die van andere settings met sliders.) Maar de seconden dat ik hem zag leek de tekst wel goed te staan in de overlay"
errors: None reported
reproduction: Test 2 (and Test 1 observation) in 10-UAT.md
started: Discovered during UAT

## Eliminated
<!-- APPEND only - prevents re-investigating -->

- hypothesis: `set_setting` in `main.py` or `DEFAULT_SETTINGS` in `py_modules/common.py` fails to validate/persist `overlay_lyrics_enabled`, `overlay_lyrics_offset_ms`, or `overlay_autohide_duration_s`.
  evidence: `py_modules/common.py:105-107` defines all three keys in `DEFAULT_SETTINGS`, and `main.py:581-592,650-651,669` validates, saves, and emits `settings_changed` with full `self._settings`.
  timestamp: 2026-11-15T10:50:00Z

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-11-15T10:49:00Z
  checked: `main.py:494-513` (`get_status`) vs `py_modules/common.py:70-114` (`DEFAULT_SETTINGS`)
  found: `public_keys` in `main.py:get_status()` lists 31 keys and omits `overlay_lyrics_enabled`, `overlay_lyrics_offset_ms`, `overlay_autohide_duration_s` (Phase 10) as well as `trigger_nav_enabled`, `trigger_seek_seconds`, `trigger_page_size`, `show_controller_hints` (Phase 08).
  implication: Every `get_status()` call returns `status.settings` without any of those keys.

- timestamp: 2026-11-15T10:49:30Z
  checked: `src/index.tsx:888,913-922,933-952` (`DeckifyOverlayWrapper`)
  found: `set_setting` emits `settings_changed` with full `self._settings`, turning `overlayLyricsEnabled` on in `DeckifyOverlayWrapper`. However, `DeckifyOverlayWrapper` polls `backendGetStatus()` every 4000ms and calls `if (s.settings) setSettings(s.settings)` (replacing the object, not merging), which wipes out `overlay_lyrics_enabled` within 1-4 seconds and clears `syncedLyrics`.
  implication: Explains why toggling Overlay Lyrics in QAM makes overlay lyrics appear for ~1 second and then turn back off.

- timestamp: 2026-11-15T10:50:00Z
  checked: `src/components/tabs/SettingsTab.tsx:661-705,774-818`
  found: `SettingsTab` binds `Overlay Lyrics` (`overlay_lyrics_enabled`), `Auto-Hide Duration` (`overlay_autohide_duration_s`), `Lyrics Latency Offset` (`overlay_lyrics_offset_ms`), `L2/R2 Trigger Navigation` (`trigger_nav_enabled`), `Controller Hint Bar` (`show_controller_hints`), `Seek Step` (`trigger_seek_seconds`), and `Library Page Jump` (`trigger_page_size`) directly to `status?.settings?.<key>` and calls `refreshStatus()` (`get_status()`) after `backendSetSetting`.
  implication: Because all 7 keys are stripped by `public_keys` in `get_status()`, `Overlay Lyrics` stays `OFF` and all 4 `SliderField`s on `SettingsTab` have their `value` prop permanently locked to their `?? default` (`6`, `0`, `10`, `15`).

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: "`main.py:get_status()` filters `self._settings` through a `public_keys` allowlist (`main.py:494-505`) that omits `overlay_lyrics_enabled`, `overlay_lyrics_offset_ms`, `overlay_autohide_duration_s` (Phase 10) and `trigger_nav_enabled`, `trigger_seek_seconds`, `trigger_page_size`, `show_controller_hints` (Phase 08). As a result, `get_status().settings` never includes these keys, causing `DeckifyOverlayWrapper` to wipe out `overlay_lyrics_enabled` on its 4s status poll (`src/index.tsx:888,917-922`) and locking `SettingsTab`'s Overlay Lyrics toggle and all 4 `SliderField`s to their fallback defaults."
fix: ""
verification: ""
files_changed: []
