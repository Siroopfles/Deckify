# Phase 25: Universal Artist/Album Drill-Down, Instant Radio & Search 2.0 - Context

**Gathered:** 2026-11-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver `RADIO-01`, `SEARCH-01`, `SEARCH-02`: "Start Song Radio" / "Go to Artist" / "Go to Album" from any track (`TrackActionModal`, `NowPlayingTab`, `QueueTab`, `SearchTab`) with a `navigationHistoryRef` breadcrumb backstack restored by `B`; a 3-tier radio waterfall on `spotify_client` and `librespot`; Search 2.0 idle screen (history pills + 12 Gaming & Mood tiles); Podcasts/Episodes search filters.
</domain>

<decisions>
## Implementation Decisions

### Artist/Album drill-down
- **D-01:** Reuse and extend the existing in-modal drill-down (`get_artist_top_tracks`, `get_artist_albums`, `get_album_tracks` already in `rpc_library.py`/`main.py`) into full Artist and Album pages. No new top-level tabs.
- **D-02:** Artist page: Top Tracks, Albums, a Start Artist Radio button, AND a way to browse ALL of the artist's tracks (full discography, paginated across all albums), not only the top tracks.
- **D-03:** Album page: full track list, Play and Radio actions.

### Backstack
- **D-04:** `navigationHistoryRef` stores originating tab + scroll position + exact focused item. `B` pops and restores all three. Stack capped at ~10 entries (drop oldest).

### Radio
- **D-05:** Starting radio plays the seed track immediately, then replaces the upcoming queue with radio tracks (not append).
- **D-06:** Waterfall: CDP station -> Web API recommendations -> Top-Tracks/Search synthesis. The CDP tier is a stubbed hook that is skipped until Phase 26 (cdp_bridge). Works on both `spotify_client` and `librespot`.
- **D-07:** Fallbacks are silent. One toast on success (e.g. "Song Radio started"), toast on total failure only.

### Search idle screen
- **D-08:** History pills: last 10 queries, persisted in `settings.json`, most recent first. Per-pill delete (Y button / X on pill) plus a Clear All pill. Selecting a pill runs the search.
- **D-09:** 12 Gaming & Mood tiles, controller-navigable, no virtual keyboard. Selecting a tile runs a curated search query (primary, reliable) and shows results with the Playlists section first, so it combines query search with Spotify's playlist-style discovery. Do not depend on the restricted browse-category API; if used at all, only as an optional enrichment with silent fallback. Exact 12 genres/queries are the planner's discretion (e.g. Epic Gaming, RPG Soundtracks, Synthwave, Chill, Focus, Workout, Lo-Fi).

### Search filters
- **D-10:** Filter chip row: All, Tracks, Artists, Albums, Playlists, Podcasts (`show`), Episodes (`episode`). "All" keeps today's grouped view. Episodes show Phase 24 progress / "Played" badges and play on select.

### the agent's Discretion
- Exact tile genres/queries, pill visuals, pagination size for full artist track browsing.
</decisions>

<canonical_refs>
## Canonical References

- `.planning/ROADMAP.md` (Phase 25 section) - goal and success criteria
- `.planning/REQUIREMENTS.md` - RADIO-01, SEARCH-01, SEARCH-02
- `.planning/phases/24-podcast-audiobook-power-suite/24-CONTEXT.md` - episode progress badges to reuse
- `.planning/codebase/ARCHITECTURE.md`, `CONVENTIONS.md` - `flow-children="horizontal"`, CSP image proxy, RPC error shape
</canonical_refs>

<code_context>
## Existing Code Insights

- `src/components/DeckifyExpandedModal.tsx`: `backendGetAlbumTracks`, `backendGetArtistTopTracks`, `backendGetArtistAlbums` callables; renders `SearchTab` (~L1414).
- `rpc_library.py`: `get_album_tracks`, `get_artist_albums`, `get_artist_top_tracks`, `search_spotify` (types param, needs show/episode).
- Images must go through the base64 proxy (CSP). Rate limiting: avoid heavy polling.
</code_context>

<specifics>
## Specific Ideas

User wants to be able to ultimately see ALL tracks of an artist from the Artist page.
</specifics>

<deferred>
## Deferred Ideas

- Voice search (VOICE-01) - future.
</deferred>
