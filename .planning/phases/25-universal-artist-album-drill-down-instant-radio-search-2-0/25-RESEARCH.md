# Phase 25: Universal Artist/Album Drill-Down, Instant Radio & Search 2.0 - Research

**Researched:** 2026-11-23
**Domain:** SteamOS Decky Loader React/TypeScript UI (`@decky/ui` spatial navigation + backstack) & Python Spotify Web API / playback orchestration
**Confidence:** HIGH

## Summary

Phase 25 delivers three tightly integrated capabilities on top of Deckify's existing React/TypeScript modal and Python backend: (1) universal Artist and Album drill-down with a `navigationHistoryRef` breadcrumb backstack (`RADIO-01`), (2) a 3-tier Song/Artist Radio waterfall that plays the seed immediately and replaces the upcoming queue on both `spotify_client` and `librespot` (`RADIO-01`), and (3) Search 2.0 with persisted search history pills, 12 controller-friendly Gaming & Mood browse tiles, and `Podcasts` (`show`) / `Episodes` (`episode`) filtering (`SEARCH-01`, `SEARCH-02`).

Much of the underlying plumbing already exists in the codebase: `get_album_tracks`, `get_artist_albums`, `get_artist_top_tracks` (including a `403` -> `search` fallback), `get_track_recommendations`, `TrackActionModal`, and `EpisodeRow` (with Phase 24 progress/"Played" badges) are already implemented. The primary engineering work is:
1. Replacing the flat `activeAlbum`/`activeArtist` clear-on-`B` behavior in `DeckifyExpandedModal.tsx` with a capped `navigationHistoryRef` stack (max 10 entries) storing `{ mode, activeAlbum, activeArtist, activePlaylist, activeShow, scrollTop, focusedLabel/focusedId }` and restoring all three on `B` (`vgp_oncancel`), plus wiring `Options (Y)` / `TrackActionModal` consistently across `NowPlayingTab`, `QueueTab`, `SearchTab`, and `ArtistsTab`/`AlbumsTab`.
2. Extending `ArtistsTab` with a **Start Artist Radio** action and paginated **All Tracks** (full discography across the artist's albums), and extending `AlbumsTab` with a **Radio** action.
3. Implementing a backend 3-tier radio waterfall (`start_radio`: Tier 1 stubbed CDP hook for Phase 26 -> Tier 2 Web API `/recommendations` -> Tier 3 Top-Tracks/Search synthesis) that plays the seed track immediately and replaces the queue via `play_tracks(..., uris=...)`.
4. Extending `search_spotify` in `py_modules/rpc_library.py` to support `show,episode` with `market="from_token"` and `resume_point` metadata, adding `search_history` (max 10, persisted in `DEFAULT_SETTINGS` / `settings.json`), and building the Search 2.0 idle screen (history pills + 12 Gaming & Mood tiles) and filter chips in `SearchTab.tsx`.

**Primary recommendation:** Keep zero new dependencies, implement the radio waterfall and discography aggregation in `py_modules/rpc_library.py` / `py_modules/rpc_playback.py` with strict 429/403 resilience, and manage `navigationHistoryRef` centrally inside `DeckifyExpandedModal.tsx` using non-null array initialization so existing `refValues` test harnesses remain intact.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Reuse and extend the existing in-modal drill-down (`get_artist_top_tracks`, `get_artist_albums`, `get_album_tracks` already in `rpc_library.py`/`main.py`) into full Artist and Album pages. No new top-level tabs.
- **D-02:** Artist page: Top Tracks, Albums, a Start Artist Radio button, AND a way to browse ALL of the artist's tracks (full discography, paginated across all albums), not only the top tracks.
- **D-03:** Album page: full track list, Play and Radio actions.
- **D-04:** `navigationHistoryRef` stores originating tab + scroll position + exact focused item. `B` pops and restores all three. Stack capped at ~10 entries (drop oldest).
- **D-05:** Starting radio plays the seed track immediately, then replaces the upcoming queue with radio tracks (not append).
- **D-06:** Waterfall: CDP station -> Web API recommendations -> Top-Tracks/Search synthesis. The CDP tier is a stubbed hook that is skipped until Phase 26 (cdp_bridge). Works on both `spotify_client` and `librespot`.
- **D-07:** Fallbacks are silent. One toast on success (e.g. "Song Radio started"), toast on total failure only.
- **D-08:** History pills: last 10 queries, persisted in `settings.json`, most recent first. Per-pill delete (Y button / X on pill) plus a Clear All pill. Selecting a pill runs the search.
- **D-09:** 12 Gaming & Mood tiles, controller-navigable, no virtual keyboard. Selecting a tile runs a curated search query (primary, reliable) and shows results with the Playlists section first, so it combines query search with Spotify's playlist-style discovery. Do not depend on the restricted browse-category API; if used at all, only as an optional enrichment with silent fallback. Exact 12 genres/queries are the planner's discretion (e.g. Epic Gaming, RPG Soundtracks, Synthwave, Chill, Focus, Workout, Lo-Fi).
- **D-10:** Filter chip row: All, Tracks, Artists, Albums, Playlists, Podcasts (`show`), Episodes (`episode`). "All" keeps today's grouped view. Episodes show Phase 24 progress / "Played" badges and play on select.

### the agent's Discretion
- Exact tile genres/queries, pill visuals, pagination size for full artist track browsing.

### Deferred Ideas (OUT OF SCOPE)
- Voice search (VOICE-01) - future.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RADIO-01 | User can select *"Start Song Radio"*, *"Go to Artist"*, or *"Go to Album"* from any track (`TrackActionModal`, `NowPlayingTab`, `QueueTab`, `SearchTab`), using a 3-tier radio waterfall (CDP station -> Web API -> Top-Tracks/Search synthesis fallback) and a breadcrumb backstack (`navigationHistoryRef`) that restores the exact originating tab on `B`. | `TrackActionModal.tsx`, `NowPlayingTab.tsx`, `QueueTab.tsx`, `SearchTab.tsx`, `ArtistsTab.tsx`, `AlbumsTab.tsx`, `DeckifyExpandedModal.tsx` (`navigationHistoryRef` + `vgp_oncancel`), `rpc_library.py` / `rpc_playback.py` (`start_radio`, `get_artist_all_tracks`, `get_artist_info`). |
| SEARCH-01 | When the search query in `SearchTab` is empty, user can select from recent search history pills (with individual/all clear) or 12 controller-friendly Gaming & Mood genre browse tiles without opening the virtual keyboard. | `py_modules/common.py` (`DEFAULT_SETTINGS["search_history"]`), `main.py` (`set_setting` / history RPCs), `SearchTab.tsx` (idle screen with history pills + 12 curated Gaming & Mood tiles, Playlists-first result ordering on tile launch). |
| SEARCH-02 | User can search and filter specifically by `Podcasts` (`show`) and `Episodes` (`episode`) in `SearchTab` alongside Tracks, Artists, Albums, and Playlists. | `py_modules/rpc_library.py` (`search_spotify` extended with `show,episode`, `market="from_token"`, `resume_point` parsing), `SearchTab.tsx` (7 filter chips, `EpisodeRow` reuse from `PodcastsTab.tsx`, `onOpenShow` drill-down). |
</phase_requirements>

## Project Constraints (from GEMINI.md)

- **Steam CEF Content Security Policy (CSP):** External image URLs (`https://i.scdn.co/`) are blocked; all artwork must go through the backend base64 proxy (`DeckifyImage` / `_image_url`).
- **SteamOS GamepadUI Navigation:** Horizontal button rows and filter chips MUST use `flow-children="horizontal"` (never `"row"`), and compact inline `DialogButton`s must set `width: "auto"` / `minWidth: "auto"` to override SteamOS 100% button width.
- **Process Environment Isolation:** `LD_LIBRARY_PATH` is stripped in `py_modules/common.py`; zero new C-extension or external dependencies.
- **Rate Limiting:** Avoid continuous or burst polling of heavy Spotify Web API endpoints; paginate discography fetches cleanly.
- **RPC Error Handling:** Backend RPC methods must catch exceptions and return `{ "ok": False, "error": str(e) }` (or structured dict) rather than crashing the event loop.
- **PipeWire UI Stream Isolation & Sandbox:** No duplicate `py_modules` under `bin/`; no `sys.modules[__name__]` indexing.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `navigationHistoryRef` backstack, scroll & focus restoration | Browser / Client (`DeckifyExpandedModal.tsx`) | — | Pure UI state tied to `contentPaneRef.current.scrollTop`, `mode`, active entity state, and DOM focus (`[data-deckify-list-item]`). |
| Artist / Album / Show drill-down views & Search 2.0 UI | Browser / Client (`ArtistsTab.tsx`, `AlbumsTab.tsx`, `SearchTab.tsx`, `TrackActionModal.tsx`) | — | Controller-navigable `@decky/ui` `Focusable` / `InteractiveRow` / `EpisodeRow` rendering. |
| 3-tier Radio Waterfall (`start_radio`) & queue replacement | API / Backend (`py_modules/rpc_library.py` + `rpc_playback.py`) | Engine (`spotify_client` CDP hook in Phase 26 / `librespot` via Web API `me/player/play`) | Avoids exposing multi-step fallback logic to frontend; enforces silent fallback and atomic `uris` replacement. |
| Artist full discography pagination (`get_artist_all_tracks`) & `search_spotify` (`show,episode`) | API / Backend (`py_modules/rpc_library.py`) | — | Handles Spotify OAuth token refresh, `market="from_token"`, `403`/`400` fallbacks, and `_annotate_tracks_liked`. |
| Search history persistence (`search_history`, max 10) | Database / Storage (`~/.config/deckify/settings.json` via `py_modules/common.py` & `main.py`) | Browser / Client (`SearchTab.tsx` optimistic state) | Survives modal close and SteamOS reboots using existing atomic `_save_settings`. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.x (Decky global) | Modal & tab UI rendering | Bundled by Decky Loader; already used across all tabs [VERIFIED: `package.json:54-60`]. |
| `@decky/ui` | 4.11.1 | `Focusable`, `DialogButton`, `TextField`, `toaster` | Official SteamOS GamepadUI spatial navigation primitives [VERIFIED: `package.json:29`]. |
| `@decky/api` | 1.1.3 | `callable` typed RPC bridge to Python | Existing frontend-to-backend RPC transport [VERIFIED: `package.json:46`]. |
| `react-icons` | 5.5.0 | Icons for Radio, Artist, Album, Podcast, Tiles | Already installed; zero new bundle deps [VERIFIED: `package.json:48`]. |
| Python stdlib (`urllib`, `asyncio`, `json`) | 3.11+ / 3.14 | Spotify Web API HTTP calls & `settings.json` persistence | Zero external pip dependencies; avoids PyInstaller sandbox issues [VERIFIED: `py_modules/common.py:1-5`]. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `Vitest` | 5.1.0 | Frontend component/hook unit tests | Testing backstack, Search 2.0 UI, TrackActionModal, QueueTab, NowPlayingTab [VERIFIED: `package.json:43`]. |
| `unittest` | Python stdlib | Backend RPC unit tests | Testing `start_radio` 3-tier waterfall, `search_spotify` `show`/`episode`, `get_artist_all_tracks`, `search_history` [VERIFIED: `package.json:14`]. |

**Installation:**
No new npm or pip packages required (`v0.7` constraint: zero new dependencies).

## Architecture Patterns

### System Architecture Diagram

```text
  [NowPlayingTab / QueueTab / SearchTab / TrackActionModal]
         |
         |  (A) Go to Artist / Album / Show  OR  (Y) TrackActionModal
         v
  [DeckifyExpandedModal: navigationHistoryRef.push({ mode, active*, scrollTop, focusKey })]
         |                                                       ^
         |  switch mode -> "artists" / "albums" / "episodes"     |  (B) vgp_oncancel pops stack
         v                                                       |  restores mode, entity, scrollTop, focus
  [ArtistsTab / AlbumsTab / PodcastsTab] ------------------------+
         |
         |  Start Song Radio / Start Artist Radio / Start Album Radio
         v
  [Backend RPC: start_radio(seed_type, seed_id, seed_uri, seed_name, artist_name)]
         |
         +-- Tier 1: CDP Station hook (stubbed -> None until Phase 26 cdp_bridge)
         +-- Tier 2: Web API GET /v1/recommendations (silent skip on 403/404/empty)
         +-- Tier 3: Top-Tracks + Search synthesis (artists/{id}/top-tracks + search)
         v
  [rpc_playback.play_tracks(uris=[seed_uri, ...radio_uris])] -> replaces upcoming queue
```

### Pattern 1: Breadcrumb Backstack (`navigationHistoryRef`)
**What:** Maintain `const navigationHistoryRef = useRef<NavHistoryEntry[]>([]);` (initialized to `[]`, capped at 10 entries by dropping index `0` when `length >= 10`) inside `DeckifyExpandedModal.tsx`.
**When to use:** Whenever navigating into `handleOpenArtist`, `handleOpenAlbum`, `handleOpenPlaylist`, or `handleOpenShow` from any tab (including `now_playing`, `queue`, `search`, `liked`, `recent`, `playlists`, `albums`, `artists`, `episodes`).
**Entry shape:**
```typescript
interface NavHistoryEntry {
  mode: ViewMode;
  activeAlbum: AlbumItem | null;
  activeArtist: ArtistItem | null;
  activePlaylist: PlaylistItem | null;
  activeShow: ShowItem | null;
  scrollTop: number;
  focusLabel?: string; // e.g., document.activeElement?.getAttribute("data-deckify-label")
  focusTrackId?: string;
}
```
**Restoration on `B` (`vgp_oncancel`):**
1. If `actionTrackRef.current`, `actionCollectionRef.current`, `showAddToPlaylistModal`, or `playlistPickerOpen` is open, close the overlay first (preserving existing modal-close priority).
2. Else if `Array.isArray(navigationHistoryRef.current) && navigationHistoryRef.current.length > 0`:
   - `e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation?.();`
   - Pop the top entry, restore `mode`, `activeAlbum`, `activeArtist`, `activePlaylist`, `activeShow` (clearing any current detail entity).
   - In a `requestAnimationFrame` (double-rAF if tab content remounts), restore `contentPaneRef.current.scrollTop = entry.scrollTop` and focus the matching `[data-deckify-list-item="true"][data-deckify-label="..."]` (falling back to the first `[data-deckify-list-item="true"]` or `[tabindex="0"]` in `contentPaneRef.current`).
3. Note: When switching top-level tabs via sidebar or `L1`/`R1` (`handleSelectMode`), clear `navigationHistoryRef.current = []` so `B` doesn't unexpectedly jump back across explicit top-level tab switches.

### Pattern 2: 3-Tier Radio Waterfall (`start_radio`)
**What:** Single backend RPC `start_radio(self, seed_type: str, seed_id: str, seed_uri: str = "", seed_name: str = "", artist_name: str = "") -> dict` in `py_modules/rpc_playback.py` (or `rpc_library.py`) exposed on `Plugin` in `main.py`.
**Waterfall order (D-06, D-07):**
1. **Tier 1 (CDP Station — stubbed hook):** `_try_cdp_station_radio(plugin, seed_type, seed_id, seed_uri)` returns `[]` in Phase 25; Phase 26 (`cdp_bridge.py`) will populate this hook for `spotify_client`.
2. **Tier 2 (Web API Recommendations):**
   - `track` seed -> `GET /v1/recommendations` with `{"seed_tracks": clean_id, "limit": 25}`.
   - `artist` seed -> `GET /v1/recommendations` with `{"seed_artists": clean_id, "limit": 25}`.
   - `album` seed (for D-03 Album Radio) -> pick seed track(s) from the album (or `seed_tracks` of first track) -> same waterfall.
   - Any `HTTPError` (403/404/400) or empty list falls through silently.
3. **Tier 3 (Top-Tracks / Search Synthesis Fallback):**
   - For `artist` seed (or `track` seed with `artist_id` / `artist_name`):
     - Call `artists/{artist_id}/top-tracks` (with the existing 403 -> `search?q=artist:{artist_name}` fallback pattern from `get_artist_top_tracks` in `py_modules/rpc_library.py:889-907`).
     - Supplement with 1 `GET /v1/search` call (`q={seed_name}` or `q=artist:{artist_name}`, `type=track`, `limit=25`) if fewer than 15 tracks were found.
   - Deduplicate URIs while preserving order.
4. **Queue Replacement (D-05):**
   - For Song Radio (`seed_type == "track"`): `final_uris = [seed_uri] + [u for u in candidate_uris if u != seed_uri]`, capped at 30 URIs.
   - For Artist Radio (`seed_type == "artist"`): `final_uris = candidate_uris[:30]`.
   - Call `await rpc_playback.play_tracks(plugin, uris=final_uris)` — Spotify's `PUT /v1/me/player/play` with `{"uris": final_uris}` starts `final_uris[0]` immediately and replaces the upcoming queue on both `spotify_client` and `librespot`.

### Pattern 3: Full Artist Discography Pagination (`get_artist_all_tracks`)
**What:** Per D-02, users must be able to browse ALL of an artist's tracks (paginated across all albums), not just Top Tracks.
**How:**
- Add `get_artist_all_tracks(plugin, artist_id: str, album_offset: int = 0, album_limit: int = 3) -> dict` in `py_modules/rpc_library.py`.
- Each page fetches up to `album_limit` (e.g., 3) albums from `GET /v1/artists/{artist_id}/albums?include_groups=album,single&limit=3&offset={album_offset}`, then fetches `GET /v1/albums/{alb_id}/tracks?limit=50` for those 3 albums (sequentially or bounded `asyncio.gather`), annotating `album`, `album_id`, `image_url`, `artwork_url`, and `_annotate_tracks_liked`.
- Returns `{ "ok": True, "tracks": [...], "next_album_offset": album_offset + len(albums), "has_more": (album_offset + len(albums)) < total_albums, "total_albums": total_albums }`.
- This guarantees at most 4 API calls per user "Load More" action, preventing Spotify HTTP 429 rate-limit circuit-breaker trips (`SpotifyRateLimitError`).

### Pattern 4: Search 2.0 Idle Screen & Podcasts/Episodes Filtering
**What:**
- **History Persistence:** Add `"search_history": []` to `DEFAULT_SETTINGS` in `py_modules/common.py` and validate/normalize it in `main.py:set_setting` (list of strings, trimmed, non-empty, deduplicated, max 10, most recent first). Expose or reuse `set_setting("search_history", ...)` from `SearchTab.tsx` (passing `searchHistory` via `status.settings` or a lightweight `get_search_history` / `set_setting` call).
- **Idle Screen (`!searchQuery.trim()`):**
  - **Recent Searches:** Horizontal/wrapping `Focusable` (`flow-children="horizontal"`) of up to 10 query pills. Each pill runs the search on `A` click; pressing `Y` on a focused pill or clicking its inline `×` removes that entry; a `Clear All` pill clears the array.
  - **12 Gaming & Mood Browse Tiles:** Controller-navigable grid (`Focusable` rows with `flow-children="horizontal"`, e.g. 3 rows of 4 tiles or 4 rows of 3 tiles) that never focus `TextField` / open the virtual keyboard. Selecting a tile sets `searchQuery` (or runs an immediate search with `tileSearchMode = true`), displays **Playlists** section first in `"all"` view (per D-09), and records the query in history.
  - Example 12 curated tiles: `Epic Gaming`, `RPG Soundtracks`, `Synthwave`, `Lo-Fi Beats`, `Chill Vibes`, `Deep Focus`, `High Energy Workout`, `Boss Fight Metal`, `Cyberpunk`, `Cozy Indie`, `Retro 8-Bit`, `Late Night Ambient`.
- **Podcasts & Episodes (`SEARCH-02`):**
  - Extend `search_spotify` in `py_modules/rpc_library.py:979-1061` to accept `show,episode` in `types`, pass `"market": "from_token"` in params, and parse `shows` (`ShowItem`) and `episodes` (`EpisodeItem` including `resume_position_ms` and `fully_played` from `resume_point`), guarding against `None` items.
  - Extend `SearchTab.tsx` filter chips to 7 items: `All`, `Tracks`, `Artists`, `Albums`, `Playlists`, `Podcasts`, `Episodes` (`flow-children="horizontal"`).
  - Render `Episodes` using `EpisodeRow` (imported from `PodcastsTab.tsx`) so Phase 24 progress bars and `"Played"` badges appear automatically and play on select. Render `Podcasts` (`shows`) as `InteractiveRow` calling `onOpenShow(show)`.

### Anti-Patterns to Avoid
- **Using `flow-children="row"` on filter chips or tile rows:** SteamOS GamepadUI spatial navigation requires `flow-children="horizontal"` (`ARCHITECTURE.md`).
- **Fetching all albums' tracks in a single unbounded loop:** Triggers Spotify HTTP 429 and blocks RPC; always paginate by `album_offset` / `album_limit`.
- **Using `GET /v1/browse/categories` as primary tile source:** Restricted/deprecated on newer Spotify Developer apps; use curated search queries as primary (D-09).
- **Passing `uris` without `seed_uri` at index 0 for Song Radio:** Violates D-05 ("plays the seed track immediately, then replaces the upcoming queue").
- **Unmounting `SearchTab` state when drilling into an Artist/Album/Show:** When `mode` changes to `"artists"`/`"albums"`/`"episodes"` and `SearchTab` unmounts, `searchQuery` and `searchResults` would be lost on `B` unless lifted to `DeckifyExpandedModal` (or cached in a ref/state in `DeckifyExpandedModal` / `NavHistoryEntry`). Lifting `searchQuery` / `searchResults` / `searchFilter` (or storing them in `NavHistoryEntry`) ensures `B` from a Search drill-down restores the exact search results, scroll position, and focused item!

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Episode progress bars & "Played" badges in SearchTab | Custom episode row markup | `EpisodeRow` exported from `src/components/tabs/PodcastsTab.tsx:67` | Already implements `computeProgress`, `formatRemainingTime`, `"Played"` badge, and `DeckifyImage` CSP proxy. |
| Track context menu & Like/Queue/Playlist actions | Per-tab action menus | `TrackActionModal` in `src/components/common/TrackActionModal.tsx` | Already handles focus trapping/restoration (`previousFocusRef`) and all track actions. |
| Artwork loading in CEF | Direct `<img src="https://i.scdn.co/...">` | `DeckifyImage` (`get_image` base64 proxy) | Steam CEF CSP blocks external `https://` images. |
| Audio playback & device wake/transfer | Raw `PUT me/player/play` in radio RPC | `rpc_playback.play_tracks(plugin, uris=...)` | Handles `librespot` auto-wake, `_auto_transfer_and_play` on 404, and `spotify_client` uniformly. |

## Common Pitfalls

### Pitfall 1: `DeckifyExpandedModal.test.tsx` `refValues` Mutation
**What goes wrong:** In `src/components/DeckifyExpandedModal.test.tsx:203-207`, the `vgp_oncancel` test iterates all `refValues` and overwrites any `r.current === null` with `{ id: "pl-1", name: "Test Playlist" }`.
**Why it happens:** The test uses a mock `useRef` tracker to activate `actionTrackRef` / `activeAlbumRef` / etc.
**How to avoid:** Initialize `navigationHistoryRef = useRef<NavHistoryEntry[]>([])` (non-null array) and guard pops with `Array.isArray(navigationHistoryRef.current)`.
**Warning signs:** `TypeError: navigationHistoryRef.current.pop is not a function` in `DeckifyExpandedModal.test.tsx`.

### Pitfall 2: `set_setting` Rejecting Unknown Keys
**What goes wrong:** Calling `backendSetSetting("search_history", [...])` fails with `{ ok: false, error: "unknown setting: search_history" }` if `search_history` is not in `DEFAULT_SETTINGS`.
**Why it happens:** `main.py:845-846` strictly checks `if key not in DEFAULT_SETTINGS:`.
**How to avoid:** Add `"search_history": []` to `DEFAULT_SETTINGS` in `py_modules/common.py` and add list-of-strings sanitization (max 10 items) in `main.py:set_setting`.

### Pitfall 3: `search_spotify` Missing `market="from_token"` or Crashing on `None` Items
**What goes wrong:** Spotify `/v1/search` with `type=show,episode` omits `resume_point` or returns 400 without `market="from_token"`, and Spotify's search response arrays (`playlists`, `shows`, `episodes`) occasionally contain `null` elements.
**Why it happens:** Spotify API returns `null` for unavailable/region-locked items in search results.
**How to avoid:** Always pass `"market": "from_token"` in `search_spotify` and guard `if not item or not isinstance(item, dict): continue` for all entity loops.

### Pitfall 4: Losing `SearchTab` Query/Results on Drill-Down + `B`
**What goes wrong:** Clicking an Artist/Album/Show in `SearchTab` switches `mode` away from `"search"`, unmounting `SearchTab`. Pressing `B` returns to `"search"` with an empty input and no results to scroll/focus back to.
**Why it happens:** `searchQuery`, `searchResults`, `searchTab` currently live in `SearchTab` local `useState` (`SearchTab.tsx:39-47`).
**How to avoid:** Lift `searchQuery`, `searchFilter`, `searchResults`, and `searchTileMode` state to `DeckifyExpandedModal.tsx` (or persist in a ref) so `SearchTab` restores instantaneously on `B` and `scrollTop` + focus restoration find the exact DOM row.

### Pitfall 5: `TrackActionModal` Label & `QueueTab` / `NowPlayingTab` Parity
**What goes wrong:** `TrackActionModal.tsx:161` currently labels the radio action `"Start Track Radio"`, and `QueueTab.tsx` does not pass `onOpenActions` to rows (only `Y` via `onFocusTrack` works, and `currentlyPlaying` card has no focus/options trigger).
**How to avoid:** Update label to `"Start Song Radio"` in `TrackActionModal.tsx`, pass `onOpenActions` into `QueueTab.tsx` (adding an `Options (Y)` trigger on queue rows and making the `currentlyPlaying` card focusable/actionable), and ensure `NowPlayingTab` `+` / `Y` opens `TrackActionModal` with `artist_id` and `album_id` populated (already present on `status.track_meta` in `main.py:2023-2024`).

## Code Examples

### Verified In-Repo Pattern: `search_spotify` with `market="from_token"` and `resume_point`
```python
# Source: py_modules/rpc_library.py:798-814 & 996-1007 (extended for Phase 25)
data = await _exec(
    _spotify_api_request, "search", token, "GET",
    {
        "q": query,
        "type": types,
        "limit": final_limit,
        "offset": final_offset,
        "market": "from_token",
    },
)
```

### Verified In-Repo Pattern: `play_tracks` for Radio Queue Replacement
```python
# Source: py_modules/rpc_playback.py:402-422
# Calling play_tracks(plugin, uris=final_uris) sets body["uris"] = final_uris
# and issues PUT me/player/play, replacing the upcoming queue on both
# spotify_client and librespot.
res = await rpc_playback.play_tracks(plugin, uris=final_uris)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Flat `activeAlbum`/`activeArtist` state cleared by `B` | `navigationHistoryRef` stack (capped at 10) restoring mode, scrollTop, and focused row | Phase 25 | Eliminates disorienting jumps to `AlbumsTab`/`ArtistsTab` root on `B`. |
| Single-tier `get_track_recommendations` | 3-tier waterfall (CDP hook -> Web API recommendations -> Top-Tracks/Search synthesis) | Phase 25 | Resilient against Spotify Dev Mode 403/404 restrictions on `/recommendations` and `/top-tracks`. |
| Empty SearchTab blank screen | Search 2.0 idle screen (10 persisted history pills + 12 Gaming & Mood tiles) + `show`/`episode` filters | Phase 25 | Zero-keyboard controller discovery + unified podcast/music search. |

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified — uses existing Node.js v25.1.0, pnpm 10.28.0, Python 3.14.0, Vitest 5.1.0, and Python `unittest`).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework (Frontend) | Vitest 5.1.0 (`npx vitest run` / `pnpm test`) |
| Framework (Backend) | Python `unittest` (`py -3 -m unittest discover -s tests -p "test_*.py"`) |
| Config file | `package.json` (Vitest defaults) |
| Quick run command | `npx vitest run src/components/DeckifyExpandedModal.test.tsx` & `py -3 -m unittest tests.test_phase25_radio_search` |
| Full suite command | `pnpm test && py -3 -m unittest discover -s tests -p "test_*.py"` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RADIO-01 | `start_radio` 3-tier waterfall (CDP stub -> Web API recs -> Top-Tracks/Search synthesis) & `play_tracks` queue replacement | unit (Python) | `py -3 -m unittest tests.test_phase25_radio_search -v` | ❌ Wave 0 |
| RADIO-01 | `get_artist_all_tracks` discography pagination & `get_artist_info` | unit (Python) | `py -3 -m unittest tests.test_phase25_radio_search -v` | ❌ Wave 0 |
| RADIO-01 | `navigationHistoryRef` push/pop on `B`, cap at 10, scrollTop & focus restoration, `TrackActionModal` / `NowPlayingTab` / `QueueTab` / `SearchTab` actions | unit (Vitest) | `npx vitest run src/components/DeckifyExpandedModal.test.tsx` | ✅ (extend) |
| SEARCH-01 | `search_history` persistence in `DEFAULT_SETTINGS` / `set_setting` (max 10, dedup, delete, clear) | unit (Python) | `py -3 -m unittest tests.test_phase25_radio_search -v` | ❌ Wave 0 |
| SEARCH-01 | `SearchTab` idle screen: history pills (run, delete, clear all) + 12 Gaming & Mood tiles (no virtual keyboard, Playlists-first) | unit (Vitest) | `npx vitest run src/components/tabs/SearchTab.test.tsx` | ❌ Wave 0 |
| SEARCH-02 | `search_spotify` `show` & `episode` parsing with `market="from_token"` and `resume_point` | unit (Python) | `py -3 -m unittest tests.test_phase25_radio_search -v` | ❌ Wave 0 |
| SEARCH-02 | `SearchTab` 7 filter chips (`All`, `Tracks`, `Artists`, `Albums`, `Playlists`, `Podcasts`, `Episodes`), `EpisodeRow` progress/Played badges, `onOpenShow` | unit (Vitest) | `npx vitest run src/components/tabs/SearchTab.test.tsx` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run <modified_test_file>` and/or `py -3 -m unittest tests.test_phase25_radio_search`
- **Per wave merge:** `pnpm test && py -3 -m unittest discover -s tests -p "test_*.py"`
- **Phase gate:** Full suite green + `pnpm lint` + `pnpm typecheck` + `pnpm build` before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/test_phase25_radio_search.py` — covers `start_radio` waterfall, `get_artist_all_tracks`, `search_spotify` (`show`/`episode`), and `search_history` settings validation.
- [ ] `src/components/tabs/SearchTab.test.tsx` — covers Search 2.0 idle screen (history pills + 12 tiles), Playlists-first tile results, 7 filter chips, and `EpisodeRow` rendering.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Reuses existing `plugin._ensure_token()` OAuth PKCE flow. |
| V3 Session Management | no | No session/cookie changes. |
| V4 Access Control | no | Local Decky RPC only. |
| V5 Input Validation | yes | URL-encode `artist_id`/`seed_id`/`album_id` via `urllib.parse.quote(..., safe="")`, validate `search_history` as bounded list of non-empty strings (max 10, length-capped) in `set_setting`, and clamp `limit`/`offset` integers in `search_spotify` & `get_artist_all_tracks`. |
| V6 Cryptography | no | No cryptographic operations. |

### Known Threat Patterns for Decky Plugin / Spotify API

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path/Query injection in Spotify API path segments (`artist_id`, `seed_id`) | Tampering | Always sanitize/quote path parameters with `urllib.parse.quote(id.strip(), safe="")` (matching `get_show_episodes` in `py_modules/rpc_library.py:764`). |
| Unbounded `settings.json` growth via `search_history` | Denial of Service | Cap `search_history` to 10 entries and truncate individual query strings (e.g., max 200 chars) in `set_setting`. |

## Sources

### Primary (HIGH confidence)
- In-repo source inspection: `py_modules/rpc_library.py`, `py_modules/rpc_playback.py`, `py_modules/common.py`, `main.py`, `src/types.ts`, `src/components/DeckifyExpandedModal.tsx`, `src/components/common/TrackActionModal.tsx`, `src/components/common/InteractiveRow.tsx`, `src/components/common/TrackRowItem.tsx`, `src/components/tabs/NowPlayingTab.tsx`, `src/components/tabs/QueueTab.tsx`, `src/components/tabs/SearchTab.tsx`, `src/components/tabs/ArtistsTab.tsx`, `src/components/tabs/AlbumsTab.tsx`, `src/components/tabs/PodcastsTab.tsx`, `src/components/DeckifyExpandedModal.test.tsx`.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies; all libraries verified in `package.json`.
- Architecture: HIGH — all existing RPCs, state hooks, and test patterns directly observed in codebase.
- Pitfalls: HIGH — `DEFAULT_SETTINGS` whitelist, `refValues` test mutation, `market="from_token"`, and SearchTab state lifting all verified from source.

**Research date:** 2026-11-23
**Valid until:** 2026-12-23 (stable codebase & internal contracts)
