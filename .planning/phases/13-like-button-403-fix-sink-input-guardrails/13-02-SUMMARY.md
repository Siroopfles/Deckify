---
phase: 13-like-button-403-fix-sink-input-guardrails
plan: 02
subsystem: audio
tags: [pipewire, pulseaudio, pactl, sink-inputs, guardrails, python]
requires:
  - phase: 13-like-button-403-fix-sink-input-guardrails
    plan: 01
    provides: Phase 13 test suite (`tests/test_phase13.py`) and engine/volume baseline
provides:
  - "Shared `resolve_spotify_sink_input_ids(stdout, pids)` helper in `py_modules/engine.py` with allowlist (`librespot`, `spotify`, `com.spotify.client`, `deckify_eq_out`) and deny-list (`steamwebhelper`, `Chromium`)"
  - "Hardened `_set_pactl_sink_input(target_sink, pids)` in `py_modules/engine.py` using `_build_deck_command`, flag-injection guard, and 0-match debug no-op"
  - "`VolumeFader.resolve_sink_input_id()` in `py_modules/volume.py` wired to `resolve_spotify_sink_input_ids`"
  - "Guardrail unit tests in `tests/test_volume.py` and `tests/test_phase13.py`"
affects: [15-equalizer, 16-docked-flow, audio-routing, volume-ducking]
tech-stack:
  added: []
  patterns:
    - "Single shared PipeWire sink-input resolver enforcing deny-list before PID/allowlist matching"
    - "Safe 0-match debug no-op and CLI flag-injection validation on `pactl move-sink-input`"
key-files:
  created: []
  modified:
    - py_modules/engine.py
    - py_modules/volume.py
    - tests/test_volume.py
    - tests/test_phase13.py
key-decisions:
  - "D-05: Centralized sink-input resolution in `resolve_spotify_sink_input_ids` with `steamwebhelper`/`Chromium` deny-list applied before PID priority and allowlist (`librespot`, `spotify`, `com.spotify.client`, `deckify_eq_out`) matching"
  - "D-06: `_set_pactl_sink_input` logs at debug level and returns `False` as a safe no-op when 0 matching sink-inputs are active, and rejects empty or `-`-prefixed `target_sink` values"
patterns-established:
  - "All `pactl` sink-input discovery and moving routes through `_build_deck_command` and `resolve_spotify_sink_input_ids`"
requirements-completed: [LIB-02]
duration: 3min
completed: 2026-11-16
status: complete
commits: 2
plan_head_before: b3c42f84053306cec1df9bb5217cea3fa3d9e07f
plan_head_after: f41196562e64439bf8d8899933560b8328766181
actuals:
  tokens: 3538
  tasks: 2
  commits: 2
---

# Phase 13 Plan 02: Sink-Input Guardrails Summary

**Centralized PipeWire/PulseAudio sink-input resolution into `resolve_spotify_sink_input_ids()` in `py_modules/engine.py` with strict `steamwebhelper`/`Chromium` deny-list + Spotify/Deckify allowlist filtering, and wired both `_set_pactl_sink_input()` and `VolumeFader.resolve_sink_input_id()` to use it.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-11-16T12:15:41Z
- **Completed:** 2026-11-16T12:18:36Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Extracted `resolve_spotify_sink_input_ids(stdout: str, pids: set[str] | None = None) -> list[str]` in `py_modules/engine.py` to parse `Sink Input #N` blocks, strip `steamwebhelper` and `Chromium` blocks first, prioritize matching process PIDs, and fall back to allowlisted tokens (`librespot`, `spotify`, `com.spotify.client`, `deckify_eq_out`) across `application.name`, `media.name`, `node.name`, and `application.process.binary`.
- Hardened `_set_pactl_sink_input(target_sink, pids)` in `py_modules/engine.py` to validate `target_sink` against empty or `-`-prefixed values, execute `pactl list sink-inputs` and `pactl move-sink-input` via `_build_deck_command`, log at debug level and return `False` on 0 matches, and move only validated numeric Spotify/Deckify sink-input IDs.
- Refactored `VolumeFader.resolve_sink_input_id()` in `py_modules/volume.py` to delegate block parsing and filtering to `resolve_spotify_sink_input_ids` while preserving `_build_deck_command` and `_exec` execution.
- Added unit tests in `tests/test_volume.py` (`test_resolve_sink_input_id_skips_steamwebhelper_and_chromium_for_spotify_client`, `test_resolve_sink_input_id_matches_deckify_eq_out`) and `tests/test_phase13.py` (`TestPhase13SinkInputGuardrails`).

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract resolve_spotify_sink_input_ids and wire _set_pactl_sink_input and VolumeFader.resolve_sink_input_id** - `1d0dfcb` (refactor)
2. **Task 2: Add sink-input guardrail unit tests and run full test suite** - `f411965` (test)

## Files Created/Modified

- `py_modules/engine.py` - Added `resolve_spotify_sink_input_ids` and hardened `_set_pactl_sink_input`
- `py_modules/volume.py` - Wired `VolumeFader.resolve_sink_input_id` to `resolve_spotify_sink_input_ids`
- `tests/test_volume.py` - Added `steamwebhelper`/`Chromium` exclusion and `deckify_eq_out` resolution tests
- `tests/test_phase13.py` - Added `TestPhase13SinkInputGuardrails` covering multi-stream isolation, 0-match no-op, and flag-injection rejection

## Decisions Made

None - followed plan as specified.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. Live Steam Deck verification with active game + Steam UI audio remains a manual check in `13-VALIDATION.md`.

## Next Phase Readiness

- Phase 13 (`LIB-01` and `LIB-02`) is complete and all 468 Python unit tests pass; ready for Phase 13 verification.

## Self-Check: PASSED

- Verified files exist: `py_modules/engine.py`, `py_modules/volume.py`, `tests/test_volume.py`, `tests/test_phase13.py`
- Verified commits exist in HEAD: `1d0dfcb`, `f411965`
- Verified test suites passed: `test_volume.py` (50 tests) and full `unittest discover -s tests -p "test_*.py"` suite (468 tests)
