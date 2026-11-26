---
status: diagnosed
trigger: "queue-remove-and-clear-tracks-return-after-delay: In QueueTab, activating the inline ✕ button on an upcoming track (or Y → \"Remove from Queue\") removes only that single track instance while keeping the currently playing track uninterrupted. In the \"Next in Queue (N)\" header, activating \"Clear Queue\" reveals inline \"Confirm Clear?\" and \"Cancel\" buttons; selecting \"Confirm Clear?\" clears all upcoming queue tracks while keeping the currently playing song playing (or paused if already paused)."
created: 2026-11-25T20:51:26Z
updated: 2026-11-25T20:53:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: Confirmed root cause across frontend polling, 4.5s optimistic snapshot, and backend queue mutation paths (CDP PlayerAPI & URI-slice fallback)
bug_class: Bohrbug
test: Code trace of QueueTab -> DeckifyExpandedModal -> rpc_playback -> cdp_bridge
expecting: N/A (diagnosis complete)
next_action: Return ROOT CAUSE FOUND to caller

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: Removing a track or clearing the queue permanently removes those tracks from the Spotify queue so they do not reappear later.
actual: "Yes vgm werkt dit wel Alleen komen ze allemaal terug na bepaalde tijd"
errors: None reported
reproduction: Test 2 in UAT
timeline: Discovered during UAT

## Eliminated
<!-- APPEND only - prevents re-investigating -->

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-11-25T20:52:00Z
  checked: src/components/DeckifyExpandedModal.tsx lines 419-424, 916-954
  found: |
    1. When mode === "queue", `loadQueue` polls `backendGetQueue()` every 10 seconds (`setInterval(loadQueue, 10000)`).
    2. `handleRemoveQueueTrack` optimistically sets `queueTracks` to `remaining` and calls `backendRemoveQueueTrack(index, track.uri || "", track.uid || "", remaining)` — passing `remaining` (already missing the removed track) as `upcoming_tracks`.
    3. `handleClearQueue` optimistically sets `queueTracks` to `[]` and calls `backendClearQueue()`.
  implication: Any server-side queue state that was not actually cleared/removed will overwrite the optimistic UI state on the next 10s poll after the backend's 4.5s optimistic snapshot expires.

- timestamp: 2026-11-25T20:52:20Z
  checked: py_modules/rpc_playback.py lines 314-363, 385-411, 442-494, 546-613
  found: |
    1. `get_queue()` returns `_get_valid_optimistic_queue(plugin)` while `time.monotonic() < expires_at` (`ttl_s = 4.5`). After 4.5s, `get_queue()` falls through to `GET me/player/queue` on Spotify Web API.
    2. `get_queue()` formats each item without `uid` (lines 385-396), so `track.uid` is always `""` in the frontend.
    3. `remove_queue_track()` pops `idx` from `upcoming_tracks` (`mutated = [dict(t) for t in items]; removed = mutated.pop(idx)`). Because `DeckifyExpandedModal.tsx` already filtered out the track before passing `remaining`, `remove_queue_track` pops a second track (or fails with `Queue index out of bounds` when removing the last item).
    4. On `librespot` (or when CDP is unused), `_mutate_queue_via_uri_slice()` calls `PUT /v1/me/player/play` with `{"uris": [current_track_uri, *upcoming_uris], "position_ms": current_position_ms}`. Replacing the playback context via `PUT /me/player/play` does not clear Spotify's manually queued `next_tracks`, and sending a 1-track `uris` list (`[current_track_uri]`) allows Spotify Autoplay to repopulate `GET me/player/queue` with recommended tracks.
  implication: Both the optimistic snapshot expiry and the URI-slice fallback behavior cause tracks to reappear after ~4.5–10s.

- timestamp: 2026-11-25T20:52:40Z
  checked: py_modules/cdp_bridge.py lines 919-969
  found: |
    1. `cdp_clear_queue()` calls `await playerApi.clearQueue()` and returns `{"ok": True}` unconditionally. In Spotify's `PlayerAPI`, `clearQueue()` only clears user-added `next_tracks` and does NOT clear upcoming tracks from the active playback context (playlist/album/radio), which `GET /v1/me/player/queue` still returns.
    2. `cdp_remove_from_queue()` calls `await playerApi.removeFromQueue([item])` where `targetUid` is always `""` (omitted by `get_queue()`), and `removeFromQueue` only targets `next_tracks` (ignoring context tracks and often requiring `uid`). It also returns `{"ok": True}` without verifying the queue actually changed, preventing fallback.
  implication: On `spotify_client`, CDP reports success while Spotify's `GET /v1/me/player/queue` still contains the context/queued tracks, which reappear as soon as the 4.5s `_optimistic_queue_snapshot` expires.

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: "AND-gate of two mechanisms: (1) `remove_queue_track` and `clear_queue` in `py_modules/rpc_playback.py` cache the mutated list in `_optimistic_queue_snapshot` for only 4.5s, while `DeckifyExpandedModal.tsx` polls `get_queue()` every 10s (`setInterval(loadQueue, 10000)`), causing `get_queue()` to hit Spotify `GET me/player/queue` once the 4.5s TTL expires; and (2) neither backend mutation path actually clears all tracks returned by `GET me/player/queue` — on `spotify_client`, `cdp_clear_queue` (`playerApi.clearQueue()`) and `cdp_remove_from_queue` (`playerApi.removeFromQueue([item])` with empty `uid` because `get_queue()` omits `uid`) only affect user-added `next_tracks` and silently no-op on playback-context tracks while returning `{ok: True}`; on `librespot`, `_mutate_queue_via_uri_slice` (`PUT me/player/play` with `uris`) only replaces the context URI list without clearing Spotify's server-side `next_tracks` or preventing Autoplay from repopulating the queue (plus `DeckifyExpandedModal.tsx:924` passes already-filtered `remaining` to `remove_queue_track`, causing a double-pop / out-of-bounds error)."
fix:
verification:
files_changed: []
