---
phase: 28-cdp-offline-downloads-wi-fi-travel-mode-living-room-spotify
plan: 10
subsystem: ui
tags: [react, decky-ui, gamepad-focus, travel-mode, offline-downloads, spotify-jam]
requires:
  - phase: 28-08
    provides: QAM Travel Mode toggle and backend resilience/offline settings wiring
  - phase: 28-09
    provides: JamQrModal onRetryJam prop and Jam session retry UI
provides:
  - Wrapped and focus-trapped EngineSwitchDownloadModal with B-button cancel and switching toast
  - Conditional travel-mode-header-pill with focus-visible halo and Travel Mode exit focus restoration
  - Jam active state gated on join_url and onRetryJam wired to handleOpenJamModal
affects: [phase-28-uat, DeckifyExpandedModal]
tech-stack:
  added: []
  patterns:
    - "rAF focus transfer & restoration around EngineSwitchDownloadModal and Travel Mode exit"
    - "Spread untyped runtime @decky/ui props (onFocus/onBlur, retainFocus) via Record<string, unknown> for tsc compatibility"
key-files:
  created: []
  modified:
    - src/components/DeckifyExpandedModal.tsx
key-decisions:
  - "Checked navigator.onLine === false and optional status.resilience_status.network_online === false alongside travelModeEnabled and travel_mode_show_when_online for travel-mode-header-pill visibility since ResilienceStatusInfo does not declare network_online"
  - "Passed retainFocus on Focusable and onFocus/onBlur on DialogButton via Record<string, unknown> spread to preserve runtime @decky/ui focus behavior while passing strict tsc --noEmit"
patterns-established: []
requirements-completed: [CDP-01, CDP-02, JAM-01]
duration: 5min
completed: 2026-11-26
status: complete
commits: 2
plan_head_before: 5b2101d11c005c46504c5e4ea24e703516bd8399
plan_head_after: 55abccece03ff53bcfdbd5d0531068fee7c2a4f3
actuals:
  tokens: 3534
  tasks: 2
  commits: 2
---

# Phase 28 Plan 10: DeckifyExpandedModal Gap Closure Summary

**Closed UAT gaps G-28-1, G-28-2, and G-28-3 in `DeckifyExpandedModal.tsx` with focus-trapped/wrapped `EngineSwitchDownloadModal`, focus-visible conditional `travel-mode-header-pill`, Travel Mode exit focus restoration, and Jam `onRetryJam` wiring.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-11-26T17:15:20Z
- **Completed:** 2026-11-26T17:20:17Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- **G-28-1 (`EngineSwitchDownloadModal` & `handleConfirmEngineSwitchDownload`):** Added `engineSwitchModalRef`, `prevFocusedBeforeEngineSwitchRef`, and a `useEffect` on `pendingEngineSwitchDownload` to transfer focus to `[data-testid="engine-switch-stay-btn"]` on open and restore focus on close. Added `retainFocus` and `onCancelButton={() => setPendingEngineSwitchDownload(null)}`, wrapped the button row (`flexWrap: "wrap"`, `width: "100%"`), constrained both buttons within 460px (`maxWidth: "100%"`, `whiteSpace: "normal"`), and added `showToast("Switching to Official Spotify Client...")` before switching.
- **G-28-2 (`travel-mode-header-pill` & `handleToggleTravelMode`):** Appended `travelPillFocused` state after existing `useState` hooks, gated pill rendering on `travelModeEnabled`, offline network status, or `travel_mode_show_when_online`, added focus halo styling (`outline`, `outlineOffset`, `boxShadow`, `data-deckify-focused`), and added `requestAnimationFrame` focus restoration when exiting Travel Mode so focus never strands on `document.body`.
- **G-28-3 (`JamQrModal` & Jam handlers):** Gated `jamSession.active` on `Boolean(res.join_url && (res.active ?? true))` in both `handleOpenJamModal` and `handleSwitchToSpotifyClientAndStartJam`, and wired `onRetryJam={handleOpenJamModal}` on `<JamQrModal>`.
- **Full Phase 28 Verification:** Verified `py -3 -m unittest discover -s tests -p "test_*.py"` (771 tests OK), `pnpm test -- --run` (30 files, 391 tests passed), `pnpm exec eslint src/` (0 errors), `pnpm exec tsc --noEmit`, and `pnpm run build` (`dist/` built cleanly).

## Task Commits

1. **Task 1: Fix EngineSwitchDownloadModal layout/focus trap, travel-mode-header-pill focus/visibility/exit-restore, and Jam active/retry wiring** - `55abcce` (fix)
2. **Task 2: Run full Phase 28 verification suite** - verification-only (no additional code changes required)

## Files Created/Modified

- `src/components/DeckifyExpandedModal.tsx` - Implemented G-28-1, G-28-2, and G-28-3 modal fixes

## Decisions Made

- Checked `navigator.onLine === false` and optional `status?.resilience_status?.network_online === false` alongside `travelModeEnabled` and `travel_mode_show_when_online` for `travel-mode-header-pill` visibility because `resilienceStatus` was not a local variable and `ResilienceStatusInfo` in `src/types.ts` does not declare `network_online`.
- Used `Record<string, unknown>` prop spreads for `onFocus`/`onBlur` on `DialogButton` and `retainFocus` on `Focusable` because `@decky/ui` TypeScript definitions omit those runtime-supported props.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Adapted `resilienceStatus?.network_online` and `@decky/ui` prop types for TypeScript**
- **Found during:** Task 1 (`tsc --noEmit` verification)
- **Issue:** `resilienceStatus` does not exist in `DeckifyExpandedModal.tsx` (`status?.resilience_status` is typed as `ResilienceStatusInfo` without `network_online`), and `@decky/ui` `DialogButtonProps` / `FocusableProps` omit `onFocus`/`onBlur` and `retainFocus`.
- **Fix:** Checked `navigator.onLine === false` and typed optional `(status?.resilience_status as { network_online?: boolean } | undefined)?.network_online === false`, and passed `onFocus`/`onBlur` and `retainFocus` via `Record<string, unknown>` spreads.
- **Files modified:** `src/components/DeckifyExpandedModal.tsx`
- **Verification:** `pnpm exec tsc --noEmit`, `pnpm exec eslint src/components/DeckifyExpandedModal.tsx`, `pnpm test -- --run`, `pnpm run build` all pass.
- **Committed in:** `55abcce`

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 28 gap closure plan `28-10` is complete and verified across Python `unittest`, Vitest, ESLint, TypeScript, and Rollup build.

## Self-Check: PASSED

- `src/components/DeckifyExpandedModal.tsx`: FOUND
- Commit `55abcce`: FOUND (`git merge-base --is-ancestor 55abcce HEAD` = 0)
- `py -3 -m unittest discover -s tests -p "test_*.py"`: 771 tests passed
- `pnpm test -- --run`: 30 files, 391 tests passed
- `pnpm exec eslint src/`: 0 errors
- `pnpm run build`: exited 0 (`dist` created)
