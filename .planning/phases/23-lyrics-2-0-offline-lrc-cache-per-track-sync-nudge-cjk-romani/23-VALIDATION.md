---
phase: "23"
slug: "lyrics-2-0-offline-lrc-cache-per-track-sync-nudge-cjk-romani"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-22"
---

# Phase 23 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Python `unittest` (stdlib) + Vitest 5.1.0 |
| **Config file** | `package.json` / `tsconfig.json` |
| **Quick run command** | `py -3 -m unittest tests/test_py_modules.py` |
| **Full suite command** | `pnpm typecheck && pnpm lint && pnpm test && py -3 -m unittest discover -s tests -p "test_*.py"` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run targeted Python `unittest` or Vitest test file for the modified module
- **After every plan wave:** Run `pnpm typecheck && pnpm lint && pnpm test && py -3 -m unittest discover -s tests -p "test_*.py"`
- **Before `/gsd-verify-work`:** Full suite must be green + `pnpm build` clean
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 23-01-01 | 01 | 1 | LYRICS-01 | T-23-01 | Path-safe `.lrc` filename sanitization & `track_id` traversal guard; `[-10000, 10000]` offset clamping | unit | `py -3 -m unittest tests/test_lyrics_2.py -v` | ❌ W0 | ⬜ pending |
| 23-02-01 | 02 | 1 | LYRICS-02 | T-23-02 | Pure-Python CJK romanization + `romalrc` preservation without C-extensions | unit | `py -3 -m unittest tests/test_romanize.py -v` | ❌ W0 | ⬜ pending |
| 23-03-01 | 03 | 2 | LYRICS-01 / LYRICS-02 | — | `LyricsTab` nudge toolbar, `Romanize` toggle, `(Cached)` badge, `DeckifyOverlay` `trackLyricsOffsetMs` subtraction | unit | `pnpm test -- --run src/components/DeckifyOverlay.test.tsx src/components/tabs/LyricsTab.test.tsx` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/test_lyrics_2.py` — covers `.lrc` cache, `lyrics_offsets.json`, `clear_lyrics_cache` RPC, and `get_lyrics` backward compatibility
- [ ] `tests/test_romanize.py` — covers Hangul RR, Japanese Kana/Kanji Romaji, Chinese Pinyin, song-level script detection, and NetEase `romalrc` alignment
- [ ] `src/components/tabs/LyricsTab.test.tsx` — covers nudge controls, `Romanize` toggle, dual-line/romanized-only styles, and `(Cached)` source badge

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Steam Deck GamepadUI D-pad focus navigation on `LyricsTab` toolbar & `X`/`Y` quick nudge in modal | LYRICS-01, LYRICS-02 | Requires SteamOS GamepadUI CEF spatial navigation runtime | Open Lyrics tab on Steam Deck, navigate toolbar with D-pad, press `X`/`Y` to nudge, verify `DeckifyOverlay` updates live |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
