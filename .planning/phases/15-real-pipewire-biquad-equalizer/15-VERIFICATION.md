---
phase: 15-real-pipewire-biquad-equalizer
verified: 2026-11-17T18:57:30Z
status: passed
score: 12/12 must-haves verified
covered_files:
  - ".planning/phases/15-real-pipewire-biquad-equalizer/15-01-PLAN.md"
  - ".planning/phases/15-real-pipewire-biquad-equalizer/15-01-SUMMARY.md"
  - ".planning/phases/15-real-pipewire-biquad-equalizer/15-02-PLAN.md"
  - ".planning/phases/15-real-pipewire-biquad-equalizer/15-02-SUMMARY.md"
  - "main.py"
  - "py_modules/__init__.py"
  - "py_modules/common.py"
  - "py_modules/engine.py"
  - "py_modules/equalizer.py"
  - "py_modules/volume.py"
  - "src/components/tabs/SettingsTab.test.tsx"
  - "src/components/tabs/SettingsTab.tsx"
  - "src/types.ts"
  - "tests/test_equalizer.py"
covered_digest: "v4:sha256:a24f8c1ac0b7ccec1b6e5dc3e5870b60466408fedf2273e1c491ed216afd1f0a"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 12/12
  gaps_closed:
    - "All 5 on-device Steam Deck human UAT tests passed in 15-UAT.md (preset switching, 10-band ISO auto-fork, stream isolation & sink switching, GamepadUI D-pad navigation & compact QAM, and persistence across restart/reboot)"
  gaps_remaining: []
  regressions: []
---

# Phase 15: Real PipeWire Biquad Equalizer Verification Report

**Phase Goal:** Users can shape Deckify's audio output in real time using preset or custom 5-band/10-band PipeWire biquad EQ without disrupting game or Steam UI audio.
**Verified:** 2026-11-17T18:57:30Z
**Status:** passed
**Re-verification:** Yes — after on-device UAT completion (`15-UAT.md` 5/5 passed, plus UAT fixes `5743b12`, `70b42ab`, `efe242e`)

> **Note on Scope Evolution (D-01 / D-03):** `ROADMAP.md` and `REQUIREMENTS.md` (`EQ-01`, `EQ-02`) originally referenced 3 sound presets and 5 custom bands; `15-CONTEXT.md` decisions `D-01` and `D-03` expanded the implementation to a **10-band ISO graphic EQ** (`31Hz..16kHz`) and **5 sound presets** (`bass`, `vocal`, `gaming`, `deck_speakers`, `late_night` + `flat` bypass + `custom` = 7 pills).

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Non-flat EQ preset launches isolated `pipewire -c` filter-chain child process as UID 1000 via `_build_deck_command()` with `priority.session=0` and `priority.driver=0`, never restarting system `pipewire` (`D-03`, `D-04`, `D-05`). | ✓ VERIFIED | `py_modules/equalizer.py` (`generate_filter_chain_conf`, `_deck_cmd`, `_start_process`) verified; `test_apply_preset_spawns_pipewire_and_flat_tears_down` passes; on-device UAT #1 & #3 passed. |
| 2 | Selecting `flat` performs true bypass by terminating `pipewire -c` and routing `librespot` directly to hardware sink (`D-04`). | ✓ VERIFIED | `EqualizerManager.apply_preset("flat")` calls `stop()` + `_fallback_to_hardware_sink()`; tested in `test_apply_preset_spawns_pipewire_and_flat_tears_down`; UAT #1 verified uninterrupted playback on `Flat` bypass. |
| 3 | All 10 ISO biquad bands (`31Hz..16kHz`) support `-12.0` to `+12.0` dB in `0.5` dB steps with automatic negative preamp headroom (`-max(0, max_band_gain)`) on `eq_preamp:Mult` (`D-01`, `D-06`). | ✓ VERIFIED | `EQ_BAND_FREQS`, `clamp_eq_bands`, `compute_preamp_db`, `generate_filter_chain_conf`, `build_pw_cli_params` verified in `py_modules/equalizer.py` and `test_equalizer.py`. |
| 4 | Continuous `set_eq_bands` updates coalesce `pw-cli set-param` to `~75ms` and debounce `settings.json` persistence by `500ms` (`D-07`). | ✓ VERIFIED | `_PW_CLI_THROTTLE_S = 0.075`, `_SAVE_DEBOUNCE_S = 0.5`, `EqualizerManager.set_bands` verified; `test_set_bands_coalesces_pw_cli_and_debounces_save` passes. |
| 5 | Switching output sink via `set_audio_sink` while EQ is active keeps `librespot` on `deckify_eq_sink` and moves only `effect_output.deckify_eq` (`deckify_eq_out`), never touching `steamwebhelper`, `Chromium`, or game audio (`D-05`). | ✓ VERIFIED | `py_modules/engine.py` (`include_eq_output`, `eq_output_only`), `py_modules/volume.py` (`set_audio_sink`), `EqualizerManager.on_sink_changed` verified; `test_resolve_spotify_sink_input_ids_isolation_modes` & `test_volume_set_audio_sink_eq_active_vs_flat` pass; UAT #3 passed. |
| 6 | If `pipewire -c` fails to start or exits unexpectedly, `EqualizerManager` falls back to hardware sink and returns structured error without crashing `main.py`. | ✓ VERIFIED | `_start_process` & `_fallback_to_hardware_sink` in `py_modules/equalizer.py`; `test_crash_fallback_routes_librespot_to_hardware_sink` passes. |
| 7 | Spatial D-pad navigation: 7 EQ preset pills split into two `<Focusable flow-children="horizontal">` rows (4 in Row 1, 3 in Row 2), never `flow-children="row"` (`D-03`). | ✓ VERIFIED | `src/components/tabs/SettingsTab.tsx` verified; `SettingsTab.test.tsx` asserts 2 horizontal rows (4 + 3) and zero `flow-children="row"`; UAT #4 passed. |
| 8 | 10-band ISO layout & live drag: All 10 bands (`31 Hz`–`16 kHz`, `-12` to `+12` dB, `0.5` dB step) always visible in compact vertical graphic-EQ fader columns inside `<Focusable flow-children="horizontal">` (`D-01`, `D-02`, `D-07`). | ✓ VERIFIED | `src/components/tabs/SettingsTab.tsx` lines 485–620 (upgraded in `5743b12` to 10 vertical fader columns with `+`/`-` `InteractiveRow`s and `role="slider"`); `SettingsTab.test.tsx` and UAT #2 & #4 passed. |
| 9 | Preset-to-custom auto-fork: Clicking a preset snaps all 10 bands; moving any band immediately forks `eq_preset` to `"custom"` and calls `set_eq_bands`, while clicking `Custom` restores `eq_custom_bands` (`D-02`). | ✓ VERIFIED | `SettingsTab.tsx` & `main.py` (`eq_custom_bands` in `get_status` `public_keys` via `70b42ab`); `SettingsTab.test.tsx` & `test_get_status_includes_eq_custom_bands` pass; UAT #2 & #5 passed. |
| 10 | Compact QAM constraint (`D-08`): `src/index.tsx` remains untouched with zero EQ controls, preset pills, or EQ badges. | ✓ VERIFIED | `Select-String` returned 0 matches in `src/index.tsx`; UAT #4 confirmed QAM has no EQ controls. |
| 11 | Empty / bypass state: Selecting `Flat` snaps bands to `0.0 dB`, displays `Bypass (0.0 dB)` in card header, and tears down `pipewire -c` (`D-04`). | ✓ VERIFIED | `SettingsTab.tsx` verified; `SettingsTab.test.tsx` asserts `Bypass (0.0 dB)` on `"flat"`; UAT #1 passed. |
| 12 | Error fallback & Preamp header: Header displays `Preamp: -X.X dB` when non-flat bands are boosted (`D-06`), and surfaces error toast if backend returns `{ ok: false }`. | ✓ VERIFIED | `SettingsTab.tsx` lines 470–471 verified; `SettingsTab.test.tsx` asserts `Preamp: -6.0 dB` for `"bass"`. |

**Score:** 12/12 truths verified

### Advisory (New Scope, Unevidenced)

None

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `py_modules/equalizer.py` | `EqualizerManager`, 7 presets, conf generator, `pw-dump`/`pw-cli` | ✓ VERIFIED | 503 lines, substantive, imported and wired in `main.py` & `py_modules/__init__.py` |
| `py_modules/common.py` | `eq_custom_bands` default & 7-preset/10-band clamping | ✓ VERIFIED | Verified via `verify.artifacts` and `test_load_settings_accepts_all_7_presets_and_clamps_bands` |
| `py_modules/engine.py` | Stream-isolated sink-input resolution | ✓ VERIFIED | `effect_output.deckify_eq` in allowlist; `include_eq_output` & `eq_output_only` flags |
| `py_modules/volume.py` | EQ-aware `apply_equalizer_preset` & `set_audio_sink` | ✓ VERIFIED | Delegates to `plugin._equalizer_manager` |
| `py_modules/__init__.py` | Exports `equalizer` | ✓ VERIFIED | Exports `equalizer` module |
| `main.py` | Lifecycle, 7-preset validation, `set_eq_bands` RPC, `eq_custom_bands` status | ✓ VERIFIED | Verified via `verify.artifacts` and `TestMainEqualizerIntegration` (5/5 tests pass) |
| `tests/test_equalizer.py` | Unit tests for backend EQ | ✓ VERIFIED | 20/20 tests pass |
| `src/types.ts` | 7-value `EqualizerPreset` & `eq_custom_bands` | ✓ VERIFIED | Verified via `verify.artifacts` and `pnpm typecheck` |
| `src/components/tabs/SettingsTab.tsx` | 7 preset pills (2 horizontal rows) & 10 ISO faders | ✓ VERIFIED | Verified via `verify.artifacts`, `SettingsTab.test.tsx`, and UAT #1–#5 |
| `src/components/tabs/SettingsTab.test.tsx` | Vitest assertions for EQ UI | ✓ VERIFIED | 24/24 tests pass |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `main.py` | `py_modules/equalizer.py` | `self._equalizer_manager = equalizer.EqualizerManager(self)` | ✓ WIRED | Verified via `verify.key-links` |
| `py_modules/volume.py` | `py_modules/equalizer.py` | `apply_equalizer_preset` & `set_audio_sink` | ✓ WIRED | Verified via `verify.key-links` |
| `py_modules/equalizer.py` | `py_modules/engine.py` | `resolve_spotify_sink_input_ids` & `_set_pactl_sink_input` | ✓ WIRED | Verified via `verify.key-links` |
| `src/components/tabs/SettingsTab.tsx` | `main.py` | `callable('set_eq_bands')` & `callable('set_setting')` | ✓ WIRED | Verified via `verify.key-links` |
| `src/components/tabs/SettingsTab.tsx` | `src/types.ts` | `EqualizerPreset`, `DeckifySettings.eq_custom_bands` | ✓ WIRED | Verified via `verify.key-links` |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Backend full test suite | `py -3 -m unittest discover -s tests -p "test_*.py"` | Ran 517 tests in 34.129s — OK | ✓ PASS |
| Backend EQ unit tests | `py -3 -m unittest discover -s tests -p "test_equalizer.py" -v` | Ran 20 tests in 1.453s — OK | ✓ PASS |
| Backend volume & features tests | `py -3 -m unittest discover -s tests -p "test_volume.py"` / `"test_features.py"` | 58 tests OK / 28 tests OK | ✓ PASS |
| Frontend full test suite | `pnpm test -- --run` | 16 files, 164 tests passed | ✓ PASS |
| Frontend SettingsTab tests | `pnpm test -- --run src/components/tabs/SettingsTab.test.tsx` | 24 tests passed | ✓ PASS |
| TypeScript typecheck | `pnpm typecheck` | `tsc --noEmit` exited 0 | ✓ PASS |
| ESLint | `pnpm lint` | 0 errors (580 pre-existing warnings) | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `EQ-01` | 15-01, 15-02 | Real-time PipeWire `filter-chain` biquad DSP equalization (`flat` bypass + sound presets) isolated to Deckify stream | ✓ SATISFIED | `EqualizerManager`, `SettingsTab.tsx`, 20 backend EQ tests, 24 SettingsTab tests, and 5/5 human UAT (`15-UAT.md`) |
| `EQ-02` | 15-01, 15-02 | Custom EQ curve via `SliderField` controls in `SettingsTab` with live `pw-cli` updates and persistence | ✓ SATISFIED | `set_eq_bands` (`~75ms` `pw-cli` coalescing, `500ms` save debounce), 10-band ISO faders, and 5/5 human UAT (`15-UAT.md`) |

### Anti-Patterns Found

None in Phase 15 modified files (`TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` scan returned 0 matches in `py_modules/equalizer.py` and `src/components/tabs/SettingsTab.tsx`).

### Human Verification Required

None — all 5 on-device Steam Deck UAT tests in `15-UAT.md` completed with `result: pass` (`status: complete`).

---

_Verified: 2026-11-17T18:57:30Z_
_Verifier: the agent (gsd-verifier)_
