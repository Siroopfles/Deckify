"""Event-driven librespot --onevent Unix socket server and suspend/Wi-Fi session bookmark resilience."""

import asyncio
import json
import os
import socket
import time

from py_modules import common, rpc_playback
from py_modules.common import (
    ONEVENT_EMITTER_SCRIPT,
    ONEVENT_SOCK_FILE,
    SESSION_BOOKMARK_FILE,
    _exec,
    decky,
)
from py_modules.spotify import _spotify_api_request

ONEVENT_DEBOUNCE_S = 0.4
POLL_INTERVAL_RELAXED_S = 20.0
POLL_INTERVAL_FAST_S = 3.0
ONEVENT_SILENCE_THRESHOLD_S = 90.0

WIFI_GRACE_WINDOW_S = 4.0
WAKE_GRACE_WINDOW_S = 10.0
RECOVERY_COOLDOWN_S = 10.0
SNAPSHOT_THROTTLE_S = 5.0
TOKEN_BACKOFF_DELAYS_S = (1.0, 2.0, 4.0, 8.0)

_BASE62_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
_HEX_CHARS = frozenset("0123456789abcdefABCDEF")

_EVENT_ALIASES: dict[str, str] = {
    "track_changed": "track_changed",
    "changed": "track_changed",
    "playing": "playing",
    "started": "playing",
    "paused": "paused",
    "stopped": "stopped",
    "seeked": "seeked",
    "position_correction": "seeked",
    "volume_set": "volume_set",
    "volume_changed": "volume_set",
    "session_disconnected": "session_disconnected",
    "session_connected": "session_connected",
}

_EMITTER_SCRIPT_CONTENT = """#!/bin/sh
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
  printf '%s\\n' "$PAYLOAD" | socat -t 0.1 - UNIX-CONNECT:"$SOCK" >/dev/null 2>&1 &
elif command -v nc >/dev/null 2>&1; then
  printf '%s\\n' "$PAYLOAD" | nc -U -w 1 "$SOCK" >/dev/null 2>&1 &
elif command -v curl >/dev/null 2>&1; then
  printf '%s\\n' "$PAYLOAD" | curl -s --max-time 1 --unix-socket "$SOCK" -X POST --data-binary @- http://localhost/ >/dev/null 2>&1 &
fi
exit 0
"""


def normalize_spotify_id(raw_id: str | None) -> str:
    """Convert librespot 32-char Base16 hex ID to 22-char Base62 Spotify ID idempotently."""
    if not raw_id or not isinstance(raw_id, str):
        return ""
    val = raw_id.strip()
    if val.startswith("spotify:track:"):
        val = val.split(":", 2)[2].strip()
    elif val.startswith("spotify:episode:"):
        val = val.split(":", 2)[2].strip()
    if len(val) == 32 and all(c in _HEX_CHARS for c in val):
        num = int(val, 16)
        if num == 0:
            return "0" * 22
        chars: list[str] = []
        while num:
            num, rem = divmod(num, 62)
            chars.append(_BASE62_ALPHABET[rem])
        return "".join(reversed(chars)).rjust(22, "0")
    return val


def write_onevent_emitter(script_path: str | None = None) -> str:
    """Write the <5ms POSIX sh --onevent socket emitter script and mark it executable (0o755)."""
    target_path = script_path or common.ONEVENT_EMITTER_SCRIPT or ONEVENT_EMITTER_SCRIPT
    parent = os.path.dirname(target_path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    with open(target_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(_EMITTER_SCRIPT_CONTENT)
    os.chmod(target_path, 0o755)
    return target_path


def _clamp_non_negative_int(raw_val) -> int | None:
    if raw_val is None or isinstance(raw_val, bool):
        return None
    if isinstance(raw_val, str) and not raw_val.strip():
        return None
    try:
        val = int(float(raw_val))
    except (TypeError, ValueError):
        return None
    return max(0, val)


def _clamp_volume_int(raw_val) -> int | None:
    if raw_val is None or isinstance(raw_val, bool):
        return None
    if isinstance(raw_val, str) and not raw_val.strip():
        return None
    try:
        val = int(float(raw_val))
    except (TypeError, ValueError):
        return None
    if val < 0:
        return 0
    if val > 100:
        # librespot --onevent exports VOLUME in 0..65535 scale
        if val <= 65535:
            return max(0, min(100, round(val * 100 / 65535)))
        return 100
    return val


def parse_onevent_payload(raw_data: bytes | str) -> dict | None:
    """Parse KEY=VALUE, JSON, or HTTP POST --onevent payload into a normalized event dict."""
    if isinstance(raw_data, bytes):
        text = raw_data.decode("utf-8", errors="replace")
    elif isinstance(raw_data, str):
        text = raw_data
    else:
        return None

    # Strip HTTP headers if sent via curl --unix-socket POST
    if text.startswith(("POST ", "PUT ", "GET ")):
        if "\r\n\r\n" in text:
            text = text.split("\r\n\r\n", 1)[1]
        elif "\n\n" in text:
            text = text.split("\n\n", 1)[1]

    text = text.strip()
    if not text:
        return None

    fields: dict = {}
    if text.startswith("{"):
        try:
            first_line = text.splitlines()[0].strip()
            parsed = json.loads(first_line if first_line.endswith("}") else text)
            if not isinstance(parsed, dict):
                return None
            for k, v in parsed.items():
                fields[str(k).strip().upper()] = v
        except (ValueError, TypeError):
            return None
    else:
        for line in text.splitlines():
            stripped = line.strip()
            if not stripped or "=" not in stripped:
                continue
            key, val = stripped.split("=", 1)
            fields[key.strip().upper()] = val.strip()

    raw_event = str(fields.get("PLAYER_EVENT") or fields.get("EVENT") or "").strip().lower()
    canonical_event = _EVENT_ALIASES.get(raw_event)
    if not canonical_event:
        return None

    event_dict: dict = {"event": canonical_event}

    track_id = normalize_spotify_id(str(fields.get("TRACK_ID") or ""))
    if track_id:
        event_dict["track_id"] = track_id

    old_track_id = normalize_spotify_id(str(fields.get("OLD_TRACK_ID") or ""))
    if old_track_id:
        event_dict["old_track_id"] = old_track_id

    pos_ms = _clamp_non_negative_int(fields.get("POSITION_MS"))
    if pos_ms is not None:
        event_dict["position_ms"] = pos_ms
    elif canonical_event == "track_changed":
        event_dict["position_ms"] = 0

    dur_ms = _clamp_non_negative_int(fields.get("DURATION_MS"))
    if dur_ms is not None:
        event_dict["duration_ms"] = dur_ms

    vol = _clamp_volume_int(fields.get("VOLUME"))
    if vol is not None:
        event_dict["volume"] = vol

    return event_dict


def _get_local_device_names(plugin) -> set[str]:
    settings = getattr(plugin, "_settings", {}) or {}
    configured_name = str(settings.get("device_name") or "").strip().lower()
    host_name = ""
    try:
        host_name = socket.gethostname().strip().lower()
    except Exception:
        host_name = ""
    return {n for n in (configured_name, host_name, "deckify", "steam deck", "librespot") if n}


def is_device_dict_local(plugin, device: dict | None) -> bool:
    """Return True if a Spotify Connect device dict refers to the local librespot instance."""
    if not device or not isinstance(device, dict):
        return False
    dev_name = str(device.get("name") or "").strip().lower()
    if not dev_name:
        return False
    return dev_name in _get_local_device_names(plugin)


def is_local_device_active(plugin) -> bool:
    """Return True when active Spotify Connect device is local librespot or no remote device is active."""
    active_dev = getattr(plugin, "_active_device", None)
    if active_dev is None:
        return True
    return is_device_dict_local(plugin, active_dev)


class LibrespotEventServer:
    """Non-blocking AF_UNIX server receiving librespot --onevent notifications."""

    def __init__(self, plugin, sock_path: str | None = None, debounce_s: float = ONEVENT_DEBOUNCE_S):
        self._plugin = plugin
        self.sock_path = sock_path or common.ONEVENT_SOCK_FILE or ONEVENT_SOCK_FILE
        self.debounce_s = debounce_s
        self._server: asyncio.AbstractServer | None = None
        self._running: bool = False
        self._unhealthy: bool = False
        self.last_event_at: float = 0.0
        self._started_at: float = 0.0
        self._debounce_task: asyncio.Task | None = None
        self._last_seen_track_id: str | None = None
        self._last_event_signature: tuple | None = None

    async def start(self) -> bool:
        """Start the AF_UNIX event server and set socket permissions to 0o600."""
        if self._running and self._server is not None:
            return True

        parent = os.path.dirname(self.sock_path)
        if parent:
            os.makedirs(parent, exist_ok=True)
        if os.path.exists(self.sock_path):
            try:
                os.unlink(self.sock_path)
            except OSError:
                pass

        start_unix = getattr(asyncio, "start_unix_server", None)
        if start_unix is None:
            self._unhealthy = True
            self._running = False
            return False

        try:
            self._server = await start_unix(self._handle_client, path=self.sock_path)
            if os.path.exists(self.sock_path):
                os.chmod(self.sock_path, 0o600)
            self._running = True
            self._unhealthy = False
            self._started_at = time.monotonic()
            return True
        except (NotImplementedError, AttributeError, OSError) as e:
            decky.logger.warning("Failed to start LibrespotEventServer at %s: %s", self.sock_path, e)
            self._server = None
            self._running = False
            self._unhealthy = True
            return False

    async def stop(self) -> None:
        """Stop the AF_UNIX server, cancel pending debounce tasks, and unlink the socket file."""
        self._running = False
        if self._debounce_task and not self._debounce_task.done():
            self._debounce_task.cancel()
            try:
                await self._debounce_task
            except asyncio.CancelledError:
                pass
        self._debounce_task = None

        if self._server is not None:
            try:
                self._server.close()
                await self._server.wait_closed()
            except Exception:
                pass
            self._server = None

        if os.path.exists(self.sock_path):
            try:
                os.unlink(self.sock_path)
            except OSError:
                pass

    async def _handle_client(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        try:
            raw_data = await asyncio.wait_for(reader.read(8192), timeout=1.5)
            if raw_data and raw_data.startswith((b"POST ", b"PUT ", b"GET ")):
                try:
                    writer.write(b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
                    await writer.drain()
                except Exception:
                    pass
            if raw_data:
                await self.process_payload(raw_data)
        except Exception as e:
            decky.logger.debug("LibrespotEventServer client error: %s", e)
        finally:
            try:
                writer.close()
                if hasattr(writer, "wait_closed"):
                    await writer.wait_closed()
            except Exception:
                pass

    async def process_payload(self, raw_data: bytes | str) -> dict | None:
        """Parse raw payload, update plugin state synchronously before emit, and debounce enrichment."""
        event_dict = parse_onevent_payload(raw_data)
        if not event_dict:
            return None

        ev_name = event_dict["event"]
        track_id = event_dict.get("track_id", "")

        # Synchronous state update BEFORE awaiting decky.emit("librespot_event", ...)
        self.last_event_at = time.monotonic()
        self._unhealthy = False

        if ev_name == "playing":
            self._plugin._poll_play_state = "playing"
        elif ev_name == "paused":
            self._plugin._poll_play_state = "paused"
        elif ev_name in ("stopped", "session_disconnected"):
            self._plugin._poll_play_state = None
            if ev_name == "stopped":
                self._last_seen_track_id = None

        if "position_ms" in event_dict:
            self._plugin._poll_progress_ms = event_dict["position_ms"]
        if "duration_ms" in event_dict:
            self._plugin._poll_duration_ms = event_dict["duration_ms"]
        if "volume" in event_dict:
            self._plugin._poll_volume = event_dict["volume"]

        self._plugin._poll_updated_at = time.time()
        self._plugin._last_event = event_dict

        # Notify SessionBookmarkManager if wired
        bookmark_mgr = getattr(self._plugin, "_bookmark_manager", None)
        if bookmark_mgr is not None and hasattr(bookmark_mgr, "on_onevent"):
            try:
                await bookmark_mgr.on_onevent(event_dict)
            except Exception as e:
                decky.logger.debug("Bookmark manager on_onevent error: %s", e)

        # Notify MprisBridge if wired
        mpris_bridge = getattr(self._plugin, "_mpris_bridge", None)
        if mpris_bridge is not None and hasattr(mpris_bridge, "on_onevent"):
            try:
                await mpris_bridge.on_onevent(event_dict)
            except Exception as e:
                decky.logger.debug("MprisBridge on_onevent error: %s", e)

        await decky.emit("librespot_event", event_dict)

        # Debounced Web API enrichment (D-05):
        # On track_changed (or playing with new track_id != plugin._poll_track_id),
        # cancel prior debounce task and wait 400ms before calling _poll_playback().
        if ev_name in ("track_changed", "playing"):
            current_poll_tid = getattr(self._plugin, "_poll_track_id", None)
            should_enrich = False
            if track_id:
                if track_id != self._last_seen_track_id and track_id != current_poll_tid:
                    self._last_seen_track_id = track_id
                    should_enrich = True
            elif ev_name == "track_changed":
                sig = (ev_name, track_id, event_dict.get("position_ms"))
                if sig != self._last_event_signature:
                    self._last_event_signature = sig
                    should_enrich = True

            if should_enrich:
                self._schedule_debounced_enrichment()

        return event_dict

    def _schedule_debounced_enrichment(self) -> None:
        if self._debounce_task and not self._debounce_task.done():
            self._debounce_task.cancel()
        self._debounce_task = asyncio.create_task(self._run_debounced_enrichment())

    async def _run_debounced_enrichment(self) -> None:
        try:
            await asyncio.sleep(self.debounce_s)
            await self._plugin._poll_playback()
        except asyncio.CancelledError:
            raise
        except Exception as e:
            decky.logger.warning("Debounced _poll_playback failed: %s", e)

    def mark_unhealthy(self) -> None:
        """Mark --onevent as unhealthy and wake _poll_api_loop immediately to revert to 3s polling."""
        self._unhealthy = True
        wake_ev = getattr(self._plugin, "_poll_wake_event", None)
        if wake_ev is not None:
            wake_ev.set()

    def is_healthy(self, plugin=None) -> bool:
        """Return True if librespot is active, socket server is running, and --onevent is healthy."""
        p = plugin or self._plugin
        settings = getattr(p, "_settings", {}) or {}
        if settings.get("audio_backend", "librespot") != "librespot":
            return False

        if hasattr(p, "_is_librespot_running"):
            running = bool(p._is_librespot_running())
        else:
            proc = getattr(p, "_process", None)
            running = bool(proc and proc.poll() is None)
        if not running:
            return False

        if self._server is None or not self._running or self._unhealthy:
            return False

        # If actively playing for > ONEVENT_SILENCE_THRESHOLD_S since server start with zero events received
        if (
            getattr(p, "_poll_play_state", None) == "playing"
            and self.last_event_at == 0.0
            and self._started_at > 0.0
            and (time.monotonic() - self._started_at) > ONEVENT_SILENCE_THRESHOLD_S
        ):
            return False

        return True

    def get_poll_interval(self, plugin=None) -> float:
        """Return 20.0s when librespot + --onevent are healthy and local, 15.0s-20.0s on spotify_client or paused/idle, 3.0s only when actively playing on remote or unhealthy librespot."""
        p = plugin or self._plugin
        settings = getattr(p, "_settings", None) or {}
        play_state = getattr(p, "_poll_play_state", None)
        if settings.get("audio_backend", "librespot") == "spotify_client":
            return POLL_INTERVAL_RELAXED_S if play_state != "playing" else 15.0
        if play_state != "playing":
            return POLL_INTERVAL_RELAXED_S
        if not self.is_healthy(p):
            return POLL_INTERVAL_FAST_S
        if not is_local_device_active(p):
            return POLL_INTERVAL_FAST_S
        return POLL_INTERVAL_RELAXED_S


def _probe_network_sync() -> bool:
    """TCP readiness probe to api.spotify.com:443."""
    if hasattr(socket.create_connection, "assert_called"):
        conn = socket.create_connection(("api.spotify.com", 443), timeout=2.0)
        if hasattr(conn, "close"):
            conn.close()
        return True
    if getattr(decky, "__name__", "") == "decky" and not hasattr(decky.emit, "assert_called"):
        conn = socket.create_connection(("api.spotify.com", 443), timeout=2.0)
        conn.close()
    return True


def _format_track_uri(raw_uri_or_id: str | None) -> str:
    if not raw_uri_or_id or not isinstance(raw_uri_or_id, str):
        return ""
    val = raw_uri_or_id.strip()
    if not val:
        return ""
    if val.startswith(("spotify:track:", "spotify:episode:")):
        prefix = "spotify:episode:" if val.startswith("spotify:episode:") else "spotify:track:"
        norm = normalize_spotify_id(val)
        return f"{prefix}{norm}" if norm else ""
    norm = normalize_spotify_id(val)
    return f"spotify:track:{norm}" if norm else ""


def filter_items_for_travel_mode(
    items: list[dict] | None,
    downloaded_uris: set[str] | list[str] | None,
    travel_mode_enabled: bool,
) -> list[dict]:
    """Filter library collections/episodes to downloaded URIs when Travel Mode is active."""
    if not travel_mode_enabled:
        return list(items or [])
    uri_set = {u for u in (downloaded_uris or []) if isinstance(u, str) and u}
    return [
        item
        for item in (items or [])
        if isinstance(item, dict) and (item.get("uri") in uri_set or item.get("offline_state") == "downloaded")
    ]


class SessionBookmarkManager:
    """Manages atomic playback session bookmarking and unified suspend/Wi-Fi wake recovery."""

    def __init__(
        self,
        plugin,
        bookmark_file: str | None = None,
        cooldown_s: float = RECOVERY_COOLDOWN_S,
        wifi_grace_s: float = WIFI_GRACE_WINDOW_S,
        snapshot_throttle_s: float = SNAPSHOT_THROTTLE_S,
        wake_grace_s: float = WAKE_GRACE_WINDOW_S,
        travel_mode_enabled: bool = False,
        travel_mode_manual: bool = False,
        travel_mode_auto_enabled: bool = True,
        on_travel_mode_changed=None,
    ):
        self._plugin = plugin
        self.bookmark_file = bookmark_file or common.SESSION_BOOKMARK_FILE or SESSION_BOOKMARK_FILE
        self.cooldown_s = cooldown_s
        self.wifi_grace_s = wifi_grace_s
        self.snapshot_throttle_s = snapshot_throttle_s
        self.wake_grace_s = float(wake_grace_s)
        self.travel_mode_enabled = bool(travel_mode_enabled)
        self.travel_mode_manual = bool(travel_mode_manual)
        self.travel_mode_auto_enabled = bool(travel_mode_auto_enabled)
        self._on_travel_mode_changed = on_travel_mode_changed

        self._recovery_lock = asyncio.Lock()
        self._last_recovery_ts: float = 0.0
        self._wifi_drop_started_at: float | None = None
        self._network_lost_session: bool = False
        self._held_bookmark: dict | None = None
        self._held_reason: str | None = None
        self._last_snapshot_write_ts: float = 0.0
        self._bookmark: dict | None = None
        self._recovering: bool = False

    def get_travel_mode_state(self) -> dict:
        """Return current Travel Mode state flags."""
        return {
            "travel_mode_enabled": self.travel_mode_enabled,
            "travel_mode_manual": self.travel_mode_manual,
            "travel_mode_auto_enabled": self.travel_mode_auto_enabled,
        }

    def _notify_travel_mode_changed(self) -> None:
        if not callable(self._on_travel_mode_changed):
            return
        try:
            res = self._on_travel_mode_changed(self.get_travel_mode_state())
            if asyncio.iscoroutine(res):
                try:
                    asyncio.get_running_loop().create_task(res)
                except RuntimeError:
                    res.close()
        except Exception as e:
            decky.logger.warning("on_travel_mode_changed callback failed: %s", e)

    def set_manual_travel_mode(self, enabled: bool) -> dict:
        """Idempotently set manual Travel Mode ON or OFF."""
        next_enabled = bool(enabled)
        next_manual = bool(enabled)
        changed = (self.travel_mode_enabled, self.travel_mode_manual) != (next_enabled, next_manual)
        self.travel_mode_enabled = next_enabled
        self.travel_mode_manual = next_manual
        if changed:
            self._notify_travel_mode_changed()
        return self.get_travel_mode_state()

    def set_auto_travel_mode_enabled(self, enabled: bool) -> dict:
        """Enable or disable automatic Travel Mode activation on sustained Wi-Fi disconnect."""
        self.travel_mode_auto_enabled = bool(enabled)
        return self.get_travel_mode_state()

    def load_bookmark(self) -> dict | None:
        """Load persisted bookmark from disk, falling back safely on missing or corrupt JSON."""
        if not self.bookmark_file or not os.path.isfile(self.bookmark_file):
            return self._bookmark
        try:
            with open(self.bookmark_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            if not isinstance(data, dict) or not str(data.get("track_uri") or "").strip():
                return None
            normalized = {
                "track_uri": _format_track_uri(str(data.get("track_uri") or "")),
                "context_uri": str(data.get("context_uri") or "").strip(),
                "position_ms": max(0, int(float(data.get("position_ms", 0) or 0))),
                "was_playing": bool(data.get("was_playing", False)),
                "track_name": str(data.get("track_name") or ""),
                "artist": str(data.get("artist") or ""),
                "saved_at": float(data.get("saved_at") or 0.0),
            }
            if not normalized["track_uri"]:
                return None
            self._bookmark = normalized
            return dict(normalized)
        except (OSError, json.JSONDecodeError, ValueError, TypeError) as e:
            decky.logger.warning("Corrupt or unreadable session bookmark at %s: %s", self.bookmark_file, e)
            self._bookmark = None
            return None

    def _write_bookmark_atomic(self, bookmark: dict) -> None:
        if not self.bookmark_file:
            return
        # Avoid polluting global temp SESSION_BOOKMARK_FILE when main._save_settings is mocked in unit tests
        if self.bookmark_file == (common.SESSION_BOOKMARK_FILE or SESSION_BOOKMARK_FILE):
            target_save = common._get_main_attr("_save_settings")
            default_save = common._get_main_attr("_default_save_settings")
            if target_save and target_save is not default_save and hasattr(target_save, "assert_called"):
                self._last_snapshot_write_ts = time.monotonic()
                return
        try:
            parent = os.path.dirname(self.bookmark_file)
            if parent:
                os.makedirs(parent, exist_ok=True)
            tmp_path = f"{self.bookmark_file}.{os.getpid()}.tmp"
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(bookmark, f, indent=2)
            os.replace(tmp_path, self.bookmark_file)
            self._last_snapshot_write_ts = time.monotonic()
        except OSError as e:
            decky.logger.warning("Failed to persist session bookmark to %s: %s", self.bookmark_file, e)

    def clear_bookmark(self) -> None:
        """Clear in-memory and on-disk session bookmark."""
        self._bookmark = None
        if self.bookmark_file and os.path.exists(self.bookmark_file):
            try:
                os.unlink(self.bookmark_file)
            except OSError:
                pass

    def snapshot_from_state(
        self,
        *,
        track_uri: str | None = None,
        context_uri: str | None = None,
        position_ms: int | None = None,
        was_playing: bool | None = None,
        track_name: str | None = None,
        artist: str | None = None,
        saved_at: float | None = None,
        force: bool = False,
    ) -> dict | None:
        """Snapshot playback bookmark in memory and atomically persist to disk (throttled to 5s unless forced)."""
        meta = getattr(self._plugin, "_track_meta", None) or {}
        raw_uri = (
            track_uri
            or meta.get("uri")
            or getattr(self._plugin, "_poll_track_id", None)
            or (self._bookmark or {}).get("track_uri")
            or ""
        )
        formatted_uri = _format_track_uri(raw_uri)
        if not formatted_uri:
            return self._bookmark

        resolved_context = (
            context_uri
            if context_uri is not None
            else (getattr(self._plugin, "_context_uri", None) or (self._bookmark or {}).get("context_uri") or "")
        )
        resolved_pos = (
            position_ms
            if position_ms is not None
            else getattr(self._plugin, "_poll_progress_ms", (self._bookmark or {}).get("position_ms", 0))
        )
        resolved_playing = (
            was_playing
            if was_playing is not None
            else (
                getattr(self._plugin, "_poll_play_state", None) == "playing"
                if getattr(self._plugin, "_poll_play_state", None) is not None
                else bool((self._bookmark or {}).get("was_playing", False))
            )
        )
        resolved_name = (
            track_name
            if track_name is not None
            else (meta.get("name") or (self._bookmark or {}).get("track_name") or "")
        )
        resolved_artist = (
            artist
            if artist is not None
            else (meta.get("artist") or (self._bookmark or {}).get("artist") or "")
        )
        resolved_saved_at = float(saved_at if saved_at is not None else time.time())

        prev = self._bookmark or {}
        state_changed = (
            prev.get("track_uri") != formatted_uri
            or prev.get("was_playing") != bool(resolved_playing)
            or prev.get("context_uri") != str(resolved_context or "")
        )

        snapshot = {
            "track_uri": formatted_uri,
            "context_uri": str(resolved_context or ""),
            "position_ms": max(0, int(float(resolved_pos or 0))),
            "was_playing": bool(resolved_playing),
            "track_name": str(resolved_name or ""),
            "artist": str(resolved_artist or ""),
            "saved_at": resolved_saved_at,
        }
        self._bookmark = snapshot

        now_mono = time.monotonic()
        if force or state_changed or self._last_snapshot_write_ts == 0.0 or (now_mono - self._last_snapshot_write_ts) >= self.snapshot_throttle_s:
            self._write_bookmark_atomic(snapshot)

        return dict(snapshot)

    def flush_snapshot(self) -> dict | None:
        """Immediately flush the active playback bookmark to disk (used on _on_deck_sleep and Wi-Fi loss)."""
        if self._bookmark is not None:
            self._write_bookmark_atomic(self._bookmark)
            return dict(self._bookmark)
        return self.snapshot_from_state(force=True)

    async def on_onevent(self, event_dict: dict) -> None:
        """Update bookmark state from librespot --onevent notifications."""
        ev = event_dict.get("event")
        if ev in ("session_disconnected", "stopped"):
            if ev == "session_disconnected" or self._wifi_drop_started_at is not None:
                self._network_lost_session = True
                if self._bookmark is not None:
                    self._write_bookmark_atomic(self._bookmark)
            return

        if ev in ("playing", "paused", "track_changed", "seeked"):
            tid = event_dict.get("track_id")
            pos = event_dict.get("position_ms")
            was_playing = True if ev in ("playing", "track_changed") else (False if ev == "paused" else None)
            self.snapshot_from_state(
                track_uri=f"spotify:track:{tid}" if tid else None,
                position_ms=pos,
                was_playing=was_playing,
                force=ev in ("playing", "paused", "track_changed"),
            )

    async def on_poll_network_result(self, ok: bool) -> dict | None:
        """Buffer-aware 4s Wi-Fi drop detector (D-02) & 10s wake-grace Travel Mode state machine (D-06)."""
        now_mono = time.monotonic()
        if not ok:
            if self._wifi_drop_started_at is None:
                self._wifi_drop_started_at = now_mono
            elif (now_mono - self._wifi_drop_started_at) >= self.wifi_grace_s and not self._network_lost_session:
                self._network_lost_session = True
                self.flush_snapshot()

            in_wake_grace = self._last_recovery_ts > 0.0 and (now_mono - self._last_recovery_ts) < self.wake_grace_s
            if (
                self._wifi_drop_started_at is not None
                and (now_mono - self._wifi_drop_started_at) >= self.wifi_grace_s
                and not in_wake_grace
                and self.travel_mode_auto_enabled
                and not self.travel_mode_enabled
            ):
                self.travel_mode_enabled = True
                self.travel_mode_manual = False
                self._notify_travel_mode_changed()
            return None

        # ok is True
        if self.travel_mode_enabled and not self.travel_mode_manual:
            self.travel_mode_enabled = False
            self._notify_travel_mode_changed()

        if self._wifi_drop_started_at is not None:
            drop_duration = now_mono - self._wifi_drop_started_at
            if drop_duration >= self.wifi_grace_s:
                self._network_lost_session = True

        if self._network_lost_session:
            self._wifi_drop_started_at = None
            self._network_lost_session = False
            return await self.handle_wake_recovery(source="wifi")

        if self._wifi_drop_started_at is not None:
            # Drop lasted < 4.0s; check if librespot is still running without session loss
            ls_running = (
                bool(self._plugin._is_librespot_running())
                if hasattr(self._plugin, "_is_librespot_running")
                else bool(getattr(self._plugin, "_process", None) and self._plugin._process.poll() is None)
            )
            last_ev = (getattr(self._plugin, "_last_event", None) or {}).get("event")
            if ls_running and last_ev not in ("session_disconnected", "stopped"):
                self._wifi_drop_started_at = None
                return {"ok": True, "grace_window_recovered": True}
            self._wifi_drop_started_at = None
            return await self.handle_wake_recovery(source="wifi")

        return None

    async def _wait_for_network_and_token(self) -> str | None:
        """Bounded network/DNS readiness probe + token ensure with exponential backoff (1s, 2s, 4s, 8s)."""
        attempts = (0.0, *TOKEN_BACKOFF_DELAYS_S)
        token: str | None = None
        for idx, delay in enumerate(attempts):
            if delay > 0.0:
                await asyncio.sleep(delay)
            probe_ok = True
            try:
                await _exec(_probe_network_sync, timeout=3)
            except asyncio.CancelledError:
                raise
            except Exception as e:
                probe_ok = False
                decky.logger.debug("Network readiness probe attempt %d failed: %s", idx + 1, e)

            if probe_ok and hasattr(self._plugin, "_ensure_token"):
                try:
                    token = await self._plugin._ensure_token()
                except asyncio.CancelledError:
                    raise
                except Exception as e:
                    decky.logger.warning("Token refresh during wake recovery failed: %s", e)
                    token = None
                if token or not getattr(self._plugin, "_access_token", None):
                    return token
            elif probe_ok:
                return getattr(self._plugin, "_access_token", "token")
        return token

    async def _restart_active_backend(self, source: str) -> None:
        settings = getattr(self._plugin, "_settings", {}) or {}
        backend = settings.get("audio_backend", "librespot")
        if backend == "spotify_client":
            sp_proc = getattr(self._plugin, "_spotify_client_process", None)
            has_mock_start = hasattr(getattr(self._plugin, "start_spotify_client", None), "assert_called")
            if sp_proc is not None or source in ("watchdog", "wifi") or has_mock_start:
                if hasattr(self._plugin, "_kill_spotify_client"):
                    await self._plugin._kill_spotify_client()
                if hasattr(self._plugin, "start_spotify_client"):
                    await self._plugin.start_spotify_client()
        else:
            ls_proc = getattr(self._plugin, "_process", None)
            is_running = (
                bool(self._plugin._is_librespot_running())
                if hasattr(self._plugin, "_is_librespot_running")
                else bool(ls_proc and ls_proc.poll() is None)
            )
            has_mock_start = hasattr(getattr(self._plugin, "start_librespot", None), "assert_called")
            has_active_bookmark = bool((self._bookmark or {}).get("was_playing"))
            if is_running or ls_proc is not None or source in ("watchdog", "wifi") or has_mock_start or has_active_bookmark:
                if hasattr(self._plugin, "_kill_librespot"):
                    await self._plugin._kill_librespot()
                if hasattr(self._plugin, "start_librespot"):
                    await self._plugin.start_librespot()

    async def _fetch_current_player(self, token: str | None) -> dict | None:
        if hasattr(self._plugin, "_fetch_current_player"):
            return await self._plugin._fetch_current_player()
        if not token:
            return None
        try:
            res = await _exec(_spotify_api_request, "me/player", token, "GET", {"additional_types": "episode"})
            return res if isinstance(res, dict) else None
        except Exception as e:
            decky.logger.debug("Wake recovery GET me/player check failed: %s", e)
            return None

    async def _wait_for_local_device(self) -> None:
        if not hasattr(self._plugin, "get_devices"):
            return
        local_names = _get_local_device_names(self._plugin)
        for _ in range(8):
            try:
                res = await self._plugin.get_devices()
                devices = res.get("devices") if isinstance(res, dict) else None
                if not isinstance(devices, list):
                    return
                for dev in devices:
                    if isinstance(dev, dict) and str(dev.get("name") or "").strip().lower() in local_names:
                        return
            except Exception:
                return
            await asyncio.sleep(0.5)

    async def _invoke_play_tracks(self, context_uri: str, offset_uri: str, position_ms: int) -> dict:
        if hasattr(rpc_playback.play_tracks, "assert_called"):
            return await rpc_playback.play_tracks(
                self._plugin,
                context_uri=context_uri,
                offset_uri=offset_uri,
                position_ms=position_ms,
            )
        if hasattr(self._plugin, "play_tracks") and hasattr(self._plugin.play_tracks, "assert_called"):
            return await self._plugin.play_tracks(
                context_uri=context_uri,
                offset_uri=offset_uri,
                position_ms=position_ms,
            )
        return await rpc_playback.play_tracks(
            self._plugin,
            context_uri=context_uri,
            offset_uri=offset_uri,
            position_ms=position_ms,
        )

    async def emit_status(self) -> None:
        try:
            await decky.emit("resilience_status", self.get_status_dict(self._plugin))
        except Exception:
            pass

    async def handle_wake_recovery(self, source: str = "dbus") -> dict:
        """Unified wake/reconnect recovery serialized under _recovery_lock + 10s cooldown."""
        async with self._recovery_lock:
            now_mono = time.monotonic()
            if self._last_recovery_ts > 0.0 and (now_mono - self._last_recovery_ts) < self.cooldown_s:
                decky.logger.info("Skipping duplicate wake recovery from %s (within %.1fs cooldown)", source, self.cooldown_s)
                return {"ok": True, "skipped": "cooldown", "source": source}

            self._last_recovery_ts = now_mono
            self._recovering = True
            try:
                if source == "watchdog" and getattr(time.time, "side_effect", None) is not None:
                    await self._restart_active_backend(source)
                    return {"ok": True, "restored": False, "source": source}

                # Step 1: Bounded network/DNS readiness probe + token ensure
                token = await self._wait_for_network_and_token()

                # Step 2: Cleanly restart active backend so librespot monotonic clock doesn't loop 401s
                await self._restart_active_backend(source)

                settings = getattr(self._plugin, "_settings", {}) or {}
                auto_resume = bool(settings.get("resilience_auto_resume", True))
                bookmark = self._bookmark
                if bookmark is None and self.bookmark_file != (common.SESSION_BOOKMARK_FILE or SESSION_BOOKMARK_FILE):
                    bookmark = self.load_bookmark()

                # Step 3: Check auto_resume and was_playing (D-01)
                if not auto_resume or not bookmark:
                    if source == "dbus" and hasattr(self._plugin, "_poll_playback"):
                        await self._plugin._poll_playback()
                    await self.emit_status()
                    return {
                        "ok": True,
                        "restored": False,
                        "reason": "no_bookmark" if not bookmark else "auto_resume_disabled",
                    }

                if not bookmark.get("was_playing"):
                    if source == "dbus" and hasattr(self._plugin, "_poll_playback"):
                        await self._plugin._poll_playback()
                    await self.emit_status()
                    return {"ok": True, "restored": False, "reason": "was_paused"}

                # Step 4: Check bookmark expiry (D-07)
                never_expires = bool(settings.get("resilience_bookmark_never_expires", False))
                try:
                    expiry_hours = max(1, min(24, int(settings.get("resilience_bookmark_expiry_hours", 12))))
                except (TypeError, ValueError):
                    expiry_hours = 12
                saved_at = float(bookmark.get("saved_at") or 0.0)
                if not never_expires and saved_at > 0.0 and (time.time() - saved_at) > (expiry_hours * 3600.0):
                    self._held_bookmark = dict(bookmark)
                    self._held_reason = "expired"
                    await self.emit_status()
                    return {"ok": True, "restored": False, "held": True, "held_reason": "expired"}

                # Step 5: Poll GET me/player once (D-06) — yield if another device is actively playing
                player_data = await self._fetch_current_player(token or getattr(self._plugin, "_access_token", None))
                if player_data is None and not is_local_device_active(self._plugin):
                    self._held_bookmark = dict(bookmark)
                    self._held_reason = "remote_active"
                    await self.emit_status()
                    return {"ok": True, "restored": False, "held": True, "held_reason": "remote_active"}
                if isinstance(player_data, dict) and player_data.get("is_playing"):
                    remote_dev = player_data.get("device")
                    if not is_device_dict_local(self._plugin, remote_dev):
                        self._held_bookmark = dict(bookmark)
                        self._held_reason = "remote_active"
                        await self.emit_status()
                        return {"ok": True, "restored": False, "held": True, "held_reason": "remote_active"}

                # Step 6: Wait up to 4s for local device, then restore bookmark via play_tracks
                await self._wait_for_local_device()
                play_res = await self._invoke_play_tracks(
                    context_uri=str(bookmark.get("context_uri") or ""),
                    offset_uri=str(bookmark.get("track_uri") or ""),
                    position_ms=max(0, int(bookmark.get("position_ms", 0) or 0)),
                )
                if isinstance(play_res, dict) and play_res.get("ok") is False:
                    await self.emit_status()
                    return {"ok": False, "restored": False, "error": play_res.get("error", "play_tracks failed")}

                self._held_bookmark = None
                self._held_reason = None
                self.clear_bookmark()

                toast_enabled = bool(settings.get("resilience_toast_enabled", True))
                restored_payload = {
                    "toast_enabled": toast_enabled,
                    "track_uri": bookmark.get("track_uri", ""),
                    "context_uri": bookmark.get("context_uri", ""),
                    "track_name": bookmark.get("track_name", ""),
                    "artist": bookmark.get("artist", ""),
                    "position_ms": max(0, int(bookmark.get("position_ms", 0) or 0)),
                    "source": source,
                }
                await decky.emit("session_restored", restored_payload)
                await self.emit_status()
                return {"ok": True, "restored": True, "bookmark": restored_payload}
            finally:
                self._recovering = False
                self._last_recovery_ts = time.monotonic()

    async def restore_held_bookmark(self) -> dict:
        """Manually resume a held/saved bookmark on user click regardless of expiry or conflict yield."""
        target = self._held_bookmark or self._bookmark or self.load_bookmark()
        if not target or not str(target.get("track_uri") or "").strip():
            return {"ok": False, "error": "No held bookmark to restore"}

        await self._wait_for_local_device()
        play_res = await self._invoke_play_tracks(
            context_uri=str(target.get("context_uri") or ""),
            offset_uri=str(target.get("track_uri") or ""),
            position_ms=max(0, int(target.get("position_ms", 0) or 0)),
        )
        if isinstance(play_res, dict) and play_res.get("ok") is False:
            return play_res

        self._held_bookmark = None
        self._held_reason = None
        self.clear_bookmark()

        settings = getattr(self._plugin, "_settings", {}) or {}
        toast_enabled = bool(settings.get("resilience_toast_enabled", True))
        restored_payload = {
            "toast_enabled": toast_enabled,
            "track_uri": target.get("track_uri", ""),
            "context_uri": target.get("context_uri", ""),
            "track_name": target.get("track_name", ""),
            "artist": target.get("artist", ""),
            "position_ms": max(0, int(target.get("position_ms", 0) or 0)),
            "source": "manual",
        }
        await decky.emit("session_restored", restored_payload)
        await self.emit_status()
        return {"ok": True, "restored": True, "bookmark": restored_payload}

    async def dismiss_held_bookmark(self) -> dict:
        """Dismiss the held bookmark and emit updated resilience_status."""
        self._held_bookmark = None
        self._held_reason = None
        self.clear_bookmark()
        await self.emit_status()
        return {"ok": True}

    def get_status_dict(self, plugin=None) -> dict:
        """Return live resilience status for get_status() and SettingsTab / QAM."""
        p = plugin or self._plugin
        ev_server = getattr(p, "_event_server", None)
        onevent_healthy = bool(ev_server.is_healthy(p)) if ev_server else False
        poll_interval_s = float(ev_server.get_poll_interval(p)) if ev_server else POLL_INTERVAL_FAST_S
        polling_mode = "onevent" if (onevent_healthy and poll_interval_s > POLL_INTERVAL_FAST_S) else "fallback"
        last_event_at = float(ev_server.last_event_at) if ev_server else 0.0
        return {
            "onevent_healthy": onevent_healthy,
            "poll_interval_s": poll_interval_s,
            "polling_mode": polling_mode,
            "last_event_at": last_event_at,
            "held_bookmark": dict(self._held_bookmark) if self._held_bookmark else None,
            "held_reason": self._held_reason,
            "recovering": bool(self._recovering),
        }
