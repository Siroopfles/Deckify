# Phase 07: Game-Specific Soundtracks (appId Linking & Lifecycle Automation) - Research
**Researched:** 2026-11-12  
**Domain:** Steam GamepadUI AppLifecycle Automation, Steam & Non-Steam VDF Discovery, Audio State Snapshot Engine & Soundtracks UI  
**Confidence:** HIGH  

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Profile Creation & Game Binding UX
- **D-01 (Dedicated Soundtracks Tab & Navigation):** Create a dedicated "Soundtracks" / "Games" tab in the Expanded Modal (`DeckifyExpandedModal.tsx`) specifically for managing installed Steam & Non-Steam games and their assigned music, kept separate from `SettingsTab.tsx`. — **Reversibility:** costly — introduces a new primary navigation tab and component architecture.
- **D-02 (Multi-Playlist Support Per Game):** Allow linking multiple playlists or albums to a single game profile. Users can configure how multiple playlists are handled: Multi-playlist Shuffle (combined track pool), Random Playlist Picker (selects one playlist at launch), or Sequential Rotation (cycles to next playlist on each launch). — **Reversibility:** costly — data schema in `game_audio_profiles` must store an array of playlists and playback mode.
- **D-03 (Installed Games Discovery & Display):** The Soundtracks tab discovers installed games via SteamClient APIs / shortcuts, prioritizing actively running and recently played games at the top, equipped with an instant search/filter bar and cover artwork. — **Reversibility:** reversible
- **D-04 (Quick Access Menu & Game Context Menu Shortcuts):** Provide a quick 1-click "Set current playlist for active game" button in the QAM mini-player while a game is running. Attempt registering a SteamOS Game Context Menu action ("Link Spotify playlist") via Decky loader, with seamless fallback to QAM and the Soundtracks tab. — **Reversibility:** reversible
- **D-05 (Modal Playlist & Album Picker):** When assigning music in the Soundtracks tab, display a modal picker with tabs for "My Playlists", "My Albums", and a direct Spotify search bar. — **Reversibility:** reversible
- **D-06 (Per-Game Volume & Ducking Override):** Each game profile can optionally specify a custom volume slider override and a toggle to enable/disable audio ducking specifically for that game. — **Reversibility:** reversible
- **D-07 (Non-Steam Shortcut Detection):** Parse Steam `shortcuts.vdf` to detect Non-Steam games (emulators, Heroic, Lutris), compute normalized unsigned 32-bit CRC appIds, and render them with a distinct "Non-Steam" badge. — **Reversibility:** costly — CRC32 normalization and non-Steam shortcut parsing.
- **D-08 (Profile Playlist Management):** Game cards show a direct list of assigned playlists with cover thumbnails, title, remove button (X), and an "Add playlist" button. — **Reversibility:** reversible

#### Launch Playback Mode
- **D-09 (Launch Debounce Window):** Enforce a 3.0 to 4.0 second debounce window after `SteamClient.Apps.RegisterForAppLifetimeNotifications` signals `bRunning: true` before starting soundtrack playback, allowing Proton, shaders, and splash screens to initialize without audio stuttering or process flapping. — **Reversibility:** reversible
- **D-10 (Track Position & Resume Mode):** Configurable per game profile: "Remember position" (saves and resumes exact track URI and millisecond seek position) vs "Fresh start / Shuffle". Default is "Remember position". — **Reversibility:** reversible
- **D-11 (Pre-Game Playback Interruption Notification):** If music is already playing when a game with a soundtrack launches, display a Steam toast notification with an option to switch over to the game soundtrack, unless "Always auto-start" is enabled in that game's profile. Pre-game state is captured in a snapshot. — **Reversibility:** reversible
- **D-12 (Connect Engine Activation):** If Spotify is paused or idle at game launch, Deckify wakes up the local Spotify Connect device (`librespot` / `spotifyd`) and begins soundtrack playback (when auto-play is enabled). — **Reversibility:** reversible

#### Game Exit & Restore Policy
- **D-13 (Pre-Game Snapshot Restoration Default):** Upon game exit, default to restoring the pre-game playback snapshot (resumes pre-game track and seek position if music was playing prior to launch; pauses cleanly if idle). Configurable per profile or globally (options: restore snapshot, always pause, or keep soundtrack playing). — **Reversibility:** reversible
- **D-14 (Respect Manual In-Game Pause):** If the user manually pauses Spotify during gameplay, Deckify respects this and remains paused upon game exit (no unexpected music blast), with configurable options for auto-restore anyway or a toast prompt ("Resume pre-game music?"). — **Reversibility:** reversible
- **D-15 (3.0s Exit Debounce):** Use a 3.0s debounce timer on game exit before triggering state restore, matching Phase 6's tested behavior to prevent false exits during resolution changes or launcher shutdowns. — **Reversibility:** reversible
- **D-16 (Save Track URI & Milliseconds on Exit):** Automatically record the current track URI and playback position in milliseconds into the game's profile state in `settings.json` on exit so the next session can resume seamlessly. — **Reversibility:** reversible

#### Unbound Game Behavior
- **D-17 (Unbound Games Global Policy):** Configurable global setting: "Unbound games: Keep Playing (with ducking) vs Auto-pause". Default is "Keep Playing" to preserve existing user experience. — **Reversibility:** reversible
- **D-18 (Subtle QAM Binding Indicator):** When an unbound game is active, display a subtle indicator/button in the QAM mini-player ("Bind current music to this game"), avoiding intrusive toast popups during gameplay. — **Reversibility:** reversible
- **D-19 (Default / Fallback Soundtrack Option):** Provide an optional "Default / Fallback Game Soundtrack" toggle in settings to automatically play a designated playlist for any game that lacks a specific profile. — **Reversibility:** reversible
- **D-20 (Ducking-Only Game Profiles):** Allow game profiles to define custom ducking volumes even when no soundtrack playlist is assigned (e.g. duck music by 70% during Cyberpunk). — **Reversibility:** reversible

### the agent's Discretion
- Visual styling of the Soundtracks tab matching SteamOS GamepadUI aesthetic and responsive focus handling.
- Internal caching of installed game metadata in memory to avoid repeated disk reads.
- Snapshot state machine resilience against network dropouts and headless test runs.

### Deferred Ideas (OUT OF SCOPE)
- None — all decisions and features requested remained strictly within Phase 7 scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **SOUND-01** | User can bind a Spotify playlist or album to a specific Steam game `appId` in Deckify settings with custom auto-play preference. | Schema extensions in `game_audio_profiles` dictionary (`py_modules/common.py:83`), new `SoundtracksTab.tsx` in `DeckifyExpandedModal.tsx`, and tabbed playlist picker modal (`My Playlists`, `My Albums`, Spotify Search). |
| **SOUND-02** | User experiences automatic soundtrack playback upon game launch via `SteamClient.Apps.RegisterForAppLifetimeNotifications` with launcher debounce (3-5s). | Unified `SoundtrackManager` in `py_modules/soundtrack.py` wired to `RegisterForAppLifetimeNotifications` (`src/index.tsx:771-793`) executing a 3.5s launch debounce task, Proton intermediate launcher cancellation protection, and Spotify Connect device wake-up via `auto_transfer_and_play`. |
| **SOUND-03** | User experiences seamless restoration of their pre-game playback state (or automatic pause) when the game exits. | Pre-game playback snapshot engine capturing `{ is_playing, context_uri, track_uri, position_ms, volume }`, 3.0s exit debounce timer matching Phase 6 ducking, in-game manual pause tracking (`_user_paused_in_game`), and precise session seek position saving (`last_track_uri`, `last_position_ms`). |
</phase_requirements>

## Project Constraints (from GEMINI.md)

- **Steam CEF Content Security Policy:** Steam GamepadUI blocks direct external image URLs (`https://i.scdn.co/`), requiring internal proxying/base64 encoding. Game artwork and playlist covers must resolve via `fetchImageAsBase64` or backend base64 proxy (`py_modules/images.py`).
- **SteamOS GamepadUI Navigation:** Controller focus relies on spatial navigation (`flow-children`, `@decky/ui`); containers with horizontal controls must use `flow-children="horizontal"` to prevent focus loss or vertical jumps.
- **Steam Deck Environment:** Runs in the `deck` user space (UID 1000) under SteamOS 3.5+.
- **Subprocess Environment Isolation:** Decky Loader's bundled Python libraries conflict with SteamOS system libraries. `os.environ.pop("LD_LIBRARY_PATH", None)` is mandatory before spawning subprocesses. Use `_build_deck_command` for any user-space system calls.
- **Zero Hallucinated Dependencies:** Zero new external NPM or PyPI packages are needed. Binary VDF parsing must be implemented in pure Python stdlib (`struct`, `os`, `zlib`) without requiring external `pip install vdf`.

---

## Summary

Phase 07 delivers full-cycle game soundtrack automation for the Steam Deck. When a player launches a game, Deckify automatically starts their tailored Spotify soundtrack (or a curated multi-playlist shuffle/rotation), adjusts the volume or applies custom audio ducking overrides, and upon game exit restores their previous listening session with millisecond precision without audio jarring or unwanted blasts.

In the current codebase:
- `src/index.tsx:771-793` hooks `SteamClient.Apps.RegisterForAppLifetimeNotifications` exclusively for audio ducking [VERIFIED: `src/index.tsx:771-793`], invoking `backendTriggerDucking(true, "game", appId)` [VERIFIED: `src/index.tsx:783`]. The `appId` parameter is passed across RPC but ignored in `main.py:662` [VERIFIED: `main.py:662`].
- `DEFAULT_SETTINGS` in `py_modules/common.py:83` already provisions `"game_audio_profiles": {}` [VERIFIED: `py_modules/common.py:83`], ready to be populated with structured game soundtrack metadata.
- Playback orchestration in `py_modules/rpc_playback.py:320-367` (`play_tracks`) supports `context_uri`, `uris`, and `offset` [VERIFIED: `py_modules/rpc_playback.py:320-347`], but needs extension to support `position_ms` directly in `PUT /v1/me/player/play` for resume restoration.

The Phase 07 architecture introduces:
1. **Backend Soundtrack & State Snapshot Engine (`py_modules/soundtrack.py`):**
   - Coordinates launch debounce (3.5s) and exit debounce (3.0s).
   - Captures atomic pre-game playback snapshots (`is_playing`, `context_uri`, `track_uri`, `position_ms`, `volume`).
   - Supports multi-playlist modes (`shuffle` pool, `random` picker, `rotation` sequence).
   - Tracks in-game manual user pauses (`_user_paused_in_game`) to guarantee that pausing music during gameplay keeps music paused upon game exit (D-14).
   - Persists session seek positions (`last_track_uri`, `last_position_ms`) to `game_audio_profiles` upon game exit (D-16).
2. **Pure Python Stdlib Steam & Non-Steam Discovery (`py_modules/vdf_parser.py`):**
   - Parses Steam's binary `shortcuts.vdf` (`~/.local/share/Steam/userdata/*/config/shortcuts.vdf`) to extract non-Steam games (emulators, Heroic, Lutris) with unsigned 32-bit CRC appIds (`(zlib.crc32(exe + name) | 0x80000000) & 0xFFFFFFFF`).
   - Parses `libraryfolders.vdf` and `appmanifest_*.acf` to discover installed native Steam games.
   - Zero external PyPI dependencies (`vdf` package is NOT required).
3. **Dedicated Soundtracks Tab (`src/components/tabs/SoundtracksTab.tsx`):**
   - Registered as `"soundtracks"` in `ViewMode` (`src/types.ts:4-16`) and `Sidebar.tsx:110-128`.
   - Displays installed games sorted by active/recent with search filter and "Non-Steam" badges.
   - Game card shows assigned playlists, mode selector, volume & ducking overrides.
   - Tabbed playlist picker modal ("My Playlists", "My Albums", Spotify Search).
4. **QAM Mini-Player 1-Click Binding Button:**
   - When a game is running and Spotify is active, a subtle button in `src/index.tsx` ("Bind current music to this game") enables instant 1-click binding without navigating away.

**Primary recommendation:** Implement `py_modules/vdf_parser.py` and `py_modules/soundtrack.py` on the backend, extend `trigger_ducking` / lifecycle dispatch in `main.py`, mount the new `"soundtracks"` navigation tab in `Sidebar.tsx` and `DeckifyExpandedModal.tsx`, and add the 1-click binding button to the QAM mini-player.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| **App Lifetime Detection** | Frontend (`src/index.tsx`) | SteamOS CEF (`SteamClient.Apps`) | `window.SteamClient.Apps.RegisterForAppLifetimeNotifications` exists solely in the GamepadUI CEF renderer context. |
| **Launch & Exit Debouncing** | Backend (`py_modules/soundtrack.py`) | Frontend (`src/index.tsx`) | Non-blocking `asyncio` timers in Python prevent race conditions, process flapping, and false exits during Proton launcher transitions. |
| **Pre-Game State Snapshot & Restore** | Backend (`py_modules/soundtrack.py`) | Spotify Web API (`rpc_playback.py`) | Captures and resumes playback context, track URI, millisecond seek position, and volume across game boundaries. |
| **Non-Steam Shortcut & VDF Discovery** | Backend (`py_modules/vdf_parser.py`) | OS Filesystem (`~/.local/share/Steam`) | Fast binary and text VDF parsing executed asynchronously in Python daemon with in-memory TTL caching. |
| **Cover Art & CSP Proxying** | Backend (`py_modules/images.py`) | Frontend (`DeckifyImage`) | Steam CEF blocks external image CDNs; local base64 proxy bypasses CSP for both Spotify and Steam Grid artwork. |
| **Per-Game Volume & Ducking Overrides** | Backend (`py_modules/volume.py`) | PipeWire / `pactl` | Overrides global ducking targets and fades volume locally using PipeWire sink inputs without Web API latency. |
| **Soundtracks Management UI** | Frontend (`src/components/tabs/SoundtracksTab.tsx`) | SteamOS `@decky/ui` | Full-screen controller-navigable interface for assigning playlists, switching playback modes, and tweaking overrides. |
| **1-Click QAM Quick Binding** | Frontend (`src/index.tsx`) | Backend (`soundtrack.py`) | Instant mini-player button active only while games are running, enabling zero-friction soundtrack assignment. |

---

## Standard Stack

### Core
| Library / Utility | Version / Spec | Purpose | Why Standard |
|-------------------|----------------|---------|--------------|
| Python `asyncio` | 3.11+ (Python stdlib) | Debounce tasks, snapshot coordination, playback triggers | Native event loop providing clean cancellation (`task.cancel()`) on launcher flapping. |
| Python `struct` & `zlib` | Python stdlib | Binary VDF unpacking & CRC32 non-Steam AppID calculation | Standard IEEE CRC32 polynomial and little-endian binary decoding; zero dependencies. |
| `@decky/api` | 1.1.3 [VERIFIED: `package.json:30`] | Frontend-to-backend RPC bridge (`callable`, `emit`) | Official Decky Loader communication mechanism. |
| `@decky/ui` | 4.11.1 [VERIFIED: `package.json:31`] | SteamOS spatial navigation & components | `Focusable`, `DialogButton`, `SliderField`, `ToggleField`, `DropdownItem`. |
| `react-icons` | 5.5.0 [VERIFIED: `package.json:37`] | Icons for Soundtracks tab & actions | `FaGamepad`, `FaPlus`, `FaTrash`, `FaShuffle`, `FaSyncAlt`, `FaSearch`. |

### Supporting
| Library / Utility | Version / Spec | Purpose | When to Use |
|-------------------|----------------|---------|-------------|
| `fetchImageAsBase64` | In-repo (`src/utils.ts`) | Frontend base64 image resolver | Rendering Spotify covers and Steam game capsules in CEF without CSP errors. |
| `_save_settings` | In-repo (`py_modules/common.py:165`) | Atomic JSON settings persistence | Saving `game_audio_profiles` updates and session seek positions safely. |
| `VolumeFader` | In-repo (`py_modules/volume.py:158`) | Local PipeWire audio ducking | Applying per-game ducking volume overrides and smooth fade-outs. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Stdlib `vdf_parser.py` | PyPI `vdf` library | **Rejected:** `vdf` is not pre-installed in Decky Loader's Python environment [VERIFIED: `ModuleNotFoundError`]. Stdlib implementation is < 60 lines and zero-dependency. |
| Backend launch debounce (3.5s) | Instant launch trigger (0s) | **Rejected:** Proton games spin up intermediate launchers (Ubisoft, EA, 2K, Wine splash screens); 0s debounce causes audio stutter and false restarts. |
| Local seek restoration (`position_ms`) | Track 1 restart only | **Rejected:** Users listening to podcasts, long mixes, or game OSTs lose their place every session; resuming exact `position_ms` delivers a premium experience. |

---

## Package Legitimacy Audit

> All capabilities in Phase 07 utilize built-in Python standard libraries (`asyncio`, `struct`, `zlib`, `json`, `os`, `re`), existing system utilities (`pactl`), and existing frontend libraries (`@decky/ui`, `@decky/api`, `react-icons`). Zero new external packages are introduced.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| None (Zero new packages) | N/A | N/A | N/A | N/A | [OK] | Approved |

---

## Architecture Patterns

### System Architecture Diagram

```
+----------------------------------------------------------------------------------------------------+
|                                    SteamOS GamepadUI (CEF Frontend)                                |
|                                                                                                    |
|  +--------------------------------------------------+   +---------------------------------------+  |
|  | window.SteamClient.Apps                          |   | Quick Access Menu (src/index.tsx)     |  |
|  | RegisterForAppLifetimeNotifications(ev)          |   | - 1-Click "Bind Current Music" button |  |
|  | -> ev.unAppID, ev.bRunning                       |   | - Running Game Soundtrack status      |  |
|  +-------------------------+------------------------+   +-------------------+-------------------+  |
|                            | (RPC)                                          | (RPC)                |
|                            v                                                v                      |
|  +----------------------------------------------------------------------------------------------+  |
|  | DeckifyExpandedModal.tsx -> SoundtracksTab.tsx                                               |  |
|  | - Installed Games List (Running first, Non-Steam badges, search filter)                       |  |
|  | - Game Profile Editor (Assigned playlists, Mode: shuffle/random/rotation, Volume & Ducking)   |  |
|  | - Tabbed Playlist Picker Modal (My Playlists, My Albums, Spotify Search)                     |  |
|  +-----------------------------------------+----------------------------------------------------+  |
+--------------------------------------------|-------------------------------------------------------+
                                             | RPC (handle_game_lifecycle, get_installed_games, etc.)
                                             v
+----------------------------------------------------------------------------------------------------+
|                                   Python Backend Daemon (main.py)                                  |
|                                                                                                    |
|  +----------------------------------------------------------------------------------------------+  |
|  | py_modules/soundtrack.py (SoundtrackManager)                                                 |  |
|  |                                                                                              |  |
|  |  [Game Launch Event] ---> Launch Debounce (3.5s) -+---> [Cancelled if exited during debounce] |  |
|  |                                                    |                                         |  |
|  |                                                    v                                         |  |
|  |                                      Capture Pre-Game Snapshot                               |  |
|  |                                      { is_playing, context_uri, track_uri, position_ms }     |  |
|  |                                                    |                                         |  |
|  |                                                    v                                         |  |
|  |                                      Lookup Game Audio Profile                               |  |
|  |                                      - Mode: Shuffle Pool / Random Picker / Sequential       |  |
|  |                                      - Resume: position_ms vs fresh shuffle                  |  |
|  |                                      - Overrides: Custom Volume / Ducking override           |  |
|  |                                                    |                                         |  |
|  |                                                    v                                         |  |
|  |                                      Execute Playback via rpc_playback.play_tracks           |  |
|  |                                                                                              |  |
|  |  [Game Exit Event]   ---> Exit Debounce (3.0s) ---+---> [Cancelled if re-entered / flapped]  |  |
|  |                                                    |                                         |  |
|  |                                                    v                                         |  |
|  |                                      Save Current Track & position_ms to Profile             |  |
|  |                                      Check _user_paused_in_game (D-14)                       |  |
|  |                                                    |                                         |  |
|  |                                                    v                                         |  |
|  |                                      Restore Pre-Game Snapshot (or Keep Paused)              |  |
|  +-----------------------------------+----------------------------------------------------------+  |
|                                      |                                                             |
|                                      v                                                             v
|  +---------------------------------------+  +---------------------------------------------------+  |
|  | py_modules/vdf_parser.py              |  | py_modules/volume.py (VolumeFader)                |  |
|  | - Parse binary shortcuts.vdf (CRC32)  |  | - Per-game ducking override (enabled/disabled)    |  |
|  | - Parse libraryfolders & appmanifest  |  | - Custom duck attenuation level                   |  |
|  | - In-memory TTL cache (30s)           |  | - pactl set-sink-input-volume fade                |  |
|  +---------------------------------------+  +---------------------------------------------------+  |
+----------------------------------------------------------------------------------------------------+
```

### Recommended Project Structure
```
py_modules/
├── soundtrack.py             # NEW: SoundtrackManager, snapshot/restore engine, session tracking
├── vdf_parser.py             # NEW: Pure stdlib binary shortcuts.vdf & text ACF/VDF parser
├── common.py                 # DEFAULT_SETTINGS additions (game_soundtracks_enabled, etc.)
├── volume.py                 # Per-game custom ducking volume overrides in VolumeFader
└── rpc_playback.py           # Extended play_tracks with position_ms support

src/
├── components/
│   ├── tabs/
│   │   ├── SoundtracksTab.tsx       # NEW: Dedicated Game-Specific Soundtracks management tab
│   │   └── SoundtracksTab.test.tsx  # NEW: Comprehensive Vitest tests for Soundtracks UI
│   ├── common/
│   │   ├── PlaylistPickerModal.tsx  # NEW: Tabbed picker (My Playlists, My Albums, Search)
│   │   └── Sidebar.tsx              # Add "Soundtracks" navigation button with FaGamepad
│   └── DeckifyExpandedModal.tsx     # Add "soundtracks" view mode routing
├── index.tsx                        # AppLifetime synchronization & QAM 1-click binding button
└── types.ts                         # GameAudioProfile, GameInfo, ViewMode additions
```

### Pattern 1: Non-Blocking Debounced Lifecycle State Machine
**What:** Separate `asyncio.Task` handles for launch debounce (3.5s) and exit debounce (3.0s).  
**When to use:** When receiving events from `RegisterForAppLifetimeNotifications` that can flap during Proton / child launcher process tree handoffs.  
**Example:**
```python
class SoundtrackManager:
    def __init__(self, plugin):
        self.plugin = plugin
        self._launch_task: asyncio.Task | None = None
        self._exit_task: asyncio.Task | None = None
        self._pre_game_snapshot: dict | None = None
        self._active_app_id: int | None = None
        self._user_paused_in_game: bool = False

    async def on_game_launched(self, app_id: int):
        # Cancel any pending exit debounce
        if self._exit_task and not self._exit_task.done():
            self._exit_task.cancel()
            self._exit_task = None

        if self._active_app_id == app_id:
            return  # Already handling this game

        self._active_app_id = app_id
        if self._launch_task and not self._launch_task.done():
            self._launch_task.cancel()

        self._launch_task = asyncio.create_task(self._execute_launch(app_id))

    async def _execute_launch(self, app_id: int):
        try:
            # 3.5s launch debounce window (D-09)
            await asyncio.sleep(float(self.plugin._settings.get("launch_debounce_seconds", 3.5)))
            await self._start_game_soundtrack(app_id)
        except asyncio.CancelledError:
            pass
```

### Pattern 2: Pure Python Binary VDF Unpacking with IEEE CRC32
**What:** Extracts non-Steam shortcuts directly from Valve binary KeyValues format and calculates unsigned 32-bit AppIDs.  
**Example:**
```python
import struct
import zlib

def parse_binary_vdf(data: bytes) -> dict:
    offset = 0
    length = len(data)

    def read_str():
        nonlocal offset
        end = data.find(b"\x00", offset)
        if end == -1: return ""
        s = data[offset:end].decode("utf-8", errors="replace")
        offset = end + 1
        return s

    def parse_dict():
        nonlocal offset
        res = {}
        while offset < length:
            t = data[offset]
            offset += 1
            if t == 8: break  # End of dict
            k = read_str()
            if t == 0: res[k] = parse_dict()
            elif t == 1: res[k] = read_str()
            elif t == 2:
                res[k] = struct.unpack_from("<i", data, offset)[0]
                offset += 4
            elif t == 3:
                res[k] = struct.unpack_from("<f", data, offset)[0]
                offset += 4
            elif t == 7:
                res[k] = struct.unpack_from("<q", data, offset)[0]
                offset += 8
        return res

    if data and data[0] == 0:
        offset += 1
        name = read_str()
        return {name: parse_dict()}
    return parse_dict()

def compute_non_steam_appid(exe: str, app_name: str, raw_appid: int | None = None) -> int:
    """Return normalized unsigned 32-bit AppID matching Steam's unAppID."""
    if raw_appid and raw_appid != 0:
        return struct.unpack("<I", struct.pack("<i", raw_appid))[0]
    combined = f"{exe}{app_name}".encode("utf-8")
    crc = zlib.crc32(combined) & 0xFFFFFFFF
    return (crc | 0x80000000) & 0xFFFFFFFF
```

### Anti-Patterns to Avoid
- **Triggering Spotify Web API calls immediately on `bRunning: true`:** Proton games execute bootstrap scripts, shader pre-caching, and launcher windows. Launching music instantly causes audio stuttering, skips, and race conditions with child processes. Always respect the 3.5s debounce.
- **Forgetting `position_ms` in `play_tracks`:** Calling `me/player/play` and immediately followed by `me/player/seek` results in audible track jumping (starts from 0s for 200ms before seeking). Pass `position_ms` directly into the `me/player/play` request body.
- **Blasting music on exit if user paused in-game:** If the user pressed Pause in QAM or via chord because they were watching a dialogue cutscene or story moment, resuming music automatically upon game exit is jarring. Deckify must respect manual in-game pause state (D-14).
- **Hardcoding Steam paths without user directory globbing:** Steam Deck stores non-Steam shortcuts in `userdata/<account_id>/config/shortcuts.vdf`. Because `<account_id>` is dynamic, scanning must use globbing (`userdata/*/config/shortcuts.vdf`).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Audio ducking volume transitions | Custom volume polling loop in soundtrack manager | Existing `VolumeFader` in `py_modules/volume.py` | `VolumeFader` handles PipeWire sink-input resolution, PID matching, cosine easing, and cancellation safely. |
| External image loading in CEF | Direct `<img>` with `https://i.scdn.co` or Steam CDN URLs | `fetchImageAsBase64` / `py_modules/images.py` | Steam GamepadUI Content Security Policy strictly blocks direct external image URLs. |
| In-game controller navigation | Custom keydown focus state management | `@decky/ui` `Focusable`, `flow-children`, and `focusHalo` | Native GamepadUI spatial navigation handles D-pad wraps, scroll anchoring, and focus restoration automatically. |
| Non-Steam CRC calculations | Third-party C extensions or native binaries | Python stdlib `zlib.crc32` and `struct.unpack` | 100% portable, standard, sub-millisecond, and zero compilation requirements. |

---

## Common Pitfalls

### Pitfall 1: False Exits from Proton Intermediate Launchers
**What goes wrong:** A game like Cyberpunk, GTA V, or Apex Legends launches an intermediate launcher (REDlauncher, EA App). When the launcher closes and hands off to the main game exe, `RegisterForAppLifetimeNotifications` fires `bRunning: false`. If handled immediately, Deckify halts the soundtrack and restores pre-game music, only to immediately restart the soundtrack 1 second later when the main exe begins.  
**Why it happens:** Steam tracks process lifetimes per OS process group; launcher termination fires a brief lifetime transition.  
**How to avoid:** Enforce a strict 3.0s debounce timer (`gameExitDebounceTimer` in frontend and `_exit_task` in backend) before executing game exit teardown. If another `bRunning: true` arrives within 3.0s, cancel the exit sequence immediately.

### Pitfall 2: Audio Cutoff or Failed Playback on Idle Spotify
**What goes wrong:** Game launches, but Spotify was idle/disconnected. Calling `me/player/play` returns HTTP 404 ("No active device found") and soundtrack fails to start.  
**Why it happens:** Spotify Connect enters low-power sleep when no audio has streamed for several minutes.  
**How to avoid:** Use `auto_transfer_and_play` [VERIFIED: `py_modules/rpc_playback.py:15-39`] before starting playback to wake up the local `librespot` or `spotify_client` daemon on the Deck.

### Pitfall 3: Signed vs. Unsigned 32-bit AppID Mismatch
**What goes wrong:** Python reads `appid` from `shortcuts.vdf` as a signed 32-bit integer (e.g. `-1053428192`), while `SteamClient.Apps` reports `unAppID` as an unsigned 32-bit integer (e.g. `3241539104`). Lookup in `game_audio_profiles` fails because the keys don't match.  
**Why it happens:** Binary VDF type `0x02` is signed 32-bit int, but Steam API uses unsigned integers (`unAppID`).  
**How to avoid:** Always normalize AppIDs with `struct.unpack("<I", struct.pack("<i", raw_id))[0]` and cast to string for dictionary keys.

### Pitfall 4: Concurrent Game Sessions
**What goes wrong:** User plays a game in Desktop mode while running another background task or utility registered with an AppID.  
**Why it happens:** Multiple `bRunning: true` notifications fire.  
**How to avoid:** Track `_active_app_id`. Ignore secondary background tool launches unless the user explicitly focused or switched to another full-screen game.

---

## Code Examples

### Extended `play_tracks` with `position_ms` in `py_modules/rpc_playback.py`
```python
async def play_tracks(
    plugin,
    context_uri: str | None = None,
    offset_uri: str | None = None,
    uris: list | None = None,
    position: int = 0,
    position_ms: int = 0,
) -> dict:
    """Start playback of a context, URI list, or single track with optional position seek."""
    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}

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
        await _exec(_spotify_api_request, "me/player/play", token, "PUT", None, body)
        return {"ok": True}
    except urllib.error.HTTPError as e:
        if e.code == 404:
            transfer_res = await plugin._auto_transfer_and_play(token)
            if transfer_res.get("ok") and body:
                await asyncio.sleep(0.5)
                await _exec(_spotify_api_request, "me/player/play", token, "PUT", None, body)
                return {"ok": True}
            return transfer_res
        return {"ok": False, "error": _parse_spotify_error(e)}
```

### Game Audio Profile Data Model (`py_modules/common.py`)
```python
# Extended DEFAULT_SETTINGS schema in py_modules/common.py
DEFAULT_SETTINGS = {
    # Existing settings...
    "game_audio_profiles": {},  # Dict[str, GameAudioProfile]
    "game_soundtracks_enabled": True,
    "unbound_games_policy": "keep_playing",  # "keep_playing" | "auto_pause"
    "fallback_soundtrack_enabled": False,
    "fallback_soundtrack_uri": "",
    "fallback_soundtrack_name": "",
    "launch_debounce_seconds": 3.5,
    "exit_debounce_seconds": 3.0,
    "exit_restore_policy": "restore_snapshot",  # "restore_snapshot" | "always_pause" | "keep_playing"
    "respect_manual_pause": True,
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Spotify Web API volume stepping | Local PipeWire `pactl set-sink-input-volume` (Phase 6) | Phase 6 | 0ms network latency, zero HTTP 429 rate limits, smooth cosine fading. |
| Global audio ducking only | Per-game soundtrack binding + custom ducking overrides | Phase 7 | Tailored soundtracks and custom volume levels per game. |
| External `vdf` PyPI dependency | Pure stdlib binary VDF & ACF parser | Phase 7 | 100% reliable execution in read-only SteamOS Decky sandbox. |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | SteamOS stores non-Steam shortcuts at `~/.local/share/Steam/userdata/*/config/shortcuts.vdf` or `~/.steam/steam/userdata/*/config/shortcuts.vdf`. | Non-Steam Shortcut Detection | Low — verified in standard SteamOS 3.5 installations; globbing across potential candidate paths resolves both locations. |
| A2 | Spotify Web API `PUT /v1/me/player/play` accepts `position_ms` alongside `context_uri` and `offset`. | Code Examples | Low — standard Spotify Web API endpoint specification; fallback seek via `seek_playback` is available if API rejects combination. |

---

## Open Questions

1. **Decky Game Options Context Menu:**
   - What we know: Decky Loader has experimental context menu hooks (`RegisterGameContextMenuAction`), but compatibility varies across Decky versions.
   - What's unclear: Whether the installed Decky Loader on the target Deck supports game context actions.
   - Recommendation: Follow locked decision D-04: attempt to register the context menu action with a try/catch, and gracefully fall back to the QAM mini-player button and dedicated Soundtracks tab.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python | Backend daemon & VDF parser | ✓ | 3.14 / 3.11+ | — |
| Node.js / pnpm | Frontend Rollup compilation & Vitest | ✓ | Node v20+ / pnpm 9+ | — |
| PipeWire / `pactl` | Audio ducking fader | ✓ | SteamOS 3.5+ | Graceful no-op in headless test suite |
| Steam GamepadUI CEF | `SteamClient.Apps` | ✓ | SteamOS 3.5+ | Mock events in Vitest |

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Backend Framework | Python standard library `unittest` |
| Frontend Framework | Vitest 5.1.0 (`vitest run`) |
| Backend test command | `python -m unittest tests/test_soundtrack.py tests/test_vdf_parser.py -v` |
| Frontend test command | `pnpm test` |
| Full suite run command | `python -m unittest discover -s tests -p "test_*.py" && pnpm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| **SOUND-01** | Profile creation, multi-playlist modes, per-game volume & ducking overrides | Unit / Integration | `python -m unittest tests/test_soundtrack.py -k Profile` | ❌ Wave 1 |
| **SOUND-02** | 3.5s launch debounce, Connect device wake-up, and soundtrack trigger | Unit / Integration | `python -m unittest tests/test_soundtrack.py -k Launch` | ❌ Wave 1 |
| **SOUND-03** | Snapshot capture, 3.0s exit debounce, session seek saving, manual pause handling | Unit / Integration | `python -m unittest tests/test_soundtrack.py -k Restore` | ❌ Wave 1 |
| **SOUND-01 (UI)** | Soundtracks tab rendering, playlist picker modal, and QAM 1-click binding | Unit / Component | `pnpm test src/components/tabs/SoundtracksTab.test.tsx` | ❌ Wave 2 |

### Wave 0 Gaps
- [ ] `tests/test_vdf_parser.py` — unit tests for binary VDF unpacking and CRC32 AppID calculation.
- [ ] `tests/test_soundtrack.py` — unit tests for `SoundtrackManager`, snapshot/restore engine, and debouncing.
- [ ] `src/components/tabs/SoundtracksTab.test.tsx` — component tests for the Soundtracks UI and playlist picker.

---

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | Yes | Validate all `app_id` values as unsigned integers; sanitize and clamp custom volume percentages (0–100) and debounce intervals. |
| V6 Cryptography | No | Purely local CRC32 checksums for Steam shortcut identification (not used for cryptographic signatures). |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed `shortcuts.vdf` or path traversal | Tampering | Pure stdlib parser enforces length bounds and ignores unknown types without executing shell commands or eval. |
| Incompatible subshell environment | Denial of Service | `os.environ.pop("LD_LIBRARY_PATH", None)` is strictly enforced before any subprocess call. |

---

## Sources

### Primary (HIGH confidence)
- In-repo source: `src/index.tsx:771-793` (`SteamClient.Apps.RegisterForAppLifetimeNotifications`)
- In-repo source: `py_modules/common.py:83` (`game_audio_profiles` settings schema)
- In-repo source: `py_modules/volume.py:158-359` (`VolumeFader` cosine easing & ducking)
- In-repo source: `py_modules/rpc_playback.py:320-367` (`play_tracks` implementation)
- Valve KeyValues Binary Specification & Community Documentation (IEEE CRC32 shortcut AppID normalization)

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — verified via codebase inspection and Python stdlib capabilities.
- Architecture: HIGH — patterns directly extend Phase 6's verified lifecycle and fader patterns.
- Pitfalls: HIGH — covers all edge cases identified in SteamOS runtime testing and user discussion.

**Research date:** 2026-11-12  
**Valid until:** 2026-12-12
