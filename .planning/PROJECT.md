# Deckify

## What This Is

Deckify is an open-source Spotify client and Decky Loader plugin for Valve's Steam Deck. It allows users to control Spotify playback directly inside SteamOS GamepadUI with controller navigation, Quick Access Menu controls, an overlay HUD, and a full-screen modal for browsing playlists, albums, artists, library, and podcasts.

## Core Value

Rock-solid Spotify playback and responsive, reliable controller navigation on Steam Deck without UI lag, broken images, or desynchronized playback states.

## Current State

- **Current Version:** v0.5 (shipped 2026-11-15)
- **Active Milestone:** None (run `/gsd-new-milestone` to plan next milestone)
- **Codebase Health:** Modular TypeScript frontend (`src/`, 13,995 LOC) and Python backend (`main.py` + `py_modules/`, 5,776 LOC), 458 Python `unittest` tests, 152 Vitest tests across 16 files, zero TypeScript errors, zero ESLint errors.

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
- ✓ Smooth Audio Ducking & Voice/Steamcord Awareness — PipeWire VolumeFader with cosine easing, VAD silence hold, and custom attenuation/fade sliders — shipped in v0.5 (Phases 6, 11.1, 12)
- ✓ Game-Specific Soundtracks (`appId` linking) — VDF/CRC32 AppID normalization, 3.5s/3.0s debounce, pre-game state snapshot & restore, Non-Steam local grid covers — shipped in v0.5 (Phases 7, 12)
- ✓ L2/R2 Controller Trigger Seeking & Fast List Skipping — Modal-scoped Schmidt hysteresis (0.75/0.25), 600ms seek accumulation, ±15/A-Z list paging, and controller focus hardening — shipped in v0.5 (Phases 8, 11.1, 12)
- ✓ Quick Access Menu Pinned Playlists — Up to 4 non-evicting pinned playlists as QAM pills with engine-waking <2s playback switching — shipped in v0.5 (Phases 9, 12)
- ✓ In-Game Overlay 2.0 (Live Synced Lyrics) — Discrete `setTimeout` event-scheduled synced lyrics line in Gamescope HUD with configurable auto-hide & latency offset — shipped in v0.5 (Phases 10, 12)
- ✓ Home / Discovery Hub Tab — Controller-first Discovery tab with Top Tracks, Top Artists, Made For You, New Releases, TTL caching, and HTTP 429 circuit breaker — shipped in v0.5 (Phase 11)

### Active

(None — run `/gsd-new-milestone` to define next milestone requirements)

### Out of Scope

- Rewriting the playback daemon from scratch — existing librespot/spotifyd integration works and should be preserved.
- Non-SteamOS platforms — Deckify is dedicated to Steam Deck / SteamOS GamepadUI.
- Video podcast streaming — Spotify video streaming is unsupported by headless Connect daemons.
- Spotify Web API volume stepping — causes severe HTTP 429 rate limits and 200ms latency; ducking is 100% local via PipeWire.
- Global L2/R2 hooks during active gameplay — triggers would interfere with in-game controls; trigger navigation is strictly scoped to the open modal.
- Continuous clock ticker in Gamescope HUD — frequent transparent DOM redraws degrade GPU framerates; HUD lyrics are discrete event-scheduled.

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
| VDF parser with CRC32 AppID normalization & 3.5s/3.0s debounce | Prevents Non-Steam shortcut ID mismatches and Proton launcher flapping | ✓ Shipped in Phase 7 |
| Modal-scoped TriggerController with 0.75/0.25 Schmidt hysteresis & DOM fast-paging | Prevents analog trigger chatter and in-game interference while preserving D-pad focus | ✓ Shipped in Phase 8 |
| Non-evicting 4-item QAM pinned playlists with engine-waking `quick_play_pinned` | Enables <2s mid-game playlist switching directly from Steam QAM | ✓ Shipped in Phase 9 |
| Discrete `setTimeout` synced lyrics scheduler in Gamescope HUD | Preserves 60/90 FPS in games with zero continuous clock polling | ✓ Shipped in Phase 10 |
| Global HTTP 429 circuit breaker & section-isolated TTL caching for Discovery | Protects Spotify Web API quota while keeping Discovery navigation snappy | ✓ Shipped in Phase 11 |
| Auto-wake stopped librespot on `play_tracks` 404 & base64 Non-Steam grid covers | Fixes cold-start playback failures and Steam CEF CSP grid artwork blocking | ✓ Shipped in Phase 12 |

---
*Last updated: 2026-11-15 after v0.5 milestone*
