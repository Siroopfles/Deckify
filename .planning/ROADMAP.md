# Roadmap: Deckify Stability, Polish & Refactoring

## Overview

This roadmap addresses key stability, UI/audio synchronization, and architectural technical debt in Deckify for SteamOS. By decoupling monolithic frontend and backend files first, we establish a clean modular structure to systematically fix image loading under Steam CEF CSP, live playback time interpolation, gamepad seekbar scrubbing, queue selection accuracy, and in-game HUD overlay visibility.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3, 4, 5): Planned milestone work
- Decimal phases (e.g. 2.1): Urgent insertions (marked with INSERTED)

- [x] **Phase 1: Architecture & Monolith Decoupling** - Refactor `DeckifyExpandedModal.tsx` and `main.py` into modular components and modules with zero test regressions.
- [x] **Phase 2: Artwork & Image Pipeline Stabilization** - Expand CDN validation and add request throttling/in-memory caching for CEF image loading.
- [ ] **Phase 3: Live Playback Ticker & Gamepad Seekbar Scrubbing** - Interpolate live elapsed playback time and enable D-pad seek scrubbing.
- [ ] **Phase 4: Queue Navigation & Live State Synchronization** - Fix queue track clicking and ensure instant playback & queue refresh.
- [ ] **Phase 5: In-Game HUD Overlay Restoration** - Restore in-game HUD overlay mounting, settings persistence, and cover art display.

## Phase Details

### Phase 1: Architecture & Monolith Decoupling
**Goal**: Decouple monolithic `DeckifyExpandedModal.tsx` and `main.py` into modular, isolated files with zero regressions.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: [ARCH-01, ARCH-02]
**Success Criteria** (what must be TRUE):
  1. `DeckifyExpandedModal.tsx` is broken down into modular tab components under `src/components/tabs/` and shared components under `src/components/common/`.
  2. `main.py` RPC routes and helpers are moved to modular files in `py_modules/`.
  3. All TypeScript checks, Vitest tests, Rollup bundling, and 316 backend Python unit tests pass with zero regressions.
**Plans**: 2 plans

Plans:
- [x] 01-01: Modularize `DeckifyExpandedModal.tsx` into standalone tab views and shared components.
- [x] 01-02: Modularize `main.py` entrypoint into focused `py_modules/` files and verify backend test suite.

### Phase 2: Artwork & Image Pipeline Stabilization
**Goal**: Eliminate missing artwork across all views by fixing CEF CSP domain filtering and adding client-side request throttling.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: [IMG-01, IMG-02]
**Success Criteria** (what must be TRUE):
  1. Artist pictures, playlist mosaics, track artwork, and podcast covers load reliably in Steam GamepadUI.
  2. Image requests are throttled (max 4-6 concurrent) and cached in JavaScript memory, preventing threadpool starvation and 429 errors.
  3. Rapid scrolling through large libraries does not cause image loading freezes or broken placeholders.
**Plans:** 1 plan

Plans:
- [x] 02-01-PLAN.md — Broaden Spotify CDN image validation, mosaic URI handling, and frontend concurrency throttling queue with LRU cache.

### Phase 3: Live Playback Ticker & Gamepad Seekbar Scrubbing
**Goal**: Ensure smooth real-time elapsed time display and gamepad controller scrubbing on Now Playing.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: [PLAY-01, PLAY-02, PLAY-03]
**Success Criteria** (what must be TRUE):
  1. Elapsed track time counts up every second in real time using local clock interpolation (`Date.now()`).
  2. Progress bar width smoothly reflects the live playback position.
  3. Users can focus the seek bar with the Steam Deck D-pad and step forward/backward in the track.
**Plans**: 2 plans

Plans:
- [x] 03-01-PLAN.md — Implement live playback clock interpolation, drift gating, debounced seeking, and wire into Now Playing & QAM.
- [x] 03-02-PLAN.md — Wire debounced seeking, optimistic updates, and post-seek suppression into DeckifyExpandedModal.

### Phase 4: Queue Navigation & Live State Synchronization
**Goal**: Fix queue track selection so clicking any song in the queue immediately starts playing it and refreshes state.
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: [QUEUE-01, QUEUE-02]
**Success Criteria** (what must be TRUE):
  1. Selecting any track in the Queue tab plays that specific track rather than an incorrect offset or starting over.
  2. The Now Playing view and upcoming queue items immediately reflect the newly active song.
**Plans**: 1 plan

Plans:
- [x] 04-01-PLAN.md — Fix queue click handler, RPC play_tracks binding, and optimistic state synchronization with dedicated Now Playing presentation.

### Phase 5: In-Game HUD Overlay Restoration
**Goal**: Restore the Deckify floating HUD overlay during gameplay and GamepadUI navigation.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: [HUD-01, HUD-02]
**Success Criteria** (what must be TRUE):
  1. Overlay toggle in Settings correctly enables or disables the HUD across game launches.
  2. HUD displays currently playing track title, artist, play/pause indicator, and album artwork.
**Plans**: 1 plan

Plans:
- [ ] 05-01-PLAN.md — Fix HUD overlay mounting, concurrent state polling, auto-hide/pause-grace timers, progress bar, and QAM controls.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Architecture & Monolith Decoupling | 2/2 | Complete | 2026-11-10 |
| 2. Artwork & Image Pipeline Stabilization | 1/1 | Complete | 2026-11-11 |
| 3. Live Playback Ticker & Gamepad Seekbar Scrubbing | 0/2 | Not started | - |
| 4. Queue Navigation & Live State Synchronization | 0/1 | Not started | - |
| 5. In-Game HUD Overlay Restoration | 0/1 | Not started | - |
