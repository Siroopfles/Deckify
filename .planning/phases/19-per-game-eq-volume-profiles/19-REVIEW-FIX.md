---
phase: 19-per-game-eq-volume-profiles
fixed_at: 2026-11-19T12:39:25Z
review_path: .planning/phases/19-per-game-eq-volume-profiles/19-REVIEW.md
iteration: 2
findings_in_scope: 12
fixed: 12
skipped: 0
status: all_fixed
---

# Phase 19: Code Review Fix Report

**Fixed at:** 2026-11-19T12:39:25Z
**Source review:** `.planning/phases/19-per-game-eq-volume-profiles/19-REVIEW.md`
**Iteration:** 2
**Verification Environment:**
- Iteration 1 (`WR-01`–`WR-06`): Per-fix edits, commits (`6bbb8c5`..`cd36c33`), and targeted tests ran inside isolated git worktree `C:/Users/djdje/Deckify/.agents/worktrees/rf-19-1476-1795077644` (`gsd-reviewfix/19-1476`), followed by full gates in the main checkout.
- Iteration 2 (`WR-07`, `IN-01`–`IN-05`): Per-fix edits, commits (`60b7d28`..`03f5a88`), and targeted checks ran inside isolated git worktree `C:/Users/djdje/Deckify/.agents/worktrees/rf-19-12596-1795091447` (`gsd-reviewfix/19-12596`); full test, typecheck, lint, and build gates ran in the main checkout after fast-forward merge (`f2b61b4..03f5a88`).

**Summary:**
- Findings in scope: 12 (`WR-01`–`WR-07` and `IN-01`–`IN-05` under `fix_scope: all`)
- Fixed: 12
- Skipped: 0

**Verification Results:**
- Isolated worktree (`C:/Users/djdje/Deckify/.agents/worktrees/rf-19-12596-1795091447`): per-fix `py_compile`/`ast.parse`, `test_equalizer.py` (35 tests), `test_soundtrack.py` + `test_pinned_playlists.py` + `test_e2e_requirements.py` (207 tests), `GameEqModal.test.tsx` (12 tests), `InteractiveRow.test.tsx` (3 tests), `SoundtracksTab.test.tsx` (25 tests), `pnpm run typecheck`, and `eslint` passed prior to each atomic commit.
- Main checkout (post fast-forward merge `f2b61b4..03f5a88`):
  - `py -3 -m unittest discover -s tests -p "test_*.py"`: Ran 590 tests in 69.484s — `OK`
  - `pnpm test`: 17 test files passed, 208 tests passed
  - `pnpm run typecheck`: 0 errors
  - `pnpm run lint`: 0 errors (654 warnings; modified TSX components `SoundtracksTab.tsx`, `GameEqModal.tsx`, `EqBandFaders.tsx` have 0 errors and 0 warnings, and `InteractiveRow.tsx` retains only its 2 pre-existing `no-explicit-any` warnings)
  - `pnpm run build`: `./src/index.tsx → dist... created dist in 7.8s`

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

### WR-07: Already-defended-elsewhere — redundant `Number.isFinite` guard in `GameEqModal.handleBandChange`

**Files modified:** `src/components/tabs/GameEqModal.tsx`, `src/components/tabs/GameEqModal.test.tsx`
**Commit:** `60b7d28`
**Status:** fixed: requires human verification
**Applied fix:** Removed the redundant `const safeGain = Number.isFinite(rawGain) ? rawGain : 0;` guard in `useGameEqState`'s `handleBandChange` and passed `rawGain` directly into `normalizeEqBands(...)`, and added unit test assertions verifying non-finite gain inputs (`NaN`, `Infinity`, `-Infinity`) still normalize to `0`.

### IN-01: Unused `EqBandFaders` component export and duplicate `EQ_PID_FILE` constant

**Files modified:** `py_modules/equalizer.py`, `src/components/common/EqBandFaders.tsx`, `tests/test_equalizer.py`, `src/components/tabs/GameEqModal.test.tsx`
**Commit:** `08648dc`
**Applied fix:** Imported `EQ_PID_FILE` from `py_modules.common` in `py_modules/equalizer.py` (removing the duplicate local `_RUNTIME_DIR` and `EQ_PID_FILE` definitions while preserving module-level `equalizer.EQ_PID_FILE` binding) with an equality assertion in `tests/test_equalizer.py`; kept `EqBandFaders` exported with a JSDoc comment documenting its role as the thin JSX wrapper over `renderEqBandFaders` and added a direct unit test invoking `EqBandFaders` in `src/components/tabs/GameEqModal.test.tsx`.

### IN-02: `aria-label` props on `+`/`-` `InteractiveRow` controls in `EqBandFaders.tsx` are not forwarded to DOM

**Files modified:** `src/components/common/InteractiveRow.tsx`, `src/components/common/InteractiveRow.test.tsx`
**Commit:** `87c5fc8`
**Applied fix:** Added `"aria-label"?: string` to `InteractiveRowProps`, destructured `"aria-label": ariaLabel` in `InteractiveRow`, forwarded `aria-label={ariaLabel}` onto `<Focusable>`, and added a unit test verifying `aria-label` forwarding when provided and `undefined` when omitted.

### IN-03: `_validate_eq_bands` permits `float("inf")` unlike `clamp_eq_bands`

**Files modified:** `main.py`, `tests/test_equalizer.py`
**Commit:** `86c4f77`
**Applied fix:** Imported `math` in `main.py` and updated `_validate_eq_bands` to reject all non-finite gains via `if not math.isfinite(val): return None, "Band gain must be finite"`, with unit tests verifying `float("nan")`, `float("inf")`, and `float("-inf")` rejection across `_validate_eq_bands`, `set_eq_bands`, and `preview_eq_bands`.

### IN-04: `Plugin.set_setting` broadcasts unfiltered `_settings` on `settings_changed`

**Files modified:** `main.py`, `tests/test_soundtrack.py`, `tests/test_e2e_requirements.py`, `tests/test_pinned_playlists.py`
**Commit:** `a48c6ff`
**Applied fix:** Defined `_INTERNAL_SETTING_KEYS` (`access_token`, `refresh_token`, `token_expires_at`, `active_game_override_snapshot`) and `Plugin._public_settings_payload()` in `main.py`, filtered both the `settings_changed` event payload and returned `settings` dict in `Plugin.set_setting`, updated existing full-dict assertions in `tests/test_e2e_requirements.py` and `tests/test_pinned_playlists.py`, and added a dedicated test in `tests/test_soundtrack.py`.

### IN-05: `SoundtracksTab` `confirmDeleteAppId` stays active across card clicks and configured cards cannot collapse

**Files modified:** `src/components/tabs/SoundtracksTab.tsx`, `src/components/tabs/SoundtracksTab.test.tsx`
**Commit:** `03f5a88`
**Applied fix:** Added `collapsedAppIds` state after `confirmDeleteAppId` (preserving React hook slots 0–5), extracted `toggleGameCardExpand` and `clearCollapsedAppId` helpers so clicking any card header unconditionally clears `confirmDeleteAppId` while toggling collapse/expand for configured or running cards (and clearing `collapsedAppIds[appId]` on profile deletion), kept `SoundtracksTab.tsx` at 0 ESLint errors/warnings, and added unit tests covering cross-card delete confirmation reset, default-expanded card collapse/re-expand, and profile deletion cleanup.

---

_Fixed: 2026-11-19T12:39:25Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 2_
