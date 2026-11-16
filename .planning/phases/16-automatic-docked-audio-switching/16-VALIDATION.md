---
phase: "16"
slug: "automatic-docked-audio-switching"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-16"
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `unittest` (Python 3.14.0 on Windows / `python3` on Linux/CI) & `vitest` 5.1.0 |
| **Config file** | `package.json` (`test`, `test:python`) |
| **Quick run command** | `py -m unittest discover -s tests -p test_dock.py -v` / `npx vitest run src/components/tabs/SettingsTab.test.tsx` |
| **Full suite command** | `npx vitest run && py -m unittest discover -s tests -p "test_*.py"` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `py -m unittest discover -s tests -p test_dock.py -v` or `npx vitest run src/components/tabs/SettingsTab.test.tsx`
- **After every plan wave:** Run `npx vitest run && py -m unittest discover -s tests -p "test_*.py"`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 16-01-01 | 01 | 1 | DOCK-01, DOCK-02 | T-16-01, T-16-02 | Subprocess commands drop UID to `DECK_UID` (1000) via `_build_deck_command` and validate `sink_name` / `dock_target_sink` without shell interpolation | unit | `py -m unittest discover -s tests -p test_dock.py -v` | ❌ W0 | ⬜ pending |
| 16-01-02 | 01 | 1 | DOCK-01, DOCK-02 | T-16-03 | Backend RPCs validate settings and emit `dock_audio_switched` safely | unit | `py -m unittest discover -s tests -p test_dock.py -v` | ❌ W0 | ⬜ pending |
| 16-02-01 | 02 | 2 | DOCK-01 | — | SettingsTab Docked Audio-Switching card renders controls, horizontal `flow-children="horizontal"` rows, and toast listener | unit | `npx vitest run src/components/tabs/SettingsTab.test.tsx` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/test_dock.py` — unit tests for `DockAudioSwitcher`, sink enrichment (`get_audio_sinks`), `bit_perfect_clock` unlock/reset, Bluetooth precedence, manual override, and `main.py` RPC/settings integration

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real Steam Deck USB-C dock / HDMI hotplug & `pw-metadata` clock verification | DOCK-01, DOCK-02 | Requires physical SteamOS PipeWire daemon and hardware USB-DAC / HDMI sink | Connect USB-DAC or Steam Deck Dock on SteamOS, verify `SettingsTab` shows `Docked: <sink>`, `pactl list sink-inputs` shows only `effect_output.deckify_eq`/`librespot` moved, `pw-metadata -n settings 0 clock.allowed-rates` shows unlocked rates, and undocking restores speakers + `[ 48000 ]`. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
