---
last_mapped_commit: f8defec7206b337ccec032ac6a11b40649e888bd
last_mapped_at: 2026-11-26
---
# Coding Conventions

**Analysis Date:** 2026-11-26

## Naming Patterns

**Files:**
- **React components:** PascalCase with `.tsx` extension (`src/components/DeckifyExpandedModal.tsx`, `src/components/DeckifyOverlay.tsx`, `src/components/common/InteractiveRow.tsx`, `src/components/tabs/NowPlayingTab.tsx`).
- **TypeScript utilities, hooks, and type modules:** camelCase (`src/types.ts`, `src/utils.ts`, `src/bannerBus.ts`, `src/utils/accentTheme.ts`, `src/hooks/usePlaybackClock.ts`).
- **TypeScript tests:** Co-located with the module under test using `.test.ts` or `.test.tsx` suffix (`src/utils.test.ts`, `src/components/common/InteractiveRow.test.tsx`, `src/components/common/DeckifyImage.test.ts`).
- **Python modules:** `snake_case` (`main.py`, `py_modules/common.py`, `py_modules/rpc_playback.py`, `py_modules/resilience.py`).
- **Python tests:** Separate `tests/` directory with `test_` prefix (`tests/test_resilience.py`, `tests/test_plugin_api.py`, `tests/test_token_refresh.py`).

**Functions:**
- **TypeScript:** `camelCase` for functions and hooks (`formatMs`, `parseLrc`, `usePlaybackClock`, `getScrubStepMs`). React components use `PascalCase` (`DeckifyImage`, `InteractiveRow`).
- **Python:** `snake_case` for public functions and RPC methods (`control_playback`, `get_auth_status`, `resolve_device_hostname`). Prefix internal or helper functions with a single leading underscore `_` (`_load_settings`, `_save_settings`, `_spotify_api_request`, `_validate_eq_bands`).

**Variables:**
- **TypeScript:** `camelCase` for locals and state (`dataUrl`, `isLoading`, `animationsSuspended`); `UPPER_SNAKE_CASE` for module-level constants (`SHIMMER_STYLE_ID`, `ALL_MODES`, `DEFAULT_CHORD_BINDINGS`).
- **Python:** `snake_case` for locals and instance attributes (`_access_token`, `_refresh_token`, `_settings`); `UPPER_SNAKE_CASE` for module-level constants (`SETTINGS_FILE`, `VALID_AUDIO_BACKENDS`, `ONEVENT_DEBOUNCE_S`).

**Types:**
- **TypeScript:** `PascalCase` for interfaces, type aliases, and classes (`TrackMeta`, `TrackItem`, `ViewMode`, `DeckifyImageProps`, `PlaybackClockController`).
- **Python:** Built-in type annotations with PEP 604 unions (`str | None`) and generic builtins (`list[float]`, `dict[str, str]`, `tuple[list[float] | None, str | None]`).

## Code Style

**Formatting:**
- No Prettier or `.editorconfig` file is configured; follow the repository's existing formatting:
  - TypeScript/TSX: 2-space indentation, semicolons required, double quotes for strings, trailing commas in multiline literals and parameter lists.
  - Python: 4-space indentation, double quotes for strings and docstrings, trailing commas in multiline collections.

**Linting:**
- **ESLint 10** with flat config in `eslint.config.js` (`@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`).
- Run `pnpm run lint` (or `pnpm run lint:fix`) to check `src/**/*.{ts,tsx}`.
- Key enforced rules in `eslint.config.js`:
  - `react-hooks/rules-of-hooks`: `error`
  - `react-hooks/exhaustive-deps`: `warn`
  - `complexity`: `warn` (max `15`)
  - `max-depth`: `warn` (max `4`)
  - `max-lines-per-function`: `warn` (max `80`, ignoring blank lines and comments)
  - `max-params`: `warn` (max `4`)
  - `@typescript-eslint/no-unused-vars`: `warn` (ignores `^_` prefix)
  - `@typescript-eslint/no-explicit-any`: `warn`
  - `no-empty`: `warn`
- **TypeScript:** Strict mode enabled in `tsconfig.json` (`"strict": true`, `"noUnusedLocals": true`, `"noUnusedParameters": true`, `"noImplicitReturns": true`, `"noImplicitAny": true`, `"target": "ES2020"`). Run `pnpm run typecheck` (`tsc --noEmit`).
- **Pre-commit Gate:** `.husky/pre-commit` automatically runs `pnpm exec lint-staged` (`eslint` on staged `src/**/*.{ts,tsx}`), `pnpm run typecheck`, `pnpm test`, and `pnpm run build` when frontend files change, and runs `python -m unittest discover -s tests -p "test_*.py"` when `main.py`, `py_modules/`, or `tests/` change.

## Import Organization

**Order:**
1. **TypeScript (`src/index.tsx`, `src/components/DeckifyExpandedModal.tsx`):**
   - External framework & Decky packages (`react`, `@decky/ui`, `@decky/api`, `react-icons/fa`).
   - Shared local types (`../types`).
   - Local utilities, hooks, and buses (`../utils`, `../utils/themeBus`, `../hooks/usePlaybackClock`).
   - Child components (`./common/Sidebar`, `./tabs/NowPlayingTab`).
2. **Python (`main.py`, `py_modules/resilience.py`):**
   - Standard library imports sorted alphabetically (`asyncio`, `json`, `os`, `socket`, `time`).
   - Conditional `decky` import with fallback to `py_modules.common.decky`.
   - Internal `py_modules` imports (`from py_modules import common`, `from py_modules.common import ...`).

**Path Aliases:**
- None configured in `tsconfig.json`; use relative imports (`./utils`, `../types`, `../../utils/themeBus`).

## Error Handling

**Patterns:**
- **Python Backend (`main.py`, `py_modules/`):**
  - Never let RPC methods raise unhandled exceptions into the Decky event loop. Catch exceptions and return structured dictionaries: `{"ok": True, ...}` on success and `{"ok": False, "error": str(e)}` on failure.
  - Guard `decky` import in every standalone module so unit tests and CLI invocations outside Decky Loader do not fail (`py_modules/common.py` provides a `SimpleNamespace` fallback logger and `emit` stub).
  - Strip `LD_LIBRARY_PATH` at module import time (`os.environ.pop("LD_LIBRARY_PATH", None)` in `main.py` and `py_modules/common.py`) before spawning subprocesses.
  - Use `sys.modules.get(__name__)` rather than `sys.modules[__name__]` in `main.py` because Decky Loader executes plugins with `__name__ == "_"`.
- **TypeScript Frontend (`src/`):**
  - Wrap async `callable(...)` RPC calls in `try/catch` and surface user-facing failures via `toaster.toast(...)` from `@decky/api` or `emitBanner(...)` from `src/bannerBus.ts`.
  - Return safe fallback values (`"0:00"` in `formatMs`, `[]` in `parseLrc`) on empty or invalid input.

## Logging

**Framework:**
- **Backend:** `decky.logger` (`info`, `warning`, `error`, `debug`) imported from `decky` or `py_modules.common.decky`.
- **Frontend:** Standard `console.log` / `console.error` and `toaster.toast` for user-visible notifications.

**Patterns:**
- Log contextual identifiers without leaking OAuth tokens or secrets (`access_token`, `refresh_token`, `client_secret`).
- Suppress noisy logging inside unit tests by mocking `decky.logger`.

## Comments

**When to Comment:**
- Document non-obvious SteamOS / GamepadUI / Decky Loader quirks (e.g., why `LD_LIBRARY_PATH` is popped in `main.py` and `py_modules/common.py`, or why `DeckifyImage` proxies external URLs through backend base64 encoding to satisfy Steam CEF CSP).
- Use section divider comments (`# ── Playback & Queue Controls ──────────────────────────────`) in large test suites and modules.

**JSDoc/TSDoc / Docstrings:**
- Use JSDoc comments on exported TypeScript utilities, hooks, and controller classes (`src/hooks/usePlaybackClock.ts`).
- Use module-level docstrings and concise function docstrings in Python (`py_modules/resilience.py`, `_validate_eq_bands` in `main.py`).

## Function Design

**Size:**
- ESLint warns when TypeScript functions exceed 80 non-blank, non-comment lines (`max-lines-per-function`), cyclomatic complexity `15`, nesting depth `4`, or `4` parameters.
- Extract pure logic out of React components into `src/utils/` or `src/hooks/` (e.g., `PlaybackClockController` in `src/hooks/usePlaybackClock.ts`, `ImageLruCache` and `ImageRequestQueue` in `src/components/common/imagePipeline.ts`).

**Parameters:**
- Use typed options interfaces (`PlaybackClockOptions`, `DeckifyImageProps`) in TypeScript when a function or component accepts more than 3 arguments.
- Use keyword arguments with explicit defaults and type hints in Python (`def _load_settings(settings_file: str | None = None) -> dict:`).

**Return Values:**
- Use early returns for guard clauses (`if (!ms || ms <= 0) return "0:00";`).
- Python validation helpers return `(validated_value, error_message)` tuples (`_validate_eq_bands` in `main.py`).

## Module Design

**Exports:**
- `src/index.tsx` exports `definePlugin(...)` as the default export required by Decky Loader.
- Component, hook, and utility modules use named exports (`export function DeckifyImage`, `export class PlaybackClockController`).
- `py_modules/__init__.py` explicitly re-exports public and internal symbols via `__all__`.

**Barrel Files:**
- `py_modules/__init__.py` serves as the Python package barrel file.
- `src/components/DeckifyExpandedModal.tsx` maintains backward-compatible re-exports for `DeckifyImage` and `InteractiveRow`.
- `src/components/common/DeckifyImage.tsx` re-exports pipeline primitives from `./imagePipeline`.

---

*Convention analysis: 2026-11-26*
