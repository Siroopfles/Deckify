# Feature Landscape

**Domain:** In-Game Audio Management & Music Discovery for Gaming Handhelds (Steam Deck / SteamOS GamepadUI)  
**Researched:** 2026-11-12  
**Milestone:** v0.5 — In-Game Flow & Music Discovery  
**Overall Confidence:** HIGH (Verified against SteamOS CEF, PipeWire/pactl architecture, Spotify Web API, and console background audio standards)

---

## Table Stakes

Features users expect in modern console and handheld background media players (PS5 Control Center, Xbox Guide, SteamOS GamepadUI). Missing these makes background music feel clunky, jarring, or disruptive during gameplay.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Game-Specific Soundtrack Auto-Play & Handoff** | When launching a game (e.g. *Cyberpunk 2077* or *Forza*), players expect their chosen soundtrack/playlist to start automatically without opening menus. When exiting, playback must cleanly pause or restore previous state. | Medium | Listens to SteamOS `SteamClient.Apps.RegisterForAppLifetimeNotifications`. Maps `appId` to Spotify URI in `game_audio_profiles`. Requires clean restore upon exit. |
| **Smooth Fading Audio Ducking (1.0s – 1.5s)** | Snapping volume abruptly from 80% to 20% on game launch or voice chat creates jarring audio pops and disorients players. Smooth logarithmic/linear volume fading is standard on Xbox/PS5. | Medium | **Must execute locally** via PipeWire / PulseAudio sink-inputs (`pactl set-sink-input-volume`). Cannot use Spotify Web API for stepping (avoids HTTP 429 rate limits). |
| **Voice Chat & Mic Activity Ducking** | Background music should automatically dip in volume when the player or party members talk, then smoothly recover when speech stops. | Medium | Polls `pactl list source-outputs` (or PipeWire mic streams). Requires 1.2s–1.5s silence debounce (hysteresis) to prevent audio "pumping" between words. |
| **QAM Pinned Playlists (2-Second Quick Switch)** | Opening the heavy full-screen modal during active gameplay causes game frame drops or breaks multiplayer flow. Players need 3–4 favorite playlists accessible directly inside the 320px Decky QAM panel. | Low | 3–4 compact pill buttons in QAM sidebar. One-click A-button initiates playback immediately via `play_tracks` RPC in background. |
| **L2/R2 Controller Trigger Seeking (±10s Blind Seek)** | Console media players universally map triggers to fast-forward / rewind. Players shouldn't need to navigate D-pad focus away from play controls down to the seekbar just to skip back 10 seconds. | Low | Attached in `NowPlayingTab.tsx` and `LyricsTab.tsx`. Binds L2 (`handleSeekDelta(-10)`) and R2 (`handleSeekDelta(10)`). Uses local `usePlaybackClock.scrubDelta` with debounced commit. |
| **L2/R2 Fast Page Jumping in Long Library Lists** | Blurring down 500+ liked songs or 80 playlists track-by-track with D-pad is painfully slow. Triggers should jump 15–20 rows at a time (Page Up / Page Down). | Low | Binds L2/R2 in `LikedSongsTab.tsx`, `PlaylistsTab.tsx`, and `AlbumsTab.tsx`. Automatically adjusts focused element index. |
| **In-Game HUD Overlay 2.0 (Active Synced Lyric Line)** | Displays the currently sung lyric line directly underneath the track and artist in the gamescope HUD overlay. Allows subtle sing-along/subtitles without obscuring gameplay. | Medium | Synchronized with in-memory parsed LRC timestamps (`SyncedLine[]`) and `currentPositionMs`. Strictly inherits `pointerEvents: "none"`. Auto-collapses if no synced lyrics available. |
| **Personalized Discovery Tab ("Made For You")** | Every modern music client provides personal recommendations. Users expect instant access to their Top Tracks, Top Artists, and algorithmic daily/weekly mixes. | Medium | New tab in Expanded Modal sidebar. Queries Spotify Web API `/v1/me/top/tracks` and `/v1/me/top/artists` (time ranges: 4 weeks, 6 months, all-time) and matches curated mixes. |

---

## Differentiators

Features that elevate Deckify beyond native console Spotify apps (PS5/Xbox) and standard Decky plugins.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **1-Click "Bind Current Music to Game" Shortcut** | While playing a game and listening to an album, pressing a single chord (or QAM button) instantly binds that album to the running game's `appId` for all future launches. | Low | Captures active `appId` + current playing Spotify URI in `game_audio_profiles` with a single toast confirmation. Zero tedious configuration. |
| **Zero-Network Local Sink Fading** | Unlike official Spotify apps that alter cloud volume (desyncing phone/PC volume and triggering API throttling), Deckify fades audio purely within the Steam Deck's local PipeWire DSP mixer. | Medium | Completely invisible to Spotify Connect; preserves user's cloud volume setting while delivering silky 30Hz fade curves. |
| **Smart Voice Ducking with Steamcord Integration** | Native integration with the popular Steamcord Decky plugin (`https://github.com/Necrosiak/Steamcord`). Automatically detects incoming voice packets from Discord without relying solely on local mic input. | Medium | Checks Steamcord active state or PulseAudio voice stream classification. |
| **Alphabet Section Jump with Letter Badge HUD** | When using L2/R2 in large sorted libraries, popping up a brief 0.5s letter badge (e.g. "M", "S") gives instant console-grade spatial orientation like the PS3/PS5 XMB. | Medium | Calculates first track with matching initial character in sorted array. |
| **Dynamic Ambient Accent Tinting on Overlay Lyric** | The active lyric text in the gamescope HUD glows subtly with the dominant color extracted from the album artwork, matching modern gaming HUD aesthetics. | Low | Uses existing base64 color metadata or dominant green accent `#1db954`. |
| **Contextual "Time-of-Day" Discovery Mixes** | Discovery Tab displays contextual greetings ("Afternoon Energy", "Late Night Focus") and highlights the user's Spotify *Daylist* or personalized daily mixes. | Low | Detects local time and maps to Spotify Daylist / algorithmic playlist search. |

---

## Anti-Features

Features to explicitly **NOT** build. These patterns cause instability, performance degradation, game crashes, or Spotify account rate limits.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|--------------------|
| **Process Memory Injection for In-Game Music Replacement** | Injecting into game binaries or hooking DirectX/Vulkan/FMOD to mute in-game music triggers Anti-Cheat bans (Easy Anti-Cheat, BattlEye, VAC) and crashes SteamOS Proton. | Use SteamOS `RegisterForAppLifetimeNotifications` + PipeWire audio ducking to play music over the game cleanly. |
| **High-Frequency Spotify Web API Volume Stepping** | Calling `PUT /v1/me/player/volume` 10 times over 1.5 seconds to create a fade curve will instantly trigger HTTP 429 Rate Limiting and lock the plugin out of Spotify for 30–300 seconds. | **Always fade locally** using PipeWire/PulseAudio sink-input volume (`pactl set-sink-input-volume`) on the local process. |
| **Full Tracklist Browsing inside QAM** | The Decky Quick Access Menu is constrained to ~320px width and shares the active game's GPU compositor. Rendering 100+ track rows with artwork causes severe in-game frame stutter. | Keep QAM strictly to 3–4 pinned playlist pill buttons. Route heavy browsing to the full-screen modal (`/deckify`). |
| **Multi-Line Scrolling Lyrics in Gamescope HUD** | Showing 3–5 lines of auto-scrolling lyrics during gameplay blocks vital game UI (radar, health bars, crosshairs) and distracts the player. | Restrict overlay strictly to **one single active line** (max 45 chars) with graceful ellipsis truncation and auto-collapse. |
| **Unthrottled Trigger Spam API Calls** | Firing a backend seek RPC every time L2/R2 is clicked or held will overload the librespot IPC channel and Spotify API. | Use `usePlaybackClock.scrubDelta` with a 300ms debounce before committing the seek to the backend. |
| **Fragile DOM Scraping for Spotify Home Feed** | Scraping the internal Spotify Desktop client DOM via CDP to recreate the exact proprietary desktop home feed breaks on every Spotify update. | Use official Spotify Web API `/v1/me/top/tracks` and `/v1/me/top/artists` plus library/CDP playlist searches for curated mixes (*Discover Weekly*, *Release Radar*). |
| **Aggressive Auto-Play Overriding Manual Pauses** | If a player deliberately pauses music to watch a cutscene and alt-tabs or resumes the game, auto-playing music will infuriate them. | Check if music was manually paused by the user within the last 60 seconds before triggering auto-play on game focus. |

---

## Feature Dependencies

```text
┌─────────────────────────────────────────────────────────────┐
│ SteamOS AppLifetime Notifications (src/index.tsx)           │
└──────────────────────────────┬──────────────────────────────┘
                               │ provides running appId
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ Game-Specific Soundtracks (`game_audio_profiles`)           │
│ - Reads/writes settings.json appId mapping                  │
│ - Triggers backendPlayTracks() on launch                    │
│ - Restores or pauses on exit                                │
└──────────────────────────────┬──────────────────────────────┘
                               │ triggers volume transition
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ Smooth PipeWire Fading Engine (py_modules/volume.py)         │
│ - Local sink-input volume ramp (pactl 30Hz curve over 1.5s) │
│ - Mic source-output polling & voice activity ducking        │
│ - Shared baseline volume state management                   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Existing Parsed LRC Service (py_modules/spotify.py)         │
└──────────────────────────────┬──────────────────────────────┘
                               │ feeds SyncedLine[]
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ In-Game HUD Overlay 2.0 (DeckifyOverlay.tsx)                │
│ - Bound to live usePlaybackClock positionMs                 │
│ - Active single lyric line beneath artist                   │
│ - Auto-collapses on instrumental / missing LRC              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Controller Event Infrastructure (FocusNavController / vgp)   │
└──────────────────────────────┬──────────────────────────────┘
                               │ intercepts L2 / R2 triggers
                               ▼
┌──────────────────────────────┴──────────────────────────────┐
│ L2 / R2 Trigger Navigation System                           │
│ ├─ NowPlaying / Lyrics Tab: ±10s blind seek                 │
│ └─ Long Lists (Liked/Playlists/Albums): ±15 page jumping    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Spotify Web API Client (py_modules/rpc_library.py)          │
│ - /v1/me/top/tracks & /v1/me/top/artists                    │
│ - Curated Mix URI resolver (Discover Weekly, Daylist)       │
└──────────────────────────────┬──────────────────────────────┘
                               │ delivers personalized models
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ Home / Made For You Discovery Tab (src/components/tabs/)    │
│ - Top items carousels (short / medium / long term)          │
│ - Algorithmic mix launcher cards                            │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ QAM Mini-Player (src/index.tsx Content)                     │
│ - Reads pinned playlist URIs from settings.json             │
│ - 3-4 instant 1-tap playback pill buttons                   │
└─────────────────────────────────────────────────────────────┘
```

---

## MVP Recommendation for Milestone v0.5

Prioritize implementation in 4 focused waves to ensure core in-game flow is solid before adding discovery surfaces:

### Wave 1: In-Game Automation & Audio Transitions (Core Gaming Flow)
1. **Smooth PipeWire Fader (`py_modules/volume.py`)**: Implement smooth ~1.5s local sink volume curves for ducking and restoring without Spotify API rate limits.
2. **Game-Specific Soundtrack Auto-Play**: Connect `game_audio_profiles` to `appLifetimeSub` so launching a game automatically switches to its mapped playlist/album, with clean exit pause/restore.
3. **Voice Chat Awareness**: Add mic `source-outputs` activity monitor with 1.2s silence hysteresis.

### Wave 2: Quick In-Game Controls & Trigger Ergonomics
1. **QAM Pinned Playlists**: Add 3–4 pinned playlist buttons in the Decky QAM panel for 2-second mid-game soundtrack switching.
2. **L2/R2 Blind Seeking**: Add trigger listeners in `NowPlayingTab.tsx` and `LyricsTab.tsx` for instant ±10s seeking.
3. **L2/R2 List Page Jumping**: Enable fast page navigation across long lists (`LikedSongsTab`, `PlaylistsTab`, `AlbumsTab`).

### Wave 3: In-Game HUD 2.0
1. **Live Lyric Line in Gamescope HUD**: Wire `syncedLyrics` and `currentPositionMs` into `DeckifyOverlay.tsx` to render the active lyric line with auto-collapse.
2. **QAM Overlay Controls**: Add a toggle in QAM settings for `Show Lyrics in HUD`.

### Wave 4: Discovery & Polish
1. **Home / Made For You Discovery Tab**: Build the new Discovery tab presenting Top Tracks, Top Artists, and Daily/Weekly mixes.
2. **"Bind Current Music to Game" Modal / Action**: Add 1-click binding from Now Playing and Playlist action sheets.

### Defer to Backlog / Future Milestones:
- **Biquad Equalizer PipeWire Filter-Chain DSP**: (Requires system-level PipeWire config files; keep to preset volume levels for now).
- **Audio Peak Cutscene Detection**: (Complex RMS audio stream sampling; standard app-lifetime ducking solves 90% of user needs).
- **Bilingual & Word-by-Word Karaoke Highlighting**: (Enhancement on top of baseline 1-line lyric HUD).

---

## Sources

- **SteamOS / Decky Loader API Documentation**: `SteamClient.Apps.RegisterForAppLifetimeNotifications`, `FocusNavController` gamepad source listeners.
- **PipeWire / PulseAudio Linux Standards**: `pactl list sink-inputs`, `pactl set-sink-input-volume`, `pactl list source-outputs`.
- **Spotify Web API Specifications**:
  - `GET /v1/me/top/tracks` and `GET /v1/me/top/artists` (`time_range`: `short_term`, `medium_term`, `long_term`).
  - Rate limiting behavior (HTTP 429 with `Retry-After` on rapid `PUT /v1/me/player/volume` calls).
- **Console Platform UX Benchmarks**: PlayStation 5 Control Center Music Card & Xbox Series X Guide Media Widget ergonomics.
