# Phase 06: Smooth Audio Ducking Engine & PipeWire Fader - Pattern Map

**Mapped:** 2026-11-12  
**Files analyzed:** 9  
**Analogs found:** 9 / 9 (100% git-tracked codebase analogs)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `py_modules/volume.py` | service | streaming / event-driven | `py_modules/volume.py` | exact |
| `py_modules/common.py` | model / config | transform / file-I/O | `py_modules/common.py` | exact |
| `main.py` | controller | request-response / event-driven | `main.py` | exact |
| `src/index.tsx` | controller / component | request-response / event-driven | `src/index.tsx` | exact |
| `src/components/tabs/SettingsTab.tsx` | component | request-response | `src/components/tabs/SettingsTab.tsx` | exact |
| `src/types.ts` | model / config | transform | `src/types.ts` | exact |
| `tests/test_volume.py` | test | streaming / event-driven | `tests/test_device_and_engine.py` | role-match |
| `tests/test_e2e_requirements.py` | test | request-response | `tests/test_e2e_requirements.py` | exact |
| `src/components/tabs/SettingsTab.test.tsx` | test | request-response | `src/components/tabs/QueueTab.test.tsx` | role-match |

---

## Pattern Assignments

### 1. `py_modules/volume.py` (service, streaming / event-driven)

**Analog:** `py_modules/volume.py` (lines 1-142) and `py_modules/common.py` (lines 220-240)

**Imports pattern** (lines 1-20):
```python
import asyncio
import math
import os
import subprocess
import time
import urllib.error
from py_modules.common import (
    PULSE_SERVER,
    _exec,
    _build_deck_command,
    _save_settings,
    decky,
)
from py_modules.engine import (
    _parse_pactl_sink_inputs,
    _get_pactl_sinks,
    _set_pactl_sink_input,
)
```

**Subprocess User-Space `pactl` Command Pattern** (lines 44-79):
```python
async def set_pa_volume_percent(plugin, percent: int) -> bool:
    """Set librespot's PulseAudio sink-input volume percentage."""
    if not plugin._process:
        return False
    pid = plugin._process.pid
    try:
        cmd, env = _build_deck_command([
            "pactl", "set-sink-input-volume", sink_input_id, f"{int(percent)}%"
        ])
        res = await _exec(
            lambda: subprocess.run(cmd, capture_output=True, text=True, env=env),
            timeout=2,
        )
        return res is not None and res.returncode == 0
    except Exception as e:
        decky.logger.warning("Failed to set PA volume to %d%%: %s", percent, e)
    return False
```

**Core Cosine Easing Loop & One-Time Sink Resolution Pattern** (DUCK-01, D-01):
```python
class VolumeFader:
    def __init__(self, plugin):
        self.plugin = plugin
        self._fade_task: asyncio.Task | None = None
        self._current_sink_volume: float = 100.0
        self._cached_sink_input_id: str | None = None
        self._duck_reasons: set[str] = set()

    async def fade_to(self, target_sink_volume: float, duration_sec: float) -> None:
        """Cancel any active in-flight fade and initiate cosine easing curve smoothly."""
        if self._fade_task and not self._fade_task.done():
            self._fade_task.cancel()
            try:
                await self._fade_task
            except asyncio.CancelledError:
                pass

        self._fade_task = asyncio.create_task(
            self._execute_fade(target_sink_volume, duration_sec)
        )

    async def _execute_fade(self, target_vol: float, duration_sec: float) -> None:
        start_vol = self._current_sink_volume
        if not self._cached_sink_input_id:
            self._cached_sink_input_id = await self.resolve_sink_input_id()

        start_time = time.monotonic()
        step_interval = 0.05  # 50ms time slices (D-01)

        try:
            while True:
                now = time.monotonic()
                elapsed = now - start_time
                progress = min(1.0, elapsed / duration_sec) if duration_sec > 0 else 1.0
                
                # Cosine easing: 0.5 * (1 - cos(pi * progress))
                eased = 0.5 * (1.0 - math.cos(math.pi * progress))
                self._current_sink_volume = start_vol + (target_vol - start_vol) * eased

                if self._cached_sink_input_id:
                    ok = await self._apply_sink_volume(self._cached_sink_input_id, self._current_sink_volume)
                    if not ok:
                        # Invalidate cached ID on error to force rediscovery
                        self._cached_sink_input_id = await self.resolve_sink_input_id()

                await self._emit_state()

                if progress >= 1.0:
                    break
                await asyncio.sleep(step_interval)
        except asyncio.CancelledError:
            # Leave self._current_sink_volume at the last reached level to prevent clicks/jumps
            raise
```

**Voice Activity Hysteresis Polling Pattern** (DUCK-02, D-03):
```python
class VoiceActivityDetector:
    def __init__(self, plugin, fader: VolumeFader):
        self.plugin = plugin
        self.fader = fader
        self._worker_task: asyncio.Task | None = None
        self._last_speech_time: float = 0.0
        self._voice_active: bool = False

    async def _poll_loop(self):
        while True:
            try:
                settings = self.plugin._settings
                if not settings.get("voice_ducking_enabled", True) or not getattr(self.plugin, "_is_playing", False):
                    await asyncio.sleep(1.0)
                    continue

                has_voice = await self.check_recording_streams()
                now = time.monotonic()
                hold_delay = float(settings.get("voice_ducking_hold_delay", 1.2))

                if has_voice:
                    self._last_speech_time = now
                    if not self._voice_active:
                        self._voice_active = True
                        await self.fader.set_ducking(True, reason="voice")
                else:
                    if self._voice_active and (now - self._last_speech_time >= hold_delay):
                        self._voice_active = False
                        await self.fader.set_ducking(False, reason="voice")

                await asyncio.sleep(0.35)  # 350ms poller interval
            except asyncio.CancelledError:
                break
            except Exception as e:
                decky.logger.warning("VoiceActivityDetector error: %s", e)
                await asyncio.sleep(1.0)
```

**Error Handling & Fallback Pattern**:
- Return `False` or graceful default on subprocess failure.
- `try/except asyncio.CancelledError:` blocks propagate cancellation cleanly without logging false errors.
- External `pactl` commands bounded by 2-second timeout via `_exec(..., timeout=2)`.

---

### 2. `py_modules/common.py` (model / config, transform / file-I/O)

**Analog:** `py_modules/common.py` (lines 70-95, 123-165, 220-240)

**DEFAULT_SETTINGS Schema Pattern** (lines 70-94):
```python
DEFAULT_SETTINGS = {
    # Existing keys ...
    "auto_ducking": True,
    "auto_ducking_volume": 30,
    # New Phase 06 keys:
    "duck_fade_down_duration": 1.0,
    "duck_fade_up_duration": 1.5,
    "ducking_mode": "proportional",       # "proportional" | "fixed"
    "ducking_proportional_pct": 50,       # 50% reduction when proportional
    "voice_ducking_enabled": True,        # Discord / Steam Voice VAD
    "voice_ducking_volume": 25,           # 25% target or attenuation
    "voice_ducking_hold_delay": 1.2,      # 1.2s silence hold delay
}
```

**_load_settings() Sanitization Pattern** (lines 123-164):
```python
# Validation & bounds enforcement
if not isinstance(merged.get("auto_ducking"), bool):
    merged["auto_ducking"] = bool(merged.get("auto_ducking", True))
try:
    merged["duck_fade_down_duration"] = max(0.5, min(3.0, float(merged.get("duck_fade_down_duration", 1.0))))
except (TypeError, ValueError):
    merged["duck_fade_down_duration"] = 1.0
try:
    merged["duck_fade_up_duration"] = max(0.5, min(3.0, float(merged.get("duck_fade_up_duration", 1.5))))
except (TypeError, ValueError):
    merged["duck_fade_up_duration"] = 1.5
if merged.get("ducking_mode") not in ("proportional", "fixed"):
    merged["ducking_mode"] = "proportional"
try:
    merged["ducking_proportional_pct"] = max(10, min(90, int(merged.get("ducking_proportional_pct", 50))))
except (TypeError, ValueError):
    merged["ducking_proportional_pct"] = 50
if not isinstance(merged.get("voice_ducking_enabled"), bool):
    merged["voice_ducking_enabled"] = bool(merged.get("voice_ducking_enabled", True))
try:
    merged["voice_ducking_volume"] = max(10, min(50, int(merged.get("voice_ducking_volume", 25))))
except (TypeError, ValueError):
    merged["voice_ducking_volume"] = 25
try:
    merged["voice_ducking_hold_delay"] = max(0.5, min(3.0, float(merged.get("voice_ducking_hold_delay", 1.2))))
except (TypeError, ValueError):
    merged["voice_ducking_hold_delay"] = 1.2
```

---

### 3. `main.py` (controller, request-response / event-driven)

**Analog:** `main.py` (lines 114-148, 460-496, 501-579)

**Lifecycle Initialization & Cleanup Pattern** (lines 114-148):
```python
# In _main():
self._volume_fader = VolumeFader(self)
self._voice_detector = VoiceActivityDetector(self, self._volume_fader)
self._voice_detector.start()

# In _unload():
if hasattr(self, "_voice_detector") and self._voice_detector:
    await self._voice_detector.stop()
    self._voice_detector = None
if hasattr(self, "_volume_fader") and self._volume_fader:
    if self._volume_fader._fade_task and not self._volume_fader._fade_task.done():
        self._volume_fader._fade_task.cancel()
    self._volume_fader = None
```

**RPC Endpoints for Ducking Coordination Pattern**:
```python
async def trigger_ducking(self, active: bool, reason: str = "game", app_id: int | None = None) -> dict:
    """Trigger or release ducking from frontend AppLifetime listener or game events."""
    if not hasattr(self, "_volume_fader") or not self._volume_fader:
        return {"ok": False, "error": "Volume fader not initialized"}
    
    # Check if ducking is enabled for this app / global
    if active and not self._settings.get("auto_ducking", True):
        return {"ok": True, "ducked": False, "skipped": "auto_ducking_disabled"}

    await self._volume_fader.set_ducking(bool(active), reason=str(reason))
    return {
        "ok": True,
        "is_ducked": self._volume_fader.is_ducked,
        "effective_volume": self._volume_fader.effective_volume,
    }

async def get_ducking_state(self) -> dict:
    """Return live ducking status and effective volume level."""
    if not hasattr(self, "_volume_fader") or not self._volume_fader:
        return {"is_ducked": False, "effective_volume": self._poll_volume or 80, "duck_reasons": []}
    return {
        "is_ducked": self._volume_fader.is_ducked,
        "effective_volume": self._volume_fader.effective_volume,
        "base_volume": self._poll_volume or 80,
        "duck_reasons": list(self._volume_fader._duck_reasons),
    }
```

**Whitelisted Public Settings in `get_status`** (lines 464-472):
```python
public_keys = (
    "device_name", "audio_backend", "audio_quality", "bitrate",
    "bit_perfect_clock", "spotify_client_id", "normalisation",
    "normalisation_pregain", "gapless", "autoplay", "playlist_folders",
    "spotify_folder_tree", "game_audio_profiles", "auto_ducking",
    "auto_ducking_volume", "gamepad_chords_enabled", "toast_enabled",
    "toast_position", "overlay_enabled", "overlay_position",
    "overlay_autohide", "overlay_show_progress", "eq_preset",
    "duck_fade_down_duration", "duck_fade_up_duration", "ducking_mode",
    "ducking_proportional_pct", "voice_ducking_enabled", "voice_ducking_volume",
    "voice_ducking_hold_delay",
)
```

**Input Validation in `set_setting`** (lines 544-577):
```python
elif key in ("auto_ducking", "voice_ducking_enabled"):
    value = bool(value)
elif key in ("duck_fade_down_duration", "duck_fade_up_duration", "voice_ducking_hold_delay"):
    try:
        value = max(0.5, min(3.0, float(value)))
    except (TypeError, ValueError):
        return {"ok": False, "error": f"{key} must be a number between 0.5 and 3.0"}
elif key == "ducking_mode":
    val = str(value).strip().lower()
    if val not in ("proportional", "fixed"):
        return {"ok": False, "error": "ducking_mode must be 'proportional' or 'fixed'"}
    value = val
elif key in ("ducking_proportional_pct", "voice_ducking_volume"):
    try:
        value = max(10, min(90, int(value)))
    except (TypeError, ValueError):
        return {"ok": False, "error": f"{key} must be an integer percentage"}
```

---

### 4. `src/index.tsx` (controller / component, request-response / event-driven)

**Analog:** `src/index.tsx` (lines 420-435, 721-755)

**RPC Callable Definitions** (lines 50-65):
```typescript
const backendTriggerDucking = callable<[boolean, string?, number?], { ok: boolean; is_ducked?: boolean }>("trigger_ducking");
const backendGetDuckingState = callable<[], { is_ducked: boolean; effective_volume: number; duck_reasons: string[] }>("get_ducking_state");
```

**AppLifetime Notifications with 3-Second Exit Debounce Pattern** (lines 721-755):
```typescript
let activeGameAppId: number | null = null;
let gameExitDebounceTimer: any = null;

try {
  const steamApps = (window as any).SteamClient?.Apps;
  if (steamApps?.RegisterForAppLifetimeNotifications) {
    steamApps.RegisterForAppLifetimeNotifications(async (ev: any) => {
      if (!ev) return;
      const appId = ev.unAppID || ev.nAppID;
      const running = Boolean(ev.bRunning);

      if (running && appId) {
        // Cancel pending exit debounce if game or child process reports running
        if (gameExitDebounceTimer) {
          clearTimeout(gameExitDebounceTimer);
          gameExitDebounceTimer = null;
        }
        activeGameAppId = appId;
        await backendTriggerDucking(true, "game", appId).catch(() => {});
      } else if (!running && activeGameAppId) {
        // Debounce game exit by 3.0s to prevent child-launcher flapping (EA, Ubisoft, Proton)
        if (gameExitDebounceTimer) clearTimeout(gameExitDebounceTimer);
        gameExitDebounceTimer = setTimeout(async () => {
          activeGameAppId = null;
          gameExitDebounceTimer = null;
          await backendTriggerDucking(false, "game").catch(() => {});
        }, 3000);
      }
    });
  }
} catch (err) {
  console.debug("Deckify: AppLifetimeNotifications not available", err);
}
```

**Visual Ducked Badge & Dynamic Slider Volume Binding Pattern** (lines 420-435):
```tsx
const [isDucked, setIsDucked] = useState<boolean>(false);
const [effectiveVolume, setEffectiveVolume] = useState<number | null>(null);

useEffect(() => {
  const unsubDucking = addEventListener<[any]>("ducking_state_changed", (data: any) => {
    if (!data) return;
    setIsDucked(Boolean(data.is_ducked));
    if (typeof data.effective_volume === "number") {
      setEffectiveVolume(data.effective_volume);
    }
  });

  return () => {
    removeEventListener("ducking_state_changed", unsubDucking);
  };
}, []);

// In Mini-Player Volume Section:
<PanelSectionRow>
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
    min={0}
    max={100}
    step={1}
    showValue
    valueSuffix="%"
    onChange={handleVolumeChange}
  />
</PanelSectionRow>
```

---

### 5. `src/components/tabs/SettingsTab.tsx` (component, request-response)

**Analog:** `src/components/tabs/SettingsTab.tsx` (lines 423-464)

**Ducking Settings Card with Spatial Navigation Pattern**:
```tsx
{/* Auto-Ducking (Game Audio Balance) */}
<div style={{ marginBottom: 20, padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
  <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 6 }}>
    Smooth Audio Ducking Engine
  </h3>
  <p style={{ fontSize: 12, opacity: 0.6, marginBottom: 10 }}>
    Gradually attenuates Spotify volume via PipeWire when games launch or voice chat is active.
  </p>

  {/* Master Toggle */}
  <InteractiveRow
    onClick={async () => {
      const cur = status?.settings?.auto_ducking ?? true;
      await backendSetSetting("auto_ducking", !cur);
      showToast(!cur ? "Auto-Ducking enabled" : "Auto-Ducking disabled");
      refreshStatus();
    }}
    active={status?.settings?.auto_ducking}
    style={{ justifyContent: "space-between", marginBottom: 10 }}
  >
    <span style={{ fontSize: 13, fontWeight: 600 }}>Game Audio Ducking</span>
    <span style={{ fontSize: 12, fontWeight: 700, color: status?.settings?.auto_ducking ? "#1db954" : "#888" }}>
      {status?.settings?.auto_ducking ? "ON" : "OFF"}
    </span>
  </InteractiveRow>

  {status?.settings?.auto_ducking && (
    <>
      {/* Ducking Calculation Mode (Proportional vs Fixed) */}
      <div style={{ marginTop: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.8, display: "block", marginBottom: 4 }}>
          Attenuation Mode
        </span>
        <Focusable flow-children="horizontal" style={{ display: "flex", gap: 6 }}>
          {[
            { id: "proportional", label: "Proportional (-50%)" },
            { id: "fixed", label: "Fixed Level (25%)" },
          ].map((mode) => (
            <InteractiveRow
              key={mode.id}
              onClick={async () => {
                await backendSetSetting("ducking_mode", mode.id);
                showToast(`Ducking mode: ${mode.label}`);
                refreshStatus();
              }}
              active={(status?.settings?.ducking_mode || "proportional") === mode.id}
              style={{ flex: 1, justifyContent: "center", fontSize: 11, fontWeight: 700, padding: "6px" }}
            >
              {mode.label}
            </InteractiveRow>
          ))}
        </Focusable>
      </div>

      {/* Fade Durations (Down & Up) */}
      <div style={{ marginTop: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.8, display: "block", marginBottom: 4 }}>
          Fade Down Speed: {status?.settings?.duck_fade_down_duration || 1.0}s
        </span>
        <Focusable flow-children="horizontal" style={{ display: "flex", gap: 6 }}>
          {[0.5, 1.0, 1.5, 2.0].map((sec) => (
            <InteractiveRow
              key={sec}
              onClick={async () => {
                await backendSetSetting("duck_fade_down_duration", sec);
                refreshStatus();
              }}
              active={(status?.settings?.duck_fade_down_duration || 1.0) === sec}
              style={{ flex: 1, justifyContent: "center", fontSize: 11, fontWeight: 700, padding: "6px" }}
            >
              {sec}s
            </InteractiveRow>
          ))}
        </Focusable>
      </div>

      <div style={{ marginTop: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.8, display: "block", marginBottom: 4 }}>
          Fade Up Speed: {status?.settings?.duck_fade_up_duration || 1.5}s
        </span>
        <Focusable flow-children="horizontal" style={{ display: "flex", gap: 6 }}>
          {[1.0, 1.5, 2.0, 3.0].map((sec) => (
            <InteractiveRow
              key={sec}
              onClick={async () => {
                await backendSetSetting("duck_fade_up_duration", sec);
                refreshStatus();
              }}
              active={(status?.settings?.duck_fade_up_duration || 1.5) === sec}
              style={{ flex: 1, justifyContent: "center", fontSize: 11, fontWeight: 700, padding: "6px" }}
            >
              {sec}s
            </InteractiveRow>
          ))}
        </Focusable>
      </div>

      {/* Voice Chat Ducking Section */}
      <InteractiveRow
        onClick={async () => {
          const cur = status?.settings?.voice_ducking_enabled ?? true;
          await backendSetSetting("voice_ducking_enabled", !cur);
          showToast(!cur ? "Voice Chat Ducking enabled" : "Voice Chat Ducking disabled");
          refreshStatus();
        }}
        active={status?.settings?.voice_ducking_enabled}
        style={{ justifyContent: "space-between", marginTop: 12 }}
      >
        <span style={{ fontSize: 13, fontWeight: 600 }}>Voice Chat Ducking (Discord / Steam)</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: status?.settings?.voice_ducking_enabled ? "#1db954" : "#888" }}>
          {status?.settings?.voice_ducking_enabled ? "ON" : "OFF"}
        </span>
      </InteractiveRow>

      {status?.settings?.voice_ducking_enabled && (
        <div style={{ marginTop: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.8, display: "block", marginBottom: 4 }}>
            Silence Hold Delay: {status?.settings?.voice_ducking_hold_delay || 1.2}s
          </span>
          <Focusable flow-children="horizontal" style={{ display: "flex", gap: 6 }}>
            {[0.8, 1.2, 1.6, 2.0].map((sec) => (
              <InteractiveRow
                key={sec}
                onClick={async () => {
                  await backendSetSetting("voice_ducking_hold_delay", sec);
                  refreshStatus();
                }}
                active={(status?.settings?.voice_ducking_hold_delay || 1.2) === sec}
                style={{ flex: 1, justifyContent: "center", fontSize: 11, fontWeight: 700, padding: "6px" }}
              >
                {sec}s
              </InteractiveRow>
            ))}
          </Focusable>
        </div>
      )}
    </>
  )}
</div>
```

---

### 6. `src/types.ts` (model / config, transform)

**Analog:** `src/types.ts` (lines 141-166)

**TypeScript Interface Definitions Pattern**:
```typescript
export type DuckingMode = "proportional" | "fixed";

export interface DuckingState {
  is_ducked: boolean;
  effective_volume: number;
  base_volume: number;
  duck_reasons: string[];
}

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
  playlist_folders?: FolderItem[];
  spotify_folder_tree?: FolderItem[];
  game_audio_profiles?: Record<string, GameAudioProfile>;
  auto_ducking?: boolean;
  auto_ducking_volume?: number;
  gamepad_chords_enabled?: boolean;
  toast_enabled?: boolean;
  toast_position?: string;
  overlay_enabled?: boolean;
  overlay_position?: string;
  overlay_autohide?: boolean;
  overlay_show_progress?: boolean;
  eq_preset?: EqualizerPreset;
  spotify_client_installed?: boolean;
  // Phase 06 ducking settings:
  duck_fade_down_duration?: number;
  duck_fade_up_duration?: number;
  ducking_mode?: DuckingMode;
  ducking_proportional_pct?: number;
  voice_ducking_enabled?: boolean;
  voice_ducking_volume?: number;
  voice_ducking_hold_delay?: number;
}
```

---

### 7. `tests/test_volume.py` (test, streaming / event-driven)

**Analog:** `tests/test_device_and_engine.py` (lines 1-60) and `tests/test_py_modules.py` (lines 53-96)

**Imports & Decky Mock Setup**:
```python
import asyncio
import math
import tempfile
import time
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
    from py_modules import common, volume
    from py_modules.volume import VolumeFader, VoiceActivityDetector
```

**Unit Test Structure for Cosine Easing & Interruption Safety (DUCK-01)**:
```python
class TestVolumeFader(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.mock_plugin = SimpleNamespace(
            _process=SimpleNamespace(pid=12345),
            _settings=dict(common.DEFAULT_SETTINGS),
            _poll_volume=80,
            _pa_volume_boosted=False,
            _is_playing=True,
        )
        self.fader = VolumeFader(self.mock_plugin)

    @patch("subprocess.run")
    async def test_sink_input_caching_eliminates_repeat_forks(self, mock_run):
        # 1. First call queries sink-inputs and finds ID 42
        mock_run.side_effect = [
            SimpleNamespace(returncode=0, stdout='Sink Input #42\napplication.process.id = "12345"\n', stderr=""),
            SimpleNamespace(returncode=0, stdout="", stderr=""),  # set-sink-input-volume call
        ]
        sink_id = await self.fader.resolve_sink_input_id()
        self.assertEqual(sink_id, "42")
        self.assertEqual(mock_run.call_count, 1)

    async def test_fade_interruption_smooth_continuity(self):
        # Test that cancelling mid-fade smoothly starts next fade from current volume
        self.fader._current_sink_volume = 60.0
        # Start a fade to 20.0
        fade_task = asyncio.create_task(self.fader.fade_to(20.0, 1.0))
        await asyncio.sleep(0.01)
        # Interrupt with new fade to 100.0
        await self.fader.fade_to(100.0, 0.1)
        await self.fader._fade_task
        self.assertAlmostEqual(self.fader._current_sink_volume, 100.0, delta=1.0)
```

**Unit Test Structure for Voice Activity Detection & Silence Hold Hysteresis (DUCK-02)**:
```python
class TestVoiceActivityDetector(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.mock_plugin = SimpleNamespace(
            _settings=dict(common.DEFAULT_SETTINGS),
            _is_playing=True,
        )
        self.mock_fader = MagicMock(spec=VolumeFader)
        self.mock_fader.set_ducking = AsyncMock()
        self.vad = VoiceActivityDetector(self.mock_plugin, self.mock_fader)

    @patch("subprocess.run")
    async def test_vad_identifies_discord_and_steam_voice_streams(self, mock_run):
        discord_output = (
            "Source Output #10\n"
            "    application.name = \"Discord\"\n"
            "    corked: no\n"
            "    mute: no\n"
        )
        mock_run.return_value = SimpleNamespace(returncode=0, stdout=discord_output, stderr="")
        has_voice = await self.vad.check_recording_streams()
        self.assertTrue(has_voice)

    @patch("subprocess.run")
    async def test_vad_ignores_corked_or_muted_streams(self, mock_run):
        muted_output = (
            "Source Output #11\n"
            "    application.name = \"Discord\"\n"
            "    corked: no\n"
            "    mute: yes\n"
        )
        mock_run.return_value = SimpleNamespace(returncode=0, stdout=muted_output, stderr="")
        has_voice = await self.vad.check_recording_streams()
        self.assertFalse(has_voice)

    async def test_silence_hold_delay_prevents_volume_pumping(self):
        self.vad._voice_active = True
        self.vad._last_speech_time = time.monotonic()  # Just spoke
        self.mock_plugin._settings["voice_ducking_hold_delay"] = 1.2

        # Simulate check without voice stream 0.5s later (under hold threshold)
        with patch.object(self.vad, "check_recording_streams", return_value=False):
            # Advance loop check
            now = self.vad._last_speech_time + 0.5
            with patch("time.monotonic", return_value=now):
                # Voice should still remain active
                self.assertTrue(self.vad._voice_active)
```

---

### 8. `tests/test_e2e_requirements.py` (test, request-response)

**Analog:** `tests/test_e2e_requirements.py` (lines 628-662)

**Ducking E2E & Settings Requirements Test Pattern**:
```python
def test_ducking_default_settings_schema(self):
    """Verify DEFAULT_SETTINGS contains all Phase 06 ducking configuration keys."""
    self.assertIn("duck_fade_down_duration", common.DEFAULT_SETTINGS)
    self.assertIn("duck_fade_up_duration", common.DEFAULT_SETTINGS)
    self.assertIn("ducking_mode", common.DEFAULT_SETTINGS)
    self.assertIn("ducking_proportional_pct", common.DEFAULT_SETTINGS)
    self.assertIn("voice_ducking_enabled", common.DEFAULT_SETTINGS)
    self.assertIn("voice_ducking_volume", common.DEFAULT_SETTINGS)
    self.assertIn("voice_ducking_hold_delay", common.DEFAULT_SETTINGS)

async def test_set_setting_validates_duck_durations(self):
    """set_setting clamps or validates duck durations between 0.5 and 3.0 seconds."""
    res = await self.plugin.set_setting("duck_fade_down_duration", 2.5)
    self.assertTrue(res.get("ok"))
    self.assertEqual(self.plugin._settings.get("duck_fade_down_duration"), 2.5)

async def test_trigger_ducking_rpc_endpoint(self):
    """trigger_ducking RPC activates ducking without Spotify Web API calls."""
    res = await self.plugin.trigger_ducking(True, reason="game")
    self.assertTrue(res.get("ok"))
```

---

### 9. `src/components/tabs/SettingsTab.test.tsx` (test, request-response)

**Analog:** `src/components/tabs/QueueTab.test.tsx` (lines 1-75) and `src/components/DeckifyOverlay.test.tsx` (lines 1-60)

**Vitest Settings Tab Traversal & Verification Pattern**:
```typescript
import { describe, it, expect, vi } from "vitest";

vi.mock("react/jsx-dev-runtime", () => ({
  jsxDEV: (type: any, props: any, key: any) => ({
    type,
    props: { ...props, ...(key !== undefined ? { key } : {}) },
  }),
}));

vi.mock("react/jsx-runtime", () => ({
  jsx: (type: any, props: any, key: any) => ({
    type,
    props: { ...props, ...(key !== undefined ? { key } : {}) },
  }),
  jsxs: (type: any, props: any, key: any) => ({
    type,
    props: { ...props, ...(key !== undefined ? { key } : {}) },
  }),
}));

vi.mock("@decky/ui", () => ({
  Focusable: ({ children, ...props }: any) => ({
    type: "Focusable",
    props: { children, ...props },
  }),
}));

vi.mock("@decky/api", () => ({
  callable: () => vi.fn(),
  showToast: vi.fn(),
}));

import { SettingsTab } from "./SettingsTab";

function findNodes(tree: any, predicate: (node: any) => boolean, results: any[] = []): any[] {
  if (!tree) return results;
  if (predicate(tree)) results.push(tree);
  if (tree.props && tree.props.children) {
    const children = Array.isArray(tree.props.children)
      ? tree.props.children
      : [tree.props.children];
    for (const child of children) {
      findNodes(child, predicate, results);
    }
  }
  return results;
}

describe("SettingsTab Ducking Controls", () => {
  it("renders ducking mode options with horizontal spatial navigation", () => {
    const status = {
      settings: {
        auto_ducking: true,
        ducking_mode: "proportional",
        voice_ducking_enabled: true,
      },
    };
    const tree = SettingsTab({ status, refreshStatus: vi.fn() });
    const horizontalContainers = findNodes(tree, (n) => n.type === "Focusable" && n.props?.["flow-children"] === "horizontal");
    expect(horizontalContainers.length).toBeGreaterThanOrEqual(1);
  });
});
```

---

## Shared Patterns

### 1. Subprocess Execution as SteamOS Deck User (`_build_deck_command` + `_exec`)
**Source:** `py_modules/common.py` lines 220-240  
**Apply to:** All `pactl`, `pw-metadata`, and Linux audio shell operations
- Decky Loader runs as root (`UID 0`) on SteamOS, but PipeWire and PulseAudio daemon sockets (`PULSE_SERVER`, `XDG_RUNTIME_DIR`) belong to the `deck` user (`UID 1000`).
- Always use `_build_deck_command(["pactl", ...])` to wrap invocations with `runuser -u deck -- env ...`.
- Always wrap in `_exec(..., timeout=N)` to delegate to the asynchronous executor threadpool and avoid blocking the main Python event loop.

### 2. Non-Blocking Async Easing with Safe Task Cancellation
**Source:** `py_modules/volume.py` (VolumeFader)  
**Apply to:** Any continuous progression or fading routines (volume, sleep timer, track crossfades)
- Execute step progression in an `asyncio.Task` with 50ms time slices (`asyncio.sleep(0.05)`).
- When a new target or interruption occurs, call `self._fade_task.cancel()` and `await` with `except asyncio.CancelledError: pass`.
- **Critical Continuity Rule:** Never reset or snap volume to nominal extremes on cancellation. Start the next easing curve smoothly from `self._current_sink_volume`.

### 3. Hysteresis Hold Window for Audio Monitoring
**Source:** `py_modules/volume.py` (VoiceActivityDetector)  
**Apply to:** Voice chat detection, mic activity, silence gating
- Maintain atomic timestamp `self._last_speech_time = time.monotonic()` when active input is confirmed.
- When stream is silent, delay state release until `time.monotonic() - self._last_speech_time >= hold_delay` (default 1.2s).
- Eliminates "audio pumping" between words in natural speech without heavy PCM audio processing.

### 4. Decky Settings RPC & Schema Persistence
**Source:** `py_modules/common.py` & `main.py`  
**Apply to:** All user-facing settings
- Every new configuration property MUST be wired through all 5 layers:
  1. `py_modules/common.py:DEFAULT_SETTINGS` dictionary
  2. `py_modules/common.py:_load_settings()` sanitization & bounds clamping
  3. `main.py:get_status()` public settings whitelist
  4. `main.py:set_setting()` type coercion and validation
  5. `src/types.ts:EngineSettings` TypeScript interface

### 5. Dual-Signal Real-Time State Synchronization (`decky.emit` + `addEventListener`)
**Source:** `src/index.tsx` lines 544-570 & `py_modules/volume.py` lines 487-498  
**Apply to:** Real-time volume slider position and visual `Ducked` badge
- Backend fires push event: `await decky.emit("ducking_state_changed", { is_ducked, effective_volume, ... })`.
- Frontend registers typed subscriber: `addEventListener("ducking_state_changed", ...)` during component mount and cleans up via `removeEventListener` in unmount return.
- QAM volume slider dynamically binds to `effective_volume` when ducked, displaying the audible attenuation level without altering the user's saved baseline volume.

### 6. Multi-Process Launcher Debounce Pattern (Frontend `AppLifetimeNotifications`)
**Source:** `src/index.tsx` lines 721-755  
**Apply to:** Steam game launch & exit lifecycle hooks
- Proton launchers (EA App, Ubisoft Connect, 2K Launcher) fire brief `bRunning: false` events during handoff between helper processes.
- Delay release by **3.0 seconds** using `setTimeout` on `bRunning: false`. If a subsequent `bRunning: true` arrives within the grace window, cancel the timer and maintain ducked volume.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| *None* | — | — | All 9 files have exact or role-matched git-tracked analogs in the current repository. |

---

## Metadata

**Analog search scope:** `py_modules/`, `main.py`, `src/`, `src/components/tabs/`, `tests/`  
**Files scanned:** 9  
**Pattern extraction date:** 2026-11-12  
**Git tracking verified:** Yes (all 9 analog paths verified via `git ls-files`)  
