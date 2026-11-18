# Phase 18: MPRIS2 D-Bus Bridge - Research

**Researched:** 2026-11-18
**Domain:** SteamOS 3.5+ / Decky Loader Pure-Python MPRIS2 D-Bus Protocol (`org.mpris.MediaPlayer2.deckify`) & BlueZ `mpris-proxy` Supervision
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01 (Full Player Interface):** Expose the full `org.mpris.MediaPlayer2.Player` interface over D-Bus:
  - **Methods:** `Play`, `Pause`, `PlayPause`, `Stop`, `Next`, `Previous`, `Seek(Offset)` (microseconds relative), `SetPosition(TrackId, Position)` (microseconds absolute), `OpenUri(Uri)`.
  - **Properties:** `PlaybackStatus` (`"Playing"` | `"Paused"` | `"Stopped"`), `LoopStatus` (`"None"` | `"Track"` | `"Playlist"`, read/write), `Rate` (`1.0`), `Shuffle` (`bool`, read/write), `Metadata` (`a{sv}`), `Volume` (`double` `0.0..1.0`, read/write), `Position` (`int64` microseconds, read-only, computed on-demand), `MinimumRate` (`1.0`), `MaximumRate` (`1.0`), `CanGoNext` (`true`), `CanGoPrevious` (`true`), `CanPlay` (`true`), `CanPause` (`true`), `CanSeek` (`true`), `CanControl` (`true`).
  - **Signals:** `Seeked(Position)` (emitted on `Seek` / `SetPosition` or `librespot --onevent` `seeked` events).
- **D-02 (Writable Properties Safe Coordination):**
  - Writing `Volume` (`0.0..1.0`) over D-Bus maps to Deckify's `0..100` volume pipeline (`set_volume`) while respecting active `VolumeFader` ducking/sleep-fade states (never clobbering an active ducking fade).
  - Writing `Shuffle` (`bool`) and `LoopStatus` (`"None"` -> `"off"`, `"Track"` -> `"track"`, `"Playlist"` -> `"context"`) routes through Deckify's existing Spotify Web API / playback control methods and updates cached state optimistically.
- **D-03 (Standard Xesam Metadata + Local Cached `file://` Art URL with HTTPS Fallback):**
  - Publish `mpris:trackid` (`/org/mpris/MediaPlayer2/Track/<base62_id>` or `/org/mpris/MediaPlayer2/NoTrack`), `mpris:length` (`duration_ms * 1000` in microseconds, `int64`), `xesam:title` (`str`), `xesam:artist` (`list[str]`), `xesam:album` (`str`), and `mpris:artUrl` (`str`).
  - For `mpris:artUrl`, resolve the local cached file path in `~/.cache/deckify/images/` (`file:///...`) via `ImageService` when available, falling back to the raw `https://i.scdn.co/...` URL if not yet cached locally.
- **D-04 (Event-Driven `PropertiesChanged` Only — Zero 1s Polling Drain):**
  - Emit `org.freedesktop.DBus.Properties.PropertiesChanged` strictly on actual state/metadata/volume/mode transitions (triggered immediately by Phase 17's `LibrespotEventServer` `--onevent` push or Web API poll delta), never on a 1-second position timer.
  - Compute `Position` (`int64` microseconds) dynamically on-demand when queried over D-Bus using the last known `position_ms` + elapsed monotonic time while playing.
- **D-05 (UID 1000 Session D-Bus Execution & Pure-Python / CLI Bridge):**
  - Register `org.mpris.MediaPlayer2.deckify` at `/org/mpris/MediaPlayer2` on the `deck` user session bus (`unix:path=/run/user/1000/bus`, `DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus`) running as UID 1000 (`deck`) so D-Bus `EXTERNAL` authentication succeeds even when Decky Loader runs `main.py` as `root` (UID 0), and without requiring compiled C-extension D-Bus bindings (`LD_LIBRARY_PATH` stripped).
- **D-06 (Auto-Ensure BlueZ `mpris-proxy` in SteamOS GamepadUI):**
  - When `mpris_enabled` is `True`, detect whether BlueZ `mpris-proxy` is active under `deck` (`pgrep -u deck -x mpris-proxy` or `systemctl --user is-active mpris-proxy`). If not running (common in SteamOS GamepadUI / Gamescope mode when Desktop KDE is not loaded) and the `mpris-proxy` binary is present on the system, automatically spawn and supervise `mpris-proxy` under `deck` (UID 1000), terminating the Deckify-managed `mpris-proxy` child cleanly when MPRIS2 is disabled or Deckify unloads.
- **D-07 (Active Target Routing — Local `librespot` + Remote Connect):**
  - Route incoming MPRIS2 commands (`Play`, `Pause`, `PlayPause`, `Stop`, `Next`, `Previous`, `Seek`, `SetPosition`, `Volume`, `Shuffle`, `LoopStatus`) through Deckify's central playback control pipeline so Bluetooth headset media buttons work seamlessly whether audio is playing on local `librespot` or controlling a remote Spotify Connect device.
- **D-08 (`SettingsTab.tsx` `"Bluetooth & Media Controls (MPRIS2)"` Card):**
  - Add a dedicated card in `SettingsTab.tsx` (matching Phase 16 `Docked Audio-Switching` and Phase 17 `Playback Resilience` cards) containing:
    - Enable toggle (`mpris_enabled`, default `True`).
    - Auto-start `mpris-proxy` toggle (`mpris_auto_proxy`, default `True`, shown when `mpris_enabled` is `True`).
    - Live status badge (`Active (Bluetooth Ready)` when bus name is registered and `mpris-proxy` is running, `D-Bus Active (mpris-proxy unavailable)` if `mpris-proxy` binary is missing/stopped, or `Disabled`).

### the agent's Discretion
- Choice of pure-Python D-Bus implementation strategy in `py_modules/mpris.py` (e.g., a lightweight pure-Python `AF_UNIX` D-Bus wire-protocol / `gdbus`/`busctl`/helper script under UID 1000 or vendored pure-Python `dbus-next` without C extensions) so long as it works under UID 0 (`main.py`) -> UID 1000 (`deck` session bus) and passes unit tests on Windows/Linux without external compiled packages.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

## Project Constraints (from GEMINI.md)

- **Steam CEF Content Security Policy:** Steam GamepadUI blocks direct external image URLs (`https://i.scdn.co/`), requiring internal proxying/base64 encoding (`py_modules/images.py`).
- **SteamOS GamepadUI Navigation:** Controller focus relies on spatial navigation (`flow-children`, `@decky/ui`); focus traps or navigation loss degrade user experience. Containers with horizontal buttons MUST use `flow-children="horizontal"`.
- **Steam Deck Environment:** Runs in the `deck` user space (UID 1000) under SteamOS 3.5+, while Decky Loader (`plugin_loader`) executes `main.py` as `root` (UID 0).
- **Process Environment Isolation:** `os.environ.pop("LD_LIBRARY_PATH", None)` is mandatory before launching subprocesses (`py_modules/common.py:38`, `main.py:27`) so Decky's bundled PyInstaller libraries do not break system binaries.
- **Rate Limiting:** Avoid continuous polling of heavy Spotify Web API endpoints; restrict polling to current playback state and use circuit-breaker patterns on HTTP 429.
- **Decky Loader Plugin Sandbox:** `main.py` runs with `__name__ == "_"`, so never index `sys.modules[__name__]` directly (`sys.modules.get(__name__)`).
- **PipeWire UI Stream Isolation:** Any PipeWire/PulseAudio sink-input manipulation must explicitly ignore `steamwebhelper` and `Chromium` streams.
- **Remote Directory Cleanliness:** Never place duplicate Python module trees under `bin/` (e.g., `bin/py_modules`), as `bin/` in `sys.path` shadows primary plugin modules.
- **Zero C-Extension / Runtime Dependencies:** `REQUIREMENTS.md:50` explicitly marks C-extension D-Bus bindings (`dbus-python`, `PyGObject`) Out of Scope; no `pip install` or `pnpm add` at runtime.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MPRIS-01 | Deckify registers `org.mpris.MediaPlayer2.deckify` on the `deck` (UID 1000) user D-Bus so Bluetooth headsets/earbuds (via BlueZ `mpris-proxy`) can control Play/Pause/Next/Previous and read current track metadata locally. | `py_modules/mpris.py` (`MprisBridge` + pure-Python UID 1000 D-Bus wire-protocol worker), full `org.mpris.MediaPlayer2` + `org.mpris.MediaPlayer2.Player` + `org.freedesktop.DBus.Properties` + `org.freedesktop.DBus.Introspectable` handling, event-driven `PropertiesChanged` & `Seeked` emissions wired to `LibrespotEventServer` and `_poll_playback`, `get_cached_image_file_uri()` in `py_modules/images.py`, automatic `mpris-proxy` supervision under UID 1000 (`_build_deck_command`), and the `"Bluetooth & Media Controls (MPRIS2)"` card in `SettingsTab.tsx`. |
</phase_requirements>

## Summary

Phase 18 delivers standard MPRIS2 D-Bus media controls (`org.mpris.MediaPlayer2.deckify` at `/org/mpris/MediaPlayer2`) on the `deck` user session bus (`unix:path=/run/user/1000/bus`) together with automatic BlueZ `mpris-proxy` supervision so Bluetooth headsets, earbuds, and car stereos can control Deckify playback (both local `librespot` and remote Spotify Connect devices) and read live track metadata in SteamOS GamepadUI (`MPRIS-01`).

Research across the codebase and D-Bus / BlueZ specifications highlights three critical architectural constraints that determine the implementation design:
1. **UID 0 (`plugin_loader`) vs UID 1000 (`deck`) D-Bus `EXTERNAL` Authentication:** Decky Loader runs `main.py` as `root` (UID 0). However, the user session `dbus-daemon` / `dbus-broker` listening on `/run/user/1000/bus` authenticates local Unix sockets via `SO_PEERCRED` (`SASL EXTERNAL`) and **rejects UID 0 connections** because the socket peer UID (`0`) does not match the bus owner UID (`1000`) `[VERIFIED: .planning/research/PITFALLS.md:107-126]`. Furthermore, standard CLI tools (`busctl`, `gdbus`, `dbus-send`) can *call* methods or *emit* signals on an existing service, but **cannot export a persistent D-Bus object tree** (`/org/mpris/MediaPlayer2`) that replies to incoming `org.mpris.MediaPlayer2.Player` method calls (`Play`, `Pause`, `Next`, `Seek`) and `org.freedesktop.DBus.Properties.GetAll` queries from `mpris-proxy`.
2. **Self-Contained Pure-Python D-Bus Wire-Protocol Worker Under UID 1000:** Because `deploy.sh` (`deploy.sh:98-102`) deploys only `main.py` and `py_modules/*.py` (and `REQUIREMENTS.md:50` forbids `dbus-python`/`PyGObject`), the cleanest, zero-dependency architecture is to implement a compact, self-contained pure-Python D-Bus wire-protocol endpoint (`MprisDbusWireProtocol` + UID 1000 worker subprocess mode via `python3 -m py_modules.mpris --worker` launched through `_build_deck_command`). When `os.geteuid() == 0` on SteamOS, `MprisBridge` spawns the worker under `runuser -u deck` (UID 1000) using system `/usr/bin/python3` (with `LD_LIBRARY_PATH` stripped) and communicates with `main.py` over stdin/stdout JSON lines. When already running as UID 1000 (or in unit tests with an in-memory/mock transport), the exact same pure-Python D-Bus wire-protocol handler can also run directly in-process in `asyncio`—making every D-Bus message, property, signal, and method call 100% unit-testable on Windows and Linux without external packages.
3. **BlueZ `mpris-proxy` in SteamOS GamepadUI:** In SteamOS Desktop Mode (KDE Plasma), `mpris-proxy` or KDE's media controller bridges Bluetooth AVRCP to MPRIS2, but in SteamOS GamepadUI (Gamescope session), `mpris-proxy` is frequently not running by default `[CITED: wiki.archlinux.org/title/MPRIS]`. Supervising `/usr/bin/mpris-proxy` under `deck` (UID 1000) when `mpris_enabled` and `mpris_auto_proxy` are `True` (and only when an existing `mpris-proxy` is not already running) makes Bluetooth headset media buttons work out-of-the-box without requiring users to drop into Konsole.

**Primary recommendation:** Create `py_modules/mpris.py` with `MprisBridge` (managing the UID 1000 pure-Python D-Bus MPRIS2 service and `mpris-proxy` supervision), add `get_cached_image_file_uri()` to `py_modules/images.py`, wire event-driven state notifications into `main.py` and `py_modules/resilience.py`, and add the `"Bluetooth & Media Controls (MPRIS2)"` card in `src/components/tabs/SettingsTab.tsx`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| D-Bus wire protocol (`SASL EXTERNAL`, `Hello`, `RequestName`, `/org/mpris/MediaPlayer2` dispatch, `PropertiesChanged`, `Seeked`) | OS Subprocess (`py_modules/mpris.py` worker as UID 1000 `deck`) | API / Backend (`MprisBridge` in `main.py`) | Session bus `/run/user/1000/bus` requires `SO_PEERCRED` UID 1000 for `EXTERNAL` auth; worker runs as `deck` and speaks JSON lines with `MprisBridge`. |
| BlueZ AVRCP ↔ MPRIS2 translation (`mpris-proxy` detection & supervision) | API / Backend (`MprisBridge` in `py_modules/mpris.py`) | SteamOS Host (`/usr/bin/mpris-proxy` under UID 1000) | Detects existing `mpris-proxy` via `pgrep`/`systemctl --user` and supervises a child process only if needed and enabled. |
| Playback command routing (`Play`, `Pause`, `PlayPause`, `Stop`, `Next`, `Previous`, `Seek`, `SetPosition`, `OpenUri`, writable `Volume`/`Shuffle`/`LoopStatus`) | API / Backend (`MprisBridge` → `Plugin` / `rpc_playback` / `volume`) | — | Routes through Deckify's existing playback pipeline so both local `librespot` and remote Spotify Connect targets respond identically (D-07) while respecting `VolumeFader` ducking/sleep locks (D-02). |
| Local artwork `file://` URI resolution (`mpris:artUrl`) | API / Backend (`py_modules/images.py`) | — | Inspects `IMAGE_CACHE_DIR` (`{sha256}.bin`) and returns `file:///...` URI when cached on disk, falling back to `https://i.scdn.co/...` (D-03). |
| MPRIS2 settings & live status badge UI | Browser / Client (`src/components/tabs/SettingsTab.tsx`, `src/types.ts`) | — | Renders `"Bluetooth & Media Controls (MPRIS2)"` card with `mpris_enabled` and `mpris_auto_proxy` `ToggleField`s and live status pill (D-08). |

## Standard Stack

### Core
| Library / Binary | Version | Purpose | Why Standard |
|------------------|---------|---------|--------------|
| Python `struct` + `socket` + `asyncio` | Python 3.11+ / 3.14 stdlib | Pure-Python D-Bus binary wire protocol marshalling & `AF_UNIX` transport | Zero external dependencies; works on SteamOS without C extensions and runs unit tests on Windows & Linux `[VERIFIED: main.py:1-17]`. |
| `runuser` (`_build_deck_command`) | SteamOS `util-linux` (`py_modules/common.py:384-404`) | Drops privileges from `root` (UID 0) to `deck` (UID 1000) with `DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus` | Already proven across `equalizer.py`, `dock.py`, and `volume.py` `[VERIFIED: py_modules/common.py:384-404]`. |
| `mpris-proxy` | BlueZ `bluez-utils` (`/usr/bin/mpris-proxy` on SteamOS 3.5+) | Bridges Bluetooth AVRCP media controls to user session MPRIS2 D-Bus | Standard BlueZ utility on Arch/SteamOS `[CITED: wiki.archlinux.org/title/MPRIS]`. |
| `@decky/ui` + `@decky/api` | `4.11.1` / `1.1.3` (`package.json:29,46`) | `ToggleField`, `Focusable`, `callable`, `addEventListener` | Existing Deckify frontend component and RPC stack `[VERIFIED: package.json:28-50]`. |

### Supporting
| Library / Binary | Version | Purpose | When to Use |
|------------------|---------|---------|-------------|
| `pgrep` / `shutil.which` | SteamOS `procps-ng` / Python stdlib | Detect if `mpris-proxy` binary exists and whether an instance is already running under `deck` | Used before spawning a Deckify-managed `mpris-proxy` child (D-06). |
| `react-icons/fa` (`FaBluetooth` / `FaHeadphones`) | `5.5.0` (`package.json:48`) | Header icon for `"Bluetooth & Media Controls (MPRIS2)"` card in `SettingsTab.tsx` | Verified present in installed `react-icons/fa` bundle. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Pure-Python D-Bus wire-protocol worker (`py_modules/mpris.py`) | `dbus-python` or `PyGObject` (`gi.repository.Gio`) | Explicitly forbidden by `REQUIREMENTS.md:50` and D-05: C extensions fail under Decky Loader's PyInstaller environment / stripped `LD_LIBRARY_PATH`. |
| Pure-Python D-Bus wire-protocol worker (`py_modules/mpris.py`) | `busctl` / `gdbus` CLI commands alone | `busctl` and `gdbus` have no subcommand to export a persistent D-Bus service object (`/org/mpris/MediaPlayer2`) that receives and replies to incoming method calls (`Play`, `Pause`, `GetAll`). |
| Compact purpose-built D-Bus marshaller in `py_modules/mpris.py` | Vendoring full `dbus-next` (~45 files) into `py_modules/` | MPRIS2 only needs a single object path (`/org/mpris/MediaPlayer2`) with fixed signatures (`s`, `b`, `d`, `x`, `o`, `as`, `a{sv}`). A purpose-built ~300-line wire-protocol codec in `py_modules/mpris.py` is 10x smaller, has zero multi-directory deploy issues in `deploy.sh`, and is trivial to test on Windows. |

**Installation:** Zero new npm or pip packages required (`package.json` unchanged).

## Package Legitimacy Audit

Not applicable — Phase 18 installs **zero** external npm, PyPI, or crates packages. All functionality is implemented using Python's standard library (`struct`, `socket`, `asyncio`, `json`, `urllib`), existing `@decky/ui` / `@decky/api` / `react-icons` dependencies, and SteamOS host utilities.

## Architecture Patterns

### System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Connected Bluetooth Headset / Earbuds / Car Stereo (AVRCP)                   │
│   ├─ Presses Play / Pause / Next / Previous / Seek                           │
│   └─ Reads Track Title, Artist, Album, Duration, PlaybackStatus              │
└──────────────────────┬───────────────────────────────────▲───────────────────┘
                       │ Bluetooth AVRCP                   │ AVRCP Metadata
                       ▼                                   │
┌──────────────────────────────────────────────────────────────────────────────┐
│ SteamOS User Session (UID 1000 `deck` — /run/user/1000/bus)                  │
│                                                                              │
│  [BlueZ bluetoothd] ◄──► [mpris-proxy (UID 1000, auto-supervised by D-06)]   │
│                                   │                      ▲                   │
│                     D-Bus Method  │                      │ PropertiesChanged │
│                     Calls / Get   ▼                      │ & Seeked Signals  │
│             ┌──────────────────────────────────────────────────┐             │
│             │ py_modules/mpris.py --worker (UID 1000 `deck`)   │             │
│             │ Bus Name: org.mpris.MediaPlayer2.deckify         │             │
│             │ Object:   /org/mpris/MediaPlayer2                │             │
│             └─────────────────────┬──────────────────────▲─────┘             │
└───────────────────────────────────┼──────────────────────┼───────────────────┘
                      JSON-lines    │                      │ JSON-lines
                      (stdout->main)│                      │ (main->stdin)
                                    ▼                      │
┌──────────────────────────────────────────────────────────────────────────────┐
│ Decky Loader Python Backend (main.py + py_modules/mpris.py, UID 0 `root`)    │
│                                                                              │
│  [MprisBridge]                                                               │
│    ├─ Incoming D-Bus Commands (D-01, D-02, D-07):                            │
│    │   ├─ Play/Pause/PlayPause/Stop/Next/Prev ──► plugin.control_playback()  │
│    │   ├─ Seek(offset_us) / SetPosition(id,us) ─► plugin.seek_playback()     │
│    │   ├─ OpenUri(spotify:...) ─────────────────► plugin.play_tracks()       │
│    │   ├─ Set Volume(0.0..1.0) ─────────────────► safe_set_volume() (D-02)   │
│    │   └─ Set Shuffle / LoopStatus ─────────────► set_shuffle / set_repeat   │
│    │                                                                         │
│    ├─ Outgoing Event-Driven State Sync (D-03, D-04):                         │
│    │   ◄── LibrespotEventServer.process_payload() (--onevent <50ms)          │
│    │   ◄── Plugin._poll_playback() (track_meta, shuffle, repeat, volume)     │
│    │   ◄── rpc_playback.* (optimistic state updates)                         │
│    │   ──► Resolves local file:// artUrl via images.get_cached_image_file_uri│
│    │   ──► Pushes diff to UID 1000 worker ──► D-Bus PropertiesChanged        │
│    │                                                                         │
│    └─ Status Reporting (D-08):                                               │
│        ──► get_status()["mpris_status"] & decky.emit("mpris_status", ...)    │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                    │ @decky/api RPC & Events
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ SteamOS GamepadUI Frontend (src/components/tabs/SettingsTab.tsx)             │
│  └─ "Bluetooth & Media Controls (MPRIS2)" Card:                              │
│      ├─ Status Badge: Active (Bluetooth Ready) / D-Bus Active (...) / Disabled│
│      ├─ ToggleField: Enable MPRIS2 Media Controls (`mpris_enabled`)          │
│      └─ ToggleField: Auto-Start BlueZ mpris-proxy (`mpris_auto_proxy`)       │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
Deckify/
├── main.py                              # MODIFIED: instantiate/start/stop MprisBridge,
│                                        # hook state updates, expose get_mpris_status & mpris_status
├── py_modules/
│   ├── __init__.py                      # MODIFIED: export mpris module
│   ├── common.py                        # MODIFIED: add mpris_enabled & mpris_auto_proxy to DEFAULT_SETTINGS
│   ├── images.py                        # MODIFIED: add get_cached_image_file_uri(url) for mpris:artUrl
│   ├── resilience.py                    # MODIFIED: notify MprisBridge on --onevent payload
│   ├── rpc_playback.py                  # MODIFIED: notify MprisBridge on control/seek/shuffle/repeat
│   └── mpris.py                         # NEW: MprisBridge, pure-Python D-Bus wire protocol & UID 1000 worker,
│                                        # and BlueZ mpris-proxy detector/supervisor
├── src/
│   ├── types.ts                         # MODIFIED: add MprisStatusInfo, mpris_enabled, mpris_auto_proxy
│   └── components/tabs/
│       └── SettingsTab.tsx              # MODIFIED: add "Bluetooth & Media Controls (MPRIS2)" card
└── tests/
    └── test_mpris.py                    # NEW: comprehensive unit tests for D-Bus codec, MPRIS2 interfaces,
                                         # VolumeFader guard, file:// artUrl, and mpris-proxy supervision
```

### Pattern 1: Pure-Python D-Bus Wire Protocol + UID 1000 Worker Subprocess (D-01, D-05)
**What:** Implement a self-contained pure-Python D-Bus binary wire-protocol engine in `py_modules/mpris.py` that can run both as a UID 1000 (`deck`) child process (`python3 <path/to/py_modules/mpris.py> --worker`) and in-process over any `asyncio` stream pair (for unit tests).
**Why:**
1. When Decky Loader runs `main.py` as `root` (UID 0), spawning `["python3", mpris_script_path, "--worker"]` via `_build_deck_command` runs the worker as `deck` (UID 1000) with `DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus` and `LD_LIBRARY_PATH` stripped `[VERIFIED: py_modules/common.py:384-404]`.
2. Inside the UID 1000 worker, `os.geteuid()` is `1000`, so connecting an `AF_UNIX` socket to `/run/user/1000/bus` and sending `\x00AUTH EXTERNAL 31303030\r\n` (`"1000".encode().hex()`) passes `dbus-daemon`/`dbus-broker` `SO_PEERCRED` verification immediately `[CITED: dbus.freedesktop.org/doc/dbus-specification.html]`.
3. `deploy.sh` (`deploy.sh:102`) already copies all of `py_modules/` to `/home/deck/homebrew/plugins/Deckify/py_modules/`, so `py_modules/mpris.py` is guaranteed present on the Deck without modifying `deploy.sh`.

**D-Bus Wire Protocol Specification Details (`py_modules/mpris.py`):**
- **SASL Handshake (upon connecting to `/run/user/1000/bus`):**
  1. Send initial NUL byte + `AUTH EXTERNAL <hex_uid>\r\n` (where `hex_uid = str(os.geteuid()).encode("ascii").hex()`, e.g., `"31303030"` for UID 1000).
  2. Read line `\r\n` — verify it starts with `OK `.
  3. Send `BEGIN\r\n` to switch socket to binary D-Bus message framing.
- **Message Framing (Little-Endian `'l'` = `0x6c`):**
  - Fixed 16-byte header (`<BBBBIII`):
    - `endian = ord('l')` (`0x6c`)
    - `msg_type`: `1` = `METHOD_CALL`, `2` = `METHOD_RETURN`, `3` = `ERROR`, `4` = `SIGNAL`
    - `flags`: `0` (or `1` = `NO_REPLY_EXPECTED` for signals)
    - `version = 1`
    - `body_len`: byte length of marshalled body
    - `serial`: monotonically increasing `uint32` (`>= 1`)
    - `fields_len`: byte length of header fields array `a(yv)` (excluding trailing padding to 8-byte boundary)
  - Header fields `a(yv)` — each field is a struct `(yv)` aligned to an 8-byte boundary:
    - `1` (`PATH`, `'o'`), `2` (`INTERFACE`, `'s'`), `3` (`MEMBER`, `'s'`), `4` (`ERROR_NAME`, `'s'`), `5` (`REPLY_SERIAL`, `'u'`), `6` (`DESTINATION`, `'s'`), `7` (`SENDER`, `'s'`), `8` (`SIGNATURE`, `'g'`).
  - After `fields_len`, pad header to an **8-byte boundary** (`(8 - (offset % 8)) % 8` NUL bytes), then append the body bytes.
- **Data Type Alignment & Marshalling (for MPRIS2):**
  - `'y'` (`BYTE`): 1-byte aligned (`<B`)
  - `'b'` (`BOOLEAN`): 4-byte aligned `uint32` (`<I`, `0` or `1`)
  - `'u'` (`UINT32`): 4-byte aligned (`<I`)
  - `'x'` (`INT64`): 8-byte aligned (`<q`) — used for `Position`, `Seek(Offset)`, `SetPosition`, `mpris:length`, `Seeked(Position)`
  - `'d'` (`DOUBLE`): 8-byte aligned (`<d`) — used for `Rate`, `MinimumRate`, `MaximumRate`, `Volume`
  - `'s'` (`STRING`) & `'o'` (`OBJECT_PATH`): 4-byte aligned `uint32` byte length + UTF-8 bytes + `\x00` terminator
  - `'g'` (`SIGNATURE`): 1-byte length + ASCII bytes + `\x00` terminator
  - `'v'` (`VARIANT`): signature `'g'` followed immediately by value aligned to its natural boundary (relative to message start)
  - `'as'` (Array of Strings): 4-byte aligned `uint32` byte length of elements + each `'s'`
  - `'a{sv}'` (Dict of String → Variant): 4-byte aligned `uint32` byte length; **note:** because dict-entry `{sv}` has 8-byte alignment, if the 4-byte length prefix ends on a `4 mod 8` offset, up to 4 padding bytes precede the first `{sv}` entry (**even when the array is empty (`byte_len == 0`)**, D-Bus requires aligning to the element boundary of 8 bytes after the 4-byte array length!). Inside each `{sv}` (aligned to 8 bytes): marshall `'s'` key, then `'v'` value.
- **Bus Registration Sequence on Startup:**
  1. Call `org.freedesktop.DBus.Hello` (`dest="org.freedesktop.DBus"`, `path="/org/freedesktop/DBus"`, `iface="org.freedesktop.DBus"`, `member="Hello"`, body `""`) → wait for `METHOD_RETURN` serial `1`.
  2. Call `org.freedesktop.DBus.RequestName` (`signature="su"`, args `("org.mpris.MediaPlayer2.deckify", 0x4)` where `0x4 = DBUS_NAME_FLAG_DO_NOT_QUEUE` or `0x7 = ALLOW_REPLACEMENT | REPLACE_EXISTING | DO_NOT_QUEUE`) → verify return code in `(1, 4)` (`PRIMARY_OWNER` or `ALREADY_OWNER`).
- **Handled Interfaces on `/org/mpris/MediaPlayer2`:**
  1. `org.freedesktop.DBus.Peer`:
     - `Ping()` → empty `METHOD_RETURN`
     - `GetMachineId()` → `METHOD_RETURN` with `/etc/machine-id` string
  2. `org.freedesktop.DBus.Introspectable`:
     - `Introspect()` → `METHOD_RETURN` with complete XML describing `org.mpris.MediaPlayer2` and `org.mpris.MediaPlayer2.Player`.
  3. `org.freedesktop.DBus.Properties`:
     - `Get(interface_name, property_name)` → returns `'v'` (`Position` computed dynamically using `base_position_us + int((time.monotonic() - anchor_mono) * 1_000_000)` when `PlaybackStatus == "Playing"`).
     - `GetAll(interface_name)` → returns `'a{sv}'` for `org.mpris.MediaPlayer2` or `org.mpris.MediaPlayer2.Player` (if `interface_name == ""`, return player properties).
     - `Set(interface_name, property_name, value)` → for writable properties (`Volume`, `Shuffle`, `LoopStatus`, `Fullscreen`), forwards command to parent `MprisBridge` and replies `METHOD_RETURN`.
  4. `org.mpris.MediaPlayer2` (Root Interface):
     - Methods: `Raise()`, `Quit()` (no-ops returning `METHOD_RETURN`, since `CanRaise=False`, `CanQuit=False`).
     - Properties: `CanQuit=False`, `Fullscreen=False`, `CanSetFullscreen=False`, `CanRaise=False`, `HasTrackList=False`, `Identity="Deckify"`, `DesktopEntry="deckify"`, `SupportedUriSchemes=["spotify"]`, `SupportedMimeTypes=["x-scheme-handler/spotify"]`.
  5. `org.mpris.MediaPlayer2.Player` (D-01):
     - Methods: `Next()`, `Previous()`, `Pause()`, `PlayPause()`, `Stop()`, `Play()`, `Seek(x)`, `SetPosition(o, x)`, `OpenUri(s)`.
     - Properties: `PlaybackStatus`, `LoopStatus`, `Rate=1.0`, `Shuffle`, `Metadata`, `Volume`, `Position`, `MinimumRate=1.0`, `MaximumRate=1.0`, `CanGoNext=True`, `CanGoPrevious=True`, `CanPlay=True`, `CanPause=True`, `CanSeek=True`, `CanControl=True`.
     - Signal: `Seeked(x)` on `/org/mpris/MediaPlayer2`, interface `org.mpris.MediaPlayer2.Player`, signature `"x"`.

### Pattern 2: Local Cached `file://` Artwork Resolution with HTTPS Fallback (D-03)
**What:** `py_modules/images.py` currently caches downloaded album art in `IMAGE_CACHE_DIR = os.path.join(CACHE_DIR, "images")` (`py_modules/images.py:7`) keyed by `url_hash = hashlib.sha256(url.encode("utf-8")).hexdigest()` (`py_modules/images.py:82-84`) as `{url_hash}.bin` and `{url_hash}.meta` `[VERIFIED: py_modules/images.py:7,79-85]`.
**Note on cache path & hash:** `CONTEXT.md` mentions `~/.cache/deckify/images/` (from `GEMINI.md` overview) and MD5, whereas the actual implementation in `py_modules/images.py:7,82-84` uses `IMAGE_CACHE_DIR = os.path.join(CACHE_DIR, "images")` and `hashlib.sha256(url.encode("utf-8")).hexdigest()`.
**How to implement `get_cached_image_file_uri(url)` in `py_modules/images.py`:**
- Check if `url` is already cached in `IMAGE_CACHE_DIR` (`{sha256}.bin` exists and is non-empty), or also check `~/.cache/deckify/images/` if present.
- Convert the absolute local path to a standard `file://` URI via ` pathlib.Path(cache_path).resolve().as_uri()` (or `urllib.parse.quote` with `file://`).
- If the image is not yet in the disk cache:
  1. Immediately return the raw `https://i.scdn.co/...` URL as fallback so `PropertiesChanged` is never blocked by network I/O (D-03, D-04).
  2. Optionally trigger a background ` _exec(_fetch_spotify_image, url)` cache warm-up so that once cached, `mpris:artUrl` resolves to `file:///...`.

### Pattern 3: Writable Properties & `VolumeFader` Safe Coordination (D-02, D-07)
**What:** When a D-Bus client (e.g., KDE Connect, SteamOS media applet, or AVRCP absolute volume) writes `Volume` (`double` `0.0..1.0`), `Shuffle` (`bool`), or `LoopStatus` (`"None"` | `"Track"` | `"Playlist"`):
- **`Volume` (`0.0..1.0`):**
  1. Clamp incoming `float(val)` to `0.0..1.0` and convert to `target_pct = int(round(clamped * 100))` (`0..100`).
  2. Check `plugin._volume_fader`:
     - `VolumeFader` (`py_modules/volume.py:208-326`) attenuates the **local PipeWire sink-input** (`pactl set-sink-input-volume`) during game/voice ducking (`fader.is_ducked`) or sleep fade (`fader._sleep_locked`), while `plugin.set_volume(target_pct)` (`py_modules/volume.py:26-45`) sets the **base Spotify playback volume** (`_poll_volume`) `[VERIFIED: py_modules/volume.py:26-45,220-326]`.
     - If `fader._sleep_locked` is `True` (a sleep timer fade-to-zero is actively running), **ignore or defer** volume raises so an accidental headset volume bump does not clobber the sleep fade (D-02).
     - If `fader.is_ducked` is `True` (game or voice ducking active): update `plugin._poll_volume = target_pct` and call `await plugin.set_volume(target_pct)`, and if `ducking_mode == "fixed"`, recalculate `fader._compute_target_sink_volume()` without canceling `fader._duck_reasons`! Never call `boost_pa_volume()` or reset `_current_sink_volume` to `150%` while ducked.
- **`Shuffle` (`bool`):**
  - Optimistically set `plugin._shuffle_state = bool(val)` and invoke `await plugin.set_shuffle(bool(val))` (`py_modules/rpc_playback.py:104-127`).
- **`LoopStatus` (`str`):**
  - Map `"None" -> "off"`, `"Track" -> "track"`, `"Playlist" -> "context"`. (Reverse map for D-Bus property reads: `"off" -> "None"`, `"track" -> "Track"`, `"context" -> "Playlist"`).
  - Optimistically set `plugin._repeat_state = mapped` and invoke `await plugin.set_repeat(mapped)` (`py_modules/rpc_playback.py:130-154`).
- **Active Target Routing (D-07):**
  - `Play` → `await plugin.control_playback("play")`
  - `Pause` → `await plugin.control_playback("pause")`
  - `PlayPause` → `await plugin.control_playback("play_pause")`
  - `Stop` → `await plugin.control_playback("pause")` (Spotify Web API has no distinct Stop endpoint; pause + update state)
  - `Next` → `await plugin.control_playback("next")`
  - `Previous` → `await plugin.control_playback("previous")`
  - `Seek(offset_us)` → compute `new_pos_ms = max(0, current_pos_ms + int(offset_us // 1000))`; if `duration_ms > 0` and `new_pos_ms > duration_ms`, call `Next()`, else call `await plugin.seek_playback(new_pos_ms)` and emit `Seeked(new_pos_ms * 1000)`.
  - `SetPosition(track_id_path, pos_us)` → verify `track_id_path` matches current `/org/mpris/MediaPlayer2/Track/<id>`, verify `0 <= pos_us <= duration_us`, call `await plugin.seek_playback(int(pos_us // 1000))` and emit `Seeked(pos_us)`.
  - `OpenUri(uri)` → if `uri` starts with `spotify:` or `https://open.spotify.com/`, normalize and route to `await plugin.play_tracks(context_uri=...)` or `await plugin.play_tracks(uris=[uri])`.

### Pattern 4: Event-Driven `PropertiesChanged` Diffing — Zero 1s Timer (D-04)
**What:** `MprisBridge.sync_from_plugin()` builds a canonical snapshot of `(PlaybackStatus, LoopStatus, Shuffle, Volume, Metadata)`.
- It compares the new snapshot against `self._last_emitted_snapshot`.
- **Only keys whose values actually changed** are included in the `changed_properties` dict sent to the UID 1000 worker for `org.freedesktop.DBus.Properties.PropertiesChanged("org.mpris.MediaPlayer2.Player", changed_props, [])`.
- **Important:** When `_poll_playback()` runs every 3s or 20s (`main.py:1611-1620`), `main.py` re-emits `librespot_event` with `"event": "playing"` and the latest `position_ms` so the React frontend re-anchors its clock `[VERIFIED: main.py:1611-1620]`. Because `Position` is **not** part of `PropertiesChanged` (per MPRIS2 spec and D-04), `MprisBridge` updates its internal monotonic position anchor `(self._pos_ms, self._pos_anchor_mono)` silently on routine `playing` polls and **does NOT emit `PropertiesChanged`** unless `PlaybackStatus`, `Metadata` (`track_id`, `title`, `artist`, `album`, `artUrl`, `length`), `Volume`, `Shuffle`, or `LoopStatus` actually changed!
- On explicit `seeked` events (from `LibrespotEventServer` or `seek_playback`), `MprisBridge` updates the position anchor and emits the `org.mpris.MediaPlayer2.Player.Seeked(position_us)` signal.

### Pattern 5: BlueZ `mpris-proxy` Detection & Supervision (D-06, D-08)
**What:** In SteamOS GamepadUI (Gamescope mode), `mpris-proxy` is often not running unless started by the user or a plugin.
**Lifecycle in `MprisBridge`:**
1. **Binary discovery:** Check `shutil.which("mpris-proxy")` or `/usr/bin/mpris-proxy` / `/bin/mpris-proxy`.
2. **External process detection:** Run `_build_deck_command(["pgrep", "-u", DECK_USER, "-x", "mpris-proxy"])` (or fallback `systemctl --user is-active mpris-proxy`).
   - If `pgrep` returns `0` (already running externally, e.g., in Desktop Mode or via user systemd service), record `proxy_running = True`, `proxy_managed = False`, and **do not spawn a duplicate instance**.
3. **Managed supervision:** If `mpris_enabled` is `True`, `mpris_auto_proxy` is `True`, `mpris-proxy` is not running, and the binary exists:
   - Spawn `cmd, env = _build_deck_command([mpris_proxy_bin])` (with `LD_LIBRARY_PATH` popped) via `subprocess.Popen(cmd, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)`.
   - Record `self._proxy_proc = proc`, `proxy_running = True`, `proxy_managed = True`.
4. **Clean teardown:** When `mpris_enabled` or `mpris_auto_proxy` is toggled off, or inside `MprisBridge.stop()` / `Plugin._unload()`:
   - Only terminate `self._proxy_proc` if Deckify spawned it (`self._proxy_proc is not None`), never killing a user's external `mpris-proxy` service.

### Anti-Patterns to Avoid
- **Emitting `PropertiesChanged` on every `_poll_playback` tick while playing:** `_poll_playback` runs every 3s–20s. If `MprisBridge` emits `PropertiesChanged` when nothing changed except `progress_ms`, it violates D-04 and wakes `mpris-proxy` / BlueZ unnecessarily. Always diff `(PlaybackStatus, LoopStatus, Shuffle, Volume, Metadata)` before emitting.
- **Formatting `mpris:trackid` with invalid D-Bus object path characters:** D-Bus object paths (`'o'`) may only contain `[A-Za-z0-9_]` in each path element. Spotify Base62 IDs (`0-9a-zA-Z`) are strictly alphanumeric, so `/org/mpris/MediaPlayer2/Track/{sanitized_id}` is valid as long as any non-alphanumeric characters (e.g., `:`, `-`, `.`) are stripped or replaced with `_`. When no track is loaded, use `/org/mpris/MediaPlayer2/NoTrack` (D-03).
- **Passing `xesam:artist` as a single string `'s'` instead of `'as'` (list of strings):** The MPRIS2 / Xesam specification requires `xesam:artist` to have signature `as` (`list[str]`). Passing a plain `str` causes `mpris-proxy` and `playerctl` to ignore the artist field `[CITED: specifications.freedesktop.org/mpris-spec/latest]`. Split Deckify's comma-separated `meta["artist"]` (`[a.strip() for a in artist.split(",") if a.strip()]`) or preserve the artist list.
- **Connecting to `/run/user/1000/bus` directly from `main.py` as UID 0:** Always run the D-Bus socket connection under `DECK_USER` (UID 1000) via `_build_deck_command` when `os.geteuid() == 0`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Dropping privileges from UID 0 to UID 1000 (`deck`) with session env vars | Custom `su -c` string concatenation | `py_modules.common._build_deck_command(cmd)` (`py_modules/common.py:384-404`) | Already sets `XDG_RUNTIME_DIR=/run/user/1000`, `DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus`, `PULSE_SERVER`, and `HOME`, and uses `runuser -u deck -- env ...` when `os.geteuid() == 0`. |
| Base16 → Base62 Spotify Track ID normalization | Duplicate hex converter | `py_modules.resilience.normalize_spotify_id(raw_id)` (`py_modules/resilience.py:68-86`) | Already tested and handles `spotify:track:`, `spotify:episode:`, 32-char hex, and 22-char Base62 IDs idempotently. |
| Playback command execution & 404 device wake | Direct `_spotify_api_request` calls in `mpris.py` | `plugin.control_playback`, `plugin.seek_playback`, `plugin.set_volume`, `plugin.set_shuffle`, `plugin.set_repeat`, `plugin.play_tracks` (`main.py:798-904,1094-1102`) | Automatically records manual pauses in `SoundtrackManager`, handles 404 auto-transfer, and works for both local `librespot` and remote Spotify Connect devices (D-07). |
| Image disk cache hashing | Separate MPRIS artwork downloader | `py_modules.images.IMAGE_CACHE_DIR` & `hashlib.sha256` (`py_modules/images.py:7,79-85`) | Reuses the exact disk cache populated by the UI and `_fetch_spotify_image`. |

## Common Pitfalls

### Pitfall 1: D-Bus Empty Dict / Array 8-Byte Alignment Padding (`a{sv}`)
**What goes wrong:** When marshalling an empty `a{sv}` dictionary (such as `changed_properties = {}` or an empty `Metadata = {}`), writing only the 4-byte length `0x00000000` without aligning to the 8-byte dict-entry `{sv}` boundary causes `dbus-daemon` to disconnect the client immediately with a corrupt message error.
**Why it happens:** In the D-Bus wire protocol specification, an array `'a'` of 8-byte aligned elements (`'('` or `'{'`) requires 8-byte alignment **immediately after the 4-byte array length integer**, even if the array length is `0` `[CITED: dbus.freedesktop.org/doc/dbus-specification.html]`.
**How to avoid:** In the D-Bus serializer, whenever marshalling `a{sv}` or `a(yv)`:
1. Align to 4 bytes and write the 4-byte `uint32` array byte length.
2. **Immediately align the buffer to an 8-byte boundary** before writing the array elements (even when there are 0 elements). Note that `array_byte_len` is measured starting *after* that 8-byte alignment padding!

### Pitfall 2: `mpris:length` and `Position` Units (Microseconds vs Milliseconds)
**What goes wrong:** Track duration shows as `0:00` on car stereos / KDE Plasma, or `Seek` jumps 1000x too little.
**Why it happens:** Spotify Web API and `librespot --onevent` use **milliseconds** (`position_ms`, `duration_ms`), whereas MPRIS2 uses **microseconds** (`int64`, `'x'`, `1 ms = 1000 us`) for `mpris:length`, `Position`, `Seek(Offset)`, `SetPosition(TrackId, Position)`, and `Seeked(Position)` (D-01, D-03).
**How to avoid:** Convert at the boundary in `py_modules/mpris.py`: `length_us = int(duration_ms) * 1000`, `position_us = int(position_ms) * 1000`, and `seek_ms = int(offset_us // 1000)`.

### Pitfall 3: `librespot --onevent` Arriving Before `_poll_playback` Enriches `_track_meta`
**What goes wrong:** On track change (`PLAYER_EVENT=track_changed`), `LibrespotEventServer` updates `_poll_play_state` and `_last_event["track_id"]` immediately (`<50ms`), while `_poll_playback()` is debounced by `400ms` (`py_modules/resilience.py:372-387`). If `MprisBridge` reads `plugin._track_meta` before the 400ms enrichment completes, `plugin._track_meta` still holds the *previous* song's title/artist while `track_id` is the *new* song.
**Why it happens:** Two-stage state update in Phase 17 (`<50ms` `--onevent` push followed by `400ms` debounced Web API metadata fetch).
**How to avoid:**
1. On `--onevent` (`playing` / `paused` / `stopped` / `seeked` / `volume_set`), `MprisBridge` immediately emits `PlaybackStatus` / `Volume` / `Seeked` changes.
2. If `event_dict.get("track_id")` differs from `(plugin._track_meta or {}).get("track_id")`, wait for `_poll_playback()` (which fires `track_metadata` 400ms later) before emitting the new `Metadata` dictionary—or only emit `Metadata` when `plugin._track_meta` matches the active `track_id`—so Bluetooth displays never flash mismatched `trackid` + old song title.

### Pitfall 4: Zombie `mpris-proxy` or Worker Process on Decky Plugin Reload
**What goes wrong:** Reloading Deckify or toggling `mpris_enabled` off/on leaves orphaned `python3 -m py_modules.mpris --worker` or `mpris-proxy` processes holding `org.mpris.MediaPlayer2.deckify` on the bus.
**Why it happens:** Parent process exits or restarts without closing stdin / terminating child processes.
**How to avoid:**
1. Pass `DBUS_NAME_FLAG_ALLOW_REPLACEMENT | DBUS_NAME_FLAG_REPLACE_EXISTING | DBUS_NAME_FLAG_DO_NOT_QUEUE` (`0x7`) in `RequestName` so a new worker instance always cleanly takes over `org.mpris.MediaPlayer2.deckify`.
2. In the UID 1000 worker, exit the main loop immediately when `sys.stdin` hits `EOF` (so if `main.py` crashes or is `SIGKILL`ed, the worker self-terminates automatically).
3. In `MprisBridge.stop()`, terminate both `_worker_proc` and `_proxy_proc` (with `terminate()` + `wait(timeout=1.5)` + `kill()` fallback).

## Code Examples

### 1. Compact Pure-Python D-Bus Marshalling & `a{sv}` Alignment (`py_modules/mpris.py`)
```python
import struct

def _pad_len(offset: int, align: int) -> int:
    return (align - (offset % align)) % align

class DbusMarshaller:
    """Pure-Python Little-Endian D-Bus binary wire-protocol marshaller."""

    def __init__(self, base_offset: int = 0) -> None:
        self.buf = bytearray()
        self.base_offset = base_offset

    @property
    def pos(self) -> int:
        return self.base_offset + len(self.buf)

    def align(self, boundary: int) -> None:
        pad = _pad_len(self.pos, boundary)
        if pad:
            self.buf.extend(b"\x00" * pad)

    def write_byte(self, val: int) -> None:
        self.buf.append(val & 0xFF)

    def write_boolean(self, val: bool) -> None:
        self.align(4)
        self.buf.extend(struct.pack("<I", 1 if val else 0))

    def write_uint32(self, val: int) -> None:
        self.align(4)
        self.buf.extend(struct.pack("<I", int(val) & 0xFFFFFFFF))

    def write_int64(self, val: int) -> None:
        self.align(8)
        self.buf.extend(struct.pack("<q", int(val)))

    def write_double(self, val: float) -> None:
        self.align(8)
        self.buf.extend(struct.pack("<d", float(val)))

    def write_string(self, val: str) -> None:
        self.align(4)
        raw = str(val).encode("utf-8")
        self.buf.extend(struct.pack("<I", len(raw)))
        self.buf.extend(raw)
        self.buf.append(0)

    def write_object_path(self, val: str) -> None:
        self.write_string(val)

    def write_signature(self, sig: str) -> None:
        raw = sig.encode("ascii")
        self.buf.append(len(raw))
        self.buf.extend(raw)
        self.buf.append(0)

    def write_variant(self, sig: str, val) -> None:
        self.write_signature(sig)
        self.write_value(sig, val)

    def write_array_strings(self, items: list[str]) -> None:
        self.align(4)
        len_pos = len(self.buf)
        self.buf.extend(b"\x00\x00\x00\x00")
        start_pos = len(self.buf)
        for item in items:
            self.write_string(item)
        byte_len = len(self.buf) - start_pos
        struct.pack_into("<I", self.buf, len_pos, byte_len)

    def write_dict_sv(self, mapping: dict[str, tuple[str, object]]) -> None:
        self.align(4)
        len_pos = len(self.buf)
        self.buf.extend(b"\x00\x00\x00\x00")
        # CRITICAL: Dict entries {sv} are 8-byte aligned even when empty!
        self.align(8)
        start_pos = len(self.buf)
        for key, (v_sig, v_val) in mapping.items():
            self.align(8)
            self.write_string(key)
            self.write_variant(v_sig, v_val)
        byte_len = len(self.buf) - start_pos
        struct.pack_into("<I", self.buf, len_pos, byte_len)

    def write_value(self, sig: str, val) -> None:
        if sig == "y":
            self.write_byte(int(val))
        elif sig == "b":
            self.write_boolean(bool(val))
        elif sig == "u":
            self.write_uint32(int(val))
        elif sig == "x":
            self.write_int64(int(val))
        elif sig == "d":
            self.write_double(float(val))
        elif sig == "s":
            self.write_string(str(val))
        elif sig == "o":
            self.write_object_path(str(val))
        elif sig == "g":
            self.write_signature(str(val))
        elif sig == "as":
            self.write_array_strings(list(val))
        elif sig == "a{sv}":
            self.write_dict_sv(dict(val))
        elif sig == "v":
            v_sig, v_val = val
            self.write_variant(v_sig, v_val)
        else:
            raise ValueError(f"Unsupported D-Bus signature: {sig}")
```

### 2. Local Cached `file://` Artwork Helper (`py_modules/images.py`)
```python
from pathlib import Path

def get_cached_image_file_uri(url: str | None) -> str:
    """Resolve local cached file:// URI for an image URL if cached on disk, else fallback to HTTPS URL (D-03)."""
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

### 3. `DEFAULT_SETTINGS` & TypeScript Status Schema (`py_modules/common.py` & `src/types.ts`)
```python
# In py_modules/common.py DEFAULT_SETTINGS (and _load_settings bool sanitization + main.py get_status public_keys):
"mpris_enabled": True,
"mpris_auto_proxy": True,
```
```typescript
// In src/types.ts:
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

### 4. `SettingsTab.tsx` `"Bluetooth & Media Controls (MPRIS2)"` Card (D-08)
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
      badgeLabel = "Starting...";
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

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `dbus-python` / `PyGObject` C bindings in Decky plugins | Pure-Python UID 1000 D-Bus wire-protocol worker | Phase 18 (v0.6) | Zero `LD_LIBRARY_PATH` or PyInstaller C-ABI crashes; passes `SO_PEERCRED` `EXTERNAL` auth on `/run/user/1000/bus`. |
| Manual Konsole `systemctl --user enable mpris-proxy` setup by user | Automatic `mpris-proxy` detection & supervision in `MprisBridge` | Phase 18 (v0.6) | Bluetooth headset buttons work immediately in SteamOS GamepadUI / Gamescope. |
| 1-second `PropertiesChanged` position polling | Event-driven `PropertiesChanged` on `--onevent` + on-demand monotonic `Position` calculation | Phase 18 (v0.6) | Zero idle D-Bus chatter or handheld battery drain during long gaming sessions. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | SteamOS 3.5+ includes `/usr/bin/python3` on the host image accessible to the `deck` user via `runuser -u deck`. | Pattern 1 | High certainty (`GEMINI.md` documents Python 3.11+ runtime on SteamOS 3.5/3.7+). If `python3` is not in default PATH, `MprisBridge` falls back to `sys.executable` or degrades gracefully to `Disabled` without crashing `main.py`. |
| A2 | BlueZ `mpris-proxy` on SteamOS is installed at `/usr/bin/mpris-proxy` (from `bluez-utils`). | Pattern 5 | If missing on a minimal custom OS image, `shutil.which("mpris-proxy")` returns `None` and the UI badge accurately displays `"D-Bus Active (mpris-proxy unavailable)"` per D-08. |

## Open Questions

None — all design choices are locked in `18-CONTEXT.md` (D-01 through D-08) and verified against the codebase.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Frontend build & Vitest | ✓ | `v25.1.0` | — |
| pnpm | Package scripts & test runner | ✓ | `10.28.0` | — |
| Python 3 | Backend `unittest` suite | ✓ | `3.14.0` (`py -3`) | — |
| `/run/user/1000/bus` & `mpris-proxy` | Runtime on SteamOS target | ✗ (Windows dev host) | — | Tested via in-memory `asyncio` stream pair & `unittest.mock`; graceful no-op when bus socket is absent. |

**Missing dependencies with no fallback:**
- None (all target-only SteamOS dependencies have clean unit-test mocks and runtime fallbacks).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework (Backend) | Python `unittest` (`IsolatedAsyncioTestCase`) |
| Framework (Frontend) | Vitest `5.1.0` (`package.json:13,43`) |
| Quick run command (Backend) | `py -3 -m unittest tests/test_mpris.py -v` |
| Quick run command (Frontend) | `pnpm test -- src/index.test.tsx` |
| Full suite command | `pnpm test && py -3 -m unittest discover -s tests -p "test_*.py"` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MPRIS-01 (D-01, D-05) | Pure-Python D-Bus wire protocol (`SASL EXTERNAL`, `Hello`, `RequestName`, `Introspect`, `Get`, `GetAll`, `Set`, and all `org.mpris.MediaPlayer2.Player` methods `Play`, `Pause`, `PlayPause`, `Stop`, `Next`, `Previous`, `Seek`, `SetPosition`, `OpenUri` + `Seeked` signal) | unit | `py -3 -m unittest tests/test_mpris.py -v` | ❌ Wave 0 |
| MPRIS-01 (D-02, D-07) | Writable `Volume` (respecting `VolumeFader` ducking & sleep lock), `Shuffle`, and `LoopStatus` (`None`/`Track`/`Playlist` ↔ `off`/`track`/`context`), plus routing to active local `librespot` or remote Connect device | unit | `py -3 -m unittest tests/test_mpris.py -v` | ❌ Wave 0 |
| MPRIS-01 (D-03, D-04) | `Metadata` (`mpris:trackid`, `mpris:length` in us, `xesam:title`, `xesam:artist` as `list[str]`, `xesam:album`, `mpris:artUrl` local `file://` cache with `https://` fallback), event-only `PropertiesChanged` diffing (zero 1s timer), and dynamic monotonic `Position` calculation | unit | `py -3 -m unittest tests/test_mpris.py -v` | ❌ Wave 0 |
| MPRIS-01 (D-06, D-08) | BlueZ `mpris-proxy` detection (`pgrep`/`systemctl`), auto-spawn under UID 1000 when missing, clean teardown on disable/unload, and `"Bluetooth & Media Controls (MPRIS2)"` card in `SettingsTab.tsx` | unit | `py -3 -m unittest tests/test_mpris.py -v && pnpm test` | ❌ Wave 0 (`tests/test_mpris.py`) / ✅ extend frontend tests |

### Sampling Rate
- **Per task commit:** `py -3 -m unittest tests/test_mpris.py -v` and/or `pnpm test`
- **Per wave merge:** `pnpm test && py -3 -m unittest discover -s tests -p "test_*.py"`
- **Phase gate:** Full suite + `pnpm typecheck` + `pnpm lint` green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/test_mpris.py` — covers all `MPRIS-01` backend behaviors (`DbusMarshaller`/`DbusUnmarshaller`, `MprisDbusSession`, `MprisBridge`, `get_cached_image_file_uri`, `VolumeFader` coordination, `mpris-proxy` lifecycle, and `Plugin` integration).

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | D-Bus `SASL EXTERNAL` peer credential check under UID 1000 (`deck`) on `/run/user/1000/bus`; never exposes TCP D-Bus |
| V3 Session Management | no | Not applicable |
| V4 Access Control | yes | Worker and `mpris-proxy` run strictly as unprivileged `DECK_USER` (UID 1000) via `_build_deck_command` |
| V5 Input Validation | yes | Clamp D-Bus `Volume` to `0.0..1.0`, validate `LoopStatus` in `{"None", "Track", "Playlist"}`, sanitize `mpris:trackid` object paths to `[A-Za-z0-9_]`, and validate `OpenUri` against `spotify:` / `https://open.spotify.com/` |
| V6 Cryptography | no | Uses `hashlib.sha256` only for non-cryptographic image cache filename lookup (`py_modules/images.py:82`) |

### Known Threat Patterns for Local D-Bus & Subprocess Supervision

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Arbitrary URI / command execution via `OpenUri(s)` | Tampering / Elevation of Privilege | Strictly validate that `OpenUri` begins with `spotify:` (track/album/playlist/artist/episode/show) or `https://open.spotify.com/` before passing to `play_tracks`; reject `file://` or shell strings. |
| Malformed D-Bus frame / integer overflow DoS | Denial of Service | Cap maximum incoming D-Bus message body length (e.g., `64 KiB`), catch `struct.error` / `ValueError` per message, and reply with `org.freedesktop.DBus.Error.InvalidArgs` without crashing the worker loop. |
| Privilege escalation in child processes | Elevation of Privilege | Always wrap worker and `mpris-proxy` invocations in `_build_deck_command()` (`runuser -u deck`) and strip `LD_LIBRARY_PATH`. |

## Sources

### Primary (HIGH confidence)
- Deckify codebase (read directly in this session):
  - `main.py:1-225,539-805,864-905,1515-1663` — `Plugin` lifecycle, `get_status`, `set_setting`, playback RPCs, `_poll_playback`
  - `py_modules/common.py:38-136,197-330,384-404` — `DEFAULT_SETTINGS`, `DBUS_SESSION_BUS_ADDRESS`, `_load_settings`, `_build_deck_command`
  - `py_modules/resilience.py:68-87,230-390` — `normalize_spotify_id`, `LibrespotEventServer.process_payload`
  - `py_modules/images.py:7-8,79-145` — `IMAGE_CACHE_DIR`, `_fetch_spotify_image` (`sha256` `.bin` cache)
  - `py_modules/volume.py:26-46,208-326` — `set_volume`, `VolumeFader` (`is_ducked`, `_sleep_locked`, `effective_volume`)
  - `py_modules/rpc_playback.py:42-155,356-428` — `control_playback`, `seek_playback`, `set_shuffle`, `set_repeat`, `play_tracks`
  - `py_modules/dock.py:134-273` — Manager pattern (`start`, `stop`, `get_status_dict`, `on_settings_changed`)
  - `src/components/tabs/SettingsTab.tsx:691-1015` — Phase 16 & Phase 17 settings card and status badge patterns
  - `src/types.ts:153-307` — `StatusResponse`, `EngineSettings`, status info interfaces
  - `deploy.sh:94-128` — Remote file sync layout (`main.py`, `py_modules/`, `dist/index.js`)
- Canonical project research: `.planning/research/ARCHITECTURE.md:48-87,149-154`, `.planning/research/PITFALLS.md:107-126,171,179`

### Secondary (MEDIUM confidence)
- [MPRIS D-Bus Interface Specification v2.2 (`org.mpris.MediaPlayer2` & `org.mpris.MediaPlayer2.Player`)](https://specifications.freedesktop.org/mpris-spec/latest/) — Methods, properties, `a{sv}` Xesam metadata types, `Seeked` signal, microsecond time units
- [D-Bus Specification v0.42 (Wire Protocol & Marshalling)](https://dbus.freedesktop.org/doc/dbus-specification.html) — `yyyyuua(yv)` header layout, 8-byte struct/dict-entry alignment, `SASL EXTERNAL` handshake
- [ArchWiki: MPRIS & BlueZ `mpris-proxy`](https://wiki.archlinux.org/title/MPRIS) — Bluetooth AVRCP to D-Bus MPRIS2 forwarding via `mpris-proxy`

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Pure-Python stdlib (`struct`, `socket`, `asyncio`) + existing `_build_deck_command` and `@decky/ui` components require zero external dependencies.
- Architecture: HIGH — Directly modeled on existing `DockAudioSwitcher` (`py_modules/dock.py`) and `LibrespotEventServer` (`py_modules/resilience.py`) lifecycle patterns.
- Pitfalls: HIGH — Root UID 0 vs UID 1000 `SASL EXTERNAL` rejection, `a{sv}` 8-byte alignment, microsecond conversions, and `VolumeFader` ducking/sleep coordination are all explicitly accounted for.

**Research date:** 2026-11-18
**Valid until:** 2026-12-18 (30 days)
