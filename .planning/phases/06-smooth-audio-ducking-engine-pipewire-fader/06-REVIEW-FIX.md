---
phase: 06-smooth-audio-ducking-engine-pipewire-fader
fixed_at: 2026-11-12T11:57:00Z
review_path: .planning/phases/06-smooth-audio-ducking-engine-pipewire-fader/06-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 06: Code Review Fix Report

**Fixed at:** 2026-11-12T11:57:00Z  
**Source review:** `.planning/phases/06-smooth-audio-ducking-engine-pipewire-fader/06-REVIEW.md`  
**Iteration:** 1  
**Verification Environment:** main checkout (`workflow.use_worktrees=false`)

**Summary:**
- Findings in scope: 6 (1 Critical, 5 Warnings)
- Fixed: 6
- Skipped: 0

## Fixed Issues

### CR-01: VolumeFader desynchronization with boosted PulseAudio sink volume (150%) causes abrupt initial volume drop and inaccurate effective volume

**Files modified:** `py_modules/volume.py`, `tests/test_volume.py`  
**Commit:** `f50a30a`  
**Applied fix:** Updated `boost_pa_volume` to synchronize `plugin._volume_fader._current_sink_volume = 150.0` and `_target_sink_volume = 150.0` when not ducked, ensuring baseline ratio arithmetic and initial fade start volumes remain consistent with boosted librespot hardware levels.

### WR-01: VoiceActivityDetector leaks ducked voice state when playback is paused during voice chat

**Files modified:** `py_modules/volume.py`, `tests/test_volume.py`  
**Commit:** `52197bc`  
**Applied fix:** In `VoiceActivityDetector._poll_step`, when Spotify playback is paused/stopped (`not is_playing`), any active voice duck state (`_voice_active == True`) is now explicitly cleared (`_voice_active = False`) and `self.fader.set_ducking(False, reason="voice")` is dispatched to release ducking.

### WR-02: AppLifetime exit debounce triggers on any process exit, causing premature un-ducking

**Files modified:** `src/index.tsx`  
**Commit:** `b6afe72`  
**Applied fix:** Added `appId === activeGameAppId` verification to the `RegisterForAppLifetimeNotifications` exit handler (`!running`), ensuring auxiliary process/redistributable exits do not prematurely start the debounce timer or clear the active game tracking.

### WR-03: resolve_sink_input_id short-circuits PID matching with generic application.name

**Files modified:** `py_modules/volume.py`, `tests/test_volume.py`  
**Commit:** `aa95952`  
**Applied fix:** Refactored `VolumeFader.resolve_sink_input_id` to parse `pactl list sink-inputs` into discrete sink-input blocks and perform two-pass evaluation: Pass 1 prioritizes exact process PID matching across all sink inputs; Pass 2 falls back to application/media name matching only if no PID matched.

### WR-04: Disabling auto_ducking setting while a game is running leaves audio ducked indefinitely

**Files modified:** `main.py`, `tests/test_e2e_requirements.py`  
**Commit:** `3559ff2`  
**Applied fix:** In `Plugin.set_setting`, when `key == "auto_ducking"` and the incoming value is `False`, an async task is scheduled to release existing game ducking via `self._volume_fader.set_ducking(False, reason="game")`.

### WR-05: trigger_ducking RPC suppresses voice ducking if game ducking (auto_ducking) is disabled

**Files modified:** `main.py`, `tests/test_e2e_requirements.py`  
**Commit:** `a2b1d08`  
**Applied fix:** In `Plugin.trigger_ducking`, scoped the settings check to the specific ducking reason: `auto_ducking` is verified only when `reason == "game"`, while `voice_ducking_enabled` is checked when `reason == "voice"`.

---

_Fixed: 2026-11-12T11:57:00Z_  
_Fixer: the agent (gsd-code-fixer)_  
_Iteration: 1_
