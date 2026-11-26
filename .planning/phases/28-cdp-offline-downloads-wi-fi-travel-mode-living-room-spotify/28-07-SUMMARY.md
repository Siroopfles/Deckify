---
phase: 28-cdp-offline-downloads-wi-fi-travel-mode-living-room-spotify
plan: 07
subsystem: ui
tags: [react, decky-ui, travel-mode, offline-downloads, spotify-jam, gamepad-navigation]

requires:
  - phase: 28-04
    provides: OfflineStatusUI primitives and JamQrModal / JamQrCard components
  - phase: 28-05
    provides: Travel Mode and offline download props on PlaylistsTab, AlbumsTab, PodcastsTab, LikedSongsTab, DiscoveryTab, SearchTab, LyricsTab, and CollectionActionModal
  - phase: 28-06
    provides: NowPlayingTab / DevicesTab Jam controls and SettingsTab OfflineTravelSection

provides:
  - End-to-end Travel Mode quick-toggle pill, EngineSwitchDownloadModal, JamQrModal integration, vgp_oncancel sub-modal guards, and event subscriptions in DeckifyExpandedModal.tsx
  - Quick Access Menu Offline / Travel Mode ToggleField in src/index.tsx

affects: [phase-29-tv-mode, phase-30-polish]

commits: 2
plan_head_before: b0c2efeb8d958a856a7b2d005abe4e5131a2550b
plan_head_after: 365f692d559ae1ed90d9e7b9c89b3293263ed4d8

actuals:
  tokens: 7832
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Appended 7 new useState hooks strictly after pendingDeletePlaylist in DeckifyExpandedModal to preserve existing hook slot ordering in unit tests"
    - "Guarded jamModalOpenRef and pendingEngineSwitchDownloadRef in vgp_oncancel before navigationHistoryRef so pressing B dismisses only the active sub-modal"

key-files:
  created: []
  modified:
    - src/components/DeckifyExpandedModal.tsx
    - src/index.tsx

key-decisions:
  - "Placed Travel Mode quick-toggle pill at the top of content-pane-focusable in DeckifyExpandedModal.tsx so Sidebar.tsx stayed untouched within plan scope"
  - "Placed Offline / Travel Mode ToggleField inside QAM Controls & Settings panel in src/index.tsx with optimistic update and rollback on RPC failure"

patterns-established:
  - "Sub-modal vgp_oncancel priority: grabCancelRef -> jamModalOpenRef -> pendingEngineSwitchDownloadRef -> isCrudModalOpenRef -> actionTrackRef -> actionCollectionRef -> navigationHistoryRef"

requirements-completed:
  - CDP-01
  - CDP-02
  - JAM-01

coverage:
  - id: D1
    description: "DeckifyExpandedModal wires Travel Mode pill, EngineSwitchDownloadModal, JamQrModal, vgp_oncancel guards, and tab props while preserving hook slot order"
    requirement: "CDP-01"
    verification:
      - kind: unit
        ref: "pnpm test -- --run src/components/DeckifyExpandedModal.test.tsx"
        status: pass
      - kind: automated_ui
        ref: "pnpm run typecheck && pnpm run lint && pnpm run build"
        status: pass
    human_judgment: false
  - id: D2
    description: "Quick Access Menu exposes Offline / Travel Mode ToggleField wired to set_travel_mode and travel_mode_changed events"
    requirement: "CDP-02"
    verification:
      - kind: unit
        ref: "pnpm test -- --run"
        status: pass
      - kind: integration
        ref: "py -3 -m unittest discover -s tests -p \"test_*.py\""
        status: pass
    human_judgment: false
  - id: D3
    description: "JamQrModal opens from NowPlayingTab and DevicesTab with live Spotify Jam controls and librespot engine-switch fallback"
    requirement: "JAM-01"
    verification:
      - kind: unit
        ref: "pnpm test -- --run"
        status: pass
    human_judgment: false

duration: 7min
completed: 2026-11-26
status: complete
---

# Phase 28 Plan 07: End-to-End UI Wiring Summary

**Wired Travel Mode quick-toggle pill, `EngineSwitchDownloadModal`, `<JamQrModal>`, `vgp_oncancel` sub-modal guards, and QAM `Offline / Travel Mode` `ToggleField` across `DeckifyExpandedModal.tsx` and `src/index.tsx`.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-11-26T12:02:44Z
- **Completed:** 2026-11-26T12:09:25Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added `travelModeEnabled`, `travelModeAutoEnabled`, `offlineDownloads`, `jamSession`, `jamModalOpen`, `jamLoading`, and `pendingEngineSwitchDownload` state hooks strictly after `pendingDeletePlaylist` in `src/components/DeckifyExpandedModal.tsx`
- Synced `travel_mode_enabled`, `travel_mode_auto_enabled`, and `jam_session` from `get_status`, loaded `get_offline_downloads_list()`, and subscribed to `travel_mode_changed` and `low_disk_space` events
- Implemented `handleToggleOfflineDownload` (with `EngineSwitchDownloadModal` 1-click switch to `spotify_client` when on `librespot`), `handleOpenJamModal`, `handleEndJam`, `handleSwitchToSpotifyClientAndStartJam`, and `vgp_oncancel` sub-modal guards
- Wired all Phase 28 props to `NowPlayingTab`, `LyricsTab`, `DiscoveryTab`, `PlaylistsTab`, `LikedSongsTab`, `AlbumsTab`, `PodcastsTab`, `SearchTab`, `DevicesTab`, `SettingsTab`, and `CollectionActionModal`
- Added `Offline / Travel Mode` `ToggleField` inside the QAM `Controls & Settings` panel in `src/index.tsx` synced with `get_status` and `travel_mode_changed`

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire Travel Mode pill, EngineSwitchDownloadModal, JamQrModal, & vgp_oncancel guards in DeckifyExpandedModal.tsx** - `edc9e4c` (feat)
2. **Task 2: Add Offline / Travel Mode ToggleField to Quick Access Menu (src/index.tsx) & run full verification suite** - `365f692` (feat)

## Files Created/Modified
- `src/components/DeckifyExpandedModal.tsx` - Added Travel Mode header pill, `EngineSwitchDownloadModal`, `<JamQrModal>`, `vgp_oncancel` sub-modal guards, event listeners, and tab prop wiring
- `src/index.tsx` - Added `travelModeEnabled` state, `travel_mode_changed` listener, `set_travel_mode` callable, and `Offline / Travel Mode` `ToggleField` in QAM `Controls & Settings`

## Decisions Made
- Placed the Travel Mode quick-toggle pill at the top of `content-pane-focusable` in `DeckifyExpandedModal.tsx` so `Sidebar.tsx` remained unmodified within plan scope.
- Placed the `Offline / Travel Mode` `ToggleField` inside the QAM `Controls & Settings` panel in `src/index.tsx` with optimistic UI update and rollback on RPC failure.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 28 (`CDP-01`, `CDP-02`, `JAM-01`) is complete across backend, tab components, `DeckifyExpandedModal.tsx`, and `src/index.tsx`
- Ready for Phase 28 verification and Phase 29 (`TvSplitView` reusing `<JamQrCard>` / `<JamQrModal>`)

## Self-Check: PASSED
- `src/components/DeckifyExpandedModal.tsx`: FOUND
- `src/index.tsx`: FOUND
- Commit `edc9e4c`: FOUND (`git merge-base --is-ancestor edc9e4c HEAD` = 0)
- Commit `365f692`: FOUND (`git merge-base --is-ancestor 365f692 HEAD` = 0)
- Verification suite: `tsc --noEmit` (0), `eslint src/` (0), `vitest run` (30 files, 382 tests passed), `rollup -c` (0), `py -3 -m unittest discover -s tests -p "test_*.py"` (747 tests OK)
