---
phase: 19-per-game-eq-volume-profiles
verified: 2026-11-19T18:18:56Z
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
covered_digest: "v4:sha256:2827ffdc54c021faa07c67f775d7e2b1dc8bd2d8f8a06346d839b84f5e9cbc41"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 12/13
  gaps_closed:
    - "WR-08 (6da2c77): src/index.tsx handleQuickBind requires exact mainAppId === activeGameAppId match, rejecting undefined, missing, empty, zero, NaN, and mismatched Router.MainRunningApp.appid values"
    - "WR-09 (fae79d1): py_modules/soundtrack.py and main.py factor _resolve_known_app_name / _match_vdf_game_name, offload cold vdf_parser.get_installed_games() lookups via asyncio.get_running_loop().run_in_executor in _resolve_app_name_async, skip VDF completely on unbound game launches (profile is None), avoid duplicate VDF scans via save_profile(..., resolve_vdf=False) & save_profile_async, and await save_profile_async in Plugin.save_game_soundtrack_profile with sync mock fallback"
    - "IN-06 (d7eb8cc): GameEqModal.tsx Reset to Flat DialogButton uses minWidth: 0 matching flex: 1 siblings, and SoundtracksTab.tsx patchProfileAppName / backfillProfileAppNames trim fallbackName / game.name and ignore whitespace-only titles"
  gaps_remaining: []
  regressions: []
decision_coverage:
  honored: 16
  total: 16
  not_honored: []
human_verification:
  - test: "Verify live PipeWire filter-chain transition and pactl sink-input fade on Steam Deck hardware (non-inferable backstop)"
    reason: insufficient_spec
    expected: "Launching and exiting Steam/Non-Steam games (including rapid game switches and mid-game GameEqModal pw-cli previews) transitions deckify_eq_sink and pactl set-sink-input-volume smoothly with no audible clicks, pops, or steamwebhelper/Chromium UI sound interference (re-confirming prior UAT Test 1 pass after WR-01..WR-04, WR-08/WR-09, IN-06, and 19-05 updates)."
    why_human: "Non-inferable backstop truth (verification: backstop): pipewire, pw-cli, and pactl binaries are SteamOS-only and mocked in Windows unit tests; held-out or live Steam Deck audio verification is required."
  - test: "Verify SteamOS GamepadUI Navigation, Layout & Visual Verification (1280x800) for G-19-2 and IN-06/WR-08 post-fix state"
    expected: "SoundtracksTab renders explicit Volume Override and Custom Ducking Level ToggleFields gating dedicated full-width SliderField rows without layout jumping or vertical letter-stacking, compact DialogButtons respect width: 'auto', and trimmed app_name backfill displays cleanly; GameEqModal inherits native ModalRoot surface with zero horizontal scroll, focuses body preset row on open instead of top-right Close, navigates two 4-item preset rows (with Reset to Flat flex: 1, minWidth: 0) -> 10-band EqBandFaders -> footer via D-pad with MAINTAIN_X alignment; SettingsTab renders Active Game EQ Override on a dedicated full-width banner row below the Equalizer header showing full resolved Steam/Non-Steam game names (e.g., PCSX2) and preset suffixes with ellipsis only on extraordinarily long titles; QAM displays GAME VOL / DUCKED pills, live effective_volume, and quick-bind passes verified display_name on exact appid match; two-step Delete Game Profile confirmation works cleanly."
    why_human: "SteamOS GamepadUI CSS (.DialogButton width: 100%, ModalRoot surface), FocusNavController MAINTAIN_X D-pad spatial traversal, live Router.MainRunningApp bridge, and 1280x800 visual layout cannot be exercised in headless Vitest shallow-JSX mocks."
  - test: "Verify crash recovery (active_game_override_snapshot + eq.pid) and Sleep Timer _sleep_locked priority on Steam Deck hardware"
    expected: "Killing/restarting Decky Loader mid-game verifies /proc/{pid}/cmdline for pipewire before terminating eq.pid and restores global EQ (including tearing down deckify_eq_sink when global is flat) and un-ducked baseline on Plugin._main(); exiting a game while a Sleep Timer fade is active restores global EQ and clears snapshot without un-ducking or resuming pre-game playback (re-confirming prior UAT Test 3 pass after WR-04, WR-09, and 19-05 updates)."
    why_human: "Requires real SteamOS /proc/{pid}/cmdline lifecycle, PulseAudio/PipeWire daemon state, and Decky Loader plugin restart behavior."
---

# Phase 19: Per-Game EQ & Volume Profiles Verification Report

**Phase Goal:** Users can assign a custom 10-band PipeWire EQ preset and target volume/ducking level to individual games in SoundtracksTab that activate automatically on game launch and cleanly restore the global audio baseline on game exit or crash recovery.
**Verified:** 2026-11-19T18:18:56Z
**Status:** human_needed
**Re-verification:** Yes — re-verification after code-review fix commits `6da2c77` (`WR-08`), `fae79d1` (`WR-09`), and `d7eb8cc` (`IN-06`) invalidated prior verification digest

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | **SC-1 (ROADMAP):** User can select and bind a per-game 10-band EQ preset and target volume/ducking level to any Steam or Non-Steam game profile in `SoundtracksTab`. | ✓ VERIFIED | `SoundtracksTab.tsx:448-621` renders `EQ Preset Override` (`EQ_OVERRIDE_OPTIONS`), conditional `Edit Game EQ` -> `GameEqModal`, explicit `Volume Override` `ToggleField` -> dedicated `SliderField` (`0..100%`), explicit `Custom Ducking Level` `ToggleField` -> dedicated `SliderField` (`0..95%`), and `SoundtrackManager._sanitize_profile` / `save_profile` / `save_profile_async` (`py_modules/soundtrack.py:117-192, 246-282`) persist all fields. Verified by `SoundtracksTab.test.tsx` (27/27) & `test_soundtrack.py` (54/54). |
| 2 | **SC-2 (ROADMAP):** Launching a game with an assigned audio profile automatically applies the ephemeral EQ and volume/ducking override without overwriting the user's persistent global `eq_preset` or baseline volume on disk. | ✓ VERIFIED | `SoundtrackManager._run_launch` (`py_modules/soundtrack.py:487-554`) invokes `apply_active_audio_profile()` (`400-476`) in atomic order (EQ -> `active_game_override_snapshot` -> clear `_cached_sink_input_id` -> `VolumeFader.apply_game_override`) without mutating `settings["eq_preset"]`/`eq_custom_bands`. `boost_pa_volume()` (`py_modules/volume.py:86-117`) delegates target calculation to `_compute_boost_target(fader)` respecting overrides, ducking, and `_sleep_locked`. Verified by `test_soundtrack.py` (54/54), `test_equalizer.py` (35/35), & `test_volume.py` (72/72). |
| 3 | **SC-3 (ROADMAP):** Exiting the game (or restarting the plugin after an unexpected crash/reboot via `active_game_override_snapshot`) restores the user's global EQ preset and volume baseline while respecting any active Sleep Timer fade-out priority lock (`_sleep_locked`). | ✓ VERIFIED | `SoundtrackManager._run_exit` (`py_modules/soundtrack.py:555-626`) restores global EQ first (`clear_ephemeral_override`), clears `active_game_override_snapshot`, invalidates `_cached_sink_input_id`, skips `clear_game_override` and playback restore when `_sleep_locked is True`, and preserves `_pre_game_snapshot` across back-to-back A→B switches (`365-369`). `Plugin._main()` (`main.py:190, 203-222`) runs `cleanup_stale_process()` (verifying `/proc/{old_pid}/cmdline` contains `"pipewire"`) and recovers stale `active_game_override_snapshot`. Verified by `test_soundtrack.py` (54/54), `test_equalizer.py` (35/35), & `test_volume.py` (72/72). |
| 4 | `EqualizerManager` isolates `_ephemeral_preset`/`_ephemeral_bands` and `_preview_active` from global settings, serializes throttled `pw-cli` flushes, preserves active game EQ on `librespot` restart, cleans stale `eq.pid`, and exposes validated `preview_eq_bands`/`clear_eq_preview` RPCs. | ✓ VERIFIED | `py_modules/equalizer.py:218-750` (`_eq_seq` lock/cancel serialization on `preview_bands`/`set_bands`/`apply_preset`, `/proc/{pid}/cmdline` guard in `cleanup_stale_process`), `main.py:75-87, 575-580, 1112-1149`. Verified by `test_equalizer.py` (35/35). |
| 5 | `VolumeFader` computes sink-input volume 100% locally via PipeWire with zero `set_volume` calls in `SoundtrackManager`, guards `fade_to` task replacement monotonically, combines ceiling (`0..100`), ducking (`0..95`, min factor `0.05`), and `voice` VAD min-dip; QAM displays live `effective_volume` and `"DUCKED"` / `"GAME VOL"` pills; ducking triggers post-debounce with pending `_exit_task` guard. | ✓ VERIFIED | `py_modules/volume.py:86-117, 234-516`, zero `set_volume` in `py_modules/soundtrack.py`, `main.py:983-1027`, `src/index.tsx:205, 289-306, 914-940`. Verified by `test_volume.py` (72/72), `test_soundtrack.py` (54/54), and `src/index.test.tsx` (17/17). |
| 6 | Boundary sanitization and idempotency invariants: exact numeric bounds (`0..100`, `0..95`, `-12.0..+12.0` 2-decimal rounding, positive `int` snapshot `app_id`, rejecting `bool`/`NaN`/`±Inf`) and idempotent repeat calls on ephemeral EQ, preview, `set_ducking(False, 'game')`, and `clear_game_override`. | ✓ VERIFIED | `py_modules/common.py:231-242`, `py_modules/equalizer.py:53-72, 546-569, 610-611`, `main.py:75-87`, `py_modules/soundtrack.py:149-181`, `py_modules/volume.py:308-314, 391-407`. Verified by `test_equalizer.py`, `test_volume.py`, and `test_soundtrack.py`. |
| 7 | `EqBandFaders` shares 10 ISO faders across `SettingsTab` and `GameEqModal` with forwarded `aria-label` on `InteractiveRow`; `GameEqModal` handles seeding, error recovery, and `isRunningGame`-aware `clear_eq_preview` (including async save failure/mid-edit exit safety). | ✓ VERIFIED | `EqBandFaders.tsx:1-239`, `InteractiveRow.tsx:109, 115`, `GameEqModal.tsx:66-532` (`invokeSaveWithClear` clears preview when `!isRunningRef.current || failed`; `Reset to Flat` uses `minWidth: 0` on line 208 per `IN-06`). Verified by `GameEqModal.test.tsx` (13/13) and `SettingsTab.test.tsx` (35/35). |
| 8 | `SoundtracksTab` renders D-11 subtitles, conditional `Edit Game EQ` button, two-step `Delete Game Profile` confirmation, immediate running-game hot-apply (`refresh_active_overrides`), unmount flush (`flushPendingSaves`), empty/loading/error/truncation states, and `DeckifyExpandedModal` wires `runningAppId`/global baselines with modal trigger suppression. | ✓ VERIFIED | `soundtrackUtils.ts:9-208`, `SoundtracksTab.tsx:108-1201` (trimmed `patchProfileAppName` / `backfillProfileAppNames` ignoring whitespace-only names per `IN-06`), `DeckifyExpandedModal.tsx:751, 1229-1238`. Verified by `SoundtracksTab.test.tsx` (27/27) and `test_soundtrack.py` (54/54). |
| 9 | `Plugin.get_status()` exposes `active_game_app_id` and `active_game_override` while excluding `active_game_override_snapshot` from `settings`, and `Plugin.set_setting` rejects external writes to `active_game_override_snapshot` and strips `_INTERNAL_SETTING_KEYS` from response & `settings_changed`. | ✓ VERIFIED | `main.py:67-72, 597-649, 707-712, 885-891`. Verified by `test_soundtrack.py` (54/54). |
| 10 | **Gap Closure `19-05` + `IN-06` (`SoundtracksTab`):** Renders explicit full-width `ToggleField`s for `Volume Override` (`80` <-> `null`) and `Custom Ducking Level` (disabled when `ducking_override === false`, `fallbackDucking` <-> `null`) gating dedicated-row `SliderField`s only when enabled, removes inline `Clear Volume Override`/`Use Global Ducking` buttons, sets `width: 'auto'` on all 6 `DialogButton` roles, trims and backfills empty `app_name` from `game.name` ignoring whitespace-only names, and preserves `useState` slots `0..6`. | ✓ VERIFIED | `SoundtracksTab.tsx:108-130, 369, 385, 475, 529-621, 640, 667, 680, 901-907, 938-943, 965-971, 1020-1024, 1106-1110, 1152-1163`. Verified by `SoundtracksTab.test.tsx` (27/27) with `eslint --max-warnings=0`. |
| 11 | **Gap Closure `19-05` + `IN-06` (`GameEqModal` + `EqBandFaders`):** Inherits native `ModalRoot` surface (no `#121212` / `minWidth: 520`), constrains container (`width: '100%'`, `maxWidth: 'min(680px, 88vw)'`, `maxHeight: '82vh'`, `overflowY: 'auto'`, `overflowX: 'hidden'`, `boxSizing: 'border-box'`, `padding: 12`), wraps header in `Focusable[flow-children='horizontal']` with `width: 'auto'` and no `flexShrink: 0` on `Close`, splits `Copy from Preset` + `Reset to Flat` (`width: 'auto', minWidth: 0, flex: 1`) into two non-wrapping 4-item `MAINTAIN_X` rows aligned with `EqBandFaders` and footer (`width: 'auto', flex: 1`), and focuses body via `preferredFocus` + `requestAnimationFrame`. | ✓ VERIFIED | `EqBandFaders.tsx:219-221`, `GameEqModal.tsx:37-50, 95-158, 203-269, 272-310, 454-469, 504-530` (line 208 `minWidth: 0` verified). Verified by `GameEqModal.test.tsx` (13/13) with `eslint --max-warnings=0`. |
| 12 | **Gap Closure `19-05` + `WR-08` + `WR-09` (QAM + `SoundtrackManager` + `SettingsTab`):** QAM `handleQuickBind` requires exact `mainAppId === activeGameAppId` before forwarding trimmed `Router.MainRunningApp.display_name` (rejecting `undefined`/missing/empty/`0`/`"0"`/`NaN`), `SoundtrackManager` splits `_resolve_known_app_name` / `_match_vdf_game_name` and offloads cold `vdf_parser.get_installed_games()` via `run_in_executor` in `_resolve_app_name_async`, unbound launches (`profile is None`) skip VDF completely, `save_profile_async` & `Plugin.save_game_soundtrack_profile` (with sync fallback) avoid duplicate scans, `apply_active_audio_profile` self-heals legacy `app_name: ""` profiles, and `SettingsTab` renders `Active Game EQ Override` on a dedicated full-width banner row below the Equalizer header. | ✓ VERIFIED | `src/index.tsx:421-431` (`mainAppId === activeGameAppId`), `main.py:6, 928-961` (`inspect.iscoroutinefunction` + `save_profile_async` / sync fallback), `py_modules/soundtrack.py:11, 194-282, 400-407, 671-681`, `SettingsTab.tsx:486-557`. Verified by `src/index.test.tsx` (17/17), `tests/test_soundtrack.py` (54/54), and `SettingsTab.test.tsx` (35/35). |
| 13 | **Non-inferable Backstop (`19-01`):** Live PipeWire filter-chain transition and `pactl` sink-input fade execute without audible clicks or `steamwebhelper` interference during concurrent game launch/exit on Steam Deck. | ⚠️ INSUFFICIENT_SPEC (abstained) | Tagged `verification: backstop`. Automated tests in this session run on Windows with mocked `pipewire`/`pw-cli`/`pactl` subprocesses; backend files (`soundtrack.py`, `main.py`, and prior `equalizer.py`/`volume.py`) changed since prior UAT Test 1. Abstained per Step 3 item 5b (`reason: insufficient_spec`) and routed to Human Verification. |

**Score:** 12/13 must-haves verified (0 failed, 0 behavior-unverified, 1 non-inferable `backstop` abstained with `reason: insufficient_spec`)

### Decision Coverage

`check.decision-coverage-verify` evaluated `19-CONTEXT.md` against Phase 19 artifacts:
- **Result:** 16 / 16 trackable CONTEXT.md decisions (`D-01` through `D-16`) honored (`not_honored: []`).
- **Message:** All trackable CONTEXT.md decisions are honored by shipped artifacts.

### Advisory (New Scope, Unevidenced)

None — all Step 7 checks on files modified in `6da2c77`, `fae79d1`, and `d7eb8cc` (`src/index.tsx`, `py_modules/soundtrack.py`, `main.py`, `src/components/tabs/GameEqModal.tsx`, `src/components/tabs/SoundtracksTab.tsx`) and across all 14 Phase 19 source files are clean with zero blockers and zero unevidenced findings.

### Test Quality Audit

| Test File | Linked Req | Active | Skipped | Circular | Assertion Level | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| `tests/test_equalizer.py` | GAME-01 | 35 | 0 | 0 | Value + Behavioral | ✓ PASS (subprocess mocked) |
| `tests/test_volume.py` | GAME-01 | 72 | 0 | 0 | Value + Behavioral | ✓ PASS (subprocess mocked) |
| `tests/test_soundtrack.py` | GAME-01 | 54 | 0 | 0 | Value + Behavioral | ✓ PASS (async lifecycle + executor/mocks) |
| `tests/test_e2e_requirements.py` | GAME-01 | 152 | 0 | 0 | Behavioral | ✓ PASS |
| `src/components/tabs/GameEqModal.test.tsx` | GAME-01 | 13 | 0 | 0 | Value + Behavioral | ✓ PASS (shallow JSX + mocked RPCs) |
| `src/components/tabs/SettingsTab.test.tsx` | GAME-01 | 35 | 0 | 0 | Value + Behavioral | ✓ PASS (shallow JSX + mocked RPCs) |
| `src/components/tabs/SoundtracksTab.test.tsx` | GAME-01 | 27 | 0 | 0 | Value + Behavioral | ✓ PASS (shallow JSX + mocked RPCs) |
| `src/index.test.tsx` | GAME-01 | 17 | 0 | 0 | Value + Behavioral | ✓ PASS (shallow JSX + mocked RPCs) |

**Disabled tests on requirements:** 0 (static scan matched `tests/test_soundtrack.py:846` `_run_exit(` substring; 0 actual skipped/disabled tests)
**Circular patterns detected:** 0 (file writes in `test_equalizer.py`/`test_soundtrack.py`/`test_e2e_requirements.py` construct isolated test input files inside `TemporaryDirectory`)
**Insufficient assertions:** 0 (SteamOS PipeWire binary behavior and live `1280x800` GamepadUI rendering are outside unit-test mock boundaries and routed to Human Verification)

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `py_modules/common.py` | `EQ_PID_FILE`, `active_game_override_snapshot` default & load sanitizer | ✓ VERIFIED | Lines 45, 88, 231-242: validates non-bool positive `int` `app_id` in `[1, 0xFFFFFFFF]` |
| `py_modules/equalizer.py` | 3-layer `EqualizerManager`, `_eq_seq` throttle serialization, `/proc` `eq.pid` check | ✓ VERIFIED | 750 lines; `has_ephemeral_override`, `get_active_override_info`, `apply_ephemeral_preset`, `clear_ephemeral_override`, `preview_bands`, `clear_preview`, `cleanup_stale_process`, `clamp_eq_bands` |
| `py_modules/volume.py` | Unified local `VolumeFader` overrides, `_sleep_locked` guard, `_fade_seq`, `_compute_boost_target`, `has_game_override` | ✓ VERIFIED | 620 lines; `_compute_boost_target`, `boost_pa_volume`, `_compute_target_sink_volume`, `apply_game_override`, `clear_game_override`, `fade_to`, `has_game_override`, `apply_equalizer_preset` |
| `py_modules/soundtrack.py` | Extended schema/sanitizer, `_resolve_known_app_name`, `_match_vdf_game_name`, async `_resolve_app_name_async`, `save_profile_async`, unbound VDF skip, sequenced launch/exit, zero `set_volume` | ✓ VERIFIED | 681 lines; zero `set_volume` calls; `_resolve_known_app_name`, `_match_vdf_game_name`, `_resolve_app_name`, `_resolve_app_name_async`, `save_profile(*, resolve_vdf=True)`, `save_profile_async`, `apply_active_audio_profile`, `refresh_active_overrides`, `bind_current_music_to_game`, `_run_launch`, `_run_exit` |
| `main.py` | Boot crash recovery, `_validate_eq_bands` (`isfinite`), preview RPCs, `save_game_soundtrack_profile` async offload + sync fallback, post-debounce ducking, filtered settings emits | ✓ VERIFIED | `_INTERNAL_SETTING_KEYS`, `_validate_eq_bands`, `_main()` crash recovery, `save_game_soundtrack_profile` (`inspect.iscoroutinefunction` -> `save_profile_async`), `preview_eq_bands`, `clear_eq_preview`, `get_status`, `set_setting`, `_public_settings_payload`, `trigger_ducking`, `get_ducking_state`, `start_librespot` |
| `src/types.ts` | Phase 19 TypeScript contracts | ✓ VERIFIED | Exports `ActiveGameOverrideInfo`, `DuckingState.has_game_override`, `StatusResponse` game fields, `SoundtrackProfile` EQ/ducking fields |
| `src/components/tabs/soundtrackUtils.ts` | EQ labels/options, D-11 subtitle formatter, immutable setters, `normalizeProfiles` backfill | ✓ VERIFIED | 222 lines; `EQ_PRESET_LABELS`, `EQ_OVERRIDE_OPTIONS`, `formatGameProfileSubtitle`, `setEqPreset`, `setEqCustomBands`, `setDuckingLevelOverride` |
| `src/components/common/InteractiveRow.tsx` | Forwards `aria-label` prop to `<Focusable>` | ✓ VERIFIED | Lines 109, 115 forward `aria-label` cleanly |
| `src/components/common/EqBandFaders.tsx` | Shared 10-band ISO fader renderer (`flow-children="horizontal"`, `MAINTAIN_X`) | ✓ VERIFIED | 239 lines; `NavEntryPositionPreferences.MAINTAIN_X` on strip; zero ESLint warnings |
| `src/components/tabs/GameEqModal.tsx` | Native `ModalRoot` surface, `overflowX: "hidden"`, two 4-item `MAINTAIN_X` rows (`Reset to Flat` `minWidth: 0`), `useBodyInitialFocus`, `width: "auto"` buttons | ✓ VERIFIED | 532 lines; native surface, `width: "auto"` on `Close`/`Reset to Flat`/footer, `minWidth: 0` on `Reset to Flat` (line 208), `useBodyInitialFocus` (`rAF`), `invokeSaveWithClear`; zero ESLint warnings |
| `src/components/tabs/GameEqModal.test.tsx` | Vitest suite for `GameEqModal` | ✓ VERIFIED | 778 lines; 13 passing tests covering seeding, surface/overflow constraints, `Reset to Flat` `minWidth: 0`, `MAINTAIN_X`, `rAF` focus, async failure clear, and `isRunningGame` branches |
| `src/components/tabs/SettingsTab.tsx` | `renderEqBandFaders`, dedicated full-width `Active Game EQ Override` banner row + caption, event listener | ✓ VERIFIED | Dedicated full-width row (`lines 517-552`) below header (`486-516`), `flexShrink: 0` prefix/suffix, ellipsis only on title; `renderEqBandFaders` on line 593 |
| `src/components/tabs/SoundtracksTab.tsx` | Explicit Volume/Ducking `ToggleField`s gating dedicated `SliderField`s, `width: "auto"` on 6 `DialogButton`s, trimmed `patchProfileAppName` & `backfillProfileAppNames`, `useState` slots `0..6`, unmount flush | ✓ VERIFIED | 1201 lines; trimmed `patchProfileAppName`/`backfillProfileAppNames` ignoring whitespace-only names (`108-130`); `useState` slots `0..6` preserved (`1152-1163`); zero ESLint warnings |
| `src/components/DeckifyExpandedModal.tsx` | Passes `runningAppId`, global EQ/ducking props & modal suppression | ✓ VERIFIED | Lines 751, 1230-1237 pass all props to `SoundtracksTab` and suppress triggers when `playlistPickerOpen` |
| `src/index.tsx` | QAM `hasGameOverride` subscription, `GAME VOL` / `DUCKED` volume display, `handleQuickBind` exact `mainAppId === activeGameAppId` guard & `display_name` forwarding | ✓ VERIFIED | Lines 205, 289-306, 421-439 (`mainAppId === activeGameAppId`), 914-940 |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `py_modules/soundtrack.py` | `py_modules/equalizer.py` | `apply_ephemeral_preset` / `clear_ephemeral_override` | ✓ WIRED | Lines 417, 425, 570 sequence EQ apply on launch/refresh and restore on exit |
| `py_modules/soundtrack.py` | `py_modules/volume.py` | `apply_game_override` / `clear_game_override` + `_cached_sink_input_id = None` | ✓ WIRED | Lines 455-464, 580-591 invalidate sink-input cache and check `_sleep_locked` |
| `py_modules/soundtrack.py` | Spotify Web API `set_volume` | Removal verified | ✓ WIRED (removed) | Zero occurrences of `set_volume` in non-comment lines of `py_modules/soundtrack.py` |
| `py_modules/soundtrack.py` | `py_modules/vdf_parser.py` | `_resolve_app_name_async` (`run_in_executor`) & `_resolve_app_name` -> `vdf_parser.get_installed_games()` | ✓ WIRED | Lines 11, 194-245 wired into `save_profile` (`256-263`), `save_profile_async` (`278-282`), `apply_active_audio_profile` (`404`, skipped when `profile is None`), `bind_current_music_to_game` (`672`) |
| `main.py` | `py_modules/soundtrack.py` | `save_game_soundtrack_profile` (`save_profile_async` / sync fallback) & `delete_game_soundtrack_profile` -> `refresh_active_overrides`; `bind_current_music_to_game`; `handle_app_lifetime_event` -> `handle_app_lifecycle` | ✓ WIRED | Lines 6, 928-975 |
| `main.py` | `py_modules/equalizer.py` | `_main()` `cleanup_stale_process`, `start_librespot` `has_ephemeral_override`, `preview_eq_bands`/`clear_eq_preview` | ✓ WIRED | Lines 190, 214, 576-580, 1126-1149 |
| `src/components/tabs/SoundtracksTab.tsx` | `src/components/tabs/soundtrackUtils.ts` | `EQ_OVERRIDE_OPTIONS`, `formatGameProfileSubtitle`, setters | ✓ WIRED | Lines 327, 464, 467, 551, 600 |
| `src/components/tabs/SoundtracksTab.tsx` | `src/components/tabs/GameEqModal.tsx` | `showModal(<GameEqModal .../>)` + `onPickerOpenChange` + `saveImmediate` | ✓ WIRED | Lines 951-974 |
| `src/components/tabs/GameEqModal.tsx` | `src/components/common/EqBandFaders.tsx` | `renderEqBandFaders`, `normalizeEqBands`, `EQ_PRESET_CURVES`, `MAINTAIN_X` alignment | ✓ WIRED | Lines 7-11, 221 (`EqBandFaders`), 262, 276, 526 |
| `src/components/tabs/SettingsTab.tsx` | `src/components/common/EqBandFaders.tsx` | Direct call `renderEqBandFaders(...)` | ✓ WIRED | Line 593 |
| `src/components/DeckifyExpandedModal.tsx` | `src/components/tabs/SoundtracksTab.tsx` | `runningAppId`, `globalEqPreset`, `globalEqCustomBands`, `globalDuckingPct`, `onPickerOpenChange` | ✓ WIRED | Lines 751, 1230-1237 |
| `src/index.tsx` | `py_modules/volume.py` | `get_ducking_state` / `ducking_state_changed` -> `hasGameOverride`, `effectiveVolume`, `GAME VOL` | ✓ WIRED | Lines 289-306, 914-940 |
| `src/index.tsx` | `py_modules/soundtrack.py` | `handleQuickBind` extracts `Router.MainRunningApp`, enforces `mainAppId === activeGameAppId`, calls `backendBindCurrentMusicToGame(activeGameAppId, runningAppName)` -> `main.py:956` | ✓ WIRED | Automated single-line `verify.key-links` regex missed variable extraction across `src/index.tsx:424-430`; manually verified end-to-end call chain (`src/index.tsx:424-430` -> `main.py:956-961` -> `py_modules/soundtrack.py:657-681`) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `SoundtracksTab.tsx` | `games`, `profiles`, `runningAppId` | `get_installed_games`, `get_game_soundtrack_profiles`, trimmed `backfillProfileAppNames`, `status.active_game_app_id` | Yes (persisted VDF/JSON + live lifecycle state) | ✓ FLOWING |
| `GameEqModal.tsx` | `bands` | `profile.eq_custom_bands` -> `seedBands` -> `preview_eq_bands` / `save_game_soundtrack_profile` | Yes (persisted profile + live backend preview) | ✓ FLOWING |
| `SettingsTab.tsx` | `liveGameOverride`, `localBands` | `status.active_game_override` + `game_audio_override_changed` event (with VDF self-healed `app_name`); `status.settings.eq_preset`/`eq_custom_bands` | Yes (live backend override info + persisted settings) | ✓ FLOWING |
| `src/index.tsx` (QAM) | `isDucked`, `hasGameOverride`, `effectiveVolume`, `runningAppName` | `get_ducking_state()` + `ducking_state_changed`; `Router.MainRunningApp?.display_name` (exact `mainAppId === activeGameAppId` match) | Yes (live computed sink ratio × `_poll_volume` + verified Steam running app title) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Phase 19 Python suites (`soundtrack`, `equalizer`, `volume`, `e2e`) | `py -3 -m unittest discover -s tests -p "test_soundtrack.py"` / `"test_equalizer.py"` / `"test_volume.py"` / `"test_e2e_requirements.py"` | `54 OK` (8.311s), `35 OK` (2.806s), `72 OK` (3.594s), `152 OK` (4.387s) — `313/313` Phase 19 & E2E tests passed | ✓ PASS |
| Targeted Phase 19 Vitest suites | `pnpm test -- --run src/components/tabs/SoundtracksTab.test.tsx src/components/tabs/GameEqModal.test.tsx src/components/tabs/SettingsTab.test.tsx src/index.test.tsx` | `4 passed (4), 92 passed (92)` (`SoundtracksTab.test.tsx`: 27, `GameEqModal.test.tsx`: 13, `SettingsTab.test.tsx`: 35, `src/index.test.tsx`: 17) | ✓ PASS |
| TypeScript typecheck | `pnpm run typecheck` | `tsc --noEmit` exit 0 | ✓ PASS |
| ESLint check (zero-warning gate & repo) | `pnpm exec eslint --max-warnings=0 src/components/tabs/SoundtracksTab.tsx src/components/tabs/GameEqModal.tsx src/components/common/EqBandFaders.tsx` & `pnpm run lint` | `0 errors, 0 warnings` on `SoundtracksTab.tsx`, `GameEqModal.tsx`, `EqBandFaders.tsx`; `0 errors` across `src/` (658 pre-existing warnings in untouched files) | ✓ PASS |
| Production Rollup build | `pnpm run build` | `./src/index.tsx → dist... created dist in 7.5s` (exit 0) | ✓ PASS |
| Zero `set_volume` in `SoundtrackManager` | Python non-comment scan of `py_modules/soundtrack.py` | `set_volume_in_soundtrack: False` | ✓ PASS |

### Probe Execution

N/A — No probe scripts (`scripts/*/tests/probe-*.sh`) declared or implied for Phase 19.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `GAME-01` | 19-01, 19-02, 19-03, 19-04, 19-05 | Bind per-game 10-band PipeWire EQ preset & volume/ducking overrides in `SoundtracksTab`, activate ephemerally on launch, restore global baseline on exit/crash recovery without mutating persistent settings or interrupting `_sleep_locked` | ? NEEDS HUMAN (automated checks green; backstop & SteamOS UI `G-19-2` hardware check pending) | Code + `313` Phase 19/E2E Python tests + `92` Phase 19 Vitest tests + `tsc --noEmit` + `eslint --max-warnings=0` + Rollup build verified; live SteamOS PipeWire hardware audio behavior (`insufficient_spec` backstop) and `1280x800` GamepadUI layout/D-pad verification (`G-19-2`) queued for Steam Deck verification. |

Orphaned requirements mapped to Phase 19 in `.planning/REQUIREMENTS.md`: None (only `GAME-01` is mapped to Phase 19).

### Prohibitions Verification

| # | Prohibition | Verification Tier | Status | Evidence |
| --- | --- | --- | --- | --- |
| 1 | MUST NOT overwrite or mutate persistent global `eq_preset` or `eq_custom_bands` on disk when activating, hot-applying, or previewing a per-game EQ override (`19-01`) | `test` | ✓ VERIFIED | Enforced in `py_modules/equalizer.py` (`apply_ephemeral_preset`, `preview_bands`); tested in `tests/test_equalizer.py` (`35/35`). |
| 2 | MUST NOT invoke Spotify Web API `PUT /v1/me/player/volume` (`self.plugin.set_volume`) during `SoundtrackManager` game launch or game exit transitions (`19-01`) | `test` | ✓ VERIFIED | Zero `set_volume` occurrences in `py_modules/soundtrack.py`; tested in `tests/test_soundtrack.py` (`54/54`). |
| 3 | MUST NOT allow `VolumeFader` game exit teardown, crash recovery, or live override updates to un-duck or restore pre-game playback while `VolumeFader._sleep_locked` is `True` (`19-01`) | `test` | ✓ VERIFIED | Enforced in `py_modules/volume.py:89-90, 378, 397`, `py_modules/soundtrack.py:581-588`, `main.py:215`; tested in `tests/test_volume.py` (`72/72`) & `tests/test_soundtrack.py` (`54/54`). |
| 4 | MUST NOT expose `active_game_override_snapshot` in `get_status().settings` or allow untrusted `set_setting('active_game_override_snapshot', ...)` mutations (`19-02`) | `test` | ✓ VERIFIED | Enforced in `main.py:67-72, 602-647, 707-712, 885-891`; tested in `tests/test_soundtrack.py` (`54/54`). |
| 5 | MUST NOT mutate or overwrite persistent global `eq_preset` or `eq_custom_bands` when previewing or saving curves inside `GameEqModal` (`19-03`) | `test` | ✓ VERIFIED | Enforced in `GameEqModal.tsx` & `SoundtracksTab.tsx:951-984`; tested in `GameEqModal.test.tsx` (`13/13`) & `SoundtracksTab.test.tsx` (`27/27`). |

### Anti-Patterns Found

Debt markers (`TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`) and stub scan: 0 found across all 14 Phase 19 source files.
All prior code-review findings (`WR-01`–`WR-06`, `WR-08`, `WR-09`, `IN-02`–`IN-06`) are verified resolved in source and unit tests.

### Human Verification Required

### 1. Live PipeWire Filter-Chain & Sink-Input Hardware Audio (Abstained `backstop` — `reason: insufficient_spec`)

**Test:** Launch a Steam or Non-Steam game on Steam Deck with a configured EQ preset (including `Custom` 10-band curve) and `Volume Override` / `Ducking Attenuation Override`; perform rapid game switches (Game A → Game B within 3s) and live `GameEqModal` slider previews mid-game, then exit the game.
**Expected:** `deckify_eq_sink` (`pipewire -c`), `pw-cli set-param`, and `pactl set-sink-input-volume` transitions execute cleanly without audible clicks, audio corking, or `steamwebhelper`/`Chromium` UI sound muting (re-confirming prior UAT Test 1 pass after `WR-01`..`WR-04`, `WR-08`/`WR-09`, `IN-06`, and `19-05` updates).
**Why human / insufficient_spec:** Tagged `verification: backstop` (`19-01-PLAN.md`). Host PipeWire/PulseAudio binaries do not exist in the Windows test environment and are mocked in all unit tests; real SteamOS audio hardware behavior requires direct Steam Deck verification.

### 2. SteamOS GamepadUI Navigation, Layout & Visual Verification (`1280x800` — UAT `G-19-2` Closure & Post-Fix State)

**Test:** Open `DeckifyExpandedModal` → `Soundtracks` tab on Steam Deck. Expand a Steam game and a Non-Steam shortcut (including a legacy empty-`app_name` profile or QAM quick-bind); toggle `Volume Override` and `Custom Ducking Level` ON/OFF and drag both dedicated sliders; select `EQ Preset Override: Custom`, open `Edit Game EQ`, verify modal open focus/surface/scroll and navigate Preset Row 1 -> Preset Row 2 (`Reset to Flat`) -> 10-band faders -> `Discard Changes`/`Save Game EQ` via D-pad; inspect `SettingsTab` (`Active Game EQ Override` banner row) and QAM (`GAME VOL` / `DUCKED` pills, live volume slider, and quick-bind title propagation); test two-step `Delete Game Profile`.
**Expected:** `SoundtracksTab` `ToggleField`s gate dedicated full-width `SliderField` rows with zero layout jumps or vertical letter-stacking, all compact `DialogButton`s fit at `width: "auto"`, and trimmed `app_name` backfill populates clean game names without whitespace artifacts; `GameEqModal` inherits native `ModalRoot` chrome with zero horizontal scroll, focuses body preset row on open instead of top-right `Close`, and D-pad Down preserves horizontal column alignment (`MAINTAIN_X`) across preset rows (`Reset to Flat` aligned with `flex: 1, minWidth: 0`), 10-band faders, and footer buttons; `SettingsTab` renders `Active Game EQ Override: {Resolved Game Name} ({Preset})` on its own full-width row below the Equalizer header without `"App <digits>..."` fallback (truncating only extraordinarily long game names); QAM displays `GAME VOL` / `DUCKED`, live `effective_volume`, and binds accurate titles via `Router.MainRunningApp`.
**Why human:** SteamOS `.DialogButton` CSS defaults, `ModalRoot` dialog styling, `FocusNavController` spatial D-pad traversal, live `Router.MainRunningApp` bridge, and `1280x800` visual layout cannot be verified via headless Vitest JSX mocks.

### 3. Mid-Game Crash Recovery & Sleep Timer `_sleep_locked` Priority on Hardware

**Test:** (a) While a game with active EQ & volume overrides is running, restart the Decky Loader plugin (`systemctl restart plugin_loader` or reload plugin) and observe audio baseline restoration on startup; (b) Start a Sleep Timer fade-out while a game is running, then exit the game before/during the fade.
**Expected:** (a) Orphan `pipewire -c` (`eq.pid`, verified via `/proc/{pid}/cmdline`) is cleaned up, `active_game_override_snapshot` clears, global `eq_preset` (including `flat` teardown) and un-ducked volume restore automatically unless the same game is still running; (b) Game exit restores global EQ and clears snapshot while `_sleep_locked` keeps volume faded/muted and does not resume pre-game playback (re-confirming prior UAT Test 3 pass after `WR-04`, `WR-09`, and `19-05` updates).
**Why human:** Requires live OS process/cmdline cleanup (`eq.pid`), Decky plugin reload timing, and real Sleep Timer + PipeWire state interaction.

### Gaps Summary

No automated gaps or blockers remain against Phase 19 (`19-01`..`19-05`) must-haves or `GAME-01`:
- All post-verification code-review fixes (`WR-08` `6da2c77`, `WR-09` `fae79d1`, and `IN-06` `d7eb8cc`) are verified in source and tests (`12/13` must-haves verified, `0` failed, `0` behavior-unverified, `16/16` CONTEXT.md decisions honored, `313/313` Phase 19/E2E Python tests, `92/92` targeted Vitest tests, `tsc --noEmit`, `eslint --max-warnings=0`, and `rollup -c` production build all green).
- Overall status remains **`human_needed`** because:
  1. The non-inferable `backstop` truth in `19-01-PLAN.md` requires live Steam Deck PipeWire/PulseAudio hardware verification (`reason: insufficient_spec`).
  2. UAT Test 2 (`G-19-2`) and hardware UAT Tests 1 & 3 require physical Steam Deck `1280x800` GamepadUI visual & D-pad spatial navigation and SteamOS PipeWire/`/proc/{pid}/cmdline` confirmation for the final post-fix codebase.

---

_Verified: 2026-11-19T18:18:56Z_
_Verifier: the agent (gsd-verifier)_
