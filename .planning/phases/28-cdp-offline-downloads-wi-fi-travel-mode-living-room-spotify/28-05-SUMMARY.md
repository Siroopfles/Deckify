---
phase: 28-cdp-offline-downloads-wi-fi-travel-mode-living-room-spotify
plan: 05
subsystem: ui
tags: [react, decky-ui, offline-downloads, travel-mode, gamepadui, typescript]

requires:
  - phase: 28-03
    provides: OfflineState, OfflineDownloadItem, and offline metadata fields on PlaylistItem, AlbumItem, EpisodeItem, ShowItem
provides:
  - Shared OfflineStatusUI primitives (OfflineBadge, OfflineProgressBar, OfflineDownloadButton, TravelModeBanner, clampOfflineProgress, getItemOfflineInfo)
  - Offline download toggle row in CollectionActionModal
  - Offline download controls, progress/check badges, 4px progress bars, and Travel Mode filtering in PlaylistsTab, AlbumsTab, and PodcastsTab
  - Travel Mode filtering and graceful offline degradation in LikedSongsTab, DiscoveryTab, SearchTab, and LyricsTab
affects: [28-06, 28-07]

commits: 2
plan_head_before: ef97e45cfd53e1bd74a6412ca94caf32c2838d5f
plan_head_after: 043c07cc5e2c9f7316491901ea0fa46acff22691

tech-stack:
  added: []
  patterns:
    - Shared OfflineStatusUI helpers with clamped 0..100 progress and aria-labeled status badges
    - Horizontal Focusable control bars with width: auto and flexShrink: 0 on DialogButtons
    - Travel Mode local filtering & cached fallback across library and online tabs

key-files:
  created:
    - src/components/common/OfflineStatusUI.tsx
  modified:
    - src/components/common/CollectionActionModal.tsx
    - src/components/tabs/PlaylistsTab.tsx
    - src/components/tabs/AlbumsTab.tsx
    - src/components/tabs/PodcastsTab.tsx
    - src/components/tabs/LikedSongsTab.tsx
    - src/components/tabs/DiscoveryTab.tsx
    - src/components/tabs/SearchTab.tsx
    - src/components/tabs/LyricsTab.tsx

key-decisions:
  - "Extracted shared OfflineStatusUI primitives (OfflineBadge, OfflineProgressBar, OfflineDownloadButton, TravelModeBanner, getItemOfflineInfo) in src/components/common/OfflineStatusUI.tsx to avoid duplicating badge, progress-clamping, and banner logic across 7 tabs."
  - "Filtered SearchTab queries locally against offlineDownloads in Travel Mode without firing online search_spotify or get_search_browse_categories RPCs."

patterns-established:
  - "OfflineStatusUI: clampOfflineProgress(0..100) + aria-label/title accessibility fallbacks on compact ✓ and ↓ {pct}% badges."
  - "TravelModeBanner: horizontal Focusable banner with #1C1C1C background, accent border, and width: auto Exit Travel Mode DialogButton."

requirements-completed: [CDP-01, CDP-02]

duration: 7min
completed: 2026-11-26
status: complete
---

# Phase 28 Plan 05: Offline Download Controls, Badges & Travel Mode Tab Filtering Summary

**Implemented offline download controls, clamped progress/check badges, and Travel Mode filtering/degradation across `CollectionActionModal` and all 7 library/online tabs (`PlaylistsTab`, `AlbumsTab`, `PodcastsTab`, `LikedSongsTab`, `DiscoveryTab`, `SearchTab`, `LyricsTab`).**

## Performance

- **Duration:** 7 min
- **Started:** 2026-11-26T10:45:44Z
- **Completed:** 2026-11-26T10:52:30Z
- **Tasks:** 2
- **Files modified:** 9 (1 created, 8 modified)

## Accomplishments
- Created `src/components/common/OfflineStatusUI.tsx` with `OfflineBadge` (`✓` and `↓ {pct}%` with `aria-label` and `0..100` clamping), `OfflineProgressBar` (`4px` accent bar), `OfflineDownloadButton` (`width: "auto"`, `flexShrink: 0`), and `TravelModeBanner` (`Offline Travel Mode` + `Exit Travel Mode`).
- Wired offline download toggles, status badges, detail-header progress bars, and Travel Mode list filtering into `CollectionActionModal`, `PlaylistsTab`, `AlbumsTab`, and `PodcastsTab`.
- Added Travel Mode filtering and graceful offline degradation to `LikedSongsTab` (downloaded track filtering + `No offline downloads yet` empty state), `DiscoveryTab` (cached mixes banner), `SearchTab` (local `offlineDownloads` filtering without online API calls), and `LyricsTab` (`Offline Mode · Cached .lrc` header pill).

## Task Commits

Each task was committed atomically:

1. **Task 1: Offline download toggles, progress/check badges, & Travel Mode filtering in CollectionActionModal, PlaylistsTab, AlbumsTab, & PodcastsTab** - `1afa554` (feat)
2. **Task 2: Travel Mode filtering & graceful offline degradation in LikedSongsTab, DiscoveryTab, SearchTab, & LyricsTab** - `043c07c` (feat)

## Files Created/Modified
- `src/components/common/OfflineStatusUI.tsx` - Shared offline badges, progress bar, download button, progress clamping, and Travel Mode banner.
- `src/components/common/CollectionActionModal.tsx` - Added `Download for Offline` / `Downloading {pct}% — Cancel` / `Remove Download` action row.
- `src/components/tabs/PlaylistsTab.tsx` - Added detail header offline button, `4px` progress bar, row badges, and Travel Mode folder/playlist filtering.
- `src/components/tabs/AlbumsTab.tsx` - Added album row/header offline badges, download button, `4px` progress bar, and Travel Mode filtering.
- `src/components/tabs/PodcastsTab.tsx` - Added show/episode offline badges, download toggles, `4px` progress bar, and Travel Mode filtering.
- `src/components/tabs/LikedSongsTab.tsx` - Added Travel Mode banner, downloaded track filtering, and empty-state copy.
- `src/components/tabs/DiscoveryTab.tsx` - Added Travel Mode cached Discovery mixes banner.
- `src/components/tabs/SearchTab.tsx` - Added Travel Mode banner and local `offlineDownloads` search filtering.
- `src/components/tabs/LyricsTab.tsx` - Added `Offline Mode · Cached .lrc` header pill when Travel Mode is active.

## Decisions Made
- Extracted shared `OfflineStatusUI` primitives in `src/components/common/OfflineStatusUI.tsx` rather than duplicating badge, progress-clamping, and banner markup across 7 tab components.
- Filtered `SearchTab` locally against `offlineDownloads` when `travelModeEnabled` is true so Travel Mode never fires online `search_spotify` or `get_search_browse_categories` calls.

## Deviations from Plan

None - plan executed exactly as written (with shared `OfflineStatusUI.tsx` helper extracted to avoid code duplication across the 7 tabs).

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `CollectionActionModal` and all 7 library/online tabs now expose the optional offline download and Travel Mode props ready to be wired by `DeckifyExpandedModal.tsx` in Plan `28-06`.
- `pnpm run typecheck`, `pnpm run lint`, `pnpm test -- --run` (30 test files, 376 tests), and `rollup -c` all pass.

## Self-Check: PASSED
- `src/components/common/OfflineStatusUI.tsx`: FOUND
- `1afa554` and `043c07c`: FOUND in `HEAD` history

---
*Phase: 28-cdp-offline-downloads-wi-fi-travel-mode-living-room-spotify*
*Completed: 2026-11-26*
