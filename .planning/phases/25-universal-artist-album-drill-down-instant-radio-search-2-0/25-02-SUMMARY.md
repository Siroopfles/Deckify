---
phase: 25-universal-artist-album-drill-down-instant-radio-search-2-0
plan: 02
subsystem: frontend-ui
tags: [radio, drill-down, backstack, discography, controller-nav]
requires:
  - phase: 25
    plan: 01
    provides: "start_radio, get_artist_all_tracks, get_artist_info RPCs"
provides:
  - "Universal Artist/Album drill-down from TrackActionModal, QueueTab, and NowPlayingTab"
  - "navigationHistoryRef backstack (cap 10) restoring mode, entity, scrollTop, and focus on B"
  - "ArtistsTab Start Artist Radio and paginated All Tracks discography"
  - "AlbumsTab Album Radio header action"
affects:
  - src/types.ts
  - src/components/common/TrackActionModal.tsx
  - src/components/common/TrackActionModal.test.tsx
  - src/components/tabs/QueueTab.tsx
  - src/components/tabs/ArtistsTab.tsx
  - src/components/tabs/AlbumsTab.tsx
  - src/components/DeckifyExpandedModal.tsx
  - src/components/DeckifyExpandedModal.test.tsx
tech-stack:
  added: []
  patterns:
    - "navigationHistoryRef initialized to [] (non-null) to preserve shallow-hook refValues tracking"
    - "New useState hooks appended after existing hooks in DeckifyExpandedModal to preserve hook slot indices"
    - "CSS.escape with fallback for [data-deckify-label] focus restoration"
key-files:
  created: []
  modified:
    - src/types.ts
    - src/components/common/TrackActionModal.tsx
    - src/components/common/TrackActionModal.test.tsx
    - src/components/tabs/QueueTab.tsx
    - src/components/tabs/ArtistsTab.tsx
    - src/components/tabs/AlbumsTab.tsx
    - src/components/DeckifyExpandedModal.tsx
    - src/components/DeckifyExpandedModal.test.tsx
decisions:
  - "Removed premature setMode('artists')/'albums' calls in TrackActionModal so DeckifyExpandedModal.pushNavHistory() records the true originating modeRef.current"
  - "Kept TrackActionModalProps.setMode optional without destructuring and extracted overlay/header render helpers across TrackActionModal, QueueTab, ArtistsTab, and AlbumsTab for zero ESLint warnings"
  - "Used runStartRadio helper in DeckifyExpandedModal so Song, Artist, and Album Radio surface a single success or failure toast"
metrics:
  duration: 10m
  completed: "2026-11-23"
  status: complete
  commits: 3
  plan_head_before: fda8d8df9916975cc08520f6f8aa00aec1dfa9a8
  plan_head_after: b06fe0d0c30656c8100cc2f667017ec0c8f4c862
actuals:
  tokens: 20147
  tasks: 3
  commits: 3
---

# Phase 25 Plan 02: Universal Artist/Album Drill-Down, Backstack & Radio UI Summary

Implemented universal Artist/Album drill-down, `navigationHistoryRef` `B`-button backstack restoration (mode, entity, `scrollTop`, and `[data-deckify-label]` focus), `ArtistsTab` `Start Artist Radio` + paginated `All Tracks` discography, `AlbumsTab` `Album Radio`, and 3-tier `start_radio` integration across `DeckifyExpandedModal`, `TrackActionModal`, `QueueTab`, and `NowPlayingTab`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Phase 25 shared types and universal track actions (`TrackActionModal`, `QueueTab`, `NowPlayingTab`) | `13d6bc0` | `src/types.ts`, `src/components/common/TrackActionModal.tsx`, `src/components/common/TrackActionModal.test.tsx`, `src/components/tabs/QueueTab.tsx` |
| 2 | Extend `ArtistsTab` (`Start Artist Radio` + `All Tracks` pagination) and `AlbumsTab` (`Album Radio`) | `39e1eb9` | `src/components/tabs/ArtistsTab.tsx`, `src/components/tabs/AlbumsTab.tsx` |
| 3 | Wire `navigationHistoryRef` backstack, `start_radio` RPC, and `get_artist_all_tracks` in `DeckifyExpandedModal` | `b06fe0d` | `src/components/DeckifyExpandedModal.tsx`, `src/components/DeckifyExpandedModal.test.tsx` |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated `TrackActionModal.test.tsx` assertion for renamed `Start Song Radio` label**
- **Found during:** Task 1 pre-commit Vitest run
- **Issue:** `src/components/common/TrackActionModal.test.tsx` still asserted `"Start Track Radio"` while `25-02-PLAN.md` Task 1 renamed the label to `"Start Song Radio"` (`RADIO-01`).
- **Fix:** Updated `TrackActionModal.test.tsx` to expect `"Start Song Radio"`.
- **Files modified:** `src/components/common/TrackActionModal.test.tsx`
- **Commit:** `13d6bc0`

## Verification

- `pnpm test -- --run src/components/DeckifyExpandedModal.test.tsx`: 28 tests passed.
- Full Vitest suite (`pnpm test` via pre-commit on Task 3 commit `b06fe0d`): 27 test files, 329 tests passed.
- `pnpm typecheck`: passed with 0 errors.
- `pnpm exec eslint --max-warnings=0 src/types.ts src/components/common/TrackActionModal.tsx src/components/tabs/QueueTab.tsx src/components/tabs/NowPlayingTab.tsx src/components/tabs/ArtistsTab.tsx src/components/tabs/AlbumsTab.tsx`: passed with 0 errors and 0 warnings.
- `pnpm exec eslint src/components/DeckifyExpandedModal.tsx`: 0 errors (42 pre-existing legacy warnings only; 0 new warnings).

## Self-Check: PASSED

- `src/types.ts`: FOUND (`NavHistoryEntry`, `SearchFilterTab`, `SearchResults`, `EngineSettings.search_history`)
- `src/components/common/TrackActionModal.tsx`: FOUND (`Start Song Radio`)
- `src/components/tabs/QueueTab.tsx`: FOUND (`onOpenActions`)
- `src/components/tabs/ArtistsTab.tsx`: FOUND (`Start Artist Radio`, `All Tracks`, `Load More Tracks`)
- `src/components/tabs/AlbumsTab.tsx`: FOUND (`Album Radio`)
- `src/components/DeckifyExpandedModal.tsx`: FOUND (`navigationHistoryRef`, `backendStartRadio`, `backendGetArtistAllTracks`, `backendGetArtistInfo`)
- `src/components/DeckifyExpandedModal.test.tsx`: FOUND (3 new Phase 25 tests)
- Commits `13d6bc0`, `39e1eb9`, `b06fe0d`: FOUND in `HEAD`
