# Phase 1 Summary: Plan 01-02 - Backend Monolith Decomposition

## Overview
Decomposed the monolithic `main.py` (~2,665 LOC) into focused, single-responsibility submodules under `py_modules/` while maintaining 100% test compatibility across all 316 Python unit tests and 100% backward compatibility with Decky frontend RPC callables.

## Changes Made
1. **PulseAudio & PipeWire Submodule (`py_modules/volume.py`)**:
   - Extracted sink-input enumeration, volume setting, 150% volume boost (`boost_pa_volume`), equalizer preset dispatch, and PipeWire clock synchronization (`configure_pipewire_clock`).
   - Standardized error handling and logging.

2. **System & Client Management Submodule (`py_modules/system.py`)**:
   - Extracted sleep timer background worker (`start_sleep_timer`, `_sleep_timer_worker`), system shutdown execution, client window status, and OAuth authentication status checks.

3. **Playback RPC Submodule (`py_modules/rpc_playback.py`)**:
   - Extracted `control_playback`, `play_tracks`, `seek_playback`, `set_shuffle`, `set_repeat`, `get_queue`, `add_to_queue`, `get_devices`, `transfer_playback`, and `toggle_like_track`.
   - Extracted `check_tracks_liked` and `annotate_tracks_liked` caching helpers.
   - Handled mock-aware delegation to `plugin._auto_transfer_and_play`, `plugin._check_tracks_liked`, and `plugin._annotate_tracks_liked`.

4. **Library & Content RPC Submodule (`py_modules/rpc_library.py`)**:
   - Extracted `get_playlists`, `get_playlist_tracks`, `add_track_to_playlist`, `remove_track_from_playlist`, `create_playlist`, `get_playlist_folders`, `manage_playlist_folder`, `set_native_playlist_mix`, `sync_native_spotify_folders`.
   - Extracted `get_liked_tracks`, `get_saved_albums`, `get_album_tracks`, `get_followed_artists`, `get_artist_albums`, `get_artist_top_tracks`, `get_saved_episodes`, `get_saved_shows`, `get_recently_played`, `search_spotify`, `get_track_recommendations`, `get_lyrics`, and `get_image`.
   - Maintained full liked-track chunk annotation on all track-returning endpoints.

5. **Common Helper Resiliency (`py_modules/common.py` & `main.py`)**:
   - Implemented mock-delegation guards for `_exec` and `_save_settings` so tests that patch `main._exec` or `main._save_settings` cleanly intercept calls across all submodules without causing infinite recursion or missing mock assertions.

6. **Refactored `main.py`**:
   - Reduced from 2,665 LOC down to 1,421 LOC.
   - Acts as the central plugin router and process supervisor for librespot and the official Spotify flatpak, delegating all RPC calls cleanly to `py_modules`.

## Verification
- **Python Unit Tests**: All 316 unit tests passed cleanly (`Ran 316 tests in 16.815s, OK`).
- **Frontend Typecheck**: `pnpm typecheck` passed (0 errors).
- **Frontend Unit Tests**: `pnpm test` passed (7/7 tests passed).
- **Frontend Production Bundle**: `pnpm build` completed cleanly (`created dist in 8.1s`).
