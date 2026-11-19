---
phase: 19-per-game-eq-volume-profiles
verified: 2026-11-19T17:34:22Z
status: human_needed
score: 12/13 must-haves verified
covered_files:
  - .planning/phases/19-per-game-eq-volume-profiles/19-01-PLAN.md
  - .planning/phases/19-per-game-eq-volume-profiles/19-01-SUMMARY.md
  - .planning/phases/19-per-game-eq-volume-profiles/19-02-PLAN.md
  - .planning/phases/19-per-game-eq-volume-profiles/19-02-SUMMARY.md
  - .planning/phases/19-per-game-eq-volume-profiles/19-03-PLAN.md
  - .planning/phases/19-per-game-eq-volume-profiles/19-03-SUMMARY.md
  - .planning/phases/19-per-game-eq-volume-profiles/19-04-PLAN.md
  - .planning/phases/19-per-game-eq-volume-profiles/19-04-SUMMARY.md
  - .planning/phases/19-per-game-eq-volume-profiles/19-05-PLAN.md
  - .planning/phases/19-per-game-eq-volume-profiles/19-05-SUMMARY.md
  - main.py
  - py_modules/common.py
  - py_modules/equalizer.py
  - py_modules/soundtrack.py
  - py_modules/volume.py
  - src/components/DeckifyExpandedModal.tsx
  - src/components/common/EqBandFaders.tsx
  - src/components/common/InteractiveRow.tsx
  - src/components/tabs/GameEqModal.tsx
  - src/components/tabs/SettingsTab.tsx
  - src/components/tabs/SoundtracksTab.tsx
  - src/components/tabs/soundtrackUtils.ts
  - src/index.tsx
  - src/types.ts
covered_digest: "v4:sha256:a6e3296a4407c9a772408bf09b4707efe5091de91a1651f0b171ffa8981f88e0"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 9/10
  gaps_closed:
    - "UAT G-19-2 (Plan 19-05): SoundtracksTab explicit Volume Override & Custom Ducking Level ToggleFields gating dedicated-row SliderFields, width: 'auto' on all 6 compact/inline DialogButtons, GameEqModal native ModalRoot surface / overflowX: 'hidden' / MAINTAIN_X two-row presets / body initial focus, QAM & SoundtrackManager app_name resolution & self-healing, and SettingsTab dedicated full-width Active Game EQ Override banner"
    - "Prior code-review warnings WR-01..WR-06 and info items IN-02..IN-05 (including boost_pa_volume coincidental-reliance hardening in py_modules/volume.py)"
  gaps_remaining: []
  regressions: []
decision_coverage:
  honored: 16
  total: 16
  not_honored: []
human_verification:
  - test: "Verify live PipeWire filter-chain transition and pactl sink-input fade on Steam Deck hardware (non-inferable backstop)"
    reason: insufficient_spec
    expected: "Launching and exiting Steam/Non-Steam games (including rapid game switches and mid-game GameEqModal pw-cli previews) transitions deckify_eq_sink and pactl set-sink-input-volume smoothly with no audible clicks, pops, or steamwebhelper/Chromium UI sound interference (re-confirming prior UAT Test 1 pass after WR-01..WR-04 and 19-05 updates)."
    why_human: "Non-inferable backstop truth (verification: backstop): pipewire, pw-cli, and pactl binaries are SteamOS-only and mocked in Windows unit tests; held-out or live Steam Deck audio verification is required."
  - test: "Re-verify SteamOS GamepadUI Navigation, Layout & Visual Verification (1280x800) for G-19-2 closure"
    expected: "SoundtracksTab renders explicit Volume Override and Custom Ducking Level ToggleFields gating dedicated full-width SliderField rows without layout jumping or vertical letter-stacking, and compact DialogButtons respect width: 'auto'; GameEqModal inherits native ModalRoot surface with zero horizontal scroll, focuses body preset row on open instead of top-right Close, and navigates two 4-item preset rows -> 10-band EqBandFaders -> footer via D-pad with MAINTAIN_X alignment; SettingsTab renders Active Game EQ Override on a dedicated full-width banner row below the Equalizer header showing full resolved Steam/Non-Steam game names (e.g., PCSX2) and preset suffixes with ellipsis only on extraordinarily long titles; QAM displays GAME VOL / DUCKED pills and live effective_volume; two-step Delete Game Profile confirmation works cleanly."
    why_human: "SteamOS GamepadUI CSS (.DialogButton width: 100%, ModalRoot surface), FocusNavController MAINTAIN_X D-pad spatial traversal, and 1280x800 visual layout cannot be exercised in headless Vitest shallow-JSX mocks."
  - test: "Verify crash recovery (active_game_override_snapshot + eq.pid) and Sleep Timer _sleep_locked priority on Steam Deck hardware"
    expected: "Killing/restarting Decky Loader mid-game verifies /proc/{pid}/cmdline for pipewire before terminating eq.pid and restores global EQ (including tearing down deckify_eq_sink when global is flat) and un-ducked baseline on Plugin._main(); exiting a game while a Sleep Timer fade is active restores global EQ and clears snapshot without un-ducking or resuming pre-game playback (re-confirming prior UAT Test 3 pass after WR-04 and 19-05 updates)."
    why_human: "Requires real SteamOS /proc/{pid}/cmdline lifecycle, PulseAudio/PipeWire daemon state, and Decky Loader plugin restart behavior."
---

# Phase 19: Per-Game EQ & Volume Profiles Verification Report

**Phase Goal:** Users can assign a custom 10-band PipeWire EQ preset and target volume/ducking level to individual games in SoundtracksTab that activate automatically on game launch and cleanly restore the global audio baseline on game exit or crash recovery.
**Verified:** 2026-11-19T17:34:22Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure plan `19-05` (`G-19-2`) and hardening fixes (`WR-01`..`WR-06`, `IN-02`..`IN-05`)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | **SC-1 (ROADMAP):** User can select and bind a per-game 10-band EQ preset and target volume/ducking level to any Steam or Non-Steam game profile in `SoundtracksTab`. | ✓ VERIFIED | `SoundtracksTab.tsx:446-619` renders `EQ Preset Override` (`EQ_OVERRIDE_OPTIONS`), conditional `Edit Game EQ` -> `GameEqModal`, explicit `Volume Override` `ToggleField` -> dedicated `SliderField` (`0..100%`), explicit `Custom Ducking Level` `ToggleField` -> dedicated `SliderField` (`0..95%`), and `SoundtrackManager._sanitize_profile` (`py_modules/soundtrack.py:117-192`) persists all fields. Verified by `SoundtracksTab.test.tsx` (26/26) & `test_soundtrack.py` (52/52). |
| 2 | **SC-2 (ROADMAP):** Launching a game with an assigned audio profile automatically applies the ephemeral EQ and volume/ducking override without overwriting the user's persistent global `eq_preset` or baseline volume on disk. | ✓ VERIFIED | `SoundtrackManager._run_launch` (`py_modules/soundtrack.py:442-508`) calls `apply_active_audio_profile()` (`355-430`) in atomic order (EQ -> `active_game_override_snapshot` -> clear `_cached_sink_input_id` -> `VolumeFader.apply_game_override`) without mutating `settings["eq_preset"]`/`eq_custom_bands`. Prior `coincidental-reliance` in `py_modules/volume.py:boost_pa_volume()` (`86-117`) is now fixed via `_compute_boost_target(fader)` respecting active overrides/ducking/`_sleep_locked`, verified by `test_boost_pa_volume_respects_game_override_ducking_and_sleep_lock`. |
| 3 | **SC-3 (ROADMAP):** Exiting the game (or restarting the plugin after an unexpected crash/reboot via `active_game_override_snapshot`) restores the user's global EQ preset and volume baseline while respecting any active Sleep Timer fade-out priority lock (`_sleep_locked`). | ✓ VERIFIED | `SoundtrackManager._run_exit` (`py_modules/soundtrack.py:510-581`) restores global EQ first (`clear_ephemeral_override`), clears `active_game_override_snapshot`, invalidates `_cached_sink_input_id`, skips `clear_game_override` and playback restore when `_sleep_locked is True`, and preserves `_pre_game_snapshot` across back-to-back A→B switches. `Plugin._main()` (`main.py:189, 202-221`) runs `cleanup_stale_process()` (verifying `/proc/{old_pid}/cmdline` contains `"pipewire"`) and recovers stale `active_game_override_snapshot`. Verified by `test_soundtrack.py`, `test_equalizer.py`, & `test_volume.py`. |
| 4 | `EqualizerManager` isolates `_ephemeral_preset`/`_ephemeral_bands` and `_preview_active` from global settings, serializes throttled `pw-cli` flushes, preserves active game EQ on `librespot` restart, cleans stale `eq.pid`, and exposes validated `preview_eq_bands`/`clear_eq_preview` RPCs. | ✓ VERIFIED | `py_modules/equalizer.py:215-750` (`_eq_seq` lock/cancel serialization on `preview_bands`/`set_bands`/`apply_preset`, `/proc/{pid}/cmdline` guard in `cleanup_stale_process`), `main.py:74-86, 574-579, 1107-1144`. Verified by `test_equalizer.py` (35/35). |
| 5 | `VolumeFader` computes sink-input volume 100% locally via PipeWire with zero `set_volume` calls in `SoundtrackManager`, guards `fade_to` task replacement monotonically, combines ceiling (`0..100`), ducking (`0..95`, min factor `0.05`), and `voice` VAD min-dip; QAM displays live `effective_volume` and `"DUCKED"` / `"GAME VOL"` pills; ducking triggers post-debounce with pending `_exit_task` guard. | ✓ VERIFIED | `py_modules/volume.py:86-117, 234-516`, zero `set_volume` in `py_modules/soundtrack.py`, `main.py:958-1022`, `src/index.tsx:205, 289-306, 914-940`. Verified by `test_volume.py` (72/72), `test_soundtrack.py` (52/52), and `src/index.test.tsx` (16/16). |
| 6 | Boundary sanitization and idempotency invariants: exact numeric bounds (`0..100`, `0..95`, `-12.0..+12.0` 2-decimal rounding, positive `int` snapshot `app_id`, rejecting `bool`/`NaN`/`±Inf`) and idempotent repeat calls on ephemeral EQ, preview, `set_ducking(False, 'game')`, and `clear_game_override`. | ✓ VERIFIED | `py_modules/common.py:231-242`, `py_modules/equalizer.py:53-72, 546-569, 610-611`, `main.py:74-86`, `py_modules/soundtrack.py:149-181`, `py_modules/volume.py:307-314, 391-407`. Verified by `test_equalizer.py`, `test_volume.py`, and `test_soundtrack.py`. |
| 7 | `EqBandFaders` shares 10 ISO faders across `SettingsTab` and `GameEqModal` with forwarded `aria-label` on `InteractiveRow`; `GameEqModal` handles seeding, error recovery, and `isRunningGame`-aware `clear_eq_preview` (including async save failure/mid-edit exit safety). | ✓ VERIFIED | `EqBandFaders.tsx:1-239`, `InteractiveRow.tsx:109, 115`, `GameEqModal.tsx:66-532` (`invokeSaveWithClear` clears preview when `!isRunningRef.current || failed`). Verified by `GameEqModal.test.tsx` (13/13) and `SettingsTab.test.tsx` (35/35). |
| 8 | `SoundtracksTab` renders D-11 subtitles, conditional `Edit Game EQ` button, two-step `Delete Game Profile` confirmation (`IN-05` collapse/confirm reset), immediate running-game hot-apply (`refresh_active_overrides`), unmount flush (`flushPendingSaves`), empty/loading/error/truncation states, and `DeckifyExpandedModal` wires `runningAppId`/global baselines with modal trigger suppression. | ✓ VERIFIED | `soundtrackUtils.ts:9-208`, `SoundtracksTab.tsx:108-1199`, `DeckifyExpandedModal.tsx:751, 1229-1238`. Verified by `SoundtracksTab.test.tsx` (26/26) and `test_soundtrack.py`. |
| 9 | `Plugin.get_status()` exposes `active_game_app_id` and `active_game_override` while excluding `active_game_override_snapshot` from `settings`, and `Plugin.set_setting` rejects external writes to `active_game_override_snapshot` and strips `_INTERNAL_SETTING_KEYS` from response & `settings_changed`. | ✓ VERIFIED | `main.py:66-71, 596-648, 706-712, 884-890`. Verified by `test_soundtrack.py`. |
| 10 | **Gap Closure `19-05` (`SoundtracksTab`):** Renders explicit full-width `ToggleField`s for `Volume Override` (`80` <-> `null`) and `Custom Ducking Level` (disabled when `ducking_override === false`, `fallbackDucking` <-> `null`) gating dedicated-row `SliderField`s only when enabled, removes inline `Clear Volume Override`/`Use Global Ducking` buttons, sets `width: 'auto'` on all 6 `DialogButton` roles, backfills empty `app_name` from `game.name`, and preserves `useState` slots `0..6`. | ✓ VERIFIED | `SoundtracksTab.tsx:108-128, 367, 383, 473, 527-619, 638, 665, 678, 904, 937, 1021, 1106, 1150-1160`. Verified by `SoundtracksTab.test.tsx` (26/26) with `eslint --max-warnings=0`. |
| 11 | **Gap Closure `19-05` (`GameEqModal` + `EqBandFaders`):** Inherits native `ModalRoot` surface (no `#121212` / `minWidth: 520`), constrains container (`width: '100%'`, `maxWidth: 'min(680px, 88vw)'`, `maxHeight: '82vh'`, `overflowY: 'auto'`, `overflowX: 'hidden'`, `boxSizing: 'border-box'`, `padding: 12`), wraps header in `Focusable[flow-children='horizontal']` with `width: 'auto'` and no `flexShrink: 0` on `Close`, splits `Copy from Preset` + `Reset to Flat` (`width: 'auto'`) into two non-wrapping 4-item `MAINTAIN_X` rows aligned with `EqBandFaders` and footer (`width: 'auto', flex: 1`), and focuses body via `preferredFocus` + `requestAnimationFrame`. | ✓ VERIFIED | `EqBandFaders.tsx:219-221`, `GameEqModal.tsx:37-50, 95-158, 203-269, 272-310, 454-469, 504-530`. Verified by `GameEqModal.test.tsx` (13/13) with `eslint --max-warnings=0`. |
| 12 | **Gap Closure `19-05` (QAM + `SoundtrackManager` + `SettingsTab`):** QAM `handleQuickBind` passes `Router.MainRunningApp?.display_name` to `bind_current_music_to_game`, `SoundtrackManager._resolve_app_name` falls back safely to `vdf_parser.get_installed_games()` across `save_profile`, `bind_current_music_to_game`, and `apply_active_audio_profile` (self-healing legacy `app_name: ""` profiles), and `SettingsTab` renders `Active Game EQ Override` on its own dedicated full-width banner row below the Equalizer header with `flexShrink: 0` label/suffix and ellipsis truncation only on long game names. | ✓ VERIFIED | `src/index.tsx:421-431`, `main.py:951-956`, `py_modules/soundtrack.py:11, 194-237, 359-362, 626-632`, `SettingsTab.tsx:486-557`. Verified by `src/index.test.tsx` (16/16), `tests/test_soundtrack.py` (52/52), and `SettingsTab.test.tsx` (35/35). |
| 13 | **Non-inferable Backstop (`19-01`):** Live PipeWire filter-chain transition and `pactl` sink-input fade execute without audible clicks or `steamwebhelper` interference during concurrent game launch/exit on Steam Deck. | ⚠️ INSUFFICIENT_SPEC (abstained) | Tagged `verification: backstop`. Automated tests in this session run on Windows with mocked `pipewire`/`pw-cli`/`pactl` subprocesses; backend files (`equalizer.py`, `volume.py`, `soundtrack.py`, `main.py`) changed since prior UAT Test 1. Abstained per Step 3 item 5b (`reason: insufficient_spec`) and routed to Human Verification. |

**Score:** 12/13 must-haves verified (0 failed, 0 behavior-unverified, 1 non-inferable `backstop` abstained with `reason: insufficient_spec`)

### Decision Coverage

`check.decision-coverage-verify` evaluated `19-CONTEXT.md` against Phase 19 artifacts:
- **Result:** 16 / 16 trackable CONTEXT.md decisions (`D-01` through `D-16`) honored (`not_honored: []`).
- **Message:** All trackable CONTEXT.md decisions are honored by shipped artifacts.

### Test Quality Audit

| Test File | Linked Req | Active | Skipped | Circular | Assertion Level | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| `tests/test_equalizer.py` | GAME-01 | 35 | 0 | 0 | Value + Behavioral | ✓ PASS (subprocess mocked) |
| `tests/test_volume.py` | GAME-01 | 72 | 0 | 0 | Value + Behavioral | ✓ PASS (subprocess mocked) |
| `tests/test_soundtrack.py` | GAME-01 | 52 | 0 | 0 | Value + Behavioral | ✓ PASS (async lifecycle + mocks) |
| `tests/test_e2e_requirements.py` | GAME-01 | 152 | 0 | 0 | Behavioral | ✓ PASS |
| `src/components/tabs/GameEqModal.test.tsx` | GAME-01 | 13 | 0 | 0 | Value + Behavioral | ✓ PASS (shallow JSX + mocked RPCs) |
| `src/components/tabs/SettingsTab.test.tsx` | GAME-01 | 35 | 0 | 0 | Value + Behavioral | ✓ PASS (shallow JSX + mocked RPCs) |
| `src/components/tabs/SoundtracksTab.test.tsx` | GAME-01 | 26 | 0 | 0 | Value + Behavioral | ✓ PASS (shallow JSX + mocked RPCs) |
| `src/index.test.tsx` | GAME-01 | 16 | 0 | 0 | Value + Behavioral | ✓ PASS (shallow JSX + mocked RPCs) |

**Disabled tests on requirements:** 0 (note: `test_soundtrack.py:811` matched `_run_exit(` substring in regex check; 0 actual skipped tests)
**Circular patterns detected:** 0 (temp file writes in `test_equalizer.py`/`test_soundtrack.py`/`test_e2e_requirements.py` construct isolated test input files inside `TemporaryDirectory`)
**Insufficient assertions:** 0 (SteamOS PipeWire binary behavior and live `1280x800` GamepadUI rendering are outside unit-test mock boundaries and routed to Human Verification)

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `py_modules/common.py` | `EQ_PID_FILE`, `active_game_override_snapshot` default & load sanitizer | ✓ VERIFIED | Lines 45, 88, 231-242: validates non-bool positive `int` `app_id` in `[1, 0xFFFFFFFF]` |
| `py_modules/equalizer.py` | 3-layer `EqualizerManager`, `_eq_seq` throttle serialization, `/proc` `eq.pid` check | ✓ VERIFIED | 750 lines; `has_ephemeral_override`, `get_active_override_info`, `apply_ephemeral_preset`, `clear_ephemeral_override`, `preview_bands`, `clear_preview`, `cleanup_stale_process`, `clamp_eq_bands` |
| `py_modules/volume.py` | Unified local `VolumeFader` overrides, `_sleep_locked` guard, `_fade_seq`, `_compute_boost_target`, `has_game_override` | ✓ VERIFIED | 620 lines; `_compute_boost_target`, `boost_pa_volume`, `_compute_target_sink_volume`, `apply_game_override`, `clear_game_override`, `fade_to`, `has_game_override`, `apply_equalizer_preset` |
| `py_modules/soundtrack.py` | Extended schema/sanitizer, `_resolve_app_name` VDF fallback & self-healing, sequenced launch/exit, zero `set_volume` | ✓ VERIFIED | 632 lines; zero `set_volume` calls; `_resolve_app_name`, `save_profile`, `apply_active_audio_profile`, `refresh_active_overrides`, `bind_current_music_to_game`, `_run_launch`, `_run_exit` |
| `main.py` | Boot crash recovery, `_validate_eq_bands` (`isfinite`), preview RPCs, post-debounce ducking, filtered settings emits | ✓ VERIFIED | `_INTERNAL_SETTING_KEYS`, `_validate_eq_bands`, `_main()` crash recovery, `preview_eq_bands`, `clear_eq_preview`, `get_status`, `set_setting`, `_public_settings_payload`, `trigger_ducking`, `get_ducking_state`, `start_librespot` |
| `src/types.ts` | Phase 19 TypeScript contracts | ✓ VERIFIED | Exports `ActiveGameOverrideInfo`, `DuckingState.has_game_override`, `StatusResponse` game fields, `SoundtrackProfile` EQ/ducking fields |
| `src/components/tabs/soundtrackUtils.ts` | EQ labels/options, D-11 subtitle formatter, immutable setters, `normalizeProfiles` backfill | ✓ VERIFIED | 222 lines; `EQ_PRESET_LABELS`, `EQ_OVERRIDE_OPTIONS`, `formatGameProfileSubtitle`, `setEqPreset`, `setEqCustomBands`, `setDuckingLevelOverride` |
| `src/components/common/InteractiveRow.tsx` | Forwards `aria-label` prop to `<Focusable>` | ✓ VERIFIED | Lines 109, 115 forward `aria-label` cleanly |
| `src/components/common/EqBandFaders.tsx` | Shared 10-band ISO fader renderer (`flow-children="horizontal"`, `MAINTAIN_X`) | ✓ VERIFIED | 239 lines; `NavEntryPositionPreferences.MAINTAIN_X` on strip; zero ESLint warnings |
| `src/components/tabs/GameEqModal.tsx` | Native `ModalRoot` surface, `overflowX: "hidden"`, two 4-item `MAINTAIN_X` rows, `useBodyInitialFocus`, `width: "auto"` buttons | ✓ VERIFIED | 532 lines; native surface, `width: "auto"` on `Close`/`Reset to Flat`/footer, `useBodyInitialFocus` (`rAF`), `invokeSaveWithClear`; zero ESLint warnings |
| `src/components/tabs/GameEqModal.test.tsx` | Vitest suite for `GameEqModal` | ✓ VERIFIED | 777 lines; 13 passing tests covering seeding, surface/overflow constraints, `MAINTAIN_X`, `rAF` focus, async failure clear, and `isRunningGame` branches |
| `src/components/tabs/SettingsTab.tsx` | `renderEqBandFaders`, dedicated full-width `Active Game EQ Override` banner row + caption, event listener | ✓ VERIFIED | Dedicated full-width row (`lines 517-552`) below header (`486-516`), `flexShrink: 0` prefix/suffix, ellipsis only on title; `renderEqBandFaders` on line 593 |
| `src/components/tabs/SoundtracksTab.tsx` | Explicit Volume/Ducking `ToggleField`s gating dedicated `SliderField`s, `width: "auto"` on 6 `DialogButton`s, `app_name` backfill, `useState` slots `0..6`, unmount flush | ✓ VERIFIED | 1199 lines; `useState` slots `0..6` preserved; zero ESLint warnings |
| `src/components/DeckifyExpandedModal.tsx` | Passes `runningAppId`, global EQ/ducking props & modal suppression | ✓ VERIFIED | Lines 751, 1230-1237 pass all props to `SoundtracksTab` and suppress triggers when `playlistPickerOpen` |
| `src/index.tsx` | QAM `hasGameOverride` subscription, `GAME VOL` / `DUCKED` volume display, `handleQuickBind` `display_name` forwarding | ✓ VERIFIED | Lines 82, 205, 289-306, 421-439, 914-940 |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `py_modules/soundtrack.py` | `py_modules/equalizer.py` | `apply_ephemeral_preset` / `clear_ephemeral_override` | ✓ WIRED | Lines 372, 380, 525 sequence EQ apply on launch/refresh and restore on exit |
| `py_modules/soundtrack.py` | `py_modules/volume.py` | `apply_game_override` / `clear_game_override` + `_cached_sink_input_id = None` | ✓ WIRED | Lines 410-419, 535-546 invalidate sink-input cache and check `_sleep_locked` |
| `py_modules/soundtrack.py` | Spotify Web API `set_volume` | Removal verified | ✓ WIRED (removed) | Zero occurrences of `set_volume` in `py_modules/soundtrack.py` |
| `py_modules/soundtrack.py` | `py_modules/vdf_parser.py` | `_resolve_app_name` -> `vdf_parser.get_installed_games()` | ✓ WIRED | Lines 11, 194-219 wired into `save_profile` (`232`), `apply_active_audio_profile` (`359`), `bind_current_music_to_game` (`627`) |
| `main.py` | `py_modules/soundtrack.py` | `save/delete_game_soundtrack_profile` -> `refresh_active_overrides`; `bind_current_music_to_game`; `handle_app_lifetime_event` -> `handle_app_lifecycle` | ✓ WIRED | Lines 934-970 |
| `main.py` | `py_modules/equalizer.py` | `_main()` `cleanup_stale_process`, `start_librespot` `has_ephemeral_override`, `preview_eq_bands`/`clear_eq_preview` | ✓ WIRED | Lines 189, 213, 576-579, 1121-1144 |
| `src/components/tabs/SoundtracksTab.tsx` | `src/components/tabs/soundtrackUtils.ts` | `EQ_OVERRIDE_OPTIONS`, `formatGameProfileSubtitle`, setters | ✓ WIRED | Lines 325, 462, 465, 549, 598 |
| `src/components/tabs/SoundtracksTab.tsx` | `src/components/tabs/GameEqModal.tsx` | `showModal(<GameEqModal .../>)` + `onPickerOpenChange` + `saveImmediate` | ✓ WIRED | Lines 949-972 |
| `src/components/tabs/GameEqModal.tsx` | `src/components/common/EqBandFaders.tsx` | `renderEqBandFaders`, `normalizeEqBands`, `EQ_PRESET_CURVES`, `MAINTAIN_X` alignment | ✓ WIRED | Lines 7-11, 221 (`EqBandFaders`), 262, 276, 526 |
| `src/components/tabs/SettingsTab.tsx` | `src/components/common/EqBandFaders.tsx` | Direct call `renderEqBandFaders(...)` | ✓ WIRED | Line 593 |
| `src/components/DeckifyExpandedModal.tsx` | `src/components/tabs/SoundtracksTab.tsx` | `runningAppId`, `globalEqPreset`, `globalEqCustomBands`, `globalDuckingPct`, `onPickerOpenChange` | ✓ WIRED | Lines 751, 1230-1237 |
| `src/index.tsx` | `py_modules/volume.py` | `get_ducking_state` / `ducking_state_changed` -> `hasGameOverride`, `effectiveVolume`, `GAME VOL` | ✓ WIRED | Lines 289-306, 914-940 |
| `src/index.tsx` | `py_modules/soundtrack.py` | `handleQuickBind` extracts `Router.MainRunningApp` (`display_name`) -> `backendBindCurrentMusicToGame(activeGameAppId, runningAppName)` -> `main.py:951` | ✓ WIRED | `verify.key-links` single-line regex missed variable extraction across `src/index.tsx:424-430`; manually verified end-to-end call chain (`src/index.tsx:424-430` -> `main.py:951-956` -> `py_modules/soundtrack.py:612-632`) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `SoundtracksTab.tsx` | `games`, `profiles`, `runningAppId` | `get_installed_games`, `get_game_soundtrack_profiles`, `backfillProfileAppNames`, `status.active_game_app_id` | Yes (persisted VDF/JSON + live lifecycle state) | ✓ FLOWING |
| `GameEqModal.tsx` | `bands` | `profile.eq_custom_bands` -> `seedBands` -> `preview_eq_bands` / `save_game_soundtrack_profile` | Yes (persisted profile + live backend preview) | ✓ FLOWING |
| `SettingsTab.tsx` | `liveGameOverride`, `localBands` | `status.active_game_override` + `game_audio_override_changed` event (with VDF self-healed `app_name`); `status.settings.eq_preset`/`eq_custom_bands` | Yes (live backend override info + persisted settings) | ✓ FLOWING |
| `src/index.tsx` (QAM) | `isDucked`, `hasGameOverride`, `effectiveVolume`, `runningAppName` | `get_ducking_state()` + `ducking_state_changed`; `Router.MainRunningApp?.display_name` | Yes (live computed sink ratio × `_poll_volume` + live Steam running app title) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Full Python test suite | `py -3 -m unittest discover -s tests -p "test_*.py"` | `Ran 594 tests in 67.170s — OK` | ✓ PASS |
| Phase 19 Python suites individually | `tests.test_equalizer` (35), `tests.test_volume` (72), `tests.test_soundtrack` (52), `tests.test_e2e_requirements` (152) | `35 OK`, `72 OK`, `52 OK`, `152 OK` | ✓ PASS |
| Full Vitest suite | `pnpm test -- --run` | `17 passed (17), 210 passed (210)` (`SoundtracksTab.test.tsx`: 26, `GameEqModal.test.tsx`: 13, `SettingsTab.test.tsx`: 35, `src/index.test.tsx`: 16) | ✓ PASS |
| TypeScript typecheck | `pnpm run typecheck` | `tsc --noEmit` exit 0 | ✓ PASS |
| ESLint check (repo + zero-warning gate) | `pnpm run lint` & `pnpm exec eslint --max-warnings=0 src/components/tabs/SoundtracksTab.tsx src/components/tabs/GameEqModal.tsx src/components/common/EqBandFaders.tsx` | `0 errors` across `src/` (658 pre-existing warnings in untouched files); `0 warnings` on `SoundtracksTab.tsx`, `GameEqModal.tsx`, `EqBandFaders.tsx` | ✓ PASS |
| Production Rollup build | `pnpm run build` | `dist/index.js` (446,276 bytes) built cleanly in 8.5s | ✓ PASS |
| Zero `set_volume` in `SoundtrackManager` | Python AST/text scan of `py_modules/soundtrack.py` non-comment lines | `set_volume in soundtrack.py: False` | ✓ PASS |

### Probe Execution

N/A — No probe scripts (`scripts/*/tests/probe-*.sh`) declared or implied for Phase 19.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `GAME-01` | 19-01, 19-02, 19-03, 19-04, 19-05 | Bind per-game 10-band PipeWire EQ preset & volume/ducking overrides in `SoundtracksTab`, activate ephemerally on launch, restore global baseline on exit/crash recovery without mutating persistent settings or interrupting `_sleep_locked` | ? NEEDS HUMAN (automated checks green; backstop & SteamOS UI `G-19-2` hardware check pending) | Code + 594 Python tests + 210 Vitest tests + `tsc` + `eslint --max-warnings=0` + Rollup build verified; live SteamOS PipeWire hardware audio behavior (`insufficient_spec` backstop) and `1280x800` GamepadUI layout/D-pad verification (`G-19-2`) queued for Steam Deck verification. |

Orphaned requirements mapped to Phase 19 in `.planning/REQUIREMENTS.md`: None (only `GAME-01` is mapped to Phase 19).

### Prohibitions Verification

| # | Prohibition | Verification Tier | Status | Evidence |
| --- | --- | --- | --- | --- |
| 1 | MUST NOT overwrite or mutate persistent global `eq_preset` or `eq_custom_bands` on disk when activating, hot-applying, or previewing a per-game EQ override (`19-01`) | `test` | ✓ VERIFIED | Enforced in `py_modules/equalizer.py` (`apply_ephemeral_preset`, `preview_bands`); tested in `tests/test_equalizer.py` (`35/35`). |
| 2 | MUST NOT invoke Spotify Web API `PUT /v1/me/player/volume` (`self.plugin.set_volume`) during `SoundtrackManager` game launch or game exit transitions (`19-01`) | `test` | ✓ VERIFIED | Zero `set_volume` occurrences in `py_modules/soundtrack.py`; tested in `tests/test_soundtrack.py` (`52/52`). |
| 3 | MUST NOT allow `VolumeFader` game exit teardown, crash recovery, or live override updates to un-duck or restore pre-game playback while `VolumeFader._sleep_locked` is `True` (`19-01`) | `test` | ✓ VERIFIED | Enforced in `py_modules/volume.py:89-90, 378, 397`, `py_modules/soundtrack.py:536-543`, `main.py:214`; tested in `tests/test_volume.py` & `tests/test_soundtrack.py`. |
| 4 | MUST NOT expose `active_game_override_snapshot` in `get_status().settings` or allow untrusted `set_setting('active_game_override_snapshot', ...)` mutations (`19-02`) | `test` | ✓ VERIFIED | Enforced in `main.py:66-71, 601-646, 706-711, 884-890`; tested in `tests/test_soundtrack.py`. |
| 5 | MUST NOT mutate or overwrite persistent global `eq_preset` or `eq_custom_bands` when previewing or saving curves inside `GameEqModal` (`19-03`) | `test` | ✓ VERIFIED | Enforced in `GameEqModal.tsx` & `SoundtracksTab.tsx:949-982`; tested in `GameEqModal.test.tsx` (`13/13`) & `SoundtracksTab.test.tsx` (`26/26`). |

### Advisory (New Scope, Unevidenced)

None — all Step 7 findings on files modified since prior verification (`WR-08`, `WR-09`, `IN-06`) are documented below with exact file/line citations and zero unevidenced blockers.

### Anti-Patterns Found

Debt markers (`TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`) and stub scan: 0 found across all 14 Phase 19 source files.
Prior findings `WR-01`–`WR-06` and `IN-02`–`IN-05` are verified resolved in code and tests. Remaining open warnings/info items from `19-REVIEW.md` (`19-05` scope):

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `src/index.tsx` | 424-430 | `handleQuickBind` checks `(!mainAppId \|\| mainAppId === activeGameAppId)` before forwarding `Router.MainRunningApp.display_name` | ⚠️ Warning | `WR-08`: If `Router.MainRunningApp` reports missing/zero `appid` alongside a stale non-empty `display_name`, it could forward that string instead of falling back to `_resolve_app_name`. Requiring exact `mainAppId === activeGameAppId` would harden this edge case. |
| `py_modules/soundtrack.py` | 194-219, 359 | `_resolve_app_name` invokes synchronous `vdf_parser.get_installed_games()` on the asyncio event loop (and when `profile is None`) | ⚠️ Warning | `WR-09`: When the 30s VDF cache is cold, launching an unbound game or saving/binding triggers synchronous VDF/grid disk I/O on the event loop instead of `run_in_executor` (all exceptions are caught and cache bounds repeat calls). |
| `src/components/tabs/GameEqModal.tsx` & `SoundtracksTab.tsx` | `208` / `108-111` | `Reset to Flat` uses `minWidth: "auto"` instead of `minWidth: 0`; `patchProfileAppName` checks `!fallbackName` without `.trim()` | ℹ️ Info | `IN-06`: Minor flex shrink and whitespace polish; `vdf_parser` already omits blank names. |

### Human Verification Required

### 1. Live PipeWire Filter-Chain & Sink-Input Hardware Audio (Abstained `backstop` — `reason: insufficient_spec`)

**Test:** Launch a Steam or Non-Steam game on Steam Deck with a configured EQ preset (including `Custom` 10-band curve) and `Volume Override` / `Ducking Attenuation Override`; perform rapid game switches (Game A → Game B within 3s) and live `GameEqModal` slider previews mid-game, then exit the game.
**Expected:** `deckify_eq_sink` (`pipewire -c`), `pw-cli set-param`, and `pactl set-sink-input-volume` transitions execute cleanly without audible clicks, audio corking, or `steamwebhelper`/`Chromium` UI sound muting (re-confirming prior UAT Test 1 pass after `WR-01`..`WR-04` and `19-05` updates).
**Why human / insufficient_spec:** Tagged `verification: backstop` (`19-01-PLAN.md`). Host PipeWire/PulseAudio binaries do not exist in the Windows test environment and are mocked in all unit tests; real SteamOS audio hardware behavior requires direct Steam Deck verification.

### 2. SteamOS GamepadUI Navigation, Layout & Visual Re-Verification (`1280x800` — UAT `G-19-2` Closure)

**Test:** Open `DeckifyExpandedModal` → `Soundtracks` tab on Steam Deck. Expand a Steam game and a Non-Steam shortcut (including a legacy empty-`app_name` profile or QAM quick-bind); toggle `Volume Override` and `Custom Ducking Level` ON/OFF and drag both dedicated sliders; select `EQ Preset Override: Custom`, open `Edit Game EQ`, verify modal open focus/surface/scroll and navigate Preset Row 1 -> Preset Row 2 -> 10-band faders -> `Discard Changes`/`Save Game EQ` via D-pad; inspect `SettingsTab` (`Active Game EQ Override` banner row) and QAM (`GAME VOL` / `DUCKED` pills and live volume slider); test two-step `Delete Game Profile`.
**Expected:** `SoundtracksTab` `ToggleField`s gate dedicated full-width `SliderField` rows with zero layout jumps or vertical letter-stacking, and all compact `DialogButton`s fit at `width: "auto"`; `GameEqModal` inherits native `ModalRoot` chrome with zero horizontal scroll, focuses body preset row on open instead of top-right `Close`, and D-pad Down preserves horizontal column alignment (`MAINTAIN_X`) across preset rows, 10-band faders, and footer buttons; `SettingsTab` renders `Active Game EQ Override: {Resolved Game Name} ({Preset})` on its own full-width row below the Equalizer header without `"App <digits>..."` fallback (truncating only extraordinarily long game names); QAM displays `GAME VOL` / `DUCKED` and live `effective_volume`.
**Why human:** SteamOS `.DialogButton` CSS defaults, `ModalRoot` dialog styling, `FocusNavController` spatial D-pad traversal, and `1280x800` visual layout cannot be verified via headless Vitest JSX mocks.

### 3. Mid-Game Crash Recovery & Sleep Timer `_sleep_locked` Priority on Hardware

**Test:** (a) While a game with active EQ & volume overrides is running, restart the Decky Loader plugin (`systemctl restart plugin_loader` or reload plugin) and observe audio baseline restoration on startup; (b) Start a Sleep Timer fade-out while a game is running, then exit the game before/during the fade.
**Expected:** (a) Orphan `pipewire -c` (`eq.pid`, verified via `/proc/{pid}/cmdline`) is cleaned up, `active_game_override_snapshot` clears, global `eq_preset` (including `flat` teardown) and un-ducked volume restore automatically unless the same game is still running; (b) Game exit restores global EQ and clears snapshot while `_sleep_locked` keeps volume faded/muted and does not resume pre-game playback (re-confirming prior UAT Test 3 pass after `WR-04` and `19-05` updates).
**Why human:** Requires live OS process/cmdline cleanup (`eq.pid`), Decky plugin reload timing, and real Sleep Timer + PipeWire state interaction.

### Gaps Summary

No automated gaps or blockers remain against Phase 19 (`19-01`..`19-05`) must-haves or `GAME-01`:
- All UAT `G-19-2` code/UI defects fixed in Plan `19-05` are verified in code and tests (`12/13` must-haves verified, `0` failed, `0` behavior-unverified, `16/16` CONTEXT.md decisions honored, `594/594` Python tests, `210/210` Vitest tests, `tsc --noEmit`, `eslint --max-warnings=0`, and `rollup -c` build all green).
- All prior review warnings (`WR-01`–`WR-06`, including the `boost_pa_volume` `coincidental-reliance` item) and info items (`IN-02`–`IN-05`) are resolved and tested. Three non-blocking `19-05` review items (`WR-08`, `WR-09`, `IN-06`) remain documented as warnings/info.

Overall status remains **`human_needed`** because:
1. The non-inferable `backstop` truth in `19-01-PLAN.md` requires live Steam Deck PipeWire/PulseAudio hardware verification (`reason: insufficient_spec`).
2. UAT Test 2 (`G-19-2`) requires physical Steam Deck `1280x800` GamepadUI visual & D-pad spatial navigation re-verification for the updated `19-05` controls (`SoundtracksTab` toggles, `GameEqModal` native surface/`MAINTAIN_X`/body focus, `SettingsTab` full-width override banner, and Non-Steam game name resolution), alongside hardware re-confirmation of UAT Tests 1 and 3 after post-UAT fixes.

---

_Verified: 2026-11-19T17:34:22Z_
_Verifier: the agent (gsd-verifier)_
