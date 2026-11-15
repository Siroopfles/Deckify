---
phase: 12-resolve-open-todos-polish
plan: 03
subsystem: ui, api, testing
tags: [sidebar, navigation, now-playing, podcasts, recently-played, react, python]

# Dependency graph
requires:
  - phase: 12-resolve-open-todos-polish
    provides: Plan 12-01 playlist loading & playback reliability baseline
provides:
  - Focusable Sidebar Now Playing InteractiveRow with Y/X/A actions across all tabs
  - Unified vertical Focusable flow in Sidebar including Back to Steam (B)
  - Quick Add to Playlist RoundBtn in NowPlayingTab
  - Resilient get_saved_episodes parsing and non-collapsing PodcastsTab episode rows
  - Discrete track_id change reload in RecentTab without continuous polling
  - Archived final 5 todos to .planning/todos/done/
affects: [v0.5-release]

# Actuals (#2632)
actuals:
  tokens: 6106
  tasks: 3
  commits: 3
plan_head_before: b2f041eb86d97bea1e20170d4f4ae8c8bad5cb35
plan_head_after: 49486f9144c68d53bac85842e026bb6e41933180

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Allow Y/X gamepad actions when focusedTrackRef.current is set even in engine/devices modes so Sidebar Now Playing works from any tab"
    - "Track discrete activeTrackId via ref in DeckifyExpandedModal to refresh RecentTab only on track changes"

key-files:
  created: []
  modified:
    - py_modules/rpc_library.py
    - src/components/common/InteractiveRow.tsx
    - src/components/common/Sidebar.tsx
    - src/components/tabs/NowPlayingTab.tsx
    - src/components/tabs/PodcastsTab.tsx
    - src/components/DeckifyExpandedModal.tsx
    - src/components/common/Sidebar.test.tsx
    - src/components/DeckifyExpandedModal.test.tsx
    - tests/test_py_modules.py
    - .planning/todos/done/2026-11-14-sidebar-back-to-steam-navigation.md
    - .planning/todos/done/2026-11-14-sidebar-now-playing-like-and-add-to-playlist.md
    - .planning/todos/done/2026-11-14-now-playing-quick-add-to-playlist.md
    - .planning/todos/done/2026-11-14-podcasts-saved-episodes-metadata.md
    - .planning/todos/done/2026-11-14-recently-played-realtime-update.md

key-decisions:
  - "Removed the isolated footer div wrapper around Back to Steam (B) in Sidebar so spatial navigation moves seamlessly down/up through nav items, Now Playing card, and Back to Steam (B)"
  - "Added onBlur to InteractiveRowProps and aria-label to RoundBtnProps in InteractiveRow.tsx to wire Sidebar focus clearing and accessible NowPlayingTab Add to Playlist button"

patterns-established:
  - "Discrete track_id change detection via lastRecentTrackIdRef avoids continuous polling of me/player/recently-played"

requirements-completed: [CTRL-01, CTRL-02]

coverage:
  - id: D1
    description: "Sidebar Now Playing card is focusable via InteractiveRow, supports Y/X/A across all tabs, and Back to Steam (B) sits directly in the vertical Focusable flow"
    requirement: CTRL-01
    verification:
      - kind: unit
        ref: "src/components/common/Sidebar.test.tsx#Sidebar pinned Back to Steam (B) footer"
        status: pass
      - kind: unit
        ref: "src/components/DeckifyExpandedModal.test.tsx#opens TrackActionModal on Y when Sidebar Now Playing card is focused in engine mode"
        status: pass
    human_judgment: false
  - id: D2
    description: "NowPlayingTab renders quick Add to Playlist RoundBtn opening TrackActionModal"
    requirement: CTRL-02
    verification:
      - kind: unit
        ref: "src/components/DeckifyExpandedModal.test.tsx#opens TrackActionModal from NowPlayingTab Add to Playlist RoundBtn"
        status: pass
    human_judgment: false
  - id: D3
    description: "PodcastsTab renders all 20 saved episodes without row collapse and get_saved_episodes handles null show or direct episode items"
    requirement: CTRL-01
    verification:
      - kind: unit
        ref: "tests/test_py_modules.py#test_get_saved_episodes_handles_null_show_and_direct_items"
        status: pass
    human_judgment: false
  - id: D4
    description: "Recently Played refreshes automatically on discrete track_id change while viewing RecentTab"
    requirement: CTRL-02
    verification:
      - kind: unit
        ref: "src/components/DeckifyExpandedModal.test.tsx#refreshes backendGetRecentlyPlayed when active track_id changes while mode is recent"
        status: pass
    human_judgment: false
  - id: D5
    description: "Final 5 todos archived to .planning/todos/done/ and full verification suite passes"
    verification:
      - kind: other
        ref: "pnpm run typecheck && pnpm run lint && npx vitest run && py -3 -m unittest discover -s tests -p 'test_*.py' && pnpm run build"
        status: pass
    human_judgment: false

duration: 9min
completed: 2026-11-15
status: complete
---

# Phase 12 Plan 03: Sidebar Navigation, NowPlaying Actions, Podcasts & Recent Refresh Summary

**Wired focusable Sidebar Now Playing actions across all tabs, unified Sidebar Back-to-Steam spatial navigation, added NowPlayingTab quick Add to Playlist, hardened PodcastsTab/get_saved_episodes metadata rendering, and added discrete track-change refresh for RecentTab.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-11-15T20:10:52Z
- **Completed:** 2026-11-15T20:19:24Z
- **Tasks:** 3
- **Files modified:** 14 (9 code/test files, 5 archived todos)

## Accomplishments
- Replaced the static Sidebar Now Playing `<div>` with an `InteractiveRow` wired to `onFocusTrack` / `onOpenActions`, and moved `Back to Steam (B)` directly into the outer `Focusable flow-children="column"` flow in `src/components/common/Sidebar.tsx`.
- Added an `Add to Playlist` `RoundBtn` (`FaPlus`) to `src/components/tabs/NowPlayingTab.tsx` and enabled `Y`/`X` actions in `src/components/DeckifyExpandedModal.tsx` whenever `focusedTrackRef.current` is set (including `engine` and `devices` modes).
- Hardened `get_saved_episodes` in `py_modules/rpc_library.py` against null `show` and direct episode items, and added `flexShrink: 0` / `minWidth: 0` to `src/components/tabs/PodcastsTab.tsx` episode rows so all 20 episodes render full metadata without collapsing.
- Added a discrete `activeTrackId` `useEffect` in `src/components/DeckifyExpandedModal.tsx` that calls `loadRecent()` only when `mode === "recent"` and the active `track_id` changes.
- Added unit tests in `Sidebar.test.tsx`, `DeckifyExpandedModal.test.tsx`, and `tests/test_py_modules.py`, archived the final 5 todos to `.planning/todos/done/`, and verified the full suite (`typecheck`, `lint`, 152 Vitest tests, 458 Python unittest tests, and `rollup` production build).

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix Sidebar Back-to-Steam navigation, focusable Now Playing card, and NowPlayingTab Add to Playlist** - `d539ea5` (fix)
2. **Task 2: Fix Podcasts 20-episode metadata rendering and Recently Played discrete track-change refresh** - `b573d55` (fix)
3. **Task 3: Add unit tests, archive final 5 todos, and run full Phase 12 verification suite** - `49486f9` (test)

## Files Created/Modified
- `src/components/common/InteractiveRow.tsx` - Added `onBlur` prop to `InteractiveRowProps` and `aria-label` prop to `RoundBtnProps`.
- `src/components/common/Sidebar.tsx` - Made Now Playing card an `InteractiveRow` with `onFocusTrack`/`onOpenActions` and moved `Back to Steam (B)` directly into the column `Focusable`.
- `src/components/tabs/NowPlayingTab.tsx` - Added `Add to Playlist` `RoundBtn` wired to `onOpenActions`.
- `src/components/tabs/PodcastsTab.tsx` - Added `flexShrink: 0` on episode `InteractiveRow` and `DeckifyImage`, and `minWidth: 0` on metadata container.
- `py_modules/rpc_library.py` - Hardened `get_saved_episodes` for null `show` and direct episode dicts.
- `src/components/DeckifyExpandedModal.tsx` - Wired Sidebar `onFocusTrack`/`onOpenActions`, `NowPlayingTab` `onOpenActions`, `Y`/`X` `focusedTrackRef` support in all modes, and discrete `activeTrackId` `loadRecent()` refresh.
- `src/components/common/Sidebar.test.tsx` - Updated `Back to Steam (B)` test and added Now Playing card focus/action test.
- `src/components/DeckifyExpandedModal.test.tsx` - Added tests for `NowPlayingTab` Add to Playlist, `Y` on focused Sidebar Now Playing in `engine` mode, and `RecentTab` discrete `track_id` refresh.
- `tests/test_py_modules.py` - Added `test_get_saved_episodes_handles_null_show_and_direct_items`.
- `.planning/todos/done/*` - Archived final 5 todos.

## Decisions Made
- Added `onBlur` to `InteractiveRowProps` and `aria-label` to `RoundBtnProps` in `InteractiveRow.tsx` so Sidebar Now Playing focus clears cleanly on blur and `NowPlayingTab` Add to Playlist is accessible and testable.
- Used `lastRecentTrackIdRef` initialized to `activeTrackId` in `DeckifyExpandedModal.tsx` so switching into `recent` mode does not trigger a duplicate `loadRecent()` call while discrete track changes while viewing `recent` refresh immediately.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `onBlur` to `InteractiveRowProps` and `aria-label` to `RoundBtnProps`**
- **Found during:** Task 1 (`Sidebar.tsx` and `NowPlayingTab.tsx`)
- **Issue:** `InteractiveRow` did not forward `onBlur` and `RoundBtn` did not accept `aria-label`, causing TypeScript errors on Task 1 edits.
- **Fix:** Added `onBlur?: () => void` to `InteractiveRowProps` (invoked on `onBlur` and `onGamepadBlur`) and `"aria-label"?: string` to `RoundBtnProps` in `src/components/common/InteractiveRow.tsx`.
- **Files modified:** `src/components/common/InteractiveRow.tsx`
- **Verification:** `pnpm run typecheck` passed.
- **Committed in:** `d539ea5` (Task 1 commit)

**2. [Rule 1 - Bug] Updated existing `Sidebar.test.tsx` assertion for unified `Back to Steam (B)` row**
- **Found during:** Task 1 verification
- **Issue:** Existing test in `Sidebar.test.tsx` asserted the old isolated `<div>` wrapper around `Back to Steam (B)` which Task 1 intentionally removed to fix spatial navigation.
- **Fix:** Updated the test to assert `InteractiveRow` directly inside the column `Focusable` with `flexShrink: 0`, `borderTop`, and `minHeight: 44`.
- **Files modified:** `src/components/common/Sidebar.test.tsx`
- **Verification:** `npx vitest run src/components/common/Sidebar.test.tsx` passed (3/3, then 4/4 after Task 3).
- **Committed in:** `d539ea5` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 3 blocking, 1 Rule 1 test update)
**Impact on plan:** Both necessary for TypeScript compilation and test alignment with the planned navigation fix. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 12 is complete: all 20 todos and 3 debug sessions are resolved and archived.
- Full verification suite (`typecheck`, `lint`, 152 Vitest tests, 458 Python unittest tests, `rollup` build) is green and ready for `v0.5` verification/release.

## Self-Check: PASSED
- Created/modified files verified on disk.
- Commits `d539ea5`, `b573d55`, `49486f9` verified in `git log`.

---
*Phase: 12-resolve-open-todos-polish*
*Completed: 2026-11-15*
