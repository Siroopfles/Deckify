---
phase: 19-per-game-eq-volume-profiles
fixed_at: 2026-11-19T18:00:29Z
review_path: .planning/phases/19-per-game-eq-volume-profiles/19-REVIEW.md
iteration: 2
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 19: Code Review Fix Report

**Fixed at:** 2026-11-19T18:00:29Z
**Source review:** `.planning/phases/19-per-game-eq-volume-profiles/19-REVIEW.md`
**Iteration:** 2
**Verification Environment:**
- Iteration 1 isolated worktree `C:/Users/djdje/Deckify/.agents/worktrees/rf-19-39076-1795110170` (`gsd-reviewfix/19-39076`) and main checkout `C:/Users/djdje/Deckify` (post fast-forward merge `0516be2..fae79d1`): verified `WR-08` (`6da2c77`) and `WR-09` (`fae79d1`).
- Iteration 2 isolated worktree `C:/Users/djdje/Deckify/.agents/worktrees/rf-19-1236-1795111014` (`gsd-reviewfix/19-1236`, with `C:\Users\djdje\Deckify\node_modules\.bin` prepended to `PATH` for workspace binaries) and main checkout `C:/Users/djdje/Deckify` (post fast-forward merge `594400d..d7eb8cc`): per-fix source re-reads, targeted Vitest run, full `pnpm test`, `pnpm run typecheck`, `pnpm exec eslint --max-warnings=0`, `pnpm run build`, and atomic commit (`d7eb8cc`).

**Summary:**
- Findings in scope: 3 (`WR-08`, `WR-09`, and `IN-06` under `fix_scope: all`)
- Fixed: 3 (`WR-08` and `WR-09` in iteration 1; `IN-06` in iteration 2)
- Skipped: 0

**Verification Results:**
- Isolated worktree (`C:/Users/djdje/Deckify/.agents/worktrees/rf-19-39076-1795110170`, Iteration 1):
  - `WR-08`: `pnpm test -- --run src/index.test.tsx` (17 tests passed), `pnpm run typecheck` (0 errors), `pnpm run lint` (0 errors, 658 warnings — zero new warnings)
  - `WR-09`: `ast.parse` on `py_modules/soundtrack.py`, `main.py`, `tests/test_soundtrack.py` (`AST_OK`), `py -3 -m unittest discover -s tests -p "test_soundtrack.py"` (54 tests — `OK`), `py -3 -m unittest discover -s tests -p "test_e2e_requirements.py"` (152 tests — `OK`)
- Main checkout (`C:/Users/djdje/Deckify`, Iteration 1 post fast-forward merge `0516be2..fae79d1`):
  - `pnpm test -- --run src/index.test.tsx`: 17 tests passed
  - `pnpm test`: 17 test files passed, 211 tests passed
  - `pnpm run typecheck`: 0 errors
  - `pnpm run lint`: 0 errors (658 warnings)
  - `pnpm run build`: `./src/index.tsx → dist... created dist in 8.4s`
  - `py -3 -m unittest discover -s tests -p "test_*.py"`: Ran 596 tests in 65.690s — `OK`
- Isolated worktree (`C:/Users/djdje/Deckify/.agents/worktrees/rf-19-1236-1795111014`, Iteration 2):
  - `IN-06`: `pnpm test -- --run src/components/tabs/GameEqModal.test.tsx src/components/tabs/SoundtracksTab.test.tsx` (2 test files passed, 40 tests passed), `pnpm run typecheck` (0 errors), `pnpm exec eslint --max-warnings=0 src/components/tabs/GameEqModal.tsx src/components/tabs/SoundtracksTab.tsx` (0 errors, 0 warnings)
- Main checkout (`C:/Users/djdje/Deckify`, Iteration 2 post fast-forward merge `594400d..d7eb8cc`):
  - `pnpm test -- --run src/components/tabs/GameEqModal.test.tsx src/components/tabs/SoundtracksTab.test.tsx`: 2 test files passed, 40 tests passed
  - `pnpm test`: 17 test files passed, 212 tests passed
  - `pnpm run typecheck`: 0 errors
  - `pnpm exec eslint --max-warnings=0 src/components/tabs/GameEqModal.tsx src/components/tabs/SoundtracksTab.tsx`: 0 errors, 0 warnings
  - `pnpm run build`: `./src/index.tsx → dist... created dist in 7.2s`

## Fixed Issues

### WR-08: `handleQuickBind` allows missing or zero `Router.MainRunningApp.appid` to forward an unverified `display_name`

**Files modified:** `src/index.tsx`, `src/index.test.tsx`
**Commit:** `6da2c77`
**Applied fix:** Replaced `(!mainAppId || mainAppId === activeGameAppId)` with `mainAppId === activeGameAppId` in `handleQuickBind` (`src/index.tsx:427`) so missing, `undefined`, empty (`""`), or zero (`0` / `"0"`) `Router.MainRunningApp.appid` values forward `""` instead of an unverified `display_name`, while exact positive matches forward trimmed `display_name`. Added a unit test in `src/index.test.tsx` covering `undefined`, missing `appid`, `""`, `"0"`, `0`, mismatched `"999999"`, and exact `"1091500"` with surrounding whitespace.

### WR-09: `SoundtrackManager._resolve_app_name` executes synchronous `vdf_parser.get_installed_games()` disk I/O on the asyncio event loop (including on unbound game launches)

**Files modified:** `py_modules/soundtrack.py`, `main.py`, `tests/test_soundtrack.py`
**Commit:** `fae79d1`
**Applied fix:** Factored `_resolve_known_app_name` and `_match_vdf_game_name` out of `SoundtrackManager._resolve_app_name` (preserving synchronous compatibility), added `async def _resolve_app_name_async` offloading cold `vdf_parser.get_installed_games` lookups via `asyncio.get_running_loop().run_in_executor(None, vdf_parser.get_installed_games)`, added keyword-only `resolve_vdf: bool = True` to `save_profile` and implemented `async def save_profile_async` delegating with `resolve_vdf=False` to avoid duplicate VDF scans on miss, updated `apply_active_audio_profile` to skip `_resolve_app_name_async` entirely when `profile is None` (unbound launches) and await it when `isinstance(profile, dict)`, updated `bind_current_music_to_game` to await `_resolve_app_name_async` and pass `resolve_vdf=False`, and updated `Plugin.save_game_soundtrack_profile` in `main.py` (with `import inspect`) to await `manager.save_profile_async` when it is a coroutine function while falling back to `manager.save_profile` for plain sync mocks. Added unit tests in `tests/test_soundtrack.py` verifying unbound launches skip VDF completely and async callers offload cold VDF scans via `run_in_executor` without double-calling `vdf_parser.get_installed_games()` on miss.

### IN-06: `Reset to Flat` `DialogButton` uses `minWidth: "auto"` instead of `minWidth: 0`, and `patchProfileAppName` skips `.trim()` on `fallbackName`

**Files modified:** `src/components/tabs/GameEqModal.tsx`, `src/components/tabs/GameEqModal.test.tsx`, `src/components/tabs/SoundtracksTab.tsx`, `src/components/tabs/SoundtracksTab.test.tsx`
**Commit:** `d7eb8cc`
**Applied fix:** Changed `minWidth: "auto"` to `minWidth: 0` on the `Reset to Flat` `<DialogButton>` in `GameEqModal.tsx:208` to match its `flex: 1` row-2 and footer siblings, and updated `patchProfileAppName` (`SoundtracksTab.tsx:108-112`) and `backfillProfileAppNames` (`SoundtracksTab.tsx:114-130`) to trim `fallbackName` / `game.name` and ignore whitespace-only names. Added `expect(resetBtn.props.style.minWidth).toBe(0)` in `GameEqModal.test.tsx` and added unit test assertions in `SoundtracksTab.test.tsx` verifying whitespace-only `game.name` (`"   "`) is ignored and padded `game.name` (`"  Cyberpunk 2077  "`) is stored trimmed across both initial backfill and direct `patchProfileAppName` paths.

---

_Fixed: 2026-11-19T18:00:29Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 2_
