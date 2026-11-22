---
phase: 24-podcast-audiobook-power-suite
plan: 03
subsystem: ui
tags: [react, decky-ui, podcast, audiobook, playback-speed, vitest]

requires:
  - phase: 24-podcast-audiobook-power-suite
    provides: isSpokenContent, PLAYBACK_SPEED_OPTIONS, StatusResponse.audio_backend/playback_speed
provides:
  - Spoken-content -15s/+15s smart-skip transport replacement in NowPlayingTab
  - renderSpokenSpeedDropdown (@decky/ui Dropdown 0.5x-2.0x) gated on spotify_client
  - Wave 0 unit tests in src/components/tabs/NowPlayingTab.test.tsx
affects: [24-04, 24-05]

actuals:
  tokens: 5706
  tasks: 2
  commits: 2
plan_head_before: 35c795312319a85b62165aeee3be6f92f1b3a22f
plan_head_after: 63eaa7335ca4dca3b43fb9c59a9b3c2a45b16d0e

tech-stack:
  added: []
  patterns:
    - "Plain render helpers (renderTransportRow, renderSpokenSpeedDropdown) preserve shallow JSX test traversal without a React reconciler"
    - "T-24-04 finite-number coercion guard on Dropdown onChange before invoking onSetPlaybackSpeed"

key-files:
  created:
    - src/components/tabs/NowPlayingTab.test.tsx
  modified:
    - src/components/tabs/NowPlayingTab.tsx

key-decisions:
  - "Kept renderTransportRow and renderSpokenSpeedDropdown as plain render functions inside NowPlayingTab.tsx so shallow JSX tests (DeckifyExpandedModal.test.tsx and NowPlayingTab.test.tsx) can traverse RoundBtn and Dropdown nodes directly"
  - "Extracted TrackArtwork, ProgressScrubBar, ProgressFillTrack, VolumeBar, resolveIsLossless, and resolveNowPlayingMeta to satisfy ESLint max-lines-per-function (80) and complexity (15) with zero warnings"

patterns-established:
  - "Spoken-content transport adaptation: isSpokenContent(track) swaps Previous/Next RoundBtns for -15s/+15s smart-skip buttons and conditionally renders SpokenSpeedDropdown"

requirements-completed: [POD-01]

coverage:
  - id: D1
    description: "When a podcast episode or audiobook is playing, NowPlayingTab replaces Previous/Next transport buttons with -15s and +15s smart-skip RoundBtns"
    requirement: "POD-01"
    verification:
      - kind: unit
        ref: "src/components/tabs/NowPlayingTab.test.tsx#replaces Previous/Next with -15s and +15s buttons calling handleSeekDelta for podcast episodes"
        status: pass
    human_judgment: false
  - id: D2
    description: "When a podcast episode or audiobook is playing, NowPlayingTab renders a @decky/ui Dropdown listing 0.5x through 2.0x and disables it with helper caption when audio_backend !== spotify_client"
    requirement: "POD-01"
    verification:
      - kind: unit
        ref: "src/components/tabs/NowPlayingTab.test.tsx#renders speed Dropdown with 7 options (0.5x..2.0x) on spotify_client and invokes onSetPlaybackSpeed(1.5)"
        status: pass
      - kind: unit
        ref: "src/components/tabs/NowPlayingTab.test.tsx#disables Dropdown and renders helper caption on librespot backend"
        status: pass
    human_judgment: false
  - id: D3
    description: "When a standard music track is playing, NowPlayingTab renders Previous/Next transport buttons and hides the speed Dropdown"
    requirement: "POD-01"
    verification:
      - kind: unit
        ref: "src/components/tabs/NowPlayingTab.test.tsx#renders Previous/Next transport buttons and omits Dropdown for music tracks"
        status: pass
    human_judgment: false

duration: 7min
completed: 2026-11-22
status: complete
---

# Phase 24 Plan 03: NowPlayingTab Spoken-Content Transport & Speed Dropdown Summary

**Spoken-content `-15s`/`+15s` smart-skip transport buttons and `@decky/ui` `0.5x`–`2.0x` speed `Dropdown` in `NowPlayingTab.tsx`, backed by Wave 0 unit tests**

## Performance

- **Duration:** 7min
- **Started:** 2026-11-22T19:44:49Z
- **Completed:** 2026-11-22T19:51:37Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Replaced Previous/Next `RoundBtn`s in `NowPlayingTab.tsx` with `-15s` (`FaUndo`) and `+15s` (`FaRedo`) smart-skip buttons calling `handleSeekDelta(-15)` / `handleSeekDelta(15)` whenever `isSpokenContent(track)` is true, while keeping `flow-children="horizontal"` on the transport row.
- Added `renderSpokenSpeedDropdown` using `@decky/ui` `Dropdown` with `PLAYBACK_SPEED_OPTIONS` (`0.5x`–`2.0x`), gated on `status?.audio_backend === "spotify_client"` with disabled helper caption `"Playback speed requires Official Spotify Client"` and T-24-04 `Number.isFinite` coercion guard.
- Created `src/components/tabs/NowPlayingTab.test.tsx` with 4 Wave 0 unit tests covering music tracks, podcast episodes, `spotify_client` speed selection + T-24-04 guard, and `librespot` disabled state.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add spoken-content -15s/+15s transport replacement and speed Dropdown to NowPlayingTab.tsx** - `c3b3d34` (feat)
2. **Task 2: Create Wave 0 unit tests in NowPlayingTab.test.tsx** - `63eaa73` (test)

## Files Created/Modified
- `src/components/tabs/NowPlayingTab.tsx` - Spoken-content `-15s`/`+15s` transport replacement, `renderSpokenSpeedDropdown`, and modularized sub-components (`TrackArtwork`, `ProgressScrubBar`, `ProgressFillTrack`, `VolumeBar`).
- `src/components/tabs/NowPlayingTab.test.tsx` - Wave 0 Vitest suite (4 tests) verifying `POD-01` transport and speed controls.

## Decisions Made
- Used plain render helpers (`renderTransportRow`, `renderSpokenSpeedDropdown`) instead of uninvoked JSX child components so shallow JSX tests (`DeckifyExpandedModal.test.tsx` and `NowPlayingTab.test.tsx`) can inspect `RoundBtn` and `Dropdown` nodes directly.
- Extracted `TrackArtwork`, `ProgressScrubBar`, `ProgressFillTrack`, `VolumeBar`, `resolveIsLossless`, and `resolveNowPlayingMeta` so every function in `NowPlayingTab.tsx` passes ESLint `max-lines-per-function` (80) and `complexity` (15) with zero warnings.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Preserved shallow JSX traversal for DeckifyExpandedModal.test.tsx**
- **Found during:** Task 1 (commit pre-commit hook test run)
- **Issue:** Extracting `TransportRow` as an `<TransportRow />` JSX element prevented `DeckifyExpandedModal.test.tsx` (which shallow-calls `NowPlayingTab(props)` without a React reconciler) from finding the `Add to Playlist` `RoundBtn`.
- **Fix:** Converted `TransportRow` and `SpokenSpeedDropdown` to plain render functions (`renderTransportRow` and `renderSpokenSpeedDropdown`) invoked directly inside `NowPlayingTab`.
- **Files modified:** `src/components/tabs/NowPlayingTab.tsx`
- **Verification:** `pnpm test -- --run src/components/DeckifyExpandedModal.test.tsx` (25/25 passed) and full pre-commit suite (315/315 passed).
- **Committed in:** `c3b3d34` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 Rule 1 bug)
**Impact on plan:** Essential for compatibility with the existing shallow JSX test suite; zero scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `NowPlayingTab` `POD-01` controls and Wave 0 tests are complete and passing (`315/315` Vitest tests, `pnpm typecheck`, `eslint --max-warnings=0`, `rollup` build).
- Ready for Wave 2/3 integration in `DeckifyExpandedModal` / `QAM` (`24-04` / `24-05`).

## Self-Check: PASSED
- `src/components/tabs/NowPlayingTab.tsx`: FOUND
- `src/components/tabs/NowPlayingTab.test.tsx`: FOUND
- Commit `c3b3d34`: FOUND
- Commit `63eaa73`: FOUND

---
*Phase: 24-podcast-audiobook-power-suite*
*Completed: 2026-11-22*
