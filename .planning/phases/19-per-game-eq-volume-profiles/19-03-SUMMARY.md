---
phase: 19-per-game-eq-volume-profiles
plan: 03
subsystem: ui
tags: [react, equalizer, game-eq-modal, settings-tab, pipewire, typescript]

requires:
  - phase: 19-01
    provides: EqualizerManager 3-layer ephemeral/preview model, ActiveGameOverrideInfo, and EQ_PRESET_LABELS in soundtrackUtils
  - phase: 19-02
    provides: preview_eq_bands and clear_eq_preview RPCs, game_audio_override_changed events, and StatusResponse.active_game_override
provides:
  - Reusable 10-band vertical ISO fader renderer in src/components/common/EqBandFaders.tsx (renderEqBandFaders, EqBandFaders, EQ_BAND_LABELS, EQ_SHORT_LABELS, EQ_PRESET_CURVES, normalizeEqBands)
  - Controller-navigable GameEqModal in src/components/tabs/GameEqModal.tsx with global/profile seeding, Copy from Preset pills, Reset to Flat, and live preview_eq_bands / clear_eq_preview lifecycle
  - Wave 0 unit test suite src/components/tabs/GameEqModal.test.tsx (9 tests)
  - SettingsTab Equalizer card integration with renderEqBandFaders, Active Game EQ Override pill badge with ellipsis truncation, global baseline caption, and game_audio_override_changed subscription
affects: [19-04, SoundtracksTab, DeckifyExpandedModal]

actuals:
  tokens: 36669
  tasks: 3
  commits: 3
  plan_head_before: 35c726e7796383058bc57179a5797eb713a3b53b
  plan_head_after: def41750a36da775595cf8cf77b553e9d3430758

tech-stack:
  added: []
  patterns:
    - "Plain-function JSX rendering (renderEqBandFaders) sharing 10-band ISO vertical fader markup across SettingsTab and GameEqModal without breaking shallow JSX role='slider' assertions"
    - "Hook-extracted useGameEqState controller isolating preview RPC error handling and distinguishing running-game vs non-running-game clear_eq_preview lifecycle"

key-files:
  created:
    - src/components/common/EqBandFaders.tsx
    - src/components/tabs/GameEqModal.tsx
    - src/components/tabs/GameEqModal.test.tsx
  modified:
    - src/components/tabs/SettingsTab.tsx
    - src/components/tabs/SettingsTab.test.tsx

key-decisions:
  - "Exposed renderEqBandFaders as a direct function alongside EqBandFaders FC so shallow JSX tree traversals in SettingsTab.test.tsx continue locating all 10 role='slider' elements"
  - "Extracted sendPreviewRequest and useGameEqState in GameEqModal.tsx so every function remains below ESLint's 80-line max-lines-per-function and 15 complexity thresholds with zero warnings"
  - "Gated clear_eq_preview on Discard/Cancel/unmount and non-running Save while skipping clear_eq_preview only when Boolean(isRunningGame) && savedRef.current is true so running-game saves promote cleanly without PipeWire gaps"

patterns-established:
  - "Use direct renderEqBandFaders({ bands, onBandChange }) calls inside Focusable-driven EQ surfaces with flow-children='horizontal'"
  - "Track savedRef, clearedRef, and isRunningRef in modal preview controllers to prevent duplicate clear_eq_preview calls or leaked preview state on unmount"

requirements-completed: [GAME-01]

coverage:
  - id: D1
    description: "Reusable 10-band vertical ISO fader strip extracted into src/components/common/EqBandFaders.tsx under ESLint limits"
    requirement: "GAME-01"
    verification:
      - kind: unit
        ref: "pnpm typecheck && pnpm exec eslint src/components/common/EqBandFaders.tsx && pnpm test -- --run src/components/tabs/SettingsTab.test.tsx"
        status: pass
    human_judgment: false
  - id: D2
    description: "Dedicated GameEqModal with profile/global seeding, Copy from Preset pills, Reset to Flat, neutral/error UI states, live preview_eq_bands, and isRunningGame clear_eq_preview semantics + Wave 0 tests"
    requirement: "GAME-01"
    verification:
      - kind: unit
        ref: "pnpm test -- --run src/components/tabs/GameEqModal.test.tsx && pnpm typecheck && pnpm exec eslint src/components/tabs/GameEqModal.tsx"
        status: pass
    human_judgment: false
  - id: D3
    description: "SettingsTab renderEqBandFaders integration, Active Game EQ Override badge with ellipsis truncation, global isolation caption, and game_audio_override_changed subscription"
    requirement: "GAME-01"
    verification:
      - kind: unit
        ref: "pnpm test -- --run src/components/tabs/SettingsTab.test.tsx src/components/tabs/GameEqModal.test.tsx && pnpm typecheck && pnpm lint"
        status: pass
    human_judgment: false

duration: 9min
completed: 2026-11-19
status: complete
---

# Phase 19 Plan 03: Shared 10-Band EQ Faders, GameEqModal & SettingsTab Override Isolation Summary

**Shared 10-band ISO fader renderer (`EqBandFaders.tsx`), controller-navigable `GameEqModal` with live `pw-cli` preview and restore-on-cancel/save lifecycle, Wave 0 Vitest coverage, and `SettingsTab` Active Game EQ Override badge + global isolation**

## Performance
- **Duration:** 9min
- **Started:** 2026-11-19T07:42:28Z
- **Completed:** 2026-11-19T07:51:37Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- Extracted `EQ_BAND_LABELS`, `EQ_SHORT_LABELS`, `EQ_PRESET_CURVES`, `normalizeEqBands`, `renderEqBandFaders`, and `EqBandFaders` into `src/components/common/EqBandFaders.tsx` with clean helper splitting (`handleSliderPointer`, `renderSliderTrack`, `renderSingleEqBand`) passing ESLint with zero errors or warnings.
- Built `src/components/tabs/GameEqModal.tsx` with profile/global curve seeding (`resolveInitialModalBands`), `Copy from Preset` pills (`Global`, `Flat`, `Bass Boost`, `Vocal Clarity`, `Gaming Balance`, `Deck Speakers`, `Late Night`) plus `Reset to Flat`, neutral empty caption (`Flat Curve (0.0 dB)...`), PipeWire preview error recovery, `82vh` overflow-safe container, and `isRunningGame`-aware `clear_eq_preview` handling across Save, Discard, `ModalRoot.onCancel`, and unmount.
- Added Wave 0 unit test suite `src/components/tabs/GameEqModal.test.tsx` (9 tests) covering seeding, clamping, neutral/boosted preamp states, all 10 ISO sliders + pointer drag, preset pills, preview RPC error/rejection resilience, both `isRunningGame` save/discard/unmount branches, and horizontal `flow-children` compliance.
- Refactored `src/components/tabs/SettingsTab.tsx` to invoke `renderEqBandFaders({ bands: localBands, onBandChange: handleBandChange })`, subscribe to `"game_audio_override_changed"`, and display the ellipsis-truncated `"Active Game EQ Override: {app_name} ({presetLabel})"` badge plus global-baseline caption while keeping all edits bound strictly to persistent global settings, verified by 3 new tests in `src/components/tabs/SettingsTab.test.tsx` (35 tests total).

## Task Commits
1. **Task 1: Extract shared 10-band vertical ISO fader renderer into src/components/common/EqBandFaders.tsx** - `e598770` (feat)
2. **Task 2: Create GameEqModal component and Wave 0 test suite GameEqModal.test.tsx** - `25a2d19` (feat)
3. **Task 3: Wire renderEqBandFaders and Active Game EQ Override badge into SettingsTab with global isolation tests** - `def4175` (feat)

## Files Created/Modified
- `src/components/common/EqBandFaders.tsx` - Shared 10-band ISO vertical fader strip, preset curves, frequency labels, and 0.5 dB clamping/normalization helper.
- `src/components/tabs/GameEqModal.tsx` - Dedicated controller-navigable 10-band custom game EQ modal with seeding, preset copy bar, live PipeWire preview, error fallback, and restore/save lifecycle.
- `src/components/tabs/GameEqModal.test.tsx` - Wave 0 unit test suite (9 tests) verifying modal seeding, UI states, live preview, error handling, `isRunningGame` save/discard/unmount rules, and spatial nav attributes.
- `src/components/tabs/SettingsTab.tsx` - Consumes `renderEqBandFaders`, subscribes to `game_audio_override_changed`, and renders the `Active Game EQ Override` pill badge and global-isolation caption.
- `src/components/tabs/SettingsTab.test.tsx` - Added 3 tests verifying override badge visibility/absence, global EQ persistence during active game overrides, ellipsis overflow styles, and event subscription.

## Decisions Made
- Exposed `renderEqBandFaders` as a direct JSX-returning function alongside `EqBandFaders` FC so shallow JSX tree walkers in `SettingsTab.test.tsx` continue finding all 10 `role="slider"` nodes without wrapping elements.
- Extracted `useGameEqState` and `sendPreviewRequest` in `GameEqModal.tsx` to stay strictly under ESLint's 80-line function limit and 15 cyclomatic complexity threshold with zero warnings.
- Held `savedRef`, `clearedRef`, and `isRunningRef` across renders so `clear_eq_preview` always fires on Discard/Cancel/unmount or non-running Save while skipping only when `Boolean(isRunningGame) && savedRef.current` is true.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Plan `19-03` UI building blocks (`EqBandFaders.tsx`, `GameEqModal.tsx`, `GameEqModal.test.tsx`, and `SettingsTab.tsx` isolation UX) are complete and verified across `GameEqModal.test.tsx` (9/9), `SettingsTab.test.tsx` (35/35), full Vitest suite (191/191 across 17 files), `tsc --noEmit` (0 errors), `eslint src/` (0 errors), and `rollup -c` production bundle build.
- Ready for Plan `19-04` (`SoundtracksTab.tsx` `"Edit Game EQ"` button wiring `GameEqModal`, dual Volume/Ducking sliders, two-step `Delete Game Profile`, `DeckifyExpandedModal.tsx` prop wiring, and `src/index.tsx` QAM `"GAME VOL"` display).

## Self-Check: PASSED
- Verified all 5 created/modified files exist on disk (`src/components/common/EqBandFaders.tsx`, `src/components/tabs/GameEqModal.tsx`, `src/components/tabs/GameEqModal.test.tsx`, `src/components/tabs/SettingsTab.tsx`, `src/components/tabs/SettingsTab.test.tsx`).
- Verified commits `e598770`, `25a2d19`, and `def4175` are ancestors of `HEAD` (`commits: 3`, `plan_head_before: 35c726e7796383058bc57179a5797eb713a3b53b`, `plan_head_after: def41750a36da775595cf8cf77b553e9d3430758`).
- Verified `GameEqModal.test.tsx` (9 tests), `SettingsTab.test.tsx` (35 tests), full Vitest suite (191 tests), `pnpm typecheck`, `pnpm lint`, and `pnpm run build` all passed cleanly.
