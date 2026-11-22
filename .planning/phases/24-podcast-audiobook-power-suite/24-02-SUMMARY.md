---
phase: 24-podcast-audiobook-power-suite
plan: 02
subsystem: ui
tags: [typescript, vitest, playback-speed, podcasts, monotonic-clock]

# Dependency graph
requires:
  - phase: 24-01
    provides: Backend playback_speed state, preferred_podcast_speed persistence, and playback_speed_changed events
provides:
  - ShowItem, EpisodeFilter, media_type, playback_speed, and preferred_podcast_speed types in src/types.ts
  - Pure playback/podcast helper module src/utils/playback.ts (PLAYBACK_SPEED_OPTIONS, QAM_SPEED_CYCLE, getNextCycleSpeed, formatPlaybackSpeed, isSpokenContent, filterEpisodes, formatRemainingTime)
  - Speed-scaled monotonic clock interpolation with mid-playback re-anchoring in src/hooks/usePlaybackClock.ts
  - playbackSpeed propagation and playback_speed_changed event subscription in src/hooks/usePlaybackStatus.ts
affects: [24-03, 24-04, 24-05, NowPlayingTab, PodcastsTab, DeckifyExpandedModal, QuickAccessMenu]

# Actuals
actuals:
  tokens: 12745
  tasks: 2
  commits: 3
plan_head_before: ade8cdf5f321c3a28fc61a17b2450c3dcee27b83
plan_head_after: 56ac7b5aaa642fa471f0602723655fde6115adbe

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Re-anchor (basePosition, syncTime) before updating playbackSpeed so displayed timestamps never jump on speed transitions"
    - "Guard playbackSpeed with Number.isFinite(s) && s > 0 fallback to 1.0"

key-files:
  created:
    - src/utils/playback.ts
    - src/utils/playback.test.ts
  modified:
    - src/types.ts
    - src/hooks/usePlaybackClock.ts
    - src/hooks/usePlaybackClock.test.ts
    - src/hooks/usePlaybackStatus.ts

key-decisions:
  - "Re-anchored PlaybackClockController and usePlaybackClock basePosition/syncTime on speedChanged before drift/suppression checks so mid-playback speed changes never jump backward or forward"
  - "Extracted pure event and clock-input helpers in usePlaybackStatus.ts and usePlaybackClock.ts to satisfy ESLint max-warnings=0 complexity and function-length limits"

patterns-established:
  - "isSpokenContent checks media_type ('episode' | 'chapter' | 'audiobook') first, rejects explicit media_type === 'track', then checks :episode:/:chapter: URIs and legacy empty album"

requirements-completed: [POD-01, POD-02]

coverage:
  - id: D1
    description: "Shared Phase 24 types (ShowItem, EpisodeFilter, media_type, playback_speed, preferred_podcast_speed) and pure playback/episode utilities (isSpokenContent, PLAYBACK_SPEED_OPTIONS, QAM_SPEED_CYCLE, getNextCycleSpeed, formatPlaybackSpeed, filterEpisodes, formatRemainingTime)"
    requirement: POD-01
    verification:
      - kind: unit
        ref: "src/utils/playback.test.ts#isSpokenContent, playback speed options and QAM cycle, filterEpisodes, formatRemainingTime"
        status: pass
    human_judgment: false
  - id: D2
    description: "playbackSpeed-scaled monotonic clock interpolation with speed-change re-anchoring in PlaybackClockController/usePlaybackClock and playback_speed_changed wiring in usePlaybackStatus"
    requirement: POD-02
    verification:
      - kind: unit
        ref: "src/hooks/usePlaybackClock.test.ts#Playback Speed Scaling (D-07, T-24-03)"
        status: pass
    human_judgment: false

# Metrics
duration: 8min
completed: 2026-11-22
status: complete
---

# Phase 24 Plan 02: Shared Playback Types, Utilities & Speed-Scaled Clock Summary

**Pure podcast/audiobook playback helpers (`src/utils/playback.ts`), Phase 24 TypeScript contracts (`src/types.ts`), and `0.5x`–`2.0x` speed-scaled monotonic clock interpolation with mid-playback re-anchoring (`usePlaybackClock.ts` + `usePlaybackStatus.ts`)**

## Performance

- **Duration:** 8 min
- **Started:** 2026-11-22T19:33:32Z
- **Completed:** 2026-11-22T19:41:10Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Added `ShowItem`, `EpisodeFilter`, `TrackMeta.media_type`, `TrackItem.media_type`, `EngineSettings.preferred_podcast_speed`, and `StatusResponse.playback_speed` to `src/types.ts`.
- Created `src/utils/playback.ts` and `src/utils/playback.test.ts` (12 passing unit tests) covering `PLAYBACK_SPEED_OPTIONS` (`0.5x`–`2.0x`), `QAM_SPEED_CYCLE` / `getNextCycleSpeed`, `formatPlaybackSpeed`, `isSpokenContent`, `filterEpisodes` (`all` / `unplayed` / `in_progress`), and `formatRemainingTime` (`"Xm left"` / `"<1m left"`).
- Scaled `PlaybackClockController` and `usePlaybackClock` elapsed-time interpolation by `playbackSpeed` with `Number.isFinite(s) && s > 0` fallback to `1.0`, re-anchoring `(basePosition, syncTime)` whenever `playbackSpeed` changes, and wired `playbackSpeed` + `"playback_speed_changed"` events in `usePlaybackStatus.ts` (19 passing unit tests in `src/hooks/usePlaybackClock.test.ts`).

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Phase 24 types and create pure src/utils/playback.ts helper module with unit tests** - `403ab9c` (feat)
2. **Task 2: Scale PlaybackClockController by playbackSpeed and wire playback_speed_changed in usePlaybackStatus** - `0b37d30` (feat)
3. **Task 2 (Refactor): Simplify extractClockInputs complexity in usePlaybackStatus** - `56ac7b5` (refactor)

## Files Created/Modified
- `src/types.ts` - Added `ShowItem`, `EpisodeFilter`, `media_type`, `preferred_podcast_speed`, and `playback_speed`.
- `src/utils/playback.ts` - Pure helpers for spoken-content detection, speed options/cycling/formatting, episode filtering, and remaining-time formatting.
- `src/utils/playback.test.ts` - 12 unit tests covering all `src/utils/playback.ts` helpers.
- `src/hooks/usePlaybackClock.ts` - Added `playbackSpeed` scaling, finite-positive normalization, and re-anchoring on speed changes in both `PlaybackClockController` and `usePlaybackClock`.
- `src/hooks/usePlaybackClock.test.ts` - Added 4 speed-scaling and re-anchoring tests (19 total).
- `src/hooks/usePlaybackStatus.ts` - Passed `playbackSpeed` to `usePlaybackClock` and subscribed to `"playback_speed_changed"` events.

## Decisions Made
- Re-anchored `basePosition` and `syncTime` on `speedChanged` before drift/suppression checks in `PlaybackClockController.updateOptions` and `useClockServerSync` so mid-playback speed changes never jump backward or forward.
- Extracted pure helper functions in `src/hooks/usePlaybackClock.ts` and `src/hooks/usePlaybackStatus.ts` to keep `eslint --max-warnings=0` clean on all modified files.

## Deviations from Plan

None - plan executed exactly as written. (Note: Repo's Husky pre-commit hook runs `vitest run`, preventing committing a failing RED test commit; TDD RED -> GREEN -> REFACTOR was executed locally before each passing commit.)

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Wave 2 (`NowPlayingTab`, `PodcastsTab`) and Wave 3 (`DeckifyExpandedModal`, `QuickAccessMenu`) have all tested types, pure helpers, and speed-aware clock primitives ready.

## Self-Check: PASSED
- Verified all 6 created/modified files exist on disk.
- Verified commits `403ab9c`, `0b37d30`, and `56ac7b5` are ancestors of `HEAD`.
- Verified `pnpm test -- --run src/utils/playback.test.ts src/hooks/usePlaybackClock.test.ts` (31/31 passed), `pnpm typecheck`, `pnpm exec eslint --max-warnings=0`, and full `vitest run` (311/311 passed).

---
*Phase: 24-podcast-audiobook-power-suite*
*Completed: 2026-11-22*
