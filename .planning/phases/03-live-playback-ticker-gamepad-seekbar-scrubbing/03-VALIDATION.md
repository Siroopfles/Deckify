---
phase: "03"
slug: "live-playback-ticker-gamepad-seekbar-scrubbing"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-11"
---

# Phase 03 — Validation Strategy

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
| 03-01-01 | 01 | 0 | PLAY-01, PLAY-02, PLAY-03 | T-03-01 | Unit test harness stubs for monotonic clock, drift tolerance & debounced seek | unit | `cmd.exe /c "pnpm test"` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | PLAY-01, PLAY-02 | T-03-01, T-03-02 | Pure playback clock hook with drift threshold, 300ms debounced seek & race suppression | unit | `cmd.exe /c "pnpm test"` | ✅ | ⬜ pending |
| 03-01-03 | 01 | 2 | PLAY-02, PLAY-03 | T-03-01 | Wire shared clock into NowPlayingTab seekbar with D-pad focus & QAM mini-player | unit / integration | `cmd.exe /c "pnpm test && pnpm typecheck && pnpm build"` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/hooks/usePlaybackClock.test.ts` — covers PLAY-01, PLAY-02, PLAY-03, D-01 (drift tolerance <=1200ms), D-04 (300ms debounced seek), and D-05 (1500ms post-seek suppression window) with fake timers.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Gamepad D-pad seekbar focus & visual scrub | PLAY-02, PLAY-03 | SteamOS GamepadUI spatial navigation & focus halo | Open expanded modal Now Playing tab with controller, D-pad down to focus progress bar, verify visible focus ring, press D-pad Left/Right to scrub smoothly |
