---
last_mapped_commit: a61bbf8da7ad74d4ba42198f0c3841b6ef17f7f8
last_mapped_at: 2026-11-10
---
# Codebase Structure

**Analysis Date:** 2026-11-10

## Directory Layout

```
Deckify/
├── .github/
│   └── workflows/
│       └── release.yml        # Automated release & packaging workflow
├── .husky/
│   └── pre-commit             # Pre-commit hook executing lint-staged, tests, and build
├── .planning/
│   └── codebase/              # Codebase analysis maps (STACK, ARCHITECTURE, etc.)
├── dist/                      # Rollup build output directory
│   └── index.js               # Compiled ESM frontend bundle for Decky Loader
├── py_modules/                # Backend Python modules supporting main.py
│   ├── __init__.py            # Module exports and package initialization
│   ├── auth.py                # OAuth token and authorization utilities
│   ├── common.py              # Constants, settings load/save helpers, UID management
│   ├── device.py              # Audio device & sink enumeration
│   ├── engine.py              # librespot / spotifyd engine process management
│   ├── images.py              # Base64 image caching and proxy service
│   └── spotify.py             # Spotify Web API client and LRCLIB lyrics integration
├── site/
│   └── index.html             # Static web landing page & project documentation
├── src/                       # Frontend TypeScript & React source code
│   ├── components/            # UI modal and overlay components
│   │   ├── DeckifyExpandedModal.tsx # Full-featured Spotify manager modal
│   │   └── DeckifyOverlay.tsx # In-game HUD overlay component
│   ├── index.tsx              # Plugin entry point & Quick Access Menu view
│   ├── steamMenu.tsx          # Steam GamepadUI menu integration helpers
│   ├── types.d.ts             # Decky environment global type declarations
│   ├── types.ts               # Shared TypeScript data models and interfaces
│   └── utils.test.ts          # Vitest unit tests for frontend utilities
├── tests/                     # Comprehensive Python test suite (316 tests)
│   ├── test_century_coverage.py
│   ├── test_device_and_engine.py
│   ├── test_device_name.py
│   ├── test_e2e_requirements.py
│   ├── test_features.py
│   ├── test_final_coverage.py
│   ├── test_images.py
│   ├── test_plugin_advanced.py
│   ├── test_plugin_api.py
│   ├── test_plugin_corner_cases.py
│   ├── test_plugin_error_matrix.py
│   ├── test_plugin_full_coverage.py
│   ├── test_plugin_lifecycle.py
│   ├── test_py_modules.py
│   ├── test_token_refresh.py
│   └── test_uninstall.py
├── deploy.sh                  # SSH deployment script to target Steam Deck
├── eslint.config.js           # Flat ESLint configuration
├── install.sh                 # One-line installer script for SteamOS
├── main.py                    # Decky backend entry point & RPC Plugin class
├── package.json               # NPM package manifest, scripts, and dependencies
├── plugin.json                # Decky Loader metadata manifest
├── pnpm-lock.yaml             # Frozen pnpm dependency lockfile
└── tsconfig.json              # TypeScript compiler configuration
```

## Directory Purposes

**`src/`:**
- Purpose: Frontend plugin source code executed inside SteamOS GamepadUI CEF.
- Contains: React components, styled views, controller event listeners.
- Key files: `src/index.tsx`, `src/components/DeckifyExpandedModal.tsx`, `src/components/DeckifyOverlay.tsx`, `src/types.ts`.

**`py_modules/`:**
- Purpose: Modular Python backend services imported by `main.py`.
- Contains: Spotify API client, image proxy service, playback engine manager, audio device manager.
- Key files: `py_modules/spotify.py`, `py_modules/images.py`, `py_modules/engine.py`, `py_modules/common.py`.

**`tests/`:**
- Purpose: Python unit tests, integration tests, and mock verification for the backend.
- Contains: Test cases testing every RPC method, lifecycle hook, edge case, and error handler.
- Key files: `tests/test_features.py`, `tests/test_images.py`, `tests/test_plugin_api.py`.

**`dist/`:**
- Purpose: Distribution build artifacts packaged into the plugin zip.
- Contains: Single rolled-up JavaScript file `index.js`.
- Generated: Yes (by `pnpm run build`). Committed: No (ignored or bundled in releases).

## Key File Locations

**Entry Points:**
- `src/index.tsx`: Frontend Decky plugin entry point (`definePlugin`).
- `main.py`: Backend Decky plugin entry point (`class Plugin`).

**Configuration:**
- `package.json`: Frontend scripts and dependency versions.
- `plugin.json`: Decky Loader plugin metadata (author, version, flags).
- `tsconfig.json`: TypeScript build configuration.
- `eslint.config.js`: Code quality and linting configuration.

**Core Logic:**
- `src/components/DeckifyExpandedModal.tsx`: Main user interface with 9 tabs (Now Playing, Playlists, Liked, Albums, Artists, Recent, Podcasts, Equalizer, Settings).
- `py_modules/spotify.py`: Spotify Web API calls, token refresh, and LRCLIB lyrics lookup.
- `py_modules/images.py`: Image download, disk caching, and base64 proxying.
- `py_modules/engine.py`: Spotify Connect engine daemon execution and management.

**Testing:**
- `tests/`: Python test runner directory (`python3 -m unittest discover -s tests`).
- `src/utils.test.ts`: Vitest frontend test file.

## Naming Conventions

**Files:**
- React components: PascalCase (e.g., `DeckifyExpandedModal.tsx`, `DeckifyOverlay.tsx`).
- TypeScript utilities/types: camelCase (e.g., `types.ts`, `utils.test.ts`).
- Python modules: snake_case (e.g., `main.py`, `py_modules/spotify.py`, `py_modules/images.py`).
- Test files: Prefix `test_` in `tests/` for Python; suffix `.test.ts` for Vitest.

**Directories:**
- Source subdirectories: lowercase or camelCase (e.g., `components`, `py_modules`).

## Where to Add New Code

**New Feature (UI):**
- Primary code: Add tab or component in `src/components/` and register in `DeckifyExpandedModal.tsx` or `src/index.tsx`.
- Tests: Add corresponding tests in `src/utils.test.ts`.

**New Backend RPC Method:**
- Implementation: Add async handler method in `main.py:Plugin` and support logic in appropriate `py_modules/*.py`.
- Tests: Add unit tests in `tests/test_features.py` or dedicated `tests/test_<feature>.py`.

**New Utility or Type:**
- Shared types: Add to `src/types.ts`.
- Python helpers: Add to `py_modules/common.py`.

## Special Directories

**`dist/`:**
- Purpose: Bundled production code.
- Generated: Yes.
- Committed: No (generated during build step in CI / local deployment).

**`.planning/`:**
- Purpose: GSD workflow state, specifications, and codebase maps.
- Generated: Yes (by GSD commands).
- Committed: Yes.

---

*Structure analysis: 2026-11-10*
