---
phase: 07-game-specific-soundtracks-appid-linking-lifecycle-automation
plan: 01
subsystem: backend
tags: [python, vdf, steam, spotify, asyncio, soundtrack]
requires: []
provides:
  - Stdlib binary/text VDF parser and installed game discovery (Steam + Non-Steam, 30s TTL cache)
  - SoundtrackManager (launch/exit debounce, snapshot/restore, manual-pause tracking, multi-playlist modes)
  - Soundtrack RPC endpoints and lifecycle dispatch in main.py
  - play_tracks position_ms support
affects: [phase-07 frontend plans]
actuals:
  tokens: 21000
  tasks: 4
  commits: 4
plan_head_before: 40c589d14f227198b9d4e3a538a8e41f82ea8650
plan_head_after: c912289
tech-stack:
  added: []
  patterns: [debounced asyncio task state machine, whitelist profile validation]
key-files:
  created: [py_modules/vdf_parser.py, py_modules/soundtrack.py, tests/test_vdf_parser.py, tests/test_soundtrack.py]
  modified: [py_modules/common.py, py_modules/rpc_playback.py, main.py]
key-decisions:
  - "Unbound games with policy 'pause' restore the pre-game snapshot on exit; keep_playing is a no-op"
  - "Shuffle mode with multiple playlists picks one pool entry at random with shuffle on (Spotify cannot merge contexts)"
  - "Added last_context_uri to profile so position resume only applies when the same context is chosen"
  - "Ducking override False skips game ducking in handle_app_lifetime_event"
status: complete
---

# Phase 07 Plan 01: Game Soundtrack Backend Core Summary

Backend core for game-specific soundtracks: pure-stdlib Steam VDF parsing with unsigned CRC AppIDs, plus a `SoundtrackManager` that debounces launch (3.5s) / exit (3.0s), snapshots and restores playback with ms-precision seek, and respects in-game manual pauses.

## Tasks
1. Tests: `tests/test_vdf_parser.py`, `tests/test_soundtrack.py` — a23ace1
2. `py_modules/vdf_parser.py` — 4ef4504
3. `py_modules/soundtrack.py` + soundtrack settings/sanitization in `common.py` — 9cd4822
4. `play_tracks(position_ms)`, `main.py` RPCs (`get_installed_games`, `get_game_soundtrack_profiles`, `save_/delete_game_soundtrack_profile`, `bind_current_music_to_game`, `handle_app_lifetime_event`), manual-pause hook in `control_playback`, manager lifecycle in `_main`/`_unload` — c912289

## Verification
`py -m unittest discover tests`: 424 tests OK (383 baseline + 41 new). Husky pre-commit (tsc, vitest, rollup build, Python tests) passed on every commit.

## Deviations from Plan
- **[Rule 3]** Plan references `plugin._make_spotify_request`/`get_player_state` which do not exist; the manager implements its own `get_player_state()` via `_spotify_api_request(me/player)`, and persists via `plugin._save_settings` or `common._save_settings`.
- **[Rule 3]** `VolumeFader.set_game_volume_override` does not exist; volume override uses `plugin.set_volume` and is reverted to the snapshot volume on exit; ducking override handled in `main.handle_app_lifetime_event`.
- **Process:** commits made on `main` (no worktree), as directed by the orchestrator. Test files were committed first while implementation was already in the working tree, so commit 1 only passes together with later commits.
- Early PowerShell edit corrupted `main.py` encoding; reverted via `git checkout -- main.py` before any commit and re-applied with Python (UTF-8).

## Threat Mitigations
T-07-01 (bounded parser, partial-result recovery, TTL cache), T-07-02 (app_id validated positive uint32, profile whitelist), T-07-03 (snapshots hold only URIs/ms/volume), T-07-SC (no new dependencies).

## Known Stubs
None.

## Self-Check: PASSED
