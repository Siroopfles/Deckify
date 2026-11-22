---
status: complete
phase: 23-lyrics-2-0-offline-lrc-cache-per-track-sync-nudge-cjk-romani
source: 23-01-SUMMARY.md, 23-02-SUMMARY.md, 23-03-SUMMARY.md, 23-04-SUMMARY.md
started: 2026-11-22T19:36:00+01:00
updated: 2026-11-22T18:45:16.714Z
---

## Current Test

[testing complete]

## Tests

### 1. Human-readable .lrc disk cache under ~/.cache/deckify/lyrics/ with cache-first hits, force_refresh bypass, no negative caching, and path traversal guard
expected: Human-readable .lrc disk cache under ~/.cache/deckify/lyrics/ with cache-first hits, force_refresh bypass, no negative caching, and path traversal guard
result: pass
source: automated
coverage_id: D1

### 2. Atomic per-track sync offset persistence in ~/.config/deckify/lyrics_offsets.json clamped to [-10000, 10000]ms with 0ms pruning and lyrics_offset_changed event broadcast
expected: Atomic per-track sync offset persistence in ~/.config/deckify/lyrics_offsets.json clamped to [-10000, 10000]ms with 0ms pruning and lyrics_offset_changed event broadcast
result: pass
source: automated
coverage_id: D2

### 3. Romanization settings (romanize_lyrics_enabled, romanize_display_style, romanize_overlay_enabled) persisted and validated in common.py and main.py
expected: Romanization settings (romanize_lyrics_enabled, romanize_display_style, romanize_overlay_enabled) persisted and validated in common.py and main.py
result: pass
source: automated
coverage_id: D3

### 4. Zero-dependency pure-Python CJK lookup tables for Hiragana, Katakana, Hangul RR, common Kanji, and common Hanzi
expected: Zero-dependency pure-Python CJK lookup tables for Hiragana, Katakana, Hangul RR, common Kanji, and common Hanzi
result: pass
source: automated
coverage_id: D1

### 5. Pure-Python CJK romanizer (Korean RR with liaison, Japanese Kana/Kanji Hepburn, Chinese Pinyin, CJK-only filter) and NetEase romalrc aligner
expected: Pure-Python CJK romanizer (Korean RR with liaison, Japanese Kana/Kanji Hepburn, Chinese Pinyin, CJK-only filter) and NetEase romalrc aligner
result: pass
source: automated
coverage_id: D2

### 6. NetEase &rv=-1 romalrc extraction, [deckify-romalrc:] .lrc persistence, and romanize.py enrichment in _fetch_lyrics_sync
expected: NetEase &rv=-1 romalrc extraction, [deckify-romalrc:] .lrc persistence, and romanize.py enrichment in _fetch_lyrics_sync
result: pass
source: automated
coverage_id: D1

### 7. DeckifyOverlay clamped trackLyricsOffsetMs scheduling (-10000..10000ms) and dual/romanized_only HUD rendering
expected: DeckifyOverlay clamped trackLyricsOffsetMs scheduling (-10000..10000ms) and dual/romanized_only HUD rendering
result: pass
source: automated
coverage_id: D2

### 8. DeckifyOverlayWrapper lyrics_offset_changed subscription and track_id-aware get_lyrics wiring in src/index.tsx
expected: DeckifyOverlayWrapper lyrics_offset_changed subscription and track_id-aware get_lyrics wiring in src/index.tsx
result: pass
source: automated
coverage_id: D3

### 9. LyricsTab displays Source: {name} (Cached) badge, horizontal [-0.5s]/offset/[+0.5s]/[Reset]/[Romanize] toolbar, and dual-line/romanized-only CJK rendering
expected: LyricsTab displays Source: {name} (Cached) badge, horizontal [-0.5s]/offset/[+0.5s]/[Reset]/[Romanize] toolbar, and dual-line/romanized-only CJK rendering
result: pass
source: automated
coverage_id: D1

### 10. DeckifyExpandedModal wires track_id/force_refresh lyrics fetch, offline fallback toast guard, X/Y quick nudge shortcuts, and live offset state
expected: DeckifyExpandedModal wires track_id/force_refresh lyrics fetch, offline fallback toast guard, X/Y quick nudge shortcuts, and live offset state
result: pass
source: automated
coverage_id: D2

### 11. SettingsTab exposes Romanize CJK Lyrics toggle, Romanization Display selector, Romanize In-Game Overlay toggle, and Clear Lyrics Cache DialogButton
expected: SettingsTab exposes Romanize CJK Lyrics toggle, Romanization Display selector, Romanize In-Game Overlay toggle, and Clear Lyrics Cache DialogButton
result: pass
source: automated
coverage_id: D3

### 12. Confirm Auto-Covered Phase 23 Deliverables
expected: |
  All 11 Phase 23 deliverables are covered by passing automated unit tests:
  - 23-01 D1: .lrc disk cache (tests/test_lyrics_2.py#Lyrics2CacheAndOffsetsTests, tests/test_py_modules.py#PyModulesSpotifyTests)
  - 23-01 D2: Per-track sync offsets & event (tests/test_lyrics_2.py#test_lyrics_offsets_atomic_clamp_and_prune)
  - 23-01 D3: Romanization settings (tests/test_lyrics_2.py#test_romanize_settings_defaults_and_validation)
  - 23-02 D1: Pure-Python CJK lookup tables (py -3 -c "from py_modules import cjk_tables; ...")
  - 23-02 D2: Pure-Python CJK romanizer & NetEase romalrc aligner (tests/test_romanize.py#RomanizeTests)
  - 23-03 D1: NetEase &rv=-1 romalrc & .lrc enrichment (tests/test_lyrics_2.py#test_netease_romalrc_persistence_and_enrichment)
  - 23-03 D2: DeckifyOverlay live offset & romanized HUD (src/components/DeckifyOverlay.test.tsx)
  - 23-03 D3: DeckifyOverlayWrapper event & track_id wiring (src/index.test.tsx)
  - 23-04 D1: LyricsTab cached badge, nudge/romanize toolbar, CJK dual-line (src/components/tabs/LyricsTab.test.tsx#LyricsTab)
  - 23-04 D2: DeckifyExpandedModal offline guard & X/Y shortcuts (src/components/DeckifyExpandedModal.test.tsx)
  - 23-04 D3: SettingsTab romanization & Clear Lyrics Cache controls (src/components/tabs/SettingsTab.test.tsx)
  Confirm these automated results or describe any issue you observed on the Steam Deck.
result: issue
reported: "1. Geen idee kan jij dit checken voor me op de Steam machine? 2. Vgm werkt dat wel 3. Ik zie ze maar geen idee of ze werken want heb een nummer nodig waar ik dit op kan testen 4. Geen idee zelfde als vij 3 5. Heb een nummer nodig om te testen dus geen idee? 6. Ja zie het allemaal Alleen wat bedoel je met sneltoetsen X en Y ik zie ze namelijk in de onderste bar staan als like en options maar als ik ze indruk doen ze andere dingen"
severity: major

## Summary

total: 12
passed: 11
issues: 1
pending: 0
skipped: 0

## Gaps

- gap_id: G-23-12
  truth: "X and Y controller shortcuts and bottom action bar labels in Lyrics mode are consistent and behave as documented"
  status: failed
  reason: "User reported: Alleen wat bedoel je met sneltoetsen X en Y ik zie ze namelijk in de onderste bar staan als like en options maar als ik ze indruk doen ze andere dingen"
  severity: major
  test: 12
  artifacts: []
  missing: []
