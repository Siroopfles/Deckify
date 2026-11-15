---
phase: "10"
slug: "in-game-hud-overlay-2-0-live-synced-lyrics"
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-15"
updated: "2026-11-15"
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.1.0 + Python `unittest` |
| **Config file** | `vitest.config.ts` / `package.json` |
| **Quick run command** | `npx vitest run src/components/DeckifyOverlay.test.tsx && pnpm run typecheck` |
| **Full suite command** | `npx vitest run && py -3 -m unittest discover -s tests -p "test_*.py" && pnpm run lint` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/components/DeckifyOverlay.test.tsx && pnpm run typecheck`
- **After every plan wave:** Run `npx vitest run && py -3 -m unittest discover -s tests -p "test_*.py" && pnpm run lint`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | HUD-03, HUD-04 | T-10-01 | Lyric strings rendered via JSX interpolation, timers clamped | unit | `npx vitest run src/components/DeckifyOverlay.test.tsx` | ✅ | ✅ green |
| 10-02-01 | 02 | 1 | HUD-03 | T-10-02 | Settings clamped in `py_modules/common.py` and `main.py:set_setting` | unit | `py -3 -m unittest tests/test_e2e_requirements.py` | ✅ | ✅ green |
| 10-02-02 | 02 | 2 | HUD-03, HUD-04 | T-10-02 | QAM, SettingsTab, LyricsTab controls and modal suppression | unit | `npx vitest run src/components/tabs/SettingsTab.test.tsx src/index.test.tsx` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| In-game Gamescope overlay visual cross-fade and 60/90 FPS smoothness | HUD-03, HUD-04 | Requires SteamOS Gamescope compositor | Launch game on Steam Deck with overlay + overlay lyrics enabled and verify smooth lyric transitions with no frame drops or touch/gamepad interception. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 20s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated
