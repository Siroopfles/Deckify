---
phase: 18-mpris2-d-bus-bridge
plan: 01
subsystem: infra
tags: [dbus, mpris2, bluez, mpris-proxy, bluetooth, python, asyncio]

# Dependency graph
requires:
  - phase: 17-playback-resilience-event-driven-sync
    provides: LibrespotEventServer --onevent push pipeline and normalize_spotify_id helper
provides:
  - Pure-Python Little-Endian D-Bus wire-protocol codec (DbusMarshaller, DbusUnmarshaller, pack/unpack)
  - MprisDbusSession exporting org.mpris.MediaPlayer2.deckify at /org/mpris/MediaPlayer2
  - MprisBridge with UID 1000 --worker privilege drop, BlueZ mpris-proxy auto-supervision, VolumeFader-safe property writes, and diff-gated PropertiesChanged
  - Local file:// cached artwork resolution (get_cached_image_file_uri) with instant HTTPS fallback
  - Plugin.get_mpris_status RPC and mpris_status in get_status
affects: [18-02-mpris2-settings-ui, bluetooth-media-controls]

actuals:
  tokens: 25141
  tasks: 2
  commits: 2
  plan_head_before: cbc0d311959a9ff82d729d6f4a30358d526016ea
  plan_head_after: 4317f80d927ae36728bd683d74dc49fe7cb9b2ca

tech-stack:
  added: []
  patterns:
    - "Pure-Python stdlib D-Bus wire codec over asyncio StreamReader/StreamWriter without C-extension dependencies"
    - "UID 1000 --worker subprocess JSON-line bridge when main.py runs as root, with LD_LIBRARY_PATH stripped"
    - "Diff-gated PropertiesChanged emissions with Pitfall 3 enrichment guard and dynamic monotonic Position"

key-files:
  created:
    - py_modules/mpris.py
    - tests/test_mpris.py
  modified:
    - py_modules/common.py
    - py_modules/images.py
    - py_modules/__init__.py
    - py_modules/resilience.py
    - py_modules/rpc_playback.py
    - main.py

key-decisions:
  - "Implemented pure-Python D-Bus wire-protocol marshaller/unmarshaller (Little-Endian) and SASL EXTERNAL session rather than requiring dbus-python/PyGObject C-extensions"
  - "Guarded Metadata updates during the 400ms librespot --onevent enrichment window so MPRIS2 never publishes stale metadata for a newly-started track"
  - "Supervised BlueZ mpris-proxy strictly when not already running under UID 1000 and terminated only Deckify-spawned child processes"

patterns-established:
  - "D-Bus 8-byte alignment after 4-byte array lengths for a{sv} and a(yv) even when empty"
  - "MPRIS2 Volume writes respect VolumeFader._sleep_locked and recalculate ducked sink targets without clearing _duck_reasons"

requirements-completed: [MPRIS-01]

coverage:
  - id: D1
    description: "Pure-Python D-Bus wire codec, SASL EXTERNAL auth, and complete org.mpris.MediaPlayer2 / Player interfaces"
    requirement: "MPRIS-01"
    verification:
      - kind: unit
        ref: "tests/test_mpris.py#TestDbusCodecAndMetadata,TestMprisDbusSessionProtocol"
        status: pass
    human_judgment: false
  - id: D2
    description: "Local file:// cached artwork resolution via get_cached_image_file_uri with HTTPS fallback"
    requirement: "MPRIS-01"
    verification:
      - kind: unit
        ref: "tests/test_mpris.py#test_get_cached_image_file_uri_cached_and_fallback"
        status: pass
    human_judgment: false
  - id: D3
    description: "MprisBridge command routing, VolumeFader-safe Volume/Shuffle/LoopStatus writes, diff-gated PropertiesChanged, and BlueZ mpris-proxy supervision"
    requirement: "MPRIS-01"
    verification:
      - kind: unit
        ref: "tests/test_mpris.py#TestMprisBridgeIntegration"
        status: pass
    human_judgment: false

duration: 7min
completed: 2026-11-18
status: complete
---

# Phase 18 Plan 01: MPRIS2 D-Bus Bridge Summary

**Pure-Python MPRIS2 D-Bus bridge (`org.mpris.MediaPlayer2.deckify`) with local `file://` cover art resolution, `VolumeFader`-safe property writes, diff-gated `PropertiesChanged` / `Seeked` signals, and UID 1000 `mpris-proxy` supervision**

## Performance

- **Duration:** 7 min
- **Started:** 2026-11-18T16:23:21Z
- **Completed:** 2026-11-18T16:30:02Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Built a pure-Python stdlib Little-Endian D-Bus wire-protocol codec (`DbusMarshaller`, `DbusUnmarshaller`, `pack_dbus_message`, `unpack_dbus_message`) and `MprisDbusSession` implementing `org.freedesktop.DBus.Peer`, `Introspectable`, `Properties`, `org.mpris.MediaPlayer2`, and `org.mpris.MediaPlayer2.Player` (all 9 methods, all properties including dynamic monotonic `Position`, and `PropertiesChanged` / `Seeked` signals).
- Added `get_cached_image_file_uri` in `py_modules/images.py` to resolve cached Spotify album art from `IMAGE_CACHE_DIR` as `file://` URIs with instant `https://` fallback, and `mpris_enabled` / `mpris_auto_proxy` settings in `py_modules/common.py`.
- Implemented `MprisBridge` with UID 1000 `--worker` subprocess isolation, BlueZ `mpris-proxy` detection and managed lifecycle, `VolumeFader`-safe `Volume` / `Shuffle` / `LoopStatus` writes, and diff-gated `PropertiesChanged` wired into `main.py`, `py_modules/resilience.py`, and `py_modules/rpc_playback.py`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Pure-Python D-Bus wire-protocol engine, MPRIS2 interfaces, local file:// artUrl helper, and Wave 0 unit tests** - `de26ff7` (feat)
2. **Task 2: MprisBridge lifecycle, BlueZ mpris-proxy supervision, VolumeFader-safe routing, and main.py / resilience / rpc_playback integration** - `4317f80` (feat)

## Files Created/Modified
- `py_modules/mpris.py` - Pure-Python D-Bus wire codec, `MprisDbusSession`, `MprisBridge`, and UID 1000 `--worker` entrypoint
- `py_modules/common.py` - Added `mpris_enabled` and `mpris_auto_proxy` defaults and boolean sanitization
- `py_modules/images.py` - Added `get_cached_image_file_uri` for local `file://` artwork URIs
- `py_modules/__init__.py` - Exported `get_cached_image_file_uri` and `mpris`
- `py_modules/resilience.py` - Wired `LibrespotEventServer.process_payload` to `MprisBridge.on_onevent`
- `py_modules/rpc_playback.py` - Wired `control_playback`, `seek_playback`, `set_shuffle`, and `set_repeat` to `MprisBridge`
- `main.py` - Wired `MprisBridge` lifecycle, `get_mpris_status` RPC, `get_status()["mpris_status"]`, `set_setting` notifications, and `_poll_playback` sync
- `tests/test_mpris.py` - 11 comprehensive unit tests covering D-Bus wire codec, session protocol, `VolumeFader` safety, diff-gated `PropertiesChanged`, `mpris-proxy` supervision, and `main.py` integration

## Decisions Made
- Implemented a pure-Python stdlib D-Bus wire-protocol engine rather than depending on `dbus-python` or `PyGObject`, avoiding C-extension and `LD_LIBRARY_PATH` conflicts in Decky Loader.
- Added a Pitfall 3 enrichment guard in `MprisBridge.sync_from_plugin()` so `Metadata` retains the previous value during the 400ms `--onevent` Web API enrichment window until `_track_meta` matches the new track ID.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Backend MPRIS2 D-Bus bridge, `get_mpris_status` RPC, `mpris_status` push events, and `mpris_enabled` / `mpris_auto_proxy` settings are ready for Plan 18-02 (SettingsTab MPRIS2 Bluetooth Media Controls UI).

## Self-Check: PASSED
- Created/modified files verified on disk (`py_modules/mpris.py`, `tests/test_mpris.py`, `py_modules/common.py`, `py_modules/images.py`, `py_modules/__init__.py`, `py_modules/resilience.py`, `py_modules/rpc_playback.py`, `main.py`).
- Commits `de26ff7` and `4317f80` verified in git history.
- All 543 Python unit tests (`py -3 -m unittest discover -s tests -p "test_*.py"`) and all 11 MPRIS tests (`py -3 -m unittest tests/test_mpris.py -v`) pass.

---
*Phase: 18-mpris2-d-bus-bridge*
*Completed: 2026-11-18*
