# Phase 26 API Coverage Decision (`COVERAGE.md`)

**Phase:** 26 — Unified CDP Platform Bridge & Deep Discovery 2.0  
**Requirement:** `DISC-04`  
**Date:** 2026-11-24

## Spotify CDP `Platform.Registry` & Web API Surface

| capability | decision | reason |
|---|---|---|
| `HomeAPI` (CDP `Platform.Registry` / GraphQL `home`) | INTEGRATE | Personalized *Made For You*, *Daylist*, *Discover Weekly*, *Release Radar*, *Daily Mix* sections. Core `DISC-04` requirement (D-03); bypasses Spotify Web API Dev Mode `HTTP 403/404`. |
| `RootlistAPI` (CDP `Platform.Registry`) | INTEGRATE | User's rootlist folder tree & Spotify-owned algorithmic playlists (`37i9dQZF1...`). Migrated `_fetch_spotify_cdp_folder_tree` to `cdp_bridge.py` (D-02) as secondary mix source (D-03). |
| `PlaylistAPI` (CDP `Platform.Registry`) | INTEGRATE | Playlist metadata & tracklist contents (`getContents`). Migrated `_cdp_get_playlist_tracks` to `cdp_bridge.py` (D-02) and pre-fetches/caches mix tracklists into `discovery_mixes.json` (D-04, D-05). |
| `LibraryAPI` (CDP `Platform.Registry`) | INTEGRATE | Liked tracks & saved podcast episodes (`add`/`remove`/`getTracks`/`getEpisodes`). Migrated `_cdp_toggle_like_track`, `_cdp_get_liked_tracks`, `_cdp_get_saved_episodes` to `cdp_bridge.py` (D-02). |
| `PlayerAPI` (CDP `Platform.Registry`) | INTEGRATE | Playback speed (`setSpeed`) & mix playback trigger. Migrated `_cdp_set_playback_speed` and `set_native_playlist_mix` play trigger to `cdp_bridge.py` (D-02). Queue mutation (`QUEUE-03`) is Phase 27. |
| `RadioAPI` / Pathfinder `seedToPlaylist` (CDP `Platform.Registry`) | INTEGRATE | Native `spotify:station:{type}:{id}` radio tracklist resolution. Wires Phase 25 Tier 1 hook `_try_cdp_station_radio` (D-07, D-08) with `0ms` fast-fail on `librespot` and silent fallback to Tier 2/3. |
| `BrowseAPI` (CDP `Platform.Registry` / GraphQL `browseCategories`) | INTEGRATE | Official Spotify Browse categories for `SearchTab` idle enrichment below the 12 static Gaming & Mood tiles (D-10), silently omitted when on `librespot` or unavailable. |
| `OfflineAPI` (CDP `Platform.Registry`) | OPT-OUT | Offline download sync & storage management is explicitly scoped to Phase 28 (`CDP-01`, `CDP-02`). |
| `PlaylistMixingAPI` (CDP `Platform.Registry`) | INTEGRATE | Native Spotify playlist auto-mix toggle. Migrated `set_native_playlist_mix` from inline Fiber walker in `rpc_library.py` to `cdp_bridge.py` (D-02). |
| Spotify Web API (`/v1/me/playlists`, `/v1/me/player/play`, `/tracks`) | INTEGRATE | Cross-engine fallback & `is_liked` annotation. Merged with CDP mixes (`owner.id == "spotify"`), used for `librespot` `uris[]` playback of cached mixes (D-05). |
