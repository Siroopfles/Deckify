---
status: complete
phase: 07-game-specific-soundtracks-appid-linking-lifecycle-automation
source: [07-VERIFICATION.md]
started: 2026-11-14T18:43:00Z
updated: 2026-11-14T19:15:57.187Z
---

## Current Test

[testing complete]

## Tests

### 1. SteamOS GamepadUI Spatial Navigation & Visual Layout
expected: Sidebar Soundtracks icon focuses cleanly, game cards and horizontal button/chip rows navigate without focus traps, PlaylistPickerModal selects playlists/albums/search results cleanly, and Steam CDN game covers render via base64 proxy without CSP errors.
result: issue
reported: "1) Plaatjes bij de games laden niet. 2) PlaylistPickerModal krijgt geen controller-focus (bewegen gaat nog over SoundtracksTab erachter). 3) B indrukken op een geselecteerde slider sluit heel de Spotify modal (ook op andere plekken). 4) Gekozen playlist in PlaylistPickerModal verschijnt niet zichtbaar als toegevoegd. 5) B indrukken terwijl PlaylistPickerModal openstaat sluit heel Spotify i.p.v. alleen de picker."
severity: major

### 2. Live Game Launch/Exit Lifecycle & Spotify Connect Wake-Up
expected: Soundtrack starts after ~3.5s launch debounce (waking Connect if idle), QAM bind button appears while running, and exiting restores pre-game playback context, track, and seek position after ~3.0s debounce (or stays paused if manually paused).
result: issue
reported: "Ik zie bij QAM helemaal niet de knop er tussen staan dus kan dit niet testen."
severity: major

## Summary

total: 2
passed: 0
issues: 2
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "Steam CDN game covers render via base64 proxy without CSP errors"
  status: failed
  reason: "De plaatjes bij de games laden niet."
  severity: major
  test: 1
  artifacts: []
  missing: []
- truth: "PlaylistPickerModal traps controller focus, closes on B without closing DeckifyExpandedModal, and adds selected playlist visibly to the game profile"
  status: failed
  reason: "PlaylistPickerModal krijgt geen controller-focus, B indrukken sluit heel Spotify i.p.v. alleen de picker, en een gekozen playlist verschijnt niet als toegevoegd."
  severity: major
  test: 1
  artifacts: []
  missing: []
- truth: "Pressing B on a focused/selected slider does not close DeckifyExpandedModal"
  status: failed
  reason: "B indrukken op een geselecteerde slider sluit heel de Spotify modal (ook op andere plekken)."
  severity: major
  test: 1
  artifacts: []
  missing: []
- truth: "QAM shows 1-click Bind current music to game button while a game is running and AppLifetime launch/exit automation triggers"
  status: failed
  reason: "Ik zie bij QAM helemaal niet de knop er tussen staan dus kan dit niet testen."
  severity: major
  test: 2
  artifacts: []
  missing: []
