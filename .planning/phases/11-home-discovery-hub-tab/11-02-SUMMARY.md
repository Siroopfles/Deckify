---
phase: 11-home-discovery-hub-tab
plan: 02
subsystem: ui
tags: [react, decky-ui, discovery, controller-navigation, vitest, csp]

# Dependency graph
requires:
  - phase: 11-home-discovery-hub-tab
    provides: "Section-isolated TTL-cached get_discovery_feed RPC, OAuth scope v7, and 429 circuit breaker"
provides:
  - "Discovery ViewMode ('discovery') and DiscoveryFeedResponse/DiscoveryMixItem/DiscoveryTimeRange types in src/types.ts"
  - "Discovery SidebarBtn with FaCompass icon in src/components/common/Sidebar.tsx"
  - "DiscoveryTab component with time-of-day greeting, time-range pills, Refresh Feed, 4 horizontal carousels, and 403/429/empty states"
  - "Idle default-tab landing ('discovery' when no track is playing) and Y-button focus ref isolation in DeckifyExpandedModal.tsx"
affects: [phase-11-verify]

# Actuals (#2632)
actuals:
  tokens: 11352
  tasks: 2
  commits: 2
plan_head_before: 0910909831dc65da3cd15233f7e1f9a814c2a02c
plan_head_after: 294ba6bb8a0ab175ed5252a1275bb7176399ae77

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Horizontal <Focusable flow-children='horizontal'> carousels with scrollIntoView({ inline: 'nearest', block: 'nearest' }) and focusHalo(focused)"
    - "One-shot hasResolvedInitialModeRef guard transitioning mode from 'now_playing' to 'discovery' only when idle"

key-files:
  created:
    - src/components/tabs/DiscoveryTab.tsx
    - src/components/tabs/DiscoveryTab.test.tsx
  modified:
    - src/types.ts
    - src/components/common/Sidebar.tsx
    - src/components/common/Sidebar.test.tsx
    - src/components/DeckifyExpandedModal.tsx
    - src/components/DeckifyExpandedModal.test.tsx

key-decisions:
  - "Guarded idle default-tab transition with setMode((prev) => (prev === 'now_playing' ? 'discovery' : prev)) so explicit tab switches are never overridden"
  - "Kept all carousel artwork inside 128x128 <DeckifyImage> components with mutual clearing of focusedTrackRef and focusedCollectionRef on card/range/unmount transitions"

patterns-established:
  - "DiscoveryCard and TimeRangePill controller focus cards with 128x128 CSP-safe artwork and 2-line/1-line text clamping"

requirements-completed: [DISC-01, DISC-02]

coverage:
  - id: D1
    description: "Discovery tab ('discovery') registered in src/types.ts (ViewMode & ALL_MODES right after 'lyrics') and Sidebar.tsx with FaCompass icon"
    requirement: "DISC-01"
    verification:
      - kind: unit
        ref: "src/components/DeckifyExpandedModal.test.tsx#registers discovery right after lyrics in ALL_MODES and defaults to discovery when idle"
        status: pass
    human_judgment: false
  - id: D2
    description: "Idle default-tab landing in DeckifyExpandedModal.tsx keeps 'now_playing' when a track is active and switches to 'discovery' when idle"
    requirement: "DISC-01"
    verification:
      - kind: unit
        ref: "src/components/DeckifyExpandedModal.test.tsx#keeps now_playing as default tab when an active track is present"
        status: pass
    human_judgment: false
  - id: D3
    description: "DiscoveryTab horizontal carousels (Made For You / Jump Back In, Top Tracks, Top Artists, New Releases), time-range pills, Refresh Feed, A/Y actions, and 403/429/empty states"
    requirement: "DISC-02"
    verification:
      - kind: unit
        ref: "src/components/tabs/DiscoveryTab.test.tsx"
        status: pass
    human_judgment: false

# Metrics
duration: 8min
completed: 2026-11-15
status: complete
---

# Phase 11 Plan 02: Home & Discovery Hub Frontend Summary

**Implemented the controller-first Discovery hub tab (`DiscoveryTab.tsx`), registered `"discovery"` in `Sidebar.tsx` and `src/types.ts`, wired idle default-tab landing and `A`/`Y` actions in `DeckifyExpandedModal.tsx`, and verified all 403/429/empty states across 143 Vitest tests, 452 Python tests, typecheck, lint, and Rollup build.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-11-15T11:58:29Z
- **Completed:** 2026-11-15T12:06:43Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Added `"discovery"` to `ViewMode` and `ALL_MODES` (immediately after `"lyrics"`) and exported `DiscoveryTimeRange`, `DiscoveryMixItem`, and `DiscoveryFeedResponse` in `src/types.ts`.
- Added the `Discovery` navigation item (`FaCompass`) at the top of the Library section in `src/components/common/Sidebar.tsx`.
- Built `src/components/tabs/DiscoveryTab.tsx` with `getGreetingForHour`, `Refresh Feed` cache-bypass button, shared `4 Weeks` / `6 Months` / `All Time` time-range pill bar, 4 horizontal `<Focusable flow-children="horizontal">` carousels (`Made For You` / `Jump Back In`, `Top Tracks`, `Top Artists`, `New Releases`) using `128px × 128px` `<DeckifyImage>` cards, `A`/`Y` action wiring, 403 `Re-authenticate Spotify` cards, 429 stale-cache/cooldown banners, and empty state copy.
- Wired idle default-tab landing (`hasResolvedInitialModeRef`) and mutual `focusedTrackRef`/`focusedCollectionRef` clearing in `src/components/DeckifyExpandedModal.tsx`.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end Discovery frontend tracer — types, Sidebar placement, idle default tab, and DiscoveryTab shell** - `6a8c3bb` (feat)
2. **Task 2: Build DiscoveryTab horizontal carousels, time-range pills, A/Y actions, and 403/429/empty UI states** - `294ba6b` (feat)

## Files Created/Modified
- `src/types.ts` - Registered `"discovery"` in `ViewMode`/`ALL_MODES` and added Discovery feed interfaces
- `src/components/common/Sidebar.tsx` - Added `Discovery` `SidebarBtn` with `FaCompass` icon
- `src/components/common/Sidebar.test.tsx` - Added `FaCompass` to `react-icons/fa` mock
- `src/components/tabs/DiscoveryTab.tsx` - Implemented full Discovery hub UI, carousels, pills, and state handling
- `src/components/tabs/DiscoveryTab.test.tsx` - Added 5 Vitest unit tests covering greeting, pills, carousels, A/Y actions, and 403/429/empty states
- `src/components/DeckifyExpandedModal.tsx` - Wired `<DiscoveryTab>`, idle default-tab `useEffect`, hint bar, and mutual `Y` focus ref clearing
- `src/components/DeckifyExpandedModal.test.tsx` - Added tests for `ALL_MODES` order and idle vs active default-tab selection

## Decisions Made
- Guarded the idle default-tab transition with `setMode((prev) => (prev === "now_playing" ? "discovery" : prev))` so any explicit tab selection before initial status arrives is preserved.
- Mutually cleared `focusedTrackRef` and `focusedCollectionRef` on card focus, time-range switch, and tab unmount so pressing `Y` never opens an action modal for a stale item.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `FaCompass` to `Sidebar.test.tsx` `react-icons/fa` mock**
- **Found during:** Task 1 (pre-commit Vitest run)
- **Issue:** `src/components/common/Sidebar.test.tsx` mocked `react-icons/fa` with an explicit icon list missing `FaCompass`, causing all 3 Sidebar tests to fail when `Sidebar.tsx` imported `FaCompass`.
- **Fix:** Added `FaCompass: Icon` to the `react-icons/fa` mock in `src/components/common/Sidebar.test.tsx`.
- **Files modified:** `src/components/common/Sidebar.test.tsx`
- **Verification:** `npx vitest run src/components/common/Sidebar.test.tsx` (3/3 passed) and full `npx vitest run` (143/143 passed).
- **Committed in:** `6a8c3bb` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to keep `Sidebar.test.tsx` aligned with `Sidebar.tsx` icon imports. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 11 (Plans 01 & 02) implementation is complete and verified across `typecheck`, `lint`, Vitest (143 tests), Python unittest (452 tests), and Rollup production build (`dist/index.js`). Ready for phase verification.

## Self-Check: PASSED
- Verified files exist: `src/types.ts`, `src/components/common/Sidebar.tsx`, `src/components/common/Sidebar.test.tsx`, `src/components/tabs/DiscoveryTab.tsx`, `src/components/tabs/DiscoveryTab.test.tsx`, `src/components/DeckifyExpandedModal.tsx`, `src/components/DeckifyExpandedModal.test.tsx`
- Verified commits exist in `HEAD`: `6a8c3bb`, `294ba6b`

---
*Phase: 11-home-discovery-hub-tab*
*Completed: 2026-11-15*
