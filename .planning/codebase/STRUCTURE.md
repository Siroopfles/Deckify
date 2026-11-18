---
last_mapped_commit: e6cf3a7b4bc94746d4d770b5bd8981193852200f
last_mapped_at: 2026-11-18
---
# Codebase Structure

**Analysis Date:** 2026-11-18

## Directory Layout

```text
Deckify/
├── .github/workflows/       # CI, GitHub Pages, and release automation
├── .husky/                  # Pre-commit hooks (`pre-commit` staged frontend/python checks)
├── .planning/               # GSD planning and codebase analysis documents
├── assets/                  # Plugin logo and documentation screenshots
├── dist/                    # Rollup-compiled frontend bundle (generated)
├── py_modules/              # Python backend domain, RPC, audio, and resilience modules
├── site/                    # Static landing page (`index.html`)
├── src/                     # TypeScript/React frontend source
│   ├── components/          # UI modals, overlay, shared widgets, and tab views
│   │   ├── common/          # Reusable UI primitives, action modals, and image proxy pipeline
│   │   └── tabs/            # 14 modular tabs rendered inside DeckifyExpandedModal
│   ├── hooks/               # Custom React hooks (clock, status polling, triggers)
│   └── utils/               # Pure navigation and controller helpers
├── tests/                   # Python unittest suite (`test_*.py`)
├── main.py                  # Decky backend entry point (`Plugin` class)
├── plugin.json              # Decky Loader plugin manifest
├── package.json             # Node dependencies, scripts, and lint-staged config
├── rollup.config.js         # `@decky/rollup` build configuration
├── tsconfig.json            # Strict TypeScript compiler configuration
├── eslint.config.js         # ESLint 10 flat configuration
├── decky.pyi                # Type stubs for Decky Loader Python runtime
├── deploy.sh                # Steam Deck SSH deployment script
├── install.sh               # End-user installation script
└── uninstall.sh             # End-user uninstallation script
```

## Directory Purposes

**`.husky/`:**
- Purpose: Git pre-commit quality gate enforcing fast incremental verification.
- Contains: `pre-commit` script inspecting staged files to run `lint-staged`, `pnpm run typecheck`, `pnpm test`, and `pnpm run build` on frontend changes, and `unittest discover` on Python changes (`main.py`, `py_modules/`, `tests/`).
- Key files: `.husky/pre-commit`

**`src/`:**
- Purpose: Decky Loader frontend plugin compiled by Rollup into `dist/index.js`.
- Contains: Entry point, Steam menu injector, shared types, utilities, hooks, UI components, and root unit tests.
- Key files: `src/index.tsx`, `src/index.test.tsx`, `src/steamMenu.tsx`, `src/types.ts`, `src/utils.ts`

**`src/components/`:**
- Purpose: Top-level modal and overlay surfaces plus organized sub-components.
- Contains: `DeckifyExpandedModal.tsx`, `DeckifyOverlay.tsx`, `common/`, `tabs/`, and co-located `.test.tsx` files.
- Key files: `src/components/DeckifyExpandedModal.tsx`, `src/components/DeckifyOverlay.tsx`

**`src/components/common/`:**
- Purpose: Reusable GamepadUI-compatible primitives, action modals, and CSP-safe image loading.
- Contains: `CollectionActionModal.tsx`, `DeckifyImage.tsx`, `imagePipeline.ts`, `InteractiveRow.tsx`, `Sidebar.tsx`, `TrackActionModal.tsx`, `TrackRowItem.tsx`, and co-located tests.
- Key files: `src/components/common/DeckifyImage.tsx`, `src/components/common/imagePipeline.ts`, `src/components/common/Sidebar.tsx`, `src/components/common/TrackActionModal.tsx`, `src/components/common/CollectionActionModal.tsx`

**`src/components/tabs/`:**
- Purpose: Individual feature views mounted inside `DeckifyExpandedModal`.
- Contains: `NowPlayingTab.tsx`, `LyricsTab.tsx`, `DiscoveryTab.tsx`, `PlaylistsTab.tsx`, `LikedSongsTab.tsx`, `AlbumsTab.tsx`, `ArtistsTab.tsx`, `RecentTab.tsx`, `PodcastsTab.tsx`, `SearchTab.tsx`, `QueueTab.tsx`, `DevicesTab.tsx`, `SoundtracksTab.tsx`, `SettingsTab.tsx`, `PlaylistPickerModal.tsx`, `soundtrackUtils.ts`, and co-located `.test.tsx` files.
- Key files: `src/components/tabs/NowPlayingTab.tsx`, `src/components/tabs/DiscoveryTab.tsx`, `src/components/tabs/PlaylistsTab.tsx`, `src/components/tabs/SoundtracksTab.tsx`, `src/components/tabs/SettingsTab.tsx`

**`src/hooks/` & `src/utils/`:**
- Purpose: Stateful React hooks and pure TypeScript controller/list navigation logic.
- Contains: `usePlaybackClock.ts`, `usePlaybackStatus.ts`, `useTriggerNavigation.ts`, `listNavigation.ts`, `triggerController.ts`, and unit tests.
- Key files: `src/hooks/usePlaybackClock.ts`, `src/hooks/useTriggerNavigation.ts`, `src/utils/triggerController.ts`, `src/utils/listNavigation.ts`

**`py_modules/`:**
- Purpose: Modular Python backend logic imported and exposed by `Plugin` in `main.py`.
- Contains: Spotify API/OAuth, image caching proxy, audio engine/CDP control, PipeWire volume/ducking, 10-band EQ filter-chain, dock audio hotplug switcher, `--onevent` socket & session bookmark resilience, game soundtrack orchestration, Steam VDF parser, and RPC handlers.
- Key files: `py_modules/common.py`, `py_modules/spotify.py`, `py_modules/images.py`, `py_modules/engine.py`, `py_modules/volume.py`, `py_modules/equalizer.py`, `py_modules/dock.py`, `py_modules/resilience.py`, `py_modules/soundtrack.py`, `py_modules/rpc_playback.py`, `py_modules/rpc_library.py`

**`tests/`:**
- Purpose: Python `unittest` suite covering backend modules, RPC handlers, lifecycle, VDF parsing, volume, EQ, dock switching, discovery, resilience, pinned playlists, and E2E requirements.
- Contains: `test_*.py` test modules.
- Key files: `tests/test_plugin_api.py`, `tests/test_soundtrack.py`, `tests/test_volume.py`, `tests/test_equalizer.py`, `tests/test_dock.py`, `tests/test_resilience.py`, `tests/test_discovery.py`, `tests/test_pinned_playlists.py`

## Key File Locations

**Entry Points:**
- `src/index.tsx`: Frontend `definePlugin` registration, QAM `Content`, pinned collection pills (`PinnedPill`), global overlay/chords/lifecycle listeners.
- `main.py`: Backend `Plugin` class, Decky lifecycle (`_main`, `_unload`, `_uninstall`, `_migration`), OAuth server, adaptive polling loop.

**Configuration:**
- `.husky/pre-commit`: Staged frontend and Python test/typecheck/build verification hook.
- `plugin.json`: Decky plugin metadata (`name`, `api_version`, `_root` flag).
- `package.json`: Build/lint/test scripts and dependencies.
- `tsconfig.json`: Strict TypeScript compiler options.
- `rollup.config.js`: Rollup bundler entry (`@decky/rollup`).
- `eslint.config.js`: ESLint 10 rules for `src/`.

**Core Logic:**
- `src/components/DeckifyExpandedModal.tsx`: Main full-screen controller UI and 14-tab router.
- `py_modules/rpc_playback.py` & `py_modules/rpc_library.py`: Backend RPC implementations (playback, library, folders, discovery feed).
- `py_modules/spotify.py` & `py_modules/images.py`: External Spotify/LRCLIB HTTP clients and CSP image proxy.
- `py_modules/volume.py`, `py_modules/equalizer.py`, `py_modules/dock.py`, `py_modules/soundtrack.py` & `py_modules/resilience.py`: Audio ducking/fading, 10-band PipeWire EQ, dock sink switching, per-game soundtrack automation, and `--onevent`/bookmark resilience.

**Testing:**
- `tests/test_*.py`: Backend Python `unittest` suite (`pnpm test:python`).
- `src/**/*.test.{ts,tsx}`: Frontend Vitest unit/component tests co-located with source (`pnpm test`).

## Naming Conventions

**Files:**
- React components: `PascalCase.tsx` (`DeckifyExpandedModal.tsx`, `DiscoveryTab.tsx`, `CollectionActionModal.tsx`, `InteractiveRow.tsx`).
- Frontend hooks: `camelCase.ts` prefixed with `use` (`usePlaybackClock.ts`, `useTriggerNavigation.ts`).
- Frontend utilities & types: `camelCase.ts` (`imagePipeline.ts`, `listNavigation.ts`, `types.ts`).
- Frontend tests: Co-located `<Module>.test.ts` or `<Component>.test.tsx`.
- Python modules: `snake_case.py` (`rpc_playback.py`, `equalizer.py`, `resilience.py`, `vdf_parser.py`).
- Python tests: `tests/test_<area>.py` (`tests/test_equalizer.py`, `tests/test_resilience.py`).

**Directories:**
- Lowercase plural or domain names: `components/`, `common/`, `tabs/`, `hooks/`, `utils/`, `tests/`, `py_modules/`.

## Where to Add New Code

**New Feature (Full Tab + Backend RPC):**
- Tab UI: `src/components/tabs/<Feature>Tab.tsx` (and register `ViewMode` in `src/types.ts`, `Sidebar.tsx`, and `DeckifyExpandedModal.tsx`).
- Backend RPC handler: Add to `py_modules/rpc_playback.py`, `py_modules/rpc_library.py`, or a new `py_modules/<domain>.py`, then expose an `async def` method on `Plugin` in `main.py` (and re-export in `py_modules/__init__.py` if shared).
- Tests: Co-located `src/components/tabs/<Feature>Tab.test.tsx` and `tests/test_<feature>.py`.

**New Shared UI Component or Hook:**
- Reusable widget or modal: `src/components/common/<Component>.tsx`
- Reusable hook: `src/hooks/use<HookName>.ts`

**Utilities:**
- Frontend pure helpers: `src/utils/<name>.ts` (or `src/utils.ts` for small shared formatters).
- Backend shared constants/helpers: `py_modules/common.py` (re-exported in `py_modules/__init__.py`).

## Special Directories

**`dist/`:**
- Purpose: Compiled Rollup ESM output (`dist/index.js`) loaded by Decky Loader.
- Generated: Yes (`pnpm build`).
- Committed: No (build artifact).

**`coverage/`:**
- Purpose: Vitest V8 coverage reports.
- Generated: Yes (`pnpm test:coverage`).
- Committed: No.

**`.planning/`:**
- Purpose: GSD project planning, phase artifacts, and `.planning/codebase/` analysis docs.
- Generated: Managed by GSD workflows.
- Committed: Yes.

---

*Structure analysis: 2026-11-18*
