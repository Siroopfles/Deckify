# Phase 1: Architecture & Monolith Decoupling - Context

**Gathered:** 2026-11-10  
**Status:** Ready for planning  

<domain>
## Phase Boundary

Decouple monolithic `DeckifyExpandedModal.tsx` (~2,959 LOC) and `main.py` (~2,600 LOC) into clean, modular, testable components and submodules without altering functional behavior or breaking existing test suites.

</domain>

<decisions>
## Implementation Decisions

### Frontend State & Component Hierarchy
- **D-01:** Decompose `DeckifyExpandedModal.tsx` views into standalone components under `src/components/tabs/`:
  - `NowPlayingTab.tsx`
  - `QueueTab.tsx`
  - `PlaylistsTab.tsx`
  - `LikedSongsTab.tsx`
  - `AlbumsTab.tsx`
  - `ArtistsTab.tsx`
  - `RecentTab.tsx`
  - `PodcastsTab.tsx`
  - `SettingsTab.tsx`
- **D-02:** Share playback state via a custom hook (`usePlaybackStatus`) and pass explicit props to tabs rather than wrapping in an overarching React Context, preventing unnecessary modal-wide re-renders during 1-second progress ticks.

### Shared UI Primitives
- **D-03:** Extract shared UI primitives into `src/components/common/`:
  - `DeckifyImage.tsx` (cached base64 image renderer)
  - `InteractiveRow.tsx` (gamepad-focusable interactive row)
  - `TrackActionModal.tsx` (track context options dialog)
  - `Sidebar.tsx` (sidebar navigation bar)

### Backend Submodule Decomposition
- **D-04:** Break down `main.py` by extracting RPC router endpoints and domain helpers into `py_modules/`:
  - `rpc_playback.py` (playback controls, seek, shuffle, repeat, queue)
  - `rpc_library.py` (playlists, liked tracks, albums, artists, recent)
  - `volume.py` (PulseAudio / PipeWire volume synchronization and pactl listener)
  - `system.py` (client detection, system power off, audio sinks)
- **D-05:** Maintain `main.py` strictly as the thin Decky `Plugin` lifecycle entrypoint (`_main`, `_stop`, RPC method registration).

### Test & Regression Guardrails
- **D-06:** Enforce strict step-by-step verification: after each tab or module extraction, run TypeScript typecheck (`tsc --noEmit`), Vitest (`vitest run`), Rollup build (`rollup -c`), and the full backend test suite (all 316 unit tests) to guarantee zero regressions.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture & Conventions
- `.planning/codebase/ARCHITECTURE.md` — Current system overview and component responsibilities
- `.planning/codebase/CONVENTIONS.md` — Code style, naming, and error handling patterns
- `.planning/codebase/CONCERNS.md` — Known tech debt and fragile areas
- `.planning/research/ARCHITECTURE.md` — Target architecture and decomposition blueprint

### Requirements
- `.planning/REQUIREMENTS.md` — Requirements ARCH-01 and ARCH-02

</canonical_refs>
