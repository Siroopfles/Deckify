---
phase: 21-dynamic-album-art-accent-themes-handheld-battery-eco-mode
plan: 06
subsystem: ui
tags: [react, theme-bus, css-variables, cef, qam, silent-banner, vitest]

requires:
  - phase: 21-dynamic-album-art-accent-themes-handheld-battery-eco-mode
    provides: themeBus (useAccentTheme, getThemeCssVars, syncThemeFromState) from 21-01/21-02
provides:
  - Reactive --deckify-accent, --deckify-accent-rgb, and --deckify-accent-transition inline CSS variables on QAM Content [data-deckify-qam-root='true']
  - Reactive --deckify-accent, --deckify-accent-rgb, and --deckify-accent-transition inline CSS variables on SilentBanner [data-testid='deckify-silent-banner']
  - Vitest regression tests covering QAM Content and SilentBanner themeBus propagation across CEF windows
affects: [phase-21-uat, qam-ui, silent-banner]

actuals:
  tokens: 46767
  tasks: 2
  commits: 2

plan_head_before: 06d75f1242c88277384017a869e3d50a3ea88f37
plan_head_after: 90b09e226b2192a4509f2e022b2e0ef6e2f9d023
commits: 2

tech-stack:
  added: []
  patterns:
    - "CEF window boundary CSS var propagation via useAccentTheme() + getThemeCssVars(accent, animationsSuspended) on display: contents root wrappers"

key-files:
  created: []
  modified:
    - src/index.tsx
    - src/components/SilentBanner.tsx
    - src/index.test.tsx
    - src/components/SilentBanner.test.tsx

key-decisions:
  - "Placed useAccentTheme() after existing useState hooks in QAM Content so existing hook slot indices (e.g. trackMeta at slot 4) remain stable without rewriting unrelated test fixtures"
  - "Added @decky/api mock in SilentBanner.test.tsx so importing real themeBus (via imagePipeline) runs without @decky/manifest resolution errors in Vitest"

patterns-established:
  - "QAM root wrapper pattern: <div data-deckify-qam-root='true' style={{ display: 'contents', ...getThemeCssVars(accent, animationsSuspended) }}> preserves SteamOS QAM layout and spatial navigation while injecting CSS custom properties"

requirements-completed:
  - THEME-01

coverage:
  - id: D1
    description: "QAM Content subscribes to useAccentTheme() and spreads getThemeCssVars(accent, animationsSuspended) onto [data-deckify-qam-root='true'] with display: contents"
    requirement: "THEME-01"
    verification:
      - kind: unit
        ref: "src/index.test.tsx#wraps QAM Content in data-deckify-qam-root with display: contents and reactively updates --deckify-accent CSS vars"
        status: pass
    human_judgment: false
  - id: D2
    description: "SilentBanner subscribes to useAccentTheme() and spreads getThemeCssVars(accent, animationsSuspended) onto [data-testid='deckify-silent-banner']"
    requirement: "THEME-01"
    verification:
      - kind: unit
        ref: "src/components/SilentBanner.test.tsx#spreads --deckify-accent, --deckify-accent-rgb, and --deckify-accent-transition from themeBus onto root style (G-21-1)"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-11-22
status: complete
---

# Phase 21 Plan 06: QAM Content & SilentBanner Accent Theme Propagation Summary

**Closed UAT gaps G-21-1 and G-21-2 by subscribing QAM `Content` and `SilentBanner` to `useAccentTheme()` and spreading `getThemeCssVars(accent, animationsSuspended)` onto their root DOM elements so accent themes cross Decky Loader's CEF window boundary.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-11-22T11:48:13Z
- **Completed:** 2026-11-22T11:52:34Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Wrapped QAM `Content`'s `<PanelSection title="Deckify">` in `<div data-deckify-qam-root="true" style={{ display: "contents", ...getThemeCssVars(accent, animationsSuspended) }}>` in `src/index.tsx` so `--deckify-accent`, `--deckify-accent-rgb`, and `--deckify-accent-transition` update reactively in SteamOS GamepadUI's QAM CEF window.
- Subscribed `SilentBanner` (`src/components/SilentBanner.tsx`) to `useAccentTheme()` and merged `...getThemeCssVars(accent, animationsSuspended)` into its root `div` `style` so `getToneAccentColor` resolves `--deckify-accent` in any overlay CEF window.
- Added Vitest regression tests in `src/index.test.tsx` and `src/components/SilentBanner.test.tsx` verifying preset switches (`spotify_green`, `steamos_blue`), `dynamic_album` fallback, and `animationsSuspended` transitions (`--deckify-accent-transition: none`).

## Task Commits

Each task was committed atomically:

1. **Task 1: Subscribe QAM Content and SilentBanner to useAccentTheme() and spread getThemeCssVars()** - `21de66f` (feat)
2. **Task 2: Add Vitest regression tests for QAM Content and SilentBanner accent theme CSS variables** - `90b09e2` (test)

## Files Created/Modified
- `src/index.tsx` - Imported `getThemeCssVars` and `useAccentTheme`, called `useAccentTheme()` in `Content`, and wrapped `<PanelSection title="Deckify">` in `[data-deckify-qam-root="true"]` with `display: "contents"` and `getThemeCssVars(accent, animationsSuspended)`.
- `src/components/SilentBanner.tsx` - Imported `getThemeCssVars` and `useAccentTheme`, called `useAccentTheme()`, and merged `getThemeCssVars(accent, animationsSuspended)` into the root banner `style`.
- `src/index.test.tsx` - Added `Phase 21: QAM Accent Theme CSS Vars (G-21-1, G-21-2)` regression test.
- `src/components/SilentBanner.test.tsx` - Added `@decky/api` mock for `imagePipeline` transitively imported by `themeBus` and added `G-21-1` regression test for `SilentBanner` inline CSS variables.

## Decisions Made
- Placed `useAccentTheme()` after existing `useState` hooks in `Content` (`src/index.tsx`) so existing hook-slot indices (such as `hookValues[4]` for `trackMeta` in `src/index.test.tsx`) remain unchanged.
- Mocked `@decky/api` in `src/components/SilentBanner.test.tsx` so `themeBus.ts` runs unmocked without failing on `@decky/manifest` resolution.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `@decky/api` mock in `SilentBanner.test.tsx`**
- **Found during:** Task 1 verification / Task 2
- **Issue:** Importing `themeBus.ts` in `SilentBanner.tsx` transitively imported `imagePipeline.ts` -> `@decky/api`, which failed in Vitest with `Cannot find package '@decky/manifest'`.
- **Fix:** Added `vi.mock("@decky/api", () => ({ callable: () => vi.fn().mockResolvedValue({ ok: true }) }))` in `src/components/SilentBanner.test.tsx`.
- **Files modified:** `src/components/SilentBanner.test.tsx`
- **Verification:** `pnpm test -- --run` passed all 22 suites / 275 tests.
- **Committed in:** `90b09e2` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to keep `themeBus` unmocked in `SilentBanner.test.tsx`. No scope creep.

## Issues Encountered
- `pnpm exec eslint --max-warnings=0 src/index.tsx` reports 74 pre-existing warnings in `src/index.tsx` (0 errors); `src/components/SilentBanner.tsx` has 0 warnings and 0 errors, and `pnpm run lint` passes with exit code 0.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Gaps `G-21-1` and `G-21-2` are closed and verified by `pnpm test -- --run` (22 files, 275 tests), `pnpm run typecheck`, `pnpm run lint`, and `pnpm run build`.
- Ready for Phase 21 UAT re-verification.

## Self-Check: PASSED
- `src/index.tsx`: FOUND
- `src/components/SilentBanner.tsx`: FOUND
- `src/index.test.tsx`: FOUND
- `src/components/SilentBanner.test.tsx`: FOUND
- Commit `21de66f`: FOUND in HEAD
- Commit `90b09e2`: FOUND in HEAD

---
*Phase: 21-dynamic-album-art-accent-themes-handheld-battery-eco-mode*
*Completed: 2026-11-22*
