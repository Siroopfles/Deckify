import asyncio
import json
import os
import re
import shutil
import struct
import subprocess
import sys
import time
import urllib.parse
from typing import Any, Callable

# Ensure plugin root is on sys.path when invoked as `--worker` subprocess
_PLUGIN_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _PLUGIN_ROOT not in sys.path:
    sys.path.insert(0, _PLUGIN_ROOT)

from py_modules import images, resilience  # noqa: E402
from py_modules.common import (  # noqa: E402
    DBUS_SESSION_BUS_ADDRESS,
    DECK_USER,
    _build_deck_command,
    _exec,
    decky,
)

MPRIS_BUS_NAME = "org.mpris.MediaPlayer2.deckify"
MPRIS_OBJECT_PATH = "/org/mpris/MediaPlayer2"
MPRIS_ROOT_IFACE = "org.mpris.MediaPlayer2"
MPRIS_PLAYER_IFACE = "org.mpris.MediaPlayer2.Player"
DBUS_IFACE = "org.freedesktop.DBus"
DBUS_OBJECT_PATH = "/org/freedesktop/DBus"
DBUS_PROPERTIES_IFACE = "org.freedesktop.DBus.Properties"
DBUS_INTROSPECTABLE_IFACE = "org.freedesktop.DBus.Introspectable"
DBUS_PEER_IFACE = "org.freedesktop.DBus.Peer"
NO_TRACK_PATH = "/org/mpris/MediaPlayer2/NoTrack"
MAX_DBUS_BODY_BYTES = 65536

MSG_METHOD_CALL = 1
MSG_METHOD_RETURN = 2
MSG_ERROR = 3
MSG_SIGNAL = 4

FLAG_NO_REPLY_EXPECTED = 0x1

HDR_PATH = 1
HDR_INTERFACE = 2
HDR_MEMBER = 3
HDR_ERROR_NAME = 4
HDR_REPLY_SERIAL = 5
HDR_DESTINATION = 6
HDR_SENDER = 7
HDR_SIGNATURE = 8

_HDR_TYPES = {
    HDR_PATH: "o",
    HDR_INTERFACE: "s",
    HDR_MEMBER: "s",
    HDR_ERROR_NAME: "s",
    HDR_REPLY_SERIAL: "u",
    HDR_DESTINATION: "s",
    HDR_SENDER: "s",
    HDR_SIGNATURE: "g",
}

INTROSPECT_XML = """<!DOCTYPE node PUBLIC "-//freedesktop//DTD D-BUS Object Introspection 1.0//EN"
"http://www.freedesktop.org/standards/dbus/1.0/introspect.dtd">
<node>
  <interface name="org.freedesktop.DBus.Introspectable">
    <method name="Introspect">
      <arg name="xml_data" type="s" direction="out"/>
    </method>
  </interface>
  <interface name="org.freedesktop.DBus.Peer">
    <method name="Ping"/>
    <method name="GetMachineId">
      <arg name="machine_uuid" type="s" direction="out"/>
    </method>
  </interface>
  <interface name="org.freedesktop.DBus.Properties">
    <method name="Get">
      <arg name="interface_name" type="s" direction="in"/>
      <arg name="property_name" type="s" direction="in"/>
      <arg name="value" type="v" direction="out"/>
    </method>
    <method name="GetAll">
      <arg name="interface_name" type="s" direction="in"/>
      <arg name="properties" type="a{sv}" direction="out"/>
    </method>
    <method name="Set">
      <arg name="interface_name" type="s" direction="in"/>
      <arg name="property_name" type="s" direction="in"/>
      <arg name="value" type="v" direction="in"/>
    </method>
    <signal name="PropertiesChanged">
      <arg name="interface_name" type="s"/>
      <arg name="changed_properties" type="a{sv}"/>
      <arg name="invalidated_properties" type="as"/>
    </signal>
  </interface>
  <interface name="org.mpris.MediaPlayer2">
    <method name="Raise"/>
    <method name="Quit"/>
    <property name="CanQuit" type="b" access="read"/>
    <property name="Fullscreen" type="b" access="readwrite"/>
    <property name="CanSetFullscreen" type="b" access="read"/>
    <property name="CanRaise" type="b" access="read"/>
    <property name="HasTrackList" type="b" access="read"/>
    <property name="Identity" type="s" access="read"/>
    <property name="DesktopEntry" type="s" access="read"/>
    <property name="SupportedUriSchemes" type="as" access="read"/>
    <property name="SupportedMimeTypes" type="as" access="read"/>
  </interface>
  <interface name="org.mpris.MediaPlayer2.Player">
    <method name="Next"/>
    <method name="Previous"/>
    <method name="Pause"/>
    <method name="PlayPause"/>
    <method name="Stop"/>
    <method name="Play"/>
    <method name="Seek">
      <arg name="Offset" type="x" direction="in"/>
    </method>
    <method name="SetPosition">
      <arg name="TrackId" type="o" direction="in"/>
      <arg name="Position" type="x" direction="in"/>
    </method>
    <method name="OpenUri">
      <arg name="Uri" type="s" direction="in"/>
    </method>
    <signal name="Seeked">
      <arg name="Position" type="x"/>
    </signal>
    <property name="PlaybackStatus" type="s" access="read"/>
    <property name="LoopStatus" type="s" access="readwrite"/>
    <property name="Rate" type="d" access="readwrite"/>
    <property name="Shuffle" type="b" access="readwrite"/>
    <property name="Metadata" type="a{sv}" access="read"/>
    <property name="Volume" type="d" access="readwrite"/>
    <property name="Position" type="x" access="read"/>
    <property name="MinimumRate" type="d" access="read"/>
    <property name="MaximumRate" type="d" access="read"/>
    <property name="CanGoNext" type="b" access="read"/>
    <property name="CanGoPrevious" type="b" access="read"/>
    <property name="CanPlay" type="b" access="read"/>
    <property name="CanPause" type="b" access="read"/>
    <property name="CanSeek" type="b" access="read"/>
    <property name="CanControl" type="b" access="read"/>
  </interface>
</node>"""


def format_mpris_track_id(track_id: str | None) -> str:
    """Format a Spotify track ID into a valid D-Bus object path under /org/mpris/MediaPlayer2/Track/."""
    normalized = resilience.normalize_spotify_id(track_id)
    if not normalized:
        return NO_TRACK_PATH
    sanitized = re.sub(r"[^A-Za-z0-9_]", "_", normalized).strip("_")
    if not sanitized:
        return NO_TRACK_PATH
    return f"/org/mpris/MediaPlayer2/Track/{sanitized}"


def build_mpris_metadata(track_meta: dict | None, duration_ms: int = 0) -> dict[str, tuple[str, Any]]:
    """Build MPRIS2 Metadata a{sv} dict with mpris:length in microseconds and local file:// artUrl."""
    if not isinstance(track_meta, dict):
        return {"mpris:trackid": ("o", NO_TRACK_PATH)}
    raw_tid = track_meta.get("track_id") or track_meta.get("id")
    if not raw_tid:
        return {"mpris:trackid": ("o", NO_TRACK_PATH)}

    title = str(track_meta.get("name") or "Unknown")
    album = str(track_meta.get("album") or "")
    raw_artist = track_meta.get("artist") or "Unknown"
    if isinstance(raw_artist, list):
        artists = [str(a).strip() for a in raw_artist if str(a).strip()] or ["Unknown"]
    else:
        artists = [a.strip() for a in str(raw_artist).split(",") if a.strip()] or ["Unknown"]

    raw_dur = track_meta.get("duration_ms") or duration_ms or 0
    try:
        length_us = max(0, int(raw_dur)) * 1000
    except (TypeError, ValueError):
        length_us = 0

    meta: dict[str, tuple[str, Any]] = {
        "mpris:trackid": ("o", format_mpris_track_id(str(raw_tid))),
        "mpris:length": ("x", length_us),
        "xesam:title": ("s", title),
        "xesam:artist": ("as", artists),
        "xesam:album": ("s", album),
    }

    raw_art = track_meta.get("artwork_url") or track_meta.get("image_url") or ""
    art_url = images.get_cached_image_file_uri(str(raw_art)) if raw_art else ""
    if art_url:
        meta["mpris:artUrl"] = ("s", art_url)
    return meta


def _split_types(sig: str) -> list[str]:
    """Split a D-Bus signature string into top-level complete types."""
    types: list[str] = []
    i = 0
    n = len(sig)
    while i < n:
        c = sig[i]
        if c == "a":
            if i + 1 >= n:
                raise ValueError(f"Incomplete array signature: {sig}")
            if sig[i + 1] in ("(", "{"):
                close_c = ")" if sig[i + 1] == "(" else "}"
                open_c = sig[i + 1]
                depth = 0
                j = i + 1
                while j < n:
                    if sig[j] == open_c:
                        depth += 1
                    elif sig[j] == close_c:
                        depth -= 1
                        if depth == 0:
                            break
                    j += 1
                if depth != 0:
                    raise ValueError(f"Unclosed container in signature: {sig}")
                types.append(sig[i : j + 1])
                i = j + 1
            else:
                # Could be nested 'aa...' or single basic type
                sub_rest = _split_types(sig[i + 1 :])
                types.append("a" + sub_rest[0])
                i += 1 + len(sub_rest[0])
        elif c in ("(", "{"):
            close_c = ")" if c == "(" else "}"
            depth = 0
            j = i
            while j < n:
                if sig[j] == c:
                    depth += 1
                elif sig[j] == close_c:
                    depth -= 1
                    if depth == 0:
                        break
                j += 1
            if depth != 0:
                raise ValueError(f"Unclosed container in signature: {sig}")
            types.append(sig[i : j + 1])
            i = j + 1
        else:
            types.append(c)
            i += 1
    return types


def _type_alignment(sig: str) -> int:
    c = sig[0]
    if c in ("y", "g", "v"):
        return 1
    if c in ("b", "u", "i", "s", "o", "a"):
        return 4
    if c in ("x", "t", "d", "(", "{"):
        return 8
    raise ValueError(f"Unsupported D-Bus type: {sig}")


class DbusMarshaller:
    """Little-Endian ('l') D-Bus wire-protocol marshaller."""

    def __init__(self) -> None:
        self.buf = bytearray()

    def align(self, boundary: int) -> None:
        if boundary <= 1:
            return
        rem = len(self.buf) % boundary
        if rem:
            self.buf.extend(b"\x00" * (boundary - rem))

    def write(self, sig: str, value: Any) -> None:
        c = sig[0]
        if c == "y":
            self.buf.append(int(value) & 0xFF)
        elif c == "b":
            self.align(4)
            self.buf.extend(struct.pack("<I", 1 if value else 0))
        elif c == "u":
            self.align(4)
            self.buf.extend(struct.pack("<I", int(value)))
        elif c == "i":
            self.align(4)
            self.buf.extend(struct.pack("<i", int(value)))
        elif c == "x":
            self.align(8)
            self.buf.extend(struct.pack("<q", int(value)))
        elif c == "t":
            self.align(8)
            self.buf.extend(struct.pack("<Q", int(value)))
        elif c == "d":
            self.align(8)
            self.buf.extend(struct.pack("<d", float(value)))
        elif c in ("s", "o"):
            self.align(4)
            encoded = str(value).encode("utf-8")
            self.buf.extend(struct.pack("<I", len(encoded)))
            self.buf.extend(encoded)
            self.buf.append(0)
        elif c == "g":
            encoded = str(value).encode("ascii")
            if len(encoded) > 255:
                raise ValueError("D-Bus signature exceeds 255 bytes")
            self.buf.append(len(encoded))
            self.buf.extend(encoded)
            self.buf.append(0)
        elif c == "v":
            v_sig, v_val = value
            self.write("g", v_sig)
            self.write(v_sig, v_val)
        elif c == "a":
            elem_sig = sig[1:]
            elem_align = _type_alignment(elem_sig)
            self.align(4)
            len_pos = len(self.buf)
            self.buf.extend(b"\x00\x00\x00\x00")
            # Always align to element alignment after length, even if empty
            self.align(elem_align)
            data_start = len(self.buf)
            if elem_sig.startswith("{"):
                # Dict a{KV}
                inner = elem_sig[1:-1]
                k_sig, v_sig = _split_types(inner)
                items = value.items() if isinstance(value, dict) else value
                for k, v in items:
                    self.align(8)
                    self.write(k_sig, k)
                    self.write(v_sig, v)
            else:
                for item in value:
                    self.write(elem_sig, item)
            byte_len = len(self.buf) - data_start
            struct.pack_into("<I", self.buf, len_pos, byte_len)
        elif c == "(":
            self.align(8)
            inner_types = _split_types(sig[1:-1])
            for t, item in zip(inner_types, value):
                self.write(t, item)
        else:
            raise ValueError(f"Unsupported D-Bus signature: {sig}")

    def write_args(self, sig: str, args: list[Any] | tuple[Any, ...]) -> None:
        for t, v in zip(_split_types(sig), args):
            self.write(t, v)


class DbusUnmarshaller:
    """Little-Endian ('l') D-Bus wire-protocol unmarshaller."""

    def __init__(self, data: bytes, offset: int = 0) -> None:
        self.data = data
        self.pos = offset

    def align(self, boundary: int) -> None:
        if boundary <= 1:
            return
        rem = self.pos % boundary
        if rem:
            self.pos += boundary - rem

    def read(self, sig: str) -> Any:
        c = sig[0]
        if c == "y":
            if self.pos + 1 > len(self.data):
                raise ValueError("Truncated byte")
            val = self.data[self.pos]
            self.pos += 1
            return val
        if c == "b":
            self.align(4)
            (raw,) = struct.unpack_from("<I", self.data, self.pos)
            self.pos += 4
            return bool(raw)
        if c == "u":
            self.align(4)
            (val,) = struct.unpack_from("<I", self.data, self.pos)
            self.pos += 4
            return val
        if c == "i":
            self.align(4)
            (val,) = struct.unpack_from("<i", self.data, self.pos)
            self.pos += 4
            return val
        if c == "x":
            self.align(8)
            (val,) = struct.unpack_from("<q", self.data, self.pos)
            self.pos += 8
            return val
        if c == "t":
            self.align(8)
            (val,) = struct.unpack_from("<Q", self.data, self.pos)
            self.pos += 8
            return val
        if c == "d":
            self.align(8)
            (val,) = struct.unpack_from("<d", self.data, self.pos)
            self.pos += 8
            return val
        if c in ("s", "o"):
            self.align(4)
            (slen,) = struct.unpack_from("<I", self.data, self.pos)
            self.pos += 4
            end = self.pos + slen
            if end + 1 > len(self.data):
                raise ValueError("Truncated string")
            val = self.data[self.pos : end].decode("utf-8")
            self.pos = end + 1
            return val
        if c == "g":
            if self.pos + 1 > len(self.data):
                raise ValueError("Truncated signature")
            slen = self.data[self.pos]
            self.pos += 1
            end = self.pos + slen
            if end + 1 > len(self.data):
                raise ValueError("Truncated signature body")
            val = self.data[self.pos : end].decode("ascii")
            self.pos = end + 1
            return val
        if c == "v":
            v_sig = self.read("g")
            v_val = self.read(v_sig)
            return (v_sig, v_val)
        if c == "a":
            elem_sig = sig[1:]
            elem_align = _type_alignment(elem_sig)
            self.align(4)
            (byte_len,) = struct.unpack_from("<I", self.data, self.pos)
            self.pos += 4
            self.align(elem_align)
            end_pos = self.pos + byte_len
            if end_pos > len(self.data):
                raise ValueError("Truncated array")
            if elem_sig.startswith("{"):
                inner = elem_sig[1:-1]
                k_sig, v_sig = _split_types(inner)
                out_dict: dict[Any, Any] = {}
                while self.pos < end_pos:
                    self.align(8)
                    k = self.read(k_sig)
                    v = self.read(v_sig)
                    out_dict[k] = v
                return out_dict
            out_list: list[Any] = []
            while self.pos < end_pos:
                out_list.append(self.read(elem_sig))
            return out_list
        if c == "(":
            self.align(8)
            inner_types = _split_types(sig[1:-1])
            return tuple(self.read(t) for t in inner_types)
        raise ValueError(f"Unsupported D-Bus signature: {sig}")

    def read_args(self, sig: str) -> list[Any]:
        if not sig:
            return []
        return [self.read(t) for t in _split_types(sig)]


def pack_dbus_message(
    msg_type: int,
    serial: int,
    fields: dict[int, Any],
    signature: str = "",
    args: list[Any] | tuple[Any, ...] = (),
    flags: int = 0,
) -> bytes:
    """Pack a complete Little-Endian D-Bus wire message."""
    body_m = DbusMarshaller()
    if signature and args:
        body_m.write_args(signature, args)
    body_bytes = bytes(body_m.buf)

    hdr_fields = dict(fields)
    if signature:
        hdr_fields[HDR_SIGNATURE] = signature

    m = DbusMarshaller()
    m.write("y", ord("l"))
    m.write("y", msg_type)
    m.write("y", flags)
    m.write("y", 1)  # protocol version
    m.write("u", len(body_bytes))
    m.write("u", serial)

    # Header fields a(yv)
    m.align(4)
    len_pos = len(m.buf)
    m.buf.extend(b"\x00\x00\x00\x00")
    m.align(8)
    data_start = len(m.buf)
    for code, val in hdr_fields.items():
        m.align(8)
        m.write("y", code)
        m.write("v", (_HDR_TYPES[code], val))
    struct.pack_into("<I", m.buf, len_pos, len(m.buf) - data_start)

    # Header must end on an 8-byte boundary before body
    m.align(8)
    m.buf.extend(body_bytes)
    return bytes(m.buf)


def unpack_dbus_message(raw: bytes) -> dict[str, Any]:
    """Unpack a complete Little-Endian D-Bus wire message from raw bytes."""
    if len(raw) < 16:
        raise ValueError("D-Bus message shorter than 16-byte header")
    if raw[0] != ord("l"):
        raise ValueError(f"Unsupported D-Bus endianness: {raw[0]!r}")
    msg_type = raw[1]
    flags = raw[2]
    version = raw[3]
    if version != 1:
        raise ValueError(f"Unsupported D-Bus protocol version: {version}")
    body_len, serial, fields_len = struct.unpack_from("<III", raw, 4)
    if body_len > MAX_DBUS_BODY_BYTES:
        raise ValueError(f"D-Bus message body {body_len} exceeds MAX_DBUS_BODY_BYTES")

    u = DbusUnmarshaller(raw, offset=12)
    raw_fields = u.read("a(yv)")
    fields: dict[int, Any] = {}
    for code, variant in raw_fields:
        fields[code] = variant[1]
    u.align(8)
    sig = fields.get(HDR_SIGNATURE, "")
    args = u.read_args(sig) if body_len > 0 and sig else []
    return {
        "type": msg_type,
        "flags": flags,
        "serial": serial,
        "fields": fields,
        "signature": sig,
        "args": args,
    }


async def read_dbus_message_from_stream(reader: asyncio.StreamReader) -> dict[str, Any]:
    """Read and decode a single Little-Endian D-Bus wire message from an asyncio StreamReader."""
    fixed = await reader.readexactly(16)
    if fixed[0] != ord("l"):
        raise ValueError(f"Unsupported D-Bus endianness: {fixed[0]!r}")
    if fixed[3] != 1:
        raise ValueError(f"Unsupported D-Bus protocol version: {fixed[3]}")
    body_len, _serial, fields_len = struct.unpack_from("<III", fixed, 4)
    if body_len > MAX_DBUS_BODY_BYTES:
        raise ValueError(f"D-Bus body length {body_len} exceeds limit")
    if fields_len > MAX_DBUS_BODY_BYTES:
        raise ValueError(f"D-Bus header fields length {fields_len} exceeds limit")

    # Header after 16-byte prefix = fields_len + padding to 8-byte boundary
    fields_end = 16 + fields_len
    pad_len = (8 - (fields_end % 8)) % 8
    rest = await reader.readexactly(fields_len + pad_len + body_len)
    return unpack_dbus_message(fixed + rest)


class MprisDbusSession:
    """Pure-Python asyncio D-Bus session managing org.mpris.MediaPlayer2.deckify."""

    def __init__(
        self,
        reader: asyncio.StreamReader,
        writer: asyncio.StreamWriter,
        on_command: Callable[[dict[str, Any]], Any] | None = None,
        uid: int | None = None,
        machine_id: str = "deckify0000000000000000000000000",
    ) -> None:
        self.reader = reader
        self.writer = writer
        self.on_command = on_command
        self.uid = uid if uid is not None else (os.getuid() if hasattr(os, "getuid") else 1000)
        self.machine_id = machine_id
        self._serial = 1
        self._pending: dict[int, asyncio.Future] = {}
        self._write_lock = asyncio.Lock()
        self._reader_task: asyncio.Task | None = None
        self.unique_name: str = ""
        self.bus_registered: bool = False

        # MPRIS2 state
        self._playback_status: str = "Stopped"
        self._loop_status: str = "None"
        self._shuffle: bool = False
        self._volume: float = 1.0
        self._metadata: dict[str, tuple[str, Any]] = {"mpris:trackid": ("o", NO_TRACK_PATH)}
        self._position_us: int = 0
        self._position_anchor_mono: float = time.monotonic()

    def _next_serial(self) -> int:
        s = self._serial
        self._serial += 1
        return s

    async def _send_raw(self, data: bytes) -> None:
        async with self._write_lock:
            self.writer.write(data)
            await self.writer.drain()

    async def authenticate(self) -> None:
        """Perform D-Bus SASL EXTERNAL handshake over stream."""
        hex_uid = str(self.uid).encode("ascii").hex()
        self.writer.write(b"\x00AUTH EXTERNAL " + hex_uid.encode("ascii") + b"\r\n")
        await self.writer.drain()
        line = await self.reader.readline()
        if not line.startswith(b"OK "):
            raise RuntimeError(f"D-Bus SASL EXTERNAL auth failed: {line!r}")
        self.writer.write(b"BEGIN\r\n")
        await self.writer.drain()

    async def call_method(
        self,
        destination: str,
        path: str,
        interface: str,
        member: str,
        signature: str = "",
        args: list[Any] | tuple[Any, ...] = (),
        timeout: float = 5.0,
    ) -> list[Any]:
        serial = self._next_serial()
        loop = asyncio.get_running_loop()
        fut: asyncio.Future = loop.create_future()
        self._pending[serial] = fut
        msg = pack_dbus_message(
            MSG_METHOD_CALL,
            serial,
            {
                HDR_PATH: path,
                HDR_INTERFACE: interface,
                HDR_MEMBER: member,
                HDR_DESTINATION: destination,
            },
            signature=signature,
            args=args,
        )
        try:
            await self._send_raw(msg)
            return await asyncio.wait_for(fut, timeout=timeout)
        finally:
            self._pending.pop(serial, None)

    async def register(self) -> None:
        """Authenticate, start reader loop, call Hello, and RequestName for MPRIS_BUS_NAME."""
        await self.authenticate()
        self._reader_task = asyncio.create_task(self.run())
        hello_res = await self.call_method(
            DBUS_IFACE, DBUS_OBJECT_PATH, DBUS_IFACE, "Hello"
        )
        self.unique_name = str(hello_res[0]) if hello_res else ""
        # Flags: ALLOW_REPLACEMENT (1) | REPLACE_EXISTING (2) | DO_NOT_QUEUE (4) = 0x7
        req_res = await self.call_method(
            DBUS_IFACE,
            DBUS_OBJECT_PATH,
            DBUS_IFACE,
            "RequestName",
            signature="su",
            args=[MPRIS_BUS_NAME, 0x7],
        )
        reply_code = req_res[0] if req_res else 0
        # 1 = PRIMARY_OWNER, 4 = ALREADY_OWNER
        if reply_code not in (1, 4):
            raise RuntimeError(f"RequestName({MPRIS_BUS_NAME}) returned code {reply_code}")
        self.bus_registered = True

    def get_position_us(self) -> int:
        if self._playback_status == "Playing":
            elapsed_us = max(0, int((time.monotonic() - self._position_anchor_mono) * 1_000_000))
            return self._position_us + elapsed_us
        return self._position_us

    def update_position_anchor(self, position_us: int) -> None:
        self._position_us = max(0, int(position_us))
        self._position_anchor_mono = time.monotonic()

    def get_root_properties(self) -> dict[str, tuple[str, Any]]:
        return {
            "CanQuit": ("b", False),
            "Fullscreen": ("b", False),
            "CanSetFullscreen": ("b", False),
            "CanRaise": ("b", False),
            "HasTrackList": ("b", False),
            "Identity": ("s", "Deckify"),
            "DesktopEntry": ("s", "deckify"),
            "SupportedUriSchemes": ("as", ["spotify"]),
            "SupportedMimeTypes": ("as", ["x-scheme-handler/spotify"]),
        }

    def get_player_properties(self) -> dict[str, tuple[str, Any]]:
        has_track = self._metadata.get("mpris:trackid", ("o", NO_TRACK_PATH))[1] != NO_TRACK_PATH
        can_control = True
        return {
            "PlaybackStatus": ("s", self._playback_status),
            "LoopStatus": ("s", self._loop_status),
            "Rate": ("d", 1.0),
            "Shuffle": ("b", self._shuffle),
            "Metadata": ("a{sv}", self._metadata),
            "Volume": ("d", self._volume),
            "Position": ("x", self.get_position_us()),
            "MinimumRate": ("d", 1.0),
            "MaximumRate": ("d", 1.0),
            "CanGoNext": ("b", True),
            "CanGoPrevious": ("b", True),
            "CanPlay": ("b", True),
            "CanPause": ("b", True),
            "CanSeek": ("b", has_track),
            "CanControl": ("b", can_control),
        }

    async def emit_properties_changed(
        self,
        changed_props: dict[str, tuple[str, Any]],
        invalidated: list[str] | None = None,
    ) -> None:
        if not changed_props and not invalidated:
            return
        msg = pack_dbus_message(
            MSG_SIGNAL,
            self._next_serial(),
            {
                HDR_PATH: MPRIS_OBJECT_PATH,
                HDR_INTERFACE: DBUS_PROPERTIES_IFACE,
                HDR_MEMBER: "PropertiesChanged",
            },
            signature="sa{sv}as",
            args=[MPRIS_PLAYER_IFACE, changed_props, invalidated or []],
        )
        await self._send_raw(msg)

    async def emit_seeked(self, position_us: int) -> None:
        self.update_position_anchor(position_us)
        msg = pack_dbus_message(
            MSG_SIGNAL,
            self._next_serial(),
            {
                HDR_PATH: MPRIS_OBJECT_PATH,
                HDR_INTERFACE: MPRIS_PLAYER_IFACE,
                HDR_MEMBER: "Seeked",
            },
            signature="x",
            args=[max(0, int(position_us))],
        )
        await self._send_raw(msg)

    async def _send_reply(
        self,
        reply_serial: int,
        destination: str | None,
        signature: str = "",
        args: list[Any] | tuple[Any, ...] = (),
    ) -> None:
        fields: dict[int, Any] = {HDR_REPLY_SERIAL: reply_serial}
        if destination:
            fields[HDR_DESTINATION] = destination
        msg = pack_dbus_message(
            MSG_METHOD_RETURN,
            self._next_serial(),
            fields,
            signature=signature,
            args=args,
        )
        await self._send_raw(msg)

    async def _send_error(
        self,
        reply_serial: int,
        destination: str | None,
        error_name: str,
        error_message: str,
    ) -> None:
        fields: dict[int, Any] = {
            HDR_ERROR_NAME: error_name,
            HDR_REPLY_SERIAL: reply_serial,
        }
        if destination:
            fields[HDR_DESTINATION] = destination
        msg = pack_dbus_message(
            MSG_ERROR,
            self._next_serial(),
            fields,
            signature="s",
            args=[error_message],
        )
        await self._send_raw(msg)

    async def _dispatch_command(self, cmd: dict[str, Any]) -> None:
        if not self.on_command:
            return
        res = self.on_command(cmd)
        if asyncio.iscoroutine(res):
            await res

    async def _handle_method_call(self, msg: dict[str, Any]) -> None:
        fields = msg["fields"]
        serial = msg["serial"]
        no_reply = bool(msg["flags"] & FLAG_NO_REPLY_EXPECTED)
        sender = fields.get(HDR_SENDER)
        path = fields.get(HDR_PATH, "")
        iface = fields.get(HDR_INTERFACE, "")
        member = fields.get(HDR_MEMBER, "")
        args = msg["args"]

        if path != MPRIS_OBJECT_PATH:
            if not no_reply:
                await self._send_error(
                    serial, sender, "org.freedesktop.DBus.Error.UnknownObject", f"Unknown object: {path}"
                )
            return

        try:
            if iface == DBUS_PEER_IFACE:
                if member == "Ping":
                    if not no_reply:
                        await self._send_reply(serial, sender)
                    return
                if member == "GetMachineId":
                    if not no_reply:
                        await self._send_reply(serial, sender, "s", [self.machine_id])
                    return

            if iface == DBUS_INTROSPECTABLE_IFACE and member == "Introspect":
                if not no_reply:
                    await self._send_reply(serial, sender, "s", [INTROSPECT_XML])
                return

            if iface == DBUS_PROPERTIES_IFACE:
                if member == "Get":
                    if len(args) != 2:
                        raise ValueError("Properties.Get expects (iface, prop)")
                    target_iface, prop_name = str(args[0]), str(args[1])
                    if target_iface == MPRIS_ROOT_IFACE:
                        props = self.get_root_properties()
                    elif target_iface == MPRIS_PLAYER_IFACE:
                        props = self.get_player_properties()
                    else:
                        if not no_reply:
                            await self._send_error(
                                serial, sender, "org.freedesktop.DBus.Error.InvalidArgs", f"Unknown interface: {target_iface}"
                            )
                        return
                    if prop_name not in props:
                        if not no_reply:
                            await self._send_error(
                                serial, sender, "org.freedesktop.DBus.Error.InvalidArgs", f"Unknown property: {prop_name}"
                            )
                        return
                    if not no_reply:
                        await self._send_reply(serial, sender, "v", [props[prop_name]])
                    return

                if member == "GetAll":
                    if len(args) != 1:
                        raise ValueError("Properties.GetAll expects (iface)")
                    target_iface = str(args[0])
                    if target_iface == MPRIS_ROOT_IFACE:
                        props = self.get_root_properties()
                    elif target_iface == MPRIS_PLAYER_IFACE:
                        props = self.get_player_properties()
                    elif target_iface == "":
                        props = {**self.get_root_properties(), **self.get_player_properties()}
                    else:
                        if not no_reply:
                            await self._send_error(
                                serial, sender, "org.freedesktop.DBus.Error.InvalidArgs", f"Unknown interface: {target_iface}"
                            )
                        return
                    if not no_reply:
                        await self._send_reply(serial, sender, "a{sv}", [props])
                    return

                if member == "Set":
                    if len(args) != 3:
                        raise ValueError("Properties.Set expects (iface, prop, value)")
                    target_iface, prop_name, variant = str(args[0]), str(args[1]), args[2]
                    val = variant[1] if isinstance(variant, tuple) and len(variant) == 2 else variant
                    if target_iface == MPRIS_ROOT_IFACE and prop_name == "Fullscreen":
                        if not no_reply:
                            await self._send_reply(serial, sender)
                        return
                    if target_iface != MPRIS_PLAYER_IFACE:
                        if not no_reply:
                            await self._send_error(
                                serial, sender, "org.freedesktop.DBus.Error.InvalidArgs", f"Unknown interface: {target_iface}"
                            )
                        return
                    if prop_name == "Volume":
                        vol = max(0.0, min(1.0, float(val)))
                        self._volume = vol
                        await self._dispatch_command({"type": "set_property", "property": "Volume", "value": vol})
                    elif prop_name == "Shuffle":
                        shuf = bool(val)
                        self._shuffle = shuf
                        await self._dispatch_command({"type": "set_property", "property": "Shuffle", "value": shuf})
                    elif prop_name == "LoopStatus":
                        loop_s = str(val)
                        if loop_s not in ("None", "Track", "Playlist"):
                            raise ValueError(f"Invalid LoopStatus: {loop_s}")
                        self._loop_status = loop_s
                        await self._dispatch_command({"type": "set_property", "property": "LoopStatus", "value": loop_s})
                    elif prop_name == "Rate":
                        pass
                    else:
                        if not no_reply:
                            await self._send_error(
                                serial, sender, "org.freedesktop.DBus.Error.PropertyReadOnly", f"Property not writable: {prop_name}"
                            )
                        return
                    if not no_reply:
                        await self._send_reply(serial, sender)
                    return

            if iface == MPRIS_ROOT_IFACE and member in ("Raise", "Quit"):
                if not no_reply:
                    await self._send_reply(serial, sender)
                return

            if iface == MPRIS_PLAYER_IFACE:
                if member in ("Play", "Pause", "PlayPause", "Stop", "Next", "Previous"):
                    await self._dispatch_command({"type": "method", "method": member})
                    if not no_reply:
                        await self._send_reply(serial, sender)
                    return
                if member == "Seek":
                    if len(args) != 1:
                        raise ValueError("Seek expects (Offset)")
                    await self._dispatch_command({"type": "method", "method": "Seek", "offset_us": int(args[0])})
                    if not no_reply:
                        await self._send_reply(serial, sender)
                    return
                if member == "SetPosition":
                    if len(args) != 2:
                        raise ValueError("SetPosition expects (TrackId, Position)")
                    await self._dispatch_command(
                        {
                            "type": "method",
                            "method": "SetPosition",
                            "track_id": str(args[0]),
                            "position_us": int(args[1]),
                        }
                    )
                    if not no_reply:
                        await self._send_reply(serial, sender)
                    return
                if member == "OpenUri":
                    if len(args) != 1:
                        raise ValueError("OpenUri expects (Uri)")
                    await self._dispatch_command({"type": "method", "method": "OpenUri", "uri": str(args[0])})
                    if not no_reply:
                        await self._send_reply(serial, sender)
                    return

            if not no_reply:
                await self._send_error(
                    serial, sender, "org.freedesktop.DBus.Error.UnknownMethod", f"Unknown method: {iface}.{member}"
                )
        except (struct.error, ValueError, TypeError) as e:
            if not no_reply:
                await self._send_error(serial, sender, "org.freedesktop.DBus.Error.InvalidArgs", str(e))
        except Exception as e:
            decky.logger.error(f"MprisDbusSession error handling {iface}.{member}: {e}")
            if not no_reply:
                await self._send_error(serial, sender, "org.freedesktop.DBus.Error.Failed", str(e))

    async def run(self) -> None:
        """Read and dispatch D-Bus messages until stream EOF or cancellation."""
        try:
            while True:
                try:
                    msg = await read_dbus_message_from_stream(self.reader)
                except asyncio.IncompleteReadError:
                    break
                except (struct.error, ValueError) as e:
                    decky.logger.warning(f"MprisDbusSession malformed frame: {e}")
                    continue

                mtype = msg["type"]
                if mtype == MSG_METHOD_RETURN:
                    rserial = msg["fields"].get(HDR_REPLY_SERIAL)
                    fut = self._pending.get(rserial)
                    if fut and not fut.done():
                        fut.set_result(msg["args"])
                elif mtype == MSG_ERROR:
                    rserial = msg["fields"].get(HDR_REPLY_SERIAL)
                    fut = self._pending.get(rserial)
                    if fut and not fut.done():
                        err_name = msg["fields"].get(HDR_ERROR_NAME, "org.freedesktop.DBus.Error.Failed")
                        err_msg = msg["args"][0] if msg["args"] else err_name
                        fut.set_exception(RuntimeError(f"{err_name}: {err_msg}"))
                elif mtype == MSG_METHOD_CALL:
                    await self._handle_method_call(msg)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            decky.logger.error(f"MprisDbusSession reader loop exited: {e}")
        finally:
            self.bus_registered = False
            for fut in self._pending.values():
                if not fut.done():
                    fut.set_exception(ConnectionError("D-Bus session closed"))

    async def close(self) -> None:
        self.bus_registered = False
        if self._reader_task and not self._reader_task.done():
            self._reader_task.cancel()
            try:
                await self._reader_task
            except (asyncio.CancelledError, Exception):
                pass
        try:
            self.writer.close()
        except Exception:
            pass


_VALID_SPOTIFY_URI_TYPES = ("track", "album", "playlist", "artist", "episode", "show")


def _parse_spotify_open_uri(raw_uri: str) -> str | None:
    """Validate and normalize an OpenUri string to a canonical spotify:<type>:<id> URI."""
    if not raw_uri or not isinstance(raw_uri, str):
        return None
    uri = raw_uri.strip()
    if uri.startswith("https://open.spotify.com/"):
        parsed = urllib.parse.urlsplit(uri)
        parts = [p for p in parsed.path.split("/") if p]
        if len(parts) >= 2 and parts[0] in _VALID_SPOTIFY_URI_TYPES:
            item_id = parts[1].strip()
            if re.fullmatch(r"[A-Za-z0-9]+", item_id):
                return f"spotify:{parts[0]}:{item_id}"
        return None
    if uri.startswith("spotify:"):
        parts = uri.split(":")
        if len(parts) == 3 and parts[1] in _VALID_SPOTIFY_URI_TYPES:
            item_id = parts[2].strip()
            if re.fullmatch(r"[A-Za-z0-9]+", item_id):
                return uri
    return None


def _parse_unix_bus_socket(address: str) -> str | None:
    """Extract unix:path=/run/user/1000/bus socket path from DBUS_SESSION_BUS_ADDRESS."""
    if not address or "unix:path=" not in address:
        return None
    for part in address.split(";"):
        if part.startswith("unix:path="):
            return part.split("unix:path=", 1)[1].split(",", 1)[0].strip()
    return None


class MprisBridge:
    """High-level MPRIS2 bridge coordinating D-Bus session, mpris-proxy, and Plugin playback."""

    def __init__(self, plugin: Any) -> None:
        self._plugin = plugin
        self._running: bool = False
        self._bus_registered: bool = False
        self._proxy_running: bool = False
        self._proxy_managed: bool = False
        self._proxy_available: bool = False
        self._worker_proc: asyncio.subprocess.Process | None = None
        self._worker_reader_task: asyncio.Task | None = None
        self._proxy_proc: subprocess.Popen | None = None
        self._session: MprisDbusSession | None = None
        self._last_emitted_snapshot: dict[str, tuple[str, Any]] | None = None
        self._last_emitted_metadata: dict[str, tuple[str, Any]] = {"mpris:trackid": ("o", NO_TRACK_PATH)}
        self._pos_ms: int = 0
        self._pos_anchor_mono: float = time.monotonic()

    def get_status_dict(self) -> dict[str, Any]:
        enabled = bool(getattr(self._plugin, "_settings", {}).get("mpris_enabled", True))
        if not enabled:
            status_badge = "disabled"
        elif self._bus_registered and self._proxy_running:
            status_badge = "active"
        else:
            status_badge = "proxy_unavailable"
        return {
            "enabled": enabled,
            "bus_registered": self._bus_registered,
            "proxy_running": self._proxy_running,
            "proxy_managed": self._proxy_managed,
            "proxy_available": self._proxy_available,
            "status": status_badge,
            "bus_name": MPRIS_BUS_NAME,
        }

    async def _emit_status(self) -> None:
        try:
            await decky.emit("mpris_status", self.get_status_dict())
        except Exception as e:
            decky.logger.debug("MprisBridge._emit_status error: %s", e)

    def get_current_position_ms(self) -> int:
        if getattr(self._plugin, "_poll_play_state", None) == "playing":
            elapsed_ms = max(0, int((time.monotonic() - self._pos_anchor_mono) * 1000))
            return self._pos_ms + elapsed_ms
        return self._pos_ms

    async def start(self) -> None:
        if not getattr(self._plugin, "_settings", {}).get("mpris_enabled", True):
            self._running = False
            self._bus_registered = False
            self._proxy_running = False
            self._proxy_managed = False
            await self._emit_status()
            return

        if self._running:
            await self._emit_status()
            return

        self._running = True
        self._last_emitted_snapshot = None

        if hasattr(os, "geteuid") and os.geteuid() == 0:
            await self._start_worker()
        else:
            await self._start_inprocess_session()

        await self._ensure_mpris_proxy()
        await self.sync_from_plugin()
        await self._emit_status()

    async def _start_worker(self) -> None:
        try:
            cmd, env = _build_deck_command(["python3", os.path.abspath(__file__), "--worker"])
            env.pop("LD_LIBRARY_PATH", None)
            self._worker_proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL,
                env=env,
            )
            if self._worker_proc.stdout is not None:
                try:
                    raw_line = await asyncio.wait_for(self._worker_proc.stdout.readline(), timeout=5.0)
                    if raw_line:
                        info = json.loads(raw_line.decode("utf-8").strip())
                        self._bus_registered = bool(info.get("ok"))
                except Exception as e:
                    decky.logger.warning("MPRIS worker handshake failed: %s", e)
                    self._bus_registered = False
                self._worker_reader_task = asyncio.create_task(self._read_worker_loop())
        except Exception as e:
            decky.logger.warning("Failed to spawn MPRIS UID 1000 worker: %s", e)
            self._bus_registered = False

    async def _read_worker_loop(self) -> None:
        assert self._worker_proc is not None and self._worker_proc.stdout is not None
        try:
            while True:
                line = await self._worker_proc.stdout.readline()
                if not line:
                    break
                try:
                    msg = json.loads(line.decode("utf-8").strip())
                except Exception:
                    continue
                if msg.get("type") in ("method", "set_property"):
                    await self.handle_dbus_command(msg)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            decky.logger.debug("MPRIS worker reader exited: %s", e)
        finally:
            self._bus_registered = False

    async def _start_inprocess_session(self) -> None:
        sock_path = _parse_unix_bus_socket(
            os.environ.get("DBUS_SESSION_BUS_ADDRESS", DBUS_SESSION_BUS_ADDRESS)
        )
        if not sock_path or not os.path.exists(sock_path) or not hasattr(asyncio, "open_unix_connection"):
            self._bus_registered = False
            return
        try:
            reader, writer = await asyncio.open_unix_connection(sock_path)
            session = MprisDbusSession(reader, writer, on_command=self.handle_dbus_command)
            await session.register()
            self._session = session
            self._bus_registered = session.bus_registered
        except Exception as e:
            decky.logger.warning("In-process MPRIS D-Bus session failed: %s", e)
            self._bus_registered = False

    async def stop(self) -> None:
        self._running = False
        self._bus_registered = False
        if self._worker_reader_task and not self._worker_reader_task.done():
            self._worker_reader_task.cancel()
            try:
                await self._worker_reader_task
            except (asyncio.CancelledError, Exception):
                pass
            self._worker_reader_task = None
        if self._worker_proc is not None:
            try:
                if self._worker_proc.stdin:
                    self._worker_proc.stdin.close()
                self._worker_proc.terminate()
                await asyncio.wait_for(self._worker_proc.wait(), timeout=2.0)
            except Exception:
                try:
                    self._worker_proc.kill()
                except Exception:
                    pass
            self._worker_proc = None
        if self._session is not None:
            await self._session.close()
            self._session = None
        await self._stop_mpris_proxy()
        await self._emit_status()

    async def _ensure_mpris_proxy(self) -> None:
        mpris_proxy_bin = shutil.which("mpris-proxy") or (
            "/usr/bin/mpris-proxy" if os.path.isfile("/usr/bin/mpris-proxy") else None
        )
        self._proxy_available = bool(mpris_proxy_bin)
        try:
            pgrep_cmd, pgrep_env = _build_deck_command(["pgrep", "-u", DECK_USER, "-x", "mpris-proxy"])
            pgrep_env.pop("LD_LIBRARY_PATH", None)
            res = await _exec(
                lambda: subprocess.run(pgrep_cmd, capture_output=True, text=True, env=pgrep_env),
                timeout=3,
            )
            if res is not None and res.returncode == 0:
                self._proxy_running = True
                self._proxy_managed = False
                return
        except Exception:
            pass

        auto_proxy = bool(getattr(self._plugin, "_settings", {}).get("mpris_auto_proxy", True))
        if auto_proxy and mpris_proxy_bin:
            try:
                cmd, env = _build_deck_command([mpris_proxy_bin])
                env.pop("LD_LIBRARY_PATH", None)
                proc = subprocess.Popen(
                    cmd, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
                )
                self._proxy_proc = proc
                self._proxy_running = True
                self._proxy_managed = True
                return
            except Exception as e:
                decky.logger.warning("Failed to spawn mpris-proxy: %s", e)

        self._proxy_running = False
        self._proxy_managed = False

    async def _stop_mpris_proxy(self) -> None:
        if self._proxy_proc is not None:
            try:
                self._proxy_proc.terminate()
                self._proxy_proc.wait(timeout=2.0)
            except Exception:
                try:
                    self._proxy_proc.kill()
                except Exception:
                    pass
            self._proxy_proc = None
        self._proxy_running = False
        self._proxy_managed = False

    async def on_settings_changed(self, key: str, value: Any) -> None:
        if key == "mpris_enabled":
            if bool(value):
                await self.start()
            else:
                await self.stop()
        elif key == "mpris_auto_proxy":
            if getattr(self._plugin, "_settings", {}).get("mpris_enabled", True):
                if bool(value):
                    await self._ensure_mpris_proxy()
                else:
                    await self._stop_mpris_proxy()
            await self._emit_status()

    async def handle_dbus_command(self, cmd: dict[str, Any]) -> None:
        ctype = cmd.get("type")
        if ctype == "method":
            method = cmd.get("method")
            if method == "Play":
                await self._plugin.control_playback("play")
            elif method == "Pause":
                await self._plugin.control_playback("pause")
            elif method == "PlayPause":
                await self._plugin.control_playback("play_pause")
            elif method == "Stop":
                await self._plugin.control_playback("pause")
            elif method == "Next":
                await self._plugin.control_playback("next")
            elif method == "Previous":
                await self._plugin.control_playback("previous")
            elif method == "Seek":
                offset_us = int(cmd.get("offset_us", 0))
                current_ms = self.get_current_position_ms()
                target_ms = max(0, current_ms + int(offset_us // 1000))
                duration_ms = int(getattr(self._plugin, "_poll_duration_ms", 0) or 0)
                if duration_ms > 0 and target_ms > duration_ms:
                    await self._plugin.control_playback("next")
                else:
                    await self._plugin.seek_playback(target_ms)
                    await self.notify_seeked(target_ms)
            elif method == "SetPosition":
                track_id_path = str(cmd.get("track_id", ""))
                pos_us = int(cmd.get("position_us", 0))
                cur_tid = getattr(self._plugin, "_poll_track_id", None) or (
                    getattr(self._plugin, "_track_meta", None) or {}
                ).get("track_id")
                expected_path = format_mpris_track_id(cur_tid)
                duration_ms = int(getattr(self._plugin, "_poll_duration_ms", 0) or 0)
                if track_id_path == expected_path and 0 <= pos_us <= max(0, duration_ms * 1000):
                    pos_ms = int(pos_us // 1000)
                    await self._plugin.seek_playback(pos_ms)
                    await self.notify_seeked(pos_ms)
            elif method == "OpenUri":
                spotify_uri = _parse_spotify_open_uri(str(cmd.get("uri", "")))
                if not spotify_uri:
                    return
                if spotify_uri.startswith(("spotify:track:", "spotify:episode:")):
                    await self._plugin.play_tracks(uris=[spotify_uri])
                else:
                    await self._plugin.play_tracks(context_uri=spotify_uri)
        elif ctype == "set_property":
            prop = cmd.get("property")
            val = cmd.get("value")
            if prop == "Volume":
                clamped = max(0.0, min(1.0, float(val)))
                target_pct = max(0, min(100, int(round(clamped * 100))))
                fader = getattr(self._plugin, "_volume_fader", None)
                if fader is not None and getattr(fader, "_sleep_locked", False):
                    return
                self._plugin._poll_volume = target_pct
                await self._plugin.set_volume(target_pct)
                if fader is not None and fader.is_ducked:
                    target_sink_vol = fader._compute_target_sink_volume()
                    await fader.fade_to(target_sink_vol, 0.15)
            elif prop == "Shuffle":
                shuf = bool(val)
                self._plugin._shuffle_state = shuf
                await self._plugin.set_shuffle(shuf)
                await self.sync_from_plugin()
            elif prop == "LoopStatus":
                loop_s = str(val)
                if loop_s in ("None", "Track", "Playlist"):
                    mapped = {"None": "off", "Track": "track", "Playlist": "context"}[loop_s]
                    self._plugin._repeat_state = mapped
                    await self._plugin.set_repeat(mapped)
                    await self.sync_from_plugin()

    async def on_onevent(self, event_dict: dict[str, Any]) -> None:
        if "position_ms" in event_dict:
            self._pos_ms = max(0, int(event_dict["position_ms"] or 0))
            self._pos_anchor_mono = time.monotonic()
        elif event_dict.get("event") in ("playing", "paused"):
            self._pos_ms = max(0, int(getattr(self._plugin, "_poll_progress_ms", 0) or 0))
            self._pos_anchor_mono = time.monotonic()
        if event_dict.get("event") == "seeked" and "position_ms" in event_dict:
            await self.notify_seeked(int(event_dict["position_ms"] or 0))
        await self.sync_from_plugin()

    async def notify_seeked(self, position_ms: int) -> None:
        pos_ms = max(0, int(position_ms))
        self._pos_ms = pos_ms
        self._pos_anchor_mono = time.monotonic()
        pos_us = pos_ms * 1000
        if self._session is not None:
            await self._session.emit_seeked(pos_us)
        elif self._worker_proc is not None and self._worker_proc.stdin is not None:
            try:
                payload = json.dumps({"type": "seeked", "position_us": pos_us}) + "\n"
                self._worker_proc.stdin.write(payload.encode("utf-8"))
                await self._worker_proc.stdin.drain()
            except Exception:
                pass

    async def sync_from_plugin(self) -> None:
        play_state = getattr(self._plugin, "_poll_play_state", None)
        if play_state == "playing":
            playback_status = "Playing"
        elif play_state == "paused":
            playback_status = "Paused"
        else:
            playback_status = "Stopped"

        repeat_state = getattr(self._plugin, "_repeat_state", "off")
        loop_status = {"off": "None", "track": "Track", "context": "Playlist"}.get(repeat_state, "None")
        shuffle = bool(getattr(self._plugin, "_shuffle_state", False))
        raw_vol = getattr(self._plugin, "_poll_volume", None)
        vol_pct = 100.0 if raw_vol is None else float(raw_vol)
        volume = max(0.0, min(1.0, vol_pct / 100.0))

        self._pos_ms = max(0, int(getattr(self._plugin, "_poll_progress_ms", 0) or 0))
        self._pos_anchor_mono = time.monotonic()

        track_meta = getattr(self._plugin, "_track_meta", None)
        poll_tid = resilience.normalize_spotify_id(getattr(self._plugin, "_poll_track_id", None))
        meta_tid = resilience.normalize_spotify_id(
            (track_meta or {}).get("track_id") or (track_meta or {}).get("id")
        )
        last_ev = getattr(self._plugin, "_last_event", None) or {}
        last_ev_tid = resilience.normalize_spotify_id(last_ev.get("track_id"))

        if playback_status == "Stopped":
            metadata: dict[str, tuple[str, Any]] = {"mpris:trackid": ("o", NO_TRACK_PATH)}
        elif (
            track_meta
            and meta_tid
            and (not last_ev_tid or meta_tid == last_ev_tid)
            and (not poll_tid or meta_tid == poll_tid)
        ):
            metadata = build_mpris_metadata(track_meta, getattr(self._plugin, "_poll_duration_ms", 0) or 0)
        else:
            metadata = dict(self._last_emitted_metadata)

        self._last_emitted_metadata = metadata

        snapshot: dict[str, tuple[str, Any]] = {
            "PlaybackStatus": ("s", playback_status),
            "LoopStatus": ("s", loop_status),
            "Shuffle": ("b", shuffle),
            "Volume": ("d", volume),
            "Metadata": ("a{sv}", metadata),
        }

        if self._last_emitted_snapshot is None:
            changed = dict(snapshot)
        else:
            changed = {k: v for k, v in snapshot.items() if self._last_emitted_snapshot.get(k) != v}
        self._last_emitted_snapshot = dict(snapshot)

        if self._session is not None:
            self._session._playback_status = playback_status
            self._session._loop_status = loop_status
            self._session._shuffle = shuffle
            self._session._volume = volume
            self._session._metadata = metadata
            self._session.update_position_anchor(self._pos_ms * 1000)
            if changed:
                await self._session.emit_properties_changed(changed)
        elif self._worker_proc is not None and self._worker_proc.stdin is not None:
            if changed:
                try:
                    payload = json.dumps(
                        {
                            "type": "state",
                            "snapshot": snapshot,
                            "changed": changed,
                            "position_us": self._pos_ms * 1000,
                        }
                    ) + "\n"
                    self._worker_proc.stdin.write(payload.encode("utf-8"))
                    await self._worker_proc.stdin.drain()
                except Exception:
                    pass


async def _run_worker_main() -> None:
    """UID 1000 D-Bus worker loop exchanging JSON lines over stdin/stdout."""
    addr = os.environ.get("DBUS_SESSION_BUS_ADDRESS", DBUS_SESSION_BUS_ADDRESS)
    sock_path = _parse_unix_bus_socket(addr) or "/run/user/1000/bus"

    async def _on_cmd(cmd: dict[str, Any]) -> None:
        sys.stdout.write(json.dumps(cmd) + "\n")
        sys.stdout.flush()

    try:
        reader, writer = await asyncio.open_unix_connection(sock_path)
        session = MprisDbusSession(reader, writer, on_command=_on_cmd)
        await session.register()
        sys.stdout.write(json.dumps({"type": "registered", "ok": True}) + "\n")
        sys.stdout.flush()
    except Exception as e:
        sys.stdout.write(json.dumps({"type": "registered", "ok": False, "error": str(e)}) + "\n")
        sys.stdout.flush()
        return

    loop = asyncio.get_running_loop()
    try:
        while True:
            line = await loop.run_in_executor(None, sys.stdin.readline)
            if not line:
                break
            try:
                msg = json.loads(line.strip())
            except Exception:
                continue
            mtype = msg.get("type")
            if mtype == "seeked":
                await session.emit_seeked(int(msg.get("position_us", 0)))
            elif mtype == "state":
                snap = msg.get("snapshot") or {}
                if "PlaybackStatus" in snap:
                    session._playback_status = str(snap["PlaybackStatus"][1])
                if "LoopStatus" in snap:
                    session._loop_status = str(snap["LoopStatus"][1])
                if "Shuffle" in snap:
                    session._shuffle = bool(snap["Shuffle"][1])
                if "Volume" in snap:
                    session._volume = float(snap["Volume"][1])
                if "Metadata" in snap:
                    raw_meta = snap["Metadata"][1]
                    session._metadata = {k: (v[0], v[1]) for k, v in raw_meta.items()}
                session.update_position_anchor(int(msg.get("position_us", 0)))
                raw_changed = msg.get("changed") or {}
                if raw_changed:
                    changed_props = {
                        k: (
                            v[0],
                            {mk: (mv[0], mv[1]) for mk, mv in v[1].items()} if v[0] == "a{sv}" else v[1],
                        )
                        for k, v in raw_changed.items()
                    }
                    await session.emit_properties_changed(changed_props)
    finally:
        await session.close()


if __name__ == "__main__" and "--worker" in sys.argv:
    asyncio.run(_run_worker_main())
