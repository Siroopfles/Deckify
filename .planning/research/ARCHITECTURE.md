# Architecture Research: v0.6 Audio DSP, Docked Flow & System Resilience

**Domain:** SteamOS / Decky Loader Spotify Client & PipeWire Audio Management
**Researched:** 2026-11-16
**Confidence:** HIGH

## Standard Architecture

### System Overview

v0.6 extends Deckify's existing three-layer architecture (React/GamepadUI Frontend ↔ Decky RPC Bridge ↔ Python Backend + SteamOS Host Services) with five new local subsystems and one Web API endpoint migration, without altering the core playback engine (`librespot` / Official Spotify Client) or breaking PipeWire UI stream isolation.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    SteamOS GamepadUI Frontend (React)                   │
│  ┌──────────────┐  ┌──────────────────┐  ┌───────────────────────────┐  │
│  │ src/index.tsx│  │ SettingsTab.tsx  │  │ usePlaybackStatus /       │  │
│  │ (QAM + HUD)  │  │ (EQ, Dock, MPRIS)│  │ NowPlayingTab (Like fix)  │  │
│  └──────┬───────┘  └────────┬─────────┘  └─────────────┬─────────────┘  │
└─────────┼───────────────────┼──────────────────────────┼────────────────┘
          │                   │ @decky/api RPC + Events  │
┌─────────▼───────────────────▼──────────────────────────▼────────────────┐
│                      Python Backend (main.py)                           │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ Plugin Lifecycle (_main / _unload / _on_deck_sleep / _resume)     │  │
│  └──┬──────────┬──────────┬──────────┬──────────┬──────────┬─────────┘  │
│     │          │          │          │          │          │            │
│  ┌──▼───┐  ┌───▼────┐  ┌──▼───┐  ┌───▼────┐  ┌──▼───┐  ┌───▼─────────┐  │
│  │rpc_  │  │equaliz.│  │dock  │  │resil.  │  │mpris │  │system.py +  │  │
│  │playb.│  │.py NEW │  │.py   │  │.py NEW │  │.py   │  │volume.py    │  │
│  │(403) │  │(EQ-01) │  │NEW   │  │(--onev)│  │NEW   │  │(Sleep Fade) │  │
│  └──┬───┘  └───┬────┘  └──┬───┘  └───┬────┘  └──┬───┘  └───┬─────────┘  │
└─────┼──────────┼──────────┼──────────┼──────────┼──────────┼────────────┘
      │          │          │          │          │          │
┌─────▼──────────▼──────────▼──────────▼──────────▼──────────▼────────────┐
│                     SteamOS Host Services & Engines                     │
│  ┌──────────┐  ┌──────────────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │ Spotify  │  │ PipeWire /       │  │ librespot    │  │ User D-Bus  │  │
│  │ Web API  │  │ WirePlumber      │  │ --onevent    │  │ (BlueZ /    │  │
│  │ /me/lib. │  │ (filter-chain +  │  │ (Unix sock)  │  │  AVRCP)     │  │
│  │          │  │  sink-inputs)    │  │              │  │             │  │
│  └──────────┘  └──────────────────┘  └──────────────┘  └─────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Status | Responsibility | Integration Point |
|-----------|--------|----------------|-------------------|
| `py_modules/rpc_playback.py` | **Modified** | Fix HTTP 403 on `toggle_like_track` & `check_tracks_liked` | Migrate `me/tracks` → `me/library` (`uris=spotify:track:...`) with fallback |
| `py_modules/equalizer.py` | **New** | `EqualizerManager`: PipeWire `filter-chain` biquad EQ sink (`deckify_eq_sink`), presets & live band updates | `main.py`, `volume.py` (`resolve_sink_input_id`), `dock.py` (target sink sync) |
| `py_modules/dock.py` | **New** | `DockAudioSwitcher`: `pactl subscribe` sink hotplug watcher, USB-DAC/HDMI priority routing, auto `bit_perfect_clock` | `main.py`, `volume.py` (`configure_pipewire_clock`), `equalizer.py` |
| `py_modules/resilience.py` | **New** | `LibrespotEventServer` (Unix socket for `--onevent`) & `SessionBookmarkManager` (sleep/Wi-Fi snapshot + restore) | `main.py` (`start_librespot`, `_poll_api_loop`, `_on_deck_sleep`, `_on_deck_resume`) |
| `bin/librespot-event.py` | **New** | Tiny `--onevent` hook script forwarding `PLAYER_EVENT`/`TRACK_ID`/`POSITION_MS` to Unix socket | Spawned by `librespot --onevent` |
| `py_modules/mpris.py` | **New** | `MprisBridge`: `org.mpris.MediaPlayer2.deckify` on user session D-Bus for Bluetooth AVRCP controls | `main.py` (`_main`, `_poll_playback`, `--onevent` handler, `control_playback`) |
| `py_modules/system.py` | **Modified** | Gentle Sleep Timer 30s cosine fade-out before pause & post-pause volume baseline restore | Calls `plugin._volume_fader.fade_to(0.0, 30.0)` in `sleep_timer_worker` |
| `py_modules/volume.py` | **Modified** | Expose shared `resolve_spotify_sink_input_ids()` helper; ensure `VolumeFader` & EQ/Dock share Steam UI stream filtering | Used by `VolumeFader`, `EqualizerManager`, `DockAudioSwitcher` |
| `py_modules/engine.py` | **Modified** | Fix `_set_pactl_sink_input()` so it does not move `steamwebhelper`/`Chromium` streams | Filter sink-inputs before `pactl move-sink-input` |
| `py_modules/common.py` | **Modified** | Add `DEFAULT_SETTINGS` keys for EQ bands, dock switching, MPRIS2, sleep fade, and session bookmarks | Loaded by `main.py` and `get_status()` |
| `main.py` | **Modified** | Instantiate/teardown new managers, expose new RPCs, adapt `_poll_api_loop`, pass `--onevent` to `librespot` | Central coordinator |
| `src/types.ts` | **Modified** | Extend `EngineSettings` & `StatusResponse` with EQ, Dock, MPRIS2, and Sleep Fade fields | Imported across UI components |
| `src/components/tabs/SettingsTab.tsx` | **Modified** | Add EQ band sliders + custom preset, Docked Audio-Switching UI, MPRIS2 toggle, Sleep Fade toggle | Calls `set_setting` / `set_eq_bands` |
| `src/index.tsx` | **Modified** | Subscribe to `session_restored` / `dock_audio_switched` events (optional toast/status sync) | QAM & global listeners |

## Recommended Project Structure (New vs Modified)

```
Deckify/
├── main.py                              # MODIFIED: lifecycle, RPCs, --onevent, adaptive poll
├── bin/
│   └── librespot-event.py               # NEW: lightweight --onevent Unix socket emitter
├── py_modules/
│   ├── common.py                        # MODIFIED: v0.6 DEFAULT_SETTINGS keys & constants
│   ├── engine.py                        # MODIFIED: filter steamwebhelper in _set_pactl_sink_input
│   ├── rpc_playback.py                  # MODIFIED: me/library 403 fix in toggle_like_track & check_tracks_liked
│   ├── system.py                        # MODIFIED: gentle 30s sleep timer fade-out + restore
│   ├── volume.py                        # MODIFIED: shared Spotify sink-input resolver
│   ├── equalizer.py                     # NEW: PipeWire filter-chain biquad EQ manager (EQ-01)
│   ├── dock.py                          # NEW: USB-DAC / HDMI sink hotplug & routing (DOCK-01)
│   ├── resilience.py                    # NEW: --onevent Unix server + suspend/Wi-Fi bookmark manager
│   └── mpris.py                         # NEW: org.mpris.MediaPlayer2.deckify D-Bus bridge
└── src/
    ├── types.ts                         # MODIFIED: v0.6 settings & status interfaces
    ├── index.tsx                        # MODIFIED: event listeners for dock/session restore
    └── components/tabs/
        └── SettingsTab.tsx              # MODIFIED: EQ sliders, Dock routing, MPRIS2, Sleep fade UI
```

### Structure Rationale

- **Dedicated `py_modules/` per subsystem (`equalizer.py`, `dock.py`, `resilience.py`, `mpris.py`):** Follows v0.4's modularization pattern (`soundtrack.py`, `volume.py`), keeping each file under ~350 LOC and independently unit-testable with `unittest` mocks.
- **Standalone `bin/librespot-event.py`:** `librespot --onevent` spawns a fresh OS process on every playback transition. Keeping the hook script minimal (stdlib `os`, `json`, `socket` only — no `py_modules` imports) guarantees <10ms execution and zero `LD_LIBRARY_PATH` / import-path overhead.

## Architectural Patterns & Integration Details

### Pattern 1: PipeWire Audio Signal Chain (VolumeFader + EQ-01 + DOCK-01)

**What:** `EqualizerManager` inserts a virtual PipeWire `libpipewire-module-filter-chain` sink (`deckify_eq_sink`) between `librespot`/`spotify` and the active hardware sink. `VolumeFader` continues to attenuate the `librespot` sink-input directly, while `DockAudioSwitcher` moves the downstream hardware target.

**Signal Path:**
```
[librespot / Spotify Client]
    │  (sink-input volume controlled by VolumeFader & Sleep Timer)
    ▼
[deckify_eq_sink]  (PipeWire filter-chain: bq_lowshelf + bq_peaking x N + bq_highshelf)
    │  (bypassed when eq_preset == "flat" and eq_enabled == False)
    ▼
[Hardware Output Sink]  (Internal Speaker OR USB-DAC / HDMI via DockAudioSwitcher)
```

**Why this works:**
- **No Steam UI contamination:** Only the `librespot`/`spotify` sink-input (resolved via `VolumeFader.resolve_sink_input_id()`, which explicitly skips `steamwebhelper` and `Chromium`) is moved to `deckify_eq_sink` or the docked sink.
- **Click-free live EQ sliders:** Updating biquad `Gain` controls via `pw-cli s <node_id> Props '{ params = [ ... ] }'` modifies DSP coefficients in-place without destroying/recreating the virtual sink.
- **Dock + EQ coordination:** When `DOCK-01` switches the hardware sink, it calls `equalizer.set_target_sink(new_sink)` if EQ is active (moving `deckify_eq_sink`'s playback stream), or moves the `librespot` sink-input directly if EQ is bypassed.

### Pattern 2: Spotify Web API 403 Fix (`me/library` Migration)

**What:** In `py_modules/rpc_playback.py`, `toggle_like_track` and `check_tracks_liked` currently call `PUT/DELETE me/tracks?ids=...` and `GET me/tracks/contains?ids=...`, which Spotify deprecated in 2026 (returning HTTP 403 Forbidden).

**Integration:**
- Update `toggle_like_track` to call `PUT`/`DELETE` `me/library` with `params={"uris": f"spotify:track:{target_id}"}` (matching `rpc_library.py`'s `playlists/{pid}/items` pattern), with automatic fallback to `me/tracks` on HTTP 400/404.
- Update `check_tracks_liked` to call `GET me/library/contains` with `params={"uris": ",".join(f"spotify:track:{tid}" for tid in chunk)}` (batch size <= 40 per Spotify's new limit, down from 50), with fallback to `me/tracks/contains`.
- `main.py`, `rpc_library.py`, `src/index.tsx`, and `NowPlayingTab.tsx` already delegate through `toggle_like_track` and `_check_tracks_liked`, requiring zero caller changes.

### Pattern 3: Event-Driven `librespot` (`--onevent`) & Adaptive Polling

**What:** Replace blind 3-second Web API polling when `librespot` is active with push events from `librespot --onevent`.

**Integration:**
- `resilience.LibrespotEventServer` binds an `asyncio.start_unix_server` at `os.path.join(DECKY_PLUGIN_RUNTIME_DIR, "onevent.sock")`.
- `main.py:start_librespot()` passes `--onevent <bin/librespot-event.py>` and `DECKIFY_EVENT_SOCK=<path>` in `env`.
- On `playing`, `paused`, `stopped`, `track_changed`, `seeked`, `volume_set`:
  1. `LibrespotEventServer` updates `plugin._poll_play_state`, `plugin._last_event`, `plugin._poll_volume` immediately.
  2. Emits `librespot_event` to frontend and pushes state to `MprisBridge`.
  3. On `track_changed`, triggers a single targeted `_poll_playback()` to fetch artwork/album metadata and `is_liked` status.
- `_poll_api_loop()` checks `plugin._onevent_active`: if `librespot` is running with healthy `--onevent`, polling interval relaxes from `3s` to `20s` (metadata/device drift reconciliation only). When `audio_backend == "spotify_client"`, `3s` polling remains unchanged.

### Pattern 4: Suspend/Wi-Fi Session Bookmark Resilience

**What:** Preserve and restore active listening sessions across Steam Deck sleep/wake and Wi-Fi drops.

**Integration:**
- `main.py:_on_deck_sleep()` calls `resilience.SessionBookmarkManager.save_bookmark()`, persisting `{track_uri, context_uri, position_ms, is_playing, shuffle, repeat, saved_at}` to `DECKY_PLUGIN_RUNTIME_DIR/session_bookmark.json`.
- `main.py:_on_deck_resume()` (and `_poll_playback()` recovering from `False` → `True` network state) invokes `restore_if_needed()`:
  1. Polls DNS/token readiness (`_ensure_token()`) with bounded backoff (1s, 2s, 4s, 8s) until Wi-Fi reconnects.
  2. Ensures `librespot` is running and registered as a Connect device.
  3. If `was_playing` was true within the configured staleness window (e.g. <12 hours), resumes via `play_tracks(context_uri=..., offset_uri=..., position_ms=...)` and emits `session_restored`.

### Pattern 5: Pure-Python MPRIS2 D-Bus Bridge (`org.mpris.MediaPlayer2.deckify`)

**What:** Expose standard MPRIS2 interfaces on `DBUS_SESSION_BUS_ADDRESS` (`unix:path=/run/user/1000/bus`) so SteamOS BlueZ/AVRCP routes Bluetooth headset media keys (play/pause/next/prev) to Deckify.

**Trade-off:** Use pure-Python `dbus-next` (asyncio-native) vendored or installed in `py_modules/` rather than `dbus-python`/`pygobject` (which require C extensions and break under Decky's PyInstaller `LD_LIBRARY_PATH`). Graceful no-op if D-Bus session bus is unavailable in unit tests.

### Pattern 6: Gentle Sleep Timer Fade-Out

**What:** `py_modules/system.py:sleep_timer_worker()` coordinates with `plugin._volume_fader` (`py_modules/volume.py`) for a 30-second cosine-eased PipeWire fade-out before pausing.

**Critical Invariant:** After `await plugin.control_playback("pause")` completes, `sleep_timer_worker` **must** restore the PipeWire sink-input volume back to its pre-fade baseline (`150.0` if `_pa_volume_boosted` else `100.0`) after a 250ms settle delay — and also restore it in `except asyncio.CancelledError` if the user cancels the timer mid-fade — so Deckify is never left muted at 0% on next playback.

## Data Flow

### Key Data Flows

1. **EQ + Docked Sink Routing:** `SettingsTab.tsx` → `set_setting("eq_preset" | "eq_bands")` → `EqualizerManager` updates `pw-cli` biquad `Props` → `DockAudioSwitcher` (`pactl subscribe`) detects USB-DAC hotplug → moves `deckify_eq_sink` (or `librespot`) to DAC + calls `configure_pipewire_clock(True)` → emits `dock_audio_switched`.
2. **Event-Driven Playback + MPRIS2:** `librespot` state change → `bin/librespot-event.py` → `onevent.sock` → `LibrespotEventServer` → updates `Plugin` state + `decky.emit("librespot_event")` + `MprisBridge.emit_properties_changed()`.
3. **Headset AVRCP → Deckify:** Bluetooth headset button → BlueZ → user D-Bus `org.mpris.MediaPlayer2.deckify` → `MprisBridge` → `plugin.control_playback(...)`.
4. **Sleep Fade-Out:** `sleep_timer_worker` (`rem <= 30s`) → `VolumeFader.fade_to(0.0, 30.0)` → `control_playback("pause")` → 250ms settle → `VolumeFader.fade_to(baseline, 0.0)`.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Moving All Sink Inputs in `pactl`
**What people do:** Call `pactl list short sink-inputs` and move every ID to the DAC or EQ sink (as `_set_pactl_sink_input` in `py_modules/engine.py` currently does).
**Why it's wrong:** Moves `steamwebhelper` (`Chromium`) UI sounds and running game audio, breaking SteamOS `module-stream-restore` and mixing game audio into music EQ.
**Do this instead:** Always resolve Deckify's PID/application sink-input IDs via `VolumeFader.resolve_sink_input_id()` (filtering out `steamwebhelper` and `Chromium`).

### Anti-Pattern 2: Blocking Subprocess Calls on `dbus-python` / `C` Bindings
**What people do:** Import `gi.repository.GLib` or `dbus-python` inside Decky plugins.
**Why it's wrong:** Decky's PyInstaller runtime strips/conflicts with system `libffi`/`glib` via `LD_LIBRARY_PATH`.
**Do this instead:** Use pure-Python `dbus-next` on Python's `asyncio` loop, or `busctl` CLI subprocesses as fallback.

### Anti-Pattern 3: Leaving Sink Volume at 0% After Sleep Timer Pause
**What people do:** Fade `VolumeFader` to `0.0` and call `pause`, then exit `sleep_timer_worker`.
**Why it's wrong:** Next time the user presses Play on their Steam Deck or phone, `librespot` plays silently at 0% PipeWire sink-input volume.
**Do this instead:** Restore baseline PipeWire volume 250ms after `pause` (and on `CancelledError`).

## Suggested Build Order (Roadmap Implications)

1. **Phase 1 — Like Button 403 Fix & Sink-Input Guardrails** *(Low risk, immediate user-facing fix + shared foundation)*
   - Fix `toggle_like_track` and `check_tracks_liked` (`me/library` migration) in `py_modules/rpc_playback.py`.
   - Extract/harden shared Spotify sink-input resolver in `py_modules/volume.py` and fix `_set_pactl_sink_input` in `py_modules/engine.py`.
2. **Phase 2 — Gentle Sleep Timer Fade-Out** *(Builds directly on existing `VolumeFader` & `system.py`)*
   - Update `py_modules/system.py:sleep_timer_worker` + `common.py` settings + `SettingsTab.tsx` toggle.
3. **Phase 3 — Real PipeWire Biquad Equalizer (`EQ-01`)** *(Depends on hardened sink-input resolver)*
   - Create `py_modules/equalizer.py`, wire `main.py` & `SettingsTab.tsx` (presets + custom band sliders).
4. **Phase 4 — Automatic Docked Audio-Switching (`DOCK-01`)** *(Depends on `EQ-01` target-sink coordination & sink-input resolver)*
   - Create `py_modules/dock.py` (`pactl subscribe` watcher + `bit_perfect_clock`), wire `main.py` & `SettingsTab.tsx`.
5. **Phase 5 — Event-Driven `librespot` (`--onevent`) & Suspend/Wi-Fi Resilience** *(Replaces 3s polling & adds session bookmarking)*
   - Create `bin/librespot-event.py` + `py_modules/resilience.py`, update `main.py` (`start_librespot`, `_poll_api_loop`, `_on_deck_sleep`/`_on_deck_resume`).
6. **Phase 6 — MPRIS2 D-Bus Bridge** *(Benefits from Phase 5's instant `--onevent` state push for zero-lag AVRCP metadata)*
   - Create `py_modules/mpris.py`, wire `main.py` & `SettingsTab.tsx` toggle.

## Sources

- Existing codebase: `main.py`, `py_modules/volume.py`, `py_modules/engine.py`, `py_modules/device.py`, `py_modules/system.py`, `py_modules/rpc_playback.py`, `py_modules/rpc_library.py`, `py_modules/common.py`, `src/index.tsx`, `src/components/tabs/SettingsTab.tsx`, `src/types.ts`
- Spotify Web API 2026 `/v1/me/library` & `/v1/me/library/contains` migration (replacing deprecated `/v1/me/tracks`)
- PipeWire `libpipewire-module-filter-chain` built-in biquad nodes (`bq_lowshelf`, `bq_peaking`, `bq_highshelf`) and `pw-cli` runtime `Props` control
- `librespot` `--onevent` environment variables (`PLAYER_EVENT`, `TRACK_ID`, `POSITION_MS`)

---
*Architecture research for: Deckify v0.6 Audio DSP, Docked Flow & System Resilience*
*Researched: 2026-11-16*
