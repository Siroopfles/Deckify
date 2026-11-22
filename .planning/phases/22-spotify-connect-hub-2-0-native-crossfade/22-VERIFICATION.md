---
phase: 22-spotify-connect-hub-2-0-native-crossfade
verified: 2026-11-22T16:33:15Z
status: passed
score: 21/23 must-haves verified
covered_files:
  - ".planning/phases/22-spotify-connect-hub-2-0-native-crossfade/22-01-PLAN.md"
  - ".planning/phases/22-spotify-connect-hub-2-0-native-crossfade/22-01-SUMMARY.md"
  - ".planning/phases/22-spotify-connect-hub-2-0-native-crossfade/22-02-PLAN.md"
  - ".planning/phases/22-spotify-connect-hub-2-0-native-crossfade/22-02-SUMMARY.md"
  - ".planning/phases/22-spotify-connect-hub-2-0-native-crossfade/22-03-PLAN.md"
  - ".planning/phases/22-spotify-connect-hub-2-0-native-crossfade/22-03-SUMMARY.md"
  - ".planning/phases/22-spotify-connect-hub-2-0-native-crossfade/22-04-PLAN.md"
  - ".planning/phases/22-spotify-connect-hub-2-0-native-crossfade/22-04-SUMMARY.md"
  - ".planning/phases/22-spotify-connect-hub-2-0-native-crossfade/22-05-PLAN.md"
  - ".planning/phases/22-spotify-connect-hub-2-0-native-crossfade/22-05-SUMMARY.md"
  - "main.py"
  - "py_modules/common.py"
  - "py_modules/eco.py"
  - "py_modules/engine.py"
  - "py_modules/rpc_playback.py"
  - "py_modules/volume.py"
  - "src/components/common/InteractiveRow.tsx"
  - "src/components/tabs/DevicesTab.test.tsx"
  - "src/components/tabs/DevicesTab.tsx"
  - "src/components/tabs/SettingsTab.test.tsx"
  - "src/components/tabs/SettingsTab.tsx"
  - "src/types.ts"
  - "tests/test_connect_hub.py"
  - "tests/test_crossfade.py"
  - "tests/test_eco.py"
covered_digest: "v4:sha256:dba4479af0f0926f7585e112ae2ae94d30ff4bf24b5976b17cac06020af5a2d5"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 18/20
  gaps_closed:
    - "G-22-1: Hardware-aware Connect Hub labels (Steam Deck / Steam Machine / Local Device) via DMI & sysfs"
    - "G-22-2: Case-insensitive local device deduplication & CEF 40+ char ellipsis/badge hardening"
    - "G-22-3: Removed jarring librespot PipeWire dip-to-silence fallback and scoped CrossfadeSettingRow to spotify_client"
    - "G-22-4: Ignore scope=='Device' peripheral batteries in read_power_supply_state() and match 'fremont' DMI codename in detect_host_hardware_label()"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Open DevicesTab in SteamOS GamepadUI with a long Spotify Connect device name (e.g., 40+ characters) and Active / Fixed Volume badges."
    expected: "Device name truncates cleanly with ellipsis; right-aligned Active and Fixed Volume badges never wrap or clip."
    why_human: "Marked verification: backstop in 22-01-PLAN.md and 22-UI-SPEC.md; CSS textOverflow/minWidth layout rendering in SteamOS CEF cannot be proven by unit tests alone."
  - test: "Populate DevicesTab with multiple Spotify Connect devices inside DeckifyExpandedModal and navigate up/down using the Steam Deck D-pad."
    expected: "Device list scrolls inside DeckifyExpandedModal contentPaneRef while preserving flow-children='column' D-pad focus navigation without focus traps."
    why_human: "Marked verification: backstop in 22-01-PLAN.md and 22-UI-SPEC.md; SteamOS GamepadUI spatial focus navigation and scroll container behavior require live hardware/CEF verification."
  - test: "With Eco-Mode having put librespot to sleep and Spotify playing on an external device (e.g., Phone/Desktop), press 'Pull Playback to <Hardware>' in DevicesTab, then adjust Remote Volume on an external speaker."
    expected: "Local engine wakes, registers on Spotify Connect, transfers playback with play=true, and remote volume slider updates external speaker volume without duplicating the local device row (and displays 'Steam Machine' on Fremont/desktop with wireless peripheral batteries)."
    why_human: "End-to-end Spotify Connect registration timing, PowerGovernor wake, Fremont/sysfs hardware environment, and real Spotify Web API volume calls require live Spotify Premium account and Steam Deck / Steam Machine runtime."
  - test: "Set Crossfade to 6s in SettingsTab on Official Spotify Client (CDP port 9229) and also verify SettingsTab while on librespot."
    expected: "Official Spotify Client enables the Crossfade slider and applies live crossfade via SettingsAPI/prefs; librespot disables the slider with a clear explanation and never dips track transitions to silence."
    why_human: "Live CDP SettingsAPI mutation on Official Spotify Client and audible transition quality require live SteamOS runtime."
---

# Phase 22: Spotify Connect Hub 2.0 & Native Crossfade Verification Report

**Phase Goal:** Users can inspect active playback engines and device types, pull playback from any external device to the Steam Deck with a single auto-waking action, control remote Connect volume, and configure native track crossfade.
**Verified:** 2026-11-22T16:33:15Z
**Status:** human_needed
**Re-verification:** Yes — re-run after gap-closure plan `22-05` (G-22-4), following `22-03` (G-22-1, G-22-2) and `22-04` (G-22-3)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `get_devices` returns Spotify Connect devices enriched with `local_device_name`, `audio_backend`, `engine_running`, `engine_sleeping`, `local_hostname`, and `local_hardware_label` metadata. | ✓ VERIFIED | `py_modules/rpc_playback.py` (`get_devices`, `detect_host_hardware_label`) returns all 6 fields; `tests/test_connect_hub.py` passes (9/9). |
| 2 | `pull_playback_to_deck` wakes a sleeping or stopped local Deckify engine, polls `get_devices` until the local device registers, and transfers playback with `play: True`. | ✓ VERIFIED | `py_modules/rpc_playback.py` wakes `PowerGovernor` or starts `start_spotify_client`/`start_librespot`, polls up to 10x, issues `PUT me/player` with `play: True`; `tests/test_connect_hub.py` passes. |
| 3 | `set_device_volume` clamps `volume_percent` to `0..100`, encodes `device_id` safely via `urllib.parse.urlencode`, and calls `PUT /v1/me/player/volume`. | ✓ VERIFIED | `py_modules/volume.py` rejects `bool`, clamps `0..100`, passes `params` to `_spotify_api_request`; `tests/test_connect_hub.py` passes. |
| 4 | `DevicesTab` renders a pinned local status card (`LocalDeckStatusCard`) with `FaGamepad`, inline engine pill badge (`librespot`, `spotifyd`, or `Spotify Client`), and a manual `Refresh` button. | ✓ VERIFIED | `src/components/tabs/DevicesTab.tsx`; `src/components/tabs/DevicesTab.test.tsx` (8/8 passed). |
| 5 | `DevicesTab` renders distinct `react-icons/fa` device type icons per Connect device row and shows the 1-click `'Pull Playback to {hardwareLabel}'` CTA when playback is active externally or the local engine is stopped/sleeping. | ✓ VERIFIED | `src/components/tabs/DevicesTab.tsx` (updated in `22-03` from hardcoded `"Steam Deck"` to dynamic `hardwareLabel`); `src/components/tabs/DevicesTab.test.tsx` passes. |
| 6 | `DevicesTab` renders a `300ms`-debounced Remote Volume `SliderField` (`0-100%`) for adjustable devices and a `'Fixed Volume'` badge when `volume_percent` is `null`, `is_restricted` is `true`, or `supports_volume` is `false`. | ✓ VERIFIED | `src/components/tabs/DevicesTab.tsx` (`useDebouncedDeviceVolume`, `canControlVolume`); `src/components/tabs/DevicesTab.test.tsx` passes. |
| 7 | Empty `get_devices` response renders `'No Spotify Connect Devices Found'` card with `'Wake Local Engine'` and `'Refresh'` actions; failed RPCs surface error copy via `showToast` and revert optimistic volume state. | ✓ VERIFIED | `src/components/tabs/DevicesTab.tsx`; `src/components/tabs/DevicesTab.test.tsx` passes. |
| 8 | Long Connect device names truncate with `textOverflow: ellipsis` and `minWidth: 0` so right-aligned `Active` / `Fixed Volume` badges never wrap or clip. (`verification: backstop`) | ⚠️ `insufficient_spec` | CSS properties (`minWidth: 0`, `boxSizing: "border-box"` in `InteractiveRow.tsx`; `textOverflow: "ellipsis"`, `whiteSpace: "nowrap"` badges in `DevicesTab.tsx`) verified in code and unit tests, but `backstop` truth requires live SteamOS CEF visual verification. |
| 9 | Device list scrolls inside `DeckifyExpandedModal` `contentPaneRef` while preserving `flow-children='column'` D-pad focus navigation. (`verification: backstop`) | ⚠️ `insufficient_spec` | `<Focusable flow-children="column">` is present in `DevicesTab.tsx`, but `backstop` truth requires live SteamOS GamepadUI D-pad navigation verification. |
| 10 | `crossfade_seconds` (default `0`, range `0..12`) persists in `settings.json` across restarts and is exposed in `get_status().settings`. | ✓ VERIFIED | `py_modules/common.py` (`crossfade_seconds` preserved and validated/clamped in `_load_settings`); `main.py` (`public_keys`); `tests/test_crossfade.py` passes (5/5). |
| 11 | `set_setting('crossfade_seconds', val)` rejects booleans, clamps integers to `0..12`, persists atomically, and triggers crossfade sync. | ✓ VERIFIED | `main.py`; `tests/test_crossfade.py` passes. |
| 12 | `_update_spotify_prefs_content` writes `audio.crossfade_v2` and `audio.crossfade.time_v2` (ms), and `_sync_spotify_client_crossfade_cdp` applies live `SettingsAPI` updates on CDP port `9229` when `spotify_client` is active. | ✓ VERIFIED | `py_modules/engine.py` and `main.py`; `tests/test_crossfade.py` passes. |
| 13 | `VolumeFader` provides `trigger_crossfade_out` and `trigger_crossfade_in` that strictly respect `_sleep_locked` and restore to `_compute_target_sink_volume()`. | ✓ VERIFIED | `py_modules/volume.py`; `tests/test_crossfade.py` passes. |
| 14 | `SettingsTab` renders `CrossfadeSettingRow` (`0-12s`, step `1`, `0s = Off`) inside `Playback & Audiophile Features` that debounces `set_setting('crossfade_seconds', val)` by `300ms` and shows error toast on save error. | ✓ VERIFIED | `src/components/tabs/SettingsTab.tsx`; `src/components/tabs/SettingsTab.test.tsx` (44/44 passed). |
| 15 | *(22-03)* Local hardware label in `DevicesTab` reflects actual host hardware (`Steam Machine` on non-Deck hosts, `Steam Deck` on Jupiter/Galileo, `Local Device` on battery laptops) instead of hardcoded `'Steam Deck'` strings. | ✓ VERIFIED | `py_modules/rpc_playback.py:detect_host_hardware_label`, `src/components/tabs/DevicesTab.tsx`; verified by `tests/test_connect_hub.py` and `DevicesTab.test.tsx`. |
| 16 | *(22-03)* Local device appears only once in `DevicesTab` (via `LocalDeckStatusCard`) and is deduplicated/filtered out of the remote `DeviceRow` list regardless of hostname capitalization. | ✓ VERIFIED | `DevicesTab.tsx` (`isLocalDevice` + `remoteDevices` filter); verified by `DevicesTab.test.tsx`. |
| 17 | *(22-03)* Device rows with 40+ character Connect device names truncate cleanly with ellipsis while `Fixed Volume` and `Active` badges keep `whiteSpace: nowrap` and `InteractiveRow` enforces `minWidth: 0` / `boxSizing: border-box`. | ✓ VERIFIED | `src/components/common/InteractiveRow.tsx` (`minWidth: 0`, `boxSizing: "border-box"`), `src/components/tabs/DevicesTab.tsx`; verified by `DevicesTab.test.tsx`. |
| 18 | *(22-04)* `librespot` track transitions are never unexpectedly muted or dipped to silence by `_maybe_trigger_local_crossfade` (retaining stale `_crossfade_active` recovery guard). | ✓ VERIFIED | `main.py:_maybe_trigger_local_crossfade`; verified by `tests/test_crossfade.py#test_maybe_trigger_local_crossfade_never_ducks_librespot`. |
| 19 | *(22-04)* `CrossfadeSettingRow` in `SettingsTab` is enabled when `audio_backend` is `'spotify_client'` and disabled with a clear explanation when `audio_backend` is `'librespot'`. | ✓ VERIFIED | `src/components/tabs/SettingsTab.tsx` (`isSpotifyClient`, `disabled={!isSpotifyClient}`, `opacity: 0.6`, early-return `onChange`); verified by `SettingsTab.test.tsx` (44/44). |
| 20 | *(22-04)* Setting Crossfade (`0-12s`) when Official Spotify Client is active continues to persist `crossfade_seconds` and sync via Flatpak prefs and CDP port `9229`. | ✓ VERIFIED | `main.py`, `py_modules/engine.py`; verified by `tests/test_crossfade.py#test_set_setting_crossfade_validation_clamping_and_spotify_client_sync`. |
| 21 | *(22-05)* `read_power_supply_state` in `py_modules/eco.py` skips entries where `scope == 'Device'` so wireless peripheral batteries never count toward `(has_battery, on_battery)`. | ✓ VERIFIED | `py_modules/eco.py:42-44` skips `scope == "Device"` while preserving `System` and missing-scope entries; `tests/test_eco.py#TestReadPowerSupplyState` passes (6/6). |
| 22 | *(22-05)* `detect_host_hardware_label` in `py_modules/rpc_playback.py` matches `'fremont'` (Valve Steam Machine DMI codename) alongside `'steam machine'` and returns `'Steam Machine'`. | ✓ VERIFIED | `py_modules/rpc_playback.py:479` matches `("steam machine", "fremont")`; `tests/test_connect_hub.py#test_detect_host_hardware_label_fremont_dmi_and_peripheral_battery` passes. |
| 23 | *(22-05)* On a Steam Machine (Fremont DMI) or desktop host with wireless peripheral batteries (`scope='Device'`), `detect_host_hardware_label()` returns `'Steam Machine'` and `PowerGovernor` reports `has_battery=False`. | ✓ VERIFIED | `py_modules/rpc_playback.py:479-487`, `py_modules/eco.py:42-44`; verified by `tests/test_eco.py` (15/15) and `tests/test_connect_hub.py` (9/9). |

**Score:** 21/23 truths verified (2 `backstop` truths routed to human verification)

### Advisory (New Scope, Unevidenced)

None.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `py_modules/eco.py` | `read_power_supply_state()` filtering out `scope == 'Device'` peripheral batteries | ✓ VERIFIED | Exists, substantive, wired to `PowerGovernor` and `rpc_playback.py:detect_host_hardware_label` (`verify.artifacts` on `22-05-PLAN.md`: 4/4 passed). |
| `py_modules/rpc_playback.py` | Enriched `get_devices`, `detect_host_hardware_label` (incl. `'fremont'`), and auto-waking `pull_playback_to_deck` | ✓ VERIFIED | Exists, substantive, wired to `main.py`, `PowerGovernor.wake_for_playback()`, and `read_power_supply_state()` (`verify.artifacts` on 22-01, 22-03, 22-05: passed). |
| `py_modules/volume.py` | `set_device_volume` + `VolumeFader.trigger_crossfade_out/in` | ✓ VERIFIED | Exists, substantive, wired to `main.py` (`verify.artifacts`: passed). |
| `py_modules/common.py` | `DEFAULT_SETTINGS['crossfade_seconds'] = 0` & preserved/validated in `_load_settings` | ✓ VERIFIED | Exists, substantive, wired to `main.py` (`verify.artifacts`: passed). |
| `py_modules/engine.py` | `_update_spotify_prefs_content` with `audio.crossfade_v2` & `audio.crossfade.time_v2` | ✓ VERIFIED | Exists, substantive, wired to `main.py:_write_spotify_client_prefs` (`verify.artifacts`: passed). |
| `main.py` | RPC wrappers, validation, CDP sync, `_maybe_trigger_local_crossfade` recovery guard | ✓ VERIFIED | Exists, substantive, wired to frontend `callable`s and backend modules (`verify.artifacts`: passed). |
| `src/types.ts` | `SpotifyDevice.is_restricted`, `supports_volume`, `DevicesResponse` (`local_hostname`, `local_hardware_label`), `EngineSettings.crossfade_seconds` | ✓ VERIFIED | Exists, substantive, 0 ESLint warnings (`verify.artifacts`: passed). |
| `src/components/common/InteractiveRow.tsx` | `minWidth: 0` and `boxSizing: border-box` on row container | ✓ VERIFIED | Exists, substantive, wired to `DevicesTab.tsx` (`verify.artifacts` on 22-03: passed). |
| `src/components/tabs/DevicesTab.tsx` | Spotify Connect Hub 2.0 UI with hardware-aware labels & deduplication | ✓ VERIFIED | Exists, substantive, wired to backend RPCs, 0 ESLint warnings (`22-03` `verify.artifacts`: passed). |
| `src/components/tabs/SettingsTab.tsx` | `CrossfadeSettingRow` in `Playback & Audiophile Features`, scoped to `spotify_client` | ✓ VERIFIED | Exists, substantive, wired to `backendSetSetting("crossfade_seconds", ...)` (`verify.artifacts` on 22-02 & 22-04: passed). |
| `tests/test_eco.py` | Unit tests for `read_power_supply_state` peripheral battery filtering & `PowerGovernor` | ✓ VERIFIED | 15/15 tests pass (`verify.artifacts` on 22-05: passed). |
| `tests/test_connect_hub.py` | Unit tests for `CONNECT-01` backend RPCs & hardware detection (incl. Fremont DMI & `scope='Device'`) | ✓ VERIFIED | 9/9 tests pass (`verify.artifacts` on 22-05: passed). |
| `tests/test_crossfade.py` | Unit tests for `RADIO-02` backend & `librespot` non-ducking guard | ✓ VERIFIED | 5/5 tests pass. |
| `src/components/tabs/DevicesTab.test.tsx` | Vitest suite for `DevicesTab` (including 22-03 gap-closure tests) | ✓ VERIFIED | 8/8 tests pass. |
| `src/components/tabs/SettingsTab.test.tsx` | Vitest suite for `SettingsTab` including `CrossfadeSettingRow` scoping | ✓ VERIFIED | 44/44 tests pass. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/components/tabs/DevicesTab.tsx` | `main.py` | `callable('get_devices')`, `callable('pull_playback_to_deck')`, `callable('set_device_volume')`, `callable('start_librespot')`, `callable('start_spotify_client')` | ✓ WIRED | Verified by `verify.key-links` and source inspection. |
| `py_modules/rpc_playback.py` | `py_modules/eco.py` | `PowerGovernor.wake_for_playback()` & `read_power_supply_state()` | ✓ WIRED | Verified by direct source inspection (`py_modules/rpc_playback.py:483` calls `read_power_supply_state(sysfs_root)`). Note: `22-05-PLAN.md` `verify.key-links` syntax had `:detect_host_hardware_label` suffix on `from:` path. |
| `py_modules/rpc_playback.py` | `src/components/tabs/DevicesTab.tsx` | `local_hardware_label` and `local_hostname` fields in `DevicesResponse` | ✓ WIRED | Verified by direct source inspection (`rpc_playback.py:509-510`, `DevicesTab.tsx:368-369`). |
| `src/components/tabs/SettingsTab.tsx` | `main.py` | `backendSetSetting('crossfade_seconds', val)` | ✓ WIRED | Verified by `verify.key-links` and `SettingsTab.tsx`. |
| `src/components/tabs/SettingsTab.tsx` | `CrossfadeSettingRow` | `audioBackend={status?.audio_backend ?? audioBackend}` prop | ✓ WIRED | Verified by `verify.key-links` on `22-04-PLAN.md` (1/1 passed) and `SettingsTab.tsx:820-825`. |
| `main.py` | `py_modules/volume.py` | `VolumeFader.trigger_crossfade_in` recovery guard in `_maybe_trigger_local_crossfade` | ✓ WIRED | Verified by `verify.key-links` and `main.py:1843-1856`. |
| `main.py` | `py_modules/engine.py` | `_update_spotify_prefs_content(..., crossfade_seconds=...)` | ✓ WIRED | Verified by `verify.key-links` and `main.py`. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase 22 Python unit tests (`Eco` + `CONNECT-01` + `RADIO-02`) | `py -3 -m unittest tests/test_eco.py tests/test_connect_hub.py tests/test_crossfade.py -v` | `Ran 29 tests in 0.790s — OK` | ✓ PASS |
| Phase 22 Frontend Vitest tests (`DevicesTab` + `SettingsTab`) | `pnpm test -- --run src/components/tabs/DevicesTab.test.tsx src/components/tabs/SettingsTab.test.tsx` | `2 passed (2), Tests 52 passed (52)` | ✓ PASS |
| TypeScript type check | `pnpm exec tsc --noEmit` | Exit 0 | ✓ PASS |
| ESLint zero-warning check on `DevicesTab.tsx` & `types.ts` | `pnpm exec eslint --max-warnings=0 src/components/tabs/DevicesTab.tsx src/types.ts` | Exit 0, 0 warnings | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| `CONNECT-01` | `22-01-PLAN.md`, `22-03-PLAN.md`, `22-05-PLAN.md` | Device type icons, engine badges, hardware-aware 1-click "Pull Playback", deduplication, debounced remote volume, Fremont/peripheral battery hardware detection | ✓ SATISFIED (needs human UAT for backstop CEF layout/hardware) | `DevicesTab.tsx`, `InteractiveRow.tsx`, `rpc_playback.py`, `eco.py`, `volume.py`, `tests/test_connect_hub.py` (9/9), `tests/test_eco.py` (15/15), `DevicesTab.test.tsx` (8/8). Marked `[x]` / `Complete` in `REQUIREMENTS.md`. |
| `RADIO-02` | `22-02-PLAN.md`, `22-04-PLAN.md` | Native track Crossfade (`0–12s`) in `SettingsTab` scoped to Official Spotify Client (`spotify_client`), synced via prefs & CDP, with non-destructive `librespot` handling | ✓ SATISFIED (needs human UAT for live CDP audio) | `common.py`, `engine.py`, `volume.py`, `main.py`, `SettingsTab.tsx`, `tests/test_crossfade.py` (5/5), `SettingsTab.test.tsx` (44/44). Marked `[x]` / `Complete` in `REQUIREMENTS.md`. |

### Anti-Patterns Found

- Debt-marker scan (`TBD|FIXME|XXX`) across `py_modules/eco.py`, `py_modules/rpc_playback.py`, `tests/test_eco.py`, `tests/test_connect_hub.py`, and all previously scanned Phase 22 source/test files returned 0 matches.
- Note from `22-02-SUMMARY.md` & `22-03-SUMMARY.md`: `src/components/tabs/SettingsTab.tsx` and `src/components/common/InteractiveRow.tsx` have pre-existing ESLint warnings on unrelated/untouched lines; `CrossfadeSettingRow`, `DevicesTab.tsx`, and `src/types.ts` have 0 warnings.

### Human Verification Required

1. **Long Device Name Truncation (`backstop`):** Open `DevicesTab` in SteamOS GamepadUI with a 40+ character Connect device name and verify ellipsis truncation without wrapping/clipping `Active` or `Fixed Volume` badges.
2. **D-Pad Scroll & Focus Navigation (`backstop`):** Populate `DevicesTab` with multiple Connect devices inside `DeckifyExpandedModal` and verify smooth scrolling and `flow-children="column"` D-pad navigation.
3. **Live Auto-Waking Pull Playback, Hardware Label & Remote Volume:** On Steam Deck / Steam Machine (Fremont) / desktop with wireless peripheral batteries, verify accurate hardware label (`Steam Deck` vs `Steam Machine`), no duplicate local device row, *"Pull Playback"* waking Eco-sleeping `librespot`, and debounced Remote Volume slider against an external Connect speaker.
4. **Live Crossfade Audio & CDP Sync:** On SteamOS hardware, verify `Crossfade` (`0–12s`) is enabled on `spotify_client` (updating Official Spotify Client via CDP port `9229`) and disabled with explanation on `librespot` without dipping track transitions to silence.

---

_Verified: 2026-11-22T16:33:15Z_
_Verifier: the agent (gsd-verifier)_
