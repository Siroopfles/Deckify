---
status: complete
phase: 16-automatic-docked-audio-switching
source:
  - 16-01-SUMMARY.md
  - 16-02-SUMMARY.md
started: 2026-11-17T18:56:00+01:00
updated: 2026-11-17T19:03:30+01:00
---

## Current Test

[testing complete]

## Tests

### 1. Docked Audio-Switching UI, Hotplug & Undock Restore
expected: In Settings -> Docked Audio-Switching: Auto-Switch on Dock en Target Dock / DAC Sink werken, bij docken schakelt alleen Deckify's stream met toast + "Docked: ..." badge, en bij undocken herstelt de vorige sink (met Bluetooth-voorrang als ingeschakeld).
result: pass
notes: "Geverifieerd op Steam Machine (USB-dongle/HDMI hotplug, SettingsTab UI en bit_perfect_clock); Spotify desktop client pauzeert zelf bij direct hardware-verlies."

### 2. DockAudioSwitcher USB-DAC > HDMI Priority & Undock Clock Restore
expected: DockAudioSwitcher routes Deckify stream to USB-DAC/HDMI on dock (USB-DAC > HDMI priority) and restores pre-dock sink & clock.allowed-rates on undock
result: pass
source: automated
coverage_id: D1

### 3. Bluetooth Precedence & Manual Override Persistence
expected: Bluetooth precedence holds dock switching when dock_respect_bluetooth is true and re-evaluates on BT disconnect; manual sink selection sets per-dock-session override
result: pass
source: automated
coverage_id: D2

### 4. Enriched Sinks & main.py dock_* Validation
expected: Enriched get_audio_sinks() returns {name, description, is_default} excluding deckify_eq_sink, and main.py exposes dock_status & validates dock_* settings
result: pass
source: automated
coverage_id: D3

### 5. Frontend DockStatusInfo Types & Global Toast Listener
expected: TypeScript types (DockStatusState, DockStatusInfo, EngineSettings.dock_*, StatusResponse.dock_status) and global dock_audio_switched toast listener in src/index.tsx
result: pass
source: automated
coverage_id: D1

### 6. SettingsTab Docked Audio-Switching Card & Focusable Column Layout
expected: SettingsTab Docked Audio-Switching card with live status badge, 4 ToggleFields in Focusable flow-children='column', Target Dock / DAC Sink selector, empty-state guidance, and toast-free refresh listener
result: pass
source: automated
coverage_id: D2

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
