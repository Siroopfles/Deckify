# Phase 23: Lyrics 2.0 — Offline .lrc Cache, Per-Track Sync Nudge & CJK Romanization - Research

**Researched:** 2026-11-22
**Domain:** Python stdlib file caching & CJK transliteration, Decky RPC, React / `@decky/ui` GamepadUI & Overlay scheduling
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Cache directory is `~/.cache/deckify/lyrics/` using human-readable filenames `{artist} - {title} [{track_id}].lrc` (sanitized for filesystem safety), with lookup matching on `[{track_id}]` so files are both browsable in desktop mode and collision-free.
- **D-02:** Auto-load is cache-first (`0ms` repeat load and offline support). Clicking `"Try Next Source"` or selecting a specific source pill bypasses the cache, fetches from the target source, and overwrites the cached `.lrc` file on success.
- **D-03:** Both synced and plain lyrics are cached as `.lrc` files with standard metadata tags (`[ti:]`, `[ar:]`, `[deckify-source:]`). Cache size is unbounded/lightweight (no automatic LRU eviction).
- **D-04:** Do not write `.lrc` files when no lyrics are found (avoid negative-cache lockouts). Provide a `"Clear Lyrics Cache"` action in `SettingsTab`.
- **D-05:** When lyrics are served from the `.lrc` cache, display `"Source: {name} (Cached)"` in `LyricsTab`. If `"Try Next Source"` is triggered while offline, keep the cached lyrics visible and surface a toast instead of wiping the view.
- **D-06:** Place sync nudge controls (`[-0.5s]`, offset badge, `[+0.5s]`, `[Reset]`) and the `Romanize` toggle in a dedicated horizontal `Focusable` (`flow-children="horizontal"`) toolbar row below the `LYRICS_SOURCES` pills in `LyricsTab.tsx`.
- **D-07:** Support both standard D-pad focus navigation on the toolbar buttons AND a quick non-conflicting controller shortcut while `LyricsTab` is active (avoiding `L1`/`R1` modal tab bumpers and `L2`/`R2` seek triggers).
- **D-08:** Per-track offset range is `±10.0s` (`-10000ms` to `+10000ms`) in `500ms` (`0.5s`) increments, without mutating cached `.lrc` timestamps.
- **D-09:** Sign convention: `+0.5s` shifts lyrics **later** (`-0.5s` shifts lyrics **earlier**). Per-track offset is additive with the existing global `overlay_lyrics_offset_ms` (`-2000..2000ms`) and updates both `LyricsTab` and `DeckifyOverlay` live.
- **D-10:** Persist per-track offsets in a dedicated `~/.config/deckify/lyrics_offsets.json` file (atomic writes, pruning `0ms` entries) rather than `settings.json`, keeping `settings.json` lean for Phase 30 backup integration. — **Reversibility:** costly — moving the storage path later requires migrating existing user offset files and updating Phase 30 backup export/import.
- **D-11:** Add a persisted global romanization toggle (`romanize_lyrics_enabled`, default `false`) accessible directly in `LyricsTab`'s toolbar row (`Romanize`) and synced with `SettingsTab`. Only lines containing CJK characters (Hiragana, Katakana, Kanji, Hangul, Hanzi) are romanized.
- **D-12:** Make romanization display customizable in `SettingsTab`:
  - Default in `LyricsTab` (and prepared for Phase 29 `TvSplitView`): dual-line rendering with a smaller muted romanized sub-line beneath the original CJK line inside the same `InteractiveRow`.
  - Allow customizing display style (e.g., dual-line vs romanized-only) and whether romanization is also shown in `DeckifyOverlay` (off by default to keep the in-game HUD compact).
- **D-13:** Prefer upstream NetEase `romalrc` phonetic data when available (and preserve/cache it cleanly), falling back to a zero-dependency pure-Python transliterator for Japanese (Kana + compact Unihan/common-Kanji reading table), Korean (Hangul Revised Romanization), and Chinese (Pinyin) so offline `.lrc` files from any source romanize with zero C-extensions (`MeCab`/`fugashi`/`kuromoji.js` prohibited).

### the agent's Discretion
- Exact button binding for the quick nudge shortcut in `LyricsTab` (e.g., `X`/`Y` when `LyricsTab` is active, avoiding `L1`/`R1`/`L2`/`R2` collisions).
- Exact `.lrc` metadata tag formatting for preserving upstream `romalrc` alongside `[ti:]`, `[ar:]`, and `[deckify-source:]`.
- Exact `SettingsTab` control labels and layout within the existing Lyrics / Overlay settings card.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LYRICS-01 | Synced and plain lyrics are automatically cached as local `.lrc` files (`~/.cache/deckify/lyrics/`) for `0ms` repeat loads and Offline Travel Mode support, paired with persistent per-track `-0.5s` / `+0.5s` sync offset nudging in `LyricsTab` that synchronizes live with `DeckifyOverlay`. | `py_modules/spotify.py` `.lrc` cache migration (using `DECK_HOME`), `py_modules/lyrics_offsets.py` atomic JSON store, `main.py` RPCs + `lyrics_offset_changed` event, `LyricsTab` toolbar + `DeckifyOverlay` separate `trackLyricsOffsetMs` prop. |
| LYRICS-02 | User can toggle phonetic romanization in `LyricsTab` and `TvSplitView` to display dual-line Romaji (Japanese), Revised Romanization (Korean), or Pinyin (Chinese) beneath CJK lyrics using upstream phonetic data and a zero-dependency pure-Python transliterator. | NetEase `rv=-1` `romalrc` extraction + `.lrc` `[deckify-romalrc:...]` preservation, `py_modules/romanize.py` + compact `py_modules/cjk_tables.py` (Hangul algorithmic RR, Kana + common Kanji Romaji, common Hanzi Pinyin), `SyncedLine.romanized` type extension, `romanize_lyrics_enabled` / `romanize_display_style` / `romanize_overlay_enabled` settings. |
</phase_requirements>

## Project Constraints (from GEMINI.md)

- **Zero C-extensions / PyPI dependencies**: Pure-Python stdlib only (`LD_LIBRARY_PATH` stripped in `py_modules/common.py`); `MeCab`, `fugashi`, `kuromoji.js` are prohibited (`REQUIREMENTS.md` Out of Scope).
- **SteamOS User Space (`DECK_HOME`)**: Decky Loader runs in root/plugin context while user files live under `deck` user space (UID 1000). Resolve `~` via `DECK_HOME` (`py_modules/common.py:61-70`), never `os.path.expanduser("~")`.
- **SteamOS GamepadUI Navigation**: Horizontal button rows MUST use `<Focusable flow-children="horizontal">`; `flow-children="row"` causes vertical focus jumps.
- **RPC Error Handling**: Backend RPCs must never crash the event loop; catch exceptions and return structured `{"ok": False, "error": ...}` dictionaries; offload blocking file/network I/O via `_exec()`.
- **ESLint Quality Gates (`eslint.config.js`)**: `react-hooks/rules-of-hooks: error`, `complexity: ["warn", 15]`, `max-depth: ["warn", 4]`, `max-lines-per-function: ["warn", 80]`, `max-params: ["warn", 4]`. Keep new components/hooks small and modular.
- **Decky Sandbox**: Never use `sys.modules[__name__]` in `main.py` (use `sys.modules.get(__name__)`).

## Summary

Phase 23 upgrades Deckify's existing 5-tier lyrics waterfall (`py_modules/spotify.py`) and overlay/modal lyrics rendering (`LyricsTab.tsx`, `DeckifyExpandedModal.tsx`, `DeckifyOverlay.tsx`, `src/index.tsx`) in three tightly coupled areas:

1. **Offline `.lrc` Cache**: Currently `py_modules/spotify.py:14` caches lyrics as `{sha256}.json` inside `os.path.join(CACHE_DIR, "lyrics")` (`DECKY_PLUGIN_RUNTIME_DIR/cache/lyrics`), and `_clear_lyrics_cache()` only deletes `.json` files. Phase 23 replaces this with human-readable `{artist} - {title} [{track_id}].lrc` files in `os.path.join(DECK_HOME, ".cache", "deckify", "lyrics")`, matching on `[{track_id}]` for `0ms` repeat/offline loads, preserving `[ti:]`, `[ar:]`, `[deckify-source:]`, and upstream `romalrc` tags, and keeping cached lyrics intact if `"Try Next Source"` fails offline.
2. **Per-Track Sync Nudge (`±10.0s`, `0.5s` steps)**: Stored separately from `settings.json` in `os.path.join(DECK_HOME, ".config", "deckify", "lyrics_offsets.json")` with atomic `os.replace` writes and `0ms` pruning. Crucially, `DeckifyOverlay.tsx:160` currently clamps `lyricsOffsetMs` to `[-2000, 2000]` and adds it (`+ clampedOffsetMs`), which shifts lines *earlier* for positive values. Per D-09, `+0.5s` shifts lyrics **later**, so `DeckifyOverlay` should receive a dedicated `trackLyricsOffsetMs` prop (clamped `[-10000, 10000]`) that is **subtracted** from `effectivePosMs` (`pos + elapsed + clampedGlobalOffsetMs - clampedTrackOffsetMs`), preserving existing `lyricsOffsetMs` behavior and tests.
3. **Zero-Dependency CJK Romanization**: Request NetEase `rv=-1` (`romalrc`) when fetching from NetEase, preserve it in `.lrc`, and fall back to a pure-Python transliterator (`py_modules/romanize.py`) using algorithmic Korean Revised Romanization (Hangul Unicode decomposition), deterministic Japanese Kana-to-Hepburn + compact common-Kanji table, and compact Hanzi-to-Pinyin table.

**Primary recommendation:** Implement `.lrc` cache, `lyrics_offsets.json` persistence, and `romanize.py` cleanly in `py_modules/`, keep `get_lyrics` backward-compatible with optional `track_id` and `force_refresh` parameters, and pass `trackLyricsOffsetMs` + `romanized` data over Decky RPC and `lyrics_offset_changed` events so `LyricsTab` and `DeckifyOverlay` stay live-synchronized.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `.lrc` file read/write, `[track_id]` lookup, cache clear | API / Backend (`py_modules/spotify.py`) | — | Owns filesystem access under `DECK_HOME` and 5-tier lyrics waterfall |
| Per-track offset persistence (`lyrics_offsets.json`) | API / Backend (`py_modules/lyrics_offsets.py`) | Frontend State (`DeckifyExpandedModal`, `src/index.tsx`) | Atomic disk persistence + `lyrics_offset_changed` event broadcast |
| Upstream `romalrc` extraction & CJK transliteration | API / Backend (`py_modules/romanize.py`, `spotify.py`) | — | Keeps heavy tables/regex off CEF JS thread and avoids npm bundle bloat |
| Nudge toolbar, `Romanize` toggle, `X`/`Y` quick shortcuts | Browser / Client (`LyricsTab.tsx`, `DeckifyExpandedModal.tsx`) | — | Owns GamepadUI spatial focus (`flow-children="horizontal"`) and modal input |
| Live HUD lyric scheduling & optional romanized line | Browser / Client (`DeckifyOverlay.tsx`, `src/index.tsx`) | — | Owns monotonic `posAnchorRef` timer scheduling in Gamescope HUD |
| Romanization & cache clear settings UI | Browser / Client (`SettingsTab.tsx`) | API / Backend (`main.py`, `common.py`) | Persists `romanize_lyrics_enabled`, `romanize_display_style`, `romanize_overlay_enabled` |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Python stdlib (`os`, `re`, `json`, `hashlib`, `urllib`) | 3.11+ / 3.14 `[VERIFIED: py -3 --version]` | `.lrc` parsing/writing, atomic JSON, CJK transliteration | Zero external PyPI deps required by Decky Loader sandbox |
| React + `@decky/ui` | 19.x / 4.11.1 `[VERIFIED: package.json:29]` | `Focusable`, `InteractiveRow`, `DialogButton`, `ToggleField` | Native SteamOS GamepadUI focus navigation |
| `@decky/api` | 1.1.3 `[VERIFIED: package.json:46]` | `callable`, `addEventListener` | Typed Decky RPC and backend-to-frontend event push |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `react-icons` | 5.5.0 `[VERIFIED: package.json:48]` | Icons for nudge/reset/romanize controls | Toolbar buttons in `LyricsTab.tsx` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Pure-Python compact Kanji/Hanzi tables | `MeCab` / `fugashi` / `kuromoji.js` | Prohibited by `REQUIREMENTS.md` Out of Scope (breaks `LD_LIBRARY_PATH` sandbox, bloats bundle 15–50 MB) |
| Dedicated `lyrics_offsets.json` | Storing map inside `settings.json` | Prohibited by D-10 (keeps `settings.json` lean for Phase 30 backup) |

**Installation:** None — zero new npm or PyPI packages are added in Phase 23.

## Package Legitimacy Audit

No external packages are installed in Phase 23. All functionality uses Python stdlib and existing repo dependencies (`@decky/ui`, `@decky/api`, `react-icons`).

## Architecture Patterns

### System Architecture Diagram

```text
  [LyricsTab / DeckifyOverlayWrapper]
        │
        ├─ get_lyrics(track, artist, dur, offset, track_id, force_refresh)
        │        │
        │        ▼
        │  [py_modules/spotify.py]
        │    ├─ (offset==0 & !force_refresh) ─► In-Memory LRU ─► ~/.cache/deckify/lyrics/*[{track_id}].lrc
        │    │                                                            │ (hit: cached=True)
        │    └─ (miss / force_refresh / offset>0) ─► 5-Tier Waterfall ────┼─► Write .lrc (if found)
        │                                               (Spotify CDP, LRCLIB, NetEase rv=-1, Musixmatch, Lyrics.ovh)
        │        │
        │        ▼ (if romanize_lyrics_enabled or requested)
        │  [py_modules/romanize.py]
        │    ├─ Upstream NetEase romalrc (if present)
        │    └─ Pure-Python CJK (Hangul RR / Kana+Kanji Romaji / Hanzi Pinyin)
        │
        ├─ set_track_lyrics_offset(track_id, offset_ms)
        │        │
        │        ▼
        │  [py_modules/lyrics_offsets.py] ─► ~/.config/deckify/lyrics_offsets.json (atomic, prune 0ms)
        │        │
        │        └─ decky.emit("lyrics_offset_changed", {track_id, offset_ms})
        │                 │
        │                 ├──► DeckifyExpandedModal (LyricsTab activeLineRef + seek)
        │                 └──► DeckifyOverlayWrapper (DeckifyOverlay live reschedule)
```

### Pattern 1: `DECK_HOME` Path Resolution & Human-Readable `.lrc` Cache
In `py_modules/common.py:61-70`, `DECK_HOME` resolves `/home/deck` even when Decky Loader executes Python as `root`.
- `LYRICS_CACHE_DIR = os.path.join(DECK_HOME, ".cache", "deckify", "lyrics")`
- `LYRICS_OFFSETS_FILE = os.path.join(DECK_HOME, ".config", "deckify", "lyrics_offsets.json")`
- Filename sanitization: strip characters `<>:"/\\|?*` and control chars (`\x00-\x1f`), collapse whitespace, cap artist/title segments (e.g. 60 chars each), format `{safe_artist} - {safe_title} [{safe_track_id}].lrc`.
- Lookup by `[{safe_track_id}].lrc`: scan `LYRICS_CACHE_DIR` with `os.scandir` for any `.lrc` file whose name ends with `f"[{safe_track_id}].lrc"`. When overwriting on `"Try Next Source"`, remove any older `[{safe_track_id}].lrc` if the sanitized artist/title changed.
- Metadata tags in `.lrc`:
  ```lrc
  [ti:Song Title]
  [ar:Artist Name]
  [deckify-source:LRCLIB]
  [deckify-synced:true]
  [deckify-romalrc:"[00:10.00] romanized line"]
  [00:10.00] 元の歌詞
  ```
  `src/utils.ts:15` uses `const regex = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\](.*)/;`, so metadata tags like `[ti:]`, `[ar:]`, `[deckify-source:]`, `[deckify-romalrc:]` are automatically ignored by `parseLrc()`.

### Pattern 2: Additive Per-Track Offset with Live Event Sync
Per D-09, `+0.5s` shifts lyrics **later** (`-0.5s` shifts lyrics **earlier**), and per-track offset is additive with `overlay_lyrics_offset_ms` (`-2000..2000ms`).
- In `DeckifyOverlay.tsx:160-175`, existing code computes:
  ```ts
  const clampedOffsetMs = Math.min(2000, Math.max(-2000, lyricsOffsetMs ?? 0));
  const clampedTrackOffsetMs = Math.min(10000, Math.max(-10000, trackLyricsOffsetMs ?? 0));
  const effectivePosMs =
    posAnchorRef.current.posMs +
    Math.max(0, Date.now() - posAnchorRef.current.atMs) +
    clampedOffsetMs -
    clampedTrackOffsetMs;
  ```
  Subtracting `clampedTrackOffsetMs` means a `+500ms` per-track offset requires `posMs` to be `500ms` *higher* before `syncedLyrics[i].timeMs <= effectivePosMs` becomes true — shifting lyrics **later** by `0.5s`, while preserving `lyricsOffsetMs` semantics for existing `DeckifyOverlay.test.tsx` tests!
- In `DeckifyExpandedModal.tsx:410`, compute `const effectivePosMs = currentPositionMs - trackLyricsOffsetMs;` when finding `currentLineIndex`, and when clicking a line in `LyricsTab` to seek, pass `Math.max(0, line.timeMs + trackLyricsOffsetMs)`.

### Pattern 3: Pure-Python CJK Transliteration (`py_modules/romanize.py`)
1. **CJK check**: Regex matching Hiragana (`\u3040-\u309F`), Katakana (`\u30A0-\u30FF`), Hangul (`\uAC00-\uD7AF`, `\u1100-\u11FF`, `\u3130-\u318F`), CJK Unified Ideographs (`\u4E00-\u9FFF`, `\u3400-\u4DBF`). Non-CJK lines return `None`.
2. **Song-level script context**: If any line in the song contains Hiragana/Katakana, treat Kanji-only lines in the same song as **Japanese**, not Chinese. Lines with Hangul are **Korean**. Lines with Hanzi and no Kana/Hangul in the song are **Chinese**.
3. **Korean Hangul**: Algorithmic Unicode decomposition (`code - 0xAC00` -> `initial`, `medial`, `final`) mapped to Revised Romanization tables, with basic intervocalic liaison when a final consonant precedes `ㅇ` (`initial == 11`).
4. **Japanese**: Greedy 2-char digraph Kana lookup (`きゃ` -> `kya`), single Kana lookup, sokuon (`っ`/`ッ`) consonant doubling, prolonged mark (`ー`) vowel extension, `ん`/`ン` -> `n` (`n'` before vowel/`y`), and compact common-Kanji reading table (`py_modules/cjk_tables.py`).
5. **Chinese**: Compact Hanzi-to-Pinyin table (`py_modules/cjk_tables.py`) with space-separated syllables.
6. **Upstream `romalrc`**: When NetEase returns `romalrc`, parse its `[mm:ss.xx]` lines and match to `syncedLyrics` by timestamp (nearest within ±250ms or exact `timeMs`) or line index for plain lyrics, falling back to `romanize.py` for any unmatched CJK lines.

### Pattern 4: `LyricsTab` Toolbar & `TvSplitView`-Ready `SyncedLine`
Extend `SyncedLine` in `src/types.ts:130-133`:
```ts
export interface SyncedLine {
  timeMs: number;
  text: string;
  romanized?: string;
}
```
In `LyricsTab.tsx`, add a second `<Focusable flow-children="horizontal">` toolbar row directly below the `LYRICS_SOURCES` pills row (lines 66-90):
- `[-0.5s]` button (`onNudgeOffset(-500)`)
- Offset badge (`+0.0s` / `+1.5s` / `-0.5s`)
- `[+0.5s]` button (`onNudgeOffset(500)`)
- `[Reset]` button (`onResetOffset()`, disabled/dimmed when `0ms`)
- `[Romanize]` toggle pill (`onToggleRomanize()`)
- Controller shortcut in `DeckifyExpandedModal.tsx` `useTriggerNavigation` `onAction` (`lines 871-905`): when `modeRef.current === "lyrics"`, intercept `"X"` (`-500ms`) and `"Y"` (`+500ms`) before the track Like/ActionModal branches so `L1`/`R1` (tab switch) and `L2`/`R2` (10s seek) remain untouched.

### Anti-Patterns to Avoid
- **Using `os.path.expanduser("~")`**: Resolves to `/root` under Decky Loader instead of `/home/deck`. Always use `DECK_HOME`.
- **Overwriting `lyricsOffsetMs` clamp in `DeckifyOverlay.tsx:160`**: Clamping combined offset to `[-2000, 2000]` would break `±10000ms` per-track offsets. Keep `lyricsOffsetMs` (`[-2000, 2000]`) and `trackLyricsOffsetMs` (`[-10000, 10000]`) separate.
- **Wiping cached lyrics on offline `"Try Next Source"`**: Check `res.ok` before replacing `syncedLyrics`/`plainLyrics` in `DeckifyExpandedModal.tsx:355-382`; if existing lyrics are loaded and `force_refresh` / `offset > 0` fails, keep existing lyrics and show a toast.
- **Writing negative-cache `.lrc` files**: Never write a `.lrc` file when `get_lyrics` finds nothing (D-04).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic file persistence | Direct `open(..., "w")` | Write `.tmp` + `os.replace()` (existing pattern in `py_modules/common.py`) | Prevents corrupted JSON/LRC on Steam Deck sudden sleep/power loss |
| LRC timestamp parsing | Duplicate regex in `LyricsTab` | `parseLrc` in `src/utils.ts` | Already handles `[mm:ss.xx]`, `[mm:ss:xxx]`, sorting, and ignores metadata tags |
| Hangul syllable decomposition | Hardcoded 11,172-syllable lookup table | Unicode math `(ord(ch) - 0xAC00)` -> `(initial, medial, final)` | 100% coverage of all 11,172 modern Hangul syllables in ~50 lines |

## Common Pitfalls

### Pitfall 1: `DeckifyOverlay.tsx` Sign & Clamp Mismatch
**What goes wrong:** `DeckifyOverlay.tsx:160` clamps `lyricsOffsetMs` to `[-2000, 2000]` and adds it (`pos + elapsed + clampedOffsetMs`), which shifts lyrics *earlier* for positive values.
**Why it happens:** `overlay_lyrics_offset_ms` was designed as a `[-2000, 2000]` latency compensation slider, whereas per-track nudge (`±10000ms`) follows D-09 (`+0.5s` shifts lyrics *later*).
**How to avoid:** Add `trackLyricsOffsetMs?: number` to `DeckifyOverlayProps` (clamped `[-10000, 10000]`) and subtract it in `effectivePosMs`.

### Pitfall 2: `X`/`Y` Shortcut Collision in `DeckifyExpandedModal.tsx`
**What goes wrong:** `DeckifyExpandedModal.tsx:871-905` binds `Y` to `TrackActionModal` and `X` to `handleToggleLike` when `modeRef.current === "lyrics"`.
**How to avoid:** Check `if (modeRef.current === "lyrics")` first in `onAction` for `"X"` (`-500ms`) and `"Y"` (`+500ms`), calling `e.preventDefault?.()` and `e.stopPropagation?.()`.

### Pitfall 3: Existing `test_py_modules.py` Lyrics Tests Expecting Backward-Compatible Signatures
**What goes wrong:** `tests/test_py_modules.py:223-346` and `tests/test_plugin_api.py:373-395` call `_fetch_lyrics_sync(track_name, artist_name, duration_sec=180)` and `self.plugin.get_lyrics(...)` without `track_id` or `force_refresh`.
**How to avoid:** Make `track_id: str = ""` and `force_refresh: bool = False` optional trailing parameters with defaults, and generate a deterministic fallback ID from `artist::clean_title` when `track_id` is empty. Also ensure `spotify._clear_lyrics_cache()` deletes `.lrc` (and legacy `.json`) files in `LYRICS_CACHE_DIR`.

### Pitfall 4: ESLint Function Size & Complexity Warnings
**What goes wrong:** `eslint.config.js:25-31` warns on `max-lines-per-function > 80`, `complexity > 15`, `max-params > 4`.
**How to avoid:** Extract the nudge/romanize toolbar into a small sub-component or helper in `LyricsTab.tsx`, and keep `DeckifyExpandedModal.tsx` lyrics nudge/romanize handlers concise.

## Code Examples

### Per-Track Offset Atomic Store (`py_modules/lyrics_offsets.py`)
```python
# Pattern from py_modules/common.py atomic JSON writes
def set_track_offset(track_id: str, offset_ms: int, path: str = LYRICS_OFFSETS_FILE) -> int:
    clamped = max(-10000, min(10000, int(offset_ms)))
    offsets = load_track_offsets(path)
    if clamped == 0:
        offsets.pop(track_id, None)
    else:
        offsets[track_id] = clamped
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp_path = f"{path}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(offsets, f, indent=2)
    os.replace(tmp_path, path)
    return clamped
```

### Dual-Line Romanization Rendering (`LyricsTab.tsx`)
```tsx
<InteractiveRow onClick={() => onSeekPlayback(Math.max(0, line.timeMs + trackOffsetMs))} active={isCurrent} ...>
  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
    <span>{displayStyle === "romanized_only" && line.romanized ? line.romanized : line.text}</span>
    {romanizeEnabled && displayStyle !== "romanized_only" && line.romanized && (
      <span style={{ fontSize: isCurrent ? 14 : 12, opacity: 0.72, fontWeight: 400 }}>
        {line.romanized}
      </span>
    )}
  </div>
</InteractiveRow>
```

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python 3 | Backend unit tests (`unittest`) | ✓ | 3.14.0 `[VERIFIED: py -3 --version]` | — |
| Node.js | Frontend build, typecheck, Vitest | ✓ | v25.1.0 `[VERIFIED: node --version]` | — |
| pnpm | Running `vitest`, `tsc`, `eslint` | ✓ | 10.28.0 `[VERIFIED: pnpm --version]` | — |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Python Framework | `unittest` (Python 3.14.0 stdlib) |
| Frontend Framework | Vitest 5.1.0 (`package.json:43`) |
| Quick run command (Python) | `py -3 -m unittest tests/test_py_modules.py` |
| Quick run command (Frontend) | `pnpm test -- src/components/DeckifyOverlay.test.tsx src/utils.test.ts` |
| Full suite command | `pnpm typecheck && pnpm lint && pnpm test && py -3 -m unittest discover -s tests -p "test_*.py"` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LYRICS-01 | `.lrc` filename sanitization, `[track_id]` lookup, metadata tags, no negative-cache, force_refresh bypass, clear cache | unit | `py -3 -m unittest tests/test_lyrics_2.py` | ❌ Wave 0 |
| LYRICS-01 | `lyrics_offsets.json` atomic save, `±10000ms` clamp, `0ms` pruning | unit | `py -3 -m unittest tests/test_lyrics_2.py` | ❌ Wave 0 |
| LYRICS-01 | `DeckifyOverlay` `trackLyricsOffsetMs` `+500ms` shifts later & additive with `lyricsOffsetMs` | unit | `pnpm test -- src/components/DeckifyOverlay.test.tsx` | ✅ (extend) |
| LYRICS-01 / LYRICS-02 | `LyricsTab` nudge toolbar, `Romanize` toggle, dual-line vs romanized-only rendering, `(Cached)` badge | unit | `pnpm test -- src/components/tabs/LyricsTab.test.tsx` | ❌ Wave 0 |
| LYRICS-02 | Pure-Python Hangul RR, Japanese Kana+Kanji Romaji, Chinese Pinyin, CJK-only filtering, NetEase `romalrc` alignment | unit | `py -3 -m unittest tests/test_romanize.py` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `py -3 -m unittest tests/test_py_modules.py` + targeted new test file
- **Per wave merge:** `pnpm typecheck && pnpm lint && pnpm test && py -3 -m unittest discover -s tests -p "test_*.py"`
- **Phase gate:** Full suite green + `pnpm build` clean before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/test_lyrics_2.py` — covers `.lrc` cache, `lyrics_offsets.json`, `clear_lyrics_cache` RPC, and `get_lyrics` backward compatibility
- [ ] `tests/test_romanize.py` — covers Hangul RR, Japanese Kana/Kanji Romaji, Chinese Pinyin, song-level script detection, and NetEase `romalrc` alignment
- [ ] `src/components/tabs/LyricsTab.test.tsx` — covers nudge controls, `Romanize` toggle, dual-line/romanized-only styles, and `(Cached)` source badge

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes | Sanitize `artist`, `title`, and `track_id` before constructing `.lrc` paths (prevent path traversal `..`/`/`); clamp `offset_ms` to `[-10000, 10000]`; validate `romanize_display_style` against `("dual", "romanized_only")`. |
| V6 Cryptography | no | — |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via crafted track/artist/track_id in `.lrc` filename | Tampering | Strip path separators (`/`, `\`, `..`) and restrict `track_id` to `[A-Za-z0-9_-]`; verify `os.path.realpath(target).startswith(os.path.realpath(LYRICS_CACHE_DIR))`. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | NetEase `/api/song/lyric?os=pc&id={song_id}&lv=-1&kv=-1&tv=-1&rv=-1` returns `romalrc.lyric` in the JSON payload. | Architecture Patterns (Pattern 3) | Low — if `rv=-1` is absent or empty, `romanize.py` pure-Python fallback handles Japanese/Korean/Chinese automatically. |
| A2 | A compact pure-Python table of ~2,100–3,000 common Japanese Kanji readings and ~3,500–6,000 common Chinese Hanzi Pinyin readings provides sufficient offline coverage without exceeding ~80 KB. | Architecture Patterns (Pattern 3) | Low — rare characters outside the table pass through unchanged rather than failing. |

## Sources

### Primary (HIGH confidence)
- In-repo source files read in this session: `py_modules/spotify.py:14,145-197,298-548`, `py_modules/common.py:41-74,143-145,394-399`, `py_modules/rpc_library.py:1034-1053`, `main.py:712,934-938,1401-1408`, `src/components/tabs/LyricsTab.tsx:1-127`, `src/components/DeckifyOverlay.tsx:18-50,132-203,250-375`, `src/components/DeckifyExpandedModal.tsx:133-140,355-420,750-909,1078-1092`, `src/index.tsx:1857-1960`, `src/utils.ts:11-33`, `src/types.ts:125-133,266-267`, `eslint.config.js:1-41`, `package.json:1-62`.

### Tertiary (LOW confidence)
- NetEase `rv=-1` `romalrc` query parameter behavior (tagged `[ASSUMED]` in Assumptions Log A1).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 100% stdlib + existing repo dependencies verified in `package.json` and `py_modules/`.
- Architecture: HIGH — all integration points, line numbers, sign conventions, and existing test contracts verified directly in repo files.
- Pitfalls: HIGH — identified 4 concrete pitfalls (`DECK_HOME` vs `~`, `DeckifyOverlay` offset sign/clamp, `X`/`Y` shortcut collision, ESLint function limits) directly from code inspection.

**Research date:** 2026-11-22
**Valid until:** 2026-12-22
