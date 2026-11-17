---
phase: 17-event-driven-librespot-suspend-wi-fi-resilience
plan: 02
subsystem: frontend-resilience
tags: [librespot, onevent, usePlaybackStatus, qam, settings-tab, session-bookmark]
status: complete
requires: [17-01]
provides:
  - "HeldBookmarkInfo, ResilienceStatusInfo, EngineSettings resilience keys, and StatusResponse.resilience_status types"
  - "usePlaybackStatus immediate (<50ms) librespot_event and track_metadata push synchronization"
  - "QuickAccessMenu immediate event sync, session_restored toast, and conditional Resume Bookmark action"
  - "SettingsTab Playback Resilience card with live --onevent/fallback badge, 1h-24h expiry SliderField, and manual bookmark restore/dismiss controls"
affects: [18]
tech-stack:
  added: []
  patterns:
    - "Functional setStatus((prev) => ...) push updates in usePlaybackStatus alongside 1.5s background poll"
    - "Ref-synced toast preference (resilienceToastEnabledRef) and compact conditional QAM held-bookmark CTA"
    - "Live resilience_status push synchronization in SettingsTab with clamped 1h-24h SliderField"
key-files:
  created: []
  modified:
    - src/types.ts
    - src/hooks/usePlaybackStatus.ts
    - src/index.tsx
    - src/components/tabs/SettingsTab.tsx
    - src/index.test.tsx
    - src/components/tabs/SettingsTab.test.tsx
key-decisions:
  - "Used namespace property existence check ('addEventListener' in deckyApi) in usePlaybackStatus so partial @decky/api test mocks in sibling modal tests remain compatible without throwing missing export errors"
  - "Synchronized liveResilienceStatus in SettingsTab from both status.resilience_status and live resilience_status events so the --onevent health badge and held-bookmark controls update in real time"
  - "Rendered the QAM Resume Bookmark action conditionally only when resilienceStatus.held_bookmark is non-null and resilience_prompt_held_enabled !== false to keep QAM compact (D-09)"
requirements-completed: [RESIL-01, RESIL-02]
duration: 14min
completed: 2026-11-17
plan_head_before: 59b08feccfa8ef47b097ccffaed000533cc68dc6
plan_head_after: a47b0720f900bbfd977b61460dc6e88858da8af2
commits: 2
actuals:
  tokens: 8900
  tasks: 2
  commits: 2
---

# Phase 17 Plan 02: Event-Driven librespot & Suspend/Wi-Fi Resilience Frontend Summary

**Instantaneous `librespot --onevent` push state synchronization in `usePlaybackStatus` and `QuickAccessMenu`, conditional QAM held-bookmark restore CTA, and a full "Playback Resilience" configuration card in `SettingsTab.tsx`.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-11-17T19:36:00Z
- **Completed:** 2026-11-17T19:50:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Extended `src/types.ts` with `HeldBookmarkInfo`, `ResilienceStatusInfo`, `resilience_*` fields on `EngineSettings`, and `resilience_status` on `StatusResponse`.
- Updated `src/hooks/usePlaybackStatus.ts` to subscribe to `librespot_event` and `track_metadata` via `addEventListener`/`removeEventListener`, updating `is_playing`, `play_state`, `position_ms`, `duration_ms`, `volume`, and `track` immediately (`<50ms`) without waiting for the 1.5s `get_status` poll (`RESIL-01`, `D-05`).
- Updated `QuickAccessMenu` in `src/index.tsx` to subscribe to `librespot_event`, `track_metadata`, `resilience_status`, and `session_restored`, displaying a brief Decky toast on auto-restore when `resilience_toast_enabled` is true and rendering a compact `"Resume Bookmark"` button only when a bookmark is held (`RESIL-02`, `D-09`).
- Added the `"Playback Resilience"` card in `src/components/tabs/SettingsTab.tsx` with a live `--onevent Live (20s poll)` / `Fallback Poll (3s)` status badge, 4 `ToggleField`s (`resilience_auto_resume`, `resilience_bookmark_never_expires`, `resilience_toast_enabled`, `resilience_prompt_held_enabled`), a conditional `1h–24h` `SliderField` (`resilience_bookmark_expiry_hours`), and manual `"Resume Bookmark"` / `"Dismiss"` `DialogButton`s inside a `flow-children="horizontal"` container (`D-07`, `D-08`).
- Added 7 unit tests across `src/index.test.tsx` and `src/components/tabs/SettingsTab.test.tsx` (171 total frontend tests passing across 16 test files).

## Coverage

- `src/index.test.tsx`: 15 tests passing (including 3 new Phase 17 tests for `usePlaybackStatus` immediate push sync, conditional QAM `"Resume Bookmark"`, and `session_restored` toast gating)
- `src/components/tabs/SettingsTab.test.tsx`: 28 tests passing (including 4 new Phase 17 tests for the `"Playback Resilience"` card badge, toggles, `1h–24h` expiry slider, and manual bookmark restore/dismiss)
- Full frontend verification: 171 Vitest tests passing, `pnpm typecheck` clean, `pnpm lint` 0 errors, `pnpm build` clean.

## Task Commits

1. **Task 1: Resilience types, usePlaybackStatus immediate push sync, and QAM event listeners + conditional Resume Bookmark** — `a17a01c` (`feat`)
2. **Task 2: SettingsTab "Playback Resilience" card and SettingsTab Vitest suite** — `a47b072` (`feat`)

## Files Created/Modified

- `src/types.ts` — Added `HeldBookmarkInfo`, `ResilienceStatusInfo`, `EngineSettings` resilience fields, and `StatusResponse.resilience_status`.
- `src/hooks/usePlaybackStatus.ts` — Added `librespot_event` and `track_metadata` listeners with unmount cleanup.
- `src/index.tsx` — Wired `restore_bookmark` / `dismiss_bookmark` RPCs, QAM live event listeners, `session_restored` toast, and conditional `"Resume Bookmark"` button.
- `src/components/tabs/SettingsTab.tsx` — Added `"Playback Resilience"` card with live `--onevent` health badge, toggles, `1h–24h` expiry `SliderField`, and held-bookmark actions.
- `src/index.test.tsx` — Added Vitest tests for `usePlaybackStatus` and `QuickAccessMenu` resilience behavior.
- `src/components/tabs/SettingsTab.test.tsx` — Added Vitest tests for `SettingsTab` `"Playback Resilience"` card.

## Decisions Made

- Used `"addEventListener" in api` check on the `@decky/api` namespace in `usePlaybackStatus.ts` so existing `DeckifyExpandedModal.test.tsx` partial mocks that omit `addEventListener` do not fail Vitest's missing-export proxy trap.
- Synchronized `liveResilienceStatus` in `SettingsTab.tsx` from both `status?.resilience_status` and live `"resilience_status"` events so badge and held-bookmark state stay reactive.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- Verified `src/types.ts`, `src/hooks/usePlaybackStatus.ts`, `src/index.tsx`, `src/components/tabs/SettingsTab.tsx`, `src/index.test.tsx`, and `src/components/tabs/SettingsTab.test.tsx` exist on disk.
- Verified task commits `a17a01c` and `a47b072` exist in git history.
- Verified `pnpm test -- --run src/components/tabs/SettingsTab.test.tsx src/index.test.tsx && pnpm typecheck && pnpm lint` passes with 0 errors.
