# Phase 25: Universal Artist/Album Drill-Down, Instant Radio & Search 2.0 - Pattern Map

**Mapped:** 2026-11-23
**Files analyzed:** 15
**Analogs found:** 15 / 15

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `py_modules/common.py` | config | file-I/O | `py_modules/common.py` (self: `DEFAULT_SETTINGS`) | exact |
| `main.py` | controller | request-response | `main.py` (self: `set_setting` & RPC delegates) | exact |
| `py_modules/rpc_library.py` | service | request-response | `py_modules/rpc_library.py` (self: `get_show_episodes`, `get_artist_albums`, `get_artist_top_tracks`, `search_spotify`) | exact |
| `py_modules/rpc_playback.py` | service | request-response | `py_modules/rpc_playback.py` (self: `play_tracks`) + `py_modules/rpc_library.py` (`get_track_recommendations`) | exact |
| `src/types.ts` | model | transform | `src/types.ts` (self: `TrackItem`, `ShowItem`, `EpisodeItem`) | exact |
| `src/components/DeckifyExpandedModal.tsx` | component | event-driven | `src/components/DeckifyExpandedModal.tsx` (self: `handleOpenAlbum`, `handleOpenArtist`, `vgp_oncancel`) | exact |
| `src/components/common/TrackActionModal.tsx` | component | event-driven | `src/components/common/TrackActionModal.tsx` (self: `Start Track Radio` / `Go to Artist` / `Go to Album`) | exact |
| `src/components/tabs/NowPlayingTab.tsx` | component | event-driven | `src/components/tabs/NowPlayingTab.tsx` (self: `onOpenActions`) | exact |
| `src/components/tabs/QueueTab.tsx` | component | event-driven | `src/components/tabs/NowPlayingTab.tsx` (`onOpenActions`) + `src/components/tabs/QueueTab.tsx` | exact |
| `src/components/tabs/ArtistsTab.tsx` | component | CRUD / request-response | `src/components/tabs/ArtistsTab.tsx` + `src/components/tabs/AlbumsTab.tsx` | exact |
| `src/components/tabs/AlbumsTab.tsx` | component | request-response | `src/components/tabs/AlbumsTab.tsx` (self: action buttons header) | exact |
| `src/components/tabs/SearchTab.tsx` | component | request-response | `src/components/tabs/SearchTab.tsx` + `src/components/tabs/PodcastsTab.tsx` (`EpisodeRow`) | exact |
| `src/components/DeckifyExpandedModal.test.tsx` | test | event-driven | `src/components/DeckifyExpandedModal.test.tsx` (self: `vgp_oncancel` & `refValues`) | exact |
| `tests/test_phase25_radio_search.py` | test | request-response | `tests/test_podcast_suite.py` | exact |
| `src/components/tabs/SearchTab.test.tsx` | test | event-driven | `src/components/tabs/PodcastsTab.test.tsx` | exact |

---

## Pattern Assignments

### `py_modules/common.py` (config, file-I/O)

**Analog:** `py_modules/common.py` (lines 102-160)

**Config defaults pattern** (lines 102-160):
```python
DEFAULT_SETTINGS = {
    "device_name": "",
    ...
    "pinned_playlists": [],
    ...
}
```
Add `"search_history": []` to `DEFAULT_SETTINGS` so `_load_settings` and `main.py:set_setting` recognize and persist the key.

---

### `main.py` (controller, request-response)

**Analog:** `main.py` (lines 842-885, 1395-1425)

**Setting validation pattern** (lines 842-854):
```python
    async def set_setting(self, key: str, value) -> dict:
        if key == "active_game_override_snapshot":
            return {"ok": False, "error": "active_game_override_snapshot is managed internally"}
        if key not in DEFAULT_SETTINGS:
            return {"ok": False, "error": f"unknown setting: {key}"}
        ...
        if key == "device_name":
            if not isinstance(value, str) or any(ord(char) < 32 or ord(char) == 127 for char in value):
                return {"ok": False, "error": "Device name must be text without control characters"}
            value = value.strip()
```
Apply the same whitelist + sanitization pattern for `key == "search_history"` (must be `list`, trim strings, drop empty, deduplicate preserving order, truncate each entry e.g. 200 chars, cap at 10 items).

**RPC delegation pattern** (lines 1397-1423):
```python
    async def get_artist_albums(self, artist_id: str, offset: int = 0) -> dict:
        return await rpc_library.get_artist_albums(self, artist_id, offset)

    async def get_artist_top_tracks(self, artist_id: str) -> dict:
        return await rpc_library.get_artist_top_tracks(self, artist_id)

    async def search_spotify(
        self,
        query: str,
        types: str = "track,artist,album,playlist",
        limit: int = 50,
        offset: int = 0,
    ) -> dict:
        return await rpc_library.search_spotify(self, query, types, limit, offset)
```
Expose `get_artist_all_tracks` and `start_radio` on `Plugin` using thin `async def` delegates to `rpc_library` / `rpc_playback`.

---

### `py_modules/rpc_library.py` (service, request-response)

**Analog:** `py_modules/rpc_library.py` (lines 757-819 `get_show_episodes`, lines 849-930 `get_artist_albums` & `get_artist_top_tracks`, lines 979-1061 `search_spotify`)

**Input quoting & `market="from_token"` + `resume_point` pattern** (`get_show_episodes`, lines 759-814):
```python
    if not isinstance(show_id, str) or not show_id.strip():
        return {"ok": False, "error": "Invalid show_id"}
    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}
    safe_id = urllib.parse.quote(show_id.strip(), safe="")
    ...
    resume_point = ep.get("resume_point") or {}
    if not isinstance(resume_point, dict):
        resume_point = {}
    episodes.append({
        "id": ep_id,
        "name": ep_name,
        "show_name": show_name or (ep.get("show") or {}).get("name", ""),
        "uri": ep.get("uri", ""),
        "duration_ms": int(ep.get("duration_ms") or 0),
        "release_date": ep.get("release_date", ""),
        "image_url": img_url,
        "artwork_url": img_url,
        "resume_position_ms": int(resume_point.get("resume_position_ms") or 0),
        "fully_played": bool(resume_point.get("fully_played", False)),
    })
```

**403 -> Search fallback pattern** (`get_artist_top_tracks`, lines 888-907):
```python
        try:
            data = await _exec(
                _spotify_api_request,
                f"artists/{artist_id}/top-tracks", token, "GET",
            )
            items = data.get("tracks", []) if data else []
        except urllib.error.HTTPError as e:
            if e.code == 403:
                artist_info = await _exec(
                    _spotify_api_request, f"artists/{artist_id}", token, "GET",
                )
                artist_name = (artist_info or {}).get("name", "")
                if artist_name:
                    search_data = await _exec(
                        _spotify_api_request, "search", token, "GET",
                        {"q": f"artist:{artist_name}", "type": "track", "limit": 10},
                    )
                    items = (search_data or {}).get("tracks", {}).get("items", [])
            else:
                raise
```

**Search `None`-item guard & `400` limit fallback** (`search_spotify`, lines 995-1058):
```python
        try:
            data = await _exec(
                _spotify_api_request, "search", token, "GET",
                {"q": query, "type": types, "limit": final_limit, "offset": final_offset},
            )
        except Exception as e:
            if "Invalid limit" in str(e) or "400" in str(e):
                data = await _exec(
                    _spotify_api_request, "search", token, "GET",
                    {"q": query, "type": types, "limit": min(final_limit, 10), "offset": final_offset},
                )
            else:
                raise
```
Extend `search_spotify` with `"market": "from_token"` and `shows`/`episodes` parsing (guarding `if not item or not isinstance(item, dict): continue`).
Implement `get_artist_all_tracks(plugin, artist_id: str, album_offset: int = 0, album_limit: int = 3)` using `artists/{safe_id}/albums` + `albums/{alb_id}/tracks` + `await plugin._annotate_tracks_liked(token, tracks)`.

---

### `py_modules/rpc_playback.py` (service, request-response)

**Analog:** `py_modules/rpc_playback.py` (lines 378-430 `play_tracks`) & `py_modules/rpc_library.py` (lines 1064-1097 `get_track_recommendations`)

**Queue replacement via `play_tracks` pattern** (lines 378-422):
```python
async def play_tracks(
    plugin,
    context_uri: str | None = None,
    offset_uri: str | None = None,
    uris: list | None = None,
    position: int = 0,
    position_ms: int | None = None,
) -> dict:
    ...
    elif uris:
        ...
        body["uris"] = uris
```
Calling `await play_tracks(plugin, uris=final_uris)` issues `PUT me/player/play` with `{"uris": final_uris}`, playing `final_uris[0]` immediately and replacing the upcoming queue on both `spotify_client` and `librespot` (with `_auto_transfer_and_play` and `power_gov.wake_for_playback()` already built in).

---

### `src/types.ts` (model, transform)

**Analog:** `src/types.ts` (lines 63-125)

```typescript
export interface TrackItem {
  id?: string;
  track_id?: string;
  uri?: string;
  name?: string;
  artist?: string;
  album?: string;
  image_url?: string | null;
  artwork_url?: string | null;
  duration_ms?: number;
  is_liked?: boolean;
  artist_id?: string;
  album_id?: string;
  media_type?: string;
}
```
Add `NavHistoryEntry`, `SearchResults` (including `shows?: ShowItem[]`, `episodes?: EpisodeItem[]`), and `search_history?: string[]` to `DeckifySettings` if typed.

---

### `src/components/DeckifyExpandedModal.tsx` (component, event-driven)

**Analog:** `src/components/DeckifyExpandedModal.tsx` (lines 77-80 callables, lines 125-135 state, lines 331-375 drill-down handlers, lines 1085-1133 `vgp_oncancel`)

**Callable registration pattern** (lines 77-80):
```typescript
const backendGetAlbumTracks = callable<[string, number], { ok: boolean; tracks?: TrackItem[]; error?: string }>("get_album_tracks");
const backendGetArtistTopTracks = callable<[string], { ok: boolean; tracks?: TrackItem[]; error?: string }>("get_artist_top_tracks");
const backendGetArtistAlbums = callable<[string, number], { ok: boolean; albums?: AlbumItem[]; error?: string }>("get_artist_albums");
```

**`vgp_oncancel` backstack pattern** (lines 1089-1132):
```typescript
    el.addEventListener("vgp_oncancel", (e: Event) => {
      if (actionTrackRef.current) {
        e.preventDefault();
        e.stopPropagation();
        (e as any).stopImmediatePropagation?.();
        setActionTrack(null);
        return;
      }
      ...
```
Replace the flat `activeAlbumRef` / `activeArtistRef` / `activePlaylistRef` / `activeShowRef` clear blocks with `navigationHistoryRef` (`useRef<NavHistoryEntry[]>([])`, capped at 10 entries) pop + restore of `mode`, active entity, `contentPaneRef.current.scrollTop`, and DOM focus via `requestAnimationFrame`. Keep `navigationHistoryRef` initialized to `[]` (non-null) so `DeckifyExpandedModal.test.tsx`'s `refValues` loop does not mutate it.

---

### `src/components/common/TrackActionModal.tsx` (component, event-driven)

**Analog:** `src/components/common/TrackActionModal.tsx` (lines 158-190)

**Action row pattern** (lines 158-178):
```tsx
            {!isSpoken && (
              <InteractiveRow onClick={() => onStartRadio(actionTrack)} style={{ gap: 10 }}>
                <FaBroadcastTower size={12} color="var(--deckify-accent, #1DB954)" />
                <span>Start Track Radio</span>
              </InteractiveRow>
            )}

            {/* Go to Artist / Show */}
            {(actionTrack.artist_id || actionTrack.artist) && (
              <InteractiveRow
                onClick={() => {
                  onClose();
                  setMode("artists");
                  onOpenArtist({ id: actionTrack.artist_id || "", name: actionTrack.artist || "" });
                }}
                style={{ gap: 10 }}
              >
                <FaUser size={12} />
                <span>{isSpoken ? `Go to Show (${actionTrack.artist})` : `Go to Artist (${actionTrack.artist})`}</span>
              </InteractiveRow>
            )}
```
Update label to `"Start Song Radio"` and ensure `onOpenArtist` / `onOpenAlbum` / `onStartRadio` trigger cleanly from any originating tab.

---

### `src/components/tabs/NowPlayingTab.tsx` (component, event-driven)

**Analog:** `src/components/tabs/NowPlayingTab.tsx` (lines 433-439)

```tsx
      <RoundBtn
        onClick={() => track && onOpenActions?.(track as TrackItem)}
        size={42}
        aria-label="Add to Playlist"
      >
        <FaPlus size={15} />
      </RoundBtn>
```
`NowPlayingTab` already forwards `track` to `onOpenActions` (`setActionTrack` in `DeckifyExpandedModal.tsx:1221`). Ensure `artist_id` and `album_id` are preserved on `track` when opening `TrackActionModal`.

---

### `src/components/tabs/QueueTab.tsx` (component, event-driven)

**Analog:** `src/components/tabs/NowPlayingTab.tsx` (`onOpenActions`) & `src/components/tabs/QueueTab.tsx` (lines 29-125)

Currently `QueueTabProps` (lines 8-16) lacks `onOpenActions?: (track: TrackItem) => void`, and `currentlyPlaying` card (lines 30-108) is a non-focusable `<div>`. Add `onOpenActions` to `QueueTabProps`, wire an Options button / `InteractiveRow` on `currentlyPlaying` and queue rows, matching `TrackRowItem` / `NowPlayingTab`.

---

### `src/components/tabs/ArtistsTab.tsx` (component, CRUD / request-response)

**Analog:** `src/components/tabs/ArtistsTab.tsx` (lines 68-107) & `src/components/tabs/AlbumsTab.tsx` (lines 88-105)

**Header action button pattern** (`AlbumsTab.tsx`, lines 88-101):
```tsx
          <Focusable flow-children="horizontal" style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
            <InteractiveRow onClick={onCloseAlbum} style={{ padding: "6px 12px", fontSize: 12 }}>
              ← Back (B)
            </InteractiveRow>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{activeAlbum.name}</h2>
              <span style={{ fontSize: 12, opacity: 0.6 }}>{activeAlbum.artist}</span>
            </div>
            <InteractiveRow
              onClick={() => onPlayTrack("", activeAlbum.uri)}
              style={{ marginLeft: "auto", background: "var(--deckify-accent, #1DB954)", color: "#000", fontWeight: 700, padding: "8px 16px", borderRadius: 20, gap: 8 }}
            >
              <FaPlay size={11} /> Play Album
            </InteractiveRow>
```
Add **Start Artist Radio** button in the `ArtistsTab` header (`flow-children="horizontal"`) and add a **All Tracks** section (using `TrackRowItem` + "Load More" `InteractiveRow` calling `get_artist_all_tracks` pagination).

---

### `src/components/tabs/AlbumsTab.tsx` (component, request-response)

**Analog:** `src/components/tabs/AlbumsTab.tsx` (lines 88-110)

Add a **Start Album Radio** `InteractiveRow` alongside **Play Album** and Pin button inside the `flow-children="horizontal"` header.

---

### `src/components/tabs/SearchTab.tsx` (component, request-response)

**Analog:** `src/components/tabs/SearchTab.tsx` (lines 39-140) & `src/components/tabs/PodcastsTab.tsx` (`EpisodeRow`, lines 67-105)

**Filter chips pattern** (lines 74-85):
```tsx
      <Focusable flow-children="horizontal" style={{ display: "flex", gap: 8, marginTop: 12, marginBottom: 16 }}>
        {(["all", "tracks", "artists", "albums", "playlists"] as const).map((tab) => (
          <InteractiveRow
            key={tab}
            onClick={() => setSearchTab(tab)}
            active={searchTab === tab}
            style={{ padding: "5px 12px", fontSize: 12, fontWeight: 700, textTransform: "capitalize" }}
          >
            {tab}
          </InteractiveRow>
        ))}
      </Focusable>
```
Extend filter chips to 7 items (`all`, `tracks`, `artists`, `albums`, `playlists`, `podcasts`, `episodes`), add idle screen (`!searchQuery.trim()`) with persisted history pills (`flow-children="horizontal"`) + 12 Gaming & Mood tiles (in `flow-children="horizontal"` rows), and reuse `EpisodeRow` from `PodcastsTab.tsx` for episode results.

---

### `src/components/DeckifyExpandedModal.test.tsx` (test, event-driven)

**Analog:** `src/components/DeckifyExpandedModal.test.tsx` (lines 190-220)

Extend `vgp_oncancel` describe block to test `navigationHistoryRef` push/pop, cap at 10, `scrollTop` restoration, and focus restoration.

---

### `tests/test_phase25_radio_search.py` (test, request-response)

**Analog:** `tests/test_podcast_suite.py` (lines 1-60)

**Test harness pattern** (`tests/test_podcast_suite.py`, lines 14-23):
```python
def make_plugin(audio_backend: str = "spotify_client"):
    settings = dict(common.DEFAULT_SETTINGS)
    settings["audio_backend"] = audio_backend
    return SimpleNamespace(
        _settings=settings,
        _playback_speed=1.0,
        _last_media_is_spoken=False,
        _ensure_token=AsyncMock(return_value="tok"),
    )
```
Use `unittest.IsolatedAsyncioTestCase` with `make_plugin()` and `patch.object(...)` to test `start_radio` 3-tier waterfall, `get_artist_all_tracks`, `search_spotify` (`show`/`episode`), and `search_history` validation in `main.py:set_setting`.

---

### `src/components/tabs/SearchTab.test.tsx` (test, event-driven)

**Analog:** `src/components/tabs/PodcastsTab.test.tsx` (lines 1-60)

**VNode mock & `vi.mock` pattern** (`PodcastsTab.test.tsx`, lines 1-60):
Mock `react`, `react/jsx-runtime`, `react/jsx-dev-runtime`, `@decky/api`, `@decky/ui` with VNode tree helpers (`findNodes`) to test Search 2.0 idle screen (history pills, 12 tiles, no virtual keyboard), Playlists-first tile ordering, 7 filter chips, and `EpisodeRow` rendering.

---

## Shared Patterns

### Horizontal Controller Navigation (`flow-children="horizontal"`)
**Source:** `src/components/tabs/SearchTab.tsx` (line 74), `src/components/tabs/AlbumsTab.tsx` (line 88)
**Apply to:** `SearchTab.tsx` (filter chips, history pills, tile rows), `ArtistsTab.tsx` (header action buttons), `AlbumsTab.tsx` (header action buttons)
All horizontal button/chip/tile rows MUST use `flow-children="horizontal"` (never `"row"`), and compact inline `DialogButton`s must set `width: "auto"` / `minWidth: "auto"`.

### CSP Image Proxy (`DeckifyImage` & `_image_url`)
**Source:** `py_modules/rpc_library.py` (lines 800, 869), `src/components/common/DeckifyImage.tsx`
**Apply to:** `py_modules/rpc_library.py` (`search_spotify`, `get_artist_all_tracks`), `SearchTab.tsx` (shows, episodes, playlists, artists, albums)
All artwork URLs returned from Python must pass through `_image_url(images)` and render via `<DeckifyImage />` on the frontend.

### Structured Backend RPC Error Handling & Input Quoting
**Source:** `py_modules/rpc_library.py` (lines 759-769, 817-819)
**Apply to:** `py_modules/rpc_library.py` (`get_artist_all_tracks`, `search_spotify`), `py_modules/rpc_playback.py` (`start_radio`), `main.py` (`set_setting`)
Always validate/quote path IDs via `urllib.parse.quote(id.strip(), safe="")`, catch exceptions, log via `decky.logger.error(...)`, and return `{"ok": False, "error": str(e)}`.

---

## No Analog Found

None — all 15 files have exact in-repo analogs.

## Metadata

**Analog search scope:** `py_modules/`, `main.py`, `src/`, `tests/`
**Files scanned:** 14 existing source/test files
**Pattern extraction date:** 2026-11-23
