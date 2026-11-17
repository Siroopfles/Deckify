# Phase 17: Event-Driven librespot & Suspend/Wi-Fi Resilience - Pattern Map

**Mapped:** 2026-11-17
**Files analyzed:** 9
**Analogs found:** 9 / 9

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `py_modules/resilience.py` | service | event-driven, file-I/O | `py_modules/dock.py` (with `py_modules/device.py` for lifecycle) | exact |
| `py_modules/common.py` | config | file-I/O | `py_modules/common.py` (self — `DEFAULT_SETTINGS` & `_load_settings_impl`) | exact |
| `main.py` | controller | event-driven, request-response | `main.py` (self — `_on_deck_resume`, `_monitor_process`, `_poll_api_loop`, `start_librespot`) | exact |
| `src/types.ts` | model | — | `src/types.ts` (self — `DockStatusInfo`, `EngineSettings`, `StatusResponse`) | exact |
| `src/hooks/usePlaybackStatus.ts` | hook | event-driven, request-response | `src/index.tsx` (`DeckifyOverlayWrapper` `addEventListener` block) | role-match |
| `src/index.tsx` | component | event-driven, request-response | `src/index.tsx` (self — `DeckifyOverlayWrapper` + `QuickAccessMenu` `dock_audio_switched` listener) | exact |
| `src/components/tabs/SettingsTab.tsx` | component | CRUD | `src/components/tabs/SettingsTab.tsx` (self — Docked Audio-Switching card & Sleep Timer `SliderField`) | exact |
| `tests/test_resilience.py` | test | unit | `tests/test_dock.py` | exact |
| `src/index.test.tsx` | test | unit | `src/components/tabs/SettingsTab.test.tsx` (and `src/index.test.tsx` self) | exact |

---

## Pattern Assignments

### `py_modules/resilience.py` (service, event-driven / file-I/O)

**Analog:** `py_modules/dock.py` (and `py_modules/device.py` for `SuspendResumeMonitor` lifecycle)

**Imports & module setup** (`py_modules/dock.py`, lines 1-12):
```python
import asyncio
import shutil
import subprocess

from py_modules import volume
from py_modules.common import _build_deck_command, _exec, decky
```

**Async service class with `asyncio.Lock`, debounce task, and `start()`/`stop()` lifecycle** (`py_modules/dock.py`, lines 134-198):
```python
class DockAudioSwitcher:
    """Supervises docked USB-DAC/HDMI audio hotplugs and routes Deckify's stream cleanly."""

    def __init__(self, plugin):
        self._plugin = plugin
        self._status: str = "idle"
        ...
        self._eval_lock = asyncio.Lock()
        self._running: bool = False
        self._monitor_task: asyncio.Task | None = None
        self._debounce_task: asyncio.Task | None = None
        self._proc: asyncio.subprocess.Process | None = None

    def start(self) -> None:
        """Start the background `pactl subscribe` hotplug monitor."""
        if self._running:
            return
        self._running = True
        self._monitor_task = asyncio.create_task(self._monitor_loop())

    async def stop(self) -> None:
        """Stop the hotplug monitor and cancel any pending debounce timer."""
        self._running = False
        if self._debounce_task:
            self._debounce_task.cancel()
            try:
                await self._debounce_task
            except asyncio.CancelledError:
                pass
            self._debounce_task = None
        ...
```
Copy this exact pattern for:
- `LibrespotEventServer` (`start()`, `stop()` closing `asyncio.Server` and removing socket file, `_schedule_debounced_enrichment()` cancelling previous `_debounce_task` before sleeping `0.4s` and calling `_plugin._poll_playback()`).
- `SessionBookmarkManager` (`self._recovery_lock = asyncio.Lock()` + cooldown timestamp guarding `handle_wake_recovery(source=...)`, atomic JSON persistence via temp file + `os.replace()`).

---

### `py_modules/common.py` (config, file-I/O)

**Analog:** `py_modules/common.py` (self)

**Runtime path constants** (`py_modules/common.py`, lines 40-46):
```python
SETTINGS_FILE = os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, "settings.json")
LIBRESPOT_BIN = os.path.join(decky.DECKY_PLUGIN_DIR, "bin", "librespot")
CACHE_DIR = os.path.join(decky.DECKY_PLUGIN_RUNTIME_DIR, "cache")
LIBRESPOT_PID_FILE = os.path.join(decky.DECKY_PLUGIN_RUNTIME_DIR, "librespot.pid")
```
Add `ONEVENT_SOCK_FILE`, `ONEVENT_EMITTER_SCRIPT`, and `SESSION_BOOKMARK_FILE` under `decky.DECKY_PLUGIN_RUNTIME_DIR` using the same pattern.

**`DEFAULT_SETTINGS` additions** (`py_modules/common.py`, lines 116-123):
```python
    "sleep_timer_fade_enabled": True,
    "sleep_timer_fade_duration": 30,
    "dock_auto_switch_enabled": False,
    "dock_target_sink": "auto",
    "dock_respect_bluetooth": True,
    "dock_pause_on_undock": False,
    "dock_toast_enabled": True,
```

**Settings validation & clamping in `_load_settings_impl`** (`py_modules/common.py`, lines 293-300):
```python
        if not isinstance(merged.get("sleep_timer_fade_enabled"), bool):
            merged["sleep_timer_fade_enabled"] = bool(merged.get("sleep_timer_fade_enabled", True))
        try:
            merged["sleep_timer_fade_duration"] = max(5, min(120, int(merged.get("sleep_timer_fade_duration", 30))))
        except (TypeError, ValueError):
            merged["sleep_timer_fade_duration"] = 30
```
Apply the same boolean coercion and `max(1, min(24, int(...)))` clamping for `resilience_bookmark_expiry_hours` and the `resilience_*` booleans.

---

### `main.py` (controller, event-driven / request-response)

**Analog:** `main.py` (self)

**Manager initialization & teardown in `_main()` / `_unload()`** (`main.py`, lines 144-182):
```python
        self._suspend_monitor = SuspendResumeMonitor(
            on_sleep=self._on_deck_sleep,
            on_resume=self._on_deck_resume,
        )
        self._suspend_monitor.start()
        ...
        self._dock_switcher = dock.DockAudioSwitcher(self)
        self._dock_switcher.start()
```
And in `_unload()` (`main.py`, lines 166-180):
```python
        if getattr(self, "_dock_switcher", None):
            await self._dock_switcher.stop()
            self._dock_switcher = None
```
Instantiate and start `LibrespotEventServer` + `SessionBookmarkManager` in `_main()` (before `start_librespot()`), and stop them cleanly in `_unload()` and `_uninstall()`.

**`start_librespot()` command & env wiring** (`main.py`, lines 451-474):
```python
        cmd = [
            LIBRESPOT_BIN,
            "--name", settings.get("device_name") or socket.gethostname(),
            "--device-type", "computer",
            "--bitrate", bitrate_str,
            "--backend", "pulseaudio",
            "--system-cache", CACHE_DIR,
        ]
        ...
        env = os.environ.copy()
        env["PULSE_SERVER"] = PULSE_SERVER
```
Write/chmod the POSIX `sh` emitter script in `DECKY_PLUGIN_RUNTIME_DIR`, append `"--onevent", emitter_path`, and set `env["DECKIFY_EVENT_SOCK"] = ONEVENT_SOCK_FILE`.

**Unified wake lock in `_on_deck_resume()` and `_monitor_process()`** (`main.py`, lines 194-205 and 1608-1621):
```python
    async def _on_deck_resume(self):
        decky.logger.info("Deck resumed from suspend - recovering token and audio state")
        try:
            await self._ensure_token()
            await self._poll_playback()
            await self._refresh_audio_stream_info()
            await decky.emit("deck_resumed")
        except Exception as e:
            decky.logger.warning("Resume handler error: %s", e)
```
```python
                if elapsed > SUSPEND_THRESHOLD and active_proc and active_proc.poll() is None:
                    decky.logger.info(
                        "System wake detected (gap=%.0fs), restarting %s", elapsed, backend,
                    )
                    if backend == "spotify_client":
                        await self._kill_spotify_client()
                        await self.start_spotify_client()
                    else:
                        await self._kill_librespot()
                        await self.start_librespot()
                    self._crash_timestamps.clear()
                    self._stable_start = time.time()
                    last_tick = time.time()
                    continue
```
Route both `_on_deck_resume()` and `_monitor_process()` (`elapsed > SUSPEND_THRESHOLD`) through `self._bookmark_manager.handle_wake_recovery(source=...)` so they share a single `asyncio.Lock` and cooldown.

**Adaptive `_poll_api_loop()`** (`main.py`, lines 1685-1692):
```python
    async def _poll_api_loop(self):
        """Poll Spotify Web API for playback state, independent of librespot process."""
        try:
            while True:
                await self._poll_playback()
                await asyncio.sleep(3)
        except asyncio.CancelledError:
            pass
```
Replace `await asyncio.sleep(3)` with `asyncio.wait_for(self._poll_wake_event.wait(), timeout=interval)` where `interval` is `20.0` when `audio_backend == "librespot"`, `librespot` is running, `--onevent` is healthy, and local `librespot` is active; `3.0` otherwise.

---

### `src/types.ts` (model)

**Analog:** `src/types.ts` (self)

**Status info interface & `EngineSettings` / `StatusResponse` extensions** (`src/types.ts`, lines 160-166, 226-231, 279-281):
```typescript
export interface DockStatusInfo {
  status: DockStatusState;
  active_sink: string | null;
  active_sink_label: string;
  pre_dock_sink: string | null;
  manual_override: boolean;
}
```
```typescript
  dock_auto_switch_enabled?: boolean;
  dock_target_sink?: string;
  dock_respect_bluetooth?: boolean;
  dock_pause_on_undock?: boolean;
  dock_toast_enabled?: boolean;
```
```typescript
  sleep_timer?: SleepTimerStatus;
  dock_status?: DockStatusInfo;
```
Follow this exact naming and optional-field pattern for `ResilienceStatusInfo`, `HeldBookmarkInfo`, `resilience_*` keys on `EngineSettings`, and `resilience_status?: ResilienceStatusInfo` on `StatusResponse`.

---

### `src/hooks/usePlaybackStatus.ts` (hook, event-driven / request-response)

**Analog:** `src/index.tsx` (`DeckifyOverlayWrapper` `addEventListener` block, lines 928-958)

**`addEventListener` + cleanup pattern** (`src/index.tsx`, lines 928-958):
```typescript
    const unsubMeta = addEventListener<[any]>("track_metadata", (meta: any) => {
      if (meta) {
        setTrack(meta);
        if (meta.duration_ms) setDurationMs(meta.duration_ms);
      }
    });
    const unsubLibre = addEventListener<[any]>("librespot_event", (ev: any) => {
      if (ev?.event === "playing") setIsPlaying(true);
      else if (ev?.event === "paused" || ev?.event === "stopped") setIsPlaying(false);
      if (typeof ev?.position_ms === "number") setPositionMs(ev.position_ms);
      if (typeof ev?.duration_ms === "number") setDurationMs(ev.duration_ms);
    });
    ...
    return () => {
      ...
      removeEventListener("track_metadata", unsubMeta);
      removeEventListener("librespot_event", unsubLibre);
    };
```
Subscribe to `"librespot_event"` and `"track_metadata"` inside `usePlaybackStatus` (`src/hooks/usePlaybackStatus.ts`, lines 52-56) using functional `setStatus((prev) => ...)` updates so Expanded Modal state updates immediately without waiting for the 1.5s `get_status` poll.

---

### `src/index.tsx` (component, event-driven / request-response)

**Analog:** `src/index.tsx` (self — `QuickAccessMenu` `addEventListener` + `toaster.toast` block, lines 303-333, and `DeckifyOverlayWrapper`, lines 928-958)

**Event listener + Decky toast pattern in `QuickAccessMenu`** (`src/index.tsx`, lines 303-333):
```typescript
    const unsubDock = addEventListener<[any]>("dock_audio_switched", (data: any) => {
      try {
        if (!data || data.toast_enabled === false || dockToastEnabledRef.current === false) {
          return;
        }
        ...
        if (body) {
          toaster.toast({
            title: "Deckify",
            body,
            duration: 3500,
          });
        }
      } catch {}
    });

    return () => {
      ...
      removeEventListener("dock_audio_switched", unsubDock);
    };
```
Add listeners in `QuickAccessMenu` for `"librespot_event"`, `"track_metadata"`, `"resilience_status"`, and `"session_restored"` (showing a brief `toaster.toast` when `toast_enabled` is not false), plus a compact conditional `"Resume Bookmark"` button rendered only when `resilienceStatus?.held_bookmark` is present and `resilience_prompt_held_enabled` is true.

---

### `src/components/tabs/SettingsTab.tsx` (component, CRUD / settings UI)

**Analog:** `src/components/tabs/SettingsTab.tsx` (self — Docked Audio-Switching card, lines 667-747, and Sleep Timer `SliderField`, lines 907-920)

**Card header with live status badge + `ToggleField` list** (`src/components/tabs/SettingsTab.tsx`, lines 699-747):
```tsx
          <div style={{ marginBottom: 20, padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
                <FaPlug /> Docked Audio-Switching
              </h3>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  ...badgeStyle,
                }}
              >
                {badgeLabel}
              </span>
            </div>

            <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
              <ToggleField
                label="Auto-Switch on Dock"
                description="..."
                checked={dockAutoSwitchEnabled}
                onChange={(v: boolean) => {
                  updateSetting("dock_auto_switch_enabled", v);
                  showToast(v ? "Docked audio-switching enabled" : "Docked audio-switching disabled");
                }}
              />
```

**`SliderField` with clamping & `showValue`** (`src/components/tabs/SettingsTab.tsx`, lines 907-920):
```tsx
          {(localSettings.sleep_timer_fade_enabled ?? status?.settings?.sleep_timer_fade_enabled ?? true) && (
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
          )}
```
Build the `"Playback Resilience"` card following this exact layout: status badge (`--onevent` live / `3s` fallback), `ToggleField`s for auto-resume, never-expires, restore toast, and held-bookmark prompt, `SliderField` (`min={1}`, `max={24}`, `step={1}`, `showValue`) when `never_expires` is false, and a manual `"Resume Bookmark"` action row when a bookmark is held.

---

### `tests/test_resilience.py` (test, unit)

**Analog:** `tests/test_dock.py`

**`decky` sys.modules mock & `IsolatedAsyncioTestCase` structure** (`tests/test_dock.py`, lines 1-20, 41-65):
```python
import asyncio
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
    from py_modules import common, dock, volume
```
Use `unittest.TestCase` for pure helpers (`normalize_spotify_id`, `DEFAULT_SETTINGS`, payload parsing) and `unittest.IsolatedAsyncioTestCase` for async `LibrespotEventServer`, `SessionBookmarkManager`, wake lock, Wi-Fi grace window, and adaptive `_poll_api_loop` tests.

---

### `src/index.test.tsx` (test, unit)

**Analog:** `src/components/tabs/SettingsTab.test.tsx` (and `src/index.test.tsx` self)

**`@decky/api` + `@decky/ui` Vitest mock & `findNodes` tree inspection** (`src/components/tabs/SettingsTab.test.tsx`, lines 1-35, 85-100):
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSetSetting = vi.fn().mockResolvedValue({ ok: true });
const mockAddEventListener = vi.fn(() => "listener-token");
const mockRemoveEventListener = vi.fn();

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
```
Use this pattern (extending `src/index.test.tsx` and/or `src/components/tabs/SettingsTab.test.tsx`) to test `librespot_event` immediate state updates, the `"Playback Resilience"` card in `SettingsTab`, and conditional QAM `"Resume Bookmark"` rendering.

---

## Shared Patterns

### Decky Event Push (`decky.emit` → `addEventListener` / `removeEventListener`)
**Source:** `main.py:494`, `src/index.tsx:303-332`, `src/index.tsx:928-957`
**Apply to:** `py_modules/resilience.py`, `main.py`, `src/hooks/usePlaybackStatus.ts`, `src/index.tsx`
Backend emits structured dicts via `await decky.emit("<event_name>", payload)`; React components register listeners in `useEffect` with `addEventListener` and clean up with `removeEventListener` on unmount.

### Settings Persistence & Validation (`DEFAULT_SETTINGS` + `set_setting` + `updateSetting`)
**Source:** `py_modules/common.py:70-123,293-300`, `src/components/tabs/SettingsTab.tsx:720-747,907-920`
**Apply to:** `py_modules/common.py`, `src/types.ts`, `src/components/tabs/SettingsTab.tsx`
All new settings keys are declared with defaults in `DEFAULT_SETTINGS`, validated/clamped in `_load_settings_impl`, typed as optional properties on `EngineSettings`, and updated in `SettingsTab.tsx` via `updateSetting(key, value)`.

### Subprocess Environment Isolation (`LD_LIBRARY_PATH` stripping)
**Source:** `py_modules/common.py:38,357-377`, `main.py:471-473`
**Apply to:** `py_modules/resilience.py`, `main.py`
Never inherit Decky's `LD_LIBRARY_PATH` when spawning `librespot` or host binaries; use `_build_deck_command` or `os.environ` with `LD_LIBRARY_PATH` already popped.

---

## No Analog Found

None — all 9 new or modified files have direct analogs in the tracked codebase.

## Metadata

**Analog search scope:** `py_modules/`, `main.py`, `src/`, `tests/`
**Files scanned:** 10
**Pattern extraction date:** 2026-11-17
