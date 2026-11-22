---
phase: 23-lyrics-2-0-offline-lrc-cache-per-track-sync-nudge-cjk-romani
plan: 04
subsystem: ui
tags: [react, typescript, decky-ui, lyrics, lrc-cache, cjk-romanization, vitest]

requires:
  - phase: 23-01
    provides: Offline .lrc disk cache (cached flag, force_refresh) and per-track sync offset RPCs/events
  - phase: 23-02
    provides: Pure-Python CJK romanizer (romanized_lines, romanized_plain) and romanization settings
  - phase: 23-03
    provides: DeckifyOverlay live trackLyricsOffsetMs and optional overlay romanization
provides:
  - LyricsTab with Source (Cached) badge, horizontal nudge/romanize toolbar, and dual-line/romanized-only CJK rendering
  - DeckifyExpandedModal per-track offset state, offline Try Next Source guard, X/Y quick nudge shortcuts, and romanization wiring
  - SettingsTab controls for Romanize CJK Lyrics, Romanization Display, Romanize In-Game Overlay, and Clear Lyrics Cache
  - LyricsTab.test.tsx Vitest unit suite
affects: [lyrics, overlay, settings, gamepad-navigation]

actuals:
  tokens: 10965
  tasks: 2
  commits: 2
plan_head_before: 963ababe6cfb4b588484d661eccff84551773024
plan_head_after: dec73a1ca564b504506572d3ec73cb77743bdc78

tech-stack:
  added: []
  patterns:
    - "Plain helper render functions (renderLyricsHeader, renderLyricsSourcesBar) in LyricsTab.tsx to satisfy ESLint max-lines-per-function while preserving shallow JSX test traversal"
    - "Lyrics mode X/Y shortcut interception in useTriggerNavigation onAction gated on modeRef.current === 'lyrics'"

key-files:
  created:
    - src/components/tabs/LyricsTab.test.tsx
  modified:
    - src/components/tabs/LyricsTab.tsx
    - src/components/DeckifyExpandedModal.tsx
    - src/components/tabs/SettingsTab.tsx
    - src/components/DeckifyExpandedModal.test.tsx
    - src/components/tabs/SettingsTab.test.tsx

key-decisions:
  - "Kept renderLyricsHeader and renderLyricsSourcesBar as plain render helpers rather than JSX child components so shallow LyricsTab(...) unit assertions continue finding horizontal Focusable and Try Next Source directly"
  - "Used hasLyricsRef and trackOffsetMsRef in DeckifyExpandedModal to keep fetchLyrics and handleNudgeOffset callbacks stable without re-triggering lyrics fetch effects"
  - "Placed Lyrics 2.0 romanization and Clear Lyrics Cache controls outside the overlay_enabled conditional inside the In-Game Overlay & Lyrics card so LyricsTab romanization and cache management remain accessible when the overlay is disabled"

patterns-established:
  - "Offset-adjusted lyric seek: onSeekPlayback(Math.max(0, line.timeMs + trackOffsetMs)) paired with effectivePosMs = currentPositionMs - trackOffsetMs"

requirements-completed: [LYRICS-01, LYRICS-02]

coverage:
  - id: D1
    description: "LyricsTab displays Source: {name} (Cached) badge, horizontal [-0.5s]/offset/[+0.5s]/[Reset]/[Romanize] toolbar, and dual-line/romanized-only CJK rendering"
    requirement: "LYRICS-01"
    verification:
      - kind: unit
        ref: "src/components/tabs/LyricsTab.test.tsx#LyricsTab"
        status: pass
    human_judgment: false
  - id: D2
    description: "DeckifyExpandedModal wires track_id/force_refresh lyrics fetch, offline fallback toast guard, X/Y quick nudge shortcuts, and live offset state"
    requirement: "LYRICS-01"
    verification:
      - kind: unit
        ref: "src/components/DeckifyExpandedModal.test.tsx#useTriggerNavigation & DeckifyExpandedModal controller dispatch"
        status: pass
    human_judgment: false
  - id: D3
    description: "SettingsTab exposes Romanize CJK Lyrics toggle, Romanization Display selector, Romanize In-Game Overlay toggle, and Clear Lyrics Cache DialogButton"
    requirement: "LYRICS-02"
    verification:
      - kind: unit
        ref: "src/components/tabs/SettingsTab.test.tsx"
        status: pass
    human_judgment: false

duration: 7min
completed: 2026-11-22
status: complete
---

# Phase 23 Plan 04: Lyrics 2.0 Frontend UI Summary

**LyricsTab cached badge, horizontal sync nudge/romanize toolbar, CJK dual-line rendering, DeckifyExpandedModal X/Y shortcuts & offline fallback guard, and SettingsTab romanization/cache controls**

## Performance

- **Duration:** 7 min
- **Started:** 2026-11-22T18:21:30Z
- **Completed:** 2026-11-22T18:28:39Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Upgraded `LyricsTab.tsx` with `Source: {name} (Cached)` badge, `LyricsNudgeToolbar` (`[-0.5s]`, offset badge, `[+0.5s]`, `[Reset]`, `[Romanize]`, `X -0.5s · Y +0.5s` hint), dual-line/romanized-only CJK rendering, offset-adjusted seek, and updated empty-state copy, verified by 7 new unit tests in `LyricsTab.test.tsx`.
- Wired `DeckifyExpandedModal.tsx` with `track_id`/`force_refresh` `get_lyrics` calls, offline `"Try Next Source"` toast guard preserving cached lyrics, `get_track_lyrics_offset` / `set_track_lyrics_offset` / `lyrics_offset_changed` live sync, `currentPositionMs - trackOffsetMs` active line calculation, and `X` (`-500ms`) / `Y` (`+500ms`) controller shortcuts gated on `modeRef.current === "lyrics"`.
- Added `Romanize CJK Lyrics`, `Romanization Display` (`Dual-Line` / `Romanized Only`), `Romanize In-Game Overlay`, and `Clear Lyrics Cache` (`clear_lyrics_cache` RPC) to `SettingsTab.tsx`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Upgrade LyricsTab.tsx with (Cached) badge, nudge/romanize toolbar, CJK dual-line rendering, and LyricsTab.test.tsx** - `af42bc0` (feat)
2. **Task 2: Wire DeckifyExpandedModal.tsx (offset, offline guard, X/Y shortcuts) and SettingsTab.tsx (romanization & clear cache)** - `dec73a1` (feat)

## Files Created/Modified
- `src/components/tabs/LyricsTab.tsx` - Added `LyricsNudgeToolbar`, `(Cached)` badge, dual-line/romanized-only CJK rendering, offset-adjusted seek, and `No Lyrics Available` empty state.
- `src/components/tabs/LyricsTab.test.tsx` - Added 7 Vitest unit tests covering `(Cached)` badge, toolbar callbacks, dual-line/romanized-only CJK rendering, offset seek, and empty state.
- `src/components/DeckifyExpandedModal.tsx` - Wired `track_id`/`force_refresh` lyrics fetch, offline fallback guard, per-track offset RPCs & `lyrics_offset_changed` listener, `X`/`Y` nudge shortcuts, and romanization state.
- `src/components/tabs/SettingsTab.tsx` - Added `Romanize CJK Lyrics`, `Romanization Display`, `Romanize In-Game Overlay`, and `Clear Lyrics Cache` controls.
- `src/components/DeckifyExpandedModal.test.tsx` - Added `addEventListener`/`removeEventListener` to `@decky/api` mock.
- `src/components/tabs/SettingsTab.test.tsx` - Added `FaTrashAlt` to `react-icons/fa` mock.

## Decisions Made
- Kept `renderLyricsHeader` and `renderLyricsSourcesBar` as plain render helpers in `LyricsTab.tsx` so existing shallow JSX tests (`DeckifyExpandedModal.test.tsx`) continue finding the horizontal `Focusable` source pills and `Try Next Source` button directly.
- Used `hasLyricsRef` and `trackOffsetMsRef` in `DeckifyExpandedModal.tsx` to avoid re-triggering lyrics fetch effects when lyrics or offsets update.
- Placed the new romanization and `Clear Lyrics Cache` controls outside the `overlay_enabled` conditional inside `SettingsTab.tsx` so they remain accessible even when the in-game overlay is disabled.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added missing mock exports in DeckifyExpandedModal.test.tsx and SettingsTab.test.tsx**
- **Found during:** Task 2 (Verification after wiring `addEventListener`/`removeEventListener` and `FaTrashAlt`)
- **Issue:** Vitest threw on unmocked `addEventListener`/`removeEventListener` in `DeckifyExpandedModal.test.tsx` and unmocked `FaTrashAlt` in `SettingsTab.test.tsx`.
- **Fix:** Added `addEventListener: vi.fn()` / `removeEventListener: vi.fn()` to `DeckifyExpandedModal.test.tsx` `@decky/api` mock and `FaTrashAlt` to `SettingsTab.test.tsx` `react-icons/fa` mock.
- **Files modified:** `src/components/DeckifyExpandedModal.test.tsx`, `src/components/tabs/SettingsTab.test.tsx`
- **Verification:** `pnpm test -- --run` passed all 24 test files (295 tests).
- **Committed in:** `dec73a1` (part of Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for Vitest module mocks to resolve new imports; no scope creep.

## Issues Encountered
- Initial `LyricsTab.tsx` extraction exceeded ESLint `max-lines-per-function` (80 lines) and broke shallow `DeckifyExpandedModal.test.tsx` traversal when `LyricsHeader`/`LyricsSourcesBar` were JSX components; resolved by converting them to plain render helper functions.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 23 (all 4 plans) is complete and verified (`pnpm typecheck`, 295/295 Vitest tests, 655/655 Python unittest tests, and `pnpm build` all pass).
- Ready for Phase 23 verification (`/gsd-verify-work 23`).

## Self-Check: PASSED
- `src/components/tabs/LyricsTab.tsx`: FOUND
- `src/components/tabs/LyricsTab.test.tsx`: FOUND
- `src/components/DeckifyExpandedModal.tsx`: FOUND
- `src/components/tabs/SettingsTab.tsx`: FOUND
- Commit `af42bc0`: FOUND
- Commit `dec73a1`: FOUND

---
*Phase: 23-lyrics-2-0-offline-lrc-cache-per-track-sync-nudge-cjk-romani*
*Completed: 2026-11-22*
