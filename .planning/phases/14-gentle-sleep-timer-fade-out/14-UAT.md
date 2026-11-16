---
status: complete
phase: 14-gentle-sleep-timer-fade-out
source: [14-01-SUMMARY.md, 14-02-SUMMARY.md]
started: 2026-11-16T16:37:00+01:00
updated: 2026-11-16T16:51:20+01:00
---

## Current Test

[testing complete]

## Tests

### 1. Sleep Timer Fade Settings in SettingsTab
expected: In Deckify Settings -> Backend Sleep Timer card, a "Gentle Fade Out" toggle (default ON) and "Fade Out Duration (Seconds)" slider (5s–120s, step 5s, default 30s) appear. Toggling Gentle Fade Out OFF hides the duration slider, and changes persist after closing/reopening.
result: pass

### 2. Timed Sleep Timer Gentle Fade-Out & Status Display
expected: Starting a timed sleep timer while playing music smoothly fades volume down to 0% starting at T - fade_duration (with SettingsTab showing "Fading out..."), pauses playback at 0%, and restores baseline volume after ~1.2s audio drain (including before poweroff if shutdown_on_finish is enabled).
result: pass

### 3. End of Track Preserves Full Outro
expected: Starting an "End of Track" sleep timer lets the current track play to completion at full volume without fading out, then pauses immediately when the track ends.
result: issue
reported: "1. Ja | 2. Nou hij stopt wel maar ik hoorde net nog een beetje van het volgende nummer"
severity: minor

### 4. Mid-Fade Cancellation & Ducking Protection
expected: Cancelling or resetting an active sleep timer while "Fading out..." is in progress immediately aborts the fade and smoothly restores baseline volume over ~0.5s (respecting any active game/voice ducking), and game/voice ducking events during a fade-out do not interrupt the sleep fade.
result: pass

## Summary

total: 4
passed: 3
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "Starting an \"End of Track\" sleep timer pauses immediately when the current track ends without playing into the next track"
  status: failed
  reason: "User reported: 1. Ja | 2. Nou hij stopt wel maar ik hoorde net nog een beetje van het volgende nummer"
  severity: minor
  test: 3
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""
