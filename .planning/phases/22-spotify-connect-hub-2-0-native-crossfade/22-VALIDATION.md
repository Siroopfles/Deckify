---
phase: "22"
slug: "spotify-connect-hub-2-0-native-crossfade"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-22"
---

# Phase 22 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest `5.1.0` (frontend) + Python `unittest` (`py -3 -m unittest`, backend) |
| **Config file** | `package.json` (`"test": "vitest run"`) |
| **Quick run command** | `pnpm test -- --run src/components/tabs/DevicesTab.test.tsx src/components/tabs/SettingsTab.test.tsx && py -3 -m unittest tests/test_connect_hub.py tests/test_crossfade.py` |
| **Full suite command** | `pnpm test -- --run && py -3 -m unittest discover -s tests -p "test_*.py"` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run targeted Vitest or `py -3 -m unittest` command for the modified module
- **After every plan wave:** Run `pnpm lint && pnpm typecheck && pnpm test -- --run && py -3 -m unittest discover -s tests -p "test_*.py"`
- **Before `/gsd-verify-work`:** Full suite must be green + `pnpm build` clean
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 22-01-01 | 01 | 1 | CONNECT-01 | T-22-01 | Sanitize `device_id` via `urlencode` and clamp `volume_percent` (`0..100`) | unit | `py -3 -m unittest tests/test_connect_hub.py` | ❌ W0 | ⬜ pending |
| 22-01-02 | 01 | 1 | CONNECT-01 | — | Render device icons, engine badge, auto-wake Pull button, 300ms debounced volume slider, Fixed Volume, empty state | unit | `pnpm test -- --run src/components/tabs/DevicesTab.test.tsx` | ❌ W0 | ⬜ pending |
| 22-02-01 | 02 | 1 | RADIO-02 | T-22-02 | Clamp `crossfade_seconds` (`0..12`, reject `bool`); respect `_sleep_locked` & ducking | unit | `py -3 -m unittest tests/test_crossfade.py` | ❌ W0 | ⬜ pending |
| 22-02-02 | 02 | 1 | RADIO-02 | — | Render Crossfade `SliderField` (`0–12s`, `0s = Off`) in `SettingsTab` | unit | `pnpm test -- --run src/components/tabs/SettingsTab.test.tsx` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/test_connect_hub.py` — stubs for `CONNECT-01` backend (`get_devices` enrichment, `pull_playback_to_deck`, `set_device_volume`)
- [ ] `tests/test_crossfade.py` — stubs for `RADIO-02` backend (`crossfade_seconds` persistence, `prefs` update, CDP sync, `VolumeFader` boundary fade)
- [ ] `src/components/tabs/DevicesTab.test.tsx` — stubs for `CONNECT-01` frontend (`DevicesTab` icons, badges, pull button, debounced slider, fixed volume, empty state)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real Spotify Connect transfer from smartphone/desktop to Steam Deck & remote volume | CONNECT-01 | Requires live Spotify Connect session and physical Steam Deck / external device | Start playback on phone, open `DevicesTab` on Steam Deck, click *"Pull Playback to Steam Deck"*, verify engine wakes and audio plays on Deck; adjust remote volume slider on external device |
| Audible crossfade transition on Official Spotify Client CDP & `librespot` | RADIO-02 | Requires live audio playback across track boundaries | Set Crossfade to `6s` in `SettingsTab`, play two consecutive tracks on `librespot` and `spotify_client`, verify smooth transition |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
