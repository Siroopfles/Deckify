---
phase: "15"
slug: "real-pipewire-biquad-equalizer"
status: complete
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-16"
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.1.0 (`pnpm test`) + Python `unittest` (`py -3 -m unittest discover -s tests -p "test_*.py"`) |
| **Config file** | `package.json` (`test`, `test:python`, `typecheck`, `lint`) |
| **Quick run command** | `pnpm test -- --run src/components/tabs/SettingsTab.test.tsx` and `py -3 -m unittest discover -s tests -p "test_equalizer.py"` |
| **Full suite command** | `pnpm test -- --run && pnpm typecheck && pnpm lint && py -3 -m unittest discover -s tests -p "test_*.py"` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test -- --run src/components/tabs/SettingsTab.test.tsx` or `py -m unittest discover -s tests -p "test_equalizer.py"`
- **After every plan wave:** Run `pnpm test -- --run && pnpm typecheck && pnpm lint && py -m unittest discover -s tests -p "test_*.py"`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 15-01-01 | 01 | 1 | EQ-01 | T-15-01 | Validate `eq_preset` allowlist, drop privileges via `_build_deck_command()` | unit | `py -3 -m unittest discover -s tests -p "test_equalizer.py"` | ✅ | ✅ green |
| 15-01-02 | 01 | 1 | EQ-02 | T-15-02 | Stream-isolated sink-input routing and EQ-aware `set_audio_sink` in `engine.py` and `volume.py` | unit | `py -3 -m unittest discover -s tests -p "test_equalizer.py"` | ✅ | ✅ green |
| 15-01-03 | 01 | 1 | EQ-01, EQ-02 | T-15-02 | Clamp 10 band gains to `[-12.0, 12.0]`, wire `EqualizerManager` lifecycle and `set_eq_bands` RPC in `main.py` | unit | `py -3 -m unittest discover -s tests -p "test_equalizer.py"` | ✅ | ✅ green |
| 15-02-01 | 02 | 2 | EQ-01, EQ-02 | — | 7 preset pills in horizontal rows + 10-band ISO `SliderField` forking to `"custom"` | unit | `pnpm test -- --run src/components/tabs/SettingsTab.test.tsx` | ✅ | ✅ green |
| 15-02-02 | 02 | 2 | EQ-01, EQ-02 | — | Vitest unit tests for 7 EQ presets, 2 horizontal rows, and 10-band auto-fork in `SettingsTab.test.tsx` | unit | `pnpm test -- --run src/components/tabs/SettingsTab.test.tsx` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/test_equalizer.py` — covers `EqualizerManager` (presets, preamp math, conf generation, `pw-dump` parsing, 75ms throttling, `flat` bypass, `set_audio_sink` isolation, crash fallback)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Audible biquad EQ sweep and zero crackle on Steam Deck | EQ-01, EQ-02 | Requires live SteamOS PipeWire daemon and audio output | Play track in Spotify, switch through all 5 sound presets + `Flat`, drag 10-band sliders in `SettingsTab`, verify audible filtering without crackle or game/Steam UI interruption |
| Persistence across SteamOS reboot | EQ-02 | Requires full SteamOS reboot cycle | Set `Custom` or preset, reboot Steam Deck, reopen `SettingsTab` and confirm EQ preset and band gains restore |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** complete
