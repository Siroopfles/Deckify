# Phase 28: CDP Offline Downloads, Wi-Fi Travel Mode & Living Room Spotify Jam - Context

**Gathered:** 2026-11-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver `CDP-01`, `CDP-02`, and `JAM-01`:
1. **CDP Offline Downloads (`CDP-01`):** Toggle *"Download for Offline"* / *"Remove Download"* on playlists, albums, and podcast episodes via Official Spotify Client CDP `OfflineAPI` (`py_modules/cdp_bridge.py`), with a 1-click engine switch confirmation prompt when on `librespot`, live `0–100%` download progress, green offline badges, a user-configurable free-space disk guardrail (`os.statvfs`, `3.0 GB` default minimum) + configurable offline storage path, and an Offline Downloads Manager overview in `SettingsTab` for selective or bulk removal.
2. **Offline / Travel Mode (`CDP-02`):** Manual toggle (modal header/sidebar pill + QAM toggle + `SettingsTab`) and automatic activation on sustained Wi-Fi disconnect (after the 10-second wake-from-suspend grace window, auto-exiting when Wi-Fi stabilizes unless manually locked ON) that filters library views strictly to locally downloaded content and cached `.lrc` lyrics.
3. **Living Room Spotify Jam (`JAM-01`):** Start or share a Spotify Jam / group session from `NowPlayingTab`, `DevicesTab`, and a reusable `<JamQrModal>` / `<JamQrCard>` component ready for Phase 29's `TvSplitView`, rendering a high-contrast scannable `QRCodeSVG` modal with active Jam status/controls (and a shareable track/playlist deep-link QR + 1-click engine switch fallback when `librespot` is active).

</domain>

<decisions>
## Implementation Decisions

### Offline Downloads UX & Engine Prompt (`CDP-01`)
- **D-01:** Expose *"Download for Offline"* / *"Remove Download"* in three places: inside Playlist/Album/Show detail view headers, inside `CollectionActionModal` (`X` menu on playlist/album/show rows), and on individual podcast episode rows/actions in `PodcastsTab`.
- **D-02:** When the user taps *"Download for Offline"* while `librespot` is active, open a confirmation modal explaining that offline downloads require the Official Spotify Client (`spotify_client`), offering a 1-click **"Switch to Spotify Client & Download"** action (which switches engine and queues the download) or Cancel.
- **D-03:** Display live download progress (`↓ 45%`) and completed offline state (green `✓` offline badge) compactly on playlist, album, and episode rows, plus a thin download progress bar and status pill in the detail view header.
- **D-04:** Single-item *"Remove Download"* executes immediately with a confirmation toast, whereas bulk removal (**"Remove All Offline Downloads"** or multi-item removal) requires a confirmation modal before deleting cached offline data.

### Offline / Travel Mode Triggers & Filtering (`CDP-02`)
- **D-05:** Expose the manual **Offline / Travel Mode** toggle in three places: a quick-toggle pill in the `DeckifyExpandedModal` header/sidebar, a toggle in the Quick Access Menu (`src/index.tsx`), and full auto-trigger configuration in `SettingsTab`.
- **D-06:** Automatic Travel Mode activates on sustained Wi-Fi disconnect (after the 10-second wake-from-suspend grace window in `SessionBookmarkManager` / resilience monitoring) and automatically exits once Wi-Fi stabilizes again, **unless** the user manually enabled Travel Mode (manual Travel Mode stays sticky until toggled off).
- **D-07:** When Offline / Travel Mode is active, library tabs (`PlaylistsTab`, `AlbumsTab`, `PodcastsTab`, `LikedSongsTab`) hide non-downloaded items and display an **"Offline Travel Mode"** banner at the top with a 1-click exit/show-all action.
- **D-08:** Online-centric tabs degrade gracefully in Travel Mode: `LyricsTab` continues serving locally cached `.lrc` files (`~/.cache/deckify/lyrics/`), `DiscoveryTab` surfaces offline-available cached mixes (`discovery_mixes.json`), and `SearchTab` displays an offline notice (or filters locally available downloaded items).

### Configurable Disk Guardrail & Storage Management (`CDP-01`)
- **D-09:** When `os.statvfs` reports free disk space below the configured minimum threshold on the target storage filesystem, block new downloads **and** pause/cancel any active downloads immediately with a warning toast so SteamOS never runs out of disk space mid-playlist.
- **D-10:** Make both the minimum free-space threshold (defaulting to `3.0 GB` minimum) and the offline download storage location (e.g., internal SSD vs. microSD card path) user-configurable in `SettingsTab`, with `os.statvfs` checking the exact configured storage path. — **Reversibility:** costly — changing the storage path or Flatpak/symlink mapping later requires migrating or re-syncing existing offline caches.
- **D-11:** Provide a Storage & Offline Downloads Manager in `SettingsTab` showing current free disk space on the target drive, total offline usage, a selectable overview list of all downloaded playlists/albums/episodes (allowing users to remove individual items), and a **"Remove All Offline Downloads"** bulk action guarded by a confirmation modal.

### Living Room Spotify Jam & QR Modal (`JAM-01`)
- **D-12:** Extract a reusable `<JamQrModal>` / `<JamQrCard>` component (so Phase 29's `TvSplitView` can embed or open it directly) displaying a high-contrast `QRCodeSVG` inside a white quiet-zone card, the join URL, active Jam status/guest count (when available via CDP/API), and **"End Jam"** / **"Leave Jam"** / **"Close"** controls.
- **D-13:** Trigger *"Start / Share Spotify Jam"* from both `NowPlayingTab` and `DevicesTab`.
- **D-14:** When `librespot` is active and the user opens *"Start / Share Spotify Jam"*, render the shareable track/playlist/album deep-link `QRCodeSVG` immediately with a clear note explaining it is a playback share link, alongside a 1-click **"Switch to Spotify Client & Start Jam"** button.
- **D-15:** When a live Spotify Jam session is active, display a compact **"Jam Active"** pill/badge in `NowPlayingTab` and `DevicesTab` so the host can reopen the QR modal or end the session in 1 click.

### the agent's Discretion
- Exact internal Spotify Client CDP `OfflineAPI` and `JamAPI` / `SocialConnect` / `Session` method probes inside `py_modules/cdp_bridge.py` (with defensive `try/catch` fallbacks across Spotify Desktop Client versions).
- Exact mechanism for applying the configurable offline storage path to the Spotify Client Flatpak (`com.spotify.Client` storage preference / symlink / Flatpak filesystem override) and validating write permissions before switching.
- Exact layout of the Offline Downloads Manager modal/section in `SettingsTab` and `vgp_oncancel` focus restoration on all new modals (`JamQrModal`, engine switch prompt, bulk delete confirm, Offline Downloads Manager).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & Requirements
- `.planning/ROADMAP.md` — Phase 28 goal and 3 success criteria
- `.planning/REQUIREMENTS.md` — `CDP-01`, `CDP-02`, and `JAM-01` requirement definitions
- `.planning/phases/26-unified-cdp-platform-bridge-deep-discovery-2-0/26-CONTEXT.md` — Unified `cdp_bridge.py` architecture (`D-01`, `D-02`)

### Existing CDP, Resilience, Library & UI Implementation
- `py_modules/cdp_bridge.py` — Unified `Platform.Registry` CDP evaluator on port `9229` (`evaluate_with_registry`, `is_spotify_client_running`)
- `py_modules/resilience.py` — `SessionBookmarkManager`, Wi-Fi drop detection & wake-from-suspend grace window
- `py_modules/engine.py` — Engine lifecycle (`spotify_client` vs `librespot` switching)
- `py_modules/rpc_library.py` — Playlist, album, podcast, and discovery RPCs
- `py_modules/rpc_playback.py` — Playback & device transfer RPCs
- `py_modules/common.py` — Settings persistence (`_save_settings`, `DEFAULT_SETTINGS`, `_exec`)
- `src/components/tabs/PlaylistsTab.tsx` — Playlist detail header & list rendering
- `src/components/tabs/AlbumsTab.tsx` — Album detail header & list rendering
- `src/components/tabs/PodcastsTab.tsx` — Show/episode rows & `resume_point` badges
- `src/components/tabs/NowPlayingTab.tsx` — Transport & secondary action controls
- `src/components/tabs/DevicesTab.tsx` — Connect hub & engine switching
- `src/components/tabs/SettingsTab.tsx` — Settings cards & confirmation modal patterns
- `src/components/common/CollectionActionModal.tsx` — `X`-button collection actions
- `src/components/DeckifyExpandedModal.tsx` — Modal header/sidebar, `vgp_oncancel`, and tab state wiring
- `src/index.tsx` — Quick Access Menu (`Content`) controls

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `py_modules/cdp_bridge.py`: Centralized `evaluate_with_registry` (`window.__deckifyRegistry`) with `0ms` fast-fail when `spotify_client` is not running.
- `py_modules/resilience.py`: `SessionBookmarkManager` already tracks Wi-Fi disconnect/reconnect transitions and wake-from-suspend grace windows.
- `qrcode.react` (`QRCodeSVG`): Already installed in `package.json` and used in Deckify for mobile OAuth QR rendering.
- `src/components/common/CollectionActionModal.tsx` & `SettingsTab.tsx`: Established controller-safe modal patterns with `vgp_oncancel` and focus restoration.

### Established Patterns
- Blocking filesystem (`os.statvfs`), socket, and CDP operations in Python RPC handlers must run inside `await _exec(...)`.
- Horizontal pill/button bars in GamepadUI must use `<Focusable flow-children="horizontal">`, and compact buttons must use `width: "auto"` / `flexShrink: 0` to prevent SteamOS 100% width expansion.
- Offline `.lrc` lyrics cache (`~/.cache/deckify/lyrics/`) and `discovery_mixes.json` (`~/.cache/deckify/discovery_mixes.json`) already provide local disk persistence for offline playback.

### Integration Points
- `main.py`: Expose new RPCs for offline downloads (`toggle_offline_download`, `get_offline_status`, `get_offline_downloads_list`, `remove_all_offline_downloads`, `set_offline_storage_path`, `set_travel_mode`) and Spotify Jam (`start_spotify_jam`, `get_jam_status`, `end_spotify_jam`).
- `src/types.ts`: Extend `PluginStatus` / `DeckifySettings` (`travel_mode_enabled`, `travel_mode_manual`, `offline_min_free_gb`, `offline_storage_path`, `jam_session`) and collection/episode items (`offline_state`, `offline_progress`).

</code_context>

<specifics>
## Specific Ideas

- User specifically requested:
  - Configurable minimum free-space threshold in `SettingsTab` (defaulting to `3.0 GB`) **and** configurable offline download storage location (e.g., internal SSD vs. microSD card), with `os.statvfs` checking that configured path.
  - A selectable overview list of all downloaded items in `SettingsTab` so individual downloads can be inspected and removed, plus confirmation modals on bulk removal / "Remove All Offline Downloads".
  - Reusable `<JamQrModal>` / `<JamQrCard>` design so Phase 29's `TvSplitView` can embed it directly.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

### Reviewed Todos (not folded)
- `2026-11-21-investigate-decky-loader-breakage-after-steam-update.md` — Low keyword match (`0.2`); unrelated to Phase 28 Offline Downloads, Travel Mode & Spotify Jam.

</deferred>

---

*Phase: 28-cdp-offline-downloads-wi-fi-travel-mode-living-room-spotify*
*Context gathered: 2026-11-26*
