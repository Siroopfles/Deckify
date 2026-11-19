---
phase: 19-per-game-eq-volume-profiles
reviewed: 2026-11-19T18:14:50Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - main.py
  - py_modules/soundtrack.py
  - src/components/tabs/GameEqModal.test.tsx
  - src/components/tabs/GameEqModal.tsx
  - src/components/tabs/SoundtracksTab.test.tsx
  - src/components/tabs/SoundtracksTab.tsx
  - src/index.test.tsx
  - src/index.tsx
  - tests/test_soundtrack.py
findings:
  critical: 0
  warning: 0
  info: 0
  total: 0
  necessity: 0
status: clean
---

# Phase 19: Code Review Report

**Reviewed:** 2026-11-19T18:14:50Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** clean

## Summary

Completed an incremental `standard`-depth adversarial code review of the 9 Phase 19 (`19-per-game-eq-volume-profiles`) files modified since commit `4bc437d628d2f589ed83e7930934b94940b1c411`, covering the fix commits `6da2c77` (`WR-08`), `fae79d1` (`WR-09`), and `d7eb8cc` (`IN-06`) in full surrounding source context.

All reviewed files meet quality standards. No issues found.

Automated checks executed during this review:
- `py -3 -m unittest discover -s tests -p "test_*.py"`: Ran 596 tests in 70.245s — `OK`
- `py -3 -m unittest discover -s tests -p "test_soundtrack.py"`: Ran 54 tests in 8.343s — `OK`
- `pnpm test -- --run`: 17 test files passed, 212 tests passed (`GameEqModal.test.tsx`: 13, `SoundtracksTab.test.tsx`: 27, `src/index.test.tsx`: 17)
- `pnpm run typecheck`: 0 errors (`tsc --noEmit`)
- `pnpm exec eslint --max-warnings=0 src/components/tabs/SoundtracksTab.tsx src/components/tabs/GameEqModal.tsx`: 0 errors, 0 warnings
- `pnpm run lint`: 0 errors (658 pre-existing warnings across `src/`)
- `pnpm run build`: `./src/index.tsx → dist... created dist in 7.1s`

## Narrative Findings (AI reviewer)

### Verified Fixes (`4bc437d628d2f589ed83e7930934b94940b1c411..HEAD`)

- **WR-08 (`6da2c77`, `src/index.tsx:421-430`, `src/index.test.tsx:412-449`):** Verified clean. `handleQuickBind` now requires `mainAppId === activeGameAppId && typeof mainApp?.display_name === "string"` instead of `(!mainAppId || mainAppId === activeGameAppId)`. Because `if (!activeGameAppId) return;` guarantees a truthy positive `activeGameAppId`, missing, `undefined`, empty (`""`), zero (`0` / `"0"`), `NaN`, or mismatched `Router.MainRunningApp.appid` values all evaluate to `""`, preventing stale `display_name` values from leaking into `bind_current_music_to_game`. Exact positive matches trim and forward `display_name`. Verified by unit test coverage in `src/index.test.tsx`.
- **WR-09 (`fae79d1`, `py_modules/soundtrack.py:194-282, 400-407, 671-681`, `main.py:6, 928-943`, `tests/test_soundtrack.py:690-723, 1075-1119`):** Verified clean. `SoundtrackManager` splits fast in-memory resolution (`_resolve_known_app_name`) and static VDF matching (`_match_vdf_game_name`) from `_resolve_app_name_async`, which offloads cold `vdf_parser.get_installed_games` calls via `asyncio.get_running_loop().run_in_executor(None, vdf_parser.get_installed_games)` inside `try/except`. `save_profile` retains synchronous compatibility while adding `*, resolve_vdf: bool = True`, and `save_profile_async` validates inputs upfront, skips VDF when `app_name` is already known, shallow-copies `profile_data`, and delegates to `save_profile(..., resolve_vdf=False)` (re-reading `existing` post-`await` to avoid clobbering concurrent profile field updates or performing a duplicate VDF scan on miss). `apply_active_audio_profile` skips `_resolve_app_name_async` completely when `profile is None` (unbound launches), `bind_current_music_to_game` awaits `_resolve_app_name_async` and passes `resolve_vdf=False`, and `Plugin.save_game_soundtrack_profile` uses `inspect.iscoroutinefunction` to await `save_profile_async` with clean fallback to `save_profile` for sync test doubles.
- **IN-06 (`d7eb8cc`, `src/components/tabs/GameEqModal.tsx:203-224`, `src/components/tabs/GameEqModal.test.tsx:566-573`, `src/components/tabs/SoundtracksTab.tsx:108-130`, `src/components/tabs/SoundtracksTab.test.tsx:897-973`):** Verified clean. `Reset to Flat` in `GameEqModal.tsx:208` uses `minWidth: 0` alongside `flex: 1`, matching its row-2 `InteractiveRow` siblings and footer `DialogButton`s. `patchProfileAppName` (`SoundtracksTab.tsx:108-112`) trims `fallbackName` and ignores whitespace-only strings, and `backfillProfileAppNames` (`SoundtracksTab.tsx:114-130`) trims `game.name` and ignores whitespace-only names before backfilling.

No new Critical, Warning, Info, or Necessity issues were found in the scoped diff.

---

_Reviewed: 2026-11-19T18:14:50Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
