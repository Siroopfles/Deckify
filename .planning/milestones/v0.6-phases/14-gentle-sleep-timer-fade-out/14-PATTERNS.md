# Phase 14: Gentle Sleep Timer Fade-Out - Pattern Map

**Mapped:** 2026-11-16
**Files analyzed:** 9
**Analogs found:** 9 / 9

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `py_modules/volume.py` | service | event-driven | `py_modules/volume.py` (`VolumeFader.set_ducking`, `fade_to`) | exact (in-place extension) |
| `py_modules/system.py` | service | event-driven | `py_modules/system.py` (`sleep_timer_worker`, `set_sleep_timer`, `get_sleep_timer_status`) | exact (in-place extension) |
| `py_modules/common.py` | config | file-I/O | `py_modules/common.py` (`DEFAULT_SETTINGS`, `_load_settings_impl`) | exact (in-place extension) |
| `main.py` | controller | request-response | `main.py` (`Plugin` sleep fields, `get_status`, `set_setting`) | exact (in-place extension) |
| `src/types.ts` | model | CRUD | `src/types.ts` (`EngineSettings`, `SleepTimerStatus`) | exact (in-place extension) |
| `src/components/tabs/SettingsTab.tsx` | component | request-response | `src/components/tabs/SettingsTab.tsx` (Backend Sleep Timer card + `ToggleField`/`SliderField`) | exact (in-place extension) |
| `tests/test_volume.py` | test | event-driven | `tests/test_volume.py` (`TestVolumeFader`) | exact (in-place extension) |
| `tests/test_features.py` | test | request-response | `tests/test_features.py` (`DeckifyFeatureTests`) | exact (in-place extension) |
| `src/components/tabs/SettingsTab.test.tsx` | test | request-response | `src/components/tabs/SettingsTab.test.tsx` (`SettingsTab` tests) | exact (in-place extension) |

## Pattern Assignments

### `py_modules/volume.py` (service, event-driven)

**Analog:** `py_modules/volume.py` (`VolumeFader`, lines 159–325)

**Init & state fields pattern** (lines 162–169):
```python
    def __init__(self, plugin):
        self.plugin = plugin
        self._fade_task: asyncio.Task | None = None
        self._current_sink_volume: float = 150.0 if getattr(plugin, "_pa_volume_boosted", False) else 100.0
        self._target_sink_volume: float = self._current_sink_volume
        self._cached_sink_input_id: str | None = None
        self._duck_reasons: set[str] = set()
        # Phase 14: add self._sleep_locked: bool = False
```

**Ducking target computation & priority-lock guard pattern** (lines 222–254):
```python
    async def set_ducking(self, active: bool, reason: str = "game") -> None:
        """Coordinate ducking state changes from game lifecycle or voice chat."""
        if active:
            self._duck_reasons.add(reason)
        else:
            self._duck_reasons.discard(reason)

        # Guard: if self._sleep_locked: return immediately (silently track _duck_reasons)
        target_should_duck = len(self._duck_reasons) > 0
        settings = getattr(self.plugin, "_settings", {})

        baseline_sink_vol = 150.0 if getattr(self.plugin, "_pa_volume_boosted", False) else 100.0

        if target_should_duck:
            duration = float(settings.get("duck_fade_down_duration", 1.0))
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

            target_sink_vol = baseline_sink_vol * factor
        else:
            duration = float(settings.get("duck_fade_up_duration", 1.5))
            target_sink_vol = baseline_sink_vol

        await self.fade_to(target_sink_vol, duration)
```
Extract the target calculation (lines 229–252) into `_compute_target_sink_volume(self) -> float` so both `set_ducking()` and `release_sleep_lock()` share one source of truth.

**Task cancellation & fade scheduling pattern** (lines 256–267):
```python
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
Note: `fade_to` spawns `_fade_task` and returns immediately. `start_sleep_fade(duration_sec)` must `await self.fade_to(0.0, duration_sec)` and then `await self._fade_task` (if present and not done). `release_sleep_lock(restore_duration=0.0, wait=False)` clears `self._sleep_locked = False`, computes `self._compute_target_sink_volume()`, calls `await self.fade_to(target_vol, restore_duration)`, and awaits `self._fade_task` when `wait=True`.

**Error handling & sink-input safety** (lines 204–220):
`_apply_sink_volume` validates numeric `sink_input_id`, clamps `percent` to `0.0–150.0`, runs `pactl set-sink-input-volume` via `_build_deck_command` + `_exec(..., timeout=2)`, and returns `bool`.

---

### `py_modules/system.py` (service, event-driven)

**Analog:** `py_modules/system.py` (lines 14–86)

**Status dict pattern** (lines 14–34):
```python
def get_sleep_timer_status(plugin) -> dict:
    """Return status of active sleep timer."""
    if not plugin._sleep_timer_task or plugin._sleep_timer_task.done():
        return {
            "active": False,
            "remaining_seconds": 0,
            "shutdown_on_finish": False,
            "end_of_track": False,
            # Phase 14: "fading": False
        }
    ...
    return {
        "active": True,
        "remaining_seconds": rem,
        "shutdown_on_finish": plugin._sleep_timer_shutdown,
        "end_of_track": plugin._sleep_timer_end_of_track,
        # Phase 14: "fading": bool(getattr(plugin, "_sleep_timer_fading", False))
    }
```

**Task cancellation & worker launch pattern** (lines 37–60):
```python
async def set_sleep_timer(
    plugin,
    minutes: int | None = None,
    shutdown_on_finish: bool = False,
    end_of_track: bool = False,
) -> dict:
    """Configure or cancel sleep timer."""
    if plugin._sleep_timer_task and not plugin._sleep_timer_task.done():
        plugin._sleep_timer_task.cancel()
        try:
            await plugin._sleep_timer_task
        except asyncio.CancelledError:
            pass
        plugin._sleep_timer_task = None
```
Awaiting the cancelled task deterministically runs `sleep_timer_worker`'s `CancelledError` handler (releasing `_sleep_locked` with `0.5s` restore per D-04) before `set_sleep_timer` returns or spawns a new worker.

**Worker loop, pause, drain, and shutdown pattern** (lines 63–86):
```python
async def sleep_timer_worker(plugin):
    """Background worker monitoring sleep timer elapsed duration."""
    try:
        if plugin._sleep_timer_end_of_track:
            start_track = plugin._poll_track_id
            while True:
                await asyncio.sleep(1)
                if plugin._poll_track_id != start_track or plugin._poll_play_state != "playing":
                    break
        else:
            # Timed mode: if sleep_timer_fade_enabled, wait until remaining <= fade_duration,
            # set plugin._sleep_timer_fading = True, await fader.start_sleep_fade(actual_fade),
            # set plugin._sleep_timer_fading = False, pause, await asyncio.sleep(1.2) drain,
            # then await fader.release_sleep_lock(0.0, wait=True) before shutdown_system().
            while time.time() < plugin._sleep_timer_end:
                await asyncio.sleep(1)

        decky.logger.info("Sleep timer expired, pausing playback")
        await plugin.control_playback("pause")

        if plugin._sleep_timer_shutdown:
            decky.logger.info("Sleep timer triggering system shutdown")
            await plugin.shutdown_system()
    except asyncio.CancelledError:
        # If fading mid-cancel: reset plugin._sleep_timer_fading = False and
        # await fader.release_sleep_lock(0.5, wait=False)
        pass
    except Exception as e:
        decky.logger.error("Sleep timer error: %s", e)
```
Use `getattr(plugin, "_settings", {})`, `getattr(plugin, "_volume_fader", None)`, and `getattr(plugin, "_sleep_timer_fading", False)` so minimal mock `Plugin` instances in existing tests never raise `AttributeError`.

---

### `py_modules/common.py` (config, file-I/O)

**Analog:** `py_modules/common.py` (`DEFAULT_SETTINGS` lines 70–115, `_load_settings_impl` lines 242–269)

**`DEFAULT_SETTINGS` pattern** (lines 89–98):
```python
    "auto_ducking": True,
    "auto_ducking_volume": 30,
    "duck_fade_down_duration": 1.0,
    "duck_fade_up_duration": 1.5,
    "ducking_mode": "proportional",
    "ducking_proportional_pct": 50,
    "voice_ducking_enabled": True,
    "voice_ducking_volume": 25,
    "voice_ducking_hold_delay": 1.2,
    # Phase 14:
    # "sleep_timer_fade_enabled": True,
    # "sleep_timer_fade_duration": 30,
```

**Sanitization & clamping pattern in `_load_settings_impl`** (lines 258–267):
```python
        if not isinstance(merged.get("voice_ducking_enabled"), bool):
            merged["voice_ducking_enabled"] = bool(merged.get("voice_ducking_enabled", True))
        try:
            merged["voice_ducking_volume"] = max(10, min(50, int(merged.get("voice_ducking_volume", 25))))
        except (TypeError, ValueError):
            merged["voice_ducking_volume"] = 25
```
Apply identical coercion/clamping for `sleep_timer_fade_enabled` (`bool`, default `True`) and `sleep_timer_fade_duration` (`max(5, min(120, int(...)))`, default `30`).

---

### `main.py` (controller, request-response)

**Analog:** `main.py` (lines 103–109, 500–517, 585–616)

**Plugin sleep timer state fields** (lines 103–109):
```python
    # Sleep Timer State
    _sleep_timer_task: asyncio.Task | None = None
    _sleep_timer_end: float = 0
    _sleep_timer_shutdown: bool = False
    _sleep_timer_end_of_track: bool = False
    _sleep_timer_initial_track_id: str | None = None
    # Phase 14: _sleep_timer_fading: bool = False
```

**`get_status` `public_keys` exposure pattern** (lines 506–509):
```python
            "duck_fade_down_duration", "duck_fade_up_duration", "ducking_mode",
            "ducking_proportional_pct", "voice_ducking_enabled", "voice_ducking_volume",
            "voice_ducking_hold_delay", "pinned_playlists",
            # Phase 14: "sleep_timer_fade_enabled", "sleep_timer_fade_duration",
```

**`set_setting` validation pattern** (lines 585, 612–616):
```python
        elif key in ("normalisation", "gapless", "autoplay", "bit_perfect_clock", "overlay_enabled", "toast_enabled", "toast_sound_enabled", "gamepad_chords_enabled", "overlay_autohide", "overlay_show_progress", "overlay_lyrics_enabled", "voice_ducking_enabled"):
            value = bool(value)
        ...
        elif key == "voice_ducking_volume":
            try:
                value = max(10, min(50, int(value)))
            except (TypeError, ValueError):
                return {"ok": False, "error": "voice_ducking_volume must be an integer between 10 and 50"}
```
Add `"sleep_timer_fade_enabled"` to the boolean `elif key in (...)` tuple, and add `elif key == "sleep_timer_fade_duration":` clamping `max(5, min(120, int(value)))` with structured `{"ok": False, "error": ...}` on `TypeError`/`ValueError`.

---

### `src/types.ts` (model, CRUD)

**Analog:** `src/types.ts` (`EngineSettings` lines 183–200, `SleepTimerStatus` lines 219–224)

**`EngineSettings` pattern** (lines 183–190):
```typescript
  duck_fade_down_duration?: number;
  duck_fade_up_duration?: number;
  ducking_mode?: DuckingMode;
  ducking_proportional_pct?: number;
  voice_ducking_enabled?: boolean;
  voice_ducking_volume?: number;
  voice_ducking_hold_delay?: number;
  // Phase 14:
  // sleep_timer_fade_enabled?: boolean;
  // sleep_timer_fade_duration?: number;
```

**`SleepTimerStatus` pattern** (lines 219–224):
```typescript
export interface SleepTimerStatus {
  active: boolean;
  remaining_seconds: number;
  shutdown_on_finish: boolean;
  end_of_track?: boolean;
  // Phase 14: fading?: boolean;
}
```

---

### `src/components/tabs/SettingsTab.tsx` (component, request-response)

**Analog:** `src/components/tabs/SettingsTab.tsx` (Backend Sleep Timer card lines 380–449; `ToggleField` + `SliderField` lines 817–845)

**Active timer status display pattern** (lines 387–392):
```tsx
          {status?.sleep_timer?.active && (
            <b style={{ color: "#1db954", marginLeft: 6 }}>
              {status.sleep_timer.fading
                ? "Fading out..."
                : `Remaining: ${Math.ceil((status.sleep_timer.remaining_seconds || 0) / 60)} min`}
            </b>
          )}
```

**`ToggleField` + `SliderField` pattern** (lines 817–845):
```tsx
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
Place the sleep fade `ToggleField` (`sleep_timer_fade_enabled`, default `true`) and `SliderField` (`sleep_timer_fade_duration`, `min={5}`, `max={120}`, `step={5}`, `showValue`, default `30`) inside the Backend Sleep Timer card (`lines 380–449`), leaving `src/index.tsx` (QAM) untouched.

---

### `tests/test_volume.py` (test, event-driven)

**Analog:** `tests/test_volume.py` (`TestVolumeFader`, lines 1–80)

**Test harness & imports pattern** (lines 1–33):
```python
with patch.dict("sys.modules", {"decky": SimpleNamespace(
    DECKY_PLUGIN_SETTINGS_DIR=tempfile.gettempdir(),
    DECKY_PLUGIN_DIR=tempfile.gettempdir(),
    DECKY_PLUGIN_RUNTIME_DIR=tempfile.gettempdir(),
    logger=MagicMock(),
    emit=AsyncMock(),
)}):
    from py_modules import common, volume
    from py_modules.volume import VolumeFader, VoiceActivityDetector, cosine_ease


class TestVolumeFader(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.mock_plugin = SimpleNamespace(
            _process=SimpleNamespace(pid=12345),
            _spotify_client_process=None,
            _settings=dict(common.DEFAULT_SETTINGS),
            _poll_volume=80,
            _pa_volume_boosted=False,
            _is_playing=True,
        )
        self.fader = VolumeFader(self.mock_plugin)
```

---

### `tests/test_features.py` (test, request-response)

**Analog:** `tests/test_features.py` (`DeckifyFeatureTests`, lines 1–20)

**Test harness & imports pattern** (lines 1–20):
```python
from test_token_refresh import main


class DeckifyFeatureTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.plugin = main.Plugin()
        self.plugin._token_refresh_lock = asyncio.Lock()
        self.plugin._access_token = "valid-token"
        self.plugin._refresh_token = "valid-refresh"
        self.plugin._token_expires_at = 9999999999
        self.plugin._settings = dict(main.DEFAULT_SETTINGS)
        self.execute = self.enterContext(patch.object(main, "_exec", new_callable=AsyncMock))
        self.save = self.enterContext(patch.object(main, "_save_settings"))
        self.emit = self.enterContext(patch.object(main.decky, "emit", new_callable=AsyncMock))
```

---

### `src/components/tabs/SettingsTab.test.tsx` (test, request-response)

**Analog:** `src/components/tabs/SettingsTab.test.tsx` (lines 1–80)

**Mock & JSX tree inspection pattern** (lines 7–31, 72–80):
```tsx
vi.mock("@decky/api", () => ({
  callable: (name: string) => {
    if (name === "set_setting") {
      return (...args: any[]) => mockSetSetting(...args);
    }
    return vi.fn().mockResolvedValue({ ok: true });
  },
  addEventListener: (...args: any[]) => (mockAddEventListener as any)(...args),
  removeEventListener: (...args: any[]) => (mockRemoveEventListener as any)(...args),
}));

vi.mock("@decky/ui", () => ({
  Focusable: ({ children, ...props }: any) => ({ type: "Focusable", props: { children, ...props } }),
  SliderField: (props: any) => ({ type: "SliderField", props }),
  ToggleField: (props: any) => ({ type: "ToggleField", props }),
}));
```
Uses `findNodes(tree, predicate)` on the returned virtual tree to assert `ToggleField` / `SliderField` props and `onChange` callbacks calling `mockSetSetting`.

## Shared Patterns

### PipeWire Sink-Input Isolation & `VolumeFader` Guardrails
**Source:** `py_modules/volume.py:181-220`
**Apply to:** `py_modules/volume.py`, `py_modules/system.py`
All volume changes must go through `VolumeFader` (`resolve_sink_input_id()` + `_apply_sink_volume()`), never touching `steamwebhelper`/`Chromium` streams, and always restoring baseline volume before `shutdown_system()` so `module-stream-restore` never persists `0%`.

### Settings Persistence & Public Exposure Pipeline
**Source:** `py_modules/common.py:70-115,242-269` + `main.py:500-517,585-616`
**Apply to:** `py_modules/common.py`, `main.py`, `src/types.ts`, `src/components/tabs/SettingsTab.tsx`
Every persistent setting is defined in `DEFAULT_SETTINGS`, coerced/clamped in `_load_settings_impl`, whitelisted in `main.py:get_status`'s `public_keys`, validated in `main.py:set_setting`, typed in `EngineSettings`, and updated via `updateSetting(key, val)` in `SettingsTab.tsx`.

### Defensive `Plugin` Attribute Access
**Source:** `py_modules/volume.py:165,176-178,230`
**Apply to:** `py_modules/system.py`
Use `getattr(plugin, "_volume_fader", None)`, `getattr(plugin, "_settings", {})`, and `getattr(plugin, "_sleep_timer_fading", False)` so lightweight `Plugin` mocks in unit tests remain compatible.

## No Analog Found

None — all 9 files have exact in-repo analogs.

## Metadata

**Analog search scope:** `py_modules/`, `main.py`, `src/`, `tests/`
**Files scanned:** 9
**Pattern extraction date:** 2026-11-16
