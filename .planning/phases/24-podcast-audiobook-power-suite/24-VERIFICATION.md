---
phase: 24-podcast-audiobook-power-suite
verified: 2026-11-23T18:55:10Z
status: human_needed
score: 26/26 must-haves verified
covered_files:
  - ".planning/phases/24-podcast-audiobook-power-suite/24-01-PLAN.md"
  - ".planning/phases/24-podcast-audiobook-power-suite/24-01-SUMMARY.md"
  - ".planning/phases/24-podcast-audiobook-power-suite/24-02-PLAN.md"
  - ".planning/phases/24-podcast-audiobook-power-suite/24-02-SUMMARY.md"
  - ".planning/phases/24-podcast-audiobook-power-suite/24-03-PLAN.md"
  - ".planning/phases/24-podcast-audiobook-power-suite/24-03-SUMMARY.md"
  - ".planning/phases/24-podcast-audiobook-power-suite/24-04-PLAN.md"
  - ".planning/phases/24-podcast-audiobook-power-suite/24-04-SUMMARY.md"
  - ".planning/phases/24-podcast-audiobook-power-suite/24-05-PLAN.md"
  - ".planning/phases/24-podcast-audiobook-power-suite/24-05-SUMMARY.md"
  - ".planning/phases/24-podcast-audiobook-power-suite/24-06-PLAN.md"
  - ".planning/phases/24-podcast-audiobook-power-suite/24-06-SUMMARY.md"
  - ".planning/phases/24-podcast-audiobook-power-suite/24-07-PLAN.md"
  - ".planning/phases/24-podcast-audiobook-power-suite/24-07-SUMMARY.md"
  - ".planning/phases/24-podcast-audiobook-power-suite/24-08-PLAN.md"
  - ".planning/phases/24-podcast-audiobook-power-suite/24-08-SUMMARY.md"
  - "main.py"
  - "py_modules/common.py"
  - "py_modules/engine.py"
  - "py_modules/rpc_library.py"
  - "py_modules/rpc_playback.py"
  - "src/components/DeckifyExpandedModal.test.tsx"
  - "src/components/DeckifyExpandedModal.tsx"
  - "src/components/common/TrackActionModal.test.tsx"
  - "src/components/common/TrackActionModal.tsx"
  - "src/components/tabs/NowPlayingTab.test.tsx"
  - "src/components/tabs/NowPlayingTab.tsx"
  - "src/components/tabs/PodcastsTab.test.tsx"
  - "src/components/tabs/PodcastsTab.tsx"
  - "src/hooks/usePlaybackClock.test.ts"
  - "src/hooks/usePlaybackClock.ts"
  - "src/hooks/usePlaybackStatus.ts"
  - "src/index.test.tsx"
  - "src/index.tsx"
  - "src/types.ts"
  - "src/utils/playback.test.ts"
  - "src/utils/playback.ts"
  - "tests/test_discovery.py"
  - "tests/test_podcast_suite.py"
covered_digest: "v4:sha256:07fdf12ba18bab730df788ed9357cb412463d29ccd012eb7bd030a84025fbc4d"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 24/24
  gaps_closed:
    - "G-24-1: set_playback_speed now calls module-level _save_settings(plugin._settings) imported from py_modules.common; make_plugin() in tests/test_podcast_suite.py no longer stubs _save_settings"
    - "G-24-2: Removed duplicate -15s/+15s row under ProgressScrubBar, added pointer-drag and onGamepadDirection Left/Right scrubbing to ProgressScrubBar, and adapted TrackActionModal labels via isSpokenContent(actionTrack)"
    - "G-24-3: ProgressScrubBar moves pointer/touch dragging off @decky/ui <Focusable> onto an inner native <div role=\"slider\"> hit-target (padding: 10px 0, touchAction: none, userSelect: none, pointerEvents: none on visual children) with window-level pointermove/pointerup/pointercancel listeners and post-drag synthetic onClick deduplication"
    - "G-24-4: ProgressScrubBar's <Focusable> registers as a focusable, selectable leaf node in SteamOS FocusNavController by passing onActivate (toggling isScrubbing), onCancelButton (exiting active scrub selection without closing the modal), onOKActionDescription={isScrubbing ? \"Done Scrubbing\" : \"Scrub ←/→\"}, data-deckify-focused, and aria-label=\"Seek Playback\", while handleGamepadDirection returns true on DIR_LEFT/DIR_RIGHT (preventing spatial focus jump to Sidebar) and false on DIR_UP/DIR_DOWN"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "On Steam Deck, navigate D-pad Up from the transport row to focus ProgressScrubBar, press A (onActivate) or scrub Left/Right via D-pad, press B to exit active scrub mode without closing the modal, and test touchscreen/mouse dragging on the slider."
    expected: "Focus lands on ProgressScrubBar (showing focus halo and 'Scrub ←/→' legend), D-pad Left/Right steps playback position without jumping focus to the left Sidebar, pressing A toggles 'Done Scrubbing' mode and B exits scrub selection cleanly, and touchscreen/mouse dragging commits a single seek on release."
    why_human: "SteamOS GamepadUI FocusNavController spatial focus registration, footer legend updates, and touchscreen pointer capture require on-device verification."
---

# Phase 24: Podcast & Audiobook Power Suite Verification Report

**Phase Goal:** Users listening to podcast episodes and audiobooks have dedicated playback speed controls, `-15s`/`+15s` smart-skip transport and trigger actions, visual episode resume progress bars, and *Unplayed*/*In Progress* filtering.
**Verified:** 2026-11-23T18:55:10Z
**Status:** human_needed
**Re-verification:** Yes — after UAT gap closure (Plan 24-08 / G-24-4)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | `set_playback_speed` validates speed against `{0.5..2.0}`, invokes CDP `PlayerAPI.setSpeed` on `spotify_client`, and returns `{ ok: false, unsupported_backend: true }` on `librespot` | ✓ VERIFIED | `py_modules/engine.py`, `py_modules/rpc_playback.py:653-684`, `tests/test_podcast_suite.py` (9 tests pass) |
| 2 | Transitioning from spoken content to music in `_poll_playback` resets `_playback_speed` to `1.0x` while preserving `preferred_podcast_speed` on disk | ✓ VERIFIED | `main.py`, `tests/test_podcast_suite.py` (`test_poll_player_music_auto_reset_and_podcast_restore` passes) |
| 3 | Transitioning from music to podcast/audiobook restores `preferred_podcast_speed` and emits `playback_speed_changed` | ✓ VERIFIED | `main.py`, `tests/test_podcast_suite.py` (`test_poll_player_music_auto_reset_and_podcast_restore` passes) |
| 4 | `get_show_episodes` sanitizes `show_id`, requests `shows/{id}/episodes` with `market=from_token`, and normalizes `resume_position_ms` and `fully_played` | ✓ VERIFIED | `py_modules/rpc_library.py`, `tests/test_podcast_suite.py` (`test_get_show_episodes_sanitizes_and_normalizes` passes) |
| 5 | `SPOTIFY_SCOPES` includes `user-read-playback-position` and `CURRENT_SCOPES_VERSION` is bumped to `8` | ✓ VERIFIED | `py_modules/common.py`, `tests/test_podcast_suite.py` (`test_scopes_version_8_includes_playback_position` passes) |
| 6 | `isSpokenContent` detects `episode`, `chapter`, and `audiobook` `media_type` or `:episode:`/`:chapter:` URIs without false positives on music tracks | ✓ VERIFIED | `src/utils/playback.ts`, `src/utils/playback.test.ts` (12 tests pass) |
| 7 | `QAM_SPEED_CYCLE` cycles `1.0 -> 1.25 -> 1.5 -> 1.75 -> 2.0 -> 0.5 -> 0.75 -> 1.0` and `PLAYBACK_SPEED_OPTIONS` exposes `0.5x`–`2.0x` | ✓ VERIFIED | `src/utils/playback.ts`, `src/utils/playback.test.ts` |
| 8 | `filterEpisodes` filters `all`, `unplayed`, and `in_progress`, and `formatRemainingTime` formats `"Xm left"` / `"<1m left"` | ✓ VERIFIED | `src/utils/playback.ts`, `src/utils/playback.test.ts` |
| 9 | `PlaybackClockController` scales elapsed time by `playbackSpeed` and re-anchors `(basePosition, syncTime)` when `playbackSpeed` changes | ✓ VERIFIED | `src/hooks/usePlaybackClock.ts`, `src/hooks/usePlaybackStatus.ts`, `src/hooks/usePlaybackClock.test.ts` (19 tests pass) |
| 10 | `NowPlayingTab` replaces Previous/Next with `-15s`/`+15s` smart-skip `RoundBtn`s for spoken content and renders `@decky/ui` `Dropdown` (`0.5x`–`2.0x`) | ✓ VERIFIED | `src/components/tabs/NowPlayingTab.tsx:361-442`, `src/components/tabs/NowPlayingTab.test.tsx` (9 tests pass) |
| 11 | `NowPlayingTab` disables speed `Dropdown` with helper caption when `audio_backend !== "spotify_client"` and hides it for music tracks | ✓ VERIFIED | `src/components/tabs/NowPlayingTab.tsx`, `src/components/tabs/NowPlayingTab.test.tsx` |
| 12 | Clicking a show in `PodcastsTab` opens `ShowEpisodesView` with `Back to Podcasts`, show header, and episode list | ✓ VERIFIED | `src/components/tabs/PodcastsTab.tsx`, `src/components/tabs/PodcastsTab.test.tsx` (4 tests pass) |
| 13 | `ShowEpisodesView` and `Saved Episodes` render `All`, `Unplayed`, and `In Progress` pills in `<Focusable flow-children="horizontal">` with `"No Matching Episodes"` empty state | ✓ VERIFIED | `src/components/tabs/PodcastsTab.tsx`, `src/components/tabs/PodcastsTab.test.tsx` |
| 14 | `EpisodeRow` renders bottom `4px` green resume progress bar and `"Played"` / `"{N}m left"` badges | ✓ VERIFIED | `src/components/tabs/PodcastsTab.tsx`, `src/components/tabs/PodcastsTab.test.tsx` |
| 15 | `DeckifyExpandedModal` adapts L2/R2 triggers to `-15s`/`+15s` via `isSpokenRef`, wires `handleSetPlaybackSpeed` and `handleOpenShow` (with `B`-button dismissal) | ✓ VERIFIED | `src/components/DeckifyExpandedModal.tsx`, `src/components/DeckifyExpandedModal.test.tsx` (25 tests pass) |
| 16 | `QuickAccessMenu` (`src/index.tsx`) exposes compact speed cycle `DialogButton` between `-15s` and `+15s` synced with `playback_speed_changed` | ✓ VERIFIED | `src/index.tsx`, `src/index.test.tsx` (37 tests pass) |
| 17 | `set_playback_speed` persists `preferred_podcast_speed` via `_save_settings(plugin._settings)` imported from `py_modules.common` without raising `AttributeError` | ✓ VERIFIED | `py_modules/rpc_playback.py:9, 682`, `tests/test_podcast_suite.py:14-22, 52-66` |
| 18 | `NowPlayingTab` renders no duplicate `-15s`/`+15s` row under `ProgressScrubBar` for music or spoken content, keeping `-15s`/`+15s` in `renderTransportRow` for spoken content and `Previous`/`Next` for music | ✓ VERIFIED | `src/components/tabs/NowPlayingTab.tsx:274-344, 361-442`, `src/components/tabs/NowPlayingTab.test.tsx` |
| 19 | `ProgressScrubBar` keeps `@decky/ui` `<Focusable>` exclusively for D-pad/keyboard focus and `onGamepadDirection` Left/Right + `ArrowLeft`/`ArrowRight` scrubbing | ✓ VERIFIED | `src/components/tabs/NowPlayingTab.tsx:223-241, 305-325`, `src/components/tabs/NowPlayingTab.test.tsx:385-417` |
| 20 | `TrackActionModal` uses `isSpokenContent(actionTrack)` to show `"Play Episode"` / `"Go to Show (...)"` and hides `"Start Track Radio"` / `"Go to Album"` for podcasts and audiobooks | ✓ VERIFIED | `src/components/common/TrackActionModal.tsx:14, 90, 145, 158, 176, 181`, `src/components/common/TrackActionModal.test.tsx` (5 tests pass) |
| 21 | Pointer and touch dragging is handled by a native `<div role="slider">` hit-target inside `<Focusable>` with `padding: "10px 0"`, `touchAction: "none"`, `userSelect: "none"`, and `pointerEvents: "none"` on visual track/fill/thumb children | ✓ VERIFIED | `src/components/tabs/NowPlayingTab.tsx:108, 326-340`, `src/components/tabs/NowPlayingTab.test.tsx:487-537` |
| 22 | Pressing `pointerdown` on the native hit-target calls `e.preventDefault()` and `e.stopPropagation()` and attaches `window`-level `pointermove`, `pointerup`, and `pointercancel` listeners scoped to `activePointerIdRef`, cleaning them up on completion, cancel, or unmount | ✓ VERIFIED | `src/components/tabs/NowPlayingTab.tsx:149-215, 242-260, 285`, `src/components/tabs/NowPlayingTab.test.tsx:487-557` |
| 23 | Completing a pointer drag commits the seek once via `onSeekPlayback` (or `handleSeekDelta` fallback) and suppresses the trailing synthetic `onClick` so no duplicate seek occurs | ✓ VERIFIED | `src/components/tabs/NowPlayingTab.tsx:183-200, 261-270`, `src/components/tabs/NowPlayingTab.test.tsx:523-537` |
| 24 | Standalone clicks on `<div role="slider">` (when not preceded by a pointer drag) still commit a seek normally | ✓ VERIFIED | `src/components/tabs/NowPlayingTab.tsx:261-270`, `src/components/tabs/NowPlayingTab.test.tsx:531-537` |
| 25 | `ProgressScrubBar`'s `<Focusable>` passes `onActivate` (toggling `isScrubbing`), `onCancelButton` (exiting active scrub selection without closing the modal when `isScrubbing` is true), `onOKActionDescription={isScrubbing ? "Done Scrubbing" : "Scrub ←/→"}`, `data-deckify-focused={isFocused ? "true" : undefined}`, and `aria-label="Seek Playback"` so SteamOS GamepadUI's `FocusNavController` registers it as a focusable, selectable leaf node (G-24-4) | ✓ VERIFIED | `src/components/tabs/NowPlayingTab.tsx:276, 287, 305-325`, `src/components/tabs/NowPlayingTab.test.tsx:420-476` |
| 26 | `handleGamepadDirection` returns `true` when handling `GamepadButton.DIR_LEFT` or `GamepadButton.DIR_RIGHT` (preventing spatial navigation from jumping focus to the left `Sidebar` while scrubbing) and returns `false` for `DIR_UP`/`DIR_DOWN` (clearing `isScrubbing` so vertical navigation to the transport row works naturally) (G-24-4) | ✓ VERIFIED | `src/components/tabs/NowPlayingTab.tsx:230-241`, `src/components/tabs/NowPlayingTab.test.tsx:406-416` |

**Score:** 26/26 truths verified

### Advisory (New Scope, Unevidenced)

None

### Key Link Verification (Plans 24-06, 24-07 & 24-08)

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `py_modules/rpc_playback.py` | `py_modules/common.py` | `from py_modules.common import _save_settings` | ✓ WIRED | Line 9 imports `_save_settings`; line 682 calls `_save_settings(plugin._settings)` |
| `src/components/common/TrackActionModal.tsx` | `src/utils/playback.ts` | `isSpokenContent(actionTrack)` | ✓ WIRED | Line 14 imports `isSpokenContent`; line 90 computes `const isSpoken = isSpokenContent(actionTrack)` |
| `src/components/tabs/NowPlayingTab.tsx` | `window.addEventListener` | `bindWindowScrubListeners` `pointermove`/`pointerup`/`pointercancel` during active drag | ✓ WIRED | Lines 207-214 attach and detach `window` pointer listeners |
| `src/components/tabs/NowPlayingTab.tsx` | `@decky/ui Focusable` | `onActivate` + `onCancelButton` + `onOKActionDescription` + `onGamepadDirection` returning boolean | ✓ WIRED | Lines 230-241 return `boolean` from `handleGamepadDirection`; lines 305-325 wire `onActivate`, `onCancelButton`, `onOKActionDescription`, `data-deckify-focused`, and `aria-label="Seek Playback"` onto `<Focusable>` |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| POD-01 | 24-01, 24-02, 24-03, 24-05, 24-06 | Playback speed controls (`0.75x`–`2.0x` / `0.5x`–`2.0x`, `1.0x` music auto-reset, persistent `preferred_podcast_speed` via `_save_settings`) in `NowPlayingTab` and QAM + `-15s`/`+15s` smart-skip transport, L2/R2 triggers, and pointer/D-pad `ProgressScrubBar` | ✓ SATISFIED | Backend RPC (`_save_settings(plugin._settings)`) + `_poll_playback` auto-reset, `usePlaybackClock` scaling, `NowPlayingTab` dropdown, `-15s`/`+15s` transport, `ProgressScrubBar` native slider drag + D-pad scrub, `DeckifyExpandedModal` L2/R2, `QuickAccessMenu` speed pill |
| POD-02 | 24-01, 24-02, 24-04, 24-05, 24-06, 24-07, 24-08 | Per-episode resume progress bars, `"Played"` badges (`resume_point`), *All*/*Unplayed*/*In Progress* filtering in `PodcastsTab`, spoken-content `TrackActionModal` labels, native `<div role="slider">` `ProgressScrubBar` pointer-drag (G-24-3), and controller-focusable/selectable `ProgressScrubBar` `<Focusable>` with boolean `onGamepadDirection` (G-24-4) | ✓ SATISFIED | `get_show_episodes` RPC (`market=from_token`), `filterEpisodes` / `formatRemainingTime`, `PodcastsTab` `ShowEpisodesView`, `EpisodeFilterBar`, `EpisodeRow`, `TrackActionModal` `isSpokenContent` labels, `NowPlayingTab` controller-focusable `<Focusable>` wrapping native `<div role="slider">` scrub bar |

No orphaned requirements.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Phase 24 Python backend suite | `py -3 -m unittest tests.test_podcast_suite -v` | 9 tests ran, OK (0.269s) | ✓ PASS |
| `NowPlayingTab` Vitest unit suite (including G-24-3 & G-24-4) | `pnpm test -- --run src/components/tabs/NowPlayingTab.test.tsx` | 9 tests passed (0.311s) | ✓ PASS |

### Anti-Patterns Found

Scanned 24-08 modified files (`src/components/tabs/NowPlayingTab.tsx`, `src/components/tabs/NowPlayingTab.test.tsx`) for `TBD`, `FIXME`, `XXX` debt markers — 0 matches found.

### Human Verification Required

1. **SteamOS GamepadUI Controller Focus/Selection & Touchscreen Drag on `ProgressScrubBar` (Re-test G-24-3 & G-24-4)**
   - **Test:** On Steam Deck, navigate D-pad Up from the transport row to focus `ProgressScrubBar`, press `A` (`onActivate`) or scrub Left/Right via D-pad, press `B` to exit active scrub mode without closing the modal, and test touchscreen/mouse dragging on the slider.
   - **Expected:** Focus lands on `ProgressScrubBar` (showing focus halo and `"Scrub ←/→"` legend), D-pad Left/Right steps playback position without jumping focus to the left `Sidebar`, pressing `A` toggles `"Done Scrubbing"` mode and `B` exits scrub selection cleanly, and touchscreen/mouse dragging commits a single seek on release.
   - **Why human:** SteamOS GamepadUI `FocusNavController` spatial focus registration, footer legend updates, and touchscreen pointer capture require on-device verification.

---

_Verified: 2026-11-23T18:55:10Z_
_Verifier: the agent (gsd-verifier)_
