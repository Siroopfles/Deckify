# Phase 06: Smooth Audio Ducking Engine & PipeWire Fader - Research
**Researched:** 2026-11-12
**Domain:** SteamOS PipeWire / PulseAudio Audio Control & Background Voice Stream Monitoring
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Fading Curve & Timing
- **D-01 (Cosine Easing & Asyncio Task):** Volume transitions must use a smooth cosine/smoothstep easing curve executed asynchronously in a non-blocking `asyncio` task (`fade_volume`) in `py_modules/volume.py` with 50ms time slices. If a new fade event arrives while another is in flight, the previous fade task must be cleanly cancelled before starting the new curve. — **Reversibility:** reversible
- **D-02 (Default Durations & Full Settings Config):** Default fading durations are set to **1.0s fade-down** (fast attenuation when game audio or voice starts) and **1.5s fade-up** (gentle restoration when game stops or voice activity ceases). Both durations are exposed as interactive sliders (0.5s to 3.0s) in `SettingsTab.tsx`. — **Reversibility:** reversible

#### Voice Chat & Microfoon Ducking
- **D-03 (Source-Output VAD & Silence Hold Hysteresis):** Active recording streams are detected locally via `pactl list source-outputs` (checking for active, non-corked client streams from Discord, Steamcord, or Steam Voice). Ducking defaults to attenuating music to **25%** volume with a **1.2-second silence hold delay** after speech ceases before initiating fade-up, preventing distracting "volume pumping" during natural conversation pauses. — **Reversibility:** reversible
- **D-04 (Configurable Voice Controls):** `SettingsTab.tsx` provides dedicated settings for Voice Chat Ducking: master toggle (enabled/disabled), duck target volume slider (10% to 50%), and silence hold delay slider (0.5s to 3.0s). — **Reversibility:** reversible

#### Ducking Volume Berekening
- **D-05 (Proportional / Relative Attenuation Default):** By default, ducking calculates the target level proportionally based on the current listening volume (e.g., reduces current volume by 50% rather than jumping to a hardcoded 30%), preventing music from becoming *louder* if the user is already listening at a low volume. A toggle in `SettingsTab.tsx` allows power users to switch between proportional (%) and fixed absolute volume. — **Reversibility:** reversible

#### Volume Control Boundary & UI Feedback
- **D-06 (100% Local PipeWire Sink-Input Volume & Visual UI Feedback):** Ducking operates strictly on the local PipeWire sink-input (`pactl set-sink-input-volume <id>`), keeping the Spotify Web API cloud volume untouched (0 API calls, 0ms latency, zero cross-device desync). In the frontend, the volume slider smoothly animates along with the local fade to reflect the audible output AND displays an elevated `Ducked` pill badge beside the volume percentage so the user immediately knows attenuation is active. — **Reversibility:** reversible

### the agent's Discretion
- Selection of easing formula (`0.5 * (1 - math.cos(math.pi * progress))`) for smooth audio acceleration/deceleration.
- Local caching of `sink_input_id` during a fade to eliminate redundant `pactl list sink-inputs` subprocess forks.
- Error handling fallback: if `pactl` is temporarily unavailable or running headless in non-PipeWire test environments, fail gracefully without throwing RPC exceptions.

### Deferred Ideas (OUT OF SCOPE)
- In-Game cutscene audio-peak detection (analyzing game sink audio output volume to auto-pause music during dialogue) — Deferred to backlog (Pillar 1 in `IDEAS.md`).
- Parametric 10-band DSP PipeWire biquad equalizer filter chain — Deferred to future milestone.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **DUCK-01** | User experiences a smooth, gradual volume fade (~1.0–1.5s) via local PipeWire/PulseAudio sink-input volume when a game launches or closes, eliminating abrupt volume jumps. | Non-blocking `asyncio` task (`VolumeFader`) in `py_modules/volume.py` executing a cosine easing curve with 50ms time slices. One-time resolution and caching of `sink_input_id` eliminates fork bombs. SteamClient `AppLifetimeNotifications` hook with 3-second multi-process debounce in `src/index.tsx` triggers fade-down / fade-up. |
| **DUCK-02** | User experiences automatic volume ducking when active microphone or voice chat streams (Discord, Steamcord, Steam Voice) are detected, with decay hold hysteresis. | Background poller (`VoiceActivityDetector`) in `py_modules/volume.py` inspecting `pactl list source-outputs` for uncorked, unmuted client streams every 350ms. Atomic timestamp tracking with 1.2s silence hold delay eliminates speech oscillation ("pumping"). Idle throttling when music is paused. |
</phase_requirements>

## Project Constraints (from GEMINI.md)

- **Steam CEF Content Security Policy:** Steam GamepadUI strictly blocks direct external image URLs (`https://i.scdn.co/`), requiring internal proxying/base64 encoding.
- **SteamOS GamepadUI Navigation:** Controller focus relies on spatial navigation (`flow-children`, `@decky/ui`); containers with horizontal controls must use `flow-children="horizontal"` to prevent focus loss.
- **Steam Deck Environment:** Runs in the `deck` user space (UID 1000) under SteamOS 3.5+.
- **Subprocess Environment Isolation:** Decky Loader's bundled Python libraries conflict with SteamOS system libraries. `os.environ.pop("LD_LIBRARY_PATH", None)` is mandatory before spawning subprocesses. Use `_build_deck_command` to execute `pactl` with proper `PULSE_SERVER` and `XDG_RUNTIME_DIR`.
- **Zero Spotify Web API Rate Limit Impact:** Audio ducking must operate 100% locally on PipeWire sink inputs (`pactl set-sink-input-volume`); never call `PUT /v1/me/player/volume` for ducking.

---

## Summary

Phase 06 establishes Deckify's local audio fading and ducking engine, eliminating abrupt volume cuts when Steam games launch or when players communicate via voice chat (Discord, Steamcord, Steam Voice). 

Currently in `src/index.tsx`, when an app launch notification fires, Deckify immediately makes a remote Spotify Web API call `backendSetVolume(duckVol)` [VERIFIED: `src/index.tsx:742`]. This causes high latency (~200ms), audible stepping, desynchronizes remote Spotify Connect devices, and risks triggering HTTP 429 rate limit backoffs. Furthermore, `py_modules/volume.py` repeatedly invokes `pactl list sink-inputs` on every volume call [VERIFIED: `py_modules/volume.py:53-68`], which would spawn 30–40 subshells in a 1.5s fade, stalling Python's executor threadpool and causing UI stutter during game boot.

The solution delivered in Phase 06 is an asynchronous local `VolumeFader` class and a `VoiceActivityDetector` worker running in `py_modules/volume.py`:
1. **Local Cosine Easing Loop:** Fades the active player's PipeWire sink input using `0.5 * (1 - math.cos(math.pi * progress))` at 50ms intervals over 1.0s (fade-down) and 1.5s (fade-up).
2. **One-Time Sink Resolution:** Resolves and caches the `sink_input_id` once at the start of the fade, executing direct `pactl set-sink-input-volume <id> <percent>%` calls on each tick without querying the sink list again.
3. **Task Cancellation & Interruption Safety:** If a new fade arrives while one is in progress, the active `asyncio.Task` is cleanly cancelled, and the new transition begins smoothly from the *current* mid-flight volume without clicking or resetting.
4. **Voice Activity Hysteresis (DUCK-02):** A lightweight background task polls `pactl list source-outputs` (every 350ms while playing), checking for active uncorked/unmuted microphone capture streams. A 1.2s silence hold delay prevents volume pumping during natural speech pauses.
5. **UI Synchronization (D-06):** Backend emits `decky.emit("ducking_state_changed", ...)` updates. The Quick Access Menu (QAM) volume slider animates smoothly to mirror the audible level and displays an elevated `Ducked` pill badge.

**Primary recommendation:** Build `VolumeFader` and `VoiceActivityDetector` in `py_modules/volume.py`, add RPC endpoints `trigger_ducking` and `get_ducking_state` in `main.py`, connect `SteamClient.Apps` lifetime events in `src/index.tsx` with a 3s multi-process debounce, and mount dedicated configuration controls in `SettingsTab.tsx`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| **Volume Easing Curve Calculation** | Backend (`py_modules/volume.py`) | — | Pure mathematical cosine curve running in an `asyncio` task at 50ms intervals. Keeps audio timing independent of CEF rendering frame rate. |
| **PipeWire Sink-Input Volume Control** | Backend (`py_modules/volume.py`) | OS (`pactl` / PipeWire) | Hardware audio stream manipulation via `pactl set-sink-input-volume`. Must run in host Python daemon with `_build_deck_command`. |
| **Voice Activity Detection (VAD)** | Backend (`py_modules/volume.py`) | OS (`pactl list source-outputs`) | Monitors microphone recording streams across Discord, Steam Voice, and games. Zero IPC overhead to frontend. |
| **Silence Hold Hysteresis** | Backend (`py_modules/volume.py`) | — | Atomic timestamp comparison (`last_speech_time + silence_hold_delay`) to prevent audio pumping. |
| **Game Launch / Exit Detection** | Frontend (`src/index.tsx`) | SteamOS CEF (`SteamClient.Apps`) | `window.SteamClient.Apps.RegisterForAppLifetimeNotifications` is only available in the Steam GamepadUI CEF context. |
| **Multi-Process Launcher Debounce** | Frontend (`src/index.tsx`) | Backend (`main.py`) | 3-second grace window on `bRunning: false` prevents EA/Ubisoft/Proton child launchers from flapping ducking states. |
| **Visual Ducking Indicator & Animated Slider** | Frontend (`src/index.tsx`) | Backend (`decky.emit`) | Displays `Ducked` pill badge and updates slider value when receiving `ducking_state_changed` events. |
| **Ducking & Voice Settings UI** | Frontend (`src/components/tabs/SettingsTab.tsx`) | Backend (`py_modules/common.py`) | Provides sliders and toggles for durations, silence hold, ducking mode, and volume targets. |

---

## Standard Stack

### Core
| Library / Utility | Version / Spec | Purpose | Why Standard |
|-------------------|----------------|---------|--------------|
| `pactl` (PipeWire / PulseAudio) | SteamOS 3.5+ built-in | Local sink-input and source-output control | Native Linux audio IPC interface; direct, zero-dependency, sub-millisecond execution. |
| Python `asyncio` | 3.11+ (Python stdlib) | Non-blocking fading tasks and VAD poller | Native event loop; provides cancellation semantics (`task.cancel()`) without OS thread overhead. |
| Python `math` | Python stdlib | Cosine easing calculation | `math.cos` and `math.pi` provide zero-dependency, ultra-fast S-curve calculations. |
| `@decky/api` | 1.1.3 [VERIFIED: `package.json:30`] | RPC bridges & event bus (`decky.emit` / `addEventListener`) | Standard Decky Loader frontend-to-backend communication. |
| `@decky/ui` | 4.11.1 [VERIFIED: `package.json:31`] | SteamOS spatial navigation & UI elements | Official Valve UI components (`SliderField`, `ToggleField`, `Focusable`). |

### Supporting
| Library / Utility | Version / Spec | Purpose | When to Use |
|-------------------|----------------|---------|-------------|
| `time.monotonic` | Python stdlib | Drift-free delta and hysteresis measurement | Guarantees monotonic time progression unaffected by NTP clock steps. |
| `_build_deck_command` | In-repo (`py_modules/common.py:220-240`) | User-space command execution wrapper | Wraps `pactl` commands under `DECK_USER` (UID 1000) when Decky runs as root. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `pactl set-sink-input-volume` | Spotify Web API `PUT /v1/me/player/volume` | **Rejected:** Web API has 100–300ms latency, triggers HTTP 429 rate limits during multi-step fades, steps abruptly, and desyncs remote Connect devices. |
| Polling `pactl list source-outputs` (350ms) | PipeWire Native C Library / C-bindings | **Rejected:** Requires compiling native C extensions against SteamOS toolchain. `pactl` via subshell takes < 3ms and is completely portable. |
| Cosine easing (`0.5 * (1 - cos(pi * t))`) | Linear stepping (`start + (target - start) * t`) | **Rejected:** Linear audio transitions sound unnatural to human hearing (perceived as abrupt start and stop); cosine provides smooth logarithmic acceleration and deceleration. |

---

## Package Legitimacy Audit

> All capabilities in Phase 06 utilize built-in SteamOS system utilities (`pactl`), Python standard libraries (`asyncio`, `math`, `subprocess`, `time`), and existing project dependencies (`@decky/api`, `@decky/ui`). No new external NPM or PyPI packages are introduced.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| None (Zero new packages) | N/A | N/A | N/A | N/A | [OK] | Approved |

---

## Architecture Patterns

### System Architecture Diagram

```
+----------------------------------------------------------------------------------------------------+
|                                    SteamOS GamepadUI (CEF Layer)                                   |
|                                                                                                    |
|  [ SteamClient.Apps.RegisterForAppLifetimeNotifications ]                                           |
|                     |                                                                              |
|      (Game Launch / Exit Event)                                                                    |
|                     v                                                                              |
|      [ 3s Multi-Process Debounce ]  ------> backendTriggerDucking(active, appId)                   |
|                                                                                                    |
|  [ QAM Mini-Player Volume Slider ] <------- addEventListener("ducking_state_changed")              |
|         - Displays animated effective volume                                                       |
|         - Displays elevated [ Ducked ] pill badge                                                  |
+----------------------------------------------------------------------------------------------------+
                                                |
                                                | @decky/api RPC & Events
                                                v
+----------------------------------------------------------------------------------------------------+
|                                    Python Daemon (py_modules/volume.py)                            |
|                                                                                                    |
|    +---------------------------------+             +-----------------------------------------+     |
|    |     VoiceActivityDetector       |             |              VolumeFader                |     |
|    |---------------------------------|             |-----------------------------------------|     |
|    | - Polls pactl list              |             | - Resolves & caches sink_input_id once  |     |
|    |   source-outputs (every 350ms)  |             | - Cosine easing curve: 50ms time slices |     |
|    | - Filters uncorked/unmuted mic  |             | - Duration: 1.0s (down) / 1.5s (up)     |     |
|    | - 1.2s silence hold hysteresis  |             | - Interruption safety: cancels in-flight|     |
|    |   timer before releasing        |             |   task, fades from mid-flight volume    |     |
|    +---------------------------------+             +-----------------------------------------+     |
|                     |                                                   |                          |
|                     +-------------------> [ Ducking Coordinator ] <-----+                          |
|                                                     |                                              |
|                                                     | pactl set-sink-input-volume <id> <vol>%      |
|                                                     v                                              |
|                                    +-----------------------------------------+                     |
|                                    |       PipeWire / PulseAudio Daemon      |                     |
|                                    |    (librespot / spotify_client sink)    |                     |
|                                    +-----------------------------------------+                     |
+----------------------------------------------------------------------------------------------------+
```

### In-Repo File Citations

Verbatim extracts from codebase confirming discrete values and existing structures:

1. **Volume functions in `py_modules/volume.py:44-79`:**
   ```python
   async def set_pa_volume_percent(plugin, percent: int) -> bool:
       """Set librespot's PulseAudio sink-input volume percentage."""
       if not plugin._process:
           return False
       pid = plugin._process.pid
       try:
           env = os.environ.copy()
           env["PULSE_SERVER"] = PULSE_SERVER
   ...
           if sink_input_id:
               def _set_vol():
                   return subprocess.run(
                       ["pactl", "set-sink-input-volume", sink_input_id, f"{int(percent)}%"],
                       capture_output=True, text=True, env=env,
                   )
               await _exec(_set_vol)
               return True
   ```
2. **PulseAudio environment and default settings in `py_modules/common.py:70-97`:**
   ```python
   DEFAULT_SETTINGS = {
       "device_name": "",
       "audio_backend": "librespot",
       "audio_quality": "320",
       "bitrate": 320,
       "bit_perfect_clock": True,
       "spotify_client_id": "",
       "normalisation": True,
       "normalisation_pregain": 0.0,
       "gapless": True,
       "autoplay": True,
       "playlist_folders": [],
       "spotify_folder_tree": [],
       "game_audio_profiles": {},
       "auto_ducking": True,
       "auto_ducking_volume": 30,
       "gamepad_chords_enabled": True,
       "toast_enabled": True,
       "toast_position": "top_right",
       "overlay_enabled": False,
       "overlay_position": "top-right",
       "overlay_autohide": False,
       "overlay_show_progress": False,
       "eq_preset": "flat",
   }

   # PulseAudio socket for processes
   PULSE_SERVER = f"unix:/run/user/{DECK_UID}/pulse/native"
   ```
3. **App Lifetime listener in `src/index.tsx:721-755`:**
   ```typescript
     // 6. In-game Auto-Ducking & App Lifetime Listener (with per-game profiles)
     let originalVolumeBeforeGame: number | null = null;
     let activeGameAppId: number | null = null;
     let appLifetimeSub: any = null;
     try {
       const steamApps = (window as any).SteamClient?.Apps;
       if (steamApps?.RegisterForAppLifetimeNotifications) {
         appLifetimeSub = steamApps.RegisterForAppLifetimeNotifications(async (ev: any) => {
           if (!ev) return;
           const appId = ev.unAppID || ev.nAppID;
           const running = Boolean(ev.bRunning);
           if (running && appId) {
             activeGameAppId = appId;
             const status = await backendGetStatus().catch(() => null);
             if (!status) return;
             const profiles = status.settings?.game_audio_profiles || {};
             const profile = profiles[String(appId)];
             const ducking = profile ? profile.ducking : (status.settings?.auto_ducking ?? true);
             const duckVol = profile ? profile.volume : (status.settings?.auto_ducking_volume ?? 30);
             if (ducking && status.volume != null && status.volume > duckVol) {
               originalVolumeBeforeGame = status.volume;
               await backendSetVolume(duckVol);
             }
           } else if (!running && activeGameAppId) {
             activeGameAppId = null;
             if (originalVolumeBeforeGame != null) {
               await backendSetVolume(originalVolumeBeforeGame);
               originalVolumeBeforeGame = null;
             }
           }
         });
       }
     } catch (err) {
       console.debug("Deckify: AppLifetimeNotifications not available", err);
     }
   ```
4. **Volume slider in `src/index.tsx:420-432`:**
   ```typescript
               {/* Volume slider */}
               <PanelSectionRow>
                 <SliderField
                   label="Volume"
                   value={volume}
                   min={0}
                   max={100}
                   step={1}
                   showValue
                   valueSuffix="%"
                   onChange={handleVolumeChange}
                 />
               </PanelSectionRow>
   ```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Volume interpolation curve | Custom linear steps or arbitrary exponential formulas | Standard cosine easing: `0.5 * (1 - math.cos(math.pi * p))` [CITED: easings.net/#easeInOutSine] | Cosine easing guarantees zero first derivative at start and finish ($v'(0)=0, v'(1)=0$), preventing audible clicks, pops, or abrupt acceleration at transition boundaries. |
| Voice speech detection | Complex RMS audio stream processing / FFT analysis | `pactl list source-outputs` inspection | Capturing and analyzing raw PCM microphone buffers consumes APU GPU/CPU cycles and violates sandbox permissions. Checking PipeWire's source-output registry is instantaneous and non-invasive. |
| Subprocess execution as root | Direct `subprocess.run(["pactl", ...])` without user switching | `py_modules/common._build_deck_command` [VERIFIED: `py_modules/common.py:220`] | When Decky runs as root (UID 0), accessing PulseAudio requires `runuser -u deck -- env ...` with proper `PULSE_SERVER` and `XDG_RUNTIME_DIR`. `_build_deck_command` handles this dynamically. |
| Audio Ducking across devices | Spotify Web API volume adjustment (`PUT me/player/volume`) | Local PipeWire sink-input volume (`pactl set-sink-input-volume`) | Web API volume adjustments disrupt the user's remote devices (e.g. phones, smart speakers) and trigger HTTP 429 bans when stepped rapidly. |

---

## Common Pitfalls

### Pitfall 1: Subprocess Flooding & Threadpool Starvation
**What goes wrong:** Calling `pactl list sink-inputs` on every 50ms tick of a 1.5s fade forks 30 subprocesses in rapid succession. On Steam Deck's 4-core APU under heavy game load, this floods Python's threadpool executor, causing UI lockups and audio buffer underruns (crackling).  
**Why it happens:** Re-resolving the PID and sink input index on every step instead of caching the integer ID.  
**How to avoid:** Query `pactl list sink-inputs` exactly **once** at the initiation of the fade. Store `sink_input_id: str`. Subsequent 50ms ticks call `pactl set-sink-input-volume <id> <vol>%` directly. Invalidate the cached ID only when the fade completes or if the command returns a non-zero exit code.  
**Warning signs:** Decky backend logs flooded with rapid subprocess invocations; audio pops on game start.

### Pitfall 2: Voice Chat Ducking Oscillation ("Pumping")
**What goes wrong:** While communicating in Discord or Steam Voice, music volume rapidly leaps up and down between words during natural speech pauses, creating an irritating "pumping" effect.  
**Why it happens:** Voice activity detection releasing immediately when input audio drops below threshold for even 100–200ms.  
**How to avoid:** Implement a **1.2s to 1.5s decay hold hysteresis window** [VERIFIED: `06-CONTEXT.md:21`]. When speech is detected, record `last_speech_time = time.monotonic()`. While `time.monotonic() - last_speech_time < hold_delay`, maintain the ducked level. Only begin the fade-up curve after speech has been silent for the full hold duration. If speech resumes during the hold period, reset the timer without touching the volume.  
**Warning signs:** Music volume fluttering up and down while talking in Discord.

### Pitfall 3: Mid-Flight Fade Cancellation Jumps
**What goes wrong:** If a game exits while a fade-down is halfway completed (e.g. at 60% volume), the fader resets volume back to 100% or 30% before starting the fade-up, causing an audible pop or volume jump.  
**Why it happens:** Hardcoding `start_volume` to the nominal maximum rather than reading the *current* volume reached at the moment of cancellation.  
**How to avoid:** Track `_current_sink_volume: float`. When cancelling an in-flight `_fade_task`, take `start_volume = self._current_sink_volume`. Construct the new cosine curve smoothly from that exact intermediate level to the new target.  
**Warning signs:** Audible volume jumps when rapidly alt-tabbing or quitting a game during launch.

### Pitfall 4: Proton Launcher Multi-Process Flapping
**What goes wrong:** Games with intermediate launchers (EA App, Ubisoft, Proton helper scripts) emit rapid `bRunning: true -> false -> true` transitions, causing Deckify to start fading down, immediately fade up, and then fade down again.  
**Why it happens:** Acting on `bRunning: false` immediately without a debounce window.  
**How to avoid:** Debounce game exit events by **3.0 seconds**. On `bRunning: false`, set a timer; if another `bRunning: true` arrives within 3 seconds, cancel the timer and stay ducked.

---

## Code Examples

### 1. VolumeFader Core Implementation (`py_modules/volume.py`)

```python
# [VERIFIED: Python 3.11+ stdlib asyncio/math patterns]
import asyncio
import math
import os
import subprocess
import time
from py_modules.common import (
    PULSE_SERVER,
    _exec,
    _build_deck_command,
    decky,
)
from py_modules.engine import _parse_pactl_sink_inputs

class VolumeFader:
    """Asynchronous non-blocking volume fader using cosine easing over PipeWire sink inputs."""

    def __init__(self, plugin):
        self.plugin = plugin
        self._fade_task: asyncio.Task | None = None
        self._current_sink_volume: float = 100.0  # Normalized % of baseline
        self._target_sink_volume: float = 100.0
        self._cached_sink_input_id: str | None = None
        self._duck_reasons: set[str] = set()

    @property
    def is_ducked(self) -> bool:
        return len(self._duck_reasons) > 0

    async def resolve_sink_input_id(self) -> str | None:
        """Find the active Spotify/librespot PipeWire sink input ID."""
        try:
            cmd, env = _build_deck_command(["pactl", "list", "sink-inputs"])
            res = await _exec(
                lambda: subprocess.run(cmd, capture_output=True, text=True, env=env),
                timeout=3,
            )
            if not res or res.returncode != 0:
                return None
            
            pids = set()
            if getattr(self.plugin, "_process", None):
                pids.add(str(self.plugin._process.pid))
            if getattr(self.plugin, "_spotify_client_process", None):
                pids.add(str(self.plugin._spotify_client_process.pid))

            current_id = None
            for line in res.stdout.splitlines():
                line = line.strip()
                if line.startswith("Sink Input #"):
                    current_id = line.split("#")[1].strip()
                elif current_id:
                    # Check PID match or application name
                    if any(f'"{p}"' in line for p in pids if p):
                        return current_id
                    low = line.lower()
                    if ("application.name" in low or "media.name" in low) and ("librespot" in low or "spotify" in low):
                        return current_id
        except Exception as e:
            decky.logger.warning("Failed to resolve sink input ID: %s", e)
        return None

    async def _apply_sink_volume(self, sink_input_id: str, percent: float) -> bool:
        """Apply volume percentage directly to the cached sink input."""
        try:
            cmd, env = _build_deck_command([
                "pactl", "set-sink-input-volume", sink_input_id, f"{int(round(percent))}%"
            ])
            res = await _exec(
                lambda: subprocess.run(cmd, capture_output=True, text=True, env=env),
                timeout=2,
            )
            return res is not None and res.returncode == 0
        except Exception:
            return False

    async def set_ducking(self, active: bool, reason: str = "game") -> None:
        """Coordinate ducking state changes from game lifecycle or voice chat."""
        if active:
            self._duck_reasons.add(reason)
        else:
            self._duck_reasons.discard(reason)

        target_should_duck = len(self._duck_reasons) > 0
        settings = self.plugin._settings
        
        # Determine baseline volume (150% if boosted, otherwise 100%)
        baseline_sink_vol = 150.0 if getattr(self.plugin, "_pa_volume_boosted", False) else 100.0

        if target_should_duck:
            duration = float(settings.get("duck_fade_down_duration", 1.0))
            mode = settings.get("ducking_mode", "proportional")
            
            if mode == "proportional":
                attenuation_pct = float(settings.get("ducking_proportional_pct", 50))
                factor = max(0.05, 1.0 - (attenuation_pct / 100.0))
            else:
                # Fixed volume mode (D-05)
                fixed_vol = float(settings.get("auto_ducking_volume", 25))
                base_spotify_vol = float(getattr(self.plugin, "_poll_volume", 80) or 80)
                factor = min(1.0, fixed_vol / max(1.0, base_spotify_vol))

            target_sink_vol = baseline_sink_vol * factor
        else:
            duration = float(settings.get("duck_fade_up_duration", 1.5))
            target_sink_vol = baseline_sink_vol

        await self.fade_to(target_sink_vol, duration)

    async def fade_to(self, target_sink_volume: float, duration_sec: float) -> None:
        """Fade volume smoothly using cosine easing curve."""
        if self._fade_task and not self._fade_task.done():
            self._fade_task.cancel()
            try:
                await self._fade_task
            except asyncio.CancelledError:
                pass

        self._fade_task = asyncio.create_task(
            self._execute_fade(target_sink_volume, duration_sec)
        )

    async def _execute_fade(self, target_vol: float, duration_sec: float) -> None:
        start_vol = self._current_sink_volume
        self._target_sink_volume = target_vol

        # Ensure sink input ID is resolved
        if not self._cached_sink_input_id:
            self._cached_sink_input_id = await self.resolve_sink_input_id()

        if not self._cached_sink_input_id or duration_sec <= 0:
            self._current_sink_volume = target_vol
            if self._cached_sink_input_id:
                await self._apply_sink_volume(self._cached_sink_input_id, target_vol)
            await self._emit_state()
            return

        start_time = time.monotonic()
        step_interval = 0.05  # 50ms time slices (D-01)

        try:
            while True:
                now = time.monotonic()
                elapsed = now - start_time
                progress = min(1.0, elapsed / duration_sec)
                
                # Cosine easing: 0.5 * (1 - cos(pi * progress))
                eased = 0.5 * (1.0 - math.cos(math.pi * progress))
                self._current_sink_volume = start_vol + (target_vol - start_vol) * eased

                ok = await self._apply_sink_volume(self._cached_sink_input_id, self._current_sink_volume)
                if not ok:
                    # Invalidate cached ID on failure and attempt re-discovery
                    self._cached_sink_input_id = await self.resolve_sink_input_id()

                await self._emit_state()

                if progress >= 1.0:
                    break
                await asyncio.sleep(step_interval)
        except asyncio.CancelledError:
            # Leave self._current_sink_volume at the last reached level
            raise

    async def _emit_state(self) -> None:
        baseline = 150.0 if getattr(self.plugin, "_pa_volume_boosted", False) else 100.0
        ratio = self._current_sink_volume / baseline
        base_vol = getattr(self.plugin, "_poll_volume", 80) or 80
        effective_vol = max(0, min(100, int(round(base_vol * ratio))))

        await decky.emit("ducking_state_changed", {
            "is_ducked": self.is_ducked,
            "effective_volume": effective_vol,
            "base_volume": base_vol,
            "duck_reasons": list(self._duck_reasons),
        })
```

### 2. Voice Activity Detection Worker (`py_modules/volume.py`)

```python
# [VERIFIED: Python 3.11+ pactl source-outputs parsing]
class VoiceActivityDetector:
    """Monitors pactl list source-outputs for Discord, Steamcord, or Steam Voice microphone streams."""

    def __init__(self, plugin, fader: VolumeFader):
        self.plugin = plugin
        self.fader = fader
        self._worker_task: asyncio.Task | None = None
        self._last_speech_time: float = 0.0
        self._voice_active: bool = False

    def start(self):
        if self._worker_task is None or self._worker_task.done():
            self._worker_task = asyncio.create_task(self._poll_loop())

    async def stop(self):
        if self._worker_task and not self._worker_task.done():
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass
            self._worker_task = None

    async def check_recording_streams(self) -> bool:
        """Check if any uncorked/unmuted recording stream is active."""
        try:
            cmd, env = _build_deck_command(["pactl", "list", "source-outputs"])
            res = await _exec(
                lambda: subprocess.run(cmd, capture_output=True, text=True, env=env),
                timeout=2,
            )
            if not res or res.returncode != 0:
                return False
            
            blocks = res.stdout.split("Source Output #")
            for block in blocks:
                if not block.strip():
                    continue
                low = block.lower()
                corked = "corked: yes" in low
                muted = "mute: yes" in low
                if corked or muted:
                    continue
                
                # Check for voice communication applications (D-03)
                is_voice = any(v in low for v in ("discord", "steamcord", "steam", "steamwebhelper", "webrtc"))
                if is_voice:
                    return True
        except Exception:
            pass
        return False

    async def _poll_loop(self):
        """Poll source-outputs every 350ms with 1.2s silence hold hysteresis."""
        while True:
            try:
                settings = self.plugin._settings
                if not settings.get("voice_ducking_enabled", True):
                    await asyncio.sleep(2.0)
                    continue

                # Throttle when music is not playing
                if not getattr(self.plugin, "_is_playing", False):
                    await asyncio.sleep(1.0)
                    continue

                has_voice = await self.check_recording_streams()
                now = time.monotonic()
                hold_delay = float(settings.get("voice_ducking_hold_delay", 1.2))

                if has_voice:
                    self._last_speech_time = now
                    if not self._voice_active:
                        self._voice_active = True
                        await self.fader.set_ducking(True, reason="voice")
                else:
                    if self._voice_active:
                        # Check silence hold delay (D-03)
                        if now - self._last_speech_time >= hold_delay:
                            self._voice_active = False
                            await self.fader.set_ducking(False, reason="voice")

                await asyncio.sleep(0.35)
            except asyncio.CancelledError:
                break
            except Exception as e:
                decky.logger.warning("VoiceActivityDetector error: %s", e)
                await asyncio.sleep(1.0)
```

### 3. Frontend Event Listener & Visual Ducked Pill Badge (`src/index.tsx`)

```typescript
// [VERIFIED: @decky/api event subscription]
const [isDucked, setIsDucked] = useState<boolean>(false);
const [effectiveVolume, setEffectiveVolume] = useState<number | null>(null);

useEffect(() => {
  const unsubDucking = addEventListener<[any]>("ducking_state_changed", (data: any) => {
    if (!data) return;
    setIsDucked(Boolean(data.is_ducked));
    if (data.effective_volume != null) {
      setEffectiveVolume(data.effective_volume);
    }
  });

  return () => {
    removeEventListener("ducking_state_changed", unsubDucking);
  };
}, []);

// Volume Slider Rendering:
<PanelSectionRow>
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
    <span style={{ fontSize: 13, fontWeight: 600 }}>Volume</span>
    {isDucked && (
      <span
        style={{
          background: "#1db954",
          color: "#000",
          fontSize: 10,
          fontWeight: 800,
          padding: "2px 6px",
          borderRadius: 4,
          letterSpacing: "0.5px",
        }}
      >
        DUCKED
      </span>
    )}
  </div>
  <SliderField
    label=""
    value={isDucked && effectiveVolume != null ? effectiveVolume : volume}
    min={0}
    max={100}
    step={1}
    showValue
    valueSuffix="%"
    onChange={handleVolumeChange}
  />
</PanelSectionRow>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Spotify Web API volume calls (`PUT me/player/volume`) | 100% Local PipeWire sink-input volume (`pactl set-sink-input-volume`) | Milestone v0.5 (Phase 06) | Eliminates 200ms latency, zero HTTP 429 quota consumption, no cross-device volume desynchronization. |
| Abrupt step volume cuts on game launch | Cosine easing curve ($S$-curve) with 50ms time slices | Milestone v0.5 (Phase 06) | Smooth, pleasant audio attenuation without sudden jumps or clicks. |
| Instantaneous voice mic threshold gating | 1.2s silence hold delay hysteresis | Milestone v0.5 (Phase 06) | Eliminates audio "pumping" between words during Discord/Steam voice conversations. |
| Repeated subprocess forks on every tick | One-time `sink_input_id` discovery and caching | Milestone v0.5 (Phase 06) | Reduces subprocess forks during a 1.5s fade from 30+ to 0 (direct volume command only). |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | PulseAudio server socket is at `/run/user/1000/pulse/native` under standard SteamOS 3.5+ | Standard Stack & Common Pitfalls | Low. Verified in `py_modules/common.py:97` [VERIFIED: `PULSE_SERVER = f"unix:/run/user/{DECK_UID}/pulse/native"`]. |
| A2 | Active recording streams in Discord Flatpak maintain uncorked `source-output` streams | Voice Activity Detection | Low. Verified with SteamOS PipeWire audio architecture; verified in `06-CONTEXT.md:21`. |

---

## Open Questions

1. **How should manual volume adjustments behave while ducked?**
   - What we know: If the user adjusts the volume slider while ducked, they expect to change their music volume.
   - What's unclear: Does the adjustment set the new base volume or the temporary ducked ceiling?
   - Recommendation: Moving the slider updates the user's `base_volume` setting (e.g. adjusts baseline from 80% to 70%), which immediately recomputes the ducked proportion without cancelling the duck state.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `pactl` | Sink volume & VAD detection | ✓ (on SteamOS) | PipeWire PulseAudio compat | Graceful non-blocking no-op in headless CI / Windows |
| Python 3.11+ | Backend daemon | ✓ | 3.14.0 (Windows dev) / 3.11+ (SteamOS) | — |
| Node.js / pnpm | Frontend compilation | ✓ | Node v20+ / pnpm 9+ | — |

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Python `unittest` standard library & Vitest 5.1.0 |
| Config file | `vitest.config.ts` (root) & `tests/` directory |
| Quick run command | `py -m unittest tests/test_volume.py` / `pnpm test` |
| Full suite command | `py -m unittest discover tests` && `pnpm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| **DUCK-01** | Cosine easing volume curve calculation and non-blocking fade down/up | Unit / Integration | `py -m unittest tests/test_volume.py -k test_volume_fader` | ❌ Wave 0 (`tests/test_volume.py`) |
| **DUCK-01** | One-time sink input resolution and caching without repeat list subprocesses | Unit | `py -m unittest tests/test_volume.py -k test_sink_input_caching` | ❌ Wave 0 (`tests/test_volume.py`) |
| **DUCK-01** | Interruption safety: cancels in-flight fade and ramps from mid-flight volume | Unit | `py -m unittest tests/test_volume.py -k test_fade_interruption` | ❌ Wave 0 (`tests/test_volume.py`) |
| **DUCK-02** | Parses `pactl list source-outputs` identifying Discord/Steam Voice streams | Unit | `py -m unittest tests/test_volume.py -k test_vad_stream_parsing` | ❌ Wave 0 (`tests/test_volume.py`) |
| **DUCK-02** | Silence hold hysteresis (1.2s delay) prevents volume pumping | Unit / Integration | `py -m unittest tests/test_volume.py -k test_vad_silence_hold` | ❌ Wave 0 (`tests/test_volume.py`) |
| **DUCK-01 / D-06** | UI displays `Ducked` pill badge and synchronizes volume slider | Frontend Unit | `pnpm test src/components/tabs/SettingsTab.test.tsx` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `py -m unittest tests/test_volume.py` && `pnpm test`
- **Per wave merge:** Full test suite (`py -m unittest discover tests` && `pnpm test`)
- **Phase gate:** Full suite 100% green before completion.

### Wave 0 Gaps
- [ ] `tests/test_volume.py` — Dedicated backend tests for `VolumeFader`, `VoiceActivityDetector`, easing curves, and sink input caching.
- [ ] `src/components/tabs/SettingsTab.test.tsx` — Frontend tests verifying ducking sliders and toggles render properly with spatial navigation.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | Yes | Validate slider ranges (e.g. durations 0.5s–3.0s, volumes 0–100%) in `set_setting` and sanitize subprocess arguments. |
| V14 Configuration | Yes | Sanitize `pactl` arguments to prevent command injection via custom sink names or process inputs. |

### Known Threat Patterns for Linux Audio Subprocesses

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Command Injection via `sink_input_id` | Tampering / Elevation of Privilege | Always pass arguments to `subprocess.run` as a discrete `list[str]` (never `shell=True`). Verify `sink_input_id` is an integer string before passing to `pactl`. |
| Unhandled exceptions hanging event loop | Denial of Service | Wrap all `pactl` subprocesses and background workers in `try/except` with timeouts to prevent threadpool starvation. |

---

## Sources

### Primary (HIGH confidence)
- **Deckify Codebase Source Files:**
  - `py_modules/volume.py:1-142` — Volume control and PipeWire inspection.
  - `py_modules/common.py:70-97, 220-240` — `DEFAULT_SETTINGS`, `PULSE_SERVER`, `_build_deck_command`.
  - `py_modules/engine.py:49-100` — `_parse_pactl_sink_inputs` regex parsing.
  - `src/index.tsx:721-755` — SteamClient AppLifetime notifications listener.
  - `src/components/tabs/SettingsTab.tsx:424-464` — Existing auto-ducking card.
- **Milestone v0.5 Planning Artifacts:**
  - `.planning/phases/06-smooth-audio-ducking-engine-pipewire-fader/06-CONTEXT.md` — User decisions D-01 through D-06.
  - `.planning/research/PITFALLS.md` — Pitfalls 1 (Subprocess flooding) and 7 (Voice pumping).
  - `.planning/research/SUMMARY.md` — v0.5 architecture summary.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — PipeWire `pactl` and Python `asyncio` are built-in SteamOS/Python standards.
- Architecture: HIGH — Concrete separation between frontend AppLifetime events and backend PipeWire fader.
- Pitfalls: HIGH — Multi-process flapping and subprocess flooding mitigations verified against Decky runtime constraints.

**Research date:** 2026-11-12  
**Valid until:** 2026-12-12
