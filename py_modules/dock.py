"""Automatic docked USB-DAC / HDMI audio switching and PipeWire sink classification."""

import asyncio
import shutil
import subprocess

from py_modules import volume
from py_modules.common import _build_deck_command, _exec, decky
from py_modules.engine import _get_pactl_sinks
from py_modules.equalizer import EQ_SINK_NAME

DOCK_HOTPLUG_DEBOUNCE_S = 1.8

_EQ_VIRTUAL_SINKS = (EQ_SINK_NAME, "effect_input.deckify_eq")


def classify_sink(name: str) -> str:
    """Classify a PipeWire/PulseAudio sink name into a hardware or virtual category."""
    if not name or not isinstance(name, str):
        return "internal"
    if name in _EQ_VIRTUAL_SINKS:
        return "eq_virtual"
    if name.startswith("bluez_output."):
        return "bluetooth"
    low = name.lower()
    if name.startswith("alsa_output.usb-") or ".usb-" in low:
        return "usb"
    if name.startswith("alsa_output.pci-") and "hdmi" in low:
        return "hdmi"
    return "internal"


def parse_pactl_sinks_detailed(stdout: str, default_sink: str = "") -> list[dict]:
    """Parse `pactl list sinks` output into enriched sink dictionaries, excluding virtual EQ sinks."""
    if not stdout:
        return []

    sinks: list[dict] = []
    current_name: str | None = None
    current_desc: str | None = None

    def _flush() -> None:
        if not current_name:
            return
        kind = classify_sink(current_name)
        if kind == "eq_virtual":
            return
        sinks.append(
            {
                "name": current_name,
                "description": current_desc or current_name,
                "is_default": current_name == default_sink,
                "kind": kind,
            }
        )

    for raw_line in stdout.splitlines():
        line = raw_line.strip()
        if line.startswith("Sink #"):
            _flush()
            current_name = None
            current_desc = None
            continue
        if line.startswith("Name:"):
            current_name = line.split(":", 1)[1].strip()
        elif line.startswith("Description:") and current_desc is None:
            current_desc = line.split(":", 1)[1].strip()

    _flush()
    return sinks


def get_detailed_sinks() -> tuple[list[dict], str]:
    """Query PipeWire/PulseAudio for detailed sinks and the current default sink."""
    default_sink = ""
    try:
        def_cmd, def_env = _build_deck_command(["pactl", "get-default-sink"])
        def_env.pop("LD_LIBRARY_PATH", None)
        def_proc = subprocess.run(def_cmd, env=def_env, capture_output=True, text=True, timeout=3)
        if def_proc.returncode == 0:
            default_sink = (def_proc.stdout or "").strip()
    except Exception:
        default_sink = ""

    sinks: list[dict] = []
    try:
        list_cmd, list_env = _build_deck_command(["pactl", "list", "sinks"])
        list_env.pop("LD_LIBRARY_PATH", None)
        list_proc = subprocess.run(list_cmd, env=list_env, capture_output=True, text=True, timeout=4)
        if list_proc.returncode == 0 and list_proc.stdout:
            sinks = parse_pactl_sinks_detailed(list_proc.stdout, default_sink=default_sink)
    except Exception:
        sinks = []

    if not sinks:
        for item in _get_pactl_sinks():
            name = item.get("name", "")
            if not name or classify_sink(name) == "eq_virtual":
                continue
            sinks.append(
                {
                    "name": name,
                    "description": item.get("description") or name,
                    "is_default": name == default_sink,
                    "kind": classify_sink(name),
                }
            )

    return sinks, default_sink


def select_dock_target(sinks: list[dict], target_setting: str) -> dict | None:
    """Select the target dock sink based on `dock_target_sink` setting ('auto' prefers USB over HDMI)."""
    if not sinks:
        return None

    target = (target_setting or "auto").strip() or "auto"
    if target == "auto":
        usb_sinks = [s for s in sinks if s.get("kind") == "usb"]
        if usb_sinks:
            return usb_sinks[0]
        hdmi_sinks = [s for s in sinks if s.get("kind") == "hdmi"]
        if hdmi_sinks:
            return hdmi_sinks[0]
        return None

    for s in sinks:
        name = s.get("name", "")
        if name == target and classify_sink(name) != "eq_virtual":
            return s
    return None


class DockAudioSwitcher:
    """Supervises docked USB-DAC/HDMI audio hotplugs and routes Deckify's stream cleanly."""

    def __init__(self, plugin):
        self._plugin = plugin
        self._status: str = "idle"
        self._docked_sink: str | None = None
        self._docked_sink_label: str = ""
        self._dock_session_sink: str | None = None
        self._pre_dock_sink: str | None = None
        self._manual_override: bool = False
        self._eval_lock = asyncio.Lock()

    def get_status_dict(self) -> dict:
        """Return current dock audio switcher status for frontend display."""
        return {
            "status": self._status,
            "active_sink": self._docked_sink,
            "active_sink_label": self._docked_sink_label,
            "pre_dock_sink": self._pre_dock_sink,
            "manual_override": self._manual_override,
        }

    def _capture_pre_dock_sink(self, default_sink: str) -> str | None:
        """Capture the current hardware sink before docking, never capturing the virtual EQ sink."""
        eq_mgr = getattr(self._plugin, "_equalizer_manager", None)
        if eq_mgr is not None and getattr(eq_mgr, "is_active", False):
            hw = getattr(eq_mgr, "_target_hardware_sink", None)
            if hw and classify_sink(hw) != "eq_virtual":
                return hw
        if default_sink and classify_sink(default_sink) != "eq_virtual":
            return default_sink
        return None

    def _resolve_sink_label(self, sink_name: str, sinks: list[dict]) -> str:
        for s in sinks:
            if s.get("name") == sink_name:
                return s.get("description") or sink_name
        return sink_name

    async def _restore_pre_dock(self, sinks: list[dict], default_sink: str) -> None:
        """Restore pre-dock hardware sink, reset PipeWire clock, and emit undocked event."""
        sink_names = {s.get("name") for s in sinks}
        if self._pre_dock_sink and self._pre_dock_sink in sink_names and classify_sink(self._pre_dock_sink) != "eq_virtual":
            restored_sink = self._pre_dock_sink
        elif default_sink and classify_sink(default_sink) != "eq_virtual":
            restored_sink = default_sink
        else:
            restored_sink = "@DEFAULT_SINK@"

        restored_label = self._resolve_sink_label(restored_sink, sinks)
        await volume.set_audio_sink(restored_sink, plugin=self._plugin, is_auto_dock=True)
        await volume.configure_pipewire_clock(False)

        toast_enabled = bool(self._plugin._settings.get("dock_toast_enabled", True))
        await decky.emit(
            "dock_audio_switched",
            {
                "action": "undocked",
                "sink": restored_sink,
                "sink_label": restored_label,
                "toast_enabled": toast_enabled,
            },
        )

        self._docked_sink = None
        self._docked_sink_label = ""
        self._dock_session_sink = None
        self._pre_dock_sink = None
        self._manual_override = False
        self._status = "idle"

    async def evaluate_now(self) -> None:
        """Evaluate connected sinks and dock/undock Deckify's audio stream as needed."""
        async with self._eval_lock:
            settings = getattr(self._plugin, "_settings", {}) or {}
            if not bool(settings.get("dock_auto_switch_enabled", False)):
                self._status = "disabled"
                return

            sinks, default_sink = await _exec(get_detailed_sinks, timeout=4)
            target_setting = str(settings.get("dock_target_sink", "auto") or "auto")
            target = select_dock_target(sinks, target_setting)
            toast_enabled = bool(settings.get("dock_toast_enabled", True))

            if target is not None:
                target_name = target["name"]
                target_label = target.get("description") or target_name
                if self._docked_sink == target_name:
                    self._status = "docked"
                    return

                if self._pre_dock_sink is None:
                    self._pre_dock_sink = self._capture_pre_dock_sink(default_sink)

                res = await volume.set_audio_sink(target_name, plugin=self._plugin, is_auto_dock=True)
                if isinstance(res, dict) and res.get("ok"):
                    self._docked_sink = target_name
                    self._docked_sink_label = target_label
                    self._dock_session_sink = target_name
                    self._status = "docked"
                    if bool(settings.get("bit_perfect_clock", True)):
                        await volume.configure_pipewire_clock(True)
                    await decky.emit(
                        "dock_audio_switched",
                        {
                            "action": "docked",
                            "sink": target_name,
                            "sink_label": target_label,
                            "toast_enabled": toast_enabled,
                        },
                    )
                else:
                    await decky.emit(
                        "dock_audio_switched",
                        {
                            "action": "error",
                            "sink": target_name,
                            "sink_label": target_label,
                            "toast_enabled": toast_enabled,
                        },
                    )
                return

            # No dock target present
            if self._docked_sink is not None:
                await self._restore_pre_dock(sinks, default_sink)
            else:
                self._dock_session_sink = None
                self._manual_override = False
                self._pre_dock_sink = None
                self._status = "idle"
