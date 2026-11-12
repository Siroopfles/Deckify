# Project Research Summary: Milestone v0.5

**Project:** Deckify  
**Domain:** SteamOS GamepadUI Decky Plugin / Embedded Spotify Client & Gaming Audio Companion  
**Researched:** 2026-11-12  
**Target Milestone:** v0.5 — In-Game Flow & Music Discovery  
**Overall Confidence:** HIGH  

---

## Executive Summary

Deckify is an open-source Spotify client and Decky Loader plugin for Valve's Steam Deck, operating across SteamOS GamepadUI (Chromium Embedded Framework), the Gamescope compositor, local audio daemons (PipeWire / PulseAudio), and background Spotify Connect engines (`librespot` / `spotifyd`). Following the successful modularization and UI hardening in v0.4, Milestone v0.5 focuses on transforming Deckify into a seamless, reactive in-game companion that adapts automatically to running games and enables instant music discovery from controller input.

The recommended architectural approach is strictly **zero external runtime bloat**, leveraging native SteamOS platform APIs (`window.SteamClient.Apps.RegisterForAppLifetimeNotifications`, `FocusNavController`), hardware-level audio control (`pactl set-sink-input-volume`), and public Spotify Web API personalization endpoints (`/v1/me/top/*`). Core features include: game-specific soundtrack auto-play tied to Steam `appId`, smooth non-blocking audio ducking (~1.5s local fading curves) for game audio and voice chat, instant 2-second QAM pinned playlist switching, blind L2/R2 trigger seeking (±10s) and fast list paging, a micro-footprint live synced lyrics HUD in the Gamescope overlay, and a dedicated Home / Discovery tab.

The primary technical risks center on cross-boundary friction between SteamOS CEF, background audio processes, and Spotify API quotas. Specifically: (1) multi-step Web API volume adjustments trigger HTTP 429 rate limits and audible stepping; (2) Proton launcher child processes cause rapid `AppLifetime` event flapping; (3) analog trigger chatter causes wild seeking; and (4) high-frequency DOM re-renders in Gamescope degrade game frame rates. All four risks have well-defined, zero-cost architectural mitigations: local PipeWire sink fading, 3–5s lifetime debounce with state snapshot/restore, 75%/25% Schmidt trigger hysteresis, and discrete event-driven lyrics timers.

---

## Key Findings

### Recommended Stack

Milestone v0.5 introduces no new external NPM or Python dependencies. All capabilities are implemented using existing platform APIs, system utilities, and standard libraries.

**Core technologies:**
- **PipeWire / PulseAudio (`pactl set-sink-input-volume`)**: Smooth local volume fading on the active `librespot`/`spotifyd` audio sink — zero Spotify API calls, 0ms network latency, preserves cloud volume settings across other devices.
- **`pactl list source-outputs`**: Non-invasive voice activity detection for Discord Flatpak, Steam Voice, and Steamcord — triggers ducking with a 1.5s silence hold timer.
- **`window.SteamClient.Apps.RegisterForAppLifetimeNotifications`**: Event-driven game launch and exit detection directly in CEF — zero polling overhead.
- **`vgp_onbuttondown` (Controller Triggers 6 & 7)**: Captures L2/R2 hardware trigger events inside the Expanded Modal for instant blind seeking and fast list paging.
- **Spotify Web API (`/v1/me/top/tracks`, `/v1/me/top/artists`, `/v1/recommendations`)**: Official personalization endpoints for the Discovery Tab — cached in memory with a 1–6 hour TTL.
- **Discrete Lyrics Scheduler (`setTimeout`)**: Drives the in-game HUD lyric line by scheduling line transitions on timestamps — eliminates continuous clock ticker repaints in Gamescope.

### Expected Features

Detailed in [FEATURES.md](file:///C:/Users/djdje/Deckify/.planning/research/FEATURES.md):

**Must have (table stakes):**
- **Game-Specific Soundtrack Auto-Play & Handoff**: Auto-plays mapped Spotify playlist/album on game launch; cleanly restores pre-game track and position upon exit.
- **Smooth Audio Ducking (1.0s – 1.5s Fade)**: Non-blocking logarithmic volume attenuation curve preventing jarring audio pops during game launch.
- **Voice Chat & Mic Activity Ducking**: Automatic music dipping during active speech with 1.2s–1.5s silence hysteresis.
- **QAM Pinned Playlists**: 3–4 horizontal playlist pills in the Decky Quick Access Menu for 2-second mid-game soundtrack switching.
- **L2/R2 Controller Trigger Seeking (±10s Blind Seek)**: Fast-forward / rewind in Now Playing and Lyrics tabs without shifting D-pad focus.
- **L2/R2 Fast List Page Jumping**: Skips 15–20 items per trigger pull in long library lists (Liked Songs, Playlists, Albums).
- **In-Game HUD Overlay 2.0 (Active Synced Lyric Line)**: Single subtle lyric line beneath artist with graceful ellipsis truncation and auto-collapse.
- **Home / "Made For You" Discovery Tab**: Full-screen modal tab for Top Tracks, Top Artists, Algorithmic Mixes, and New Releases.

**Should have (differentiators):**
- **1-Click "Bind Current Music to Game" Action**: Instantly binds currently playing album/playlist to the active game's `appId` with toast confirmation.
- **Zero-Network Local Sink Fading**: Pure PipeWire DSP attenuation invisible to remote Spotify Connect clients.
- **Dynamic Ambient Accent Tinting on Overlay Lyric**: Matches active lyric text glow to the album art palette or Spotify green.
- **Contextual Time-of-Day Discovery Greeting**: Displays "Morning Energy", "Late Night Focus", and highlights daily mixes.

**Defer (v2+ / backlog):**
- **Biquad Equalizer PipeWire Filter-Chain DSP**: Requires complex system-level PipeWire configuration files.
- **Audio Peak Cutscene Detection**: Requires continuous RMS audio stream analysis; standard app-lifetime ducking solves 90% of user needs.
- **Word-by-Word Karaoke Highlighting in HUD**: Unnecessary visual clutter during fast-paced gameplay.

### Architecture Approach

Detailed in [ARCHITECTURE.md](file:///C:/Users/djdje/Deckify/.planning/research/ARCHITECTURE.md):

The system maintains Deckify's strict separation between the React frontend (`src/components/tabs/`) and Python backend (`py_modules/`) connected via `@decky/api` RPC bridges.

```
+---------------------------------------------------------------------------------------+
|                                SteamOS GamepadUI (CEF)                                |
|  +---------------------------+  +-------------------------------+  +---------------+  |
|  |     Gamescope Overlay     |  |    Quick Access Menu (QAM)    |  | Expanded Modal|  |
|  |  - Song / Artist / Bar    |  |  - Mini-Player Controls       |  | - DiscoveryTab|  |
|  |  - Active Synced Lyric    |  |  - Pinned Playlists (3-4)     |  | - L2/R2 Scrub |  |
|  +---------------------------+  +-------------------------------+  +---------------+  |
+-------------------------------------------|-------------------------------------------+
                                            v @decky/api RPC
+---------------------------------------------------------------------------------------+
|                                Python Backend Daemon                                  |
|  +-----------------------+  +---------------------------+  +-----------------------+  |
|  |   py_modules/volume   |  |   py_modules/rpc_playback |  | py_modules/rpc_library|  |
|  |  - VolumeFader Task   |  |  - Pre-Game Snapshot      |  |  - Discovery Feed |  |
|  |  - pactl PipeWire     |  |  - Soundtrack Mapping     |  |  - Pinned Playlists|  |
|  +-----------------------+  +---------------------------+  +-----------------------+  |
+---------------------------------------------------------------------------------------+
```

**Major components:**
1. **`VolumeFader` (`py_modules/volume.py`)**: Asynchronous non-blocking worker managing cosine volume transitions over PipeWire sink inputs, canceling superseded fade tasks cleanly.
2. **`SoundtrackManager` / Playback Snapshot (`py_modules/rpc_playback.py`)**: Captures playback context, URI, track index, and position before game launch; cleanly restores or pauses upon game dismount.
3. **QAM Mini-Player Extensions (`src/index.tsx`)**: Renders pinned playlist pill buttons with `flow-children="horizontal"` directly under playback controls.
4. **Trigger Input Controller (`src/components/DeckifyExpandedModal.tsx`)**: Intercepts L2/R2 button codes with Schmidt trigger hysteresis, optimistic local scrub accumulation, and virtualized list anchor focus restoration.
5. **Discrete Lyrics HUD (`DeckifyOverlay.tsx` & `DeckifyOverlayWrapper`)**: Lightweight single-line display scheduled on lyric timestamps, preserving strict `pointerEvents: "none"` and zero continuous CEF invalidations.
6. **`DiscoveryTab` (`src/components/tabs/DiscoveryTab.tsx`)**: Multi-row carousel presenting Top Tracks, Top Artists, and curated mixes using concurrent backend fetches.

### Critical Pitfalls

Detailed in [PITFALLS.md](file:///C:/Users/djdje/Deckify/.planning/research/PITFALLS.md):

1. **Spotify Web API Volume Ducking & Subprocess Flooding**: Calling Web API volume endpoints triggers HTTP 429 rate-limiting; repeatedly running `pactl list sink-inputs` spawns 40 subprocesses in 1.5s.  
   *Mitigation:* Resolve `sink_input_id` once at the start of the fade; run all volume steps locally via PipeWire in an `asyncio` task at 50ms intervals. Never use the Spotify Web API for ducking.
2. **AppLifetime Multi-Process Flapping & Non-Steam AppIDs**: Intermediate game launchers (EA, Ubisoft, Proton helper scripts) emit rapid `bRunning: false` / `true` transitions; non-Steam game shortcuts produce negative signed 32-bit AppIDs.  
   *Mitigation:* Apply a 3–5 second debounce grace window before treating a game exit as real; normalize AppIDs using `String(Number(rawId) >>> 0)`; snapshot full pre-game playback state.
3. **Analog Trigger Chatter & In-Game Input Hijacking**: Continuous analog trigger noise fires dozens of digital seek events per tap; registering global trigger listeners captures game controls (e.g. aiming or accelerating).  
   *Mitigation:* Enforce 0.75 / 0.25 Schmidt trigger hysteresis with a 300ms software debounce; strictly scope L2/R2 listeners to the open Expanded Modal (`bigOpen === true`).
4. **Gamescope Compositor Stutter from High-Frequency Overlay Re-Renders**: Subscribing the HUD overlay to the millisecond clock ticker forces CEF to re-composite on top of Vulkan games 5–10 times per second, dropping game FPS.  
   *Mitigation:* Decouple overlay lyrics from clock tickers; schedule discrete `setTimeout` updates only at line transition timestamps; eliminate CSS blur shaders in the overlay.
5. **Spotify API 429 Crash & Non-Existent Discovery Endpoints**: Missing `import time` in `_spotify_api_request` crashes the backend on HTTP 429; querying proprietary endpoints like `/v1/me/made-for-you` returns HTTP 404.  
   *Mitigation:* Fix `time` import and implement a global rate-limit circuit breaker; use valid public endpoints (`/v1/me/top/*`) and user playlist filters; cache discovery data with a 1–6 hour TTL.

---

## Implications for Roadmap

Based on dependency analysis, hardware boundaries, and architectural prerequisites, the recommended phase breakdown for Milestone v0.5 comprises 6 structured phases:

### Phase 1: Smooth Audio Ducking Engine & PipeWire Fader
**Rationale:** Audio ducking is the foundational low-level primitive required by both game-specific soundtracks (Phase 2) and voice chat integration. It must be built and validated locally first.  
**Delivers:** `VolumeFader` class in `py_modules/volume.py`, single sink-input resolution, 50ms easing curve steps, task cancellation safety, and microphone activity monitoring via `pactl list source-outputs`.  
**Addresses:** Smooth Fading Audio Ducking, Voice Chat & Mic Activity Ducking.  
**Avoids:** Pitfall 1 (Subprocess flooding, PipeWire buffer clicks, Web API rate limiting) and Pitfall 7 (Voice ducking pumping/oscillation).

### Phase 2: Game-Specific Soundtracks (`appId` Linking & Lifecycle Automation)
**Rationale:** Relies directly on Phase 1's `VolumeFader` to transition audio when games launch. Requires robust SteamOS `SteamClient.Apps` lifetime event handling and persistent settings schemas.  
**Delivers:** Settings schema for `game_audio_profiles`, `appLifetimeSub` listener with 3-5s child-process debounce, AppID unsigned 32-bit normalization, pre-game playback snapshot & restore engine, and "Bind Current Music to Game" action.  
**Addresses:** Game-Specific Soundtrack Auto-Play & Handoff, 1-Click Game Binding.  
**Avoids:** Pitfall 2 (Proton launcher flapping, non-Steam AppID mismatch, session wipeout).

### Phase 3: Controller L2/R2 Ergonomics & Trigger Seeking
**Rationale:** Self-contained frontend input layer enhancement in `DeckifyExpandedModal.tsx`. Provides fast controller gestures before building the Discovery tab.  
**Delivers:** Schmidt trigger hysteresis (0.75 / 0.25 threshold), 300ms software debounce, modal-scoped event capture, optimistic local seek accumulator (±10s blind seek), and virtualized list page jumping with focus anchor re-targeting.  
**Addresses:** L2/R2 Controller Trigger Seeking, L2/R2 Fast List Page Jumping, Alphabet Jump.  
**Avoids:** Pitfall 3 (Analog trigger chatter, in-game trigger hijacking) and Pitfall 8 (Virtualized list focus loss).

### Phase 4: QAM Pinned Playlists & Quick In-Game Switch
**Rationale:** Enhances the Steam Quick Access Menu mini-player so players can switch soundtracks in 2 seconds without opening the full-screen modal during gameplay.  
**Delivers:** Horizontal pill container (`flow-children="horizontal"`) in QAM mini-player, maximum 4 pinned playlist items, cached base64 thumbnails, direct context play RPC, and playlist pin toggle in Library tabs.  
**Addresses:** QAM Pinned Playlists (2-second quick switch).  
**Avoids:** Pitfall 9 (QAM UI hitching from uncached RPCs) and CEF spatial navigation jump bugs.

### Phase 5: In-Game Overlay 2.0 (Live Synced Lyrics HUD)
**Rationale:** Extends the existing Gamescope HUD (`DeckifyOverlay.tsx`) to render real-time sing-along lyrics while playing games. Built after core audio and QAM controls are proven stable.  
**Delivers:** Discrete timestamp-based lyric line scheduler (`setTimeout`), single active line rendering beneath artist with cross-fade opacity, strict layout shift prevention (fixed height), negative latency offset compensation (-200ms default), and QAM visibility toggle.  
**Addresses:** In-Game HUD Overlay 2.0 (Active Synced Lyric Line), Dynamic Ambient Accent Tinting.  
**Avoids:** Pitfall 4 (Gamescope frame pacing stutter from CEF repaints) and Pitfall 10 (Audio buffer latency desync).

### Phase 6: Home / Discovery Hub Tab & Spotify API Hardening
**Rationale:** Capstone feature completing Milestone v0.5. Requires Spotify client hardening (fixing 429 handling) to ensure high-volume recommendation fetching never destabilizes the plugin.  
**Delivers:** Fix `import time` and add circuit breaker in `py_modules/spotify.py`; concurrent feed assembler in `py_modules/rpc_library.py`; multi-hour cache store; `DiscoveryTab.tsx` with Top Tracks, Top Artists, Algorithmic Mixes, and New Releases; and contextual time-of-day greeting.  
**Addresses:** Personalized Discovery Tab ("Made For You"), Contextual Time-of-Day Mixes.  
**Avoids:** Pitfall 5 (HTTP 429 crash, invalid discovery endpoints) and Pitfall 6 (Waterfall lyrics RPC stalling).

---

### Phase Ordering Rationale

1. **Phase 1 -> Phase 2 Dependency**: Game soundtrack auto-play requires volume fading to transition smoothly into the game; building the fader first ensures the lifecycle handlers have a robust audio backend to call.
2. **Phase 3 & Phase 4 Parallelism / Staging**: Trigger seeking (modal) and QAM pinned playlists (sidebar) refine handheld ergonomics across the two primary UI surfaces before adding new media tabs.
3. **Phase 5 Overlay Isolation**: The Gamescope overlay runs in a separate compositor layer; isolating its lyric enhancements prevents regressions in the main modal.
4. **Phase 6 API Hardening at the End**: Fetching discovery feeds hits multiple Spotify endpoints; hardening the HTTP client and rate-limiting circuit breaker first guarantees reliable feed retrieval.

### Research Flags

- **Phase 1 (Smooth Ducking Engine)**: *Standard Patterns* — `pactl` sink-input control and `asyncio` task management are well-documented; skip `/gsd-plan-phase --research-phase`.
- **Phase 2 (Game Soundtracks & AppLifetime)**: *Needs Deeper Research during Planning* (`/gsd-plan-phase --research-phase 2`) — Validate exact SteamOS 3.5 vs 3.7+ preview payload structures for `window.SteamClient.Apps.RegisterForAppLifetimeNotifications` and non-Steam shortcut ID bitwise masks.
- **Phase 3 (L2/R2 Controller Triggers)**: *Standard Patterns* — Synthesized DOM gamepad events in `@decky/ui` are proven; skip research-phase.
- **Phase 4 (QAM Pinned Playlists)**: *Standard Patterns* — Uses established `@decky/ui` `PanelSectionRow` and `Focusable`; skip research-phase.
- **Phase 5 (In-Game Overlay 2.0)**: *Needs Verification during Planning* — Test Gamescope overlay frame time impact on Steam Deck LCD vs OLED under 60FPS/90FPS GPU load.
- **Phase 6 (Discovery Tab & API Hardening)**: *Needs Deeper Research during Planning* (`/gsd-plan-phase --research-phase 6`) — Validate exact response schemas for `/v1/me/top/tracks` and public fallback behavior for new Spotify accounts with low play history.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| **Stack** | HIGH | Zero new external dependencies. Leverages verified SteamOS GamepadUI globals (`window.SteamClient`), PipeWire `pactl`, and Spotify Web API. |
| **Features** | HIGH | Requirements benchmarked against PS5 Control Center and Xbox Guide handheld media standards; anti-features rigorously identified. |
| **Architecture** | HIGH | Preserves v0.4 modular seams (`src/components/tabs/`, `py_modules/`), respects Steam CEF CSP, and maintains non-blocking asyncio patterns. |
| **Pitfalls** | HIGH | Real-world failure modes documented with concrete, testable mitigations (Proton launcher flapping, PipeWire fork bombs, trigger noise, CEF repaints). |

**Overall confidence:** **HIGH**

### Gaps to Address

- **SteamOS 3.7+ Preview Compatibility for `RegisterForAppLifetimeNotifications`**: Verify whether SteamOS 3.7+ alters the event signature or property names (`unAppID` vs `nAppID`).  
  *Handling:* Provide a defensive normalization helper with fallback checks during Phase 2 planning.
- **Non-Steam Shortcut CRC32 Bitwise Masking**: Confirm whether all non-Steam shortcuts consistently conform to `(Number(rawId) >>> 0)`.  
  *Handling:* Test against EmulationStation and Heroic Launcher during Phase 2 execution.
- **Audio Buffer Delay on Bluetooth Headphones**: Local PipeWire sink latency is ~150-200ms for internal speakers, but Bluetooth (A2DP/AAC) can add 150-300ms.  
  *Handling:* Ensure the user lyrics offset slider (-2000ms to +2000ms) in Settings is fully wired in Phase 5.

---

## Sources

### Primary (HIGH confidence)
- **Deckify v0.4 Production Codebase**: `main.py`, `py_modules/volume.py`, `py_modules/spotify.py`, `src/index.tsx`, `src/components/DeckifyExpandedModal.tsx`, `src/components/DeckifyOverlay.tsx`.
- **SteamOS GamepadUI & `@decky/ui` (4.11.1)**: Spatial navigation primitives, `FocusNavController`, `SteamClient.Apps.RegisterForAppLifetimeNotifications`.
- **PipeWire / PulseAudio Linux Standards**: `pactl list sink-inputs`, `pactl set-sink-input-volume`, `pactl list source-outputs` verified on SteamOS 3.5+.
- **Official Spotify Web API Documentation**: Endpoints `/v1/me/player/*`, `/v1/me/top/tracks`, `/v1/me/top/artists`, `/v1/recommendations`, and HTTP 429 rate limit backoff specifications.

### Secondary (MEDIUM confidence)
- **Steamcord Decky Plugin Architecture**: Audio stream classification patterns for detecting active Discord voice packets on Steam Deck.
- **Console Platform UX Benchmarks**: PlayStation 5 Control Center Media Card & Xbox Series X Guide Media Widget controller ergonomics.

---
*Research completed: 2026-11-12*  
*Ready for roadmap: yes*  
