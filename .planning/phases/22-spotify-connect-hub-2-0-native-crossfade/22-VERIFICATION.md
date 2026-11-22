---
phase: 22-spotify-connect-hub-2-0-native-crossfade
verified: 2026-11-22T13:42:56Z
status: human_needed
score: 12/14 must-haves verified
covered_files:
  - ".planning/phases/22-spotify-connect-hub-2-0-native-crossfade/22-01-PLAN.md"
  - ".planning/phases/22-spotify-connect-hub-2-0-native-crossfade/22-01-SUMMARY.md"
  - ".planning/phases/22-spotify-connect-hub-2-0-native-crossfade/22-02-PLAN.md"
  - ".planning/phases/22-spotify-connect-hub-2-0-native-crossfade/22-02-SUMMARY.md"
  - "main.py"
  - "py_modules/common.py"
  - "py_modules/engine.py"
  - "py_modules/rpc_playback.py"
  - "py_modules/volume.py"
  - "src/components/tabs/DevicesTab.test.tsx"
  - "src/components/tabs/DevicesTab.tsx"
  - "src/components/tabs/SettingsTab.test.tsx"
  - "src/components/tabs/SettingsTab.tsx"
  - "src/types.ts"
  - "tests/test_connect_hub.py"
  - "tests/test_crossfade.py"
covered_digest: "v4:sha256:48cdcacfff38a687e16d4c0f4d515c4cb75cab32bb7bb4f85c62e0874a9993e0"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 12/14
  gaps_closed: []
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Open DevicesTab in SteamOS GamepadUI with a long Spotify Connect device name (e.g., 40+ characters) and Active / Fixed Volume badges."
    expected: "Device name truncates cleanly with ellipsis; right-aligned Active and Fixed Volume badges never wrap or clip."
    why_human: "Marked verification: backstop in 22-01-PLAN.md and 22-UI-SPEC.md; CSS textOverflow/minWidth layout rendering in SteamOS CEF cannot be proven by unit tests alone."
  - test: "Populate DevicesTab with multiple Spotify Connect devices inside DeckifyExpandedModal and navigate up/down using the Steam Deck D-pad."
    expected: "Device list scrolls inside DeckifyExpandedModal contentPaneRef while preserving flow-children='column' D-pad focus navigation without focus traps."
    why_human: "Marked verification: backstop in 22-01-PLAN.md and 22-UI-SPEC.md; SteamOS GamepadUI spatial focus navigation and scroll container behavior require live hardware/CEF verification."
  - test: "With Eco-Mode having put librespot to sleep and Spotify playing on an external device (e.g., Phone/Desktop), press 'Pull Playback to Steam Deck' in DevicesTab, then adjust Remote Volume on an external speaker."
    expected: "Local engine wakes, registers on Spotify Connect, transfers playback with play=true, and remote volume slider updates external speaker volume."
    why_human: "End-to-end Spotify Connect registration timing, PowerGovernor wake, and real Spotify Web API volume calls require live Spotify Premium account and Steam Deck runtime."
  - test: "Set Crossfade to 6s in SettingsTab on both Official Spotify Client (CDP port 9229) and librespot."
    expected: "Official Spotify Client applies live crossfade via SettingsAPI/prefs; librespot performs smooth PipeWire fade-out/fade-in at track boundary without overriding Sleep Timer lock or per-game ducking."
    why_human: "Live CDP SettingsAPI mutation on Official Spotify Client and audible PipeWire sink-input fade quality require live SteamOS runtime."
---

# Phase 22: Spotify Connect Hub 2.0 & Native Crossfade Verification Report

**Phase Goal:** Users can inspect active playback engines and device types, pull playback from any external device to the Steam Deck with a single auto-waking action, control remote Connect volume, and configure native track crossfade.
**Verified:** 2026-11-22T13:42:56Z
**Status:** human_needed
**Re-verification:** Yes — re-run after code-review fixes in commit `fd8ef16` (CR-01, WR-01..WR-05)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `get_devices` returns Spotify Connect devices enriched with `local_device_name`, `audio_backend`, `engine_running`, and `engine_sleeping` metadata. | ✓ VERIFIED | `py_modules/rpc_playback.py` returns all 4 fields; `tests/test_connect_hub.py` passes. |
| 2 | `pull_playback_to_deck` wakes a sleeping or stopped local Deckify engine, polls `get_devices` until the local device registers, and transfers playback with `play: True`. | ✓ VERIFIED | `py_modules/rpc_playback.py` wakes `PowerGovernor` or starts `start_spotify_client`/`start_librespot` (`fd8ef16`), polls up to 10x, issues `PUT me/player` with `play: True`; `tests/test_connect_hub.py` passes. |
| 3 | `set_device_volume` clamps `volume_percent` to `0..100`, encodes `device_id` safely via `urllib.parse.urlencode`, and calls `PUT /v1/me/player/volume`. | ✓ VERIFIED | `py_modules/volume.py` rejects `bool`, clamps `0..100`, passes `params` to `_spotify_api_request`; `tests/test_connect_hub.py` passes. |
| 4 | `DevicesTab` renders a pinned local Steam Deck status card with `FaGamepad`, inline engine pill badge (`librespot`, `spotifyd`, or `Spotify Client`), and a manual `Refresh` button. | ✓ VERIFIED | `src/components/tabs/DevicesTab.tsx`; `src/components/tabs/DevicesTab.test.tsx` (5/5 passed). |
| 5 | `DevicesTab` renders distinct `react-icons/fa` device type icons per Connect device row and shows the 1-click `'Pull Playback to Steam Deck'` CTA when playback is active externally or the local engine is stopped/sleeping. | ✓ VERIFIED | `src/components/tabs/DevicesTab.tsx` (including `fd8ef16` null-safe `isLocalDevice` & backend-aware `handleWakeEngine`); `src/components/tabs/DevicesTab.test.tsx` passes. |
| 6 | `DevicesTab` renders a `300ms`-debounced Remote Volume `SliderField` (`0-100%`) for adjustable devices and a `'Fixed Volume'` badge when `volume_percent` is `null`, `is_restricted` is `true`, or `supports_volume` is `false`. | ✓ VERIFIED | `src/components/tabs/DevicesTab.tsx` (upgraded in `fd8ef16` with per-device debounce timers `volumeTimersRef` and `try/catch` around `backendTransferPlayback`); `src/components/tabs/DevicesTab.test.tsx` passes. |
| 7 | Empty `get_devices` response renders `'No Spotify Connect Devices Found'` card with `'Wake Local Engine'` and `'Refresh'` actions; failed RPCs surface error copy via `showToast` and revert optimistic volume state. | ✓ VERIFIED | `src/components/tabs/DevicesTab.tsx`; `src/components/tabs/DevicesTab.test.tsx` passes. |
| 8 | Long Connect device names truncate with `textOverflow: ellipsis` and `minWidth: 0` so right-aligned `Active` / `Fixed Volume` badges never wrap or clip. (`verification: backstop`) | ⚠️ `insufficient_spec` | CSS properties (`minWidth: 0`, `textOverflow: "ellipsis"`, `flexShrink: 0`) are present in `DevicesTab.tsx`, but `backstop` truth requires live SteamOS CEF visual verification. |
| 9 | Device list scrolls inside `DeckifyExpandedModal` `contentPaneRef` while preserving `flow-children='column'` D-pad focus navigation. (`verification: backstop`) | ⚠️ `insufficient_spec` | `<Focusable flow-children="column">` is present in `DevicesTab.tsx`, but `backstop` truth requires live SteamOS GamepadUI D-pad navigation verification. |
| 10 | `crossfade_seconds` (default `0`, range `0..12`) persists in `settings.json` across restarts and is exposed in `get_status().settings`. | ✓ VERIFIED | `py_modules/common.py` (`crossfade_seconds` preserved and validated/clamped in `_load_settings` per `fd8ef16`); `main.py` (`public_keys`); `tests/test_crossfade.py` passes. |
| 11 | `set_setting('crossfade_seconds', val)` rejects booleans, clamps integers to `0..12`, persists atomically, and triggers 3-path crossfade sync. | ✓ VERIFIED | `main.py`; `tests/test_crossfade.py` passes. |
| 12 | `_update_spotify_prefs_content` writes `audio.crossfade_v2` and `audio.crossfade.time_v2` (ms), and `_sync_spotify_client_crossfade_cdp` applies live `SettingsAPI` updates on CDP port `9229` when `spotify_client` is active. | ✓ VERIFIED | `py_modules/engine.py` and `main.py`; `tests/test_crossfade.py` passes. |
| 13 | `VolumeFader` provides `trigger_crossfade_out` and `trigger_crossfade_in` for local `librespot` track transitions that strictly respect `_sleep_locked` and restore to `_compute_target_sink_volume()`. | ✓ VERIFIED | `py_modules/volume.py` and `main.py` (`fd8ef16` adds out-of-window, backend-switch, and 204 No Content recovery fade-in); `tests/test_crossfade.py` passes. |
| 14 | `SettingsTab` renders a `Crossfade` `SliderField` (`0-12s`, step `1`, `0s = Off`) inside `Playback & Audiophile Features` that debounces `set_setting('crossfade_seconds', val)` by `300ms` and shows error toast on save error. | ✓ VERIFIED | `src/components/tabs/SettingsTab.tsx`; `src/components/tabs/SettingsTab.test.tsx` (43/43 passed). |

**Score:** 12/14 truths verified (2 `backstop` truths routed to human verification)

### Advisory (New Scope, Unevidenced)

None.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `py_modules/rpc_playback.py` | Enriched `get_devices` and auto-waking `pull_playback_to_deck` | ✓ VERIFIED | Exists, substantive, wired to `main.py` and `PowerGovernor.wake_for_playback()` (`verify.artifacts`: passed). |
| `py_modules/volume.py` | `set_device_volume` + `VolumeFader.trigger_crossfade_out/in` | ✓ VERIFIED | Exists, substantive, wired to `main.py` (`verify.artifacts`: passed). |
| `py_modules/common.py` | `DEFAULT_SETTINGS['crossfade_seconds'] = 0` & preserved/validated in `_load_settings` | ✓ VERIFIED | Exists, substantive, wired to `main.py` (`verify.artifacts`: passed). |
| `py_modules/engine.py` | `_update_spotify_prefs_content` with `audio.crossfade_v2` & `audio.crossfade.time_v2` | ✓ VERIFIED | Exists, substantive, wired to `main.py:_write_spotify_client_prefs` (`verify.artifacts`: passed). |
| `main.py` | RPC wrappers, validation, CDP sync, `_poll_playback` crossfade hook | ✓ VERIFIED | Exists, substantive, wired to frontend `callable`s and backend modules (`verify.artifacts`: passed). |
| `src/types.ts` | `SpotifyDevice.is_restricted`, `supports_volume`, `DevicesResponse`, `EngineSettings.crossfade_seconds` | ✓ VERIFIED | Exists, substantive, 0 ESLint warnings (`verify.artifacts`: passed). |
| `src/components/tabs/DevicesTab.tsx` | Spotify Connect Hub 2.0 UI | ✓ VERIFIED | Exists, substantive, wired to backend RPCs, 0 ESLint warnings (`verify.artifacts`: passed). |
| `src/components/tabs/SettingsTab.tsx` | `CrossfadeSettingRow` in `Playback & Audiophile Features` | ✓ VERIFIED | Exists, substantive, wired to `backendSetSetting("crossfade_seconds", ...)` (`verify.artifacts`: passed). |
| `tests/test_connect_hub.py` | Unit tests for `CONNECT-01` backend RPCs | ✓ VERIFIED | 5/5 tests pass. |
| `tests/test_crossfade.py` | Unit tests for `RADIO-02` backend | ✓ VERIFIED | 5/5 tests pass. |
| `src/components/tabs/DevicesTab.test.tsx` | Vitest suite for `DevicesTab` | ✓ VERIFIED | 5/5 tests pass. |
| `src/components/tabs/SettingsTab.test.tsx` | Vitest suite for `SettingsTab` including `Crossfade` | ✓ VERIFIED | 43/43 tests pass. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/components/tabs/DevicesTab.tsx` | `main.py` | `callable('get_devices')`, `callable('pull_playback_to_deck')`, `callable('set_device_volume')`, `callable('start_librespot')`, `callable('start_spotify_client')` | ✓ WIRED | Verified by `verify.key-links` (2/2 passed) and source inspection. |
| `py_modules/rpc_playback.py` | `py_modules/eco.py` | `PowerGovernor.wake_for_playback()` inside `pull_playback_to_deck` | ✓ WIRED | Verified by `verify.key-links` and `py_modules/rpc_playback.py`. |
| `src/components/tabs/SettingsTab.tsx` | `main.py` | `backendSetSetting('crossfade_seconds', val)` | ✓ WIRED | Verified by `verify.key-links` (3/3 passed) and `SettingsTab.tsx`. |
| `main.py` | `py_modules/volume.py` | `VolumeFader.trigger_crossfade_out / trigger_crossfade_in` in `_poll_playback` | ✓ WIRED | Verified by `verify.key-links` and `main.py`. |
| `main.py` | `py_modules/engine.py` | `_update_spotify_prefs_content(..., crossfade_seconds=...)` | ✓ WIRED | Verified by `verify.key-links` and `main.py`. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase 22 Python unit tests (`CONNECT-01` + `RADIO-02`) | `py -3 -m unittest tests/test_connect_hub.py tests/test_crossfade.py -v` | `Ran 10 tests in 0.315s — OK` | ✓ PASS |
| Phase 22 Frontend Vitest tests (`DevicesTab` + `SettingsTab`) | `pnpm test -- --run src/components/tabs/DevicesTab.test.tsx src/components/tabs/SettingsTab.test.tsx` | `2 passed (2), Tests 48 passed (48)` | ✓ PASS |
| ESLint zero-warning check on `DevicesTab.tsx` & `types.ts` | `pnpm exec eslint --max-warnings=0 src/components/tabs/DevicesTab.tsx src/types.ts` | Exit 0, 0 warnings | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| `CONNECT-01` | `22-01-PLAN.md` | Device type icons, engine badges, 1-click "Pull Playback to Steam Deck", debounced remote volume | ✓ SATISFIED (needs human UAT for backstop CEF layout/hardware) | `DevicesTab.tsx`, `rpc_playback.py`, `volume.py`, `tests/test_connect_hub.py`, `DevicesTab.test.tsx`. Note: `.planning/REQUIREMENTS.md` still lists `CONNECT-01` as `[ ]` / `Pending` (planning doc status update pending). |
| `RADIO-02` | `22-02-PLAN.md` | Native track Crossfade (`0–12s`) in `SettingsTab` synced across CDP, engine config, and local transitions | ✓ SATISFIED (needs human UAT for live CDP/PipeWire audio) | `common.py`, `engine.py`, `volume.py`, `main.py`, `SettingsTab.tsx`, `tests/test_crossfade.py`, `SettingsTab.test.tsx`. Marked `[x]` / `Complete` in `REQUIREMENTS.md`. |

### Anti-Patterns Found

- Debt-marker scan (`TBD|FIXME|XXX`) across all 8 modified source files returned 0 matches.
- Note from `22-02-SUMMARY.md`: `src/components/tabs/SettingsTab.tsx` has 22 pre-existing ESLint warnings in unrelated functions outside `CrossfadeSettingRow` (tracked in `deferred-items.md`); `CrossfadeSettingRow`, `DevicesTab.tsx`, and `src/types.ts` have 0 warnings.

### Human Verification Required

1. **Long Device Name Truncation (`backstop`):** Open `DevicesTab` in SteamOS GamepadUI with a 40+ character Connect device name and verify ellipsis truncation without wrapping/clipping `Active` or `Fixed Volume` badges.
2. **D-Pad Scroll & Focus Navigation (`backstop`):** Populate `DevicesTab` with multiple Connect devices inside `DeckifyExpandedModal` and verify smooth scrolling and `flow-children="column"` D-pad navigation.
3. **Live Auto-Waking Pull Playback & Remote Volume:** On Steam Deck hardware, test *"Pull Playback to Steam Deck"* while `librespot` is Eco-sleeping and playback is active on an external device, and test the debounced Remote Volume slider against an external Connect speaker.
4. **Live Crossfade Audio & CDP Sync:** On Steam Deck hardware, verify `Crossfade` (`0–12s`) updates Official Spotify Client via CDP port `9229` and drives smooth `librespot` PipeWire boundary fades without overriding Sleep Timer lock or per-game ducking.

---

_Verified: 2026-11-22T13:42:56Z_
_Verifier: the agent (gsd-verifier)_
