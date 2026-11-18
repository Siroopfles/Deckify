# Phase 19: Per-Game EQ & Volume Profiles - Context

**Gathered:** 2026-11-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can assign a custom 10-band PipeWire EQ preset (including a dedicated per-game 10-band custom curve) and target volume/ducking overrides to individual Steam and Non-Steam games in `SoundtracksTab.tsx`. On game launch, these overrides activate automatically as an ephemeral layer without overwriting persistent global settings on disk, and on game exit or crash recovery, the global audio baseline is cleanly restored while respecting any active Sleep Timer priority lock (`_sleep_locked`).

</domain>

<decisions>
## Implementation Decisions

### Per-Game EQ Selector & Custom Curve Scope
- **D-01 (Preset Dropdown + Dedicated Per-Game 10-Band EQ Modal):** Each expanded game card in `SoundtracksTab.tsx` exposes an **EQ Preset Override** `DropdownItem` (`Use Global` + the 7 presets: `flat`, `bass`, `vocal`, `gaming`, `deck_speakers`, `late_night`, `custom`). When `"custom"` is selected, an **"Edit Game EQ"** button appears next to the dropdown and opens a dedicated controller-navigable 10-band modal editor storing `eq_custom_bands` on that game's `SoundtrackProfile`. — **Reversibility:** costly — extends the `game_audio_profiles` schema (`eq_preset`, `eq_custom_bands`) across frontend types and backend sanitizer.
- **D-02 (Modal Seeding & Live `pw-cli` Preview):** When creating or opening a game's custom 10-band curve, initialize new curves from the user's current active/global curve (with a "Copy from Preset / Reset Flat" helper inside the modal). Dragging/stepping sliders in the modal sends live `pw-cli` audio previews while open, and restores the active EQ on modal close if that game is not currently running.
- **D-03 (`SettingsTab` Global Isolation & Override Badge):** While a per-game EQ override is actively running, `SettingsTab.tsx` displays an **"Active Game EQ Override"** badge in the Equalizer card. Edits made in `SettingsTab` update the persistent global `eq_preset` / `eq_custom_bands` baseline without breaking or overwriting the active game's ephemeral override (when no game override is active, `SettingsTab` updates live audio as normal).
- **D-04 (Live Hot-Apply in `SoundtracksTab`):** Changing the currently running game's EQ preset dropdown (including switching back to `Use Global`) or editing its custom 10-band curve in `SoundtracksTab.tsx` hot-applies immediately to `EqualizerManager`'s ephemeral override without requiring a game restart.

### Volume & Ducking Override Semantics
- **D-05 (100% Local PipeWire `VolumeFader` Overrides):** Remove Spotify Web API `PUT /v1/me/player/volume` calls (`self.plugin.set_volume`) from `SoundtrackManager` game launch/exit. Route all per-game volume and ducking overrides 100% locally through PipeWire `VolumeFader` sink-input scaling (`pactl set-sink-input-volume` with cosine easing), eliminating cloud API 429s, latency spikes, and double-attenuation. — **Reversibility:** costly — changes `SoundtrackManager._run_launch` / `_run_exit` and `VolumeFader` target calculation contract.
- **D-06 (Dual Per-Game Sliders: Volume Ceiling + Ducking Attenuation):** Each game card in `SoundtracksTab.tsx` exposes two separate sliders alongside the `Ducking Override` toggle:
  1. **Volume Override** (`0–100%` or `null`/Disabled) — sets the game's base volume ceiling relative to the global baseline.
  2. **Ducking Attenuation Override** (`0–95%` or `null`/Use Global) — sets the custom game-ducking attenuation percentage when `Ducking Override` is ON.
- **D-07 (Ceiling + Attenuation Interaction):** `VolumeFader` computes the effective in-game target from the game's `volume_override` ceiling (defaulting to global 100% baseline if `null`) scaled by the active ducking attenuation (`ducking_level_override` if set, otherwise global ducking setting) when `ducking_override` is ON (and dipping further for `voice` VAD if lower). If `ducking_override` is OFF, playback remains at the game's `volume_override` ceiling without game ducking.
- **D-08 (Live Mid-Game Fader & QAM Sync):** Adjusting the running game's `volume_override`, `ducking_override`, or `ducking_level_override` in `SoundtracksTab.tsx` immediately triggers a cosine-eased `VolumeFader` transition and emits `ducking_state_changed` so the Quick Access Menu displays the live `effective_volume`.

### Audio-Only Profiles & Launch Timing
- **D-09 (Independent of Linked Playlists):** Per-game EQ, volume, and ducking overrides always activate on game launch even when the game profile has `0` playlists linked (audio-only profile) or when music is already playing with `always_auto_start = False` (`soundtrack_prompt_switch` flow).
- **D-10 (Sequenced Post-Debounce Activation):** Per-game EQ and volume/ducking activation runs inside the post-launch-debounce lifecycle (`_run_launch`, after `soundtrack_launch_debounce` prevents Proton/launcher process flapping). Activation is sequenced atomically: apply ephemeral EQ preset first → invalidate `VolumeFader._cached_sink_input_id` → smoothly fade `VolumeFader` to the game's target level.
- **D-11 (Game Row Subtitle Summary):** Game row headers in `SoundtracksTab.tsx` summarize configured audio overrides inline in the subtitle (e.g., `"2 linked soundtracks • EQ: Gaming • Vol: 65% • Duck: 40%"` or `"Audio profile only • EQ: Bass Boost • Vol: 70%"` when 0 playlists are linked) so audio-only profiles are immediately identifiable when collapsed.
- **D-12 (Back-to-Back Game Switch Preservation):** If Game A exits and Game B launches before Game A's 3.0s exit debounce completes, preserve the original pre-game global baseline snapshot (`_pre_game_snapshot` / `active_game_override_snapshot`) rather than snapshotting Game A's ephemeral override. Transition directly from Game A's overrides to Game B's overrides (or back to the global baseline for any field where Game B uses `Use Global`).

### Exit Restoration, Crash Recovery & Sleep Lock
- **D-13 (Always Restore Global Audio Baseline on Exit):** Exiting a game always clears the ephemeral game audio override and restores the user's global EQ preset and `VolumeFader` baseline, regardless of whether `exit_policy` is `"restore_snapshot"`, `"pause"`, or `"keep_playing"` and regardless of manual in-game pauses.
- **D-14 (Boot Crash Recovery via `active_game_override_snapshot`):** Persist `active_game_override_snapshot` in `settings.json` whenever an ephemeral game audio override is active. On `Plugin._main()` startup, if a stale `active_game_override_snapshot` is found, clear it and restore the user's persistent global `eq_preset` / `eq_custom_bands` and un-ducked `VolumeFader` baseline (unless the frontend immediately reports that same `app_id` is still running).
- **D-15 (Sleep Timer `_sleep_locked` Priority):** On game exit, if `VolumeFader._sleep_locked` is `True`, strictly skip `VolumeFader` un-ducking and skip pre-game playback restoration (`play_tracks`), while still restoring global EQ and clearing `active_game_override_snapshot`.
- **D-16 (Exit Teardown Sequence):** On game exit, mirror the launch sequence in reverse: restore global EQ first (moving `librespot` / `spotify_client` cleanly to the hardware sink before tearing down `deckify_eq_sink` on `flat`), invalidate `VolumeFader._cached_sink_input_id`, and then smoothly fade `VolumeFader` back to the global baseline.

### the agent's Discretion
- Exact modal layout and button styling for the **Edit Game EQ** modal (reusing the 10-band vertical fader controls from `SettingsTab.tsx` with `flow-children="horizontal"` across bands).
- Exact ephemeral state representation inside `EqualizerManager` (e.g. `_ephemeral_preset`, `_ephemeral_bands`) and helper RPC signatures for live modal preview.
- Exact `active_game_override_snapshot` JSON structure in `py_modules/common.py` and `settings.json`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` — `GAME-01` acceptance criteria
- `.planning/ROADMAP.md` — Phase 19 goal, dependencies, and success criteria
- `.planning/research/PITFALLS.md` — Pitfall 3: Four-Way Audio Priority Collision (`GAME-01` vs `EqualizerManager` vs `VolumeFader` vs `SleepTimer`)

### Existing Audio & Soundtrack Implementation
- `py_modules/soundtrack.py` — `SoundtrackManager`, `_PROFILE_DEFAULTS`, `_sanitize_profile`, `handle_app_lifecycle`, `_run_launch`, `_run_exit`
- `py_modules/equalizer.py` — `EqualizerManager`, `EQ_PRESETS`, `apply_preset`, `set_bands`, `clamp_eq_bands`
- `py_modules/volume.py` — `VolumeFader`, `_compute_target_sink_volume`, `set_ducking`, `_sleep_locked`, `resolve_sink_input_id`
- `main.py` — `_main` startup sequence, `save_setting`, `handle_app_lifetime_event`, `trigger_ducking`, `set_eq_bands`

### Frontend UI & Types
- `src/components/tabs/SoundtracksTab.tsx` — Game card UI, profile persistence, `PlaylistPickerModal` pattern
- `src/components/tabs/soundtrackUtils.ts` — `defaultProfile`, `normalizeProfiles`, profile update helpers
- `src/components/tabs/SettingsTab.tsx` — Lines 500–675: 10-band EQ preset pills and vertical fader UI
- `src/types.ts` — `SoundtrackProfile`, `EqualizerPreset`, `EngineSettings`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `EqualizerManager` (`py_modules/equalizer.py`): Already isolates `pipewire -c` `filter-chain` DSP to Deckify's streams, supports `flat` true bypass, live `pw-cli` updates, and `clamp_eq_bands()`.
- `VolumeFader` (`py_modules/volume.py`): Already handles cosine-eased PipeWire sink-input fading, `"game"` / `"voice"` ducking reasons, and `_sleep_locked` priority protection.
- `SoundtrackManager` (`py_modules/soundtrack.py`): Already handles Steam/Non-Steam `app_id` validation, launch/exit debouncing, and `_pre_game_snapshot`.
- `SettingsTab.tsx` 10-band vertical fader widget (lines 550–673): Ready to extract or mirror into a reusable 10-band EQ modal editor for per-game custom curves.

### Established Patterns
- SteamOS GamepadUI spatial navigation requires `flow-children="horizontal"` on horizontal button/slider groups (`GEMINI.md`).
- All profile edits in `SoundtracksTab.tsx` use a `500ms` save debounce (`SAVE_DEBOUNCE_MS`) via `save_game_soundtrack_profile`.
- `resolve_spotify_sink_input_ids()` guarantees PipeWire volume and EQ routing never touch `steamwebhelper`, `Chromium`, or game audio.

### Integration Points
- `py_modules/soundtrack.py` ↔ `py_modules/equalizer.py`: Ephemeral EQ preset/custom bands activation on `_run_launch` and restoration on `_run_exit`.
- `py_modules/soundtrack.py` ↔ `py_modules/volume.py`: Passing active game `volume_override`, `ducking_override`, and `ducking_level_override` into `VolumeFader` instead of calling Spotify Web API `set_volume`.
- `main.py`: Boot-time `active_game_override_snapshot` recovery in `_main()`, plus live profile override refresh when `save_game_soundtrack_profile` updates the currently running game.
- `src/components/tabs/SoundtracksTab.tsx` & `SettingsTab.tsx`: Per-game EQ dropdown + custom 10-band modal, dual volume/ducking sliders, subtitle summary, and `SettingsTab` active override badge.

</code_context>

<specifics>
## Specific Ideas

- **Per-Game EQ Modal:** Reuse the compact 10-band vertical fader layout from `SettingsTab.tsx` inside a focus-trapped modal opened via `"Edit Game EQ"` when `Custom` is selected, with live audio preview and restore-on-close.
- **Audio-Only Profiles:** Users who want custom EQ or custom volume/ducking for a game without linking a Spotify playlist should see `"Audio profile only • ..."` in the game row subtitle and have their profile activate automatically on launch.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed strictly within Phase 19 scope (`GAME-01`).

</deferred>

---

*Phase: 19-per-game-eq-volume-profiles*
*Context gathered: 2026-11-18*
