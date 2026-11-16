# Requirements: Milestone v0.6 Audio DSP, Docked Flow & System Resilience

**Defined:** 2026-11-16
**Milestone:** v0.6
**Core Value:** Rock-solid Spotify playback and responsive, reliable controller navigation on Steam Deck without UI lag, broken images, or desynchronized playback states.

---

## v0.6 Requirements

### Spotify Library & Audio Guardrails
- [x] **LIB-01**: User can like and unlike tracks via `toggle_like_track` and check liked status via `check_tracks_liked` without HTTP 403 errors (migrated from deprecated `/v1/me/tracks` to `/v1/me/library` & `/v1/me/library/contains` with CDP `LibraryAPI` fallback when `spotify_client` is active).
- [ ] **LIB-02**: Audio sink-input routing (`_set_pactl_sink_input` / `resolve_spotify_sink_input_ids`) strictly targets only Deckify/Spotify streams (`librespot`, `com.spotify.client`, `deckify_eq_out`) and never moves or mutes `steamwebhelper`, `Chromium`, or game audio streams.

### Sleep Timer
- [ ] **SLEEP-01**: When the sleep timer expires, Deckify smoothly fades playback volume down to 0% over a configurable fade-out window (default 30s) using `VolumeFader` with a `"sleep"` priority lock before pausing playback and restoring baseline volume after audio drain.

### PipeWire Equalizer
- [ ] **EQ-01**: User can apply real-time PipeWire `filter-chain` biquad DSP equalization (`flat` bypass, `bass`, `vocal`, `gaming` presets) isolated to the Deckify audio stream without restarting system `pipewire` or affecting game audio.
- [ ] **EQ-02**: User can fine-tune a custom 5-band EQ curve via `SliderField` controls in `SettingsTab` with live `pw-cli set-param` updates and persistence across restarts.

### Docked Audio Switching
- [ ] **DOCK-01**: User can enable and configure automatic docked audio-switching in `SettingsTab` so connecting a designated external USB-DAC or HDMI sink routes only Deckify's audio stream (`effect_output.deckify_eq` or `librespot`) to that sink after hotplug debounce.
- [ ] **DOCK-02**: Docked switching enables `bit_perfect_clock` on designated DAC/HDMI sinks and cleanly restores normal routing and clock settings when undocked.

### Event-Driven Playback & Resilience
- [ ] **RESIL-01**: `librespot` emits playback events (`--onevent`) over a local non-blocking Unix socket to update UI state immediately and relax Web API background polling to reduce HTTP 429 rate-limit pressure.
- [ ] **RESIL-02**: On system suspend (`PrepareForSleep`) or Wi-Fi disconnect/reconnect, Deckify snapshots the active playback bookmark (`track_uri`, `context_uri`, `position_ms`) under a unified wake lock and restores the session cleanly once network and tokens recover.

### MPRIS2 Bluetooth Controls
- [ ] **MPRIS-01**: Deckify registers `org.mpris.MediaPlayer2.deckify` on the `deck` (UID 1000) user D-Bus so Bluetooth headsets/earbuds (via BlueZ `mpris-proxy`) can control Play/Pause/Next/Previous and read current track metadata locally.

---

## Future Requirements (Backlog)
- **CDP-01**: Native Spotify CDP offline downloads via `OfflineAPI`.
- **QUEUE-03**: Interactive queue reordering and clearing via CDP `PlayerAPI`.
- **TV-01**: Split-view TV / Steam Machine 10-foot mode (Now Playing + Lyrics side-by-side).
- **JAM-01**: Spotify Jam QR-code session sharing.

---

## Out of Scope
| Feature | Reason |
|---------|--------|
| System-wide PipeWire EQ via `pipewire.conf.d` restart | Severs active game audio and Steam UI sounds; EQ must run as a stream-isolated `pipewire -c` child process. |
| Blocking Python subprocess inside `librespot --onevent` | Slow child startup blocks `librespot` audio loop; `--onevent` must emit to a local Unix socket in <5ms. |
| C-extension D-Bus bindings (`dbus-python`, `PyGObject`) | Incompatible with Decky Loader's bundled Python / `LD_LIBRARY_PATH`; MPRIS2 must use pure-Python D-Bus under UID 1000. |

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| LIB-01 | Phase 13 | Complete |
| LIB-02 | Phase 13 | Pending |
| SLEEP-01 | Phase 14 | Pending |
| EQ-01 | Phase 15 | Pending |
| EQ-02 | Phase 15 | Pending |
| DOCK-01 | Phase 16 | Pending |
| DOCK-02 | Phase 16 | Pending |
| RESIL-01 | Phase 17 | Pending |
| RESIL-02 | Phase 17 | Pending |
| MPRIS-01 | Phase 18 | Pending |

**Coverage:**
- v0.6 requirements: 10 total
- Mapped to phases: 10
- Unmapped: 0
