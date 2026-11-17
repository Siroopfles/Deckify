---
phase: 16-automatic-docked-audio-switching
verified: 2026-11-17T19:05:15Z
status: passed
score: 12/12 must-haves verified
covered_files:
  - .planning/phases/16-automatic-docked-audio-switching/16-01-PLAN.md
  - .planning/phases/16-automatic-docked-audio-switching/16-01-SUMMARY.md
  - .planning/phases/16-automatic-docked-audio-switching/16-02-PLAN.md
  - .planning/phases/16-automatic-docked-audio-switching/16-02-SUMMARY.md
  - main.py
  - py_modules/common.py
  - py_modules/dock.py
  - py_modules/volume.py
  - src/components/tabs/SettingsTab.test.tsx
  - src/components/tabs/SettingsTab.tsx
  - src/index.tsx
  - src/types.ts
  - tests/test_dock.py
covered_digest: "v4:sha256:c3c9a3a0f7556518ca20516b43446b5cdb701f3d649ac0e770b6762689b6a50d"
behavior_unverified: 0
overrides_applied: 0
---

# Phase 16: Automatic Docked Audio-Switching Verification Report

**Phase Goal:** Connecting a designated external USB-DAC or HDMI sink automatically routes Deckify's audio stream with bit-perfect clock support and restores normal routing on undock.
**Verified:** 2026-11-17T19:05:15Z
**Status:** passed
**Re-verification:** No — refreshed verification after post-implementation fix `efe242e` and `16-UAT.md` completion (6/6 passed)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Connecting a designated USB-DAC or HDMI sink (or selecting Auto USB-DAC > HDMI) automatically routes only Deckify's audio stream (`effect_output.deckify_eq` when EQ is active, or `librespot` when bypassed) to that sink after hotplug debounce. | ✓ VERIFIED | `py_modules/dock.py` (`DockAudioSwitcher._monitor_loop`, `_schedule_debounced_evaluate` with `DOCK_HOTPLUG_DEBOUNCE_S = 1.8`, `evaluate_now` calling `volume.set_audio_sink(..., is_auto_dock=True)`); `tests/test_dock.py` (`test_dock_usb_and_undock_restores_pre_dock_and_clock`, `test_6_eq_isolation_routes_via_eq_manager`, `test_8_hotplug_debounce_coalesces_rapid_events`) pass; hardware hotplug confirmed in `16-UAT.md` Test 1. |
| 2 | When Auto target is selected and both USB-DAC and HDMI sinks are present, USB-DAC takes priority over HDMI. | ✓ VERIFIED | `py_modules/dock.py:select_dock_target` (lines 118-125) selects `usb_sinks[0]` before `hdmi_sinks[0]`; `tests/test_dock.py` (`test_1_usb_dac_priority_over_hdmi_in_auto_mode`, `test_2_specific_target_sink_overrides_auto_priority`) pass. |
| 3 | Active Bluetooth headphones (`bluez_output.*`) are respected when `dock_respect_bluetooth` is true, and disconnecting Bluetooth while still docked re-evaluates and routes to the dock sink. | ✓ VERIFIED | `py_modules/dock.py` (`_is_bluetooth_active`, `evaluate_now` lines 371-374 sets `bluetooth_held` and skips switch); `tests/test_dock.py` (`test_3_bluetooth_precedence_and_disconnect_reeval`) passes. |
| 4 | Manual sink selection while docked sets a per-dock-session override so Deckify does not snap back until an undock/re-dock cycle occurs. | ✓ VERIFIED | `py_modules/volume.py:set_audio_sink` (lines 190-196) records `plugin._active_audio_sink` and calls `dock_switcher.on_manual_sink_selected(target)` when `not is_auto_dock`; `py_modules/dock.py` (lines 364-368, 378-386) preserves `manual_override` until `_dock_session_sink` disappears; `tests/test_dock.py` (`test_4_manual_override_persists_until_undock_reconnect`) passes. |
| 5 | Undocking restores the captured pre-dock sink (falling back to `@DEFAULT_SINK@`), resets PipeWire `clock.allowed-rates` to `[ 48000 ]`, and optionally pauses playback when `dock_pause_on_undock` is enabled. | ✓ VERIFIED | `py_modules/dock.py:_restore_pre_dock` (lines 302-344) restores `_pre_dock_sink` or `default_sink` or `"@DEFAULT_SINK@"`, calls `volume.configure_pipewire_clock(False)`, and pauses via `plugin.control_playback("pause")`; `tests/test_dock.py` (`test_dock_usb_and_undock_restores_pre_dock_and_clock`, `test_undock_falls_back_to_default_sink_token_when_pre_dock_missing`, `test_5_pause_on_undock_respects_setting_and_play_state`, `test_7_disable_while_docked_restores_sink_and_clock`) pass. |
| 6 | `get_audio_sinks()` returns enriched `{name, description, is_default}` entries while excluding virtual `deckify_eq_sink`. | ✓ VERIFIED | `py_modules/dock.py:parse_pactl_sinks_detailed` filters `eq_virtual` (`deckify_eq_sink`, `effect_input.deckify_eq`); `py_modules/volume.py:get_audio_sinks` (lines 140-169) returns `{name, description, is_default, is_active}` (with `efe242e` active-sink tracking); `tests/test_dock.py` (`test_parse_pactl_sinks_detailed_excludes_eq_sink`, `test_volume_get_audio_sinks_returns_enriched_sinks`) pass. |
| 7 | SettingsTab renders a dedicated `"Docked Audio-Switching"` card adjacent to `"Audio Output Sink (PipeWire)"` with live status badge, 4 `ToggleField`s, and `Target Dock / DAC Sink` selector. | ✓ VERIFIED | `src/components/tabs/SettingsTab.tsx` (lines 667-823) renders `"Docked Audio-Switching"` card with live status badge, 4 toggles (`Auto-Switch on Dock`, `Respect Bluetooth Headphones`, `Pause on Undock`, `Dock Switch Toasts`), and `Target Dock / DAC Sink` rows; `src/components/tabs/SettingsTab.test.tsx` (24 tests) passes. |
| 8 | `Target Dock / DAC Sink` selector always renders `"Auto (USB-DAC / HDMI)"` first followed by detected PipeWire sinks, and displays empty-state guidance when no external USB-DAC/HDMI sinks are connected. | ✓ VERIFIED | `src/components/tabs/SettingsTab.tsx` (lines 752-820) renders `"Auto (USB-DAC / HDMI)"` first, maps `audioSinks`, and renders `"No External Dock / DAC Sinks Detected"` when `!hasExternalDockSink`; verified by `SettingsTab.test.tsx`. |
| 9 | All `ToggleField` and `InteractiveRow` stacks inside the `"Docked Audio-Switching"` card are wrapped in `<Focusable flow-children="column">` for SteamOS GamepadUI D-pad navigation. | ✓ VERIFIED | `src/components/tabs/SettingsTab.tsx` (lines 636, 719, 752) wraps stacks in `<Focusable flow-children="column">`; verified by `SettingsTab.test.tsx`. |
| 10 | Selecting a sink in `"Audio Output Sink (PipeWire)"` while docked updates status to `Manual Override` without snapping back. | ✓ VERIFIED | `main.py:set_audio_sink` (lines 961-962) passes `plugin=self` to `volume.set_audio_sink`, which invokes `_dock_switcher.on_manual_sink_selected(target)`, and `SettingsTab.tsx` (lines 643-652) refreshes `loadAudioSinks()` and `refreshStatus()` and highlights `is_active`. |
| 11 | `dock_audio_switched` backend events display a single Decky toast from `src/index.tsx` when `dock_toast_enabled` is true, while `SettingsTab` refreshes status and `audioSinks` without firing duplicate toasts. | ✓ VERIFIED | `src/index.tsx` subscribes to `dock_audio_switched` and calls `toaster.toast` when `toast_enabled !== false`; `src/components/tabs/SettingsTab.tsx` only calls `refreshStatus()` and `loadAudioSinks()` without calling `showToast`. |
| 12 | Quick Access Menu (`src/index.tsx` QAM UI) remains compact with zero dock-switching controls. | ✓ VERIFIED | `src/index.tsx` only adds `dockToastEnabledRef` and the global `dock_audio_switched` toast listener in `useEffect`; no dock toggles or sink selectors were added to QAM UI. |

**Score:** 12/12 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `py_modules/dock.py` | `DockAudioSwitcher`, sink classification, `pactl subscribe` monitor with 1.8s debounce | ✓ VERIFIED | 429 lines; exports `DOCK_HOTPLUG_DEBOUNCE_S`, `classify_sink`, `parse_pactl_sinks_detailed`, `get_detailed_sinks`, `select_dock_target`, `DockAudioSwitcher`. |
| `py_modules/common.py` | `DEFAULT_SETTINGS` `dock_*` configuration keys | ✓ VERIFIED | Defines `dock_auto_switch_enabled`, `dock_target_sink`, `dock_respect_bluetooth`, `dock_pause_on_undock`, `dock_toast_enabled`. |
| `py_modules/volume.py` | Enriched `get_audio_sinks()` and `set_audio_sink(..., is_auto_dock=False)` manual override hook | ✓ VERIFIED | Lines 140-199 implement enriched sinks (`is_default`, `is_active`), `_active_audio_sink` tracking, and `is_auto_dock` manual override notification. |
| `main.py` | `DockAudioSwitcher` lifecycle (`_main`/`_unload`), `get_status` `dock_status`, `set_setting` validation & hooks | ✓ VERIFIED | Integrates `_dock_switcher` in `_main`/`_unload`, `dock_status` in `get_status`, `dock_*` validation/hooks in `set_setting`, and passes `plugin=self` in `get_audio_sinks`/`set_audio_sink`. |
| `tests/test_dock.py` | Unit tests for DOCK-01 and DOCK-02 (`min_lines: 180`) | ✓ VERIFIED | 16 unit/integration tests covering all backend behaviors and `main.py` wiring; all pass. |
| `src/types.ts` | `DockStatusState`, `DockStatusInfo`, `EngineSettings` `dock_*` fields, `StatusResponse.dock_status` | ✓ VERIFIED | Exports `DockStatusState`, `DockStatusInfo`, `AudioSinkInfo.is_active`, `dock_*` in `EngineSettings`, `dock_status` in `StatusResponse`. |
| `src/index.tsx` | Global `dock_audio_switched` event listener for Decky toast notifications | ✓ VERIFIED | Registers and cleans up `dock_audio_switched` listener with zero QAM controls. |
| `src/components/tabs/SettingsTab.tsx` | `"Docked Audio-Switching"` card, toggles, `Target Dock / DAC Sink` `InteractiveRow`s, status badge | ✓ VERIFIED | Lines 630-823 implement active-sink highlighting (`efe242e`), `"Docked Audio-Switching"` card, toggles, and empty-state guidance. |
| `src/components/tabs/SettingsTab.test.tsx` | Vitest unit tests for `"Docked Audio-Switching"` UI and interactions | ✓ VERIFIED | 24 tests in `SettingsTab.test.tsx` pass. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `py_modules/dock.py` | `py_modules/volume.py` | `volume.set_audio_sink(target, plugin=self._plugin, is_auto_dock=True)` and `volume.configure_pipewire_clock` | ✓ WIRED | Verified in `py_modules/dock.py` lines 313-314, 393, 400. |
| `py_modules/volume.py` | `py_modules/dock.py` | `set_audio_sink(..., is_auto_dock=False)` notifies `_dock_switcher.on_manual_sink_selected(target)` | ✓ WIRED | Verified in `py_modules/volume.py` lines 190-196. |
| `main.py` | `py_modules/dock.py` | `self._dock_switcher = dock.DockAudioSwitcher(self)` in `_main` and `stop()` in `_unload` | ✓ WIRED | Verified in `main.py`. |
| `src/components/tabs/SettingsTab.tsx` | `main.py` | `backendSetSetting('dock_*', value)` and `addEventListener('dock_audio_switched')` | ✓ WIRED | Verified in `SettingsTab.tsx`. |
| `src/index.tsx` | `main.py` | `addEventListener('dock_audio_switched') -> toaster.toast` | ✓ WIRED | Verified in `src/index.tsx`. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Phase 16 backend unit & integration tests | `py -3 -m unittest discover -s tests -p "test_dock.py" -v` | 16 tests ran in 0.918s — OK | ✓ PASS |
| Full Python test suite | `py -3 -m unittest discover -s tests -p "test_*.py"` | 517 tests ran in 31.882s — OK | ✓ PASS |
| SettingsTab Vitest suite | `pnpm test -- --run src/components/tabs/SettingsTab.test.tsx` | 24 tests passed | ✓ PASS |
| Full Vitest suite | `pnpm test -- --run` | 16 files, 164 tests passed | ✓ PASS |
| TypeScript & ESLint checks | `pnpm typecheck; pnpm lint` | 0 TypeScript errors, 0 ESLint errors | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `DOCK-01` | `16-01-PLAN.md`, `16-02-PLAN.md` | Automatic docked audio-switching in `SettingsTab` routing only Deckify's stream (`effect_output.deckify_eq` or `librespot`) to USB-DAC/HDMI after hotplug debounce | ✓ SATISFIED | `py_modules/dock.py`, `py_modules/volume.py`, `main.py`, `src/components/tabs/SettingsTab.tsx`, `tests/test_dock.py`, `SettingsTab.test.tsx`, `16-UAT.md` |
| `DOCK-02` | `16-01-PLAN.md`, `16-02-PLAN.md` | Docked switching enables `bit_perfect_clock` on designated DAC/HDMI sinks and cleanly restores normal routing and clock settings when undocked | ✓ SATISFIED | `py_modules/dock.py` (`evaluate_now`, `_restore_pre_dock`, `on_settings_changed`), `py_modules/volume.py:configure_pipewire_clock`, `tests/test_dock.py`, `16-UAT.md` |

No orphaned requirements found for Phase 16 in `.planning/REQUIREMENTS.md`.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| — | — | None found in Phase 16 files | — | 0 debt markers (`TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`) and 0 stub implementations detected. |

### Human Verification Required

None — all observable truths, wiring links, prohibitions, and requirement checks are verified by codebase inspection, passing automated unit/integration test suites, and completed Steam Machine UAT (`16-UAT.md`: 6/6 passed).

### Gaps Summary

No gaps found. Phase 16 goal achieved.

---

_Verified: 2026-11-17T19:05:15Z_
_Verifier: the agent (gsd-verifier)_
