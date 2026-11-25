# Phase 27: Interactive Queue Studio & Controller Playlist Management - Research

**Researched:** 2026-11-25
**Domain:** SteamOS GamepadUI React/Decky UI (`@decky/ui` `FocusNavController`), Spotify Web API (`PUT/DELETE /v1/playlists`, `PUT /v1/me/player/play`), Official Spotify Client CDP (`PlayerAPI`, `PlaylistAPI`, `RootlistAPI`)
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Trigger Grab/Move Mode both via `TrackActionModal` (`X` → `"Move in Queue"` / `"Move Track"`) and via an inline grab handle (`⇅`) on the track row; pressing `A` on the main row continues to start playback immediately.
- **D-02:** Assign stable `_rowKey` IDs to every row in `QueueTab` and `PlaylistsTab` so DOM nodes and controller focus stay locked while reordering. In Grab/Move Mode, `D-Pad Up/Down` swaps the grabbed row live (clamped to list bounds with auto-scroll), `A` commits a single batched reorder RPC call (`from_index`, `to_index`), and `B` (`vgp_oncancel`) cancels and restores the original list order before the grab started. Update the bottom controller hint bar to `"↑/↓ Move · A Drop · B Cancel"` while a row is grabbed. — **Reversibility:** costly — requires stable `_rowKey` identity across `QueueTab`, `PlaylistsTab`, `DeckifyExpandedModal` `vgp_oncancel` / `onMove` handlers, and `TrackRowItem`.
- **D-03:** Expose individual upcoming track removal in `QueueTab` via both `TrackActionModal` (`"Remove from Queue"`) and an inline remove (`✕`) icon on each upcoming row. Expose a `"Clear Queue"` button in the `"Next in Queue (N)"` header with a 2-tap inline confirmation (`"Clear Queue"` → `"Confirm Clear?"` / `"Cancel"`).
- **D-04:** On `spotify_client`, attempt native CDP `PlayerAPI` queue mutation first (`cdp_reorder_queue`, `cdp_remove_from_queue`, `cdp_clear_queue` via `py_modules/cdp_bridge.py`). If an edited upcoming track is a context item from an album/playlist that `PlayerAPI` refuses to mutate as an explicit queue item (or if CDP fails), automatically fall back to URI-slice replacement so any visible upcoming track in `QueueTab` can be reordered, removed, or cleared.
- **D-05:** On `librespot` (or URI-slice fallback), apply queue mutations immediately on the server via `PUT /v1/me/player/play` with `uris: [current_track_uri, ...mutated_upcoming_uris]` at `current_position_ms` (preserving paused state if currently paused) so background gaming track transitions follow the new queue order even when Deckify is closed.
- **D-06:** `"Clear Queue"` keeps the currently playing track playing uninterrupted (or paused at its current position) and clears only upcoming tracks (`Next in Queue`).
- **D-07:** Combine frontend optimistic `queueTracks` updates with a short backend optimistic queue snapshot (`4–5s` TTL in `py_modules/rpc_playback.py`, automatically invalidated on track change, shuffle toggle, or new play/add-to-queue action) so `get_queue` polls never flicker back to stale Spotify Web API queue state.
- **D-08:** Expose **Edit Playlist Details** and **Delete / Unfollow Playlist** both in the Playlist Detail View header (`PlaylistsTab.tsx`) and in `CollectionActionModal.tsx` (`X` on any playlist row).
- **D-09:** Both **Create Playlist** and **Edit Playlist Details** include `Name` (required) and `Description` (optional) `<TextField>`s, and non-empty playlist descriptions render beneath the playlist title in the Playlist Detail View header.
- **D-10:** After creating a new playlist in `PlaylistsTab`, prepend the new playlist to the user's playlist list, keep the user on the `Folders & Playlists` screen with controller focus restored, and display a confirmation toast.
- **D-11:** Deleting (user-owned) or Unfollowing (followed) a playlist opens a context-aware confirmation modal (`"Delete Playlist"` vs `"Unfollow Playlist"`) with initial controller focus on `"Cancel"`. Confirming automatically cleans up the deleted/unfollowed playlist from **Pinned QAM Playlists** (`pinned_playlists`) and **Deckify Custom Folders** (`playlist_folders`).
- **D-12:** Enrich playlists with `is_editable` / `owner_id` (true when `owner_id` matches the current user's Spotify ID, `collaborative` is true, or CDP reports `canEdit`/`isOwnedBySelf`; false when `owner_id == "spotify"` or for algorithmic mixes). Hide Edit Details, Move Track (`⇅`), and Remove Track (`✕`) on read-only playlists while switching Delete to `"Unfollow Playlist"`.
- **D-13:** Removing a track from a user-owned playlist targets only the specific selected row instance (passing row index / `position` or CDP `uid`, with single-instance fallback) so duplicate occurrences of the same track elsewhere in the playlist are preserved.
- **D-14:** All playlist CRUD and track curation RPCs (`create_playlist`, `update_playlist_details`, `delete_playlist`, `reorder_playlist_tracks`, `remove_track_from_playlist`, `add_track_to_playlist`) try Spotify Web API first (supporting `/items` and `/tracks` endpoints + `range_start`/`insert_before`) and automatically fall back to `py_modules/cdp_bridge.py` (`PlaylistAPI` / `RootlistAPI`) on HTTP 400/403/404 when `spotify_client` is running.
- **D-15:** In `TrackActionModal.tsx`'s `"Add to Playlist..."` picker, filter the list strictly to editable playlists (`is_editable !== false`), add a `"+ New Playlist with Track"` option at the top, and add a search/filter input (`TextField`) so users can quickly filter their playlists by name when adding a track.
- **D-16:** Add local search/filter inputs in `PlaylistsTab.tsx` for both:
  1. Filtering the main `Folders & Playlists` overview by playlist/folder name.
  2. Filtering tracks inside an open Playlist Detail View by track title or artist (while a non-empty track filter is active, Grab/Move reordering is disabled/hidden so track indices remain unambiguous, and original playlist indices are preserved for track removal and playback).

### the agent's Discretion
- Exact CDP `PlayerAPI`, `PlaylistAPI`, and `RootlistAPI` method signatures and fallback probes inside `py_modules/cdp_bridge.py`.
- Exact layout and styling of inline grab/remove icons (`⇅`, `✕`), 2-tap `"Confirm Clear?"` buttons, and filter inputs inside `QueueTab`, `PlaylistsTab`, and `TrackActionModal` (respecting `@decky/ui` `FocusNavController` and `flow-children`).
- Exact `_rowKey` generation strategy for duplicate track URIs in `QueueTab` and `PlaylistsTab`.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **QUEUE-03** | User can enter controller Grab/Move Mode on any upcoming track in `QueueTab` to reorder it up/down with D-pad focus locked (via stable `_rowKey` IDs and batched commit), remove individual tracks, or clear the upcoming queue via CDP `PlayerAPI` with an automatic URI-slice playback fallback on `librespot`. | Stable `_rowKey` assignment in `QueueTab` + `onGamepadDirection` (`DIR_UP`/`DIR_DOWN`) + `vgp_oncancel` (`B` restore) + batched `reorder_queue_track` / `remove_queue_track` / `clear_queue` RPCs in `py_modules/rpc_playback.py` with `cdp_bridge.py` `PlayerAPI` first and `PUT /v1/me/player/play` URI-slice fallback + 4–5s backend optimistic queue cache. |
| **PL-01** | User can create new playlists, rename or edit playlist descriptions, delete/unfollow playlists with confirmation, and reorder or remove tracks inside user-owned playlists directly from the controller. | `get_playlists` enrichment (`owner_id`, `collaborative`, `description`, `is_editable`) in `py_modules/rpc_library.py`; Web API `/playlists/{id}` (`PUT`), `/playlists/{id}/followers` (`DELETE`), `/playlists/{id}/items` & `/tracks` (`PUT` `range_start`/`insert_before`, `DELETE` `positions`/single-instance) + `cdp_bridge.py` (`PlaylistAPI`/`RootlistAPI`) fallback on 400/403/404; `PlaylistsTab` & `CollectionActionModal` CRUD modals with QAM/folder cleanup; `TrackActionModal` editable-only searchable picker with `"+ New Playlist with Track"`. |
</phase_requirements>

---

## Project Constraints (from GEMINI.md)

- **Steam CEF Content Security Policy:** All images remain proxied as Base64 Data URIs via `DeckifyImage` / backend `images.py`; no external URLs in `<img>`.
- **SteamOS GamepadUI Navigation:**
  - Vertical lists MUST use `<Focusable flow-children="column">`; horizontal action bars MUST use `<Focusable flow-children="horizontal">`.
  - Compact inline buttons (`⇅`, `✕`, `"Confirm Clear?"`, `"Cancel"`) MUST use `width: "auto"` / `flexShrink: 0` to avoid SteamOS 100% button width expansion.
  - Pointer drag-and-drop is explicitly Out of Scope (`.planning/REQUIREMENTS.md:73`); reordering uses deterministic controller Grab/Move Mode.
- **ESLint Rules (`eslint.config.js`):**
  - `max-lines-per-function`: warn at 80 lines (`eslint.config.js:27-30`)
  - `complexity`: warn at 15 (`eslint.config.js:25`)
  - `max-depth`: warn at 4 (`eslint.config.js:26`)
  - `max-params`: warn at 4 (`eslint.config.js:31`)
  - Extract sub-components / helper hooks cleanly to stay zero-warning.
- **Backend Architecture (`main.py` & `py_modules/`):**
  - All RPC methods in `main.py` delegate to `py_modules/` and return structured `{ "ok": bool, ... }` dicts without crashing the event loop.
  - Blocking HTTP/socket/CDP calls run inside `await _exec(...)`.
  - Keep `eval_fn=_cdp_evaluate` parameter pattern in `cdp_bridge.py` helpers so `unittest.mock.patch` works cleanly.

---

## Summary

Phase 27 transforms `QueueTab` and `PlaylistsTab` from read-mostly lists into full controller-first studios while keeping `librespot` and `spotify_client` behavior seamless. On the frontend, the single highest-risk area is `@decky/ui` `FocusNavController` stability during live row reordering: React keys must be instance-stable `_rowKey` strings (never array index `idx`, and never bare `t.uri` which collides on duplicates), and `Focusable.onGamepadDirection` must intercept `GamepadButton.DIR_UP` / `GamepadButton.DIR_DOWN` (returning `true`) while a row is grabbed so SteamOS spatial navigation does not jump focus away from the moving row. Simultaneously, `DeckifyExpandedModal.tsx`'s `vgp_oncancel` listener must intercept `B` before breadcrumb/tab back navigation when Grab/Move Mode is active, restoring the pre-grab order.

On the backend, `py_modules/rpc_playback.py` needs three new queue mutation RPCs (`reorder_queue_track`, `remove_queue_track`, `clear_queue`) backed by a 4–5s TTL optimistic queue snapshot (`_optimistic_queue_snapshot`) that prevents 10-second `get_queue` polls from flickering back to stale Spotify Web API data. On `spotify_client`, `py_modules/cdp_bridge.py` attempts native `Platform.PlayerAPI` mutations first and automatically falls back to `PUT /v1/me/player/play` with `uris: [current_track_uri, ...mutated_upcoming_uris]` at `current_position_ms` (preserving paused state) whenever `PlayerAPI` rejects context items or is unavailable (e.g. `librespot`). For `PL-01`, `py_modules/rpc_library.py` already has `/items` + `/tracks` fallback patterns in `add_track_to_playlist` and `remove_track_from_playlist`; Phase 27 extends this with `update_playlist_details`, `delete_playlist` (plus QAM `pinned_playlists` and `playlist_folders` cleanup), `reorder_playlist_tracks`, single-instance `remove_track_from_playlist`, `is_editable` enrichment, and `PlaylistAPI`/`RootlistAPI` CDP fallbacks on HTTP 400/403/404.

**Primary recommendation:** Assign unique `_rowKey` IDs at list ingestion/normalization time, isolate Grab/Move Mode state in a reusable hook (`useGrabMoveOrder`) shared by `QueueTab` and `PlaylistsTab`, and route all queue and playlist mutations through `py_modules/rpc_playback.py` and `py_modules/rpc_library.py` with automatic CDP-to-URI-slice and Web-API-to-CDP fallbacks.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Grab/Move Mode focus lock & live swap (`_rowKey`, `onGamepadDirection`, `vgp_oncancel`) | Browser / Client (`QueueTab`, `PlaylistsTab`, `DeckifyExpandedModal`) | — | Synchronous 60fps D-pad interaction and FocusNavController state live strictly in the React CEF layer. |
| Batched queue reorder / remove / clear & optimistic snapshot | API / Backend (`py_modules/rpc_playback.py`) | Browser / Client (optimistic `queueTracks`) | Backend owns `PlayerAPI` CDP vs `PUT /v1/me/player/play` URI-slice fallback and 4–5s `_optimistic_queue_snapshot` TTL. |
| Queue mutation on `spotify_client` | API / Backend (`py_modules/cdp_bridge.py`) | Spotify Desktop CEF (`Platform.PlayerAPI`) | `cdp_bridge.py` evaluates `Platform.Registry` on port 9229 and falls back to URI-slice on context items. |
| Playlist CRUD, ownership (`is_editable`), & single-instance track curation | API / Backend (`py_modules/rpc_library.py`) | `py_modules/cdp_bridge.py` (`PlaylistAPI` / `RootlistAPI`) | Web API first with automatic CDP fallback on 400/403/404 when `spotify_client` is active; settings cleanup (`pinned_playlists`, `playlist_folders`) atomic on backend. |
| Playlist/track local filtering & searchable picker | Browser / Client (`PlaylistsTab`, `TrackActionModal`) | — | Instantaneous controller-friendly filtering over already-loaded playlists/tracks without triggering Spotify 429 rate limits. |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.x (`@types/react: 19.2.14`) | Frontend UI components & hooks | Loaded globally by Decky Loader (`[VERIFIED: package.json:32]`) |
| `@decky/ui` | 4.11.1 | `Focusable`, `TextField`, `GamepadButton`, `ModalRoot` | Official SteamOS GamepadUI spatial navigation primitives (`[VERIFIED: package.json:29]`) |
| `@decky/api` | 1.1.3 | `callable`, `toaster` | Decky frontend-to-backend RPC bridge (`[VERIFIED: package.json:46]`) |
| `react-icons` | 5.5.0 | `FaArrowsAltV`, `FaTimes`, `FaEdit`, `FaTrash`, `FaSearch`, `FaPlus` | Existing icon library across all tabs (`[VERIFIED: package.json:48]`) |
| Python stdlib (`urllib`, `json`, `time`) | 3.11+ / 3.14 | Spotify Web API HTTP client & CDP bridge | Zero external pip dependencies (`[VERIFIED: py_modules/spotify.py:1-10]`) |

### Installation
No new packages required — zero new npm or pip dependencies per v0.7 roadmap (`[VERIFIED: STATE.md:199]`).

---

## Architecture Patterns

### System Architecture Diagram

```text
Gamepad Input (D-Pad Up/Down, A, B, Y)
  │
  ├── Grab/Move Mode Active? ──▶ Yes ──▶ Focusable.onGamepadDirection(DIR_UP/DOWN)
  │                                        ├── Swaps item in local state (keyed by _rowKey)
  │                                        ├── A (onClick) ──▶ Batched RPC commit
  │                                        └── B (vgp_oncancel) ──▶ Restore pre-grab snapshot
  │
  └── Normal Mode ──▶ QueueTab / PlaylistsTab / TrackActionModal / CollectionActionModal
                        │
                        ├── Queue Mutations (rpc_playback.py)
                        │     ├── spotify_client? ──▶ cdp_bridge.py (PlayerAPI)
                        │     │     └── Context item / CDP fail? ──▶ URI-slice fallback
                        │     └── librespot / fallback ──▶ PUT /v1/me/player/play
                        │           (uris: [curr, ...upcoming], position_ms, preserve pause)
                        │           + 4.5s _optimistic_queue_snapshot
                        │
                        └── Playlist CRUD & Curation (rpc_library.py)
                              ├── Spotify Web API (/playlists, /items, /tracks, /followers)
                              │     └── HTTP 400/403/404 & spotify_client? ──▶ cdp_bridge.py
                              │           (PlaylistAPI / RootlistAPI)
                              └── Delete/Unfollow ──▶ Clean pinned_playlists & playlist_folders
```

### Pattern 1: Stable `_rowKey` Generation & Shared `useGrabMoveOrder` Hook
**What:** Assign a unique, stable `_rowKey` to every `TrackItem` when `queueTracks` or `playlistTracks` is loaded, and manage Grab/Move Mode via a small reusable hook.
**Why:** `QueueTab.tsx:162` (`key={t.id || t.uri || idx}`) and `TrackRowItem.tsx:33` (`key={track.id || track.uri || index}`) currently fall back to `idx` or collide on duplicate URIs! When React unmounts/remounts a DOM node during reordering, SteamOS `FocusNavController` loses focus and jumps to the top of the container.
**How to generate `_rowKey`:**
- Use a monotonically incrementing counter (`let nextRowSeq = 1`) or `uid` when present:
  - In `PlaylistTracks`: if `t.uid` exists (from CDP `PlaylistAPI`), `uid:${t.uid}`, else `pl:${idx}:${nextRowSeq++}:${t.uri || t.id || "item"}` assigned **once** when the array is received from backend (and preserved across swaps!).
  - In `QueueTracks`: `q:${nextRowSeq++}:${t.uri || t.id || "item"}` assigned when `get_queue` returns, or preserved for matching items when optimistic updates occur.
- **Important:** Never recompute `_rowKey` from array index during render! Attach `_rowKey` to the `TrackItem` object on load/insert.
- **Grab/Move state machine:**
  - `grabbedKey: string | null`
  - `preGrabSnapshotRef: TrackItem[] | null`
  - `startGrabIndexRef: number | null`
  - `enterGrabMode(rowKey)`: snapshots current list, sets `grabbedKey = rowKey`, keeps focus on the grabbed row's `<InteractiveRow>` (or moves focus from inline `⇅` handle / `TrackActionModal` back to the row's `[data-row-key="..."]` element via `requestAnimationFrame`).
  - `moveGrabbed(delta: -1 | 1)`: swaps `[curIdx, curIdx + delta]` in local list, clamped to `[0, list.length - 1]`, calls `scrollIntoView({ block: "nearest" })` on the focused row.
  - `commitGrab()`: compares `startIdx` and `endIdx`; if `startIdx !== endIdx`, fires single batched RPC (`reorder_queue_track(from_index, to_index)` or `reorder_playlist_tracks(playlist_id, range_start, insert_before)`). Clears `grabbedKey`.
  - `cancelGrab()`: restores `preGrabSnapshotRef.current`, clears `grabbedKey`.

### Pattern 2: Intercepting `D-Pad Up/Down` and `B` (`vgp_oncancel`) in `@decky/ui`
**What:** Wrap the reorderable list `<Focusable flow-children="column">` with `onGamepadDirection` (following `NowPlayingTab.tsx:322`) and register a `grabCancelRef` checked at the top of `DeckifyExpandedModal.tsx:1266` `vgp_oncancel`.
**Example:**
```tsx
// Source: Pattern from src/components/tabs/NowPlayingTab.tsx:232-240 & DeckifyExpandedModal.tsx:1266
const handleListDirection = (e: GamepadEvent) => {
  if (!grabbedKey) return false;
  const btn = e.detail?.button;
  if (btn === GamepadButton.DIR_UP) {
    e.preventDefault?.();
    e.stopPropagation?.();
    moveGrabbed(-1);
    return true;
  }
  if (btn === GamepadButton.DIR_DOWN) {
    e.preventDefault?.();
    e.stopPropagation?.();
    moveGrabbed(1);
    return true;
  }
  return false;
};
```
**Key detail for `DeckifyExpandedModal.tsx`:**
- `DeckifyExpandedModal.tsx:1223` maps `Y` to `setActionTrack` / `setActionCollection` and `X` (`:1242`) to `handleToggleLike`. (Note: `27-CONTEXT.md` D-01/D-08 refers to opening the action modal; in Deckify's modal, `Y` is the Options modal trigger and `X` is Like, as shown in `hintText` at `:1353`).
- In `vgp_oncancel` (`DeckifyExpandedModal.tsx:1266`), check `if (grabCancelRef.current?.()) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation?.(); return; }` **before** `actionTrackRef` / `navigationHistoryRef` / `activePlaylistRef` so `B` cancels Grab/Move Mode without closing the playlist or modal.
- In `useTriggerNavigation` (`DeckifyExpandedModal.tsx:1090`), include `isGrabbing` and any open CRUD/confirmation modal in `suppressed` so `L1`/`R1` tab switching and `X`/`Y` shortcuts don't fire mid-grab or mid-dialog.

### Pattern 3: Queue Mutation Backend Strategy (`py_modules/rpc_playback.py` + `cdp_bridge.py`)
**What:** Unified queue mutation handlers (`reorder_queue_track`, `remove_queue_track`, `clear_queue`) with CDP `PlayerAPI` first on `spotify_client` and automatic URI-slice `PUT /v1/me/player/play` fallback.
**Critical details:**
1. **Optimistic Queue Snapshot (D-07):**
   - Store `plugin._optimistic_queue_snapshot = {"expires_at": time.monotonic() + 4.5, "queue": [...], "track_id": current_track_id, "shuffle": plugin._shuffle_state}` on `plugin`.
   - In `get_queue(plugin)`: if `_optimistic_queue_snapshot` is present, `time.monotonic() < expires_at`, and `track_id` & `shuffle` match current state, return the cached optimistic queue immediately (annotated with liked status) without hitting `me/player/queue`.
   - Automatically invalidate `plugin._optimistic_queue_snapshot = None` on: track change (in poll / onevent), `set_shuffle`, `play_tracks`, `add_to_queue`, and `control_playback("next" | "previous")`.
2. **CDP `PlayerAPI` Queue Methods (D-04):**
   - `cdp_remove_from_queue(uris_or_items, ...)`: `PlayerAPI.removeFromQueue(tracks)` (`[CITED: spicetify.app]`). Note: `PlayerAPI.removeFromQueue` expects `[{ uri, uid }]` (or `[{ uri }]` which removes all matching URIs if `uid` is omitted). Always pass `uid` if captured from `PlayerAPI.getQueue()` / `_queue`.
   - `cdp_clear_queue(...)`: `PlayerAPI.clearQueue()` (`[CITED: spicetify.app]`).
   - `cdp_reorder_queue(from_idx, to_idx, ...)`: `PlayerAPI` does NOT have a universally documented `reorderQueue` method (`[CITED: spicetify.app]`), though some Spotify client builds expose `PlayerAPI.reorderQueue` or `PlayerAPI._queue.reorder`. Probe `typeof playerApi.reorderQueue === 'function'` first; if missing or if it throws / fails on context items, immediately fall back to URI-slice replacement!
3. **URI-Slice Playback Fallback (D-05, D-06):**
   - Fetch current playback state (`current_track_uri`, `current_position_ms`, `was_paused = (plugin._poll_play_state != "playing")`).
   - Build `uris = [current_track_uri] + mutated_upcoming_uris` (capped to Spotify's `PUT /v1/me/player/play` `uris` array limit — Spotify Web API allows up to ~100–200 URIs, and `get_queue` already slices to 30 upcoming tracks at `py_modules/rpc_playback.py:344`!).
   - Call `PUT /v1/me/player/play` with `{"uris": uris, "position_ms": current_position_ms}`.
   - If `was_paused` is `True`, immediately follow with `PUT /v1/me/player/pause` so paused state is preserved (D-05, D-06).
   - For `"Clear Queue"` (D-06): `mutated_upcoming_uris = []`, so `uris = [current_track_uri]` at `current_position_ms` (preserving paused state).

### Pattern 4: Playlist CRUD, Ownership & Single-Instance Curation (`py_modules/rpc_library.py`)
**What:** Extend `rpc_library.py` with full playlist lifecycle and ownership metadata, using Web API first and `cdp_bridge.py` fallback on HTTP 400/403/404.
**Verified Spotify Web API Endpoints (`[CITED: developer.spotify.com]`):**
- **Current User ID:** `GET /v1/me` → `id` (cache on `plugin._current_user_id` so `get_playlists` doesn't re-fetch `/me` on every call).
- **Enrich `get_playlists` (D-12):**
  - Include `"description": p.get("description") or ""`
  - Include `"collaborative": bool(p.get("collaborative", False))`
  - Compute `"is_editable": bool(p.get("collaborative") or (owner_id and current_user_id and owner_id == current_user_id))` (and `False` if `owner_id == "spotify"` or algorithmic mix).
- **Create Playlist (D-09, D-14):**
  - `create_playlist(plugin, name: str, public: bool = False, description: str = "")` → `POST /v1/me/playlists` with `{"name": name, "public": bool(public), "description": description}`.
  - CDP fallback (`cdp_create_playlist`): `RootlistAPI.createPlaylist(name, { after: "end" })` + `PlaylistAPI.updateDetails` if description non-empty.
- **Update Playlist Details (D-08, D-09, D-14):**
  - `update_playlist_details(plugin, playlist_id: str, name: str, description: str = "")` → `PUT /v1/playlists/{pid}` with `{"name": name, "description": description}`.
  - CDP fallback (`cdp_update_playlist_details`): `PlaylistAPI.updateDetails(uri, { name, description })` (or `RootlistAPI.renamePlaylist` if `updateDetails` unavailable).
- **Delete / Unfollow Playlist (D-11, D-14):**
  - `delete_playlist(plugin, playlist_id: str)` → `DELETE /v1/playlists/{pid}/followers` (Spotify Web API uses unfollow for both owned and followed playlists).
  - CDP fallback (`cdp_delete_playlist`): `RootlistAPI.remove([{ uri }])`.
  - **Automatic Cleanup (D-11):** Remove matching `uri` / `id` from `plugin._settings["pinned_playlists"]` and `plugin._settings["playlist_folders"]` (`playlist_ids`), persist via `_save_settings(plugin._settings)`, and return updated `pinned_playlists` / `folders` so frontend state syncs immediately.
- **Reorder Playlist Tracks (D-14):**
  - `reorder_playlist_tracks(plugin, playlist_id: str, range_start: int, insert_before: int, range_length: int = 1, snapshot_id: str = "")`
  - **CRITICAL `insert_before` semantics (`[CITED: developer.spotify.com]`):** In Spotify Web API `PUT /v1/playlists/{pid}/items` (and `/tracks` fallback), `insert_before` is the index **before** the move! When moving a single item **down** from index `from_idx` to `to_idx` (`to_idx > from_idx`), `insert_before` MUST be `to_idx + 1`! When moving **up** (`to_idx < from_idx`), `insert_before` is `to_idx`.
  - CDP fallback (`cdp_reorder_playlist_track`): `PlaylistAPI.move(uri, [{ uid }], { after: targetUid } | { before: targetUid })`.
- **Single-Instance Remove Track (D-13, D-14):**
  - `remove_track_from_playlist(plugin, playlist_id: str, track_uri: str, position: int | None = None, uid: str = "")`
  - Web API: `DELETE /v1/playlists/{pid}/items` (and `/tracks` fallback) supports `{"items": [{"uri": uri, "positions": [position]}]}` (or `{"tracks": [{"uri": uri, "positions": [position]}]}` on `/tracks`) when `position is not None`! Note: Spotify's `/tracks` `DELETE` with `positions` has historically had edge cases on some endpoints, so if `400` is returned with `positions`, fall back to CDP `PlaylistAPI.remove(uri, [{ uri, uid }])` (if `spotify_client` running) or URI-only `DELETE`.
  - CDP fallback (`cdp_remove_from_playlist`): `PlaylistAPI.remove(uri, [{ uri, uid }])` targeting the exact row `uid`!
  - Frontend `handleRemoveTrackFromActivePlaylist` (currently `DeckifyExpandedModal.tsx:956` does `.filter((t) => t.uri !== actionTrack.uri)` which removes ALL duplicates!) MUST instead remove by `_rowKey` / `position` index so duplicates stay intact!

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pointer drag-and-drop | HTML5 `draggable` / mouse events | Controller Grab/Move Mode (`onGamepadDirection`) | Explicitly out of scope (`REQUIREMENTS.md:73`); breaks `FocusNavController` D-pad navigation. |
| Spotify API rate-limit / 204 handling | Custom `urllib` calls | `_spotify_api_request` in `py_modules/spotify.py` | Already handles `204 No Content`, empty bodies, and 429 exponential backoff circuit breaker. |
| CDP registry lookup | New WebSocket / Fiber walker | `evaluate_with_registry` in `py_modules/cdp_bridge.py` | Already caches `window.__deckifyRegistry` and fast-fails in 0ms on `librespot`. |
| Track row rendering | Separate playlist row component | Extend `TrackRowItem.tsx` with optional `isGrabbed`, `isEditable`, `onGrabTrack`, `onRemoveTrack` props | Reuses existing `InteractiveRow`, `DeckifyImage`, like button, and `data-deckify-list-item` attributes. |

---

## Common Pitfalls

### Pitfall 1: `insert_before` Off-By-One When Moving Down in Spotify Web API
**What goes wrong:** Passing `insert_before = to_idx` when moving an item down (`to_idx > from_idx`) moves it one slot too early (to `to_idx - 1`).
**Why it happens:** Spotify evaluates `insert_before` against the array **before** `range_start` is removed.
**How to avoid:** Convert `(from_idx, to_idx)` cleanly: `insert_before = to_idx + 1 if to_idx > from_idx else to_idx`. Document and unit-test both upward and downward moves.

### Pitfall 2: Focus Loss During React Reorder (`key={idx}` or `key={t.uri}`)
**What goes wrong:** Pressing `D-Pad Down` in Grab/Move Mode causes focus to vanish or jump to the top of the list.
**Why it happens:** React unmounts/remounts the `<InteractiveRow>` if `key` changes (`idx`) or collides (`t.uri` on duplicate tracks).
**How to avoid:** Assign a unique `_rowKey` string to every `TrackItem` on load and pass `key={t._rowKey}` and `data-row-key={t._rowKey}` to `<InteractiveRow>`.

### Pitfall 3: `X` vs `Y` Button Mapping Confusion in `DeckifyExpandedModal`
**What goes wrong:** Mapping Grab/Move or Collection actions to `X` breaks `X = Toggle Like` (`DeckifyExpandedModal.tsx:1242`).
**Why it happens:** `27-CONTEXT.md` casually mentions `X` for action modals, whereas `DeckifyExpandedModal.tsx:1223-1240` binds `Y` to `TrackActionModal` / `CollectionActionModal` and `X` to `Toggle Like`.
**How to avoid:** Keep `Y` as the Options modal button (`TrackActionModal` / `CollectionActionModal`) and `X` as Like, consistent with the rest of Deckify.

### Pitfall 4: Filtered Playlist Index Mismatch
**What goes wrong:** User filters tracks in `PlaylistsTab` (`D-16`), removes track #1 in the filtered view, and the backend deletes track #1 of the *unfiltered* playlist (the wrong song!).
**Why it happens:** Using the filtered array's `.map((_, idx) => ...)` index instead of the track's original index in `playlistTracks`.
**How to avoid:** Compute `originalIndex` from the unfiltered `playlistTracks` before filtering (e.g. `playlistTracks.map((t, originalIndex) => ({ t, originalIndex })).filter(...)`), disable/hide Grab/Move (`⇅`) while a track filter is non-empty (`D-16`), and pass `originalIndex` to `remove_track_from_playlist` and `onPlayTrack`.

### Pitfall 5: SteamOS 100% Width Button Expansion on Inline Icons
**What goes wrong:** Inline `⇅` or `✕` or `"Confirm Clear?"` buttons stretch to 100% width and push track titles off-screen.
**Why it happens:** SteamOS GamepadUI CSS forces `button` / `Focusable` elements to `width: 100%` unless overridden.
**How to avoid:** Use `width: "auto"`, `minWidth: "auto"`, `flexShrink: 0` on all compact inline `<InteractiveRow>` / button elements.

### Pitfall 6: `Audio` / `librespot` Pause State Lost on URI-Slice Fallback
**What goes wrong:** User pauses playback, removes a track from `QueueTab`, and playback unexpectedly starts playing again.
**Why it happens:** `PUT /v1/me/player/play` always resumes playback.
**How to avoid:** Capture `was_paused = (plugin._poll_play_state != "playing")` before calling `me/player/play`, and immediately send `PUT /v1/me/player/pause` if `was_paused` is `True`.

---

## Code Examples

### 1. Spotify Web API Playlist Reorder & Single-Instance Delete
```python
# Source: Verified against py_modules/spotify.py:41-80 and developer.spotify.com
insert_before = to_index + 1 if to_index > from_index else to_index
await _exec(
    _spotify_api_request,
    f"playlists/{pid}/items",
    token,
    "PUT",
    None,
    {"range_start": from_index, "insert_before": insert_before, "range_length": 1},
)
```

### 2. Optimistic Queue Snapshot Guard in `rpc_playback.py`
```python
# Source: Pattern aligned with py_modules/rpc_playback.py:304-361
def _get_valid_optimistic_queue(plugin) -> list[dict] | None:
    snap = getattr(plugin, "_optimistic_queue_snapshot", None)
    if not isinstance(snap, dict):
        return None
    if time.monotonic() >= snap.get("expires_at", 0):
        plugin._optimistic_queue_snapshot = None
        return None
    if snap.get("track_id") != getattr(plugin, "_poll_track_id", None):
        plugin._optimistic_queue_snapshot = None
        return None
    if snap.get("shuffle") != getattr(plugin, "_shuffle_state", None):
        plugin._optimistic_queue_snapshot = None
        return None
    return snap.get("queue")
```

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `PlayerAPI.reorderQueue` may not exist on all Spotify Desktop client versions, whereas `PlayerAPI.removeFromQueue` and `PlayerAPI.clearQueue` are standard Spicetify `Platform.PlayerAPI` methods. | Architecture Patterns / Pattern 3 | Low — `cdp_bridge.py` probes `typeof playerApi.reorderQueue === 'function'` and automatically falls back to URI-slice `PUT /v1/me/player/play` when absent or failing. |
| A2 | `PlaylistAPI.updateDetails` and `PlaylistAPI.move` / `RootlistAPI.createPlaylist` / `RootlistAPI.remove` signatures may vary slightly across Spotify Desktop versions. | Architecture Patterns / Pattern 4 | Low — Web API is primary (D-14) and CDP helpers probe method availability with `typeof` guards and structured `{ ok: False, error }` fallback. |

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Frontend Framework | Vitest 5.1.0 (`pnpm test -- --run`) |
| Backend Framework | Python `unittest` (`py -3 -m unittest discover -s tests -p "test_*.py"`) |
| Linter / Typecheck | `pnpm lint` (ESLint 10) & `pnpm typecheck` (`tsc --noEmit`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| QUEUE-03 | `QueueTab` Grab/Move Mode (`_rowKey` stability, `DIR_UP`/`DIR_DOWN` swap, `A` batched commit, `B` cancel restore, `✕` remove, 2-tap `"Clear Queue"`) | unit | `pnpm test -- --run src/components/tabs/QueueTab.test.tsx` | ✅ (extend) |
| QUEUE-03 | `reorder_queue_track`, `remove_queue_track`, `clear_queue` (CDP `PlayerAPI` + URI-slice fallback + paused state + 4.5s optimistic snapshot) | unit | `py -3 -m unittest tests/test_cdp_bridge.py tests/test_queue_studio.py` | ❌ Wave 0 (`tests/test_queue_studio.py`) |
| PL-01 | `PlaylistsTab` CRUD forms, ownership gating (`is_editable`), filter bars, Grab/Move Mode, `CollectionActionModal` edit/delete, `TrackActionModal` searchable editable picker | unit | `pnpm test -- --run src/components/tabs/PlaylistsTab.test.tsx src/components/common/TrackActionModal.test.tsx` | ❌ Wave 0 (`PlaylistsTab.test.tsx`), ✅ (`TrackActionModal.test.tsx`) |
| PL-01 | `create_playlist`, `update_playlist_details`, `delete_playlist` (with `pinned_playlists`/`playlist_folders` cleanup), `reorder_playlist_tracks` (`insert_before` math), single-instance `remove_track_from_playlist`, CDP fallbacks | unit | `py -3 -m unittest tests/test_playlist_management.py` | ❌ Wave 0 (`tests/test_playlist_management.py`) |

### Wave 0 Gaps
- [ ] `tests/test_queue_studio.py` — backend unit tests for `QUEUE-03` RPCs, CDP `PlayerAPI` helpers, URI-slice fallback, and optimistic snapshot invalidation
- [ ] `tests/test_playlist_management.py` — backend unit tests for `PL-01` CRUD RPCs, `is_editable` enrichment, `insert_before` math, single-instance removal, and QAM/folder cleanup
- [ ] `src/components/tabs/PlaylistsTab.test.tsx` — frontend unit tests for `PlaylistsTab` CRUD, filtering, ownership gating, and Grab/Move Mode

---

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Existing PKCE token lifecycle via `plugin._ensure_token()` (`[VERIFIED: py_modules/rpc_library.py:46]`) |
| V4 Access Control | yes | Ownership gating (`is_editable`) on UI and Spotify Web API / CDP authorization enforcement |
| V5 Input Validation | yes | Validate non-empty playlist names, integer bounds on `from_index`/`to_index`/`range_start`/`insert_before`, and `json.dumps()` escaping for all strings interpolated into CDP JS (`[VERIFIED: py_modules/cdp_bridge.py:226]`) |

### Known Threat Patterns for Stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| JS injection in CDP `evaluate_with_registry` | Tampering | Always serialize user-supplied playlist names, descriptions, and URIs via `json.dumps(...)` before interpolating into CDP JS strings |
| Destructive playlist deletion by accidental tap | Repudiation / Integrity | Context-aware confirmation modal with initial focus on `"Cancel"` (`D-11`) and 2-tap `"Confirm Clear?"` for queue clearing (`D-03`) |

---

## Sources

### Primary (HIGH confidence)
- `src/components/tabs/QueueTab.tsx:1-217` — Existing queue rendering and `renderQueueRow`
- `src/components/tabs/PlaylistsTab.tsx:1-432` — Existing `Folders & Playlists` view and `Playlist Detail View`
- `src/components/common/TrackActionModal.tsx:1-352` — Track action overlay and `"Add to Playlist..."` picker
- `src/components/common/CollectionActionModal.tsx:1-176` — Collection action modal
- `src/components/common/TrackRowItem.tsx:1-83` — Shared track row component
- `src/components/DeckifyExpandedModal.tsx:64-1750` — RPC callables, `vgp_oncancel`, `useTriggerNavigation`, `hintText`
- `py_modules/rpc_playback.py:304-532` — `get_queue`, `add_to_queue`, `play_tracks`
- `py_modules/rpc_library.py:44-516` — `get_playlists`, `get_playlist_tracks`, `create_playlist`, `add_track_to_playlist`, `remove_track_from_playlist`, `manage_playlist_folder`
- `py_modules/cdp_bridge.py:107-377` — `evaluate_with_registry`, `cdp_fetch_folder_tree`, `cdp_get_playlist_tracks`
- `py_modules/spotify.py:41-98` — `_spotify_api_request`

### Secondary (MEDIUM confidence)
- `[CITED: developer.spotify.com]` — Spotify Web API `PUT /v1/playlists/{playlist_id}` (`name`, `description`, `public`), `PUT /v1/playlists/{playlist_id}/items` (`range_start`, `insert_before`, `range_length`), `DELETE /v1/playlists/{playlist_id}/followers`
- `[CITED: spicetify.app]` — `Platform.PlayerAPI.removeFromQueue`, `Platform.PlayerAPI.clearQueue`, `Platform.PlaylistAPI` `uid`-based row mutations

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified directly in `package.json` and `py_modules/`
- Architecture: HIGH — all integration points, focus handlers, and fallback paths verified in existing codebase
- Pitfalls: HIGH — `insert_before` semantics, `_rowKey` focus stability, `X`/`Y` mapping, and filtered index mapping verified

**Research date:** 2026-11-25
**Valid until:** 2026-12-25 (30 days — stable internal Deckify codebase & Spotify Web API)
