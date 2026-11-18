# Phase 19: Per-Game EQ & Volume Profiles - Pattern Map

**Mapped:** 2026-11-18
**Files analyzed:** 20 (11 modified source files, 2 new source files, 6 modified test files, 1 new test file)
**Analogs found:** 20 / 20

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `py_modules/common.py` | config | file-I/O | `py_modules/common.py` (lines 40-49, 73-133, 258-276, 319-361) | exact |
| `py_modules/equalizer.py` | service | event-driven | `py_modules/equalizer.py` + `main.py` (lines 1259-1289) | exact |
| `py_modules/volume.py` | service | event-driven | `py_modules/volume.py` (lines 97-109, 208-396) | exact |
| `py_modules/soundtrack.py` | service | event-driven | `py_modules/soundtrack.py` + `py_modules/equalizer.py` (lines 51-66) | exact |
| `main.py` | controller | request-response | `main.py` (lines 143-181, 531-639, 834-1026, 1259-1289) | exact |
| `src/types.ts` | model | transform | `src/types.ts` (lines 38-45, 274-322, 354-367) | exact |
| `src/index.tsx` | component | event-driven | `src/index.tsx` (lines 75-90, 199-302, 898-927, 1246-1285) | exact |
| `src/components/DeckifyExpandedModal.tsx` | component | request-response | `src/components/DeckifyExpandedModal.tsx` (lines 92-116, 730-751, 1229-1239) | exact |
| `src/components/tabs/soundtrackUtils.ts` | utility | transform | `src/components/tabs/soundtrackUtils.ts` + `src/components/tabs/SettingsTab.tsx` (lines 23-44) | exact |
| `src/components/tabs/SoundtracksTab.tsx` | component | CRUD | `src/components/tabs/SoundtracksTab.tsx` (lines 49-149, 230-497) | exact |
| `src/components/tabs/SettingsTab.tsx` | component | CRUD | `src/components/tabs/SettingsTab.tsx` (lines 86-185, 482-674, 910-929, 1047-1079) | exact |
| `src/components/common/EqBandFaders.tsx` | component | transform | `src/components/tabs/SettingsTab.tsx` (lines 8-53, 149-154, 531-673) | exact |
| `src/components/tabs/GameEqModal.tsx` | component | request-response | `src/components/tabs/PlaylistPickerModal.tsx` + `src/components/tabs/SettingsTab.tsx` (lines 531-673) | exact |
| `tests/test_soundtrack.py` | test | event-driven | `tests/test_soundtrack.py` + `tests/test_volume.py` (lines 287-328) | exact |
| `tests/test_equalizer.py` | test | event-driven | `tests/test_equalizer.py` (lines 105-422) | exact |
| `tests/test_volume.py` | test | event-driven | `tests/test_volume.py` (lines 218-328) | exact |
| `src/components/tabs/SoundtracksTab.test.tsx` | test | component | `src/components/tabs/SoundtracksTab.test.tsx` (lines 1-353) | exact |
| `src/components/tabs/SettingsTab.test.tsx` | test | component | `src/components/tabs/SettingsTab.test.tsx` (lines 98-175, 539-656) | exact |
| `src/index.test.tsx` | test | event-driven | `src/index.test.tsx` (lines 20-38, 210-243) | exact |
| `src/components/tabs/GameEqModal.test.tsx` | test | component | `src/components/tabs/PlaylistPickerModal.test.tsx` + `src/components/tabs/SettingsTab.test.tsx` (lines 581-632) | exact |

## Pattern Assignments

### `py_modules/common.py` (config, file-I/O)

**Analog:** `py_modules/common.py` (self — runtime PID paths, `DEFAULT_SETTINGS`, `_load_settings` validation, `_save_settings`)

**Runtime PID path pattern** (`py_modules/common.py` lines 40-49):
```python
SETTINGS_FILE = os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, "settings.json")
LIBRESPOT_BIN = os.path.join(decky.DECKY_PLUGIN_DIR, "bin", "librespot")
CACHE_DIR = os.path.join(decky.DECKY_PLUGIN_RUNTIME_DIR, "cache")
LIBRESPOT_PID_FILE = os.path.join(decky.DECKY_PLUGIN_RUNTIME_DIR, "librespot.pid")
SPOTIFY_CLIENT_PID_FILE = os.path.join(decky.DECKY_PLUGIN_RUNTIME_DIR, "spotify_client.pid")
```
Add `EQ_PID_FILE = os.path.join(decky.DECKY_PLUGIN_RUNTIME_DIR, "eq.pid")` alongside `LIBRESPOT_PID_FILE` and `SPOTIFY_CLIENT_PID_FILE`.

**`DEFAULT_SETTINGS` entry pattern** (`py_modules/common.py` lines 86, 112-113):
```python
    "game_audio_profiles": {},
    ...
    "eq_preset": "flat",
    "eq_custom_bands": [0.0] * 10,
```
Add `"active_game_override_snapshot": None` to `DEFAULT_SETTINGS`.

**Settings load validation pattern** (`py_modules/common.py` lines 258-276, 319-327):
```python
        if merged.get("eq_preset") not in ("flat", "bass", "vocal", "gaming", "deck_speakers", "late_night", "custom"):
            merged["eq_preset"] = "flat"
...
        raw_expiry = merged.get("resilience_bookmark_expiry_hours", 12)
        if isinstance(raw_expiry, bool):
            merged["resilience_bookmark_expiry_hours"] = 12
        else:
            try:
                merged["resilience_bookmark_expiry_hours"] = max(1, min(24, int(raw_expiry)))
            except (TypeError, ValueError):
                merged["resilience_bookmark_expiry_hours"] = 12
```
Validate `active_game_override_snapshot` in `_load_settings()` as either `None` or a `dict` containing a positive non-bool `int` `app_id` (resetting invalid values to `None`), preserving atomic `_save_settings` JSON persistence (lines 349-361).

---

### `py_modules/equalizer.py` (service, event-driven)

**Analog:** `py_modules/equalizer.py` (self) + `main.py` lines 1259-1289 (PID file lifecycle)

**Imports pattern** (`py_modules/equalizer.py` lines 9-15):
```python
from py_modules.common import (
    _build_deck_command,
    _exec,
    _save_settings,
    decky,
)
from py_modules.engine import _set_pactl_sink_input
```
Extend import from `py_modules.common` with `EQ_PID_FILE` (or compute from `conf_path` dir / `EQ_PID_FILE`).

**Manager state initialization pattern** (`py_modules/equalizer.py` lines 212-226):
```python
    def __init__(self, plugin: Any, conf_path: str | None = None):
        self.plugin = plugin
        self.conf_path = conf_path or EQ_CONF_PATH
        self._process: subprocess.Popen | None = None
        self._node_id: int | None = None
        self._target_hardware_sink: str | None = None
        self._throttle_task: asyncio.Task | None = None
        self._save_task: asyncio.Task | None = None
        self._pending_bands: list[float] | None = None
        self._lock = asyncio.Lock()
```
Extend `__init__` with 3-layer state fields (`_ephemeral_preset: str | None = None`, `_ephemeral_bands: list[float] | None = None`, `_ephemeral_app_id: int | None = None`, `_ephemeral_app_name: str = ""`, `_preview_active: bool = False`, `pid_path`) and `@property def has_ephemeral_override(self) -> bool: return isinstance(self._ephemeral_preset, str) and self._ephemeral_preset in EQ_PRESETS` (the `isinstance(..., str)` guard prevents `MagicMock` truthiness bugs).

**True-bypass `flat` teardown & sink migration pattern** (`py_modules/equalizer.py` lines 377-406):
```python
    async def apply_preset(self, preset: str) -> dict:
        """Apply an EQ preset (flat performs true bypass teardown)."""
        if preset not in EQ_PRESETS:
            return {"ok": False, "error": f"Invalid eq_preset: {preset}"}

        async with self._lock:
            if preset == "flat":
                # Move librespot back to hardware sink BEFORE destroying deckify_eq_sink
                # so PipeWire does not cork/stop active playback during teardown.
                was_active = self.is_active
                if was_active:
                    await self._fallback_to_hardware_sink()
                    await asyncio.sleep(0.05)
                await self.stop()
                if not was_active:
                    await self._fallback_to_hardware_sink()
                return {"ok": True, "preset": "flat", "bypassed": True}

            bands = self._resolve_preset_bands(preset)
            if not self.is_active:
                start_res = await self._start_process(bands)
                if not start_res.get("ok"):
                    return start_res

            await self._apply_pw_cli_params(bands)
            await self._route_librespot_to_sink(EQ_SINK_NAME)
            if self._target_hardware_sink:
                await self._route_eq_output_to_sink(self._target_hardware_sink)
            return {"ok": True, "preset": preset, "bypassed": False}
```
Copy this exact `self._lock` + hardware-sink-before-stop ordering for `apply_ephemeral_preset()` and `clear_ephemeral_override()` (with `custom_bands` parameter on `_resolve_preset_bands(preset, custom_bands=None)` / `apply_preset(preset, custom_bands=None)`).

**75ms `pw-cli` coalescing & 500ms save debounce pattern** (`py_modules/equalizer.py` lines 407-447):
```python
        self._pending_bands = clamped
        if self._throttle_task is None or self._throttle_task.done():
            self._throttle_task = asyncio.create_task(self._throttled_pw_cli_flush())

        if self._save_task is not None and not self._save_task.done():
            self._save_task.cancel()
        self._save_task = asyncio.create_task(self._debounced_save_settings())
```
- `set_bands()` always updates `self.plugin._settings["eq_preset"] = "custom"`, `self.plugin._settings["eq_custom_bands"] = clamped`, and schedules `self._save_task`, returning early with `{"ok": True, "preset": "custom", "bands": clamped, "deferred_by_game_override": True}` if `self.has_ephemeral_override` is `True` (D-03).
- `preview_bands()` reuses `_start_process`, `_pending_bands = clamped`, and `_throttled_pw_cli_flush()` without touching `_settings` or `_save_task` (D-02).

**Stale PID file cleanup pattern** (`main.py` lines 1259-1289):
```python
    def _kill_stale_librespot(self):
        """Kill orphan librespot left by a previous plugin instance via PID file."""
        try:
            with open(LIBRESPOT_PID_FILE, "r") as f:
                old_pid = int(f.read().strip())
        except (FileNotFoundError, ValueError):
            return
        try:
            os.kill(old_pid, 0)  # check alive
        except (ProcessLookupError, OSError):
            self._clear_pid()
            return
        decky.logger.info("Killing stale librespot pid=%d", old_pid)
        try:
            os.kill(old_pid, 15)  # SIGTERM
        except ProcessLookupError:
            pass
        self._clear_pid()
```
Copy `_write_pid`, `_clear_pid`, and `cleanup_stale_process()` into `EqualizerManager` using `self.pid_path` (`EQ_PID_FILE`), calling `await self._fallback_to_hardware_sink()` before terminating any orphan `pipewire -c` PID.

**Mid-game `librespot` restart EQ routing pattern** (`py_modules/equalizer.py` lines 462-470):
```python
    async def route_librespot_to_eq(self) -> bool:
        """Ensure EQ is running for non-flat presets and route librespot into deckify_eq_sink."""
        preset = self.plugin._settings.get("eq_preset", "flat")
```
Update to check `self.has_ephemeral_override` first (`preset = self._ephemeral_preset if self.has_ephemeral_override else self.plugin._settings.get("eq_preset", "flat")`).

---

### `py_modules/volume.py` (service, event-driven)

**Analog:** `py_modules/volume.py` (self — `apply_equalizer_preset`, `VolumeFader._compute_target_sink_volume`, `set_ducking`, `start_sleep_fade`, `release_sleep_lock`, `_emit_state`)

**Global EQ preset helper pattern** (`py_modules/volume.py` lines 97-109):
```python
async def apply_equalizer_preset(plugin, preset: str) -> dict:
    """Apply, persist, and emit equalizer preset change."""
    decky.logger.info("Applying EQ preset: %s", preset)
    eq_mgr = getattr(plugin, "_equalizer_manager", None)
    res: dict = {"ok": True, "preset": preset}
    if eq_mgr is not None:
        res = await eq_mgr.apply_preset(preset)
        if isinstance(res, dict) and res.get("ok") is False:
            return res
    plugin._settings["eq_preset"] = preset
    _save_settings(plugin._settings)
    await decky.emit("eq_preset_changed", {"preset": preset})
    return res if isinstance(res, dict) else {"ok": True, "preset": preset}
```
Update to skip `await eq_mgr.apply_preset(preset)` when `getattr(eq_mgr, "has_ephemeral_override", False) is True`, while still persisting `plugin._settings["eq_preset"]` and emitting `"eq_preset_changed"` (D-03).

**Target sink volume calculation pattern** (`py_modules/volume.py` lines 272-292):
```python
    def _compute_target_sink_volume(self) -> float:
        """Compute target sink-input percentage from active ducking reasons and settings."""
        settings = getattr(self.plugin, "_settings", {})
        baseline_sink_vol = 150.0 if getattr(self.plugin, "_pa_volume_boosted", False) else 100.0
        if len(self._duck_reasons) == 0:
            return baseline_sink_vol

        mode = settings.get("ducking_mode", "proportional")
        if mode == "proportional":
            attenuation_pct = float(settings.get("ducking_proportional_pct", 50))
            factor = max(0.05, 1.0 - (attenuation_pct / 100.0))
        else:
            if "voice" in self._duck_reasons and "game" not in self._duck_reasons:
                fixed_vol = float(settings.get("voice_ducking_volume", 25))
            else:
                fixed_vol = float(settings.get("auto_ducking_volume", 25))
            base_spotify_vol = float(getattr(self.plugin, "_poll_volume", 80) or 80)
            factor = min(1.0, fixed_vol / max(1.0, base_spotify_vol))

        return baseline_sink_vol * factor
```
Extend with `self._game_override: dict | None` (`volume_override`, `ducking_override`, `ducking_level_override`), computing `ceiling_factor` (`0..100` -> `0.0..1.0`), `game_duck_factor` (custom attenuation `0..95` clamped to `>= 0.05` if set, else global proportional/fixed), and `min(in_game_factor, voice_factor)` when `"voice"` is in `self._duck_reasons`.

**Sleep-lock priority & fade pattern** (`py_modules/volume.py` lines 293-326):
```python
    async def set_ducking(self, active: bool, reason: str = "game") -> None:
        """Coordinate ducking state changes from game lifecycle or voice chat."""
        if active:
            self._duck_reasons.add(reason)
        else:
            self._duck_reasons.discard(reason)

        if self._sleep_locked:
            return
...
        target_sink_vol = self._compute_target_sink_volume()
        await self.fade_to(target_sink_vol, duration)
```
Copy this exact pattern in `apply_game_override()` and `clear_game_override()`: mutate `self._game_override` and `self._duck_reasons` (`add("game")` / `discard("game")`) first so `release_sleep_lock()` restores accurately, then `if self._sleep_locked: return` before fading (D-15). Also make `set_ducking(False, reason="game")` a no-op if `"game"` is already absent from `_duck_reasons` and `_game_override` is `None`.

**State emission pattern** (`py_modules/volume.py` lines 384-395):
```python
    async def _emit_state(self) -> None:
        baseline = 150.0 if getattr(self.plugin, "_pa_volume_boosted", False) else 100.0
        ratio = (self._current_sink_volume / baseline) if baseline > 0 else 1.0
        base_vol = getattr(self.plugin, "_poll_volume", 80) or 80
        effective_vol = max(0, min(100, int(round(base_vol * ratio))))

        await decky.emit("ducking_state_changed", {
            "is_ducked": self.is_ducked,
            "effective_volume": effective_vol,
            "base_volume": base_vol,
            "duck_reasons": list(self._duck_reasons),
        })
```
Add `"has_game_override": self._game_override is not None` to the emitted payload.

---

### `py_modules/soundtrack.py` (service, event-driven)

**Analog:** `py_modules/soundtrack.py` (self) + `py_modules/equalizer.py` lines 51-66 (`clamp_eq_bands`)

**Imports & defaults pattern** (`py_modules/soundtrack.py` lines 7-34):
```python
import asyncio
import random

from py_modules.common import _exec, _save_settings, decky
from py_modules.spotify import _spotify_api_request
...
_PROFILE_DEFAULTS = {
    ...
    "volume_override": None,
    "ducking_override": None,
    "last_track_uri": None,
    "last_context_uri": None,
    "last_position_ms": None,
}
```
Import `inspect` plus `EQ_PRESETS`, `clamp_eq_bands` from `py_modules.equalizer`, and add `"eq_preset": None`, `"eq_custom_bands": None`, `"ducking_level_override": None` to `_PROFILE_DEFAULTS`.

**Sanitization pattern** (`py_modules/soundtrack.py` lines 137-146):
```python
        if "volume_override" in data:
            vo = data["volume_override"]
            try:
                out["volume_override"] = None if vo is None else max(0, min(100, int(vo)))
            except (TypeError, ValueError):
                out["volume_override"] = None
        if "ducking_override" in data:
            do = data["ducking_override"]
            out["ducking_override"] = None if do is None else bool(do)
```
Copy this field-by-field sanitization for `"eq_preset"` (`None` if `None` or `"global"`, else lowercase in `EQ_PRESETS`), `"eq_custom_bands"` (`None` if `None`, else `clamp_eq_bands(val)` when `list`/`tuple`), and `"ducking_level_override"` (`None` if `None` or `isinstance(val, bool)`, else `max(0, min(95, int(val)))`). Reject `bool` in `volume_override` as well.

**Sequenced launch / exit & A->B snapshot preservation pattern** (`py_modules/soundtrack.py` lines 246-263, 288-394):
```python
    async def handle_app_lifecycle(self, app_id: int, running: bool) -> None:
        if running:
            self._cancel(self._exit_task)
            self._cancel(self._launch_task)
            self._exit_task = None
            self._active_game_app_id = app_id
            self._user_paused_in_game = False
            if self._pre_game_snapshot is None:
                state = await self.get_player_state()
                if state is not None:
                    self._pre_game_snapshot = state
                    self._playback_altered = False
            self._launch_task = asyncio.create_task(self._delayed_launch(app_id))
```
- Preserve `if self._pre_game_snapshot is None:` across A->B switches (D-12).
- In `_run_launch(app_id)` (lines 288-350): apply audio overrides (EQ -> `active_game_override_snapshot` persist -> `fader._cached_sink_input_id = None` -> `fader.apply_game_override(...)` -> emit `game_audio_override_changed`) **before** checking `playlists` / `soundtrack_unbound_policy` / `soundtrack_prompt_switch` early returns (D-09, D-10), and remove `self.plugin.set_volume(...)` at lines 345-350 and 364-368 (D-05).
- In `_run_exit(app_id)` (lines 352-394): restore global EQ via `eq_mgr.clear_ephemeral_override()` **first**, pop `active_game_override_snapshot` and `_persist()`, set `fader._cached_sink_input_id = None`, check `getattr(fader, "_sleep_locked", False) is True` (skipping `fader.clear_game_override()` AND skipping `play_tracks` / `_pause` restore when `True`, per D-15), and always clear `_active_game_app_id` / `_pre_game_snapshot` (D-13, D-16).
- Use `inspect.isawaitable(res)` before `await`ing optional mockable methods on `eq_mgr` and `fader` so `tests/test_soundtrack.py`'s `MagicMock` plugin doubles never fail with `TypeError`.

---

### `main.py` (controller, request-response)

**Analog:** `main.py` (self — `_main`, `start_librespot`, `get_status`, `save_game_soundtrack_profile`, `handle_app_lifetime_event`, `trigger_ducking`, `get_ducking_state`, `set_eq_bands`)

**Boot startup & crash recovery pattern** (`main.py` lines 160-181):
```python
        self._volume_fader = volume.VolumeFader(self)
        self._voice_detector = volume.VoiceActivityDetector(self, self._volume_fader)
        self._voice_detector.start()
        self._soundtrack_manager = soundtrack.SoundtrackManager(self)
        self._equalizer_manager = equalizer.EqualizerManager(self)
...
        await self.start_librespot()
        initial_eq = self._settings.get("eq_preset", "flat")
        if initial_eq != "flat":
            await self._equalizer_manager.apply_preset(initial_eq)
        await self._dock_switcher.evaluate_now()
```
In `_main()`: check `stale_snapshot = self._settings.get("active_game_override_snapshot")` and clean up any orphan `eq.pid` process; after `await self.start_librespot()`, if `stale_snapshot` exists and the frontend has not already reported that `app_id` as running (`self._soundtrack_manager._active_game_app_id != stale_app_id`), clear `active_game_override_snapshot`, call `await self._equalizer_manager.apply_preset(initial_eq)` even when `initial_eq == "flat"`, reset `self._volume_fader`, and fade cleanly to baseline (`fade_to(baseline, 0.0)`).

**Status & ducking state exposure pattern** (`main.py` lines 550-639, 913-922):
```python
    async def get_ducking_state(self) -> dict:
        """Return live ducking status and effective volume level."""
        if not hasattr(self, "_volume_fader") or not self._volume_fader:
            self._volume_fader = volume.VolumeFader(self)
        return {
            "is_ducked": self._volume_fader.is_ducked,
            "effective_volume": self._volume_fader.effective_volume,
            "base_volume": self._poll_volume or 80,
            "duck_reasons": list(self._volume_fader._duck_reasons),
        }
```
Add `"has_game_override": getattr(self._volume_fader, "_game_override", None) is not None` to `get_ducking_state()` and `trigger_ducking()`, and add `"active_game_app_id"` + `"active_game_override"` to `get_status()`.

**EQ RPC validation pattern** (`main.py` lines 1007-1026):
```python
    async def set_eq_bands(self, bands: list[float]) -> dict:
        """Update 10-band custom equalizer gains with live PipeWire updates."""
        if not isinstance(bands, list) or len(bands) != 10:
            return {"ok": False, "error": "bands must be a list of 10 numbers"}
        validated: list[float] = []
        for item in bands:
            if isinstance(item, bool) or not isinstance(item, (int, float)):
                return {"ok": False, "error": "All band gains must be numeric"}
            val = float(item)
            if val != val:
                return {"ok": False, "error": "Band gain cannot be NaN"}
            validated.append(round(max(-12.0, min(12.0, val)), 2))
        try:
            eq_mgr = getattr(self, "_equalizer_manager", None)
            if eq_mgr is None:
                return {"ok": False, "error": "EqualizerManager not initialized"}
            return await eq_mgr.set_bands(validated)
        except Exception as e:
            decky.logger.error("Failed to set EQ bands: %s", e)
            return {"ok": False, "error": str(e)}
```
Copy this exact validation helper for `preview_eq_bands(self, bands: list[float])` and add `clear_eq_preview(self)` (handling exceptions with `{"ok": False, "error": str(e)}`).

**Soundtrack RPC delegation & live refresh pattern** (`main.py` lines 851-911):
- In `handle_app_lifetime_event()` (lines 872-887): remove the immediate `await self.trigger_ducking(True, "game", valid_id)` call so ducking runs post-debounce inside `SoundtrackManager._run_launch` (D-10).
- In `trigger_ducking(False, "game")` (lines 895-911): skip if `SoundtrackManager._pending(manager._exit_task)` is pending `soundtrack_exit_debounce`.
- In `save_game_soundtrack_profile()` and `delete_game_soundtrack_profile()`: await `manager.refresh_active_overrides(valid_id)` when `valid_id == manager._active_game_app_id` and not pending exit (D-04, D-08).
- In `start_librespot()` (line 532): call `on_librespot_started()` whenever global `eq_preset != "flat"` OR `getattr(self._equalizer_manager, "has_ephemeral_override", False) is True`.

---

### `src/types.ts` (model, transform)

**Analog:** `src/types.ts` (self — `DuckingState`, `StatusResponse`, `SoundtrackProfile`, `ResilienceStatusInfo`)

**Interface extension pattern** (`src/types.ts` lines 274-279, 318-322, 354-367):
```typescript
export interface DuckingState {
  is_ducked: boolean;
  effective_volume: number;
  base_volume: number;
  duck_reasons: string[];
}
...
export interface StatusResponse {
  ...
  sleep_timer?: SleepTimerStatus;
  dock_status?: DockStatusInfo;
  resilience_status?: ResilienceStatusInfo;
  mpris_status?: MprisStatusInfo;
}
...
export interface SoundtrackProfile {
  app_id: number;
  app_name: string;
  playlists: SoundtrackPlaylist[];
  mode: SoundtrackMode;
  rotation_index: number;
  resume_mode: "remember_position" | "fresh_start";
  always_auto_start: boolean;
  exit_policy: "restore_snapshot" | "pause" | "keep_playing";
  volume_override: number | null;
  ducking_override: boolean | null;
  last_track_uri?: string;
  last_position_ms?: number;
}
```
Add `has_game_override?: boolean` to `DuckingState`; add `ActiveGameOverrideInfo` interface and `active_game_app_id?: number | null` + `active_game_override?: ActiveGameOverrideInfo | null` to `StatusResponse`; add `eq_preset?: EqualizerPreset | null`, `eq_custom_bands?: number[] | null`, and `ducking_level_override?: number | null` to `SoundtrackProfile`.

---

### `src/index.tsx` (component, event-driven)

**Analog:** `src/index.tsx` (self — `isDucked` / `effectiveVolume` state, `ducking_state_changed` listener, QAM volume `SliderField`)

**Ducking state subscription pattern** (`src/index.tsx` lines 199-201, 283-300):
```typescript
  const [isDucked, setIsDucked] = useState<boolean>(false);
  const [effectiveVolume, setEffectiveVolume] = useState<number | null>(null);
  const [activeGameAppId, setActiveGameAppId] = useState<number | null>(currentRunningAppId);
...
    backendGetDuckingState().then((state) => {
      if (state) {
        setIsDucked(Boolean(state.is_ducked));
        if (typeof state.effective_volume === "number") {
          setEffectiveVolume(state.effective_volume);
        }
      }
    }).catch(() => {});

    const unsubDucking = addEventListener<[any]>("ducking_state_changed", (data: any) => {
      if (!data) return;
      setIsDucked(Boolean(data.is_ducked));
      if (typeof data.effective_volume === "number") {
        setEffectiveVolume(data.effective_volume);
      }
    });
```
Add `hasGameOverride` state updated from `state.has_game_override` / `data.has_game_override` (and update `backendGetDuckingState` return type).

**QAM volume slider & badge pattern** (`src/index.tsx` lines 898-927):
```tsx
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Volume</span>
                {isDucked && (
                  <span
                    style={{
                      background: "#1db954",
                      color: "#000",
                      fontSize: 10,
                      fontWeight: 800,
                      padding: "2px 6px",
                      borderRadius: 4,
                      letterSpacing: "0.5px",
                    }}
                  >
                    DUCKED
                  </span>
                )}
              </div>
              <SliderField
                label=""
                value={isDucked && effectiveVolume != null ? effectiveVolume : volume}
                ...
```
Update display condition to `(isDucked || hasGameOverride) && effectiveVolume != null ? effectiveVolume : volume` and show `"DUCKED"` when `isDucked` or `"GAME VOL"` pill when `hasGameOverride && !isDucked`. Keep the `3000ms` `backendTriggerDucking(false, "game")` timer at lines 1274-1279 intact (backend guards pending `_exit_task`) so `src/index.test.tsx:210-243` remains valid.

---

### `src/components/DeckifyExpandedModal.tsx` (component, request-response)

**Analog:** `src/components/DeckifyExpandedModal.tsx` (self — `SettingsTab` status wiring + `playlistPickerOpen` suppression)

**Tab prop wiring & trigger suppression pattern** (`src/components/DeckifyExpandedModal.tsx` lines 749-751, 1229-1239):
```tsx
  useTriggerNavigation({
    enabled: triggerNavEnabled,
    suppressed: Boolean(actionTrack || showAddToPlaylistModal || actionCollection || playlistPickerOpen),
...
              {mode === "soundtracks" && (
                <SoundtracksTab showToast={showToast} onPickerOpenChange={setPlaylistPickerOpen} />
              )}

              {mode === "engine" && (
                <SettingsTab
                  status={status}
                  refreshStatus={refreshStatus}
                  showToast={showToast}
                />
              )}
```
Pass `runningAppId={status?.active_game_app_id ?? null}`, `globalEqPreset={status?.settings?.eq_preset ?? "flat"}`, `globalEqCustomBands={status?.settings?.eq_custom_bands}`, and `globalDuckingPct={status?.settings?.ducking_proportional_pct ?? 50}` to `SoundtracksTab` (keeping `onPickerOpenChange={setPlaylistPickerOpen}` so both `PlaylistPickerModal` and `GameEqModal` suppress `L1/R1/X/Y` triggers).

---

### `src/components/tabs/soundtrackUtils.ts` (utility, transform)

**Analog:** `src/components/tabs/soundtrackUtils.ts` (self) + `src/components/tabs/SettingsTab.tsx` lines 23-44 (preset labels)

**Options & immutable setter pattern** (`src/components/tabs/soundtrackUtils.ts` lines 8-41, 92-109):
```typescript
export const MODE_OPTIONS: { data: SoundtrackMode; label: string }[] = [
  { data: "shuffle", label: "Multi-playlist Shuffle" },
  { data: "random", label: "Random Picker at Launch" },
  { data: "rotation", label: "Sequential Rotation" },
];
...
export function defaultProfile(game: Pick<InstalledGame, "app_id" | "name">): SoundtrackProfile {
  return {
    app_id: game.app_id,
    app_name: game.name,
    playlists: [],
    mode: "shuffle",
    rotation_index: 0,
    resume_mode: "remember_position",
    always_auto_start: false,
    exit_policy: "restore_snapshot",
    volume_override: null,
    ducking_override: null,
  };
}
...
export function setVolumeOverride(
  profile: SoundtrackProfile,
  value: number | null,
): SoundtrackProfile {
  if (value === null) return { ...profile, volume_override: null };
  return { ...profile, volume_override: Math.max(0, Math.min(100, Math.round(value))) };
}
```
Add `EQ_OVERRIDE_OPTIONS` (`Use Global` with `data: "global"` + the 7 presets), `EQ_PRESET_LABELS`, default `eq_preset: null`, `eq_custom_bands: null`, `ducking_level_override: null` in `defaultProfile()`, immutable helpers `setEqPreset()`, `setEqCustomBands()`, `setDuckingLevelOverride()` (`0..95` clamp), and `formatGameProfileSubtitle(profile)` implementing D-11.

---

### `src/components/tabs/SoundtracksTab.tsx` (component, CRUD)

**Analog:** `src/components/tabs/SoundtracksTab.tsx` (self — `PlaylistPickerModal` modal opening, `DropdownItem`, `SliderField`, `ToggleField`, `SAVE_DEBOUNCE_MS`)

**Hook slot preservation & modal opening pattern** (`src/components/tabs/SoundtracksTab.tsx` lines 64-72, 130-149):
```tsx
  const [games, setGames] = useState<InstalledGame[]>(initialGames || []);
  const [profiles, setProfiles] = useState<Record<string, SoundtrackProfile>>(
    initialProfiles ? normalizeProfiles(initialProfiles) : {}
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedAppId, setExpandedAppId] = useState<number | null>(runningAppId ?? null);
  const [loading, setLoading] = useState(!initialGames);
...
  const openPlaylistPicker = useCallback(
    (game: InstalledGame) => {
      const key = String(game.app_id);
      onPickerOpenChange?.(true);
      showModal(
        <PlaylistPickerModal
          onClose={() => onPickerOpenChange?.(false)}
          onSelect={(item: SoundtrackPlaylist) => {
            ...
          }}
        />
      );
    },
    [scheduleSave, onPickerOpenChange]
  );
```
- **Preserve the exact order of the first 5 `useState` hooks** (`games`, `profiles`, `searchQuery`, `expandedAppId`, `loading`) because `SoundtracksTab.test.tsx:190` reads `stateValues[2]` for `searchQuery`.
- Mirror `openPlaylistPicker` in `openGameEqModal(game, profile)` using `onPickerOpenChange?.(true/false)` and `showModal(<GameEqModal ... />)`, saving immediately (cancelling pending timer for that `app_id` and calling `backendSaveProfile` right away) when the modal saves.

**Card subtitle & horizontal controls pattern** (`src/components/tabs/SoundtracksTab.tsx` lines 313-317, 389-497):
- Replace lines 313-317 with `{formatGameProfileSubtitle(profile)}` (D-11).
- Add an EQ section inside `<Focusable flow-children="horizontal">` with `DropdownItem` (`label="EQ Preset Override"`) and conditional `<DialogButton>` (`"Edit Game EQ"`) when `profile.eq_preset === "custom"` (D-01).
- Pair the existing `Volume Override` `SliderField` (lines 451-479) with a second `SliderField` for `Ducking Attenuation Override` (`min={0}`, `max={95}`, `step={5}`) plus `"Use Global Duck"` reset button when non-null (D-06).
- When `isRunning`, flush profile edits promptly / ensure `backendSaveProfile` triggers live `EqualizerManager` and `VolumeFader` refresh (D-04, D-08).

---

### `src/components/tabs/SettingsTab.tsx` (component, CRUD)

**Analog:** `src/components/tabs/SettingsTab.tsx` (self — Equalizer card lines 482-674 + header status badges lines 912-929 / 1047-1079)

**Header badge pattern** (`src/components/tabs/SettingsTab.tsx` lines 483-495, 912-929):
```tsx
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <FaSlidersH /> Equalizer & Audio Presets
          </h3>
          {localEqPreset === "flat" ? (
            <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.6 }}>Bypass (0.0 dB)</span>
          ) : (
            <span style={{ fontSize: 12, fontWeight: 700, color: "#1db954" }}>
              {`Preamp: ${(Math.max(0, ...localBands) > 0 ? -Math.max(0, ...localBands) : 0).toFixed(1)} dB`}
            </span>
          )}
        </div>
```
Read `status?.active_game_override` (and subscribe to `"game_audio_override_changed"` using the `addEventListener` pattern at lines 176-235). When an active game EQ override is running (`activeGameOverride?.eq_preset`), render an `"Active Game EQ Override"` badge inside the Equalizer card header (matching the `fontSize: 11-12, fontWeight: 700, borderRadius: 4` pill style) showing the active game name/preset, while keeping all preset pills and faders bound strictly to global `settings.eq_preset` / `eq_custom_bands` (D-03).

**Fader strip delegation:** Replace lines 531-673 with a direct function call `renderEqBandFaders({ bands: localBands, onBandChange: handleBandChange })` imported from `../common/EqBandFaders` (NOT `<EqBandFaders />` as a JSX tag — calling `renderEqBandFaders(...)` keeps the shallow JSX element tree intact so `SettingsTab.test.tsx:587` continues finding all 10 `role="slider"` nodes).

---

### `src/components/common/EqBandFaders.tsx` (component, transform)

**Analog:** `src/components/tabs/SettingsTab.tsx` (lines 8-21, 37-53, 149-154, 531-673)

**Exact constants & normalization to extract** (`src/components/tabs/SettingsTab.tsx` lines 8-21, 37-53):
```typescript
export const EQ_BAND_LABELS = [
  "31 Hz", "62 Hz", "125 Hz", "250 Hz", "500 Hz",
  "1 kHz", "2 kHz", "4 kHz", "8 kHz", "16 kHz",
];

export const EQ_SHORT_LABELS = ["31", "62", "125", "250", "500", "1k", "2k", "4k", "8k", "16k"];

export const EQ_PRESET_CURVES: Record<Exclude<EqualizerPreset, "custom">, number[]> = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  bass: [5, 6, 4.5, 2, 0, 0, 0.5, 1, 1.5, 1],
  vocal: [-2, -1.5, -1, 0, 1.5, 3.5, 4.5, 3.5, 1.5, 0],
  gaming: [2.5, 2, 0.5, -2.5, -3.5, -3, -1.5, 1, 2.5, 2],
  deck_speakers: [0, 1.5, 4, 2.5, -2, 0, 1.5, 3, 3.5, 2],
  late_night: [4, 3.5, 2, 0, -0.5, -1, -1.5, -1, 2, 3],
};

export function normalizeEqBands(bands?: unknown): number[] {
  if (!Array.isArray(bands)) return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  return Array.from({ length: 10 }, (_, idx) => {
    const raw = Number(bands[idx]);
    if (!Number.isFinite(raw)) return 0;
    return Math.min(12, Math.max(-12, Math.round(raw * 2) / 2));
  });
}
```
Export `renderEqBandFaders({ bands, onBandChange }: EqBandFadersProps)` containing the exact `<Focusable flow-children="horizontal">` + per-band `<Focusable flow-children="column">` + `Increase ${label}` / `Decrease ${label}` `InteractiveRow` steppers + `<div role="slider" aria-label={label} aria-valuemin={-12} aria-valuemax={12} aria-valuenow={gain} ...>` pointer handler from `SettingsTab.tsx:531-673` (plus an optional `EqBandFaders: FC<EqBandFadersProps>` wrapper). Keep function complexity/line count within ESLint limits (`max-lines-per-function <= 80`) by splitting a single-band renderer `renderSingleEqBand(...)` if needed!

---

### `src/components/tabs/GameEqModal.tsx` (component, request-response)

**Analog:** `src/components/tabs/PlaylistPickerModal.tsx` (lines 1-38, 101-111, 168-218) + `src/components/tabs/SettingsTab.tsx` (lines 531-673 via `renderEqBandFaders`)

**Imports & RPC pattern** (`src/components/tabs/PlaylistPickerModal.tsx` lines 1-18):
```typescript
import { FC, useState, useEffect, useRef } from "react";
import { Focusable, ModalRoot, DialogButton } from "@decky/ui";
import { callable } from "@decky/api";
import { FaSlidersH, FaTimes } from "react-icons/fa";
import { EqualizerPreset } from "../../types";
import { InteractiveRow } from "../common/InteractiveRow";
import { EQ_PRESET_CURVES, normalizeEqBands, renderEqBandFaders } from "../common/EqBandFaders";
```
Declare `backendPreviewEqBands = callable<[number[]], { ok: boolean; error?: string }>("preview_eq_bands")` and `backendClearEqPreview = callable<[], { ok: boolean }>("clear_eq_preview")`.

**Modal props & close-handling pattern** (`src/components/tabs/PlaylistPickerModal.tsx` lines 22-38, 101-111, 168-193):
```tsx
export interface GameEqModalProps {
  isOpen?: boolean;
  gameName: string;
  initialBands?: number[] | null;
  seedBands?: number[];
  isRunningGame?: boolean;
  onSave: (bands: number[]) => void;
  onClose?: () => void;
  closeModal?: () => void;
}
...
  if (!isOpen) return null;

  const handleClose = () => {
    closeModal?.();
    onClose?.();
  };
...
  return (
    <ModalRootAny onCancel={handleClose} closeModal={handleClose}>
      <Focusable flow-children="column" style={{ padding: 16, minWidth: 520, maxWidth: "92vw", ... }}>
        ...
      </Focusable>
    </ModalRootAny>
  );
```
- Seed initial state from `initialBands` (if 10-element array present on profile) else `seedBands` (user's active/global curve) via `normalizeEqBands` (D-02).
- Provide `"Copy from Preset"` pills (`Flat` / `Bass Boost` / `Vocal Clarity` / `Gaming Balance` / `Deck Speakers` / `Late Night` + `"Reset Flat"`) inside `<Focusable flow-children="horizontal">` using `InteractiveRow` or `DialogButton` (D-02).
- Render `renderEqBandFaders({ bands, onBandChange })`, triggering `backendPreviewEqBands(nextBands)` on every step/drag/preset-copy.
- On Cancel / `onCancel` / unmount when not saved (`savedRef.current === false`), call `backendClearEqPreview().catch(() => {})` if `!isRunningGame` (or unconditionally restore if cancelled) so non-running games restore active EQ cleanly on close (D-02). On `Save EQ`, set `savedRef.current = true`, call `onSave(bands)`, and close.

---

### `tests/test_soundtrack.py` (test, event-driven)

**Analog:** `tests/test_soundtrack.py` (self) + `tests/test_volume.py` lines 287-328 (`_sleep_locked`)

**Plugin test double & assertions pattern** (`tests/test_soundtrack.py` lines 22-38, 208-217, 312-337):
```python
def make_plugin():
    settings = dict(common.DEFAULT_SETTINGS)
    settings["game_audio_profiles"] = {}
    settings["soundtrack_launch_debounce"] = 0.05
    settings["soundtrack_exit_debounce"] = 0.05
    return SimpleNamespace(
        _settings=settings,
        _ensure_token=AsyncMock(return_value="tok"),
        _auto_transfer_and_play=AsyncMock(return_value={"ok": True}),
        _save_settings=MagicMock(),
        _volume_fader=MagicMock(),
        play_tracks=AsyncMock(return_value={"ok": True}),
        control_playback=AsyncMock(return_value={"ok": True}),
        set_shuffle=AsyncMock(return_value={"ok": True}),
        set_volume=AsyncMock(return_value={"ok": True}),
    )
```
Update `make_plugin()` with async/real or mockable `_volume_fader` (`apply_game_override=AsyncMock()`, `clear_game_override=AsyncMock()`, `_sleep_locked=False`) and `_equalizer_manager` (`apply_ephemeral_preset=AsyncMock()`, `clear_ephemeral_override=AsyncMock()`). Update the 3 pre-Phase-19 tests (`test_volume_override_applied_and_reverted` lines 208-217 -> verify `fader.apply_game_override` / `clear_game_override` called and `set_volume` NOT called per D-05; `test_lifecycle_event_routes_and_ducks` lines 312-320 and `test_ducking_override_false_skips_duck` lines 321-328 -> verify immediate `trigger_ducking` is NOT called at `t=0` and ducking routes via `_run_launch` per D-10), plus add tests for D-01..D-16 (`_sanitize_profile`, audio-only profiles, A->B switch snapshot preservation, `_sleep_locked` exit protection, live hot-apply, `_main()` crash recovery).

---

### `tests/test_equalizer.py` (test, event-driven)

**Analog:** `tests/test_equalizer.py` (self — `TestCommonSettingsEQ`, `TestEqualizerManager`, `TestMainEqualizerIntegration`)

**Mock `subprocess.Popen` / `subprocess.run` pattern** (`tests/test_equalizer.py` lines 147-225, 322-335):
```python
        with patch("subprocess.Popen", return_value=fake_proc) as mock_popen, \
             patch("subprocess.run", side_effect=fake_run) as mock_run:
            res = await self.mgr.apply_preset("bass")
```
Extend `TestEqualizerManager` and `TestMainEqualizerIntegration` following this exact `fake_run` / `patch.object(equalizer, "_save_settings")` style for `apply_ephemeral_preset`, `clear_ephemeral_override`, `preview_bands`, `clear_preview`, `SettingsTab` global isolation (`apply_equalizer_preset` & `set_bands` while `has_ephemeral_override` is `True`), `route_librespot_to_eq` preserving active game EQ, and `eq.pid` stale process cleanup.

---

### `tests/test_volume.py` (test, event-driven)

**Analog:** `tests/test_volume.py` (self — `test_calculation_mode_fixed_vs_proportional`, `test_emit_state`, `test_sleep_lock_blocks_ducking_fades_and_tracks_reasons`)

**State emission assertion pattern** (`tests/test_volume.py` lines 250-263):
```python
        with patch.object(volume.decky, "emit", new_callable=AsyncMock) as mock_emit:
            await self.fader._emit_state()
            mock_emit.assert_called_once_with("ducking_state_changed", {
                "is_ducked": True,
                "effective_volume": 40,  # 80 * (50/100) = 40
                "base_volume": 80,
                "duck_reasons": ["game"],
            })
```
Update `test_emit_state` to include `"has_game_override": False` and add tests for `apply_game_override` / `clear_game_override`, ceiling + custom attenuation + `ducking_override=False` + `"voice"` VAD minimum calculation, `has_game_override=True` emission, and `_sleep_locked` protection.

---

### `src/components/tabs/SoundtracksTab.test.tsx` (test, component)

**Analog:** `src/components/tabs/SoundtracksTab.test.tsx` (self)

**Slider & mock test pattern** (`src/components/tabs/SoundtracksTab.test.tsx` lines 214-245):
```typescript
    const sliders = findNodes(tree, (n) => typeName(n) === "SliderField");
    expect(sliders).toHaveLength(1);
    sliders[0].props.onChange(45);
```
Update line 221 to find `"Volume Override"` and `"Ducking Attenuation Override"` sliders by `n.props?.label` rather than `expect(sliders).toHaveLength(1)` (since there are now 2 sliders per expanded card), and add tests for the EQ preset `DropdownItem`, conditional `"Edit Game EQ"` button opening `GameEqModal`, `onPickerOpenChange` wiring, D-11 subtitle formatting (with playlists vs audio-only), and live hot-apply when `runningAppId` matches.

---

### `src/components/tabs/SettingsTab.test.tsx` (test, component)

**Analog:** `src/components/tabs/SettingsTab.test.tsx` (self — lines 98-129 `findNodes`/`findText`, lines 539-656 `Equalizer & Audio Presets`)

**Shallow JSX slider test pattern** (`src/components/tabs/SettingsTab.test.tsx` lines 581-595):
```typescript
    const sliders = findNodes(tree, (n) => n.props?.role === "slider");
    const expectedLabels = ["31 Hz", "62 Hz", "125 Hz", "250 Hz", "500 Hz", "1 kHz", "2 kHz", "4 kHz", "8 kHz", "16 kHz"];
    expect(sliders.length).toBe(10);
```
Add tests inside `describe("Equalizer & Audio Presets", ...)` verifying `"Active Game EQ Override"` badge visibility when `status.active_game_override` is present and verifying global `set_setting("eq_preset", ...)` / `set_eq_bands(...)` remain editable while the badge is shown (D-03).

---

### `src/index.test.tsx` (test, event-driven)

**Analog:** `src/index.test.tsx` (self — lines 20-38 mocks, lines 210-243 fake timer exit test)

**Mock callable & event test pattern** (`src/index.test.tsx` lines 20-38):
```typescript
  callable: (name: string) => {
    if (name === "handle_app_lifetime_event") return (...args: any[]) => mockHandleAppLifetimeEvent(...args);
    if (name === "trigger_ducking") return (...args: any[]) => mockTriggerDucking(...args);
    ...
    if (name === "get_ducking_state") return (...args: any[]) => mockGetDuckingState(...args);
```
Add tests verifying QAM volume slider displays `effective_volume` and `"GAME VOL"` badge when `has_game_override: true` and `is_ducked: false` (D-08).

---

### `src/components/tabs/GameEqModal.test.tsx` (test, component)

**Analog:** `src/components/tabs/PlaylistPickerModal.test.tsx` (lines 1-114 mock setup + `findNodes`/`findText`) + `src/components/tabs/SettingsTab.test.tsx` (lines 581-632 10-band slider assertions)

**Modal mock & callable stub pattern** (`src/components/tabs/PlaylistPickerModal.test.tsx` lines 7-68):
```typescript
vi.mock("@decky/api", () => ({
  callable: (name: string) => {
    if (name === "preview_eq_bands") return (...args: any[]) => mockPreviewEqBands(...args);
    if (name === "clear_eq_preview") return (...args: any[]) => mockClearEqPreview(...args);
    return vi.fn().mockResolvedValue({ ok: true });
  },
}));
...
vi.mock("@decky/ui", () => ({
  ModalRoot: ({ children, ...props }: any) => ({ type: "ModalRoot", props: { children, ...props } }),
  Focusable: ({ children, ...props }: any) => ({ type: "Focusable", props: { children, ...props } }),
  DialogButton: ({ children, ...props }: any) => ({ type: "DialogButton", props: { children, ...props } }),
}));
```
Verify seeding from `initialBands` vs `seedBands`, `"Copy from Preset"` & `"Reset Flat"`, all 10 `role="slider"` controls (`-12`..`+12`), `preview_eq_bands` invocation on band/preset changes, `clear_eq_preview` on Cancel/`onCancel` when `!isRunningGame`, and `onSave(bands)` + close on Save.

---

## Shared Patterns

### Process/Subprocess Isolation & UID 1000 Privilege Drop
**Source:** `py_modules/common.py` (lines 38, 388-408) & `py_modules/equalizer.py` (lines 235-238)
**Apply to:** `py_modules/equalizer.py`, `py_modules/volume.py`, `main.py`
```python
# py_modules/common.py:38
os.environ.pop("LD_LIBRARY_PATH", None)

# py_modules/equalizer.py:235-238
    def _deck_cmd(self, args: list[str]) -> tuple[list[str], dict]:
        cmd, env = _build_deck_command(args)
        env.pop("LD_LIBRARY_PATH", None)
        return cmd, env
```
Never invoke `shell=True`; always pass `list[str]` arguments through `_deck_cmd(...)` / `_build_deck_command(...)` inside `_exec(..., timeout=...)`.

### PipeWire UI Stream Isolation
**Source:** `py_modules/engine.py` (lines 147-219) & `py_modules/volume.py` (lines 231-252)
**Apply to:** `py_modules/equalizer.py`, `py_modules/volume.py`, `py_modules/soundtrack.py`
Always discover player sink-inputs via `resolve_spotify_sink_input_ids()` / `VolumeFader.resolve_sink_input_id()` / `EqualizerManager._route_librespot_to_sink()` so `steamwebhelper`, `Chromium`, and game streams are strictly excluded. Invalidate `VolumeFader._cached_sink_input_id = None` whenever `EqualizerManager` moves `librespot` into or out of `deckify_eq_sink` (D-10, D-16).

### Backend RPC Error Handling & Input Validation
**Source:** `py_modules/soundtrack.py` (lines 49-59, 158-180) & `main.py` (lines 851-887, 1007-1026)
**Apply to:** `main.py`, `py_modules/soundtrack.py`, `py_modules/equalizer.py`
Validate all RPC inputs at the boundary (`validate_app_id`, `EQ_PRESETS` allowlist, `isinstance(x, bool)` exclusion before `int()`, NaN guard via `val != val`, range clamping) and wrap async calls in `try/except` returning structured `{"ok": False, "error": str(e)}` dicts.

### SteamOS GamepadUI Spatial Navigation & Modal Focus Suppression
**Source:** `src/components/DeckifyExpandedModal.tsx` (lines 748-751) & `src/components/tabs/SoundtracksTab.tsx` (lines 130-149)
**Apply to:** `src/components/common/EqBandFaders.tsx`, `src/components/tabs/GameEqModal.tsx`, `src/components/tabs/SoundtracksTab.tsx`, `src/components/tabs/SettingsTab.tsx`
Every horizontal strip of buttons/pills/sliders MUST use `flow-children="horizontal"` (never `flow-children="row"`). Opening any `showModal(...)` editor from `SoundtracksTab` MUST call `onPickerOpenChange?.(true)` on open and `onPickerOpenChange?.(false)` on close so `DeckifyExpandedModal`'s `useTriggerNavigation` suppresses `L1`/`R1`/`X`/`Y` behind the modal.

### Custom Shallow-JSX-Tree React Testing Convention
**Source:** `src/components/tabs/SettingsTab.test.tsx` (lines 98-116, 581-595) & `src/components/tabs/SoundtracksTab.test.tsx` (lines 63-110, 189-190)
**Apply to:** `src/components/common/EqBandFaders.tsx`, `src/components/tabs/SettingsTab.tsx`, `src/components/tabs/SoundtracksTab.tsx`, `src/components/tabs/GameEqModal.test.tsx`
Frontend unit tests mock `react` (`useState`/`useRef`) and inspect the shallow JSX object tree via `findNodes(tree, ...)` without invoking child function components. Therefore:
1. Invoke shared fader strip via plain function `renderEqBandFaders(...)` in `SettingsTab.tsx` (and `GameEqModal.tsx`), not only as `<EqBandFaders />` JSX.
2. Keep existing `useState` declaration order at the top of `SoundtracksTab.tsx` (`games`, `profiles`, `searchQuery`, `expandedAppId`, `loading`).

### `MagicMock` Truthiness & Optional `AsyncMock` Guarding
**Source:** `tests/test_soundtrack.py` (line 32) & `tests/test_equalizer.py` (line 323)
**Apply to:** `py_modules/soundtrack.py`, `py_modules/volume.py`, `py_modules/equalizer.py`, `main.py`
Use explicit type/identity checks (`isinstance(getattr(eq_mgr, "_ephemeral_preset", None), str)`, `getattr(eq_mgr, "has_ephemeral_override", False) is True`, `getattr(fader, "_sleep_locked", False) is True`) and `if inspect.isawaitable(res): await res` when calling optional methods across managers so existing `MagicMock`-based test suites remain safe.

---

## No Analog Found

All 20 files to be created or modified have exact in-repo analogs (either self-modification analogs or direct UI/test extraction templates):

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| — | — | — | None — all new and modified files map to verified codebase analogs |

## Metadata

**Analog search scope:** `main.py`, `py_modules/`, `src/`, `tests/`
**Files scanned:** 20 target/analog source and test files + `eslint.config.js`, `src/hooks/usePlaybackStatus.ts`, `src/components/common/InteractiveRow.tsx`, `src/components/common/imagePipeline.ts`, `src/components/DeckifyExpandedModal.test.tsx`, `tests/test_e2e_requirements.py`
**Pattern extraction date:** 2026-11-18
