# Milestones

## v0.6 Audio DSP, Docked Flow & System Resilience (Shipped: 2026-11-18)

**Phases completed:** 7 phases, 14 plans, 26 tasks

**Key accomplishments:**
- Migrated `toggle_like_track` and `check_tracks_liked` from deprecated `/v1/me/tracks` endpoints to `/v1/me/library` and `/v1/me/library/contains` (40-URI batching), with Official Spotify Client CDP `LibraryAPI` 403 fallbacks for `toggle_like_track` and `get_liked_tracks`.
- Centralized PipeWire/PulseAudio sink-input resolution into `resolve_spotify_sink_input_ids()` in `py_modules/engine.py` with strict `steamwebhelper`/`Chromium` deny-list + Spotify/Deckify allowlist filtering, and wired both `_set_pactl_sink_input()` and `VolumeFader.resolve_sink_input_id()` to use it.
- Implemented `"sleep"` priority locking in `VolumeFader` and orchestrated early fade-out, pause, 1.2s PipeWire drain, baseline restoration, and deterministic mid-fade cancellation in `sleep_timer_worker`.
- Persisted, sanitized, and exposed `sleep_timer_fade_enabled` and `sleep_timer_fade_duration` (`5–120s`, default `30s`) in the backend, and added the Gentle Fade Out toggle, duration slider, and live `"Fading out..."` status indicator to `SettingsTab`.
- Real-time 10-band ISO PipeWire `filter-chain` biquad equalizer backend (`EqualizerManager`) with automatic negative preamp headroom, `flat` true bypass, `~75ms` `pw-cli` coalescing, `500ms` settings debounce, and stream-isolated sink routing.
- 7-preset (`Flat`..`Custom`) and always-visible 10-band ISO (`31 Hz`–`16 kHz`, `±12 dB`, `0.5 dB` step) graphic equalizer UI in `SettingsTab.tsx` with GamepadUI `flow-children="horizontal"` pill rows, `Bypass`/`Preamp` headroom indicator, and immediate preset-to-custom auto-fork.
- Backend `DockAudioSwitcher` PipeWire hotplug monitor with 1.8s debounce, USB-DAC > HDMI priority, Bluetooth & manual-override precedence, EQ-isolated routing, and `bit_perfect_clock` restoration
- TypeScript `DockStatusInfo` contracts, global `dock_audio_switched` Decky toast listener in `src/index.tsx`, and `"Docked Audio-Switching"` configuration card in `SettingsTab.tsx` with 5 Vitest unit tests
- Event-driven `librespot --onevent` AF_UNIX socket server with `<5ms` POSIX `sh` emitter, Base16→Base62 ID normalization, 400ms debounced Web API enrichment, adaptive 20s/3s polling, and unified suspend/Wi-Fi session bookmark resilience.
- Instantaneous `librespot --onevent` push state synchronization in `usePlaybackStatus` and `QuickAccessMenu`, conditional QAM held-bookmark restore CTA, and a full "Playback Resilience" configuration card in `SettingsTab.tsx`.
- Pure-Python MPRIS2 D-Bus bridge (`org.mpris.MediaPlayer2.deckify`) with local `file://` cover art resolution, `VolumeFader`-safe property writes, diff-gated `PropertiesChanged` / `Seeked` signals, and UID 1000 `mpris-proxy` supervision
- Bluetooth & Media Controls (MPRIS2) settings card in `SettingsTab.tsx` with live `mpris_status` badge, `mpris_enabled` / conditional `mpris_auto_proxy` toggles, TypeScript interfaces, and Vitest unit tests
- Guarded `DockAudioSwitcher._restore_pre_dock()` to preserve `bit_perfect_clock` on undock when `audio_quality == "lossless"` and `bit_perfect_clock` is enabled, added 4 unit tests, and closed the `SLEEP-01` frontmatter gap in Phase 14 summaries.
- Promoted `14-VALIDATION.md` through `18-VALIDATION.md` from `draft` to `complete` (`nyquist_compliant: true`, `wave_0_complete: true`) backed by observed passes across all 547 Python unit tests, 175 Vitest tests, TypeScript typecheck, and ESLint.

---

## v0.5 In-Game Flow & Music Discovery (Shipped: 2026-11-15)

**Phases completed:** 8 phases, 22 plans, 51 tasks

**Key accomplishments:**
- Game-specific Soundtracks UI (`SoundtracksTab` + `PlaylistPickerModal`), QAM 1-click music binding, and `RegisterForAppLifetimeNotifications` lifecycle dispatch with full Vitest and Python E2E verification
- Closed all 4 Phase 07 UAT gaps: Steam CDN image proxying with User-Agent + FaGamepad fallback, `showModal()` PlaylistPickerModal with offset=0 and playlist URIs, bubble-phase `vgp_oncancel` for SliderField B-button exit, and `SteamClient.GameSessions` + `Router.MainRunningApp` startup seeding.
- Modal-scoped `TriggerController` (0.75/0.25 Schmidt hysteresis, 300ms debounce, 500ms/300ms hold-to-repeat), `useTriggerNavigation` hook with deduped `FocusNavController` + `vgp_onbuttondown` Y/X/L2/R2 dispatch, and pinned `Back to Steam (B)` Sidebar footer
- 250ms accumulated L2/R2 playback seeking with `[0, duration_ms - 1000]` clamping, seek error toast, floating delta pill, context-aware controller hint bar, and `Controller & Trigger Navigation` settings card
- `computeListJump` (±N items and A–Z anchors), `contentPaneRef` focus-guarded scroll+focus transfer, `onLoadMore` pagination, floating position pill, and list row tagging across all 9 library/list tabs
- Closed all 3 Phase 8 UAT gaps: native `div` `contentPaneRef` wrapper for library list fast-paging, 600ms seek accumulation window across consecutive trigger pulls, `TrackActionModal` focus transfer/restoration, and actionable Spotify 403 Forbidden Like error feedback.
- Virtual GamepadUI focus detection (`[data-deckify-focused="true"]`, `.gpfocus`) and default `tabIndex={0}` on `InteractiveRow` so L2/R2 library fast-paging jumps and focuses rows when `document.activeElement` stays on `document.body`.
- End-to-end QAM pinned playlist persistence (max 4), engine-waking `quick_play_pinned` RPC, horizontal DeckifyImage pill strip with optimistic rollback, reorganized QAM layout, and Bind button focus fix
- Controller-friendly `CollectionActionModal` (`Y` menu) and detail-header `FaThumbtack` Pin/Unpin toggles across `PlaylistsTab`, `AlbumsTab`, and `LikedSongsTab` with row badges and non-evicting 4-item limit feedback
- Flex-hardened `PlaylistsTab` detail header with single-line ellipsis truncation and focus-tracked `PinnedPill` QAM pills using `Focusable noFocusRing` + `focusHalo` inside a `4px 4px` padded scroll strip.
- Discrete `setTimeout` synced lyrics engine in `DeckifyOverlay` with 18px fixed-height cross-fade row, `/deckify` modal suppression, gated `get_lyrics` RPCs, and clamped backend settings
- QAM `Overlay Lyrics` toggle, `SettingsTab` Auto-Hide Duration (3–15s) and Lyrics Latency Offset (-2000..2000ms) sliders, and 5 clickable `LyricsTab` source pills wired to `DeckifyExpandedModal`
- Exposed Phase 10 and Phase 08 public settings in `main.py:get_status()`, added non-destructive settings merging in `DeckifyOverlayWrapper`, and wired optimistic `localSettings` + `settings_changed` synchronization in `SettingsTab` to eliminate QAM snap-back and frozen settings controls.
- Hardened Spotify Web API client with a global thread-safe HTTP 429 exponential-backoff circuit breaker, OAuth scope v7 (`user-top-read`), and section-isolated 1h/4h TTL-cached `get_discovery_feed` RPC with Dev Mode 403/404 and stale-cache fallbacks.
- Implemented the controller-first Discovery hub tab (`DiscoveryTab.tsx`), registered `"discovery"` in `Sidebar.tsx` and `src/types.ts`, wired idle default-tab landing and `A`/`Y` actions in `DeckifyExpandedModal.tsx`, and verified all 403/429/empty states across 143 Vitest tests, 452 Python tests, typecheck, lint, and Rollup build.
- Gated game-exit ducking on `running` to preserve the 3000ms exit debounce, suppressed `L1`/`R1`/`X`/`Y` alongside `L2`/`R2` during `PlaylistPickerModal`, and cleaned Phase 06/07 audit metadata
- Fixed followed playlist `/playlists/{pid}` track parsing, `Enable Mix` ID fallback, `play_tracks` 404 librespot auto-wake with offset support, and `PlaylistsTab` context playback, and archived 3 debug sessions + 9 todos.
- Implemented configurable track-change toast sound & 48x48 base64 cover crop, hardened HUD `autoHide === false` against pause flickers, converted ducking attenuation and fade/hold durations to `SliderField`s, and added base64 local Steam grid cover resolution for Non-Steam games.
- Wired focusable Sidebar Now Playing actions across all tabs, unified Sidebar Back-to-Steam spatial navigation, added NowPlayingTab quick Add to Playlist, hardened PodcastsTab/get_saved_episodes metadata rendering, and added discrete track-change refresh for RecentTab.

---

## v0.4: Stability, Polish & Refactoring

**Shipped:** 2026-11-12  
**Phases:** 1-5 (5 phases, 7 plans)  
**Verification:** 100% verified (5/5 phases passed, 11/11 requirements satisfied)  
**Git Tag:** `v0.4`  

### Key Accomplishments
1. **Architecture & Monolith Decoupling (Phase 1):** Decomposed monolithic `DeckifyExpandedModal.tsx` (~2,959 LOC) into 12 standalone tab components under `src/components/tabs/` and reusable UI components under `src/components/common/`; decoupled monolithic `main.py` (~2,600 LOC) into focused backend modules under `py_modules/`.
2. **Artwork & Image Pipeline Stabilization (Phase 2):** Solved Steam CEF CSP blocking and RPC starvation via multi-host Spotify CDN proxying, a 4-worker concurrent fetch queue, a 200-item LRU cache, and graceful fallback rendering.
3. **Live Playback Ticker & Gamepad Seekbar Scrubbing (Phase 3):** Built `usePlaybackClock` with 250ms monotonic time interpolation and 1200ms drift gating; enabled D-pad gamepad seekbar scrubbing with focus halo, 300ms debounce, and 1500ms post-seek suppression.
4. **Queue Navigation & Live State Synchronization (Phase 4):** Fixed queue song selection to play exact clicked tracks via sliced URI sequences; added dedicated top Now Playing card, 40-item rendering cap, and 600ms delayed background resynchronization.
5. **In-Game HUD Overlay Restoration (Phase 5):** Restored floating overlay in Gamescope with strict `pointerEvents: "none"`, 4-corner positioning, direct QAM controls, 6-second auto-hide, 3.5-second pause grace, and subtle 2px progress bar.

### Detailed Archives
- Roadmap Archive: [.planning/milestones/v0.4-ROADMAP.md](file:///C:/Users/djdje/Deckify/.planning/milestones/v0.4-ROADMAP.md)
- Requirements Archive: [.planning/milestones/v0.4-REQUIREMENTS.md](file:///C:/Users/djdje/Deckify/.planning/milestones/v0.4-REQUIREMENTS.md)
- Audit Report: [.planning/milestones/v0.4-MILESTONE-AUDIT.md](file:///C:/Users/djdje/Deckify/.planning/milestones/v0.4-MILESTONE-AUDIT.md)
