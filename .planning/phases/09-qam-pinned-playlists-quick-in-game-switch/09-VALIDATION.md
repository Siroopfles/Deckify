---
phase: "09"
slug: "qam-pinned-playlists-quick-in-game-switch"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-14"
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest `5.1.0` (frontend) + Python `unittest` (backend) |
| **Config file** | `package.json` / `vitest` (`vitest run`) |
| **Quick run command** | `pnpm test` |
| **Full suite command** | `pnpm test && pnpm typecheck && py -m unittest discover -s tests -p "test_*.py"` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test`
- **After every plan wave:** Run `pnpm test && pnpm typecheck && py -m unittest discover -s tests -p "test_*.py"`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 09-01-01 | 01 | 1 | QAM-01 | T-09-01 | Validate `pinned_playlists` max-4 cap, `type` allowlist, and `image_url` domain allowlist | unit (Python) | `py -m unittest tests/test_pinned_playlists.py -v` | ❌ W0 | ⬜ pending |
| 09-01-02 | 01 | 1 | QAM-01 | T-09-02 | Render QAM pinned pills with `DeckifyImage` (CSP-safe base64) and `flow-children="horizontal"` | unit (Vitest) | `pnpm test -- --run src/index.test.tsx` | ✅ | ⬜ pending |
| 09-02-01 | 02 | 2 | QAM-02 | T-09-03 | `quick_play_pinned` wakes stopped engine, plays playlist/album/liked_songs without forcing shuffle | unit (Python) | `py -m unittest tests/test_pinned_playlists.py -v` | ❌ W0 | ⬜ pending |
| 09-02-02 | 02 | 2 | QAM-01, QAM-02 | — | Pin/Unpin in library views (max-4 toast without eviction) + optimistic active pill highlight & rollback on error | unit (Vitest) | `pnpm test -- --run src/index.test.tsx src/components/DeckifyExpandedModal.test.tsx` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/test_pinned_playlists.py` — covers `pinned_playlists` settings validation/max-4 cap and `quick_play_pinned` engine wake + playlist/album/liked_songs playback.
- [ ] Extend `src/index.test.tsx` and `src/components/DeckifyExpandedModal.test.tsx` for QAM pill strip, collapsible secondary controls, `Bind` button focus fix, and Pin/Unpin UI flows.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real-device SteamOS GamepadUI D-pad navigation & < 2s cold-start switch | QAM-01, QAM-02 | Requires live SteamOS GamepadUI CEF and Spotify Connect `librespot` daemon on Steam Deck hardware | Deploy to Steam Deck, open QAM while in-game, navigate pills with D-pad, press A on pinned pill with stopped engine, verify playback starts < 2s and `Bind` button shows focus ring |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
