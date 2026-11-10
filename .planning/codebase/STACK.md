---
last_mapped_commit: a61bbf8da7ad74d4ba42198f0c3841b6ef17f7f8
last_mapped_at: 2026-11-10
---
# Technology Stack

**Analysis Date:** 2026-11-10

## Languages

**Primary:**
- TypeScript 5.9.3 - Frontend Decky plugin UI components (`src/index.tsx`, `src/components/DeckifyExpandedModal.tsx`, `src/components/DeckifyOverlay.tsx`, `src/types.ts`)
- Python 3.11+ / 3.14 - Backend daemon and Decky RPC server (`main.py`, `py_modules/*.py`)

**Secondary:**
- Shell (Bash) - Deployment, installation, and daemon lifecycle scripts (`deploy.sh`, `install.sh`)
- HTML/CSS - Web landing page, HUD styling, and Steam Quick Access Menu styling (`site/index.html`, inline emotion/CSS styles in React components)

## Runtime

**Environment:**
- Node.js (v20+ recommended for development and Rollup bundling)
- Python 3.11+ runtime on SteamOS 3.5 / 3.7+ (Decky Loader environment)
- SteamOS GamepadUI Chromium Embedded Framework (CEF) for UI rendering

**Package Manager:**
- pnpm (configured with peer dependency rules ignoring unbundled React/React-DOM in `package.json`)
- Lockfile: `pnpm-lock.yaml` (root)

## Frameworks

**Core:**
- React 19.x (`@types/react: 19.2.14`, `@types/react-dom: 19.2.3`) - Frontend UI library loaded via Decky Loader global environment
- `@decky/ui` (4.11.1) - Official SteamOS / Decky UI components (ModalRoot, Focusable, QuickAccessMenu, Dropdown, ToggleField, etc.)
- `@decky/api` (1.1.3) - Decky frontend-to-backend RPC communication bridge (`callable`, `ServerAPI`)

**Testing:**
- Vitest 5.1.0 - Frontend unit and integration test runner (`src/utils.test.ts`)
- Python `unittest` standard library - Comprehensive backend test suite (316 tests across `tests/test_*.py`)
- Python `coverage` / `@vitest/coverage-v8` - Code coverage measurement tools

**Build/Dev:**
- Rollup 4.59.0 with `@decky/rollup` (1.0.2) - Compiles TypeScript/TSX into single ESM bundle `dist/index.js`
- ESLint 10.0.1 with `typescript-eslint` (8.56.0) and `eslint-plugin-react-hooks` (7.0.1) - Linting and static analysis (`eslint.config.js`)
- Husky 9.1.7 with `lint-staged` (16.2.7) - Pre-commit validation gates (`.husky/pre-commit`)

## Key Dependencies

**Critical:**
- `@decky/api` 1.1.3 - Communication bridge between frontend React UI and Python backend (`call_plugin_method`)
- `@decky/ui` 4.11.1 - Steam Deck GamepadUI styling, D-pad navigation, and modal rendering
- `librespot` / `spotifyd` - Open-source Spotify Connect engines providing headless Spotify playback on SteamOS
- `py_modules/spotify.py` - Custom Python Spotify Web API and LRCLIB lyrics client
- `py_modules/images.py` - Local base64 image caching proxy resolving Steam CEF Content Security Policy restrictions

**Infrastructure:**
- `react-icons` 5.5.0 - SVG icons for playback controls, library tabs, and action menus
- `qrcode.react` 4.2.0 - QR code generation for Spotify mobile auth
- `tslib` 2.8.1 - TypeScript runtime helper library

## Configuration

**Environment:**
- Steam Deck user environment (`deck` user, UID 1000)
- Settings stored in `~/.config/deckify/settings.json` (or `/home/deck/homebrew/settings/deckify/settings.json`)
- Image cache stored in `~/.cache/deckify/images/`
- PulseAudio / PipeWire volume control (`pactl` commands in `main.py`)

**Build:**
- Rollup config: `@decky/rollup` via `package.json` build script
- TypeScript config: `tsconfig.json` targeting ESNext with React JSX
- ESLint config: `eslint.config.js` with TypeScript ESLint configurations

## Platform Requirements

**Development:**
- Node.js 20+, pnpm 9+, Python 3.10+
- OS: Linux, macOS, or Windows (WSL / PowerShell)

**Production:**
- Valve Steam Deck or SteamOS-based Steam Machine
- SteamOS 3.5+ with Decky Loader installed
- Spotify Premium account (required for Spotify Connect engines)

---

*Stack analysis: 2026-11-10*
