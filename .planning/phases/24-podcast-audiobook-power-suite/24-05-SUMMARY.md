---
phase: 24-podcast-audiobook-power-suite
plan: 05
subsystem: ui
tags: [react, decky-ui, gamepad, playback-speed, podcasts, qam]

# Dependency graph
requires:
  - phase: 24-03
    provides: NowPlayingTab spoken-content speed dropdown and playbackSpeed prop contract
  - phase: 24-04
    provides: PodcastsTab show drill-down view and onOpenShow/onCloseShow props
provides:
  - L2/R2 15s smart-skip adaptation in DeckifyExpandedModal for spoken content
  - set_playback_speed and get_show_episodes RPC wiring with B-button show dismissal
  - Compact QAM speed cycle DialogButton in src/index.tsx with playback_speed_changed sync
affects: [24-verify-work, qam-controls, expanded-modal]

# Actuals
actuals:
  tokens: 3115
  tasks: 2
  commits: 2
plan_head_before: a38cba17c07ae6a4f90505266b82de2c71d82efb
plan_head_after: d2f332c65b77d24728dc4cf51fb20565f8c5ad42
commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Ref-backed isSpokenRef updated every render for L2/R2 trigger navigation without stale closures"
    - "Append new useState hooks strictly at the end of existing hook blocks to preserve positional test mocks"

key-files:
  created: []
  modified:
    - src/components/DeckifyExpandedModal.tsx
    - src/index.tsx

key-decisions:
  - "Appended activeShow/showEpisodes/loadingShowEpisodes after pillMsg in DeckifyExpandedModal and playbackSpeed after ecoStatus in QuickAccessMenu to preserve useState hook slot ordering"

patterns-established:
  - "Spoken-content detection via isSpokenContent(track) shared across QAM and Expanded Modal"

requirements-completed: [POD-01, POD-02]

coverage:
  - id: D1
    description: "DeckifyExpandedModal L2/R2 15s smart-skip, set_playback_speed RPC, and PodcastsTab show drill-down with B-button dismissal"
    requirement: "POD-01"
    verification:
      - kind: unit
        ref: "src/components/DeckifyExpandedModal.test.tsx (25 passed)"
        status: pass
      - kind: integration
        ref: "pnpm typecheck && pnpm exec eslint --quiet src/ && pnpm build"
        status: pass
    human_judgment: false
  - id: D2
    description: "QuickAccessMenu compact speed cycle pill cycling 1.0x -> 1.25x -> 1.5x -> 1.75x -> 2.0x -> 0.5x -> 0.75x -> 1.0x alongside -15s and +15s"
    requirement: "POD-02"
    verification:
      - kind: unit
        ref: "src/index.test.tsx (37 passed) && src/utils/playback.test.ts (12 passed)"
        status: pass
      - kind: integration
        ref: "py -3 -m unittest discover -s tests -p test_*.py -q && pnpm test -- --run"
        status: pass
    human_judgment: false

# Metrics
duration: 5min
completed: 2026-11-22
status: complete
---

# Phase 24 Plan 05: Modal & QAM Podcast/Audiobook Integration Summary

**Wired L2/R2 15s smart-skip, `set_playback_speed` and `get_show_episodes` RPCs into `DeckifyExpandedModal.tsx`, and added the compact QAM speed cycle pill in `src/index.tsx`**

## Performance

- **Duration:** 5 min
- **Started:** 2026-11-22T19:58:24Z
- **Completed:** 2026-11-22T20:03:46Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Wired `isSpokenRef` in `DeckifyExpandedModal.tsx` so `L2`/`R2` triggers seek by `-15s`/`+15s` when `isSpokenContent(track)` is true, and connected `handleSetPlaybackSpeed` and `handleOpenShow`/`activeShowRef` (`B`-button backstack) to `NowPlayingTab` and `PodcastsTab`.
- Added `playbackSpeed` state, `playback_speed_changed` event subscription, `isSpokenContent` detection, and the compact speed cycle `DialogButton` between `-15s` and `+15s` in `QuickAccessMenu` (`src/index.tsx`).
- Verified full Phase 24 suite: Python `unittest`, Vitest (27 files, 319 tests), `pnpm typecheck`, `pnpm exec eslint --quiet src/`, and `pnpm build` all pass.

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire L2/R2 15s smart-skip, set_playback_speed, and PodcastsTab show drill-down in DeckifyExpandedModal.tsx** - `dca11d9` (feat)
2. **Task 2: Add compact QAM speed cycle pill in src/index.tsx and run full Phase 24 verification gate** - `d2f332c` (feat)

## Files Created/Modified
- `src/components/DeckifyExpandedModal.tsx` - Added `backendSetPlaybackSpeed`, `backendGetShowEpisodes`, `isSpokenRef` L2/R2 15s adaptation, `activeShow` drill-down state + `B`-button dismissal, and props for `NowPlayingTab` and `PodcastsTab`.
- `src/index.tsx` - Added `backendSetPlaybackSpeed`, `playbackSpeed` state + `playback_speed_changed` listener, `isSpokenContent` check, and compact speed cycle `DialogButton` in `QuickAccessMenu`.

## Decisions Made
- Appended `activeShow`/`showEpisodes`/`loadingShowEpisodes` after `pillMsg` in `DeckifyExpandedModal.tsx` and `playbackSpeed` after `ecoStatus` in `QuickAccessMenu` (`src/index.tsx`) to preserve `useState` hook slot indices for existing tests.

## Deviations from Plan

None - plan executed exactly as written. (Note: `DeckifyExpandedModal.tsx` has 40 pre-existing ESLint warnings such as `no-explicit-any` and `max-lines-per-function`; our changes introduced 0 new warnings and 0 errors, verified via `pnpm exec eslint --quiet src/`.)

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 24 (`POD-01`, `POD-02`) implementation is complete across backend, `NowPlayingTab`, `PodcastsTab`, `DeckifyExpandedModal`, and `QuickAccessMenu`.
- Ready for Phase 24 verification (`/gsd-verify-work 24`).

## Self-Check: PASSED
- `src/components/DeckifyExpandedModal.tsx`: FOUND
- `src/index.tsx`: FOUND
- `dca11d9`: FOUND
- `d2f332c`: FOUND

---
*Phase: 24-podcast-audiobook-power-suite*
*Completed: 2026-11-22*
