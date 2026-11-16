---
phase: 15-real-pipewire-biquad-equalizer
verified: 2026-11-16T16:43:00Z
status: human_needed
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
covered_digest: "v4:sha256:42363d321d2b37cafd4b58ccbaef31710ed882ac7dde5729d6b7b75aaa278637"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Play a track in Spotify on Steam Deck, switch through Flat, Bass Boost, Vocal Clarity, Gaming Balance, Deck Speakers, and Late Night in SettingsTab, then drag 10-band ISO sliders while a game or Steam UI audio is active."
    expected: "Real-time biquad filtering is audible on Deckify's stream without crackle, popping, or interruption to game audio or Steam UI navigation sounds."
    why_human: "Unit tests mock PipeWire/PulseAudio subprocesses (pipewire -c, pw-dump, pw-cli, pactl); live SteamOS PipeWire filter-chain DSP audio quality and stream isolation require on-device listening."
  - test: "Set a preset or Custom 10-band curve, reboot the Steam Deck, and reopen SettingsTab."
    expected: "Selected eq_preset and eq_custom_bands restore from settings.json and re-apply to the EqualizerManager on startup."
    why_human: "Requires a full SteamOS reboot cycle on hardware."
  - test: "Navigate the 7 EQ preset pills and 10 SliderField controls using the Steam Deck D-pad in GamepadUI."
    expected: "D-pad Left/Right moves cleanly within Row 1 (4 pills) and Row 2 (3 pills), Up/Down steps cleanly between rows and the 10 frequency bands, and Left/Right adjusts gain in 0.5 dB steps without focus traps."
    why_human: "GamepadUI spatial navigation feel and visual layout require on-device controller verification."
---

# Phase 15: Real PipeWire Biquad Equalizer Verification Report

**Phase Goal:** Users can shape Deckify's audio output in real time using preset or custom 5-band/10-band PipeWire biquad EQ without disrupting game or Steam UI audio.
**Verified:** 2026-11-16T16:43:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

> **Note on Scope Evolution (D-01 / D-03):** `ROADMAP.md` and `REQUIREMENTS.md` (`EQ-01`, `EQ-02`) originally referenced 3 sound presets and 5 custom bands; `15-CONTEXT.md` decisions `D-01` and `D-03` explicitly expanded the implementation to a **10-band ISO graphic EQ** (`31Hz..16kHz`) and **5 sound presets** (`bass`, `vocal`, `gaming`, `deck_speakers`, `late_night` + `flat` bypass + `custom` = 7 pills).

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Non-flat EQ preset launches isolated `pipewire -c` filter-chain child process as UID 1000 via `_build_deck_command()` with `priority.session=0` and `priority.driver=0`, never restarting system `pipewire` (`D-03`, `D-04`, `D-05`). | ✓ VERIFIED | `py_modules/equalizer.py` (`generate_filter_chain_conf`, `_deck_cmd`, `_start_process`) verified; `test_apply_preset_spawns_pipewire_and_flat_tears_down` passes. |
| 2 | Selecting `flat` performs true bypass by terminating `pipewire -c` and routing `librespot` directly to hardware sink (`D-04`). | ✓ VERIFIED | `EqualizerManager.apply_preset("flat")` calls `stop()` + `_fallback_to_hardware_sink()`; tested in `test_apply_preset_spawns_pipewire_and_flat_tears_down`. |
| 3 | All 10 ISO biquad bands (`31Hz..16kHz`) support `-12.0` to `+12.0` dB in `0.5` dB steps with automatic negative preamp headroom (`-max(0, max_band_gain)`) on `eq_preamp:Mult` (`D-01`, `D-06`). | ✓ VERIFIED | `EQ_BAND_FREQS`, `clamp_eq_bands`, `compute_preamp_db`, `generate_filter_chain_conf`, `build_pw_cli_params` verified in `py_modules/equalizer.py` and `test_equalizer.py`. |
| 4 | Continuous `set_eq_bands` updates coalesce `pw-cli set-param` to `~75ms` and debounce `settings.json` persistence by `500ms` (`D-07`). | ✓ VERIFIED | `_PW_CLI_THROTTLE_S = 0.075`, `_SAVE_DEBOUNCE_S = 0.5`, `EqualizerManager.set_bands` verified; `test_set_bands_coalesces_pw_cli_and_debounces_save` passes. |
| 5 | Switching output sink via `set_audio_sink` while EQ is active keeps `librespot` on `deckify_eq_sink` and moves only `effect_output.deckify_eq` (`deckify_eq_out`), never touching `steamwebhelper`, `Chromium`, or game audio (`D-05`). | ✓ VERIFIED | `py_modules/engine.py` (`include_eq_output`, `eq_output_only`), `py_modules/volume.py` (`set_audio_sink`), `EqualizerManager.on_sink_changed` verified; `test_resolve_spotify_sink_input_ids_isolation_modes` & `test_volume_set_audio_sink_eq_active_vs_flat` pass. |
| 6 | If `pipewire -c` fails to start or exits unexpectedly, `EqualizerManager` falls back to hardware sink and returns structured error without crashing `main.py`. | ✓ VERIFIED | `_start_process` & `_fallback_to_hardware_sink` in `py_modules/equalizer.py`; `test_crash_fallback_routes_librespot_to_hardware_sink` passes. |
| 7 | Spatial D-pad navigation: 7 EQ preset pills split into two `<Focusable flow-children="horizontal">` rows (4 in Row 1, 3 in Row 2), never `flow-children="row"` (`D-03`). | ✓ VERIFIED | `src/components/tabs/SettingsTab.tsx` lines 405–436 verified; `SettingsTab.test.tsx` asserts 2 horizontal rows (4 + 3) and zero `flow-children="row"`. |
| 8 | 10-band ISO layout & live drag: All 10 `SliderField` bands (`31 Hz`–`16 kHz`, `min={-12}`, `max={12}`, `step={0.5}`, `showValue`) always visible in `<Focusable flow-children="column">` stack (`D-01`, `D-02`, `D-07`). | ✓ VERIFIED | `src/components/tabs/SettingsTab.tsx` lines 437–460 verified; `SettingsTab.test.tsx` asserts all 10 labels and slider props. |
| 9 | Preset-to-custom auto-fork: Clicking a preset snaps all 10 sliders; moving any slider immediately forks `eq_preset` to `"custom"` and calls `set_eq_bands`, while clicking `Custom` restores `eq_custom_bands` (`D-02`). | ✓ VERIFIED | `SettingsTab.tsx` lines 414–457 verified; `SettingsTab.test.tsx` verifies preset click (`deck_speakers`) and slider `onChange` calling `set_eq_bands`. |
| 10 | Compact QAM constraint (`D-08`): `src/index.tsx` remains untouched with zero EQ controls, preset pills, or EQ badges. | ✓ VERIFIED | `git diff` and `Select-String` confirm zero EQ controls in `src/index.tsx`. |
| 11 | Empty / bypass state: Selecting `Flat` snaps sliders to `0.0 dB`, displays `Bypass (0.0 dB)` in card header, and tears down `pipewire -c` (`D-04`). | ✓ VERIFIED | `SettingsTab.tsx` lines 397–399 verified; `SettingsTab.test.tsx` asserts `Bypass (0.0 dB)` on `"flat"`. |
| 12 | Error fallback & Preamp header: Header displays `Preamp: -X.X dB` when non-flat bands are boosted (`D-06`), and surfaces error toast if backend returns `{ ok: false }`. | ✓ VERIFIED | `SettingsTab.tsx` lines 400–402, 422–423, 454–455 verified; `SettingsTab.test.tsx` asserts `Preamp: -6.0 dB` for `"bass"`. |

**Score:** 12/12 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `py_modules/equalizer.py` | `EqualizerManager`, 7 presets, conf generator, `pw-dump`/`pw-cli` | ✓ VERIFIED | 480 lines, substantive, imported and wired in `main.py` & `py_modules/__init__.py` |
| `py_modules/common.py` | `eq_custom_bands` default & 7-preset/10-band clamping | ✓ VERIFIED | Lines 109–110, 243–261 verified |
| `py_modules/engine.py` | Stream-isolated sink-input resolution | ✓ VERIFIED | `effect_output.deckify_eq` in allowlist; `include_eq_output` & `eq_output_only` flags |
| `py_modules/volume.py` | EQ-aware `apply_equalizer_preset` & `set_audio_sink` | ✓ VERIFIED | Lines 97–160 delegate to `plugin._equalizer_manager` |
| `py_modules/__init__.py` | Exports `equalizer` | ✓ VERIFIED | Line 77 imports `equalizer` |
| `main.py` | Lifecycle, 7-preset validation, `set_eq_bands` RPC | ✓ VERIFIED | Lines 152–167, 485–486, 651–657, 884–900, 920–921 |
| `tests/test_equalizer.py` | Unit tests for backend EQ | ✓ VERIFIED | 19/19 tests pass |
| `src/types.ts` | 7-value `EqualizerPreset` & `eq_custom_bands` | ✓ VERIFIED | Lines 38–45, 188–189 |
| `src/components/tabs/SettingsTab.tsx` | 7 preset pills (2 horizontal rows) & 10 ISO `SliderField`s | ✓ VERIFIED | Lines 8–54, 76–132, 391–461 |
| `src/components/tabs/SettingsTab.test.tsx` | Vitest assertions for EQ UI | ✓ VERIFIED | 19/19 tests pass |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `main.py` | `py_modules/equalizer.py` | `self._equalizer_manager = equalizer.EqualizerManager(self)` | ✓ WIRED | Instantiated in `_main()`, torn down in `_unload()`, invoked in `start_librespot()` & `set_eq_bands()` |
| `py_modules/volume.py` | `py_modules/equalizer.py` | `apply_equalizer_preset` & `set_audio_sink` | ✓ WIRED | Delegates to `plugin._equalizer_manager` |
| `py_modules/equalizer.py` | `py_modules/engine.py` | `_set_pactl_sink_input` | ✓ WIRED | Isolates `librespot` (`include_eq_output=False`) vs `effect_output.deckify_eq` (`eq_output_only=True`) |
| `src/components/tabs/SettingsTab.tsx` | `main.py` | `callable("set_eq_bands")` & `callable("set_setting")` | ✓ WIRED | Both RPCs called on slider/pill interaction |
| `src/components/tabs/SettingsTab.tsx` | `src/types.ts` | `EqualizerPreset`, `DeckifySettings.eq_custom_bands` | ✓ WIRED | Imported and typed in `SettingsTab.tsx` |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Backend full test suite | `py -3 -m unittest discover -s tests -p "test_*.py"` | Ran 500 tests in 31.080s — OK | ✓ PASS |
| Backend EQ unit tests | `py -3 -m unittest discover -s tests -p "test_equalizer.py" -v` | Ran 19 tests in 1.114s — OK | ✓ PASS |
| Frontend full test suite | `pnpm test -- --run` | 16 files, 159 tests passed | ✓ PASS |
| Frontend SettingsTab tests | `pnpm test -- --run src/components/tabs/SettingsTab.test.tsx` | 19 tests passed | ✓ PASS |
| TypeScript typecheck | `pnpm typecheck` | `tsc --noEmit` exited 0 | ✓ PASS |
| ESLint | `pnpm lint` | 0 errors (569 pre-existing warnings) | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `EQ-01` | 15-01, 15-02 | Real-time PipeWire `filter-chain` biquad DSP equalization (`flat` bypass + sound presets) isolated to Deckify stream | ✓ SATISFIED (automated) / ? NEEDS HUMAN (on-device audio) | `EqualizerManager`, `SettingsTab.tsx`, 19 backend + 4 frontend EQ tests |
| `EQ-02` | 15-01, 15-02 | Custom EQ curve via `SliderField` controls in `SettingsTab` with live `pw-cli` updates and persistence | ✓ SATISFIED (automated) / ? NEEDS HUMAN (reboot persistence) | `set_eq_bands` (`~75ms` `pw-cli` coalescing, `500ms` save debounce), 10-band `SliderField`s |

### Anti-Patterns Found

None in Phase 15 modified files (`TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` scan returned 0 matches in `py_modules/equalizer.py` and `src/components/tabs/SettingsTab.tsx`).

### Human Verification Required

1. **On-Device PipeWire Audio Listening & Stream Isolation**
   - **Test:** Play a track in Spotify on Steam Deck, switch through `Flat`, `Bass Boost`, `Vocal Clarity`, `Gaming Balance`, `Deck Speakers`, and `Late Night` in `SettingsTab`, then drag 10-band ISO sliders while a game or Steam UI audio is active.
   - **Expected:** Real-time biquad filtering is audible on Deckify's stream without crackle, popping, or interruption to game audio or Steam UI navigation sounds.
   - **Why human:** Unit tests mock PipeWire/PulseAudio subprocesses (`pipewire -c`, `pw-dump`, `pw-cli`, `pactl`); live SteamOS PipeWire `filter-chain` DSP audio quality and stream isolation require on-device listening.
2. **Persistence Across SteamOS Reboot**
   - **Test:** Set a preset or `Custom` 10-band curve, reboot the Steam Deck, and reopen `SettingsTab`.
   - **Expected:** Selected `eq_preset` and `eq_custom_bands` restore from `settings.json` and re-apply to `EqualizerManager` on startup.
   - **Why human:** Requires a full SteamOS reboot cycle on hardware.
3. **GamepadUI D-Pad Spatial Navigation**
   - **Test:** Navigate the 7 EQ preset pills and 10 `SliderField` controls using the Steam Deck D-pad in GamepadUI.
   - **Expected:** D-pad Left/Right moves cleanly within Row 1 (4 pills) and Row 2 (3 pills), Up/Down steps cleanly between rows and the 10 frequency bands, and Left/Right adjusts gain in `0.5 dB` steps without focus traps.
   - **Why human:** GamepadUI spatial navigation feel and visual layout require on-device controller verification.

---

_Verified: 2026-11-16T16:43:00Z_
_Verifier: the agent (gsd-verifier)_
