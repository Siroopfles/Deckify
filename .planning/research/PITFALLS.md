# Pitfalls Research

**Domain:** SteamOS GamepadUI Spotify Client & Audio Plugin — Milestone v0.7 (Studio, Living Room TV, Offline Travel & Ultimate Immersion)
**Researched:** 2026-11-18
**Confidence:** HIGH (grounded in Deckify v0.4–v0.6 production architecture, SteamOS 3.5–3.7 CEF/Gamescope/PipeWire constraints, and Spotify Web API Dev Mode + CDP Platform Registry behavior)

---

## Critical Pitfalls

### Pitfall 1: Dual-Engine Contention & Silent CDP Fallbacks When `librespot` Is the Active Engine (`CDP-01`, `DISC-04`, `QUEUE-03`, `POD-01`, `RADIO-01`)

**What goes wrong:**
Several v0.7 features depend on the Official Spotify Client's internal Chrome DevTools Protocol (CDP port `9229`) Platform Registry (`OfflineAPI`, `PlayerAPI`, Pathfinder GraphQL, `PlaybackAPI` speed control):
- **CDP-01:** Offline downloads via `OfflineAPI`
- **DISC-04:** Algorithmic mixes (*Daylist*, *Discover Weekly*, *Release Radar*, *Daily Mixes*) blocked by Spotify Web API Dev Mode (`403`/`404`)
- **QUEUE-03:** Native queue reordering/removal via `PlayerAPI._queue`
- **POD-01:** `0.75x–2.0x` podcast playback speed (unsupported by Spotify Web API and `librespot`)

If a user is running the default `librespot` engine (`audio_backend == "librespot"`), the Official Spotify Flatpak (`com.spotify.Client`) and its `kwin_wayland` virtual display are **not running** (`main.py:start_librespot` explicitly calls `await self._kill_spotify_client()`). Calling `_cdp_evaluate` returns `None`, causing features to silently fail, hang on 4s timeouts, or worse—if a developer naively spawns the Official Client in the background while `librespot` is active—both engines fight for the active Spotify Connect session and create duplicate PipeWire sink-inputs (`resolve_spotify_sink_input_ids`), breaking `VolumeFader` and `EqualizerManager`.

**Why it happens:**
Developers test CDP features while `audio_backend == "spotify_client"` is active and forget that `librespot` is Deckify's default lightweight engine. Furthermore, since November 2024, Spotify Web API Development Mode apps return `HTTP 404` or `HTTP 403` for algorithmic Spotify-owned playlists (`37i9dQZF1...`), `/v1/recommendations`, and `/v1/browse/categories` playlists.

**How to avoid:**
1. **Never run `librespot` and `com.spotify.Client` simultaneously as active audio sinks.** Preserve the single-active-engine invariant in `main.py`.
2. **Explicit Engine Capability Matrix & Graceful Degradation:**
   - **CDP-01 (Offline Downloads):** Strictly require `audio_backend == "spotify_client"`. When `librespot` is active, show a clear *"Switch to Official Spotify Client in Settings to enable Offline Downloads"* banner with a 1-click switch button rather than broken download icons.
   - **DISC-04 (Discovery 2.0) & RADIO-01 (Track/Artist Radio):** When `spotify_client` is running, use CDP Pathfinder (`queryHome` / `seedToPlaylist`). When `librespot` is running, **do not call deprecated `/v1/recommendations` directly without fallback**; construct a synthesized station queue from `/v1/me/top/tracks`, `/v1/artists/{id}/top-tracks`, and `/v1/search` artist/track queries so Radio and Discovery mixes work on *both* engines.
   - **QUEUE-03 (Queue Studio):** Use CDP `PlayerAPI` when `spotify_client` is active; when `librespot` is active, maintain a shadow virtual queue in Deckify backend state and execute modifications by slicing and re-submitting `uris` to `PUT /v1/me/player/play` (building on Phase 4's URI-slice pattern).
   - **POD-01 (Podcast Speed):** Use CDP `PlayerAPI.setPlaybackSpeed` when `spotify_client` is active; on `librespot`, either disable the speed pill with an engine badge or route through an optional PipeWire pitch-preserving tempo filter—never fail silently.

**Warning signs:**
- RPC calls in `rpc_library.py` or `rpc_playback.py` taking 4–8 seconds when `librespot` is active (waiting for `_cdp_get_page_target` connection timeout on `127.0.0.1:9229`).
- `HTTP 404` or `HTTP 403` errors logged when clicking *Discover Weekly* or *Start Track Radio* in Dev Mode.

**Phase to address:**
- Phase covering **DISC-04 / CDP-01** (CDP Discovery & Offline Engine Bridge) and **QUEUE-03 / POD-01 / RADIO-01**.

---

### Pitfall 2: PipeWire Audio Spectrum Visualizer & Dynamic Theme Starving Gamescope / Battery (`TV-01`, `THEME-01`, `ECO-01`)

**What goes wrong:**
`TV-01` adds a real-time PipeWire audio spectrum visualizer to the 10-foot Docked TV Split-View Mode, and `THEME-01` extracts dominant album-art colors. Two severe failure modes occur on Steam Deck:
1. **CPU/IPC Starvation:** Spawning `pw-cat --record` or `parec` in Python, computing FFT at 30–60 Hz, and streaming frequency arrays over Decky's WebSocket RPC (`decky.emit("visualizer_frame", ...)` or frontend `callable` polling) saturates the Python `asyncio` event loop and Steam CEF's main JS thread. In-game framerates stutter, controller input lags, and handheld battery drain jumps by 1.5W–3W.
2. **PipeWire Monitor Feedback or Stream Restores:** Attaching a recording stream directly to a hardware sink instead of Deckify's isolated sink-input or `deckify_eq_sink.monitor` captures game audio and Steam UI clicks, or triggers PipeWire `module-stream-restore` routing bugs.

**Why it happens:**
Decky Loader's frontend-backend bridge (`@decky/api`) serializes every `decky.emit` payload over a local WebSocket into the main Steam UI `steamwebhelper` process. It is designed for state events (`<1 Hz`), not 60 FPS telemetry streams.

**How to avoid:**
1. **Strict Lifecycle Scoping for the Visualizer (`TV-01` & `ECO-01`):** The PipeWire audio capture process (`parec --monitor-stream=<sink_input_id>` or `deckify_eq_sink.monitor`) must **only** run when:
   - The Deckify Expanded Modal is currently open (`bigOpen === true`), **AND**
   - `TV-01` Split-View Mode is active and the visualizer toggle is enabled, **AND**
   - `ECO-01` Handheld Battery Eco-Mode is **not** suppressing background visualizers.
   As soon as the modal closes (`onDismount` / `closeModal`) or a game launches, terminate the capture subprocess within `<100ms`.
2. **Low-Overhead Downsampled Capture or Synthesized Envelope:**
   - Capture mono 8-bit/16-bit PCM at low sample rate (`8000 Hz` or `11025 Hz`), compute 12–16 log-spaced frequency bars in Python using pure `struct` + lightweight Goertzel/binning (no heavy `numpy`/`scipy` C-extensions that break under Decky's `LD_LIBRARY_PATH`), and cap emissions to **12–15 Hz maximum** (`~66ms–80ms` interval) with CSS `transition: transform 80ms linear` on GPU-composited `transform: scaleY(...)` bars (never animate `height`, which triggers CEF layout reflows).
3. **Zero-Canvas CSP Risk for `THEME-01`:** Because cover art is already proxied through `py_modules/images.py` as raw bytes in Python (`_fetch_spotify_image`), extract the dominant RGB accent color **in Python** from the raw JPEG header/thumbnail bytes (or a small 16x16 downsample) and cache it alongside the image cache—avoiding `<canvas>` `getImageData()` CORS/CSP taint errors in Steam CEF and guaranteeing contrast ratios (`WCAG AA >= 4.5:1`) against white text before sending to the frontend.

**Warning signs:**
- `steamwebhelper` CPU usage exceeding 8–10% while the TV Split-View is open.
- Visualizer subprocess (`parec` / `pw-record`) still visible in `ps aux` after closing the Deckify modal.
- Unreadable white text when a bright yellow/white album cover sets `--deckify-accent` without luminance clamping.

**Phase to address:**
- Phase covering **TV-01** (10-Foot Docked TV Split-View & Visualizer) and **THEME-01 & ECO-01** (Dynamic Accents & Battery Eco-Mode).

---

### Pitfall 3: Four-Way Audio Priority Collision (`GAME-01` vs `EqualizerManager` vs `VolumeFader` vs `DockAudioSwitcher` vs `SleepTimer`)

**What goes wrong:**
In v0.6, Deckify established four audio controllers:
1. `VolumeFader` (`py_modules/volume.py`): Local PipeWire sink-input fader with `"game"` and `"voice"` ducking reasons plus a `"sleep"` priority lock (`_sleep_locked`).
2. `SoundtrackManager` (`py_modules/soundtrack.py`): Snapshots pre-game Spotify state (`_pre_game_snapshot`), applies `volume_override` via Spotify Web API (`self.plugin.set_volume`), and restores on game exit after a 3.0s debounce.
3. `EqualizerManager` (`py_modules/equalizer.py`): Spawns an isolated `pipewire -c eq-filter-chain.conf` process (`deckify_eq_sink` -> `effect_output.deckify_eq`) and persists `self.plugin._settings["eq_preset"]`.
4. `DockAudioSwitcher` (`py_modules/dock.py`): Watches `pactl subscribe` and moves either the raw stream or `effect_output.deckify_eq` to USB-DAC/HDMI.

When `GAME-01` adds **Per-Game 10-Band EQ Presets** and **Per-Game Volume/Ducking Profiles** in `SoundtracksTab`:
- **Permanent Global EQ Overwrite:** If `SoundtrackManager._run_launch` calls `apply_equalizer_preset(game_eq_preset)`, it overwrites `plugin._settings["eq_preset"]` on disk (`volume.py:106`). If Steam crashes or the user reboots mid-game, their global EQ preset is permanently lost.
- **Filter-Chain Teardown Race on Game Launch:** Switching from `"flat"` (where `EqualizerManager` filter-chain is unloaded/bypassed) to a game's `"gaming"` EQ spawns the `pipewire -c` filter-chain subprocess asynchronously. Simultaneously, `VolumeFader` is ramping down for in-game auto-ducking (`trigger_ducking(True, "game")`). While `deckify_eq_sink` is being created and sink-inputs are moved into it, `VolumeFader._cached_sink_input_id` becomes stale or targets `effect_output.deckify_eq` while `SoundtrackManager` changes cloud volume, resulting in sudden volume spikes or un-ducked audio.
- **Sleep Timer Violation:** If a game exits while the Sleep Timer is in its final 30-second fade-out (`_sleep_timer_fading == True`), `SoundtrackManager._run_exit` restoring `snap["volume"]` or un-ducking will blast audio right before sleep.

**Why it happens:**
Each manager mutates shared state (`_settings["eq_preset"]`, sink-input routing, and sink-input volume) without a layered state stack (Base Global Profile vs Ephemeral Game Override).

**How to avoid:**
1. **Ephemeral Override Layer in `EqualizerManager` and `VolumeFader`:**
   - Add `apply_ephemeral_preset(preset: str | None)` to `EqualizerManager`. It updates the live DSP filter-chain without overwriting `settings["eq_preset"]` on disk. Persist `_pre_game_eq_preset` inside `_pre_game_snapshot` (and in `settings.json` under a crash-recovery key `active_game_override_snapshot`) so exiting the game—or restarting Deckify after a crash—cleanly restores the user's global EQ.
2. **Unified Local Ducking vs Cloud Volume:**
   - Do **not** mix Spotify Web API `PUT /v1/me/player/volume` (`SoundtrackManager` `volume_override`) with local PipeWire `VolumeFader` ducking overrides on game launch. Route per-game volume and ducking targets (`game_ducking_volume`, `game_base_volume`) through `VolumeFader` locally via PipeWire (`pactl set-sink-input-volume`), avoiding cloud API 429s and 300ms latency spikes during game boot.
3. **Respect `_sleep_locked` Across All Lifecycle Hooks:**
   - Before `SoundtrackManager._run_launch` or `_run_exit` resumes playback or restores volume, check `if getattr(self.plugin._volume_fader, "_sleep_locked", False): return`.

**Warning signs:**
- User sets global EQ to `"vocal"`, plays a game bound to `"gaming"` EQ, exits the game, and `SettingsTab` still shows `"gaming"`.
- Brief 100% volume pop for 200–500ms when launching a game that activates both a per-game EQ preset and auto-ducking.

**Phase to address:**
- Phase covering **GAME-01 & TOAST-01** (Per-Game EQ/Volume Profiles & Silent HUD Toasts).

---

### Pitfall 4: Steam Toaster Audio Leak vs Gamescope HUD Overlay Coexistence (`TOAST-01`, `CHORD-01`)

**What goes wrong:**
In `src/index.tsx:1224-1241`, Deckify currently calls `toaster.toast({ ..., ...(soundEnabled ? { sound: 1 } : {}), playSound: soundEnabled })` when `track_metadata` fires. However, **SteamOS GamepadUI's native `toaster.toast` often ignores `playSound: false` or plays a default notification chime depending on the Steam client beta branch** unless custom sound fields (`sound: 0`, `eToastSound: 0`) are passed, and even then, Steam's notification manager can steal focus or emit system sounds.
To guarantee a **100% silent track-change toast** (`TOAST-01`) and instant visual feedback for **Extended Quick-Chords** (`CHORD-01`: Like `♥`, Pinned Playlist cycle, Lyrics HUD toggle), Deckify will render an in-overlay HUD toast inside `DeckifyOverlay.tsx`.
The trap:
1. If `DeckifyOverlay` renders a toast banner while `overlay_enabled` is `false` (user turned off the persistent HUD overlay in Settings, but wants silent track-change toasts), nothing appears because `DeckifyOverlay` unmounts or returns `null` when `!visible`.
2. Conversely, if `overlay_enabled` is `true` *and* `toast_enabled` is `true`, both the HUD track card and a separate toast card render on top of each other, or resetting `hideTimerRef` on chord press accidentally hides the active synced lyrics line (`lyricTimerRef`).
3. If the silent in-overlay toast forgets `pointerEvents: "none"`, it intercepts mouse/touch/controller input inside running games under Gamescope!

**Why it happens:**
`DeckifyOverlay.tsx` currently couples overlay visibility (`visible` prop from `overlay_enabled`), auto-hide timers (`hideTimerRef`), and synced lyrics (`lyricTimerRef`) into a single `isVisible` boolean (`src/components/DeckifyOverlay.tsx:48-108`).

**How to avoid:**
1. **Decouple HUD Visibility States in `DeckifyOverlay.tsx`:**
   - Separate `isHudCardVisible` (controlled by `overlay_enabled` + `overlay_autohide`), `isLyricsLineVisible` (controlled by `overlay_lyrics_enabled` + discrete `lyricTimerRef`), and `activeHudToast` (ephemeral 3.5s notification queue for Silent Track Toasts `TOAST-01` and Quick-Chord confirmations `CHORD-01`).
   - Always mount `DeckifyOverlay` as a `pointerEvents: "none"` global container (`routerHook.addGlobalComponent`), even when `overlay_enabled === false`, so silent track toasts (`TOAST-01`) and quick-chord badges (`CHORD-01`) can display for 3.0s and vanish cleanly with zero DOM cost when idle.
2. **Bypass `toaster.toast` Entirely When `toast_sound_enabled === false`:**
   - In `src/index.tsx`, when `toast_sound_enabled === false` (or when firing `CHORD-01` feedback in-game), emit a frontend custom event (`window.dispatchEvent(new CustomEvent("deckify_hud_toast", { detail: ... }))`) rendered by `DeckifyOverlay` instead of calling `@decky/api`'s `toaster.toast()`. This guarantees **zero** Steam `steamwebhelper` audio stream activation.

**Warning signs:**
- Hearing the Steam Deck notification "bloop" on track change when `toast_sound_enabled` is toggled OFF.
- Turning off "Enable In-Game Overlay" in Settings also kills Silent Track Toasts and Quick-Chord HUD confirmations.
- Pressing the "Toggle Lyrics HUD" quick-chord hides the lyrics line but doesn't show a confirmation pill.

**Phase to address:**
- Phase covering **GAME-01 & TOAST-01** and **CHORD-01**.

---

### Pitfall 5: Steam Input Chord Leakage & Guide Button Race During Gameplay (`CHORD-01`)

**What goes wrong:**
`src/index.tsx:1152-1204` implements quick-chords via `window.FocusNavController.m_rgGamepadInputSources[0].RegisterForGamepadButtonDown`. It tracks `if (btn === 13 || btn === 14) guideHeld = true;` and triggers actions when D-Pad buttons (`11`, `12`, `9`, `10`, `0`) are pressed while `guideHeld` is true.
When `CHORD-01` extends this with **Like Track (`♥`)**, **Cycle 4 Pinned Playlists**, and **Toggle Lyrics HUD**:
1. **Stuck `guideHeld` State:** If the user presses the `STEAM` (`13`) or `QAM` (`14`) button and releases it while SteamOS intercepts the chord (e.g., `STEAM + B` long-press, or opening the QAM sidebar), `RegisterForGamepadButtonUp` may not fire for button `13`/`14`. `guideHeld` remains `true` permanently! Then, every time the player presses `A`, `X`, `Y`, or `D-Pad` inside their game, Deckify skips tracks, toggles likes, and switches playlists mid-boss-fight.
2. **Collision with Native SteamOS System Chords:** Valve reserves several `STEAM + Button` combinations at the `steam` / `gamescope` driver level:
   - `STEAM + R1` = Screenshot
   - `STEAM + L1` = Magnifier
   - `STEAM + X` = Show On-Screen Keyboard
   - `STEAM + B (hold)` = Force quit game
   - `STEAM + D-Pad Right` = Enter key (in some desktop/launcher contexts)
   Binding `CHORD-01` defaults to `STEAM + X` or `STEAM + R1` will trigger screenshots or pop up the virtual keyboard over the game every time the user Likes a song!

**Why it happens:**
Steam's `FocusNavController` button callbacks do not guarantee balanced `ButtonDown`/`ButtonUp` events across system overlay transitions, and developers pick convenient face buttons (`X`, `Y`, `R1`) without checking Valve's hardcoded Steam Deck system chord table.

**How to avoid:**
1. **Timestamped `guideHeld` Expiry + Auto-Reset:**
   - Track `guideDownAtMs = Date.now()` instead of a raw boolean. If `Date.now() - guideDownAtMs > 4000` (4 seconds) or if the QAM/Modal opens/blurs, automatically reset `guideHeld = false`.
2. **Safe Default Chord Bindings & Conflict Guard:**
   - Restrict configurable chord secondaries to non-conflicting buttons or allow `QAM (...)` (`btn === 14`) vs `STEAM` (`btn === 13`) distinction.
   - Block or warn against reserved SteamOS chords (`STEAM + R1`, `STEAM + L1`, `STEAM + X`, `STEAM + B`, `STEAM + L2/R2`).
   - Debounce chord execution (`350ms` cooldown per action) so cycling through the 4 Pinned Playlists doesn't fire 4 rapid `quick_play_pinned` RPCs on button bounce.

**Warning signs:**
- Pressing D-Pad in a game without holding `STEAM` unexpectedly skips songs after opening and closing the Steam menu.
- Liking a track via quick-chord opens the SteamOS On-Screen Keyboard.

**Phase to address:**
- Phase covering **CHORD-01** (Extended In-Game Quick-Chords & HUD Feedback).

---

### Pitfall 6: D-Pad Focus Loss & React Key Remounting During Controller Queue/Playlist Reordering (`QUEUE-03`, `PL-01`)

**What goes wrong:**
In `src/components/tabs/QueueTab.tsx:120-122`, queue rows are rendered inside `<Focusable flow-children="column">` with `key={t.id || t.uri || idx}`.
When `QUEUE-03` and `PL-01` add interactive controller reordering (*Move Up*, *Move Down*, *Remove Track*):
1. **Duplicate Track Key Collision:** Queues and playlists frequently contain duplicate tracks (same `t.id` and `t.uri`). Using `key={t.id || t.uri || idx}` causes React to alias two rows to the same key, corrupting focus state when swapping adjacent items. Conversely, if a row's key changes on reorder, React unmounts and remounts the DOM node—causing SteamOS GamepadUI's `FocusNavController` to lose the focused element and jump D-pad focus back to the top sidebar (`Now Playing` tab) or the modal close button!
2. **"Grab Mode" vs "Scroll Mode" Trap:** In a 1D `flow-children="column"` list, pressing `D-Pad Up` / `D-Pad Down` moves focus to the previous/next row. If a user activates "Reorder / Grab Mode" on row `i` (presses `X` or selects *Move*), and presses `D-Pad Down`, Steam's spatial navigator moves focus to row `i+1` *at the same time* the app swaps row `i` to `i+1`, causing focus to skip two rows (`i+2`) or drop out of grab mode.

**Why it happens:**
SteamOS CEF spatial navigation (`@decky/ui` `Focusable`) handles D-pad events before or alongside React state updates unless explicitly intercepted via `onGamepadDirection` or stable focus refs.

**How to avoid:**
1. **Assign Stable Unique Instance IDs (`uid`) to Queue & Playlist Entries:**
   - When loading `queueTracks` or `playlistTracks` into state, attach a stable client-side `_rowKey` (e.g., `${track.uri}::${initialUid}`). When swapping index `i` and `i-1`, preserve `_rowKey` on the moved item so React reorders the existing DOM node in-place rather than unmounting it, or explicitly call `.focus()` on the target row ref inside a `requestAnimationFrame` after state commit.
2. **Explicit Controller Reorder UX Pattern:**
   - Provide two ergonomic controller paths:
     - **Inline Action Pill / Grab Mode:** When a row is in `isReordering` ("Grabbed") state, intercept `onGamepadDirection` (`evt.detail.button === 9` Up / `10` Down) with `evt.stopPropagation()` + `evt.preventDefault()`, swap the item in the array, keep focus locked on the grabbed item's new index, and commit the batch reorder RPC (`PUT /v1/playlists/{id}/items` with `range_start`, `insert_before`, `snapshot_id` or CDP `PlayerAPI`) when the user presses `A` (*Drop*) or `B` (*Cancel*).
     - **Avoid Per-Step API Calls:** Never fire a Spotify Web API `PUT /v1/playlists/{id}/tracks` or queue slice RPC on every single D-pad Up/Down press while moving a track 10 positions; move locally in UI state and commit once on drop (or debounce by 800ms) to avoid HTTP 429 rate-limiting and `snapshot_id` conflicts.

**Warning signs:**
- Pressing "Move Down" on a queue item teleports the controller selection highlight to the left Sidebar.
- Moving a track down 5 spots in a playlist fires 5 sequential HTTP requests and fails on the 3rd with a `400/409 snapshot_id` mismatch.

**Phase to address:**
- Phase covering **QUEUE-03 & PL-01** (Interactive Queue Studio & Full Playlist Management).

---

### Pitfall 7: Offline Disk Exhaustion & Travel Mode False Triggers on Steam Deck Wake (`CDP-01`)

**What goes wrong:**
1. **64GB eMMC Storage Exhaustion:** The Official Spotify Flatpak (`com.spotify.Client`) stores offline encrypted audio files (`PersistentCache/Storage`) inside `~/.var/app/com.spotify.Client/cache/spotify/` (on the internal root/home partition). On 64GB LCD Steam Decks (or Decks crowded with Shader Pre-Caching and Proton compatdata), downloading three lossless/320kbps playlists via `CDP-01` `OfflineAPI` can consume 5GB–15GB, completely filling `/home/deck`. When `/home/deck` hits 0 bytes free, SteamOS fails to save game progress, Deckify's atomic `_save_settings()` fails with `ENOSPC`, and the Deck can fail to boot into GamepadUI.
2. **Wake-from-Suspend Wi-Fi Reconnect False Trigger:** On Steam Deck wake from suspend, Wi-Fi takes 2–6 seconds to re-associate (which is why `py_modules/resilience.py` defines `WIFI_GRACE_WINDOW_S = 4.0`). If `CDP-01`'s automatic *Travel Mode / Offline Filter* switches the UI and playback engine into Offline Mode the instant `navigator.onLine` or network check fails on wake, it will hijack normal wake recovery and lock the user into Offline Mode every time they wake their Deck at home.

**Why it happens:**
Spotify's internal `OfflineAPI` does not enforce a safe free-space floor for SteamOS shader caches, and naive network listeners react immediately to transient interface down events during system resume.

**How to avoid:**
1. **Enforce a Mandatory Disk Free-Space Guardrail (`os.statvfs`):**
   - Before initiating any download via `OfflineAPI` (and periodically while downloads are in progress), check `os.statvfs(SPOTIFY_CLIENT_CACHE_DIR)`. Require a minimum safety buffer (e.g., **at least 3.0 GB free disk space remaining**). If free space drops below 3.0 GB, pause downloads and display a warning toast.
   - Surface live storage usage (*"Deckify Offline Storage: X.X GB used · Y.Y GB free"*) and a 1-click *"Remove All Downloads"* action in UI.
2. **Coordinate Travel Mode Activation with `SessionBookmarkManager`:**
   - Do **not** auto-activate Travel Mode during the resume recovery window (`WIFI_GRACE_WINDOW_S` / `RECOVERY_COOLDOWN_S = 10.0s` in `py_modules/resilience.py`). Require sustained network offline state (`>= 8–10 seconds` after wake) before auto-enabling the Offline Filter, and auto-exit Travel Mode (unless manually locked by the user) when Wi-Fi reconnects.

**Warning signs:**
- Waking the Steam Deck from sleep on home Wi-Fi flashes "Travel Mode Active: Showing Offline Downloads Only".
- No disk space indicator in the Offline Downloads UI.

**Phase to address:**
- Phase covering **CDP-01** (Offline Downloads & Travel Mode via CDP).

---

### Pitfall 8: CJK Lyrics Romanization Dependency Bloat & LRC Sync Offset Drift (`LYRICS-01`)

**What goes wrong:**
`LYRICS-01` adds a local `.lrc` disk cache (`~/.cache/deckify/lyrics/`), persistent per-track `-0.5s`/`+0.5s` sync offset memory, and optional Romaji (Japanese) / Pinyin (Chinese) / Revised Romanization (Korean).
1. **Japanese Kanji Morphological Traps & Binary C-Extensions:** Standard Japanese romanization libraries (`pykakasi`, `fugashi`/`MeCab`, `cutlet`) require compiled C libraries or 50MB+ dictionaries that fail to load inside Decky Loader's PyInstaller sandbox (`LD_LIBRARY_PATH` / read-only rootfs on SteamOS) or bloat the plugin zip from 2MB to 60MB. Conversely, a naive Kana-only table leaves Kanji un-romanized (which is 70% of Japanese lyrics).
2. **Double-Applied Sync Offset Between Modal and Gamescope HUD:** Currently, `DeckifyExpandedModal.tsx:136` has a transient `lyricsOffset` state, while `Settings` has a global `overlay_lyrics_offset_ms` passed to `DeckifyOverlay.tsx:28`. If `LYRICS-01` bakes the per-track offset directly into the cached `.lrc` timestamps on disk *and* applies the offset in the React line matcher, the offset is doubled—or nudging `+0.5s` in `LyricsTab` fails to update `DeckifyOverlay`'s discrete `setTimeout` scheduler (`lyricTimerRef`) in real time.

**Why it happens:**
Developers either pull in heavy NLP pip packages that aren't bundled in Deckify's shippable artifact, or store mutated timestamps instead of keeping raw `.lrc` text separate from user offset metadata.

**How to avoid:**
1. **Zero-C-Extension Romanization Strategy:**
   - **Korean (Hangul):** Pure algorithmic Unicode syllable decomposition (`0xAC00–0xD7A3` -> Initial/Medial/Final Jamo mapping in ~60 lines of pure Python or TypeScript, 0 KB dictionary, 100% accurate).
   - **Japanese & Chinese:** Use pure-Python / pure-JS lightweight lookup tables (e.g., compact Unihan Pinyin map + Kana table + LRCLIB/Spotify CDP romanized/syllable line extraction where available, or bundle a compact pure-Python wheels/JSON dictionary without native `.so` binaries). Test romanization with `LD_LIBRARY_PATH` stripped in the unit test suite.
2. **Keep `.lrc` Cache Pure; Store Per-Track Offsets in a Dedicated Index:**
   - Store unmodified `.lrc` / JSON lyrics in `~/.cache/deckify/lyrics/` keyed by Spotify `track_id` (with fallback to `sha256(clean_title + artist)`).
   - Store per-track offsets in `lyrics_offsets.json` (or `settings["track_lyrics_offsets"]` bounded to e.g. 1,000 LRU entries: `{ [track_id]: offset_ms }`).
   - Compute effective offset as `effectiveOffsetMs = globalOverlayOffsetMs + (perTrackOffsetMs[trackId] ?? 0)` and broadcast `decky.emit("lyrics_offset_updated", { track_id, offset_ms })` so `DeckifyOverlay.tsx` immediately reschedules `lyricTimerRef`.

**Warning signs:**
- `ImportError` on Steam Deck when importing a romanization library with `.so` files.
- Nudging lyrics by `+0.5s` in `LyricsTab` fixes the modal view, but the in-game HUD overlay remains out of sync.

**Phase to address:**
- Phase covering **LYRICS-01** (Lyrics 2.0: Offline LRC Cache, Per-Track Sync Nudge & Romanization).

---

### Pitfall 9: Scrobbler Duplicate / Seek-Fooled Submissions & Unsanitized JSON Profile Restore (`STATS-01`)

**What goes wrong:**
`STATS-01` adds local *"Deck Wrapped"* analytics (including *Top Game + Soundtrack* pairings), a built-in Last.fm / ListenBrainz scrobbler with offline retry queue, and 1-click JSON backup/restore.
1. **Seek-Fooled Scrobbling:** If the scrobbler checks `position_ms >= duration_ms * 0.5` (or `>= 240000 ms`), a user who uses `L2/R2` trigger seeking (`Phase 8`) to scrub past the 50% mark of a song after listening for only 3 seconds will immediately trigger a bogus scrobble and skew local *"Deck Wrapped"* playtime stats.
2. **Pause/Resume & Loop Double-Scrobbles:** When a track is paused and resumed, or when `librespot` emits `playing` / `seeked` / `position_correction` events via `--onevent`, naive event listeners reset or re-fire the scrobble for the same track playback session. Conversely, when a track is on `repeat_state == "track"` and loops back to `0ms`, it *should* count as a new listen after another 50% play.
3. **Token Leakage or Settings Corruption on JSON Backup/Restore:** If "1-Click JSON Profile Backup" dumps `self._settings` verbatim, it exports the user's secret `access_token`, `refresh_token`, and Last.fm `session_key` in plaintext. And if "Restore from JSON" blindly merges keys into `self._settings`, a malformed backup can overwrite paths, inject invalid EQ arrays, or corrupt `game_audio_profiles`.

**Why it happens:**
Scrobbling specs (Last.fm / ListenBrainz) require *actual elapsed listening time* (`>= 30s` minimum track length, and `min(4 minutes, 50% of duration)` of *accumulated wall-clock playback*), not playback cursor position.

**How to avoid:**
1. **Wall-Clock Accumulated Playtime Tracker:**
   - Track `accumulated_play_ms` per playback instance using `time.monotonic()` deltas while `play_state == "playing"`. Seeking (`seeked` event) moves `position_ms` but does **not** add to `accumulated_play_ms`. Detect track loops (`repeat_state == "track"` when `position_ms` wraps from `>80%` back to `<5s` after threshold was met) to start a fresh listen instance.
   - Persist the offline scrobble retry queue (`scrobble_queue.json`) with a cap (e.g., max 500 pending scrobbles) and exponential backoff on HTTP 5xx / offline errors.
2. **Strict Schema Allowlist & Secret Redaction on JSON Backup/Restore:**
   - **Never export OAuth tokens or API secrets** (`access_token`, `refresh_token`, `token_expires_at`, `lastfm_session_key`, `listenbrainz_token`) in profile backups unless explicitly encrypted or excluded by default.
   - Validate all restored fields through existing sanitizers (`clamp_eq_bands`, `_sanitize_pinned_playlists`, `SoundtrackManager._sanitize_profile`) before calling `_save_settings()`.

**Warning signs:**
- Pressing `R2` twice to skip to the middle of a song marks it as played in Deck Wrapped and scrobbles it to Last.fm.
- Opening an exported `deckify-backup.json` reveals `refresh_token` in plain text.

**Phase to address:**
- Phase covering **STATS-01** (Listening Stats, Scrobbling & Profile Backup).

---

### Pitfall 10: Podcast Speed & Crossfade State Leaking Back Into Music Playback (`POD-01`, `RADIO-01`)

**What goes wrong:**
- **`POD-01` Speed Leak:** A user listens to a podcast episode (`spotify:episode:...`) at `1.5x` speed, then switches to a music playlist (`spotify:playlist:...`) or launches a game whose `SoundtrackManager` auto-starts a music soundtrack. The playback engine stays at `1.5x` speed, playing all their music chipmunk-fast!
- **`RADIO-01` Crossfade Limitations:** Users configure a `6s` Crossfade slider in Deckify expecting `librespot` to crossfade tracks. However, standard `librespot` CLI only supports gapless playback (`--disable-gapless`), **not** arbitrary N-second crossfading unless handled by the Official Spotify Client (`prefs` / CDP `SettingsAPI`) or a dual-stream crossfade transitions controller. Furthermore, crossfade during a podcast or gapless concept album ruins transitions if not handled cleanly.

**Why it happens:**
Spotify's internal player speed multiplier is a global player property in CDP `PlayerAPI`, not scoped per media item type unless explicitly reset on `track_changed` when `item_type` switches from `"episode"` to `"track"`.

**How to avoid:**
1. **Auto-Reset Playback Speed to `1.0x` on Media Type Transition:**
   - Whenever the active item transitions from `type == "episode"` (or `uri.startswith("spotify:episode:")`) to `type == "track"`, automatically reset playback speed to `1.0x` while remembering the user's preferred podcast speed (`podcast_playback_speed: 1.5`) for the next episode.
2. **Honest Crossfade Engine Wiring (`RADIO-01`):**
   - For Official Spotify Client (`spotify_client`), write `audio.crossfade_v2=true` and `audio.crossfade.time_v2=<ms>` to `prefs` and sync live via CDP `SettingsAPI`.
   - For `librespot`, either implement a clean PipeWire `VolumeFader` track-end/track-start envelope or clearly label native crossfade as an Official Client DSP feature / software fade so users aren't presented with a placebo slider.

**Warning signs:**
- Starting a music track after playing a podcast plays the song at `1.5x` or `2.0x` speed.
- Changing the Crossfade slider from `0s` to `10s` while running `librespot` has zero audible effect.

**Phase to address:**
- Phase covering **POD-01** (Podcast Power Suite) and **RADIO-01** (Radio, Drill-Down & Crossfade).

---

## Technical Debt Patterns

Shortcuts that seem reasonable during v0.7 implementation but create long-term stability bugs.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Calling Spotify Web API `/v1/recommendations` or `/v1/playlists/37i9dQZF1...` without a Dev Mode `403/404` fallback | Simple 10-line REST call for Radio & Discovery mixes | Instant `HTTP 404` / `HTTP 403` for 100% of users on standard Spotify Dev Mode Client IDs | **Never** — always pair with CDP Pathfinder bridge (`DISC-04`) and a Top-Tracks/Search synthesis fallback for `librespot` |
| Streaming 60 FPS visualizer FFT arrays over `decky.emit` | Fast prototype for `TV-01` spectrum bars | Saturates `steamwebhelper` WebSocket IPC, drops in-game FPS, drains battery | **Never** — cap at 12–15 Hz, scope strictly to open TV Split-View modal, and use CSS GPU transforms |
| Mutating `settings["eq_preset"]` directly when launching a game with a `GAME-01` EQ profile | Reuses `apply_equalizer_preset()` with zero new code | Permanently overwrites the user's global EQ setting if Steam crashes or restarts mid-game | **Never** — use an ephemeral override layer in `EqualizerManager` with snapshot restore |
| Using `<canvas>` `drawImage` in Steam CEF to extract album art colors (`THEME-01`) | Standard web frontend color extraction | Fails on unproxied URLs due to CEF CSP/CORS, and runs pixel loops on the UI thread | **Never** — extract dominant RGB in Python `py_modules/images.py` when proxying image bytes and cache the hex/RGB |
| Storing per-track lyrics sync offset by rewriting timestamps inside cached `.lrc` files (`LYRICS-01`) | Avoids a separate offset lookup table | Corrupts original `.lrc` data on disk and causes double-offset bugs between `LyricsTab` and `DeckifyOverlay` | **Never** — store raw `.lrc` immutable on disk and persist `{ track_id: offset_ms }` separately |
| Writing every second of listening analytics directly to `settings.json` (`STATS-01`) | Simple persistence | Thrashes Steam Deck SSD/eMMC with atomic file renames and bloats `settings.json` payload sent on `get_status()` | **Never** — store analytics in a separate `~/.config/deckify/stats.json`, batch writes in memory, and flush on track change / sleep / unload |

---

## Integration Gotchas

Common mistakes when connecting to external services and SteamOS subsystems in v0.7.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| **Spotify Web API (Dev Mode post-Nov 2024)** | Assuming `GET /v1/recommendations`, `GET /v1/browse/featured-playlists`, or `GET /v1/playlists/{algorithmic_id}` work with a user's Dev Mode Client ID | Treat `403`/`404` on algorithmic endpoints as expected; route through CDP Pathfinder/Client registry when `spotify_client` is running, and fall back to user Top Tracks/Artists + Search synthesis when `librespot` is running |
| **Spotify Client CDP (`127.0.0.1:9229`)** | Hardcoding minified React Fiber indices or assuming `Platform.getRegistry()` is available immediately at process spawn | Traverse `__reactFiber$` / `__reactContainer$` with a bounded BFS (`visited.size < 5000`), match registry services by `k?.description` (`OfflineAPI`, `PlayerAPI`, `LibraryAPI`, `PlaylistAPI`), and retry with backoff during the first 5s after client launch |
| **Spotify Jam (`JAM-01`)** | Trying to create a Jam session via public Spotify Web API (no public REST endpoint exists for Jam creation) | Extract/invoke the active social listening / Jam session URI (`spotify:socialsession:...` or `https://open.spotify.com/socialsession/...` / Connect join link) via CDP internal `SocialConnectAPI` / `ConnectAPI`, and provide a manual/Connect device fallback when on `librespot` |
| **PipeWire Audio Capture (`TV-01` Visualizer)** | Capturing from `@DEFAULT_SINK@.monitor`, which mixes game explosions and Steam UI clicks into the music visualizer | Target Deckify's isolated sink-input (`parec --monitor-stream=<spotify_sink_input_id>`) or `deckify_eq_sink.monitor` resolved via `resolve_spotify_sink_input_ids` |
| **Last.fm / ListenBrainz APIs (`STATS-01`)** | Sending blocking HTTP scrobble requests inside the `--onevent` socket handler without timeout or retry queue | Enqueue scrobble payloads onto an async background worker with a 5s timeout and persistent `scrobble_queue.json` retry queue so offline/flaky Wi-Fi never blocks track transitions |
| **Spotify Connect Hub (`CONNECT-01`)** | Calling `PUT /v1/me/player` ("Pull to Deck") when local `librespot` or `spotify_client` is stopped or suspended by `ECO-01` | Auto-start the configured local engine first, wait for the device to register in `/v1/me/player/devices` (polling with 500ms intervals up to 4s, or using `--onevent` `session_connected`), then execute the playback transfer |

---

## Performance Traps

Patterns that work during brief desktop testing but degrade Steam Deck performance over a 3-hour gaming session.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| **Continuous DOM redraws in `DeckifyOverlay` for `TOAST-01` or `TV-01`** | Game framerate drops from 60 FPS to 45–52 FPS with uneven frame pacing in Gamescope | Keep `DeckifyOverlay` completely static (`0` timers running) except at discrete lyric transition boundaries and 3.5s toast enter/exit transitions; never mount the `TV-01` visualizer inside the in-game overlay | Immediately in GPU-bound games (Cyberpunk 2077, Elden Ring) under Gamescope |
| **Unbounded `stats.json` / `search_history` / `lyrics_cache` growth (`STATS-01`, `SEARCH-01`, `LYRICS-01`)** | `get_status()` RPC payload grows to megabytes, lagging QAM opening by 500ms+ | Keep `stats.json` and `scrobble_queue.json` out of `get_status()`; cap `.lrc` disk cache to e.g. 500 files (LRU), search history to 20 items, and per-track lyric offsets to 1,000 entries | After ~200–500 tracks played over a few weeks |
| **Eagerly proxying 50+ album covers simultaneously on `SEARCH-01` / `DISC-04` / `RADIO-01` drill-downs** | Threadpool exhaustion (`_exec`) delaying play/pause/volume RPCs by 2–3 seconds | Route all new artwork in `TV-01`, `DISC-04`, `SEARCH-01`, and `RADIO-01` through `<DeckifyImage>` and `fetchWithQueueAndCache` (Phase 2's concurrency-throttled image queue) | Whenever a view renders >20 uncached covers at once |
| **`ECO-01` aggressive engine kill during brief pause** | User pauses music for 30s to watch an in-game cutscene; Eco-Mode kills `librespot`; resuming via quick-chord takes 4s and fails with 404 | Use a configurable idle threshold (e.g., **5–10 minutes paused while a game is running on battery**) before `ECO-01` suspends the engine, and ensure `control_playback("play")` and `CHORD-01` auto-wake the suspended engine transparently | Any pause longer than the idle timeout during gameplay |

---

## Security & Sandbox Mistakes

SteamOS / Decky Loader domain-specific security and environment hazards.

| Mistake | Risk | Prevention |
|---------|------|------------|
| **Exporting OAuth / Last.fm tokens in `STATS-01` JSON Profile Backup** | Users share their `deckify-profile.json` in GitHub issues or Discord and compromise their Spotify and Last.fm accounts | Strip all authentication keys (`access_token`, `refresh_token`, `lastfm_session_key`, `listenbrainz_token`, `pkce_verifier`) during JSON export; require explicit allowlist of settings keys |
| **Path traversal in `.lrc` disk cache filenames (`LYRICS-01`)** | Using raw track title/artist as filename (`~/.cache/deckify/lyrics/{title}.lrc`) fails on `/` or `..` in song titles (e.g. *"AC/DC"*, *"..."*) | Always key disk cache files by validated 22-char Base62 Spotify `track_id` or `hashlib.sha256(key).hexdigest()` (matching `_get_cached_lyrics` in `py_modules/spotify.py:168`) |
| **Shell injection via custom EQ/Game profile names or Search queries** | Passing unsanitized strings into subprocess commands | Always pass argument lists (`["pactl", ...]`, never `shell=True`) and validate sink names via `_is_valid_sink_name` (`py_modules/equalizer.py:84`) |

---

## UX Pitfalls

Controller and 10-foot living room UX mistakes on SteamOS GamepadUI.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| ** Handheld font sizes (11px–13px) in 10-Foot Docked TV Mode (`TV-01`)** | Unreadable track titles, lyrics, and queue items from a couch 8–10 feet away on a 4K TV | Scale typography in `TV-01` Split-View (`>= 28px–36px` active lyric line, `>= 24px` track title, `>= 18px` queue items, `64px+` album art thumbnails) with high-contrast focus halos |
| **Auto-activating `TV-01` Split-View while the user is browsing `SettingsTab` or `SearchTab`** | Docking the Deck or a momentary HDMI handshake Reset yanks the user out of the tab they are actively editing | Only auto-activate `TV-01` on dock event if the modal is newly opened or currently on `NowPlayingTab` / `LyricsTab`, and provide an instant 1-button controller toggle (`Y` or header pill) to exit/enter TV View |
| **Deep Artist -> Album -> Track -> Artist drill-down without a Breadcrumb History Stack (`RADIO-01`)** | User drills from *Search* -> *Track* -> *Go to Artist* -> *Album* -> *Track*; pressing `B` dumps them all the way back to the root tab or closes the modal instead of stepping back one level | Replace single-level `activePlaylist` / `activeAlbum` / `activeArtist` booleans in `DeckifyExpandedModal.tsx` with a bounded `navigationStack` (`pushView`, `popView`) so pressing `B` unwinds drill-down steps predictably |
| **Low-contrast dynamic accent colors (`THEME-01`)** | Dark blue or bright white album art makes active buttons, progress bars, or focus halos invisible against `#1C1C1C` backgrounds | Clamp extracted HSL colors in Python/TS to a safe perceptual vibrancy & lightness band (`S: 55%–85%`, `L: 50%–68%`) before applying as UI accents, keeping the white focus ring (`2px solid #fff`) untouched |

---

## "Looks Done But Isn't" Checklist

Critical verification checks for v0.7 phases that pass basic happy-path demos but fail in real Steam Deck usage.

- [ ] **TV-01 (10-Foot TV Mode & Visualizer):** Verify `ps aux | grep -E "parec|pw-cat|pw-record"` returns **zero** processes 1 second after closing the Deckify modal or enabling Eco-Mode (`ECO-01`).
- [ ] **QUEUE-03 & PL-01 (Queue & Playlist Studio):** Verify reordering a duplicate track in a playlist or queue with the D-pad keeps the controller focus halo locked on the moved track and does not jump to the left Sidebar.
- [ ] **CDP-01 (Offline Downloads & Travel Mode):** Verify waking the Steam Deck from suspend while connected to home Wi-Fi does **not** falsely trip Travel Mode during the 4–8s Wi-Fi reconnect window.
- [ ] **DISC-04 & RADIO-01 (Discovery 2.0 & Radio):** Verify clicking *Start Track Radio* and loading *Made For You* succeeds both when `audio_backend == "spotify_client"` (via CDP) **and** when `audio_backend == "librespot"` (via synthesis fallback) under a standard Spotify Dev Mode Client ID.
- [ ] **JAM-01 (Living Room QR Sessions):** Verify the rendered QR code uses high-contrast dark-on-light (`#000000` on `#FFFFFF` quiet zone padding) so phone cameras can scan it across a dimly lit living room from a TV screen.
- [ ] **GAME-01 (Per-Game EQ & Volume Profiles):** Verify launching a game with a `"bass"` EQ override, then exiting the game, restores the user's previous global EQ preset (`"flat"` or `"vocal"`) in `settings.json` and `EqualizerManager`.
- [ ] **TOAST-01 (100% Silent HUD Toasts):** Verify `pactl list sink-inputs` shows **no** new `steamwebhelper` audio burst and zero audible click when a track changes with `toast_sound_enabled: false` and `overlay_enabled: false`.
- [ ] **POD-01 (Podcast Power Suite):** Verify playing a podcast episode at `1.75x` speed and then playing a music track automatically resets playback speed to `1.0x`.
- [ ] **CHORD-01 (Extended Quick-Chords):** Verify holding `STEAM` to open the QAM without pressing a chord button does not leave `guideHeld = true` stuck when returning to the game.
- [ ] **STATS-01 (Listening Stats, Scrobbling & Backup):** Verify scrubbing past 50% of a track with `R2` does **not** record a false scrobble, and exported JSON backups contain **zero** OAuth/Last.fm tokens.
- [ ] **LYRICS-01 (Lyrics 2.0):** Verify nudging per-track sync offset by `+0.5s` in `LyricsTab` immediately updates the in-game `DeckifyOverlay` lyric timing and persists across Deckify restarts.
- [ ] **CONNECT-01 (Connect Hub 2.0):** Verify clicking *"Pull Playback to Steam Deck"* when the local engine is stopped/idle automatically starts the engine, waits for device registration, and transfers playback in a single click.

---

## Recovery Strategies

When pitfalls occur despite prevention, how the system should self-heal.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| **Stuck Per-Game EQ/Volume after game or Steam crash (`GAME-01`)** | LOW | On Deckify startup (`Plugin._main`) and when no game is running (`activeGameAppId === null`), check `settings.get("active_game_override_snapshot")` and automatically restore the pre-game global EQ preset and baseline volume |
| **CDP WebSocket hang or target crash (`CDP-01`, `DISC-04`, `QUEUE-03`)** | LOW | Wrap all `_cdp_evaluate` calls in a strict `timeout=4.0` bound inside `_exec`; on failure or missing target, fall back immediately to Web API / URI-slice mode and surface a non-blocking status badge |
| **Visualizer subprocess orphan (`TV-01`)** | LOW | Track visualizer PID in `/tmp/deckify_visualizer.pid`; kill any stale PID on plugin `_main`, `_unload`, `closeModal`, and `ECO-01` activation |
| **Corrupted JSON Backup import (`STATS-01`)** | LOW | Keep an automatic `.bak` copy (`settings.json.pre_restore`) before applying any JSON import, and provide a 1-click *"Revert Restore"* button if validation fails |
| **Stuck `guideHeld` quick-chord modifier (`CHORD-01`)** | LOW | Auto-expire `guideHeld` after `4000ms` wall-clock timeout and reset on any window blur, QAM toggle, or modal open event |

---

## Pitfall-to-Phase Mapping

How the v0.7 roadmap phases should address and verify each pitfall.

| Pitfall | Related Requirements | Prevention Strategy | Verification Gate |
|---------|----------------------|---------------------|-------------------|
| **Pitfall 1:** Dual-Engine Contention & Silent CDP Fallbacks | `CDP-01`, `DISC-04`, `QUEUE-03`, `POD-01`, `RADIO-01` | Capability matrix per engine; CDP Pathfinder/PlayerAPI when `spotify_client` is active + synthesized REST/URI-slice fallback when `librespot` is active | Unit & integration tests covering both `audio_backend="librespot"` and `audio_backend="spotify_client"` for Discovery, Radio, and Queue actions |
| **Pitfall 2:** Visualizer & Theme CPU/IPC Starvation | `TV-01`, `THEME-01`, `ECO-01` | Modal-scoped capture lifecycle (`<100ms` kill on close), `<=15 Hz` emission cap, CSS `scaleY` transforms, Python-side album art color extraction | Verify subprocess termination on modal close and WCAG contrast ratio clamping on 100% white / 100% black test covers |
| **Pitfall 3:** Four-Way Audio Priority Collision | `GAME-01` | Ephemeral EQ override layer in `EqualizerManager`, local PipeWire volume/ducking target in `VolumeFader`, respect `_sleep_locked` | Test game launch -> game EQ applied -> game exit -> global EQ restored; test crash recovery on `_main` |
| **Pitfall 4:** Steam Toaster Audio Leak vs Gamescope Overlay | `TOAST-01`, `CHORD-01` | Render silent track toasts and quick-chord badges inside `DeckifyOverlay` (`pointerEvents: "none"`), decoupled from `overlay_enabled` HUD card visibility | Verify silent toast renders with `overlay_enabled: false` and `toast_sound_enabled: false` without calling `toaster.toast` |
| **Pitfall 5:** Steam Input Chord Leakage & Guide Button Race | `CHORD-01` | 4-second timestamp expiry on `guideHeld`, reset on QAM/modal focus events, block reserved Valve system chords (`STEAM+X`, `STEAM+R1`, `STEAM+L1`) | Test unbalanced `ButtonDown(13)` without `ButtonUp(13)` expires after 4s and ignores subsequent D-pad presses |
| **Pitfall 6:** D-Pad Focus Loss on Reorder & Drill-Down | `QUEUE-03`, `PL-01`, `RADIO-01` | Stable instance `_rowKey` on list items, controller Grab/Drop reorder mode with batched API commit, breadcrumb `navigationStack` for `B` button back-navigation | Vitest tests verifying focus restoration after reorder and multi-level Artist -> Album -> Track -> Back unwinding |
| **Pitfall 7:** Offline Disk Exhaustion & Wake Travel Mode | `CDP-01` | `os.statvfs` 3.0 GB minimum free-space guardrail before/during downloads; delay Travel Mode auto-activation past `RECOVERY_COOLDOWN_S` (10s) on wake | Unit test `statvfs` low-disk refusal and suspend/resume grace window suppression |
| **Pitfall 8:** Romanization C-Extension Bloat & Offset Drift | `LYRICS-01` | Pure-Python / pure-TS Hangul/Kana/Pinyin romanization (zero `.so` binaries), immutable `.lrc` disk cache + separate `track_lyrics_offsets` map with live HUD broadcast | Test romanization with `LD_LIBRARY_PATH` stripped; verify `+0.5s` nudge updates both `LyricsTab` and `DeckifyOverlay` |
| **Pitfall 9:** Seek-Fooled Scrobbles & Token Leak in Backup | `STATS-01` | Monotonic wall-clock `accumulated_play_ms` tracker (immune to `L2/R2` seeking), separate `stats.json`, secret redaction + schema validation on JSON backup/restore | Test seeking from `0:02` to `2:30` does not scrobble; test JSON export excludes all tokens |
| **Pitfall 10:** Podcast Speed & Crossfade State Leaking to Music | `POD-01`, `RADIO-01` | Auto-reset speed to `1.0x` when transitioning from `episode` to `track`; wire crossfade to Spotify Client `prefs`/CDP and local fader envelope | Test playing episode at `1.5x` -> playing track resets speed to `1.0x` |

---

## Sources

- **Deckify Production Codebase Analysis (`v0.6`):**
  - `main.py` (Single-active-engine invariant between `librespot` and `com.spotify.Client` on virtual `kwin_wayland` display, `LD_LIBRARY_PATH` stripping, lifecycle management)
  - `py_modules/engine.py` (CDP raw WebSocket client on port `9229`, React Fiber Platform Registry traversal for `LibraryAPI` and `PlaylistAPI`, `resolve_spotify_sink_input_ids` allowlist/deny-list guardrails)
  - `py_modules/equalizer.py` & `py_modules/volume.py` (`EqualizerManager` isolated `pipewire -c` filter-chain, `VolumeFader` 50ms cosine easing and `_sleep_locked` priority lock)
  - `py_modules/soundtrack.py` & `py_modules/dock.py` (`SoundtrackManager` launch/exit debounce & pre-game snapshot, `DockAudioSwitcher` `pactl subscribe` hotplug monitor)
  - `py_modules/resilience.py` (`--onevent` `AF_UNIX` push server, `WIFI_GRACE_WINDOW_S = 4.0`, `RECOVERY_COOLDOWN_S = 10.0`, `SessionBookmarkManager`)
  - `src/index.tsx` & `src/components/DeckifyOverlay.tsx` (`FocusNavController` gamepad chord listener, `toaster.toast` track change handler, discrete `setTimeout` Gamescope HUD lyric scheduler)
- **External Platform & Ecosystem References:**
  - Spotify Web API Changes (Nov 2024 Development Mode restrictions on `/v1/recommendations`, `/v1/browse/*`, and Spotify-owned algorithmic playlists `37i9dQZF1...`)
  - Last.fm Audioscrobbler 2.0 & ListenBrainz Submission Guidelines (accumulated listening duration rules: track `>= 30s`, played `>= 50%` or `>= 240s` wall-clock time)
  - SteamOS 3.5+ / Gamescope / Decky Loader CEF environment constraints (CSP external image block, `steamwebhelper` PipeWire stream isolation, Valve Steam Input reserved system chords)

---
*Pitfalls research for: Deckify Milestone v0.7 (Studio, Living Room TV, Offline Travel & Ultimate Immersion)*
*Researched: 2026-11-18*
