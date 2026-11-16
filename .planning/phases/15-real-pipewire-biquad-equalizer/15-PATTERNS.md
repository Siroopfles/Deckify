# Phase 15: Real PipeWire Biquad Equalizer - Pattern Map

**Mapped:** 2026-11-16
**Files analyzed:** 10 (2 new, 8 modified)
**Analogs found:** 10 / 10 (9 exact/in-place updates, 1 role-match new module)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `py_modules/equalizer.py` | service | process-control / file-I/O | `py_modules/volume.py` (`VolumeFader`) & `py_modules/soundtrack.py` (`SoundtrackManager`) | role-match |
| `tests/test_equalizer.py` | test | unit / mocked-subprocess | `tests/test_volume.py` | exact |
| `py_modules/common.py` | config / utility | file-I/O | `py_modules/common.py` (in-place) | exact |
| `py_modules/engine.py` | service | process-control / IPC | `py_modules/engine.py` (in-place) | exact |
| `py_modules/volume.py` | service | request-response / IPC | `py_modules/volume.py` (in-place) | exact |
| `py_modules/__init__.py` | config | module-exports | `py_modules/__init__.py` (in-place) | exact |
| `main.py` | controller | request-response / lifecycle | `main.py` (in-place) | exact |
| `src/types.ts` | model | type-definitions | `src/types.ts` (in-place) | exact |
| `src/components/tabs/SettingsTab.tsx` | component | event-driven / UI | `src/components/tabs/SettingsTab.tsx` (in-place) | exact |
| `src/components/tabs/SettingsTab.test.tsx` | test | unit / UI-tree | `src/components/tabs/SettingsTab.test.tsx` (in-place) | exact |

---

## Pattern Assignments

### `py_modules/equalizer.py` (service, process-control / file-I/O)

**Analogs:** `py_modules/volume.py` (subprocess/PipeWire async control) and `py_modules/soundtrack.py` (plugin-attached manager with `asyncio.Task` lifecycle & debounced state).

**Imports pattern** (`py_modules/volume.py` lines 1-23):
```python
import asyncio
import math
import os
import subprocess
import time
from py_modules.common import (
    PULSE_SERVER,
    _exec,
    _build_deck_command,
    _save_settings,
    decky,
)
from py_modules.engine import (
    _get_pactl_sinks,
    _set_pactl_sink_input,
    resolve_spotify_sink_input_ids,
)
```

**UID 1000 subprocess execution pattern** (`py_modules/common.py` lines 334-354 & `py_modules/volume.py` lines 105-113):
```python
cmd, env = _build_deck_command(["pw-metadata", "-n", "settings", "0", "clock.allowed-rates", rates])
await _exec(lambda: subprocess.run(cmd, env=env, capture_output=True, text=True), timeout=5)
```
All `pipewire -c`, `pw-cli`, `pw-dump`, and `pactl` invocations MUST go through `_build_deck_command(...)` so commands run as `deck` (UID 1000) with `XDG_RUNTIME_DIR`, `DBUS_SESSION_BUS_ADDRESS`, `PULSE_SERVER`, and `HOME` set and `LD_LIBRARY_PATH` stripped.

**Sink-input lookup & validation pattern** (`py_modules/volume.py` lines 182-221):
```python
cmd, env = _build_deck_command(["pactl", "list", "sink-inputs"])
res = await _exec(
    lambda: subprocess.run(cmd, capture_output=True, text=True, env=env),
    timeout=3,
)
```
Use `resolve_spotify_sink_input_ids(res.stdout, pids)` from `py_modules/engine.py` rather than hand-rolling `pactl` parsing.

**Manager lifecycle pattern** (`py_modules/volume.py` lines 162-170 & `main.py` lines 147-173):
- Accept `plugin` in `__init__(self, plugin)`.
- Track `self._process: subprocess.Popen | None`, `self._throttle_task: asyncio.Task | None`, `self._save_task: asyncio.Task | None`, and `self._node_id: int | None`.
- Provide an async `stop()` / `unload()` method that cancels pending `asyncio.Task`s and terminates `self._process` (`terminate()`, wait, `kill()` fallback).
- For `pipewire -c` filter-chain config generation, `pw-dump` node ID parsing, and `pw-cli set-param` coalescing (~75ms), follow `RESEARCH.md` Pattern 1 & Pattern 2.

---

### `tests/test_equalizer.py` (test, unit / mocked-subprocess)

**Analog:** `tests/test_volume.py`

**Decky mock & module import pattern** (`tests/test_volume.py` lines 1-20):
```python
import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

with patch.dict("sys.modules", {"decky": SimpleNamespace(
    DECKY_PLUGIN_SETTINGS_DIR=tempfile.gettempdir(),
    DECKY_PLUGIN_DIR=tempfile.gettempdir(),
    DECKY_PLUGIN_RUNTIME_DIR=tempfile.gettempdir(),
    logger=MagicMock(),
    emit=AsyncMock(),
)}):
    from py_modules import common, equalizer
```

**Test class & mock plugin pattern** (`tests/test_volume.py` lines 22-33, 51-62):
```python
class TestEqualizerManager(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.mock_plugin = SimpleNamespace(
            _process=SimpleNamespace(pid=12345),
            _spotify_client_process=None,
            _settings=dict(common.DEFAULT_SETTINGS),
        )
```
Use `@patch("subprocess.run")` / `@patch("subprocess.Popen")` for `pipewire -c`, `pw-dump`, `pw-cli`, and `pactl` tests.

---

### `py_modules/common.py` (config / utility, file-I/O)

**Analog:** `py_modules/common.py` (in-place update)

**`DEFAULT_SETTINGS` pattern** (lines 109-117):
```python
    "eq_preset": "flat",
    "eq_custom_bands": [0.0] * 10,
```
Add `"eq_custom_bands": [0.0] * 10` alongside `"eq_preset": "flat"` (line 109).

**`_load_settings()` validation & clamping pattern** (lines 234-243):
```python
        if merged.get("eq_preset") not in ("flat", "bass", "vocal", "gaming"):
            merged["eq_preset"] = "flat"
```
Update line 242 to validate against the canonical 7-preset set (`flat`, `bass`, `vocal`, `gaming`, `deck_speakers`, `late_night`, `custom`) and validate/clamp `eq_custom_bands` to a 10-element list of floats in `[-12.0, 12.0]` (fallback `[0.0] * 10`).

---

### `py_modules/engine.py` (service, process-control / IPC)

**Analog:** `py_modules/engine.py` (in-place update)

**Allowlist & Steam UI exclusion pattern** (lines 130-195):
```python
_SPOTIFY_SINK_ALLOWLIST = ("librespot", "spotify", "com.spotify.client", "deckify_eq_out")
```
`resolve_spotify_sink_input_ids(stdout, pids)` (lines 133-195) already excludes `steamwebhelper` and `Chromium`, prioritizes exact PIDs, and checks `_SPOTIFY_SINK_ALLOWLIST`. Add `"effect_output.deckify_eq"` if needed, and support optional exclusion/filtering so `librespot` sink-inputs can be routed separately from `effect_output.deckify_eq` (`D-05`).

**`_set_pactl_sink_input` pattern** (lines 198-233):
```python
def _set_pactl_sink_input(target_sink: str, pids: set[str] | None = None) -> bool:
    """Move active Spotify/Deckify sink inputs to target_sink without touching Steam UI or game audio."""
    if not isinstance(target_sink, str) or not target_sink.strip() or target_sink.strip().startswith("-"):
        return False
```
Preserve the `target_sink.strip().startswith("-")` and `input_id.isdigit()` security guards.

---

### `py_modules/volume.py` (service, request-response / IPC)

**Analog:** `py_modules/volume.py` (in-place update)

**Existing stub to replace** (lines 97-102):
```python
async def apply_equalizer_preset(plugin, preset: str) -> None:
    """Persist and emit equalizer preset change."""
    decky.logger.info("Applying EQ preset: %s", preset)
    plugin._settings["eq_preset"] = preset
    _save_settings(plugin._settings)
    await decky.emit("eq_preset_changed", {"preset": preset})
```
Delegate to `plugin._equalizer_manager` when present, persist settings, and emit `eq_preset_changed`.

**Existing sink switcher to make EQ-aware** (lines 142-150):
```python
async def set_audio_sink(sink_name: str) -> dict:
    """Switch active sink input to specified sink name."""
    if not sink_name or not isinstance(sink_name, str):
        return {"ok": False, "error": "Missing sink_name"}
    try:
        ok = await _exec(_set_pactl_sink_input, sink_name.strip(), timeout=4)
        return {"ok": ok}
    except Exception as e:
        return {"ok": False, "error": str(e)}
```
Per `D-05`, when EQ is active (non-`flat`), `set_audio_sink` must keep `librespot` routed into `deckify_eq_sink` and move only `effect_output.deckify_eq` (`deckify_eq_out`) to `sink_name`.

---

### `py_modules/__init__.py` (config, module-exports)

**Analog:** `py_modules/__init__.py` (in-place update)

**Module export pattern** (lines 75-79):
```python
from py_modules import volume
from py_modules import system
from py_modules import rpc_playback
from py_modules import rpc_library
```
Import `from py_modules import equalizer` if needed by `main.py` or tests.

---

### `main.py` (controller, request-response / lifecycle)

**Analog:** `main.py` (in-place update)

**Manager initialization & unload pattern** (`main.py` lines 147-178):
```python
        self._volume_fader = volume.VolumeFader(self)
        self._voice_detector = volume.VoiceActivityDetector(self, self._volume_fader)
        self._voice_detector.start()
        self._soundtrack_manager = soundtrack.SoundtrackManager(self)
```
And in `_unload()` (lines 158-173):
```python
        if getattr(self, "_soundtrack_manager", None):
            self._soundtrack_manager.cancel_all()
```
Instantiate `self._equalizer_manager = equalizer.EqualizerManager(self)` in `_main()`, apply initial non-`flat` preset on startup/after `start_librespot()`, and cleanly stop it in `_unload()`.

**`set_setting` validation pattern** (`main.py` lines 641-646):
```python
        elif key == "eq_preset":
            val = str(value).strip().lower()
            if val not in ("flat", "bass", "vocal", "gaming"):
                return {"ok": False, "error": f"Invalid eq_preset: {value}"}
            value = val
            await self._apply_equalizer_preset(val)
```
Update allowlist to all 7 presets (`flat`, `bass`, `vocal`, `gaming`, `deck_speakers`, `late_night`, `custom`), add `set_eq_bands(self, bands: list[float]) -> dict` RPC method, and pass `self` (or coordinate with `self._equalizer_manager`) in `set_audio_sink(self, sink_name: str)`.

---

### `src/types.ts` (model, type-definitions)

**Analog:** `src/types.ts` (in-place update)

**Type union & interface pattern** (`src/types.ts` lines 38, 181):
```typescript
export type EqualizerPreset = "flat" | "bass" | "vocal" | "gaming";
```
Expand to:
```typescript
export type EqualizerPreset =
  | "flat"
  | "bass"
  | "vocal"
  | "gaming"
  | "deck_speakers"
  | "late_night"
  | "custom";
```
And in `DeckifySettings` (line 181):
```typescript
  eq_preset?: EqualizerPreset;
  eq_custom_bands?: number[];
```

---

### `src/components/tabs/SettingsTab.tsx` (component, event-driven / UI)

**Analog:** `src/components/tabs/SettingsTab.tsx` (in-place update)

**RPC callable pattern** (line 8):
```typescript
const backendSetSetting = callable<[string, unknown], { ok: boolean; settings?: any; error?: string }>("set_setting");
```
Add `const backendSetEqBands = callable<[number[]], { ok: boolean; error?: string }>("set_eq_bands");` alongside line 8.

**Preset pills pattern** (lines 323-352):
```tsx
      {/* Equalizer & Audio Presets */}
      <div style={{ marginBottom: 20, padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
          <FaSlidersH /> Equalizer & Audio Presets
        </h3>
        <Focusable flow-children="horizontal" style={{ display: "flex", gap: 8 }}>
          {[...].map((eq) => (
            <InteractiveRow
              key={eq.id}
              onClick={async () => { ... }}
              active={curEq === eq.id}
              style={{ flex: 1, justifyContent: "center", fontSize: 12, fontWeight: 700 }}
            >
              {eq.label}
            </InteractiveRow>
          ))}
        </Focusable>
      </div>
```
Split the 7 pills into **two** `<Focusable flow-children="horizontal" ...>` rows (4 in Row 1, 3 in Row 2) per `UI-SPEC.md` and `GEMINI.md` (never `flow-children="row"`).

**`SliderField` pattern** (lines 463-474):
```tsx
            <SliderField
              label="Fade Out Duration (Seconds)"
              min={5}
              max={120}
              step={5}
              showValue
              value={...}
              onChange={async (val: number) => { ... }}
            />
```
Render the 10 ISO `SliderField` controls (`31 Hz`–`16 kHz`, `min={-12}`, `max={12}`, `step={0.5}`, `showValue`) inside `<Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 4 }}>` directly below Row 2.

---

### `src/components/tabs/SettingsTab.test.tsx` (test, unit / UI-tree)

**Analog:** `src/components/tabs/SettingsTab.test.tsx` (in-place update)

**`@decky/api` mock & tree-inspection pattern** (lines 7-16, 72-96):
```typescript
vi.mock("@decky/api", () => ({
  callable: (name: string) => {
    if (name === "set_setting") {
      return (...args: any[]) => mockSetSetting(...args);
    }
    return vi.fn().mockResolvedValue({ ok: true });
  },
  ...
}));
```
Extend `callable` mock for `"set_eq_bands"` and use `findNodes` / `findText` to assert:
- 7 preset pills in 2 `flow-children="horizontal"` `Focusable` rows
- 10 `SliderField` bands (`31 Hz`–`16 kHz`, `min: -12`, `max: 12`, `step: 0.5`)
- Preset click calls `set_setting("eq_preset", ...)` and slider `onChange` forks to `"custom"` and calls `set_eq_bands`.

---

## Shared Patterns

### UID 1000 Subprocess Execution
**Source:** `py_modules/common.py` lines 334-354
**Apply to:** `py_modules/equalizer.py`, `py_modules/engine.py`, `py_modules/volume.py`
All PipeWire/PulseAudio commands (`pipewire -c`, `pw-cli`, `pw-dump`, `pactl`) must use `_build_deck_command(cmd)` and run via `_exec(..., timeout=...)` so they execute as `deck` (UID 1000) without `LD_LIBRARY_PATH` conflicts.

### PipeWire Stream Isolation
**Source:** `py_modules/engine.py` lines 130-195
**Apply to:** `py_modules/equalizer.py`, `py_modules/engine.py`, `py_modules/volume.py`
All sink-input routing must use `resolve_spotify_sink_input_ids()` so `steamwebhelper`, `Chromium`, and game audio streams are never touched.

### RPC Resilience & Structured Responses
**Source:** `py_modules/volume.py` lines 133-150 & `main.py` lines 641-646
**Apply to:** `main.py`, `py_modules/volume.py`, `py_modules/equalizer.py`
Validate all inputs before subprocess execution, wrap external calls in `try/except`, and return `{ "ok": bool, ... }` without crashing the event loop.

### SteamOS GamepadUI Spatial Navigation
**Source:** `src/components/tabs/SettingsTab.tsx` lines 328, 360
**Apply to:** `src/components/tabs/SettingsTab.tsx`
Horizontal pill rows MUST use `<Focusable flow-children="horizontal">` (never `flow-children="row"`); vertical stacks use `<Focusable flow-children="column">`.

---

## No Analog Found

| Area | Role | Data Flow | Reason |
|------|------|-----------|--------|
| PipeWire `filter-chain` conf & `pw-cli set-param` | DSP graph control | file-I/O / IPC | No existing `libpipewire-module-filter-chain` or `pw-cli`/`pw-dump` code in repo; planner should use `RESEARCH.md` Pattern 1 & Pattern 2 directly inside `py_modules/equalizer.py`. |

---

## Metadata

**Analog search scope:** `py_modules/`, `main.py`, `src/types.ts`, `src/components/tabs/`, `tests/`
**Files scanned:** 10 tracked source/test files verified via `git ls-files`
**Pattern extraction date:** 2026-11-16
