# Phase 18: MPRIS2 D-Bus Bridge - Pattern Map

**Mapped:** 2026-11-18
**Files analyzed:** 10
**Analogs found:** 10 / 10

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `py_modules/mpris.py` (new) | service | event-driven | `py_modules/dock.py` + `py_modules/resilience.py` | role-match |
| `py_modules/images.py` | utility | file-I/O | `py_modules/images.py` | exact |
| `py_modules/common.py` | config | CRUD | `py_modules/common.py` | exact |
| `py_modules/__init__.py` | config | transform | `py_modules/__init__.py` | exact |
| `py_modules/resilience.py` | service | event-driven | `py_modules/resilience.py` | exact |
| `py_modules/rpc_playback.py` | service | request-response | `py_modules/rpc_playback.py` | exact |
| `main.py` | controller | request-response | `main.py` | exact |
| `src/types.ts` | model | transform | `src/types.ts` | exact |
| `src/components/tabs/SettingsTab.tsx` | component | CRUD | `src/components/tabs/SettingsTab.tsx` | exact |
| `tests/test_mpris.py` (new) | test | event-driven | `tests/test_resilience.py` + `tests/test_dock.py` | exact |

---

## Pattern Assignments

### `py_modules/mpris.py` (service, event-driven)

**Analog:** `py_modules/dock.py` (lines 73-273) & `py_modules/resilience.py` (lines 68-86, 230-390)

**Imports & module setup pattern** (`py_modules/dock.py` lines 1-10, `py_modules/resilience.py` lines 3-17):
```python
"""Pure-Python MPRIS2 D-Bus bridge (org.mpris.MediaPlayer2.deckify) and BlueZ mpris-proxy supervisor."""

import asyncio
import json
import os
import shutil
import socket
import struct
import subprocess
import sys
import time
from pathlib import Path

from py_modules import common, images, resilience, volume
from py_modules.common import (
    DBUS_SESSION_BUS_ADDRESS,
    DECK_UID,
    DECK_USER,
    _build_deck_command,
    _exec,
    decky,
)
```

**Subprocess privilege-drop & environment isolation pattern** (`py_modules/dock.py` lines 77-80, 207-214):
```python
cmd, env = _build_deck_command(["pactl", "subscribe"])
env.pop("LD_LIBRARY_PATH", None)
self._proc = await asyncio.create_subprocess_exec(
    *cmd,
    env=env,
    stdout=asyncio.subprocess.PIPE,
    stderr=asyncio.subprocess.DEVNULL,
)
```

**Manager lifecycle (`start`, `stop`, `on_settings_changed`, `get_status_dict`) pattern** (`py_modules/dock.py` lines 134-182, 245-273):
```python
class DockAudioSwitcher:
    def __init__(self, plugin):
        self._plugin = plugin
        self._status: str = "idle"
        self._running: bool = False
        self._monitor_task: asyncio.Task | None = None
        self._proc: asyncio.subprocess.Process | None = None

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._monitor_task = asyncio.create_task(self._monitor_loop())

    async def stop(self) -> None:
        self._running = False
        if self._proc:
            try:
                self._proc.terminate()
                await self._proc.wait()
            except Exception:
                pass
            self._proc = None
        if self._monitor_task:
            self._monitor_task.cancel()
            try:
                await self._monitor_task
            except asyncio.CancelledError:
                pass
            self._monitor_task = None

    def get_status_dict(self) -> dict:
        return {
            "status": self._status,
            ...
        }
```

**VolumeFader safe coordination pattern for D-02** (`py_modules/volume.py` lines 26-46, 220-230, 272-326):
```python
# When writing Volume (0.0..1.0) from D-Bus:
# 1. Clamp to 0.0..1.0 -> target_pct = max(0, min(100, int(round(val * 100))))
# 2. Check plugin._volume_fader:
fader = getattr(self._plugin, "_volume_fader", None)
if fader is not None and getattr(fader, "_sleep_locked", False):
    # Do not clobber an active sleep timer fade-to-zero (D-02)
    return
self._plugin._poll_volume = target_pct
await self._plugin.set_volume(target_pct)
if fader is not None and fader.is_ducked:
    # Recalculate ducked sink-input target without clearing fader._duck_reasons
    target_sink_vol = fader._compute_target_sink_volume()
    await fader.fade_to(target_sink_vol, 0.15)
```

---

### `py_modules/images.py` (utility, file-I/O)

**Analog:** `py_modules/images.py` (lines 7-8, 79-96, 123-145)

**Disk cache lookup & URL normalization pattern** (`py_modules/images.py` lines 79-95, 123-145):
```python
IMAGE_CACHE_DIR = os.path.join(CACHE_DIR, "images")
...
def _fetch_spotify_image(url: str) -> tuple[str, bytes]:
    _validate_image_url(url)
    # Check disk cache
    url_hash = hashlib.sha256(url.encode("utf-8")).hexdigest()
    cache_path = os.path.join(IMAGE_CACHE_DIR, f"{url_hash}.bin")
    meta_path = os.path.join(IMAGE_CACHE_DIR, f"{url_hash}.meta")
    if os.path.isfile(cache_path) and os.path.isfile(meta_path):
        ...
```

**Pattern to add for `get_cached_image_file_uri(url)` (D-03)**:
```python
from pathlib import Path

def get_cached_image_file_uri(url: str | None) -> str:
    """Return local file:// URI if cover art is cached on disk, else fallback to HTTPS URL (D-03)."""
    if not url or not isinstance(url, str):
        return ""
    cleaned = _proxy_spotify_image_url(url) or url.strip()
    if not cleaned:
        return ""
    try:
        url_hash = hashlib.sha256(cleaned.encode("utf-8")).hexdigest()
        cache_path = os.path.join(IMAGE_CACHE_DIR, f"{url_hash}.bin")
        if os.path.isfile(cache_path) and os.path.getsize(cache_path) > 0:
            return Path(cache_path).resolve().as_uri()
    except Exception:
        pass
    return cleaned
```

---

### `py_modules/common.py` & `py_modules/__init__.py` (config, CRUD / transform)

**Analog:** `py_modules/common.py` (lines 121-131, 307-324) & `py_modules/__init__.py` (lines 39-46, 78-84, 122-127)

**Default settings & boolean sanitization pattern** (`py_modules/common.py` lines 126-131, 307-315):
```python
    "resilience_auto_resume": True,
    "resilience_bookmark_expiry_hours": 12,
    "resilience_bookmark_never_expires": False,
    "resilience_toast_enabled": True,
    "resilience_prompt_held_enabled": True,
    "mpris_enabled": True,
    "mpris_auto_proxy": True,
```
```python
        for _rbool, _rdef in (
            ("resilience_auto_resume", True),
            ("resilience_bookmark_never_expires", False),
            ("resilience_toast_enabled", True),
            ("resilience_prompt_held_enabled", True),
            ("mpris_enabled", True),
            ("mpris_auto_proxy", True),
        ):
            if not isinstance(merged.get(_rbool), bool):
                merged[_rbool] = bool(merged.get(_rbool, _rdef))
```

**Module re-export pattern** (`py_modules/__init__.py` lines 39-46, 78-84):
```python
from py_modules.images import (
    _validate_image_url,
    _ImageRedirectHandler,
    _fetch_spotify_image,
    _proxy_spotify_image_url,
    _image_url,
    _proxy_folder_tree_images,
    get_cached_image_file_uri,
)
...
from py_modules import resilience
from py_modules import mpris
```

---

### `py_modules/resilience.py` & `py_modules/rpc_playback.py` (service, event-driven / request-response)

**Analog:** `py_modules/resilience.py` (lines 359-368) & `py_modules/rpc_playback.py` (lines 64-70, 91-95, 114-121, 141-148)

**`LibrespotEventServer.process_payload` manager notification hook** (`py_modules/resilience.py` lines 359-368):
```python
        # Notify SessionBookmarkManager if wired
        bookmark_mgr = getattr(self._plugin, "_bookmark_manager", None)
        if bookmark_mgr is not None and hasattr(bookmark_mgr, "on_onevent"):
            try:
                await bookmark_mgr.on_onevent(event_dict)
            except Exception as e:
                decky.logger.debug("Bookmark manager on_onevent error: %s", e)

        # Notify MprisBridge if wired (D-04: immediate event-driven PropertiesChanged / Seeked)
        mpris_bridge = getattr(self._plugin, "_mpris_bridge", None)
        if mpris_bridge is not None and hasattr(mpris_bridge, "on_onevent"):
            try:
                await mpris_bridge.on_onevent(event_dict)
            except Exception as e:
                decky.logger.debug("MPRIS bridge on_onevent error: %s", e)

        await decky.emit("librespot_event", event_dict)
```

**Optimistic state notification in `rpc_playback.py`** (`py_modules/rpc_playback.py` lines 91-95, 114-121, 141-148):
```python
        await _exec(_spotify_api_request, "me/player/seek", token, "PUT", params)
        if plugin._last_event:
            plugin._last_event["position_ms"] = position_ms
        mpris_bridge = getattr(plugin, "_mpris_bridge", None)
        if mpris_bridge is not None and hasattr(mpris_bridge, "notify_seeked"):
            await mpris_bridge.notify_seeked(position_ms)
        return {"ok": True, "position_ms": position_ms}
```

---

### `main.py` (controller, request-response)

**Analog:** `main.py` (lines 45-49, 120-137, 162-186, 560-614, 666-667, 760-772, 1018-1032, 1538-1662)

**Plugin init, `_main`, and `_unload` manager wiring** (`main.py` lines 133-136, 162-167, 179-185):
```python
        self._event_server = resilience.LibrespotEventServer(self)
        self._bookmark_manager = resilience.SessionBookmarkManager(self)
        self._mpris_bridge = mpris.MprisBridge(self)
```
```python
        # In _main():
        self._mpris_bridge = mpris.MprisBridge(self)
        await self._mpris_bridge.start()

        # In _unload() and _uninstall():
        if getattr(self, "_mpris_bridge", None):
            await self._mpris_bridge.stop()
            self._mpris_bridge = None
```

**`get_status()` public keys & status dictionary pattern** (`main.py` lines 560-566, 601-614):
```python
            "resilience_auto_resume", "resilience_bookmark_expiry_hours",
            "resilience_bookmark_never_expires", "resilience_toast_enabled",
            "resilience_prompt_held_enabled",
            "mpris_enabled", "mpris_auto_proxy",
        )
```
```python
            "mpris_status": (
                self._mpris_bridge.get_status_dict()
                if getattr(self, "_mpris_bridge", None)
                else {
                    "enabled": bool(self._settings.get("mpris_enabled", True)),
                    "bus_registered": False,
                    "proxy_running": False,
                    "proxy_managed": False,
                    "proxy_available": False,
                    "status": "disabled",
                    "bus_name": "org.mpris.MediaPlayer2.deckify",
                }
            ),
```

**`set_setting()` boolean validation & manager notification pattern** (`main.py` lines 666-667, 760-772):
```python
        elif key in (..., "mpris_enabled", "mpris_auto_proxy"):
            value = bool(value)
...
        if key in ("mpris_enabled", "mpris_auto_proxy") and getattr(self, "_mpris_bridge", None):
            await self._mpris_bridge.on_settings_changed(key, value)
```

**`_poll_playback()` state sync hook** (`main.py` lines 1539-1662):
```python
        # At end of _poll_playback() (and on 204 stopped transition at line 1545):
        if getattr(self, "_mpris_bridge", None):
            await self._mpris_bridge.sync_from_plugin()
```

---

### `src/types.ts` (model, transform)

**Analog:** `src/types.ts` (lines 153-186, 246-256, 305-307)

**Status info & `EngineSettings` interface pattern** (`src/types.ts` lines 178-186, 251-256, 305-307):
```typescript
export type MprisBadgeState =
  | "active"
  | "proxy_unavailable"
  | "disabled";

export interface MprisStatusInfo {
  enabled: boolean;
  bus_registered: boolean;
  proxy_running: boolean;
  proxy_managed: boolean;
  proxy_available: boolean;
  status: MprisBadgeState;
  bus_name: string;
}
```
```typescript
// Inside EngineSettings:
  mpris_enabled?: boolean;
  mpris_auto_proxy?: boolean;

// Inside StatusResponse:
  dock_status?: DockStatusInfo;
  resilience_status?: ResilienceStatusInfo;
  mpris_status?: MprisStatusInfo;
```

---

### `src/components/tabs/SettingsTab.tsx` (component, CRUD)

**Analog:** `src/components/tabs/SettingsTab.tsx` (lines 1-6, 80-82, 196-214, 849-958)

**Imports & live status listener pattern** (`src/components/tabs/SettingsTab.tsx` lines 4-5, 80-82, 196-214):
```tsx
import { FaSlidersH, FaClock, FaPowerOff, FaPlug, FaBluetooth } from "react-icons/fa";
import { AudioSinkInfo, EqualizerPreset, MprisStatusInfo, ResilienceStatusInfo, StatusResponse, SleepTimerStatus } from "../../types";
...
  const [liveMprisStatus, setLiveMprisStatus] = useState<MprisStatusInfo | null>(
    () => status?.mpris_status ?? null
  );

  useEffect(() => {
    if (status?.mpris_status !== undefined) {
      setLiveMprisStatus(status.mpris_status ?? null);
    }
  }, [status?.mpris_status]);

  useEffect(() => {
    const handler = (data: any) => {
      if (data && typeof data === "object") {
        setLiveMprisStatus(data as MprisStatusInfo);
      }
      refreshStatus();
    };
    const listener = addEventListener<[any]>("mpris_status", handler);
    return () => {
      removeEventListener("mpris_status", listener);
    };
  }, [refreshStatus]);
```

**Settings card & header status badge pattern** (`src/components/tabs/SettingsTab.tsx` lines 888-926):
```tsx
      {/* Bluetooth & Media Controls (MPRIS2) */}
      {(() => {
        const mprisEnabled = Boolean(
          localSettings.mpris_enabled ?? status?.settings?.mpris_enabled ?? true
        );
        const mprisAutoProxy = Boolean(
          localSettings.mpris_auto_proxy ?? status?.settings?.mpris_auto_proxy ?? true
        );
        const mprisStatus = liveMprisStatus ?? status?.mpris_status ?? null;

        let badgeLabel = "Disabled";
        let badgeStyle: Record<string, any> = { opacity: 0.6 };
        if (mprisEnabled) {
          if (mprisStatus?.bus_registered && mprisStatus?.proxy_running) {
            badgeLabel = "Active (Bluetooth Ready)";
            badgeStyle = { color: "#1db954" };
          } else if (mprisStatus?.bus_registered) {
            badgeLabel = "D-Bus Active (mpris-proxy unavailable)";
            badgeStyle = { opacity: 0.8 };
          } else {
            badgeLabel = "D-Bus Active (mpris-proxy unavailable)";
            badgeStyle = { opacity: 0.7 };
          }
        }

        return (
          <div style={{ marginBottom: 20, padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
                <FaBluetooth /> Bluetooth & Media Controls (MPRIS2)
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

            <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <ToggleField
                label="Enable MPRIS2 Media Controls"
                description="Register org.mpris.MediaPlayer2.deckify on the user session D-Bus for Bluetooth headsets, earbuds, and system media keys."
                checked={mprisEnabled}
                onChange={(v: boolean) => {
                  void updateSetting("mpris_enabled", v);
                  showToast(v ? "MPRIS2 media controls enabled" : "MPRIS2 media controls disabled");
                }}
              />
              {mprisEnabled && (
                <ToggleField
                  label="Auto-Start BlueZ mpris-proxy"
                  description="Automatically run BlueZ mpris-proxy in SteamOS GamepadUI so Bluetooth AVRCP headset buttons work out of the box."
                  checked={mprisAutoProxy}
                  onChange={(v: boolean) => {
                    void updateSetting("mpris_auto_proxy", v);
                    showToast(v ? "Auto mpris-proxy enabled" : "Auto mpris-proxy disabled");
                  }}
                />
              )}
            </Focusable>
          </div>
        );
      })()}
```

---

### `tests/test_mpris.py` (test, event-driven)

**Analog:** `tests/test_resilience.py` (lines 1-115) & `tests/test_dock.py` (lines 1-145)

**Mock `decky` setup & `IsolatedAsyncioTestCase` pattern** (`tests/test_resilience.py` lines 1-27, 95-111):
```python
import asyncio
import json
import os
import sys
import tempfile
import time
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

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
    from py_modules import common, images, mpris, resilience, volume
```

---

## Shared Patterns

### 1. UID 1000 (`deck`) Subprocess Execution & `LD_LIBRARY_PATH` Stripping
**Source:** `py_modules/common.py` (lines 38, 134-136, 384-404) & `py_modules/dock.py` (lines 77-80)
**Apply to:** `py_modules/mpris.py` (both the UID 1000 D-Bus worker subprocess and `mpris-proxy` detection/supervision)
```python
cmd, env = _build_deck_command(["python3", worker_script, "--worker"])
env.pop("LD_LIBRARY_PATH", None)
```

### 2. Resilient Async RPC / Event Emission Error Handling
**Source:** `py_modules/resilience.py` (lines 359-367) & `py_modules/dock.py` (lines 329-337)
**Apply to:** `py_modules/mpris.py`, `py_modules/resilience.py`, `py_modules/rpc_playback.py`, `main.py`
```python
try:
    await decky.emit("mpris_status", self.get_status_dict())
except Exception as err:
    decky.logger.debug("MPRIS status emit failed: %s", err)
```

### 3. GamepadUI Settings Card & Spatial Navigation
**Source:** `src/components/tabs/SettingsTab.tsx` (lines 723-743, 889-915)
**Apply to:** `src/components/tabs/SettingsTab.tsx`
- Card container: `<div style={{ marginBottom: 20, padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>`
- Card header: `display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8` with `#1db954` title and right-aligned status badge span.
- Controls wrapper: `<Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 4 }}>`

---

## No Analog Found

All files have strong codebase analogs. The pure-Python D-Bus binary wire-protocol marshaller/unmarshaller inside `py_modules/mpris.py` is new protocol codec logic, for which `18-RESEARCH.md` (lines 350-462) provides the exact reference implementation.

---

## Metadata

**Analog search scope:** `main.py`, `py_modules/*.py`, `src/**/*.tsx`, `src/types.ts`, `tests/test_*.py`
**Files scanned:** 12
**Pattern extraction date:** 2026-11-18
