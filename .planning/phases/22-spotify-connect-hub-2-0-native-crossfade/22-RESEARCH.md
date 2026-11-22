# Phase 22: Spotify Connect Hub 2.0 & Native Crossfade - Research

**Researched:** 2026-11-22
**Domain:** Spotify Connect Device Management, Auto-Wake Playback Transfer, Remote Volume Control, and Multi-Engine Native Crossfade
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01 (Device Type Icons):** Display distinct `react-icons` icons per Spotify Connect device type (`Computer`, `Smartphone`, `Speaker`, `TV`, and a dedicated Steam Deck / Handheld icon for the local Deckify device) on the left of each device row.
- **D-02 (Engine Badges & Local Identity):** Show an inline engine pill badge (`librespot`, `spotifyd`, or `Spotify Client`) on the local Steam Deck device row, matching the local device by configured `device_name` (default `"Deckify"`) and/or active engine metadata returned by `get_devices`, and highlight/pin the local Steam Deck status card at the top of `DevicesTab` alongside a manual Refresh button.
- **D-03 (Auto-Waking Pull Playback Action):** Render a prominent 1-click *"Pull Playback to Steam Deck"* button in `DevicesTab` whenever playback is active on an external Connect device or the local engine is stopped/sleeping. Clicking it wakes the local engine (`PowerGovernor.wake_for_playback()` / `start_engine()`), polls `get_devices` until the local Steam Deck device registers on Spotify Connect, and transfers active playback (`transfer_playback(..., play=True)`) automatically.
- **D-04 (Debounced Remote Volume Slider):** Render a `300ms`-debounced `SliderField` (`0–100%`) in `DevicesTab` for the active or selected Spotify Connect device when `volume_percent !== null` and volume control is not restricted, backed by a dedicated `set_device_volume(device_id, volume_percent)` RPC calling Spotify Web API `PUT /v1/me/player/volume` so remote Connect devices can be adjusted without interfering with local PipeWire ducking.
- **D-05 (Crossfade Setting & UI):** Add a `Crossfade` `SliderField` (`0–12s` in `1s` steps, `0s = Off`) inside `SettingsTab` Playback Settings, persisted via `crossfade_seconds` in `py_modules/common.py` and `src/types.ts` (removing `crossfade_seconds` from the obsolete-keys cleanup list in `common.py`).
- **D-06 (3-Path Crossfade Sync):** Synchronize `crossfade_seconds` across engines:
  1. **Official Spotify Client (CDP):** When `spotify_client` is active on CDP port `9229`, update Spotify's native crossfade preference (`audio.crossfade` / `audio.crossfade_time`) via CDP.
  2. **Headless Engines (`librespot` / `spotifyd`):** Apply supported engine configuration flags/options on start or setting change when supported by the active engine binary.
  3. **Local Transition Fallback:** When `librespot` native crossfade is unavailable in the bundled binary, provide smooth local PipeWire fade-out/fade-in transitions via `VolumeFader` around track boundaries without affecting `_sleep_locked` or per-game ducking overrides.
- **D-07 (Empty State & Fixed-Volume Devices):** When `get_devices` returns no devices, show an inline empty-state card with *"Wake Local Engine"* and *"Refresh"* actions. For devices with `volume_percent === null` or restricted volume, display a *"Fixed Volume"* badge instead of an interactive slider. Surface failed transfers or volume calls via `showToast` without crashing.

### the agent's Discretion
- Exact `react-icons` icon mapping for Spotify Connect device types (`AVR`, `STB`, `CastVideo`, `CastAudio`, `GameConsole`, etc.).
- Exact polling interval/retry count when waiting for a newly woken local engine to appear in `get_devices` during *"Pull Playback to Steam Deck"*.
- Exact CDP preference evaluation script and `VolumeFader` boundary-fade timing details for `RADIO-02` fallback.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within Phase 22 scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CONNECT-01 | User can view device type icons and active engine badges (`librespot` vs `Spotify Client`) in `DevicesTab`, wake the local Deckify engine and pull playback from any external device with a single *"Pull Playback to Steam Deck"* action, and adjust remote Spotify Connect device volume via a debounced slider. | `get_devices` enrichment in `py_modules/rpc_playback.py` + `DeviceManager`; `pull_playback_to_deck` RPC reusing `PowerGovernor.wake_for_playback()` + `start_librespot()` + device polling + `PUT /v1/me/player` (`play: true`); `set_device_volume(device_id, volume_percent)` calling `PUT /v1/me/player/volume`; `DevicesTab.tsx` UI with `react-icons/fa`, pinned local Steam Deck card, debounced `SliderField`, Fixed Volume badge, and empty-state card. |
| RADIO-02 | User can configure native track Crossfade (`0–12s`) in `SettingsTab`, synchronized across Official Spotify Client CDP preferences, `librespot` / `spotifyd` engine config, and smooth transition handling. | `crossfade_seconds` (`0–12`, default `0`) in `DEFAULT_SETTINGS` (`py_modules/common.py`), `public_keys` & `set_setting` (`main.py`), `EngineSettings` (`src/types.ts`); `SettingsTab.tsx` `SliderField` in Playback & Audiophile Features; `_update_spotify_prefs_content` (`audio.crossfade_v2`, `audio.crossfade.time_v2`) + CDP `SettingsAPI` live sync; `VolumeFader` local boundary fade-out/fade-in fallback for `librespot`. |
</phase_requirements>

## Project Constraints (from GEMINI.md)

- **Steam CEF Content Security Policy:** Steam GamepadUI blocks direct external image URLs (`https://i.scdn.co/`). Phase 22 uses `react-icons/fa` SVGs for device icons rather than external URLs.
- **SteamOS GamepadUI Navigation:** Controller focus relies on spatial navigation (`flow-children`, `@decky/ui`); horizontal button groups MUST use `flow-children="horizontal"` (never `row`), and compact `DialogButton`s must set `width: "auto"` / `minWidth: "auto"` to override SteamOS 100% button width.
- **Steam Deck Environment:** Runs in `deck` user space (UID 1000) under SteamOS 3.5+. `os.environ.pop("LD_LIBRARY_PATH", None)` is mandatory before subprocesses.
- **PipeWire UI Stream Isolation:** Sink-input manipulation in `VolumeFader` must use `resolve_spotify_sink_input_ids` (ignoring `steamwebhelper` / `Chromium`).
- **Rate Limiting:** Never poll `me/player/devices` continuously; only fetch on `DevicesTab` mount, manual Refresh, or bounded wake-polling during *"Pull Playback to Steam Deck"*.
- **ESLint Complexity & Function Length Limits:** `[VERIFIED: eslint.config.js:25-31]` `complexity: ["warn", 15]`, `"max-depth": ["warn", 4]`, `"max-lines-per-function": ["warn", { max: 80, skipBlankLines: true, skipComments: true }]`, `"max-params": ["warn", 4]`. Split `DevicesTab.tsx` and `SettingsTab.tsx` additions into clean sub-components / helper functions so ESLint produces zero warnings.
- **Zero New Dependencies:** `[VERIFIED: .planning/STATE.md:170]` Milestone v0.7 uses zero new npm/pip dependencies.

## Summary

Phase 22 upgrades two core surfaces: **`DevicesTab`** (`CONNECT-01`) and **Crossfade** (`RADIO-02`).

For **`CONNECT-01`**, `DevicesTab.tsx` currently renders a minimal 55-line list of `SpotifyDevice` rows with no icons, no engine badges, no remote volume slider, no refresh button, and no auto-wake pull action `[VERIFIED: src/components/tabs/DevicesTab.tsx:14-55]`. On the backend, `get_devices` in `py_modules/rpc_playback.py:456-467` simply forwards `me/player/devices`, and `transfer_playback` (`py_modules/rpc_playback.py:470-485`) omits `play: True` and does not wake a sleeping local engine. Meanwhile, `quick_play_pinned` (`py_modules/rpc_playback.py:488-509`) and `PowerGovernor.wake_for_playback` (`py_modules/eco.py:215-236`) already implement the exact auto-wake + `get_devices` polling pattern. By enriching `get_devices` with local engine metadata (`audio_backend`, `engine_running`, `engine_sleeping`, `local_device_name`), adding `pull_playback_to_deck` (wake engine -> poll until local device appears -> `PUT /v1/me/player` with `{"device_ids": [local_id], "play": True}`), and adding `set_device_volume(device_id, volume_percent)` (`PUT /v1/me/player/volume` with `device_id` query param), `DevicesTab` can provide a responsive, controller-friendly Spotify Connect Hub 2.0.

For **`RADIO-02`**, `crossfade_seconds` was previously listed in the obsolete-keys cleanup loop in `py_modules/common.py:330` (`for obsolete in ("mix_mode", "crossfade_seconds", "mixed_playlists"):`). Removing it from that tuple, adding `"crossfade_seconds": 0` to `DEFAULT_SETTINGS`, validating `0..12` in `set_setting`, and exposing it in `get_status()`'s `public_keys` (`main.py:636-662`) restores clean persistence. Synchronization follows the 3-path model: (1) Official Spotify Client receives `audio.crossfade_v2` and `audio.crossfade.time_v2` in `prefs` via `_update_spotify_prefs_content` (`py_modules/engine.py:13-46`) plus live CDP `SettingsAPI` sync on port `9229`; (2) `librespot` has no native `--crossfade` CLI flag in standard builds `[ASSUMED]` (and `spotifyd` is not an active backend in `VALID_AUDIO_BACKENDS` `[VERIFIED: py_modules/common.py:53]`), so `start_librespot` remains clean without passing invalid flags; (3) `VolumeFader` (`py_modules/volume.py:234`) provides a smooth local PipeWire cosine fade-out / fade-in transition around track boundaries when `crossfade_seconds > 0` and `audio_backend == "librespot"`, strictly respecting `_sleep_locked` and `_compute_target_sink_volume()` (preserving per-game EQ/volume overrides and ducking).

**Primary recommendation:** Enrich `get_devices` with local engine/identity metadata, implement `pull_playback_to_deck` + `set_device_volume` in `py_modules/rpc_playback.py` / `py_modules/volume.py`, and implement a modular `CrossfadeController` + `VolumeFader` boundary-fade helper alongside `prefs` + CDP `SettingsAPI` sync.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Device list enrichment & local identity matching | API / Backend (`py_modules/rpc_playback.py`) | Browser / Client (`DevicesTab.tsx`) | Backend knows `audio_backend`, `device_name`, `_is_engine_running()`, and `PowerGovernor.engine_sleeping`; client renders badges and pins local card. |
| Auto-waking *"Pull Playback to Steam Deck"* | API / Backend (`py_modules/rpc_playback.py`, `eco.py`) | Browser / Client (`DevicesTab.tsx`) | Engine lifecycle (`PowerGovernor.wake_for_playback`, `start_librespot`) and Connect registration polling must run atomically in Python. |
| Remote Connect device volume | API / Backend (`py_modules/volume.py`) | Browser / Client (`DevicesTab.tsx` 300ms debounce) | UI debounces slider input to prevent HTTP 429; backend calls Spotify Web API `PUT /v1/me/player/volume` with `device_id`. |
| Crossfade setting persistence & validation | API / Backend (`py_modules/common.py`, `main.py`) | Browser / Client (`SettingsTab.tsx`) | `set_setting` validates `0..12` integer range, saves atomically, and triggers multi-engine sync. |
| Spotify Client CDP & `prefs` crossfade sync | API / Backend (`main.py`, `py_modules/engine.py`) | — | Requires filesystem access to Flatpak `prefs` and local WebSocket CDP on port `9229`. |
| Local `librespot` boundary crossfade transition | API / Backend (`py_modules/volume.py`, `main.py`) | — | PipeWire `pactl set-sink-input-volume` cosine fade via `VolumeFader` must coordinate with `_sleep_locked` and per-game ducking. |

## Standard Stack

### Core (Existing Project Stack — Zero New Dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.x (`@types/react: 19.2.14`) | Frontend UI components | Decky Loader global UI runtime `[VERIFIED: package.json:32]` |
| `@decky/ui` | `^4.11.1` | `Focusable`, `DialogButton`, `SliderField` | Official SteamOS GamepadUI focus & control primitives `[VERIFIED: package.json:29]` |
| `@decky/api` | `^1.1.3` | `callable` RPC bridge | Typed frontend-to-backend calls `[VERIFIED: package.json:46]` |
| `react-icons/fa` | `^5.5.0` | Device type & action icons | Project-wide icon pack (`FaGamepad`, `FaDesktop`, `FaMobileAlt`, `FaVolumeUp`, `FaTv`, `FaTabletAlt`, `FaCar`, `FaSyncAlt`, `FaSpotify`, `FaVolumeMute`) `[VERIFIED: package.json:48]` |
| Python `stdlib` | 3.11+ / 3.14 | `urllib.request`, `asyncio`, `subprocess` | Zero-dependency Decky plugin backend `[VERIFIED: GEMINI.md]` |

**Installation:** None required (zero new dependencies).

## Architecture Patterns

### System Architecture Diagram

```text
DevicesTab.tsx (GamepadUI)
  |-- mount / Refresh --------> get_devices() [rpc_playback.py]
  |                               |-- Spotify Web API: GET /v1/me/player/devices
  |                               +-- Enrich: local_engine, engine_running, engine_sleeping, local_device_name
  |-- "Pull Playback" --------> pull_playback_to_deck() [rpc_playback.py]
  |                               |-- PowerGovernor.wake_for_playback() / start_librespot()
  |                               |-- Poll get_devices() until local device appears (max ~10 x 0.4s)
  |                               +-- PUT /v1/me/player { device_ids: [local_id], play: true }
  |-- 300ms debounced slider -> set_device_volume(device_id, vol) [volume.py]
                                  +-- PUT /v1/me/player/volume?volume_percent=V&device_id=ID

SettingsTab.tsx (Playback & Audiophile Features)
  |-- Crossfade Slider (0-12s) -> set_setting("crossfade_seconds", sec) [main.py]
                                    |-- 1. Spotify Client: _write_spotify_client_prefs() + _sync_spotify_client_crossfade_cdp()
                                    |-- 2. librespot: store setting (no native --crossfade CLI flag)
                                    +-- 3. Local Fallback: VolumeFader boundary fade-out / fade-in on track end/start
```

### Pattern 1: Enriched `get_devices` & Local Device Matching (`CONNECT-01`)
**What:** `get_devices(plugin)` in `py_modules/rpc_playback.py` calls `GET /v1/me/player/devices` and returns both `devices` (each normalized/preserving `id`, `name`, `type`, `is_active`, `is_restricted`, `supports_volume`, `volume_percent`) and top-level local engine metadata:
- `local_device_name`: `plugin._settings.get("device_name") or socket.gethostname()` (matching `main.py:562`)
- `audio_backend`: `plugin._settings.get("audio_backend", "librespot")`
- `engine_running`: `plugin._is_engine_running()`
- `engine_sleeping`: `bool(getattr(getattr(plugin, "_power_governor", None), "engine_sleeping", False))`

**Local device matching rule:** On the frontend (and in `pull_playback_to_deck` on the backend), identify the local Steam Deck device by matching `device.name.toLowerCase() === localDeviceName.toLowerCase()` (with fallback matching `"deckify"` or `socket.gethostname()` if `device_name` was customized or empty). When matched, pin/highlight it at the top of `DevicesTab` with a `FaGamepad` Steam Deck icon and an inline engine pill badge:
- `audio_backend === "spotify_client"` -> `"Spotify Client"`
- `audio_backend === "librespot"` -> `"librespot"`
- (If an external/future `spotifyd` device is ever detected by name/metadata, display `"spotifyd"`).

**Device Type Icon Mapping (`react-icons/fa`):**
- Local Deckify device -> `FaGamepad`
- `"Computer"` -> `FaDesktop`
- `"Smartphone"` -> `FaMobileAlt`
- `"Tablet"` -> `FaTabletAlt`
- `"Speaker"`, `"AVR"`, `"CastAudio"`, `"AudioDongle"` -> `FaVolumeUp`
- `"TV"`, `"STB"`, `"CastVideo"` -> `FaTv`
- `"GameConsole"` -> `FaGamepad`
- `"Automobile"` -> `FaCar`
- Fallback -> `FaSpotify`

### Pattern 2: Auto-Waking *"Pull Playback to Steam Deck"* (`CONNECT-01`)
**What:** Dedicated `pull_playback_to_deck(plugin)` RPC in `py_modules/rpc_playback.py` (exposed on `Plugin` in `main.py`):
1. Check authentication (`token = await plugin._ensure_token()`).
2. Wake local engine if sleeping or stopped:
   - If `power_gov` exists and `(power_gov.engine_sleeping or not plugin._is_engine_running())`, call `await power_gov.wake_for_playback()`.
   - Else if `not plugin._is_engine_running()`, call `await plugin.start_librespot()` (which delegates to `start_spotify_client()` if `audio_backend == "spotify_client"` `[VERIFIED: main.py:536-537]`).
3. Poll `get_devices(plugin)` (e.g., up to `10` attempts at `0.4s` intervals = `4.0s` max, `spotify_client` may take 2–3s to register on Connect) looking for the local device matching `local_device_name`.
4. If found, call `PUT /v1/me/player` with `{"device_ids": [local_device_id], "play": True}` so playback resumes immediately on the Steam Deck.
5. Return `{"ok": True, "device": matched_device}` or `{"ok": False, "error": "..."}` if timeout/HTTP error.

**Why `play: True` matters:** Existing `transfer_playback` (`py_modules/rpc_playback.py:478`) sends `{"device_ids": [device_id]}` without `"play": True`, which can leave playback paused when pulling from an external device. Sending `"play": True` ensures seamless 1-click handoff.

### Pattern 3: Remote Connect Volume Control (`CONNECT-01`)
**What:**
- Backend: `set_device_volume(plugin, device_id: str, volume_percent: int)` in `py_modules/volume.py` (exposed on `Plugin` in `main.py`).
  - Validates `volume_percent = max(0, min(100, int(volume_percent)))`.
  - Calls `PUT /v1/me/player/volume` with query params `{"volume_percent": volume_percent, "device_id": device_id}` (if `device_id` is non-empty) `[CITED: developer.spotify.com]`.
  - Handles HTTP `403` / `404` cleanly via `_parse_spotify_error(e)` and returns `{"ok": False, "error": ...}`.
- Frontend (`DevicesTab.tsx`):
  - Track `selectedDeviceId` (defaulting to the active device `devices.find(d => d.is_active)`).
  - If `device.volume_percent !== null && !device.is_restricted && device.supports_volume !== false`, render a `@decky/ui` `SliderField` (`min={0}`, `max={100}`, `step={1}`, `showValue`).
  - Debounce `onChange` by `300ms` using a `useRef<ReturnType<typeof setTimeout> | null>` (cleared on unmount) before calling `backendSetDeviceVolume(device.id, val)`, updating local UI state optimistically and reverting/toasting on `{ ok: false }`.
  - If `device.volume_percent === null || device.is_restricted || device.supports_volume === false`, render a *"Fixed Volume"* pill badge (`FaVolumeMute` + `"Fixed Volume"`) instead of a slider.

### Pattern 4: 3-Path Native Crossfade Synchronization (`RADIO-02`)
**What:**
1. **Persistence (`py_modules/common.py`, `main.py`, `src/types.ts`):**
   - Remove `"crossfade_seconds"` from `for obsolete in ("mix_mode", "crossfade_seconds", "mixed_playlists"):` at `py_modules/common.py:330`.
   - Add `"crossfade_seconds": 0` to `DEFAULT_SETTINGS` in `py_modules/common.py`.
   - Add `"crossfade_seconds"` to `public_keys` in `main.py:636-662`.
   - Validate `crossfade_seconds` in `main.py:set_setting`: reject `bool`, parse `int`, clamp `0..12`.
   - Add `crossfade_seconds?: number;` to `EngineSettings` in `src/types.ts`.
2. **Path 1 — Official Spotify Client (`prefs` + CDP port `9229`):**
   - In `_update_spotify_prefs_content` (`py_modules/engine.py:13-46`), accept `crossfade_seconds: int = 0` and write:
     - `"audio.crossfade_v2": "true" if crossfade_seconds > 0 else "false"` `[CITED: spotify.com prefs]`
     - `"audio.crossfade.time_v2": str(max(0, min(12, int(crossfade_seconds))) * 1000)` (Spotify desktop `prefs` stores `audio.crossfade.time_v2` in milliseconds, e.g. `5000` for `5s`) `[ASSUMED]`
   - In `main.py`, add `_sync_spotify_client_crossfade_cdp(self, crossfade_seconds: int)` following the exact `SettingsAPI` React fiber traversal pattern in `_sync_spotify_client_quality_cdp` (`main.py:404-451`), probing `s.audio?.crossfade?.setValue(enabled)` and `s.audio?.crossfadeTime?.setValue(ms)` (or `crossfadeDuration`) defensively with `try/catch` so unknown internal property names never crash.
   - Call `_write_spotify_client_prefs()` + `_sync_spotify_client_crossfade_cdp()` in `set_setting` when `key == "crossfade_seconds"` and `audio_backend == "spotify_client"`.
3. **Path 2 — Headless Engines (`librespot` / `spotifyd`):**
   - Bundled `librespot` does not support a native `--crossfade` CLI flag `[ASSUMED]`. Do NOT pass unsupported CLI flags to `LIBRESPOT_BIN` (which would cause `librespot` to exit immediately with arg-parse error).
   - `spotifyd` is not in `VALID_AUDIO_BACKENDS` `[VERIFIED: py_modules/common.py:53]`.
4. **Path 3 — Local PipeWire Transition Fallback (`VolumeFader`):**
   - When `audio_backend == "librespot"` and `crossfade_seconds > 0`:
   - Add a `CrossfadeTransitionHelper` (or methods on `VolumeFader` in `py_modules/volume.py`):
     - `trigger_crossfade_out(duration_sec)` / `trigger_crossfade_in(duration_sec)` using `VolumeFader.fade_to(...)`.
     - **Critical invariant:** Always check `if self._sleep_locked: return` before fading, and for fade-in ALWAYS fade back to `self._compute_target_sink_volume()` (NEVER hardcoded `100.0` or `150.0`), so per-game volume ceilings, per-game ducking, and voice ducking are 100% preserved!
     - Trigger fade-out when `_poll_duration_ms > 0` and remaining track time `(_poll_duration_ms - _poll_progress_ms) <= crossfade_seconds * 1000` (with a per-`track_id` guard so it fires at most once per track), and trigger fade-in when `track_id` changes in `_poll_playback` / `onevent` while a crossfade-out was active.
     - Cap fade-out/fade-in duration cleanly (e.g., `min(crossfade_seconds, remaining_sec)` for out, `min(crossfade_seconds * 0.5, 3.0)` for in) so short tracks or mid-track skips recover immediately.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Engine wake & Connect polling | Custom subprocess spawn + sleep loop | `PowerGovernor.wake_for_playback()` + `rpc_playback.get_devices()` | Already handles Eco-Mode `_eco_sleeping` flag, `librespot` vs `spotify_client`, and event emission `[VERIFIED: py_modules/eco.py:215-236]`. |
| Smooth PipeWire volume fades | Custom `pactl` loops | `VolumeFader.fade_to()` + `_compute_target_sink_volume()` | Handles 50ms cosine easing, task cancellation (`_fade_seq`), `steamwebhelper` deny-list, `_sleep_locked`, and game overrides `[VERIFIED: py_modules/volume.py:316-480]`. |
| Debounced UI slider | Raw `onChange` RPC calls | `useRef` `300ms` timeout + `@decky/ui` `SliderField` | Prevents Spotify Web API HTTP 429 rate-limit circuit breaker (`_BREAKER_OPEN_UNTIL`) `[VERIFIED: py_modules/spotify.py:47-55]`. |
| Spotify Client CDP evaluation | Raw websocket client | `_cdp_evaluate` (`py_modules/engine.py:408-427`) | Already manages target discovery, WebSocket framing, and timeout handling. |

## Common Pitfalls

### Pitfall 1: `crossfade_seconds` Stripped on Settings Load
**What goes wrong:** `crossfade_seconds` is saved to `settings.json` via `set_setting`, but disappears on plugin restart.
**Why it happens:** `py_modules/common.py:330` currently contains `for obsolete in ("mix_mode", "crossfade_seconds", "mixed_playlists"): saved.pop(obsolete, None)`.
**How to avoid:** Remove `"crossfade_seconds"` from that obsolete-keys tuple in `py_modules/common.py:330`.
**Warning signs:** `test_common` or restart tests reset `crossfade_seconds` back to `0`.

### Pitfall 2: `crossfade_seconds` Missing from `get_status()` `public_keys`
**What goes wrong:** `SettingsTab` reads `status?.settings?.crossfade_seconds`, which is `undefined` even after saving.
**Why it happens:** `main.py:636-662` filters `self._settings` through an explicit `public_keys` tuple in `get_status()`.
**How to avoid:** Add `"crossfade_seconds"` to `public_keys` in `main.py`.

### Pitfall 3: Crossfade Fade-In Overwriting Per-Game Ducking or Sleep Timer Lock
**What goes wrong:** After a track transition, `VolumeFader` restores volume to `100%` during an active Sleep Timer fade or while a game is ducking audio.
**Why it happens:** Fading to a hardcoded `100.0` or `150.0` bypasses `_sleep_locked` and `_compute_target_sink_volume()`.
**How to avoid:** Both `crossfade_out` and `crossfade_in` MUST guard on `if self._sleep_locked: return` and `crossfade_in` MUST target `self._compute_target_sink_volume()` `[VERIFIED: py_modules/volume.py:316-350, 425-438]`.

### Pitfall 4: SteamOS 100% Button Width & Vertical Focus Jumps in `DevicesTab`
**What goes wrong:** Compact buttons like *"Refresh"* or *"Pull Playback"* stretch to 100% width or D-pad navigation jumps vertically instead of horizontally.
**Why it happens:** SteamOS GamepadUI applies `width: 100%` to `DialogButton` by default, and `flow-children="row"` causes vertical focus jumps.
**How to avoid:** Use `flow-children="horizontal"` on horizontal button containers and `style={{ width: "auto", minWidth: "auto" }}` on compact `DialogButton`s `[VERIFIED: STATE.md:188, GEMINI.md]`.

### Pitfall 5: Calling `PUT /v1/me/player/volume` for Fixed-Volume Devices
**What goes wrong:** Spotify Web API returns `403 Forbidden` (`VOLUME_CONTROL_DISALLOWED`) when adjusting volume on Chromecast/AVRs/optical outputs.
**Why it happens:** Some Connect devices report `volume_percent: null`, `supports_volume: false`, or `is_restricted: true` `[CITED: developer.spotify.com]`.
**How to avoid:** Check `d.volume_percent !== null && !d.is_restricted && d.supports_volume !== false` before rendering the `SliderField`; otherwise render a *"Fixed Volume"* badge `[VERIFIED: 22-CONTEXT.md D-07]`.

## Code Examples

### Debounced Remote Volume Slider (`DevicesTab.tsx`)
```typescript
const volTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

useEffect(() => {
  return () => {
    if (volTimerRef.current) clearTimeout(volTimerRef.current);
  };
}, []);

const handleVolumeChange = useCallback((deviceId: string, nextVol: number) => {
  setLocalVolumes((prev) => ({ ...prev, [deviceId]: nextVol }));
  if (volTimerRef.current) clearTimeout(volTimerRef.current);
  volTimerRef.current = setTimeout(async () => {
    const res = await backendSetDeviceVolume(deviceId, nextVol);
    if (!res.ok) {
      showToast(res.error || "Failed to adjust device volume");
    }
  }, 300);
}, [showToast]);
```

### Remote Volume RPC (`py_modules/volume.py`)
```python
async def set_device_volume(plugin, device_id: str, volume_percent: int) -> dict:
    """Set Spotify Connect volume (0-100%) for a specific device ID."""
    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}
    vol = max(0, min(100, int(volume_percent)))
    params: dict = {"volume_percent": vol}
    if isinstance(device_id, str) and device_id.strip():
        params["device_id"] = device_id.strip()
    try:
        await _exec(_spotify_api_request, "me/player/volume", token, "PUT", params)
        return {"ok": True, "volume_percent": vol}
    except urllib.error.HTTPError as e:
        return {"ok": False, "error": _parse_spotify_error(e)}
    except Exception as e:
        decky.logger.error("set_device_volume failed: %s", e)
        return {"ok": False, "error": str(e)}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `crossfade_seconds` stripped as obsolete | Persisted `0–12s` + 3-path sync | Phase 22 | Restores crossfade across Spotify Client & `librespot` |
| `transfer_playback(id)` without wake or `play: True` | `pull_playback_to_deck()` auto-wake + poll + `play: True` | Phase 22 | 1-click handoff even when local engine is Eco-sleeping |
| Plain text `DevicesTab` list | Pinned Steam Deck card + icons + engine badges + debounced volume | Phase 22 | Full Spotify Connect Hub 2.0 parity |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `audio.crossfade.time_v2` in Spotify Desktop `prefs` is stored in milliseconds (`crossfade_seconds * 1000`), and `SettingsAPI` exposes `crossfade` / `crossfadeTime` properties. | Pattern 4 (3-Path Crossfade Sync) | Low — `prefs` boolean `audio.crossfade_v2` still toggles crossfade, and CDP eval is wrapped in `try/catch` with defensive property checks. Verify on hardware during UAT if testing Official Spotify Client. |
| A2 | Bundled `bin/librespot` does not support a native `--crossfade` CLI flag. | Summary, Pattern 4 | Low — even if a newer `librespot` build adds one, not passing an unknown flag avoids startup crashes, and `VolumeFader` local transition fallback works regardless. |

## Open Questions

1. **Exact `SettingsAPI` property name for crossfade in Official Spotify Client CDP**
   - What we know: `SettingsAPI` is accessible via React fiber traversal in `_sync_spotify_client_quality_cdp` (`main.py:404-451`) using `s.quality.streamingQuality.setValue(...)`.
   - What's unclear: Whether Spotify's internal `SettingsAPI.audio` exposes `crossfade` / `crossfadeTime` or `playback.crossfade` in the currently installed Flatpak version.
   - Recommendation: Probe `s.audio?.crossfade` and `s.playback?.crossfade` defensively in `_sync_spotify_client_crossfade_cdp`, and always persist `audio.crossfade_v2` + `audio.crossfade.time_v2` to `prefs` via `_write_spotify_client_prefs()`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js / pnpm | Frontend build & Vitest | ✓ | pnpm + Vitest 5.1.0 | — |
| Python 3 | Backend `unittest` suite | ✓ | Python 3 (`py -3`) | — |
| Steam Deck (`pactl`, `librespot`, CDP `9229`) | Hardware runtime / UAT | ✗ (Windows dev host) | — | Mocked in `unittest` and `vitest` |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework (Frontend) | Vitest `5.1.0` `[VERIFIED: package.json:43]` |
| Framework (Backend) | Python `unittest` (`py -3 -m unittest`) `[VERIFIED: package.json:14]` |
| Config file | `package.json` (`"test": "vitest run"`) |
| Quick run command | `pnpm test -- --run src/components/tabs/DevicesTab.test.tsx src/components/tabs/SettingsTab.test.tsx` |
| Full suite command | `pnpm test -- --run && py -3 -m unittest discover -s tests -p "test_*.py"` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CONNECT-01 | `get_devices` engine metadata, `pull_playback_to_deck` auto-wake + poll + `play: True`, `set_device_volume` | unit | `py -3 -m unittest tests/test_connect_hub.py` | ❌ Wave 0 |
| CONNECT-01 | `DevicesTab` device icons, engine badge, pinned local card, 300ms debounced volume slider, Fixed Volume badge, empty state | unit | `pnpm test -- --run src/components/tabs/DevicesTab.test.tsx` | ❌ Wave 0 |
| RADIO-02 | `crossfade_seconds` persistence (not stripped as obsolete), `set_setting` validation (`0..12`), `prefs` + CDP sync, `VolumeFader` boundary fade respecting `_sleep_locked` & ducking | unit | `py -3 -m unittest tests/test_crossfade.py` | ❌ Wave 0 |
| RADIO-02 | `SettingsTab` Crossfade `SliderField` (`0–12s`, `0s = Off`) | unit | `pnpm test -- --run src/components/tabs/SettingsTab.test.tsx` | ✅ (extend existing) |

### Sampling Rate
- **Per task commit:** `pnpm test -- --run` (or targeted test file) + `py -3 -m unittest` for modified module
- **Per wave merge:** `pnpm lint && pnpm typecheck && pnpm test -- --run && py -3 -m unittest discover -s tests -p "test_*.py"`
- **Phase gate:** Full suite green + `pnpm build` clean before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/test_connect_hub.py` — covers `CONNECT-01` backend (`get_devices` enrichment, `pull_playback_to_deck`, `set_device_volume`)
- [ ] `tests/test_crossfade.py` — covers `RADIO-02` backend (`crossfade_seconds` persistence, `prefs` update, CDP sync, `VolumeFader` boundary fade)
- [ ] `src/components/tabs/DevicesTab.test.tsx` — covers `CONNECT-01` frontend (`DevicesTab` icons, badges, pull button, debounced slider, fixed volume, empty state)

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Uses existing OAuth token via `plugin._ensure_token()` |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes | Clamp `crossfade_seconds` (`0..12`, reject `bool`), clamp `volume_percent` (`0..100`), sanitize `device_id` before query param encoding (`urllib.parse.urlencode`) |
| V6 Cryptography | no | — |

### Known Threat Patterns for Deckify Connect & Crossfade
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Spotify Web API HTTP 429 flood from volume slider drag | Denial of Service | `300ms` frontend debounce + existing `_BREAKER_OPEN_UNTIL` circuit breaker in `py_modules/spotify.py` |
| Unvalidated `device_id` or `crossfade_seconds` injection | Tampering | `urllib.parse.urlencode` for query params; strict integer clamping (`0..12`, `0..100`) in `set_setting` / `set_device_volume` |
| `LD_LIBRARY_PATH` / subprocess env pollution | Elevation / Crash | Existing `os.environ.pop("LD_LIBRARY_PATH", None)` and `_build_deck_command` |

## Sources

### Primary (HIGH confidence)
- In-repo files read this session: `src/components/tabs/DevicesTab.tsx`, `src/components/tabs/SettingsTab.tsx`, `src/types.ts`, `py_modules/common.py`, `py_modules/rpc_playback.py`, `py_modules/engine.py`, `py_modules/eco.py`, `py_modules/volume.py`, `main.py`, `package.json`, `eslint.config.js`.
- Verified `react-icons/fa` exports via `node -e` and test runners via `pnpm test -- --run` and `py -3 -m unittest`.

### Secondary (MEDIUM confidence)
- [Spotify Web API — Set Playback Volume (`PUT /v1/me/player/volume`)](https://developer.spotify.com/documentation/web-api/reference/set-playback-volume) — confirmed `volume_percent` (`0..100`) and optional `device_id` query parameters.
- [Spotify Web API — Get Available Devices (`GET /v1/me/player/devices`)](https://developer.spotify.com/documentation/web-api/reference/get-a-users-available-devices) — confirmed `supports_volume`, `is_restricted`, `volume_percent` (nullable), `type`, `is_active`, `id`, `name`.
- [Spotify Community — `prefs` file `audio.crossfade_v2` / `audio.crossfade.time_v2`](https://community.spotify.com/) — confirmed desktop `prefs` key names.

### Tertiary (LOW confidence)
- Exact `audio.crossfade.time_v2` unit (ms) and `SettingsAPI` crossfade property path in Official Spotify Client CDP (`[ASSUMED]`, guarded defensively).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies, all existing libraries verified in `package.json`.
- Architecture: HIGH — directly extends `rpc_playback.py`, `eco.py`, `volume.py`, `engine.py`, and `DevicesTab.tsx` / `SettingsTab.tsx`.
- Pitfalls: HIGH — obsolete-key stripping in `common.py:330`, `public_keys` in `main.py:636`, and `_sleep_locked` / game override invariants in `volume.py` all directly observed.

**Research date:** 2026-11-22
**Valid until:** 2026-12-22
