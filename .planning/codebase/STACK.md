---
last_mapped_commit: 10018cbc1c9d1d294640d8866b3902ca56bcd816
last_mapped_at: 2026-11-14
---
# Technology Stack

**Analysis Date:** 2026-11-14

## Languages

**Primary:**
- TypeScript 5.9.3 - Frontend Decky plugin UI, hooks, utilities, and Vitest tests (`src/index.tsx`, `src/components/`, `src/hooks/`, `src/utils/`)
- Python 3.11+ - Backend Decky RPC server, Spotify/lyrics HTTP clients, process/audio managers, and unit tests (`main.py`, `py_modules/*.py`, `tests/test_*.py`)

**Secondary:**
- Bash / POSIX Shell - Deployment, installation, and uninstallation scripts (`deploy.sh`, `install.sh`, `uninstall.sh`)
- HTML/CSS - Static landing page (`site/index.html`) and inline React styles in UI components (`src/components/`)

## Runtime

**Environment:**
- Node.js 20+ (used for development, Rollup bundling, ESLint, TypeScript typechecking, and Vitest in `.github/workflows/ci.yml`)
- Python 3.11+ (3.11 targeted in CI; 3.14 bytecode observed locally) running inside Decky Loader's `plugin_loader` service on SteamOS 3.5+
- SteamOS GamepadUI Chromium Embedded Framework (CEF) for frontend React rendering
- Linux `deck` user space (UID 1000) with PulseAudio / PipeWire (`pactl`) and systemd (`systemctl`, `busctl`)

**Package Manager:**
- pnpm 9+ (configured in `.github/workflows/ci.yml` and `package.json` with `pnpm.peerDependencyRules.ignoreMissing` for `react` and `react-dom`)
- Lockfile: `pnpm-lock.yaml` (present)
- Python dependencies: Zero third-party PyPI packages; uses Python standard library only (`asyncio`, `urllib`, `ssl`, `json`, `subprocess`, `sqlite3`-free, `struct`, `zlib`)

## Frameworks

**Core:**
- React 19.x (`@types/react: 19.2.14`, `@types/react-dom: 19.2.3`) - Frontend UI library provided at runtime by Decky Loader's global environment
- `@decky/ui` 4.11.1 - SteamOS / Decky UI components (`ModalRoot`, `Focusable`, `PanelSection`, `Dropdown`, `ToggleField`, `SliderField`, etc.)
- `@decky/api` 1.1.3 - Frontend-to-backend RPC bridge (`callable`, `toaster`, `addEventListener`, `routerHook`)

**Testing:**
- Vitest 5.1.0 - Frontend unit and component test runner (`pnpm test`, `src/**/*.test.{ts,tsx}`)
- `@vitest/coverage-v8` 5.1.0 - Frontend code coverage reporting (`pnpm run test:coverage`)
- Python `unittest` (stdlib) - Backend test suite (`tests/test_*.py`, run via `python -m unittest discover -s tests -p "test_*.py"`)
- Python `coverage` - Backend coverage reporting configured in `.coveragerc` (`source = py_modules, main`)

**Build/Dev:**
- Rollup 4.59.0 with `@decky/rollup` 1.0.2 - Bundles `src/index.tsx` into `dist/index.js` (`rollup.config.js`)
- TypeScript 5.9.3 - Strict typechecking (`tsconfig.json`: `target: "ES2020"`, `module: "ESNext"`, `jsx: "react-jsx"`, `strict: true`)
- ESLint 10.0.1 with `@eslint/js` 10.0.1, `typescript-eslint` 8.56.0, `eslint-plugin-react-hooks` 7.0.1 (`eslint.config.js`)
- Husky 9.1.7 + `lint-staged` 16.2.7 - Pre-commit gate running ESLint, `tsc --noEmit`, Vitest, Rollup build, and Python `unittest` (`.husky/pre-commit`)

## Key Dependencies

**Critical:**
- `@decky/api` ^1.1.3 - Typed RPC communication between Steam CEF frontend and Python backend
- `react-icons` ^5.5.0 - SVG icon library for playback controls, tabs, and action modals
- `qrcode.react` ^4.2.0 - QR code rendering for mobile Spotify OAuth login flow
- `tslib` ^2.8.1 - TypeScript runtime helpers

**Audio Engines (External Binaries / Host Apps):**
- `librespot` v0.8.0 - Open-source Rust Spotify Connect daemon, compiled from `librespot-org/librespot` with `--features "pulseaudio-backend,with-libmdns,native-tls"` in `.github/workflows/release.yml` and bundled at `bin/librespot`
- Spotify Desktop Client Flatpak (`com.spotify.Client`) - Optional alternate audio backend supporting lossless quality, controlled via Chrome DevTools Protocol (`SPOTIFY_CDP_PORT = 9229`) and preferences file (`py_modules/engine.py`)

**Infrastructure:**
- `pactl` (PulseAudio / PipeWire CLI) - Audio sink discovery, sink-input stream inspection, and volume/ducking control (`py_modules/engine.py`, `py_modules/volume.py`)
- `openssl` CLI - Generates self-signed RSA-2048 X.509 certificates for the local OAuth callback HTTPS server (`py_modules/device.py`)
- `busctl` / `systemctl` - Monitors `org.freedesktop.login1` `PrepareForSleep` suspend/resume signals and handles sleep-timer shutdown (`py_modules/device.py`)

## Configuration

**Environment:**
- Plugin metadata & permissions: `plugin.json` (`api_version: 1`, `flags: ["_root"]`)
- Persistent user settings: `SETTINGS_FILE` at `{DECKY_PLUGIN_SETTINGS_DIR}/settings.json` (fallback `/home/deck/homebrew/settings/Deckify/settings.json`), managed by `_load_settings()` / `_save_settings()` in `py_modules/common.py`
- Runtime artifacts & cache: `DECKY_PLUGIN_RUNTIME_DIR` (`/home/deck/homebrew/data/Deckify`) storing `cache/images/`, `librespot.pid`, `spotify_client.pid`, `cert.pem`, and `key.pem`
- Process environment isolation: `os.environ.pop("LD_LIBRARY_PATH", None)` in `py_modules/common.py` strips Decky Loader's bundled PyInstaller libraries before spawning `librespot` or `openssl`
- Spotify Flatpak paths: `~/.var/app/com.spotify.Client/config/spotify` and `~/.var/app/com.spotify.Client/cache/spotify` (`py_modules/common.py`)
- Steam library discovery: Reads Steam `libraryfolders.vdf`, `appmanifest_*.acf`, and `shortcuts.vdf` under `DECK_HOME` (`py_modules/vdf_parser.py`)

**Build:**
- `package.json` - Scripts (`build`, `watch`, `lint`, `typecheck`, `test`, `test:python`, `test:coverage`)
- `rollup.config.js` - `@decky/rollup` plugin bundler config
- `tsconfig.json` - TypeScript compiler options (`outDir: "dist"`, `include: ["src"]`)
- `eslint.config.js` - Flat ESLint config enforcing React Hooks rules, complexity (`<= 15`), max-depth (`<= 4`), and max-lines-per-function (`<= 80`)
- `.coveragerc` - Coverage scope for Python unit tests

## Platform Requirements

**Development:**
- Node.js 20+, pnpm 9+, Python 3.11+
- SSH key access to a Steam Deck (optional, used by `deploy.sh`)

**Production:**
- Valve Steam Deck (or SteamOS 3.5+ device) with Decky Loader installed
- Spotify Premium account (required for Spotify Connect `librespot` and Web API playback control)
- `pactl`, `openssl`, and `busctl` available on host SteamOS

---

*Stack analysis: 2026-11-14*
