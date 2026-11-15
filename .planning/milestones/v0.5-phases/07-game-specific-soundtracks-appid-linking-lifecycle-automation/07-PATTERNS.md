# Phase 07: Game-Specific Soundtracks (appId Linking & Lifecycle Automation) - Pattern Map

**Mapped:** 2026-11-12  
**Files analyzed:** 15  
**Analogs found:** 15 / 15 (100% git-tracked codebase analogs)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `py_modules/vdf_parser.py` | service / utility | file-I/O / transform | `py_modules/images.py` | role-match |
| `py_modules/soundtrack.py` | service | event-driven / streaming | `py_modules/volume.py` | role-match |
| `py_modules/common.py` | model / config | transform / file-I/O | `py_modules/common.py` | exact |
| `py_modules/rpc_playback.py` | service / controller | request-response | `py_modules/rpc_playback.py` | exact |
| `main.py` | controller | request-response / event-driven | `main.py` | exact |
| `src/types.ts` | model / config | transform | `src/types.ts` | exact |
| `src/components/tabs/SoundtracksTab.tsx` | component | request-response | `src/components/tabs/SettingsTab.tsx` | role-match |
| `src/components/common/PlaylistPickerModal.tsx` | component | request-response | `src/components/common/TrackActionModal.tsx` | role-match |
| `src/components/common/Sidebar.tsx` | component | request-response | `src/components/common/Sidebar.tsx` | exact |
| `src/components/DeckifyExpandedModal.tsx` | component | request-response | `src/components/DeckifyExpandedModal.tsx` | exact |
| `src/index.tsx` | controller / component | request-response / event-driven | `src/index.tsx` | exact |
| `tests/test_vdf_parser.py` | test | file-I/O / transform | `tests/test_py_modules.py` | role-match |
| `tests/test_soundtrack.py` | test | event-driven / streaming | `tests/test_volume.py` | role-match |
| `tests/test_e2e_requirements.py` | test | request-response | `tests/test_e2e_requirements.py` | exact |
| `src/components/tabs/SoundtracksTab.test.tsx` | test | request-response | `src/components/tabs/QueueTab.test.tsx` | role-match |

---

## Pattern Assignments

### 1. `py_modules/vdf_parser.py` (service / utility, file-I/O / transform)

**Analog:** `py_modules/images.py` (lines 1-80) and `py_modules/common.py` (lines 100-140)

**Imports pattern:**
```python
import glob
import os
import re
import struct
import time
import zlib
from py_modules.common import decky
```

**Core Binary VDF Parsing & CRC32 Normalization Pattern (D-07, SOUND-01):**
```python
def parse_binary_vdf(data: bytes) -> dict:
    """Parse Valve KeyValues binary format (shortcuts.vdf) into nested dictionaries."""
    offset = 0
    length = len(data)

    def read_str() -> str:
        nonlocal offset
        end = data.find(b"\x00", offset)
        if end == -1:
            return ""
        s = data[offset:end].decode("utf-8", errors="replace")
        offset = end + 1
        return s

    def parse_dict() -> dict:
        nonlocal offset
        res = {}
        while offset < length:
            t = data[offset]
            offset += 1
            if t == 8:  # End of dictionary block
                break
            k = read_str()
            if t == 0:  # Nested Sub-dictionary
                res[k] = parse_dict()
            elif t == 1:  # String value
                res[k] = read_str()
            elif t == 2:  # 32-bit signed integer
                res[k] = struct.unpack_from("<i", data, offset)[0]
                offset += 4
            elif t == 3:  # 32-bit float
                res[k] = struct.unpack_from("<f", data, offset)[0]
                offset += 4
            elif t == 7:  # 64-bit signed integer
                res[k] = struct.unpack_from("<q", data, offset)[0]
                offset += 8
        return res

    if data and data[0] == 0:
        offset += 1
        name = read_str()
        return {name: parse_dict()}
    return parse_dict()

def compute_non_steam_appid(exe: str, app_name: str, raw_appid: int | None = None) -> int:
    """Compute unsigned 32-bit AppID matching SteamClient.Apps unAppID for Non-Steam shortcuts."""
    if raw_appid and raw_appid != 0:
        return struct.unpack("<I", struct.pack("<i", raw_appid))[0]
    combined = f"{exe}{app_name}".encode("utf-8")
    crc = zlib.crc32(combined) & 0xFFFFFFFF
    return (crc | 0x80000000) & 0xFFFFFFFF
```

**Installed Game Discovery & In-Memory TTL Cache Pattern:**
```python
_GAMES_CACHE: list[dict] = []
_GAMES_CACHE_TIME: float = 0.0
_GAMES_CACHE_TTL: float = 30.0  # 30-second TTL

def get_installed_games(force_refresh: bool = False) -> list[dict]:
    """Discover installed native Steam games and Non-Steam shortcuts with 30s TTL caching."""
    global _GAMES_CACHE, _GAMES_CACHE_TIME
    now = time.monotonic()
    if not force_refresh and _GAMES_CACHE and (now - _GAMES_CACHE_TIME < _GAMES_CACHE_TTL):
        return _GAMES_CACHE

    games: list[dict] = []
    # 1. Discover Steam native games via libraryfolders.vdf & appmanifest_*.acf
    # 2. Discover Non-Steam shortcuts via ~/.local/share/Steam/userdata/*/config/shortcuts.vdf
    # ...
    _GAMES_CACHE = games
    _GAMES_CACHE_TIME = now
    return games
```

**Error Handling & Fallback:**
- Catch `OSError`, `struct.error`, and `UnicodeDecodeError` cleanly; return empty list or skip corrupted shortcut entries rather than raising exceptions.

---

### 2. `py_modules/soundtrack.py` (service, event-driven / streaming)

**Analog:** `py_modules/volume.py` (lines 76-130 for task debouncing/cancellation, lines 360-460 for state lifecycle)

**Imports pattern:**
```python
import asyncio
import random
import time
from py_modules.common import _save_settings, decky
from py_modules import rpc_playback
```

**Core Debounced Lifecycle & Snapshot Engine Pattern (D-09, D-13, D-14, D-16, SOUND-02, SOUND-03):**
```python
class SoundtrackManager:
    """Manages game soundtrack transitions, lifecycle debounces, and playback snapshots."""

    def __init__(self, plugin):
        self.plugin = plugin
        self._active_app_id: int | None = None
        self._launch_task: asyncio.Task | None = None
        self._exit_task: asyncio.Task | None = None
        self._pre_game_snapshot: dict | None = None
        self._user_paused_in_game: bool = False
        self._soundtrack_active: bool = False

    async def on_game_launched(self, app_id: int):
        """Handle game launch event from SteamClient.Apps with 3.5s launch debounce."""
        if self._exit_task and not self._exit_task.done():
            self._exit_task.cancel()
            self._exit_task = None

        if self._active_app_id == app_id:
            return

        self._active_app_id = app_id
        self._user_paused_in_game = False

        if self._launch_task and not self._launch_task.done():
            self._launch_task.cancel()

        self._launch_task = asyncio.create_task(self._execute_launch(app_id))

    async def _execute_launch(self, app_id: int):
        try:
            debounce_sec = float(self.plugin._settings.get("launch_debounce_seconds", 3.5))
            await asyncio.sleep(debounce_sec)

            # Capture pre-game snapshot before starting game soundtrack (D-13)
            await self._capture_pre_game_snapshot()

            profile = self.get_profile(str(app_id))
            if profile and profile.get("soundtrack_playlists"):
                await self._start_game_soundtrack(app_id, profile)
            else:
                await self._handle_unbound_game(app_id)
        except asyncio.CancelledError:
            pass

    async def on_game_exited(self, app_id: int):
        """Handle game exit event with 3.0s exit debounce (D-15)."""
        if self._launch_task and not self._launch_task.done():
            self._launch_task.cancel()
            self._launch_task = None

        if self._exit_task and not self._exit_task.done():
            self._exit_task.cancel()

        self._exit_task = asyncio.create_task(self._execute_exit(app_id))

    async def _execute_exit(self, app_id: int):
        try:
            debounce_sec = float(self.plugin._settings.get("exit_debounce_seconds", 3.0))
            await asyncio.sleep(debounce_sec)

            # Save session seek position to profile (D-16)
            await self._save_session_progress(app_id)

            # Respect manual in-game pause (D-14)
            if self._user_paused_in_game and self.plugin._settings.get("respect_manual_pause", True):
                self._soundtrack_active = False
                self._active_app_id = None
                return

            # Restore pre-game snapshot (D-13)
            await self._restore_pre_game_snapshot()
            self._soundtrack_active = False
            self._active_app_id = None
        except asyncio.CancelledError:
            pass
```

**Error Handling & Fallback:**
- Propagate `asyncio.CancelledError` silently during launcher transitions.
- All Spotify playback invocations wrapped in `try/except` with fallback to `auto_transfer_and_play`.

---

### 3. `py_modules/common.py` (model / config, transform / file-I/O)

**Analog:** `py_modules/common.py` (lines 70-95, lines 123-165)

**DEFAULT_SETTINGS Schema Extension Pattern:**
```python
DEFAULT_SETTINGS = {
    # Existing settings...
    "game_audio_profiles": {},                # Dict[str, GameAudioProfile]
    "game_soundtracks_enabled": True,
    "unbound_games_policy": "keep_playing",   # "keep_playing" | "auto_pause"
    "fallback_soundtrack_enabled": False,
    "fallback_soundtrack_uri": "",
    "fallback_soundtrack_name": "",
    "launch_debounce_seconds": 3.5,
    "exit_debounce_seconds": 3.0,
    "exit_restore_policy": "restore_snapshot", # "restore_snapshot" | "always_pause" | "keep_playing"
    "respect_manual_pause": True,
}
```

**_load_settings() Sanitization & Clamping Pattern:**
```python
if not isinstance(merged.get("game_soundtracks_enabled"), bool):
    merged["game_soundtracks_enabled"] = bool(merged.get("game_soundtracks_enabled", True))
if merged.get("unbound_games_policy") not in ("keep_playing", "auto_pause"):
    merged["unbound_games_policy"] = "keep_playing"
if not isinstance(merged.get("fallback_soundtrack_enabled"), bool):
    merged["fallback_soundtrack_enabled"] = bool(merged.get("fallback_soundtrack_enabled", False))
try:
    merged["launch_debounce_seconds"] = max(1.0, min(10.0, float(merged.get("launch_debounce_seconds", 3.5))))
except (TypeError, ValueError):
    merged["launch_debounce_seconds"] = 3.5
try:
    merged["exit_debounce_seconds"] = max(1.0, min(10.0, float(merged.get("exit_debounce_seconds", 3.0))))
except (TypeError, ValueError):
    merged["exit_debounce_seconds"] = 3.0
if merged.get("exit_restore_policy") not in ("restore_snapshot", "always_pause", "keep_playing"):
    merged["exit_restore_policy"] = "restore_snapshot"
if not isinstance(merged.get("respect_manual_pause"), bool):
    merged["respect_manual_pause"] = bool(merged.get("respect_manual_pause", True))
if not isinstance(merged.get("game_audio_profiles"), dict):
    merged["game_audio_profiles"] = {}
```

---

### 4. `py_modules/rpc_playback.py` (service / controller, request-response)

**Analog:** `py_modules/rpc_playback.py` (lines 320-367)

**Core `play_tracks` Extension with `position_ms` Pattern:**
```python
async def play_tracks(
    plugin,
    context_uri: str | None = None,
    offset_uri: str | None = None,
    uris: list | None = None,
    position: int = 0,
    position_ms: int = 0,
) -> dict:
    """Start playback of a context, URI list, or single track with optional position_ms seek."""
    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}

    if isinstance(offset_uri, list):
        uris, offset_uri = offset_uri, None

    body = {}
    if context_uri:
        body["context_uri"] = context_uri
        if offset_uri:
            body["offset"] = {"uri": offset_uri}
        plugin._context_uri = context_uri
    elif uris:
        body["uris"] = uris
        if position > 0:
            body["offset"] = {"position": position}
    elif offset_uri and str(offset_uri).strip():
        body["uris"] = [str(offset_uri).strip()]

    if position_ms > 0:
        body["position_ms"] = int(position_ms)

    try:
        await _exec(
            _spotify_api_request, "me/player/play", token, "PUT", None, body,
        )
        return {"ok": True}
    except urllib.error.HTTPError as e:
        if e.code == 404:
            transfer_res = await plugin._auto_transfer_and_play(token)
            if transfer_res.get("ok") and body:
                try:
                    await asyncio.sleep(0.5)
                    await _exec(_spotify_api_request, "me/player/play", token, "PUT", None, body)
                    return {"ok": True}
                except Exception:
                    pass
            return transfer_res
        return {"ok": False, "error": _parse_spotify_error(e)}
    except Exception as e:
        decky.logger.error("play_tracks failed: %s", e)
        return {"ok": False, "error": str(e)}
```

---

### 5. `main.py` (controller, request-response / event-driven)

**Analog:** `main.py` (lines 114-148 for lifecycle, lines 650-690 for RPC callable routing)

**SoundtrackManager Lifecycle Wiring & RPC Dispatch Pattern:**
```python
# In _main():
self._soundtrack_manager = soundtrack.SoundtrackManager(self)

# In _unload():
if hasattr(self, "_soundtrack_manager") and self._soundtrack_manager:
    await self._soundtrack_manager.stop()
    self._soundtrack_manager = None

# New RPC callable methods:
async def handle_game_lifecycle(self, app_id: int, running: bool) -> dict:
    """Coordinate ducking and soundtrack playback upon game launch or exit."""
    if hasattr(self, "_soundtrack_manager") and self._soundtrack_manager:
        if running:
            await self._soundtrack_manager.on_game_launched(int(app_id))
        else:
            await self._soundtrack_manager.on_game_exited(int(app_id))
    # Still invoke ducking
    await self.trigger_ducking(running, reason="game", app_id=app_id)
    return {"ok": True}

async def get_installed_games(self, force_refresh: bool = False) -> dict:
    """Return discovered native Steam and Non-Steam games."""
    games = await _exec(lambda: vdf_parser.get_installed_games(force_refresh))
    return {"ok": True, "games": games or []}

async def save_game_soundtrack_profile(self, app_id: str, profile: dict) -> dict:
    """Update profile configuration for a specific game."""
    profiles = dict(self._settings.get("game_audio_profiles", {}))
    profiles[str(app_id)] = profile
    self._settings["game_audio_profiles"] = profiles
    _save_settings(self._settings)
    await decky.emit("settings_changed", dict(self._settings))
    return {"ok": True}

async def bind_current_music_to_game(self, app_id: int) -> dict:
    """1-click quick binding from QAM mini-player (D-04, D-18)."""
    if hasattr(self, "_soundtrack_manager"):
        return await self._soundtrack_manager.bind_current_music(app_id)
    return {"ok": False, "error": "Soundtrack manager not ready"}
```

---

### 6. `src/types.ts` (model / config, transform)

**Analog:** `src/types.ts` (lines 4-32 for `ViewMode`, lines 222-232 for `GameAudioProfile`)

**TypeScript Interface Definitions Pattern:**
```typescript
// ViewMode addition:
export type ViewMode =
  | "now_playing"
  | "lyrics"
  | "playlists"
  | "liked"
  | "albums"
  | "artists"
  | "recent"
  | "episodes"
  | "search"
  | "queue"
  | "devices"
  | "soundtracks"  // Phase 07 addition
  | "engine";

export type PlaylistSelectionMode = "shuffle" | "random" | "rotation";
export type ResumeMode = "remember_position" | "fresh_start";

export interface SoundtrackItem {
  uri: string;
  name: string;
  type: "playlist" | "album";
  image_url?: string;
  track_count?: number;
}

export interface GameAudioProfile {
  volume: number;
  ducking: boolean;
  ducking_level?: number;
  // Phase 07 extensions:
  soundtrack_playlists?: SoundtrackItem[];
  playback_mode?: PlaylistSelectionMode;
  resume_mode?: ResumeMode;
  always_auto_start?: boolean;
  last_track_uri?: string;
  last_position_ms?: number;
  rotation_index?: number;
}

export interface InstalledGame {
  app_id: string;
  name: string;
  is_non_steam: boolean;
  is_running?: boolean;
  exe?: string;
  icon_url?: string;
  capsule_url?: string;
}
```

---

### 7. `src/components/tabs/SoundtracksTab.tsx` (component, request-response)

**Analog:** `src/components/tabs/SettingsTab.tsx` (lines 423-568 for card styling and `flow-children="horizontal"`) and `src/components/tabs/PlaylistsTab.tsx` (lines 60-120)

**Imports & Structure Pattern:**
```tsx
import { FC, useState, useMemo } from "react";
import { Focusable, TextField } from "@decky/ui";
import { FaGamepad, FaPlus, FaTrash, FaRandom, FaSyncAlt, FaMusic } from "react-icons/fa";
import { InstalledGame, GameAudioProfile, SoundtrackItem } from "../../types";
import { InteractiveRow } from "../common/InteractiveRow";
import { DeckifyImage } from "../common/DeckifyImage";
import { PlaylistPickerModal } from "../common/PlaylistPickerModal";

export const SoundtracksTab: FC<{
  runningAppId: number | null;
  profiles: Record<string, GameAudioProfile>;
  onSaveProfile: (appId: string, profile: GameAudioProfile) => Promise<void>;
  showToast: (msg: string) => void;
}> = ({ runningAppId, profiles, onSaveProfile, showToast }) => {
  const [searchFilter, setSearchFilter] = useState("");
  const [selectedGameForPicker, setSelectedGameForPicker] = useState<InstalledGame | null>(null);

  // Focusable horizontal layout for mode selection (D-02):
  // <Focusable flow-children="horizontal" style={{ display: "flex", gap: 6 }}>
```

**Spatial Navigation & Game Card Layout Pattern:**
- Each game card has `flow-children="column"`.
- Buttons inside cards (Mode selectors, Volume sliders, Add Playlist) use `flow-children="horizontal"`.
- Distinct "Non-Steam" badge: `background: "rgba(255,255,255,0.1)", color: "#fff", fontSize: 10, padding: "2px 6px", borderRadius: 4`.

---

### 8. `src/components/common/PlaylistPickerModal.tsx` (component, request-response)

**Analog:** `src/components/common/TrackActionModal.tsx` (lines 180-238) and `src/components/tabs/SearchTab.tsx` (lines 40-85)

**Tabbed Modal Overlay Pattern (D-05):**
```tsx
export const PlaylistPickerModal: FC<{
  isOpen: boolean;
  onClose: () => void;
  onSelect: (item: SoundtrackItem) => void;
  allUserPlaylists: PlaylistItem[];
  savedAlbums: AlbumItem[];
}> = ({ isOpen, onClose, onSelect, allUserPlaylists, savedAlbums }) => {
  const [activeTab, setActiveTab] = useState<"playlists" | "albums" | "search">("playlists");
  const [searchQuery, setSearchQuery] = useState("");

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 38,
        background: "rgba(0,0,0,0.85)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 101,
      }}
    >
      <Focusable
        flow-children="column"
        style={{
          background: "#1c1c1c",
          border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 14,
          padding: 20,
          width: 420,
          maxWidth: "92%",
          maxHeight: "80%",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <h3 style={{ margin: "0 0 8px 0", fontSize: 16, fontWeight: 800 }}>Assign Soundtrack</h3>

        {/* Tab Headers */}
        <Focusable flow-children="horizontal" style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {[
            { id: "playlists", label: "My Playlists" },
            { id: "albums", label: "My Albums" },
            { id: "search", label: "Spotify Search" },
          ].map((t) => (
            <InteractiveRow
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              active={activeTab === t.id}
              style={{ flex: 1, justifyContent: "center", fontSize: 11, fontWeight: 700, padding: "6px" }}
            >
              {t.label}
            </InteractiveRow>
          ))}
        </Focusable>
        {/* Content list & Cancel button */}
      </Focusable>
    </div>
  );
};
```

---

### 9. `src/components/common/Sidebar.tsx` (component, request-response)

**Analog:** `src/components/common/Sidebar.tsx` (lines 110-128)

**Soundtracks Navigation Button Pattern:**
```tsx
{/* Under Library or Control section in Sidebar.tsx: */}
<SidebarBtn
  id="soundtracks"
  label="Soundtracks"
  icon={<FaGamepad size={12} />}
  active={mode === "soundtracks"}
  onSelect={onSelectMode}
/>
```

---

### 10. `src/components/DeckifyExpandedModal.tsx` (component, request-response)

**Analog:** `src/components/DeckifyExpandedModal.tsx` (lines 750-915)

**Routing Pattern for Soundtracks Tab:**
```tsx
{mode === "soundtracks" && (
  <SoundtracksTab
    runningAppId={runningAppId}
    profiles={status?.settings?.game_audio_profiles || {}}
    onSaveProfile={handleSaveGameProfile}
    showToast={showToast}
  />
)}
```

---

### 11. `src/index.tsx` (controller / component, request-response / event-driven)

**Analog:** `src/index.tsx` (lines 480-520 for QAM buttons, lines 766-797 for `RegisterForAppLifetimeNotifications`)

**1-Click QAM Quick Binding Button Pattern (D-04, D-18):**
```tsx
{activeGameAppId && isPlaying && (
  <PanelSectionRow>
    <DialogButton
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        background: "rgba(29, 185, 84, 0.15)",
        borderColor: "#1db954",
        color: "#1db954",
        fontSize: 12,
        fontWeight: 700,
        padding: "8px 12px",
      }}
      onClick={async () => {
        const res = await backendBindCurrentMusic(activeGameAppId);
        if (res.ok) {
          showToast("Soundtrack bound to active game!");
        } else {
          showToast("Failed to bind soundtrack");
        }
      }}
    >
      <FaGamepad />
      <span>Bind Current Music to Game</span>
    </DialogButton>
  </PanelSectionRow>
)}
```

---

### 12. `tests/test_vdf_parser.py` (test, file-I/O / transform)

**Analog:** `tests/test_py_modules.py` (lines 53-160)

**Binary VDF & CRC32 Unit Test Pattern:**
```python
import struct
import unittest
import zlib
from py_modules import vdf_parser

class TestVdfParser(unittest.TestCase):
    def test_compute_non_steam_appid_crc32(self):
        exe = '"/usr/bin/retroarch"'
        app_name = "RetroArch"
        expected = (zlib.crc32(f"{exe}{app_name}".encode("utf-8")) | 0x80000000) & 0xFFFFFFFF
        calc = vdf_parser.compute_non_steam_appid(exe, app_name)
        self.assertEqual(calc, expected)
        self.assertGreater(calc, 0)
        self.assertLessEqual(calc, 0xFFFFFFFF)

    def test_parse_binary_vdf_shortcuts(self):
        # Construct synthetic binary VDF payload
        payload = bytearray([0x00]) + b"shortcuts\x00"
        # shortcut 0
        payload += bytearray([0x00]) + b"0\x00"
        payload += bytearray([0x01]) + b"appname\x00" + b"Cyberpunk Non-Steam\x00"
        payload += bytearray([0x01]) + b"exe\x00" + b"/games/cp2077.exe\x00"
        payload += bytearray([0x02]) + b"appid\x00" + struct.pack("<i", -123456)
        payload += bytearray([0x08, 0x08])  # End dicts

        parsed = vdf_parser.parse_binary_vdf(bytes(payload))
        self.assertIn("shortcuts", parsed)
        self.assertIn("0", parsed["shortcuts"])
        self.assertEqual(parsed["shortcuts"]["0"]["appname"], "Cyberpunk Non-Steam")
```

---

### 13. `tests/test_soundtrack.py` (test, event-driven / streaming)

**Analog:** `tests/test_volume.py` (lines 20-60, lines 157-180)

**SoundtrackManager Lifecycle & Snapshot Unit Test Pattern:**
```python
import asyncio
import tempfile
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
    from py_modules import common, soundtrack

class TestSoundtrackManager(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.mock_plugin = SimpleNamespace(
            _settings=dict(common.DEFAULT_SETTINGS),
            _is_playing=True,
            _context_uri="spotify:playlist:chill",
            _poll_play_state="playing",
            _poll_volume=80,
            _ensure_token=AsyncMock(return_value="mock_token"),
        )
        self.sm = soundtrack.SoundtrackManager(self.mock_plugin)

    async def test_launch_debounce_window_cancels_on_early_exit(self):
        self.mock_plugin._settings["launch_debounce_seconds"] = 0.1
        with patch.object(self.sm, "_start_game_soundtrack", new_callable=AsyncMock) as mock_start:
            await self.sm.on_game_launched(1091500)
            await asyncio.sleep(0.02)
            # Immediate exit before 0.1s debounce window finishes
            await self.sm.on_game_exited(1091500)
            await asyncio.sleep(0.12)
            mock_start.assert_not_called()

    async def test_snapshot_capture_and_restore(self):
        self.sm._pre_game_snapshot = {
            "is_playing": True,
            "context_uri": "spotify:playlist:ambient",
            "track_uri": "spotify:track:song1",
            "position_ms": 45000,
            "volume": 80,
        }
        with patch.object(self.sm.plugin, "control_playback", new_callable=AsyncMock) as mock_ctrl, \
             patch("py_modules.rpc_playback.play_tracks", new_callable=AsyncMock) as mock_play:
            await self.sm._restore_pre_game_snapshot()
            mock_play.assert_called_once()
```

---

### 14. `tests/test_e2e_requirements.py` (test, request-response)

**Analog:** `tests/test_e2e_requirements.py` (lines 1600-1675)

**Soundtrack E2E Requirements Test Pattern (SOUND-01, SOUND-02, SOUND-03):**
```python
def test_soundtrack_default_settings_schema(self):
    """Verify DEFAULT_SETTINGS contains all Phase 07 soundtrack configuration keys."""
    self.assertIn("game_audio_profiles", common.DEFAULT_SETTINGS)
    self.assertIn("game_soundtracks_enabled", common.DEFAULT_SETTINGS)
    self.assertIn("unbound_games_policy", common.DEFAULT_SETTINGS)
    self.assertIn("fallback_soundtrack_enabled", common.DEFAULT_SETTINGS)
    self.assertIn("launch_debounce_seconds", common.DEFAULT_SETTINGS)
    self.assertIn("exit_debounce_seconds", common.DEFAULT_SETTINGS)
    self.assertIn("exit_restore_policy", common.DEFAULT_SETTINGS)
    self.assertIn("respect_manual_pause", common.DEFAULT_SETTINGS)

async def test_handle_game_lifecycle_rpc_endpoint(self):
    """handle_game_lifecycle dispatches to soundtrack manager and ducking fader."""
    res = await self.plugin.handle_game_lifecycle(1091500, True)
    self.assertTrue(res.get("ok"))
```

---

### 15. `src/components/tabs/SoundtracksTab.test.tsx` (test, request-response)

**Analog:** `src/components/tabs/QueueTab.test.tsx` (lines 1-80) and `src/components/tabs/SettingsTab.test.tsx`

**Vitest Component Test Structure Pattern:**
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
  TextField: (props: any) => ({
    type: "TextField",
    props,
  }),
}));

import { SoundtracksTab } from "./SoundtracksTab";

describe("SoundtracksTab Component", () => {
  it("renders running game at the top of list when runningAppId matches", () => {
    // Test assertion verifying running game pin
  });

  it("filters game list when search input is typed", () => {
    // Test assertion for search filter
  });
});
```

---

## Shared Patterns

### SteamOS Controller Focus & Horizontal Navigation
**Source:** `src/components/tabs/SettingsTab.tsx:462`, `src/components/tabs/SearchTab.tsx:74`  
**Apply to:** `SoundtracksTab.tsx`, `PlaylistPickerModal.tsx`  
```tsx
<Focusable flow-children="horizontal" style={{ display: "flex", gap: 6 }}>
  {/* Sub-buttons, mode switchers, or tabs */}
</Focusable>
```
*Rule:* Containers with horizontal interactive elements MUST use `flow-children="horizontal"` to prevent spatial D-pad navigation loss or vertical jumping.

### Content Security Policy Image Handling
**Source:** `py_modules/images.py`, `src/components/common/DeckifyImage.tsx`  
**Apply to:** Game artwork capsules, album thumbnails, playlist covers in `SoundtracksTab.tsx` and `PlaylistPickerModal.tsx`  
```tsx
<DeckifyImage src={item.image_url} width={40} height={40} style={{ borderRadius: 6 }} />
```
*Rule:* Direct CDN URLs (`https://i.scdn.co/`, `https://steamcdn-a.akamaihd.net/`) are blocked by Steam GamepadUI CEF; all external artwork must pass through `DeckifyImage` / `fetchImageAsBase64`.

### Debounced Cancellation Pattern
**Source:** `py_modules/volume.py:84-95`  
**Apply to:** `py_modules/soundtrack.py` (`_launch_task`, `_exit_task`)  
```python
if self._task and not self._task.done():
    self._task.cancel()
    try:
        await self._task
    except asyncio.CancelledError:
        pass
self._task = asyncio.create_task(...)
```

---

## No Analog Found

None. All 15 files have high-fidelity git-tracked codebase analogs.

---

## Metadata

**Analog search scope:** `py_modules/`, `src/`, `src/components/`, `tests/`  
**Files scanned:** 18  
**Pattern extraction date:** 2026-11-12  
