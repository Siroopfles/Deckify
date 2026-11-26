---
phase: 28-cdp-offline-downloads-wi-fi-travel-mode-living-room-spotify
verified: 2026-11-26T17:24:00Z
status: human_needed
score: 15/15 must-haves verified
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
  - ".planning/phases/28-cdp-offline-downloads-wi-fi-travel-mode-living-room-spotify/28-08-PLAN.md"
  - ".planning/phases/28-cdp-offline-downloads-wi-fi-travel-mode-living-room-spotify/28-08-SUMMARY.md"
  - ".planning/phases/28-cdp-offline-downloads-wi-fi-travel-mode-living-room-spotify/28-09-PLAN.md"
  - ".planning/phases/28-cdp-offline-downloads-wi-fi-travel-mode-living-room-spotify/28-09-SUMMARY.md"
  - ".planning/phases/28-cdp-offline-downloads-wi-fi-travel-mode-living-room-spotify/28-10-PLAN.md"
  - ".planning/phases/28-cdp-offline-downloads-wi-fi-travel-mode-living-room-spotify/28-10-SUMMARY.md"
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
covered_digest: "v4:sha256:a521affab6347e8ac44dfd56eb837a341cf7d44b7eac415f2b80a05237aa4275"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 12/12
  gaps_closed:
    - "G-28-1 (28-08, 28-10): wait_for_cdp_ready on start_spotify_client + single retry on not-ready errors, AlbumAPI.setOffline/OfflineAPI download fallbacks, wrapped & focus-trapped EngineSwitchDownloadModal with B-button cancel and switching toast"
    - "G-28-2 (28-08, 28-09, 28-10): deduplicated travel_mode_changed emission, top-level QAM Offline / Travel Mode ToggleField, travel_mode_show_when_online setting & conditional focus-visible travel-mode-header-pill, Travel Mode exit focus restoration, and DiscoveryTab auto-refresh on travelModeEnabled change"
    - "G-28-3 (28-08, 28-09, 28-10): nested/polled SocialConnectAPI join_url extraction with active=False guard when join_url is null, strict spotify_client JamQrCard guard without silent track deep-link fallback, and Retry Jam wiring"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Re-test G-28-1: Toggle 'Download for Offline' on a playlist, album, and podcast episode on a live Steam Deck (once while on librespot to test EngineSwitchDownloadModal layout, focus trap, B-cancel, and 1-click switch + CDP readiness wait, and once on Official Spotify Client)."
    expected: "EngineSwitchDownloadModal wraps buttons cleanly inside 460px, traps focus, closes on B, shows 'Switching to Official Spotify Client...' toast, waits for CDP readiness, and triggers download on Official Spotify Client with live 0-100% progress and os.statvfs 3.0 GB guardrail."
    why_human: "Live Spotify Desktop Client CDP OfflineAPI WebSocket evaluation (port 9229) and GamepadUI FocusNavController behavior require a running com.spotify.Client instance on SteamOS."
  - test: "Re-test G-28-2: Toggle Offline / Travel Mode in QAM (top-level), verify travel-mode-header-pill visibility when online vs offline and SettingsTab 'Show Travel Mode Button When Online' toggle, check controller focus halo on the pill, exit Travel Mode to confirm focus restoration, and verify DiscoveryTab refreshes on exit."
    expected: "QAM toggle is visible at top-level without expanding Controls & Settings; header pill hides when online unless configured, shows clear focus halo, restores focus on Travel Mode exit, and DiscoveryTab reloads live feed."
    why_human: "Real SteamOS suspend/wake Wi-Fi transitions and visual inspection of focus halo / focus restoration in GamepadUI CEF require on-device testing."
  - test: "Re-test G-28-3: Open 'Start / Share Spotify Jam' from NowPlayingTab and DevicesTab on Official Spotify Client (and librespot), verify QRCodeSVG scans cleanly with a phone camera (or shows explicit error + Retry Jam if join_url is unavailable), and test B-button dismissal."
    expected: "On spotify_client, QRCodeSVG encodes the real Jam invite URL (never a track deep-link) or shows an explicit error with Retry Jam; on librespot, shows deep-link share note + 1-click switch; pressing B closes JamQrModal without closing DeckifyExpandedModal."
    why_human: "Live Spotify Jam SocialConnectAPI session creation, physical mobile camera QR scanning, and SteamOS CEF controller focus restoration require on-device UAT."
---

# Phase 28: CDP Offline Downloads, Wi-Fi Travel Mode & Living Room Spotify Jam Verification Report

**Phase Goal:** Users can download playlists, albums, and podcast episodes for offline playback with a 3.0 GB free-space guardrail, automatically filter to downloaded content in Offline Travel Mode when Wi-Fi disconnects, and host living-room Spotify Jam sessions via scannable QR codes.
**Verified:** 2026-11-26T17:24:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap-closure plans `28-08`, `28-09`, and `28-10` (closing UAT gaps `G-28-1`, `G-28-2`, `G-28-3`)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | `get_disk_free_bytes` uses `os.statvfs(target).f_bavail * st.f_frsize` on POSIX (with `shutil.disk_usage` fallback on Windows) and `check_disk_guardrail` blocks downloads below `offline_min_free_gb` (`3.0 GB` default) | ✓ VERIFIED | `py_modules/common.py`; `tests/test_offline_downloads.py` |
| 2 | `cdp_bridge.py` exposes `OfflineAPI` & `SocialConnectAPI` CDP probes with atomic `.tmp` + `os.replace` `offline_downloads.json` cache and idempotent URI handling | ✓ VERIFIED | `py_modules/cdp_bridge.py`; `tests/test_offline_downloads.py` |
| 3 | `configure_offline_storage_path` validates writeability, rejects control chars/relative paths, and runs `flatpak override --user --filesystem=<abspath>` via `_build_deck_command` without `shell=True` | ✓ VERIFIED | `py_modules/engine.py`; `tests/test_offline_downloads.py` |
| 4 | `SessionBookmarkManager` suppresses auto Travel Mode for `WAKE_GRACE_WINDOW_S = 10.0` after wake recovery, auto-activates on sustained Wi-Fi drop, auto-exits on stabilization unless `travel_mode_manual` is sticky ON, and `filter_items_for_travel_mode` filters library items | ✓ VERIFIED | `py_modules/resilience.py`; `tests/test_travel_mode.py` |
| 5 | `rpc_library.py` annotates `offline_state` and `offline_progress` on playlists, albums, shows, and episodes | ✓ VERIFIED | `py_modules/rpc_library.py`; `tests/test_offline_downloads.py` |
| 6 | `main.py` exposes all 9 Phase 28 RPCs via `await _exec(...)`, enforces active-download disk guardrail in `_poll_playback`, and emits `travel_mode_changed` / `low_disk_space` | ✓ VERIFIED | `main.py`; `tests/test_offline_downloads.py` |
| 7 | `src/types.ts` defines `OfflineState`, `OfflineDownloadItem`, `JamSessionStatus` and extends `EngineSettings`, `BackendStatus`, and library item types | ✓ VERIFIED | `src/types.ts:369,454`; `pnpm run typecheck` exit 0 |
| 8 | `<JamQrCard>` & `<JamQrModal>` render `#FFFFFF` quiet-zone `QRCodeSVG`, `librespot` deep-link share fallback + 1-click switch CTA, and `previousFocusRef` focus restoration | ✓ VERIFIED | `src/components/common/JamQrModal.tsx`; `src/components/common/JamQrModal.test.tsx` (9 tests passed) |
| 9 | Offline download toggles, `↓ %` / `✓` badges, 4px progress bars, Travel Mode banner/filtering, and graceful offline degradation are wired across `CollectionActionModal` and all 7 library/online tabs | ✓ VERIFIED | `OfflineStatusUI.tsx`, `CollectionActionModal.tsx`, `PlaylistsTab.tsx`, `AlbumsTab.tsx`, `PodcastsTab.tsx`, `LikedSongsTab.tsx`, `DiscoveryTab.tsx`, `SearchTab.tsx`, `LyricsTab.tsx` |
| 10 | `NowPlayingTab` & `DevicesTab` expose `"Start / Share Spotify Jam"` + `"Jam Active"` pill + `"End Jam"`; `SettingsTab` exposes Travel Mode toggles (including `travel_mode_show_when_online`), disk guardrail slider, storage path, Downloads Manager, and guarded `BulkDeleteConfirmModal` | ✓ VERIFIED | `NowPlayingTab.tsx`, `DevicesTab.tsx`, `SettingsTab.tsx:537-542,2416` |
| 11 | `DeckifyExpandedModal` preserves hook order, wires `EngineSwitchDownloadModal`, `JamQrModal`, `Travel Mode` header pill, and `vgp_oncancel` sub-modal guards | ✓ VERIFIED | `src/components/DeckifyExpandedModal.tsx:290-326,2088-2142,2578-2660`; `DeckifyExpandedModal.test.tsx` (33 tests passed) |
| 12 | Quick Access Menu (`src/index.tsx`) exposes `"Offline / Travel Mode"` `ToggleField` at top-level (playing & stopped) wired to `set_travel_mode` and synced with `travel_mode_changed` | ✓ VERIFIED | `src/index.tsx:1351,1801,1834` |
| 13 | **G-28-1 Closure (`28-08`, `28-10`):** `start_spotify_client` awaits `wait_for_cdp_ready`, `toggle_offline_download` retries once on CDP not-ready, `cdp_set_offline_download` supports `AlbumAPI.setOffline` & `OfflineAPI` fallbacks, and `EngineSwitchDownloadModal` wraps buttons inside 460px with `retainFocus`, `onCancelButton`, rAF focus transfer/restoration, and switching toast | ✓ VERIFIED | `py_modules/cdp_bridge.py:150-171,1534-1600`; `main.py:628,1728-1740`; `src/components/DeckifyExpandedModal.tsx:299-326,835-846,2583-2660` |
| 14 | **G-28-2 Closure (`28-08`, `28-09`, `28-10`):** `set_travel_mode` deduplicates `travel_mode_changed`, `travel_mode_show_when_online` defaults to `False` and is configurable in `SettingsTab`, QAM surfaces `renderTravelModeToggle()` at top-level, `travel-mode-header-pill` hides when online unless configured and shows focus halo + restores focus on Travel Mode exit, and `DiscoveryTab` reloads on `travelModeEnabled` change | ✓ VERIFIED | `py_modules/common.py:181,484`; `main.py:1107,1800-1829`; `src/index.tsx:1351,1801,1834`; `src/components/tabs/SettingsTab.tsx:537-542`; `src/components/tabs/DiscoveryTab.tsx:386`; `src/components/DeckifyExpandedModal.tsx:290,756-771,2088-2142` |
| 15 | **G-28-3 Closure (`28-08`, `28-09`, `28-10`):** `cdp_start_spotify_jam` & `cdp_get_jam_status` extract nested/polled `join_url` and enforce `active=False` when `join_url` is null; `JamQrCard` never falls back to track deep-links on `spotify_client` and renders `Retry Jam`; `DeckifyExpandedModal` gates `active` on `join_url` and wires `onRetryJam={handleOpenJamModal}` | ✓ VERIFIED | `py_modules/cdp_bridge.py:1878-1990`; `main.py:1831-1844`; `src/components/common/JamQrModal.tsx:159-187`; `src/components/DeckifyExpandedModal.tsx:868-934,2578` |

**Score:** 15/15 must-haves verified (0 behavior-unverified)

### Advisory (New Scope, Unevidenced)

None

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `py_modules/common.py` | `DEFAULT_SETTINGS` offline/travel keys (incl. `travel_mode_show_when_online`), `get_disk_free_bytes`, `check_disk_guardrail`, `clamp_offline_min_free_gb` | ✓ VERIFIED | Substantive & wired (`f_bavail * f_frsize`, `[0.5, 50.0]` clamp, `bool` coercion) |
| `py_modules/cdp_bridge.py` | `wait_for_cdp_ready`, `OfflineAPI`/`AlbumAPI` & `SocialConnectAPI` CDP probes + atomic `offline_downloads.json` | ✓ VERIFIED | Substantive & wired (`_OFFLINE_CACHE_LOCK` + `.tmp` + `os.replace`, Jam `join_url` polling) |
| `py_modules/engine.py` | `validate_offline_storage_path`, `configure_offline_storage_path` | ✓ VERIFIED | Substantive & wired (no `shell=True`, scoped `--filesystem=`) |
| `py_modules/resilience.py` | `WAKE_GRACE_WINDOW_S = 10.0`, Travel Mode state machine, `filter_items_for_travel_mode` | ✓ VERIFIED | Substantive & wired in `SessionBookmarkManager` |
| `py_modules/rpc_library.py` | `annotate_offline_metadata` | ✓ VERIFIED | Applied across playlists, albums, shows, episodes |
| `main.py` | 9 Phase 28 RPCs, CDP readiness waits/retries, deduplicated `travel_mode_changed`, `_poll_playback` guardrail | ✓ VERIFIED | All blocking calls offloaded via `await _exec(...)` |
| `src/types.ts` | `OfflineState`, `OfflineDownloadItem`, `JamSessionStatus`, extended settings/status (incl. `travel_mode_show_when_online`) | ✓ VERIFIED | Compiled cleanly with `tsc --noEmit` |
| `src/components/common/JamQrModal.tsx` | `buildSpotifyDeepLink`, `JamQrCard` (`spotify_client` guard + `Retry Jam`), `JamQrModal` | ✓ VERIFIED | `#FFFFFF` quiet-zone `QRCodeSVG` + `previousFocusRef` restoration |
| `src/components/common/OfflineStatusUI.tsx` | `OfflineBadge`, `OfflineProgressBar`, `OfflineDownloadButton`, `TravelModeBanner` | ✓ VERIFIED | Shared primitives used across tabs |
| `src/components/common/CollectionActionModal.tsx` | Offline download toggle row | ✓ VERIFIED | Wired to `onToggleOfflineDownload` |
| `src/components/tabs/*` | Library/online tab filtering, Discovery refresh, Jam controls, Settings manager | ✓ VERIFIED | All 10 tab files updated and wired |
| `src/components/DeckifyExpandedModal.tsx` | Wrapped/focus-trapped `EngineSwitchDownloadModal`, conditional focus-visible `travel-mode-header-pill`, exit focus restore, `JamQrModal` `onRetryJam`, `vgp_oncancel` | ✓ VERIFIED | Hook order preserved; ESLint & `tsc` clean |
| `src/index.tsx` | Top-level QAM `Offline / Travel Mode` `ToggleField` (`renderTravelModeToggle`) | ✓ VERIFIED | Wired to `set_travel_mode` & `travel_mode_changed` |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Full Python backend test suite | `py -3 -m unittest discover -s tests -p "test_*.py"` | Ran 771 tests in 93.257s — OK | ✓ PASS |
| Full Vitest frontend test suite | `pnpm test -- --run` | 30 test files, 391 tests passed | ✓ PASS |
| TypeScript typecheck | `pnpm run typecheck` | Exited 0 (0 errors) | ✓ PASS |
| ESLint static analysis | `pnpm exec eslint src/` | Exited 0 (0 errors, 927 pre-existing warnings) | ✓ PASS |
| Production Rollup bundle | `pnpm run build` | Exited 0 (`created dist in 12.1s`) | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `CDP-01` | 28-01, 28-03, 28-04, 28-05, 28-06, 28-07, 28-08, 28-10 | Offline downloads via CDP `OfflineAPI` with 1-click engine switch prompt, live progress/badges, `os.statvfs` 3.0 GB guardrail, configurable storage path, & Downloads Manager | ✓ SATISFIED (pending live SteamOS UAT) | `py_modules/common.py`, `cdp_bridge.py`, `engine.py`, `rpc_library.py`, `main.py`, `OfflineStatusUI.tsx`, `SettingsTab.tsx`, `DeckifyExpandedModal.tsx` |
| `CDP-02` | 28-02, 28-03, 28-04, 28-05, 28-06, 28-07, 28-08, 28-09, 28-10 | Manual & auto Offline / Travel Mode (10s wake grace window, sticky manual lock) filtering library views to downloaded content & cached `.lrc` lyrics | ✓ SATISFIED (pending live SteamOS UAT) | `py_modules/resilience.py`, `main.py`, `src/index.tsx`, `DeckifyExpandedModal.tsx`, `SettingsTab.tsx`, `DiscoveryTab.tsx`, all 7 library/online tabs |
| `JAM-01` | 28-01, 28-03, 28-04, 28-06, 28-07, 28-08, 28-09, 28-10 | Start/share Spotify Jam from `NowPlayingTab`, `DevicesTab`, or reusable `JamQrCard`/`JamQrModal` (ready for Phase 29 `TvSplitView`) with `QRCodeSVG` & `librespot` deep-link fallback | ✓ SATISFIED (pending live SteamOS UAT) | `py_modules/cdp_bridge.py`, `main.py`, `JamQrModal.tsx`, `NowPlayingTab.tsx`, `DevicesTab.tsx`, `DeckifyExpandedModal.tsx` |

Orphaned requirements: None (all 3 Phase 28 requirements `CDP-01`, `CDP-02`, `JAM-01` in `REQUIREMENTS.md` are accounted for).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| None | - | Scanned all gap-closure modified files (`py_modules/cdp_bridge.py`, `py_modules/common.py`, `main.py`, `src/types.ts`, `JamQrModal.tsx`, `DiscoveryTab.tsx`, `SettingsTab.tsx`, `src/index.tsx`, `DeckifyExpandedModal.tsx`) for `TBD`, `FIXME`, `XXX` | - | 0 debt markers found |

### Human Verification Required

### 1. Live Official Spotify Client Offline Downloads & Disk Guardrail (SteamOS — G-28-1)
**Test:** On Steam Deck, toggle *"Download for Offline"* on a playlist, album, and podcast episode while on `librespot` (to verify `EngineSwitchDownloadModal` wrapping inside 460px, focus trap, `B`-button cancel, switching toast, and CDP readiness wait) and while on `spotify_client`. Also test lowering/raising `offline_min_free_gb` in `SettingsTab` and configuring a custom storage path.
**Expected:** `EngineSwitchDownloadModal` buttons fit cleanly, focus is trapped/restored, switching to Official Spotify Client waits for CDP readiness, live `0–100%` progress updates, green `✓` badge appears on completion, `flatpak override --user --filesystem=...` succeeds, and downloads are blocked/paused when free space is below threshold.
**Why human:** Live `com.spotify.Client` CDP `OfflineAPI`/`AlbumAPI` WebSocket evaluation (port `9229`) and GamepadUI `FocusNavController` require a running Spotify Desktop Client on SteamOS.

### 2. Wi-Fi Disconnect, Travel Mode Pill & Discovery Refresh (SteamOS — G-28-2)
**Test:** Verify *"Offline / Travel Mode"* is visible at top-level in QAM (playing and stopped); verify `travel-mode-header-pill` hides when Wi-Fi is online unless *"Show Travel Mode Button When Online"* is enabled in `SettingsTab`; focus the pill with the controller to verify its focus halo; exit Travel Mode to confirm focus restoration and `DiscoveryTab` feed reload; test Wi-Fi disconnect and wake-from-suspend.
**Expected:** Auto Travel Mode suppresses activation during the 10-second wake grace window, activates on sustained Wi-Fi disconnect, filters library tabs to downloaded items, keeps cached `.lrc` lyrics usable, restores focus cleanly on exit, and reloads `DiscoveryTab`.
**Why human:** Real SteamOS suspend/wake Wi-Fi transitions and visual inspection of focus halo / focus restoration in GamepadUI CEF require on-device testing.

### 3. Living-Room Spotify Jam QR Scanning & Controller Focus Restoration (SteamOS — G-28-3)
**Test:** Open *"Start / Share Spotify Jam"* from `NowPlayingTab` and `DevicesTab` (on both `spotify_client` and `librespot`), scan the `QRCodeSVG` with a mobile phone (or verify explicit error + `Retry Jam` if `join_url` is unavailable), and press `B` to dismiss `JamQrModal`.
**Expected:** On `spotify_client`, `QRCodeSVG` encodes the real Jam invite URL (never a track deep-link) or shows an explicit error with `Retry Jam`; on `librespot`, shows the playback share note + 1-click *"Switch to Spotify Client & Start Jam"*; `"Jam Active"` pill appears only when `join_url` is present; pressing `B` closes `JamQrModal` without closing `DeckifyExpandedModal` and restores focus.
**Why human:** Live Spotify Jam `SocialConnectAPI` session creation, physical mobile camera QR scanning, and SteamOS CEF controller focus restoration require on-device UAT.

---

_Verified: 2026-11-26T17:24:00Z_
_Verifier: the agent (gsd-verifier)_
