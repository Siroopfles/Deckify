---
last_mapped_commit: 10018cbc1c9d1d294640d8866b3902ca56bcd816
last_mapped_at: 2026-11-14
---
<!-- refreshed: 2026-11-14 -->
# Coding Conventions

**Analysis Date:** 2026-11-14

## Naming Patterns

**Files:**
- React components: PascalCase with `.tsx` extension (`src/components/DeckifyExpandedModal.tsx`, `src/components/DeckifyOverlay.tsx`, `src/components/common/InteractiveRow.tsx`).
- Non-component TypeScript modules, hooks, and utilities: camelCase (`src/types.ts`, `src/utils.ts`, `src/hooks/usePlaybackClock.ts`, `src/utils/listNavigation.ts`).
- Python backend modules: snake_case (`main.py`, `py_modules/common.py`, `py_modules/rpc_playback.py`, `py_modules/spotify.py`).
- Test files: Co-located `.test.ts` / `.test.tsx` suffix for frontend (`src/utils.test.ts`, `src/components/DeckifyOverlay.test.tsx`); `test_` prefix under `tests/` for Python (`tests/test_py_modules.py`, `tests/test_plugin_api.py`).

**Functions:**
- TypeScript: camelCase for functions, hooks (`use*`), and callbacks (`formatMs`, `parseLrc`, `getScrubStepMs`, `usePlaybackClock`).
- React components: PascalCase (`DeckifyExpandedModal`, `InteractiveRow`, `RoundBtn`).
- Python: snake_case for all functions and methods (`control_playback`, `seek_playback`, `auto_transfer_and_play`).
- Private/internal Python helpers: Leading underscore (`_load_settings`, `_save_settings`, `_exec`, `_spotify_api_request`).

**Variables:**
- TypeScript: camelCase for local variables and state (`serverPositionMs`, `isPlaying`, `activeGameAppId`); `UPPER_SNAKE_CASE` for exported module constants (`ALL_MODES` in `src/types.ts`).
- Python: snake_case for locals and instance attributes; leading underscore for internal `Plugin` state (`_poll_play_state`, `_token_refresh_lock`, `_liked_cache` in `main.py`); `UPPER_SNAKE_CASE` for module-level configuration constants (`SETTINGS_FILE`, `DEFAULT_SETTINGS`, `SPOTIFY_API_BASE` in `py_modules/common.py`).

**Types:**
- TypeScript interfaces and type aliases: PascalCase (`TrackMeta`, `PlaylistItem`, `PlaybackClockOptions`, `ViewMode` in `src/types.ts` and `src/hooks/usePlaybackClock.ts`).
- Backend RPC callable bindings in TypeScript: `backend*` prefix with explicit generic tuple/return types (`const backendControlPlayback = callable<[string, string], { ok: boolean; error?: string }>("control_playback");` in `src/index.tsx`).

## Code Style

**Formatting:**
- TypeScript/TSX: 2-space indentation, semicolons required, double quotes for strings, trailing commas in multiline literals.
- Python: 4-space indentation, double quotes for strings and docstrings.
- No Prettier config file is present; formatting is enforced manually and via ESLint rules.

**Linting:**
- ESLint 10 flat config in `eslint.config.js` using `@eslint/js`, `typescript-eslint`, and `eslint-plugin-react-hooks`.
- Run `pnpm run lint` (`eslint src/`) or `pnpm run lint:fix` (`eslint --fix src/`).
- Key rules in `eslint.config.js`:
  - `react-hooks/rules-of-hooks`: `"error"`
  - `react-hooks/exhaustive-deps`: `"warn"`
  - `complexity`: `["warn", 15]`
  - `max-depth`: `["warn", 4]`
  - `max-lines-per-function`: `["warn", { max: 80, skipBlankLines: true, skipComments: true }]`
  - `max-params`: `["warn", 4]`
  - `@typescript-eslint/no-unused-vars`: `["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }]`
  - `@typescript-eslint/no-explicit-any`: `"warn"`
- TypeScript strictness in `tsconfig.json`: `strict: true`, `noImplicitAny: true`, `noImplicitReturns: true`, `noImplicitThis: true`, `noUnusedLocals: true`, `noUnusedParameters: true`. Run via `pnpm run typecheck`.
- Pre-commit gate in `.husky/pre-commit`: runs `pnpm exec lint-staged` (`src/**/*.{ts,tsx}` -> `eslint`), `pnpm run typecheck`, `pnpm test`, `pnpm run build`, and `unittest discover`.

## Import Organization

**Order:**
- TypeScript (`src/index.tsx`):
  1. React hooks and types (`import { useEffect, useState, useCallback, FC } from "react";`)
  2. Decky packages (`@decky/ui`, `@decky/api`)
  3. Local components, hooks, and utilities (`./steamMenu`, `./components/...`, `./hooks/...`)
  4. Third-party UI packages (`react-icons/fa`, `qrcode.react`)
  5. Type-only imports (`import type { ... } from "./types";`)
- Python (`py_modules/rpc_playback.py`, `main.py`):
  1. Standard library imports, alphabetical (`asyncio`, `json`, `os`, `time`, `urllib.error`)
  2. Fallback-guarded third-party/runtime imports (`try: import decky except ImportError: ...`)
  3. Local `py_modules` imports (`from py_modules.common import _exec, decky`)

**Path Aliases:**
- None configured in `tsconfig.json`; use relative imports in `src/` (`./types`, `../hooks/usePlaybackClock`).
- Backend modules import from `py_modules.*` (`from py_modules.spotify import _spotify_api_request`).

## Error Handling

**Patterns:**
- Python RPC methods never raise unhandled exceptions across the Decky bridge. Wrap network/system calls in `try/except` and return structured dictionaries:
  ```python
  try:
      await _exec(_spotify_api_request, endpoint, token, method, params)
      return {"ok": True}
  except urllib.error.HTTPError as e:
      if e.code == 404:
          return {"ok": False, "error": "No active device — connect via Spotify app first"}
      return {"ok": False, "error": _parse_spotify_error(e)}
  except Exception as e:
      decky.logger.error("control_playback(%s) failed: %s", action, e)
      return {"ok": False, "error": str(e)}
  ```
  (Observed in `py_modules/rpc_playback.py`.)
- Blocking I/O in Python async methods is offloaded through `await _exec(fn, *args, timeout=...)` so the Decky event loop never stalls.
- Frontend RPC calls wrap `callable(...)` invocations in `try/catch`, inspect `res?.ok`, and surface failures with `toaster.toast(...)` (`@decky/api`) or fallback empty state (`[]` / `null`) to avoid UI crashes.

## Logging

**Framework:** `decky.logger` (Python backend) and `console` / `toaster` (TypeScript frontend).

**Patterns:**
- Python uses `%`-style lazy formatting on `decky.logger`:
  - `decky.logger.info("control_playback: action=%s device_id=%s", action, device_id)`
  - `decky.logger.error("seek_playback(%d) failed: %s", position_ms, e)`
- Never log access tokens, refresh tokens, or authorization headers.
- In `py_modules/common.py`, provide a `SimpleNamespace` stub for `decky` when running outside Decky Loader (e.g., unit tests).

## Comments

**When to Comment:**
- Document non-obvious SteamOS, CEF, or Decky Loader runtime constraints (e.g., stripping `LD_LIBRARY_PATH` in `main.py` and `py_modules/common.py`, `sys.modules.get(__name__)` fallback in `main.py`).
- Reference design decision IDs inline where behavior implements a specific spec rule (e.g., `// D-05: Post-seek suppression window` in `src/hooks/usePlaybackClock.ts`).

**JSDoc/TSDoc & Docstrings:**
- Use JSDoc on exported utility functions and controller classes (`src/hooks/usePlaybackClock.ts`).
- Use concise one-line Python docstrings on RPC handler functions (`"""Control playback actions (play, pause, play_pause, next, previous)."""` in `py_modules/rpc_playback.py`).

## Function Design

**Size:**
- ESLint warns above 80 lines per function (`skipBlankLines: true, skipComments: true`), cyclomatic complexity above 15, nesting depth above 4, and more than 4 parameters (`eslint.config.js`).
- Extract pure state logic into dedicated controllers or utility modules (e.g., `PlaybackClockController` in `src/hooks/usePlaybackClock.ts`, `src/utils/listNavigation.ts`, `src/utils/triggerController.ts`).

**Parameters:**
- Use an options interface (`PlaybackClockOptions`) when a TypeScript function or class takes more than 3–4 arguments.
- Use keyword arguments with sensible defaults in Python (`device_id: str = ""`, `settings_file: str | None = None`).

**Return Values:**
- Python RPC functions consistently return `{"ok": True, ...}` on success and `{"ok": False, "error": "..."}` on failure.
- Pure TypeScript formatters/parsers return safe defaults on empty/invalid input (`"0:00"` in `formatMs`, `[]` in `parseLrc` in `src/utils.ts`).

## Module Design

**Exports:**
- `src/index.tsx` uses `export default definePlugin(...)` as required by Decky Loader.
- Component, hook, utility, and type modules (`src/types.ts`, `src/utils.ts`, `src/components/common/InteractiveRow.tsx`) use named exports.
- `py_modules/__init__.py` re-exports public and internal symbols via an explicit `__all__` list for `main.py` (`from py_modules import *`).
- `main.py` delegates RPC domains to focused modules (`py_modules/rpc_playback.py`, `py_modules/rpc_library.py`, `py_modules/volume.py`, `py_modules/soundtrack.py`).

---

*Convention analysis: 2026-11-14*
