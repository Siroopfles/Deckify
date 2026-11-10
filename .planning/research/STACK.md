# Stack Research: Steam Deck, Decky Loader & Spotify Integration

**Domain:** SteamOS Plugin (Decky Loader), Steam CEF, Spotify Web API & Connect Daemons  
**Researched:** 2026-11-10  
**Confidence:** HIGH  

## Executive Summary

Deckify operates across three distinct execution layers:
1. **Frontend UI**: React 19 / TypeScript / `@decky/ui` (4.11.1) running in SteamOS Chromium Embedded Framework (CEF).
2. **Backend Plugin RPC**: Python 3.11+ running inside the Decky Loader daemon process on SteamOS, communicating with frontend via `@decky/api` (JSON-RPC).
3. **Audio Playback**: Headless Spotify Connect daemons (`librespot` or `spotifyd`) or official Spotify desktop client managed via PipeWire/PulseAudio.

## Key Stack Findings & Best Practices

### 1. Steam CEF Image Handling & Content Security Policy (CSP)
- **Constraint**: SteamOS GamepadUI CEF enforces a strict Content Security Policy blocking direct external HTTP/HTTPS network image loads (`https://i.scdn.co/`, `spotifycdn.com`, `podcast` hosts).
- **Solution in Deckify**: Python backend fetches images, caches them to disk (`~/.cache/deckify/images/`), and serves them via RPC as Base64 Data URIs (`data:image/jpeg;base64,...`).
- **Required Optimization**: 
  - Add domain whitelist expansion to `_validate_image_url` (support podcast CDNs and secondary Spotify domains like `image-cdn-ak.spotifycdn.com`, `mosaic.scdn.co`, `seeded-session-images.scdn.co`).
  - Introduce frontend in-flight deduplication and batch prefetching so 50+ cover requests don't exhaust Python's threadpool or RPC buffer.

### 2. GamepadUI D-Pad Spatial Navigation & Focus Management
- **Constraint**: `@decky/ui` uses spatial navigation heuristics rather than standard keyboard DOM focus. Custom `div` wrappers without `Focusable` or with incorrect `flow-children` attributes trap focus or fail to capture D-pad inputs.
- **Seekbar Scrubbing**: D-pad left/right scrubbing on progress bars must use `@decky/ui` interactive components (e.g. `SliderField` or explicit `Focusable` with gamepad action callbacks) rather than raw DOM keyboard listeners (`ArrowLeft`/`ArrowRight`), which are eaten by SteamOS GamepadUI.

### 3. Decky In-Game HUD Overlay (`routerHook.addGlobalComponent`)
- **Constraint**: Decky Loader's global components are rendered in Steam's overlay CEF layer. If `settings.overlay_enabled` is default false, or if position styles conflict with Steam's notification toast area or gamescope surface, the overlay remains invisible.
- **Track Metadata Schema**: Spotify Web API track payloads nest album art in `item.album.images[0].url`, while internal events may use `artwork_url` or `image_url`. The overlay must safely normalize both schemas.

### 4. Modular Refactoring Architecture
- **Frontend (`src/components/DeckifyExpandedModal.tsx`)**: Monolithic 2,959 lines must be decoupled into tab components under `src/components/tabs/` (`NowPlayingTab.tsx`, `QueueTab.tsx`, `PlaylistsTab.tsx`, `LikedSongsTab.tsx`, `AlbumsTab.tsx`, `ArtistsTab.tsx`, `RecentTab.tsx`, `PodcastsTab.tsx`, `SettingsTab.tsx`). Shared state (playback status, active tracks) managed via custom hooks or React Context.
- **Backend (`main.py`)**: Monolithic 2,600+ lines must be modularized into `py_modules/` (`rpc_routes.py`, `playback.py`, `system.py`, `volume.py`), keeping `main.py` strictly as the Decky `Plugin` lifecycle entry point.

---
*Stack research compiled for Deckify milestone planning.*
