# Phase 17: Event-Driven librespot & Suspend/Wi-Fi Resilience - Context

**Gathered:** 2026-11-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver instantaneous local playback state updates via `librespot --onevent` over a non-blocking Unix socket (`<5ms` event emission, never spawning a blocking Python subprocess inside `--onevent`), relax background Web API polling (`_poll_api_loop`) when `--onevent` is healthy to reduce HTTP 429 pressure, and provide suspend (`PrepareForSleep`) and Wi-Fi disconnect/reconnect session bookmarking (`track_uri`, `context_uri`, `position_ms`) and restoration under a unified wake lock, with configurable resilience controls and status in `SettingsTab.tsx`.

</domain>

<decisions>
## Implementation Decisions

### Suspend & Wi-Fi Resume Policy
- **D-01:** Auto-resume playback on Steam Deck wake or Wi-Fi reconnect **only if playback was actively playing** before sleep or the network drop; if playback was paused, restore/keep it paused.
- **D-02:** Use a **short grace window (3–5s) and buffer-aware Wi-Fi drop detection** — account for `librespot`'s local audio/download streaming buffer so brief Wi-Fi blips that play through the buffer without stalling or losing the session do not interrupt playback unnecessarily. Only trigger a full bookmark restore if connectivity actually drops and `librespot` stopped/lost its session. (**Research (`gsd-phase-researcher`) must verify `librespot` v0.8.0's internal streaming/buffering and reconnect behavior on transient network loss.**)

### Event-Driven `--onevent` & Fallback Polling
- **D-03:** Relax `_poll_api_loop` from `3s` to **`15–30s`** when `librespot` is the active Spotify Connect device and `--onevent` is healthy.
- **D-04:** **Auto-revert `_poll_api_loop` to `3s`** whenever playback is on another remote Spotify Connect device (phone/PC), when `audio_backend == "spotify_client"`, or when `--onevent` is unhealthy/silent.
- **D-05:** During rapid track skipping, update UI playback state (`track`, `play/pause`, `position`) **immediately (`<50ms`)** from `--onevent` data, while **debouncing Web API enrichment** (e.g., `check_tracks_liked` / extra metadata) by `~300–500ms` so rapid skipping causes zero audible stutter or HTTP 429 spikes.

### Bookmark Staleness & Conflict Handling
- **D-06:** On wake or reconnect, check active Spotify Connect state (`/v1/me/player`) before restoring: **yield if another device is already actively playing** so Deckify does not hijack playback from a phone/PC.
- **D-07:** Make bookmark expiration/staleness **configurable** via a `SliderField` (`1h–24h` in `1h` steps) plus a `Never` toggle in `SettingsTab.tsx`. When a bookmark is expired or yielded to another device, hold it as a manual restore option rather than auto-playing.

### Resilience UI & Notifications
- **D-08:** Add a dedicated **"Playback Resilience"** card in `SettingsTab.tsx` containing:
  - Toggle for auto-resume on wake/Wi-Fi recovery
  - Configurable bookmark expiry (`SliderField` `1h–24h`, step `1h`, + `Never` toggle)
  - Toggle for restore toast notifications
  - Toggle/option for held-bookmark manual restore prompt (when yielded to another device or expired)
  - Live `--onevent` / polling mode health status indicator
- **D-09:** Support both a **toggleable brief Decky toast** on auto-restore and a **manual "Resume Bookmark" action** when a bookmark was held due to remote playback conflict or expiry (keeping QAM compact when no bookmark is held).

### the agent's Discretion
- Exact Unix socket path (under `DECKY_PLUGIN_RUNTIME_DIR`), lightweight socket emitter binary/script (`<5ms`, no Python startup inside `--onevent`), and JSON event schema for `librespot --onevent`.
- Exact unified wake-lock / state-machine coordination between `SuspendResumeMonitor._on_deck_resume`, Wi-Fi reconnect watchdog, and `_monitor_loop` auto-restart to prevent dual-restart races.
- Exact `settings.json` key names in `DEFAULT_SETTINGS` (`py_modules/common.py`) and TypeScript types in `src/types.ts`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & Requirements
- `.planning/REQUIREMENTS.md` — `RESIL-01`, `RESIL-02`, and Out of Scope constraint forbidding blocking Python subprocesses inside `librespot --onevent`
- `.planning/ROADMAP.md` — Phase 17 goal, dependencies (Phase 13), and success criteria
- `.planning/PROJECT.md` — Core constraints (Steam Deck UID 1000, HTTP 429 rate-limit protection, GamepadUI navigation)

### Research & Architecture
- `.planning/research/SUMMARY.md` — v0.6 research synthesis and Phase 17 resilience overview
- `.planning/research/ARCHITECTURE.md` — Event-driven `--onevent` Unix socket and wake-lock architecture
- `.planning/research/PITFALLS.md` — `librespot --onevent` blocking subprocess pitfall and dual-restart race pitfalls

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `py_modules/device.py`: `SuspendResumeMonitor` (`busctl` `PrepareForSleep` monitor) already wired to `Plugin._on_deck_sleep` and `Plugin._on_deck_resume` in `main.py:144-148`.
- `main.py`: `start_librespot()` (`main.py:426-496`), `_poll_api_loop()` (`main.py:1685-1692`), `_monitor_loop()` (`main.py:1650-1683`), and `_ensure_token()`.
- `py_modules/common.py`: `DEFAULT_SETTINGS`, `DECKY_PLUGIN_RUNTIME_DIR`, `_build_deck_command`.
- `src/components/tabs/SettingsTab.tsx`: Existing `SliderField`, `ToggleField`, and card layout patterns from Phases 14–16.

### Established Patterns
- Subprocesses must strip `LD_LIBRARY_PATH` via `_build_deck_command` (`py_modules/common.py`).
- Backend pushes real-time events to frontend via `decky.emit(...)` (e.g. `track_metadata`, `librespot_status`, `deck_resumed`).
- QAM stays compact; detailed configuration cards and sliders live in `SettingsTab.tsx` (Phases 10, 14, 15, 16).

### Integration Points
- `main.py` (`start_librespot`, `_poll_api_loop`, `_on_deck_sleep`, `_on_deck_resume`, `_monitor_loop`) ↔ new `py_modules/resilience.py` (or event socket server + bookmark/Wi-Fi manager).
- `src/index.tsx` & `src/hooks/usePlaybackStatus.ts` ↔ `decky.emit` event listeners for immediate `--onevent` state updates and restore toasts.
- `src/components/tabs/SettingsTab.tsx` ↔ `main.py` (Playback Resilience card settings, status, and manual bookmark restore RPC).

</code_context>

<specifics>
## Specific Ideas

- **Buffer-aware Wi-Fi handling:** User specifically noted that Spotify/`librespot` buffers/downloads ahead during streaming — do not tear down or interrupt playback during brief Wi-Fi drops if `librespot` continues playing from its buffer; researcher should verify `librespot` v0.8.0 buffering/reconnect behavior.
- **Configurable staleness & restore notifications:** Bookmark expiry (`SliderField` `1h–24h` + `Never` toggle), restore toast, and held-bookmark manual restore prompt should all be user-configurable in `SettingsTab.tsx`.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 17-event-driven-librespot-suspend-wi-fi-resilience*
*Context gathered: 2026-11-17*
