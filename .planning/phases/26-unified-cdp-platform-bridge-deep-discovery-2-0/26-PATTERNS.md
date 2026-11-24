# Phase 26: Unified CDP Platform Bridge & Deep Discovery 2.0 - Pattern Map

**Mapped:** 2026-11-24
**Files analyzed:** 13
**Analogs found:** 13 / 13

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `py_modules/cdp_bridge.py` | service | request-response | `py_modules/engine.py` | exact |
| `py_modules/engine.py` | service | request-response | `py_modules/engine.py` | exact |
| `py_modules/rpc_library.py` | controller | CRUD / file-I/O | `py_modules/rpc_library.py` + `py_modules/lyrics_offsets.py` | exact |
| `py_modules/rpc_playback.py` | controller | request-response | `py_modules/rpc_playback.py` | exact |
| `main.py` | controller | request-response | `main.py` | exact |
| `src/types.ts` | model | transform | `src/types.ts` | exact |
| `src/components/DeckifyExpandedModal.tsx` | component | event-driven | `src/components/DeckifyExpandedModal.tsx` | exact |
| `src/components/tabs/SearchTab.tsx` | component | request-response | `src/components/tabs/SearchTab.tsx` | exact |
| `tests/test_cdp_bridge.py` | test | request-response | `tests/test_device_and_engine.py` | exact |
| `tests/test_discovery.py` | test | CRUD / file-I/O | `tests/test_discovery.py` | exact |
| `tests/test_phase25_radio_search.py` | test | request-response | `tests/test_phase25_radio_search.py` | exact |
| `src/components/tabs/SearchTab.test.tsx` | test | event-driven | `src/components/tabs/SearchTab.test.tsx` | exact |
| `src/components/DeckifyExpandedModal.test.tsx` | test | event-driven | `src/components/DeckifyExpandedModal.test.tsx` | exact |

---

## Pattern Assignments

### `py_modules/cdp_bridge.py` (service, request-response)

**Analog:** `py_modules/engine.py`

**Imports pattern** (`py_modules/engine.py` lines 1-10):
```python
import base64
import json
import os
import re
import socket
import subprocess
import urllib.parse
import urllib.request

from py_modules.common import ALLOWED_PLAYBACK_SPEEDS, SPOTIFY_CDP_PORT, _build_deck_command, decky
```

**CDP evaluation & timeout pattern** (`py_modules/engine.py` lines 412-431):
```python
def _cdp_evaluate(
    expression: str,
    port: int = SPOTIFY_CDP_PORT,
    target_title: str | None = None,
    timeout: float = 5.0,
):
    """Evaluate a JavaScript expression inside the running Official Spotify Client via CDP."""
    if isinstance(target_title, (int, float)):
        timeout = float(target_title)
        target_title = None
    res = _cdp_call(
        "Runtime.evaluate",
        {"expression": expression, "awaitPromise": True, "returnByValue": True},
        port=port,
        target_title=target_title,
        timeout=timeout,
    )
    if isinstance(res, dict) and "result" in res:
        return res["result"].get("value")
    return None
```
For `cdp_bridge.py`, use `DEFAULT_CDP_TIMEOUT = 4.0` (per D-01) and accept an injectable `eval_fn=None` (defaulting to lazy-imported `py_modules.engine._cdp_evaluate`) so `engine.py` wrappers can pass `eval_fn=_cdp_evaluate` and preserve all `patch.object(engine, "_cdp_evaluate", ...)` unit tests.

**React Fiber `Platform.Registry` & `parseImg` pattern** (`py_modules/engine.py` lines 474-510 & `py_modules/rpc_library.py` lines 382-391):
```javascript
const el = document.querySelector('#main');
if (!el) return null;
const fk = Object.keys(el).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactContainer$'));
if (!fk) return null;
const queue = [el[fk]];
const visited = new Set();
let registry = null;
while (queue.length > 0 && !registry) {
  const n = queue.shift();
  if (!n || visited.has(n)) continue;
  visited.add(n);
  const val = n.memoizedProps?.value;
  if (val && val._map instanceof Map) { registry = val; break; }
  if (val && typeof val.getRegistry === 'function') { registry = val.getRegistry(); break; }
  if (n.memoizedProps?.platform && typeof n.memoizedProps.platform.getRegistry === 'function') {
    registry = n.memoizedProps.platform.getRegistry();
    break;
  }
  if (n.child) queue.push(n.child);
  if (n.sibling) queue.push(n.sibling);
}
```
Cache the resolved registry on `window.__deckifyRegistry` (paired with `window.__deckifyRegistryEl = el` to auto-invalidate and re-walk after a page reload, per D-01), and centralize `parseImg` (`spotify:image:` / `spotify:mosaic:` → `https://i.scdn.co/image/<id>`).

**Error handling pattern** (`py_modules/engine.py` lines 900-914):
```javascript
      } catch (e) {
        return { ok: false, error: String(e?.message || e) };
      }
```
```python
    try:
        res = eval_fn(expr, port=port, timeout=timeout)
        if isinstance(res, dict) and res.get("ok"):
            return res
        if isinstance(res, dict):
            return {"ok": False, "error": res.get("error") or "CDP call failed"}
        return {"ok": False, "error": "CDP returned no result"}
    except Exception as e:
        return {"ok": False, "error": str(e)}
```

---

### `py_modules/engine.py` (service, request-response)

**Analog:** `py_modules/engine.py` (self-consistent wrapper delegation)

**Wrapper delegation pattern** (`py_modules/engine.py` lines 472, 917-927):
Keep all 6 existing CDP wrapper signatures intact (`_fetch_spotify_cdp_folder_tree`, `_cdp_toggle_like_track`, `_cdp_get_liked_tracks`, `_cdp_get_playlist_tracks`, `_cdp_get_saved_episodes`, `_cdp_set_playback_speed`) and delegate to `py_modules/cdp_bridge.py` passing `eval_fn=_cdp_evaluate` so existing `unittest.mock.patch.object(engine, "_cdp_evaluate", ...)` tests continue passing unchanged.

---

### `py_modules/rpc_library.py` (controller, CRUD / file-I/O)

**Analog:** `py_modules/rpc_library.py` + `py_modules/lyrics_offsets.py`

**Imports pattern** (`py_modules/rpc_library.py` lines 1-30):
```python
from py_modules.common import (
    SPOTIFY_CDP_PORT,
    _exec,
    _save_settings,
    decky,
)
from py_modules.images import (
    _image_url,
    _proxy_folder_tree_images,
    _fetch_spotify_image,
)
from py_modules.spotify import (
    SpotifyRateLimitError,
    _spotify_api_request,
    _parse_spotify_error,
    _fetch_lyrics_sync,
)
```
Import `DECK_HOME` from `py_modules.common` and CDP bridge helpers from `py_modules.cdp_bridge`.

**Atomic disk cache pattern** (`py_modules/lyrics_offsets.py` lines 81-95):
```python
        parent = os.path.dirname(path)
        if parent:
            os.makedirs(parent, exist_ok=True)
        tmp_path = f"{path}.{os.getpid()}.tmp"
        try:
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(offsets, f, indent=2, sort_keys=True)
            os.replace(tmp_path, path)
        except Exception:
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass
            raise
```
Apply to `os.path.join(DECK_HOME, ".cache", "deckify", "discovery_mixes.json")` for persisting algorithmic mix metadata and tracklists (up to 12 mixes, 100 tracks each, per D-04).

**Discovery feed & section cache pattern** (`py_modules/rpc_library.py` lines 1661-1690):
```python
    async def _get_section(cache_key: str, ttl: float, fetcher):
        nonlocal rate_limited, stale, retry_after
        now = time.monotonic()
        entry = _DISCOVERY_CACHE.get(cache_key)
        if not bypass and entry is not None and now < entry["expires_at"]:
            return entry["data"], entry.get("fallback", False)
        try:
            result = await fetcher()
            if isinstance(result, tuple):
                data, extra_flag = result
            else:
                data, extra_flag = result, False
            _DISCOVERY_CACHE[cache_key] = {
                "data": data,
                "fallback": extra_flag,
                "expires_at": time.monotonic() + ttl,
            }
            return data, extra_flag
        except SpotifyRateLimitError as rl_err:
            ...
```
In `_fetch_made_for_you_section`, merge live CDP mixes (when `spotify_client` is running) with Web API `me/playlists` (`owner.id == "spotify"`), deduplicate by URI, sort core mixes (*Daylist* → *Discover Weekly* → *Release Radar* → *Daily Mix 1–6* → *On Repeat* / other Spotify mixes), pre-fetch top tracklists into `discovery_mixes.json`, and fall back to `discovery_mixes.json` with `" · Cached"` appended to `subtitle` when offline/on `librespot` before falling back to *"Jump Back In"* (D-03, D-04, D-06).

**`get_playlist_tracks` CDP + disk cache fallback pattern** (`py_modules/rpc_library.py` lines 151-190):
```python
        if not tracks and cur_offset == 0:
            is_spotify_client = (
                plugin._settings.get("audio_backend") == "spotify_client"
                and bool(
                    getattr(plugin, "_spotify_client_process", None)
                    and plugin._spotify_client_process.poll() is None
                )
            )
            if is_spotify_client:
                try:
                    cdp_res = await _exec(_cdp_get_playlist_tracks, pid, offset, fetch_all)
                    ...
```
When Web API returns `403/404` or empty and live CDP is unavailable, serve the cached tracklist from `discovery_mixes.json` and pass through `await plugin._annotate_tracks_liked(token, tracks)` (D-05). When live CDP succeeds for a mix in `discovery_mixes.json`, refresh its cached tracklist (D-04).

**`set_native_playlist_mix` delegation pattern** (`py_modules/rpc_library.py` lines 346-430):
Keep the `librespot` / `web_player` guard and `spotify_folder_tree` `is_mixed` settings update, and delegate the CDP `PlaylistMixingAPI` / `PlayerAPI` evaluation through `py_modules/cdp_bridge.py` (D-02).

---

### `py_modules/rpc_playback.py` (controller, request-response)

**Analog:** `py_modules/rpc_playback.py`

**`play_tracks` & `quick_play_pinned` cached mix URI fallback** (`py_modules/rpc_playback.py` lines 395-456 & 646):
```python
    body = {}
    if context_uri:
        body["context_uri"] = context_uri
        if offset_uri:
            body["offset"] = {"uri": offset_uri}
        elif position > 0:
            body["offset"] = {"position": position}
        plugin._context_uri = context_uri
    elif uris:
        if offset_uri and offset_uri in uris:
            idx = uris.index(offset_uri)
            body["uris"] = uris[idx:]
            body["offset"] = {"position": 0}
        else:
            body["uris"] = uris
            if position > 0:
                body["offset"] = {"position": position}
```
Note: `quick_play_pinned` (`line 646`) delegates directly to `play_tracks(plugin, context_uri=uri)`. When `context_uri` targets a cached algorithmic mix in `discovery_mixes.json` and `librespot` is active (or `PUT /v1/me/player/play` returns `403/404`), resolve `uris` from `discovery_mixes.json`, build `body` using the `uris` branch (never sending `context_uri` and `uris` together), preserve `offset_uri` slicing / `position`, and keep `plugin._context_uri = context_uri` (D-05).

**Tier 1 `_try_cdp_station_radio` pattern** (`py_modules/rpc_playback.py` lines 688-695 & 826-835):
```python
async def _try_cdp_station_radio(
    plugin,
    seed_type: str,
    seed_id: str,
    seed_uri: str = "",
) -> list[str]:
```
Fast-fail in `0ms` returning `[]` if `not cdp_bridge.is_spotify_client_running(plugin)` (D-07). Otherwise call `await _exec(cdp_bridge.cdp_fetch_station_radio_uris, seed_type, seed_id, seed_uri)` and return up to 30 `spotify:track:...` URIs to `start_radio` (D-08).

---

### `main.py` (controller, request-response)

**Analog:** `main.py` (lines 1432-1446)

**RPC delegation pattern** (`main.py` lines 1432-1446):
```python
    async def get_discovery_feed(
        self,
        time_range: str = "medium_term",
        force_refresh: bool = False,
    ) -> dict:
        return await rpc_library.get_discovery_feed(self, time_range, force_refresh)

    async def search_spotify(
        self,
        query: str,
        types: str = "track,artist,album,playlist",
        limit: int = 50,
        offset: int = 0,
    ) -> dict:
        return await rpc_library.search_spotify(self, query, types, limit, offset)
```
Expose `get_search_browse_categories(self) -> dict` delegating to `rpc_library.get_search_browse_categories(self)` while keeping all existing RPC signatures unchanged.

---

### `src/components/DeckifyExpandedModal.tsx` (component, event-driven)

**Analog:** `src/components/DeckifyExpandedModal.tsx`

**`vgp_oncancel` stepwise `B`-button pattern** (`src/components/DeckifyExpandedModal.tsx` lines 1264-1320):
```typescript
      if (activeShowRef.current) {
        e.preventDefault();
        e.stopPropagation();
        (e as any).stopImmediatePropagation?.();
        setActiveShow(null);
        return;
      }
```
Note: `modeRef` already exists at lines 278-279 (`const modeRef = useRef<ViewMode>(mode); modeRef.current = mode;`). Add `searchQueryRef` (`const searchQueryRef = useRef(searchQuery); searchQueryRef.current = searchQuery;`) and, right after `if (activeShowRef.current)`, check `if (modeRef.current === "search" && searchQueryRef.current.trim().length > 0)` to intercept `B` (`preventDefault`, `stopPropagation`, `stopImmediatePropagation`) and reset `setSearchQuery("")`, `setSearchResults({})`, `setTileSearchMode(false)` (D-09). Note that `SearchTab.tsx` line 715 already resets `setSearchOffset(0)` in its `useEffect` when `searchQuery` changes.

**`hintText` pattern** (`src/components/DeckifyExpandedModal.tsx` lines 1327-1338):
```typescript
      : mode === "search" && focusedHistoryQuery
      ? "A Search · X/Y Remove · L1/R1 Tabs"
      : "L2/R2 Page · X Like · Y Options · L1/R1 Tabs";
```
Add `mode === "search" && searchQuery.trim().length > 0` branch displaying `"A Select · B Clear Search · L1/R1 Tabs"` (or similar with `"B Clear Search"`).

---

### `src/components/tabs/SearchTab.tsx` (component, request-response)

**Analog:** `src/components/tabs/SearchTab.tsx`

**Idle view rendering pattern** (`src/components/tabs/SearchTab.tsx` lines 782-793):
```tsx
      {!ctrl.searchQuery.trim() ? (
        <div style={{ marginTop: 16 }}>
          <RecentSearchesSection
            searchHistory={ctrl.searchHistory}
            onSelectHistory={ctrl.handleSelectHistory}
            onRemoveHistory={ctrl.removeHistoryItem}
            onClearHistory={ctrl.clearHistory}
            onFocusHistoryPill={onFocusHistoryPill}
          />
          <GamingMoodGrid onSelectTile={ctrl.handleSelectTile} />
        </div>
      ) : (
```
Keep `<GamingMoodGrid>` always at the top of the idle screen (below `RecentSearchesSection`) for instant `0ms` access, and optionally render CDP Browse categories below `<GamingMoodGrid>` when `get_search_browse_categories` returns non-empty items (silent fallback to the 12 static tiles when empty/unavailable, per D-10).

---

### Test Files (`tests/test_cdp_bridge.py`, `tests/test_discovery.py`, `tests/test_phase25_radio_search.py`, `src/components/tabs/SearchTab.test.tsx`, `src/components/DeckifyExpandedModal.test.tsx`)

**Analogs:**
- `tests/test_device_and_engine.py` lines 238-246 (`with patch.object(engine, "_cdp_evaluate", ...)` pattern for `tests/test_cdp_bridge.py`)
- `tests/test_discovery.py` lines 10-44 (`make_plugin()` + `_mock_http_response` + `tempfile` cache path patching)
- `tests/test_phase25_radio_search.py` lines 14-45 (`make_plugin(audio_backend=...)` + `TestStartRadioWaterfall`; note `test_tier1_cdp_stub_returns_empty_list` passes because `make_plugin("spotify_client")` has no running `_spotify_client_process`)

---

## Shared Patterns

### Guarded CDP Availability Check
**Source:** `py_modules/rpc_library.py` lines 152-158
**Apply to:** `py_modules/cdp_bridge.py`, `py_modules/rpc_library.py`, `py_modules/rpc_playback.py`
```python
def is_spotify_client_running(plugin) -> bool:
    if plugin is None:
        return False
    settings = getattr(plugin, "_settings", None) or {}
    if settings.get("audio_backend") != "spotify_client":
        return False
    proc = getattr(plugin, "_spotify_client_process", None)
    return bool(proc and proc.poll() is None)
```
Every CDP-enabled backend path (`_try_cdp_station_radio`, `get_discovery_feed`, `get_search_browse_categories`) checks this first to fast-fail in `0ms` when `librespot` is active or `spotify_client` is not running.

### Steam CEF CSP Image Normalization & `<DeckifyImage>`
**Source:** `py_modules/engine.py` lines 503-510 & `src/components/tabs/DiscoveryTab.tsx`
**Apply to:** `py_modules/cdp_bridge.py`, `py_modules/rpc_library.py`, `src/components/tabs/SearchTab.tsx`
Normalize `spotify:image:` / `spotify:mosaic:` URIs to `https://i.scdn.co/image/<id>` in JS/Python and render all artwork in the frontend through `<DeckifyImage>` (never raw `<img>` with external CDN URLs).

### Safe JS String Interpolation
**Source:** `py_modules/rpc_library.py` line 397
**Apply to:** `py_modules/cdp_bridge.py`
Always serialize dynamic IDs, URIs, and offsets into injected JS using `json.dumps(str(val))` rather than raw string interpolation.

### Atomic Disk Cache Persistence
**Source:** `py_modules/lyrics_offsets.py` lines 84-95
**Apply to:** `py_modules/rpc_library.py` (`~/.cache/deckify/discovery_mixes.json`)
Write to a temporary file (`f"{target}.tmp"`) and atomically swap via `os.replace(tmp_path, target)`.

---

## No Analog Found

All 13 files have direct existing analogs in the repository.

---

## Metadata

**Analog search scope:** `py_modules/`, `main.py`, `src/components/`, `src/components/tabs/`, `tests/`
**Files scanned:** 16
**Pattern extraction date:** 2026-11-24
