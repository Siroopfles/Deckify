# Roadmap: Deckify

## Overview

Milestone v0.5 elevates Deckify from a standalone media controller into an intelligent in-game audio companion for Steam Deck and SteamOS GamepadUI. This roadmap delivers smooth local PipeWire volume ducking during game transitions and active voice chat, game-specific Spotify soundtrack automation tied to Steam `appId` lifecycle events, handheld-optimized L2/R2 controller trigger seeking and fast list paging, instant 2-second QAM pinned playlist switching, a zero-overhead live synced lyrics line in the floating Gamescope HUD, and a dedicated Home / Discovery Hub tab powered by hardened, cached Spotify Web API personalization endpoints.

## Milestones

- ✅ **v0.4: Stability, Polish & Refactoring** - Phases 1-5 (shipped 2026-11-12) — [Full Archive](file:///C:/Users/djdje/Deckify/.planning/milestones/v0.4-ROADMAP.md)
- 🚧 **v0.5: In-Game Flow & Music Discovery** - Phases 6-11 (in progress)

## Completed Milestones

<details>
<summary>✅ v0.4: Deckify Stability, Polish & Refactoring (Phases 1-5) - SHIPPED 2026-11-12</summary>

- [x] **Phase 1: Architecture & Monolith Decoupling** — Decoupled monolithic `DeckifyExpandedModal.tsx` and `main.py` into modular, isolated submodules with zero regressions.
- [x] **Phase 2: Artwork & Image Pipeline Stabilization** — Base64 image caching & concurrency throttling queue bypassing Steam CEF CSP domain restrictions.
- [x] **Phase 3: Live Playback Ticker & Gamepad Seekbar Scrubbing** — Monotonic playback clock ticker (`usePlaybackClock`), drift gating, and debounced seekbar scrubbing.
- [x] **Phase 4: Queue Navigation & Live State Synchronization** — Queue direct track selection with explicit sliced URIs sequence and Now Playing card.
- [x] **Phase 5: In-Game HUD Overlay Restoration** — Gamescope floating overlay with `pointerEvents: "none"`, auto-hide timer, pause grace, progress bar, and direct QAM controls.

*Archived in:* [.planning/milestones/v0.4-ROADMAP.md](file:///C:/Users/djdje/Deckify/.planning/milestones/v0.4-ROADMAP.md)

</details>

---

## Phases

**Milestone v0.5: In-Game Flow & Music Discovery**

- [x] **Phase 6: Smooth Audio Ducking Engine & PipeWire Fader** - Local non-blocking PipeWire volume fader for game transitions and active voice chat dipping
- [x] **Phase 7: Game-Specific Soundtracks (appId Linking & Lifecycle Automation)** - Bind Spotify playlists/albums to Steam games with auto-play and state restore (completed 2026-11-14)
- [x] **Phase 8: Controller L2/R2 Ergonomics & Trigger Navigation** - Blind ±10s seeking and virtualized library fast-page navigation via analog triggers (completed 2026-11-14)
- [x] **Phase 9: QAM Pinned Playlists & Quick In-Game Switch** - Instant 2-second playlist switching pills in the Quick Access Menu mini-player (completed 2026-11-15)
- [x] **Phase 10: In-Game HUD Overlay 2.0 (Live Synced Lyrics)** - Micro-footprint discrete event-scheduled synced lyrics line in Gamescope HUD (completed 2026-11-15)
- [x] **Phase 11: Home & Discovery Hub Tab** - Dedicated Discovery tab in Expanded Modal with Top Tracks, Top Artists, and algorithmic mixes (completed 2026-11-15)
- [x] **Phase 11.1: Address tech debt: v0.5 integration & metadata cleanup** (completed 2026-11-15)

---

## Phase Details

### Phase 6: Smooth Audio Ducking Engine & PipeWire Fader
**Goal**: Provide smooth, non-blocking volume transitions during game launches and active voice chat without audible pops or Spotify API rate-limit penalties.  
**Mode**: mvp  
**Depends on**: Phase 5 (concluded in v0.4)  
**Requirements**: DUCK-01, DUCK-02  
**Success Criteria** (what must be TRUE):
  1. Music playback smoothly attenuates down over a gradual 1.0–1.5s cosine curve when game audio starts or games launch, eliminating abrupt volume drops.
  2. Music playback gently restores to the pre-ducked volume level over 1.0–1.5s when games close or voice activity ceases.
  3. Active voice chat streams (Discord, Steamcord, Steam Voice) detected via `pactl list source-outputs` automatically trigger ducking with 1.2–1.5s silence hold hysteresis to eliminate volume pumping.
  4. Volume adjustments are applied purely locally to the `librespot`/`spotifyd` audio sink via PipeWire `pactl set-sink-input-volume` with zero Spotify Web API calls and 0ms network latency.
**Plans**: 2/2 plans complete

Plans:
**Wave 1**
- [x] 06-01-PLAN.md — Implement non-blocking VolumeFader in py_modules/volume.py with cosine easing, single sink-input resolution, 3s exit debounce, and QAM Ducked pill badge

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 06-02-PLAN.md — Implement VoiceActivityDetector with 1.2s silence hold hysteresis and interactive audio ducking settings card in SettingsTab.tsx

### Phase 7: Game-Specific Soundtracks (appId Linking & Lifecycle Automation)
**Goal**: Automatically trigger configured Spotify soundtrack playlists or albums upon game launch and cleanly restore normal listening state on exit.  
**Mode**: mvp  
**Depends on**: Phase 6  
**Requirements**: SOUND-01, SOUND-02, SOUND-03  
**UI hint**: yes  
**Success Criteria** (what must be TRUE):
  1. User can link a Spotify playlist, album, or URI to any installed Steam game `appId` in Deckify settings with an auto-play preference toggle.
  2. Launching an associated Steam game automatically triggers playback of its configured soundtrack after a 3–5s launcher debounce window.
  3. Exiting the game cleanly restores the user's pre-game playback context, track, and seek position (or pauses playback if preferred).
  4. Non-Steam shortcuts (normalized via unsigned 32-bit CRC32 conversion) and intermediate Proton launcher child processes do not trigger false launch/exit flapping.
**Plans**: 3/3 plans complete

Plans:
**Wave 1**
- [x] 07-01-PLAN.md — Build VDF parser with CRC32 AppID normalization, SoundtrackManager engine with 3.5s launch / 3.0s exit debounce, pre-game state snapshots, and playback seek offset support.

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 07-02-PLAN.md — Implement SoundtracksTab, PlaylistPickerModal, QAM 1-click quick-binding button, and in-game AppLifetime notification dispatch.

**Wave 3** *(gap closure — blocked on Wave 2)*
- [x] 07-03-PLAN.md — Close UAT gaps 1-4: Steam CDN image proxy + FaGamepad fallback, PlaylistPickerModal via showModal() + playlist URIs, bubble-phase vgp_oncancel for sliders, and GameSessions AppLifetime + MainRunningApp seed.

### Phase 8: Controller L2/R2 Ergonomics & Trigger Navigation
**Goal**: Allow players to scrub playback position and fast-page through long library lists using controller analog triggers without losing D-pad navigation focus.  
**Mode**: mvp  
**Depends on**: Phase 7  
**Requirements**: CTRL-01, CTRL-02, CTRL-03  
**UI hint**: yes  
**Success Criteria** (what must be TRUE):
  1. Pulling L2 or R2 in Now Playing or Lyrics tabs executes a blind -10s or +10s playback seek without shifting D-pad focus away from active UI controls.
  2. Pulling L2 or R2 in library views (Liked Songs, Playlists, Albums, Artists) jumps ±15 items or jumps across alphabetical letter anchors in virtualized lists.
  3. Trigger activation enforces Schmidt hysteresis (0.75 trigger press / 0.25 release) and 300ms software debounce, preventing analog trigger chatter and runaway seeking.
  4. Trigger handlers are strictly active only when the Deckify Expanded Modal is open, preventing interference with in-game controls.
**Plans**: 5/5 plans complete

Plans:
**Wave 1**
- [x] 08-01-PLAN.md — Build modal-scoped TriggerController with Schmidt hysteresis (0.75/0.25), 300ms debounce, hold-to-repeat, reliable Y/X/L2/R2 dispatch in DeckifyExpandedModal, and pinned Back to Steam (B) footer in Sidebar.

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 08-02-PLAN.md — Wire accumulated 250ms L2/R2 seeking into Now Playing/Lyrics, floating pill, hint bar, and SettingsTab SliderField/ToggleField controls.

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 08-03-PLAN.md — Implement computeListJump (±N paging & A-Z anchor jumps), content-focus guard, scroll+focus transfer, and row tagging across all library list tabs.

**Wave 1 (Gap Closure)**
- [x] 08-04-PLAN.md — Close UAT gaps 1–3: native `div` `contentPaneRef` wrapper for library fast-paging, `SEEK_ACCUMULATION_WINDOW_MS = 600` for consecutive L2/R2 seek accumulation, `TrackActionModal` initial focus transfer/restore, and `toggle_like_track` 403 Forbidden error toast & handling.
- [x] 08-05-PLAN.md — Close UAT Test 3 gap: expose `data-deckify-focused` and default `tabIndex={0}` on `InteractiveRow`, detect virtual GamepadUI focus in `DeckifyExpandedModal` `onTrigger`, and verify `playlists` mode fast-paging & Sidebar suppression.

### Phase 9: QAM Pinned Playlists & Quick In-Game Switch
**Goal**: Allow players to switch to their favorite playlists in under 2 seconds directly from the Steam Quick Access Menu without opening the full-screen modal.  
**Mode**: mvp  
**Depends on**: Phase 8  
**Requirements**: QAM-01, QAM-02  
**UI hint**: yes  
**Success Criteria** (what must be TRUE):
  1. User can pin up to 3–4 playlists or albums to appear as compact horizontal pill buttons in the Quick Access Menu mini-player.
  2. Selecting any pinned playlist pill in QAM begins playback within 2 seconds without leaving the running game.
  3. Pinned playlist buttons display cached base64 thumbnails that render instantly without Steam CEF CSP image blocking or UI hitching.
  4. User can pin or unpin playlists easily via a context action inside the expanded Library views.
**Plans**: 3/3 plans complete

Plans:
- [x] 09-01-PLAN.md — Persist pinned_playlists (max 4), implement quick_play_pinned engine-waking RPC, reorganize QAM layout with horizontal pinned pills strip, and fix Bind button focus highlight
- [x] 09-02-PLAN.md — Add CollectionActionModal (Y menu) and detail-header FaThumbtack Pin/Unpin controls with non-evicting max-4 limit across PlaylistsTab, AlbumsTab, and LikedSongsTab
- [x] 09-03-PLAN.md — Close UAT gaps G-09-1 and G-09-2: harden PlaylistsTab detail header + visible Mix button state, and replace QAM DialogButton pills with focus-tracked PinnedPill + padded strip

### Phase 10: In-Game HUD Overlay 2.0 (Live Synced Lyrics)
**Goal**: Render a subtle, real-time synced lyrics line beneath the track info in the floating Gamescope HUD overlay without dropping in-game frame rates.  
**Mode**: mvp  
**Depends on**: Phase 9  
**Requirements**: HUD-03, HUD-04  
**UI hint**: yes  
**Success Criteria** (what must be TRUE):
  1. Gamescope HUD overlay displays the current active synced lyric line with smooth cross-fade animation beneath the artist title when lyrics are available.
  2. Lyrics in the HUD update using discrete event-scheduled timestamp timeouts (`setTimeout`) rather than continuous millisecond clock polling, preserving 60/90 FPS in demanding games.
  3. Overlay container strictly preserves `pointerEvents: "none"` so gameplay and touchscreen inputs never stall or get blocked.
  4. User can toggle overlay lyrics on or off from the Quick Access Menu and configure a lyrics latency offset slider (-2000ms to +2000ms).
**Plans**: 3/3 plans complete

Plans:
**Wave 1**
- [x] 10-01-PLAN.md — Implement discrete `setTimeout` synced lyric scheduler, fixed-height cross-fade row, modal-open suppression, strict autohide + configurable duration, and backend settings persistence/clamping

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 10-02-PLAN.md — Wire QAM Overlay Lyrics toggle, SettingsTab Auto-Hide Duration & Latency Offset sliders, and clickable LyricsTab source pills

**Wave 1 (Gap Closure)**
- [x] 10-03-PLAN.md — Close UAT gaps G-10-1 and G-10-2: expose Phase 10 & Phase 08 settings in `main.py:get_status()`, merge settings in `DeckifyOverlayWrapper`, and add optimistic/event-synced state in `SettingsTab`

### Phase 11: Home & Discovery Hub Tab
**Goal**: Provide a dedicated Discovery tab in the expanded modal for exploring personalized Spotify recommendations, algorithmic mixes, and top music.  
**Mode**: mvp  
**Depends on**: Phase 10  
**Requirements**: DISC-01, DISC-02, DISC-03  
**UI hint**: yes  
**Success Criteria** (what must be TRUE):
  1. Expanded modal includes a new "Discovery" / "Made For You" tab accessible via controller D-pad tab navigation.
  2. Discovery tab displays curated carousels for user Top Tracks, Top Artists (with short/medium/long-term filters), Discover Weekly, Release Radar, and New Releases.
  3. Selecting any track or mix in the Discovery tab starts immediate playback or drills down into the album/playlist view.
  4. Backend Spotify client handles HTTP 429 rate limits gracefully with an exponential backoff circuit breaker and caches discovery feeds for 1–6 hours in memory to ensure snappy navigation.
**Plans**: 2/2 plans complete

Plans:
**Wave 1**
- [x] 11-01-PLAN.md — Harden `py_modules/spotify.py` with HTTP 429 circuit breaker, bump `CURRENT_SCOPES_VERSION = 7` (`user-top-read`), and implement TTL-cached `get_discovery_feed` in `py_modules/rpc_library.py` & `main.py`

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 11-02-PLAN.md — Register `discovery` tab in `src/types.ts` & `Sidebar.tsx`, build `DiscoveryTab.tsx` with 4 horizontal carousels & time-range pills, and wire idle landing + `A`/`Y` actions in `DeckifyExpandedModal.tsx`

---

## Progress

**Execution Order:**
Phases execute in numeric order: 6 → 7 → 8 → 9 → 10 → 11

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|:--------------:|:------:|:---------:|
| 6. Smooth Audio Ducking Engine & PipeWire Fader | v0.5 | 2/2 | Complete    | 2026-11-12 |
| 7. Game-Specific Soundtracks | v0.5 | 3/3 | Complete    | 2026-11-14 |
| 8. Controller L2/R2 Ergonomics & Trigger Navigation | v0.5 | 5/5 | Complete    | 2026-11-14 |
| 9. QAM Pinned Playlists & Quick In-Game Switch | v0.5 | 3/3 | Complete    | 2026-11-15 |
| 10. In-Game HUD Overlay 2.0 (Live Synced Lyrics) | v0.5 | 3/3 | Complete    | 2026-11-15 |
| 11. Home & Discovery Hub Tab | v0.5 | 2/2 | Complete    | 2026-11-15 |

---

## Backlog & Future Milestones

See [.planning/IDEAS.md](file:///C:/Users/djdje/Deckify/.planning/IDEAS.md) for the full **Deckify Master Feature & Upgrade Plan** (38+ structured ideas across 5 strategic pillars):
1. **Audio, PipeWire & Playback (EQ-01, DOCK-01):** Parametric 10-band PipeWire DSP biquad equalizer filter chain, auto dock audio switching (USB-DAC/HDMI), in-game cutscene auto-pause, crossfade, BPM badges, podcast speed/chapters, gentle sleep timer fade, local music/Steam soundtrack library.
2. **In-Game Integration, Chords & Overlays:** Configureerbare chords + haptics, peek mode for HUD, Search/Queue gamepad shortcuts, live Steam menu position switcher.
3. **Chrome DevTools Protocol (CDP), Library & Lyrics (CDP-01, QUEUE-03):** Offline downloads via `OfflineAPI`, interactive queue reordering and clearing via CDP `PlayerAPI`, real Spotify synced LRC data via CDP, bilingual/karaoke NetEase lyrics, Spotify Canvas video-loops, custom playlist folders UI, in-playlist filter/sort, podcast drilldown.
4. **UI, Visuals & TV / Steam Machine Experience:** Split-view TV / Steam Machine 10-foot mode (Now Playing + Lyrics side-by-side), Spotify Jam QR-code, live audio ambient glow/spectrum visualizer, dynamic cover color theming, virtualized lists for 1000+ items, multi-language internationalization (i18n).
5. **System, Power-Management, Smarthome & Diagnostics:** Event-driven librespot (`--onevent`), Pocket Mode (screen off / audio on), battery eco-switch, suspend bookmark restore, Wi-Fi reconnect watchdog, MPRIS2 D-Bus bridge for bluetooth headsets, local webhook/MQTT smart home events, 1-click Flatpak installer, multi-account switcher, cache storage dashboard, live diagnostics log viewer in UI.

### Phase 11.1: Address tech debt: v0.5 integration & metadata cleanup (INSERTED)

**Goal:** Close all four actionable v0.5 milestone audit tech-debt items: gate game-exit audio ducking on `running` so the 3000ms exit debounce is respected, enforce `suppressedRef.current` in `useTriggerNavigation` and wire `PlaylistPickerModal` suppression, backfill `requirements-completed` in Phase 06 summaries (`DUCK-01`, `DUCK-02`), and clean stale pre-fix lines in `07-VERIFICATION.md`.
**Requirements**: DUCK-01, DUCK-02
**Depends on:** Phase 11
**Plans:** 1/1 plans complete

Plans:
- [x] 11.1-01-PLAN.md — Fix game-exit ducking debounce & PlaylistPickerModal controller suppression, backfill Phase 06 summary metadata, and clean Phase 07 verification body text

### Phase 999.1: Follow-up — Phase 09 deferred UAT follow-up: Test 2 (BACKLOG)

**Goal:** Resolve the UAT checkpoint deferred during Phase 09 verification
**Source phase:** 09
**Deferred at:** 2026-11-15 during /gsd-verify-work 09 session completion
**Follow-ups:**
- [ ] Test 2: QAM UX/styling verbeteren en ooit kijken naar hoe Steamcord is gemaakt en hoe zij dit aanpakken (deferred 2026-11-15)
