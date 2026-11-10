import asyncio
import json
import os
import ssl

try:
    import decky
except ImportError:
    from types import SimpleNamespace
    decky = SimpleNamespace(
        DECKY_PLUGIN_SETTINGS_DIR="/tmp",
        DECKY_PLUGIN_DIR="/tmp",
        DECKY_PLUGIN_RUNTIME_DIR="/tmp",
        logger=SimpleNamespace(
            info=lambda *a, **k: None,
            warning=lambda *a, **k: None,
            error=lambda *a, **k: None,
            debug=lambda *a, **k: None,
        ),
        emit=lambda *a, **k: None,
    )

# Decky Loader (PyInstaller) injects LD_LIBRARY_PATH pointing to its bundled
# libs which are older than the system's.  Subprocesses like openssl and
# librespot then load the wrong libssl/libcrypto and crash.  Strip it early.
os.environ.pop("LD_LIBRARY_PATH", None)

SETTINGS_FILE = os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, "settings.json")
LIBRESPOT_BIN = os.path.join(decky.DECKY_PLUGIN_DIR, "bin", "librespot")
CACHE_DIR = os.path.join(decky.DECKY_PLUGIN_RUNTIME_DIR, "cache")
LIBRESPOT_PID_FILE = os.path.join(decky.DECKY_PLUGIN_RUNTIME_DIR, "librespot.pid")
SPOTIFY_CLIENT_PID_FILE = os.path.join(decky.DECKY_PLUGIN_RUNTIME_DIR, "spotify_client.pid")
SSL_CERT = os.path.join(decky.DECKY_PLUGIN_RUNTIME_DIR, "cert.pem")
SSL_KEY = os.path.join(decky.DECKY_PLUGIN_RUNTIME_DIR, "key.pem")

VALID_AUDIO_BACKENDS = ("librespot", "spotify_client")
VALID_LIBRESPOT_QUALITIES = ("96", "160", "320")
VALID_SPOTIFY_CLIENT_QUALITIES = ("96", "160", "320", "lossless")

SPOTIFY_FLATPAK_ID = "com.spotify.Client"
SPOTIFY_CDP_PORT = 9229
STEAM_CEF_PORT = 8080
DECK_USER = "deck"
DECK_UID = 1000
DECK_HOME = "/home/deck"
SPOTIFY_CLIENT_CONFIG_DIR = os.path.join(DECK_HOME, ".var", "app", SPOTIFY_FLATPAK_ID, "config", "spotify")
SPOTIFY_CLIENT_CACHE_DIR = os.path.join(DECK_HOME, ".var", "app", SPOTIFY_FLATPAK_ID, "cache", "spotify")

DEFAULT_SETTINGS = {
    "device_name": "",
    "audio_backend": "librespot",
    "audio_quality": "320",
    "bitrate": 320,
    "bit_perfect_clock": True,
    "spotify_client_id": "",
    "normalisation": True,
    "normalisation_pregain": 0.0,
    "gapless": True,
    "autoplay": True,
    "playlist_folders": [],
    "spotify_folder_tree": [],
    "game_audio_profiles": {},
    "auto_ducking": True,
    "auto_ducking_volume": 30,
    "gamepad_chords_enabled": True,
    "toast_enabled": True,
    "toast_position": "top_right",
    "overlay_enabled": False,
    "overlay_position": "top-right",
}

# PulseAudio socket for root processes (deck user UID 1000)
PULSE_SERVER = "unix:/run/user/1000/pulse/native"
DBUS_SESSION_BUS_ADDRESS = "unix:path=/run/user/1000/bus"
XDG_RUNTIME_DIR = "/run/user/1000"

SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize"
SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token"
SPOTIFY_API_BASE = "https://api.spotify.com/v1"
SPOTIFY_SCOPES = (
    "user-read-currently-playing user-read-playback-state user-modify-playback-state "
    "playlist-read-private playlist-read-collaborative playlist-modify-public "
    "playlist-modify-private user-library-read user-library-modify "
    "user-follow-read user-read-recently-played"
)
CURRENT_SCOPES_VERSION = 6
OAUTH_SERVER_PORT = 39281
DASHBOARD_PORT = 39282
DASHBOARD_DIR = os.path.join(decky.DECKY_PLUGIN_DIR, "dashboard", "dist")
MAX_IMAGE_BYTES = 5 * 1024 * 1024

_API_SSL_CTX: ssl.SSLContext | None = None
for _ca in ("/etc/ssl/certs/ca-certificates.crt", "/etc/ssl/cert.pem"):
    if os.path.isfile(_ca):
        _API_SSL_CTX = ssl.create_default_context(cafile=_ca)  # pragma: no cover
        break  # pragma: no cover
if _API_SSL_CTX is None:
    _API_SSL_CTX = ssl.create_default_context()


def _load_settings(settings_file: str | None = None) -> dict:
    target_file = settings_file or SETTINGS_FILE
    default_settings = DEFAULT_SETTINGS
    try:
        with open(target_file, "r") as f:
            saved = json.load(f)
        for obsolete in ("mix_mode", "crossfade_seconds", "mixed_playlists"):
            saved.pop(obsolete, None)
        merged = {**default_settings, **saved}
        if merged["device_name"] == "Steam Deck" and not saved.get("device_name_customized"):
            merged["device_name"] = ""
        if merged.get("audio_backend") not in VALID_AUDIO_BACKENDS:
            merged["audio_backend"] = "librespot"
        raw_q = str(merged.get("audio_quality") or merged.get("bitrate", 320)).lower()
        if merged["audio_backend"] == "librespot":
            if raw_q not in VALID_LIBRESPOT_QUALITIES:
                raw_q = "320"
            merged["audio_quality"] = raw_q
            merged["bitrate"] = int(raw_q)
        else:
            if raw_q not in VALID_SPOTIFY_CLIENT_QUALITIES:
                raw_q = "320"
            merged["audio_quality"] = raw_q
            merged["bitrate"] = 320 if raw_q == "lossless" else int(raw_q)
        if not isinstance(merged.get("playlist_folders"), list):
            merged["playlist_folders"] = []
        if not isinstance(merged.get("spotify_folder_tree"), list):
            merged["spotify_folder_tree"] = []
        if not isinstance(merged.get("game_audio_profiles"), dict):
            merged["game_audio_profiles"] = {}
        if not isinstance(merged.get("overlay_enabled"), bool):
            merged["overlay_enabled"] = bool(merged.get("overlay_enabled", False))
        if merged.get("overlay_position") not in ("top-left", "top-right", "bottom-left", "bottom-right"):
            merged["overlay_position"] = "top-right"
        return merged
    except Exception:
        return dict(default_settings)


def _save_settings(settings: dict, settings_file: str | None = None) -> None:
    target_file = settings_file or SETTINGS_FILE
    os.makedirs(os.path.dirname(target_file), exist_ok=True)
    with open(target_file, "w") as f:
        json.dump(settings, f, indent=2)


async def _exec(fn, *args, timeout=10):
    """Run blocking I/O in executor with asyncio-level timeout (covers DNS)."""
    try:
        return await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(None, fn, *args),
            timeout=timeout,
        )
    except asyncio.TimeoutError:
        raise TimeoutError(f"Request timed out after {timeout}s")


def _build_deck_command(cmd: list[str], extra_env: dict | None = None) -> tuple[list[str], dict]:
    """Ensure user-level graphical/audio processes run as user `deck` (UID 1000) even when Decky runs as root."""
    env = os.environ.copy()
    env["XDG_RUNTIME_DIR"] = XDG_RUNTIME_DIR
    env["DBUS_SESSION_BUS_ADDRESS"] = DBUS_SESSION_BUS_ADDRESS
    env["PULSE_SERVER"] = PULSE_SERVER
    env["HOME"] = DECK_HOME
    if extra_env:
        env.update(extra_env)
    if hasattr(os, "geteuid") and os.geteuid() == 0:
        env_args = [
            f"XDG_RUNTIME_DIR={XDG_RUNTIME_DIR}",
            f"DBUS_SESSION_BUS_ADDRESS={DBUS_SESSION_BUS_ADDRESS}",
            f"PULSE_SERVER={PULSE_SERVER}",
            f"HOME={DECK_HOME}",
        ]
        if extra_env:
            for k, v in extra_env.items():
                env_args.append(f"{k}={v}")
        return ["runuser", "-u", DECK_USER, "--", "env", *env_args, *cmd], env
    return cmd, env
