---
last_mapped_commit: f8defec7206b337ccec032ac6a11b40649e888bd
last_mapped_at: 2026-11-26
---
<!-- refreshed: 2026-11-26 -->
</External Integrations>
<Architecture>
**Analysis Date:** 2026-11-26

## System Overview

```text
┌───────────────────────────────────────────────────────────────────────────┐
│                    SteamOS GamepadUI (Chromium CEF)                       │
├─────────────────────┬──────────────────────┬──────────────────────────────┤
│  Quick Access Menu  │   Expanded Modal     │   In-Game Overlay & Banner   │
│   `src/index.tsx`   │ `src/components/     │ `src/components/             │
│                     │ DeckifyExpandedModal │ DeckifyOverlay.tsx`          │
│                     │ .tsx` + `tabs/*.tsx` │ `SilentBanner.tsx`           │
└──────────┬──────────┴──────────┬───────────┴──────────────┬───────────────┘
           │                     │                          │
           └─────────────────────┼──────────────────────────┘
                                 │  @decky/api RPC (`callable` / `emit`)
                                 ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                   Decky Loader Python Runtime (`main.py`)                 │
│                        `Plugin` Central Orchestrator                      │
├─────────────────┬─────────────────┬──────────────────┬────────────────────┤
│  RPC Handlers   │ Audio & Routing │  Resilience & OS │  External APIs     │
│ `py_modules/    │ `py_modules/    │ `py_modules/     │ `py_modules/       │
│  rpc_playback`  │  engine.py`     │  resilience.py`  │  spotify.py`       │
│ `rpc_library.py`│  volume.py`     │  mpris.py`       │  auth.py`          │
│ `cdp_bridge.py` │  equalizer.py`  │  input_watch.py` │  images.py`        │
│                 │  dock.py`       │  eco.py`         │  romanize.py`      │
│                 │  soundtrack.py` │  system.py`      │                    │
└────────┬────────┴────────┬────────┴─────────┬────────┴─────────┬──────────┘
         │                 │                  │                  │
         ▼                 ▼                  ▼                  ▼
┌─────────────────┐ ┌─────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ librespot /     │ │ PipeWire /  │ │ Linux sysfs /    │ │ Spotify Web API  │
│ Flatpak Spotify │ │ PulseAudio  │ │ D-Bus / hidraw   │ │ LRCLIB / CDNs    │
└─────────────────┘ └─────────────┘ └──────────────────┘ └──────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| `Plugin` | Central Decky lifecycle (`_main`/`_unload`), RPC surface, watchdog & API poll loops | `main.py` |
| `QuickAccessMenu` & Plugin Entry | Registers `/deckify` route, Steam menu patch, overlay wrapper, chord & lifetime listeners | `src/index.tsx` |
| `DeckifyExpandedModal` | Full-screen modal shell routing 14 modular tabs, trigger nav, and action modals | `src/components/DeckifyExpandedModal.tsx` |
| `DeckifyOverlay` & `SilentBanner` | In-game HUD overlay with synced/romanized lyrics and non-intrusive track banner | `src/components/DeckifyOverlay.tsx`, `src/components/SilentBanner.tsx` |
| `registerSteamMenu` | Patches Steam `MainNavMenuContainer` React Fiber tree to inject the Spotify entry | `src/steamMenu.tsx` |
| `DeckifyImage` & `imagePipeline` | Frontend LRU cache (200) and 4-concurrent queue resolving images via backend proxy | `src/components/common/DeckifyImage.tsx`, `src/components/common/imagePipeline.ts` |
| `rpc_playback` & `rpc_library` | Modularized RPC business logic for playback, queue, playlists, search, and podcasts | `py_modules/rpc_playback.py`, `py_modules/rpc_library.py` |
| `SpotifyClient` & `auth` | Spotify Web API HTTP client, OAuth 2.0 PKCE token exchange/refresh, LRCLIB lyrics | `py_modules/spotify.py`, `py_modules/auth.py` |
| `ImageService` | Validates Spotify/Steam HTTPS image hosts, caches up to 50 MB on disk, returns base64 Data URIs | `py_modules/images.py` |
| `EngineManager` & `cdp_bridge` | Supervises `librespot` or Flatpak `com.spotify.Client` (via CDP port 9229) | `py_modules/engine.py`, `py_modules/cdp_bridge.py` |
| `VolumeFader` & `EqualizerManager` | Smooth PipeWire/PulseAudio volume fading, voice/game ducking, 10-band biquad filter-chain EQ | `py_modules/volume.py`, `py_modules/equalizer.py` |
| `SoundtrackManager` & `DockAudioSwitcher` | Per-game soundtrack/EQ/volume profiles on app launch/exit; USB-DAC/HDMI sink switching | `py_modules/soundtrack.py`, `py_modules/dock.py` |
| `LibrespotEventServer` & `SessionBookmarkManager` | Unix socket (`onevent.sock`) listener for `librespot --onevent` and wake/Wi-Fi recovery | `py_modules/resilience.py` |
| `MprisBridge` & `ControllerInputWatcher` | D-Bus `org.mpris.MediaPlayer2.deckify` service and read-only `/dev/hidraw*` + `evdev` chord watcher | `py_modules/mpris.py`, `py_modules/input_watch.py` |
| `PowerGovernor` & `SuspendResumeMonitor` | Handheld battery Eco-Mode governor via `/sys/class/power_supply` and sleep/wake detection | `py_modules/eco.py`, `py_modules/system.py` |

## Pattern Overview

**Overall:** Decoupled Client-Server Plugin Architecture with Event-Driven Backend Subsystems

**Key Characteristics:**
- **Typed RPC Bridge:** Frontend React components invoke Python backend methods exclusively via `@decky/api` `callable(...)` bindings and receive push updates via `addEventListener(...)` (`track_metadata`, `settings_changed`, `librespot_event`, `eco_status_changed`, `librespot_status`).
- **CSP Bypass Proxy:** Steam GamepadUI CEF blocks external HTTPS image URLs (`i.scdn.co`); `DeckifyImage` (`src/components/common/DeckifyImage.tsx`) delegates image fetching through `get_image` to `py_modules/images.py`, which caches bytes on disk and returns `data:image/...;base64,...` URIs.
- **Modular Delegation:** `main.py` delegates domain RPCs to `py_modules/rpc_playback.py` and `py_modules/rpc_library.py` while retaining lifecycle ownership of long-running async managers.
- **Dual Audio Engine Support:** Supports headless `librespot` (with `--onevent` Unix socket hooks) or the Flatpak Spotify Desktop Client (`com.spotify.Client`) controlled via Chrome DevTools Protocol (`py_modules/cdp_bridge.py`).

## Layers

**Presentation Layer (React / `@decky/ui`):**
- Purpose: Render Quick Access Menu controls, full-screen library modal, in-game overlay, and silent track banner inside SteamOS GamepadUI.
- Location: `src/index.tsx`, `src/components/`, `src/hooks/`, `src/utils/`
- Contains: React 19 functional components, custom hooks (`usePlaybackClock`, `usePlaybackStatus`, `useTriggerNavigation`), gamepad chord matcher (`src/chords.ts`), and theme event bus (`src/utils/themeBus.ts`).
- Depends on: `@decky/ui`, `@decky/api`, `react-icons`, `qrcode.react`.
- Used by: SteamOS GamepadUI CEF renderer.

**RPC & Event Bridge Layer:**
- Purpose: Serialize typed frontend-to-backend calls and broadcast backend state changes to mounted UI surfaces.
- Location: `callable` declarations in `src/index.tsx` and `src/components/DeckifyExpandedModal.tsx`; `decky.emit` and `Plugin` methods in `main.py`.
- Contains: Asynchronous RPC endpoints returning `{ ok: boolean, ... }` payloads.
- Depends on: Decky Loader `plugin_loader` runtime.

**Domain & Subsystem Layer (Python):**
- Purpose: Manage Spotify API calls, OAuth PKCE, image caching, PipeWire/PulseAudio routing, EQ, per-game soundtracks, MPRIS, controller input watching, and power governance.
- Location: `py_modules/*.py`
- Contains: Pure-Python stdlib HTTP/D-Bus/socket/subprocess modules and async manager classes.
- Depends on: Python 3.11+ standard library, system binaries (`pactl`, `librespot`, `pipewire`, `flatpak`).
- Used by: `main.py:Plugin`.

**OS & Audio Infrastructure Layer:**
- Purpose: Execute audio playback, hardware sink switching, and system integration.
- Location: Host SteamOS kernel (`/dev/hidraw*`, `/sys/class/power_supply`), PipeWire/PulseAudio daemon, D-Bus session bus.

## Data Flow

### Primary Request Path (Playback State & Control)

1. User triggers playback or opens QAM/Modal (`src/index.tsx` or `src/components/DeckifyExpandedModal.tsx`).
2. Frontend invokes `@decky/api` `callable` (e.g., `control_playback`, `play_tracks`, `get_status`).
3. `Plugin` in `main.py` delegates to `py_modules/rpc_playback.py` or `py_modules/rpc_library.py`, ensuring a valid OAuth token via `_ensure_token()`.
4. Backend either calls Spotify Web API (`py_modules/spotify.py:_spotify_api_request`) or executes a CDP command (`py_modules/cdp_bridge.py`) when using `spotify_client`.
5. `LibrespotEventServer` (`py_modules/resilience.py`) receives instant track/play/pause events over `onevent.sock`, adjusts `_poll_api_loop` intervals (`3.0s` active vs `20.0s` relaxed), and triggers `decky.emit("track_metadata", ...)` / `decky.emit("librespot_event", ...)` to update QAM, Overlay, and `themeBus`.

### Image Retrieval Flow (CSP Proxy)

1. Component renders `<DeckifyImage src={url} />` (`src/components/common/DeckifyImage.tsx`).
2. `imagePipeline.ts` checks `imgMemoryCache` (200-entry `ImageLruCache`) and deduplicates in-flight requests via `imgPending`, queuing up to 4 concurrent `get_image` RPC calls.
3. `py_modules/images.py` validates the URL against `ALLOWED_SPOTIFY_DOMAINS`, checks the 50 MB disk LRU cache (`~/.cache/deckify/images` or runtime `cache/images`), downloads via HTTPS if missing, and returns a `data:image/...;base64,...` URI.

**State Management:**
- **Frontend:** Component-level `useState`/`useRef`, `usePlaybackClock` (`src/hooks/usePlaybackClock.ts`) for smooth client-side progress interpolation, and `themeBus.ts` for dynamic album-art accent CSS variables (`--deckify-accent`).
- **Backend:** In-memory `Plugin._settings` dictionary persisted atomically to `settings.json` (`py_modules/common.py:_save_settings`), plus `session_bookmark.json` (`py_modules/resilience.py`) for suspend/Wi-Fi recovery.

## Key Abstractions

**`DeckifyImage` & `imagePipeline`:**
- Purpose: Transparent `<img>` replacement with memory LRU cache, request deduplication, concurrency throttling, and base64 CSP proxying.
- Examples: `src/components/common/DeckifyImage.tsx`, `src/components/common/imagePipeline.ts`
- Pattern: Proxy + Caching Pipeline.

**`Plugin` + `rpc_playback` / `rpc_library`:**
- Purpose: Separates Decky plugin lifecycle/state from large RPC handler implementations.
- Examples: `main.py`, `py_modules/rpc_playback.py`, `py_modules/rpc_library.py`
- Pattern: Facade / Module Delegation.

**`VolumeFader` & `SoundtrackManager`:**
- Purpose: Coordinates smooth PipeWire volume transitions, multi-reason audio ducking (voice chat, game launch, manual), and per-game soundtrack/EQ overrides with pre-game snapshot recovery.
- Examples: `py_modules/volume.py`, `py_modules/soundtrack.py`
- Pattern: State-Snapshot Coordinator.

## Entry Points

**Frontend Plugin Entry:**
- Location: `src/index.tsx:definePlugin`
- Triggers: Loaded by Decky Loader inside Steam GamepadUI CEF.
- Responsibilities: Registers `/deckify` route, mounts `DeckifyOverlayWrapper` global component, patches Steam main menu (`registerSteamMenu`), attaches gamepad chord and `SteamClient.GameSessions` lifetime listeners, and cleans up in `onDismount()`.

**Backend Plugin Entry:**
- Location: `main.py:Plugin._main`
- Triggers: Instantiated by Decky Loader `plugin_loader` on startup/reload.
- Responsibilities: Loads `settings.json`, strips `LD_LIBRARY_PATH`, initializes and starts `SuspendResumeMonitor`, `VolumeFader`, `VoiceActivityDetector`, `SoundtrackManager`, `EqualizerManager`, `DockAudioSwitcher`, `PowerGovernor`, `LibrespotEventServer`, `MprisBridge`, `ControllerInputWatcher`, and starts `librespot` and API polling.

**MPRIS Worker Subprocess:**
- Location: `py_modules/mpris.py` (invoked with `--worker`)
- Triggers: Spawned by `MprisBridge.start()` as `deck` user (`UID 1000`) to connect to the user's D-Bus session bus.
- Responsibilities: Exposes `org.mpris.MediaPlayer2.deckify` and forwards media key commands back to `main.py` over stdin/stdout JSON lines.

## Architectural Constraints

- **Content Security Policy (CSP):** Steam GamepadUI CEF blocks external HTTP/HTTPS image URLs; all album/artist/playlist art must be served as Base64 Data URIs via `py_modules/images.py`.
- **D-Pad Spatial Navigation:** `@decky/ui` `Focusable` containers laying out horizontal controls must use `flow-children="horizontal"` (never `"row"`) to prevent vertical focus jumps.
- **Process Environment Isolation:** `os.environ.pop("LD_LIBRARY_PATH", None)` is executed at import time in `main.py` and `py_modules/common.py` so Decky's PyInstaller OpenSSL libraries do not break `librespot` or `openssl` subprocesses.
- **Decky Sandbox `__name__`:** Decky Loader executes `main.py` with `__name__ == "_"`; `main.py:68` uses `sys.modules.get(__name__)` rather than direct `sys.modules[__name__]` indexing.
- **PipeWire UI Stream Isolation:** `steamwebhelper` / `"Chromium"` sink-inputs carry SteamOS UI click sounds; `py_modules/engine.py` and `py_modules/volume.py` must ignore them to avoid muting SteamOS navigation audio.
- **Read-Only Controller Input:** `py_modules/input_watch.py` opens `/dev/hidraw*` and `/dev/input/event*` strictly with `os.O_RDONLY | os.O_NONBLOCK` (never `EVIOCGRAB`) so game and SteamOS controller input is never blocked.

## Anti-Patterns

### Using External Image URLs Directly in `<img>`

**What happens:** Rendering `https://i.scdn.co/...` directly in JSX `<img src={...} />`.
**Why it's wrong:** Steam GamepadUI CEF blocks external image origins via CSP, resulting in broken artwork.
**Do this instead:** Always render artwork with `<DeckifyImage src={url} />` (`src/components/common/DeckifyImage.tsx`).

### Polling Heavy Spotify Library Endpoints Continuously

**What happens:** Calling playlist/album/library endpoints inside the 3-second polling loop.
**Why it's wrong:** Triggers Spotify Web API HTTP 429 rate-limiting and drains handheld battery.
**Do this instead:** Restrict continuous polling to `Plugin._poll_api_loop` (`main.py`), and rely on `LibrespotEventServer` (`py_modules/resilience.py`) to relax polling to `20.0s` when event-driven updates are active.

## Error Handling

**Strategy:** Graceful degradation with structured RPC result envelopes (`{ "ok": False, "error": "..." }`) and non-blocking UI fallbacks.

**Patterns:**
- Backend RPC methods wrap network, subprocess, and D-Bus I/O in `try/except`, logging via `decky.logger.error(...)` and returning `{ "ok": False, "error": str(e) }`.
- External HTTP requests use explicit timeouts (e.g., `DEFAULT_CDP_TIMEOUT = 4.0` in `py_modules/cdp_bridge.py`, bounded timeouts in `py_modules/spotify.py`).
- Frontend `callable` invocations wrap calls in `try/catch` and surface actionable errors via `@decky/api` `toaster.toast(...)` without crashing React trees.

## Cross-Cutting Concerns

**Logging:** Backend logs via `decky.logger` (`py_modules/common.py` provides a `SimpleNamespace` fallback when running outside Decky for tests); frontend logs via `console.*`. Sensitive tokens (`access_token`, `refresh_token`, `spotify_client_id`) are redacted from startup settings logs (`main.py:224-225`).
**Validation:** Input and settings sanitization helpers live in `py_modules/common.py` (`_sanitize_chord_bindings`, `_sanitize_pinned_playlists`), `main.py` (`_validate_eq_bands`), and `py_modules/images.py` (`_validate_image_url`).
**Authentication:** OAuth 2.0 PKCE flow (`py_modules/auth.py` + `Plugin.start_oauth` in `main.py`) with an `asyncio.Lock` (`_token_refresh_lock`) guarding concurrent token refreshes.

---

*Architecture analysis: 2026-11-26*
