# Phase 16: Automatic Docked Audio-Switching - Context

**Gathered:** 2026-11-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver automatic USB-DAC and HDMI sink hotplug detection and routing isolated to Deckify's audio stream (`effect_output.deckify_eq` when EQ is active, or `librespot` / `com.spotify.client` when bypassed) with `bit_perfect_clock` (`clock.allowed-rates`) management, startup + hotplug evaluation (supporting both Steam Deck dock/undock and Steam Machine always-connected TV/AVR/DAC setups), Bluetooth and manual override protection, and clean undock restoration in `SettingsTab.tsx`.

</domain>

<decisions>
## Implementation Decisions

### Target Sink Selection & Steam Machine Support
- **D-01:** Support both a **designated specific sink** (chosen from detected PipeWire sinks) and an **"Auto (USB-DAC / HDMI)"** target option (`dock_target_sink` setting).
- **D-02:** When Target is `"auto"` and both a USB-DAC and HDMI sink are connected, **USB-DAC takes priority over HDMI** (`alsa_output.usb-*` > `alsa_output.pci-*.hdmi-stereo*`).
- **D-03:** Evaluate connected sinks **on plugin startup / setting enable AND via `pactl subscribe` hotplug events** (with hotplug debounce), using the same Auto-Switch setting + sink priority for both **Steam Deck (dock/undock)** and **Steam Machine (always-connected HDMI/DAC or TV/AVR wake)** without a separate device-profile mode.

### Bluetooth & Manual Override Precedence
- **D-04:** **Respect active Bluetooth headphones** (`bluez_output.*`) when docking or plugging in a USB-DAC — do not hijack audio away from Bluetooth, with an optional toggle in `SettingsTab.tsx` (`dock_respect_bluetooth`, default `true`) to allow overriding Bluetooth if desired.
- **D-05:** If Bluetooth headphones were active when docked and the user **turns off/disconnects Bluetooth while still docked**, re-evaluate and route Deckify's stream to the connected dock/DAC sink.
- **D-06:** **Respect manual sink overrides** for the duration of the current dock session: if the user manually selects another sink in `SettingsTab.tsx` (or SteamOS) while docked, do not snap back to the dock sink until an undock/re-dock cycle occurs.

### Undock Restoration & Bit-Perfect Clock Policy
- **D-07:** On undock (designated/active dock sink disappears), **restore the pre-dock sink** (captured before switching) if it is still available; otherwise fall back to PipeWire's `@DEFAULT_SINK@` (e.g., internal `acp5x` speakers).
- **D-08:** Unlock `bit_perfect_clock` rates (`clock.allowed-rates = [ 44100 48000 88200 96000 ]`) **whenever docked to a USB-DAC/HDMI sink** and `bit_perfect_clock` is enabled (even for 44.1kHz Ogg/AAC streams, not just Lossless), and **reset `clock.allowed-rates` to `[ 48000 ]` on undock** so internal speakers (`acp5x`) and Bluetooth do not crackle.
- **D-09:** Add an optional **"Pause on undock"** toggle (`dock_pause_on_undock`, default `false`) so playback continues seamlessly on the restored sink by default, while allowing users to opt into auto-pausing on undock.

### SettingsTab UI & Notifications
- **D-10:** Add a dedicated **"Docked Audio-Switching"** card in `SettingsTab.tsx` (adjacent to the existing "Audio Output Sink (PipeWire)" card) containing the enable toggle, target sink selector (`Auto (USB-DAC > HDMI)` + detected sinks), "Respect Bluetooth Headphones" toggle, "Pause on Undock" toggle, "Dock Switch Toasts" toggle, and a live docked/active-target status indicator.
- **D-11:** Show brief Decky toast notifications when auto-switching on dock/undock by default, controlled by a user-facing **"Dock Switch Toasts"** toggle (`dock_toast_enabled`, default `true`) in the Docked Audio-Switching card.

### the agent's Discretion
- Exact `py_modules/dock.py` (`DockAudioSwitcher`) implementation details: `pactl subscribe` subprocess supervision with `_build_deck_command`, hotplug debounce window (e.g., `1.5–2.0s`), and `pactl list short sinks` / `pactl get-default-sink` parsing.
- Exact `settings.json` key names in `DEFAULT_SETTINGS` (`py_modules/common.py`) and TypeScript types in `src/types.ts`.
- Exact interaction between `DockAudioSwitcher`, `EqualizerManager.on_sink_changed`, and `set_audio_sink` in `py_modules/volume.py` so EQ isolation (`effect_output.deckify_eq`) is preserved when EQ is active.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & Requirements
- `.planning/REQUIREMENTS.md` — `DOCK-01` and `DOCK-02` acceptance requirements
- `.planning/ROADMAP.md` — Phase 16 goal, dependencies (Phase 13, Phase 15), and success criteria
- `.planning/PROJECT.md` — Core constraints (SteamOS GamepadUI `flow-children`, PipeWire sink-input isolation)

### Research & Architecture
- `.planning/research/SUMMARY.md` — v0.6 research synthesis and `DockAudioSwitcher` overview
- `.planning/research/ARCHITECTURE.md` — PipeWire signal chain (`VolumeFader` + `EQ-01` + `DOCK-01`) and `py_modules/dock.py` integration
- `.planning/research/PITFALLS.md` — Hotplug flapping debounce, EQ bypass prevention (`effect_output.deckify_eq`), and `clock.allowed-rates` `[ 48000 ]` restoration on undock

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `py_modules/volume.py`: `get_audio_sinks()`, `set_audio_sink(sink_name, plugin=self)` (already coordinates `eq_mgr.on_sink_changed(target)` when EQ is active), and `configure_pipewire_clock(unlock_lossless)` (`pw-metadata -n settings 0 clock.allowed-rates`).
- `py_modules/engine.py`: `_set_pactl_sink_input` and `resolve_spotify_sink_input_ids()` (allowlist: `librespot`, `spotify`, `com.spotify.client`, `deckify_eq_out`; deny-list: `steamwebhelper`, `Chromium`).
- `py_modules/common.py`: `DEFAULT_SETTINGS` (`bit_perfect_clock: True`) and `_build_deck_command` (strips `LD_LIBRARY_PATH`, sets `PULSE_SERVER` / `XDG_RUNTIME_DIR` for UID 1000 `deck`).
- `src/components/tabs/SettingsTab.tsx`: Existing "Audio Output Sink (PipeWire)" card (`backendGetAudioSinks`, `backendSetAudioSink`) and `InteractiveRow` / `Focusable` patterns.

### Established Patterns
- SteamOS GamepadUI spatial navigation requires `flow-children="horizontal"` on horizontal button rows (`GEMINI.md`).
- Subprocesses must strip `LD_LIBRARY_PATH` via `_build_deck_command`.
- QAM stays compact; detailed audio/DSP/dock settings live in `SettingsTab.tsx` (Phases 10, 14, 15).

### Integration Points
- `main.py` ↔ `py_modules/dock.py` (`DockAudioSwitcher` lifecycle in `Plugin._main` / `_unload`, settings updates, status reporting, and `dock_audio_switched` event emission).
- `py_modules/dock.py` ↔ `py_modules/volume.py` (`set_audio_sink`, `configure_pipewire_clock`, `get_audio_sinks`).
- `src/components/tabs/SettingsTab.tsx` & `src/index.tsx` ↔ `main.py` (settings toggles, sink target selection, and optional toast on `dock_audio_switched` event).

</code_context>

<specifics>
## Specific Ideas

- **Steam Machine compatibility:** User runs a Steam Machine in addition to/alongside Steam Deck; startup + hotplug sink evaluation with target priority ensures both Steam Deck docking and Steam Machine always-connected HDMI/USB-DAC (or TV/AVR wake) work under one unified Auto-Switch setting.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 16-automatic-docked-audio-switching*
*Context gathered: 2026-11-16*
