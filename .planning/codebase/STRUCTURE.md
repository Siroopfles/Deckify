---
last_mapped_commit: f8defec7206b337ccec032ac6a11b40649e888bd
last_mapped_at: 2026-11-26
---
</Architecture>
<Codebase Structure>
**Analysis Date:** 2026-11-26

## Directory Layout

```text
Deckify/
├── main.py                     # Decky Loader backend entry point (`Plugin` class & RPCs)
├── plugin.json                 # Decky plugin manifest (name, author, _root flag, api_version)
├── decky.pyi                   # Type stubs for Decky runtime module
├── package.json                # Node/pnpm dependencies, build, lint, typecheck, and test scripts
├── tsconfig.json               # TypeScript compiler configuration (strict ES2020 + react-jsx)
├── rollup.config.js            # @decky/rollup bundler configuration -> dist/index.js
├── eslint.config.js            # ESLint 10 flat configuration
├── deploy.sh                   # Dev deployment script to Steam Deck via scp + plugin_loader restart
├── install.sh                  # End-user GitHub release installer for SteamOS
├── uninstall.sh                # End-user uninstaller
├── py_modules/                 # Modular Python backend services and subsystems
├── src/                        # TypeScript/React frontend source
│   ├── components/             # Top-level modals, overlays, and banners
│   │   ├── common/             # Shared UI primitives (DeckifyImage, Sidebar, Modals, Rows)
│   │   └── tabs/               # 14 modular views rendered inside DeckifyExpandedModal
│   ├── hooks/                  # Custom React hooks (clock, status, trigger nav, grab-move)
│   └── utils/                  # Frontend utilities (themeBus, accentTheme, playback, chime)
├── tests/                      # Python unittest suite (`test_*.py`)
├── assets/                     # Plugin logo and README screenshots
├── site/                       # Static landing page (`site/index.html`)
├── dist/                       # Generated Rollup bundle (`dist/index.js`, gitignored)
├── coverage/                   # Generated Vitest coverage reports
├── .github/workflows/          # GitHub Actions CI, Pages deployment, and release workflows
├── .husky/                     # Git pre-commit hooks (`lint-staged`)
└── .planning/                  # GSD planning and codebase analysis artifacts
```

## Directory Purposes

**`py_modules/`:**
- Purpose: Houses all Python backend domain modules imported by `main.py` and `py_modules/__init__.py`.
- Contains: Spotify API/OAuth clients, image proxy, audio engine/volume/EQ/dock managers, MPRIS D-Bus worker, hidraw/evdev input watcher, and RPC handler modules.
- Key files: `py_modules/common.py`, `py_modules/rpc_playback.py`, `py_modules/rpc_library.py`, `py_modules/spotify.py`, `py_modules/resilience.py`, `py_modules/engine.py`, `py_modules/cdp_bridge.py`, `py_modules/volume.py`, `py_modules/equalizer.py`, `py_modules/soundtrack.py`, `py_modules/mpris.py`, `py_modules/input_watch.py`.

**`src/`:**
- Purpose: Frontend TypeScript/React codebase compiled by Rollup into `dist/index.js`.
- Contains: Plugin registration (`src/index.tsx`), Steam menu patcher (`src/steamMenu.tsx`), chord matcher (`src/chords.ts`), shared types (`src/types.ts`), and co-located `*.test.ts`/`*.test.tsx` unit tests.
- Key files: `src/index.tsx`, `src/types.ts`, `src/chords.ts`, `src/steamMenu.tsx`, `src/bannerBus.ts`, `src/utils.ts`.

**`src/components/`:**
- Purpose: Top-level UI surfaces mounted in GamepadUI.
- Contains: `DeckifyExpandedModal.tsx`, `DeckifyOverlay.tsx`, `SilentBanner.tsx`, plus `common/` and `tabs/` subdirectories.
- Key files: `src/components/DeckifyExpandedModal.tsx`, `src/components/DeckifyOverlay.tsx`, `src/components/SilentBanner.tsx`.

**`src/components/common/`:**
- Purpose: Reusable UI building blocks shared across QAM, Modal, and Overlay.
- Contains: CSP-safe image loader (`DeckifyImage.tsx`, `imagePipeline.ts`), modal sidebar (`Sidebar.tsx`), action modals (`TrackActionModal.tsx`, `CollectionActionModal.tsx`, `JamQrModal.tsx`), EQ faders (`EqBandFaders.tsx`), offline badges (`OfflineStatusUI.tsx`), and row primitives (`InteractiveRow.tsx`, `TrackRowItem.tsx`).

**`src/components/tabs/`:**
- Purpose: Individual tab screens rendered inside `DeckifyExpandedModal.tsx`.
- Contains: `NowPlayingTab.tsx`, `LyricsTab.tsx`, `DiscoveryTab.tsx`, `PlaylistsTab.tsx`, `LikedSongsTab.tsx`, `AlbumsTab.tsx`, `ArtistsTab.tsx`, `RecentTab.tsx`, `PodcastsTab.tsx`, `SearchTab.tsx`, `QueueTab.tsx`, `DevicesTab.tsx`, `SoundtracksTab.tsx`, `SettingsTab.tsx`, and sub-modals (`GameEqModal.tsx`, `PlaylistPickerModal.tsx`, `ChordBindingsCard.tsx`).

**`src/hooks/` & `src/utils/`:**
- Purpose: Stateful React hooks and pure TypeScript helpers.
- Contains: `usePlaybackClock.ts`, `usePlaybackStatus.ts`, `useTriggerNavigation.ts`, `useGrabMoveOrder.ts`, `accentTheme.ts`, `themeBus.ts`, `listNavigation.ts`, `playback.ts`, `chime.ts`, `triggerController.ts`.

**`tests/`:**
- Purpose: Comprehensive Python `unittest` suite covering backend modules, RPCs, resilience, and edge cases.
- Contains: 40+ `test_*.py` files runnable via `pnpm test:python`.

## Key File Locations

**Entry Points:**
- `main.py`: Backend `Plugin` class (`_main`, `_unload`, RPC endpoints).
- `src/index.tsx`: Frontend `definePlugin` entry point, QAM panel, global listeners.
- `py_modules/mpris.py`: Standalone D-Bus `--worker` entry point for `deck` user session.

**Configuration:**
- `plugin.json`: Decky Loader metadata and `_root` privilege flag.
- `package.json`: Build, lint, typecheck, and test scripts.
- `tsconfig.json`: TypeScript strict compiler options.
- `eslint.config.js`: ESLint flat config rules.
- `rollup.config.js`: Decky Rollup bundle config.

**Core Logic:**
- `py_modules/rpc_playback.py` & `py_modules/rpc_library.py`: Playback and library RPC implementations.
- `py_modules/spotify.py` & `py_modules/images.py`: Spotify Web API, LRCLIB lyrics, and CSP image proxy.
- `py_modules/resilience.py`: `librespot --onevent` socket server and session bookmark recovery.
- `src/components/DeckifyExpandedModal.tsx`: Full-screen modal orchestrator.

**Testing:**
- `tests/test_*.py`: Python backend unit and integration tests.
- `src/**/*.test.{ts,tsx}`: Co-located Vitest frontend tests.

## Naming Conventions

**Files:**
- React components & tabs: PascalCase (`DeckifyExpandedModal.tsx`, `NowPlayingTab.tsx`, `TrackActionModal.tsx`).
- Hooks & utilities: camelCase (`usePlaybackClock.ts`, `accentTheme.ts`, `imagePipeline.ts`).
- Python modules: snake_case (`rpc_playback.py`, `cdp_bridge.py`, `input_watch.py`).
- Tests: Co-located `*.test.ts`/`*.test.tsx` in `src/`; `test_*.py` in `tests/`.

**Directories:**
- Lowercase plural or domain names: `components/`, `common/`, `tabs/`, `hooks/`, `utils/`, `py_modules/`, `tests/`.

## Where to Add New Code

**New Feature (Full-Stack):**
- Backend domain module: `py_modules/<feature>.py` (re-export constants/helpers in `py_modules/__init__.py` if needed, wire into `main.py:Plugin`).
- Backend tests: `tests/test_<feature>.py`.
- Frontend types & RPC bindings: `src/types.ts` and `callable` in `src/index.tsx` or `src/components/DeckifyExpandedModal.tsx`.
- Frontend UI: New tab in `src/components/tabs/<Feature>Tab.tsx` or shared component in `src/components/common/<Component>.tsx`.
- Frontend tests: Co-located `<Feature>Tab.test.tsx` alongside the component.

**New Hook or Utility:**
- React hooks: `src/hooks/use<Name>.ts`.
- Pure frontend helpers: `src/utils/<name>.ts` + `src/utils/<name>.test.ts`.

**New Backend RPC:**
- Playback/device/volume RPCs: `py_modules/rpc_playback.py` + thin wrapper method on `Plugin` in `main.py`.
- Browse/playlist/search/podcast RPCs: `py_modules/rpc_library.py` + thin wrapper method on `Plugin` in `main.py`.

## Special Directories

**`dist/`:**
- Purpose: Contains compiled `dist/index.js` and `dist/index.js.map` consumed by Decky Loader.
- Generated: Yes (`pnpm build` via Rollup).
- Committed: No (gitignored).

**`coverage/`:**
- Purpose: HTML/Clover/JSON coverage output from Vitest and Python coverage.
- Generated: Yes (`pnpm test:coverage`).
- Committed: No (gitignored).

**`bin/` (runtime/deploy target on Steam Deck):**
- Purpose: Holds the `librespot` binary (`LIBRESPOT_BIN`) on the target device. Never place duplicate `py_modules/` trees under `bin/` as `main.py` prepends `bin/` to `sys.path`.
- Generated: Deployed externally.
- Committed: No.

---

*Structure analysis: 2026-11-26*
