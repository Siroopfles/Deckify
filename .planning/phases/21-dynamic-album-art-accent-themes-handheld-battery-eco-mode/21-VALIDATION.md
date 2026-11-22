---
phase: "21"
slug: "dynamic-album-art-accent-themes-handheld-battery-eco-mode"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-22"
---

# Phase 21 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.1.0 (frontend) & Python `unittest` (backend) |
| **Config file** | `package.json` / `vitest.config.*` & `tests/test_*.py` |
| **Quick run command** | `pnpm test -- --run src/utils/accentTheme.test.ts` / `py -3 -m unittest discover -s tests -p "test_eco.py"` |
| **Full suite command** | `pnpm test -- --run && pnpm run typecheck && pnpm run lint && py -3 -m unittest discover -s tests -p "test_*.py"` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run relevant unit test file (`pnpm test -- --run <file>` or `py -3 -m unittest discover -s tests -p "test_eco.py"`)
- **After every plan wave:** Run `pnpm test -- --run && pnpm run typecheck && pnpm run lint && py -3 -m unittest discover -s tests -p "test_*.py"`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 21-01-01 | 01 | 1 | THEME-01 | T-21-01 | Only `data:image/` URIs sampled via `<canvas>` | unit | `pnpm test -- --run src/utils/accentTheme.test.ts` | ❌ W0 | ⬜ pending |
| 21-01-02 | 01 | 1 | THEME-01 | T-21-02 | `accent_theme` validated against enum allowlist | unit | `py -3 -m unittest discover -s tests -p "test_eco.py"` | ❌ W0 | ⬜ pending |
| 21-02-01 | 02 | 1 | ECO-01 | T-21-03 | Sysfs reads fixed paths with `OSError` guards | unit | `py -3 -m unittest discover -s tests -p "test_eco.py"` | ❌ W0 | ⬜ pending |
| 21-03-01 | 03 | 2 | THEME-01, ECO-01 | — | UI selectors and status badges render safely | unit | `pnpm test -- --run src/components/tabs/SettingsTab.test.tsx src/index.test.tsx` | ✅ (extend) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/utils/accentTheme.test.ts` — covers `THEME-01` canvas color extraction, HSL `L >= 55%` clamp, grayscale fallback, and preset resolution
- [ ] `tests/test_eco.py` — covers `ECO-01` sysfs parsing, Steam Machine safety, dock bypass, `animations_suspended`, idle pause sleep, `SleepTimer` interaction, and wake-on-play

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live Steam Deck battery discharge vs AC/docked transition & Gamescope overlay visual accent glow | THEME-01, ECO-01 | Requires physical Steam Deck hardware sysfs and Gamescope CEF compositor | Switch accent themes in SettingsTab with album art playing, verify focus halos & HUD glow; unplug AC on Steam Deck and verify Eco-Mode status badge and engine idle sleep |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
