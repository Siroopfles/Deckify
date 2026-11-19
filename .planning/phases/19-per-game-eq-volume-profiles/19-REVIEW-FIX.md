---
phase: 19-per-game-eq-volume-profiles
fixed_at: 2026-11-19T17:51:24Z
review_path: .planning/phases/19-per-game-eq-volume-profiles/19-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 19: Code Review Fix Report

**Fixed at:** 2026-11-19T17:51:24Z
**Source review:** `.planning/phases/19-per-game-eq-volume-profiles/19-REVIEW.md`
**Iteration:** 1
**Verification Environment:**
- Isolated worktree `C:/Users/djdje/Deckify/.agents/worktrees/rf-19-39076-1795110170` (`gsd-reviewfix/19-39076`): per-fix source re-reads, syntax checks (`tsc --noEmit`, `ast.parse`), targeted tests (`src/index.test.tsx`, `test_soundtrack.py`, `test_e2e_requirements.py`), and atomic commits (`6da2c77`, `fae79d1`).
- Main checkout `C:/Users/djdje/Deckify` (post fast-forward merge `0516be2..fae79d1`): full frontend and Python verification gates (`pnpm test -- --run src/index.test.tsx`, `pnpm test`, `pnpm run typecheck`, `pnpm run lint`, `pnpm run build`, and `py -3 -m unittest discover -s tests -p "test_*.py"`).

**Summary:**
- Findings in scope: 2 (`WR-08` and `WR-09` under `fix_scope: critical_warning`; `IN-06` excluded as out-of-scope info finding)
- Fixed: 2
- Skipped: 0

**Verification Results:**
- Isolated worktree (`C:/Users/djdje/Deckify/.agents/worktrees/rf-19-39076-1795110170`):
  - `WR-08`: `pnpm test -- --run src/index.test.tsx` (17 tests passed), `pnpm run typecheck` (0 errors), `pnpm run lint` (0 errors, 658 warnings — zero new warnings)
  - `WR-09`: `ast.parse` on `py_modules/soundtrack.py`, `main.py`, `tests/test_soundtrack.py` (`AST_OK`), `py -3 -m unittest discover -s tests -p "test_soundtrack.py"` (54 tests — `OK`), `py -3 -m unittest discover -s tests -p "test_e2e_requirements.py"` (152 tests — `OK`)
- Main checkout (`C:/Users/djdje/Deckify`, post fast-forward merge `0516be2..fae79d1`):
  - `pnpm test -- --run src/index.test.tsx`: 17 tests passed
  - `pnpm test`: 17 test files passed, 211 tests passed
  - `pnpm run typecheck`: 0 errors
  - `pnpm run lint`: 0 errors (658 warnings)
  - `pnpm run build`: `./src/index.tsx → dist... created dist in 8.4s`
  - `py -3 -m unittest discover -s tests -p "test_*.py"`: Ran 596 tests in 65.690s — `OK`

## Fixed Issues

### WR-08: `handleQuickBind` allows missing or zero `Router.MainRunningApp.appid` to forward an unverified `display_name`

**Files modified:** `src/index.tsx`, `src/index.test.tsx`
**Commit:** `6da2c77`
**Applied fix:** Replaced `(!mainAppId || mainAppId === activeGameAppId)` with `mainAppId === activeGameAppId` in `handleQuickBind` (`src/index.tsx:427`) so missing, `undefined`, empty (`""`), or zero (`0` / `"0"`) `Router.MainRunningApp.appid` values forward `""` instead of an unverified `display_name`, while exact positive matches forward trimmed `display_name`. Added a unit test in `src/index.test.tsx` covering `undefined`, missing `appid`, `""`, `"0"`, `0`, mismatched `"999999"`, and exact `"1091500"` with surrounding whitespace.

### WR-09: `SoundtrackManager._resolve_app_name` executes synchronous `vdf_parser.get_installed_games()` disk I/O on the asyncio event loop (including on unbound game launches)

**Files modified:** `py_modules/soundtrack.py`, `main.py`, `tests/test_soundtrack.py`
**Commit:** `fae79d1`
**Applied fix:** Factored `_resolve_known_app_name` and `_match_vdf_game_name` out of `SoundtrackManager._resolve_app_name` (preserving synchronous compatibility), added `async def _resolve_app_name_async` offloading cold `vdf_parser.get_installed_games` lookups via `asyncio.get_running_loop().run_in_executor(None, vdf_parser.get_installed_games)`, added keyword-only `resolve_vdf: bool = True` to `save_profile` and implemented `async def save_profile_async` delegating with `resolve_vdf=False` to avoid duplicate VDF scans on miss, updated `apply_active_audio_profile` to skip `_resolve_app_name_async` entirely when `profile is None` (unbound launches) and await it when `isinstance(profile, dict)`, updated `bind_current_music_to_game` to await `_resolve_app_name_async` and pass `resolve_vdf=False`, and updated `Plugin.save_game_soundtrack_profile` in `main.py` (with `import inspect`) to await `manager.save_profile_async` when it is a coroutine function while falling back to `manager.save_profile` for plain sync mocks. Added unit tests in `tests/test_soundtrack.py` verifying unbound launches skip VDF completely and async callers offload cold VDF scans via `run_in_executor` without double-calling `vdf_parser.get_installed_games()` on miss.

---

_Fixed: 2026-11-19T17:51:24Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
