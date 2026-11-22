# Phase 21: Dynamic Album-Art Accent Themes & Handheld Battery Eco-Mode - Pattern Map

**Mapped:** 2026-11-22
**Files analyzed:** 15
**Analogs found:** 15 / 15

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `py_modules/eco.py` | service | event-driven / polling | `py_modules/dock.py` | exact |
| `py_modules/common.py` | config | file-I/O | `py_modules/common.py` | exact (self) |
| `py_modules/rpc_playback.py` | controller | request-response | `py_modules/rpc_playback.py` | exact (self) |
| `main.py` | controller / service | request-response | `main.py` | exact (self) |
| `src/utils/accentTheme.ts` | utility | transform | `src/utils/chime.ts` | role-match |
| `src/utils/themeBus.ts` | utility | event-driven | `src/utils/triggerController.ts` | role-match |
| `src/types.ts` | model | config | `src/types.ts` | exact (self) |
| `src/components/common/InteractiveRow.tsx` | component | UI | `src/components/common/InteractiveRow.tsx` | exact (self) |
| `src/components/SilentBanner.tsx` | component | UI | `src/components/SilentBanner.tsx` | exact (self) |
| `src/components/DeckifyOverlay.tsx` | component | UI | `src/components/DeckifyOverlay.tsx` | exact (self) |
| `src/components/DeckifyExpandedModal.tsx` | component | UI | `src/components/DeckifyExpandedModal.tsx` | exact (self) |
| `src/components/tabs/SettingsTab.tsx` | component | CRUD | `src/components/tabs/SettingsTab.tsx` | exact (self) |
| `src/index.tsx` | component / controller | event-driven | `src/index.tsx` | exact (self) |
| `src/utils/accentTheme.test.ts` | test | transform | `src/utils/chime.test.ts` | exact |
| `tests/test_eco.py` | test | event-driven | `tests/test_dock.py` | exact |

## Pattern Assignments

### `py_modules/eco.py` (service, event-driven / polling)

**Analog:** `py_modules/dock.py` (`DockAudioSwitcher`)

**Imports pattern** (`py_modules/dock.py`, lines 1-11):
```python
"""Automatic docked USB-DAC / HDMI audio switching and PipeWire sink classification."""

import asyncio
import shutil
import subprocess

from py_modules import volume
from py_modules.common import _build_deck_command, _exec, decky
from py_modules.engine import _get_pactl_sinks
from py_modules.equalizer import EQ_SINK_NAME
```

**Lifecycle & asyncio supervision pattern** (`py_modules/dock.py`, lines 134-182):
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

    def start(self) -> None:
        """Start the background `pactl subscribe` hotplug monitor."""
        if self._running:
            return
        self._running = True
        self._monitor_task = asyncio.create_task(self._monitor_loop())

    async def stop(self) -> None:
        """Stop the hotplug monitor and cancel any pending debounce timer."""
        self._running = False
        ...
        if self._monitor_task:
            self._monitor_task.cancel()
            try:
                await self._monitor_task
            except asyncio.CancelledError:
                pass
            self._monitor_task = None
```

**Settings guard & status evaluation pattern** (`py_modules/dock.py`, lines 351-358):
```python
    async def evaluate_now(self) -> None:
        """Evaluate connected sinks and dock/undock Deckify's audio stream as needed."""
        async with self._eval_lock:
            settings = getattr(self._plugin, "_settings", {}) or {}
            if not bool(settings.get("dock_auto_switch_enabled", False)):
                self._status = "disabled"
                return
```

*Apply to `PowerGovernor`:* Use `asyncio.Lock()` for `evaluate_now()`, `start()`/`stop()` task lifecycle, `decky.emit("eco_status_changed", status_dict)` on state transitions, and pure helper `read_power_supply_state(sysfs_root="/sys/class/power_supply")` with `OSError` guards.

---

### `py_modules/common.py` (config, file-I/O)

**Analog:** `py_modules/common.py` (`DEFAULT_SETTINGS`)

**Default settings schema pattern** (`py_modules/common.py`, lines 154-166):
```python
    "dock_auto_switch_enabled": False,
    "dock_target_sink": "auto",
    "dock_respect_bluetooth": True,
    "dock_pause_on_undock": False,
    "dock_toast_enabled": True,
    "resilience_auto_resume": True,
    "resilience_bookmark_expiry_hours": 12,
    "resilience_bookmark_never_expires": False,
    "resilience_toast_enabled": True,
    "resilience_prompt_held_enabled": True,
    "mpris_enabled": True,
    "mpris_auto_proxy": True,
}
```
*Add:* `"accent_theme": "spotify_green"`, `"eco_mode_enabled": True`, `"eco_timeout_minutes": 15`, `"eco_sleep_spotify_client": False`.

---

### `py_modules/rpc_playback.py` (controller, request-response)

**Analog:** `py_modules/rpc_playback.py` (`control_playback` and `play_tracks`)

**`control_playback` pattern** (`py_modules/rpc_playback.py`, lines 42-81):
```python
async def control_playback(plugin, action: str, device_id: str = "") -> dict:
    """Control playback actions (play, pause, play_pause, next, previous)."""
    decky.logger.info("control_playback: action=%s device_id=%s", action, device_id)
    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}

    if action == "play_pause":
        action = "pause" if plugin._poll_play_state == "playing" else "play"
```

**Engine wake-on-play pattern** (`py_modules/rpc_playback.py`, lines 410-435):
```python
    except urllib.error.HTTPError as e:
        if e.code == 404:
            transfer_res = await plugin._auto_transfer_and_play(token)
            if (
                not transfer_res.get("ok")
                and hasattr(plugin, "_is_engine_running")
                and not plugin._is_engine_running()
                and getattr(plugin, "_settings", {}).get("audio_backend", "librespot") == "librespot"
                and hasattr(plugin, "start_librespot")
            ):
                start_res = await plugin.start_librespot()
                if isinstance(start_res, dict) and start_res.get("ok"):
                    for _ in range(4):
                        await asyncio.sleep(0.3)
                        dev_res = await get_devices(plugin)
                        if dev_res.get("devices"):
                            transfer_res = await plugin._auto_transfer_and_play(token)
                            break
```
*Apply to:* `control_playback` (when `action == "play"` and `power_governor.engine_sleeping`), `play_tracks`, and `quick_play_pinned` — invoke `await power_governor.wake_for_playback()` so both `librespot` and `spotify_client` (when `eco_sleep_spotify_client` is enabled) wake transparently.

---

### `main.py` (controller / service, request-response)

**Analog:** `main.py` (`get_status` and `set_setting`)

**`public_keys` exposure pattern** (`main.py`, lines 630-654):
```python
        public_keys = (
            "device_name", "audio_backend", "audio_quality", "bitrate",
            ...
            "mpris_enabled", "mpris_auto_proxy",
        )
```

**`set_setting` validation pattern** (`main.py`, lines 739-785):
```python
    async def set_setting(self, key: str, value) -> dict:
        if key == "active_game_override_snapshot":
            return {"ok": False, "error": "active_game_override_snapshot is managed internally"}
        if key not in DEFAULT_SETTINGS:
            return {"ok": False, "error": f"unknown setting: {key}"}
        ...
        elif key == "bitrate":
            try:
                bval = int(value)
            except (TypeError, ValueError):
                return {"ok": False, "error": "bitrate must be 96, 160, or 320"}
            if bval not in (96, 160, 320):
                return {"ok": False, "error": "bitrate must be 96, 160, or 320"}
            value = bval
```
*Apply to:* Validate `accent_theme` in `("spotify_green", "dynamic_album", "steamos_blue")`, `eco_timeout_minutes` as `int` in `[5, 30]` (step 5), and `eco_mode_enabled` / `eco_sleep_spotify_client` as `bool`. Expose `eco_status` in `get_status()`.

---

### `src/utils/accentTheme.ts` (utility, transform)

**Analog:** `src/utils/chime.ts`

**Browser API safety & non-throwing guard pattern** (`src/utils/chime.ts`, lines 35-48, 62-64):
```typescript
export function playNotificationChime(volumePercent: number): void {
  try {
    const clamped = Number.isFinite(volumePercent)
      ? Math.max(0, Math.min(100, volumePercent))
      : 0;
    if (clamped <= 0) return;

    const AudioCtx = getAudioContextConstructor();
    if (!AudioCtx) return;
    ...
  } catch {
    // Web Audio errors must never break notification flow
  }
}
```
*Apply to:* Guard `typeof document === "undefined"` and `canvas.getContext("2d") === null` in JSDOM/Node; clamp HSL lightness to `L >= 55%`; fall back to `#1DB954` (`29, 185, 84`) on missing artwork, grayscale/low-saturation, or error; cache extracted colors in a bounded `Map<string, AccentColor>`.

---

### `src/utils/themeBus.ts` (utility, event-driven)

**Analog:** `src/utils/triggerController.ts`

**Pure module state & test-resettable controller pattern** (`src/utils/triggerController.ts`, lines 29-40, 78-80):
```typescript
export class TriggerController {
  private channels: Record<TriggerSide, TriggerChannelState>;

  constructor() {
    this.channels = {
      L2: createInitialChannelState(),
      R2: createInitialChannelState(),
    };
  }
  ...
  getChannelState(side: TriggerSide): Readonly<TriggerChannelState> {
    return this.channels[side];
  }
```
*Apply to:* Module-level subscriber set (`Set<() => void>`), `syncRootThemeCssVars(accent, animationsSuspended)` writing `--deckify-accent`, `--deckify-accent-rgb`, and `--deckify-accent-transition` onto `document.documentElement.style`, and `useAccentTheme()` hook.

---

### `src/types.ts` (model, config)

**Analog:** `src/types.ts` (`DockStatusState`, `DockStatusInfo`)

**Union & status interface pattern** (`src/types.ts`, lines 153-166):
```typescript
export type DockStatusState =
  | "disabled"
  | "monitoring"
  | "docked"
  | "bluetooth_held"
  | "manual_override";

export interface DockStatusInfo {
  status: DockStatusState;
  active_sink: string | null;
  active_sink_label: string;
  pre_dock_sink: string | null;
  manual_override: boolean;
}
```

---

### `src/components/common/InteractiveRow.tsx` (component, UI)

**Analog:** `src/components/common/InteractiveRow.tsx` (`focusHalo`)

**Focus halo pattern** (`src/components/common/InteractiveRow.tsx`, lines 4-15):
```typescript
export function focusHalo(focused: boolean) {
  return {
    boxShadow: focused
      ? "0 0 0 2px #fff, 0 0 12px rgba(29, 185, 84, 0.7)"
      : "none",
    transform: focused ? "scale(1.02)" : "scale(1)",
    transition: "box-shadow 0.1s ease, transform 0.1s ease",
    position: "relative" as const,
    zIndex: focused ? 2 : 0,
    outline: "none",
  };
}
```
*Replace with:* `"0 0 0 2px #fff, 0 0 12px rgba(var(--deckify-accent-rgb, 29, 185, 84), 0.7)"` (preserving fallback for Vitest).

---

### `src/components/SilentBanner.tsx` (component, UI)

**Analog:** `src/components/SilentBanner.tsx` (`getToneAccentColor`)

**Tone accent pattern** (`src/components/SilentBanner.tsx`, lines 44-48):
```typescript
function getToneAccentColor(tone?: BannerTone): string {
  if (tone === "error") return "#E53935";
  if (tone === "neutral") return "rgba(255, 255, 255, 0.35)";
  return "#1DB954";
}
```
*Replace `#1DB954` with:* `"var(--deckify-accent, #1DB954)"` while keeping `transition: fading ? "opacity 250ms ease-in" : "opacity 150ms ease-out"` intact (D-10).

---

### `src/components/DeckifyOverlay.tsx` (component, UI)

**Analog:** `src/components/DeckifyOverlay.tsx` (`posStyle` & `deckifyLyricFadeIn`)

**HUD container & animation pattern** (`src/components/DeckifyOverlay.tsx`, lines 236-261):
```typescript
    transition:
      "opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1), transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
    overflow: "hidden",
  };
...
      {lyricsEnabled && (
        <style>{`@keyframes deckifyLyricFadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
      )}
```
*Apply:* Gate transitions/keyframe fade when `animationsSuspended` is `true`, and add subtle radial accent glow using `rgba(var(--deckify-accent-rgb, 29, 185, 84), ...)`.

---

### `src/components/DeckifyExpandedModal.tsx` (component, UI)

**Analog:** `src/components/DeckifyExpandedModal.tsx` (Ambient Glow)

**Ambient glow pattern** (`src/components/DeckifyExpandedModal.tsx`, lines 984-1002):
```typescript
          {/* Ambient Glow */}
          {artwork && (
            <div
              style={{
                position: "absolute",
                top: -80,
                right: -80,
                width: 480,
                height: 480,
                borderRadius: "50%",
                backgroundImage: `url(${artwork})`,
                backgroundSize: "cover",
                filter: "blur(90px) saturate(200%)",
                opacity: 0.22,
                pointerEvents: "none",
                zIndex: 0,
              }}
            />
          )}
```
*Apply:* Add radial accent glow (`radial-gradient(circle, rgba(var(--deckify-accent-rgb, 29, 185, 84), 0.18) 0%, transparent 70%)`) with `transition: var(--deckify-accent-transition, background 350ms ease)` and replace `#1DB954`/`#1db954` tokens.

---

### `src/components/tabs/SettingsTab.tsx` (component, CRUD)

**Analog:** `src/components/tabs/SettingsTab.tsx` (Docked Audio-Switching card)

**Settings card + live status badge pattern** (`src/components/tabs/SettingsTab.tsx`, lines 694-740):
```typescript
        let badgeLabel = "Monitoring";
        let badgeStyle: Record<string, any> = { opacity: 0.7 };
        if (!dockAutoSwitchEnabled) {
          badgeLabel = "Disabled";
          badgeStyle = { opacity: 0.6 };
        } else if (dockStatus?.status === "docked") {
          badgeLabel = `Docked: ${dockStatus.active_sink_label || dockStatus.active_sink || "External"}`;
          badgeStyle = { color: "#1db954" };
        }
        ...
        return (
          <div style={{ marginBottom: 20, padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
                <FaPlug /> Docked Audio-Switching
              </h3>
              <span style={{ fontSize: 12, fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", ...badgeStyle }}>
                {badgeLabel}
              </span>
            </div>
            <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
              <ToggleField ... />
```
*Note:* Use compact inline `DialogButton` pills with `width: "auto"` and `minWidth: "auto"` for the Accent Theme selector and timeout steps (`5`–`30` min).

---

### `src/index.tsx` (component / controller, event-driven)

**Analog:** `src/index.tsx` (Conditional Held Bookmark Prompt in QAM)

**Conditional QAM prompt + action pattern** (`src/index.tsx`, lines 1370-1386):
```tsx
        {/* Conditional Held Bookmark Prompt (D-09: compact when no bookmark is held) */}
        {resilienceStatus?.held_bookmark && settings.resilience_prompt_held_enabled !== false && (
          <PanelSectionRow>
            <ButtonItem
              description={...}
              onClick={handleRestoreBookmark}
            >
              Resume Bookmark
            </ButtonItem>
          </PanelSectionRow>
        )}
```
*Apply:* Add conditional QAM Eco-Sleep indicator (`ecoStatus?.engine_sleeping`) with a Play-to-wake `ButtonItem` action, and wire `DeckifyOverlayWrapper` to keep `themeBus` synchronized across track/setting/eco updates.

---

### `src/utils/accentTheme.test.ts` (test, transform)

**Analog:** `src/utils/chime.test.ts`

**Vitest browser-API mock & reset pattern** (`src/utils/chime.test.ts`, lines 1-50):
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { playNotificationChime, resetChimeContextForTests } from "./chime";
```
*Apply:* Stub `document.createElement("canvas")` / `Image` in Vitest to feed deterministic RGBA pixel arrays and verify `L >= 55%` clamp, grayscale `#1DB954` fallback, and preset resolution.

---

### `tests/test_eco.py` (test, event-driven)

**Analog:** `tests/test_dock.py`

**`decky` sys.modules mock & unittest pattern** (`tests/test_dock.py`, lines 1-20, 41-50):
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

## Shared Patterns

### CSS Accent Token Replacement
**Source:** `src/components/common/InteractiveRow.tsx` & `src/components/SilentBanner.tsx`
**Apply to:** All 25 accent-consuming UI files (`src/index.tsx`, `DeckifyExpandedModal.tsx`, `DeckifyOverlay.tsx`, `SilentBanner.tsx`, `InteractiveRow.tsx`, `Sidebar.tsx`, `TrackActionModal.tsx`, `CollectionActionModal.tsx`, `EqBandFaders.tsx`, `TrackRowItem.tsx`, and all tab components).
```typescript
// Hex accent replacements:
color: "var(--deckify-accent, #1DB954)"
// Alpha/glow accent replacements:
boxShadow: "0 0 0 2px #fff, 0 0 12px rgba(var(--deckify-accent-rgb, 29, 185, 84), 0.7)"
// Transition gating for track-to-track accent shifts (D-05):
transition: "var(--deckify-accent-transition, color 350ms ease, background-color 350ms ease)"
```

### Safe Sysfs & Subprocess Resilience
**Source:** `py_modules/dock.py` & `py_modules/common.py`
**Apply to:** `py_modules/eco.py` and `main.py`
- Wrap all `/sys/class/power_supply/*` reads in `try/except OSError` and default to `(False, False)` (never classify Steam Machine / desktop as on-battery).
- Return structured `{ "ok": bool, ... }` dicts from all RPC handlers (`set_setting`, `control_playback`, `wake_for_playback`).

## No Analog Found

All 15 files have direct or role-matched analogs in the existing codebase.

## Metadata

**Analog search scope:** `py_modules/`, `src/utils/`, `src/components/`, `src/components/common/`, `src/components/tabs/`, `tests/`, `main.py`, `src/index.tsx`, `src/types.ts`
**Files scanned:** 16 tracked files verified via `git ls-files`
**Pattern extraction date:** 2026-11-22
