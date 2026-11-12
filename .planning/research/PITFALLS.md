# Domain Pitfalls: Milestone v0.5 (In-Game Flow & Music Discovery)

**Domain:** SteamOS GamepadUI, PipeWire Audio & Spotify Integration  
**Researched:** 2026-11-12  
**Confidence:** HIGH (Verified against SteamOS CEF runtime, Decky Loader APIs, PipeWire audio subsystem, and Spotify Web API constraints)

---

## Executive Summary

Milestone v0.5 introduces features that operate across complex system boundaries: SteamOS GamepadUI CEF, Gamescope compositor, PipeWire/PulseAudio daemons, SteamClient native hooks, and the external Spotify Web API.

The primary architectural traps in this milestone stem from:
1. **Timing & Process Boundary Mismatches**: SteamOS firing rapid transient `AppLifetime` events during Proton prefix initialization or multi-process launcher sequences.
2. **Audio System Collisions**: Attempting to implement smooth fading via high-latency, rate-limited Spotify Web API endpoints rather than local PipeWire sink inputs; and flooding `pactl` subprocesses during game load.
3. **Hardware vs Software Event Semantics**: Analog trigger noise (L2/R2) masquerading as rapid digital clicks without hysteresis, and in-game chords conflicting with active gameplay.
4. **Compositor Overhead in Gamescope**: High-frequency DOM re-renders in the transparent CEF overlay causing APU GPU context switches and frame drops in AAA games.
5. **Spotify Web API Quotas**: Hitting HTTP 429 backoff traps due to missing error backoffs or requesting proprietary, non-existent endpoints like "Made For You".

---

## Critical Pitfalls

### Pitfall 1: Spotify Web API Volume Ducking & Subprocess Flooding in PipeWire

**What goes wrong:**
Attempting to implement smooth volume ducking (e.g. 15-20 steps over 1.5s) by calling Spotify Web API's `PUT /v1/me/player/volume` results in immediate HTTP 429 rate-limiting, network jitter, and audible staircase jumps. Conversely, implementing it locally by invoking `pactl list sink-inputs` on every step spawns 30-40 subshells in 1.5 seconds, starving Python's `_exec` threadpool and hitching the CPU during game launch.

**Why it happens:**
The Spotify Web API has network round-trip latencies of 100-300ms per call and aggressive rate quotas on player state mutations. Meanwhile, existing `py_modules/volume.py` inspects `pactl list sink-inputs` inside `set_pa_volume_percent` to discover the PID's sink input ID on every call, turning an iterative fade into a fork bomb.

**Consequences:**
- Spotify API returns HTTP 429 and drops future playback controls.
- Audio steps abruptly rather than smoothly fading.
- Decky UI and overlay completely freeze for 1-3 seconds during game startup.
- Rapid discontinuous volume changes cause buffer under-runs in PipeWire, manifesting as audible pops or clicks.

**Prevention:**
1. **Strict Separation of Concerns**: Never touch the Spotify Web API for volume ducking. Volume ducking must operate exclusively on the local PipeWire/PulseAudio sink input of the active player daemon (`librespot` or `spotifyd`).
2. **Sink Input ID Caching**: Query and resolve `sink_input_id` exactly **once** at the start of a duck/fade sequence. Reuse the cached integer ID for all subsequent step updates.
3. **Asynchronous Non-Blocking Easing Loop**: Run the fade in an `asyncio.create_task` with an easing curve (cubic or logarithmic fade) spaced at 50-75ms intervals (20-30 steps over 1.5s). PipeWire applies internal micro-ramping between steps spaced at >= 50ms, eliminating audio clicks.
4. **Task Cancellation**: Store a reference to the active fader `asyncio.Task`. If a new duck or restore event arrives before the current fade finishes, cancel the running task cleanly before initiating the new target fade.

**Detection:**
- PipeWire logs displaying buffer dropouts; `pactl` showing high CPU utilization; Decky backend logs flooded with rapid subprocess invocations.

---

### Pitfall 2: AppLifetime Multi-Process Flapping & Fake Non-Steam AppIDs

**What goes wrong:**
When launching games with intermediate launchers (EA App, Ubisoft Connect, Rockstar Launcher, 2K Launcher) or Proton games executing helper scripts (`wineboot.exe`, EAC installer, shader caches), Spotify starts the linked game soundtrack, stops it 2 seconds later, and reverts to the previous album before the game ever renders. Furthermore, non-Steam games and Flatpaks fail to match their soundtrack profiles entirely.

**Why it happens:**
`SteamClient.Apps.RegisterForAppLifetimeNotifications` emits events for *every* child process transition within the Proton wrapper. A launcher often launches (`bRunning: true`), closes itself (`bRunning: false`), and delegates to the main game executable (`bRunning: true`). A naive listener that immediately acts on `!bRunning` triggers premature exit restoration.
In addition, Steam assigns non-Steam shortcuts synthetic 32-bit/64-bit IDs (`crc32 | 0x80000000`). In CEF, `ev.unAppID` can arrive as a large unsigned 32-bit integer (> 2^31) while `ev.nAppID` is signed negative 32-bit, causing dictionary key mismatches against stringified settings keys.

**Consequences:**
- Soundtracks flap between playing, pausing, and restarting during game startup.
- Non-Steam games (EmulationStation, Heroic Launcher, standalone Flatpaks) are ignored.
- User's previous listening session is wiped out by a false start.

**Prevention:**
1. **Debounce Hysteresis Window**: On receiving `bRunning: false`, do not stop or restore audio immediately. Start a 3-5 second grace timer. If another `bRunning: true` event arrives for an associated PID or child app, cancel the timer and remain in the active game state.
2. **Canonical AppID Normalization**: Normalize all incoming AppIDs at the boundary:
   ```typescript
   const rawId = ev.unAppID ?? ev.nAppID;
   const normalizedAppId = String((Number(rawId) >>> 0)); // Unsigned 32-bit string
   ```
3. **Pre-Game Context Snapshot & Restore**: Before auto-playing a game soundtrack, snapshot the complete playback state:
   ```json
   {
     "pre_game_context_uri": "spotify:playlist:...",
     "pre_game_track_uri": "spotify:track:...",
     "pre_game_position_ms": 142050,
     "was_playing": true
   }
   ```
   On true game termination, verify `was_playing`. If true, restore the exact track and seek to `pre_game_position_ms` rather than restarting from track 0.

**Detection:**
- Log statements showing `AppLifetime: running=false` followed within 1500ms by `AppLifetime: running=true`; profiles failing to match on non-Steam game launches.

---

### Pitfall 3: Analog Trigger Hysteresis Failure & In-Game Input Hijacking

**What goes wrong:**
Pressing L2 or R2 to seek +/- 10s causes the track to jump by 60-120 seconds or stutter erratically. In worst-case implementations, global L2/R2 listeners capture triggers while playing games, causing the player to seek backward and forward every time the user aims or accelerates in-game!

**Why it happens:**
Steam Deck L2 and R2 are analog triggers reporting continuous float values between `0.0` and `1.0`. When listening to gamepad button events via `SteamClient.Input` or Gamepad API without analog thresholding and debouncing, analog noise around the trigger point (e.g. fluctuating between 0.49 and 0.51) fires dozens of digital button-down events in milliseconds.
Furthermore, if the listener is registered globally without checking whether the Deckify modal is active, trigger inputs meant for the game are consumed or mirrored by Deckify.

**Consequences:**
- Seeking is completely uncontrollable (single trigger tap skips a third of the song).
- Severe game interference (shooting, braking, or aiming triggers audio seeks in Deckify).
- Concurrent rapid seek requests flood the Spotify Web API with out-of-order `seek_playback` requests.

**Prevention:**
1. **Strict Context Scoping**: L2/R2 seek and list navigation hooks must **ONLY** be active when the Deckify Expanded Modal is currently open and focused (`bigOpen === true`). They must never be registered as unchordoned global listeners.
2. **Schmidt Trigger Hysteresis**:
   - Activation Threshold: Trigger must exceed `0.75` (75% pull) to register an action.
   - Release Threshold: Trigger must drop below `0.25` (25% pull) before a subsequent activation is permitted.
   - Software Debounce: Minimum cooldown of 300ms between discrete trigger triggers.
3. **Optimistic Local Seek Accumulator**: When rapid triggers are legitimately tapped, accumulate the target offset locally (`accumulatedTargetMs += 10000`) and debounce the backend RPC call by 250ms so that only the final intended position is sent to the Spotify API.

**Detection:**
- Backend logs showing multiple `seek_playback` RPC calls within < 100ms; player position jumping back and forth due to out-of-order network responses.

---

### Pitfall 4: Gamescope Compositor Stutter from High-Frequency Overlay Re-Renders

**What goes wrong:**
Enabling the live synced lyrics line in the in-game HUD overlay causes visible frame pacing stutter and 5-10 FPS drops in graphically demanding games (e.g. *Cyberpunk 2077*, *Elden Ring*).

**Why it happens:**
Valve's Gamescope compositor renders the Steam GamepadUI Chromium Embedded Framework (CEF) layer directly on top of the running Vulkan/OpenGL game. Whenever any DOM element inside the overlay updates, Chromium invalidates the layer rect and re-rasters it. If the lyrics overlay subscribes to the millisecond playback clock ticker (which ticks every 100-250ms) or recalculates text positions on every frame, Gamescope is forced to composite the transparent CEF layer at high frequency, stealing GPU cycles from the 15W APU.

**Consequences:**
- Noticeable micro-stutters and frame spikes in games.
- Increased battery consumption and APU temperature.
- Visual flicker in the overlay HUD.

**Prevention:**
1. **Decouple Lyrics HUD from Continuous Clock Tickers**: The overlay lyrics component must **never** subscribe to `usePlaybackClock` or an interval-based position timer.
2. **Discrete Event-Driven Timer**: When a track's synced lyrics are loaded, compute the delta to the *next* lyric line (`delayMs = nextLine.timeMs - currentPositionMs`). Schedule a single `setTimeout` to update the displayed line when that timestamp arrives. Zero DOM updates occur between lyric lines.
3. **CSS Performance Optimization**:
   - Apply `will-change: opacity, transform` and `transform: translate3d(0, 0, 0)`.
   - Avoid heavy GPU shaders like `backdrop-filter: blur(...)` in the in-game HUD overlay when games are running; use a solid semi-transparent background (`rgba(18, 18, 18, 0.88)`).

**Detection:**
- Gamescope performance overlay (`STEAM + Performance Level 4`) showing erratic frame time spikes coinciding with playback progress ticks; CEF CPU utilization > 5% while idle in-game.

---

### Pitfall 5: Spotify API Rate Limit (HTTP 429) Traps & Discovery Endpoint Myths

**What goes wrong:**
Navigating to the Home/Discovery tab or fetching user top items triggers unhandled HTTP 429 errors that freeze the plugin or crash the backend with `NameError: name 'time' is not defined`. Concurrently, querying non-existent endpoints for "Made For You" or "Daylist" fails with HTTP 404/403.

**Why it happens:**
1. In `py_modules/spotify.py`, the existing 429 handler in `_spotify_api_request` calls `time.sleep(min(retry_after, 2))` without having imported the `time` module.
2. Even if imported, capping backoff at 2 seconds when Spotify requests `Retry-After: 30` violates the contract; subsequent retries get banned for exponentially longer periods.
3. Spotify does **not** provide public Web API endpoints for proprietary client views like "Made For You", "Daylist", or "Discover Weekly". Attempting to call `/v1/me/made-for-you` results in HTTP 404.

**Consequences:**
- Python backend crashes on 429 with `NameError`.
- Plugin gets temporarily banned by Spotify for 1-15 minutes.
- Discovery tab fails to load or hangs indefinitely.

**Prevention:**
1. **Fix 429 Backoff & Circuit Breaker**: Properly import `time` and implement a global rate-limit circuit breaker in `py_modules/spotify.py`:
   ```python
   _rate_limited_until = 0.0
   
   # If now < _rate_limited_until, reject non-essential requests immediately with cached fallback
   ```
2. **Use Valid Public Endpoints for Discovery**:
   - User Top Tracks / Artists: `GET /v1/me/top/tracks` and `GET /v1/me/top/artists` with `time_range` (`short_term`, `medium_term`, `long_term`).
   - Algorithmic Mixes: Fetch `/v1/me/playlists` and filter for playlists owned by `spotify` whose titles match "Discover Weekly", "Release Radar", "Daily Mix", or "Daylist".
   - Recommendations: `GET /v1/recommendations` with seed artists/tracks from user top items.
3. **Aggressive Multi-Hour Caching**: Discovery playlists and top tracks do not change minute-to-minute. Cache discovery responses in memory and disk with a TTL of 1 to 6 hours. Never re-query them on every tab switch.

**Detection:**
- Backend logs showing `HTTP Error 429: Too Many Requests`; missing `time` import tracebacks; HTTP 404 errors on discovery routes.

---

## Moderate Pitfalls

### Pitfall 6: Synchronous Multi-Tier Lyrics Waterfall Stalling Backend RPC

**What goes wrong:**
When playing a track not indexed in Spotify CDP or LRCLIB, the backend iterates synchronously through 5 waterfall providers (CDP -> LRCLIB get -> LRCLIB search -> NetEase -> Musixmatch -> Lyrics.ovh). Each provider HTTP request times out sequentially, locking Python worker threads for up to 10-15 seconds.

**Why it happens:**
`_fetch_lyrics_sync` runs all fallbacks in a single synchronous function call inside the threadpool executor. When all providers miss, the cumulative network timeout delays status reporting and playback controls.

**Prevention:**
- Run secondary providers asynchronously in the background.
- Implement a 24-hour negative cache for track IDs where all providers returned no lyrics, preventing repeat 15-second waterfall searches every time the song loops or re-plays.
- Enforce a strict 2.5-second timeout per provider request.

---

### Pitfall 7: Voice Chat Ducking Oscillation ("Pumping")

**What goes wrong:**
When voice chat awareness (Discord/Steamcord/Steam Voice) is active, music volume rapidly jumps up and down every time a user pauses between words, creating an irritating "pumping" sound.

**Why it happens:**
Audio activity thresholds drop to zero immediately when speech pauses for 200ms, triggering an immediate volume fade-in, followed by an immediate fade-out as soon as speech resumes.

**Prevention:**
Implement a decay hold timer (1.5 to 2.0 seconds) after voice stream activity stops before initiating the volume restoration fade. If voice activity resumes during the hold period, reset the timer without touching the volume.

---

### Pitfall 8: Virtualized List Focus Loss During Trigger Alphabet/Page Jumps

**What goes wrong:**
Using L2/R2 triggers to jump through long lists (e.g. jumping alphabetically A-Z in Liked Songs) causes the controller focus highlight to disappear completely, locking the user out of D-pad navigation.

**Why it happens:**
When jumping large scroll offsets in React virtualized lists, the DOM nodes representing the currently focused element are unmounted. GamepadUI's spatial navigation loses its anchor node and falls back to the top-level container.

**Prevention:**
Whenever programmatically scrolling a list via trigger jumps:
1. Target the first item of the new section.
2. In the next animation frame after the scroll offset updates, explicitly invoke `Navigation.FocusElement(elementRef)` or `.focus()` on the new target's `Focusable` node.

---

## Minor Pitfalls

### Pitfall 9: QAM Mini-Player Hitching from Uncached Pinned Playlists

**What goes wrong:**
Opening the Steam Quick Access Menu in-game hitches for 1-2 seconds if pinned playlist cards try to fetch metadata or cover images over RPC during render.

**Prevention:**
Store pinned playlist IDs, names, and pre-fetched base64 thumbnail icons directly inside `settings.json`. QAM renders purely from local persistent settings with zero network or heavy RPC dependencies.

---

### Pitfall 10: Lyrics Audio Buffer Latency Desynchronization

**What goes wrong:**
Lyrics text appears 200-400ms before or after the vocalist sings, even on accurately timestamped LRC files.

**Prevention:**
PipeWire audio pipelines on SteamOS incur ~150-250ms of audio buffer latency from `librespot` through the sink. Include a default `-200ms` offset in the lyrics sync engine and expose an adjustable user offset slider in Settings (-2000ms to +2000ms in 100ms increments).

---

## Phase-Specific Warnings

| Phase | Phase Topic | Likely Pitfall | Concrete Mitigation |
|-------|-------------|---------------|---------------------|
| **Phase 1** | Smooth Audio Ducking & PipeWire Engine | Spawning 40 `pactl` subprocesses during fade; threadpool lockup; PipeWire clicks | Query `sink_input_id` once; 50ms easing steps in asyncio loop; cancel in-flight faders cleanly |
| **Phase 2** | Game-Specific Soundtracks & SteamOS AppLifetime | Launcher/Proton child process flapping; synthetic non-Steam appID mismatch; queue overwrite | 3s debouncing on `bRunning: false`; unsigned 32-bit `unAppID >>> 0` normalization; pre-game playback state snapshot & restore |
| **Phase 3** | L2/R2 Controller Triggers & List Navigation | Analog trigger chatter causing rapid-fire seeks; in-game controls being intercepted | Strict 0.75 / 0.25 Schmidt trigger hysteresis; scope L2/R2 exclusively to open modal; optimistic local seek accumulator |
| **Phase 4** | In-Game Lyrics HUD (Gamescope Overlay) | Gamescope frame drops from continuous CEF clock repaints; APU power drain | Discrete timer updates on lyric change only; no continuous clock ticker in HUD; remove blur shaders in overlay |
| **Phase 5** | QAM Pinned Playlists & Discovery Tab | Unhandled 429 crash in `spotify.py`; requesting invalid Spotify "Made For You" endpoints | Fix `time` import and add circuit breaker in `_spotify_api_request`; use `/v1/me/top/*` and playlist filters; 1-6h TTL caching |

---

## Sources

- **SteamOS CEF & GamepadUI Spatial Navigation**: Verified via `@decky/ui` v4.11.1 and SteamOS 3.5+ runtime behavior (`SteamClient.Apps`, `SteamClient.Input`).
- **PipeWire / PulseAudio Subsystem**: Verified against `pactl` sink-input control and PipeWire clock rate management in `py_modules/volume.py`.
- **Spotify Web API Specifications**: Verified against official Spotify Web API Developer Documentation (`/v1/me/player/*`, `/v1/me/top/*`, HTTP 429 `Retry-After` requirements).
- **Gamescope Compositor Constraints**: Steam Deck APU thermal and GPU composition overhead on transparent CEF overlay layers.
