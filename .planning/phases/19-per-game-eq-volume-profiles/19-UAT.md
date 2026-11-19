---
status: testing
phase: 19-per-game-eq-volume-profiles
source: [19-VERIFICATION.md]
started: 2026-11-19T08:35:00Z
updated: 2026-11-19T18:20:30Z
---

## Current Test

number: 2
name: SteamOS GamepadUI Navigation, Layout & Visual Verification (1280x800)
expected: |
  SoundtracksTab renders explicit Volume Override and Custom Ducking Level ToggleFields gating dedicated full-width SliderField rows without layout jumping or vertical letter-stacking, compact DialogButtons respect width: 'auto', and trimmed app_name backfill displays cleanly; GameEqModal inherits native ModalRoot surface with zero horizontal scroll, focuses body preset row on open instead of top-right Close, and navigates two 4-item preset rows (with Reset to Flat flex: 1, minWidth: 0) -> 10-band EqBandFaders -> footer via D-pad with MAINTAIN_X alignment; SettingsTab renders Active Game EQ Override on a dedicated full-width banner row below the Equalizer header showing full resolved Steam/Non-Steam game names (e.g., PCSX2) and preset suffixes with ellipsis only on extraordinarily long titles; QAM displays GAME VOL / DUCKED pills, live effective_volume, and quick-bind passes verified display_name on exact appid match; two-step Delete Game Profile confirmation works cleanly.
awaiting: user response

## Tests

### 1. Live PipeWire Filter-Chain & Sink-Input Hardware Audio (Non-Inferable Backstop)
expected: Launching and exiting Steam/Non-Steam games (including rapid game switches and mid-game GameEqModal pw-cli previews) transitions deckify_eq_sink and pactl set-sink-input-volume smoothly with no audible clicks, pops, or steamwebhelper/Chromium UI sound interference.
result: pass

### 2. SteamOS GamepadUI Navigation, Layout & Visual Verification (1280x800)
expected: SoundtracksTab renders explicit Volume Override and Custom Ducking Level ToggleFields gating dedicated full-width SliderField rows without layout jumping or vertical letter-stacking, compact DialogButtons respect width: 'auto', and trimmed app_name backfill displays cleanly; GameEqModal inherits native ModalRoot surface with zero horizontal scroll, focuses body preset row on open instead of top-right Close, and navigates two 4-item preset rows (with Reset to Flat flex: 1, minWidth: 0) -> 10-band EqBandFaders -> footer via D-pad with MAINTAIN_X alignment; SettingsTab renders Active Game EQ Override on a dedicated full-width banner row below the Equalizer header showing full resolved Steam/Non-Steam game names (e.g., PCSX2) and preset suffixes with ellipsis only on extraordinarily long titles; QAM displays GAME VOL / DUCKED pills, live effective_volume, and quick-bind passes verified display_name on exact appid match; two-step Delete Game Profile confirmation works cleanly.
result: [pending]

### 3. Mid-Game Crash Recovery & Sleep Timer _sleep_locked Priority on Hardware
expected: Killing/restarting Decky Loader mid-game cleans orphan pipewire -c via eq.pid and restores global EQ (including tearing down deckify_eq_sink when global is flat) and un-ducked baseline on Plugin._main(); exiting a game while a Sleep Timer fade is active restores global EQ and clears snapshot without un-ducking or resuming pre-game playback.
result: pass

## Summary

total: 3
passed: 2
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
