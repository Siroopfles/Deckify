# Phase 15: Real PipeWire Biquad Equalizer - Context

**Gathered:** 2026-11-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver real-time PipeWire `filter-chain` biquad DSP equalization isolated to Deckify's audio stream (`librespot`, `com.spotify.client`, `deckify_eq_out`) via a managed `pipewire -c` child process (never restarting system `pipewire` or disrupting game/Steam UI audio), with `Flat` true bypass, 5 sound presets, and always-visible 10-band ISO `SliderField` controls in `SettingsTab.tsx` with live `pw-cli` updates and persistence across restarts.

</domain>

<decisions>
## Implementation Decisions

### 10-Band EQ UI & Preset Behavior
- **D-01:** Use a **10-band ISO graphic EQ** (`31Hz, 62Hz, 125Hz, 250Hz, 500Hz, 1kHz, 2kHz, 4kHz, 8kHz, 16kHz`) with `±12 dB` range in `0.5 dB` steps.
- **D-02:** Always show the 10 `SliderField` bands below the preset pills in `SettingsTab.tsx`. Clicking a preset snaps the 10 sliders to that preset's curve; adjusting any slider automatically forks the curve into `"custom"` (`eq_preset = "custom"`).
- **D-03:** Expand from 3 sound presets (`bass`, `vocal`, `gaming`) to **5 sound presets** (plus `flat` bypass and `custom` — 7 pills total, arranged cleanly in controller-navigable horizontal rows). **Research (`gsd-phase-researcher`) must propose and design the 2 additional presets** and their 10-band gain curves.

### Bypass, Sink Routing & Stream Isolation
- **D-04:** Selecting `flat` performs a **true bypass** — tear down the `pipewire -c` `filter-chain` process and route `librespot` directly to the hardware sink for zero DSP/CPU overhead.
- **D-05:** When EQ is active (non-`flat`) and the user switches the PipeWire output sink in `SettingsTab` (`set_audio_sink`), keep `librespot` routed into `deckify_eq_sink` and move `effect_output.deckify_eq` to the newly selected sink. Never restart system `pipewire` or affect `steamwebhelper`, `Chromium`, or game audio streams.

### Preamp & Clipping Protection
- **D-06:** Apply **automatic negative preamp headroom** (`-max(0, max_band_gain)`) whenever any band is boosted above `0 dB` so boosting bass or treble never clips hot Spotify masters.

### Live Slider Responsiveness & QAM
- **D-07:** Throttle live `pw-cli set-param` updates to `~75ms` during continuous slider movement for real-time sweep feedback without subprocess spam, and debounce `settings.json` persistence (`eq_preset` and 10-band custom gains).
- **D-08:** Keep the Quick Access Menu (QAM) compact without EQ controls or preset badges (consistent with Phase 10 and Phase 14); all EQ controls live in `SettingsTab.tsx`.

### the agent's Discretion
- Exact PipeWire `filter-chain` config generation (`bq_lowshelf`, `bq_peaking`, `bq_highshelf` Q-factors and `pw-dump` node/port discovery) in `py_modules/equalizer.py`.
- Exact layout of the 7 preset pills (`Flat` + 5 presets + `Custom`) in `SettingsTab.tsx` (e.g., two `flow-children="horizontal"` rows) for clean SteamOS GamepadUI D-pad navigation.
- Graceful fallback to direct hardware sink routing if `pipewire -c` fails to start or exits unexpectedly.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & Requirements
- `.planning/REQUIREMENTS.md` — `EQ-01` and `EQ-02` acceptance requirements (note: `D-01` expands the custom slider UI from 5-band to 10-band ISO and `D-03` expands sound presets from 3 to 5)
- `.planning/ROADMAP.md` — Phase 15 goal and success criteria
- `.planning/PROJECT.md` — Core constraints (SteamOS GamepadUI `flow-children`, PipeWire sink-input isolation)

### Research & Architecture
- `.planning/research/SUMMARY.md` — v0.6 research synthesis and `EqualizerManager` architecture
- `.planning/research/PITFALLS.md` — PipeWire `filter-chain` pitfalls (`priority.session = 0`, no system `pipewire` restart, `pw-cli` throttling, preamp clipping)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/tabs/SettingsTab.tsx`: Existing "Equalizer & Audio Presets" card (`Flat`, `Bass Boost`, `Vocal Clarity`, `Gaming Balance` pills calling `backendSetSetting("eq_preset", eq.id)`).
- `py_modules/volume.py`: `apply_equalizer_preset(plugin, preset)` stub persisting `eq_preset` and emitting `eq_preset_changed`.
- `py_modules/engine.py` & `py_modules/volume.py`: `resolve_spotify_sink_input_ids()` already includes `deckify_eq_out` in `_SPOTIFY_SINK_ALLOWLIST` and excludes `steamwebhelper` / `Chromium`.
- `py_modules/common.py`: `DEFAULT_SETTINGS` (`eq_preset: "flat"`) and `_build_deck_command` for running `pipewire -c` / `pw-cli` / `pw-dump` under UID 1000 (`deck`).

### Established Patterns
- SteamOS GamepadUI spatial navigation requires `flow-children="horizontal"` on horizontal pill rows (`GEMINI.md`).
- Subprocesses must strip `LD_LIBRARY_PATH` via `_build_deck_command`.
- QAM stays compact; detailed sliders live in `SettingsTab.tsx` (Phase 10 & Phase 14).

### Integration Points
- `main.py` ↔ `py_modules/equalizer.py` (new `EqualizerManager` lifecycle, preset/band RPCs, sink switching coordination)
- `py_modules/engine.py` ↔ `py_modules/equalizer.py` (routing `librespot` into `deckify_eq_sink` when EQ active, and moving `effect_output.deckify_eq` on `set_audio_sink`)
- `src/components/tabs/SettingsTab.tsx` ↔ `main.py` (`set_setting` / EQ band RPCs and `eq_preset_changed` event)

</code_context>

<specifics>
## Specific Ideas

- **10-band ISO frequencies:** `31Hz, 62Hz, 125Hz, 250Hz, 500Hz, 1kHz, 2kHz, 4kHz, 8kHz, 16kHz` (`±12 dB`, `0.5 dB` step).
- **2 additional presets for Research:** Currently there are 3 sound presets (`Bass Boost`, `Vocal Clarity`, `Gaming Balance`) besides `Flat` and `Custom`. Research should propose 2 well-chosen additional presets (e.g., for Steam Deck speakers / headphones / late-night / treble clarity / rock-electronic) with 10-band curves.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 15-real-pipewire-biquad-equalizer*
*Context gathered: 2026-11-16*
