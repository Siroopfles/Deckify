---
status: diagnosed
phase: 08-controller-l2-r2-ergonomics-trigger-navigation
source: [08-01-SUMMARY.md, 08-02-SUMMARY.md, 08-03-SUMMARY.md]
started: 2026-11-14T22:19:30+01:00
updated: 2026-11-14T22:32:50+01:00
---

## Current Test

[testing complete]

## Tests

### 1. Modal Controller Actions (Y Options, X Like) & Pinned Sidebar Footer
expected: Inside the open Deckify Expanded Modal, pressing Y opens ActionMenu, pressing X toggles Like, and D-pad Down/Up cleanly reaches and exits the pinned "Back to Steam (B)" Sidebar footer.
result: issue
reported: "1. Y op now playing werkt en ziet hij maar soms gaat de controller selectie niet over op de options modal op somigge views 2. X werkt niet en liked de song niet maar dat doet de like button ook niet 3. Yes werkt"
severity: major

### 2. L2/R2 Playback Seeking, Floating Pill & Focus Preservation
expected: In Now Playing or Lyrics tab, pulling L2 or R2 seeks -10s / +10s (rapid pulls accumulate, e.g. +20s), immediately updates the seekbar, shows the floating delta pill, clamps at 0s and track end - 1s, and keeps D-pad focus on the active control.
result: issue
reported: "1. Yes werkt alleen indrukken zorgt niet dat het optelt 2. Yes 3 Yes 4. Ja klopt"
severity: minor

### 3. L2/R2 Library Fast-Paging (±15 Items & A–Z Anchors) + Content-Focus Guard
expected: With focus in the right-hand content pane, pulling L2/R2 in Liked Songs/Playlists/Albums/Queue jumps ±15 items (transferring focus + scrolling, showing N / Total pill), and in Artists or Soundtracks jumps across A–Z letter anchors (showing letter pill). While focus is in the left Sidebar, L2/R2 does nothing.
result: issue
reported: "1. Nee werkt niet gebeurt niks ook like werkt niet 2. Nope niks 3. Yes klopt maar hij doet sowieso niks haha"
severity: major

### 4. Modal-Only Scoping, Sub-Modal Suppression & Controller Settings
expected: Closing the modal disables L2/R2 trigger handling completely; opening ActionMenu, PlaylistPickerModal, or focusing Search text input suppresses L2/R2; SettingsTab displays "Controller & Trigger Navigation" with toggles and SliderFields for Seek Step (5–30s) and List Jump Size (5–50 items), plus the context-aware hint bar in the modal.
result: pass

## Summary

total: 4
passed: 1
issues: 3
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "Pressing Y opens ActionMenu with controller focus transferred into the options modal, and pressing X / Like button toggles Like status"
  status: failed
  reason: "User reported: 1. Y op now playing werkt en ziet hij maar soms gaat de controller selectie niet over op de options modal op somigge views 2. X werkt niet en liked de song niet maar dat doet de like button ook niet 3. Yes werkt"
  severity: major
  test: 1
  root_cause: "TrackActionModal renders as an inline overlay without transferring focus to its first InteractiveRow on open; toggle_like_track fails with HTTP 403 Forbidden on me/tracks/contains (observed in Steam Machine logs) and handleToggleLike silently drops res.ok === false without a toast."
  artifacts: ["src/components/common/TrackActionModal.tsx", "src/components/DeckifyExpandedModal.tsx", "py_modules/rpc_playback.py"]
  missing: []
  debug_session: ""
- truth: "Rapid consecutive L2/R2 pulls in Now Playing or Lyrics accumulate into a single pending delta (e.g. +20s)"
  status: failed
  reason: "User reported: 1. Yes werkt alleen indrukken zorgt niet dat het optelt 2. Yes 3 Yes 4. Ja klopt"
  severity: minor
  test: 2
  root_cause: "TRIGGER_DEBOUNCE_MS (300ms) in TriggerController is longer than seekDebounceTimerRef (250ms) in DeckifyExpandedModal.tsx, so a second pull within 250ms is dropped by debounce and a pull after 300ms arrives after the 250ms timer already flushed and reset pendingSeekDeltaSecRef to 0."
  artifacts: ["src/components/DeckifyExpandedModal.tsx", "src/utils/triggerController.ts"]
  missing: []
  debug_session: ""
- truth: "Pulling L2/R2 in library lists (Liked Songs, Playlists, Albums, Queue, Artists, Soundtracks) jumps ±15 items or A-Z anchors with scroll+focus transfer and position pill"
  status: failed
  reason: "User reported: 1. Nee werkt niet gebeurt niks ook like werkt niet 2. Nope niks 3. Yes klopt maar hij doet sowieso niks haha"
  severity: major
  test: 3
  root_cause: "contentPaneRef is attached to @decky/ui <Focusable ref={contentPaneRef}> which does not forward ref to a DOM element in SteamOS GamepadUI, so contentPaneRef.current?.contains(document.activeElement) is always falsy and onTrigger returns early."
  artifacts: ["src/components/DeckifyExpandedModal.tsx"]
  missing: []
  debug_session: ""
