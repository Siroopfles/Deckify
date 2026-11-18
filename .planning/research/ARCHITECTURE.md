# Architecture Research

**Domain:** Decky Loader Spotify Client & Audio Engine Subsystem (SteamOS GamepadUI) — Milestone v0.7 (Studio, Living Room TV, Offline Travel & Ultimate Immersion)
**Researched:** 2026-11-18
**Confidence:** HIGH

## Standard Architecture

### System Overview

Deckify v0.7 extends the existing four-layer SteamOS architecture (React/GamepadUI Frontend ↔ Decky RPC/Event Bus ↔ Python Asyncio Supervision Daemon ↔ PipeWire/CDP/D-Bus Host OS Layer) with **four new backend domain modules** (`cdp_bridge.py`, `stats.py`, `lyrics_engine.py`, `spectrum.py`) and **two new full-screen view modes** (`TvSplitView.tsx`, `StatsTab.tsx`), while enriching existing tabs and overlays without breaking existing RPC contracts or controller spatial navigation invariants.

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│                   FRONTEND: SteamOS GamepadUI (React 19 / CEF)                    │
├───────────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────┐  ┌──────────────────────────┐  ┌──────────────────────┐  │
│  │  QuickAccessMenu    │  │   DeckifyExpandedModal   │  │   DeckifyOverlay     │  │
│  │  (src/index.tsx)    │  │ (Full-Screen 16-Tab Hub) │  │ (Gamescope HUD 2.0)  │  │
│  │  • Quick-Chords 2.0 │  │  • NEW: TvSplitView      │  │  • Silent Track Toast│  │
│  │  • Eco-Mode Monitor │  │  • NEW: StatsTab         │  │  • Chord Feedback    │  │
│  │  • Theme CSS Vars   │  │  • Queue/Playlist Studio │  │  • Dynamic Accent    │  │
│  └──────────┬──────────┘  └─────────────┬────────────┘  └──────────┬───────────┘  │
│             │                           │                          │              │
├─────────────┴───────────────────────────┴──────────────────────────┴──────────────┤
│                    IPC BRIDGE: @decky/api (callable / decky.emit)                 │
├───────────────────────────────────────────────────────────────────────────────────┤
│                   BACKEND: Python 3.11+ Asyncio Router (main.py)                  │
├───────────────────────────────────────────────────────────────────────────────────┤
│  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐ ┌────────────────────┐  │
│  │ rpc_playback & │ │ cdp_bridge.py  │ │   stats.py     │ │ lyrics_engine.py   │  │
│  │ rpc_library    │ │ (NEW Module)   │ │ (NEW Module)   │ │ (NEW Module)       │  │
│  │ • Radio / Jam  │ │ • OfflineAPI   │ │ • Deck Wrapped │ │ • .lrc Disk Cache  │  │
│  │ • Crossfade    │ │ • Pathfinder   │ │ • Scrobbler    │ │ • Track Offset Map │  │
│  │ • Connect 2.0  │ │ • Queue Studio │ │ • JSON Backup  │ │ • Romanization     │  │
│  └───────┬────────┘ └───────┬────────┘ └───────┬────────┘ └─────────┬──────────┘  │
│          │                  │                  │                    │             │
│  ┌───────┴────────┐ ┌───────┴────────┐ ┌───────┴────────┐ ┌─────────┴──────────┐  │
│  │ soundtrack.py  │ │ equalizer.py & │ │   images.py    │ │   spectrum.py      │  │
│  │ & dock.py      │ │ volume.py      │ │ • RGB Palette  │ │ (NEW Module)       │  │
│  │ • Per-Game EQ  │ │ • Speed/Pitch  │ │   Extractor    │ │ • PipeWire Monitor │  │
│  │ • Auto-TV Dock │ │ • Eco-Suspend  │ │ • Base64 Proxy │ │   16-Band FFT Tap  │  │
│  └───────┬────────┘ └───────┬────────┘ └───────┬────────┘ └─────────┬──────────┘  │
├──────────┴──────────────────┴──────────────────┴────────────────────┴─────────────┤
│               HOST OS & DAEMON LAYER: SteamOS 3.5+ / UID 1000 (deck)              │
│  ┌──────────────────────┐  ┌─────────────────────────┐  ┌──────────────────────┐  │
│  │ librespot /          │  │ PipeWire / PulseAudio   │  │ Local Storage        │  │
│  │ Official Spotify CDP │  │ • filter-chain 10-band  │  │ • settings.json      │  │
│  │ • port 9229 WebSocket│  │ • pactl sink routing    │  │ • stats.json / .lrc  │  │
│  │ • --onevent AF_UNIX  │  │ • pw-cat monitor tap    │  │ • image & palette LRU│  │
│  └──────────────────────┘  └─────────────────────────┘  └──────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities (New vs. Modified)

| Component / Module | Status | Responsibility in v0.7 | Location |
|--------------------|--------|------------------------|----------|
| `py_modules/cdp_bridge.py` | **NEW** | Centralizes React-Fiber Platform registry discovery (`OfflineAPI`, `PlayerAPI`, `PlaylistAPI`, `Pathfinder`/`HomeFeed`, `ConnectAPI`/`Jam`) so `engine.py` stays focused on process/PipeWire lifecycle | `py_modules/cdp_bridge.py` |
| `py_modules/stats.py` | **NEW** | Tracks local play sessions + active game AppID ("Deck Wrapped"), manages persistent offline-resilient Last.fm & ListenBrainz scrobble queue, and executes 1-click JSON profile backup/restore | `py_modules/stats.py` |
| `py_modules/lyrics_engine.py` | **NEW** | Upgrades lyrics caching to standard `.lrc` files (`~/.cache/deckify/lyrics/`), manages per-track sync offsets (`track_id -> offset_ms`), and performs pure-Python CJK/Cyrillic romanization (Hepburn/Pinyin/RR) | `py_modules/lyrics_engine.py` |
| `py_modules/spectrum.py` | **NEW** | Spawns an on-demand, low-overhead PCM tap (`parec`/`pw-cat --record` on the active Deckify sink monitor) only while `TvSplitView` visualizer is open and playing, emitting 15–20 Hz 16-band magnitudes | `py_modules/spectrum.py` |
| `py_modules/images.py` | **MODIFIED** | Adds pure-Python JPEG/PNG header/chunk or downsampled pixel parser (`extract_dominant_color(image_bytes)`) cached alongside `.meta` files to supply `--deckify-accent` RGB values (`THEME-01`) | `py_modules/images.py` |
| `py_modules/soundtrack.py` | **MODIFIED** | Extends `SoundtrackProfile` with `eq_preset_override` and `ducking_level_override`; applies/restores per-game EQ preset in `_run_launch` / `_run_exit` and feeds game-music pairing ticks to `stats.py` (`GAME-01`, `STATS-01`) | `py_modules/soundtrack.py` |
| `py_modules/dock.py` | **MODIFIED** | Emits `dock_state_changed` event when transitioning into/out of `"docked"` state so the frontend can auto-activate 10-Foot Docked TV Split-View (`TV-01`) | `py_modules/dock.py` |
| `py_modules/rpc_playback.py` | **MODIFIED** | Adds `reorder_queue`, `remove_from_queue`, `clear_queue` (`QUEUE-03`), `start_radio` (`RADIO-01`), `set_crossfade` (`RADIO-01`), `set_playback_speed` (`POD-01`), `pull_playback_to_deck` & `set_remote_device_volume` (`CONNECT-01`), and Jam session RPCs (`JAM-01`) | `py_modules/rpc_playback.py` |
| `py_modules/rpc_library.py` | **MODIFIED** | Adds `rename_playlist`, `update_playlist_details`, `reorder_playlist_tracks` (`PL-01`), CDP `Made For You` Pathfinder merge (`DISC-04`), `show`/`episode` search types & genre tiles (`SEARCH-01`), and offline filter queries (`CDP-01`) | `py_modules/rpc_library.py` |
| `src/components/tabs/TvSplitView.tsx` | **NEW** | 10-Foot Docked TV Split-View (`TV-01`): left pane large artwork + dominant color backdrop + 16-bar CSS/Canvas spectrum visualizer; right pane auto-scrolling large karaoke lyrics + compact Queue & Jam QR card | `src/components/tabs/TvSplitView.tsx` |
| `src/components/tabs/StatsTab.tsx` | **NEW** | "Deck Wrapped" analytics view (`STATS-01`): Top Tracks/Artists/Genres, Top Game + Soundtrack pairings, total hours, Last.fm/ListenBrainz configuration, and 1-click JSON export/import | `src/components/tabs/StatsTab.tsx` |
| `src/components/common/JamModal.tsx` | **NEW** | Living Room Spotify Jam modal (`JAM-01`) rendering `QRCodeSVG` for `spotify:socialsession:...` / join URL, participant avatars, and session start/leave controls | `src/components/common/JamModal.tsx` |
| `src/hooks/useDynamicTheme.ts` | **NEW** | Subscribes to current track artwork dominant color (`THEME-01`), computes WCAG-safe contrast accents, and injects CSS custom properties (`--deckify-accent`, `--deckify-accent-glow`) into modal and HUD roots | `src/hooks/useDynamicTheme.ts` |
| `src/components/DeckifyOverlay.tsx` | **MODIFIED** | Adds silent track-change toast mode (`TOAST-01`), Quick-Chord action confirmation badge (`CHORD-01`), dynamic accent border/progress (`THEME-01`), and Eco-Mode animation suspension (`ECO-01`) | `src/components/DeckifyOverlay.tsx` |
| `src/index.tsx` | **MODIFIED** | Extends global button chord handler (`CHORD-01`), routes silent track-change toasts to `DeckifyOverlay` instead of `toaster.toast` when `toast_sound_enabled === false` (`TOAST-01`), and manages Eco-Mode idle engine timer (`ECO-01`) | `src/index.tsx` |

## Recommended Project Structure

```
Deckify/
├── main.py                                    # Central Plugin RPC router & lifecycle supervisor
├── py_modules/
│   ├── __init__.py                            # Clean module exports
│   ├── common.py                              # Constants, paths, settings schema & sanitization
│   ├── cdp_bridge.py                          # [NEW] Shared CDP Platform registry & API evaluators
│   ├── stats.py                               # [NEW] Local listening analytics, Scrobbler & Backup
│   ├── lyrics_engine.py                       # [NEW] .lrc file cache, per-track offset & Romanizer
│   ├── spectrum.py                            # [NEW] On-demand PipeWire monitor PCM FFT analyzer
│   ├── engine.py                              # Process supervision, prefs, pactl & base CDP socket
│   ├── rpc_playback.py                        # [MOD] Queue studio, Radio, Crossfade, Speed, Jam, Connect 2.0
│   ├── rpc_library.py                         # [MOD] Playlist studio, CDP Discovery, Search 2.0, Offline
│   ├── spotify.py                             # Web API client, 429 breaker & lyrics waterfall
│   ├── images.py                              # [MOD] Base64 CSP proxy + dominant RGB color extractor
│   ├── soundtrack.py                          # [MOD] Per-game EQ/Volume/Ducking profiles + stats hook
│   ├── equalizer.py                           # 10-band PipeWire filter-chain DSP
│   ├── volume.py                              # VolumeFader, VAD & sink volume helpers
│   ├── dock.py                                # [MOD] Hotplug switcher + auto-TV mode event emitter
│   ├── resilience.py                          # --onevent Unix socket server + Wi-Fi Travel Mode trigger
│   └── mpris.py                               # UID 1000 D-Bus MPRIS2 bridge
└── src/
    ├── index.tsx                              # [MOD] QAM UI, Extended Chords, Silent Toast router, Eco-Mode
    ├── types.ts                               # [MOD] v0.7 RPC contracts, ViewModes & Settings types
    ├── hooks/
    │   ├── usePlaybackStatus.ts               # [MOD] Handles tv_mode, jam_status, offline_status, theme_color
    │   ├── usePlaybackClock.ts                # [MOD] Scales interpolation delta by playback_speed (0.75x-2.0x)
    │   ├── useTriggerNavigation.ts            # L2/R2 trigger seeking & paging
    │   └── useDynamicTheme.ts                 # [NEW] Injects --deckify-accent CSS variables from track art
    └── components/
        ├── DeckifyExpandedModal.tsx           # [MOD] Hosts 16 ViewModes, Artist/Album breadcrumb stack, TV toggle
        ├── DeckifyOverlay.tsx                 # [MOD] Silent track toast banner, chord feedback pill, accent theme
        ├── common/
        │   ├── Sidebar.tsx                    # [MOD] Adds TV Mode & Stats entries, Offline/Travel badge
        │   ├── TrackActionModal.tsx           # [MOD] Queue reorder actions, Radio, Go to Artist/Album anywhere
        │   └── JamModal.tsx                   # [NEW] QR code modal for Spotify Jam living room sessions
        └── tabs/
            ├── TvSplitView.tsx                # [NEW] 10-Foot Docked TV Split-View + Spectrum Visualizer
            ├── StatsTab.tsx                   # [NEW] Deck Wrapped, Last.fm/ListenBrainz & JSON Backup
            ├── NowPlayingTab.tsx              # [MOD] Podcast 0.75x-2.0x speed & ±15s smart-skip, Jam button
            ├── QueueTab.tsx                   # [MOD] Interactive Queue Studio (Move Up/Down, Remove, Clear)
            ├── PlaylistsTab.tsx               # [MOD] Rename, edit description, reorder tracks, Offline toggle
            ├── DiscoveryTab.tsx               # [MOD] CDP Pathfinder Made For You mixes (Daylist, Daily Mix)
            ├── PodcastsTab.tsx                # [MOD] Unplayed filter, episode resume bars, offline badges
            ├── SearchTab.tsx                  # [MOD] Recent history pills, Genre/Mood tiles, Podcasts/Episodes
            ├── LyricsTab.tsx                  # [MOD] Per-track ±0.5s offset nudge buttons & Romanization toggle
            ├── DevicesTab.tsx                 # [MOD] Pull to Deck button, device icons, remote volume slider
            ├── SoundtracksTab.tsx             # [MOD] Per-game 10-band EQ preset dropdown & ducking slider
            └── SettingsTab.tsx                # [MOD] Crossfade slider, Eco-Mode, Chords config, Scrobbling
```

### Structure Rationale

- **`py_modules/cdp_bridge.py` separation:** `engine.py` is already 910 lines. Features `CDP-01` (OfflineAPI), `DISC-04` (Pathfinder/Home), `QUEUE-03` (PlayerAPI queue mutation), `PL-01` (PlaylistAPI reorder/rename), `JAM-01` (SocialConnect/Jam), and `RADIO-01` (Crossfade/Station) all rely on walking the Spotify Client React fiber tree to locate internal platform APIs. Extracting a reusable `_cdp_run_with_apis(["PlayerAPI", "OfflineAPI", ...], js_body)` helper in `cdp_bridge.py` eliminates hundreds of lines of duplicated fiber-traversal boilerplate.
- **`py_modules/stats.py` & `py_modules/lyrics_engine.py` isolation:** Analytics/scrobbling (`~/.config/deckify/stats.json`) and `.lrc` file parsing/romanization (`~/.cache/deckify/lyrics/*.lrc`) have rich domain logic and disk I/O that should not bloat `main.py` or `spotify.py`.
- **`TvSplitView.tsx` as a first-class `ViewMode` (`"tv_mode"`):** Making TV Mode a `ViewMode` inside `DeckifyExpandedModal` (with an optional full-bleed sidebar-collapsed layout toggle) reuses the existing modal lifecycle, `usePlaybackClock`, `useTriggerNavigation`, and `vgp_oncancel` B-button handling without fighting SteamOS `showModal` focus stacking.

---

## Architectural Patterns

### Pattern 1: Unified CDP Platform Registry Bridge (`CDP-01`, `DISC-04`, `QUEUE-03`, `PL-01`, `JAM-01`)

**What:** A single JavaScript wrapper in `py_modules/cdp_bridge.py` that locates the Spotify Desktop Client's React Fiber `Platform` registry once (`window.__deckifyPlatformRegistry`), caches it on `window` inside the CEF target so subsequent calls skip the 5,000-node BFS walk, and resolves requested services (`PlayerAPI`, `OfflineAPI`, `PlaylistAPI`, `LibraryAPI`, `Pathfinder`, `ConnectAPI`).
**When to use:** Whenever `audio_backend == "spotify_client"` (or when the headless Spotify Client is running) to perform operations blocked or unsupported by Spotify Web API Dev Mode.
**Trade-offs:** Relies on Spotify Client internal service names, so every CDP call must be wrapped in a structured fallback (e.g., Web API URI-slice fallback for `QUEUE-03`, Web API recommendations/search fallback for `DISC-04` and `RADIO-01`).

**Example:**
```python
# py_modules/cdp_bridge.py
def build_cdp_registry_script(api_names: list[str], body_js: str) -> str:
    apis_json = json.dumps(api_names)
    return f"""
    (async () => {{
      try {{
        let reg = window.__deckifyRegistry;
        if (!reg || !(reg._map instanceof Map)) {{
          const el = document.querySelector('#main');
          const fk = el && Object.keys(el).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactContainer$'));
          if (!fk) return {{ ok: false, error: 'React fiber root not found' }};
          const q = [el[fk]], visited = new Set();
          while (q.length && !reg && visited.size < 5000) {{
            const n = q.shift();
            if (!n || visited.has(n)) continue;
            visited.add(n);
            const v = n.memoizedProps?.value;
            if (v && v._map instanceof Map) reg = v;
            else if (v && typeof v.getRegistry === 'function') reg = v.getRegistry();
            if (n.child) q.push(n.child);
            if (n.sibling) q.push(n.sibling);
          }}
          if (reg) window.__deckifyRegistry = reg;
        }}
        if (!reg) return {{ ok: false, error: 'Platform registry unavailable' }};
        const apis = {{}};
        for (const [k, v] of reg._map.entries()) {{
          const name = k?.description || String(k);
          if ({apis_json}.includes(name)) apis[name] = v?.instance || v;
        }}
        {body_js}
      }} catch (e) {{
        return {{ ok: false, error: String(e?.message || e) }};
      }}
    }})()
    """
```

### Pattern 2: Hybrid Queue & Playlist Mutation with URI-Slice Fallback (`QUEUE-03`, `PL-01`)

**What:** Spotify's public Web API lacks `DELETE /me/player/queue` or queue reordering endpoints, and Dev Mode apps face restrictions on some playlist endpoints. Deckify implements a dual-strategy controller:
1. **Primary (CDP `PlayerAPI`):** Calls `apis.PlayerAPI.removeFromQueue(track)` / `apis.PlayerAPI.reorderQueue(...)` or `apis.PlayerAPI.clearQueue()` for seamless native queue editing.
2. **Fallback (Web API URI-Slice):** When running on `librespot` without CDP, `QueueTab` maintains the ordered `queueTracks` array; removing or reordering track $i$ mutates the array locally and invokes `play_tracks(uris=[current_track_uri, *modified_queue_uris], position_ms=current_pos_ms)` or re-queues the slice.
**When to use:** All interactive queue studio operations (`Move Up`, `Move Down`, `Remove`, `Clear Queue`) and playlist track reordering (`PUT /v1/playlists/{id}/tracks` with `range_start`, `insert_before`, plus CDP `PlaylistAPI.move` fallback).

### Pattern 3: Pure-Views Stack Navigation for Deep Drill-Down (`RADIO-01`)

**What:** Currently, `activeArtist` and `activeAlbum` only render when `mode === "artists"` or `mode === "albums"`, and `handleSelectMode` clears both states. To support seamless `"Go to Artist"` and `"Go to Album"` from *any* view (`NowPlayingTab`, `DiscoveryTab`, `PlaylistsTab`, `QueueTab`, `SearchTab`, `RecentTab`), `DeckifyExpandedModal` introduces a lightweight `navigationHistoryRef: Array<{ mode: ViewMode; playlist?: PlaylistItem | null; album?: AlbumItem | null; artist?: ArtistItem | null }>` stack.
**When to use:** Whenever `handleOpenArtist(artist)` or `handleOpenAlbum(album)` is triggered from `TrackActionModal` or track row actions:
1. Push current `{ mode, activePlaylist, activeAlbum, activeArtist }` onto `navigationHistoryRef`.
2. If `artist.id` or `album.id` is missing (e.g., from a partial track object), resolve it via `search_spotify(q=artist_name, type="artist", limit=1)` on the backend before opening.
3. Switch `mode` to `"artists"` or `"albums"` without wiping the newly loaded `activeArtist`/`activeAlbum`.
4. In `vgp_oncancel` (B button), pop `navigationHistoryRef` to return the user to the exact originating tab and scroll position.

### Pattern 4: Silent Gamescope HUD Toast Routing & Chord Feedback (`TOAST-01`, `CHORD-01`)

**What:** SteamOS's `toaster.toast()` plays a system notification sound in CEF even when `playSound: false` is passed in certain SteamOS 3.6/3.7 builds because `steamwebhelper` triggers its default UI cue on toast creation. To guarantee a **100% silent** track-change toast when `toast_sound_enabled === false`:
- In `src/index.tsx` listener #5 (`track_metadata`), if `settings.toast_sound_enabled === false`, **do not call `toaster.toast()`**. Instead, emit a custom frontend event `window.dispatchEvent(new CustomEvent("deckify:hud_toast", { detail: { type: "track", track: meta, actionBadge: null } }))`.
- `DeckifyOverlay` (which is mounted globally via `routerHook.addGlobalComponent("DeckifyOverlay")` with `pointerEvents: "none"`) listens for `deckify:hud_toast` and transiently displays its card for 4 seconds with zero Steam notification involvement.
- Similarly, Extended In-Game Quick-Chords (`CHORD-01`: `STEAM + X` = Like ♥, `STEAM + Y` = Cycle Pinned Playlist 1–4, `STEAM + B` or `Select` = Toggle Lyrics HUD) dispatch `deckify:hud_toast` with an `actionBadge` (e.g., `"♥ Liked Track"`, `"▶ Pinned: Cyberpunk Mix"`, `"♪ Lyrics HUD: ON"`) so feedback is instantaneous and silent.

### Pattern 5: Event-Driven Audio Spectrum Tap with Eco-Mode Guard (`TV-01`, `ECO-01`)

**What:** Continuous audio capture or canvas redraws during gameplay would waste battery and CPU. `py_modules/spectrum.py` runs **strictly on demand**:
1. Only starts when the frontend calls `start_spectrum_stream(True)` upon entering `TvSplitView` (`mode === "tv_mode"`) with `tv_visualizer_enabled === True` AND `eco_mode_active === False`.
2. Spawns `parec --format=s16le --rate=16000 --channels=1 --latency-msec=50 -d <active_sink>.monitor` (using the sink resolved by `dock.py` or `equalizer.py:deckify_eq_sink.monitor` so only Deckify's audio is visualized, never game or voice chat audio).
3. Computes 16 logarithmic frequency bands in Python using `struct.unpack` + Goertzel/radix-2 butterfly (pure stdlib `math`, zero numpy dependency) at 15 FPS and emits `decky.emit("spectrum_frame", bands)`.
4. Automatically terminates on `stop_spectrum_stream()`, modal close, pause, or when `ECO-01` Handheld Battery Eco-Mode activates.

---

## Feature-by-Feature Integration Map (All 14 Capabilities)

| ID | Feature Pillar | Backend Integration (`main.py` & `py_modules/`) | Frontend Integration (`src/`) |
|----|----------------|------------------------------------------------|-------------------------------|
| **TV-01** | 10-Foot Docked TV Split-View & Visualizer | `dock.py` emits `dock_state_changed` (`{ docked: bool }`). `spectrum.py` taps `deckify_eq_sink.monitor` (or active sink monitor) via `parec` at 15 Hz when `TvSplitView` is mounted. | New `ViewMode` `"tv_mode"` (`TvSplitView.tsx`): 2-column 10-foot layout (Left: 360px artwork, track info, 16-bar visualizer; Right: 28px karaoke lyrics + Next 5 Queue + Jam QR). Auto-switches when `dock_auto_tv_mode` is enabled. |
| **QUEUE-03 & PL-01** | Queue Studio & Full Playlist Management | `cdp_bridge.py` + `rpc_playback.py`: `mutate_queue(action, index, target_index, uri)` using CDP `PlayerAPI` with Web API URI-slice fallback. `rpc_library.py`: `rename_playlist`, `reorder_playlist_tracks` (`PUT /playlists/{id}/tracks` + CDP `PlaylistAPI`). | `QueueTab.tsx`: adds controller action bar (`Clear Queue`, per-row `Move Up`, `Move Down`, `Remove`). `PlaylistsTab.tsx`: adds inline playlist rename, track reorder mode, and remove confirmation. |
| **CDP-01** | Native CDP Offline Downloads & Travel Mode | `cdp_bridge.py`: wraps `OfflineAPI` (`enableOffline(uri)`, `disableOffline(uri)`, `getOfflineStatus()`). `resilience.py`: when Wi-Fi loss exceeds `WIFI_GRACE_WINDOW_S`, emits `travel_mode_changed({ offline: True })`. | `PlaylistsTab`, `AlbumsTab`, `PodcastsTab`: shows Download toggle & progress ring (`0–100%`) + green Offline badge when `audio_backend === "spotify_client"`. Auto-activates `"Offline Only"` filter in Travel Mode. |
| **DISC-04** | Deep Discovery 2.0 via CDP | `cdp_bridge.py`: queries Spotify Client internal `Pathfinder` (`queryHome` / `ExtractedMadeForYou`) or scrapes home shelf URIs for *Daylist*, *Discover Weekly*, *Release Radar*, *Daily Mix 1–6*. Merged into `rpc_library.get_discovery_feed`. | `DiscoveryTab.tsx`: renders full personalized mixes in `"Made For You"` without the "Recently Played fallback" warning when CDP bridge succeeds; caches mix metadata in `settings.json` for `librespot` playback too. |
| **JAM-01** | Spotify Jam & Living Room QR Sessions | `cdp_bridge.py` + `rpc_playback.py`: `manage_jam_session(action="start"\|"join"\|"leave")` via CDP `ConnectAPI`/`SocialConnect` (or Web API/share link fallback) returning `join_url` (`https://open.spotify.com/socialsession/...`). | `JamModal.tsx` (opened from `NowPlayingTab`, `DevicesTab`, or `TvSplitView`): renders scannable `QRCodeSVG` via existing `qrcode.react` 4.2.0 dependency + active host/guest indicator. |
| **GAME-01 & TOAST-01** | Per-Game EQ/Volume Profiles & Silent Toasts | `soundtrack.py`: adds `eq_preset_override: str \| None` and `ducking_level_override: int \| None` to `_PROFILE_DEFAULTS`. `_run_launch` calls `plugin._apply_equalizer_preset(eq_preset_override)` and `_run_exit` restores global `settings["eq_preset"]`. | `SoundtracksTab.tsx`: adds EQ Preset dropdown and Ducking % slider per game card. `src/index.tsx` + `DeckifyOverlay.tsx`: routes silent track toasts (`toast_sound_enabled === false`) to `DeckifyOverlay` DOM instead of `toaster.toast`. |
| **POD-01** | Podcast & Audiobook Power Suite | `rpc_playback.py` & `equalizer.py`/`cdp_bridge.py`: `set_playback_speed(rate: float)` (`0.75`–`2.0`). On `spotify_client`, sets CDP `PlayerAPI.setPlaybackSpeed(rate)` or `<audio>.playbackRate`; on `librespot`, applies PipeWire/CDP rate or persists episode progress in `settings["episode_progress"]`. | `NowPlayingTab.tsx`: when `isPodcast` (`uri.includes(":episode:")`), replaces Shuffle/Repeat with `0.75x–2.0x` Speed pill and prominent `-15s` / `+15s` smart-skip buttons. `PodcastsTab.tsx`: adds `All / Unplayed / In Progress` filter pills. |
| **RADIO-01** | Instant Radio, Deep Drill-Down & Crossfade | `rpc_playback.py`: `start_radio(seed_uri, seed_type)` resolves `spotify:station:track:{id}` via CDP `PlayerAPI`, falling back to `get_track_recommendations` (or artist top tracks + related artists) queued via `play_tracks`. `set_crossfade(seconds: 0..12)` updates Spotify Client `prefs` (`audio.crossfade_v2`, `audio.crossfade.time_v2`) + CDP or local fader. | `DeckifyExpandedModal.tsx`: adds `navigationHistoryRef` stack so `"Go to Artist"` and `"Go to Album"` in `TrackActionModal.tsx` work from every tab and restore via `B`. `SettingsTab.tsx`: adds Crossfade (`0–12s`) slider. |
| **CHORD-01** | Extended In-Game Quick-Chords | `rpc_playback.py`: `cycle_pinned_playlist(direction: int)` advances through `settings["pinned_playlists"]` and invokes `quick_play_pinned`, returning the newly active `PinnedPlaylistItem`. | `src/index.tsx`: extends `RegisterForGamepadButtonDown` chord map (`STEAM + X` = Like current track, `STEAM + Y` = Cycle Pinned Playlist, `STEAM + Select` = Toggle Lyrics HUD) and dispatches `deckify:hud_toast` confirmation badge to `DeckifyOverlay`. |
| **STATS-01** | Listening Stats, Scrobbling & Backup | `py_modules/stats.py`: `StatsManager` hooks into `_poll_playback` / `LibrespotEventServer` on track play (`>=30s` or `>=50%` duration). Records local aggregates + `active_game_app_id` pairings in `~/.config/deckify/stats.json`, dispatches async Last.fm (MD5 API sig) & ListenBrainz HTTP POSTs with an offline retry queue, and exposes `export_profile_backup()` / `import_profile_backup()`. | `StatsTab.tsx` (new `ViewMode` `"stats"`): displays "Deck Wrapped" cards (Top Tracks, Top Artists, Top Game + Soundtrack combos, Listening Time) + Scrobbler auth & Backup/Restore controls in `StatsTab` / `SettingsTab`. |
| **SEARCH-01** | Search 2.0 (History, Genre Tiles, Podcasts) | `rpc_library.py`: extends `search_spotify` `types` parameter to `"track,artist,album,playlist,show,episode"`, parses `shows` and `episodes` arrays, and exposes `get_browse_categories()` (curated gaming/mood/genre seed tiles with offline fallback). | `SearchTab.tsx`: when `searchQuery` is empty, renders recent search history pills (`settings.search_history`, max 10) + a 3-column controller grid of Genre & Gaming Mood tiles (Synthwave, Lo-Fi, Boss Fight, RPG, Chill, etc.). Adds `Podcasts` and `Episodes` filter tabs. |
| **LYRICS-01** | Lyrics 2.0 (`.lrc` Cache, Sync Nudge, Romanization) | `py_modules/lyrics_engine.py`: stores synced lyrics as standard `~/.cache/deckify/lyrics/{sha256}.lrc` files alongside metadata, persists `lyrics_track_offsets: Record<track_id, int>` in settings, and implements a zero-dependency Unicode transliterator (Japanese Kana/basic Kanji, Chinese Pinyin table, Korean Hangul Jamo decomposition). | `LyricsTab.tsx`: adds `-0.5s` / `+0.5s` per-track offset nudge buttons (saved automatically per `track_id` and applied to both `LyricsTab` and `DeckifyOverlay`) and a `"Romanize (A-Z)"` toggle pill. |
| **CONNECT-01** | Spotify Connect Hub 2.0 | `rpc_playback.py`: `pull_playback_to_deck(play: bool)` auto-starts `librespot`/`spotify_client` if stopped, waits for device registration, and transfers playback in one RPC. Adds `set_remote_device_volume(device_id, volume_pct)` (`PUT /me/player/volume?volume_percent=X&device_id=Y`). | `DevicesTab.tsx`: adds prominent top `"Pull Playback to Steam Deck"` hero button, device-type icons (`FaLaptop`, `FaMobileAlt`, `FaTv`, `FaGamepad`, `FaVolumeUp`), active engine badge (`librespot` vs `Spotify Client`), and a remote volume slider when a non-local device is active. |
| **THEME-01 & ECO-01** | Dynamic Album-Art Accents & Eco-Mode | `images.py`: `extract_dominant_color(body: bytes) -> str` computes vibrant hex color from album artwork and caches it in `{url_hash}.color`; included in `track_metadata` payload (`accent_color`). `main.py`: Eco-Mode supervisor pauses background tasks/visualizers and stops idle audio engine after configurable timeout when `activeGameAppId !== null` and playback is paused. | `useDynamicTheme.ts`: transitions `--deckify-accent` (default `#1db954`) on modal and `DeckifyOverlay` based on `track.accent_color`. When `eco_mode_enabled` and a game is running, disables blurred ambient glow and spectrum visualizer. |

---

## Data Flow

### 1. Track Change → Dynamic Theme + Silent HUD Toast + Scrobble Tick (`THEME-01`, `TOAST-01`, `STATS-01`)

```
[librespot --onevent / _poll_playback]
    ↓
[Plugin._poll_playback (main.py)]
    ├─→ [images.get_or_extract_accent_color(artwork_url)] → attaches `accent_color: "#e84a5f"` to `meta`
    ├─→ [stats.StatsManager.on_track_progress(meta, progress_ms, active_game_app_id)]
    │       └─→ (When >= 50% or 30s played) → Updates stats.json + Enqueues Last.fm / ListenBrainz scrobble
    └─→ [decky.emit("track_metadata", meta)]
            ↓
[Frontend: src/index.tsx ("track_metadata" listener)]
    ├─→ Updates `--deckify-accent` CSS custom property via `useDynamicTheme`
    └─→ Checks `settings.toast_sound_enabled`:
          ├─ If true  → `toaster.toast({ title, body, playSound: true })`
          └─ If false → `window.dispatchEvent(new CustomEvent("deckify:hud_toast", { detail: meta }))`
                            ↓
                        [DeckifyOverlay.tsx] → Renders 100% silent in-game banner for 4.0s
```

### 2. Per-Game Audio Profile Lifecycle (`GAME-01`)

```
[SteamClient.GameSessions.RegisterForAppLifetimeNotifications(appId, bRunning=true)]
    ↓
[Plugin.handle_app_lifetime_event(appId, true)]
    ↓
[SoundtrackManager._delayed_launch(appId) (3.5s debounce)]
    ├─→ Snapshots pre-game `{ track_uri, context_uri, position_ms, volume, eq_preset }`
    ├─→ If `profile.eq_preset_override`: calls `plugin._apply_equalizer_preset(profile.eq_preset_override)`
    ├─→ If `profile.ducking_level_override`: updates `VolumeFader` target attenuation for `"game"` reason
    ├─→ If `profile.volume_override`: calls `plugin.set_volume(profile.volume_override)`
    └─→ Starts bound game playlist (`_play(...)`)
```

### 3. Dock Hotplug → 10-Foot TV Split-View & Spectrum Visualizer (`TV-01`)

```
[pactl subscribe ("Event 'new' on sink ...")]
    ↓
[DockAudioSwitcher.evaluate_now() (dock.py)]
    ├─→ Routes Deckify stream to USB-DAC / HDMI sink
    └─→ Emits `decky.emit("dock_state_changed", { status: "docked", active_sink_label })`
            ↓
[DeckifyExpandedModal.tsx]
    ├─→ If `settings.tv_auto_dock_switch`: transitions `mode` → `"tv_mode"` (`TvSplitView.tsx`)
    └─→ `TvSplitView` mounts → calls `backendStartSpectrum(true)`
            ↓
[spectrum.SpectrumAnalyzer (spectrum.py)]
    └─→ Spawns `parec --rate=16000 --channels=1 -d <sink>.monitor`
    └─→ Emits `decky.emit("spectrum_frame", [b0..b15])` at 15 Hz → Renders 16-bar visualizer
```

---

## Suggested Phase Build Order & Dependencies

The 14 capability pillars have clear technical dependencies across backend services and frontend components. Grouping them into **7 sequential phases** minimizes merge friction and ensures shared infrastructure (`cdp_bridge.py`, `navigationHistoryRef`, `DeckifyOverlay` toast bus) is built before downstream consumers need it.

```
Phase 19 (Game Audio, Silent HUD & Quick-Chords)
    ↓  Establishes HUD event bus (`deckify:hud_toast`) & Per-Game EQ hooks
Phase 20 (Theme Engine, Eco-Mode & Connect Hub 2.0)
    ↓  Establishes `accent_color` pipeline, Eco-Mode state & Connect auto-wake
Phase 21 (Lyrics 2.0 & Podcast/Audiobook Power Suite)
    ↓  Upgrades playback clock speed scaling & `.lrc`/romanized lyrics engine
Phase 22 (Radio, Crossfade, Search 2.0 & Deep Drill-Down)
    ↓  Establishes `navigationHistoryRef` stack & Genre/Podcast search
Phase 23 (CDP Bridge: Queue Studio, Playlist Studio & Discovery 2.0)
    ↓  Establishes `py_modules/cdp_bridge.py` (`PlayerAPI`, `PlaylistAPI`, `Pathfinder`)
Phase 24 (CDP Offline Travel Mode & Living Room Spotify Jam)
    ↓  Extends `cdp_bridge.py` (`OfflineAPI`, `ConnectAPI`) + QR Session sharing
Phase 25 (10-Foot Docked TV Split-View, Spectrum Visualizer & Listening Stats/Scrobbling)
       Combines TV UI, lyrics engine, Jam QR, dynamic theme, and Game+Music analytics
```

### Phase Breakdown Rationale

1. **Phase 19: Per-Game EQ Profiles, Silent HUD Toasts & Extended Quick-Chords (`GAME-01`, `TOAST-01`, `CHORD-01`)**
   - **Why first:** Directly extends v0.6's `equalizer.py` and `soundtrack.py` while refactoring `DeckifyOverlay.tsx` and `src/index.tsx` to support silent HUD notifications (`deckify:hud_toast`) and chord confirmation pills. Zero external API risks.
2. **Phase 20: Dynamic Album-Art Themes, Battery Eco-Mode & Connect Hub 2.0 (`THEME-01`, `ECO-01`, `CONNECT-01`)**
   - **Why second:** `THEME-01` (`--deckify-accent`) and `ECO-01` (battery/gameplay resource guard) provide foundational UI tokens and power-management rules that `TvSplitView` (`TV-01`) and `SpectrumAnalyzer` will consume. `CONNECT-01` upgrades `DevicesTab` and `pull_playback_to_deck` auto-wake logic used by Radio and Jam.
3. **Phase 21: Lyrics 2.0 & Podcast/Audiobook Power Suite (`LYRICS-01`, `POD-01`)**
   - **Why third:** `lyrics_engine.py` (`.lrc` disk cache, per-track sync offsets, romanization) must be in place before `TvSplitView` (`TV-01`) embeds live karaoke lyrics. `POD-01` upgrades `usePlaybackClock` to support variable playback rates (`0.75x–2.0x`) and smart-skip controls in `NowPlayingTab`.
4. **Phase 22: Instant Radio, Crossfade, Deep Drill-Down & Search 2.0 (`RADIO-01`, `SEARCH-01`)**
   - **Why fourth:** Introduces the `navigationHistoryRef` stack in `DeckifyExpandedModal.tsx` so `"Go to Artist"` and `"Go to Album"` work universally across all existing and upcoming tabs, adds native crossfade, and upgrades `SearchTab.tsx` with history pills, genre/mood tiles, and podcast/episode search.
5. **Phase 23: Unified CDP Bridge, Interactive Queue Studio, Playlist Studio & Discovery 2.0 (`QUEUE-03`, `PL-01`, `DISC-04`)**
   - **Why fifth:** Creates `py_modules/cdp_bridge.py` with cached React Fiber `Platform` registry lookup, unlocking `PlayerAPI` (Queue Studio reorder/remove/clear with URI-slice fallback), `PlaylistAPI` (Playlist rename/reorder), and `Pathfinder` (*Daylist*, *Discover Weekly*, *Release Radar*, *Daily Mixes*).
6. **Phase 24: CDP Offline Downloads, Travel Mode & Spotify Jam QR Sessions (`CDP-01`, `JAM-01`)**
   - **Why sixth:** Builds directly on `cdp_bridge.py` from Phase 23 to integrate `OfflineAPI` (playlist/album/episode downloads + Wi-Fi disconnect Travel Mode filter in `resilience.py`) and `ConnectAPI` (`JamModal.tsx` QR code living room sessions).
7. **Phase 25: 10-Foot Docked TV Split-View, Audio Visualizer & Listening Stats/Scrobbling (`TV-01`, `STATS-01`)**
   - **Why seventh (capstone):** `TvSplitView.tsx` brings together the dynamic theme (`Phase 20`), Eco-Mode guard (`Phase 20`), Lyrics 2.0 (`Phase 21`), Queue Studio (`Phase 23`), Jam QR card (`Phase 24`), and `spectrum.py` PipeWire visualizer. `stats.py` + `StatsTab.tsx` ("Deck Wrapped", Last.fm/ListenBrainz scrobbling, and full JSON profile backup/restore) can then back up *all* v0.7 settings, per-game EQ profiles, lyrics offsets, and search history in a single schema.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Running Spectrum Visualizer or Canvas Animations in Gamescope HUD
**What people do:** Mounting an audio spectrum analyzer or `requestAnimationFrame` loop inside `DeckifyOverlay.tsx` during active gameplay.
**Why it's wrong:** Gamescope composites transparent CEF layers over the running game; 60 FPS DOM/Canvas mutations inside the overlay cause severe frame-time spikes and GPU stutter on Steam Deck APU.
**Do this instead:** Scope `spectrum.py` and the 16-bar visualizer strictly to `TvSplitView.tsx` inside the open `DeckifyExpandedModal`, and immediately stop the `parec` subprocess when the modal closes, playback pauses, or `ECO-01` Eco-Mode is active.

### Anti-Pattern 2: Tapping Default PipeWire Monitor Instead of Isolated Deckify Sink
**What people do:** Recording from `@DEFAULT_MONITOR@` for the audio spectrum visualizer.
**Why it's wrong:** `@DEFAULT_MONITOR@` mixes game explosions, Discord voice chat, and Steam UI clicks into the music visualizer and risks waking microphone indicators if misconfigured.
**Do this instead:** Record from `deckify_eq_sink.monitor` when the PipeWire EQ is active, or use `parec --monitor-stream=<spotify_sink_input_id>` (resolved via `engine.resolve_spotify_sink_input_ids`) so only Deckify's audio stream drives the spectrum bars.

### Anti-Pattern 3: Relying Exclusively on Spotify Web API for Queue Mutation or Algorithmic Mixes
**What people do:** Calling `DELETE /v1/me/player/queue` (which does not exist in Spotify Web API) or `GET /v1/browse/featured-playlists` (which returns `403/404` for Spotify Developer Mode apps since November 2024).
**Why it's wrong:** Fails for 100% of self-hosted Client IDs.
**Do this instead:** Use `cdp_bridge.py` (`PlayerAPI` / `Pathfinder`) when `spotify_client` is running, and provide a deterministic Web API fallback (URI-slice `play_tracks` replacement for `QUEUE-03`; user playlist owner filtering + seed recommendations for `DISC-04` and `RADIO-01`) when `librespot` is active.

### Anti-Pattern 4: Mutating Mode State Without Preserving Breadcrumb History
**What people do:** Calling `handleSelectMode("artists")` before `handleOpenArtist(artist)`, which wipes `activeArtist` and strands the user on the top-level Artists list when pressing `B`.
**Why it's wrong:** Breaks controller breadcrumb expectations when drilling down from `NowPlayingTab`, `QueueTab`, or `SearchTab`.
**Do this instead:** Push the current view snapshot onto `navigationHistoryRef` before opening the target artist/album, and pop it in the `vgp_oncancel` listener.

---

## Integration Points Summary

### External & Host OS Interfaces

| Interface | Integration Pattern | Gotchas & Guardrails |
|-----------|---------------------|----------------------|
| **Spotify Client CDP (`127.0.0.1:9229`)** | Raw WebSocket `Runtime.evaluate` via `py_modules/cdp_bridge.py` | Cache `__deckifyRegistry` on `window`; always enforce a 4–6s socket timeout so a frozen CEF client never blocks the Python event loop. |
| **PipeWire Monitor Tap (`parec`)** | Async subprocess reading raw `s16le` PCM at 16 kHz mono (`py_modules/spectrum.py`) | Must strip `LD_LIBRARY_PATH`, use `_build_deck_command`, and target `--monitor-stream=<id>` or `deckify_eq_sink.monitor`. |
| **Last.fm / ListenBrainz APIs** | Async `urllib.request` over `_API_SSL_CTX` in `py_modules/stats.py` | Persist failed scrobbles to `~/.config/deckify/scrobble_queue.json` (max 500 entries) and flush on next successful poll when Wi-Fi returns. |
| **Lyrics `.lrc` Storage** | `~/.cache/deckify/lyrics/{sha256}.lrc` + `.meta.json` (`py_modules/lyrics_engine.py`) | Keep backward compatibility with existing `.json` cache entries in `spotify.py` while migrating synced lyrics to standard `[mm:ss.xx]` `.lrc` files. |

### Internal Module Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `SoundtrackManager` ↔ `EqualizerManager` | Direct async method call (`plugin._apply_equalizer_preset`) | Snapshot `pre_game_eq_preset` on game launch and restore on game exit unless user manually changed EQ mid-game. |
| `DockAudioSwitcher` ↔ `DeckifyExpandedModal` | `decky.emit("dock_state_changed", ...)` | Frontend listens in `usePlaybackStatus` and auto-switches `mode` to `"tv_mode"` if `tv_auto_dock_switch` is enabled. |
| `src/index.tsx` ↔ `DeckifyOverlay.tsx` | DOM `CustomEvent("deckify:hud_toast")` | Decouples silent track toasts (`TOAST-01`) and quick-chord badges (`CHORD-01`) from Steam's noisy `toaster.toast` API. |

---
*Architecture research for: Deckify v0.7 (Studio, Living Room TV, Offline Travel & Ultimate Immersion)*
*Researched: 2026-11-18*
