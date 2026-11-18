# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v0.5 — In-Game Flow & Music Discovery

**Shipped:** 2026-11-15
**Phases:** 8 (Phases 6–12, including 11.1) | **Plans:** 22 | **Tasks:** 51

### What Was Built
- **Smooth Audio Ducking Engine & Voice Awareness (Phase 6, 11.1, 12):** Local PipeWire `VolumeFader` with cosine easing, `VoiceActivityDetector` with silence hold hysteresis, custom attenuation/fade/hold `SliderField`s, and QAM `DUCKED` badge.
- **Game-Specific Soundtracks (Phase 7, 12):** VDF parser with unsigned 32-bit CRC32 AppID normalization, `SoundtrackManager` with 3.5s launch / 3.0s exit debounce, pre-game state snapshot & restore, `SoundtracksTab` + `PlaylistPickerModal`, and Non-Steam local grid cover base64 proxying.
- **Controller L2/R2 Ergonomics & Trigger Navigation (Phase 8, 11.1, 12):** Modal-scoped `TriggerController` with 0.75/0.25 Schmidt hysteresis, 600ms accumulated ±10s playback seeking, DOM-queried ±15 / A–Z library fast-paging across all 9 list tabs, and virtual GamepadUI focus detection.
- **QAM Pinned Playlists & Quick In-Game Switch (Phase 9, 12):** Non-evicting 4-item pinned playlist persistence, engine-waking `quick_play_pinned` RPC, and focus-tracked `PinnedPill` strip in Steam QAM.
- **In-Game HUD Overlay 2.0 (Phase 10, 12):** Discrete `setTimeout` event-scheduled synced lyrics row in Gamescope HUD, configurable auto-hide duration (3–15s) & lyrics latency offset (-2000..+2000ms), `autoHide === false` pause-flicker guard, and 48x48 base64 notification cover + toast sound toggle.
- **Home & Discovery Hub Tab (Phase 11):** Controller-first `DiscoveryTab` with Top Tracks, Top Artists, Made For You, and New Releases, backed by TTL-cached `get_discovery_feed` and a global HTTP 429 exponential-backoff circuit breaker.
- **Codebase & Planning Hygiene (Phase 12):** Resolved all 20 pending todos, archived 3 debug sessions, hardened `play_tracks` 404 librespot auto-wake, and unified Sidebar/NowPlaying/Podcasts/Recent UX.

### What Worked
- **100% local PipeWire volume control:** Avoiding Spotify Web API volume stepping eliminated rate-limit risk and network latency for audio ducking.
- **DOM-queried uniform fast-paging:** Querying `[data-deckify-list-item="true"]` inside `contentPaneRef` let all 9 list tabs share one scroll+focus mechanism without per-tab rewrites.
- **Pre-commit verification gate:** Running `tsc --noEmit` and Vitest on every commit caught regressions immediately.
- **Dedicated tech-debt & todo closure phases (11.1, 12):** Sweeping cross-phase integration gaps and open todos before milestone close kept the final audit 100% clean.

### What Was Inefficient
- **UAT gap closures needed across Phases 7, 8, 9, 10:** SteamOS GamepadUI focus quirks (`document.activeElement` staying on `document.body`, `SliderField` B-button bubble-phase cancel, Steam CEF CSP image rules) required follow-up gap-closure plans after initial on-device testing.
- **ROADMAP.md heading drift:** Appended phases (11.1, 12) landed under the Backlog section instead of the active milestone section, requiring manual reorganization before `milestone.complete` could parse the v0.5 window.

### Patterns Established
- **Modal-scoped controller input:** Always scope `FocusNavController` and trigger listeners to open modals and suppress them when child modals (`PlaylistPickerModal`, `TrackActionModal`) open.
- **Steam CEF CSP compliance:** All external artwork (Spotify CDN, Steam CDN, Non-Steam local grids) must be proxied/cached as base64 data URIs via `DeckifyImage` / `get_image`.
- **Optimistic UI + `settings_changed` sync:** Merge partial `get_status()` payloads non-destructively and sync `SettingsTab` via `localSettings` + `settings_changed` events to prevent QAM snap-back.

### Key Lessons
1. Test GamepadUI virtual focus (`.gpfocus` / `vgp_onbuttondown`) early on real Steam Deck hardware, as desktop browser focus behavior (`document.activeElement`) differs significantly.
2. Keep `ROADMAP.md` milestone phase headings and inserted/added phases strictly inside the active milestone section so automated archival tools can slice the milestone cleanly.
3. Discrete `setTimeout` scheduling for HUD lyrics preserves 60/90 FPS without continuous React re-renders.

### Cost Observations
- Timeline: 3 days (2026-11-12 → 2026-11-15), 163 commits, 250 files changed (+34,450 / -1,142 lines)
- Notable: High velocity (~6–12 min average per plan) with 152 Vitest tests and 458 Python `unittest` tests passing at milestone close.

---

## Milestone: v0.6 — Audio DSP, Docked Flow & System Resilience

**Shipped:** 2026-11-18
**Phases:** 7 (Phases 13–18.1) | **Plans:** 14 | **Tasks:** 26

### What Was Built
- **Spotify Library 403 Fix & Sink-Input Guardrails (Phase 13):** Migrated `toggle_like_track` and `check_tracks_liked` to `/v1/me/library` and 40-URI `/v1/me/library/contains` with CDP `LibraryAPI` 403 fallback, and centralized `resolve_spotify_sink_input_ids()` with `steamwebhelper`/`Chromium` deny-list + allowlist routing.
- **Gentle Sleep Timer Fade-Out (Phase 14):** Priority-locked `"sleep"` fade-out in `VolumeFader` with configurable 5–120s ramp-down, 1.2s PipeWire drain, baseline restoration, and deterministic mid-fade cancellation.
- **Real PipeWire Biquad Equalizer (Phase 15):** Isolated `pipewire -c` 10-band ISO `filter-chain` DSP (`EqualizerManager`) with 7 presets, `flat` true bypass, `~75ms` `pw-cli` coalescing, automatic negative preamp headroom, and `SettingsTab` 10-band sliders.
- **Automatic Docked Audio-Switching (Phases 16, 18.1):** `DockAudioSwitcher` (`pactl subscribe` + 1.8s debounce, USB-DAC > HDMI priority, Bluetooth/manual-override precedence, `bit_perfect_clock` management with lossless handheld preservation on undock).
- **Event-Driven `librespot` & Suspend/Wi-Fi Resilience (Phase 17):** `<5ms` `--onevent` `AF_UNIX` push server, 400ms debounced Web API enrichment, 20s/3s adaptive polling, and unified wake-lock `SessionBookmarkManager` with 4s Wi-Fi grace window.
- **MPRIS2 D-Bus Bridge (Phase 18):** Pure-Python stdlib D-Bus wire-protocol `MprisBridge` (`org.mpris.MediaPlayer2.deckify`) under UID 1000 with BlueZ `mpris-proxy` supervision and Bluetooth headset AVRCP controls/metadata.

### What Worked
- **Stream-isolated PipeWire child process:** Running `pipewire -c` as an isolated child process for the 10-band biquad EQ avoided restarting system PipeWire and kept game/Steam UI audio uninterrupted.
- **Pure-Python D-Bus & POSIX shell `--onevent`:** Zero C-extension dependencies avoided Decky Loader `LD_LIBRARY_PATH` conflicts, and the `<5ms` POSIX `sh` emitter prevented blocking `librespot`'s audio loop.
- **Post-milestone tech-debt phase (18.1) & re-verification:** Catching the undock `bit_perfect_clock` reset, `SLEEP-01` frontmatter omission, and Nyquist validation drafts before close kept the final milestone closeout 100% verified.

### What Was Inefficient
- **Shared-file staleness across sequential phases:** Later phases modifying shared files (`main.py`, `py_modules/common.py`, `SettingsTab.tsx`) caused earlier phases' `VERIFICATION.md` fingerprints to go stale, requiring a dedicated re-verification pass at milestone close.
- **Inserted phase placement in ROADMAP.md:** Appended/inserted Phase 18.1 landed under `## Backlog & Future Milestones`, requiring manual cleanup during roadmap reorganization.

### Patterns Established
- **Centralized PipeWire sink-input resolution:** All stream moves and volume faders route through `resolve_spotify_sink_input_ids` with explicit `steamwebhelper`/`Chromium` deny-listing.
- **Single-lock wake recovery:** Consolidate suspend (`PrepareForSleep`), process monitor, and Wi-Fi drop recovery behind one `asyncio.Lock` and cooldown to prevent dual-restart races.
- **Event-driven UI sync:** Push `librespot_event`, `dock_audio_switched`, and `mpris_status` updates to the frontend while relaxing background Web API polling.

### Key Lessons
1. Always guard undock/restore paths against user-configured handheld preferences (e.g., preserving `bit_perfect_clock` when `audio_quality == "lossless"`).
2. Re-verify or batch-refresh `VERIFICATION.md` fingerprints after shared-file edits in multi-phase milestones so `init.manager` reports clean readiness at closeout.
3. Never use C-extension bindings (`dbus-python`, `PyGObject`) in Decky Loader plugins; pure-Python stdlib protocols under UID 1000 are portable and conflict-free.

### Cost Observations
- Timeline: 3 days (2026-11-16 → 2026-11-18), 128 files changed (+24,046 / -1,380 lines since `v0.5`)
- Notable: Zero regressions at closeout with 547 Python `unittest` tests and 175 Vitest tests passing.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v0.4 | 5 | 7 | Modularized monoliths & stabilized core playback/HUD |
| v0.5 | 8 | 22 | Added automated milestone audit, Nyquist validation, and dedicated tech-debt/todo closure phases (11.1, 12) |
| v0.6 | 7 | 14 | Stream-isolated PipeWire DSP/docking, pure-Python D-Bus MPRIS2, `--onevent` push resilience, and 100% Nyquist compliance |

### Cumulative Quality

| Milestone | Vitest Tests | Python Tests | Codebase LOC |
|-----------|--------------|--------------|--------------|
| v0.4 | 55 | 325 | — |
| v0.5 | 152 (16 files) | 458 | 13,995 TS + 5,776 Python |
| v0.6 | 175 (16 files) | 547 | 17,581 TS + 11,028 Python |

### Top Lessons (Verified Across Milestones)

1. SteamOS GamepadUI CEF enforces strict CSP and virtual focus semantics — always proxy images to base64 and verify controller focus paths explicitly.
2. Keep Spotify Web API polling strictly bounded with TTL caches and 429 circuit breakers; offload real-time controls (ducking, clock interpolation, HUD lyrics) to local PipeWire and discrete timers.
