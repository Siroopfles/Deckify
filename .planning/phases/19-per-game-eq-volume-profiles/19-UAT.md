---
status: complete
phase: 19-per-game-eq-volume-profiles
source: [19-VERIFICATION.md]
started: 2026-11-19T08:35:00Z
updated: 2026-11-19T16:17:36.908Z
---

## Current Test

[testing complete]

## Tests

### 1. Live PipeWire Filter-Chain & Sink-Input Hardware Audio (Non-Inferable Backstop)
expected: Launching and exiting Steam/Non-Steam games (including rapid game switches and mid-game GameEqModal pw-cli previews) transitions deckify_eq_sink and pactl set-sink-input-volume smoothly with no audible clicks, pops, or steamwebhelper/Chromium UI sound interference.
result: pass

### 2. SteamOS GamepadUI Navigation, Layout & Visual Verification (1280x800)
expected: Controller D-pad navigation traverses horizontal rows (flow-children='horizontal') without focus traps; Edit Game EQ modal renders all 10 ISO faders within 82vh; SettingsTab shows truncated Active Game EQ Override badge while keeping edits bound to global baseline; QAM displays GAME VOL / DUCKED pills and live effective_volume; two-step Delete Game Profile confirmation works cleanly.
result: issue
reported: "1.1 Missing explicit on/off toggle to enable/disable Volume Override slider and Ducking Attenuation Override slider. 1.3 Moving slider makes Reset button appear inline, causing layout jump and slider label text to wrap vertically/stack letters. 2.1 GameEqModal close button causes rightward scroll, pressing D-pad down moves focus left, and modal color mismatches inner content. 4.1 SettingsTab Active Game EQ Override badge shows 'App <many digits>...' instead of game name, truncating the rest."
severity: major

### 3. Mid-Game Crash Recovery & Sleep Timer _sleep_locked Priority on Hardware
expected: Killing/restarting Decky Loader mid-game cleans orphan pipewire -c via eq.pid and restores global EQ (including tearing down deckify_eq_sink when global is flat) and un-ducked baseline on Plugin._main(); exiting a game while a Sleep Timer fade is active restores global EQ and clears snapshot without un-ducking or resuming pre-game playback.
result: pass

## Summary

total: 3
passed: 2
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-19-2
  truth: "Controller D-pad navigation traverses horizontal rows (flow-children='horizontal') without focus traps; Edit Game EQ modal renders all 10 ISO faders within 82vh; SettingsTab shows truncated Active Game EQ Override badge while keeping edits bound to global baseline; QAM displays GAME VOL / DUCKED pills and live effective_volume; two-step Delete Game Profile confirmation works cleanly."
  status: failed
  reason: "User reported: (1) SoundtracksTab lacks on/off toggles for Volume Override and Ducking Attenuation Override sliders, and inline Reset button appearing causes layout jump and vertical letter stacking on slider labels; (2) GameEqModal close button causes slight horizontal scroll right, D-pad down moves focus left, and modal color mismatches inner content; (3) SettingsTab Active Game EQ Override badge displays 'App <many digits>...' instead of game name and hides remaining badge text."
  severity: major
  test: 2
  artifacts: []
  missing: []
