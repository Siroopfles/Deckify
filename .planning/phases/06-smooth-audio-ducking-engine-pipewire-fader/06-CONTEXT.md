# Phase 6: Smooth Audio Ducking Engine & PipeWire Fader - Context

**Gathered:** 2026-11-12  
**Status:** Ready for planning  

<domain>
## Phase Boundary

Phase 6 implements a smooth, local PipeWire/PulseAudio sink-input volume fader in `py_modules/volume.py` and voice chat detection via `pactl list source-outputs`. It provides non-blocking, gradual volume fading when games launch, cutscenes start, or voice activity occurs, completely eliminating abrupt jumps and zeroing out Spotify Web API cloud requests.

</domain>

<decisions>
## Implementation Decisions

### Fading Curve & Timing
- **D-01 (Cosine Easing & Asyncio Task):** Volume transitions must use a smooth cosine/smoothstep easing curve executed asynchronously in a non-blocking `asyncio` task (`fade_volume`) in `py_modules/volume.py` with 50ms time slices. If a new fade event arrives while another is in flight, the previous fade task must be cleanly cancelled before starting the new curve. — **Reversibility:** reversible
- **D-02 (Default Durations & Full Settings Config):** Default fading durations are set to **1.0s fade-down** (fast attenuation when game audio or voice starts) and **1.5s fade-up** (gentle restoration when game stops or voice activity ceases). Both durations are exposed as interactive sliders (0.5s to 3.0s) in `SettingsTab.tsx`. — **Reversibility:** reversible

### Voice Chat & Microfoon Ducking
- **D-03 (Source-Output VAD & Silence Hold Hysteresis):** Active recording streams are detected locally via `pactl list source-outputs` (checking for active, non-corked client streams from Discord, Steamcord, or Steam Voice). Ducking defaults to attenuating music to **25%** volume with a **1.2-second silence hold delay** after speech ceases before initiating fade-up, preventing distracting "volume pumping" during natural conversation pauses. — **Reversibility:** reversible
- **D-04 (Configurable Voice Controls):** `SettingsTab.tsx` provides dedicated settings for Voice Chat Ducking: master toggle (enabled/disabled), duck target volume slider (10% to 50%), and silence hold delay slider (0.5s to 3.0s). — **Reversibility:** reversible

### Ducking Volume Berekening
- **D-05 (Proportional / Relative Attenuation Default):** By default, ducking calculates the target level proportionally based on the current listening volume (e.g., reduces current volume by 50% rather than jumping to a hardcoded 30%), preventing music from becoming *louder* if the user is already listening at a low volume. A toggle in `SettingsTab.tsx` allows power users to switch between proportional (%) and fixed absolute volume. — **Reversibility:** reversible

### Volume Control Boundary & UI Feedback
- **D-06 (100% Local PipeWire Sink-Input Volume & Visual UI Feedback):** Ducking operates strictly on the local PipeWire sink-input (`pactl set-sink-input-volume <id>`), keeping the Spotify Web API cloud volume untouched (0 API calls, 0ms latency, zero cross-device desync). In the frontend, the volume slider smoothly animates along with the local fade to reflect the audible output AND displays an elevated `Ducked` pill badge beside the volume percentage so the user immediately knows attenuation is active. — **Reversibility:** reversible

### the agent's Discretion
- Selection of easing formula (`0.5 * (1 - math.cos(math.pi * progress))`) for smooth audio acceleration/deceleration.
- Local caching of `sink_input_id` during a fade to eliminate redundant `pactl list sink-inputs` subprocess forks.
- Error handling fallback: if `pactl` is temporarily unavailable or running headless in non-PipeWire test environments, fail gracefully without throwing RPC exceptions.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing:**

### Volume & Audio Engine
- `py_modules/volume.py` — Existing PulseAudio/PipeWire sink-input inspection and volume control functions (`set_pa_volume_percent`, `boost_pa_volume`, `configure_pipewire_clock`).
- `py_modules/engine.py` — `_parse_pactl_sink_inputs`, `_get_pactl_sinks`, and audio output sink switching logic.
- `py_modules/common.py` — `DEFAULT_SETTINGS` dictionary, `PULSE_SERVER` environment configuration, and `_build_deck_command`.

### Frontend Game Integration & UI
- `src/index.tsx` — Existing `SteamClient.Apps.RegisterForAppLifetimeNotifications` hook (lines 720–755) and volume slider rendering in `Content`.
- `src/components/tabs/SettingsTab.tsx` — Volume and audio settings cards where new sliders and toggles will be mounted.
- `src/types.ts` — `EngineSettings` interface definitions for ducking configurations.

### Research & Architecture
- `.planning/research/SUMMARY.md` — Synthesized findings for Milestone v0.5.
- `.planning/research/PITFALLS.md` — Pitfalls #1 (PipeWire subprocess fork-bomb prevention) and #2 (Hysteresis timing).

</canonical_refs>

<specifics>
## Specific Ideas & Details

- **Sink-Input Caching:** Query `sink-inputs` once at fade start; do not execute `pactl list sink-inputs` on every 50ms tick of a 1.5s fade (which would spawn 30 subprocesses).
- **Hysteresis Poller:** A lightweight polling worker in Python (checking `source-outputs` every 300–400ms when voice ducking is enabled) with an atomic timestamp tracker `last_speech_time`.

</specifics>

<deferred>
## Deferred Ideas

- In-Game cutscene audio-peak detection (analyzing game sink audio output volume to auto-pause music during dialogue) — Deferred to backlog (Pillar 1 in `IDEAS.md`).
- Parametric 10-band DSP PipeWire biquad equalizer filter chain — Deferred to future milestone.

</deferred>
