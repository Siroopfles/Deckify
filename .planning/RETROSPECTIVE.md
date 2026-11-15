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

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v0.4 | 5 | 7 | Modularized monoliths & stabilized core playback/HUD |
| v0.5 | 8 | 22 | Added automated milestone audit, Nyquist validation, and dedicated tech-debt/todo closure phases (11.1, 12) |

### Cumulative Quality

| Milestone | Vitest Tests | Python Tests | Codebase LOC |
|-----------|--------------|--------------|--------------|
| v0.4 | 55 | 325 | — |
| v0.5 | 152 (16 files) | 458 | 13,995 TS + 5,776 Python |

### Top Lessons (Verified Across Milestones)

1. SteamOS GamepadUI CEF enforces strict CSP and virtual focus semantics — always proxy images to base64 and verify controller focus paths explicitly.
2. Keep Spotify Web API polling strictly bounded with TTL caches and 429 circuit breakers; offload real-time controls (ducking, clock interpolation, HUD lyrics) to local PipeWire and discrete timers.
