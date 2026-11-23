# Phase 25: Spotify Web API Coverage Decisions

**Phase:** 25 — Universal Artist/Album Drill-Down, Instant Radio & Search 2.0
**Date:** 2026-11-23
**Status:** Approved for Planning

## Endpoint Decisions

| Endpoint / Capability | Decision | Tier / Role | Rationale |
|-----------------------|----------|-------------|-----------|
| `GET /v1/recommendations` (`seed_tracks`, `seed_artists`) | **INTEGRATE** | Radio Waterfall Tier 2 (`RADIO-01`, `D-06`) | Primary Web API recommendation source when CDP station (Tier 1 stub) is unavailable; silently falls through to Tier 3 on HTTP 403/404 or empty response (`D-07`). |
| `GET /v1/artists/{id}/top-tracks` | **INTEGRATE** | Artist Detail & Radio Tier 3 (`RADIO-01`, `D-01`, `D-02`, `D-06`) | Already integrated in `py_modules/rpc_library.py` with HTTP 403 -> `search?q=artist:{name}` fallback; reused for Artist page Top Tracks and Tier 3 radio synthesis. |
| `GET /v1/artists/{id}/albums` (`include_groups=album,single`) | **INTEGRATE** | Artist Detail & Discography Pagination (`RADIO-01`, `D-01`, `D-02`) | Reused for Artist page `Albums & Singles` and paginated `get_artist_all_tracks` (`album_limit=3` per page to prevent HTTP 429). |
| `GET /v1/albums/{id}/tracks` | **INTEGRATE** | Album Detail & Discography Pagination (`RADIO-01`, `D-01`, `D-02`, `D-03`) | Reused for Album page full track list and `get_artist_all_tracks` album-by-album expansion. |
| `GET /v1/search` (`type=track,artist,album,playlist,show,episode`, `market=from_token`) | **INTEGRATE** | Search 2.0 & Radio Tier 3 (`SEARCH-01`, `SEARCH-02`, `D-06`, `D-09`, `D-10`) | Extended to include `show,episode` with `market="from_token"` for `resume_point` metadata, curated Gaming & Mood tile queries, and Tier 3 radio synthesis. |
| `PUT /v1/me/player/play` (`uris=[...]`) | **INTEGRATE** | Radio Queue Replacement (`RADIO-01`, `D-05`) | Reused via `rpc_playback.play_tracks(plugin, uris=final_uris)` to play seed track immediately at index 0 and replace the upcoming queue on both `spotify_client` and `librespot`. |
| `GET /v1/browse/categories` | **OPT-OUT** | Excluded (`SEARCH-01`, `D-09`) | Restricted/deprecated on newer Spotify Developer apps; per `D-09`, the 12 Gaming & Mood tiles use reliable curated search queries with Playlists-first result ordering. |
| Spotify CDP Station Radio (`Platform.Registry`) | **OPT-OUT (Stubbed)** | Radio Waterfall Tier 1 (`RADIO-01`, `D-06`) | Stubbed as `_try_cdp_station_radio` returning `[]` in Phase 25; full implementation deferred to Phase 26 (`py_modules/cdp_bridge.py`). |
