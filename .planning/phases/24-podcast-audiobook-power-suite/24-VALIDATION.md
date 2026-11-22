---
phase: "24"
slug: "podcast-audiobook-power-suite"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-22"
---

# Phase 24 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Python `unittest` (3.14.0 stdlib) + Vitest 5.1.0 + `tsc --noEmit` + ESLint 10.0.1 |
| **Config file** | `package.json`, `tsconfig.json`, `eslint.config.js` |
| **Quick run command** | `py -3 -m unittest discover -s tests -p "test_podcast_suite.py" -q` / `pnpm test -- --run src/hooks/usePlaybackClock.test.ts src/components/tabs/PodcastsTab.test.tsx src/components/tabs/NowPlayingTab.test.tsx` |
| **Full suite command** | `py -3 -m unittest discover -s tests -p "test_*.py" -q` && `pnpm test -- --run` && `pnpm typecheck` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Targeted Python (`test_podcast_suite.py`) or Vitest file + `pnpm typecheck` + `pnpm exec eslint --max-warnings=0 <modified files>`
- **After every plan wave:** `py -3 -m unittest discover -s tests -p "test_*.py" -q` && `pnpm test -- --run`
- **Before `/gsd-verify-work`:** Full Python suite + full Vitest suite + `pnpm typecheck` + `pnpm exec eslint src/` green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 24-01-01 | 01 | 1 | POD-01, POD-02 | T-24-01 / — | `set_playback_speed` validates whitelist `{0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0}`, `spotify_client` CDP `setSpeed`, `librespot` fallback, music auto-reset & podcast speed restore, `get_show_episodes`, `SPOTIFY_SCOPES` | unit (Python) | `py -3 -m unittest discover -s tests -p "test_podcast_suite.py" -q` | ❌ W0 | ⬜ pending |
| 24-02-01 | 02 | 1 | POD-01 | — | `usePlaybackClock` `playbackSpeed` scaling & re-anchor on speed change | unit (TS) | `pnpm test -- --run src/hooks/usePlaybackClock.test.ts` | ✅ | ⬜ pending |
| 24-03-01 | 03 | 2 | POD-01 | — | `NowPlayingTab` speed `Dropdown` (`0.5x`–`2.0x`) & `-15s`/`+15s` transport replacement, `DeckifyExpandedModal` L2/R2 15s smart-skip, QAM cycle pill | unit (TS) | `pnpm test -- --run src/components/tabs/NowPlayingTab.test.tsx src/components/DeckifyExpandedModal.test.tsx src/index.test.tsx` | ❌ W0 (`NowPlayingTab.test.tsx`) | ⬜ pending |
| 24-04-01 | 04 | 2 | POD-02 | — | `PodcastsTab` show drill-down, bottom green progress bar, `"Played"` / `"Xm left"` badges, *All*/*Unplayed*/*In Progress* filter pills | unit (TS) | `pnpm test -- --run src/components/tabs/PodcastsTab.test.tsx` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/test_podcast_suite.py` — stubs for `POD-01` & `POD-02` backend (`set_playback_speed`, CDP `PlayerAPI.setSpeed`, `librespot` fallback, music auto-reset/restore, `get_show_episodes`, `SPOTIFY_SCOPES`)
- [ ] `src/components/tabs/NowPlayingTab.test.tsx` — covers speed `Dropdown` (`0.5x`–`2.0x`) and `-15s`/`+15s` transport replacement
- [ ] `src/components/tabs/PodcastsTab.test.tsx` — covers show drill-down, bottom green progress bars, `"Played"` / `"Xm left"` badges, and *All*/*Unplayed*/*In Progress* filter pills

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real `spotify_client` CDP `PlayerAPI.setSpeed` audio pitch/rate on Steam Deck | POD-01 | Requires live Spotify Desktop/Client CEF runtime with audio sink | Play a podcast episode on Steam Deck with `spotify_client` engine, cycle speed `0.5x`–`2.0x` in `NowPlayingTab` and QAM, verify audible speed change and `1.0x` reset on music track |
| SteamOS GamepadUI D-pad horizontal navigation on `PodcastsTab` filter pills | POD-02 | Requires GamepadUI spatial navigation engine | Open `PodcastsTab` on Steam Deck, press D-pad Left/Right across *All* / *Unplayed* / *In Progress* pills |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
