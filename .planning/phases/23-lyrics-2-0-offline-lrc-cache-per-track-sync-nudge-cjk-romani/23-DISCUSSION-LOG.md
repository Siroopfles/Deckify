# Phase 23: Lyrics 2.0 — Offline .lrc Cache, Per-Track Sync Nudge & CJK Romanization - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-22
**Phase:** 23-lyrics-2-0-offline-lrc-cache-per-track-sync-nudge-cjk-romani
**Areas discussed:** Offline .lrc Cache & Refresh, Per-Track Sync Nudge UI & Range, CJK Romanization Toggle & Dual-Line Styling, Upstream Phonetics vs Pure-Python Transliterator, Per-Track Offset Storage, Cached Badge & Offline Fallback, Controller Navigation in LyricsTab

---

## Offline .lrc Cache & Refresh

1. **Auto-load vs manual source switching**
   - Selected: Cache-first on auto-load; bypass & overwrite when user clicks "Try Next Source" or picks a source pill.
2. **Plain lyrics & cache size**
   - Selected: Cache both synced and plain lyrics as `.lrc` with metadata tags (`[ti:]`, `[ar:]`, `[deckify-source:]`); keep cache unbounded/lightweight.
3. **Filename convention**
   - Selected: Human-readable filename with `track_id` suffix (`{artist} - {title} [{track_id}].lrc`) — lookup matches by `[track_id]`.
4. **Missing lyrics & cache clearing**
   - Selected: Don't write `.lrc` when no lyrics are found, plus add a `"Clear Lyrics Cache"` button in `SettingsTab`.

---

## Per-Track Sync Nudge UI & Range

1. **Toolbar placement**
   - Selected: Dedicated horizontal `Focusable` toolbar row below the source pills (`[-0.5s] [Offset: +0.0s] [+0.5s] [Reset]` + `Romanize` toggle).
2. **Stacking with global offset & range**
   - Selected: Additive (`±10.0s` / `±10000ms`) applied to both `LyricsTab` and `DeckifyOverlay`, stacked on top of global `overlay_lyrics_offset_ms`.
3. **Nudge sign direction**
   - Selected: `+0.5s` = Lyrics Later / `-0.5s` = Lyrics Earlier.

---

## CJK Romanization Toggle & Dual-Line Styling

1. **Toggle default & location**
   - Selected: Persisted global toggle (default: Off), accessible in `LyricsTab`'s toolbar row and synced to `SettingsTab`, affecting only lines containing CJK characters.
2. **Display style**
   - User asked for clarification on how CJK romanization renders, then chose **Customizable** (dual-line sub-line in `LyricsTab` by default, with `SettingsTab` options for style and optional `DeckifyOverlay` display).

---

## Upstream Phonetics vs Pure-Python Transliterator

- Selected: Upstream NetEase `romalrc` first when available; otherwise pure-Python Kana + Hangul + Pinyin (with compact Unihan/common-Kanji reading fallback) — zero C-extensions, works offline for all `.lrc` files.

---

## Per-Track Offset Storage

- Selected: Store in separate `~/.config/deckify/lyrics_offsets.json` — keeps `settings.json` small even with thousands of offsets.

---

## Cached Badge & Offline Fallback

- Selected: Show `"Source: {name} (Cached)"` badge when loaded from `.lrc`; if offline during `"Try Next Source"`, keep cached lyrics visible and show a toast instead of wiping them.

---

## Controller Navigation in LyricsTab

- Selected: Both standard D-pad navigation on the toolbar buttons AND a dedicated quick controller shortcut in `LyricsTab` (non-conflicting with `L1`/`R1` and `L2`/`R2`).

---

## the agent's Discretion
- Exact button binding for the quick nudge shortcut in `LyricsTab`
- Exact `.lrc` metadata tag format for preserving upstream `romalrc`
- Exact `SettingsTab` control labels and layout

## Deferred Ideas
- None — discussion stayed within phase scope.
