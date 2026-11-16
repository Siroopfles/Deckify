# Phase 15: Real PipeWire Biquad Equalizer - Research

**Researched:** 2026-11-16
**Domain:** PipeWire `libpipewire-module-filter-chain` DSP, `pw-cli` / `pw-dump` / `pactl` Runtime Control, SteamOS GamepadUI 10-Band EQ UI
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Use a **10-band ISO graphic EQ** (`31Hz, 62Hz, 125Hz, 250Hz, 500Hz, 1kHz, 2kHz, 4kHz, 8kHz, 16kHz`) with `±12 dB` range in `0.5 dB` steps.
- **D-02:** Always show the 10 `SliderField` bands below the preset pills in `SettingsTab.tsx`. Clicking a preset snaps the 10 sliders to that preset's curve; adjusting any slider automatically forks the curve into `"custom"` (`eq_preset = "custom"`).
- **D-03:** Expand from 3 sound presets (`bass`, `vocal`, `gaming`) to **5 sound presets** (plus `flat` bypass and `custom` — 7 pills total, arranged cleanly in controller-navigable horizontal rows). **Research (`gsd-phase-researcher`) must propose and design the 2 additional presets** and their 10-band gain curves.
- **D-04:** Selecting `flat` performs a **true bypass** — tear down the `pipewire -c` `filter-chain` process and route `librespot` directly to the hardware sink for zero DSP/CPU overhead.
- **D-05:** When EQ is active (non-`flat`) and the user switches the PipeWire output sink in `SettingsTab` (`set_audio_sink`), keep `librespot` routed into `deckify_eq_sink` and move `effect_output.deckify_eq` to the newly selected sink. Never restart system `pipewire` or affect `steamwebhelper`, `Chromium`, or game audio streams.
- **D-06:** Apply **automatic negative preamp headroom** (`-max(0, max_band_gain)`) whenever any band is boosted above `0 dB` so boosting bass or treble never clips hot Spotify masters.
- **D-07:** Throttle live `pw-cli set-param` updates to `~75ms` during continuous slider movement for real-time sweep feedback without subprocess spam, and debounce `settings.json` persistence (`eq_preset` and 10-band custom gains).
- **D-08:** Keep the Quick Access Menu (QAM) compact without EQ controls or preset badges (consistent with Phase 10 and Phase 14); all EQ controls live in `SettingsTab.tsx`.

### the agent's Discretion
- Exact PipeWire `filter-chain` config generation (`bq_lowshelf`, `bq_peaking`, `bq_highshelf` Q-factors and `pw-dump` node/port discovery) in `py_modules/equalizer.py`.
- Exact layout of the 7 preset pills (`Flat` + 5 presets + `Custom`) in `SettingsTab.tsx` (e.g., two `flow-children="horizontal"` rows) for clean SteamOS GamepadUI D-pad navigation.
- Graceful fallback to direct hardware sink routing if `pipewire -c` fails to start or exits unexpectedly.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EQ-01 | User can apply real-time PipeWire `filter-chain` biquad DSP equalization (`flat` bypass, `bass`, `vocal`, `gaming` presets — expanded by D-03 to 5 sound presets + `flat` + `custom`) isolated to the Deckify audio stream without restarting system `pipewire` or affecting game audio. | `EqualizerManager` in `py_modules/equalizer.py` spawns `pipewire -c <eq.conf>` as UID 1000 via `_build_deck_command`, sets `priority.session = 0` / `priority.driver = 0` so WirePlumber never makes it `@DEFAULT_SINK@`, routes only `resolve_spotify_sink_input_ids()` into `deckify_eq_sink`, and tears down on `flat` (D-04). |
| EQ-02 | User can fine-tune a custom 5-band EQ curve (expanded by D-01 to 10-band ISO: `31Hz`–`16kHz`, `±12 dB`, `0.5 dB` steps) via `SliderField` controls in `SettingsTab` with live `pw-cli set-param` updates and persistence across restarts. | `SettingsTab.tsx` renders 7 preset pills in two `flow-children="horizontal"` rows and 10 `SliderField` bands below them; `EqualizerManager` discovers the `deckify_eq_sink` node ID via `pw-dump`, throttles `pw-cli set-param` to `~75ms` (D-07), applies `-max(0, max_band_gain)` preamp headroom (D-06), and debounces `settings.json` saves. |
</phase_requirements>

## Project Constraints (from GEMINI.md)

- **SteamOS GamepadUI Spatial Navigation:** Containers with horizontal pills MUST use `<Focusable flow-children="horizontal">` — never `flow-children="row"`, which causes vertical focus jumps.
- **Steam Deck UID 1000 & `LD_LIBRARY_PATH` Isolation:** Plugin runs as `root` (UID 0) under Decky Loader; all PipeWire commands (`pipewire -c`, `pw-cli`, `pw-dump`, `pactl`) MUST execute via `_build_deck_command()` (`py_modules/common.py:334-354`) under `deck` (UID 1000) with `XDG_RUNTIME_DIR`, `DBUS_SESSION_BUS_ADDRESS`, `PULSE_SERVER`, and `HOME` set, and `LD_LIBRARY_PATH` stripped.
- **PipeWire UI Stream Isolation:** Sink-input inspection/routing MUST exclude `steamwebhelper` and `application.name == "Chromium"` (already implemented in `resolve_spotify_sink_input_ids()` at `py_modules/engine.py:133-195`).
- **No Duplicate Module Trees:** Never place duplicate Python modules under `bin/`.
- **RPC Resilience:** All RPC methods must wrap external subprocess/network calls in `try/except`, return structured `{ "ok": bool, ... }` / `{ "success": bool, ... }` dicts, and never crash the main event loop.
- **Frontend Styling & Notifications:** 2-space indentation, semicolons, ESLint 10 clean, `tsc --noEmit` clean, errors surfaced via Decky `toaster.toast` / `showToast`.

## Summary

Phase 15 replaces Deckify's stubbed `apply_equalizer_preset()` (`py_modules/volume.py:97-102`) and 4-pill UI (`src/components/tabs/SettingsTab.tsx:328-351`) with a real, stream-isolated 10-band PipeWire `filter-chain` equalizer (`py_modules/equalizer.py`). Rather than writing to `~/.config/pipewire/pipewire.conf.d/` or restarting `pipewire.service` (which severs active game audio and `steamwebhelper` UI sounds), `EqualizerManager` generates a self-contained PipeWire client configuration (`~/.config/deckify/eq-filter-chain.conf`) and launches `pipewire -c <conf>` as a managed child process under UID 1000 (`deck`) via `_build_deck_command()`.

The filter graph chains an automatic negative-preamp `linear` gain stage (`Mult = 10 ** (preamp_db / 20)`) into 10 stereo-replicated biquad nodes (`bq_lowshelf` at 31Hz, `bq_peaking` Q=1.41 at 62Hz–8kHz, `bq_highshelf` at 16kHz). When `eq_preset == "flat"` (D-04), the child process is terminated and `librespot` routes directly to the hardware sink with zero DSP overhead. When any non-`flat` preset or `"custom"` is active, `librespot` routes into `deckify_eq_sink` (`capture.props.node.name`) while `effect_output.deckify_eq` (`playback.props.node.name`) routes to the active hardware sink. Live slider drags in `SettingsTab.tsx` coalesce into `~75ms` throttled `pw-cli set-param <node_id> Props '{ params = [ ... ] }'` updates (D-07) and debounced `settings.json` writes.

**Primary recommendation:** Implement `EqualizerManager` in `py_modules/equalizer.py` using a managed `pipewire -c` client process, `linear` preamp + 10 biquad bands, `pw-dump` node ID discovery, `~75ms` coalesced `pw-cli set-param` updates, and strict `resolve_spotify_sink_input_ids()` stream isolation.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Preset & 10-band slider UI, local optimistic drag state | Browser / Client (`SettingsTab.tsx`) | — | Immediate controller slider feedback; forks to `"custom"` on slider change (D-02) |
| Slider update throttling (~75ms) & `settings.json` debounce | API / Backend (`EqualizerManager` + `main.py`) | Browser / Client (optional UI throttle) | Prevents `pw-cli` subprocess spam and disk thrashing even on rapid controller holds (D-07) |
| `pipewire -c` filter-chain lifecycle & crash recovery | API / Backend (`py_modules/equalizer.py`) | OS Audio (`PipeWire` daemon) | Supervises isolated child process, falls back to hardware sink on crash |
| Stream routing (`librespot` → EQ → hardware sink) | API / Backend (`engine.py` + `volume.py` + `equalizer.py`) | OS Audio (`pactl` / `PipeWire`) | Enforces `steamwebhelper`/`Chromium` exclusion and coordinates `set_audio_sink` (D-05) |
| Settings persistence (`eq_preset`, `eq_custom_bands`) | Database / Storage (`~/.config/deckify/settings.json`) | API / Backend (`common.py`) | Atomic `_save_settings` / `_load_settings` validation across restarts |

## Standard Stack

### Core
| Library / Tool | Version | Purpose | Why Standard |
|----------------|---------|---------|--------------|
| `pipewire` (`pipewire -c`) | SteamOS 3.5+ built-in | Runs isolated `libpipewire-module-filter-chain` client process | Zero new dependencies; avoids restarting system `pipewire.service` [CITED: docs.pipewire.org] |
| `pw-cli` & `pw-dump` | SteamOS 3.5+ built-in | Discovers `deckify_eq_sink` node ID and applies live `set-param` DSP updates | Official PipeWire CLI tools; updates biquad gains without audio dropouts [CITED: docs.pipewire.org] |
| `pactl` | SteamOS 3.5+ built-in | Routes `librespot` → `deckify_eq_sink` and `effect_output.deckify_eq` → hardware sink | Already used by `py_modules/engine.py` and `py_modules/volume.py` [VERIFIED: py_modules/engine.py:204-222] |
| `@decky/ui` (`SliderField`, `Focusable`) | `^4.11.1` | 10-band EQ sliders and controller-navigable horizontal preset rows | Official SteamOS GamepadUI components [VERIFIED: package.json:29] |

### Supporting
| Library / Tool | Version | Purpose | When to Use |
|----------------|---------|---------|-------------|
| `@decky/api` (`callable`, `addEventListener`) | `^1.1.3` | Typed RPCs (`set_eq_bands`, `set_setting`) and `eq_preset_changed` events | Frontend ↔ Python backend communication [VERIFIED: package.json:46] |
| `py_modules/common.py` (`_build_deck_command`, `_exec`) | In-repo | Runs PipeWire/PulseAudio commands as `deck` (UID 1000) without `LD_LIBRARY_PATH` | Every subprocess call in `py_modules/equalizer.py` [VERIFIED: py_modules/common.py:334-354] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Managed `pipewire -c` child process | `~/.config/pipewire/pipewire.conf.d/*.conf` + `systemctl --user restart pipewire` | Restarts system PipeWire, severing active game audio and `steamwebhelper` UI sounds (forbidden by D-05 / `REQUIREMENTS.md` Out of Scope) |
| Built-in `bq_lowshelf`/`bq_peaking`/`bq_highshelf` | LADSPA/LV2 plugins (`lsp-plugins`, `calf`) | Not preinstalled on immutable SteamOS 3.5+ |
| `pw-cli set-param` live updates | Rewriting `.conf` and restarting `pipewire -c` per slider tick | Causes audible dropouts/clicks on every slider movement |

**Installation:** None — zero new npm or Python packages required.

## Package Legitimacy Audit

> **Not applicable:** Phase 15 installs **zero** external npm, PyPI, or crates packages. All functionality uses SteamOS built-in PipeWire/PulseAudio binaries and existing project dependencies (`@decky/ui`, `@decky/api`, `react-icons`).

## Architecture Patterns

### System Architecture Diagram

```text
  SettingsTab.tsx (GamepadUI)
    │  ├── Click preset pill ──► set_setting("eq_preset", preset)
    │  └── Drag 10-band slider ─► local optimistic state + set_eq_bands(bands[10])
    ▼
  main.py (Decky RPC Router)
    │  ├── Validates preset ∈ {flat,bass,vocal,gaming,deck_speakers,late_night,custom}
    │  ├── Clamps 10 floats ∈ [-12.0, +12.0] (0.5 dB step)
    │  └── Delegates to EqualizerManager
    ▼
  py_modules/equalizer.py (EqualizerManager)
    │  ├── preset == "flat" ──► Stop `pipewire -c`, move `librespot` → hardware sink (D-04)
    │  └── preset != "flat" ──► Ensure `pipewire -c eq-filter-chain.conf` running (UID 1000)
    │         │
    │         ├── Cold start: wait for `deckify_eq_sink` in `pactl` / `pw-dump`,
    │         │               move `librespot` → `deckify_eq_sink`,
    │         │               move `effect_output.deckify_eq` → target hardware sink
    │         │
    │         └── Live update (~75ms coalesced):
    │               compute preamp = -max(0, max(bands)),
    │               `pw-cli set-param <node_id> Props '{ params = [ ... ] }'`
    │               + debounced `_save_settings` (500ms)
    ▼
  SteamOS PipeWire Graph (UID 1000)
    ├── [librespot] ──► [deckify_eq_sink] ──► (preamp -> 10 biquads) ──► [effect_output.deckify_eq] ──► [Hardware Sink]
    └── [steamwebhelper / Games] ────────────────────────────────────────────────────────────────────► [Hardware Sink] (UNTOUCHED)
```

### Recommended Project Structure

```text
py_modules/
├── equalizer.py        # NEW: EqualizerManager, presets, filter-chain conf generator, pw-dump/pw-cli helpers
├── common.py           # UPDATE: DEFAULT_SETTINGS (eq_custom_bands), _load_settings preset allowlist
├── engine.py           # UPDATE: resolve_spotify_sink_input_ids / move helpers for EQ vs hardware sink
├── volume.py           # UPDATE: apply_equalizer_preset & set_audio_sink EQ-aware routing (D-05)
└── __init__.py         # UPDATE: export equalizer symbols if needed
main.py                 # UPDATE: EqualizerManager init/unload, set_eq_bands RPC, set_setting eq_preset validation
src/
├── types.ts            # UPDATE: EqualizerPreset union (7 values), eq_custom_bands?: number[]
└── components/tabs/
    └── SettingsTab.tsx # UPDATE: 7 preset pills (2 horizontal rows) + 10 ISO SliderField controls
tests/
└── test_equalizer.py   # NEW: Unit tests for presets, preamp math, conf gen, pw-dump parsing, throttling, sink routing
```

### Pattern 1: Isolated `pipewire -c` Client with `linear` Preamp & 10 Biquads

Generate `~/.config/deckify/eq-filter-chain.conf` using `libpipewire-module-filter-chain` inside a client PipeWire context (`context.spa-libs` + `libpipewire-module-protocol-native` + `libpipewire-module-client-node` + `libpipewire-module-adapter` + `libpipewire-module-filter-chain`) [CITED: docs.pipewire.org].

Key properties:
- **Never become default sink:** In `capture.props`, set `node.name = "deckify_eq_sink"`, `media.class = "Audio/Sink"`, `priority.session = 0`, `priority.driver = 0`, `node.pause-on-idle = true`.
- **Playback output node:** In `playback.props`, set `node.name = "effect_output.deckify_eq"`, `node.passive = true`, and optionally `target.object = "<hardware_sink>"` if a specific sink is selected. Note that `_SPOTIFY_SINK_ALLOWLIST` in `py_modules/engine.py:130` **already** contains `"deckify_eq_out"` (`_SPOTIFY_SINK_ALLOWLIST = ("librespot", "spotify", "com.spotify.client", "deckify_eq_out")`) — adding `"effect_output.deckify_eq"` to `_SPOTIFY_SINK_ALLOWLIST` (or setting `media.name = "deckify_eq_out"` on `playback.props`) ensures `resolve_spotify_sink_input_ids()` matches it cleanly!
- **Stereo replication:** Setting `audio.channels = 2` and `audio.position = [ FL FR ]` causes PipeWire `filter-chain` to automatically duplicate the single-channel `filter.graph` across `FL` and `FR` [CITED: docs.pipewire.org].
- **Preamp node (`D-06`):** First node `eq_preamp` (`type = builtin`, `label = linear`, `control = { "Mult" = <10^(preamp_db/20)> "Add" = 0.0 }`) [CITED: docs.pipewire.org]. Because `preamp_db = -max(0.0, max(bands))`, `Mult` is always in `(0.0, 1.0]`, guaranteeing zero digital clipping on hot Spotify masters.
- **10 ISO Biquad nodes (`D-01`):**
  - `eq_band_0`: `bq_lowshelf`, `Freq = 31.0`, `Q = 0.707`
  - `eq_band_1`..`eq_band_8`: `bq_peaking`, `Freq = 62.0, 125.0, 250.0, 500.0, 1000.0, 2000.0, 4000.0, 8000.0`, `Q = 1.414` (1-octave bandwidth)
  - `eq_band_9`: `bq_highshelf`, `Freq = 16000.0`, `Q = 0.707`

### Pattern 2: `pw-dump` Node Discovery + `~75ms` Throttled `pw-cli set-param` (`D-07`)

1. **Node ID discovery:** Run `pw-dump` via `_build_deck_command(["pw-dump"])`, parse JSON, find the object where `obj.get("type") == "PipeWire:Interface:Node"` and `obj.get("info", {}).get("props", {}).get("node.name") == "deckify_eq_sink"` (or the `filter-chain` capture node ID that exposes `Props` params). Cache `node_id: int` while the `pipewire -c` child PID is unchanged; invalidate on process restart.
2. **Coalesced `~75ms` throttle:** When `set_bands(bands)` is called rapidly during slider movement:
   - Store latest `self._pending_bands = clamped_bands`.
   - If a flush task is not already scheduled, schedule one after `0.075` seconds (`75ms`).
   - When the timer fires, snapshot `self._pending_bands`, compute `preamp_mult`, and run **one** `pw-cli set-param <node_id> Props '{ params = [ "eq_preamp:Mult" <mult> "eq_band_0:Gain" <g0> ... "eq_band_9:Gain" <g9> ] }'` subprocess.
   - Separately debounce `_save_settings` by `500ms` so `settings.json` isn't rewritten on every 75ms tick.

### Pattern 3: Bypass, Sink Switching & `librespot` Coordination (`D-04`, `D-05`)

- **On `flat` (`D-04`):** Terminate `pipewire -c` (`SIGTERM`, wait 1s, `SIGKILL` fallback), then move `librespot` sink-input(s) (excluding `effect_output.deckify_eq` / `deckify_eq_out`) to the active hardware sink (or `@DEFAULT_SINK@`).
- **On `set_audio_sink(sink_name)` (`D-05`):**
  - If EQ is inactive (`flat` or process not running): existing behavior (`_set_pactl_sink_input(sink_name)`).
  - If EQ is active: move **only** `effect_output.deckify_eq` (`deckify_eq_out`) sink-input to `sink_name` (keeping `librespot` attached to `deckify_eq_sink`!), and remember `self._target_hardware_sink = sink_name` so subsequent EQ restarts target the same sink.
- **On `start_librespot()` / `librespot` restart:** If `eq_preset != "flat"`, ensure `EqualizerManager` is running and route the newly spawned `librespot` sink-input into `deckify_eq_sink` once `librespot` creates its audio stream.
- **On `pipewire -c` unexpected exit:** Detect non-zero/unexpected exit, fall back `librespot` to `@DEFAULT_SINK@` (or `self._target_hardware_sink`), and log warning without crashing `main.py`.
- **On `_unload()` (`main.py:156`):** Cleanly terminate `EqualizerManager`'s `pipewire -c` child process and cancel pending debounce/throttle tasks.

### Pattern 4: 7 Preset Pills & 10-Band ISO Sliders in `SettingsTab.tsx` (`D-01`, `D-02`, `D-03`)

- **7 Preset Pills Layout:** Arrange in **two** `<Focusable flow-children="horizontal">` rows inside the "Equalizer & Audio Presets" card:
  - Row 1 (4 pills): `Flat`, `Bass Boost`, `Vocal Clarity`, `Gaming Balance`
  - Row 2 (3 pills): `Deck Speakers`, `Late Night`, `Custom`
  This keeps pill text readable without horizontal overflow or `flow-children="row"` focus-jump bugs.
- **10 Always-Visible `SliderField` Bands (`D-02`):**
  Render below the 7 pills inside `<Focusable flow-children="column">`:
  - Labels: `31 Hz`, `62 Hz`, `125 Hz`, `250 Hz`, `500 Hz`, `1 kHz`, `2 kHz`, `4 kHz`, `8 kHz`, `16 kHz`
  - Props: `min={-12}`, `max={12}`, `step={0.5}`, `showValue` (matching existing `SliderField` pattern at `SettingsTab.tsx:463-474`).
  - **Interaction:**
    - Clicking any preset pill (`flat`..`late_night`) snaps the 10 local slider values to that preset's curve and calls `backendSetSetting("eq_preset", eq.id)`.
    - Clicking `Custom` switches `eq_preset` to `"custom"` and applies the user's saved `eq_custom_bands`.
    - Dragging any slider immediately updates local 10-band state, sets local `eq_preset` to `"custom"`, and calls `backendSetEqBands(nextBands)` (which updates `eq_preset = "custom"` + `eq_custom_bands` on backend with 75ms `pw-cli` throttle and 500ms disk save debounce).

### Anti-Patterns to Avoid
- **Modifying `~/.config/pipewire/pipewire.conf.d/` or restarting `pipewire.service`:** Severs game audio and `steamwebhelper` clicks.
- **Using `flow-children="row"` on preset pill containers:** Causes vertical focus jumps in SteamOS GamepadUI.
- **Spawning `pw-cli` synchronously on every React `onChange`:** Causes PipeWire lock contention and audio crackling (XRUNs).
- **Moving all `pactl list short sink-inputs` without filtering:** Moves `steamwebhelper` / `Chromium` / games into the music EQ.

## 10-Band Preset Curves Specification (`D-03`, `D-06`)

Frequencies (Hz): `[31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]`

| Preset ID | Label | 31Hz | 62Hz | 125Hz | 250Hz | 500Hz | 1kHz | 2kHz | 4kHz | 8kHz | 16kHz | Preamp | Purpose |
|-----------|-------|------|------|-------|-------|-------|------|------|------|------|-------|--------|---------|
| `flat` | Flat | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 dB | True bypass (`pipewire -c` stopped) |
| `bass` | Bass Boost | +5.0 | +6.0 | +4.5 | +2.0 | 0.0 | 0.0 | +0.5 | +1.0 | +1.5 | +1.0 | -6.0 dB | Punchy sub/mid-bass for EDM, hip-hop, soundtracks |
| `vocal` | Vocal Clarity | -2.0 | -1.5 | -1.0 | 0.0 | +1.5 | +3.5 | +4.5 | +3.5 | +1.5 | 0.0 | -4.5 dB | Podcasts, acoustic, vocal-forward presence |
| `gaming` | Gaming Balance | +2.5 | +2.0 | +0.5 | -2.5 | -3.5 | -3.0 | -1.5 | +1.0 | +2.5 | +2.0 | -2.5 dB | Scoops 250Hz–2kHz so game dialogue/SFX cut through |
| `deck_speakers` | Deck Speakers | 0.0 | +1.5 | +4.0 | +2.5 | -2.0 | 0.0 | +1.5 | +3.0 | +3.5 | +2.0 | -4.0 dB | **New:** Compensates Steam Deck speaker roll-off & 500Hz boxiness |
| `late_night` | Late Night | +4.0 | +3.5 | +2.0 | 0.0 | -0.5 | -1.0 | -1.5 | -1.0 | +2.0 | +3.0 | -4.0 dB | **New:** Low-volume loudness contour; tames 2–4kHz ear fatigue |
| `custom` | Custom | user | user | user | user | user | user | user | user | user | user | `-max(0, max)` | User-defined 10-band curve persisted in `eq_custom_bands` |

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Biquad IIR filtering & sample-rate coefficient math | Custom Python/C DSP audio loop | PipeWire `libpipewire-module-filter-chain` (`bq_lowshelf`, `bq_peaking`, `bq_highshelf`, `linear`) | Native real-time C DSP inside PipeWire graph with zero GIL/latency overhead |
| Sink-input PID/app filtering | New `pactl` parser in `equalizer.py` | `resolve_spotify_sink_input_ids()` in `py_modules/engine.py` | Already hardened with `steamwebhelper`/`Chromium` deny-list and allowlist [VERIFIED: py_modules/engine.py:130-195] |
| UID 1000 subprocess env setup | Manual `su` / `os.environ` hacks | `_build_deck_command()` in `py_modules/common.py` | Already handles `DECK_USER`, `XDG_RUNTIME_DIR`, `PULSE_SERVER`, `DBUS_SESSION_BUS_ADDRESS` [VERIFIED: py_modules/common.py:334-354] |

## Common Pitfalls

### Pitfall 1: Hardcoded Preset Allowlist Rejecting New Presets
**What goes wrong:** `py_modules/common.py:242` and `main.py:643` currently hardcode `("flat", "bass", "vocal", "gaming")`. If not updated, `deck_speakers`, `late_night`, and `custom` will be rejected with `Invalid eq_preset` or reset to `"flat"` on `_load_settings()`.
**How to avoid:** Define a single canonical `EQ_PRESETS` dict/tuple in `py_modules/equalizer.py` and import it in `py_modules/common.py` and `main.py`.

### Pitfall 2: `set_audio_sink` Moving `librespot` Off `deckify_eq_sink`
**What goes wrong:** When EQ is active and the user switches output sinks in `SettingsTab`, `volume.set_audio_sink()` (`py_modules/volume.py:142-150`) currently calls `_set_pactl_sink_input(sink_name)`, which moves **both** `librespot` and `deckify_eq_out` to the hardware sink — bypassing the EQ!
**How to avoid:** Per `D-05`, when EQ is active, `set_audio_sink()` must move **only** `effect_output.deckify_eq` / `deckify_eq_out` to `sink_name` and leave `librespot` routed into `deckify_eq_sink`.

### Pitfall 3: `pw-cli set-param` Missing Node Prefix or Wrong Node ID
**What goes wrong:** Passing bare `"Gain"` instead of `"eq_band_0:Gain"` to `pw-cli set-param`, or targeting `effect_output.deckify_eq` instead of the `filter-chain` capture node ID that owns the `Props` params.
**How to avoid:** Always prefix parameter names with `<node_name>:<param>` (`"eq_preamp:Mult"`, `"eq_band_0:Gain"`, ...) and discover the numeric node ID dynamically from `pw-dump` matching `node.name == "deckify_eq_sink"` [CITED: docs.pipewire.org].

### Pitfall 4: `pipewire -c` Startup Race Before `deckify_eq_sink` Exists
**What goes wrong:** Calling `pactl move-sink-input <librespot_id> deckify_eq_sink` immediately after `subprocess.Popen(["pipewire", "-c", ...])` fails because PipeWire takes ~100–300ms to register `deckify_eq_sink`.
**How to avoid:** Poll `pactl list short sinks` (or `pw-dump`) with short async backoff (e.g. `50ms` intervals up to `2.0s`) until `deckify_eq_sink` appears before moving `librespot`.

### Pitfall 5: `eq_band` Preamp Clipping & `0 dB` Reset on `linear` Node
**What goes wrong:** Forgetting to reset `eq_preamp:Mult` back to `1.0` when all boosted bands are lowered back to `<= 0 dB`.
**How to avoid:** Always compute `preamp_db = -max(0.0, max(bands))` and include `"eq_preamp:Mult"` in every `pw-cli set-param` batch.

## Code Examples

### PipeWire `filter-chain` Config Template (`~/.config/deckify/eq-filter-chain.conf`)

```text
# Source: PipeWire filter-chain documentation (docs.pipewire.org)
context.properties = {
    log.level = 0
}

context.spa-libs = {
    audio.convert.* = audioconvert/libspa-audioconvert
    support.*       = support/libspa-support
}

context.modules = [
    { name = libpipewire-module-protocol-native }
    { name = libpipewire-module-client-node }
    { name = libpipewire-module-adapter }
    {
        name = libpipewire-module-filter-chain
        args = {
            node.description = "Deckify Equalizer"
            media.name       = "Deckify Equalizer"
            filter.graph = {
                nodes = [
                    { type = builtin name = eq_preamp label = linear     control = { "Mult" = 1.0 "Add" = 0.0 } }
                    { type = builtin name = eq_band_0 label = bq_lowshelf  control = { "Freq" = 31.0    "Q" = 0.707 "Gain" = 0.0 } }
                    { type = builtin name = eq_band_1 label = bq_peaking   control = { "Freq" = 62.0    "Q" = 1.414 "Gain" = 0.0 } }
                    { type = builtin name = eq_band_2 label = bq_peaking   control = { "Freq" = 125.0   "Q" = 1.414 "Gain" = 0.0 } }
                    { type = builtin name = eq_band_3 label = bq_peaking   control = { "Freq" = 250.0   "Q" = 1.414 "Gain" = 0.0 } }
                    { type = builtin name = eq_band_4 label = bq_peaking   control = { "Freq" = 500.0   "Q" = 1.414 "Gain" = 0.0 } }
                    { type = builtin name = eq_band_5 label = bq_peaking   control = { "Freq" = 1000.0  "Q" = 1.414 "Gain" = 0.0 } }
                    { type = builtin name = eq_band_6 label = bq_peaking   control = { "Freq" = 2000.0  "Q" = 1.414 "Gain" = 0.0 } }
                    { type = builtin name = eq_band_7 label = bq_peaking   control = { "Freq" = 4000.0  "Q" = 1.414 "Gain" = 0.0 } }
                    { type = builtin name = eq_band_8 label = bq_peaking   control = { "Freq" = 8000.0  "Q" = 1.414 "Gain" = 0.0 } }
                    { type = builtin name = eq_band_9 label = bq_highshelf control = { "Freq" = 16000.0 "Q" = 0.707 "Gain" = 0.0 } }
                ]
                links = [
                    { output = "eq_preamp:Out" input = "eq_band_0:In" }
                    { output = "eq_band_0:Out" input = "eq_band_1:In" }
                    { output = "eq_band_1:Out" input = "eq_band_2:In" }
                    { output = "eq_band_2:Out" input = "eq_band_3:In" }
                    { output = "eq_band_3:Out" input = "eq_band_4:In" }
                    { output = "eq_band_4:Out" input = "eq_band_5:In" }
                    { output = "eq_band_5:Out" input = "eq_band_6:In" }
                    { output = "eq_band_6:Out" input = "eq_band_7:In" }
                    { output = "eq_band_7:Out" input = "eq_band_8:In" }
                    { output = "eq_band_8:Out" input = "eq_band_9:In" }
                ]
            }
            audio.channels = 2
            audio.position = [ FL FR ]
            capture.props = {
                node.name          = "deckify_eq_sink"
                media.class        = "Audio/Sink"
                priority.session   = 0
                priority.driver    = 0
                node.pause-on-idle = true
            }
            playback.props = {
                node.name    = "effect_output.deckify_eq"
                media.name   = "deckify_eq_out"
                node.passive = true
            }
        }
    }
]
```

### `pw-dump` Node ID Parsing & `pw-cli set-param` Invocation

```python
# Parse pw-dump JSON for deckify_eq_sink node ID
def parse_eq_node_id(pw_dump_stdout: str, target_name: str = "deckify_eq_sink") -> int | None:
    try:
        objects = json.loads(pw_dump_stdout)
    except (ValueError, TypeError):
        return None
    for obj in objects:
        if obj.get("type") != "PipeWire:Interface:Node":
            continue
        props = obj.get("info", {}).get("props", {})
        if props.get("node.name") == target_name:
            node_id = obj.get("id")
            if isinstance(node_id, int) and node_id > 0:
                return node_id
    return None

# Build pw-cli set-param payload
def build_pw_cli_params(bands: list[float]) -> str:
    preamp_db = -max(0.0, max(bands))
    mult = round(10.0 ** (preamp_db / 20.0), 6)
    tokens = [f'"eq_preamp:Mult" {mult}']
    for idx, gain in enumerate(bands):
        tokens.append(f'"eq_band_{idx}:Gain" {round(float(gain), 2)}')
    return "{ params = [ " + " ".join(tokens) + " ] }"
```

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | SteamOS 3.5+ `pipewire` `filter-chain` exposes `eq_preamp:Mult` on `label = linear` and `eq_band_N:Gain` on `deckify_eq_sink` (`capture.props`) via `pw-cli set-param <id> Props` | Pattern 1 & 2 | Low — if `Props` lives on the playback/filter node instead of `deckify_eq_sink`, `pw-cli enum-params <id> Props` or matching `effect_output.deckify_eq` resolves it on first device test |
| A2 | `pipewire -c <eq.conf>` registers `deckify_eq_sink` within `< 2.0s` on Steam Deck | Pattern 3 / Pitfall 4 | Low — polling `pactl list short sinks` up to `2.0s` handles variable startup latency |

## Environment Availability

| Dependency | Required By | Available (Dev Host) | Version | Fallback |
|------------|------------|----------------------|---------|----------|
| `pipewire` | `EqualizerManager` (`pipewire -c`) | ✗ (Windows dev host; present on SteamOS 3.5+) | — | Unit tests mock `_build_deck_command` / `subprocess` |
| `pw-cli` / `pw-dump` | Live DSP param updates | ✗ (Windows dev host; present on SteamOS 3.5+) | — | Unit tests mock `pw-dump` JSON & `pw-cli` calls |
| `pactl` | Sink-input routing | ✗ (Windows dev host; present on SteamOS 3.5+) | — | Unit tests mock `pactl` stdout |
| Node.js + Vitest | Frontend tests | ✓ | Vitest 5.1.0 | — |
| Python (`py`) | Backend unit tests | ✓ | Python 3.14.0 | — |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Frontend Framework | Vitest 5.1.0 (`pnpm test`) |
| Backend Framework | Python `unittest` (`py -m unittest discover -s tests -p "test_*.py"` / `python3 -m unittest ...`) |
| Config file | `package.json` (`test`, `test:python`, `typecheck`, `lint`) |
| Quick run command | `pnpm test` and `py -m unittest discover -s tests -p "test_equalizer.py"` |
| Full suite command | `pnpm test && pnpm typecheck && pnpm lint && py -m unittest discover -s tests -p "test_*.py"` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EQ-01 | 7 preset definitions, true bypass (`flat` tears down `pipewire -c`), `pipewire -c` conf generation, `pw-dump` node ID discovery, `set_audio_sink` routes `effect_output.deckify_eq` without touching `steamwebhelper` | unit | `py -m unittest discover -s tests -p "test_equalizer.py"` | ❌ Wave 0 |
| EQ-02 | Preamp headroom (`-max(0, max_band_gain)`), 75ms `pw-cli` coalescing, 500ms `settings.json` debounce, band clamping (`±12 dB`), `SettingsTab.tsx` 7 pills in 2 horizontal rows & 10 `SliderField` bands forking to `"custom"` | unit | `pnpm test -- src/components/tabs/SettingsTab.test.tsx` & `py -m unittest discover -s tests -p "test_equalizer.py"` | ✅ (`SettingsTab.test.tsx`) / ❌ Wave 0 (`test_equalizer.py`) |

### Sampling Rate
- **Per task commit:** `pnpm test -- src/components/tabs/SettingsTab.test.tsx` and `py -m unittest discover -s tests -p "test_equalizer.py"`
- **Per wave merge:** `pnpm test && pnpm typecheck && pnpm lint && py -m unittest discover -s tests -p "test_*.py"`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/test_equalizer.py` — covers `EqualizerManager` (presets, preamp math, conf generation, `pw-dump` parsing, 75ms throttling, `flat` bypass, `set_audio_sink` isolation, crash fallback)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | yes | Drop privileges to `deck` (UID 1000) via `_build_deck_command()` (`py_modules/common.py:334-354`) for all PipeWire/PulseAudio subprocesses |
| V5 Input Validation | yes | Strictly validate `eq_preset` against allowlist, clamp 10 band gains to `[-12.0, 12.0]` floats, validate `node_id` as positive `int`, validate `sink_name` against `pactl list short sinks` / non-flag string before subprocess args |
| V6 Cryptography | no | — |

### Known Threat Patterns for PipeWire / Subprocess Control

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Config or CLI argument injection via unvalidated preset/sink/gain inputs | Tampering | Clamp band gains as `float` in `[-12.0, 12.0]`, use hardcoded frequencies/Q-factors, validate `eq_preset` against `EQ_PRESETS`, reject `sink_name` starting with `-` |
| Root-owned files in `/run/user/1000/` or `~/.config/deckify/` | Elevation of Privilege / DoS | Run `pipewire -c`, `pw-cli`, `pw-dump`, `pactl` via `_build_deck_command()` as `DECK_USER` |

## Sources

### Primary (HIGH confidence)
- In-repo codebase: `py_modules/common.py:90-120,235-255,330-354`, `py_modules/volume.py:97-225`, `py_modules/engine.py:125-235`, `main.py:131-185,630-660,865-895`, `src/components/tabs/SettingsTab.tsx:320-375,455-485`, `src/types.ts:1-60,160-200`, `src/components/tabs/SettingsTab.test.tsx:1-100`
- PipeWire `libpipewire-module-filter-chain` & biquad/linear built-in documentation (`docs.pipewire.org`)
- PipeWire `pw-cli` & `pw-dump` runtime parameter documentation (`docs.pipewire.org`)

### Secondary (MEDIUM confidence)
- `.planning/research/SUMMARY.md` & `.planning/research/PITFALLS.md` (v0.6 research synthesis)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All PipeWire/PulseAudio tools and `@decky/ui` components verified in-repo and via official docs
- Architecture: HIGH - Aligns with `EqualizerManager` pattern, `D-01`–`D-08`, and `resolve_spotify_sink_input_ids()`
- Pitfalls: HIGH - Grounded in direct inspection of `common.py`, `volume.py`, `engine.py`, and `main.py`

**Research date:** 2026-11-16
**Valid until:** 2026-12-16
