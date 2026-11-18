---
phase: 16-automatic-docked-audio-switching
plan: 02
subsystem: ui
tags: [react, typescript, decky-ui, pipewire, dock-switching, vitest]

# Dependency graph
requires:
  - phase: 16-automatic-docked-audio-switching
    provides: DockAudioSwitcher backend, dock_status in get_status(), dock_audio_switched events, and dock_* settings RPCs
provides:
  - DockStatusState, DockStatusInfo, EngineSettings.dock_*, and StatusResponse.dock_status TypeScript contracts
  - Global dock_audio_switched toast listener in src/index.tsx without adding QAM dock controls
  - Docked Audio-Switching card in SettingsTab.tsx with live status badge, 4 ToggleFields, Target Dock / DAC Sink selector, and empty-state guidance
  - 5 Vitest unit tests in SettingsTab.test.tsx covering status badges, Focusable column layout, sink selection, empty state, and event refresh
affects: [phase-16-verification]

actuals:
  tokens: 5514
  tasks: 2
  commits: 2
plan_head_before: d20d864eac21ac7dae0d63c7ee46804f49a83e5f
plan_head_after: 9a2d61e7951bb5edf56908969458a3b52ec47667
commits: 2

tech-stack:
  added: []
  patterns:
    - "Global dock_audio_switched toast listener in src/index.tsx paired with toast-free status/sink refresh listener in SettingsTab.tsx"
    - "Vertical Focusable flow-children='column' wrapper for ToggleField and InteractiveRow stacks in SettingsTab.tsx"

key-files:
  created: []
  modified:
    - src/types.ts
    - src/index.tsx
    - src/components/tabs/SettingsTab.tsx
    - src/components/tabs/SettingsTab.test.tsx

key-decisions:
  - "Checked both event payload toast_enabled and dockToastEnabledRef.current in src/index.tsx so dock_audio_switched toasts respect user preference immediately."
  - "Rendered the Docked Audio-Switching card unconditionally adjacent to Audio Output Sink (PipeWire) so users can configure hotplug monitoring even before connecting a dock or DAC."

patterns-established:
  - "SettingsTab.tsx refreshes both loadAudioSinks() and refreshStatus() on manual sink click and dock_audio_switched events so Manual Override badges update immediately."

requirements-completed: [DOCK-01, DOCK-02]

coverage:
  - id: D1
    description: "TypeScript types (DockStatusState, DockStatusInfo, EngineSettings.dock_*, StatusResponse.dock_status) and global dock_audio_switched toast listener in src/index.tsx"
    requirement: DOCK-01
    verification:
      - kind: other
        ref: "pnpm typecheck && pnpm lint"
        status: pass
    human_judgment: false
  - id: D2
    description: "SettingsTab Docked Audio-Switching card with live status badge, 4 ToggleFields in Focusable flow-children='column', Target Dock / DAC Sink selector, empty-state guidance, and toast-free refresh listener"
    requirement: DOCK-02
    verification:
      - kind: unit
        ref: "src/components/tabs/SettingsTab.test.tsx#SettingsTab Docked Audio-Switching (Phase 16)"
        status: pass
    human_judgment: false

duration: 4 min
completed: 2026-11-17
status: complete
---

# Phase 16 Plan 02: Docked Audio-Switching Frontend UI & Toasts Summary

**TypeScript `DockStatusInfo` contracts, global `dock_audio_switched` Decky toast listener in `src/index.tsx`, and `"Docked Audio-Switching"` configuration card in `SettingsTab.tsx` with 5 Vitest unit tests**

## Performance

- **Duration:** 4 min
- **Started:** 2026-11-17T16:17:23Z
- **Completed:** 2026-11-17T16:21:08Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Added `DockStatusState`, `DockStatusInfo`, `EngineSettings.dock_*` fields, and `StatusResponse.dock_status` to `src/types.ts`, and wired a single global `dock_audio_switched` Decky toast listener in `src/index.tsx` while keeping QAM compact.
- Built the `"Docked Audio-Switching"` card in `src/components/tabs/SettingsTab.tsx` adjacent to `"Audio Output Sink (PipeWire)"` with live status badge (`Disabled`, `Docked: {label}`, `Bluetooth Held`, `Manual Override`, `Monitoring`), 4 `ToggleField`s inside `<Focusable flow-children="column">`, `Target Dock / DAC Sink` `InteractiveRow` list (`Auto (USB-DAC / HDMI)` first), empty-state guidance, and a toast-free `dock_audio_switched` refresh listener.
- Added 5 Vitest unit tests in `src/components/tabs/SettingsTab.test.tsx` (all 24 tests in `SettingsTab.test.tsx` and all 164 tests across 16 Vitest files pass, along with `tsc --noEmit`, `eslint src/`, and `rollup -c`).

## Task Commits

Each task was committed atomically:

1. **Task 1: Add DockStatusInfo types to src/types.ts and global dock_audio_switched toast listener to src/index.tsx** - `b9a3971` (feat)
2. **Task 2: Add "Docked Audio-Switching" card in SettingsTab.tsx and unit tests in SettingsTab.test.tsx** - `9a2d61e` (feat)

## Files Created/Modified
- `src/types.ts` - Exported `DockStatusState`, `DockStatusInfo`, `EngineSettings.dock_*`, and `StatusResponse.dock_status`.
- `src/index.tsx` - Subscribed to `dock_audio_switched` for single Decky toast notifications with cleanup on unmount.
- `src/components/tabs/SettingsTab.tsx` - Rendered `"Docked Audio-Switching"` card with live status badge, 4 toggles, `Target Dock / DAC Sink` selector, empty-state guidance, and `dock_audio_switched` refresh listener.
- `src/components/tabs/SettingsTab.test.tsx` - Added 5 unit tests covering status badges, Focusable column layout, sink selection, empty state, and duplicate-toast-free event refresh.

## Decisions Made
- Checked both `data.toast_enabled` and `dockToastEnabledRef.current` in `src/index.tsx` so toast suppression reflects user settings immediately.
- Rendered the `"Docked Audio-Switching"` card unconditionally adjacent to `"Audio Output Sink (PipeWire)"` so users can enable hotplug monitoring before connecting a dock or DAC.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 16 (Plans 16-01 and 16-02) is complete and ready for phase verification.

## Self-Check: PASSED
- `src/types.ts`, `src/index.tsx`, `src/components/tabs/SettingsTab.tsx`, `src/components/tabs/SettingsTab.test.tsx` verified on disk.
- Commits `b9a3971` and `9a2d61e` verified in git history (`d20d864..HEAD`, 2 commits).
- Full frontend test suite (164 tests across 16 files), `pnpm typecheck`, `pnpm lint`, and `pnpm build` passed on final commit.

---
*Phase: 16-automatic-docked-audio-switching*
*Completed: 2026-11-17*
