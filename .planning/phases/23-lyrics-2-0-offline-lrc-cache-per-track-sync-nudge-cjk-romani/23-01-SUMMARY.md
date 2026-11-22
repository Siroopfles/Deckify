---
phase: 23-lyrics-2-0-offline-lrc-cache-per-track-sync-nudge-cjk-romani
plan: 01
subsystem: backend-lyrics
tags: [python, lrc-cache, lyrics-offsets, rpc, settings]

# Dependency graph
requires:
  - phase: 10-in-game-overlay-2-0-live-synced-lyrics
    provides: 5-tier lyrics waterfall in py_modules/spotify.py and overlay lyrics settings
provides:
  - Human-readable .lrc disk cache in ~/.cache/deckify/lyrics/ with [track_id] matching and path traversal guard
  - Atomic per-track sync offset store in ~/.config/deckify/lyrics_offsets.json (clamped [-10000, 10000]ms, 0ms pruned)
  - Updated get_lyrics RPC (track_id, force_refresh) plus get_track_lyrics_offset, set_track_lyrics_offset, and clear_lyrics_cache RPCs
  - Romanization settings (romanize_lyrics_enabled, romanize_display_style, romanize_overlay_enabled) persisted and validated
affects: [23-02, 23-03, 23-04, 30-backup-restore]

# Actuals
actuals:
  tokens: 9489
  tasks: 2
  commits: 2
plan_head_before: 691913f9bfcc6bb8e9306aba164fee40ffeb3dea
plan_head_after: 108c847ba505b4bbfa131fcbc1e8a4b80fa84c50
commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Atomic PID-qualified .tmp + os.replace() writes under module threading.Lock for lyrics_offsets.json and .lrc cache"
    - "Deterministic sha256 short-prefix track_id fallback when RPC caller omits track_id"

key-files:
  created:
    - py_modules/lyrics_offsets.py
    - tests/test_lyrics_2.py
  modified:
    - py_modules/spotify.py
    - py_modules/rpc_library.py
    - py_modules/common.py
    - py_modules/__init__.py
    - main.py

key-decisions:
  - "Key _LYRICS_CACHE by sanitized track_id (or deterministic sha256 fallback) and store .lrc files as {artist} - {title} [{track_id}].lrc with [ti:], [ar:], [deckify-source:], and [deckify-synced:] metadata tags"
  - "Isolate per-track sync offsets in ~/.config/deckify/lyrics_offsets.json and prune 0ms entries to avoid bloating settings.json"

patterns-established:
  - "Path traversal guard: sanitize segment chars, restrict track_id to [A-Za-z0-9_-], and verify os.path.realpath(target).startswith(os.path.realpath(LYRICS_CACHE_DIR) + os.sep)"

requirements-completed: [LYRICS-01]

coverage:
  - id: D1
    description: "Human-readable .lrc disk cache under ~/.cache/deckify/lyrics/ with cache-first hits, force_refresh bypass, no negative caching, and path traversal guard"
    requirement: "LYRICS-01"
    verification:
      - kind: unit
        ref: "tests/test_lyrics_2.py#Lyrics2CacheAndOffsetsTests"
        status: pass
      - kind: unit
        ref: "tests/test_py_modules.py#PyModulesSpotifyTests"
        status: pass
    human_judgment: false
  - id: D2
    description: "Atomic per-track sync offset persistence in ~/.config/deckify/lyrics_offsets.json clamped to [-10000, 10000]ms with 0ms pruning and lyrics_offset_changed event broadcast"
    requirement: "LYRICS-01"
    verification:
      - kind: unit
        ref: "tests/test_lyrics_2.py#test_lyrics_offsets_atomic_clamp_and_prune"
        status: pass
    human_judgment: false
  - id: D3
    description: "Romanization settings (romanize_lyrics_enabled, romanize_display_style, romanize_overlay_enabled) persisted and validated in common.py and main.py"
    requirement: "LYRICS-01"
    verification:
      - kind: unit
        ref: "tests/test_lyrics_2.py#test_romanize_settings_defaults_and_validation"
        status: pass
    human_judgment: false

# Metrics
duration: 6min
completed: 2026-11-22
status: complete
---

# Phase 23 Plan 01: Offline .lrc Cache, Per-Track Sync Offsets & Romanize Settings Summary

**Human-readable `.lrc` disk cache in `~/.cache/deckify/lyrics/`, atomic `lyrics_offsets.json` per-track sync store, and `romanize_*` settings persistence**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-11-22T18:03:03Z
- **Completed:** 2026-11-22T18:09:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Implemented `py_modules/lyrics_offsets.py` with `LYRICS_OFFSETS_FILE`, `load_track_offsets`, `get_track_offset`, and `set_track_offset` (clamped to `[-10000, 10000]` ms, pruning `0` ms entries, atomic `.tmp` + `os.replace()`).
- Upgraded `py_modules/spotify.py` lyrics caching from hashed `.json` files to human-readable `{artist} - {title} [{track_id}].lrc` files under `DECK_HOME/.cache/deckify/lyrics/`, with `[ti:]`, `[ar:]`, `[deckify-source:]`, `[deckify-synced:]` tags, `force_refresh` overwrite support, no negative caching on miss, and strict `realpath` traversal checks.
- Wired `track_id` and `force_refresh` through `rpc_library.get_lyrics` and `Plugin.get_lyrics`, added `get_track_lyrics_offset`, `set_track_lyrics_offset` (emitting `lyrics_offset_changed`), and `clear_lyrics_cache` RPCs in `main.py`, and persisted/validated `romanize_lyrics_enabled`, `romanize_display_style`, and `romanize_overlay_enabled`.
- Added 7 unit tests in `tests/test_lyrics_2.py` verifying `.lrc` caching, `force_refresh`, path traversal protection, cache clearing, offset clamping/pruning, backward-compatible signatures, and romanization settings validation.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end .lrc cache, lyrics_offsets.json store, romanize settings, and RPC wiring** - `f93a4e7` (feat)
2. **Task 2: Add comprehensive unit tests in tests/test_lyrics_2.py** - `108c847` (test)

## Files Created/Modified
- `py_modules/lyrics_offsets.py` - Atomic per-track lyric sync offset store under `DECK_HOME/.config/deckify/lyrics_offsets.json`
- `py_modules/spotify.py` - `.lrc` disk cache, filename sanitization, path traversal guard, and `_fetch_lyrics_sync` updates
- `py_modules/rpc_library.py` - Forward optional `track_id` and `force_refresh` in `get_lyrics`
- `py_modules/common.py` - Add and validate `romanize_lyrics_enabled`, `romanize_display_style`, `romanize_overlay_enabled`
- `py_modules/__init__.py` - Export `lyrics_offsets` submodule
- `main.py` - Expose `get_track_lyrics_offset`, `set_track_lyrics_offset`, `clear_lyrics_cache`, updated `get_lyrics`, and `romanize_*` settings validation
- `tests/test_lyrics_2.py` - 7 unit tests covering `.lrc` cache, offsets store, path traversal guard, and settings

## Decisions Made
- Used sanitized `track_id` (falling back to a 16-char sha256 of `artist::clean_title`) as the canonical cache key so both track-ID-aware callers and legacy `(track_name, artist_name, duration)` callers share the same `.lrc` cache cleanly.
- Stored per-track sync offsets in `~/.config/deckify/lyrics_offsets.json` instead of `settings.json` to keep `settings.json` compact and avoid rewriting user preferences on every nudge.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Closed os.scandir iterators with context managers**
- **Found during:** Task 2 verification
- **Issue:** Unclosed `os.scandir()` iterators in `py_modules/spotify.py` emitted `ResourceWarning` during unit tests.
- **Fix:** Wrapped `os.scandir(LYRICS_CACHE_DIR)` calls in `with os.scandir(...) as entries:` blocks.
- **Files modified:** `py_modules/spotify.py`
- **Verification:** `py -3 -m unittest tests/test_lyrics_2.py tests/test_py_modules.py -v` passed with zero `ResourceWarning`s from `spotify.py`.
- **Committed in:** `108c847` (part of Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor resource-hygiene fix; no scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Backend `.lrc` caching, per-track offset RPCs, and `romanize_*` settings are ready for Plan 23-02 (pure-TS CJK romanization engine) and Plans 23-03/23-04 (UI sync nudge, refresh, and romanization toggles).

## Self-Check: PASSED
- `py_modules/lyrics_offsets.py`: FOUND
- `tests/test_lyrics_2.py`: FOUND
- `f93a4e7` in HEAD history: FOUND
- `108c847` in HEAD history: FOUND
- `py -3 -m unittest tests/test_lyrics_2.py tests/test_py_modules.py -v`: 38 tests PASSED
- Pre-commit full Python suite (`tests/`): 647 tests PASSED

---
*Phase: 23-lyrics-2-0-offline-lrc-cache-per-track-sync-nudge-cjk-romani*
*Completed: 2026-11-22*
