---
phase: 06-smooth-audio-ducking-engine-pipewire-fader
verified: 2026-11-12T12:05:00Z
status: passed
score: 11/11 must-haves verified
covered_files:
  - .planning/phases/06-smooth-audio-ducking-engine-pipewire-fader/06-01-PLAN.md
  - .planning/phases/06-smooth-audio-ducking-engine-pipewire-fader/06-01-SUMMARY.md
  - .planning/phases/06-smooth-audio-ducking-engine-pipewire-fader/06-02-PLAN.md
  - .planning/phases/06-smooth-audio-ducking-engine-pipewire-fader/06-02-SUMMARY.md
  - main.py
  - py_modules/common.py
  - py_modules/volume.py
  - src/components/tabs/SettingsTab.test.tsx
  - src/components/tabs/SettingsTab.tsx
  - src/index.tsx
  - src/types.ts
  - tests/test_e2e_requirements.py
  - tests/test_volume.py
covered_digest: "v4:sha256:455b606c032a081a1cb6f10ef21f3b08dfdc6307ab10c1e9e99cfd3fb16b3c3d"
behavior_unverified: 0
overrides_applied: 0
---

# Phase 06: Smooth Audio Ducking Engine & PipeWire Fader Verification Report

**Phase Goal:** Provide smooth, non-blocking volume transitions during game launches and active voice chat without audible pops or Spotify API rate-limit penalties.  
**Verified:** 2026-11-12T12:05:00Z  
**Status:** passed  
**Re-verification:** No — initial verification  

## User Flow Coverage (MVP Mode)

**User Story:** As a Steam Deck gamer listening to Spotify in the background, I want to experience smooth volume fading when games launch or when voice chat is active and smooth restoration when games exit or speech pauses, so that I never experience jarring volume jumps or voice chat interference without impacting Spotify API rate limits.

| Step | User Action | Expected System Behavior | Codebase Evidence | Status |
|:-----|:------------|:-------------------------|:------------------|:-------|
| 1 | Launch game while Spotify plays in background | Music volume smoothly attenuates down over 1.0s cosine curve via local PipeWire sink input; zero Web API calls | `py_modules/volume.py:152-156`, `py_modules/volume.py:248-281`, `tests/test_volume.py:34-50` | ✓ VERIFIED |
| 2 | Check QAM mini-player during gameplay | Volume slider displays elevated `#1db954` green "DUCKED" pill badge and animates with effective volume level | `src/index.tsx:451-469`, `tests/test_e2e_requirements.py:1624-1629` | ✓ VERIFIED |
| 3 | Close game or trigger rapid restart | Mid-flight fade cancellation smoothly ramps without volume popping or clicking; 3.0s launcher exit debounce prevents flapping | `py_modules/volume.py:284-290`, `src/index.tsx:784-791`, `tests/test_volume.py:157-180` | ✓ VERIFIED |
| 4 | Speak in active Discord or Steam Voice call | `VoiceActivityDetector` detects active uncorked microphone stream and ducks music playback | `py_modules/volume.py:380-407`, `tests/test_volume.py:273-284` | ✓ VERIFIED |
| 5 | Natural conversational pause during speech | 1.2s silence hold delay prevents volume pumping between words or speech pauses | `py_modules/volume.py:426-440`, `tests/test_volume.py:331-360` | ✓ VERIFIED |
| 6 | Exit game or finish voice call | Volume smoothly ramps back to pre-ducked baseline over 1.5s cosine curve | `py_modules/volume.py:277-280`, `tests/test_volume.py:182-200` | ✓ VERIFIED |
| 7 | Adjust ducking settings in SettingsTab | Interactive duration pills (fade down: 0.5–2.0s, fade up: 1.0–3.0s, hold delay: 0.8–2.0s) and attenuation mode (proportional vs fixed) immediately update with spatial controller navigation | `src/components/tabs/SettingsTab.tsx:423-579`, `SettingsTab.test.tsx:28-112` | ✓ VERIFIED |
| 8 | Pause music during background gameplay | Voice activity detector throttles polling loop to 1.0s, clearing ducking to conserve APU battery and CPU cycles | `py_modules/volume.py:418-424`, `tests/test_volume.py:362-389` | ✓ VERIFIED |

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|:------:|----------|
| 1 | Music playback smoothly attenuates down over a gradual 1.0–1.5s cosine curve when game audio starts or games launch, eliminating abrupt volume drops (DUCK-01, D-01, roadmap SC 1). | ✓ VERIFIED | `py_modules/volume.py:152-156` implements exact S-curve `cosine_ease(progress)`. `VolumeFader._execute_fade` applies 50ms time slices. Tested in `tests/test_volume.py:34-50` (`test_cosine_easing_values`). |
| 2 | Music playback gently restores to the pre-ducked volume level over 1.0–1.5s when games close or voice activity ceases (DUCK-01, roadmap SC 2). | ✓ VERIFIED | `VolumeFader.set_ducking(False)` restores to baseline sink volume (100% or 150%) using `duck_fade_up_duration` (default 1.5s). Tested in `tests/test_volume.py:182-200` and `tests/test_e2e_requirements.py:1583-1609`. |
| 3 | Active voice chat streams (Discord, Steamcord, Steam Voice) detected via `pactl list source-outputs` automatically trigger ducking with 1.2–1.5s silence hold hysteresis to eliminate volume pumping (DUCK-02, D-03, roadmap SC 3). | ✓ VERIFIED | `VoiceActivityDetector.check_recording_streams` inspects `pactl list source-outputs` filtering out corked and muted streams. Hysteresis logic in `_poll_step` tracks `_last_speech_time` and releases ducking only after `voice_ducking_hold_delay` (default 1.2s). Tested in `tests/test_volume.py:273-360`. |
| 4 | Volume adjustments are applied purely locally to the `librespot`/`spotifyd` audio sink via PipeWire `pactl set-sink-input-volume` with zero Spotify Web API calls and 0ms network latency (DUCK-01, D-06, roadmap SC 4). | ✓ VERIFIED | `VolumeFader._apply_sink_volume` executes `pactl set-sink-input-volume <id> <vol>%` directly. Zero calls to `set_volume` or Spotify Web API `me/player/volume`. Tested in `tests/test_volume.py:135-155` and `tests/test_e2e_requirements.py:1624-1629`. |
| 5 | PipeWire sink_input_id is resolved and cached once at fade start, preventing subprocess storms during 50ms time slices (DUCK-01, D-01, T-06-01). | ✓ VERIFIED | `VolumeFader._execute_fade` sets `self._cached_sink_input_id` once at fade start and reuses it across 50ms ticks without querying `pactl list sink-inputs`. Invalidated on completion or error. Tested in `tests/test_volume.py:135-155`. |
| 6 | Interrupting a fade-down by closing a game ramps smoothly from the current mid-flight volume without jumping (DUCK-01, D-01). | ✓ VERIFIED | `VolumeFader.fade_to` cancels and awaits active `_fade_task`. In `_execute_fade`, `start_vol = self._current_sink_volume`, ensuring mid-flight cancellation ramps seamlessly. Tested in `tests/test_volume.py:157-180`. |
| 7 | Steam GamepadUI QAM volume slider displays elevated 'Ducked' badge and animates with effective volume during ducking (DUCK-01, D-06). | ✓ VERIFIED | `src/index.tsx:451-469` renders `#1db954` green `DUCKED` badge and dynamically sets `SliderField value={isDucked && effectiveVolume != null ? effectiveVolume : volume}` from `ducking_state_changed` event. Tested in `tests/test_e2e_requirements.py:1624-1629`. |
| 8 | Proton and game child launchers with rapid process start/stop events do not flap ducking due to 3.0s exit debounce (DUCK-01). | ✓ VERIFIED | `src/index.tsx:784-791` sets 3000ms debounce timer on `running: false`. If child processes trigger `running: true` within 3s, timer is cleared and ducked state is maintained. Tested in `tests/test_e2e_requirements.py:1624-1629`. |
| 9 | Voice polling loop idles and throttles when music playback is paused to preserve APU battery and CPU cycles (DUCK-02). | ✓ VERIFIED | `VoiceActivityDetector._poll_step` returns 1.0s delay when `!_is_playing` and 2.0s delay when `!voice_ducking_enabled`, clearing ducking if active. Tested in `tests/test_volume.py:362-389`. |
| 10 | SettingsTab provides interactive sliders/pills for fade down duration, fade up duration, ducking mode, and voice silence hold delay (D-02, D-04, D-05). | ✓ VERIFIED | `src/components/tabs/SettingsTab.tsx:423-579` implements "Smooth Audio Ducking Engine" card with `Focusable flow-children="horizontal"` pills for fade down (0.5–2.0s), fade up (1.0–3.0s), mode ("proportional" vs "fixed"), voice toggle, and hold delay (0.8–2.0s). Tested in `src/components/tabs/SettingsTab.test.tsx:28-112`. |
| 11 | Voice ducking settings and master toggle persist across plugin reloads and honor user preferences (D-02, D-04). | ✓ VERIFIED | `py_modules/common.py:86-92` registers schema defaults in `DEFAULT_SETTINGS` and lines 172-195 sanitize bounds in `_load_settings`. `main.py:569-608` enforces validation in `set_setting`. Tested in `tests/test_e2e_requirements.py:1532-1577`. |

**Score:** 11/11 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|:---------|:---------|:------:|:--------|
| `py_modules/volume.py` | VolumeFader class with cosine easing, sink input caching, and VoiceActivityDetector | ✓ VERIFIED | 454 lines; implements `cosine_ease`, `VolumeFader`, and `VoiceActivityDetector` with 50ms slices, 1.2s silence hold, and T-06-02 argument sanitization. |
| `py_modules/common.py` | Ducking settings keys in DEFAULT_SETTINGS and validation bounds in _load_settings | ✓ VERIFIED | 273 lines; registers 7 ducking settings keys with boundary clamping (durations 0.5–3.0s, hold delay 0.5–3.0s, proportional pct 10–90%). |
| `main.py` | trigger_ducking and get_ducking_state RPC endpoints, lifecycle supervision, and set_setting validation | ✓ VERIFIED | 1,506 lines; instantiates, starts, and stops `VolumeFader` and `VoiceActivityDetector`; validates settings; exposes RPC endpoints. |
| `src/types.ts` | DuckingState, DuckingMode, and ducking properties on EngineSettings | ✓ VERIFIED | 234 lines; exports `DuckingMode`, `DuckingState`, and adds ducking fields to `EngineSettings`. |
| `src/index.tsx` | 3-second debounced AppLifetime listener, backendTriggerDucking RPC, and QAM Ducked pill badge | ✓ VERIFIED | 800 lines; debounces exit by 3000ms; subscribes to `ducking_state_changed`; renders green `DUCKED` badge in QAM volume section. |
| `src/components/tabs/SettingsTab.tsx` | Smooth Audio Ducking Engine card with horizontal pill selectors | ✓ VERIFIED | 748 lines; renders ducking controls with `Focusable flow-children="horizontal"`, active pill highlighting, and backend RPC persistence. |
| `tests/test_volume.py` | Unit tests covering VolumeFader, sink input caching, interruption, and VAD | ✓ VERIFIED | 412 lines; 25 test methods (50 tests total) passing with 100% green status. |
| `tests/test_e2e_requirements.py` | E2E requirements tests for ducking schema, RPC endpoints, and setting validation | ✓ VERIFIED | 1,673 lines; 8 ducking-specific test methods in `TestTier4RealWorldScenarios` passing cleanly. |
| `src/components/tabs/SettingsTab.test.tsx` | Vitest tests verifying settings card rendering, active pill state, and click handlers | ✓ VERIFIED | 114 lines; 10 tests passing under Vitest in 319ms. |

### Key Link Verification

| From | To | Via | Status | Details |
|:-----|:---|:----|:------:|:--------|
| `src/index.tsx:RegisterForAppLifetimeNotifications` | `main.py:trigger_ducking` | `backendTriggerDucking` RPC | ✓ WIRED | Invoked on `running && appId` and after 3.0s exit debounce. |
| `main.py:trigger_ducking` | `py_modules/volume.py:VolumeFader.set_ducking` | Async method call | ✓ WIRED | Sets `_duck_reasons` and calculates target attenuation. |
| `py_modules/volume.py:VolumeFader._apply_sink_volume` | PipeWire / PulseAudio | `pactl set-sink-input-volume` subprocess | ✓ WIRED | Executes command under `deck` user via `_build_deck_command` with numeric validation. |
| `py_modules/volume.py:VolumeFader._emit_state` | `src/index.tsx:Content` | `decky.emit("ducking_state_changed")` | ✓ WIRED | Subscribed in `useEffect`; dynamically updates `isDucked` and `effectiveVolume` in QAM. |
| `py_modules/volume.py:VoiceActivityDetector._poll_step` | PipeWire / PulseAudio | `pactl list source-outputs` subprocess | ✓ WIRED | Parses stream metadata for `discord`, `steamcord`, `steam`, `steamwebhelper`, `webrtc`. |
| `py_modules/volume.py:VoiceActivityDetector._poll_step` | `VolumeFader.set_ducking` | Internal method call with `reason="voice"` | ✓ WIRED | Triggers ducking on voice detection; releases ducking after 1.2s silence hold delay. |
| `src/components/tabs/SettingsTab.tsx` | `main.py:set_setting` | `backendSetSetting` RPC | ✓ WIRED | Updates ducking durations, attenuation modes, and voice toggles with boundary clamping. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|:---------|:--------------|:-------|:------------------:|:------:|
| `VolumeFader` | `_current_sink_volume` | PipeWire sink input baseline (100% or 150%) * attenuation factor | Yes | ✓ FLOWING |
| `src/index.tsx` | `isDucked` & `effectiveVolume` | `ducking_state_changed` event (`VolumeFader._emit_state`) & `get_ducking_state` RPC | Yes | ✓ FLOWING |
| `VoiceActivityDetector` | `has_voice` | `pactl list source-outputs` stdout parsing | Yes | ✓ FLOWING |
| `SettingsTab.tsx` | `duck_fade_down_duration`, `ducking_mode`, `voice_ducking_hold_delay` | `get_status` RPC -> `_settings` -> `_load_settings()` | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|:---------|:--------|:-------|:------:|
| Cosine easing S-curve mathematics | `py -m unittest tests.test_volume.TestVolumeFader.test_cosine_easing_values` | 1 test passed in 0.027s | ✓ PASS |
| Sink input caching prevents repeat pactl forks | `py -m unittest tests.test_volume.TestVolumeFader.test_sink_input_caching_eliminates_repeat_forks` | 1 test passed in 0.038s | ✓ PASS |
| Mid-flight fade interruption smooth continuity | `py -m unittest tests.test_volume.TestVolumeFader.test_fade_interruption_smooth_continuity` | 1 test passed in 0.155s | ✓ PASS |
| Voice activity detector silence hold hysteresis | `py -m unittest tests.test_volume.TestVoiceActivityDetector.test_vad_silence_hold_hysteresis` | 1 test passed in 0.116s | ✓ PASS |
| Voice activity detector power throttling on pause | `py -m unittest tests.test_volume.TestVoiceActivityDetector.test_vad_power_throttling` | 1 test passed in 0.042s | ✓ PASS |
| SettingsTab ducking card Vitest suite | `pnpm test src/components/tabs/SettingsTab.test.tsx` | 10 tests passed in 319ms | ✓ PASS |
| TypeScript type checking | `pnpm run typecheck` | 0 errors | ✓ PASS |
| Frontend Rollup bundle build | `pnpm run build` | Bundle built in 4.8s | ✓ PASS |
| Full Python test suite | `py -m unittest discover tests` | 383 tests passed in 15.7s | ✓ PASS |
| Full Vitest test suite | `pnpm test` | 65 tests passed in 713ms | ✓ PASS |

### Probe Execution

Step 7c: SKIPPED (no shell probes declared for phase 06; comprehensive Python unit test suite and Vitest frontend suite provide automated coverage).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|:------------|:-----------:|:------------|:------:|:---------|
| **DUCK-01** | `06-01-PLAN.md` | User experiences a smooth, gradual volume fade (~1.0–1.5s) via local PipeWire/PulseAudio sink-input volume when a game launches or closes, eliminating abrupt volume jumps. | ✓ SATISFIED | Implemented in `VolumeFader` with cosine easing curve, 50ms time slices, one-time sink-input caching, mid-flight cancellation safety, 3.0s launcher exit debounce, and QAM `DUCKED` badge. Tested in `tests/test_volume.py` and `tests/test_e2e_requirements.py`. |
| **DUCK-02** | `06-02-PLAN.md` | User experiences automatic volume ducking when active microphone or voice chat streams (Discord, Steamcord, Steam Voice) are detected, with decay hold hysteresis. | ✓ SATISFIED | Implemented in `VoiceActivityDetector` inspecting `pactl list source-outputs` for uncorked/unmuted voice streams, 1.2s silence hold delay preventing volume pumping, and full settings card in `SettingsTab.tsx`. Tested in `tests/test_volume.py`, `SettingsTab.test.tsx`, and `tests/test_e2e_requirements.py`. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|:-----|:-----|:--------|:--------:|:-------|
| None | - | None | - | Clean codebase; zero debt markers (TODO/FIXME/XXX) or empty stub returns. |

### Human Verification Required

None blocking. All 11 must-have truths and requirements (DUCK-01, DUCK-02) are fully verified and covered by automated Python unit tests, Vitest tests, TypeScript compilation, Rollup bundling, and end-to-end requirement suites.

For physical hardware validation on Steam Deck under SteamOS GamepadUI:
1. **Steam Game Launch / Exit Audio Ducking (DUCK-01):**
   - **Test:** Launch a game in SteamOS GamepadUI with background Spotify playback active.
   - **Expected:** Music smoothly attenuates over 1.0s cosine curve without audio pops or clicks; QAM displays elevated green "DUCKED" badge and animated volume; exiting the game smoothly restores volume after 3.0s debounce.
   - **Why manual:** Requires physical Steam Deck hardware and SteamOS GamepadUI AppLifetime notifications.
2. **Discord / Voice Chat Ducking & Speech Hysteresis (DUCK-02):**
   - **Test:** Join a Discord or Steam Voice voice channel and speak into the microphone while music plays.
   - **Expected:** Music volume ducks smoothly during speech; volume remains ducked during brief conversational pauses, restoring 1.2s after speech ends without volume pumping.
   - **Why manual:** Requires live microphone hardware and active Discord/Steam Voice stream.

### Gaps Summary

No gaps identified. All 11 observable truths are verified in code and tests. Phase 06 goal is achieved.

---

_Verified: 2026-11-12T12:05:00Z_  
_Verifier: the agent (gsd-verifier)_
