# Milestones

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
