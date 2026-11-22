# Phase 23: Lyrics 2.0 — Offline .lrc Cache, Per-Track Sync Nudge & CJK Romanization - Context

**Gathered:** 2026-11-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver Lyrics 2.0 (`LYRICS-01`, `LYRICS-02`): automatic local `.lrc` caching in `~/.cache/deckify/lyrics/` for `0ms` repeat loads and offline playback, persistent per-track `-0.5s` / `+0.5s` sync offset nudging in `LyricsTab` synchronized live with `DeckifyOverlay`, and zero-dependency CJK phonetic romanization (Romaji, Revised Romanization, Pinyin) with customizable display options.

</domain>

<decisions>
## Implementation Decisions

### Offline .lrc Cache & Storage
- **D-01:** Cache directory is `~/.cache/deckify/lyrics/` using human-readable filenames `{artist} - {title} [{track_id}].lrc` (sanitized for filesystem safety), with lookup matching on `[{track_id}]` so files are both browsable in desktop mode and collision-free.
- **D-02:** Auto-load is cache-first (`0ms` repeat load and offline support). Clicking `"Try Next Source"` or selecting a specific source pill bypasses the cache, fetches from the target source, and overwrites the cached `.lrc` file on success.
- **D-03:** Both synced and plain lyrics are cached as `.lrc` files with standard metadata tags (`[ti:]`, `[ar:]`, `[deckify-source:]`). Cache size is unbounded/lightweight (no automatic LRU eviction).
- **D-04:** Do not write `.lrc` files when no lyrics are found (avoid negative-cache lockouts). Provide a `"Clear Lyrics Cache"` action in `SettingsTab`.
- **D-05:** When lyrics are served from the `.lrc` cache, display `"Source: {name} (Cached)"` in `LyricsTab`. If `"Try Next Source"` is triggered while offline, keep the cached lyrics visible and surface a toast instead of wiping the view.

### Per-Track Sync Nudge & Offset Storage
- **D-06:** Place sync nudge controls (`[-0.5s]`, offset badge, `[+0.5s]`, `[Reset]`) and the `Romanize` toggle in a dedicated horizontal `Focusable` (`flow-children="horizontal"`) toolbar row below the `LYRICS_SOURCES` pills in `LyricsTab.tsx`.
- **D-07:** Support both standard D-pad focus navigation on the toolbar buttons AND a quick non-conflicting controller shortcut while `LyricsTab` is active (avoiding `L1`/`R1` modal tab bumpers and `L2`/`R2` seek triggers).
- **D-08:** Per-track offset range is `±10.0s` (`-10000ms` to `+10000ms`) in `500ms` (`0.5s`) increments, without mutating cached `.lrc` timestamps.
- **D-09:** Sign convention: `+0.5s` shifts lyrics **later** (`-0.5s` shifts lyrics **earlier**). Per-track offset is additive with the existing global `overlay_lyrics_offset_ms` (`-2000..2000ms`) and updates both `LyricsTab` and `DeckifyOverlay` live.
- **D-10:** Persist per-track offsets in a dedicated `~/.config/deckify/lyrics_offsets.json` file (atomic writes, pruning `0ms` entries) rather than `settings.json`, keeping `settings.json` lean for Phase 30 backup integration. — **Reversibility:** costly — moving the storage path later requires migrating existing user offset files and updating Phase 30 backup export/import.

### CJK Romanization Toggle & Customizable Display
- **D-11:** Add a persisted global romanization toggle (`romanize_lyrics_enabled`, default `false`) accessible directly in `LyricsTab`'s toolbar row (`Romanize`) and synced with `SettingsTab`. Only lines containing CJK characters (Hiragana, Katakana, Kanji, Hangul, Hanzi) are romanized.
- **D-12:** Make romanization display customizable in `SettingsTab`:
  - Default in `LyricsTab` (and prepared for Phase 29 `TvSplitView`): dual-line rendering with a smaller muted romanized sub-line beneath the original CJK line inside the same `InteractiveRow`.
  - Allow customizing display style (e.g., dual-line vs romanized-only) and whether romanization is also shown in `DeckifyOverlay` (off by default to keep the in-game HUD compact).

### Upstream Phonetics vs Pure-Python Transliterator
- **D-13:** Prefer upstream NetEase `romalrc` phonetic data when available (and preserve/cache it cleanly), falling back to a zero-dependency pure-Python transliterator for Japanese (Kana + compact Unihan/common-Kanji reading table), Korean (Hangul Revised Romanization), and Chinese (Pinyin) so offline `.lrc` files from any source romanize with zero C-extensions (`MeCab`/`fugashi`/`kuromoji.js` prohibited).

### the agent's Discretion
- Exact button binding for the quick nudge shortcut in `LyricsTab` (e.g., `X`/`Y` when `LyricsTab` is active, avoiding `L1`/`R1`/`L2`/`R2` collisions).
- Exact `.lrc` metadata tag formatting for preserving upstream `romalrc` alongside `[ti:]`, `[ar:]`, and `[deckify-source:]`.
- Exact `SettingsTab` control labels and layout within the existing Lyrics / Overlay settings card.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & Requirements
- `.planning/ROADMAP.md` — Phase 23 goal and success criteria
- `.planning/REQUIREMENTS.md` — `LYRICS-01`, `LYRICS-02`, and Out of Scope C-extension prohibition (`MeCab`, `fugashi`, `kuromoji.js`)

### Existing Lyrics & Overlay Implementation
- `py_modules/rpc_library.py` — `get_lyrics()` RPC handler and 5-source lyrics waterfall
- `py_modules/common.py` — `SETTINGS_FILE`, atomic JSON helpers, `overlay_lyrics_offset_ms` validation
- `main.py` — RPC bindings and settings update handlers (`overlay_lyrics_offset_ms`)
- `src/components/tabs/LyricsTab.tsx` — `LYRICS_SOURCES` pills, `InteractiveRow` synced/plain lyrics view
- `src/components/DeckifyOverlay.tsx` — `lyricsOffsetMs` live scheduling and HUD overlay rendering
- `src/components/tabs/SettingsTab.tsx` — Lyrics / Overlay settings section

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/tabs/LyricsTab.tsx`: Already renders `LYRICS_SOURCES` pills in `<Focusable flow-children="horizontal">` and `InteractiveRow` items for synced lyrics lines.
- `src/components/DeckifyOverlay.tsx`: Already supports `lyricsOffsetMs` and re-anchors `posAnchorRef` when offset changes.
- `py_modules/common.py`: Already provides atomic JSON read/write patterns and `DECKY_PLUGIN_SETTINGS_DIR` / `DECK_HOME` path constants.

### Established Patterns
- Zero third-party PyPI dependencies (pure-Python stdlib only; `LD_LIBRARY_PATH` stripped in `py_modules/common.py`).
- Horizontal controller toolbars in GamepadUI MUST use `<Focusable flow-children="horizontal">` to prevent vertical focus jumps.
- RPC methods return structured `{ "ok": bool, ... }` dictionaries and offload blocking file/network I/O via `_exec()`.

### Integration Points
- `py_modules/rpc_library.py:get_lyrics` & `main.py`: `.lrc` cache lookup/write, per-track offset read/write RPCs, and romanization enrichment.
- `src/components/DeckifyExpandedModal.tsx`: State wiring between `LyricsTab`, `DeckifyOverlay` (`DeckifyOverlayWrapper` in `src/index.tsx`), and backend RPCs.

</code_context>

<specifics>
## Specific Ideas

- Make romanization display customizable in `SettingsTab` (dual-line vs romanized-only style, plus optional `DeckifyOverlay` display).
- Combine D-pad toolbar focus with a non-conflicting controller shortcut in `LyricsTab` for fast sync nudging.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

### Reviewed Todos (not folded)
- `2026-11-21-investigate-decky-loader-breakage-after-steam-update.md` — Matched on generic keywords (`update`, `deckify`); unrelated to Lyrics 2.0, kept in pending todos.

</deferred>

---

*Phase: 23-lyrics-2-0-offline-lrc-cache-per-track-sync-nudge-cjk-romani*
*Context gathered: 2026-11-22*
