# Technology Stack: Milestone v0.5 (In-Game Flow & Music Discovery)

**Project:** Deckify  
**Researched:** 2026-11-12  
**Overall Confidence:** HIGH  

---

## Executive Summary

Deckify Milestone v0.5 expands Deckify from an in-library controller client into a seamless in-game companion on SteamOS. The new capabilities center on:
1. **Game-Specific Soundtracks**: Automatic playlist binding to Steam game `appId` via SteamClient lifetime events.
2. **Smooth Audio Ducking & Voice Awareness**: Hardware-level volume fading curves and microphone/Steamcord activity detection via PipeWire/PulseAudio sink-inputs.
3. **QAM Pinned Playlists**: Instant 2-second playlist switching directly inside the compact Steam Quick Access Menu.
4. **L2/R2 Controller Trigger Bindings**: Blind 10s scrub in modal views and rapid page/alphabet jumps in long lists.
5. **In-Game Live Lyrics Line**: Micro-footprint synced lyrics rendering inside the gamescope overlay HUD without layout shift.
6. **Home / Discovery Tab**: High-speed browsing of top tracks, top artists, new releases, and personalized Spotify mixes.

The architectural philosophy for this stack remains **zero external bloat**: leveraging native SteamOS CEF globals (`window.SteamClient`, `FocusNavController`), existing system audio tooling (`pactl` over local Unix sockets), and standard Spotify Web API endpoints with in-memory caching.

---

## Recommended Stack Additions

### 1. Game-Specific Soundtracks & SteamOS App Lifetime

| Technology / API | Version / Location | Purpose | Why |
|------------------|-------------------|---------|-----|
| `window.SteamClient.Apps.RegisterForAppLifetimeNotifications` | SteamOS GamepadUI Global | Listen to game launch and exit events (`unAppID`, `bRunning`) | Native SteamOS API, event-driven, zero polling overhead, runs directly in Decky plugin sandbox. |
| `window.SteamClient.Apps.GetAppData` / `GetAppOverviewByAppID` | SteamOS GamepadUI Global | Retrieve game display name, capsule, and icon for settings UI | Avoids external Steam Store Web API requests or scraping; works offline for cached games. |
| `py_modules/soundtrack.py` | Python 3.11+ (Internal) | State restoration engine (capturing pre-game context, auto-play, pause on exit) | Keeps game state tracking isolated from core playback RPCs; handles seamless context switching. |

#### Settings Schema (`settings.json` & `src/types.ts`)
```typescript
export interface GameSoundtrackConfig {
  app_id: string;             // Steam AppID as string key
  game_name?: string;         // Human-readable title
  soundtrack_uri: string;     // spotify:playlist:... or spotify:album:...
  soundtrack_name?: string;   // Display name of bound playlist/album
  auto_play: boolean;         // Start music when game launches (default: true)
  pause_on_exit: boolean;     // Pause music when game quits (default: true)
  restore_previous: boolean;  // Resume pre-game track/playlist upon exit (default: false)
}

// Stored in EngineSettings as:
// game_soundtracks?: Record<string, GameSoundtrackConfig>;
```

---

### 2. Smooth Audio Ducking & PipeWire / Voice Activity Detection

| Technology / API | Command / Version | Purpose | Why |
|------------------|-------------------|---------|-----|
| `pactl set-sink-input-volume` | PulseAudio 16+ / PipeWire | Smooth volume fading on Spotify/librespot sink-input | **Local hardware-level control:** avoids Spotify Web API rate limits (HTTP 429), eliminates network latency (0ms), works offline, doesn't change account volume on other devices. |
| `pactl list source-outputs` | PulseAudio 16+ / PipeWire | Detect active microphone recording streams (Voice Chat / Steamcord / WebRTC) | Non-invasive voice activity detection; detects Discord Flatpak, Steam Voice, and Steamcord without plugin IPC. |
| `asyncio` Fading Curve Worker | Python 3.11+ (Internal in `py_modules/volume.py`) | Interpolate volume over ~1.0-1.5s in 15-20 discrete steps | Uses smoothstep / cosine attenuation curve ($vol(t) = start + (target - start) \times \frac{1 - \cos(\pi t)}{2}$) to eliminate jarring volume cuts. |

#### PipeWire Command Patterns
```bash
# Set specific sink-input volume to 30% smoothly
pactl set-sink-input-volume <sink_input_id> 30%

# Inspect active microphone recording clients (returns active recording streams)
pactl list source-outputs
# Active stream indicator: "Corked: no" and non-empty "application.process.id"
```

---

### 3. QAM Pinned Playlists (`@decky/ui` Quick Access Menu)

| Technology / Component | Version | Purpose | Why |
|-----------------------|---------|---------|-----|
| `@decky/ui` `PanelSectionRow` + `Focusable` | 4.11.1 | Horizontal scroll container for 3-4 pinned playlist chips | Preserves Steam Deck spatial D-pad navigation; fits comfortably into compact 340px QAM width. |
| `DeckifyImage` | Internal Component | Base64-proxied 32x32 playlist artwork thumbnails | Bypasses Steam CEF CSP image blocks while reusing cached image bytes. |
| `backendPlayTracks` | Internal Decky RPC | 1-click context playback initiation | Fires instant playback (`spotify:playlist:<id>`) without opening full-screen modal. |

#### Settings Schema
```typescript
export interface PinnedPlaylistItem {
  id: string;
  name: string;
  uri: string;
  image_url?: string;
}

// Stored in EngineSettings as:
// pinned_playlists: PinnedPlaylistItem[]; // Max 4-5 items
```

---

### 4. L2/R2 Controller Trigger Bindings

| Technology / Event | Event Code / Identifier | Purpose | Why |
|-------------------|-------------------------|---------|-----|
| `vgp_onbuttondown` | Steam GamepadUI DOM Event | Capture controller buttons inside modal | Zero-overhead, event-driven; already proven in `DeckifyExpandedModal.tsx` for X/Y/L1/R1. |
| Trigger Left (L2) | Button `6` / `TRIGGER_LEFT` / `LT` | Seek -10s in NowPlaying/Lyrics; Jump -15 items in Lists | Allows rapid blind scrubbing without moving D-pad focus away from playlist/lyrics. |
| Trigger Right (R2) | Button `7` / `TRIGGER_RIGHT` / `RT` | Seek +10s in NowPlaying/Lyrics; Jump +15 items in Lists | Standard handheld navigation paradigm (accelerated pagination in long lists). |
| `FocusNavController` | SteamOS GamepadUI Global | Fallback listener for trigger button chords | Ensures compatibility across SteamOS 3.5 and 3.7+ preview builds. |

#### Trigger Code Mappings
```typescript
// Steam GamepadUI trigger identifiers:
const isL2 = btn === "L2" || btn === "LT" || btn === 6 || btn === "TRIGGER_LEFT" || btn === "BUTTON_LEFT_TRIGGER";
const isR2 = btn === "R2" || btn === "RT" || btn === 7 || btn === "TRIGGER_RIGHT" || btn === "BUTTON_RIGHT_TRIGGER";
```

---

### 5. In-Game Synced Lyrics in Overlay HUD (`DeckifyOverlay.tsx`)

| Technology / Pattern | Purpose | Why |
|---------------------|---------|-----|
| `DeckifyOverlay.tsx` with Fixed Line Container | Render 1 active synced lyric line under artist | Gamescope floating HUD (`pointerEvents: "none"`) remains completely non-intrusive. |
| `parseLrc` (`src/utils.ts`) | Parse synced LRC timestamp into `{ timeMs, text }[]` | Lightweight (<30 lines), zero dependencies, runs on client once per track. |
| CSS Height Locking (`height: 18px`, `overflow: hidden`) | Strict layout shift prevention | Changing lyrics length or empty lines (`&nbsp;`) never causes HUD jitter or resizing during gameplay. |
| `addEventListener("synced_lyrics")` / `backendGetLyrics` | Fetch lyrics on track change | Avoids bloating periodic 3s `get_status` payloads with 10KB lyric strings. |

---

### 6. Home / Discovery Tab

| Endpoint / API | Method | Purpose | Cache Strategy |
|----------------|--------|---------|----------------|
| `/v1/me/top/tracks` | `GET` | User top tracks (short_term: 4 wks, medium_term: 6 mos) | In-memory backend cache (TTL: 15 min) |
| `/v1/me/top/artists` | `GET` | User most listened artists | In-memory backend cache (TTL: 15 min) |
| `/v1/browse/new-releases` | `GET` | New albums and single releases | In-memory backend cache (TTL: 30 min) |
| `/v1/browse/featured-playlists` | `GET` | Contextual editorial playlists (Morning, Gaming, Focus) | In-memory backend cache (TTL: 30 min) |
| Spotify CDP / Rootlist ("Made For You") | Internal CDP | Personalized mix links (*Discover Weekly*, *Release Radar*, *Daylist*) | Read directly from client rootlist structure |

---

## Anti-Stack: What NOT to Add (Avoiding Bloat)

| Library / Tool | Why Considered | Why Strictly Rejected |
|----------------|----------------|-----------------------|
| `webrtcvad` / `numpy` / `scipy` | Audio DSP / Voice Activity Detection | Heavy C extensions (100MB+), compile issues on SteamOS read-only rootfs; `pactl list source-outputs` already provides VAD for free. |
| `Spotify Web API Volume PUT` for Ducking | Volume adjustment | High network latency (200-500ms), causes HTTP 429 rate limits over multi-step fades, changes account volume across all phones/PCs. |
| `gamepad.js` / `navigator.getGamepads()` | Controller input polling | JS `requestAnimationFrame` polling wastes CPU/battery in gamescope; SteamOS `vgp_onbuttondown` is 100% event-driven. |
| External Steam Web API / `cheerio` | Scraping Steam game names | Network overhead and requires API keys; `window.SteamClient.Apps` provides local metadata instantly. |
| Redux / Zustand / MobX | State management for Discovery tab | Massive bundle bloat for Rollup ESM; standard React hooks (`useState`, `useCallback`) are clean and sufficient. |
| Canvas-based Lyrics Renderers | In-game lyrics visualization | Significant GPU usage in gamescope layer; a single 18px text element with CSS opacity transition is zero-cost. |

---

## Installation & Dependencies

No new external NPM or Python packages are required! Milestone v0.5 is built entirely upon native SteamOS platform primitives and validated internal patterns:

```bash
# Frontend dependencies (All existing in package.json)
# - @decky/ui (4.11.1)
# - @decky/api (1.1.3)
# - react (19.x)
# - react-icons (5.5.0)

# Backend runtime (All existing in Python 3.11+ stdlib & SteamOS base)
# - asyncio, subprocess, json, urllib.request, math
# - pactl, pw-cli, pw-metadata (System binaries on SteamOS 3.5+)
```

---

## Architecture Integration Matrix

| Feature | Frontend Layer | RPC Seam | Backend Layer | System / OS Boundary |
|---------|----------------|----------|---------------|-----------------------|
| **Game Soundtracks** | `src/index.tsx` (`SteamClient.Apps`) | `backendSetGameSoundtrack`, `backendOnAppLifetime` | `py_modules/rpc_library.py` | SteamOS `SteamClient` runtime |
| **Smooth Ducking** | `src/index.tsx` (trigger) / `SettingsTab.tsx` | `backendFadeVolume`, `backendToggleVoiceDucking` | `py_modules/volume.py` (`asyncio` loop) | PipeWire `pactl` sink-inputs / source-outputs |
| **QAM Pinned** | `src/index.tsx` (`PanelSectionRow`) | `backendPlayTracks` | `py_modules/rpc_playback.py` | Spotify Connect engine (`librespot`) |
| **L2/R2 Triggers** | `DeckifyExpandedModal.tsx` (`vgp_onbuttondown`) | None (Direct UI/clock scrub) | `py_modules/rpc_playback.py` (commit) | SteamOS GamepadUI virtual gamepad |
| **HUD Lyrics** | `DeckifyOverlay.tsx` | `backendGetLyrics` (cached) | `py_modules/spotify.py` | Gamescope compositor overlay |
| **Discovery Tab** | `src/components/tabs/HomeTab.tsx` | `backendGetHomeFeed` | `py_modules/rpc_library.py` | Spotify Web API (`/v1/me/top/...`) |

---

## Sources & Confidence Assessment

- `window.SteamClient.Apps` lifetime events verified against SteamOS GamepadUI production build.
- `pactl list sink-inputs` & `pactl list source-outputs` verified against PipeWire 1.0 on SteamOS 3.5+.
- Spotify Web API personalization endpoints (`/v1/me/top/tracks`, `/v1/me/top/artists`) documented per official Spotify Developer Reference (Scopes: `user-top-read`).
- Overall Confidence: **HIGH**. All technologies align with existing validated Deckify constraints.
