# Phase 26 API Coverage Decision (`COVERAGE.md`)

**Phase:** 26 — Unified CDP Platform Bridge & Deep Discovery 2.0  
**Requirement:** `DISC-04`  
**Date:** 2026-11-24

## Spotify CDP `Platform.Registry` & Web API Surface

| API / Service | Surface | Decision | Rationale |
|---------------|---------|----------|-----------|
| `HomeAPI` (CDP `Platform.Registry` / GraphQL `home`) | Personalized *Made For You* / *Daylist* / *Discover Weekly* / *Release Radar* / *Daily Mix* sections | **INTEGRATE** | Core `DISC-04` requirement (D-03). Bypasses Spotify Web API Development Mode `HTTP 403/404` blocks on algorithmic mixes. |
| `RootlistAPI` (CDP `Platform.Registry`) | User's rootlist/library folder tree & Spotify-owned algorithmic playlists (`37i9dQZF1...`) | **INTEGRATE** | Existing `_fetch_spotify_cdp_folder_tree` migrated to `cdp_bridge.py` (D-02) and used as secondary algorithmic mix discovery source (D-03). |
| `PlaylistAPI` (CDP `Platform.Registry`) | Playlist metadata & tracklist contents (`getContents`) | **INTEGRATE** | Existing `_cdp_get_playlist_tracks` migrated to `cdp_bridge.py` (D-02) and used to eagerly pre-fetch/cache mix tracklists into `discovery_mixes.json` (D-04, D-05). |
| `LibraryAPI` (CDP `Platform.Registry`) | Liked tracks & saved podcast episodes (`add`/`remove`/`getTracks`/`getEpisodes`) | **INTEGRATE** | Existing `_cdp_toggle_like_track`, `_cdp_get_liked_tracks`, `_cdp_get_saved_episodes` migrated to `cdp_bridge.py` (D-02). |
| `PlayerAPI` (CDP `Platform.Registry`) | Playback speed (`setSpeed`) & mix playback trigger | **INTEGRATE** | Existing `_cdp_set_playback_speed` and `set_native_playlist_mix` play trigger migrated to `cdp_bridge.py` (D-02). Queue mutation (`QUEUE-03`) is scoped to Phase 27. |
| `RadioAPI` / Pathfinder `seedToPlaylist` (CDP `Platform.Registry`) | Native `spotify:station:{type}:{id}` radio tracklist resolution | **INTEGRATE** | Wires Phase 25 Tier 1 hook `_try_cdp_station_radio` (D-07, D-08) with `0ms` fast-fail on `librespot` and silent fallback to Tier 2/3. |
| `BrowseAPI` (CDP `Platform.Registry` / GraphQL `browseCategories`) | Official Spotify Browse categories for `SearchTab` idle enrichment | **INTEGRATE** | Optional `SearchTab` enrichment below the 12 static Gaming & Mood tiles (D-10), silently omitted when on `librespot` or unavailable. |
| `OfflineAPI` (CDP `Platform.Registry`) | Offline download sync & storage management | **OPT-OUT** | Explicitly scoped to Phase 28 (`CDP-01`, `CDP-02`). |
| `PlaylistMixingAPI` (CDP `Platform.Registry`) | Native Spotify playlist auto-mix toggle | **INTEGRATE** | Existing `set_native_playlist_mix` migrated from inline Fiber walker in `rpc_library.py` to `cdp_bridge.py` (D-02). |
| Spotify Web API (`/v1/me/playlists`, `/v1/me/player/play`, `/v1/playlists/{id}/tracks`) | Cross-engine fallback & `is_liked` annotation | **INTEGRATE** | Merged with CDP mixes (`owner.id == "spotify"`), used for `librespot` `uris[]` playback of cached mixes (D-05), and `is_liked` annotation. |
