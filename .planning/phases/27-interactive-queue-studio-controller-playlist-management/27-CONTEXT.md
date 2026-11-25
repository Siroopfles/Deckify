# Phase 27: Interactive Queue Studio & Controller Playlist Management - Context

**Gathered:** 2026-11-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver `QUEUE-03` and `PL-01`:
1. **Interactive Queue Studio (`QUEUE-03`):** Controller-first **Grab/Move Mode** in `QueueTab` to reorder upcoming tracks using `D-Pad Up/Down` with focus locked via stable `_rowKey` IDs and batched commit, plus individual upcoming track removal and 2-tap `"Clear Queue"` across both `spotify_client` (native CDP `PlayerAPI` + context fallback) and `librespot` (immediate URI-slice playback mutation).
2. **Controller Playlist Management (`PL-01`):** Full controller-driven playlist creation (with name & optional description), editing playlist name/description, deleting/unfollowing playlists with confirmation and QAM/folder cleanup, ownership-gated track reordering and single-instance track removal in user-owned playlists, Web API + CDP `PlaylistAPI`/`RootlistAPI` fallback, plus local playlist/track filtering in `PlaylistsTab` and searchable editable playlist picking in `TrackActionModal`.

</domain>

<decisions>
## Implementation Decisions

### Controller Grab/Move Mode UX (`QueueTab` & User-Owned Playlists)
- **D-01:** Trigger Grab/Move Mode both via `TrackActionModal` (`X` → `"Move in Queue"` / `"Move Track"`) and via an inline grab handle (`⇅`) on the track row; pressing `A` on the main row continues to start playback immediately.
- **D-02:** Assign stable `_rowKey` IDs to every row in `QueueTab` and `PlaylistsTab` so DOM nodes and controller focus stay locked while reordering. In Grab/Move Mode, `D-Pad Up/Down` swaps the grabbed row live (clamped to list bounds with auto-scroll), `A` commits a single batched reorder RPC call (`from_index`, `to_index`), and `B` (`vgp_oncancel`) cancels and restores the original list order before the grab started. Update the bottom controller hint bar to `"↑/↓ Move · A Drop · B Cancel"` while a row is grabbed. — **Reversibility:** costly — requires stable `_rowKey` identity across `QueueTab`, `PlaylistsTab`, `DeckifyExpandedModal` `vgp_oncancel` / `onMove` handlers, and `TrackRowItem`.
- **D-03:** Expose individual upcoming track removal in `QueueTab` via both `TrackActionModal` (`"Remove from Queue"`) and an inline remove (`✕`) icon on each upcoming row. Expose a `"Clear Queue"` button in the `"Next in Queue (N)"` header with a 2-tap inline confirmation (`"Clear Queue"` → `"Confirm Clear?"` / `"Cancel"`).

### Queue Mutation Backend Strategy & `librespot` Fallback (`QUEUE-03`)
- **D-04:** On `spotify_client`, attempt native CDP `PlayerAPI` queue mutation first (`cdp_reorder_queue`, `cdp_remove_from_queue`, `cdp_clear_queue` via `py_modules/cdp_bridge.py`). If an edited upcoming track is a context item from an album/playlist that `PlayerAPI` refuses to mutate as an explicit queue item (or if CDP fails), automatically fall back to URI-slice replacement so any visible upcoming track in `QueueTab` can be reordered, removed, or cleared.
- **D-05:** On `librespot` (or URI-slice fallback), apply queue mutations immediately on the server via `PUT /v1/me/player/play` with `uris: [current_track_uri, ...mutated_upcoming_uris]` at `current_position_ms` (preserving paused state if currently paused) so background gaming track transitions follow the new queue order even when Deckify is closed.
- **D-06:** `"Clear Queue"` keeps the currently playing track playing uninterrupted (or paused at its current position) and clears only upcoming tracks (`Next in Queue`).
- **D-07:** Combine frontend optimistic `queueTracks` updates with a short backend optimistic queue snapshot (`4–5s` TTL in `py_modules/rpc_playback.py`, automatically invalidated on track change, shuffle toggle, or new play/add-to-queue action) so `get_queue` polls never flicker back to stale Spotify Web API queue state.

### Playlist CRUD & Confirmation Modals (`PL-01`)
- **D-08:** Expose **Edit Playlist Details** and **Delete / Unfollow Playlist** both in the Playlist Detail View header (`PlaylistsTab.tsx`) and in `CollectionActionModal.tsx` (`X` on any playlist row).
- **D-09:** Both **Create Playlist** and **Edit Playlist Details** include `Name` (required) and `Description` (optional) `<TextField>`s, and non-empty playlist descriptions render beneath the playlist title in the Playlist Detail View header.
- **D-10:** After creating a new playlist in `PlaylistsTab`, prepend the new playlist to the user's playlist list, keep the user on the `Folders & Playlists` screen with controller focus restored, and display a confirmation toast.
- **D-11:** Deleting (user-owned) or Unfollowing (followed) a playlist opens a context-aware confirmation modal (`"Delete Playlist"` vs `"Unfollow Playlist"`) with initial controller focus on `"Cancel"`. Confirming automatically cleans up the deleted/unfollowed playlist from **Pinned QAM Playlists** (`pinned_playlists`) and **Deckify Custom Folders** (`playlist_folders`).

### Playlist Track Curation, Ownership & Filtering (`PL-01`)
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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & Requirements
- `.planning/ROADMAP.md` — Phase 27 goal and 3 success criteria
- `.planning/REQUIREMENTS.md` — `QUEUE-03` and `PL-01` definitions and Out of Scope pointer drag-and-drop prohibition
- `.planning/phases/26-unified-cdp-platform-bridge-deep-discovery-2-0/26-CONTEXT.md` — Unified `cdp_bridge.py` architecture (`D-01`, `D-02`) and `vgp_oncancel` `B`-button stepwise navigation pattern (`D-09`)

### Existing Queue, Playlist & CDP Implementation
- `src/components/tabs/QueueTab.tsx` — Existing queue rendering, `renderCurrentlyPlayingCard`, `renderQueueRow`
- `src/components/tabs/PlaylistsTab.tsx` — Existing `Folders & Playlists` view, `New Playlist` / `New Folder` forms, and Playlist Detail View
- `src/components/common/TrackActionModal.tsx` — Track action overlay and `"Add to Playlist..."` picker overlay
- `src/components/common/CollectionActionModal.tsx` — Collection `X`-button action modal
- `src/components/common/TrackRowItem.tsx` — Shared playlist/album track row component
- `src/components/DeckifyExpandedModal.tsx` — Modal `vgp_oncancel`, `hintText`, and `QueueTab` / `PlaylistsTab` state wiring
- `py_modules/rpc_playback.py` — `get_queue`, `play_tracks`, `add_to_queue`
- `py_modules/rpc_library.py` — `get_playlists`, `get_playlist_tracks`, `create_playlist`, `add_track_to_playlist`, `remove_track_from_playlist`, `manage_playlist_folder`
- `py_modules/cdp_bridge.py` — Unified `Platform.Registry` CDP evaluator on port `9229`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `py_modules/cdp_bridge.py`: Centralized `evaluate_with_registry` (`window.__deckifyRegistry`) with `is_spotify_client_running()` `0ms` fast-fail on `librespot`.
- `py_modules/rpc_library.py`: Already implements `create_playlist`, `add_track_to_playlist`, `remove_track_from_playlist` (with `/items` + `/tracks` fallback), and `manage_playlist_folder`.
- `src/components/common/InteractiveRow.tsx`: Shared focusable row component used across `QueueTab`, `PlaylistsTab`, `TrackActionModal`, and `CollectionActionModal`.
- `src/components/common/TrackRowItem.tsx`: Shared track row used in `PlaylistsTab` detail view.

### Established Patterns
- All controller lists use `<Focusable flow-children="column">` and horizontal header action bars use `<Focusable flow-children="horizontal">`.
- Modals capture `document.activeElement` on open and restore focus on close (`TrackActionModal.tsx`, `CollectionActionModal.tsx`).
- Compact inline buttons must avoid SteamOS 100% width by using `width: "auto"` / `flexShrink: 0` when needed.
- Blocking file/socket/HTTP operations in Python run inside `await _exec(...)`.

### Integration Points
- `main.py`: Expose new RPCs for queue mutation (`reorder_queue_track`, `remove_queue_track`, `clear_queue`) and playlist CRUD/curation (`update_playlist_details`, `delete_playlist`, `reorder_playlist_tracks`, and updated `create_playlist` / `remove_track_from_playlist`).
- `src/types.ts`: Extend `PlaylistItem` (`description?`, `is_editable?`, `collaborative?`, `owner_id?`) and `TrackItem` (`_rowKey?`, `uid?`).

</code_context>

<specifics>
## Specific Ideas

- User specifically requested:
  - Searching/filtering inside the *"Add to Playlist..."* picker when adding a track to a playlist (`TrackActionModal`).
  - Filtering inside `PlaylistsTab` both on the main `Folders & Playlists` list and inside an opened playlist's tracklist.
- Keep `A` on any track row playing immediately; Grab/Move Mode is entered explicitly via `⇅` or `TrackActionModal` (`X`).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

### Reviewed Todos (not folded)
- `2026-11-21-investigate-decky-loader-breakage-after-steam-update.md` — Matched only on generic keyword `"update"` (`0.4`); unrelated to Phase 27 Queue Studio & Playlist Management.

</deferred>

---

*Phase: 27-Interactive Queue Studio & Controller Playlist Management*
*Context gathered: 2026-11-25*
