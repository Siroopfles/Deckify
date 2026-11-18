# Phase 14: Gentle Sleep Timer Fade-Out - Context

**Gathered:** 2026-11-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Add gentle fade-out to Deckify's backend sleep timer (`py_modules/system.py`) using `VolumeFader` (`py_modules/volume.py`) under a `"sleep"` priority lock, pausing playback when volume reaches 0%, waiting for audio drain before restoring baseline volume (including before `shutdown_on_finish` poweroff or on mid-fade cancellation), and exposing fade-out configuration in `SettingsTab.tsx`.

</domain>

<decisions>
## Implementation Decisions

### Fade-out Timing & End-of-Track
- **D-01:** For timed sleep timers with fade-out enabled, begin fading early at `T - fade_duration` so playback reaches 0% and pauses right when the timer hits `T` (`_sleep_timer_end`). (If total remaining duration is shorter than `fade_duration`, begin fading immediately.)
- **D-02:** "End of Track" mode (`end_of_track=True`) pauses playback immediately when the track finishes without fading out, preserving the full track outro.

### Fade-out Settings UI
- **D-03:** Expose sleep timer fade-out configuration inside `SettingsTab`'s existing Backend Sleep Timer card using a Toggle (enable/disable fade-out) + `SliderField` (`5s–120s`, step `5s`, default `30s`), persisted in `settings.json` (`sleep_timer_fade_enabled`, `sleep_timer_fade_duration`). Keep QAM compact without adding sleep timer fade controls there.

### Priority Lock & Ducking Interaction
- **D-04:** When the user cancels or resets the sleep timer mid-fade, abort the sleep fade-out and perform a short `0.5s` fade back to the active target volume (respecting any active `"game"` or `"voice"` ducking reasons, or full baseline if none).

### the agent's Discretion
- **Sleep lock & ducking state machine:** Safest approach for `VolumeFader` while `"sleep"` priority lock is held — track incoming `"game"` / `"voice"` add/remove updates in `_duck_reasons` silently without interrupting the sleep fade-out, so mid-fade cancel or post-sleep recovery reflects current ducking state.
- **Audio drain & fading status UI:** Exact drain delay between `control_playback("pause")` and restoring baseline volume (e.g., ~1.0s–1.5s), and exposing `fading: boolean` on `SleepTimerStatus` so `SettingsTab` can display `"Fading out..."` during the fade window.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & Requirements
- `.planning/REQUIREMENTS.md` — `SLEEP-01` acceptance requirement
- `.planning/ROADMAP.md` — Phase 14 goal and success criteria
- `.planning/PROJECT.md` — Core constraints (SteamOS GamepadUI, PipeWire sink-input isolation)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `py_modules/system.py`: `get_sleep_timer_status`, `set_sleep_timer`, `sleep_timer_worker`, `shutdown_system`
- `py_modules/volume.py`: `VolumeFader` (`fade_to`, `_execute_fade`, `set_ducking`, `_duck_reasons`, `resolve_sink_input_id`, `_apply_sink_volume`)
- `src/components/tabs/SettingsTab.tsx`: Backend Sleep Timer card (`15m`/`30m`/`45m`/`60m`, `End of Track`, `Off`, `Power off Steam Deck when timer finishes`)
- `src/types.ts`: `SleepTimerStatus` interface

### Established Patterns
- `VolumeFader` uses 50ms cosine easing slices via `pactl set-sink-input-volume` on `resolve_spotify_sink_input_ids()` (Phase 06 & Phase 13).
- `SettingsTab` uses `@decky/ui` `SliderField` / `ToggleField` or `InteractiveRow` and persists settings via backend RPC to `settings.json`.
- QAM remains compact without extra sliders (Phase 10).

### Integration Points
- `py_modules/system.py` ↔ `py_modules/volume.py`: `sleep_timer_worker` acquires/releases `"sleep"` lock on `plugin._volume_fader`, triggers fade-to-zero, pauses, drains, and restores baseline.
- `py_modules/settings.py` / `main.py` ↔ `src/components/tabs/SettingsTab.tsx`: Persists `sleep_timer_fade_enabled` and `sleep_timer_fade_duration`.

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches within the locked decisions above.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 14-gentle-sleep-timer-fade-out*
*Context gathered: 2026-11-16*
