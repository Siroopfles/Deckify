---
phase: 06-smooth-audio-ducking-engine-pipewire-fader
reviewed: 2026-11-12T11:45:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - py_modules/common.py
  - py_modules/volume.py
  - main.py
  - src/types.ts
  - src/index.tsx
  - src/components/tabs/SettingsTab.tsx
  - tests/test_volume.py
  - tests/test_e2e_requirements.py
  - src/components/tabs/SettingsTab.test.tsx
findings:
  critical: 0
  warning: 0
  info: 3
  total: 3
  resolved: 6
  necessity: 0
status: resolved
---

# Phase 06: Code Review Report

**Reviewed:** 2026-11-12T11:45:00Z  
**Resolved:** 2026-11-12T11:57:00Z  
**Depth:** standard  
**Files Reviewed:** 9  
**Status:** resolved (all critical & warning issues fixed)  

## Summary

The Phase 06 implementation introduces a local PipeWire audio fader (`VolumeFader`), cosine easing (`cosine_ease`), background Voice Activity Detection (`VoiceActivityDetector`), and dedicated settings controls in `SettingsTab.tsx` and `src/index.tsx`. The implementation adheres strictly to security requirements (ASVS L1: argument separation, regex/numeric sanitization on `pactl` parameters, zero shell interpolation) and Steam CEF CSP constraints (100% local PipeWire control with zero Spotify Web API calls).

However, an adversarial inspection revealed 1 Critical blocker, 5 Warnings, and 3 Info quality items:
- **Critical (CR-01):** `VolumeFader` initializes its internal `_current_sink_volume` to `100.0` before `boost_pa_volume()` elevates librespot to `150.0`. When `boost_pa_volume()` runs, the fader's internal volume is not updated, causing an audible instantaneous 33% volume drop on the first 50ms tick of ducking, as well as inaccurate `effective_volume` reporting when unducked.
- **Warnings (WR-01 through WR-05):** `VoiceActivityDetector` leaks ducked voice state when music playback is paused during speech; the frontend exit debounce timer in `src/index.tsx` is triggered by any exiting helper process (e.g. Proton/DirectX redistributables) without checking `appId`; `resolve_sink_input_id` short-circuits PID filtering with generic application name checks; disabling `auto_ducking` in settings while in-game fails to release active ducking; and `trigger_ducking` suppresses voice ducking if game ducking is disabled.

---

## Critical Issues

### CR-01: VolumeFader desynchronization with boosted PulseAudio sink volume (150%) causes abrupt initial volume drop and inaccurate effective volume

**File:** [py_modules/volume.py:160](file:///C:/Users/djdje/Deckify/py_modules/volume.py#L160), [py_modules/volume.py:85-90](file:///C:/Users/djdje/Deckify/py_modules/volume.py#L85-L90)  
**Issue:**  
In `Plugin.__init__` and `Plugin._main`, `VolumeFader` is instantiated when `_pa_volume_boosted` is `False`. Consequently, `VolumeFader._current_sink_volume` initializes to `100.0`. Later, `_monitor_process` calls `boost_pa_volume(self)`, which raises the PipeWire sink-input volume to 150% and sets `self._pa_volume_boosted = True`.

However, `boost_pa_volume()` does not update `self._volume_fader._current_sink_volume`, leaving it at `100.0`. This produces two bugs:
1. `VolumeFader.effective_volume` computes `ratio = self._current_sink_volume / baseline = 100.0 / 150.0 = 0.667`. For a user listening at master volume 80%, `effective_volume` returns 53% even when ducking is completely inactive (`is_ducked == False`).
2. When ducking is triggered, `_execute_fade` calculates `start_vol = self._current_sink_volume` (`100.0`). But the actual hardware sink-input volume is `150.0`. On the very first 50ms tick, `_apply_sink_volume` immediately sets the volume to ~99.8%, resulting in an instantaneous 33% volume drop instead of a smooth cosine fade from 150% to target.

**Fix:**  
Ensure `boost_pa_volume()` synchronizes `_volume_fader._current_sink_volume = 150.0` when ducking is not active, and ensure `VolumeFader` syncs its baseline when un-ducked:

```python
async def boost_pa_volume(plugin):
    """Set librespot's PulseAudio sink-input to 150% for audible volume."""
    if await plugin._set_pa_volume_percent(150):
        decky.logger.info("PA volume boosted to 150%%")
        plugin._pa_volume_boosted = True
        if hasattr(plugin, "_volume_fader") and plugin._volume_fader and not plugin._volume_fader.is_ducked:
            plugin._volume_fader._current_sink_volume = 150.0
```

**Status:** Resolved in commit `f50a30a`.

---

## Warnings

### WR-01: VoiceActivityDetector leaks ducked voice state when playback is paused during voice chat

**File:** [py_modules/volume.py:400-403](file:///C:/Users/djdje/Deckify/py_modules/volume.py#L400-L403)  
**Issue:**  
In `VoiceActivityDetector._poll_step`:
```python
is_playing = getattr(self.plugin, "_is_playing", False) or (getattr(self.plugin, "_poll_play_state", None) == "playing")
if not is_playing:
    return 1.0
```
If voice ducking was activated (`self._voice_active == True`), and Spotify playback is subsequently paused while in a call or speaking, `_poll_step` returns early with `1.0` indefinitely. It never evaluates `now - self._last_speech_time >= hold_delay`.  
As a result, `self._voice_active` remains `True` and `"voice"` stays stuck in `fader._duck_reasons`. If a game launches and exits during this period, or if the user leaves the voice call while paused, the audio remains stuck in the ducked state indefinitely.

**Fix:**  
If playback is paused while `_voice_active` is `True`, check streams or release the ducked voice state:

```python
        is_playing = getattr(self.plugin, "_is_playing", False) or (getattr(self.plugin, "_poll_play_state", None) == "playing")
        if not is_playing:
            if self._voice_active:
                self._voice_active = False
                await self.fader.set_ducking(False, reason="voice")
            return 1.0
```

**Status:** Resolved in commit `52197bc`.

---

### WR-02: AppLifetime exit debounce triggers on any process exit, causing premature un-ducking

**File:** [src/index.tsx:773-792](file:///C:/Users/djdje/Deckify/src/index.tsx#L773-L792)  
**Issue:**  
The `RegisterForAppLifetimeNotifications` handler in `src/index.tsx` checks:
```tsx
} else if (!running && activeGameAppId) {
  if (gameExitDebounceTimer) clearTimeout(gameExitDebounceTimer);
  gameExitDebounceTimer = setTimeout(async () => {
    activeGameAppId = null;
    gameExitDebounceTimer = null;
    await backendTriggerDucking(false, "game").catch(() => {});
  }, 3000);
}
```
SteamOS fires lifetime notifications for many auxiliary processes: Proton redistributables (DirectX/VC++ installers), Steam Linux Runtime helpers, and cloud sync jobs. Because there is no check that `appId === activeGameAppId` (or tracking of active App IDs), whenever *any* background process exits (`!running`), it triggers the 3-second debounce timer and resets `activeGameAppId = null`. If no new process launches within 3 seconds, audio un-ducks while the primary game is still actively being played.

**Fix:**  
Track running game App IDs with a set or match against `activeGameAppId`:

```tsx
        if (running && appId) {
          if (gameExitDebounceTimer) {
            clearTimeout(gameExitDebounceTimer);
            gameExitDebounceTimer = null;
          }
          activeGameAppId = appId;
          await backendTriggerDucking(true, "game", appId).catch(() => {});
        } else if (!running && activeGameAppId && appId === activeGameAppId) {
          if (gameExitDebounceTimer) clearTimeout(gameExitDebounceTimer);
          gameExitDebounceTimer = setTimeout(async () => {
            activeGameAppId = null;
            gameExitDebounceTimer = null;
            await backendTriggerDucking(false, "game").catch(() => {});
          }, 3000);
        }
```

**Status:** Resolved in commit `b6afe72`.

---

### WR-03: resolve_sink_input_id short-circuits PID matching with generic application.name

**File:** [py_modules/volume.py:194-207](file:///C:/Users/djdje/Deckify/py_modules/volume.py#L194-L207)  
**Issue:**  
In `VolumeFader.resolve_sink_input_id()`:
```python
                elif current_id:
                    if any(f'"{p}"' in line for p in pids if p):
                        return current_id
                    low = line.lower()
                    if ("application.name" in low or "media.name" in low) and ("librespot" in low or "spotify" in low):
                        return current_id
```
Because `pactl list sink-inputs` outputs properties line by line, `application.name` usually appears before `application.process.id`. If another application with name `spotify` exists (such as a browser tab or secondary client), line 206 returns immediately on that block before line 203 has a chance to inspect the PID, effectively ignoring `pids`.

**Fix:**  
Parse output by sink-input blocks or perform a two-pass resolution: pass 1 searches specifically for PID matches, pass 2 falls back to application name if no PID matched.

**Status:** Resolved in commit `aa95952`.

---

### WR-04: Disabling auto_ducking setting while a game is running leaves audio ducked indefinitely

**File:** [main.py:569-570](file:///C:/Users/djdje/Deckify/main.py#L569-L570), [main.py:663-664](file:///C:/Users/djdje/Deckify/main.py#L663-L664)  
**Issue:**  
When the user turns OFF "Game Audio Ducking" in `SettingsTab.tsx`, `backendSetSetting("auto_ducking", false)` updates `self._settings["auto_ducking"] = False`. However, unlike `voice_ducking_enabled` which cleanly un-ducks in its worker loop, `set_setting` does not notify `self._volume_fader` to release existing `"game"` ducking. If a game is active, music remains attenuated at 50% until the game exits.

**Fix:**  
In `set_setting`, when `key == "auto_ducking"` and `value is False`:
```python
        elif key == "auto_ducking":
            value = bool(value)
            if not value and hasattr(self, "_volume_fader") and self._volume_fader:
                asyncio.create_task(self._volume_fader.set_ducking(False, reason="game"))
```

**Status:** Resolved in commit `3559ff2`.

---

### WR-05: trigger_ducking RPC suppresses voice ducking if game ducking (auto_ducking) is disabled

**File:** [main.py:663-664](file:///C:/Users/djdje/Deckify/main.py#L663-L664)  
**Issue:**  
In `Plugin.trigger_ducking`:
```python
        if active and not self._settings.get("auto_ducking", True):
            return {"ok": True, "ducked": False, "skipped": "auto_ducking_disabled"}
```
`auto_ducking` is the toggle for game audio ducking. If a caller or test calls `trigger_ducking(True, reason="voice")`, it is refused if `auto_ducking` is false, even when `voice_ducking_enabled` is true.

**Fix:**  
Condition the check on `reason == "game"`:
```python
        if active:
            if reason == "game" and not self._settings.get("auto_ducking", True):
                return {"ok": True, "ducked": False, "skipped": "auto_ducking_disabled"}
            if reason == "voice" and not self._settings.get("voice_ducking_enabled", True):
                return {"ok": True, "ducked": False, "skipped": "voice_ducking_disabled"}
```

**Status:** Resolved in commit `a2b1d08`.

---

## Info

### IN-01: Inconsistent fallback default for auto_ducking_volume (25 vs 30)

**File:** [py_modules/common.py:85](file:///C:/Users/djdje/Deckify/py_modules/common.py#L85), [py_modules/volume.py:253](file:///C:/Users/djdje/Deckify/py_modules/volume.py#L253)  
**Issue:**  
`DEFAULT_SETTINGS["auto_ducking_volume"]` is set to `30`, whereas `volume.py:253` defaults to `25` (`settings.get("auto_ducking_volume", 25)`), and `SettingsTab.test.tsx` mocks it as `25`.  
**Fix:** Align the fallback in `volume.py:253` to use `30` or update `DEFAULT_SETTINGS` to `25` consistently across all files.

### IN-02: QAM volume slider binding to effectiveVolume alters Spotify base volume during ducking

**File:** [src/index.tsx:469](file:///C:/Users/djdje/Deckify/src/index.tsx#L469), [src/index.tsx:253-256](file:///C:/Users/djdje/Deckify/src/index.tsx#L253-L256)  
**Issue:**  
The volume slider in QAM binds its value to `isDucked && effectiveVolume != null ? effectiveVolume : volume`. If a user drags the slider while ducked (e.g. at 40%), `handleVolumeChange` sends 40% as the new Spotify master volume via `backendSetVolume(40)`. This causes the ducked music to attenuate further (50% of 40% = 20%), and upon game exit, restores only to 40% instead of the original 80%.  
**Fix:** Consider locking the slider while ducked, or calculating the inverse master volume (`newBase = effective / factor`) when adjusting during ducked states.

### IN-03: Unit test suite in test_volume.py does not test boosted PulseAudio volume (150%)

**File:** [tests/test_volume.py:29](file:///C:/Users/djdje/Deckify/tests/test_volume.py#L29)  
**Issue:**  
All unit tests in `tests/test_volume.py` fixture `_pa_volume_boosted = False`. Because SteamOS librespot runs at 150% boost by default, the 150% baseline calculation and ratio math is never exercised in the unit test suite.  
**Fix:** Add test cases with `_pa_volume_boosted = True` verifying that `effective_volume` properly scales `ratio = current / 150.0`.

---

_Reviewed: 2026-11-12T11:45:00Z_  
_Reviewer: the agent (gsd-code-reviewer)_  
_Depth: standard_
