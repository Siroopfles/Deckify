# Feature Research: v0.6 Audio DSP, Docked Flow & System Resilience

**Domain:** SteamOS / Linux Handheld Audio Client & Decky Loader Plugin (Spotify Connect + PipeWire DSP + System Integration)
**Researched:** 2026-11-16
**Confidence:** HIGH (verified against Deckify codebase + SteamOS/PipeWire/BlueZ/Spotify 2026 specifications)

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist or consider broken if missing. Missing or failing these causes immediate frustration.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Reliable Like / Save Track (`toggle_like_track` 403 Fix)** | Clicking Heart / pressing `X` on a track must save/remove it from Liked Songs without silent failure or 403 errors. | LOW | Spotify's Feb/Mar 2026 Web API changes restricted `PUT/DELETE /v1/me/tracks` for Development Mode apps in favor of unified `PUT/DELETE /v1/me/library?uris=spotify:track:{id}` (max 40 URIs, scope `user-library-modify`). Must also support fallback/clear diagnostic if OAuth scope is missing or Dev Mode allowlist/Premium is invalid. |
| **Working Equalizer Presets (`EQ-01` Base)** | `SettingsTab.tsx` already displays 4 EQ preset buttons (`Flat`, `Bass Boost`, `Vocal Clarity`, `Gaming Balance`), but `apply_equalizer_preset` in `py_modules/volume.py` currently only saves to `settings.json` and emits an event with zero DSP filtering. Users expect clicking a preset to audibly change the sound. | MEDIUM | Implemented via PipeWire `libpipewire-module-filter-chain` (`biquad` nodes: `bq_lowshelf`, `bq_peaking`, `bq_highshelf`) targeting *only* the Deckify (`librespot` / `spotify_client`) stream—never system-wide game audio—with live parameter updates via `pw-cli set-param` or filter-chain reload without audio dropouts. |
| **Bluetooth Headset Play/Pause/Skip (`MPRIS2` Bridge)** | On Linux/SteamOS handhelds, users expect physical play/pause/next/prev buttons on Bluetooth earbuds/headphones (AVRCP) to control active music playback. | MEDIUM | SteamOS uses BlueZ `mpris-proxy` (user systemd service) to translate AVRCP hardware events into MPRIS2 D-Bus calls (`org.mpris.MediaPlayer2.Player`). Registering `org.mpris.MediaPlayer2.deckify` on the user session D-Bus (reusing existing `DBUS_SESSION_BUS_ADDRESS` from `py_modules/common.py`) enables zero-latency local Play, Pause, PlayPause, Next, Previous, and Metadata reporting. |
| **Resilient Playback Across Sleep & Wi-Fi Drops** | Handhelds are suspended mid-session and move between Wi-Fi access points. Users expect music to resume cleanly on wake or reconnect without manually restarting the engine. | MEDIUM | `SuspendResumeMonitor` (`py_modules/device.py`) already listens for `PrepareForSleep`. On `PrepareForSleep=true`, persist a session bookmark (`track_id`, `context_uri`, `position_ms`, `was_playing`) in `settings.json`; on wake / network recovery, verify `me/player/devices` registration and silently restart `librespot` or restore playback position if the Connect session expired. |
| **Gentle Sleep Timer Fade-Out** | Abruptly cutting music to silence when a user is falling asleep is jarring. Standard audio apps (Spotify mobile, Podcast Addict, etc.) ramp volume down gradually before pausing. | LOW | `sleep_timer_worker` (`py_modules/system.py`) currently calls `control_playback("pause")` abruptly. Ramp PipeWire sink-input volume down over the final 30 seconds (reusing `VolumeFader` cosine easing in `py_modules/volume.py`), pause playback, and restore the baseline sink-input volume so the next listening session isn't stuck at 0%. |

### Differentiators (Competitive Advantage)

Features that elevate Deckify above generic Linux music players or basic Decky controls, aligned with Steam Deck / Steam Machine workflows.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Stream-Isolated PipeWire EQ + Custom Band Sliders (`EQ-01` Pro)** | Unlike system-wide EQ tools (EasyEffects, JamesDSP) that alter game SFX/dialogue or require Desktop Mode setup, Deckify applies biquad EQ *exclusively* to the music stream inside GamepadUI, with optional 5-band/parametric custom sliders in `SettingsTab.tsx` for audiophile IEMs/headphones. | MEDIUM-HIGH | Needs `SliderField` controls in `SettingsTab.tsx` (e.g., 60Hz, 230Hz, 910Hz, 3.6kHz, 14kHz ±12 dB) when `"Custom"` preset is selected, plus a `"Reset to Flat"` button and real-time `pw-cli` parameter updates. |
| **Automatic Docked Audio-Switching (`DOCK-01`) + `bit_perfect_clock`** | Docked Steam Deck / Steam Machine users frequently plug in a USB-DAC or HDMI AVR. Automatically routing *only* Deckify's stream to the configured docked sink and engaging `bit_perfect_clock` (`44100/88200/96000 Hz` via `pw-metadata`) delivers audiophile output without hijacking game audio or requiring manual QAM/Desktop tinkering. | MEDIUM | `SettingsTab.tsx` already has `Audio Output Sink` and `bit_perfect_clock` toggle, and `py_modules/engine.py` has `_get_pactl_sinks` / `_set_pactl_sink_input`. Adding a configurable background sink watcher (event-driven via `pactl subscribe` or `pw-mon` rather than tight polling) with per-sink "Auto-switch when connected" and "Enable Bit-Perfect Clock" toggles makes docked transition seamless. |
| **Event-Driven `librespot` (`--onevent`) via `decky.emit`** | Eliminates the 3-second polling lag for track/play-state updates and drastically cuts Spotify Web API calls (preventing HTTP 429 rate-limits). UI, HUD Overlay 2.0, and MPRIS2 react within milliseconds of a track change or pause. | MEDIUM | `librespot --onevent` invokes a lightweight helper script/socket passing `PLAYER_EVENT` (`playing`, `paused`, `stopped`, `changed`, `volume_set`), `TRACK_ID` (Note: 32-char Base16 hex, must be converted to Base62 for Spotify Web API), `OLD_TRACK_ID`, `POSITION_MS`, and `DURATION_MS`. Bridges directly into Python `decky.emit` and updates `MPRIS2` + `VolumeFader` state immediately. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that sound appealing on paper but introduce instability, UX friction, or architectural conflicts on SteamOS.

| Anti-Feature | Why Requested | Why Problematic | Alternative |
|--------------|---------------|-----------------|-------------|
| **System-Wide PipeWire EQ (Routing Game Audio)** | "Let me EQ my games and Spotify together from Deckify." | Mutating the default PipeWire system sink breaks Valve's built-in SteamOS audio routing, risks muting `steamwebhelper` UI sounds, adds latency to games, and conflicts with EasyEffects/Decky audio plugins. | Strictly scope `filter-chain` to the Deckify (`librespot` / `spotify_client`) sink-input only. |
| **Aggressive Global Sink Hijacking on Dock** | "Move all audio to my USB-DAC automatically whenever anything plugs in." | SteamOS/WirePlumber already manages system default sinks for games; blindly moving all sink-inputs or fighting WirePlumber's `priority.session` causes audio ping-ponging and HDMI/Bluetooth conflicts. | Route *only* the Deckify sink-input to the user's explicitly designated preferred/docked sink(s) configured in `SettingsTab.tsx`. |
| **Spotify Web API Volume Stepping for Sleep Fade** | "Fade out using `PUT /v1/me/player/volume` every second." | 30 API calls in 30 seconds triggers Spotify HTTP 429 rate limits, introduces 200ms+ cloud roundtrip jitter, and fails completely if Wi-Fi is flaky. | Perform 100% local PipeWire sink-input fading via `VolumeFader` (`pactl set-sink-input-volume`) and restore baseline volume immediately after pausing. |
| **Running `librespot --onevent` Heavy Python Interpreter per Event** | "Just set `--onevent /path/to/deckify_event.py`." | Spawning a cold Python interpreter on every seek/volume/track event adds 100–300ms CPU/IO spikes during gameplay. | Use a tiny POSIX shell/socat or `curl`/`nc` one-liner writing JSON/env to a local Unix domain socket or FIFO watched asynchronously by the already-running Deckify backend. |
| **Forcing `mpris-proxy` Systemd Edits Without User Consent** | "Automatically enable `mpris-proxy.service` on boot." | Modifying user systemd units silently can surprise users or fail under Decky's root/deck context; `mpris-proxy` may already be running or unwanted. | Register `org.mpris.MediaPlayer2.deckify` cleanly on D-Bus; check if `mpris-proxy` is active and surface a one-click status/helper in `SettingsTab.tsx` (or Diagnostics) if Bluetooth AVRCP forwarding isn't active. |

## Feature Dependencies

```
[Event-Driven librespot (--onevent)]
    ├──enhances──> [MPRIS2 D-Bus Bridge] (instant metadata/playback state push)
    ├──enhances──> [Suspend/Wi-Fi Bookmark] (accurate last-known position_ms without polling)
    └──enhances──> [HUD Overlay 2.0 & Modal UI] (instant track-change & lyrics sync)

[PipeWire VolumeFader (existing, py_modules/volume.py)]
    ├──required by──> [Gentle Sleep Timer Fade-Out] (30s cosine ramp-down + baseline restore)
    └──interacts with──> [PipeWire EQ Filter-Chain (EQ-01)] (sink-input ID resolution must track filter-chain input or librespot stream)

[PipeWire Sink Watcher (DOCK-01)]
    ├──uses──> [configure_pipewire_clock (existing, py_modules/volume.py)]
    ├──uses──> [_get_pactl_sinks / _set_pactl_sink_input (existing, py_modules/engine.py)]
    └──conflicts if unmanaged──> [PipeWire EQ Filter-Chain (EQ-01)] (if EQ creates a virtual sink, docked switching must move the EQ's playback stream, not bypass it)

[Like Button 403 Fix (rpc_playback.py)]
    └──independent──> (Standalone Spotify Web API endpoint + OAuth scope fix)
```

### Dependency Notes

- **`EQ-01` interacts with `VolumeFader` and `DOCK-01`:** When `libpipewire-module-filter-chain` is active, it creates a virtual `Audio/Sink` (`effect_input.deckify_eq`) and a playback `Audio/Stream` (`effect_output.deckify_eq`). `librespot` connects to the EQ input sink, and the EQ's output stream connects to the hardware sink (Internal Speakers, USB-DAC, or HDMI). Therefore:
  - `DOCK-01` must move the **EQ output stream** (or `librespot` directly when EQ is `flat`/bypassed) to the docked hardware sink.
  - `VolumeFader` can continue fading `librespot`'s sink-input directly, which sits upstream of the EQ and remains isolated.
- **`--onevent` enhances `MPRIS2` and `SuspendResumeMonitor`:** Without `--onevent`, `MPRIS2` `PropertiesChanged` signals and suspend bookmarks rely on the 3-second Web API poll. With `--onevent`, local `PLAYER_EVENT` and `TRACK_ID` (converted from Base16 hex to Base62) keep D-Bus metadata and bookmark state accurate even offline or between polls.
- **Sleep Timer Fade-Out depends on `VolumeFader`:** Reusing `VolumeFader.fade_to()` with a 30-second duration (and a `"sleep"` reason or dedicated fade lock) avoids duplicating `pactl` logic and prevents game/voice ducking from fighting the sleep fade. When `shutdown_on_finish` is enabled, volume should still be restored *or* saved cleanly before `systemctl poweroff` so the next boot isn't muted.

## Settings Surface & Expected UX (`SettingsTab.tsx`)

| Feature | Settings Surface in `SettingsTab.tsx` | Expected Controller / Handheld UX |
|---------|---------------------------------------|-----------------------------------|
| **Like Button 403 Fix** | No new settings; clear toast/re-auth prompt if token lacks `user-library-modify` or Dev Mode allowlist rejects. | Pressing `X` or clicking Heart toggles liked state immediately with optimistic UI + accurate sync. |
| **PipeWire EQ (`EQ-01`)** | Existing 4 preset pills (`Flat`, `Bass Boost`, `Vocal Clarity`, `Gaming Balance`) + new `Custom` pill. Selecting `Custom` reveals 5 `SliderField` band sliders (60Hz, 230Hz, 910Hz, 3.6kHz, 14kHz, -12 to +12 dB) + `Reset` button. | D-pad left/right adjusts sliders smoothly; presets apply in <100ms with zero audio pop; `Flat` bypasses filter-chain to save CPU/battery. |
| **Docked Audio-Switching (`DOCK-01`)** | New toggle in `Audio Output Sink` card: `"Auto-Switch on Dock / USB-DAC"`, sink picker to designate preferred external sink(s), and `"Auto-enable Bit-Perfect Clock when docked"` toggle. | Plugging Steam Deck into dock or connecting USB-DAC moves Deckify audio automatically within 1–2s; unplugging restores Steam Deck speakers without interrupting games. |
| **Event-Driven `librespot` & Resilience** | Optional `"Session Resilience (Auto-Restore after Sleep/Wi-Fi)"` toggle (default ON) in Playback/Engine section; diagnostic status badge showing `--onevent` active. | Transparent to user: waking from sleep or reconnecting Wi-Fi preserves track/position and keeps Connect device visible. |
| **MPRIS2 D-Bus Bridge** | Toggle `"Bluetooth Headset Controls (MPRIS2)"` (default ON) + status indicator if `mpris-proxy` is detected/missing. | Pressing play/pause/double-tap skip on AirPods, Sony WH-1000XM, or Steam Deck media keys controls Deckify instantaneously in Gaming Mode. |
| **Gentle Sleep Timer Fade-Out** | Toggle `"Gentle 30s Fade-Out"` (default ON) inside the existing `Backend Sleep Timer` card. | In the last 30s of the timer, music fades smoothly to 0%, pauses cleanly, and restores original volume. |

## MVP Definition (v0.6 Scope)

### Launch With (v0.6 Core)

- [x] **Like Button 403 Fix** — Update `toggle_like_track` (and `check_tracks_liked` if affected) to support `PUT/DELETE /v1/me/library?uris=...` with `me/tracks` fallback & actionable 403 error messaging.
- [ ] **Real PipeWire EQ (`EQ-01`)** — Wire `apply_equalizer_preset` to `libpipewire-module-filter-chain` biquad DSP for `flat` (bypass), `bass`, `vocal`, `gaming`, plus optional `custom` 5-band sliders in `SettingsTab.tsx`.
- [ ] **Automatic Docked Audio-Switching (`DOCK-01`)** — Configurable external sink watcher routing only Deckify's stream + toggling `bit_perfect_clock`.
- [ ] **Event-Driven `librespot` (`--onevent`) & Suspend/Wi-Fi Resilience** — Local Unix socket/FIFO `--onevent` listener -> `decky.emit`, plus `PrepareForSleep` bookmark save/restore and Wi-Fi reconnect watchdog.
- [ ] **MPRIS2 D-Bus Bridge** — Lightweight `org.mpris.MediaPlayer2.deckify` service on user D-Bus wired to local `librespot` / `control_playback`.
- [ ] **Gentle Sleep Timer Fade-Out** — 30s local PipeWire fade-down via `VolumeFader` before pause, followed by baseline volume restore.

### Defer Beyond v0.6

- **10-band Parametric EQ with Q-factor/frequency editing & per-headphone AutoEQ import** — High UI complexity for controller navigation; 4 presets + 5-band graphic sliders cover 95% of handheld use cases.
- **Per-App / Per-Game EQ Profiles** — Over-engineers `game_audio_profiles` before base `EQ-01` stability is proven.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| **Like Button 403 Fix** | HIGH (broken core action) | LOW | **P1** |
| **Gentle Sleep Timer Fade-Out** | HIGH (polish, reuses `VolumeFader`) | LOW | **P1** |
| **Event-Driven `librespot` (`--onevent`) & Resilience** | HIGH (fixes latency, 429s, sleep drops) | MEDIUM | **P1** |
| **PipeWire Biquad EQ (`EQ-01`)** | HIGH (delivers promised UI feature) | MEDIUM-HIGH | **P1** |
| **Docked Audio-Switching (`DOCK-01`)** | HIGH (docked/Steam Machine flow) | MEDIUM | **P1** |
| **MPRIS2 D-Bus Bridge** | MEDIUM-HIGH (Bluetooth headset UX) | MEDIUM | **P1** |

**Priority key:**
- **P1:** Must have for v0.6 milestone

## Competitor Feature Analysis (SteamOS / Linux Handheld Ecosystem)

| Feature | Decky MusicControl / Spotify Flatpak | EasyEffects / JamesDSP (Desktop) | Deckify v0.6 Approach |
|---------|--------------------------------------|----------------------------------|-----------------------|
| **Equalizer** | MusicControl has none; Spotify Flatpak has basic built-in 6-band EQ (inaccessible in GamepadUI). | Full PipeWire system-wide DSP, but requires Desktop Mode, heavy RAM, and affects game audio. | Stream-isolated PipeWire `filter-chain` biquad EQ controlled natively via GamepadUI D-pad in `SettingsTab.tsx`. |
| **Docked Audio Routing** | Relies on SteamOS/WirePlumber default sink (often swaps all game audio or fails on USB-DACs). | Manual sink routing via `pavucontrol` / `qpwgraph`. | Configurable per-sink auto-switching for Deckify's stream only + automatic `bit_perfect_clock` (`44.1/88.2/96kHz`). |
| **Bluetooth Headset Controls** | Works via Spotify Flatpak MPRIS2 (if `mpris-proxy` is active); MusicControl is UI-only. | N/A | Dedicated `org.mpris.MediaPlayer2.deckify` D-Bus service bridging AVRCP events directly to Deckify playback. |
| **Sleep / Wi-Fi Resilience** | `librespot` Connect session often drops on sleep/Wi-Fi change; Flatpak uses heavy RAM in standby. | N/A | `--onevent` local state + `PrepareForSleep` session bookmark + silent reconnect watchdog. |

## Sources

- Deckify Codebase: `src/components/tabs/SettingsTab.tsx`, `py_modules/volume.py`, `py_modules/system.py`, `py_modules/rpc_playback.py`, `py_modules/device.py`, `py_modules/common.py`, `.planning/PROJECT.md`, `.planning/IDEAS.md`.
- Spotify Web API 2026 Library Migration (`/v1/me/library` replacing `/v1/me/tracks` for Development Mode apps, `user-library-modify` scope, 40-URI limit).
- PipeWire Documentation: `libpipewire-module-filter-chain` biquad nodes (`bq_lowshelf`, `bq_peaking`, `bq_highshelf`) & WirePlumber `wpctl` / `priority.session` sink routing on SteamOS.
- `librespot` `--onevent` specification (`PLAYER_EVENT`, Base16 hex `TRACK_ID`, `POSITION_MS`, `DURATION_MS`).
- BlueZ `mpris-proxy` & MPRIS2 D-Bus specification (`org.mpris.MediaPlayer2.Player`) on SteamOS.

---
*Feature research for: Deckify v0.6 — Audio DSP, Docked Flow & System Resilience*
*Researched: 2026-11-16*
