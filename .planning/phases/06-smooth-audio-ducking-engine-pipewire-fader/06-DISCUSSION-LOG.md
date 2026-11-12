# Phase 6: Smooth Audio Ducking Engine & PipeWire Fader - Discussion Log

**Date:** 2026-11-12  
**Phase:** 6  
**Status:** Completed  

---

## 1. Fading Curve & Timing
- **Question:** Hoe wil je dat de overgangen verlopen?
- **Options Presented:**
  1. Asymmetrisch: 1.0s fade-down bij start, 1.5s fade-up bij exit (cosine curve)
  2. Symmetrisch: 1.2s voor zowel in- als uitfaden
  3. Snel & snappy: 0.6s fade-down, 0.8s fade-up
  4. Volledig configureerbare slider (0.5s t/m 3.0s) in SettingsTab
- **User Selection:** Volledig configureerbare slider (0.5s t/m 3.0s) in SettingsTab
- **Decision:** Asymmetrische cosine easing curve als default (1.0s down / 1.5s up), met configureerbare sliders (0.5s–3.0s) in `SettingsTab.tsx`.

---

## 2. Voice Chat & Microfoon Ducking
- **Question:** Hoe diep ducken tijdens spraak en hoe lang wachten vóór herstel?
- **Options Presented:**
  1. Duck naar 25% volume met 1.2s silence hold
  2. Duck naar 35% met 1.5s silence hold
  3. Agressief: duck naar 15% met 1.0s silence hold
  4. Gekoppeld aan de game-ducking slider met 1.2s hold
- **User Selection:** De recommended (duck naar 25% met 1.2s silence hold) maar wel ook volledig configureerbaar.
- **Decision:** Default duck target 25% volume met 1.2s silence hold via `pactl list source-outputs` detectie, met interactieve sliders en master toggle in `SettingsTab.tsx`.

---

## 3. Ducking Volume Berekening
- **Question:** Hoe moet het doelvolume berekend worden?
- **Options Presented:**
  1. Relatieve demping: verlaagt huidig volume proportioneel (bijv. -50%)
  2. Absolute target: dempt altijd naar een vast percentage (bijv. exact 30%)
  3. Relatief met een minimum cap
- **User Selection:** Recommended (relatief / proportioneel) maar ook instelbaar in configuratie.
- **Decision:** Proportionele verlagingsformule als default om te voorkomen dat muziek luider wordt als de gebruiker al zacht luistert, met een toggle tussen relatief (%) en absoluut.

---

## 4. PipeWire vs UI Slider
- **Question:** Hoe moet de gedempte toestand worden weergegeven?
- **Options Presented:**
  1. 100% lokaal via PipeWire met subtiele 'Ducked' badge in de UI
  2. Lokaal via PipeWire, maar de UI volume slider animeert visueel mee
  3. Beide: slider animeert én toont een 'Ducked' pill badge
- **User Selection:** Beide: slider animeert én toont een 'Ducked' pill badge.
- **Decision:** 100% lokale demping via PipeWire sink-inputs (`pactl set-sink-input-volume`) met 0 cloud API calls; de frontend volume slider animeert visueel mee én toont een verhoogde `Ducked` statusbadge.
