# Requirements: Deckify Stability, Polish & Refactoring

**Defined:** 2026-11-10  
**Core Value:** Rock-solid Spotify playback and responsive, reliable controller navigation on Steam Deck without UI lag, broken images, or desynchronized playback states.  

## v1 Requirements

### Architecture & Refactoring
- [ ] **ARCH-01**: Refactor monolithic `DeckifyExpandedModal.tsx` (~2,959 LOC) into clean, modular components under `src/components/tabs/` and `src/components/common/` while preserving full feature parity and zero regression in test suites.
- [ ] **ARCH-02**: Refactor monolithic `main.py` (~2,600 LOC) into focused backend modules under `py_modules/` (separating RPC routing, volume management, process supervision, and image fetching) while keeping all 316 unit tests passing.

### Media & Artwork (CEF CSP Compatibility)
- [x] **IMG-01**: Expand image URL validation and proxying in `py_modules/images.py` to support all Spotify CDN variants (`image-cdn-ak.spotifycdn.com`, `mosaic.scdn.co`, `seeded-session-images.scdn.co`) and podcast cover hosts.
- [x] **IMG-02**: Add concurrency throttling (max 4-6 concurrent fetches) and an in-memory cache to `DeckifyImage` to eliminate RPC threadpool starvation and prevent Spotify HTTP 429 rate limit backoffs.

### Playback & Time Synchronization
- [ ] **PLAY-01**: Implement smooth real-time Now Playing elapsed time ticker interpolated with local clock timestamps (`Date.now()`) so progress counts up seamlessly every second without freezing or jitter.
- [ ] **PLAY-02**: Enable gamepad D-pad and controller scrubbing on the Now Playing seek bar using `@decky/ui` focusable controls, allowing stepping forward/backward in track position.
- [ ] **PLAY-03**: Bind Now Playing progress bar and time labels to the live interpolated position state rather than stale backend polling snapshots.

### Queue Management
- [x] **QUEUE-01**: Fix track selection in the Queue view so clicking/selecting any queue item starts playback of that exact track.
- [x] **QUEUE-02**: Ensure selecting a queue track immediately updates the Now Playing view and re-synchronizes the upcoming queue list in real time.

### In-Game HUD Overlay
- [ ] **HUD-01**: Ensure the Deckify in-game HUD overlay mounts reliably in Steam GamepadUI gamescope, respects the settings toggle, and auto-hides or displays according to configuration.
- [ ] **HUD-02**: Correctly resolve and render album artwork and playback state indicators (playing/paused) in the HUD overlay.

## v2 Requirements
- **LYRIC-01**: Offline lyrics caching for recently played tracks.
- **AUDIO-01**: Multi-room Spotify Connect target switching directly from quick access menu.
- **EQUAL-01**: Custom 10-band equalizer presets saved per game.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Rewriting audio engine daemon | Existing `librespot` and `spotifyd` integration is stable; focus is on UI/IPC reliability. |
| Non-SteamOS platforms | Deckify is specifically designed for Valve's Steam Deck and SteamOS GamepadUI. |
| Video podcast playback | Headless Spotify Connect daemons do not support Spotify DRM video streaming. |

## Traceability

Which phases cover which requirements. Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ARCH-01 | Phase 1 | Complete |
| ARCH-02 | Phase 1 | Complete |
| IMG-01 | Phase 2 | Complete |
| IMG-02 | Phase 2 | Complete |
| PLAY-01 | Phase 3 | Pending |
| PLAY-02 | Phase 3 | Pending |
| PLAY-03 | Phase 3 | Pending |
| QUEUE-01 | Phase 4 | Complete |
| QUEUE-02 | Phase 4 | Complete |
| HUD-01 | Phase 5 | Pending |
| HUD-02 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 11 total
- Mapped to phases: 11
- Unmapped: 0

---
*Requirements defined: 2026-11-10*  
*Last updated: 2026-11-10 after initialization*
