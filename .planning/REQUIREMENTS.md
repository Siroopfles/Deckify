# Requirements: Milestone v0.5 In-Game Flow & Music Discovery

**Defined:** 2026-11-12  
**Milestone:** v0.5  
**Core Value:** Rock-solid Spotify playback and responsive, reliable controller navigation on Steam Deck without UI lag, broken images, or desynchronized playback states.  

---

## v0.5 Requirements

### Audio Ducking & Voice Awareness
- [ ] **DUCK-01**: User experiences a smooth, gradual volume fade (~1.0–1.5s) via local PipeWire/PulseAudio sink-input volume when a game launches or closes, eliminating abrupt volume jumps.
- [ ] **DUCK-02**: User experiences automatic volume ducking when active microphone or voice chat streams (Discord, Steamcord, Steam Voice) are detected, with decay hold hysteresis.

### Game-Specific Soundtracks
- [ ] **SOUND-01**: User can bind a Spotify playlist or album to a specific Steam game `appId` in Deckify settings with custom auto-play preference.
- [ ] **SOUND-02**: User experiences automatic soundtrack playback upon game launch via `SteamClient.Apps.RegisterForAppLifetimeNotifications` with launcher debounce (3-5s).
- [ ] **SOUND-03**: User experiences seamless restoration of their pre-game playback state (or automatic pause) when the game exits.

### Controller Ergonomics & Trigger Navigation
- [ ] **CTRL-01**: User can pull L2 or R2 triggers in playback views (`NowPlayingTab`, `LyricsTab`) to execute blind -10s or +10s seeking without losing D-pad controller focus.
- [ ] **CTRL-02**: User can pull L2 or R2 triggers in library lists (`LikedSongsTab`, `PlaylistsTab`, `AlbumsTab`, `ArtistsTab`) to jump ±15 items or alphabet sections.
- [ ] **CTRL-03**: Triggers enforce Schmidt hysteresis (0.75 activate, 0.25 reset) and are strictly scoped to the open modal to prevent in-game input conflicts.

### Quick Access Menu Enhancements
- [ ] **QAM-01**: User can configure 3-4 pinned playlists to display as compact pill buttons in the QAM mini-player.
- [ ] **QAM-02**: User can click any pinned playlist in the QAM to start playback within 2 seconds without opening the full-screen modal.

### In-Game HUD Overlay 2.0
- [ ] **HUD-03**: User can enable an active synced lyrics line displayed beneath the artist title in the floating Gamescope HUD overlay.
- [ ] **HUD-04**: Overlay lyrics update via discrete event-scheduled timestamps rather than continuous clock polling, preserving 60/90 FPS in games and strictly enforcing `pointerEvents: "none"`.

### Home & Discovery Hub
- [ ] **DISC-01**: User can navigate to a dedicated "Discovery" / "Made For You" tab in the expanded modal to browse personalized Spotify recommendations.
- [ ] **DISC-02**: User can browse and play their Top Tracks, Top Artists (short/medium/long term), personalized algorithmic mixes (Discover Weekly, Release Radar), and New Releases.
- [ ] **DISC-03**: Discovery feed requests are cached with an in-memory TTL and protected by an HTTP 429 rate-limit circuit breaker.

---

## Future Requirements (Backlog)
- **EQ-01**: Parametric 10-band PipeWire DSP biquad equalizer filter chain.
- **CDP-01**: Native Spotify CDP offline downloads via `OfflineAPI`.
- **QUEUE-03**: Interactive queue reordering and clearing via CDP `PlayerAPI`.
- **DOCK-01**: Automatic audio sink switching to external USB-DAC/HDMI dock.

---

## Out of Scope
| Feature | Reason |
|---------|--------|
| Spotify Web API volume stepping | Causes severe HTTP 429 rate limits and 200ms latency; ducking must be 100% local via PipeWire. |
| Global L2/R2 hooks during active gameplay | Triggers would interfere with in-game aiming and shooting; triggers are strictly scoped to open modal. |
| Continuous clock ticker in Gamescope HUD | Frequent transparent DOM redraws degrade GPU framerates in AAA games; lyrics in HUD are event-scheduled. |

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|:------:|
| DUCK-01 | Phase 6 | Pending |
| DUCK-02 | Phase 6 | Pending |
| SOUND-01 | Phase 7 | Pending |
| SOUND-02 | Phase 7 | Pending |
| SOUND-03 | Phase 7 | Pending |
| CTRL-01 | Phase 8 | Pending |
| CTRL-02 | Phase 8 | Pending |
| CTRL-03 | Phase 8 | Pending |
| QAM-01 | Phase 9 | Pending |
| QAM-02 | Phase 9 | Pending |
| HUD-03 | Phase 10 | Pending |
| HUD-04 | Phase 10 | Pending |
| DISC-01 | Phase 11 | Pending |
| DISC-02 | Phase 11 | Pending |
| DISC-03 | Phase 11 | Pending |

**Coverage:**
- v0.5 requirements: 15 total
- Mapped to phases: 15
- Unmapped: 0
