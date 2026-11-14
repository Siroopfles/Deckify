---
phase: 07-game-specific-soundtracks-appid-linking-lifecycle-automation
verified: 2026-11-14T18:42:30Z
status: human_needed
score: 14/14 must-haves verified
behavior_unverified: 0
overrides_applied: 0
covered_files:
  - ".planning/phases/07-game-specific-soundtracks-appid-linking-lifecycle-automation/07-01-PLAN.md"
  - ".planning/phases/07-game-specific-soundtracks-appid-linking-lifecycle-automation/07-01-SUMMARY.md"
  - ".planning/phases/07-game-specific-soundtracks-appid-linking-lifecycle-automation/07-02-PLAN.md"
  - ".planning/phases/07-game-specific-soundtracks-appid-linking-lifecycle-automation/07-02-SUMMARY.md"
  - "main.py"
  - "py_modules/common.py"
  - "py_modules/rpc_playback.py"
  - "py_modules/soundtrack.py"
  - "py_modules/vdf_parser.py"
  - "src/components/DeckifyExpandedModal.tsx"
  - "src/components/common/Sidebar.tsx"
  - "src/components/tabs/PlaylistPickerModal.test.tsx"
  - "src/components/tabs/PlaylistPickerModal.tsx"
  - "src/components/tabs/SoundtracksTab.test.tsx"
  - "src/components/tabs/SoundtracksTab.tsx"
  - "src/components/tabs/soundtrackUtils.ts"
  - "src/index.tsx"
  - "src/types.ts"
  - "tests/test_e2e_requirements.py"
  - "tests/test_soundtrack.py"
  - "tests/test_vdf_parser.py"
covered_digest: "v4:sha256:04f66a82d7e35c8260b2c865112022baa7d61a4bfddfb66b6fdf337719ec8642"
human_verification:
  - test: "Open Deckify Expanded Modal -> Soundtracks tab on Steam Deck GamepadUI and navigate with D-pad"
    expected: "Sidebar Soundtracks icon focuses cleanly, game cards and horizontal button/chip rows navigate without focus traps, PlaylistPickerModal opens and selects playlists/albums/search results cleanly, and Steam CDN game covers render via base64 proxy without CSP errors."
    why_human: "Spatial navigation (flow-children='horizontal'), CEF rendering, and controller focus ergonomics can only be verified on SteamOS GamepadUI."
  - test: "Launch a bound Steam game and a Non-Steam shortcut in Gaming Mode, then exit"
    expected: "Soundtrack starts after ~3.5s launch debounce (waking Connect if idle), QAM 'Bind current music to game' button appears while running, and exiting restores pre-game playback context, track, and seek position after ~3.0s debounce (or stays paused if manually paused)."
    why_human: "Live SteamClient.Apps.RegisterForAppLifetimeNotifications events, Proton launcher child processes, and real Spotify Connect device wake-up require a live SteamOS + Spotify session."
---

# Phase 7: Game-Specific Soundtracks (appId Linking & Lifecycle Automation) Verification Report

**Phase Goal:** Automatically trigger configured Spotify soundtrack playlists or albums upon game launch and cleanly restore normal listening state on exit.
**Verified:** 2026-11-14T18:42:30Z
**Status:** human_needed
**Re-verification:** No — initial verification

> **Note on ROADMAP mode:** `ROADMAP.md` lists `**Mode**: mvp` for Phase 7, while the phase goal is written in standard outcome format rather than `"As a [role], I want to [capability], so that [outcome]."`. Verification was executed against all 4 ROADMAP Success Criteria and all `must_haves` declared in `07-01-PLAN.md` and `07-02-PLAN.md`.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | User can link a Spotify playlist, album, or URI to any installed Steam game `appId` in Deckify settings with an auto-play preference toggle (SC-1) | ✓ VERIFIED | `SoundtracksTab.tsx` + `PlaylistPickerModal.tsx` + `SoundtrackManager.save_profile` (`py_modules/soundtrack.py:158-170`) + `always_auto_start` toggle; verified by `SoundtracksTab.test.tsx` (6/6) & `test_sound01_...` |
| 2 | Launching an associated Steam game automatically triggers playback of its configured soundtrack after a 3–5s launcher debounce window (SC-2) | ✓ VERIFIED | `SoundtrackManager.handle_app_lifecycle` (`py_modules/soundtrack.py:246-268`) sleeps `soundtrack_launch_debounce` (default `3.5s`), wakes Connect via `_auto_transfer_and_play` (`py_modules/soundtrack.py:207-219`), verified by `test_launch_snapshot_and_debounced_play` & `test_sound02_...` |
| 3 | Exiting the game cleanly restores the user's pre-game playback context, track, and seek position (or pauses playback if preferred) (SC-3) | ✓ VERIFIED | `SoundtrackManager._run_exit` (`py_modules/soundtrack.py:352-393`) sleeps `soundtrack_exit_debounce` (`3.0s`), saves `last_track_uri`/`last_position_ms`, and calls `play_tracks(..., position_ms=...)` (`py_modules/rpc_playback.py:326-349`) or pauses per `exit_policy`; verified by `test_exit_saves_position_and_restores_snapshot` & `test_sound03_...` |
| 4 | Non-Steam shortcuts (normalized via unsigned 32-bit CRC32 conversion) and intermediate Proton launcher child processes do not trigger false launch/exit flapping (SC-4) | ✓ VERIFIED | `compute_non_steam_appid` (`py_modules/vdf_parser.py:74-80`) applies `(crc | 0x80000000) & 0xFFFFFFFF`; `handle_app_lifecycle` cancels pending `_exit_task`/`_launch_task` on rapid transitions (`py_modules/soundtrack.py:247-263`); verified by `test_crc_top_bit_unsigned`, `test_raw_signed_becomes_unsigned`, `test_rapid_exit_relaunch_cancels` |
| 5 | Valve binary `shortcuts.vdf` and `libraryfolders.vdf` files parse into structured game dictionaries without external dependencies | ✓ VERIFIED | `py_modules/vdf_parser.py` uses only Python stdlib (`struct`, `zlib`, `re`, `glob`, `os`, `time`); 30s TTL cache in `get_installed_games` (`212-226`); 10/10 tests pass in `test_vdf_parser.py` |
| 6 | Manual user pause during gameplay prevents music from resuming upon game exit | ✓ VERIFIED | `main.py:660-664` calls `manager.record_manual_pause()` on `pause` / `play_pause` while playing; `_run_exit` (`py_modules/soundtrack.py:370`) skips restore when `_user_paused_in_game` is `True`; verified by `test_manual_pause_hooked_in_control_playback` & `test_manual_pause_prevents_restore` |
| 7 | Multi-playlist modes (shuffle pool, random picker, sequential rotation) resolve selected playlist context accurately | ✓ VERIFIED | `SoundtrackManager.resolve_playlist` (`py_modules/soundtrack.py:273-286`) handles `shuffle`, `random`, and `rotation` (`rotation_index` modulo length); verified by `TestMultiPlaylist` (4/4 tests) |
| 8 | Unbound games honor the configured global policy and support ducking-only overrides | ✓ VERIFIED | `_run_launch` (`py_modules/soundtrack.py:291-307`) checks `soundtrack_default_playlist` then `soundtrack_unbound_policy` (`keep_playing`/`pause`); `main.py:714-716` respects `manager.ducking_override(valid_id)`; verified by `TestUnbound` (4/4) & `test_ducking_override_false_skips_duck` |
| 9 | Soundtracks tab is accessible from Expanded Modal sidebar navigation with dedicated gamepad icon | ✓ VERIFIED | `src/types.ts:16,31` adds `"soundtracks"`; `Sidebar.tsx:128` renders `<SidebarBtn id="soundtracks" label="Soundtracks" icon={<FaGamepad size={12} />} ... />`; `DeckifyExpandedModal.tsx:907-908` mounts `<SoundtracksTab />` |
| 10 | Installed games list renders Steam games and Non-Steam shortcuts with search filter and Non-Steam badges | ✓ VERIFIED | `SoundtracksTab.tsx` fetches `get_installed_games`, filters via `filterGames`, sorts running/configured first via `sortGames`, and renders Non-Steam badge |
| 11 | Game card allows assigning multiple playlists/albums, selecting playback mode, and configuring volume/ducking overrides | ✓ VERIFIED | `SoundtracksTab.tsx` supports multi-playlist chips with remove `[X]`, mode/resume/exit dropdowns, `always_auto_start` toggle, volume override slider, and ducking override toggle with 500ms debounced save |
| 12 | `PlaylistPickerModal` allows selecting from My Playlists, My Albums, or direct Spotify search with full D-pad spatial navigation | ✓ VERIFIED | `PlaylistPickerModal.tsx` uses `ModalRoot`, `flow-children="horizontal"` tab bar (`playlists`, `albums`, `search`), 300ms debounced `search_spotify`, and `DeckifyImage` proxy; 4/4 tests pass in `PlaylistPickerModal.test.tsx` |
| 13 | Quick Access Menu mini-player displays 1-click button to bind currently playing music to active game | ✓ VERIFIED | `src/index.tsx:217-227,486-508` renders `"Bind current music to game"` `DialogButton` when `activeGameAppId !== null`, calling `backendBindCurrentMusicToGame` |
| 14 | `RegisterForAppLifetimeNotifications` dispatches launch and exit events to backend `SoundtrackManager` with exit debounce | ✓ VERIFIED | `src/index.tsx:834-858` subscribes to `SteamClient.Apps.RegisterForAppLifetimeNotifications` and calls `backendHandleAppLifetimeEvent(appId, true/false)` with 3000ms exit ducking timer and cleanup in `onDismount` |

**Score:** 14/14 truths verified (0 failed, 0 behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `py_modules/vdf_parser.py` | Binary/text VDF parsing, CRC32 AppID, 30s TTL discovery | ✓ VERIFIED | 226 lines, stdlib-only, imported and called by `main.py:44,676` |
| `py_modules/soundtrack.py` | `SoundtrackManager` debounce, snapshots, multi-playlist, Connect wake-up | ✓ VERIFIED | 417 lines, instantiated in `main.py:122,145,670` |
| `py_modules/common.py` | Soundtrack keys in `DEFAULT_SETTINGS` & sanitization | ✓ VERIFIED | Lines 84-88 and 165-175 |
| `py_modules/rpc_playback.py` | `position_ms` support in `play_tracks` | ✓ VERIFIED | Lines 326, 348-349 |
| `main.py` | Soundtrack RPCs, `control_playback` manual-pause hook, lifecycle dispatch | ✓ VERIFIED | Lines 660-721 |
| `src/types.ts` | `SoundtrackProfile`, `InstalledGame`, `"soundtracks"` `ViewMode` | ✓ VERIFIED | Lines 16, 31, 175-179, 251-275 |
| `src/components/common/Sidebar.tsx` | Soundtracks navigation button (`FaGamepad`) | ✓ VERIFIED | Line 128 |
| `src/components/DeckifyExpandedModal.tsx` | Soundtracks tab mount | ✓ VERIFIED | Lines 35, 907-908 |
| `src/components/tabs/SoundtracksTab.tsx` | Installed games list, search, profile editor, `flow-children="horizontal"` | ✓ VERIFIED | 481 lines, wired to `DeckifyExpandedModal` and backend RPCs |
| `src/components/tabs/PlaylistPickerModal.tsx` | Tabbed playlist/album/search picker | ✓ VERIFIED | 240 lines, wired to `SoundtracksTab.tsx` |
| `src/components/tabs/soundtrackUtils.ts` | Pure sorting/filtering/normalization helpers | ✓ VERIFIED | Tested by `SoundtracksTab.test.tsx` and `PlaylistPickerModal.test.tsx` |
| `src/index.tsx` | `RegisterForAppLifetimeNotifications`, QAM 1-click bind, toast listener | ✓ VERIFIED | Lines 67-68, 198-227, 486-508, 830-878 |
| `tests/test_vdf_parser.py` | VDF & CRC32 unit tests | ✓ VERIFIED | 10/10 passing |
| `tests/test_soundtrack.py` | `SoundtrackManager` & `main.py` RPC unit tests | ✓ VERIFIED | 31/31 passing |
| `src/components/tabs/SoundtracksTab.test.tsx` | Vitest component tests | ✓ VERIFIED | 6/6 passing |
| `src/components/tabs/PlaylistPickerModal.test.tsx` | Vitest modal tests | ✓ VERIFIED | 4/4 passing |
| `tests/test_e2e_requirements.py` | E2E tests for `SOUND-01`, `SOUND-02`, `SOUND-03` | ✓ VERIFIED | All 3 SOUND E2E tests passing |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `main.py handle_app_lifetime_event` | `SoundtrackManager.handle_app_lifecycle` | Direct async call (`main.py:717`) | ✓ WIRED | Also checks `ducking_override` and calls `trigger_ducking` |
| `SoundtrackManager._run_exit` | `rpc_playback.play_tracks` (`position_ms`) | `self.plugin.play_tracks(**kwargs)` (`soundtrack.py:209,386`) | ✓ WIRED | Sends `context_uri`, `offset_uri`, `position_ms` to `me/player/play` |
| `Sidebar.tsx` -> `DeckifyExpandedModal.tsx` | `SoundtracksTab.tsx` -> `save_game_soundtrack_profile` | `mode === "soundtracks"` + `callable` RPC | ✓ WIRED | Debounced 500ms save in `SoundtracksTab.tsx:105-114` |
| `SoundtracksTab.tsx` | `PlaylistPickerModal.tsx` | `onSelect` callback (`SoundtracksTab.tsx`) | ✓ WIRED | Updates profile playlists and persists |
| `src/index.tsx` `RegisterForAppLifetimeNotifications` | `main.py handle_app_lifetime_event` | `backendHandleAppLifetimeEvent` callable (`src/index.tsx:67,847,850`) | ✓ WIRED | Updates `activeGameAppId` for QAM bind button |
| `src/index.tsx` QAM 1-click bind | `main.py bind_current_music_to_game` | `backendBindCurrentMusicToGame` callable (`src/index.tsx:68,220`) | ✓ WIRED | Displays toast on completion |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `SOUND-01` | `07-01-PLAN.md`, `07-02-PLAN.md` | User can bind a Spotify playlist or album to a specific Steam game `appId` in Deckify settings with custom auto-play preference | ✓ SATISFIED | `vdf_parser.py`, `SoundtrackManager.save_profile`, `SoundtracksTab.tsx`, `PlaylistPickerModal.tsx`, `test_sound01_...` |
| `SOUND-02` | `07-01-PLAN.md`, `07-02-PLAN.md` | User experiences automatic soundtrack playback upon game launch via `SteamClient.Apps.RegisterForAppLifetimeNotifications` with launcher debounce (3-5s) | ✓ SATISFIED | `src/index.tsx:836`, `SoundtrackManager.handle_app_lifecycle` (3.5s default), Connect wake-up, `test_sound02_...` |
| `SOUND-03` | `07-01-PLAN.md`, `07-02-PLAN.md` | User experiences seamless restoration of their pre-game playback state (or automatic pause) when the game exits | ✓ SATISFIED | `SoundtrackManager._run_exit` (3.0s default), `position_ms` restore, `record_manual_pause`, `test_sound03_...` |

No orphaned requirements found in `.planning/REQUIREMENTS.md` for Phase 7.

### Anti-Patterns Found

None. Zero `TBD`, `FIXME`, `XXX`, `TODO`, `HACK`, or `PLACEHOLDER` markers found in any Phase 7 files.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Python VDF & Soundtrack unit tests | `py -m unittest discover -s tests -p "test_vdf_parser.py"` & `"test_soundtrack.py"` | 10/10 + 31/31 OK | ✓ PASS |
| Full Python test suite (incl. E2E) | `py -m unittest discover -s tests` | 428/428 OK | ✓ PASS |
| Vitest soundtrack component tests | `pnpm test src/components/tabs/SoundtracksTab.test.tsx src/components/tabs/PlaylistPickerModal.test.tsx -- --run` | 10/10 OK | ✓ PASS |
| Full Vitest suite | `pnpm test -- --run` | 75/75 OK (8 files) | ✓ PASS |
| TypeScript type check | `npx tsc --noEmit` | Exit code 0 | ✓ PASS |
| Phase 07 git commits | `gsd-tools query verify.commits a23ace1 4ef4504 9cd4822 c912289 470e269 2562014 5c111b1 bbb6e22` | 8/8 valid | ✓ PASS |

### Human Verification Required

### 1. SteamOS GamepadUI Spatial Navigation & Visual Layout

**Test:** Open Deckify Expanded Modal -> Soundtracks tab on a Steam Deck in Gaming Mode and navigate with the D-pad; open `PlaylistPickerModal`, search, and assign/remove playlists.
**Expected:** Sidebar Soundtracks icon focuses cleanly, game cards and horizontal button/chip rows navigate without focus traps, `PlaylistPickerModal` selects playlists/albums/search results cleanly, and Steam CDN game covers render via base64 proxy without CSP errors.
**Why human:** Spatial navigation (`flow-children="horizontal"`), CEF rendering, and controller focus ergonomics can only be verified on SteamOS GamepadUI.

### 2. Live Game Launch/Exit Lifecycle & Spotify Connect Wake-Up

**Test:** Launch a bound Steam game and a Non-Steam shortcut in Gaming Mode, test the QAM `"Bind current music to game"` button, and exit the game (testing both normal exit and manual pause during gameplay).
**Expected:** Soundtrack starts after ~3.5s launch debounce (waking Connect if idle), QAM bind button appears while running, and exiting restores pre-game playback context, track, and seek position after ~3.0s debounce (or stays paused if manually paused).
**Why human:** Live `SteamClient.Apps.RegisterForAppLifetimeNotifications` events, Proton launcher child processes, and real Spotify Connect device wake-up require a live SteamOS + Spotify session.

---

_Verified: 2026-11-14T18:42:30Z_
_Verifier: the agent (gsd-verifier)_
