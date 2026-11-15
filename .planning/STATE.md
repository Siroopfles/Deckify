---
gsd_state_version: "1.0"
milestone: v0.5
current_phase: 10
current_phase_name: In-Game HUD Overlay 2.0 (Live Synced Lyrics)
status: planning
stopped_at: Phase 10 UI-SPEC approved
last_updated: "2026-11-15T09:59:21.008Z"
last_activity: 2026-11-15
last_activity_desc: Phase 9 complete, transitioned to Phase 10
state_head: 9b59c2026237727b21bd61b962ee17e430cdaa11
progress:
  total_phases: 6
  completed_phases: 4
  total_plans: 13
  completed_plans: 13
---

# Project State

## Project Reference

See: [.planning/PROJECT.md](file:///C:/Users/djdje/Deckify/.planning/PROJECT.md) (updated 2026-11-12)

**Core value:** Rock-solid Spotify playback and responsive, reliable controller navigation on Steam Deck without UI lag, broken images, or desynchronized playback states.
**Current focus:** Phase 09 — QAM Pinned Playlists & Quick In-Game Switch

## Current Position

Phase: 10 — In-Game HUD Overlay 2.0 (Live Synced Lyrics)
Plan: Not started
Status: Ready to plan
Last activity: 2026-11-15 — Phase 9 complete, transitioned to Phase 10

Progress: [███████░░░] 67% (Phase 06 complete, Phase 07 planned)

## Performance Metrics

**Velocity:**
- Total plans completed: 20 (7 in v0.4, 2 in v0.5)
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
| 10 | 0/2 | - | - |
| 11 | 0/2 | - | - |

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

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| Audio DSP | EQ-01: Parametric 10-band PipeWire DSP biquad equalizer filter chain | Deferred | 2026-11-12 | v0.5 |
| Native Client | CDP-01: Spotify CDP offline downloads | Deferred | 2026-11-12 | v0.5 |
| Queue API | QUEUE-03: Interactive queue reordering/clearing via CDP | Deferred | 2026-11-12 | v0.5 |
| Audio Hardware | DOCK-01: Auto audio sink switching to external USB-DAC/HDMI dock | Deferred | 2026-11-12 | v0.5 |

## Session Continuity

Last session: 2026-11-15T09:59:18.919Z
Stopped at: Phase 10 UI-SPEC approved
Resume file: .planning/phases/10-in-game-hud-overlay-2-0-live-synced-lyrics/10-UI-SPEC.md
