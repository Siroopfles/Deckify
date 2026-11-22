---
phase: 23-lyrics-2-0-offline-lrc-cache-per-track-sync-nudge-cjk-romani
plan: 03
subsystem: lyrics, ui, overlay
tags: [lyrics, romalrc, romanization, overlay, lrc-cache, sync-offset]

requires:
  - phase: 23-lyrics-2-0-offline-lrc-cache-per-track-sync-nudge-cjk-romani
    provides: ".lrc disk cache & per-track offset store (23-01), CJK romanizer & NetEase romalrc aligner (23-02)"
provides:
  - "NetEase rv=-1 romalrc extraction, [deckify-romalrc:] .lrc persistence, and romanized_lines / romanized_plain enrichment in py_modules/spotify.py"
  - "SyncedLine.romanized and romanization settings types in src/types.ts"
  - "Live trackLyricsOffsetMs scheduling and optional dual / romanized_only rendering in DeckifyOverlay.tsx"
  - "DeckifyOverlayWrapper lyrics_offset_changed subscription and track_id-aware get_lyrics wiring in src/index.tsx"
affects: [23-04-PLAN.md, LyricsTab, SettingsTab, DeckifyOverlay]

actuals:
  tokens: 6827
  tasks: 2
  commits: 2
plan_head_before: 9307332902a211f42a40bb4e685e35a234b2fea4
plan_head_after: b0b64b567fb9e9455e3a5eecd820aa40bc8b7483

tech-stack:
  added: []
  patterns:
    - "JSON-escaped [deckify-romalrc:...] metadata tag inside .lrc cache files"
    - "Additive per-track sync offset subtraction (clamped to [-10000, 10000]ms) in DeckifyOverlay"
    - "Conditional array vs single-child JSX rendering in overlay-lyric-row to preserve single-line DOM shape"

key-files:
  created: []
  modified:
    - py_modules/spotify.py
    - tests/test_lyrics_2.py
    - src/types.ts
    - src/components/DeckifyOverlay.tsx
    - src/index.tsx
    - src/components/DeckifyOverlay.test.tsx
    - src/index.test.tsx

key-decisions:
  - "Keep overlay-lyric-row single-child <span> when dual romanization is inactive so existing single-line HUD layout and tests remain unchanged"
  - "Clamp trackLyricsOffsetMs to [-10000, 10000] with Number.isFinite guard before subtracting from effectivePosMs"

patterns-established:
  - "Enrich both cache hits and fresh lyrics fetches via enrich_lyrics_lines() in _fetch_lyrics_sync"

requirements-completed: [LYRICS-01, LYRICS-02]

coverage:
  - id: D1
    description: "NetEase &rv=-1 romalrc extraction, [deckify-romalrc:] .lrc persistence, and romanize.py enrichment in _fetch_lyrics_sync"
    requirement: LYRICS-02
    verification:
      - kind: unit
        ref: "tests/test_lyrics_2.py#test_netease_romalrc_persistence_and_enrichment"
        status: pass
    human_judgment: false
  - id: D2
    description: "DeckifyOverlay clamped trackLyricsOffsetMs scheduling (-10000..10000ms) and dual/romanized_only HUD rendering"
    requirement: LYRICS-01
    verification:
      - kind: unit
        ref: "src/components/DeckifyOverlay.test.tsx"
        status: pass
    human_judgment: false
  - id: D3
    description: "DeckifyOverlayWrapper lyrics_offset_changed subscription and track_id-aware get_lyrics wiring in src/index.tsx"
    requirement: LYRICS-01
    verification:
      - kind: unit
        ref: "src/index.test.tsx"
        status: pass
    human_judgment: false

duration: 5min
completed: 2026-11-22
status: complete
---

# Phase 23 Plan 03: NetEase romalrc, Overlay Sync Nudge & Romanization Summary

**Integrated NetEase `romalrc` persistence and `romanize.py` enrichment into `spotify.py`, and wired live per-track sync nudges (`trackLyricsOffsetMs`) and optional CJK romanization into `DeckifyOverlay` and `DeckifyOverlayWrapper`.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-11-22T18:15:24Z
- **Completed:** 2026-11-22T18:20:12Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Updated `_fetch_netease_lyrics` to request `&rv=-1`, extract `romalrc`, persist it in `.lrc` cache files via `[deckify-romalrc:...]`, and enrich all `ok: True` `_fetch_lyrics_sync` responses (cache hit and fresh fetch) with `romanized_lines` and `romanized_plain`.
- Extended `SyncedLine` and `EngineSettings` in `src/types.ts` with `romanized`, `romanize_lyrics_enabled`, `romanize_display_style`, and `romanize_overlay_enabled`.
- Added clamped `trackLyricsOffsetMs` (`[-10000, 10000]ms`) subtraction and `dual` / `romanized_only` sub-line rendering in `DeckifyOverlay.tsx`, wired to live `lyrics_offset_changed` events and `get_track_lyrics_offset` in `DeckifyOverlayWrapper`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire NetEase romalrc and romanize.py enrichment into py_modules/spotify.py** - `44877b5` (feat)
2. **Task 2: Extend types, DeckifyOverlay live offset/romanization, src/index.tsx wrapper, and tests** - `b0b64b5` (feat)

## Files Created/Modified
- `py_modules/spotify.py` - NetEase `&rv=-1` `romalrc` extraction, `[deckify-romalrc:]` `.lrc` tag serialization/deserialization, and `enrich_lyrics_lines()` attachment on cache hit and fresh fetch.
- `tests/test_lyrics_2.py` - Added `test_netease_romalrc_persistence_and_enrichment`.
- `src/types.ts` - Added `SyncedLine.romanized` and `romanize_*` settings fields.
- `src/components/DeckifyOverlay.tsx` - Added `trackLyricsOffsetMs` clamping/scheduling and `romanizeOverlayEnabled` / `romanizeDisplayStyle` rendering.
- `src/index.tsx` - Added `backendGetTrackLyricsOffset`, `lyrics_offset_changed` listener, `trackId` forwarding to `get_lyrics`, and `romanized_lines` preference in `DeckifyOverlayWrapper`.
- `src/components/DeckifyOverlay.test.tsx` - Added tests for `trackLyricsOffsetMs` sign/clamping and dual/romanized_only overlay rendering.
- `src/index.test.tsx` - Updated `backendGetLyrics` call assertion to include `trackId` (`"trk1"`).

## Decisions Made
- Kept `overlay-lyric-row` rendering a single `<span>` child when dual romanization is not active so existing single-line HUD layout and tests stay unchanged.
- Guarded `trackLyricsOffsetMs` and `lyricsOffsetMs` with `Number.isFinite` before clamping to `[-10000, 10000]` and `[-2000, 2000]` respectively.

## Deviations from Plan

None - plan executed as written (with test assertion update in `src/index.test.tsx` for the new 5th `trackId` argument to `get_lyrics`).

## Issues Encountered
- Pre-existing ESLint warnings (77 warnings in `src/index.tsx` and 3 in `src/components/DeckifyOverlay.tsx`, mostly `max-lines-per-function`, `complexity`, and `@typescript-eslint/no-explicit-any`) cause `eslint --max-warnings=0` to exit non-zero on those files; zero errors and zero new warnings were introduced, and `lint-staged` + `tsc --noEmit` + Rollup build + all 288 Vitest tests + all 655 Python unittest tests passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Backend `.lrc` cache, `romalrc` alignment, per-track offset IPC, and `DeckifyOverlay` HUD wiring are complete and tested; ready for Plan 23-04 (`LyricsTab` & `SettingsTab` UI controls).

## Self-Check: PASSED

---
*Phase: 23-lyrics-2-0-offline-lrc-cache-per-track-sync-nudge-cjk-romani*
*Completed: 2026-11-22*
