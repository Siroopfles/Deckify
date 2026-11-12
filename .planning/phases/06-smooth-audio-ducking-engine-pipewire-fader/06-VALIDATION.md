---
phase: "06"
slug: "smooth-audio-ducking-engine-pipewire-fader"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-12"
---

# Phase 06 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Python `unittest` standard library & Vitest 5.1.0 |
| **Config file** | `vitest.config.ts` (root) & `tests/` directory |
| **Quick run command** | `py -m unittest tests/test_volume.py` / `pnpm test` |
| **Full suite command** | `py -m unittest discover tests` && `pnpm test` |
| **Estimated runtime** | ~8 seconds |

---

## Sampling Rate

- **After every task commit:** Run `py -m unittest tests/test_volume.py` / `pnpm test`
- **After every plan wave:** Run `py -m unittest discover tests` && `pnpm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | DUCK-01 | T-06-01 | End-to-end Local PipeWire Volume Ducking Tracer | unit | `py -m unittest tests/test_volume.py` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 1 | DUCK-01 | T-06-01, T-06-02 | Hardened Cosine Easing, Sink-Input Caching & Interruption Safety | unit | `py -m unittest tests/test_volume.py -k test_volume_fader` | ❌ W0 | ⬜ pending |
| 06-01-03 | 01 | 1 | DUCK-01 | T-06-01 | Multi-Process Launcher Exit Debounce & QAM Visual Ducked Badge | unit / e2e | `py -m unittest tests/test_e2e_requirements.py -k duck` | ✅ | ⬜ pending |
| 06-02-01 | 02 | 2 | DUCK-02 | T-06-03, T-06-04 | Voice Activity Detector with Silence Hold Hysteresis | unit | `py -m unittest tests/test_volume.py -k test_vad` | ❌ W0 | ⬜ pending |
| 06-02-02 | 02 | 2 | DUCK-02 | T-06-03 | SettingsTab Audio Ducking & Voice Chat Configuration UI | unit / e2e | `py -m unittest tests/test_e2e_requirements.py -k test_set_setting_validates_duck` | ✅ | ⬜ pending |
| 06-02-03 | 02 | 2 | DUCK-01, DUCK-02 | T-06-SC | Complete Ducking Validation Suite & Nyquist Compliance | unit / full suite | `pnpm test src/components/tabs/SettingsTab.test.tsx && py -m unittest discover tests` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/test_volume.py` — Stubs and comprehensive test suite for `VolumeFader`, `VoiceActivityDetector`, easing curves, and sink input caching.
- [ ] `src/components/tabs/SettingsTab.test.tsx` — Tests verifying ducking sliders and toggles render properly with spatial navigation.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real Steam Game Launch / Exit Audio Ducking | DUCK-01 | Requires running SteamOS GamepadUI with Steam Client AppLifetime lifecycle | Launch game in GamepadUI, verify Spotify music smoothly fades down to ducked level within configured duration. Exit game, verify music fades up smoothly. |
| Real Discord / Voice Chat Ducking | DUCK-02 | Requires live microphone hardware and active Discord or Steam Voice connection | Speak into microphone during active Discord voice session; observe music volume ducking smoothly and restoring 1.2s after speech ceases. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
