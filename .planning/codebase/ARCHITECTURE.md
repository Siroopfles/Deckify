---
last_mapped_commit: e6cf3a7b4bc94746d4d770b5bd8981193852200f
last_mapped_at: 2026-11-18
---
<!-- refreshed: 2026-11-18 -->
# Architecture

**Analysis Date:** 2026-11-18

## System Overview

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                    SteamOS GamepadUI (Chromium CEF)                     │
├────────────────────┬─────────────────────────┬──────────────────────────┤
│  Quick Access Menu │  DeckifyExpandedModal   │     DeckifyOverlay       │
│  `src/index.tsx`   │ `src/components/        │ `src/components/         │
│                    │  DeckifyExpandedModal.  │  DeckifyOverlay.tsx`     │
│                    │  tsx`                   │                          │
└─────────┬──────────┴────────────┬────────────┴────────────┬─────────────┘
          │                       │                         │
          └───────────────────────┼─────────────────────────┘
                                  │ @decky/api (`callable`, `addEventListener`)
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     Decky Loader Python Runtime                         │
│                          `main.py` (`Plugin`)                           │
├───────────────┬──────────────────┬──────────────────┬───────────────────┤
│ RPC Handlers  │ Spotify & Lyrics │  Image Proxy     │  Orchestration    │
│ `py_modules/  │ `py_modules/     │ `py_modules/     │ `soundtrack.py`   │
│  rpc_*.py`    │  spotify.py`     │  images.py`      │ `volume.py`       │
│               │  `auth.py`       │                  │ `equalizer.py`    │
│               │                  │                  │ `dock.py`         │
│               │                  │                  │ `resilience.py`   │
├───────────────┴──────────────────┴──────────────────┴───────────────────┤
│  Engine & Device Supervision (`py_modules/engine.py`, `device.py`)      │
└─────────┬───────────────────────┬──────────────────────────┬────────────┘
          │                       │                          │
          ▼                       ▼                          ▼
┌───────────────────┐   ┌───────────────────┐    ┌────────────────────────┐
│ Spotify Web API / │   │  librespot /      │    │  PipeWire / PulseAudio │
│ LRCLIB / OAuth    │   │  Spotify Flatpak  │    │  (`pactl`, `pw-cli`)   │
└───────────────────┘   └───────────────────┘    └────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| `Plugin` | Central Decky RPC router, OAuth PKCE server, adaptive playback polling loop, and subprocess supervision | `main.py` |
| `Content` / `definePlugin` | Quick Access Menu UI, pinned collection pills (`PinnedPill`), Steam Main Menu injection, global gamepad chords, app lifetime & toast listeners | `src/index.tsx` |
| `registerSteamMenu` | React fiber tree wrapper injecting the Deckify entry into SteamOS `MainNavMenuContainer` | `src/steamMenu.tsx` |
| `DeckifyExpandedModal` | Full-screen modal shell with sidebar navigation, trigger tab switching, and 14 modular feature tabs | `src/components/DeckifyExpandedModal.tsx` |
| `DeckifyOverlay` | Transparent in-game HUD overlay showing current track, play/pause state, and optional progress bar | `src/components/DeckifyOverlay.tsx` |
| `DeckifyImage` / `imagePipeline` | LRU-cached, concurrency-limited (`maxConcurrent: 4`) image loader proxying external URLs via backend | `src/components/common/DeckifyImage.tsx`, `src/components/common/imagePipeline.ts` |
| `rpc_playback` / `rpc_library` | Modularized RPC handlers for playback controls, playlists/folders, discovery feed, library, search, recommendations, and lyrics | `py_modules/rpc_playback.py`, `py_modules/rpc_library.py` |
| `spotify` / `auth` | Spotify Web API HTTP client, error parsing, multi-source synced lyrics fetcher, and OAuth PKCE helpers | `py_modules/spotify.py`, `py_modules/auth.py` |
| `images` | Server-side image downloader, disk cache (`CACHE_DIR`), and base64 data URI encoder | `py_modules/images.py` |
| `engine` | `librespot` / `spotifyd` / Spotify Flatpak process helpers, Chrome DevTools Protocol (CDP) bridge, `pactl` sink parsers | `py_modules/engine.py` |
| `volume` / `equalizer` / `dock` | PipeWire/PulseAudio volume control, `VolumeFader`, `VoiceActivityDetector` auto-ducking, 10-band biquad `EqualizerManager`, and `DockAudioSwitcher` hotplug routing | `py_modules/volume.py`, `py_modules/equalizer.py`, `py_modules/dock.py` |
| `resilience` | `LibrespotEventServer` (`--onevent` Unix socket server) and `SessionBookmarkManager` for suspend/resume & Wi-Fi drop recovery | `py_modules/resilience.py` |
| `soundtrack` / `vdf_parser` | Game-specific soundtrack orchestration on Steam app launch/exit and pure-stdlib Steam VDF/ACF game discovery | `py_modules/soundtrack.py`, `py_modules/vdf_parser.py` |
| `device` / `system` / `common` | Hostname/LAN/mDNS & SSL cert helpers, `SuspendResumeMonitor`, sleep timer worker, pinned playlist sanitization, and atomic settings I/O | `py_modules/device.py`, `py_modules/system.py`, `py_modules/common.py` |

## Pattern Overview

**Overall:** Decoupled Client-Server Plugin (React/TypeScript frontend in SteamOS CEF communicating over Decky Loader RPC with an async Python 3.11+ backend daemon).

**Key Characteristics:**
- **Typed RPC Bridge:** Frontend hooks and components invoke backend methods exclusively via `@decky/api` `callable<Args, Return>("method_name")`, while backend pushes real-time events via `decky.emit("track_metadata" | "deck_resumed", ...)`.
- **Hybrid Push + Adaptive Poll Sync:** `LibrespotEventServer` (`py_modules/resilience.py`) receives sub-5ms `--onevent` Unix domain socket notifications from `librespot`, allowing `_poll_api_loop` in `main.py` to relax Web API polling to 20s when socket events are healthy and wake immediately via `_poll_wake_event`.
- **CSP Bypass Image Proxy:** Steam GamepadUI CEF blocks external image URLs (`https://i.scdn.co/`); `DeckifyImage` routes non-local URLs through `get_image` (`py_modules/images.py`), caching base64 data URIs on disk and in a 200-entry frontend `ImageLruCache`.
- **Gamepad-First Navigation:** UI uses `@decky/ui` spatial navigation (`Focusable`, `flow-children="horizontal"`), custom `TriggerController` / `useTriggerNavigation` for L1/R1/L2/R2/X/Y shortcuts, and `listNavigation.ts` for fast list jumping.
- **Delegated Python Backend:** `Plugin` in `main.py` owns lifecycle, OAuth HTTP/TLS server, and polling loops, delegating domain logic to focused modules in `py_modules/`.

## Layers

**Presentation Layer (GamepadUI):**
- Purpose: Render Quick Access Menu controls, pinned collection pills, full-screen library/discovery/playback modal, Steam main menu entry, and in-game HUD overlay.
- Location: `src/index.tsx`, `src/steamMenu.tsx`, `src/components/`, `src/hooks/`, `src/utils/`
- Contains: React 19 functional components, custom hooks (`usePlaybackClock`, `usePlaybackStatus`, `useTriggerNavigation`), and navigation utilities.
- Depends on: `@decky/ui`, `@decky/api`, `react-icons`, `qrcode.react`.
- Used by: SteamOS GamepadUI CEF renderer.

**IPC / RPC Bridge Layer:**
- Purpose: Serialize async method calls and push events between the browser JS context and Python plugin process.
- Location: `@decky/api` (`callable`, `addEventListener`, `definePlugin`) on frontend; `Plugin` async methods in `main.py` on backend.
- Contains: Typed RPC stubs in `src/index.tsx`, `src/components/DeckifyExpandedModal.tsx`, `src/components/tabs/DiscoveryTab.tsx`, `src/hooks/usePlaybackStatus.ts`, `src/components/common/imagePipeline.ts`.
- Depends on: Decky Loader runtime (`plugin_loader`).
- Used by: Presentation Layer and Backend Domain Layer.

**Backend Domain & Orchestration Layer:**
- Purpose: Manage Spotify OAuth PKCE, Web API calls, lyrics, image caching, audio ducking/fading, 10-band EQ, dock audio switching, session resilience, and per-game soundtracks.
- Location: `main.py`, `py_modules/`
- Contains: `Plugin` class, `SoundtrackManager`, `VolumeFader`, `VoiceActivityDetector`, `EqualizerManager`, `DockAudioSwitcher`, `LibrespotEventServer`, `SessionBookmarkManager`, `SuspendResumeMonitor`, and RPC handler functions.
- Depends on: Python standard library (`asyncio`, `urllib`, `ssl`, `struct`, `zlib`, `subprocess`, `socket`), `decky` runtime.
- Used by: RPC Bridge Layer and background asyncio tasks.

**System & Audio Engine Layer:**
- Purpose: Execute Spotify Connect audio playback and control PipeWire/PulseAudio filter chains, sink routing, and system power states.
- Location: External binaries (`librespot`, Spotify Flatpak, `pactl`, `pw-cli`, `pipewire`, `busctl`, `systemctl`, `openssl`) invoked via `py_modules/engine.py`, `py_modules/volume.py`, `py_modules/equalizer.py`, `py_modules/dock.py`, `py_modules/device.py`, `py_modules/system.py`.
- Contains: Subprocess wrappers running under `deck` user (UID 1000) with `PULSE_SERVER`, `DBUS_SESSION_BUS_ADDRESS`, and `XDG_RUNTIME_DIR`.
- Depends on: SteamOS 3.5+ host environment.
- Used by: Backend Domain Layer.

## Data Flow

### Primary Request Path (Playback State Synchronization)

1. `LibrespotEventServer` (`py_modules/resilience.py`) listens on `ONEVENT_SOCK_FILE` for instant `librespot --onevent` state transitions and sets `Plugin._poll_wake_event`, while `Plugin._poll_api_loop` in `main.py` polls Spotify `me/player` via `_poll_playback` (`main.py:1639`) and updates internal state (`_poll_play_state`, `_poll_track_id`, `_track_meta`, `_is_liked`, `_active_device`).
2. On track changes, `main.py` emits `"track_metadata"` events via `decky.emit` (received in `src/index.tsx` for in-game toasts) and snapshots session state via `SessionBookmarkManager` (`py_modules/resilience.py`).
3. Frontend components poll `get_status` (`src/hooks/usePlaybackStatus.ts:54` every 1500ms in modal; `src/index.tsx` in QAM), receiving `StatusResponse`.
4. `usePlaybackClock` (`src/hooks/usePlaybackClock.ts`) interpolates local playback position smoothly between server polls and commits user seek actions via `seek_playback`.

### Image Retrieval Flow (CSP Proxy)

1. Component renders `<DeckifyImage src={url} />` (`src/components/common/DeckifyImage.tsx`).
2. If `url` is not already `data:` or `http://127.0.0.1` and misses `imgMemoryCache` (`ImageLruCache(200)`), `fetchWithQueueAndCache` (`src/components/common/imagePipeline.ts:90`) deduplicates in-flight requests via `imgPending` and queues through `ImageRequestQueue(4)`.
3. `backendGetImage(src)` calls `Plugin.get_image` (`main.py:1135`), which delegates to `py_modules/images.py` (`_fetch_spotify_image`) to validate the host, check `~/.cache/deckify/images/`, download if missing, and return a `data:image/...;base64,...` URI.

### Game Soundtrack, Auto-Ducking, EQ & Dock Switching Flow

1. `src/index.tsx` subscribes to `SteamClient.GameSessions.RegisterForAppLifetimeNotifications` and forwards launch/exit events to `handle_app_lifetime_event(appId, running)` (`main.py:926`).
2. `SoundtrackManager` (`py_modules/soundtrack.py`) debounces launch/exit, snapshots pre-game playback, applies per-game playlist/mode/volume overrides, and restores snapshots on exit.
3. Simultaneously, `VoiceActivityDetector` (`py_modules/volume.py`) monitors PipeWire/PulseAudio sink-inputs for voice/game activity, `EqualizerManager` (`py_modules/equalizer.py`) manages a 10-band PipeWire filter-chain sink (`deckify_eq_sink`), and `DockAudioSwitcher` (`py_modules/dock.py`) subscribes to `pactl subscribe` events to auto-switch USB-DAC/HDMI outputs on dock hotplug.

**State Management:**
- **Frontend:** React `useState`/`useRef` per component/modal, module-level `imgMemoryCache` LRU, and `activeGameListeners` / `modalOpenListeners` observer sets in `src/index.tsx:86-93`.
- **Backend:** In-memory state on `Plugin` (`_track_meta`, `_liked_cache` TTL cache, `_access_token`), VDF game cache (`_games_cache` 30s TTL in `py_modules/vdf_parser.py:25`), session bookmark persistence in `SESSION_BOOKMARK_FILE`, and atomic JSON persistence in `SETTINGS_FILE` via `common._save_settings`.

## Key Abstractions

**`DeckifyImage` & `imagePipeline`:**
- Purpose: Transparent `<img>` replacement that resolves Spotify CDN URLs through the backend base64 proxy with LRU caching, request deduplication, and concurrency throttling.
- Examples: `src/components/common/DeckifyImage.tsx`, `src/components/common/imagePipeline.ts`
- Pattern: Proxy Component + Bounded Request Queue.

**`usePlaybackClock`:**
- Purpose: Smooth 60fps/interval playback progress interpolation with optimistic seek locking and drift correction against 1500ms server polls.
- Examples: `src/hooks/usePlaybackClock.ts`, consumed in `src/index.tsx` and `src/hooks/usePlaybackStatus.ts`
- Pattern: Custom React Synchronization Hook.

**`useTriggerNavigation` & `TriggerController`:**
- Purpose: Unified modal controller navigation combining `FocusNavController`, `navigator.getGamepads()` rAF polling, and keyboard/button fallbacks with 80ms deduplication.
- Examples: `src/hooks/useTriggerNavigation.ts`, `src/utils/triggerController.ts`
- Pattern: Hardware Input Adapter + Debounced Event Dispatcher.

**`SoundtrackManager`, `VolumeFader`, `EqualizerManager`, `DockAudioSwitcher` & `LibrespotEventServer`:**
- Purpose: Stateful async orchestrators encapsulating game-lifecycle soundtrack switching, smooth PulseAudio volume transitions, real-time 10-band PipeWire biquad filtering, dock sink hotplug routing, and Unix socket event ingestion.
- Examples: `py_modules/soundtrack.py`, `py_modules/volume.py`, `py_modules/equalizer.py`, `py_modules/dock.py`, `py_modules/resilience.py`
- Pattern: Asyncio Task Orchestrator.

## Entry Points

**Frontend Plugin Entry:**
- Location: `src/index.tsx` (`definePlugin`)
- Triggers: Loaded by Decky Loader when SteamOS GamepadUI initializes.
- Responsibilities: Registers QAM `Content`, injects `/deckify` route and `DeckifyOverlay` global component via `routerHook`, injects Steam Main Menu item via `registerSteamMenu`, registers global STEAM+D-Pad chords, `track_metadata` toasts, and `GameSessions` lifetime listener.

**Backend Plugin Entry:**
- Location: `main.py` (`Plugin._main`)
- Triggers: Instantiated by Decky Loader Python runtime (`plugin_loader`).
- Responsibilities: Strips `LD_LIBRARY_PATH`, loads persisted settings/tokens, starts `SuspendResumeMonitor`, `VoiceActivityDetector`, `DockAudioSwitcher`, `SessionBookmarkManager`, and `LibrespotEventServer`, starts Spotify API polling loop if authenticated, syncs native Spotify folders, launches `librespot`, and applies initial EQ preset.

## Architectural Constraints

- **Content Security Policy (CSP):** Steam GamepadUI CEF blocks external HTTPS images (`https://i.scdn.co/`). All remote artwork must be proxied to Base64 Data URIs via `py_modules/images.py`.
- **GamepadUI Spatial Navigation:** Horizontal button groups must use `flow-children="horizontal"` rather than `"row"` to prevent vertical focus jumps.
- **Process Environment Isolation:** Decky Loader's PyInstaller bundle injects `LD_LIBRARY_PATH` that breaks system binaries (`openssl`, `librespot`, `pactl`, `pw-cli`). `os.environ.pop("LD_LIBRARY_PATH", None)` at `main.py:27` is mandatory before spawning subprocesses.
- **Decky `__name__` Sandbox:** Decky executes `main.py` with `__name__ == "_"`; `sys.modules.get(__name__)` (`main.py:50`) must be used instead of `sys.modules[__name__]`.
- **PipeWire UI Stream & Virtual Sink Isolation:** `steamwebhelper` / `"Chromium"` sink-inputs carry Steam UI sounds and `deckify_eq_sink` is a virtual filter-chain sink; `py_modules/volume.py`, `py_modules/engine.py`, and `py_modules/dock.py` must ignore them appropriately to avoid muting SteamOS click sounds or creating routing loops.
- **Spotify Rate Limiting:** Continuous polling is restricted to `me/player` in `_poll_api_loop` (relaxed to 20s when `--onevent` socket events are active); heavy library/discovery/queue/recent endpoints are fetched on demand.

## Anti-Patterns

### Rendering External Image URLs Directly

**What happens:** Passing `https://i.scdn.co/...` directly to `<img src={url} />`.
**Why it's wrong:** SteamOS CEF CSP silently blocks the request, resulting in broken artwork across GamepadUI.
**Do this instead:** Always render artwork through `<DeckifyImage src={url} />` (`src/components/common/DeckifyImage.tsx`).

### Modifying `bin/py_modules` or Reading `sys.modules[__name__]`

**What happens:** Placing duplicate modules under `bin/` or indexing `sys.modules[__name__]` directly.
**Why it's wrong:** `main.py:32` prepends `bin/` to `sys.path` (shadowing `py_modules/`), and Decky's `__name__ == "_"` causes `KeyError`.
**Do this instead:** Keep all Python modules in `py_modules/` and use `sys.modules.get(__name__)` (`main.py:50`).

## Error Handling

**Strategy:** Fail-safe structured responses (`{"ok": False, "error": "..."}`) on backend RPCs and non-blocking `toaster.toast` notifications on frontend.

**Patterns:**
- Backend RPC methods wrap network (`urllib.error.HTTPError`) and subprocess calls in `try/except`, logging via `decky.logger` and returning `{"ok": False, "error": ...}` (`py_modules/rpc_playback.py`, `py_modules/rpc_library.py`).
- Frontend `callable` invocations wrap calls in `try/catch`, fall back to safe empty arrays/default state, and surface user-facing errors with `toaster.toast`.

## Cross-Cutting Concerns

**Logging:** Backend uses `decky.logger` (`py_modules/common.py` provides a fallback logger for standalone/test runs) and redacts tokens/secrets (`main.py:149-150`). Frontend uses `console.log`/`console.warn`/`console.debug`.
**Validation:** Input sanitization and bounds checking in backend modules (e.g., `validate_app_id` and `_clean_uri` in `py_modules/soundtrack.py`, URL host validation in `py_modules/images.py`, `clamp_eq_bands` and `_is_valid_sink_name` in `py_modules/equalizer.py`, `_sanitize_pinned_playlists` in `py_modules/common.py`, `max(0, min(100, int(volume_percent)))` in `py_modules/volume.py`).
**Authentication:** Spotify OAuth 2.0 Authorization Code with PKCE (`py_modules/auth.py`, `main.py:1161-1503`) served over an embedded TLS HTTP server (`OAUTH_SERVER_PORT`) with QR code pairing in `src/index.tsx`.

---

*Architecture analysis: 2026-11-18*
