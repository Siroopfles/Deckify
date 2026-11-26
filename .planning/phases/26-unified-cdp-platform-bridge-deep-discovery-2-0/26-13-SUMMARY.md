---
phase: 26-unified-cdp-platform-bridge-deep-discovery-2-0
plan: 13
subsystem: playback
tags: [spotify, librespot, cdp, playback, auto-transfer, error-handling]

requires:
  - phase: 26-unified-cdp-platform-bridge-deep-discovery-2-0
    provides: "CDP station radio resolution and DiscoveryTab mixes"
provides:
  - "play=False inactive-device activation in auto_transfer_and_play with local device preference and returned device_id"
  - "Explicit target device_id and error surfacing on play_tracks 404 retry (no silent except Exception: pass)"
  - "CDP PlayerAPI.play fallback in play_tracks when spotify_client is active and Web API returns 403/404"
affects: [playback, song-radio, librespot-daylist, spotify-client]

tech-stack:
  added: []
  patterns:
    - "Transfer with play=False before PUT /me/player/play when a playback body (uris or context_uri) is present, preventing Spotify from resuming a prior restricted context (e.g., DJ X)."
    - "Structured _parse_spotify_error propagation on play_tracks retry failures instead of swallowing exceptions."

key-files:
  created: []
  modified:
    - py_modules/rpc_playback.py
    - main.py
    - tests/test_radio_waterfall.py
    - tests/test_features.py
    - tests/test_century_coverage.py

key-decisions:
  - "Updated main.py:_auto_transfer_and_play to forward play: bool = True to rpc_playback.auto_transfer_and_play (Rule 2: ensures real Plugin instances do not hit TypeError and fall back to play=True)."
  - "Updated tests/test_century_coverage.py:test_main_century_final_lines assertion for play_tracks retry exception from ok=True (old silent-swallow bug) to ok=False with error message."

patterns-established:
  - "Inactive Connect device activation always uses play=False when followed by explicit uris/context_uri playback."

requirements-completed: [DISC-04]

coverage:
  - id: D1
    description: "auto_transfer_and_play activates inactive devices with play=False when play_tracks has uris/context_uri and targets returned device_id"
    requirement: "DISC-04"
    verification:
      - kind: unit
        ref: "tests/test_features.py#test_auto_transfer_and_play_play_false_returns_device_id"
        status: pass
      - kind: unit
        ref: "tests/test_features.py#test_play_tracks_context_uri_404_transfers_with_play_false"
        status: pass
    human_judgment: false
  - id: D2
    description: "play_tracks surfaces retry HTTPError/Exception instead of swallowing silently, and start_radio recovers from inactive SteamMachine"
    requirement: "DISC-04"
    verification:
      - kind: unit
        ref: "tests/test_radio_waterfall.py#test_start_radio_inactive_device_transfers_play_false_and_retries_play"
        status: pass
      - kind: unit
        ref: "tests/test_radio_waterfall.py#test_play_tracks_surfaces_retry_403_restriction_violated"
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-11-26
status: complete
---

# Phase 26 Plan 13: Fix Inactive-Device Transfer (`play=False`) & Retry Error Surfacing Summary

**Fixed `auto_transfer_and_play` and `play_tracks` to activate inactive devices with `play=False`, target `device_id` explicitly, fall back to CDP `PlayerAPI.play` when `spotify_client` is running, and surface retry errors instead of swallowing them.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-11-26T18:17:42Z
- **Completed:** 2026-11-26T18:23:30Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Updated `py_modules/rpc_playback.py:auto_transfer_and_play` to accept `play: bool = True`, prefer the local/active device, only set `_poll_play_state = "playing"` when `play` is `True`, and return `{"ok": True, "device_id": device_id}`.
- Updated `py_modules/rpc_playback.py:play_tracks` to pass `play=not bool(body)` to `_auto_transfer_and_play`, target the returned `device_id` on retry, fall back cleanly to CDP `PlayerAPI.play` via `_try_cdp_play_fallback` when `spotify_client` is running, and surface any retry `HTTPError` or `Exception` via `_parse_spotify_error` / `str(exc)` instead of `except Exception: pass`.
- Added unit tests in `tests/test_radio_waterfall.py` and `tests/test_features.py` covering `play=False` transfer, `device_id` targeting, `403 Restriction violated` error surfacing, and inactive-device `start_radio` recovery.

## Task Commits

1. **Task 1: Fix auto_transfer_and_play (`play=False` + `device_id`) and `play_tracks` retry error propagation + CDP playback** - `7d6b16c` (fix)
2. **Task 2: Align `test_features` `_exec` mock for `play=False` transfer tests** - `9f8a7e2` (test)

## Files Created/Modified
- `py_modules/rpc_playback.py` - Added `play` parameter + local device preference in `auto_transfer_and_play`, `_try_cdp_play_fallback`, `play=False` transfer on 404 with body, `device_id` targeting, and explicit retry error handling in `play_tracks`.
- `main.py` - Forwarded `play: bool = True` in `Plugin._auto_transfer_and_play`.
- `tests/test_radio_waterfall.py` - Added `test_start_radio_inactive_device_transfers_play_false_and_retries_play` and `test_play_tracks_surfaces_retry_403_restriction_violated`.
- `tests/test_features.py` - Added `test_auto_transfer_and_play_play_false_returns_device_id` and `test_play_tracks_context_uri_404_transfers_with_play_false`.
- `tests/test_century_coverage.py` - Updated `test_main_century_final_lines` to expect `ok=False` with `"Retry play fail"` instead of silent swallow.

## Decisions Made
- Forwarded `play: bool = True` in `main.py:_auto_transfer_and_play` so real `Plugin` instances do not fall back to `play=True` via the `TypeError` compatibility shim.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Forwarded `play` in `main.py:_auto_transfer_and_play`**
- **Found during:** Task 1
- **Issue:** `Plugin._auto_transfer_and_play` in `main.py` only accepted `(self, token: str, device_id: str = "")`, which would cause `TypeError` and fall back to `play=True` on real `Plugin` instances.
- **Fix:** Added `play: bool = True` parameter and forwarded `play=play` to `rpc_playback.auto_transfer_and_play`.
- **Files modified:** `main.py`
- **Verification:** Full 779-test suite passed.
- **Committed in:** `7d6b16c`

**2. [Rule 1 - Bug] Updated legacy assertion in `tests/test_century_coverage.py`**
- **Found during:** Task 1 verification
- **Issue:** `test_main_century_final_lines` asserted `r_pt["ok"] is True` when `play_tracks` retry raised `Exception("Retry play fail")` (testing the old silent-swallow behavior).
- **Fix:** Updated assertion to `self.assertFalse(r_pt["ok"])` and `self.assertIn("Retry play fail", r_pt["error"])`.
- **Files modified:** `tests/test_century_coverage.py`
- **Verification:** Full 779-test suite passed.
- **Committed in:** `7d6b16c`

---

**Total deviations:** 2 auto-fixed (1 Rule 1, 1 Rule 2)
**Impact on plan:** Necessary for correctness on real `Plugin` instances and test alignment with the new error-surfacing contract.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
Ready for Plan 26-14 and UAT Round 3 re-verification of G-26-7 and G-26-8 on Steam Machine.

## Self-Check: PASSED
