"""Handheld battery Eco-Mode power governor and Linux sysfs battery reader."""

import asyncio
import os
import time

from py_modules.common import decky

DEFAULT_SYSFS_POWER_SUPPLY = "/sys/class/power_supply"
DOCKED_STATUSES = frozenset({"docked", "bluetooth_held", "manual_override"})
VALID_ECO_TIMEOUTS = frozenset({5, 10, 15, 20, 25, 30})


def _read_sysfs_attr(path: str) -> str:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read().strip()
    except OSError:
        return ""


def read_power_supply_state(
    sysfs_root: str = DEFAULT_SYSFS_POWER_SUPPLY,
) -> tuple[bool, bool]:
    """Read Linux sysfs power supply entries safely.

    Returns (has_battery, on_battery).
    Missing sysfs or absence of type=='Battery' entries (Steam Machine / desktop)
    always returns (False, False).
    """
    has_battery = False
    on_battery = False
    try:
        with os.scandir(sysfs_root) as entries:
            for entry in entries:
                try:
                    if not entry.is_dir(follow_symlinks=True):
                        continue
                    supply_type = _read_sysfs_attr(os.path.join(entry.path, "type"))
                    if supply_type != "Battery":
                        continue
                    scope = _read_sysfs_attr(os.path.join(entry.path, "scope"))
                    if scope == "Device":
                        continue
                    has_battery = True
                    status = _read_sysfs_attr(os.path.join(entry.path, "status"))
                    if status == "Discharging":
                        on_battery = True
                except OSError:
                    continue
    except OSError:
        return (False, False)
    return (has_battery, on_battery)


class PowerGovernor:
    """Supervises battery state, gameplay animation suspension, and idle engine sleep."""

    def __init__(
        self,
        plugin,
        sysfs_root: str = DEFAULT_SYSFS_POWER_SUPPLY,
        poll_interval: float = 5.0,
    ):
        self._plugin = plugin
        self._sysfs_root = sysfs_root
        self._poll_interval = poll_interval
        self._eval_lock = asyncio.Lock()
        self._running: bool = False
        self._monitor_task: asyncio.Task | None = None

        self._has_battery: bool = False
        self._on_battery: bool = False
        self._is_docked: bool = False
        self._is_game_running: bool = False
        self._animations_suspended: bool = False
        self._eco_sleeping: bool = False
        self._paused_since: float | None = None
        self._last_emitted_sig: tuple | None = None

    @property
    def engine_sleeping(self) -> bool:
        return self._eco_sleeping

    def start(self) -> None:
        """Start the background power-supply supervision loop."""
        if self._running:
            return
        self._running = True
        self._monitor_task = asyncio.create_task(self._monitor_loop())

    async def stop(self) -> None:
        """Stop the background power-supply supervision loop."""
        self._running = False
        if self._monitor_task:
            self._monitor_task.cancel()
            try:
                await self._monitor_task
            except asyncio.CancelledError:
                pass
            self._monitor_task = None

    async def _monitor_loop(self) -> None:
        while self._running:
            try:
                await self.evaluate_now()
            except asyncio.CancelledError:
                raise
            except Exception as err:
                decky.logger.debug("PowerGovernor evaluate error: %s", err)
            await asyncio.sleep(self._poll_interval)

    def _get_timeout_minutes(self, settings: dict) -> int:
        raw = settings.get("eco_timeout_minutes", 15)
        if isinstance(raw, bool):
            return 15
        try:
            val = int(raw)
        except (TypeError, ValueError):
            return 15
        if val < 5:
            return 5
        if val > 30:
            return 30
        return val

    def _emit_if_changed(self, status_dict: dict, force: bool = False) -> None:
        sig = (
            status_dict.get("enabled"),
            status_dict.get("has_battery"),
            status_dict.get("on_battery"),
            status_dict.get("is_docked"),
            status_dict.get("is_game_running"),
            status_dict.get("animations_suspended"),
            status_dict.get("engine_sleeping"),
            status_dict.get("sleep_spotify_client"),
            status_dict.get("timeout_minutes"),
            status_dict.get("status"),
        )
        if not force and sig == self._last_emitted_sig:
            return
        self._last_emitted_sig = sig
        try:
            res = decky.emit("eco_status_changed", status_dict)
            if asyncio.iscoroutine(res):
                asyncio.create_task(res)
        except Exception:
            pass

    async def evaluate_now(self) -> dict:
        """Evaluate sysfs battery, dock state, active game, and idle sleep timeout."""
        async with self._eval_lock:
            settings = getattr(self._plugin, "_settings", {}) or {}
            eco_enabled = bool(settings.get("eco_mode_enabled", True))
            timeout_minutes = self._get_timeout_minutes(settings)
            sleep_spotify_client = bool(settings.get("eco_sleep_spotify_client", False))
            audio_backend = str(settings.get("audio_backend", "librespot") or "librespot")

            has_battery, on_battery = read_power_supply_state(self._sysfs_root)

            dock_switcher = getattr(self._plugin, "_dock_switcher", None)
            dock_status = "idle"
            if dock_switcher is not None and callable(getattr(dock_switcher, "get_status_dict", None)):
                dock_status = str(dock_switcher.get_status_dict().get("status") or "idle")
            is_docked = dock_status in DOCKED_STATUSES

            raw_app_id = getattr(getattr(self._plugin, "_soundtrack_manager", None), "_active_game_app_id", None)
            is_game_running = isinstance(raw_app_id, int) and not isinstance(raw_app_id, bool)

            animations_suspended = bool(
                eco_enabled and has_battery and on_battery and not is_docked and is_game_running
            )

            engine_running = bool(
                hasattr(self._plugin, "_is_engine_running") and self._plugin._is_engine_running()
            )
            play_state = getattr(self._plugin, "_poll_play_state", None)

            if self._eco_sleeping and engine_running:
                self._eco_sleeping = False

            target_allowed = audio_backend == "librespot" or sleep_spotify_client
            sleep_eligible = bool(
                eco_enabled
                and has_battery
                and on_battery
                and not is_docked
                and engine_running
                and play_state != "playing"
                and target_allowed
            )

            if not sleep_eligible or self._eco_sleeping:
                self._paused_since = None
            else:
                now = time.monotonic()
                if self._paused_since is None:
                    self._paused_since = now
                elif now - self._paused_since >= timeout_minutes * 60:
                    self._eco_sleeping = True
                    self._paused_since = None
                    if hasattr(self._plugin, "stop_librespot"):
                        try:
                            await self._plugin.stop_librespot()
                        except Exception as err:
                            decky.logger.warning("PowerGovernor stop_librespot failed: %s", err)

            self._has_battery = has_battery
            self._on_battery = on_battery
            self._is_docked = is_docked
            self._is_game_running = is_game_running
            self._animations_suspended = animations_suspended

            status_dict = self.get_status_dict()
            self._emit_if_changed(status_dict)
            return status_dict

    async def wake_for_playback(self) -> dict:
        """Clear Eco-Sleep state, start engine if stopped, and wait briefly for Connect registration."""
        self._eco_sleeping = False
        self._paused_since = None

        engine_running = bool(
            hasattr(self._plugin, "_is_engine_running") and self._plugin._is_engine_running()
        )
        if not engine_running and hasattr(self._plugin, "start_librespot"):
            start_res = await self._plugin.start_librespot()
            if isinstance(start_res, dict) and start_res.get("ok"):
                from py_modules import rpc_playback

                for _ in range(4):
                    await asyncio.sleep(0.3)
                    dev_res = await rpc_playback.get_devices(self._plugin)
                    if isinstance(dev_res, dict) and dev_res.get("devices"):
                        break

        status_dict = self.get_status_dict()
        self._emit_if_changed(status_dict, force=True)
        return status_dict

    def get_status_dict(self) -> dict:
        """Return current Eco-Mode status snapshot for get_status() and events."""
        settings = getattr(self._plugin, "_settings", {}) or {}
        enabled = bool(settings.get("eco_mode_enabled", True))
        sleep_spotify_client = bool(settings.get("eco_sleep_spotify_client", False))
        timeout_minutes = self._get_timeout_minutes(settings)

        paused_seconds = 0
        if self._paused_since is not None and not self._eco_sleeping:
            paused_seconds = int(max(0.0, time.monotonic() - self._paused_since))

        if self._eco_sleeping:
            status = "engine_sleeping"
        elif enabled and self._has_battery and self._on_battery and not self._is_docked:
            status = "on_battery_active"
        else:
            status = "bypassed"

        return {
            "enabled": enabled,
            "has_battery": self._has_battery,
            "on_battery": self._on_battery,
            "is_docked": self._is_docked,
            "is_game_running": self._is_game_running,
            "animations_suspended": self._animations_suspended,
            "engine_sleeping": self._eco_sleeping,
            "sleep_spotify_client": sleep_spotify_client,
            "timeout_minutes": timeout_minutes,
            "paused_seconds": paused_seconds,
            "status": status,
        }
