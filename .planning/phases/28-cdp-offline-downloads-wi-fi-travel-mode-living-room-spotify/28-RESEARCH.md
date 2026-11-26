# Phase 28: CDP Offline Downloads, Wi-Fi Travel Mode & Living Room Spotify Jam - Research

**Researched:** 2026-11-26
**Domain:** Spotify Desktop Client CDP (`OfflineAPI`, `SocialConnectAPI`), SteamOS Flatpak Storage & `os.statvfs` Guardrail, Network Resilience Travel Mode, QRCodeSVG Living Room Jam
**Confidence:** MEDIUM (Codebase integration points `[VERIFIED]`; Spotify internal `Platform.Registry` `OfflineAPI` / `SocialConnectAPI` signatures vary across Spotify Desktop Client versions `[CITED]` / `[ASSUMED]`)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Expose *"Download for Offline"* / *"Remove Download"* in three places: inside Playlist/Album/Show detail view headers, inside `CollectionActionModal` (`X` menu on playlist/album/show rows), and on individual podcast episode rows/actions in `PodcastsTab`.
- **D-02:** When the user taps *"Download for Offline"* while `librespot` is active, open a confirmation modal explaining that offline downloads require the Official Spotify Client (`spotify_client`), offering a 1-click **"Switch to Spotify Client & Download"** action (which switches engine and queues the download) or Cancel.
- **D-03:** Display live download progress (`↓ 45%`) and completed offline state (green `✓` offline badge) compactly on playlist, album, and episode rows, plus a thin download progress bar and status pill in the detail view header.
- **D-04:** Single-item *"Remove Download"* executes immediately with a confirmation toast, whereas bulk removal (**"Remove All Offline Downloads"** or multi-item removal) requires a confirmation modal before deleting cached offline data.
- **D-05:** Expose the manual **Offline / Travel Mode** toggle in three places: a quick-toggle pill in the `DeckifyExpandedModal` header/sidebar, a toggle in the Quick Access Menu (`src/index.tsx`), and full auto-trigger configuration in `SettingsTab`.
- **D-06:** Automatic Travel Mode activates on sustained Wi-Fi disconnect (after the 10-second wake-from-suspend grace window in `SessionBookmarkManager` / resilience monitoring) and automatically exits once Wi-Fi stabilizes again, **unless** the user manually enabled Travel Mode (manual Travel Mode stays sticky until toggled off).
- **D-07:** When Offline / Travel Mode is active, library tabs (`PlaylistsTab`, `AlbumsTab`, `PodcastsTab`, `LikedSongsTab`) hide non-downloaded items and display an **"Offline Travel Mode"** banner at the top with a 1-click exit/show-all action.
- **D-08:** Online-centric tabs degrade gracefully in Travel Mode: `LyricsTab` continues serving locally cached `.lrc` files (`~/.cache/deckify/lyrics/`), `DiscoveryTab` surfaces offline-available cached mixes (`discovery_mixes.json`), and `SearchTab` displays an offline notice (or filters locally available downloaded items).
- **D-09:** When `os.statvfs` reports free disk space below the configured minimum threshold on the target storage filesystem, block new downloads **and** pause/cancel any active downloads immediately with a warning toast so SteamOS never runs out of disk space mid-playlist.
- **D-10:** Make both the minimum free-space threshold (defaulting to `3.0 GB` minimum) and the offline download storage location (e.g., internal SSD vs. microSD card path) user-configurable in `SettingsTab`, with `os.statvfs` checking the exact configured storage path. — **Reversibility:** costly — changing the storage path or Flatpak/symlink mapping later requires migrating or re-syncing existing offline caches.
- **D-11:** Provide a Storage & Offline Downloads Manager in `SettingsTab` showing current free disk space on the target drive, total offline usage, a selectable overview list of all downloaded playlists/albums/episodes (allowing users to remove individual items), and a **"Remove All Offline Downloads"** bulk action guarded by a confirmation modal.
- **D-12:** Extract a reusable `<JamQrModal>` / `<JamQrCard>` component (so Phase 29's `TvSplitView` can embed or open it directly) displaying a high-contrast `QRCodeSVG` inside a white quiet-zone card, the join URL, active Jam status/guest count (when available via CDP/API), and **"End Jam"** / **"Leave Jam"** / **"Close"** controls.
- **D-13:** Trigger *"Start / Share Spotify Jam"* from both `NowPlayingTab` and `DevicesTab`.
- **D-14:** When `librespot` is active and the user opens *"Start / Share Spotify Jam"*, render the shareable track/playlist/album deep-link `QRCodeSVG` immediately with a clear note explaining it is a playback share link, alongside a 1-click **"Switch to Spotify Client & Start Jam"** button.
- **D-15:** When a live Spotify Jam session is active, display a compact **"Jam Active"** pill/badge in `NowPlayingTab` and `DevicesTab` so the host can reopen the QR modal or end the session in 1 click.

### the agent's Discretion
- Exact internal Spotify Client CDP `OfflineAPI` and `JamAPI` / `SocialConnect` / `Session` method probes inside `py_modules/cdp_bridge.py` (with defensive `try/catch` fallbacks across Spotify Desktop Client versions).
- Exact mechanism for applying the configurable offline storage path to the Spotify Client Flatpak (`com.spotify.Client` storage preference / symlink / Flatpak filesystem override) and validating write permissions before switching.
- Exact layout of the Offline Downloads Manager modal/section in `SettingsTab` and `vgp_oncancel` focus restoration on all new modals (`JamQrModal`, engine switch prompt, bulk delete confirm, Offline Downloads Manager).

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CDP-01 | User can toggle *"Download for Offline"* on playlists, albums, and podcast episodes via Official Spotify Client CDP `OfflineAPI` (with a 1-click engine switch prompt when on `librespot`), displaying live download progress (`0–100%`), green offline badges, and an `os.statvfs` 3.0 GB free-space disk guardrail. | `py_modules/cdp_bridge.py` (`evaluate_with_registry` + `OfflineAPI` multi-method probes), `main.py` (`switch_audio_backend`, `start_spotify_client`, `flatpak override --user --filesystem=...`), `os.statvfs` disk guardrail in `_exec`, and UI badges/modals in `PlaylistsTab`, `AlbumsTab`, `PodcastsTab`, `CollectionActionModal`, `SettingsTab`. |
| CDP-02 | User can toggle **Offline / Travel Mode** (or have it activate automatically on sustained Wi-Fi disconnect after the 10-second wake-from-suspend grace window) to filter library views strictly to locally downloaded content. | `py_modules/resilience.py` (`SessionBookmarkManager.on_poll_network_result` + 10s wake-from-suspend grace window), sticky manual vs auto Travel Mode state in `main.py`, offline `.lrc` lyrics (`py_modules/spotify.py`) & `discovery_mixes.json` (`py_modules/cdp_bridge.py`), and Travel Mode banner/filtering across `DeckifyExpandedModal`, QAM (`src/index.tsx`), and library tabs. |
| JAM-01 | User can start or share a Spotify Jam / group session from `NowPlayingTab`, `DevicesTab`, or `TvSplitView`, rendering a high-contrast scannable `QRCodeSVG` modal/card for living-room guests (with a shareable track/playlist deep-link QR fallback on `librespot`). | `py_modules/cdp_bridge.py` (`SocialConnectAPI` / `JamDevicesAPI` / `Session` probes), `qrcode.react` (`QRCodeSVG` v4.2.0 already installed in `package.json`), reusable `src/components/common/JamQrModal.tsx` (`<JamQrCard>` + `<JamQrModal>`), and `NowPlayingTab` / `DevicesTab` triggers + active Jam pill. |
</phase_requirements>

## Project Constraints (from GEMINI.md)

- **Steam CEF Content Security Policy:** Never render direct external image URLs (`https://i.scdn.co/`); use `DeckifyImage` / backend base64 proxy.
- **SteamOS GamepadUI Navigation:** Horizontal button/pill bars MUST use `<Focusable flow-children="horizontal">`; compact inline buttons MUST set `width: "auto"` and `flexShrink: 0` to prevent SteamOS 100% width expansion; modals MUST trap `vgp_oncancel` / `onCancelButton` and restore focus to the originating element on close.
- **Decky Loader Process Isolation:** `os.environ.pop("LD_LIBRARY_PATH", None)` is mandatory before launching subprocesses (`_build_deck_command` in `py_modules/common.py`).
- **Blocking I/O Offloading:** All `os.statvfs`, filesystem permission checks, `flatpak override` subprocesses, and CDP WebSocket evaluations MUST run inside `await _exec(...)`.
- **Single-Default Export & Hook Slot Stability:** `src/index.tsx` must keep a single default export (`definePlugin`); `DeckifyExpandedModal.tsx` must append any new `useState` hooks strictly after existing hooks (currently after `pendingDeletePlaylist` at line 260) to preserve hook slot indices in unit tests.
- **Zero New Dependencies:** Milestone v0.7 is locked to zero new npm/pip dependencies (`qrcode.react` 4.2.0 is already installed).

## Summary

Phase 28 connects three cohesive capabilities onto Deckify's existing `cdp_bridge.py`, `resilience.py`, and `@decky/ui` modal architecture without adding any external packages:

1. **CDP Offline Downloads & Disk Guardrail (`CDP-01`):** `py_modules/cdp_bridge.py` already provides `evaluate_with_registry` (`window.__deckifyRegistry`) to query internal Spotify Desktop Client services on port `9229` `[VERIFIED: py_modules/cdp_bridge.py:48-59, 107-136]`. Extending `cdp_bridge.py` with defensive `OfflineAPI` probes (`getService('OfflineAPI')`, plus `PlaylistAPI` / `ShowAPI` / `LibraryAPI` fallback metadata) enables toggling offline sync on playlists, albums, and podcast episodes, plus polling `0–100%` sync progress and enumerating all downloaded items for the `SettingsTab` Offline Downloads Manager. Every download start and active sync tick is gated by an `os.statvfs(storage_path)` free-space check (default `3.0 GB` minimum) that blocks new downloads and pauses/cancels active downloads if free space drops below threshold. Custom storage paths (e.g., microSD card) require `flatpak override --user --filesystem=<path> com.spotify.Client` plus write-permission validation and `prefs` / storage directory mapping before switching `[CITED: Flatpak sandbox documentation]`.
2. **Offline / Travel Mode (`CDP-02`):** `SessionBookmarkManager` in `py_modules/resilience.py` already tracks Wi-Fi disconnect/reconnect transitions (`on_poll_network_result`) and wake-from-suspend recovery `[VERIFIED: py_modules/resilience.py:680-716]`. Adding a 10-second wake-from-suspend grace window and sustained-disconnect detector allows automatic Travel Mode activation when offline and automatic exit when Wi-Fi stabilizes, while preserving a sticky `travel_mode_manual` flag when toggled by the user. When Travel Mode is active, library tabs filter strictly to locally downloaded items (from cached/CDP offline index), `LyricsTab` serves local `.lrc` files from `~/.cache/deckify/lyrics/` `[VERIFIED: py_modules/spotify.py:177-180]`, and `DiscoveryTab` serves `discovery_mixes.json` `[VERIFIED: py_modules/cdp_bridge.py:8]`.
3. **Living Room Spotify Jam (`JAM-01`):** `qrcode.react` (`QRCodeSVG` v4.2.0) is already installed and used in `src/index.tsx` `[VERIFIED: package.json:47; src/index.tsx:66, 1487]`. Extracting a reusable `<JamQrCard>` + `<JamQrModal>` component lets `NowPlayingTab`, `DevicesTab`, and Phase 29's `TvSplitView` render a high-contrast white quiet-zone QR code with live Jam session status (`SocialConnectAPI` / `JamDevicesAPI` via CDP) when `spotify_client` is active, or an instant deep-link share QR (`https://open.spotify.com/track/...` / `playlist/...` / `album/...`) with a 1-click **"Switch to Spotify Client & Start Jam"** button when `librespot` is active.

**Primary recommendation:** Implement all CDP `OfflineAPI` and `SocialConnectAPI` probes in `py_modules/cdp_bridge.py` with defensive multi-method fallbacks and local offline-index caching, run `os.statvfs` + `flatpak override` inside `_exec`, separate `travel_mode_enabled` / `travel_mode_manual` / `travel_mode_auto` in `main.py` + `resilience.py`, and build `<JamQrCard>` / `<JamQrModal>` as a standalone `src/components/common/JamQrModal.tsx` module.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| CDP `OfflineAPI` & `SocialConnectAPI` / `Jam` probes | Backend (`py_modules/cdp_bridge.py`) | — | Port `9229` CDP WebSocket communication and `Platform.Registry` evaluation live in Python backend. |
| Disk free-space guardrail (`os.statvfs`) & Flatpak storage path override | Backend (`main.py` / `py_modules/engine.py`) | — | Host filesystem inspection, write checks, and `flatpak override` require UID 1000 OS access via `_exec`. |
| Sustained Wi-Fi disconnect & 10s suspend grace Travel Mode trigger | Backend (`py_modules/resilience.py`, `main.py`) | Frontend (`DeckifyExpandedModal`, QAM) | `SessionBookmarkManager` owns network poll failure tracking and emits `travel_mode_changed` events to UI. |
| Offline library filtering & Travel Mode banner | Frontend (`PlaylistsTab`, `AlbumsTab`, `PodcastsTab`, `LikedSongsTab`, `SearchTab`) | Backend (`rpc_library.py`) | Backend annotates/persists offline status (`offline_state`, `offline_progress`); tabs filter and render Travel Mode banner. |
| Living Room Jam QR modal & card (`<JamQrModal>`, `<JamQrCard>`) | Frontend (`src/components/common/JamQrModal.tsx`) | Backend (`main.py` -> `cdp_bridge.py`) | Frontend renders `QRCodeSVG` and controls; backend starts/queries/ends Jam sessions via CDP. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `qrcode.react` | `^4.2.0` | `QRCodeSVG` rendering for Jam & share deep-link QR codes | Already in `package.json` (`src/index.tsx:66`) `[VERIFIED: package.json:47]` |
| `@decky/ui` | `^4.11.1` | `Focusable`, `ToggleField`, `SliderField`, `DialogButton` | Official SteamOS GamepadUI spatial navigation primitives `[VERIFIED: package.json:29]` |
| `@decky/api` | `^1.1.3` | `callable` RPCs & `addEventListener` push events | Official Decky Loader RPC bridge `[VERIFIED: package.json:46]` |
| `react-icons` | `^5.5.0` | Download, offline check, Wi-Fi/plane, and Jam QR icons | Already in `package.json` `[VERIFIED: package.json:48]` |
| Python stdlib (`os`, `shutil`, `subprocess`, `json`) | `3.11+` / `3.14` | `os.statvfs` disk guardrail, `flatpak override`, atomic cache | Zero external dependencies; matches Decky PyInstaller sandbox `[VERIFIED: py_modules/common.py]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `OfflineAPI` via CDP | `librespot` audio stream caching | Violates Spotify ToS (explicitly Out of Scope in `REQUIREMENTS.md:71`). |
| `flatpak override --user --filesystem=...` | Bare symlink inside `~/.var/app/com.spotify.Client/cache/spotify` | Bare symlinks fail across Flatpak sandbox boundaries `[CITED: Flatpak sandbox behavior]`. |

**Installation:**
No new packages required (`pnpm install` already includes all dependencies).

## Package Legitimacy Audit

> No new external packages are installed in Phase 28. All dependencies are pre-existing in `package.json`.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `qrcode.react` | npm | 8+ yrs | 2M+/wk | `github.com/zpao/qrcode.react` | `[OK]` | Pre-installed (`^4.2.0`) `[VERIFIED: package.json:47]` |
| `react-icons` | npm | 8+ yrs | 4M+/wk | `github.com/react-icons/react-icons` | `[OK]` | Pre-installed (`^5.5.0`) `[VERIFIED: package.json:48]` |

## Architecture Patterns

### System Architecture Diagram

```text
  [User / GamepadUI]
         │
         ├──▶ NowPlayingTab / DevicesTab ──▶ <JamQrModal> (<JamQrCard> + QRCodeSVG)
         │                                         │
         │                                         ├─ spotify_client ─▶ CDP SocialConnectAPI / JamAPI
         │                                         └─ librespot ──────▶ Deep-link QR + 1-click Switch
         │
         ├──▶ PlaylistsTab / AlbumsTab / PodcastsTab / CollectionActionModal
         │         │
         │         ├─ librespot ──────▶ 1-click "Switch to Spotify Client & Download" Modal
         │         └─ spotify_client ─▶ main.py:toggle_offline_download()
         │                                    │
         │                                    ├─ 1. _exec(check_disk_guardrail, storage_path, min_gb)
         │                                    │      └─ os.statvfs < min_gb ─▶ Block + Pause/Cancel active
         │                                    └─ 2. _exec(cdp_bridge.cdp_set_offline_download)
         │                                           └─ OfflineAPI (addDownload / removeDownload)
         │
         └──▶ SessionBookmarkManager (resilience.py)
                   └─ Sustained Wi-Fi drop (>10s wake grace) ─▶ auto Travel Mode ON
                   └─ Wi-Fi stabilized (if !travel_mode_manual) ─▶ auto Travel Mode OFF
                   └─ Filters Playlists/Albums/Podcasts/Liked + serves .lrc & discovery_mixes.json
```

### Pattern 1: Defensive Multi-Method CDP Probing (`OfflineAPI` & `SocialConnectAPI`)
**What:** Spotify Desktop Client's `Platform.Registry` internal method names shift across client updates `[CITED: Spicetify Platform API docs]`. Probe candidate service names and method signatures in priority order inside `evaluate_with_registry(...)` (`py_modules/cdp_bridge.py`).
**When to use:** All `OfflineAPI` (download toggle, progress, list) and `SocialConnectAPI` / `JamDevicesAPI` (start/get/end Jam) calls.
**Example (CDP `OfflineAPI` probe skeleton — exact method signatures `[ASSUMED]` pending live client verification):**
```python
# Source: Pattern from py_modules/cdp_bridge.py:107-136
body_js = f"""
const offlineApi = getService('OfflineAPI');
const playlistApi = getService('PlaylistAPI');
const uri = {json.dumps(uri)};
const download = {json.dumps(bool(download))};
if (!offlineApi && !playlistApi) {{
  return {{ ok: false, error: 'OfflineAPI unavailable' }};
}}
if (download) {{
  if (offlineApi && typeof offlineApi.addDownload === 'function') {{
    await offlineApi.addDownload(uri);
    return {{ ok: true, method: 'OfflineAPI.addDownload' }};
  }}
  if (offlineApi && typeof offlineApi.sync === 'function') {{
    await offlineApi.sync(uri);
    return {{ ok: true, method: 'OfflineAPI.sync' }};
  }}
  if (playlistApi && typeof playlistApi.setOffline === 'function') {{
    await playlistApi.setOffline(uri, true);
    return {{ ok: true, method: 'PlaylistAPI.setOffline' }};
  }}
}} else {{
  if (offlineApi && typeof offlineApi.removeDownload === 'function') {{
    await offlineApi.removeDownload(uri);
    return {{ ok: true, method: 'OfflineAPI.removeDownload' }};
  }}
  if (playlistApi && typeof playlistApi.setOffline === 'function') {{
    await playlistApi.setOffline(uri, false);
    return {{ ok: true, method: 'PlaylistAPI.setOffline' }};
  }}
}}
return {{ ok: false, error: 'No supported offline toggle method found' }};
"""
```

### Pattern 2: Disk Free-Space Guardrail (`os.statvfs` + Active Download Abort)
**What:** Check `os.statvfs(target_path)` inside `_exec(...)` before starting any download and during active download progress polling. Compute `free_bytes = st.f_bavail * st.f_frsize` (available to non-root `deck` user, not `f_bfree` which includes root-reserved blocks!).
**When to use:** `toggle_offline_download`, `get_offline_status` polling loop, and `SettingsTab` storage readout.
**Cross-platform test note:** `os.statvfs` does not exist on Windows (where unit tests run). Implement a helper `get_disk_space_info(path: str)` that uses `os.statvfs(path)` when `hasattr(os, "statvfs")` and falls back to `shutil.disk_usage(path)` on Windows, allowing unit tests to mock `os.statvfs` cleanly on Linux or patch `get_disk_space_info`.

### Pattern 3: Flatpak Configurable Storage Path + Permission Override
**What:** When user configures `offline_storage_path` in `SettingsTab` (e.g., `/run/media/mmcblk0p1/deckify-offline` on microSD vs default `~/.var/app/com.spotify.Client/cache/spotify`):
1. Validate path exists (or can be created) and is writable (`os.access` + temp write test inside `_exec`).
2. Grant Flatpak sandbox access via `_build_deck_command(["flatpak", "override", "--user", f"--filesystem={resolved_path}", SPOTIFY_FLATPAK_ID])`.
3. Update Spotify `prefs` (`storage.offline-path` / `offline.sync.location` `[ASSUMED]`) and/or manage the `Storage` directory symlink inside `SPOTIFY_CLIENT_CACHE_DIR` while `spotify_client` is stopped, then restart `spotify_client` if it was running.
4. Persist `offline_storage_path` in `settings.json` so `os.statvfs` always checks the exact configured mount point.

### Pattern 4: Auto Travel Mode with 10s Wake-from-Suspend Grace Window & Sticky Manual Override
**What:** Track three distinct booleans in settings/runtime:
- `travel_mode_enabled`: effective active state (`bool`)
- `travel_mode_manual`: `True` when user explicitly toggled Travel Mode ON (`bool`, sticky across Wi-Fi reconnects)
- `travel_mode_auto_enabled`: whether sustained Wi-Fi disconnect auto-activates Travel Mode (`bool`, default `True`)
**Lifecycle:**
- On system wake/resume (`SuspendResumeMonitor` or `_last_recovery_ts` in `SessionBookmarkManager`), suppress auto Travel Mode activation for `10.0` seconds (`WAKE_GRACE_WINDOW_S = 10.0`) so Wi-Fi has time to re-associate.
- On sustained Wi-Fi disconnect (`on_poll_network_result(False)` past grace window + wake grace window), set `travel_mode_enabled = True` (leaving `travel_mode_manual = False`) and emit `travel_mode_changed`.
- On Wi-Fi stabilization (`on_poll_network_result(True)`), if `travel_mode_enabled` and `not travel_mode_manual`, automatically set `travel_mode_enabled = False` and emit `travel_mode_changed`.
- When user manually toggles Travel Mode ON, set both `travel_mode_enabled = True` and `travel_mode_manual = True`. When toggled OFF, clear both.

### Pattern 5: Reusable `<JamQrCard>` & `<JamQrModal>` for Phase 28 & Phase 29
**What:** Create `src/components/common/JamQrModal.tsx` exporting both:
- `JamQrCard`: Pure card containing white quiet-zone wrapper (`background: "#FFFFFF", padding: 12, borderRadius: 10`), `<QRCodeSVG value={qrUrl} size={180} bgColor="#FFFFFF" fgColor="#000000" level="M" />`, join URL text, guest count / Jam status badge, and `librespot` deep-link fallback note + 1-click **"Switch to Spotify Client & Start Jam"** button when `audioBackend !== "spotify_client"`.
- `JamQrModal`: Controller-safe modal overlay wrapping `<JamQrCard>` with **"End Jam"** / **"Leave Jam"** / **"Close (B)"** `InteractiveRow` buttons, `vgp_oncancel` / `onCancelButton` handling, and `previousFocusRef` restoration.

### Anti-Patterns to Avoid
- **Using `st.f_bfree` instead of `st.f_bavail`:** `f_bfree` includes 5% ext4 root-reserved blocks unavailable to the `deck` user (UID 1000). Always use `f_bavail * f_frsize`.
- **Inserting `useState` in the middle of `DeckifyExpandedModal.tsx`:** Breaks hook slot order in `DeckifyExpandedModal.test.tsx`. Always append new `useState` hooks after `pendingDeletePlaylist`.
- **Forgetting `width: "auto"` on header/banner `DialogButton`s:** SteamOS GamepadUI forces `DialogButton` to `100%` width unless `width: "auto"` and `flexShrink: 0` are set `[VERIFIED: 28-CONTEXT.md:89]`.
- **Unprotected `vgp_oncancel` on new modals:** Pressing `B` while `JamQrModal`, `EngineSwitchDownloadModal`, or bulk delete confirm is open would close the entire `DeckifyExpandedModal` instead of just the sub-modal unless `vgp_oncancel` checks those modal refs first (just like `isCrudModalOpenRef` at `src/components/DeckifyExpandedModal.tsx:1559`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| QR Code SVG generation | Custom SVG matrix generator | `QRCodeSVG` from `qrcode.react` (`^4.2.0`) | Already installed and tested in `src/index.tsx:66` |
| Offline `.lrc` caching | New lyrics offline store | Existing `~/.cache/deckify/lyrics/` in `py_modules/spotify.py` | Already persists `.lrc` files with metadata tags `[VERIFIED: py_modules/spotify.py:177-222]` |
| Offline Discovery mixes | New discovery cache | Existing `discovery_mixes.json` in `py_modules/cdp_bridge.py` | Already persists algorithmic mixes for offline/librespot `[VERIFIED: py_modules/cdp_bridge.py:8]` |
| Controller modal focus trap | Custom keydown listener | `CollectionActionModal` pattern (`previousFocusRef` + `requestAnimationFrame` + `vgp_oncancel` guard) | Proven across `TrackActionModal` and `CollectionActionModal` `[VERIFIED: src/components/common/CollectionActionModal.tsx:86-100]` |

## Common Pitfalls

### Pitfall 1: `os.statvfs` Missing on Windows Dev Machines
**What goes wrong:** Calling `os.statvfs(...)` directly in `py_modules` causes `AttributeError: module 'os' has no attribute 'statvfs'` when running `py -3 -m unittest` on Windows.
**How to avoid:** Wrap in `if hasattr(os, "statvfs"): ... else: shutil.disk_usage(path)` and expose a clean `get_disk_space_bytes(path)` helper for unit testing.

### Pitfall 2: Flatpak Sandbox Rejecting External/microSD Storage Paths
**What goes wrong:** Setting a microSD path (`/run/media/mmcblk0p1/...`) in Spotify `prefs` or via symlink fails silently because `com.spotify.Client` Flatpak has no permission outside `~/.var/app/com.spotify.Client`.
**How to avoid:** Run `flatpak override --user --filesystem=<target_dir> com.spotify.Client` via `_build_deck_command` and verify write access before persisting `offline_storage_path`.

### Pitfall 3: Spotify Client `OfflineAPI` / `SocialConnectAPI` Version Drift
**What goes wrong:** Hardcoding a single `OfflineAPI.addDownload` or `SocialConnectAPI.createSession` signature breaks if the user's Flatpak Spotify version uses a slightly different method name or argument shape.
**How to avoid:** Probe multiple known candidate method names/signatures inside `evaluate_with_registry` with `typeof ... === 'function'` guards and `try/catch`, returning `{ ok: false, error: ... }` cleanly when unavailable.

### Pitfall 4: Wake-from-Suspend Triggering False Travel Mode
**What goes wrong:** Steam Deck waking from suspend takes 3–8 seconds for `wpa_supplicant`/`NetworkManager` to reconnect Wi-Fi; polling immediately during wake would falsely flip Travel Mode ON.
**How to avoid:** Enforce the 10-second wake-from-suspend grace window (`WAKE_GRACE_WINDOW_S = 10.0`) after `SuspendResumeMonitor` resume or `SessionBookmarkManager` recovery before allowing auto Travel Mode to engage.

### Pitfall 5: `QRCodeSVG` Unscannable in Dark Theme
**What goes wrong:** Rendering a dark-mode transparent QR code on `#1c1c1c` background makes phone cameras fail to detect finder patterns.
**How to avoid:** Always wrap `<QRCodeSVG bgColor="#FFFFFF" fgColor="#000000" />` inside a solid `#FFFFFF` container with `padding: 12px`–`16px` quiet zone (D-12).

## Code Examples

### Disk Space Guardrail Helper (Python)
```python
import os
import shutil

def get_disk_free_bytes(path: str) -> int:
    """Return free bytes available to non-root user on the filesystem hosting path."""
    target = os.path.abspath(os.path.expanduser(path))
    while target and not os.path.exists(target):
        parent = os.path.dirname(target)
        if parent == target:
            break
        target = parent
    if hasattr(os, "statvfs"):
        st = os.statvfs(target)
        return int(st.f_bavail) * int(st.f_frsize)
    usage = shutil.disk_usage(target)
    return int(usage.free)
```

### Reusable `<JamQrCard>` Quiet-Zone Pattern (TSX)
```tsx
import { QRCodeSVG } from "qrcode.react";

<div
  style={{
    background: "#FFFFFF",
    padding: 14,
    borderRadius: 12,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  }}
>
  <QRCodeSVG value={qrUrl} size={180} bgColor="#FFFFFF" fgColor="#000000" level="M" />
</div>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Spotify Group Sessions | Spotify Jam (`spotify:jam` / `open.spotify.com/jam/...`) | 2023–2024 | Host shares dynamic Jam join URL / QR via `SocialConnectAPI` `[CITED: Spotify Support]` |
| Direct `librespot` cache | Official Spotify Client `OfflineAPI` via CDP | Deckify v0.7 | Compliant with Spotify DRM/ToS `[VERIFIED: REQUIREMENTS.md:71]` |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Spotify Desktop Client `Platform.Registry` exposes `OfflineAPI` with `addDownload`/`removeDownload`/`getDownloads`/`getOfflineStatus` (or `PlaylistAPI.setOffline` / `sync`) | Architecture Patterns / CDP Probes | Probe returns `{ ok: false, error }` cleanly; may need method name adjustment against live SteamOS Spotify Flatpak version |
| A2 | Spotify Desktop Client `Platform.Registry` exposes `SocialConnectAPI` / `JamDevicesAPI` for starting/inspecting/ending Jam sessions and reading `joinUrl`/`activeGuests` | Architecture Patterns / JAM-01 | Falls back to shareable track/playlist/album deep-link QR (`https://open.spotify.com/...`) if Jam CDP method is unavailable |
| A3 | Spotify `prefs` key `storage.offline-path` / `offline.sync.location` or `Storage` symlink inside `SPOTIFY_CLIENT_CACHE_DIR` controls Flatpak offline storage path | Architecture Patterns / Storage | `flatpak override --user --filesystem=<path>` + `Storage` symlink provides reliable fallback if `prefs` key differs |

## Open Questions (RESOLVED)

1. **Exact `OfflineAPI` & `SocialConnectAPI` method signatures on current `com.spotify.Client` Flatpak**
   - What we know: Spicetify exposes `OfflineAPI` and `SocialConnectAPI` via `Platform.Registry._map`, which `cdp_bridge.py` already traverses via `getService(...)`.
   - What's unclear: Exact method names on the latest SteamOS Flatpak build (since Spotify obfuscates internal APIs between releases).
   - **RESOLVED:** Implemented via multi-candidate defensive probing in `py_modules/cdp_bridge.py` (`28-01-PLAN.md` Tasks 1–2: trying `OfflineAPI.addDownload`/`sync`/`PlaylistAPI.setOffline` and `SocialConnectAPI.createSession`/`startJam`/`getSession` with `typeof ... === 'function'` guards), backed by a local `~/.cache/deckify/offline_downloads.json` metadata index so Travel Mode filtering works reliably even when `spotify_client` is stopped, and a deep-link QR fallback when `Jam` CDP methods are unavailable.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Rollup build, Vitest | ✓ | v25.1.0 | — |
| pnpm | Package scripts & test runner | ✓ | 10.28.0 | — |
| Python | Backend unit tests (`unittest`) | ✓ | 3.14.0 | — |
| `os.statvfs` | Linux disk guardrail | ✗ (Windows dev host) | — | `shutil.disk_usage` fallback + `os.statvfs` mock in unit tests |
| `flatpak` (`com.spotify.Client`) | SteamOS runtime only | ✗ (Windows dev host) | — | Mocked in `unittest` via `_build_deck_command` / `subprocess.run` |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `5.1.0` (Frontend) + Python `unittest` (Backend) |
| Config file | `package.json` (`test`, `test:python`) |
| Quick run command | `py -3 -m unittest tests/test_cdp_bridge.py -q` / `pnpm test -- src/utils.test.ts` |
| Full suite command | `pnpm test && py -3 -m unittest discover -s tests -p "test_*.py"` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CDP-01 | `OfflineAPI` CDP probes, `os.statvfs` 3.0 GB guardrail, active download abort, `flatpak override` storage path, UI badges & engine switch prompt | unit | `py -3 -m unittest tests/test_offline_downloads.py -q` & `pnpm test -- src/components/DeckifyExpandedModal.test.tsx` | ❌ Wave 0 (`tests/test_offline_downloads.py`) |
| CDP-02 | Sustained Wi-Fi disconnect Travel Mode activation (after 10s wake grace), auto-exit vs sticky manual lock, library tab filtering & `.lrc` / `discovery_mixes.json` fallback | unit | `py -3 -m unittest tests/test_travel_mode.py -q` & `pnpm test -- src/components/DeckifyExpandedModal.test.tsx` | ❌ Wave 0 (`tests/test_travel_mode.py`) |
| JAM-01 | `SocialConnectAPI` Jam CDP start/status/end, `<JamQrModal>`/`<JamQrCard>` white quiet-zone `QRCodeSVG`, `librespot` deep-link fallback + 1-click switch | unit | `py -3 -m unittest tests/test_cdp_bridge.py -q` & `pnpm test -- src/components/common/JamQrModal.test.tsx` | ❌ Wave 0 (`src/components/common/JamQrModal.test.tsx`) |

### Sampling Rate
- **Per task commit:** Targeted `py -3 -m unittest tests/test_<module>.py -q` or `pnpm test -- <file>`
- **Per wave merge:** `pnpm lint && pnpm typecheck && pnpm test && py -3 -m unittest discover -s tests -p "test_*.py"`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/test_offline_downloads.py` — covers `CDP-01` (`OfflineAPI` probes, `os.statvfs` guardrail, storage path override)
- [ ] `tests/test_travel_mode.py` — covers `CDP-02` (10s wake grace window, sticky manual vs auto exit, offline filtering)
- [ ] `src/components/common/JamQrModal.test.tsx` — covers `JAM-01` (`JamQrCard`/`JamQrModal` rendering, `librespot` deep-link fallback, `vgp_oncancel` focus restore)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Uses existing Spotify OAuth / local CDP |
| V3 Session Management | no | Uses existing `SessionBookmarkManager` |
| V4 Access Control | yes | `flatpak override --user` scoped strictly to user-configured directory (never `--filesystem=host` unless explicitly chosen) |
| V5 Input Validation | yes | Validate `offline_storage_path` (reject empty/relative/control chars, verify `os.path.isdir` & writeability) and clamp `offline_min_free_gb` (`0.5`–`50.0` GB) |
| V6 Cryptography | no | No custom crypto |

### Known Threat Patterns for SteamOS / Flatpak / CDP

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal / shell injection in `offline_storage_path` | Tampering | Pass list-form args `["flatpak", "override", "--user", f"--filesystem={abspath}", SPOTIFY_FLATPAK_ID]` (no `shell=True`), reject newlines/null bytes |
| Disk exhaustion on SteamOS root/home partition | Denial of Service | Enforce `os.statvfs` `f_bavail * f_frsize >= min_free_gb * 1024**3` pre-download and during progress polling |

## Sources

### Primary (HIGH confidence)
- Codebase files read in session: `py_modules/cdp_bridge.py`, `py_modules/resilience.py`, `py_modules/engine.py`, `py_modules/common.py`, `main.py`, `src/types.ts`, `src/components/common/CollectionActionModal.tsx`, `src/components/DeckifyExpandedModal.tsx`, `package.json`

### Secondary (MEDIUM confidence)
- Spicetify `Platform.Registry` (`OfflineAPI`, `SocialConnectAPI`) community documentation & Flatpak `com.spotify.Client` sandbox override (`flatpak override --user --filesystem=...`)

### Tertiary (LOW confidence)
- Exact internal `OfflineAPI` and `SocialConnectAPI` method signatures across Spotify Desktop Client versions (tagged `[ASSUMED]` in Assumptions Log; mitigated with multi-method defensive probing).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All packages (`qrcode.react`, `@decky/ui`, `react-icons`) already installed and verified in `package.json`.
- Architecture: HIGH - All integration points (`cdp_bridge.py`, `resilience.py`, `DeckifyExpandedModal.tsx`, `CollectionActionModal.tsx`) verified in source.
- Pitfalls: HIGH - Windows `os.statvfs`, Flatpak sandbox, `useState` hook slot order, and SteamOS `DialogButton` width traps directly observed.

**Research date:** 2026-11-26
**Valid until:** 2026-12-26 (30 days)
