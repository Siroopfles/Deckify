---
status: diagnosed
trigger: "Investigate Phase 27 UAT gaps (G-27-6, G-27-7, G-27-8)"
created: 2026-11-26T16:04:00Z
updated: 2026-11-26T16:06:00Z
---

## Current Focus

hypothesis: Root causes confirmed for G-27-6, G-27-7, and G-27-8.
test: All relevant frontend and backend files inspected.
expecting: Return structured ROOT CAUSE FOUND diagnosis to orchestrator.
next_action: Send ROOT CAUSE FOUND message to parent agent.

## Symptoms

expected:
- G-27-6: Pressing D-Pad Up/Down moves the track up or down in the queue while focus stays locked on that row without jank or dual green+white selection, and pressing A drops without accidentally playing a track.
- G-27-7: Activating inline ✕ on an upcoming track removes only that single track instance without audio stutter; Clear Queue keeps context tracks cleared even after the current track finishes.
- G-27-8: PlaylistsTab detail view supports sorting tracks (custom order, title, artist, album, duration, date added) and smooth Grab/Move Mode without dual selection or janky drop behavior.
actual:
- G-27-6: Reordering works, feels janky, occasionally selects the adjacent/other track (both green and white selection). Pressing A while dragging occasionally triggers playing a track instead of (or in addition to) dropping it.
- G-27-7: Removing a single track causes a brief audio stutter of a few milliseconds. Clear Queue works for user-added tracks, but context tracks disappear from UI and then when the current track finishes, playback continues with context and the whole queue reappears.
- G-27-8: Missing sort buttons in PlaylistsTab detail view (duration/"tijd", title, custom order, date added, album). Reordering tracks in PlaylistsTab has the same dual green+white selection and janky drop behavior.
errors: None reported
reproduction: Phase 27 UAT Tests 1, 2, 4
started: After 27-06 / 27-07 / 27-08 fixes

## Eliminated

## Evidence

- timestamp: 2026-11-26T16:05:00Z
  checked: src/hooks/useGrabMoveOrder.ts (lines 28-33, 104-168) & src/components/common/InteractiveRow.tsx (lines 4-15, 100-165)
  found: |
    InteractiveRow renders <Focusable> with focusHalo(focused) (white 2px #fff box-shadow) driven by onFocus/onGamepadFocus.
    scheduleRowFocus(rowKey) only calls native DOM queryRowElement(rowKey)?.focus?.() inside requestAnimationFrame.
    handleGamepadDirection is attached to the parent <Focusable flow-children="column"> container.
  implication: |
    In SteamOS GamepadUI, DOM .focus() does not reliably lock Steam's FocusNavController focus node when child Focusables exist or when React reorders rows; Steam spatial navigation can move white focus to an adjacent row while isGrabbed (green border) remains on the grabbed row.

- timestamp: 2026-11-26T16:05:10Z
  checked: src/components/tabs/QueueTab.tsx (lines 86-108, 269-341) & src/components/common/TrackRowItem.tsx (lines 42-75, 123-155)
  found: |
    Both QueueTab and TrackRowItem nest child <InteractiveRow> buttons ("Reorder track" and "Remove track") inside the outer track <InteractiveRow data-row-key={...}> without flow-children="horizontal" or focus isolation.
    Both outer rows check `if (isGrabbed)` inside their own `onClick` handler to decide whether to drop or play (`handlePlayQueueTrack` / `onPlayTrack`).
  implication: |
    1) Activating the inline ⇅ button leaves Steam's FocusNode on the child button rather than the outer row.
    2) When Steam's white focus drifts to an adjacent row during D-Pad Up/Down, `isGrabbed` is `false` on that focused row, so pressing A executes `handlePlayQueueTrack` / `onPlayTrack` instead of `commitGrab()`.

- timestamp: 2026-11-26T16:05:20Z
  checked: src/components/DeckifyExpandedModal.tsx (lines 1222-1241, 1480-1514, 1819-1825)
  found: |
    In handleReorderPlaylistTrack (lines 1487-1500), `const prevTracks = playlistTracks;` is read AFTER `useGrabMoveOrder` has already mutated `playlistTracks` via `setItems(next)` during D-Pad moves. Thus `prevTracks[fromIndex]?.uid` and `prevTracks[toIndex]?.uid` are swapped/stale, and rollback restores the post-drag order.
    Also `attachNav` intercepts `vgp_oncancel` (B button) when `isGrabbing` is true, but nothing intercepts A-button activation globally during `isGrabbing` to guarantee `commitGrab()` runs instead of row playback.
  implication: |
    Playlist reordering passes wrong `uid`/`targetUid` to `backendReorderPlaylistTracks` and cannot roll back to pre-drag state from `handleReorderPlaylistTrack` alone.

- timestamp: 2026-11-26T16:05:30Z
  checked: py_modules/rpc_playback.py (lines 350-375, 454-505, 558-633) & py_modules/cdp_bridge.py (lines 998-1094)
  found: |
    1) `cdp_remove_from_queue` (cdp_bridge.py:1020-1031) only checks `playerApi.getQueue().nextTracks`. For context tracks (not in `nextTracks`), it returns `{ ok: False, error: 'Track not in next_tracks' }`, causing `remove_queue_track` (rpc_playback.py:595-596) to fall back to `_mutate_queue_via_uri_slice`, which calls `PUT /v1/me/player/play` with `uris: [current_track_uri, ...]` and `position_ms: current_position_ms`, restarting the current track and causing an audio stutter.
    2) `cdp_clear_queue` (cdp_bridge.py:1067-1089) calls `playerApi.clearQueue()` (which only clears user-added `nextTracks`) and checks `nextTracks`/`futureTracks`/`future`. When `hasContextTracks` evaluates false, `clear_queue` (rpc_playback.py:617) skips `_mutate_queue_via_uri_slice(plugin, token, [])`, leaving the Spotify context active. `clear_queue` then sets `_queue_cleared_for_track_id = _poll_track_id`, so `get_queue` (rpc_playback.py:365-374) returns `[]` only until the current track ends, after which the active context resumes and the queue reappears.

- timestamp: 2026-11-26T16:05:40Z
  checked: src/components/tabs/PlaylistsTab.tsx (lines 794-893), src/types.ts (lines 63-79), py_modules/rpc_library.py (lines 275-295)
  found: |
    PlaylistsTab detail view has `trackFilter` and `trackMetaFilter` ("All" / "Liked"), but no sort state or sort buttons (Custom Order, Title, Artist, Album, Duration, Date Added).
    `get_playlist_tracks` (rpc_library.py:275-295) does not extract `added_at` from Spotify's playlist item wrapper, and `TrackItem` (src/types.ts:63-79) has no `added_at?: string` field.
  implication: |
    Cannot sort by Date Added without extracting `added_at` in `get_playlist_tracks` and adding sort controls in `PlaylistsTab.tsx`.

## Resolution

root_cause: "G-27-6: Nested InteractiveRow Focusables + DOM-only scheduleRowFocus allow Steam FocusNavController to desync white focus onto adjacent rows during Grab/Move Mode, causing dual green+white selection and A-button triggering play on the non-grabbed focused row; G-27-7: (1) cdp_remove_from_queue only matches user-added nextTracks, forcing context-track removals into _mutate_queue_via_uri_slice (PUT me/player/play) which restarts playback at position_ms and causes audio stutter; (2) cdp_clear_queue leaves playback context active when has_context_tracks is false, and _queue_cleared_for_track_id only masks get_queue until the current track finishes; G-27-8: PlaylistsTab detail view lacks sort controls and rpc_library.get_playlist_tracks omits added_at, while PlaylistsTab Grab/Move shares G-27-6's focus/drop bug plus handleReorderPlaylistTrack reading post-drag playlistTracks for uid/targetUid."
fix: ""
verification: ""
files_changed: []
