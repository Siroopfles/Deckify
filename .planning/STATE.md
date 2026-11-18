---
gsd_state_version: "1.0"
milestone: v0.6
milestone_name: Audio DSP, Docked Flow & System Resilience (Active)
current_phase: 18
current_phase_name: MPRIS2 D-Bus Bridge
status: executing
stopped_at: Phase 18 context gathered
last_updated: "2026-11-18T06:15:01.593Z"
last_activity: 2026-11-17
last_activity_desc: Phase 17 complete, transitioned to Phase 18
state_head: 62774eb9504fa43307a5d7ed2c713d08dcd0eabe
progress:
  total_phases: 6
  completed_phases: 5
  total_plans: 12
  completed_plans: 10
  percent: 83
---

# Project State

## Project Reference

See: [.planning/PROJECT.md](file:///C:/Users/djdje/Deckify/.planning/PROJECT.md) (updated 2026-11-16)

**Core value:** Rock-solid Spotify playback and responsive, reliable controller navigation on Steam Deck without UI lag, broken images, or desynchronized playback states.
**Current focus:** Phase 17 — Event-Driven librespot & Suspend/Wi-Fi Resilience

## Current Position

Phase: 18 (MPRIS2 D-Bus Bridge) — READY TO EXECUTE
Plan: Not started
Status: Ready to execute
Last activity: 2026-11-17 — Phase 17 complete, transitioned to Phase 18


## Performance Metrics

**Velocity:**
- Total plans completed: 39 (7 in v0.4, 22 in v0.5)
- Average duration: ~14.7 min
- Total execution time: ~2.2 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1-5 (v0.4) | 7 | 108m | 15.4m |
| 06 | 2 | - | - |
| 07 | 3 | - | - |
| 8 | 5 | - | - |
| 9 | 3 | - | - |
| 10 | 3 | - | - |
| 11 | 2 | - | - |
| 11.1 | 1 | - | - |
| 12 | 3 | - | - |
| 13 | 2 | - | - |
| 16 | 2 | - | - |
| 14 | 2 | - | - |
| 15 | 2 | - | - |
| 17 | 2 | - | - |

**Recent Trend:**
- Last 5 plans: 18m, 14m, 16m, 14m, 12m
- Trend: Stable

*Updated after each plan completion*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 07 P01 | 12min | 4 tasks | 7 files |
| Phase 07 P02 | 10min | 4 tasks | 10 files |
| Phase 07 P03 | 7min | 3 tasks | 13 files |
| Phase 08 P01 | 6min | 2 tasks | 7 files |
| Phase 08 P08-02 | 4min | 2 tasks | 8 files |
| Phase 08 P08-03 | 5min | 3 tasks | 13 files |
| Phase 08 P08-04 | 6min | 3 tasks | 6 files |
| Phase 08 P08-05 | 3min | 2 tasks | 4 files |
| Phase 09 P01 | 12min | 3 tasks | 7 files |
| Phase 09 P02 | 6min | 3 tasks | 6 files |
| Phase 09 P03 | ~6min | 2 tasks | 4 files |
| Phase 10 P01 | 9min | 3 tasks | 9 files |
| Phase 10 P02 | 7min | 3 tasks | 7 files |
| Phase 10 P03 | 5min | 2 tasks | 6 files |
| Phase 11 P01 | 5min | 2 tasks | 5 files |
| Phase 11 P02 | 8min | 2 tasks | 7 files |
| Phase 11.1 P01 | 7min | 3 tasks | 11 files |
| Phase 12 P01 | 8min | 3 tasks | 18 files |
| Phase 12 P02 | 6min | 3 tasks | 12 files |
| Phase 12 P03 | 9min | 3 tasks | 14 files |
| Phase 13 P01 | 3min | 2 tasks | 6 files |
| Phase 13 P02 | 3min | 2 tasks | 4 files |
| Phase 16 P01 | 7 min | 3 tasks | 5 files |
| Phase 16 P02 | 4 min | 2 tasks | 4 files |
| Phase 17 P01 | 21min | 2 tasks | 5 files |
| Phase 17 P02 | 14min | 2 tasks | 6 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v0.4 Phase 1]: Decoupled monoliths into `src/components/tabs/` and `py_modules/` submodules.
- [v0.4 Phase 2]: Concurrency-throttled base64 image queue with LRU cache bypassing Steam CEF CSP.
- [v0.4 Phase 3]: Monotonic clock ticker (`usePlaybackClock`) with drift gating and post-seek suppression.
- [v0.4 Phase 4]: Sliced URIs sequence for queue selection with optimistic state sync.
- [v0.4 Phase 5]: In-game HUD overlay with `pointerEvents: "none"` and discrete event polling.
- [v0.5 Roadmap]: Audio ducking must be 100% local via PipeWire `pactl set-sink-input-volume` (never Spotify Web API).
- [Phase 06]: Local PipeWire cosine volume fader with 50ms slices and single sink-input resolution.
- [Phase 06]: 3.0s exit debounce in Steam GamepadUI to eliminate child-launcher flapping.
- [Phase 06]: QAM volume slider displays elevated green DUCKED badge and live effective volume.
- [Phase 06]: VoiceActivityDetector monitors pactl source-outputs with 1.2s silence hold hysteresis window.
- [Phase 06]: Interactive Smooth Audio Ducking Engine card in SettingsTab with attenuation mode and duration pills.
- [Phase 07]: SoundtracksTab debounces profile saves by 500ms and PlaylistPickerModal debounces Spotify search by 300ms
- [Phase 08]: useTriggerNavigation uses refs for callbacks/suppression so FocusNavController and rAF bind once on modal mount and clean up strictly on unmount
- [Phase 08]: Captured seekBaseMsRef from currentPositionMsRef on the first pull of a 250ms L2/R2 burst to accumulate seeks without stale closures or D-pad focus shifts
- [Phase 08]: Computed list jumps directly from DOM-queried [data-deckify-list-item='true'] rows inside contentPaneRef so all 9 list tabs share one uniform scroll+focus mechanism
- [Phase 08]: Wrapped right-hand Focusable in native div contentPaneRef, set SEEK_ACCUMULATION_WINDOW_MS=600, transferred/restored TrackActionModal focus, and surfaced 403 Forbidden Like errors
- [Phase 08]: Exposed data-deckify-focused and default tabIndex=0 on InteractiveRow, and added virtual GamepadUI focus fallback in DeckifyExpandedModal onTrigger
- [Phase 09]: Replaced Bind current music to game DialogButton borderColor override with @decky/ui ButtonItem for native controller focus highlight
- [Phase 09]: Grouped secondary QAM controls behind collapsible Controls & Settings toggle when playing, while keeping Open Deckify and Engine toggle directly visible when stopped
- [Phase 09]: Enforced non-evicting 4-item pinned playlists limit in handleTogglePin with Decky toaster feedback and explicit CollectionActionModal label
- [Phase 09]: Hardened PlaylistsTab detail header flex layout (minWidth: 0, flexShrink: 0) while keeping Enable Mix gated to spotify_client, and replaced QAM DialogButton pills with focus-tracked PinnedPill using focusHalo
- [Phase 10]: Updated posAnchorRef in a dedicated useEffect prior to the lyric scheduler useEffect so changing lyricsOffsetMs preserves elapsed wall-clock time
- [Phase 10]: Guarded DeckifyOverlayWrapper get_lyrics responses against stale async overwrites using currentTrackKeyRef
- [Phase 10]: Kept QAM compact without duration or latency SliderFields, exposing only Overlay Lyrics ToggleField and dynamic Auto-Hide duration label
- [Phase 10]: Wrapped handleNextLyricsSource modulo 5 alongside direct LYRICS_SOURCES pill selection in LyricsTab
- [Phase 11]: Replaced blocking time.sleep in _spotify_api_request with fast-fail SpotifyRateLimitError circuit breaker (5s base, 300s cap)
- [Phase 11]: Section-isolated 1h TTL for top_tracks/top_artists per time_range and 4h TTL for made_for_you and new_releases with 403/404 fallbacks
- [Phase 11]: Guarded idle default-tab transition with setMode((prev) => (prev === 'now_playing' ? 'discovery' : prev)) so explicit tab switches are never overridden
- [Phase 12]: Wake stopped librespot inside play_tracks 404 handler after _auto_transfer_and_play fails, preserving single-call behavior when external devices are active
- [Phase 12]: Used existing fetchWithQueueAndCache/imgMemoryCache (get_image RPC) for track_metadata toast cover proxying
- [Phase 13]: D-05/D-06: Centralized sink-input resolution in resolve_spotify_sink_input_ids with steamwebhelper/Chromium deny-list, allowlist fallback, and 0-match debug no-op in _set_pactl_sink_input
- [Phase 16]: Imported py_modules.volume at module level in dock.py while keeping volume.get_audio_sinks lazy-import of dock to avoid circular imports and preserve sys.modules test patching
- [Phase 16]: Checked both event payload toast_enabled and dockToastEnabledRef.current in src/index.tsx so dock_audio_switched toasts respect user preference immediately.
- [Phase 16]: Rendered the Docked Audio-Switching card unconditionally adjacent to Audio Output Sink (PipeWire) so users can configure hotplug monitoring before connecting a dock or DAC.
- [Phase 17]: Generated a <5ms POSIX /bin/sh --onevent emitter in DECKY_PLUGIN_RUNTIME_DIR writing KEY=VALUE pairs in background to AF_UNIX socket with 400ms debounced Web API enrichment and 20s/3s adaptive polling
- [Phase 17]: Serialized SuspendResumeMonitor._on_deck_resume, _monitor_process SUSPEND_THRESHOLD, and 4s buffer-aware Wi-Fi drop recovery behind a single asyncio.Lock and 10s cooldown in SessionBookmarkManager
- [Phase 17]: Wired immediate librespot_event and track_metadata push updates into usePlaybackStatus and QuickAccessMenu with conditional held-bookmark restore CTA and SettingsTab Playback Resilience card

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

### Roadmap Evolution

- Phase 11.1 inserted after Phase 11: Address tech debt: v0.5 integration & metadata cleanup (URGENT)
- Phase 12 added: Resolve open todos & polish
- Phases 13–18 added: v0.6 Audio DSP, Docked Flow & System Resilience

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| Audio DSP | EQ-01: Parametric 10-band PipeWire DSP biquad equalizer filter chain | Active in v0.6 (Phase 15) | 2026-11-12 | v0.5 |
| Native Client | CDP-01: Spotify CDP offline downloads | Deferred | 2026-11-12 | v0.5 |
| Queue API | QUEUE-03: Interactive queue reordering/clearing via CDP | Deferred | 2026-11-12 | v0.5 |
| Audio Hardware | DOCK-01: Auto audio sink switching to external USB-DAC/HDMI dock | Active in v0.6 (Phase 16) | 2026-11-12 | v0.5 |

## Session Continuity

Last session: 2026-11-17T20:03:58.898Z
Stopped at: Phase 18 context gathered
Resume file: .planning/phases/18-mpris2-d-bus-bridge/18-CONTEXT.md

## Operator Next Steps

- Plan Phase 13 with `/gsd-plan-phase 13`
