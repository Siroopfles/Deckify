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
| **Quick run command** | `py -3 -m unittest discover -s tests -p "test_*.py" -k "soundtrack or equalizer or volume" && pnpm test -- --run src/components/tabs/SoundtracksTab.test.tsx src/components/tabs/SettingsTab.test.tsx src/index.test.tsx` |
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
| 19-01-01 | 01 | 1 | GAME-01 | T-19-01 | Sanitize `eq_preset`, `eq_custom_bands`, `ducking_level_override`, and `active_game_override_snapshot` (`bool`/`NaN`/range guards) | unit | `py -3 -m unittest discover -s tests -p "test_soundtrack.py"` | ✅ | ⬜ pending |
| 19-01-02 | 01 | 1 | GAME-01 | T-19-02 | Validate PipeWire preset/sink args without `shell=True`; isolate global settings during ephemeral/preview EQ and clean stale `eq.pid` | unit | `py -3 -m unittest discover -s tests -p "test_equalizer.py"` | ✅ | ⬜ pending |
| 19-01-03 | 01 | 1 | GAME-01 | T-19-03 | Restrict sink-input scaling to `resolve_spotify_sink_input_ids()`, enforce `volume_override`/`ducking_level_override` + `_sleep_locked` protection | unit | `py -3 -m unittest discover -s tests -p "test_volume.py"` | ✅ | ⬜ pending |
| 19-02-01 | 02 | 2 | GAME-01 | T-19-04 | Sequenced launch/exit lifecycle, A->B baseline preservation, hot-apply, and `_main()` crash recovery via `active_game_override_snapshot` | unit | `py -3 -m unittest discover -s tests -p "test_soundtrack.py"` | ✅ | ⬜ pending |
| 19-03-01 | 03 | 2 | GAME-01 | — | `GameEqModal` seeding, presets/flat reset, `pw-cli` live preview, and restore-on-close | unit | `pnpm test -- --run src/components/tabs/GameEqModal.test.tsx` | ❌ W0 | ⬜ pending |
| 19-03-02 | 03 | 2 | GAME-01 | — | `SoundtracksTab` EQ dropdown, Edit Game EQ button, dual sliders, subtitle summary, `SettingsTab` override badge, QAM `has_game_override` display | unit | `pnpm test -- --run src/components/tabs/SoundtracksTab.test.tsx src/components/tabs/SettingsTab.test.tsx src/index.test.tsx` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/components/tabs/GameEqModal.test.tsx` — covers modal seeding from global/active curve, `"Copy from Preset / Reset Flat"`, live `preview_eq_bands` calls, and `clear_eq_preview` on non-running cancel/close
- [ ] Update pre-Phase-19 assertions in `tests/test_soundtrack.py` (`test_volume_override_applied_and_reverted`, `test_lifecycle_event_routes_and_ducks`, `test_ducking_override_false_skips_duck`) and `src/components/tabs/SoundtracksTab.test.tsx` (`expect(sliders).toHaveLength(1)`) to align with D-05, D-06, and D-10

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
