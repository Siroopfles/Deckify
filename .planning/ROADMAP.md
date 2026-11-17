# Roadmap: Deckify

## Milestones

- ✅ **v0.4: Stability, Polish & Refactoring** — Phases 1-5 (shipped 2026-11-12) — [Full Archive](.planning/milestones/v0.4-ROADMAP.md)
- ✅ **v0.5: In-Game Flow & Music Discovery** — Phases 6-12 (shipped 2026-11-15) — [Full Archive](.planning/milestones/v0.5-ROADMAP.md)
- 🚧 **v0.6: Audio DSP, Docked Flow & System Resilience** — Phases 13-18 (in progress)

## Phases

<details>
<summary>✅ v0.4: Deckify Stability, Polish & Refactoring (Phases 1-5) — SHIPPED 2026-11-12</summary>

- [x] **Phase 1: Architecture & Monolith Decoupling** — Decoupled monolithic `DeckifyExpandedModal.tsx` and `main.py` into modular, isolated submodules with zero regressions.
- [x] **Phase 2: Artwork & Image Pipeline Stabilization** — Base64 image caching & concurrency throttling queue bypassing Steam CEF CSP domain restrictions.
- [x] **Phase 3: Live Playback Ticker & Gamepad Seekbar Scrubbing** — Monotonic playback clock ticker (`usePlaybackClock`), drift gating, and debounced seekbar scrubbing.
- [x] **Phase 4: Queue Navigation & Live State Synchronization** — Queue direct track selection with explicit sliced URIs sequence and Now Playing card.
- [x] **Phase 5: In-Game HUD Overlay Restoration** — Gamescope floating overlay with `pointerEvents: "none"`, auto-hide timer, pause grace, progress bar, and direct QAM controls.

*Archived in:* [.planning/milestones/v0.4-ROADMAP.md](.planning/milestones/v0.4-ROADMAP.md)

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

*Archived in:* [.planning/milestones/v0.5-ROADMAP.md](.planning/milestones/v0.5-ROADMAP.md)

</details>

### 🚧 v0.6: Audio DSP, Docked Flow & System Resilience (Active)

- [x] **Phase 13: Like Button 403 Fix & Sink-Input Guardrails** - Migrate track liking to `/v1/me/library` with CDP fallback and isolate sink-input routing strictly to Deckify streams. (completed 2026-11-16)
- [x] **Phase 14: Gentle Sleep Timer Fade-Out** - Smoothly ramp playback volume to 0% over a configurable fade-out window before pausing and restoring baseline volume. (completed 2026-11-17)
- [x] **Phase 15: Real PipeWire Biquad Equalizer** - Isolated `pipewire -c` `filter-chain` DSP equalizer with presets and live 5-band custom sliders. (completed 2026-11-17)
- [x] **Phase 16: Automatic Docked Audio-Switching** - Automatic USB-DAC/HDMI sink hotplug switching for Deckify streams with `bit_perfect_clock` management. (completed 2026-11-17)
- [ ] **Phase 17: Event-Driven librespot & Suspend/Wi-Fi Resilience** - Local `--onevent` Unix socket push updates, relaxed fallback polling, and unified suspend/Wi-Fi bookmark recovery.
- [ ] **Phase 18: MPRIS2 D-Bus Bridge** - Register `org.mpris.MediaPlayer2.deckify` on the `deck` user D-Bus for Bluetooth headset AVRCP playback and metadata.

## Phase Details

### Phase 13: Like Button 403 Fix & Sink-Input Guardrails
**Goal**: Users can reliably like/unlike tracks without HTTP 403 errors, and Deckify audio routing strictly isolates Spotify/Deckify streams from Steam UI and game audio.
**Depends on**: Nothing (first phase of v0.6)
**Requirements**: LIB-01, LIB-02
**Success Criteria** (what must be TRUE):
  1. User can like and unlike tracks in the Expanded Modal and QAM without triggering HTTP 403 Forbidden errors, and liked-heart indicators accurately reflect saved library state.
  2. Batch liked-status checks handle playlists and queues of any size (>40 tracks) without exceeding Spotify's `/v1/me/library/contains` URI limit.
  3. When `spotify_client` is active and Web API returns 403, liking/unliking falls back cleanly to CDP `LibraryAPI`.
  4. Deckify sink-input routing and volume fader resolution only target `librespot`, `com.spotify.client`, or `deckify_eq_out` streams and never move or mute `steamwebhelper`, `Chromium`, or running game audio streams.
**Plans:** 2/2 plans complete

Plans:
**Wave 1**
- [x] 13-01-PLAN.md — Migrate track liking & batch checks to `/v1/me/library` with CDP `LibraryAPI` 403 fallback

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 13-02-PLAN.md — Centralize `resolve_spotify_sink_input_ids` allowlist/deny-list guardrails for `_set_pactl_sink_input` and `VolumeFader`

### Phase 14: Gentle Sleep Timer Fade-Out
**Goal**: Expiring sleep timers gently fade playback volume to zero before pausing and cleanly restore baseline volume afterward.
**Depends on**: Phase 13
**Requirements**: SLEEP-01
**Success Criteria** (what must be TRUE):
  1. When the sleep timer expires with fade-out enabled, Deckify smoothly ramps playback volume down to 0% over the configured fade-out window (default 30s) before pausing playback.
  2. Active game or voice ducking events cannot interrupt or override an in-progress sleep timer fade-out.
  3. After playback pauses and audio drains, Deckify restores the pre-fade baseline volume (including before `shutdown_on_finish` poweroff) so the next session does not start muted or pop loudly.
  4. Cancelling an active sleep timer during fade-out immediately aborts the fade and restores baseline volume.
**Plans**: TBD

### Phase 15: Real PipeWire Biquad Equalizer
**Goal**: Users can shape Deckify's audio output in real time using preset or custom 5-band PipeWire biquad EQ without disrupting game or Steam UI audio.
**Depends on**: Phase 13
**Requirements**: EQ-01, EQ-02
**Success Criteria** (what must be TRUE):
  1. User can select `Flat` (bypass), `Bass Boost`, `Vocal Clarity`, or `Gaming Balance` EQ presets and hear real-time biquad filtering applied only to Deckify's audio stream.
  2. Enabling, switching, or disabling the equalizer never restarts system `pipewire` or interrupts active game audio or Steam UI sounds.
  3. User can select `Custom` and adjust 5-band frequency sliders (60Hz, 230Hz, 910Hz, 3.6kHz, 14kHz) in `SettingsTab` with live `pw-cli` updates and no audible crackle or subprocess spam.
  4. Selected EQ preset and custom band gains persist across plugin restarts and SteamOS reboots.
**Plans:** 2/2 plans complete
**UI hint**: yes

Plans:
**Wave 1**
- [x] 15-01-PLAN.md — Backend `EqualizerManager` (`pipewire -c` 10-band biquad `filter-chain`, `pw-cli` ~75ms coalescing, `flat` bypass, sink isolation, and `main.py` RPCs)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 15-02-PLAN.md — Frontend 7-preset & 10-band ISO `SliderField` equalizer UI in `SettingsTab.tsx`, `src/types.ts`, and `SettingsTab.test.tsx`

### Phase 16: Automatic Docked Audio-Switching
**Goal**: Connecting a designated external USB-DAC or HDMI sink automatically routes Deckify's audio stream with bit-perfect clock support and restores normal routing on undock.
**Depends on**: Phase 13, Phase 15
**Requirements**: DOCK-01, DOCK-02
**Success Criteria** (what must be TRUE):
  1. User can enable automatic docked audio-switching and select a designated USB-DAC or HDMI target sink in `SettingsTab`.
  2. Connecting the designated dock/DAC sink automatically moves only Deckify's stream (`effect_output.deckify_eq` when EQ is active, or `librespot` when bypassed) to the target sink after hotplug debounce, without hijacking game audio or overriding active Bluetooth headphones if configured.
  3. Designated USB-DAC/HDMI sinks receive `bit_perfect_clock` (`clock.allowed-rates`) configuration when docked.
  4. Undocking cleanly restores normal sink routing and resets `clock.allowed-rates` to `[ 48000 ]` so internal speakers and Bluetooth audio do not crackle.
**Plans:** 2/2 plans complete
**UI hint**: yes

Plans:
**Wave 1**
- [x] 16-01-PLAN.md — Backend `DockAudioSwitcher` (`pactl subscribe` + 1.8s debounce, `USB-DAC > HDMI`, Bluetooth/manual override, EQ/clock coordination, `main.py` integration)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 16-02-PLAN.md — Frontend `DockStatusInfo` types, `SettingsTab.tsx` Docked Audio-Switching card, `src/index.tsx` toast listener, and `SettingsTab.test.tsx`

### Phase 17: Event-Driven librespot & Suspend/Wi-Fi Resilience
**Goal**: Playback state updates instantaneously via local `librespot --onevent` events and recovers seamlessly from Steam Deck sleep/wake and Wi-Fi drops.
**Depends on**: Phase 13
**Requirements**: RESIL-01, RESIL-02
**Success Criteria** (what must be TRUE):
  1. Track changes, play/pause transitions, and seeks in `librespot` update the QAM, Expanded Modal, and HUD overlay immediately via local Unix socket `--onevent` push without audible stutter during rapid skipping.
  2. When `--onevent` is healthy, background Web API polling relaxes from tight 3s intervals to low-frequency fallback polling, reducing HTTP 429 rate-limit pressure.
  3. On Steam Deck suspend (`PrepareForSleep`) or Wi-Fi disconnect/reconnect, Deckify snapshots the active playback bookmark (`track_uri`, `context_uri`, `position_ms`) and restores playback cleanly once network and OAuth tokens recover, without dual-restart races.
**Plans:** 2/2 plans executed

Plans:
**Wave 1**
- [x] 17-01-PLAN.md — Backend `LibrespotEventServer` (`--onevent` AF_UNIX push, Base16→Base62, 400ms debounce, 20s/3s adaptive polling) & `SessionBookmarkManager` (unified wake lock, 4s Wi-Fi grace window, remote-device yield, configurable expiry)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 17-02-PLAN.md — Frontend `librespot_event` immediate sync (`usePlaybackStatus`, `QuickAccessMenu`), conditional held-bookmark CTA, and `SettingsTab.tsx` "Playback Resilience" card

### Phase 18: MPRIS2 D-Bus Bridge
**Goal**: Bluetooth headsets and earbuds can control Deckify playback and display track metadata via standard MPRIS2 D-Bus media controls.
**Depends on**: Phase 17
**Requirements**: MPRIS-01
**Success Criteria** (what must be TRUE):
  1. Deckify registers `org.mpris.MediaPlayer2.deckify` on the `deck` (UID 1000) user session D-Bus without requiring C-extension D-Bus bindings.
  2. Pressing Play, Pause, Play/Pause, Next, or Previous on connected Bluetooth headsets/earbuds (via BlueZ `mpris-proxy`) controls Deckify playback reliably.
  3. Connected Bluetooth devices and D-Bus media controllers reflect current track title, artist, album, and playback status updates.
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 13. Like Button 403 Fix & Sink-Input Guardrails | v0.6 | 2/2 | Complete    | 2026-11-16 |
| 14. Gentle Sleep Timer Fade-Out | v0.6 | 2/2 | Complete    | 2026-11-17 |
| 15. Real PipeWire Biquad Equalizer | v0.6 | 2/2 | Complete    | 2026-11-17 |
| 16. Automatic Docked Audio-Switching | v0.6 | 2/2 | Complete    | 2026-11-17 |
| 17. Event-Driven librespot & Suspend/Wi-Fi Resilience | v0.6 | 2/2 | In Progress | - |
| 18. MPRIS2 D-Bus Bridge | v0.6 | 0/TBD | Not started | - |

---

## Backlog & Future Milestones

See [.planning/IDEAS.md](.planning/IDEAS.md) for the full **Deckify Master Feature & Upgrade Plan** (38+ structured ideas across 5 strategic pillars):
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

### Phase 999.2: Follow-up — Phase 15 deferred UAT follow-up: Test 2 (BACKLOG)

**Goal:** Resolve the UAT checkpoint deferred during Phase 15 verification
**Source phase:** 15
**Deferred at:** 2026-11-16 during /gsd-verify-work 15 session completion
**Follow-ups:**
- [ ] Test 2: Preamp handmatig custom kunnen aanpassen in SettingsTab (naast of als override op automatische negatieve preamp) (deferred 2026-11-16)
- [ ] Steam Machine EQ preset: `TV / Soundbar` preset toevoegen en/of `Deck Speakers` automatisch vervangen/verbergen wanneer er geen Steam Deck `acp5x` interne speakers aanwezig zijn (deferred 2026-11-16)
