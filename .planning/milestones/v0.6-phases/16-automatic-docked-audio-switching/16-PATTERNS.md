# Phase 16: Automatic Docked Audio-Switching - Pattern Map

**Mapped:** 2026-11-16
**Files analyzed:** 9
**Analogs found:** 9 / 9

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `py_modules/dock.py` | service | event-driven | `py_modules/device.py` (`SuspendResumeMonitor`) | exact |
| `py_modules/volume.py` | service | request-response | `py_modules/volume.py` (`set_audio_sink`, `get_audio_sinks`, `configure_pipewire_clock`) | exact |
| `py_modules/common.py` | config | file-I/O | `py_modules/common.py` (`DEFAULT_SETTINGS`) | exact |
| `main.py` | controller | request-response / event-driven | `main.py` (`_main`, `_unload`, `get_status`, `set_setting`) | exact |
| `src/types.ts` | model | transform | `src/types.ts` (`AudioSinkInfo`, `EngineSettings`, `SleepTimerStatus`) | exact |
| `src/index.tsx` | provider | event-driven | `src/index.tsx` (`addEventListener` + `toaster.toast`) | exact |
| `src/components/tabs/SettingsTab.tsx` | component | request-response / event-driven | `src/components/tabs/SettingsTab.tsx` (`Audio Output Sink (PipeWire)` card) | exact |
| `tests/test_dock.py` | test | unit / event-driven | `tests/test_equalizer.py` | exact |
| `src/components/tabs/SettingsTab.test.tsx` | test | unit / component | `src/components/tabs/SettingsTab.test.tsx` | exact |

## Pattern Assignments

### `py_modules/dock.py` (service, event-driven)

**Analog:** `py_modules/device.py` (`SuspendResumeMonitor`)

**Imports pattern** (`py_modules/device.py` lines 1-12 + `py_modules/common.py` lines 352-372):
```python
import asyncio
import os
import subprocess

try:
    import decky
except ImportError:
    from py_modules.common import decky
from py_modules.common import _build_deck_command, _exec
```

**Async subprocess monitor lifecycle** (`py_modules/device.py` lines 80-112):
```python
class SuspendResumeMonitor:
    """Monitors systemd-logind via busctl for SteamOS suspend and resume events."""

    def __init__(self, on_sleep=None, on_resume=None):
        self.on_sleep = on_sleep
        self.on_resume = on_resume
        self._task: asyncio.Task | None = None
        self._proc: asyncio.subprocess.Process | None = None
        self._running = False

    def start(self):
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._monitor_loop())

    async def stop(self):
        self._running = False
        if self._proc:
            try:
                self._proc.terminate()
                await self._proc.wait()
            except Exception:
                pass
            self._proc = None
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
```

**Subprocess readline loop & binary guard** (`py_modules/device.py` lines 113-160, adapted with `_build_deck_command` for `pactl subscribe` as UID 1000 `deck`):
```python
        while self._running:
            try:
                cmd, env = _build_deck_command(["pactl", "subscribe"])
                env.pop("LD_LIBRARY_PATH", None)
                self._proc = await asyncio.create_subprocess_exec(
                    *cmd,
                    env=env,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.DEVNULL,
                )
                if not self._proc.stdout:
                    break

                while self._running:
                    line = await self._proc.stdout.readline()
                    if not line:
                        break
                    text = line.decode("utf-8", errors="ignore").lower()
                    if " on sink " in text or " on server " in text:
                        self._schedule_debounced_evaluate()
            except asyncio.CancelledError:
                break
            except Exception as e:
                decky.logger.debug("Dock monitor encountered error: %s, retrying in 5s", e)
                await asyncio.sleep(5)
```

**Error handling pattern:** Check `shutil.which("pactl")` before spawning; catch `asyncio.CancelledError` cleanly to exit; log unexpected errors via `decky.logger` and back off before retry.

---

### `py_modules/volume.py` (service, request-response)

**Analog:** `py_modules/volume.py` (in-place modification of `get_audio_sinks`, `set_audio_sink`, and `configure_pipewire_clock`)

**PipeWire clock control pattern** (`py_modules/volume.py` lines 112-120):
```python
async def configure_pipewire_clock(unlock_lossless: bool) -> None:
    """Unlock 44.1kHz/88.2kHz/96kHz in PipeWire when Lossless is active, or restore default 48kHz."""
    rates = "[ 44100 48000 88200 96000 ]" if unlock_lossless else "[ 48000 ]"
    try:
        cmd, env = _build_deck_command(["pw-metadata", "-n", "settings", "0", "clock.allowed-rates", rates])
        await _exec(lambda: subprocess.run(cmd, env=env, capture_output=True, text=True), timeout=5)
        decky.logger.info("PipeWire clock.allowed-rates set to %s", rates)
    except Exception as e:
        decky.logger.warning("Failed to configure PipeWire clock rates: %s", e)
```

**Sink listing & EQ-isolated switching pattern** (`py_modules/volume.py` lines 140-163):
```python
async def get_audio_sinks() -> dict:
    """List available audio output sinks via pactl."""
    try:
        sinks = await _exec(_get_pactl_sinks, timeout=3)
        return {"ok": True, "sinks": sinks}
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def set_audio_sink(sink_name: str, plugin=None) -> dict:
    """Switch active sink input to specified sink name (EQ-isolated when EQ is active)."""
    if not sink_name or not isinstance(sink_name, str) or not sink_name.strip() or sink_name.strip().startswith("-"):
        return {"ok": False, "error": "Invalid sink_name"}
    target = sink_name.strip()
    try:
        eq_mgr = getattr(plugin, "_equalizer_manager", None) if plugin is not None else None
        if eq_mgr is not None:
            if eq_mgr.is_active:
                return await eq_mgr.on_sink_changed(target)
            eq_mgr._target_hardware_sink = target
        ok = await _exec(_set_pactl_sink_input, target, timeout=4)
        return {"ok": ok}
    except Exception as e:
        return {"ok": False, "error": str(e)}
```

**Notes for modification:**
- Enrich `get_audio_sinks()` to return `{ name, description, is_default }` (matching `AudioSinkInfo` in `src/types.ts:146-150`) and exclude `EQ_SINK_NAME` (`"deckify_eq_sink"`).
- Add `is_auto_dock: bool = False` to `set_audio_sink()` so manual calls (`is_auto_dock=False`) notify `plugin._dock_switcher.on_manual_sink_selected(target)` for `D-06` manual override protection.

---

### `py_modules/common.py` (config, file-I/O)

**Analog:** `py_modules/common.py` (`DEFAULT_SETTINGS` lines 70-118)

**Config defaults pattern** (`py_modules/common.py` lines 109-118):
```python
    "eq_preset": "flat",
    "eq_custom_bands": [0.0] * 10,
    "trigger_nav_enabled": True,
    "trigger_seek_seconds": 10,
    "trigger_page_size": 15,
    "show_controller_hints": True,
    "pinned_playlists": [],
    "sleep_timer_fade_enabled": True,
    "sleep_timer_fade_duration": 30,
```

Add the 5 `dock_*` keys with matching types and defaults:
- `"dock_auto_switch_enabled": False`
- `"dock_target_sink": "auto"`
- `"dock_respect_bluetooth": True`
- `"dock_pause_on_undock": False`
- `"dock_toast_enabled": True`

---

### `main.py` (controller, request-response / event-driven)

**Analog:** `main.py` (`_main`, `_unload`, `get_status`, `set_setting`)

**Lifecycle instantiation & unload pattern** (`main.py` lines 143-185):
```python
        self._suspend_monitor = SuspendResumeMonitor(
            on_sleep=self._on_deck_sleep,
            on_resume=self._on_deck_resume,
        )
        self._suspend_monitor.start()
        ...
        self._soundtrack_manager = soundtrack.SoundtrackManager(self)
        self._equalizer_manager = equalizer.EqualizerManager(self)
        ...
        await self.start_librespot()
```
And in `_unload()` (`main.py` lines 171-173):
```python
        if hasattr(self, "_suspend_monitor") and self._suspend_monitor:
            await self._suspend_monitor.stop()
            self._suspend_monitor = None
```

**Status exposure pattern** (`main.py` lines 508-548):
```python
        public_keys = (
            ...
            "sleep_timer_fade_enabled", "sleep_timer_fade_duration",
        )
        return {
            ...
            "settings": {k: v for k, v in self._settings.items() if k in public_keys},
            ...
            "sleep_timer": self.get_sleep_timer_status(),
        }
```

**Setting validation pattern** (`main.py` lines 553-606):
```python
    async def set_setting(self, key: str, value) -> dict:
        if key not in DEFAULT_SETTINGS:
            return {"ok": False, "error": f"unknown setting: {key}"}
        ...
        elif key in ("normalisation", "gapless", "autoplay", "bit_perfect_clock", ..., "sleep_timer_fade_enabled"):
            value = bool(value)
```
For `dock_target_sink`: validate `isinstance(value, str)`, strip, reject control chars (`ord(c) < 32 or ord(c) == 127`) and leading `-` (`value.startswith("-")`), default empty to `"auto"`. After saving `_settings`, notify `await self._dock_switcher.on_settings_changed(key, value)` for `dock_*` and `bit_perfect_clock` keys.

---

### `src/types.ts` (model, transform)

**Analog:** `src/types.ts` (`AudioSinkInfo`, `EngineSettings`, `SleepTimerStatus`)

**Interface pattern** (`src/types.ts` lines 146-150 & 207-230):
```typescript
export interface AudioSinkInfo {
  name: string;
  description: string;
  is_default: boolean;
}
```
```typescript
  pinned_playlists?: PinnedPlaylistItem[];
  sleep_timer_fade_enabled?: boolean;
  sleep_timer_fade_duration?: number;
}
```
Add `DockStatusState`, `DockStatusInfo`, `dock_*` optional fields to `EngineSettings`, and `dock_status?: DockStatusInfo` to `StatusResponse`.

---

### `src/index.tsx` (provider, event-driven)

**Analog:** `src/index.tsx` (`addEventListener` + `toaster.toast`, lines 281-306)

**Event listener & toast pattern** (`src/index.tsx` lines 291-306):
```tsx
    const unsubPrompt = addEventListener<[any]>("soundtrack_prompt_switch", (data: any) => {
      try {
        const gameName = data?.app_name ? ` for ${data.app_name}` : "";
        toaster.toast({
          title: "Deckify Soundtrack",
          body: `Soundtrack ready${gameName}. Open Deckify to switch.`,
          duration: 4500,
        });
      } catch {}
    });

    return () => {
      activeGameListeners.delete(setActiveGameAppId);
      removeEventListener("ducking_state_changed", unsubDucking);
      removeEventListener("soundtrack_prompt_switch", unsubPrompt);
    };
```
Subscribe to `"dock_audio_switched"` once in `src/index.tsx` and call `toaster.toast` only when `dock_toast_enabled` is enabled (default `true`).

---

### `src/components/tabs/SettingsTab.tsx` (component, request-response / event-driven)

**Analog:** `src/components/tabs/SettingsTab.tsx` (`Audio Output Sink (PipeWire)` card, lines 619-643; `settings_changed` listener, lines 168-178)

**Event listener refresh pattern** (`src/components/tabs/SettingsTab.tsx` lines 168-178):
```tsx
  useEffect(() => {
    const handler = (st: any) => {
      if (st && typeof st === "object") {
        setLocalSettings((prev) => ({ ...prev, ...st }));
      }
    };
    const listener = addEventListener<[any]>("settings_changed", handler);
    return () => {
      removeEventListener("settings_changed", listener);
    };
  }, []);
```
Subscribe to `"dock_audio_switched"` in `SettingsTab.tsx` to call `refreshStatus()` and `loadAudioSinks()` (without firing a duplicate toast).

**Card, `Focusable`, and `InteractiveRow` pattern** (`src/components/tabs/SettingsTab.tsx` lines 621-642):
```tsx
        <div style={{ marginBottom: 20, padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 8 }}>
            Audio Output Sink (PipeWire)
          </h3>
          <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {audioSinks.map((s) => (
              <InteractiveRow
                key={s.name}
                onClick={async () => {
                  await backendSetAudioSink(s.name);
                  showToast(`Output set to ${s.description || s.name}`);
                  loadAudioSinks();
                }}
                active={s.is_default}
                style={{ justifyContent: "space-between" }}
              >
                <span style={{ fontSize: 12, fontWeight: 600 }}>{s.description || s.name}</span>
                {s.is_default && <span style={{ fontSize: 11, color: "#1db954", fontWeight: 700 }}>Default</span>}
              </InteractiveRow>
            ))}
          </Focusable>
        </div>
```
Use `<Focusable flow-children="column">` for both the 4 `ToggleField` controls and the `Target Dock / DAC Sink` `InteractiveRow` list (`Auto (USB-DAC / HDMI)` + detected sinks) per `16-UI-SPEC.md`.

---

### `tests/test_dock.py` (test, unit / event-driven)

**Analog:** `tests/test_equalizer.py`

**Imports & `decky` mock pattern** (`tests/test_equalizer.py` lines 1-22):
```python
import asyncio
import json
import os
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

with patch.dict(
    "sys.modules",
    {
        "decky": SimpleNamespace(
            DECKY_PLUGIN_SETTINGS_DIR=tempfile.gettempdir(),
            DECKY_PLUGIN_DIR=tempfile.gettempdir(),
            DECKY_PLUGIN_RUNTIME_DIR=tempfile.gettempdir(),
            logger=MagicMock(),
            emit=AsyncMock(),
        )
    },
):
    from py_modules import common, engine, equalizer, volume
```

---

### `src/components/tabs/SettingsTab.test.tsx` (test, unit / component)

**Analog:** `src/components/tabs/SettingsTab.test.tsx` (lines 1-80)

**Vitest + `@decky/api` / `@decky/ui` mock pattern** (`src/components/tabs/SettingsTab.test.tsx` lines 8-35):
```tsx
vi.mock("@decky/api", () => ({
  callable: (name: string) => {
    if (name === "set_setting") {
      return (...args: any[]) => mockSetSetting(...args);
    }
    if (name === "set_eq_bands") {
      return (...args: any[]) => mockSetEqBands(...args);
    }
    return vi.fn().mockResolvedValue({ ok: true });
  },
  addEventListener: (...args: any[]) => (mockAddEventListener as any)(...args),
  removeEventListener: (...args: any[]) => (mockRemoveEventListener as any)(...args),
}));
```
Extend `vi.mock("react-icons/fa", ...)` if `FaPlug` or `FaVolumeUp` is added to `SettingsTab.tsx`, and use `findNodes` to assert the `"Docked Audio-Switching"` card, 4 `ToggleField`s, `Auto (USB-DAC / HDMI)` row, and status badges.

## Shared Patterns

### UID 1000 (`deck`) Subprocess Execution
**Source:** `py_modules/common.py` lines 352-372
**Apply to:** `py_modules/dock.py`, `py_modules/volume.py`
All `pactl` and `pw-metadata` subprocesses must be constructed via `_build_deck_command(cmd)` and have `LD_LIBRARY_PATH` stripped (`env.pop("LD_LIBRARY_PATH", None)`) so Decky's PyInstaller libraries do not break SteamOS audio tools.

### Stream-Isolated PipeWire Routing & EQ Preservation
**Source:** `py_modules/volume.py` lines 149-163
**Apply to:** `py_modules/dock.py`, `py_modules/volume.py`
Never call `_set_pactl_sink_input` directly when EQ might be active. Always route through `volume.set_audio_sink(target, plugin=self._plugin, is_auto_dock=True)` so `EqualizerManager.on_sink_changed(target)` moves `effect_output.deckify_eq` while keeping `librespot` attached to `deckify_eq_sink` and leaving `steamwebhelper` / `Chromium` / game audio untouched.

### Structured RPC Error Responses
**Source:** `py_modules/volume.py` lines 140-163, `main.py` lines 553-561
**Apply to:** `py_modules/volume.py`, `main.py`
RPC methods validate inputs (rejecting empty/flag-prefixed sink names) and catch exceptions to return `{"ok": False, "error": str(e)}` rather than crashing the event loop.

### SteamOS GamepadUI Spatial Navigation
**Source:** `src/components/tabs/SettingsTab.tsx` lines 625-641
**Apply to:** `src/components/tabs/SettingsTab.tsx`
Vertical stacks of `ToggleField` and `InteractiveRow` items must be wrapped in `<Focusable flow-children="column">` so D-pad Up/Down navigation works cleanly without focus traps.

## No Analog Found

None — all 9 files have direct, git-tracked analogs in the existing codebase.

## Metadata

**Analog search scope:** `py_modules/`, `main.py`, `src/`, `src/components/tabs/`, `tests/`
**Files scanned:** 12
**Pattern extraction date:** 2026-11-16
