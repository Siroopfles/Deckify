---
phase: 28-cdp-offline-downloads-wi-fi-travel-mode-living-room-spotify
plan: 06
subsystem: ui
tags: [react, decky-ui, spotify-jam, offline-downloads, travel-mode, settings]

# Dependency graph
requires:
  - phase: 28-cdp-offline-downloads-wi-fi-travel-mode-living-room-spotify
    provides: Offline downloads RPCs, Travel Mode state/RPCs, JamSessionStatus types, and JamQrModal
provides:
  - Start / Share Spotify Jam and Jam Active pill + End Jam controls in NowPlayingTab and DevicesTab
  - Offline & Travel Mode settings card (manual & auto-trigger toggles) in SettingsTab
  - Storage & Offline Downloads Manager with disk guardrail slider, storage path input, single-item removal, and guarded BulkDeleteConfirmModal in SettingsTab
affects: [28-07, DeckifyExpandedModal]

actuals:
  tokens: 10172
  tasks: 2
  commits: 2

plan_head_before: 6c0206a38d576db9a651a1e1524c53707a37bb62
plan_head_after: cab08387cf23ea65acd87e90510048fdc4bfcecf
commits: 2

tech-stack:
  added: []
  patterns:
    - Extracted OfflineTravelSection and BulkDeleteConfirmModal in SettingsTab.tsx to preserve existing hook slot order and keep ESLint complexity/line limits clean
    - Guarded BulkDeleteConfirmModal focus/Escape listeners with typeof document/window checks for Node Vitest compatibility

key-files:
  created: []
  modified:
    - src/components/tabs/NowPlayingTab.tsx
    - src/components/tabs/DevicesTab.tsx
    - src/components/tabs/SettingsTab.tsx
    - src/components/tabs/NowPlayingTab.test.tsx
    - src/components/tabs/DevicesTab.test.tsx
    - src/components/tabs/SettingsTab.test.tsx

key-decisions:
  - "Extracted OfflineTravelSection and BulkDeleteConfirmModal as dedicated JSX components in SettingsTab.tsx so SettingsTab's existing useState hook slots remain unchanged for unit tests"
  - "Guarded document.activeElement, requestAnimationFrame, and window Escape keydown listeners in BulkDeleteConfirmModal with typeof checks for Node test compatibility"

patterns-established:
  - "Horizontal Jam action bars in NowPlayingTab and DevicesTab use flow-children='horizontal' and width: 'auto', flexShrink: 0 on all compact DialogButtons"

requirements-completed: [CDP-01, CDP-02, JAM-01]

coverage:
  - id: D1
    description: "NowPlayingTab and DevicesTab expose 'Start / Share Spotify Jam' and 'Jam Active' pill + 'End Jam' host button"
    requirement: "JAM-01"
    verification:
      - kind: unit
        ref: "src/components/tabs/NowPlayingTab.test.tsx#NowPlayingTab Spotify Jam controls (JAM-01)"
        status: pass
      - kind: unit
        ref: "src/components/tabs/DevicesTab.test.tsx#renders 'Start / Share Spotify Jam' and 'Jam Active' pill + 'End Jam' in DevicesTab"
        status: pass
    human_judgment: false
  - id: D2
    description: "SettingsTab exposes Travel Mode manual & auto-trigger toggles, offline_min_free_gb slider, offline_storage_path input, and Storage & Offline Downloads Manager"
    requirement: "CDP-01"
    verification:
      - kind: unit
        ref: "src/components/tabs/SettingsTab.test.tsx#SettingsTab - Offline Travel Mode & Storage Downloads Manager (Phase 28)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Remove All Offline Downloads in SettingsTab is guarded behind BulkDeleteConfirmModal trapping onCancelButton / Escape and restoring previousFocusRef"
    requirement: "CDP-02"
    verification:
      - kind: unit
        ref: "src/components/tabs/SettingsTab.test.tsx#renders BulkDeleteConfirmModal with onCancelButton/vgp_oncancel trap and guarded remove_all_offline_downloads"
        status: pass
    human_judgment: false

duration: 7min
completed: 2026-11-26
status: complete
---

# Phase 28 Plan 06: Jam Triggers, Travel Mode Settings & Offline Downloads Manager Summary

**Spotify Jam triggers and active session pills in `NowPlayingTab` and `DevicesTab`, plus Travel Mode toggles, disk guardrail/storage path settings, and guarded `BulkDeleteConfirmModal` in `SettingsTab`**

## Performance

- **Duration:** 7 min
- **Started:** 2026-11-26T10:53:56Z
- **Completed:** 2026-11-26T11:00:50Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Added `jamSession`, `onOpenJamModal`, and `onEndJam` props to `NowPlayingTab.tsx` and `DevicesTab.tsx` with horizontal `Start / Share Spotify Jam` button, accent `Jam Active` pill (with guest count), and host `End Jam` action.
- Added `OfflineTravelSection` to `SettingsTab.tsx` with manual `Offline / Travel Mode` toggle, `Auto-Activate on Wi-Fi Disconnect` toggle (noting 10s wake-from-suspend grace window), live free disk space readout, `Minimum Free Space Guardrail (GB)` slider, `Offline Storage Path` input + `Apply Storage Path` button, and downloaded items list with immediate `Remove Download`.
- Added `BulkDeleteConfirmModal` in `SettingsTab.tsx` guarding `remove_all_offline_downloads` with `onCancelButton`/`vgp_oncancel`/`Escape` traps and `previousFocusRef` focus restoration.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Start / Share Spotify Jam & Jam Active pill to NowPlayingTab and DevicesTab** - `12a1ade` (feat)
2. **Task 2: Travel Mode config, Storage & Offline Downloads Manager, & BulkDeleteConfirmModal in SettingsTab** - `cab0838` (feat)

## Files Created/Modified
- `src/components/tabs/NowPlayingTab.tsx` - Added `renderJamActionBar` and `jamSession` / `onOpenJamModal` / `onEndJam` props
- `src/components/tabs/DevicesTab.tsx` - Added `renderDevicesJamBar` and `jamSession` / `onOpenJamModal` / `onEndJam` props
- `src/components/tabs/SettingsTab.tsx` - Added `OfflineTravelSection` and `BulkDeleteConfirmModal`
- `src/components/tabs/NowPlayingTab.test.tsx` - Added `FaQrcode` mock and `JAM-01` unit tests
- `src/components/tabs/DevicesTab.test.tsx` - Added `FaQrcode` mock and `DevicesTab` Jam unit test
- `src/components/tabs/SettingsTab.test.tsx` - Added `TextField`/`FaWifi`/`FaHdd` mocks and Phase 28 Travel Mode, Storage Manager, and `BulkDeleteConfirmModal` unit tests

## Decisions Made
- Extracted `OfflineTravelSection` and `BulkDeleteConfirmModal` as dedicated JSX components in `SettingsTab.tsx` so `SettingsTab`'s existing `useState` hook slots remain unchanged for unit tests.
- Guarded `document.activeElement`, `requestAnimationFrame`, and `window` Escape keydown listeners in `BulkDeleteConfirmModal` with `typeof` checks for Node Vitest compatibility.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `NowPlayingTab.test.tsx` mocked `react/jsx-dev-runtime` without `Fragment` and `SettingsTab.test.tsx` ran in Node without `document`/`window`; resolved by rendering sibling elements without `<>` in `renderJamActionBar` and guarding DOM/window globals in `BulkDeleteConfirmModal`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `NowPlayingTab`, `DevicesTab`, and `SettingsTab` are ready to be wired into `DeckifyExpandedModal.tsx` in Plan 28-07.

## Self-Check: PASSED
- `src/components/tabs/NowPlayingTab.tsx` FOUND
- `src/components/tabs/DevicesTab.tsx` FOUND
- `src/components/tabs/SettingsTab.tsx` FOUND
- Commit `12a1ade` FOUND
- Commit `cab0838` FOUND
- `pnpm run typecheck && pnpm run lint && pnpm test -- --run` passed (30 test files, 382 tests).

---
*Phase: 28-cdp-offline-downloads-wi-fi-travel-mode-living-room-spotify*
*Completed: 2026-11-26*
