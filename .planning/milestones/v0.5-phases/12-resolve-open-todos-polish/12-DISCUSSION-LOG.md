# Phase 12: Resolve open todos & polish - Discussion Log

**Date:** 2026-11-15
**Phase:** 12 — Resolve open todos & polish

## Gray Areas Selected
1. Stale Todo & Debug Cleanup
2. Playlist & Playback Reliability
3. Sidebar, Now Playing & Podcasts UX
4. Notifications, Ducking & Non-Steam Covers

## Questions & Decisions

### 1. Stale Todo & Debug Cleanup
- **Question:** How should Phase 12 handle the 3 resolved debug sessions and already-implemented todos?
- **Selected:** Verify & auto-archive (Recommended) — Verify each against current code/tests; move confirmed-done items to `debug/resolved/` and `todos/done/`.

### 2. Playlist & Playback Reliability
- **Question 1:** When clicking a track inside a playlist (`playlist-track-click-stops-after-song`), how should playback continue?
- **Selected:** Play with playlist context + offset (Recommended) — Pass `context_uri` + track offset (respecting current shuffle state).
- **Question 2:** How should we scope followed playlists, Enable Mix (`missing playlist_id`), and playlist Play button reliability?
- **Selected:** Fix both Play button & followed playlists + Enable Mix (Recommended) — Investigate Spotify Web API owner/URI handling for followed playlists, fix `playlist_id` passing in Enable Mix, and ensure Play button reliably starts/resumes `context_uri`.

### 3. Sidebar, Now Playing & Podcasts UX
- **Question 1:** How should Sidebar Now Playing Like/Add-to-Playlist and `NowPlayingTab` Quick Add work?
- **Selected:** Focusable sidebar Now Playing card + Y/A actions (Recommended) — Make sidebar Now Playing card focusable with Y/A actions AND add an Add to Playlist button in `NowPlayingTab`.
- **Question 2:** For Sidebar Back to Steam, Podcasts Saved Episodes (20 items), and Recently Played realtime update:
- **Selected:** Fix Back to Steam focus, Saved Episodes metadata, and Recently Played auto-refresh (Recommended).

### 4. Notifications, Ducking & Non-Steam Covers
- **Question 1:** How should track-change notifications and In-Game HUD autohide behave?
- **Selected:** Add toast sound toggle + fix cover crop + respect autohide disabled setting (Recommended).
- **Question 2:** How should customizable smooth ducking attenuation and Non-Steam game covers work?
- **Selected:** Add custom ducking attenuation slider + Non-Steam local grid covers (Recommended).
