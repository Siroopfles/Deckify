---
phase: "19"
slug: "per-game-eq-volume-profiles"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-18"
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Python `unittest` (`IsolatedAsyncioTestCase`) + Vitest `5.1.0` |
| **Config file** | `package.json` (`test`, `test:python`, `typecheck`, `lint`) |
| **Quick run command** | `py -3 -m unittest discover -s tests -p "test_soundtrack.py" && py -3 -m unittest discover -s tests -p "test_equalizer.py" && py -3 -m unittest discover -s tests -p "test_volume.py" && pnpm test -- --run src/components/tabs/SoundtracksTab.test.tsx src/components/tabs/SettingsTab.test.tsx src/index.test.tsx` |
| **Full suite command** | `py -3 -m unittest discover -s tests -p "test_*.py" && pnpm test -- --run && pnpm typecheck && pnpm lint` |
| **Estimated runtime** | ~68 seconds |

---

## Sampling Rate

- **After every task commit:** Run targeted Python (`test_soundtrack.py` / `test_equalizer.py` / `test_volume.py`) or Vitest (`SoundtracksTab.test.tsx` / `SettingsTab.test.tsx` / `GameEqModal.test.tsx` / `index.test.tsx`)
- **After every plan wave:** Run `py -3 -m unittest discover -s tests -p "test_*.py" && pnpm test -- --run && pnpm typecheck && pnpm lint`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 70 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 19-01-01 | 01 | 1 | GAME-01 | T-19-01, T-19-02 | End-to-end EQ Preset Override tracer: ephemeral `EqualizerManager` layer, `SoundtrackManager` profile sanitization (`bool`/`NaN`/allowlist), `SoundtracksTab` EQ Preset dropdown + `formatGameProfileSubtitle` | unit | `py -3 -m unittest discover -s tests -p "test_soundtrack.py" && py -3 -m unittest discover -s tests -p "test_equalizer.py" && pnpm test -- --run src/components/tabs/SoundtracksTab.test.tsx && pnpm typecheck` | ✅ | ⬜ pending |
| 19-01-02 | 01 | 1 | GAME-01 | T-19-01, T-19-02, T-19-03 | Unified local PipeWire `VolumeFader` overrides + `_sleep_locked` guard, `apply_equalizer_preset` global isolation, `EQ_PID_FILE` & `active_game_override_snapshot` load validation | unit | `py -3 -m unittest discover -s tests -p "test_volume.py" && py -3 -m unittest discover -s tests -p "test_equalizer.py"` | ✅ | ⬜ pending |
| 19-01-03 | 01 | 1 | GAME-01 | T-19-03 | Remove legacy cloud volume calls (D-05), sequenced `_run_launch`/`_run_exit` (D-09, D-10, D-16), A->B baseline preservation (D-12), `_sleep_locked` protection (D-15) | unit | `py -3 -m unittest discover -s tests -p "test_soundtrack.py" && py -3 -m unittest discover -s tests -p "test_e2e_requirements.py"` | ✅ | ⬜ pending |
| 19-02-01 | 02 | 2 | GAME-01 | T-19-04, T-19-05 | `Plugin._main()` boot crash recovery via `active_game_override_snapshot` & `eq.pid`, reject external `set_setting("active_game_override_snapshot", ...)`, post-debounce ducking delegation, live `refresh_active_overrides` | unit | `py -3 -m unittest discover -s tests -p "test_soundtrack.py"` | ✅ | ⬜ pending |
| 19-02-02 | 02 | 2 | GAME-01 | T-19-04, T-19-05 | `_validate_eq_bands`, `preview_eq_bands`/`clear_eq_preview` RPCs (`bool`/`NaN`/range guards), mid-game `start_librespot` ephemeral EQ retention | unit | `py -3 -m unittest discover -s tests -p "test_equalizer.py" && py -3 -m unittest discover -s tests -p "test_e2e_requirements.py"` | ✅ | ⬜ pending |
| 19-03-01 | 03 | 2 | GAME-01 | T-19-07 | Shared 10-band `EqBandFaders.tsx` (`renderEqBandFaders`, `normalizeEqBands`, `flow-children="horizontal"`, 0.5 dB steppers) under ESLint limits | unit | `pnpm typecheck && pnpm lint src/components/common/EqBandFaders.tsx` | ✅ | ⬜ pending |
| 19-03-02 | 03 | 2 | GAME-01 | T-19-06, T-19-07 | `GameEqModal.tsx` seeding, Copy from Preset / Reset to Flat, live `preview_eq_bands`, error toast, restore-on-discard + Wave 0 `GameEqModal.test.tsx` | unit | `pnpm test -- --run src/components/tabs/GameEqModal.test.tsx && pnpm typecheck && pnpm lint src/components/tabs/GameEqModal.tsx src/components/tabs/GameEqModal.test.tsx` | ❌ W0 | ⬜ pending |
| 19-03-03 | 03 | 2 | GAME-01 | T-19-06 | `SettingsTab.tsx` `renderEqBandFaders` integration, `"Active Game EQ Override"` badge with ellipsis truncation, global baseline isolation (`SettingsTab.test.tsx`) | unit | `pnpm test -- --run src/components/tabs/SettingsTab.test.tsx src/components/tabs/GameEqModal.test.tsx && pnpm typecheck && pnpm lint src/components/tabs/SettingsTab.tsx` | ✅ | ⬜ pending |
| 19-04-01 | 04 | 3 | GAME-01 | T-19-08 | `SoundtracksTab.tsx` `"Edit Game EQ"` button, dual volume/ducking sliders, two-step `Delete Game Profile`, immediate running-game flush, ESLint modular helpers (`SoundtracksTab.test.tsx`) | unit | `pnpm test -- --run src/components/tabs/SoundtracksTab.test.tsx && pnpm typecheck && pnpm lint src/components/tabs/SoundtracksTab.tsx src/components/tabs/SoundtracksTab.test.tsx` | ✅ | ⬜ pending |
| 19-04-02 | 04 | 3 | GAME-01 | T-19-08, T-19-09 | `DeckifyExpandedModal.tsx` `runningAppId`/global EQ prop wiring, `src/index.tsx` QAM `"GAME VOL"` / `effective_volume` sync (`src/index.test.tsx`), and targeted Phase 19 suite | unit | `py -3 -m unittest discover -s tests -p "test_soundtrack.py" && py -3 -m unittest discover -s tests -p "test_equalizer.py" && py -3 -m unittest discover -s tests -p "test_volume.py" && py -3 -m unittest discover -s tests -p "test_e2e_requirements.py" && pnpm test -- --run && pnpm typecheck && pnpm lint` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/components/tabs/GameEqModal.test.tsx` — created in Plan `19-03` Task 2 (`19-03-02`); covers modal seeding from global/active curve, `"Copy from Preset / Reset Flat"`, live `preview_eq_bands` calls, and `clear_eq_preview` on cancel/close
- [ ] Update pre-Phase-19 assertions in `tests/test_soundtrack.py` (`test_volume_override_applied_and_reverted` in `19-01-03`; `test_lifecycle_event_routes_and_ducks` and `test_ducking_override_false_skips_duck` in `19-02-01`) and `src/components/tabs/SoundtracksTab.test.tsx` (`expect(sliders).toHaveLength(1)` in `19-04-01`) to align with D-05, D-06, and D-10

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live PipeWire `pipewire -c` (`deckify_eq_sink`), `pw-cli set-param`, and `pactl set-sink-input-volume` transitions on Steam Deck without audible clicks or `steamwebhelper` audio interference | GAME-01 | `pipewire`, `pw-cli`, and `pactl` host binaries are SteamOS-only and unavailable on Windows dev environment | Launch a Steam game with a custom EQ + volume/ducking profile on Steam Deck, verify live QAM effective volume & EQ change cleanly, adjust sliders in `SoundtracksTab` and `GameEqModal` mid-game, exit game / simulate plugin restart, verify global baseline restoration and Sleep Timer `_sleep_locked` priority |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 70s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
