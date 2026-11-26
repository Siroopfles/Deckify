---
phase: 28-cdp-offline-downloads-wi-fi-travel-mode-living-room-spotify
verified: 2026-11-26T12:15:00Z
status: human_needed
score: 12/12 must-haves verified
covered_files:
  - ".planning/phases/28-cdp-offline-downloads-wi-fi-travel-mode-living-room-spotify/28-01-PLAN.md"
  - ".planning/phases/28-cdp-offline-downloads-wi-fi-travel-mode-living-room-spotify/28-01-SUMMARY.md"
  - ".planning/phases/28-cdp-offline-downloads-wi-fi-travel-mode-living-room-spotify/28-02-PLAN.md"
  - ".planning/phases/28-cdp-offline-downloads-wi-fi-travel-mode-living-room-spotify/28-02-SUMMARY.md"
  - ".planning/phases/28-cdp-offline-downloads-wi-fi-travel-mode-living-room-spotify/28-03-PLAN.md"
  - ".planning/phases/28-cdp-offline-downloads-wi-fi-travel-mode-living-room-spotify/28-03-SUMMARY.md"
  - ".planning/phases/28-cdp-offline-downloads-wi-fi-travel-mode-living-room-spotify/28-04-PLAN.md"
  - ".planning/phases/28-cdp-offline-downloads-wi-fi-travel-mode-living-room-spotify/28-04-SUMMARY.md"
  - ".planning/phases/28-cdp-offline-downloads-wi-fi-travel-mode-living-room-spotify/28-05-PLAN.md"
  - ".planning/phases/28-cdp-offline-downloads-wi-fi-travel-mode-living-room-spotify/28-05-SUMMARY.md"
  - ".planning/phases/28-cdp-offline-downloads-wi-fi-travel-mode-living-room-spotify/28-06-PLAN.md"
  - ".planning/phases/28-cdp-offline-downloads-wi-fi-travel-mode-living-room-spotify/28-06-SUMMARY.md"
  - ".planning/phases/28-cdp-offline-downloads-wi-fi-travel-mode-living-room-spotify/28-07-PLAN.md"
  - ".planning/phases/28-cdp-offline-downloads-wi-fi-travel-mode-living-room-spotify/28-07-SUMMARY.md"
  - "main.py"
  - "py_modules/cdp_bridge.py"
  - "py_modules/common.py"
  - "py_modules/engine.py"
  - "py_modules/resilience.py"
  - "py_modules/rpc_library.py"
  - "src/components/DeckifyExpandedModal.tsx"
  - "src/components/common/CollectionActionModal.tsx"
  - "src/components/common/JamQrModal.test.tsx"
  - "src/components/common/JamQrModal.tsx"
  - "src/components/common/OfflineStatusUI.tsx"
  - "src/components/tabs/AlbumsTab.tsx"
  - "src/components/tabs/DevicesTab.tsx"
  - "src/components/tabs/DiscoveryTab.tsx"
  - "src/components/tabs/LikedSongsTab.tsx"
  - "src/components/tabs/LyricsTab.tsx"
  - "src/components/tabs/NowPlayingTab.tsx"
  - "src/components/tabs/PlaylistsTab.tsx"
  - "src/components/tabs/PodcastsTab.tsx"
  - "src/components/tabs/SearchTab.tsx"
  - "src/components/tabs/SettingsTab.tsx"
  - "src/index.tsx"
  - "src/types.ts"
  - "tests/test_cdp_bridge.py"
  - "tests/test_offline_downloads.py"
  - "tests/test_travel_mode.py"
covered_digest: "v4:sha256:0e4e1b7a154deaa70df0e3fe7b09750b63c078fda71afad840dad16630270aff"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Toggle 'Download for Offline' on a playlist, album, and podcast episode on a live Steam Deck with Official Spotify Client (and once while on librespot to test the 1-click EngineSwitchDownloadModal)."
    expected: "On librespot, EngineSwitchDownloadModal opens with 'Switch to Spotify Client & Download'. On Official Spotify Client, live 0-100% progress bar/badge updates, green ✓ badge appears on completion, and os.statvfs guardrail blocks/pauses downloads below configured minimum free space."
    why_human: "Live Spotify Desktop Client CDP OfflineAPI WebSocket evaluation (port 9229) and Flatpak --filesystem override require a running com.spotify.Client instance on SteamOS."
  - test: "Disconnect Wi-Fi on Steam Deck (and test wake-from-suspend recovery) to verify Offline / Travel Mode auto-activation after the 10-second wake grace window, plus manual toggle in QAM, modal header pill, and SettingsTab."
    expected: "Travel Mode stays suppressed during the 10s wake grace window, activates on sustained disconnect, filters library tabs to downloaded items, preserves cached .lrc lyrics and discovery mixes, and auto-exits on Wi-Fi stabilization unless manually locked ON."
    why_human: "Real SteamOS suspend/wake Wi-Fi hardware transitions and visual verification of TravelModeBanner/OfflineBadge across GamepadUI tabs require live device testing."
  - test: "Open 'Start / Share Spotify Jam' from NowPlayingTab and DevicesTab (both on Official Spotify Client and on librespot), scan the QRCodeSVG with a phone camera, and test B-button dismissal."
    expected: "High-contrast #FFFFFF quiet-zone QRCodeSVG scans cleanly; librespot shows deep-link share note + 1-click 'Switch to Spotify Client & Start Jam'; Jam Active pill appears when active; pressing B closes JamQrModal without closing DeckifyExpandedModal."
    why_human: "Live Spotify Jam SocialConnectAPI session creation, physical mobile camera QR scanning, and SteamOS CEF controller focus restoration require on-device UAT."
---

# Phase 28: CDP Offline Downloads, Wi-Fi Travel Mode & Living Room Spotify Jam Verification Report

**Phase Goal:** Users can download playlists, albums, and podcast episodes for offline playback with a 3.0 GB free-space guardrail, automatically filter to downloaded content in Offline Travel Mode when Wi-Fi disconnects, and host living-room Spotify Jam sessions via scannable QR codes.
**Verified:** 2026-11-26T12:15:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | `get_disk_free_bytes` uses `os.statvfs(target).f_bavail * st.f_frsize` on POSIX (with `shutil.disk_usage` fallback on Windows) and `check_disk_guardrail` blocks downloads below `offline_min_free_gb` (`3.0 GB` default) | ✓ VERIFIED | `py_modules/common.py:596-635`; `tests/test_offline_downloads.py` (`test_get_disk_free_bytes_uses_statvfs_f_bavail_on_posix`, `test_check_disk_guardrail_blocks_below_threshold`) |
| 2 | `cdp_bridge.py` exposes `OfflineAPI` & `SocialConnectAPI` CDP probes with atomic `.tmp` + `os.replace` `offline_downloads.json` cache and idempotent URI handling | ✓ VERIFIED | `py_modules/cdp_bridge.py:17,1393-1805`; `tests/test_offline_downloads.py` (`test_offline_downloads_cache_concurrent_atomic_writes`, `test_cdp_set_offline_download_idempotent_and_removal`) |
| 3 | `configure_offline_storage_path` validates writeability, rejects control chars/relative paths, and runs `flatpak override --user --filesystem=<abspath>` via `_build_deck_command` without `shell=True` | ✓ VERIFIED | `py_modules/engine.py:520-597`; `tests/test_offline_downloads.py` (`test_validate_and_configure_offline_storage_path`) |
| 4 | `SessionBookmarkManager` suppresses auto Travel Mode for `WAKE_GRACE_WINDOW_S = 10.0` after wake recovery, auto-activates on sustained Wi-Fi drop, auto-exits on stabilization unless `travel_mode_manual` is sticky ON, and `filter_items_for_travel_mode` filters library items | ✓ VERIFIED | `py_modules/resilience.py:25,488-580,744-771`; `tests/test_travel_mode.py` (8 tests passed) |
| 5 | `rpc_library.py` annotates `offline_state` and `offline_progress` on playlists, albums, shows, and episodes | ✓ VERIFIED | `py_modules/rpc_library.py:45,132,1089,1124,1236,1296`; `tests/test_offline_downloads.py` (`test_annotate_offline_metadata`) |
| 6 | `main.py` exposes all 9 Phase 28 RPCs via `await _exec(...)`, enforces active-download disk guardrail in `_poll_playback`, and emits `travel_mode_changed` / `low_disk_space` | ✓ VERIFIED | `main.py:1669-1798,2239-2244`; `tests/test_offline_downloads.py` (`TestPhase28PluginRPCs`) |
| 7 | `src/types.ts` defines `OfflineState`, `OfflineDownloadItem`, `JamSessionStatus` and extends `EngineSettings`, `StatusResponse`, and library item types | ✓ VERIFIED | `src/types.ts:81-160,365-370,449-455`; `pnpm run typecheck` exit 0 |
| 8 | `<JamQrCard>` & `<JamQrModal>` render `#FFFFFF` quiet-zone `QRCodeSVG`, `librespot` deep-link share fallback + 1-click switch CTA, and `previousFocusRef` focus restoration | ✓ VERIFIED | `src/components/common/JamQrModal.tsx:10-250`; `src/components/common/JamQrModal.test.tsx` (8 tests passed) |
| 9 | Offline download toggles, `↓ %` / `✓` badges, 4px progress bars, Travel Mode banner/filtering, and graceful offline degradation are wired across `CollectionActionModal` and all 7 library/online tabs | ✓ VERIFIED | `src/components/common/OfflineStatusUI.tsx`, `CollectionActionModal.tsx`, `PlaylistsTab.tsx`, `AlbumsTab.tsx`, `PodcastsTab.tsx`, `LikedSongsTab.tsx`, `DiscoveryTab.tsx`, `SearchTab.tsx`, `LyricsTab.tsx` |
| 10 | `NowPlayingTab` & `DevicesTab` expose `"Start / Share Spotify Jam"` + `"Jam Active"` pill + `"End Jam"`; `SettingsTab` exposes Travel Mode toggles, disk guardrail slider, storage path, Downloads Manager, and guarded `BulkDeleteConfirmModal` | ✓ VERIFIED | `NowPlayingTab.tsx:588-711`, `DevicesTab.tsx:452-571`, `SettingsTab.tsx:272-623,2404-2420`; `SettingsTab.test.tsx` (47 tests passed) |
| 11 | `DeckifyExpandedModal` appends new `useState` hooks after `pendingDeletePlaylist`, wires `EngineSwitchDownloadModal`, `JamQrModal`, `Travel Mode` header pill, and `vgp_oncancel` sub-modal guards | ✓ VERIFIED | `src/components/DeckifyExpandedModal.tsx:277-293,675-805,1826-1840,2041-2065`; `DeckifyExpandedModal.test.tsx` (33 tests passed) |
| 12 | Quick Access Menu (`src/index.tsx`) exposes `"Offline / Travel Mode"` `ToggleField` wired to `set_travel_mode` and synced with `travel_mode_changed` | ✓ VERIFIED | `src/index.tsx:128,1101-1118,1803` |

**Score:** 12/12 must-haves verified (0 behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `py_modules/common.py` | `DEFAULT_SETTINGS` offline/travel keys, `get_disk_free_bytes`, `check_disk_guardrail`, `clamp_offline_min_free_gb` | ✓ VERIFIED | Substantive & wired (`f_bavail * f_frsize`, `[0.5, 50.0]` clamp) |
| `py_modules/cdp_bridge.py` | `OfflineAPI` & `SocialConnectAPI` CDP probes + atomic `offline_downloads.json` | ✓ VERIFIED | Substantive & wired (`_OFFLINE_CACHE_LOCK` + `.tmp` + `os.replace`) |
| `py_modules/engine.py` | `validate_offline_storage_path`, `configure_offline_storage_path` | ✓ VERIFIED | Substantive & wired (no `shell=True`, scoped `--filesystem=`) |
| `py_modules/resilience.py` | `WAKE_GRACE_WINDOW_S = 10.0`, Travel Mode state machine, `filter_items_for_travel_mode` | ✓ VERIFIED | Substantive & wired in `SessionBookmarkManager` |
| `py_modules/rpc_library.py` | `annotate_offline_metadata` | ✓ VERIFIED | Applied across playlists, albums, shows, episodes |
| `main.py` | 9 Phase 28 RPCs, `get_status` fields, `_poll_playback` guardrail | ✓ VERIFIED | All blocking calls offloaded via `await _exec(...)` |
| `src/types.ts` | `OfflineState`, `OfflineDownloadItem`, `JamSessionStatus`, extended settings/status | ✓ VERIFIED | Compiled cleanly with `tsc --noEmit` |
| `src/components/common/JamQrModal.tsx` | `buildSpotifyDeepLink`, `JamQrCard`, `JamQrModal` | ✓ VERIFIED | `#FFFFFF` quiet-zone `QRCodeSVG` + `previousFocusRef` restoration |
| `src/components/common/OfflineStatusUI.tsx` | `OfflineBadge`, `OfflineProgressBar`, `OfflineDownloadButton`, `TravelModeBanner` | ✓ VERIFIED | Shared primitives used across tabs |
| `src/components/common/CollectionActionModal.tsx` | Offline download toggle row | ✓ VERIFIED | Wired to `onToggleOfflineDownload` |
| `src/components/tabs/*` | Library/online tab filtering, Jam controls, Settings manager | ✓ VERIFIED | All 10 tab files updated and wired |
| `src/components/DeckifyExpandedModal.tsx` | Travel Mode pill, `EngineSwitchDownloadModal`, `JamQrModal`, `vgp_oncancel` | ✓ VERIFIED | Hook order preserved after `pendingDeletePlaylist` |
| `src/index.tsx` | QAM `Offline / Travel Mode` `ToggleField` | ✓ VERIFIED | Wired to `set_travel_mode` & `travel_mode_changed` |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Phase 28 Python unit tests (`CDP-01`, `CDP-02`, `JAM-01`) | `py -3 -m unittest tests/test_offline_downloads.py tests/test_travel_mode.py -v` | 23 tests passed in 0.638s | ✓ PASS |
| Phase 28 Vitest suites (`JamQrModal`, `SettingsTab`, `DeckifyExpandedModal`) | `pnpm test -- --run src/components/common/JamQrModal.test.tsx src/components/DeckifyExpandedModal.test.tsx src/components/tabs/SettingsTab.test.tsx` | 3 test files, 88 tests passed | ✓ PASS |
| Full regression suite (reported by orchestrator) | `pnpm run typecheck && pnpm run lint && pnpm test -- --run` & `unittest discover` | `typecheck` 0, `lint` 0, 382 Vitest + 747 Python tests passed | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `CDP-01` | 28-01, 28-03, 28-04, 28-05, 28-06, 28-07 | Offline downloads via CDP `OfflineAPI` with 1-click engine switch prompt, live progress/badges, `os.statvfs` 3.0 GB guardrail, configurable storage path, & Downloads Manager | ✓ SATISFIED (pending live SteamOS UAT) | `py_modules/common.py`, `cdp_bridge.py`, `engine.py`, `rpc_library.py`, `main.py`, `OfflineStatusUI.tsx`, `SettingsTab.tsx`, `DeckifyExpandedModal.tsx` |
| `CDP-02` | 28-02, 28-03, 28-04, 28-05, 28-06, 28-07 | Manual & auto Offline / Travel Mode (10s wake grace window, sticky manual lock) filtering library views to downloaded content & cached `.lrc` lyrics | ✓ SATISFIED (pending live SteamOS UAT) | `py_modules/resilience.py`, `main.py`, `src/index.tsx`, `DeckifyExpandedModal.tsx`, `SettingsTab.tsx`, all 7 library/online tabs |
| `JAM-01` | 28-01, 28-03, 28-04, 28-06, 28-07 | Start/share Spotify Jam from `NowPlayingTab`, `DevicesTab`, or reusable `JamQrCard`/`JamQrModal` (ready for Phase 29 `TvSplitView`) with `QRCodeSVG` & `librespot` deep-link fallback | ✓ SATISFIED (pending live SteamOS UAT) | `py_modules/cdp_bridge.py`, `main.py`, `JamQrModal.tsx`, `NowPlayingTab.tsx`, `DevicesTab.tsx`, `DeckifyExpandedModal.tsx` |

Orphaned requirements: None (all 3 Phase 28 requirements `CDP-01`, `CDP-02`, `JAM-01` in `REQUIREMENTS.md` are accounted for).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| None | - | Scanned all 22 Phase 28 files for `TBD`, `FIXME`, `XXX`, `f_bfree`, and `shell=True` / `--filesystem=host` | - | 0 debt markers or prohibition violations found |

### Human Verification Required

### 1. Live Official Spotify Client Offline Downloads & Disk Guardrail (SteamOS)
**Test:** On Steam Deck, toggle *"Download for Offline"* on a playlist, album, and podcast episode while on `librespot` (to verify `EngineSwitchDownloadModal` 1-click switch) and while on `spotify_client`. Also test lowering/raising `offline_min_free_gb` in `SettingsTab` and configuring a custom storage path.
**Expected:** Live `0–100%` progress updates, green `✓` badge on completion, `flatpak override --user --filesystem=...` succeeds, and downloads are blocked/paused when free space is below threshold.
**Why human:** Live `com.spotify.Client` CDP `OfflineAPI` WebSocket evaluation (port `9229`) and Flatpak filesystem permissions require a running Spotify Desktop Client on SteamOS.

### 2. Wi-Fi Disconnect & Wake-from-Suspend Travel Mode Transition (SteamOS)
**Test:** Toggle Offline / Travel Mode manually in QAM, modal header pill, and `SettingsTab`; then test disconnecting Wi-Fi and waking from suspend with auto Travel Mode enabled.
**Expected:** Auto Travel Mode suppresses activation during the 10-second wake grace window, activates on sustained Wi-Fi disconnect, filters library tabs to downloaded items, keeps cached `.lrc` lyrics and cached Discovery mixes usable, and auto-exits on Wi-Fi stabilization unless manually locked ON.
**Why human:** Real SteamOS suspend/wake Wi-Fi transitions and visual inspection of `TravelModeBanner` / `OfflineBadge` in GamepadUI CEF require on-device testing.

### 3. Living-Room Spotify Jam QR Scanning & Controller Focus Restoration (SteamOS)
**Test:** Open *"Start / Share Spotify Jam"* from `NowPlayingTab` and `DevicesTab` (on both `spotify_client` and `librespot`), scan the `QRCodeSVG` with a mobile phone, and press `B` to dismiss `JamQrModal`.
**Expected:** High-contrast `#FFFFFF` quiet-zone QR scans cleanly; `librespot` shows the playback share note + 1-click *"Switch to Spotify Client & Start Jam"*; `"Jam Active"` pill appears when live; pressing `B` closes `JamQrModal` without closing `DeckifyExpandedModal` and restores focus.
**Why human:** Live Spotify Jam `SocialConnectAPI` session creation, physical mobile camera QR scanning, and SteamOS CEF controller focus restoration require on-device UAT.

---

_Verified: 2026-11-26T12:15:00Z_
_Verifier: the agent (gsd-verifier)_
