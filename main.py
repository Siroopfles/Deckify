import asyncio
import base64
import hashlib
import json
import os
import secrets
import socket
import ssl
import subprocess
import time
import urllib.parse
import urllib.request
from html import escape

import decky

# Decky Loader (PyInstaller) injects LD_LIBRARY_PATH pointing to its bundled
# libs which are older than the system's.  Subprocesses like openssl and
# librespot then load the wrong libssl/libcrypto and crash.  Strip it early.
os.environ.pop("LD_LIBRARY_PATH", None)

SETTINGS_FILE = os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, "settings.json")
LIBRESPOT_BIN = os.path.join(decky.DECKY_PLUGIN_DIR, "bin", "librespot")
CACHE_DIR = os.path.join(decky.DECKY_PLUGIN_RUNTIME_DIR, "cache")
LIBRESPOT_PID_FILE = os.path.join(decky.DECKY_PLUGIN_RUNTIME_DIR, "librespot.pid")
SSL_CERT = os.path.join(decky.DECKY_PLUGIN_RUNTIME_DIR, "cert.pem")
SSL_KEY = os.path.join(decky.DECKY_PLUGIN_RUNTIME_DIR, "key.pem")

VALID_MIX_MODES = ("off", "auto", "fade", "rise", "blend", "slam")

DEFAULT_SETTINGS = {
    "device_name": "",
    "bitrate": 320,
    "spotify_client_id": "",
    "normalisation": True,
    "normalisation_pregain": 0.0,
    "gapless": True,
    "autoplay": True,
    "mix_mode": "off",
    "crossfade_seconds": 6,
    "mixed_playlists": {},
}

# PulseAudio socket for root processes (deck user UID 1000)
PULSE_SERVER = "unix:/run/user/1000/pulse/native"

SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize"
SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token"
SPOTIFY_API_BASE = "https://api.spotify.com/v1"
SPOTIFY_SCOPES = (
    "user-read-currently-playing user-read-playback-state user-modify-playback-state "
    "playlist-read-private playlist-read-collaborative user-library-read "
    "user-library-modify user-follow-read user-read-recently-played"
)
CURRENT_SCOPES_VERSION = 5
OAUTH_SERVER_PORT = 39281
DASHBOARD_PORT = 39282
DASHBOARD_DIR = os.path.join(decky.DECKY_PLUGIN_DIR, "dashboard", "dist")
MAX_IMAGE_BYTES = 5 * 1024 * 1024

# SSL context for outgoing HTTPS requests (Spotify API).
# Root environments on SteamOS may not find system CA certs automatically.
_API_SSL_CTX: ssl.SSLContext | None = None
for _ca in ("/etc/ssl/certs/ca-certificates.crt", "/etc/ssl/cert.pem"):
    if os.path.isfile(_ca):
        _API_SSL_CTX = ssl.create_default_context(cafile=_ca)
        break
if _API_SSL_CTX is None:
    _API_SSL_CTX = ssl.create_default_context()


def _validate_image_url(url: str) -> None:
    parsed = urllib.parse.urlsplit(url)
    host = parsed.hostname or ""
    if (parsed.scheme != "https" or parsed.port not in (None, 443)
            or parsed.username is not None or parsed.password is not None
            or not host.endswith((".scdn.co", ".spotifycdn.com"))):
        raise ValueError("Only Spotify HTTPS image URLs are supported")


class _ImageRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        _validate_image_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _fetch_spotify_image(url: str) -> tuple[str, bytes]:
    _validate_image_url(url)
    opener = urllib.request.build_opener(
        _ImageRedirectHandler(), urllib.request.HTTPSHandler(context=_API_SSL_CTX),
    )
    with opener.open(url, timeout=10) as response:
        content_type = response.headers.get_content_type()
        if content_type not in ("image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"):
            raise RuntimeError("Spotify returned an unsupported image format")
        body = response.read(MAX_IMAGE_BYTES + 1)
        if len(body) > MAX_IMAGE_BYTES:
            raise RuntimeError("Spotify image exceeds the size limit")
        return content_type, body


def _image_url(images: list) -> str | None:
    if not images:
        return None
    query = urllib.parse.urlencode({"url": images[0]["url"]})
    return f"http://127.0.0.1:{DASHBOARD_PORT}/api/image?{query}"


def _load_settings() -> dict:
    try:
        with open(SETTINGS_FILE, "r") as f:
            saved = json.load(f)
        merged = {**DEFAULT_SETTINGS, **saved}
        # Older versions saved this fixed default without offering a name editor.
        if merged["device_name"] == "Steam Deck" and not saved.get("device_name_customized"):
            merged["device_name"] = ""
        return merged
    except Exception:
        return dict(DEFAULT_SETTINGS)


def _save_settings(settings: dict) -> None:
    os.makedirs(os.path.dirname(SETTINGS_FILE), exist_ok=True)
    with open(SETTINGS_FILE, "w") as f:
        json.dump(settings, f, indent=2)


def _get_lan_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
        finally:
            s.close()
    except Exception:
        return "127.0.0.1"


def _get_mdns_host() -> str:
    try:
        return f"{socket.gethostname()}.local"
    except Exception:
        return _get_lan_ip()


def _ensure_ssl_cert() -> tuple[ssl.SSLContext, None] | tuple[None, str]:
    if not os.path.isfile(SSL_CERT) or not os.path.isfile(SSL_KEY):
        decky.logger.info("SSL cert not found at %s, generating...", SSL_CERT)
        mdns_host = _get_mdns_host()
        os.makedirs(os.path.dirname(SSL_CERT), exist_ok=True)
        try:
            result = subprocess.run([
                "openssl", "req", "-x509", "-newkey", "rsa:2048",
                "-keyout", SSL_KEY, "-out", SSL_CERT,
                "-days", "3650", "-nodes",
                "-subj", f"/CN={mdns_host}",
                "-config", "/dev/null",
            ], capture_output=True, text=True)
            if result.returncode != 0:
                msg = f"openssl failed (code {result.returncode}): {result.stderr.strip()}"
                decky.logger.error(msg)
                return None, msg
        except Exception as e:
            msg = f"Failed to run openssl: {e}"
            decky.logger.error(msg)
            return None, msg
    else:
        decky.logger.info("SSL cert found at %s", SSL_CERT)
    try:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(SSL_CERT, SSL_KEY)
        return ctx, None
    except Exception as e:
        msg = f"Failed to load SSL cert: {e}"
        decky.logger.error(msg)
        return None, msg


def _generate_pkce_pair() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return verifier, challenge


def _spotify_token_request(params: dict) -> dict:
    data = urllib.parse.urlencode(params).encode("utf-8")
    req = urllib.request.Request(
        SPOTIFY_TOKEN_URL, data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(req, timeout=10, context=_API_SSL_CTX) as resp:
        return json.loads(resp.read())


def _spotify_api_request(endpoint: str, token: str, method: str = "GET", params: dict | None = None, body: dict | None = None) -> dict | None:
    url = f"{SPOTIFY_API_BASE}/{endpoint}"
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"
    headers = {"Authorization": f"Bearer {token}"}
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=10, context=_API_SSL_CTX) as resp:
        if resp.status == 204:
            return None
        raw = resp.read()
        if not raw or not raw.strip():
            return None
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return None


def _parse_spotify_error(e: urllib.error.HTTPError) -> str:
    """Extract human-readable message from Spotify API error response."""
    try:
        body = json.loads(e.read())
        return body.get("error", {}).get("message", f"Spotify API error: {e.code}")
    except Exception:
        return f"Spotify API error: {e.code}"


async def _exec(fn, *args, timeout=10):
    """Run blocking I/O in executor with asyncio-level timeout (covers DNS)."""
    try:
        return await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(None, fn, *args),
            timeout=timeout,
        )
    except asyncio.TimeoutError:
        raise TimeoutError(f"Request timed out after {timeout}s")


class Plugin:
    _process: subprocess.Popen | None = None
    _monitor_task: asyncio.Task | None = None
    _api_poll_task: asyncio.Task | None = None
    _settings: dict = {}
    _last_event: dict | None = None
    # Dashboard server
    _dashboard_server: asyncio.Server | None = None
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
    _mix_transitioning_track_id: str | None = None
    _mix_task: asyncio.Task | None = None
    # Token refresh lock (initialized in _main)
    _token_refresh_lock: asyncio.Lock | None = None
    # Crash auto-restart state
    _crash_timestamps: list = []
    _pa_volume_boosted: bool = False
    _stable_start: float = 0

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
                     if k not in ("access_token", "refresh_token", "token_expires_at", "spotify_client_id")}
        decky.logger.info("Deckify loaded, settings: %s", safe_keys)
        await self._start_dashboard()
        if self._access_token:
            self._start_api_poll()
        await self.start_librespot()

    async def _unload(self):
        decky.logger.info("Deckify unloading")
        await self._kill_librespot()
        await self._stop_dashboard()
        await self._stop_oauth_server()
        await self._stop_api_poll()
        await self._stop_monitor()

    async def _uninstall(self):
        decky.logger.info("Deckify uninstalling")
        await self._kill_librespot()
        await self._stop_dashboard()
        await self._stop_oauth_server()
        await self._stop_api_poll()
        await self._stop_monitor()

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

    # ── Callable methods (frontend → backend) ─────────────────

    async def start_librespot(self) -> dict:
        if self._process and self._process.poll() is None:
            return {"ok": True, "message": "already running"}

        self._kill_stale_librespot()

        if not os.path.isfile(LIBRESPOT_BIN):
            msg = f"librespot binary not found at {LIBRESPOT_BIN}"
            decky.logger.error(msg)
            await decky.emit("librespot_status", {"running": False, "error": msg})
            return {"ok": False, "error": msg}

        os.makedirs(CACHE_DIR, exist_ok=True)

        settings = self._settings
        cmd = [
            LIBRESPOT_BIN,
            "--name", settings.get("device_name") or socket.gethostname(),
            "--device-type", "computer",
            "--bitrate", str(settings.get("bitrate", 320)),
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
        await decky.emit("librespot_status", {"running": True, "error": None})
        decky.logger.info("librespot started, pid=%d", self._process.pid)
        return {"ok": True, "pid": self._process.pid}

    async def stop_librespot(self) -> dict:
        await self._stop_monitor()
        await self._kill_librespot()
        self._last_event = None
        await decky.emit("librespot_status", {"running": False, "error": None})
        return {"ok": True}

    def _get_active_mix_mode(self) -> str:
        """Return the active Mix preset for the current playback context or global setting."""
        mixed_map = self._settings.get("mixed_playlists")
        if isinstance(mixed_map, dict) and self._context_uri.startswith("spotify:playlist:"):
            pid = self._context_uri.split(":")[-1]
            preset = mixed_map.get(pid)
            if preset in VALID_MIX_MODES and preset != "off":
                return preset
        mode = self._settings.get("mix_mode", "off")
        return mode if mode in VALID_MIX_MODES else "off"

    async def get_status(self) -> dict:
        running = self._process is not None and self._process.poll() is None
        is_playing = self._poll_play_state == "playing"
        position_ms = self._last_event.get("position_ms", 0) if self._last_event else 0
        duration_ms = self._last_event.get("duration_ms", 0) if self._last_event else 0
        public_keys = (
            "device_name", "bitrate", "spotify_client_id",
            "normalisation", "normalisation_pregain", "gapless",
            "autoplay", "mix_mode", "crossfade_seconds", "mixed_playlists",
        )
        return {
            "running": running,
            "binary_found": os.path.isfile(LIBRESPOT_BIN),
            "settings": {k: v for k, v in self._settings.items() if k in public_keys},
            "last_event": self._last_event,
            "track_meta": self._track_meta,
            "volume": self._poll_volume,
            "active_device": self._active_device,
            "is_playing": is_playing,
            "position_ms": position_ms,
            "duration_ms": duration_ms,
            "shuffle_state": self._shuffle_state,
            "repeat_state": self._repeat_state,
            "is_liked": self._is_liked,
            "context_uri": self._context_uri,
            "active_mix_mode": self._get_active_mix_mode(),
        }

    async def get_settings(self) -> dict:
        return dict(self._settings)

    async def set_setting(self, key: str, value) -> dict:
        if key not in DEFAULT_SETTINGS:
            return {"ok": False, "error": f"unknown setting: {key}"}
        if key == "device_name":
            if not isinstance(value, str) or any(ord(char) < 32 or ord(char) == 127 for char in value):
                return {"ok": False, "error": "Device name must be text without control characters"}
            value = value.strip()
            self._settings["device_name_customized"] = True
        elif key == "mix_mode":
            if value not in VALID_MIX_MODES:
                return {"ok": False, "error": "Invalid mix_mode"}
        elif key == "crossfade_seconds":
            try:
                value = max(0, min(12, int(value)))
            except (TypeError, ValueError):
                return {"ok": False, "error": "crossfade_seconds must be an integer"}
        elif key in ("normalisation", "gapless", "autoplay"):
            value = bool(value)
        elif key == "normalisation_pregain":
            try:
                value = max(-10.0, min(10.0, float(value)))
            except (TypeError, ValueError):
                return {"ok": False, "error": "normalisation_pregain must be a number"}
        elif key == "mixed_playlists":
            if not isinstance(value, dict):
                return {"ok": False, "error": "mixed_playlists must be an object"}
        self._settings[key] = value
        _save_settings(self._settings)
        decky.logger.info("Setting updated: %s = %s", key, value)
        return {"ok": True, "settings": dict(self._settings)}

    # ── Playback control callable methods ────────────────────────

    async def control_playback(self, action: str, device_id: str = "") -> dict:
        decky.logger.info("control_playback: action=%s device_id=%s", action, device_id)
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}

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
        """Batch-check saved status via Spotify's /me/library/contains endpoint."""
        clean_ids = [tid for tid in dict.fromkeys(track_ids) if tid]
        if not clean_ids:
            return {}
        result: dict[str, bool] = {}
        for i in range(0, len(clean_ids), 40):
            chunk = clean_ids[i:i + 40]
            uris = ",".join(f"spotify:track:{tid}" for tid in chunk)
            try:
                res = await _exec(
                    _spotify_api_request, "me/library/contains", token, "GET",
                    {"uris": uris},
                )
                if isinstance(res, list):
                    for tid, flag in zip(chunk, res):
                        result[tid] = bool(flag)
            except Exception as e:
                decky.logger.warning("me/library/contains check failed: %s", e)
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
        track_uri = f"spotify:track:{target_id}"
        try:
            await _exec(
                _spotify_api_request, "me/library", token, method,
                {"uris": track_uri},
            )
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
                return {
                    "id": item.get("id"),
                    "name": item.get("name", ""),
                    "artist": artists,
                    "album": album,
                    "uri": item.get("uri", ""),
                    "duration_ms": item.get("duration_ms", 0),
                    "image_url": _image_url(images),
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
            mixed_map = self._settings.get("mixed_playlists")
            if not isinstance(mixed_map, dict):
                mixed_map = {}
            playlists = []
            for p in items:
                images = p.get("images") or []
                pid = p["id"]
                preset = mixed_map.get(pid, "off")
                playlists.append({
                    "id": pid,
                    "name": p.get("name", ""),
                    "image_url": _image_url(images),
                    "track_count": (p.get("items") or p.get("tracks") or {}).get("total", 0),
                    "owner_id": p.get("owner", {}).get("id", ""),
                    "mix_enabled": preset in VALID_MIX_MODES and preset != "off",
                    "mix_preset": preset if preset in VALID_MIX_MODES and preset != "off" else "auto",
                })
            total = data.get("total", 0) if data else 0
            return {"ok": True, "playlists": playlists, "total": total, "offset": offset}
        except Exception as e:
            decky.logger.error("get_playlists failed: %s", e)
            return {"ok": False, "error": str(e)}

    async def get_playlist_tracks(self, playlist_id: str, offset: int = 0) -> dict:
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        try:
            data = await _exec(
                _spotify_api_request,
                f"playlists/{playlist_id}/items", token, "GET",
                {"limit": 50, "offset": offset},
            )
            items = data.get("items", []) if data else []
            tracks = []
            for item in items:
                t = item.get("item") or item.get("track")
                if t is None:
                    continue
                artists = ", ".join(a["name"] for a in t.get("artists", []))
                images = t.get("album", {}).get("images") or []
                tracks.append({
                    "id": t.get("id"),
                    "name": t.get("name", ""),
                    "artist": artists,
                    "album": t.get("album", {}).get("name", ""),
                    "uri": t.get("uri", ""),
                    "duration_ms": t.get("duration_ms", 0),
                    "image_url": _image_url(images),
                })
            await self._annotate_tracks_liked(token, tracks)
            total = data.get("total", 0) if data else 0
            return {"ok": True, "tracks": tracks, "total": total, "offset": offset}
        except Exception as e:
            decky.logger.error("get_playlist_tracks failed: %s", e)
            return {"ok": False, "error": str(e)}

    async def get_liked_tracks(self, offset: int = 0) -> dict:
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        try:
            data = await _exec(
                _spotify_api_request, "me/tracks", token, "GET",
                {"limit": 50, "offset": offset},
            )
            items = data.get("items", []) if data else []
            tracks = []
            for item in items:
                t = item.get("track")
                if t is None:
                    continue
                artists = ", ".join(a["name"] for a in t.get("artists", []))
                images = t.get("album", {}).get("images") or []
                tracks.append({
                    "id": t.get("id"),
                    "name": t.get("name", ""),
                    "artist": artists,
                    "album": t.get("album", {}).get("name", ""),
                    "uri": t.get("uri", ""),
                    "duration_ms": t.get("duration_ms", 0),
                    "image_url": _image_url(images),
                    "is_liked": True,
                })
            total = data.get("total", 0) if data else 0
            return {"ok": True, "tracks": tracks, "total": total, "offset": offset}
        except Exception as e:
            decky.logger.error("get_liked_tracks failed: %s", e)
            return {"ok": False, "error": str(e)}

    async def get_saved_episodes(self, offset: int = 0) -> dict:
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        try:
            data = await _exec(
                _spotify_api_request, "me/episodes", token, "GET",
                {"limit": 50, "offset": offset},
            )
            items = data.get("items", []) if data else []
            episodes = []
            for item in items:
                ep = item.get("episode")
                if ep is None:
                    continue
                images = ep.get("images") or []
                episodes.append({
                    "id": ep.get("id"),
                    "name": ep.get("name", ""),
                    "show_name": ep.get("show", {}).get("name", ""),
                    "uri": ep.get("uri", ""),
                    "duration_ms": ep.get("duration_ms", 0),
                    "image_url": _image_url(images),
                })
            total = data.get("total", 0) if data else 0
            return {"ok": True, "episodes": episodes, "total": total, "offset": offset}
        except Exception as e:
            decky.logger.error("get_saved_episodes failed: %s", e)
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
            data = await _exec(
                _spotify_api_request,
                f"albums/{album_id}/tracks", token, "GET",
                {"limit": 50, "offset": offset},
            )
            items = data.get("items", []) if data else []
            tracks = []
            for t in items:
                artists = ", ".join(a["name"] for a in t.get("artists", []))
                tracks.append({
                    "id": t.get("id"),
                    "name": t.get("name", ""),
                    "artist": artists,
                    "album": "",
                    "uri": t.get("uri", ""),
                    "duration_ms": t.get("duration_ms", 0),
                    "image_url": None,
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
                tracks.append({
                    "id": t.get("id"),
                    "name": t.get("name", ""),
                    "artist": artists,
                    "album": t.get("album", {}).get("name", ""),
                    "uri": t.get("uri", ""),
                    "duration_ms": t.get("duration_ms", 0),
                    "image_url": _image_url(images),
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
                tracks.append({
                    "id": t.get("id"),
                    "name": t.get("name", ""),
                    "artist": artists,
                    "album": t.get("album", {}).get("name", ""),
                    "uri": uri,
                    "duration_ms": t.get("duration_ms", 0),
                    "image_url": _image_url(images),
                })
            await self._annotate_tracks_liked(token, tracks)
            return {"ok": True, "tracks": tracks}
        except Exception as e:
            decky.logger.error("get_recently_played failed: %s", e)
            return {"ok": False, "error": str(e)}

    async def search_spotify(self, query: str, types: str = "track,artist,album,playlist", offset: int = 0) -> dict:
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        try:
            data = await _exec(
                _spotify_api_request, "search", token, "GET",
                {"q": query, "type": types, "limit": 10, "offset": offset},
            )
            if not data:
                return {"ok": True, "tracks": [], "artists": [], "albums": [], "playlists": []}
            tracks = []
            for t in data.get("tracks", {}).get("items", []):
                artists = ", ".join(a["name"] for a in t.get("artists", []))
                images = t.get("album", {}).get("images") or []
                tracks.append({
                    "id": t.get("id"), "name": t.get("name", ""), "artist": artists,
                    "album": t.get("album", {}).get("name", ""), "uri": t.get("uri", ""),
                    "duration_ms": t.get("duration_ms", 0),
                    "image_url": _image_url(images),
                })
            await self._annotate_tracks_liked(token, tracks)
            artists_out = []
            for a in data.get("artists", {}).get("items", []):
                images = a.get("images") or []
                artists_out.append({
                    "id": a["id"], "name": a.get("name", ""),
                    "image_url": _image_url(images),
                })
            albums_out = []
            for a in data.get("albums", {}).get("items", []):
                images = a.get("images") or []
                ar = ", ".join(x["name"] for x in a.get("artists", []))
                albums_out.append({
                    "id": a["id"], "name": a.get("name", ""), "artist": ar,
                    "image_url": _image_url(images),
                    "track_count": a.get("total_tracks", 0), "uri": a.get("uri", ""),
                })
            mixed_map = self._settings.get("mixed_playlists")
            if not isinstance(mixed_map, dict):
                mixed_map = {}
            playlists_out = []
            for p in data.get("playlists", {}).get("items", []):
                if p is None:
                    continue
                images = p.get("images") or []
                pid = p["id"]
                preset = mixed_map.get(pid, "off")
                playlists_out.append({
                    "id": pid, "name": p.get("name", ""),
                    "image_url": _image_url(images),
                    "track_count": (p.get("items") or p.get("tracks") or {}).get("total", 0),
                    "owner_id": p.get("owner", {}).get("id", ""),
                    "mix_enabled": preset in VALID_MIX_MODES and preset != "off",
                    "mix_preset": preset if preset in VALID_MIX_MODES and preset != "off" else "auto",
                })
            return {"ok": True, "tracks": tracks, "artists": artists_out, "albums": albums_out, "playlists": playlists_out}
        except Exception as e:
            decky.logger.error("search_spotify failed: %s", e)
            return {"ok": False, "error": str(e)}

    async def play_tracks(self, context_uri: str | None = None, offset_uri: str | None = None, uris: list | None = None, position: int = 0) -> dict:
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
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

    async def toggle_playlist_mix(
        self,
        playlist_id: str,
        enabled: bool | None = None,
        preset: str = "auto",
    ) -> dict:
        """Toggle or update Spotify Playlist Mix mode for a specific playlist."""
        pid = (playlist_id or "").strip()
        if pid.startswith("spotify:playlist:"):
            pid = pid.split(":")[-1]
        if not pid:
            return {"ok": False, "error": "Missing playlist_id"}
        mixed_map = self._settings.get("mixed_playlists")
        if not isinstance(mixed_map, dict):
            mixed_map = {}
        else:
            mixed_map = dict(mixed_map)
        current_enabled = pid in mixed_map and mixed_map[pid] != "off"
        target_enabled = (not current_enabled) if enabled is None else bool(enabled)
        chosen_preset = preset if preset in VALID_MIX_MODES and preset != "off" else mixed_map.get(pid, "auto")
        if chosen_preset not in VALID_MIX_MODES or chosen_preset == "off":
            chosen_preset = "auto"
        if target_enabled:
            mixed_map[pid] = chosen_preset
        else:
            mixed_map.pop(pid, None)
        self._settings["mixed_playlists"] = mixed_map
        _save_settings(self._settings)
        decky.logger.info("Playlist Mix updated: playlist=%s enabled=%s preset=%s", pid, target_enabled, chosen_preset)
        return {
            "ok": True,
            "playlist_id": pid,
            "mix_enabled": target_enabled,
            "mix_preset": chosen_preset if target_enabled else "off",
            "mixed_playlists": mixed_map,
        }

    async def start_mix_play(
        self,
        context_uri: str | None = None,
        uris: list | None = None,
        mix_mode: str = "auto",
        crossfade_seconds: int = 6,
        shuffle: bool = False,
    ) -> dict:
        """Start Spotify Playlist Mix playback in sequence with the selected transition preset."""
        chosen_mode = mix_mode if mix_mode in VALID_MIX_MODES and mix_mode != "off" else "auto"
        if context_uri and context_uri.startswith("spotify:playlist:"):
            pid = context_uri.split(":")[-1]
            mixed_map = self._settings.get("mixed_playlists")
            if not isinstance(mixed_map, dict):
                mixed_map = {}
            else:
                mixed_map = dict(mixed_map)
            mixed_map[pid] = chosen_mode
            self._settings["mixed_playlists"] = mixed_map
        else:
            self._settings["mix_mode"] = chosen_mode
        if crossfade_seconds > 0:
            self._settings["crossfade_seconds"] = max(1, min(12, int(crossfade_seconds)))
        _save_settings(self._settings)

        play_res = await self.play_tracks(context_uri=context_uri, uris=uris)
        if not play_res.get("ok"):
            return play_res
        # In Spotify Playlist Mix, playlists play in their mixed track sequence (shuffle off by default)
        await self.set_shuffle(bool(shuffle))
        return {
            "ok": True,
            "mix_mode": chosen_mode,
            "crossfade_seconds": self._settings["crossfade_seconds"],
            "shuffle_state": self._shuffle_state,
            "mixed_playlists": self._settings.get("mixed_playlists", {}),
        }

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

    async def get_dashboard_url(self) -> dict:
        if self._dashboard_server is None:
            return {"ok": False, "error": "Dashboard server is unavailable"}
        return {"ok": True, "url": f"http://127.0.0.1:{DASHBOARD_PORT}"}

    # ── Dashboard server ──────────────────────────────────────

    async def _start_dashboard(self):
        if self._dashboard_server:
            return
        try:
            self._dashboard_server = await asyncio.start_server(
                self._handle_dashboard_request, "127.0.0.1", DASHBOARD_PORT,
            )
            decky.logger.info("Dashboard server started on port %d", DASHBOARD_PORT)
        except Exception as e:
            decky.logger.error("Failed to start dashboard server: %s", e)

    async def _stop_dashboard(self):
        if self._dashboard_server:
            self._dashboard_server.close()
            await self._dashboard_server.wait_closed()
            self._dashboard_server = None
            decky.logger.info("Dashboard server stopped")

    async def _handle_dashboard_request(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        try:
            data = await asyncio.wait_for(reader.read(65536), timeout=10)
            if not data:
                writer.close()
                return

            request_line = data.decode("utf-8", errors="replace").split("\r\n")[0]
            parts = request_line.split(" ")
            if len(parts) < 2:
                await self._send_json(writer, 400, {"error": "Bad request"})
                return

            method, raw_path = parts[0], parts[1]
            parsed = urllib.parse.urlparse(raw_path)
            path = parsed.path
            qs = urllib.parse.parse_qs(parsed.query)

            # Parse JSON body for POST requests
            body_json = None
            if method == "POST":
                raw_str = data.decode("utf-8", errors="replace")
                header_body = raw_str.split("\r\n\r\n", 1)
                if len(header_body) > 1 and header_body[1].strip():
                    try:
                        body_json = json.loads(header_body[1])
                    except (json.JSONDecodeError, ValueError) as e:
                        decky.logger.warning("Dashboard POST body JSON parse failed: %s", e)

            # CORS preflight
            if method == "OPTIONS":
                header = "HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\nConnection: close\r\n\r\n"
                writer.write(header.encode())
                await writer.drain()
                writer.close()
                return

            # API routes
            if path == "/api/status":
                await self._api_status(writer)
            elif path == "/api/image" and method == "GET":
                await self._serve_image(writer, qs.get("url", [""])[0])
            elif path == "/api/control" and method == "POST":
                action = qs.get("action", [None])[0]
                if not action:
                    await self._send_json(writer, 400, {"error": "Missing action param"})
                else:
                    result = await self.control_playback(action)
                    await self._send_json(writer, 200, result)
            elif path == "/api/volume" and method == "POST":
                value = qs.get("value", [None])[0]
                if value is None:
                    await self._send_json(writer, 400, {"error": "Missing value param"})
                else:
                    result = await self.set_volume(int(value))
                    await self._send_json(writer, 200, result)
            elif path == "/api/playlists" and method == "GET":
                offset = int(qs.get("offset", [0])[0])
                result = await self.get_playlists(offset)
                await self._send_json(writer, 200, result)
            elif path.startswith("/api/playlists/") and path.endswith("/tracks") and method == "GET":
                playlist_id = path.split("/")[3]
                offset = int(qs.get("offset", [0])[0])
                result = await self.get_playlist_tracks(playlist_id, offset)
                await self._send_json(writer, 200, result)
            elif path == "/api/liked-tracks" and method == "GET":
                offset = int(qs.get("offset", [0])[0])
                result = await self.get_liked_tracks(offset)
                await self._send_json(writer, 200, result)
            elif path == "/api/episodes" and method == "GET":
                offset = int(qs.get("offset", [0])[0])
                result = await self.get_saved_episodes(offset)
                await self._send_json(writer, 200, result)
            elif path == "/api/albums" and method == "GET":
                offset = int(qs.get("offset", [0])[0])
                result = await self.get_saved_albums(offset)
                await self._send_json(writer, 200, result)
            elif path.startswith("/api/albums/") and path.endswith("/tracks") and method == "GET":
                album_id = path.split("/")[3]
                offset = int(qs.get("offset", [0])[0])
                result = await self.get_album_tracks(album_id, offset)
                await self._send_json(writer, 200, result)
            elif path == "/api/artists" and method == "GET":
                result = await self.get_followed_artists()
                await self._send_json(writer, 200, result)
            elif path.startswith("/api/artists/") and path.endswith("/albums") and method == "GET":
                artist_id = path.split("/")[3]
                offset = int(qs.get("offset", [0])[0])
                result = await self.get_artist_albums(artist_id, offset)
                await self._send_json(writer, 200, result)
            elif path.startswith("/api/artists/") and path.endswith("/top-tracks") and method == "GET":
                artist_id = path.split("/")[3]
                result = await self.get_artist_top_tracks(artist_id)
                await self._send_json(writer, 200, result)
            elif path == "/api/recently-played" and method == "GET":
                limit = int(qs.get("limit", [30])[0])
                result = await self.get_recently_played(limit)
                await self._send_json(writer, 200, result)
            elif path == "/api/seek" and method == "POST":
                b = body_json or {}
                pos = b.get("position_ms") if "position_ms" in b else qs.get("position_ms", [0])[0]
                result = await self.seek_playback(int(pos))
                await self._send_json(writer, 200, result)
            elif path == "/api/shuffle" and method == "POST":
                b = body_json or {}
                raw_state = b.get("state") if "state" in b else qs.get("state", ["false"])[0]
                state_bool = raw_state if isinstance(raw_state, bool) else str(raw_state).lower() == "true"
                result = await self.set_shuffle(state_bool)
                await self._send_json(writer, 200, result)
            elif path == "/api/repeat" and method == "POST":
                b = body_json or {}
                state_str = str(b.get("state") or qs.get("state", ["off"])[0])
                result = await self.set_repeat(state_str)
                await self._send_json(writer, 200, result)
            elif path == "/api/like" and method == "POST":
                b = body_json or {}
                track_id = str(b.get("track_id") or qs.get("track_id", [""])[0])
                liked = b.get("liked")
                result = await self.toggle_like_track(track_id, liked)
                await self._send_json(writer, 200, result)
            elif path == "/api/queue" and method == "GET":
                result = await self.get_queue()
                await self._send_json(writer, 200, result)
            elif path == "/api/queue" and method == "POST":
                b = body_json or {}
                uri = str(b.get("uri") or qs.get("uri", [""])[0])
                result = await self.add_to_queue(uri)
                await self._send_json(writer, 200, result)
            elif path == "/api/devices" and method == "GET":
                result = await self.get_devices()
                await self._send_json(writer, 200, result)
            elif path == "/api/transfer" and method == "POST":
                b = body_json or {}
                device_id = str(b.get("device_id") or qs.get("device_id", [""])[0])
                result = await self.transfer_playback(device_id)
                await self._send_json(writer, 200, result)
            elif path == "/api/mix" and method == "POST":
                b = body_json or {}
                for k in ("mix_mode", "crossfade_seconds", "normalisation", "gapless", "autoplay", "mixed_playlists"):
                    if k in b:
                        await self.set_setting(k, b[k])
                await self._send_json(writer, 200, {
                    "ok": True,
                    "mix_mode": self._settings.get("mix_mode", "off"),
                    "active_mix_mode": self._get_active_mix_mode(),
                    "crossfade_seconds": self._settings.get("crossfade_seconds", 6),
                    "normalisation": self._settings.get("normalisation", True),
                    "gapless": self._settings.get("gapless", True),
                    "autoplay": self._settings.get("autoplay", True),
                    "mixed_playlists": self._settings.get("mixed_playlists", {}),
                })
            elif path == "/api/playlist-mix" and method == "POST":
                b = body_json or {}
                pid = str(b.get("playlist_id") or qs.get("playlist_id", [""])[0])
                enabled = b.get("enabled")
                preset = str(b.get("preset") or qs.get("preset", ["auto"])[0])
                result = await self.toggle_playlist_mix(pid, enabled, preset)
                await self._send_json(writer, 200, result)
            elif path == "/api/mix-play" and method == "POST":
                b = body_json or {}
                result = await self.start_mix_play(
                    context_uri=b.get("context_uri"),
                    uris=b.get("uris"),
                    mix_mode=b.get("mix_mode", "auto"),
                    crossfade_seconds=int(b.get("crossfade_seconds", self._settings.get("crossfade_seconds", 6))),
                    shuffle=bool(b.get("shuffle", False)),
                )
                await self._send_json(writer, 200, result)
            elif path == "/api/search" and method == "GET":
                q = qs.get("q", [""])[0]
                if not q:
                    await self._send_json(writer, 400, {"error": "Missing q param"})
                else:
                    offset = int(qs.get("offset", [0])[0])
                    result = await self.search_spotify(q, offset=offset)
                    await self._send_json(writer, 200, result)
            elif path == "/api/play" and method == "POST":
                b = body_json or {}
                context_uri = b.get("context_uri") or qs.get("context_uri", [None])[0]
                offset_uri = b.get("offset_uri") or qs.get("offset_uri", [None])[0]
                uris = b.get("uris")
                position = b.get("position", 0)
                result = await self.play_tracks(context_uri, offset_uri, uris, position)
                await self._send_json(writer, 200, result)
            # Static files
            elif path == "/" or path == "/index.html":
                await self._serve_static(writer, "index.html")
            elif path.startswith("/assets/"):
                await self._serve_static(writer, path.lstrip("/"))
            else:
                # SPA fallback: serve index.html for non-API, non-asset paths
                await self._serve_static(writer, "index.html")
        except asyncio.TimeoutError:
            try:
                writer.close()
            except Exception:
                pass
        except Exception as e:
            decky.logger.error("Dashboard request error: %s", e)
            try:
                await self._send_json(writer, 500, {"error": str(e)})
            except Exception:
                pass

    async def _serve_image(self, writer: asyncio.StreamWriter, url: str):
        try:
            content_type, body = await _exec(_fetch_spotify_image, url)
        except ValueError as error:
            await self._send_json(writer, 400, {"error": str(error)})
            return
        except Exception as error:
            decky.logger.warning("Cover image download failed: %s", error)
            await self._send_json(writer, 502, {"error": "Cover image is unavailable"})
            return
        header = (
            "HTTP/1.1 200 OK\r\n"
            f"Content-Type: {content_type}\r\nContent-Length: {len(body)}\r\n"
            "Cache-Control: public, max-age=86400\r\n"
            "Connection: close\r\n\r\n"
        )
        writer.write(header.encode() + body)
        await writer.drain()
        writer.close()

    async def _api_status(self, writer: asyncio.StreamWriter):
        running = self._process is not None and self._process.poll() is None
        is_playing = self._poll_play_state == "playing"

        # Estimate position from last event
        position_ms = 0
        duration_ms = 0
        if self._last_event:
            position_ms = self._last_event.get("position_ms", 0)
            duration_ms = self._last_event.get("duration_ms", 0)

        data = {
            "authenticated": self._access_token is not None,
            "librespot_running": running,
            "play_state": self._poll_play_state,
            "track": self._track_meta,
            "position_ms": position_ms,
            "is_playing": is_playing,
            "volume": self._poll_volume,
            "shuffle_state": self._shuffle_state,
            "repeat_state": self._repeat_state,
            "is_liked": self._is_liked,
            "context_uri": self._context_uri,
            "active_device": self._active_device,
            "mix_settings": {
                "mix_mode": self._settings.get("mix_mode", "off"),
                "active_mix_mode": self._get_active_mix_mode(),
                "crossfade_seconds": self._settings.get("crossfade_seconds", 6),
                "normalisation": self._settings.get("normalisation", True),
                "gapless": self._settings.get("gapless", True),
                "autoplay": self._settings.get("autoplay", True),
                "mixed_playlists": self._settings.get("mixed_playlists", {}),
            },
        }
        await self._send_json(writer, 200, data)

    async def _send_json(self, writer: asyncio.StreamWriter, status: int, data: dict):
        reason = {200: "OK", 204: "No Content", 400: "Bad Request", 404: "Not Found", 500: "Internal Server Error", 502: "Bad Gateway"}.get(status, "OK")
        body = json.dumps(data).encode()
        header = f"HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\nContent-Length: {len(body)}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n"
        writer.write(header.encode() + body)
        await writer.drain()
        writer.close()

    async def _serve_static(self, writer: asyncio.StreamWriter, rel_path: str):
        file_path = os.path.join(DASHBOARD_DIR, rel_path)
        # Path traversal check
        if not os.path.abspath(file_path).startswith(os.path.abspath(DASHBOARD_DIR)):
            await self._send_json(writer, 403, {"error": "Forbidden"})
            return
        if not os.path.isfile(file_path):
            await self._send_json(writer, 404, {"error": "Not found"})
            return

        mime_map = {
            ".html": "text/html; charset=utf-8",
            ".js": "application/javascript",
            ".css": "text/css",
            ".svg": "image/svg+xml",
            ".png": "image/png",
            ".ico": "image/x-icon",
            ".json": "application/json",
        }
        ext = os.path.splitext(file_path)[1]
        content_type = mime_map.get(ext, "application/octet-stream")

        loop = asyncio.get_event_loop()
        body = await loop.run_in_executor(None, self._read_file, file_path)
        cache = "Cache-Control: public, max-age=31536000, immutable\r\n" if rel_path.startswith("assets/") else ""
        header = f"HTTP/1.1 200 OK\r\nContent-Type: {content_type}\r\nContent-Length: {len(body)}\r\n{cache}Connection: close\r\n\r\n"
        writer.write(header.encode() + body)
        await writer.drain()
        writer.close()

    @staticmethod
    def _read_file(path: str) -> bytes:
        with open(path, "rb") as f:
            return f.read()

    # ── Internal helpers ───────────────────────────────────────

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
        except ProcessLookupError:
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
            meta = {
                "track_id": track_id,
                "name": item.get("name", "Unknown"),
                "artist": artist,
                "album": album_name,
                "artwork_url": artwork_url,
                "duration_ms": duration_ms,
                "uri": item.get("uri", ""),
                "is_liked": is_liked,
            }
            self._track_meta = meta
            await decky.emit("track_metadata", meta)

        # Trigger Mix / Crossfade transition when approaching end of track
        mix_mode = self._get_active_mix_mode()
        crossfade_sec = int(self._settings.get("crossfade_seconds", 0) or 0)
        if (
            is_playing
            and mix_mode in ("auto", "fade", "rise", "blend", "slam")
            and crossfade_sec > 0
            and duration_ms > (crossfade_sec * 2000 + 5000)
            and track_id
            and self._mix_transitioning_track_id != track_id
        ):
            crossfade_ms = crossfade_sec * 1000
            remaining_ms = duration_ms - progress_ms
            if 0 < remaining_ms <= (crossfade_ms + 3200):
                self._mix_transitioning_track_id = track_id
                if self._mix_task and not self._mix_task.done():
                    self._mix_task.cancel()
                self._mix_task = asyncio.get_event_loop().create_task(
                    self._run_mix_transition(track_id, remaining_ms, crossfade_ms, mix_mode)
                )

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

    async def _run_mix_transition(self, track_id: str, remaining_ms: int, crossfade_ms: int, mix_mode: str):
        """Perform Spotify Mix transition (auto, fade, rise, blend, slam) across track handoff."""
        try:
            # Preset-specific timing & envelope parameters
            # auto: trims dead air (~5s before end, cues ~2.5s into next track)
            # fade: full smooth volume fade out/in from 0:00
            # rise: holds energy longer, cues ~3.5s into next track, rapid swell
            # blend: extended balanced envelope, cues ~1.5s into next track
            # slam: tight DJ cut 3s before end -> cues ~2.5s into next track with minimal dip
            preset_cfg = {
                "auto":  {"window_scale": 0.85, "min_vol": 45,  "out_steps": 5, "in_steps": 4, "cue_ms": 2500},
                "fade":  {"window_scale": 1.00, "min_vol": 30,  "out_steps": 6, "in_steps": 6, "cue_ms": 0},
                "rise":  {"window_scale": 0.70, "min_vol": 60,  "out_steps": 4, "in_steps": 3, "cue_ms": 3500},
                "blend": {"window_scale": 1.15, "min_vol": 50,  "out_steps": 6, "in_steps": 6, "cue_ms": 1500},
                "slam":  {"window_scale": 0.45, "min_vol": 110, "out_steps": 2, "in_steps": 2, "cue_ms": 2500},
            }.get(mix_mode, {"window_scale": 0.85, "min_vol": 45, "out_steps": 5, "in_steps": 4, "cue_ms": 2000})

            effective_window_ms = int(max(1500, crossfade_ms * preset_cfg["window_scale"]))
            wait_ms = max(0, remaining_ms - effective_window_ms)
            if wait_ms > 0:
                await asyncio.sleep(wait_ms / 1000.0)
            if self._poll_track_id != track_id or self._poll_play_state != "playing":
                return

            decky.logger.info(
                "Mix transition (preset=%s, window=%.1fs) starting for track %s",
                mix_mode, effective_window_ms / 1000.0, track_id,
            )
            half_sec = max(0.3, (effective_window_ms / 1000.0) / 2.0)
            out_steps = preset_cfg["out_steps"]
            min_vol = preset_cfg["min_vol"]
            step_delay = half_sec / out_steps

            # 1. Fade out outgoing track on local PulseAudio sink
            for i in range(1, out_steps + 1):
                if self._poll_track_id != track_id:
                    break
                vol = int(150 - ((150 - min_vol) * (i / out_steps)))
                await self._set_pa_volume_percent(vol)
                await asyncio.sleep(step_delay)

            # 2. Advance to incoming track if still on outgoing track
            if self._poll_track_id == track_id and self._poll_play_state == "playing":
                await self.control_playback("next")
                await asyncio.sleep(0.35)

            # 3. Cue incoming track past intro dead-air when preset specifies cue_ms
            cue_ms = preset_cfg["cue_ms"]
            if cue_ms > 0:
                try:
                    await self.seek_playback(cue_ms)
                except Exception:
                    pass

            # 4. Ramp volume up on incoming track
            in_steps = preset_cfg["in_steps"]
            in_delay = (half_sec * 0.65 if mix_mode in ("rise", "slam") else half_sec) / in_steps
            for i in range(1, in_steps + 1):
                vol = int(min_vol + ((150 - min_vol) * (i / in_steps)))
                await self._set_pa_volume_percent(vol)
                await asyncio.sleep(in_delay)
        except asyncio.CancelledError:
            pass
        except Exception as e:
            decky.logger.warning("Mix transition error: %s", e)
        finally:
            await self._set_pa_volume_percent(150)

    async def _monitor_process(self):
        """Monitor librespot process health and detect system sleep/wake."""
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

                if elapsed > SUSPEND_THRESHOLD and self._process and self._process.poll() is None:
                    decky.logger.info(
                        "System wake detected (gap=%.0fs), restarting librespot", elapsed,
                    )
                    await self._kill_librespot()
                    await self.start_librespot()
                    self._crash_timestamps.clear()
                    self._stable_start = time.time()
                    last_tick = time.time()
                    continue

                if self._process and self._process.poll() is not None:
                    rc = self._process.returncode
                    self._process = None
                    msg = f"librespot exited unexpectedly (code {rc})"
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
                        result = await self.start_librespot()
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

                if not self._pa_volume_boosted:
                    await self._boost_pa_volume()

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
