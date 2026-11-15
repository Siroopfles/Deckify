---
phase: 09-qam-pinned-playlists-quick-in-game-switch
plan: "01"
subsystem: ui, api
tags: [qam, pinned-playlists, librespot, decky-ui, react, python]

# Dependency graph
requires:
  - phase: 07-per-game-soundtracks
    provides: "QAM Bind current music to game action and game lifetime tracking"
provides:
  - "PinnedItemType, PinnedPlaylistItem, EngineSettings.pinned_playlists, and StatusResponse.context_uri in src/types.ts"
  - "MAX_PINNED_PLAYLISTS = 4 and _sanitize_pinned_playlists persistence validation in py_modules/common.py"
  - "quick_play_pinned RPC with engine auto-wake and liked_songs/playlist/album playback in py_modules/rpc_playback.py and main.py"
  - "Reorganized QAM mini-player with horizontal pinned playlist pills strip, collapsible secondary controls, and Bind focus highlight fix in src/index.tsx"
affects: [09-02-PLAN]

# Actuals (#2632)
actuals:
  tokens: 11572
  tasks: 3
  commits: 3
plan_head_before: e8e9b7dec7847fcfe5d1737274c24a47d0684939
plan_head_after: 4e26edd8facaef8b0780aec00530206d80f60c8e

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Horizontal QAM pill strip using <Focusable flow-children='horizontal'> with overflowX: auto and DeckifyImage 20x20 proxy"
    - "Optimistic context URI highlighting with RPC failure rollback and Decky toast"
    - "Collapsible secondary QAM controls preserving 1-click D-pad reach to primary playback and pinned pills"

key-files:
  created:
    - tests/test_pinned_playlists.py
  modified:
    - src/types.ts
    - py_modules/common.py
    - py_modules/rpc_playback.py
    - main.py
    - src/index.tsx
    - src/index.test.tsx

key-decisions:
  - "Replaced Bind current music to game DialogButton (which had a conflicting borderColor override) with @decky/ui ButtonItem so SteamOS GamepadUI focus highlight renders natively"
  - "Grouped Playback Device, Overlay (HUD), Engine toggle, and Open Deckify under a collapsible Controls & Settings toggle when a track is playing, while keeping them directly visible when no track is playing"

patterns-established:
  - "Pinned playlist items are sanitized on load and validated in set_setting without auto-eviction when 4 items are already pinned"

requirements-completed: [QAM-01, QAM-02]

coverage:
  - id: D1
    description: "Pinned playlists persist up to 4 items in settings.json, reject a 5th item without auto-eviction, and sanitize on load"
    requirement: QAM-01
    verification:
      - kind: unit
        ref: "tests/test_pinned_playlists.py#TestPinnedPlaylists"
        status: pass
    human_judgment: false
  - id: D2
    description: "quick_play_pinned wakes stopped engine, polls devices, and starts playlist/album/liked_songs playback without forcing shuffle ON"
    requirement: QAM-02
    verification:
      - kind: unit
        ref: "tests/test_pinned_playlists.py#test_quick_play_pinned_wakes_stopped_engine_and_polls_devices"
        status: pass
    human_judgment: false
  - id: D3
    description: "QAM renders 0-pinned hidden, 1-4 horizontal pills below Transport Controls with DeckifyImage thumbnails, optimistic highlight + failure rollback, and Bind focus fix"
    requirement: QAM-01
    verification:
      - kind: unit
        ref: "src/index.test.tsx#src/index.tsx GameSessions AppLifetime & QAM Pinned Playlists"
        status: pass
    human_judgment: false

# Metrics
duration: 12min
completed: 2026-11-14
status: complete
---

# Phase 09 Plan 01: QAM Pinned Playlists & Quick In-Game Switch Summary

**End-to-end QAM pinned playlist persistence (max 4), engine-waking `quick_play_pinned` RPC, horizontal DeckifyImage pill strip with optimistic rollback, reorganized QAM layout, and Bind button focus fix**

## Performance

- **Duration:** 12 min
- **Started:** 2026-11-14T23:38:24Z
- **Completed:** 2026-11-14T23:50:41Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- Added `PinnedItemType`, `PinnedPlaylistItem`, `EngineSettings.pinned_playlists`, and `StatusResponse.context_uri` in `src/types.ts`, paired with `MAX_PINNED_PLAYLISTS = 4` and `_sanitize_pinned_playlists` in `py_modules/common.py`.
- Implemented `quick_play_pinned` in `py_modules/rpc_playback.py` and `main.py` with stopped-engine auto-wake (up to 4 × 300ms device polls), `liked_songs` URI resolution, and shuffle-state preservation, plus `set_setting("pinned_playlists", ...)` max-4 rejection without auto-eviction.
- Reorganized `src/index.tsx` QAM layout so Now Playing, Seek, Transport Controls, and the horizontal `<Focusable flow-children="horizontal">` Pinned Playlist Pills strip sit at the top, replaced the `Bind current music to game` `DialogButton` `borderColor` override with `<ButtonItem>`, and grouped secondary controls behind a collapsible `Controls & Settings` toggle when playing.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end QAM pinned playlist persistence, quick_play_pinned RPC, and QAM pill strip** - `0c2b575` (feat)
2. **Task 2: Add Python unit tests for pinned_playlists persistence and quick_play_pinned** - `1132290` (test)
3. **Task 3: Reorganize QAM layout, fix Bind button focus highlight, and extend src/index.test.tsx** - `4e26edd` (feat)

## Files Created/Modified
- `src/types.ts` - Exported `PinnedItemType`, `PinnedPlaylistItem`, and added `pinned_playlists` / `context_uri` fields.
- `py_modules/common.py` - Added `MAX_PINNED_PLAYLISTS = 4`, `DEFAULT_SETTINGS["pinned_playlists"]`, and `_sanitize_pinned_playlists`.
- `py_modules/rpc_playback.py` - Added `quick_play_pinned` with engine auto-wake and liked_songs/context playback.
- `main.py` - Exposed `quick_play_pinned`, validated `pinned_playlists` in `set_setting`, and added `"pinned_playlists"` to `get_status` `public_keys`.
- `src/index.tsx` - Added horizontal pinned pills strip with `DeckifyImage` thumbnails, optimistic highlight + rollback toast, reorganized QAM layout, and `Bind current music to game` focus fix.
- `tests/test_pinned_playlists.py` - Added 7 unit tests covering sanitization, max-4 cap, engine auto-wake, playlist/album playback, and liked_songs playback.
- `src/index.test.tsx` - Extended to 5 Vitest tests covering 0-pinned hidden, 1–4 pills, `DeckifyImage` usage, optimistic rollback + toast, `Bind` focus fix, and collapsible secondary controls.

## Decisions Made
- Replaced the `Bind current music to game` `DialogButton` (which had a conflicting inline `borderColor` override) with `@decky/ui`'s `<ButtonItem>` so SteamOS GamepadUI's native controller focus highlight renders cleanly.
- Grouped secondary QAM controls (`Playback Device`, `In-Game Overlay (HUD)`, `librespot Engine` toggle, `Open Deckify (Full Screen)`) behind a collapsible `Controls & Settings` toggle when a track is playing, while keeping `Open Deckify (Full Screen)` and `librespot Engine` directly visible when no track is playing.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Initial `test_pinned_playlists.py` import of `main` inside `patch.dict("sys.modules", ...)` caused `py -m unittest discover` to re-import `main` and overwrite `common._MAIN_MODULE` after `test_e2e_requirements.py`; resolved by sharing `test_token_refresh.main` in `tests/test_pinned_playlists.py` (matching the existing pattern in other `tests/test_*.py` files), after which all 440 Python tests passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Backend persistence, `quick_play_pinned` RPC, and QAM pinned pills strip are complete and verified.
- Ready for Plan `09-02` (Pinning UI in `PlaylistsTab`, `AlbumsTab`, `LikedSongsTab`, and `TrackActionModal`).

## Self-Check: PASSED

- Created/modified files verified on disk (`src/types.ts`, `py_modules/common.py`, `py_modules/rpc_playback.py`, `main.py`, `src/index.tsx`, `tests/test_pinned_playlists.py`, `src/index.test.tsx`).
- All 3 task commits verified in git history (`0c2b575`, `1132290`, `4e26edd`).
- Full verification passed: `pnpm run typecheck`, `pnpm test` (15 files, 116 tests), `pnpm run build`, and `py -m unittest discover -s tests -p "test_*.py"` (440 tests).

---
*Phase: 09-qam-pinned-playlists-quick-in-game-switch*
*Completed: 2026-11-14*
