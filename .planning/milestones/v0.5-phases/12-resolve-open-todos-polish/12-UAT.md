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
result: pass
notes: "Retested after CDP PlaylistAPI fallback (99e9006): followed playlists load and continuous playback works."

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
result: pass
notes: "Retested after UAT fixes (99e9006, 534c141): Saved episodes filter null Dev-Mode items + CDP Your Episodes fallback, RecentTab auto-refreshes and plays exact clicked track. Silent toast sound (TOAST-01) deferred to REQUIREMENTS.md backlog."

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
