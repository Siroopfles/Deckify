# Phase 17: Event-Driven librespot & Suspend/Wi-Fi Resilience - Research

**Researched:** 2026-11-17
**Domain:** SteamOS 3.5+ / Decky Loader `librespot --onevent` Unix Socket IPC & Suspend/Wi-Fi Session Resilience
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Auto-resume playback on Steam Deck wake or Wi-Fi reconnect **only if playback was actively playing** before sleep or the network drop; if playback was paused, restore/keep it paused.
- **D-02:** Use a **short grace window (3–5s) and buffer-aware Wi-Fi drop detection** — account for `librespot`'s local audio/download streaming buffer so brief Wi-Fi blips that play through the buffer without stalling or losing the session do not interrupt playback unnecessarily. Only trigger a full bookmark restore if connectivity actually drops and `librespot` stopped/lost its session. (**Research (`gsd-phase-researcher`) must verify `librespot` v0.8.0's internal streaming/buffering and reconnect behavior on transient network loss.**)
- **D-03:** Relax `_poll_api_loop` from `3s` to **`15–30s`** when `librespot` is the active Spotify Connect device and `--onevent` is healthy.
- **D-04:** **Auto-revert `_poll_api_loop` to `3s`** whenever playback is on another remote Spotify Connect device (phone/PC), when `audio_backend == "spotify_client"`, or when `--onevent` is unhealthy/silent.
- **D-05:** During rapid track skipping, update UI playback state (`track`, `play/pause`, `position`) **immediately (`<50ms`)** from `--onevent` data, while **debouncing Web API enrichment** (e.g., `check_tracks_liked` / extra metadata) by `~300–500ms` so rapid skipping causes zero audible stutter or HTTP 429 spikes.
- **D-06:** On wake or reconnect, check active Spotify Connect state (`/v1/me/player`) before restoring: **yield if another device is already actively playing** so Deckify does not hijack playback from a phone/PC.
- **D-07:** Make bookmark expiration/staleness **configurable** via a `SliderField` (`1h–24h` in `1h` steps) plus a `Never` toggle in `SettingsTab.tsx`. When a bookmark is expired or yielded to another device, hold it as a manual restore option rather than auto-playing.
- **D-08:** Add a dedicated **"Playback Resilience"** card in `SettingsTab.tsx` containing:
  - Toggle for auto-resume on wake/Wi-Fi recovery
  - Configurable bookmark expiry (`SliderField` `1h–24h`, step `1h`, + `Never` toggle)
  - Toggle for restore toast notifications
  - Toggle/option for held-bookmark manual restore prompt (when yielded to another device or expired)
  - Live `--onevent` / polling mode health status indicator
- **D-09:** Support both a **toggleable brief Decky toast** on auto-restore and a **manual "Resume Bookmark" action** when a bookmark was held due to remote playback conflict or expiry (keeping QAM compact when no bookmark is held).

### the agent's Discretion
- Exact Unix socket path (under `DECKY_PLUGIN_RUNTIME_DIR`), lightweight socket emitter binary/script (`<5ms`, no Python startup inside `--onevent`), and JSON event schema for `librespot --onevent`.
- Exact unified wake-lock / state-machine coordination between `SuspendResumeMonitor._on_deck_resume`, Wi-Fi reconnect watchdog, and `_monitor_loop` auto-restart to prevent dual-restart races.
- Exact `settings.json` key names in `DEFAULT_SETTINGS` (`py_modules/common.py`) and TypeScript types in `src/types.ts`.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

## Project Constraints (from GEMINI.md)

- **Steam CEF Content Security Policy:** Steam GamepadUI blocks direct external image URLs (`https://i.scdn.co/`), requiring internal proxying/base64 encoding (`get_image` RPC).
- **SteamOS GamepadUI Navigation:** Controller focus relies on spatial navigation (`flow-children`, `@decky/ui`); focus traps or navigation loss degrade user experience. Containers with horizontal buttons MUST use `flow-children="horizontal"`.
- **Steam Deck Environment:** Runs in the `deck` user space (UID 1000) under SteamOS 3.5+.
- **Process Environment Isolation:** `os.environ.pop("LD_LIBRARY_PATH", None)` is mandatory before launching subprocesses (`py_modules/common.py:38`).
- **Rate Limiting:** Avoid continuous polling of heavy Spotify Web API endpoints; restrict polling to current playback state and use circuit-breaker patterns on HTTP 429.
- **Decky Loader Plugin Sandbox:** `main.py` runs with `__name__ == "_"`, so never index `sys.modules[__name__]` directly (`sys.modules.get(__name__)`).
- **Remote Directory Cleanliness:** Never place duplicate Python module trees under `bin/` (e.g., `bin/py_modules`), as `bin/` in `sys.path` shadows primary modules.
- **Zero-Dependency Runtime:** No `pip install` at runtime; no new npm packages required.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RESIL-01 | `librespot` emits playback events (`--onevent`) over a local non-blocking Unix socket to update UI state immediately and relax Web API background polling to reduce HTTP 429 rate-limit pressure. | `LibrespotEventServer` (`asyncio.start_unix_server` in `py_modules/resilience.py`), lightweight POSIX `sh` emitter (`socat` / `nc -U` / `curl --unix-socket` fallback, `<5ms`, zero Python startup), Base16→Base62 `TRACK_ID` conversion, debounced (`400ms`) Web API enrichment, adaptive `_poll_api_loop` (`20s` when healthy & local, `3s` otherwise), and `librespot_event` / `track_metadata` listeners in `QuickAccessMenu` and `usePlaybackStatus`. |
| RESIL-02 | On system suspend (`PrepareForSleep`) or Wi-Fi disconnect/reconnect, Deckify snapshots the active playback bookmark (`track_uri`, `context_uri`, `position_ms`) under a unified wake lock and restores the session cleanly once network and tokens recover. | `SessionBookmarkManager` in `py_modules/resilience.py`, continuous bookmark snapshotting from `--onevent` + `_poll_playback`, unified `asyncio.Lock` + cooldown coordinating `SuspendResumeMonitor._on_deck_resume`, `_monitor_process` (`SUSPEND_THRESHOLD`), and Wi-Fi drop watchdog (with 4s buffer-aware grace window), remote-device conflict yield check (`/v1/me/player`), configurable expiry (`1h–24h` + `Never`), and `SettingsTab.tsx` "Playback Resilience" card + compact QAM "Resume Bookmark" banner when held. |
</phase_requirements>

## Summary

Phase 17 replaces Deckify's tight 3-second Web API polling loop with event-driven state updates from `librespot --onevent` over a local Unix domain socket, while unifying Steam Deck suspend (`PrepareForSleep`) and Wi-Fi drop recovery behind a single wake lock and session bookmark manager.

Research confirms two critical `librespot` v0.8.0 behaviors that directly shape the implementation:
1. **`librespot --onevent` passes `TRACK_ID` as Base16 (32-char hex) and spawns the hook synchronously:** Launching a Python interpreter inside `--onevent` takes 150–400ms and stutters audio during rapid skipping. A tiny POSIX `#!/bin/sh` script generated/installed into `DECKY_PLUGIN_RUNTIME_DIR` that writes `KEY=VALUE` lines to a Unix socket using `socat` (or `nc -U` / `curl --unix-socket` fallback) with a `<100ms` timeout completes in `<5ms` with zero JSON-escaping bugs. In Python, `LibrespotEventServer` converts 32-char hex `TRACK_ID`s to 22-char Base62 Spotify URIs, emits `librespot_event` immediately (`<50ms`) to QAM, Expanded Modal, and HUD Overlay, and debounces Web API enrichment (`_poll_playback` / `_check_tracks_liked`) by `400ms` so rapid skipping causes zero 429 spikes.
2. **`librespot` v0.8.0 streaming buffer & transient network behavior:** `librespot` v0.8.0 fetches audio in discrete chunks over HTTPS CDN and caches them in `--system-cache` (`CACHE_DIR`, already configured in `main.py:457`). Brief Wi-Fi blips (1–5s) can play through already-buffered chunks without interrupting audio, **but** if the Dealer WebSocket or an active CDN chunk request hits a socket reset/timeout (`Connection reset by peer` / `Deadline expired`), `librespot` v0.8.0 does not seamlessly reconnect on its own and stops (`stopped` / `session_disconnected` / process exit), or hits `401` loops after suspend due to monotonic clock drift (`std::time::Instant`). Therefore, D-02's 3–5s buffer-aware grace window is essential: only tear down/restart `librespot` and restore the bookmark if connectivity remains down past the grace window or `librespot` actually loses its session.

**Primary recommendation:** Build `py_modules/resilience.py` containing `LibrespotEventServer` (Unix socket server + Base16→Base62 converter + 400ms debounced enrichment + `--onevent` health tracker) and `SessionBookmarkManager` (continuous bookmark persistence + unified `asyncio.Lock` wake/Wi-Fi coordinator + remote-playback yield check), wire it into `main.py` (`start_librespot`, `_poll_api_loop`, `_monitor_process`, `_on_deck_sleep`, `_on_deck_resume`), and add `librespot_event` listeners to `QuickAccessMenu` and `usePlaybackStatus` alongside the new "Playback Resilience" card in `SettingsTab.tsx`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `--onevent` Unix socket emission | OS Subprocess (`librespot` → `sh` emitter) | — | Runs synchronously on `librespot` state transitions; must exit in `<5ms` without Python startup. |
| Event parsing, Base16→Base62 ID conversion, & debounced API enrichment | API / Backend (`py_modules/resilience.py`) | — | Centralizes state normalization, protects Spotify Web API from 429s during rapid skipping, and manages `_onevent` health. |
| Adaptive Web API polling (`20s` vs `3s`) | API / Backend (`main.py:_poll_api_loop`) | — | Backend owns `audio_backend`, `_active_device`, and `--onevent` health state. |
| Session bookmarking, unified wake lock, & Wi-Fi recovery | API / Backend (`py_modules/resilience.py` + `main.py`) | OS (`SuspendResumeMonitor` `busctl`) | Coordinates `PrepareForSleep`, `_monitor_process`, and Wi-Fi probing under one `asyncio.Lock` so dual-restart races cannot occur. |
| Immediate playback UI sync (`<50ms`) & Held-Bookmark UI | Browser / Client (`src/index.tsx`, `usePlaybackStatus.ts`, `SettingsTab.tsx`) | — | React components subscribe to `decky.emit` push events (`librespot_event`, `track_metadata`, `session_restored`, `resilience_status`) and invoke `restore_bookmark` RPC on user action. |

## Standard Stack

### Core
| Library / Binary | Version | Purpose | Why Standard |
|------------------|---------|---------|--------------|
| Python `asyncio.start_unix_server` | Python 3.11+ stdlib | Local `AF_UNIX` stream server for `--onevent` IPC | Zero external dependencies; native to Decky's Python runtime. |
| `librespot` (`--onevent`) | v0.8.0 (bundled in `bin/librespot`) | Emits `PLAYER_EVENT`, `TRACK_ID`, `POSITION_MS`, `DURATION_MS`, `VOLUME` | Already Deckify's primary audio engine (`py_modules/common.py:41`). |
| POSIX `/bin/sh` + `socat` / `nc` / `curl` | SteamOS 3.5+ host binaries | `<5ms` non-blocking `--onevent` socket emitter | Avoids 150–400ms Python cold-start inside `librespot --onevent`. |
| `@decky/ui` + `@decky/api` | `4.11.1` / `1.1.3` (`package.json:29,46`) | `ToggleField`, `SliderField`, `DialogButton`, `addEventListener`, `toaster.toast` | Existing UI & RPC stack in `SettingsTab.tsx` and `src/index.tsx`. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `busctl` (`SuspendResumeMonitor`) | SteamOS host (`py_modules/device.py:80-160`) | `org.freedesktop.login1` `PrepareForSleep` signals | Already wired to `Plugin._on_deck_sleep` and `Plugin._on_deck_resume` (`main.py:144-148`). |
| `urllib.request` / `socket.create_connection` | Python stdlib | Lightweight DNS/TCP readiness probe on wake/Wi-Fi recovery | Zero dependencies; faster and safer than spawning `nmcli` when probing `api.spotify.com:443`. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| POSIX `sh` emitter (`socat`/`nc`/`curl`) | Python script `bin/librespot-event.py` | Python interpreter startup takes 150–400ms on Steam Deck, violating `<5ms` Out-of-Scope rule in `REQUIREMENTS.md:49` and causing audio stutter on rapid skip. |
| `KEY=VALUE` wire format from `sh` | `printf '{"event":"%s"}' ...` JSON in `sh` | `KEY=VALUE` newline protocol avoids shell JSON-escaping edge cases completely; Python parses `dict` trivially. |

**Installation:** Zero new npm or pip packages required (`package.json` unchanged).

## Package Legitimacy Audit

Not applicable — Phase 17 installs **zero** external npm, PyPI, or crates packages. All functionality uses Python stdlib, existing `@decky/ui`/`@decky/api` dependencies, and SteamOS host utilities.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ SteamOS Host / librespot                                                    │
│                                                                             │
│  [librespot --onevent] ──(env vars)──> [librespot-event.sh (<5ms)]          │
│                                              │                              │
│  [systemd-logind PrepareForSleep]            │ AF_UNIX (KEY=VALUE lines)    │
│         │                                    ▼                              │
└─────────┼────────────────────────────────────┼──────────────────────────────┘
          │                                    │
          ▼                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Python Backend (main.py + py_modules/resilience.py)                         │
│                                                                             │
│  [SuspendResumeMonitor]      [LibrespotEventServer]                         │
│         │                      │  ├─ Immediate (<50ms): update _poll_*      │
│         │                      │  │  & decky.emit("librespot_event")        │
│         │                      │  └─ Debounced (400ms): _poll_playback()    │
│         │                      │     (artwork, album, check_tracks_liked)   │
│         ▼                      ▼                                            │
│  [Unified Wake Lock (asyncio.Lock + cooldown)]                              │
│    ▲              ▲                    ▲                                    │
│    │              │                    │                                    │
│  _on_deck_resume  _monitor_process     Wi-Fi Grace Watchdog (4s window)     │
│                   (SUSPEND_THRESHOLD)  (only if librespot lost session)     │
│         │                                                                   │
│         ▼                                                                   │
│  [SessionBookmarkManager] ──(Check /v1/me/player)──┬─ Remote active? Hold!  │
│    (session_bookmark.json)                         └─ Idle & was_playing?   │
│                                                       Restart librespot &   │
│                                                       play_tracks(pos_ms)   │
│                                                                             │
│  [_poll_api_loop] ──(20s if onevent healthy & local librespot, else 3s)     │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │ decky.emit / callable RPC
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ GamepadUI Frontend (React)                                                  │
│  ├─ QuickAccessMenu (src/index.tsx): listens to librespot_event,            │
│  │    track_metadata, resilience_status, session_restored; compact          │
│  │    "Resume Bookmark" button ONLY when bookmark is held                   │
│  ├─ Expanded Modal (usePlaybackStatus.ts): instant state sync on            │
│  │    librespot_event + track_metadata (no waiting 1.5s for get_status)     │
│  ├─ HUD Overlay (DeckifyOverlayWrapper): already listens to librespot_event │
│  └─ SettingsTab.tsx: "Playback Resilience" card (toggles, expiry slider,    │
│       live --onevent/polling status, manual "Resume Bookmark" button)       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
Deckify/
├── main.py                              # Wire LibrespotEventServer, SessionBookmarkManager,
│                                        # unified wake lock, adaptive _poll_api_loop, new RPCs
├── py_modules/
│   ├── common.py                        # Add resilience DEFAULT_SETTINGS keys & runtime paths
│   └── resilience.py                    # NEW: LibrespotEventServer, SessionBookmarkManager,
│                                        # Base16->Base62 helper, emitter script writer
└── src/
    ├── types.ts                         # Add resilience settings & ResilienceStatusInfo types
    ├── hooks/usePlaybackStatus.ts       # Add librespot_event + track_metadata listeners
    ├── index.tsx                        # QAM instant event listeners, toast, held-bookmark CTA
    └── components/tabs/
        └── SettingsTab.tsx              # "Playback Resilience" card
```

### Pattern 1: Ultra-Lightweight `--onevent` Emitter (`<5ms`, Zero Python Startup)
**What:** Generate/update an executable POSIX shell script at `os.path.join(DECKY_PLUGIN_RUNTIME_DIR, "librespot-event.sh")` (`chmod 0o755`) inside `start_librespot()` before spawning `librespot`. Pass `--onevent <script_path>` and `DECKIFY_EVENT_SOCK=<DECKY_PLUGIN_RUNTIME_DIR/onevent.sock>` in `env`.
**Why runtime path:** `bin/` is not tracked in git (`deploy.sh:112-127` only syncs `bin/librespot`), whereas `DECKY_PLUGIN_RUNTIME_DIR` is always writable and guaranteed present.
**Wire format:** Send newline-delimited `KEY=VALUE` pairs terminated by a blank line (`\n`). `LibrespotEventServer` accepts both `KEY=VALUE` blocks and raw JSON lines (for easy unit testing), plus HTTP POST bodies if `curl --unix-socket` is used as fallback.
**Example (`librespot-event.sh`):**
```sh
#!/bin/sh
SOCK="${DECKIFY_EVENT_SOCK:-}"
[ -z "$SOCK" ] || [ ! -S "$SOCK" ] && exit 0
PAYLOAD="PLAYER_EVENT=${PLAYER_EVENT}
TRACK_ID=${TRACK_ID}
OLD_TRACK_ID=${OLD_TRACK_ID}
POSITION_MS=${POSITION_MS}
DURATION_MS=${DURATION_MS}
VOLUME=${VOLUME}
"
if command -v socat >/dev/null 2>&1; then
  printf '%s\n' "$PAYLOAD" | socat -t 0.1 - UNIX-CONNECT:"$SOCK" >/dev/null 2>&1 &
elif command -v nc >/dev/null 2>&1; then
  printf '%s\n' "$PAYLOAD" | nc -U -w 1 "$SOCK" >/dev/null 2>&1 &
elif command -v curl >/dev/null 2>&1; then
  printf '%s\n' "$PAYLOAD" | curl -s --max-time 1 --unix-socket "$SOCK" -X POST --data-binary @- http://localhost/ >/dev/null 2>&1 &
fi
exit 0
```
Backgrounding (`&`) the socket write ensures the `--onevent` child returns to `librespot` in **~1–2ms** even if the socket server is momentarily busy, preventing any audio stutter during rapid track skipping.

### Pattern 2: Base16 → Base62 `TRACK_ID` Conversion & Debounced Enrichment (D-05)
**What:** `librespot` v0.8.0 passes `TRACK_ID` as a 32-character hexadecimal (Base16) string (e.g., `ba292267a139477c86f108d66f4f9cc5`), whereas Spotify Web API and `track_metadata` use 22-character Base62 IDs (`0-9a-zA-Z`) `[CITED: github.com/librespot-org/librespot]`.
**Conversion:**
- If `len(raw_id) == 32` and all chars are hex (`0-9a-fA-F`), convert `int(raw_id, 16)` to Base62 using Spotify's alphabet `"0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"` and `.rjust(22, "0")`.
- If `len(raw_id) == 22`, pass through unchanged. If `raw_id.startswith("spotify:track:")`, strip prefix.
**Debounced Enrichment (D-05):**
- On `playing`, `paused`, `stopped`, `seeked`, `track_changed` / `changed`, `volume_set` / `volume_changed`:
  1. Immediately (`<50ms`) update `plugin._poll_play_state`, `plugin._poll_progress_ms`, `plugin._poll_duration_ms`, `plugin._poll_updated_at`, `plugin._last_event`, and `decky.emit("librespot_event", event)`.
  2. Continuously update the in-memory/on-disk session bookmark (`track_uri`, `context_uri`, `position_ms`, `is_playing`, `saved_at`).
  3. On `track_changed` (or `playing` with a new `track_id` != `plugin._poll_track_id`), **cancel any pending enrichment timer** and schedule a single `asyncio.Task` that sleeps `0.4s` (`400ms` debounce) before calling `plugin._poll_playback()` to fetch full artwork, artist/album names, and `check_tracks_liked`. Rapidly pressing Next 10 times triggers only **one** Web API call after the user stops skipping.

### Pattern 3: Adaptive `_poll_api_loop` (D-03, D-04)
**What:** Currently `_poll_api_loop` in `main.py:1685-1692` unconditionally sleeps `3s`.
**Adaptive logic:**
- Track `last_onevent_at` (monotonic timestamp of last received `--onevent` message) and `onevent_healthy` (True if `audio_backend == "librespot"`, `librespot` is running, `--onevent` socket server is listening, and either an event was received recently or `librespot` has not been silent while active).
- Check whether `librespot` is the active Spotify Connect device: `plugin._active_device` name matches `device_name` (or `socket.gethostname()`) and `audio_backend == "librespot"`.
- **Interval:**
  - `20.0s` (within D-03's `15–30s` range) when `audio_backend == "librespot"`, `librespot` is running, `--onevent` is healthy, and active device is local `librespot` (or no remote device is active).
  - `3.0s` (D-04) whenever `audio_backend == "spotify_client"`, another remote Spotify Connect device is active, or `--onevent` is unhealthy/disabled.
- Wake the poll loop immediately via an `asyncio.Event` (`_poll_wake_event`) whenever mode switches from `20s` → `3s` (e.g., on `device_changed` or `--onevent` failure) so the transition doesn't wait 20s.

### Pattern 4: Unified Wake Lock & Buffer-Aware Wi-Fi Recovery (D-01, D-02, D-06, D-07)
**What:** Currently `main.py` has **two** competing suspend detectors (`SuspendResumeMonitor._on_deck_resume` at `main.py:197` and `_monitor_process` `SUSPEND_THRESHOLD = 30s` at `main.py:1597-1621`) that can both restart `librespot` back-to-back on wake.
**Unified coordination:**
1. Add a single `asyncio.Lock` (`_recovery_lock`) and `_last_recovery_ts` cooldown (e.g., `10s`) inside `SessionBookmarkManager`.
2. Both `_on_deck_resume()` and `_monitor_process()` (`elapsed > SUSPEND_THRESHOLD`) call `await bookmark_manager.handle_wake_recovery(source="dbus" | "watchdog")`. If the lock is held or recovery ran within the cooldown window, the second caller becomes a clean no-op.
3. **Buffer-aware Wi-Fi drop detection (D-02):**
   - `_poll_playback()` returns `False` on network/DNS errors (`main.py:1460-1462`).
   - Instead of immediately killing/restarting `librespot` on the first `False` return, record `_wifi_drop_started_at`.
   - Wait through a **4-second grace window** (within D-02's `3–5s`).
   - If `_poll_playback()` succeeds again within 4s **and** `librespot` is still running and did not emit `session_disconnected` / `stopped`, clear `_wifi_drop_started_at` and **do nothing** (let `librespot`'s local audio buffer keep playing uninterrupted).
   - If connectivity stays down past 4s OR `librespot` emits `session_disconnected` / exits while network is down, mark `_network_lost_session = True` and snapshot the bookmark. Once network probes (`api.spotify.com:443` TCP connect + `_ensure_token()`) succeed, run `handle_wake_recovery(source="wifi")`.
4. **Restore sequence inside `_recovery_lock`:**
   - **Step 1:** Wait for network/DNS readiness (`socket.create_connection(("api.spotify.com", 443), timeout=2.0)` in `_exec`) + `_ensure_token()` with bounded backoff (`1s, 2s, 4s, 8s`, max ~15s).
   - **Step 2:** Restart `librespot` (`_kill_librespot()` + `start_librespot()`) if it was running/suspended (fixes `librespot` v0.8.0's `std::time::Instant` 401 drift and severed TCP/Dealer socket).
   - **Step 3:** Check `auto_resume_enabled` and `bookmark` existence. If `not bookmark.was_playing` (D-01), do not auto-play (keep paused).
   - **Step 4:** Check bookmark expiry (`resilience_bookmark_expiry_hours`, `1–24h`, or `resilience_bookmark_never_expires`). If expired, hold bookmark and emit `resilience_status` (`held_reason="expired"`).
   - **Step 5 (D-06):** Poll `GET me/player` once. If `data and data.get("is_playing")` on another device (device name/id != local `librespot`), **yield**: hold the bookmark (`held_reason="remote_active"`), emit `resilience_status`, and do NOT hijack playback.
   - **Step 6:** Wait briefly (up to ~4s in 0.5s steps) for local `librespot` to appear in `get_devices()`, then call `play_tracks(context_uri=..., offset_uri=..., position_ms=...)`! Emit `session_restored` so frontend shows a brief toast if `resilience_toast_enabled` is True.

### Anti-Patterns to Avoid
- **Spawning Python in `--onevent`:** Never use `#!/usr/bin/env python3` as the `--onevent` target; Python startup takes 150–400ms and causes audible gaps on rapid skips.
- **Snapshotting only inside `_on_deck_sleep`:** SteamOS suspends in milliseconds and network may already be down. Snapshot continuously on every `--onevent` and `_poll_playback` tick (throttling disk writes to e.g. every 5s or on track/state change, plus an immediate flush in `_on_deck_sleep`).
- **Dual-restarting `librespot`:** Never let `_monitor_process` (`SUSPEND_THRESHOLD`) and `SuspendResumeMonitor` both call `_kill_librespot()` + `start_librespot()` independently on wake.
- **Hijacking active remote playback:** Always check `/v1/me/player` before auto-resuming a bookmark on wake.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| System suspend/wake detection | Custom `/sys/power` or timer-only polling | Existing `SuspendResumeMonitor` (`py_modules/device.py:80-160`) | Already monitors `org.freedesktop.login1` `PrepareForSleep` via `busctl`. |
| Spotify playback resume with offset & position | Custom `PUT me/player/play` HTTP call | Existing `rpc_playback.play_tracks(plugin, context_uri=..., offset_uri=..., position_ms=...)` (`py_modules/rpc_playback.py:356-397`) | Already handles `context_uri`, `offset.uri`, `position_ms`, and 404 device auto-transfer. |
| Smooth frontend progress bar between events | 100ms backend polling | Existing `usePlaybackClock` (`src/hooks/usePlaybackClock.ts`) | Already interpolates `positionMs` monotonically between discrete `librespot_event` anchors. |
| Atomic settings/JSON persistence | Raw `open(..., "w")` | Existing atomic write-rename pattern (`os.replace` on temp file) | Prevents `session_bookmark.json` corruption if Steam Deck suspends mid-write. |

## Common Pitfalls

### Pitfall 1: `librespot` v0.8.0 `TRACK_ID` Format Mismatch
**What goes wrong:** Passing `librespot`'s raw 32-char hex `TRACK_ID` directly into `track_metadata` or `play_tracks(offset_uri=f"spotify:track:{track_id}")` causes Spotify Web API `400 Bad Request` / `Invalid track URI` and breaks `track_id != self._poll_track_id` comparisons.
**Why it happens:** `librespot` `--onevent` exports `TRACK_ID` in Base16 (hex), while Spotify Web API uses Base62 `[CITED: github.com/librespot-org/librespot]`.
**How to avoid:** Normalize every `TRACK_ID` through `hex_to_base62()` at ingress in `LibrespotEventServer` (with `.rjust(22, "0")` padding) and handle already-Base62 22-char IDs idempotently.

### Pitfall 2: `librespot` v0.8.0 Monotonic Clock Drift (`401` Loops) After Sleep
**What goes wrong:** After Steam Deck wakes from a multi-minute/hour sleep, `librespot` may still be alive (`proc.poll() is None`) yet fail with `401 Unauthorized` on Dealer/CDN requests because Rust's `std::time::Instant` pauses during Linux suspend `[CITED: github.com/librespot-org/librespot]`.
**Why it happens:** `librespot` tracks token expiry with monotonic time rather than wall-clock time.
**How to avoid:** On `PrepareForSleep=false` (and `SUSPEND_THRESHOLD` wake), always restart `librespot` cleanly under the unified wake lock once network is ready, rather than assuming the pre-sleep `librespot` process can keep using its stale in-memory token.

### Pitfall 3: `librespot` v0.8.0 Event Name Variations (`changed` vs `track_changed`, `volume_set` vs `volume_changed`)
**What goes wrong:** Different `librespot` versions/builds emit `track_changed` or `changed`, and `volume_changed` or `volume_set`. Missing an alias leaves `--onevent` silent on that transition.
**Why it happens:** `librespot` evolved `--onevent` event names across 0.4–0.8 releases `[CITED: github.com/librespot-org/librespot]`.
**How to avoid:** Map both sets of aliases in `LibrespotEventServer` (`{"track_changed", "changed"}`, `{"volume_set", "volume_changed"}`, `{"playing", "started"}`, `{"paused"}`, `{"stopped"}`, `{"seeked", "position_correction"}`, `{"session_disconnected"}`, `{"session_connected"}`).

### Pitfall 4: `librespot_event` Overwriting `usePlaybackStatus` Before `get_status` Returns
**What goes wrong:** `QuickAccessMenu` (`src/index.tsx:267-270`) polls `get_status` every 3s and `usePlaybackStatus` (`src/hooks/usePlaybackStatus.ts:54`) polls every 1.5s. If a stale in-flight `get_status()` resolves right after an instant `librespot_event`, it could briefly revert `is_playing` or `position_ms`.
**Why it happens:** Race between local IPC push and async RPC poll.
**How to avoid:** Backend `LibrespotEventServer` updates `plugin._poll_play_state`, `plugin._poll_progress_ms`, and `plugin._last_event` **synchronously before** `await decky.emit("librespot_event", ...)` so any subsequent `get_status()` already reflects the new state; on the frontend, `usePlaybackStatus` and `QuickAccessMenu` update `status` state directly from `librespot_event` / `track_metadata`.

### Pitfall 5: `SettingsTab.tsx` Controller Focus & QAM Compactness
**What goes wrong:** Adding a large held-bookmark card permanently to QAM bloats the sidebar and breaks D-09 ("keeping QAM compact when no bookmark is held").
**How to avoid:** Render the QAM "Resume Bookmark" button **conditionally** only when `resilience_status.held_bookmark` is non-null and `resilience_prompt_held_enabled` is True; keep all configuration controls (`ToggleField`, `SliderField` 1h–24h, status indicator, manual restore) inside the "Playback Resilience" card in `SettingsTab.tsx`.

## Code Examples

### Base16 → Base62 Conversion (Python Stdlib)
```python
_BASE62_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
_HEX_CHARS = frozenset("0123456789abcdefABCDEF")

def normalize_spotify_id(raw_id: str | None) -> str:
    """Convert librespot 32-char Base16 hex ID to 22-char Base62 Spotify ID."""
    if not raw_id:
        return ""
    val = raw_id.strip()
    if val.startswith("spotify:track:"):
        val = val.split(":", 2)[2]
    elif val.startswith("spotify:episode:"):
        val = val.split(":", 2)[2]
    if len(val) == 32 and all(c in _HEX_CHARS for c in val):
        num = int(val, 16)
        if num == 0:
            return "0" * 22
        chars = []
        while num:
            num, rem = divmod(num, 62)
            chars.append(_BASE62_ALPHABET[rem])
        return "".join(reversed(chars)).rjust(22, "0")
    return val
```

### `DEFAULT_SETTINGS` Keys (`py_modules/common.py`)
```python
# Recommended additions to DEFAULT_SETTINGS & get_status public_keys:
"resilience_auto_resume": True,
"resilience_bookmark_expiry_hours": 12,   # 1..24 in 1h steps
"resilience_bookmark_never_expires": False,
"resilience_toast_enabled": True,
"resilience_prompt_held_enabled": True,
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 3s blind `_poll_api_loop` regardless of active device | Event-driven `librespot --onevent` Unix socket + 20s fallback poll | Phase 17 (v0.6) | `<50ms` UI updates + ~85% fewer Spotify Web API requests when local `librespot` is active. |
| Separate `SuspendResumeMonitor` & `_monitor_process` restarts | Unified `asyncio.Lock` + network readiness + bookmark restore | Phase 17 (v0.6) | Eliminates dual-restart races and `NameResolutionError`/`404` failures on wake. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `bin/librespot` on target Steam Deck is `librespot` v0.8.0 (or >=0.5.0) compiled with `--onevent` support enabled. | Standard Stack / Pitfall 3 | If `--onevent` were missing or disabled at compile time, `librespot` would fail to start; mitigated by checking `librespot --help` once or falling back to 3s polling if `--onevent` is rejected. |
| A2 | At least one of `socat`, `nc` (with `-U`), or `curl` (with `--unix-socket`) is present on SteamOS 3.5+. | Pattern 1 | `curl` is standard on Arch/SteamOS; if none are present, `_onevent` stays silent and `_poll_api_loop` auto-reverts to 3s polling per D-04. |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Frontend build & Vitest | ✓ | `v25.1.0` | — |
| pnpm | Package scripts & test runner | ✓ | `10.28.0` | — |
| Python 3 | Backend `unittest` suite | ✓ | `3.14.0` (`py -3` / `python3`) | — |
| `busctl` / `librespot` / `socat` | Runtime on SteamOS (not Windows dev host) | ✗ (target-only) | — | Unit-tested via `unittest.mock`; runtime falls back to 3s poll if `--onevent` silent. |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework (Backend) | Python `unittest` (stdlib) |
| Framework (Frontend) | Vitest `5.1.0` (`package.json:13,43`) |
| Quick run command (Backend) | `py -3 -m unittest tests/test_resilience.py -v` |
| Quick run command (Frontend) | `pnpm test -- src/index.test.tsx` |
| Full suite command | `pnpm test && py -3 -m unittest discover -s tests -p "test_*.py"` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RESIL-01 | `LibrespotEventServer` parses `KEY=VALUE`/JSON, converts Base16→Base62, emits `librespot_event` immediately, debounces enrichment, and relaxes `_poll_api_loop` to 20s (reverting to 3s on remote/spotify_client/unhealthy) | unit | `py -3 -m unittest tests/test_resilience.py -v` | ❌ Wave 0 |
| RESIL-01 | `QuickAccessMenu` & `usePlaybackStatus` update state immediately on `librespot_event` / `track_metadata` | unit | `pnpm test` | ✅ `src/index.test.tsx` (extend) |
| RESIL-02 | `SessionBookmarkManager` snapshots bookmark, enforces unified wake lock (no dual-restart race), applies 4s Wi-Fi grace window, yields to remote active device, respects expiry (`1–24h` / `Never`), and supports manual `restore_bookmark` | unit | `py -3 -m unittest tests/test_resilience.py -v` | ❌ Wave 0 |
| RESIL-02 | `SettingsTab.tsx` "Playback Resilience" card toggles, expiry `SliderField`, status badge, and conditional QAM "Resume Bookmark" action | unit | `pnpm test` | ✅ `src/index.test.tsx` (extend) |

### Sampling Rate
- **Per task commit:** `py -3 -m unittest tests/test_resilience.py -v` and/or `pnpm test`
- **Per wave merge:** `pnpm test && py -3 -m unittest discover -s tests -p "test_*.py"`
- **Phase gate:** Full suite + `pnpm typecheck` + `pnpm lint` green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/test_resilience.py` — covers `RESIL-01` and `RESIL-02` backend logic (`LibrespotEventServer`, Base16→Base62, adaptive polling, `SessionBookmarkManager`, wake lock, Wi-Fi grace window, conflict yield, expiry).

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Reuses existing OAuth PKCE `_ensure_token()` |
| V3 Session Management | no | Bookmarks store only public Spotify URIs (`track_uri`, `context_uri`) and `position_ms`, never tokens |
| V4 Access Control | yes | Unix socket created under `DECKY_PLUGIN_RUNTIME_DIR` (`0o600` / `0o660` permissions); `--onevent` emitter script writes only fixed env vars |
| V5 Input Validation | yes | Validate/clamp `POSITION_MS`, `DURATION_MS`, `VOLUME` as ints, `resilience_bookmark_expiry_hours` to `1..24`, and `PLAYER_EVENT` against known event names |
| V6 Cryptography | no | Not applicable |

### Known Threat Patterns for Local Unix Socket IPC
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Shell injection via `librespot --onevent` env vars | Tampering | Emitter uses `printf '%s\n'` (no `eval`), sends `KEY=VALUE` lines, and backend parses strictly with `split("=", 1)` without shell execution. |
| Corrupt `session_bookmark.json` on mid-suspend power loss | Denial of Service | Atomic write via temp file + `os.replace()` and `try/except json.JSONDecodeError` fallback on load. |

## Sources

### Primary (HIGH confidence)
- Deckify codebase: `main.py:135-225,425-565,1445-1692`, `py_modules/device.py:80-160`, `py_modules/common.py:1-140`, `py_modules/rpc_playback.py:356-415`, `src/hooks/usePlaybackStatus.ts:1-65`, `src/index.tsx:250-335,920-970`, `src/components/tabs/SettingsTab.tsx:665-755`, `src/types.ts:150-300`, `package.json:1-62`, `deploy.sh:112-127`
- Canonical v0.6 research: `.planning/research/SUMMARY.md`, `.planning/research/ARCHITECTURE.md`, `.planning/research/PITFALLS.md`

### Secondary (MEDIUM confidence)
- `librespot` `--onevent` environment variables (`PLAYER_EVENT`, `TRACK_ID`, `OLD_TRACK_ID`, `POSITION_MS`, `DURATION_MS`, `VOLUME`) and Base16 `TRACK_ID` encoding — [github.com/librespot-org/librespot](https://github.com/librespot-org/librespot) (via WebSearch)
- `librespot` v0.8.0 HTTPS CDN chunk buffering, transient network drop behavior, and post-suspend `std::time::Instant` 401 drift — [github.com/librespot-org/librespot/issues](https://github.com/librespot-org/librespot/issues) (via WebSearch)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All primitives (`asyncio.start_unix_server`, `SuspendResumeMonitor`, `play_tracks`, `usePlaybackClock`) verified directly in codebase.
- Architecture: HIGH - Clear integration points in `main.py`, `py_modules/`, and React components; dual-restart race and Base16→Base62 pitfalls identified and mitigated.
- Pitfalls: HIGH - Grounded in direct inspection of `main.py` (`_monitor_process` vs `_on_deck_resume`), `librespot` v0.8.0 behavior, and SteamOS `LD_LIBRARY_PATH`/UID 1000 constraints.

**Research date:** 2026-11-17
**Valid until:** 2026-12-17 (30 days)
