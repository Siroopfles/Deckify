"""Pure-Python stdlib passive hidraw + evdev controller input watcher.

Reads Valve Steam Deck / Steam Controller 2026 (Triton) HID reports from
``/dev/hidraw*`` and fallback/third-party gamepads from ``/dev/input/event*``
strictly read-only (``os.O_RDONLY | O_NONBLOCK``, never ``EVIOCGRAB``) so
game and SteamOS input is never blocked or starved.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
import glob
import inspect
import os
import re
import struct
import time
from typing import Awaitable, Callable

VALVE_VENDOR_ID = 0x28DE
DECK_PRODUCT_ID = 0x1205
TRITON_PRODUCT_IDS = frozenset({0x1302, 0x1303, 0x1304, 0x1305})
VIRTUAL_PAD_PRODUCT_ID = 0x11FF

DEDUP_WINDOW_SECONDS = 0.030
RESCAN_INTERVAL_SECONDS = 5.0

# Mapping from Valve HID buttons_0 bit index -> Deckify GAMEPAD_BUTTON ID (1..28)
VALVE_B0_BITS: dict[int, int] = {
    0: 8,   # R2
    1: 7,   # L2
    2: 6,   # R1
    3: 5,   # L1
    4: 4,   # Y
    5: 2,   # B
    6: 3,   # X
    7: 1,   # A
    8: 9,   # D-pad Up
    9: 12,  # D-pad Right
    10: 11, # D-pad Left
    11: 10, # D-pad Down
    12: 13, # Select
    13: 27, # STEAM
    14: 14, # Start
    15: 24, # L5
    16: 26, # R5
    17: 20, # LPad Click
    18: 22, # RPad Click
    19: 19, # LPad Touch
    20: 21, # RPad Touch
    22: 15, # L3
    26: 16, # R3
}

# Mapping from Valve HID buttons_1 bit index -> Deckify GAMEPAD_BUTTON ID (1..28)
VALVE_B1_BITS: dict[int, int] = {
    9: 23,  # L4
    10: 25, # R4
    14: 17, # LStick Touch
    15: 18, # RStick Touch
    18: 28, # QAM
}

# Steam Controller 2026 / Triton (0x1304/0x1305) report 0x42 buttons_0 bit index -> GAMEPAD_BUTTON ID.
# Note: in 0x42, bytes 8..9 (bits 16..31 of b1) carry analog data, so b1 is not decoded via VALVE_B1_BITS.
TRITON_0X42_B0_BITS: dict[int, int] = {
    **VALVE_B0_BITS,
    7: 25,   # R4
    8: 26,   # R5
    17: 23,  # L4
    18: 24,  # L5
}

# Linux evdev EV_KEY code -> Deckify GAMEPAD_BUTTON ID (1..28)
EVDEV_KEY_MAP: dict[int, int] = {
    304: 1,   # BTN_SOUTH (A)
    305: 2,   # BTN_EAST (B)
    307: 3,   # BTN_NORTH (X)
    308: 4,   # BTN_WEST (Y)
    310: 5,   # BTN_TL (L1)
    311: 6,   # BTN_TR (R1)
    312: 7,   # BTN_TL2 (L2)
    313: 8,   # BTN_TR2 (R2)
    314: 13,  # BTN_SELECT
    315: 14,  # BTN_START
    316: 27,  # BTN_MODE (STEAM)
    317: 15,  # BTN_THUMBL (L3)
    318: 16,  # BTN_THUMBR (R3)
    544: 9,   # BTN_DPAD_UP
    545: 10,  # BTN_DPAD_DOWN
    546: 11,  # BTN_DPAD_LEFT
    547: 12,  # BTN_DPAD_RIGHT
    704: 23,  # BTN_TRIGGER_HAPPY1 (L4)
    705: 25,  # BTN_TRIGGER_HAPPY2 (R4)
    706: 24,  # BTN_TRIGGER_HAPPY3 (L5)
    707: 26,  # BTN_TRIGGER_HAPPY4 (R5)
}

EV_KEY = 1
EV_ABS = 3
ABS_HAT0X = 16
ABS_HAT0Y = 17
EVDEV_EVENT_SIZE = 24  # 64-bit Linux struct input_event (<qqHHi)

_HAT_AXIS_MAP: dict[int, dict[int, int]] = {
    ABS_HAT0X: {-1: 11, 1: 12},
    ABS_HAT0Y: {-1: 9, 1: 10},
}

_GAMEPAD_KEY_BITS_MASK = (1 << 304) | (1 << 305) | (1 << 307) | (1 << 308)
_HID_ID_RE = re.compile(r"^HID_ID=[0-9A-Fa-f]+:([0-9A-Fa-f]+):([0-9A-Fa-f]+)$")
_PRODUCT_RE = re.compile(r"^PRODUCT=[0-9A-Fa-f]+/([0-9A-Fa-f]+)/([0-9A-Fa-f]+)/")


def parse_valve_hidraw_report(data: bytes) -> tuple[int, int] | None:
    """Decode Valve hidraw report (0x09, 0x42, 0x45, 0x47) into (buttons_0, buttons_1)."""
    if not data:
        return None
    report_id = data[0]
    if report_id in (0x09, 0x45, 0x47):
        if len(data) < 16:
            return None
        return struct.unpack_from("<II", data, 8)
    if report_id == 0x42:
        if len(data) < 10:
            return None
        return struct.unpack_from("<II", data, 2)
    return None


def diff_valve_button_masks(
    prev_b0: int,
    prev_b1: int,
    curr_b0: int,
    curr_b1: int,
    report_id: int | None = None,
) -> list[tuple[int, bool]]:
    """Compute (button_id, pressed) transitions between two Valve button bitmasks."""
    b0_map = TRITON_0X42_B0_BITS if report_id == 0x42 else VALVE_B0_BITS
    b1_map = {} if report_id == 0x42 else VALVE_B1_BITS
    transitions: list[tuple[int, bool]] = []
    changed_b0 = prev_b0 ^ curr_b0
    if changed_b0:
        for bit, btn_id in b0_map.items():
            mask = 1 << bit
            if changed_b0 & mask:
                transitions.append((btn_id, bool(curr_b0 & mask)))
    changed_b1 = prev_b1 ^ curr_b1
    if changed_b1 and b1_map:
        for bit, btn_id in b1_map.items():
            mask = 1 << bit
            if changed_b1 & mask:
                transitions.append((btn_id, bool(curr_b1 & mask)))
    return transitions


def parse_evdev_event(
    raw: bytes,
    hat_state: dict[int, int | None],
) -> list[tuple[int, bool]]:
    """Decode a 24-byte 64-bit Linux struct input_event into (button_id, pressed) transitions."""
    if len(raw) != EVDEV_EVENT_SIZE:
        return []
    _, _, ev_type, code, value = struct.unpack("<qqHHi", raw)
    if ev_type == EV_KEY:
        if value == 2:  # Ignore key auto-repeat
            return []
        btn_id = EVDEV_KEY_MAP.get(code)
        if btn_id is None or value not in (0, 1):
            return []
        return [(btn_id, value == 1)]
    if ev_type == EV_ABS and code in _HAT_AXIS_MAP:
        prev_btn = hat_state.get(code)
        new_btn = _HAT_AXIS_MAP[code].get(value)
        if new_btn == prev_btn:
            return []
        events: list[tuple[int, bool]] = []
        if prev_btn is not None:
            events.append((prev_btn, False))
        if new_btn is not None:
            events.append((new_btn, True))
        hat_state[code] = new_btn
        return events
    return []


@dataclass
class DiscoveredDevice:
    path: str
    kind: str  # "hidraw" | "evdev"
    vendor_id: int
    product_id: int


@dataclass
class _OpenDevice:
    path: str
    kind: str
    fd: int
    prev_b0: int = 0
    prev_b1: int = 0
    hat_state: dict[int, int | None] = field(default_factory=dict)


def _read_text(path: str) -> str:
    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            return f.read()
    except OSError:
        return ""


def _parse_hex_bitmask(cap_text: str) -> int:
    """Parse sysfs capabilities/key space-separated 64-bit hex words into an integer bitmask."""
    mask = 0
    for token in cap_text.strip().split():
        try:
            word = int(token, 16)
        except ValueError:
            return 0
        mask = (mask << 64) | word
    return mask


class ControllerInputWatcher:
    """Passive non-grabbing hidraw + evdev controller input watcher."""

    def __init__(
        self,
        on_button_event: Callable[[int, bool, str], Awaitable[None] | None],
        logger=None,
        sysfs_root: str = "/sys",
    ) -> None:
        self._on_button_event = on_button_event
        self._logger = logger
        self._sysfs_root = sysfs_root
        self._enabled = True
        self._running = False
        self._open_devices: dict[str, _OpenDevice] = {}
        self._recent_events: dict[tuple[int, bool], float] = {}
        self._rescan_task: asyncio.Task | None = None

    def set_enabled(self, enabled: bool) -> None:
        self._enabled = bool(enabled)

    def discover_devices(self) -> list[DiscoveredDevice]:
        hidraw_devices: list[DiscoveredDevice] = []
        hidraw_pattern = os.path.join(self._sysfs_root, "class", "hidraw", "hidraw*", "device", "uevent")
        for uevent_path in sorted(glob.glob(hidraw_pattern)):
            content = _read_text(uevent_path)
            vendor_id = 0
            product_id = 0
            for line in content.splitlines():
                m = _HID_ID_RE.match(line.strip())
                if m:
                    vendor_id = int(m.group(1), 16)
                    product_id = int(m.group(2), 16)
                    break
            if vendor_id == VALVE_VENDOR_ID and (
                product_id == DECK_PRODUCT_ID or product_id in TRITON_PRODUCT_IDS
            ):
                node_name = os.path.basename(os.path.dirname(os.path.dirname(uevent_path)))
                hidraw_devices.append(
                    DiscoveredDevice(
                        path=f"/dev/{node_name}",
                        kind="hidraw",
                        vendor_id=vendor_id,
                        product_id=product_id,
                    )
                )

        has_valve_hidraw = len(hidraw_devices) > 0
        evdev_devices: list[DiscoveredDevice] = []
        event_pattern = os.path.join(self._sysfs_root, "class", "input", "event*", "device", "uevent")
        for uevent_path in sorted(glob.glob(event_pattern)):
            dev_dir = os.path.dirname(uevent_path)
            content = _read_text(uevent_path)
            vendor_id = 0
            product_id = 0
            for line in content.splitlines():
                m = _PRODUCT_RE.match(line.strip())
                if m:
                    vendor_id = int(m.group(1), 16)
                    product_id = int(m.group(2), 16)
                    break
            if not vendor_id:
                v_txt = _read_text(os.path.join(dev_dir, "id", "vendor")).strip()
                p_txt = _read_text(os.path.join(dev_dir, "id", "product")).strip()
                if v_txt and p_txt:
                    try:
                        vendor_id = int(v_txt, 16)
                        product_id = int(p_txt, 16)
                    except ValueError:
                        vendor_id = 0
                        product_id = 0

            is_virtual_valve = (
                vendor_id == VALVE_VENDOR_ID and product_id == VIRTUAL_PAD_PRODUCT_ID
            )
            if is_virtual_valve and has_valve_hidraw:
                continue

            if not is_virtual_valve:
                cap_key = _read_text(os.path.join(dev_dir, "capabilities", "key"))
                if not cap_key:
                    for line in content.splitlines():
                        if line.startswith("KEY="):
                            cap_key = line[4:]
                            break
                if (_parse_hex_bitmask(cap_key) & _GAMEPAD_KEY_BITS_MASK) == 0:
                    continue

            node_name = os.path.basename(os.path.dirname(dev_dir))
            evdev_devices.append(
                DiscoveredDevice(
                    path=f"/dev/input/{node_name}",
                    kind="evdev",
                    vendor_id=vendor_id,
                    product_id=product_id,
                )
            )

        return hidraw_devices + evdev_devices

    def rescan(self) -> None:
        discovered = {dev.path: dev for dev in self.discover_devices()}
        # Close removed devices
        for path in list(self._open_devices.keys()):
            if path not in discovered:
                self._close_device(path)

        # Open newly discovered devices
        flags = os.O_RDONLY | getattr(os, "O_NONBLOCK", 0o4000)
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        for path, dev in discovered.items():
            if path in self._open_devices:
                continue
            try:
                fd = os.open(path, flags)
            except (PermissionError, FileNotFoundError, OSError) as exc:
                if self._logger:
                    self._logger.debug("input_watch: skip %s (%s)", path, exc)
                continue

            open_dev = _OpenDevice(path=path, kind=dev.kind, fd=fd)
            self._open_devices[path] = open_dev
            if loop is not None:
                try:
                    loop.add_reader(fd, self._on_fd_readable, path)
                except (NotImplementedError, RuntimeError, AttributeError):
                    pass

    def _close_device(self, path: str) -> None:
        dev = self._open_devices.pop(path, None)
        if not dev:
            return
        try:
            loop = asyncio.get_running_loop()
            try:
                loop.remove_reader(dev.fd)
            except (NotImplementedError, RuntimeError, AttributeError, ValueError):
                pass
        except RuntimeError:
            pass
        try:
            os.close(dev.fd)
        except OSError:
            pass

    def _on_fd_readable(self, path: str) -> None:
        dev = self._open_devices.get(path)
        if not dev:
            return
        transitions: list[tuple[int, bool]] = []
        try:
            if dev.kind == "hidraw":
                for _ in range(16):
                    try:
                        data = os.read(dev.fd, 64)
                    except BlockingIOError:
                        break
                    if not data:
                        self._close_device(path)
                        return
                    masks = parse_valve_hidraw_report(data)
                    if masks is not None:
                        b0, b1 = masks
                        transitions.extend(
                            diff_valve_button_masks(
                                dev.prev_b0, dev.prev_b1, b0, b1, report_id=data[0]
                            )
                        )
                        dev.prev_b0 = b0
                        dev.prev_b1 = b1
            else:
                try:
                    chunk = os.read(dev.fd, EVDEV_EVENT_SIZE * 16)
                except BlockingIOError:
                    return
                if not chunk:
                    self._close_device(path)
                    return
                for offset in range(0, len(chunk) - (len(chunk) % EVDEV_EVENT_SIZE), EVDEV_EVENT_SIZE):
                    transitions.extend(
                        parse_evdev_event(chunk[offset:offset + EVDEV_EVENT_SIZE], dev.hat_state)
                    )
        except OSError:
            self._close_device(path)
            return

        if not self._enabled or not transitions:
            return

        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return

        for btn_id, pressed in transitions:
            loop.create_task(self._emit_transition(btn_id, pressed, dev.kind))

    async def _emit_transition(self, button: int, pressed: bool, source: str) -> None:
        if not self._enabled:
            return
        now = time.monotonic()
        key = (int(button), bool(pressed))
        last_ts = self._recent_events.get(key)
        if last_ts is not None and (now - last_ts) < DEDUP_WINDOW_SECONDS:
            return
        self._recent_events[key] = now

        try:
            result = self._on_button_event(key[0], key[1], source)
            if inspect.isawaitable(result):
                await result
        except Exception as exc:
            if self._logger:
                self._logger.debug("input_watch: on_button_event error: %s", exc)

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        self.rescan()
        loop = asyncio.get_running_loop()
        self._rescan_task = loop.create_task(self._rescan_loop())

    async def _rescan_loop(self) -> None:
        try:
            while self._running:
                await asyncio.sleep(RESCAN_INTERVAL_SECONDS)
                if self._running:
                    self.rescan()
        except asyncio.CancelledError:
            pass

    async def stop(self) -> None:
        self._running = False
        if self._rescan_task and not self._rescan_task.done():
            self._rescan_task.cancel()
            try:
                await self._rescan_task
            except asyncio.CancelledError:
                pass
        self._rescan_task = None
        for path in list(self._open_devices.keys()):
            self._close_device(path)
        self._recent_events.clear()
