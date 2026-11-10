---
last_mapped_commit: a61bbf8da7ad74d4ba42198f0c3841b6ef17f7f8
last_mapped_at: 2026-11-10
---
<!-- refreshed: 2026-11-10 -->
# Architecture

**Analysis Date:** 2026-11-10

## System Overview

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                       SteamOS GamepadUI (Chromium CEF)                      │
├──────────────────────────┬──────────────────────────┬───────────────────────┤
│  Quick Access Menu (QAM) │   Expanded Modal View    │    In-Game HUD Overlay│
│     `src/index.tsx`      │`src/components/...Modal` │`src/components/Overlay`│
└────────────┬─────────────┴────────────┬─────────────┴───────────┬───────────┘
             │                          │                         │
             ▼                          ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Frontend Bridge & Controller Navigation                  │
│       `@decky/api` (`callable`), Gamepad Hook & Event Dispatchers           │
└───────────────────────────────────────┬─────────────────────────────────────┘
                                        │ (WebSocket / IPC)
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Decky Plugin Daemon (`main.py`)                       │
│    `Plugin` Class: RPC Handlers, Volume Watchdog, Event Emitter             │
└───────┬───────────────────────────────┬─────────────────────────────┬───────┘
        │                               │                             │
        ▼                               ▼                             ▼
┌──────────────────┐          ┌──────────────────┐          ┌─────────────────┐
│ `py_modules/`    │          │ `py_modules/`    │          │  Audio/Engine   │
│   `spotify.py`   │          │   `images.py`    │          │  `engine.py`    │
│ Web API & LRCLIB │          │ Base64 CSP Proxy │          │ librespot/PipeW │
└───────┬──────────┘          └────────┬─────────┘          └────────┬────────┘
        │                              │                             │
        ▼                              ▼                             ▼
┌──────────────────┐          ┌──────────────────┐          ┌─────────────────┐
│ Spotify Cloud &  │          │ `~/.cache/`      │          │ PipeWire/ALSA   │
│ LRCLIB Endpoints │          │ Local Disk Cache │          │ Steam Deck Audio│
└──────────────────┘          └──────────────────┘          └─────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| `Plugin` (Backend) | Central RPC router exposing methods to frontend, engine management, volume polling | `main.py` |
| `QuickAccessMenu` | Sidebar UI in Steam QAM for mini playback control and quick settings | `src/index.tsx` |
| `DeckifyExpandedModal` | Full-screen modal for browsing playlists, albums, podcasts, queue, lyrics, and settings | `src/components/DeckifyExpandedModal.tsx` |
| `DeckifyOverlay` | Transparent in-game HUD overlay displaying current song and artist | `src/components/DeckifyOverlay.tsx` |
| `SpotifyClient` | HTTP requests to Spotify Web API, OAuth PKCE token lifecycle, LRCLIB lyrics lookup | `py_modules/spotify.py` |
| `ImageService` | Downloads cover art and converts to base64 data URIs to bypass Steam CEF CSP restrictions | `py_modules/images.py` |
| `EngineManager` | Spawns, monitors, and terminates `librespot` or `spotifyd` background processes | `py_modules/engine.py` |
| `DeviceManager` | Discovers audio output sinks and handles Spotify Connect target switching | `py_modules/device.py` |
| `SettingsManager` | Atomic load and save of persistent user preferences | `py_modules/common.py` |

## Pattern Overview

**Overall:** Client-Server Plugin Architecture with Asynchronous RPC and Event-Driven State Synchronization.

**Key Characteristics:**
- **Decoupled Frontend/Backend:** React frontend communicates with Python backend exclusively through typed asynchronous Decky RPC methods.
- **CSP Bypass Proxy:** Steam CEF strictly disallows external images from CDNs like `https://i.scdn.co/`; backend proxies and caches covers as Base64 Data URIs (`data:image/jpeg;base64,...`).
- **Focus & Controller Navigation:** UI leverages `@decky/ui` spatial navigation primitives with strict focus trapping for sub-menus and horizontal layout groups (`flow-children="horizontal"`).

## Layers

**UI Presentation Layer:**
- Purpose: Render accessible controls within SteamOS GamepadUI.
- Location: `src/`, `src/components/`
- Contains: React components, styled elements, gamepad input event listeners.
- Depends on: `@decky/ui`, `@decky/api`, `react-icons`.
- Used by: Steam Deck GamepadUI renderer.

**RPC Bridge Layer:**
- Purpose: Serialize and deserialize method calls between browser JS environment and host Python runtime.
- Location: Provided by Decky Loader runtime (`plugin_loader`).
- Depends on: Local WebSocket / Unix domain socket.

**Backend Service Layer:**
- Purpose: Business logic, external API integrations, process supervision, audio sink control.
- Location: `main.py`, `py_modules/`
- Contains: Asynchronous Python functions, HTTP clients, process managers.
- Depends on: Python standard library, system tools (`pactl`, `librespot`).

**Hardware & Audio Layer:**
- Purpose: Audio output playback and volume control.
- Location: Host SteamOS kernel, PipeWire / PulseAudio daemon.

## Data Flow

### Primary Request Path (Playback State Synchronization)

1. Frontend initiates playback state request or polls on 1000ms ticker (`src/components/DeckifyExpandedModal.tsx`)
2. `callable("get_player_state")` sends JSON-RPC to Python backend (`main.py:get_player_state`)
3. Backend checks token validity, refreshes if needed, and calls Spotify Web API `me/player` (`py_modules/spotify.py:get_playback_state`)
4. Backend formats response payload, decorates with cached like status and base64 cover art, and returns JSON to frontend
5. Frontend updates React state and renders current track info, album cover, and progress bar

### Image Retrieval Flow (CSP Proxy)

1. React component requires cover art for track/playlist (`DeckifyImage` in `src/components/DeckifyExpandedModal.tsx`)
2. `DeckifyImage` checks in-memory `imageCache` map; if missing, calls `callable("get_image", { url })`
3. Backend `py_modules/images.py` checks `~/.cache/deckify/images/<sha1>` on disk
4. If missing, downloads image from Spotify CDN, saves to disk, and encodes as `data:<mime>;base64,<encoded>`
5. Frontend receives data URI, caches it in memory, and renders `<img src={dataUri} />`

**State Management:**
- Component-level React `useState` and `useRef` for UI state, tab navigation, and focus tracking.
- Backend memory cache for volatile data (e.g., liked track status TTL cache).
- File-based persistence in `~/.config/deckify/settings.json` for persistent user preferences.

## Key Abstractions

**`DeckifyImage`:**
- Purpose: Transparent wrapper around `<img>` that automatically resolves Spotify CDN URLs through the backend base64 proxy with in-memory caching.
- Examples: `src/components/DeckifyExpandedModal.tsx`
- Pattern: Higher-Order / Proxy Component.

**`SpotifyClient`:**
- Purpose: Abstraction over Spotify Web API handling rate-limiting, error handling, token refresh, and endpoint fallbacks.
- Examples: `py_modules/spotify.py`
- Pattern: Gateway / API Wrapper.

## Entry Points

**Frontend Plugin Entry Point:**
- Location: `src/index.tsx:definePlugin`
- Triggers: Loaded by Decky Loader when Steam Deck boots into GamepadUI.
- Responsibilities: Registers Quick Access Menu content, registers global gamepad quick chords (STEAM/QAM + D-Pad), mounts overlay wrapper.

**Backend Daemon Entry Point:**
- Location: `main.py:Plugin`
- Triggers: Instantiated by Decky Loader Python runtime (`plugin_loader`).
- Responsibilities: Initializes settings, clears incompatible `LD_LIBRARY_PATH`, starts background supervision tasks, handles RPC commands.

## Architectural Constraints

- **Content Security Policy (CSP):** Steam GamepadUI CEF enforces strict CSP preventing external HTTP/HTTPS image sources. All images must be delivered as Base64 Data URIs.
- **D-Pad Spatial Navigation:** SteamOS GamepadUI uses spatial navigation. Containers with horizontal buttons MUST use `flow-children="horizontal"`; using `flow-children="row"` causes vertical focus jumps.
- **Process Environment Isolation:** Decky Loader's bundled Python libraries conflict with SteamOS system libraries. `os.environ.pop("LD_LIBRARY_PATH", None)` is mandatory in `main.py` before launching any subprocess.
- **Rate Limiting:** Spotify Web API aggressively returns HTTP 429 when polled frequently. Continuous polling of heavy endpoints (recently played, library, queue) must be avoided; polling is strictly restricted to current playback state.

## Anti-Patterns

### Using External Image URLs Directly in CEF

**What happens:** Placing `<img src="https://i.scdn.co/..." />` directly in React components.
**Why it's wrong:** Steam GamepadUI CEF blocks the request with a CSP violation, resulting in broken image icons.
**Do this instead:** Use `DeckifyImage` component with backend `get_image` RPC returning `data:...;base64,...`.

### Polling Library Endpoints Continuously

**What happens:** Polling `loadRecent`, `loadQueue`, or `loadLibrary` inside a `setInterval`.
**Why it's wrong:** Spotify returns HTTP 429 Too Many Requests, blocking all API calls across the entire plugin.
**Do this instead:** Load library and recent tracks only once on tab activation or manual refresh.

## Error Handling

**Strategy:** Graceful degradation with fallback responses and UI notifications.

**Patterns:**
- Backend API methods catch exceptions and return structured `{ "success": false, "error": str(e) }` objects rather than throwing unhandled exceptions.
- HTTP requests utilize timeout bounds (typically 5 to 10 seconds) to prevent hanging the RPC event loop.
- Frontend displays friendly Decky toasts (`toaster.toast`) when actions fail.

## Cross-Cutting Concerns

**Logging:** Decky standard logging (`decky.logger.info` / `error`) in backend; `console.log` / `console.error` in frontend.
**Validation:** Parameter sanitization for music search queries and track IDs before dispatching HTTP calls.
**Authentication:** Automatic PKCE OAuth token refresh before any authenticated Spotify request.

---

*Architecture analysis: 2026-11-10*
