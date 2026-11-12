# Phase 4: Queue Navigation & Live State Synchronization - Context

**Gathered:** 2026-11-11
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers rock-solid Queue track selection, immediate playback state synchronization with Now Playing, and responsive GamepadUI controller navigation in the Queue tab without UI lag, focus loss, or desynchronized queue states.

**In scope:**
- Fixing track selection in the Queue view so clicking/selecting any queue item starts playback of that exact track (`QUEUE-01`).
- Resolving the RPC method signature / name mismatch (`backendPlayTracks` calling `"play_track"` vs backend `"play_tracks"`).
- Immediate optimistic local UI update (promoting selected track to Now Playing, slicing remaining queue) paired with a 600ms delayed server resynchronization (`QUEUE-02`).
- Dedicated "Now Playing" visual card at the top of `QueueTab` with green playing indicator, followed by a "Next in Queue" numbered list.
- Gamepad controller focus retention: focus remains on the next upcoming queue item (or Now Playing card if empty) without spatial navigation escaping to the sidebar.
- Event-driven queue refresh on tab open / track change, plus a conservative 10-second polling interval while `QueueTab` is active to respect Spotify API rate limits.
- Automated tests (Vitest and Python unit/e2e tests) verifying queue selection, RPC payload formatting, and state synchronization.

**Out of scope:**
- In-game HUD overlay window mounting and floating lyrics (deferred to Phase 5).
- Queue drag-and-drop reordering (Spotify Web API does not expose an arbitrary queue reordering endpoint; only append to queue).
- Offline lyrics caching (v2 requirement `LYRIC-01`).
</domain>

<decisions>
## Implementation Decisions

### 1. Playback Strategy & RPC Wiring
- **D-01 (Explicit URIs Sequence Playback):** When the user selects track $N$ in the queue, start playback using an explicit sequence of that clicked track followed by all subsequent remaining queue tracks: `uris = queueTracks.slice(idx).map(x => x.uri)`. This guarantees Spotify immediately switches to the exact clicked track without offset mismatch, and retains the upcoming queue order.
  Also fix the backend RPC name binding: ensure `backendPlayTracks` in TypeScript correctly invokes `"play_tracks"`, and alias `play_track` to `play_tracks` in `main.py` for full bidirectional compatibility.
  - **Reversibility:** reversible

### 2. Queue UI Layout & Now Playing Presentation
- **D-02 (Dedicated Now Playing Card & Visual Hierarchy):** Structure `QueueTab` with a dedicated, styled "Now Playing" card at the top (displaying album artwork via `DeckifyImage`, title, artist, duration, and green active indicator) followed by a "Next in Queue" header and a numbered scrollable list for upcoming tracks. If the queue is empty, maintain the Now Playing card and display a friendly empty state ("Queue is empty. Add songs from your library or search").
  - **Reversibility:** reversible

### 3. State Synchronization & Optimistic Updates
- **D-03 (Optimistic UI Update & 600ms Server Resync):** When a queue track is clicked, update the UI immediately without waiting for server responses: set the clicked track as the active 'Now Playing' item, remove all preceding tracks up to and including the clicked item from the local queue list, and trigger `refreshStatus()`. Schedule a delayed `get_queue` API refresh (600ms-800ms) to allow Spotify's backend queue pointer to settle before reconciling the canonical list.
  - **Reversibility:** reversible

### 4. Controller Navigation & Focus Retention
- **D-04 (Gamepad Focus Preservation):** When a track in the queue is selected via GamepadUI (A button), retain controller focus within the queue list on the next available item (or fallback to the Now Playing card if the upcoming queue is now empty). Do not lose focus or cause spatial navigation to escape to the sidebar navigation tabs.
  - **Reversibility:** reversible

### 5. Polling & Performance Optimization
- **D-05 (Event-Driven Refresh with Conservative 10s Polling):** Refresh queue state immediately on tab switch (`mode === "queue"`) and after playback actions. While `QueueTab` remains actively open in the expanded modal, poll `get_queue` conservatively every 10 seconds to detect external track finishes or remote Spotify Connect changes without causing HTTP 429 rate limit backoffs.
  - **Reversibility:** reversible
- **D-06 (Track Actions & Capacity Cap):** Maintain interactive row actions in the queue (Like/Heart toggle `handleToggleLike`). Limit rendered upcoming queue items to 30-50 tracks to guarantee smooth 60fps controller scrolling in SteamOS GamepadUI.
  - **Reversibility:** reversible

### the agent's Discretion
- Exact styling details of the "Now Playing" header card in `QueueTab` to match existing Deckify card and typography themes.
- Exact debounce/delay constant (600ms vs 800ms) for background `get_queue` resynchronization.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture & UI Guidelines
- `GEMINI.md` — Project architecture, Steam CEF Content Security Policy, D-Pad spatial navigation constraints (`flow-children="column"` / `"horizontal"`), and error handling.
- `.planning/ROADMAP.md` — Phase 4 requirements (QUEUE-01, QUEUE-02) and success criteria.
- `.planning/REQUIREMENTS.md` — Requirements specification for QUEUE-01 and QUEUE-02.

### Frontend Components
- `src/components/tabs/QueueTab.tsx` — Current Queue tab component, `InteractiveRow` mappings, and click handlers.
- `src/components/DeckifyExpandedModal.tsx` — Modal state management, `backendPlayTracks` callable, `loadQueue`, and tab switching logic.
- `src/hooks/usePlaybackStatus.ts` — Playback status polling hook and clock coordination.

### Backend RPC & Tests
- `py_modules/rpc_playback.py` — Backend `get_queue`, `add_to_queue`, and `play_tracks` implementations.
- `main.py` — Decky plugin entry point and RPC callable registrations.
- `tests/test_e2e_requirements.py` — E2E test assertions for queue playback (`test_r9_*`).
</canonical_refs>
