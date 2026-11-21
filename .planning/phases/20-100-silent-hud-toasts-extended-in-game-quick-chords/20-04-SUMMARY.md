---
phase: 20-100-silent-hud-toasts-extended-in-game-quick-chords
plan: 04
subsystem: ui
tags: [silent-banner, web-audio, notifications, settings, react, python]

# Dependency graph
requires:
  - phase: 20-01
    provides: SilentBanner component, bannerBus, and silent_banner_enabled setting
provides:
  - Independent silent_banner_position corner setting persisted in Python and exposed in SettingsTab
  - Volume-scaled non-Steam Web Audio chime utility (playNotificationChime)
  - SilentBanner + chime routing on track_metadata when toast_sound_enabled is true
affects: [phase-20-verify, settings-ui, overlay-notifications]

# Actuals (#2632)
commits: 2
plan_head_before: ef1b3deb8bbb5669b218c76ff2ea49a40791ed7b
plan_head_after: d04904880c50d3122d68ec7ecde2d4a91ff338e5
actuals:
  tokens: 5500
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Options-object parameter pattern in scheduleChimeNote to satisfy eslint max-params"
    - "SilentBanner precedence: silent_banner_position > toast_position > overlay_position > top-right"

key-files:
  created:
    - src/utils/chime.ts
    - src/utils/chime.test.ts
  modified:
    - py_modules/common.py
    - main.py
    - src/types.ts
    - src/components/tabs/SettingsTab.tsx
    - src/components/tabs/SettingsTab.test.tsx
    - tests/test_chord_settings.py
    - src/index.tsx
    - src/index.test.tsx

key-decisions:
  - "Gated Steam native toaster.toast fallback strictly on silent_banner_enabled === false so enabling toast_sound_enabled keeps SilentBanner active with a subtle Web Audio chime"
  - "Exposed Notification / Banner Corner 4-button selector unconditionally in Notifications & Controller Shortcuts regardless of overlay_enabled"

patterns-established:
  - "Volume-scaled Web Audio notification synthesis via reused AudioContext with 0..100 gain clamping and try/catch isolation"

requirements-completed: [TOAST-01]

coverage:
  - id: D1
    description: "silent_banner_position setting persisted/validated in Python and exposed in SettingsTab Notification / Banner Corner picker regardless of overlay_enabled"
    requirement: "TOAST-01"
    verification:
      - kind: unit
        ref: "tests/test_chord_settings.py#test_silent_banner_position_defaults_load_validation_and_get_status"
        status: pass
      - kind: unit
        ref: "src/components/tabs/SettingsTab.test.tsx#renders Notification / Banner Corner 4-button selector even when overlay_enabled is false and saves silent_banner_position"
        status: pass
    human_judgment: false
  - id: D2
    description: "Volume-scaled non-Steam Web Audio chime utility (playNotificationChime) with safe AudioContext reuse and clamping"
    requirement: "TOAST-01"
    verification:
      - kind: unit
        ref: "src/utils/chime.test.ts#playNotificationChime"
        status: pass
    human_judgment: false
  - id: D3
    description: "DeckifyOverlayWrapper silent_banner_position precedence and SilentBanner + Web Audio chime routing on track_metadata when toast_sound_enabled is true"
    requirement: "TOAST-01"
    verification:
      - kind: integration
        ref: "src/index.test.tsx#always mounts SilentBanner even when overlay_enabled is false while omitting Overlay (TOAST-01, D-01, D-05)"
        status: pass
      - kind: integration
        ref: "src/index.test.tsx#keeps SilentBanner active and plays volume-scaled Web Audio chime (never toaster.toast) when silent_banner_enabled and toast_sound_enabled are both true (G-20-1)"
        status: pass
    human_judgment: false

# Metrics
duration: 7min
completed: 2026-11-21
status: complete
---

# Phase 20 Plan 04: Silent Banner Corner & Non-Steam Volume-Scaled Chime Summary

**Decoupled `silent_banner_position` from `overlay_enabled`/`overlay_position` and replaced the Steam `toaster.toast` sound fallback with a volume-scaled Web Audio chime alongside `SilentBanner`**

## Performance

- **Duration:** 7 min
- **Started:** 2026-11-21T18:30:25Z
- **Completed:** 2026-11-21T18:37:15Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Added `silent_banner_position` (`"top-right"` default, `_` -> `-` normalization, 4-corner allowlist validation) in `py_modules/common.py`, `main.py`, and `src/types.ts`, with an always-visible `Notification / Banner Corner` 4-button selector in `SettingsTab.tsx`.
- Created `src/utils/chime.ts` (`playNotificationChime`, `resetChimeContextForTests`) synthesizing a two-note sine chime (`523.25 Hz` / `659.25 Hz`) scaled by `cachedVolume` (0–100) with `AudioContext` reuse and full error isolation.
- Updated `DeckifyOverlayWrapper` to prioritize `silent_banner_position` over `toast_position` and `overlay_position`, and updated `handleTrackMetadataNotification` so `silent_banner_enabled !== false` always emits `SilentBanner` (with `playNotificationChime(cachedVolume)` when `toast_sound_enabled` is true) without invoking `toaster.toast`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add silent_banner_position setting in Python backend, TS types, and SettingsTab corner picker** - `8203a04` (feat)
2. **Task 2: Create volume-scaled Web Audio chime utility and wire silent_banner_position + non-Steam sound in src/index.tsx** - `d049048` (feat)

## Files Created/Modified
- `py_modules/common.py` - Added `silent_banner_position` default and `_load_settings()` normalization/validation.
- `main.py` - Exposed `silent_banner_position` in `get_status()` and validated it in `set_setting()`.
- `src/types.ts` - Added `silent_banner_position?: string;` to `EngineSettings`.
- `src/components/tabs/SettingsTab.tsx` - Added always-visible `Notification / Banner Corner` 4-button strip and updated `Notification Sound` subtitle.
- `src/components/tabs/SettingsTab.test.tsx` - Added unit test for `Notification / Banner Corner` selector when `overlay_enabled` is `false`.
- `tests/test_chord_settings.py` - Added unit test for `silent_banner_position` defaults, loading normalization, `set_setting` validation, and `get_status` exposure.
- `src/utils/chime.ts` - Added volume-scaled non-Steam Web Audio chime utility.
- `src/utils/chime.test.ts` - Added unit tests for gain scaling, `AudioContext` reuse, clamping/no-op cases, and suspended/error handling.
- `src/index.tsx` - Wired `silent_banner_position` precedence in `DeckifyOverlayWrapper` and `playNotificationChime` + `SilentBanner` routing in `handleTrackMetadataNotification`.
- `src/index.test.tsx` - Updated `toast_sound_enabled` fallback test (`silent_banner_enabled: false`) and added tests for `silent_banner_position` precedence and `SilentBanner` + chime routing.

## Decisions Made
- Gated `showTrackToaster` fallback strictly on `silent_banner_enabled === false` so enabling `toast_sound_enabled` never reverts silent notifications back to Steam's native `toaster.toast`.
- Placed `Notification / Banner Corner` directly inside `Notifications & Controller Shortcuts` regardless of `overlay_enabled`.

## Deviations from Plan

None - plan executed exactly as written. (Note: husky pre-commit runs full Vitest + TypeScript checks, so each TDD task was verified RED before implementing GREEN and committed atomically once GREEN passed.)

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Ready for `20-05` (next gap-closure plan in Phase 20) and subsequent UAT re-verification of G-20-1.

## Self-Check: PASSED
- Created/modified files verified on disk (`src/utils/chime.ts`, `src/utils/chime.test.ts`, `py_modules/common.py`, `main.py`, `src/types.ts`, `src/components/tabs/SettingsTab.tsx`, `src/index.tsx`).
- Task commits verified in git history (`8203a04`, `d049048`).
- `py -3 -m unittest discover -s tests -p "test_chord_settings.py"` (8 tests OK) and full `unittest` suite (604 tests OK) passed; `vitest run` (256 tests across 21 files), `tsc --noEmit`, `eslint --max-warnings=0 src/utils/chime.ts src/utils/chime.test.ts`, and `rollup -c` build all passed.

---
*Phase: 20-100-silent-hud-toasts-extended-in-game-quick-chords*
*Completed: 2026-11-21*
