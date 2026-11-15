---
phase: "08"
slug: "controller-l2-r2-ergonomics-trigger-navigation"
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-14"
updated: "2026-11-15"
---

# Phase 08 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest `5.1.0` (frontend) & Python `unittest` (backend) |
| **Config file** | `package.json` (`test`, `typecheck`, `lint`, `test:python`) |
| **Quick run command** | `pnpm test --run` |
| **Full suite command** | `pnpm test --run && pnpm typecheck && py -m unittest discover -s tests -p "test_*.py"` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test --run && pnpm typecheck`
- **After every plan wave:** Run `pnpm test --run && pnpm typecheck && py -m unittest discover -s tests -p "test_*.py"`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 1 | CTRL-03 | T-08-01 | Hysteresis & debounce prevent runaway RPCs | unit | `pnpm test --run src/utils/triggerController.test.ts` | ✅ | ✅ green |
| 08-01-02 | 01 | 1 | CTRL-03 | T-08-02 | Modal-scoped listener cleanup on unmount | unit | `pnpm test --run src/components/DeckifyExpandedModal.test.tsx` | ✅ | ✅ green |
| 08-01-03 | 01 | 1 | Sidebar | — | Pinned `Back to Steam (B)` footer outside scroll list | unit | `pnpm test --run src/components/common/Sidebar.test.tsx` | ✅ | ✅ green |
| 08-02-01 | 02 | 2 | CTRL-01 | T-08-03 | Clamp seek target to `[0, duration_ms - 1000]` | unit | `pnpm test --run src/components/DeckifyExpandedModal.test.tsx` | ✅ | ✅ green |
| 08-02-02 | 02 | 2 | Settings | T-08-04 | Clamp `trigger_seek_seconds` (5–30) & `trigger_page_size` (5–50) | unit | `pnpm test --run src/components/tabs/SettingsTab.test.tsx && py -m unittest tests/test_py_modules.py` | ✅ | ✅ green |
| 08-03-01 | 03 | 3 | CTRL-02 | T-08-05 | ±N paging & A–Z anchor jumps with content-focus guard | unit | `pnpm test --run src/utils/listNavigation.test.ts src/components/DeckifyExpandedModal.test.tsx` | ✅ | ✅ green |
| 08-03-02 | 03 | 3 | CTRL-02 | — | Tag Playlists, Albums, Artists, Podcasts rows & A–Z container | typecheck | `pnpm typecheck` | ✅ | ✅ green |
| 08-03-03 | 03 | 3 | CTRL-02 | — | Tag Search, Queue, Soundtracks rows & A–Z container | unit | `pnpm test --run src/components/tabs/QueueTab.test.tsx && pnpm typecheck` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `src/utils/triggerController.test.ts` — stubs for CTRL-03 Schmidt hysteresis, 300ms debounce, chatter rejection, hold-to-repeat
- [x] `src/utils/listNavigation.test.ts` — stubs for CTRL-02 ±N paging, A–Z anchor jumps, short lists, boundary clamping
- [x] `src/components/common/Sidebar.test.tsx` — stubs for pinned `Back to Steam (B)` footer structure

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SteamOS GamepadUI analog trigger pull (L2/R2) & Y/X modal buttons | CTRL-01, CTRL-02, CTRL-03 | Requires physical Steam Deck `FocusNavController` & `navigator.getGamepads()` hardware events | Deploy to Steam Deck, open Deckify modal, test L2/R2 in Now Playing, Lyrics, Liked Songs, Artists, and verify no trigger action fires when modal is closed. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated
