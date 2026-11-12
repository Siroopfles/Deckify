---
phase: "05"
slug: "in-game-hud-overlay-restoration"
status: draft
nyquist_compliant: true
wave_0_complete: false
created: "2026-11-11"
---

# Phase 05 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.1.0 (frontend) + Python `unittest` standard library (backend) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `cmd.exe /c "pnpm test"` |
| **Full suite command** | `cmd.exe /c "pnpm test && pnpm typecheck && pnpm build && py -3 -m unittest discover -s tests -p \"test_*.py\""` |
| **Estimated runtime** | ~20 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command (`cmd.exe /c "pnpm test"`)
- **After every plan wave:** Run full suite command
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 25 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | HUD-01 | T-05-02 | Backend HUD settings schema, RPC validation, and E2E test assertions for overlay options | integration | `cmd.exe /c "py -3 -m unittest tests.test_e2e_requirements"` | ✅ | ⬜ pending |
| 05-01-02 | 01 | 1 | HUD-01, HUD-02 | T-05-01 | Upgrade DeckifyOverlay with auto-hide timer, pause delay, 2px progress bar, and Vitest test suite | unit (Vitest) | `cmd.exe /c "pnpm test src/components/DeckifyOverlay.test.tsx"` | ❌ W0 | ⬜ pending |
| 05-01-03 | 01 | 1 | HUD-01, HUD-02 | T-05-03 | Dual-signal DeckifyOverlayWrapper concurrent polling, QAM direct controls, and SettingsTab controls | UI / integration | `cmd.exe /c "pnpm test && pnpm typecheck && pnpm build && py -3 -m unittest discover tests -p test_*.py"` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/components/DeckifyOverlay.test.tsx` — covers HUD-01 (visibility toggle, auto-hide timer after 6s) and HUD-02 (artwork rendering via DeckifyImage, play/pause indicator, 3.5s pause grace period, optional 2px progress bar).
- [ ] Backend unit test in `tests/test_e2e_requirements.py` validating `overlay_autohide` and `overlay_show_progress` settings persistence.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Gamescope in-game HUD rendering & click-through | HUD-01 | SteamOS Gamescope compositor & pointer-events | Launch a game on Steam Deck, start playback, verify HUD appears in configured corner, verify gamescope input passes through to game without click-interception |
| Smooth CSS opacity transitions | HUD-01, HUD-02 | Visual rendering smoothness | Pause playback while gaming, verify overlay displays pause icon for ~3.5s then smoothly fades out over 0.25s |
