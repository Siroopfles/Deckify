---
phase: 19-per-game-eq-volume-profiles
verified: 2026-11-19T08:33:12Z
status: human_needed
score: 9/10 must-haves verified
covered_files:
  - .planning/phases/19-per-game-eq-volume-profiles/19-01-PLAN.md
  - .planning/phases/19-per-game-eq-volume-profiles/19-01-SUMMARY.md
  - .planning/phases/19-per-game-eq-volume-profiles/19-02-PLAN.md
  - .planning/phases/19-per-game-eq-volume-profiles/19-02-SUMMARY.md
  - .planning/phases/19-per-game-eq-volume-profiles/19-03-PLAN.md
  - .planning/phases/19-per-game-eq-volume-profiles/19-03-SUMMARY.md
  - .planning/phases/19-per-game-eq-volume-profiles/19-04-PLAN.md
  - .planning/phases/19-per-game-eq-volume-profiles/19-04-SUMMARY.md
  - main.py
  - py_modules/common.py
  - py_modules/equalizer.py
  - py_modules/soundtrack.py
  - py_modules/volume.py
  - src/components/DeckifyExpandedModal.tsx
  - src/components/common/EqBandFaders.tsx
  - src/components/tabs/GameEqModal.tsx
  - src/components/tabs/SettingsTab.tsx
  - src/components/tabs/SoundtracksTab.tsx
  - src/components/tabs/soundtrackUtils.ts
  - src/index.tsx
  - src/types.ts
covered_digest: "v4:sha256:65a6f17f83881d723d68be141eb5545c7bba0d0682abf125a2459fe6148aa8d8"
behavior_unverified: 0
overrides_applied: 0
decision_coverage:
  honored: 16
  total: 16
  not_honored: []
coincidental_reliance_items:
  - truth: "Launching a game with an assigned audio profile automatically applies the ephemeral EQ and volume/ducking override without overwriting the user's persistent global eq_preset or baseline volume on disk (SC-2)"
    reason: undeclared-precondition
    harden: "Update py_modules/volume.py:boost_pa_volume() to compute the target sink volume via fader._compute_target_sink_volume() (and 0.0 when _sleep_locked) instead of unconditionally setting 150% when not fader.is_ducked, so late librespot stream creation or mid-game librespot restarts cannot overwrite an active game volume_override ceiling or _sleep_locked fade."
human_verification:
  - test: "Verify live PipeWire filter-chain transition and pactl sink-input fade on Steam Deck hardware (non-inferable backstop)"
    reason: insufficient_spec
    expected: "Launching and exiting Steam/Non-Steam games (including rapid game switches and mid-game GameEqModal pw-cli previews) transitions deckify_eq_sink and pactl set-sink-input-volume smoothly with no audible clicks, pops, or steamwebhelper/Chromium UI sound interference."
    why_human: "Non-inferable backstop truth (verification: backstop): pipewire, pw-cli, and pactl binaries are SteamOS-only and mocked in Windows unit tests; held-out or live Steam Deck audio verification is required."
  - test: "Verify end-to-end SoundtracksTab, GameEqModal, SettingsTab, and QAM GAME VOL / DUCKED UX in SteamOS GamepadUI (1280x800)"
    expected: "Controller D-pad navigation traverses horizontal rows (flow-children='horizontal') without focus traps; Edit Game EQ modal renders all 10 ISO faders within 82vh; SettingsTab shows truncated Active Game EQ Override badge while keeping edits bound to global baseline; QAM displays GAME VOL / DUCKED pills and live effective_volume; two-step Delete Game Profile confirmation works cleanly."
    why_human: "Visual layout, controller spatial navigation, and real GamepadUI modal stacking via @decky/ui showModal cannot be exercised in headless Vitest shallow-JSX mocks."
  - test: "Verify crash recovery (active_game_override_snapshot + eq.pid) and Sleep Timer _sleep_locked priority on Steam Deck"
    expected: "Killing/restarting Decky Loader mid-game cleans orphan pipewire -c via eq.pid and restores global EQ (including tearing down deckify_eq_sink when global is flat) and un-ducked baseline on Plugin._main(); exiting a game while a Sleep Timer fade is active restores global EQ and clears snapshot without un-ducking or resuming pre-game playback."
    why_human: "Requires real SteamOS process lifecycle, PulseAudio/PipeWire daemon state, and Decky Loader plugin restart behavior."
---

# Phase 19: Per-Game EQ & Volume Profiles Verification Report

**Phase Goal:** Users can assign a custom 10-band PipeWire EQ preset and target volume/ducking level to individual games in SoundtracksTab that activate automatically on game launch and cleanly restore the global audio baseline on game exit or crash recovery.
**Verified:** 2026-11-19T08:33:12Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | **SC-1 (ROADMAP):** User can select and bind a per-game 10-band EQ preset and target volume/ducking level to any Steam or Non-Steam game profile in `SoundtracksTab`. | ✓ VERIFIED | `SoundtracksTab.tsx:417-596` renders `EQ Preset Override` (`EQ_OVERRIDE_OPTIONS`), conditional `Edit Game EQ` -> `GameEqModal`, `Volume Override` (`0..100%` + `Clear Volume Override`), `Ducking Attenuation Override` (`0..95%` + `Use Global Ducking`), and `SoundtrackManager._sanitize_profile` (`py_modules/soundtrack.py:116-191`) persists all fields. Verified by `SoundtracksTab.test.tsx` (19/19) & `test_soundtrack.py`. |
| 2 | **SC-2 (ROADMAP):** Launching a game with an assigned audio profile automatically applies the ephemeral EQ and volume/ducking override without overwriting the user's persistent global `eq_preset` or baseline volume on disk. | ✓ VERIFIED (coincidental-reliance) | `SoundtrackManager._run_launch` (`py_modules/soundtrack.py:407-474`) calls `apply_active_audio_profile()` in atomic order (EQ -> `active_game_override_snapshot` -> clear `_cached_sink_input_id` -> `VolumeFader.apply_game_override`), including 0-playlist audio-only profiles (zero `soundtrack_prompt_switch`) and `prompt_switch` flows, without mutating `settings["eq_preset"]`/`eq_custom_bands`. Holds under `coincidental-reliance` (`undeclared-precondition`: assumes `volume.boost_pa_volume` does not execute after `apply_game_override`; see `coincidental_reliance_items`). |
| 3 | **SC-3 (ROADMAP):** Exiting the game (or restarting the plugin after an unexpected crash/reboot via `active_game_override_snapshot`) restores the user's global EQ preset and volume baseline while respecting any active Sleep Timer fade-out priority lock (`_sleep_locked`). | ✓ VERIFIED | `SoundtrackManager._run_exit` (`py_modules/soundtrack.py:475-547`) restores global EQ first (`clear_ephemeral_override`), clears `active_game_override_snapshot`, invalidates `_cached_sink_input_id`, skips `clear_game_override` and playback restore when `_sleep_locked is True`, and preserves `_pre_game_snapshot` across back-to-back A→B switches. `Plugin._main()` (`main.py:163-214`) runs `cleanup_stale_process()` and recovers stale `active_game_override_snapshot` (tearing down even on `eq_preset == "flat"` and respecting `_sleep_locked`). Verified by `test_soundtrack.py` & `test_volume.py`. |
| 4 | `EqualizerManager` isolates `_ephemeral_preset`/`_ephemeral_bands` and `_preview_active` from global settings, preserves active game EQ on `librespot` restart, cleans stale `eq.pid`, exposes validated `preview_eq_bands`/`clear_eq_preview` RPCs, and `SettingsTab` shows the truncated `"Active Game EQ Override"` badge while keeping edits bound to global baseline. | ✓ VERIFIED | `py_modules/equalizer.py:216-672`, `py_modules/volume.py:97-112`, `main.py:66-78, 566-571, 1085-1122`, and `SettingsTab.tsx:214-237, 510-579`. Verified by `test_equalizer.py` (31/31) and `SettingsTab.test.tsx` (35/35). |
| 5 | `VolumeFader` computes sink-input volume 100% locally via PipeWire with zero `set_volume` calls in `SoundtrackManager`, combining ceiling (`0..100`), ducking attenuation (`0..95`, min factor `0.05`), global ducking, and `voice` VAD min-dip; QAM displays live `effective_volume` and `"DUCKED"` / `"GAME VOL"` pills; ducking triggers post-debounce with pending `_exit_task` guard. | ✓ VERIFIED | `py_modules/volume.py:228-387, 473-485`, zero `set_volume` in `py_modules/soundtrack.py`, `main.py:936-1000`, and `src/index.tsx:289-306, 908-933`. Verified by `test_volume.py` (68/68), `test_soundtrack.py`, and `src/index.test.tsx` (16/16). |
| 6 | Boundary sanitization and idempotency invariants: exact numeric bounds (`0..100`, `0..95`, `-12.0..+12.0` 2-decimal rounding, positive `int` snapshot `app_id`, rejecting `bool`/`NaN`/`Inf`) and idempotent repeat calls on ephemeral EQ, preview, `set_ducking(False, 'game')`, and `clear_game_override`. | ✓ VERIFIED | `py_modules/common.py:231-242`, `py_modules/equalizer.py:54-73, 508-516, 533-534, 575-576`, `py_modules/soundtrack.py:148-181`, `py_modules/volume.py:284-290, 369-384`. Verified by `test_equalizer.py`, `test_volume.py`, and `test_soundtrack.py`. |
| 7 | `EqBandFaders` shares 10 ISO faders across `SettingsTab` and `GameEqModal`; `GameEqModal` handles seeding, `Copy from Preset` + `Reset to Flat`, neutral `Flat Curve (0.0 dB)` caption, error recovery, `82vh` overflow bounds, and `isRunningGame`-aware `clear_eq_preview` on Save/Discard/Cancel/unmount. | ✓ VERIFIED | `EqBandFaders.tsx:6-234`, `GameEqModal.tsx:55-422`. Verified by `GameEqModal.test.tsx` (9/9) and `SettingsTab.test.tsx` (35/35). |
| 8 | `SoundtracksTab` renders D-11 subtitles, conditional `Edit Game EQ` button, dual Volume/Ducking sliders with Clear/Use Global buttons, two-step `Delete Game Profile` confirmation, immediate running-game hot-apply (`refresh_active_overrides`), empty/loading/error/truncation states, and `DeckifyExpandedModal` wires `runningAppId`/global baselines with modal trigger suppression. | ✓ VERIFIED | `soundtrackUtils.ts:9-208`, `SoundtracksTab.tsx:108-1016`, `DeckifyExpandedModal.tsx:748-751, 1229-1238`. Verified by `SoundtracksTab.test.tsx` (19/19) and `test_soundtrack.py`. |
| 9 | `Plugin.get_status()` exposes `active_game_app_id` and `active_game_override` while excluding `active_game_override_snapshot` from `settings`, and `Plugin.set_setting("active_game_override_snapshot", ...)` rejects external writes. | ✓ VERIFIED | `main.py:593-641, 699-700`. Verified by `test_soundtrack.py` (`test_status_and_ducking_state_expose_game_override_and_hide_snapshot`, `test_set_setting_rejects_active_game_override_snapshot`). |
| 10 | **Non-inferable Backstop (`19-01`):** Live PipeWire filter-chain transition and `pactl` sink-input fade execute without audible clicks or `steamwebhelper` interference during concurrent game launch/exit on Steam Deck. | ⚠️ INSUFFICIENT_SPEC (abstained) | Tagged `verification: backstop`. All tests run on Windows with mocked `pipewire`/`pw-cli`/`pactl` subprocesses; no live Steam Deck PipeWire execution or held-out hardware test exists. Abstained per Step 3 item 5b (`reason: insufficient_spec`) and routed to Human Verification. |

**Score:** 9/10 must-haves verified (0 failed, 0 behavior-unverified, 1 non-inferable `backstop` abstained with `reason: insufficient_spec`)

### Decision Coverage

`check.decision-coverage-verify` evaluated `19-CONTEXT.md` against Phase 19 artifacts:
- **Result:** 16 / 16 trackable CONTEXT.md decisions (`D-01` through `D-16`) honored (`not_honored: []`).
- **Message:** All trackable CONTEXT.md decisions are honored by shipped artifacts.

### Test Quality Audit

| Test File | Linked Req | Active | Skipped | Circular | Assertion Level | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| `tests/test_equalizer.py` | GAME-01 | 31 | 0 | 0 | Value + Behavioral | ✓ PASS (subprocess mocked) |
| `tests/test_volume.py` | GAME-01 | 68 | 0 | 0 | Value + Behavioral | ✓ PASS (subprocess mocked) |
| `tests/test_soundtrack.py` | GAME-01 | 46 | 0 | 0 | Value + Behavioral | ✓ PASS (async lifecycle + mocks) |
| `tests/test_e2e_requirements.py` | GAME-01 | 152 | 0 | 0 | Behavioral | ✓ PASS |
| `src/components/tabs/GameEqModal.test.tsx` | GAME-01 | 9 | 0 | 0 | Value + Behavioral | ✓ PASS (shallow JSX + mocked RPCs) |
| `src/components/tabs/SettingsTab.test.tsx` | GAME-01 | 35 | 0 | 0 | Value + Behavioral | ✓ PASS (shallow JSX + mocked RPCs) |
| `src/components/tabs/SoundtracksTab.test.tsx` | GAME-01 | 19 | 0 | 0 | Value + Behavioral | ✓ PASS (shallow JSX + mocked RPCs) |
| `src/index.test.tsx` | GAME-01 | 16 | 0 | 0 | Value + Behavioral | ✓ PASS (shallow JSX + mocked RPCs) |

**Disabled tests on requirements:** 0 (only unrelated `tests/test_uninstall.py:21` `@unittest.skipUnless(SHELL, "POSIX shell required")`)
**Circular patterns detected:** 0
**Insufficient assertions:** 0 (note: SteamOS PipeWire binary behavior and live GamepadUI rendering are outside unit-test mock boundaries and routed to Human Verification)

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `py_modules/common.py` | `EQ_PID_FILE`, `active_game_override_snapshot` default & load sanitizer | ✓ VERIFIED | Lines 45, 88, 231-242: validates non-bool positive `int` `app_id` in `[1, 0xFFFFFFFF]` |
| `py_modules/equalizer.py` | 3-layer `EqualizerManager` & `eq.pid` lifecycle | ✓ VERIFIED | 702 lines; `has_ephemeral_override`, `get_active_override_info`, `apply_ephemeral_preset`, `clear_ephemeral_override`, `preview_bands`, `clear_preview`, `cleanup_stale_process`, `clamp_eq_bands` |
| `py_modules/volume.py` | Unified local `VolumeFader` overrides, `_sleep_locked` guard, `has_game_override`, global EQ isolation | ✓ VERIFIED | 589 lines; `_compute_target_sink_volume`, `apply_game_override`, `clear_game_override`, `has_game_override`, `apply_equalizer_preset` |
| `py_modules/soundtrack.py` | Extended profile schema/sanitizer, sequenced `_run_launch`/`_run_exit`, A→B preservation, zero `set_volume` | ✓ VERIFIED | 596 lines; zero `set_volume` calls; `apply_active_audio_profile`, `refresh_active_overrides`, sequenced `_run_launch`/`_run_exit` |
| `main.py` | Boot crash recovery, preview RPCs, post-debounce ducking, live refresh, status exposure | ✓ VERIFIED | `_validate_eq_bands`, `_main()` crash recovery, `preview_eq_bands`, `clear_eq_preview`, `get_status`, `set_setting`, `trigger_ducking`, `get_ducking_state`, `start_librespot` |
| `src/types.ts` | Phase 19 TypeScript contracts | ✓ VERIFIED | Exports `ActiveGameOverrideInfo`, `DuckingState.has_game_override`, `StatusResponse` game fields, `SoundtrackProfile` EQ/ducking fields |
| `src/components/tabs/soundtrackUtils.ts` | EQ labels/options, D-11 subtitle formatter, immutable setters, `normalizeProfiles` backfill | ✓ VERIFIED | 222 lines; `EQ_PRESET_LABELS`, `EQ_OVERRIDE_OPTIONS`, `formatGameProfileSubtitle`, `setEqPreset`, `setEqCustomBands`, `setDuckingLevelOverride` |
| `src/components/common/EqBandFaders.tsx` | Shared 10-band ISO fader renderer (`flow-children="horizontal"`) | ✓ VERIFIED | 234 lines; `EQ_BAND_LABELS`, `EQ_SHORT_LABELS`, `EQ_PRESET_CURVES`, `normalizeEqBands`, `renderEqBandFaders`, `EqBandFaders` |
| `src/components/tabs/GameEqModal.tsx` | Dedicated 10-band custom EQ modal with seeding, presets, live preview, restore/save | ✓ VERIFIED | 422 lines; `GameEqModal`, `GameEqModalProps`, `resolveInitialModalBands`, `ModalRootCompat` |
| `src/components/tabs/GameEqModal.test.tsx` | Wave 0 Vitest suite for `GameEqModal` | ✓ VERIFIED | 501 lines; 9 passing tests covering seeding, neutral/error/overflow states, sliders, presets, and `isRunningGame` branches |
| `src/components/tabs/SettingsTab.tsx` | `renderEqBandFaders`, `Active Game EQ Override` badge + caption, event listener | ✓ VERIFIED | Consumes `renderEqBandFaders`, subscribes to `game_audio_override_changed`, renders truncated pill badge |
| `src/components/tabs/SoundtracksTab.tsx` | EQ dropdown, `Edit Game EQ`, dual sliders, Clear/Use Global, 2-step delete, live hot-apply | ✓ VERIFIED | 1016 lines; modular render helpers + `useState` slot order preserved; zero ESLint errors/warnings |
| `src/components/DeckifyExpandedModal.tsx` | Passes `runningAppId`, global EQ/ducking props & modal suppression | ✓ VERIFIED | Lines 751, 1230-1237 pass all props to `SoundtracksTab` and suppress triggers when `playlistPickerOpen` |
| `src/index.tsx` | QAM `hasGameOverride` subscription and `GAME VOL` / `DUCKED` volume display | ✓ VERIFIED | Lines 205, 289-306, 908-933 display `effectiveVolume` and `DUCKED`/`GAME VOL` badges |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `py_modules/soundtrack.py` | `py_modules/equalizer.py` | `apply_ephemeral_preset` / `clear_ephemeral_override` | ✓ WIRED | Lines 337, 345, 490 sequence EQ apply on launch/refresh and restore on exit |
| `py_modules/soundtrack.py` | `py_modules/volume.py` | `apply_game_override` / `clear_game_override` + `_cached_sink_input_id = None` | ✓ WIRED | Lines 375-384, 500-511 invalidate sink-input cache and check `_sleep_locked` |
| `py_modules/soundtrack.py` | Spotify Web API `set_volume` | Removal verified | ✓ WIRED (removed) | Zero occurrences of `set_volume` in `py_modules/soundtrack.py` |
| `main.py` | `py_modules/soundtrack.py` | `save/delete_game_soundtrack_profile` -> `refresh_active_overrides`; `handle_app_lifetime_event` -> `handle_app_lifecycle` | ✓ WIRED | Lines 914-927, 944, 961-974 |
| `main.py` | `py_modules/equalizer.py` | `_main()` `cleanup_stale_process`, `start_librespot` `has_ephemeral_override`, `preview_eq_bands`/`clear_eq_preview` | ✓ WIRED | Lines 181, 205, 569-571, 1099-1122 |
| `src/components/tabs/SoundtracksTab.tsx` | `src/components/tabs/soundtrackUtils.ts` | `EQ_OVERRIDE_OPTIONS`, `formatGameProfileSubtitle`, setters | ✓ WIRED | Lines 300, 433, 436, 522, 573 |
| `src/components/tabs/SoundtracksTab.tsx` | `src/components/tabs/GameEqModal.tsx` | `showModal(<GameEqModal .../>)` + `onPickerOpenChange` + `saveImmediate` | ✓ WIRED | Lines 860-884 |
| `src/components/tabs/GameEqModal.tsx` | `src/components/common/EqBandFaders.tsx` | `renderEqBandFaders`, `normalizeEqBands`, `EQ_PRESET_CURVES` | ✓ WIRED | Lines 7-11, 59-65, 417 |
| `src/components/tabs/SettingsTab.tsx` | `src/components/common/EqBandFaders.tsx` | Direct call `renderEqBandFaders(...)` | ✓ WIRED | Line 579 |
| `src/components/DeckifyExpandedModal.tsx` | `src/components/tabs/SoundtracksTab.tsx` | `runningAppId`, `globalEqPreset`, `globalEqCustomBands`, `globalDuckingPct`, `onPickerOpenChange` | ✓ WIRED | Lines 751, 1230-1237 |
| `src/index.tsx` | `py_modules/volume.py` | `get_ducking_state` / `ducking_state_changed` -> `hasGameOverride`, `effectiveVolume`, `GAME VOL` | ✓ WIRED | Lines 289-306, 908-933 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `SoundtracksTab.tsx` | `games`, `profiles`, `runningAppId` | `get_installed_games`, `get_game_soundtrack_profiles`, `DeckifyExpandedModal` `status.active_game_app_id` | Yes (persisted VDF/JSON + live lifecycle state) | ✓ FLOWING |
| `GameEqModal.tsx` | `bands` | `profile.eq_custom_bands` -> `seedBands` -> `preview_eq_bands` / `save_game_soundtrack_profile` | Yes (persisted profile + live backend preview) | ✓ FLOWING |
| `SettingsTab.tsx` | `liveGameOverride`, `localBands` | `status.active_game_override` + `game_audio_override_changed` event; `status.settings.eq_preset`/`eq_custom_bands` | Yes (live backend override info + persisted settings) | ✓ FLOWING |
| `src/index.tsx` (QAM) | `isDucked`, `hasGameOverride`, `effectiveVolume` | `get_ducking_state()` + `ducking_state_changed` event (`VolumeFader._emit_state`) | Yes (live computed sink ratio × `_poll_volume`) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Full Python test suite | `py -3 -m unittest discover -s tests -p "test_*.py"` | `Ran 580 tests in 69.509s — OK` | ✓ PASS |
| Full Vitest suite | `pnpm test -- --run` | `17 passed (17), 198 passed (198)` | ✓ PASS |
| TypeScript typecheck | `pnpm run typecheck` | `tsc --noEmit` exit 0 | ✓ PASS |
| ESLint check | `pnpm run lint` & targeted Phase 19 lint | `0 errors` across `src/`; `0 warnings` on `EqBandFaders.tsx`, `GameEqModal.tsx`, `SoundtracksTab.tsx`, `types.ts` | ✓ PASS |
| Production Rollup build | `pnpm run build` | `dist/index.js` (439,233 bytes) built cleanly | ✓ PASS |
| Launch/exit sequencing, `_sleep_locked`, `_main()` crash recovery, EQ isolation | `$env:PYTHONPATH='tests'; py -3 -m unittest tests.test_soundtrack.TestPerGameAudioProfiles.test_launch_and_exit_sequencing_and_snapshot_persistence tests.test_soundtrack.TestPerGameAudioProfiles.test_sleep_locked_exit_restores_eq_and_clears_snapshot_without_unduck_or_play tests.test_soundtrack.TestPluginRpc.test_main_boot_crash_recovery_flat_running_and_sleep_locked tests.test_equalizer.TestEqualizerManager.test_ephemeral_preset_isolation_and_clear_restores_global tests.test_volume.TestVolumeFader.test_sleep_lock_blocks_game_override_fades_and_restores_on_release` | `Ran 5 tests in 0.582s — OK` | ✓ PASS |
| `GameEqModal` `isRunningGame` save/discard test | `pnpm exec vitest run src/components/tabs/GameEqModal.test.tsx -t "skips clear_eq_preview"` | `1 passed \| 8 skipped (9)` | ✓ PASS |
| Zero `set_volume` in `SoundtrackManager` | `py -3 -c "import pathlib; txt = '\n'.join(l for l in pathlib.Path('py_modules/soundtrack.py').read_text(encoding='utf-8').splitlines() if not l.lstrip().startswith('#')); assert 'set_volume' not in txt"` | `NO set_volume in soundtrack.py` | ✓ PASS |

### Probe Execution

N/A — No probe scripts (`scripts/*/tests/probe-*.sh`) declared or implied for Phase 19.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `GAME-01` | 19-01, 19-02, 19-03, 19-04 | Bind per-game 10-band PipeWire EQ preset & volume/ducking overrides in `SoundtracksTab`, activate ephemerally on launch, restore global baseline on exit/crash recovery without mutating persistent settings or interrupting `_sleep_locked` | ? NEEDS HUMAN (automated checks green; backstop hardware check abstained) | Code + 580 Python tests + 198 Vitest tests verified; live SteamOS PipeWire hardware audio behavior abstained (`insufficient_spec` backstop) and queued for Steam Deck verification. |

Orphaned requirements mapped to Phase 19 in `.planning/REQUIREMENTS.md`: None (only `GAME-01` is mapped to Phase 19).

### Prohibitions Verification

| # | Prohibition | Verification Tier | Status | Evidence |
| --- | --- | --- | --- | --- |
| 1 | MUST NOT overwrite or mutate persistent global `eq_preset` or `eq_custom_bands` on disk when activating, hot-applying, or previewing a per-game EQ override (`19-01`) | `test` | ✓ VERIFIED | Enforced in `py_modules/equalizer.py` (`apply_ephemeral_preset`, `preview_bands`); tested in `tests/test_equalizer.py` (`test_ephemeral_preset_isolation_and_clear_restores_global`, `test_preview_bands_and_clear_preview_restore_and_idempotency`, `test_preview_eq_bands_validates_clamps_and_isolates_settings`). |
| 2 | MUST NOT invoke Spotify Web API `PUT /v1/me/player/volume` (`self.plugin.set_volume`) during `SoundtrackManager` game launch or game exit transitions (`19-01`) | `test` | ✓ VERIFIED | Zero `set_volume` occurrences in `py_modules/soundtrack.py`; tested in `tests/test_soundtrack.py` (`test_volume_override_applied_and_reverted`, `test_audio_only_profile_and_prompt_switch_apply_overrides`). |
| 3 | MUST NOT allow `VolumeFader` game exit teardown, crash recovery, or live override updates to un-duck or restore pre-game playback while `VolumeFader._sleep_locked` is `True` (`19-01`) | `test` | ✓ VERIFIED | Enforced in `py_modules/volume.py:354, 373`, `py_modules/soundtrack.py:501-509`, `main.py:206`; tested in `tests/test_volume.py` (`test_sleep_lock_blocks_game_override_fades_and_restores_on_release`) and `tests/test_soundtrack.py` (`test_sleep_locked_exit_restores_eq_and_clears_snapshot_without_unduck_or_play`, `test_main_boot_crash_recovery_flat_running_and_sleep_locked`). |
| 4 | MUST NOT expose `active_game_override_snapshot` in `get_status().settings` or allow untrusted `set_setting('active_game_override_snapshot', ...)` mutations (`19-02`) | `test` | ✓ VERIFIED | Enforced in `main.py:593-616, 699-700`; tested in `tests/test_soundtrack.py` (`test_status_and_ducking_state_expose_game_override_and_hide_snapshot`, `test_set_setting_rejects_active_game_override_snapshot`). |
| 5 | MUST NOT mutate or overwrite persistent global `eq_preset` or `eq_custom_bands` when previewing or saving curves inside `GameEqModal` (`19-03`) | `test` | ✓ VERIFIED | Enforced in `GameEqModal.tsx` & `SoundtracksTab.tsx:860-884`; tested in `GameEqModal.test.tsx` & `SoundtracksTab.test.tsx`. |

### Anti-Patterns Found

Debt markers (`TBD`/`FIXME`/`XXX`/`TODO`/`HACK`) and stub scan: 0 found across all Phase 19 files.
Concurrency, edge-case, and code-quality findings observed during verification (cross-referenced with `19-REVIEW.md`):

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `py_modules/volume.py` | 86-95 | `boost_pa_volume()` unconditionally sets `150%` and overwrites `_current_sink_volume = 150.0` when `not fader.is_ducked` | ⚠️ Warning | If `librespot` stream boosts late or auto-restarts mid-game (`main.py:563, 1891-1892`), it temporarily/logically overrides an active `volume_override` ceiling (with `ducking_override=False`) or `_sleep_locked` fade (`coincidental-reliance` item). |
| `py_modules/equalizer.py` | 551-591, 626-640 | `preview_bands` / `set_bands` schedules `_throttled_pw_cli_flush` outside `self._lock` without re-checking `_preview_active` | ⚠️ Warning | Concurrent `clear_preview()` / `apply_ephemeral_preset()` during cold PipeWire startup when global preset is non-flat can be overwritten ~75ms later by the cancelled preview bands (`WR-01`). |
| `py_modules/volume.py` | 416-427 | `VolumeFader.fade_to()` has no sequence/lock guard around cancelling and replacing `_fade_task` | ⚠️ Warning | Rapid overlapping `apply_game_override` calls (e.g., dragging running-game sliders via `saveImmediate`) can leave two concurrent `_execute_fade` tasks running (`WR-02`). |
| `py_modules/equalizer.py` | 273-301 | `cleanup_stale_process()` sends `SIGTERM` to `eq.pid` without inspecting `/proc/{pid}/cmdline` | ⚠️ Warning | On Linux/SteamOS reboot with PID recycling, `old_pid` could belong to an unrelated process (`WR-04`). |
| `src/components/tabs/SoundtracksTab.tsx` | 909-927 | Unmount cleanup clears `saveTimersRef` without flushing pending `500ms` saves | ⚠️ Warning | Navigating away within `500ms` of editing a non-running game profile drops the pending save (`WR-05`). |
| `src/components/tabs/GameEqModal.tsx` | 294-295, 342-351 | `isRunningRef` is captured at `showModal` mount and `handleSave` ignores `onSave` failure | ⚠️ Warning | If the active game exits while `GameEqModal` is open or `saveImmediate` fails on a running game, `clear_eq_preview` is skipped and `_preview_active` can remain `True` (`WR-06`). |
| `src/components/common/EqBandFaders.tsx` & `InteractiveRow.tsx` | 181-209 | `aria-label` on `+`/`-` `InteractiveRow` steppers is not forwarded to `<Focusable>` in `InteractiveRow.tsx` | ℹ️ Info | Shallow JSX tests see the prop, while DOM accessibility attributes omit it at runtime (`IN-02`). |
| `main.py` | 66-78 | `_validate_eq_bands` checks `val != val` (NaN) but not `math.isfinite(val)` for `±inf` | ℹ️ Info | `float("inf")` clamps to `±12.0` instead of returning validation error (`IN-03`). |
| `main.py` | 873-876 | `set_setting` emits unfiltered `dict(self._settings)` on `settings_changed` | ℹ️ Info | Unlike `get_status()`, `settings_changed` includes internal keys such as `active_game_override_snapshot` (`IN-04`). |
| `src/components/tabs/SoundtracksTab.tsx` | 992, 1001-1004 | `confirmDeleteAppId` only clears when clicking the same card's header, and configured cards remain expanded | ℹ️ Info | Minor UI state polish (`IN-05`). |

### Human Verification Required

### 1. Live PipeWire Filter-Chain & Sink-Input Hardware Audio (Abstained `backstop` — `reason: insufficient_spec`)

**Test:** Launch a Steam or Non-Steam game on Steam Deck with a configured EQ preset (including `Custom` 10-band curve) and `Volume Override` / `Ducking Attenuation Override`; perform rapid game switches (Game A → Game B within 3s) and live `GameEqModal` slider previews mid-game, then exit the game.
**Expected:** `deckify_eq_sink` (`pipewire -c`), `pw-cli set-param`, and `pactl set-sink-input-volume` transitions execute cleanly without audible clicks, audio corking, or `steamwebhelper`/`Chromium` UI sound muting.
**Why human / insufficient_spec:** Tagged `verification: backstop` (`19-01-PLAN.md`). Host PipeWire/PulseAudio binaries do not exist in the Windows test environment and are mocked in all unit tests; real SteamOS audio hardware behavior requires direct Steam Deck verification.

### 2. SteamOS GamepadUI Navigation, Layout & Visual Verification (`1280x800`)

**Test:** Open `DeckifyExpandedModal` → `Soundtracks` tab on Steam Deck. Expand an unbound game, select `EQ Preset Override: Custom`, open `Edit Game EQ`, adjust sliders and `Copy from Preset` pills, save/discard, test `Volume Override` and `Ducking Attenuation Override` (both with `Ducking Override` ON and OFF), test two-step `Delete Game Profile`, inspect `SettingsTab` (`Active Game EQ Override` badge & global isolation), and inspect QAM (`GAME VOL` / `DUCKED` pills and live volume slider).
**Expected:** All horizontal rows navigate predictably with D-pad; all 10 ISO faders fit within `82vh` without clipping; long game names truncate cleanly with ellipsis; D-11 subtitles accurately reflect linked soundtracks vs `Audio profile only`; QAM slider reflects effective volume in real time.
**Why human:** Visual layout, spatial focus movement (`flow-children="horizontal"`), and `@decky/ui` `showModal` stacking cannot be verified via headless Vitest JSX mocks.

### 3. Mid-Game Crash Recovery & Sleep Timer `_sleep_locked` Priority on Hardware

**Test:** (a) While a game with active EQ & volume overrides is running, restart the Decky Loader plugin (`systemctl restart plugin_loader` or reload plugin) and observe audio baseline restoration on startup; (b) Start a Sleep Timer fade-out while a game is running, then exit the game before/during the fade.
**Expected:** (a) Orphan `pipewire -c` (`eq.pid`) is cleaned up, `active_game_override_snapshot` clears, global `eq_preset` (including `flat` teardown) and un-ducked volume restore automatically unless the same game is still running; (b) Game exit restores global EQ and clears snapshot while `_sleep_locked` keeps volume faded/muted and does not resume pre-game playback.
**Why human:** Requires live OS process cleanup (`eq.pid`), Decky plugin reload timing, and real Sleep Timer + PipeWire state interaction.

### Gaps Summary

No automated gaps or blockers were found against the Phase 19 must-haves or `GAME-01` requirements (`0` failed truths, `0` missing/stub artifacts, `0` unwired links, `0` broken prohibitions, `16/16` CONTEXT.md decisions honored, `580/580` Python tests, `198/198` Vitest tests, `tsc --noEmit`, `eslint`, and `rollup -c` build all green).

Overall status is **`human_needed`** because:
1. The non-inferable `backstop` truth in `19-01-PLAN.md` (`Live PipeWire filter-chain transition and pactl sink-input fade execute without audible clicks or steamwebhelper interference during concurrent game launch/exit on Steam Deck`) cannot be verified by mocked unit tests on Windows and requires abstention (`reason: insufficient_spec`) until verified on Steam Deck hardware.
2. Phase 19 introduces user-facing GamepadUI controls (`GameEqModal`, `SoundtracksTab` dual sliders & two-step delete, `SettingsTab` override badge, QAM `GAME VOL` pill) that require SteamOS controller/visual verification.
3. Six non-blocking concurrency/edge-case warnings (`WR-01`–`WR-06` from code verification/review, including `boost_pa_volume` mid-game restart `coincidental-reliance`) are documented above for optional hardening before or after UAT.

---

_Verified: 2026-11-19T08:33:12Z_
_Verifier: the agent (gsd-verifier)_
