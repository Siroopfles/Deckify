---
phase: 17-event-driven-librespot-suspend-wi-fi-resilience
plan: 01
subsystem: backend-resilience
tags: [librespot, onevent, unix-socket, suspend-resume, wifi-resilience, session-bookmark]
status: complete
requires: [13-01, 13-02]
provides:
  - "LibrespotEventServer AF_UNIX server with <5ms POSIX sh --onevent emitter and Base16->Base62 TRACK_ID normalization"
  - "400ms debounced Web API enrichment and adaptive 20s/3s _poll_api_loop"
  - "SessionBookmarkManager with atomic persistence, 4s Wi-Fi grace window, unified _recovery_lock + 10s cooldown, remote conflict yield, and 1-24h/Never expiry"
  - "Plugin RPCs: get_resilience_status, restore_bookmark, dismiss_bookmark"
affects: [17-02]
tech-stack:
  added: []
  patterns:
    - "Non-blocking POSIX sh --onevent Unix socket emitter (socat/nc/curl fallback, zero Python subprocess startup)"
    - "Synchronous backend state update prior to decky.emit('librespot_event') with 400ms debounced _poll_playback enrichment"
    - "Unified asyncio.Lock + 10s cooldown serializing PrepareForSleep, _monitor_process watchdog, and 4s buffer-aware Wi-Fi recovery"
key-files:
  created:
    - py_modules/resilience.py
    - tests/test_resilience.py
  modified:
    - py_modules/common.py
    - py_modules/__init__.py
    - main.py
key-decisions:
  - "Generated a <5ms POSIX /bin/sh emitter script in DECKY_PLUGIN_RUNTIME_DIR writing KEY=VALUE pairs in background (&) to AF_UNIX socket so librespot --onevent never spawns a blocking Python interpreter"
  - "Updated plugin._poll_play_state, _poll_progress_ms, _poll_duration_ms, and _last_event synchronously before awaiting decky.emit('librespot_event') while leaving _poll_track_id to _poll_playback so 400ms debounced enrichment still emits full track_metadata"
  - "Serialized SuspendResumeMonitor._on_deck_resume, _monitor_process SUSPEND_THRESHOLD, and 4s buffer-aware Wi-Fi drop recovery behind a single asyncio.Lock and 10s cooldown in SessionBookmarkManager"
requirements-completed: [RESIL-01, RESIL-02]
duration: 21min
completed: 2026-11-17
plan_head_before: 1324e5e5eb901a01f688d6e0a9c0418e41cb0dfe
plan_head_after: 24914697124239bfb19e4fd112e16c2546234708
commits: 2
actuals:
  tokens: 14500
  tasks: 2
  commits: 2
---

# Phase 17 Plan 01: Event-Driven librespot & Suspend/Wi-Fi Resilience Backend Summary

**Event-driven `librespot --onevent` AF_UNIX socket server with `<5ms` POSIX `sh` emitter, Base16→Base62 ID normalization, 400ms debounced Web API enrichment, adaptive 20s/3s polling, and unified suspend/Wi-Fi session bookmark resilience.**

## Performance

- **Duration:** 21 min
- **Started:** 2026-11-17T19:11:00Z
- **Completed:** 2026-11-17T19:33:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added `ONEVENT_SOCK_FILE`, `ONEVENT_EMITTER_SCRIPT`, `SESSION_BOOKMARK_FILE`, and 5 `resilience_*` settings (`resilience_auto_resume`, `resilience_bookmark_expiry_hours` clamped to `1..24`, `resilience_bookmark_never_expires`, `resilience_toast_enabled`, `resilience_prompt_held_enabled`) in `py_modules/common.py`.
- Implemented `normalize_spotify_id`, `write_onevent_emitter`, `parse_onevent_payload`, and `LibrespotEventServer` in `py_modules/resilience.py` to receive `KEY=VALUE`, JSON, or HTTP POST payloads over `AF_UNIX`, update playback state synchronously before `decky.emit("librespot_event")`, debounce `_poll_playback()` enrichment by 400ms on rapid skips, and relax `_poll_api_loop` to 20.0s when healthy and local (auto-reverting to 3.0s via `_poll_wake_event` on remote device, `spotify_client`, or unhealthy `--onevent`).
- Implemented `SessionBookmarkManager` in `py_modules/resilience.py` with atomic temp-file + `os.replace()` bookmark persistence, corrupt-JSON fallback, 4s buffer-aware Wi-Fi grace window (`D-02`), unified `_recovery_lock` + 10s cooldown across `PrepareForSleep` (`dbus`), `_monitor_process` (`watchdog`), and `wifi` triggers, `was_playing` check (`D-01`), `/v1/me/player` remote active device conflict yield (`D-06`), configurable `1–24h`/`Never` expiry (`D-07`), and manual `restore_bookmark` / `dismiss_bookmark` RPCs in `main.py`.
- Added 15 unit and integration tests in `tests/test_resilience.py` covering `RESIL-01` and `RESIL-02` with zero regressions across all 532 backend unit tests.

## Coverage

- `tests/test_resilience.py`: 15 tests passing (`TestResilienceNormalizationAndSettings`, `TestLibrespotEventServer`, `TestSessionBookmarkManager`)
- Full backend suite: 532 tests passing (`py -3 -m unittest discover -s tests -p "test_*.py"`)

## Task Commits

1. **Task 1: End-to-end --onevent Unix socket push, Base16->Base62 normalization, adaptive polling, and Wave 0 test scaffold** — `5457e78` (`feat`)
2. **Task 2: SessionBookmarkManager, unified wake lock, 4s Wi-Fi grace window, conflict yield, and resilience RPCs** — `2491469` (`feat`)

## Files Created/Modified

- `py_modules/common.py` — Runtime paths (`ONEVENT_SOCK_FILE`, `ONEVENT_EMITTER_SCRIPT`, `SESSION_BOOKMARK_FILE`), `resilience_*` defaults, and `[1, 24]` expiry clamping in `_load_settings_impl`.
- `py_modules/__init__.py` — Exported new runtime path constants and `resilience` module.
- `py_modules/resilience.py` — `normalize_spotify_id`, `write_onevent_emitter`, `LibrespotEventServer`, and `SessionBookmarkManager`.
- `main.py` — Wired `LibrespotEventServer`, `SessionBookmarkManager`, `--onevent` launch args, adaptive `_poll_api_loop`, unified wake recovery, `get_status` resilience fields, and `get_resilience_status` / `restore_bookmark` / `dismiss_bookmark` RPCs.
- `tests/test_resilience.py` — Unit and integration test suite for `RESIL-01` and `RESIL-02`.

## Decisions Made

- Used `self._last_seen_track_id` inside `LibrespotEventServer` for 400ms debounce deduplication while leaving `plugin._poll_track_id` mutation to `_poll_playback()`, ensuring `_poll_playback()` still detects the track change and emits full `track_metadata` after the 400ms debounce window.
- Kept `flush_snapshot()` preserving the in-memory `self._bookmark` when already populated so pre-sleep/pre-drop `position_ms` and `was_playing` states are not overwritten by stale poll attributes during disconnect transitions.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- Verified `py_modules/resilience.py`, `py_modules/common.py`, `main.py`, and `tests/test_resilience.py` exist on disk.
- Verified task commits `5457e78` and `2491469` exist in git history.
- Verified `py -3 -m unittest tests/test_resilience.py -v` (15 tests) and full suite (532 tests) pass.
