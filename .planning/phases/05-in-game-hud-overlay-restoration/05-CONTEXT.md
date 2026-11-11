# Phase 5: In-Game HUD Overlay Restoration - Context

**Gathered:** 2026-11-11
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase restores and polishes the Deckify in-game floating HUD overlay during gameplay and SteamOS GamepadUI navigation. It ensures reliable global component mounting, persistent settings control, accurate album artwork rendering via the CSP proxy, and responsive play/pause and track-change indicators without blocking gameplay inputs.

**In scope:**
- Ensuring the Deckify in-game HUD overlay mounts reliably in Steam GamepadUI gamescope via `routerHook.addGlobalComponent` (`HUD-01`).
- Resolving and rendering album artwork (via `DeckifyImage` / CSP proxy) and real-time playback state indicators (`HUD-02`).
- Configurable display mode: Permanent HUD vs Auto-hide after 6 seconds upon track change or unpausing (`overlay_autohide`).
- Quick Access Menu (QAM) integration: direct toggle switch and corner position selector in `src/index.tsx` for zero-friction access while gaming.
- Configurable visual style presets: Compact (36px cover, title, artist, status icon) and With Progress Bar (subtle 2px progress bar along the bottom).
- Pause behavior: display pause status icon for 3-4 seconds before fading out smoothly to leave game screens unobscured.
- Lifecycle & state synchronization fix in `DeckifyOverlayWrapper`: poll updates `track`, `is_playing`, and `settings` concurrently, preventing freeze when background events are missed.
- Unit and integration tests (Vitest and Python unit tests) verifying overlay rendering, settings persistence, and state transitions.

**Out of scope:**
- Floating interactive lyrics overlay (deferred to v2 `LYRIC-01`).
- Game-specific audio ducking profiles (already implemented under settings/audio, not part of overlay visual HUD).
</domain>

<decisions>
## Implementation Decisions

### 1. HUD Display Mode & Auto-Hide
- **D-01 (Configurable Permanent vs Auto-Hide):** Provide a user setting (`overlay_autohide: boolean`, default `false`/permanent) allowing users to choose whether the HUD remains visible continuously while music plays or automatically fades out 6 seconds after a song starts or resumes.
  - **Reversibility:** reversible

### 2. In-Game Controls & Quick Access Menu (QAM)
- **D-02 (QAM Direct Controls):** Add an 'Overlay HUD' toggle and 4-corner position selector (`top-left`, `top-right`, `bottom-left`, `bottom-right`) directly into the Quick Access Menu mini-player (`src/index.tsx`) beneath playback controls. Players can toggle or move the HUD instantly during a game session without opening the modal.
  - **Reversibility:** reversible

### 3. Visual Styling & Progress Indication
- **D-03 (Configurable Visual Style & Progress Line):** Provide style configuration (`overlay_show_progress: boolean`):
  - Compact: 36px artwork, title (truncated at 45 chars), artist, and play/pause indicator icon.
  - With Progress Bar: adds a subtle 2px green progress line at the bottom of the badge showing track progress.
  - **Reversibility:** reversible

### 4. Playback State Transitions & Pause Behavior
- **D-04 (Pause Grace Period & Fade-Out):** When music is paused during gameplay, display the pause icon in the overlay badge for 3-4 seconds, then transition opacity to 0 to keep the gameplay screen clean. When playback resumes (`is_playing: true`), immediately fade back in.
  - **Reversibility:** reversible

### 5. State Synchronization & Wrapper Robustness
- **D-05 (Robust State Polling in Wrapper):** In `DeckifyOverlayWrapper` (`src/index.tsx`), update the background polling loop to synchronize `track` (`s.track || s.track_meta`), `isPlaying` (`Boolean(s.is_playing)`), and `settings` (`s.settings`) simultaneously. This ensures the HUD never freezes on stale metadata when playing through Spotify Connect or when process events are dropped.
  - **Reversibility:** reversible

### the agent's Discretion
- Exact CSS cubic-bezier transition curves for fade-in / fade-out animations.
- Fallback placeholder icon styling when track has no album artwork (`FaMusic`).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture & UI Guidelines
- `GEMINI.md` — Project architecture, Steam CEF Content Security Policy (`DeckifyImage` proxying), and pointer-events constraints.
- `.planning/ROADMAP.md` — Phase 5 requirements (HUD-01, HUD-02) and success criteria.
- `.planning/REQUIREMENTS.md` — Detailed definition of HUD-01 and HUD-02.

### Frontend Components
- `src/components/DeckifyOverlay.tsx` — Current HUD overlay component, styling, and positioning logic.
- `src/index.tsx` — `DeckifyOverlayWrapper` component, `routerHook.addGlobalComponent` registration, and Quick Access Menu layout.
- `src/components/tabs/SettingsTab.tsx` — Current Settings tab overlay toggle and position selectors.
- `src/types.ts` — `EngineSettings`, `TrackMeta`, `StatusResponse` interfaces.

### Backend Settings & Tests
- `py_modules/common.py` — `DEFAULT_SETTINGS` dictionary and settings persistence.
- `tests/test_e2e_requirements.py` — E2E test assertions for overlay settings (`test_r7_*`).
</canonical_refs>
