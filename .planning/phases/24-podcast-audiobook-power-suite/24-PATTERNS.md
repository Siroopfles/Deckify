# Phase 24: Podcast & Audiobook Power Suite - Pattern Map

**Mapped:** 2026-11-22
**Files analyzed:** 17
**Analogs found:** 17 / 17

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `py_modules/common.py` | config | static-config | `py_modules/common.py` | exact |
| `py_modules/engine.py` | service | request-response (CDP) | `py_modules/engine.py` (`_cdp_get_saved_episodes`) | exact |
| `py_modules/rpc_playback.py` | controller | request-response | `py_modules/rpc_playback.py` (`seek_playback`) | exact |
| `py_modules/rpc_library.py` | controller | CRUD (read/normalize) | `py_modules/rpc_library.py` (`get_saved_episodes`, `get_album_tracks`) | exact |
| `main.py` | service | event-driven / RPC router | `main.py` (`_poll_player`, `get_saved_episodes`) | exact |
| `src/types.ts` | model | static-types | `src/types.ts` (`TrackMeta`, `EpisodeItem`) | exact |
| `src/utils/playback.ts` | utility | transform | `src/utils/listNavigation.ts` | role-match |
| `src/hooks/usePlaybackClock.ts` | hook | event-driven / timer | `src/hooks/usePlaybackClock.ts` | exact |
| `src/components/tabs/NowPlayingTab.tsx` | component | event-driven / UI | `src/components/tabs/NowPlayingTab.tsx` + `src/components/tabs/SoundtracksTab.tsx` | exact |
| `src/components/tabs/PodcastsTab.tsx` | component | CRUD / UI list | `src/components/tabs/PodcastsTab.tsx` + `src/components/tabs/AlbumsTab.tsx` | exact |
| `src/components/DeckifyExpandedModal.tsx` | component | event-driven / modal | `src/components/DeckifyExpandedModal.tsx` (`handleOpenAlbum`, `useTriggerNavigation`) | exact |
| `src/index.tsx` | component | event-driven / QAM | `src/index.tsx` (`QuickAccessMenu`) | exact |
| `tests/test_discovery.py` | test | unit | `tests/test_discovery.py` | exact |
| `tests/test_podcast_suite.py` | test | unit | `tests/test_discovery.py` | exact |
| `src/hooks/usePlaybackClock.test.ts` | test | unit | `src/hooks/usePlaybackClock.test.ts` | exact |
| `src/components/tabs/NowPlayingTab.test.tsx` | test | unit | `src/components/tabs/QueueTab.test.tsx` | exact |
| `src/components/tabs/PodcastsTab.test.tsx` | test | unit | `src/components/tabs/QueueTab.test.tsx` | exact |

## Pattern Assignments

### `py_modules/common.py` (config, static-config)

**Analog:** `py_modules/common.py`

**Scopes & Constants pattern** (lines 184-195):
```python
SPOTIFY_SCOPES = (
    "user-read-currently-playing user-read-playback-state user-modify-playback-state "
    "playlist-read-private playlist-read-collaborative playlist-modify-public "
    "playlist-modify-private user-library-read user-library-modify "
    "user-follow-read user-read-recently-played user-top-read"
)
CURRENT_SCOPES_VERSION = 7
OAUTH_SERVER_PORT = 39281
MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_PINNED_PLAYLISTS = 4
VALID_PINNED_TYPES = ("playlist", "album", "liked_songs")
```
- Add `user-read-playback-position` to `SPOTIFY_SCOPES`, bump `CURRENT_SCOPES_VERSION = 8`, and define `ALLOWED_PLAYBACK_SPEEDS = (0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0)` plus `preferred_podcast_speed: 1.0` in `DEFAULT_SETTINGS`.

---

### `py_modules/engine.py` (service, request-response CDP)

**Analog:** `py_modules/engine.py` (`_cdp_get_saved_episodes`)

**CDP React Fiber Registry Lookup pattern** (lines 827-860):
```python
def _cdp_get_saved_episodes(offset: int = 0, port: int = SPOTIFY_CDP_PORT) -> dict:
    """Fetch Your Episodes (saved podcast episodes) via Official Spotify Client CDP."""
    safe_offset = max(0, int(offset))
    expr = f"""
    (async () => {{
      try {{
        const el = document.querySelector('#main');
        if (!el) return {{ ok: false, error: 'Spotify UI root not found' }};
        const fk = Object.keys(el).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactContainer$'));
        if (!fk) return {{ ok: false, error: 'React fiber root not found' }};
        const queue = [el[fk]];
        const visited = new Set();
        let registry = null;
        while (queue.length > 0 && !registry && visited.size < 5000) {{
          const n = queue.shift();
          if (!n || visited.has(n)) continue;
          visited.add(n);
          const val = n.memoizedProps?.value;
          if (val && val._map instanceof Map) {{ registry = val; break; }}
          if (val && typeof val.getRegistry === 'function') {{ registry = val.getRegistry(); break; }}
          if (n.child) queue.push(n.child);
          if (n.sibling) queue.push(n.sibling);
        }}
        if (!registry || !(registry._map instanceof Map)) return {{ ok: false, error: 'Platform registry not found' }};
        let libApi = null;
        let playlistApi = null;
        for (const [k, v] of registry._map.entries()) {{
          const d = k?.description || String(k);
          if (d === 'LibraryAPI') libApi = v?.instance || v;
          if (d === 'PlaylistAPI') playlistApi = v?.instance || v;
        }}
```
- Copy this exact fiber traversal + `registry._map` lookup for `_cdp_set_playback_speed(speed: float, port: int = SPOTIFY_CDP_PORT)` targeting `d === 'PlayerAPI'` and calling `await playerApi.setSpeed(safe_speed)` via `_cdp_evaluate(expr, port=port, timeout=5.0)`.

---

### `py_modules/rpc_playback.py` (controller, request-response)

**Analog:** `py_modules/rpc_playback.py` (`seek_playback`)

**Imports pattern** (lines 1-16):
```python
import asyncio
import os
import socket
import time
import urllib.error
from py_modules.common import (
    _exec,
    decky,
)
from py_modules.eco import read_power_supply_state
from py_modules.engine import _cdp_toggle_like_track
from py_modules.images import _image_url
from py_modules.spotify import (
    _spotify_api_request,
    _parse_spotify_error,
)
```

**Playback RPC & Error Handling pattern** (lines 92-115):
```python
async def seek_playback(plugin, position_ms: int, device_id: str = "") -> dict:
    """Seek to a target position in ms."""
    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}
    position_ms = max(0, int(position_ms))
    params: dict = {"position_ms": position_ms}
    if device_id:
        params["device_id"] = device_id
    try:
        await _exec(_spotify_api_request, "me/player/seek", token, "PUT", params)
        if plugin._last_event:
            plugin._last_event["position_ms"] = position_ms
        mpris_bridge = getattr(plugin, "_mpris_bridge", None)
        if mpris_bridge is not None and hasattr(mpris_bridge, "notify_seeked"):
            await mpris_bridge.notify_seeked(position_ms)
        return {"ok": True, "position_ms": position_ms}
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {"ok": False, "error": "No active device found"}
        return {"ok": False, "error": _parse_spotify_error(e)}
    except Exception as e:
        decky.logger.error("seek_playback(%d) failed: %s", position_ms, e)
        return {"ok": False, "error": str(e)}
```
- Follow this structure for `set_playback_speed(plugin, speed: float)`: validate `speed` against `ALLOWED_PLAYBACK_SPEEDS`, check `audio_backend == "spotify_client"` (return `{"ok": False, "unsupported_backend": True, "error": ...}` on `librespot`), offload `_cdp_set_playback_speed` via `_exec`, update `plugin._playback_speed` & `plugin._settings["preferred_podcast_speed"]`, and emit `"playback_speed_changed"`.

---

### `py_modules/rpc_library.py` (controller, CRUD read/normalize)

**Analog:** `py_modules/rpc_library.py` (`get_saved_episodes` & `get_album_tracks`)

**Episode Normalization pattern** (lines 580-595):
```python
            images = ep.get("images") or []
            resume_point = ep.get("resume_point") or {}
            dur_ms = int(ep.get("duration_ms") or 0)
            if dur_ms <= 0 and ep_id:
                missing_duration_ids.append(ep_id)
            episodes.append({
                "id": ep_id,
                "name": ep_name,
                "show_name": show.get("name", ""),
                "uri": ep.get("uri", ""),
                "duration_ms": dur_ms,
                "image_url": _image_url(images),
                "artwork_url": _image_url(images),
                "resume_position_ms": int(resume_point.get("resume_position_ms") or 0),
                "fully_played": bool(resume_point.get("fully_played", False)),
            })
```

**Parent-Child Collection Drill-Down RPC pattern** (lines 710-753):
```python
async def get_album_tracks(plugin, album_id: str, offset: int = 0) -> dict:
    """Fetch tracks for a specified album ID."""
    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}
    try:
        ...
        data = await _exec(
            _spotify_api_request,
            f"albums/{album_id}/tracks", token, "GET",
            {"limit": 50, "offset": offset},
        )
        ...
        return {"ok": True, "tracks": tracks, "total": total, "offset": offset}
    except Exception as e:
        decky.logger.error("get_album_tracks failed: %s", e)
        return {"ok": False, "error": str(e)}
```
- Copy both patterns for `get_show_episodes(plugin, show_id: str, offset: int = 0) -> dict`: sanitize `show_id` with `urllib.parse.quote(show_id, safe="")`, query `shows/{safe_id}/episodes` with `{"limit": 50, "offset": offset, "market": "from_token"}`, and return `{"ok": True, "episodes": episodes, "total": total, "offset": offset}`.

---

### `main.py` (service, event-driven / RPC router)

**Analog:** `main.py` (`_poll_player` & RPC wrapper methods)

**Track Metadata & Event Emission pattern** (lines 1985-2013):
```python
            if item.get("type") == "episode":
                show = item.get("show") or {}
                artist = show.get("name") or "Unknown"
                album_name = ""
                images = item.get("images") or show.get("images") or []
            else:
                album = item.get("album") or {}
                artist = ", ".join(a["name"] for a in item.get("artists", [])) or "Unknown"
                album_name = album.get("name", "")
                images = album.get("images") or []
            artwork_url = _image_url(images)
            artist_id = (item.get("artists") or [{}])[0].get("id", "") if item.get("type") != "episode" else ""
            album_id = (item.get("album") or {}).get("id", "") if item.get("type") != "episode" else ""
            meta = {
                "track_id": track_id,
                "id": track_id,
                "name": item.get("name", "Unknown"),
                "artist": artist,
                "album": album_name,
                "artist_id": artist_id,
                "album_id": album_id,
                "artwork_url": artwork_url,
                "image_url": artwork_url,
                "duration_ms": duration_ms,
                "uri": item.get("uri", ""),
                "is_liked": is_liked,
            }
            self._track_meta = meta
            await decky.emit("track_metadata", meta)
```
- Extend `meta` with `"media_type": item.get("type") or data.get("currently_playing_type") or "track"`. On track transition in `_poll_player`, detect spoken content (`episode`, `chapter`, `audiobook`), auto-reset active speed to `1.0` when transitioning to music (preserving `preferred_podcast_speed`), and restore `preferred_podcast_speed` when transitioning back to spoken content. Expose `set_playback_speed` and `get_show_episodes` on `Plugin`.

---

### `src/types.ts` (model, static-types)

**Analog:** `src/types.ts` (`TrackMeta`, `EpisodeItem`)

**Interfaces pattern** (lines 47-60, 103-113):
```typescript
export interface TrackMeta {
  track_id?: string;
  id?: string;
  name: string;
  artist: string;
  album: string;
  artwork_url?: string | null;
  image_url?: string | null;
  duration_ms: number;
  uri?: string;
  is_liked?: boolean;
  artist_id?: string;
  album_id?: string;
}
...
export interface EpisodeItem {
  id: string;
  name: string;
  show_name: string;
  image_url?: string;
  duration_ms?: number;
  uri: string;
  release_date?: string;
  resume_position_ms?: number;
  fully_played?: boolean;
}
```
- Add `media_type?: string;` to `TrackMeta` / `TrackItem`, `playback_speed?: number;` to `StatusResponse`, and export `ShowItem` and `EpisodeFilter = "all" | "unplayed" | "in_progress"`.

---

### `src/utils/playback.ts` (utility, transform)

**Analog:** `src/utils/listNavigation.ts`

- Pure TypeScript helper module (no React/DOM dependencies) exporting:
  - `PLAYBACK_SPEED_OPTIONS` (`0.5x` through `2.0x` `SingleDropdownOption[]`)
  - `QAM_SPEED_CYCLE = [1.0, 1.25, 1.5, 1.75, 2.0, 0.5, 0.75] as const` and `getNextCycleSpeed(current)`
  - `isSpokenContent(track?: TrackMeta | TrackItem | null): boolean`
  - `filterEpisodes(episodes: EpisodeItem[], filter: EpisodeFilter): EpisodeItem[]`
  - `formatRemainingTime(durationMs?: number, resumeMs?: number): string`

---

### `src/hooks/usePlaybackClock.ts` (hook, event-driven / timer)

**Analog:** `src/hooks/usePlaybackClock.ts`

**Interpolation & Options pattern** (lines 86-93, 106-114):
```typescript
  public getInterpolatedPosition(now = Date.now()): number {
    const elapsed = this.isPlaying ? Math.max(0, now - this.syncTime) : 0;
    const computed = this.basePosition + elapsed;
    if (this.durationMs > 0) {
      return Math.min(this.durationMs, Math.max(0, computed));
    }
    return Math.max(0, computed);
  }
...
  public updateOptions(options: PlaybackClockOptions): void {
    const now = Date.now();
    this.onSeekCommit = options.onSeekCommit;
    this.durationMs = options.durationMs;
    this.driftThresholdMs = options.driftThresholdMs ?? 1200;
    this.suppressServerWindowMs = options.suppressServerWindowMs ?? 1500;
    this.debounceSeekMs = options.debounceSeekMs ?? 300;
    this.tickIntervalMs = options.tickIntervalMs ?? 250;
```
- Add `playbackSpeed?: number` (default `1.0`) to `PlaybackClockOptions`, multiply `elapsed * this.playbackSpeed`, and re-anchor `(this.basePosition = this.getInterpolatedPosition(now); this.syncTime = now)` whenever `playbackSpeed` changes.

---

### `src/components/tabs/NowPlayingTab.tsx` (component, event-driven / UI)

**Analog:** `src/components/tabs/NowPlayingTab.tsx` + `src/components/tabs/SoundtracksTab.tsx` (`DropdownItem` / `Dropdown`)

**Horizontal Transport Row pattern** (lines 231-255):
```tsx
      {/* Playback Controls */}
      <Focusable
        flow-children="horizontal"
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14 }}
      >
        <RoundBtn
          onClick={() => onSetShuffle(!status?.shuffle_state)}
          active={status?.shuffle_state}
          size={42}
        >
          <FaRandom size={16} />
        </RoundBtn>

        <RoundBtn onClick={handlePrev} size={46}>
          <FaStepBackward size={18} />
        </RoundBtn>

        <RoundBtn onClick={handlePlayPause} size={54} accent>
          {isPlaying ? <FaPause size={20} /> : <FaPlay size={20} style={{ marginLeft: 2 }} />}
        </RoundBtn>

        <RoundBtn onClick={handleNext} size={46}>
          <FaStepForward size={18} />
        </RoundBtn>
```
- When `isSpokenContent(track)` is true, replace `handlePrev`/`handleNext` `RoundBtn`s with dedicated `-15s` / `+15s` smart-skip `RoundBtn`s (`handleSeekDelta(-15)` / `handleSeekDelta(15)`) and render a `@decky/ui` `Dropdown` (`rgOptions={PLAYBACK_SPEED_OPTIONS}`, `selectedOption={playbackSpeed}`, `onChange={(opt) => onSetPlaybackSpeed?.(opt.data)}`) in a extracted helper component to stay under ESLint's 80-line `max-lines-per-function`.

---

### `src/components/tabs/PodcastsTab.tsx` (component, CRUD / UI list)

**Analog:** `src/components/tabs/PodcastsTab.tsx` + `src/components/tabs/AlbumsTab.tsx`

**Show Drill-Down Header pattern** (`src/components/tabs/AlbumsTab.tsx`, lines 42-90):
```tsx
      {!activeAlbum ? (
        <div>
          ...
        </div>
      ) : (
        <div>
          <Focusable flow-children="horizontal" style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
            <InteractiveRow onClick={onCloseAlbum} style={{ padding: "6px 12px", fontSize: 12 }}>
              ← Back (B)
```

**Episode Row & Resume Progress pattern** (`src/components/tabs/PodcastsTab.tsx`, lines 66-100):
```tsx
            {savedEpisodes.map((ep) => {
              const resumeMs = ep.resume_position_ms || 0;
              const durationMs = ep.duration_ms || 1;
              const pct = Math.min(100, Math.round((resumeMs / durationMs) * 100));

              return (
                <InteractiveRow
                  key={ep.id}
                  data-deckify-list-item="true"
                  data-deckify-label={ep.name || ""}
                  onClick={() => onPlayTrack(ep.uri)}
                  style={{ gap: 12, flexShrink: 0 }}
                >
```
- Extract `EpisodeRow`, `EpisodeFilterBar` (`<Focusable flow-children="horizontal">` with `"All"`, `"Unplayed"`, `"In Progress"` `DialogButton` pills with `minWidth: "auto"`), and `ShowEpisodesView`. Pin the thin green progress bar (`height: 3`, `background: "var(--deckify-accent, #1DB954)"`) to the bottom of each episode row, paired with `"Played"` or `"Xm left"` badges.

---

### `src/components/DeckifyExpandedModal.tsx` (component, event-driven / modal)

**Analog:** `src/components/DeckifyExpandedModal.tsx` (`handleOpenAlbum`, `useTriggerNavigation`)

**Collection Drill-Down Handler pattern** (lines 321-331):
```tsx
  const handleOpenAlbum = useCallback(async (alb: AlbumItem) => {
    focusedCollectionRef.current = null;
    setActiveAlbum(alb);
    setMode("albums");
    setLoadingContent(true);
    try {
      const res = await backendGetAlbumTracks(alb.id, 0);
      if (res.ok && res.tracks) setAlbumTracks(res.tracks);
    } catch {}
    setLoadingContent(false);
  }, []);
```

**L2/R2 Trigger Seek Accumulation pattern** (lines 882-896):
```tsx
          const seekStepSec = Math.min(
            30,
            Math.max(5, Number((status?.settings as any)?.trigger_seek_seconds ?? 10))
          );

          if (pendingSeekDeltaSecRef.current === 0) {
            seekBaseMsRef.current = currentPositionMsRef.current;
          }
          pendingSeekDeltaSecRef.current += side === "R2" ? seekStepSec : -seekStepSec;
```
- When `isSpokenRef.current` is true, override `seekStepSec` to `15` for `L2`/`R2` triggers. Pass `playbackSpeed` into `usePlaybackClock`, wire `handleOpenShow` / `activeShow` / `showEpisodes` for `PodcastsTab`, and wire `handleSetPlaybackSpeed` for `NowPlayingTab`.

---

### `src/index.tsx` (component, event-driven / QAM)

**Analog:** `src/index.tsx` (`QuickAccessMenu`)

**Spoken Content Detection & QAM Podcast Row pattern** (lines 1263, 1551-1560):
```tsx
  const isPodcast = trackMeta?.album === "" || trackMeta?.uri?.includes(":episode:");
...
                  {isPodcast && (
                    <Focusable flow-children="horizontal" style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 4 }}>
                      <DialogButton style={{ minWidth: "auto", padding: "4px 10px", fontSize: 11 }} onClick={() => handleSeekDelta(-15)}>
                        -15s
                      </DialogButton>
                      <DialogButton style={{ minWidth: "auto", padding: "4px 10px", fontSize: 11 }} onClick={() => handleSeekDelta(15)}>
                        +15s
                      </DialogButton>
                    </Focusable>
                  )}
```
- Replace `isPodcast` with `isSpokenContent(trackMeta)`. Insert the compact speed cycle `DialogButton` (`style={{ minWidth: "auto", padding: "4px 10px", fontSize: 11 }}`) inside this existing `<Focusable flow-children="horizontal">` row, cycling via `getNextCycleSpeed(playbackSpeed)`. Append any new `useState` hooks at the end of `QuickAccessMenu`'s existing `useState` block.

---

### `tests/test_discovery.py` & `tests/test_podcast_suite.py` (test, unit)

**Analog:** `tests/test_discovery.py`

**Decky Mock & Async Test Setup pattern** (lines 10-25, 98-100):
```python
with patch.dict("sys.modules", {"decky": SimpleNamespace(
    DECKY_PLUGIN_SETTINGS_DIR=tempfile.gettempdir(),
    DECKY_PLUGIN_DIR=tempfile.gettempdir(),
    DECKY_PLUGIN_RUNTIME_DIR=tempfile.gettempdir(),
    logger=MagicMock(),
    emit=AsyncMock(),
)}):
    from py_modules import common, rpc_library, spotify


def make_plugin():
    return SimpleNamespace(
        _settings=dict(common.DEFAULT_SETTINGS),
        _ensure_token=AsyncMock(return_value="tok"),
        _annotate_tracks_liked=AsyncMock(),
    )
...
    def test_scopes_version_7_includes_user_top_read(self):
        self.assertEqual(common.CURRENT_SCOPES_VERSION, 7)
        self.assertIn("user-top-read", common.SPOTIFY_SCOPES.split())
```

---

### `src/hooks/usePlaybackClock.test.ts` (test, unit)

**Analog:** `src/hooks/usePlaybackClock.test.ts`

**Fake Timer Interpolation pattern** (lines 46-59):
```typescript
    it("advances position monotonically when isPlaying is true", () => {
      const clock = new PlaybackClockController({
        serverPositionMs: 10000,
        isPlaying: true,
        durationMs: 60000,
      });

      expect(clock.positionMs).toBe(10000);
      vi.advanceTimersByTime(1000);
      expect(clock.positionMs).toBe(11000);
      vi.advanceTimersByTime(2500);
      expect(clock.positionMs).toBe(13500);
      clock.destroy();
    });
```

---

### `src/components/tabs/NowPlayingTab.test.tsx` & `src/components/tabs/PodcastsTab.test.tsx` (test, unit)

**Analog:** `src/components/tabs/QueueTab.test.tsx`

**JSX Tree Test & `findNodes` Helper pattern** (lines 3-60):
```typescript
vi.mock("react/jsx-dev-runtime", () => ({
  jsxDEV: (type: any, props: any, key: any) => ({
    type,
    props: { ...props, ...(key !== undefined ? { key } : {}) },
  }),
}));
...
vi.mock("@decky/ui", () => ({
  Focusable: ({ children, ...props }: any) => ({
    type: "Focusable",
    props: { children, ...props },
  }),
}));
...
function findNodes(tree: any, predicate: (node: any) => boolean, results: any[] = []): any[] {
  if (!tree) return results;
  if (predicate(tree)) results.push(tree);
```

## Shared Patterns

### Spoken Content Detection (`isSpokenContent`)
**Source:** `src/utils/playback.ts` (replacing `src/index.tsx:1263`)
**Apply to:** `NowPlayingTab.tsx`, `QuickAccessMenu` (`src/index.tsx`), `DeckifyExpandedModal.tsx` (`L2`/`R2` trigger handler)
- Checks `media_type === "episode" || media_type === "chapter" || media_type === "audiobook"`, then URI `:episode:` / `:chapter:`, with legacy `album === ""` fallback only when `media_type` is undefined.

### Horizontal GamepadUI Navigation (`flow-children="horizontal"`)
**Source:** `src/index.tsx:1552` & `src/components/tabs/AlbumsTab.tsx:88`
**Apply to:** `PodcastsTab.tsx` filter pills, `NowPlayingTab.tsx` transport row, `QuickAccessMenu` speed cycle row
- Always use `<Focusable flow-children="horizontal">` (never `flow-children="row"`) and `style={{ minWidth: "auto" }}` on inline `DialogButton`s.

### Backend RPC Error Handling & `_exec()` Offloading
**Source:** `py_modules/rpc_playback.py:92-115` & `py_modules/rpc_library.py:710-753`
**Apply to:** `set_playback_speed`, `get_show_episodes`, `_cdp_set_playback_speed`
- Offload blocking HTTP/CDP calls via `_exec()`, catch `urllib.error.HTTPError` and `Exception`, and return `{"ok": bool, ...}`.

## No Analog Found

All 17 files have exact or strong role-match analogs in the existing codebase.

## Metadata

**Analog search scope:** `main.py`, `py_modules/`, `src/`, `tests/`
**Files scanned:** 12 source and test files
**Pattern extraction date:** 2026-11-22
