---
status: diagnosed
phase: 24-podcast-audiobook-power-suite
source: [24-VERIFICATION.md]
started: 2026-11-22T20:07:37Z
updated: 2026-11-22T20:29:15Z
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
  root_cause: "py_modules/rpc_playback.py line 681 calls plugin._save_settings() inside set_playback_speed() after _cdp_set_playback_speed succeeds, but main.Plugin has no _save_settings method (it is a module-level function in py_modules/common.py). This raises an unhandled AttributeError, rejecting the RPC and triggering the error toast in src/index.tsx even though the speed change succeeded."
  artifacts:
    - path: "py_modules/rpc_playback.py"
      issue: "Missing _save_settings import from py_modules.common; line 681 calls plugin._save_settings() instead of _save_settings(plugin._settings)"
    - path: "tests/test_podcast_suite.py"
      issue: "make_plugin() stubs _save_settings on SimpleNamespace, masking the missing method on main.Plugin"
  missing:
    - "Import _save_settings from py_modules.common in py_modules/rpc_playback.py and call _save_settings(plugin._settings)"
    - "Update tests/test_podcast_suite.py to test without plugin._save_settings stub"
  debug_session: .planning/debug/qam-speed-false-error.md

- gap_id: G-24-2
  truth: "Horizontal D-pad focus moves cleanly across All/Unplayed/In Progress filter pills and -15s/+15s transport buttons, L2/R2 perform 15s smart-skip during spoken content, B-button dismisses ShowEpisodesView back to Followed Podcasts, and bottom 4px green progress bars plus 'Played'/'Xm left' badges are legible."
  status: failed
  reason: "User reported: Yes allemaal klopt alleen de -15/+15s onder de playbackbar op de now playing tab is een beetje veel want ze staan nu ook in de rij eronder. ik denk dat het beter is als die onder de playbackbar weg gaan ook bij muziek en dat de playbackbar sleepbaar wordt maar wel dat je nog kan vooruit en achteruit kan skippen met de controller bij muziek dan. en bij podcast ze wel in de onderste bar houden. Ohja als je bij podcasts options open zegt hij track dus dat moet misschien nog anders?"
  severity: minor
  test: 2
  root_cause: "Three UI defects: (1) ProgressScrubBar in src/components/tabs/NowPlayingTab.tsx (lines 189-196) unconditionally renders -15s/+15s buttons under the playback bar for all media, duplicating renderTransportRow's -15s/+15s for spoken content and cluttering music; (2) ProgressScrubBar lacks pointer-drag handlers (onPointerDown/onPointerMove/onPointerUp) and onGamepadDirection Left/Right scrubbing; (3) src/components/common/TrackActionModal.tsx hardcodes 'Play Track', 'Start Track Radio', 'Go to Artist', 'Go to Album' without checking isSpokenContent(actionTrack)."
  artifacts:
    - path: "src/components/tabs/NowPlayingTab.tsx"
      issue: "Unconditional -15s/+15s row in ProgressScrubBar (lines 189-196) and missing pointer-drag / onGamepadDirection scrubbing"
    - path: "src/components/common/TrackActionModal.tsx"
      issue: "Hardcoded track/artist/album labels without isSpokenContent(actionTrack) branching"
  missing:
    - "Remove -15s/+15s buttons from ProgressScrubBar in NowPlayingTab.tsx (keep -15s/+15s in renderTransportRow for podcasts and Previous/Next for music)"
    - "Add pointer-drag scrubbing and onGamepadDirection Left/Right scrubbing to ProgressScrubBar while preserving controller prev/next skip for music"
    - "Use isSpokenContent(actionTrack) in TrackActionModal.tsx to display episode/show-appropriate labels"
  debug_session: .planning/debug/nowplaying-podcast-controls-and-options-wording.md
