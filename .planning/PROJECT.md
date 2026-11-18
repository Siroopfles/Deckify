# Deckify

## What This Is

Deckify is an open-source Spotify client and Decky Loader plugin for Valve's Steam Deck. It allows users to control Spotify playback directly inside SteamOS GamepadUI with controller navigation, Quick Access Menu controls, an overlay HUD, and a full-screen modal for browsing playlists, albums, artists, library, and podcasts.

## Core Value

Rock-solid Spotify playback and responsive, reliable controller navigation on Steam Deck without UI lag, broken images, or desynchronized playback states.

## Current State

- **Current Version:** v0.6 — Audio DSP, Docked Flow & System Resilience (shipped 2026-11-18)
- **Codebase Health:** Modular TypeScript frontend (`src/`, 17,581 LOC) and Python backend (`main.py` + `py_modules/`, 11,028 LOC), 547 Python `unittest` tests, 175 Vitest tests across 16 files, zero TypeScript errors, zero ESLint errors.

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
- ✓ Spotify Library 403 Fix & Sink-Input Guardrails (`LIB-01`, `LIB-02`) — Migrated `/v1/me/library` & 40-URI `/v1/me/library/contains` with CDP `LibraryAPI` 403 fallback, plus centralized `resolve_spotify_sink_input_ids` allowlist/deny-list routing — shipped in v0.6 (Phase 13)
- ✓ Gentle Sleep Timer Fade-Out (`SLEEP-01`) — Smooth volume ramp-down via `VolumeFader` with `"sleep"` priority lock before pause and baseline restore — shipped in v0.6 (Phase 14)
- ✓ Real PipeWire Biquad Equalizer (`EQ-01`, `EQ-02`) — Isolated `pipewire -c` 10-band biquad `filter-chain` DSP with 7 presets, live `pw-cli` updates, and `SettingsTab` sliders — shipped in v0.6 (Phase 15)
- ✓ Automatic Docked Audio-Switching (`DOCK-01`, `DOCK-02`) — `pactl subscribe` hotplug watcher for USB-DAC/HDMI sinks with `bit_perfect_clock` management and lossless undock preservation — shipped in v0.6 (Phases 16, 18.1)
- ✓ Event-Driven `librespot` & Suspend/Wi-Fi Resilience (`RESIL-01`, `RESIL-02`) — `<5ms` `--onevent` `AF_UNIX` push updates, 20s/3s adaptive polling, and unified wake-lock `SessionBookmarkManager` — shipped in v0.6 (Phase 17)
- ✓ MPRIS2 D-Bus Bridge (`MPRIS-01`) — Pure-Python UID 1000 `org.mpris.MediaPlayer2.deckify` service with BlueZ `mpris-proxy` supervision for Bluetooth headsets — shipped in v0.6 (Phase 18)

### Active

<!-- Populated when starting the next milestone via /gsd-new-milestone -->

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
| `/v1/me/library` migration + centralized `resolve_spotify_sink_input_ids` | Fixes Spotify Web API 403 on track likes and isolates Deckify streams from `steamwebhelper`/game audio | ✓ Shipped in Phase 13 |
| Priority-locked `VolumeFader` sleep fade-out with drain & baseline restore | Prevents game/voice ducking from interrupting sleep fade-out and avoids muted next sessions | ✓ Shipped in Phase 14 |
| Isolated `pipewire -c` 10-band biquad `filter-chain` with `pw-cli` coalescing | Applies real-time EQ to Deckify only without restarting system PipeWire or crackling | ✓ Shipped in Phase 15 |
| `pactl subscribe` hotplug switcher with lossless `bit_perfect_clock` preservation | Routes Deckify streams to USB-DAC/HDMI docks automatically without hijacking game audio or resetting lossless handheld clocks | ✓ Shipped in Phases 16, 18.1 |
| `<5ms` `--onevent` `AF_UNIX` push server & single-lock `SessionBookmarkManager` | Eliminates tight Web API polling and dual-restart races on Steam Deck sleep/Wi-Fi recovery | ✓ Shipped in Phase 17 |
| Pure-Python stdlib D-Bus wire-protocol `MprisBridge` under UID 1000 | Avoids C-extension `LD_LIBRARY_PATH` conflicts in Decky Loader while enabling Bluetooth AVRCP | ✓ Shipped in Phase 18 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-11-18 after v0.6 milestone*
