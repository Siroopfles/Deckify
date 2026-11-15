---
phase: "12"
slug: "resolve-open-todos-polish"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-15"
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest `5.1.0` + Python `unittest` |
| **Config file** | `package.json` / `vitest.config.ts` |
| **Quick run command** | `npx vitest run && py -3 -m unittest discover -s tests -p "test_*.py"` |
| **Full suite command** | `pnpm run typecheck && pnpm run lint && npx vitest run && py -3 -m unittest discover -s tests -p "test_*.py" && pnpm run build` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run targeted Vitest / Python `unittest` file(s) for that plan
- **After every plan wave:** Run full suite command
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 35 seconds

---

## Per-Task Verification Map

| Plan | Wave | Scope | Test Type | Automated Command | Status |
|------|------|-------|-----------|-------------------|--------|
| 12-01 | 1 | Playlist & Playback Reliability (`followed-playlist-tracks-not-loading`, `enable-mix-missing-playlist-id`, `playlist-play-button-unreliable`, `playlist-track-click-stops-after-song`) + Archive resolved debug/todos | unit | `py -3 -m unittest tests/test_py_modules.py -v && npx vitest run src/components/DeckifyExpandedModal.test.tsx` | ⬜ pending |
| 12-02 | 1 | Notifications, Ducking, HUD Autohide & Non-Steam Covers (`track-notification-sound-toggle`, `track-notification-album-cover-crop`, `ingame-hud-autohide-ignores-setting`, `smooth-ducking-attenuation-customizable`, `settings-time-options-to-sliders`, `non-steam-local-grid-covers`) | unit | `py -3 -m unittest tests/test_vdf_parser.py tests/test_py_modules.py -v && npx vitest run src/index.test.tsx src/components/DeckifyOverlay.test.tsx src/components/tabs/SettingsTab.test.tsx` | ⬜ pending |
| 12-03 | 2 | Sidebar, Now Playing, Podcasts & Recent UX (`sidebar-back-to-steam-navigation`, `sidebar-now-playing-like-and-add-to-playlist`, `now-playing-quick-add-to-playlist`, `podcasts-saved-episodes-metadata`, `recently-played-realtime-update`) | unit | `py -3 -m unittest tests/test_py_modules.py -v && npx vitest run src/components/DeckifyExpandedModal.test.tsx` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

On-device Steam Deck GamepadUI visual verification (notification toast cover crop & sound, Non-Steam local grid artwork, sidebar focus traversal) can be spot-checked during `/gsd-verify-work 12`, with automated Vitest/Python unit coverage for all logic and props.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 35s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
