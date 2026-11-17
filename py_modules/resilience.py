"""Event-driven librespot --onevent Unix socket server and suspend/Wi-Fi session bookmark resilience."""

import asyncio
import json
import os
import socket
import time

from py_modules import common
from py_modules.common import ONEVENT_EMITTER_SCRIPT, ONEVENT_SOCK_FILE, decky

ONEVENT_DEBOUNCE_S = 0.4
POLL_INTERVAL_RELAXED_S = 20.0
POLL_INTERVAL_FAST_S = 3.0
ONEVENT_SILENCE_THRESHOLD_S = 90.0

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


def is_local_device_active(plugin) -> bool:
    """Return True when active Spotify Connect device is local librespot or no remote device is active."""
    active_dev = getattr(plugin, "_active_device", None)
    if not active_dev or not isinstance(active_dev, dict):
        return True
    dev_name = str(active_dev.get("name") or "").strip().lower()
    if not dev_name:
        return True
    settings = getattr(plugin, "_settings", {}) or {}
    configured_name = str(settings.get("device_name") or "").strip().lower()
    host_name = ""
    try:
        host_name = socket.gethostname().strip().lower()
    except Exception:
        host_name = ""
    local_names = {n for n in (configured_name, host_name, "deckify", "steam deck", "librespot") if n}
    return dev_name in local_names


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
        """Return 20.0s when librespot + --onevent are healthy and local; 3.0s otherwise (D-03, D-04)."""
        p = plugin or self._plugin
        if not self.is_healthy(p):
            return POLL_INTERVAL_FAST_S
        if not is_local_device_active(p):
            return POLL_INTERVAL_FAST_S
        return POLL_INTERVAL_RELAXED_S
