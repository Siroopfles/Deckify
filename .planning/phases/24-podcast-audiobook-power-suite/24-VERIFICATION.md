---
phase: 24-podcast-audiobook-power-suite
verified: 2026-11-22T20:45:00Z
status: human_needed
score: 20/20 must-haves verified
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
covered_digest: "v4:sha256:f20eceb7c66e04262f17eac971492bd23b7a7f42c812e1f1b14ffafb1754bb5a"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 16/16
  gaps_closed:
    - "G-24-1: set_playback_speed now calls module-level _save_settings(plugin._settings) imported from py_modules.common; make_plugin() in tests/test_podcast_suite.py no longer stubs _save_settings"
    - "G-24-2: Removed duplicate -15s/+15s row under ProgressScrubBar, added pointer-drag and onGamepadDirection Left/Right scrubbing to ProgressScrubBar, and adapted TrackActionModal labels via isSpokenContent(actionTrack)"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Play a podcast episode on Steam Deck using the Official Spotify Client engine, change playback speed via NowPlayingTab Dropdown and QAM speed cycle pill, then skip to a music track and back to a podcast."
    expected: "Audio playback speed changes audibly (0.5x-2.0x) with zero false QAM error toasts, progress clock stays synchronized, switching to music resets speed to 1.0x, and returning to a podcast restores the preferred speed."
    why_human: "Live Official Spotify Client CDP PlayerAPI.setSpeed execution and audible playback cannot be verified without a running SteamOS + Spotify Client instance."
  - test: "Navigate PodcastsTab, NowPlayingTab (including ProgressScrubBar pointer drag and D-pad Left/Right scrubbing), TrackActionModal options on a podcast episode, and QAM spoken-content controls using the Steam Deck controller."
    expected: "NowPlayingTab has no duplicate -15s/+15s row under ProgressScrubBar, ProgressScrubBar scrubs via pointer drag and D-pad Left/Right, music keeps Previous/Next, podcasts keep -15s/+15s in transport row, and TrackActionModal displays Play Episode / Go to Show (...) without Start Track Radio or Go to Album."
    why_human: "SteamOS GamepadUI CEF visual rendering, touchscreen pointer drag, and spatial D-pad focus navigation require on-device verification."
---

# Phase 24: Podcast & Audiobook Power Suite Verification Report

**Phase Goal:** Users listening to podcast episodes and audiobooks have dedicated playback speed controls, `-15s`/`+15s` smart-skip transport and trigger actions, visual episode resume progress bars, and *Unplayed*/*In Progress* filtering.
**Verified:** 2026-11-22T20:45:00Z
**Status:** human_needed
**Re-verification:** Yes — after UAT gap closure (Plan 24-06)

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
| 10 | `NowPlayingTab` replaces Previous/Next with `-15s`/`+15s` smart-skip `RoundBtn`s for spoken content and renders `@decky/ui` `Dropdown` (`0.5x`–`2.0x`) | ✓ VERIFIED | `src/components/tabs/NowPlayingTab.tsx:299-327`, `src/components/tabs/NowPlayingTab.test.tsx` (7 tests pass) |
| 11 | `NowPlayingTab` disables speed `Dropdown` with helper caption when `audio_backend !== "spotify_client"` and hides it for music tracks | ✓ VERIFIED | `src/components/tabs/NowPlayingTab.tsx`, `src/components/tabs/NowPlayingTab.test.tsx` |
| 12 | Clicking a show in `PodcastsTab` opens `ShowEpisodesView` with `Back to Podcasts`, show header, and episode list | ✓ VERIFIED | `src/components/tabs/PodcastsTab.tsx`, `src/components/tabs/PodcastsTab.test.tsx` (4 tests pass) |
| 13 | `ShowEpisodesView` and `Saved Episodes` render `All`, `Unplayed`, and `In Progress` pills in `<Focusable flow-children="horizontal">` with `"No Matching Episodes"` empty state | ✓ VERIFIED | `src/components/tabs/PodcastsTab.tsx`, `src/components/tabs/PodcastsTab.test.tsx` |
| 14 | `EpisodeRow` renders bottom `4px` green resume progress bar and `"Played"` / `"{N}m left"` badges | ✓ VERIFIED | `src/components/tabs/PodcastsTab.tsx`, `src/components/tabs/PodcastsTab.test.tsx` |
| 15 | `DeckifyExpandedModal` adapts L2/R2 triggers to `-15s`/`+15s` via `isSpokenRef`, wires `handleSetPlaybackSpeed` and `handleOpenShow` (with `B`-button dismissal) | ✓ VERIFIED | `src/components/DeckifyExpandedModal.tsx`, `src/components/DeckifyExpandedModal.test.tsx` (25 tests pass) |
| 16 | `QuickAccessMenu` (`src/index.tsx`) exposes compact speed cycle `DialogButton` between `-15s` and `+15s` synced with `playback_speed_changed` | ✓ VERIFIED | `src/index.tsx`, `src/index.test.tsx` (37 tests pass) |
| 17 | `set_playback_speed` persists `preferred_podcast_speed` via `_save_settings(plugin._settings)` imported from `py_modules.common` without raising `AttributeError` | ✓ VERIFIED | `py_modules/rpc_playback.py:9, 682`, `tests/test_podcast_suite.py:14-22, 52-66` (passes without `_save_settings` stub) |
| 18 | `NowPlayingTab` renders no duplicate `-15s`/`+15s` row under `ProgressScrubBar` for music or spoken content, keeping `-15s`/`+15s` in `renderTransportRow` for spoken content and `Previous`/`Next` for music | ✓ VERIFIED | `src/components/tabs/NowPlayingTab.tsx:218-255, 299-327`, `src/components/tabs/NowPlayingTab.test.tsx` |
| 19 | `ProgressScrubBar` supports pointer drag (`onPointerDown`/`onPointerMove`/`onPointerUp`/`onPointerCancel`) and gamepad D-pad Left/Right scrubbing (`onGamepadDirection`) | ✓ VERIFIED | `src/components/tabs/NowPlayingTab.tsx:142-216, 232-248`, `src/components/tabs/NowPlayingTab.test.tsx` |
| 20 | `TrackActionModal` uses `isSpokenContent(actionTrack)` to show `"Play Episode"` / `"Go to Show (...)"` and hides `"Start Track Radio"` / `"Go to Album"` for podcasts and audiobooks | ✓ VERIFIED | `src/components/common/TrackActionModal.tsx:14, 90, 145, 158, 176, 181`, `src/components/common/TrackActionModal.test.tsx` (5 tests pass) |

**Score:** 20/20 truths verified

### Advisory (New Scope, Unevidenced)

None

### Key Link Verification (Plan 24-06)

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `py_modules/rpc_playback.py` | `py_modules/common.py` | `from py_modules.common import _save_settings` | ✓ WIRED | Line 9 imports `_save_settings`; line 682 calls `_save_settings(plugin._settings)` |
| `src/components/common/TrackActionModal.tsx` | `src/utils/playback.ts` | `isSpokenContent(actionTrack)` | ✓ WIRED | Line 14 imports `isSpokenContent`; line 90 computes `const isSpoken = isSpokenContent(actionTrack)` |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| POD-01 | 24-01, 24-02, 24-03, 24-05, 24-06 | Playback speed controls (`0.75x`–`2.0x` / `0.5x`–`2.0x`, `1.0x` music auto-reset, persistent `preferred_podcast_speed` via `_save_settings`) in `NowPlayingTab` and QAM + `-15s`/`+15s` smart-skip transport, L2/R2 triggers, and pointer/D-pad `ProgressScrubBar` | ✓ SATISFIED | Backend RPC (`_save_settings(plugin._settings)`) + `_poll_playback` auto-reset, `usePlaybackClock` scaling, `NowPlayingTab` dropdown, `-15s`/`+15s` transport, `ProgressScrubBar` drag/D-pad scrub, `DeckifyExpandedModal` L2/R2, `QuickAccessMenu` speed pill |
| POD-02 | 24-01, 24-02, 24-04, 24-05, 24-06 | Per-episode resume progress bars, `"Played"` badges (`resume_point`), *All*/*Unplayed*/*In Progress* filtering in `PodcastsTab`, and spoken-content `TrackActionModal` labels | ✓ SATISFIED | `get_show_episodes` RPC (`market=from_token`), `filterEpisodes` / `formatRemainingTime`, `PodcastsTab` `ShowEpisodesView`, `EpisodeFilterBar`, `EpisodeRow`, `TrackActionModal` `isSpokenContent` labels |

No orphaned requirements.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Phase 24 Python backend suite | `py -3 -m unittest tests.test_podcast_suite -v` | 9 tests ran, OK (0.290s) | ✓ PASS |
| Full Vitest frontend suite | `pnpm test -- --run` | 27 test files, 324 tests passed (2.80s) | ✓ PASS |
| TypeScript, ESLint, Rollup build | `pnpm typecheck; pnpm exec eslint --quiet src/; pnpm build` | All exited 0; `dist/` created in 8.1s | ✓ PASS |

### Anti-Patterns Found

Scanned 24-06 modified production files (`py_modules/rpc_playback.py`, `src/components/tabs/NowPlayingTab.tsx`, `src/components/common/TrackActionModal.tsx`) for `TBD`, `FIXME`, `XXX` debt markers — 0 matches found.

### Human Verification Required

1. **Live Official Spotify Client CDP Speed Control (Re-test G-24-1)**
   - **Test:** Play a podcast episode on Steam Deck using the Official Spotify Client engine, change playback speed via `NowPlayingTab` Dropdown and QAM speed cycle pill, then skip to a music track and back to a podcast.
   - **Expected:** Audio playback speed changes audibly (`0.5x`–`2.0x`) with zero false QAM error toasts, progress clock stays synchronized, switching to music resets speed to `1.0x`, and returning to a podcast restores the preferred speed.
   - **Why human:** Live Official Spotify Client CDP `PlayerAPI.setSpeed` execution and audible playback cannot be verified without a running SteamOS + Spotify Client instance.

2. **SteamOS GamepadUI Controller Navigation, Scrubbing & Episode Modal Wording (Re-test G-24-2)**
   - **Test:** Navigate `PodcastsTab`, `NowPlayingTab` (including `ProgressScrubBar` pointer drag and D-pad Left/Right scrubbing), `TrackActionModal` options on a podcast episode, and QAM spoken-content controls using the Steam Deck controller (`D-pad`, `A`/`B`, `L2`/`R2`).
   - **Expected:** `NowPlayingTab` has no duplicate `-15s`/`+15s` row under `ProgressScrubBar`, `ProgressScrubBar` scrubs via pointer drag and D-pad Left/Right, music keeps `Previous`/`Next`, podcasts keep `-15s`/`+15s` in the transport row, and `TrackActionModal` displays `"Play Episode"` / `"Go to Show (...)"` without `"Start Track Radio"` or `"Go to Album"`.
   - **Why human:** SteamOS GamepadUI CEF visual rendering, touchscreen pointer drag, and spatial D-pad focus navigation require on-device verification.

---

_Verified: 2026-11-22T20:45:00Z_
_Verifier: the agent (gsd-verifier)_
