---
status: complete
phase: 15-real-pipewire-biquad-equalizer
source:
  - 15-01-SUMMARY.md
  - 15-02-SUMMARY.md
started: "2026-11-16T20:37:00+01:00"
updated: 2026-11-16T21:00:27.288Z
---

## Current Test

[testing complete]

## Tests

### 1. Preset Switching & Real-Time PipeWire EQ Sound (Re-test after fix 5743b12)
expected: Speel een nummer af in Spotify, open Settings → Equalizer & Audio Presets, schakel door Bass Boost, Vocal Clarity, Gaming Balance, Deck Speakers, Late Night en Flat. Direct hoorbaar EQ-verschil zonder gekraak, header toont Preamp / Bypass (0.0 dB), en bij schakelen naar Flat blijft de muziek gewoon doorspelen zonder te stoppen.
result: pass

### 2. 10-Band ISO Sliders & Preset-to-Custom Auto-Fork (Re-test after fixes 5743b12 & 70b42ab)
expected: De 10 ISO-banden (31 Hz t/m 16 kHz) staan als compacte verticale graphic-EQ faders naast elkaar. Pas een of meer banden aan terwijl een preset actief is: de actieve pill springt naar Custom met behoud van de preset-curve (springt niet terug naar 0), het geluid verandert hoorbaar, en na Flat → Custom (of Settings heropenen) blijft jouw Custom-curve bewaard.
result: pass

### 3. Stream Isolation & Output Sink Switching
expected: Terwijl een game of Steam UI-geluiden actief zijn en een EQ-preset aanstaat, wissel je van audio output sink in Settings (bijv. Speakers ↔ Headphones/HDMI) en schakel je EQ aan/uit (`Flat`). Game-audio en Steam UI klikgeluiden blijven onaangetast en vallen niet weg.
result: skipped
reason: "Er is nog geen audio output sink setting zichtbaar in SettingsTab (wordt toegevoegd in Phase 16)"

### 4. GamepadUI D-Pad Spatial Navigation & Compact QAM
expected: Navigeer met de D-pad door de 2 rijen preset pills (rij 1: 4 pills, rij 2: 3 pills) en naar beneden door de 10 sliders zonder focus-traps of sprongen. Controleer ook de Quick Access Menu (QAM): daar staan geen EQ-controls of preset-badges.
result: pass

### 5. Persistence Across Plugin Restart / SteamOS Reboot
expected: Zet een preset of `Custom` curve, herstart Decky/Steam Deck (reboot of plugin reload), en open Settings opnieuw. De gekozen `eq_preset` en `eq_custom_bands` zijn behouden en de EQ is direct weer actief.
result: pass

## Summary

total: 5
passed: 4
issues: 0
pending: 0
skipped: 1
blocked: 0

## Gaps

[none yet]

## Deferred Follow-Ups

- test: 2
  idea: "Preamp handmatig custom kunnen aanpassen in SettingsTab (naast of als override op automatische negatieve preamp)"
  deferred_at: 2026-11-16
