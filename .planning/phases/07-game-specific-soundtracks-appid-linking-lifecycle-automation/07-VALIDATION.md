---
phase: "07"
slug: "game-specific-soundtracks-appid-linking-lifecycle-automation"
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-12"
updated: "2026-11-15"
---

# Phase 07 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Python standard library `unittest` & Vitest 5.1.0 |
| **Config file** | `vitest.config.ts` (root) & `tests/` directory |
| **Quick run command** | `py -m unittest tests/test_soundtrack.py tests/test_vdf_parser.py` / `pnpm test` |
| **Full suite command** | `py -m unittest discover tests` && `pnpm test` |
| **Estimated runtime** | ~8 seconds |

---

## Sampling Rate

- **After every task commit:** Run targeted unit tests (`tests/test_soundtrack.py` or `tests/test_vdf_parser.py`) / `pnpm test`
- **After every plan wave:** Run `py -m unittest discover tests` && `pnpm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | SOUND-01, SOUND-02 | T-07-01 | Binary VDF unpacking & CRC32 AppID normalization | unit | `py -m unittest tests/test_vdf_parser.py` | ✅ | ✅ green |
| 07-01-02 | 01 | 1 | SOUND-01, SOUND-02 | T-07-01, T-07-02 | SoundtrackManager profile store, launch debounce & wake-up | unit | `py -m unittest tests/test_soundtrack.py -k test_launch` | ✅ | ✅ green |
| 07-01-03 | 01 | 1 | SOUND-03 | T-07-03 | Pre-game playback snapshot & exit restore with in-game pause handling | unit | `py -m unittest tests/test_soundtrack.py -k test_restore` | ✅ | ✅ green |
| 07-02-01 | 02 | 2 | SOUND-01 | T-07-04 | SoundtracksTab game list, search filtering & playlist modes | unit | `pnpm test src/components/tabs/SoundtracksTab.test.tsx` | ✅ | ✅ green |
| 07-02-02 | 02 | 2 | SOUND-01, SOUND-02 | T-07-05 | Playlist & Album Picker modal and QAM 1-click binding | unit / integration | `pnpm test src/components/tabs/PlaylistPickerModal.test.tsx` | ✅ | ✅ green |
| 07-02-03 | 02 | 2 | SOUND-01, SOUND-02, SOUND-03 | T-07-SC | Full suite verification & end-to-end requirement validation | full suite | `py -m unittest discover tests && pnpm test` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/test_vdf_parser.py` — unit tests for binary VDF unpacking and unsigned 32-bit CRC AppID computation.
- [x] `tests/test_soundtrack.py` — unit tests for `SoundtrackManager`, snapshot/restore engine, and debouncing.
- [x] `src/components/tabs/SoundtracksTab.test.tsx` — component tests for the Soundtracks UI and playlist picker.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real Steam Game Launch Soundtrack Trigger | SOUND-02 | Requires live SteamOS GamepadUI with Steam Client AppLifetime lifecycle | Launch game in GamepadUI, verify Spotify automatically switches to the configured game soundtrack after 3.5s debounce. |
| Real Game Exit Pre-Game State Restore | SOUND-03 | Requires live SteamOS GamepadUI with game process termination | Exit running game, verify Spotify pauses or restores pre-game music context and seek position cleanly after 3.0s debounce. |
| In-Game Manual Pause Respect | SOUND-03 | Requires user pausing music during active gameplay | Pause music via QAM while game is running; exit game; verify playback remains paused without unexpected music blast. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated
