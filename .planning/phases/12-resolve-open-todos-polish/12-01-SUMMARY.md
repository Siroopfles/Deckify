---
phase: 12-resolve-open-todos-polish
plan: 01
subsystem: ui, api, testing
tags: [spotify, playlists, librespot, playback, react, python]

# Dependency graph
requires:
  - phase: 11.1-address-tech-debt-v0-5-integration-metadata-cleanup
    provides: Clean v0.5 integration baseline
provides:
  - Followed playlist track loading via /playlists/{pid} data["tracks"] fallback
  - Normalized playlist URI/ID passing for Enable Mix, Play button, and TrackRowItem
  - play_tracks 404 librespot auto-wake and context_uri offset support
  - Archived 3 resolved debug sessions and 9 completed todos
affects: [12-02, 12-03]

# Actuals (#2632)
actuals:
  tokens: 4116
  tasks: 3
  commits: 3
plan_head_before: a01b08882cca20f98117dcc02e05f3703e02cdd9
plan_head_after: eb5927e8f6ebd8fcfaddd796534daf156545e996

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wake stopped librespot on 404 No Active Device after _auto_transfer_and_play fails rather than pre-empting active external devices"
    - "Normalize playlistUri as activePlaylist.uri || (activePlaylist.id ? spotify:playlist:${id} : '') in PlaylistsTab"

key-files:
  created:
    - .planning/debug/resolved/detail-view-missing-mixing-button.md
    - .planning/debug/resolved/phase10-overlay-lyrics-controls.md
    - .planning/debug/resolved/qam-pinned-pills-no-selection-highlight.md
  modified:
    - py_modules/rpc_library.py
    - py_modules/rpc_playback.py
    - src/components/tabs/PlaylistsTab.tsx
    - src/components/DeckifyExpandedModal.tsx
    - tests/test_py_modules.py
    - src/components/DeckifyExpandedModal.test.tsx

key-decisions:
  - "Wake stopped librespot inside play_tracks' 404 handler when _auto_transfer_and_play fails and start_librespot returns ok:true, avoiding extra API calls or killing external playback when an active device already exists"
  - "Normalize playlistUri once in PlaylistsTab and fall back to activePlaylist.id in DeckifyExpandedModal.handleToggleMix"

patterns-established:
  - "Frontend playback callers check res?.ok === false and surface res.error instead of unconditionally toasting Playback started"

requirements-completed: [QAM-01, CTRL-01]

coverage:
  - id: D1
    description: "Followed playlists load tracks cleanly via /playlists/{pid} data.tracks fallback in get_playlist_tracks"
    requirement: QAM-01
    verification:
      - kind: unit
        ref: "tests/test_py_modules.py#test_get_playlist_tracks_followed_playlist_fallback"
        status: pass
    human_judgment: false
  - id: D2
    description: "Enable Mix ID fallback, Play button engine wake on 404, res.ok error handling, and TrackRowItem allTracks context playback"
    requirement: CTRL-01
    verification:
      - kind: unit
        ref: "tests/test_py_modules.py#test_play_tracks_wakes_librespot_and_sets_offset"
        status: pass
      - kind: unit
        ref: "src/components/DeckifyExpandedModal.test.tsx#DeckifyExpandedModal playlist mix ID fallback & playback reliability (12-01)"
        status: pass
    human_judgment: false
  - id: D3
    description: "3 resolved debug sessions and 9 completed todos archived to .planning/debug/resolved/ and .planning/todos/done/"
    verification:
      - kind: other
        ref: "python os.path.exists archive check (ARCHIVED_OK)"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-11-15
status: complete
---

# Phase 12 Plan 01: Playlist Loading, Mix ID & Playback Reliability Summary

**Fixed followed playlist `/playlists/{pid}` track parsing, `Enable Mix` ID fallback, `play_tracks` 404 librespot auto-wake with offset support, and `PlaylistsTab` context playback, and archived 3 debug sessions + 9 todos.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-11-15T19:53:36Z
- **Completed:** 2026-11-15T20:01:08Z
- **Tasks:** 3
- **Files modified:** 18 (6 code/test files, 12 archived planning files)

## Accomplishments
- Updated `get_playlist_tracks` in `py_modules/rpc_library.py` to fall back to `data.get("tracks")` when `"items"` is absent on `/playlists/{pid}` responses.
- Updated `play_tracks` in `py_modules/rpc_playback.py` to support `offset: {"position": position}` for `context_uri` and wake stopped `librespot` on 404 when `_auto_transfer_and_play` finds no devices.
- Updated `PlaylistsTab.tsx` to normalize `playlistUri` and pass `allTracks={playlistTracks}` to `TrackRowItem`, and updated `DeckifyExpandedModal.tsx` to fall back to `activePlaylist.id` in `handleToggleMix` and surface `res.error` in `handlePlayTrack`.
- Added unit tests in `tests/test_py_modules.py` (30/30 passing) and `src/components/DeckifyExpandedModal.test.tsx` (22/22 passing).
- Archived 3 resolved debug sessions to `.planning/debug/resolved/` and 9 completed todos to `.planning/todos/done/`.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end playlist track loading, context playback & engine wake slice** - `d4b3e38` (fix)
2. **Task 2: Add unit tests for followed playlists, Enable Mix ID fallback, and playlist playback** - `cbd489b` (test)
3. **Task 3: Archive verified resolved debug sessions and confirmed-done todos** - `eb5927e` (chore)

## Files Created/Modified
- `py_modules/rpc_library.py` - Fallback to `data.get("tracks")` in `get_playlist_tracks`.
- `py_modules/rpc_playback.py` - Added `position` offset support for `context_uri` and 404 `librespot` auto-wake + device polling.
- `src/components/tabs/PlaylistsTab.tsx` - Normalized `playlistUri` and passed `allTracks={playlistTracks}` to `TrackRowItem`.
- `src/components/DeckifyExpandedModal.tsx` - Added `activePlaylist.id` fallback in `handleToggleMix` and `res?.ok === false` error toast handling in `handlePlayTrack`.
- `tests/test_py_modules.py` - Added `PyModulesPlaylistPlaybackTests` (`test_get_playlist_tracks_followed_playlist_fallback`, `test_play_tracks_wakes_librespot_and_sets_offset`).
- `src/components/DeckifyExpandedModal.test.tsx` - Added tests for `handleToggleMix` ID fallback, `TrackRowItem` `contextUri` + `allTracks`, and `handlePlayTrack` error toast.
- `.planning/debug/resolved/*` - Archived 3 resolved debug sessions.
- `.planning/todos/done/*` - Archived 9 completed todos.

## Decisions Made
- Placed `librespot` auto-wake in `play_tracks`'s `404` handler (after `_auto_transfer_and_play` fails and gated on `start_librespot` returning `ok: True`) instead of pre-emptively calling `start_librespot` before `me/player/play`, preserving single-call behavior when an external device is already active.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Moved librespot auto-wake in `play_tracks` into the 404 handler**
- **Found during:** Task 1 (pre-commit test suite)
- **Issue:** Calling `start_librespot()` unconditionally before `me/player/play` triggered `_configure_pipewire_clock` / `get_devices` calls even when an active device existed or `start_librespot` returned `ok: False`, breaking 5 existing `play_tracks` tests (`test_e2e_requirements.py` and `test_final_coverage.py`).
- **Fix:** Moved `librespot` wake + 4-iteration device polling into the `HTTPError 404` handler when `_auto_transfer_and_play` fails and `start_librespot()` returns `ok: True`.
- **Files modified:** `py_modules/rpc_playback.py`
- **Verification:** Full 453-test Python suite + 145-test Vitest suite passed on commit `d4b3e38`.
- **Committed in:** `d4b3e38` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Necessary for correctness and backward compatibility with existing playback tests. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Playlist loading, Mix ID fallback, and context playback are verified and tested.
- Ready for Plan 12-02 (UI polish, Sidebar navigation, Podcasts, Recently Played, Notifications).

## Self-Check: PASSED
- Created/modified files verified on disk.
- Commits `d4b3e38`, `cbd489b`, `eb5927e` verified in `git log`.

---
*Phase: 12-resolve-open-todos-polish*
*Completed: 2026-11-15*
