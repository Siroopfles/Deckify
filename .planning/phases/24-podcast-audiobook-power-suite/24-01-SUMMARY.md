---
phase: 24-podcast-audiobook-power-suite
plan: 01
subsystem: api
tags: [spotify, cdp, playback-speed, podcasts, audiobooks, oauth]
status: complete
requires:
  - phase: 22-radio-artist-album-crossfade
    provides: Official Spotify Client CDP bridge pattern and _poll_playback loop
provides:
  - ALLOWED_PLAYBACK_SPEEDS and preferred_podcast_speed default setting in py_modules/common.py
  - user-read-playback-position OAuth scope and CURRENT_SCOPES_VERSION = 8
  - _cdp_set_playback_speed via Platform.Registry PlayerAPI.setSpeed in py_modules/engine.py
  - set_playback_speed RPC with librespot unsupported fallback in py_modules/rpc_playback.py
  - get_show_episodes RPC with show_id sanitization and resume_point normalization in py_modules/rpc_library.py
  - media_type propagation, music 1.0x auto-reset, and preferred_podcast_speed restore in main.py
affects: [24-02, 24-03, 24-04, 24-05]
tech-stack:
  added: []
  patterns:
    - "CDP PlayerAPI.setSpeed invocation via React Fiber Platform.Registry lookup with strict float allowlist"
    - "Spoken-content vs music transition state machine in _poll_playback preserving preferred_podcast_speed on disk"
key-files:
  created:
    - tests/test_podcast_suite.py
  modified:
    - py_modules/common.py
    - py_modules/engine.py
    - py_modules/rpc_playback.py
    - py_modules/rpc_library.py
    - main.py
    - tests/test_discovery.py
key-decisions:
  - "Imported main in tests/test_podcast_suite.py via test_token_refresh to preserve shared sys.modules bindings across unittest discover"
  - "Preserved preferred_podcast_speed in settings when _poll_playback auto-resets active _playback_speed to 1.0x on music transitions"
patterns-established:
  - "All playback speed values validated against ALLOWED_PLAYBACK_SPEEDS (0.5..2.0) and bool-rejected before CDP JS interpolation"
  - "show_id parameters sanitized with urllib.parse.quote(show_id.strip(), safe='') before Spotify Web API path formatting"
requirements-completed: [POD-01, POD-02]
duration: 11min
completed: 2026-11-22
commits: 2
plan_head_before: d6b9524c5ef94f612c94b0b619b2c6c0463499ac
plan_head_after: b6cbf914c6c1e499edd8c48cdb859ada8fcc14de
actuals:
  tokens: 7416
  tasks: 2
  commits: 2
---

# Phase 24 Plan 01: Podcast & Audiobook Power Suite Backend Summary

**Backend playback speed state machine (`0.5x`–`2.0x` CDP `PlayerAPI.setSpeed` with `librespot` fallback), `media_type` propagation with music `1.0x` auto-reset, `user-read-playback-position` scope bump, and `get_show_episodes` drill-down RPC.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-11-22T19:21:14Z
- **Completed:** 2026-11-22T19:32:01Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Added `ALLOWED_PLAYBACK_SPEEDS`, `"preferred_podcast_speed": 1.0` default, `"user-read-playback-position"` scope, and bumped `CURRENT_SCOPES_VERSION` to `8` in `py_modules/common.py`.
- Implemented `_cdp_set_playback_speed` in `py_modules/engine.py` and `set_playback_speed` in `py_modules/rpc_playback.py` with `librespot` `{ ok: false, unsupported_backend: true }` fallback and `playback_speed_changed` event emission.
- Implemented `get_show_episodes` in `py_modules/rpc_library.py` with `show_id` URL-quoting, `market=from_token`, and normalized `resume_position_ms`/`fully_played` metadata.
- Wired `media_type` emission, `get_status()["playback_speed"]`, automatic `1.0x` reset on music transitions (without overwriting `preferred_podcast_speed`), and automatic `preferred_podcast_speed` restore on spoken content in `main.py`.
- Created `tests/test_podcast_suite.py` (9 tests) and verified the full Python test suite (664 tests passing).

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end playback speed tracer slice — scopes, CDP PlayerAPI.setSpeed, set_playback_speed RPC, and Wave 0 test suite** - `a0fb03a` (feat)
2. **Task 2: Wire media_type propagation, music auto-reset/podcast restore in main.py, and get_show_episodes RPC in rpc_library.py** - `b6cbf91` (feat)

## Files Created/Modified
- `py_modules/common.py` - Added `ALLOWED_PLAYBACK_SPEEDS`, `preferred_podcast_speed` default, `user-read-playback-position` scope, and `CURRENT_SCOPES_VERSION = 8`.
- `py_modules/engine.py` - Added `_cdp_set_playback_speed` using React Fiber `Platform.Registry` `PlayerAPI.setSpeed`.
- `py_modules/rpc_playback.py` - Added `set_playback_speed` RPC handler with speed validation and `librespot` fallback.
- `py_modules/rpc_library.py` - Added `get_show_episodes` RPC handler with `show_id` sanitization and `resume_point` normalization.
- `main.py` - Added `_playback_speed`/`_last_media_is_spoken` state, `media_type` propagation, music auto-reset/podcast restore in `_poll_playback`, and `set_playback_speed`/`get_show_episodes` RPC methods.
- `tests/test_discovery.py` - Updated `CURRENT_SCOPES_VERSION` assertion to `8`.
- `tests/test_podcast_suite.py` - Added 9 unit tests covering POD-01 and POD-02 backend behavior.

## Decisions Made
- Imported `main` in `tests/test_podcast_suite.py` via `test_token_refresh` rather than a local `patch.dict("sys.modules", ...)` block so `unittest discover` preserves module identity for `test_e2e_requirements.py`.
- Used `_poll_playback` (the actual polling method in `main.py`) for `media_type` propagation and speed transitions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Shared `sys.modules` main import in `tests/test_podcast_suite.py`**
- **Found during:** Task 2 pre-commit full suite run
- **Issue:** Importing `main` inside a local `with patch.dict("sys.modules", ...)` block in `tests/test_podcast_suite.py` caused `unittest discover` to load a separate `main` module object, breaking `patch.object(main, "_exec")` in `tests/test_e2e_requirements.py`.
- **Fix:** Switched `tests/test_podcast_suite.py` to import `main` via `test_token_refresh` (matching existing suite convention).
- **Files modified:** `tests/test_podcast_suite.py`
- **Verification:** Full `unittest discover` passed 664 tests with 0 failures.
- **Commit:** `b6cbf91`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Fix isolated to test import wiring; no scope creep.

## Issues Encountered
None.

## Next Phase Readiness
- Backend speed state machine, OAuth scope bump, and `get_show_episodes` RPC are complete and tested; ready for Plan 24-02/24-03 frontend UI and smart-skip integration.

## Self-Check: PASSED

- Created/modified files verified on disk (`py_modules/common.py`, `py_modules/engine.py`, `py_modules/rpc_playback.py`, `py_modules/rpc_library.py`, `main.py`, `tests/test_discovery.py`, `tests/test_podcast_suite.py`).
- Commits `a0fb03a` and `b6cbf91` verified as ancestors of `HEAD`.

---
*Phase: 24-podcast-audiobook-power-suite*
*Completed: 2026-11-22*
