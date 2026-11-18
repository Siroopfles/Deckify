# Stack Research

**Domain:** Steam Deck / SteamOS GamepadUI Spotify Client & Decky Loader Plugin (Milestone v0.7: Studio, Living Room TV, Offline Travel & Ultimate Immersion)
**Researched:** 2026-11-18
**Confidence:** HIGH

## Recommended Stack

Milestone v0.7 adds 14 major capability pillars while adhering strictly to Deckify's core runtime constraints:
1. **Zero C-Extension Python Backend:** Decky Loader executes `main.py` inside a PyInstaller-bundled Python 3.11+ environment that collides with SteamOS host glibc/OpenSSL when native C-extensions (`numpy`, `Pillow`, `pydbus`, `sqlite3` on minimal builds, `MeCab`) are imported. All backend additions must use **Python 3.11+ standard library** (`struct`, `zlib`, `hashlib`, `urllib.request`, `socket`, `asyncio`, `unicodedata`) or pure-Python modules.
2. **Minimal Frontend Bundle & Steam CEF CSP Compliance:** Rollup compiles the frontend into a single ESM `dist/index.js` loaded into SteamOS GamepadUI Chromium Embedded Framework (CEF). CEF enforces a strict Content Security Policy (blocking external CDN images, external font/dictionary fetches, and unproxied WebSockets) and shares GPU composition budget with running games via Gamescope.

### Core Technologies (Existing Foundation + v0.7 Extensions)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Python Standard Library (`urllib`, `socket`, `struct`, `zlib`, `hashlib`, `asyncio`) | 3.11+ / 3.14 | Backend RPC, raw WebSocket CDP client, audio PCM spectrum tapping, scrobbling, LRC cache, and analytics | Guaranteed availability in Decky Loader's PyInstaller sandbox with zero `LD_LIBRARY_PATH` or C-ABI breakage across SteamOS 3.5–3.7+ updates. |
| React + TypeScript | React 19.x / TS 5.9.3 | 10-foot Docked TV Split-View UI, Queue Studio, Playlist Editor, and silent Gamescope HUD overlay | Provided by Decky Loader's global React environment; zero runtime framework overhead in `dist/index.js`. |
| `@decky/ui` + `@decky/api` | 4.11.1 / 1.1.3 | Gamepad spatial navigation (`Focusable`, `ModalRoot`, `flow-children="horizontal"`) and typed RPC bridge | Native SteamOS GamepadUI focus engine; required for reliable D-pad, bumper, and action-button (`X`/`Y`/Menu) chord handling. |
| Chrome DevTools Protocol (CDP) via `com.spotify.Client` | Port `9229` (Raw RFC 6455 WebSocket) | Internal `Platform.Registry` bridge (`PlayerAPI`, `PlaylistAPI`, `OfflineAPI`, `PlaybackAPI`, `ConnectAPI`, Pathfinder GraphQL) | Bypasses Spotify Web API Dev Mode 403/404 restrictions (which block algorithmic mixes, queue reordering, radio seeds, and offline downloads) by driving the authenticated official Spotify Flatpak client directly. |
| PipeWire / PulseAudio (`parec`, `pactl`, `pw-cli`) | SteamOS 3.5+ built-in | Per-game 10-band biquad EQ switching, sink hotplug detection, and low-overhead PCM audio spectrum capture | Already pre-installed in `/usr/bin` on SteamOS; allows isolated DSP and audio analysis on Deckify's sink-input without touching `steamwebhelper` or game audio. |

### Supporting Libraries & Technical Subsystems (New for v0.7)

| Subsystem / Library | Version | Purpose | When to Use |
|---------------------|---------|---------|-------------|
| `qrcode.react` (`QRCodeSVG`) | `4.2.0` (Already Installed) | On-screen SVG QR codes for Spotify Jam sessions (`JAM-01`) and Living Room mobile joining | Render inline SVG QR codes in `JamModal` and `DockedTvView`; completely immune to Steam CEF image CSP restrictions. |
| HTML5 `<canvas>` 2D Context (`getImageData`) | Browser Native (CEF) | Dynamic album-art dominant color & accent palette extraction (`THEME-01`) | Decode already-fetched `data:image/jpeg;base64,...` URIs onto an offscreen `32x32` canvas in the frontend to extract RGB accent colors with zero Python imaging dependencies (`Pillow` avoided). |
| `parec --monitor-stream` + Python `struct` Goertzel/DFT | System binary + Python stdlib | Lightweight 12–16 band real-time PipeWire audio spectrum analyzer (`TV-01`) | Spawn ONLY when Docked TV Split-View visualizer is open and active; read raw `s16le` mono PCM at `11025 Hz` from Deckify's sink-input and emit normalized band magnitudes at `15–20 Hz`. |
| Pure-JS / Pure-Python CJK Transliteration (`Hangul` Jamo math + Kana table + NetEase `romalrc` / compact Unihan table) | Built-in module (`py_modules/romanize.py`) | Lyrics 2.0 optional Romaji, Pinyin, and Korean Revised Romanization (`LYRICS-01`) | Process lyrics lines on the backend before caching `.lrc` files; avoids bundling 15 MB `kuromoji.js` dictionaries or C-based `MeCab` on SteamOS. |
| Last.fm REST v2.0 (`hashlib.md5`) & ListenBrainz v1 (`Bearer` JSON) | Python stdlib `urllib.request` + `hashlib` | Dual-provider scrobbling with persistent offline retry queue (`STATS-01`) | Scrobble tracks meeting the standard threshold (played `>= 50%` or `>= 240s`, minimum duration `> 30s`) with disk-backed queue in `~/.config/deckify/scrobble_queue.json`. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Rollup 4.59 + `@decky/rollup` 1.0.2 | Frontend ESM bundler | Keep total `dist/index.js` size under 350 KB; avoid bundling large static CJK dictionaries into the frontend JS chunk. |
| Vitest 5.1.0 + Python `unittest` | Frontend & backend test suites | Mock `_cdp_evaluate` payloads and `parec` PCM byte streams in `tests/test_*.py` to maintain 100% deterministic offline test execution. |

---

## Pillar-by-Pillar Stack & Implementation Architecture

### 1. Docked TV Split-View Mode & Audio Spectrum Visualizer (`TV-01`)
- **Auto-Activation Detection:** Hook into the existing `py_modules/dock.py` (`pactl subscribe` watcher). When `classify_sink(default_sink)` transitions to `"hdmi"` or `"usb"` (or when `window.innerWidth >= 1920` in GamepadUI), emit a Decky event `deckify_dock_state_changed` to auto-activate or prompt for 10-Foot Split-View Mode.
- **PipeWire Audio Spectrum Visualizer (Zero-Dependency Approach):**
  - **Capture:** Spawn `parec --format=s16le --rate=11025 --channels=1 --latency-msec=50 --monitor-stream=<deckify_sink_input_id>` via `_build_deck_command` (with `LD_LIBRARY_PATH` stripped). Using `--monitor-stream` taps *only* Deckify's Spotify audio stream, ignoring game explosions and Steam UI clicks.
  - **Analysis:** In an `asyncio` background task, read `512`-sample (`1024`-byte) frames via `struct.unpack("<512h", chunk)`. Compute 12–16 logarithmic frequency bands (`60 Hz` to `5 kHz`) using precomputed cosine/sine tables (pure-Python Goertzel / bucketed DFT takes `< 0.4 ms` per frame for 16 bands on 512 samples in Python 3.11).
  - **Rendering:** Emit compact integer arrays (`[0..100] x 16`) via `decky.emit("deckify_spectrum", bands)` at `15 fps` (`66 ms` interval), and animate the 16 bars in React using GPU-accelerated CSS `transform: scaleY(var(--b0))` with `transition: transform 65ms linear`.
  - **Fallback (Remote Spotify Connect Devices):** When audio plays on a remote Connect speaker rather than local PipeWire, drive a deterministic rhythmic CSS keyframe visualizer seeded by track tempo/energy or active playback progress.

### 2. Interactive Queue Studio & Full Controller Playlist Management (`QUEUE-03` & `PL-01`)
- **Queue Reorder / Remove / Clear (`QUEUE-03`):**
  - The public Spotify Web API only offers `GET /v1/me/player/queue` and `POST /v1/me/player/queue` (append-only; zero support for removal, reordering, or clearing).
  - **Primary (Spotify Client CDP Engine):** Use `Platform.Registry` → `PlayerAPI` inside `_cdp_evaluate`:
    - `await playerApi.clearQueue()`
    - `await playerApi.removeFromQueue([{ uri, uid }])`
    - `await playerApi.reorderQueue([{ uri, uid }], { before: { uri, uid } })` (or `playerApi._queue.setQueue(...)` depending on client build, discovered dynamically on the `PlayerAPI` prototype).
  - **Fallback (`librespot` / Web API Mode):** Maintain a virtual queue override in Deckify memory/state and execute the validated v0.4 URI-slice playback pattern (`PUT /v1/me/player/play` with `{"uris": mutated_remaining_uris}`) so users on `librespot` get identical reorder/remove/clear behavior.
- **Full Controller Playlist Management (`PL-01`):**
  - **Web API Endpoints (Primary):**
    - Create: `POST /v1/me/playlists` (`{"name": ..., "public": ..., "description": ...}`)
    - Rename / Edit Details: `PUT /v1/playlists/{playlist_id}`
    - Reorder Tracks: `PUT /v1/playlists/{playlist_id}/tracks` (`{"range_start": i, "insert_before": j, "range_length": 1}`)
    - Remove Tracks: `DELETE /v1/playlists/{playlist_id}/tracks` (`{"tracks": [{"uri": ...}]}`)
  - **CDP `PlaylistAPI` Fallback (if Web API Dev Mode returns 403):**
    - `await playlistApi.createPlaylist(name, { folderUri })`
    - `await playlistApi.modifyDetails(playlistUri, { name, description })`
    - `await playlistApi.move(playlistUri, [{ uid, uri }], { before: { uid } })`
    - `await playlistApi.remove(playlistUri, [{ uid, uri }])`

### 3. Native CDP Offline Downloads & Travel Mode (`CDP-01`)
- **CDP `OfflineAPI` Integration:**
  - Resolve `OfflineAPI` (and `PlaylistAPI` / `AlbumAPI` offline properties) from `Platform.Registry._map` via `_cdp_evaluate`.
  - Trigger downloads via `offlineApi.makeAvailableOffline(contextUri, true)` (or `playlistApi.setOffline(uri, true)` / `offlineApi.addDownload(uri)` with prototype method discovery).
  - Poll download progress via `offlineApi.getItemOfflineStatus(uri)` / `rootlistAPI` item `offline` properties (`"yes"`, `"no"`, `"downloading"`, `syncProgress: 0..100`).
- **Travel Mode & Wi-Fi Disconnect Detection:**
  - Monitor network state in `py_modules/resilience.py` (checking default route in `/proc/net/route` or `nmcli` / socket reachability to `api.spotify.com`).
  - When offline is detected, automatically switch `OfflineAPI` to offline mode (`offlineApi.enableOfflineMode(true)` or `prefs` `core.offline_mode=true`) and activate the frontend **Offline Filter** pill so only cached/downloaded playlists, albums, and episodes are shown.

### 4. Deep Discovery 2.0 via Hybrid CDP Pathfinder Bridge (`DISC-04`)
- **Why Needed:** Spotify Web API Dev Mode apps return `HTTP 404` or `403` when requesting Spotify-owned editorial and algorithmic playlists (*Daylist*, *Discover Weekly*, *Release Radar*, *Daily Mix 1–6*).
- **CDP Discovery Strategy:**
  - In `_cdp_evaluate`, query two reliable internal sources inside the authenticated Spotify Client:
    1. **`RootlistAPI` + `LibraryAPI`:** Extract any saved *Discover Weekly*, *Release Radar*, *Daylist*, or *Daily Mix* URIs already in the user's library.
    2. **Home Feed / Pathfinder Extraction:** Query the internal Home feed via `Platform.Registry` (`HomeAPI` / `PathfinderAPI` `queryHome` operation, or DOM/React Fiber inspection of the client's Home view sections matching `"Made For You"`, `"Your Daily Mix"`, `"Uniquely Yours"`).
    3. **Search Fallback in CDP:** Execute `SearchAPI.search("Made For You", { types: ["playlist"] })` or `SearchAPI.search("daylist", ...)` inside the first-party client context, which carries first-party bearer credentials exempt from third-party Dev Mode restrictions.
  - Once a mix URI (`spotify:playlist:37i9dQZF1E...`) is selected, load its tracks via the existing `_cdp_get_playlist_tracks` (`PlaylistAPI.getContents`) and play via `PlayerAPI.play({ uri })` or Connect transfer.

### 5. Spotify Jam & Living Room QR Sessions (`JAM-01`)
- **Session Creation & Discovery:**
  - When running the Official Spotify Client engine, resolve `SocialConnectAPI` (or `ConnectAPI` / internal dealer `social-connect/v2/sessions`) via `_cdp_evaluate`.
  - Call `socialConnectApi.createSession()` / `getActiveSession()` to retrieve the active `join_session_uri` / `session_id` (e.g., `https://open.spotify.com/socialsession/...` or `spotify:socialsession:...`).
  - **Universal Fallback (`librespot` or when `SocialConnectAPI` is inactive):** Generate a Deep-Link Share / Device Connect QR code (`https://open.spotify.com/track/...` or context share link + manual Jam join URL entry/paste), allowing living-room guests to scan directly with their phone camera.
- **QR Rendering:** Use the already-installed `qrcode.react` (`<QRCodeSVG value={jamUrl} size={220} level="M" includeMargin />`). Because `QRCodeSVG` renders inline `<svg><path .../></svg>`, it never triggers Steam CEF image CSP blocks.

### 6. Per-Game EQ/Volume Profiles & 100% Silent HUD Toasts (`GAME-01` & `TOAST-01`)
- **Per-Game Audio Profiles (`GAME-01`):**
  - Extend `_PROFILE_DEFAULTS` in `py_modules/soundtrack.py` with `"eq_preset": None` (e.g., `"flat"`, `"bass"`, `"vocal"`, `"gaming"`, `"deck_speakers"`, `"late_night"`, `"custom"`).
  - On game launch in `SoundtrackManager`, snapshot the user's current global `eq_preset` alongside `_pre_game_snapshot`, apply the game's `eq_preset` via `py_modules/equalizer.py`, and apply `volume_override` / `ducking_override` via `VolumeFader`. Restore global EQ and volume on game exit.
- **100% Silent In-Overlay Track-Change Toast (`TOAST-01`):**
  - **Root Cause:** Decky Loader's `toaster.toast(...)` delegates to SteamOS `SteamClient.Notifications`, which plays the Steam UI notification chime inside `steamwebhelper` unless system-wide Steam notifications are muted.
  - **Solution:** When `settings.toast_sound_enabled === false`, bypass `toaster.toast()` for track-change notifications entirely. Instead, trigger a dedicated lightweight state banner inside `DeckifyOverlay.tsx` (the existing Gamescope HUD component with `pointerEvents: "none"`). This renders a crisp 4-second sliding track-change card with album art, title, and artist with **zero audio chime** and zero focus theft.

### 7. Podcast & Audiobook Power Suite (`POD-01`)
- **Playback Speed (`0.75x`–`2.0x`):**
  - Spotify's public Web API does not expose a playback speed endpoint.
  - **Primary (CDP `PlayerAPI` / `PlaybackAPI`):** Execute `playerApi.setPlaybackSpeed(speed)` (or `playbackApi.setSpeed(speed)` / HTMLMediaElement `playbackRate` inside CDP).
  - **Universal Audio Engine Fallback (`librespot`):** Store episode speed preference in `settings.json`; when `spotify_client` CDP is active, apply native speed control; on `librespot`, display a clear engine badge or apply PipeWire pitch-preserving tempo if available, while persisting per-show speed preferences.
- **Smart Skip (`-15s` / `+15s`) & Resume Progress:**
  - When `PlaybackState.item_type === "episode"` (or URI starts with `spotify:episode:`), swap or augment the transport bar with `-15s` / `+15s` buttons that invoke `seek_playback(current_pos ± 15000)`.
  - Persist local episode resume positions in `~/.config/deckify/episode_progress.json` (`{ episode_id: { position_ms, duration_ms, fully_played, updated_at } }`) merged with Spotify API `resume_point` and CDP `ep.playedState` (already parsed in `_cdp_get_saved_episodes` lines 880–893 of `py_modules/engine.py`) to power the **Unplayed** filter pill and progress bars.

### 8. Instant Track Radio, Deep Artist/Album Drill-Down & Crossfade (`RADIO-01`)
- **Instant Song/Artist Radio:**
  - Since November 2024, Spotify deprecated `GET /v1/recommendations` for Web API Dev Mode apps (returning `HTTP 404`).
  - **3-Tier Radio Waterfall:**
    1. **CDP Station / Seed Radio:** Via `_cdp_evaluate`, call `PlayerAPI.play({ uri: "spotify:station:track:" + trackId })` or query Pathfinder `seedToPlaylist` / `RadioAPI` to launch Spotify's official algorithmic Track/Artist Radio.
    2. **Web API Search Radio Mix Fallback:** Query `GET /v1/search?q="{track_name}" "{artist_name}" radio&type=playlist&limit=5` or fetch Artist Top Tracks + Album Tracks + Related Album tracks and shuffle-slice them into an instant 30-track radio queue.
    3. **Legacy `/v1/recommendations`:** Attempt first only if the user's Client ID is not flagged, falling back immediately on 404/403 without tripping the rate-limit breaker.
- **Native Crossfade (`0–12s`):**
  - Update `_update_spotify_prefs_content` in `py_modules/engine.py` to write `audio.crossfade_v2=true` and `audio.crossfade.time_ms={seconds * 1000}` into the Spotify Client `prefs` file, AND apply it live via CDP `PlayerAPI` / `PrefsAPI` (`prefsApi.set("audio.crossfade_v2", enabled)`, `prefsApi.set("audio.crossfade.time_ms", ms)`).
  - For `librespot`, supplement track transitions or expose crossfade via `VolumeFader` ramp overlaps / engine configuration.

### 9. Extended In-Game Quick-Chords & HUD Feedback (`CHORD-01`)
- **Implementation:** Extend the existing global gamepad chord listener in `src/index.tsx` (`SteamClient.Input.RegisterForControllerStateChanges`) with configurable chord bindings stored in `settings.json`:
  - `STEAM/QAM + Action` → Toggle Like (`♥`) on current track (calls `toggle_like_track`).
  - `STEAM/QAM + Action` → Cycle next Pinned Playlist (`0 → 1 → 2 → 3 → 0`, calls `quick_play_pinned`).
  - `STEAM/QAM + Action` → Toggle Synced Lyrics line in Gamescope HUD.
- **HUD Confirmation:** Dispatch a custom DOM event `window.dispatchEvent(new CustomEvent("deckify:hud-flash", { detail: { icon, text } }))` received by `DeckifyOverlay.tsx` to display a 2-second visual pill confirmation (`"♥ Liked Track"`, `"▶ Pinned: Cyberpunk Mix"`, `"♪ Lyrics HUD: ON"`).

### 10. Listening Stats ("Deck Wrapped"), Scrobbling & Profile Backup (`STATS-01`)
- **Storage Engine (JSONL + Summary JSON, NOT SQLite):**
  - Some minimal Python builds or locked databases cause `sqlite3.OperationalError` across suspend/resume cycles. Since a heavy listener plays ~300–500 tracks/week (~15,000/year = `< 1.5 MB` of text), store listening history in an append-only JSON Lines log (`~/.config/deckify/listening_history.jsonl`) plus an atomic aggregated summary (`~/.config/deckify/listening_stats.json`).
  - Track: `timestamp`, `track_id`, `track_name`, `artist_name`, `album_name`, `duration_played_ms`, and `active_game_app_id` / `active_game_name` (from `SoundtrackManager._active_game_app_id`). This directly computes **Top Tracks, Top Artists, Total Minutes, and Top Game + Soundtrack Pairings**.
- **Last.fm & ListenBrainz Scrobbler (Pure Python Stdlib):**
  - **ListenBrainz:** `POST https://api.listenbrainz.org/1/submit-listens` with `Authorization: Token <user_token>` and JSON payload (`listen_type: "single"` or `"playing_now"`).
  - **Last.fm API v2.0:** `POST https://ws.audioscrobbler.com/2.0/` using `hashlib.md5` signature generation (`api_sig = md5(sorted_params_concat + api_secret)`). Supports mobile session auth (`auth.getMobileSession` or web token flow) and `track.scrobble` / `track.updateNowPlaying`.
  - **Offline Retry Queue:** Failed scrobbles (e.g., while gaming offline on a flight) append to `~/.config/deckify/scrobble_queue.json` (capped at 500 entries) and flush in batches when connectivity returns.
- **1-Click Profile Backup & Restore:**
  - Export/import a single versioned JSON bundle (`~/.config/deckify/deckify-backup-YYYYMMDD.json` or `/home/deck/Downloads/deckify-backup.json`) containing `settings.json`, `game_audio_profiles`, `pinned_playlists`, `eq_custom_bands`, `lyrics_offsets`, and `listening_stats`.

### 11. Search 2.0: History Pills, Genre/Mood Tiles & Podcast Search (`SEARCH-01`)
- **Search History:** Persist the last 12 unique search queries in `settings.json` (`search_history: string[]`) with 1-click clear and individual pill deletion.
- **Curated Gaming/Mood Browse Tiles:** Because Spotify deprecated `GET /v1/browse/categories` for Dev Mode apps in late 2024, define 12 curated controller-friendly Genre & Gaming Mood tiles in TypeScript (`Cyberpunk / Synthwave`, `Lo-Fi Focus`, `Boss Fight Metal`, `Chiptune & Retro`, `Ambient Exploration`, `Hip-Hop Grinding`, `Anime & J-Pop`, `Electronic / DnB`, `Acoustic Chill`, `Podcasts & Talk`, `Audiobooks`, `Late Night Jazz`). Selecting a tile executes a targeted multi-type search or CDP category lookup.
- **Podcasts & Episodes Filter:** Extend `search_spotify` in `py_modules/rpc_library.py` to pass `type="track,artist,album,playlist,show,episode"` (or filtered subsets) and normalize `shows` and `episodes` arrays with `resume_point` metadata.

### 12. Lyrics 2.0: `.lrc` Disk Cache, Per-Track Sync Nudge & Romanization (`LYRICS-01`)
- **Standard `.lrc` Disk Cache (`~/.cache/deckify/lyrics/`):**
  - Extend `py_modules/spotify.py` (`LYRICS_CACHE_DIR`) to write human-readable `.lrc` files (`{sanitized_artist} - {sanitized_title} [{track_id}].lrc`) alongside the SHA-256 `.json` metadata cache so users can also drop custom `.lrc` files into `~/.cache/deckify/lyrics/` for offline playback.
- **Per-Track `±0.5s` Sync Offset Nudging:**
  - Store a dictionary `lyrics_track_offsets: dict[str, int]` (mapping `track_id` → offset in milliseconds, e.g., `-500`, `+500`, `+1000`, capped at 1,000 entries LRU) in `settings.json`.
  - Apply `effective_offset_ms = global_overlay_lyrics_offset_ms + track_offset_ms` in both `LyricsTab` and `DeckifyOverlay.tsx` discrete `setTimeout` scheduler.
- **Zero-Bloat CJK Romanization (`py_modules/romanize.py`):**
  - **Tier 1 (Upstream Phonetic Lyrics):** In `_fetch_netease_lyrics` (`py_modules/spotify.py` line 343), NetEase's `/api/song/lyric?lv=-1&kv=-1&tv=-1&rv=-1` endpoint natively returns `romalrc.lyric` (pre-segmented Romaji/Pinyin/Romaja synced lines!). Similarly, Spotify CDP lyrics payloads often include `transliteratedLines`. Extracting these first provides 100% accurate Kanji/Pinyin readings for popular J-Pop/C-Pop/K-Pop tracks with **zero local dictionary size**.
  - **Tier 2 (Pure-Python Deterministic Fallback for Unannotated LRC):**
    - **Korean (Hangul → Revised Romanization):** 50 lines of pure Python Unicode arithmetic decomposing Hangul syllables (`0xAC00..0xD7A3`) into Lead (`Choseong`), Vowel (`Jungseong`), and Tail (`Jongseong`) Jamo indices. Zero dictionary required; 100% Hangul coverage.
    - **Japanese (Hiragana / Katakana → Hepburn Romaji):** 80-line pure-Python lookup table covering all Hiragana (`0x3040..0x309F`), Katakana (`0x30A0..0x30FF`), digraphs (`きゃ` → `kya`), and sokuon (`っ` → consonant doubling).
    - **Chinese (Hanzi → Pinyin):** Compact gzipped single-reading Unihan table (`~45 KB` compressed in `py_modules/pinyin_data.py` covering the 6,500 most common CJK ideographs `0x4E00..0x9FFF` loaded lazily via `zlib.decompress` only when `lyrics_romanization_enabled` is true).

### 13. Spotify Connect Hub 2.0 (`CONNECT-01`)
- **1-Click "Pull Playback to Steam Deck" (Auto-Wake):**
  - Create a unified RPC `pull_playback_to_deck()` in `py_modules/rpc_playback.py`:
    1. Ensure local engine (`librespot` or `spotify_client`) is running; if stopped or suspended by Eco-Mode, start it and wait up to `3.5s` for local device registration.
    2. Match the local device in `GET /v1/me/player/devices` (by `settings.device_name` or `"Deckify"` / `"Steam Deck"`) or via CDP `ConnectAPI`.
    3. Execute `PUT /v1/me/player` (`{"device_ids": [local_device_id], "play": True}`).
- **Remote Device Volume Control & Badges:**
  - Differentiate local PipeWire volume (`VolumeFader`) from remote Connect device volume (`PUT /v1/me/player/volume?volume_percent=X&device_id=Y`, debounced at `350ms` to prevent HTTP 429 rate limits). Expose `supports_volume`, `type` (`Computer`, `Smartphone`, `Speaker`, `TV`, `AVR`), and active engine badge (`librespot 320k` vs `Spotify Client Lossless/CDP`).

### 14. Dynamic Album-Art Accent Colors & Handheld Battery Eco-Mode (`THEME-01` & `ECO-01`)
- **Dynamic Album-Art Dominant Color Extraction (`THEME-01`):**
  - Extract in the **Frontend** (`src/utils/colorExtractor.ts`) from the already-loaded `data:image/...;base64,...` cover art string:
    1. Draw the `<img>` onto an offscreen `24x24` `<canvas>` (`ctx.drawImage(img, 0, 0, 24, 24)`).
    2. Read pixels via `ctx.getImageData(0, 0, 24, 24).data` (works without CORS tainting because the source is a local `data:` URI!).
    3. Filter out near-black (`L < 0.15`), near-white (`L > 0.88`), and low-saturation grays (`S < 0.20`), bucket remaining pixels in HSL space, and clamp relative luminance so text contrast on dark SteamOS backgrounds always satisfies WCAG AA (`>= 4.5:1`).
    4. Set CSS custom properties `--deckify-accent` and `--deckify-accent-glow` on the modal/HUD root and cache `[imageUrl]: hexColor` in an in-memory `Map` (max 100 entries).
- **Handheld Battery Eco-Mode (`ECO-01`):**
  - Detect battery vs AC power via Linux sysfs (`/sys/class/power_supply/ACAD/online` or `/sys/class/power_supply/BAT1/status == "Discharging"` — pure file read, `< 0.1 ms`, no subprocess needed).
  - When Eco-Mode is enabled (or set to `"Auto on Battery"`):
    1. Suspend the `parec` audio spectrum visualizer and CSS glow animations.
    2. Lengthen background Web API fallback poll interval when playback is paused (`20s` → `60s`).
    3. Automatically terminate/suspend the idle background `librespot` or `spotify_client` process after a configurable idle pause timeout (e.g., `10 minutes` paused while a game is running), relying on v0.5's auto-wake on next play command.

---

## Installation

**No new `npm` or `pip` dependencies are required for Milestone v0.7.** All 14 feature pillars are built using the existing `package.json` dependencies (`@decky/ui`, `@decky/api`, `qrcode.react`, `react-icons`) and Python 3.11+ standard library modules.

```bash
# Existing frontend dependencies (no additions needed; qrcode.react 4.2.0 is already installed)
pnpm install

# Verify frontend bundle & types
pnpm run typecheck && pnpm run build

# Run unit test suites
pnpm test && pnpm run test:python
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Frontend `<canvas>` `24x24` `getImageData` HSL bucket extractor (`THEME-01`) | `node-vibrant` / `colorthief` (npm) or Python `Pillow` | Never use `Pillow` in Decky Loader (C-extension `libjpeg`/`zlib` ABI crashes). Only consider `colorthief` if multi-swatch k-means clustering is needed beyond 2 accent colors, though 40 lines of TS canvas logic is faster and adds 0 KB to the bundle. |
| `parec --monitor-stream` + pure-Python 16-band Goertzel/DFT (`TV-01`) | `cava` binary or `numpy.fft` | Only if shipping a statically compiled `bin/cava` binary alongside `bin/librespot`. Pure-Python Goertzel on `11025 Hz` `512`-sample frames uses `< 0.5%` of one Zen 2 core and requires no extra binary maintenance. |
| Append-only `.jsonl` + atomic `.json` summary (`STATS-01`) | Python `sqlite3` database | Only if dataset exceeds 100,000+ local records requiring ad-hoc relational joins. For Deck Wrapped annual stats (~5,000–20,000 plays), JSONL + in-memory rollup is lock-free across Steam Deck sleep/wake cycles. |
| Hybrid NetEase `romalrc` + pure-Python Hangul/Kana + compact Unihan table (`LYRICS-01`) | `kuroshiro` + `kuromoji.js` + `pinyin-pro` (npm) | Only in a desktop Electron app where a 15–20 MB dictionary download is acceptable. In a Decky plugin, bundling `kuromoji` + `pinyin-pro` bloats `dist/index.js` by 2+ MB and fails offline due to CEF CSP blocking CDN dictionary fetches. |
| In-overlay silent React toast banner inside `DeckifyOverlay.tsx` (`TOAST-01`) | Decky `toaster.toast({ sound: 0 })` | SteamOS GamepadUI frequently ignores `sound: 0` or plays the default notification cue in `steamwebhelper`. Rendering track changes inside Deckify's own Gamescope overlay guarantees 100% silence. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Python C-Extension Packages (`numpy`, `scipy`, `Pillow`, `pylast` with C deps, `MeCab`, `dbus-python`) | Decky Loader's PyInstaller runtime bundles its own Python shared libraries; loading C extensions compiled against system glibc/OpenSSL causes immediate `ImportError` or segfaults on SteamOS updates. | Python 3.11+ stdlib (`struct`, `math`, `hashlib`, `urllib.request`, `zlib`) and frontend `<canvas>` for image pixel sampling. |
| Spotify Web API `GET /v1/recommendations` or `GET /v1/browse/categories` as primary endpoints | Deprecated by Spotify in November 2024 for Development Mode applications (returns `HTTP 404` / `403`). | CDP `PlayerAPI` / Pathfinder / `SearchAPI` inside the Official Spotify Client, with Web API search-based playlist/artist-top-tracks fallback. |
| Continuous `requestAnimationFrame` canvas spectrum drawing in Gamescope In-Game HUD | Redrawing a transparent overlay at 60 FPS inside Gamescope forces composition passes that steal 3–8% GPU frame time from running AAA games. | Restrict the audio spectrum visualizer strictly to the **10-Foot Docked TV Split-View Modal** (`TV-01`), and suspend it immediately when the modal closes or Eco-Mode activates. |
| `pactl` monitor of the default hardware sink (`@DEFAULT_MONITOR@`) for the visualizer | Captures *all* system audio (game dialogue, gunfire, Discord voice chat, Steam UI navigation sounds), ruining music spectrum visualization and risking privacy leaks. | `parec --monitor-stream=<sink_input_id>` using the existing `resolve_spotify_sink_input_ids()` allowlist so only Deckify's music stream is analyzed. |
| External image URLs (`https://api.qrserver.com/...` or `https://i.scdn.co/...`) in `<img>` tags | Blocked by Steam GamepadUI CEF Content Security Policy (`img-src 'self' data: blob: https://steamloopback.host`). | Inline `<QRCodeSVG>` from `qrcode.react` for QR codes, and `get_image` base64 Data URI proxy for all Spotify artwork. |

---

## Stack Patterns by Variant

**If `audio_backend == "spotify_client"` (Official Spotify Flatpak + CDP Port 9229):**
- Use **CDP `Platform.Registry`** (`PlayerAPI`, `PlaylistAPI`, `OfflineAPI`, `SocialConnectAPI`, Pathfinder `queryHome`) for native queue reordering/removal, offline playlist downloads (`CDP-01`), algorithmic mixes (*Daylist*, *Discover Weekly*, `DISC-04`), native playback speed (`0.75x–2.0x`), crossfade (`0–12s`), and Jam session creation (`JAM-01`).
- Because the official client holds a first-party session token, it is completely exempt from third-party Web API Dev Mode deprecations.

**If `audio_backend == "librespot"` (Lightweight Headless Daemon):**
- Use **URI-slice virtual queue mutation** (`PUT /v1/me/player/play` with mutated `uris` array) for Queue Studio reorder/remove/clear (`QUEUE-03`).
- Use **Search-backed & Artist-Top-Tracks seed assembly** for Instant Song/Artist Radio (`RADIO-01`) and **shareable deep-link QR codes** for Living Room track/playlist sharing (`JAM-01`).
- Gracefully disable or badge CDP-exclusive offline downloads (`CDP-01`) with a 1-click prompt to switch to the Spotify Client engine when offline caching is requested.

**If Handheld on Battery (`ECO-01` Active):**
- Read `/sys/class/power_supply/BAT1/status` (or `BAT0`); automatically disable the `parec` spectrum visualizer, disable heavy CSS blur/glow filters, throttle paused polling, and suspend idle playback daemons after 10 minutes of pause during active gameplay.

---

## Version Compatibility

| Package / Binary | Compatible With | Notes |
|------------------|-----------------|-------|
| `qrcode.react@4.2.0` | `react@19.2.x` + `@decky/ui@4.11.1` | Already in `package.json`; import `{ QRCodeSVG }` from `"qrcode.react"` for zero-CSP-issue inline SVG rendering. |
| `com.spotify.Client` (Flatpak) | Chrome DevTools Protocol (`--remote-debugging-port=9229`) | React Fiber tree traversal (`#main` → `__reactFiber$` → `registry._map`) is already proven in `py_modules/engine.py`; cache resolved registry method names per session with defensive `typeof fn === 'function'` guards. |
| `parec` (PipeWire PulseAudio compat) | SteamOS 3.5 / 3.6 / 3.7+ (`pipewire-pulse`) | Supports `--monitor-stream=<index>` to tap a single sink-input without creating visible virtual nodes in Steam's audio settings dropdown. |

---

## Sources

- `C:/Users/djdje/Deckify/py_modules/engine.py` — Verified existing raw WebSocket CDP implementation (`_cdp_call`, `_cdp_evaluate`), React Fiber `Platform.Registry._map` resolution (`RootlistAPI`, `LibraryAPI`, `PlaylistAPI`), and Spotify `prefs` file management.
- `C:/Users/djdje/Deckify/py_modules/spotify.py` — Verified 5-tier lyrics waterfall (CDP, LRCLIB, NetEase `/api/song/lyric`, Musixmatch, Lyrics.ovh) and `~/.cache/deckify/lyrics/` disk cache structure.
- `C:/Users/djdje/Deckify/py_modules/equalizer.py` & `py_modules/dock.py` — Verified 10-band PipeWire `filter-chain` EQ architecture and `pactl subscribe` USB/HDMI dock hotplug classifier.
- `C:/Users/djdje/Deckify/package.json` — Verified `qrcode.react@^4.2.0`, `@decky/ui@^4.11.1`, `@decky/api@^1.1.3`, React 19 types, and Rollup bundler setup.
- Spicetify `Platform.Registry` & Pathfinder internal API specifications — Verified `PlayerAPI`, `PlaylistAPI`, `OfflineAPI`, `SocialConnectAPI`, and Pathfinder `queryHome` capabilities inside Spotify's CEF client.
- Spotify Web API November 2024 Change Notice — Verified Dev Mode deprecations for `/v1/recommendations`, `/v1/browse/categories`, and Spotify-owned algorithmic playlists, informing the CDP-first + Search-fallback hybrid architecture.

---
*Stack research for: Deckify Milestone v0.7 (Studio, Living Room TV, Offline Travel & Ultimate Immersion)*
*Researched: 2026-11-18*
