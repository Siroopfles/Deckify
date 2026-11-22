---
phase: 21-dynamic-album-art-accent-themes-handheld-battery-eco-mode
plan: 03
subsystem: ui
tags: [theme, css-variables, accent-color, react, components]

# Dependency graph
requires:
  - phase: 21-01
    provides: "--deckify-accent and --deckify-accent-rgb CSS custom properties on :root"
provides:
  - "Dynamic --deckify-accent and --deckify-accent-rgb styling across 5 common UI components"
  - "Dynamic --deckify-accent and --deckify-accent-rgb styling across 5 first-wave tab components"
affects: [21-04, 21-05]

# Actuals (#2632)
actuals:
  tokens: 3986
  tasks: 2
  commits: 2
commits: 2
plan_head_before: 8ee8ecac41c9aecc140b762cd99439d83189c371
plan_head_after: 46e005bb51b532efbe3ceccff8dd2a425c2fd0f3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CSS custom property var(--deckify-accent, #1DB954) and rgba(var(--deckify-accent-rgb, 29, 185, 84), <alpha>) with JSDOM-safe fallbacks"

key-files:
  created:
    - .planning/phases/21-dynamic-album-art-accent-themes-handheld-battery-eco-mode/deferred-items.md
  modified:
    - src/components/common/CollectionActionModal.tsx
    - src/components/common/EqBandFaders.tsx
    - src/components/common/Sidebar.tsx
    - src/components/common/TrackActionModal.tsx
    - src/components/common/TrackRowItem.tsx
    - src/components/tabs/AlbumsTab.tsx
    - src/components/tabs/ArtistsTab.tsx
    - src/components/tabs/ChordBindingsCard.tsx
    - src/components/tabs/DevicesTab.tsx
    - src/components/tabs/DiscoveryTab.tsx
    - src/components/tabs/DiscoveryTab.test.tsx

key-decisions:
  - "Updated DiscoveryTab.test.tsx time-range pill background assertion from #1DB954 to var(--deckify-accent, #1DB954) to match the CSS custom property migration"
  - "Logged pre-existing ESLint warnings (max-lines-per-function, react-hooks/exhaustive-deps, no-empty, no-explicit-any, complexity) in deferred-items.md rather than refactoring out-of-scope functions"

patterns-established:
  - "Inline style accent tokens use var(--deckify-accent, #1DB954) and rgba(var(--deckify-accent-rgb, 29, 185, 84), <alpha>) without dangerouslySetInnerHTML"

requirements-completed:
  - THEME-01

coverage:
  - id: D1
    description: "Migrated 5 shared common components (CollectionActionModal, EqBandFaders, Sidebar, TrackActionModal, TrackRowItem) to --deckify-accent* CSS variables with #1DB954 / 29, 185, 84 fallbacks"
    requirement: THEME-01
    verification:
      - kind: unit
        ref: "pnpm test -- --run src/components/common/Sidebar.test.tsx src/components/common/TrackActionModal.test.tsx"
        status: pass
    human_judgment: false
  - id: D2
    description: "Migrated 5 first-wave tab components (AlbumsTab, ArtistsTab, ChordBindingsCard, DevicesTab, DiscoveryTab) to --deckify-accent* CSS variables with #1DB954 / 29, 185, 84 fallbacks"
    requirement: THEME-01
    verification:
      - kind: unit
        ref: "pnpm test -- --run src/components/tabs/ChordBindingsCard.test.tsx src/components/tabs/DiscoveryTab.test.tsx"
        status: pass
    human_judgment: false

# Metrics
duration: 3min
completed: 2026-11-22
status: complete
---

# Phase 21 Plan 03: Common & First-Wave Tab Accent Theme Migration Summary

**Migrated 5 shared common UI components and 5 first-wave Expanded Modal tab components from hardcoded Spotify green literals to `--deckify-accent` / `--deckify-accent-rgb` CSS custom properties with `#1DB954` / `29, 185, 84` fallbacks.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-11-22T10:53:00Z
- **Completed:** 2026-11-22T10:56:04Z
- **Tasks:** 2
- **Files modified:** 11 (10 component files + 1 test file)

## Accomplishments
- Replaced all 15 hardcoded `#1db954` / `rgba(29,185,84,0.45)` accent tokens across `CollectionActionModal.tsx`, `EqBandFaders.tsx`, `Sidebar.tsx`, `TrackActionModal.tsx`, and `TrackRowItem.tsx` with `var(--deckify-accent, #1DB954)` and `rgba(var(--deckify-accent-rgb, 29, 185, 84), 0.45)`.
- Replaced all 18 hardcoded `#1db954` / `#1DB954` / `rgba(29, 185, 84, ...)` accent tokens across `AlbumsTab.tsx`, `ArtistsTab.tsx`, `ChordBindingsCard.tsx`, `DevicesTab.tsx`, and `DiscoveryTab.tsx` with `var(--deckify-accent, #1DB954)` and `rgba(var(--deckify-accent-rgb, 29, 185, 84), ...)`.
- Verified full Vitest suite (22 files, 270 tests), `tsc --noEmit`, and `rollup -c` bundle build pass cleanly after both commits.

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate common UI components to --deckify-accent CSS variables** - `6d61da2` (feat)
2. **Task 2: Migrate AlbumsTab, ArtistsTab, ChordBindingsCard, DevicesTab, and DiscoveryTab to --deckify-accent CSS variables** - `46e005b` (feat)

## Files Created/Modified
- `src/components/common/CollectionActionModal.tsx` - Migrated heart, play, and pin accent colors to `var(--deckify-accent, #1DB954)`.
- `src/components/common/EqBandFaders.tsx` - Migrated fader fill, thumb, glow shadow, and gain readout to `--deckify-accent*`.
- `src/components/common/Sidebar.tsx` - Migrated active nav pill background and brand status dot to `var(--deckify-accent, #1DB954)`.
- `src/components/common/TrackActionModal.tsx` - Migrated action row icons (play, radio, heart, playlist folder) to `var(--deckify-accent, #1DB954)`.
- `src/components/common/TrackRowItem.tsx` - Migrated liked heart icon color to `var(--deckify-accent, #1DB954)`.
- `src/components/tabs/AlbumsTab.tsx` - Migrated pin badge, Play Album CTA, and pinned toggle colors to `--deckify-accent*`.
- `src/components/tabs/ArtistsTab.tsx` - Migrated Top Tracks and Albums & Singles section headings to `var(--deckify-accent, #1DB954)`.
- `src/components/tabs/ChordBindingsCard.tsx` - Migrated live chord chip border/tint and recording indicator highlight/ring to `--deckify-accent*`.
- `src/components/tabs/DevicesTab.tsx` - Migrated active device name and Active label color to `var(--deckify-accent, #1DB954)`.
- `src/components/tabs/DiscoveryTab.tsx` - Migrated active time-range pill, re-auth lock/CTA, and empty-state compass icon to `var(--deckify-accent, #1DB954)`.
- `src/components/tabs/DiscoveryTab.test.tsx` - Updated active time-range pill background assertion to expect `var(--deckify-accent, #1DB954)`.
- `.planning/phases/21-dynamic-album-art-accent-themes-handheld-battery-eco-mode/deferred-items.md` - Documented pre-existing ESLint warnings in 7 untouched-logic files.

## Decisions Made
- Updated `DiscoveryTab.test.tsx` line 192 to assert `"var(--deckify-accent, #1DB954)"` rather than `"#1DB954"` because `DiscoveryTab` sets `props.style.background` directly.
- Left pre-existing ESLint warnings (`max-lines-per-function`, `react-hooks/exhaustive-deps`, `no-empty`, `@typescript-eslint/no-explicit-any`, `complexity`) untouched per scope-boundary rules and recorded them in `deferred-items.md`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated DiscoveryTab unit test assertion for migrated CSS variable**
- **Found during:** Task 2 (`DiscoveryTab.test.tsx` verification)
- **Issue:** `DiscoveryTab.test.tsx:192` asserted `pill6m.props.style.background === "#1DB954"`, which failed once `DiscoveryTab.tsx` switched to `"var(--deckify-accent, #1DB954)"`.
- **Fix:** Updated the assertion in `src/components/tabs/DiscoveryTab.test.tsx` to expect `"var(--deckify-accent, #1DB954)"`.
- **Files modified:** `src/components/tabs/DiscoveryTab.test.tsx`
- **Commit:** `46e005b`

### Deferred Pre-existing Lint Warnings

`pnpm exec eslint --max-warnings=0` reported 0 errors and 0 warnings introduced by Plan 21-03, but flagged pre-existing warnings in 7 of the 10 files (`CollectionActionModal.tsx`, `Sidebar.tsx`, `TrackActionModal.tsx`, `AlbumsTab.tsx`, `ArtistsTab.tsx`, `DevicesTab.tsx`, `DiscoveryTab.tsx`). These are logged in `deferred-items.md`.

## Self-Check: PASSED
- Verified all 11 modified files and `deferred-items.md` exist on disk.
- Verified commits `6d61da2` and `46e005b` are ancestors of `HEAD`.
- Verified `pnpm test -- --run src/components/common/Sidebar.test.tsx src/components/common/TrackActionModal.test.tsx src/components/tabs/ChordBindingsCard.test.tsx src/components/tabs/DiscoveryTab.test.tsx` (4 files, 20 tests) and `pnpm run typecheck` pass.
