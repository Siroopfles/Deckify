# Deckify

## What This Is

Deckify is an open-source Spotify client and Decky Loader plugin for Valve's Steam Deck. It allows users to control Spotify playback directly inside SteamOS GamepadUI with controller navigation, Quick Access Menu controls, an overlay HUD, and a full-screen modal for browsing playlists, albums, artists, library, and podcasts.

## Core Value

Rock-solid Spotify playback and responsive, reliable controller navigation on Steam Deck without UI lag, broken images, or desynchronized playback states.

## Requirements

### Validated

<!-- Shipped and confirmed capabilities inferred from existing codebase -->

- ✓ Steam Decky Loader plugin integration with frontend-backend RPC via `@decky/api` — existing
- ✓ Spotify OAuth2 authentication flow via local redirect handler — existing
- ✓ Headless background playback engines support (`librespot` / `spotifyd`) — existing
- ✓ Nine-tab GamepadUI full-screen modal structure (Now Playing, Playlists, Liked, Albums, Artists, Recent, Podcasts, Equalizer, Settings) — existing
- ✓ SteamOS PulseAudio/PipeWire volume synchronization — existing
- ✓ Base64 image caching architecture to bypass Steam CEF Content Security Policy — existing

### Active

<!-- Current scope for this milestone: stability, live runtime fixes, and modular refactoring -->

- [ ] **Fix Cover Art & Image Loading**: Resolve failing image loading for artists, playlists, tracks, and podcasts caused by Steam CEF CSP / base64 caching bottlenecks.
- [ ] **Fix Queue Selection & Sync**: Ensure selecting a track in the queue plays the correct item and updates queue/playback state live.
- [ ] **Fix Live Now Playing Progress Ticker**: Keep elapsed track time and playback state updating continuously in real time.
- [ ] **Enable Seek Bar Scrubbing**: Allow intuitive seeking/scrubbing on the Now Playing progress bar using gamepad/D-pad controls.
- [ ] **Fix HUD Overlay**: Restore functionality and visibility of the Deckify in-game HUD overlay.
- [ ] **Refactor Frontend Modal (`DeckifyExpandedModal.tsx`)**: Modularize the monolithic 1,600+ line component into dedicated subcomponents under `src/components/tabs/`.
- [ ] **Refactor Backend Entry Point (`main.py`)**: Modularize the monolithic 2,600+ line file into focused modules under `py_modules/` (RPC routing, process supervision, volume monitoring).

### Out of Scope

- Rewriting the playback daemon from scratch — existing librespot/spotifyd integration works and should be preserved.
- Non-SteamOS platforms — Deckify is dedicated to Steam Deck / SteamOS GamepadUI.
- Video podcast streaming — Spotify video streaming is unsupported by headless Connect daemons.

## Context

- While existing unit test suites pass (316 backend tests and frontend Vitest suites), real-world SteamOS CEF and controller behavior exhibits desynchronization, broken image rendering, and unresponsive HUD/progress UI.
- Both frontend (`DeckifyExpandedModal.tsx`) and backend (`main.py`) are monolithic files, increasing cognitive load and regression risk when fixing runtime bugs.

## Constraints

- **Steam CEF Content Security Policy**: Steam GamepadUI blocks direct external image URLs (`https://i.scdn.co/`), requiring internal proxying/base64 encoding.
- **SteamOS GamepadUI Navigation**: Controller focus relies on spatial navigation (`flow-children`, `@decky/ui`); focus traps or navigation loss degrade user experience.
- **Steam Deck Environment**: Runs in the `deck` user space (UID 1000) under SteamOS 3.5+.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Refactor both frontend and backend monoliths | Both `DeckifyExpandedModal.tsx` and `main.py` create severe friction for fixing live state and image bugs | — Pending |
| Prioritize live playback and image fixes | User experience on hardware depends on seeing artwork, live progress, and reliable queue navigation | — Pending |

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
*Last updated: 2026-11-10 after initialization*
