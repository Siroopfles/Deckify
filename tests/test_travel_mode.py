import asyncio
import os
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(__file__))
from test_token_refresh import main  # noqa: F401
from py_modules import resilience


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


if __name__ == "__main__":
    unittest.main()
