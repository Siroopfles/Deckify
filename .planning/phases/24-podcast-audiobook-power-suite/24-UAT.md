---
status: complete
phase: 24-podcast-audiobook-power-suite
source: [24-VERIFICATION.md]
started: 2026-11-22T20:07:37Z
updated: 2026-11-22T20:26:08.610Z
---

## Current Test

[testing complete]

## Tests

### 1. Live Official Spotify Client CDP Speed Control
expected: Audible 0.5x–2.0x speed changes work via NowPlayingTab Dropdown and QAM speed cycle pill, playback speed auto-resets to 1.0x when transitioning to a music track, and preferred_podcast_speed is restored when returning to a podcast episode or audiobook.
result: issue
reported: "Ja de speed changes werken. alleen geeft hij in QAM een heletijd een error als ik er op druk met failed to change zegt hij maar hij veranderd wel."
severity: minor

### 2. SteamOS GamepadUI Controller Navigation & Visual Layout
expected: Horizontal D-pad focus moves cleanly across All/Unplayed/In Progress filter pills and -15s/+15s transport buttons, L2/R2 perform 15s smart-skip during spoken content, B-button dismisses ShowEpisodesView back to Followed Podcasts, and bottom 4px green progress bars plus "Played"/"Xm left" badges are legible.
result: issue
reported: "Yes allemaal klopt alleen de -15/+15s onder de playbackbar op de now playing tab is een beetje veel want ze staan nu ook in de rij eronder. ik denk dat het beter is als die onder de playbackbar weg gaan ook bij muziek en dat de playbackbar sleepbaar wordt maar wel dat je nog kan vooruit en achteruit kan skippen met de controller bij muziek dan. en bij podcast ze wel in de onderste bar houden. Ohja als je bij podcasts options open zegt hij track dus dat moet misschien nog anders?"
severity: minor

## Summary

total: 2
passed: 0
issues: 2
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-24-1
  truth: "Audible 0.5x–2.0x speed changes work via NowPlayingTab Dropdown and QAM speed cycle pill, playback speed auto-resets to 1.0x when transitioning to a music track, and preferred_podcast_speed is restored when returning to a podcast episode or audiobook."
  status: failed
  reason: "User reported: Ja de speed changes werken. alleen geeft hij in QAM een heletijd een error als ik er op druk met failed to change zegt hij maar hij veranderd wel."
  severity: minor
  test: 1
  artifacts: []
  missing: []

- gap_id: G-24-2
  truth: "Horizontal D-pad focus moves cleanly across All/Unplayed/In Progress filter pills and -15s/+15s transport buttons, L2/R2 perform 15s smart-skip during spoken content, B-button dismisses ShowEpisodesView back to Followed Podcasts, and bottom 4px green progress bars plus 'Played'/'Xm left' badges are legible."
  status: failed
  reason: "User reported: Yes allemaal klopt alleen de -15/+15s onder de playbackbar op de now playing tab is een beetje veel want ze staan nu ook in de rij eronder. ik denk dat het beter is als die onder de playbackbar weg gaan ook bij muziek en dat de playbackbar sleepbaar wordt maar wel dat je nog kan vooruit en achteruit kan skippen met de controller bij muziek dan. en bij podcast ze wel in de onderste bar houden. Ohja als je bij podcasts options open zegt hij track dus dat moet misschien nog anders?"
  severity: minor
  test: 2
  artifacts: []
  missing: []
