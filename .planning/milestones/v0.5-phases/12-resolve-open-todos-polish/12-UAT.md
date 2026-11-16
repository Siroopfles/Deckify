---
status: complete
phase: 12-resolve-open-todos-polish
source: [12-01-SUMMARY.md, 12-02-SUMMARY.md, 12-03-SUMMARY.md]
started: 2026-11-16T14:57:00+01:00
updated: 2026-11-16T14:16:55.457Z
---

## Current Test

[testing complete]

## Tests

### 1. Followed Playlist Loading & Continuous Playback (12-01)
expected: Open a followed playlist (including from a folder or search) and click a track or Play. Tracks load properly, playback starts (waking stopped librespot if needed), and playback continues cleanly to the next track in the playlist.
result: issue
reported: "Nee werkt niet ik zie niks in de lijst staan van de playlist die ik volg. Maar het volgende nummer uit een playlist paky hij wel gelijk"
severity: major

### 2. Enable Mix on Folder/Search Playlists (12-01)
expected: Open a playlist from a folder or search and toggle Enable Mix. No missing-ID error occurs and mix toggles cleanly.
result: pass

### 3. Track-Change Notification Artwork & Sound Toggle (12-02)
expected: Play or skip to a new track with Track Notifications enabled. The toast displays crisp 48x48 album artwork, and toggling Notification Sound in Settings controls whether the toast plays a sound.
result: pass

### 4. In-Game HUD Overlay Auto-Hide Off (12-02)
expected: Disable Auto-Hide on the In-Game HUD Overlay and briefly pause or skip between tracks. The overlay stays visible across brief playback state flickers instead of disappearing prematurely.
result: pass

### 5. Custom Ducking Sliders & Non-Steam Game Covers (12-02)
expected: In Settings, ducking attenuation and 0.5-3.0s fade/hold sliders appear and adjust cleanly. In Soundtracks, Non-Steam games with local Steam grid artwork display their cover image.
result: pass
notes: "User confirmed ducking sliders and Non-Steam covers work; noted some Steam-native games still lack cover images."

### 6. Sidebar Focus, Back to Steam & Y/X Shortcuts (12-03)
expected: In the Expanded Modal sidebar, D-pad up/down navigates smoothly across the Now Playing card and Back to Steam (B) without focus trapping; pressing Y/X on the focused Now Playing card works in all modes.
result: pass

### 7. Now Playing Quick Add, Podcasts & Recent Auto-Refresh (12-03)
expected: In NowPlayingTab, clicking the quick Add to Playlist button opens TrackActionModal. In PodcastsTab, saved episodes render full rows without collapsing. In RecentTab, changing tracks refreshes Recently Played automatically.
result: issue
reported: "Now playing tab add to playlist button opens track action modal ja. Podscast tab renderd de meeste podcast gewoon goed bij followed maar niet bij saved ik heb daar maar 1tje tussen staan die goed laad de rest heeft allemaal 0:00 erbij staan. Recent tab werkt niet met de laatste nummers er tussen te zetten of te update realtime als een nummer net voorbij is. En als ik een nummer uit de lijst kies om aan te zetten pakt hij een hele andere dus dat loopt nog niet helemaal goed. Heb het idee dat dit alleen bij het eerste nummer uit de recently played lijstje gebeurt."
severity: major

## Summary

total: 7
passed: 5
issues: 2
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-12-1
  truth: "Open a followed playlist (including from a folder or search) and click a track or Play. Tracks load properly, playback starts (waking stopped librespot if needed), and playback continues cleanly to the next track in the playlist."
  status: failed
  reason: "User reported: Nee werkt niet ik zie niks in de lijst staan van de playlist die ik volg. Maar het volgende nummer uit een playlist paky hij wel gelijk"
  severity: major
  test: 1
  artifacts: []
  missing: []

- gap_id: G-12-7
  truth: "In PodcastsTab, saved episodes render full rows with valid durations; in RecentTab, changing tracks refreshes Recently Played automatically and clicking a track plays that exact track."
  status: failed
  reason: "User reported: Saved episodes in PodcastsTab mostly show 0:00 (only 1 loads properly); RecentTab does not update in real time when a track finishes, and clicking a track (especially the first one) plays a completely different track."
  severity: major
  test: 7
  artifacts: []
  missing: []
