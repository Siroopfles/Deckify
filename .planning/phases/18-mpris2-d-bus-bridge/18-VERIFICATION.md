---
phase: 18-mpris2-d-bus-bridge
verified: 2026-11-18T16:39:00Z
status: human_needed
score: 13/13 must-haves verified
covered_files:
  - ".planning/phases/18-mpris2-d-bus-bridge/18-01-PLAN.md"
  - ".planning/phases/18-mpris2-d-bus-bridge/18-01-SUMMARY.md"
  - ".planning/phases/18-mpris2-d-bus-bridge/18-02-PLAN.md"
  - ".planning/phases/18-mpris2-d-bus-bridge/18-02-SUMMARY.md"
  - "main.py"
  - "py_modules/__init__.py"
  - "py_modules/common.py"
  - "py_modules/images.py"
  - "py_modules/mpris.py"
  - "py_modules/resilience.py"
  - "py_modules/rpc_playback.py"
  - "src/components/tabs/SettingsTab.test.tsx"
  - "src/components/tabs/SettingsTab.tsx"
  - "src/types.ts"
  - "tests/test_mpris.py"
covered_digest: "v4:sha256:aabf50693705e9968d2e6201bf007360bd1ce13b54ee45bf87f7cda46e1ead28"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "On a Steam Deck running SteamOS 3.5+ with a paired Bluetooth headset/earbuds, open Deckify Settings -> Bluetooth & Media Controls (MPRIS2) and verify the badge shows 'Active (Bluetooth Ready)' in green (#1db954)."
    expected: "org.mpris.MediaPlayer2.deckify is registered on /run/user/1000/bus, BlueZ mpris-proxy is running under UID 1000 (deck), and the SettingsTab badge displays 'Active (Bluetooth Ready)'."
    why_human: "Windows dev host lacks /run/user/1000/bus and BlueZ mpris-proxy; live SteamOS UID 1000 D-Bus socket and BlueZ AVRCP daemon cannot be exercised in unit tests."
  - test: "Press Play, Pause, Play/Pause, Next, and Previous buttons on the connected Bluetooth headset/earbuds, and check the headset/car display or playerctl metadata."
    expected: "Deckify playback responds immediately to each AVRCP button press, and connected Bluetooth devices/D-Bus controllers display current track title, artist, album, artwork, and playback status."
    why_human: "Physical Bluetooth AVRCP hardware interaction and live SteamOS GamepadUI UI rendering require on-device verification."
---

# Phase 18: MPRIS2 D-Bus Bridge Verification Report

**Phase Goal:** Bluetooth headsets and earbuds can control Deckify playback and display track metadata via standard MPRIS2 D-Bus media controls.
**Verified:** 2026-11-18T16:39:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Deckify registers `org.mpris.MediaPlayer2.deckify` on the `deck` (UID 1000) user session D-Bus without requiring C-extension D-Bus bindings (ROADMAP SC-1, 18-01 T-1) | ✓ VERIFIED | `py_modules/mpris.py` implements pure-Python `DbusMarshaller`/`DbusUnmarshaller` and `MprisDbusSession` over `asyncio` streams with UID 1000 `--worker` privilege drop and `env.pop("LD_LIBRARY_PATH", None)` at lines 1133, 1227, 1243; zero `dbus-python`/`PyGObject` imports. |
| 2 | Pressing Play, Pause, Play/Pause, Next, or Previous on connected Bluetooth headsets/earbuds (via BlueZ `mpris-proxy`) controls Deckify playback reliably (ROADMAP SC-2) | ✓ VERIFIED | `MprisDbusSession` + `MprisBridge.handle_dbus_command` dispatch all 9 `org.mpris.MediaPlayer2.Player` methods; verified end-to-end over in-memory streams in `tests/test_mpris.py` (11/11 passed). Hardware AVRCP routed to human verification. |
| 3 | Connected Bluetooth devices and D-Bus media controllers reflect current track title, artist, album, and playback status updates (ROADMAP SC-3) | ✓ VERIFIED | `build_mpris_metadata` + `MprisBridge.sync_from_plugin` populate `Metadata` and `PlaybackStatus` and emit `PropertiesChanged`; verified in `tests/test_mpris.py`. On-device Bluetooth display routed to human verification. |
| 4 | Full `org.mpris.MediaPlayer2` and `org.mpris.MediaPlayer2.Player` interfaces are exposed over D-Bus (methods, properties, `Seeked` signal) (18-01 T-2) | ✓ VERIFIED | `py_modules/mpris.py` (`INTROSPECT_XML` lines 66-150, `_handle_method_call` lines 800-968) implements all 9 methods, all required properties, and `Seeked(x)` signal; verified by `test_session_end_to_end_introspect_properties_methods_signals`. |
| 5 | Incoming D-Bus playback commands route through Deckify's central playback pipeline (`control_playback`, `seek_playback`, `play_tracks`, `set_shuffle`, `set_repeat`, `set_volume`) (18-01 T-3) | ✓ VERIFIED | `MprisBridge.handle_dbus_command` (`py_modules/mpris.py:1285-1356`) routes all commands through `self._plugin.*`; verified by `test_command_routing_and_open_uri_validation`. |
| 6 | Writing `Volume` (0.0..1.0) respects `VolumeFader._sleep_locked` and `is_ducked`, and writing `Shuffle`/`LoopStatus` updates state optimistically (18-01 T-4) | ✓ VERIFIED | `py_modules/mpris.py:1334-1356` guards `_sleep_locked`, recalculates ducked sink target via `_compute_target_sink_volume()` without clearing `_duck_reasons`, and updates `_shuffle_state`/`_repeat_state`; verified by `test_volume_fader_safe_coordination_and_mode_writes`. |
| 7 | `Metadata` publishes `mpris:trackid`, `mpris:length` (microseconds), `xesam:title`, `xesam:artist` (`list[str]`), `xesam:album`, and `mpris:artUrl` via `get_cached_image_file_uri` (18-01 T-5) | ✓ VERIFIED | `format_mpris_track_id` (`py_modules/mpris.py:153-160`), `build_mpris_metadata`, and `get_cached_image_file_uri` (`py_modules/images.py:124-138`) verified by `test_format_mpris_track_id_and_build_metadata` and `test_get_cached_image_file_uri_cached_and_fallback`. |
| 8 | `PropertiesChanged` emits strictly on actual state/metadata/volume/mode diffs (zero 1s timer), while `Position` computes dynamically on-demand (18-01 T-6) | ✓ VERIFIED | `MprisBridge.sync_from_plugin` (`py_modules/mpris.py:1384-1462`) diffs snapshot keys and includes Pitfall 3 enrichment guard; `get_current_position_ms` (`py_modules/mpris.py:1099-1103`) uses `time.monotonic()`; verified by `test_diff_gated_properties_changed_and_pitfall3_guard`. |
| 9 | `MprisBridge` detects existing BlueZ `mpris-proxy` under `deck`, auto-spawns only if missing and binary exists, and terminates only Deckify-managed child (18-01 T-7) | ✓ VERIFIED | `_ensure_mpris_proxy` and `_stop_mpris_proxy` (`py_modules/mpris.py:1220-1269`) verified by `test_mpris_proxy_supervision_external_vs_managed`. |
| 10 | `src/types.ts` defines `MprisBadgeState`, `MprisStatusInfo`, `EngineSettings.mpris_enabled`/`mpris_auto_proxy`, and `StatusResponse.mpris_status` (18-02 T-1) | ✓ VERIFIED | `src/types.ts:188-198, 268-269, 321`; `pnpm typecheck` exits 0. |
| 11 | `SettingsTab.tsx` renders `'Bluetooth & Media Controls (MPRIS2)'` card with `mpris_enabled` and conditional `mpris_auto_proxy` toggles (18-02 T-2) | ✓ VERIFIED | `src/components/tabs/SettingsTab.tsx:1038-1105`; verified by `SettingsTab.test.tsx`. |
| 12 | `SettingsTab.tsx` subscribes to `mpris_status` with cleanup and displays all 3 live status badges (18-02 T-3) | ✓ VERIFIED | `src/components/tabs/SettingsTab.tsx:224-235, 1047-1058`; verified by `SettingsTab.test.tsx` (32/32 tests pass). |
| 13 | All Phase 18 prohibitions hold (no C-ext D-Bus, no 1s timer, no `_sleep_locked` clobber, no external `mpris-proxy` kill, no listener leak, no `mpris_auto_proxy` when disabled) | ✓ VERIFIED | Verified by code inspection and unit tests across `py_modules/mpris.py` and `src/components/tabs/SettingsTab.tsx`. |

**Score:** 13/13 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `py_modules/mpris.py` | Pure-Python D-Bus codec, `MprisDbusSession`, `MprisBridge` | ✓ VERIFIED | 1,527 lines; exports all required symbols |
| `py_modules/images.py` | `get_cached_image_file_uri` helper | ✓ VERIFIED | Lines 124-138; returns `file://` if cached, else `https://` |
| `py_modules/common.py` | `mpris_enabled` & `mpris_auto_proxy` defaults/sanitization | ✓ VERIFIED | Lines 131-132, 314-315 |
| `main.py` | `MprisBridge` lifecycle, `get_mpris_status` RPC, `get_status`, `set_setting`, `_poll_playback` | ✓ VERIFIED | Lines 48, 123, 138, 171-186, 235-237, 577, 626-636, 691, 798-799, 1061-1064, 1579-1580, 1697-1698 |
| `tests/test_mpris.py` | Comprehensive backend unit tests | ✓ VERIFIED | 534 lines; 11/11 tests pass |
| `src/types.ts` | `MprisBadgeState`, `MprisStatusInfo`, settings & status types | ✓ VERIFIED | Lines 188-198, 268-269, 321 |
| `src/components/tabs/SettingsTab.tsx` | `Bluetooth & Media Controls (MPRIS2)` card & `mpris_status` listener | ✓ VERIFIED | Lines 5, 83-84, 218-235, 1038-1105 |
| `src/components/tabs/SettingsTab.test.tsx` | Vitest suite for MPRIS2 UI | ✓ VERIFIED | 32/32 tests pass |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `py_modules/resilience.py` | `py_modules/mpris.py` | `LibrespotEventServer.process_payload` -> `MprisBridge.on_onevent` | ✓ WIRED | `py_modules/resilience.py:368-371` |
| `main.py` | `py_modules/mpris.py` | `_poll_playback` -> `MprisBridge.sync_from_plugin` | ✓ WIRED | `main.py:1579-1580, 1697-1698` |
| `py_modules/mpris.py` | `py_modules/images.py` | `build_mpris_metadata` -> `get_cached_image_file_uri` | ✓ WIRED | `py_modules/mpris.py` imports `images` and calls `images.get_cached_image_file_uri` |
| `py_modules/mpris.py` | `py_modules/volume.py` | `handle_dbus_command` -> `VolumeFader._sleep_locked` & `is_ducked` | ✓ WIRED | `py_modules/mpris.py:1337-1344` |
| `py_modules/mpris.py` | `src/components/tabs/SettingsTab.tsx` | `decky.emit("mpris_status", ...)` -> `addEventListener("mpris_status")` | ✓ WIRED | `py_modules/mpris.py:1095` -> `SettingsTab.tsx:231` |
| `src/components/tabs/SettingsTab.tsx` | `main.py` | `updateSetting("mpris_enabled" / "mpris_auto_proxy", v)` | ✓ WIRED | `SettingsTab.tsx:1087, 1097` -> `main.py:691, 798-799` |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Python MPRIS2 codec, session, bridge & `main.py` integration tests | `py -3 -m unittest tests/test_mpris.py -v` | Ran 11 tests in 0.975s — OK | ✓ PASS |
| Frontend `SettingsTab` & `index` Vitest suites | `pnpm test -- --run src/components/tabs/SettingsTab.test.tsx src/index.test.tsx` | 2 test files, 47 tests passed | ✓ PASS |
| TypeScript typecheck & ESLint | `pnpm typecheck; pnpm lint` | `tsc --noEmit` exit 0; `eslint src/` exit 0 (0 errors) | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `MPRIS-01` | `18-01-PLAN.md`, `18-02-PLAN.md` | Deckify registers `org.mpris.MediaPlayer2.deckify` on `deck` (UID 1000) user D-Bus so Bluetooth headsets/earbuds (via BlueZ `mpris-proxy`) can control Play/Pause/Next/Previous and read current track metadata locally. | ✓ SATISFIED (automated); ? NEEDS HUMAN (on-device Bluetooth/SteamOS) | Automated D-Bus codec, session, `mpris-proxy` supervision, `main.py` wiring, and `SettingsTab` UI all verified; on-device Bluetooth headset test pending human verification. |

### Anti-Patterns Found

None. Scan for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER` across all Phase 18 files returned only a pre-existing HTML input `placeholder="..."` attribute at `main.py:1428`.

### Human Verification Required

### 1. On-Device SteamOS D-Bus Registration & BlueZ `mpris-proxy` Badge

**Test:** On a Steam Deck running SteamOS 3.5+ with a paired Bluetooth headset/earbuds, open Deckify Settings -> `Bluetooth & Media Controls (MPRIS2)` and check the status badge.
**Expected:** `org.mpris.MediaPlayer2.deckify` is registered on `/run/user/1000/bus`, BlueZ `mpris-proxy` is running under UID 1000 (`deck`), and the SettingsTab badge displays `Active (Bluetooth Ready)` in `#1db954` green.
**Why human:** Windows dev host lacks `/run/user/1000/bus` and BlueZ `mpris-proxy`; live SteamOS UID 1000 D-Bus socket and BlueZ AVRCP daemon cannot be exercised in unit tests.

### 2. Bluetooth Headset AVRCP Playback Control & Metadata Display

**Test:** Press Play, Pause, Play/Pause, Next, and Previous buttons on the connected Bluetooth headset/earbuds, and inspect track metadata on the connected Bluetooth device or via `playerctl --player=deckify metadata`.
**Expected:** Deckify playback responds immediately to each AVRCP button press, and connected Bluetooth devices/D-Bus controllers display current track title, artist, album, artwork, and playback status.
**Why human:** Physical Bluetooth AVRCP hardware interaction and live SteamOS GamepadUI UI rendering require on-device verification.

---

_Verified: 2026-11-18T16:39:00Z_
_Verifier: the agent (gsd-verifier)_
