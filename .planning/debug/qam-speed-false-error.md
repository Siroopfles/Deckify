---
status: diagnosed
trigger: "qam-speed-false-error: QAM speed cycle pill shows 'failed to change' error toast even though playback speed actually changes on Spotify Client."
created: 2026-11-22T20:26:25Z
updated: 2026-11-22T20:27:45Z
---

## Current Focus

hypothesis: Confirmed — `rpc_playback.set_playback_speed` calls `plugin._save_settings()` after `_cdp_set_playback_speed` succeeds, but `main.Plugin` has no `_save_settings` method (it is a module-level function `_save_settings(plugin._settings)`). This raises `AttributeError` after the CDP speed change has already executed, causing the RPC promise to reject and QAM's `handleCycleSpeed` catch block to display `"Failed to change playback speed — please try again."`.
test: Verified in `main.py`, `py_modules/rpc_playback.py`, `py_modules/common.py`, `src/index.tsx`, and `tests/test_podcast_suite.py`.
expecting: N/A (diagnosis complete)
next_action: Return ROOT CAUSE FOUND to caller.

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: Clicking QAM speed cycle pill changes playback speed (0.5x-2.0x) without showing an error toast when the speed change succeeds.
actual: "Ja de speed changes werken. alleen geeft hij in QAM een heletijd een error als ik er op druk met failed to change zegt hij maar hij veranderd wel."
errors: Error toast with "failed to change" (or similar) in QAM when pressing the speed cycle pill.
reproduction: Test 1 in UAT (Phase 24) - press QAM speed cycle pill while playing a podcast on Spotify Client.
timeline: Discovered during Phase 24 UAT

## Eliminated
<!-- APPEND only - prevents re-investigating -->

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-11-22T20:27:00Z
  checked: `src/index.tsx` lines 1231-1257 (`handleCycleSpeed`)
  found: Calls `await backendSetPlaybackSpeed(next)`. On `res?.ok`, updates state; on `!res?.ok` or thrown exception (`catch`), shows `toaster.toast` with `"Failed to change playback speed — please try again."` (or `res?.error`).
  implication: Either `backendSetPlaybackSpeed` returns `{ok: false}` or rejects with an unhandled backend exception.

- timestamp: 2026-11-22T20:27:15Z
  checked: `py_modules/rpc_playback.py` lines 652-683 (`set_playback_speed`)
  found: After `await _exec(_cdp_set_playback_speed, target_speed)` succeeds and returns `{"ok": True, ...}`, lines 679-683 execute: `plugin._playback_speed = target_speed`, `plugin._settings["preferred_podcast_speed"] = target_speed`, `plugin._save_settings()`, `await decky.emit("playback_speed_changed", ...)`, `return {"ok": True, "speed": target_speed}`.
  implication: `plugin._save_settings()` is called on the `Plugin` instance outside any `try/except`.

- timestamp: 2026-11-22T20:27:19Z
  checked: `main.py` and `py_modules/` for `_save_settings`
  found: `main.Plugin` has NO `_save_settings` method. `_save_settings` is a module-level function in `main.py:72` and `py_modules/common.py:533` taking `(settings: dict, settings_file: str | None = None)`. All other modules (`rpc_library.py`, `volume.py`, `equalizer.py`) import `_save_settings` from `py_modules.common` and call `_save_settings(plugin._settings)`.
  implication: In production, `plugin._save_settings()` raises `AttributeError: 'Plugin' object has no attribute '_save_settings'` AFTER `_cdp_set_playback_speed` has already changed the speed on Spotify Client. The unhandled `AttributeError` rejects the RPC call, triggering `handleCycleSpeed`'s `catch` toast.

- timestamp: 2026-11-22T20:27:28Z
  checked: `tests/test_podcast_suite.py` lines 14-24 (`make_plugin`)
  found: The unit test helper `make_plugin()` constructs a `SimpleNamespace(..., _save_settings=MagicMock())`, masking the fact that `main.Plugin` has no `_save_settings` method.
  implication: Explains why unit tests passed while production failed.

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: `py_modules/rpc_playback.py:681` calls `plugin._save_settings()` after `_cdp_set_playback_speed` has already changed the playback speed on the Spotify Client, but `main.Plugin` has no `_save_settings` method (`_save_settings` is a module-level function in `py_modules/common.py` / `main.py` taking `plugin._settings`). This raises an unhandled `AttributeError`, rejecting the `set_playback_speed` RPC call and causing `handleCycleSpeed` in `src/index.tsx` (and `handleSetPlaybackSpeed` in `DeckifyExpandedModal.tsx`) to enter `catch` and display the `"Failed to change playback speed — please try again."` error toast even though the speed change succeeded.
fix:
verification:
files_changed: []
