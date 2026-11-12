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
from py_modules import volume
from py_modules import system
from py_modules import rpc_playback
from py_modules import rpc_library

common._MAIN_MODULE = sys.modules[__name__]


def _load_settings(settings_file: str | None = None) -> dict:
    return common._load_settings(settings_file or SETTINGS_FILE)


def _save_settings(settings: dict, settings_file: str | None = None) -> None:
    return common._save_settings(settings, settings_file or SETTINGS_FILE)


_default_save_settings = _save_settings
_default_exec = _exec


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
    _volume_fader: volume.VolumeFader | None = None

    def __init__(self):
        self._crash_timestamps = []
        self._liked_cache = {}
        self._volume_fader = volume.VolumeFader(self)

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
        self._volume_fader = volume.VolumeFader(self)
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
        if hasattr(self, "_volume_fader") and self._volume_fader:
            if self._volume_fader._fade_task and not self._volume_fader._fade_task.done():
                self._volume_fader._fade_task.cancel()
            self._volume_fader = None
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
        if hasattr(self, "_volume_fader") and self._volume_fader:
            if self._volume_fader._fade_task and not self._volume_fader._fade_task.done():
                self._volume_fader._fade_task.cancel()
            self._volume_fader = None
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
        await volume.configure_pipewire_clock(unlock_lossless)

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
            "toast_position", "overlay_enabled", "overlay_position",
            "overlay_autohide", "overlay_show_progress", "eq_preset",
            "duck_fade_down_duration", "duck_fade_up_duration", "ducking_mode",
            "ducking_proportional_pct", "voice_ducking_enabled", "voice_ducking_volume",
            "voice_ducking_hold_delay",
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
        elif key in ("normalisation", "gapless", "autoplay", "bit_perfect_clock", "overlay_enabled", "toast_enabled", "gamepad_chords_enabled", "auto_ducking", "overlay_autohide", "overlay_show_progress", "voice_ducking_enabled"):
            value = bool(value)
        elif key in ("duck_fade_down_duration", "duck_fade_up_duration", "voice_ducking_hold_delay"):
            try:
                value = max(0.5, min(3.0, float(value)))
            except (TypeError, ValueError):
                return {"ok": False, "error": f"{key} must be a number between 0.5 and 3.0"}
        elif key == "ducking_mode":
            val = str(value).strip().lower()
            if val not in ("proportional", "fixed"):
                return {"ok": False, "error": "ducking_mode must be 'proportional' or 'fixed'"}
            value = val
        elif key == "ducking_proportional_pct":
            try:
                value = max(10, min(90, int(value)))
            except (TypeError, ValueError):
                return {"ok": False, "error": "ducking_proportional_pct must be an integer between 10 and 90"}
        elif key == "voice_ducking_volume":
            try:
                value = max(10, min(50, int(value)))
            except (TypeError, ValueError):
                return {"ok": False, "error": "voice_ducking_volume must be an integer between 10 and 50"}
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

    # ── Playback control callable methods (Delegated to py_modules) ────

    async def control_playback(self, action: str, device_id: str = "") -> dict:
        return await rpc_playback.control_playback(self, action, device_id)

    async def _auto_transfer_and_play(self, token: str, device_id: str = "") -> dict:
        return await rpc_playback.auto_transfer_and_play(self, token, device_id)

    async def set_volume(self, volume_percent: int) -> dict:
        return await volume.set_volume(self, volume_percent)

    async def trigger_ducking(self, active: bool, reason: str = "game", app_id: int | None = None) -> dict:
        """Trigger or release ducking from frontend AppLifetime listener or game events."""
        if not hasattr(self, "_volume_fader") or not self._volume_fader:
            self._volume_fader = volume.VolumeFader(self)

        if active and not self._settings.get("auto_ducking", True):
            return {"ok": True, "ducked": False, "skipped": "auto_ducking_disabled"}

        await self._volume_fader.set_ducking(bool(active), reason=str(reason))
        return {
            "ok": True,
            "is_ducked": self._volume_fader.is_ducked,
            "effective_volume": self._volume_fader.effective_volume,
        }

    async def get_ducking_state(self) -> dict:
        """Return live ducking status and effective volume level."""
        if not hasattr(self, "_volume_fader") or not self._volume_fader:
            self._volume_fader = volume.VolumeFader(self)
        return {
            "is_ducked": self._volume_fader.is_ducked,
            "effective_volume": self._volume_fader.effective_volume,
            "base_volume": self._poll_volume or 80,
            "duck_reasons": list(self._volume_fader._duck_reasons),
        }

    async def seek_playback(self, position_ms: int, device_id: str = "") -> dict:
        return await rpc_playback.seek_playback(self, position_ms, device_id)

    async def set_shuffle(self, state: bool, device_id: str = "") -> dict:
        return await rpc_playback.set_shuffle(self, state, device_id)

    async def set_repeat(self, state: str, device_id: str = "") -> dict:
        return await rpc_playback.set_repeat(self, state, device_id)

    async def _check_tracks_liked(self, token: str, track_ids: list[str]) -> dict[str, bool]:
        return await rpc_playback.check_tracks_liked(self, token, track_ids)

    async def _annotate_tracks_liked(self, token: str, tracks: list[dict]) -> None:
        await rpc_playback.annotate_tracks_liked(self, token, tracks)

    async def toggle_like_track(self, track_id: str = "", liked: bool | None = None) -> dict:
        return await rpc_playback.toggle_like_track(self, track_id, liked)

    toggle_like = toggle_like_track

    async def get_queue(self) -> dict:
        return await rpc_playback.get_queue(self)

    async def add_to_queue(self, uri: str, device_id: str = "") -> dict:
        return await rpc_playback.add_to_queue(self, uri, device_id)

    # ── Playlist / context-play callable methods ─────────────────

    async def get_playlists(self, offset: int = 0) -> dict:
        return await rpc_library.get_playlists(self, offset)

    async def get_playlist_tracks(
        self,
        playlist_id: str,
        offset: int = 0,
        fetch_all: bool = False,
        limit: int = 50,
    ) -> dict:
        return await rpc_library.get_playlist_tracks(self, playlist_id, offset, fetch_all, limit)

    async def add_track_to_playlist(self, playlist_id: str, track_uri: str) -> dict:
        return await rpc_library.add_track_to_playlist(self, playlist_id, track_uri)

    async def _sync_native_spotify_folders(self) -> list[dict]:
        return await rpc_library.sync_native_spotify_folders(self)

    async def get_playlist_folders(self) -> dict:
        return await rpc_library.get_playlist_folders(self)

    async def manage_playlist_folder(
        self,
        action: str,
        folder_id: str = "",
        name: str = "",
        playlist_id: str = "",
        folders: list | None = None,
    ) -> dict:
        return await rpc_library.manage_playlist_folder(self, action, folder_id, name, playlist_id, folders)

    async def set_native_playlist_mix(self, playlist_id: str, enabled: bool = True, play_now: bool = True) -> dict:
        return await rpc_library.set_native_playlist_mix(self, playlist_id, enabled, play_now)

    set_native_mix = set_native_playlist_mix

    # ── Official Spotify Client Remote & Sleep Timer ───────────

    def get_sleep_timer_status(self) -> dict:
        return system.get_sleep_timer_status(self)

    async def set_sleep_timer(
        self,
        minutes: int | None = None,
        shutdown_on_finish: bool = False,
        end_of_track: bool = False,
    ) -> dict:
        return await system.set_sleep_timer(self, minutes, shutdown_on_finish, end_of_track)

    async def _sleep_timer_worker(self):
        return await system.sleep_timer_worker(self)

    async def _apply_equalizer_preset(self, preset: str) -> None:
        await volume.apply_equalizer_preset(self, preset)

    async def get_spotify_client_auth_status(self) -> dict:
        return await system.get_client_auth_status()

    async def get_client_window_status(self) -> dict:
        return await system.get_client_auth_status()

    async def create_playlist(self, name: str, public: bool = False) -> dict:
        return await rpc_library.create_playlist(self, name, public)

    async def remove_track_from_playlist(self, playlist_id: str, track_uri: str) -> dict:
        return await rpc_library.remove_track_from_playlist(self, playlist_id, track_uri)

    async def get_audio_sinks(self) -> dict:
        return await volume.get_audio_sinks()

    async def set_audio_sink(self, sink_name: str) -> dict:
        return await volume.set_audio_sink(sink_name)

    async def get_liked_tracks(self, offset: int = 0, fetch_all: bool = True) -> dict:
        return await rpc_library.get_liked_tracks(self, offset, fetch_all)

    async def get_saved_episodes(self, offset: int = 0) -> dict:
        return await rpc_library.get_saved_episodes(self, offset)

    async def get_saved_shows(self, offset: int = 0) -> dict:
        return await rpc_library.get_saved_shows(self, offset)

    async def get_saved_albums(self, offset: int = 0) -> dict:
        return await rpc_library.get_saved_albums(self, offset)

    async def get_album_tracks(self, album_id: str, offset: int = 0) -> dict:
        return await rpc_library.get_album_tracks(self, album_id, offset)

    async def get_followed_artists(self) -> dict:
        return await rpc_library.get_followed_artists(self)

    async def get_artist_albums(self, artist_id: str, offset: int = 0) -> dict:
        return await rpc_library.get_artist_albums(self, artist_id, offset)

    async def get_artist_top_tracks(self, artist_id: str) -> dict:
        return await rpc_library.get_artist_top_tracks(self, artist_id)

    async def get_recently_played(self, limit: int = 30) -> dict:
        return await rpc_library.get_recently_played(self, limit)

    async def search_spotify(
        self,
        query: str,
        types: str = "track,artist,album,playlist",
        limit: int = 50,
        offset: int = 0,
    ) -> dict:
        return await rpc_library.search_spotify(self, query, types, limit, offset)

    async def get_track_recommendations(self, seed_track_id: str, limit: int = 25) -> dict:
        return await rpc_library.get_track_recommendations(self, seed_track_id, limit)

    async def get_lyrics(
        self,
        track_name: str,
        artist_name: str,
        duration_sec: int = 0,
        provider_offset: int = 0,
    ) -> dict:
        return await rpc_library.get_lyrics(self, track_name, artist_name, duration_sec, provider_offset)

    async def get_image(self, url: str) -> dict:
        return await rpc_library.get_image(url)

    async def shutdown_system(self) -> dict:
        return await system.shutdown_system()

    async def play_tracks(
        self,
        context_uri: str | None = None,
        offset_uri: str | None = None,
        uris: list | None = None,
        position: int = 0,
    ) -> dict:
        return await rpc_playback.play_tracks(self, context_uri, offset_uri, uris, position)

    play_track = play_tracks

    async def get_devices(self) -> dict:
        return await rpc_playback.get_devices(self)

    async def transfer_playback(self, device_id: str) -> dict:
        return await rpc_playback.transfer_playback(self, device_id)

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
        await volume.refresh_audio_stream_info(self)

    async def _set_pa_volume_percent(self, percent: int) -> bool:
        """Set librespot's PulseAudio sink-input volume percentage."""
        return await volume.set_pa_volume_percent(self, percent)

    async def _boost_pa_volume(self):
        """Set librespot's PulseAudio sink-input to 150% for audible volume."""
        await volume.boost_pa_volume(self)

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
