# Phase 16: Automatic Docked Audio-Switching - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-16
**Phase:** 16-Automatic Docked Audio-Switching
**Areas discussed:** Target Sink Selection, Bluetooth & Manual Overrides, Undock Restoration & Clock Policy, SettingsTab UI & Feedback

---

## Target Sink Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Designated sink with Auto (USB-DAC / HDMI) option | Let user pick a specific sink OR choose Auto (USB-DAC > HDMI priority) | ✓ |
| Specific designated sink only | User must select a specific sink from the detected PipeWire sinks list | |
| Auto-detect USB-DAC / HDMI only | Always match usb-* / hdmi-* sinks automatically without per-sink selection | |

| Option | Description | Selected |
|--------|-------------|----------|
| Check on startup + hotplug | Evaluate connected sinks at startup/enable AND watch pactl subscribe for hotplug events | ✓ |
| Hotplug events only | Only switch when a sink is plugged in after Deckify is running | |

| Option | Description | Selected |
|--------|-------------|----------|
| Use the same Auto-Switch setting + sink priority | Startup check + hotplug handles both Steam Deck docking and Steam Machine AVR/TV wake seamlessly | ✓ |
| Add a Device Profile mode (Steam Deck Dock vs Steam Machine) | Steam Machine mode skips undock speaker fallback and locks bit-perfect clock continuously | |

| Option | Description | Selected |
|--------|-------------|----------|
| USB-DAC first, then HDMI | Prefer dedicated external USB-DACs over TV/monitor HDMI audio when both are connected | ✓ |
| HDMI first, then USB-DAC | Prefer TV/AVR HDMI audio over USB-DAC | |

**User's choice:** Designated sink with Auto (USB-DAC > HDMI priority), evaluated on startup + hotplug, using the same unified Auto-Switch setting for both Steam Deck and Steam Machine.
**Notes:** User specifically noted they have a Steam Machine, so startup evaluation and AVR/TV wake handling must work seamlessly alongside Steam Deck dock/undock.

---

## Bluetooth & Manual Overrides

| Option | Description | Selected |
|--------|-------------|----------|
| Respect Bluetooth headphones | Do not hijack audio if a bluez_output.* sink is active (with an optional toggle to override) | ✓ |
| Always switch to Dock/DAC | Move Deckify to the dock sink even if Bluetooth headphones are connected | |

| Option | Description | Selected |
|--------|-------------|----------|
| Respect manual override until undock | Don't snap back if user manually picks another sink while docked; reset when undocked | ✓ |
| Only respect Bluetooth manual switches | Re-route to dock sink on next event unless user chose Bluetooth | |

| Option | Description | Selected |
|--------|-------------|----------|
| Switch to dock sink when Bluetooth disconnects | Re-evaluate on Bluetooth sink removal and route to the connected dock/DAC sink | ✓ |
| Stay on SteamOS default | Only trigger dock switching on dock/DAC plug-in events | |

**User's choice:** Respect Bluetooth headphones (configurable toggle), respect manual overrides for the current dock session, and switch to the waiting dock sink if Bluetooth disconnects while docked.

---

## Undock Restoration & Clock Policy

| Option | Description | Selected |
|--------|-------------|----------|
| Pre-dock sink if still available, else SteamOS default | Snapshot pre-dock sink and restore it on undock if present, falling back to @DEFAULT_SINK@ | ✓ |
| Always restore SteamOS default sink | Always route back to PipeWire's current @DEFAULT_SINK@ on undock | |

| Option | Description | Selected |
|--------|-------------|----------|
| Unlock 44.1/48/88.2/96kHz whenever docked (if Bit-Perfect Clock is ON) | Avoids 44.1->48kHz resampling on USB-DAC/HDMI; resets to [ 48000 ] on undock | ✓ |
| Only unlock when Audio Quality is Lossless | Keep [ 48000 ] unless FLAC Lossless is active | |

| Option | Description | Selected |
|--------|-------------|----------|
| Keep playing seamlessly on the restored sink | Route audio back without interrupting playback | |
| Add a "Pause on undock" toggle (default OFF) | Keep playing by default, but let users opt into pausing on undock | ✓ |
| Always pause playback on undock | Prevent music from playing through Steam Deck speakers unexpectedly | |

**User's choice:** Restore pre-dock sink if available (else `@DEFAULT_SINK@`), unlock `[ 44100 48000 88200 96000 ]` whenever docked with `bit_perfect_clock` ON (resetting to `[ 48000 ]` on undock), and provide a "Pause on undock" toggle (default OFF).

---

## SettingsTab UI & Feedback

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated "Docked Audio-Switching" card next to Audio Output Sink | Enable toggle, target selector (Auto + detected sinks), Bluetooth/Pause toggles, and live docked status badge | ✓ |
| Merged inside the existing "Audio Output Sink (PipeWire)" card | Combine manual sink picker and docked auto-switching in one card | |

| Option | Description | Selected |
|--------|-------------|----------|
| Show brief toast on dock/undock switch | e.g. "Switched to [Sink] (Bit-Perfect)" and "Undocked — restored [Sink]" (with user toggle to turn ON/OFF) | ✓ |
| Silent switch | Update SettingsTab status badge without showing a toast notification | |

**User's choice:** Dedicated "Docked Audio-Switching" card in `SettingsTab.tsx`, and show dock/undock switch toasts by default with a user-configurable toggle.

---

## the agent's Discretion

- Exact `py_modules/dock.py` (`DockAudioSwitcher`) subprocess supervision, hotplug debounce timing, and `pactl` parsing.
- Exact `DEFAULT_SETTINGS` key names and `src/types.ts` interface additions.
- Exact coordination with `EqualizerManager.on_sink_changed` and `set_audio_sink`.

## Deferred Ideas

None — discussion stayed within phase scope.
