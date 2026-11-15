---
phase: 10-in-game-hud-overlay-2-0-live-synced-lyrics
plan: 02
subsystem: ui
tags: [react, qam, settings, lyrics, overlay, vitest]

# Dependency graph
requires:
  - phase: 10-in-game-hud-overlay-2-0-live-synced-lyrics
    provides: overlay_lyrics_enabled, overlay_autohide_duration_s, overlay_lyrics_offset_ms backend settings and DeckifyOverlayWrapper wiring
provides:
  - QAM Overlay Lyrics ToggleField and dynamic Auto-Hide Overlay (${autoHideSec}s) label in src/index.tsx
  - SettingsTab Overlay Lyrics toggle, Auto-Hide Duration (3-15s) SliderField, and Lyrics Latency Offset (-2000..2000ms) SliderField
  - Clickable 5-provider lyrics source pills inside horizontal Focusable in LyricsTab.tsx
  - handleSelectLyricsSource and modulo-5 handleNextLyricsSource in DeckifyExpandedModal.tsx
affects: [phase-10-verification, QAM, SettingsTab, LyricsTab]

# Actuals (#2632)
actuals:
  tokens: 5700
  tasks: 3
  commits: 3
plan_head_before: 15bc79d3b020b696dcb36cf15cc48e3eeb0d29a4
plan_head_after: 9b614a079f8ac53682052ec8171207f7bb96e42e
commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Horizontal Focusable flow-children='horizontal' pill strip for GamepadUI D-pad lyrics provider selection"
    - "Client-side SliderField clamping ([3, 15] and [-2000, 2000]) before backendSetSetting RPC"

key-files:
  created: []
  modified:
    - src/index.tsx
    - src/components/tabs/SettingsTab.tsx
    - src/components/tabs/LyricsTab.tsx
    - src/components/DeckifyExpandedModal.tsx
    - src/components/tabs/SettingsTab.test.tsx
    - src/components/DeckifyExpandedModal.test.tsx
    - src/index.test.tsx

key-decisions:
  - "Kept QAM compact without duration or latency SliderFields, exposing only Overlay Lyrics ToggleField and dynamic Auto-Hide duration label"
  - "Wrapped handleNextLyricsSource modulo 5 alongside direct LYRICS_SOURCES pill selection in LyricsTab"

patterns-established:
  - "LyricsTab renders 5 provider pills (Spotify, LRCLIB, NetEase, Musixmatch, Lyrics.ovh) in horizontal Focusable while preserving Try Next Source"

requirements-completed: [HUD-03]

coverage:
  - id: D1
    description: "QAM Overlay Lyrics ToggleField and dynamic Auto-Hide Overlay (${autoHideSec}s) label in renderOverlayControls without sliders"
    requirement: "HUD-03"
    verification:
      - kind: unit
        ref: "src/index.test.tsx#renders Overlay Lyrics ToggleField in QAM when overlay_enabled is true and persists overlay_lyrics_enabled"
        status: pass
    human_judgment: false
  - id: D2
    description: "SettingsTab Overlay Lyrics toggle, Auto-Hide Duration SliderField (3-15s), and Lyrics Latency Offset SliderField (-2000..2000ms) with clamped RPC writes"
    requirement: "HUD-03"
    verification:
      - kind: unit
        ref: "src/components/tabs/SettingsTab.test.tsx#renders Overlay Lyrics toggle, Auto-Hide Duration slider, and Lyrics Latency Offset slider when overlay_enabled is true and clamps values"
        status: pass
    human_judgment: false
  - id: D3
    description: "LyricsTab 5 clickable source pills inside horizontal Focusable and DeckifyExpandedModal handleSelectLyricsSource + modulo-5 handleNextLyricsSource"
    requirement: "HUD-03"
    verification:
      - kind: unit
        ref: "src/components/DeckifyExpandedModal.test.tsx#renders 5 clickable source pills in LyricsTab inside horizontal Focusable alongside Try Next Source"
        status: pass
    human_judgment: false

# Metrics
duration: 7min
completed: 2026-11-15
status: complete
---

# Phase 10 Plan 02: QAM, SettingsTab & LyricsTab Controls Summary

**QAM `Overlay Lyrics` toggle, `SettingsTab` Auto-Hide Duration (3–15s) and Lyrics Latency Offset (-2000..2000ms) sliders, and 5 clickable `LyricsTab` source pills wired to `DeckifyExpandedModal`**

## Performance

- **Duration:** 7 min
- **Started:** 2026-11-15T10:20:20Z
- **Completed:** 2026-11-15T10:27:42Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- Added `Overlay Lyrics` `ToggleField` and dynamic `Auto-Hide Overlay (${autoHideSec}s)` label/description to QAM `renderOverlayControls` in `src/index.tsx` while keeping QAM compact without sliders.
- Added `Overlay Lyrics` toggle, `Auto-Hide Duration (Seconds)` `SliderField` (`3..15`, step `1`), and `Lyrics Latency Offset (ms)` `SliderField` (`-2000..2000`, step `100`) with clamped `backendSetSetting` calls in `src/components/tabs/SettingsTab.tsx`.
- Added 5 clickable lyrics source pills (`Spotify`, `LRCLIB`, `NetEase`, `Musixmatch`, `Lyrics.ovh`) inside `<Focusable flow-children="horizontal">` in `src/components/tabs/LyricsTab.tsx` alongside `"Try Next Source"`, wired to `handleSelectLyricsSource` and modulo-5 `handleNextLyricsSource` in `src/components/DeckifyExpandedModal.tsx`.
- Added Vitest unit tests in `src/components/tabs/SettingsTab.test.tsx`, `src/index.test.tsx`, and `src/components/DeckifyExpandedModal.test.tsx` and verified full `typecheck`, `lint`, Vitest (`134/134`), Python `unittest` (`443/443`), and `rollup -c` build.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Overlay Lyrics toggle in QAM and Overlay Lyrics + Duration + Latency Offset controls in SettingsTab** - `6309d54` (included in `src/index.tsx` and `src/components/tabs/SettingsTab.tsx` on `main`)
2. **Task 2: Add clickable lyrics source pills to LyricsTab and wire direct selection in DeckifyExpandedModal** - `f0e918c` (feat)
3. **Task 3: Add Vitest coverage for QAM, SettingsTab, and LyricsTab controls and run full phase verification** - `9b614a0` (test)

## Files Created/Modified
- `src/index.tsx` - QAM `Overlay Lyrics` `ToggleField` and dynamic `Auto-Hide Overlay (${autoHideSec}s)` label
- `src/components/tabs/SettingsTab.tsx` - `Overlay Lyrics` toggle, `Auto-Hide Duration (Seconds)` slider, `Lyrics Latency Offset (ms)` slider
- `src/components/tabs/LyricsTab.tsx` - `LYRICS_SOURCES` horizontal `Focusable` pill strip and `onSelectLyricsSource` prop
- `src/components/DeckifyExpandedModal.tsx` - `handleSelectLyricsSource` callback and modulo-5 `handleNextLyricsSource`
- `src/components/tabs/SettingsTab.test.tsx` - Unit test for Overlay Lyrics toggle and clamped duration/offset sliders
- `src/index.test.tsx` - Unit test for QAM Overlay Lyrics toggle and compact layout
- `src/components/DeckifyExpandedModal.test.tsx` - Unit test for LyricsTab 5 clickable source pills and Try Next Source

## Decisions Made
- Kept QAM compact by omitting duration and latency `SliderField`s from `renderOverlayControls`, exposing only `Overlay Lyrics` and dynamic `Auto-Hide Overlay (${autoHideSec}s)`.
- Preserved `"Try Next Source"` in `LyricsTab` with modulo-5 cycling while adding direct provider selection via `LYRICS_SOURCES` pills.

## Deviations from Plan
None - plan executed as specified (Task 1 edits in `src/index.tsx` and `src/components/tabs/SettingsTab.tsx` were folded into `6309d54` during concurrent `10-01` metadata commit on `main`).

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 10 (`10-01` and `10-02`) is complete and ready for phase verification (`/gsd-verify-work 10`).

## Self-Check: PASSED
- Modified files verified on disk (`src/index.tsx`, `src/components/tabs/SettingsTab.tsx`, `src/components/tabs/LyricsTab.tsx`, `src/components/DeckifyExpandedModal.tsx`, `src/components/tabs/SettingsTab.test.tsx`, `src/components/DeckifyExpandedModal.test.tsx`, `src/index.test.tsx`).
- Commits `6309d54`, `f0e918c`, `9b614a0` verified in git history.
- `pnpm run typecheck`, `pnpm run lint`, `npx vitest run` (134 passed), `py -3 -m unittest` (443 passed), and `pnpm run build` all exited 0.

---
*Phase: 10-in-game-hud-overlay-2-0-live-synced-lyrics*
*Completed: 2026-11-15*
