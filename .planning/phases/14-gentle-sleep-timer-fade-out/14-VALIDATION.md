---
phase: "14"
slug: "gentle-sleep-timer-fade-out"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-16"
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Python `unittest` (`IsolatedAsyncioTestCase`) + Vitest `5.1.0` |
| **Config file** | `vitest.config.ts` / `package.json` |
| **Quick run command** | `py -3 -m unittest discover -s tests -p "test_volume.py" && py -3 -m unittest discover -s tests -p "test_features.py"` |
| **Full suite command** | `py -3 -m unittest discover -s tests -p "test_*.py" && pnpm test && pnpm run typecheck && pnpm run lint` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run targeted suite (`test_volume.py`, `test_features.py`, or `SettingsTab.test.tsx`)
- **After every plan wave:** Run full Python + Vitest + typecheck + lint suite
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 14-01-01 | 01 | 1 | SLEEP-01 | T-14-01 | `VolumeFader` `"sleep"` priority lock blocks `set_ducking` fades while tracking `_duck_reasons` | unit | `py -3 -m unittest discover -s tests -p "test_volume.py"` | ✅ | ⬜ pending |
| 14-01-02 | 01 | 1 | SLEEP-01 | T-14-02 | `sleep_timer_worker` fades at `T - fade_duration`, pauses at 0%, drains, restores baseline before `shutdown_system` | unit | `py -3 -m unittest discover -s tests -p "test_features.py"` | ✅ | ⬜ pending |
| 14-02-01 | 02 | 2 | SLEEP-01 | T-14-03 | `sleep_timer_fade_enabled` coerced to bool and `sleep_timer_fade_duration` clamped `5–120` | unit | `py -3 -m unittest discover -s tests -p "test_features.py"` | ✅ | ⬜ pending |
| 14-02-02 | 02 | 2 | SLEEP-01 | — | `SettingsTab` renders Fade Out toggle + slider (`5–120`, step `5`) and `"Fading out..."` status | unit | `pnpm test -- --run src/components/tabs/SettingsTab.test.tsx` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real PipeWire stream drain & non-zero restore before SteamOS poweroff | SLEEP-01 | Requires live SteamOS PipeWire `module-stream-restore` and `librespot` audio sink | Set 1m sleep timer with 15s fade-out on Steam Deck; confirm smooth fade to 0%, pause, and next-session volume restored to baseline |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
