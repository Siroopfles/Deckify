import asyncio
import base64
import errno
import glob
import hashlib
import json
import os
import re
import secrets
import socket
import ssl
import struct
import subprocess
import time
import urllib.parse
import urllib.request
from html import escape

try:
    import decky
except ImportError:
    from py_modules.common import decky

# Decky Loader (PyInstaller) injects LD_LIBRARY_PATH pointing to its bundled
# libs which are older than the system's.  Subprocesses like openssl and
# librespot then load the wrong libssl/libcrypto and crash.  Strip it early.
os.environ.pop("LD_LIBRARY_PATH", None)

import sys
for _dir in [
    os.path.dirname(__file__),
    os.path.join(os.path.dirname(__file__), "bin"),
]:
    if _dir and os.path.isdir(_dir) and _dir not in sys.path:
        sys.path.insert(0, _dir)  # pragma: no cover

from py_modules import *
from py_modules import common


def _load_settings(settings_file: str | None = None) -> dict:
    return common._load_settings(settings_file or SETTINGS_FILE)


def _save_settings(settings: dict, settings_file: str | None = None) -> None:
    return common._save_settings(settings, settings_file or SETTINGS_FILE)


if hasattr(os, "geteuid") and os.geteuid() == 0:  # pragma: no cover
    try:
        os.chown(os.path.dirname(__file__), DECK_UID, DECK_UID)
    except Exception:
        pass


class Plugin:
    _process: subprocess.Popen | None = None
    _kwin_process: subprocess.Popen | None = None
    _spotify_client_process: subprocess.Popen | None = None
    _virtual_display: str | None = None
    _monitor_task: asyncio.Task | None = None
    _api_poll_task: asyncio.Task | None = None
    _settings: dict = {}
    _last_event: dict | None = None
    _track_meta: dict | None = None
    # OAuth / Spotify API state
    _oauth_server = None
    _pkce_verifier: str | None = None
    _oauth_redirect_uri: str | None = None
    _access_token: str | None = None
    _refresh_token: str | None = None
    _token_expires_at: float = 0
    _token_retry_at: float = 0
    # Playback poll state
    _poll_play_state: str | None = None   # "playing" | "paused" | None
    _poll_track_id: str | None = None
    _poll_volume: int | None = None
    _active_device: dict | None = None  # {id, name, type}
    _shuffle_state: bool = False
    _repeat_state: str = "off"
    _is_liked: bool = False
    _context_uri: str = ""
    _audio_stream_info: dict | None = None
    # Token refresh lock (initialized in _main)
    _token_refresh_lock: asyncio.Lock | None = None
    # Crash auto-restart state
    _crash_timestamps: list = []
    _pa_volume_boosted: bool = False
    _stable_start: float = 0
    # Sleep Timer State
    _sleep_timer_task: asyncio.Task | None = None
    _sleep_timer_end: float = 0
    _sleep_timer_shutdown: bool = False
    _sleep_timer_end_of_track: bool = False
    _sleep_timer_initial_track_id: str | None = None
    _liked_cache: dict[str, tuple[float, bool]] = {}

    def __init__(self):
        self._crash_timestamps = []
        self._liked_cache = {}

    # ── Lifecycle ──────────────────────────────────────────────

    async def _main(self):
        self._token_refresh_lock = asyncio.Lock()
        self._crash_timestamps = []
        self._settings = _load_settings()
        # Restore persisted tokens
        self._access_token = self._settings.get("access_token")
        self._refresh_token = self._settings.get("refresh_token")
        self._token_expires_at = self._settings.get("token_expires_at", 0)
        safe_keys = {k: v for k, v in self._settings.items()
                     if k not in ("access_token", "refresh_token", "token_expires_at", "spotify_client_id", "spotify_folder_tree")}
        decky.logger.info("Deckify loaded, settings: %s", safe_keys)
        self._suspend_monitor = SuspendResumeMonitor(
            on_sleep=self._on_deck_sleep,
            on_resume=self._on_deck_resume,
        )
        self._suspend_monitor.start()
        if self._access_token:
            self._start_api_poll()
        await self._sync_native_spotify_folders()
        await self.start_librespot()

    async def _unload(self):
        decky.logger.info("Deckify unloading")
        if self._sleep_timer_task and not self._sleep_timer_task.done():
            self._sleep_timer_task.cancel()
            self._sleep_timer_task = None
        if hasattr(self, "_suspend_monitor") and self._suspend_monitor:
            await self._suspend_monitor.stop()
            self._suspend_monitor = None
        await self._stop_monitor()
        await self._kill_librespot()
        await self._kill_spotify_client()
        await self._stop_oauth_server()
        await self._stop_api_poll()

    async def _on_deck_sleep(self):
        decky.logger.info("Deck entering sleep")

    async def _on_deck_resume(self):
        decky.logger.info("Deck resumed from suspend - recovering token and audio state")
        try:
            await self._ensure_token()
            await self._poll_playback()
            await self._refresh_audio_stream_info()
            await decky.emit("deck_resumed")
        except Exception as e:
            decky.logger.warning("Resume handler error: %s", e)

    async def _uninstall(self):
        decky.logger.info("Deckify uninstalling")
        if self._sleep_timer_task and not self._sleep_timer_task.done():
            self._sleep_timer_task.cancel()
            self._sleep_timer_task = None
        if hasattr(self, "_suspend_monitor") and self._suspend_monitor:
            await self._suspend_monitor.stop()
            self._suspend_monitor = None
        await self._stop_monitor()
        await self._kill_librespot()
        await self._kill_spotify_client()
        await self._stop_oauth_server()
        await self._stop_api_poll()

    async def _migration(self):
        decky.logger.info("Deckify migrating")
        decky.migrate_logs(
            os.path.join(decky.DECKY_USER_HOME, ".config", "deckify", "deckify.log")
        )
        decky.migrate_settings(
            os.path.join(decky.DECKY_HOME, "settings", "deckify.json"),
            os.path.join(decky.DECKY_USER_HOME, ".config", "deckify"),
        )
        decky.migrate_runtime(
            os.path.join(decky.DECKY_HOME, "deckify"),
            os.path.join(decky.DECKY_USER_HOME, ".local", "share", "deckify"),
        )

    # ── Audio Engine management (librespot vs Official Spotify Client) ──

    def _is_librespot_running(self) -> bool:
        return self._process is not None and self._process.poll() is None

    def _is_spotify_client_running(self) -> bool:
        return (
            self._spotify_client_process is not None
            and self._spotify_client_process.poll() is None
        )

    def _is_engine_running(self) -> bool:
        backend = self._settings.get("audio_backend", "librespot")
        if backend == "spotify_client":
            return self._is_spotify_client_running()
        return self._is_librespot_running()

    async def _configure_pipewire_clock(self, unlock_lossless: bool) -> None:
        """Unlock 44.1kHz/88.2kHz/96kHz in PipeWire when Lossless is active, or restore default 48kHz."""
        rates = "[ 44100 48000 88200 96000 ]" if unlock_lossless else "[ 48000 ]"
        try:
            cmd, env = _build_deck_command(["pw-metadata", "-n", "settings", "0", "clock.allowed-rates", rates])
            await _exec(lambda: subprocess.run(cmd, env=env, capture_output=True, text=True), timeout=5)
            decky.logger.info("PipeWire clock.allowed-rates set to %s", rates)
        except Exception as e:
            decky.logger.warning("Failed to configure PipeWire clock rates: %s", e)

    def _write_spotify_client_prefs(self) -> None:
        """Write audio quality and playback settings to the Official Spotify Client prefs files."""
        try:
            os.makedirs(SPOTIFY_CLIENT_CONFIG_DIR, exist_ok=True)
            quality = str(self._settings.get("audio_quality", "320")).lower()
            gapless = bool(self._settings.get("gapless", True))
            normalisation = bool(self._settings.get("normalisation", True))

            target_files = [os.path.join(SPOTIFY_CLIENT_CONFIG_DIR, "prefs")]
            users_dir = os.path.join(SPOTIFY_CLIENT_CONFIG_DIR, "Users")
            if os.path.isdir(users_dir):
                for user_sub in os.listdir(users_dir):
                    sub_path = os.path.join(users_dir, user_sub)
                    if os.path.isdir(sub_path):
                        target_files.append(os.path.join(sub_path, "prefs"))

            for pfile in target_files:
                existing = ""
                if os.path.isfile(pfile):
                    try:
                        with open(pfile, "r", encoding="utf-8", errors="ignore") as f:
                            existing = f.read()
                    except Exception:
                        pass
                updated = _update_spotify_prefs_content(existing, quality, gapless, normalisation)
                with open(pfile, "w", encoding="utf-8") as f:
                    f.write(updated)
                if hasattr(os, "chown") and hasattr(os, "geteuid") and os.geteuid() == 0:
                    try:
                        os.chown(pfile, DECK_UID, DECK_UID)
                    except Exception:
                        pass
        except Exception as e:
            decky.logger.warning("Failed to write Spotify client prefs: %s", e)

    async def _sync_spotify_client_quality_cdp(self, quality: str) -> None:
        """Apply streaming quality live inside the running Official Spotify Client via SettingsAPI."""
        if not self._spotify_client_process or self._spotify_client_process.poll() is not None:
            return
        enum_map = {"96": 2, "160": 3, "320": 4, "lossless": 5}
        q_enum = enum_map.get(str(quality).lower(), 4)
        expr = f"""
        (async () => {{
          const mainEl = document.getElementById('main');
          if (!mainEl) return false;
          const rk = Object.keys(mainEl).find(k => k.startsWith('__reactContainer'));
          const q = [mainEl[rk]];
          const visited = new Set();
          let reg = null;
          while (q.length > 0 && visited.size < 1000) {{
            const curr = q.shift();
            if (!curr || visited.has(curr)) continue;
            visited.add(curr);
            let m = curr.memoizedState;
            while (m) {{
              if (m.memoizedState && typeof m.memoizedState === 'object') {{
                const val = m.memoizedState;
                if (val._map && val._map instanceof Map) {{ reg = val._map; break; }}
                if (val.value && typeof val.value.getRegistry === 'function') {{ reg = val.value.getRegistry()._map; break; }}
              }}
              m = m.next;
            }}
            if (reg) break;
            if (curr.child) q.push(curr.child);
            if (curr.sibling) q.push(curr.sibling);
          }}
          if (!reg) return false;
          for (const [k, v] of reg.entries()) {{
            if (String(k.description) === 'SettingsAPI') {{
              const s = v.instance;
              if (s.quality && s.quality.streamingQuality && typeof s.quality.streamingQuality.setValue === 'function') {{
                await s.quality.streamingQuality.setValue({q_enum});
                return true;
              }}
            }}
          }}
          return false;
        }})()
        """
        try:
            await _exec(_cdp_evaluate, expr, SPOTIFY_CDP_PORT, None, 4.0, timeout=5)
        except Exception as e:
            decky.logger.debug("CDP quality sync failed: %s", e)

    async def start_spotify_client(self) -> dict:
        """Start the Official Spotify Linux Client headless in the background (stopping librespot first)."""
        # Cleanly stop librespot so both engines never run simultaneously
        await self._stop_monitor()
        await self._kill_librespot()

        if self._spotify_client_process and self._spotify_client_process.poll() is None:
            return {"ok": True, "message": "already running", "audio_backend": "spotify_client"}

        await self._kill_spotify_client()
        self._write_spotify_client_prefs()

        is_lossless = (
            self._settings.get("audio_quality") == "lossless"
            and bool(self._settings.get("bit_perfect_clock", True))
        )
        await self._configure_pipewire_clock(is_lossless)

        try:
            before_x = set(glob.glob("/tmp/.X11-unix/X*"))
            kwin_cmd, kwin_env = _build_deck_command([
                "kwin_wayland", "--virtual", "--xwayland",
                "--socket", "wayland-spotify",
                "--width", "1280", "--height", "800",
            ])
            self._kwin_process = subprocess.Popen(
                kwin_cmd,
                env=kwin_env,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            # Wait up to 3s for virtual Xwayland socket
            disp = ":2"
            for _ in range(15):
                await asyncio.sleep(0.2)
                after_x = set(glob.glob("/tmp/.X11-unix/X*"))
                new_x = sorted(after_x - before_x)
                if new_x:
                    disp = ":" + new_x[0].split("X")[-1]
                    break
            self._virtual_display = disp

            sp_cmd, sp_env = _build_deck_command(
                [
                    "flatpak", "run",
                    "--nosocket=wayland",
                    f"--env=DISPLAY={disp}",
                    "--command=/app/extra/bin/spotify",
                    SPOTIFY_FLATPAK_ID,
                    f"--remote-debugging-port={SPOTIFY_CDP_PORT}",
                ],
                extra_env={"DISPLAY": disp},
            )
            sp_env.pop("WAYLAND_DISPLAY", None)
            decky.logger.info("Starting Official Spotify Client on virtual display %s", disp)
            self._spotify_client_process = subprocess.Popen(
                sp_cmd,
                env=sp_env,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        except Exception as e:
            msg = f"Failed to start Official Spotify Client: {e}"
            decky.logger.error(msg)
            await self._kill_spotify_client()
            await decky.emit("librespot_status", {"running": False, "error": msg, "audio_backend": "spotify_client"})
            return {"ok": False, "error": msg}

        self._last_event = None
        self._pa_volume_boosted = False
        self._start_monitor()
        await decky.emit("librespot_status", {"running": True, "error": None, "audio_backend": "spotify_client"})
        decky.logger.info("Official Spotify Client started, pid=%d display=%s", self._spotify_client_process.pid, self._virtual_display)
        return {"ok": True, "pid": self._spotify_client_process.pid, "audio_backend": "spotify_client"}

    async def stop_spotify_client(self) -> dict:
        await self._stop_monitor()
        await self._kill_spotify_client()
        self._last_event = None
        await decky.emit("librespot_status", {"running": False, "error": None, "audio_backend": "spotify_client"})
        return {"ok": True}

    async def start_librespot(self) -> dict:
        if self._settings.get("audio_backend") == "spotify_client":
            return await self.start_spotify_client()

        # Ensure Official Spotify Client is cleanly stopped before starting librespot
        await self._kill_spotify_client()
        await self._configure_pipewire_clock(False)

        if self._process and self._process.poll() is None:
            return {"ok": True, "message": "already running", "audio_backend": "librespot"}

        self._kill_stale_librespot()

        if not os.path.isfile(LIBRESPOT_BIN):
            msg = f"librespot binary not found at {LIBRESPOT_BIN}"
            decky.logger.error(msg)
            await decky.emit("librespot_status", {"running": False, "error": msg})
            return {"ok": False, "error": msg}

        os.makedirs(CACHE_DIR, exist_ok=True)

        settings = self._settings
        bitrate_str = str(settings.get("audio_quality", settings.get("bitrate", 320)))
        if bitrate_str not in VALID_LIBRESPOT_QUALITIES:
            bitrate_str = "320"
        cmd = [
            LIBRESPOT_BIN,
            "--name", settings.get("device_name") or socket.gethostname(),
            "--device-type", "computer",
            "--bitrate", bitrate_str,
            "--backend", "pulseaudio",
            "--system-cache", CACHE_DIR,
        ]
        if settings.get("normalisation", True):
            cmd.extend([
                "--enable-volume-normalisation",
                "--normalisation-method", "dynamic",
                "--normalisation-gain-type", "auto",
                "--normalisation-pregain", str(float(settings.get("normalisation_pregain", 0.0))),
            ])
        if not settings.get("gapless", True):
            cmd.append("--disable-gapless")
        if "autoplay" in settings:
            cmd.extend(["--autoplay", "on" if settings.get("autoplay") else "off"])

        env = os.environ.copy()
        env["PULSE_SERVER"] = PULSE_SERVER

        decky.logger.info("Starting librespot: %s", " ".join(cmd))
        try:
            self._process = subprocess.Popen(
                cmd,
                env=env,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        except Exception as e:
            msg = f"Failed to start librespot: {e}"
            decky.logger.error(msg)
            await decky.emit("librespot_status", {"running": False, "error": msg})
            return {"ok": False, "error": msg}

        self._last_event = None
        self._pa_volume_boosted = False
        self._write_pid(self._process.pid)
        self._start_monitor()
        await decky.emit("librespot_status", {"running": True, "error": None, "audio_backend": "librespot"})
        decky.logger.info("librespot started, pid=%d", self._process.pid)
        return {"ok": True, "pid": self._process.pid, "audio_backend": "librespot"}

    async def stop_librespot(self) -> dict:
        await self._stop_monitor()
        await self._kill_librespot()
        await self._kill_spotify_client()
        self._last_event = None
        await decky.emit("librespot_status", {"running": False, "error": None})
        return {"ok": True}

    async def switch_audio_backend(self, backend: str) -> dict:
        """Cleanly shut down the previous backend and start the newly selected backend."""
        return await self.set_setting("audio_backend", backend)

    async def get_status(self) -> dict:
        running = self._is_engine_running()
        is_playing = self._poll_play_state == "playing"
        position_ms = self._last_event.get("position_ms", 0) if self._last_event else 0
        duration_ms = self._last_event.get("duration_ms", 0) if self._last_event else 0
        public_keys = (
            "device_name", "audio_backend", "audio_quality", "bitrate",
            "bit_perfect_clock", "spotify_client_id", "normalisation",
            "normalisation_pregain", "gapless", "autoplay", "playlist_folders",
            "spotify_folder_tree", "game_audio_profiles", "auto_ducking",
            "auto_ducking_volume", "gamepad_chords_enabled", "toast_enabled",
            "toast_position", "overlay_enabled", "overlay_position", "eq_preset",
        )
        return {
            "authenticated": bool(self._access_token),
            "running": running,
            "librespot_running": self._is_librespot_running(),
            "spotify_client_running": self._is_spotify_client_running(),
            "audio_backend": self._settings.get("audio_backend", "librespot"),
            "binary_found": os.path.isfile(LIBRESPOT_BIN),
            "settings": {k: v for k, v in self._settings.items() if k in public_keys},
            "last_event": self._last_event,
            "track_meta": self._track_meta,
            "track": self._track_meta,
            "volume": self._poll_volume,
            "active_device": self._active_device,
            "is_playing": is_playing,
            "play_state": self._poll_play_state,
            "position_ms": position_ms,
            "duration_ms": duration_ms,
            "shuffle_state": self._shuffle_state,
            "repeat_state": self._repeat_state,
            "is_liked": self._is_liked,
            "context_uri": self._context_uri,
            "audio_stream_info": self._audio_stream_info,
            "sleep_timer": self.get_sleep_timer_status(),
        }

    async def get_settings(self) -> dict:
        return dict(self._settings)

    async def set_setting(self, key: str, value) -> dict:
        if key not in DEFAULT_SETTINGS:
            return {"ok": False, "error": f"unknown setting: {key}"}
        backend_changed = False
        quality_changed = False
        if key == "device_name":
            if not isinstance(value, str) or any(ord(char) < 32 or ord(char) == 127 for char in value):
                return {"ok": False, "error": "Device name must be text without control characters"}
            value = value.strip()
            self._settings["device_name_customized"] = True
        elif key == "audio_backend":
            value = str(value).strip().lower()
            if value not in VALID_AUDIO_BACKENDS:
                return {"ok": False, "error": f"Invalid audio_backend: {value}"}
            prev_backend = self._settings.get("audio_backend", "librespot")
            backend_changed = value != prev_backend
            if value == "librespot" and self._settings.get("audio_quality") == "lossless":
                self._settings["audio_quality"] = "320"
                self._settings["bitrate"] = 320
        elif key == "audio_quality":
            value = str(value).strip().lower()
            current_backend = self._settings.get("audio_backend", "librespot")
            if current_backend == "librespot":
                if value == "lossless":
                    return {"ok": False, "error": "Lossless audio requires the Official Spotify Client backend"}
                if value not in VALID_LIBRESPOT_QUALITIES:
                    return {"ok": False, "error": f"Invalid audio_quality for librespot: {value}"}
                self._settings["bitrate"] = int(value)
            else:
                if value not in VALID_SPOTIFY_CLIENT_QUALITIES:
                    return {"ok": False, "error": f"Invalid audio_quality: {value}"}
                self._settings["bitrate"] = 320 if value == "lossless" else int(value)
            quality_changed = True
        elif key == "bitrate":
            try:
                bval = int(value)
            except (TypeError, ValueError):
                return {"ok": False, "error": "bitrate must be 96, 160, or 320"}
            if bval not in (96, 160, 320):
                return {"ok": False, "error": "bitrate must be 96, 160, or 320"}
            value = bval
            self._settings["audio_quality"] = str(bval)
            quality_changed = True
        elif key in ("normalisation", "gapless", "autoplay", "bit_perfect_clock", "overlay_enabled", "toast_enabled", "gamepad_chords_enabled", "auto_ducking"):
            value = bool(value)
        elif key == "overlay_position":
            valid_positions = {"top-left", "top-right", "bottom-left", "bottom-right"}
            pos = str(value).strip().lower().replace("_", "-")
            if pos not in valid_positions:
                return {"ok": False, "error": f"Invalid overlay_position: {value}"}
            value = pos
        elif key == "toast_position":
            pos = str(value).strip().lower().replace("-", "_")
            value = pos
        elif key == "auto_ducking_volume":
            try:
                value = max(0, min(100, int(value)))
            except (TypeError, ValueError):
                return {"ok": False, "error": "auto_ducking_volume must be an integer (0-100)"}
        elif key == "eq_preset":
            val = str(value).strip().lower()
            if val not in ("flat", "bass", "vocal", "gaming"):
                return {"ok": False, "error": f"Invalid eq_preset: {value}"}
            value = val
            await self._apply_equalizer_preset(val)
        elif key == "normalisation_pregain":
            try:
                value = max(-10.0, min(10.0, float(value)))
            except (TypeError, ValueError):
                return {"ok": False, "error": "normalisation_pregain must be a number"}
        elif key == "playlist_folders":
            if not isinstance(value, list):
                return {"ok": False, "error": "playlist_folders must be a list"}
        elif key == "game_audio_profiles":
            if not isinstance(value, dict):
                return {"ok": False, "error": "game_audio_profiles must be a dict"}
        self._settings[key] = value
        _save_settings(self._settings)
        decky.logger.info("Setting updated: %s = %s", key, value)

        if backend_changed:
            # Cleanly stop the old backend and start the new one
            if value == "spotify_client":
                await self.start_spotify_client()
            else:
                await self.start_librespot()
        elif quality_changed and self._settings.get("audio_backend") == "spotify_client":
            self._write_spotify_client_prefs()
            await self._sync_spotify_client_quality_cdp(str(self._settings.get("audio_quality", "320")))
            await self._configure_pipewire_clock(
                self._settings.get("audio_quality") == "lossless"
                and bool(self._settings.get("bit_perfect_clock", True))
            )

        try:
            await decky.emit("settings_changed", dict(self._settings))
        except Exception:
            pass

        return {"ok": True, "settings": dict(self._settings)}

    # ── Playback control callable methods ────────────────────────

    async def control_playback(self, action: str, device_id: str = "") -> dict:
        decky.logger.info("control_playback: action=%s device_id=%s", action, device_id)
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}

        if action == "play_pause":
            action = "pause" if self._poll_play_state == "playing" else "play"

        action_map = {
            "play": ("PUT", "me/player/play"),
            "pause": ("PUT", "me/player/pause"),
            "next": ("POST", "me/player/next"),
            "previous": ("POST", "me/player/previous"),
        }
        if action not in action_map:
            return {"ok": False, "error": f"Unknown action: {action}"}

        method, endpoint = action_map[action]
        params = {"device_id": device_id} if device_id else None
        try:
            await _exec(_spotify_api_request, endpoint, token, method, params)
            if action == "play":
                self._poll_play_state = "playing"
            elif action == "pause":
                self._poll_play_state = "paused"
            return {"ok": True}
        except urllib.error.HTTPError as e:
            if e.code == 404 and action == "play":
                return await self._auto_transfer_and_play(token, device_id)
            if e.code == 404:
                return {"ok": False, "error": "No active device — connect via Spotify app first"}
            return {"ok": False, "error": _parse_spotify_error(e)}
        except Exception as e:
            decky.logger.error("control_playback(%s) failed: %s", action, e)
            return {"ok": False, "error": str(e)}

    async def _auto_transfer_and_play(self, token: str, device_id: str = "") -> dict:
        if not device_id:
            try:
                data = await _exec(_spotify_api_request, "me/player/devices", token)
                devices = data.get("devices", []) if data else []
                if devices:
                    device_id = devices[0]["id"]
                    decky.logger.info("No device_id provided, picked %s (%s)", devices[0].get("name"), device_id)
            except Exception as e:
                decky.logger.error("Failed to fetch devices for auto-transfer: %s", e)
        if not device_id:
            return {"ok": False, "error": "No active device — connect via Spotify app first"}
        try:
            decky.logger.info("Auto-transferring playback to %s", device_id)
            await _exec(
                _spotify_api_request, "me/player", token, "PUT", None,
                {"device_ids": [device_id], "play": True},
            )
            self._poll_play_state = "playing"
            return {"ok": True}
        except Exception as e:
            decky.logger.error("Auto-transfer failed: %s", e)
            return {"ok": False, "error": "No active device — connect via Spotify app first"}

    async def set_volume(self, volume_percent: int) -> dict:
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}

        volume_percent = max(0, min(100, int(volume_percent)))
        try:
            await _exec(
                _spotify_api_request, "me/player/volume", token, "PUT",
                {"volume_percent": volume_percent},
            )
            return {"ok": True}
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return {"ok": False, "error": "No active device found"}
            return {"ok": False, "error": _parse_spotify_error(e)}
        except Exception as e:
            decky.logger.error("set_volume(%d) failed: %s", volume_percent, e)
            return {"ok": False, "error": str(e)}

    async def seek_playback(self, position_ms: int, device_id: str = "") -> dict:
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        position_ms = max(0, int(position_ms))
        params: dict = {"position_ms": position_ms}
        if device_id:
            params["device_id"] = device_id
        try:
            await _exec(_spotify_api_request, "me/player/seek", token, "PUT", params)
            if self._last_event:
                self._last_event["position_ms"] = position_ms
            return {"ok": True, "position_ms": position_ms}
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return {"ok": False, "error": "No active device found"}
            return {"ok": False, "error": _parse_spotify_error(e)}
        except Exception as e:
            decky.logger.error("seek_playback(%d) failed: %s", position_ms, e)
            return {"ok": False, "error": str(e)}

    async def set_shuffle(self, state: bool, device_id: str = "") -> dict:
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        state_bool = bool(state)
        params: dict = {"state": "true" if state_bool else "false"}
        if device_id:
            params["device_id"] = device_id
        try:
            await _exec(_spotify_api_request, "me/player/shuffle", token, "PUT", params)
            self._shuffle_state = state_bool
            await decky.emit("playback_modes", {
                "shuffle_state": self._shuffle_state,
                "repeat_state": self._repeat_state,
            })
            return {"ok": True, "shuffle_state": self._shuffle_state}
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return {"ok": False, "error": "No active device found"}
            return {"ok": False, "error": _parse_spotify_error(e)}
        except Exception as e:
            decky.logger.error("set_shuffle(%s) failed: %s", state, e)
            return {"ok": False, "error": str(e)}

    async def set_repeat(self, state: str, device_id: str = "") -> dict:
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        if state not in ("off", "context", "track"):
            return {"ok": False, "error": f"Invalid repeat state: {state}"}
        params: dict = {"state": state}
        if device_id:
            params["device_id"] = device_id
        try:
            await _exec(_spotify_api_request, "me/player/repeat", token, "PUT", params)
            self._repeat_state = state
            await decky.emit("playback_modes", {
                "shuffle_state": self._shuffle_state,
                "repeat_state": self._repeat_state,
            })
            return {"ok": True, "repeat_state": self._repeat_state}
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return {"ok": False, "error": "No active device found"}
            return {"ok": False, "error": _parse_spotify_error(e)}
        except Exception as e:
            decky.logger.error("set_repeat(%s) failed: %s", state, e)
            return {"ok": False, "error": str(e)}

    async def _check_tracks_liked(self, token: str, track_ids: list[str]) -> dict[str, bool]:
        """Batch-check saved status via Spotify's /me/tracks/contains endpoint with cache."""
        clean_ids = [tid for tid in dict.fromkeys(track_ids) if tid]
        if not clean_ids:
            return {}
        result: dict[str, bool] = {}
        missing_ids: list[str] = []
        now = time.time()
        for tid in clean_ids:
            if tid in self._liked_cache and (now - self._liked_cache[tid][0]) < 300:
                result[tid] = self._liked_cache[tid][1]
            else:
                missing_ids.append(tid)

        if not missing_ids:
            return result

        for i in range(0, len(missing_ids), 50):
            chunk = missing_ids[i:i + 50]
            ids_str = ",".join(chunk)
            try:
                res = await _exec(
                    _spotify_api_request, "me/tracks/contains", token, "GET",
                    {"ids": ids_str},
                )
                if isinstance(res, list):
                    for tid, flag in zip(chunk, res):
                        b_flag = bool(flag)
                        result[tid] = b_flag
                        self._liked_cache[tid] = (now, b_flag)
            except Exception as e:
                decky.logger.warning("me/tracks/contains check failed: %s", e)
        return result

    async def _annotate_tracks_liked(self, token: str, tracks: list[dict]) -> None:
        ids = [t.get("id") for t in tracks if t.get("id")]
        liked_map = await self._check_tracks_liked(token, ids)
        for t in tracks:
            tid = t.get("id")
            t["is_liked"] = bool(liked_map.get(tid, False)) if tid else False

    async def toggle_like_track(self, track_id: str = "", liked: bool | None = None) -> dict:
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        target_id = (track_id or self._poll_track_id or "").strip()
        if target_id.startswith("spotify:track:"):
            target_id = target_id.split(":")[-1]
        if not target_id:
            return {"ok": False, "error": "No active track"}
        if liked is None:
            if target_id == self._poll_track_id:
                target_liked = not self._is_liked
            else:
                checked = await self._check_tracks_liked(token, [target_id])
                target_liked = not checked.get(target_id, False)
        else:
            target_liked = bool(liked)
        method = "PUT" if target_liked else "DELETE"
        try:
            await _exec(
                _spotify_api_request, "me/tracks", token, method,
                {"ids": target_id},
            )
            now = time.time()
            self._liked_cache[target_id] = (now, target_liked)
            if target_id == self._poll_track_id:
                self._is_liked = target_liked
                if self._track_meta:
                    self._track_meta["is_liked"] = target_liked
                    await decky.emit("track_metadata", self._track_meta)
            return {"ok": True, "track_id": target_id, "is_liked": target_liked}
        except urllib.error.HTTPError as e:
            return {"ok": False, "error": _parse_spotify_error(e)}
        except Exception as e:
            decky.logger.error("toggle_like_track(%s) failed: %s", target_id, e)
            return {"ok": False, "error": str(e)}

    async def get_queue(self) -> dict:
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        try:
            data = await _exec(_spotify_api_request, "me/player/queue", token, "GET")
            if not data:
                return {"ok": True, "currently_playing": None, "queue": []}

            def _fmt(item: dict | None) -> dict | None:
                if not item:
                    return None
                if item.get("type") == "episode":
                    show = item.get("show") or {}
                    artists = show.get("name", "Podcast")
                    album = ""
                    images = item.get("images") or show.get("images") or []
                else:
                    artists = ", ".join(a["name"] for a in item.get("artists", []))
                    album = item.get("album", {}).get("name", "")
                    images = item.get("album", {}).get("images") or []
                    artist_id = (item.get("artists") or [{}])[0].get("id", "")
                    album_id = item.get("album", {}).get("id", "")
                return {
                    "id": item.get("id"),
                    "name": item.get("name", ""),
                    "artist": artists,
                    "album": album,
                    "artist_id": artist_id if item.get("type") != "episode" else "",
                    "album_id": album_id if item.get("type") != "episode" else "",
                    "uri": item.get("uri", ""),
                    "duration_ms": item.get("duration_ms", 0),
                    "image_url": _image_url(images),
                    "artwork_url": _image_url(images),
                }

            queue_items = []
            for q in (data.get("queue") or [])[:30]:
                formatted = _fmt(q)
                if formatted:
                    queue_items.append(formatted)
            curr = _fmt(data.get("currently_playing"))
            all_to_check = ([curr] if curr else []) + queue_items
            await self._annotate_tracks_liked(token, all_to_check)
            return {
                "ok": True,
                "currently_playing": curr,
                "queue": queue_items,
            }
        except urllib.error.HTTPError as e:
            return {"ok": False, "error": _parse_spotify_error(e)}
        except Exception as e:
            decky.logger.error("get_queue failed: %s", e)
            return {"ok": False, "error": str(e)}

    async def add_to_queue(self, uri: str, device_id: str = "") -> dict:
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        if not uri:
            return {"ok": False, "error": "Missing track URI"}
        params: dict = {"uri": uri}
        if device_id:
            params["device_id"] = device_id
        try:
            await _exec(_spotify_api_request, "me/player/queue", token, "POST", params)
            return {"ok": True}
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return {"ok": False, "error": "No active device found"}
            return {"ok": False, "error": _parse_spotify_error(e)}
        except Exception as e:
            decky.logger.error("add_to_queue(%s) failed: %s", uri, e)
            return {"ok": False, "error": str(e)}

    # ── Playlist / context-play callable methods ─────────────────

    async def get_playlists(self, offset: int = 0) -> dict:
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        try:
            data = await _exec(_spotify_api_request, "me/playlists", token, "GET", {"limit": 50, "offset": offset})
            items = data.get("items", []) if data else []
            playlists = []
            for p in items:
                if not p:
                    continue
                images = p.get("images") or []
                playlists.append({
                    "id": p["id"],
                    "name": p.get("name", ""),
                    "image_url": _image_url(images),
                    "artwork_url": _image_url(images),
                    "track_count": (p.get("items") or p.get("tracks") or {}).get("total", 0),
                    "owner_id": p.get("owner", {}).get("id", ""),
                })
            total = data.get("total", 0) if data else 0
            return {"ok": True, "playlists": playlists, "total": total, "offset": offset}
        except Exception as e:
            decky.logger.error("get_playlists failed: %s", e)
            return {"ok": False, "error": str(e)}

    async def get_playlist_tracks(
        self,
        playlist_id: str,
        offset: int = 0,
        fetch_all: bool = False,
        limit: int = 50,
    ) -> dict:
        if not playlist_id or not str(playlist_id).strip():
            return {"ok": False, "error": "Missing playlist_id"}
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        pid = (playlist_id or "").strip()
        if pid.startswith("spotify:playlist:"):
            pid = pid.split(":")[-1]
        try:
            tracks = []
            cur_offset = max(0, int(offset))
            req_limit = 100 if fetch_all else max(1, min(int(limit), 100))
            total = 0

            while True:
                data = None
                try:
                    data = await _exec(
                        _spotify_api_request,
                        f"playlists/{pid}/items", token, "GET",
                        {"limit": req_limit, "offset": cur_offset},
                    )
                except urllib.error.HTTPError as e:
                    if e.code in (400, 403, 404):
                        try:
                            data = await _exec(
                                _spotify_api_request,
                                f"playlists/{pid}/tracks", token, "GET",
                                {"limit": req_limit, "offset": cur_offset},
                            )
                        except Exception:
                            if cur_offset == 0:
                                data = await _exec(_spotify_api_request, f"playlists/{pid}", token, "GET")
                    else:
                        raise
                except Exception:
                    raise

                if not data:
                    break
                items_obj = data.get("items") if isinstance(data, dict) else []
                if isinstance(items_obj, dict):
                    raw_items = items_obj.get("items", [])
                    total = items_obj.get("total", len(raw_items))
                elif isinstance(items_obj, list):
                    raw_items = items_obj
                    total = data.get("total", len(raw_items))
                else:
                    raw_items = []
                    total = 0

                for item in raw_items:
                    t = item.get("item") or item.get("track")
                    if t is None:
                        continue
                    artists = ", ".join(a["name"] for a in t.get("artists", []))
                    images = t.get("album", {}).get("images") or []
                    img_url = _image_url(images)
                    artist_id = (t.get("artists") or [{}])[0].get("id", "")
                    album_id = t.get("album", {}).get("id", "")
                    tracks.append({
                        "id": t.get("id"),
                        "name": t.get("name", ""),
                        "artist": artists,
                        "album": t.get("album", {}).get("name", ""),
                        "artist_id": artist_id,
                        "album_id": album_id,
                        "uri": t.get("uri", ""),
                        "duration_ms": t.get("duration_ms", 0),
                        "image_url": img_url,
                        "artwork_url": img_url,
                    })
                cur_offset += len(raw_items)
                if not fetch_all or not raw_items or cur_offset >= total or len(tracks) >= 1000:
                    break

            try:
                await self._annotate_tracks_liked(token, tracks)
            except Exception as ex:
                decky.logger.warning("Failed to annotate tracks liked: %s", ex)
            return {"ok": True, "tracks": tracks, "total": total or len(tracks), "offset": offset}
        except Exception as e:
            decky.logger.error("get_playlist_tracks failed: %s", e)
            return {"ok": False, "error": str(e)}

    async def add_track_to_playlist(self, playlist_id: str, track_uri: str) -> dict:
        """Add a track URI to a playlist via Spotify's /playlists/{id}/items endpoint."""
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        pid = (playlist_id or "").strip()
        if pid.startswith("spotify:playlist:"):
            pid = pid.split(":")[-1]
        uri = (track_uri or "").strip()
        if uri and not uri.startswith("spotify:"):
            uri = f"spotify:track:{uri}"
        if not pid or not uri:
            return {"ok": False, "error": "Missing playlist_id or track_uri"}
        try:
            try:
                await _exec(
                    _spotify_api_request,
                    f"playlists/{pid}/items", token, "POST", None,
                    {"uris": [uri]},
                )
            except urllib.error.HTTPError as e:
                if e.code in (400, 404):
                    await _exec(
                        _spotify_api_request,
                        f"playlists/{pid}/tracks", token, "POST", None,
                        {"uris": [uri]},
                    )
                else:
                    raise
            return {"ok": True, "playlist_id": pid, "track_uri": uri}
        except urllib.error.HTTPError as e:
            return {"ok": False, "error": _parse_spotify_error(e)}
        except Exception as e:
            decky.logger.error("add_track_to_playlist(%s, %s) failed: %s", pid, uri, e)
            return {"ok": False, "error": str(e)}

    async def _sync_native_spotify_folders(self) -> list[dict]:
        """Extract recursive playlist folders from Official Spotify Client CDP RootlistAPI (cached across backends) and merge custom folders."""
        custom_folders = [
            dict(f) for f in (self._settings.get("playlist_folders") or [])
            if isinstance(f, dict) and f.get("id") and f.get("source") not in ("spotify", "spotify_client")
        ]
        cached_tree = self._settings.get("spotify_folder_tree")
        if not isinstance(cached_tree, list):
            cached_tree = []

        # Attempt live extraction via Official Spotify Client CDP if available
        try:
            cdp_tree = await _exec(_fetch_spotify_cdp_folder_tree, SPOTIFY_CDP_PORT, timeout=6)
            if isinstance(cdp_tree, list) and len(cdp_tree) > 0:
                proxied_tree = _proxy_folder_tree_images(cdp_tree)
                if proxied_tree != cached_tree:
                    self._settings["spotify_folder_tree"] = proxied_tree
                    _save_settings(self._settings)
                cached_tree = proxied_tree
        except Exception as e:
            decky.logger.debug("Live CDP folder sync skipped: %s", e)

        return _proxy_folder_tree_images(cached_tree) + custom_folders

    async def get_playlist_folders(self) -> dict:
        folders = await self._sync_native_spotify_folders()
        return {"ok": True, "folders": folders}

    async def manage_playlist_folder(
        self,
        action: str,
        folder_id: str = "",
        name: str = "",
        playlist_id: str = "",
        folders: list | None = None,
    ) -> dict:
        """Create, rename, delete, or assign playlists to custom folders in Deckify."""
        current: list[dict] = [
            dict(f) for f in (self._settings.get("playlist_folders") or [])
            if isinstance(f, dict) and f.get("id") and f.get("source") not in ("spotify", "spotify_client")
        ]
        act = (action or "").strip().lower()
        if act == "save" and isinstance(folders, list):
            current = [
                {
                    "id": str(f.get("id")),
                    "name": str(f.get("name", "Folder")).strip() or "Folder",
                    "playlist_ids": [str(x) for x in (f.get("playlist_ids") or []) if x],
                }
                for f in folders if isinstance(f, dict) and f.get("id") and f.get("source") not in ("spotify", "spotify_client")
            ]
        elif act == "create":
            clean_name = (name or "").strip()
            if not clean_name:
                return {"ok": False, "error": "Folder name cannot be empty"}
            new_id = f"folder-{secrets.token_hex(4)}"
            current.append({
                "id": new_id,
                "name": clean_name,
                "playlist_ids": [playlist_id] if playlist_id else [],
            })
        elif act == "rename":
            clean_name = (name or "").strip()
            if not clean_name:
                return {"ok": False, "error": "Folder name cannot be empty"}
            for f in current:
                if f["id"] == folder_id:
                    f["name"] = clean_name
                    break
            else:
                return {"ok": False, "error": "Folder not found"}
        elif act == "delete":
            current = [f for f in current if f["id"] != folder_id]
        elif act == "add_playlist":
            if not folder_id or not playlist_id:
                return {"ok": False, "error": "Missing folder_id or playlist_id"}
            for f in current:
                if f["id"] == folder_id:
                    pids = list(f.get("playlist_ids") or [])
                    if playlist_id not in pids:
                        pids.append(playlist_id)
                    f["playlist_ids"] = pids
                    break
            else:
                return {"ok": False, "error": "Folder not found"}
        elif act == "remove_playlist":
            if not folder_id or not playlist_id:
                return {"ok": False, "error": "Missing folder_id or playlist_id"}
            for f in current:
                if f["id"] == folder_id:
                    f["playlist_ids"] = [x for x in (f.get("playlist_ids") or []) if x != playlist_id]
                    break
        else:
            return {"ok": False, "error": f"Unknown folder action: {action}"}

        self._settings["playlist_folders"] = current
        _save_settings(self._settings)
        native_tree = _proxy_folder_tree_images(self._settings.get("spotify_folder_tree") or [])
        return {"ok": True, "folders": native_tree + current}

    async def set_native_playlist_mix(self, playlist_id: str, enabled: bool = True, play_now: bool = True) -> dict:
        """Toggle native Spotify playlist mixing via Official Spotify Client CDP PlaylistMixingAPI."""
        pid = (playlist_id or "").strip()
        if pid.startswith("spotify:playlist:"):
            pid = pid.split(":")[-1]
        if not pid:
            return {"ok": False, "error": "Missing playlist_id"}
        uri = f"spotify:playlist:{pid}"

        # Handle librespot, web player, or non-spotify_client backend
        is_librespot_running = bool(self._process and self._process.poll() is None)
        active_type = (self._active_device.get("type") or "").lower() if hasattr(self, "_active_device") and self._active_device else ""
        is_web_player = active_type in ("webplayer", "web_player")

        if self._settings.get("audio_backend") != "spotify_client" or is_librespot_running or is_web_player:
            if play_now:
                try:
                    await self.play_tracks(context_uri=uri)
                except Exception as ex:
                    decky.logger.warning("Playback fallback for playlist mix failed: %s", ex)
            return {"ok": False, "error": "Native Spotify Mix requires the Official Spotify Client backend"}

        enabled_js = "true" if enabled else "false"
        play_js = "true" if play_now else "false"
        expr = f"""
        (async () => {{
          const mainEl = document.getElementById('main');
          if (!mainEl) return {{ ok: false, error: 'Spotify UI not ready' }};
          const rk = Object.keys(mainEl).find(k => k.startsWith('__reactContainer') || k.startsWith('__reactFiber'));
          const q = [mainEl[rk]];
          const visited = new Set();
          let mixApi = null;
          let playerApi = null;
          while (q.length > 0 && visited.size < 5000) {{
            const curr = q.shift();
            if (!curr || visited.has(curr)) continue;
            visited.add(curr);
            if (curr.memoizedProps?.platform) {{
              const platform = curr.memoizedProps.platform;
              const reg = platform.getRegistry();
              const map = reg._map || reg;
              for (const [k, v] of map.entries()) {{
                const desc = String(k.description);
                if (desc === 'PlaylistMixingAPI') mixApi = v.instance;
                if (desc === 'PlayerAPI') playerApi = v.instance;
              }}
              break;
            }}
            if (curr.child) q.push(curr.child);
            if (curr.sibling) q.push(curr.sibling);
          }}
          if (!mixApi) return {{ ok: false, error: 'PlaylistMixingAPI unavailable' }};
          const uri = {json.dumps(uri)};
          const enable = {enabled_js};
          try {{
            if (typeof mixApi.setAutoMix === 'function') await mixApi.setAutoMix(uri, enable);
          }} catch (e) {{}}
          try {{
            if (typeof mixApi.setMixState === 'function') await mixApi.setMixState(uri, enable);
          }} catch (e) {{}}
          if ({play_js} && playerApi && typeof playerApi.play === 'function') {{
            try {{
              await playerApi.play({{ uri }}, {{}}, {{}});
            }} catch (e) {{}}
          }}
          return {{ ok: true, playlist_id: {json.dumps(pid)}, uri, is_mixed: enable }};
        }})()
        """
        try:
            res = await _exec(_cdp_evaluate, expr, SPOTIFY_CDP_PORT, None, 6.0, timeout=7)
            if isinstance(res, dict) and res.get("ok"):
                # Update cached folder tree is_mixed state if present
                def _update_mixed(nodes: list[dict]) -> None:
                    for folder in nodes:
                        for pl in folder.get("playlists") or []:
                            if pl.get("id") == pid:
                                pl["is_mixed"] = bool(enabled)
                        if folder.get("subfolders"):
                            _update_mixed(folder["subfolders"])

                tree = self._settings.get("spotify_folder_tree")
                if isinstance(tree, list):
                    _update_mixed(tree)
                    _save_settings(self._settings)
                return res
            if isinstance(res, dict):
                return res
            return {"ok": False, "error": "Official Spotify Client did not respond over CDP"}
        except Exception as e:
            decky.logger.warning("set_native_playlist_mix failed: %s", e)
            return {"ok": False, "error": str(e)}

    # ── Official Spotify Client Remote & Sleep Timer ───────────

    def get_sleep_timer_status(self) -> dict:
        if not self._sleep_timer_task or self._sleep_timer_task.done():
            return {
                "active": False,
                "remaining_seconds": 0,
                "shutdown_on_finish": False,
                "end_of_track": False,
            }
        rem = max(0, int(self._sleep_timer_end - time.time())) if not self._sleep_timer_end_of_track else 0
        if self._sleep_timer_end_of_track:
            dur = self._last_event.get("duration_ms", 0) if self._last_event else 0
            pos = self._last_event.get("position_ms", 0) if self._last_event else 0
            if dur > pos:
                rem = max(0, int((dur - pos) / 1000))
        return {
            "active": True,
            "remaining_seconds": rem,
            "shutdown_on_finish": self._sleep_timer_shutdown,
            "end_of_track": self._sleep_timer_end_of_track,
        }

    async def set_sleep_timer(
        self,
        minutes: int | None = None,
        shutdown_on_finish: bool = False,
        end_of_track: bool = False,
    ) -> dict:
        if self._sleep_timer_task and not self._sleep_timer_task.done():
            self._sleep_timer_task.cancel()
            self._sleep_timer_task = None

        if (minutes is None or minutes <= 0) and not end_of_track:
            return {"ok": True, "sleep_timer": self.get_sleep_timer_status()}

        self._sleep_timer_shutdown = bool(shutdown_on_finish)
        self._sleep_timer_end_of_track = bool(end_of_track)
        if minutes is not None and minutes > 0:
            self._sleep_timer_end = time.time() + (minutes * 60)
        else:
            self._sleep_timer_end = 0

        self._sleep_timer_initial_track_id = self._poll_track_id
        self._sleep_timer_task = asyncio.create_task(self._sleep_timer_worker())
        return {"ok": True, "sleep_timer": self.get_sleep_timer_status()}

    async def _sleep_timer_worker(self):
        try:
            if self._sleep_timer_end_of_track:
                start_track = self._poll_track_id
                while True:
                    await asyncio.sleep(1)
                    if self._poll_track_id != start_track or self._poll_play_state != "playing":
                        break
            else:
                while time.time() < self._sleep_timer_end:
                    await asyncio.sleep(1)

            decky.logger.info("Sleep timer expired, pausing playback")
            await self.control_playback("pause")

            if self._sleep_timer_shutdown:
                decky.logger.info("Sleep timer triggering system shutdown")
                await self.shutdown_system()
        except asyncio.CancelledError:
            pass
        except Exception as e:
            decky.logger.error("Sleep timer error: %s", e)

    async def _apply_equalizer_preset(self, preset: str) -> None:
        decky.logger.info("Applying EQ preset: %s", preset)
        self._settings["eq_preset"] = preset
        _save_settings(self._settings)
        await decky.emit("eq_preset_changed", {"preset": preset})

    async def get_spotify_client_auth_status(self) -> dict:
        try:
            return await _exec(get_spotify_client_auth_status, SPOTIFY_CDP_PORT, timeout=3)
        except Exception as e:
            return {"ok": False, "running": False, "logged_in": False, "error": str(e)}

    async def get_client_window_status(self) -> dict:
        return await self.get_spotify_client_auth_status()

    async def create_playlist(self, name: str, public: bool = False) -> dict:
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        name = (name or "").strip()
        if not name:
            return {"ok": False, "error": "Playlist name cannot be empty"}
        try:
            res = await _exec(
                _spotify_api_request, "me/playlists", token, "POST", None,
                {"name": name, "public": bool(public)},
            )
            return {"ok": True, "playlist": res}
        except urllib.error.HTTPError as e:
            return {"ok": False, "error": _parse_spotify_error(e)}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    async def remove_track_from_playlist(self, playlist_id: str, track_uri: str) -> dict:
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        pid = (playlist_id or "").strip()
        if pid.startswith("spotify:playlist:"):
            pid = pid.split(":")[-1]
        uri = (track_uri or "").strip()
        if uri and not uri.startswith("spotify:"):
            uri = f"spotify:track:{uri}"
        if not pid or not uri:
            return {"ok": False, "error": "Missing playlist_id or track_uri"}
        try:
            try:
                await _exec(
                    _spotify_api_request, f"playlists/{pid}/items", token, "DELETE", None,
                    {"items": [{"uri": uri}]},
                )
            except urllib.error.HTTPError as e:
                if e.code in (400, 403, 404):
                    await _exec(
                        _spotify_api_request, f"playlists/{pid}/tracks", token, "DELETE", None,
                        {"tracks": [{"uri": uri}]},
                    )
                else:
                    raise
            return {"ok": True}
        except urllib.error.HTTPError as e:
            return {"ok": False, "error": _parse_spotify_error(e)}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    async def get_audio_sinks(self) -> dict:
        try:
            sinks = await _exec(_get_pactl_sinks, timeout=3)
            return {"ok": True, "sinks": sinks}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    async def set_audio_sink(self, sink_name: str) -> dict:
        if not sink_name or not isinstance(sink_name, str):
            return {"ok": False, "error": "Missing sink_name"}
        try:
            ok = await _exec(_set_pactl_sink_input, sink_name.strip(), timeout=4)
            return {"ok": ok}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    async def get_liked_tracks(self, offset: int = 0, fetch_all: bool = True) -> dict:
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        try:
            tracks = []
            cur_offset = offset
            total = 0
            while True:
                data = await _exec(
                    _spotify_api_request, "me/tracks", token, "GET",
                    {"limit": 50, "offset": cur_offset},
                )
                items = data.get("items", []) if data else []
                total = data.get("total", 0) if data else 0
                for item in items:
                    t = item.get("track")
                    if t is None:
                        continue
                    artists = ", ".join(a["name"] for a in t.get("artists", []))
                    images = t.get("album", {}).get("images") or []
                    img_url = _image_url(images)
                    artist_id = (t.get("artists") or [{}])[0].get("id", "")
                    album_id = t.get("album", {}).get("id", "")
                    tracks.append({
                        "id": t.get("id"),
                        "name": t.get("name", ""),
                        "artist": artists,
                        "album": t.get("album", {}).get("name", ""),
                        "artist_id": artist_id,
                        "album_id": album_id,
                        "uri": t.get("uri", ""),
                        "duration_ms": t.get("duration_ms", 0),
                        "image_url": img_url,
                        "artwork_url": img_url,
                        "is_liked": True,
                    })
                cur_offset += len(items)
                if not fetch_all or not items or len(tracks) >= total or len(tracks) >= 1000:
                    break
            return {"ok": True, "tracks": tracks, "total": total, "offset": offset}
        except Exception as e:
            decky.logger.error("get_liked_tracks failed: %s", e)
            return {"ok": False, "error": str(e)}

    async def get_saved_episodes(self, offset: int = 0) -> dict:
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        try:
            episodes = []
            data = await _exec(
                _spotify_api_request, "me/episodes", token, "GET",
                {"limit": 50, "offset": offset},
            )
            items = data.get("items", []) if data else []
            for item in items:
                ep = item.get("episode")
                if ep is None:
                    continue
                images = ep.get("images") or []
                resume_point = ep.get("resume_point") or {}
                episodes.append({
                    "id": ep.get("id"),
                    "name": ep.get("name", ""),
                    "show_name": ep.get("show", {}).get("name", ""),
                    "uri": ep.get("uri", ""),
                    "duration_ms": ep.get("duration_ms", 0),
                    "image_url": _image_url(images),
                    "artwork_url": _image_url(images),
                    "resume_position_ms": resume_point.get("resume_position_ms", 0),
                    "fully_played": bool(resume_point.get("fully_played", False)),
                })
            total = data.get("total", 0) if data else 0
            return {"ok": True, "episodes": episodes, "total": total, "offset": offset}
        except Exception as e:
            decky.logger.error("get_saved_episodes failed: %s", e)
            return {"ok": False, "error": str(e)}

    async def get_saved_shows(self, offset: int = 0) -> dict:
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        try:
            shows = []
            data = await _exec(
                _spotify_api_request, "me/shows", token, "GET",
                {"limit": 50, "offset": offset},
            )
            items = data.get("items", []) if data else []
            for item in items:
                show = item.get("show") or item
                if not show:
                    continue
                images = show.get("images") or []
                shows.append({
                    "id": show.get("id"),
                    "name": show.get("name", ""),
                    "publisher": show.get("publisher", ""),
                    "uri": show.get("uri", ""),
                    "total_episodes": show.get("total_episodes", 0),
                    "image_url": _image_url(images),
                    "artwork_url": _image_url(images),
                })
            total = data.get("total", 0) if data else 0
            return {"ok": True, "shows": shows, "total": total, "offset": offset}
        except Exception as e:
            decky.logger.error("get_saved_shows failed: %s", e)
            return {"ok": False, "error": str(e)}

    async def get_saved_albums(self, offset: int = 0) -> dict:
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        try:
            data = await _exec(
                _spotify_api_request, "me/albums", token, "GET",
                {"limit": 50, "offset": offset},
            )
            items = data.get("items", []) if data else []
            albums = []
            for item in items:
                a = item.get("album")
                if a is None:
                    continue
                images = a.get("images") or []
                artists = ", ".join(ar["name"] for ar in a.get("artists", []))
                albums.append({
                    "id": a["id"],
                    "name": a.get("name", ""),
                    "artist": artists,
                    "image_url": _image_url(images),
                    "artwork_url": _image_url(images),
                    "track_count": a.get("total_tracks", 0),
                    "uri": a.get("uri", ""),
                })
            total = data.get("total", 0) if data else 0
            return {"ok": True, "albums": albums, "total": total, "offset": offset}
        except Exception as e:
            decky.logger.error("get_saved_albums failed: %s", e)
            return {"ok": False, "error": str(e)}

    async def get_album_tracks(self, album_id: str, offset: int = 0) -> dict:
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        try:
            album_img = None
            album_name = ""
            try:
                alb_data = await _exec(_spotify_api_request, f"albums/{album_id}", token, "GET")
                if alb_data:
                    album_img = _image_url(alb_data.get("images") or [])
                    album_name = alb_data.get("name", "")
            except Exception:
                pass

            data = await _exec(
                _spotify_api_request,
                f"albums/{album_id}/tracks", token, "GET",
                {"limit": 50, "offset": offset},
            )
            items = data.get("items", []) if data else []
            tracks = []
            for t in items:
                artists = ", ".join(a["name"] for a in t.get("artists", []))
                artist_id = (t.get("artists") or [{}])[0].get("id", "")
                tracks.append({
                    "id": t.get("id"),
                    "name": t.get("name", ""),
                    "artist": artists,
                    "album": album_name,
                    "artist_id": artist_id,
                    "album_id": album_id,
                    "uri": t.get("uri", ""),
                    "duration_ms": t.get("duration_ms", 0),
                    "image_url": album_img,
                    "artwork_url": album_img,
                })
            await self._annotate_tracks_liked(token, tracks)
            total = data.get("total", 0) if data else 0
            return {"ok": True, "tracks": tracks, "total": total, "offset": offset}
        except Exception as e:
            decky.logger.error("get_album_tracks failed: %s", e)
            return {"ok": False, "error": str(e)}

    async def get_followed_artists(self) -> dict:
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        try:
            data = await _exec(
                _spotify_api_request, "me/following", token, "GET",
                {"type": "artist", "limit": 50},
            )
            artists_data = data.get("artists", {}) if data else {}
            items = artists_data.get("items", [])
            artists = []
            for a in items:
                images = a.get("images") or []
                artists.append({
                    "id": a["id"],
                    "name": a.get("name", ""),
                    "image_url": _image_url(images),
                    "artwork_url": _image_url(images),
                })
            return {"ok": True, "artists": artists}
        except Exception as e:
            decky.logger.error("get_followed_artists failed: %s", e)
            return {"ok": False, "error": str(e)}

    async def get_artist_albums(self, artist_id: str, offset: int = 0) -> dict:
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        try:
            data = await _exec(
                _spotify_api_request,
                f"artists/{artist_id}/albums", token, "GET",
                {"limit": 10, "offset": offset, "include_groups": "album,single"},
            )
            items = data.get("items", []) if data else []
            albums = []
            for a in items:
                images = a.get("images") or []
                ar = ", ".join(x["name"] for x in a.get("artists", []))
                albums.append({
                    "id": a["id"],
                    "name": a.get("name", ""),
                    "artist": ar,
                    "image_url": _image_url(images),
                    "artwork_url": _image_url(images),
                    "track_count": a.get("total_tracks", 0),
                    "uri": a.get("uri", ""),
                })
            total = data.get("total", 0) if data else 0
            return {"ok": True, "albums": albums, "total": total, "offset": offset}
        except Exception as e:
            decky.logger.error("get_artist_albums failed: %s", e)
            return {"ok": False, "error": str(e)}

    async def get_artist_top_tracks(self, artist_id: str) -> dict:
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        try:
            items = []
            try:
                data = await _exec(
                    _spotify_api_request,
                    f"artists/{artist_id}/top-tracks", token, "GET",
                )
                items = data.get("tracks", []) if data else []
            except urllib.error.HTTPError as e:
                if e.code == 403:
                    artist_info = await _exec(
                        _spotify_api_request, f"artists/{artist_id}", token, "GET",
                    )
                    artist_name = (artist_info or {}).get("name", "")
                    if artist_name:
                        search_data = await _exec(
                            _spotify_api_request, "search", token, "GET",
                            {"q": f"artist:{artist_name}", "type": "track", "limit": 10},
                        )
                        items = (search_data or {}).get("tracks", {}).get("items", [])
                else:
                    raise
            tracks = []
            for t in items:
                artists = ", ".join(a["name"] for a in t.get("artists", []))
                images = t.get("album", {}).get("images") or []
                artist_id = (t.get("artists") or [{}])[0].get("id", "")
                album_id = t.get("album", {}).get("id", "")
                tracks.append({
                    "id": t.get("id"),
                    "name": t.get("name", ""),
                    "artist": artists,
                    "album": t.get("album", {}).get("name", ""),
                    "artist_id": artist_id,
                    "album_id": album_id,
                    "uri": t.get("uri", ""),
                    "duration_ms": t.get("duration_ms", 0),
                    "image_url": _image_url(images),
                    "artwork_url": _image_url(images),
                    "artwork_url": _image_url(images),
                })
            await self._annotate_tracks_liked(token, tracks)
            return {"ok": True, "tracks": tracks}
        except Exception as e:
            decky.logger.error("get_artist_top_tracks failed: %s", e)
            return {"ok": False, "error": str(e)}

    async def get_recently_played(self, limit: int = 30) -> dict:
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        try:
            data = await _exec(
                _spotify_api_request,
                "me/player/recently-played", token, "GET",
                {"limit": max(1, min(50, int(limit)))},
            )
            items = data.get("items", []) if data else []
            tracks = []
            seen_uris: set[str] = set()
            for item in items:
                t = item.get("track")
                if not t:
                    continue
                uri = t.get("uri", "")
                if uri in seen_uris:
                    continue
                seen_uris.add(uri)
                artists = ", ".join(a["name"] for a in t.get("artists", []))
                images = t.get("album", {}).get("images") or []
                img_url = _image_url(images)
                artist_id = (t.get("artists") or [{}])[0].get("id", "")
                album_id = t.get("album", {}).get("id", "")
                tracks.append({
                    "id": t.get("id"),
                    "name": t.get("name", ""),
                    "artist": artists,
                    "album": t.get("album", {}).get("name", ""),
                    "artist_id": artist_id,
                    "album_id": album_id,
                    "uri": uri,
                    "duration_ms": t.get("duration_ms", 0),
                    "image_url": img_url,
                    "artwork_url": img_url,
                })
            await self._annotate_tracks_liked(token, tracks)
            return {"ok": True, "tracks": tracks}
        except Exception as e:
            decky.logger.error("get_recently_played failed: %s", e)
            return {"ok": False, "error": str(e)}

    async def search_spotify(
        self,
        query: str,
        types: str = "track,artist,album,playlist",
        limit: int = 50,
        offset: int = 0,
    ) -> dict:
        if not query or not str(query).strip():
            return {"ok": True, "tracks": [], "artists": [], "albums": [], "playlists": []}
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        try:
            final_limit = 50 if limit <= 0 else max(1, min(int(limit), 50))
            final_offset = max(0, int(offset))
            try:
                data = await _exec(
                    _spotify_api_request, "search", token, "GET",
                    {"q": query, "type": types, "limit": final_limit, "offset": final_offset},
                )
            except Exception as e:
                if "Invalid limit" in str(e) or "400" in str(e):
                    data = await _exec(
                        _spotify_api_request, "search", token, "GET",
                        {"q": query, "type": types, "limit": min(final_limit, 10), "offset": final_offset},
                    )
                else:
                    raise
            if not data:
                return {"ok": True, "tracks": [], "artists": [], "albums": [], "playlists": []}
            tracks = []
            for t in data.get("tracks", {}).get("items", []):
                artists = ", ".join(a["name"] for a in t.get("artists", []))
                images = t.get("album", {}).get("images") or []
                artist_id = (t.get("artists") or [{}])[0].get("id", "")
                album_id = t.get("album", {}).get("id", "")
                tracks.append({
                    "id": t.get("id"), "name": t.get("name", ""), "artist": artists,
                    "album": t.get("album", {}).get("name", ""),
                    "artist_id": artist_id, "album_id": album_id,
                    "uri": t.get("uri", ""),
                    "duration_ms": t.get("duration_ms", 0),
                    "image_url": _image_url(images),
                    "artwork_url": _image_url(images),
                    "artwork_url": _image_url(images),
                })
            await self._annotate_tracks_liked(token, tracks)
            artists_out = []
            for a in data.get("artists", {}).get("items", []):
                images = a.get("images") or []
                raw_img = images[0].get("url") if images and isinstance(images, list) and isinstance(images[0], dict) else None
                artists_out.append({
                    "id": a["id"], "name": a.get("name", ""),
                    "uri": a.get("uri", f"spotify:artist:{a['id']}"),
                    "image_url": _image_url(images) or raw_img,
                })
            albums_out = []
            for a in data.get("albums", {}).get("items", []):
                images = a.get("images") or []
                ar = ", ".join(x["name"] for x in a.get("artists", []))
                albums_out.append({
                    "id": a["id"], "name": a.get("name", ""), "artist": ar,
                    "image_url": _image_url(images),
                    "artwork_url": _image_url(images),
                    "track_count": a.get("total_tracks", 0), "uri": a.get("uri", ""),
                })
            playlists_out = []
            for p in data.get("playlists", {}).get("items", []):
                if p is None:
                    continue
                images = p.get("images") or []
                playlists_out.append({
                    "id": p["id"], "name": p.get("name", ""),
                    "image_url": _image_url(images),
                    "artwork_url": _image_url(images),
                    "track_count": (p.get("items") or p.get("tracks") or {}).get("total", 0),
                    "owner_id": p.get("owner", {}).get("id", ""),
                })
            return {"ok": True, "tracks": tracks, "artists": artists_out, "albums": albums_out, "playlists": playlists_out}
        except Exception as e:
            decky.logger.error("search_spotify failed: %s", e)
            return {"ok": False, "error": str(e)}

    async def get_track_recommendations(self, seed_track_id: str, limit: int = 25) -> dict:
        """Fetch track recommendations based on a seed track."""
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        clean_seed = (seed_track_id or "").strip()
        if clean_seed.startswith("spotify:track:"):
            clean_seed = clean_seed.split(":")[-1]
        try:
            data = await _exec(
                _spotify_api_request, "recommendations", token, "GET",
                {"seed_tracks": clean_seed, "limit": min(100, max(1, limit))},
            )
            items = data.get("tracks", []) if data else []
            tracks = []
            for t in items:
                artists = ", ".join(a["name"] for a in t.get("artists", []))
                images = t.get("album", {}).get("images") or []
                img_url = _image_url(images)
                tracks.append({
                    "id": t.get("id"),
                    "name": t.get("name", ""),
                    "artist": artists,
                    "album": t.get("album", {}).get("name", ""),
                    "uri": t.get("uri", ""),
                    "duration_ms": t.get("duration_ms", 0),
                    "image_url": img_url,
                    "artwork_url": img_url,
                })
            await self._annotate_tracks_liked(token, tracks)
            return {"ok": True, "tracks": tracks}
        except Exception as e:
            decky.logger.error("get_track_recommendations failed: %s", e)
            return {"ok": False, "error": str(e)}

    async def get_lyrics(
        self,
        track_name: str,
        artist_name: str,
        duration_sec: int = 0,
        provider_offset: int = 0,
    ) -> dict:
        """Fetch synchronized or plain lyrics using 5-tier waterfall with provider offset."""
        try:
            return await _exec(
                _fetch_lyrics_sync,
                track_name,
                artist_name,
                duration_sec,
                provider_offset,
                timeout=12,
            )
        except Exception as e:
            decky.logger.warning("get_lyrics failed: %s", e)
            return {"ok": False, "error": str(e)}

    async def get_image(self, url: str) -> dict:
        """Fetch and return base64 Data URI for external image, bypassing CEF CSP restrictions."""
        if not url or not isinstance(url, str):
            return {"ok": False, "error": "No URL provided"}
        try:
            content_type, body = await _exec(_fetch_spotify_image, url, timeout=10)
            b64 = base64.b64encode(body).decode("ascii")
            return {"ok": True, "data_url": f"data:{content_type};base64,{b64}"}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    async def shutdown_system(self) -> dict:
        """Power off the Steam Deck / Steam Machine cleanly."""
        try:
            def _poweroff():
                subprocess.Popen(["systemctl", "poweroff"])
            await _exec(_poweroff, timeout=3)
            return {"ok": True}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    async def play_tracks(
        self,
        context_uri: str | None = None,
        offset_uri: str | None = None,
        uris: list | None = None,
        position: int = 0,
    ) -> dict:
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        # Handle flexible argument ordering if uris passed in place of offset_uri
        if isinstance(offset_uri, list):
            uris, offset_uri = offset_uri, None

        body = {}
        if context_uri:
            body["context_uri"] = context_uri
            if offset_uri:
                body["offset"] = {"uri": offset_uri}
            self._context_uri = context_uri
        elif uris:
            body["uris"] = uris
            if position > 0:
                body["offset"] = {"position": position}
        elif offset_uri and str(offset_uri).strip():
            body["uris"] = [str(offset_uri).strip()]
        try:
            await _exec(
                _spotify_api_request, "me/player/play", token, "PUT", None, body,
            )
            return {"ok": True}
        except urllib.error.HTTPError as e:
            if e.code == 404:
                transfer_res = await self._auto_transfer_and_play(token)
                if transfer_res.get("ok") and body:
                    try:
                        await asyncio.sleep(0.5)
                        await _exec(_spotify_api_request, "me/player/play", token, "PUT", None, body)
                        return {"ok": True}
                    except Exception:
                        pass
                return transfer_res
            return {"ok": False, "error": _parse_spotify_error(e)}
        except Exception as e:
            decky.logger.error("play_tracks failed: %s", e)
            return {"ok": False, "error": str(e)}

    # ── Device callable methods ─────────────────────────────────

    async def get_devices(self) -> dict:
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        try:
            data = await _exec(_spotify_api_request, "me/player/devices", token)
            devices = data.get("devices", []) if data else []
            return {"ok": True, "devices": devices}
        except Exception as e:
            decky.logger.error("get_devices failed: %s", e)
            return {"ok": False, "error": str(e)}

    async def transfer_playback(self, device_id: str) -> dict:
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        try:
            await _exec(
                _spotify_api_request, "me/player", token, "PUT", None,
                {"device_ids": [device_id]},
            )
            return {"ok": True}
        except urllib.error.HTTPError as e:
            return {"ok": False, "error": _parse_spotify_error(e)}
        except Exception as e:
            decky.logger.error("transfer_playback failed: %s", e)
            return {"ok": False, "error": str(e)}

    # ── OAuth callable methods ─────────────────────────────────

    async def start_oauth(self) -> dict:
        await self._stop_oauth_server()

        ssl_ctx, ssl_err = _ensure_ssl_cert()
        if not ssl_ctx:
            return {"ok": False, "error": f"Failed to create SSL certificate: {ssl_err}"}

        mdns_host = _get_mdns_host()
        base_url = f"https://{mdns_host}:{OAUTH_SERVER_PORT}"
        self._oauth_redirect_uri = f"{base_url}/callback"

        try:
            self._oauth_server = await asyncio.start_server(
                self._handle_oauth_connection, "0.0.0.0", OAUTH_SERVER_PORT,
                ssl=ssl_ctx,
            )
        except OSError as e:
            return {"ok": False, "error": f"Cannot start OAuth server: {e}"}

        decky.logger.info("OAuth started, landing URL: %s", base_url)
        return {"ok": True, "landing_url": base_url}

    async def get_auth_status(self) -> dict:
        if self._access_token and self._refresh_token:
            saved_version = self._settings.get("scopes_version", 0)
            needs_reauth = saved_version < CURRENT_SCOPES_VERSION
            return {"authenticated": True, "needs_reauth": needs_reauth}
        return {"authenticated": False, "needs_reauth": False}

    async def logout_spotify(self) -> dict:
        await self._stop_api_poll()
        self._access_token = None
        self._refresh_token = None
        self._token_expires_at = 0
        self._poll_play_state = None
        self._poll_track_id = None
        self._poll_volume = None
        self._active_device = None
        self._settings["spotify_client_id"] = ""
        for key in ("access_token", "refresh_token", "token_expires_at"):
            self._settings.pop(key, None)
        _save_settings(self._settings)
        decky.logger.info("Spotify logged out, tokens and client_id cleared")
        return {"ok": True}


    # ── Internal helpers ───────────────────────────────────────

    async def _kill_spotify_client(self):
        """Cleanly terminate the Official Spotify Client Flatpak and its virtual KWin display."""
        sp_proc = self._spotify_client_process
        self._spotify_client_process = None
        if sp_proc and sp_proc.poll() is None:
            decky.logger.info("Stopping Official Spotify Client pid=%d", sp_proc.pid)
            try:
                sp_proc.terminate()
                sp_proc.wait(timeout=3)
            except Exception:
                try:
                    sp_proc.kill()
                except Exception:  # pragma: no cover
                    pass
        try:
            cmd, env = _build_deck_command(["flatpak", "kill", SPOTIFY_FLATPAK_ID])
            await _exec(lambda: subprocess.run(cmd, env=env, capture_output=True), timeout=4)
        except Exception:
            pass

        kw_proc = self._kwin_process
        self._kwin_process = None
        self._virtual_display = None
        if kw_proc and kw_proc.poll() is None:
            try:
                kw_proc.terminate()
                kw_proc.wait(timeout=3)
            except Exception:
                try:
                    kw_proc.kill()
                except Exception:
                    pass

    async def _kill_librespot(self):
        proc = self._process
        if proc is None:
            return
        self._process = None

        if proc.poll() is not None:
            self._clear_pid()
            return

        decky.logger.info("Stopping librespot pid=%d", proc.pid)
        try:
            proc.terminate()
        except ProcessLookupError:
            self._clear_pid()
            return

        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            decky.logger.warning("librespot did not exit, sending SIGKILL")
            try:
                proc.kill()
            except ProcessLookupError:
                pass
            proc.wait(timeout=3)
        self._clear_pid()

    def _kill_stale_librespot(self):
        """Kill orphan librespot left by a previous plugin instance via PID file."""
        try:
            with open(LIBRESPOT_PID_FILE, "r") as f:
                old_pid = int(f.read().strip())
        except (FileNotFoundError, ValueError):
            return
        try:
            os.kill(old_pid, 0)  # check alive
        except (ProcessLookupError, OSError):
            self._clear_pid()
            return
        decky.logger.info("Killing stale librespot pid=%d", old_pid)
        try:
            os.kill(old_pid, 15)  # SIGTERM
        except ProcessLookupError:
            pass
        self._clear_pid()

    @staticmethod
    def _write_pid(pid: int):
        os.makedirs(os.path.dirname(LIBRESPOT_PID_FILE), exist_ok=True)
        with open(LIBRESPOT_PID_FILE, "w") as f:
            f.write(str(pid))

    @staticmethod
    def _clear_pid():
        try:
            os.remove(LIBRESPOT_PID_FILE)
        except FileNotFoundError:
            pass

    def _start_monitor(self):
        if self._monitor_task and not self._monitor_task.done():
            return
        self._monitor_task = asyncio.get_event_loop().create_task(
            self._monitor_process()
        )

    def _start_api_poll(self):
        if self._api_poll_task and not self._api_poll_task.done():
            return
        self._api_poll_task = asyncio.get_event_loop().create_task(
            self._poll_api_loop()
        )

    async def _stop_api_poll(self):
        task = self._api_poll_task
        if task and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        self._api_poll_task = None

    async def _stop_monitor(self):
        task = self._monitor_task
        if task and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        self._monitor_task = None

    # ── OAuth / Spotify API helpers ──────────────────────────

    async def _handle_oauth_connection(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        try:
            data = await asyncio.wait_for(reader.read(4096), timeout=10)
            if not data:
                writer.close()
                return

            request_line = data.decode("utf-8", errors="replace").split("\r\n")[0]
            parts = request_line.split(" ")
            if len(parts) < 2:
                await self._send_http_response(writer, 400, "Bad request")
                return

            path = parts[1]
            parsed = urllib.parse.urlparse(path)

            # Ignore favicon and other irrelevant requests
            if parsed.path == "/favicon.ico":
                await self._send_http_response(writer, 404, "Not found")
                return

            if parsed.path == "/callback":
                await self._handle_oauth_callback(parsed.query, writer)
            elif parsed.path == "/auth":
                await self._handle_auth_redirect(parsed.query, writer)
            else:
                await self._send_landing_page(writer)
        except asyncio.TimeoutError:
            decky.logger.debug("OAuth connection timed out (no data received)")
            try:
                writer.close()
            except Exception:
                pass
        except Exception as e:
            decky.logger.error("OAuth connection error [%s]: %s", type(e).__name__, e)
            try:
                await self._send_http_response(writer, 500, f"Error: {e}")
            except Exception:
                pass

    async def _handle_oauth_callback(self, query: str, writer: asyncio.StreamWriter):
        try:
            qs = urllib.parse.parse_qs(query)
            code = qs.get("code", [None])[0]
            if not code:
                await self._send_http_response(writer, 400, "Missing code parameter.")
                return

            client_id = self._settings.get("spotify_client_id", "").strip()
            token_data = await _exec(_spotify_token_request, {
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": self._oauth_redirect_uri,
                "client_id": client_id,
                "code_verifier": self._pkce_verifier,
            })

            self._access_token = token_data["access_token"]
            self._refresh_token = token_data.get("refresh_token")
            self._token_expires_at = time.time() + token_data.get("expires_in", 3600) - 60
            self._token_retry_at = 0
            self._settings["access_token"] = self._access_token
            self._settings["refresh_token"] = self._refresh_token
            self._settings["token_expires_at"] = self._token_expires_at
            self._settings["scopes_version"] = CURRENT_SCOPES_VERSION
            _save_settings(self._settings)

            html = (
                '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">'
                '<title>Deckify</title></head>'
                '<body style="background:#121212;color:#fff;display:flex;justify-content:center;'
                'align-items:center;min-height:100vh;margin:0;font-family:-apple-system,sans-serif">'
                '<div style="text-align:center">'
                '<h2 style="color:#1DB954">Authorization Successful</h2>'
                '<p style="color:#b3b3b3">You can close this page and return to your Steam Deck.</p>'
                '</div></body></html>'
            )
            await self._send_html(writer, 200, html)
            self._start_api_poll()
            await decky.emit("oauth_complete", {"authenticated": True})
            decky.logger.info("OAuth complete, tokens saved")
        except Exception as e:
            decky.logger.error("OAuth callback error: %s", e)
            await self._send_http_response(writer, 500, f"Error: {e}")
        finally:
            await self._stop_oauth_server()

    async def _send_landing_page(self, writer: asyncio.StreamWriter):
        client_id = self._settings.get("spotify_client_id", "").strip()
        redirect_uri = self._oauth_redirect_uri or ""
        html = (
            '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">'
            '<title>Deckify - Spotify Login</title></head>'
            '<body style="background:#121212;color:#fff;display:flex;justify-content:center;'
            'align-items:center;min-height:100vh;margin:0;font-family:-apple-system,sans-serif">'
            '<div style="text-align:center;padding:24px;max-width:400px">'
            '<h1 style="font-size:28px;margin-bottom:8px">Deckify</h1>'
            '<p style="color:#b3b3b3;margin-bottom:24px">Connect your Spotify account to your Steam Deck</p>'
            '<form action="/auth" method="get" style="text-align:left">'
            '<label style="display:block;color:#b3b3b3;font-size:14px;margin-bottom:6px">Spotify Client ID</label>'
            f'<input name="client_id" type="text" required value="{escape(client_id, quote=True)}"'
            ' placeholder="e.g. a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"'
            ' style="width:100%;padding:12px;border:1px solid #333;border-radius:8px;'
            'background:#1a1a1a;color:#fff;font-size:14px;box-sizing:border-box;margin-bottom:16px">'
            '<p style="color:#666;font-size:12px;margin:0 0 16px">'
            'Redirect URI for your Spotify App settings:<br>'
            f'<code style="color:#999;word-break:break-all">{escape(redirect_uri)}</code></p>'
            '<button type="submit" style="width:100%;padding:14px;border:none;border-radius:24px;'
            'background:#1DB954;color:#fff;font-size:16px;font-weight:600;cursor:pointer">Continue</button>'
            '</form>'
            '<p style="color:#666;font-size:11px;margin-top:24px">'
            'Create an app at <span style="color:#999">developer.spotify.com</span></p>'
            '</div></body></html>'
        )
        await self._send_html(writer, 200, html)

    async def _handle_auth_redirect(self, query: str, writer: asyncio.StreamWriter):
        qs = urllib.parse.parse_qs(query)
        client_id = (qs.get("client_id", [""])[0]).strip()
        if not client_id:
            await self._send_http_response(writer, 400, "Missing client_id")
            return
        self._settings["spotify_client_id"] = client_id
        _save_settings(self._settings)
        decky.logger.info("Client ID saved from web form")
        await self._redirect_to_spotify(client_id, writer)

    async def _redirect_to_spotify(self, client_id: str, writer: asyncio.StreamWriter):
        verifier, challenge = _generate_pkce_pair()
        self._pkce_verifier = verifier
        params = urllib.parse.urlencode({
            "client_id": client_id,
            "response_type": "code",
            "redirect_uri": self._oauth_redirect_uri,
            "scope": SPOTIFY_SCOPES,
            "code_challenge_method": "S256",
            "code_challenge": challenge,
        })
        auth_url = f"{SPOTIFY_AUTH_URL}?{params}"
        header = f"HTTP/1.1 302 Found\r\nLocation: {auth_url}\r\nConnection: close\r\n\r\n"
        writer.write(header.encode("utf-8"))
        await writer.drain()
        writer.close()

    async def _send_html(self, writer: asyncio.StreamWriter, status: int, html: str):
        reason = {200: "OK", 400: "Bad Request", 500: "Internal Server Error"}.get(status, "OK")
        encoded = html.encode("utf-8")
        header = (
            f"HTTP/1.1 {status} {reason}\r\n"
            f"Content-Type: text/html; charset=utf-8\r\n"
            f"Content-Length: {len(encoded)}\r\n"
            f"Connection: close\r\n\r\n"
        )
        writer.write(header.encode("utf-8") + encoded)
        await writer.drain()
        writer.close()

    async def _send_http_response(self, writer: asyncio.StreamWriter, status: int, body: str):
        html = f"<html><body><h2>{body}</h2></body></html>"
        await self._send_html(writer, status, html)

    async def _stop_oauth_server(self):
        if self._oauth_server:
            self._oauth_server.close()
            await self._oauth_server.wait_closed()
            self._oauth_server = None
            decky.logger.info("OAuth callback server stopped")

    async def _ensure_token(self) -> str | None:
        if not self._access_token:
            return None
        if time.time() < self._token_expires_at:
            return self._access_token
        if not self._refresh_token:
            return None
        async with self._token_refresh_lock:
            # Double-check after acquiring lock — another coroutine may have refreshed
            if time.time() < self._token_expires_at:
                return self._access_token
            if not self._refresh_token or time.monotonic() < self._token_retry_at:
                return None
            try:
                client_id = self._settings.get("spotify_client_id", "").strip()
                token_data = await _exec(_spotify_token_request, {
                    "grant_type": "refresh_token",
                    "refresh_token": self._refresh_token,
                    "client_id": client_id,
                })
                self._access_token = token_data["access_token"]
                if "refresh_token" in token_data:
                    self._refresh_token = token_data["refresh_token"]
                self._token_expires_at = time.time() + token_data.get("expires_in", 3600) - 60
                self._settings["access_token"] = self._access_token
                self._settings["refresh_token"] = self._refresh_token
                self._settings["token_expires_at"] = self._token_expires_at
                _save_settings(self._settings)
                decky.logger.info("Token refreshed successfully")
                return self._access_token
            except urllib.error.HTTPError as e:
                self._token_retry_at = time.monotonic() + 30
                try:
                    error = json.loads(e.read()).get("error")
                except (ValueError, AttributeError, OSError):
                    error = None
                if e.code in (400, 401) and error in ("invalid_grant", "invalid_client"):
                    self._access_token = None
                    self._refresh_token = None
                    self._token_expires_at = 0
                    for key in ("access_token", "refresh_token", "token_expires_at"):
                        self._settings.pop(key, None)
                    _save_settings(self._settings)
                    decky.logger.warning("Spotify authorization expired (%s); reconnect required", error)
                    await decky.emit("auth_expired")
                else:
                    decky.logger.error("Token refresh failed: HTTP %s; retrying in 30s", e.code)
                return None
            except Exception as e:
                self._token_retry_at = time.monotonic() + 30
                decky.logger.error("Token refresh failed: %s", e)
                return None

    async def _poll_playback(self) -> bool:
        """Poll GET /me/player and emit events. Returns True if API call succeeded."""
        token = await self._ensure_token()
        if not token:
            return True  # not a network issue

        try:
            data = await _exec(_spotify_api_request, "me/player", token, "GET", {"additional_types": "episode"})
        except urllib.error.HTTPError as e:
            if e.code == 401:
                self._token_expires_at = 0  # force refresh on next call
                return True
            decky.logger.warning("Poll playback API error: %s", e.code)
            return True  # API reachable, not a network issue
        except Exception as e:
            decky.logger.warning("Poll playback failed: %s", e)
            return False

        # 204 No Content → no active playback
        if data is None:
            if self._poll_play_state is not None:
                self._poll_play_state = None
                self._poll_track_id = None
                event = {"event": "stopped"}
                self._last_event = event
                await decky.emit("librespot_event", event)
            return True

        item = data.get("item")
        if item is None:
            return True

        is_playing = data.get("is_playing", False)
        progress_ms = data.get("progress_ms", 0)
        track_id = item.get("id", "")
        duration_ms = item.get("duration_ms", 0)
        ctx = data.get("context") or {}
        self._context_uri = ctx.get("uri", "") if isinstance(ctx, dict) else ""

        shuffle_state = bool(data.get("shuffle_state", False))
        repeat_state = data.get("repeat_state", "off")
        if shuffle_state != self._shuffle_state or repeat_state != self._repeat_state:
            self._shuffle_state = shuffle_state
            self._repeat_state = repeat_state
            await decky.emit("playback_modes", {
                "shuffle_state": self._shuffle_state,
                "repeat_state": self._repeat_state,
            })

        if track_id != self._poll_track_id:
            self._poll_track_id = track_id
            is_liked = False
            if track_id and item.get("type") != "episode":
                checked = await self._check_tracks_liked(token, [track_id])
                is_liked = bool(checked.get(track_id, False))
            self._is_liked = is_liked

            if item.get("type") == "episode":
                show = item.get("show") or {}
                artist = show.get("name") or "Unknown"
                album_name = ""
                images = item.get("images") or show.get("images") or []
            else:
                album = item.get("album") or {}
                artist = ", ".join(a["name"] for a in item.get("artists", [])) or "Unknown"
                album_name = album.get("name", "")
                images = album.get("images") or []
            artwork_url = _image_url(images)
            artist_id = (item.get("artists") or [{}])[0].get("id", "") if item.get("type") != "episode" else ""
            album_id = (item.get("album") or {}).get("id", "") if item.get("type") != "episode" else ""
            meta = {
                "track_id": track_id,
                "id": track_id,
                "name": item.get("name", "Unknown"),
                "artist": artist,
                "album": album_name,
                "artist_id": artist_id,
                "album_id": album_id,
                "artwork_url": artwork_url,
                "image_url": artwork_url,
                "duration_ms": duration_ms,
                "uri": item.get("uri", ""),
                "is_liked": is_liked,
            }
            self._track_meta = meta
            await decky.emit("track_metadata", meta)

        new_state = "playing" if is_playing else "paused"
        if is_playing:
            # Always emit playing with latest position so frontend re-anchors
            event = {
                "event": "playing",
                "track_id": track_id,
                "position_ms": progress_ms,
                "duration_ms": duration_ms,
            }
            self._last_event = event
            await decky.emit("librespot_event", event)
        elif new_state != self._poll_play_state:
            event = {
                "event": "paused",
                "track_id": track_id,
                "position_ms": progress_ms,
                "duration_ms": duration_ms,
            }
            self._last_event = event
            await decky.emit("librespot_event", event)
        self._poll_play_state = new_state

        device = data.get("device", {})
        if device.get("id"):
            new_device = {
                "id": device["id"],
                "name": device.get("name", "Unknown"),
                "type": device.get("type", "unknown"),
            }
            prev_id = self._active_device.get("id") if self._active_device else None
            self._active_device = new_device
            if device["id"] != prev_id:
                await decky.emit("device_changed", new_device)
        volume_percent = device.get("volume_percent")
        if volume_percent is not None and volume_percent != self._poll_volume:
            self._poll_volume = volume_percent
            event = {"event": "volume_set", "volume": volume_percent}
            self._last_event = event
            await decky.emit("librespot_event", event)

        return True

    async def _refresh_audio_stream_info(self) -> None:
        """Inspect PipeWire/PulseAudio sink-inputs to report live sample rate and bit depth."""
        try:
            env = os.environ.copy()
            env["PULSE_SERVER"] = PULSE_SERVER
            res = await _exec(
                lambda: subprocess.run(
                    ["pactl", "list", "sink-inputs"],
                    capture_output=True, text=True, env=env,
                ),
                timeout=4,
            )
            self._audio_stream_info = _parse_pactl_sink_inputs(res.stdout)
        except Exception:
            pass

    async def _set_pa_volume_percent(self, percent: int) -> bool:
        """Set librespot's PulseAudio sink-input volume percentage."""
        if not self._process:
            return False
        pid = self._process.pid
        try:
            env = os.environ.copy()
            env["PULSE_SERVER"] = PULSE_SERVER

            def _list_sinks():
                return subprocess.run(
                    ["pactl", "list", "sink-inputs"],
                    capture_output=True, text=True, env=env,
                )

            result = await _exec(_list_sinks)
            sink_input_id = None
            current_id = None
            for line in result.stdout.splitlines():
                line = line.strip()
                if line.startswith("Sink Input #"):
                    current_id = line.split("#")[1]
                elif "application.process.id" in line and f'"{pid}"' in line:
                    sink_input_id = current_id
                    break
            if sink_input_id:
                def _set_vol():
                    return subprocess.run(
                        ["pactl", "set-sink-input-volume", sink_input_id, f"{int(percent)}%"],
                        capture_output=True, text=True, env=env,
                    )
                await _exec(_set_vol)
                return True
        except Exception as e:
            decky.logger.warning("Failed to set PA volume to %d%%: %s", percent, e)
        return False

    async def _boost_pa_volume(self):
        """Set librespot's PulseAudio sink-input to 150% for audible volume."""
        if await self._set_pa_volume_percent(150):
            decky.logger.info("PA volume boosted to 150%%")
            self._pa_volume_boosted = True

    async def _monitor_process(self):
        """Monitor active audio engine health and detect system sleep/wake."""
        self._stable_start = time.time()
        last_tick = time.time()
        MAX_CRASHES = 5
        CRASH_WINDOW = 600  # 10 minutes
        STABLE_THRESHOLD = 60  # seconds before resetting crash counter
        SUSPEND_THRESHOLD = 30  # a 3s tick taking >30s means system was suspended

        try:
            while True:
                now = time.time()
                elapsed = now - last_tick
                last_tick = now

                backend = self._settings.get("audio_backend", "librespot")
                active_proc = self._spotify_client_process if backend == "spotify_client" else self._process

                if elapsed > SUSPEND_THRESHOLD and active_proc and active_proc.poll() is None:
                    decky.logger.info(
                        "System wake detected (gap=%.0fs), restarting %s", elapsed, backend,
                    )
                    if backend == "spotify_client":
                        await self._kill_spotify_client()
                        await self.start_spotify_client()
                    else:
                        await self._kill_librespot()
                        await self.start_librespot()
                    self._crash_timestamps.clear()
                    self._stable_start = time.time()
                    last_tick = time.time()
                    continue

                if active_proc and active_proc.poll() is not None:
                    rc = active_proc.returncode
                    if backend == "spotify_client":
                        self._spotify_client_process = None
                    else:
                        self._process = None
                    msg = f"{backend} exited unexpectedly (code {rc})"
                    decky.logger.error(msg)

                    now = time.time()
                    if now - self._stable_start >= STABLE_THRESHOLD:
                        self._crash_timestamps.clear()
                    self._crash_timestamps = [
                        t for t in self._crash_timestamps if now - t < CRASH_WINDOW
                    ]
                    if len(self._crash_timestamps) < MAX_CRASHES:
                        self._crash_timestamps.append(now)
                        attempt = len(self._crash_timestamps)
                        delay = min(2 ** attempt, 30)
                        decky.logger.info(
                            "Auto-restart attempt %d/%d in %ds",
                            attempt, MAX_CRASHES, delay,
                        )
                        await decky.emit("librespot_status", {
                            "running": False,
                            "error": f"Crashed (code {rc}), restarting in {delay}s...",
                            "auto_restarting": True,
                        })
                        await asyncio.sleep(delay)
                        result = (
                            await self.start_spotify_client()
                            if backend == "spotify_client"
                            else await self.start_librespot()
                        )
                        if result.get("ok"):
                            self._stable_start = time.time()
                            continue
                        else:
                            await decky.emit("librespot_status", {
                                "running": False,
                                "error": f"Auto-restart failed: {result.get('error', 'unknown')}",
                            })
                            break
                    else:
                        decky.logger.error("Max auto-restart attempts reached")
                        await decky.emit("librespot_status", {
                            "running": False,
                            "error": f"Crashed (code {rc}). Auto-restart limit reached — restart manually.",
                        })
                        break

                if backend == "librespot" and not self._pa_volume_boosted:
                    await self._boost_pa_volume()
                elif backend == "spotify_client" and not self._settings.get("spotify_folder_tree"):
                    await self._sync_native_spotify_folders()
                    await self._sync_spotify_client_quality_cdp(str(self._settings.get("audio_quality", "320")))

                await self._refresh_audio_stream_info()
                await asyncio.sleep(3)
        except asyncio.CancelledError:
            pass

    async def _poll_api_loop(self):
        """Poll Spotify Web API for playback state, independent of librespot process."""
        try:
            while True:
                await self._poll_playback()
                await asyncio.sleep(3)
        except asyncio.CancelledError:
            pass
