# Phase 3: Live Playback Ticker & Gamepad Seekbar Scrubbing - Context

**Gathered:** 2026-11-11
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers smooth real-time elapsed playback time interpolation and responsive gamepad seekbar scrubbing across Deckify's Now Playing views (both full-screen modal and Quick Access Menu).

**In scope:**
- Clock-interpolated position ticker calculating live elapsed track time locally (`Date.now() - syncTime`).
- Drift-tolerant resynchronization logic preventing rubberbanding / backwards jitter when periodic server status responses arrive.
- Focusable, styled progress bar in `NowPlayingTab` supporting direct D-pad Left/Right scrubbing while focused.
- Optimistic scrubber and timer updates during scrubbing with debounced RPC commit (300ms) to `backendSeekPlayback`.
- Temporary server position override suppression (1200-1500ms) after seeking to prevent race conditions with librespot / Spotify Connect updates.
- Unified shared playback clock hook (`usePlaybackClock` / `usePlaybackStatus`) consumed by both `DeckifyExpandedModal` (NowPlayingTab) and `DeckifyQuickAccessMenu` (`src/index.tsx`).
- Vitest automated test suite verifying clock calculation, drift thresholds, and debouncing.

**Out of scope:**
- Queue track switching and queue reordering (deferred to Phase 4).
- In-game HUD overlay window mounting and floating lyrics (deferred to Phase 5).
- Volume slider scrubbing redesign (focus remains strictly on playback progress and seek scrubbing).
</domain>

<decisions>
## Implementation Decisions

### 1. Clock Interpolation & Rubberbanding Prevention
- **D-01 (Drift Threshold Resync):** Use local monotonic clock interpolation: `localPos = serverPos + (now - syncTime)`. When a background status poll resolves, only overwrite `localPos` if the drift between local and server position exceeds 1200ms, or upon explicit state transitions (is_playing toggled, track changed, or seek action). This prevents network latency and poll intervals from causing the visible second counter to jitter or jump backwards.
  - **Reversibility:** reversible

### 2. Gamepad Seekbar Interaction & UI Styling
- **D-02 (Styled Bar with Direct Scrubber Movement):** Maintain Deckify's styled progress bar aesthetic with prominent Steam Deck GamepadUI focus styling (`@decky/ui` spatial navigation). When the user navigates focus onto the seek bar, pressing D-pad Left or Right directly moves the scrubber position and time counter along the bar.
  - **Reversibility:** reversible
- **D-03 (Scrub Step Size):** When tapping or holding D-pad Left/Right on the focused seekbar, step by 5 or 10 seconds per tick (proportional to track duration if track > 10 min, default 10s for standard songs). Retain optional compact `-15s / +15s` quick buttons alongside the bar for rapid skips.
  - **Reversibility:** reversible

### 3. Seek Debouncing & Optimistic UI Updates
- **D-04 (Optimistic Scrubber with 300ms Debounced RPC):** While the user scrubs on the progress bar, update the local visual fill width and elapsed time display immediately without waiting for network responses. After 300ms of user input silence, commit the target position to backend via `backendSeekPlayback(targetMs)`.
  - **Reversibility:** reversible
- **D-05 (Seek Race Condition Suppression Window):** Following an active seek commit, suppress background server position updates for 1200-1500ms to allow librespot and Spotify Connect backend audio engines to adjust without prematurely resetting the client scrubber to stale timestamps.
  - **Reversibility:** reversible

### 4. Shared Architecture across Modal & QAM
- **D-06 (Unified Hook):** Centralize playback clock interpolation, drift filtering, and seek handlers into a dedicated hook in `src/hooks/` (e.g. `usePlaybackClock.ts` or expanded `usePlaybackStatus.ts`). Both `DeckifyExpandedModal` (via `NowPlayingTab`) and the Quick Access Menu (`src/index.tsx`) must consume this shared hook, ensuring identical timing and scrubbing behavior across the entire plugin.
  - **Reversibility:** costly — touches both primary UI entrypoints and several tab components.

### the agent's Discretion
- Step size curve for very short podcasts/tracks vs long mixes (e.g. 5s for < 5min tracks, 10s for 5-30min, 30s for > 30min).
- Exact CSS focus glow / border styling for the seek bar to match SteamOS CEF gamepad guidelines.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture & UI Guidelines
- `GEMINI.md` — Project architecture, Steam CEF Content Security Policy, D-Pad spatial navigation constraints (`flow-children="horizontal"`), and error handling.
- `.planning/ROADMAP.md` — Phase 3 requirements (PLAY-01, PLAY-02, PLAY-03) and success criteria.
- `src/hooks/usePlaybackStatus.ts` — Existing playback polling and interval timer implementation.
- `src/components/tabs/NowPlayingTab.tsx` — Current Now Playing view, progress bar markup, and interactive rows.
- `src/index.tsx` — Quick Access Menu mini-player, SliderField implementation, and playback state handlers.
</canonical_refs>
