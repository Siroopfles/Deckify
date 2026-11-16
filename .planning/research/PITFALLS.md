# Pitfalls Research

**Domain:** SteamOS / Decky Loader Audio DSP, Docked Routing, Event-Driven Playback & System Resilience (Deckify v0.6)
**Researched:** 2026-11-16
**Confidence:** HIGH (verified against current codebase `py_modules/*.py`, `main.py`, SteamOS/PipeWire architecture, and 2026 Spotify Web API documentation)

## Critical Pitfalls

### Pitfall 1: Restarting PipeWire or Hijacking Default Sink for EQ Breaks Game Audio & Steam UI Sounds

**What goes wrong:**
Installing a PipeWire `filter-chain` config into `~/.config/pipewire/pipewire.conf.d/` and running `systemctl --user restart pipewire` severs active audio streams for running games, `steamwebhelper` (SteamOS GamepadUI UI clicks), and Discord/voice chat. Worse, if the EQ virtual sink (`media.class = Audio/Sink`) is given high session priority or if `pactl` moves all sink-inputs indiscriminately, Steam UI sounds (`steamwebhelper` / `"Chromium"`) and game audio get routed through the music EQ or trapped in `module-stream-restore`.

**Why it happens:**
Developers treat SteamOS like a desktop Linux workstation where restarting `pipewire` is acceptable and where a single system-wide EQ sink is desired. On SteamOS GamepadUI, `gamescope` and `steamwebhelper` hold long-lived PipeWire streams; additionally, Deckify's existing `_set_pactl_sink_input()` in `py_modules/engine.py` (lines 130–156) currently iterates over **every** `pactl list short sink-inputs` entry and moves all of them—not just `librespot` or `spotify`!

**How to avoid:**
1. **Run `pipewire -c <eq.conf>` as a dedicated managed child process** under the `deck` user (UID 1000 via `_build_deck_command`, with `LD_LIBRARY_PATH` stripped) rather than modifying `pipewire.conf.d/` and restarting the user's PipeWire daemon. Stopping EQ cleanly terminates the child process without disturbing games.
2. **Prevent WirePlumber from making the EQ sink the system default:** Set low priority properties on `capture.props` (e.g., `priority.session = 0`, `priority.driver = 0`, `node.pause-on-idle = true`).
3. **Fix `_set_pactl_sink_input()` in `py_modules/engine.py`:** Never move all sink-inputs. Reuse the exact PID + `application.name`/`media.name` filtering and explicit `steamwebhelper`/`Chromium` exclusion already proven in `VolumeFader.resolve_sink_input_id()` (`py_modules/volume.py`, lines 180–235).

**Warning signs:**
- SteamOS GamepadUI navigation clicks suddenly sound muffled/EQ'd or go silent after enabling EQ.
- Games lose audio completely when toggling EQ in Deckify's modal.
- `pactl get-default-sink` changes to `effect_input.deckify_eq` after starting the filter-chain.

**Phase to address:**
PipeWire Equalizer (`EQ-01`) phase — must be designed into the filter-chain process supervisor and sink-input router from day one.

---

### Pitfall 2: Spotify Web API HTTP 403 on `me/tracks` Due to 2026 Development Mode Library Endpoint Migration

**What goes wrong:**
Clicking the Like/Heart button (`toggle_like_track` in `py_modules/rpc_playback.py`) fails with `HTTP 403 Forbidden` even when the user is authenticated with `user-library-modify` and `user-library-read` scopes.

**Why it happens:**
In February/March 2026, Spotify updated its Web API Development Mode policies and deprecated entity-specific library mutation endpoints (`PUT /v1/me/tracks`, `DELETE /v1/me/tracks` with `ids` parameter/body). For Development Mode apps, these legacy routes return a silent `403 Forbidden` instead of a deprecation error. `py_modules/rpc_playback.py` (lines 220–223) currently still calls `me/tracks` with `{"ids": target_id}`.

**How to avoid:**
1. **Migrate `toggle_like_track` (and `_check_tracks_liked` / `annotate_tracks_liked`) to `/v1/me/library`:**
   - Save: `PUT /v1/me/library?uris=spotify:track:{id}`
   - Remove: `DELETE /v1/me/library?uris=spotify:track:{id}`
   - Check (if affected): `GET /v1/me/library/contains?uris=...`
2. **Respect the new 40-item batch limit:** `/v1/me/library` caps requests at **40 URIs** per call (down from 50 on `/me/tracks`). Update any batching loop in `_check_tracks_liked` from chunks of 50 to chunks of 40.
3. **Keep a graceful fallback & clear auth guidance:** If a user's cached OAuth token lacks `user-library-modify` or the account is not in the Spotify Developer Dashboard allowlist (or app owner lacks Premium), surface an actionable re-auth prompt rather than a generic error.

**Warning signs:**
- `toggle_like_track(<id>) 403 Forbidden` in `decky.logger` despite valid `access_token` and `me/player` working normally.
- Batch liked-status checks failing on playlists with 41–50 tracks per page.

**Phase to address:**
Like Button 403 Fix phase (should be prioritized early as a quick, high-impact fix).

---

### Pitfall 3: `librespot --onevent` Blocking Stalls Audio & Races with Dual Suspend Monitors

**What goes wrong:**
1. **Audio dropouts on track change:** `librespot` spawns the `--onevent` command synchronously and can block its event/audio loop if the script takes >50–100ms (e.g., launching a fresh Python interpreter, importing modules, or making blocking HTTP/socket calls without timeouts).
2. **Dual suspend-recovery race:** `main.py` already has **two** separate suspend detectors: `SuspendResumeMonitor` (`py_modules/device.py`, `PrepareForSleep=false` + 1.5s sleep) AND `_monitor_process()` (`main.py` line 1510, `SUSPEND_THRESHOLD = 30s`). On wake from SteamOS sleep, both can trigger `_kill_librespot()` + `start_librespot()` back-to-back while Wi-Fi is still reconnecting.

**Why it happens:**
Spawning a heavy Python script per `--onevent` invocation takes 150–400ms on Steam Deck's CPU, and rapid track-skipping (`Next` spam) queues multiple concurrent scripts that deliver events out of order. Meanwhile, on SteamOS resume, `PrepareForSleep=false` fires immediately when the kernel wakes, **3–8 seconds before** NetworkManager finishes Wi-Fi re-association and DNS resolution.

**How to avoid:**
1. **Keep the `--onevent` binary/script ultra-lightweight and non-blocking:** Use a tiny POSIX shell script (`#!/bin/sh`) or compiled helper that writes a single JSON/key-value line to a local Unix domain socket or FIFO (with a `<100ms` timeout and backgrounded `&` fallback) so `librespot`'s child exits in <5ms. Never boot Python or run `curl` synchronously inside `--onevent`.
2. **Remember `--onevent` has no continuous position ticks:** `librespot --onevent` emits discrete state transitions (`playing`, `paused`, `stopped`, `track_changed`, `volume_set`) with `POSITION_MS` at the moment of the event. Keep frontend monotonic clock interpolation (`usePlaybackClock`) anchored to those events and only fall back to Web API polling when the active device is external (not local `librespot`).
3. **Unify suspend recovery & wait for network readiness:** Consolidate `SuspendResumeMonitor` and `_monitor_process` wake recovery behind an `asyncio.Lock` + cooldown so they never double-restart `librespot`. On `PrepareForSleep=false`, poll lightweight TCP/DNS readiness (or `nmcli networking connectivity`) with backoff up to 10s before restarting `librespot` or restoring the session bookmark.
4. **Continuously persist the session bookmark in memory/disk:** Do not wait for `PrepareForSleep=true` to query Spotify Web API (network may already be down and SteamOS suspends in milliseconds). Snapshot `(context_uri, track_uri, position_ms, is_playing)` continuously from `--onevent` / poll state, and on wake wait until `librespot` registers as an available Connect device before calling `play_tracks`.

**Warning signs:**
- Audible micro-stutters or 200ms silence gaps when skipping tracks.
- Two `Starting librespot` log lines within 2 seconds of waking the Steam Deck.
- Wake bookmark restoration failing with `404 No active device found` or `NameResolutionError`.

**Phase to address:**
Event-Driven `librespot` & Suspend/Wi-Fi Resilience phase.

---

### Pitfall 4: Docked Audio-Switching (`DOCK-01`) vs EQ-01 & `bit_perfect_clock` Sample-Rate Collisions

**What goes wrong:**
1. **Breaking the EQ graph on dock:** When `EQ-01` is active, `librespot` outputs to `effect_input.deckify_eq`, and `effect_output.deckify_eq` outputs to the hardware sink. If `DOCK-01` moves `librespot`'s sink-input directly to the new HDMI/USB-DAC sink, it bypasses the equalizer silently.
2. **USB-DAC / HDMI hotplug flapping:** Docking a Steam Deck triggers multiple PipeWire/udev sink events over 1–3 seconds (USB-C PD negotiation, DisplayPort/HDMI ELD audio sink creation, USB-DAC enumeration) while sinks briefly report `SUSPENDED` or `IDLE`.
3. **Sample-rate lockouts (`bit_perfect_clock`):** Unlocking `clock.allowed-rates = [ 44100 48000 88200 96000 ]` works on USB-DACs, but if the user undocks back to Steam Deck internal speakers (`acp5x`) or Bluetooth A2DP headphones, forcing 44.1 kHz or running a fixed-rate `filter-chain` at 48 kHz causes either hardware silence, resampling artifacts, or XRUN crackling.

**Why it happens:**
PipeWire sink switching and `filter-chain` routing interact at two different layers (`librespot` -> `eq_input` -> `eq_output` -> `hardware_sink`), and `pw-metadata clock.allowed-rates` is a global PipeWire graph setting rather than per-sink.

**How to avoid:**
1. **Route based on EQ state:** If EQ is active, `DOCK-01` must move the **filter-chain's playback stream** (`effect_output.deckify_eq`) to the target dock sink—not `librespot`'s stream. If EQ is inactive, move only `librespot`/`spotify` sink-inputs.
2. **Debounce dock sink appearance (1.5–2.0s):** Wait for the target sink to stabilize in `pactl list short sinks` before moving streams, and validate the sink still exists immediately before `move-sink-input`.
3. **Scope `bit_perfect_clock` to wired/DAC/HDMI sinks:** Automatically restore `clock.allowed-rates = [ 48000 ]` when switching to Bluetooth A2DP or internal speakers, and configure the EQ `filter-chain` with `node.force-rate = 0` (follow graph rate) or rebuild/restart only when sample rate changes.

**Warning signs:**
- EQ sliders stop affecting sound right after plugging into a Steam Deck Dock.
- Audio plays for 0.5s on dock and snaps back to internal speakers (WirePlumber default-sink race).
- Crackling/popping on 44.1 kHz tracks when undocking from a USB-DAC.

**Phase to address:**
Docked Audio-Switching (`DOCK-01`) phase (must explicitly integrate with `EQ-01` routing).

---

### Pitfall 5: MPRIS2 D-Bus Connection Rejected Due to Decky Root UID vs `deck` User Session Bus

**What goes wrong:**
Deckify's Python backend runs inside Decky Loader (`PluginLoader`) as **`root` (UID 0)**. Attempting to connect directly to `DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus` from the root process fails `EXTERNAL` SASL authentication because D-Bus checks socket peer credentials (`SO_PEERCRED` UID 0 != UID 1000). Additionally, standard Python D-Bus bindings (`dbus-python`, `PyGObject`) require C-extensions/headers unavailable in Decky's PyInstaller Python on immutable SteamOS.

**Why it happens:**
Developers test D-Bus code in a `deck` user SSH shell where `UID == 1000`, so `DBUS_SESSION_BUS_ADDRESS` works immediately—then it silently fails when launched inside Decky Loader as `root`.

**How to avoid:**
1. **Always run the MPRIS2 D-Bus service as the `deck` user (UID 1000):** Spawn a lightweight pure-Python helper via `_build_deck_command` (or `su`/`setpriv`/fork+`os.setuid(DECK_UID)`) with `LD_LIBRARY_PATH` stripped, communicating with `main.py` over stdin/stdout JSON lines or a local socket.
2. **Zero C-extension dependencies:** Vendor a pure-Python D-Bus library (e.g., `jeepney` or `dbus-next` pure-Python subset) or use `gdbus`/`busctl`—never depend on `dbus-python`, `gi.repository`, or `pip install` at runtime on SteamOS.
3. **Check `mpris-proxy` availability:** Bluetooth AVRCP headset buttons only reach MPRIS2 if BlueZ's `mpris-proxy` user service is active for `deck`. Detect whether `mpris-proxy` is running and document/handle its absence gracefully without crashing.

**Warning signs:**
- `Authentication failed` or `Connection reset by peer` when connecting to `/run/user/1000/bus` from Decky plugin logs.
- `ModuleNotFoundError: No module named 'gi'` or `libdbus` `LD_LIBRARY_PATH` symbol errors on SteamOS.
- Headset Play/Pause works in Desktop Mode but does nothing in GamepadUI (`mpris-proxy` not started in Gamescope session).

**Phase to address:**
MPRIS2 D-Bus Bridge phase.

---

### Pitfall 6: Gentle Sleep Timer Fade-Out Clobbered by `VolumeFader` & Audible Volume Pop on Restore

**What goes wrong:**
1. **Fade-out interrupted by ducking:** `VolumeFader.fade_to()` (`py_modules/volume.py`, line 291) cancels any active `_fade_task`. If the 30-second sleep timer fade-out shares `VolumeFader` without a lock/reason, a game notification or voice-chat VAD trigger (`VoiceActivityDetector`) cancels the sleep fade and raises volume back up. Conversely, if the sleep timer uses its own `pactl` loop, it fights `VolumeFader` and `VolumeFader._current_sink_volume` goes out of sync.
2. **Loud 200ms audio pop after sleep timer expires:** Calling `control_playback("pause")` and immediately restoring PipeWire sink-input volume to 100%/150% causes a brief burst of full-volume music because `PUT /me/player/pause` takes 150–400ms over HTTPS before `librespot` stops writing audio samples.
3. **`module-stream-restore` saves 0% volume across reboots:** If `shutdown_on_finish` runs `systemctl poweroff` while the PipeWire sink-input is at 0%, PipeWire's `module-stream-restore` persists `0%` for `librespot`, leaving the user with silent audio on next boot.

**Why it happens:**
`sleep_timer_worker()` (`py_modules/system.py`, lines 63–86) currently just sleeps and calls `control_playback("pause")` with no volume coordination.

**How to avoid:**
1. **Integrate sleep fade-out into `VolumeFader` with a `"sleep"` priority lock:** Once `"sleep"` fade starts, block `"game"`/`"voice"` fade-up restores from overriding the target volume until the sleep timer is cancelled or finishes.
2. **Pause first, settle, then restore volume (or mute-then-restore):** At the end of the 30s ramp to 0%, send `control_playback("pause")` (or `pactl set-sink-input-mute 1`), wait ~600–800ms (or until `paused` event arrives) so the audio buffer drains silently, **then** restore the sink-input volume to baseline (100%/150%) and unmute—**before** triggering `systemctl poweroff` if `shutdown_on_finish` is enabled.

**Warning signs:**
- Brief loud music blip right as the sleep timer pauses playback.
- Next-day playback starts at 0% volume after using "Sleep Timer + Shutdown".
- Voice chat or game exit cancels the 30s sleep fade-out midway.

**Phase to address:**
Gentle Sleep Timer Fade-Out phase.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Calling `pw-cli set-param` in a tight loop on every UI slider `onChange` tick | Instant visual feedback | Spawns 30–60 subprocesses/sec on Steam Deck CPU, causing UI stutter and PipeWire lock contention | Never — debounce/throttle EQ slider updates (e.g., 50–80ms) and coalesce pending values |
| Keeping `me/tracks` alongside `me/library` without checking HTTP status | Minimal diff | Silent 403s for all Development Mode users on Spotify's 2026 API | Never — migrate primary path to `/me/library` |
| Writing EQ config to `~/.config/pipewire/pipewire.conf.d/` | Survives plugin unload | Pollutes user's global PipeWire config even if Deckify is uninstalled or disabled, and requires `pipewire` restart | Never — use runtime-managed `pipewire -c` process with config in `~/.config/deckify/` or `/tmp/` |
| Polling Spotify Web API every 1s even when `librespot --onevent` is active | Simpler state machine | Unnecessary HTTP 429 risk and battery drain on handheld | Only when active device is external (non-local `librespot`) |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| **Spotify `/v1/me/library`** | Sending JSON body `{"ids": [...]}` or >40 items | Pass comma-separated URIs via `?uris=spotify:track:...` query param, max 40 URIs per request |
| **PipeWire `filter-chain` `pw-cli`** | Passing bare `"Gain"` instead of `"<node_name>:Gain"` | Target the exact `filter.graph` node prefix (e.g., `pw-cli set-param <id> Props '{ params = [ "eq_band_1:Gain" 3.0 ] }'`) and verify node ID dynamically |
| **Decky `LD_LIBRARY_PATH`** | Running `pw-cli`, `pipewire`, `pactl`, or `busctl` with inherited PyInstaller env | Always use `_build_deck_command()` (`py_modules/common.py`) which strips `LD_LIBRARY_PATH` and sets `XDG_RUNTIME_DIR` / `PULSE_SERVER` / `DBUS_SESSION_BUS_ADDRESS` |
| **PipeWire `steamwebhelper` isolation** | Using `pactl list short sink-inputs` without filtering | Always parse full `pactl list sink-inputs` blocks and skip `steamwebhelper` and `application.name == "Chromium"` |
| **Bluetooth AVRCP on SteamOS** | Assuming MPRIS2 automatically receives headset button presses | Verify BlueZ `mpris-proxy` is running in the `deck` user session; handle gracefully if disabled |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Spawning Python inside `librespot --onevent` | 200–400ms audio stutter on every track change; process pile-up on rapid skip | Use a tiny shell/socket emitter (`socat`/FIFO/`nc`) that exits in <5ms | Rapidly pressing Next 5+ times in 2 seconds |
| Unthrottled `pw-cli` subprocess per EQ slider frame | Audio crackling (XRUNs) and QAM/modal frame drops while dragging sliders | Coalesce slider updates with a 50–80ms debounce timer in backend/frontend | Dragging any EQ band slider continuously |
| Emitting MPRIS2 `PropertiesChanged` on every 1s clock tick | D-Bus traffic spike + `mpris-proxy` wakeups in Gamescope | Emit `PropertiesChanged` only on state/track/seek changes; let MPRIS2 clients interpolate `Position` using `PlaybackStatus` + `Rate` | Long gaming sessions on battery |

## Security & Sandbox Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Constructing `filter-chain.conf` or `pw-cli` args from unvalidated frontend strings | Command/config injection into `deck` user shell or PipeWire config | Strictly clamp EQ frequencies (20–20000 Hz), gains (-12.0 to +12.0 dB), and Q (0.1–10.0) as floats; validate sink names against `pactl list short sinks` allowlist |
| Running `pipewire -c` or MPRIS2 bridge as `root` | Root-owned files in `/run/user/1000/` or D-Bus auth failure | Drop privileges to `DECK_UID` (1000) via `_build_deck_command` for all PipeWire and D-Bus processes |
| Logging OAuth tokens or full `--onevent` env dumps | Token leakage in `decky.logger` logs | Never log `Authorization` headers or full `os.environ` |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Sleep timer restores volume before `librespot` finishes pausing | Sudden loud burst of music wakes the user right as sleep timer expires | Pause/mute first, wait 600–800ms for audio drain, then restore volume cleanly |
| `DOCK-01` switches sink while user is on Bluetooth headphones | Audio unexpectedly jumps from BT headphones to TV HDMI when docking | Only auto-switch if current output is internal speakers (or user enabled "Override Bluetooth" option), and show a subtle non-intrusive toast |
| EQ preamp clipping when boosting bass +8 dB | Harsh digital distortion on loud tracks | Include automatic or preset-matched negative preamp gain (`bq_highshelf`/gain node) when band gains exceed +3 dB |

## "Looks Done But Isn't" Checklist

- [ ] **PipeWire EQ (`EQ-01`):** Works on Desktop AND GamepadUI without muting `steamwebhelper` clicks — verify `pactl list sink-inputs` shows `steamwebhelper` still on the hardware sink, not `effect_input.deckify_eq`.
- [ ] **PipeWire EQ (`EQ-01`):** Survives `VolumeFader` ducking — verify game/voice ducking still attenuates `librespot` when EQ is enabled.
- [ ] **Docked Switching (`DOCK-01`):** Works with EQ enabled — verify docking moves `effect_output.deckify_eq` (not `librespot` off the EQ) to the HDMI/USB-DAC sink.
- [ ] **Docked Switching (`DOCK-01`):** Does not break `bit_perfect_clock` — verify undocking to internal speakers (`acp5x`) restores `[ 48000 ]` if needed without silence/crackling.
- [ ] **`librespot --onevent`:** Rapid track skipping (10x Next) causes zero audio stutters and zero zombie processes.
- [ ] **Suspend/Wi-Fi Resilience:** Waking from a 5-minute sleep with Wi-Fi reconnect delay restores playback bookmark cleanly without dual-restart races.
- [ ] **MPRIS2 D-Bus:** `org.mpris.MediaPlayer2.deckify` is visible on `unix:path=/run/user/1000/bus` when Deckify is started by Decky Loader (root), and responds to Play/Pause/Next/Prev.
- [ ] **Sleep Timer Fade-Out:** 30s fade-out + pause produces zero loud audio pop, and `shutdown_on_finish` restores baseline volume before `systemctl poweroff`.
- [ ] **Like Button 403:** `toggle_like_track` succeeds via `/v1/me/library` on a Development Mode Spotify app.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| `pipewire` filter-chain crash leaves `librespot` routed to dead sink | LOW | Detect child exit in `EngineManager` / EQ supervisor, fall back `librespot` sink-input to default hardware sink via `pactl move-sink-input`, emit `eq_status` error |
| `steamwebhelper` accidentally moved to EQ or muted | LOW | Run targeted `pactl move-sink-input <id> @DEFAULT_SINK@` and `set-sink-input-mute <id> 0` for `steamwebhelper` on plugin recovery |
| `VolumeFader` / Sleep Timer leaves `librespot` at 0% on reboot | LOW | Always call `boost_pa_volume` / baseline volume reset on `start_librespot()` startup |
| `/v1/me/library` returns 403 due to missing scope on old token | LOW | Clear cached token/scopes and trigger OAuth re-auth flow with `user-library-modify` + `user-library-read` |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Spotify `me/tracks` 403 on Development Mode | Like Button 403 Fix Phase | `toggle_like_track` unit tests + live `PUT`/`DELETE /v1/me/library?uris=...` |
| PipeWire EQ restarting daemon / hijacking `steamwebhelper` | PipeWire Equalizer (`EQ-01`) Phase | Verify `pipewire -c` child PID, `steamwebhelper` stays on hardware sink, `pw-cli` live updates |
| Docked switching bypassing EQ or moving all sink-inputs | Docked Audio-Switching (`DOCK-01`) Phase | Verify `effect_output.deckify_eq` moves on dock when EQ is on, `steamwebhelper`/games untouched |
| `--onevent` blocking & dual suspend-recovery Wi-Fi race | Event-Driven `librespot` & Resilience Phase | Rapid skip test + sleep/wake test with delayed Wi-Fi |
| MPRIS2 D-Bus UID 0 auth failure & C-extension errors | MPRIS2 D-Bus Bridge Phase | `busctl --user list` shows `org.mpris.MediaPlayer2.deckify` under `deck` user |
| Sleep fade-out clobbered by ducking / loud restore pop | Gentle Sleep Timer Fade-Out Phase | 30s fade test with active `VolumeFader`, verify silent pause + volume restore |

## Sources

- Codebase inspection: `py_modules/volume.py`, `py_modules/engine.py`, `py_modules/device.py`, `py_modules/rpc_playback.py`, `py_modules/system.py`, `py_modules/common.py`, `main.py`
- [Spotify Web API February/March 2026 `/v1/me/library` migration & Development Mode documentation](https://developer.spotify.com/documentation/web-api)
- [PipeWire `libpipewire-module-filter-chain` & biquad built-in documentation](https://docs.pipewire.org/page_module_filter_chain.html)
- [PipeWire `pw-cli` & `pw-metadata` runtime control documentation](https://docs.pipewire.org/)
- [librespot `--onevent` handler documentation & community issue reports](https://github.com/librespot-org/librespot)
- [BlueZ `mpris-proxy` & SteamOS GamepadUI MPRIS2 integration](https://wiki.archlinux.org/title/MPRIS)

---
*Pitfalls research for: Deckify v0.6 (Audio DSP, Docked Flow & System Resilience)*
*Researched: 2026-11-16*
