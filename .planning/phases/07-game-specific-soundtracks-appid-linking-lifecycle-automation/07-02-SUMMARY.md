---
phase: 07-game-specific-soundtracks-appid-linking-lifecycle-automation
plan: 02
subsystem: ui
tags: [react, typescript, decky-ui, soundtrack, applifetime, vitest, e2e]
requires:
  - phase: 07-game-specific-soundtracks-appid-linking-lifecycle-automation
    provides: Installed game VDF discovery, SoundtrackManager lifecycle & snapshot/restore, soundtrack RPCs in main.py
provides:
  - SoundtracksTab component with search filtering, Non-Steam badges, multi-playlist chips, playback/resume/exit policies, and volume/ducking overrides
  - PlaylistPickerModal with My Playlists, My Albums, and debounced Spotify Search tabs
  - Expanded Modal Sidebar navigation entry for Soundtracks
  - Unified SteamClient.Apps.RegisterForAppLifetimeNotifications dispatch, QAM 1-click music binding button, and soundtrack_prompt_switch toast listener
  - Vitest component tests and Python E2E requirement tests for SOUND-01, SOUND-02, and SOUND-03
affects: [phase-08, verify-work]
actuals:
  tokens: 15988
  tasks: 4
  commits: 4
plan_head_before: 08c66e76b5d4b0caa5f36dba8dff789562330fbb
plan_head_after: bbb6e22a6ae7be8f13a2ec56e52b1ecb561e44d9
tech-stack:
  added: []
  patterns: [debounced profile persistence (500ms), reactive module-level activeGameAppId subscriber, CSP-safe DeckifyImage proxy]
key-files:
  created:
    - src/components/tabs/SoundtracksTab.tsx
    - src/components/tabs/PlaylistPickerModal.tsx
    - src/components/tabs/soundtrackUtils.ts
    - src/components/tabs/SoundtracksTab.test.tsx
    - src/components/tabs/PlaylistPickerModal.test.tsx
  modified:
    - src/types.ts
    - src/components/common/Sidebar.tsx
    - src/components/DeckifyExpandedModal.tsx
    - src/index.tsx
    - tests/test_e2e_requirements.py
key-decisions:
  - "Mounted SoundtracksTab under Control section in Sidebar.tsx with FaGamepad icon"
  - "Used Decky TextFieldAny cast for placeholder attribute compatibility with @decky/ui TextFieldProps"
  - "Synced activeGameAppId between RegisterForAppLifetimeNotifications and QAM Content via a lightweight listener set"
patterns-established:
  - "SoundtracksTab debounces save_game_soundtrack_profile calls by 500ms per app_id to prevent RPC thrashing"
  - "PlaylistPickerModal debounces search_spotify queries by 300ms and routes all covers through DeckifyImage"
requirements-completed: [SOUND-01, SOUND-02, SOUND-03]
coverage:
  - id: D1
    description: "SoundtracksTab in Expanded Modal with installed Steam/Non-Steam games, search, multi-playlist chips, playback/resume/exit modes, and volume/ducking overrides"
    requirement: SOUND-01
    verification:
      - kind: unit
        ref: "src/components/tabs/SoundtracksTab.test.tsx"
        status: pass
      - kind: e2e
        ref: "tests/test_e2e_requirements.py#test_sound01_frontend_soundtracks_ui_and_qam_bind_contracts"
        status: pass
    human_judgment: false
  - id: D2
    description: "PlaylistPickerModal with My Playlists, My Albums, and Spotify Search tabs"
    requirement: SOUND-01
    verification:
      - kind: unit
        ref: "src/components/tabs/PlaylistPickerModal.test.tsx"
        status: pass
    human_judgment: false
  - id: D3
    description: "AppLifetime dispatch, QAM 1-click Bind current music to game button, and soundtrack_prompt_switch toast"
    requirement: SOUND-02
    verification:
      - kind: e2e
        ref: "tests/test_e2e_requirements.py#test_sound02_launch_debounce_auto_start_and_device_fallback"
        status: pass
    human_judgment: false
  - id: D4
    description: "Pre-game snapshot restore, in-game seek position saving, and manual pause suppression"
    requirement: SOUND-03
    verification:
      - kind: e2e
        ref: "tests/test_e2e_requirements.py#test_sound03_snapshot_restore_seek_save_and_manual_pause"
        status: pass
    human_judgment: false
duration: 10min
completed: 2026-11-14
status: complete
---

# Phase 07 Plan 02: Game Soundtracks Frontend & Lifecycle Automation Summary

**Game-specific Soundtracks UI (`SoundtracksTab` + `PlaylistPickerModal`), QAM 1-click music binding, and `RegisterForAppLifetimeNotifications` lifecycle dispatch with full Vitest and Python E2E verification**

## Performance

- **Duration:** 10 min
- **Started:** 2026-11-14T18:18:13Z
- **Completed:** 2026-11-14T18:28:03Z
- **Tasks:** 4
- **Files modified:** 10

## Accomplishments
- Added `SoundtracksTab.tsx` with instant search filtering, running/configured game sorting, Non-Steam badges, multi-playlist chips, playback/resume/exit policy dropdowns, and per-game volume/ducking overrides.
- Added `PlaylistPickerModal.tsx` with `My Playlists`, `My Albums`, and 300ms-debounced `Spotify Search` tabs using `ModalRoot` and `DeckifyImage` CSP proxy.
- Wired `"soundtracks"` into `src/types.ts`, `Sidebar.tsx`, and `DeckifyExpandedModal.tsx`.
- Connected `SteamClient.Apps.RegisterForAppLifetimeNotifications` in `src/index.tsx` to `handle_app_lifetime_event`, added the QAM 1-click `"Bind current music to game"` button, and added `soundtrack_prompt_switch` toast handling.
- Added 10 Vitest component tests and 4 Python E2E requirement tests covering `SOUND-01`, `SOUND-02`, and `SOUND-03`.

## Task Commits

Each task was committed atomically:

1. **Task 3: PlaylistPickerModal & soundtrack types/utils** - `470e269` (feat)
2. **Task 2: SoundtracksTab & Expanded Modal navigation** - `2562014` (feat)
3. **Task 1: SoundtracksTab & PlaylistPickerModal Vitest suites** - `5c111b1` (test)
4. **Task 4: AppLifetime dispatch, QAM quick-bind & E2E tests** - `bbb6e22` (feat)

## Files Created/Modified
- `src/types.ts` - Added `"soundtracks"` to `ViewMode`/`ALL_MODES`, soundtrack settings to `EngineSettings`, and soundtrack profile interfaces.
- `src/components/tabs/soundtrackUtils.ts` - Pure helpers for sorting, filtering, mode/volume/ducking updates, and profile normalization.
- `src/components/tabs/PlaylistPickerModal.tsx` - Tabbed modal for picking playlists, saved albums, or Spotify search results.
- `src/components/tabs/SoundtracksTab.tsx` - Game soundtrack configuration view with debounced profile saving.
- `src/components/common/Sidebar.tsx` - Added Soundtracks navigation button (`FaGamepad`).
- `src/components/DeckifyExpandedModal.tsx` - Mounted `SoundtracksTab` for `mode === "soundtracks"`.
- `src/index.tsx` - Wired `handle_app_lifetime_event`, `bind_current_music_to_game` QAM button, and `soundtrack_prompt_switch` toast listener.
- `src/components/tabs/SoundtracksTab.test.tsx` - 6 Vitest tests for rendering, search, mode/volume/ducking updates, playlist removal, and spatial navigation.
- `src/components/tabs/PlaylistPickerModal.test.tsx` - 4 Vitest tests for modal visibility, tab switching, item selection, and close handling.
- `tests/test_e2e_requirements.py` - Added 4 E2E tests for `SOUND-01`, `SOUND-02`, and `SOUND-03`.

## Decisions Made
- Committed `PlaylistPickerModal.tsx` and `SoundtracksTab.tsx` before their Vitest test files so every commit satisfied `.husky/pre-commit` (`tsc --noEmit`, `vitest run`, `rollup -c`, and `unittest discover`).
- Used `TextFieldAny = TextField as any` in `SoundtracksTab.tsx` and `PlaylistPickerModal.tsx` because `@decky/ui`'s `TextFieldProps` type omits `placeholder`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Aligned RPC names in PlaylistPickerModal with existing backend**
- **Found during:** Task 3 (PlaylistPickerModal implementation)
- **Issue:** Plan referenced `get_albums`, while `main.py` exposes `get_saved_albums`.
- **Fix:** Called `get_saved_albums` in `PlaylistPickerModal.tsx` and mocked `get_saved_albums` in `PlaylistPickerModal.test.tsx`.
- **Files modified:** `src/components/tabs/PlaylistPickerModal.tsx`, `src/components/tabs/PlaylistPickerModal.test.tsx`
- **Verification:** `pnpm test src/components/tabs/PlaylistPickerModal.test.tsx -- --run` passed (4/4).
- **Committed in:** `470e269`, `5c111b1`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for RPC compatibility with `main.py`. No scope creep.

## Issues Encountered
- Initial Vitest run failed on `n.type === "DialogButton"` checks because `@decky/ui` mocks are functions rather than intrinsic string tags; updated test predicates to `typeName(n)`.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 07 (07-01 and 07-02) is complete with 75/75 Vitest tests and 428/428 Python tests passing.
- Ready for Phase 07 verification (`/gsd-verify-work`) and Phase 08 planning.

## Self-Check: PASSED
- All created/modified files exist on disk.
- All 4 task commits (`470e269`, `2562014`, `5c111b1`, `bbb6e22`) are ancestors of `HEAD`.

---
*Phase: 07-game-specific-soundtracks-appid-linking-lifecycle-automation*
*Completed: 2026-11-14*
