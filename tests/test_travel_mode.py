import asyncio
import json
import os
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.insert(0, os.path.dirname(__file__))
from test_token_refresh import main  # noqa: F401
from py_modules import common, resilience


class TestTravelModeStateMachine(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.bookmark_file = os.path.join(self._tmp.name, "bookmark.json")
        self.plugin = SimpleNamespace(
            _settings={},
            _is_librespot_running=MagicMock(return_value=True),
            _last_event={},
        )
        self.events = []

    def tearDown(self):
        self._tmp.cleanup()

    def _make_manager(self, **kwargs):
        return resilience.SessionBookmarkManager(
            self.plugin,
            bookmark_file=self.bookmark_file,
            on_travel_mode_changed=lambda state: self.events.append(dict(state)),
            **kwargs,
        )

    async def test_wake_grace_window_suppresses_auto_travel_mode(self):
        mgr = self._make_manager(wifi_grace_s=4.0, wake_grace_s=resilience.WAKE_GRACE_WINDOW_S)
        mgr._last_recovery_ts = 100.0

        with patch("time.monotonic", side_effect=[101.0, 106.0, 109.5]):
            await mgr.on_poll_network_result(False)
            await mgr.on_poll_network_result(False)
            await mgr.on_poll_network_result(False)

        self.assertEqual(resilience.WAKE_GRACE_WINDOW_S, 10.0)
        self.assertFalse(mgr.travel_mode_enabled)
        self.assertFalse(mgr.travel_mode_manual)
        self.assertEqual(self.events, [])

    async def test_sustained_disconnect_after_wake_grace_activates_auto_travel_mode_idempotently(self):
        mgr = self._make_manager(wifi_grace_s=4.0, wake_grace_s=10.0)
        mgr._last_recovery_ts = 100.0

        with patch("time.monotonic", side_effect=[111.0, 115.5, 120.0]):
            await mgr.on_poll_network_result(False)
            self.assertFalse(mgr.travel_mode_enabled)
            await mgr.on_poll_network_result(False)
            self.assertTrue(mgr.travel_mode_enabled)
            self.assertFalse(mgr.travel_mode_manual)
            await mgr.on_poll_network_result(False)

        self.assertEqual(len(self.events), 1)
        self.assertEqual(
            self.events[0],
            {
                "travel_mode_enabled": True,
                "travel_mode_manual": False,
                "travel_mode_auto_enabled": True,
            },
        )

    async def test_wifi_stabilization_auto_exits_auto_travel_mode_but_preserves_sticky_manual(self):
        mgr = self._make_manager(wifi_grace_s=4.0, wake_grace_s=10.0)
        mgr.handle_wake_recovery = MagicMock(return_value=asyncio.Future())
        mgr.handle_wake_recovery.return_value.set_result({"ok": True})

        with patch("time.monotonic", side_effect=[10.0, 15.0, 20.0]):
            await mgr.on_poll_network_result(False)
            await mgr.on_poll_network_result(False)
            self.assertTrue(mgr.travel_mode_enabled)
            self.assertFalse(mgr.travel_mode_manual)

            await mgr.on_poll_network_result(True)

        self.assertFalse(mgr.travel_mode_enabled)
        self.assertFalse(mgr.travel_mode_manual)
        self.assertEqual(len(self.events), 2)

        # Now enable manual Travel Mode and confirm Wi-Fi stabilization keeps it sticky ON
        mgr2 = self._make_manager(wifi_grace_s=4.0, wake_grace_s=10.0)
        mgr2.handle_wake_recovery = MagicMock(return_value=asyncio.Future())
        mgr2.handle_wake_recovery.return_value.set_result({"ok": True})
        mgr2.set_manual_travel_mode(True)
        self.events.clear()

        with patch("time.monotonic", side_effect=[50.0, 55.0, 60.0]):
            await mgr2.on_poll_network_result(False)
            await mgr2.on_poll_network_result(False)
            await mgr2.on_poll_network_result(True)

        self.assertTrue(mgr2.travel_mode_enabled)
        self.assertTrue(mgr2.travel_mode_manual)
        self.assertEqual(self.events, [])

    def test_manual_travel_mode_toggle_is_idempotent(self):
        mgr = self._make_manager()

        s1 = mgr.set_manual_travel_mode(True)
        s2 = mgr.set_manual_travel_mode(True)
        self.assertEqual(s1, {"travel_mode_enabled": True, "travel_mode_manual": True, "travel_mode_auto_enabled": True})
        self.assertEqual(s2, s1)
        self.assertEqual(len(self.events), 1)

        s3 = mgr.set_manual_travel_mode(False)
        s4 = mgr.set_manual_travel_mode(False)
        self.assertEqual(s3, {"travel_mode_enabled": False, "travel_mode_manual": False, "travel_mode_auto_enabled": True})
        self.assertEqual(s4, s3)
        self.assertEqual(len(self.events), 2)

    async def test_auto_travel_mode_disabled_never_auto_activates(self):
        mgr = self._make_manager(wifi_grace_s=4.0, wake_grace_s=10.0, travel_mode_auto_enabled=True)
        state = mgr.set_auto_travel_mode_enabled(False)
        self.assertFalse(state["travel_mode_auto_enabled"])

        with patch("time.monotonic", side_effect=[50.0, 60.0]):
            await mgr.on_poll_network_result(False)
            await mgr.on_poll_network_result(False)

        self.assertFalse(mgr.travel_mode_enabled)
        self.assertFalse(mgr.travel_mode_manual)
        self.assertEqual(self.events, [])


class TestTravelModeFiltering(unittest.TestCase):
    def test_filter_items_active_keeps_downloaded_preserving_order(self):
        items = [
            {"uri": "spotify:playlist:1", "name": "Online Only"},
            {"uri": "spotify:playlist:2", "name": "Downloaded By Uri"},
            {"uri": "spotify:playlist:3", "name": "Downloaded By State", "offline_state": "downloaded"},
            {"uri": "spotify:playlist:4", "name": "Also Online", "offline_state": "none"},
        ]
        filtered = resilience.filter_items_for_travel_mode(
            items,
            downloaded_uris={"spotify:playlist:2"},
            travel_mode_enabled=True,
        )
        self.assertEqual(
            [item["uri"] for item in filtered],
            ["spotify:playlist:2", "spotify:playlist:3"],
        )

    def test_filter_items_inactive_returns_all_items(self):
        items = [
            {"uri": "spotify:album:1", "name": "A1"},
            {"uri": "spotify:album:2", "name": "A2"},
        ]
        result = resilience.filter_items_for_travel_mode(
            items,
            downloaded_uris=set(),
            travel_mode_enabled=False,
        )
        self.assertEqual(result, items)

    def test_filter_items_empty_or_none_returns_empty_list(self):
        self.assertEqual(resilience.filter_items_for_travel_mode(None, None, True), [])
        self.assertEqual(resilience.filter_items_for_travel_mode([], ["spotify:track:1"], True), [])
        self.assertEqual(resilience.filter_items_for_travel_mode(None, None, False), [])


class TestTravelModeSettingsAndWiring(unittest.IsolatedAsyncioTestCase):
    def _make_plugin(self):
        plugin = main.Plugin()
        plugin._settings = dict(common.DEFAULT_SETTINGS)
        plugin._bookmark_manager = plugin._create_bookmark_manager()
        return plugin

    def test_travel_mode_show_when_online_default_and_validation(self):
        self.assertIn("travel_mode_show_when_online", common.DEFAULT_SETTINGS)
        self.assertFalse(common.DEFAULT_SETTINGS["travel_mode_show_when_online"])
        with tempfile.TemporaryDirectory() as tmpdir:
            settings_path = os.path.join(tmpdir, "settings.json")
            with open(settings_path, "w", encoding="utf-8") as f:
                json.dump({"travel_mode_show_when_online": "yes"}, f)
            loaded = common._load_settings(settings_path)
            self.assertIs(loaded["travel_mode_show_when_online"], True)

            with open(settings_path, "w", encoding="utf-8") as f:
                json.dump({"travel_mode_show_when_online": 0}, f)
            loaded_false = common._load_settings(settings_path)
            self.assertIs(loaded_false["travel_mode_show_when_online"], False)

    async def test_start_spotify_client_waits_for_cdp_ready(self):
        plugin = self._make_plugin()
        plugin._stop_monitor = AsyncMock()
        plugin._kill_librespot = AsyncMock()
        plugin._kill_spotify_client = AsyncMock()
        plugin._write_spotify_client_prefs = MagicMock()
        plugin._configure_pipewire_clock = AsyncMock()
        plugin._start_monitor = MagicMock()
        fake_proc = SimpleNamespace(pid=4321, poll=lambda: None)

        with patch.object(main.glob, "glob", return_value=[]):
            with patch.object(main, "_build_deck_command", side_effect=lambda cmd, **kw: (cmd, {})):
                with patch.object(main.subprocess, "Popen", return_value=fake_proc):
                    with patch.object(
                        main.cdp_bridge,
                        "wait_for_cdp_ready",
                        return_value={"ok": True, "ready": True},
                    ) as mock_wait:
                        with patch.object(main.decky, "emit", new_callable=AsyncMock):
                            with patch.object(main.asyncio, "sleep", new_callable=AsyncMock):
                                res = await plugin.start_spotify_client()

        self.assertTrue(res["ok"])
        self.assertEqual(res["pid"], 4321)
        mock_wait.assert_called_once()

    async def test_set_travel_mode_emits_travel_mode_changed_once(self):
        plugin = self._make_plugin()
        with patch.object(main, "_save_settings"):
            with patch.object(main.decky, "emit", new_callable=AsyncMock) as mock_emit:
                res = await plugin.set_travel_mode(enabled=True, manual=True)
        self.assertTrue(res["ok"])
        travel_mode_calls = [
            c for c in mock_emit.call_args_list if c.args and c.args[0] == "travel_mode_changed"
        ]
        self.assertEqual(len(travel_mode_calls), 1)
        self.assertEqual(
            travel_mode_calls[0].args[1],
            {
                "travel_mode_enabled": True,
                "travel_mode_manual": True,
                "travel_mode_auto_enabled": True,
            },
        )


if __name__ == "__main__":
    unittest.main()
