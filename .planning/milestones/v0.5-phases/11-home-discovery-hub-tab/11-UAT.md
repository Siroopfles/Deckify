---
status: complete
phase: 11-home-discovery-hub-tab
source: [11-01-SUMMARY.md, 11-02-SUMMARY.md]
started: 2026-11-16T15:18:00+01:00
updated: 2026-11-16T14:30:15.351Z
---

## Current Test

[testing complete]

## Tests

### 1. Discovery Tab Placement & Idle Default Landing
expected: In the Expanded Modal sidebar, Discovery appears right after Lyrics with a compass icon. Opening the modal when nothing is playing defaults to Discovery; opening when a track is active defaults to Now Playing.
result: pass

### 2. Greeting, Time-Range Pills & Refresh Feed
expected: On Discovery, a time-of-day greeting, Refresh Feed button, and time-range pills (4 Weeks / 6 Months / All Time) appear; switching pills updates Top Tracks and Top Artists cleanly (or shows Re-authenticate Spotify if user-top-read scope is needed).
result: pass

### 3. Horizontal Carousels, Artwork & Controller Focus
expected: The 4 horizontal carousels (Made For You / Jump Back In, Top Tracks, Top Artists, New Releases) display 128x128 artwork, scroll horizontally with D-pad Left/Right without vertical focus jumps, and show a focus halo.
result: pass

### 4. Card Actions (A Play/Open & Y Action Menu)
expected: Pressing A on a Top Track plays it, on a Top Artist opens artist detail, and on a Mix/Album opens its tracklist; pressing Y opens the Track or Collection action menu cleanly.
result: issue
reported: "New releases niet persoonlijk afgestemd (random nummers/afspeellijsten); Jump Back In opent een niet-gerelateerde eigen playlist of laadt 0 tracks; Top Tracks speelt een heel ander nummer af als je op een nummer drukt."
severity: major

## Summary

total: 4
passed: 3
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-11-4
  truth: "Pressing A on a Top Track plays that exact track; pressing A on a Jump Back In / Mix item opens its actual tracklist; New Releases surfaces relevant releases."
  status: failed
  reason: "User reported: Top Tracks plays a different track when clicked; Jump Back In opens an unrelated playlist or loads 0 tracks; New Releases shows random unpersonalized tracks/playlists."
  severity: major
  test: 4
  artifacts: []
  missing: []
