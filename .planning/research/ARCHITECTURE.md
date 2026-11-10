# Architecture Research: Modular Refactoring Strategy

**Domain:** Decky Loader Plugin Architecture (Frontend React / Backend Python)  
**Researched:** 2026-11-10  
**Confidence:** HIGH  

## Current Architecture Bottlenecks

### 1. `src/components/DeckifyExpandedModal.tsx` (~2,959 LOC)
- Combines 9 full tabs, action modals, sidebar, header, audio controls, lyrics viewer, image cache, and keyboard/gamepad event handlers in one gigantic component.
- All state hooks live in the top-level component, causing re-renders of the entire modal on every 1-second ticker or status change.

### 2. `main.py` (~2,600 LOC)
- Contains all `@decky/api` RPC methods, threadpool wrappers, process supervision, PulseAudio polling, Spotify token refreshing, lyrics scraping, and image caching in one file.

## Target Architecture

### Frontend Architecture: Component Decomposition
```
src/
├── components/
│   ├── DeckifyExpandedModal.tsx   # Shell: Sidebar navigation, Header, Tab router (<300 LOC)
│   ├── DeckifyOverlay.tsx         # HUD in-game overlay
│   ├── common/                    # Shared UI primitives
│   │   ├── DeckifyImage.tsx       # Standalone cached image component
│   │   ├── InteractiveRow.tsx
│   │   ├── ProgressBar.tsx        # Self-contained ticking & scrubbable seekbar
│   │   └── TrackActionModal.tsx   # Context menu for tracks
│   └── tabs/                      # Independent views
│       ├── NowPlayingTab.tsx      # Album art, lyrics waterfall, controls
│       ├── QueueTab.tsx           # Live queue list & track activation
│       ├── PlaylistsTab.tsx       # Folders & playlist grid
│       ├── LikedSongsTab.tsx      # Liked tracks with pagination
│       ├── AlbumsTab.tsx          # Saved albums
│       ├── ArtistsTab.tsx         # Followed artists
│       ├── RecentTab.tsx          # Recently played
│       ├── PodcastsTab.tsx        # Shows & episodes
│       └── SettingsTab.tsx        # Engine & overlay configuration
├── hooks/
│   ├── usePlaybackStatus.ts       # Centralized playback state & ticker hook
│   └── useImageLoader.ts
└── services/
    └── rpc.ts                     # Type-safe Decky RPC callables
```

### Backend Architecture: Python Module Separation
```
py_modules/
├── __init__.py
├── common.py                      # Constants, paths, SSL context
├── auth.py                        # OAuth redirect server & token exchange
├── spotify.py                     # Spotify Web API client
├── engine.py                      # librespot / spotifyd daemon management
├── device.py                      # Hardware device discovery
├── images.py                      # Multi-domain image fetcher & LRU cache
├── volume.py                      # PulseAudio / PipeWire volume listener
└── rpc/                           # Modular RPC dispatchers
    ├── __init__.py
    ├── playback_routes.py         # play, pause, seek, queue, shuffle, repeat
    ├── library_routes.py          # playlists, albums, artists, liked songs
    └── system_routes.py           # engine status, sinks, overlay settings
main.py                            # Clean Decky Plugin entrypoint (<250 LOC)
```

---
*Architecture research compiled for Deckify milestone planning.*
