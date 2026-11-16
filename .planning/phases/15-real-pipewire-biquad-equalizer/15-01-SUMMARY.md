---
phase: 15-real-pipewire-biquad-equalizer
plan: 01
subsystem: audio-dsp
tags: [pipewire, filter-chain, biquad, equalizer, python, asyncio]
status: complete
requires:
  - phase: 13-like-button-403-fix-and-sink-input-guardrails
    provides: resolve_spotify_sink_input_ids with steamwebhelper/Chromium deny-list
provides:
  - EqualizerManager managing isolated pipewire -c 10-band biquad filter-chain
  - 7-preset EQ_PRESETS curves (flat, bass, vocal, gaming, deck_speakers, late_night, custom)
  - Automatic negative preamp headroom (-max(0, max_band_gain)) on eq_preamp:Mult
  - Stream-isolated sink-input routing in engine.py and volume.py
  - set_eq_bands RPC and 7-preset validation in main.py
affects:
  - 15-02 (SettingsTab 7 preset pills and 10-band ISO sliders UI)
tech-stack:
  added: []
  patterns:
    - Isolated pipewire -c client process with priority.session=0 and priority.driver=0
    - Coalesced ~75ms pw-cli set-param updates and 500ms debounced settings persistence
    - Dual-mode resolve_spotify_sink_input_ids (include_eq_output / eq_output_only)
key-files:
  created:
    - py_modules/equalizer.py
    - tests/test_equalizer.py
  modified:
    - py_modules/common.py
    - py_modules/engine.py
    - py_modules/volume.py
    - py_modules/__init__.py
    - main.py
decisions:
  - "D-01/D-03: Implemented 10-band ISO EQ (31Hz..16kHz) with 7 presets (flat, bass, vocal, gaming, deck_speakers, late_night, custom)"
  - "D-04/D-05: flat tears down pipewire -c for true bypass; active EQ isolates librespot -> deckify_eq_sink and moves only effect_output.deckify_eq on set_audio_sink"
  - "D-06/D-07: Automatic negative preamp headroom on eq_preamp:Mult, ~75ms pw-cli coalescing, and 500ms settings.json debounce"
requirements-completed:
  - EQ-01
  - EQ-02
duration: 6min
completed: 2026-11-16
commits: 3
plan_head_before: ad32e4da0541e5066cea23aaeddc6043f6dcaf30
plan_head_after: d335e8f1fe44bee7a957d4a68f121f05e5928a14
actuals:
  tasks: 3
  commits: 3
---

# Phase 15 Plan 01: Real PipeWire Biquad Equalizer Backend Summary

**Real-time 10-band ISO PipeWire `filter-chain` biquad equalizer backend (`EqualizerManager`) with automatic negative preamp headroom, `flat` true bypass, `~75ms` `pw-cli` coalescing, `500ms` settings debounce, and stream-isolated sink routing.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-11-16T16:31:14Z
- **Completed:** 2026-11-16T16:37:00Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Created `py_modules/equalizer.py` with `EQ_BAND_FREQS` (31Hz–16kHz), 7 `EQ_PRESETS` curves, `clamp_eq_bands()`, `compute_preamp_db()`, `generate_filter_chain_conf()`, `parse_eq_node_id()`, `build_pw_cli_params()`, and `EqualizerManager` running `pipewire -c` under UID 1000 via `_build_deck_command()` with `LD_LIBRARY_PATH` stripped.
- Extended `py_modules/common.py` (`eq_custom_bands` default + 7-preset validation and 10-band float clamping in `_load_settings`) and `py_modules/__init__.py` (`equalizer` export).
- Extended `py_modules/engine.py` (`resolve_spotify_sink_input_ids` and `_set_pactl_sink_input` with `include_eq_output` and `eq_output_only` flags) and `py_modules/volume.py` (`apply_equalizer_preset`, EQ-aware `set_audio_sink`) so switching hardware sinks keeps `librespot` on `deckify_eq_sink` and moves only `effect_output.deckify_eq`.
- Wired `EqualizerManager` lifecycle (`_main`, `_unload`, `start_librespot`), 7-preset `set_setting("eq_preset", ...)` validation, `set_eq_bands(bands)` RPC, and `plugin=self` in `set_audio_sink` into `main.py`.
- Added 19 unit tests in `tests/test_equalizer.py`; all 500 backend tests pass (`test_equalizer.py`, `test_volume.py`, `test_features.py`, and full suite via pre-commit).

## Task Commits

1. **Task 1: EqualizerManager, 10-band filter-chain conf, preamp math, and Wave 0 tests** - `0d3bffd` (feat)
2. **Task 2: Stream-isolated sink-input routing and EQ-aware set_audio_sink** - `d2d2332` (feat)
3. **Task 3: Wire EqualizerManager lifecycle, 7-preset validation, and set_eq_bands RPC in main.py** - `d335e8f` (feat)

## Deviations from Plan

None - plan executed as written.

## Self-Check: PASSED

- `py_modules/equalizer.py`, `tests/test_equalizer.py`, `py_modules/common.py`, `py_modules/engine.py`, `py_modules/volume.py`, `py_modules/__init__.py`, `main.py` verified on disk.
- Commits `0d3bffd`, `d2d2332`, `d335e8f` verified in git history.
- `py -3 -m unittest discover -s tests -p "test_equalizer.py"` (19 tests), `test_volume.py` (58 tests), `test_features.py` (28 tests), and full pre-commit suite (500 tests) passed.
