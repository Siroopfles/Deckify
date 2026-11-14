---
phase: 08-controller-l2-r2-ergonomics-trigger-navigation
verified: 2026-11-14T22:54:35Z
status: passed
score: 16/16 must-haves verified
covered_files:
  - ".planning/phases/08-controller-l2-r2-ergonomics-trigger-navigation/08-01-PLAN.md"
  - ".planning/phases/08-controller-l2-r2-ergonomics-trigger-navigation/08-01-SUMMARY.md"
  - ".planning/phases/08-controller-l2-r2-ergonomics-trigger-navigation/08-02-PLAN.md"
  - ".planning/phases/08-controller-l2-r2-ergonomics-trigger-navigation/08-02-SUMMARY.md"
  - ".planning/phases/08-controller-l2-r2-ergonomics-trigger-navigation/08-03-PLAN.md"
  - ".planning/phases/08-controller-l2-r2-ergonomics-trigger-navigation/08-03-SUMMARY.md"
  - ".planning/phases/08-controller-l2-r2-ergonomics-trigger-navigation/08-04-PLAN.md"
  - ".planning/phases/08-controller-l2-r2-ergonomics-trigger-navigation/08-04-SUMMARY.md"
  - "py_modules/common.py"
  - "py_modules/rpc_playback.py"
  - "src/components/DeckifyExpandedModal.test.tsx"
  - "src/components/DeckifyExpandedModal.tsx"
  - "src/components/common/InteractiveRow.tsx"
  - "src/components/common/Sidebar.test.tsx"
  - "src/components/common/Sidebar.tsx"
  - "src/components/common/TrackActionModal.test.tsx"
  - "src/components/common/TrackActionModal.tsx"
  - "src/components/common/TrackRowItem.tsx"
  - "src/components/tabs/AlbumsTab.tsx"
  - "src/components/tabs/ArtistsTab.tsx"
  - "src/components/tabs/PlaylistsTab.tsx"
  - "src/components/tabs/PodcastsTab.tsx"
  - "src/components/tabs/QueueTab.tsx"
  - "src/components/tabs/SearchTab.tsx"
  - "src/components/tabs/SettingsTab.test.tsx"
  - "src/components/tabs/SettingsTab.tsx"
  - "src/components/tabs/SoundtracksTab.tsx"
  - "src/hooks/usePlaybackStatus.ts"
  - "src/hooks/useTriggerNavigation.ts"
  - "src/types.ts"
  - "src/utils/listNavigation.test.ts"
  - "src/utils/listNavigation.ts"
  - "src/utils/triggerController.test.ts"
  - "src/utils/triggerController.ts"
  - "tests/test_final_coverage.py"
  - "tests/test_py_modules.py"
covered_digest: "v4:sha256:32e9fe8e7ebe17056f37281ca2371ffdcc82e200895d68a6d433b3820d41b984"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 14/14
  uat_gaps_closed:
    - "Native <div ref={contentPaneRef} data-testid='content-pane'> wrapper around <Focusable> in DeckifyExpandedModal.tsx"
    - "SEEK_ACCUMULATION_WINDOW_MS = 600 (> TRIGGER_DEBOUNCE_MS = 300) in DeckifyExpandedModal.tsx"
    - "TrackActionModal focus transfer on open (modalContainerRef / pickerContainerRef) and focus restore on close"
    - "toggle_like_track HTTP 403 Forbidden actionable error message and handleToggleLike error toast"
  gaps_remaining: []
  regressions: []
---

# Phase 08: Controller L2/R2 Ergonomics & Trigger Navigation Verification Report

**Phase Goal:** Provide reliable, responsive controller ergonomics inside the Deckify modal — fixing Y (options) and X (like) buttons, pinning "Back to Steam (B)" cleanly in the sidebar, and enabling L2/R2 analog triggers for rapid playback seeking and fast library list paging without bleeding into active games.
**Verified:** 2026-11-14T22:54:35Z
**Status:** passed
**Re-verification:** Yes — after UAT gap-closure plan `08-04`

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | `TriggerController` enforces Schmidt hysteresis (activate at `>= 0.75`, reset at `<= 0.25`), `300ms` software debounce, and hold-to-repeat (`500ms` initial delay, `300ms` repeat interval) per D-12 and ROADMAP SC 3. | ✓ VERIFIED | `src/utils/triggerController.ts` exports `TRIGGER_PRESS_THRESHOLD = 0.75`, `TRIGGER_RELEASE_THRESHOLD = 0.25`, `TRIGGER_DEBOUNCE_MS = 300`, `TRIGGER_REPEAT_DELAY_MS = 500`, `TRIGGER_REPEAT_INTERVAL_MS = 300`, and `TriggerController.processTrigger`; 7/7 tests pass in `src/utils/triggerController.test.ts`. |
| 2 | Analog trigger polling (`navigator.getGamepads`) and `FocusNavController.m_rgGamepadInputSources[0]` subscriptions are strictly scoped to `DeckifyExpandedModal` mount and fully cleaned up on unmount per D-12, CTRL-03, and ROADMAP SC 4. | ✓ VERIFIED | `src/hooks/useTriggerNavigation.ts` binds `RegisterForGamepadButtonDown`/`Up`, `requestAnimationFrame`, and `window` listeners in `useEffect(..., [])` and unregisters, cancels rAF, removes listeners, and resets `TriggerController` on unmount; verified by `DeckifyExpandedModal.test.tsx`. |
| 3 | Sub-modal and input suppression pauses L2/R2 trigger actions whenever `ActionMenu` (`actionTrack`), `PlaylistPickerModal` (`showAddToPlaylistModal`), or any `INPUT`/`TEXTAREA` element has focus per D-14. | ✓ VERIFIED | `DeckifyExpandedModal.tsx` passes `suppressed: Boolean(actionTrack \|\| showAddToPlaylistModal)` to `useTriggerNavigation`; `useTriggerNavigation.ts` checks `isTextInputFocused()` (`INPUT`/`TEXTAREA`) and resets `TriggerController`; verified in `DeckifyExpandedModal.test.tsx`. |
| 4 | Pressing `Y` (`OPTIONS`/4) opens `ActionMenu` and pressing `X` (`SECONDARY`/3) toggles like on focused list rows and on the active track in `NowPlayingTab`/`LyricsTab` via `FocusNavController` + `vgp_onbuttondown` with `80ms` dedup. | ✓ VERIFIED | `useTriggerNavigation.ts` deduplicates `L1`/`R1`/`X`/`Y` within `ACTION_DEDUP_MS = 80`; `DeckifyExpandedModal.tsx` handles `Y` and `X` using `focusedTrackRef.current` or active `track` in `now_playing`/`lyrics`; verified in `DeckifyExpandedModal.test.tsx`. |
| 5 | `Back to Steam (B)` is pinned in a fixed footer outside the scrollable sidebar tab list inside a parent `<Focusable flow-children="column">`, remaining visible and reachable via D-pad Down/Up. | ✓ VERIFIED | `src/components/common/Sidebar.tsx` wraps an `overflowY: "auto"` tab container and a `flexShrink: 0` pinned `Back to Steam (B)` footer (`minHeight: 44`) inside `<Focusable flow-children="column">`; 3/3 tests pass in `src/components/common/Sidebar.test.tsx`. |
| 6 | Pulling L2 or R2 in `NowPlayingTab` or `LyricsTab` accumulates consecutive deltas over `SEEK_ACCUMULATION_WINDOW_MS = 600` (> `TRIGGER_DEBOUNCE_MS = 300`), updates seekbar preview immediately via `clock.scrubTo`, clamps target to `[0, Math.max(0, duration_ms - 1000)]`, preserves D-pad focus, and dispatches one seek RPC per D-01, D-02, D-03, and ROADMAP SC 1. | ✓ VERIFIED | `DeckifyExpandedModal.tsx` exports `SEEK_ACCUMULATION_WINDOW_MS = 600` (line 46) and uses it in `seekDebounceTimerRef.current = setTimeout(..., SEEK_ACCUMULATION_WINDOW_MS)` (line 659), calling `clock.scrubTo?.(targetMs)` with `[0, Math.max(0, durationMs - 1000)]` clamp and `handleSeekPlayback(targetMs)`; verified by 350ms/600ms accumulation test in `DeckifyExpandedModal.test.tsx`. |
| 7 | Seek RPC failures display an error toast (`"Playback seek failed — Spotify did not respond. Try again or check your active device."`), and unloaded/missing tracks ignore trigger seeks without crashing. | ✓ VERIFIED | `src/hooks/usePlaybackStatus.ts` catches `res.ok === false` and exceptions in `onSeekCommit` to call `toaster.toast(...)`; `DeckifyExpandedModal.tsx` guards `if (!track \|\| durationMs <= 0) return;`. |
| 8 | Floating indicator pill displays accumulated seek delta (e.g. `"+20s"` / `"-10s"`) and auto-fades after `~1000ms` per D-02. | ✓ VERIFIED | `DeckifyExpandedModal.tsx` renders `[data-testid="trigger-indicator-pill"]` via `showPill(...)` with `1000ms` timeout; verified in `DeckifyExpandedModal.test.tsx`. |
| 9 | Context-aware controller hint bar renders in the modal footer (toggleable via `show_controller_hints`) with tab-specific copy per D-13. | ✓ VERIFIED | `DeckifyExpandedModal.tsx` renders `[data-testid="controller-hint-bar"]` when `show_controller_hints !== false` with `"L2/R2 Seek · X Like · Y Options · L1/R1 Tabs"`, `"L2/R2 Page · X Like · Y Options · L1/R1 Tabs"`, and `"L1/R1 Tabs · B Back"`; verified in `DeckifyExpandedModal.test.tsx`. |
| 10 | `SettingsTab` exposes `"Controller & Trigger Navigation"` card with `ToggleField`s and `SliderField`s (`Seek Step (Seconds)` `5–30` step `5`, `Library Page Jump (Items)` `5–50` step `5`) persisted via `DEFAULT_SETTINGS` in `py_modules/common.py` per D-04, D-11, D-13. | ✓ VERIFIED | `src/components/tabs/SettingsTab.tsx` uses `ToggleField` and `SliderField` backed by `src/types.ts` (`EngineSettings`) and `py_modules/common.py` (`DEFAULT_SETTINGS`); verified by `SettingsTab.test.tsx` (11 tests) and `tests/test_py_modules.py`. |
| 11 | Pulling L2 or R2 in list views jumps `±pageSize` items (default `15`) or across alphabetical letter anchors (`A -> B -> C`) when `data-deckify-sorted="az"`, clamps to `[0, length - 1]`, jumps to first/last on short lists (`length <= pageSize`), and calls `onLoadMore` on R2 at the end of paginated lists per D-05, D-07, D-08, and ROADMAP SC 2. | ✓ VERIFIED | `src/utils/listNavigation.ts` (`computeListJump`) implements `±pageSize`, A–Z anchor jumping, short-list first/last, clamping, and `shouldLoadMore`; `DeckifyExpandedModal.tsx` invokes `loadLikedTracks(true)` when `shouldLoadMore` on `liked` tab; 5/5 tests pass in `src/utils/listNavigation.test.ts`. |
| 12 | Empty lists (`length === 0`), single-element lists, and equal adjacent alphabetical labels are handled safely without errors or spurious pills. | ✓ VERIFIED | `computeListJump` returns `null` for `length === 0`, handles `length === 1`, and skips equal adjacent anchors; verified in `src/utils/listNavigation.test.ts`. |
| 13 | Pulling L2/R2 in library lists finds the real `HTMLDivElement` `contentPaneRef` wrapping `<Focusable>`, scrolls the target row into view (`scrollIntoView({ block: 'nearest' })`), transfers D-pad focus (`targetEl.focus()`), and ignores triggers when focus is inside `Sidebar` per D-06 and D-10. | ✓ VERIFIED | `DeckifyExpandedModal.tsx` attaches `ref={contentPaneRef}` and `data-testid="content-pane"` to a native `<div>` wrapping `<Focusable data-testid="content-pane-focusable">` (lines 874–881), guards with `if (!contentPaneRef.current?.contains(document.activeElement)) return;` (line 675), and queries `[data-deckify-list-item="true"]` (line 678); verified in `DeckifyExpandedModal.test.tsx` (10/10 tests pass). |
| 14 | Floating indicator pill displays list position (`"16 / 120"` or letter `"M"`) and auto-fades after `~1000ms` per D-09, across all 9 list tabs (`LikedSongsTab`, `RecentTab`, `PlaylistsTab`, `AlbumsTab`, `ArtistsTab`, `PodcastsTab`, `SearchTab`, `QueueTab`, `SoundtracksTab`). | ✓ VERIFIED | `InteractiveRow.tsx` and `TrackRowItem.tsx` pass `data-deckify-list-item="true"` and `data-deckify-label`, all 7 remaining list tabs tag their rows, `ArtistsTab.tsx` and `SoundtracksTab.tsx` set `data-deckify-sorted="az"`, and `DeckifyExpandedModal.tsx` calls `showPill(result.badge)`. |
| 15 | Opening `TrackActionModal` saves `document.activeElement`, focuses the first `tabIndex={0}` `InteractiveRow` on open (both `track-action-modal` and `playlist-picker-overlay`) via `requestAnimationFrame`, and restores focus to the previously focused element on close or unmount. | ✓ VERIFIED | `src/components/common/TrackActionModal.tsx` saves `previousFocusRef.current = document.activeElement` (line 61), focuses `[tabindex="0"]` in `pickerContainerRef` or `modalContainerRef` inside `requestAnimationFrame` (lines 63–69), sets `tabIndex={0}` on `Play Track` (line 140), first playlist row (line 254), and empty-state `Cancel` (line 269), and restores `previousFocusRef.current?.focus?.()` on close/unmount (lines 71–85); 3/3 tests pass in `src/components/common/TrackActionModal.test.tsx`. |
| 16 | Like toggle failures (including Spotify HTTP `403 Forbidden` on `me/tracks`) return a sanitized, actionable error message from `toggle_like_track` and surface an error toast via `handleToggleLike` instead of failing silently. | ✓ VERIFIED | `py_modules/rpc_playback.py` catches `urllib.error.HTTPError` with `code == 403` in `toggle_like_track` (lines 233–238) and returns `"Spotify rejected library access (403 Forbidden). Re-authenticate in Settings or check Spotify Developer Mode allowlist."`; `DeckifyExpandedModal.tsx` `handleToggleLike` calls `showToast(res?.error \|\| "Failed to update Liked Songs")` on `!res?.ok` and in `catch` (lines 405–410); verified in `DeckifyExpandedModal.test.tsx` and `tests/test_final_coverage.py`. |

**Score:** 16/16 truths verified (0 present, behavior-unverified)

### Advisory (New Scope, Unevidenced)

None.

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/utils/triggerController.ts` | Schmidt hysteresis + debounce + repeat state machine | ✓ VERIFIED | Exists, substantive, wired via `useTriggerNavigation.ts`, tested in `triggerController.test.ts`. |
| `src/utils/triggerController.test.ts` | Unit tests for `TriggerController` | ✓ VERIFIED | 7/7 tests passing. |
| `src/hooks/useTriggerNavigation.ts` | Modal-scoped gamepad/trigger/keyboard hook | ✓ VERIFIED | Exists, substantive, wired into `DeckifyExpandedModal.tsx`. |
| `src/components/DeckifyExpandedModal.tsx` | Native `div` `contentPaneRef` wrapper, `SEEK_ACCUMULATION_WINDOW_MS = 600`, `handleToggleLike` error toast, list jump, pill, hint bar | ✓ VERIFIED | Exists, substantive, wired to `useTriggerNavigation`, `clock.scrubTo`, `computeListJump`, `backendToggleLike`. |
| `src/components/DeckifyExpandedModal.test.tsx` | Modal controller, 600ms seek accumulation, native `div` `content-pane`, and Like 403 toast tests | ✓ VERIFIED | 10/10 tests passing. |
| `src/components/common/TrackActionModal.tsx` | Focus transfer to first `InteractiveRow[tabIndex=0]` on open and focus restoration on close/unmount | ✓ VERIFIED | Exists, substantive, wired to `DeckifyExpandedModal.tsx`. |
| `src/components/common/TrackActionModal.test.tsx` | Unit tests for initial focus transfer, playlist picker focus transfer, and focus restoration | ✓ VERIFIED | 3/3 tests passing. |
| `py_modules/rpc_playback.py` | Actionable 403 Forbidden error message in `toggle_like_track` | ✓ VERIFIED | Exists, substantive, wired to `backendToggleLike` RPC. |
| `tests/test_final_coverage.py` | Unit tests for `toggle_like_track` 403 Forbidden error handling | ✓ VERIFIED | Passes within 433-test Python suite. |
| `src/components/common/Sidebar.tsx` | Pinned `Back to Steam (B)` footer outside scrollable tabs | ✓ VERIFIED | Exists, substantive, wired inside `DeckifyExpandedModal.tsx`. |
| `src/components/common/Sidebar.test.tsx` | Sidebar footer structure tests | ✓ VERIFIED | 3/3 tests passing. |
| `src/hooks/usePlaybackStatus.ts` | Seek RPC error handling with Decky toaster notification | ✓ VERIFIED | Exists, substantive, wired to `backendSeekPlayback` and `toaster.toast`. |
| `src/components/tabs/SettingsTab.tsx` | `Controller & Trigger Navigation` toggles and sliders | ✓ VERIFIED | Exists, substantive, wired to `backendSetSetting` and `SliderField`/`ToggleField`. |
| `src/components/tabs/SettingsTab.test.tsx` | SettingsTab trigger control tests | ✓ VERIFIED | 11/11 tests passing. |
| `src/types.ts` | `EngineSettings` trigger fields | ✓ VERIFIED | `trigger_nav_enabled`, `trigger_seek_seconds`, `trigger_page_size`, `show_controller_hints` defined. |
| `py_modules/common.py` | `DEFAULT_SETTINGS` trigger defaults | ✓ VERIFIED | All 4 keys defined with defaults `True`, `10`, `15`, `True`; tested in `tests/test_py_modules.py`. |
| `src/utils/listNavigation.ts` | Pure `computeListJump` helper | ✓ VERIFIED | Exists, substantive, wired into `DeckifyExpandedModal.tsx`. |
| `src/utils/listNavigation.test.ts` | Unit tests for `computeListJump` | ✓ VERIFIED | 5/5 tests passing. |
| `src/components/common/InteractiveRow.tsx` | Pass-through `data-deckify-list-item`, `data-deckify-label`, `tabIndex` | ✓ VERIFIED | Exists, substantive, wired to `<Focusable>`. |
| `src/components/common/TrackRowItem.tsx` | Automatic track row tagging | ✓ VERIFIED | Exists, substantive, covers `LikedSongsTab` and `RecentTab`. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `src/hooks/useTriggerNavigation.ts` | `src/utils/triggerController.ts` | `TriggerController.processTrigger` | ✓ WIRED | Verified by `gsd-tools query verify.key-links` and direct inspection. |
| `src/components/DeckifyExpandedModal.tsx` | `src/hooks/useTriggerNavigation.ts` | `useTriggerNavigation({ enabled, suppressed, onTrigger, onAction })` | ✓ WIRED | Verified by `gsd-tools query verify.key-links` and direct inspection. |
| `src/components/common/Sidebar.tsx` | `@decky/ui Focusable` | Outer `<Focusable flow-children="column">` wrapping scrollable tabs + pinned footer | ✓ WIRED | Verified by `gsd-tools query verify.key-links` and direct inspection. |
| `src/components/DeckifyExpandedModal.tsx` | `src/hooks/usePlaybackClock.ts` | `clock.scrubTo(targetMs)` with `SEEK_ACCUMULATION_WINDOW_MS = 600` | ✓ WIRED | Verified by `gsd-tools query verify.key-links` (`08-04-PLAN.md`) and direct inspection. |
| `src/components/tabs/SettingsTab.tsx` | `py_modules/common.py` | `backendSetSetting('trigger_seek_seconds' \| 'trigger_page_size' \| 'trigger_nav_enabled' \| 'show_controller_hints')` | ✓ WIRED | Verified by `gsd-tools query verify.key-links` and direct inspection. |
| `src/components/DeckifyExpandedModal.tsx` | `src/utils/listNavigation.ts` | `computeListJump(labels, currentIndex, direction, pageSize, sortedAz)` | ✓ WIRED | Verified by `gsd-tools query verify.key-links` and direct inspection. |
| `src/components/DeckifyExpandedModal.tsx` | `native <div ref={contentPaneRef} data-testid="content-pane">` | `contentPaneRef.current?.contains(document.activeElement)` and `querySelectorAll('[data-deckify-list-item="true"]')` | ✓ WIRED | Verified by `gsd-tools query verify.key-links` (`08-04-PLAN.md`) and direct inspection. |
| `src/components/common/TrackActionModal.tsx` | `InteractiveRow[tabIndex=0]` | `useEffect` + `requestAnimationFrame` focus transfer and `previousFocusRef` restoration | ✓ WIRED | Verified by `gsd-tools query verify.key-links` (`08-04-PLAN.md`) and direct inspection. |
| `src/components/DeckifyExpandedModal.tsx` | `py_modules/rpc_playback.py` | `handleToggleLike` shows `showToast(res?.error \|\| "Failed to update Liked Songs")` when `!res?.ok` | ✓ WIRED | Verified by `gsd-tools query verify.key-links` (`08-04-PLAN.md`) and direct inspection. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Full Vitest suite (14 files, 109 tests) | `pnpm test -- --run` | 14 passed (109 passed) | ✓ PASS |
| TypeScript compiler check | `pnpm run typecheck` | Exit code 0 (`tsc --noEmit`) | ✓ PASS |
| Python backend test suite | `py -m unittest discover -s tests -p "test_*.py"` | 433 tests passed (`OK`) | ✓ PASS |
| `08-04` git commits exist | `gsd-tools query verify.commits 70859eb 605f630 77d0fcd` | 3/3 valid | ✓ PASS |
| `08-04` artifacts & key links | `gsd-tools query verify.artifacts` & `verify.key-links` | 6/6 artifacts, 4/4 key links | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `CTRL-01` | `08-02-PLAN.md`, `08-04-PLAN.md` | User can pull L2 or R2 triggers in playback views (`NowPlayingTab`, `LyricsTab`) to execute blind -10s or +10s seeking without losing D-pad controller focus. | ✓ SATISFIED | Accumulated 600ms L2/R2 seeking in `DeckifyExpandedModal.tsx`, `TrackActionModal` focus transfer/restore, `toggle_like_track` 403 handling + `handleToggleLike` toast, `SettingsTab.tsx` `SliderField`, `DeckifyExpandedModal.test.tsx`. |
| `CTRL-02` | `08-03-PLAN.md`, `08-04-PLAN.md` | User can pull L2 or R2 triggers in library lists (`LikedSongsTab`, `PlaylistsTab`, `AlbumsTab`, `ArtistsTab`) to jump ±15 items or alphabet sections. | ✓ SATISFIED | `computeListJump` in `src/utils/listNavigation.ts`, native `div` `contentPaneRef` focus-guarded scroll+focus in `DeckifyExpandedModal.tsx`, row tagging across all 9 list tabs. |
| `CTRL-03` | `08-01-PLAN.md`, `08-04-PLAN.md` | Triggers enforce Schmidt hysteresis (0.75 activate, 0.25 reset) and are strictly scoped to the open modal to prevent in-game input conflicts. | ✓ SATISFIED | `TriggerController` (`0.75`/`0.25`), `useTriggerNavigation` modal-scoped lifecycle and cleanup, `triggerController.test.ts` and `DeckifyExpandedModal.test.tsx`. |

Orphaned requirements: None (all 3 Phase 8 requirements in `REQUIREMENTS.md` are claimed and satisfied).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| None | - | Zero `TBD`/`FIXME`/`XXX` debt markers or stub implementations found in Phase 8 files | ℹ️ Info | Clean |

### Human Verification Required

None — all automated behavioral, structural, typecheck, and backend persistence checks passed.

### Gaps Summary

No gaps found. All 16 observable truths (including all 3 UAT gap-closure fixes from `08-04`), 20 artifacts, 9 key links, and 3 requirements (`CTRL-01`, `CTRL-02`, `CTRL-03`) are verified against the actual codebase.

---

_Verified: 2026-11-14T22:54:35Z_
_Verifier: the agent (gsd-verifier)_
