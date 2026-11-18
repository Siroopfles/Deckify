# Phase 18: MPRIS2 D-Bus Bridge - Discussion Log

**Date:** 2026-11-17
**Phase:** 18 - MPRIS2 D-Bus Bridge
**Mode:** standard

## Areas Discussed

### 1. MPRIS2 Controls Scope
- **Question:** Which methods/properties should `org.mpris.MediaPlayer2.Player` support?
- **Options Presented:**
  1. `(Recommended) Transport + Seek/Position (Play, Pause, PlayPause, Stop, Next, Previous, Seek, SetPosition)`
  2. `Minimal Transport Only (Play, Pause, PlayPause, Next, Previous)`
  3. `Full Player Interface (Transport + Seek + Volume + Shuffle + LoopStatus)`
- **User Selection:** `Full Player Interface (Transport + Seek + Volume + Shuffle + LoopStatus) — Also exposes writable volume and shuffle/repeat over D-Bus` (locked as D-01, D-02).

### 2. Metadata & Album Art
- **Question:** What metadata should Deckify publish over MPRIS2?
- **Options Presented:**
  1. `(Recommended) Xesam Metadata + Local Cached file:// artUrl (with HTTPS fallback) + Event-Only PropertiesChanged`
  2. `Xesam Metadata + Raw HTTPS Spotify CDN artUrl only + Event-Only PropertiesChanged`
  3. `Text Metadata Only (Title, Artist, Album, Length — omit artUrl)`
- **User Selection:** `(Recommended) Xesam Metadata + Local Cached file:// artUrl (with HTTPS fallback) + Event-Only PropertiesChanged — Zero 1s polling drain; Position computed on-demand` (locked as D-03, D-04).

### 3. BlueZ `mpris-proxy` & Session Bus Handling
- **Question:** How should Deckify handle BlueZ `mpris-proxy` in SteamOS GamepadUI?
- **Options Presented:**
  1. `(Recommended) Auto-ensure mpris-proxy under deck (UID 1000)`
  2. `Passive D-Bus registration only`
- **User Selection:** `(Recommended) Auto-ensure mpris-proxy under deck (UID 1000) — Run D-Bus bridge as UID 1000 and auto-start mpris-proxy if not already running in GamepadUI` (locked as D-05, D-06).

### 4. Settings UI & Playback Target Routing
- **Question:** How should MPRIS2 be configured and routed?
- **Options Presented:**
  1. `(Recommended) Dedicated SettingsTab card + Active Target Routing`
  2. `SettingsTab card + Local librespot Only`
- **User Selection:** `(Recommended) Dedicated SettingsTab card + Active Target Routing — Toggle + live status badge in SettingsTab, routing commands through Deckify playback pipeline (works for local librespot & active Connect device)` (locked as D-07, D-08).

## Deferred Ideas
- None.
