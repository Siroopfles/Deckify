---
phase: 20-100-silent-hud-toasts-extended-in-game-quick-chords
verified: 2026-11-21T22:51:15Z
status: human_needed
score: 26/26 must-haves verified
covered_files:
  - .planning/phases/20-100-silent-hud-toasts-extended-in-game-quick-chords/20-01-PLAN.md
  - .planning/phases/20-100-silent-hud-toasts-extended-in-game-quick-chords/20-01-SUMMARY.md
  - .planning/phases/20-100-silent-hud-toasts-extended-in-game-quick-chords/20-02-PLAN.md
  - .planning/phases/20-100-silent-hud-toasts-extended-in-game-quick-chords/20-02-SUMMARY.md
  - .planning/phases/20-100-silent-hud-toasts-extended-in-game-quick-chords/20-03-PLAN.md
  - .planning/phases/20-100-silent-hud-toasts-extended-in-game-quick-chords/20-03-SUMMARY.md
  - .planning/phases/20-100-silent-hud-toasts-extended-in-game-quick-chords/20-04-PLAN.md
  - .planning/phases/20-100-silent-hud-toasts-extended-in-game-quick-chords/20-04-SUMMARY.md
  - .planning/phases/20-100-silent-hud-toasts-extended-in-game-quick-chords/20-05-PLAN.md
  - .planning/phases/20-100-silent-hud-toasts-extended-in-game-quick-chords/20-05-SUMMARY.md
  - main.py
  - py_modules/common.py
  - src/bannerBus.ts
  - src/chords.test.ts
  - src/chords.ts
  - src/components/DeckifyOverlay.tsx
  - src/components/SilentBanner.test.tsx
  - src/components/SilentBanner.tsx
  - src/components/tabs/ChordBindingsCard.test.tsx
  - src/components/tabs/ChordBindingsCard.tsx
  - src/components/tabs/SettingsTab.test.tsx
  - src/components/tabs/SettingsTab.tsx
  - src/index.test.tsx
  - src/index.tsx
  - src/types.ts
  - src/utils/chime.test.ts
  - src/utils/chime.ts
  - tests/test_chord_settings.py
covered_digest: "v4:sha256:156c8b53c2afdf824568146513a548c629c7d6af44a72ef346284f92ca8db88d"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 19/19
  gaps_closed:
    - "G-20-1: Decoupled silent_banner_position from overlay_enabled/overlay_position and replaced Steam toaster.toast sound fallback with volume-scaled Web Audio chime alongside SilentBanner"
    - "G-20-2: Unbound all 8 DEFAULT_CHORD_BINDINGS ([]), rejected STEAM/QAM button bindings with clear warning, wired SteamClient.Input.RegisterForControllerInputMessages, and added Gamescope EUIComposition.Notification (1) lifecycle"
  gaps_remaining: []
  regressions: []
advisory: []
human_verification:
  - test: "On physical Steam Deck in Gaming Mode (G-20-1 & G-20-2), disable Mini Overlay HUD (overlay_enabled: false), set Notification / Banner Corner to bottom-left, keep Track Change Notifications ON and Silent HUD Banner ON, launch a Vulkan/Gamescope game, skip tracks with Notification Sound OFF then ON, and finally re-enable Mini Overlay HUD in bottom-left."
    expected: "3.5-second SilentBanner renders above the active game window via EUIComposition.Notification (1) in bottom-left even with Mini Overlay HUD off, plays zero Steam chime when Notification Sound is OFF, plays the subtle Web Audio chime scaled by Deckify volume (never Steam native toast) when Notification Sound is ON, and offsets by 140px when Mini Overlay HUD is visible in the same corner."
    why_human: "SteamOS Gamescope EUIComposition.Notification (1) layering over Vulkan games, Web Audio chime audibility, and SteamOS audio chime silence cannot be observed in headless Windows Vitest."
  - test: "On physical Steam Deck in Gaming Mode (G-20-2), verify all 8 In-Game Quick Chords rows start Unbound, attempt to record a combo using the STEAM or (...) button, then bind L4 + X for Like/Unlike, L5 for Cycle Pinned Playlists, and R4 for Toggle Lyrics HUD, and trigger them while actively playing a game."
    expected: "All 8 actions default to Unbound; pressing STEAM/QAM immediately cancels recording with the inline SteamOS interception warning; SteamClient.Input.RegisterForControllerInputMessages delivers rear-paddle + face button events in-game so chords trigger optimistic updates/rollbacks and SilentBanner confirmations above Gamescope; Expanded Modal suppresses chords."
    why_human: "Real SteamOS SteamClient.Input.RegisterForControllerInputMessages hardware button emission and OS-level STEAM/QAM interception require physical Steam Deck hardware."
---

# Phase 20: 100% Silent HUD Toasts & Extended In-Game Quick-Chords Verification Report

**Phase Goal:** Users receive 100% silent in-game track-change notifications that bypass Steam's noisy UI toaster chime and can trigger configurable in-game controller quick-chords with instant visual HUD feedback.
**Verified:** 2026-11-21T22:51:15Z
**Status:** `human_needed`
**Re-verification:** Yes — after gap-closure Plans `20-04` (G-20-1) and `20-05` (G-20-2)

## Goal Achievement

All 26 automated must-have truths across Plans `20-01`, `20-02`, `20-03`, `20-04`, and `20-05` are verified in the codebase and pass all Python (`604/604`), Vitest (`259/259` across 21 files), TypeScript (`0 errors`), ESLint (`0 errors`, `0 warnings` on strict Phase 20 modules), and Rollup production build gates. Overall status is classified as **`human_needed`** because physical Steam Deck hardware UAT for `G-20-1` and `G-20-2` (Gamescope `EUIComposition.Notification` compositing over Vulkan games, Web Audio chime audibility, and `SteamClient.Input.RegisterForControllerInputMessages` rear-paddle delivery in-game) cannot be executed in this Windows development environment.

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Silent track-change notifications (`toast_enabled=true`, `toast_sound_enabled=false`, `silent_banner_enabled=true`) emit 3.5s `SilentBanner` via `bannerBus` without `toaster.toast`, even when HUD/modal closed | ✓ VERIFIED | `src/index.tsx:322-349`, `src/index.test.tsx` (30/30 passed) |
| 2 | `SilentBanner` mounts gated solely by `silent_banner_enabled !== false` so chord confirmations display when `toast_enabled=false`, while `track_metadata` suppresses track banners | ✓ VERIFIED | `src/index.tsx:333,1694-1700`, `src/index.test.tsx` |
| 3 | When `silent_banner_enabled === false` and `toast_sound_enabled === true`, `track_metadata` retains `showTrackToaster` fallback with 48x48 proxied cover art and click-to-open modal | ✓ VERIFIED | `src/index.tsx:347-348`, `src/index.test.tsx` |
| 4 | `SilentBanner` renders `position: fixed`, `zIndex: 10000`, `pointerEvents: 'none'`, zero `tabIndex`/`Focusable`, normalizes `_`->`-` across 4 corners, and applies `HUD_CLEARANCE_OFFSET_PX = 140` | ✓ VERIFIED | `src/components/SilentBanner.tsx:6,22-84,213-220`, `src/components/SilentBanner.test.tsx` (11/11 passed) |
| 5 | `SilentBanner` enforces latest-wins semantics keyed on monotonic banner `id`, replacing active banner and resetting 3500ms timer without queuing | ✓ VERIFIED | `src/bannerBus.ts:14-30`, `src/components/SilentBanner.tsx:182-195`, `src/components/SilentBanner.test.tsx` |
| 6 | `SilentBanner` renders 40px cover synchronously from `data:`/`http://127.0.0.1` only, collapses absent cover/artist, and truncates with ellipsis in `min(420px, 40vw)` | ✓ VERIFIED | `src/components/SilentBanner.tsx:35-41,68,93-144`, `src/components/SilentBanner.test.tsx` |
| 7 | Backend `DEFAULT_SETTINGS`, `_load_settings`, `get_status`, and `set_setting` persist/validate `silent_banner_enabled`, `silent_banner_position`, and `gamepad_chord_bindings` with deep-copy safety | ✓ VERIFIED | `py_modules/common.py:91-135,232-316,460-478`, `main.py:614-616,767-776,831-836`, `tests/test_chord_settings.py` |
| 8 | `src/chords.ts` defines verified `@decky/ui` `GAMEPAD_BUTTON` (0..28, `OK=1`, `STEAM_GUIDE=27`, `STEAM_QUICK_MENU=28`, legacy `13/14`), 8 `CHORD_ACTIONS`, and `mapControllerInputButton` | ✓ VERIFIED | `src/chords.ts:11-118`, `src/chords.test.ts` (8/8 passed) |
| 9 | `validateChordBinding` rejects guide/STEAM/QAM buttons (`13, 14, 27, 28`), Valve reserved chords, cross-action duplicates, and `>4` buttons while allowing 1–4 non-guide buttons | ✓ VERIFIED | `src/chords.ts:225-260`, `src/chords.test.ts` |
| 10 | `ChordMatcher` fires once on final button down, ignores held repeats, prefers longest super-chord over subsets, and re-arms only after release | ✓ VERIFIED | `src/chords.ts:370-412`, `src/chords.test.ts` |
| 11 | `guideHeld` tracks `27, 28, 13, 14` and auto-expires at `4000ms` via both `setTimeout` and lazy timestamp guard | ✓ VERIFIED | `src/chords.ts:56,340-378`, `src/chords.test.ts` |
| 12 | Chords suppress when `bigOpen` or `isChordRecordingActive()`, stay active in QAM, reset deterministically on mount/dismount, and unregister listeners in `onDismount` | ✓ VERIFIED | `src/index.tsx:483-550,1705-1775`, `src/index.test.tsx` |
| 13 | All 8 chord confirmations route through `notifyMessage()` -> `SilentBanner` when `silent_banner_enabled` is true (even if `toast_enabled=false`) and `toaster.toast` otherwise | ✓ VERIFIED | `src/index.tsx:248-261,351-458`, `src/index.test.tsx` |
| 14 | Like/Unlike optimistic update + rollback + `track_metadata` sync; Cycle Pinned modulo wrap (`0..4`) + rollback; Toggle Lyrics HUD persistence + sequence guards | ✓ VERIFIED | `src/index.tsx:351-445`, `src/index.test.tsx` |
| 15 | `SettingsTab` mounts `In-Game Quick Chords` card (`FaGamepad`, scope copy, `Silent HUD Banner` toggle, 8 ordered rows, `Reset All Chords`) | ✓ VERIFIED | `src/components/tabs/ChordBindingsCard.tsx:587-702`, `src/components/tabs/SettingsTab.tsx:1563-1575`, `src/components/tabs/SettingsTab.test.tsx` (39/39 passed) |
| 16 | Unbound rows render `Unbound` chip + helper copy; bound rows render readable button chips in wrapping flex container (`gap: 4`) | ✓ VERIFIED | `src/components/tabs/ChordBindingsCard.tsx:295-342,387-399`, `src/components/tabs/ChordBindingsCard.test.tsx` (8/8 passed) |
| 17 | `Record Chord` activates `setChordRecordingActive(true)`, captures 1–4 buttons with 5s countdown, supports `B`/Cancel abort, validates on release, and persists via `set_setting` | ✓ VERIFIED | `src/components/tabs/ChordBindingsCard.tsx:129-293`, `src/components/tabs/ChordBindingsCard.test.tsx` |
| 18 | Invalid captures show exact `#E53935` inline rejection without overwriting; failed binding saves roll back optimistic state and toast error | ✓ VERIFIED | `src/components/tabs/ChordBindingsCard.tsx:133-154,524-538`, `src/components/tabs/SettingsTab.tsx:271-292`, `src/components/tabs/SettingsTab.test.tsx` |
| 19 | Per-action `Clear Chord`/`Reset Chord`, disabled `gamepad_chords_enabled` dimming (`opacity: 0.5`), and two-step `Reset All Chords` (`Confirm Reset` / `Keep Chords`) | ✓ VERIFIED | `src/components/tabs/ChordBindingsCard.tsx:459-475,496,543-585,630-653`, `src/components/tabs/ChordBindingsCard.test.tsx` |
| 20 | `SilentBanner` corner position is independently configurable via `silent_banner_position` in `SettingsTab` regardless of `overlay_enabled`, and takes precedence over `overlay_position` in `DeckifyOverlayWrapper` (Plan 20-04 / G-20-1) | ✓ VERIFIED | `src/components/tabs/SettingsTab.tsx:1506-1535`, `src/index.tsx:1668-1669,1696`, `src/components/tabs/SettingsTab.test.tsx`, `src/index.test.tsx` |
| 21 | When `silent_banner_enabled` is true and `toast_sound_enabled` is true, track-change notifications still render via `SilentBanner` (never falling back to Steam native `toaster.toast`) (Plan 20-04 / G-20-1) | ✓ VERIFIED | `src/index.tsx:335-346`, `src/index.test.tsx` |
| 22 | When `silent_banner_enabled` is true and `toast_sound_enabled` is true, a subtle non-Steam Web Audio chime plays with gain scaled by the current Deckify volume slider (`0-100`) (Plan 20-04 / G-20-1) | ✓ VERIFIED | `src/utils/chime.ts:35-65`, `src/index.tsx:342-344`, `src/utils/chime.test.ts` (3/3 passed), `src/index.test.tsx` |
| 23 | All 8 `DEFAULT_CHORD_BINDINGS` entries ship unbound (`[]`) in both `src/chords.ts` and `py_modules/common.py` (Plan 20-05 / G-20-2) | ✓ VERIFIED | `src/chords.ts:77-86`, `py_modules/common.py:91-100`, `src/chords.test.ts`, `tests/test_chord_settings.py` |
| 24 | Attempting to bind or record any combo containing the STEAM / QAM button (`27, 28, 13, 14`) warns and rejects the binding with a clear SteamOS interception message (Plan 20-05 / G-20-2) | ✓ VERIFIED | `src/chords.ts:234-241`, `py_modules/common.py:248-252`, `src/components/tabs/ChordBindingsCard.tsx:133-140`, `src/chords.test.ts`, `src/components/tabs/ChordBindingsCard.test.tsx` |
| 25 | In-game quick-chords fire reliably during gameplay via `SteamClient.Input.RegisterForControllerInputMessages` (mapped via `mapControllerInputButton`) with `FocusNavController` fallback (Plan 20-05 / G-20-2) | ✓ VERIFIED | `src/chords.ts:88-125`, `src/index.tsx:486-547`, `src/chords.test.ts`, `src/index.test.tsx` |
| 26 | `DeckifyOverlay` and `SilentBanner` assert `EUIComposition.Notification` (`1`) via `SteamClient.Window.SetComposition` whenever visible without requiring a Steam native toast, and release to `0` when hidden without overriding active Steam Overlay/QAM (Plan 20-05 / G-20-2) | ✓ VERIFIED | `src/components/SilentBanner.tsx:165-167`, `src/components/DeckifyOverlay.tsx:71-81`, `src/index.tsx:1484-1537,1670-1700`, `src/index.test.tsx` |

**Score:** 26/26 truths verified (`behavior_unverified: 0`; 2 on-device UAT items routed to `human_verification`)

### Prohibitions Check

| Prohibition | Source Plan | Status | Evidence |
| --- | --- | --- | --- |
| MUST NOT invoke `toaster.toast` when silent banner mode is active | 20-01 | ✓ VERIFIED | `src/index.tsx:249-252,335-346`; asserted in `src/index.test.tsx` |
| MUST NOT make `SilentBanner` focusable or pointer-interactive | 20-01 | ✓ VERIFIED | `src/components/SilentBanner.tsx:62,213-220` (`pointerEvents: "none"`, no `tabIndex`/`Focusable`/`onClick`) |
| MUST NOT pass unproxied external CDN URLs directly to `<img src>` or stall on fetch | 20-01 | ✓ VERIFIED | `src/components/SilentBanner.tsx:35-41`; `src/index.tsx:339` |
| MUST NOT emit track-change notifications when `toast_enabled` is false | 20-01 | ✓ VERIFIED | `src/index.tsx:333` (`if (toastEnabled === false) return;`) |
| MUST NOT accept or ship Valve reserved chords (`STEAM/QAM + X/R1/L1`) or guide-button bindings | 20-02, 20-05 | ✓ VERIFIED | `src/chords.ts:77-86,234-248`; `py_modules/common.py:91-100,248-258` |
| MUST NOT dispatch in-game chords while Expanded Modal is open or recording is active | 20-02 | ✓ VERIFIED | `src/index.tsx:495,503` (`bigOpen \|\| isChordRecordingActive()`) |
| MUST NOT allow `guideHeld` to persist indefinitely or fire shorter subsets with longer chords | 20-02 | ✓ VERIFIED | `src/chords.ts:340-392` |
| MUST NOT leave recording suppression active or leak gamepad listeners on unmount/cancel/timeout | 20-03 | ✓ VERIFIED | `src/components/tabs/ChordBindingsCard.tsx:87-104,251-262` |

### Advisory (New Scope, Unevidenced)

None.

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/bannerBus.ts` | Pub/sub banner bus | ✓ VERIFIED | Exists, zero React/`@decky/*` imports |
| `src/utils/chime.ts` | Non-Steam Web Audio notification chime scaled by Deckify volume | ✓ VERIFIED | Exists, 69 lines, `eslint --max-warnings=0` clean |
| `src/utils/chime.test.ts` | Web Audio chime unit tests | ✓ VERIFIED | Exists, 3/3 tests passing, `eslint --max-warnings=0` clean |
| `src/components/SilentBanner.tsx` | Non-blocking 3.5s corner banner with `onVisibilityChange` | ✓ VERIFIED | Exists, 222 lines, `eslint --max-warnings=0` clean |
| `src/components/SilentBanner.test.tsx` | Unit/fake-timer tests | ✓ VERIFIED | Exists, 11/11 tests passing |
| `src/components/DeckifyOverlay.tsx` | Overlay HUD with `onVisibilityChange` | ✓ VERIFIED | Exists, 393 lines, reports `effectiveVisible` |
| `src/types.ts` | `ChordActionId`, `ChordBindingsMap`, `silent_banner_enabled`, `silent_banner_position` | ✓ VERIFIED | Exists, `eslint --max-warnings=0` clean |
| `src/index.tsx` | `DeckifyOverlayWrapper`, `useGamescopeNotificationComposition`, `notifyMessage`, `setupChordListener` | ✓ VERIFIED | Exists, Rollup single-default export intact |
| `src/index.test.tsx` | Integration tests for `TOAST-01`, `CHORD-01`, `G-20-1`, `G-20-2` | ✓ VERIFIED | Exists, 30/30 tests passing |
| `py_modules/common.py` | Unbound `[]` defaults, `silent_banner_position`, `_normalize_chord_buttons` guide rejection | ✓ VERIFIED | Exists, deep-copy defaults + ASVS V5 validation |
| `main.py` | `get_status` & `set_setting` validation for `silent_banner_enabled`, `silent_banner_position`, `gamepad_chord_bindings` | ✓ VERIFIED | Exists, exposes and validates all keys |
| `tests/test_chord_settings.py` | Backend settings `unittest` suite | ✓ VERIFIED | Exists, all tests passing |
| `src/chords.ts` | Pure chord schema, unbound `[]` defaults, guide rejection, `mapControllerInputButton`, `createChordMatcher` | ✓ VERIFIED | Exists, 459 lines, `eslint --max-warnings=0` clean |
| `src/chords.test.ts` | TDD unit test suite | ✓ VERIFIED | Exists, 8/8 tests passing, `eslint --max-warnings=0` clean |
| `src/components/tabs/ChordBindingsCard.tsx` | Interactive Settings card + immediate guide-button warning | ✓ VERIFIED | Exists, 702 lines, `eslint --max-warnings=0` clean |
| `src/components/tabs/ChordBindingsCard.test.tsx` | Interactive UI & fake-timer tests | ✓ VERIFIED | Exists, 8/8 tests passing |
| `src/components/tabs/SettingsTab.tsx` | Always-visible `Notification / Banner Corner` + `<ChordBindingsCard />` | ✓ VERIFIED | Exists, wired to `set_setting` |
| `src/components/tabs/SettingsTab.test.tsx` | SettingsTab wiring, corner selector & rollback tests | ✓ VERIFIED | Exists, 39/39 tests passing |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `src/index.tsx` | `src/bannerBus.ts` | `notifyMessage()` / `handleTrackMetadataNotification` -> `emitBanner(...)` | ✓ WIRED | Verified in `src/index.tsx:248-261,336-341` and `index.test.tsx` |
| `src/index.tsx` | `src/utils/chime.ts` | `handleTrackMetadataNotification` -> `playNotificationChime(cachedVolume)` | ✓ WIRED | Verified in `src/index.tsx:342-344` and `index.test.tsx` |
| `src/components/SilentBanner.tsx` | `src/bannerBus.ts` | `subscribeBanner(...)` in `useEffect` | ✓ WIRED | Verified in `src/components/SilentBanner.tsx:182` and `SilentBanner.test.tsx` |
| `src/index.tsx` | `src/components/SilentBanner.tsx` | `DeckifyOverlayWrapper` passes `silent_banner_position` precedence & `onVisibilityChange` | ✓ WIRED | Verified in `src/index.tsx:1668-1669,1694-1700` |
| `src/index.tsx` | `SteamClient.Window.SetComposition` | `useGamescopeNotificationComposition(anyHudVisible)` asserts `1` / resets `0` | ✓ WIRED | Verified in `src/index.tsx:1484-1537,1670-1672` and `index.test.tsx` |
| `src/index.tsx` | `src/chords.ts` | `setupChordListener` -> `mapControllerInputButton` + `createChordMatcher` | ✓ WIRED | Verified in `src/index.tsx:493-520` and `index.test.tsx` |
| `main.py` | `py_modules/common.py` | `set_setting` -> `_validate_chord_bindings` -> `_save_settings` | ✓ WIRED | Verified in `main.py:769-775` and `test_chord_settings.py` |
| `src/components/tabs/ChordBindingsCard.tsx` | `src/chords.ts` | `GUIDE_BUTTON_IDS`, `CHORD_ACTIONS`, `DEFAULT_CHORD_BINDINGS`, `validateChordBinding` | ✓ WIRED | Verified in `src/components/tabs/ChordBindingsCard.tsx:133-164` |
| `src/components/tabs/SettingsTab.tsx` | `main.py` | `updateSetting('silent_banner_position', ...)` & `backendSetSetting('gamepad_chord_bindings', ...)` | ✓ WIRED | Verified in `src/components/tabs/SettingsTab.tsx:1515` and `SettingsTab.test.tsx` |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `TOAST-01` | `20-01`, `20-03`, `20-04`, `20-05` | Silent 3.5s track-change banner (`pointerEvents: "none"`), independent corner placement, optional volume-scaled non-Steam chime, Gamescope `EUIComposition.Notification` | ? NEEDS HUMAN (Automated checks passed) | Code + Vitest/Python tests verified; live Gamescope compositing & Web Audio chime audibility await on-device UAT |
| `CHORD-01` | `20-01`, `20-02`, `20-03`, `20-05` | Unbound-by-default configurable in-game quick-chords (`RegisterForControllerInputMessages`, STEAM/QAM rejection warning, 4s `guideHeld` guard) + silent HUD confirmation | ? NEEDS HUMAN (Automated checks passed) | Code + Vitest/Python tests verified; physical Steam Deck in-game rear-paddle delivery awaits on-device UAT |

Orphaned requirements mapped to Phase 20 in `.planning/REQUIREMENTS.md`: **None** (`TOAST-01` and `CHORD-01` are both accounted for).

### Behavioral Spot-Checks & Anti-Pattern Scan

| Check | Command | Result | Status |
| --- | --- | --- | --- |
| Full Python unit suite | `py -3 -m unittest discover -s tests -p "test_*.py"` | `Ran 604 tests in 120.536s — OK` | ✓ PASS |
| Full Vitest frontend suite | `pnpm test -- --run` | `21 passed (21)`, `259 passed (259)` | ✓ PASS |
| TypeScript check | `pnpm run typecheck` | `tsc --noEmit` exit 0 | ✓ PASS |
| Repo ESLint | `pnpm run lint` | `0 errors` (738 pre-existing warnings in legacy files) | ✓ PASS |
| Strict ESLint on Phase 20 modules | `pnpm exec eslint --max-warnings=0 src/types.ts src/bannerBus.ts src/chords.ts src/chords.test.ts src/utils/chime.ts src/utils/chime.test.ts src/components/SilentBanner.tsx src/components/tabs/ChordBindingsCard.tsx` | `0 errors, 0 warnings` | ✓ PASS |
| Rollup production bundle | `pnpm run build` | `created dist in 22.9s` | ✓ PASS |
| Debt / stub marker scan | `Select-String ... -Pattern "TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER"` | `0 debt markers` (`DeckifyOverlay.tsx:246` `lyricDisplayKey = "placeholder"` is a state key) | ✓ PASS |

### Human Verification Required

1. **Silent HUD Banner Corner, Volume-Scaled Chime & Gamescope Compositor Layering (`TOAST-01`, G-20-1 & G-20-2)**
   - **Test:** On a physical Steam Deck in Gaming Mode, disable *Mini Overlay HUD* (`overlay_enabled: false`), set *Notification / Banner Corner* to `bottom-left`, keep *Track Change Notifications* ON and *Silent HUD Banner* ON, launch a Vulkan/Gamescope game, skip tracks with *Notification Sound* OFF then ON, and finally re-enable *Mini Overlay HUD* in `bottom-left`.
   - **Expected:** The 3.5-second `SilentBanner` renders cleanly above the active game window via `EUIComposition.Notification (1)` in `bottom-left` even when *Mini Overlay HUD* is off, plays zero Steam chime when *Notification Sound* is OFF, plays the subtle Web Audio chime scaled by Deckify volume (never Steam native toast) when *Notification Sound* is ON, and offsets by `140px` when *Mini Overlay HUD* is visible in the same corner.
   - **Why human:** SteamOS Gamescope `EUIComposition.Notification (1)` layering over Vulkan games, Web Audio chime audibility, and SteamOS audio chime silence cannot be observed in headless Windows Vitest.

2. **Physical Controller Unbound Defaults, STEAM Rejection & In-Game Chord Execution (`CHORD-01`, G-20-2)**
   - **Test:** In *Settings → Notifications & Controller Shortcuts → In-Game Quick Chords*, confirm all 8 actions start *Unbound*, attempt to record a combo using the `STEAM` or `(...)` button, then bind `L4 + X` for *Like / Unlike*, `L5` for *Cycle Pinned Playlists*, and `R4` for *Toggle Lyrics HUD*, and trigger them while actively playing a game.
   - **Expected:** All 8 actions default to `Unbound`; pressing `STEAM`/`QAM` immediately cancels recording with the inline SteamOS interception warning; `SteamClient.Input.RegisterForControllerInputMessages` delivers rear-paddle + face button events in-game so chords trigger optimistic updates/rollbacks and `SilentBanner` confirmations above Gamescope; Expanded Modal suppresses chords.
   - **Why human:** Real SteamOS `SteamClient.Input.RegisterForControllerInputMessages` hardware button emission and OS-level `STEAM`/`QAM` shortcut interception require physical Steam Deck hardware.

---

_Verified: 2026-11-21T22:51:15Z_
_Verifier: the agent (gsd-verifier)_
