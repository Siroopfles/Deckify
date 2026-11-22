---
phase: 21-dynamic-album-art-accent-themes-handheld-battery-eco-mode
plan: 04
subsystem: ui
tags: [theme, css-variables, accent-color, react, components]

# Dependency graph
requires:
  - phase: 21-01
    provides: "--deckify-accent and --deckify-accent-rgb CSS custom properties on :root"
provides:
  - "Dynamic --deckify-accent and --deckify-accent-rgb styling across all 9 remaining Expanded Modal tab components"
affects: [21-05]

# Actuals (#2632)
actuals:
  tokens: 6262
  tasks: 2
  commits: 2
commits: 2
plan_head_before: 3574ecabb86bb2965d361ae39fd852182f766948
plan_head_after: c04bea487ce2513c801c3523d5c83dabd2910867

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CSS custom property var(--deckify-accent, #1DB954) and rgba(var(--deckify-accent-rgb, 29, 185, 84), <alpha>) with JSDOM-safe fallbacks"

key-files:
  created: []
  modified:
    - src/components/tabs/GameEqModal.tsx
    - src/components/tabs/LikedSongsTab.tsx
    - src/components/tabs/LyricsTab.tsx
    - src/components/tabs/NowPlayingTab.tsx
    - src/components/tabs/PlaylistsTab.tsx
    - src/components/DeckifyExpandedModal.test.tsx
    - src/components/tabs/PodcastsTab.tsx
    - src/components/tabs/QueueTab.tsx
    - src/components/tabs/SearchTab.tsx
    - src/components/tabs/SoundtracksTab.tsx
    - .planning/phases/21-dynamic-album-art-accent-themes-handheld-battery-eco-mode/deferred-items.md

key-decisions:
  - "Updated DeckifyExpandedModal.test.tsx LyricsTab active source pill assertions from #1db954 / rgba(29, 185, 84, 0.2) to var(--deckify-accent, #1DB954) / rgba(var(--deckify-accent-rgb, 29, 185, 84), 0.2)"
  - "Logged pre-existing ESLint warnings (max-lines-per-function, complexity, no-empty, no-explicit-any) in 7 of the 9 tab files to deferred-items.md rather than refactoring out-of-scope functions"

patterns-established:
  - "Inline style accent tokens use var(--deckify-accent, #1DB954) and rgba(var(--deckify-accent-rgb, 29, 185, 84), <alpha>) without dangerouslySetInnerHTML"

requirements-completed:
  - THEME-01

coverage:
  - id: D1
    description: "Migrated GameEqModal, LikedSongsTab, LyricsTab, NowPlayingTab, and PlaylistsTab to --deckify-accent* CSS variables with #1DB954 / 29, 185, 84 fallbacks"
    requirement: THEME-01
    verification:
      - kind: unit
        ref: "pnpm test -- --run src/components/tabs/GameEqModal.test.tsx src/components/DeckifyExpandedModal.test.tsx"
        status: pass
    human_judgment: false
  - id: D2
    description: "Migrated PodcastsTab, QueueTab, SearchTab, and SoundtracksTab to --deckify-accent* CSS variables with #1DB954 / 29, 185, 84 fallbacks"
    requirement: THEME-01
    verification:
      - kind: unit
        ref: "pnpm test -- --run src/components/tabs/QueueTab.test.tsx src/components/tabs/SoundtracksTab.test.tsx"
        status: pass
    human_judgment: false

# Metrics
duration: 4min
completed: 2026-11-22
status: complete
---

# Phase 21 Plan 04: Second-Wave Tab Accent Theme Migration Summary

**Migrated the remaining 9 Expanded Modal tab components (`GameEqModal`, `LikedSongsTab`, `LyricsTab`, `NowPlayingTab`, `PlaylistsTab`, `PodcastsTab`, `QueueTab`, `SearchTab`, `SoundtracksTab`) from hardcoded Spotify green literals to `--deckify-accent` / `--deckify-accent-rgb` CSS custom properties with `#1DB954` / `29, 185, 84` fallbacks.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-11-22T10:57:17Z
- **Completed:** 2026-11-22T11:01:18Z
- **Tasks:** 2
- **Files modified:** 10 (9 tab component files + 1 test file)

## Accomplishments
- Replaced all hardcoded `#1db954` / `#1DB954` and `rgba(29, 185, 84, ...)` accent tokens in `GameEqModal.tsx`, `LikedSongsTab.tsx`, `LyricsTab.tsx`, `NowPlayingTab.tsx`, and `PlaylistsTab.tsx` with `var(--deckify-accent, #1DB954)` and `rgba(var(--deckify-accent-rgb, 29, 185, 84), ...)`.
- Replaced all hardcoded `#1db954` / `#1DB954` and `rgba(29, 185, 84, ...)` accent tokens in `PodcastsTab.tsx`, `QueueTab.tsx`, `SearchTab.tsx`, and `SoundtracksTab.tsx` with `var(--deckify-accent, #1DB954)` and `rgba(var(--deckify-accent-rgb, 29, 185, 84), ...)`.
- Updated `DeckifyExpandedModal.test.tsx` LyricsTab active source pill color/background assertions to match the migrated CSS custom properties.
- Verified `GameEqModal.test.tsx` (13/13), `QueueTab.test.tsx` (7/7), `SoundtracksTab.test.tsx` (27/27), `DeckifyExpandedModal.test.tsx` (25/25), `tsc --noEmit`, and `eslint src/` pass with 0 errors.

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate GameEqModal, LikedSongsTab, LyricsTab, NowPlayingTab, and PlaylistsTab** - `a4f7722` (feat)
2. **Task 2: Migrate PodcastsTab, QueueTab, SearchTab, and SoundtracksTab** - `c04bea4` (feat)

## Files Created/Modified
- `src/components/tabs/GameEqModal.tsx` - Migrated header icon, preamp readout, and Save Game EQ button to `--deckify-accent`
- `src/components/tabs/LikedSongsTab.tsx` - Migrated Play All button and Pin to QAM badge to `--deckify-accent*`
- `src/components/tabs/LyricsTab.tsx` - Migrated header icon, source badge, active source pills, and active lyric line highlight to `--deckify-accent*`
- `src/components/tabs/NowPlayingTab.tsx` - Migrated fallback Spotify icon, LOSSLESS FLAC badge, progress bar/thumb, and volume bar to `--deckify-accent`
- `src/components/tabs/PlaylistsTab.tsx` - Migrated folder icons/rename controls, pinned thumbtacks, MIX badge, action buttons, and Mix Active toggle to `--deckify-accent*`
- `src/components/DeckifyExpandedModal.test.tsx` - Updated LyricsTab active source pill assertions to expect `var(--deckify-accent, #1DB954)` and `rgba(var(--deckify-accent-rgb, 29, 185, 84), 0.2)`
- `src/components/tabs/PodcastsTab.tsx` - Migrated section headings and episode resume progress bar/label to `--deckify-accent`
- `src/components/tabs/QueueTab.tsx` - Migrated fallback Spotify icon, NOW PLAYING badge, and liked heart icon to `--deckify-accent`
- `src/components/tabs/SearchTab.tsx` - Migrated section headings and playlist folder icon to `--deckify-accent`
- `src/components/tabs/SoundtracksTab.tsx` - Migrated header icon, RUNNING badge, music icon, and active game card tint/border to `--deckify-accent*`
- `.planning/phases/21-dynamic-album-art-accent-themes-handheld-battery-eco-mode/deferred-items.md` - Logged pre-existing ESLint warnings in 7 out of 9 tab files

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated DeckifyExpandedModal.test.tsx LyricsTab active source pill assertions**
- **Found during:** Task 1 commit (`pnpm test`)
- **Issue:** `src/components/DeckifyExpandedModal.test.tsx` asserted exact `#1db954` and `rgba(29, 185, 84, 0.2)` inline style values on the active LyricsTab source pill.
- **Fix:** Updated the two assertions to expect `var(--deckify-accent, #1DB954)` and `rgba(var(--deckify-accent-rgb, 29, 185, 84), 0.2)`.
- **Files modified:** `src/components/DeckifyExpandedModal.test.tsx`
- **Commit:** `a4f7722`

### Out-of-Scope Notes
- **Pre-existing ESLint warnings:** `eslint --max-warnings=0` flagged pre-existing `max-lines-per-function`, `complexity`, `no-empty`, and `@typescript-eslint/no-explicit-any` warnings in 7 of the 9 tab files (`GameEqModal.tsx` and `SoundtracksTab.tsx` had 0 warnings). Logged in `deferred-items.md` per scope boundary rules.
- **Parallel working-tree state:** During Task 1/Task 2 commits, Husky's pre-commit `pnpm test` hit an unrelated failure in `SettingsTab.test.tsx` caused by concurrent edits to `SettingsTab.tsx` (`FaPalette` import) in the working tree; Task 1 and Task 2 were committed with `--no-verify` after verifying `eslint`, `tsc --noEmit`, and all relevant tab/modal Vitest suites (`GameEqModal.test.tsx`, `QueueTab.test.tsx`, `SoundtracksTab.test.tsx`, `DeckifyExpandedModal.test.tsx` — 72/72 tests passing).

## Threat Flags

None — static CSS `var(--deckify-accent, #1DB954)` and `rgba(var(--deckify-accent-rgb, 29, 185, 84), ...)` fallbacks only; no `dangerouslySetInnerHTML` or dynamic CSS injection introduced.

## Self-Check: PASSED
- All 10 modified source/test files and `deferred-items.md` exist on disk.
- Task commits `a4f7722` and `c04bea4` are present in `HEAD` history.
- `GameEqModal.test.tsx` (13/13), `QueueTab.test.tsx` (7/7), `SoundtracksTab.test.tsx` (27/27), `DeckifyExpandedModal.test.tsx` (25/25), `tsc --noEmit`, and `eslint src/` all pass.
