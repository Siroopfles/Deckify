# Stack Research — v0.6 Audio DSP, Docked Flow & System Resilience

**Domain:** SteamOS 3.5+ Audio DSP, D-Bus/MPRIS2, Event-Driven Daemon IPC, & Spotify Web API (Decky Loader Plugin)
**Researched:** 2026-11-16
**Confidence:** HIGH

## Recommended Stack

Deckify v0.6 builds on the existing zero-runtime-pip-dependency Python 3.11+ backend (`main.py`, `py_modules/`) and React 19 + TypeScript 5.9 (`@decky/ui`, `@decky/api`) frontend. Every v0.6 capability uses **system binaries already present on SteamOS 3.5+** or **Python stdlib / vendored pure-Python code**, avoiding C extensions, `pip install` steps on the Deck, or heavy npm packages.

### Core Technologies

| Technology | Version / Binary | Purpose | Why Recommended |
|------------|------------------|---------|-----------------|
| **Spotify Web API `/v1/me/library`** | REST v1 (2026 unified library) | Fix Like button HTTP 403 (`toggle_like_track`, `check_tracks_liked`) | Spotify deprecated `PUT/DELETE /v1/me/tracks` and `GET /v1/me/tracks/contains` in favor of `/v1/me/library?uris=...` and `/v1/me/library/contains?uris=...`, returning silent HTTP 403 on legacy endpoints. Official Spotify Client CDP `LibraryAPI` serves as secondary fallback if Web API returns 403 in Developer Mode. |
| **PipeWire `filter-chain` (`pipewire -c`)** | SteamOS 3.5+ PipeWire (`0.3.x` / `1.0+`) | Real-time biquad Equalizer (`EQ-01`) | Runs as an isolated user subprocess (`pipewire -c <eq.conf>`) loading `libpipewire-module-filter-chain` with built-in `bq_lowshelf`, `bq_peaking`, and `bq_highshelf` nodes—zero `pipewire.service` restarts, instant teardown on SIGTERM, and zero external DSP packages. |
| **`pw-cli` & `pw-dump`** | SteamOS PipeWire CLI tools | Live EQ band gain/freq updates & clock rate control | `pw-cli set-param <node-id> Props '{ params = [ "<band>:Gain" <dB> ] }'` updates biquad controls live without audio dropouts; `pw-dump` / `pw-cli ls Node` resolves the filter-chain node ID; `pw-metadata -n settings 0 clock.allowed-rates` (already in `py_modules/volume.py`) handles `bit_perfect_clock`. |
| **`pactl` (`libpulse` utils)** | SteamOS PulseAudio/PipeWire compat | Docked sink discovery, targeted stream routing (`DOCK-01`), & 30s sleep fade | `pactl list short sinks` / `pactl list sinks` detects USB-DAC and HDMI sinks; `pactl move-sink-input <id> <sink>` routes **only** Deckify (`librespot` / `com.spotify.client` / EQ virtual sink), explicitly filtering out `steamwebhelper` and `Chromium`. Existing `VolumeFader` (`pactl set-sink-input-volume`) powers the 30s sleep fade. |
| **`librespot --onevent`** | Bundled `bin/librespot` | Event-driven playback state & track transitions | Invokes a lightweight executable hook with `PLAYER_EVENT` (`playing`, `paused`, `stopped`, `changed`), `TRACK_ID`, `POSITION_MS`, `DURATION_MS`, and `VOLUME` over local Unix domain socket (`asyncio.start_unix_server`) to `main.py`, eliminating tight Web API polling and 429s. |
| **`busctl` (`systemd-logind`)** | SteamOS systemd | Suspend/Resume detection (`PrepareForSleep`) | Already integrated in `py_modules/device.py` (`SuspendResumeMonitor`); pair with a session bookmark (`track_uri`, `context_uri`, `position_ms`, `was_playing`, `volume`) on `PrepareForSleep=true` and Wi-Fi/resume recovery on `PrepareForSleep=false`. |
| **Pure-Python D-Bus (`dbus-next` vendored or stdlib `asyncio` wire bridge)** | Python 3.11+ (MIT pure-Python, 0 C deps) | MPRIS2 D-Bus Bridge (`org.mpris.MediaPlayer2.deckify`) | SteamOS user session bus (`unix:path=/run/user/1000/bus`) has no `dbus-python` or `PyGObject` (`gi`) in Decky's PyInstaller runtime. Vendoring pure-Python `dbus-next` (or a minimal stdlib `asyncio` D-Bus `EXTERNAL`-auth server) exposes `/org/mpris/MediaPlayer2` for Bluetooth AVRCP headset controls (`Play`, `Pause`, `PlayPause`, `Next`, `Previous`). |

### Supporting Libraries & Existing Primitives

| Component | Location | Purpose | When to Use |
|-----------|----------|---------|-------------|
| **`VolumeFader` (`cosine_ease`)** | `py_modules/volume.py` | 30-second gradual sleep timer fade-out | Reuse `VolumeFader.fade_to(0.0, 30.0)` inside `sleep_timer_worker` (`py_modules/system.py`) before `control_playback("pause")`, then restore baseline sink volume (`150%` if boosted, else `100%`) after pause. |
| **`_build_deck_command`** | `py_modules/common.py` | Execute `pactl`, `pw-cli`, `pw-dump`, `pipewire`, `busctl` as `deck` (UID 1000) | Mandatory for all PipeWire/PulseAudio/session-D-Bus commands when Decky runs as `root` with `LD_LIBRARY_PATH` stripped. |
| **`_cdp_evaluate`** | `py_modules/engine.py` | Spotify Desktop Client CDP fallback for Like button | When `audio_backend == "spotify_client"` or Web API `/v1/me/library` returns 403, invoke Spotify's internal `LibraryAPI` (`add`/`remove`) over `SPOTIFY_CDP_PORT`. |
| **Native HTML/SVG / CSS Flex** | `src/components/` | EQ Band Sliders & Preset Selector UI | Build with `@decky/ui` `SliderField` / `DropdownItem` and `Focusable` (`flow-children="horizontal"`)—no charting or slider libraries needed. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| **Python `unittest`** | Backend unit tests (`tests/test_*.py`) | Mock `subprocess.run`, `asyncio.create_subprocess_exec`, and `_spotify_api_request` for EQ, DOCK-01, MPRIS2, `--onevent`, and sleep fade. |
| **Vitest + ESLint + `tsc`** | Frontend tests & typechecking | Existing `pnpm test`, `pnpm lint`, `tsc --noEmit` gates. |

## Installation

**No new npm or runtime pip packages are required.**

- **Frontend:** 0 new `package.json` dependencies.
- **Backend:** 0 runtime `pip install` dependencies.
  - If vendoring `dbus-next` for MPRIS2: copy the pure-Python `dbus_next/` package (MIT license) into `py_modules/dbus_next/` so it ships inside the Decky plugin bundle with zero install steps.
  - System binaries verified on SteamOS 3.5+: `pipewire`, `pw-cli`, `pw-dump`, `pw-metadata`, `pactl`, `busctl`.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| **`pipewire -c <eq.conf>` (`libpipewire-module-filter-chain`)** | EasyEffects / PulseEffects Flatpak | Only if user wants a standalone GUI DSP suite; cannot be embedded or controlled seamlessly from Decky QAM without Flatpak IPC overhead. |
| **Vendored pure-Python `dbus-next` (or stdlib D-Bus wire server)** | `dbus-python` or `PyGObject` (`gi`) | Never in Decky Loader—both require C shared libraries (`libdbus-1`, `libgirepository`) that conflict with Decky's PyInstaller `LD_LIBRARY_PATH` and are absent from SteamOS immutable rootfs. |
| **`--onevent` Unix domain socket push** | 1s Spotify Web API `/me/player` polling | Fallback only when `audio_backend == "spotify_client"` or playback is on an external Spotify Connect device (phone/PC). |
| **Spotify `/v1/me/library` + CDP `LibraryAPI` fallback** | Legacy `/v1/me/tracks` | Never—`/v1/me/tracks` returns HTTP 403 on Spotify's updated Web API. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **`PUT/DELETE /v1/me/tracks` & `GET /v1/me/tracks/contains`** | Deprecated by Spotify Web API; returns HTTP 403 Forbidden even with valid `user-library-modify` / `user-library-read` scopes. | `PUT/DELETE /v1/me/library?uris=spotify:track:<id>` and `GET /v1/me/library/contains?uris=spotify:track:<id>`. |
| **`_set_pactl_sink_input` without stream filtering** | Current helper in `py_modules/engine.py` moves **all** `pactl list short sink-inputs`—including `steamwebhelper` / `Chromium`, which breaks Steam UI sounds and `module-stream-restore`. | Filter `pactl list sink-inputs` blocks to match only `librespot` PID, `com.spotify.client`, or Deckify's EQ virtual sink, explicitly skipping `steamwebhelper` and `Chromium`. |
| **`dbus-send` / `busctl` as an MPRIS2 server** | `dbus-send` and `busctl` are D-Bus **clients**; they cannot own `org.mpris.MediaPlayer2.deckify` or handle incoming `Play`/`Pause`/`Next`/`Previous` method calls. | Pure-Python `asyncio` D-Bus connection (`dbus-next` vendored or stdlib `AF_UNIX` wire server) on `DBUS_SESSION_BUS_ADDRESS`. |
| **Restarting `pipewire.service` for EQ changes** | Drops all game and SteamOS system audio for 1-2 seconds and risks breaking Gamescope audio routing. | Spawn/stop a dedicated `pipewire -c <eq.conf>` child process and update gains live via `pw-cli set-param <id> Props`. |
| **Spotify Web API volume stepping for 30s sleep fade** | Triggers HTTP 429 rate limits and 200ms+ jitter per step. | Local `VolumeFader.fade_to(0.0, 30.0)` over `pactl set-sink-input-volume` in 50ms slices. |

## Stack Patterns by Variant

**If `EQ-01` (PipeWire Equalizer) is enabled:**
- Write `~/.config/deckify/eq-filter-chain.conf` with `libpipewire-module-filter-chain` (`bq_lowshelf`, `bq_peaking` x N bands, `bq_highshelf`), `capture.props.node.name = "deckify_eq_in"` (`media.class = "Audio/Sink"`), and `playback.props.node.name = "deckify_eq_out"` (`node.passive = true`).
- Start `pipewire -c ~/.config/deckify/eq-filter-chain.conf` via `_build_deck_command` as `deck`, route `librespot` / `com.spotify.client` sink-input to `deckify_eq_in`, and route `deckify_eq_out` to the active physical/docked sink.
- Update band gains live via `pw-cli set-param <node_id> Props '{ params = [ "<band_name>:Gain" <float_db> ] }'`.

**If `DOCK-01` (Docked Audio-Switching) detects a USB-DAC or HDMI sink:**
- Match preferred sink names/patterns from `pactl list short sinks` (e.g. `alsa_output.usb-*`, `alsa_output.pci-*.hdmi-stereo*`), move **only** Deckify's sink-input (or `deckify_eq_out`), and toggle `bit_perfect_clock` via `pw-metadata -n settings 0 clock.allowed-rates "[ 44100 48000 88200 96000 ]"` when `audio_quality == "lossless"`.

**If `librespot --onevent` is active:**
- Pass `--onevent <plugin_dir>/bin/deckify-onevent.py` (or `.sh` + `nc`/`python3`) which sends a single JSON line (`{"event": PLAYER_EVENT, "track_id": TRACK_ID, "position_ms": POSITION_MS, ...}`) to a local Unix socket `/run/user/1000/deckify-events.sock` (or `XDG_RUNTIME_DIR/deckify-events.sock`) hosted by `asyncio.start_unix_server` in `main.py`.

## Version Compatibility

| Component A | Compatible With | Notes |
|-------------|-----------------|-------|
| **SteamOS 3.5+ PipeWire (`0.3.x` / `1.0+`)** | `libpipewire-module-filter-chain` builtins | `bq_lowshelf`, `bq_peaking`, `bq_highshelf` are built into PipeWire's `filter-chain` module without LADSPA/LV2 plugin packages. |
| **Decky Loader PyInstaller Python 3.11+** | Pure-Python `dbus-next` / stdlib `asyncio` | `LD_LIBRARY_PATH` must remain popped (`os.environ.pop("LD_LIBRARY_PATH", None)` in `main.py`) before spawning `pipewire`, `pw-cli`, `pactl`, or `busctl`. |
| **Spotify Web API `/v1/me/library`** | `user-library-read`, `user-library-modify` scopes | Existing `SPOTIFY_SCOPES` in `py_modules/common.py` already includes both scopes; no OAuth re-auth is required for users on `CURRENT_SCOPES_VERSION = 7`. |

## Sources

- Spotify Web API `/v1/me/library` & `/v1/me/tracks` 403 deprecation (`developer.spotify.com`, 2026) — HIGH confidence (verified via web search & codebase inspection of `py_modules/rpc_playback.py`)
- PipeWire `libpipewire-module-filter-chain` biquad builtins & `pw-cli set-param` (`docs.pipewire.org`) — HIGH confidence (verified via web search)
- `librespot --onevent` environment variables (`github.com/librespot-org/librespot`) — HIGH confidence (verified via web search)
- Pure-Python D-Bus `dbus-next` (`pypi.org/project/dbus-next`) — HIGH confidence (verified via web search; zero C/GLib dependencies)
- Existing codebase primitives (`main.py`, `py_modules/volume.py`, `py_modules/engine.py`, `py_modules/device.py`, `py_modules/system.py`, `py_modules/rpc_playback.py`, `py_modules/common.py`) — HIGH confidence (direct file inspection)

---
*Stack research for: Deckify v0.6 Audio DSP, Docked Flow & System Resilience*
*Researched: 2026-11-16*
