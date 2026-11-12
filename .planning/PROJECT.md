# Deckify

## What This Is

Deckify is an open-source Spotify client and Decky Loader plugin for Valve's Steam Deck. It allows users to control Spotify playback directly inside SteamOS GamepadUI with controller navigation, Quick Access Menu controls, an overlay HUD, and a full-screen modal for browsing playlists, albums, artists, library, and podcasts.

## Core Value

Rock-solid Spotify playback and responsive, reliable controller navigation on Steam Deck without UI lag, broken images, or desynchronized playback states.

## Current State

- **Current Version:** v0.4 (shipped 2026-11-12)
- **Active Milestone:** v0.5 — In-Game Flow & Music Discovery
- **Codebase Health:** Clean modular architecture (`src/components/tabs/`, `py_modules/`), 100% test coverage across 55 Vitest frontend tests and 325 Python backend tests, zero TypeScript errors.

## Requirements

### Validated

<!-- Shipped and confirmed capabilities from prior milestones -->

- ✓ Steam Decky Loader plugin integration with frontend-backend RPC via `@decky/api` — existing
- ✓ Spotify OAuth2 authentication flow via local redirect handler — existing
- ✓ Headless background playback engines support (`librespot` / `spotifyd`) — existing
- ✓ Full-screen modal structure with standalone tab views and shared components — shipped in v0.4 (Phase 1)
- ✓ Backend modularization into focused submodules in `py_modules/` — shipped in v0.4 (Phase 1)
- ✓ Base64 image caching & concurrency throttling queue bypassing Steam CEF CSP — shipped in v0.4 (Phase 2)
- ✓ Live monotonic playback clock ticker (`usePlaybackClock`) with drift gating — shipped in v0.4 (Phase 3)
- ✓ D-pad controller seekbar scrubbing with focus halo and post-seek suppression — shipped in v0.4 (Phase 3)
- ✓ Queue direct track selection with sliced URIs sequence & Now Playing elevation — shipped in v0.4 (Phase 4)
- ✓ In-game HUD overlay with gamescope mounting, `pointerEvents: "none"`, 6s auto-hide, 3.5s pause grace, 2px progress bar, and direct QAM controls — shipped in v0.4 (Phase 5)
- ✓ Smooth Audio Ducking & Voice/Steamcord Awareness — PipeWire VolumeFader with cosine easing and VAD silence hold (Phase 6)

### Active

<!-- Scope for Milestone v0.5: In-Game Flow & Music Discovery -->

- [ ] **Game-Specific Soundtracks (`appId` linking)**: Bind Spotify playlist/album to Steam game `appId`. Auto-play upon launch notification and pause/restore upon exit.
- [ ] **Quick Access Menu Pinned Playlists**: Direct 3-4 pinned/favorite playlist buttons in QAM mini-player for 2-second mid-game switching.
- [ ] **L2/R2 Controller Trigger Seeking & Fast List Skipping**: Blind +/-10s seek via triggers in modal views without focusing seekbar, and alphabet/page jumps in long lists.
- [ ] **In-Game Overlay 2.0 (Live Lyrics Line)**: Subtle active synced lyrics line displayed beneath the artist in the gamescope HUD overlay.
- [ ] **Home / Made For You Discovery Tab**: Dedicated Discovery tab in Expanded Modal for Discover Weekly, Release Radar, Daylist, and user top tracks/artists.

### Out of Scope

- Rewriting the playback daemon from scratch — existing librespot/spotifyd integration works and should be preserved.
- Non-SteamOS platforms — Deckify is dedicated to Steam Deck / SteamOS GamepadUI.
- Video podcast streaming — Spotify video streaming is unsupported by headless Connect daemons.

## Constraints

- **Steam CEF Content Security Policy**: Steam GamepadUI blocks direct external image URLs (`https://i.scdn.co/`), requiring internal proxying/base64 encoding.
- **SteamOS GamepadUI Navigation**: Controller focus relies on spatial navigation (`flow-children`, `@decky/ui`); focus traps or navigation loss degrade user experience.
- **Steam Deck Environment**: Runs in the `deck` user space (UID 1000) under SteamOS 3.5+.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Refactor both frontend and backend monoliths | Both `DeckifyExpandedModal.tsx` and `main.py` created severe friction for fixing live state and image bugs | ✓ Shipped in Phase 1 |
| Concurrency-throttled base64 image queue with LRU cache | Steam CEF CSP blocks external CDN URLs; unthrottled RPC fetches starved threadpools | ✓ Shipped in Phase 2 |
| Monotonic clock interpolation with post-seek suppression | Eliminates seekbar rubberbanding and stutters while minimizing heavy polling RPCs | ✓ Shipped in Phase 3 |
| Sliced URIs sequence for queue selection | Spotify server expects remaining sequence when selecting offset in dynamic queues | ✓ Shipped in Phase 4 |
| Strict `pointerEvents: "none"` on gamescope HUD | In-game overlay must never intercept controller or touchscreen input from running games | ✓ Shipped in Phase 5 |
| 100% Local PipeWire sink-input volume fader with cosine easing | Eliminates Spotify Web API cloud latency, avoids 429 rate limits, and provides click-free smooth transitions | ✓ Shipped in Phase 6 |

---
*Last updated: 2026-11-12 after Phase 6*
