import asyncio
import json
import os
import ssl

try:
    import pwd
except ImportError:
    pwd = None

async def _async_noop(*a, **k):
    pass

try:
    import decky
except ImportError:
    import tempfile
    from types import SimpleNamespace
    _default_settings_dir = "/home/deck/homebrew/settings/Deckify" if os.path.isdir("/home/deck/homebrew/settings/Deckify") else tempfile.gettempdir()
    _default_plugin_dir = "/home/deck/homebrew/plugins/Deckify" if os.path.isdir("/home/deck/homebrew/plugins/Deckify") else tempfile.gettempdir()
    _default_runtime_dir = "/home/deck/homebrew/data/Deckify" if os.path.isdir("/home/deck/homebrew/data/Deckify") else tempfile.gettempdir()
    decky = SimpleNamespace(
        DECKY_PLUGIN_SETTINGS_DIR=_default_settings_dir,
        DECKY_PLUGIN_DIR=_default_plugin_dir,
        DECKY_PLUGIN_RUNTIME_DIR=_default_runtime_dir,
        logger=SimpleNamespace(
            info=lambda *a, **k: None,
            warning=lambda *a, **k: None,
            error=lambda *a, **k: None,
            debug=lambda *a, **k: None,
        ),
        emit=_async_noop,
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

# Dynamic Linux user and UID resolution
DECK_USER = getattr(decky, "DECKY_USER", None) or os.environ.get("USER", "deck")
DECK_UID = 1000
DECK_HOME = getattr(decky, "DECKY_USER_HOME", f"/home/{DECK_USER}")
if pwd:
    try:
        _pw = pwd.getpwnam(DECK_USER)
        DECK_UID = _pw.pw_uid
        DECK_HOME = _pw.pw_dir
    except Exception:
        pass

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
    "eq_preset": "flat",
}

# PulseAudio socket for processes
PULSE_SERVER = f"unix:/run/user/{DECK_UID}/pulse/native"
DBUS_SESSION_BUS_ADDRESS = f"unix:path=/run/user/{DECK_UID}/bus"
XDG_RUNTIME_DIR = f"/run/user/{DECK_UID}"

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
        if merged.get("eq_preset") not in ("flat", "bass", "vocal", "gaming"):
            merged["eq_preset"] = "flat"
        return merged
    except Exception:
        return dict(default_settings)


_MAIN_MODULE = None


def _get_main_attr(name):
    if _MAIN_MODULE and hasattr(_MAIN_MODULE, name):
        return getattr(_MAIN_MODULE, name)
    import sys
    main_mod = sys.modules.get("main")
    if main_mod and hasattr(main_mod, name):
        return getattr(main_mod, name)
    return None


def _save_settings_impl(settings: dict, settings_file: str | None = None) -> None:
    target_file = settings_file or SETTINGS_FILE
    os.makedirs(os.path.dirname(target_file), exist_ok=True)
    with open(target_file, "w") as f:
        json.dump(settings, f, indent=2)


def _save_settings(settings: dict, settings_file: str | None = None) -> None:
    target_save = _get_main_attr("_save_settings")
    default_save = _get_main_attr("_default_save_settings")
    if target_save and target_save is not default_save and target_save is not _save_settings:
        return target_save(settings, settings_file)
    return _save_settings_impl(settings, settings_file)


async def _exec_impl(fn, *args, **kwargs):
    timeout = kwargs.get("timeout", 10)
    try:
        loop = asyncio.get_running_loop()
        return await asyncio.wait_for(
            loop.run_in_executor(None, fn, *args),
            timeout=timeout,
        )
    except asyncio.TimeoutError:
        raise TimeoutError(f"Request timed out after {timeout}s")


async def _exec(fn, *args, **kwargs):
    """Run blocking I/O in executor with asyncio-level timeout (covers DNS)."""
    target_exec = _get_main_attr("_exec")
    default_exec = _get_main_attr("_default_exec")
    if target_exec and target_exec is not default_exec and target_exec is not _exec:
        res = target_exec(fn, *args, **kwargs) if kwargs else target_exec(fn, *args)
        if asyncio.iscoroutine(res):
            return await res
        return res
    return await _exec_impl(fn, *args, **kwargs)


def _build_deck_command(cmd: list[str], extra_env: dict | None = None) -> tuple[list[str], dict]:
    """Ensure user-level graphical/audio processes run as user `DECK_USER` (dynamic UID) even when Decky runs as root."""
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
