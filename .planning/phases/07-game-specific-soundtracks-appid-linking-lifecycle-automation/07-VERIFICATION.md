---
phase: 07-game-specific-soundtracks-appid-linking-lifecycle-automation
verified: 2026-11-14T20:14:25Z
status: passed
score: 18/18 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 17/18
  gaps_closed:
    - "07-UAT.md 2/2 human verification tests passed"
    - "07-SECURITY.md 11/11 threats closed (threats_open: 0)"
    - "QAM Bind current music to game DialogButton wrapped in <Focusable flow-children=\"horizontal\"> in src/index.tsx:490-510"
    - "tests/test_soundtrack.py::TestPluginRpc::test_bind_current_music_appends_and_resolves_name passes (432/432 OK)"
  gaps_remaining: []
  regressions: []
covered_files:
  - ".planning/phases/07-game-specific-soundtracks-appid-linking-lifecycle-automation/07-01-PLAN.md"
  - ".planning/phases/07-game-specific-soundtracks-appid-linking-lifecycle-automation/07-01-SUMMARY.md"
  - ".planning/phases/07-game-specific-soundtracks-appid-linking-lifecycle-automation/07-02-PLAN.md"
  - ".planning/phases/07-game-specific-soundtracks-appid-linking-lifecycle-automation/07-02-SUMMARY.md"
  - ".planning/phases/07-game-specific-soundtracks-appid-linking-lifecycle-automation/07-03-PLAN.md"
  - ".planning/phases/07-game-specific-soundtracks-appid-linking-lifecycle-automation/07-03-SUMMARY.md"
  - "main.py"
  - "py_modules/common.py"
  - "py_modules/images.py"
  - "py_modules/rpc_library.py"
  - "py_modules/rpc_playback.py"
  - "py_modules/soundtrack.py"
  - "py_modules/vdf_parser.py"
  - "src/components/DeckifyExpandedModal.test.tsx"
  - "src/components/DeckifyExpandedModal.tsx"
  - "src/components/common/Sidebar.tsx"
  - "src/components/tabs/PlaylistPickerModal.test.tsx"
  - "src/components/tabs/PlaylistPickerModal.tsx"
  - "src/components/tabs/SoundtracksTab.test.tsx"
  - "src/components/tabs/SoundtracksTab.tsx"
  - "src/components/tabs/soundtrackUtils.ts"
  - "src/index.test.tsx"
  - "src/index.tsx"
  - "src/types.ts"
  - "tests/test_e2e_requirements.py"
  - "tests/test_images.py"
  - "tests/test_soundtrack.py"
  - "tests/test_vdf_parser.py"
covered_digest: "v4:sha256:2c6805f0f15259c46c583fd21b6308fb899dfa3d91839489b61491a1491987f0"
---

# Phase 7: Game-Specific Soundtracks (appId Linking & Lifecycle Automation) Verification Report

**Phase Goal:** Automatically trigger configured Spotify soundtrack playlists or albums upon game launch and cleanly restore normal listening state on exit.
**Verified:** 2026-11-14T20:14:25Z
**Status:** passed
**Re-verification:** Yes — after final `bind_current_music_to_game` + QAM `<Focusable>` fixes (`py_modules/soundtrack.py`, `src/index.tsx`, `tests/test_soundtrack.py`), `07-UAT.md` (`2/2` pass), and `07-SECURITY.md` (`threats_open: 0`).

> **Note on ROADMAP mode:** `ROADMAP.md` lists `**Mode**: mvp` for Phase 7, while the phase goal is written in standard outcome format rather than `"As a [role], I want to [capability], so that [outcome]."`. Verification was executed against all 4 ROADMAP Success Criteria and all `must_haves` declared in `07-01-PLAN.md`, `07-02-PLAN.md`, and `07-03-PLAN.md`.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | User can link a Spotify playlist, album, or URI to any installed Steam game `appId` in Deckify settings with an auto-play preference toggle (SC-1) | ✓ VERIFIED | `SoundtracksTab.tsx` + `PlaylistPickerModal.tsx` + `SoundtrackManager.save_profile` (`py_modules/soundtrack.py`) + `always_auto_start` toggle; verified by `SoundtracksTab.test.tsx` (8/8) & `test_sound01_...` |
| 2 | Launching an associated Steam game automatically triggers playback of its configured soundtrack after a 3–5s launcher debounce window (SC-2) | ✓ VERIFIED | `SoundtrackManager.handle_app_lifecycle` (`py_modules/soundtrack.py`) sleeps `soundtrack_launch_debounce` (default `3.5s`), wakes Connect via `_auto_transfer_and_play`, verified by `test_launch_snapshot_and_debounced_play` & `test_sound02_...` |
| 3 | Exiting the game cleanly restores the user's pre-game playback context, track, and seek position (or pauses playback if preferred) (SC-3) | ✓ VERIFIED | `SoundtrackManager._run_exit` (`py_modules/soundtrack.py`) sleeps `soundtrack_exit_debounce` (`3.0s`), saves `last_track_uri`/`last_position_ms`, and calls `play_tracks(..., position_ms=...)` (`py_modules/rpc_playback.py`) or pauses per `exit_policy`; verified by `test_exit_saves_position_and_restores_snapshot` & `test_sound03_...` |
| 4 | Non-Steam shortcuts (normalized via unsigned 32-bit CRC32 conversion) and intermediate Proton launcher child processes do not trigger false launch/exit flapping (SC-4) | ✓ VERIFIED | `compute_non_steam_appid` (`py_modules/vdf_parser.py`) applies `(crc \| 0x80000000) & 0xFFFFFFFF`; `handle_app_lifecycle` cancels pending `_exit_task`/`_launch_task` on rapid transitions; verified by `test_crc_top_bit_unsigned`, `test_raw_signed_becomes_unsigned`, `test_rapid_exit_relaunch_cancels` |
| 5 | Valve binary `shortcuts.vdf` and `libraryfolders.vdf` files parse into structured game dictionaries without external dependencies | ✓ VERIFIED | `py_modules/vdf_parser.py` uses only Python stdlib; 30s TTL cache in `get_installed_games`; passing in `test_vdf_parser.py` |
| 6 | Manual user pause during gameplay prevents music from resuming upon game exit | ✓ VERIFIED | `main.py` calls `manager.record_manual_pause()` on `pause` / `play_pause` while playing; `_run_exit` skips restore when `_user_paused_in_game` is `True`; verified by `test_manual_pause_hooked_in_control_playback` & `test_manual_pause_prevents_restore` |
| 7 | Multi-playlist modes (shuffle pool, random picker, sequential rotation) resolve selected playlist context accurately | ✓ VERIFIED | `SoundtrackManager.resolve_playlist` handles `shuffle`, `random`, and `rotation` (`rotation_index` modulo length); verified by `TestMultiPlaylist` |
| 8 | Unbound games honor the configured global policy and support ducking-only overrides | ✓ VERIFIED | `_run_launch` checks `soundtrack_default_playlist` then `soundtrack_unbound_policy` (`keep_playing`/`pause`); `main.py` respects `manager.ducking_override(valid_id)`; verified by `TestUnbound` & `test_ducking_override_false_skips_duck` |
| 9 | Soundtracks tab is accessible from Expanded Modal sidebar navigation with dedicated gamepad icon | ✓ VERIFIED | `src/types.ts` adds `"soundtracks"`; `Sidebar.tsx` renders `<SidebarBtn id="soundtracks" label="Soundtracks" icon={<FaGamepad size={12} />} ... />`; `DeckifyExpandedModal.tsx` mounts `<SoundtracksTab />` |
| 10 | Installed games list renders Steam games and Non-Steam shortcuts with search filter and Non-Steam badges | ✓ VERIFIED | `SoundtracksTab.tsx` fetches `get_installed_games`, filters via `filterGames`, sorts running/configured first via `sortGames`, and renders Non-Steam badge |
| 11 | Game card allows assigning multiple playlists/albums, selecting playback mode, and configuring volume/ducking overrides | ✓ VERIFIED | `SoundtracksTab.tsx` supports multi-playlist chips with remove `[X]`, mode/resume/exit dropdowns, `always_auto_start` toggle, volume override slider, and ducking override toggle with 500ms debounced save |
| 12 | `PlaylistPickerModal` allows selecting from My Playlists, My Albums, or direct Spotify search with full D-pad spatial navigation | ✓ VERIFIED | `PlaylistPickerModal.tsx` uses `ModalRoot`, `flow-children="horizontal"` tab bar (`playlists`, `albums`, `search`), 300ms debounced `search_spotify`, and `DeckifyImage` proxy; 6/6 tests pass in `PlaylistPickerModal.test.tsx` |
| 13 | Quick Access Menu mini-player displays 1-click button wrapped in `<Focusable flow-children="horizontal">` to bind currently playing music to active game and appends/resolves context metadata | ✓ VERIFIED | `src/index.tsx:490-510` wraps `<DialogButton>` in `<Focusable style={{ display: "flex", width: "100%" }} flow-children="horizontal">`; `py_modules/soundtrack.py:405-443` implements `_resolve_context_metadata` and append logic in `bind_current_music_to_game`; verified by passing `tests/test_soundtrack.py::TestPluginRpc::test_bind_current_music_appends_and_resolves_name` (432/432 OK) |
| 14 | `GameSessions.RegisterForAppLifetimeNotifications` dispatches launch and exit events to backend `SoundtrackManager` with exit debounce | ✓ VERIFIED | `src/index.tsx:836-873` subscribes to `SteamClient.GameSessions.RegisterForAppLifetimeNotifications` and calls `backendHandleAppLifetimeEvent(appId, true/false)` with 3000ms exit ducking timer and cleanup in `onDismount` |
| 15 | Steam CDN game covers (`steamstatic.com`, `steamcdn-a.akamaihd.net`, `steampowered.com`) load via base64 proxy with `User-Agent` header and fall back to `FaGamepad` on missing/failed covers (Gap 1, `SOUND-01`) | ✓ VERIFIED | `py_modules/images.py:10-18,100` extends `ALLOWED_SPOTIFY_DOMAINS` and sets `User-Agent: Deckify/1.0`; `SoundtracksTab.tsx:256` passes `fallback={<FaGamepad size={18} color="#888" />}` |
| 16 | `PlaylistPickerModal` opens via `@decky/ui` `showModal()`, traps controller focus, closes on B without closing `DeckifyExpandedModal`, queries playlists/albums at offset `0`, and visibly adds selected playlists with non-empty URIs to the game profile (Gap 2, `SOUND-01`) | ✓ VERIFIED | `SoundtracksTab.tsx:127-144` uses `showModal(<PlaylistPickerModal ... />)` with functional `setProfiles((prev) => ...)`; `PlaylistPickerModal.tsx:31-62,103-111` passes `0` to `backendGetPlaylists(0)`/`backendGetSavedAlbums(0)` and calls `closeModal?.()`; `rpc_library.py:43,862` and `soundtrackUtils.ts:112-120` emit `uri` |
| 17 | Pressing B on a focused/selected `SliderField` or other child control in `DeckifyExpandedModal` exits the control without closing the modal, while unhandled `vgp_oncancel` events bubble to `ModalRoot` (Gap 3, `SOUND-01`) | ✓ VERIFIED | `DeckifyExpandedModal.tsx:649-683` attaches `vgp_oncancel` in bubble phase (`false`) and removed direct `closeModal?.()` fallback; verified by `DeckifyExpandedModal.test.tsx` (2/2) |
| 18 | QAM displays the 1-click `Bind current music to game` button when a game is running (including games already running at plugin startup via `Router.MainRunningApp`) and `SteamClient.GameSessions.RegisterForAppLifetimeNotifications` dispatches launch/exit lifecycle events (Gap 4, `SOUND-02`, `SOUND-03`) | ✓ VERIFIED | `src/index.tsx:199-200,836-845` seeds `activeGameAppId` from `Router.MainRunningApp?.appid`, syncs `Content` on mount via `setActiveGameAppId(currentRunningAppId)`, and subscribes to `SteamClient.GameSessions.RegisterForAppLifetimeNotifications`; verified by `src/index.test.tsx` (1/1) |

**Score:** 18/18 truths verified (0 failed, 0 behavior-unverified)

### Advisory (New Scope, Unevidenced)

None.

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `py_modules/vdf_parser.py` | Binary/text VDF parsing, CRC32 AppID, 30s TTL discovery | ✓ VERIFIED | Stdlib-only, imported and called by `main.py` |
| `py_modules/soundtrack.py` | `SoundtrackManager` debounce, snapshots, multi-playlist, Connect wake-up, `_resolve_context_metadata`, append in `bind_current_music_to_game` | ✓ VERIFIED | Lines 405-443 implement `_resolve_context_metadata` and append-without-overwrite in `bind_current_music_to_game` |
| `py_modules/common.py` | Soundtrack keys in `DEFAULT_SETTINGS` & sanitization | ✓ VERIFIED | Verified |
| `py_modules/rpc_playback.py` | `position_ms` support in `play_tracks` | ✓ VERIFIED | Verified |
| `py_modules/images.py` | Steam CDN domains in `ALLOWED_SPOTIFY_DOMAINS` + `User-Agent: Deckify/1.0` | ✓ VERIFIED | Lines 10-18, 100 |
| `py_modules/rpc_library.py` | Playlist `uri` in `get_playlists` & `search_spotify` | ✓ VERIFIED | Lines 43, 862 |
| `main.py` | Soundtrack RPCs, `control_playback` manual-pause hook, lifecycle dispatch | ✓ VERIFIED | Verified |
| `src/types.ts` | `SoundtrackProfile`, `InstalledGame`, `"soundtracks"` `ViewMode` | ✓ VERIFIED | Verified |
| `src/components/common/Sidebar.tsx` | Soundtracks navigation button (`FaGamepad`) | ✓ VERIFIED | Verified |
| `src/components/DeckifyExpandedModal.tsx` | Soundtracks tab mount + bubble-phase `vgp_oncancel` | ✓ VERIFIED | Lines 649-690 |
| `src/components/tabs/SoundtracksTab.tsx` | `showModal()` picker, functional `setProfiles`, `FaGamepad` fallback | ✓ VERIFIED | Lines 127-144, 256 |
| `src/components/tabs/PlaylistPickerModal.tsx` | `closeModal` support + `offset=0` queries | ✓ VERIFIED | Lines 31-62, 103-111 |
| `src/components/tabs/soundtrackUtils.ts` | Pure sorting/filtering/normalization + `toSelection` URI fallback | ✓ VERIFIED | Lines 112-120 |
| `src/index.tsx` | `SteamClient.GameSessions`, `Router.MainRunningApp` seed, QAM 1-click bind wrapped in `<Focusable flow-children="horizontal">` | ✓ VERIFIED | Lines 199-200, 490-510, 836-868 |
| `tests/test_vdf_parser.py` | VDF & CRC32 unit tests | ✓ VERIFIED | Passing in full suite |
| `tests/test_soundtrack.py` | `SoundtrackManager` & `rpc_library` URI unit tests | ✓ VERIFIED | 432/432 OK (all tests passing, including `test_bind_current_music_appends_and_resolves_name`) |
| `tests/test_images.py` | Steam CDN allowlist & `User-Agent` unit tests | ✓ VERIFIED | Passing in full suite |
| `tests/test_e2e_requirements.py` | E2E tests for `SOUND-01`, `SOUND-02`, `SOUND-03` | ✓ VERIFIED | Passing in full suite |
| `src/components/tabs/SoundtracksTab.test.tsx` | Vitest component tests | ✓ VERIFIED | 8/8 passing |
| `src/components/tabs/PlaylistPickerModal.test.tsx` | Vitest modal tests | ✓ VERIFIED | 6/6 passing |
| `src/components/DeckifyExpandedModal.test.tsx` | Vitest bubble-phase `vgp_oncancel` tests | ✓ VERIFIED | 2/2 passing |
| `src/index.test.tsx` | Vitest `GameSessions` + `Router.MainRunningApp` seed test | ✓ VERIFIED | 1/1 passing |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `main.py handle_app_lifetime_event` | `SoundtrackManager.handle_app_lifecycle` | Direct async call | ✓ WIRED | Also checks `ducking_override` and calls `trigger_ducking` |
| `SoundtrackManager._run_exit` | `rpc_playback.play_tracks` (`position_ms`) | `self.plugin.play_tracks(**kwargs)` | ✓ WIRED | Sends `context_uri`, `offset_uri`, `position_ms` to `me/player/play` |
| `SoundtracksTab.tsx openPlaylistPicker` | `@decky/ui showModal(<PlaylistPickerModal />)` | `onSelect` functional `setProfiles` -> `scheduleSave` | ✓ WIRED | Updates state functionally and persists via `save_game_soundtrack_profile` |
| `py_modules/rpc_library.py` playlist `uri` | `soundtrackUtils.toSelection` -> `addPlaylist` | Playlist/search `uri` field + fallback | ✓ WIRED | Guarantees non-empty `uri` on picked playlists |
| `DeckifyExpandedModal.tsx attachNav` | `ModalRootAny onCancel={closeModal}` | Bubble-phase `vgp_oncancel` (`false`) | ✓ WIRED | Child controls (`SliderField`) can `stopPropagation()` without closing modal |
| `src/index.tsx` `GameSessions` & `MainRunningApp` | `Content` `setActiveGameAppId` & `main.py handle_app_lifetime_event` | `setActiveGameState` + `backendHandleAppLifetimeEvent` | ✓ WIRED | Seeds running game at startup and syncs QAM on mount |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `SOUND-01` | `07-01-PLAN.md`, `07-02-PLAN.md`, `07-03-PLAN.md` | User can bind a Spotify playlist or album to a specific Steam game `appId` in Deckify settings with custom auto-play preference | ✓ SATISFIED | `SoundtracksTab.tsx`, `PlaylistPickerModal.tsx` (`showModal`), `py_modules/images.py`, `py_modules/soundtrack.py`, `test_bind_current_music_appends_and_resolves_name` (432/432 OK) |
| `SOUND-02` | `07-01-PLAN.md`, `07-02-PLAN.md`, `07-03-PLAN.md` | User experiences automatic soundtrack playback upon game launch via `SteamClient.GameSessions.RegisterForAppLifetimeNotifications` with launcher debounce (3-5s) | ✓ SATISFIED | `src/index.tsx:836-856`, `SoundtrackManager.handle_app_lifecycle` (3.5s default), Connect wake-up, `test_sound02_...` |
| `SOUND-03` | `07-01-PLAN.md`, `07-02-PLAN.md`, `07-03-PLAN.md` | User experiences seamless restoration of their pre-game playback state (or automatic pause) when the game exits | ✓ SATISFIED | `SoundtrackManager._run_exit` (3.0s default), `position_ms` restore, `record_manual_pause`, `src/index.tsx:857-866`, `test_sound03_...` |

No orphaned requirements found in `.planning/REQUIREMENTS.md` for Phase 7.

### Anti-Patterns Found

None. Zero `TBD`, `FIXME`, `XXX`, `TODO`, `HACK`, or `PLACEHOLDER` markers found in any Phase 7 files.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Full Python test suite | `py -3 -m unittest discover -s tests -p "test_*.py"` | 432/432 OK | ✓ PASS |
| Full Vitest suite (10 files) | `pnpm test -- --run` | 82/82 OK | ✓ PASS |
| TypeScript type check | `pnpm typecheck` (`tsc --noEmit`) | Exit code 0 | ✓ PASS |
| UAT & Security audits | `07-UAT.md` & `07-SECURITY.md` | `2/2` UAT pass; `11/11` threats closed (`threats_open: 0`) | ✓ PASS |

### Human Verification Required

None — all human verification items in `07-UAT.md` passed (`2/2`).

### Gaps Summary

No gaps remaining. All 18 must-haves, 432 Python tests, 82 Vitest tests, `tsc --noEmit`, 2/2 UAT items, and 11/11 security threats are verified.

---

_Verified: 2026-11-14T20:14:25Z_
_Verifier: the agent (gsd-verifier)_
