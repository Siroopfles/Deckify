import asyncio
import os
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

with patch.dict(
    "sys.modules",
    {
        "decky": SimpleNamespace(
            DECKY_PLUGIN_SETTINGS_DIR=tempfile.gettempdir(),
            DECKY_PLUGIN_DIR=tempfile.gettempdir(),
            DECKY_PLUGIN_RUNTIME_DIR=tempfile.gettempdir(),
            logger=MagicMock(),
            emit=AsyncMock(),
        )
    },
):
    from py_modules import common, eco


def _make_supply(root: str, name: str, supply_type: str, status: str | None = None) -> None:
    supply_dir = os.path.join(root, name)
    os.makedirs(supply_dir, exist_ok=True)
    with open(os.path.join(supply_dir, "type"), "w", encoding="utf-8") as f:
        f.write(f"{supply_type}\n")
    if status is not None:
        with open(os.path.join(supply_dir, "status"), "w", encoding="utf-8") as f:
            f.write(f"{status}\n")


def _make_plugin(
    *,
    eco_enabled: bool = True,
    timeout_minutes: int = 15,
    sleep_spotify_client: bool = False,
    audio_backend: str = "librespot",
    dock_status: str = "idle",
    active_game_app_id=None,
    engine_running: bool = True,
    play_state: str = "paused",
):
    plugin = SimpleNamespace(
        _settings={
            "eco_mode_enabled": eco_enabled,
            "eco_timeout_minutes": timeout_minutes,
            "eco_sleep_spotify_client": sleep_spotify_client,
            "audio_backend": audio_backend,
        },
        _dock_switcher=SimpleNamespace(
            get_status_dict=lambda: {"status": dock_status}
        ),
        _soundtrack_manager=SimpleNamespace(
            _active_game_app_id=active_game_app_id
        ),
        _poll_play_state=play_state,
        _is_engine_running=lambda: engine_running,
        stop_librespot=AsyncMock(return_value={"ok": True}),
        start_librespot=AsyncMock(return_value={"ok": True}),
    )
    return plugin


class TestReadPowerSupplyState(unittest.TestCase):
    def test_missing_sysfs_root_returns_desktop_safe_false_false(self):
        missing = os.path.join(tempfile.gettempdir(), "deckify_nonexistent_sysfs_12345")
        self.assertEqual(eco.read_power_supply_state(missing), (False, False))

    def test_ac_only_steam_machine_returns_false_false(self):
        with tempfile.TemporaryDirectory() as tmp:
            _make_supply(tmp, "ACAD", "Mains", None)
            _make_supply(tmp, "ucsi-source-psy", "USB", "Not charging")
            self.assertEqual(eco.read_power_supply_state(tmp), (False, False))

    def test_battery_charging_or_full_returns_true_false(self):
        for status in ("Charging", "Full", "Not charging", "Unknown"):
            with tempfile.TemporaryDirectory() as tmp:
                _make_supply(tmp, "BAT1", "Battery", status)
                self.assertEqual(eco.read_power_supply_state(tmp), (True, False))

    def test_battery_discharging_returns_true_true(self):
        with tempfile.TemporaryDirectory() as tmp:
            _make_supply(tmp, "ACAD", "Mains", None)
            _make_supply(tmp, "BAT1", "Battery", "Discharging")
            self.assertEqual(eco.read_power_supply_state(tmp), (True, True))


class TestPowerGovernor(unittest.IsolatedAsyncioTestCase):
    async def test_steam_machine_missing_sysfs_bypasses_eco_mode(self):
        missing = os.path.join(tempfile.gettempdir(), "deckify_nonexistent_sysfs_99999")
        plugin = _make_plugin(active_game_app_id=12345, play_state="paused")
        gov = eco.PowerGovernor(plugin, sysfs_root=missing)
        status = await gov.evaluate_now()
        self.assertFalse(status["has_battery"])
        self.assertFalse(status["on_battery"])
        self.assertFalse(status["animations_suspended"])
        self.assertEqual(status["status"], "bypassed")
        plugin.stop_librespot.assert_not_awaited()

    async def test_battery_discharging_undocked_active_game_suspends_animations(self):
        with tempfile.TemporaryDirectory() as tmp:
            _make_supply(tmp, "BAT1", "Battery", "Discharging")
            plugin = _make_plugin(active_game_app_id=1091500, play_state="playing")
            gov = eco.PowerGovernor(plugin, sysfs_root=tmp)
            status = await gov.evaluate_now()
            self.assertTrue(status["has_battery"])
            self.assertTrue(status["on_battery"])
            self.assertTrue(status["is_game_running"])
            self.assertTrue(status["animations_suspended"])
            self.assertEqual(status["status"], "on_battery_active")

            # Ending game restores animations_suspended=False
            plugin._soundtrack_manager._active_game_app_id = None
            status2 = await gov.evaluate_now()
            self.assertFalse(status2["is_game_running"])
            self.assertFalse(status2["animations_suspended"])

    async def test_docked_bypasses_animation_suspension_and_sleep(self):
        with tempfile.TemporaryDirectory() as tmp:
            _make_supply(tmp, "BAT1", "Battery", "Discharging")
            for dock_state in ("docked", "bluetooth_held", "manual_override"):
                plugin = _make_plugin(
                    dock_status=dock_state,
                    active_game_app_id=1091500,
                    play_state="paused",
                )
                gov = eco.PowerGovernor(plugin, sysfs_root=tmp)
                status = await gov.evaluate_now()
                self.assertTrue(status["is_docked"])
                self.assertFalse(status["animations_suspended"])
                self.assertEqual(status["status"], "bypassed")

    async def test_idle_paused_timeout_sleeps_librespot_once_and_wakes(self):
        with tempfile.TemporaryDirectory() as tmp:
            _make_supply(tmp, "BAT1", "Battery", "Discharging")
            plugin = _make_plugin(timeout_minutes=15, play_state="playing")
            gov = eco.PowerGovernor(plugin, sysfs_root=tmp)

            with patch("py_modules.eco.time.monotonic", return_value=1000.0):
                await gov.evaluate_now()
                self.assertIsNone(gov._paused_since)

            # Simulate SleepTimer pausing playback
            plugin._poll_play_state = "paused"
            with patch("py_modules.eco.time.monotonic", return_value=1100.0):
                st = await gov.evaluate_now()
                self.assertEqual(st["paused_seconds"], 0)
                self.assertFalse(gov.engine_sleeping)

            # 14m59s later: still not sleeping
            with patch("py_modules.eco.time.monotonic", return_value=1100.0 + 899.0):
                st = await gov.evaluate_now()
                self.assertFalse(gov.engine_sleeping)
                plugin.stop_librespot.assert_not_awaited()

            # 15m00s later: enters eco sleep and stops librespot once
            with patch("py_modules.eco.time.monotonic", return_value=1100.0 + 900.0):
                st = await gov.evaluate_now()
                self.assertTrue(gov.engine_sleeping)
                self.assertEqual(st["status"], "engine_sleeping")
                plugin.stop_librespot.assert_awaited_once()

            # Simulate engine now stopped; subsequent polls do not call stop_librespot again
            plugin._is_engine_running = lambda: False
            with patch("py_modules.eco.time.monotonic", return_value=1100.0 + 960.0):
                st = await gov.evaluate_now()
                self.assertTrue(gov.engine_sleeping)
                plugin.stop_librespot.assert_awaited_once()

            # Wake for playback
            with patch("py_modules.rpc_playback.get_devices", new=AsyncMock(return_value={"ok": True, "devices": [{"id": "d1"}]})):
                with patch("py_modules.eco.asyncio.sleep", new=AsyncMock()):
                    await gov.wake_for_playback()
            self.assertFalse(gov.engine_sleeping)
            plugin.start_librespot.assert_awaited_once()

    async def test_spotify_client_sleep_respects_eco_sleep_spotify_client_flag(self):
        with tempfile.TemporaryDirectory() as tmp:
            _make_supply(tmp, "BAT1", "Battery", "Discharging")
            plugin = _make_plugin(
                audio_backend="spotify_client",
                sleep_spotify_client=False,
                timeout_minutes=5,
                play_state="paused",
            )
            gov = eco.PowerGovernor(plugin, sysfs_root=tmp)

            with patch("py_modules.eco.time.monotonic", return_value=100.0):
                await gov.evaluate_now()
            with patch("py_modules.eco.time.monotonic", return_value=500.0):
                await gov.evaluate_now()
            self.assertFalse(gov.engine_sleeping)
            plugin.stop_librespot.assert_not_awaited()

            # Enable eco_sleep_spotify_client=True -> sleeps after 5m
            plugin._settings["eco_sleep_spotify_client"] = True
            with patch("py_modules.eco.time.monotonic", return_value=600.0):
                await gov.evaluate_now()
            with patch("py_modules.eco.time.monotonic", return_value=900.0):
                await gov.evaluate_now()
            self.assertTrue(gov.engine_sleeping)
            plugin.stop_librespot.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
