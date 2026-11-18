# Project Research Summary

**Project:** Deckify — Milestone v0.7 (Studio, Living Room TV, Offline Travel & Ultimate Immersion)
**Domain:** SteamOS GamepadUI Spotify Client & Audio Engine (Decky Loader Plugin)
**Researched:** 2026-11-18
**Confidence:** HIGH

## Executive Summary

Deckify v0.7 transforms an already rock-solid Steam Deck Spotify controller plugin (v0.4–v0.6) into a comprehensive 14-pillar studio, living-room entertainment center, offline travel companion, and deep in-game audio suite. Experts building native-feeling media clients inside SteamOS GamepadUI must work within three unforgiving constraints: Decky Loader's PyInstaller Python 3.11+ sandbox (which breaks when native C-extensions like `numpy`, `Pillow`, or `MeCab` are imported), Steam CEF's strict Content Security Policy and shared Gamescope GPU composition budget, and Spotify's November 2024 Web API Development Mode restrictions (which return `HTTP 403/404` on `/v1/recommendations`, `/v1/browse/*`, and Spotify-owned algorithmic mixes like *Discover Weekly* and *Daylist*).

The recommended architecture addresses all 14 capability pillars with **zero new npm or pip dependencies**, relying exclusively on Python 3.11+ standard library modules (`struct`, `zlib`, `hashlib`, `urllib.request`, `asyncio`) and the existing React 19 / `@decky/ui` / `qrcode.react` frontend stack. To bypass Spotify Web API Dev Mode limitations and unlock features missing from the public REST API (queue reordering/deletion, offline downloads, algorithmic discovery mixes, podcast playback speed, and Spotify Jam sessions), v0.7 introduces a unified Chrome DevTools Protocol (CDP) bridge (`py_modules/cdp_bridge.py`) that introspects the Official Spotify Client's internal React Fiber `Platform.Registry` (`PlayerAPI`, `PlaylistAPI`, `OfflineAPI`, `SocialConnectAPI`, and Pathfinder GraphQL) on port `9229`, paired with deterministic fallbacks (URI-slice virtual queue mutation, Top-Tracks/Search radio synthesis, and deep-link QR codes) whenever the lightweight `librespot` daemon is the active engine.

The primary risks in v0.7 are dual-engine state contention (`librespot` vs `spotify_client`), CPU/IPC starvation from continuous audio spectrum visualization or HUD repaints during gameplay, four-way audio priority collisions (`SoundtrackManager` vs `EqualizerManager` vs `VolumeFader` vs `SleepTimer`), and D-pad spatial navigation loss when reordering queues or drilling down across views. We mitigate these by enforcing an explicit capability and fallback matrix per engine, scoping the `parec` 16-band Goertzel audio spectrum tap strictly to the open 10-Foot Docked TV Split-View modal at 15 Hz, implementing an ephemeral EQ/volume override layer with crash-recovery snapshots, routing 100% silent track and quick-chord toasts directly through `DeckifyOverlay` (`pointerEvents: "none"`), and managing multi-level view drill-downs via a dedicated breadcrumb history stack (`navigationHistoryRef`).

## Key Findings

### Recommended Stack

See [STACK.md](file:///C:/Users/djdje/Deckify/.planning/research/STACK.md) for complete technical specifications. No new `npm` or `pip` packages are needed; keeping the backend 100% pure Python stdlib and the frontend bundle under 350 KB prevents ABI crashes across SteamOS 3.5–3.7+ updates and avoids CEF CSP failures.

**Core technologies:**
- **Python 3.11+ Standard Library (`struct`, `zlib`, `hashlib`, `urllib`, `socket`, `asyncio`)**: Powers raw RFC 6455 WebSocket CDP evaluation, 16-band pure-Python Goertzel PCM spectrum analysis, Last.fm MD5 / ListenBrainz scrobbling, `.lrc` disk caching, and CJK romanization — zero `LD_LIBRARY_PATH` or C-ABI breakage.
- **Official Spotify Client CDP Bridge (`127.0.0.1:9229`)**: Unlocks internal `Platform.Registry` services (`PlayerAPI`, `PlaylistAPI`, `OfflineAPI`, `SocialConnectAPI`, Pathfinder `queryHome`) using first-party session credentials exempt from third-party Web API Dev Mode 403/404 blocks.
- **PipeWire / PulseAudio (`parec --monitor-stream`, `pactl`, `filter-chain`)**: Provides isolated per-stream PCM spectrum tapping (zero game audio or voice chat bleed), per-game 10-band biquad EQ preset switching, and HDMI/USB-DAC dock hotplug detection.
- **React 19 + `@decky/ui` 4.11.1 + `qrcode.react` 4.2.0**: Renders the 10-foot Docked TV Split-View, controller Grab-Mode Queue/Playlist Studio, inline SVG QR codes for Spotify Jam (100% immune to CEF image CSP), and zero-focus silent Gamescope HUD notifications.

### Expected Features

See [FEATURES.md](file:///C:/Users/djdje/Deckify/.planning/research/FEATURES.md) for complete controller user flows and dependency analysis across all 14 capability pillars.

**Must have (table stakes):**
- **Per-Game EQ/Volume Profiles & 100% Silent HUD Toasts (`GAME-01`, `TOAST-01`)** — Per-game 10-band EQ preset override in `SoundtracksTab` plus silent track-change banners in `DeckifyOverlay` that bypass Steam's noisy `toaster.toast` chime.
- **Extended In-Game Quick-Chords (`CHORD-01`)** — Configurable guide-button chords for Like/Unlike (`♥`), Cycle Pinned Playlists (`1→4`), and Toggle Lyrics HUD with instant silent overlay confirmation pills.
- **Interactive Queue Studio & Controller Playlist CRUD (`QUEUE-03`, `PL-01`)** — Controller "Grab/Move Mode" (`D-Pad Up/Down` to reorder, `A` to drop), single-track removal, clear queue, and full playlist create/rename/delete/reorder.
- **Universal Drill-Down, Instant Radio & Crossfade (`RADIO-01`)** — `"Go to Artist"` and `"Go to Album"` from any tab with `B`-button backstack support, resilient 3-tier Song/Artist Radio, and native `0–12s` crossfade slider.
- **Search 2.0, Podcast Power Suite & Lyrics 2.0 (`SEARCH-01`, `POD-01`, `LYRICS-01`)** — Recent search history pills, empty-query gaming/mood browse tiles, `Podcasts`/`Episodes` filters, `0.75x–2.0x` episode speed, `±15s` smart-skip, offline `.lrc` disk cache, per-track `±0.5s` sync offset memory, and CJK romanization.
- **Spotify Connect Hub 2.0 (`CONNECT-01`)** — 1-click auto-waking *"Pull Playback to Steam Deck"* hero button, device type icons, engine badges, and debounced remote device volume slider.

**Should have (competitive differentiators):**
- **Deep Discovery 2.0 via Hybrid CDP Bridge (`DISC-04`)** — Populates `DiscoveryTab` *Made For You* with *Daylist*, *Discover Weekly*, *Release Radar*, and *Daily Mix 1–6* via CDP Pathfinder, cached so `librespot` can play them too.
- **Native CDP Offline Downloads & Auto Wi-Fi Travel Mode (`CDP-01`)** — Playlist/album/episode offline caching via `OfflineAPI` with live progress, 3.0 GB free-space disk guard, and automatic "Offline Only" Travel Mode when Wi-Fi disconnects.
- **Spotify Jam & Living Room QR Sessions (`JAM-01`)** — Host/manage Jam sessions with scannable on-screen `QRCodeSVG` modals and corner TV overlays for couch co-op DJing.
- **10-Foot Docked TV Split-View & PipeWire Spectrum Visualizer (`TV-01`)** — Auto-activates on HDMI/USB dock connect; pairs large artwork and 16-bar isolated PipeWire audio visualizer with 10-foot karaoke lyrics and Up Next queue preview.
- **Dynamic Album-Art Accent Themes & Handheld Battery Eco-Mode (`THEME-01`, `ECO-01`)** — WCAG-clamped (`L >= 55%`) dominant cover-art accents (`--deckify-accent`) across modal and HUD, plus an Eco-Governor that suspends visualizers and idle daemons after 5–10 minutes paused on battery during gameplay.
- **"Deck Wrapped" Game+Music Analytics, Scrobbling & Backup (`STATS-01`)** — Correlates listening history with `activeGameAppId` (*Top Game + Soundtrack Pairings*), built-in offline-resilient Last.fm & ListenBrainz scrobbler, and secret-redacted 1-click JSON profile backup/restore.

**Defer (v2+ / Anti-Features):**
- **60fps Spectrum Visualizer inside In-Game Gamescope Overlay** — Causes severe GPU composition frame-pacing drops (1% lows) in running AAA games; visualizer must remain strictly inside the full-screen modal (`TvSplitView`).
- **DRM Decryption or MP3/FLAC Ripping for `librespot` Offline Mode** — Violates Spotify ToS and risks account bans; use Official Spotify Client's sanctioned `OfflineAPI` for offline downloads.
- **Heavy C-Extension NLP Dictionaries (`MeCab`, `fugashi`, `kuromoji.js`)** — Breaks PyInstaller sandbox and bloats bundle size by 15–50 MB; use upstream NetEase `romalrc` / CDP transliteration + pure-Python Hangul/Kana/Unihan tables.

### Architecture Approach

See [ARCHITECTURE.md](file:///C:/Users/djdje/Deckify/.planning/research/ARCHITECTURE.md) for full component diagrams and data flows. Milestone v0.7 preserves Deckify's decoupled 4-layer architecture while extracting four focused backend domain modules and two new frontend views so `main.py` and `engine.py` remain clean and maintainable.

**Major components:**
1. **`py_modules/cdp_bridge.py` (New)** — Caches the Spotify Client React Fiber `Platform.Registry` on `window.__deckifyRegistry` and provides a unified evaluator for `PlayerAPI`, `PlaylistAPI`, `OfflineAPI`, `SocialConnectAPI`, and `Pathfinder`.
2. **`py_modules/lyrics_engine.py` (New)** — Manages human-readable `.lrc` disk caching (`~/.cache/deckify/lyrics/`), per-track sync offset map (`track_id -> offset_ms`), and zero-dependency CJK romanization (NetEase `romalrc` + pure-Python Hangul/Kana/Pinyin).
3. **`py_modules/spectrum.py` (New)** — Spawns an on-demand `parec --monitor-stream` PCM tap at 11–16 kHz mono only when `TvSplitView` is active, computing 16 logarithmic frequency bands via pure-Python Goertzel/DFT at 15 Hz.
4. **`py_modules/stats.py` (New)** — Tracks monotonic wall-clock listening sessions correlated with `active_game_app_id`, manages the async Last.fm / ListenBrainz scrobble retry queue, and handles sanitized JSON profile backup/restore.
5. **`TvSplitView.tsx`, `StatsTab.tsx`, `JamModal.tsx` & `useDynamicTheme.ts` (New Frontend)** — First-class `ViewMode` integrations inside `DeckifyExpandedModal` plus decoupled silent toast/chord feedback routing in `DeckifyOverlay.tsx`.

### Critical Pitfalls

See [PITFALLS.md](file:///C:/Users/djdje/Deckify/.planning/research/PITFALLS.md) for all 10 pitfalls, verification checklists, and self-healing recovery strategies.

1. **Dual-Engine Contention & Silent CDP Fallbacks (`CDP-01`, `DISC-04`, `QUEUE-03`, `POD-01`, `RADIO-01`)** — Never run `librespot` and `com.spotify.Client` simultaneously; implement a strict engine capability matrix where CDP features gracefully fall back to URI-slice queue mutation and Top-Tracks/Search synthesis when `librespot` is active, or offer a 1-click engine switch for `CDP-01` offline downloads.
2. **Four-Way Audio Priority Collision (`GAME-01`)** — Applying a per-game EQ preset must never overwrite the user's persistent global `settings["eq_preset"]` on disk or override an active `SleepTimer` lock (`_sleep_locked`). Use an ephemeral EQ override layer in `EqualizerManager` with a crash-recovery snapshot (`active_game_override_snapshot`) restored on game exit or plugin boot.
3. **Steam Toaster Audio Chime Leak & Stuck Guide-Button Chords (`TOAST-01`, `CHORD-01`)** — SteamOS `toaster.toast` frequently ignores `playSound: false` and plays a loud UI chime in `steamwebhelper`. Bypass `toaster.toast` completely when `toast_sound_enabled === false` by rendering a 3.5s silent banner inside `DeckifyOverlay` (`pointerEvents: "none"`), even when persistent HUD is disabled. Add a 4-second wall-clock expiry to `guideHeld` and block reserved Valve system chords (`STEAM + X/R1/L1`).
4. **D-Pad Spatial Focus Loss on Queue/Playlist Reorder & Deep Drill-Down (`QUEUE-03`, `PL-01`, `RADIO-01`)** — Attach stable instance `_rowKey` IDs (`${uri}::${uid}`) so swapping duplicate tracks never unmounts the focused DOM node, batch reorder API commits on drop rather than every D-pad press, and use a `navigationHistoryRef` stack so pressing `B` cleanly unwinds multi-level Artist → Album → Track drill-downs.
5. **64GB eMMC Storage Exhaustion & Wake-from-Suspend False Travel Mode (`CDP-01`)** — Enforce an `os.statvfs` 3.0 GB minimum free-space guardrail before/during CDP offline downloads so `/home/deck` never fills up, and delay automatic Travel Mode activation until after `resilience.py`'s 10-second wake-from-suspend Wi-Fi reconnect window.

## Implications for Roadmap

Based on technical dependencies across backend services and frontend components, Milestone v0.7 should be structured into **7 sequential phases** (continuing from v0.6 Phase 18 as **Phases 19–25**):

### Phase 19: In-Game Immersion — Per-Game EQ Profiles, Silent HUD Toasts & Extended Quick-Chords
**Rationale:** Directly extends v0.6's `equalizer.py`, `soundtrack.py`, and `DeckifyOverlay.tsx` with zero external API risks. Establishing the silent `deckify:hud_toast` event bus in `DeckifyOverlay` first is a prerequisite for both silent track-change notifications and in-game quick-chord visual feedback.
**Delivers:** Ephemeral per-game 10-band EQ & volume/ducking overrides with crash recovery (`py_modules/soundtrack.py`, `equalizer.py`), decoupled 100% silent track-change toasts in `DeckifyOverlay.tsx`, and configurable in-game quick-chords (`Like ♥`, `Cycle Pinned Playlists 1–4`, `Toggle Lyrics HUD`) with 4s `guideHeld` expiry guard.
**Addresses:** `GAME-01`, `TOAST-01`, `CHORD-01`
**Avoids:** Pitfall 3 (Four-Way Audio Priority Collision), Pitfall 4 (Steam Toaster Audio Leak), Pitfall 5 (Steam Input Chord Leakage & Guide Button Race).

### Phase 20: Dynamic Album-Art Themes, Handheld Battery Eco-Mode & Connect Hub 2.0
**Rationale:** Establishes the WCAG-clamped `--deckify-accent` CSS custom property pipeline and the `ECO-01` battery/gameplay power governor before `TvSplitView` and `SpectrumAnalyzer` are built, while upgrading `DevicesTab` with 1-click auto-wake playback transfer (`pull_playback_to_deck`) reused by later Radio and Jam flows.
**Delivers:** Album-art dominant color extraction with WCAG AA contrast clamping (`useDynamicTheme.ts` / `images.py`), `/sys/class/power_supply` Battery Eco-Mode governor (pausing visualizers and suspending idle daemons after configurable pause timeouts during battery gameplay), and Connect Hub 2.0 (1-click auto-wake *"Pull Playback to Steam Deck"*, device icons, engine badges, debounced remote volume slider).
**Addresses:** `THEME-01`, `ECO-01`, `CONNECT-01`
**Avoids:** Pitfall 2 (Unclamped dynamic theme contrast & idle battery drain), Performance Trap (Eco-Mode aggressive engine kill during brief pause).

### Phase 21: Lyrics 2.0 & Podcast / Audiobook Power Suite
**Rationale:** The upgraded `.lrc` disk cache, per-track `±0.5s` sync offset persistence, and CJK romanization engine (`py_modules/lyrics_engine.py`) must exist before `TvSplitView` (Phase 25) embeds 10-foot dual-line karaoke lyrics and before `CDP-01` (Phase 24) uses offline cached lyrics in Travel Mode. Simultaneously upgrades `usePlaybackClock` and `NowPlayingTab` for variable speed (`0.75x–2.0x`) and `±15s` episode smart-skipping.
**Delivers:** `py_modules/lyrics_engine.py` (standard `.lrc` disk cache, immutable timestamps + separate `track_lyrics_offsets` index synced live with `DeckifyOverlay`, NetEase `romalrc` + pure-Python Hangul/Kana/Pinyin romanizer) and Podcast Power Suite (`0.75x–2.0x` playback speed with auto-reset to `1.0x` on music tracks, `±15s` transport & L2/R2 trigger adaptation, `Unplayed / In Progress` filters, episode progress bars).
**Addresses:** `LYRICS-01`, `POD-01`
**Avoids:** Pitfall 8 (CJK Romanization C-Extension Bloat & Double-Applied Sync Offset Drift), Pitfall 10 (Podcast Speed Leaking Back Into Music Playback).

### Phase 22: Universal Drill-Down, Instant Radio, Crossfade & Search 2.0
**Rationale:** Introduces the `navigationHistoryRef` breadcrumb stack in `DeckifyExpandedModal.tsx` so `"Go to Artist"` and `"Go to Album"` work universally across all existing and upcoming views with predictable `B`-button back-navigation, alongside the 3-tier resilient Radio generator, native crossfade (`0–12s`), and Search 2.0.
**Delivers:** Universal Artist/Album drill-down with backstack restoration, 3-tier Song/Artist Radio waterfall (CDP `PlayerAPI`/station → Web API recommendations → Top-Tracks/Search synthesis fallback), `0–12s` Crossfade slider (`prefs` + CDP + fader), and Search 2.0 (recent search history pills, 12 curated Gaming/Mood browse tiles on empty query, `Podcasts` and `Episodes` filter tabs).
**Addresses:** `RADIO-01`, `SEARCH-01`
**Avoids:** Pitfall 1 (Dev Mode 404 on `/v1/recommendations`), Pitfall 6 (Drill-down breadcrumb loss), Pitfall 10 (Honest crossfade wiring).

### Phase 23: Unified CDP Bridge, Interactive Queue Studio, Playlist Studio & Discovery 2.0
**Rationale:** Extracts `py_modules/cdp_bridge.py` with cached `window.__deckifyRegistry` lookup on port `9229`, immediately powering the three highest-value library/playback capabilities that Spotify Web API restricts or lacks: interactive queue mutation (`PlayerAPI` + URI-slice fallback for `librespot`), full controller playlist management (`PlaylistAPI` + Web API CRUD), and personalized algorithmic mixes (*Daylist*, *Discover Weekly*, *Release Radar*, *Daily Mixes*) in `DiscoveryTab`.
**Delivers:** `py_modules/cdp_bridge.py`, `QueueTab.tsx` Controller Grab/Move Mode (reorder, remove track, clear queue with stable `_rowKey` focus lock and dual CDP/URI-slice execution), `PlaylistsTab.tsx` full CRUD (create, rename, delete confirm, reorder/remove tracks with batched commits), and `DiscoveryTab.tsx` CDP Pathfinder/Rootlist *Made For You* integration with local metadata caching for `librespot` hand-off.
**Addresses:** `QUEUE-03`, `PL-01`, `DISC-04`
**Avoids:** Pitfall 1 (Dual-Engine Contention & Dev Mode 403/404 on algorithmic playlists), Pitfall 6 (D-Pad Focus Loss & React Key Remounting During Reorder).

### Phase 24: CDP Offline Downloads, Wi-Fi Travel Mode & Living Room Spotify Jam
**Rationale:** Builds directly on `py_modules/cdp_bridge.py` from Phase 23 to integrate `OfflineAPI` (native offline playlist/album/episode caching) and `SocialConnectAPI` / `ConnectAPI` (living-room Spotify Jam sessions with on-screen QR codes), pairing `OfflineAPI` with `resilience.py`'s Wi-Fi monitor for automatic Travel Mode filtering.
**Delivers:** "Download for Offline" toggle & progress indicators (`0–100%`, green `✓` badge) on playlists, albums, and episodes when `spotify_client` is active (with 1-click engine switch prompt on `librespot`), `os.statvfs` 3.0 GB free-space disk guardrail, automatic Wi-Fi disconnect Travel Mode filter (respecting the 10s wake-from-suspend grace window), and `JamModal.tsx` (`QRCodeSVG` living-room session sharing + deep-link fallback).
**Addresses:** `CDP-01`, `JAM-01`
**Avoids:** Pitfall 1 (Silent CDP failure on `librespot`), Pitfall 7 (64GB eMMC Storage Exhaustion & Wake-from-Suspend Travel Mode False Trigger).

### Phase 25: 10-Foot Docked TV Split-View, PipeWire Spectrum Visualizer & "Deck Wrapped" Analytics / Scrobbling
**Rationale:** Serves as the capstone phase because `TvSplitView.tsx` combines the dynamic accent theme (Phase 20), Eco-Mode governor (Phase 20), Lyrics 2.0 dual-line romanized karaoke display (Phase 21), Queue Studio preview (Phase 23), and living-room Jam QR corner card (Phase 24) alongside the isolated `parec` 16-band spectrum analyzer (`py_modules/spectrum.py`). Simultaneously delivers `py_modules/stats.py` and `StatsTab.tsx` ("Deck Wrapped" with *Top Game + Soundtrack Pairings*, Last.fm/ListenBrainz scrobbling, and 1-click JSON backup/restore covering the complete v0.7 settings schema).
**Delivers:** `TvSplitView.tsx` (10-foot typography, manual toggle + auto-activation on `dock_state_changed`), `py_modules/spectrum.py` (isolated `--monitor-stream` 16-band pure-Python Goertzel tap at 15 Hz, strictly modal-scoped and Eco-Mode guarded), and `py_modules/stats.py` + `StatsTab.tsx` (monotonic wall-clock play tracker, game correlation analytics, offline-resilient Last.fm & ListenBrainz scrobbler, and secret-redacted 1-click JSON profile backup/restore).
**Addresses:** `TV-01`, `STATS-01`
**Avoids:** Pitfall 2 (Visualizer CPU/IPC Starvation & Default Sink Audio Bleed), Pitfall 9 (Seek-Fooled Scrobbles & OAuth Token Leakage in JSON Backup).

### Phase Ordering Rationale

- **Foundation-first dependency chain:** Silent HUD toast routing (`Phase 19`), dynamic CSS accent tokens + Eco-Mode power rules (`Phase 20`), and the `.lrc`/romanized lyrics engine (`Phase 21`) are built before the components that consume them (`CHORD-01`, `CDP-01` Travel Mode, and `TV-01` Docked Split-View).
- **Shared infrastructure consolidation:** All four CDP-intensive pillars (`QUEUE-03`, `DISC-04`, `CDP-01`, `JAM-01`) are grouped into consecutive phases (`Phases 23–24`) around `py_modules/cdp_bridge.py`, preventing duplicate React Fiber traversal logic and guaranteeing consistent `librespot` fallbacks.
- **Capstone integration:** Placing `TV-01` and `STATS-01` in `Phase 25` allows the 10-Foot TV Split-View to embed every v0.7 visual and social upgrade (Romanized Lyrics, Dynamic Theme, Queue Preview, Jam QR) and ensures the 1-Click JSON Profile Backup serializes the final v0.7 settings schema cleanly.

### Research Flags

Phases likely needing deeper research or prototype verification during `/gsd-plan-phase`:
- **Phase 23 (`cdp_bridge.py` — `PlayerAPI` & `Pathfinder`):** Spotify's Flatpak CEF client occasionally renames internal prototype methods on `PlayerAPI._queue` and Pathfinder `queryHome` across client updates. Plan dynamic prototype method discovery (`typeof api.reorderQueue === 'function'`) with deterministic URI-slice and Search fallbacks.
- **Phase 24 (`CDP-01` `OfflineAPI` & `JAM-01` `SocialConnectAPI`):** Verify exact method signatures for `OfflineAPI` (`makeAvailableOffline` vs `enableOffline`) and `SocialConnectAPI` session creation inside the target Spotify Flatpak build, ensuring graceful fallback to shareable Connect/Jam deep-link QR codes when `SocialConnectAPI` is unavailable.

Phases with well-documented, established codebase patterns (skip `--research-phase`):
- **Phase 19 (`GAME-01`, `TOAST-01`, `CHORD-01`):** Directly extends existing `py_modules/soundtrack.py`, `py_modules/equalizer.py`, `src/index.tsx` chord listener, and `DeckifyOverlay.tsx`.
- **Phase 20 (`THEME-01`, `ECO-01`, `CONNECT-01`):** Uses standard sysfs battery reads, existing base64 image pipeline, and v0.5 engine auto-wake + Spotify Connect Web API endpoints.
- **Phase 21 (`LYRICS-01`, `POD-01`):** Builds directly on `py_modules/spotify.py` 5-tier lyrics waterfall (which already fetches NetEase `/api/song/lyric` containing `romalrc`) and `usePlaybackClock.ts`.
- **Phase 22 (`RADIO-01`, `SEARCH-01`):** Standard React breadcrumb ref stack and Spotify search/playlist endpoints.
- **Phase 25 (`TV-01`, `STATS-01`):** Uses `dock.py` hotplug events, `parec --monitor-stream` with `resolve_spotify_sink_input_ids()`, and standard Last.fm v2.0 / ListenBrainz v1 REST specs.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | 100% pure Python 3.11+ stdlib and existing `package.json` dependencies (`@decky/ui`, `qrcode.react`); zero C-extension or CEF CSP risks. |
| Features | HIGH | All 14 pillars have well-defined controller user flows, clear prioritization, and explicit fallbacks for Spotify Web API Dev Mode restrictions. |
| Architecture | HIGH | Directly grounded in Deckify v0.6's production modular architecture (`main.py`, `engine.py`, `equalizer.py`, `dock.py`, `resilience.py`). |
| Pitfalls | HIGH | Derived from real SteamOS 3.5–3.7 hardware, PipeWire, Gamescope, and Spotify Client CDP behavior with concrete verification gates. |

**Overall confidence:** HIGH

### Gaps to Address

- **Spotify Client Internal CDP Prototype Variance (`Phases 23–24`):** Because Spotify's desktop client obfuscates or updates internal `Platform.Registry` method names across versions, all `cdp_bridge.py` calls must inspect available prototype methods dynamically and wrap execution in a `4.0s` timeout with immediate Web API / URI-slice fallback.
- **Dominant Color Extraction Location (`Phase 20`):** `STACK.md` notes offscreen `24x24` `<canvas>` extraction on already-fetched `data:image/jpeg;base64` URIs, while `ARCHITECTURE.md` and `PITFALLS.md` recommend Python-side extraction in `py_modules/images.py` cached alongside `.meta` files. **Resolution:** Perform extraction in Python (`py_modules/images.py`) or cache the computed WCAG-clamped hex color in the backend metadata payload (`track_metadata.accent_color`) with a lightweight frontend utility fallback so both `DeckifyOverlay` (when the modal is closed) and `DeckifyExpandedModal` receive the identical `--deckify-accent` color with zero UI-thread canvas work.

## Sources

### Primary (HIGH confidence)
- [main.py](file:///C:/Users/djdje/Deckify/main.py) & [py_modules/engine.py](file:///C:/Users/djdje/Deckify/py_modules/engine.py) — Single-active-engine invariant, raw RFC 6455 WebSocket CDP client on port `9229`, React Fiber `Platform.Registry._map` resolution (`RootlistAPI`, `LibraryAPI`, `PlaylistAPI`), Spotify `prefs` management, and `resolve_spotify_sink_input_ids()` stream isolation.
- [py_modules/equalizer.py](file:///C:/Users/djdje/Deckify/py_modules/equalizer.py), [py_modules/volume.py](file:///C:/Users/djdje/Deckify/py_modules/volume.py), [py_modules/soundtrack.py](file:///C:/Users/djdje/Deckify/py_modules/soundtrack.py), & [py_modules/dock.py](file:///C:/Users/djdje/Deckify/py_modules/dock.py) — 10-band PipeWire `filter-chain` DSP, `VolumeFader` priority locks (`_sleep_locked`), per-game AppLifetime launch/exit snapshots, and `pactl subscribe` USB/HDMI dock hotplug detection.
- [py_modules/spotify.py](file:///C:/Users/djdje/Deckify/py_modules/spotify.py) & [py_modules/resilience.py](file:///C:/Users/djdje/Deckify/py_modules/resilience.py) — 5-tier lyrics waterfall (including NetEase `/api/song/lyric` `romalrc` payload), HTTP 429 circuit breaker, `--onevent` `AF_UNIX` push server, and `WIFI_GRACE_WINDOW_S` / `RECOVERY_COOLDOWN_S` wake resilience.
- [src/index.tsx](file:///C:/Users/djdje/Deckify/src/index.tsx), [src/components/DeckifyExpandedModal.tsx](file:///C:/Users/djdje/Deckify/src/components/DeckifyExpandedModal.tsx), & [src/components/DeckifyOverlay.tsx](file:///C:/Users/djdje/Deckify/src/components/DeckifyOverlay.tsx) — `FocusNavController` global gamepad chord registration, Gamescope HUD overlay lifecycle, and `@decky/ui` spatial navigation constraints.

### Secondary (MEDIUM confidence)
- **Spotify Web API November 2024 Change Notice** — Confirmed Dev Mode deprecations (`HTTP 403/404`) for `/v1/recommendations`, `/v1/browse/categories`, `/v1/browse/featured-playlists`, and Spotify-owned algorithmic playlists (`37i9dQZF1E...`).
- **Spicetify `Platform.Registry` & Pathfinder Specifications** — Verified internal service identifiers (`PlayerAPI`, `PlaylistAPI`, `OfflineAPI`, `SocialConnectAPI`, Pathfinder `queryHome`) exposed inside Spotify's CEF desktop client.
- **Last.fm Audioscrobbler REST v2.0 & ListenBrainz v1 Specifications** — Verified MD5 API signature construction, Bearer token JSON payloads, and standard scrobble threshold rules (track `>= 30s`, played `>= 50%` or `>= 240s` accumulated wall-clock time).

---
*Research completed: 2026-11-18*
*Ready for roadmap: yes*
