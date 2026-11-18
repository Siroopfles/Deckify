# Phase 16: Automatic Docked Audio-Switching - Research

**Researched:** 2026-11-16
**Domain:** SteamOS 3.5+ PipeWire Sink Hotplug Routing, `pactl subscribe`, `pw-metadata` Clock Control, & Decky GamepadUI Settings
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Support both a **designated specific sink** (chosen from detected PipeWire sinks) and an **"Auto (USB-DAC / HDMI)"** target option (`dock_target_sink` setting).
- **D-02:** When Target is `"auto"` and both a USB-DAC and HDMI sink are connected, **USB-DAC takes priority over HDMI** (`alsa_output.usb-*` > `alsa_output.pci-*.hdmi-stereo*`).
- **D-03:** Evaluate connected sinks **on plugin startup / setting enable AND via `pactl subscribe` hotplug events** (with hotplug debounce), using the same Auto-Switch setting + sink priority for both **Steam Deck (dock/undock)** and **Steam Machine (always-connected HDMI/DAC or TV/AVR wake)** without a separate device-profile mode.
- **D-04:** **Respect active Bluetooth headphones** (`bluez_output.*`) when docking or plugging in a USB-DAC — do not hijack audio away from Bluetooth, with an optional toggle in `SettingsTab.tsx` (`dock_respect_bluetooth`, default `true`) to allow overriding Bluetooth if desired.
- **D-05:** If Bluetooth headphones were active when docked and the user **turns off/disconnects Bluetooth while still docked**, re-evaluate and route Deckify's stream to the connected dock/DAC sink.
- **D-06:** **Respect manual sink overrides** for the duration of the current dock session: if the user manually selects another sink in `SettingsTab.tsx` (or SteamOS) while docked, do not snap back to the dock sink until an undock/re-dock cycle occurs.
- **D-07:** On undock (designated/active dock sink disappears), **restore the pre-dock sink** (captured before switching) if it is still available; otherwise fall back to PipeWire's `@DEFAULT_SINK@` (e.g., internal `acp5x` speakers).
- **D-08:** Unlock `bit_perfect_clock` rates (`clock.allowed-rates = [ 44100 48000 88200 96000 ]`) **whenever docked to a USB-DAC/HDMI sink** and `bit_perfect_clock` is enabled (even for 44.1kHz Ogg/AAC streams, not just Lossless), and **reset `clock.allowed-rates` to `[ 48000 ]` on undock** so internal speakers (`acp5x`) and Bluetooth do not crackle.
- **D-09:** Add an optional **"Pause on undock"** toggle (`dock_pause_on_undock`, default `false`) so playback continues seamlessly on the restored sink by default, while allowing users to opt into auto-pausing on undock.
- **D-10:** Add a dedicated **"Docked Audio-Switching"** card in `SettingsTab.tsx` (adjacent to the existing "Audio Output Sink (PipeWire)" card) containing the enable toggle, target sink selector (`Auto (USB-DAC > HDMI)` + detected sinks), "Respect Bluetooth Headphones" toggle, "Pause on Undock" toggle, "Dock Switch Toasts" toggle, and a live docked/active-target status indicator.
- **D-11:** Show brief Decky toast notifications when auto-switching on dock/undock by default, controlled by a user-facing **"Dock Switch Toasts"** toggle (`dock_toast_enabled`, default `true`) in the Docked Audio-Switching card.

### the agent's Discretion
- Exact `py_modules/dock.py` (`DockAudioSwitcher`) implementation details: `pactl subscribe` subprocess supervision with `_build_deck_command`, hotplug debounce window (e.g., `1.5–2.0s`), and `pactl list short sinks` / `pactl get-default-sink` parsing.
- Exact `settings.json` key names in `DEFAULT_SETTINGS` (`py_modules/common.py`) and TypeScript types in `src/types.ts`.
- Exact interaction between `DockAudioSwitcher`, `EqualizerManager.on_sink_changed`, and `set_audio_sink` in `py_modules/volume.py` so EQ isolation (`effect_output.deckify_eq`) is preserved when EQ is active.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DOCK-01 | User can enable and configure automatic docked audio-switching in `SettingsTab` so connecting a designated external USB-DAC or HDMI sink routes only Deckify's audio stream (`effect_output.deckify_eq` or `librespot`) to that sink after hotplug debounce. | `DockAudioSwitcher` in `py_modules/dock.py` using `pactl subscribe` + 1.8s debounce, routing through `volume.set_audio_sink()` / `EqualizerManager.on_sink_changed()`, `DEFAULT_SETTINGS` keys in `py_modules/common.py`, and `"Docked Audio-Switching"` card in `SettingsTab.tsx` per `16-UI-SPEC.md`. |
| DOCK-02 | Docked switching enables `bit_perfect_clock` on designated DAC/HDMI sinks and cleanly restores normal routing and clock settings when undocked. | `volume.configure_pipewire_clock(True)` on dock when `bit_perfect_clock` is enabled, pre-dock sink capture + restoration (with `@DEFAULT_SINK@` fallback) and `volume.configure_pipewire_clock(False)` (`[ 48000 ]`) on undock, plus optional `control_playback("pause")` when `dock_pause_on_undock` is enabled. |
</phase_requirements>

## Project Constraints (from GEMINI.md)

- **SteamOS GamepadUI Navigation:** Controller focus relies on spatial navigation (`flow-children`, `@decky/ui`). Horizontal button rows MUST use `flow-children="horizontal"`; vertical toggle/sink stacks in `SettingsTab.tsx` MUST use `<Focusable flow-children="column">` (`16-UI-SPEC.md`).
- **PipeWire UI Stream Isolation:** Steam GamepadUI interface sounds run under `steamwebhelper` with application name `"Chromium"`. Any sink-input routing MUST use `resolve_spotify_sink_input_ids()` / `_set_pactl_sink_input()` (`py_modules/engine.py`) and NEVER move `steamwebhelper`, `Chromium`, or game audio streams.
- **Process Environment Isolation:** Decky Loader runs as `root` (UID 0) with bundled PyInstaller libraries. All PipeWire/PulseAudio subprocesses (`pactl`, `pw-metadata`) MUST run under `deck` (UID 1000) via `_build_deck_command()` (`py_modules/common.py:352-372`) with `LD_LIBRARY_PATH` stripped (`env.pop("LD_LIBRARY_PATH", None)`).
- **Zero New External Packages:** No new npm or runtime pip dependencies; rely exclusively on SteamOS system utilities (`pactl`, `pw-metadata`) and Python stdlib `asyncio` / `subprocess`.
- **Compact QAM Constraint:** Detailed dock-switching controls live exclusively in `SettingsTab.tsx`, keeping the Quick Access Menu (`src/index.tsx`) compact.

## Summary

Phase 16 delivers automatic docked USB-DAC and HDMI audio-switching (`DOCK-01`, `DOCK-02`) on top of the stream-isolation and PipeWire EQ infrastructure already implemented in Phases 13 and 15. Direct inspection of the codebase confirms that `py_modules/equalizer.py` (`EqualizerManager`), `py_modules/volume.py` (`set_audio_sink`, `configure_pipewire_clock`), and `py_modules/engine.py` (`_set_pactl_sink_input`, `resolve_spotify_sink_input_ids`) already provide the core routing primitives: `volume.set_audio_sink(target, plugin=self)` delegates to `eq_mgr.on_sink_changed(target)` when EQ is active (moving `effect_output.deckify_eq` to `target` while keeping `librespot` routed to `deckify_eq_sink`), and calls `_set_pactl_sink_input(target)` when EQ is bypassed.

Two critical codebase gaps must be addressed alongside `py_modules/dock.py`:
1. **Sink metadata & virtual EQ sink filtering in `get_audio_sinks()`:** `AudioSinkInfo` in `src/types.ts:146-150` expects `{ name, description, is_default }`, whereas `_get_pactl_sinks()` in `py_modules/engine.py:103-128` currently parses `pactl list short sinks` and returns `{ id, name, module, spec, state }` without `description` or `is_default`, and without excluding `EQ_SINK_NAME` (`"deckify_eq_sink"`). Enriching `get_audio_sinks()` (via `pactl list sinks` + `pactl get-default-sink` and filtering out `deckify_eq_sink`) ensures both the existing `"Audio Output Sink (PipeWire)"` card and the new `"Docked Audio-Switching"` card display friendly hardware names, accurate `Default` badges, and never list the virtual EQ sink as a hardware target.
2. **Unified `DockAudioSwitcher` state machine:** A new `py_modules/dock.py` module (`DockAudioSwitcher`) should supervise `pactl subscribe` under `_build_deck_command` (matching `SuspendResumeMonitor` in `py_modules/device.py:113-160`), debounce sink/server events by `1.8s`, and evaluate routing on startup, setting enable, and hotplug events. It must enforce the exact precedence rules from `16-CONTEXT.md`: `dock_respect_bluetooth` (`bluez_output.*` protection with automatic re-evaluation on BT disconnect), per-dock-session `_manual_override` protection, `USB-DAC > HDMI` priority in `"auto"` mode, pre-dock sink capture/restoration (falling back to `@DEFAULT_SINK@`), `configure_pipewire_clock(True/False)`, optional `dock_pause_on_undock`, and `dock_audio_switched` event emission.

**Primary recommendation:** Implement `DockAudioSwitcher` in `py_modules/dock.py` as an `asyncio` subprocess supervisor over `pactl subscribe` with a 1.8s debounce timer, routing exclusively through `volume.set_audio_sink(..., is_auto_dock=True)` and `volume.configure_pipewire_clock(...)`, and expose enriched sink metadata + `dock_status` in `main.py` and `SettingsTab.tsx`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `pactl subscribe` hotplug detection & 1.8s debounce | Python Backend (`py_modules/dock.py`) | — | Long-lived `asyncio` subprocess monitoring PipeWire/PulseAudio events as `deck` (UID 1000). |
| Sink classification (`USB-DAC > HDMI`), BT & manual override state | Python Backend (`py_modules/dock.py`) | — | Stateful dock session tracking (`_docked_sink`, `_pre_dock_sink`, `_manual_override`) belongs in backend. |
| Stream-isolated routing (`effect_output.deckify_eq` or `librespot`) | Python Backend (`py_modules/volume.py`, `equalizer.py`, `engine.py`) | PipeWire / PulseAudio | `set_audio_sink` + `EqualizerManager.on_sink_changed` already preserve EQ isolation and exclude `steamwebhelper`. |
| `bit_perfect_clock` (`clock.allowed-rates`) unlock & `[ 48000 ]` reset | Python Backend (`py_modules/volume.py`, `dock.py`) | PipeWire (`pw-metadata`) | Prevents sample-rate crackling on internal `acp5x` speakers and Bluetooth on undock. |
| Settings persistence & RPC / `dock_audio_switched` event | Python Backend (`main.py`, `py_modules/common.py`) | — | `DEFAULT_SETTINGS`, `set_setting`, `get_status`, and `decky.emit("dock_audio_switched", ...)` live in `Plugin`. |
| `"Docked Audio-Switching"` card, status badge, & toast notifications | Frontend (`src/components/tabs/SettingsTab.tsx`, `src/index.tsx`) | — | Renders toggles/sink selector per `16-UI-SPEC.md` and displays Decky toasts on `dock_audio_switched`. |

## Standard Stack

### Core
| Library / Tool | Version | Purpose | Why Standard |
|----------------|---------|---------|--------------|
| `pactl` (SteamOS `libpulse`) | System (SteamOS 3.5+) | `subscribe`, `list short sinks`, `list sinks`, `get-default-sink`, `move-sink-input` | Already used across `py_modules/engine.py`, `py_modules/volume.py`, and `py_modules/equalizer.py` `[VERIFIED: py_modules/engine.py:106,233]`. |
| `pw-metadata` (PipeWire) | System (SteamOS 3.5+) | Set `clock.allowed-rates` (`[ 44100 48000 88200 96000 ]` / `[ 48000 ]`) | Already wrapped by `volume.configure_pipewire_clock()` `[VERIFIED: py_modules/volume.py:112-120]`. |
| Python `asyncio` + `subprocess` | Python 3.11+ / 3.14 | Async subprocess supervision & hotplug debounce | Zero external dependencies; matches `SuspendResumeMonitor` `[VERIFIED: py_modules/device.py:121-155]`. |
| `@decky/ui` + `@decky/api` | `^4.11.1` / `^1.1.3` | `ToggleField`, `Focusable`, `callable`, `addEventListener` | Existing plugin UI framework `[VERIFIED: src/components/tabs/SettingsTab.tsx:1-5]`. |

### Supporting
| Library / Tool | Version | Purpose | When to Use |
|----------------|---------|---------|-------------|
| `EqualizerManager` (`py_modules/equalizer.py`) | In-repo | Preserves `librespot -> deckify_eq_sink -> hardware_sink` when EQ is active | Called automatically via `volume.set_audio_sink(target, plugin=self)` `[VERIFIED: py_modules/volume.py:155-158]`. |
| `InteractiveRow` (`src/components/common/InteractiveRow.tsx`) | In-repo | Controller-focusable sink selection rows | Used for `Auto (USB-DAC / HDMI)` and detected sink rows `[CITED: 16-UI-SPEC.md:23,130-135]`. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `pactl subscribe` event stream | Polling `pactl list short sinks` every 2s | Polling wastes CPU/battery on handheld; `pactl subscribe` is push-driven with zero idle overhead. |
| `volume.set_audio_sink()` | Direct `_set_pactl_sink_input()` | Direct call bypasses `EqualizerManager.on_sink_changed()`, silently breaking EQ when active. |

**Installation:**
None — zero new npm or pip packages required.

## Architecture Patterns

### System Architecture Diagram

```text
[pactl subscribe (UID 1000 via _build_deck_command)]
        │  Event 'new'/'remove'/'change' on sink | server
        ▼
[DockAudioSwitcher._debounce_evaluate (1.8s)] ◄── Startup / set_setting()
        │
        ├── Disabled? ──► Clear dock state (if active, restore pre-dock + clock [48000])
        │
        ├── Undock? (active _docked_sink missing from sinks)
        │       ├── Pause if dock_pause_on_undock && playing
        │       ├── Restore _pre_dock_sink (if available) else @DEFAULT_SINK@
        │       ├── configure_pipewire_clock(False) -> [ 48000 ]
        │       └── Emit dock_audio_switched (action: "undocked")
        │
        └── Target dock sink present? (USB-DAC > HDMI if target == "auto")
                ├── _manual_override == True? ──► Skip (status: "manual_override")
                ├── dock_respect_bluetooth && active BT (bluez_output.*)? ──► Skip (status: "bluetooth_held")
                └── Switch needed?
                        ├── Capture _pre_dock_sink (current sink before switch)
                        ├── volume.set_audio_sink(target, plugin, is_auto_dock=True)
                        │       ├── EQ active ──► eq_mgr.on_sink_changed(target) [moves effect_output.deckify_eq]
                        │       └── EQ flat   ──► _set_pactl_sink_input(target)  [moves librespot]
                        ├── If bit_perfect_clock: configure_pipewire_clock(True) -> [ 44100 48000 88200 96000 ]
                        └── Emit dock_audio_switched (action: "docked")
```

### Recommended Project Structure
```text
py_modules/
├── common.py          # MODIFIED: Add dock_* DEFAULT_SETTINGS + load_settings validation
├── dock.py            # NEW: DockAudioSwitcher, sink classification, pactl subscribe supervisor
├── engine.py          # MODIFIED (optional): Enrich sink parsing or add helper for sink descriptions
├── volume.py          # MODIFIED: Enrich get_audio_sinks() + notify dock_switcher on manual set_audio_sink
main.py                # MODIFIED: Instantiate/unload DockAudioSwitcher, get_status dock_status, set_setting hooks
src/
├── types.ts           # MODIFIED: DockStatusInfo + EngineSettings dock_* fields
├── index.tsx          # MODIFIED: Listen to dock_audio_switched for toast notifications
└── components/tabs/
    └── SettingsTab.tsx # MODIFIED: "Docked Audio-Switching" card per 16-UI-SPEC.md
tests/
└── test_dock.py       # NEW: Unit tests for DockAudioSwitcher, precedence, EQ/clock coordination, RPCs
```

### Pattern 1: Sink Classification & Priority (`USB-DAC > HDMI`)
**What:** Classify PipeWire/PulseAudio sink names deterministically while excluding Deckify's own virtual EQ sink (`EQ_SINK_NAME = "deckify_eq_sink"` `[VERIFIED: py_modules/equalizer.py:30]`).
**When to use:** During `Auto (USB-DAC / HDMI)` target resolution (`D-02`) and `get_audio_sinks()` UI listing.
**Classification rules:**
- **Ignore virtual EQ sink:** Skip `name == EQ_SINK_NAME` (and `effect_input.deckify_eq`).
- **Bluetooth (`bluez_output.`):** `name.startswith("bluez_output.")` — never selected as an auto-dock target; triggers `bluetooth_held` protection when `dock_respect_bluetooth` is `True`.
- **USB-DAC (`usb`):** `name.startswith("alsa_output.usb-")` or `".usb-"` in `name.lower()` — highest priority (`priority = 1`) in `"auto"` mode.
- **HDMI / DisplayPort (`hdmi`):** `name.startswith("alsa_output.pci-")` and `"hdmi"` in `name.lower()` (covers `hdmi-stereo`, `hdmi-stereo-extra1`, `hdmi-surround`, etc.) — second priority (`priority = 2`) in `"auto"` mode.
- **Internal / Other:** `acp5x`, `analog-stereo`, etc. — not auto-selected in `"auto"` mode, but selectable if user explicitly picks a specific sink in `dock_target_sink` (`D-01`).

### Pattern 2: Enriching `get_audio_sinks()` for Both Settings Cards
**What:** `AudioSinkInfo` in `src/types.ts:146-150` is defined as:
```typescript
export interface AudioSinkInfo {
  name: string;
  description: string;
  is_default: boolean;
}
```
`[VERIFIED: src/types.ts:146-150]`
Currently, `_get_pactl_sinks()` in `py_modules/engine.py:103-127` only runs `pactl list short sinks` and returns `{ "id", "name", "module", "spec", "state" }` `[VERIFIED: py_modules/engine.py:118-124]`.
**How to fix cleanly:** Add a helper (e.g., `get_detailed_sinks()` in `py_modules/dock.py` or `py_modules/volume.py`) that:
1. Runs `pactl list sinks` (or `pactl list short sinks` + `pactl list sinks` for `Description:` lines) via `_build_deck_command` (stripping `LD_LIBRARY_PATH`).
2. Runs `pactl get-default-sink` to determine `default_sink_name`.
3. Filters out `EQ_SINK_NAME` (`"deckify_eq_sink"`).
4. Returns `[{ "name": ..., "description": ..., "is_default": name == default_sink_name, "kind": "usb"|"hdmi"|"bluetooth"|"internal", "state": ... }]`.
Note: Keep `_get_pactl_sinks()` backward-compatible in `py_modules/engine.py` in case existing tests mock or call it directly, and enrich inside `volume.get_audio_sinks()`.

### Pattern 3: `DockAudioSwitcher` State Machine & Override Precedence
**What:** Explicit state tracking in `DockAudioSwitcher` so Bluetooth hold, Bluetooth disconnect re-evaluation, manual override, and undock restoration never fight each other:
- **State fields:**
  - `_docked_sink: str | None` — the sink name we are currently docked to (or actively monitoring as connected dock session).
  - `_dock_session_sink: str | None` — tracks the connected dock sink even when held by Bluetooth or manual override, so we know when the dock physically disconnects (undock) to clear `_manual_override`.
  - `_pre_dock_sink: str | None` — captured before auto-switching (`_resolve_current_deckify_sink()` or `default_sink`), used for `D-07` restoration on undock.
  - `_manual_override: bool` — set to `True` when `set_audio_sink(..., is_auto_dock=False)` is called while docked (`D-06`), or if Deckify's stream is moved to a non-dock sink externally while the dock sink remains connected. Cleared only on undock (dock sink disappears) or when `dock_auto_switch_enabled` / `dock_target_sink` is changed.
  - `_status: str` — one of `"disabled"`, `"monitoring"`, `"docked"`, `"bluetooth_held"`, `"manual_override"` (matching `16-UI-SPEC.md:109-114`).
- **Status payload (`get_status_dict()`):**
  ```python
  {
      "status": self._status,              # "disabled" | "monitoring" | "docked" | "bluetooth_held" | "manual_override"
      "active_sink": self._docked_sink,    # sink name or None
      "active_sink_label": active_label,   # human description or sink name or ""
      "pre_dock_sink": self._pre_dock_sink,
      "manual_override": self._manual_override,
  }
  ```
- **Bluetooth check (`D-04`, `D-05`):**
  Before switching to a dock sink, if `dock_respect_bluetooth` is `True`: check if `default_sink.startswith("bluez_output.")` OR Deckify's current sink-input (`librespot` or `effect_output.deckify_eq`) is currently routed to a `bluez_output.*` sink. If so, set `_status = "bluetooth_held"` and `_dock_session_sink = target_dock_sink` without switching. When BT later disconnects, `pactl subscribe` fires `remove` on `sink`, debounces, sees BT is gone and `target_dock_sink` is still present, and switches!

### Pattern 4: `bit_perfect_clock` Coordination (`D-08`)
**What:** `volume.configure_pipewire_clock(unlock_lossless: bool)` in `py_modules/volume.py:112-120` sets `pw-metadata -n settings 0 clock.allowed-rates` to `"[ 44100 48000 88200 96000 ]"` when `True` and `"[ 48000 ]"` when `False` `[VERIFIED: py_modules/volume.py:112-120]`.
**When to call:**
- **On dock switch:** If `bool(plugin._settings.get("bit_perfect_clock", True))` is `True` and the target sink is a USB-DAC or HDMI sink (or any designated dock sink), call `await volume.configure_pipewire_clock(True)`.
- **On undock restore (or disabling `dock_auto_switch_enabled` while docked):** Call `await volume.configure_pipewire_clock(False)` so `clock.allowed-rates` resets to `[ 48000 ]` for internal `acp5x` speakers and Bluetooth (`D-08`).

### Pattern 5: Settings & Event Sync
**`DEFAULT_SETTINGS` keys (`py_modules/common.py`):**
- `"dock_auto_switch_enabled": False` (`16-UI-SPEC.md:118`)
- `"dock_target_sink": "auto"` (`16-CONTEXT.md:17`, `16-UI-SPEC.md:130`)
- `"dock_respect_bluetooth": True` (`16-CONTEXT.md:22`, `16-UI-SPEC.md:120`)
- `"dock_pause_on_undock": False` (`16-CONTEXT.md:29`, `16-UI-SPEC.md:122`)
- `"dock_toast_enabled": True` (`16-CONTEXT.md:33`, `16-UI-SPEC.md:124`)

**`main.py` integration:**
- Add the 5 `dock_*` keys to `public_keys` in `get_status()` (`main.py:508-524`) and include `"dock_status": self._dock_switcher.get_status_dict()` in `get_status()` return dict.
- In `set_setting()` (`main.py:553-700`): validate `dock_auto_switch_enabled`, `dock_respect_bluetooth`, `dock_pause_on_undock`, `dock_toast_enabled` as booleans; validate `dock_target_sink` as non-empty string without control characters or leading `-` (default `"auto"`). Trigger `await self._dock_switcher.on_settings_changed(key, value)` when any `dock_*` or `bit_perfect_clock` key changes.
- In `_main()` (`main.py:152-160`): instantiate `self._dock_switcher = dock.DockAudioSwitcher(self)` and call `self._dock_switcher.start()` (after `_equalizer_manager` and `start_librespot()`).
- In `_unload()` (`main.py:161-185`): call `await self._dock_switcher.stop()` and set `self._dock_switcher = None`.
- Emit `decky.emit("dock_audio_switched", {...})` on dock/undock/error so `SettingsTab.tsx` refreshes `dock_status` and `src/index.tsx` (or `SettingsTab.tsx`) shows the toast when `dock_toast_enabled` is `True`.

### Anti-Patterns to Avoid
- **Moving all sink-inputs with `pactl`:** Never iterate over all sink-inputs; always route via `volume.set_audio_sink()` / `_set_pactl_sink_input()` so `steamwebhelper`, `Chromium`, and game audio stay untouched.
- **Breaking EQ on dock:** Never call `_set_pactl_sink_input(target)` directly when `eq_mgr.is_active` is `True`; `volume.set_audio_sink()` already calls `eq_mgr.on_sink_changed(target)` `[VERIFIED: py_modules/volume.py:156-158]`.
- **Inheriting `LD_LIBRARY_PATH`:** Always use `_build_deck_command()` and `env.pop("LD_LIBRARY_PATH", None)` before spawning `pactl subscribe`, `pactl list sinks`, or `pw-metadata`.
- **Toast duplication:** Only one frontend listener (`src/index.tsx` global listener) should fire `showToast` on `dock_audio_switched`, while `SettingsTab.tsx` should only refresh `status` / `audioSinks` on `dock_audio_switched` — otherwise opening SettingsTab would show duplicate toasts.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Stream-isolated sink-input moving | Custom `pactl list sink-inputs` parser | `volume.set_audio_sink(target, plugin)` | Already handles `EqualizerManager.is_active` and `steamwebhelper`/`Chromium` deny-list `[VERIFIED: py_modules/volume.py:149-163]`. |
| PipeWire sample rate unlock/reset | Custom `pw-metadata` subprocess call | `volume.configure_pipewire_clock(bool)` | Already strips `LD_LIBRARY_PATH` via `_build_deck_command` and logs errors `[VERIFIED: py_modules/volume.py:112-120]`. |
| UID 1000 subprocess env setup | Manual `runuser` / `PULSE_SERVER` / `XDG_RUNTIME_DIR` | `_build_deck_command` (`py_modules/common.py:352-372`) | Handles root-to-`deck` privilege drop and runtime dir env vars `[VERIFIED: py_modules/common.py:352-372]`. |

## Common Pitfalls

### Pitfall 1: Hotplug Event Storms During USB-C / HDMI Docking
**What goes wrong:** Plugging in a Steam Deck Dock emits 3–8 `pactl subscribe` events over ~1.5 seconds (USB-C PD, DisplayPort ELD, USB-DAC enumeration) while sinks briefly appear as `SUSPENDED`.
**How to avoid:** Cancel and reschedule a single `_debounce_task` (`asyncio.sleep(1.8)`) on each `sink` or `server` event from `pactl subscribe`. Re-query `get_detailed_sinks()` after the debounce settles and verify the target sink still exists before switching.
**Warning signs:** Rapid back-and-forth toast notifications or `pactl move-sink-input` failing with `No such entity`.

### Pitfall 2: `deckify_eq_sink` Listed as a Target Sink or Captured as `_pre_dock_sink`
**What goes wrong:** When EQ is active, `pactl list short sinks` includes `deckify_eq_sink`. If selected as `_pre_dock_sink` or shown in `SettingsTab.tsx`, undocking would try to route `effect_output.deckify_eq` into `deckify_eq_sink` (feedback loop / silence).
**How to avoid:** Filter out `EQ_SINK_NAME` (`"deckify_eq_sink"`) in `get_detailed_sinks()`, and when capturing `_pre_dock_sink` while EQ is active, read `eq_mgr._target_hardware_sink` (or `pactl get-default-sink`) instead of `librespot`'s sink.

### Pitfall 3: Undocking Leaves `clock.allowed-rates` Unlocked
**What goes wrong:** `bit_perfect_clock` unlocks `[ 44100 48000 88200 96000 ]` for a 44.1kHz USB-DAC, then undocking returns audio to `acp5x` internal speakers or Bluetooth, causing audible crackling (`D-08`, `[CITED: .planning/research/PITFALLS.md:87-95]`).
**How to avoid:** Always call `await volume.configure_pipewire_clock(False)` on undock (and when `dock_auto_switch_enabled` is turned off while docked).

### Pitfall 4: `pactl subscribe` Missing Binary / Tight Restart Loop in Tests
**What goes wrong:** If `pactl` is missing (e.g., Windows/CI unit test environment) and `_monitor_loop()` catches an exception without checking `shutil.which("pactl")`, it can spam logs or spin.
**How to avoid:** Check `shutil.which("pactl")` (just like `SuspendResumeMonitor` checks `busctl` in `py_modules/device.py:115-117`) and back off cleanly (`asyncio.sleep(5.0)`) on unexpected subprocess exit.

### Pitfall 5: Duplicate Toasts Between `src/index.tsx` and `SettingsTab.tsx`
**What goes wrong:** Both `src/index.tsx` and `SettingsTab.tsx` subscribe to `dock_audio_switched` and both call `toaster.toast` / `showToast`.
**How to avoid:** Handle toast display once in `src/index.tsx` (checking `settingsRef.current?.dock_toast_enabled ?? true`) so toasts work even when the modal is closed, and have `SettingsTab.tsx` only refresh `status` and `audioSinks` on `dock_audio_switched`.

## Code Examples

### `pactl subscribe` Async Subprocess Pattern (Adapted from `SuspendResumeMonitor`)
```python
# Source: py_modules/device.py:121-160 + py_modules/common.py:352-372
cmd, env = _build_deck_command(["pactl", "subscribe"])
env.pop("LD_LIBRARY_PATH", None)
self._proc = await asyncio.create_subprocess_exec(
    *cmd,
    env=env,
    stdout=asyncio.subprocess.PIPE,
    stderr=asyncio.subprocess.DEVNULL,
)
while self._running:
    line = await self._proc.stdout.readline()
    if not line:
        break
    text = line.decode("utf-8", errors="ignore").lower()
    if " on sink " in text or " on server " in text:
        self._schedule_debounced_evaluate()
```

### `pactl list sinks` Description Parsing
```python
# Parses Sink #N blocks from `pactl list sinks` for Name: and Description:
# Used to populate AudioSinkInfo { name, description, is_default }
for block in stdout.split("Sink #"):
    if not block.strip():
        continue
    name_m = re.search(r"^\s*Name:\s*(.+)$", block, re.MULTILINE)
    desc_m = re.search(r"^\s*Description:\s*(.+)$", block, re.MULTILINE)
    ...
```

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python (`py`) | Backend unit tests (`unittest`) | ✓ | 3.14.0 | — |
| Node / Vitest | Frontend unit tests (`vitest`) | ✓ | Vitest 5.1.0 | — |
| `pactl` / `pw-metadata` | SteamOS runtime only (Linux) | ✗ (Windows dev host) | — | Mocked via `unittest.mock` in `tests/test_dock.py` |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Python Framework | `unittest` (Python 3.14.0 on Windows dev host; `python3` on Linux/CI) |
| TypeScript Framework | `vitest` 5.1.0 |
| Config file | `package.json` (`test`, `test:python`) |
| Quick run command | `npx vitest run src/components/tabs/SettingsTab.test.tsx` and `py -m unittest discover -s tests -p test_dock.py -v` |
| Full suite command | `npx vitest run` and `py -m unittest discover -s tests -p "test_*.py"` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DOCK-01 | `DockAudioSwitcher` sink classification (`USB-DAC > HDMI`), hotplug debounce, Bluetooth hold/disconnect re-eval, manual override persistence, EQ isolation (`on_sink_changed`), and `SettingsTab.tsx` Docked Audio-Switching UI | unit | `py -m unittest discover -s tests -p test_dock.py -v` & `npx vitest run src/components/tabs/SettingsTab.test.tsx` | ❌ Wave 0 (`tests/test_dock.py`) / ✅ (`SettingsTab.test.tsx` exists, extend) |
| DOCK-02 | `bit_perfect_clock` unlock (`[ 44100 48000 88200 96000 ]`) on dock, pre-dock sink restoration (`@DEFAULT_SINK@` fallback) + `[ 48000 ]` clock reset on undock, `dock_pause_on_undock` | unit | `py -m unittest discover -s tests -p test_dock.py -v` | ❌ Wave 0 (`tests/test_dock.py`) |

### Sampling Rate
- **Per task commit:** `py -m unittest discover -s tests -p test_dock.py -v` / `npx vitest run src/components/tabs/SettingsTab.test.tsx`
- **Per wave merge:** `npx vitest run && py -m unittest discover -s tests -p "test_*.py"`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/test_dock.py` — covers `DOCK-01` & `DOCK-02` (`DockAudioSwitcher`, sink enrichment, `main.py` RPC/settings integration)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | yes | Drop root (UID 0) to `DECK_UID` (1000) via `_build_deck_command()` for all `pactl` / `pw-metadata` subprocesses |
| V5 Input Validation | yes | Reject empty/control-char/`-`-prefixed `dock_target_sink` and `sink_name` strings; pass args as `list[str]` without shell interpolation |
| V6 Cryptography | no | — |

### Known Threat Patterns for PipeWire / Subprocess Routing

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Argument injection via `dock_target_sink` | Tampering | Validate `sink_name` against `not sink_name.strip().startswith("-")` and verify sink exists in `get_detailed_sinks()` before `pactl move-sink-input` |
| Root-owned runtime files / `LD_LIBRARY_PATH` conflict | Elevation / DoS | Always use `_build_deck_command()` + `env.pop("LD_LIBRARY_PATH", None)` |

## Sources

### Primary (HIGH confidence)
- In-repo files: `py_modules/volume.py`, `py_modules/equalizer.py`, `py_modules/engine.py`, `py_modules/common.py`, `py_modules/device.py`, `main.py`, `src/types.ts`, `src/components/tabs/SettingsTab.tsx`, `src/index.tsx`
- Phase artifacts: `.planning/phases/16-automatic-docked-audio-switching/16-CONTEXT.md`, `.planning/phases/16-automatic-docked-audio-switching/16-UI-SPEC.md`
- Milestone research: `.planning/research/ARCHITECTURE.md`, `.planning/research/PITFALLS.md`, `.planning/research/SUMMARY.md`

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified directly against existing `py_modules/volume.py`, `equalizer.py`, and `common.py`.
- Architecture: HIGH — `EqualizerManager.on_sink_changed`, `volume.set_audio_sink`, and `volume.configure_pipewire_clock` are already implemented and tested.
- Pitfalls: HIGH — sink enrichment gap (`AudioSinkInfo.description`/`is_default` vs `_get_pactl_sinks`) and EQ/clock edge cases verified directly in code.

**Research date:** 2026-11-16
**Valid until:** 2026-12-16
