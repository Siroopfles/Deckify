# Phase 26: Unified CDP Platform Bridge & Deep Discovery 2.0 - Research

**Researched:** 2026-11-24
**Domain:** Chrome DevTools Protocol (CDP) `Platform.Registry` JS Bridge, Spotify Algorithmic Mixes, Cross-Engine Disk Caching, GamepadUI Search Navigation
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Create `py_modules/cdp_bridge.py` as the single centralized Chrome DevTools Protocol (`Platform.Registry`) bridge over port `9229` (`SPOTIFY_CDP_PORT`) with a `4.0s` default evaluation timeout and clean error fallback. In injected JS, resolve the React Fiber `Platform.Registry` from `#main` (`__reactFiber$` / `__reactContainer$`), cache it on `window.__deckifyRegistry`, and automatically re-walk the Fiber tree if `window.__deckifyRegistry` is missing or invalidated after a page reload.
- **D-02:** Centralize existing inline React Fiber / `Platform.Registry` walkers (`_fetch_spotify_cdp_folder_tree`, `_cdp_toggle_like_track`, `_cdp_get_liked_tracks`, `_cdp_get_playlist_tracks`, `_cdp_get_saved_episodes`, `_cdp_set_playback_speed` in `py_modules/engine.py`, and `set_native_playlist_mix` in `py_modules/rpc_library.py`) to delegate through `py_modules/cdp_bridge.py` while keeping backwards-compatible wrapper functions and signatures in `py_modules/engine.py` so existing unit tests and callers remain 100% intact.
- **D-03:** Populate `DiscoveryTab`'s *Made For You* section by combining mixes discovered via the CDP bridge (`HomeAPI` / Pathfinder `home` query sections + `RootlistAPI` + Web API `me/playlists` where `owner.id == "spotify"`), deduplicating by URI, and sorting core algorithmic mixes to the front (*Daylist* → *Discover Weekly* → *Release Radar* → *Daily Mix 1–6* → *On Repeat* / other Spotify mixes). Fall back to *"Jump Back In"* (recently played contexts) only when neither live discovery nor the disk cache has any algorithmic mixes.
- **D-04:** Persist resolved algorithmic mix metadata and tracklists in a dedicated disk cache file `~/.cache/deckify/discovery_mixes.json` (using atomic tmp-file + `os.replace` writes, keeping `settings.json` lean for Phase 30 backups). When `get_discovery_feed` discovers mixes via CDP, eagerly pre-fetch and cache the tracklists for the top mixes (up to ~10–12 mixes, capped at 100 tracks each) via `PlaylistAPI` and refresh a mix's cached tracklist whenever it is opened in `PlaylistsTab`. — **Reversibility:** costly — changing the on-disk schema or path later requires migrating existing cached mix files across updates.
- **D-05:** Enable seamless browsing and playback of cached algorithmic mixes on `librespot`:
  - In `get_playlist_tracks(playlist_id)`: when Web API returns `HTTP 403/404` (or empty) and live CDP is unavailable, automatically serve the cached tracklist from `~/.cache/deckify/discovery_mixes.json` and annotate `is_liked`.
  - In `play_tracks(context_uri=...)` and `quick_play_pinned(uri)`: when `context_uri` targets a cached algorithmic mix and `librespot` is active (or `PUT /v1/me/player/play` with `context_uri` returns `403/404`), automatically fall back to playing the cached `uris` list (respecting `offset_uri` / `position`) so direct play, drill-down track selection, `Y` *"Play Now"*, and **Pinned QAM Pills** all work on `librespot`.
- **D-06:** Do not expire or wipe cached algorithmic mixes on `librespot` after a time limit or when the user clicks *"Refresh Feed"* while `librespot` is active (refreshing on `librespot` updates Web API sections while preserving cached *Made For You* mixes). When a mix is served from disk cache while CDP is offline, append `" · Cached"` to its subtitle in `DiscoveryTab`.
- **D-07:** In `py_modules/rpc_playback.py:_try_cdp_station_radio`, check first whether `spotify_client` is active/running; if `librespot` is active and `spotify_client` is not running, fast-fail in `0ms` without attempting a port `9229` socket connection so `librespot` radio startup never incurs a timeout delay.
- **D-08:** When `spotify_client` is running, resolve up to 30 `spotify:track:...` URIs for the seed (`track`, `artist`, or `album`) via `cdp_bridge.py` (querying Spotify's internal radio/station resolver such as Pathfinder `seedToPlaylist` / `RadioAPI` / `PlaylistAPI` for `spotify:station:{type}:{id}`, or extracting queue track URIs from a station context) and return `list[str]` to `start_radio`. This preserves Phase 25's contract where Song Radio plays the seed track immediately first, replaces the upcoming queue with the resolved radio tracks (visible in `QueueTab`), and silently falls back to Tier 2/3 if CDP returns empty.
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

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DISC-04 | `DiscoveryTab` unlocks personalized Spotify algorithmic mixes (*Daylist*, *Discover Weekly*, *Release Radar*, *Daily Mix 1–6*) via a unified CDP Pathfinder/Rootlist bridge (`py_modules/cdp_bridge.py`), caching resolved track URIs so both `spotify_client` and `librespot` can play them. | Centralized `py_modules/cdp_bridge.py` (`window.__deckifyRegistry`), `HomeAPI`/`RootlistAPI`/`PlaylistAPI` probing, atomic `~/.cache/deckify/discovery_mixes.json` store, `get_playlist_tracks` & `play_tracks` cross-engine cache fallback, Tier 1 `_try_cdp_station_radio`, and `SearchTab` CDP enrichment + `B`-button clear-search handler. |
</phase_requirements>

## Project Constraints (from GEMINI.md)

- **Steam CEF Content Security Policy:** Steam GamepadUI blocks direct external image URLs (`https://i.scdn.co/`). All `spotify:image:` / `spotify:mosaic:` URIs resolved via CDP must be normalized to `https://i.scdn.co/image/<id>` in Python/JS and rendered through `<DeckifyImage>` (base64 backend proxy).
- **SteamOS GamepadUI Navigation:** Controller focus relies on spatial navigation (`flow-children="horizontal"` for horizontal carousels/rows); focus traps or navigation loss degrade UX.
- **Steam Deck Environment:** Runs in `deck` user space (UID 1000) under SteamOS 3.5+, using `DECK_HOME` (`py_modules/common.py:63-68`).
- **Async Event Loop Safety:** All blocking socket/file/HTTP operations in Python RPC handlers must run via `await _exec(...)` (`py_modules/common.py:554`) and wrap external calls in `try/except`, returning structured `{ "ok": False, "error": ... }` dictionaries.
- **Code Style & Quality:** 2-space indent in TypeScript/TSX with semicolons; 4-space indent in Python; zero ESLint warnings (`eslint src/`) and clean `tsc --noEmit`; pre-commit Husky + lint-staged gates.
- **Module Boundaries:** Keep `main.py` RPC signatures backwards-compatible; never place duplicate Python modules under `bin/`.

## Summary

Phase 26 consolidates all Official Spotify Client Chrome DevTools Protocol (`9229`) interactions into a single reusable module, `py_modules/cdp_bridge.py`, and uses it to unlock personalized Spotify algorithmic mixes (*Daylist*, *Discover Weekly*, *Release Radar*, *Daily Mix 1–6*, *On Repeat*) in `DiscoveryTab` across both `spotify_client` and `librespot`. Currently, six functions in `py_modules/engine.py` (`_fetch_spotify_cdp_folder_tree`, `_cdp_toggle_like_track`, `_cdp_get_liked_tracks`, `_cdp_get_playlist_tracks`, `_cdp_get_saved_episodes`, `_cdp_set_playback_speed`) and `set_native_playlist_mix` in `py_modules/rpc_library.py` each duplicate the `#main` React Fiber BFS traversal and `spotify:image:` URL parser inline `[VERIFIED: py_modules/engine.py:472-960; py_modules/rpc_library.py:369-412]`. Centralizing this into `cdp_bridge.py` with `window.__deckifyRegistry` caching and a `4.0s` default timeout eliminates duplication and prepares the shared Platform API layer required by Phases 26–28.

For `DISC-04`, Spotify Web API Development Mode restricts algorithmic playlists (`owner.id == "spotify"`, e.g. *Discover Weekly*, *Daily Mixes*, *Daylist*) with `HTTP 403/404` on `/playlists/{id}` and `/me/playlists` `[VERIFIED: py_modules/rpc_library.py:93-105, 174-185]`. By querying `HomeAPI` / `RootlistAPI` / `GraphQL` via `cdp_bridge.py` when `spotify_client` is running, `get_discovery_feed` can discover these mixes, sort core algorithmic mixes to the front, eagerly pre-fetch up to 10–12 mix tracklists (capped at 100 tracks each) via `PlaylistAPI`, and atomically persist them to `~/.cache/deckify/discovery_mixes.json` (`tmp_path` + `os.replace`). When the user switches to `librespot` (or CDP is offline), `get_discovery_feed`, `get_playlist_tracks`, `play_tracks`, and `quick_play_pinned` transparently serve and play from this disk cache without expiring it.

Finally, Phase 26 completes the three Phase 25 → Phase 26 handoff items: (1) wiring `rpc_playback.py:_try_cdp_station_radio` to `cdp_bridge.py` with a `0ms` fast-fail when `spotify_client` is not running, (2) optionally enriching `SearchTab`'s idle screen with CDP Browse categories below the 12 static Gaming & Mood tiles, and (3) intercepting `B` (`vgp_oncancel`) in `DeckifyExpandedModal.tsx` when `mode === "search"` and `searchQuery.trim()` is non-empty to clear the search back to the Search idle view.

**Primary recommendation:** Build `py_modules/cdp_bridge.py` first with an injectable `eval_fn` parameter (defaulting to `engine._cdp_evaluate`) so existing `unittest.mock.patch.object(engine, "_cdp_evaluate", ...)` tests continue passing without modification, then layer the atomic `discovery_mixes.json` cache, `rpc_library.py` / `rpc_playback.py` integrations, and `DeckifyExpandedModal.tsx` / `SearchTab.tsx` UI updates on top.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| CDP `Platform.Registry` evaluation & caching (`window.__deckifyRegistry`) | API / Backend (`py_modules/cdp_bridge.py`) | Spotify Client CEF (`#main` Fiber tree) | Backend owns port `9229` WebSocket lifecycle, `4.0s` timeout, and clean fallback; injected JS only walks DOM/Fiber and returns plain JSON. |
| Algorithmic mix discovery & disk persistence (`~/.cache/deckify/discovery_mixes.json`) | API / Backend (`py_modules/rpc_library.py`) | Database / Storage (`~/.cache/deckify/`) | Backend merges CDP + Web API mixes, deduplicates/sorts, pre-fetches tracklists, and performs atomic `os.replace` writes. |
| Cross-engine mix playback & Tier 1 CDP radio | API / Backend (`py_modules/rpc_playback.py`) | Playback Engine (`spotify_client` / `librespot`) | `play_tracks`, `quick_play_pinned`, and `_try_cdp_station_radio` resolve cached URIs or CDP station tracks before calling Spotify Connect `/me/player/play`. |
| Search idle enrichment & `B`-button clear-search navigation | Browser / Client (`DeckifyExpandedModal.tsx`, `SearchTab.tsx`) | API / Backend (`get_search_browse_categories`) | Modal `vgp_oncancel` owns controller back-button routing and `hintText`; `SearchTab` renders static tiles immediately and optional CDP categories when available. |

## Standard Stack

### Core
| Library / Module | Version | Purpose | Why Standard |
|------------------|---------|---------|--------------|
| Python stdlib (`socket`, `json`, `urllib.request`, `os`, `asyncio`) | Python 3.11+ / 3.14 `[VERIFIED: py --version]` | Raw WebSocket CDP client, atomic disk cache (`os.replace`), async executor (`_exec`) | Zero external pip dependencies; avoids Decky PyInstaller `LD_LIBRARY_PATH` conflicts. |
| React / TypeScript / `@decky/ui` / `@decky/api` | React 19.x, TS 5.9.3, `@decky/ui` 4.11.1, `@decky/api` 1.1.3 `[VERIFIED: package.json:29,41,46]` | `DiscoveryTab`, `SearchTab`, `DeckifyExpandedModal` (`vgp_oncancel`, `Focusable`, `callable`) | Native SteamOS GamepadUI spatial navigation and Decky RPC bridge. |

### Supporting
| Library / Module | Version | Purpose | When to Use |
|------------------|---------|---------|-------------|
| `py_modules/engine.py` (`_cdp_evaluate`, `_cdp_call`, `_cdp_get_page_target`) | In-repo `[VERIFIED: py_modules/engine.py:274-430]` | Low-level raw WebSocket CDP transport on `SPOTIFY_CDP_PORT = 9229` | Underlying transport invoked by `py_modules/cdp_bridge.py`. |
| `py_modules/common.py` (`DECK_HOME`, `SPOTIFY_CDP_PORT`, `_exec`, `_save_settings`) | In-repo `[VERIFIED: py_modules/common.py:58-68, 534-555]` | Path resolution (`DECK_HOME`), port constant (`9229`), and async thread-pool execution | Every disk/socket call in `cdp_bridge.py` and `rpc_library.py`. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Pure-Python stdlib WebSocket in `engine.py` + `cdp_bridge.py` | Third-party `websockets` / `websocket-client` pip package | External pip packages break Decky Loader's bundled Python sandbox on SteamOS; stdlib `_cdp_call` already handles ping/pong and extended payload frames `[VERIFIED: py_modules/engine.py:290-409]`. |
| Separate `~/.cache/deckify/discovery_mixes.json` | Storing mix tracklists inside `settings.json` | Rejected per D-04: keeps `settings.json` lean for Phase 30 profile backups. |

**Installation:**
No new packages required (0 npm, 0 pip dependencies).

## Package Legitimacy Audit

> No external npm, PyPI, or crates packages are installed or added in Phase 26. All new functionality uses Python standard library modules and existing workspace dependencies (`package.json`).

## Architecture Patterns

### System Architecture Diagram

```text
  [DeckifyExpandedModal / DiscoveryTab / SearchTab]
        │ (Decky @decky/api RPC)
        ▼
  [main.py] ──► [rpc_library.py / rpc_playback.py]
                      │
        ┌─────────────┴──────────────────────────┐
        │ spotify_client running?                │ librespot active / CDP offline
        ▼                                        ▼
  [py_modules/cdp_bridge.py]            [~/.cache/deckify/discovery_mixes.json]
   │  (port 9229, 4.0s timeout)          │  (atomic tmp + os.replace, no expiry)
   │  window.__deckifyRegistry           │
   ▼                                     ▼
  [Spotify Client CEF #main]       [Cached Mixes & Track URIs]
   • HomeAPI / Pathfinder           • Served in DiscoveryTab (" · Cached")
   • RootlistAPI / PlaylistAPI      • Browsed in PlaylistsTab (is_liked annotated)
   • LibraryAPI / PlayerAPI         • Played via uris[] in play_tracks & quick_play_pinned
   • RadioAPI / BrowseAPI
```

### Recommended Project Structure
```text
py_modules/
├── cdp_bridge.py         # NEW: Unified Platform.Registry JS bridge + probes (4.0s timeout)
├── engine.py             # UPDATED: Backwards-compatible _cdp_* wrappers delegating to cdp_bridge
├── rpc_library.py        # UPDATED: discovery_mixes.json cache, get_discovery_feed, get_playlist_tracks, set_native_playlist_mix, get_search_browse_categories
└── rpc_playback.py       # UPDATED: _try_cdp_station_radio wired to cdp_bridge, play_tracks cached mix URI fallback
main.py                   # UPDATED: Expose get_search_browse_categories RPC
src/
├── types.ts              # UPDATED: Optional browse categories response type if needed
└── components/
    ├── DeckifyExpandedModal.tsx  # UPDATED: vgp_oncancel B-button clear search + hintText + searchState refs
    └── tabs/
        └── SearchTab.tsx         # UPDATED: Optional CDP browse categories section below GamingMoodGrid
```

### Pattern 1: Unified `window.__deckifyRegistry` JS Preamble (`py_modules/cdp_bridge.py`)
**What:** Every CDP call wraps its task-specific JS snippet in a shared async IIFE that resolves `Platform.Registry` from `window.__deckifyRegistry`, re-walking `#main` (`__reactFiber$` / `__reactContainer$`) if missing or stale, and exposes `getService(name)` and `parseImg(images)`.
**When to use:** All CDP evaluations in `cdp_bridge.py` (`evaluate_with_registry`).
**Example:**
```python
# Source: Consolidated from py_modules/engine.py:475-510 and py_modules/rpc_library.py:371-395
_REGISTRY_PREAMBLE_JS = """
const parseImg = (images) => {
  const raw = images?.[0]?.url || '';
  if (!raw) return null;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  if (raw.startsWith('spotify:image:')) return 'https://i.scdn.co/image/' + raw.split(':')[2];
  if (raw.startsWith('spotify:mosaic:')) return 'https://i.scdn.co/image/' + raw.split(':')[2];
  return null;
};
const isValidRegistry = (reg) => {
  if (!reg) return false;
  if (reg._map instanceof Map) return true;
  if (typeof reg.getRegistry === 'function') return true;
  return false;
};
const resolveRegistry = () => {
  const el = document.querySelector('#main');
  if (!el) return null;
  if (window.__deckifyRegistry && window.__deckifyRegistryEl === el && isValidRegistry(window.__deckifyRegistry)) {
    return window.__deckifyRegistry;
  }
  const fk = Object.keys(el).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactContainer$'));
  if (!fk) return null;
  const queue = [el[fk]];
  const visited = new Set();
  let registry = null;
  while (queue.length > 0 && !registry && visited.size < 5000) {
    const n = queue.shift();
    if (!n || visited.has(n)) continue;
    visited.add(n);
    const val = n.memoizedProps?.value;
    if (val && val._map instanceof Map) { registry = val; break; }
    if (val && typeof val.getRegistry === 'function') { registry = val.getRegistry(); break; }
    const plat = n.memoizedProps?.platform;
    if (plat && typeof plat.getRegistry === 'function') { registry = plat.getRegistry(); break; }
    if (n.child) queue.push(n.child);
    if (n.sibling) queue.push(n.sibling);
  }
  if (registry) {
    window.__deckifyRegistry = registry;
    window.__deckifyRegistryEl = el;
  }
  return registry;
};
const registry = resolveRegistry();
if (!registry || !(registry._map instanceof Map || typeof registry.entries === 'function')) {
  return { ok: false, error: 'Platform registry not found' };
}
const regMap = registry._map instanceof Map ? registry._map : registry;
const getService = (name) => {
  for (const [k, v] of regMap.entries()) {
    if ((k?.description || String(k)) === name) {
      return v?.instance || v;
    }
  }
  return null;
};
"""
```
Notice `window.__deckifyRegistryEl === el`: if Spotify reloads `#main`, the cached registry is automatically invalidated and re-walked (D-01). Also checking both `n.memoizedProps?.value` (used in `engine.py`) and `n.memoizedProps?.platform` (used in `rpc_library.py:382`) unifies both existing walkers (D-02).

### Pattern 2: Injectable `eval_fn` for 100% Test Compatibility (D-02)
**What:** `cdp_bridge.py` functions accept `eval_fn=None`. When `None`, they lazily import `py_modules.engine._cdp_evaluate`. When called from `py_modules/engine.py` wrappers (`_fetch_spotify_cdp_folder_tree`, `_cdp_toggle_like_track`, `_cdp_get_liked_tracks`, `_cdp_get_playlist_tracks`, `_cdp_get_saved_episodes`, `_cdp_set_playback_speed`), `engine.py` passes `eval_fn=_cdp_evaluate`.
**When to use:** Every public function in `py_modules/cdp_bridge.py`.
**Why:** Existing unit tests in `tests/test_device_and_engine.py`, `tests/test_final_coverage.py`, `tests/test_podcast_suite.py`, and `tests/test_phase13.py` patch `engine._cdp_evaluate` or assert `second_call[0] == engine._cdp_toggle_like_track` `[VERIFIED: tests/test_device_and_engine.py:242; tests/test_podcast_suite.py:38-44; tests/test_phase13.py:95]`. Passing `eval_fn=_cdp_evaluate` preserves 100% compatibility with all existing mocks.

### Pattern 3: Algorithmic Mix Priority Sorting & Atomic Disk Cache (D-03, D-04, D-06)
**What:** Store resolved mixes and up to 100 tracks per mix (for the top 12 mixes) in `os.path.join(DECK_HOME, ".cache", "deckify", "discovery_mixes.json")` using `tmp_path = path + ".tmp"` + `os.replace(tmp_path, path)` (matching `py_modules/spotify.py:15, 372` and `py_modules/lyrics_offsets.py:88`).
**Sorting priority:**
1. `daylist` (priority 0)
2. `discover weekly` (priority 1)
3. `release radar` (priority 2)
4. `daily mix 1` .. `daily mix 6` (priority 3 + mix number)
5. `on repeat` / `repeat rewind` / other Spotify-owned mixes (priority 20+)

### Pattern 4: Stepwise `B`-Button Handling in `DeckifyExpandedModal.tsx` (D-09)
**What:** Add `modeRef`, `searchQueryRef`, and state-reset callbacks inside `DeckifyExpandedModal.tsx`'s `attachNav` `vgp_oncancel` listener right after `activeShowRef.current` check:
```typescript
// Source: DeckifyExpandedModal.tsx:1264-1321 pattern
if (modeRef.current === "search" && searchQueryRef.current.trim().length > 0) {
  e.preventDefault();
  e.stopPropagation();
  (e as any).stopImmediatePropagation?.();
  setSearchQuery("");
  setSearchResults({});
  setTileSearchMode(false);
  setSearchOffset(0);
  return;
}
```
And update `hintText` (`DeckifyExpandedModal.tsx:1327-1338`) so when `mode === "search" && searchQuery.trim().length > 0`, it displays `"B Clear Search"` (e.g. `"A Select · B Clear Search · L1/R1 Tabs"`).

### Anti-Patterns to Avoid
- **Socket connection on `librespot`:** Never open a port `9229` connection in `_try_cdp_station_radio`, `get_discovery_feed`, or `get_search_browse_categories` when `audio_backend != "spotify_client"` or `_spotify_client_process` is not running — fast-fail in `0ms` (D-07).
- **Direct external `i.scdn.co` URLs without `<DeckifyImage>`:** Always normalize `spotify:image:` / `spotify:mosaic:` to `https://i.scdn.co/image/<id>` and render through `<DeckifyImage>` so Steam CEF CSP never blocks artwork.
- **Polling or expiring `discovery_mixes.json` on `librespot`:** Never delete or expire cached algorithmic mixes when the user is on `librespot` or clicks *"Refresh Feed"* while `librespot` is active (D-06).
- **React Hook slot ordering violations:** In `DeckifyExpandedModal.tsx` and `SearchTab.tsx`, never place new `useState`/`useRef` hooks conditionally or before existing hooks if tests depend on hook ordering; keep new refs/effects cleanly structured.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Raw WebSocket CDP transport | A second WebSocket client in `cdp_bridge.py` | `py_modules/engine.py:_cdp_evaluate` / `_cdp_call` | Already implements RFC 6455 masking, 126/127 extended payload lengths, and Ping/Pong frames `[VERIFIED: py_modules/engine.py:290-430]`. |
| Atomic JSON persistence | Raw `open(..., "w")` in `discovery_mixes.json` | Temp file + `os.replace(tmp_path, path)` | Prevents half-written JSON corruption on Steam Deck power loss/crash `[VERIFIED: py_modules/spotify.py:372]`. |
| Track `is_liked` annotation for cached mixes | Custom liked-songs check | `await plugin._annotate_tracks_liked(token, tracks)` | Already handles TTL caching and batching `[VERIFIED: py_modules/rpc_library.py:169]`. |
| Pinned QAM Pill playback fallback | Duplicating cache logic in `quick_play_pinned` | `play_tracks(plugin, context_uri=uri)` | `quick_play_pinned` delegates to `play_tracks` `[VERIFIED: py_modules/rpc_playback.py:646]`; handling cached mix fallback in `play_tracks` fixes both QAM pills and modal play automatically. |

## Common Pitfalls

### Pitfall 1: Spotify Desktop Client Version Variance in Internal Platform APIs
**What goes wrong:** Spotify Desktop Client updates occasionally rename or restructure internal `Platform.Registry` services (`HomeAPI`, `GraphQL`, `Pathfinder`, `RadioAPI`, `BrowseAPI`, `RootlistAPI`).
**Why it happens:** Internal React Fiber services are undocumented client internals.
**How to avoid:** Wrap every service probe in defensive `try { ... } catch (e) {}` blocks inside the injected JS and probe multiple known API shapes (e.g., for mixes: `HomeAPI.getHome(...)` / `GraphQL` `home` query + `RootlistAPI.getContents({ limit: 5000, flatten: true })` filtering `owner?.username === "spotify"` or `spotify:playlist:37i9dQZF1...`; for radio: `RadioAPI.getStation(...)` / `PlaylistAPI.getContents("spotify:station:...")` / `GraphQL` `seedToPlaylist`; for browse: `BrowseAPI.getCategories()` / `HomeAPI`). Always return `{ ok: True, ... }` with whatever partial data succeeded, or `{ ok: False, error: ... }` cleanly.
**Warning signs:** Uncaught `TypeError: Cannot read properties of undefined` inside `Runtime.evaluate`.

### Pitfall 2: `SearchTab` Debounce Race When Clearing `searchQuery` on `B`
**What goes wrong:** In `SearchTab.tsx:708-728`, `useEffect` watches `searchQuery` with a 350ms debounce. When `B` clears `searchQuery` to `""`, `SearchTab` might still show stale `searchResults` or trigger a late response if `loadingSearch` was in flight.
**Why it happens:** `DeckifyExpandedModal` owns `searchQuery`, `searchResults`, `tileSearchMode`, and `searchOffset` as lifted state `[VERIFIED: src/components/DeckifyExpandedModal.tsx:214-217, 1619-1626]`.
**How to avoid:** In `DeckifyExpandedModal.tsx`'s `vgp_oncancel` handler, clear all four (`setSearchQuery("")`, `setSearchResults({})`, `setTileSearchMode(false)`, `setSearchOffset(0)`), and verify `SearchTab.tsx:716-719` cancels/ignores in-flight results when `!searchQuery.trim()`. Let's also check `SearchTab.tsx:716` during implementation to ensure `setSearchResults({})` is safe.

### Pitfall 3: `get_discovery_feed` Overwriting Cached Mixes on `librespot`
**What goes wrong:** `_DISCOVERY_CACHE` in `rpc_library.py:1661-1678` has a 4-hour TTL (`_STATIC_TTL_SECONDS = 14400.0`). If `force_refresh=True` runs while `librespot` is active and Web API `me/playlists` returns 0 Spotify-owned mixes, `_fetch_made_for_you_section` would fall back to *"Jump Back In"* and hide the user's cached algorithmic mixes.
**Why it happens:** Web API Dev Mode omits algorithmic playlists from `me/playlists`.
**How to avoid:** In `_fetch_made_for_you_section`, check in order: (1) Live CDP mixes (if `spotify_client` running) merged with Web API `me/playlists` (`owner.id == "spotify"`), saving/updating `discovery_mixes.json`; (2) If no live CDP mixes and Web API returns none, read `discovery_mixes.json` from disk and append `" · Cached"` to `subtitle`; (3) Only fall back to *"Jump Back In"* (`made_for_you_fallback = True`) if `discovery_mixes.json` is also empty (D-03, D-06).

### Pitfall 4: `play_tracks` `offset_uri` & `position` When Falling Back to `uris`
**What goes wrong:** Spotify's `PUT /v1/me/player/play` does not allow `context_uri` and `uris` in the same request body, and when playing a `uris` array, `play_tracks` slices `uris[idx:]` if `offset_uri in uris` `[VERIFIED: py_modules/rpc_playback.py:404-407]`.
**Why it happens:** If `context_uri` is left in `body` alongside `uris`, Spotify returns HTTP 400.
**How to avoid:** When substituting cached `uris` for a cached algorithmic mix `context_uri` in `play_tracks`, build `body` using the `uris` branch (removing `context_uri` from `body`, preserving `offset_uri` slicing or `position`, and keeping `plugin._context_uri = context_uri` for UI state).

## Code Examples

### Unified CDP Bridge Call (`py_modules/cdp_bridge.py`)
```python
# Source: Design pattern derived from py_modules/engine.py:412-430 & 26-CONTEXT.md D-01/D-02
DEFAULT_CDP_TIMEOUT = 4.0

def is_spotify_client_running(plugin) -> bool:
    if plugin is None:
        return False
    settings = getattr(plugin, "_settings", None) or {}
    if settings.get("audio_backend") != "spotify_client":
        return False
    proc = getattr(plugin, "_spotify_client_process", None)
    return bool(proc and proc.poll() is None)

def evaluate_with_registry(
    body_js: str,
    port: int = SPOTIFY_CDP_PORT,
    timeout: float = DEFAULT_CDP_TIMEOUT,
    eval_fn=None,
) -> dict:
    if eval_fn is None:
        from py_modules import engine as _engine
        eval_fn = _engine._cdp_evaluate
    expr = f"""
    (async () => {{
      try {{
        {_REGISTRY_PREAMBLE_JS}
        {body_js}
      }} catch (e) {{
        return {{ ok: false, error: String(e?.message || e) }};
      }}
    }})()
    """
    try:
        res = eval_fn(expr, port=port, timeout=timeout)
        if isinstance(res, dict):
            return res
        return {"ok": False, "error": "CDP returned no result"}
    except Exception as e:
        return {"ok": False, "error": str(e)}
```

### Atomic Disk Cache Read/Write (`~/.cache/deckify/discovery_mixes.json`)
```python
# Source: Pattern from py_modules/spotify.py:15, 372 & py_modules/lyrics_offsets.py:88
DISCOVERY_MIXES_CACHE_FILE = os.path.join(DECK_HOME, ".cache", "deckify", "discovery_mixes.json")

def _load_discovery_mixes_cache(cache_file: str | None = None) -> dict:
    target = cache_file or DISCOVERY_MIXES_CACHE_FILE
    try:
        with open(target, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict) and isinstance(data.get("mixes"), list):
            return data
    except Exception:
        pass
    return {"version": 1, "updated_at": 0.0, "mixes": []}

def _save_discovery_mixes_cache(data: dict, cache_file: str | None = None) -> None:
    target = cache_file or DISCOVERY_MIXES_CACHE_FILE
    os.makedirs(os.path.dirname(target), exist_ok=True)
    tmp_path = f"{target}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    os.replace(tmp_path, target)
```

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python (`py -3`) | Backend tests & runtime | ✓ | 3.14.0 `[VERIFIED: py -3 --version]` | — |
| Node.js | Frontend build & Vitest | ✓ | v25.1.0 `[VERIFIED: node --version]` | — |
| pnpm | Package scripts & test runner | ✓ | 10.28.0 `[VERIFIED: pnpm --version]` | — |
| Official Spotify Client CDP (`127.0.0.1:9229`) | Live CDP integration on Steam Deck | ✗ (Windows dev host) | — | Mocked in unit tests; runtime falls back to disk cache / Tier 2-3 / 12 static tiles |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Backend Framework | Python `unittest` (stdlib) |
| Frontend Framework | Vitest 5.1.0 (`pnpm test -- --run`) `[VERIFIED: package.json:13,43]` |
| Linter / Typecheck / Build | `pnpm run lint` (`eslint src/`), `pnpm run typecheck` (`tsc --noEmit`), `pnpm run build` (`rollup -c`) `[VERIFIED: package.json:7-11]` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DISC-04 | `cdp_bridge.py` `window.__deckifyRegistry` caching, reload re-walk, `4.0s` timeout, and `engine.py` wrapper delegation | unit | `py -3 -m unittest tests/test_cdp_bridge.py tests/test_device_and_engine.py tests/test_podcast_suite.py -q` | ❌ Wave 0 (`test_cdp_bridge.py`) / ✅ existing |
| DISC-04 | Algorithmic mix discovery, sorting (*Daylist* → *Discover Weekly* → *Release Radar* → *Daily Mix 1–6*), `discovery_mixes.json` persistence, `" · Cached"` badge, and `librespot` playback/browse fallback | unit | `py -3 -m unittest tests/test_discovery.py -q` | ✅ (`tests/test_discovery.py`) |
| DISC-04 | `_try_cdp_station_radio` `0ms` fast-fail on `librespot`, CDP URI resolution on `spotify_client`, and `get_search_browse_categories` | unit | `py -3 -m unittest tests/test_phase25_radio_search.py -q` | ✅ (`tests/test_phase25_radio_search.py`) |
| DISC-04 | `DiscoveryTab` *Made For You* / `" · Cached"` rendering, `SearchTab` optional CDP categories + 12 static tiles fallback, `DeckifyExpandedModal` `B`-button clear-search & hint bar | unit | `pnpm test -- --run src/components/tabs/DiscoveryTab.test.tsx src/components/tabs/SearchTab.test.tsx src/components/DeckifyExpandedModal.test.tsx` | ✅ |

### Sampling Rate
- **Per task commit:** Targeted Python `unittest` or Vitest file for the modified module (`< 2s`).
- **Per wave merge:** Full Python + Vitest suites + `pnpm run lint` + `pnpm run typecheck`.
- **Phase gate:** Full suite (`py -3 -m unittest discover -s tests -p "test_*.py"` + `pnpm test -- --run` + `pnpm run lint` + `pnpm run typecheck` + `pnpm run build`) green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `tests/test_cdp_bridge.py` — covers `cdp_bridge.evaluate_with_registry` (`window.__deckifyRegistry` reuse/invalidation JS, `4.0s` timeout, error fallback), `cdp_fetch_discovery_mixes`, `cdp_fetch_station_radio_uris`, `cdp_fetch_browse_categories`, and `engine.py` wrapper delegation.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Reuses existing Spotify OAuth PKCE & local Spotify Client session |
| V3 Session Management | no | No new session handling |
| V4 Access Control | yes | CDP binds strictly to loopback `127.0.0.1:9229`; `_try_cdp_station_radio` & discovery probes never expose tokens in logs |
| V5 Input Validation | yes | Escape all interpolated IDs/URIs in injected JS via `json.dumps(...)`; validate `seed_type` (`track`/`artist`/`album`) and `playlist_id` |
| V6 Cryptography | no | No cryptographic operations |

### Known Threat Patterns for Python CDP / JS Evaluation

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| JS injection via unescaped URI/playlist ID in `Runtime.evaluate` | Tampering | Always serialize dynamic strings into JS using `json.dumps(str(val))` (never raw f-string interpolation). |
| Partial/corrupt disk cache crash on Steam Deck | Availability | Write to `<file>.tmp` and atomically swap via `os.replace(tmp_path, target)`. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Spotify Desktop Client exposes `HomeAPI` / `GraphQL` (`home`, `seedToPlaylist`, `browseCategories`) / `RadioAPI` / `BrowseAPI` on `Platform.Registry._map` | Architecture Patterns, Pitfall 1 | Low-Medium: If a specific client version renames an internal service, defensive `try/catch` multi-probe fallbacks (`RootlistAPI`, `PlaylistAPI`, Web API Tier 2/3, 12 static tiles) ensure zero crashes and graceful degradation. |

## Sources

### Primary (HIGH confidence)
- `py_modules/engine.py:274-960` — Verified `_cdp_get_page_target`, `_cdp_call`, `_cdp_evaluate`, and all 6 existing CDP walkers.
- `py_modules/rpc_library.py:63-185, 346-430, 1411-1721` — Verified `get_playlist_tracks`, `set_native_playlist_mix`, `_fetch_made_for_you_section`, `get_discovery_feed`.
- `py_modules/rpc_playback.py:379-460, 607-696, 794-860` — Verified `play_tracks`, `quick_play_pinned`, `_try_cdp_station_radio`, `start_radio`.
- `py_modules/common.py:58-73, 527-560` — Verified `SPOTIFY_CDP_PORT = 9229`, `DECK_HOME`, `_save_settings`, `_exec`.
- `src/components/DeckifyExpandedModal.tsx:1260-1355` — Verified `attachNav` (`vgp_oncancel`) and `hintText`.
- `src/components/tabs/DiscoveryTab.tsx:444-505` & `src/components/tabs/SearchTab.tsx:730-816` — Verified *Made For You* carousel and Search idle/results rendering.

### Secondary (MEDIUM confidence)
- `tests/test_discovery.py`, `tests/test_phase25_radio_search.py`, `tests/test_device_and_engine.py`, `tests/test_podcast_suite.py`, `tests/test_phase13.py` — Verified existing mock contracts.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - 100% stdlib Python + existing workspace React/TS/`@decky/ui` stack; verified versions and passing baseline tests.
- Architecture: HIGH - All integration points (`engine.py`, `rpc_library.py`, `rpc_playback.py`, `DeckifyExpandedModal.tsx`, `DiscoveryTab.tsx`, `SearchTab.tsx`) directly read and verified.
- Pitfalls: MEDIUM-HIGH - Test mock contracts verified; internal Spotify Client `HomeAPI`/`RadioAPI`/`BrowseAPI` method names mitigated by defensive multi-probe JS fallbacks.

**Research date:** 2026-11-24
**Valid until:** 2026-12-24 (30 days; stable codebase)
