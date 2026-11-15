# Phase 11: Home & Discovery Hub Tab - Context

**Gathered:** 2026-11-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a dedicated `"Discovery"` tab in `DeckifyExpandedModal` (`Sidebar.tsx` + `DiscoveryTab.tsx`) with horizontal focus carousels for personalized Spotify recommendations (Made For You mixes, Top Tracks, Top Artists with `short_term` / `medium_term` / `long_term` filters, and New Releases), backed by a hardened Spotify Web API client in `py_modules/spotify.py` with an exponential-backoff HTTP 429 circuit breaker and in-memory TTL caching (`1–4h`) in `py_modules/rpc_library.py`.

</domain>

<decisions>
## Implementation Decisions

### Tab Placement & Landing
- **D-01:** Add `"Discovery"` in `Sidebar.tsx` right after Now Playing / Lyrics (top of the Browse section), keeping Now Playing as the #1 sidebar item.
- **D-02:** When opening `DeckifyExpandedModal`, keep **Now Playing** as the default tab when a track is active, and open **Discovery** when nothing is playing.

### Carousels & Made For You Mixes
- **D-03:** Render `DiscoveryTab.tsx` with a **time-of-day contextual greeting header** (`Good morning` / `Good afternoon` / `Good evening`) followed by horizontal carousels in this order: **Made For You mixes**, **Top Tracks**, **Top Artists**, and **New Releases**.
- **D-04:** Populate **Made For You mixes** by matching Spotify-owned mixes (`owner.id == "spotify"`: Discover Weekly, Release Radar, Daily Mix, Daylist) from the user's library (`me/playlists`), with a **Jump Back In** (recently played contexts) fallback if the user follows no Spotify mixes.
- **D-05:** Render carousel items as **square artwork cards (~120–130px)** with 2-line title + subtitle, showing 10–15 items per horizontal `<Focusable flow-children="horizontal">` carousel, with all external images proxied through `<DeckifyImage src={url} />`.
- **D-06:** Bump `CURRENT_SCOPES_VERSION` (from `6` to `7`) in `py_modules/auth.py` / `py_modules/common.py` to include `user-top-read` — **Reversibility:** `costly` — bumping `CURRENT_SCOPES_VERSION` triggers a one-time re-authentication prompt for existing users; if a session has not yet re-authenticated and `/me/top/*` returns HTTP 403, render a clean `"Re-authenticate to unlock Top Tracks & Top Artists"` card in those sections while keeping Made For You and New Releases working.

### Item Interactions & Time-Range Filters
- **D-07:** Render a **shared time-range pill bar** (`4 Weeks` / `6 Months` / `All Time`, mapping to `short_term` / `medium_term` / `long_term`, defaulting to `6 Months`) that updates both Top Tracks and Top Artists together.
- **D-08:** Card press (`A` button) behavior by item type:
  - **Top Track:** Play immediately (passing the Top Tracks URIs sequence so Next/Prev works).
  - **Top Artist:** Drill into the Artist detail view.
  - **Mix / Playlist / Album:** Drill into the Playlist / Album tracklist view (so the user can browse/open the list), while the `Y` action menu provides quick **Play** and **Pin to QAM** actions.

### 429 Circuit Breaker & Cache TTL
- **D-09:** Cache discovery feeds in memory with **1-hour TTL** for Top Tracks & Top Artists (keyed per `time_range`) and **4-hour TTL** for New Releases & Made For You mixes, plus a compact **Refresh** button in the `DiscoveryTab` header to bypass cache on demand.
- **D-10:** Implement a global **exponential-backoff HTTP 429 circuit breaker** in `py_modules/spotify.py` (respecting `Retry-After` headers, capping backoff, and failing fast while open). When the circuit breaker is open or an upstream 429 occurs, serve **stale cached discovery data** if available alongside a subtle `"Rate limited — showing cached feed"` banner (or a friendly cooldown notice if no cached data exists yet).

### Agent's Discretion
- Exact circuit breaker backoff schedule, failure-threshold window, and stale-cache fallback metadata shape in `py_modules/spotify.py` / `py_modules/rpc_library.py`.
- Exact icon choice in `Sidebar.tsx` and horizontal scroll/focus restoration details in `DiscoveryTab.tsx`.
- Whether `Y` action menu on Top Tracks reuses `TrackActionModal` (Like, Add to Queue, Add to Playlist) and `CollectionActionModal` for mixes/albums.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` — `DISC-01`, `DISC-02`, `DISC-03` requirements
- `.planning/ROADMAP.md` — Phase 11 goal, success criteria, and 2-plan outline

### Frontend Modal & Navigation
- `src/components/DeckifyExpandedModal.tsx` — Modal tab router, default tab selection, drill-down handlers, `TrackActionModal` / `CollectionActionModal` integration
- `src/components/common/Sidebar.tsx` — Sidebar navigation items and `ViewMode` registration
- `src/components/common/DeckifyImage.tsx` — CSP-safe base64 image proxy component
- `src/types.ts` — Shared TypeScript interfaces (`ViewMode`, `Track`, `Playlist`, `Album`, `Artist`)

### Backend Spotify Client, Auth & Library RPC
- `py_modules/spotify.py` — Spotify Web API request helper (`_spotify_api_request`) and existing 429 handling
- `py_modules/rpc_library.py` — Library, playlist, album, artist, and recommendations RPC handlers
- `py_modules/auth.py` & `py_modules/common.py` — `CURRENT_SCOPES_VERSION` and OAuth PKCE scope list

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `DeckifyImage` (`src/components/common/DeckifyImage.tsx`): Existing LRU-cached, concurrency-throttled (`maxConcurrent: 4`) image proxy required for all Spotify CDN artwork in Steam CEF.
- `TrackActionModal` / `CollectionActionModal` (`src/components/common/`): Existing `Y`-button controller action overlays for tracks, playlists, and albums (including `Pin to QAM`).
- `Sidebar.tsx` & `DeckifyExpandedModal.tsx`: Established tab routing, `L1`/`R1` trigger tab switching, and detail drill-down views (`PlaylistsTab`, `AlbumsTab`, `ArtistsTab`).
- `_spotify_api_request` (`py_modules/spotify.py`): Centralized Spotify HTTP client where the 429 circuit breaker can protect all Web API calls uniformly.

### Established Patterns
- Horizontal controller navigation MUST use `<Focusable flow-children="horizontal">` (never `"row"`).
- Backend RPC methods return structured dicts (`{"ok": True, ...}` / `{"ok": False, "error": ...}`), and frontend surfaces errors via `toaster.toast`.
- Continuous polling is restricted to `me/player`; discovery endpoints must be fetched on demand with in-memory TTL caching.

### Integration Points
- `py_modules/auth.py` / `py_modules/common.py`: Bump `CURRENT_SCOPES_VERSION` to `7` and add `user-top-read`.
- `py_modules/spotify.py`: Add exponential backoff HTTP 429 circuit breaker state and discovery API helpers.
- `py_modules/rpc_library.py` & `main.py`: Expose discovery feed RPC (`get_discovery_feed(time_range, force_refresh)`).
- `src/types.ts`, `src/components/common/Sidebar.tsx`, `src/components/DeckifyExpandedModal.tsx`, `src/components/tabs/DiscoveryTab.tsx`: Register `discovery` `ViewMode`, render carousels, and wire playback/drill-down handlers.

</code_context>

<specifics>
## Specific Ideas

- Keep the ability to **open the playlist/album tracklist** when pressing `A` on a Made For You mix or New Release album (rather than only blind-playing it), while keeping `Y` menu quick-play and Pin to QAM available.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within Phase 11 scope.

</deferred>

---

*Phase: 11-home-discovery-hub-tab*
*Context gathered: 2026-11-15*
