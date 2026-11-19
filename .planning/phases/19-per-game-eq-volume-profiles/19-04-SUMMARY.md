---
phase: 19-per-game-eq-volume-profiles
plan: 04
subsystem: ui
tags: [react, soundtracks-tab, game-eq-modal, qam, volume-fader, typescript]

requires:
  - phase: 19-01
    provides: Ephemeral EqualizerManager overrides, VolumeFader game ceiling/ducking scaling, SoundtrackProfile Phase 19 fields, and formatGameProfileSubtitle
  - phase: 19-02
    provides: Main controller live refresh hooks, preview_eq_bands/clear_eq_preview RPCs, active_game_app_id status exposure, and has_game_override ducking emission
  - phase: 19-03
    provides: GameEqModal 10-band custom game EQ editor and shared EqBandFaders curves/normalization
provides:
  - Complete SoundtracksTab per-game EQ modal launcher (Edit Game EQ), dual Volume Override & Ducking Attenuation Override sliders, Clear/Use Global buttons, two-step Delete Game Profile confirmation, and immediate running-game hot-apply
  - DeckifyExpandedModal prop wiring passing runningAppId, globalEqPreset, globalEqCustomBands, globalDuckingPct, showToast, and onPickerOpenChange to SoundtracksTab
  - QuickAccessMenu hasGameOverride subscription and live effective_volume SliderField with GAME VOL / DUCKED badge precedence
affects: [SoundtracksTab, DeckifyExpandedModal, QuickAccessMenu, Phase 19 Verification]

actuals:
  tokens: 50017
  tasks: 2
  commits: 2
  plan_head_before: 4a3defe9478178536d8fa398597f392ee90d18b8
  plan_head_after: 6531eb961bbac5b9eb3962e3d55f434f6a79adf5

tech-stack:
  added: []
  patterns:
    - "Modular SoundtracksTab helper render functions and extracted save/modal hooks keeping all functions within ESLint complexity <= 15 and <= 80 lines"
    - "Immediate backendSaveProfile flush on running-game EQ/volume/ducking edits and GameEqModal save, bypassing the 500ms idle debounce"
    - "Two-step inline destructive confirmation (Delete Game Profile -> Keep Profile / Confirm Delete) preserving profile state on RPC failure"

key-files:
  created: []
  modified:
    - src/components/tabs/SoundtracksTab.tsx
    - src/components/tabs/SoundtracksTab.test.tsx
    - src/components/DeckifyExpandedModal.tsx
    - src/index.tsx
    - src/index.test.tsx

key-decisions:
  - "Preserved SoundtracksTab top-level useState slot order (slots 0..4 before confirmDeleteAppId at slot 5) and extracted useProfileSaveActions / useGameModalActions / render helpers so ESLint passes with zero errors and zero warnings on SoundtracksTab.tsx"
  - "Used != null checks for volume_override and ducking_level_override and backed unset Ducking Attenuation Override value with globalDuckingPct so legacy/partial profiles never render undefined% labels"
  - "Gated profile deletion state removal on backendDeleteProfile resolution so failed storage deletes preserve existing profile inputs and toast the documented storage error"

patterns-established:
  - "Avoid JSX Fragment shorthand (<>...</>) inside components tested with shallow jsx-runtime mocks that omit Fragment"
  - "Subscribe QAM Volume SliderField to (isDucked || hasGameOverride) && effectiveVolume != null with DUCKED taking pill precedence over GAME VOL"

requirements-completed: [GAME-01]

coverage:
  - id: D1
    description: "SoundtracksTab Edit Game EQ modal launcher, dual Volume/Ducking sliders, immediate running-game hot-apply, two-step Delete Game Profile confirmation, and empty/loading/error/truncation UI states"
    requirement: "GAME-01"
    verification:
      - kind: unit
        ref: "pnpm test -- --run src/components/tabs/SoundtracksTab.test.tsx && pnpm typecheck && pnpm exec eslint src/components/tabs/SoundtracksTab.tsx"
        status: pass
    human_judgment: false
  - id: D2
    description: "DeckifyExpandedModal runningAppId/global EQ/ducking prop wiring with modal trigger suppression and QuickAccessMenu GAME VOL / DUCKED effective_volume display"
    requirement: "GAME-01"
    verification:
      - kind: unit
        ref: "pnpm test -- --run src/index.test.tsx src/components/DeckifyExpandedModal.test.tsx && pnpm typecheck"
        status: pass
    human_judgment: false
  - id: D3
    description: "Full Phase 19 Python and frontend test, typecheck, ESLint, and production Rollup bundle verification"
    requirement: "GAME-01"
    verification:
      - kind: integration
        ref: "py -3 -m unittest discover -s tests -p \"test_*.py\" && pnpm test -- --run && pnpm typecheck && pnpm lint && pnpm run build"
        status: pass
    human_judgment: false

duration: 11min
completed: 2026-11-19
status: complete
---

# Phase 19 Plan 04: SoundtracksTab Audio Controls, Modal Wiring & QAM Sync Summary

**Integrated `Edit Game EQ` -> `GameEqModal`, dual Volume/Ducking sliders with live running-game flush, two-step profile deletion, `DeckifyExpandedModal` baseline prop wiring, and QAM `GAME VOL` / `effective_volume` display across Phase 19**

## Performance
- **Duration:** 11min
- **Started:** 2026-11-19T07:56:01Z
- **Completed:** 2026-11-19T08:07:27Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Upgraded `src/components/tabs/SoundtracksTab.tsx` with the conditional `"Edit Game EQ"` button launching `GameEqModal` (seeded from `globalEqPreset`/`globalEqCustomBands`, suppressing triggers via `onPickerOpenChange`, and immediately calling `saveImmediate` on save), `Ducking Attenuation Override` (`0..95`, step `5`, disabled when `ducking_override === false`), `"Clear Volume Override"` / `"Use Global Ducking"` reset buttons, immediate flush on running-game edits, two-step `"Delete Game Profile"` -> `"Keep Profile"` / `"Confirm Delete"` confirmation, and full `19-UI-SPEC.md` empty/loading/error/truncation states.
- Refactored `SoundtracksTab.tsx` into modular helper renderers and custom action hooks (`useProfileSaveActions`, `useGameModalActions`, `useInitialSoundtrackLoad`) passing `tsc --noEmit` and ESLint with zero errors and zero warnings while preserving `useState` slots 0..4 for hook-order tests.
- Wired `runningAppId={status?.active_game_app_id ?? null}`, `globalEqPreset`, `globalEqCustomBands`, `globalDuckingPct`, `showToast`, and `onPickerOpenChange={setPlaylistPickerOpen}` in `src/components/DeckifyExpandedModal.tsx`, keeping `useTriggerNavigation` suppressed behind both `PlaylistPickerModal` and `GameEqModal`.
- Extended `src/index.tsx` `QuickAccessMenu` (`Content`) to track `has_game_override` from `get_ducking_state` and `ducking_state_changed`, rendering `(isDucked || hasGameOverride) && effectiveVolume != null ? effectiveVolume : volume` on the Volume `SliderField` and `"DUCKED"` / `"GAME VOL"` pill badges while keeping the `3000ms` exit debounce intact.
- Expanded `src/components/tabs/SoundtracksTab.test.tsx` (19 tests) and `src/index.test.tsx` (16 tests) covering all Phase 19 UI interactions, error states, and QAM transitions.

## Task Commits
1. **Task 1: Complete SoundtracksTab EQ modal button, dual sliders, immediate running-game hot-apply, and two-step delete UX** - `5806d15` (feat)
2. **Task 2: Wire SoundtracksTab props in DeckifyExpandedModal, QAM GAME VOL display in src/index.tsx, and full Phase 19 verification** - `6531eb9` (feat)

## Files Created/Modified
- `src/components/tabs/SoundtracksTab.tsx` - Added `Edit Game EQ` modal launcher, `Ducking Attenuation Override` slider, Clear/Use Global buttons, immediate running-game flush, two-step profile deletion, modular ESLint-clean helpers, and UI state polish.
- `src/components/tabs/SoundtracksTab.test.tsx` - Updated dual-slider assertions and added 6 Phase 19 unit tests covering modal seeding/saving, dual sliders, hot-apply, two-step delete, empty/loading/truncation, and error preservation.
- `src/components/DeckifyExpandedModal.tsx` - Passed `runningAppId`, `globalEqPreset`, `globalEqCustomBands`, `globalDuckingPct`, `showToast`, and `onPickerOpenChange` to `SoundtracksTab`.
- `src/index.tsx` - Imported `DuckingState`, subscribed QAM to `has_game_override`, displayed `effectiveVolume` during ducking or game override, and rendered `"DUCKED"` / `"GAME VOL"` header pills.
- `src/index.test.tsx` - Added QAM unit tests verifying `"GAME VOL"`, `"DUCKED"`, badge clearing, and live `effective_volume` across `get_ducking_state` and `ducking_state_changed`.

## Decisions Made
- Preserved `SoundtracksTab` top-level `useState` hook slot order (`games`, `profiles`, `searchQuery`, `expandedAppId`, `loading`) before `confirmDeleteAppId` and decomposed card sections and save/modal callbacks so ESLint reports zero errors and zero warnings on `SoundtracksTab.tsx`.
- Used `!= null` guards on `volume_override` and `ducking_level_override` and seeded unset `Ducking Attenuation Override` slider value from `globalDuckingPct` (`50` default) so partial/legacy profiles never display `undefined%`.
- Deferred removing `profiles[key]` in `handleDeleteProfile` until `backendDeleteProfile(appId)` succeeds so failed disk deletes preserve profile state and display the storage error toast.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 19 Plan `19-04` (and all 4 plans in Phase 19) are complete and verified across `test_soundtrack.py` (46 tests OK), `test_equalizer.py` (31 tests OK), `test_volume.py` (68 tests OK), `test_e2e_requirements.py` (152 tests OK), full Python suite (580 tests OK), Vitest (17 files, 198 tests passed), `tsc --noEmit` (0 errors), ESLint (0 errors), and `rollup -c` production build.
- Live SteamOS PipeWire hardware audio verification (`pipewire -c`, `pw-cli set-param`, `pactl set-sink-input-volume` transitions on Steam Deck) remains covered by Phase 19 UAT / `19-VALIDATION.md` Manual-Only Verifications.
- Ready for Phase 19 verification (`GAME-01`) and Phase 20 planning/execution.

## Self-Check: PASSED
- Verified all 5 modified files (`src/components/tabs/SoundtracksTab.tsx`, `src/components/tabs/SoundtracksTab.test.tsx`, `src/components/DeckifyExpandedModal.tsx`, `src/index.tsx`, `src/index.test.tsx`) exist on disk and match commit history `4a3defe..6531eb9`.
- Verified commits `5806d15` and `6531eb9` are ancestors of `HEAD` (`commits: 2`, `plan_head_before: 4a3defe9478178536d8fa398597f392ee90d18b8`, `plan_head_after: 6531eb961bbac5b9eb3962e3d55f434f6a79adf5`).
- Verified `test_soundtrack.py` (46 tests), `test_equalizer.py` (31 tests), `test_volume.py` (68 tests), `test_e2e_requirements.py` (152 tests), full Python suite (580 tests), Vitest (198 tests across 17 files), `pnpm typecheck`, `pnpm lint`, and `pnpm run build` all passed cleanly.
