---
phase: "04"
slug: "queue-navigation-live-state-synchronization"
status: draft
nyquist_compliant: true
wave_0_complete: false
created: "2026-11-11"
---

# Phase 04 — Validation Strategy

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
| 04-01-01 | 01 | 0 | QUEUE-01 | T-04-01 | Unit test suite covering queue slicing, RPC URI formatting, and play_track alias | unit (Vitest & Python) | `cmd.exe /c "pnpm test && py -3 -m unittest tests.test_plugin_api"` | ❌ W0 | ⬜ pending |
| 04-01-02 | 01 | 1 | QUEUE-01 | T-04-01 | Fix RPC binding (`play_tracks` in frontend + `play_track` alias in backend) & explicit URI sequence | integration / unit | `cmd.exe /c "pnpm test && py -3 -m unittest tests.test_plugin_api"` | ✅ | ⬜ pending |
| 04-01-03 | 01 | 2 | QUEUE-01, QUEUE-02 | T-04-02 | Upgrade QueueTab with Now Playing card, upcoming list, optimistic UI & 600ms resync | UI / integration | `cmd.exe /c "pnpm test && pnpm typecheck && pnpm build"` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/components/tabs/QueueTab.test.tsx` — covers QUEUE-01 (click track $N$ triggers `play_tracks` with remaining sliced URIs) and QUEUE-02 (optimistic UI update).
- [ ] Backend test in `tests/test_plugin_api.py` verifying `play_track` alias dispatches to `play_tracks`.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Gamepad focus retention upon queue item click | QUEUE-01, QUEUE-02 | SteamOS GamepadUI spatial navigation | Open Queue tab with Steam Deck controller, D-pad down to track 3, press A button to play, verify focus stays on upcoming queue items without jumping to modal sidebar |
| Dedicated Now Playing card visuals | QUEUE-02 | SteamOS CEF visual rendering | Verify Now Playing card appears pinned above queue with album cover, green playing indicator, and track details |
