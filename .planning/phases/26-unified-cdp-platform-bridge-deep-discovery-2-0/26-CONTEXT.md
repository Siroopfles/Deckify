# Phase 26: Unified CDP Platform Bridge & Deep Discovery 2.0 - Context

**Gathered:** 2026-11-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver `DISC-04` and the Phase 25 → Phase 26 handoff items:
1. Build a unified Chrome DevTools Protocol (`Platform.Registry`) evaluator in `py_modules/cdp_bridge.py` that dynamically resolves and caches the Official Spotify Client's internal React Fiber `Platform.Registry` on `window.__deckifyRegistry` over port `9229` with a `4.0s` timeout and clean error fallback.
2. Unlock personalized Spotify algorithmic mixes (*Daylist*, *Discover Weekly*, *Release Radar*, *Daily Mix 1–6*, *On Repeat*, etc.) in `DiscoveryTab`'s *Made For You* section via the CDP Pathfinder/Home/Rootlist bridge, bypassing Spotify Web API Development Mode `HTTP 403/404` restrictions.
3. Cache resolved algorithmic mix metadata and tracklists locally on disk (`~/.cache/deckify/discovery_mixes.json`) so users can browse and play those mixes even after switching their active playback engine to `librespot`.
4. Wire `py_modules/rpc_playback.py:_try_cdp_station_radio` (Phase 25 Tier 1 radio hook) to `cdp_bridge.py` when `spotify_client` is active/running, optionally enrich `SearchTab` browse categories via CDP while keeping the 12 Gaming & Mood tiles always available at the top, and handle pressing `B` in `SearchTab` when `searchQuery` is non-empty to clear search results and return to the Search idle view instead of closing the modal.

</domain>

<decisions>
## Implementation Decisions

### Unified `cdp_bridge.py` Architecture & Migration Scope
- **D-01:** Create `py_modules/cdp_bridge.py` as the single centralized Chrome DevTools Protocol (`Platform.Registry`) bridge over port `9229` (`SPOTIFY_CDP_PORT`) with a `4.0s` default evaluation timeout and clean error fallback. In injected JS, resolve the React Fiber `Platform.Registry` from `#main` (`__reactFiber$` / `__reactContainer$`), cache it on `window.__deckifyRegistry`, and automatically re-walk the Fiber tree if `window.__deckifyRegistry` is missing or invalidated after a page reload.
- **D-02:** Centralize existing inline React Fiber / `Platform.Registry` walkers (`_fetch_spotify_cdp_folder_tree`, `_cdp_toggle_like_track`, `_cdp_get_liked_tracks`, `_cdp_get_playlist_tracks`, `_cdp_get_saved_episodes`, `_cdp_set_playback_speed` in `py_modules/engine.py`, and `set_native_playlist_mix` in `py_modules/rpc_library.py`) to delegate through `py_modules/cdp_bridge.py` while keeping backwards-compatible wrapper functions and signatures in `py_modules/engine.py` so existing unit tests and callers remain 100% intact.

### Algorithmic Mixes & Cross-Engine Caching (`DISC-04`)
- **D-03:** Populate `DiscoveryTab`'s *Made For You* section by combining mixes discovered via the CDP bridge (`HomeAPI` / Pathfinder `home` query sections + `RootlistAPI` + Web API `me/playlists` where `owner.id == "spotify"`), deduplicating by URI, and sorting core algorithmic mixes to the front (*Daylist* → *Discover Weekly* → *Release Radar* → *Daily Mix 1–6* → *On Repeat* / other Spotify mixes). Fall back to *"Jump Back In"* (recently played contexts) only when neither live discovery nor the disk cache has any algorithmic mixes.
- **D-04:** Persist resolved algorithmic mix metadata and tracklists in a dedicated disk cache file `~/.cache/deckify/discovery_mixes.json` (using atomic tmp-file + `os.replace` writes, keeping `settings.json` lean for Phase 30 backups). When `get_discovery_feed` discovers mixes via CDP, eagerly pre-fetch and cache the tracklists for the top mixes (up to ~10–12 mixes, capped at 100 tracks each) via `PlaylistAPI` and refresh a mix's cached tracklist whenever it is opened in `PlaylistsTab`. — **Reversibility:** costly — changing the on-disk schema or path later requires migrating existing cached mix files across updates.
- **D-05:** Enable seamless browsing and playback of cached algorithmic mixes on `librespot`:
  - In `get_playlist_tracks(playlist_id)`: when Web API returns `HTTP 403/404` (or empty) and live CDP is unavailable, automatically serve the cached tracklist from `~/.cache/deckify/discovery_mixes.json` and annotate `is_liked`.
  - In `play_tracks(context_uri=...)` and `quick_play_pinned(uri)`: when `context_uri` targets a cached algorithmic mix and `librespot` is active (or `PUT /v1/me/player/play` with `context_uri` returns `403/404`), automatically fall back to playing the cached `uris` list (respecting `offset_uri` / `position`) so direct play, drill-down track selection, `Y` *"Play Now"*, and **Pinned QAM Pills** all work on `librespot`.
- **D-06:** Do not expire or wipe cached algorithmic mixes on `librespot` after a time limit or when the user clicks *"Refresh Feed"* while `librespot` is active (refreshing on `librespot` updates Web API sections while preserving cached *Made For You* mixes). When a mix is served from disk cache while CDP is offline, append `" · Cached"` to its subtitle in `DiscoveryTab`.

### Tier 1 Native CDP Station Radio (`_try_cdp_station_radio`)
- **D-07:** In `py_modules/rpc_playback.py:_try_cdp_station_radio`, check first whether `spotify_client` is active/running; if `librespot` is active and `spotify_client` is not running, fast-fail in `0ms` without attempting a port `9229` socket connection so `librespot` radio startup never incurs a timeout delay.
- **D-08:** When `spotify_client` is running, resolve up to 30 `spotify:track:...` URIs for the seed (`track`, `artist`, or `album`) via `cdp_bridge.py` (querying Spotify's internal radio/station resolver such as Pathfinder `seedToPlaylist` / `RadioAPI` / `PlaylistAPI` for `spotify:station:{type}:{id}`, or extracting queue track URIs from a station context) and return `list[str]` to `start_radio`. This preserves Phase 25's contract where Song Radio plays the seed track immediately first, replaces the upcoming queue with the resolved radio tracks (visible in `QueueTab`), and silently falls back to Tier 2/3 if CDP returns empty.

### SearchTab CDP Browse Enrichment & `B`-Button Clear Behavior
- **D-09:** In `SearchTab` / `DeckifyExpandedModal` (`vgp_oncancel`), pressing `B` steps back predictably:
  1. If an action modal (`TrackActionModal` / `CollectionActionModal`) is open, close that modal.
  2. If `navigationHistoryRef` has entries (e.g., user drilled down from Search results into an Artist, Album, Playlist, or Show), pop `navigationHistoryRef` and restore `SearchTab` with the search query, results, scroll position, and focus intact.
  3. If the user is actively on `SearchTab` (`mode === "search"`) with no drill-down active and `searchQuery.trim()` is non-empty, intercept `B` (`e.preventDefault()`, `e.stopPropagation()`), clear `searchQuery` to `""`, reset `searchResults` to `{}` and `tileSearchMode` to `false`, and return to the Search idle view (Recent Searches + Gaming & Mood tiles) instead of closing the modal.
  4. If `searchQuery` is already empty on the Search idle view, pressing `B` closes the Deckify modal as usual.
- **D-10:** In `SearchTab`'s idle screen, always keep the 12 curated Steam Deck **Gaming & Mood** tiles at the top for instant `0ms` controller access on both engines. When `spotify_client` CDP (or cached CDP browse categories) is available, optionally enrich `SearchTab` (e.g., surfacing official Spotify Browse category playlists / category tiles below or alongside the 12 Gaming & Mood tiles) with a 100% silent fallback to the 12 static tiles on `librespot` or when CDP is unavailable.

### the agent's Discretion
- Exact internal Spotify CDP API method probes inside `cdp_bridge.py` for Home/Pathfinder mixes, Radio station URI resolution, and Browse categories (handling across Spotify Desktop Client versions with defensive `try/catch` fallbacks).
- Exact JSON structure and track count cap inside `~/.cache/deckify/discovery_mixes.json`.
- Visual layout and controller hint bar update for `"B Clear Search"` when `mode === "search"` and `searchQuery` is non-empty.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & Requirements
- `.planning/ROADMAP.md` — Phase 26 goal and 4 success criteria
- `.planning/REQUIREMENTS.md` — `DISC-04` requirement definition
- `.planning/phases/25-universal-artist-album-drill-down-instant-radio-search-2-0/25-CONTEXT.md` — Phase 25 radio waterfall (`D-05`–`D-07`), backstack (`D-04`), and Search idle screen (`D-08`–`D-09`)

### Existing CDP, Discovery, Playback & Search Implementation
- `py_modules/engine.py` — Existing `_cdp_get_page_target`, `_cdp_call`, `_cdp_evaluate`, `_fetch_spotify_cdp_folder_tree`, `_cdp_toggle_like_track`, `_cdp_get_liked_tracks`, `_cdp_get_playlist_tracks`, `_cdp_get_saved_episodes`, `_cdp_set_playback_speed`
- `py_modules/rpc_library.py` — `get_discovery_feed`, `_fetch_made_for_you_section`, `get_playlist_tracks`, `set_native_playlist_mix`, `search_spotify`
- `py_modules/rpc_playback.py` — `_try_cdp_station_radio`, `start_radio`, `play_tracks`, `quick_play_pinned`
- `py_modules/common.py` — `DECK_HOME`, `SPOTIFY_CDP_PORT` (`9229`), `_exec`, `_save_settings`
- `src/components/tabs/DiscoveryTab.tsx` — *Made For You* carousel rendering, `DiscoveryCard`, `DiscoveryMixItem`
- `src/components/tabs/SearchTab.tsx` — Search idle screen (`RecentSearchesSection`, `GamingMoodGrid`) and `SearchResultsView`
- `src/components/DeckifyExpandedModal.tsx` — `attachNav` (`vgp_oncancel` `B`-button handler), `searchQuery` lifted state, `hintText`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `py_modules/engine.py:_cdp_call` & `_cdp_evaluate`: Pure-Python stdlib raw WebSocket CDP client on port `9229` with ping/pong framing and `Runtime.evaluate` (`awaitPromise: True, returnByValue: True`).
- `py_modules/rpc_library.py:_DISCOVERY_CACHE` & `get_discovery_feed`: Existing section-isolated TTL cache (`_STATIC_TTL_SECONDS = 14400.0`) and 429 circuit-breaker integration.
- `src/components/DeckifyExpandedModal.tsx`: Already lifts `searchQuery`, `searchFilter`, `searchResults`, and `tileSearchMode` to modal state and attaches `vgp_oncancel` on the modal wrapper.

### Established Patterns
- Steam CEF CSP requires all `spotify:image:` / `spotify:mosaic:` / `https://i.scdn.co/image/` URLs to be normalized to HTTPS URLs in Python and rendered via `<DeckifyImage>` (base64 proxy).
- Horizontal carousels and pill rows in GamepadUI must use `<Focusable flow-children="horizontal">`.
- All blocking file/socket/HTTP operations in Python RPC handlers must run via `await _exec(...)`.

### Integration Points
- `py_modules/cdp_bridge.py` (new module): Central `Platform.Registry` caching (`window.__deckifyRegistry`) imported by `py_modules/engine.py`, `py_modules/rpc_library.py`, and `py_modules/rpc_playback.py`.
- `main.py`: Expose any new optional RPCs if needed for CDP browse enrichment while preserving existing `get_discovery_feed`, `get_playlist_tracks`, `play_tracks`, `quick_play_pinned`, and `start_radio` signatures.

</code_context>

<specifics>
## Specific Ideas

- Keep the 12 Steam Deck Gaming & Mood tiles always accessible at the top of `SearchTab` even when CDP Browse enrichment is available.
- Ensure algorithmic mixes cached from `spotify_client` can be both browsed (tracklist in `PlaylistsTab`) and played (including via QAM Pinned Playlists and `Y` *"Play Now"*) when switched to `librespot`.
- Stepwise `B`-button behavior in `SearchTab`: drill-down page → search results → clear search query back to Search idle view → close modal.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

### Reviewed Todos (not folded)
- `2026-11-21-investigate-decky-loader-breakage-after-steam-update.md` — Low keyword match (`0.2`); unrelated to Phase 26 CDP bridge & Discovery 2.0.

</deferred>

---

*Phase: 26-unified-cdp-platform-bridge-deep-discovery-2-0*
*Context gathered: 2026-11-24*
