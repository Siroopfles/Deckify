---
phase: 20-100-silent-hud-toasts-extended-in-game-quick-chords
verified: 2026-11-21T12:10:00Z
status: human_needed
score: 19/19 must-haves verified
covered_files:
  - .planning/phases/20-100-silent-hud-toasts-extended-in-game-quick-chords/20-01-PLAN.md
  - .planning/phases/20-100-silent-hud-toasts-extended-in-game-quick-chords/20-01-SUMMARY.md
  - .planning/phases/20-100-silent-hud-toasts-extended-in-game-quick-chords/20-02-PLAN.md
  - .planning/phases/20-100-silent-hud-toasts-extended-in-game-quick-chords/20-02-SUMMARY.md
  - .planning/phases/20-100-silent-hud-toasts-extended-in-game-quick-chords/20-03-PLAN.md
  - .planning/phases/20-100-silent-hud-toasts-extended-in-game-quick-chords/20-03-SUMMARY.md
  - main.py
  - py_modules/common.py
  - src/bannerBus.ts
  - src/chords.test.ts
  - src/chords.ts
  - src/components/SilentBanner.test.tsx
  - src/components/SilentBanner.tsx
  - src/components/tabs/ChordBindingsCard.test.tsx
  - src/components/tabs/ChordBindingsCard.tsx
  - src/components/tabs/SettingsTab.test.tsx
  - src/components/tabs/SettingsTab.tsx
  - src/index.test.tsx
  - src/index.tsx
  - src/types.ts
  - tests/test_chord_settings.py
covered_digest: "v4:sha256:03918a92a84a64d5adbd6dd31fd99bbc19d56d9be2168ca50a93fab2352b73ac"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "On physical Steam Deck in Gaming Mode, disable Mini Overlay HUD (overlay_enabled: false), keep Track Change Notifications ON, Notification Sound OFF, and Silent HUD Banner ON; launch a Vulkan/Gamescope game and skip tracks via Deckify or QAM, then re-enable Mini Overlay HUD in the same corner."
    expected: "3.5-second SilentBanner renders cleanly above the active game window with zero audible Steam UI toast chime, zero controller focus or game input interception, and offsets by 140px when Mini Overlay HUD is visible in the same corner."
    why_human: "Steam CEF Gamescope compositor layering over Vulkan games and SteamOS audio chime silence cannot be observed in headless Windows Vitest."
  - test: "On physical Steam Deck, bind custom chords (e.g. L4 + X for Like/Unlike, L5 for Cycle Pinned Playlists, R4 for Toggle Lyrics HUD), attempt STEAM/QAM + X/R1/L1, trigger chords in-game and with QAM open, open Deckify Expanded Modal to confirm suppression, and hold STEAM >4s before pressing D-pad Right."
    expected: "Hardware FocusNavController button indices match @decky/ui FooterLegend constants (STEAM=27, QAM=28, A=1, L4..R5=23..26), Valve reserved combos are rejected, in-game/QAM chords emit silent banners and optimistic updates/rollbacks, Expanded Modal pauses chords, and 4s guideHeld expiry prevents misfires."
    why_human: "Real SteamOS FocusNavController.m_rgGamepadInputSources[0] hardware button emission and OS-level STEAM/QAM shortcut interception require physical Steam Deck hardware."
  - test: "Open Deckify Settings -> Notifications & Controller Shortcuts -> In-Game Quick Chords on Steam Deck GamepadUI and navigate rows/buttons with D-pad while recording and resetting chords."
    expected: "Compact inline DialogButtons (Record Chord, Clear Chord, Reset Chord, Reset All Chords, Confirm Reset, Keep Chords) stay inline without wrapping/crushing adjacent text under SteamOS .DialogButton { width: 100% } CSS, and D-pad spatial navigation traverses all horizontal strips cleanly."
    why_human: "Live SteamOS GamepadUI CEF CSS cascade and FocusNavController spatial D-pad traversal require on-device visual and controller UAT."
---

# Phase 20: 100% Silent HUD Toasts & Extended In-Game Quick-Chords Verification Report

**Phase Goal:** Users receive 100% silent in-game track-change notifications that bypass Steam's noisy UI toaster chime and can trigger configurable in-game controller quick-chords with instant visual HUD feedback.
**Verified:** 2026-11-21T12:10:00Z
**Status:** `human_needed`
**Re-verification:** No — initial verification

## Goal Achievement

All 19 automated must-have truths across Plans `20-01`, `20-02`, and `20-03` are verified in the codebase and pass all Python (`603/603`), Vitest (`251/251`), TypeScript, ESLint, and Rollup production build gates. Overall status is classified as **`human_needed`** because physical Steam Deck hardware UAT (Gamescope compositor layering, Steam audio chime silence, hardware button index parity, and live SteamOS GamepadUI CSS/D-pad traversal) cannot be executed in this Windows development environment.

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Silent track-change notifications (`toast_enabled=true`, `toast_sound_enabled=false`, `silent_banner_enabled=true`) emit 3.5s `SilentBanner` via `bannerBus` without `toaster.toast`, even when HUD/modal closed | ✓ VERIFIED | `src/index.tsx:320-344`, `src/index.test.tsx` (27/27 passed) |
| 2 | `SilentBanner` mounts gated solely by `silent_banner_enabled !== false` so chord confirmations display when `toast_enabled=false`, while `track_metadata` suppresses track banners | ✓ VERIFIED | `src/index.tsx:331,1577-1603`, `src/index.test.tsx` |
| 3 | `toast_sound_enabled: true` preserves existing `toaster.toast` pipeline with chime, 48x48 proxied cover art, and click-to-open modal | ✓ VERIFIED | `src/index.tsx:342-343`, `src/index.test.tsx` |
| 4 | `SilentBanner` renders `position: fixed`, `zIndex: 10000`, `pointerEvents: 'none'`, zero `tabIndex`/`Focusable`, normalizes `_`->`-` across 4 corners, and applies `HUD_CLEARANCE_OFFSET_PX = 140` | ✓ VERIFIED | `src/components/SilentBanner.tsx:6,22-84,194-206`, `src/components/SilentBanner.test.tsx` (11/11 passed) |
| 5 | `SilentBanner` enforces latest-wins semantics keyed on monotonic banner `id`, replacing active banner and resetting 3500ms timer without queuing | ✓ VERIFIED | `src/bannerBus.ts:14-30`, `src/components/SilentBanner.tsx:168-181`, `src/components/SilentBanner.test.tsx` |
| 6 | `SilentBanner` renders 40px cover synchronously from `data:`/`http://127.0.0.1` only, collapses absent cover/artist, and truncates with ellipsis in `min(420px, 40vw)` | ✓ VERIFIED | `src/components/SilentBanner.tsx:35-41,68,93-144`, `src/components/SilentBanner.test.tsx` |
| 7 | Backend `DEFAULT_SETTINGS`, `_load_settings`, `get_status`, and `set_setting` persist/validate `silent_banner_enabled` and `gamepad_chord_bindings` with deep-copy safety | ✓ VERIFIED | `py_modules/common.py:75-133,231-322,454-467`, `main.py:614-615,767-775`, `tests/test_chord_settings.py` (7/7 passed) |
| 8 | `src/chords.ts` defines verified `@decky/ui` `GAMEPAD_BUTTON` (0..28, `OK=1`, `STEAM_GUIDE=27`, `STEAM_QUICK_MENU=28`, legacy `13/14`), 8 `CHORD_ACTIONS`, and `DEFAULT_CHORD_BINDINGS` | ✓ VERIFIED | `src/chords.ts:11-86`, `src/chords.test.ts` (7/7 passed) |
| 9 | `validateChordBinding` rejects Valve reserved chords (`STEAM/QAM + X/R1/L1`), cross-action duplicates, and `>4` buttons while allowing 1–4 simultaneous or bare buttons | ✓ VERIFIED | `src/chords.ts:176-220`, `src/chords.test.ts` |
| 10 | `ChordMatcher` fires once on final button down, ignores held repeats, prefers longest super-chord over subsets, and re-arms only after release | ✓ VERIFIED | `src/chords.ts:318-367`, `src/chords.test.ts` |
| 11 | `guideHeld` tracks `27, 28, 13, 14` and auto-expires at `4000ms` via both `setTimeout` and lazy timestamp guard | ✓ VERIFIED | `src/chords.ts:56,291-308,328-333`, `src/chords.test.ts` |
| 12 | Chords suppress when `bigOpen` or `isChordRecordingActive()`, stay active in QAM, reset deterministically on mount/dismount, and unregister listeners in `onDismount` | ✓ VERIFIED | `src/index.tsx:263-282,478-516,1608`, `src/index.test.tsx` |
| 13 | All 8 chord confirmations route through `notifyMessage()` -> `SilentBanner` when `silent_banner_enabled` is true (even if `toast_enabled=false`) and `toaster.toast` otherwise | ✓ VERIFIED | `src/index.tsx:248-261,284-458`, `src/index.test.tsx` |
| 14 | Like/Unlike optimistic update + rollback + `track_metadata` sync; Cycle Pinned modulo wrap (`0..4`) + rollback; Toggle Lyrics HUD persistence + sequence guards | ✓ VERIFIED | `src/index.tsx:304-423`, `src/index.test.tsx` |
| 15 | `SettingsTab` mounts `In-Game Quick Chords` card (`FaGamepad`, scope copy, `Silent HUD Banner` toggle, 8 ordered rows, `Reset All Chords`) | ✓ VERIFIED | `src/components/tabs/ChordBindingsCard.tsx:587-693`, `src/components/tabs/SettingsTab.tsx:1532-1545`, `src/components/tabs/SettingsTab.test.tsx` (38/38 passed) |
| 16 | Unbound rows render `Unbound` chip + helper copy; bound rows render readable button chips in wrapping flex container (`gap: 4`) | ✓ VERIFIED | `src/components/tabs/ChordBindingsCard.tsx:295-342,387-399`, `src/components/tabs/ChordBindingsCard.test.tsx` (8/8 passed) |
| 17 | `Record Chord` activates `setChordRecordingActive(true)`, captures 1–4 buttons with 5s countdown, supports `B`/Cancel abort, validates on release, and persists via `set_setting` | ✓ VERIFIED | `src/components/tabs/ChordBindingsCard.tsx:128-293`, `src/components/tabs/ChordBindingsCard.test.tsx` |
| 18 | Invalid captures show exact `#E53935` inline rejection without overwriting; failed binding saves roll back optimistic state and toast error | ✓ VERIFIED | `src/components/tabs/ChordBindingsCard.tsx:140-158,524-538`, `src/components/tabs/SettingsTab.tsx:271-292`, `src/components/tabs/SettingsTab.test.tsx` |
| 19 | Per-action `Clear Chord`/`Reset Chord`, disabled `gamepad_chords_enabled` dimming (`opacity: 0.5`), and two-step `Reset All Chords` (`Confirm Reset` / `Keep Chords`) | ✓ VERIFIED | `src/components/tabs/ChordBindingsCard.tsx:459-475,496,543-585,630-653`, `src/components/tabs/ChordBindingsCard.test.tsx` |

**Score:** 19/19 truths verified (`behavior_unverified: 0`; 3 on-device UAT items routed to `human_verification`)

### Prohibitions Check

| Prohibition | Source Plan | Status | Evidence |
| --- | --- | --- | --- |
| MUST NOT invoke `toaster.toast` when silent banner mode is active | 20-01 | ✓ VERIFIED | `src/index.tsx:249-252,333-341`; asserted in `src/index.test.tsx` |
| MUST NOT make `SilentBanner` focusable or pointer-interactive | 20-01 | ✓ VERIFIED | `src/components/SilentBanner.tsx:62,200-206` (`pointerEvents: "none"`, no `tabIndex`/`Focusable`/`onClick`) |
| MUST NOT pass unproxied external CDN URLs directly to `<img src>` or stall on fetch | 20-01 | ✓ VERIFIED | `src/components/SilentBanner.tsx:35-41`; `src/index.tsx:518-525` |
| MUST NOT emit track-change notifications when `toast_enabled` is false | 20-01 | ✓ VERIFIED | `src/index.tsx:331` (`if (toastEnabled === false) return;`) |
| MUST NOT accept or ship Valve reserved chords (`STEAM/QAM + X/R1/L1`) | 20-02 | ✓ VERIFIED | `src/chords.ts:50-54,176-182`; `py_modules/common.py:86,247-252` |
| MUST NOT dispatch in-game chords while Expanded Modal is open or recording is active | 20-02 | ✓ VERIFIED | `src/index.tsx:485,491` (`bigOpen \|\| isChordRecordingActive()`) |
| MUST NOT allow `guideHeld` to persist indefinitely or fire shorter subsets with longer chords | 20-02 | ✓ VERIFIED | `src/chords.ts:291-308,334-345` |
| MUST NOT leave recording suppression active or leak gamepad listeners on unmount/cancel/timeout | 20-03 | ✓ VERIFIED | `src/components/tabs/ChordBindingsCard.tsx:87-104,251-262` |

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/bannerBus.ts` | Pub/sub banner bus | ✓ VERIFIED | Exists, 42 lines, zero React/`@decky/*` imports |
| `src/components/SilentBanner.tsx` | Non-blocking 3.5s corner banner | ✓ VERIFIED | Exists, 208 lines, `eslint --max-warnings=0` clean |
| `src/components/SilentBanner.test.tsx` | Unit/fake-timer tests | ✓ VERIFIED | Exists, 11/11 tests passing |
| `src/types.ts` | `ChordActionId`, `ChordBindingsMap`, `EngineSettings` fields | ✓ VERIFIED | Exists, types exported and compiled cleanly |
| `src/index.tsx` | Always-mounted wrapper, `notifyMessage`, `setupChordListener` | ✓ VERIFIED | Exists, Rollup single-default export intact |
| `src/index.test.tsx` | Integration tests for `TOAST-01` & `CHORD-01` | ✓ VERIFIED | Exists, 27/27 tests passing |
| `py_modules/common.py` | Defaults, `_sanitize_chord_bindings`, `_validate_chord_bindings` | ✓ VERIFIED | Exists, deep-copy defaults + ASVS V5 validation |
| `main.py` | `get_status` & `set_setting` validation | ✓ VERIFIED | Exists, exposes and validates both keys |
| `tests/test_chord_settings.py` | Backend settings `unittest` suite | ✓ VERIFIED | Exists, 7/7 tests passing |
| `src/chords.ts` | Pure chord schema, validator, `createChordMatcher` | ✓ VERIFIED | Exists, 414 lines, `eslint --max-warnings=0` clean |
| `src/chords.test.ts` | TDD unit test suite | ✓ VERIFIED | Exists, 7/7 tests passing |
| `src/components/tabs/ChordBindingsCard.tsx` | Interactive Settings card + `useChordRecorder` | ✓ VERIFIED | Exists, 693 lines, `eslint --max-warnings=0` clean |
| `src/components/tabs/ChordBindingsCard.test.tsx` | Interactive UI & fake-timer tests | ✓ VERIFIED | Exists, 8/8 tests passing |
| `src/components/tabs/SettingsTab.tsx` | JSX `<ChordBindingsCard />` composition + rollback | ✓ VERIFIED | Exists, mounted in `Notifications & Controller Shortcuts` |
| `src/components/tabs/SettingsTab.test.tsx` | SettingsTab wiring & rollback tests | ✓ VERIFIED | Exists, 38/38 tests passing |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `src/index.tsx` | `src/bannerBus.ts` | `notifyMessage()` / `handleTrackMetadataNotification` -> `emitBanner(...)` | ✓ WIRED | Verified by `verify.key-links` and `index.test.tsx` |
| `src/components/SilentBanner.tsx` | `src/bannerBus.ts` | `subscribeBanner(...)` in `useEffect` | ✓ WIRED | Verified by `verify.key-links` and `SilentBanner.test.tsx` |
| `src/index.tsx` | `src/components/SilentBanner.tsx` | `DeckifyOverlayWrapper` renders `<SilentBanner>` outside `overlay_enabled`/`modalOpen` gate | ✓ WIRED | Verified by `verify.key-links` and `index.test.tsx` |
| `main.py` | `py_modules/common.py` | `set_setting` -> `_validate_chord_bindings` -> `_save_settings` | ✓ WIRED | Verified by `verify.key-links` and `test_chord_settings.py` |
| `src/index.tsx` | `src/chords.ts` | `createChordMatcher`, `isChordRecordingActive`, `DEFAULT_CHORD_BINDINGS` | ✓ WIRED | Verified by `verify.key-links` and `index.test.tsx` |
| `src/index.tsx` | `main.py` | `backendToggleLike`, `backendQuickPlayPinned`, `backendSetSetting`, `backendControlPlayback`, `backendSetVolume` | ✓ WIRED | Verified by `verify.key-links` and `index.test.tsx` |
| `src/components/tabs/ChordBindingsCard.tsx` | `src/chords.ts` | `CHORD_ACTIONS`, `DEFAULT_CHORD_BINDINGS`, `validateChordBinding`, `formatChordChips`, `setChordRecordingActive` | ✓ WIRED | Verified by `verify.key-links` and `ChordBindingsCard.test.tsx` |
| `src/components/tabs/SettingsTab.tsx` | `src/components/tabs/ChordBindingsCard.tsx` | JSX `<ChordBindingsCard ... />` | ✓ WIRED | Verified by `verify.key-links` and `SettingsTab.test.tsx` |
| `src/components/tabs/SettingsTab.tsx` | `main.py` | `backendSetSetting('silent_banner_enabled', ...)` & `backendSetSetting('gamepad_chord_bindings', ...)` | ✓ WIRED | Verified by `verify.key-links` and `SettingsTab.test.tsx` |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `TOAST-01` | `20-01`, `20-03` | Silent 3.5s track-change banner (`pointerEvents: "none"`) bypassing `toaster.toast` even when HUD overlay is hidden | ? NEEDS HUMAN (Automated checks passed) | Code + Vitest/Python tests verified; live Gamescope compositor layering & audible silence await on-device UAT |
| `CHORD-01` | `20-01`, `20-02`, `20-03` | Configurable in-game quick-chords (4s `guideHeld` guard, no Valve collisions) for Like/Unlike, Pinned Cycle, Lyrics HUD + silent HUD confirmation | ? NEEDS HUMAN (Automated checks passed) | Code + Vitest/Python tests verified; physical Steam Deck button index parity, OS shortcut interception, and live SettingsTab CSS/D-pad traversal await on-device UAT |

Orphaned requirements mapped to Phase 20 in `.planning/REQUIREMENTS.md`: **None** (`TOAST-01` and `CHORD-01` are both accounted for).

### Behavioral Spot-Checks & Anti-Pattern Scan

| Check | Command | Result | Status |
| --- | --- | --- | --- |
| Full Python unit suite | `py -3 -m unittest discover -s tests -p "test_*.py"` | `Ran 603 tests in 70.108s — OK` | ✓ PASS |
| Chord settings unit suite | `py -3 -m unittest discover -s tests -p "test_chord_settings.py" -v` | `Ran 7 tests in 0.245s — OK` | ✓ PASS |
| Full Vitest frontend suite | `pnpm test -- --run` | `20 passed (20)`, `251 passed (251)` | ✓ PASS |
| TypeScript check | `pnpm run typecheck` | `tsc --noEmit` exit 0 | ✓ PASS |
| Repo ESLint | `pnpm run lint` | `0 errors` (724 pre-existing warnings in legacy files) | ✓ PASS |
| Strict ESLint on Phase 20 modules | `pnpm exec eslint --max-warnings=0 src/types.ts src/bannerBus.ts src/chords.ts src/chords.test.ts src/components/SilentBanner.tsx src/components/tabs/ChordBindingsCard.tsx` | `0 errors, 0 warnings` | ✓ PASS |
| Rollup production bundle | `pnpm run build` | `created dist in 9.2s` | ✓ PASS |
| Debt / stub marker scan | `Select-String ... -Pattern "TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER"` | `0 matches` in Phase 20 modules | ✓ PASS |

### Human Verification Required

1. **Silent HUD Banner Compositor Layering & Audio Silence (`TOAST-01`)**
   - **Test:** On a physical Steam Deck in Gaming Mode, disable *Mini Overlay HUD* (`overlay_enabled: false`), keep *Track Change Notifications* ON, *Notification Sound* OFF, and *Silent HUD Banner* ON. Launch a Vulkan/Gamescope game and skip tracks via Deckify or QAM; then re-enable *Mini Overlay HUD* in the same corner.
   - **Expected:** The 3.5-second `SilentBanner` renders cleanly above the active game window with zero audible Steam UI toast chime, zero controller focus or game input interception, and offsets by `140px` when the HUD is visible in the same corner.
   - **Why human:** Steam CEF Gamescope compositor layering over Vulkan games and SteamOS audio chime silence cannot be observed in headless Windows Vitest.

2. **Physical Controller Hardware Button Parity & Chord Safety (`CHORD-01`)**
   - **Test:** In *Settings → Notifications & Controller Shortcuts → In-Game Quick Chords*, record custom chords (e.g. `L4 + X` for Like/Unlike, `L5` for Cycle Pinned Playlists, `R4` for Toggle Lyrics HUD), attempt `STEAM/QAM + X/R1/L1`, trigger chords in-game and with QAM open, open Deckify Expanded Modal to confirm suppression, and hold `STEAM` >4s before pressing D-pad Right.
   - **Expected:** Hardware `FocusNavController` button indices match `@decky/ui` `FooterLegend` constants (`STEAM=27`, `QAM=28`, `A=1`, `L4..R5=23..26`), Valve reserved combos are rejected, in-game/QAM chords emit silent banners and optimistic updates/rollbacks, Expanded Modal pauses chords, and 4s `guideHeld` expiry prevents misfires.
   - **Why human:** Real SteamOS `FocusNavController.m_rgGamepadInputSources[0]` hardware button emission and OS-level `STEAM`/`QAM` shortcut interception require physical Steam Deck hardware.

3. **Live SteamOS GamepadUI CSS & D-Pad Focus Traversal (`CHORD-01`)**
   - **Test:** Navigate *Settings → In-Game Quick Chords* on Steam Deck GamepadUI using the D-pad while recording, clearing, resetting, and triggering *Reset All Chords* → *Confirm Reset* / *Keep Chords*.
   - **Expected:** Compact inline `DialogButton` controls (`width: "auto"`, `minWidth: "auto"`) stay inline without squeezing row titles/chips under SteamOS `.DialogButton { width: 100% }`, and D-pad spatial navigation traverses all horizontal strips cleanly.
   - **Why human:** Live SteamOS GamepadUI CEF CSS cascade and `FocusNavController` spatial D-pad traversal require on-device visual and controller UAT.

---

_Verified: 2026-11-21T12:10:00Z_
_Verifier: the agent (gsd-verifier)_
