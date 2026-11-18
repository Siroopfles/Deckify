# Phase 14: Gentle Sleep Timer Fade-Out - Research

**Researched:** 2026-11-16
**Domain:** Python `asyncio` volume fading (`VolumeFader` + PipeWire `pactl`), sleep timer orchestration (`py_modules/system.py`), and Decky React settings UI (`SettingsTab.tsx`)
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** For timed sleep timers with fade-out enabled, begin fading early at `T - fade_duration` so playback reaches 0% and pauses right when the timer hits `T` (`_sleep_timer_end`). (If total remaining duration is shorter than `fade_duration`, begin fading immediately.)
- **D-02:** "End of Track" mode (`end_of_track=True`) pauses playback immediately when the track finishes without fading out, preserving the full track outro.
- **D-03:** Expose sleep timer fade-out configuration inside `SettingsTab`'s existing Backend Sleep Timer card using a Toggle (enable/disable fade-out) + `SliderField` (`5s–120s`, step `5s`, default `30s`), persisted in `settings.json` (`sleep_timer_fade_enabled`, `sleep_timer_fade_duration`). Keep QAM compact without adding sleep timer fade controls there.
- **D-04:** When the user cancels or resets the sleep timer mid-fade, abort the sleep fade-out and perform a short `0.5s` fade back to the active target volume (respecting any active `"game"` or `"voice"` ducking reasons, or full baseline if none).

### the agent's Discretion
- **Sleep lock & ducking state machine:** Safest approach for `VolumeFader` while `"sleep"` priority lock is held — track incoming `"game"` / `"voice"` add/remove updates in `_duck_reasons` silently without interrupting the sleep fade-out, so mid-fade cancel or post-sleep recovery reflects current ducking state.
- **Audio drain & fading status UI:** Exact drain delay between `control_playback("pause")` and restoring baseline volume (e.g., ~1.0s–1.5s), and exposing `fading: boolean` on `SleepTimerStatus` so `SettingsTab` can display `"Fading out..."` during the fade window.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

## Project Constraints (from GEMINI.md)

- **SteamOS GamepadUI Navigation:** Controller focus relies on spatial navigation (`flow-children`, `@decky/ui`). Horizontal button rows must use `flow-children="horizontal"`.
- **PipeWire UI Stream Isolation:** Sink-input volume manipulation must strictly use `resolve_spotify_sink_input_ids` via `VolumeFader` (never touch `steamwebhelper` or `Chromium` streams; never break `module-stream-restore` persistence by leaving sink-input volume at `0%` on poweroff).
- **RPC Error Safety:** Backend RPC methods must never crash the main event loop (`try/except` with structured `{ "ok": False, "error": ... }` returns); frontend displays Decky toasts on failure and handles missing fields gracefully.
- **Code Style & Quality:** 2-space indentation with semicolons in TypeScript/TSX (`eslint src/`, `tsc --noEmit`), 4-space indentation in Python (`unittest` suite), no duplicate logic.
- **QAM Compactness:** Keep QAM (`src/index.tsx`) compact without adding sleep timer fade controls.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SLEEP-01 | When the sleep timer expires, Deckify smoothly fades playback volume down to 0% over a configurable fade-out window (default 30s) using `VolumeFader` with a `"sleep"` priority lock before pausing playback and restoring baseline volume after audio drain. | `VolumeFader` (`py_modules/volume.py:159-325`) priority-lock extension (`_sleep_locked`), `sleep_timer_worker` early fade at `T - fade_duration` (`py_modules/system.py:63-86`), 1.2s post-pause audio drain + baseline restoration prior to `shutdown_system`, `DEFAULT_SETTINGS` / `set_setting` / `public_keys` wiring (`py_modules/common.py`, `main.py`), and `SettingsTab` Toggle + `SliderField` (`src/components/tabs/SettingsTab.tsx:380-449`). |
</phase_requirements>

---

## Summary

Phase 14 integrates Deckify's existing `VolumeFader` (`py_modules/volume.py`) with its backend sleep timer (`py_modules/system.py`) and settings pipeline (`py_modules/common.py`, `main.py`, `src/components/tabs/SettingsTab.tsx`). All core building blocks already exist: `VolumeFader` performs non-blocking 50ms cosine-eased PipeWire sink-input fades via `pactl set-sink-input-volume` on `resolve_spotify_sink_input_ids()`, `sleep_timer_worker` manages the timed and end-of-track sleep loops, and `SettingsTab` already renders the Backend Sleep Timer card and `@decky/ui` `ToggleField`/`SliderField` controls.

The key engineering challenge is coordinating state transitions between `sleep_timer_worker` and `VolumeFader` without race conditions or audio pops. Specifically: (1) `VolumeFader.fade_to()` schedules `_fade_task` asynchronously and returns immediately, so `sleep_timer_worker` must await fade completion before calling `control_playback("pause")`; (2) PipeWire/librespot audio buffers require an explicit drain delay (~1.2s) after `control_playback("pause")` before restoring baseline volume, and baseline volume must be restored *before* `shutdown_system()` so PipeWire `module-stream-restore` does not persist `0%` across reboots; and (3) while `"sleep"` priority lock is active, `VolumeFader.set_ducking()` must still update `_duck_reasons` silently without triggering a ducking fade, so cancelling mid-fade cleanly fades back over `0.5s` to the true current target (ducked or full baseline).

**Primary recommendation:** Add explicit `"sleep"` priority-lock methods (`start_sleep_fade` and `release_sleep_lock`) and a shared `_compute_target_sink_volume()` helper to `VolumeFader`, drive the timed fade-out, pause, 1.2s drain, and pre-shutdown restore from `sleep_timer_worker`, and expose `sleep_timer_fade_enabled` + `sleep_timer_fade_duration` + `SleepTimerStatus.fading` through `common.py`, `main.py`, `types.ts`, and `SettingsTab.tsx`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Sleep timer countdown, fade trigger, pause, drain, and shutdown | API / Backend (`py_modules/system.py`) | — | Timer must survive UI close and SteamOS standby in Python `asyncio` |
| Cosine volume ramping, `"sleep"` priority lock, and `_duck_reasons` tracking | API / Backend (`py_modules/volume.py`) | Host Audio (PipeWire `pactl`) | Local PipeWire sink-input control is owned by `VolumeFader` |
| Setting persistence, validation, and `status.settings` exposure | API / Backend (`py_modules/common.py`, `main.py`) | — | `DEFAULT_SETTINGS` and `set_setting` are the single source of truth |
| Fade-out Toggle, Duration `SliderField`, and `"Fading out..."` indicator | Browser / Client (`src/components/tabs/SettingsTab.tsx`, `src/types.ts`) | — | Renders backend state and dispatches `set_setting` RPCs |

---

## Standard Stack

Phase 14 requires **no new external packages** (npm or PyPI). All functionality is built on the existing verified stack:

### Core
| Library / Module | Version / Location | Purpose | Why Standard |
|------------------|--------------------|---------|--------------|
| `VolumeFader` | `py_modules/volume.py:159-325` | 50ms cosine-eased PipeWire sink-input fading | Existing project fader with `resolve_spotify_sink_input_ids()` guardrails `[VERIFIED: py_modules/volume.py:159-325]` |
| `asyncio` | Python 3.11+ / 3.14 stdlib | Non-blocking timer loop, task cancellation, drain sleep | Existing backend event loop `[VERIFIED: py_modules/system.py:1]` |
| `@decky/ui` (`ToggleField`, `SliderField`) | `4.11.1` | SteamOS GamepadUI native toggle and slider controls | Existing `SettingsTab` UI primitives `[VERIFIED: package.json:29]` |
| `@decky/api` (`callable`) | `1.1.3` | Typed frontend-to-backend RPC (`set_setting`, `set_sleep_timer`) | Existing RPC bridge `[VERIFIED: src/components/tabs/SettingsTab.tsx:3,8,15]` |

---

## Architecture Patterns

### System Architecture & Data Flow

```text
SettingsTab.tsx
  ├── ToggleField (sleep_timer_fade_enabled) ──▶ backendSetSetting ──▶ main.py:set_setting ──▶ settings.json
  ├── SliderField (sleep_timer_fade_duration) ──▶ backendSetSetting ──▶ main.py:set_setting ──▶ settings.json
  └── Displays "Fading out..." when status.sleep_timer.fading === true

sleep_timer_worker (py_modules/system.py)
  ├── [end_of_track=True] ──▶ wait track change/stop ──▶ control_playback("pause") (no fade, D-02)
  └── [end_of_track=False]
        ├── Wait until remaining <= fade_duration (if fade_enabled) or remaining <= 0 (D-01)
        ├── [fade_enabled=True]:
        │     ├── plugin._sleep_timer_fading = True
        │     ├── await fader.start_sleep_fade(actual_fade)  ──▶ _sleep_locked=True, fade_to(0.0, actual_fade), await _fade_task
        │     ├── plugin._sleep_timer_fading = False
        │     ├── await plugin.control_playback("pause")
        │     ├── await asyncio.sleep(1.2)                   ──▶ PipeWire buffer drain
        │     └── await fader.release_sleep_lock(0.0, wait=True) ──▶ _sleep_locked=False, restore target sink vol
        ├── [CancelledError mid-fade (D-04)]:
        │     └── plugin._sleep_timer_fading = False; await fader.release_sleep_lock(0.5, wait=False)
        └── [shutdown_on_finish=True]:
              └── await plugin.shutdown_system()             ──▶ Runs AFTER baseline volume is restored
```

### Pattern 1: `VolumeFader` `"sleep"` Priority Lock & `_duck_reasons` State Machine
**What:** Extract the target volume calculation from `set_ducking` (`py_modules/volume.py:232-252`) into a shared `_compute_target_sink_volume(self) -> float` helper, and guard `set_ducking` with `self._sleep_locked: bool = False`.
**When to use:** Whenever `"game"` or `"voice"` ducking events arrive during an active sleep fade-out, or when sleep fade-out finishes/cancels.
**How it works:**
1. `set_ducking(active, reason)` **always** updates `self._duck_reasons` (`add(reason)` / `discard(reason)`).
2. If `self._sleep_locked` is `True`, `set_ducking` returns immediately without calling `self.fade_to(...)`.
3. `start_sleep_fade(duration_sec: float)`:
   - Sets `self._sleep_locked = True`.
   - Calls `await self.fade_to(0.0, duration_sec)`.
   - Awaits `self._fade_task` (if present and not done) so the caller blocks until volume actually reaches `0%`.
4. `release_sleep_lock(restore_duration: float = 0.0, wait: bool = False)`:
   - Sets `self._sleep_locked = False`.
   - Computes `target_vol = self._compute_target_sink_volume()` (respecting current `_duck_reasons`!).
   - Calls `await self.fade_to(target_vol, restore_duration)`.
   - If `wait` is `True` and `self._fade_task` is not done, awaits `self._fade_task` (used on normal completion before `shutdown_system()`).

### Pattern 2: Deterministic Cancellation in `set_sleep_timer`
**What:** In `py_modules/system.py:44-46`, `set_sleep_timer` currently cancels `plugin._sleep_timer_task` without awaiting it:
```python
# Current [VERIFIED: py_modules/system.py:44-46]:
if plugin._sleep_timer_task and not plugin._sleep_timer_task.done():
    plugin._sleep_timer_task.cancel()
    plugin._sleep_timer_task = None
```
Because `set_sleep_timer` is `async def`, awaiting the cancelled task inside `try ... except asyncio.CancelledError: pass` ensures `sleep_timer_worker`'s `CancelledError` handler (releasing `_sleep_locked` and starting the `0.5s` fade-back per D-04) runs deterministically *before* `set_sleep_timer` returns or starts a replacement timer.

### Pattern 3: Settings Persistence & Exposure Pipeline
Every new persistent setting in Deckify must be wired in **5 places** `[VERIFIED: py_modules/common.py:89-97,242-267; main.py:506-508,585-616; src/types.ts:183-189]`:
1. `DEFAULT_SETTINGS` in `py_modules/common.py`:
   - `"sleep_timer_fade_enabled": True`
   - `"sleep_timer_fade_duration": 30`
2. `_load_settings_impl` in `py_modules/common.py`:
   - Coerce `sleep_timer_fade_enabled` to `bool`
   - Clamp `sleep_timer_fade_duration` to `max(5, min(120, int(...)))` with fallback `30`
3. `public_keys` tuple in `main.py:get_status`:
   - Add `"sleep_timer_fade_enabled"`, `"sleep_timer_fade_duration"` so `status.settings` includes them.
4. `set_setting` in `main.py`:
   - Add `"sleep_timer_fade_enabled"` to the boolean `elif key in (...)` branch.
   - Add `elif key == "sleep_timer_fade_duration":` clamping `max(5, min(120, int(value)))` (or `5`–`120` with error return on `TypeError`/`ValueError`).
5. `EngineSettings` in `src/types.ts`:
   - Add `sleep_timer_fade_enabled?: boolean;` and `sleep_timer_fade_duration?: number;`.

### Anti-Patterns to Avoid
- **Calling `fade_to()` without awaiting `_fade_task`:** `VolumeFader.fade_to()` spawns a background task and returns immediately `[VERIFIED: py_modules/volume.py:265-267]`. Pausing immediately after `fade_to(0.0, 30.0)` would pause at 100% volume.
- **Restoring baseline volume before `control_playback("pause")` + drain:** Causes a loud audio pop from buffered PipeWire PCM frames.
- **Calling `shutdown_system()` before restoring baseline volume:** PipeWire's `module-stream-restore` persists sink-input volume across boots; leaving it at `0%` causes the next session to start muted.
- **Adding sleep fade controls to QAM (`src/index.tsx`):** Explicitly out of scope per D-03.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Volume ramping & PipeWire sink-input lookup | Custom `pactl` loop in `system.py` | `VolumeFader` (`py_modules/volume.py`) | Already implements 50ms `cosine_ease`, `resolve_spotify_sink_input_ids()` Steam/Chromium isolation, `_pa_volume_boosted` (150% vs 100%) handling, and `_emit_state()` |
| Settings persistence & validation | Direct JSON file I/O in `system.py` | `DEFAULT_SETTINGS` + `_load_settings_impl` + `main.py:set_setting` | Atomic save, startup sanitization, and automatic `settings_changed` / `status.settings` sync |

---

## Common Pitfalls

### Pitfall 1: `sleep_timer_worker` Overshooting Fade Start or Skipping Fade on Short Timers
**What goes wrong:** Using a fixed `await asyncio.sleep(1)` loop until `remaining <= fade_duration` can overshoot by up to 1s, and if `minutes` is set such that `remaining < fade_duration` (e.g., in tests or short custom timers), fading for the full `fade_duration` would delay pause past `T`.
**How to avoid:** Sleep `min(1.0, remaining - fade_duration)` when `fade_enabled` is True, and pass `actual_fade = max(0.0, min(fade_duration, plugin._sleep_timer_end - time.time()))` to `start_sleep_fade()`.

### Pitfall 2: Mock `Plugin` Instances in Existing Tests Missing `_volume_fader` or `_settings`
**What goes wrong:** Existing tests (`tests/test_features.py`, `tests/test_plugin_advanced.py`) test `set_sleep_timer` and `get_sleep_timer_status` with minimal setup. Accessing `plugin._volume_fader` or `plugin._settings` directly without `getattr` could raise `AttributeError` on lightweight mocks.
**How to avoid:** Always use `getattr(plugin, "_volume_fader", None)`, `getattr(plugin, "_settings", {})`, and `getattr(plugin, "_sleep_timer_fading", False)`.

### Pitfall 3: `SettingsTab` Missing `"Fading out..."` Feedback or Wrong Control Types
**What goes wrong:** `SettingsTab.tsx:387-391` currently renders `Remaining: X min` whenever `status?.sleep_timer?.active` is true. During the last 30s, `Math.ceil(remaining_seconds / 60)` shows `Remaining: 1 min` even while volume is fading out.
**How to avoid:** Expose `fading: bool` in `get_sleep_timer_status(plugin)` and `SleepTimerStatus` (`src/types.ts:219-224`), and render `"Fading out..."` in `SettingsTab.tsx` when `status?.sleep_timer?.fading` is true. Use `@decky/ui` `ToggleField` + `SliderField` (`min={5}`, `max={120}`, `step={5}`, `showValue`) inside the existing Backend Sleep Timer card (`src/components/tabs/SettingsTab.tsx:380-449`).

---

## Code Examples

### Verified Existing `VolumeFader` Pattern (`py_modules/volume.py:222-267`)
```python
# Source: py_modules/volume.py:222-267 [VERIFIED]
    async def set_ducking(self, active: bool, reason: str = "game") -> None:
        """Coordinate ducking state changes from game lifecycle or voice chat."""
        if active:
            self._duck_reasons.add(reason)
        else:
            self._duck_reasons.discard(reason)
        ...
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
```

### Verified Existing `SettingsTab` `ToggleField` + `SliderField` Pattern (`src/components/tabs/SettingsTab.tsx:817-845`)
```tsx
// Source: src/components/tabs/SettingsTab.tsx:817-845 [VERIFIED]
<ToggleField
  label="L2/R2 Trigger Navigation"
  description="Use L2/R2 triggers to seek in Now Playing/Lyrics and jump pages in lists"
  checked={localSettings.trigger_nav_enabled ?? status?.settings?.trigger_nav_enabled ?? true}
  onChange={async (val: boolean) => {
    showToast(val ? "L2/R2 trigger navigation enabled" : "L2/R2 trigger navigation disabled");
    await updateSetting("trigger_nav_enabled", val);
  }}
/>
<SliderField
  label="Seek Step (Seconds)"
  min={5}
  max={30}
  step={5}
  showValue
  value={localSettings.trigger_seek_seconds ?? status?.settings?.trigger_seek_seconds ?? 10}
  onChange={async (val: number) => {
    const clamped = Math.min(30, Math.max(5, val));
    await updateSetting("trigger_seek_seconds", clamped);
  }}
/>
```

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js + pnpm | Frontend build, `tsc`, `eslint`, `vitest` | ✓ | Vitest 5.1.0 | — |
| Python 3 | Backend `unittest` suite | ✓ | Python 3.14 (`C:\Users\djdje\AppData\Local\Python\bin\python3.exe`) | — |
| `pactl` / PipeWire | Live sink-input volume fades on SteamOS | ✗ (Windows dev host) | — | Mocked via `unittest.mock.patch` in `tests/test_volume.py` |

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Python Framework | `unittest` (stdlib) + `IsolatedAsyncioTestCase` |
| Frontend Framework | Vitest `5.1.0` |
| Python Quick Run | `python3 -m unittest discover -s tests -p "test_volume.py"` (and `"test_features.py"`) |
| Python Full Suite | `pnpm run test:python` (`python3 -m unittest discover -s tests -p "test_*.py"`) |
| Frontend Quick Run | `pnpm test -- --run src/components/tabs/SettingsTab.test.tsx` |
| Frontend Full Suite | `pnpm test` (`vitest run`) + `pnpm run typecheck` + `pnpm run lint` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SLEEP-01 | `VolumeFader` `"sleep"` priority lock blocks `set_ducking` fades while tracking `_duck_reasons`, and `release_sleep_lock` restores ducked or full baseline | unit | `python3 -m unittest discover -s tests -p "test_volume.py"` | ✅ Extend `tests/test_volume.py` |
| SLEEP-01 | `sleep_timer_worker` starts fade at `T - fade_duration`, pauses at `0%`, drains `~1.2s`, restores baseline before `shutdown_system`, skips fade on `end_of_track=True` or `fade_enabled=False`, and aborts with `0.5s` restore on mid-fade cancel | unit | `python3 -m unittest discover -s tests -p "test_features.py"` | ✅ Extend `tests/test_features.py` (or new `tests/test_sleep_timer.py`) |
| SLEEP-01 | `DEFAULT_SETTINGS`, `_load_settings_impl`, `get_status().settings`, and `set_setting` validate/clamp `sleep_timer_fade_enabled` and `sleep_timer_fade_duration` (`5–120`) | unit | `python3 -m unittest discover -s tests -p "test_features.py"` | ✅ Extend `tests/test_features.py` |
| SLEEP-01 | `SettingsTab` renders Fade Out `ToggleField`, `SliderField` (`5–120`, step `5`), persists via `set_setting`, and displays `"Fading out..."` when `sleep_timer.fading` is true | unit | `pnpm test -- --run src/components/tabs/SettingsTab.test.tsx` | ✅ Extend `src/components/tabs/SettingsTab.test.tsx` |

### Sampling Rate
- **Per task commit:** Relevant targeted suite (`test_volume.py`, `test_features.py`, or `SettingsTab.test.tsx`)
- **Per wave merge:** `pnpm test`, `pnpm run typecheck`, `pnpm run lint`, and `pnpm run test:python`
- **Phase gate:** Full Python + Vitest + typecheck + lint green before `/gsd-verify-work`

### Wave 0 Gaps
None — existing test infrastructure (`tests/test_volume.py`, `tests/test_features.py`, `src/components/tabs/SettingsTab.test.tsx`) covers all phase requirements once extended with Phase 14 test cases.

---

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes | Clamp `sleep_timer_fade_duration` (`5–120`) and coerce `sleep_timer_fade_enabled` (`bool`) in `main.py:set_setting` and `py_modules/common.py:_load_settings_impl`; `VolumeFader._apply_sink_volume` already enforces numeric `sink_input_id` and `0–150%` volume clamp `[VERIFIED: py_modules/volume.py:206-209]`. |
| V6 Cryptography | no | — |

---

## Sources

### Primary (HIGH confidence)
- `py_modules/system.py:14-104` — `get_sleep_timer_status`, `set_sleep_timer`, `sleep_timer_worker`, `shutdown_system`
- `py_modules/volume.py:153-325` — `cosine_ease`, `VolumeFader`, `set_ducking`, `fade_to`, `_execute_fade`, `_emit_state`
- `py_modules/common.py:70-115,242-269` — `DEFAULT_SETTINGS`, `_load_settings_impl`
- `main.py:103-198,490-630,845-858` — `Plugin` sleep timer fields, `_unload`, `get_status` `public_keys`, `set_setting`, sleep timer RPCs
- `src/types.ts:154-248` — `EngineSettings`, `SleepTimerStatus`, `StatusResponse`
- `src/components/tabs/SettingsTab.tsx:1-90,380-450,537-596,812-858` — Backend Sleep Timer card, `ToggleField` & `SliderField` patterns
- `tests/test_volume.py`, `tests/test_features.py`, `tests/test_plugin_advanced.py`, `src/components/tabs/SettingsTab.test.tsx`, `package.json` — Verified test infrastructure and commands

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 100% existing in-repo modules and verified test runners
- Architecture: HIGH — all integration points (`VolumeFader`, `sleep_timer_worker`, `set_setting`, `SettingsTab`) read directly
- Pitfalls: HIGH — async task awaiting, PipeWire drain/stream-restore ordering, and mock safety directly observed in source

**Research date:** 2026-11-16
**Valid until:** 2026-12-16 (30 days; stable internal architecture)
