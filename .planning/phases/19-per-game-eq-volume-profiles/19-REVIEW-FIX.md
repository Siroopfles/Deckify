---
phase: 19-per-game-eq-volume-profiles
fixed_at: 2026-11-19T08:56:08Z
review_path: .planning/phases/19-per-game-eq-volume-profiles/19-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 19: Code Review Fix Report

**Fixed at:** 2026-11-19T08:56:08Z
**Source review:** `.planning/phases/19-per-game-eq-volume-profiles/19-REVIEW.md`
**Iteration:** 1
**Verification Environment:** Per-fix edits, commits, and targeted tests ran inside isolated git worktree `C:/Users/djdje/Deckify/.agents/worktrees/rf-19-1476-1795077644` (`gsd-reviewfix/19-1476`); full test, typecheck, lint, and build gates ran in the main checkout after fast-forward merge.

**Summary:**
- Findings in scope: 6 (`WR-01`–`WR-06`; `WR-07` with `Category: necessity` and `IN-01`–`IN-05` left untouched per `fix_scope: critical_warning`)
- Fixed: 6
- Skipped: 0

**Verification Results:**
- Isolated worktree (`C:/Users/djdje/Deckify/.agents/worktrees/rf-19-1476-1795077644`): targeted `test_equalizer.py` (34 tests), `test_volume.py` (72 tests), `test_soundtrack.py` (47 tests), `GameEqModal.test.tsx` + `SoundtracksTab.test.tsx` (33 tests), `pnpm run typecheck`, `eslint`, and `pnpm run build` passed per-fix prior to atomic commits.
- Main checkout (post fast-forward merge `4bb78c0..cd36c33`):
  - `py -3 -m unittest discover -s tests -p "test_*.py"`: Ran 588 tests in 65.989s — `OK`
  - `pnpm test`: 17 test files passed, 203 tests passed
  - `pnpm run typecheck`: 0 errors
  - `pnpm run lint`: 0 errors (653 pre-existing warnings); modified TSX files (`SoundtracksTab.tsx`, `GameEqModal.tsx`) have 0 errors and 0 warnings
  - `pnpm run build`: `./src/index.tsx → dist... created dist in 7.1s`

## Fixed Issues

### WR-01: Async race in `EqualizerManager.preview_bands` / `set_bands` can overwrite restored EQ after `clear_preview` or `apply_ephemeral_preset`

**Files modified:** `py_modules/equalizer.py`, `tests/test_equalizer.py`
**Commit:** `6bbb8c5`
**Applied fix:** Serialized `preview_bands`, `set_bands`, `apply_preset`, and `_throttled_pw_cli_flush` under `self._lock` with a monotonic `_eq_seq` sequence guard and shared `_cancel_throttle` / `_schedule_throttle_locked` / `_ensure_started_locked` helpers. `apply_preset` now cancels pending `_throttle_task` and clears `_pending_bands` for all presets (not only `"flat"`), and `preview_bands` / `set_bands` re-verify `_preview_active`, `has_ephemeral_override`, and `_eq_seq` after process startup before scheduling `_throttled_pw_cli_flush`.

### WR-02: Concurrent `VolumeFader.fade_to` task replacement race during rapid `SoundtracksTab` slider hot-apply

**Files modified:** `py_modules/volume.py`, `tests/test_volume.py`
**Commit:** `be77bbd`
**Applied fix:** Added a monotonic `_fade_seq` counter on `VolumeFader` and looped task cancellation in `fade_to` while checking `my_seq != self._fade_seq` before and after awaiting task cancellation, ensuring only the latest `fade_to` caller spawns `_execute_fade`.

### WR-03: `boost_pa_volume` overwrites active per-game volume ceiling, ducking, and sleep lock when `librespot` stream initializes late

**Files modified:** `py_modules/volume.py`, `tests/test_volume.py`
**Commit:** `bd805ee`
**Applied fix:** Updated `boost_pa_volume` (via `_compute_boost_target`) to compute the target sink percentage from `_sleep_locked` (`0.0`) or `fader._compute_target_sink_volume()` once `_pa_volume_boosted` is enabled, rechecking if fader state changed while awaiting `pactl` (when no fade task is active), and restoring `_pa_volume_boosted` if `_set_pa_volume_percent` returns `False`.

### WR-04: `EqualizerManager.cleanup_stale_process` sends `SIGTERM` as `root` without verifying `/proc/{pid}/cmdline`

**Files modified:** `py_modules/equalizer.py`, `tests/test_equalizer.py`
**Commit:** `2afe970`
**Applied fix:** Added `/proc/{old_pid}/cmdline` inspection before calling `_fallback_to_hardware_sink` and `SIGTERM` so unrelated recycled PIDs (or unreadable `/proc` entries) clear `eq.pid` and return without terminating non-`pipewire` processes.

### WR-05: `SoundtracksTab` cancels pending debounced saves on unmount instead of flushing them

**Files modified:** `src/components/tabs/SoundtracksTab.tsx`, `src/components/tabs/SoundtracksTab.test.tsx`
**Commit:** `fc82a67`
**Applied fix:** Added `pendingSavesRef` in `useProfileSaveActions` (updated in `scheduleSave`, cleared in `saveImmediate` and `handleDeleteProfile`) and `flushPendingSaves` in `useInitialSoundtrackLoad` unmount cleanup to cancel timers and flush pending profile edits immediately without altering `SoundtracksTab` top-level `useState` hook-slot order.

### WR-06: `GameEqModal` relies on stale `isRunningRef` and leaves `_preview_active = True` if running-game save fails or game exits mid-edit

**Files modified:** `main.py`, `src/components/tabs/GameEqModal.tsx`, `src/components/tabs/SoundtracksTab.tsx`, `src/components/tabs/GameEqModal.test.tsx`, `src/components/tabs/SoundtracksTab.test.tsx`, `tests/test_soundtrack.py`
**Commit:** `cd36c33`
**Applied fix:** Returned the `Promise<{ ok: boolean; error?: string }>` from `SoundtracksTab.openGameEqModal` `onSave`, updated `GameEqModal` (`invokeSaveWithClear`) to await promise-returning `onSave` results and call `clear_eq_preview` whenever `!isRunningRef.current` or the save fails/rejects, and added `Plugin._clear_active_eq_preview()` at the end of `Plugin.save_game_soundtrack_profile` so stale `_preview_active = True` state is cleared if the active game exited mid-edit or saving failed.

---

_Fixed: 2026-11-19T08:56:08Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
