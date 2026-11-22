# Deferred Items — Phase 21

## Pre-existing ESLint Warnings (Out of Scope for Plan 21-03)

Plan 21-03 only replaced hardcoded `#1db954` / `#1DB954` / `rgba(29, 185, 84, ...)` string literals with `var(--deckify-accent, #1DB954)` / `rgba(var(--deckify-accent-rgb, 29, 185, 84), ...)`. Running `pnpm exec eslint --max-warnings=0` on the 10 target files reported pre-existing warnings in 7 files (0 errors; 0 warnings introduced by Plan 21-03):

### Task 1 Common Components
- `src/components/common/CollectionActionModal.tsx`: `max-lines-per-function` (141 lines, max 80)
- `src/components/common/Sidebar.tsx`: `max-lines-per-function` (108 lines, max 80)
- `src/components/common/TrackActionModal.tsx`: `max-lines-per-function` (226 lines, max 80), `react-hooks/exhaustive-deps` (missing `actionTrack` & complex expression at line 76)

### Task 2 First-Wave Tab Components
- `src/components/tabs/AlbumsTab.tsx`: `max-lines-per-function` (119 lines, max 80)
- `src/components/tabs/ArtistsTab.tsx`: `max-lines-per-function` (85 lines, max 80)
- `src/components/tabs/DevicesTab.tsx`: `no-empty` (line 21)
- `src/components/tabs/DiscoveryTab.tsx`: `max-lines-per-function` (85 lines at line 52, 340 lines at line 245), `complexity` (41, max 15), `@typescript-eslint/no-explicit-any` (lines 34, 63, 268, 284)


## Pre-existing ESLint Warnings (Out of Scope for Plan 21-04)

Plan 21-04 only replaced hardcoded `#1db954` / `#1DB954` / `rgba(29, 185, 84, ...)` string literals with `var(--deckify-accent, #1DB954)` / `rgba(var(--deckify-accent-rgb, 29, 185, 84), ...)`. Running `pnpm exec eslint --max-warnings=0` on the 9 target files reported pre-existing warnings in 7 files (0 errors; 0 warnings in `GameEqModal.tsx` and `SoundtracksTab.tsx`; 0 warnings introduced by Plan 21-04):

### Task 1 Tab Components
- `src/components/tabs/LikedSongsTab.tsx`: `max-lines-per-function` (81 lines, max 80)
- `src/components/tabs/LyricsTab.tsx`: `max-lines-per-function` (97 lines, max 80)
- `src/components/tabs/NowPlayingTab.tsx`: `max-lines-per-function` (249 lines, max 80), `complexity` (40, max 15), `@typescript-eslint/no-explicit-any` (line 57)
- `src/components/tabs/PlaylistsTab.tsx`: `max-lines-per-function` (375 lines at line 45, 111 lines at line 98), `complexity` (20, max 15), `@typescript-eslint/no-explicit-any` (lines 176, 298)

### Task 2 Tab Components
- `src/components/tabs/PodcastsTab.tsx`: `@typescript-eslint/no-explicit-any` (line 9), `max-lines-per-function` (94 lines, max 80)
- `src/components/tabs/QueueTab.tsx`: `max-lines-per-function` (166 lines, max 80)
- `src/components/tabs/SearchTab.tsx`: `max-lines-per-function` (153 lines, max 80), `complexity` (18, max 15), `no-empty` (line 59)
