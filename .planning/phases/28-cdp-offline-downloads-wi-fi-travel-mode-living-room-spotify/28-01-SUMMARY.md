---
phase: 28-cdp-offline-downloads-wi-fi-travel-mode-living-room-spotify
plan: 01
subsystem: backend-cdp-storage
tags: [cdp, offline-downloads, statvfs, flatpak, spotify-jam, python]

requires:
  - phase: 26-unified-cdp-platform-bridge-deep-discovery-2-0
    provides: Unified `evaluate_with_registry` CDP evaluator and atomic cache pattern in `py_modules/cdp_bridge.py`
provides:
  - "`os.statvfs` non-root disk guardrail (`get_disk_free_bytes`, `check_disk_guardrail`, `clamp_offline_min_free_gb`) and offline/travel `DEFAULT_SETTINGS` keys in `py_modules/common.py`"
  - "`OfflineAPI` CDP probes (`cdp_set_offline_download`, `cdp_get_offline_status`, `cdp_get_offline_downloads_list`, `cdp_remove_all_offline_downloads`) and atomic `offline_downloads.json` cache in `py_modules/cdp_bridge.py`"
  - "`SocialConnectAPI` / `JamDevicesAPI` CDP probes (`cdp_start_spotify_jam`, `cdp_get_jam_status`, `cdp_end_spotify_jam`) in `py_modules/cdp_bridge.py`"
  - "Flatpak configurable offline storage path validation and `--user --filesystem=<abspath>` override (`validate_offline_storage_path`, `configure_offline_storage_path`) in `py_modules/engine.py`"
affects:
  - 28-02-PLAN.md
  - 28-03-PLAN.md
  - 28-04-PLAN.md

commits: 2
plan_head_before: 224a7dc
plan_head_after: 842a70f

tech-stack:
  added: []
  patterns:
    - "Non-root disk free space calculation via `os.statvfs(target).f_bavail * st.f_frsize` with `shutil.disk_usage` Windows fallback"
    - "Thread-safe atomic JSON cache updates via `threading.Lock` + `.tmp` + `os.replace` for `offline_downloads.json`"
    - "Scoped Flatpak filesystem override via `_build_deck_command` list-form `subprocess.run` without `shell=True`"

key-files:
  created:
    - tests/test_offline_downloads.py
  modified:
    - py_modules/common.py
    - py_modules/cdp_bridge.py
    - py_modules/engine.py
    - tests/test_cdp_bridge.py

key-decisions:
  - "Serialized `offline_downloads.json` read-modify-write operations under `_OFFLINE_CACHE_LOCK` with per-thread `.tmp` + `os.replace` to prevent concurrent corruption"
  - "Checked `check_disk_guardrail` before invoking CDP `OfflineAPI` download probes, returning `paused_low_space` when below `offline_min_free_gb`"

patterns-established:
  - "Disk guardrail: always use `st.f_bavail * st.f_frsize` on POSIX (never `st.f_bfree`) and clamp `offline_min_free_gb` to `[0.5, 50.0]`"
  - "Jam guest normalization: sort returned guest lists deterministically by `displayName`/`username`/`id`"

requirements-completed:
  - CDP-01
  - JAM-01

coverage:
  - id: D1
    description: "`get_disk_free_bytes`, `check_disk_guardrail`, `clamp_offline_min_free_gb`, and `DEFAULT_SETTINGS` offline/travel keys in `py_modules/common.py`"
    requirement: CDP-01
    verification:
      - kind: unit
        ref: "tests/test_offline_downloads.py#TestOfflineDownloads"
        status: pass
    human_judgment: false
  - id: D2
    description: "`OfflineAPI` CDP probes and atomic `offline_downloads.json` cache in `py_modules/cdp_bridge.py`"
    requirement: CDP-01
    verification:
      - kind: unit
        ref: "tests/test_offline_downloads.py#TestOfflineDownloads"
        status: pass
    human_judgment: false
  - id: D3
    description: "`validate_offline_storage_path` and `configure_offline_storage_path` with scoped Flatpak `--filesystem=` override in `py_modules/engine.py`"
    requirement: CDP-01
    verification:
      - kind: unit
        ref: "tests/test_offline_downloads.py#TestOfflineDownloads.test_validate_and_configure_offline_storage_path"
        status: pass
    human_judgment: false
  - id: D4
    description: "`SocialConnectAPI` / `JamDevicesAPI` CDP probes (`cdp_start_spotify_jam`, `cdp_get_jam_status`, `cdp_end_spotify_jam`) in `py_modules/cdp_bridge.py`"
    requirement: JAM-01
    verification:
      - kind: unit
        ref: "tests/test_cdp_bridge.py#TestCdpBridge.test_cdp_jam_session_lifecycle_and_deterministic_ordering"
        status: pass
    human_judgment: false

duration: 5min
completed: 2026-11-26
status: complete
---

# Phase 28 Plan 01: Backend Disk Guardrail, OfflineAPI & Jam CDP Probes Summary

**Implemented `os.statvfs` non-root disk guardrail (`3.0 GB` default), atomic `offline_downloads.json` cache, `OfflineAPI` and `SocialConnectAPI` CDP probes, and scoped Flatpak offline storage path configuration.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-11-26T10:18:53Z
- **Completed:** 2026-11-26T10:23:55Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Added `travel_mode_enabled`, `travel_mode_manual`, `travel_mode_auto_enabled`, `offline_min_free_gb` (`3.0`), and `offline_storage_path` to `DEFAULT_SETTINGS`, along with `clamp_offline_min_free_gb`, `get_disk_free_bytes`, and `check_disk_guardrail` in `py_modules/common.py`.
- Added `OFFLINE_DOWNLOADS_CACHE_FILE`, thread-safe atomic cache helpers, and `cdp_set_offline_download`, `cdp_get_offline_status`, `cdp_get_offline_downloads_list`, and `cdp_remove_all_offline_downloads` in `py_modules/cdp_bridge.py`.
- Added `validate_offline_storage_path` and `configure_offline_storage_path` in `py_modules/engine.py` using `_build_deck_command` list-form `flatpak override --user --filesystem=<abspath>` without `shell=True`.
- Added `cdp_start_spotify_jam`, `cdp_get_jam_status`, and `cdp_end_spotify_jam` in `py_modules/cdp_bridge.py` with deterministic guest ordering and clean offline fallbacks.

## Task Commits

Each task was committed atomically:

1. **Task 1: Disk guardrail (os.statvfs), DEFAULT_SETTINGS, OfflineAPI CDP probes & Wave 0 tests/test_offline_downloads.py** - `851b4b9` (feat)
2. **Task 2: Flatpak configurable offline storage path (py_modules/engine.py) & SocialConnectAPI Jam CDP probes (py_modules/cdp_bridge.py)** - `842a70f` (feat)

## Files Created/Modified
- `py_modules/common.py` - Added `DEFAULT_SETTINGS` offline/travel keys, `clamp_offline_min_free_gb`, `get_disk_free_bytes`, and `check_disk_guardrail`.
- `py_modules/cdp_bridge.py` - Added `OFFLINE_DOWNLOADS_CACHE_FILE`, atomic cache helpers, `OfflineAPI` probes, and `SocialConnectAPI`/`JamDevicesAPI` Jam probes.
- `py_modules/engine.py` - Added `validate_offline_storage_path`, `_update_spotify_prefs_offline_path`, and `configure_offline_storage_path`.
- `tests/test_offline_downloads.py` - Created Wave 0 unit tests for `CDP-01` disk guardrail, atomic cache, `OfflineAPI` probes, and Flatpak storage config.
- `tests/test_cdp_bridge.py` - Extended with `JAM-01` Jam lifecycle and deterministic guest ordering tests.

## Decisions Made
- Serialized `offline_downloads.json` read-modify-write updates under `_OFFLINE_CACHE_LOCK` with per-thread `.tmp` + `os.replace` to guarantee atomic updates under concurrent calls.
- Enforced `check_disk_guardrail` before `OfflineAPI` download initiation in `cdp_set_offline_download`, returning `paused_low_space` when free space is below `offline_min_free_gb`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Backend primitives for `CDP-01` and `JAM-01` are in place and unit-tested (20 targeted tests and 734 total Python tests passing).
- Ready for Plan 28-02 (`resilience.py` Wi-Fi Travel Mode auto-trigger, `rpc_library.py` Travel Mode filtering, and `main.py` RPC wiring).

## Self-Check: PASSED
- `py_modules/common.py`, `py_modules/cdp_bridge.py`, `py_modules/engine.py`, `tests/test_offline_downloads.py`, and `tests/test_cdp_bridge.py` verified present on disk.
- Commits `851b4b9` and `842a70f` verified in `git log`.
- `py -3 -m unittest tests/test_offline_downloads.py tests/test_cdp_bridge.py -q`: 20 tests passed.

---
*Phase: 28-cdp-offline-downloads-wi-fi-travel-mode-living-room-spotify*
*Completed: 2026-11-26*
