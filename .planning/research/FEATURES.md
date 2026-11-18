# Feature Research

**Domain:** Controller-Driven Steam Deck Spotify Client & Audio Engine (Deckify Milestone v0.7: Studio, Living Room TV, Offline Travel & Ultimate Immersion)
**Researched:** 2026-11-18
**Confidence:** HIGH

## Feature Landscape

Milestone v0.7 builds upon Deckify's validated v0.4–v0.6 foundation (modular frontend/backend, base64 CSP image proxy, monotonic playback clock, L2/R2 trigger navigation, PipeWire VolumeFader, 10-band biquad EQ, `pactl subscribe` dock hotplug watcher, `<5ms` `AF_UNIX` event push, and Official Spotify Client CDP React Fiber registry introspection).

Below is the comprehensive breakdown of the 14 target feature pillars for v0.7 across **Table Stakes** (baseline controller flows users expect when the feature is present), **Differentiators** (Steam Deck / GamepadUI-native advantages that elevate Deckify beyond standard desktop/web wrappers), and **Anti-Features** (patterns that degrade controller UX, framerate, or Spotify API quota).

---

### Table Stakes (Users Expect These)

Features and controller flows users assume exist once a capability pillar is introduced. Missing these makes the feature feel broken or half-baked on a handheld/console interface.

| Pillar | Feature & Controller User Flow | Why Expected | Complexity | Notes & Existing Hooks |
|--------|--------------------------------|--------------|------------|------------------------|
| **1. `TV-01` (10-Foot Docked TV Mode)** | **Big-Screen Split-View Layout & Manual Toggle:** Dedicated 10-foot layout combining high-res cover art + Now Playing transport on the left with live auto-scrolling karaoke lyrics and an "Up Next" queue preview (3–4 tracks) on the right. Accessible via a 1-click button in `NowPlayingTab` / QAM and exited cleanly with `B`. | Living-room docked users sitting 6–10 feet away cannot read 12px handheld list rows or switch between 3 separate tabs just to see lyrics and upcoming songs. | MEDIUM | Reuses `NowPlayingTab` transport, `LyricsTab` active line scroll, `QueueTab` slice, and base64 `DeckifyImage`. |
| **2. `QUEUE-03` & `PL-01` (Queue Studio & Playlists)** | **Controller Queue Manipulation & Playlist CRUD:** In `QueueTab`, pressing `X` or `A` opens actions or enters "Grab/Move Mode" (`D-Pad Up/Down` to reorder, `A` to drop, `Y` to remove track, "Clear Queue" header button). In `PlaylistsTab`, controller flows to Create Playlist (opens Steam OSK via `TextField`), Rename, Delete (with confirmation modal), and Remove/Reorder tracks inside user-owned playlists. | Standard music clients allow managing the active queue and curating playlists without picking up a phone or desktop PC. | HIGH | Web API lacks queue delete/reorder; requires CDP `PlayerAPI` (`removeFromQueue`, `reorderQueue`, `clearQueue`) with URI-slice `play_tracks` fallback for `librespot`. |
| **3. `CDP-01` (CDP Offline Downloads & Travel Mode)** | **Download Toggle, Progress & Offline Library Filter:** "Download for Offline" toggle on playlists, albums, and podcast episodes when running the `spotify_client` backend. Displays percentage/track progress (`42/50`), green downloaded checkmark badges (`✓`), and an "Offline Only" filter pill in library tabs. | Portable gaming handhelds are frequently used on planes, trains, and commutes without Wi-Fi. | HIGH | Requires Official Spotify Client (`com.spotify.Client`) CDP `OfflineAPI` (`enableOffline`, `disableOffline`, status observers). Must clearly show an engine badge/prompt if `librespot` is active. |
| **4. `DISC-04` (Deep Discovery 2.0 via CDP)** | **Personalized Algorithmic Mixes in `DiscoveryTab`:** Populates the *Made For You* horizontal carousel (`flow-children="horizontal"`) with real Spotify algorithmic mixes (*Daylist*, *Discover Weekly*, *Release Radar*, *Daily Mix 1–6*, *On Repeat*) and opens their tracklists in-place on `A`. | Spotify's core value proposition is personalized discovery; since Spotify locked Web API `/v1/browse` & algorithmic playlists in Dev Mode (403/404), users expect their mixes to appear natively. | HIGH | Uses CDP Pathfinder GraphQL (`home` / `ExtractedColors` / `PlaylistAPI`) via the Spotify Client React Fiber registry when available, caching metadata locally so mixes stay visible. |
| **5. `JAM-01` (Spotify Jam & Living Room QR)** | **Host/Leave Jam with Scannable On-Screen QR Code:** "Start a Jam" button in `QueueTab`, `DevicesTab`, and `TV-01` split-view. Renders a high-contrast `qrcode.react` modal/card on screen with the `spotify.link` / Jam join URI, participant count badge, and "End/Leave Jam" button. | When docked to a living-room TV, friends on the couch expect to scan the TV screen with their phones to queue tracks collaboratively. | HIGH | Spotify public Web API has no Jam endpoints; requires CDP `SocialConnectAPI` / `JamAPI` introspection in Official Spotify Client (`createSession`, `leaveSession`, `joinUrl`). |
| **6. `GAME-01` & `TOAST-01` (Per-Game Audio & Silent Toasts)** | **Per-Game EQ Preset Binding & Truly Silent HUD Toast:** In `SoundtracksTab`, each game card adds an `EQ Preset` dropdown alongside existing volume and ducking overrides. When `toast_sound_enabled` is `false`, track-change notifications bypass Steam's native `toaster.toast` (which plays a forced GamepadUI chime) and render via `DeckifyOverlay` completely silently. | Steam's CEF `toaster.toast` often ignores `playSound: false` in GamepadUI, startling players during quiet game cutscenes; different games need different EQ (e.g., `gaming` vs `bass`). | MEDIUM | Hooks into v0.5 `handle_app_lifetime_event` and v0.6 PipeWire `EqManager` + v0.4 `DeckifyOverlay` (`pointerEvents: "none"`). |
| **7. `POD-01` (Podcast & Audiobook Power Suite)** | **Playback Speed (`0.75x`–`2.0x`), `±15s` Smart-Skip & Unplayed Filter:** Automatic transport swap in `NowPlayingTab` and QAM when an episode (`spotify:episode:*`) is active, exposing `-15s` / `+15s` buttons and a playback speed selector (`0.75x`, `1.0x`, `1.25x`, `1.5x`, `1.75x`, `2.0x`). Adds an *Unplayed / In Progress* filter toggle and visual progress bars in `PodcastsTab`. | Listening to podcasts or audiobooks at `1.0x` without 15-second skip buttons or unplayed filtering is unusable for regular podcast listeners. | MEDIUM | QAM already has basic `±15s` buttons; needs parity in `NowPlayingTab`, CDP `PlayerAPI.setPlaybackSpeed` (or PipeWire/engine rate control), and `PodcastsTab` filtering on `fully_played` / `resume_position_ms`. |
| **8. `RADIO-01` (Track Radio, Drill-Down & Crossfade)** | **1-Click Song/Artist Radio, Universal Drill-Down & Crossfade Slider:** Selecting "Start Radio" in `TrackActionModal` or `Artist` view immediately queues and plays a 50-track radio mix. Selecting "Go to Artist" or "Go to Album" from *any* view (`NowPlaying`, `Queue`, `Search`, `Liked`, `Discovery`) navigates directly to the full Artist (Top Tracks + Discography) or Album detail view with `B`-button backstack support. Crossfade (`0–12s`) slider in `SettingsTab`. | Clicking an artist or album name or starting a radio station from a favorite song is fundamental navigation in every music app. | MEDIUM | `TrackActionModal` already renders the menu rows; needs reliable seed fallback when Web API `/v1/recommendations` returns 404/403 (via CDP `RadioAPI` / search-seed mix) and engine crossfade sync (`prefs` / CDP). |
| **9. `CHORD-01` (Extended In-Game Quick-Chords)** | **Configurable Guide-Button Chords with HUD Confirmation:** Extends the global `FocusNavController` button listener (`STEAM` or `...` held + button) to support: Like/Unlike current track (`♥`), Cycle next Pinned Playlist (`1→2→3→4`), and Toggle In-Game Lyrics HUD, with enable/disable toggles in `SettingsTab`. | Opening the QAM mid-combat in an action game takes 3–4 seconds and steals controller focus; players expect instant muscle-memory hotkeys. | LOW | Builds directly on `src/index.tsx` lines 1152–1204 (`RegisterForGamepadButtonDown`) and v0.5 `quick_play_pinned`. |
| **10. `STATS-01` (Listening Stats, Scrobbling & Backup)** | **Local Analytics View, Last.fm / ListenBrainz Scrobbler & JSON Backup:** Local SQLite/JSON listening tracker (recording track plays >30s or 50% duration). Built-in Last.fm (API key/session) and ListenBrainz (user token) scrobbler with "Now Playing" status and offline retry queue. 1-click Export/Import JSON backup of all Deckify settings, game profiles, pinned playlists, and stats. | Audiophiles and Linux users rely heavily on Last.fm/ListenBrainz and expect to back up their painstakingly configured per-game soundtrack profiles before a SteamOS factory reset. | MEDIUM | Hooks into v0.6 `<5ms` `onevent.sock` / track transition listener so scrobbles fire accurately even when the Deckify UI is closed. |
| **11. `SEARCH-01` (Search 2.0)** | **Recent Search History Pills, Empty-Query Browse Tiles & Podcast Filter:** When `SearchTab` query is empty, displays a horizontal row of recent search pills (with 1-click clear) above a controller-navigable grid of Genre & Mood tiles. Adds `Podcasts` and `Episodes` filter tabs (`type=show,episode`) alongside `All`, `Tracks`, `Artists`, `Albums`, `Playlists`. | Typing on a controller virtual keyboard (OSK) is slow; users expect 1-click recent searches, visual browse tiles, and the ability to find podcasts. | LOW | Extends `SearchTab.tsx` and `py_modules/spotify.py:search_spotify` (`type` parameter expansion + local `recent_searches` persistence). |
| **12. `LYRICS-01` (Lyrics 2.0)** | **Offline `.lrc` Disk Cache, Per-Track Sync Nudge (`±0.5s`) & Romanization:** Persistent disk cache (`~/.cache/deckify/lyrics/`) for fetched lyrics, `-0.5s` / `+0.5s` sync offset buttons in `LyricsTab` saved per `track_id`, and a toggleable Romanization pass for non-Latin scripts (Japanese Romaji, Chinese Pinyin, Korean Revised Romanization). | Community LRC timestamps on LRCLIB/NetEase are frequently off by 0.5s–2.0s; anime/J-Pop/K-Pop fans on Steam Deck expect readable romanized lyrics without re-fetching over the network. | MEDIUM | `LYRICS_CACHE_DIR` already exists in `py_modules/spotify.py`; needs per-track offset dictionary in settings/cache and lightweight offline transliteration/romanization rules. |
| **13. `CONNECT-01` (Spotify Connect Hub 2.0)** | **"Pull to Steam Deck" 1-Click Auto-Wake, Device Icons & Remote Volume:** Dedicated prominent header button in `DevicesTab` and QAM to pull active playback from a phone/PC to the Steam Deck (automatically starting `librespot` / `spotify_client` if stopped, waiting for registration, and calling transfer). Displays device type icons (Deck, PC, Phone, TV, Speaker), active engine badge, and a volume slider for the active remote device. | Previously, if Deckify's local engine was stopped, transferring playback to the Steam Deck required manually starting the engine in Settings, waiting 4 seconds, and reopening Devices. | MEDIUM | Upgrades `DevicesTab.tsx` (currently 55 lines) using v0.5 engine auto-wake logic and Web API `/v1/me/player` + `/v1/me/player/volume`. |
| **14. `THEME-01` & `ECO-01` (Dynamic Accents & Eco-Mode)** | **Album-Art Dominant Color UI/HUD Accents & Handheld Battery Eco-Mode:** Extracts a vibrant, contrast-safe dominant hex/RGB color from the current track's base64 cover art and applies it via CSS variables (`--deckify-accent`) to focus halos, progress bars, active pills, and HUD borders (with smooth CSS transitions). Eco-Mode suspends background audio spectrum visualizers, lowers idle polling, and terminates idle playback daemons after configurable pause timeouts on battery. | Modern music UIs (Spotify Desktop/Mobile, Apple Music) dynamically tint around cover art; Steam Deck battery life during handheld AAA gaming is precious and cannot be wasted by idle background processes. | MEDIUM | Color quantization runs once per track change on the already-fetched base64 image in Python or JS Canvas; Eco-Mode checks `/sys/class/power_supply/BAT*/status` + `currentRunningAppId`. |

---

### Differentiators (Competitive Advantage)

Features that set Deckify apart from generic web wrappers, Flatpak desktop clients, or basic MPRIS widgets by exploiting deep SteamOS, GamepadUI, and PipeWire integration.

| Pillar | Differentiator Feature | Value Proposition | Complexity | Notes & Technical Synergy |
|--------|------------------------|-------------------|------------|---------------------------|
| **1. `TV-01`** | **Auto-Activation on Dock Connect & Real-Time PipeWire Audio Spectrum Visualizer** | When the user drops their Steam Deck into an HDMI/USB-C dock, v0.6's `pactl subscribe` hotplug watcher can automatically switch the open Deckify modal into 10-Foot TV Split-View Mode. Includes an optional 60fps canvas spectrum visualizer fed by a lightweight PipeWire monitor tap on Deckify's isolated sink-input (zero game audio bleed). | HIGH | Combines v0.6 `DockMonitor` (`pactl subscribe`) + v0.6 `resolve_spotify_sink_input_ids` stream isolation. Must auto-pause spectrum capture when modal closes or Eco-Mode activates. |
| **2. `QUEUE-03` & `PL-01`** | **Button-Chord "Quick-Move" & Hybrid CDP / URI-Slice Queue Engine** | Instead of clumsy drag-and-drop, holding `A` (or pressing `X` → *Move*) locks a focus halo onto the track row so `D-Pad Up/Down` shifts it through the queue with instant visual swap feedback, working across *both* Official Spotify Client (via live CDP `PlayerAPI`) and `librespot` (via Deckify's custom shadow queue + sliced URI sequence). | HIGH | Solves Spotify Web API's famous inability to reorder or delete queued tracks, giving controller users desktop-grade queue studio control. |
| **3. `CDP-01`** | **Automatic Wi-Fi Disconnect "Travel Mode" Filter** | When v0.6's network resilience monitor detects offline/airplane mode, Deckify automatically activates a "Travel Mode" banner and filters `PlaylistsTab`, `AlbumsTab`, and `PodcastsTab` to downloaded items (plus cached `.lrc` lyrics and base64 cover art), preventing broken network spinners. | MEDIUM | Synergizes with v0.6 `RESIL-02` Wi-Fi state detection, v0.4 disk image cache (`~/.cache/deckify/images/`), and `LYRICS-01` `.lrc` disk cache. |
| **4. `DISC-04`** | **Hybrid CDP Discovery Cache with `librespot` Playback Hand-Off** | Fetches *Daylist*, *Discover Weekly*, and *Daily Mixes* via the Official Spotify Client's internal Pathfinder/CDP bridge, caches the resolved playlist metadata and track URIs to disk, and allows playing them even if the user switches back to lightweight `librespot` for low-RAM gameplay. | HIGH | Gives users the full algorithmic discovery power of the Official Spotify Client without forcing them to keep Chromium/CEF running during memory-heavy games. |
| **5. `JAM-01`** | **10-Foot TV Split-View Corner QR Overlay ("Couch Co-Op DJ")** | In `TV-01` Docked TV Mode, hosts can pin a compact, scannable Jam QR badge in the corner of the big-screen split-view alongside live karaoke lyrics, turning the docked Steam Deck into a living-room party/karaoke jukebox. | MEDIUM | Combines `TV-01` layout with `JAM-01` CDP session state and `qrcode.react`. |
| **6. `GAME-01` & `TOAST-01`** | **Atomic Per-Game Audio Snapshot (Playlist + Volume + Ducking + 10-Band EQ) & Zero-Focus Silent HUD Toast** | Launching *Cyberpunk 2077* automatically loads its linked Synthwave playlist, sets music volume to 45%, enables proportional voice/game ducking, and switches the PipeWire biquad DSP to the `Bass Boost` EQ preset—then restores the user's handheld baseline on exit. Track changes cross-fade a silent, dynamic-accent HUD toast in Gamescope (`pointerEvents: "none"`) with zero Steam UI beep. | MEDIUM | Unifies v0.5 Game Soundtracks (`Phase 7`), v0.5 Auto-Ducking (`Phase 6`), v0.6 10-Band EQ (`Phase 15`), and v0.4 Gamescope HUD (`Phase 5`). |
| **7. `POD-01`** | **Context-Aware L2/R2 Trigger Smart-Skip (`±15s`) & Per-Show Speed Memory** | While a podcast episode is playing, `L2` / `R2` trigger seeking in `NowPlayingTab` automatically adapts to crisp `±15s` podcast skip increments (with voice-optimized `Vocal` EQ suggestion) and remembers the user's preferred playback speed (`1.25x`, `1.5x`) per podcast show ID. | MEDIUM | Builds on v0.5 `useTriggerNavigation` Schmidt hysteresis (`0.75/0.25`) and `600ms` accumulation window. |
| **8. `RADIO-01`** | **Multi-Tier Radio Seed Generator (CDP RadioAPI → Web API Recommendations → Artist/Genre Top-Track Mix)** | Because Spotify deprecated `/v1/recommendations` for many Dev Mode apps in late 2024/2025, Deckify implements a resilient 3-tier radio generator: (1) Official Client CDP `RadioAPI` / station URI, (2) `/v1/recommendations` with seed track/artist, (3) automatic fallback synthesizing a shuffled 40-track mix from the artist's top tracks, album cuts, and related search hits. Radio never fails with a 404. | MEDIUM | Protects core UX from Spotify Web API Dev Mode restrictions, matching the resilience of v0.6 `LIB-01`. |
| **9. `CHORD-01`** | **Silent In-Overlay Micro-Toast Feedback for Chords** | Pressing `STEAM + Y` (Like Track), `STEAM + X` (Cycle Pinned Playlist `1→4`), or `STEAM + B` (Toggle Lyrics HUD) during gameplay renders an instant, 1.5-second silent badge inside `DeckifyOverlay` (`"♥ Added to Liked Songs"`, `"📌 Playing [2/4]: Night Drive"`, `"🎤 Lyrics HUD: ON"`) without triggering Steam's noisy system toast. | LOW | Uses `TOAST-01` silent overlay notification channel so in-game chords feel like native game HUD feedback. |
| **10. `STATS-01`** | **"Deck Wrapped" Game + Soundtrack Pairing Analytics** | Tracks not only top songs, artists, and listening minutes, but correlates playback with `activeGameAppId` to showcase *"Top Game + Soundtrack Pairings"* (e.g., *"You listened to 14.5 hours of Daft Punk while playing Balatro"*). | MEDIUM | Unique to a Steam Deck music plugin—neither Spotify Wrapped nor Last.fm knows which Steam game was running during playback. |
| **11. `SEARCH-01`** | **Gaming-Mood Quick Tiles & Instant L2/R2 Filter Tab Cycling** | Empty-search browse grid includes curated gaming-centric mood tiles (*"Boss Fight"*, *"Chill Grinding"*, *"Late Night Cozy"*, *"Synthwave/Cyberpunk"*, *"Lo-Fi Study/Deck"*) that launch instant mixes without typing a single character on the Steam OSK. | LOW | Eliminates the #1 friction point on handheld consoles (on-screen keyboard entry). |
| **12. `LYRICS-01`** | **Dual-Line Original + Romanized Karaoke Display & Live HUD Offset Sync** | Renders the original CJK script (`日本語 / 한국어 / 中文`) with the romanized phonetic line directly beneath it in both `LyricsTab` and `TV-01` Split-View, while applying the per-track `±0.5s` sync nudge immediately to the discrete `setTimeout` Gamescope HUD scheduler. | MEDIUM | Synchronizes `LyricsTab`, `TV-01`, and v0.5 `DeckifyOverlay` discrete lyrics scheduler from a single per-track offset store. |
| **13. `CONNECT-01`** | **Smart Engine-Aware "Pull to Deck" with Position & Queue Handshake** | Clicking *"Pull Playback to Steam Deck"* when the local daemon is cold-stopped or suspended by `ECO-01` automatically spawns `librespot` or `spotify_client`, polls until the local device ID appears in `/v1/me/player/devices` (or mDNS/ZeroConf), transfers playback at the exact millisecond offset, and applies the active dock/EQ profile. | MEDIUM | Turns a brittle 4-step manual troubleshooting flow into a single reliable controller button press. |
| **14. `THEME-01` & `ECO-01`** | **Smart Battery-Aware Eco-Governor & WCAG-Clamped Dynamic Palette** | `ECO-01` automatically detects when the Steam Deck is on battery (`Discharging`) *and* a game is running (`currentRunningAppId != null`) while music has been paused for `>5 minutes`, cleanly suspending the background audio engine and visualizers to save ~300–600mW of CPU/RAM draw, then transparently auto-waking on play chord or QAM open. `THEME-01` clamps extracted cover-art colors to WCAG AA luminance (`L* >= 55%`) so dark album covers never produce invisible focus rings. | MEDIUM | Directly protects Deckify's core value: responsive controller navigation (high-contrast focus rings) and zero battery/FPS penalty during handheld gaming. |

---

### Anti-Features (Commonly Requested, Often Problematic)

Features and implementation patterns that must be explicitly avoided in v0.7 to protect GamepadUI navigation, gaming framerates, and Spotify API stability.

| Anti-Feature | Why Requested | Why Problematic on Steam Deck | What to Do Instead |
|--------------|---------------|-------------------------------|--------------------|
| **Continuous 60fps Audio Spectrum Visualizer in In-Game Gamescope HUD (`TV-01`)** | Looks flashy to have an audio visualizer bar bouncing on top of a running game. | Continuous 60fps DOM/Canvas repaints inside Steam's transparent Gamescope overlay composer cause severe frame-pacing stutter (1% lows) and GPU composition overhead in AAA games (explicitly prohibited in `PROJECT.md` Out of Scope). | Restrict the real-time spectrum visualizer strictly to the open full-screen modal (`TV-01` Docked Split-View & `NowPlayingTab`) and immediately tear down the PipeWire capture stream + `requestAnimationFrame` loop when the modal closes or `ECO-01` activates. |
| **Drag-and-Drop Pointer/Mouse Queue Reordering (`QUEUE-03`)** | Familiar from desktop Spotify and touchscreens. | Completely breaks `@decky/ui` D-Pad spatial navigation (`FocusNavController`), causing focus loss where the controller cursor jumps to the sidebar or gets trapped. | Implement a deterministic controller **Grab/Move Mode**: press `X` (or select *Move Track* from `A`), use `D-Pad Up/Down` to shift the track index with focus locked to the moving row, and press `A` to commit or `B` to cancel. |
| **Scraping or Downloading DRM-Decrypted Audio Files to MP3/FLAC (`CDP-01`)** | Users want offline downloads to work in `librespot` or external media players. | Violates Spotify Terms of Service, triggers account bans, and requires brittle Widevine/key-extraction hacks. | Use the Official Spotify Client's sanctioned internal `OfflineAPI` via CDP (`com.spotify.Client` encrypted offline storage) for native offline caching, and clearly badge `CDP-01` as an Official Spotify Client engine feature. |
| **Unthrottled Background Polling of CDP `OfflineAPI` / `JamAPI` / `PlayerAPI` (`CDP-01`, `JAM-01`)** | Keeps download percentages and Jam participant lists updated every 250ms. | Flooding the port `9229` WebSocket CDP inspector from Python starves the Spotify Client renderer thread and spikes CPU usage during gameplay. | Poll CDP download progress at a gentle `2.0s` interval *only* while an active download is in progress or the modal is open, and use event-driven state or `5.0s` checks for Jam session status. |
| **Heavy External NLP / C-Extension Libraries for Lyrics Romanization (`LYRICS-01`)** | Libraries like `mecab-python3`, `fugashi`, or `pykakasi` with compiled C dictionaries give 99% morphological accuracy for Japanese Kanji. | Decky Loader runs inside a frozen PyInstaller environment where C extensions fail to load or clash with SteamOS system libraries (`LD_LIBRARY_PATH`), and bundling 50MB dictionaries bloats plugin zip size. | Use pure-Python stdlib/lightweight table transliteration for Hangul (algorithmic Jamo decomposition, ~40 lines of pure Python), Hiragana/Katakana (table mapping), Pinyin (compact pure-Python Unihan dict or CDP/NetEase native `romalrc` payload when provided by NetEase/Spotify), avoiding C dependencies entirely. |
| **Cloud/Server-Side Scrobble Proxy or Heavy SQLite ORM (`STATS-01`)** | Centralizing analytics or using SQLAlchemy. | Adds external server dependencies, privacy concerns, and unnecessary third-party Python packages in Decky's sandbox. | Store listening history in a lightweight stdlib `sqlite3` database (or capped atomic JSON log in `~/.config/deckify/stats.db`) on the device, and sign Last.fm MD5 API calls / ListenBrainz POST requests directly from Python stdlib `urllib.request`. |
| **Unclamped Raw Dominant Color Extraction for Focus Rings (`THEME-01`)** | Using the raw average RGB color of an album cover for UI buttons and focus halos. | Dark, black, or muddy brown album covers produce low-contrast focus halos on Deckify's `#121212` / `#1C1C1C` dark background, making it impossible to see which button has controller focus. | Convert extracted RGB to HSL/OKLCH and enforce a minimum lightness (`L >= 60%`) and saturation floor (`S >= 45%`) for focus halos and active text, falling back to Spotify Green (`#1db954`) for monochrome/grayscale covers. |
| **Aggressive Eco-Mode Killing Active Playback or Breaking Connect Discovery (`ECO-01`)** | Killing `librespot` the instant the user pauses a song. | If a user pauses for 30 seconds during a game cutscene, killing the daemon unregisters the Steam Deck from Spotify Connect and causes a 3-second cold-start delay when they unpause. | Only suspend the engine in `ECO-01` after a configurable idle pause grace period (default `5–10 minutes` while paused on battery during gameplay), while immediately suspending zero-latency visualizers/animations the moment the modal closes. |

---

## Detailed Feature Breakdown & Expected Controller User Flows (All 14 Pillars)

### 1. `TV-01`: 10-Foot Docked TV Split-View Mode & Audio Spectrum Visualizer
- **Controller User Flow:**
  1. **Activation:** User either clicks the *"TV Mode"* icon button in `NowPlayingTab` / QAM, presses `Select/View` while in `NowPlayingTab`, or docks the Steam Deck (when `tv_auto_activate_on_dock` is enabled, triggered by v0.6's `pactl subscribe` HDMI/USB-DAC hotplug detector).
  2. **10-Foot Split Layout:** The sidebar collapses into a minimal top pill bar or auto-hides after 4 seconds of controller inactivity.
     - **Left Pane (45% width):** Large 320×320px cover art with dynamic ambient color glow (`THEME-01`), oversized track title (`28px`), artist/album (`20px`), high-visibility seekbar, transport controls (`flow-children="horizontal"`), and optional corner Jam QR card (`JAM-01`).
     - **Right Pane (55% width):** Top 65% shows auto-scrolling high-contrast Karaoke Lyrics (`22px` active line, original + romanized if `LYRICS-01` enabled); bottom 35% shows *"Up Next"* Queue Preview (next 3–4 tracks, focusable to jump directly).
     - **Bottom Backdrop:** Optional 32-band smooth canvas audio spectrum visualizer driven by a PipeWire monitor tap on Deckify's isolated audio stream.
  3. **Exit:** Pressing `B` or clicking *"Exit TV Mode"* returns cleanly to standard handheld `DeckifyExpandedModal` layout with focus restored.

### 2. `QUEUE-03` & `PL-01`: Interactive Queue Studio & Full Controller Playlist Management
- **Controller User Flow (`QUEUE-03`):**
  1. In `QueueTab`, each upcoming track row supports pressing `A` (Play from here / Open Queue Actions) or inline action buttons (`Move`, `Remove`).
  2. **Reorder ("Grab Mode"):** Selecting *Move Track* highlights the row with a prominent dashed/accent border (`"Moving: [Track Name] — Use D-Pad Up/Down, press A to drop, B to cancel"`). Pressing `D-Pad Up` or `D-Pad Down` swaps the track in the list immediately; pressing `A` commits the new order via CDP `PlayerAPI` (or updates Deckify's sliced URI sequence for `librespot`).
  3. **Remove & Clear:** Selecting *Remove from Queue* removes the single track; a header button *"Clear Upcoming Queue"* clears all user-queued tracks with 1 click.
- **Controller User Flow (`PL-01`):**
  1. In `PlaylistsTab`, header buttons provide **"+ New Playlist"** (opens a focus-trapped modal with `TextField` for name + Public/Private toggle) and folder management.
  2. Inside any user-owned playlist detail view (`owner_id === current_user_id`), a header **"Edit Playlist"** button allows renaming the playlist, toggling public/collaborative state, or deleting/unfollowing it (with a 2-button confirm dialog).
  3. Pressing `A` on a track inside an owned playlist opens `TrackActionModal` with *"Move Position in Playlist"* (Grab Mode via `PUT /v1/playlists/{id}/tracks` `range_start` / `insert_before` + CDP `PlaylistAPI` fallback) and *"Remove from Playlist"*.

### 3. `CDP-01`: Native Spotify CDP Offline Downloads via `OfflineAPI` & Travel Mode
- **Controller User Flow:**
  1. Inside `PlaylistsTab` (detail view), `AlbumsTab` (detail view), or `PodcastsTab`, a header toggle button **"Download for Offline"** is displayed.
  2. If the user is on the `librespot` backend, clicking it explains that Offline Downloads require the **Official Spotify Client** engine and offers a 1-click *"Switch to Spotify Client & Download"* action.
  3. When active on `spotify_client`, Deckify calls CDP `OfflineAPI` to enable offline sync for the context URI (`spotify:playlist:...`, `spotify:album:...`, or episode). A live progress pill shows `"Downloading... 18 / 45 (40%)"` and transitions to a green `"✓ Downloaded"` badge upon completion.
  4. **Travel Mode:** Users can toggle an **"Offline Only"** filter pill at the top of library tabs at any time—or let Deckify auto-enable **Travel Mode** when v0.6's network monitor detects Wi-Fi disconnection—filtering lists strictly to downloaded collections and locally cached `.lrc` lyrics / cover art.

### 4. `DISC-04`: Personalized Spotify Mixes in Discovery via CDP Bridge
- **Controller User Flow:**
  1. Opening `DiscoveryTab` displays the **Made For You** carousel at the top.
  2. Backend queries the Official Spotify Client's internal CDP discovery/Pathfinder bridge (or cached CDP snapshot) to retrieve the user's personalized algorithmic playlists: *Daylist*, *Discover Weekly*, *Release Radar*, *Daily Mix 1–6*, *On Repeat*, and *Repeat Rewind*.
  3. Navigating the horizontal carousel (`flow-children="horizontal"`) with `D-Pad Left/Right` highlights each card with its dynamic cover art and descriptive subtitle (e.g., *"daylist • synthwave late night thursday"*).
  4. Pressing `A` opens the full tracklist inside Deckify (using `_cdp_get_playlist_tracks` from v0.6 Phase 13 so 403/404 Web API blocks on algorithmic `37i9dQZF1E...` playlist IDs are completely bypassed), with 1-click *"Play Mix"* and *"Pin to QAM"*.

### 5. `JAM-01`: Spotify Jam & Living Room QR-Code Session Sharing
- **Controller User Flow:**
  1. In `DevicesTab`, `QueueTab`, or `TV-01` Split-View, the user focuses and clicks **"Start a Jam"** (or **"Join/Manage Jam"** if a session is already active).
  2. Backend invokes CDP social session methods inside the Official Spotify Client to create or inspect the active Jam session and obtain the shareable join URL (`https://spotify.link/...` or `spotify:socialsession:...`).
  3. Frontend renders a clean, high-contrast QR Code card (`QRCodeSVG`) alongside the current host name, connected guest avatars/count, a toggle for *"Allow guests to control volume/playback"*, and an **"End Jam"** button.
  4. Friends in the living room scan the Steam Deck or TV screen with their phones' camera to join the queue immediately.

### 6. `GAME-01` & `TOAST-01`: Per-Game EQ Preset & Volume/Ducking Profiles + Silent HUD Toasts
- **Controller User Flow (`GAME-01`):**
  1. In `SoundtracksTab`, expanding a game card (e.g., *Elden Ring*, *Hades II*) exposes an **"EQ Preset Override"** dropdown (`Use Global`, `Flat`, `Bass Boost`, `Vocal`, `Gaming`, `Deck Speakers`, `Late Night`, `Custom`) directly alongside the existing Volume Override slider and Auto-Ducking toggle.
  2. When the game launches (`handle_app_lifetime_event(appId, True)` after 3.5s debounce), backend snapshots the pre-game EQ preset, switches PipeWire `EqManager` to the game's bound EQ preset, applies the volume/ducking target, and starts the game's soundtrack. On game exit (after 3.0s debounce), the pre-game EQ preset is restored.
- **Controller User Flow (`TOAST-01`):**
  1. When `toast_enabled` is `true` and `toast_sound_enabled` is `false` (the default for gamers who hate Steam's loud system notification pop sound), track changes *never* call `@decky/api`'s `toaster.toast()`.
  2. Instead, `DeckifyOverlay` (mounted globally in Gamescope with `pointerEvents: "none"`) displays a sleek, 3.5-second silent track-change toast card (cover art, track title, artist, and dynamic accent border) even if the permanent HUD is set to hidden—producing 0dB of UI audio bleed.

### 7. `POD-01`: Podcast & Audiobook Power Suite
- **Controller User Flow:**
  1. **Transport Auto-Adaptation:** Whenever the active track URI starts with `spotify:episode:` (or `track_type === "episode"`), `NowPlayingTab` and QAM automatically display `-15s` and `+15s` smart-skip buttons and a **Playback Speed Pill** (`1.0x` → cycles `0.75x`, `1.0x`, `1.25x`, `1.5x`, `1.75x`, `2.0x` on click or dropdown).
  2. **Trigger Adaptation:** Pressing `L2` / `R2` in `NowPlayingTab` during a podcast episode seeks by `-15s` / `+15s` increments.
  3. **Episode Management (`PodcastsTab`):** Adds filter pills at the top of `PodcastsTab`: `All Episodes`, `Unplayed`, and `In Progress`. Each episode row shows a green resume progress bar (`Resume 24:15 / 58:00`), a checkmark badge when completed, and a **"Mark as Played"** action in the episode action modal.

### 8. `RADIO-01`: Instant Song/Artist Radio, Deep Artist/Album Drill-Down & Crossfade
- **Controller User Flow:**
  1. **Universal Drill-Down:** From *any* track row in any tab (`NowPlayingTab` header, `QueueTab`, `LikedSongsTab`, `SearchTab`, `DiscoveryTab`, `RecentTab`), pressing `A` to open `TrackActionModal` and selecting **"Go to Artist"** or **"Go to Album"** fetches the target Artist (Top Tracks + Albums grid) or Album tracklist and navigates immediately. Pressing `B` pops the navigation history backstack to return to the exact originating tab and scroll position.
  2. **Instant Radio:** Selecting **"Start Song Radio"** in `TrackActionModal` or **"Start Artist Radio"** on an Artist detail page generates a continuous 40–50 track radio queue seeded by that track/artist (via CDP `RadioAPI` → Web API `/v1/recommendations` → intelligent artist/genre search-seed fallback) and begins playback immediately with a toast: `"📻 Started Radio based on [Track/Artist]"`.
  3. **Crossfade (`0–12s`):** In `SettingsTab`, a new **Crossfade** slider (`0s (Off)` to `12s`) configures native track crossfading in the active engine (`audio.crossfade_v2` / `audio.crossfade_time_ms` in Spotify Client `prefs` + CDP `PlayerAPI`, or `librespot` transition config).

### 9. `CHORD-01`: Extended In-Game Quick-Chords & HUD Feedback
- **Controller User Flow:**
  1. During active gameplay (without opening QAM or leaving the game), holding the `STEAM` (or `...` QAM) button and pressing:
     - `D-Pad Left / Right`: Previous / Next Track (existing)
     - `D-Pad Up / Down`: Volume +5% / -5% (existing)
     - `A`: Play / Pause (existing)
     - `Y` (New): **Like / Unlike Current Track (`♥`)**
     - `X` (New): **Cycle Next Pinned Playlist (`1 → 2 → 3 → 4`)** via `quick_play_pinned`
     - `B` (or `L1/R1`, configurable in `SettingsTab`) (New): **Toggle In-Game Lyrics HUD On/Off**
  2. Each chord triggers an immediate, silent 1.5-second confirmation pill inside `DeckifyOverlay` (`TOAST-01`) so the player sees instant visual confirmation without hearing a Steam UI beep or losing game input.
  3. `SettingsTab` provides individual toggles to enable/disable the extended action chords so they never conflict with custom Steam Input chord bindings if a user prefers them off.

### 10. `STATS-01`: Local "Deck Wrapped" Listening Analytics, Last.fm / ListenBrainz Scrobbling & Backup
- **Controller User Flow:**
  1. **Deck Wrapped View:** Accessible from `DiscoveryTab` (header pill *"📊 Deck Wrapped"*) or `SettingsTab`. Displays controller-scannable stat cards for `Last 7 Days`, `Last 30 Days`, and `All Time`:
     - Total Listening Time (minutes/hours) & Total Tracks Played
     - Top 5 Tracks & Top 5 Artists (clickable to play)
     - **Top Game + Soundtrack Pairings** (correlating listening time with `activeGameAppId`, e.g., *Hades II — 6.2 hrs · Top Artist: Darren Korb*).
  2. **Scrobbling (`SettingsTab`):** Dedicated section for **ListenBrainz** (enter User Token + Toggle Enable) and **Last.fm** (API authentication / session token + Toggle Enable). Scrobbler automatically submits `"Now Playing"` on track start and records a scrobble once a track plays for `>= 50%` of its duration (or `4 minutes`), queuing scrobbles to disk when offline and flushing automatically when Wi-Fi reconnects.
  3. **1-Click Profile Backup & Restore:** Buttons in `SettingsTab` to **"Export Profile Backup"** (writes `~/.config/deckify/backups/deckify-backup-YYYY-MM-DD.json` containing settings, per-game audio/EQ profiles, pinned playlists, custom lyric offsets, and listening stats) and **"Restore from Backup"**.

### 11. `SEARCH-01`: Search 2.0 (Recent History, Genre/Mood Tiles & Podcast Search)
- **Controller User Flow:**
  1. **Empty-Query Browse State:** When the user opens `SearchTab` before typing anything:
     - **Recent Searches:** A horizontal row (`flow-children="horizontal"`) of up to 8 recent search query pills (click `A` to re-run immediately) plus a *"Clear History"* pill.
     - **Genre & Gaming Mood Tiles:** A 3- or 4-column controller-navigable grid of colorful tiles (*Gaming & Boss Fights*, *Synthwave & Cyberpunk*, *Lo-Fi & Chill*, *Rock & Metal*, *Hip-Hop*, *Electronic*, *Anime & J-Pop*, *Podcasts & Tech*). Pressing `A` on a tile immediately loads curated playlists/tracks for that category.
  2. **Expanded Filter Tabs:** Once a query is entered, the horizontal filter bar includes: `All`, `Tracks`, `Artists`, `Albums`, `Playlists`, `Podcasts (Shows)`, and `Episodes`. Clicking a Podcast Show result drills down into its episode list; clicking an Episode plays it immediately with `POD-01` controls.

### 12. `LYRICS-01`: Lyrics 2.0 (Offline `.lrc` Cache, Per-Track Sync Offset & Romanization)
- **Controller User Flow:**
  1. **Offline `.lrc` Cache:** Every resolved lyric payload from the 5-tier waterfall (`Spotify CDP`, `LRCLIB`, `NetEase`, `Musixmatch`, `Lyrics.ovh`) is written as a human-readable `.lrc` / `.json` cache entry in `~/.cache/deckify/lyrics/` indexed by `track_id` and normalized `artist::title`, making lyrics load in `<5ms` on repeat plays and working 100% offline in `CDP-01` Travel Mode.
  2. **Per-Track Sync Nudge (`-0.5s` / `+0.5s`):** In `LyricsTab` header, alongside the source pills, three compact buttons appear: **`-0.5s`**, **`Offset: +0.0s` (Reset)**, and **`+0.5s`**. Clicking `-0.5s` or `+0.5s` shifts lyric timestamps immediately in both `LyricsTab` and the in-game `DeckifyOverlay` discrete scheduler, persisting the offset for that specific `track_id` in `~/.config/deckify/lyrics_offsets.json`.
  3. **Romanization Toggle:** A header pill **"Aa Romanize"** in `LyricsTab` toggles automatic phonetic romanization for Japanese (Kana/Kanji → Romaji), Korean (Hangul → Revised Romanization), and Chinese (Hanzi → Pinyin), displaying the romanized line below the original script in `LyricsTab`, `TV-01`, and optionally `DeckifyOverlay`.

### 13. `CONNECT-01`: Spotify Connect Hub 2.0
- **Controller User Flow:**
  1. Opening `DevicesTab` displays a top hero card showing the **Local Steam Deck Engine Status** (`librespot` or `Official Spotify Client` · `Running / Stopped` · `Lossless / 320kbps`) and a prominent 1-click button: **"⚡ Pull Playback to Steam Deck"**.
  2. If the user is currently listening on their phone or desktop PC and clicks **"Pull Playback to Steam Deck"**, Deckify automatically starts the local engine if stopped, waits for it to register with Spotify Connect, and transfers active playback to the Steam Deck in one seamless operation.
  3. **Device List Enhancements:** Each device row renders a distinct icon (`FaGamepad` for Steam Deck, `FaMobileAlt` for Smartphone, `FaDesktop` for Computer, `FaTv` for TV, `FaVolumeUp` for Speaker). When a remote device is active, a **Remote Device Volume Slider** (`0–100%`, debounced to prevent HTTP 429) appears at the top of `DevicesTab` so the user can adjust their living-room speaker or PC volume from the Steam Deck controller.

### 14. `THEME-01` & `ECO-01`: Dynamic Album-Art Accent Colors & Handheld Battery Eco-Mode
- **Controller User Flow (`THEME-01`):**
  1. Toggled via **"Dynamic Album Art Accents"** in `SettingsTab` (enabled by default).
  2. Whenever the active track's cover art changes, Deckify extracts the dominant vibrant color from the base64 image data, clamps its lightness/saturation in HSL/OKLCH for guaranteed dark-UI contrast, and updates root CSS custom properties (`--deckify-accent`, `--deckify-accent-glow`, `--deckify-accent-muted`) with a smooth `400ms` CSS transition.
  3. Focus halos (`focusHalo`), active sidebar pills, progress bars, `TV-01` ambient backdrop glow, and `DeckifyOverlay` borders dynamically shift to match the album art (falling back to `#1db954` Spotify Green when disabled or when no cover art is present).
- **Controller User Flow (`ECO-01`):**
  1. Toggled via **"Handheld Battery Eco-Mode"** in `SettingsTab` (`Off`, `Auto (On Battery)`, `Always On`).
  2. When active, `ECO-01`:
     - Immediately pauses any canvas audio spectrum visualizer (`TV-01`) and ambient background animations when the modal is closed or a game is running.
     - Extends background status polling intervals when playback is paused.
     - Automatically suspends the idle background playback engine (`librespot` / `spotify_client`) if playback remains **paused for >5 minutes** while a game is running on battery power, saving RAM and CPU wakes—then transparently auto-wakes the engine the instant the user presses a Play quick-chord or opens Deckify.

---

## Feature Dependencies

```text
v0.4–v0.6 Validated Foundation
 ├── Base64 Image Pipeline (Phase 2) ──────────requires──> THEME-01 (Dominant Color Extraction)
 ├── Gamescope HUD Overlay (Phase 5) ──────────requires──> TOAST-01 (Silent In-Overlay Track/Chord Toasts)
 │                                                           ├──enhances──> CHORD-01 (In-Game Chord Feedback)
 │                                                           └──enhances──> THEME-01 (Dynamic HUD Accent Border)
 ├── AppLifetime & PipeWire EQ (Phases 7, 15) ─requires──> GAME-01 (Per-Game EQ + Volume/Ducking Profiles)
 │                                                           └──enhances──> STATS-01 (Top Game + Soundtrack Pairings)
 ├── Dock Hotplug & Sink Isolation (Phase 16) ─requires──> TV-01 (10-Foot Docked Split-View & PipeWire Visualizer)
 │                                                           └──enhances──> JAM-01 (Living Room TV Corner QR Overlay)
 ├── Official Client CDP Bridge (Phase 13) ────requires──> DISC-04 (CDP Algorithmic Mixes in Discovery)
 │                                             requires──> CDP-01 (CDP OfflineAPI Downloads & Travel Mode)
 │                                             requires──> JAM-01 (CDP SocialConnect/Jam Session & QR)
 │                                             └──enhances──> QUEUE-03 & PL-01 (CDP PlayerAPI/PlaylistAPI + URI-Slice Fallback)
 └── AF_UNIX Push & Wake Resilience (Phase 17) requires──> STATS-01 (Accurate Event-Driven Scrobbling & Offline Queue)
                                               requires──> CONNECT-01 (Auto-Wake "Pull to Steam Deck")
                                               └──enhances──> ECO-01 (Idle Engine Suspend & Transparent Auto-Wake)

Cross-v0.7 Feature Dependencies:
LYRICS-01 (Offline .lrc Cache + Sync Nudge + Romanization)
 └──enhances──> TV-01 (10-Foot Karaoke Lyrics Pane)
 └──enhances──> CDP-01 (Offline Lyrics in Travel Mode)

TOAST-01 (Silent In-Overlay HUD Toast)
 └──required-by──> CHORD-01 (Silent Visual Confirmation for Like / Pin Cycle / Lyrics Toggle Chords)

RADIO-01 (Universal Artist/Album Drill-Down & Radio)
 └──enhances──> SEARCH-01 (Search Result & Podcast Drill-Down)
 └──enhances──> QUEUE-03 (Populate & Edit Radio Queue in QueueTab)
```

### Dependency Notes

- **`TOAST-01` should be built before or alongside `CHORD-01`:** Extended in-game chords (`CHORD-01`) need a 100% silent visual feedback mechanism in `DeckifyOverlay` so pressing `STEAM + Y` mid-game confirms `"♥ Liked"` without triggering Steam's noisy system chime.
- **`LYRICS-01` enhances `TV-01` and `CDP-01`:** Building the `.lrc` disk cache, per-track `±0.5s` offset memory, and romanization pipeline first allows `TV-01`'s 10-foot karaoke view and `CDP-01`'s offline Travel Mode to consume them immediately.
- **Shared CDP Registry Helper (`DISC-04`, `CDP-01`, `JAM-01`, `QUEUE-03`):** All four CDP-powered features introspect the Official Spotify Client's React Fiber Platform Registry (`LibraryAPI`, `PlaylistAPI`, `PlayerAPI`, `OfflineAPI`, `Pathfinder/GraphQL`). Extracting a unified, reusable `_cdp_call_platform_api()` helper in `py_modules/engine.py` eliminates duplicate boilerplate and reduces CDP socket contention.
- **`ECO-01` interacts with `TV-01` and `CONNECT-01`:** `ECO-01` must act as the lifecycle governor for `TV-01`'s PipeWire audio visualizer (ensuring the visualizer never runs when the modal is closed or on battery gameplay) and coordinate with `CONNECT-01` so an Eco-suspended engine wakes up cleanly on *"Pull to Steam Deck"*.

---

## MVP Definition & Phasing Strategy for v0.7

Because v0.7 is a comprehensive 14-pillar milestone on a mature codebase, features should be grouped into logical, testable vertical slices ordered by technical dependencies:

### Wave 1: In-Game Immersion, Audio Profiles & HUD Polish (Low Risk, High Daily Value)
- [ ] **`GAME-01` & `TOAST-01`** — Per-Game EQ Preset binding in `SoundtracksTab` + 100% silent in-overlay track-change & action HUD toasts.
- [ ] **`CHORD-01`** — Configurable in-game quick-chords (`Like ♥`, `Cycle Pinned Playlists 1–4`, `Toggle Lyrics HUD`) using `TOAST-01` silent feedback.
- [ ] **`THEME-01` & `ECO-01`** — WCAG-clamped dominant album-art accent colors across modal/HUD + Handheld Battery Eco-Mode idle governor.

### Wave 2: Content Navigation, Search 2.0, Podcasts, Radio & Lyrics 2.0 (Core Controller UX)
- [ ] **`RADIO-01`** — Universal `"Go to Artist"` / `"Go to Album"` drill-down with `B`-button backstack from all views, resilient 3-tier Song/Artist Radio, and native Crossfade (`0–12s`).
- [ ] **`SEARCH-01`** — Search 2.0 with recent search history pills, controller-friendly Genre/Gaming-Mood browse tiles on empty query, and Podcasts/Episodes search filters.
- [ ] **`POD-01`** — Podcast & Audiobook Power Suite (`0.75x–2.0x` playback speed, automatic `±15s` smart-skip transport & trigger adaptation, resume bars, and *Unplayed* filter).
- [ ] **`LYRICS-01`** — Offline `.lrc` disk cache, per-track `±0.5s` sync offset persistence, and pure-Python Romaji/Pinyin/Korean romanization.

### Wave 3: Queue Studio, Playlist Management & Connect Hub 2.0 (Interactive Curation)
- [ ] **`QUEUE-03` & `PL-01`** — Controller "Grab Mode" queue reordering, track removal, and clear queue (CDP `PlayerAPI` + URI-slice fallback), plus full controller Playlist CRUD (create, rename, delete, reorder/remove tracks).
- [ ] **`CONNECT-01`** — Spotify Connect Hub 2.0 with 1-click auto-waking *"Pull Playback to Steam Deck"*, device type icons, engine badges, and remote device volume slider.

### Wave 4: CDP Deep Integration — Discovery 2.0, Offline Travel Mode & Living Room Jam
- [ ] **`DISC-04`** — Personalized Spotify algorithmic mixes (*Daylist*, *Discover Weekly*, *Release Radar*, *Daily Mixes*) in `DiscoveryTab` via CDP Pathfinder/Registry bridge.
- [ ] **`CDP-01`** — Native Spotify CDP offline downloads via `OfflineAPI` with download progress, offline badges, and automatic Wi-Fi disconnect Travel Mode filter.
- [ ] **`JAM-01`** — Spotify Jam session creation/management via CDP with living-room on-screen QR code sharing.

### Wave 5: 10-Foot Docked TV Experience & Listening Analytics / Scrobbling
- [ ] **`TV-01`** — 10-Foot Docked TV Split-View Mode (Now Playing + live karaoke lyrics + queue preview + optional PipeWire audio spectrum visualizer), manual toggle or dock auto-activate.
- [ ] **`STATS-01`** — Local *"Deck Wrapped"* analytics (with *Top Game + Soundtrack* pairings), Last.fm / ListenBrainz scrobbler with offline retry queue, and 1-click JSON backup/restore.

---

## Feature Prioritization Matrix

| Pillar ID | Feature Area | User Value | Implementation Cost | Priority |
|-----------|--------------|------------|---------------------|----------|
| `GAME-01` & `TOAST-01` | Per-Game EQ Profiles & Silent HUD Toasts | HIGH | LOW | P1 |
| `CHORD-01` | Extended In-Game Quick-Chords (`♥`, Pin Cycle, Lyrics) | HIGH | LOW | P1 |
| `RADIO-01` | Instant Song/Artist Radio, Universal Drill-Down & Crossfade | HIGH | MEDIUM | P1 |
| `SEARCH-01` | Search 2.0 (History, Gaming/Mood Tiles, Podcast Search) | HIGH | LOW | P1 |
| `QUEUE-03` & `PL-01` | Interactive Queue Studio & Controller Playlist CRUD | HIGH | HIGH | P1 |
| `LYRICS-01` | Lyrics 2.0 (`.lrc` Cache, Per-Track Sync Nudge, Romanization) | HIGH | MEDIUM | P1 |
| `CONNECT-01` | Spotify Connect Hub 2.0 (1-Click Pull to Deck, Remote Volume) | HIGH | LOW | P1 |
| `DISC-04` | Personalized Algorithmic Mixes via CDP Bridge | HIGH | HIGH | P1 |
| `POD-01` | Podcast & Audiobook Power Suite (`0.75x–2.0x`, `±15s`, Unplayed) | MEDIUM | MEDIUM | P2 |
| `THEME-01` & `ECO-01` | Dynamic Album-Art Accent Colors & Battery Eco-Mode | HIGH | MEDIUM | P2 |
| `TV-01` | 10-Foot Docked TV Split-View & PipeWire Spectrum Visualizer | HIGH | HIGH | P2 |
| `CDP-01` | Native CDP Offline Downloads & Wi-Fi Travel Mode | HIGH | HIGH | P2 |
| `STATS-01` | Local "Deck Wrapped", Last.fm/ListenBrainz & JSON Backup | MEDIUM | MEDIUM | P2 |
| `JAM-01` | Spotify Jam & Living Room QR-Code Session Sharing | MEDIUM | HIGH | P2 |

---

## Competitor Feature Analysis

| Capability | Official Spotify Desktop (Flatpak in GamepadUI) | Spicetify / Web Wrappers | Basic Decky MPRIS Plugins (MusicControl) | Deckify v0.7 Approach |
|------------|-------------------------------------------------|--------------------------|------------------------------------------|-----------------------|
| **Controller Navigation & 10-Foot TV UI** | Mouse/keyboard UI; tiny buttons; broken D-pad focus in GamepadUI; requires launching as separate non-Steam app. | Requires manual CSS/JS injection; breaks on client updates; poor D-pad spatial navigation. | QAM mini-player only; no full-screen library, lyrics, or TV split-view. | Native `@decky/ui` spatial navigation (`flow-children`), L2/R2 trigger paging, and dedicated 10-Foot Docked TV Split-View (`TV-01`). |
| **In-Game Integration (EQ, Ducking, Chords, Silent HUD)** | None; alt-tabbing in GamepadUI is slow; no auto-ducking or per-game EQ/soundtracks. | None. | Basic media key forwarding; uses noisy Steam system toasts. | Per-game soundtrack + 10-band PipeWire EQ + ducking profiles (`GAME-01`), global button chords (`CHORD-01`), and 100% silent Gamescope HUD toasts (`TOAST-01`). |
| **Algorithmic Mixes & Offline Downloads** | Supported natively, but trapped inside the un-navigable desktop window. | Supported in desktop window; no SteamOS offline Travel Mode integration. | Cannot browse or trigger downloads. | Headless Official Client CDP bridge unlocks *Daylist*/*Discover Weekly* (`DISC-04`), `OfflineAPI` downloads with Wi-Fi Travel Mode (`CDP-01`), and Jam QR (`JAM-01`) inside a 100% controller-native UI. |
| **Lyrics & Romanization** | Basic synced lyrics; no per-track offset nudge; no offline cache; no romanization. | Requires third-party `lyrics-plus` extension; no Gamescope HUD integration. | None. | 5-tier lyrics waterfall with `.lrc` disk cache, per-track `±0.5s` offset memory, CJK romanization (`LYRICS-01`), and discrete zero-FPS-cost Gamescope HUD lyrics. |
| **Analytics & Scrobbling** | Annual Wrapped only; basic Last.fm in account web settings; no game correlation. | Requires custom extensions. | None. | Local *"Deck Wrapped"* correlating listening time with running Steam games + built-in offline-resilient Last.fm & ListenBrainz scrobbler (`STATS-01`). |

## Sources

- **Deckify v0.4–v0.6 Codebase & Validated Architecture:** `PROJECT.md`, `py_modules/engine.py` (Official Spotify Client CDP React Fiber Platform Registry introspection on port `9229`), `py_modules/spotify.py` (5-tier lyrics waterfall & HTTP 429 circuit breaker), `src/index.tsx` (`FocusNavController` chord listener & Gamescope overlay mounting), `src/components/tabs/*`.
- **Spotify Web API Dev Mode Restrictions (2024–2026):** Deprecation of `/v1/recommendations`, `/v1/browse/featured-playlists`, and algorithmic `37i9dQZF1E...` playlist access for Dev Mode Client IDs, necessitating Deckify's hybrid CDP Platform Registry bridge (`LibraryAPI`, `PlaylistAPI`, `PlayerAPI`, `OfflineAPI`, `RadioAPI`, Pathfinder GraphQL).
- **SteamOS GamepadUI & PipeWire Constraints:** Valve `@decky/ui` `FocusNavController` spatial focus rules, Steam CEF Content Security Policy (base64 data URI requirement), and UID 1000 isolated PipeWire `filter-chain` / sink-input routing.

---
*Feature research for: Deckify Milestone v0.7 (Studio, Living Room TV, Offline Travel & Ultimate Immersion)*
*Researched: 2026-11-18*
