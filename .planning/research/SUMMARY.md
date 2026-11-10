# Project Research Summary

**Project:** Deckify  
**Domain:** SteamOS Decky Loader Plugin / Steam CEF / Spotify Client  
**Researched:** 2026-11-10  
**Confidence:** HIGH  

## Executive Summary

Deckify provides Spotify integration into Valve's Steam Deck GamepadUI via Decky Loader. The application has strong existing fundamentals—authenticated Spotify Web API integration, background Connect playback engines (`librespot` / `spotifyd`), and a full 9-tab browsing modal. However, hardware usage reveals notable runtime defects: cover images intermittently fail due to CEF CSP & RPC bottlenecks, Now Playing elapsed time doesn't tick live, seek bar scrubbing cannot be controlled via gamepad, queue track selection jumps to wrong songs, and the in-game HUD overlay fails to display.

These issues are exacerbated by two monolithic files: `src/components/DeckifyExpandedModal.tsx` (~2,959 LOC) and `main.py` (~2,600 LOC). Refactoring these into modular subcomponents and focused Python modules is essential to make bugfixes testable, maintainable, and free of regression risks.

The recommended roadmap structure directly addresses these issues by decoupling monoliths first (or in tandem with their corresponding functional subsystems) so fixes are applied cleanly to modular code.

## Key Findings

### Recommended Stack
- **Frontend**: React 19, TypeScript, `@decky/ui` (4.11.1), `@decky/api` (1.1.3), Vitest.
- **Backend**: Python 3.11+, standard library `urllib` with multi-domain image validation, LRU disk cache, and modular RPC router.
- **Platform**: SteamOS 3.5+ GamepadUI Chromium Embedded Framework (CEF), PipeWire / PulseAudio.

### Expected Features

**Must have (table stakes):**
- Reliable cover art loading across artists, playlists, albums, and podcasts with zero CEF CSP blocks.
- Real-time Now Playing elapsed time ticker and smooth gamepad-controlled seek bar scrubbing.
- Accurate queue track selection that starts playback of the selected song and updates queue state.
- Working in-game HUD overlay showing current track, artist, artwork, and play state.
- Clean modular component structure for both frontend and backend.

### Architecture Approach
1. **Frontend Refactoring**: Extract tabs from `DeckifyExpandedModal.tsx` into `src/components/tabs/` (`NowPlayingTab`, `QueueTab`, `PlaylistsTab`, `LikedSongsTab`, `AlbumsTab`, `ArtistsTab`, `RecentTab`, `PodcastsTab`, `SettingsTab`), extracting `DeckifyImage` and `ProgressBar` into shared components.
2. **Backend Refactoring**: Extract RPC logic and subsystems from `main.py` into `py_modules/` (`volume.py`, `images.py`, `playback.py`, `library.py`).

### Critical Pitfalls
1. **CEF CSP & Threadpool Starvation**: Rapid burst of image requests over Decky RPC must be limited and cached in-memory.
2. **Gamepad Spatial Navigation**: Avoid raw DOM keyboard event handlers (`ArrowLeft`/`ArrowRight`); use Decky's focus-aware components.
3. **Timer Desynchronization**: Interpolate elapsed track time with local clock timestamps rather than relying exclusively on infrequent polling snapshots.

## Implications for Roadmap

### Suggested Phases

- **Phase 1: Architecture Modularization (Frontend & Backend)**
  - Decouple `DeckifyExpandedModal.tsx` into `src/components/tabs/` and `src/components/common/`.
  - Decouple `main.py` RPC routes and helpers into `py_modules/`.
  - Maintain all existing functionality and ensure all tests continue to pass.

- **Phase 2: Image Pipeline & CEF CSP Fixes**
  - Broaden domain validation in `images.py` to cover all Spotify and podcast CDNs.
  - Implement concurrent request throttling and in-memory caching in `DeckifyImage`.
  - Verify artwork loads reliably across all tabs.

- **Phase 3: Live Playback Ticker & Gamepad Seekbar Scrubbing**
  - Implement smooth real-time timer interpolation in Now Playing view.
  - Fix progress bar data binding to use live position instead of stale snapshot.
  - Add gamepad D-pad / stick scrubbing to the seek bar.

- **Phase 4: Queue Track Selection & Live State Sync**
  - Fix queue track click handler and backend `play_tracks` offset / URI logic.
  - Synchronize currently playing track and remaining queue list on selection.

- **Phase 5: In-Game HUD Overlay Restoration**
  - Fix settings persistence and global component mounting for `DeckifyOverlay`.
  - Ensure correct artwork schema extraction and gamescope visibility.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Codebase map and live inspect confirmed all versions and constraints |
| Features | HIGH | Exact user pain points mapped to code locations |
| Architecture | HIGH | Monolithic file structures inspected; clean component split identified |
| Pitfalls | HIGH | CEF, GamepadUI, and Web API specifics verified |

**Overall confidence:** HIGH

---
*Research completed: 2026-11-10*  
*Ready for roadmap: yes*
