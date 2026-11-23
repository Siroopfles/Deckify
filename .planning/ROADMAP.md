# Roadmap: Deckify

## Milestones

- ✅ **v0.4: Stability, Polish & Refactoring** — Phases 1-5 (shipped 2026-11-12) — [Full Archive](.planning/milestones/v0.4-ROADMAP.md)
- ✅ **v0.5: In-Game Flow & Music Discovery** — Phases 6-12 (shipped 2026-11-15) — [Full Archive](.planning/milestones/v0.5-ROADMAP.md)
- ✅ **v0.6: Audio DSP, Docked Flow & System Resilience** — Phases 13-18.1 (shipped 2026-11-18) — [Full Archive](.planning/milestones/v0.6-ROADMAP.md)
- 🚧 **v0.7: Studio, Living Room TV, Offline Travel & Ultimate Immersion** — Phases 19-30 (in progress)

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

<details>
<summary>✅ v0.6: Audio DSP, Docked Flow & System Resilience (Phases 13-18.1) — SHIPPED 2026-11-18</summary>

- [x] **Phase 13: Like Button 403 Fix & Sink-Input Guardrails** (2/2 plans) — Migrated track liking to `/v1/me/library` with CDP fallback and isolated sink-input routing strictly to Deckify streams (completed 2026-11-16)
- [x] **Phase 14: Gentle Sleep Timer Fade-Out** (2/2 plans) — Smoothly ramp playback volume to 0% over a configurable fade-out window before pausing and restoring baseline volume (completed 2026-11-17)
- [x] **Phase 15: Real PipeWire Biquad Equalizer** (2/2 plans) — Isolated `pipewire -c` `filter-chain` DSP equalizer with 7 presets and live 10-band ISO custom sliders (completed 2026-11-17)
- [x] **Phase 16: Automatic Docked Audio-Switching** (2/2 plans) — Automatic USB-DAC/HDMI sink hotplug switching for Deckify streams with `bit_perfect_clock` management (completed 2026-11-17)
- [x] **Phase 17: Event-Driven librespot & Suspend/Wi-Fi Resilience** (2/2 plans) — Local `--onevent` Unix socket push updates, relaxed fallback polling, and unified suspend/Wi-Fi bookmark recovery (completed 2026-11-17)
- [x] **Phase 18: MPRIS2 D-Bus Bridge** (2/2 plans) — Registered `org.mpris.MediaPlayer2.deckify` on UID 1000 user D-Bus for Bluetooth headset AVRCP playback and metadata (completed 2026-11-18)
- [x] **Phase 18.1: Address tech debt: v0.6 undock clock & audit metadata** (2/2 plans, INSERTED) — Preserved `bit_perfect_clock` on undock when lossless, closed `SLEEP-01` frontmatter gap, and promoted Phases 14–18 Nyquist validation (completed 2026-11-18)

*Archived in:* [.planning/milestones/v0.6-ROADMAP.md](.planning/milestones/v0.6-ROADMAP.md)

</details>

### v0.7 Studio, Living Room TV, Offline Travel & Ultimate Immersion (In Progress)

- [ ] **Phase 19: Per-Game EQ & Volume Profiles** - Bind per-game 10-band PipeWire EQ presets and target volume/ducking overrides in `SoundtracksTab` with automatic launch activation and crash-resilient baseline restoration.
- [x] **Phase 20: 100% Silent HUD Toasts & Extended In-Game Quick-Chords** - Route silent 3.5s track-change notifications directly through `DeckifyOverlay` (`pointerEvents: "none"`) and trigger configurable in-game quick-chords (`Like ♥`, `Cycle Pinned Playlists`, `Toggle Lyrics HUD`). (completed 2026-11-22)
- [x] **Phase 21: Dynamic Album-Art Accent Themes & Handheld Battery Eco-Mode** - Extract WCAG-clamped (`L >= 55%`) cover-art accent colors across modal and HUD, and automatically suspend background visualizers and idle paused engines during battery gameplay. (completed 2026-11-22)
- [x] **Phase 22: Spotify Connect Hub 2.0 & Native Crossfade** - Upgrade `DevicesTab` with 1-click auto-waking *"Pull Playback to Steam Deck"*, device icons, engine badges, and remote volume control alongside configurable `0–12s` native crossfade. (completed 2026-11-22)
- [x] **Phase 23: Lyrics 2.0 — Offline .lrc Cache, Per-Track Sync Nudge & CJK Romanization** - Cache `.lrc` lyrics locally for instant/offline loads, persist per-track `-0.5s`/`+0.5s` sync offset nudges synced live with `DeckifyOverlay`, and render dual-line Romaji/Pinyin/Korean romanization. (completed 2026-11-22)
- [ ] **Phase 24: Podcast & Audiobook Power Suite** - Expose `0.75x`–`2.0x` episode playback speed (auto-resetting to `1.0x` on music), `-15s`/`+15s` smart-skip transport & trigger controls, episode resume progress bars, and *Unplayed*/*In Progress* filters.
- [ ] **Phase 25: Universal Artist/Album Drill-Down, Instant Radio & Search 2.0** - Navigate to full Artist/Album views from any track with `B`-button backstack restoration, launch 3-tier Song/Artist Radio, and browse Search 2.0 with history pills, gaming/mood tiles, and podcast filters.
- [ ] **Phase 26: Unified CDP Platform Bridge & Deep Discovery 2.0** - Build the unified `py_modules/cdp_bridge.py` `Platform.Registry` evaluator and unlock personalized Spotify algorithmic mixes (*Daylist*, *Discover Weekly*, *Release Radar*, *Daily Mixes*) in `DiscoveryTab` across both engines.
- [ ] **Phase 27: Interactive Queue Studio & Controller Playlist Management** - Reorder, remove, and clear upcoming tracks via controller Grab/Move Mode in `QueueTab` (with CDP `PlayerAPI` + `librespot` URI-slice fallback) and perform full controller playlist CRUD in `PlaylistsTab`.
- [ ] **Phase 28: CDP Offline Downloads, Wi-Fi Travel Mode & Living Room Spotify Jam** - Download playlists, albums, and episodes via CDP `OfflineAPI` with a 3.0 GB free-space disk guardrail, auto-activate Offline Travel Mode on Wi-Fi disconnect, and share living-room Spotify Jam QR codes.
- [ ] **Phase 29: 10-Foot Docked TV Split-View Mode & PipeWire Spectrum Visualizer** - Auto-activate a 10-foot Docked TV Split-View on HDMI/USB-DAC dock connection paired with an isolated 16-band real-time PipeWire audio spectrum visualizer (`parec --monitor-stream` at 15 Hz).
- [ ] **Phase 30: "Deck Wrapped" Listening Stats, Last.fm / ListenBrainz Scrobbling & Profile Backup** - Browse local "Deck Wrapped" listening analytics (including *Top Game + Soundtrack Pairings*), scrobble to Last.fm and ListenBrainz with an offline retry queue, and export/import 1-click JSON profile backups.

## Phase Details

### Phase 19: Per-Game EQ & Volume Profiles
**Goal**: Users can assign a custom 10-band PipeWire EQ preset and target volume/ducking level to individual games in `SoundtracksTab` that activate automatically on game launch and cleanly restore the global audio baseline on game exit or crash recovery.
**Depends on**: Phase 18.1
**Requirements**: GAME-01
**Success Criteria** (what must be TRUE):
  1. User can select and bind a per-game 10-band EQ preset and target volume/ducking level to any Steam or Non-Steam game profile in `SoundtracksTab`.
  2. Launching a game with an assigned audio profile automatically applies the ephemeral EQ and volume/ducking override without overwriting the user's persistent global `eq_preset` or baseline volume on disk.
  3. Exiting the game (or restarting the plugin after an unexpected crash/reboot via `active_game_override_snapshot`) restores the user's global EQ preset and volume baseline while respecting any active Sleep Timer fade-out priority lock (`_sleep_locked`).
**Plans:** 5/5 plans executed

Plans:
**Wave 1**
- [x] 19-01-PLAN.md — Per-game EQ preset tracer slice, unified local PipeWire VolumeFader overrides, and sequenced SoundtrackManager lifecycle

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 19-02-PLAN.md — Controller wiring in main.py (boot crash recovery, preview_eq_bands/clear_eq_preview RPCs, live hot-apply, status exposure)
- [x] 19-03-PLAN.md — Reusable EqBandFaders extraction, dedicated GameEqModal with live pw-cli preview, and SettingsTab Active Game EQ Override badge

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 19-04-PLAN.md — Complete SoundtracksTab EQ modal button & dual sliders, DeckifyExpandedModal prop wiring, and QAM GAME VOL display

**Wave 1 (Gap Closure)**
- [x] 19-05-PLAN.md — Close UAT gap G-19-2: SoundtracksTab Volume/Ducking ToggleFields & width: "auto" buttons, GameEqModal native surface & MAINTAIN_X D-pad navigation, QAM/backend app_name resolution, and SettingsTab dedicated override banner
**UI hint**: yes

### Phase 20: 100% Silent HUD Toasts & Extended In-Game Quick-Chords
**Goal**: Users receive 100% silent in-game track-change notifications that bypass Steam's noisy UI toaster chime and can trigger configurable in-game controller quick-chords with instant visual HUD feedback.
**Depends on**: Phase 19
**Requirements**: TOAST-01, CHORD-01
**Success Criteria** (what must be TRUE):
  1. When `toast_sound_enabled` is `false`, track-change notifications render as a 100% silent 3.5-second banner inside `DeckifyOverlay` (`pointerEvents: "none"`), completely bypassing Steam's `toaster.toast` audio chime even when the persistent HUD overlay is hidden.
  2. User can trigger configurable in-game controller quick-chords to Like/Unlike (`♥`) the current track, cycle through the 4 Pinned Playlists, or toggle the Lyrics HUD, receiving instant silent visual confirmation inside `DeckifyOverlay`.
  3. Controller chord detection enforces a 4-second `guideHeld` expiry guard and blocks reserved Valve system chords (`STEAM + X/R1/L1`) so chords never misfire or collide with SteamOS system shortcuts.
**Plans:** 7/7 plans complete

Plans:
**Wave 1**
- [x] 20-01-PLAN.md — Silent HUD banner tracer slice (bannerBus -> SilentBanner -> always-mounted DeckifyOverlayWrapper) and Python settings validation/persistence

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 20-02-PLAN.md — Pure Quick-Chord matcher/validator (src/chords.ts) with 4s guideHeld expiry and extended Like/Pinned/Lyrics action wiring

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 20-03-PLAN.md — Settings UI ChordBindingsCard (Silent HUD Banner toggle, 1–4 button press-to-record capture, Reset All Chords) and SettingsTab composition

**Wave 1 (Gap Closure)**
- [x] 20-04-PLAN.md — Close UAT gap G-20-1: independent `silent_banner_position` corner picker & volume-scaled non-Steam Web Audio chime

**Wave 2 (Gap Closure)** *(blocked on 20-04)*
- [x] 20-05-PLAN.md — Close UAT gap G-20-2: unbound `[]` chord defaults, STEAM button rejection, `RegisterForControllerInputMessages` in-game capture, and `EUIComposition.Notification` Gamescope overlay composition

**Wave 1 (Gap Closure - G-20-3)**
- [x] 20-06-PLAN.md — Close UAT gap G-20-3 (Backend): passive `hidraw`/`evdev` controller input watcher (`py_modules/input_watch.py`) and `main.py` `controller_input` emission

**Wave 2 (Gap Closure - G-20-3)** *(blocked on 20-06)*
- [x] 20-07-PLAN.md — Close UAT gap G-20-3 (Frontend): D-pad `20..23` mappings, dual-signature `RegisterForControllerInputMessages`, `RegisterForControllerStateChanges` fallback, `.unregister()`/`.Unregister()`, `deck_resumed` re-subscribe, and deduplicated `controller_input` listener
**UI hint**: yes

### Phase 21: Dynamic Album-Art Accent Themes & Handheld Battery Eco-Mode
**Goal**: Users can style Deckify with WCAG-accessible dynamic album-art accent colors across the modal and HUD, and conserve handheld battery life during active gameplay via an automated Eco-Mode power governor.
**Depends on**: Phase 20
**Requirements**: THEME-01, ECO-01
**Success Criteria** (what must be TRUE):
  1. User can switch between *Classic Spotify Green*, *Dynamic Album Glow* (dominant cover-art accent extracted from proxied artwork and WCAG luminance-clamped to `L >= 55%` for readable controller focus halos), and *SteamOS Deck Blue* across the Expanded Modal and in-game HUD.
  2. When Handheld Battery Eco-Mode is enabled and the Steam Deck is running on battery during active gameplay, background spectrum visualizers and non-essential animations are automatically suspended.
  3. When playback remains paused on battery beyond the user's configured Eco-Mode inactivity timeout (`5–30 min`), the background playback engine automatically enters idle sleep and wakes transparently on the next play command (with Eco-Mode sleep automatically bypassed when AC-powered or docked).
**Plans:** 6/6 plans complete

Plans:
**Wave 1**
- [x] 21-01-PLAN.md — Dynamic Album-Art Accent Theme tracer (32x32 canvas extractor, L>=55% WCAG clamp, cross-root --deckify-accent CSS vars, Modal/HUD/Banner/InteractiveRow integration)
- [x] 21-02-PLAN.md — Handheld Battery Eco-Mode backend (PowerGovernor sysfs/dock/game detection, animations_suspended, idle pause sleep, transparent wake-on-play, settings validation)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 21-03-PLAN.md — Common UI & first-wave tab --deckify-accent migration (CollectionActionModal, EqBandFaders, Sidebar, TrackActionModal, TrackRowItem, AlbumsTab, ArtistsTab, ChordBindingsCard, DevicesTab, DiscoveryTab)
- [x] 21-04-PLAN.md — Second-wave tab --deckify-accent migration (GameEqModal, LikedSongsTab, LyricsTab, NowPlayingTab, PlaylistsTab, PodcastsTab, QueueTab, SearchTab, SoundtracksTab)

**Wave 3** *(blocked on Wave 1 & Wave 2 completion)*
- [x] 21-05-PLAN.md — SettingsTab Accent Theme & Eco-Mode cards, QAM Eco-Sleep indicator + Wake & Play, extended UI tests, and full verification suite

**Wave 1 (Gap Closure)**
- [x] 21-06-PLAN.md — Close UAT gaps G-21-1 & G-21-2: QAM Content & SilentBanner useAccentTheme() + getThemeCssVars() cross-CEF propagation
**UI hint**: yes

### Phase 22: Spotify Connect Hub 2.0 & Native Crossfade
**Goal**: Users can inspect active playback engines and device types, pull playback from any external device to the Steam Deck with a single auto-waking action, control remote Connect volume, and configure native track crossfade.
**Depends on**: Phase 21
**Requirements**: CONNECT-01, RADIO-02
**Success Criteria** (what must be TRUE):
  1. User can open `DevicesTab` to view distinct device type icons (Steam Deck, Desktop, Smartphone, Speaker/TV) and active engine badges (`librespot` vs `Spotify Client`).
  2. User can select the 1-click *"Pull Playback to Steam Deck"* action in `DevicesTab` to automatically wake a sleeping local Deckify engine and transfer active playback from an external Spotify Connect device, or adjust remote Connect device volume via a debounced slider.
  3. User can configure native track Crossfade (`0–12s`) in `SettingsTab`, synchronizing the transition duration across Official Spotify Client CDP preferences, `librespot` / `spotifyd` engine config, and local playback transitions.
**Plans**: 5/5 plans complete
- [x] 22-01-PLAN.md
- [x] 22-02-PLAN.md
- [x] 22-03-PLAN.md — Close UAT gaps G-22-1 & G-22-2: host hardware label detection, local device deduplication, and CEF truncation hardening
- [x] 22-04-PLAN.md — Close UAT gap G-22-3: scope CrossfadeSettingRow to Official Spotify Client and remove librespot dip-to-silence fallback
- [x] 22-05-PLAN.md — Close UAT gap G-22-4: ignore scope="Device" peripheral batteries and match Fremont DMI codename for Steam Machine detection
**UI hint**: yes

### Phase 23: Lyrics 2.0 — Offline .lrc Cache, Per-Track Sync Nudge & CJK Romanization
**Goal**: Users enjoy instant offline-cached `.lrc` lyrics, persistent per-track sync timing adjustments that update the in-game HUD live, and zero-dependency phonetic romanization for Japanese, Korean, and Chinese lyrics.
**Depends on**: Phase 22
**Requirements**: LYRICS-01, LYRICS-02
**Success Criteria** (what must be TRUE):
  1. Synced and plain lyrics are automatically cached as human-readable `.lrc` files in `~/.cache/deckify/lyrics/` for `0ms` repeat loads and offline playback support.
  2. User can nudge lyric synchronization in `-0.5s` / `+0.5s` increments in `LyricsTab`, persisting the offset per `track_id` and immediately updating active lyric line scheduling in both `LyricsTab` and `DeckifyOverlay` without mutating cached `.lrc` timestamps.
  3. User can toggle phonetic romanization in `LyricsTab` (and `TvSplitView`) to display dual-line Romaji (Japanese), Revised Romanization (Korean), or Pinyin (Chinese) beneath CJK lyrics using upstream phonetic data and a zero-dependency pure-Python transliterator.
**Plans:** 5/5 plans executed

Plans:
**Wave 1**
- [x] 23-01-PLAN.md — Offline .lrc cache (~/.cache/deckify/lyrics/), lyrics_offsets.json store, romanize settings, and RPC bindings (tracer)
- [x] 23-02-PLAN.md — Zero-dependency pure-Python CJK romanizer (py_modules/cjk_tables.py, py_modules/romanize.py) and NetEase romalrc aligner

**Wave 2** *(blocked on Wave 1)*
- [x] 23-03-PLAN.md — NetEase rv=-1 & romanize.py integration in spotify.py, types, and live DeckifyOverlay / DeckifyOverlayWrapper sync

**Wave 3** *(blocked on Wave 2)*
- [x] 23-04-PLAN.md — LyricsTab nudge/romanize toolbar & dual-line CJK rendering, DeckifyExpandedModal X/Y shortcuts, and SettingsTab controls

**Wave 1 (Gap Closure)**
- [x] 23-05-PLAN.md — Close UAT gap G-23-12: align Lyrics mode controller-hint-bar with X/Y sync nudge shortcuts and remove dead isActiveTrackMode checks
**UI hint**: yes

### Phase 24: Podcast & Audiobook Power Suite
**Goal**: Users listening to podcast episodes and audiobooks have dedicated playback speed controls, `-15s`/`+15s` smart-skip transport and trigger actions, visual episode resume progress bars, and *Unplayed*/*In Progress* filtering.
**Depends on**: Phase 23
**Requirements**: POD-01, POD-02
**Success Criteria** (what must be TRUE):
  1. When a podcast episode or audiobook is playing, `NowPlayingTab` and the Quick Access Menu expose `0.75x`–`2.0x` playback speed controls that automatically reset to `1.0x` whenever a standard music track starts playing.
  2. While playing a podcast episode or audiobook, `NowPlayingTab` and L2/R2 controller triggers adapt to perform dedicated `-15s` / `+15s` smart-skip seeks with accurate monotonic clock progression.
  3. User can inspect per-episode resume progress bars and *"Played"* badges (`resume_point`) in `PodcastsTab` and filter show episodes by *All*, *Unplayed*, or *In Progress*.
**Plans:** 8/8 plans executed

Plans:
**Wave 1**
- [x] 24-01-PLAN.md — Backend speed RPC (`0.5x`–`2.0x` CDP `PlayerAPI.setSpeed` + `librespot` fallback), `media_type` & music `1.0x` auto-reset, `user-read-playback-position` scope, `get_show_episodes`, and `tests/test_podcast_suite.py` (tracer)
- [x] 24-02-PLAN.md — Shared Phase 24 types, `src/utils/playback.ts` helpers, and `playbackSpeed`-scaled `usePlaybackClock` + `usePlaybackStatus`

**Wave 2** *(blocked on Wave 1)*
- [x] 24-03-PLAN.md — `NowPlayingTab` `-15s`/`+15s` smart-skip transport, `@decky/ui` `Dropdown` (`0.5x`–`2.0x`), and `NowPlayingTab.test.tsx`
- [x] 24-04-PLAN.md — `PodcastsTab` show drill-down, bottom green progress bars, `"Played"`/`"Xm left"` badges, *All*/*Unplayed*/*In Progress* filter pills, and `PodcastsTab.test.tsx`

**Wave 3** *(blocked on Wave 2)*
- [x] 24-05-PLAN.md — `DeckifyExpandedModal` `L2`/`R2` 15s smart-skip & `PodcastsTab` show wiring, `QuickAccessMenu` compact speed cycle pill, and full verification suite

**Wave 1 (Gap Closure)**
- [x] 24-06-PLAN.md — Close UAT gaps G-24-1 & G-24-2: fix `set_playback_speed` `_save_settings` call, remove duplicate `-15s`/`+15s` row & add pointer-drag/`onGamepadDirection` scrubbing to `ProgressScrubBar`, and adapt `TrackActionModal` wording for spoken content
- [x] 24-07-PLAN.md — Close UAT gap G-24-3: move `ProgressScrubBar` pointer-drag onto a native `div` hit-target with `10px 0` vertical padding, `e.preventDefault()`, `window`-level pointer listeners, and post-drag `onClick` deduplication
- [x] 24-08-PLAN.md — Close UAT gap G-24-4: add `onActivate`, `onCancelButton`, `onOKActionDescription`, `data-deckify-focused`, and boolean-returning `onGamepadDirection` to `ProgressScrubBar`'s `<Focusable>` for SteamOS controller focus/selection
**UI hint**: yes

### Phase 25: Universal Artist/Album Drill-Down, Instant Radio & Search 2.0
**Goal**: Users can drill down to full Artist or Album detail pages from any track view with predictable `B`-button backstack navigation, launch resilient 3-tier Song/Artist Radio, and browse Search 2.0 via history pills, gaming/mood genre tiles, and podcast filters.
**Depends on**: Phase 24
**Requirements**: RADIO-01, SEARCH-01, SEARCH-02
**Success Criteria** (what must be TRUE):
  1. User can select *"Start Song Radio"*, *"Go to Artist"*, or *"Go to Album"* from any track across `TrackActionModal`, `NowPlayingTab`, `QueueTab`, and `SearchTab`, using a breadcrumb backstack (`navigationHistoryRef`) that restores the exact originating tab and scroll focus when pressing `B`.
  2. Selecting *"Start Song Radio"* or *"Start Artist Radio"* generates and starts a continuous radio queue on both `spotify_client` and `librespot` via the 3-tier radio waterfall (CDP station → Web API recommendations → Top-Tracks/Search synthesis fallback).
  3. When the search query in `SearchTab` is empty, user can launch searches from recent search history pills (with individual and clear-all options) or select from 12 controller-friendly Gaming & Mood browse tiles without opening the virtual keyboard.
  4. User can filter and browse search results specifically by `Podcasts` (`show`) and `Episodes` (`episode`) in `SearchTab` alongside Tracks, Artists, Albums, and Playlists.
**Plans:** 4 plans

Plans:
**Wave 1**
- [ ] 23-01-PLAN.md — Offline .lrc cache (~/.cache/deckify/lyrics/), lyrics_offsets.json store, romanize settings, and RPC bindings (tracer)
- [ ] 23-02-PLAN.md — Zero-dependency pure-Python CJK romanizer (py_modules/cjk_tables.py, py_modules/romanize.py) and NetEase romalrc aligner

**Wave 2** *(blocked on Wave 1)*
- [ ] 23-03-PLAN.md — NetEase rv=-1 & romanize.py integration in spotify.py, types, and live DeckifyOverlay / DeckifyOverlayWrapper sync

**Wave 3** *(blocked on Wave 2)*
- [ ] 23-04-PLAN.md — LyricsTab nudge/romanize toolbar & dual-line CJK rendering, DeckifyExpandedModal X/Y shortcuts, and SettingsTab controls
**UI hint**: yes

### Phase 26: Unified CDP Platform Bridge & Deep Discovery 2.0
**Goal**: Users can browse and play personalized Spotify algorithmic mixes (*Daylist*, *Discover Weekly*, *Release Radar*, *Daily Mixes*) in `DiscoveryTab` across both `spotify_client` and `librespot` via a unified Chrome DevTools Protocol (`Platform.Registry`) bridge.
**Depends on**: Phase 25
**Requirements**: DISC-04
**Success Criteria** (what must be TRUE):
  1. Backend `py_modules/cdp_bridge.py` dynamically resolves and caches the Official Spotify Client's internal React Fiber `Platform.Registry` on `window.__deckifyRegistry` over port `9229` with a 4.0-second timeout and clean error fallback.
  2. `DiscoveryTab` populates the *Made For You* section with the user's personalized algorithmic mixes (*Daylist*, *Discover Weekly*, *Release Radar*, *Daily Mix 1–6*) via the CDP Pathfinder/Rootlist bridge, bypassing Spotify Web API Development Mode `HTTP 403/404` blocks.
  3. Resolved algorithmic mix metadata and track URI lists are cached locally on disk so users can browse and play those mixes even after switching their active playback engine to `librespot`.
**Plans:** 4 plans

Plans:
**Wave 1**
- [ ] 23-01-PLAN.md — Offline .lrc cache (~/.cache/deckify/lyrics/), lyrics_offsets.json store, romanize settings, and RPC bindings (tracer)
- [ ] 23-02-PLAN.md — Zero-dependency pure-Python CJK romanizer (py_modules/cjk_tables.py, py_modules/romanize.py) and NetEase romalrc aligner

**Wave 2** *(blocked on Wave 1)*
- [ ] 23-03-PLAN.md — NetEase rv=-1 & romanize.py integration in spotify.py, types, and live DeckifyOverlay / DeckifyOverlayWrapper sync

**Wave 3** *(blocked on Wave 2)*
- [ ] 23-04-PLAN.md — LyricsTab nudge/romanize toolbar & dual-line CJK rendering, DeckifyExpandedModal X/Y shortcuts, and SettingsTab controls
**UI hint**: yes

### Phase 27: Interactive Queue Studio & Controller Playlist Management
**Goal**: Users can interactively reorder, remove, and clear upcoming tracks in `QueueTab` using controller Grab/Move Mode and perform full controller-driven playlist creation, renaming, deletion, and track curation in `PlaylistsTab`.
**Depends on**: Phase 26
**Requirements**: QUEUE-03, PL-01
**Success Criteria** (what must be TRUE):
  1. User can press `A` / *"Move in Queue"* on any upcoming track in `QueueTab` to enter controller Grab/Move Mode, move the track up or down with `D-Pad Up/Down` while focus remains locked via stable `_rowKey` IDs, and press `A` to commit the new order in a single batched update.
  2. User can remove individual upcoming tracks or clear the upcoming queue in `QueueTab`, executing natively via CDP `PlayerAPI` when `spotify_client` is active and automatically falling back to virtual URI-slice playback mutation when `librespot` is active.
  3. User can create new playlists, rename or edit playlist descriptions, delete or unfollow playlists with a confirmation modal, and reorder or remove tracks inside user-owned playlists directly from the controller in `PlaylistsTab`.
**Plans:** 4 plans

Plans:
**Wave 1**
- [ ] 23-01-PLAN.md — Offline .lrc cache (~/.cache/deckify/lyrics/), lyrics_offsets.json store, romanize settings, and RPC bindings (tracer)
- [ ] 23-02-PLAN.md — Zero-dependency pure-Python CJK romanizer (py_modules/cjk_tables.py, py_modules/romanize.py) and NetEase romalrc aligner

**Wave 2** *(blocked on Wave 1)*
- [ ] 23-03-PLAN.md — NetEase rv=-1 & romanize.py integration in spotify.py, types, and live DeckifyOverlay / DeckifyOverlayWrapper sync

**Wave 3** *(blocked on Wave 2)*
- [ ] 23-04-PLAN.md — LyricsTab nudge/romanize toolbar & dual-line CJK rendering, DeckifyExpandedModal X/Y shortcuts, and SettingsTab controls
**UI hint**: yes

### Phase 28: CDP Offline Downloads, Wi-Fi Travel Mode & Living Room Spotify Jam
**Goal**: Users can download playlists, albums, and podcast episodes for offline playback with a 3.0 GB free-space guardrail, automatically filter to downloaded content in Offline Travel Mode when Wi-Fi disconnects, and host living-room Spotify Jam sessions via scannable QR codes.
**Depends on**: Phase 27
**Requirements**: CDP-01, CDP-02, JAM-01
**Success Criteria** (what must be TRUE):
  1. User can toggle *"Download for Offline"* on playlists, albums, and podcast episodes via Official Spotify Client CDP `OfflineAPI` (with a 1-click engine switch prompt when on `librespot`), viewing live `0–100%` download progress and green offline badges while protected by an `os.statvfs` 3.0 GB minimum free-space disk guardrail.
  2. User can manually toggle **Offline / Travel Mode** or have it activate automatically upon sustained Wi-Fi disconnect (after the 10-second wake-from-suspend grace window) to filter library views strictly to locally downloaded content and cached `.lrc` lyrics.
  3. User can start or share a Spotify Jam / group session from `NowPlayingTab`, `DevicesTab`, or `TvSplitView`, rendering a high-contrast scannable `QRCodeSVG` modal/card for living-room guests (with a shareable track/playlist deep-link QR fallback when `librespot` is active).
**Plans:** 4 plans

Plans:
**Wave 1**
- [ ] 23-01-PLAN.md — Offline .lrc cache (~/.cache/deckify/lyrics/), lyrics_offsets.json store, romanize settings, and RPC bindings (tracer)
- [ ] 23-02-PLAN.md — Zero-dependency pure-Python CJK romanizer (py_modules/cjk_tables.py, py_modules/romanize.py) and NetEase romalrc aligner

**Wave 2** *(blocked on Wave 1)*
- [ ] 23-03-PLAN.md — NetEase rv=-1 & romanize.py integration in spotify.py, types, and live DeckifyOverlay / DeckifyOverlayWrapper sync

**Wave 3** *(blocked on Wave 2)*
- [ ] 23-04-PLAN.md — LyricsTab nudge/romanize toolbar & dual-line CJK rendering, DeckifyExpandedModal X/Y shortcuts, and SettingsTab controls
**UI hint**: yes

### Phase 29: 10-Foot Docked TV Split-View Mode & PipeWire Spectrum Visualizer
**Goal**: Users can transform a docked Steam Deck into a living-room TV interface featuring large cover art, dynamic glow, 10-foot dual-line karaoke lyrics, queue preview, and a strictly modal-scoped 16-band real-time PipeWire audio spectrum visualizer.
**Depends on**: Phase 28
**Requirements**: TV-01, TV-02
**Success Criteria** (what must be TRUE):
  1. User can manually toggle the **10-Foot Docked TV Split-View Mode** (`TvSplitView.tsx` — large cover art + dynamic accent glow on the left, 10-foot dual-line romanized karaoke lyrics + Up Next queue preview + optional Jam QR badge on the right) or have it auto-activate when `DockAudioSwitcher` detects an external HDMI/USB-DAC dock.
  2. When `TvSplitView` is open and actively playing, an optional 16-band real-time PipeWire audio spectrum visualizer (`parec --monitor-stream` tapped strictly to Deckify's audio stream at 15 Hz via `resolve_spotify_sink_input_ids()` with zero game or voice bleed) animates smoothly via GPU-composited CSS `scaleY` transforms.
  3. Closing `TvSplitView`, pausing playback, or activating Handheld Battery Eco-Mode terminates the `parec` spectrum subprocess within `<100ms` so zero background DSP overhead runs during gameplay.
**Plans:** 4 plans

Plans:
**Wave 1**
- [ ] 23-01-PLAN.md — Offline .lrc cache (~/.cache/deckify/lyrics/), lyrics_offsets.json store, romanize settings, and RPC bindings (tracer)
- [ ] 23-02-PLAN.md — Zero-dependency pure-Python CJK romanizer (py_modules/cjk_tables.py, py_modules/romanize.py) and NetEase romalrc aligner

**Wave 2** *(blocked on Wave 1)*
- [ ] 23-03-PLAN.md — NetEase rv=-1 & romanize.py integration in spotify.py, types, and live DeckifyOverlay / DeckifyOverlayWrapper sync

**Wave 3** *(blocked on Wave 2)*
- [ ] 23-04-PLAN.md — LyricsTab nudge/romanize toolbar & dual-line CJK rendering, DeckifyExpandedModal X/Y shortcuts, and SettingsTab controls
**UI hint**: yes

### Phase 30: "Deck Wrapped" Listening Stats, Last.fm / ListenBrainz Scrobbling & Profile Backup
**Goal**: Users can explore local "Deck Wrapped" listening analytics correlated with the Steam games they play, scrobble tracks to Last.fm and ListenBrainz with offline retry resilience, and export or import a 1-click JSON backup of their complete Deckify configuration.
**Depends on**: Phase 29
**Requirements**: STATS-01, STATS-02
**Success Criteria** (what must be TRUE):
  1. User can open the dedicated *"Deck Wrapped" / Listening Stats* view (`StatsTab.tsx`) to inspect total listening time, top tracks and artists on Steam Deck, and **Top Game + Soundtrack Pairings** recorded via monotonic wall-clock playback duration (`accumulated_play_ms`) correlated with `active_game_app_id`.
  2. User can enable built-in **Last.fm** and/or **ListenBrainz** scrobbling that enforces the standard 50% / 240-second actual-play-time rule (immune to seek-bar scrubbing) and persists scrobbles in an offline retry queue when disconnected from Wi-Fi.
  3. User can export or import a secret-redacted 1-click JSON profile backup (`~/.config/deckify/backups/`) containing all Deckify settings, game soundtrack & per-game EQ profiles, custom 10-band EQ presets, per-track lyric offsets, and pinned playlists without exposing OAuth or scrobbler tokens.
**Plans:** 4 plans

Plans:
**Wave 1**
- [ ] 23-01-PLAN.md — Offline .lrc cache (~/.cache/deckify/lyrics/), lyrics_offsets.json store, romanize settings, and RPC bindings (tracer)
- [ ] 23-02-PLAN.md — Zero-dependency pure-Python CJK romanizer (py_modules/cjk_tables.py, py_modules/romanize.py) and NetEase romalrc aligner

**Wave 2** *(blocked on Wave 1)*
- [ ] 23-03-PLAN.md — NetEase rv=-1 & romanize.py integration in spotify.py, types, and live DeckifyOverlay / DeckifyOverlayWrapper sync

**Wave 3** *(blocked on Wave 2)*
- [ ] 23-04-PLAN.md — LyricsTab nudge/romanize toolbar & dual-line CJK rendering, DeckifyExpandedModal X/Y shortcuts, and SettingsTab controls
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 19 → 20 → 21 → 22 → 23 → 24 → 25 → 26 → 27 → 28 → 29 → 30

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1–5. Stability, Polish & Refactoring | v0.4 | 7/7 | Complete | 2026-11-12 |
| 6–12. In-Game Flow & Music Discovery | v0.5 | 22/22 | Complete | 2026-11-15 |
| 13–18.1. Audio DSP, Docked Flow & System Resilience | v0.6 | 14/14 | Complete | 2026-11-18 |
| 19. Per-Game EQ & Volume Profiles | v0.7 | 5/5 | In Progress | - |
| 20. 100% Silent HUD Toasts & Extended In-Game Quick-Chords | v0.7 | 7/7 | Complete    | 2026-11-22 |
| 21. Dynamic Album-Art Accent Themes & Handheld Battery Eco-Mode | v0.7 | 6/6 | Complete    | 2026-11-22 |
| 22. Spotify Connect Hub 2.0 & Native Crossfade | v0.7 | 5/5 | Complete    | 2026-11-22 |
| 23. Lyrics 2.0 — Offline .lrc Cache, Per-Track Sync Nudge & CJK Romanization | v0.7 | 5/5 | In Progress |  |
| 24. Podcast & Audiobook Power Suite | v0.7 | 8/8 | In Progress | - |
| 25. Universal Artist/Album Drill-Down, Instant Radio & Search 2.0 | v0.7 | 0/TBD | Not started | - |
| 26. Unified CDP Platform Bridge & Deep Discovery 2.0 | v0.7 | 0/TBD | Not started | - |
| 27. Interactive Queue Studio & Controller Playlist Management | v0.7 | 0/TBD | Not started | - |
| 28. CDP Offline Downloads, Wi-Fi Travel Mode & Living Room Spotify Jam | v0.7 | 0/TBD | Not started | - |
| 29. 10-Foot Docked TV Split-View Mode & PipeWire Spectrum Visualizer | v0.7 | 0/TBD | Not started | - |
| 30. "Deck Wrapped" Listening Stats, Last.fm / ListenBrainz Scrobbling & Profile Backup | v0.7 | 0/TBD | Not started | - |

---

## Backlog & Future Milestones

See [.planning/IDEAS.md](.planning/IDEAS.md) for the full **Deckify Master Feature & Upgrade Plan**:
- **LOCAL-01**: Local MP3/FLAC file library browser (`/home/deck/Music`) integrated alongside Spotify library tabs.
- **VOICE-01**: Offline push-to-talk voice search (`"Play Synthwave"`) on Steam Deck microphone.
- **MULTI-01**: Multi-account Spotify profile switcher in `SettingsTab` for shared family Steam Decks.

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
