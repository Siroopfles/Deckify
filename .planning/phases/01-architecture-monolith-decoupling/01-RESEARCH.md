# Phase 1: Architecture & Monolith Decoupling - Research

**Researched:** 2026-11-10  
**Domain:** Codebase Modularization & Refactoring (React / TypeScript / Python Decky Plugin)  
**Confidence:** HIGH  

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Decompose `DeckifyExpandedModal.tsx` views into standalone components under `src/components/tabs/` (`NowPlayingTab`, `QueueTab`, `PlaylistsTab`, `LikedSongsTab`, `AlbumsTab`, `ArtistsTab`, `RecentTab`, `PodcastsTab`, `SettingsTab`).
- **D-02:** Share playback state via a custom hook (`usePlaybackStatus`) and pass explicit props to tabs rather than wrapping in an overarching React Context to prevent unnecessary modal-wide re-renders during 1-second progress ticks.
- **D-03:** Extract shared UI primitives into `src/components/common/` (`DeckifyImage.tsx`, `InteractiveRow.tsx`, `TrackActionModal.tsx`, `Sidebar.tsx`).
- **D-04:** Break down `main.py` by extracting RPC router endpoints and domain helpers into `py_modules/` (`rpc_playback.py`, `rpc_library.py`, `volume.py`, `system.py`).
- **D-05:** Maintain `main.py` strictly as the thin Decky `Plugin` lifecycle entrypoint (`_main`, `_stop`, RPC method registration).
- **D-06:** Enforce strict step-by-step verification: after each tab or module extraction, run TypeScript typecheck (`pnpm typecheck`), Vitest (`pnpm test`), Rollup build (`pnpm build`), and the full backend test suite (`python -m unittest discover tests`, 316 tests) to guarantee zero regressions.

### the agent's Discretion
- Internal file naming and granular helper functions inside `py_modules/`.
- Prop interfaces for individual tab components.

### Deferred Ideas (OUT OF SCOPE)
- Rewriting audio backend daemons (`librespot` / `spotifyd`).
- Modifying UI layouts or adding new features before monoliths are decoupled.

</user_constraints>

<architectural_responsibility_map>
## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Modal Views & Navigation | Frontend (React/Decky UI) | — | Rendered within CEF GamepadUI |
| Shared UI Primitives | Frontend (React/Decky UI) | — | Reused across modal tabs and in-game overlay |
| RPC Route Dispatch | Backend (Python Decky RPC) | — | Maps frontend callables to domain services |
| Volume & Sinks Management | Backend (Python pactl/PipeWire) | — | System-level audio manipulation on SteamOS |
| Process Supervision | Backend (Python subprocess) | — | Daemon lifecycle for librespot/spotifyd |

</architectural_responsibility_map>

## Implementation Strategy

### 1. Frontend Decomposition Plan (`src/components/`)
1. Create `src/components/common/`:
   - `InteractiveRow.tsx`: Focusable interactive list item with click/focus handlers.
   - `DeckifyImage.tsx`: Base64 image cache loader (extracted from `DeckifyExpandedModal.tsx:103-165`).
   - `TrackActionModal.tsx`: Context modal for track operations (Like, Add to Queue, Add to Playlist).
   - `Sidebar.tsx`: Sidebar navigation list.
2. Create `src/hooks/usePlaybackStatus.ts`:
   - Custom hook managing `status`, `refreshStatus`, `currentPositionMs`, and playback ticker.
3. Create `src/components/tabs/`:
   - `NowPlayingTab.tsx`
   - `QueueTab.tsx`
   - `PlaylistsTab.tsx`
   - `LikedSongsTab.tsx`
   - `AlbumsTab.tsx`
   - `ArtistsTab.tsx`
   - `RecentTab.tsx`
   - `PodcastsTab.tsx`
   - `SettingsTab.tsx`
4. Refactor `DeckifyExpandedModal.tsx`:
   - Clean shell (<300 LOC) that handles tab switching, header, modal wrapper, and mounts the active tab.

### 2. Backend Decomposition Plan (`py_modules/` & `main.py`)
1. Create `py_modules/rpc_playback.py`:
   - `control_playback`, `play_tracks`, `seek_playback`, `set_shuffle`, `set_repeat`, `toggle_like_track`, `get_queue`, `add_to_queue`.
2. Create `py_modules/rpc_library.py`:
   - `get_playlists`, `get_playlist_tracks`, `add_track_to_playlist`, `get_playlist_folders`, `manage_playlist_folder`, `set_native_playlist_mix`, `get_saved_albums`, `get_album_tracks`, `get_followed_artists`, `get_artist_top_tracks`, `get_saved_episodes`, `get_saved_shows`, `get_recently_played`.
3. Create `py_modules/volume.py`:
   - PulseAudio / PipeWire volume synchronization, `_get_pa_volume`, `_set_pa_volume_percent`, `_boost_pa_volume`.
4. Create `py_modules/system.py`:
   - Audio sink queries, system power off, sleep/resume hooks, client detection.
5. In `main.py`:
   - Delegate methods to `rpc_playback`, `rpc_library`, `volume`, and `system` so that all existing 316 unit tests continue calling `Plugin.<method>` without breaking.

## Verification Gates
- Frontend: `pnpm typecheck && pnpm test && pnpm build`
- Backend: `& "C:\Users\djdje\AppData\Local\Python\pythoncore-3.14-64\python.exe" -m unittest discover tests` (all 316 tests must pass).
