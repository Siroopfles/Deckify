# Phase 27: Interactive Queue Studio & Controller Playlist Management - Pattern Map

**Mapped:** 2026-11-25
**Files analyzed:** 18 (12 source files, 6 test files)
**Analogs found:** 18 / 18

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/types.ts` | model / types | transform | `src/types.ts` (lines 63-88) | exact |
| `src/hooks/useGrabMoveOrder.ts` | hook | event-driven | `src/hooks/useTriggerNavigation.ts` | role-match |
| `src/components/common/TrackRowItem.tsx` | component | event-driven | `src/components/common/TrackRowItem.tsx` (lines 1-83) | exact |
| `src/components/tabs/QueueTab.tsx` | component | CRUD / event-driven | `src/components/tabs/QueueTab.tsx` (lines 1-217) | exact |
| `src/components/tabs/PlaylistsTab.tsx` | component | CRUD / event-driven | `src/components/tabs/PlaylistsTab.tsx` (lines 1-432) | exact |
| `src/components/common/TrackActionModal.tsx` | component | request-response | `src/components/common/TrackActionModal.tsx` (lines 1-352) | exact |
| `src/components/common/CollectionActionModal.tsx` | component | request-response | `src/components/common/CollectionActionModal.tsx` (lines 1-176) | exact |
| `src/components/DeckifyExpandedModal.tsx` | component / orchestrator | event-driven / RPC | `src/components/DeckifyExpandedModal.tsx` (lines 951-1365) | exact |
| `main.py` | controller / RPC router | request-response | `main.py` (lines 1362-1367) | exact |
| `py_modules/rpc_playback.py` | service | CRUD / request-response | `py_modules/rpc_playback.py` (lines 304-383) | exact |
| `py_modules/rpc_library.py` | service | CRUD / request-response | `py_modules/rpc_library.py` (lines 44-70, 464-515) | exact |
| `py_modules/cdp_bridge.py` | service / adapter | request-response | `py_modules/cdp_bridge.py` (lines 218-245) | exact |
| `src/components/tabs/QueueTab.test.tsx` | test | unit | `src/components/tabs/QueueTab.test.tsx` (lines 1-80) | exact |
| `src/components/tabs/PlaylistsTab.test.tsx` | test | unit | `src/components/tabs/QueueTab.test.tsx` (lines 1-80) | role-match |
| `src/components/common/TrackActionModal.test.tsx` | test | unit | `src/components/common/TrackActionModal.test.tsx` | exact |
| `tests/test_cdp_bridge.py` | test | unit | `tests/test_cdp_bridge.py` (lines 1-70) | exact |
| `tests/test_queue_studio.py` | test | unit | `tests/test_cdp_bridge.py` (lines 1-70) | role-match |
| `tests/test_playlist_management.py` | test | unit | `tests/test_cdp_bridge.py` (lines 1-70) | role-match |

---

## Pattern Assignments

### `src/types.ts` (model / types, transform)

**Analog:** `src/types.ts` (self-modify)

**Core interface pattern** (lines 63-88):
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

export interface PlaylistItem {
  id: string;
  name: string;
  uri: string;
  image_url?: string;
  track_count?: number;
  can_mix?: boolean;
  is_mixed?: boolean;
  owner_id?: string;
}
```
Extend `TrackItem` with `_rowKey?: string` and `uid?: string`; extend `PlaylistItem` with `description?: string`, `is_editable?: boolean`, `collaborative?: boolean`.

---

### `src/hooks/useGrabMoveOrder.ts` (hook, event-driven)

**Analog:** `src/hooks/useTriggerNavigation.ts`

**Imports & options interface pattern** (`src/hooks/useTriggerNavigation.ts` lines 1-11):
```typescript
import { useEffect, useRef } from "react";
import { TriggerController, TriggerSide } from "../utils/triggerController";

export interface UseTriggerNavigationOptions {
  enabled: boolean;
  suppressed: boolean;
  onTrigger: (side: TriggerSide) => void;
  onAction: (action: ModalButtonAction, e?: any) => void;
}
```

**Ref-synchronized callback & cleanup pattern** (`src/hooks/useTriggerNavigation.ts` lines 28-45):
```typescript
export function useTriggerNavigation({
  enabled,
  suppressed,
  onTrigger,
  onAction,
}: UseTriggerNavigationOptions): void {
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const suppressedRef = useRef(suppressed);
  suppressedRef.current = suppressed;
```
Apply the same ref-synchronized callback pattern for `useGrabMoveOrder` (`grabbedKey`, `preGrabSnapshotRef`, `startGrabIndexRef`, `enterGrabMode`, `moveGrabbed`, `commitGrab`, `cancelGrab`) so `vgp_oncancel` and `onGamepadDirection` never read stale closures.

---

### `src/components/common/TrackRowItem.tsx` (component, event-driven)

**Analog:** `src/components/common/TrackRowItem.tsx` (self-modify)

**Imports pattern** (lines 1-5):
```tsx
import { FC } from "react";
import { FaMusic, FaHeart, FaRegHeart } from "react-icons/fa";
import { TrackItem } from "../../types";
import { DeckifyImage } from "./DeckifyImage";
import { InteractiveRow, formatMs } from "./InteractiveRow";
```

**Core row & inline action pattern** (lines 31-81):
```tsx
  return (
    <InteractiveRow
      key={track.id || track.uri || index}
      data-deckify-list-item="true"
      data-deckify-label={track.name || ""}
      onClick={() => onPlayTrack(track.uri || "", contextUri, allUris, index)}
      onFocus={() => onFocus?.(track)}
      style={{ gap: 12 }}
    >
      {/* ... */}
      <span
        onClick={(e) => {
          e.stopPropagation();
          if (track.id) onToggleLike(track.id);
        }}
        style={{ cursor: "pointer", padding: "4px 6px" }}
      >
        {track.is_liked ? <FaHeart size={13} color="var(--deckify-accent, #1DB954)" /> : <FaRegHeart size={13} color="#777" />}
      </span>
```
Replace `key={track.id || track.uri || index}` with `key={track._rowKey || track.id || track.uri || index}` and add `data-row-key={track._rowKey}` so DOM nodes remain locked during Grab/Move Mode.

---

### `src/components/tabs/QueueTab.tsx` (component, CRUD / event-driven)

**Analog:** `src/components/tabs/QueueTab.tsx` (self-modify)

**Imports pattern** (lines 1-6):
```tsx
import { FC } from "react";
import { Focusable } from "@decky/ui";
import { FaEllipsisH, FaHeart, FaRegHeart, FaSpotify } from "react-icons/fa";
import { TrackItem, TrackMeta } from "../../types";
import { DeckifyImage } from "../common/DeckifyImage";
import { InteractiveRow, formatMs } from "../common/InteractiveRow";
```

**Vertical list & compact inline button pattern** (lines 48-61, 124-136):
```tsx
        <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {queueTracks.slice(0, 40).map((t, idx) =>
            renderQueueRow({ /* ... */ })
          )}
        </Focusable>
```
```tsx
        <InteractiveRow
          aria-label="Track Options"
          onClick={() => {
            onFocusTrack?.(currentlyPlaying as TrackItem);
            onOpenActions(currentlyPlaying as TrackItem);
          }}
          onFocus={() => onFocusTrack?.(currentlyPlaying as TrackItem)}
          style={{ padding: "6px 12px", minHeight: 36, flexShrink: 0, width: "auto" }}
        >
          <FaEllipsisH size={13} />
        </InteractiveRow>
```
Copy `width: "auto"` and `flexShrink: 0` for inline `⇅` grab handle, `✕` remove icon, and 2-tap `"Clear Queue"` / `"Confirm Clear?"` / `"Cancel"` buttons in the `"Next in Queue (N)"` header (`flow-children="horizontal"`).

---

### `src/components/tabs/PlaylistsTab.tsx` (component, CRUD / event-driven)

**Analog:** `src/components/tabs/PlaylistsTab.tsx` (self-modify)

**Inline create form pattern** (lines 233-256):
```tsx
          {creatingPlaylist && (
            <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: "rgba(255,255,255,0.06)", display: "flex", gap: 10, alignItems: "center" }}>
              <TextField
                label="Playlist Name"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
              />
              <InteractiveRow
                onClick={async () => {
                  if (newPlaylistName.trim()) {
                    await onCreatePlaylist(newPlaylistName.trim());
                    setNewPlaylistName("");
                    setCreatingPlaylist(false);
                  }
                }}
                style={{ background: "var(--deckify-accent, #1DB954)", color: "#000", fontWeight: 700, padding: "8px 14px" }}
              >
                Create
              </InteractiveRow>
              <InteractiveRow onClick={() => setCreatingPlaylist(false)} style={{ padding: "8px 12px" }}>
                Cancel
              </InteractiveRow>
            </div>
          )}
```

**Detail header horizontal bar pattern** (lines 328-407):
```tsx
          <Focusable
            flow-children="horizontal"
            style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}
          >
            <InteractiveRow onClick={onClosePlaylist} style={{ padding: "6px 12px", fontSize: 12, flexShrink: 0 }}>
              ← Back (B)
            </InteractiveRow>
            {/* ... */}
          </Focusable>
```
Reuse this `TextField` + `InteractiveRow` form pattern for optional `Description` in Create Playlist, Edit Playlist Details, and local filter inputs; gate Edit/Move/Remove on `activePlaylist.is_editable !== false`.

---

### `src/components/common/TrackActionModal.tsx` (component, request-response)

**Analog:** `src/components/common/TrackActionModal.tsx` (self-modify)

**Focus capture/restore & overlay pattern** (lines 59-77, 294-351):
```tsx
  useEffect(() => {
    if (hasActionTrack) {
      if (!previousFocusRef.current) {
        previousFocusRef.current = document.activeElement as HTMLElement | null;
      }
      const rafId = requestAnimationFrame(() => {
        const container = showAddToPlaylistModal
          ? pickerContainerRef.current
          : modalContainerRef.current;
        const target = container?.querySelector('[tabindex="0"]') as HTMLElement | null;
        target?.focus?.();
      });
      return () => cancelAnimationFrame(rafId);
    } else if (previousFocusRef.current) {
      previousFocusRef.current?.focus?.();
      previousFocusRef.current = null;
    }
    return undefined;
  }, [hasActionTrack, showAddToPlaylistModal]);
```
Extend `renderPlaylistPickerOverlay` (lines 280-352) to filter `allUserPlaylists` by `pl.is_editable !== false`, add a `<TextField>` search filter, and render `"+ New Playlist with Track"` at the top.

---

### `src/components/common/CollectionActionModal.tsx` (component, request-response)

**Analog:** `src/components/common/CollectionActionModal.tsx` (self-modify)

**Modal focus & action row pattern** (lines 40-53, 144-173):
```tsx
        <InteractiveRow
          tabIndex={0}
          onClick={() => {
            onPlay(collection);
            onClose();
          }}
          style={{ gap: 10 }}
        >
          <FaPlay size={12} color="var(--deckify-accent, #1DB954)" />
          <span>Play</span>
        </InteractiveRow>
```
Add `"Edit Playlist Details"` (when `collection.type === "playlist"` and `isEditable`) and `"Delete Playlist"` / `"Unfollow Playlist"` action rows using the same `InteractiveRow` + `FaEdit`/`FaTrash` layout.

---

### `src/components/DeckifyExpandedModal.tsx` (component / orchestrator, event-driven / RPC)

**Analog:** `src/components/DeckifyExpandedModal.tsx` (self-modify)

**Single-instance removal target to replace** (lines 951-961):
```tsx
  const handleRemoveTrackFromActivePlaylist = useCallback(async () => {
    if (!activePlaylist?.id || !actionTrack?.uri) return;
    const res = await backendRemoveTrackFromPlaylist(activePlaylist.id, actionTrack.uri);
    if (res.ok) {
      showToast("Removed from playlist");
      setPlaylistTracks((prev) => prev.filter((t) => t.uri !== actionTrack.uri));
    } else {
      showToast(`Error: ${res.error || "Failed"}`);
    }
    setActionTrack(null);
  }, [activePlaylist, actionTrack, showToast]);
```
Replace `.filter((t) => t.uri !== actionTrack.uri)` with `_rowKey` / `position` removal and pass `position` + `uid` to `backendRemoveTrackFromPlaylist`.

**`vgp_oncancel` stepwise priority pattern** (lines 1266-1280):
```tsx
    el.addEventListener("vgp_oncancel", (e: Event) => {
      if (actionTrackRef.current) {
        e.preventDefault();
        e.stopPropagation();
        (e as any).stopImmediatePropagation?.();
        setActionTrack(null);
        return;
      }
```
Insert `if (grabCancelRef.current?.()) { e.preventDefault(); e.stopPropagation(); (e as any).stopImmediatePropagation?.(); return; }` at the very top of `vgp_oncancel`.

**Controller hint bar pattern** (lines 1338-1353):
```tsx
  const hintText =
    mode === "now_playing"
      ? "L2/R2 Seek · X Like · Y Options · L1/R1 Tabs"
      /* ... */
      : "L2/R2 Page · X Like · Y Options · L1/R1 Tabs";
```
Prepend `isGrabbing ? "↑/↓ Move · A Drop · B Cancel"` at the top of `hintText`.

---

### `main.py` (controller / RPC router, request-response)

**Analog:** `main.py` (lines 1362-1367)

**RPC delegation pattern:**
```python
    async def create_playlist(self, name: str, public: bool = False) -> dict:
        return await rpc_library.create_playlist(self, name, public)

    async def remove_track_from_playlist(self, playlist_id: str, track_uri: str) -> dict:
        return await rpc_library.remove_track_from_playlist(self, playlist_id, track_uri)
```
Expose `reorder_queue_track`, `remove_queue_track`, `clear_queue` (delegating to `rpc_playback`), and `update_playlist_details`, `delete_playlist`, `reorder_playlist_tracks` (delegating to `rpc_library`), plus updated `create_playlist(..., description: str = "")` and `remove_track_from_playlist(..., position: int | None = None, uid: str = "")`.

---

### `py_modules/rpc_playback.py` (service, CRUD / request-response)

**Analog:** `py_modules/rpc_playback.py` (lines 304-383)

**Token guard, `_exec`, and structured error pattern** (lines 363-383):
```python
async def add_to_queue(plugin, uri: str, device_id: str = "") -> dict:
    """Add a track to the end of user's active playback queue."""
    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}
    if not uri:
        return {"ok": False, "error": "Missing track URI"}
    params: dict = {"uri": uri}
    if device_id:
        params["device_id"] = device_id
    try:
        await _exec(_spotify_api_request, "me/player/queue", token, "POST", params)
        return {"ok": True}
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {"ok": False, "error": "No active device found"}
        return {"ok": False, "error": _parse_spotify_error(e)}
    except Exception as e:
        decky.logger.error("add_to_queue(%s) failed: %s", uri, e)
        return {"ok": False, "error": str(e)}
```
Follow this exact `_ensure_token()` + `_exec(_spotify_api_request, ...)` + `urllib.error.HTTPError` / `Exception` pattern for `reorder_queue_track`, `remove_queue_track`, `clear_queue`, and URI-slice `PUT /v1/me/player/play` fallback.

---

### `py_modules/rpc_library.py` (service, CRUD / request-response)

**Analog:** `py_modules/rpc_library.py` (lines 44-70, 464-515)

**Playlist normalization pattern** (lines 53-67):
```python
        for p in items:
            if not p:
                continue
            images = p.get("images") or []
            playlists.append({
                "id": p["id"],
                "uri": p.get("uri") or f"spotify:playlist:{p['id']}",
                "name": p.get("name", ""),
                "image_url": _image_url(images),
                "artwork_url": _image_url(images),
                "track_count": (p.get("items") or p.get("tracks") or {}).get("total", 0),
                "owner_id": p.get("owner", {}).get("id", ""),
            })
```

**`/items` with `/tracks` 400/403/404 fallback pattern** (lines 497-511):
```python
        try:
            await _exec(
                _spotify_api_request, f"playlists/{pid}/items", token, "DELETE", None,
                {"items": [{"uri": uri}]},
            )
        except urllib.error.HTTPError as e:
            if e.code in (400, 403, 404):
                await _exec(
                    _spotify_api_request, f"playlists/{pid}/tracks", token, "DELETE", None,
                    {"tracks": [{"uri": uri}]},
                )
            else:
                raise
```
Extend this fallback chain with `cdp_bridge.py` (`PlaylistAPI` / `RootlistAPI`) when `cdp_bridge.is_spotify_client_running(plugin)` is true.

---

### `py_modules/cdp_bridge.py` (service / adapter, request-response)

**Analog:** `py_modules/cdp_bridge.py` (lines 218-245)

**`eval_fn` + `json.dumps` escaping + `evaluate_with_registry` pattern:**
```python
def cdp_toggle_like_track(
    uri: str,
    liked: bool = True,
    port: int = SPOTIFY_CDP_PORT,
    timeout: float = 5.0,
    eval_fn=None,
) -> dict:
    """Add or remove a track in Liked Songs via Official Spotify Client CDP LibraryAPI."""
    target_uri_js = json.dumps(str(uri))
    is_liked_js = "true" if liked else "false"
    body_js = f"""
    const targetUri = {target_uri_js};
    const libApi = getService('LibraryAPI');
    if (!libApi) return {{ ok: false, error: 'LibraryAPI not found' }};
    /* ... */
    return {{ ok: true }};
    """
    res = evaluate_with_registry(body_js, port=port, timeout=timeout, eval_fn=eval_fn)
    if res.get("ok"):
        return {"ok": True}
    return {"ok": False, "error": res.get("error") or "CDP LibraryAPI failed"}
```
All new `cdp_*` helpers (`cdp_reorder_queue`, `cdp_remove_from_queue`, `cdp_clear_queue`, `cdp_create_playlist`, `cdp_update_playlist_details`, `cdp_delete_playlist`, `cdp_reorder_playlist_track`, `cdp_remove_from_playlist`) must accept `port=SPOTIFY_CDP_PORT, timeout=..., eval_fn=None` and serialize all user strings with `json.dumps(...)`.

---

### Test Files (`QueueTab.test.tsx`, `PlaylistsTab.test.tsx`, `TrackActionModal.test.tsx`, `test_cdp_bridge.py`, `test_queue_studio.py`, `test_playlist_management.py`)

**Frontend Test Analog:** `src/components/tabs/QueueTab.test.tsx` (lines 1-80)
- Mocks `react/jsx-dev-runtime`, `react/jsx-runtime`, `react` hooks, `@decky/api`, `@decky/ui` (`Focusable`, `TextField`), and `DeckifyImage` to inspect virtual JSX trees via `findNodes`, `findText`, `cleanText`.

**Backend Test Analog:** `tests/test_cdp_bridge.py` (lines 1-70)
- Uses `unittest.TestCase` + `unittest.IsolatedAsyncioTestCase` (for async RPCs), `SimpleNamespace` mock `plugin`, `MagicMock`, and `eval_fn=fake_eval` injection without hitting real network or CDP sockets.

---

## Shared Patterns

### 1. SteamOS Spatial Navigation & Inline Button Sizing
**Source:** `src/components/tabs/QueueTab.tsx:48,132`, `src/components/tabs/PlaylistsTab.tsx:329-334`
**Apply to:** `QueueTab.tsx`, `PlaylistsTab.tsx`, `TrackRowItem.tsx`, `TrackActionModal.tsx`, `CollectionActionModal.tsx`
- Vertical lists MUST use `<Focusable flow-children="column">`.
- Horizontal action bars MUST use `<Focusable flow-children="horizontal">`.
- Inline buttons (`⇅`, `✕`, `"Clear Queue"`, `"Confirm Clear?"`, `"Cancel"`) MUST set `width: "auto"` and `flexShrink: 0` to prevent SteamOS 100% button expansion.

### 2. Modal Focus Capture & `vgp_oncancel` Priority
**Source:** `src/components/common/TrackActionModal.tsx:59-77`, `src/components/DeckifyExpandedModal.tsx:1266-1280`
**Apply to:** `DeckifyExpandedModal.tsx`, `PlaylistsTab.tsx` (delete/unfollow confirmation modal), `CollectionActionModal.tsx`, `TrackActionModal.tsx`
- Capture `document.activeElement` on modal mount and restore on unmount.
- Intercept `vgp_oncancel` in priority order: Grab/Move cancel → open action/confirmation modal → navigation history → active detail view → search clear.
- Suppress `useTriggerNavigation` (`suppressed` prop) while Grab/Move Mode or any confirmation modal is open.

### 3. Stable `_rowKey` Identity
**Source:** `27-RESEARCH.md` Pattern 1 (replacing `QueueTab.tsx:162` and `TrackRowItem.tsx:33`)
**Apply to:** `DeckifyExpandedModal.tsx`, `QueueTab.tsx`, `PlaylistsTab.tsx`, `TrackRowItem.tsx`
- Generate unique `_rowKey` once when `queueTracks` or `playlistTracks` are normalized/loaded (never from array index during render).
- Pass `key={t._rowKey || t.id || t.uri || idx}` and `data-row-key={t._rowKey}` to `<InteractiveRow>`.

### 4. Backend Async RPC & Error Handling Convention
**Source:** `py_modules/rpc_playback.py:363-383`, `py_modules/rpc_library.py:464-515`
**Apply to:** `main.py`, `py_modules/rpc_playback.py`, `py_modules/rpc_library.py`
- Check `token = await plugin._ensure_token()`.
- Run blocking HTTP/CDP calls inside `await _exec(...)`.
- Return structured `{"ok": True, ...}` or `{"ok": False, "error": ...}` dicts; never raise unhandled exceptions across the Decky RPC boundary.

---

## No Analog Found

All 18 files have either an exact self-analog or a direct role-match analog in the existing codebase. No files lack an analog.

---

## Metadata

**Analog search scope:** `src/`, `py_modules/`, `main.py`, `tests/`
**Files scanned:** 12 source files + 2 test files read directly; full tracked tree verified via `git ls-files`
**Pattern extraction date:** 2026-11-25
