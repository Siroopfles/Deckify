---
phase: 28-cdp-offline-downloads-wi-fi-travel-mode-living-room-spotify
plan: 03
subsystem: ui
tags: [typescript, react, qrcode.react, spotify-jam, offline-downloads, travel-mode, vitest]

requires: []
provides:
  - OfflineState, OfflineDownloadItem, JamSessionStatus, and extended EngineSettings / StatusResponse / library item types in src/types.ts
  - Reusable JamQrCard, JamQrModal, and buildSpotifyDeepLink in src/components/common/JamQrModal.tsx
  - Unit tests for JamQrCard, JamQrModal, deep-link validation, and focus restoration in src/components/common/JamQrModal.test.tsx
affects:
  - Phase 28 Wave 2 UI plans (28-04, 28-05, 28-06, 28-07)
  - Phase 29 TvSplitView (reusable JamQrCard)

commits: 2
plan_head_before: 8611606a9974e53a9e54e79357724668005ea086
plan_head_after: b5c531586de36ffb676ea26fb0bc0962e0bdc4bf

actuals:
  tokens: 5200
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "High-contrast #FFFFFF quiet-zone QRCodeSVG wrapper (padding: 16, borderRadius: 12) for dark GamepadUI scanning"
    - "Strict spotify:(track|playlist|album|episode|show):([A-Za-z0-9]+) regex validation in buildSpotifyDeepLink (T-28-05)"
    - "Modal focus-trap via requestAnimationFrame('[tabindex=0]') and previousFocusRef restoration on unmount"

key-files:
  created:
    - src/components/common/JamQrModal.tsx
    - src/components/common/JamQrModal.test.tsx
  modified:
    - src/types.ts

key-decisions:
  - "Accepted an options object in renderModalActions and extracted renderLibrespotNotice in JamQrModal.tsx to satisfy ESLint max-params and max-lines-per-function with zero warnings"

patterns-established:
  - "JamQrCard is decoupled from JamQrModal so Phase 29 TvSplitView can embed it directly"

requirements-completed: [CDP-01, CDP-02, JAM-01]

coverage:
  - id: D1
    description: "Extend src/types.ts with OfflineState, OfflineDownloadItem, JamSessionStatus, and extended EngineSettings, StatusResponse, PlaylistItem, AlbumItem, ShowItem, and EpisodeItem"
    requirement: "CDP-01"
    verification:
      - kind: unit
        ref: "pnpm run typecheck"
        status: pass
    human_judgment: false
  - id: D2
    description: "Reusable JamQrCard and JamQrModal with #FFFFFF quiet-zone QRCodeSVG, librespot deep-link fallback + 1-click Switch CTA, and focus restoration"
    requirement: "JAM-01"
    verification:
      - kind: unit
        ref: "src/components/common/JamQrModal.test.tsx#JamQrCard"
        status: pass
      - kind: unit
        ref: "src/components/common/JamQrModal.test.tsx#JamQrModal focus restoration"
        status: pass
    human_judgment: false

duration: 5min
completed: 2026-11-26
status: complete
---

# Phase 28 Plan 03: Shared Offline/Travel/Jam Types & Reusable JamQrModal Summary

**Extended `src/types.ts` with Phase 28 offline download, Travel Mode, and Spotify Jam contracts, and built `<JamQrCard>` + `<JamQrModal>` with `#FFFFFF` quiet-zone `QRCodeSVG`, `librespot` deep-link fallback, and controller focus restoration**

## Performance

- **Duration:** 5 min
- **Started:** 2026-11-26T10:32:13Z
- **Completed:** 2026-11-26T10:37:26Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added `OfflineState`, `OfflineDownloadItem`, and `JamSessionStatus` to `src/types.ts`, and extended `PlaylistItem`, `AlbumItem`, `ShowItem`, `EpisodeItem`, `EngineSettings`, and `StatusResponse`.
- Implemented `buildSpotifyDeepLink` (with strict `spotify:(track|playlist|album|episode|show):([A-Za-z0-9]+)` validation per `T-28-05`), `<JamQrCard>`, and `<JamQrModal>` in `src/components/common/JamQrModal.tsx`.
- Added 8 Vitest unit tests in `src/components/common/JamQrModal.test.tsx` covering URI validation, `#FFFFFF` quiet-zone QR rendering, loading/empty fallbacks, `librespot` deep-link + 1-click Switch CTA, host/guest action rows, and `previousFocusRef` restoration.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend src/types.ts with Offline Download, Travel Mode, and Spotify Jam interfaces** - `5b6905a` (feat)
2. **Task 2: Reusable JamQrCard & JamQrModal component + Wave 0 JamQrModal.test.tsx** - `b5c5315` (feat)

## Files Created/Modified
- `src/types.ts` - Added `OfflineState`, `OfflineDownloadItem`, `JamSessionStatus`, and extended collection/episode/settings/status interfaces
- `src/components/common/JamQrModal.tsx` - Added `buildSpotifyDeepLink`, `JamQrCard`, and `JamQrModal`
- `src/components/common/JamQrModal.test.tsx` - Added 8 Vitest unit tests for `JAM-01`

## Decisions Made
- Used an options object in `renderModalActions` and extracted `renderLibrespotNotice` in `JamQrModal.tsx` to keep every function under ESLint's `max-params` (4) and `max-lines-per-function` (80) thresholds with zero warnings.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Wave 2 UI plans (`28-04` through `28-07`) can import `OfflineState`, `OfflineDownloadItem`, `JamSessionStatus`, `JamQrCard`, and `JamQrModal` directly.

## Self-Check: PASSED

- `src/types.ts`: FOUND
- `src/components/common/JamQrModal.tsx`: FOUND
- `src/components/common/JamQrModal.test.tsx`: FOUND
- Commit `5b6905a`: FOUND
- Commit `b5c5315`: FOUND

---
*Phase: 28-cdp-offline-downloads-wi-fi-travel-mode-living-room-spotify*
*Completed: 2026-11-26*
