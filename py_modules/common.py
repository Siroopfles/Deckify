import asyncio
import copy
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
EQ_PID_FILE = os.path.join(decky.DECKY_PLUGIN_RUNTIME_DIR, "eq.pid")
ONEVENT_SOCK_FILE = os.path.join(decky.DECKY_PLUGIN_RUNTIME_DIR, "onevent.sock")
ONEVENT_EMITTER_SCRIPT = os.path.join(decky.DECKY_PLUGIN_RUNTIME_DIR, "librespot-event.sh")
SESSION_BOOKMARK_FILE = os.path.join(decky.DECKY_PLUGIN_RUNTIME_DIR, "session_bookmark.json")
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

CHORD_ACTION_IDS = (
    "previous",
    "next",
    "play_pause",
    "volume_up",
    "volume_down",
    "toggle_like",
    "cycle_pinned",
    "toggle_lyrics",
)
GUIDE_BUTTON_IDS = frozenset({13, 14, 27, 28})
RESERVED_VALVE_TARGET_BUTTONS = frozenset({3, 5, 6})
MAX_CHORD_BUTTONS = 4
MIN_BUTTON_ID = 0
MAX_BUTTON_ID = 28

DEFAULT_CHORD_BINDINGS = {
    "previous": [],
    "next": [],
    "play_pause": [],
    "volume_up": [],
    "volume_down": [],
    "toggle_like": [],
    "cycle_pinned": [],
    "toggle_lyrics": [],
}

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
    "crossfade_seconds": 0,
    "autoplay": True,
    "playlist_folders": [],
    "spotify_folder_tree": [],
    "game_audio_profiles": {},
    "active_game_override_snapshot": None,
    "soundtrack_launch_debounce": 3.5,
    "soundtrack_exit_debounce": 3.0,
    "soundtrack_unbound_policy": "keep_playing",
    "soundtrack_default_playlist": "",
    "soundtrack_default_mode": "remember_position",
    "auto_ducking": True,
    "auto_ducking_volume": 30,
    "duck_fade_down_duration": 1.0,
    "duck_fade_up_duration": 1.5,
    "ducking_mode": "proportional",
    "ducking_proportional_pct": 50,
    "voice_ducking_enabled": True,
    "voice_ducking_volume": 25,
    "voice_ducking_hold_delay": 1.2,
    "gamepad_chords_enabled": True,
    "silent_banner_enabled": True,
    "silent_banner_position": "top-right",
    "gamepad_chord_bindings": {k: list(v) for k, v in DEFAULT_CHORD_BINDINGS.items()},
    "toast_enabled": True,
    "toast_sound_enabled": False,
    "toast_position": "top_right",
    "overlay_enabled": False,
    "overlay_position": "top-right",
    "overlay_autohide": False,
    "overlay_show_progress": False,
    "overlay_lyrics_enabled": False,
    "overlay_lyrics_offset_ms": 0,
    "overlay_autohide_duration_s": 6,
    "eq_preset": "flat",
    "eq_custom_bands": [0.0] * 10,
    "trigger_nav_enabled": True,
    "trigger_seek_seconds": 10,
    "trigger_page_size": 15,
    "show_controller_hints": True,
    "pinned_playlists": [],
    "sleep_timer_fade_enabled": True,
    "sleep_timer_fade_duration": 30,
    "dock_auto_switch_enabled": False,
    "dock_target_sink": "auto",
    "dock_respect_bluetooth": True,
    "dock_pause_on_undock": False,
    "dock_toast_enabled": True,
    "resilience_auto_resume": True,
    "resilience_bookmark_expiry_hours": 12,
    "resilience_bookmark_never_expires": False,
    "resilience_toast_enabled": True,
    "resilience_prompt_held_enabled": True,
    "mpris_enabled": True,
    "mpris_auto_proxy": True,
    "accent_theme": "spotify_green",
    "eco_mode_enabled": True,
    "eco_timeout_minutes": 15,
    "eco_sleep_spotify_client": False,
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
    "user-follow-read user-read-recently-played user-top-read"
)
CURRENT_SCOPES_VERSION = 7
OAUTH_SERVER_PORT = 39281
MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_PINNED_PLAYLISTS = 4
VALID_PINNED_TYPES = ("playlist", "album", "liked_songs")

_API_SSL_CTX: ssl.SSLContext | None = None
for _ca in ("/etc/ssl/certs/ca-certificates.crt", "/etc/ssl/cert.pem"):
    if os.path.isfile(_ca):
        _API_SSL_CTX = ssl.create_default_context(cafile=_ca)  # pragma: no cover
        break  # pragma: no cover
if _API_SSL_CTX is None:
    _API_SSL_CTX = ssl.create_default_context()


def _sanitize_pinned_playlists(raw) -> list[dict]:
    """Validate, deduplicate, and cap pinned playlist items to MAX_PINNED_PLAYLISTS."""
    if not isinstance(raw, list):
        return []
    result: list[dict] = []
    seen_uris: set[str] = set()
    for item in raw:
        if not isinstance(item, dict):
            continue
        uri = item.get("uri")
        name = item.get("name")
        if not isinstance(uri, str) or not uri.strip():
            continue
        if not isinstance(name, str) or not name.strip():
            continue
        uri = uri.strip()
        if uri in seen_uris:
            continue
        seen_uris.add(uri)
        item_type = item.get("type")
        if item_type not in VALID_PINNED_TYPES:
            item_type = "playlist"
        raw_img = item.get("image_url")
        image_url = raw_img.strip() if isinstance(raw_img, str) and raw_img.strip() else None
        result.append({
            "uri": uri,
            "name": name.strip(),
            "type": item_type,
            "image_url": image_url,
        })
        if len(result) >= MAX_PINNED_PLAYLISTS:
            break
    return result


def _normalize_chord_buttons(raw_btns) -> tuple[list[int] | None, str | None]:
    """Validate, normalize (28 -> 27), deduplicate, and sort a chord button list."""
    if not isinstance(raw_btns, list):
        return None, "Chord binding must be a list of button IDs"
    seen: set[int] = set()
    normalized: list[int] = []
    for btn in raw_btns:
        if isinstance(btn, bool) or not isinstance(btn, int) or not (MIN_BUTTON_ID <= btn <= MAX_BUTTON_ID):
            return None, "Invalid button ID in chord binding"
        canon = 27 if btn == 28 else btn
        if canon not in seen:
            seen.add(canon)
            normalized.append(canon)
    normalized.sort()
    if len(normalized) > MAX_CHORD_BUTTONS:
        return None, "Chords support up to 4 buttons."
    if any(b in GUIDE_BUTTON_IDS for b in normalized):
        return (
            None,
            "STEAM / QAM button combos are intercepted by SteamOS and don't work in-game. Use other buttons like L4, R4, L5, or R5.",
        )
    if (
        len(normalized) == 2
        and any(b in GUIDE_BUTTON_IDS for b in normalized)
        and any(b in RESERVED_VALVE_TARGET_BUTTONS for b in normalized)
    ):
        return None, "That combination is reserved by Steam. Choose a different one."
    return normalized, None


def _sanitize_chord_bindings(raw) -> dict[str, list[int]]:
    """Recover valid chord bindings from persisted disk JSON without shared references."""
    if not isinstance(raw, dict):
        return {k: list(v) for k, v in DEFAULT_CHORD_BINDINGS.items()}
    used_chords: set[tuple[int, ...]] = set()
    result: dict[str, list[int]] = {}
    for action in CHORD_ACTION_IDS:
        if action not in raw:
            candidate = list(DEFAULT_CHORD_BINDINGS[action])
        else:
            norm, err = _normalize_chord_buttons(raw[action])
            if err is not None or norm is None:
                candidate = list(DEFAULT_CHORD_BINDINGS[action])
            else:
                candidate = norm
        chord_key = tuple(candidate)
        if chord_key:
            if chord_key in used_chords:
                candidate = []
            else:
                used_chords.add(chord_key)
        result[action] = list(candidate)
    return result


def _validate_chord_bindings(
    raw, base_bindings: dict | None = None
) -> tuple[dict[str, list[int]] | None, str | None]:
    """Strictly validate a gamepad_chord_bindings payload for set_setting."""
    if not isinstance(raw, dict):
        return None, "gamepad_chord_bindings must be a dict"
    for action_key in raw.keys():
        if action_key not in CHORD_ACTION_IDS:
            return None, f"Unknown chord action: {action_key}"
    if base_bindings is not None:
        merged = _sanitize_chord_bindings(base_bindings)
    else:
        merged = {k: list(v) for k, v in DEFAULT_CHORD_BINDINGS.items()}
    for action_key, raw_btns in raw.items():
        norm, err = _normalize_chord_buttons(raw_btns)
        if err is not None or norm is None:
            return None, err
        merged[action_key] = norm
    seen_chords: set[tuple[int, ...]] = set()
    result: dict[str, list[int]] = {}
    for action in CHORD_ACTION_IDS:
        btns = list(merged.get(action, []))
        chord_key = tuple(btns)
        if chord_key:
            if chord_key in seen_chords:
                return None, "Duplicate chord binding across actions"
            seen_chords.add(chord_key)
        result[action] = btns
    return result, None


def _load_settings(settings_file: str | None = None) -> dict:
    target_file = settings_file or SETTINGS_FILE
    default_settings = DEFAULT_SETTINGS
    try:
        with open(target_file, "r") as f:
            saved = json.load(f)
        if not isinstance(saved, dict):
            return copy.deepcopy(default_settings)
        for obsolete in ("mix_mode", "mixed_playlists"):
            saved.pop(obsolete, None)
        merged = {**copy.deepcopy(default_settings), **saved}
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
        raw_game_snap = merged.get("active_game_override_snapshot")
        if raw_game_snap is not None:
            if not isinstance(raw_game_snap, dict):
                merged["active_game_override_snapshot"] = None
            else:
                snap_app_id = raw_game_snap.get("app_id")
                if (
                    isinstance(snap_app_id, bool)
                    or not isinstance(snap_app_id, int)
                    or not (1 <= snap_app_id <= 0xFFFFFFFF)
                ):
                    merged["active_game_override_snapshot"] = None
        for _k, _default in (("soundtrack_launch_debounce", 3.5), ("soundtrack_exit_debounce", 3.0)):
            try:
                merged[_k] = max(0.5, min(10.0, float(merged.get(_k, _default))))
            except (TypeError, ValueError):
                merged[_k] = _default
        if merged.get("soundtrack_unbound_policy") not in ("keep_playing", "pause"):
            merged["soundtrack_unbound_policy"] = "keep_playing"
        if not isinstance(merged.get("soundtrack_default_playlist"), str):
            merged["soundtrack_default_playlist"] = ""
        if merged.get("soundtrack_default_mode") not in ("remember_position", "fresh_start"):
            merged["soundtrack_default_mode"] = "remember_position"
        if not isinstance(merged.get("overlay_enabled"), bool):
            merged["overlay_enabled"] = bool(merged.get("overlay_enabled", False))
        if merged.get("overlay_position") not in ("top-left", "top-right", "bottom-left", "bottom-right"):
            merged["overlay_position"] = "top-right"
        if not isinstance(merged.get("overlay_autohide"), bool):
            merged["overlay_autohide"] = bool(merged.get("overlay_autohide", False))
        if not isinstance(merged.get("overlay_show_progress"), bool):
            merged["overlay_show_progress"] = bool(merged.get("overlay_show_progress", False))
        if not isinstance(merged.get("overlay_lyrics_enabled"), bool):
            merged["overlay_lyrics_enabled"] = bool(merged.get("overlay_lyrics_enabled", False))
        try:
            merged["overlay_lyrics_offset_ms"] = max(-2000, min(2000, int(merged.get("overlay_lyrics_offset_ms", 0))))
        except (TypeError, ValueError):
            merged["overlay_lyrics_offset_ms"] = 0
        try:
            merged["overlay_autohide_duration_s"] = max(3, min(15, int(merged.get("overlay_autohide_duration_s", 6))))
        except (TypeError, ValueError):
            merged["overlay_autohide_duration_s"] = 6
        if merged.get("eq_preset") not in ("flat", "bass", "vocal", "gaming", "deck_speakers", "late_night", "custom"):
            merged["eq_preset"] = "flat"
        raw_bands = merged.get("eq_custom_bands")
        if isinstance(raw_bands, list):
            clamped_bands: list[float] = []
            for idx in range(10):
                if idx < len(raw_bands):
                    try:
                        b_val = float(raw_bands[idx])
                        if b_val != b_val:
                            b_val = 0.0
                    except (TypeError, ValueError):
                        b_val = 0.0
                else:
                    b_val = 0.0
                clamped_bands.append(round(max(-12.0, min(12.0, b_val)), 2))
            merged["eq_custom_bands"] = clamped_bands
        else:
            merged["eq_custom_bands"] = [0.0] * 10
        if not isinstance(merged.get("auto_ducking"), bool):
            merged["auto_ducking"] = bool(merged.get("auto_ducking", True))
        try:
            merged["duck_fade_down_duration"] = max(0.5, min(3.0, float(merged.get("duck_fade_down_duration", 1.0))))
        except (TypeError, ValueError):
            merged["duck_fade_down_duration"] = 1.0
        try:
            merged["duck_fade_up_duration"] = max(0.5, min(3.0, float(merged.get("duck_fade_up_duration", 1.5))))
        except (TypeError, ValueError):
            merged["duck_fade_up_duration"] = 1.5
        if merged.get("ducking_mode") not in ("proportional", "fixed"):
            merged["ducking_mode"] = "proportional"
        try:
            merged["ducking_proportional_pct"] = max(10, min(90, int(merged.get("ducking_proportional_pct", 50))))
        except (TypeError, ValueError):
            merged["ducking_proportional_pct"] = 50
        if not isinstance(merged.get("voice_ducking_enabled"), bool):
            merged["voice_ducking_enabled"] = bool(merged.get("voice_ducking_enabled", True))
        try:
            merged["voice_ducking_volume"] = max(10, min(50, int(merged.get("voice_ducking_volume", 25))))
        except (TypeError, ValueError):
            merged["voice_ducking_volume"] = 25
        try:
            merged["voice_ducking_hold_delay"] = max(0.5, min(3.0, float(merged.get("voice_ducking_hold_delay", 1.2))))
        except (TypeError, ValueError):
            merged["voice_ducking_hold_delay"] = 1.2
        if not isinstance(merged.get("sleep_timer_fade_enabled"), bool):
            merged["sleep_timer_fade_enabled"] = bool(merged.get("sleep_timer_fade_enabled", True))
        try:
            merged["sleep_timer_fade_duration"] = max(5, min(120, int(merged.get("sleep_timer_fade_duration", 30))))
        except (TypeError, ValueError):
            merged["sleep_timer_fade_duration"] = 30
        for _rbool, _rdef in (
            ("resilience_auto_resume", True),
            ("resilience_bookmark_never_expires", False),
            ("resilience_toast_enabled", True),
            ("resilience_prompt_held_enabled", True),
            ("mpris_enabled", True),
            ("mpris_auto_proxy", True),
        ):
            if not isinstance(merged.get(_rbool), bool):
                merged[_rbool] = bool(merged.get(_rbool, _rdef))
        raw_expiry = merged.get("resilience_bookmark_expiry_hours", 12)
        if isinstance(raw_expiry, bool):
            merged["resilience_bookmark_expiry_hours"] = 12
        else:
            try:
                merged["resilience_bookmark_expiry_hours"] = max(1, min(24, int(raw_expiry)))
            except (TypeError, ValueError):
                merged["resilience_bookmark_expiry_hours"] = 12
        raw_silent_banner = merged.get("silent_banner_enabled", True)
        if isinstance(raw_silent_banner, bool):
            merged["silent_banner_enabled"] = raw_silent_banner
        elif isinstance(raw_silent_banner, int):
            merged["silent_banner_enabled"] = bool(raw_silent_banner)
        else:
            merged["silent_banner_enabled"] = True
        raw_banner_pos = merged.get("silent_banner_position", "top-right")
        if isinstance(raw_banner_pos, str):
            norm_banner_pos = raw_banner_pos.strip().lower().replace("_", "-")
        else:
            norm_banner_pos = "top-right"
        if norm_banner_pos not in ("top-left", "top-right", "bottom-left", "bottom-right"):
            norm_banner_pos = "top-right"
        merged["silent_banner_position"] = norm_banner_pos
        merged["gamepad_chord_bindings"] = _sanitize_chord_bindings(
            merged.get("gamepad_chord_bindings")
        )
        merged["pinned_playlists"] = _sanitize_pinned_playlists(merged.get("pinned_playlists"))
        return merged
    except Exception:
        return copy.deepcopy(default_settings)


_load_settings_impl = _load_settings


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
