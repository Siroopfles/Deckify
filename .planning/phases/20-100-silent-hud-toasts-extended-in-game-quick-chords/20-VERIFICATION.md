---
phase: 20-100-silent-hud-toasts-extended-in-game-quick-chords
verified: 2026-11-22T01:10:00Z
status: passed
score: 32/32 must-haves verified
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
  - .planning/phases/20-100-silent-hud-toasts-extended-in-game-quick-chords/20-06-PLAN.md
  - .planning/phases/20-100-silent-hud-toasts-extended-in-game-quick-chords/20-06-SUMMARY.md
  - .planning/phases/20-100-silent-hud-toasts-extended-in-game-quick-chords/20-07-PLAN.md
  - .planning/phases/20-100-silent-hud-toasts-extended-in-game-quick-chords/20-07-SUMMARY.md
  - main.py
  - py_modules/common.py
  - py_modules/input_watch.py
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
  - tests/test_input_watch.py
covered_digest: "v4:sha256:f796cd17f42cd5492960cef1670a6845f4e518f49cd2efc153e894c5664a4fed"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 26/26
  gaps_closed:
    - "G-20-1: Decoupled silent_banner_position from overlay_enabled/overlay_position and replaced Steam toaster.toast sound fallback with volume-scaled Web Audio chime alongside SilentBanner"
    - "G-20-2: Unbound all 8 DEFAULT_CHORD_BINDINGS ([]), rejected STEAM/QAM button bindings with clear warning, wired SteamClient.Input.RegisterForControllerInputMessages, and added Gamescope EUIComposition.Notification (1) lifecycle"
    - "G-20-3: Added passive pure-Python stdlib hidraw/evdev watcher (py_modules/input_watch.py) emitting controller_input via main.py, D-pad 20..23 mappings in src/chords.ts, dual-signature RegisterForControllerInputMessages + RegisterForControllerStateChanges fallback + .unregister()/.Unregister() + deck_resumed re-subscription + 50ms cross-source deduplication in src/index.tsx"
  gaps_remaining: []
  regressions: []
advisory: []
human_verification:
  - test: "On physical Steam Deck in Gaming Mode (G-20-1 & G-20-2), disable Mini Overlay HUD (overlay_enabled: false), set Notification / Banner Corner to bottom-left, keep Track Change Notifications ON and Silent HUD Banner ON, launch a Vulkan/Gamescope game, skip tracks with Notification Sound OFF then ON, and finally re-enable Mini Overlay HUD in bottom-left."
    expected: "3.5-second SilentBanner renders above the active game window via EUIComposition.Notification (1) in bottom-left even with Mini Overlay HUD off, plays zero Steam chime when Notification Sound is OFF, plays the subtle Web Audio chime scaled by Deckify volume (never Steam native toast) when Notification Sound is ON, and offsets by 140px when Mini Overlay HUD is visible in the same corner."
    why_human: "SteamOS Gamescope EUIComposition.Notification (1) layering over Vulkan games, Web Audio chime audibility, and SteamOS audio chime silence cannot be observed in headless Windows Vitest."
  - test: "On physical Steam Deck in Gaming Mode (G-20-2 & G-20-3), verify all 8 In-Game Quick Chords rows start Unbound, attempt to record a combo using the STEAM or (...) button, then bind L4 + X for Like/Unlike, L5 for Cycle Pinned Playlists, and R4 for Toggle Lyrics HUD, and trigger them while actively playing a game (including after sleep/resume)."
    expected: "All 8 actions default to Unbound; pressing STEAM/QAM immediately cancels recording with the inline SteamOS interception warning; passive backend hidraw/evdev controller_input and SteamClient.Input listeners deliver rear-paddle + face button events in-game (without double-firing or blocking game input) so chords trigger optimistic updates/rollbacks and SilentBanner confirmations above Gamescope; Expanded Modal suppresses chords; chords continue firing after sleep/resume."
    why_human: "Real SteamOS /dev/hidraw* / /dev/input/event* hardware delivery while Gamescope/Proton holds game focus, sleep/resume re-subscription, and OS-level STEAM/QAM interception require physical Steam Deck hardware."
---

# Phase 20: 100% Silent HUD Toasts & Extended In-Game Quick-Chords Verification Report

**Phase Goal:** Users receive 100% silent in-game track-change notifications that bypass Steam's noisy UI toaster chime and can trigger configurable in-game controller quick-chords with instant visual HUD feedback.
**Verified:** 2026-11-21T23:35:00Z
**Status:** `human_needed`
**Re-verification:** Yes — after gap-closure Plans `20-06` and `20-07` (G-20-3), following `20-04` (G-20-1) and `20-05` (G-20-2)

## Goal Achievement

All 32 automated must-have truths across Plans `20-01` through `20-07` are verified in the codebase and pass all Python (`611/611`), Vitest (`263/263` across 21 files), TypeScript (`0 errors`), ESLint (`0 errors`, `0 errors / 0 warnings` on strict Phase 20 modules), and Rollup production build (`dist` created in `8.9s`) gates. Overall status is **`human_needed`** because physical Steam Deck hardware UAT for `G-20-1`, `G-20-2`, and `G-20-3` (Gamescope `EUIComposition.Notification` compositing over Vulkan games, Web Audio chime audibility, `/dev/hidraw*` + `/dev/input/event*` delivery while Gamescope/Proton holds exclusive game focus, and sleep/resume recovery) cannot be executed in this Windows development environment.

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Silent track-change notifications (`toast_enabled=true`, `toast_sound_enabled=false`, `silent_banner_enabled=true`) emit 3.5s `SilentBanner` via `bannerBus` without `toaster.toast`, even when HUD/modal closed | ✓ VERIFIED | `src/index.tsx`, `src/index.test.tsx` (34/34 passed) |
| 2 | `SilentBanner` mounts gated solely by `silent_banner_enabled !== false` so chord confirmations display when `toast_enabled=false`, while `track_metadata` suppresses track banners | ✓ VERIFIED | `src/index.tsx`, `src/index.test.tsx` |
| 3 | When `silent_banner_enabled === false` and `toast_sound_enabled === true`, `track_metadata` retains `showTrackToaster` fallback with 48x48 proxied cover art and click-to-open modal | ✓ VERIFIED | `src/index.tsx`, `src/index.test.tsx` |
| 4 | `SilentBanner` renders `position: fixed`, `zIndex: 10000`, `pointerEvents: 'none'`, zero `tabIndex`/`Focusable`, normalizes `_`->`-` across 4 corners, and applies `HUD_CLEARANCE_OFFSET_PX = 140` | ✓ VERIFIED | `src/components/SilentBanner.tsx`, `src/components/SilentBanner.test.tsx` (11/11 passed) |
| 5 | `SilentBanner` enforces latest-wins semantics keyed on monotonic banner `id`, replacing active banner and resetting 3500ms timer without queuing | ✓ VERIFIED | `src/bannerBus.ts`, `src/components/SilentBanner.tsx`, `src/components/SilentBanner.test.tsx` |
| 6 | `SilentBanner` renders 40px cover synchronously from `data:`/`http://127.0.0.1` only, collapses absent cover/artist, and truncates with ellipsis in `min(420px, 40vw)` | ✓ VERIFIED | `src/components/SilentBanner.tsx`, `src/components/SilentBanner.test.tsx` |
| 7 | Backend `DEFAULT_SETTINGS`, `_load_settings`, `get_status`, and `set_setting` persist/validate `silent_banner_enabled`, `silent_banner_position`, and `gamepad_chord_bindings` with deep-copy safety | ✓ VERIFIED | `py_modules/common.py`, `main.py`, `tests/test_chord_settings.py` |
| 8 | `src/chords.ts` defines verified `@decky/ui` `GAMEPAD_BUTTON` (0..28, `OK=1`, `STEAM_GUIDE=27`, `STEAM_QUICK_MENU=28`, legacy `13/14`), 8 `CHORD_ACTIONS`, and `mapControllerInputButton` | ✓ VERIFIED | `src/chords.ts`, `src/chords.test.ts` (8/8 passed) |
| 9 | `validateChordBinding` rejects guide/STEAM/QAM buttons (`13, 14, 27, 28`), Valve reserved chords, cross-action duplicates, and `>4` buttons while allowing 1–4 non-guide buttons | ✓ VERIFIED | `src/chords.ts`, `src/chords.test.ts` |
| 10 | `ChordMatcher` fires once on final button down, ignores held repeats, prefers longest super-chord over subsets, and re-arms only after release | ✓ VERIFIED | `src/chords.ts`, `src/chords.test.ts` |
| 11 | `guideHeld` tracks `27, 28, 13, 14` and auto-expires at `4000ms` via both `setTimeout` and lazy timestamp guard | ✓ VERIFIED | `src/chords.ts`, `src/chords.test.ts` |
| 12 | Chords suppress when `bigOpen` or `isChordRecordingActive()`, stay active in QAM, reset deterministically on mount/dismount, and unregister listeners in `onDismount` | ✓ VERIFIED | `src/index.tsx`, `src/index.test.tsx` |
| 13 | All 8 chord confirmations route through `notifyMessage()` -> `SilentBanner` when `silent_banner_enabled` is true (even if `toast_enabled=false`) and `toaster.toast` otherwise | ✓ VERIFIED | `src/index.tsx`, `src/index.test.tsx` |
| 14 | Like/Unlike optimistic update + rollback + `track_metadata` sync; Cycle Pinned modulo wrap (`0..4`) + rollback; Toggle Lyrics HUD persistence + sequence guards | ✓ VERIFIED | `src/index.tsx`, `src/index.test.tsx` |
| 15 | `SettingsTab` mounts `In-Game Quick Chords` card (`FaGamepad`, scope copy, `Silent HUD Banner` toggle, 8 ordered rows, `Reset All Chords`) | ✓ VERIFIED | `src/components/tabs/ChordBindingsCard.tsx`, `src/components/tabs/SettingsTab.tsx`, `src/components/tabs/SettingsTab.test.tsx` (39/39 passed) |
| 16 | Unbound rows render `Unbound` chip + helper copy; bound rows render readable button chips in wrapping flex container (`gap: 4`) | ✓ VERIFIED | `src/components/tabs/ChordBindingsCard.tsx`, `src/components/tabs/ChordBindingsCard.test.tsx` (8/8 passed) |
| 17 | `Record Chord` activates `setChordRecordingActive(true)`, captures 1–4 buttons with 5s countdown, supports `B`/Cancel abort, validates on release, and persists via `set_setting` | ✓ VERIFIED | `src/components/tabs/ChordBindingsCard.tsx`, `src/components/tabs/ChordBindingsCard.test.tsx` |
| 18 | Invalid captures show exact `#E53935` inline rejection without overwriting; failed binding saves roll back optimistic state and toast error | ✓ VERIFIED | `src/components/tabs/ChordBindingsCard.tsx`, `src/components/tabs/SettingsTab.tsx`, `src/components/tabs/SettingsTab.test.tsx` |
| 19 | Per-action `Clear Chord`/`Reset Chord`, disabled `gamepad_chords_enabled` dimming (`opacity: 0.5`), and two-step `Reset All Chords` (`Confirm Reset` / `Keep Chords`) | ✓ VERIFIED | `src/components/tabs/ChordBindingsCard.tsx`, `src/components/tabs/ChordBindingsCard.test.tsx` |
| 20 | `SilentBanner` corner position is independently configurable via `silent_banner_position` in `SettingsTab` regardless of `overlay_enabled`, and takes precedence over `overlay_position` in `DeckifyOverlayWrapper` (Plan 20-04 / G-20-1) | ✓ VERIFIED | `src/components/tabs/SettingsTab.tsx`, `src/index.tsx`, `src/components/tabs/SettingsTab.test.tsx`, `src/index.test.tsx` |
| 21 | When `silent_banner_enabled` is true and `toast_sound_enabled` is true, track-change notifications still render via `SilentBanner` (never falling back to Steam native `toaster.toast`) (Plan 20-04 / G-20-1) | ✓ VERIFIED | `src/index.tsx`, `src/index.test.tsx` |
| 22 | When `silent_banner_enabled` is true and `toast_sound_enabled` is true, a subtle non-Steam Web Audio chime plays with gain scaled by the current Deckify volume slider (`0-100`) (Plan 20-04 / G-20-1) | ✓ VERIFIED | `src/utils/chime.ts`, `src/index.tsx`, `src/utils/chime.test.ts` (3/3 passed), `src/index.test.tsx` |
| 23 | All 8 `DEFAULT_CHORD_BINDINGS` entries ship unbound (`[]`) in both `src/chords.ts` and `py_modules/common.py` (Plan 20-05 / G-20-2) | ✓ VERIFIED | `src/chords.ts:77-86`, `py_modules/common.py`, `src/chords.test.ts`, `tests/test_chord_settings.py` |
| 24 | Attempting to bind or record any combo containing the STEAM / QAM button (`27, 28, 13, 14`) warns and rejects the binding with a clear SteamOS interception message (Plan 20-05 / G-20-2) | ✓ VERIFIED | `src/chords.ts`, `py_modules/common.py`, `src/components/tabs/ChordBindingsCard.tsx`, `src/chords.test.ts`, `src/components/tabs/ChordBindingsCard.test.tsx` |
| 25 | In-game quick-chords fire reliably during gameplay via `SteamClient.Input.RegisterForControllerInputMessages` (mapped via `mapControllerInputButton`) with `FocusNavController` fallback (Plan 20-05 / G-20-2) | ✓ VERIFIED | `src/chords.ts`, `src/index.tsx:548-634`, `src/chords.test.ts`, `src/index.test.tsx` |
| 26 | `DeckifyOverlay` and `SilentBanner` assert `EUIComposition.Notification` (`1`) via `SteamClient.Window.SetComposition` whenever visible without requiring a Steam native toast, and release to `0` when hidden without overriding active Steam Overlay/QAM (Plan 20-05 / G-20-2) | ✓ VERIFIED | `src/components/SilentBanner.tsx`, `src/components/DeckifyOverlay.tsx`, `src/index.tsx`, `src/index.test.tsx` |
| 27 | Python backend passively monitors `/dev/hidraw*` for Valve controllers (`0x28DE:0x1205` report `0x09` and `0x28DE:0x1302-0x1305` reports `0x42/0x45/0x47`) and `/dev/input/event*` for virtual/third-party gamepads (`0x11FF`, `EV_KEY`/`EV_ABS`) without grabbing devices or external pip packages (Plan 20-06 / G-20-3) | ✓ VERIFIED | `py_modules/input_watch.py:21-172,213-458`, `tests/test_input_watch.py` |
| 28 | `ControllerInputWatcher` emits normalized `controller_input` events (`{ button, pressed, source }`) via `decky.emit` when `gamepad_chords_enabled` is true and suppresses duplicate events across hidraw/evdev (`0x11FF` suppression + 30ms dedup) (Plan 20-06 / G-20-3) | ✓ VERIFIED | `py_modules/input_watch.py:285-290,412-428`, `main.py:277-284`, `tests/test_input_watch.py` |
| 29 | `main.py` starts `ControllerInputWatcher` in `_main()`, stops it cleanly in `_unload()`, syncs enabled state on `set_setting("gamepad_chords_enabled", ...)`, and triggers a device rescan on `_on_deck_resume()` (Plan 20-06 / G-20-3) | ✓ VERIFIED | `main.py:207-212,241-243,298-299,790-791`, `tests/test_input_watch.py` |
| 30 | `CONTROLLER_INPUT_TO_GAMEPAD_BUTTON` in `src/chords.ts` maps D-pad `20..23` (Steam Controller 2026) in addition to `4..7` to `GAMEPAD_BUTTON.DIR_UP/DIR_RIGHT/DIR_DOWN/DIR_LEFT` (Plan 20-07 / G-20-3) | ✓ VERIFIED | `src/chords.ts:93-102`, `src/chords.test.ts` (8/8 passed) |
| 31 | `setupChordListener()` in `src/index.tsx` handles both `RegisterForControllerInputMessages` signatures (array of `{ nA, bS }` and 3-arg `(idx, btn, pressed)`), falls back to `RegisterForControllerStateChanges` (`ulButtons` BigInt bitmask), and `unregisterHandle()` supports `.unregister()`, `.Unregister()`, and function handles (Plan 20-07 / G-20-3) | ✓ VERIFIED | `src/index.tsx:477-485,548-634`, `src/index.test.tsx` (34/34 passed) |
| 32 | `setupChordListener()` subscribes to backend `controller_input` events from `py_modules/input_watch.py` with 50ms cross-source `(button, pressed)` deduplication against frontend events, and re-subscribes `SteamClient.Input` listeners on `deck_resumed` / `RegisterForOnResumeFromSuspend` (Plan 20-07 / G-20-3) | ✓ VERIFIED | `src/index.tsx:487-534,638-679`, `src/index.test.tsx` (34/34 passed) |

**Score:** 32/32 truths verified (`behavior_unverified: 0`; 2 on-device UAT items routed to `human_verification`)

### Prohibitions Check

| Prohibition | Source Plan | Status | Evidence |
| --- | --- | --- | --- |
| MUST NOT invoke `toaster.toast` when silent banner mode is active | 20-01 | ✓ VERIFIED | `src/index.tsx`; asserted in `src/index.test.tsx` |
| MUST NOT make `SilentBanner` focusable or pointer-interactive | 20-01 | ✓ VERIFIED | `src/components/SilentBanner.tsx` (`pointerEvents: "none"`, no `tabIndex`/`Focusable`/`onClick`) |
| MUST NOT pass unproxied external CDN URLs directly to `<img src>` or stall on fetch | 20-01 | ✓ VERIFIED | `src/components/SilentBanner.tsx`; `src/index.tsx` |
| MUST NOT emit track-change notifications when `toast_enabled` is false | 20-01 | ✓ VERIFIED | `src/index.tsx` (`if (toastEnabled === false) return;`) |
| MUST NOT accept or ship Valve reserved chords (`STEAM/QAM + X/R1/L1`) or guide-button bindings | 20-02, 20-05 | ✓ VERIFIED | `src/chords.ts`; `py_modules/common.py` |
| MUST NOT dispatch in-game chords while Expanded Modal is open or recording is active | 20-02 | ✓ VERIFIED | `src/index.tsx:495,526` (`bigOpen \|\| isChordRecordingActive()`) |
| MUST NOT allow `guideHeld` to persist indefinitely or fire shorter subsets with longer chords | 20-02 | ✓ VERIFIED | `src/chords.ts` |
| MUST NOT leave recording suppression active or leak gamepad listeners on unmount/cancel/timeout | 20-03 | ✓ VERIFIED | `src/components/tabs/ChordBindingsCard.tsx`; `src/index.tsx:669-679` |
| MUST NOT grab `/dev/hidraw*` or `/dev/input/event*` (`EVIOCGRAB`) or add external pip/npm dependencies | 20-06, 20-07 | ✓ VERIFIED | `py_modules/input_watch.py:321,331` (`os.O_RDONLY \| O_NONBLOCK` only, stdlib only) |

### Advisory (New Scope, Unevidenced)

None.

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/bannerBus.ts` | Pub/sub banner bus | ✓ VERIFIED | Exists, zero React/`@decky/*` imports |
| `src/utils/chime.ts` | Non-Steam Web Audio notification chime scaled by Deckify volume | ✓ VERIFIED | Exists, `eslint --max-warnings=0` clean |
| `src/utils/chime.test.ts` | Web Audio chime unit tests | ✓ VERIFIED | Exists, 3/3 tests passing, `eslint --max-warnings=0` clean |
| `src/components/SilentBanner.tsx` | Non-blocking 3.5s corner banner with `onVisibilityChange` | ✓ VERIFIED | Exists, `eslint --max-warnings=0` clean |
| `src/components/SilentBanner.test.tsx` | Unit/fake-timer tests | ✓ VERIFIED | Exists, 11/11 tests passing |
| `src/components/DeckifyOverlay.tsx` | Overlay HUD with `onVisibilityChange` | ✓ VERIFIED | Exists, reports `effectiveVisible` |
| `src/types.ts` | `ChordActionId`, `ChordBindingsMap`, `silent_banner_enabled`, `silent_banner_position` | ✓ VERIFIED | Exists, `eslint --max-warnings=0` clean |
| `src/index.tsx` | `DeckifyOverlayWrapper`, `useGamescopeNotificationComposition`, `notifyMessage`, `setupChordListener`, `unregisterHandle` | ✓ VERIFIED | Exists, Rollup single-default export intact |
| `src/index.test.tsx` | Integration tests for `TOAST-01`, `CHORD-01`, `G-20-1`, `G-20-2`, `G-20-3` | ✓ VERIFIED | Exists, 34/34 tests passing |
| `py_modules/common.py` | Unbound `[]` defaults, `silent_banner_position`, `_normalize_chord_buttons` guide rejection | ✓ VERIFIED | Exists, deep-copy defaults + ASVS V5 validation |
| `py_modules/input_watch.py` | Pure-Python stdlib passive hidraw + evdev `ControllerInputWatcher` | ✓ VERIFIED | Exists, 458 lines, stdlib-only, non-grabbing `O_RDONLY \| O_NONBLOCK` |
| `main.py` | `get_status`, `set_setting`, `ControllerInputWatcher` lifecycle (`_main`, `_unload`, `_on_deck_resume`, `_on_controller_input_event`) | ✓ VERIFIED | Exists, exposes, validates, and wires all Phase 20 keys/lifecycle |
| `tests/test_chord_settings.py` | Backend settings `unittest` suite | ✓ VERIFIED | Exists, all tests passing |
| `tests/test_input_watch.py` | Backend `hidraw`/`evdev` & `Plugin` lifecycle `unittest` suite | ✓ VERIFIED | Exists, all tests passing |
| `src/chords.ts` | Pure chord schema, unbound `[]` defaults, guide rejection, `mapControllerInputButton` (including `20..23`), `createChordMatcher` | ✓ VERIFIED | Exists, 463 lines, `eslint --max-warnings=0` clean |
| `src/chords.test.ts` | TDD unit test suite | ✓ VERIFIED | Exists, 8/8 tests passing, `eslint --max-warnings=0` clean |
| `src/components/tabs/ChordBindingsCard.tsx` | Interactive Settings card + immediate guide-button warning | ✓ VERIFIED | Exists, `eslint --max-warnings=0` clean |
| `src/components/tabs/ChordBindingsCard.test.tsx` | Interactive UI & fake-timer tests | ✓ VERIFIED | Exists, 8/8 tests passing |
| `src/components/tabs/SettingsTab.tsx` | Always-visible `Notification / Banner Corner` + `<ChordBindingsCard />` | ✓ VERIFIED | Exists, wired to `set_setting` |
| `src/components/tabs/SettingsTab.test.tsx` | SettingsTab wiring, corner selector & rollback tests | ✓ VERIFIED | Exists, 39/39 tests passing |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `src/index.tsx` | `src/bannerBus.ts` | `notifyMessage()` / `handleTrackMetadataNotification` -> `emitBanner(...)` | ✓ WIRED | Verified in `src/index.tsx` and `index.test.tsx` |
| `src/index.tsx` | `src/utils/chime.ts` | `handleTrackMetadataNotification` -> `playNotificationChime(cachedVolume)` | ✓ WIRED | Verified in `src/index.tsx` and `index.test.tsx` |
| `src/components/SilentBanner.tsx` | `src/bannerBus.ts` | `subscribeBanner(...)` in `useEffect` | ✓ WIRED | Verified in `src/components/SilentBanner.tsx` and `SilentBanner.test.tsx` |
| `src/index.tsx` | `src/components/SilentBanner.tsx` | `DeckifyOverlayWrapper` passes `silent_banner_position` precedence & `onVisibilityChange` | ✓ WIRED | Verified in `src/index.tsx` |
| `src/index.tsx` | `SteamClient.Window.SetComposition` | `useGamescopeNotificationComposition(anyHudVisible)` asserts `1` / resets `0` | ✓ WIRED | Verified in `src/index.tsx` and `index.test.tsx` |
| `src/index.tsx` | `src/chords.ts` | `setupChordListener` -> `mapControllerInputButton` + `createChordMatcher` | ✓ WIRED | Verified in `src/index.tsx:557,564` and `index.test.tsx` |
| `py_modules/input_watch.py:ControllerInputWatcher` | `main.py:decky.emit` | `_on_controller_input_event` emits `controller_input` with `{ button, pressed, source }` | ✓ WIRED | Verified in `main.py:207-212,277-284` and `tests/test_input_watch.py` |
| `src/index.tsx:setupChordListener` | `py_modules/input_watch.py:controller_input` | `addEventListener("controller_input", ...)` feeds 50ms cross-source deduplicated `handleButtonEvent` | ✓ WIRED | Verified in `src/index.tsx:517-524,638-651` and `src/index.test.tsx` |
| `main.py` | `py_modules/common.py` | `set_setting` -> `_validate_chord_bindings` -> `_save_settings` | ✓ WIRED | Verified in `main.py` and `test_chord_settings.py` |
| `src/components/tabs/ChordBindingsCard.tsx` | `src/chords.ts` | `GUIDE_BUTTON_IDS`, `CHORD_ACTIONS`, `DEFAULT_CHORD_BINDINGS`, `validateChordBinding` | ✓ WIRED | Verified in `src/components/tabs/ChordBindingsCard.tsx` |
| `src/components/tabs/SettingsTab.tsx` | `main.py` | `updateSetting('silent_banner_position', ...)` & `backendSetSetting('gamepad_chord_bindings', ...)` | ✓ WIRED | Verified in `src/components/tabs/SettingsTab.tsx` and `SettingsTab.test.tsx` |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `TOAST-01` | `20-01`, `20-03`, `20-04`, `20-05` | Silent 3.5s track-change banner (`pointerEvents: "none"`), independent corner placement, optional volume-scaled non-Steam chime, Gamescope `EUIComposition.Notification` | ? NEEDS HUMAN (Automated checks passed) | Code + Vitest/Python tests verified; live Gamescope compositing & Web Audio chime audibility await on-device UAT |
| `CHORD-01` | `20-01`, `20-02`, `20-03`, `20-05`, `20-06`, `20-07` | Unbound-by-default configurable in-game quick-chords (`hidraw`/`evdev` `controller_input` + dual-signature `SteamClient.Input` + `RegisterForControllerStateChanges` + `deck_resumed` + STEAM/QAM rejection warning + 4s `guideHeld` guard) + silent HUD confirmation | ? NEEDS HUMAN (Automated checks passed) | Code + Vitest/Python tests verified; physical Steam Deck in-game `hidraw`/`evdev` & `SteamClient.Input` delivery awaits on-device UAT |

Orphaned requirements mapped to Phase 20 in `.planning/REQUIREMENTS.md`: **None** (`TOAST-01` and `CHORD-01` are both accounted for).

### Behavioral Spot-Checks & Anti-Pattern Scan

| Check | Command | Result | Status |
| --- | --- | --- | --- |
| Full Python unit suite | `py -3 -m unittest discover -s tests -p "test_*.py"` | `Ran 611 tests in 69.532s — OK` | ✓ PASS |
| Full Vitest frontend suite | `pnpm test -- --run` | `21 passed (21)`, `263 passed (263)` | ✓ PASS |
| TypeScript check | `pnpm run typecheck` | `tsc --noEmit` exit 0 | ✓ PASS |
| Repo ESLint | `pnpm run lint` | `0 errors` (762 pre-existing warnings in other files) | ✓ PASS |
| Strict ESLint on Phase 20 modules | `pnpm exec eslint --max-warnings=0 src/types.ts src/bannerBus.ts src/chords.ts src/chords.test.ts src/utils/chime.ts src/utils/chime.test.ts src/components/SilentBanner.tsx src/components/tabs/ChordBindingsCard.tsx` | `0 errors, 0 warnings` | ✓ PASS |
| Rollup production bundle | `pnpm run build` | `created dist in 8.9s` | ✓ PASS |
| Debt marker scan | `Select-String ... -Pattern "TBD\|FIXME\|XXX"` | `0 debt markers` | ✓ PASS |

### Human Verification Required

1. **Silent HUD Banner Corner, Volume-Scaled Chime & Gamescope Compositor Layering (`TOAST-01`, G-20-1 & G-20-2)**
   - **Test:** On a physical Steam Deck in Gaming Mode, disable *Mini Overlay HUD* (`overlay_enabled: false`), set *Notification / Banner Corner* to `bottom-left`, keep *Track Change Notifications* ON and *Silent HUD Banner* ON, launch a Vulkan/Gamescope game, skip tracks with *Notification Sound* OFF then ON, and finally re-enable *Mini Overlay HUD* in `bottom-left`.
   - **Expected:** The 3.5-second `SilentBanner` renders cleanly above the active game window via `EUIComposition.Notification (1)` in `bottom-left` even when *Mini Overlay HUD* is off, plays zero Steam chime when *Notification Sound* is OFF, plays the subtle Web Audio chime scaled by Deckify volume (never Steam native toast) when *Notification Sound* is ON, and offsets by `140px` when *Mini Overlay HUD* is visible in the same corner.
   - **Why human:** SteamOS Gamescope `EUIComposition.Notification (1)` layering over Vulkan games, Web Audio chime audibility, and SteamOS audio chime silence cannot be observed in headless Windows Vitest.

2. **Physical Controller Unbound Defaults, STEAM Rejection & In-Game Chord Execution (`CHORD-01`, G-20-2 & G-20-3)**
   - **Test:** In *Settings → Notifications & Controller Shortcuts → In-Game Quick Chords*, confirm all 8 actions start *Unbound*, attempt to record a combo using the `STEAM` or `(...)` button, then bind `L4 + X` for *Like / Unlike*, `L5` for *Cycle Pinned Playlists*, and `R4` for *Toggle Lyrics HUD*, and trigger them while actively playing a game (including after sleep/resume).
   - **Expected:** All 8 actions default to `Unbound`; pressing `STEAM`/`QAM` immediately cancels recording with the inline SteamOS interception warning; passive backend `hidraw`/`evdev` `controller_input` and `SteamClient.Input` listeners deliver rear-paddle + face button events in-game (without double-firing or blocking game input) so chords trigger optimistic updates/rollbacks and `SilentBanner` confirmations above Gamescope; Expanded Modal suppresses chords; chords continue firing after sleep/resume.
   - **Why human:** Real SteamOS `/dev/hidraw*` / `/dev/input/event*` hardware delivery while Gamescope/Proton holds game focus, sleep/resume re-subscription, and OS-level `STEAM`/`QAM` shortcut interception require physical Steam Deck hardware.

---

_Verified: 2026-11-21T23:35:00Z_
_Verifier: the agent (gsd-verifier)_
