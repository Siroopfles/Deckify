---
status: testing
phase: 19-per-game-eq-volume-profiles
source: [19-VERIFICATION.md]
started: 2026-11-19T08:35:00Z
updated: 2026-11-19T08:35:00Z
---

## Current Test

number: 1
name: Live PipeWire Filter-Chain & Sink-Input Hardware Audio (Non-Inferable Backstop)
expected: |
  Launching and exiting Steam/Non-Steam games (including rapid game switches and mid-game GameEqModal pw-cli previews) transitions deckify_eq_sink and pactl set-sink-input-volume smoothly with no audible clicks, pops, or steamwebhelper/Chromium UI sound interference.
awaiting: user response

## Tests

### 1. Live PipeWire Filter-Chain & Sink-Input Hardware Audio (Non-Inferable Backstop)
expected: Launching and exiting Steam/Non-Steam games (including rapid game switches and mid-game GameEqModal pw-cli previews) transitions deckify_eq_sink and pactl set-sink-input-volume smoothly with no audible clicks, pops, or steamwebhelper/Chromium UI sound interference.
result: [pending]

### 2. SteamOS GamepadUI Navigation, Layout & Visual Verification (1280x800)
expected: Controller D-pad navigation traverses horizontal rows (flow-children='horizontal') without focus traps; Edit Game EQ modal renders all 10 ISO faders within 82vh; SettingsTab shows truncated Active Game EQ Override badge while keeping edits bound to global baseline; QAM displays GAME VOL / DUCKED pills and live effective_volume; two-step Delete Game Profile confirmation works cleanly.
result: [pending]

### 3. Mid-Game Crash Recovery & Sleep Timer _sleep_locked Priority on Hardware
expected: Killing/restarting Decky Loader mid-game cleans orphan pipewire -c via eq.pid and restores global EQ (including tearing down deckify_eq_sink when global is flat) and un-ducked baseline on Plugin._main(); exiting a game while a Sleep Timer fade is active restores global EQ and clears snapshot without un-ducking or resuming pre-game playback.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
