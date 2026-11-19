---
phase: 19-per-game-eq-volume-profiles
reviewed: 2026-11-19T08:26:46Z
depth: standard
files_reviewed: 20
files_reviewed_list:
  - main.py
  - py_modules/common.py
  - py_modules/equalizer.py
  - py_modules/soundtrack.py
  - py_modules/volume.py
  - src/components/DeckifyExpandedModal.tsx
  - src/components/common/EqBandFaders.tsx
  - src/components/tabs/GameEqModal.test.tsx
  - src/components/tabs/GameEqModal.tsx
  - src/components/tabs/SettingsTab.test.tsx
  - src/components/tabs/SettingsTab.tsx
  - src/components/tabs/SoundtracksTab.test.tsx
  - src/components/tabs/SoundtracksTab.tsx
  - src/components/tabs/soundtrackUtils.ts
  - src/index.test.tsx
  - src/index.tsx
  - src/types.ts
  - tests/test_equalizer.py
  - tests/test_soundtrack.py
  - tests/test_volume.py
findings:
  critical: 0
  warning: 7
  info: 5
  total: 12
  necessity: 1
status: issues_found
---

# Phase 19: Code Review Report

**Reviewed:** 2026-11-19T08:26:46Z
**Depth:** standard
**Files Reviewed:** 20
**Status:** issues_found

## Summary

Reviewed all 20 backend Python, frontend TypeScript/React, and unit test files modified or added in Phase 19 (Per-Game EQ & Volume Profiles) at `standard` depth. Automated checks executed during review: `test_equalizer.py` (31 tests), `test_volume.py` (68 tests), and `test_soundtrack.py` (46 tests) passed; targeted Vitest specs (`GameEqModal.test.tsx`, `SettingsTab.test.tsx`, `SoundtracksTab.test.tsx`, `src/index.test.tsx`: 79 tests across 4 files), `pnpm typecheck`, and `pnpm lint` (0 errors; 0 warnings on newly created/refactored Phase 19 TSX components) passed.

The core 3-layer EQ state machine, local PipeWire `VolumeFader` scaling, crash recovery snapshot validation, and GamepadUI `flow-children="horizontal"` layouts are well-structured, and Trust-boundary input validation is consistently enforced on `app_id`, sink names, EQ bands, and `active_game_override_snapshot`. However, adversarial inspection uncovered **7 warnings** (including async concurrency races in `EqualizerManager.preview_bands` and `VolumeFader.fade_to`, `boost_pa_volume` clobbering active game volume ceilings, stale `eq.pid` termination without `/proc` verification, unsaved debounced profile edits dropped on tab unmount, stale `isRunningGame` preview cleanup handling in `GameEqModal`, and 1 necessity issue) plus **5 info items**. No Critical security or crash blockers were found.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: Async race in `EqualizerManager.preview_bands` / `set_bands` can overwrite restored EQ after `clear_preview` or `apply_ephemeral_preset`

**File:** `py_modules/equalizer.py:551-591` (also `py_modules/equalizer.py:465-493, 626-640`)
**Issue:** `preview_bands` sets `self._preview_active = True` at line 554, acquires `self._lock` only around `if not self.is_active:` (`_start_process` and `_route_librespot_to_sink`, lines 557-565), and then assigns `self._pending_bands = clamped` and spawns `self._throttle_task = asyncio.create_task(self._throttled_pw_cli_flush())` **outside** `self._lock` (lines 567-569). Meanwhile, `clear_preview` (lines 573-590) and `apply_ephemeral_preset` (lines 518-529) cancel `_throttle_task` (still `None` while `preview_bands` awaits `_start_process`), set `_preview_active = False`, and then await `self.apply_preset(...)` which waits on `self._lock`. When `preview_bands` releases `self._lock`, it unconditionally schedules `_throttled_pw_cli_flush()` without checking whether `_preview_active` was cleared in the meantime, and `apply_preset` does not cancel `_throttle_task` for non-flat presets (`"bass"`, `"gaming"`, etc.). Roughly 75 ms later, `_throttled_pw_cli_flush()` fires and overwrites the restored global or ephemeral EQ in PipeWire with the discarded preview bands (`set_bands` lines 626-639 has the same unguarded post-lock `_throttle_task` spawn).
**Fix:** Serialize `preview_bands`, `clear_preview`, and `set_bands` scheduling under `self._lock`, cancel `_throttle_task` inside `apply_preset`, and re-verify `self._preview_active` after awaiting process startup:

```python
async def preview_bands(self, bands: list[float]) -> dict:
    clamped = clamp_eq_bands(bands)
    async with self._lock:
        self._preview_active = True
        if not self.is_active:
            start_res = await self._start_process(clamped)
            if not start_res.get("ok"):
                self._preview_active = False
                return start_res
            await self._route_librespot_to_sink(EQ_SINK_NAME)
            if self._target_hardware_sink:
                await self._route_eq_output_to_sink(self._target_hardware_sink)

        if not self._preview_active:
            return {"ok": True, "preview": False, "cancelled": True}

        self._pending_bands = clamped
        if self._throttle_task is None or self._throttle_task.done():
            self._throttle_task = asyncio.create_task(self._throttled_pw_cli_flush())
        return {"ok": True, "preview": True, "bands": clamped}
```

### WR-02: Concurrent `VolumeFader.fade_to` task replacement race during rapid `SoundtracksTab` slider hot-apply

**File:** `py_modules/volume.py:416-428` (triggered by `src/components/tabs/SoundtracksTab.tsx:521-523, 572-574, 778-785`)
**Issue:** While a game is running, `SoundtracksTab` flushes every `Volume Override` and `Ducking Attenuation Override` slider `onChange` immediately via `saveImmediate` (bypassing debounce), triggering overlapping `Plugin.save_game_soundtrack_profile` -> `SoundtrackManager.refresh_active_overrides` -> `VolumeFader.apply_game_override` -> `VolumeFader.fade_to` calls. In `VolumeFader.fade_to` (lines 418-427), `if self._fade_task and not self._fade_task.done():` cancels the active task and yields at `await self._fade_task` with no lock or generation guard. If two calls overlap while an existing `_fade_task` is cancelling (e.g., blocked on `pactl`), both await the same task; the first wakes up and sets `self._fade_task = Task_A`, and the second immediately wakes up and overwrites `self._fade_task = Task_B` without cancelling `Task_A`. Both `_execute_fade` loops then run concurrently, issuing conflicting `pactl set-sink-input-volume` transitions.
**Fix:** Track a monotonic sequence counter on `VolumeFader` so only the latest `fade_to` call spawns a task after cancellation settles:

```python
def __init__(self, plugin):
    ...
    self._fade_seq: int = 0

async def fade_to(self, target_sink_volume: float, duration_sec: float) -> None:
    self._fade_seq += 1
    my_seq = self._fade_seq
    while self._fade_task and not self._fade_task.done():
        task = self._fade_task
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        if my_seq != self._fade_seq:
            return
    if my_seq != self._fade_seq:
        return
    self._fade_task = asyncio.create_task(
        self._execute_fade(target_sink_volume, duration_sec)
    )
```

### WR-03: `boost_pa_volume` overwrites active per-game volume ceiling, ducking, and sleep lock when `librespot` stream initializes late

**File:** `py_modules/volume.py:86-95` (called from `main.py:1891-1892`)
**Issue:** `start_librespot()` resets `self._pa_volume_boosted = False` (`main.py:563`), and `_monitor_process()` calls `await self._boost_pa_volume()` every 3 seconds until boosted (`main.py:1891-1892`). In `boost_pa_volume` (`py_modules/volume.py:86-95`), `await plugin._set_pa_volume_percent(150)` unconditionally sets `librespot`'s PipeWire sink-input to `150%`, and lines 92-94 only guard on `not fader.is_ducked`. If `librespot` first creates its sink-input (or restarts mid-game) while a game profile with `volume_override` (e.g. `60%`) and `ducking_override=False` (`has_game_override=True`, `is_ducked=False`) is active, or while `is_ducked=True` or `_sleep_locked=True`, `boost_pa_volume` blasts PipeWire to `150%` and (when `not is_ducked`) overwrites `_current_sink_volume` and `_target_sink_volume` to `150.0`, defeating the per-game ceiling until game exit.
**Fix:** Compute the desired sink percentage from `fader._compute_target_sink_volume()` (or `0` when `_sleep_locked`) once `_pa_volume_boosted` is enabled instead of hardcoding `150%` when fader overrides/locks are active:

```python
async def boost_pa_volume(plugin):
    """Set librespot's PulseAudio sink-input to 150% (respecting active fader overrides/locks)."""
    fader = getattr(plugin, "_volume_fader", None)
    plugin._pa_volume_boosted = True
    target = (
        0.0 if (fader and getattr(fader, "_sleep_locked", False))
        else fader._compute_target_sink_volume() if fader
        else 150.0
    )
    if await plugin._set_pa_volume_percent(int(round(target))):
        decky.logger.info("PA volume boosted (applied=%d%%)", int(round(target)))
        if fader:
            fader._current_sink_volume = target
            fader._target_sink_volume = target
    else:
        plugin._pa_volume_boosted = False
```

### WR-04: `EqualizerManager.cleanup_stale_process` sends `SIGTERM` as `root` without verifying `/proc/{pid}/cmdline`

**File:** `py_modules/equalizer.py:273-301`
**Issue:** `EQ_PID_FILE` lives in persistent `DECKY_PLUGIN_RUNTIME_DIR` (`py_modules/common.py:45`), so it survives unclean shutdowns and OS reboots. On startup, `cleanup_stale_process()` reads `old_pid` from `eq.pid`, verifies liveness with `os.kill(old_pid, 0)` (line 288), and sends `os.kill(old_pid, 15)` (line 296). Because Decky Loader runs as `root` (`py_modules/common.py:411`), PID recycling after a reboot can assign `old_pid` to an unrelated SteamOS/system process, causing `cleanup_stale_process()` to terminate an arbitrary process.
**Fix:** On Linux hosts where `/proc/{old_pid}/cmdline` exists, verify `"pipewire"` appears in the process command line before sending `SIGTERM`:

```python
cmdline_path = f"/proc/{old_pid}/cmdline"
if os.path.exists(cmdline_path):
    try:
        with open(cmdline_path, "rb") as cf:
            cmdline = cf.read().decode("utf-8", errors="ignore")
        if "pipewire" not in cmdline:
            decky.logger.warning("Skipping stale eq.pid=%d (not pipewire)", old_pid)
            self._clear_pid()
            return
    except OSError:
        self._clear_pid()
        return
```

### WR-05: `SoundtracksTab` cancels pending debounced saves on unmount instead of flushing them

**File:** `src/components/tabs/SoundtracksTab.tsx:766-786, 909-927`
**Issue:** Edits on non-running game profiles (`isRunning === false`) call `scheduleSave`, storing a 500 ms timer in `saveTimersRef.current[key]`. On unmount (e.g., switching tabs in `DeckifyExpandedModal` or closing the modal within 500 ms of changing `EQ Preset Override`, `Volume Override`, or `Ducking Attenuation Override`), `useInitialSoundtrackLoad`'s cleanup (`SoundtracksTab.tsx:926`) runs `for (const timer of Object.values(timers)) clearTimeout(timer);` without flushing pending saves, silently losing the user's changes.
**Fix:** Keep a `pendingSavesRef = useRef<Record<string, { appId: number; profile: SoundtrackProfile }>>({})` updated in `scheduleSave` / cleared in `saveImmediate` and `handleDeleteProfile`, and flush remaining entries via `executeSaveProfile` in the unmount cleanup.

### WR-06: `GameEqModal` relies on stale `isRunningRef` and leaves `_preview_active = True` if running-game save fails or game exits mid-edit

**File:** `src/components/tabs/GameEqModal.tsx:294-295, 342-351` & `src/components/tabs/SoundtracksTab.tsx:860-884`
**Issue:** `GameEqModal` is mounted via `@decky/ui`'s `showModal(...)`, which does not push prop updates from `SoundtracksTab` while the modal is open, leaving `isRunningRef.current` frozen at mount time. In `GameEqModal.handleSave` (lines 342-351), when `isRunningRef.current` is `true`, `clear_eq_preview` is skipped on the assumption that `onSave` -> `saveImmediate` -> `refresh_active_overrides` -> `apply_ephemeral_preset` will clear `_preview_active`. If either `backendSaveProfile` returns `{ ok: false }` / rejects, or the active game exits while `GameEqModal` is open and the user drags a slider before clicking `Save Game EQ`, `refresh_active_overrides` does not run and `EqualizerManager._preview_active` stays `True` with preview EQ stuck active after the modal closes.
**Fix:** Return the `Promise<{ ok: boolean }>` from `onSave` (`saveImmediate`) and invoke `backendClearEqPreview().catch(() => {})` if the save fails or if the running state changed; additionally, have `Plugin.save_game_soundtrack_profile` call `eq_mgr.clear_preview()` when saving a non-active game while `_preview_active` is `True` or on save failure.

```tsx
const handleSave = async () => {
  savedRef.current = true;
  const saveRes = await Promise.resolve(onSave(bandsRef.current));
  if ((!isRunningRef.current || (saveRes && saveRes.ok === false)) && !clearedRef.current) {
    clearedRef.current = true;
    backendClearEqPreview().catch(() => {});
  }
  closeModal?.();
  onClose?.();
};
```

### WR-07: Already-defended-elsewhere — redundant `Number.isFinite` guard in `GameEqModal.handleBandChange`

**File:** `src/components/tabs/GameEqModal.tsx:318`
**Category:** necessity
**Issue:** `handleBandChange` checks `const safeGain = Number.isFinite(rawGain) ? rawGain : 0;` immediately before passing the mapped 10-element array into `normalizeEqBands(...)` (`GameEqModal.tsx:319-321`). `normalizeEqBands` (`src/components/common/EqBandFaders.tsx:41-48`) already inspects every element with `const raw = Number(bands[idx]); if (!Number.isFinite(raw)) return 0;` (line 45) before clamping and snapping to 0.5 dB steps, so the `Number.isFinite` fallback in `handleBandChange` duplicates a check already enforced one line downstream.
**Fix:** Remove `safeGain` in `src/components/tabs/GameEqModal.tsx:318` and pass `rawGain` directly into `normalizeEqBands(bandsRef.current.map((b, i) => (i === idx ? rawGain : b)))`.

## Info

### IN-01: Unused `EqBandFaders` component export and duplicate `EQ_PID_FILE` constant

**File:** `src/components/common/EqBandFaders.tsx:234` & `py_modules/common.py:45`
**Issue:** `EqBandFaders` (`FC<EqBandFadersProps>`) is never instantiated anywhere in `src/` because both `SettingsTab.tsx:579` and `GameEqModal.tsx:417` call `renderEqBandFaders(...)` directly. Similarly, `py_modules/common.py:45` defines `EQ_PID_FILE`, while `py_modules/equalizer.py:38` re-defines `EQ_PID_FILE` locally instead of importing it from `py_modules.common`.
**Fix:** Import `EQ_PID_FILE` from `py_modules.common` in `py_modules/equalizer.py`, and remove `EqBandFaders` if direct `renderEqBandFaders` invocation remains the sole contract (or note it as a thin wrapper).

### IN-02: `aria-label` props on `+`/`-` `InteractiveRow` controls in `EqBandFaders.tsx` are not forwarded to DOM

**File:** `src/components/common/EqBandFaders.tsx:181-209` & `src/components/common/InteractiveRow.tsx:97-153`
**Issue:** `renderSingleEqBand` passes `aria-label={`Increase ${label}`}` and `aria-label={`Decrease ${label}`}` to `<InteractiveRow>`, which only forwards enumerated props in `InteractiveRowProps` (`src/components/common/InteractiveRow.tsx:17-28`) to `<Focusable>`. Shallow JSX unit tests inspect the React element prop, while at runtime the `aria-label` attribute is dropped.
**Fix:** Add `"aria-label"?: string` to `InteractiveRowProps` and forward it to `<Focusable>` in `InteractiveRow.tsx`.

### IN-03: `_validate_eq_bands` permits `float("inf")` unlike `clamp_eq_bands`

**File:** `main.py:66-78`
**Issue:** `_validate_eq_bands` uses `if val != val:` (line 75), which catches `NaN` but lets `float("inf")` / `float("-inf")` pass and silently clamp to `12.0` / `-12.0`, whereas `clamp_eq_bands` (`py_modules/equalizer.py:66`) uses `not math.isfinite(val)`.
**Fix:** Import `math` in `main.py` and replace `if val != val:` with `if not math.isfinite(val): return None, "Band gain must be finite"`.

### IN-04: `Plugin.set_setting` broadcasts unfiltered `_settings` on `settings_changed`

**File:** `main.py:873-876`
**Issue:** `get_status()` (`main.py:593-638`) restricts `settings` to `public_keys` and explicitly excludes `active_game_override_snapshot` (as well as auth tokens), whereas `set_setting()` (`main.py:874`) emits `dict(self._settings)` on `settings_changed`, exposing internal keys to event listeners.
**Fix:** Filter `settings_changed` payload with the same public allowlist used in `get_status()` (or strip `access_token`, `refresh_token`, `token_expires_at`, and `active_game_override_snapshot`).

### IN-05: `SoundtracksTab` `confirmDeleteAppId` stays active across card clicks and configured cards cannot collapse

**File:** `src/components/tabs/SoundtracksTab.tsx:992, 1001-1004`
**Issue:** Clicking a second game card's header (`onToggleExpand`) only clears `confirmDeleteAppId` when `prev === game.app_id`, leaving an open two-step delete prompt active on a previous card. Additionally, `isExpanded = expandedAppId === game.app_id || Boolean(existingProfile) || isRunning` makes clicking the header of any configured or running profile a visual no-op.
**Fix:** Clear `confirmDeleteAppId` unconditionally in `onToggleExpand` when toggling another card (`setConfirmDeleteAppId(null)`), and document or allow explicit collapse state for configured cards if desired.

---

_Reviewed: 2026-11-19T08:26:46Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
