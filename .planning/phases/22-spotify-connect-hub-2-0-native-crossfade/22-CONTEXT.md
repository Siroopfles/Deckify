# Phase 22: Spotify Connect Hub 2.0 & Native Crossfade - Context

**Gathered:** 2026-11-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can inspect active playback engines (`librespot`, `spotifyd`, `Spotify Client`) and device type icons in `DevicesTab`, wake the local Deckify engine and pull playback from any external Spotify Connect device with a single *"Pull Playback to Steam Deck"* action, adjust remote Spotify Connect device volume via a debounced slider (`CONNECT-01`), and configure native track Crossfade (`0–12s`) in `SettingsTab` synchronized across Official Spotify Client CDP preferences, `librespot` / `spotifyd` engine config, and local playback transitions (`RADIO-02`).

</domain>

<decisions>
## Implementation Decisions

### DevicesTab Hub Layout & Engine Badges (`CONNECT-01`)
- **D-01 (Device Type Icons):** Display distinct `react-icons` icons per Spotify Connect device type (`Computer`, `Smartphone`, `Speaker`, `TV`, and a dedicated Steam Deck / Handheld icon for the local Deckify device) on the left of each device row.
- **D-02 (Engine Badges & Local Identity):** Show an inline engine pill badge (`librespot`, `spotifyd`, or `Spotify Client`) on the local Steam Deck device row, matching the local device by configured `device_name` (default `"Deckify"`) and/or active engine metadata returned by `get_devices`, and highlight/pin the local Steam Deck status card at the top of `DevicesTab` alongside a manual Refresh button.

### 1-Click "Pull Playback to Steam Deck" & Remote Volume (`CONNECT-01`)
- **D-03 (Auto-Waking Pull Playback Action):** Render a prominent 1-click *"Pull Playback to Steam Deck"* button in `DevicesTab` whenever playback is active on an external Connect device or the local engine is stopped/sleeping. Clicking it wakes the local engine (`PowerGovernor.wake_for_playback()` / `start_engine()`), polls `get_devices` until the local Steam Deck device registers on Spotify Connect, and transfers active playback (`transfer_playback(..., play=True)`) automatically.
- **D-04 (Debounced Remote Volume Slider):** Render a `300ms`-debounced `SliderField` (`0–100%`) in `DevicesTab` for the active or selected Spotify Connect device when `volume_percent !== null` and volume control is not restricted, backed by a dedicated `set_device_volume(device_id, volume_percent)` RPC calling Spotify Web API `PUT /v1/me/player/volume` so remote Connect devices can be adjusted without interfering with local PipeWire ducking.

### Native Crossfade Configuration & Engine Sync (`RADIO-02`)
- **D-05 (Crossfade Setting & UI):** Add a `Crossfade` `SliderField` (`0–12s` in `1s` steps, `0s = Off`) inside `SettingsTab` Playback Settings, persisted via `crossfade_seconds` in `py_modules/common.py` and `src/types.ts` (removing `crossfade_seconds` from the obsolete-keys cleanup list in `common.py`).
- **D-06 (3-Path Crossfade Sync):** Synchronize `crossfade_seconds` across engines:
  1. **Official Spotify Client (CDP):** When `spotify_client` is active on CDP port `9229`, update Spotify's native crossfade preference (`audio.crossfade` / `audio.crossfade_time`) via CDP.
  2. **Headless Engines (`librespot` / `spotifyd`):** Apply supported engine configuration flags/options on start or setting change when supported by the active engine binary.
  3. **Local Transition Fallback:** When `librespot` native crossfade is unavailable in the bundled binary, provide smooth local PipeWire fade-out/fade-in transitions via `VolumeFader` around track boundaries without affecting `_sleep_locked` or per-game ducking overrides.

### Error Handling & Empty States (`CONNECT-01`, `RADIO-02`)
- **D-07 (Empty State & Fixed-Volume Devices):** When `get_devices` returns no devices, show an inline empty-state card with *"Wake Local Engine"* and *"Refresh"* actions. For devices with `volume_percent === null` or restricted volume, display a *"Fixed Volume"* badge instead of an interactive slider. Surface failed transfers or volume calls via `showToast` without crashing.

### the agent's Discretion
- Exact `react-icons` icon mapping for Spotify Connect device types (`AVR`, `STB`, `CastVideo`, `CastAudio`, `GameConsole`, etc.).
- Exact polling interval/retry count when waiting for a newly woken local engine to appear in `get_devices` during *"Pull Playback to Steam Deck"*.
- Exact CDP preference evaluation script and `VolumeFader` boundary-fade timing details for `RADIO-02` fallback.

### Folded Todos
- **Investigate Decky Loader breakage after Steam update** (`.planning/todos/pending/2026-11-21-investigate-decky-loader-breakage-after-steam-update.md`, score `0.6`) — Auto-folded per `--auto` relevance threshold (`>= 0.4`). Note: This is an operational Steam Deck environment check (`systemctl --user status plugin_loader` / Decky Loader update after SteamOS update) rather than a code feature; verify Decky Loader runtime compatibility during deployment/UAT if testing on hardware.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

- `.planning/REQUIREMENTS.md` — `CONNECT-01`, `RADIO-02`
- `.planning/ROADMAP.md` — Phase 22 goal and success criteria
- `src/components/tabs/DevicesTab.tsx` — Existing Connect device list UI
- `src/components/tabs/SettingsTab.tsx` — Playback Settings section for Crossfade slider
- `src/types.ts` & `py_modules/common.py` — `SpotifyDevice`, `EngineSettings`, `default_settings` (note `crossfade_seconds` in obsolete-keys list at `py_modules/common.py:330`)
- `py_modules/rpc_playback.py` — `get_devices`, `transfer_playback`, `quick_play_pinned` auto-wake pattern
- `py_modules/engine.py` — `librespot` / `spotifyd` / `spotify_client` lifecycle and CDP port `9229` integration
- `py_modules/eco.py` — `PowerGovernor.wake_for_playback()`
- `py_modules/volume.py` — Local PipeWire `VolumeFader` for transition fallback and `_sleep_locked` / ducking priority rules

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `py_modules/rpc_playback.py` (`get_devices`, `transfer_playback`, `quick_play_pinned`) — Already implements engine auto-wake + `get_devices` polling loop (`4 x 0.3s`) + playback transfer.
- `py_modules/eco.py` (`PowerGovernor.wake_for_playback`) — Transparently wakes Eco-sleeping engines.
- `src/components/common/InteractiveRow.tsx` — GamepadUI-compatible row primitive using `--deckify-accent` CSS custom properties.
- `py_modules/volume.py` (`VolumeFader`) — Local PipeWire fader with cosine easing and priority locking.

### Established Patterns
- All RPC methods on `Plugin` in `main.py` wrap external calls in `try/except` and return `{ "ok": bool, ... }`.
- Settings persist atomically via `py_modules/common.py` (`set_setting` RPC) with `copy.deepcopy(default_settings)`.
- Debounced sliders (`300–500ms`) prevent Spotify Web API HTTP 429 rate limits and rapid backend churn.

### Integration Points
- `DevicesTab.tsx` + `main.py` / `py_modules/rpc_playback.py` (`get_devices` engine metadata enrichment, `pull_playback_to_deck` or enhanced `transfer_playback`, `set_device_volume`).
- `SettingsTab.tsx` + `py_modules/common.py` + `py_modules/engine.py` (`crossfade_seconds` persistence and multi-engine sync).

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within Phase 22 scope.

</deferred>

---

*Phase: 22-spotify-connect-hub-2-0-native-crossfade*
*Context gathered: 2026-11-22*
