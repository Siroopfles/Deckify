---
phase: "17"
slug: "event-driven-librespot-suspend-wi-fi-resilience"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-17"
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Python `unittest` (stdlib) + Vitest 5.1.0 |
| **Config file** | `package.json` / `vitest` (frontend); stdlib `unittest` (backend) |
| **Quick run command** | `py -3 -m unittest tests/test_resilience.py -v` |
| **Full suite command** | `pnpm test -- --run && py -3 -m unittest discover -s tests -p "test_*.py"` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `py -3 -m unittest tests/test_resilience.py -v` and/or `pnpm test -- --run`
- **After every plan wave:** Run `pnpm test -- --run && py -3 -m unittest discover -s tests -p "test_*.py"`
- **Before `/gsd-verify-work`:** Full suite + `pnpm typecheck` + `pnpm lint` must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 17-01-01 | 01 | 1 | RESIL-01 | T-17-01 | Unix socket under runtime dir (`0o600`/`0o660`), no shell eval, clamped int fields | unit | `py -3 -m unittest tests/test_resilience.py -v` | ❌ W0 | ⬜ pending |
| 17-01-02 | 01 | 1 | RESIL-02 | T-17-02 | Atomic `session_bookmark.json` write via `os.replace()` + corrupt JSON fallback | unit | `py -3 -m unittest tests/test_resilience.py -v` | ❌ W0 | ⬜ pending |
| 17-02-01 | 02 | 2 | RESIL-01, RESIL-02 | — | Frontend `usePlaybackStatus`, QAM, SettingsTab, and Overlay react to `librespot_event` and resilience settings | unit | `pnpm test -- --run src/index.test.tsx src/components/tabs/SettingsTab.test.tsx && pnpm typecheck && pnpm lint` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/test_resilience.py` — covers `RESIL-01` and `RESIL-02` backend logic (`LibrespotEventServer`, Base16→Base62, adaptive polling, `SessionBookmarkManager`, wake lock, Wi-Fi grace window, conflict yield, expiry).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `librespot --onevent` POSIX emitter on Steam Deck hardware | RESIL-01 | `librespot` binary + `socat`/`nc` + SteamOS runtime not present on Windows dev host | Deploy to Steam Deck, play/skip/pause/seek in Spotify, verify instant QAM/Modal/HUD updates and relaxed 20s poll in logs |
| Steam Deck `PrepareForSleep` suspend/wake & Wi-Fi toggle recovery | RESIL-02 | Requires SteamOS `systemd-logind` D-Bus + NetworkManager + live Spotify Connect | Suspend Steam Deck while playing, wake after 10s, verify bookmark restoration without dual-restart race |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
