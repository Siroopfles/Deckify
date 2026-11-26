---
last_mapped_commit: fe07cd341a56729b429c29bc0d0dd2c6770a2eb2
last_mapped_at: 2026-11-26
---
</System Prompt>
<Technology Stack>
**Analysis Date:** 2026-11-26

## Languages

**Primary:**
- TypeScript `^5.9.3` - Frontend Decky Loader plugin UI, hooks, and utilities (`src/index.tsx`, `src/components/`, `src/hooks/`, `src/utils/`, `src/types.ts`)
- Python 3.11+ (stdlib-only, no third-party PyPI packages) - Backend Decky plugin daemon, RPC handlers, Spotify API client, MPRIS D-Bus server, CDP bridge, PipeWire EQ, and hidraw/evdev input watcher (`main.py`, `py_modules/*.py`)

**Secondary:**
- Shell (POSIX `sh` / `bash`) - Installation, uninstallation, dev deployment, and `librespot` event hook emitter (`install.sh`, `uninstall.sh`, `deploy.sh`, `py_modules/resilience.py`)
- HTML/CSS - Static landing page (`site/index.html`) and inline React/Emotion styles in UI components (`src/components/`)

## Runtime

**Environment:**
- Decky Loader (`plugin_loader`) Python 3.11+ runtime on SteamOS 3.5+ (`main.py`, `decky.pyi`, `plugin.json` with `api_version: 1` and `_root` flag)
- SteamOS GamepadUI Chromium Embedded Framework (CEF) for frontend React rendering
- Node.js 20+ (development and CI build environment in `.github/workflows/ci.yml` and `.github/workflows/release.yml`)

**Package Manager:**
- `pnpm` 9 (configured with `pnpm.peerDependencyRules.ignoreMissing` for `react` and `react-dom` in `package.json`)
- Lockfile: `pnpm-lock.yaml` (present)
- Python dependencies: None (`requirements.txt` / `pyproject.toml` absent; backend relies exclusively on Python standard library + system binaries)

## Frameworks

**Core:**
- React 19.x (`@types/react: 19.2.14`, `@types/react-dom: 19.2.3`) - UI library provided at runtime by Decky Loader / SteamOS CEF
- `@decky/ui` `^4.11.1` - SteamOS GamepadUI components (`ModalRoot`, `Focusable`, `PanelSection`, `Dropdown`, `ToggleField`, `SliderField`, `toaster`)
- `@decky/api` `^1.1.3` - Frontend-to-backend Decky RPC bridge (`callable`, `addEventListener`, `definePlugin`)

**Testing:**
- Vitest `^5.1.0` with `@vitest/coverage-v8` `^5.1.0` - Frontend unit and component tests (`src/**/*.test.ts`, `src/**/*.test.tsx`)
- Python `unittest` (stdlib) + `coverage` (`.coveragerc`) - Backend unit and integration tests (`tests/test_*.py`)

**Build/Dev:**
- Rollup `^4.59.0` with `@decky/rollup` `^1.0.2` (`rollup.config.js`) - Bundles `src/index.tsx` into `dist/index.js`
- ESLint `^10.0.1` with `@eslint/js` `^10.0.1`, `typescript-eslint` `^8.56.0`, `eslint-plugin-react-hooks` `^7.0.1` (`eslint.config.js`)
- Husky `^9.1.7` and `lint-staged` `^16.2.7` (`.husky/pre-commit`, `package.json`) - Pre-commit gates running `eslint`, `tsc --noEmit`, `vitest run`, `rollup -c`, and `python3 -m unittest`

## Key Dependencies

**Critical:**
- `@decky/api` `^1.1.3` - Typed RPC communication with Python backend (`src/index.tsx`)
- `react-icons` `^5.5.0` - SVG icon set for playback controls, tabs, and action modals (`src/components/`)
- `qrcode.react` `^4.2.0` - QR code rendering for Spotify PKCE mobile auth and Spotify Jam links (`src/components/common/JamQrModal.tsx`, `src/components/tabs/SettingsTab.tsx`)
- `tslib` `^2.8.1` - TypeScript runtime helpers
- `librespot` `v0.8.0` - Embedded Rust Spotify Connect daemon compiled from source in `.github/workflows/release.yml` with `--features "pulseaudio-backend,with-libmdns,native-tls"` and packaged at `bin/librespot`

**Infrastructure:**
- System Linux tools invoked by `main.py` and `py_modules/*.py`: `pactl` (PulseAudio/PipeWire volume & sink routing), `pw-cli` / `pipewire` (10-band LADSPA filter-chain EQ in `py_modules/equalizer.py`), `flatpak` (Official Spotify Linux Client `com.spotify.Client` in `py_modules/engine.py`), `openssl` (self-signed TLS cert generation for OAuth callback server in `main.py`), `curl` (used by `py_modules/resilience.py` onevent emitter and `install.sh`)

## Configuration

**Environment:**
- No `.env` files are used in the repository
- Runtime paths resolved dynamically via `decky` module and `pwd.getpwnam` in `py_modules/common.py`:
  - `DECKY_PLUGIN_SETTINGS_DIR/settings.json` (persistent plugin settings, OAuth tokens, game audio profiles, chord bindings)
  - `DECKY_PLUGIN_RUNTIME_DIR` (PID files, `onevent.sock`, `librespot-event.sh`, `cert.pem`/`key.pem`, `session_bookmark.json`, image `cache/`)
  - `PULSE_SERVER=unix:/run/user/{uid}/pulse/native`, `DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/{uid}/bus`, `XDG_RUNTIME_DIR=/run/user/{uid}`
- `LD_LIBRARY_PATH` is explicitly stripped (`os.environ.pop("LD_LIBRARY_PATH", None)`) in `main.py` and `py_modules/common.py` so Decky's PyInstaller libraries do not break system binaries (`librespot`, `openssl`, `pactl`)

**Build:**
- `tsconfig.json` - Strict TypeScript (`strict: true`, `target: ES2020`, `module: ESNext`, `jsx: react-jsx`)
- `rollup.config.js` - Uses `@decky/rollup` default plugin configuration
- `eslint.config.js` - Flat config enforcing `react-hooks/rules-of-hooks`, complexity `<= 15`, max-depth `<= 4`, max-lines-per-function `<= 80`, max-params `<= 4`
- `.coveragerc` - Measures Python coverage across `py_modules` and `main`
- `plugin.json` - Decky plugin manifest (`name: "Deckify"`, `flags: ["_root"]`, `api_version: 1`)

## Platform Requirements

**Development:**
- Node.js 20+, `pnpm` 9+, Python 3.11+
- Optional SSH key access to Steam Deck / Steam Machine for `./deploy.sh` (reads defaults from `.vscode/settings.json`)

**Production:**
- Valve Steam Deck or SteamOS-based Steam Machine (`deck` user space, UID 1000, SteamOS 3.5+) with Decky Loader installed
- PipeWire / PulseAudio audio stack
- Spotify Premium account (required for `librespot` Spotify Connect playback) or Flatpak `com.spotify.Client`

---

*Stack analysis: 2026-11-26*
