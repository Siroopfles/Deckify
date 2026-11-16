---
status: diagnosed
phase: 15-real-pipewire-biquad-equalizer
source:
  - 15-01-SUMMARY.md
  - 15-02-SUMMARY.md
started: "2026-11-16T20:37:00+01:00"
updated: "2026-11-16T20:51:04+01:00"
---

## Current Test

[testing complete]

## Tests

### 1. Preset Switching & Real-Time PipeWire EQ Sound
expected: Speel een nummer af in Spotify, open Settings → Equalizer & Audio Presets, schakel door Bass Boost, Vocal Clarity, Gaming Balance, Deck Speakers, Late Night en Flat. Direct hoorbaar EQ-verschil zonder gekraak, header toont Preamp / Bypass (0.0 dB), en sliders volgen de preset.
result: issue
reported: "Ja doet hij alleen als ik terug ga naar flat dan stop de muziek ermee elke keer als ik hem op flat zet ook na weer aanzetten en dan andere preset en terug."
severity: major

### 2. 10-Band ISO Sliders & Preset-to-Custom Auto-Fork
expected: Versleep een of meer van de 10 ISO sliders (31 Hz t/m 16 kHz) terwijl een preset actief is. De actieve pill springt direct naar `Custom`, het geluid verandert vloeiend zonder gekraak of vastlopers, en de header werkt de negatieve Preamp live bij. Klik daarna op `Flat` en weer terug op `Custom`: je aangepaste curve blijft bewaard.
result: issue
reported: "Ja hij springt naar custom maar hij onthoud niet wat de preset was en zet alles naar 0. ook als ik het probeer aan te passen dan springt en vlijft hij naar 0 springen. Ook vind ik al deze sliders horizontaal naas elkaar niet mooi en veel ruimte in beslag nemen kunnen we ze niet verticaal naast elkaarzetten in mooie styling?"
severity: major

### 3. Stream Isolation & Output Sink Switching
expected: Terwijl een game of Steam UI-geluiden actief zijn en een EQ-preset aanstaat, wissel je van audio output sink in Settings (bijv. Speakers ↔ Headphones/HDMI) en schakel je EQ aan/uit (`Flat`). Game-audio en Steam UI klikgeluiden blijven onaangetast en vallen niet weg.
result: skipped
reason: "Er is nog geen audio output sink setting zichtbaar in SettingsTab"

### 4. GamepadUI D-Pad Spatial Navigation & Compact QAM
expected: Navigeer met de D-pad door de 2 rijen preset pills (rij 1: 4 pills, rij 2: 3 pills) en naar beneden door de 10 sliders zonder focus-traps of sprongen. Controleer ook de Quick Access Menu (QAM): daar staan geen EQ-controls of preset-badges.
result: pass

### 5. Persistence Across Plugin Restart / SteamOS Reboot
expected: Zet een preset of `Custom` curve, herstart Decky/Steam Deck (reboot of plugin reload), en open Settings opnieuw. De gekozen `eq_preset` en `eq_custom_bands` zijn behouden en de EQ is direct weer actief.
result: pass

## Summary

total: 5
passed: 2
issues: 2
pending: 0
skipped: 1
blocked: 0

## Gaps

- truth: "Selecting Flat performs true bypass by tearing down pipewire -c and routing librespot back to the hardware sink without stopping music playback."
  status: failed
  reason: "User reported: Ja doet hij alleen als ik terug ga naar flat dan stop de muziek ermee elke keer als ik hem op flat zet ook na weer aanzetten en dan andere preset en terug."
  severity: major
  test: 1
  root_cause: "EqualizerManager.apply_preset('flat') called self.stop() before self._fallback_to_hardware_sink(), destroying deckify_eq_sink while librespot was streaming into it (causing PipeWire/librespot to stop playback), and _fallback_to_hardware_sink() used literal '@DEFAULT_SINK@' instead of resolving pactl get-default-sink."
  artifacts:
    - py_modules/equalizer.py
  missing:
    - "Move librespot sink-input to resolved hardware sink BEFORE terminating pipewire -c in apply_preset('flat')"
  debug_session: ""
- truth: "Dragging any EQ slider forks the active preset curve into Custom without resetting bands to 0, persists slider adjustments without snapping back to 0, and presents a compact vertical graphic-EQ fader layout."
  status: failed
  reason: "User reported: Ja hij springt naar custom maar hij onthoud niet wat de preset was en zet alles naar 0. ook als ik het probeer aan te passen dan springt en vlijft hij naar 0 springen. Ook vind ik al deze sliders horizontaal naas elkaar niet mooi en veel ruimte in beslag nemen kunnen we ze niet verticaal naast elkaarzetten in mooie styling?"
  severity: major
  test: 2
  root_cause: "SettingsTab.tsx useEffect([status?.settings]) overwrote localBands and localCustomBands with stale status.settings.eq_custom_bands ([0,...]) on every status poll/refresh before the 500ms backend save completed. Additionally, 10 stacked horizontal SliderFields consumed excessive vertical space."
  artifacts:
    - src/components/tabs/SettingsTab.tsx
    - src/components/tabs/SettingsTab.test.tsx
  missing:
    - "Guard status?.settings sync against overwriting active local EQ edits and only sync when backend EQ values actually change"
    - "Replace 10 stacked horizontal SliderFields with a compact 10-band vertical graphic EQ fader row"
  debug_session: ""
