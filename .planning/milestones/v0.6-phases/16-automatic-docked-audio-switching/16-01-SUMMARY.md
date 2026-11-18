---
phase: 16-automatic-docked-audio-switching
plan: 01
subsystem: audio-routing
tags: [pipewire, pactl, usb-dac, hdmi, bluetooth, dock-switching, python]

# Dependency graph
requires:
  - phase: 15-real-pipewire-biquad-equalizer
    provides: EqualizerManager.on_sink_changed and EQ_SINK_NAME virtual sink isolation
provides:
  - DockAudioSwitcher hotplug monitor with 1.8s debounce, USB-DAC > HDMI priority, Bluetooth hold, manual override persistence, and undock restoration
  - Enriched get_audio_sinks() returning {name, description, is_default} excluding deckify_eq_sink
  - set_audio_sink(..., is_auto_dock=False) manual override hook
  - DEFAULT_SETTINGS dock_* configuration keys and main.py lifecycle/RPC/validation integration
affects: [16-02-frontend-dock-settings-and-toasts]

actuals:
  tokens: 38395
  tasks: 3
  commits: 3
plan_head_before: 052c4e3211baae3c9c2c9bfe5854c2771de1e4f9
plan_head_after: 31a3fd906d27a6809d3f3f665874171909e94fb1
commits: 3

tech-stack:
  added: []
  patterns:
    - "pactl subscribe subprocess supervision via _build_deck_command with LD_LIBRARY_PATH stripped and 1.8s debounce"
    - "Per-dock-session manual override tracking until undock/reconnect"

key-files:
  created:
    - py_modules/dock.py
    - tests/test_dock.py
  modified:
    - py_modules/common.py
    - py_modules/volume.py
    - main.py

key-decisions:
  - "Imported py_modules.volume at module level in py_modules/dock.py (while volume.get_audio_sinks imports dock lazily) to avoid circular imports and keep sys.modules binding deterministic under test patching."
  - "Preserved backward compatibility in volume.get_audio_sinks() for callers/mocks returning a plain list instead of (sinks, default_sink)."

patterns-established:
  - "DockAudioSwitcher isolates routing exclusively through volume.set_audio_sink(..., is_auto_dock=True) so EqualizerManager.on_sink_changed and resolve_spotify_sink_input_ids never touch steamwebhelper/Chromium."

requirements-completed: [DOCK-01, DOCK-02]

coverage:
  - id: D1
    description: "DockAudioSwitcher routes Deckify stream to USB-DAC/HDMI on dock (USB-DAC > HDMI priority) and restores pre-dock sink & clock.allowed-rates on undock"
    requirement: DOCK-01
    verification:
      - kind: unit
        ref: "tests/test_dock.py#TestDockTracerSlice.test_dock_usb_and_undock_restores_pre_dock_and_clock"
        status: pass
      - kind: unit
        ref: "tests/test_dock.py#TestDockSwitcherBehavior.test_1_usb_dac_priority_over_hdmi_in_auto_mode"
        status: pass
    human_judgment: false
  - id: D2
    description: "Bluetooth precedence holds dock switching when dock_respect_bluetooth is true and re-evaluates on BT disconnect; manual sink selection sets per-dock-session override"
    requirement: DOCK-01
    verification:
      - kind: unit
        ref: "tests/test_dock.py#TestDockSwitcherBehavior.test_3_bluetooth_precedence_and_disconnect_reeval"
        status: pass
      - kind: unit
        ref: "tests/test_dock.py#TestDockSwitcherBehavior.test_4_manual_override_persists_until_undock_reconnect"
        status: pass
    human_judgment: false
  - id: D3
    description: "Enriched get_audio_sinks() returns {name, description, is_default} excluding deckify_eq_sink, and main.py exposes dock_status & validates dock_* settings"
    requirement: DOCK-02
    verification:
      - kind: unit
        ref: "tests/test_dock.py#TestDockTracerSlice.test_volume_get_audio_sinks_returns_enriched_sinks"
        status: pass
      - kind: unit
        ref: "tests/test_dock.py#TestMainDockIntegration.test_set_setting_validates_dock_target_sink_and_booleans"
        status: pass
    human_judgment: false

duration: 7 min
completed: 2026-11-17
status: complete
---

# Phase 16 Plan 01: Automatic Docked Audio-Switching Backend Summary

**Backend `DockAudioSwitcher` PipeWire hotplug monitor with 1.8s debounce, USB-DAC > HDMI priority, Bluetooth & manual-override precedence, EQ-isolated routing, and `bit_perfect_clock` restoration**

## Performance

- **Duration:** 7 min
- **Started:** 2026-11-17T16:08:41Z
- **Completed:** 2026-11-17T16:15:48Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- Implemented `py_modules/dock.py` with `classify_sink`, `parse_pactl_sinks_detailed`, `get_detailed_sinks`, `select_dock_target`, and `DockAudioSwitcher` (`pactl subscribe` supervision, 1.8s hotplug debounce, Bluetooth hold/re-eval, per-dock manual override, EQ isolation, `bit_perfect_clock` unlock/reset, and `dock_pause_on_undock`).
- Added 5 `dock_*` defaults to `DEFAULT_SETTINGS` in `py_modules/common.py` and updated `py_modules/volume.py` (`get_audio_sinks()` returning `{name, description, is_default}` excluding `deckify_eq_sink`, and `set_audio_sink(..., is_auto_dock=False)` notifying `_dock_switcher.on_manual_sink_selected`).
- Wired `DockAudioSwitcher` lifecycle (`_main`, `_unload`), `get_status()["dock_status"]`, and `set_setting()` validation/hooks in `main.py`, verified by 16 unit tests in `tests/test_dock.py` and the full 517-test Python suite.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end "Auto-Switch on Dock + Undock Restore" slice** - `ccadd70` (feat)
2. **Task 2: Expand DockAudioSwitcher hotplug supervision, Bluetooth/manual override precedence, EQ isolation, and pause-on-undock** - `d56be28` (feat)
3. **Task 3: Integrate DockAudioSwitcher into main.py (_main, _unload, get_status, set_setting, set_audio_sink)** - `31a3fd9` (feat)

## Files Created/Modified
- `py_modules/dock.py` - Dock sink classification, detailed `pactl list sinks` parser, and `DockAudioSwitcher` supervisor.
- `py_modules/common.py` - Added `dock_auto_switch_enabled`, `dock_target_sink`, `dock_respect_bluetooth`, `dock_pause_on_undock`, `dock_toast_enabled` to `DEFAULT_SETTINGS`.
- `py_modules/volume.py` - Enriched `get_audio_sinks()` output and added `is_auto_dock` manual-override notification to `set_audio_sink()`.
- `main.py` - Integrated `DockAudioSwitcher` startup/shutdown, `dock_status` in `get_status()`, and `dock_*` validation/hooks in `set_setting()`.
- `tests/test_dock.py` - 16 unit and integration tests covering DOCK-01 and DOCK-02.

## Decisions Made
- Imported `py_modules.volume` at module level in `py_modules/dock.py` while keeping `dock` lazily imported inside `volume.get_audio_sinks()` to prevent circular imports and ensure deterministic `sys.modules` binding under test mocks.
- Handled both `(sinks, default_sink)` tuples and plain `list` returns in `volume.get_audio_sinks()` so existing `test_plugin_api.py` mocks remain compatible.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Backend `DockAudioSwitcher`, `dock_status` in `get_status()`, `dock_audio_switched` events, and `dock_*` settings RPCs are ready for Plan 16-02 (Frontend Settings UI & Toast notifications).

## Self-Check: PASSED
- `py_modules/dock.py`, `py_modules/common.py`, `py_modules/volume.py`, `main.py`, `tests/test_dock.py` verified on disk.
- Commits `ccadd70`, `d56be28`, `31a3fd9` verified in git history.
- Full Python test suite (517 tests) passed on final commit.

---
*Phase: 16-automatic-docked-audio-switching*
*Completed: 2026-11-17*
