---
phase: "20"
slug: "100-silent-hud-toasts-extended-in-game-quick-chords"
status: draft
nyquist_compliant: true
wave_0_complete: false
created: "2026-11-19"
updated: "2026-11-21"
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest `5.1.0` (frontend TypeScript/TSX) & Python `unittest` (`py -3`) |
| **Config file** | `package.json` (`vitest run`) / `tsconfig.json` / `eslint.config.js` |
| **Quick run command** | `pnpm test -- --run src/chords.test.ts src/components/SilentBanner.test.tsx src/components/tabs/ChordBindingsCard.test.tsx && py -3 -m unittest discover -s tests -p "test_chord_settings.py"` |
| **Full suite command** | `py -3 -m unittest discover -s tests -p "test_*.py" && pnpm test -- --run && pnpm run typecheck && pnpm run lint && pnpm run build` |
| **Estimated runtime** | ~18 seconds |

---

## Sampling Rate

- **After every task commit:** Run task-scoped `<automated>` verify command (`pnpm test -- --run <file>` and/or `py -3 -m unittest discover -s tests -p "test_chord_settings.py"`) + `pnpm run typecheck`
- **After every plan wave:** Run wave-relevant frontend + backend tests and `pnpm exec eslint --max-warnings=0` on new modules
- **Before `/gsd-verify-work`:** Full suite (`test_*.py`, `pnpm test -- --run`, `typecheck`, `lint`, `build`) must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 20-01-01 | 01 | 1 | TOAST-01 | T-20-01, T-20-02, T-20-03 | Text-node rendering (no raw HTML injection), CSP-safe `data:`/`127.0.0.1` cover only, `pointerEvents: "none"` non-focusable, `<SilentBanner>` gated on `silent_banner_enabled` while `track_metadata` gates on `toast_enabled` and bypasses `toaster.toast` | unit/integration | `pnpm test -- --run src/index.test.tsx && pnpm run typecheck && pnpm exec eslint --max-warnings=0 src/types.ts src/bannerBus.ts src/components/SilentBanner.tsx` | ✅ / ❌ W0 (`SilentBanner.tsx`, `bannerBus.ts`) | ⬜ pending |
| 20-01-02 | 01 | 1 | TOAST-01 | T-20-01, T-20-02, T-20-03 | 3500ms auto-dismiss, latest-wins replacement, 4-corner + `>=136px` (140px) HUD offset, external URL rejection | unit | `pnpm test -- --run src/components/SilentBanner.test.tsx && pnpm exec eslint --max-warnings=0 src/components/SilentBanner.tsx src/bannerBus.ts` | ❌ W0 (`src/components/SilentBanner.test.tsx`) | ⬜ pending |
| 20-01-03 | 01 | 1 | TOAST-01, CHORD-01 | T-20-04 | ASVS V5 `gamepad_chord_bindings` sanitization & validation (reject bools, out-of-range, >4 buttons, Valve reserved, duplicates) + `silent_banner_enabled` bool coercion + deep-copied `_load_settings()` defaults | unittest | `py -3 -m unittest discover -s tests -p "test_chord_settings.py" && py -3 -m unittest discover -s tests -p "test_features.py" && py -3 -m unittest discover -s tests -p "test_pinned_playlists.py"` | ❌ W0 (`tests/test_chord_settings.py`) | ⬜ pending |
| 20-02-01 | 02 | 2 | CHORD-01 | T-20-05, T-20-06 | Rejects Valve reserved `STEAM/QAM + X/R1/L1`, 4000ms `guideHeld` expiry, single-fire idempotency, release re-arm, longest-match wins | unit (TDD) | `pnpm test -- --run src/chords.test.ts && pnpm run typecheck && pnpm exec eslint --max-warnings=0 src/chords.ts src/chords.test.ts` | ❌ W0 (`src/chords.test.ts`) | ⬜ pending |
| 20-02-02 | 02 | 2 | CHORD-01 | T-20-06, T-20-07 | Suppresses chords when `bigOpen` or recording active; monotonic sequence guards for Like rollback & Pinned cycle; same-track `track_metadata` like sync; deterministic module-state reset + clean `onDismount` unregistration | integration | `pnpm test -- --run src/index.test.tsx src/chords.test.ts && pnpm run typecheck && pnpm run lint` | ✅ (`src/index.test.tsx`) | ⬜ pending |
| 20-03-01 | 03 | 3 | TOAST-01, CHORD-01 | T-20-08 | Clears `setChordRecordingActive(false)`, timers, and gamepad listeners on unmount/cancel/B/timeout; rejects invalid captures before save; submits full 8-action maps | unit | `pnpm test -- --run src/components/tabs/ChordBindingsCard.test.tsx && pnpm run typecheck && pnpm exec eslint --max-warnings=0 src/components/tabs/ChordBindingsCard.tsx src/components/tabs/ChordBindingsCard.test.tsx` | ❌ W0 (`src/components/tabs/ChordBindingsCard.test.tsx`) | ⬜ pending |
| 20-03-02 | 03 | 3 | TOAST-01, CHORD-01 | T-20-08, T-20-SC | `<ChordBindingsCard />` JSX composition; settings persistence + failure rollback toast; full suite, strict new-file lint, and Rollup build green | integration + build | `py -3 -m unittest discover -s tests -p "test_*.py" && pnpm test -- --run && pnpm run typecheck && pnpm run lint && pnpm exec eslint --max-warnings=0 src/bannerBus.ts src/chords.ts src/chords.test.ts src/components/SilentBanner.tsx src/components/tabs/ChordBindingsCard.tsx && pnpm run build` | ✅ (`src/components/tabs/SettingsTab.test.tsx`) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/components/SilentBanner.test.tsx` — created in Plan `20-01` Task 2 (fake-timer, latest-wins, 4-corner/HUD-offset, CSP cover, `pointerEvents: "none"` tests for `TOAST-01`)
- [ ] `tests/test_chord_settings.py` — created in Plan `20-01` Task 3 (`unittest` suite for `silent_banner_enabled`, `gamepad_chord_bindings` validation, and `_load_settings()` disk sanitization)
- [ ] `src/chords.test.ts` — created in Plan `20-02` Task 1 (TDD tests for normalization, Valve reserved/duplicate validation, longest-match, idempotency, and 4s `guideHeld` expiry for `CHORD-01`)
- [ ] `src/components/tabs/ChordBindingsCard.test.tsx` — created in Plan `20-03` Task 1 (stateful hook harness tests for press-to-record 5s capture, cancellation, rejection messages, Clear/Reset, and two-step Reset All Chords)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Silent track-change & chord banners render over live Vulkan/Gamescope game with zero audible Steam UI chime and zero focus/input interception (`TOAST-01` unclassified edge-probe item) | TOAST-01 | Steam CEF compositor layering and SteamOS audio chime pipeline only run inside live Gamescope on Steam Deck | 1. Disable `overlay_enabled` (`Mini Overlay HUD: OFF`), keep `Track Change Notifications: ON`, `Notification Sound: OFF`, `Silent HUD Banner: ON`. 2. Launch a game in Gaming Mode and skip tracks via Deckify or QAM. 3. Confirm 3.5s banner appears cleanly in the configured corner with no Steam chime and D-pad/game input passes unaffected. 4. Enable `Mini Overlay HUD` and verify banner offsets cleanly below/above HUD without overlapping. |
| Physical Steam Deck controller chords (`STEAM`/`QAM` + `X/R1/L1` reserved collision safety & custom `L4`/`R4` combos) | CHORD-01 | Real SteamOS `FocusNavController.m_rgGamepadInputSources[0]` hardware button indices and Gamescope STEAM/QAM overlay interception require physical Deck verification | 1. In Settings -> `In-Game Quick Chords`, record custom chords (e.g. `L4 + X` for Like, `R4` for Cycle Pinned) and confirm `STEAM + X/R1/L1` are rejected. 2. Test chords while in-game and with QAM open; verify banners confirm Like (`♥ Liked`), Pinned cycle (`▶ Pinned i/n`), and Lyrics toggle (`Lyrics HUD On/Off`). 3. Open Deckify Expanded Modal and confirm chords are ignored until modal closes. 4. Hold `STEAM` for >4s, release/leave stuck, press D-pad Right, and confirm chord does not misfire. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 20s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-11-21
