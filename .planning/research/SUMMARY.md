# Project Research Summary

**Project:** Deckify (v0.6 — Audio DSP, Docked Flow & System Resilience)
**Domain:** SteamOS 3.5+ / Decky Loader Spotify Client, PipeWire Audio DSP, D-Bus/MPRIS2, & Event-Driven Daemon IPC
**Researched:** 2026-11-16
**Confidence:** HIGH

## Executive Summary

Deckify v0.6 transitions the plugin from a polling-based Spotify controller with stubbed audio settings into a low-latency, stream-isolated SteamOS audio subsystem. Across all six v0.6 deliverables—fixing the Spotify Like button HTTP 403, delivering real PipeWire biquad EQ (`EQ-01`), adding automatic docked USB-DAC/HDMI audio switching (`DOCK-01`), replacing 3-second Web API polling with `librespot --onevent` + suspend/Wi-Fi resilience, exposing an MPRIS2 D-Bus bridge for Bluetooth headset controls, and adding a 30-second sleep timer fade-out—the research converges on a zero-dependency approach: every capability uses binaries already shipped on SteamOS 3.5+ (`pipewire`, `pw-cli`, `pw-dump`, `pw-metadata`, `pactl`, `busctl`) or pure-Python stdlib/vendored code with zero C extensions or runtime `pip install` steps.

The recommended architecture preserves Deckify's strict SteamOS boundaries: `main.py` remains the central coordinator while four focused modules (`py_modules/equalizer.py`, `py_modules/dock.py`, `py_modules/resilience.py`, `py_modules/mpris.py`) encapsulate the new subsystems, paired with targeted fixes to `py_modules/rpc_playback.py`, `py_modules/engine.py`, `py_modules/volume.py`, and `py_modules/system.py`. Rather than restarting `pipewire.service` or hijacking system default sinks (which severs game audio and `steamwebhelper` UI clicks), EQ runs as a managed `pipewire -c` child process under the `deck` user (UID 1000) and routes only Deckify's stream.

The primary risks in v0.6 are SteamOS-specific privilege and audio-graph collisions: (1) Decky Loader runs Python as `root` (UID 0), which fails D-Bus `EXTERNAL` auth on `/run/user/1000/bus` unless MPRIS2 runs as UID 1000 via `_build_deck_command`; (2) `py_modules/engine.py:_set_pactl_sink_input()` currently moves all sink-inputs indiscriminately and must be hardened to filter out `steamwebhelper`/`Chromium` before `EQ-01` and `DOCK-01` ship; (3) `EQ-01`, `DOCK-01`, and `VolumeFader` share the same audio chain (`librespot` → `deckify_eq_sink` → hardware sink), so docked switching must move the EQ output stream when EQ is active; and (4) `librespot --onevent` and `SuspendResumeMonitor` must avoid blocking audio transitions or racing Wi-Fi reconnection on wake.

## Key Findings

### Recommended Stack

Deckify v0.6 requires **zero new npm packages** and **zero runtime pip dependencies**, keeping the Decky plugin bundle self-contained and compatible with Decky's PyInstaller Python 3.11+ runtime (`LD_LIBRARY_PATH` stripped via `_build_deck_command`). See [STACK.md](file:///C:/Users/djdje/Deckify/.planning/research/STACK.md).

**Core technologies:**
- **Spotify Web API `/v1/me/library`**: Unified library endpoints (`PUT/DELETE /v1/me/library?uris=...`, `GET /v1/me/library/contains?uris=...`, max 40 URIs) — fixes silent HTTP 403 on deprecated `/v1/me/tracks` in 2026 Development Mode apps.
- **PipeWire `filter-chain` (`pipewire -c`) + `pw-cli` / `pw-dump`**: Isolated user subprocess with built-in `bq_lowshelf`, `bq_peaking`, and `bq_highshelf` nodes — delivers real-time biquad EQ (`EQ-01`) with live `pw-cli set-param` updates and zero `pipewire.service` restarts.
- **`pactl` (`libpulse` utils) + `pw-metadata`**: Targeted sink-input routing (`DOCK-01`), `bit_perfect_clock` (`clock.allowed-rates`), and local 30s sleep fade via existing `VolumeFader`.
- **`librespot --onevent` + `asyncio.start_unix_server`**: Local Unix domain socket push for `PLAYER_EVENT` / `TRACK_ID` / `POSITION_MS` — eliminates tight Web API polling and 429 rate limits.
- **Pure-Python D-Bus (`dbus-next` vendored or stdlib `asyncio` wire bridge)**: Exposes `org.mpris.MediaPlayer2.deckify` on `/run/user/1000/bus` without `dbus-python`/`PyGObject` C-extension conflicts.

### Expected Features

All six v0.6 items are P1 deliverables that either fix broken/stubbed user expectations or deliver high-value Steam Deck/Steam Machine workflows. See [FEATURES.md](file:///C:/Users/djdje/Deckify/.planning/research/FEATURES.md).

**Must have (table stakes):**
- **Reliable Like / Save Track (403 Fix)** — `toggle_like_track` and `check_tracks_liked` must succeed via `/v1/me/library` without silent 403 failures.
- **Working Equalizer Presets (`EQ-01` Base)** — Existing `Flat`, `Bass Boost`, `Vocal Clarity`, and `Gaming Balance` pills in `SettingsTab.tsx` must audibly filter Deckify's stream.
- **Bluetooth Headset Play/Pause/Skip (`MPRIS2`)** — AVRCP media keys routed via BlueZ `mpris-proxy` to `org.mpris.MediaPlayer2.deckify`.
- **Resilient Playback Across Sleep & Wi-Fi Drops** — `PrepareForSleep` bookmark persistence + network-ready reconnect without dual-restart races.
- **Gentle Sleep Timer Fade-Out** — 30-second local PipeWire cosine ramp-down before pause, followed by baseline volume restore.

**Should have (competitive differentiators):**
- **Custom 5-Band EQ Sliders (`EQ-01` Pro)** — Optional `Custom` preset revealing 60Hz, 230Hz, 910Hz, 3.6kHz, 14kHz (±12 dB) `SliderField` controls in `SettingsTab.tsx`.
- **Automatic Docked Audio-Switching (`DOCK-01`) + `bit_perfect_clock`** — `pactl subscribe` hotplug watcher moving only Deckify's stream to configured USB-DAC/HDMI sinks.
- **Event-Driven `librespot` (`--onevent`) via `decky.emit`** — Sub-100ms track/play-state updates to QAM, HUD Overlay 2.0, and MPRIS2.

**Defer (v2+):**
- **10-band Parametric EQ with Q-factor/frequency editing & AutoEQ import** — excessive controller navigation complexity for handheld use.
- **Per-App / Per-Game EQ Profiles** — defer until base `EQ-01` stability is proven.

### Architecture Approach

v0.6 extends Deckify's three-layer architecture (React GamepadUI ↔ `@decky/api` RPC/Events ↔ Python Backend + SteamOS Host Services) with four new `py_modules/` managers and one lightweight `--onevent` hook script, keeping each module under ~350 LOC and independently unit-testable. See [ARCHITECTURE.md](file:///C:/Users/djdje/Deckify/.planning/research/ARCHITECTURE.md).

**Major components:**
1. **`py_modules/rpc_playback.py` & `py_modules/volume.py` + `engine.py`** — Migrates `me/tracks` → `me/library` and centralizes PID/application-filtered `resolve_spotify_sink_input_ids()` (excluding `steamwebhelper` and `Chromium`).
2. **`py_modules/system.py` (`sleep_timer_worker`)** — Coordinates with `VolumeFader` for 30s cosine fade-out, pause/drain, and baseline volume restore.
3. **`py_modules/equalizer.py` (`EqualizerManager`)** — Supervises `pipewire -c` `deckify_eq_sink` (`bq_lowshelf`, `bq_peaking`, `bq_highshelf`) and throttled `pw-cli set-param` live updates.
4. **`py_modules/dock.py` (`DockAudioSwitcher`)** — Watches `pactl subscribe` sink events, debounces hotplugs, moves `effect_output.deckify_eq` (or `librespot` if EQ bypassed), and scopes `bit_perfect_clock` to wired/DAC/HDMI sinks.
5. **`py_modules/resilience.py` (`LibrespotEventServer`, `SessionBookmarkManager`)** — Hosts `onevent.sock` (`asyncio.start_unix_server`), relaxes `_poll_api_loop` from 3s to 20s when `--onevent` is healthy, and unifies sleep/Wi-Fi bookmark recovery.
6. **`py_modules/mpris.py` (`MprisBridge`)** — Runs `org.mpris.MediaPlayer2.deckify` on the `deck` user session D-Bus and bridges AVRCP commands to `control_playback`.

### Critical Pitfalls

1. **Restarting PipeWire or moving all sink-inputs breaks game audio & Steam UI clicks** — Never touch `~/.config/pipewire/pipewire.conf.d/` or call `systemctl --user restart pipewire`. Run `pipewire -c` as a child process with `priority.session = 0` and fix `_set_pactl_sink_input()` to exclude `steamwebhelper`/`Chromium`. See [PITFALLS.md](file:///C:/Users/djdje/Deckify/.planning/research/PITFALLS.md).
2. **`DOCK-01` bypassing `EQ-01` & `bit_perfect_clock` sample-rate lockouts** — Move `effect_output.deckify_eq` when EQ is active (not `librespot` off the EQ), debounce dock hotplugs by 1.5–2.0s, and reset `clock.allowed-rates` to `[ 48000 ]` when undocking to internal speakers or Bluetooth.
3. **`librespot --onevent` blocking & dual suspend-recovery races** — Keep the `--onevent` hook ultra-lightweight (<5–10ms, non-blocking socket write) so rapid track skipping never stutters audio; consolidate `SuspendResumeMonitor` and `_monitor_process` behind an `asyncio.Lock` and wait for Wi-Fi/DNS readiness before restoring the session bookmark.
4. **MPRIS2 D-Bus UID 0 `EXTERNAL` auth rejection** — Decky runs as `root` (UID 0), which `/run/user/1000/bus` rejects. Spawn the MPRIS2 D-Bus helper under `deck` (UID 1000) via `_build_deck_command` with zero C-extension dependencies.
5. **Sleep timer fade-out clobbered by ducking or loud restore pop** — Give `VolumeFader` a `"sleep"` priority lock so game/voice ducking cannot override it; pause/mute first and wait 600–800ms for audio drain before restoring baseline volume (and before `systemctl poweroff`).

## Implications for Roadmap

Based on dependencies and risk, a **6-phase roadmap** is recommended:

### Phase 1: Like Button 403 Fix & Sink-Input Guardrails
**Rationale:** Immediate high-impact fix for a broken core action (`toggle_like_track` 403) combined with hardening the shared `resolve_spotify_sink_input_ids()` / `_set_pactl_sink_input()` foundation that Phases 2, 3, and 4 all depend on.
**Delivers:** Working Like/Unlike & batch liked-status checks via `/v1/me/library`, plus Steam-UI-safe sink-input filtering.
**Addresses:** Reliable Like / Save Track (`FEATURES.md`).
**Avoids:** Spotify `me/tracks` 403 deprecation & 40-URI batch overflow (`PITFALLS.md`); `steamwebhelper` contamination (`PITFALLS.md`).

### Phase 2: Gentle Sleep Timer Fade-Out
**Rationale:** Low-risk vertical slice that builds directly on existing `VolumeFader` and `sleep_timer_worker` without waiting on PipeWire filter-chain or D-Bus subsystems.
**Delivers:** 30-second cosine-eased PipeWire fade-out, `"sleep"` fade priority lock, post-pause baseline volume restore (including on cancel and before `shutdown_on_finish`), and `SettingsTab.tsx` toggle.
**Uses:** `VolumeFader` (`py_modules/volume.py`), `sleep_timer_worker` (`py_modules/system.py`).
**Avoids:** Ducking clobbering sleep fade, 200ms loud restore pop, and 0% `module-stream-restore` persistence across reboots (`PITFALLS.md`).

### Phase 3: Real PipeWire Biquad Equalizer (`EQ-01`)
**Rationale:** Depends on Phase 1's hardened sink-input resolver and must be in place before `DOCK-01` (Phase 4) can coordinate routing of `effect_output.deckify_eq`.
**Delivers:** `py_modules/equalizer.py` (`pipewire -c` managed subprocess), working `Flat` (bypass), `Bass Boost`, `Vocal Clarity`, and `Gaming Balance` presets, plus `Custom` 5-band sliders with throttled `pw-cli set-param` live updates in `SettingsTab.tsx`.
**Implements:** `EqualizerManager` (`ARCHITECTURE.md`).
**Avoids:** Restarting `pipewire.service`, hijacking `@DEFAULT_SINK@`, unthrottled `pw-cli` subprocess spam, and EQ preamp clipping (`PITFALLS.md`).

### Phase 4: Automatic Docked Audio-Switching (`DOCK-01`)
**Rationale:** Directly coordinates with Phase 3's `EqualizerManager` (`set_target_sink`) and Phase 1's sink-input filter.
**Delivers:** `py_modules/dock.py` (`pactl subscribe` hotplug watcher with 1.5–2s debounce), per-sink auto-switch preferences in `SettingsTab.tsx`, Bluetooth override guard, and sink-scoped `bit_perfect_clock` (`44.1/88.2/96kHz` on DAC/HDMI, `[ 48000 ]` on internal/BT).
**Implements:** `DockAudioSwitcher` (`ARCHITECTURE.md`).
**Avoids:** Moving `librespot` off the EQ graph, hotplug flapping, and sample-rate crackling on undock (`PITFALLS.md`).

### Phase 5: Event-Driven `librespot` (`--onevent`) & Suspend/Wi-Fi Resilience
**Rationale:** Replaces 3s Web API polling with local Unix socket push events and provides instant, accurate state/position snapshots needed by both session bookmarking and Phase 6's MPRIS2 bridge.
**Delivers:** Lightweight `--onevent` hook + `py_modules/resilience.py` (`LibrespotEventServer`, `SessionBookmarkManager`), Base16→Base62 `TRACK_ID` conversion, adaptive 20s fallback polling, unified `asyncio.Lock` suspend/wake recovery with Wi-Fi/DNS readiness wait, and `SettingsTab.tsx` toggle/status.
**Implements:** `LibrespotEventServer` & `SessionBookmarkManager` (`ARCHITECTURE.md`).
**Avoids:** Heavy `--onevent` cold-start audio stutters and dual `SuspendResumeMonitor` / `_monitor_process` wake races (`PITFALLS.md`).

### Phase 6: MPRIS2 D-Bus Bridge (`org.mpris.MediaPlayer2.deckify`)
**Rationale:** Benefits from Phase 5's instant `--onevent` state push for zero-lag AVRCP metadata/playback updates and is cleanly isolated as the final subsystem.
**Delivers:** `py_modules/mpris.py` running under `deck` (UID 1000) via `_build_deck_command`, vendored pure-Python `dbus-next` (or stdlib D-Bus bridge), `Play`/`Pause`/`PlayPause`/`Next`/`Previous` AVRCP handling, `mpris-proxy` status detection, and `SettingsTab.tsx` toggle.
**Implements:** `MprisBridge` (`ARCHITECTURE.md`).
**Avoids:** UID 0 D-Bus `EXTERNAL` auth rejection, C-extension `LD_LIBRARY_PATH` crashes, and 1s `PropertiesChanged` battery drain (`PITFALLS.md`).

### Phase Ordering Rationale

- **Dependency chain:** Phase 1 hardens `resolve_spotify_sink_input_ids()` before Phases 2–4 touch sink-inputs; Phase 3 creates `deckify_eq_sink` before Phase 4 routes its output stream; Phase 5 delivers `--onevent` push state before Phase 6 binds MPRIS2 `PropertiesChanged` to it.
- **Risk-first delivery:** Quick, high-value fixes (Like 403, Sleep Fade) ship first while higher-complexity PipeWire/D-Bus integrations are isolated into single-subsystem phases.

### Research Flags

Phases likely needing deeper research/validation during planning:
- **Phase 3 (`EQ-01`):** Verify exact SteamOS 3.5+/3.7+ PipeWire `filter-chain` `pw-dump` node naming and `pw-cli set-param` `Props` syntax on target hardware.
- **Phase 5 (`--onevent`):** Benchmark POSIX shell (`socat`/`nc`) vs minimal Python hook execution latency (<10ms target) and verify `librespot` `--onevent` flags in the bundled `bin/librespot` binary.
- **Phase 6 (`MPRIS2`):** Confirm vendored `dbus-next` footprint vs minimal stdlib `AF_UNIX` D-Bus `EXTERNAL` server, and verify BlueZ `mpris-proxy` behavior inside SteamOS Gamescope sessions.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Like 403 & Sink-Input Filter):** Exact Spotify `/v1/me/library` contract and `VolumeFader.resolve_sink_input_id()` pattern are already verified in the codebase.
- **Phase 2 (Sleep Timer Fade-Out):** Directly reuses existing `VolumeFader.fade_to()` and `sleep_timer_worker()`.
- **Phase 4 (`DOCK-01`):** Uses standard `pactl subscribe`, `pactl move-sink-input`, and existing `configure_pipewire_clock()`.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All binaries (`pipewire`, `pw-cli`, `pactl`, `busctl`) and existing codebase primitives verified directly. |
| Features | HIGH | Cross-checked against `SettingsTab.tsx`, `PROJECT.md`, 2026 Spotify API spec, and SteamOS PipeWire/BlueZ specs. |
| Architecture | HIGH | Aligns with existing `py_modules/` modularization and SteamOS UID/CSP/stream-isolation constraints. |
| Pitfalls | HIGH | Grounded in direct inspection of `py_modules/engine.py`, `volume.py`, `system.py`, `device.py`, and `main.py`. |

**Overall confidence:** HIGH

### Gaps to Address

- **`--onevent` hook implementation (`bin/librespot-event.py` vs POSIX `sh` + `socat`/`nc`):** `ARCHITECTURE.md` suggests a minimal stdlib Python script while `PITFALLS.md` and `FEATURES.md` warn that spawning Python takes 150–400ms on Steam Deck. Resolve during Phase 5 planning by preferring a POSIX `#!/bin/sh` + `nc`/`socat` (or compiled) emitter and benchmarking on-device.
- **Bundled `bin/librespot` `--onevent` support & `mpris-proxy` status in Gamescope:** Verify the exact `librespot` binary version/flags and whether `mpris-proxy.service` is active by default in SteamOS 3.5+/3.7+ Gaming Mode during Phases 5 and 6.
- **PipeWire `filter-chain` `pw-cli` node ID & `Gain` param format:** Confirm exact `pw-dump` JSON structure and `pw-cli set-param` syntax against SteamOS's installed PipeWire version during Phase 3 planning.

## Sources

### Primary (HIGH confidence)
- Deckify codebase (`main.py`, `py_modules/volume.py`, `py_modules/engine.py`, `py_modules/device.py`, `py_modules/system.py`, `py_modules/rpc_playback.py`, `py_modules/common.py`, `src/components/tabs/SettingsTab.tsx`)
- Spotify Web API 2026 `/v1/me/library` & `/v1/me/tracks` deprecation documentation (`developer.spotify.com`)
- PipeWire `libpipewire-module-filter-chain`, `pw-cli`, and `pw-metadata` documentation (`docs.pipewire.org`)
- `librespot` `--onevent` environment variable specification (`github.com/librespot-org/librespot`)
- BlueZ `mpris-proxy` & MPRIS2 D-Bus specification (`org.mpris.MediaPlayer2.Player`)

---
*Research completed: 2026-11-16*
*Ready for roadmap: yes*
