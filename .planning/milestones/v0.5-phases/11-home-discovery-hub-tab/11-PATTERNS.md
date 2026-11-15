# Phase 11: Home & Discovery Hub Tab - Pattern Map

**Mapped:** 2026-11-15
**Files analyzed:** 11
**Analogs found:** 11 / 11

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `py_modules/spotify.py` | utility / HTTP client | request-response | `py_modules/spotify.py` (lines 16–48) | exact (self) |
| `py_modules/rpc_library.py` | service / RPC handler | request-response + TTL cache | `py_modules/rpc_library.py` (`get_playlists` lines 28–54, `search_spotify` lines 789–817) | exact (self) |
| `py_modules/common.py` | config / constants | static config | `py_modules/common.py` (lines 124–130) | exact (self) |
| `py_modules/auth.py` | service / OAuth | request-response | `main.py` (`get_auth_status` lines 979–984) | note: `CURRENT_SCOPES_VERSION` lives in `common.py` |
| `main.py` | controller / RPC bridge | request-response | `main.py` (`get_recently_played` / `search_spotify` lines 904–914) | exact (self) |
| `src/types.ts` | types / schema | static types | `src/types.ts` (`ViewMode`, `ALL_MODES` lines 4–33) | exact (self) |
| `src/components/common/Sidebar.tsx` | component / nav | event-driven | `src/components/common/Sidebar.tsx` (lines 114–125) | exact (self) |
| `src/components/DeckifyExpandedModal.tsx` | component / modal router | state + event-driven | `src/components/DeckifyExpandedModal.tsx` (lines 91, 1025–1052) | exact (self) |
| `src/components/tabs/DiscoveryTab.tsx` | component / tab view | request-response + horizontal focus | `src/components/tabs/SoundtracksTab.tsx` (lines 40–90) + `src/components/tabs/RecentTab.tsx` (lines 6–48) | role-match |
| `tests/test_discovery.py` | test / Python unittest | async unit test | `tests/test_soundtrack.py` (lines 1–60) | exact |
| `src/components/tabs/DiscoveryTab.test.tsx` | test / Vitest | unit test with mocked `@decky/ui` | `src/components/tabs/SoundtracksTab.test.tsx` (lines 1–80) | exact |

## Pattern Assignments

### `py_modules/spotify.py` (utility / HTTP client, request-response)

**Analog:** `py_modules/spotify.py` (self, lines 1–48)

**Imports & existing 429 bug** (lines 1–12, 43–47):
```python
from collections import OrderedDict
import hashlib
import json
import os
import re
import threading
import urllib.error
import urllib.parse
import urllib.request
```
Add `import time` (currently missing, causing `NameError` at line 46 `time.sleep(min(retry_after, 2))`).

**Core request & 429 circuit breaker pattern** (lines 16–47):
- Replace the blocking `time.sleep(...)` in `except urllib.error.HTTPError as e:` with a thread-safe (`threading.Lock()`) monotonic circuit breaker using `time.monotonic()`.
- Pre-flight check before `urllib.request.urlopen(req, timeout=10, context=_API_SSL_CTX)`: if open, raise `SpotifyRateLimitError(retry_after=remaining)` immediately.
- On HTTP `200`/`204`, reset failure count and cooldown; on HTTP `429`, read `Retry-After` header, compute exponential backoff capped at `300.0`s, set cooldown, and raise `SpotifyRateLimitError`.

---

### `py_modules/rpc_library.py` (service / RPC handler, request-response + TTL cache)

**Analog:** `py_modules/rpc_library.py` (`get_playlists` lines 28–54, `search_spotify` lines 789–817)

**Imports pattern** (lines 1–25):
```python
from py_modules.common import SPOTIFY_CDP_PORT, _exec, _save_settings, decky
from py_modules.images import _image_url, _proxy_folder_tree_images, _fetch_spotify_image
from py_modules.spotify import _spotify_api_request, _parse_spotify_error, _fetch_lyrics_sync
```
Import `SpotifyRateLimitError` from `py_modules.spotify` and `time` from stdlib.

**Auth guard, `_exec`, and structured return pattern** (lines 28–54):
```python
async def get_playlists(plugin, offset: int = 0) -> dict:
    """Fetch current user's playlists."""
    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}
    try:
        data = await _exec(_spotify_api_request, "me/playlists", token, "GET", {"limit": 50, "offset": offset})
        ...
        return {"ok": True, ...}
    except Exception as e:
        decky.logger.error("get_playlists failed: %s", e)
        return {"ok": False, "error": str(e)}
```

**Dev Mode limit / fallback pattern** (lines 805–817):
`search_spotify` catches `400`/`Invalid limit` and retries with `limit=10`. For `browse/new-releases`, catch `urllib.error.HTTPError` with `e.code in (403, 404)` and fall back to `_spotify_api_request("search", token, "GET", {"q": "tag:new", "type": "album", "limit": 10})`.

---

### `py_modules/common.py` & `py_modules/auth.py` (config / OAuth, static config)

**Analog:** `py_modules/common.py` (lines 124–130) & `main.py` (lines 979–984)

**Scope version pattern** (`py_modules/common.py` lines 124–130):
```python
SPOTIFY_SCOPES = (
    "user-read-currently-playing user-read-playback-state user-modify-playback-state "
    "playlist-read-private playlist-read-collaborative playlist-modify-public "
    "playlist-modify-private user-library-read user-library-modify "
    "user-follow-read user-read-recently-played"
)
CURRENT_SCOPES_VERSION = 6
```
Append `user-top-read` to `SPOTIFY_SCOPES` and bump `CURRENT_SCOPES_VERSION = 7`. `main.py:982` (`needs_reauth = saved_version < CURRENT_SCOPES_VERSION`) automatically handles re-auth prompting; `py_modules/auth.py` does not need a duplicate constant.

---

### `main.py` (controller / RPC bridge, request-response)

**Analog:** `main.py` (`get_recently_played` / `search_spotify`, lines 904–914)

**RPC delegation pattern** (lines 904–914):
```python
    async def get_recently_played(self, limit: int = 30) -> dict:
        return await rpc_library.get_recently_played(self, limit)
```
Expose `async def get_discovery_feed(self, time_range: str = "medium_term", force_refresh: bool = False) -> dict:` delegating directly to `await rpc_library.get_discovery_feed(self, time_range, force_refresh)`.

---

### `src/types.ts` (types / schema, static types)

**Analog:** `src/types.ts` (lines 4–33, 68–95)

**ViewMode & ALL_MODES registration** (lines 4–33):
```typescript
export type ViewMode =
  | "now_playing"
  | "lyrics"
  | "playlists"
  ...
```
Add `"discovery"` to `ViewMode` and `ALL_MODES` right after `"lyrics"` so `L1`/`R1` `cycleMode` order matches `Sidebar.tsx`. Define `DiscoveryTimeRange = "short_term" | "medium_term" | "long_term"` and `DiscoveryFeedResponse` alongside `PlaylistItem`, `AlbumItem`, `ArtistItem`, `TrackItem`.

---

### `src/components/common/Sidebar.tsx` (component / nav, event-driven)

**Analog:** `src/components/common/Sidebar.tsx` (lines 114–125)

**SidebarBtn placement pattern** (lines 114–125):
```tsx
<div style={{ fontSize: 10, fontWeight: 700, opacity: 0.4, padding: "4px 8px", textTransform: "uppercase", letterSpacing: 0.8 }}>Playback</div>
<SidebarBtn id="now_playing" label="Now Playing" icon={<FaPlay size={12} />} active={mode === "now_playing"} onSelect={onSelectMode} />
<SidebarBtn id="lyrics" label="Lyrics" icon={<FaMicrophone size={12} />} active={mode === "lyrics"} onSelect={onSelectMode} />

<div style={{ fontSize: 10, fontWeight: 700, opacity: 0.4, padding: "8px 8px 4px", textTransform: "uppercase", letterSpacing: 0.8 }}>Library</div>
```
Place `<SidebarBtn id="discovery" label="Discovery" icon={<FaCompass size={12} />} active={mode === "discovery"} onSelect={onSelectMode} />` at the top of the Browse/Library section right after `Lyrics`.

---

### `src/components/DeckifyExpandedModal.tsx` (component / modal router, state + event-driven)

**Analog:** `src/components/DeckifyExpandedModal.tsx` (lines 91, 1025–1052)

**State order constraint** (line 91):
```tsx
const [mode, setMode] = useState<ViewMode>("now_playing");
```
Keep `useState<ViewMode>("now_playing")` as the first `useState` call (required by `DeckifyExpandedModal.test.tsx:427`). Add a one-shot `useRef(false)` + `useEffect` on `status` to switch `mode` to `"discovery"` when `status` resolves with no active track.

**Tab rendering & Y-button focus ref clearing** (lines 1039–1046):
```tsx
onOpenActions={(t) => setActionTrack(t)}
onFocusTrack={(t) => { focusedTrackRef.current = t; }}
...
onFocusCollection={(c) => {
  focusedCollectionRef.current = c;
  if (c) focusedTrackRef.current = null;
}}
```
Clear `focusedCollectionRef.current = null` when `onFocusTrack(t)` receives a track, and clear `focusedTrackRef.current = null` when `onFocusCollection(c)` receives a collection.

---

### `src/components/tabs/DiscoveryTab.tsx` (component / tab view, request-response + horizontal focus)

**Analogs:**
- `src/components/tabs/SoundtracksTab.tsx` (lines 40–90) for `callable` RPC binding + `useEffect` mounted-guard fetch
- `src/components/tabs/RecentTab.tsx` (lines 6–48) for tab props (`onPlayTrack`, `onOpenActions`, `onFocusTrack`)
- `src/components/common/InteractiveRow.tsx` (lines 4–15) for `focusHalo(focused)`

**RPC binding pattern** (`SoundtracksTab.tsx` line 40):
```tsx
const backendGetDiscoveryFeed = callable<[DiscoveryTimeRange, boolean?], DiscoveryFeedResponse>("get_discovery_feed");
```

**Horizontal carousel & focus halo pattern** (`InteractiveRow.tsx` lines 4–15 + `UI-SPEC.md`):
```tsx
<Focusable
  flow-children="horizontal"
  style={{ display: "flex", gap: 16, overflowX: "auto", padding: "6px 4px 10px" }}
>
```
Each `128px × 128px` card uses `<Focusable noFocusRing>` with `focusHalo(focused)`, `<DeckifyImage src={...} />`, and `el.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" })` on focus.

---

### `tests/test_discovery.py` (test / Python unittest, async unit test)

**Analog:** `tests/test_soundtrack.py` (lines 1–60)

**Decky mock & `IsolatedAsyncioTestCase` pattern** (`tests/test_soundtrack.py` lines 1–38, 44–50):
```python
with patch.dict("sys.modules", {"decky": SimpleNamespace(
    DECKY_PLUGIN_SETTINGS_DIR=tempfile.gettempdir(),
    DECKY_PLUGIN_DIR=tempfile.gettempdir(),
    DECKY_PLUGIN_RUNTIME_DIR=tempfile.gettempdir(),
    logger=MagicMock(),
    emit=AsyncMock(),
)}):
    from py_modules import common, rpc_library, spotify
```
Use `unittest.IsolatedAsyncioTestCase` with `make_plugin()` (`_ensure_token=AsyncMock(return_value="tok")`, `_annotate_tracks_liked=AsyncMock()`), and call `spotify._reset_rate_limit_breaker()` + clear `_DISCOVERY_CACHE` in `setUp()`.

---

### `src/components/tabs/DiscoveryTab.test.tsx` (test / Vitest, unit test with mocked `@decky/ui`)

**Analog:** `src/components/tabs/SoundtracksTab.test.tsx` (lines 1–80)

**Vitest mock setup** (`SoundtracksTab.test.tsx` lines 8–80):
- Mock `@decky/api` (`callable`), `@decky/ui` (`Focusable`, `DialogButton`), `../common/DeckifyImage`, `react-icons/fa`, `react/jsx-runtime`, `react/jsx-dev-runtime`, and `react` (`useState`, `useEffect`, `useCallback`, `useRef`, `useMemo`) to inspect the rendered virtual tree directly without a DOM.

## Shared Patterns

### Backend Structured RPC Responses & Error Handling
**Source:** `py_modules/rpc_library.py` (lines 28–54)
**Apply to:** `py_modules/rpc_library.py`, `main.py`
All RPCs check `token = await plugin._ensure_token()` (returning `{"ok": False, "error": "Not authenticated"}` if falsy), wrap Spotify calls in `try/except`, log via `decky.logger.error(...)`, and return `{"ok": True, ...}` or `{"ok": False, "error": str(e)}`.

### Steam CEF CSP-Safe Artwork
**Source:** `src/components/common/DeckifyImage.tsx`
**Apply to:** `src/components/tabs/DiscoveryTab.tsx`
Never render raw `https://i.scdn.co/...` `<img>` tags; always render `<DeckifyImage src={url} />`.

### Gamepad Spatial Navigation & Focus Ring
**Source:** `src/components/common/InteractiveRow.tsx` (lines 4–15)
**Apply to:** `src/components/tabs/DiscoveryTab.tsx`, `src/components/common/Sidebar.tsx`
Horizontal strips MUST use `<Focusable flow-children="horizontal">` (never `"row"`), and interactive cards/pills use `<Focusable noFocusRing>` with `focusHalo(focused)`.

## No Analog Found

None — all 11 files have direct, git-tracked analogs in the repository.

## Metadata

**Analog search scope:** `py_modules/`, `main.py`, `src/types.ts`, `src/components/`, `tests/`
**Files scanned:** 12
**Pattern extraction date:** 2026-11-15
