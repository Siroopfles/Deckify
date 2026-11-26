---
phase: "28"
slug: "cdp-offline-downloads-wi-fi-travel-mode-living-room-spotify"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-26"
---

# Phase 28 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest `5.1.0` (Frontend) + Python `unittest` (Backend) |
| **Config file** | `package.json` (`test`, `test:python`) |
| **Quick run command** | `py -3 -m unittest tests/test_cdp_bridge.py -q` / `pnpm test -- --run src/utils.test.ts` |
| **Full suite command** | `pnpm test -- --run && py -3 -m unittest discover -s tests -p "test_*.py"` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run targeted `py -3 -m unittest tests/test_<module>.py -q` or `pnpm test -- --run <file>`
- **After every plan wave:** Run `pnpm lint && pnpm typecheck && pnpm test -- --run && py -3 -m unittest discover -s tests -p "test_*.py"`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 28-01-01 | 01 | 1 | CDP-01 | T-28-01 | `os.statvfs` disk guardrail + path validation (`flatpak override`) | unit | `py -3 -m unittest tests/test_offline_downloads.py -q` | ❌ W0 | ⬜ pending |
| 28-02-01 | 02 | 1 | CDP-02 | — | 10s wake-from-suspend grace window + sticky manual vs auto Travel Mode | unit | `py -3 -m unittest tests/test_travel_mode.py -q` | ❌ W0 | ⬜ pending |
| 28-03-01 | 03 | 1 | JAM-01 | — | `SocialConnectAPI` Jam CDP start/status/end + deep-link fallback | unit | `py -3 -m unittest tests/test_cdp_bridge.py -q` | ✅ | ⬜ pending |
| 28-04-01 | 04 | 2 | JAM-01 | — | `<JamQrModal>` / `<JamQrCard>` white quiet-zone QR + `vgp_oncancel` restore | unit | `pnpm test -- --run src/components/common/JamQrModal.test.tsx` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/test_offline_downloads.py` — covers `CDP-01` (`OfflineAPI` probes, `os.statvfs` guardrail, storage path override)
- [ ] `tests/test_travel_mode.py` — covers `CDP-02` (10s wake grace window, sticky manual vs auto exit, offline filtering)
- [ ] `src/components/common/JamQrModal.test.tsx` — covers `JAM-01` (`JamQrCard`/`JamQrModal` rendering, `librespot` deep-link fallback, `vgp_oncancel` focus restore)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live SteamOS `com.spotify.Client` Flatpak `OfflineAPI` & `SocialConnectAPI` CDP calls | CDP-01, JAM-01 | Requires running SteamOS Flatpak Spotify Desktop Client with `--remote-debugging-port=9229` | Deploy to Steam Deck, switch to Official Spotify Client, toggle Download for Offline on a playlist, verify `↓ %` progress & green `✓` badge; open Start Spotify Jam and scan QR with phone. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
