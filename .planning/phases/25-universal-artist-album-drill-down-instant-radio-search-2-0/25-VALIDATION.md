---
phase: "25"
slug: "universal-artist-album-drill-down-instant-radio-search-2-0"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-23"
---

# Phase 25 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Python `unittest` (3.14.0 stdlib) + Vitest 5.1.0 + `tsc --noEmit` + ESLint 10.0.1 |
| **Config file** | `package.json`, `tsconfig.json`, `eslint.config.js` |
| **Quick run command** | `py -3 -m unittest tests.test_phase25_radio_search -v` / `pnpm test -- --run src/components/DeckifyExpandedModal.test.tsx src/components/tabs/SearchTab.test.tsx` |
| **Full suite command** | `py -3 -m unittest discover -s tests -p "test_*.py" -q && pnpm test -- --run && pnpm typecheck` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Targeted Python (`tests.test_phase25_radio_search`) or Vitest file + `pnpm typecheck` + `pnpm exec eslint --max-warnings=0 <modified files>`
- **After every plan wave:** `py -3 -m unittest discover -s tests -p "test_*.py" -q && pnpm test -- --run`
- **Before `/gsd-verify-work`:** Full Python suite + full Vitest suite + `pnpm typecheck` + `pnpm exec eslint src/` + `pnpm build` green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 25-01-01 | 01 | 1 | RADIO-01 | T-25-01 / — | `start_radio` 3-tier waterfall (CDP stub -> Web API recs -> Top-Tracks/Search synthesis), `play_tracks` queue replacement, URL-encoded `seed_id`/`artist_id` | unit (Python) | `py -3 -m unittest tests.test_phase25_radio_search -v` | ❌ W0 | ⬜ pending |
| 25-01-02 | 01 | 1 | RADIO-01 | T-25-01 / — | `get_artist_all_tracks` discography pagination & `get_artist_info` | unit (Python) | `py -3 -m unittest tests.test_phase25_radio_search -v` | ❌ W0 | ⬜ pending |
| 25-01-03 | 01 | 1 | SEARCH-01, SEARCH-02 | T-25-02 / — | `search_history` persistence in `DEFAULT_SETTINGS`/`set_setting` (max 10, length-capped) & `search_spotify` `show`/`episode` parsing with `market="from_token"` and `resume_point` | unit (Python) | `py -3 -m unittest tests.test_phase25_radio_search -v` | ❌ W0 | ⬜ pending |
| 25-02-01 | 02 | 2 | RADIO-01 | — | `navigationHistoryRef` push/pop on `B`, cap at 10, `scrollTop` & focus restoration, `TrackActionModal` / `NowPlayingTab` / `QueueTab` / `SearchTab` actions | unit (Vitest) | `pnpm test -- --run src/components/DeckifyExpandedModal.test.tsx` | ✅ (extend) | ⬜ pending |
| 25-03-01 | 03 | 2 | SEARCH-01, SEARCH-02 | — | `SearchTab` idle screen (10 history pills + 12 Gaming & Mood tiles, Playlists-first), 7 filter chips (`All`, `Tracks`, `Artists`, `Albums`, `Playlists`, `Podcasts`, `Episodes`), `EpisodeRow` progress/Played badges, `onOpenShow` | unit (Vitest) | `pnpm test -- --run src/components/tabs/SearchTab.test.tsx` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/test_phase25_radio_search.py` — covers `start_radio` 3-tier waterfall, `get_artist_all_tracks`, `search_spotify` (`show`/`episode`), and `search_history` settings validation (`RADIO-01`, `SEARCH-01`, `SEARCH-02`).
- [ ] `src/components/tabs/SearchTab.test.tsx` — covers Search 2.0 idle screen (history pills + 12 Gaming & Mood tiles), Playlists-first tile results, 7 filter chips, `EpisodeRow` rendering, and `onOpenShow` (`SEARCH-01`, `SEARCH-02`).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SteamOS GamepadUI `B`-button backstack focus & scroll restoration across tabs | RADIO-01 | Requires live GamepadUI spatial navigation and scroll container | Open Deckify modal on Steam Deck, navigate to a track in `NowPlayingTab`/`QueueTab`/`SearchTab`, select *Go to Artist* -> *Albums* -> *Go to Album*, press `B` repeatedly and verify originating tab, scroll position, and focused row are restored |
| Search 2.0 12 Gaming & Mood tiles D-pad navigation without virtual keyboard | SEARCH-01 | Requires SteamOS GamepadUI virtual keyboard focus behavior | Open `SearchTab` with empty query on Steam Deck, navigate history pills and 12 Gaming & Mood tiles with D-pad, verify virtual keyboard never opens and selecting a tile shows Playlists first |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
