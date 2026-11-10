<!-- GSD:project-start source:PROJECT.md -->

## Project

**Deckify**

Deckify is an open-source Spotify client and Decky Loader plugin for Valve's Steam Deck. It allows users to control Spotify playback directly inside SteamOS GamepadUI with controller navigation, Quick Access Menu controls, an overlay HUD, and a full-screen modal for browsing playlists, albums, artists, library, and podcasts.

**Core Value:** Rock-solid Spotify playback and responsive, reliable controller navigation on Steam Deck without UI lag, broken images, or desynchronized playback states.

### Constraints

- **Steam CEF Content Security Policy**: Steam GamepadUI blocks direct external image URLs (`https://i.scdn.co/`), requiring internal proxying/base64 encoding.
- **SteamOS GamepadUI Navigation**: Controller focus relies on spatial navigation (`flow-children`, `@decky/ui`); focus traps or navigation loss degrade user experience.
- **Steam Deck Environment**: Runs in the `deck` user space (UID 1000) under SteamOS 3.5+.

<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->

## Technology Stack

## Languages

- TypeScript 5.9.3 - Frontend Decky plugin UI components (`src/index.tsx`, `src/components/DeckifyExpandedModal.tsx`, `src/components/DeckifyOverlay.tsx`, `src/types.ts`)
- Python 3.11+ / 3.14 - Backend daemon and Decky RPC server (`main.py`, `py_modules/*.py`)
- Shell (Bash) - Deployment, installation, and daemon lifecycle scripts (`deploy.sh`, `install.sh`)
- HTML/CSS - Web landing page, HUD styling, and Steam Quick Access Menu styling (`site/index.html`, inline emotion/CSS styles in React components)

## Runtime

- Node.js (v20+ recommended for development and Rollup bundling)
- Python 3.11+ runtime on SteamOS 3.5 / 3.7+ (Decky Loader environment)
- SteamOS GamepadUI Chromium Embedded Framework (CEF) for UI rendering
- pnpm (configured with peer dependency rules ignoring unbundled React/React-DOM in `package.json`)
- Lockfile: `pnpm-lock.yaml` (root)

## Frameworks

- React 19.x (`@types/react: 19.2.14`, `@types/react-dom: 19.2.3`) - Frontend UI library loaded via Decky Loader global environment
- `@decky/ui` (4.11.1) - Official SteamOS / Decky UI components (ModalRoot, Focusable, QuickAccessMenu, Dropdown, ToggleField, etc.)
- `@decky/api` (1.1.3) - Decky frontend-to-backend RPC communication bridge (`callable`, `ServerAPI`)
- Vitest 5.1.0 - Frontend unit and integration test runner (`src/utils.test.ts`)
- Python `unittest` standard library - Comprehensive backend test suite (316 tests across `tests/test_*.py`)
- Python `coverage` / `@vitest/coverage-v8` - Code coverage measurement tools
- Rollup 4.59.0 with `@decky/rollup` (1.0.2) - Compiles TypeScript/TSX into single ESM bundle `dist/index.js`
- ESLint 10.0.1 with `typescript-eslint` (8.56.0) and `eslint-plugin-react-hooks` (7.0.1) - Linting and static analysis (`eslint.config.js`)
- Husky 9.1.7 with `lint-staged` (16.2.7) - Pre-commit validation gates (`.husky/pre-commit`)

## Key Dependencies

- `@decky/api` 1.1.3 - Communication bridge between frontend React UI and Python backend (`call_plugin_method`)
- `@decky/ui` 4.11.1 - Steam Deck GamepadUI styling, D-pad navigation, and modal rendering
- `librespot` / `spotifyd` - Open-source Spotify Connect engines providing headless Spotify playback on SteamOS
- `py_modules/spotify.py` - Custom Python Spotify Web API and LRCLIB lyrics client
- `py_modules/images.py` - Local base64 image caching proxy resolving Steam CEF Content Security Policy restrictions
- `react-icons` 5.5.0 - SVG icons for playback controls, library tabs, and action menus
- `qrcode.react` 4.2.0 - QR code generation for Spotify mobile auth
- `tslib` 2.8.1 - TypeScript runtime helper library

## Configuration

- Steam Deck user environment (`deck` user, UID 1000)
- Settings stored in `~/.config/deckify/settings.json` (or `/home/deck/homebrew/settings/deckify/settings.json`)
- Image cache stored in `~/.cache/deckify/images/`
- PulseAudio / PipeWire volume control (`pactl` commands in `main.py`)
- Rollup config: `@decky/rollup` via `package.json` build script
- TypeScript config: `tsconfig.json` targeting ESNext with React JSX
- ESLint config: `eslint.config.js` with TypeScript ESLint configurations

## Platform Requirements

- Node.js 20+, pnpm 9+, Python 3.10+
- OS: Linux, macOS, or Windows (WSL / PowerShell)
- Valve Steam Deck or SteamOS-based Steam Machine
- SteamOS 3.5+ with Decky Loader installed
- Spotify Premium account (required for Spotify Connect engines)

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

## Naming Patterns

- React components: PascalCase (e.g., `DeckifyExpandedModal.tsx`, `DeckifyOverlay.tsx`)
- TypeScript helpers and types: camelCase (e.g., `types.ts`, `utils.test.ts`)
- Python backend modules: snake_case (e.g., `main.py`, `spotify.py`, `images.py`)
- Test files: Prefix `test_` for Python (`tests/test_features.py`); suffix `.test.ts` for Vitest (`src/utils.test.ts`)
- TypeScript: camelCase (e.g., `formatDuration`, `fetchImageAsBase64`, `handleGamepadAction`)
- Python: snake_case (e.g., `get_player_state`, `toggle_like_track`, `_fetch_lyrics_sync`)
- Private/Internal Python functions: Prefixed with an underscore `_` (e.g., `_load_settings`, `_make_spotify_request`)
- TypeScript: camelCase (e.g., `currentPositionMs`, `isLiked`, `focusedTrackRef`)
- Python: snake_case (e.g., `access_token`, `cache_dir`, `process_env`)
- Global constants: UPPER_SNAKE_CASE (e.g., `SETTINGS_FILE`, `DEFAULT_CLIENT_ID`)
- TypeScript interfaces & types: PascalCase (e.g., `Track`, `Playlist`, `Album`, `PlaybackState`)

## Code Style

- Indentation: 2 spaces for TypeScript/TSX, 4 spaces for Python
- Semicolons: Always used in TypeScript
- Quotes: Double quotes or consistent single quotes in TypeScript; double quotes preferred in Python
- Tool: ESLint 10 with flat configuration (`eslint.config.js`)
- Plugins: `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`
- Pre-commit hook: Executed automatically via Husky and `lint-staged`

## Import Organization

## Error Handling

- RPC methods must never crash the main event loop. All external network operations and system calls are wrapped in `try/except` blocks.
- Expected errors return a structured response dictionary:
- Resilient signatures: Functions interfacing with variable caller parameters accept `*args, **kwargs` to avoid `TypeError` on upstream signature changes.
- Async RPC calls wrapped in `try/catch`.
- Failures trigger user notifications using the Decky toaster API (`toaster.toast({ title: "Deckify", body: "Failed to perform action", duration: 3000 })`).
- Fallback states: Empty lists `[]` or default state objects returned on network failure to avoid React rendering crashes.

## Logging

- Backend: `decky.logger.info()` and `decky.logger.error()`
- Frontend: `console.log()` and `console.error()`
- Log error messages with context (e.g., `decky.logger.error(f"Failed to fetch lyrics for {track_id}: {e}")`).
- Avoid logging sensitive user authentication tokens or authorization headers.

## Comments

- Workarounds for SteamOS or GamepadUI specific quirks (e.g., CSP image restrictions, `flow-children` horizontal navigation, `LD_LIBRARY_PATH` stripping).
- Complex algorithmic logic or token refresh calculations.
- Used for shared interface definitions in `src/types.ts`.

## Function Design

- Modular functions adhering to single-responsibility principles. Large React components broken into sub-components or render functions for each tab.
- Named parameter objects in TypeScript for functions with multiple options.
- Keyword arguments with sensible defaults in Python.

## Module Design

- Default export for the primary plugin entry point in `src/index.tsx`.
- Named exports for reusable types and utilities in `src/types.ts`.
- Package exports managed cleanly in `py_modules/__init__.py`.

<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

## System Overview

```text

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

- **Decoupled Frontend/Backend:** React frontend communicates with Python backend exclusively through typed asynchronous Decky RPC methods.
- **CSP Bypass Proxy:** Steam CEF strictly disallows external images from CDNs like `https://i.scdn.co/`; backend proxies and caches covers as Base64 Data URIs (`data:image/jpeg;base64,...`).
- **Focus & Controller Navigation:** UI leverages `@decky/ui` spatial navigation primitives with strict focus trapping for sub-menus and horizontal layout groups (`flow-children="horizontal"`).

## Layers

- Purpose: Render accessible controls within SteamOS GamepadUI.
- Location: `src/`, `src/components/`
- Contains: React components, styled elements, gamepad input event listeners.
- Depends on: `@decky/ui`, `@decky/api`, `react-icons`.
- Used by: Steam Deck GamepadUI renderer.
- Purpose: Serialize and deserialize method calls between browser JS environment and host Python runtime.
- Location: Provided by Decky Loader runtime (`plugin_loader`).
- Depends on: Local WebSocket / Unix domain socket.
- Purpose: Business logic, external API integrations, process supervision, audio sink control.
- Location: `main.py`, `py_modules/`
- Contains: Asynchronous Python functions, HTTP clients, process managers.
- Depends on: Python standard library, system tools (`pactl`, `librespot`).
- Purpose: Audio output playback and volume control.
- Location: Host SteamOS kernel, PipeWire / PulseAudio daemon.

## Data Flow

### Primary Request Path (Playback State Synchronization)

### Image Retrieval Flow (CSP Proxy)

- Component-level React `useState` and `useRef` for UI state, tab navigation, and focus tracking.
- Backend memory cache for volatile data (e.g., liked track status TTL cache).
- File-based persistence in `~/.config/deckify/settings.json` for persistent user preferences.

## Key Abstractions

- Purpose: Transparent wrapper around `<img>` that automatically resolves Spotify CDN URLs through the backend base64 proxy with in-memory caching.
- Examples: `src/components/DeckifyExpandedModal.tsx`
- Pattern: Higher-Order / Proxy Component.
- Purpose: Abstraction over Spotify Web API handling rate-limiting, error handling, token refresh, and endpoint fallbacks.
- Examples: `py_modules/spotify.py`
- Pattern: Gateway / API Wrapper.

## Entry Points

- Location: `src/index.tsx:definePlugin`
- Triggers: Loaded by Decky Loader when Steam Deck boots into GamepadUI.
- Responsibilities: Registers Quick Access Menu content, registers global gamepad quick chords (STEAM/QAM + D-Pad), mounts overlay wrapper.
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

### Polling Library Endpoints Continuously

## Error Handling

- Backend API methods catch exceptions and return structured `{ "success": false, "error": str(e) }` objects rather than throwing unhandled exceptions.
- HTTP requests utilize timeout bounds (typically 5 to 10 seconds) to prevent hanging the RPC event loop.
- Frontend displays friendly Decky toasts (`toaster.toast`) when actions fail.

## Cross-Cutting Concerns

<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.agents/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-fast` for a trivial task inline, with no subagents and no PLAN.md
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
