# Phase 22: Spotify Connect Hub 2.0 & Native Crossfade - Pattern Map

**Mapped:** 2026-11-22
**Files analyzed:** 12
**Analogs found:** 12 / 12

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/components/tabs/DevicesTab.tsx` | component | request-response | `src/components/tabs/DevicesTab.tsx` + `src/components/tabs/SettingsTab.tsx` | exact |
| `src/components/tabs/SettingsTab.tsx` | component | CRUD | `src/components/tabs/SettingsTab.tsx` (lines 617-655, 1379-1391) | exact |
| `src/types.ts` | model | transform | `src/types.ts` (lines 238-275, 324-330) | exact |
| `py_modules/common.py` | config | file-I/O | `py_modules/common.py` (lines 102-150, 322-345) | exact |
| `py_modules/rpc_playback.py` | service | request-response | `py_modules/rpc_playback.py` (lines 456-509) | exact |
| `py_modules/volume.py` | service | event-driven | `py_modules/volume.py` (lines 316-350, 425-475) | exact |
| `py_modules/engine.py` | service | file-I/O | `py_modules/engine.py` (lines 13-47) | exact |
| `main.py` | controller | request-response | `main.py` (lines 404-451, 636-662, 764-830) | exact |
| `src/components/tabs/SettingsTab.test.tsx` | test | component | `src/components/tabs/SettingsTab.test.tsx` (lines 1-112) | exact |
| `src/components/tabs/DevicesTab.test.tsx` | test | component | `src/components/tabs/QueueTab.test.tsx` (lines 1-115) | exact |
| `tests/test_connect_hub.py` | test | request-response | `tests/test_device_and_engine.py` (lines 1-89) | exact |
| `tests/test_crossfade.py` | test | event-driven | `tests/test_volume.py` (lines 1-90) | exact |

## Pattern Assignments

### `src/components/tabs/DevicesTab.tsx` (component, request-response)

**Analog:** `src/components/tabs/DevicesTab.tsx` (existing) & `src/components/tabs/SettingsTab.tsx` (for `SliderField` and `DialogButton`)

**Imports & RPC callable pattern** (`src/components/tabs/DevicesTab.tsx` lines 1-12):
```typescript
import { FC, useState, useEffect, useCallback } from "react";
import { Focusable } from "@decky/ui";
import { callable } from "@decky/api";
import { SpotifyDevice } from "../../types";
import { InteractiveRow } from "../common/InteractiveRow";

const backendGetDevices = callable<[], { ok: boolean; devices?: SpotifyDevice[]; error?: string }>("get_devices");
const backendTransferPlayback = callable<[string], { ok: boolean; error?: string }>("transfer_playback");
```

**Device row & `InteractiveRow` pattern** (`src/components/tabs/DevicesTab.tsx` lines 31-52):
```tsx
      <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {devices.map((d) => (
          <InteractiveRow
            key={d.id}
            onClick={async () => {
              await backendTransferPlayback(d.id);
              showToast(`Transferred to ${d.name}`);
              loadDevices();
            }}
            active={d.is_active}
            style={{ justifyContent: "space-between", padding: "12px 16px" }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: d.is_active ? "var(--deckify-accent, #1DB954)" : "#fff" }}>{d.name}</div>
              <div style={{ fontSize: 11, opacity: 0.5 }}>
                {d.type} {d.is_active ? "· Active" : ""}
              </div>
            </div>
            {d.is_active && <span style={{ fontSize: 12, color: "var(--deckify-accent, #1DB954)", fontWeight: 700 }}>Active</span>}
          </InteractiveRow>
        ))}
      </Focusable>
```

**SliderField pattern** (`src/components/tabs/SettingsTab.tsx` lines 1379-1390):
```tsx
            <SliderField
              label="Fade Out Duration (Seconds)"
              min={5}
              max={120}
              step={5}
              showValue
              value={localSettings.sleep_timer_fade_duration ?? status?.settings?.sleep_timer_fade_duration ?? 30}
              onChange={async (val: number) => {
                const clamped = Math.min(120, Math.max(5, Math.round(val)));
                await updateSetting("sleep_timer_fade_duration", clamped);
              }}
            />
```
*(In `DevicesTab.tsx`, wrap `SliderField` `onChange` in a `300ms` `useRef<ReturnType<typeof setTimeout> | null>` debounce calling `set_device_volume(deviceId, val)`, and clear the timer on unmount.)*

---

### `src/components/tabs/SettingsTab.tsx` (component, CRUD)

**Analog:** `src/components/tabs/SettingsTab.tsx` (lines 617-655, 1379-1391)

**Playback & Audiophile Features container** (`src/components/tabs/SettingsTab.tsx` lines 617-622):
```tsx
      {/* Advanced Playback Settings (Bit-Perfect, Gapless, Normalisation, Autoplay) */}
      <div style={{ marginBottom: 20, padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--deckify-accent, #1DB954)", marginBottom: 10 }}>
          Playback & Audiophile Features
        </h3>
```

**`SliderField` with `localSettings` + `updateSetting` pattern** (`src/components/tabs/SettingsTab.tsx` lines 1379-1390):
```tsx
            <SliderField
              label="Fade Out Duration (Seconds)"
              min={5}
              max={120}
              step={5}
              showValue
              value={localSettings.sleep_timer_fade_duration ?? status?.settings?.sleep_timer_fade_duration ?? 30}
              onChange={async (val: number) => {
                const clamped = Math.min(120, Math.max(5, Math.round(val)));
                await updateSetting("sleep_timer_fade_duration", clamped);
              }}
            />
```
*(Add Crossfade `SliderField` with `min={0}`, `max={12}`, `step={1}`, `showValue`, clamping `0..12`, displaying `0s = Off` in label/description.)*

---

### `src/types.ts` (model, transform)

**Analog:** `src/types.ts` (lines 238-275, 324-330)

**`EngineSettings` interface** (`src/types.ts` lines 238-249):
```typescript
export interface EngineSettings {
  device_name?: string;
  audio_backend: AudioBackend;
  audio_quality: AudioQuality;
  bitrate: number;
  bit_perfect_clock?: boolean;
  spotify_client_id?: string;
  normalisation: boolean;
  normalisation_pregain?: number;
  gapless: boolean;
  autoplay: boolean;
```
*(Add `crossfade_seconds?: number;` to `EngineSettings`.)*

**`SpotifyDevice` interface** (`src/types.ts` lines 324-330):
```typescript
export interface SpotifyDevice {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
  volume_percent: number | null;
}
```
*(Extend with optional `is_restricted?: boolean;` and `supports_volume?: boolean;`.)*

---

### `py_modules/common.py` (config, file-I/O)

**Analog:** `py_modules/common.py` (lines 102-115, 322-335)

**`DEFAULT_SETTINGS` pattern** (`py_modules/common.py` lines 102-114):
```python
DEFAULT_SETTINGS = {
    "device_name": "",
    "audio_backend": "librespot",
    "audio_quality": "320",
    "bitrate": 320,
    "bit_perfect_clock": True,
    "spotify_client_id": "",
    "normalisation": True,
    "normalisation_pregain": 0.0,
    "gapless": True,
    "autoplay": True,
```
*(Add `"crossfade_seconds": 0,` to `DEFAULT_SETTINGS`.)*

**Obsolete-keys cleanup pattern** (`py_modules/common.py` lines 329-332):
```python
        if not isinstance(saved, dict):
            return copy.deepcopy(default_settings)
        for obsolete in ("mix_mode", "crossfade_seconds", "mixed_playlists"):
            saved.pop(obsolete, None)
        merged = {**copy.deepcopy(default_settings), **saved}
```
*(Remove `"crossfade_seconds"` from the `obsolete` tuple so persisted `crossfade_seconds` survives plugin restarts.)*

---

### `py_modules/rpc_playback.py` (service, request-response)

**Analog:** `py_modules/rpc_playback.py` (lines 456-509)

**`get_devices` & `transfer_playback` pattern** (`py_modules/rpc_playback.py` lines 456-485):
```python
async def get_devices(plugin) -> dict:
    """Retrieve list of available Spotify Connect devices."""
    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}
    try:
        data = await _exec(_spotify_api_request, "me/player/devices", token)
        devices = data.get("devices", []) if data else []
        return {"ok": True, "devices": devices}
    except Exception as e:
        decky.logger.error("get_devices failed: %s", e)
        return {"ok": False, "error": str(e)}


async def transfer_playback(plugin, device_id: str) -> dict:
    """Transfer active playback to designated device ID."""
    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}
    try:
        await _exec(
            _spotify_api_request, "me/player", token, "PUT", None,
            {"device_ids": [device_id]},
        )
        return {"ok": True}
    except urllib.error.HTTPError as e:
        return {"ok": False, "error": _parse_spotify_error(e)}
    except Exception as e:
        decky.logger.error("transfer_playback failed: %s", e)
        return {"ok": False, "error": str(e)}
```

**Auto-wake + device polling pattern** (`py_modules/rpc_playback.py` lines 497-508):
```python
    power_gov = getattr(plugin, "_power_governor", None)
    is_running = plugin._is_engine_running() if hasattr(plugin, "_is_engine_running") else True
    if power_gov is not None and (getattr(power_gov, "engine_sleeping", False) or not is_running):
        await power_gov.wake_for_playback()
    elif not is_running:
        start_res = await plugin.start_librespot()
        if isinstance(start_res, dict) and start_res.get("ok"):
            for _ in range(4):
                await asyncio.sleep(0.3)
                dev_res = await get_devices(plugin)
                if dev_res.get("devices"):
                    break
```
*(Reuse this exact pattern in `pull_playback_to_deck(plugin)` with bounded polling for the local device name and `PUT me/player` with `{"device_ids": [local_id], "play": True}`.)*

---

### `py_modules/volume.py` (service, event-driven)

**Analog:** `py_modules/volume.py` (lines 316-350, 425-475)

**Target sink volume calculation (preserving game override & ducking)** (`py_modules/volume.py` lines 316-325, 349-350):
```python
    def _compute_target_sink_volume(self) -> float:
        """Compute target sink-input percentage from game override, active ducking reasons, and settings."""
        settings = getattr(self.plugin, "_settings", {})
        baseline_sink_vol = 150.0 if getattr(self.plugin, "_pa_volume_boosted", False) else 100.0

        override = self._game_override if isinstance(self._game_override, dict) else None
        vol_override = override.get("volume_override") if override is not None else None
        ceiling_factor = (max(0, min(100, int(vol_override))) / 100.0) if vol_override is not None else 1.0
...
        return baseline_sink_vol * final_factor
```

**Sleep lock & `fade_to` pattern** (`py_modules/volume.py` lines 425-459):
```python
    async def start_sleep_fade(self, duration_sec: float) -> None:
        """Acquire sleep priority lock and fade sink volume to 0%, awaiting completion."""
        self._sleep_locked = True
        await self.fade_to(0.0, duration_sec)
        if self._fade_task and not self._fade_task.done():
            await self._fade_task

    async def release_sleep_lock(self, restore_duration: float = 0.0, wait: bool = False) -> None:
        """Release sleep priority lock and restore to active ducked or baseline target."""
        self._sleep_locked = False
        target_vol = self._compute_target_sink_volume()
        await self.fade_to(target_vol, restore_duration)
        if wait and self._fade_task and not self._fade_task.done():
            await self._fade_task

    async def fade_to(self, target_sink_volume: float, duration_sec: float) -> None:
        """Fade volume smoothly using cosine easing curve."""
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
*(Any crossfade transition helper on `VolumeFader` MUST guard `if self._sleep_locked: return` and fade back in to `self._compute_target_sink_volume()`. Also add `set_device_volume(plugin, device_id, volume_percent)` following the `_exec(_spotify_api_request, ...)` pattern.)*

---

### `py_modules/engine.py` (service, file-I/O)

**Analog:** `py_modules/engine.py` (lines 13-47)

**Spotify Desktop `prefs` update pattern** (`py_modules/engine.py` lines 13-31):
```python
def _update_spotify_prefs_content(
    existing_text: str,
    audio_quality: str,
    gapless: bool = True,
    normalisation: bool = True,
) -> str:
    """Update Spotify Desktop Client prefs text with quality, lossless, gapless, and normalization settings."""
    enum_map = {"96": 2, "160": 3, "320": 4, "lossless": 5}
    q_enum = enum_map.get(str(audio_quality).lower(), 4)
    desired = {
        "audio.play_bitrate_enumeration": str(q_enum),
        "audio.play_bitrate_non_metered_enumeration": str(q_enum),
        "audio.sync_bitrate_enumeration": str(q_enum),
        "audio.play_bitrate_non_metered_migrated": "true",
        "audio.hifi_upgraded": "true" if str(audio_quality).lower() == "lossless" else "false",
        "audio.gapless_v2": "true" if gapless else "false",
        "audio.normalize_v2": "true" if normalisation else "false",
    }
```
*(Extend `_update_spotify_prefs_content` with `crossfade_seconds: int = 0` writing `audio.crossfade_v2` and `audio.crossfade.time_v2`.)*

---

### `main.py` (controller, request-response)

**Analog:** `main.py` (lines 404-451, 636-662, 764-830)

**CDP `SettingsAPI` React fiber traversal pattern** (`main.py` lines 404-451):
```python
    async def _sync_spotify_client_quality_cdp(self, quality: str) -> None:
        """Apply streaming quality live inside the running Official Spotify Client via SettingsAPI."""
        if not self._spotify_client_process or self._spotify_client_process.poll() is not None:
            return
        ...
          for (const [k, v] of reg.entries()) {{
            if (String(k.description) === 'SettingsAPI') {{
              const s = v.instance;
              if (s.quality && s.quality.streamingQuality && typeof s.quality.streamingQuality.setValue === 'function') {{
                await s.quality.streamingQuality.setValue({q_enum});
                return true;
              }}
            }}
          }}
          return false;
        }})()
        """
        try:
            await _exec(_cdp_evaluate, expr, SPOTIFY_CDP_PORT, None, 4.0, timeout=5)
        except Exception as e:
            decky.logger.debug("CDP quality sync failed: %s", e)
```

**`get_status()` `public_keys` whitelist** (`main.py` lines 636-662):
```python
        public_keys = (
            "device_name", "audio_backend", "audio_quality", "bitrate",
            ...
            "accent_theme", "eco_mode_enabled",
            "eco_timeout_minutes", "eco_sleep_spotify_client",
        )
```

**Integer setting validation in `set_setting`** (`main.py` lines 824-830):
```python
        elif key == "eco_timeout_minutes":
            if isinstance(value, bool):
                return {"ok": False, "error": "eco_timeout_minutes must be an integer between 5 and 30"}
            try:
                raw_int = int(value)
            except (TypeError, ValueError):
                return {"ok": False, "error": "eco_timeout_minutes must be an integer between 5 and 30"}
```

---

### `src/components/tabs/SettingsTab.test.tsx` (test, component)

**Analog:** `src/components/tabs/SettingsTab.test.tsx` (lines 1-112)

**Vitest JSX-tree mock & `findNodes` pattern** (`src/components/tabs/SettingsTab.test.tsx` lines 10-54, 113-120):
```typescript
vi.mock("@decky/api", () => ({
  callable: (name: string) => {
    if (name === "set_setting") {
      return (...args: any[]) => mockSetSetting(...args);
    }
    ...
    return vi.fn().mockResolvedValue({ ok: true });
  },
  addEventListener: (...args: any[]) => (mockAddEventListener as any)(...args),
  removeEventListener: (...args: any[]) => (mockRemoveEventListener as any)(...args),
}));

vi.mock("@decky/ui", () => ({
  DialogButton: ({ children, ...props }: any) => ({
    type: "DialogButton",
    props: { children, ...props },
  }),
  Focusable: ({ children, ...props }: any) => ({
    type: "Focusable",
    props: { children, ...props },
  }),
  SliderField: (props: any) => ({
    type: "SliderField",
    props,
  }),
  ...
}));
```

---

### `src/components/tabs/DevicesTab.test.tsx` (test, component)

**Analog:** `src/components/tabs/QueueTab.test.tsx` (lines 1-115) & `src/components/tabs/SettingsTab.test.tsx` (lines 10-104)

**Pure JSX-tree component test pattern** (`src/components/tabs/QueueTab.test.tsx` lines 21-79):
```typescript
vi.mock("react", () => ({
  useState: (init: any) => [init, vi.fn()],
  useEffect: (fn: any) => fn(),
  useCallback: (fn: any) => fn,
  useRef: (init: any) => ({ current: init }),
  useMemo: (fn: any) => fn(),
}));

vi.mock("@decky/api", () => ({
  callable: () => vi.fn(),
}));

vi.mock("@decky/ui", () => ({
  Focusable: ({ children, ...props }: any) => ({
    type: "Focusable",
    props: { children, ...props },
  }),
}));

function findNodes(tree: any, predicate: (node: any) => boolean, results: any[] = []): any[] { ... }
function cleanText(tree: any): string { ... }
```
*(Mock `react-icons/fa` icons and `@decky/ui` `SliderField` / `DialogButton` / `Focusable` following `SettingsTab.test.tsx`.)*

---

### `tests/test_connect_hub.py` (test, request-response)

**Analog:** `tests/test_device_and_engine.py` (lines 1-38) & `tests/test_volume.py` (lines 11-20)

**Decky module mock + `IsolatedAsyncioTestCase` pattern** (`tests/test_volume.py` lines 11-22):
```python
with patch.dict("sys.modules", {"decky": SimpleNamespace(
    DECKY_PLUGIN_SETTINGS_DIR=tempfile.gettempdir(),
    DECKY_PLUGIN_DIR=tempfile.gettempdir(),
    DECKY_PLUGIN_RUNTIME_DIR=tempfile.gettempdir(),
    logger=MagicMock(),
    emit=AsyncMock(),
)}):
    from py_modules import common, volume
```

---

### `tests/test_crossfade.py` (test, event-driven)

**Analog:** `tests/test_volume.py` (lines 1-90)

**`TestVolumeFader` setup pattern** (`tests/test_volume.py` lines 22-33):
```python
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

## Shared Patterns

### Structured RPC Error Handling
**Source:** `py_modules/rpc_playback.py` (lines 456-486), `main.py` (lines 764-830)
**Apply to:** `py_modules/rpc_playback.py`, `py_modules/volume.py`, `main.py`
All RPC methods return `{"ok": True, ...}` on success and catch `urllib.error.HTTPError` (via `_parse_spotify_error(e)`) and `Exception` to return `{"ok": False, "error": ...}` without crashing the event loop.

### GamepadUI Spatial Navigation & Compact Button Sizing
**Source:** `GEMINI.md`, `src/components/tabs/DevicesTab.tsx`, `src/components/tabs/SettingsTab.tsx`
**Apply to:** `src/components/tabs/DevicesTab.tsx`, `src/components/tabs/SettingsTab.tsx`
Horizontal button containers MUST use `flow-children="horizontal"` (never `"row"`), and compact `DialogButton`s MUST set `style={{ width: "auto", minWidth: "auto" }}` to override SteamOS 100% button width.

### `VolumeFader` Priority Lock & Target Computation
**Source:** `py_modules/volume.py` (lines 316-350, 425-439)
**Apply to:** `py_modules/volume.py`, `main.py`
Any crossfade fade-out or fade-in MUST check `if self._sleep_locked: return` before altering sink volume, and fade-in MUST target `self._compute_target_sink_volume()` so per-game volume ceilings and active ducking are preserved.

### ESLint Complexity & Function Length Limits
**Source:** `eslint.config.js` (lines 25-31)
**Apply to:** `src/components/tabs/DevicesTab.tsx`, `src/components/tabs/SettingsTab.tsx`
Split device icon mapping, local device card, remote volume slider, and empty state into focused helper functions/sub-components so functions stay under 80 lines and cyclomatic complexity stays under 15.

## No Analog Found

All 12 new/modified files have direct, high-confidence analogs in the existing codebase.

## Metadata

**Analog search scope:** `src/components/tabs/`, `src/`, `py_modules/`, `main.py`, `tests/`
**Files scanned:** 12 target files + 10 analog/test files
**Pattern extraction date:** 2026-11-22
