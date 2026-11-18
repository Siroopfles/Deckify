---
phase: "18"
slug: "mpris2-d-bus-bridge"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-18"
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Python `unittest` (`IsolatedAsyncioTestCase`) + Vitest 5.1.0 |
| **Config file** | `package.json` / `tsconfig.json` |
| **Quick run command** | `py -3 -m unittest tests/test_mpris.py -v` |
| **Full suite command** | `pnpm test && py -3 -m unittest discover -s tests -p "test_*.py"` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `py -3 -m unittest tests/test_mpris.py -v` (backend) or `pnpm test -- --run src/components/tabs/SettingsTab.test.tsx src/index.test.tsx` (frontend)
- **After every plan wave:** Run `pnpm test && py -3 -m unittest discover -s tests -p "test_*.py"`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 18-01-01 | 01 | 1 | MPRIS-01 | T-18-01 | Pure-Python D-Bus wire protocol (`SASL EXTERNAL`, `Hello`, `RequestName`, `Introspect`, `Get`, `GetAll`, `Set`, `Play`, `Pause`, `PlayPause`, `Stop`, `Next`, `Previous`, `Seek`, `SetPosition`, `OpenUri`, `Seeked`, `PropertiesChanged`) | unit | `py -3 -m unittest tests/test_mpris.py -v` | ❌ W0 | ⬜ pending |
| 18-01-02 | 01 | 1 | MPRIS-01 | T-18-02 / T-18-03 | `MprisBridge` integration with `Plugin`, `VolumeFader` safe coordination, `get_cached_image_file_uri`, and `mpris-proxy` UID 1000 supervision | unit | `py -3 -m unittest tests/test_mpris.py -v && py -3 -m unittest discover -s tests -p "test_*.py"` | ❌ W0 | ⬜ pending |
| 18-02-01 | 02 | 2 | MPRIS-01 | — | `"Bluetooth & Media Controls (MPRIS2)"` card in `SettingsTab.tsx`, `MprisStatusInfo` types, and live `mpris_status` event handling | unit | `pnpm test -- --run src/components/tabs/SettingsTab.test.tsx src/index.test.tsx && pnpm typecheck && pnpm lint` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/test_mpris.py` — unit test suite covering `DbusMarshaller`/`DbusUnmarshaller`, `MprisDbusSession`, `MprisBridge`, `get_cached_image_file_uri`, `VolumeFader` coordination, `mpris-proxy` supervision, and `Plugin` RPC integration for `MPRIS-01`.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Physical Bluetooth headset AVRCP buttons control Deckify in SteamOS GamepadUI | MPRIS-01 | Requires physical Steam Deck + paired Bluetooth headset/earbuds | Pair Bluetooth earbuds in SteamOS GamepadUI, play a track in Deckify, press Play/Pause/Next/Previous on earbuds and verify track control and metadata display |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
