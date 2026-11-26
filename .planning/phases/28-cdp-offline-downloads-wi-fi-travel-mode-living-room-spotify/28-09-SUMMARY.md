---
phase: 28-cdp-offline-downloads-wi-fi-travel-mode-living-room-spotify
plan: 09
status: complete
subsystem: ui
tags: [react, typescript, jam-qr, travel-mode, qam, settings, discovery]

requires:
  - phase: 28-06
    provides: Offline / Travel Mode UI, JamQrModal, and QAM Travel Mode toggle
provides:
  - Strict spotify_client join_url guard without silent deep-link fallback + Retry Jam control in JamQrCard
  - travel_mode_show_when_online setting in EngineSettings/BackendStatus and SettingsTab OfflineTravelSection
  - Automatic DiscoveryTab feed reload when travelModeEnabled transitions
  - Top-level QAM Offline / Travel Mode ToggleField in both playing and stopped states
affects: [28-10, 28-UAT]

tech-stack:
  added: []
  patterns:
    - "Explicit error + retry surface in JamQrCard when spotify_client lacks join_url (no track deep-link fallback)"
    - "Shared renderTravelModeToggle() helper in QuickAccessMenu for playing and stopped QAM branches"

key-files:
  created: []
  modified:
    - src/types.ts
    - src/components/common/JamQrModal.tsx
    - src/components/common/JamQrModal.test.tsx
    - src/components/tabs/DiscoveryTab.tsx
    - src/components/tabs/SettingsTab.tsx
    - src/index.tsx

key-decisions:
  - "Added travel_mode_show_when_online?: boolean to both EngineSettings and BackendStatus in src/types.ts for parity with other travel_mode_* flags"
  - "Extracted renderTravelModeToggle() in QuickAccessMenu and placed it above Controls & Settings when playing and alongside Open Deckify / Engine toggle when stopped"

patterns-established:
  - "JamQrCard strictly separates spotify_client live Jam invite URLs from librespot playback share deep-links"

requirements-completed: [CDP-02, JAM-01]

duration: 4m
completed: 2026-11-26
commits: 3
plan_head_before: 67b9135fe525ce602c3691e3b7bbe45bffa90662
plan_head_after: 11b528c98bce038e5a3cf4bdef0efa750559057d
actuals:
  tokens: 2624
  tasks: 3
  commits: 3
---

# Phase 28 Plan 09: Frontend Gap Closure (Jam QR Guard, QAM Travel Mode, Settings & Discovery Refresh) Summary

**Eliminated silent track deep-link fallback in JamQrCard on `spotify_client` with an explicit Retry Jam action, surfaced Offline / Travel Mode at top-level in QAM, added `travel_mode_show_when_online` in SettingsTab, and wired DiscoveryTab auto-refresh on Travel Mode transitions.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-11-26T17:10:50Z
- **Completed:** 2026-11-26T17:14:20Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- **JamQrCard `spotify_client` guard (`G-28-3`):** `JamQrCard` no longer falls back to `buildSpotifyDeepLink(shareUri)` when `audioBackend === "spotify_client"` and `jamSession.join_url` is missing. Instead it renders an explicit Jam invite error and a focusable `Retry Jam` `InteractiveRow` wired to `onRetryJam` (forwarded from `JamQrModal`), with TDD test coverage in `JamQrModal.test.tsx`.
- **`travel_mode_show_when_online` & `DiscoveryTab` refresh (`G-28-2`):** Added `travel_mode_show_when_online?: boolean` to `EngineSettings` (and `BackendStatus`) in `src/types.ts`, added the `"Show Travel Mode Button When Online"` `ToggleField` to `OfflineTravelSection` in `src/components/tabs/SettingsTab.tsx`, and added `travelModeEnabled` to the `useEffect` dependency array in `src/components/tabs/DiscoveryTab.tsx`.
- **Top-level QAM Offline / Travel Mode (`G-28-2`):** Extracted `renderTravelModeToggle()` in `src/index.tsx` and moved `"Offline / Travel Mode"` out of `controlsExpanded` into the top-level QAM controls in both the `isPlaying` and stopped branches.

## Task Commits

Each task was committed atomically:

1. **Task 1: Guard JamQrCard against silent deep-link fallback on spotify_client and add Retry Jam button** - `4900ab7` (fix)
2. **Task 2: Add travel_mode_show_when_online setting in types/SettingsTab and auto-refresh DiscoveryTab on Travel Mode exit** - `86fbc92` (feat)
3. **Task 3: Surface Offline / Travel Mode ToggleField in top-level QAM controls** - `11b528c` (feat)

## Files Created/Modified

- `src/types.ts` - Added `travel_mode_show_when_online?: boolean` to `EngineSettings` and `BackendStatus`.
- `src/components/common/JamQrModal.tsx` - Added `onRetryJam` prop, strict `isSpotifyClient` `qrUrl` guard, `effectiveError`, and `Retry Jam` `InteractiveRow`.
- `src/components/common/JamQrModal.test.tsx` - Added test verifying no `open.spotify.com/track` fallback on `spotify_client` when `join_url` is null and `Retry Jam` invokes `onRetryJam`.
- `src/components/tabs/DiscoveryTab.tsx` - Added `travelModeEnabled` to the feed-loading `useEffect` dependency array.
- `src/components/tabs/SettingsTab.tsx` - Added `travelModeShowWhenOnline` prop and `"Show Travel Mode Button When Online"` `ToggleField` in `OfflineTravelSection`.
- `src/index.tsx` - Extracted `renderTravelModeToggle()` and rendered it at top-level in QAM for both playing and stopped states.

## Decisions Made

- Added `travel_mode_show_when_online?: boolean` to `BackendStatus` in `src/types.ts` alongside `EngineSettings` so top-level status payloads remain type-consistent with `travel_mode_enabled`, `travel_mode_manual`, and `travel_mode_auto_enabled`.

## Deviations from Plan

None - plan executed as written.

## Verification

- `pnpm exec eslint src/index.tsx src/types.ts src/components/common/JamQrModal.tsx src/components/tabs/DiscoveryTab.tsx src/components/tabs/SettingsTab.tsx` — 0 errors (114 pre-existing warnings).
- `pnpm test -- --run src/components/common/JamQrModal.test.tsx src/components/tabs/DiscoveryTab.test.tsx` — 2 test files passed, 16/16 tests passed.
- Full pre-commit gate on final commit (`11b528c`): `tsc --noEmit`, `vitest run` (30 test files, 391/391 tests passed), and `rollup -c` (`dist/` built cleanly).

## Self-Check: PASSED

- All 6 modified files exist on disk.
- All 3 task commits (`4900ab7`, `86fbc92`, `11b528c`) are ancestors of `HEAD`.
- All verification checks passed after final edit.
