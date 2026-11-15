---
phase: 07-game-specific-soundtracks-appid-linking-lifecycle-automation
verified: 2026-11-15T20:34:15Z
status: passed
score: 18/18 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 18/18
  gaps_closed:
    - "Refreshed stale verification report after later phases modified shared files (main.py, py_modules/common.py, py_modules/rpc_library.py, py_modules/rpc_playback.py, py_modules/vdf_parser.py, src/components/DeckifyExpandedModal.tsx, src/components/common/Sidebar.tsx, src/index.tsx, src/types.ts)"
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
covered_digest: "v4:sha256:ef408c2245a73e1c28ff116e8a1f42ac29b9fbed1bcb139e82602caac3da4454"
---

# Phase 7: Game-Specific Soundtracks (appId Linking & Lifecycle Automation) Verification Report

**Phase Goal:** Automatically trigger configured Spotify soundtrack playlists or albums upon game launch and cleanly restore normal listening state on exit.
**Verified:** 2026-11-15T20:34:15Z
**Status:** passed
**Re-verification:** Yes — refreshed stale verification report against current codebase after Phases 8–12 modified shared files (`main.py`, `py_modules/common.py`, `py_modules/rpc_library.py`, `py_modules/rpc_playback.py`, `py_modules/vdf_parser.py`, `src/components/DeckifyExpandedModal.tsx`, `src/components/common/Sidebar.tsx`, `src/index.tsx`, `src/types.ts`). All 18 must-haves remain intact with zero regressions.

> **Note on ROADMAP mode:** `ROADMAP.md` lists `**Mode**: mvp` for Phase 7, while the phase goal is written in standard outcome format rather than `"As a [role], I want to [capability], so that [outcome]."`. Verification was executed against all 4 ROADMAP Success Criteria and all `must_haves` declared in `07-01-PLAN.md`, `07-02-PLAN.md`, and `07-03-PLAN.md`.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | User can link a Spotify playlist, album, or URI to any installed Steam game `appId` in Deckify settings with an auto-play preference toggle (SC-1) | ✓ VERIFIED | `SoundtracksTab.tsx` + `PlaylistPickerModal.tsx` + `SoundtrackManager.save_profile` (`py_modules/soundtrack.py`) + `always_auto_start` toggle; verified by `SoundtracksTab.test.tsx` (9/9) & Python suite (`458/458`) |
| 2 | Launching an associated Steam game automatically triggers playback of its configured soundtrack after a 3–5s launcher debounce window (SC-2) | ✓ VERIFIED | `SoundtrackManager.handle_app_lifecycle` (`py_modules/soundtrack.py`) sleeps `soundtrack_launch_debounce` (default `3.5s`), wakes Connect via `_auto_transfer_and_play`, verified in `tests/test_soundtrack.py` & `tests/test_e2e_requirements.py` |
| 3 | Exiting the game cleanly restores the user's pre-game playback context, track, and seek position (or pauses playback if preferred) (SC-3) | ✓ VERIFIED | `SoundtrackManager._run_exit` (`py_modules/soundtrack.py`) sleeps `soundtrack_exit_debounce` (`3.0s`), saves `last_track_uri`/`last_position_ms`, and calls `play_tracks(..., position_ms=...)` (`py_modules/rpc_playback.py:332,356-357`) or pauses per `exit_policy`; verified in `tests/test_soundtrack.py` & `tests/test_e2e_requirements.py` |
| 4 | Non-Steam shortcuts (normalized via unsigned 32-bit CRC32 conversion) and intermediate Proton launcher child processes do not trigger false launch/exit flapping (SC-4) | ✓ VERIFIED | `compute_non_steam_appid` (`py_modules/vdf_parser.py:75`) applies unsigned 32-bit CRC32 normalization; `handle_app_lifecycle` cancels pending `_exit_task`/`_launch_task` on rapid transitions; verified in `tests/test_vdf_parser.py` & `tests/test_soundtrack.py` |
| 5 | Valve binary `shortcuts.vdf` and `libraryfolders.vdf` files parse into structured game dictionaries without external dependencies | ✓ VERIFIED | `py_modules/vdf_parser.py` uses only Python stdlib; 30s TTL cache in `get_installed_games`; passing in `tests/test_vdf_parser.py` |
| 6 | Manual user pause during gameplay prevents music from resuming upon game exit | ✓ VERIFIED | `main.py:684` calls `manager.record_manual_pause()` on `pause` / `play_pause` while playing; `_run_exit` skips restore when `_user_paused_in_game` is `True`; verified in `tests/test_soundtrack.py` |
| 7 | Multi-playlist modes (shuffle pool, random picker, sequential rotation) resolve selected playlist context accurately | ✓ VERIFIED | `SoundtrackManager.resolve_playlist` handles `shuffle`, `random`, and `rotation` (`rotation_index` modulo length); verified in `tests/test_soundtrack.py` |
| 8 | Unbound games honor the configured global policy and support ducking-only overrides | ✓ VERIFIED | `_run_launch` checks `soundtrack_default_playlist` then `soundtrack_unbound_policy` (`keep_playing`/`pause`); `main.py:735` respects `manager.ducking_override(valid_id)`; verified in `tests/test_soundtrack.py` |
| 9 | Soundtracks tab is accessible from Expanded Modal sidebar navigation with dedicated gamepad icon | ✓ VERIFIED | `src/types.ts:17,33` includes `"soundtracks"`; `src/components/common/Sidebar.tsx:136` renders `<SidebarBtn id="soundtracks" label="Soundtracks" icon={<FaGamepad size={12} />} ... />`; `src/components/DeckifyExpandedModal.tsx:1216-1217` mounts `<SoundtracksTab />` |
| 10 | Installed games list renders Steam games and Non-Steam shortcuts with search filter and Non-Steam badges | ✓ VERIFIED | `SoundtracksTab.tsx` fetches `get_installed_games`, filters via `filterGames`, sorts running/configured first via `sortGames`, and renders Non-Steam badge (`SoundtracksTab.test.tsx` 9/9) |
| 11 | Game card allows assigning multiple playlists/albums, selecting playback mode, and configuring volume/ducking overrides | ✓ VERIFIED | `SoundtracksTab.tsx` supports multi-playlist chips with remove `[X]`, mode/resume/exit dropdowns, `always_auto_start` toggle, volume override slider, and ducking override toggle with 500ms debounced save |
| 12 | `PlaylistPickerModal` allows selecting from My Playlists, My Albums, or direct Spotify search with full D-pad spatial navigation | ✓ VERIFIED | `PlaylistPickerModal.tsx` uses `ModalRoot`, `flow-children="horizontal"` tab bar (`playlists`, `albums`, `search`), 300ms debounced `search_spotify`, and `DeckifyImage` proxy; 6/6 tests pass in `PlaylistPickerModal.test.tsx` |
| 13 | Quick Access Menu mini-player displays 1-click button wrapped in `<Focusable flow-children="horizontal">` to bind currently playing music to active game and appends/resolves context metadata | ✓ VERIFIED | `src/index.tsx:478` renders `<span>Bind current music to game</span>` inside `<Focusable flow-children="horizontal">`; `py_modules/soundtrack.py` implements `_resolve_context_metadata` and append logic in `bind_current_music_to_game`; verified by `tests/test_soundtrack.py` & `src/index.test.tsx` (12/12) |
| 14 | `GameSessions.RegisterForAppLifetimeNotifications` dispatches launch and exit events to backend `SoundtrackManager` with exit debounce | ✓ VERIFIED | `src/index.tsx:1134-1136` subscribes to `SteamClient.GameSessions.RegisterForAppLifetimeNotifications` and calls `backendHandleAppLifetimeEvent(appId, true/false)` with 3000ms exit ducking timer and cleanup in `onDismount` |
| 15 | Steam CDN game covers (`steamstatic.com`, `steamcdn-a.akamaihd.net`, `steampowered.com`) load via base64 proxy with `User-Agent` header and fall back to `FaGamepad` on missing/failed covers (Gap 1, `SOUND-01`) | ✓ VERIFIED | `py_modules/images.py` extends `ALLOWED_SPOTIFY_DOMAINS` and sets `User-Agent: Deckify/1.0`; `SoundtracksTab.tsx` passes `fallback={<FaGamepad size={18} color="#888" />}`; verified in `tests/test_images.py` & `SoundtracksTab.test.tsx` |
| 16 | `PlaylistPickerModal` opens via `@decky/ui` `showModal()`, traps controller focus, closes on B without closing `DeckifyExpandedModal`, queries playlists/albums at offset `0`, and visibly adds selected playlists with non-empty URIs to the game profile (Gap 2, `SOUND-01`) | ✓ VERIFIED | `SoundtracksTab.tsx` uses `showModal(<PlaylistPickerModal ... />)` with functional `setProfiles((prev) => ...)`; `PlaylistPickerModal.tsx` passes `0` to `backendGetPlaylists(0)`/`backendGetSavedAlbums(0)` and calls `closeModal?.()`; `py_modules/rpc_library.py:45,873,972` and `soundtrackUtils.ts` emit `uri` |
| 17 | Pressing B on a focused/selected `SliderField` or other child control in `DeckifyExpandedModal` exits the control without closing the modal, while unhandled `vgp_oncancel` events bubble to `ModalRoot` (Gap 3, `SOUND-01`) | ✓ VERIFIED | `DeckifyExpandedModal.tsx:902` attaches `vgp_oncancel` in bubble phase (`false`) without direct `closeModal?.()` fallback; verified by `DeckifyExpandedModal.test.tsx` (25/25) |
| 18 | QAM displays the 1-click `Bind current music to game` button when a game is running (including games already running at plugin startup via `Router.MainRunningApp`) and `SteamClient.GameSessions.RegisterForAppLifetimeNotifications` dispatches launch/exit lifecycle events (Gap 4, `SOUND-02`, `SOUND-03`) | ✓ VERIFIED | `src/index.tsx:1127,1134-1136` seeds `activeGameAppId` from `Router.MainRunningApp?.appid`, syncs `Content` on mount, and subscribes to `SteamClient.GameSessions.RegisterForAppLifetimeNotifications`; verified by `src/index.test.tsx` (12/12) |

**Score:** 18/18 truths verified (0 failed, 0 behavior-unverified)

### Advisory (New Scope, Unevidenced)

None.

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `py_modules/vdf_parser.py` | Binary/text VDF parsing, CRC32 AppID, 30s TTL discovery | ✓ VERIFIED | Stdlib-only, `compute_non_steam_appid` at line 75, imported and called by `main.py` |
| `py_modules/soundtrack.py` | `SoundtrackManager` debounce, snapshots, multi-playlist, Connect wake-up, `_resolve_context_metadata`, append in `bind_current_music_to_game` | ✓ VERIFIED | Verified in `tests/test_soundtrack.py` |
| `py_modules/common.py` | Soundtrack keys in `DEFAULT_SETTINGS` & sanitization | ✓ VERIFIED | Verified |
| `py_modules/rpc_playback.py` | `position_ms` support in `play_tracks` | ✓ VERIFIED | Lines 332, 356-357 |
| `py_modules/images.py` | Steam CDN domains in `ALLOWED_SPOTIFY_DOMAINS` + `User-Agent: Deckify/1.0` | ✓ VERIFIED | Verified in `tests/test_images.py` |
| `py_modules/rpc_library.py` | Playlist `uri` in `get_playlists` & `search_spotify` | ✓ VERIFIED | Lines 45, 873, 972 |
| `main.py` | Soundtrack RPCs, `control_playback` manual-pause hook, lifecycle dispatch | ✓ VERIFIED | Lines 684, 694-740 |
| `src/types.ts` | `SoundtrackProfile`, `InstalledGame`, `"soundtracks"` `ViewMode` | ✓ VERIFIED | Lines 17, 33 |
| `src/components/common/Sidebar.tsx` | Soundtracks navigation button (`FaGamepad`) | ✓ VERIFIED | Line 136 |
| `src/components/DeckifyExpandedModal.tsx` | Soundtracks tab mount + bubble-phase `vgp_oncancel` | ✓ VERIFIED | Lines 40, 789, 902, 1216-1217 |
| `src/components/tabs/SoundtracksTab.tsx` | `showModal()` picker, functional `setProfiles`, `FaGamepad` fallback | ✓ VERIFIED | Verified in `SoundtracksTab.test.tsx` (9/9) |
| `src/components/tabs/PlaylistPickerModal.tsx` | `closeModal` support + `offset=0` queries | ✓ VERIFIED | Verified in `PlaylistPickerModal.test.tsx` (6/6) |
| `src/components/tabs/soundtrackUtils.ts` | Pure sorting/filtering/normalization + `toSelection` URI fallback | ✓ VERIFIED | Verified |
| `src/index.tsx` | `SteamClient.GameSessions`, `Router.MainRunningApp` seed, QAM 1-click bind wrapped in `<Focusable flow-children="horizontal">` | ✓ VERIFIED | Lines 76, 478, 1127, 1134-1136 |
| `tests/test_vdf_parser.py` | VDF & CRC32 unit tests | ✓ VERIFIED | Passing in full suite (`458/458`) |
| `tests/test_soundtrack.py` | `SoundtrackManager` & `rpc_library` URI unit tests | ✓ VERIFIED | Passing in full suite (`458/458`) |
| `tests/test_images.py` | Steam CDN allowlist & `User-Agent` unit tests | ✓ VERIFIED | Passing in full suite (`458/458`) |
| `tests/test_e2e_requirements.py` | E2E tests for `SOUND-01`, `SOUND-02`, `SOUND-03` | ✓ VERIFIED | Passing in full suite (`458/458`) |
| `src/components/tabs/SoundtracksTab.test.tsx` | Vitest component tests | ✓ VERIFIED | 9/9 passing |
| `src/components/tabs/PlaylistPickerModal.test.tsx` | Vitest modal tests | ✓ VERIFIED | 6/6 passing |
| `src/components/DeckifyExpandedModal.test.tsx` | Vitest bubble-phase `vgp_oncancel` tests | ✓ VERIFIED | 25/25 passing |
| `src/index.test.tsx` | Vitest `GameSessions` + `Router.MainRunningApp` seed test | ✓ VERIFIED | 12/12 passing |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `main.py handle_app_lifetime_event` | `SoundtrackManager.handle_app_lifecycle` | Direct async call | ✓ WIRED | Also checks `ducking_override` (`main.py:735`) and calls `trigger_ducking` |
| `SoundtrackManager._run_exit` | `rpc_playback.play_tracks` (`position_ms`) | `self.plugin.play_tracks(**kwargs)` | ✓ WIRED | Sends `context_uri`, `offset_uri`, `position_ms` to `me/player/play` |
| `SoundtracksTab.tsx openPlaylistPicker` | `@decky/ui showModal(<PlaylistPickerModal />)` | `onSelect` functional `setProfiles` -> `scheduleSave` | ✓ WIRED | Updates state functionally and persists via `save_game_soundtrack_profile` |
| `py_modules/rpc_library.py` playlist `uri` | `soundtrackUtils.toSelection` -> `addPlaylist` | Playlist/search `uri` field + fallback | ✓ WIRED | Guarantees non-empty `uri` on picked playlists |
| `DeckifyExpandedModal.tsx attachNav` | `ModalRootAny onCancel={closeModal}` | Bubble-phase `vgp_oncancel` (`false`) | ✓ WIRED | Child controls (`SliderField`) can `stopPropagation()` without closing modal |
| `src/index.tsx` `GameSessions` & `MainRunningApp` | `Content` `setActiveGameAppId` & `main.py handle_app_lifetime_event` | `setActiveGameState` + `backendHandleAppLifetimeEvent` | ✓ WIRED | Seeds running game at startup and syncs QAM on mount |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `SOUND-01` | `07-01-PLAN.md`, `07-02-PLAN.md`, `07-03-PLAN.md` | User can bind a Spotify playlist or album to a specific Steam game `appId` in Deckify settings with custom auto-play preference | ✓ SATISFIED | `SoundtracksTab.tsx`, `PlaylistPickerModal.tsx` (`showModal`), `py_modules/images.py`, `py_modules/soundtrack.py`, `tests/test_soundtrack.py` & `tests/test_e2e_requirements.py` |
| `SOUND-02` | `07-01-PLAN.md`, `07-02-PLAN.md`, `07-03-PLAN.md` | User experiences automatic soundtrack playback upon game launch via `SteamClient.GameSessions.RegisterForAppLifetimeNotifications` with launcher debounce (3-5s) | ✓ SATISFIED | `src/index.tsx:1134-1136`, `SoundtrackManager.handle_app_lifecycle` (3.5s default), Connect wake-up, `tests/test_e2e_requirements.py` |
| `SOUND-03` | `07-01-PLAN.md`, `07-02-PLAN.md`, `07-03-PLAN.md` | User experiences seamless restoration of their pre-game playback state (or automatic pause) when the game exits | ✓ SATISFIED | `SoundtrackManager._run_exit` (3.0s default), `position_ms` restore, `record_manual_pause` (`main.py:684`), `src/index.tsx`, `tests/test_e2e_requirements.py` |

No orphaned requirements found in `.planning/REQUIREMENTS.md` for Phase 7.

### Anti-Patterns Found

None. Zero `TBD`, `FIXME`, `XXX`, `TODO`, `HACK`, or `PLACEHOLDER` markers found in any Phase 7 files (only JSX `placeholder=` input attributes).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Full Python test suite | `py -3 -m unittest discover -s tests -p "test_*.py"` | 458/458 OK (49.742s) | ✓ PASS |
| Full Vitest suite (16 files) | `pnpm test -- --run` | 152/152 OK (2.89s) | ✓ PASS |
| TypeScript type check | `pnpm typecheck` (`tsc --noEmit`) | Exit code 0 | ✓ PASS |
| UAT & Security audits | `07-UAT.md` & `07-SECURITY.md` | `2/2` UAT pass; `11/11` threats closed (`threats_open: 0`) | ✓ PASS |

### Human Verification Required

None — all human verification items in `07-UAT.md` passed (`2/2`).

### Gaps Summary

No gaps remaining. All 18 must-haves, 458 Python tests, 152 Vitest tests, `tsc --noEmit`, 2/2 UAT items, and 11/11 security threats are verified against the current codebase.

---

_Verified: 2026-11-15T20:34:15Z_
_Verifier: the agent (gsd-verifier)_
