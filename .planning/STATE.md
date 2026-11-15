---
gsd_state_version: "1.0"
milestone: v0.5
milestone_name: In-Game Flow & Music Discovery
status: Awaiting next milestone
stopped_at: Phase 12 complete — all phases complete
last_updated: "2026-11-15T20:42:54.009Z"
last_activity: 2026-11-15
last_activity_desc: Milestone v0.5 completed and archived
state_head: beb25f756d54713f8633c55c4804be8025266c36
progress:
  total_phases: 8
  completed_phases: 8
  total_plans: 22
  completed_plans: 22
  percent: 100
current_phase: 12
---

# Project State

## Project Reference

See: [.planning/PROJECT.md](file:///C:/Users/djdje/Deckify/.planning/PROJECT.md) (updated 2026-11-15)

**Core value:** Rock-solid Spotify playback and responsive, reliable controller navigation on Steam Deck without UI lag, broken images, or desynchronized playback states.
**Current focus:** Planning next milestone

## Current Position

Phase: Milestone v0.5 complete
Plan: —
Status: Awaiting next milestone
Last activity: 2026-11-15 — Milestone v0.5 completed and archived

## Performance Metrics

**Velocity:**
- Total plans completed: 29 (7 in v0.4, 2 in v0.5)
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

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

### Roadmap Evolution

- Phase 11.1 inserted after Phase 11: Address tech debt: v0.5 integration & metadata cleanup (URGENT)
- Phase 12 added: Resolve open todos & polish

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| Audio DSP | EQ-01: Parametric 10-band PipeWire DSP biquad equalizer filter chain | Deferred | 2026-11-12 | v0.5 |
| Native Client | CDP-01: Spotify CDP offline downloads | Deferred | 2026-11-12 | v0.5 |
| Queue API | QUEUE-03: Interactive queue reordering/clearing via CDP | Deferred | 2026-11-12 | v0.5 |
| Audio Hardware | DOCK-01: Auto audio sink switching to external USB-DAC/HDMI dock | Deferred | 2026-11-12 | v0.5 |

## Session Continuity

Last session: 2026-11-15T20:19:57.478Z
Stopped at: Phase 12 complete — all phases complete
Resume file: None

## Operator Next Steps

- Start the next milestone with /gsd-new-milestone
