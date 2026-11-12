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
| 06-01-01 | 01 | 0 | DUCK-01, DUCK-02 | T-06-01 | Wave 0 test stubs with input validation test cases | unit | `py -m unittest tests/test_volume.py` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 1 | DUCK-01 | T-06-01 | Cosine easing volume curve calculation and non-blocking fade down/up | unit | `py -m unittest tests/test_volume.py -k test_volume_fader` | ❌ W0 | ⬜ pending |
| 06-01-03 | 01 | 1 | DUCK-01 | T-06-01 | One-time sink input resolution and caching without repeat list subprocesses | unit | `py -m unittest tests/test_volume.py -k test_sink_input_caching` | ❌ W0 | ⬜ pending |
| 06-01-04 | 01 | 1 | DUCK-01 | T-06-02 | Interruption safety: cancels in-flight fade and ramps from mid-flight volume | unit | `py -m unittest tests/test_volume.py -k test_fade_interruption` | ❌ W0 | ⬜ pending |
| 06-01-05 | 01 | 2 | DUCK-02 | T-06-01 | Parses `pactl list source-outputs` identifying Discord/Steam Voice streams | unit | `py -m unittest tests/test_volume.py -k test_vad_stream_parsing` | ❌ W0 | ⬜ pending |
| 06-01-06 | 01 | 2 | DUCK-02 | T-06-02 | Silence hold hysteresis (1.2s delay) prevents volume pumping | unit | `py -m unittest tests/test_volume.py -k test_vad_silence_hold` | ❌ W0 | ⬜ pending |
| 06-02-01 | 02 | 1 | DUCK-01, D-06 | — | UI displays `Ducked` pill badge and synchronizes volume slider | unit | `pnpm test src/components/tabs/SettingsTab.test.tsx` | ❌ W0 | ⬜ pending |
| 06-02-02 | 02 | 2 | DUCK-01, DUCK-02 | — | Settings sliders (fade duration, silence hold, voice ducking) and AppLifetime integration | unit / e2e | `pnpm test` && `py -m unittest discover tests` | ✅ | ⬜ pending |

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
