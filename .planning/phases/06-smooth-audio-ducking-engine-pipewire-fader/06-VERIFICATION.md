---
phase: 06-smooth-audio-ducking-engine-pipewire-fader
verified: 2026-11-15T20:34:30Z
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
covered_digest: "v4:sha256:a8c15ebdee80b401ea2baefd1cd66e354fdec2728872d9a575ad153e8c4f97b0"
behavior_unverified: 0
overrides_applied: 0
---

# Phase 06: Smooth Audio Ducking Engine & PipeWire Fader Verification Report

**Phase Goal:** Provide smooth, non-blocking volume transitions during game launches and active voice chat without audible pops or Spotify API rate-limit penalties.  
**Verified:** 2026-11-15T20:34:30Z  
**Status:** passed  
**Re-verification:** Yes — refreshed against current codebase after subsequent phase edits  

## User Flow Coverage (MVP Mode)

**User Story:** As a Steam Deck gamer listening to Spotify in the background, I want to experience smooth volume fading when games launch or when voice chat is active and smooth restoration when games exit or speech pauses, so that I never experience jarring volume jumps or voice chat interference without impacting Spotify API rate limits.

| Step | User Action | Expected System Behavior | Codebase Evidence | Status |
|:-----|:------------|:-------------------------|:------------------|:-------|
| 1 | Launch game while Spotify plays in background | Music volume smoothly attenuates down over 1.0s cosine curve via local PipeWire sink input; zero Web API calls | `py_modules/volume.py:152-155`, `py_modules/volume.py:255-287`, `tests/test_volume.py` (50 tests passing) | ✓ VERIFIED |
| 2 | Check QAM mini-player during gameplay | Volume slider displays elevated `#1db954` green "DUCKED" pill badge and animates with effective volume level | `src/index.tsx:778-803`, `tests/test_e2e_requirements.py` (`-k duck` 8 tests passing) | ✓ VERIFIED |
| 3 | Close game or trigger rapid restart | Mid-flight fade cancellation smoothly ramps without volume popping or clicking; 3.0s launcher exit debounce prevents flapping | `py_modules/volume.py:289-300`, `src/index.tsx:1148-1157`, `tests/test_volume.py` | ✓ VERIFIED |
| 4 | Speak in active Discord or Steam Voice call | `VoiceActivityDetector` detects active uncorked microphone stream and ducks music playback | `py_modules/volume.py:387-414`, `tests/test_volume.py` | ✓ VERIFIED |
| 5 | Natural conversational pause during speech | 1.2s silence hold delay prevents volume pumping between words or speech pauses | `py_modules/volume.py:432-446`, `tests/test_volume.py` | ✓ VERIFIED |
| 6 | Exit game or finish voice call | Volume smoothly ramps back to pre-ducked baseline over 1.5s cosine curve | `py_modules/volume.py:283-287`, `tests/test_volume.py` | ✓ VERIFIED |
| 7 | Adjust ducking settings in SettingsTab | Interactive mode pills (proportional vs fixed) and sliders (fade down: 0.5–3.0s, fade up: 0.5–3.0s, hold delay: 0.5–3.0s) immediately update with spatial controller navigation | `src/components/tabs/SettingsTab.tsx:451-599`, `src/components/tabs/SettingsTab.test.tsx` (12 tests passing) | ✓ VERIFIED |
| 8 | Pause music during background gameplay | Voice activity detector throttles polling loop to 1.0s, clearing ducking to conserve APU battery and CPU cycles | `py_modules/volume.py:425-430`, `tests/test_volume.py` | ✓ VERIFIED |

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|:------:|----------|
| 1 | Music playback smoothly attenuates down over a gradual 1.0–1.5s cosine curve when game audio starts or games launch, eliminating abrupt volume drops (DUCK-01, D-01, roadmap SC 1). | ✓ VERIFIED | `py_modules/volume.py:152-155` implements exact S-curve `cosine_ease(progress)`. `VolumeFader._execute_fade` (`py_modules/volume.py:302-344`) applies 50ms time slices. Verified by `tests/test_volume.py` (50/50 passing). |
| 2 | Music playback gently restores to the pre-ducked volume level over 1.0–1.5s when games close or voice activity ceases (DUCK-01, roadmap SC 2). | ✓ VERIFIED | `VolumeFader.set_ducking(False)` (`py_modules/volume.py:283-287`) restores to baseline sink volume (100% or 150%) using `duck_fade_up_duration` (default 1.5s). Verified in `tests/test_volume.py` and `tests/test_e2e_requirements.py -k duck`. |
| 3 | Active voice chat streams (Discord, Steamcord, Steam Voice) detected via `pactl list source-outputs` automatically trigger ducking with 1.2–1.5s silence hold hysteresis to eliminate volume pumping (DUCK-02, D-03, roadmap SC 3). | ✓ VERIFIED | `VoiceActivityDetector.check_recording_streams` (`py_modules/volume.py:387-414`) inspects `pactl list source-outputs` filtering out `corked: yes` and `mute: yes`. Hysteresis logic in `_poll_step` (`py_modules/volume.py:432-446`) tracks `_last_speech_time` and releases ducking only after `voice_ducking_hold_delay` (default 1.2s). Verified in `tests/test_volume.py`. |
| 4 | Volume adjustments are applied purely locally to the `librespot`/`spotifyd` audio sink via PipeWire `pactl set-sink-input-volume` with zero Spotify Web API calls and 0ms network latency (DUCK-01, D-06, roadmap SC 4). | ✓ VERIFIED | `VolumeFader._apply_sink_volume` (`py_modules/volume.py:237-253`) executes `pactl set-sink-input-volume <id> <vol>%` directly via `_build_deck_command`. Zero calls to `set_volume` or Spotify Web API `me/player/volume` in ducking path. Verified in `tests/test_volume.py` and `tests/test_e2e_requirements.py -k duck`. |
| 5 | PipeWire sink_input_id is resolved and cached once at fade start, preventing subprocess storms during 50ms time slices (DUCK-01, D-01, T-06-01). | ✓ VERIFIED | `VolumeFader._execute_fade` (`py_modules/volume.py:306-307`) sets `self._cached_sink_input_id` once at fade start and reuses it across 50ms ticks without querying `pactl list sink-inputs`. Invalidated on completion or error (`py_modules/volume.py:331-341`). Verified in `tests/test_volume.py`. |
| 6 | Interrupting a fade-down by closing a game ramps smoothly from the current mid-flight volume without jumping (DUCK-01, D-01). | ✓ VERIFIED | `VolumeFader.fade_to` (`py_modules/volume.py:289-300`) cancels and awaits active `_fade_task`. In `_execute_fade` (`py_modules/volume.py:303`), `start_vol = self._current_sink_volume`, ensuring mid-flight cancellation ramps seamlessly. Verified in `tests/test_volume.py`. |
| 7 | Steam GamepadUI QAM volume slider displays elevated 'Ducked' badge and animates with effective volume during ducking (DUCK-01, D-06). | ✓ VERIFIED | `src/index.tsx:778-803` renders `#1db954` green `DUCKED` badge and dynamically sets `SliderField value={isDucked && effectiveVolume != null ? effectiveVolume : volume}` from `ducking_state_changed` event (`src/index.tsx:281-285`). Verified in `tests/test_e2e_requirements.py -k duck`. |
| 8 | Proton and game child launchers with rapid process start/stop events do not flap ducking due to 3.0s exit debounce (DUCK-01). | ✓ VERIFIED | `src/index.tsx:1148-1157` sets 3000ms `gameExitDebounceTimer` on `!running`. If child processes trigger `running: true` within 3s (`src/index.tsx:1141-1144`), timer is cleared and ducked state is maintained. Verified in `tests/test_e2e_requirements.py -k duck`. |
| 9 | Voice polling loop idles and throttles when music playback is paused to preserve APU battery and CPU cycles (DUCK-02). | ✓ VERIFIED | `VoiceActivityDetector._poll_step` (`py_modules/volume.py:416-430`) returns 1.0s delay when `!is_playing` and 2.0s delay when `!voice_ducking_enabled`, clearing ducking if active. Verified in `tests/test_volume.py`. |
| 10 | SettingsTab provides interactive sliders/pills for fade down duration, fade up duration, ducking mode, and voice silence hold delay (D-02, D-04, D-05). | ✓ VERIFIED | `src/components/tabs/SettingsTab.tsx:451-599` implements "Smooth Audio Ducking Engine" card with `Focusable flow-children="horizontal"` mode pills ("proportional" vs "fixed"), sliders for attenuation/target volume, fade down (0.5–3.0s), fade up (0.5–3.0s), voice toggle, and silence hold delay (0.5–3.0s). Verified in `src/components/tabs/SettingsTab.test.tsx` (12/12 passing). |
| 11 | Voice ducking settings and master toggle persist across plugin reloads and honor user preferences (D-02, D-04). | ✓ VERIFIED | `py_modules/common.py:91-97` registers schema defaults in `DEFAULT_SETTINGS` and lines 242-267 sanitize bounds in `_load_settings`. `main.py:581-616` enforces validation in `set_setting`. Verified in `tests/test_e2e_requirements.py -k duck`. |

**Score:** 11/11 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|:---------|:---------|:------:|:--------|
| `py_modules/volume.py` | VolumeFader class with cosine easing, sink input caching, and VoiceActivityDetector | ✓ VERIFIED | 461 lines; implements `cosine_ease`, `VolumeFader`, and `VoiceActivityDetector` with 50ms slices, 1.2s silence hold, and T-06-02 argument sanitization. |
| `py_modules/common.py` | Ducking settings keys in DEFAULT_SETTINGS and validation bounds in _load_settings | ✓ VERIFIED | 346 lines; registers ducking settings keys with boundary clamping (durations 0.5–3.0s, hold delay 0.5–3.0s, proportional pct 10–90%, voice volume 10–50%). |
| `main.py` | trigger_ducking and get_ducking_state RPC endpoints, lifecycle supervision, and set_setting validation | ✓ VERIFIED | 1,605 lines; instantiates, starts, and stops `VolumeFader` and `VoiceActivityDetector`; validates settings; exposes `trigger_ducking` and `get_ducking_state` RPC endpoints and calls `trigger_ducking` from `handle_app_lifetime_event`. |
| `src/types.ts` | DuckingState, DuckingMode, and ducking properties on EngineSettings | ✓ VERIFIED | 316 lines; exports `DuckingMode`, `DuckingState`, and declares ducking fields on `EngineSettings`. |
| `src/index.tsx` | 3-second debounced AppLifetime listener, backendTriggerDucking RPC, and QAM Ducked pill badge | ✓ VERIFIED | 1,192 lines; debounces exit by 3000ms; subscribes to `ducking_state_changed`; renders green `DUCKED` badge in QAM volume section. |
| `src/components/tabs/SettingsTab.tsx` | Smooth Audio Ducking Engine card with mode selector and sliders | ✓ VERIFIED | 889 lines; renders ducking controls with `Focusable flow-children="horizontal"` mode pills, `SliderField` controls, and backend RPC persistence. |
| `tests/test_volume.py` | Unit tests covering VolumeFader, sink input caching, interruption, and VAD | ✓ VERIFIED | 407 lines; 50 tests passing cleanly. |
| `tests/test_e2e_requirements.py` | E2E requirements tests for ducking schema, RPC endpoints, and setting validation | ✓ VERIFIED | 1,885 lines; 8 ducking-specific tests (`-k duck`) passing cleanly. |
| `src/components/tabs/SettingsTab.test.tsx` | Vitest tests verifying settings card rendering, active pill state, and click handlers | ✓ VERIFIED | 428 lines; 12 tests passing under Vitest. |

### Key Link Verification

| From | To | Via | Status | Details |
|:-----|:---|:----|:------:|:--------|
| `src/index.tsx:RegisterForAppLifetimeNotifications` | `main.py:trigger_ducking` | `backendHandleAppLifetimeEvent` / `backendTriggerDucking` RPC | ✓ WIRED | Game start routes through `handle_app_lifetime_event` -> `trigger_ducking(True, "game", valid_id)`; exit routes through 3.0s debounce -> `backendTriggerDucking(false, "game")`. |
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
| VolumeFader & VoiceActivityDetector Python unit suite | `py -m unittest tests/test_volume.py` | 50 tests passed in 5.275s | ✓ PASS |
| Ducking E2E requirements suite | `py -m unittest tests/test_e2e_requirements.py -k duck` | 8 tests passed in 0.590s | ✓ PASS |
| SettingsTab ducking card Vitest suite | `pnpm test src/components/tabs/SettingsTab.test.tsx` | 12 tests passed in 79ms | ✓ PASS |
| TypeScript type checking | `pnpm run typecheck` | 0 errors | ✓ PASS |

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
| None | - | None | - | Clean codebase; zero debt markers (`TBD`/`FIXME`/`XXX`) or empty stub returns in Phase 06 scope. |

### Human Verification Required

None blocking. All 11 must-have truths and requirements (`DUCK-01`, `DUCK-02`) are verified and covered by automated Python unit tests, Vitest tests, TypeScript compilation, and end-to-end requirement suites.

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

No gaps identified. All 11 observable truths are verified in the current codebase and tests. Phase 06 goal is achieved.

---

_Verified: 2026-11-15T20:34:30Z_  
_Verifier: the agent (gsd-verifier)_
