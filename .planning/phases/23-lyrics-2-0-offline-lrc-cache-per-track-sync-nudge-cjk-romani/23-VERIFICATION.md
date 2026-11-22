---
phase: 23-lyrics-2-0-offline-lrc-cache-per-track-sync-nudge-cjk-romani
verified: 2026-11-22T18:57:30Z
status: passed
score: 12/12 must-haves verified
covered_files:
  - .planning/phases/23-lyrics-2-0-offline-lrc-cache-per-track-sync-nudge-cjk-romani/23-01-PLAN.md
  - .planning/phases/23-lyrics-2-0-offline-lrc-cache-per-track-sync-nudge-cjk-romani/23-01-SUMMARY.md
  - .planning/phases/23-lyrics-2-0-offline-lrc-cache-per-track-sync-nudge-cjk-romani/23-02-PLAN.md
  - .planning/phases/23-lyrics-2-0-offline-lrc-cache-per-track-sync-nudge-cjk-romani/23-02-SUMMARY.md
  - .planning/phases/23-lyrics-2-0-offline-lrc-cache-per-track-sync-nudge-cjk-romani/23-03-PLAN.md
  - .planning/phases/23-lyrics-2-0-offline-lrc-cache-per-track-sync-nudge-cjk-romani/23-03-SUMMARY.md
  - .planning/phases/23-lyrics-2-0-offline-lrc-cache-per-track-sync-nudge-cjk-romani/23-04-PLAN.md
  - .planning/phases/23-lyrics-2-0-offline-lrc-cache-per-track-sync-nudge-cjk-romani/23-04-SUMMARY.md
  - .planning/phases/23-lyrics-2-0-offline-lrc-cache-per-track-sync-nudge-cjk-romani/23-05-PLAN.md
  - .planning/phases/23-lyrics-2-0-offline-lrc-cache-per-track-sync-nudge-cjk-romani/23-05-SUMMARY.md
  - main.py
  - py_modules/cjk_tables.py
  - py_modules/common.py
  - py_modules/lyrics_offsets.py
  - py_modules/romanize.py
  - py_modules/rpc_library.py
  - py_modules/spotify.py
  - src/components/DeckifyExpandedModal.test.tsx
  - src/components/DeckifyExpandedModal.tsx
  - src/components/DeckifyOverlay.test.tsx
  - src/components/DeckifyOverlay.tsx
  - src/components/tabs/LyricsTab.test.tsx
  - src/components/tabs/LyricsTab.tsx
  - src/components/tabs/SettingsTab.tsx
  - src/index.tsx
  - src/types.ts
  - tests/test_lyrics_2.py
  - tests/test_romanize.py
covered_digest: "v4:sha256:f86b94f86339bc5fe606f5a5f9529f4eaf5dce1f2e5ee4040234e4ef3655534e"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 11/11
  gaps_closed:
    - "G-23-12: Lyrics mode controller-hint-bar aligned to 'L2/R2 Seek · X -0.5s · Y +0.5s · L1/R1 Tabs' and dead modeRef.current === 'lyrics' checks removed from isActiveTrackMode"
  gaps_remaining: []
  regressions: []
---

# Phase 23: Lyrics 2.0 — Offline .lrc Cache, Per-Track Sync Nudge & CJK Romanization Verification Report

**Phase Goal:** Users enjoy instant offline-cached `.lrc` lyrics, persistent per-track sync timing adjustments that update the in-game HUD live, and zero-dependency phonetic romanization for Japanese, Korean, and Chinese lyrics.
**Verified:** 2026-11-22T18:57:30Z
**Status:** passed
**Re-verification:** Yes — after gap-closure plan `23-05-PLAN.md` (UAT gap G-23-12)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Synced and plain lyrics are automatically cached as human-readable `.lrc` files in `~/.cache/deckify/lyrics/` (`{artist} - {title} [{track_id}].lrc`) for `0ms` repeat loads and offline playback support. | ✓ VERIFIED | `py_modules/spotify.py` defines `LYRICS_CACHE_DIR = os.path.join(DECK_HOME, ".cache", "deckify", "lyrics")`, `_format_lrc_content`, `_parse_lrc_content`, `_find_lrc_by_track_id`, and `_is_safe_lrc_path`. Verified by `tests/test_lyrics_2.py`. |
| 2 | Force-refreshing or selecting a specific source bypasses cache, overwrites `[{track_id}].lrc` on success, and never writes negative-cache `.lrc` files on miss. | ✓ VERIFIED | `_fetch_lyrics_sync` checks `provider_offset == 0 and not force_refresh` before `_get_cached_lyrics`; `_put_cached_lyrics` guards on `data.get("ok")` and non-empty lyrics and removes stale `[{key}].lrc` files. Verified by `tests/test_lyrics_2.py`. |
| 3 | Per-track sync offsets are clamped to `[-10000, 10000]` ms, persisted atomically in `~/.config/deckify/lyrics_offsets.json` with `0ms` entries pruned, and broadcast via `lyrics_offset_changed`. | ✓ VERIFIED | `py_modules/lyrics_offsets.py` implements `LYRICS_OFFSETS_FILE`, `_clamp_offset_ms`, `0` pruning, and PID-qualified `.tmp` + `os.replace()` under `_OFFSETS_LOCK`. `main.py` exposes `get_track_lyrics_offset` and `set_track_lyrics_offset` emitting `lyrics_offset_changed`. |
| 4 | `romanize_lyrics_enabled`, `romanize_display_style`, and `romanize_overlay_enabled` settings are validated and persisted in `settings.json`. | ✓ VERIFIED | `py_modules/common.py` defines and validates defaults (`False`, `"dual"`, `False`); `main.py` exposes them in `public_keys` and validates them in `set_setting`. |
| 5 | Korean Hangul, Japanese Kana/Kanji, and Chinese Hanzi transliterate via zero-dependency pure-Python tables with song-level script context, returning `None` for non-CJK lines. | ✓ VERIFIED | `py_modules/cjk_tables.py` and `py_modules/romanize.py` implement `has_cjk`, `detect_song_script`, `romanize_korean` (with liaison), `romanize_japanese`, `romanize_chinese`, and `romanize_line` using Python stdlib only. Verified by `tests/test_romanize.py`. |
| 6 | NetEase `rv=-1` `romalrc` is extracted, persisted via `[deckify-romalrc:...]`, aligned (±250ms) to synced lines with pure-Python fallback, and attached as `romanized_lines` / `romanized_plain`. | ✓ VERIFIED | `_fetch_netease_lyrics` requests `&rv=-1`, `_format_lrc_content`/`_parse_lrc_content` round-trip `[deckify-romalrc:...]`, and `_fetch_lyrics_sync` calls `enrich_lyrics_lines` on both cache hits and fresh fetches. |
| 7 | `DeckifyOverlay` clamps `trackLyricsOffsetMs` to `[-10000, 10000]` ms, subtracts it from `effectivePosMs` (so `+0.5s` shifts HUD lines later), and supports optional `romanizeOverlayEnabled` rendering. | ✓ VERIFIED | `src/components/DeckifyOverlay.tsx` clamps `trackLyricsOffsetMs` and computes `effectivePosMs = posMs + elapsed + clampedOffsetMs - clampedTrackOffsetMs`, and renders `dual` / `romanized_only` sub-lines when enabled. Verified by `src/components/DeckifyOverlay.test.tsx`. |
| 8 | `DeckifyOverlayWrapper` in `src/index.tsx` subscribes to `lyrics_offset_changed`, passes `trackId` to `get_lyrics`, and forwards live `trackLyricsOffsetMs` and romanization props to `DeckifyOverlay`. | ✓ VERIFIED | `src/index.tsx` subscribes to `lyrics_offset_changed`, calls `backendGetTrackLyricsOffset(activeId)`, passes `trackId` to `backendGetLyrics`, and forwards `trackLyricsOffsetMs`, `romanizeOverlayEnabled`, and `romanizeDisplayStyle`. Verified by `src/index.test.tsx`. |
| 9 | `LyricsTab` displays `Source: {name} (Cached)`, keeps cached lyrics with a toast if `"Try Next Source"` fails offline, and renders `[-0.5s]`, offset badge, `[+0.5s]`, `[Reset]`, `[Romanize]` in a horizontal `Focusable` toolbar. | ✓ VERIFIED | `src/components/tabs/LyricsTab.tsx` renders `(Cached)` and `LyricsNudgeToolbar` (`<Focusable flow-children="horizontal">`); `DeckifyExpandedModal.tsx` preserves existing lyrics and shows `"Offline or source unavailable — keeping cached lyrics."` on refresh error. Verified by `src/components/tabs/LyricsTab.test.tsx`. |
| 10 | Pressing `X` (`-0.5s`) or `Y` (`+0.5s`) while `LyricsTab` is active nudges the per-track sync offset immediately without colliding with `L1`/`R1` or `L2`/`R2`. | ✓ VERIFIED | `src/components/DeckifyExpandedModal.tsx` (lines 993–998) intercepts `X` and `Y` in `useTriggerNavigation` `onAction` when `modeRef.current === "lyrics"` before the `Y` TrackActionModal and `X` Like branches. Verified by `src/components/DeckifyExpandedModal.test.tsx`. |
| 11 | `SettingsTab` exposes `Romanize CJK Lyrics`, `Romanization Display` (`Dual-Line` / `Romanized Only`), `Romanize In-Game Overlay`, and `Clear Lyrics Cache` (`clear_lyrics_cache` RPC). | ✓ VERIFIED | `src/components/tabs/SettingsTab.tsx` renders all 4 controls inside the In-Game Overlay & Lyrics card and calls `clear_lyrics_cache` / `updateSetting`. Verified by `src/components/tabs/SettingsTab.test.tsx`. |
| 12 | In Lyrics mode (`mode === 'lyrics'`), `controller-hint-bar` renders `'L2/R2 Seek · X -0.5s · Y +0.5s · L1/R1 Tabs'`, and fallback `X`/`Y` `isActiveTrackMode` checks in `onAction` have no unreachable `modeRef.current === 'lyrics'` dead code (`23-05-PLAN.md`, G-23-12). | ✓ VERIFIED | `src/components/DeckifyExpandedModal.tsx` lines 1085–1094 split `now_playing` and `lyrics` `hintText` branches; lines 1001 & 1020 use `modeRef.current === "now_playing"`; `src/components/DeckifyExpandedModal.test.tsx` lines 558–564 assert `'L2/R2 Seek · X -0.5s · Y +0.5s · L1/R1 Tabs'` in `lyrics` mode. |

**Score:** 12/12 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `py_modules/lyrics_offsets.py` | Atomic per-track offset store (`lyrics_offsets.json`) | ✓ VERIFIED | Exists, substantive, imported & called in `main.py` |
| `py_modules/cjk_tables.py` | Pure-Python Kana, Hangul, Kanji, Hanzi tables | ✓ VERIFIED | Exists, substantive, imported in `py_modules/romanize.py` |
| `py_modules/romanize.py` | CJK transliterator & NetEase `romalrc` aligner | ✓ VERIFIED | Exists, substantive, `enrich_lyrics_lines` called in `py_modules/spotify.py` |
| `py_modules/spotify.py` | `.lrc` disk cache, `&rv=-1` `romalrc`, `romanize.py` enrichment | ✓ VERIFIED | Exists, substantive, wired to `rpc_library.py` & `main.py` |
| `py_modules/rpc_library.py` | `get_lyrics` forwarding `track_id` & `force_refresh` | ✓ VERIFIED | Exists, substantive, wired to `main.py` |
| `py_modules/common.py` | `romanize_*` settings defaults & validation | ✓ VERIFIED | Exists, substantive, wired to `main.py` |
| `main.py` | `get_track_lyrics_offset`, `set_track_lyrics_offset`, `clear_lyrics_cache` RPCs | ✓ VERIFIED | Exists, substantive, emits `lyrics_offset_changed` |
| `src/types.ts` | `SyncedLine.romanized` & `romanize_*` settings fields | ✓ VERIFIED | Exists, substantive, imported across components |
| `src/components/DeckifyOverlay.tsx` | Live `trackLyricsOffsetMs` & optional HUD romanization | ✓ VERIFIED | Exists, substantive, wired in `src/index.tsx` |
| `src/index.tsx` | `DeckifyOverlayWrapper` `lyrics_offset_changed` & `trackId` wiring | ✓ VERIFIED | Exists, substantive, passes live props to `DeckifyOverlay` |
| `src/components/tabs/LyricsTab.tsx` | `(Cached)` badge, `LyricsNudgeToolbar`, CJK dual-line rendering | ✓ VERIFIED | Exists, substantive, wired in `DeckifyExpandedModal.tsx` |
| `src/components/DeckifyExpandedModal.tsx` | Offset RPC/events, offline guard, `X`/`Y` nudge shortcuts, `mode === 'lyrics'` `hintText` & clean `isActiveTrackMode` | ✓ VERIFIED | Exists, substantive, passes props to `LyricsTab` and renders aligned hint bar |
| `src/components/DeckifyExpandedModal.test.tsx` | Lyrics mode `controller-hint-bar` regression assertion | ✓ VERIFIED | Exists, substantive, passes in Vitest |
| `src/components/tabs/SettingsTab.tsx` | Romanization toggles, display style pills, `Clear Lyrics Cache` | ✓ VERIFIED | Exists, substantive, wired to `clear_lyrics_cache` & `set_setting` |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `main.py` | `py_modules/lyrics_offsets.py` | `get_track_lyrics_offset`, `set_track_lyrics_offset`, `decky.emit("lyrics_offset_changed")` | ✓ WIRED | Verified in `main.py` |
| `py_modules/rpc_library.py` | `py_modules/spotify.py` | `get_lyrics` forwarding `track_id` & `force_refresh` to `_fetch_lyrics_sync` | ✓ WIRED | Verified in `py_modules/rpc_library.py` & `py_modules/spotify.py` |
| `py_modules/romanize.py` | `py_modules/cjk_tables.py` | Static table imports | ✓ WIRED | Verified in `py_modules/romanize.py` |
| `py_modules/spotify.py` | `py_modules/romanize.py` | `enrich_lyrics_lines()` on cache hit and fresh fetch | ✓ WIRED | Verified in `py_modules/spotify.py` |
| `src/index.tsx` | `src/components/DeckifyOverlay.tsx` | `trackLyricsOffsetMs`, `romanizeOverlayEnabled`, `romanizeDisplayStyle` via `lyrics_offset_changed` | ✓ WIRED | Verified in `src/index.tsx` |
| `src/components/DeckifyExpandedModal.tsx` | `src/components/tabs/LyricsTab.tsx` | `lyricsCached`, `trackOffsetMs`, `onNudgeOffset`, `onResetOffset`, `romanizeEnabled`, `romanizeDisplayStyle`, `onToggleRomanize` | ✓ WIRED | Verified in `src/components/DeckifyExpandedModal.tsx` |
| `src/components/DeckifyExpandedModal.tsx` (`hintText`) | `src/components/DeckifyExpandedModal.tsx` (`onAction` lyrics `X`/`Y` nudge) | `mode === 'lyrics'` branch rendering `'L2/R2 Seek · X -0.5s · Y +0.5s · L1/R1 Tabs'` | ✓ WIRED | Verified at lines 993–998 & 1085–1094 |
| `src/components/tabs/SettingsTab.tsx` | `main.py` | `clear_lyrics_cache` RPC & `set_setting` for `romanize_*` | ✓ WIRED | Verified in `src/components/tabs/SettingsTab.tsx` |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Python lyrics & romanization unit tests (`test_lyrics_2.py`, `test_romanize.py`) | `py -3 -m unittest tests/test_lyrics_2.py tests/test_romanize.py` | 15 tests passed in 0.101s | ✓ PASS |
| Full Vitest frontend suite (including `DeckifyExpandedModal.test.tsx`, `LyricsTab.test.tsx`, `DeckifyOverlay.test.tsx`, `index.test.tsx`) | `pnpm test -- --run` | 24 test files, 295 tests passed | ✓ PASS |
| TypeScript typecheck | `pnpm typecheck` | Exited 0 | ✓ PASS |
| Production Rollup bundle | `pnpm build` | Exited 0 (`created dist in 8.6s`) | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `LYRICS-01` | `23-01`, `23-03`, `23-04`, `23-05` | Automatic local `.lrc` caching in `~/.cache/deckify/lyrics/` for `0ms` repeat loads and Offline Travel Mode support, paired with persistent per-track `-0.5s` / `+0.5s` sync offset nudging in `LyricsTab` synchronized live with `DeckifyOverlay`. | ✓ SATISFIED | `.lrc` cache in `py_modules/spotify.py`, `lyrics_offsets.py`, `LyricsTab` toolbar, `DeckifyExpandedModal` `X`/`Y` shortcuts & `lyrics` hint bar, `DeckifyOverlay` live `trackLyricsOffsetMs` |
| `LYRICS-02` | `23-02`, `23-03`, `23-04` | Phonetic romanization toggle in `LyricsTab` (prepared for Phase 29 `TvSplitView`) displaying dual-line Romaji, Revised Romanization, or Pinyin beneath CJK lyrics using upstream phonetic data and a zero-dependency pure-Python transliterator. | ✓ SATISFIED | `py_modules/cjk_tables.py`, `py_modules/romanize.py`, NetEase `romalrc` in `py_modules/spotify.py`, `LyricsTab` / `DeckifyOverlay` / `SettingsTab` controls |

### Prohibitions & Anti-Patterns Check

- **Prohibited C-extension/npm NLP dependencies (`MeCab`, `fugashi`, `kuromoji.js`):** None found in `package.json`, `py_modules/cjk_tables.py`, `py_modules/romanize.py`, or `py_modules/spotify.py`.
- **Debt markers (`TBD`/`FIXME`/`XXX`):** None found in `src/components/DeckifyExpandedModal.tsx`, `src/components/DeckifyExpandedModal.test.tsx`, or other Phase 23 files.

### Human Verification Required

None — all automated behavioral, unit, typecheck, and build checks passed.

### Gaps Summary

No gaps found. Gap G-23-12 is closed and Phase 23 goal is achieved.

---

_Verified: 2026-11-22T18:57:30Z_
_Verifier: the agent (gsd-verifier)_
