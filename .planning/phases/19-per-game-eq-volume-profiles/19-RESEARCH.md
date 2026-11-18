# Phase 19: Per-Game EQ & Volume Profiles - Research

**Researched:** 2026-11-18
**Domain:** SteamOS PipeWire Audio DSP (`filter-chain` + `VolumeFader`), Steam App Lifecycle (`SoundtrackManager`), and Decky Loader GamepadUI (`SoundtracksTab` + `SettingsTab`)
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01 (Preset Dropdown + Dedicated Per-Game 10-Band EQ Modal):** Each expanded game card in `SoundtracksTab.tsx` exposes an **EQ Preset Override** `DropdownItem` (`Use Global` + the 7 presets: `flat`, `bass`, `vocal`, `gaming`, `deck_speakers`, `late_night`, `custom`). When `"custom"` is selected, an **"Edit Game EQ"** button appears next to the dropdown and opens a dedicated controller-navigable 10-band modal editor storing `eq_custom_bands` on that game's `SoundtrackProfile`. — **Reversibility:** costly — extends the `game_audio_profiles` schema (`eq_preset`, `eq_custom_bands`) across frontend types and backend sanitizer.
- **D-02 (Modal Seeding & Live `pw-cli` Preview):** When creating or opening a game's custom 10-band curve, initialize new curves from the user's current active/global curve (with a "Copy from Preset / Reset Flat" helper inside the modal). Dragging/stepping sliders in the modal sends live `pw-cli` audio previews while open, and restores the active EQ on modal close if that game is not currently running.
- **D-03 (`SettingsTab` Global Isolation & Override Badge):** While a per-game EQ override is actively running, `SettingsTab.tsx` displays an **"Active Game EQ Override"** badge in the Equalizer card. Edits made in `SettingsTab` update the persistent global `eq_preset` / `eq_custom_bands` baseline without breaking or overwriting the active game's ephemeral override (when no game override is active, `SettingsTab` updates live audio as normal).
- **D-04 (Live Hot-Apply in `SoundtracksTab`):** Changing the currently running game's EQ preset dropdown (including switching back to `Use Global`) or editing its custom 10-band curve in `SoundtracksTab.tsx` hot-applies immediately to `EqualizerManager`'s ephemeral override without requiring a game restart.
- **D-05 (100% Local PipeWire `VolumeFader` Overrides):** Remove Spotify Web API `PUT /v1/me/player/volume` calls (`self.plugin.set_volume`) from `SoundtrackManager` game launch/exit. Route all per-game volume and ducking overrides 100% locally through PipeWire `VolumeFader` sink-input scaling (`pactl set-sink-input-volume` with cosine easing), eliminating cloud API 429s, latency spikes, and double-attenuation. — **Reversibility:** costly — changes `SoundtrackManager._run_launch` / `_run_exit` and `VolumeFader` target calculation contract.
- **D-06 (Dual Per-Game Sliders: Volume Ceiling + Ducking Attenuation):** Each game card in `SoundtracksTab.tsx` exposes two separate sliders alongside the `Ducking Override` toggle:
  1. **Volume Override** (`0–100%` or `null`/Disabled) — sets the game's base volume ceiling relative to the global baseline.
  2. **Ducking Attenuation Override** (`0–95%` or `null`/Use Global) — sets the custom game-ducking attenuation percentage when `Ducking Override` is ON.
- **D-07 (Ceiling + Attenuation Interaction):** `VolumeFader` computes the effective in-game target from the game's `volume_override` ceiling (defaulting to global 100% baseline if `null`) scaled by the active ducking attenuation (`ducking_level_override` if set, otherwise global ducking setting) when `ducking_override` is ON (and dipping further for `voice` VAD if lower). If `ducking_override` is OFF, playback remains at the game's `volume_override` ceiling without game ducking.
- **D-08 (Live Mid-Game Fader & QAM Sync):** Adjusting the running game's `volume_override`, `ducking_override`, or `ducking_level_override` in `SoundtracksTab.tsx` immediately triggers a cosine-eased `VolumeFader` transition and emits `ducking_state_changed` so the Quick Access Menu displays the live `effective_volume`.
- **D-09 (Independent of Linked Playlists):** Per-game EQ, volume, and ducking overrides always activate on game launch even when the game profile has `0` playlists linked (audio-only profile) or when music is already playing with `always_auto_start = False` (`soundtrack_prompt_switch` flow).
- **D-10 (Sequenced Post-Debounce Activation):** Per-game EQ and volume/ducking activation runs inside the post-launch-debounce lifecycle (`_run_launch`, after `soundtrack_launch_debounce` prevents Proton/launcher process flapping). Activation is sequenced atomically: apply ephemeral EQ preset first → invalidate `VolumeFader._cached_sink_input_id` → smoothly fade `VolumeFader` to the game's target level.
- **D-11 (Game Row Subtitle Summary):** Game row headers in `SoundtracksTab.tsx` summarize configured audio overrides inline in the subtitle (e.g., `"2 linked soundtracks • EQ: Gaming • Vol: 65% • Duck: 40%"` or `"Audio profile only • EQ: Bass Boost • Vol: 70%"` when 0 playlists are linked) so audio-only profiles are immediately identifiable when collapsed.
- **D-12 (Back-to-Back Game Switch Preservation):** If Game A exits and Game B launches before Game A's 3.0s exit debounce completes, preserve the original pre-game global baseline snapshot (`_pre_game_snapshot` / `active_game_override_snapshot`) rather than snapshotting Game A's ephemeral override. Transition directly from Game A's overrides to Game B's overrides (or back to the global baseline for any field where Game B uses `Use Global`).
- **D-13 (Always Restore Global Audio Baseline on Exit):** Exiting a game always clears the ephemeral game audio override and restores the user's global EQ preset and `VolumeFader` baseline, regardless of whether `exit_policy` is `"restore_snapshot"`, `"pause"`, or `"keep_playing"` and regardless of manual in-game pauses.
- **D-14 (Boot Crash Recovery via `active_game_override_snapshot`):** Persist `active_game_override_snapshot` in `settings.json` whenever an ephemeral game audio override is active. On `Plugin._main()` startup, if a stale `active_game_override_snapshot` is found, clear it and restore the user's persistent global `eq_preset` / `eq_custom_bands` and un-ducked `VolumeFader` baseline (unless the frontend immediately reports that same `app_id` is still running).
- **D-15 (Sleep Timer `_sleep_locked` Priority):** On game exit, if `VolumeFader._sleep_locked` is `True`, strictly skip `VolumeFader` un-ducking and skip pre-game playback restoration (`play_tracks`), while still restoring global EQ and clearing `active_game_override_snapshot`.
- **D-16 (Exit Teardown Sequence):** On game exit, mirror the launch sequence in reverse: restore global EQ first (moving `librespot` / `spotify_client` cleanly to the hardware sink before tearing down `deckify_eq_sink` on `flat`), invalidate `VolumeFader._cached_sink_input_id`, and then smoothly fade `VolumeFader` back to the global baseline.

### the agent's Discretion
- Exact modal layout and button styling for the **Edit Game EQ** modal (reusing the 10-band vertical fader controls from `SettingsTab.tsx` with `flow-children="horizontal"` across bands).
- Exact ephemeral state representation inside `EqualizerManager` (e.g. `_ephemeral_preset`, `_ephemeral_bands`) and helper RPC signatures for live modal preview.
- Exact `active_game_override_snapshot` JSON structure in `py_modules/common.py` and `settings.json`.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed strictly within Phase 19 scope (`GAME-01`).
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **GAME-01** | User can bind a per-game 10-band PipeWire EQ preset and target volume/ducking level to any Steam game profile in `SoundtracksTab`, automatically applying an ephemeral override on game launch and restoring the user's global EQ/volume baseline on game exit or crash recovery without overwriting persistent settings or interrupting an active Sleep Timer lock. | Extending `SoundtrackProfile` (`eq_preset`, `eq_custom_bands`, `ducking_level_override`), adding an ephemeral override + preview layer to `EqualizerManager`, moving all per-game volume/ducking into `VolumeFader` locally via PipeWire, sequencing `_run_launch`/`_run_exit` with `_sleep_locked` protection and `active_game_override_snapshot` boot recovery, and adding the EQ preset selector, `GameEqModal`, dual sliders, inline subtitle summary, and `SettingsTab` override badge. |
</phase_requirements>

---

## Project Constraints (from GEMINI.md)

- **Steam CEF Content Security Policy:** No direct external image URLs (`https://i.scdn.co/`); all artwork routes through `<DeckifyImage>` / `get_image` base64 proxy (applies to playlist/game thumbnails in `SoundtracksTab.tsx`). `[VERIFIED: GEMINI.md]`
- **SteamOS GamepadUI Spatial Navigation:** Horizontal button/slider groups MUST use `flow-children="horizontal"` (never `flow-children="row"`), and focus traps/navigation loss must be prevented across sub-modals. `[VERIFIED: GEMINI.md]`
- **Process Environment Isolation:** Strip `LD_LIBRARY_PATH` (`os.environ.pop("LD_LIBRARY_PATH", None)`) and execute user PipeWire/PulseAudio binaries via `_build_deck_command()` as `DECK_USER` (UID 1000). `[VERIFIED: py_modules/common.py:38,388-408; py_modules/equalizer.py:235-238]`
- **PipeWire UI Stream Isolation:** Sink-input volume scaling and EQ routing MUST strictly route through `resolve_spotify_sink_input_ids()` (`py_modules/engine.py:147-219`), excluding `steamwebhelper`, `Chromium`, and game audio streams. `[VERIFIED: GEMINI.md; py_modules/engine.py:174-191]`
- **Rate Limiting:** Avoid Spotify Web API calls on game volume transitions; Phase 19 eliminates `self.plugin.set_volume` (`PUT /v1/me/player/volume`) from `SoundtrackManager` entirely (D-05). `[VERIFIED: GEMINI.md; 19-CONTEXT.md]`
- **Error Handling & Code Style:** Backend RPC methods wrap external/subprocess operations in `try/except` returning structured `{ "ok": bool, ... }` dicts; TypeScript uses 2-space indent, semicolons, strict `tsc --noEmit`, and ESLint 10 rules (`complexity <= 15`, `max-lines-per-function <= 80`, `max-params <= 4`). `[VERIFIED: eslint.config.js:24-39; tsconfig.json:11-15]`

---

## Summary

Phase 19 unifies Deckify's existing `SoundtrackManager` (`py_modules/soundtrack.py`), `EqualizerManager` (`py_modules/equalizer.py`), and `VolumeFader` (`py_modules/volume.py`) under a layered **Global Baseline vs. Ephemeral Game Override** architecture. Today, `EqualizerManager` writes directly to `plugin._settings["eq_preset"]` / `["eq_custom_bands"]` via `volume.apply_equalizer_preset()` and `EqualizerManager.set_bands()`, while `SoundtrackManager` sends Spotify Web API `PUT /v1/me/player/volume` calls (`self.plugin.set_volume`) at launch/exit and `main.py:handle_app_lifetime_event()` immediately triggers `"game"` ducking at `t=0s` before the `3.5s` launch debounce. All four behaviors conflict with `GAME-01`: they overwrite global settings on crash, introduce cloud 429s/double-attenuation, race `deckify_eq_sink` stream creation during launch, and lack `_sleep_locked` guards on game exit.

Codebase inspection revealed **seven critical integration details** the planner must address explicitly:
1. **`runningAppId` is missing in `DeckifyExpandedModal.tsx:1230`:** `SoundtracksTab` accepts `runningAppId?: number | null`, and `src/index.tsx` tracks `currentRunningAppId`, yet `DeckifyExpandedModal` renders `<SoundtracksTab showToast={showToast} onPickerOpenChange={setPlaylistPickerOpen} />` without passing `runningAppId`. Exposing `active_game_app_id` and `active_game_override` from `Plugin.get_status()` wires live running state into both `SoundtracksTab` (D-04, D-08) and `SettingsTab` (D-03).
2. **`MagicMock` truthiness hazards in existing tests:** `tests/test_equalizer.py:323` mocks `eq_mgr = MagicMock()`, and `tests/test_soundtrack.py:32` sets `_volume_fader = MagicMock()`. Checking `isinstance(getattr(eq_mgr, "_ephemeral_preset", None), str)`, `getattr(fader, "_sleep_locked", False) is True`, and checking `inspect.isawaitable(...)` before `await`ing fader/EQ helpers prevents existing mock-based test suites from breaking (`TypeError` on `await MagicMock()` or false positive overrides).
3. **`EqualizerManager.route_librespot_to_eq()` reads `settings["eq_preset"]`:** On `librespot` crash/auto-restart mid-game (`main.py:532-533`), `on_librespot_started()` would accidentally revert an active game's ephemeral EQ back to global unless `route_librespot_to_eq()` prefers `_ephemeral_preset` when active.
4. **Orphan `pipewire -c` process after crash when global EQ is `"flat"`:** `Plugin._main()` only calls `apply_preset(initial_eq)` when `initial_eq != "flat"` (`main.py:178`). If Decky crashes while a game has an active EQ override and global EQ is `"flat"`, an orphan `pipewire -c eq-filter-chain.conf` process and `deckify_eq_sink` can remain alive across restart unless `EqualizerManager` persists an `eq.pid` file and `_main()` tears down any stale EQ process/routing during `active_game_override_snapshot` recovery.
5. **QAM `effectiveVolume` gating (`src/index.tsx:919`):** Currently QAM displays `effectiveVolume` only when `isDucked` (`len(_duck_reasons) > 0`). When a running game sets `volume_override: 65` with `ducking_override: false` (`is_ducked == False`), QAM would show the unscaled Spotify volume unless `ducking_state_changed` exposes `has_game_override` (or `is_overridden`) and QAM renders `effectiveVolume` whenever either is true.
6. **Frontend 3000ms exit ducking timer (`src/index.tsx:1274-1279`) vs `soundtrack_exit_debounce`:** `src/index.tsx` triggers `backendTriggerDucking(false, "game")` at 3000ms, while `SoundtrackManager._delayed_exit` runs `_run_exit` after `soundtrack_exit_debounce` (default `3.0s`, configurable `0.5–10.0s`). Guarding `trigger_ducking(False, "game")` when `SoundtrackManager._exit_task` is still pending and making `VolumeFader.set_ducking(False, "game")` idempotent when already cleared prevents premature un-ducking or fade restart glitches.
7. **Pre-existing test assertions expecting old behavior:** `tests/test_soundtrack.py` (`test_volume_override_applied_and_reverted`, `test_lifecycle_event_routes_and_ducks`, `test_ducking_override_false_skips_duck`) and `src/components/tabs/SoundtracksTab.test.tsx:221` (`expect(sliders).toHaveLength(1)`) test pre-Phase-19 contracts and must be updated alongside the new tests.

**Primary recommendation:** Implement an explicit 3-layer EQ state machine (`global settings` -> `_ephemeral_*` -> transient modal `_preview_*`) in `EqualizerManager`, unify all local game ceiling + attenuation + voice VAD scaling inside `VolumeFader._compute_target_sink_volume()`, and orchestrate atomic sequenced transitions inside `SoundtrackManager._run_launch` / `_run_exit` with `active_game_override_snapshot` boot recovery in `Plugin._main()`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Per-game EQ preset selection, `GameEqModal` 10-band editor UI, dual sliders, and subtitle summary | Frontend (`SoundtracksTab.tsx`, `GameEqModal.tsx`, `soundtrackUtils.ts`) | Backend (`SoundtrackManager._sanitize_profile`) | React owns controller-navigable UI, `500ms` save debounce, and modal local state; backend remains authoritative for validation and clamping. |
| Global EQ isolation & `"Active Game EQ Override"` badge | Frontend (`SettingsTab.tsx`) | Backend (`volume.apply_equalizer_preset`, `EqualizerManager.set_bands`) | `SettingsTab` binds strictly to global `settings.eq_preset` / `eq_custom_bands` while rendering the active override badge from `status.active_game_override`. |
| Steam/Non-Steam game lifecycle detection (`RegisterForAppLifetimeNotifications` / `MainRunningApp`) | Frontend (`src/index.tsx`) | Backend (`main.py:handle_app_lifetime_event`, `SoundtrackManager`) | SteamOS `GameSessions` lifecycle events originate in the Steam CEF frontend and immediately forward to Python for debounced orchestration. |
| Ephemeral PipeWire EQ DSP (`pipewire -c` / `pw-cli` / `pw-dump` / `eq.pid`) | Backend (`EqualizerManager` in `py_modules/equalizer.py`) | Host PipeWire Daemon | Python owns subprocess isolation, UID 1000 privilege dropping, `pw-cli` `75ms` coalescing, and clean sink-input migration before `flat` teardown. |
| Local volume ceiling, ducking attenuation, voice VAD precedence & `_sleep_locked` priority | Backend (`VolumeFader` in `py_modules/volume.py`) | Frontend QAM (`src/index.tsx` via `ducking_state_changed`) | PipeWire `pactl set-sink-input-volume` cosine easing with single cached sink-input ID eliminates cloud API latency and 429 errors; QAM strictly displays `effective_volume`. |
| Launch/exit sequencing, back-to-back switch snapshot preservation, and crash recovery | Backend (`SoundtrackManager` in `py_modules/soundtrack.py`, `Plugin._main()` in `main.py`) | Disk Persistence (`settings.json` via `py_modules/common.py`) | Python owns debounce timers, `_pre_game_snapshot`, `active_game_override_snapshot` crash recovery, and reverse-order exit teardown. |

---

## Standard Stack

Phase 19 introduces **zero new npm or Python dependencies** (`STATE.md` milestone constraint). `[VERIFIED: STATE.md:153]`

### Core (Existing In-Repo Stack)
| Library / Tool | Version | Purpose | Why Standard |
|----------------|---------|---------|--------------|
| TypeScript | `5.9.3` | Strict frontend types & UI components | Configured in `package.json:41` and `tsconfig.json` (`strict: true`) `[VERIFIED: package.json:41]` |
| React (Decky global) | `19.x` (`@types/react: 19.2.14`) | Component UI & hooks | Decky Loader host runtime (`package.json:32,54-60`) `[VERIFIED: package.json:32,54-60]` |
| `@decky/ui` | `4.11.1` | `ModalRoot`, `showModal`, `Focusable`, `DropdownItem`, `SliderField`, `ToggleField`, `DialogButton` | Official SteamOS GamepadUI spatial navigation primitives `[VERIFIED: package.json:29; node_modules/@decky/ui/dist/components/Modal.d.ts]` |
| `@decky/api` | `1.1.3` | `callable`, `addEventListener`, `removeEventListener`, `toaster` | Typed async RPC & event bus to Python backend `[VERIFIED: package.json:46]` |
| `react-icons` | `5.5.0` | SVG icons (`FaSlidersH`, `FaGamepad`, `FaTimes`, etc.) | Bundled UI icon library `[VERIFIED: package.json:48]` |
| Python stdlib | `3.11+` / `3.14` | `asyncio`, `subprocess`, `json`, `math`, `os`, `time` | SteamOS / Decky sandbox requires zero binary pip deps `[VERIFIED: GEMINI.md; py_modules/equalizer.py:3-6]` |
| PipeWire CLI (`pipewire`, `pw-cli`, `pw-dump`, `pactl`) | SteamOS 3.5+ host | 10-band biquad `filter-chain` DSP + sink-input volume scaling | Native SteamOS audio server; isolated to Deckify sink-inputs `[VERIFIED: py_modules/equalizer.py:272,286,307,326; py_modules/volume.py:234,262]` |

### Supporting (Existing Test & Quality Stack)
| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| Vitest | `5.1.0` | Frontend unit & component tree tests | Every frontend task (`pnpm test -- --run`) `[VERIFIED: package.json:13,43]` |
| Python `unittest` | stdlib | Backend async (`IsolatedAsyncioTestCase`) & unit tests | Every backend task (`py -3 -m unittest`) `[VERIFIED: tests/test_soundtrack.py:44]` |
| ESLint + `typescript-eslint` | `10.0.1` / `8.56.0` | Static checks (`max-lines-per-function: 80`, `complexity: 15`) | After frontend edits (`pnpm lint`) `[VERIFIED: package.json:36,42; eslint.config.js:25-31]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `showModal(<GameEqModal />)` with `ModalRoot` | Inline overlay `<div>` inside `DeckifyExpandedModal` (like `TrackActionModal`) | `showModal` + `ModalRoot` matches `PlaylistPickerModal.tsx` (`SoundtracksTab.tsx:134`) and natively traps SteamOS modal focus; requires `onPickerOpenChange(true/false)` so `DeckifyExpandedModal`'s `useTriggerNavigation` suppresses `L1/R1/X/Y` behind it. `[VERIFIED: SoundtracksTab.tsx:130-149; DeckifyExpandedModal.tsx:751]` |
| Dedicated `active_game_override_snapshot` in `settings.json` | Separate JSON file in runtime dir | Storing inside `settings.json` atomically via `_save_settings` ensures `active_game_override_snapshot` stays synchronized with `game_audio_profiles` and `eq_preset` without extra file I/O (per D-14). `[VERIFIED: 19-CONTEXT.md:38]` |

**Installation:**
No new packages required (`pnpm install` / `pip install` untouched).

---

## Package Legitimacy Audit

> Phase 19 installs **zero** external npm or PyPI packages (`STATE.md:153`). All dependencies listed above are already present in `package.json`, `pnpm-lock.yaml`, and Python stdlib.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@decky/ui` (`4.11.1`) | npm (pre-installed) | Existing | Existing | `github.com/SteamDeckHomebrew/decky-frontend-lib` | Pre-existing | Reused (no new install) |
| `@decky/api` (`1.1.3`) | npm (pre-installed) | Existing | Existing | `github.com/SteamDeckHomebrew/decky-frontend-lib` | Pre-existing | Reused (no new install) |
| `react-icons` (`5.5.0`) | npm (pre-installed) | Existing | Existing | `github.com/react-icons/react-icons` | Pre-existing | Reused (no new install) |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture & Lifecycle Data Flow

```text
[SteamOS GameSessions / Router.MainRunningApp]
       │ (bRunning = true / false)
       ▼
[src/index.tsx] ──(RPC: handle_app_lifetime_event)──► [main.py] ──► [SoundtrackManager]
                                                                            │
   ┌────────────────────────────────────────────────────────────────────────┴───────────────────────────────────┐
   │ LAUNCH (after soundtrack_launch_debounce = 3.5s, D-09/D-10/D-12)                                           │ EXIT (after soundtrack_exit_debounce = 3.0s, D-13/D-15/D-16)
   ▼                                                                                                            ▼
1. Snapshot _pre_game_snapshot IF None (preserves pre-Game-A baseline across A->B switches)                 1. Save last_track_uri / last_position_ms if _playback_altered
2. EqualizerManager.apply_ephemeral_preset(game_eq, game_bands)                                             2. EqualizerManager.clear_ephemeral_override() FIRST
   └─ If None (Use Global): clear_ephemeral_override()                                                         └─ Re-applies current global settings["eq_preset"]
3. Persist active_game_override_snapshot in settings.json (D-14)                                               └─ If "flat": moves player to hw sink BEFORE tearing down deckify_eq_sink
4. Invalidate VolumeFader._cached_sink_input_id = None                                                      3. Pop active_game_override_snapshot from settings.json
5. VolumeFader.apply_game_override(vol_override, duck_override, duck_level_override)                        4. Invalidate VolumeFader._cached_sink_input_id = None
   └─ Respects _sleep_locked; smoothly fades via pactl set-sink-input-volume                                5. Check VolumeFader._sleep_locked is True (D-15):
   └─ Emits ducking_state_changed -> QAM live effective_volume (D-08)                                          ├─ True: SKIP VolumeFader un-duck & SKIP play_tracks/pause restore
6. Linked playlist playback (if any) & soundtrack_prompt_switch (NO set_volume API calls, D-05)                └─ False: clear_game_override() -> fade_to(global/voice target) + exit_policy
```

### Recommended Module Structure & File Ownership

```text
py_modules/
├── common.py          # Add active_game_override_snapshot to DEFAULT_SETTINGS + sanitizer; EQ_PID_FILE path
├── equalizer.py       # Ephemeral override state (_ephemeral_preset, _ephemeral_bands, _ephemeral_app_*),
│                      # preview_bands/clear_preview, eq.pid stale cleanup, SettingsTab isolation in set_bands()
├── volume.py          # Game override fields on VolumeFader, ceiling + attenuation + voice VAD target math,
│                      # apply_equalizer_preset() skip PipeWire mutate when ephemeral override active
└── soundtrack.py      # Extended _PROFILE_DEFAULTS & _sanitize_profile, D-05 set_volume removal,
                       # sequenced _run_launch (D-09/D-10/D-12) & _run_exit (D-13/D-15/D-16), refresh_active_overrides()
main.py                # _main() crash recovery (D-14), handle_app_lifetime_event delegation to debounce,
                       # live refresh on save/delete_game_soundtrack_profile, preview_eq_bands/clear_eq_preview RPCs,
                       # active_game_app_id & active_game_override in get_status()
src/
├── types.ts           # Extended SoundtrackProfile, ActiveGameOverrideInfo, StatusResponse fields
├── index.tsx          # QAM effectiveVolume display for has_game_override + DUCKED/GAME VOL indicator
├── components/
│   ├── DeckifyExpandedModal.tsx      # Pass runningAppId & global EQ settings to SoundtracksTab
│   ├── common/EqBandFaders.tsx       # Extracted reusable 10-band vertical fader strip (shared by SettingsTab & GameEqModal)
│   └── tabs/
│       ├── soundtrackUtils.ts        # EQ_OVERRIDE_OPTIONS, formatGameProfileSubtitle(), eq setters, normalizeProfiles()
│       ├── SoundtracksTab.tsx        # EQ Preset dropdown, Edit Game EQ button, dual sliders, D-11 subtitle
│       ├── GameEqModal.tsx           # Dedicated controller-navigable 10-band modal with seeding, Copy Preset/Flat, pw-cli preview
│       └── SettingsTab.tsx           # "Active Game EQ Override" badge + shared EqBandFaders
```

### Pattern 1: 3-Layer EQ State Machine (`py_modules/equalizer.py` + `py_modules/volume.py`)
**What:** Separate global settings (`settings["eq_preset"]`, `settings["eq_custom_bands"]`), active ephemeral game override (`_ephemeral_preset`, `_ephemeral_bands`, `_ephemeral_app_id`, `_ephemeral_app_name`), and modal live preview (`_preview_active`).
**Exact behavior verified against repo:**
- In `py_modules/equalizer.py:212-221`, `EqualizerManager.__init__` initializes process/lock state. Add:
  - `self._ephemeral_preset: str | None = None` (`None` = no override / Use Global; `"flat"` = explicit game override to Flat bypass)
  - `self._ephemeral_bands: list[float] | None = None`
  - `self._ephemeral_app_id: int | None = None`
  - `self._ephemeral_app_name: str = ""`
  - `self._preview_active: bool = False`
  - `self.pid_path = pid_path or (os.path.join(os.path.dirname(self.conf_path), "eq.pid") if conf_path else EQ_PID_FILE)`
- Helper property `has_ephemeral_override -> bool`: returns `isinstance(self._ephemeral_preset, str) and self._ephemeral_preset in EQ_PRESETS` (note: using `isinstance(..., str)` guarantees `MagicMock` in `tests/test_equalizer.py:323` never accidentally registers as active!). `[VERIFIED: tests/test_equalizer.py:322-335]`
- **`apply_preset(preset, custom_bands=None)` (`py_modules/equalizer.py:372-406`):**
  - Extend `_resolve_preset_bands(self, preset: str, custom_bands: list[float] | None = None)` so when `preset == "custom"`, it checks `custom_bands` first, then `self._ephemeral_bands` if `self.has_ephemeral_override`, and otherwise `self.plugin._settings.get("eq_custom_bands")`.
  - Existing calls `apply_preset(preset)` work identically with zero breaking signature change. `[VERIFIED: py_modules/equalizer.py:372-378]`
- **`apply_ephemeral_preset(preset: str | None, custom_bands: list[float] | None = None, app_id: int | None = None, app_name: str = "")`:**
  - If `preset is None` or `preset == "global"`: delegates to `await self.clear_ephemeral_override()`.
  - Otherwise validates `preset in EQ_PRESETS`, cancels any pending `_throttle_task`, sets `_preview_active = False`, sets `_ephemeral_preset = preset`, `_ephemeral_bands = clamp_eq_bands(custom_bands) if preset == "custom" and custom_bands is not None else None`, `_ephemeral_app_id = app_id`, `_ephemeral_app_name = app_name`, and awaits `self.apply_preset(preset, custom_bands=self._ephemeral_bands)` **without writing `self.plugin._settings`**.
- **`clear_ephemeral_override()`:**
  - If not `self.has_ephemeral_override` and not `self._preview_active`: return `{"ok": True, "restored": False}`.
  - Clears `_ephemeral_preset = None`, `_ephemeral_bands = None`, `_ephemeral_app_id = None`, `_ephemeral_app_name = ""`, `_preview_active = False`.
  - Reads global `global_preset = self.plugin._settings.get("eq_preset", "flat")` and awaits `self.apply_preset(global_preset)` (which moves `librespot`/`spotify_client` back to hardware sink before tearing down `deckify_eq_sink` on `"flat"`, per D-16).
- **`route_librespot_to_eq()` (`py_modules/equalizer.py:462-470`):**
  - Check `preset = self._ephemeral_preset if self.has_ephemeral_override else self.plugin._settings.get("eq_preset", "flat")`, and pass `custom_bands=self._ephemeral_bands if self.has_ephemeral_override else None` to `apply_preset`, so `librespot` restarts mid-game preserve the active game EQ! `[VERIFIED: py_modules/equalizer.py:462-473; main.py:532-533]`
- **`SettingsTab` global isolation (D-03):**
  - In `py_modules/volume.py:97-109` (`apply_equalizer_preset(plugin, preset)`):
    Always set `plugin._settings["eq_preset"] = preset`, `_save_settings(plugin._settings)`, and `await decky.emit("eq_preset_changed", {"preset": preset})`. ONLY call `await eq_mgr.apply_preset(preset)` if `not (eq_mgr is not None and getattr(eq_mgr, "has_ephemeral_override", False) is True)`. `[VERIFIED: py_modules/volume.py:97-109; tests/test_equalizer.py:322-335]`
  - In `EqualizerManager.set_bands(bands)` (`py_modules/equalizer.py:423-447`):
    Always update `self.plugin._settings["eq_preset"] = "custom"`, `self.plugin._settings["eq_custom_bands"] = clamped`, and schedule `self._save_task`. If `self.has_ephemeral_override` is `True`, return `{"ok": True, "preset": "custom", "bands": clamped, "deferred_by_game_override": True}` immediately without spawning PipeWire or calling `pw-cli`! `[VERIFIED: py_modules/equalizer.py:423-447]`
- **Modal Live Preview (D-02):**
  - `preview_bands(bands)` validates/clamps via `clamp_eq_bands(bands)`, sets `_preview_active = True`, starts `pipewire -c` if `not self.is_active` and routes player -> `EQ_SINK_NAME`, sets `_pending_bands = clamped`, and schedules `_throttled_pw_cli_flush()` (`75ms` coalescing) **without touching `_settings` or `_save_task`**.
  - `clear_preview()` cancels `_throttle_task`, sets `_preview_active = False`, `_pending_bands = None`, and restores whichever EQ is currently authoritative (`_ephemeral_preset`/`_ephemeral_bands` if `has_ephemeral_override`, else global `settings["eq_preset"]`).

### Pattern 2: Unified Local `VolumeFader` Target Formula (`py_modules/volume.py`)
**What:** Compute sink-input percentage purely locally from global baseline (`150.0` if `plugin._pa_volume_boosted` else `100.0`), active game override ceiling (`volume_override`), active game ducking (`"game"` reason + `ducking_level_override`), and voice VAD (`"voice"` reason).
**Exact target math matching D-06, D-07:**
```python
# Baseline sink volume (150% when boosted for librespot, 100% otherwise)
# [VERIFIED: py_modules/volume.py:274-275]
baseline_sink_vol = 150.0 if getattr(self.plugin, "_pa_volume_boosted", False) else 100.0

override = self._game_override  # dict | None: {"volume_override": int|None, "ducking_override": bool|None, "ducking_level_override": int|None}
vol_override = override.get("volume_override") if isinstance(override, dict) else None
ceiling_factor = (max(0, min(100, int(vol_override))) / 100.0) if vol_override is not None else 1.0

in_game_factor = ceiling_factor
if "game" in self._duck_reasons:
    custom_atten = override.get("ducking_level_override") if isinstance(override, dict) else None
    if custom_atten is not None:
        game_duck_factor = max(0.05, 1.0 - (max(0, min(95, int(custom_atten))) / 100.0))
    elif settings.get("ducking_mode", "proportional") == "proportional":
        attenuation_pct = float(settings.get("ducking_proportional_pct", 50))
        game_duck_factor = max(0.05, 1.0 - (attenuation_pct / 100.0))
    else:
        fixed_vol = float(settings.get("auto_ducking_volume", 25))
        base_spotify_vol = float(getattr(self.plugin, "_poll_volume", 80) or 80)
        game_duck_factor = min(1.0, fixed_vol / max(1.0, base_spotify_vol))
    in_game_factor = ceiling_factor * game_duck_factor

final_factor = in_game_factor
if "voice" in self._duck_reasons:
    if settings.get("ducking_mode", "proportional") == "proportional":
        atten_pct = float(settings.get("ducking_proportional_pct", 50))
        voice_factor = ceiling_factor * max(0.05, 1.0 - (atten_pct / 100.0))
    else:
        voice_vol = float(settings.get("voice_ducking_volume", 25))
        base_spotify_vol = float(getattr(self.plugin, "_poll_volume", 80) or 80)
        voice_factor = min(1.0, voice_vol / max(1.0, base_spotify_vol))
    final_factor = min(in_game_factor, voice_factor)

return baseline_sink_vol * final_factor
```
**Verification against all cases:**
- No game override + no ducking -> `1.0 * baseline_sink_vol` (unchanged). `[VERIFIED: py_modules/volume.py:276-277]`
- No game override + proportional 50% -> `0.5 * baseline_sink_vol` (passes `test_calculation_mode_fixed_vs_proportional`). `[VERIFIED: tests/test_volume.py:219-227]`
- No game override + fixed 25 / base 80 -> `31.25` (passes `test_calculation_mode_fixed_vs_proportional`). `[VERIFIED: tests/test_volume.py:229-236]`
- `volume_override=65`, `ducking_override=False` -> `"game"` not in `_duck_reasons` -> `0.65 * baseline_sink_vol` (`52%` effective when Spotify base is `80%`). If `"voice"` activates at 50%, dips further to `0.65 * 0.50 = 0.325`. `[VERIFIED: 19-CONTEXT.md:27]`
- `volume_override=80`, `ducking_override=True`, `ducking_level_override=40` -> `0.80 * (1 - 0.40) = 0.48` (`48%` of baseline). `[VERIFIED: 19-CONTEXT.md:27]`
- `volume_override=None`, `ducking_level_override=40` -> `1.0 * 0.60 = 0.60`. `[VERIFIED: 19-CONTEXT.md:27]`

**State emission (`VolumeFader._emit_state` & `main.py:get_ducking_state`):**
Add `"has_game_override": self._game_override is not None` to both `ducking_state_changed` (`py_modules/volume.py:390-395`) and `get_ducking_state()` (`main.py:917-922`), and update `src/index.tsx:919` to read:
`value={(isDucked || hasGameOverride) && effectiveVolume != null ? effectiveVolume : volume}`. `[VERIFIED: py_modules/volume.py:384-396; main.py:913-922; src/index.tsx:901-927]`

### Pattern 3: `SoundtrackProfile` Schema & `SoundtrackManager` Sanitization (`py_modules/soundtrack.py`, `src/types.ts`, `soundtrackUtils.ts`)
- Extend `_PROFILE_DEFAULTS` (`py_modules/soundtrack.py:20-34`):
  - `"eq_preset": None` (valid: `None` or key in `EQ_PRESETS`; note `"global"` from UI maps to `None`)
  - `"eq_custom_bands": None` (valid: `None` or 10 floats clamped via `clamp_eq_bands`)
  - `"ducking_level_override": None` (valid: `None` or int clamped `0..95`; reject `bool` via `isinstance(val, bool)`)
- Extend `SoundtrackManager._sanitize_profile()` (`py_modules/soundtrack.py:105-156`):
  - `"eq_preset"`: `None` if `val is None` or `val == "global"`; `val` if `isinstance(val, str)` and `val.strip().lower() in EQ_PRESETS`; else `None`.
  - `"eq_custom_bands"`: `None` if `val is None`; else `clamp_eq_bands(val)` if `isinstance(val, (list, tuple))`; else `None`.
  - `"ducking_level_override"`: `None` if `val is None` or `isinstance(val, bool)`; else `max(0, min(95, int(val)))`.
- Update `SoundtrackManager._run_launch(app_id)` (`py_modules/soundtrack.py:288-350`) per D-05, D-09, D-10, D-12, D-14:
  - Always resolve `profile = self.get_profile(app_id)` first. Even if `profile` has `playlists == []` OR `was_playing and not profile.get("always_auto_start")`, **run the audio override activation BEFORE any playlist early return**!
  - Audio activation sequence inside `_run_launch` (and extracted into an async helper `apply_active_audio_profile(app_id)` reused by `refresh_active_overrides` for D-04/D-08!):
    1. Resolve `eq_preset = profile.get("eq_preset")` and `eq_bands = profile.get("eq_custom_bands")` (if `profile` else `None, None`).
    2. If `eq_mgr` exists: if `eq_preset` is set, call `await eq_mgr.apply_ephemeral_preset(eq_preset, eq_bands, app_id=app_id, app_name=...)`; else call `await eq_mgr.clear_ephemeral_override()` (ensuring Game B using Global cleanly clears Game A's EQ per D-12).
    3. Compute `duck_override = profile.get("ducking_override")` (`True`/`False`/`None`), `vol_override = profile.get("volume_override")`, `duck_level = profile.get("ducking_level_override")`.
       Should `"game"` ducking engage? `should_duck = (duck_override is True) or (duck_override is None and bool(self._settings.get("auto_ducking", True)))`.
    4. Persist `active_game_override_snapshot` in `self._settings` + `self._persist()` whenever any ephemeral override (`eq_preset is not None`, `vol_override is not None`, `duck_override is not None`, `duck_level is not None`, or `should_duck`) is active; otherwise pop it.
    5. Invalidate `fader._cached_sink_input_id = None` (D-10).
    6. Call `fader.apply_game_override(active_duck=should_duck, volume_override=vol_override, ducking_override=duck_override, ducking_level_override=duck_level)` (checking `getattr(fader, "_sleep_locked", False) is True` inside `VolumeFader` so `_sleep_locked` still blocks fades while keeping `_duck_reasons` / `_game_override` accurate for `release_sleep_lock`).
    7. Emit `game_audio_override_changed` event with current override summary.
  - **CRITICAL:** Remove `self.plugin.set_volume(...)` from `_run_launch` (lines 345-350) and `_run_exit` (lines 364-368) per D-05! `[VERIFIED: py_modules/soundtrack.py:345-350,364-368]`

### Pattern 4: Boot Crash Recovery (`Plugin._main()` in `main.py`)
- In `py_modules/common.py`: add `"active_game_override_snapshot": None` to `DEFAULT_SETTINGS`, validate dict with positive int `app_id` in `_load_settings()` (else `None`).
- In `main.py:_main()` (`main.py:143-181`):
  1. Read `stale_snapshot = self._settings.get("active_game_override_snapshot")`.
  2. In `EqualizerManager`, support tracking `eq.pid` (`EQ_PID_FILE`): if `stale_snapshot` is present (or stale `eq.pid` exists), kill any orphan `pipewire -c` process after moving player streams cleanly back to hardware sink (`_fallback_to_hardware_sink()`).
  3. After `await self.start_librespot()` (`main.py:176`):
     - Check whether the frontend has *already* reported `stale_snapshot["app_id"]` as running (`self._soundtrack_manager._active_game_app_id == stale_app_id`).
     - If NOT still reported running:
       - Clear `self._settings["active_game_override_snapshot"] = None` and `_save_settings(self._settings)` (D-14).
       - Apply persistent global EQ: `initial_eq = self._settings.get("eq_preset", "flat")` -> call `await self._equalizer_manager.apply_preset(initial_eq)` (even when `"flat"`, if `stale_snapshot` had a non-flat EQ, so orphan `deckify_eq_sink` routing is torn down!). `[VERIFIED: main.py:177-179]`
       - Restore un-ducked `VolumeFader` baseline: `self._volume_fader._duck_reasons.clear()`, `self._volume_fader._game_override = None`, `self._volume_fader._cached_sink_input_id = None`, and `await self._volume_fader.fade_to(baseline, 0.0)` so PipeWire `module-stream-restore` does not leave audio stuck at a crashed game's ducked level!

### Pattern 5: Reusable 10-Band Vertical Fader Component + `GameEqModal` (`src/components/`)
- Extract the 10-band vertical fader strip from `SettingsTab.tsx:531-673` into `src/components/common/EqBandFaders.tsx` (`EQ_BAND_LABELS`, `EQ_SHORT_LABELS`, `EQ_PRESET_CURVES`, `normalizeEqBands`, `EqBandFaders` component) so both `SettingsTab.tsx` and `GameEqModal.tsx` share identical markup, `role="slider"`, `aria-label`, `+`/`-` `InteractiveRow` steppers, pointer drag handling, and `flow-children="horizontal"` navigation! `[VERIFIED: SettingsTab.tsx:8-45,531-673; SettingsTab.test.tsx:581-595]`
- Wait: **Verify test compatibility in `SettingsTab.test.tsx`!**
  Look at `SettingsTab.test.tsx:587-595` and `624-631`:
  `SettingsTab.test.tsx` uses a custom JSX-object-tree walker `findNodes(tree, ...)`! Note that in `SettingsTab.test.tsx`, `findNodes` checks `tree.props && tree.props.children` — it does **NOT** invoke child function components (`typeof tree.type === "function"`)!
  **WAIT — HUGE TEST FINDING!!**
  Look closely at `SettingsTab.test.tsx:98-116`!!
  ```ts
  function findNodes(tree: any, predicate: (node: any) => boolean, results: any[] = []): any[] {
    if (!tree) return results;
    if (Array.isArray(tree)) { ... }
    if (predicate(tree)) results.push(tree);
    if (tree.props && tree.props.children) {
      ...
    }
    return results;
  }
  ```
  `findNodes` in `SettingsTab.test.tsx` calls `SettingsTab(...)` as a function (`tree = SettingsTab(...)`), which returns the JSX element object tree, and `findNodes` walks `tree.props.children` WITHOUT expanding `<EqBandFaders ... />` if `<EqBandFaders />` is rendered as a JSX element `{ type: EqBandFaders, props: ... }`!!
  If `SettingsTab.tsx` renders `<EqBandFaders ... />` as JSX instead of calling `renderEqBandFaders(...)` (a plain helper function returning JSX directly) or expanding in `SettingsTab.test.tsx`, then `SettingsTab.test.tsx:587` (`findNodes(tree, n => n.props?.role === "slider")`) would find **0** sliders instead of **10**!!
  **Solution:** Put the shared 10-band fader strip in `src/components/common/EqBandFaders.tsx` as a plain render function `renderEqBandFaders(props)` (and/or wrapper `<EqBandFaders>` for modals like `GameEqModal.tsx`), and call `renderEqBandFaders(...)` inside `SettingsTab.tsx` (or update `findNodes` if needed — calling `renderEqBandFaders(...)` keeps `SettingsTab.test.tsx` 100% green without even touching its `findNodes` helper!). What a critical catch!

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PipeWire 10-band biquad DSP & `pw-cli` parameter updates | Custom LADSPA/PipeWire config generator or second `pipewire -c` process | `EqualizerManager` (`py_modules/equalizer.py`) + `build_pw_cli_params` + `clamp_eq_bands` | Already handles automatic negative preamp (`compute_preamp_db`), `75ms` `pw-cli` coalescing, `flat` true bypass ordering, and `LD_LIBRARY_PATH` stripping. `[VERIFIED: py_modules/equalizer.py:51-207]` |
| Sink-input discovery & Steam UI protection | Custom `pactl list sink-inputs` parser | `resolve_spotify_sink_input_ids()` (`py_modules/engine.py:147-219`) & `VolumeFader.resolve_sink_input_id()` (`py_modules/volume.py:231-252`) | Guarantees `steamwebhelper`, `Chromium`, and game audio streams are never ducked or moved. `[VERIFIED: py_modules/engine.py:174-219]` |
| Smooth sink-input volume ramping | Direct step jumps or Spotify Web API `PUT /v1/me/player/volume` | `VolumeFader.fade_to()` with `cosine_ease()` (`py_modules/volume.py:202-383`) | 50ms cosine S-curve slices, mid-fade cancellation continuity, single sink-input caching, zero 429 rate limits. `[VERIFIED: py_modules/volume.py:202-383]` |
| Unsigned 32-bit Steam / Non-Steam `app_id` validation | Custom `int(app_id)` parsing | `validate_app_id()` (`py_modules/soundtrack.py:49-59`) | Rejects `bool`, negative numbers, `0`, and `> 0xFFFFFFFF` (handles high-bit Non-Steam CRC AppIDs). `[VERIFIED: py_modules/soundtrack.py:49-59]` |
| Controller-safe modal wrapper & focus tracking | Custom `<div>` portal or raw HTML `<button>` | `@decky/ui` `showModal` + `ModalRoot` + `InteractiveRow` / `DialogButton` (following `PlaylistPickerModal.tsx`) | Properly mounts on SteamOS modal stack, handles `B` (`onCancel`) and `onPickerOpenChange` suppression in `DeckifyExpandedModal`. `[VERIFIED: PlaylistPickerModal.tsx:168-193; SoundtracksTab.tsx:130-149]` |

**Key insight:** Every DSP, PipeWire stream isolation, and GamepadUI modal primitive needed for Phase 19 already exists in the codebase; the core engineering work is introducing clean layering and sequencing between them rather than building new audio/UI infrastructure.

---

## Common Pitfalls

### Pitfall 1: `MagicMock` Truthiness on New Manager Properties
**What goes wrong:** Existing tests in `tests/test_equalizer.py:323` and `tests/test_soundtrack.py:32` pass bare `MagicMock()` instances for `_equalizer_manager` and `_volume_fader`. Checking `if eq_mgr._ephemeral_preset is not None:`, `if fader._sleep_locked:`, or `await fader.apply_game_override(...)` raises `TypeError: object MagicMock can't be used in 'await' expression` or silently treats a mock as an active override/sleep lock.
**Why it happens:** In `unittest.mock`, accessing any attribute on `MagicMock` returns a truthy child `MagicMock` that is not a coroutine.
**How to avoid:** Use strict type checks (`isinstance(getattr(eq_mgr, "_ephemeral_preset", None), str)` / `getattr(eq_mgr, "has_ephemeral_override", False) is True`, `getattr(fader, "_sleep_locked", False) is True`) and check `inspect.isawaitable(res)` when calling optional async methods on `plugin._volume_fader` or `plugin._equalizer_manager` (plus update `make_plugin()` in `tests/test_soundtrack.py` with `AsyncMock` methods). `[VERIFIED: tests/test_soundtrack.py:32; tests/test_equalizer.py:323]`

### Pitfall 2: React Hook / Custom JSX-Walker Test Breakage on Refactored Components
**What goes wrong:** `SettingsTab.test.tsx` and `SoundtracksTab.test.tsx` mock `react` (`useState`/`useRef`) and walk the returned JSX object tree via `findNodes(tree, ...)` without invoking nested function components. Extracting a sub-component `<EqBandFaders />` inside `SettingsTab.tsx` breaks `findNodes(tree, n => n.props?.role === "slider")` unless called as a plain render function `renderEqBandFaders(...)`. Similarly, `SoundtracksTab.test.tsx:221` hardcodes `expect(sliders).toHaveLength(1)` and `SoundtracksTab.test.tsx:190` indexes `stateValues[2]` for `searchQuery`!
**Why it happens:** Shallow JSX object inspection relies on top-level `useState` hook slot order (`stateValues[2]`) and inline child elements.
**How to avoid:**
1. Keep existing `useState` declaration order in `SoundtracksTab.tsx` (`games`, `profiles`, `searchQuery`, `expandedAppId`, `loading`) so `stateValues[2]` remains `searchQuery`. `[VERIFIED: SoundtracksTab.tsx:64-70; SoundtracksTab.test.tsx:189-190]`
2. Call `renderEqBandFaders(...)` directly in `SettingsTab.tsx` (and in `GameEqModal.tsx`). `[VERIFIED: SettingsTab.test.tsx:98-116,581-595]`
3. Update `SoundtracksTab.test.tsx:220-222` to locate the `"Volume Override"` slider and new `"Ducking Attenuation Override"` slider by label rather than assuming `sliders.length === 1`. `[VERIFIED: SoundtracksTab.test.tsx:220-222]`

### Pitfall 3: Premature Launch Ducking & Frontend 3000ms Exit Timer Races (D-10, D-12)
**What goes wrong:** Today `main.py:880-882` triggers `"game"` ducking immediately at `t=0s` inside `handle_app_lifetime_event`, before `SoundtrackManager._delayed_launch` (`3.5s`) spawns `deckify_eq_sink`. Meanwhile, `src/index.tsx:1274-1279` schedules `backendTriggerDucking(false, "game")` at `3000ms`, which could fire before a user-configured `soundtrack_exit_debounce > 3.0s` finishes `_run_exit`, or restart a fade-up right after `_run_exit` finishes!
**Why it happens:** Launch ducking lived in `main.py` (`t=0s`) and exit un-ducking lived in `src/index.tsx` (`3000ms`) from Phases 06–11.1 before per-game EQ + `VolumeFader` sequencing existed.
**How to avoid:**
- Remove immediate `trigger_ducking(True, "game", valid_id)` from `main.py:handle_app_lifetime_event` and perform sequenced EQ -> sink-input cache invalidation -> `VolumeFader` fade inside `SoundtrackManager._run_launch` (updating `test_lifecycle_event_routes_and_ducks` and `test_ducking_override_false_skips_duck` in `tests/test_soundtrack.py`). `[VERIFIED: main.py:880-883; tests/test_soundtrack.py:312-328]`
- In `main.py:trigger_ducking(False, "game")`, skip if `SoundtrackManager._pending(manager._exit_task)` is still waiting on `soundtrack_exit_debounce`, and in `VolumeFader.set_ducking(False, "game")`, make already-cleared state a no-op so the frontend's 3000ms timer (`src/index.tsx:1278`, tested in `src/index.test.tsx:210-243`) never prematurely un-ducks or disrupts an active fade. `[VERIFIED: src/index.tsx:1274-1279; src/index.test.tsx:210-243]`

### Pitfall 4: `DeckifyExpandedModal` Not Passing `runningAppId` or Global EQ to `SoundtracksTab`
**What goes wrong:** `SoundtracksTab` has `runningAppId` in its props (`SoundtracksTab.tsx:50`), but `DeckifyExpandedModal.tsx:1230` renders `<SoundtracksTab showToast={showToast} onPickerOpenChange={setPlaylistPickerOpen} />` without `runningAppId`. Without `runningAppId`, `SoundtracksTab` never knows which game is actively running (`isRunning === false`), breaking live hot-apply (`D-04`), live mid-game fader (`D-08`), and conditional restore-on-close in `GameEqModal` (`D-02`).
**Why it happens:** `currentRunningAppId` lived only inside `src/index.tsx:85` and was never surfaced through `get_status()` or props.
**How to avoid:** Expose `active_game_app_id` and `active_game_override` in `Plugin.get_status()` (`main.py:550-639`) — AND emit `game_audio_override_changed` on launch/exit — then pass `runningAppId={status?.active_game_app_id ?? null}` and `globalEqPreset` / `globalEqCustomBands` / `globalDuckingPct` from `DeckifyExpandedModal.tsx:1230` into `SoundtracksTab`. `[VERIFIED: DeckifyExpandedModal.tsx:1229-1231; SoundtracksTab.tsx:49-55; src/index.tsx:85-90]`

### Pitfall 5: Orphan `pipewire -c` EQ Process After Crash When Global EQ is `"flat"`
**What goes wrong:** On plugin crash/kill while a game EQ override (`"gaming"`) is active and global EQ is `"flat"`, `pipewire -c eq-filter-chain.conf` stays alive as an orphan daemon in PipeWire. On restart, `Plugin._main()` creates a fresh `EqualizerManager` (`self._process = None`) and skips calling `apply_preset("flat")` because `initial_eq == "flat"` (`main.py:178`), leaving `librespot` or PipeWire `module-stream-restore` routed into a stale `deckify_eq_sink`!
**Why it happens:** `EqualizerManager` currently has no PID file (`eq.pid`), unlike `librespot` (`LIBRESPOT_PID_FILE` in `main.py:1259-1276`).
**How to avoid:** Track `EQ_PID_FILE` in `EqualizerManager._start_process()` / `stop()`. On `_main()` boot when `active_game_override_snapshot` is present (or stale `eq.pid` is alive), move player streams to hardware sink first, terminate the stale `pipewire -c` PID cleanly, clear `active_game_override_snapshot`, apply global `eq_preset`, and reset `VolumeFader` baseline. `[VERIFIED: main.py:176-180,1259-1276; py_modules/equalizer.py:318-347]`

### Pitfall 6: Modal Focus Loss / Trigger Leakage Behind `GameEqModal`
**What goes wrong:** Pressing `L1`/`R1`/`X`/`Y` while `GameEqModal` is open fires `DeckifyExpandedModal`'s `useTriggerNavigation` behind the modal, or closing `GameEqModal` with `B` fails to restore the active EQ on non-running games.
**Why it happens:** `showModal` mounts a sibling React root outside `DeckifyExpandedModal`'s DOM tree.
**How to avoid:** Pass `onPickerOpenChange?.(true)` on modal open and `onPickerOpenChange?.(false)` on modal close (reusing `DeckifyExpandedModal`'s `setPlaylistPickerOpen` suppression flag at line 751), render all modal controls (`Reset Flat`, `Copy from Preset`, `+`/`-` band steppers, `Save EQ`, `Cancel`) using `@decky/ui` `InteractiveRow` / `DialogButton` inside `ModalRoot` (`onCancel`, `closeModal`), and invoke `clear_eq_preview()` inside unmount cleanup unless saved for the currently running game. `[VERIFIED: DeckifyExpandedModal.tsx:749-751; SoundtracksTab.tsx:130-149; PlaylistPickerModal.tsx:168-193]`

### Pitfall 7: `librespot` Mid-Game Restart & `VolumeFader` QAM Display When `ducking_override` is OFF
**What goes wrong:** (a) If `librespot` crashes and restarts mid-game, `EqualizerManager.on_librespot_started()` (`main.py:532-533`) checks `self._settings.get("eq_preset", "flat")` instead of the active game's `_ephemeral_preset`. (b) If a running game has `volume_override: 65` and `ducking_override: false`, `VolumeFader.is_ducked` is `False`, so `src/index.tsx:919` (`isDucked && effectiveVolume != null ? effectiveVolume : volume`) ignores `effectiveVolume` and displays the unscaled Spotify volume!
**How to avoid:** (a) Update `main.py:532` and `EqualizerManager.route_librespot_to_eq()` to check `has_ephemeral_override`. (b) Emit `"has_game_override": self._game_override is not None` in `ducking_state_changed` and update QAM slider condition in `src/index.tsx:919` to `(isDucked || hasGameOverride) && effectiveVolume != null`. `[VERIFIED: main.py:532-533; py_modules/equalizer.py:462-473; src/index.tsx:901-927]`

---

## Code Examples

### Backend: Sequencing `_run_launch` & `_run_exit` with `_sleep_locked` (`py_modules/soundtrack.py`)
```python
# Pattern derived from py_modules/soundtrack.py:288-394, py_modules/equalizer.py:377-406, py_modules/volume.py:272-326
async def _apply_audio_overrides_for_app(self, app_id: int, profile: dict | None) -> None:
    eq_mgr = getattr(self.plugin, "_equalizer_manager", None)
    fader = getattr(self.plugin, "_volume_fader", None)

    eq_preset = profile.get("eq_preset") if isinstance(profile, dict) else None
    eq_bands = profile.get("eq_custom_bands") if (isinstance(profile, dict) and eq_preset == "custom") else None

    if eq_mgr is not None:
        if eq_preset is not None and hasattr(eq_mgr, "apply_ephemeral_preset"):
            res = eq_mgr.apply_ephemeral_preset(
                eq_preset,
                eq_bands,
                app_id=app_id,
                app_name=str((profile or {}).get("app_name") or ""),
            )
            if inspect.isawaitable(res):
                await res
        elif hasattr(eq_mgr, "clear_ephemeral_override"):
            res = eq_mgr.clear_ephemeral_override()
            if inspect.isawaitable(res):
                await res

    vol_override = profile.get("volume_override") if isinstance(profile, dict) else None
    duck_override = profile.get("ducking_override") if isinstance(profile, dict) else None
    duck_level = profile.get("ducking_level_override") if isinstance(profile, dict) else None
    auto_duck = bool(self._settings.get("auto_ducking", True))
    should_duck = (duck_override is True) or (duck_override is None and auto_duck)

    has_ephemeral = any(v is not None for v in (eq_preset, vol_override, duck_override, duck_level)) or should_duck
    if has_ephemeral:
        self._settings["active_game_override_snapshot"] = {
            "app_id": app_id,
            "eq_preset": eq_preset,
            "volume_override": vol_override,
            "ducking_override": duck_override,
            "ducking_level_override": duck_level,
        }
    else:
        self._settings.pop("active_game_override_snapshot", None)
    self._persist()

    if fader is not None:
        fader._cached_sink_input_id = None  # D-10: invalidate after EQ sink creation/teardown
        if hasattr(fader, "apply_game_override"):
            res = fader.apply_game_override(
                active_duck=should_duck,
                volume_override=vol_override,
                ducking_override=duck_override,
                ducking_level_override=duck_level,
            )
            if inspect.isawaitable(res):
                await res
```

### Frontend: `SoundtracksTab` EQ Dropdown + Dual Sliders + Subtitle (`src/components/tabs/soundtrackUtils.ts`)
```typescript
// Pattern derived from src/components/tabs/soundtrackUtils.ts:28-109 & src/types.ts:38-45,354-367
export function formatGameProfileSubtitle(profile: SoundtrackProfile): string {
  const parts: string[] = [];
  const hasAudioOverride =
    profile.eq_preset != null ||
    profile.volume_override != null ||
    profile.ducking_override === false ||
    profile.ducking_level_override != null;

  if (profile.playlists.length > 0) {
    parts.push(`${profile.playlists.length} linked soundtrack${profile.playlists.length > 1 ? "s" : ""}`);
  } else if (hasAudioOverride) {
    parts.push("Audio profile only");
  } else {
    return "No soundtrack configured";
  }

  if (profile.eq_preset) {
    parts.push(`EQ: ${EQ_PRESET_LABELS[profile.eq_preset] ?? profile.eq_preset}`);
  }
  if (profile.volume_override != null) {
    parts.push(`Vol: ${profile.volume_override}%`);
  }
  if (profile.ducking_override === false) {
    parts.push("Duck: Off");
  } else if (profile.ducking_level_override != null) {
    parts.push(`Duck: ${profile.ducking_level_override}%`);
  }
  return parts.join(" • ");
}
```

---

## State of the Art

| Old Approach (v0.5–v0.6) | Current Approach (Phase 19 / v0.7) | Impact |
|--------------------------|------------------------------------|--------|
| `SoundtrackManager` called Spotify Web API `PUT /v1/me/player/volume` (`self.plugin.set_volume`) for `volume_override` | 100% local PipeWire `VolumeFader` sink-input scaling (`pactl set-sink-input-volume` with 50ms cosine easing) | Eliminates cloud API 429 errors, 300ms network latency, double-attenuation, and remote-device volume hijack. |
| Single global `settings["eq_preset"]` / `["eq_custom_bands"]` mutated directly on PipeWire | 3-layer EQ state (`global` -> `_ephemeral_*` -> modal `_preview_*`) with `active_game_override_snapshot` crash recovery | Preserves global EQ baseline on disk across mid-game edits, crashes, and back-to-back game switches. |
| Ducking fired immediately on launch (`t=0s`) and un-ducked via frontend 3000ms timer | Sequenced post-debounce launch/exit inside `SoundtrackManager` with sink-input cache invalidation and `_sleep_locked` priority | Prevents Proton launcher flapping, PipeWire sink-input race pops, and Sleep Timer fade-out interruptions. |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Live PipeWire `pipewire -c` (`deckify_eq_sink`), `pw-cli set-param`, and `pactl set-sink-input-volume` transitions operate without audible clicks/corking during `_run_launch`/`_run_exit` sequencing on SteamOS 3.5+/3.7+ (`pipewire`/`pactl` binaries are not installed on the Windows development machine). | Environment Availability / Architecture Patterns | Requires live Steam Deck UAT verification (already modeled in Validation Architecture Manual-Only checks); code falls back to hardware sink if `pipewire -c` exits non-zero. |
| A2 | Existing tests in `tests/test_soundtrack.py` (`test_volume_override_applied_and_reverted`, `test_lifecycle_event_routes_and_ducks`, `test_ducking_override_false_skips_duck`) and `src/components/tabs/SoundtracksTab.test.tsx:221` are intentional targets for update under D-05, D-06, and D-10. | Common Pitfalls / Validation Architecture | Planner must schedule test updates explicitly in the relevant backend and frontend plan tasks so CI stays green. |

---

## Open Questions

1. **Modal Save-vs-Debounce Latency when Editing Running Game EQ (`D-02` / `D-04`)**
   - What we know: `SoundtracksTab.tsx` debounces `persistProfile` via `SAVE_DEBOUNCE_MS = 500`, while clicking **Save EQ** inside `GameEqModal` for a currently running game should keep/apply the new custom curve without a 500ms gap or accidental `clear_eq_preview()` teardown.
   - Recommendation: When `GameEqModal` saves a curve (`onSave(bands)`), update React `profiles` state AND invoke `backendSaveProfile` immediately (cancelling any pending timer for that `app_id`), rather than waiting 500ms, so `EqualizerManager` promotes the live preview straight into `_ephemeral_bands` seamlessly.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python (`py -3`) | Backend unit tests (`unittest`) | ✓ | `3.14.0` | — |
| Node.js (`node`) | Frontend build & Vitest | ✓ | `v25.1.0` | — |
| `pnpm` | `test`, `typecheck`, `lint`, `build` | ✓ | `10.28.0` | — |
| `git` | GSD commits & diffs | ✓ | `2.46.0.windows.1` | — |
| `pipewire` / `pw-cli` / `pw-dump` / `pactl` | Live SteamOS DSP & sink-input volume scaling | ✗ (Windows dev host) | SteamOS 3.5+ runtime | Mocked via `subprocess.run`/`Popen` in `tests/test_equalizer.py` & `tests/test_volume.py`; verified on Steam Deck via UAT |

**Missing dependencies with no fallback:** None for development/automated testing (live PipeWire execution is SteamOS-host-only and verified via UAT).

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Python `unittest` (`IsolatedAsyncioTestCase`) + Vitest `5.1.0` |
| Config file | `package.json` (`test`, `test:python`, `typecheck`, `lint`) |
| Quick run command | `py -3 -m unittest discover -s tests -p "test_*.py" -k "soundtrack or equalizer or volume"` and `pnpm test -- --run src/components/tabs/SoundtracksTab.test.tsx src/components/tabs/SettingsTab.test.tsx` |
| Full suite command | `py -3 -m unittest discover -s tests -p "test_*.py" && pnpm test -- --run && pnpm typecheck && pnpm lint` |

**Baseline Observed This Session:**
- `py -3 -m unittest discover -s tests -p "test_*.py"`: **547 tests passed** (`OK`, ~64s) `[VERIFIED: session tool output]`
- `pnpm test -- --run`: **16 test files, 175 tests passed** (~2.1s) `[VERIFIED: session tool output]`
- `pnpm typecheck`: exit `0` `[VERIFIED: session tool output]`
- `pnpm lint`: exit `0` (0 errors, existing warnings only) `[VERIFIED: session tool output]`

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GAME-01 | `SoundtrackProfile` sanitization (`eq_preset`, `eq_custom_bands`, `ducking_level_override`) + `active_game_override_snapshot` load/clamp | unit | `py -3 -m unittest discover -s tests -p "test_soundtrack.py"` | ✅ (extend) |
| GAME-01 | `EqualizerManager` ephemeral layer (`apply_ephemeral_preset`, `clear_ephemeral_override`, `preview_bands`, `clear_preview`, `SettingsTab` isolation, `eq.pid` cleanup) | unit | `py -3 -m unittest discover -s tests -p "test_equalizer.py"` | ✅ (extend) |
| GAME-01 | `VolumeFader` local game ceiling + attenuation + voice VAD + `has_game_override` emission + `_sleep_locked` protection | unit | `py -3 -m unittest discover -s tests -p "test_volume.py"` | ✅ (extend) |
| GAME-01 | Sequenced launch/exit, audio-only profiles, back-to-back A→B switch baseline preservation, live hot-apply on save/delete, `_main()` crash recovery | unit | `py -3 -m unittest discover -s tests -p "test_soundtrack.py"` | ✅ (extend) |
| GAME-01 | `SoundtracksTab` EQ dropdown, `"Edit Game EQ"` button, dual sliders, D-11 subtitle, `GameEqModal` seeding/preview/restore, `SettingsTab` override badge, QAM `has_game_override` display | unit | `pnpm test -- --run src/components/tabs/SoundtracksTab.test.tsx src/components/tabs/SettingsTab.test.tsx src/index.test.tsx` | ✅ (extend + ❌ Wave 0 `GameEqModal.test.tsx`) |

### Sampling Rate
- **Per task commit:** Run targeted Python (`test_soundtrack.py` / `test_equalizer.py` / `test_volume.py`) or Vitest (`SoundtracksTab.test.tsx` / `SettingsTab.test.tsx` / `GameEqModal.test.tsx` / `index.test.tsx`)
- **Per wave merge:** `py -3 -m unittest discover -s tests -p "test_*.py" && pnpm test -- --run && pnpm typecheck && pnpm lint`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/components/tabs/GameEqModal.test.tsx` — covers modal seeding from global/active curve, `"Copy from Preset / Reset Flat"`, live `preview_eq_bands` calls, and `clear_eq_preview` on non-running cancel/close
- [ ] Update pre-Phase-19 assertions in `tests/test_soundtrack.py` (`test_volume_override_applied_and_reverted`, `test_lifecycle_event_routes_and_ducks`, `test_ducking_override_false_skips_duck`) and `src/components/tabs/SoundtracksTab.test.tsx` (`expect(sliders).toHaveLength(1)`) to align with D-05, D-06, and D-10

---

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth or token flows touched in Phase 19 |
| V3 Session Management | no | No session/OAuth state modified |
| V4 Access Control | yes | UID 1000 privilege drop via `_build_deck_command()` and `LD_LIBRARY_PATH` removal (`py_modules/common.py:38,388-408`) |
| V5 Input Validation | yes | `validate_app_id()` (`1..0xFFFFFFFF`), `EQ_PRESETS` allowlist, `clamp_eq_bands()` (`[-12.0, 12.0]`, NaN/bool guard), `volume_override` (`0..100`), `ducking_level_override` (`0..95`, bool guard), `_is_valid_sink_name()`, numeric `sink_input_id.isdigit()` |
| V6 Cryptography | no | No cryptographic primitives used |

### Known Threat Patterns for SteamOS / PipeWire Stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Command / argument injection via PipeWire sink or preset names | Tampering / EoP | Never invoke `shell=True`; pass `list[str]` arguments to `subprocess.run`/`Popen`, validate `eq_preset` against `EQ_PRESETS`, `sink_name` via `_is_valid_sink_name()`, and `sink_input_id.isdigit()` (`py_modules/equalizer.py:84-92`; `py_modules/volume.py:257`) |
| Unbounded / corrupted `settings.json` values (`NaN`, `bool`, out-of-range dB) crashing PipeWire `filter-chain` | DoS / Tampering | Sanitize all `eq_custom_bands`, `ducking_level_override`, `volume_override`, and `active_game_override_snapshot` in both `_sanitize_profile()`, `preview_eq_bands` RPC, and `_load_settings()` |
| Steam GamepadUI `steamwebhelper` / game stream hijacking | Elevation / Integrity | Route all sink-input discovery exclusively through `resolve_spotify_sink_input_ids()` (`py_modules/engine.py:147-219`) with `steamwebhelper`/`Chromium` deny-list |

---

## Sources

### Primary (HIGH confidence — Verified In-Repo)
- `19-CONTEXT.md` — Locked Decisions D-01 through D-16 and Canonical References
- `.planning/research/PITFALLS.md:72-102` — Pitfall 3: Four-Way Audio Priority Collision
- `py_modules/equalizer.py:17-503` — `EqualizerManager`, `EQ_PRESETS`, `clamp_eq_bands`, `build_pw_cli_params`, `route_librespot_to_eq`
- `py_modules/volume.py:97-396` — `apply_equalizer_preset`, `VolumeFader`, `_compute_target_sink_volume`, `start_sleep_fade`, `release_sleep_lock`, `_emit_state`
- `py_modules/soundtrack.py:13-443` — `SoundtrackManager`, `_PROFILE_DEFAULTS`, `_sanitize_profile`, `_run_launch`, `_run_exit`
- `py_modules/common.py:73-331,388-408` — `DEFAULT_SETTINGS`, `_load_settings`, `_build_deck_command`
- `main.py:143-181,532-639,834-1027` — `_main`, `start_librespot`, `get_status`, `handle_app_lifetime_event`, `trigger_ducking`, `set_eq_bands`
- `src/components/tabs/SoundtracksTab.tsx`, `soundtrackUtils.ts`, `PlaylistPickerModal.tsx` — Existing game cards, `500ms` save debounce, `showModal`/`onPickerOpenChange` pattern
- `src/components/tabs/SettingsTab.tsx:8-174,482-674` — Existing 7 EQ presets and 10-band vertical faders
- `src/components/DeckifyExpandedModal.tsx:748-751,1229-1239` & `src/index.tsx:85-108,897-927,1245-1285` — `useTriggerNavigation` suppression, QAM volume slider, `GameSessions` listener
- `node_modules/@decky/ui/dist/components/*.d.ts` — `ModalRootProps`, `DropdownItemProps`, `SliderFieldProps`, `FocusableProps`
- `tests/test_soundtrack.py`, `tests/test_equalizer.py`, `tests/test_volume.py`, `tests/test_e2e_requirements.py`, `src/components/tabs/SoundtracksTab.test.tsx`, `src/components/tabs/SettingsTab.test.tsx`, `src/index.test.tsx` — Existing test contracts and mock shapes

### Secondary (LOW confidence — WebSearch, SteamOS runtime target not available locally)
- [PipeWire `pw-cli set-param` runtime Props update](https://docs.pipewire.org/) — Confirms `pw-cli set-param <node-id> Props '{ params = [ ... ] }'` runtime filter-chain control (`[CITED: docs.pipewire.org]`, matched against `py_modules/equalizer.py:199-206,299-316`)
- [`@decky/ui` `showModal` / `ModalRoot` controller focus behavior](https://github.com/SteamDeckHomebrew/decky-frontend-lib) — Confirms using `@decky/ui` focusable components inside `ModalRoot` (`[CITED: github.com/SteamDeckHomebrew/decky-frontend-lib]`, matched against `PlaylistPickerModal.tsx`)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new packages; 100% verified against `package.json`, `node_modules/@decky/ui`, and `py_modules/`
- Architecture: HIGH — every integration boundary, mock incompatibility, and lifecycle sequence traced directly in source files
- Pitfalls: HIGH — 7 concrete in-repo edge cases identified with exact file/line references and test impact

**Research date:** 2026-11-18
**Valid until:** 2026-12-18 (stable internal codebase & SteamOS PipeWire contracts)
