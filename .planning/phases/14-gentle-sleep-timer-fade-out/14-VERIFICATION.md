---
phase: 14-gentle-sleep-timer-fade-out
verified: 2026-11-16T16:34:05Z
status: human_needed
score: 4/4 must-haves verified
covered_files:
  - .planning/phases/14-gentle-sleep-timer-fade-out/14-01-PLAN.md
  - .planning/phases/14-gentle-sleep-timer-fade-out/14-01-SUMMARY.md
  - .planning/phases/14-gentle-sleep-timer-fade-out/14-02-PLAN.md
  - main.py
  - py_modules/common.py
  - py_modules/system.py
  - py_modules/volume.py
  - src/components/tabs/SettingsTab.test.tsx
  - src/components/tabs/SettingsTab.tsx
  - src/types.ts
  - tests/test_features.py
  - tests/test_volume.py
covered_digest: "v4:sha256:a7b8dbfb0115ee6ed6146a4aaabb974b79924367b1f3be37ed76dc9aa36fca9f"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Set a 1-minute sleep timer with 15s Gentle Fade Out enabled (and optionally 'Power off Steam Deck when timer finishes') on a live Steam Deck."
    expected: "Volume smoothly fades to 0% over the final 15s while SettingsTab displays 'Fading out...', playback pauses at 0%, audio drains for ~1.2s, and baseline volume is restored (and persisted by PipeWire module-stream-restore) before poweroff so the next session does not start muted or pop."
    why_human: "Requires live SteamOS PipeWire module-stream-restore and librespot audio sink; unit tests verify call ordering against mocked faders/subprocesses."
---

# Phase 14: Gentle Sleep Timer Fade-Out Verification Report

**Phase Goal:** Expiring sleep timers gently fade playback volume to zero before pausing and cleanly restore baseline volume afterward.
**Verified:** 2026-11-16T16:34:05Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria & `14-CONTEXT.md` Decisions)

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | When the sleep timer expires with fade-out enabled, Deckify smoothly ramps playback volume down to 0% over the configured fade-out window (default 30s) before pausing playback (`D-01`, `D-02`, `D-03`). | ✓ VERIFIED | `py_modules/system.py` (`sleep_timer_worker`) waits until `_sleep_timer_end - fade_duration` (or starts immediately if remaining < `fade_duration`), sets `_sleep_timer_fading = True`, awaits `fader.start_sleep_fade(actual_fade)`, clears `_sleep_timer_fading`, and calls `control_playback("pause")`. `end_of_track=True` skips fade-out (`D-02`). `py_modules/common.py` (`DEFAULT_SETTINGS`, `_load_settings_impl`) and `main.py` (`get_status`, `set_setting`) persist/clamp `sleep_timer_fade_enabled` (default `True`) and `sleep_timer_fade_duration` (default `30`, clamped `5–120`). `src/components/tabs/SettingsTab.tsx` exposes `Gentle Fade Out` `ToggleField`, `Fade Out Duration (Seconds)` `SliderField` (`5–120`, step `5`), and `"Fading out..."` status text; `src/index.tsx` remains compact with 0 `sleep_timer` references (`D-03`). |
| 2 | Active game or voice ducking events cannot interrupt or override an in-progress sleep timer fade-out (`SLEEP-01`, `14-CONTEXT.md` Discretion). | ✓ VERIFIED | `py_modules/volume.py` (`VolumeFader.__init__`) initializes `self._sleep_locked = False`. `start_sleep_fade` sets `self._sleep_locked = True`. `set_ducking` updates `self._duck_reasons` (`add`/`discard`) and returns immediately when `self._sleep_locked` is `True`, preventing ducking fades from interrupting the sleep fade while preserving `_duck_reasons`. Verified by `tests/test_volume.py` (58 tests OK). |
| 3 | After playback pauses and audio drains, Deckify restores the pre-fade baseline volume (including before `shutdown_on_finish` poweroff) so the next session does not start muted or pop loudly (`SLEEP-01`). | ✓ VERIFIED | `py_modules/system.py` (`sleep_timer_worker`) waits `await asyncio.sleep(1.2)` after `control_playback("pause")` and awaits `fader.release_sleep_lock(0.0, wait=True)` strictly before checking `if plugin._sleep_timer_shutdown: await plugin.shutdown_system()`. Verified by `tests/test_features.py` (27 tests OK). Live SteamOS PipeWire `module-stream-restore` behavior is routed to Human Verification below. |
| 4 | Cancelling an active sleep timer during fade-out immediately aborts the fade and restores baseline volume (`D-04`). | ✓ VERIFIED | `py_modules/system.py` (`set_sleep_timer`) cancels `_sleep_timer_task` and awaits it inside `try ... except asyncio.CancelledError: pass`, resetting `_sleep_timer_fading = False`. `sleep_timer_worker`'s `except asyncio.CancelledError:` handler resets `_sleep_timer_fading = False` and calls `await fader.release_sleep_lock(0.5, wait=False)`, fading in `0.5s` to `_compute_target_sink_volume()` (respecting any active `_duck_reasons`). Verified by `tests/test_features.py`. |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `py_modules/volume.py` | `VolumeFader._sleep_locked`, `_compute_target_sink_volume`, `start_sleep_fade`, `release_sleep_lock` | ✓ VERIFIED | Present, substantive, wired (`start_sleep_fade` L263, `release_sleep_lock` L270, `_sleep_locked` guard in `set_ducking` L251). |
| `py_modules/system.py` | `sleep_timer_worker` fade/pause/1.2s drain/restore, `set_sleep_timer` deterministic cancel, `get_sleep_timer_status` `fading` flag | ✓ VERIFIED | Present, substantive, wired (`get_sleep_timer_status` L14–36, `set_sleep_timer` L39–68, `sleep_timer_worker` L71–119). |
| `py_modules/common.py` | `DEFAULT_SETTINGS` & `_load_settings_impl` sanitization for `sleep_timer_fade_enabled` & `sleep_timer_fade_duration` | ✓ VERIFIED | Present, substantive, wired (L115–116, L270–275). |
| `main.py` | `Plugin._sleep_timer_fading`, `get_status` `public_keys`, `set_setting` validation/clamping | ✓ VERIFIED | Present, substantive, wired (L109, L510, L587–593). |
| `src/types.ts` | `EngineSettings.sleep_timer_fade_enabled`, `EngineSettings.sleep_timer_fade_duration`, `SleepTimerStatus.fading` | ✓ VERIFIED | Present, substantive, wired (L200–201, L226). |
| `src/components/tabs/SettingsTab.tsx` | `Gentle Fade Out` `ToggleField`, `Fade Out Duration (Seconds)` `SliderField` (`5–120`, step `5`), `"Fading out..."` status | ✓ VERIFIED | Present, substantive, wired (L389–391, L452–476). |
| `src/index.tsx` | Unmodified compact QAM (no sleep timer fade controls per `D-03`) | ✓ VERIFIED | 0 `sleep_timer` matches in `src/index.tsx`. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `py_modules/system.py:sleep_timer_worker` | `py_modules/volume.py:VolumeFader.start_sleep_fade` | `await fader.start_sleep_fade(actual_fade)` before `control_playback("pause")` | ✓ WIRED | Verified at `py_modules/system.py:94`. |
| `py_modules/system.py:sleep_timer_worker` | `py_modules/volume.py:VolumeFader.release_sleep_lock` | `1.2s` drain then `release_sleep_lock(0.0, wait=True)` before `shutdown_system()`; `CancelledError` calls `release_sleep_lock(0.5, wait=False)` | ✓ WIRED | Verified at `py_modules/system.py:105–114`. |
| `src/components/tabs/SettingsTab.tsx` | `main.py:set_setting` | `updateSetting("sleep_timer_fade_enabled", val)` & `updateSetting("sleep_timer_fade_duration", clamped)` | ✓ WIRED | Verified at `SettingsTab.tsx:458, 472`. |
| `main.py:get_status` | `src/components/tabs/SettingsTab.tsx` | `status.settings.sleep_timer_fade_enabled`, `status.settings.sleep_timer_fade_duration`, `status.sleep_timer.fading` | ✓ WIRED | Verified at `main.py:510, 534` and `SettingsTab.tsx:389, 456, 469`. |

### Behavioral Spot-Checks (Automated Test Commands)

| Behavior / Suite | Command | Result | Status |
| --- | --- | --- | --- |
| `VolumeFader` sleep lock & ducking tests | `py -3 -m unittest discover -s tests -p "test_volume.py"` | `Ran 58 tests in 4.002s — OK` | ✓ PASS |
| Sleep timer fade, drain, restore, cancel & settings tests | `py -3 -m unittest discover -s tests -p "test_features.py"` | `Ran 27 tests in 1.213s — OK` | ✓ PASS |
| `SettingsTab` sleep timer fade UI & status tests | `pnpm test -- --run src/components/tabs/SettingsTab.test.tsx` | `1 passed (15 tests)` | ✓ PASS |
| TypeScript typecheck | `pnpm run typecheck` | `tsc --noEmit` exited with code 0 (0 errors) | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `SLEEP-01` | `14-01-PLAN.md`, `14-02-PLAN.md` | When the sleep timer expires, Deckify smoothly fades playback volume down to 0% over a configurable fade-out window (default 30s) using `VolumeFader` with a `"sleep"` priority lock before pausing playback and restoring baseline volume after audio drain. | ✓ SATISFIED (automated) / ? NEEDS HUMAN (SteamOS PipeWire hardware check) | All 4 ROADMAP SCs, `D-01`–`D-04`, and automated tests in `test_volume.py`, `test_features.py`, `SettingsTab.test.tsx`, and `tsc --noEmit` pass. Live SteamOS PipeWire `module-stream-restore` drain & poweroff check remains manual per `14-VALIDATION.md`. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| — | — | `TBD`, `FIXME`, `XXX` scan across `volume.py`, `system.py`, `common.py`, `main.py`, `types.ts`, `SettingsTab.tsx` | — | 0 matches found. |

### Human Verification Required

### 1. Real PipeWire Stream Drain & Non-Zero Restore Before SteamOS Poweroff (`14-VALIDATION.md`)

**Test:** On a Steam Deck running SteamOS 3.5+ with `librespot` active, set a 1-minute sleep timer with 15s Gentle Fade Out enabled (and test both with and without "Power off Steam Deck when timer finishes"). Also test cancelling the timer mid-fade while `"Fading out..."` is displayed.
**Expected:** Volume smoothly fades to 0% over the final 15s while `SettingsTab` shows `"Fading out..."`, playback pauses at 0%, audio drains for ~1.2s, and baseline volume is restored (and persisted by PipeWire `module-stream-restore`) before poweroff so the next session does not start muted or pop. Cancelling mid-fade immediately restores volume in ~0.5s.
**Why human:** Unit tests mock `pactl` and PipeWire sink-inputs; verifying real `module-stream-restore` persistence across `systemctl poweroff` requires Steam Deck hardware.

---

_Verified: 2026-11-16T16:34:05Z_
_Verifier: the agent (gsd-verifier)_
