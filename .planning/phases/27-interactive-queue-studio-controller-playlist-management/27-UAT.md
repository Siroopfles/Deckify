---
status: diagnosed
phase: 27-interactive-queue-studio-controller-playlist-management
source: [27-01-SUMMARY.md, 27-02-SUMMARY.md, 27-03-SUMMARY.md, 27-04-SUMMARY.md, 27-05-SUMMARY.md]
started: 2026-11-25T21:23:00Z
updated: 2026-11-26T08:21:00Z
---

## Current Test

[testing complete]

## Tests

### 1. QueueTab Controller Grab/Move Reordering, Focus Lock & B-Button Cancel
expected: In QueueTab ("Next in Queue"), activate the inline ⇅ button on any upcoming track (or press Y → "Move in Queue"). The row highlights with the green accent border, the footer hint bar updates to "↑/↓ Move · A Drop · B Cancel", and L1/R1 tab triggers are suppressed. Pressing D-Pad Up/Down moves the track up or down in the queue while focus stays locked on that row. Pressing B cancels Grab/Move Mode and restores the original track order without closing the modal; grabbing again and pressing A drops the track at its new position and commits the new queue order.
result: issue
reported: "Yess de move in queue werkt maar verspringt terug als ik sleep. En heb het idee dat hij uiteindelijk geselecteerd is maar dan niet meer zie versleept worden. en als er iets veranderd in de que dus bij nummer begint dan stop hij ook met slepen"
severity: major

### 2. QueueTab Single-Track Remove (✕) & 2-Tap Clear Queue
expected: In QueueTab, activating the inline ✕ button on an upcoming track (or Y → "Remove from Queue") removes only that single track instance while keeping the currently playing track uninterrupted. In the "Next in Queue (N)" header, activating "Clear Queue" reveals inline "Confirm Clear?" and "Cancel" buttons; selecting "Confirm Clear?" clears all upcoming queue tracks while keeping the currently playing song playing (or paused if already paused).
result: issue
reported: "Yes vgm werkt dit wel Alleen komen ze allemaal terug na bepaalde tijd"
severity: major

### 3. PlaylistsTab Create, Edit Details & Delete/Unfollow Confirmation Modal
expected: In PlaylistsTab, create a new playlist with a Name and optional Description (leaving Name empty shows a validation warning). Open the playlist to see its description rendered below the title, use "Edit Details" (in the secondary header bar or via Y → CollectionActionModal) to rename or update the description, and trigger "Delete Playlist" (or "Unfollow Playlist" on a non-owned/Spotify playlist) to open the confirmation modal with initial controller focus safely placed on "Cancel"; confirming deletes/unfollows the playlist and removes it from Pinned QAM Playlists and folders.
result: issue
reported: "Yess werkt allemaal behalve op b drukken als ik delete playlist modal zit en dan b druk gaa het mis"
severity: major

### 4. PlaylistsTab Local Overview/Track Filters & Ownership-Gated Track Reorder/Remove
expected: In PlaylistsTab, typing in the overview filter filters folders and playlists locally. Inside an owned playlist, typing in the track filter filters tracks while hiding the inline ⇅ Grab/Move buttons, and playing or removing (✕) a filtered track targets the exact track instance. Clearing the track filter restores the inline ⇅ and ✕ buttons on user-owned playlists (while keeping them hidden on read-only Spotify mixes), allowing tracks to be reordered via Grab/Move Mode (↑/↓ Move, A Drop, B Cancel).
result: issue
reported: "Ik kan zoeken enzo maar mis nog meer filter buttons voor meer van de meta data"
severity: minor

### 5. TrackActionModal Searchable Editable-Only Playlist Picker & "+ New Playlist with Track"
expected: Pressing Y on any track and selecting "Add to Playlist..." opens a picker containing a local search filter, "+ New Playlist with Track" at the top, and only editable playlists (read-only Spotify mixes are excluded). Filtering narrows the list, and selecting "+ New Playlist with Track" opens inline Name + Description fields that create the new playlist and immediately add the track to it.
result: issue
reported: "Yes werkt ik mis alleen de plaatjes in de playlist picker modal en ik mis een feuteredat vaak gekozen playlists bovenaanstaan"
severity: minor

### 6. [27-01 D1] CDP PlayerAPI queue helpers (cdp_reorder_queue, cdp_remove_from_queue, cdp_clear_queue) with json.dumps escaping
expected: CDP PlayerAPI queue helpers (cdp_reorder_queue, cdp_remove_from_queue, cdp_clear_queue) with json.dumps escaping
result: pass
source: automated
coverage_id: 27-01-D1

### 7. [27-01 D2] Backend reorder_queue_track, remove_queue_track, and clear_queue RPCs with URI-slice fallback preserving paused state
expected: Backend reorder_queue_track, remove_queue_track, and clear_queue RPCs with URI-slice fallback preserving paused state
result: pass
source: automated
coverage_id: 27-01-D2

### 8. [27-01 D3] 4.5s _optimistic_queue_snapshot in get_queue with automatic invalidation on state transitions
expected: 4.5s _optimistic_queue_snapshot in get_queue with automatic invalidation on state transitions
result: pass
source: automated
coverage_id: 27-01-D3

### 9. [27-02 D1] CDP PlaylistAPI & RootlistAPI fallback helpers (create, update details, delete, reorder, remove, add) with json.dumps serialization
expected: CDP PlaylistAPI & RootlistAPI fallback helpers (create, update details, delete, reorder, remove, add) with json.dumps serialization
result: pass
source: automated
coverage_id: 27-02-D1

### 10. [27-02 D2] Ownership-enriched get_playlists (is_editable, owner_id, collaborative, description) and playlist CRUD with QAM/folder cleanup
expected: Ownership-enriched get_playlists (is_editable, owner_id, collaborative, description) and playlist CRUD with QAM/folder cleanup
result: pass
source: automated
coverage_id: 27-02-D2

### 11. [27-02 D3] Playlist track reordering (insert_before math) and single-instance track removal by position/uid with Web API and CDP fallbacks
expected: Playlist track reordering (insert_before math) and single-instance track removal by position/uid with Web API and CDP fallbacks
result: pass
source: automated
coverage_id: 27-02-D3

### 12. [27-03 D1] Extended TrackItem (_rowKey, uid) and PlaylistItem (description, is_editable, collaborative) in src/types.ts
expected: Extended TrackItem (_rowKey, uid) and PlaylistItem (description, is_editable, collaborative) in src/types.ts
result: pass
source: automated
coverage_id: 27-03-D1

### 13. [27-03 D2] Created useGrabMoveOrder hook with assignStableRowKeys, DIR_UP/DIR_DOWN swapping, commitGrab, and cancelGrab snapshot restoration
expected: Created useGrabMoveOrder hook with assignStableRowKeys, DIR_UP/DIR_DOWN swapping, commitGrab, and cancelGrab snapshot restoration
result: pass
source: automated
coverage_id: 27-03-D2

### 14. [27-03 D3] Upgraded QueueTab with Grab/Move Mode, inline reorder/remove buttons, and 2-tap Clear Queue confirmation
expected: Upgraded QueueTab with Grab/Move Mode, inline reorder/remove buttons, and 2-tap Clear Queue confirmation
result: pass
source: automated
coverage_id: 27-03-D3

### 15. [27-04 D1] PlaylistsTab CRUD forms, Delete/Unfollow confirmation modal with Cancel initial focus, local overview/track filters, ownership gating, and Grab/Move Mode
expected: PlaylistsTab CRUD forms, Delete/Unfollow confirmation modal with Cancel initial focus, local overview/track filters, ownership gating, and Grab/Move Mode
result: pass
source: automated
coverage_id: 27-04-D1

### 16. [27-04 D2] CollectionActionModal and TrackActionModal queue/playlist Move & Remove actions and searchable editable-only playlist picker
expected: CollectionActionModal and TrackActionModal queue/playlist Move & Remove actions and searchable editable-only playlist picker
result: pass
source: automated
coverage_id: 27-04-D2

### 17. [27-05 D1] DeckifyExpandedModal wires Queue Studio and Playlist Management RPCs with optimistic updates, rollback, stable _rowKey normalization, vgp_oncancel priority, trigger suppression, and Grab/Move hint bar
expected: DeckifyExpandedModal wires Queue Studio and Playlist Management RPCs with optimistic updates, rollback, stable _rowKey normalization, vgp_oncancel priority, trigger suppression, and Grab/Move hint bar
result: pass
source: automated
coverage_id: 27-05-D1

### 18. [27-05 D2] Full frontend and backend verification suite passes with zero errors
expected: Full frontend and backend verification suite passes with zero errors
result: pass
source: automated
coverage_id: 27-05-D2

## Summary

total: 18
passed: 13
issues: 5
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-27-1
  truth: "In QueueTab (\"Next in Queue\"), activate the inline ⇅ button on any upcoming track (or press Y → \"Move in Queue\"). The row highlights with the green accent border, the footer hint bar updates to \"↑/↓ Move · A Drop · B Cancel\", and L1/R1 tab triggers are suppressed. Pressing D-Pad Up/Down moves the track up or down in the queue while focus stays locked on that row. Pressing B cancels Grab/Move Mode and restores the original track order without closing the modal; grabbing again and pressing A drops the track at its new position and commits the new queue order."
  status: failed
  reason: "User reported: Yess de move in queue werkt maar verspringt terug als ik sleep. En heb het idee dat hij uiteindelijk geselecteerd is maar dan niet meer zie versleept worden. en als er iets veranderd in de que dus bij nummer begint dan stop hij ook met slepen"
  severity: major
  test: 1
  root_cause: "Unconditional 10-second loadQueue() polling in src/components/DeckifyExpandedModal.tsx overwrites queueTracks with pre-commit backend queue data and newly generated _rowKey values while Grab/Move Mode is active; combined with useGrabMoveOrder in src/hooks/useGrabMoveOrder.ts not reconciling or clearing an orphaned grabbedKey when items changes externally (and moveGrabbed only calling scheduleRowScroll rather than scheduleRowFocus), any 10s poll or queue refresh during a drag causes the track order to jump back, the green isGrabbed highlight to vanish, and D-Pad Up/Down to silently no-op while isGrabbing stays true."
  artifacts:
    - path: "src/components/DeckifyExpandedModal.tsx"
      issue: "loadQueue() and its 10s setInterval (lines 400-424) run unconditionally while isGrabbing is true and regenerate _rowKeys."
    - path: "src/hooks/useGrabMoveOrder.ts"
      issue: "useGrabMoveOrder (lines 79-162) does not guard/reconcile grabbedKey when items is replaced externally, and moveGrabbed (lines 109-122) does not re-focus the moved row via scheduleRowFocus."
  missing:
    - "Skip/defer loadQueue() polling in DeckifyExpandedModal.tsx while isGrabbing is true (e.g., via an isGrabbingRef), and preserve existing _rowKeys where possible."
    - "In useGrabMoveOrder.ts, reconcile grabbedKey when items changes externally (or cleanly exit grab mode if the grabbed track is gone) and call scheduleRowFocus(key) in moveGrabbed."
  debug_session: ".planning/debug/queue-grab-move-jumps-back-and-stops-on-queue-change.md"

- gap_id: G-27-2
  truth: "In QueueTab, activating the inline ✕ button on an upcoming track (or Y → \"Remove from Queue\") removes only that single track instance while keeping the currently playing track uninterrupted. In the \"Next in Queue (N)\" header, activating \"Clear Queue\" reveals inline \"Confirm Clear?\" and \"Cancel\" buttons; selecting \"Confirm Clear?\" clears all upcoming queue tracks while keeping the currently playing song playing (or paused if already paused)."
  status: failed
  reason: "User reported: Yes vgm werkt dit wel Alleen komen ze allemaal terug na bepaalde tijd"
  severity: major
  test: 2
  root_cause: "AND-gate of two mechanisms: (1) remove_queue_track and clear_queue in py_modules/rpc_playback.py only mask the queue in _optimistic_queue_snapshot for 4.5s while DeckifyExpandedModal.tsx polls get_queue() every 10s, so after 4.5s get_queue() fetches Spotify's real server queue (GET me/player/queue); and (2) neither backend mutation path actually removes all tracks returned by GET me/player/queue — on spotify_client, cdp_clear_queue and cdp_remove_from_queue (with uid always empty because get_queue omits uid) only operate on user-added next_tracks and silently no-op on playback-context tracks while returning {ok: True}; on librespot, _mutate_queue_via_uri_slice (PUT me/player/play with uris) replaces context without clearing server-side next_tracks or Autoplay (plus DeckifyExpandedModal.tsx:924 passes already-filtered remaining as upcoming_tracks to remove_queue_track, causing a double-pop)."
  artifacts:
    - path: "src/components/DeckifyExpandedModal.tsx"
      issue: "handleRemoveQueueTrack (line 924) passes already-filtered remaining instead of prevTracks to backendRemoveQueueTrack, and 10s loadQueue polling overwrites optimistic state."
    - path: "py_modules/rpc_playback.py"
      issue: "get_queue omits uid, 4.5s _optimistic_queue_snapshot expires before 10s poll, remove_queue_track double-pops upcoming_tracks, and _mutate_queue_via_uri_slice does not clear next_tracks/Autoplay."
    - path: "py_modules/cdp_bridge.py"
      issue: "cdp_remove_from_queue and cdp_clear_queue only affect next_tracks and return ok: True without verifying context/queue state."
  missing:
    - "Pass prevTracks (pre-removal) rather than remaining to backendRemoveQueueTrack in DeckifyExpandedModal.tsx."
    - "In cdp_bridge.py / rpc_playback.py, mutate both next_tracks and playback context (and verify resulting queue state, falling back to URI-slice if context tracks remain)."
    - "Ensure remove_queue_track and clear_queue persist across subsequent get_queue polls without resurrecting removed/cleared upcoming tracks."
  debug_session: ".planning/debug/queue-remove-and-clear-tracks-return-after-delay.md"

- gap_id: G-27-3
  truth: "In PlaylistsTab, create a new playlist with a Name and optional Description (leaving Name empty shows a validation warning). Open the playlist to see its description rendered below the title, use \"Edit Details\" (in the secondary header bar or via Y → CollectionActionModal) to rename or update the description, and trigger \"Delete Playlist\" (or \"Unfollow Playlist\" on a non-owned/Spotify playlist) to open the confirmation modal with initial controller focus safely placed on \"Cancel\"; confirming deletes/unfollows the playlist and removes it from Pinned QAM Playlists and folders."
  status: failed
  reason: "User reported: Yess werkt allemaal behalve op b drukken als ik delete playlist modal zit en dan b druk gaa het mis"
  severity: major
  test: 3
  root_cause: "PlaylistDeleteConfirmModal (src/components/tabs/PlaylistsTab.tsx:199-246) does not intercept the SteamOS GamepadUI B-button cancel event (vgp_oncancel / onCancelButton), and DeckifyExpandedModal's attachNav vgp_oncancel listener (src/components/DeckifyExpandedModal.tsx:1489-1560) has no check for isCrudModalOpen / PlaylistDeleteConfirmModal. Pressing B inside the delete confirmation modal bubbles vgp_oncancel unhandled to attachNav, popping navigationHistoryRef / calling setActivePlaylist(null) underneath the still-open modal or closing the entire DeckifyExpandedModal."
  artifacts:
    - path: "src/components/tabs/PlaylistsTab.tsx"
      issue: "PlaylistDeleteConfirmModal (lines 199-246) lacks vgp_oncancel / onCancelButton handling to call onCancel() and stop propagation."
    - path: "src/components/DeckifyExpandedModal.tsx"
      issue: "attachNav vgp_oncancel handler (lines 1489-1560) does not guard against open CRUD sub-modals (isCrudModalOpen)."
  missing:
    - "Attach a vgp_oncancel listener on modalRef.current and/or onCancelButton on <Focusable> in PlaylistDeleteConfirmModal to call onCancel() and stop propagation."
    - "Add a unit test in src/components/tabs/PlaylistsTab.test.tsx verifying vgp_oncancel / onCancelButton invokes onCancel and stops propagation."
  debug_session: ".planning/debug/playlist-delete-modal-b-button-breaks.md"

- gap_id: G-27-4
  truth: "In PlaylistsTab, typing in the overview filter filters folders and playlists locally. Inside an owned playlist, typing in the track filter filters tracks while hiding the inline ⇅ Grab/Move buttons, and playing or removing (✕) a filtered track targets the exact track instance. Clearing the track filter restores the inline ⇅ and ✕ buttons on user-owned playlists (while keeping them hidden on read-only Spotify mixes), allowing tracks to be reordered via Grab/Move Mode (↑/↓ Move, A Drop, B Cancel)."
  status: failed
  reason: "User reported: Ik kan zoeken enzo maar mis nog meer filter buttons voor meer van de meta data"
  severity: minor
  test: 4
  root_cause: "src/components/tabs/PlaylistsTab.tsx only implements single free-text TextField filters in PlaylistsOverview (matching folder.name and pl.name only) and renderPlaylistDetailView (matching t.name and t.artist only). Neither view renders metadata filter chip bars, and text filters omit existing metadata fields (description, owner_id, album), even though PlaylistItem and TrackItem already carry those metadata fields."
  artifacts:
    - path: "src/components/tabs/PlaylistsTab.tsx"
      issue: "Missing <Focusable flow-children='horizontal'> metadata filter chip bars and broader metadata matching (description, owner_id, album) in PlaylistsOverview and renderPlaylistDetailView; isTrackFilterActive must also disable Grab/Move when metadata filters are active."
    - path: "src/components/tabs/PlaylistsTab.test.tsx"
      issue: "Needs unit tests covering metadata filter buttons and Grab/Move gating."
  missing:
    - "Add horizontal metadata filter chip bars (All / Editable / Followed / Collaborative / Pinned in overview; All / Liked + Clear in detail view) and broader metadata text matching (description, owner_id, album)."
    - "Keep Grab/Move (canReorder) disabled whenever any track metadata filter is active."
  debug_session: ".planning/debug/playlists-tab-missing-metadata-filter-buttons.md"

- gap_id: G-27-5
  truth: "Pressing Y on any track and selecting \"Add to Playlist...\" opens a picker containing a local search filter, \"+ New Playlist with Track\" at the top, and only editable playlists (read-only Spotify mixes are excluded). Filtering narrows the list, and selecting \"+ New Playlist with Track\" opens inline Name + Description fields that create the new playlist and immediately add the track to it."
  status: failed
  reason: "User reported: Yes werkt ik mis alleen de plaatjes in de playlist picker modal en ik mis een feuteredat vaak gekozen playlists bovenaanstaan"
  severity: minor
  test: 5
  root_cause: "1) src/components/common/TrackActionModal.tsx (renderPlaylistPickerOverlay, lines 443-448) renders a hardcoded <FaFolder> icon instead of <DeckifyImage src={pl.image_url} ... /> (with <FaFolder> fallback) even though DeckifyImage is imported and image_url is populated on PlaylistItem; 2) neither TrackActionModal.tsx nor DeckifyExpandedModal.tsx persists playlist selection frequency or sorts frequently chosen playlists to the top."
  artifacts:
    - path: "src/components/common/TrackActionModal.tsx"
      issue: "renderPlaylistPickerOverlay (lines 411-448) omits <DeckifyImage /> cover art and frequency-based sorting of editablePlaylists."
    - path: "src/components/DeckifyExpandedModal.tsx"
      issue: "handleAddTrackToPlaylist and handleCreatePlaylistWithTrack do not record playlist selection frequency."
  missing:
    - "Render <DeckifyImage src={pl.image_url} ... /> (with <FaFolder> fallback) on playlist rows in renderPlaylistPickerOverlay."
    - "Persist playlist selection counts (e.g., localStorage) when adding a track to a playlist and sort editablePlaylists by descending frequency (preserving original order on ties)."
  debug_session: ".planning/debug/track-action-modal-playlist-picker-missing-images-and-frequent-sort.md"
