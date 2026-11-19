---
phase: 19-per-game-eq-volume-profiles
plan: 01
subsystem: audio
tags: [pipewire, equalizer, volume-fader, soundtrack, typescript, game-profiles]

requires:
  - phase: 18.1
    provides: EqualizerManager PipeWire biquad filter-chain, VolumeFader cosine easing with _sleep_locked, SoundtrackManager lifecycle & SoundtracksTab
provides:
  - 3-layer EqualizerManager (global baseline, _ephemeral_preset/_ephemeral_bands game override, _preview_active modal preview) and eq.pid lifecycle
  - Unified local PipeWire VolumeFader game ceiling + ducking attenuation + voice VAD scaling, has_game_override emission, and global apply_equalizer_preset isolation
  - Sequenced SoundtrackManager launch/exit audio lifecycle, A->B _pre_game_snapshot preservation, _sleep_locked protection, active_game_override_snapshot persistence, and zero cloud set_volume calls
  - End-to-end EQ Preset Override dropdown and D-11 subtitle summary in SoundtracksTab with updated TypeScript and soundtrackUtils contracts
affects: [19-02, 19-03, 19-04, main.py, SettingsTab, GameEqModal, SoundtracksTab, QuickAccessMenu]

actuals:
  tokens: 59676
  tasks: 3
  commits: 3
  plan_head_before: 64c7f2c374cc8098d407f76bec935bb4ab3c63a5
  plan_head_after: e2bf074c3cc7b98dad60068060d4e810cf704608

tech-stack:
  added: []
  patterns:
    - "3-layer EQ state machine isolating persistent global settings, ephemeral per-game overrides, and transient modal previews"
    - "100% local PipeWire VolumeFader ceiling * attenuation scaling with voice VAD minimum precedence and _sleep_locked exit protection"
    - "Strict isinstance/is-True type guards and _maybe_await(inspect.isawaitable) wrappers to avoid MagicMock truthiness hazards"

key-files:
  created: []
  modified:
    - py_modules/common.py
    - py_modules/equalizer.py
    - py_modules/volume.py
    - py_modules/soundtrack.py
    - src/types.ts
    - src/components/tabs/soundtrackUtils.ts
    - src/components/tabs/SoundtracksTab.tsx
    - src/components/tabs/SoundtracksTab.test.tsx
    - tests/test_equalizer.py
    - tests/test_volume.py
    - tests/test_soundtrack.py

key-decisions:
  - "Isolated EqualizerManager ephemeral overrides (_ephemeral_preset, _ephemeral_bands) and modal previews (_preview_active) from persistent global settings[eq_preset] and settings[eq_custom_bands]"
  - "Unified all per-game volume_override (0..100%) and ducking_level_override (0..95%, factor >= 0.05) scaling inside local PipeWire VolumeFader and removed Spotify Web API set_volume calls from SoundtrackManager"
  - "Sequenced SoundtrackManager _run_launch (EQ -> snapshot -> sink-input invalidation -> VolumeFader) and _run_exit (global EQ -> clear snapshot -> _sleep_locked check -> VolumeFader/exit policy) with 0-playlist audio-only support"

patterns-established:
  - "Use isinstance(self._ephemeral_preset, str) and getattr(..., False) is True for manager override/lock checks so MagicMock test doubles do not falsely evaluate truthy"
  - "Use _maybe_await(inspect.isawaitable) when SoundtrackManager delegates to optional EqualizerManager or VolumeFader hooks"
  - "Use formatGameProfileSubtitle for deterministic D-11 subtitle summaries across linked soundtracks and audio-only profiles"

requirements-completed: [GAME-01]

coverage:
  - id: D1
    description: "End-to-end per-game EQ Preset Override tracer slice across EqualizerManager, SoundtrackManager, TypeScript contracts, soundtrackUtils, and SoundtracksTab"
    requirement: "GAME-01"
    verification:
      - kind: unit
        ref: "py -3 -m unittest discover -s tests -p \"test_equalizer.py\" && pnpm test -- --run src/components/tabs/SoundtracksTab.test.tsx && pnpm typecheck"
        status: pass
    human_judgment: false
  - id: D2
    description: "Unified local PipeWire VolumeFader game ceiling + ducking + voice VAD formula, SettingsTab global EQ isolation, eq.pid cleanup, and active_game_override_snapshot validation"
    requirement: "GAME-01"
    verification:
      - kind: unit
        ref: "py -3 -m unittest discover -s tests -p \"test_volume.py\" && py -3 -m unittest discover -s tests -p \"test_equalizer.py\""
        status: pass
    human_judgment: false
  - id: D3
    description: "Sequenced SoundtrackManager launch/exit audio lifecycle, zero cloud set_volume calls, audio-only profile activation, A->B snapshot preservation, and _sleep_locked protection"
    requirement: "GAME-01"
    verification:
      - kind: unit
        ref: "py -3 -m unittest discover -s tests -p \"test_soundtrack.py\" && py -3 -m unittest discover -s tests -p \"test_e2e_requirements.py\""
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-11-19
status: complete
---

# Phase 19 Plan 01: Per-Game EQ Preset Tracer & Backend Audio Engine Summary

**3-layer ephemeral PipeWire EQ manager, 100% local VolumeFader ceiling/ducking engine, sequenced SoundtrackManager lifecycle without cloud volume calls, and SoundtracksTab EQ preset selector**

## Performance
- **Duration:** 12min
- **Started:** 2026-11-19T07:17:07Z
- **Completed:** 2026-11-19T07:29:32Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments
- Implemented a 3-layer EQ state machine in `EqualizerManager` (`global settings` baseline, `_ephemeral_preset`/`_ephemeral_bands` game override, and `_preview_active` live preview) with `eq.pid` stale-process cleanup, `route_librespot_to_eq` mid-game restart preservation, and global `set_bands` / `apply_equalizer_preset` isolation.
- Replaced legacy Spotify Web API `set_volume` calls in `SoundtrackManager` with unified local PipeWire `VolumeFader` scaling (`ceiling_factor * game_duck_factor`, `min` with `voice_factor`), retaining float precision until final sink application and emitting `has_game_override` in `ducking_state_changed`.
- Sequenced `SoundtrackManager._run_launch` and `_run_exit` with atomic ordering, `active_game_override_snapshot` validation/persistence, 0-playlist audio-only support without spurious `soundtrack_prompt_switch` emissions, A->B `_pre_game_snapshot` preservation, and Sleep Timer `_sleep_locked` protection.
- Extended `src/types.ts`, `soundtrackUtils.ts`, and `SoundtracksTab.tsx` with the `EQ Preset Override` `DropdownItem`, `formatGameProfileSubtitle` D-11 summaries, and `normalizeProfiles` backfilling.

## Task Commits
1. **Task 1: End-to-end Per-Game EQ Preset Override tracer slice (EqualizerManager -> SoundtrackManager -> SoundtracksTab)** - `004922e` (feat)
2. **Task 2: Unify local PipeWire VolumeFader game overrides, SettingsTab EQ isolation, and active_game_override_snapshot validation** - `152e0b0` (feat)
3. **Task 3: Sequence SoundtrackManager launch/exit audio lifecycle, remove legacy cloud volume calls, and update soundtrack tests** - `e2bf074` (feat)

## Files Created/Modified
- `py_modules/common.py` - Added `EQ_PID_FILE`, `DEFAULT_SETTINGS["active_game_override_snapshot"]`, and `_load_settings` validation rejecting invalid/bool `app_id` snapshots.
- `py_modules/equalizer.py` - Added 3-layer ephemeral/preview state, `apply_ephemeral_preset`, `clear_ephemeral_override`, `preview_bands`, `clear_preview`, `eq.pid` lifecycle, `cleanup_stale_process`, and `NaN`/`Inf`/`bool` guards in `clamp_eq_bands`.
- `py_modules/volume.py` - Added `VolumeFader._game_override`, `has_game_override`, `apply_game_override`, `clear_game_override`, unified `_compute_target_sink_volume` ceiling/ducking/voice math, idempotent `set_ducking(False, "game")`, `has_game_override` emission, and global isolation in `apply_equalizer_preset`.
- `py_modules/soundtrack.py` - Extended `_PROFILE_DEFAULTS` and `_sanitize_profile` for `eq_preset`, `eq_custom_bands`, `ducking_level_override`, and bool rejection; added `apply_active_audio_profile`, `refresh_active_overrides`, sequenced `_run_launch`/`_run_exit`, and removed `set_volume` calls.
- `src/types.ts` - Added `ActiveGameOverrideInfo` and extended `DuckingState`, `StatusResponse`, and `SoundtrackProfile`.
- `src/components/tabs/soundtrackUtils.ts` - Added `EQ_PRESET_LABELS`, `EQ_OVERRIDE_OPTIONS`, `setEqPreset`, `setEqCustomBands`, `setDuckingLevelOverride`, `formatGameProfileSubtitle`, and Phase 19 field backfilling in `normalizeProfiles`.
- `src/components/tabs/SoundtracksTab.tsx` - Replaced subtitle with `formatGameProfileSubtitle(profile)` and added `EQ Preset Override` `DropdownItem` row.
- `src/components/tabs/SoundtracksTab.test.tsx` - Added Wave 1 unit tests for profile normalization, D-11 subtitles, EQ/ducking setters, and `EQ Preset Override` dropdown persistence.
- `tests/test_equalizer.py` - Added unit tests for `clamp_eq_bands` boundaries, `active_game_override_snapshot` validation, ephemeral isolation, `SettingsTab` global isolation, `preview_bands`/`clear_preview`, `route_librespot_to_eq`, `eq.pid` cleanup, and `flat` teardown sink migration.
- `tests/test_volume.py` - Updated `test_emit_state` and added unit tests for ceiling + custom attenuation, clamping/bool rejection, float precision, voice VAD precedence, idempotency, and `_sleep_locked` protection.
- `tests/test_soundtrack.py` - Updated `make_plugin()` and `test_volume_override_applied_and_reverted` for local `VolumeFader`, and added unit tests for `_sanitize_profile`, audio-only and prompt-switch profiles, launch/exit order, A->B switch baseline preservation, `_sleep_locked` exit, and `refresh_active_overrides`.

## Decisions Made
- Used strict `isinstance(..., str)` and `... is True` checks across `EqualizerManager`, `VolumeFader`, and `SoundtrackManager` alongside `_maybe_await(inspect.isawaitable(...))` so existing `MagicMock` test doubles never evaluate truthy or raise `TypeError` on `await`.
- Treated `soundtrack_unbound_policy == "pause"` as applying only when no persisted profile exists (`not persisted`), so explicitly configured 0-playlist audio-only profiles keep music playing while activating EQ and volume overrides without emitting `soundtrack_prompt_switch`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Plan `19-01` backend and tracer slice are complete and verified across all 571 Python tests, 13 `SoundtracksTab.test.tsx` tests, full Vitest suite, `tsc --noEmit`, and ESLint.
- Ready for Plan `19-02` (`main.py` controller wiring, boot crash recovery, preview RPCs, and status exposure) and Wave 3 UI plans (`19-03`, `19-04`).
- Live PipeWire `filter-chain` and `pactl set-sink-input-volume` transition listening on Steam Deck hardware remains covered by the Phase 19 UAT backstop once all 4 plans land.

## Self-Check: PASSED
- Verified all 11 modified files exist on disk and match commit history `64c7f2c..e2bf074`.
- Verified commits `004922e`, `152e0b0`, and `e2bf074` are ancestors of `HEAD` (`commits: 3`).
- Verified `test_soundtrack.py` (41 tests), `test_equalizer.py` (27 tests), `test_volume.py` (68 tests), `test_e2e_requirements.py` (152 tests), full Python suite (571 tests), `SoundtracksTab.test.tsx` (13 tests), and `pnpm typecheck` all passed.
