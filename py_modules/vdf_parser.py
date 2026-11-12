"""Pure-stdlib Steam VDF parsing and installed-game discovery (Phase 07).

Parses Valve binary KeyValues (shortcuts.vdf), text KeyValues
(libraryfolders.vdf / appmanifest_*.acf) and computes unsigned 32-bit AppIDs
for Non-Steam shortcuts matching SteamClient.Apps `unAppID`.
"""
import glob
import os
import re
import struct
import time
import zlib

from py_modules.common import DECK_HOME, decky

_TYPE_DICT = 0
_TYPE_STRING = 1
_TYPE_INT32 = 2
_TYPE_FLOAT32 = 3
_TYPE_INT64 = 7
_TYPE_END = 8

_MAX_DEPTH = 32
_CACHE_TTL = 30.0
_games_cache: dict = {"ts": 0.0, "games": None}


def _read_cstring(data: bytes, pos: int) -> tuple[str, int]:
    end = data.index(b"\x00", pos)  # ValueError if unterminated
    return data[pos:end].decode("utf-8", errors="replace"), end + 1


def parse_binary_vdf(data: bytes) -> dict:
    """Parse Valve binary KeyValues into a dict. Returns partial result on corrupt input."""
    root: dict = {}
    stack = [root]
    pos = 0
    length = len(data)
    try:
        while pos < length:
            type_byte = data[pos]
            pos += 1
            if type_byte == _TYPE_END:
                if len(stack) == 1:
                    break
                stack.pop()
                continue
            key, pos = _read_cstring(data, pos)
            current = stack[-1]
            if type_byte == _TYPE_DICT:
                if len(stack) >= _MAX_DEPTH:
                    break
                child: dict = {}
                current[key] = child
                stack.append(child)
            elif type_byte == _TYPE_STRING:
                current[key], pos = _read_cstring(data, pos)
            elif type_byte == _TYPE_INT32:
                current[key] = struct.unpack_from("<i", data, pos)[0]
                pos += 4
            elif type_byte == _TYPE_FLOAT32:
                current[key] = struct.unpack_from("<f", data, pos)[0]
                pos += 4
            elif type_byte == _TYPE_INT64:
                current[key] = struct.unpack_from("<q", data, pos)[0]
                pos += 8
            else:
                break  # unknown type: stop, keep partial result
    except (struct.error, IndexError, ValueError):
        pass
    return root


def compute_non_steam_appid(exe: str, app_name: str, raw_appid: int | None = None) -> int:
    """Return the unsigned 32-bit AppID for a Non-Steam shortcut."""
    if raw_appid:
        # shortcuts.vdf stores appid as signed int32; repack as unsigned to avoid sign inversion
        return int(raw_appid) & 0xFFFFFFFF
    crc = zlib.crc32(f"{exe}{app_name}".encode("utf-8")) & 0xFFFFFFFF
    return (crc | 0x80000000) & 0xFFFFFFFF


_TOKEN_RE = re.compile(r'"((?:[^"\\]|\\.)*)"|([{}])')


def parse_text_vdf(content: str) -> dict:
    """Lightweight text KeyValues parser (libraryfolders.vdf, appmanifest_*.acf)."""
    root: dict = {}
    stack = [root]
    pending_key: str | None = None
    for m in _TOKEN_RE.finditer(content):
        if m.group(2) == "{":
            child: dict = {}
            if pending_key is not None:
                stack[-1][pending_key] = child
                pending_key = None
            stack.append(child)
            if len(stack) > _MAX_DEPTH:
                break
        elif m.group(2) == "}":
            if len(stack) > 1:
                stack.pop()
            pending_key = None
        else:
            text = m.group(1).replace("\\\\", "\\").replace('\\"', '"')
            if pending_key is None:
                pending_key = text
            else:
                stack[-1][pending_key] = text
                pending_key = None
    return root


def _steam_roots() -> list[str]:
    return [
        os.path.join(DECK_HOME, ".local", "share", "Steam"),
        os.path.join(DECK_HOME, ".steam", "steam"),
    ]


def _read_text(path: str) -> str:
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            return f.read()
    except OSError:
        return ""


def parse_libraryfolders_vdf(content: str) -> list[str]:
    """Return list of library folder paths from libraryfolders.vdf text."""
    parsed = parse_text_vdf(content)
    folders = parsed.get("libraryfolders") or parsed
    paths: list[str] = []
    if isinstance(folders, dict):
        for value in folders.values():
            if isinstance(value, dict) and value.get("path"):
                paths.append(value["path"])
            elif isinstance(value, str) and value and os.sep in value:
                paths.append(value)
    return paths


def parse_appmanifest(content: str) -> dict | None:
    state = parse_text_vdf(content).get("AppState")
    if not isinstance(state, dict):
        return None
    try:
        app_id = int(state.get("appid", 0))
    except (TypeError, ValueError):
        return None
    name = state.get("name")
    if app_id <= 0 or not name:
        return None
    return {"app_id": app_id, "name": name, "installdir": state.get("installdir", "")}


def _scan_steam_games() -> list[dict]:
    games: dict[int, dict] = {}
    for root in _steam_roots():
        lib_paths = [root]
        lf = _read_text(os.path.join(root, "steamapps", "libraryfolders.vdf"))
        if lf:
            lib_paths.extend(parse_libraryfolders_vdf(lf))
        for lib in dict.fromkeys(lib_paths):
            for manifest in glob.glob(os.path.join(lib, "steamapps", "appmanifest_*.acf")):
                info = parse_appmanifest(_read_text(manifest))
                if info and info["app_id"] not in games:
                    games[info["app_id"]] = {
                        "app_id": info["app_id"],
                        "name": info["name"],
                        "is_steam": True,
                        "is_non_steam": False,
                        "icon_url": f"https://cdn.cloudflare.steamstatic.com/steam/apps/{info['app_id']}/library_600x900.jpg",
                    }
    return list(games.values())


def _scan_non_steam_games() -> list[dict]:
    games: dict[int, dict] = {}
    for root in _steam_roots():
        for path in glob.glob(os.path.join(root, "userdata", "*", "config", "shortcuts.vdf")):
            try:
                with open(path, "rb") as f:
                    data = f.read()
            except OSError:
                continue
            parsed = parse_binary_vdf(data)
            shortcuts = parsed.get("shortcuts") or {}
            if not isinstance(shortcuts, dict):
                continue
            for entry in shortcuts.values():
                if not isinstance(entry, dict):
                    continue
                lower = {str(k).lower(): v for k, v in entry.items()}
                name = lower.get("appname")
                if not name:
                    continue
                exe = lower.get("exe", "") or ""
                raw = lower.get("appid")
                app_id = compute_non_steam_appid(exe, name, raw if isinstance(raw, int) else None)
                games.setdefault(app_id, {
                    "app_id": app_id,
                    "name": name,
                    "exe": exe,
                    "is_steam": False,
                    "is_non_steam": True,
                    "icon_url": "",
                })
    return list(games.values())


def get_installed_games(force_refresh: bool = False) -> list[dict]:
    """Aggregate Steam + Non-Steam games, cached for 30s."""
    now = time.monotonic()
    cached = _games_cache["games"]
    if not force_refresh and cached is not None and (now - _games_cache["ts"]) < _CACHE_TTL:
        return list(cached)
    try:
        games = _scan_steam_games() + _scan_non_steam_games()
    except Exception as e:
        decky.logger.error("get_installed_games failed: %s", e)
        games = []
    games.sort(key=lambda g: g["name"].lower())
    _games_cache["games"] = games
    _games_cache["ts"] = now
    return list(games)
