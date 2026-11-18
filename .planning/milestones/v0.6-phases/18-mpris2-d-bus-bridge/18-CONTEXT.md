# Phase 18: MPRIS2 D-Bus Bridge - Context

**Gathered:** 2026-11-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a pure-Python MPRIS2 D-Bus bridge (`org.mpris.MediaPlayer2.deckify` on the `deck` user session bus, UID 1000) and BlueZ `mpris-proxy` supervision so connected Bluetooth headsets, earbuds, car stereos, and SteamOS media controllers can control Deckify playback and display live track metadata (`MPRIS-01`).

</domain>

<decisions>
## Implementation Decisions

### 1. MPRIS2 Controls & Interface Scope (`org.mpris.MediaPlayer2` & `org.mpris.MediaPlayer2.Player`)
- **D-01 (Full Player Interface):** Expose the full `org.mpris.MediaPlayer2.Player` interface over D-Bus:
  - **Methods:** `Play`, `Pause`, `PlayPause`, `Stop`, `Next`, `Previous`, `Seek(Offset)` (microseconds relative), `SetPosition(TrackId, Position)` (microseconds absolute), `OpenUri(Uri)`.
  - **Properties:** `PlaybackStatus` (`"Playing"` | `"Paused"` | `"Stopped"`), `LoopStatus` (`"None"` | `"Track"` | `"Playlist"`, read/write), `Rate` (`1.0`), `Shuffle` (`bool`, read/write), `Metadata` (`a{sv}`), `Volume` (`double` `0.0..1.0`, read/write), `Position` (`int64` microseconds, read-only, computed on-demand), `MinimumRate` (`1.0`), `MaximumRate` (`1.0`), `CanGoNext` (`true`), `CanGoPrevious` (`true`), `CanPlay` (`true`), `CanPause` (`true`), `CanSeek` (`true`), `CanControl` (`true`).
  - **Signals:** `Seeked(Position)` (emitted on `Seek` / `SetPosition` or `librespot --onevent` `seeked` events).
- **D-02 (Writable Properties Safe Coordination):**
  - Writing `Volume` (`0.0..1.0`) over D-Bus maps to Deckify's `0..100` volume pipeline (`set_volume`) while respecting active `VolumeFader` ducking/sleep-fade states (never clobbering an active ducking fade).
  - Writing `Shuffle` (`bool`) and `LoopStatus` (`"None"` -> `"off"`, `"Track"` -> `"track"`, `"Playlist"` -> `"context"`) routes through Deckify's existing Spotify Web API / playback control methods and updates cached state optimistically.

### 2. Metadata & Album Art (`Metadata` Dictionary & `PropertiesChanged`)
- **D-03 (Standard Xesam Metadata + Local Cached `file://` Art URL with HTTPS Fallback):**
  - Publish `mpris:trackid` (`/org/mpris/MediaPlayer2/Track/<base62_id>` or `/org/mpris/MediaPlayer2/NoTrack`), `mpris:length` (`duration_ms * 1000` in microseconds, `int64`), `xesam:title` (`str`), `xesam:artist` (`list[str]`), `xesam:album` (`str`), and `mpris:artUrl` (`str`).
  - For `mpris:artUrl`, resolve the local cached file path in `~/.cache/deckify/images/` (`file:///...`) via `ImageService` when available, falling back to the raw `https://i.scdn.co/...` URL if not yet cached locally.
- **D-04 (Event-Driven `PropertiesChanged` Only — Zero 1s Polling Drain):**
  - Emit `org.freedesktop.DBus.Properties.PropertiesChanged` strictly on actual state/metadata/volume/mode transitions (triggered immediately by Phase 17's `LibrespotEventServer` `--onevent` push or Web API poll delta), never on a 1-second position timer.
  - Compute `Position` (`int64` microseconds) dynamically on-demand when queried over D-Bus using the last known `position_ms` + elapsed monotonic time while playing.

### 3. BlueZ `mpris-proxy` & UID 1000 Session Bus Lifecycle
- **D-05 (UID 1000 Session D-Bus Execution & Pure-Python / CLI Bridge):**
  - Register `org.mpris.MediaPlayer2.deckify` at `/org/mpris/MediaPlayer2` on the `deck` user session bus (`unix:path=/run/user/1000/bus`, `DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus`) running as UID 1000 (`deck`) so D-Bus `EXTERNAL` authentication succeeds even when Decky Loader runs `main.py` as `root` (UID 0), and without requiring compiled C-extension D-Bus bindings (`LD_LIBRARY_PATH` stripped).
- **D-06 (Auto-Ensure BlueZ `mpris-proxy` in SteamOS GamepadUI):**
  - When `mpris_enabled` is `True`, detect whether BlueZ `mpris-proxy` is active under `deck` (`pgrep -u deck -x mpris-proxy` or `systemctl --user is-active mpris-proxy`). If not running (common in SteamOS GamepadUI / Gamescope mode when Desktop KDE is not loaded) and the `mpris-proxy` binary is present on the system, automatically spawn and supervise `mpris-proxy` under `deck` (UID 1000), terminating the Deckify-managed `mpris-proxy` child cleanly when MPRIS2 is disabled or Deckify unloads.

### 4. Settings UI & Playback Target Routing
- **D-07 (Active Target Routing — Local `librespot` + Remote Connect):**
  - Route incoming MPRIS2 commands (`Play`, `Pause`, `PlayPause`, `Stop`, `Next`, `Previous`, `Seek`, `SetPosition`, `Volume`, `Shuffle`, `LoopStatus`) through Deckify's central playback control pipeline so Bluetooth headset media buttons work seamlessly whether audio is playing on local `librespot` or controlling a remote Spotify Connect device.
- **D-08 (`SettingsTab.tsx` `"Bluetooth & Media Controls (MPRIS2)"` Card):**
  - Add a dedicated card in `SettingsTab.tsx` (matching Phase 16 `Docked Audio-Switching` and Phase 17 `Playback Resilience` cards) containing:
    - Enable toggle (`mpris_enabled`, default `True`).
    - Auto-start `mpris-proxy` toggle (`mpris_auto_proxy`, default `True`, shown when `mpris_enabled` is `True`).
    - Live status badge (`Active (Bluetooth Ready)` when bus name is registered and `mpris-proxy` is running, `D-Bus Active (mpris-proxy unavailable)` if `mpris-proxy` binary is missing/stopped, or `Disabled`).

### the agent's Discretion
- Choice of pure-Python D-Bus implementation strategy in `py_modules/mpris.py` (e.g., a lightweight pure-Python `AF_UNIX` D-Bus wire-protocol / `gdbus`/`busctl`/helper script under UID 1000 or vendored pure-Python `dbus-next` without C extensions) so long as it works under UID 0 (`main.py`) -> UID 1000 (`deck` session bus) and passes unit tests on Windows/Linux without external compiled packages.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & Milestone Specs
- `.planning/PROJECT.md` — Core value, SteamOS GamepadUI constraints, UID 1000 environment.
- `.planning/REQUIREMENTS.md` — `MPRIS-01` requirement definition.
- `.planning/ROADMAP.md` — Phase 18 goal and success criteria.
- `.planning/research/ARCHITECTURE.md` — `py_modules/mpris.py` (`MprisBridge`) architecture and component responsibilities.
- `.planning/research/PITFALLS.md` — Pitfall 5 (UID 0 `EXTERNAL` auth rejection on `/run/user/1000/bus`, C-extension `LD_LIBRARY_PATH` crash, 1s `PropertiesChanged` battery drain, `mpris-proxy` in Gamescope).

### Prior Phase Context & Codebase Analogs
- `.planning/phases/17-event-driven-librespot-suspend-wi-fi-resilience/17-CONTEXT.md` — Phase 17 `--onevent` push architecture and `SettingsTab.tsx` card conventions.
- `py_modules/resilience.py` — `LibrespotEventServer` event callbacks and `_build_deck_command` usage.
- `py_modules/device.py` — `_build_deck_command()` and UID 1000 subprocess patterns.
- `py_modules/images.py` — `ImageService` local cache path resolution for `mpris:artUrl`.
- `src/components/tabs/SettingsTab.tsx` — Existing Phase 16 & Phase 17 settings cards and status badge patterns.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `py_modules/device.py:_build_deck_command`: Runs helper commands as `deck` (UID 1000) with `XDG_RUNTIME_DIR=/run/user/1000` and `DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus`.
- `py_modules/resilience.py:LibrespotEventServer`: Provides instant (<50ms) track/play/pause/seek/volume transitions that can directly trigger `MprisBridge.notify_state_changed()`.
- `py_modules/images.py:ImageService`: Caches album cover images in `~/.cache/deckify/images/` by MD5 hash of the URL — can expose `get_cached_file_uri(url)` for `mpris:artUrl`.
- `main.py:control_playback`, `seek`, `set_volume`, `set_shuffle`, `set_repeat`: Existing RPC methods that handle both local `librespot` and Spotify Web API playback control.

### Established Patterns
- Backend managers (`EqualizerManager`, `DockAudioSwitcher`, `LibrespotEventServer`, `SessionBookmarkManager`) expose `start()`, `stop()`, `get_status_info()`, and integrate into `main.py:_main()`, `_unload()`, `get_status()`, and `set_setting()`.
- Frontend settings cards in `SettingsTab.tsx` use a consistent container (`rgba(255,255,255,0.04)`, `12px` radius) with a header status pill and `@decky/ui` `ToggleField` controls.

### Integration Points
- `py_modules/mpris.py` (new): `MprisBridge` class managing the UID 1000 MPRIS2 D-Bus service and `mpris-proxy` supervision.
- `py_modules/common.py`: Add `mpris_enabled` (`True`) and `mpris_auto_proxy` (`True`) to `DEFAULT_SETTINGS` and `_load_settings_impl`.
- `main.py`: Instantiate/start/stop `MprisBridge`, push state updates from `_handle_librespot_event`, `_poll_playback`, and `control_playback`, and expose `mpris_status` in `get_status()` / `get_mpris_status()`.
- `src/types.ts` & `src/components/tabs/SettingsTab.tsx`: Type `MprisStatusInfo` and render the `"Bluetooth & Media Controls (MPRIS2)"` card.

</code_context>

<specifics>
## Specific Ideas

- Full MPRIS2 Player interface (`Play`, `Pause`, `PlayPause`, `Stop`, `Next`, `Previous`, `Seek`, `SetPosition`, plus writable `Volume`, `Shuffle`, `LoopStatus`) so both Bluetooth headsets (AVRCP) and SteamOS/Desktop media applets have full control.
- Local `file://` cached artwork URL (`mpris:artUrl`) with HTTPS CDN fallback, and event-only `PropertiesChanged` emissions (no 1s timer).
- Automatic `mpris-proxy` supervision under `deck` (UID 1000) when enabled so Bluetooth headset buttons work out-of-the-box in SteamOS GamepadUI.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 18-mpris2-d-bus-bridge*
