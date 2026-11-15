# Phase 09: QAM Pinned Playlists & Quick In-Game Switch - Pattern Map

**Mapped:** 2026-11-14
**Files analyzed:** 13
**Analogs found:** 13 / 13

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/types.ts` | type-definitions | transform | `src/types.ts` (self — `EngineSettings`, `StatusResponse`) | exact |
| `py_modules/common.py` | config | file-I/O | `py_modules/common.py` (self — `DEFAULT_SETTINGS`, `_load_settings`) | exact |
| `py_modules/rpc_playback.py` | service | request-response | `py_modules/rpc_playback.py` (self — `play_tracks`, `get_devices`) | exact |
| `main.py` | controller | request-response | `main.py` (self — `set_setting`, `control_playback`, `get_status`) | exact |
| `src/index.tsx` | component | event-driven / request-response | `src/index.tsx` (self — QAM Transport & `Focusable flow-children="horizontal"`) | exact |
| `src/components/DeckifyExpandedModal.tsx` | component | event-driven | `src/components/DeckifyExpandedModal.tsx` (self — `Y`-button handler & `focusedTrackRef`) | exact |
| `src/components/common/CollectionActionModal.tsx` (new) | component | event-driven | `src/components/common/TrackActionModal.tsx` | exact |
| `src/components/tabs/PlaylistsTab.tsx` | component | CRUD / request-response | `src/components/tabs/PlaylistsTab.tsx` (self — horizontal detail header & `InteractiveRow`) | exact |
| `src/components/tabs/AlbumsTab.tsx` | component | request-response | `src/components/tabs/PlaylistsTab.tsx` | exact |
| `src/components/tabs/LikedSongsTab.tsx` | component | request-response | `src/components/tabs/AlbumsTab.tsx` | exact |
| `tests/test_pinned_playlists.py` (new) | test | unit | `tests/test_soundtrack.py` | exact |
| `src/index.test.tsx` | test | unit | `src/index.test.tsx` (self) | exact |
| `src/components/DeckifyExpandedModal.test.tsx` | test | unit | `src/components/DeckifyExpandedModal.test.tsx` (self) | exact |

---

## Pattern Assignments

### `src/types.ts` (type-definitions, transform)

**Analog:** `src/types.ts` (lines 143–225)

**Interface extension pattern** (lines 143–156, 210–225):
```typescript
export interface EngineSettings {
  device_name?: string;
  // ...
  playlist_folders?: FolderItem[];
  spotify_folder_tree?: FolderItem[];
  game_audio_profiles?: Record<string, GameAudioProfile>;
  // Add: pinned_playlists?: PinnedPlaylistItem[];
}

export interface StatusResponse {
  authenticated: boolean;
  // ...
  shuffle_state?: boolean;
  repeat_state?: "off" | "context" | "track";
  is_liked?: boolean;
  // Add: context_uri?: string | null;
}
```

---

### `py_modules/common.py` (config, file-I/O)

**Analog:** `py_modules/common.py` (lines 70–185)

**Defaults & sanitization pattern** (lines 70–83, 147–168):
```python
DEFAULT_SETTINGS = {
    "device_name": "",
    # ...
    "playlist_folders": [],
    "spotify_folder_tree": [],
    "game_audio_profiles": {},
    # Add: "pinned_playlists": [],
}

def _load_settings(settings_file: str | None = None) -> dict:
    # ...
    merged = {**default_settings, **saved}
    if not isinstance(merged.get("playlist_folders"), list):
        merged["playlist_folders"] = []
    if not isinstance(merged.get("spotify_folder_tree"), list):
        merged["spotify_folder_tree"] = []
    if not isinstance(merged.get("game_audio_profiles"), dict):
        merged["game_audio_profiles"] = {}
```
Copy this sanitization pattern in `_load_settings()` to normalize `pinned_playlists`: verify `list` of `dict`s with non-empty `uri` & `name`, `type` in `("playlist", "album", "liked_songs")`, deduplicate by `uri`, and cap to `[:MAX_PINNED_PLAYLISTS]` (`MAX_PINNED_PLAYLISTS = 4`).

---

### `py_modules/rpc_playback.py` (service, request-response)

**Analog:** `py_modules/rpc_playback.py` (lines 326–390)

**Auth check, context playback, 404 auto-transfer, and structured error return** (lines 326–375):
```python
async def play_tracks(
    plugin,
    context_uri: str | None = None,
    offset_uri: str | None = None,
    uris: list | None = None,
    position: int = 0,
    position_ms: int | None = None,
) -> dict:
    """Start playback of a context, URI list, or single track."""
    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}
    # ...
    try:
        await _exec(
            _spotify_api_request, "me/player/play", token, "PUT", None, body,
        )
        return {"ok": True}
    except urllib.error.HTTPError as e:
        if e.code == 404:
            transfer_res = await plugin._auto_transfer_and_play(token)
            if transfer_res.get("ok") and body:
                try:
                    await asyncio.sleep(0.5)
                    await _exec(_spotify_api_request, "me/player/play", token, "PUT", None, body)
                    return {"ok": True}
                except Exception:
                    pass
            return transfer_res
        return {"ok": False, "error": _parse_spotify_error(e)}
    except Exception as e:
        decky.logger.error("play_tracks failed: %s", e)
        return {"ok": False, "error": str(e)}
```
For `quick_play_pinned(plugin, uri: str, item_type: str = "playlist")`:
- Check `plugin._is_engine_running()`; if stopped, call `await plugin.start_librespot()` and briefly poll `me/player/devices` (via `get_devices` / `_spotify_api_request`) up to ~1.2s so Connect registration completes before `play_tracks`.
- For `item_type == "liked_songs"` (or `uri in ("spotify:collection:tracks", "deckify:liked_songs")`), fetch `me/tracks?limit=50` and pass `uris=[...]` to `play_tracks`.
- For `"playlist"` / `"album"`, call `play_tracks(plugin, context_uri=uri)` (preserves existing shuffle state).

---

### `main.py` (controller, request-response)

**Analog:** `main.py` (lines 627–665)

**Setting validation, persistence, and `decky.emit` broadcast** (lines 627–656):
```python
        elif key == "playlist_folders":
            if not isinstance(value, list):
                return {"ok": False, "error": "playlist_folders must be a list"}
        elif key == "game_audio_profiles":
            if not isinstance(value, dict):
                return {"ok": False, "error": "game_audio_profiles must be a dict"}
        self._settings[key] = value
        _save_settings(self._settings)
        decky.logger.info("Setting updated: %s = %s", key, value)
        # ...
        try:
            await decky.emit("settings_changed", dict(self._settings))
        except Exception:
            pass

        return {"ok": True, "settings": dict(self._settings)}
```
**RPC delegation pattern** (lines 660–664):
```python
    async def control_playback(self, action: str, device_id: str = "") -> dict:
        manager = getattr(self, "_soundtrack_manager", None)
        if manager and (action == "pause" or (action == "play_pause" and self._poll_play_state == "playing")):
            manager.record_manual_pause()
        return await rpc_playback.control_playback(self, action, device_id)
```
Also include `"pinned_playlists"` in `public_keys` inside `get_status()` so QAM receives pinned items on startup and status polls.

---

### `src/index.tsx` (component, event-driven / request-response)

**Analog:** `src/index.tsx` (lines 430–512)

**Horizontal Focusable button row pattern** (lines 430–486):
```tsx
<Focusable
  flow-children="horizontal"
  style={{ display: "flex", alignItems: "center", gap: 8, overflowX: "auto", padding: "4px 0", width: "100%" }}
>
  <DialogButton
    style={{ minWidth: "auto", padding: "8px 11px", color: shuffleState ? "#1DB954" : undefined }}
    onClick={(e: any) => {
      e?.currentTarget?.blur?.();
      handleToggleShuffle();
    }}
  >
    <FaRandom />
  </DialogButton>
</Focusable>
```
**Focus highlight fix for `Bind current music to game` (Folded Todo)** (lines 488–512):
Currently `<DialogButton style={{ ..., borderColor: "#1db954", ... }}>` overrides SteamOS GamepadUI's native focus ring. Replace with `@decky/ui`'s `<ButtonItem onClick={handleQuickBind}>` or a `<Focusable>`/`<DialogButton>` using `focusHalo(focused)` without a `borderColor` override.

---

### `src/components/common/CollectionActionModal.tsx` (component, event-driven)

**Analog:** `src/components/common/TrackActionModal.tsx` (lines 1–145)

**Imports, focus capture/restoration, and modal overlay structure** (lines 1–145):
```tsx
import { FC, useEffect, useRef } from "react";
import { Focusable } from "@decky/ui";
import { FaPlay, FaThumbtack } from "react-icons/fa";
import { DeckifyImage } from "./DeckifyImage";
import { InteractiveRow } from "./InteractiveRow";
```
Copy the exact `previousFocusRef` capture + `requestAnimationFrame(() => container?.querySelector('[tabindex="0"]')?.focus?.())` + unmount focus restoration pattern (lines 54–85), absolute overlay backdrop (`zIndex: 100`, `background: "rgba(0,0,0,0.85)"`), and `<Focusable flow-children="column">` card (`width: 380`, `borderRadius: 14`, `padding: 20`) with `tabIndex={0}` on the first `<InteractiveRow>`.

---

### `src/components/DeckifyExpandedModal.tsx` (component, event-driven)

**Analog:** `src/components/DeckifyExpandedModal.tsx` (lines 740–754)

**`Y`-button gamepad action dispatch pattern** (lines 740–754):
```tsx
        } else if (action === "Y") { // Gamepad Y button opens action menu
          if (modeRef.current !== "engine" && modeRef.current !== "devices") {
            const isActiveTrackMode =
              modeRef.current === "now_playing" || modeRef.current === "lyrics";
            const candidate =
              focusedTrackRef.current || (isActiveTrackMode ? (track as any) : null);
            if (candidate && (candidate.id || candidate.track_id || candidate.uri)) {
              if (e) {
                e.preventDefault?.();
                e.stopPropagation?.();
              }
              setActionTrack(candidate);
            }
          }
```
Extend this branch: when `focusedTrackRef.current` is null and `focusedCollectionRef.current` is set (populated by `onFocusCollection` in `PlaylistsTab` and `AlbumsTab`), call `setActionCollection(focusedCollectionRef.current)` to open `CollectionActionModal`.

---

### `src/components/tabs/PlaylistsTab.tsx`, `src/components/tabs/AlbumsTab.tsx`, `src/components/tabs/LikedSongsTab.tsx` (components, CRUD / request-response)

**Analog:** `src/components/tabs/PlaylistsTab.tsx` (lines 269–310) & `src/components/tabs/AlbumsTab.tsx` (lines 43–85)

**List row + horizontal detail header pattern** (`PlaylistsTab.tsx` lines 269–310):
```tsx
                {uncategorizedPlaylists.map((pl) => (
                  <InteractiveRow
                    key={pl.id}
                    data-deckify-list-item="true"
                    data-deckify-label={pl.name || ""}
                    onClick={() => onOpenPlaylist(pl)}
                    style={{ padding: "6px 10px", marginBottom: 2 }}
                  >
                    {pl.image_url ? (
                      <DeckifyImage src={pl.image_url} width={26} height={26} style={{ borderRadius: 4, marginRight: 8 }} />
                    ) : (
                      <FaMusic size={12} color="#888" style={{ marginRight: 8 }} />
                    )}
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{pl.name}</span>
                    {/* Render FaThumbtack badge when isPinned(pl.uri) */}
                    <span style={{ fontSize: 11, opacity: 0.5, marginLeft: "auto" }}>
                      {pl.track_count || 0} tracks
                    </span>
                  </InteractiveRow>
                ))}
```
Detail header (`PlaylistsTab.tsx` lines 294–310, `AlbumsTab.tsx` lines 71–85):
```tsx
          <Focusable
            flow-children="horizontal"
            style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}
          >
            <InteractiveRow onClick={onClosePlaylist} style={{ padding: "6px 12px", fontSize: 12 }}>
              ← Back (B)
            </InteractiveRow>
            {/* ... title ... */}
            {/* Add Pin/Unpin <InteractiveRow> with <FaThumbtack> next to Play button */}
            <InteractiveRow
              onClick={() => onPlayTrack("", activePlaylist.uri)}
              style={{ marginLeft: "auto", background: "#1db954", /* ... */ }}
            >
              <FaPlay size={11} /> Play Playlist
            </InteractiveRow>
          </Focusable>
```
In `LikedSongsTab.tsx` (lines 31–46), wrap the right-side action buttons in `<Focusable flow-children="horizontal" style={{ display: "flex", alignItems: "center", gap: 10 }}>` so the Pin toggle and `Play All` sit side-by-side cleanly.

---

### `tests/test_pinned_playlists.py` (test, unit)

**Analog:** `tests/test_soundtrack.py` (lines 1–60)

**Mocked `decky` module & `IsolatedAsyncioTestCase` harness** (lines 1–47):
```python
import asyncio
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

with patch.dict("sys.modules", {"decky": SimpleNamespace(
    DECKY_PLUGIN_SETTINGS_DIR=tempfile.gettempdir(),
    DECKY_PLUGIN_DIR=tempfile.gettempdir(),
    DECKY_PLUGIN_RUNTIME_DIR=tempfile.gettempdir(),
    logger=MagicMock(),
    emit=AsyncMock(),
)}):
    from py_modules import common, rpc_playback
```

---

## Shared Patterns

### CSP-Safe Image Rendering
**Source:** `src/components/common/DeckifyImage.tsx` (lines 40–65)
**Apply to:** `src/index.tsx` (QAM pinned pills), `src/components/common/CollectionActionModal.tsx`, `PlaylistsTab.tsx`, `AlbumsTab.tsx`
```tsx
<DeckifyImage
  src={pill.image_url}
  width={20}
  height={20}
  style={{ borderRadius: 4, flexShrink: 0 }}
  fallback={<FaMusic size={12} />}
/>
```
Never render `<img src="https://i.scdn.co/...">` directly — Steam CEF CSP blocks external CDN URLs.

### Controller Focus Ring (`focusHalo` / `InteractiveRow`)
**Source:** `src/components/common/InteractiveRow.tsx` (lines 4–15)
**Apply to:** `src/index.tsx` (Bind button & custom pills if not using `ButtonItem`), `CollectionActionModal.tsx`, `PlaylistsTab.tsx`, `AlbumsTab.tsx`, `LikedSongsTab.tsx`
```tsx
export function focusHalo(focused: boolean) {
  return {
    boxShadow: focused
      ? "0 0 0 2px #fff, 0 0 12px rgba(29, 185, 84, 0.7)"
      : "none",
    transform: focused ? "scale(1.02)" : "scale(1)",
    transition: "box-shadow 0.1s ease, transform 0.1s ease",
    position: "relative" as const,
    zIndex: focused ? 2 : 0,
    outline: "none",
  };
}
```

### Horizontal Gamepad Navigation
**Source:** `src/components/tabs/PlaylistsTab.tsx` (lines 294–296)
**Apply to:** `src/index.tsx` (pinned pills row), `LikedSongsTab.tsx` (header actions), `PlaylistsTab.tsx`, `AlbumsTab.tsx`
Always use `<Focusable flow-children="horizontal">` (never `"row"`).

### Error Handling & Toast Notifications
**Source:** `py_modules/rpc_playback.py` (lines 372–375), `09-CONTEXT.md` (D-09)
**Apply to:** All backend RPCs (`{ "ok": False, "error": str(e) }`) and frontend pin/quick-play handlers (`toaster.toast({ title: "Deckify", body: ..., duration: 3000 })`).

---

## No Analog Found

All 13 files have exact or direct in-repo analogs.

## Metadata

**Analog search scope:** `src/`, `src/components/`, `src/components/common/`, `src/components/tabs/`, `py_modules/`, `main.py`, `tests/`
**Files scanned:** 12
**Pattern extraction date:** 2026-11-14
