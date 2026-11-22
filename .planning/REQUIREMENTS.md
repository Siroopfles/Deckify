# Requirements: Milestone v0.7 Studio, Living Room TV, Offline Travel & Ultimate Immersion

**Defined:** 2026-11-18
**Milestone:** v0.7
**Core Value:** Rock-solid Spotify playback and responsive, reliable controller navigation on Steam Deck without UI lag, broken images, or desynchronized playback states.

---

## v0.7 Requirements

### In-Game Immersion, Audio Profiles & Quick-Chords

- [x] **GAME-01**: User can bind a per-game 10-band PipeWire EQ preset and target volume/ducking level to any Steam game profile in `SoundtracksTab`, automatically applying an ephemeral override on game launch and restoring the user's global EQ/volume baseline on game exit or crash recovery without overwriting persistent settings or interrupting an active Sleep Timer lock.
- [x] **TOAST-01**: When `toast_sound_enabled` is `false`, track-change notifications render as a 100% silent 3.5-second banner inside `DeckifyOverlay` (`pointerEvents: "none"`), completely bypassing Steam's `toaster.toast` UI chime even when the persistent HUD overlay is hidden.
- [x] **CHORD-01**: User can trigger configurable in-game controller quick-chords (with a 4-second `guideHeld` expiry guard and no Valve system chord collisions) to Like/Unlike (`♥`) the current track, cycle through the 4 Pinned Playlists, or toggle the Lyrics HUD, receiving instant silent visual confirmation in `DeckifyOverlay`.

### Dynamic Album-Art Themes, Battery Eco-Mode & Connect Hub 2.0

- [x] **THEME-01**: User can switch between *Classic Spotify Green*, *Dynamic Album Glow* (dominant cover-art accent color extracted from proxied artwork and WCAG luminance-clamped to `L >= 55%` for controller focus visibility), and *SteamOS Deck Blue* across the modal and HUD.
- [x] **ECO-01**: User can enable Handheld Battery Eco-Mode to automatically suspend background spectrum visualizers/animations during active gameplay on battery and put an idle paused playback engine to sleep after a configurable inactivity timeout (`5–30 min`, disabled when AC-powered/docked).
- [ ] **CONNECT-01**: User can view device type icons and active engine badges (`librespot` vs `Spotify Client`) in `DevicesTab`, wake the local Deckify engine and pull playback from any external device with a single *"Pull Playback to Steam Deck"* action, and adjust remote Spotify Connect device volume via a debounced slider.

### Lyrics 2.0 & Podcast / Audiobook Power Suite

- [ ] **LYRICS-01**: Synced and plain lyrics are automatically cached as local `.lrc` files (`~/.cache/deckify/lyrics/`) for `0ms` repeat loads and Offline Travel Mode support, paired with persistent per-track `-0.5s` / `+0.5s` sync offset nudging in `LyricsTab` that synchronizes live with `DeckifyOverlay`.
- [ ] **LYRICS-02**: User can toggle phonetic romanization in `LyricsTab` and `TvSplitView` to display dual-line Romaji (Japanese), Revised Romanization (Korean), or Pinyin (Chinese) beneath CJK lyrics using upstream phonetic data and a zero-dependency pure-Python transliterator.
- [ ] **POD-01**: When a podcast episode or audiobook is playing, `NowPlayingTab` and QAM expose playback speed controls (`0.75x`–`2.0x`, automatically resetting to `1.0x` on music tracks) and dedicated `-15s` / `+15s` smart-skip transport actions (plus L2/R2 trigger adaptation).
- [ ] **POD-02**: User can view per-episode resume progress bars and *"Played"* badges (`resume_point`) in `PodcastsTab` and filter episodes by *All*, *Unplayed*, or *In Progress*.

### Universal Drill-Down, Instant Radio, Crossfade & Search 2.0

- [ ] **RADIO-01**: User can select *"Start Song Radio"*, *"Go to Artist"*, or *"Go to Album"* from any track (`TrackActionModal`, `NowPlayingTab`, `QueueTab`, `SearchTab`), using a 3-tier radio waterfall (CDP station → Web API → Top-Tracks/Search synthesis fallback) and a breadcrumb backstack (`navigationHistoryRef`) that restores the exact originating tab on `B`.
- [x] **RADIO-02**: User can configure native track Crossfade (`0–12s`) in `SettingsTab`, synchronized across Official Spotify Client CDP preferences, `librespot` / `spotifyd` engine config, and smooth transition handling.
- [ ] **SEARCH-01**: When the search query in `SearchTab` is empty, user can select from recent search history pills (with individual/all clear) or 12 controller-friendly Gaming & Mood genre browse tiles without opening the virtual keyboard.
- [ ] **SEARCH-02**: User can search and filter specifically by `Podcasts` (`show`) and `Episodes` (`episode`) in `SearchTab` alongside Tracks, Artists, Albums, and Playlists.

### Unified CDP Bridge, Interactive Queue Studio, Playlist Studio & Discovery 2.0

- [ ] **QUEUE-03**: User can enter controller Grab/Move Mode on any upcoming track in `QueueTab` to reorder it up/down with D-pad focus locked (via stable `_rowKey` IDs and batched commit), remove individual tracks, or clear the upcoming queue via CDP `PlayerAPI` with an automatic URI-slice playback fallback on `librespot`.
- [ ] **PL-01**: User can create new playlists, rename or edit playlist descriptions, delete/unfollow playlists with confirmation, and reorder or remove tracks inside user-owned playlists directly from the controller.
- [ ] **DISC-04**: `DiscoveryTab` unlocks personalized Spotify algorithmic mixes (*Daylist*, *Discover Weekly*, *Release Radar*, *Daily Mix 1–6*) via a unified CDP Pathfinder/Rootlist bridge (`py_modules/cdp_bridge.py`), caching resolved track URIs so both `spotify_client` and `librespot` can play them.

### CDP Offline Downloads, Travel Mode & Living Room Spotify Jam

- [ ] **CDP-01**: User can toggle *"Download for Offline"* on playlists, albums, and podcast episodes via Official Spotify Client CDP `OfflineAPI` (with a 1-click engine switch prompt when on `librespot`), displaying live download progress (`0–100%`), green offline badges, and an `os.statvfs` 3.0 GB free-space disk guardrail.
- [ ] **CDP-02**: User can toggle **Offline / Travel Mode** (or have it activate automatically on sustained Wi-Fi disconnect after the 10-second wake-from-suspend grace window) to filter library views strictly to locally downloaded content.
- [ ] **JAM-01**: User can start or share a Spotify Jam / group session from `NowPlayingTab`, `DevicesTab`, or `TvSplitView`, rendering a high-contrast scannable `QRCodeSVG` modal/card for living-room guests (with a shareable track/playlist deep-link QR fallback on `librespot`).

### 10-Foot Docked TV Split-View, Spectrum Visualizer & Listening Analytics / Scrobbling

- [ ] **TV-01**: User can toggle a **10-Foot Docked TV Split-View Mode** (`TvSplitView.tsx` — large cover art + dynamic glow on the left, 10-foot dual-line karaoke lyrics + queue preview + optional Jam QR badge on the right) manually or have it auto-activate when `DockAudioSwitcher` detects an external HDMI/USB-DAC dock.
- [ ] **TV-02**: When `TvSplitView` is open and actively playing, an optional 16-band real-time PipeWire audio spectrum visualizer (`parec --monitor-stream` tapped strictly to Deckify's audio stream at 15 Hz, zero game/voice bleed) animates smoothly via GPU-composited CSS `scaleY` transforms and terminates within `<100ms` on modal close, pause, or Eco-Mode activation.
- [ ] **STATS-01**: User can browse a dedicated *"Deck Wrapped" / Listening Stats* view (`StatsTab.tsx`) displaying total listening time, top tracks/artists on Steam Deck, and **Top Game + Soundtrack Pairings** tracked via monotonic wall-clock playback duration (`accumulated_play_ms`) correlated with `active_game_app_id`.
- [ ] **STATS-02**: User can enable built-in **Last.fm** and/or **ListenBrainz** scrobbling (following the standard 50% / 4-minute or 240s actual-play-time rule with an offline persistent retry queue) and export or import a secret-redacted 1-click JSON backup of all Deckify settings, game soundtrack profiles, custom EQ presets, and pinned playlists.

---

## Future Requirements (Backlog)

- **LOCAL-01**: Local MP3/FLAC file library browser (`/home/deck/Music`) integrated alongside Spotify library tabs.
- **VOICE-01**: Offline push-to-talk voice search (`"Play Synthwave"`) on Steam Deck microphone.
- **MULTI-01**: Multi-account Spotify profile switcher in `SettingsTab` for shared family Steam Decks.

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| 60 FPS audio spectrum visualizer inside in-game Gamescope HUD | Causes severe GPU composition frame-pacing drops (1% lows) in running AAA games; visualizer must remain strictly inside the full-screen `TvSplitView` modal. |
| DRM decryption or MP3/FLAC ripping for `librespot` offline mode | Violates Spotify ToS and risks user account suspension; offline downloads strictly use the Official Spotify Client's sanctioned `OfflineAPI`. |
| Heavy C-extension NLP dictionaries (`MeCab`, `fugashi`, `kuromoji.js`) | Breaks Decky Loader's PyInstaller Python sandbox (`LD_LIBRARY_PATH`) and bloats bundle size by 15–50 MB; romanization uses upstream NetEase/CDP phonetics + pure-Python Hangul/Kana/Unihan tables. |
| Pointer drag-and-drop for queue and playlist reordering | Breaks `@decky/ui` `FocusNavController` spatial D-pad navigation; reordering uses deterministic controller Grab/Move Mode. |

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| GAME-01 | Phase 19 | Complete |
| TOAST-01 | Phase 20 | Complete |
| CHORD-01 | Phase 20 | Complete |
| THEME-01 | Phase 21 | Complete |
| ECO-01 | Phase 21 | Complete |
| CONNECT-01 | Phase 22 | Pending |
| RADIO-02 | Phase 22 | Complete |
| LYRICS-01 | Phase 23 | Pending |
| LYRICS-02 | Phase 23 | Pending |
| POD-01 | Phase 24 | Pending |
| POD-02 | Phase 24 | Pending |
| RADIO-01 | Phase 25 | Pending |
| SEARCH-01 | Phase 25 | Pending |
| SEARCH-02 | Phase 25 | Pending |
| DISC-04 | Phase 26 | Pending |
| QUEUE-03 | Phase 27 | Pending |
| PL-01 | Phase 27 | Pending |
| CDP-01 | Phase 28 | Pending |
| CDP-02 | Phase 28 | Pending |
| JAM-01 | Phase 28 | Pending |
| TV-01 | Phase 29 | Pending |
| TV-02 | Phase 29 | Pending |
| STATS-01 | Phase 30 | Pending |
| STATS-02 | Phase 30 | Pending |

**Coverage:**
- v0.7 requirements: 24 total
- Mapped to phases: 24 (Phases 19–30)
- Unmapped: 0 ✓

---
*Requirements defined: 2026-11-18*
*Last updated: 2026-11-18 after v0.7 roadmap revision (Phases 19–30)*
