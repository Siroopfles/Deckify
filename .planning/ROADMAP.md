# Roadmap: Deckify

## Milestones

- ✅ **v0.4: Stability, Polish & Refactoring** — Phases 1-5 (shipped 2026-11-12) — [Full Archive](file:///C:/Users/djdje/Deckify/.planning/milestones/v0.4-ROADMAP.md)
- ✅ **v0.5: In-Game Flow & Music Discovery** — Phases 6-12 (shipped 2026-11-15) — [Full Archive](file:///C:/Users/djdje/Deckify/.planning/milestones/v0.5-ROADMAP.md)

## Phases

<details>
<summary>✅ v0.4: Deckify Stability, Polish & Refactoring (Phases 1-5) — SHIPPED 2026-11-12</summary>

- [x] **Phase 1: Architecture & Monolith Decoupling** — Decoupled monolithic `DeckifyExpandedModal.tsx` and `main.py` into modular, isolated submodules with zero regressions.
- [x] **Phase 2: Artwork & Image Pipeline Stabilization** — Base64 image caching & concurrency throttling queue bypassing Steam CEF CSP domain restrictions.
- [x] **Phase 3: Live Playback Ticker & Gamepad Seekbar Scrubbing** — Monotonic playback clock ticker (`usePlaybackClock`), drift gating, and debounced seekbar scrubbing.
- [x] **Phase 4: Queue Navigation & Live State Synchronization** — Queue direct track selection with explicit sliced URIs sequence and Now Playing card.
- [x] **Phase 5: In-Game HUD Overlay Restoration** — Gamescope floating overlay with `pointerEvents: "none"`, auto-hide timer, pause grace, progress bar, and direct QAM controls.

*Archived in:* [.planning/milestones/v0.4-ROADMAP.md](file:///C:/Users/djdje/Deckify/.planning/milestones/v0.4-ROADMAP.md)

</details>

<details>
<summary>✅ v0.5: In-Game Flow & Music Discovery (Phases 6-12) — SHIPPED 2026-11-15</summary>

- [x] **Phase 6: Smooth Audio Ducking Engine & PipeWire Fader** (2/2 plans) — Local non-blocking PipeWire volume fader for game transitions and active voice chat dipping (completed 2026-11-12)
- [x] **Phase 7: Game-Specific Soundtracks (appId Linking & Lifecycle Automation)** (3/3 plans) — Bind Spotify playlists/albums to Steam games with auto-play and state restore (completed 2026-11-14)
- [x] **Phase 8: Controller L2/R2 Ergonomics & Trigger Navigation** (5/5 plans) — Blind ±10s seeking and virtualized library fast-page navigation via analog triggers (completed 2026-11-14)
- [x] **Phase 9: QAM Pinned Playlists & Quick In-Game Switch** (3/3 plans) — Instant 2-second playlist switching pills in the Quick Access Menu mini-player (completed 2026-11-15)
- [x] **Phase 10: In-Game HUD Overlay 2.0 (Live Synced Lyrics)** (3/3 plans) — Micro-footprint discrete event-scheduled synced lyrics line in Gamescope HUD (completed 2026-11-15)
- [x] **Phase 11: Home & Discovery Hub Tab** (2/2 plans) — Dedicated Discovery tab in Expanded Modal with Top Tracks, Top Artists, and algorithmic mixes (completed 2026-11-15)
- [x] **Phase 11.1: Address tech debt: v0.5 integration & metadata cleanup** (1/1 plan) — Fixed game-exit ducking debounce, PlaylistPickerModal suppression, and audit metadata (completed 2026-11-15)
- [x] **Phase 12: Resolve open todos & polish** (3/3 plans) — Resolved all 20 pending todos and archived 3 resolved debug sessions across playback, HUD/ducking, Non-Steam covers, and UX (completed 2026-11-15)

*Archived in:* [.planning/milestones/v0.5-ROADMAP.md](file:///C:/Users/djdje/Deckify/.planning/milestones/v0.5-ROADMAP.md)

</details>

---

## Backlog & Future Milestones

See [.planning/IDEAS.md](file:///C:/Users/djdje/Deckify/.planning/IDEAS.md) for the full **Deckify Master Feature & Upgrade Plan** (38+ structured ideas across 5 strategic pillars):
1. **Audio, PipeWire & Playback (EQ-01, DOCK-01):** Parametric 10-band PipeWire DSP biquad equalizer filter chain, auto dock audio switching (USB-DAC/HDMI), in-game cutscene auto-pause, crossfade, BPM badges, podcast speed/chapters, gentle sleep timer fade, local music/Steam soundtrack library.
2. **In-Game Integration, Chords & Overlays:** Configureerbare chords + haptics, peek mode for HUD, Search/Queue gamepad shortcuts, live Steam menu position switcher.
3. **Chrome DevTools Protocol (CDP), Library & Lyrics (CDP-01, QUEUE-03):** Offline downloads via `OfflineAPI`, interactive queue reordering and clearing via CDP `PlayerAPI`, real Spotify synced LRC data via CDP, bilingual/karaoke NetEase lyrics, Spotify Canvas video-loops, custom playlist folders UI, in-playlist filter/sort, podcast drilldown.
4. **UI, Visuals & TV / Steam Machine Experience:** Split-view TV / Steam Machine 10-foot mode (Now Playing + Lyrics side-by-side), Spotify Jam QR-code, live audio ambient glow/spectrum visualizer, dynamic cover color theming, virtualized lists for 1000+ items, multi-language internationalization (i18n).
5. **System, Power-Management, Smarthome & Diagnostics:** Event-driven librespot (`--onevent`), Pocket Mode (screen off / audio on), battery eco-switch, suspend bookmark restore, Wi-Fi reconnect watchdog, MPRIS2 D-Bus bridge for bluetooth headsets, local webhook/MQTT smart home events, 1-click Flatpak installer, multi-account switcher, cache storage dashboard, live diagnostics log viewer in UI.

### Phase 999.1: Follow-up — Phase 09 deferred UAT follow-up: Test 2 (BACKLOG)

**Goal:** Resolve the UAT checkpoint deferred during Phase 09 verification
**Source phase:** 09
**Deferred at:** 2026-11-15 during /gsd-verify-work 09 session completion
**Follow-ups:**
- [ ] Test 2: QAM UX/styling verbeteren en ooit kijken naar hoe Steamcord is gemaakt en hoe zij dit aanpakken (deferred 2026-11-15)
