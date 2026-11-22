---
phase: 23-lyrics-2-0-offline-lrc-cache-per-track-sync-nudge-cjk-romani
plan: 02
subsystem: lyrics
tags: [python, cjk, romanization, hangul, kana, kanji, pinyin, romalrc]

requires: []
provides:
  - "Pure-Python CJK lookup tables in py_modules/cjk_tables.py"
  - "Pure-Python CJK romanizer (Korean RR, Japanese Hepburn, Chinese Pinyin) and NetEase romalrc aligner in py_modules/romanize.py"
  - "Unit test coverage in tests/test_romanize.py"
affects: [23-03, 23-04, lyrics, tv-split-view]

actuals:
  tokens: 10124
  tasks: 2
  commits: 2

plan_head_before: 48548bb0d6e4576416379b909037e0e4dde6a548
plan_head_after: c898b4d66bd79d93213dae6429b112c513ace47d
commits: 2

tech-stack:
  added: []
  patterns:
    - "Zero-dependency pure-Python CJK transliteration with song-level script disambiguation"
    - "NetEase romalrc ±250ms timestamp alignment with pure-Python fallback"

key-files:
  created:
    - py_modules/cjk_tables.py
    - py_modules/romanize.py
    - tests/test_romanize.py
  modified: []

key-decisions:
  - "Used pure-Python stdlib lookup tables (437 Kanji readings, 666 Hanzi Pinyin) with zero C-extensions to respect Decky Loader LD_LIBRARY_PATH isolation"
  - "Disambiguated Kanji-only lines in Japanese songs via song-level Kana detection in detect_song_script()"

patterns-established:
  - "Non-CJK lines always return romanized=None to keep non-CJK lyrics uncluttered"
  - "Linear character scanning and non-backtracking regexes for untrusted .lrc/romalrc inputs"

requirements-completed:
  - LYRICS-02

coverage:
  - id: D1
    description: "Zero-dependency pure-Python CJK lookup tables for Hiragana, Katakana, Hangul RR, common Kanji, and common Hanzi"
    requirement: "LYRICS-02"
    verification:
      - kind: unit
        ref: "py -3 -c \"from py_modules import cjk_tables; ...\""
        status: pass
    human_judgment: false
  - id: D2
    description: "Pure-Python CJK romanizer (Korean RR with liaison, Japanese Kana/Kanji Hepburn, Chinese Pinyin, CJK-only filter) and NetEase romalrc aligner"
    requirement: "LYRICS-02"
    verification:
      - kind: unit
        ref: "tests/test_romanize.py#RomanizeTests"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-11-22
status: complete
---

# Phase 23 Plan 02: Pure-Python CJK Romanizer & NetEase Romalrc Aligner Summary

**Implemented zero-dependency pure-Python CJK phonetic romanization for Korean Revised Romanization, Japanese Hepburn Romaji, and Chinese Pinyin with song-level script disambiguation and NetEase `romalrc` alignment.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-11-22T19:10:11Z
- **Completed:** 2026-11-22T19:14:04Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created `py_modules/cjk_tables.py` with complete Hiragana/Katakana digraph and single-character Hepburn tables, Hangul Revised Romanization jamo tuples (19 initials, 21 medials, 28 finals), 437 common Japanese lyric Kanji readings, and 666 common Chinese lyric Hanzi Pinyin readings.
- Created `py_modules/romanize.py` implementing `has_cjk`, `detect_song_script`, `romanize_korean` (with intervocalic liaison before `ㅇ`), `romanize_japanese` (digraphs, sokuon doubling, prolonged vowel mark, syllabic `ん`/`ン`, and Kanji compounds), `romanize_chinese`, `romanize_line` (returning `None` for non-CJK lines), `parse_romalrc`, `align_romalrc_to_lines` (±250ms matching with pure-Python fallback), and `enrich_lyrics_lines`.
- Added 7 unit tests in `tests/test_romanize.py` covering CJK filtering, Korean liaison, Japanese Kana/Kanji, Chinese Pinyin, song-level script context, NetEase `romalrc` alignment/fallback, and idempotency; full backend suite (`654` tests) passed.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create pure-Python CJK lookup tables in py_modules/cjk_tables.py** - `05e24fc` (feat)
2. **Task 2: Create CJK transliterator & NetEase romalrc aligner in py_modules/romanize.py and tests/test_romanize.py** - `c898b4d` (feat)

## Files Created/Modified
- `py_modules/cjk_tables.py` - Zero-dependency Hiragana, Katakana, Hangul RR, Kanji, and Hanzi lookup tables
- `py_modules/romanize.py` - Pure-Python CJK transliterator, song-level script detector, and NetEase `romalrc` aligner
- `tests/test_romanize.py` - Unit tests for all romanization and alignment behaviors

## Decisions Made
- Used pure-Python stdlib lookup tables with zero C-extensions (`MeCab`/`fugashi`/`kuromoji.js` excluded) to preserve Decky Loader `LD_LIBRARY_PATH` isolation.
- Applied song-level Kana detection in `detect_song_script()` so Kanji-only lines in Japanese songs romanize as Japanese rather than Chinese.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `py_modules/romanize.py` (`enrich_lyrics_lines`, `align_romalrc_to_lines`, `romanize_line`) is ready for integration into `py_modules/spotify.py` and backend lyrics RPCs in Plan 23-03.

## Self-Check: PASSED
- `py_modules/cjk_tables.py`: FOUND
- `py_modules/romanize.py`: FOUND
- `tests/test_romanize.py`: FOUND
- Commit `05e24fc`: FOUND
- Commit `c898b4d`: FOUND

---
*Phase: 23-lyrics-2-0-offline-lrc-cache-per-track-sync-nudge-cjk-romani*
*Completed: 2026-11-22*
