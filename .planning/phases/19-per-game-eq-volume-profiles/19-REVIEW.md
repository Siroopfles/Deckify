---
phase: 19-per-game-eq-volume-profiles
reviewed: 2026-11-19T17:29:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - py_modules/soundtrack.py
  - src/components/common/EqBandFaders.tsx
  - src/components/tabs/GameEqModal.test.tsx
  - src/components/tabs/GameEqModal.tsx
  - src/components/tabs/SettingsTab.test.tsx
  - src/components/tabs/SettingsTab.tsx
  - src/components/tabs/SoundtracksTab.test.tsx
  - src/components/tabs/SoundtracksTab.tsx
  - src/index.test.tsx
  - src/index.tsx
  - tests/test_soundtrack.py
findings:
  critical: 0
  warning: 2
  info: 1
  total: 3
  necessity: 0
status: issues_found
---

# Phase 19: Code Review Report (Gap Closure 19-05)

**Reviewed:** 2026-11-19T17:29:00Z
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Reviewed all 11 TypeScript/React, Python, and test files modified in Phase 19's gap-closure plan (`19-05`, addressing UAT gap `G-19-2`) at `standard` depth. Prior Phase 19 review findings (`WR-01`–`WR-07`, `IN-01`–`IN-05`) were already resolved and verified in `.planning/phases/19-per-game-eq-volume-profiles/19-REVIEW-FIX.md`; any new findings below use unused IDs (`WR-08`, `WR-09`, `IN-06`) for clean tracking.

Automated checks executed during this review:
- `py -3 -m unittest discover -s tests -p "test_*.py"`: Ran 594 tests — `OK` (including 52 tests in `tests/test_soundtrack.py`)
- `pnpm test -- --run`: 17 test files passed, 210 tests passed (`SoundtracksTab.test.tsx`: 26, `GameEqModal.test.tsx`: 13, `SettingsTab.test.tsx`: 35, `src/index.test.tsx`: 16)
- `pnpm run typecheck`: 0 errors
- `pnpm run lint`: 0 errors (658 warnings across `src/`, with `0` errors and `0` warnings on `SoundtracksTab.tsx`, `GameEqModal.tsx`, and `EqBandFaders.tsx` via `eslint --max-warnings=0`)
- `pnpm run build`: `./src/index.tsx → dist... created dist in 6.2s`

`SoundtracksTab.tsx`'s explicit `ToggleField` gates and `width: "auto"` `DialogButton`s, `GameEqModal.tsx`'s native `ModalRoot` surface inheritance, `overflowX: "hidden"` bounds, `MAINTAIN_X` two-row preset layout, and body initial focus (`requestAnimationFrame`), `EqBandFaders.tsx`'s `MAINTAIN_X` navigation alignment, and `SettingsTab.tsx`'s dedicated full-width `Active Game EQ Override` banner row are cleanly implemented and preserve `SoundtracksTab` hook slots `0..6`. Adversarial inspection surfaced **2 warnings** (`WR-08` in `src/index.tsx` `handleQuickBind`'s `appid` check and `WR-09` in `py_modules/soundtrack.py` synchronous VDF discovery on the asyncio event loop) plus **1 info item** (`IN-06`). No critical security, crash, or data-loss blockers were found.

## Narrative Findings (AI reviewer)

## Warnings

### WR-08: `handleQuickBind` allows missing or zero `Router.MainRunningApp.appid` to forward an unverified `display_name`

**File:** `src/index.tsx:424-430` (interacting with `py_modules/soundtrack.py:626-628`)
**Issue:** `handleQuickBind` extracts `const mainAppId = Number(mainApp?.appid);` and gates `display_name` propagation with `(!mainAppId || mainAppId === activeGameAppId)`. Because `Number(undefined)` is `NaN` and `Number("")` / `Number("0")` is `0`, `!mainAppId` evaluates to `true` whenever `Router.MainRunningApp` lacks a valid `appid` or reports `0`/`""` (for example during a Steam shell/menu state). That forwards whatever `mainApp.display_name` happens to hold into `backendBindCurrentMusicToGame(activeGameAppId, runningAppName)`, where `SoundtrackManager.bind_current_music_to_game` (`py_modules/soundtrack.py:626-628`) prioritizes non-empty `clean_arg` over `self._resolve_app_name(app_id, existing)` and persists the wrong `app_name` instead of falling back to VDF discovery.
**Fix:** Require an exact positive match with `activeGameAppId` (which is already guaranteed truthy at line 422 and positive finite at line 1265):

```tsx
      const mainApp = Router?.MainRunningApp;
      const mainAppId = Number(mainApp?.appid);
      const runningAppName =
        mainAppId === activeGameAppId && typeof mainApp?.display_name === "string"
          ? mainApp.display_name.trim()
          : "";
      const res = await backendBindCurrentMusicToGame(activeGameAppId, runningAppName);
```

### WR-09: `SoundtrackManager._resolve_app_name` executes synchronous `vdf_parser.get_installed_games()` disk I/O on the asyncio event loop (including on unbound game launches)

**File:** `py_modules/soundtrack.py:194-219, 231-232, 359, 627` (called via `py_modules/soundtrack.py:445` and `main.py:934, 956`)
**Issue:** `vdf_parser.get_installed_games()` (`py_modules/vdf_parser.py:257-271`) performs synchronous directory globbing, ACF/VDF parsing, and non-Steam grid artwork file reads (up to 5 MB per shortcut for base64 encoding) whenever the 30-second `_games_cache` is empty or expired, which is why `Plugin.get_installed_games` (`main.py:907-911`) offloads it via `run_in_executor`. By contrast, `async def apply_active_audio_profile` (`py_modules/soundtrack.py:359`) and `async def bind_current_music_to_game` (`py_modules/soundtrack.py:627`), as well as `Plugin.save_game_soundtrack_profile` -> `save_profile` (`main.py:934`, `py_modules/soundtrack.py:232`), call `self._resolve_app_name(...)` synchronously on the event loop. Furthermore, `_run_launch` (`py_modules/soundtrack.py:445`) invokes `apply_active_audio_profile(app_id, None)` on every unbound game launch, causing cold-cache launches of games with no profile (`profile is None`, `eq_preset is None`) to run a blocking full-library disk scan on the event loop even though no profile exists to heal and `SettingsTab` only shows the override banner when `eq_preset` is set.
**Fix:** Split fast in-memory lookup from executor-backed VDF lookup for async callers (`apply_active_audio_profile`, `bind_current_music_to_game`, and `Plugin.save_game_soundtrack_profile`), and skip VDF scanning in `apply_active_audio_profile` when `profile is None`:

```python
    def _resolve_known_app_name(self, app_id: int, profile: dict | None = None) -> str:
        if isinstance(profile, dict):
            name = _clean_str(profile.get("app_name")).strip()
            if name:
                return name
        existing = self.get_profile(app_id)
        if isinstance(existing, dict):
            name = _clean_str(existing.get("app_name")).strip()
            if name:
                return name
        return ""

    @staticmethod
    def _match_vdf_game_name(app_id: int, games) -> str:
        if not isinstance(games, list):
            return ""
        for game in games:
            if (
                isinstance(game, dict)
                and not isinstance(game.get("app_id"), bool)
                and game.get("app_id") == app_id
            ):
                name = _clean_str(game.get("name")).strip()
                if name:
                    return name
        return ""

    async def _resolve_app_name_async(self, app_id: int, profile: dict | None = None) -> str:
        name = self._resolve_known_app_name(app_id, profile)
        if name:
            return name
        try:
            games = await asyncio.get_running_loop().run_in_executor(
                None, vdf_parser.get_installed_games
            )
            return self._match_vdf_game_name(app_id, games)
        except Exception:
            return ""
```

In `apply_active_audio_profile`, resolve `app_name = await self._resolve_app_name_async(app_id, profile) if isinstance(profile, dict) else ""`, and in `bind_current_music_to_game`, await `self._resolve_app_name_async(app_id, existing)`.

## Info

### IN-06: `Reset to Flat` `DialogButton` uses `minWidth: "auto"` instead of `minWidth: 0`, and `patchProfileAppName` skips `.trim()` on `fallbackName`

**File:** `src/components/tabs/GameEqModal.tsx:203-224` & `src/components/tabs/SoundtracksTab.tsx:108-111`
**Issue:** In `GameEqModal.tsx:208`, `Reset to Flat` sets `minWidth: "auto"` alongside `flex: 1`, whereas its three `InteractiveRow` row-2 siblings (`lines 232-233`) and both `flex: 1` footer `DialogButton`s (`lines 284, 298`) set `minWidth: 0` so columns shrink uniformly regardless of text width. Separately, in `SoundtracksTab.tsx:108-111`, `patchProfileAppName` checks `!fallbackName` rather than trimming `fallbackName`, so a whitespace-only game name would pass truthiness and be stored untrimmed.
**Fix:** Change `minWidth: "auto"` to `minWidth: 0` on `Reset to Flat` in `GameEqModal.tsx:208`, and trim `fallbackName` in `SoundtracksTab.tsx:108-111`:

```tsx
function patchProfileAppName(profile: SoundtrackProfile, fallbackName: string): SoundtrackProfile {
  const cleanFallback = fallbackName.trim();
  if (profile.app_name?.trim() || !cleanFallback) return profile;
  return { ...profile, app_name: cleanFallback };
}
```

---

_Reviewed: 2026-11-19T17:29:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
