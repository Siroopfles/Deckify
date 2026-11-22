---
phase: 22-spotify-connect-hub-2-0-native-crossfade
plan: 03
subsystem: connect-hub-ui
tags: [spotify-connect, dmi, sysfs, cef, truncation, deduplication]

requires:
  - phase: 22-spotify-connect-hub-2-0-native-crossfade
    provides: Spotify Connect Hub 2.0 backend RPCs and DevicesTab UI (22-01)
provides:
  - Host hardware platform detection (Steam Deck / Steam Machine / Local Device) via DMI and sysfs power_supply
  - Local device deduplication across hostname casing differences in DevicesTab
  - CEF-safe flex truncation on InteractiveRow and non-wrapping DeviceRow badges
affects: [22-UAT]

actuals:
  tokens: 6108
  tasks: 2
  commits: 2
plan_head_before: f3dc050a87ebf0ceda6de382ce290fcd83d983c7
plan_head_after: f6c0793d1c58606f126060304e71e674f8d0e0aa

tech-stack:
  added: []
  patterns:
    - "DMI + sysfs battery fallback hardware detection in py_modules/rpc_playback.py"
    - "Case-insensitive local Connect device matching against local_device_name, local_hostname, and 'deckify'"

key-files:
  created: []
  modified:
    - py_modules/rpc_playback.py
    - tests/test_connect_hub.py
    - src/types.ts
    - src/components/common/InteractiveRow.tsx
    - src/components/tabs/DevicesTab.tsx
    - src/components/tabs/DevicesTab.test.tsx

key-decisions:
  - "Default localHardwareLabel to 'Local Device' in DevicesTab when local_hardware_label is omitted so non-Deck hosts are never mislabeled"
  - "Move handleSelectDevice into useDevicesHub to keep DevicesTab within ESLint's 80-line max-lines-per-function limit"

patterns-established:
  - "InteractiveRow enforces minWidth: 0 and boxSizing: border-box for CEF flex-child ellipsis truncation"

requirements-completed: [CONNECT-01]

coverage:
  - id: D1
    description: "detect_host_hardware_label() detects Steam Deck / Steam Machine / Local Device from DMI & sysfs and get_devices() exposes local_hardware_label and local_hostname"
    requirement: CONNECT-01
    verification:
      - kind: unit
        ref: "tests/test_connect_hub.py#TestConnectHub"
        status: pass
    human_judgment: false
  - id: D2
    description: "DevicesTab renders dynamic hardware labels, deduplicates local device across hostname casing differences, and hardens InteractiveRow and DeviceRow badges for 40+ char names"
    requirement: CONNECT-01
    verification:
      - kind: unit
        ref: "src/components/tabs/DevicesTab.test.tsx#DevicesTab (Spotify Connect Hub 2.0)"
        status: pass
    human_judgment: false

duration: 4 min
completed: 2026-11-22
status: complete
---

# Phase 22 Plan 03: UAT Gap Closure (G-22-1 & G-22-2) Summary

**Hardware-aware Connect Hub labels (Steam Deck / Steam Machine / Local Device), case-insensitive local device deduplication, and CEF flex truncation hardening for 40+ character Connect device names**

## Performance

- **Duration:** 4 min
- **Started:** 2026-11-22T15:45:10Z
- **Completed:** 2026-11-22T15:49:35Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Added `detect_host_hardware_label()` in `py_modules/rpc_playback.py` reading DMI `product_name`/`board_name` and falling back to `read_power_supply_state()` so non-Deck desktops/Bazzite report `"Steam Machine"`, handhelds report `"Steam Deck"`, and battery laptops report `"Local Device"`.
- Exposed `local_hardware_label` and `local_hostname` from `get_devices()` and typed them on `DevicesResponse` in `src/types.ts`.
- Updated `DevicesTab.tsx` to replace hardcoded `"Steam Deck"` labels with dynamic `hardwareLabel`, deduplicate local devices against `local_device_name`, `local_hostname`, and `"deckify"` case-insensitively, and add `whiteSpace: "nowrap"` to `Fixed Volume` and `Active` badges.
- Added `minWidth: 0` and `boxSizing: "border-box"` to `InteractiveRow` in `src/components/common/InteractiveRow.tsx` so long Connect device names truncate cleanly with ellipsis in SteamOS CEF.

## Task Commits

Each task was committed atomically:

1. **Task 1: Detect host hardware label and expose local_hostname in get_devices()** - `3497e43` (feat)
2. **Task 2: Hardware-aware labels, local device deduplication, and CEF truncation hardening in DevicesTab** - `f6c0793` (feat)

## Files Created/Modified
- `py_modules/rpc_playback.py` - Added `_read_dmi_attr`, `detect_host_hardware_label`, and enriched `get_devices()` with `local_hardware_label` and `local_hostname`.
- `tests/test_connect_hub.py` - Added unit tests for DMI/sysfs hardware detection and `get_devices()` metadata.
- `src/types.ts` - Added `local_hostname?: string` and `local_hardware_label?: string` to `DevicesResponse`.
- `src/components/common/InteractiveRow.tsx` - Added `minWidth: 0` and `boxSizing: "border-box"` to root `Focusable` style.
- `src/components/tabs/DevicesTab.tsx` - Added hardware-aware labels, case-insensitive local device deduplication, `whiteSpace: "nowrap"` badges, and extracted `handleSelectDevice` into `useDevicesHub`.
- `src/components/tabs/DevicesTab.test.tsx` - Updated Steam Deck pull test with `local_hardware_label: "Steam Deck"` and added 3 tests for Steam Machine labels, casing deduplication, and 40+ char truncation/badge wrapping.

## Decisions Made
- Defaulted `localHardwareLabel` to `"Local Device"` when `local_hardware_label` is omitted in `DevicesResponse` so non-Deck hardware is never mislabeled as `"Steam Deck"`.
- Extracted `handleSelectDevice` into `useDevicesHub` so `DevicesTab` stays below ESLint's 80-line `max-lines-per-function` threshold with zero warnings.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- ESLint reported 2 pre-existing `@typescript-eslint/no-explicit-any` warnings on untouched lines 23 and 25 of `src/components/common/InteractiveRow.tsx` when running `eslint --max-warnings=0` directly on that file; `DevicesTab.tsx` and `src/types.ts` passed `eslint --max-warnings=0` cleanly, and `tsc --noEmit`, `pnpm test`, and `pnpm run build` all passed with 0 errors.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Gaps G-22-1 and G-22-2 are closed; ready for `22-04-PLAN.md` (G-22-3).

## Self-Check: PASSED

- `py_modules/rpc_playback.py`, `tests/test_connect_hub.py`, `src/types.ts`, `src/components/common/InteractiveRow.tsx`, `src/components/tabs/DevicesTab.tsx`, `src/components/tabs/DevicesTab.test.tsx` verified on disk.
- Commits `3497e43` and `f6c0793` verified as ancestors of `HEAD`.

---
*Phase: 22-spotify-connect-hub-2-0-native-crossfade*
*Completed: 2026-11-22*
