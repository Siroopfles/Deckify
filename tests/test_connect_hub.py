import io
import os
import sys
import unittest
import urllib.error
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if "decky" not in sys.modules:
    sys.modules["decky"] = MagicMock()

from py_modules import rpc_playback, volume  # noqa: E402


def _make_plugin(**overrides):
    defaults = {
        "_settings": {"device_name": "Deckify", "audio_backend": "librespot"},
        "_ensure_token": AsyncMock(return_value="tok-123"),
        "_is_engine_running": MagicMock(return_value=True),
        "_power_governor": SimpleNamespace(
            engine_sleeping=False,
            wake_for_playback=AsyncMock(),
        ),
        "start_librespot": AsyncMock(return_value={"ok": True}),
    }
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


class TestConnectHub(unittest.IsolatedAsyncioTestCase):
    async def test_get_devices_enriches_metadata_from_settings_and_hostname(self):
        devices = [{"id": "dev-1", "name": "Deckify", "is_active": True}]
        plugin = _make_plugin(
            _settings={"device_name": "", "audio_backend": "spotifyd"},
            _is_engine_running=MagicMock(return_value=False),
            _power_governor=SimpleNamespace(engine_sleeping=True),
        )

        with patch("socket.gethostname", return_value="steamdeck-host"), \
             patch.object(rpc_playback, "_exec", AsyncMock(return_value={"devices": devices})):
            res = await rpc_playback.get_devices(plugin)

        self.assertTrue(res["ok"])
        self.assertEqual(res["devices"], devices)
        self.assertEqual(res["local_device_name"], "steamdeck-host")
        self.assertEqual(res["audio_backend"], "spotifyd")
        self.assertFalse(res["engine_running"])
        self.assertTrue(res["engine_sleeping"])

    async def test_pull_playback_to_deck_wakes_sleeping_engine_and_transfers(self):
        power_gov = SimpleNamespace(
            engine_sleeping=True,
            wake_for_playback=AsyncMock(),
        )
        plugin = _make_plugin(
            _settings={"device_name": "SteamDeck-LivingRoom", "audio_backend": "librespot"},
            _is_engine_running=MagicMock(return_value=False),
            _power_governor=power_gov,
        )

        poll_responses = [
            {"ok": True, "devices": [{"id": "phone-1", "name": "Phone", "is_active": True}]},
            {"ok": True, "devices": [
                {"id": "phone-1", "name": "Phone", "is_active": True},
                {"id": "deck-1", "name": "steamdeck-livingroom", "is_active": False},
            ]},
        ]
        mock_exec = AsyncMock(return_value={})

        with patch.object(rpc_playback, "get_devices", AsyncMock(side_effect=poll_responses)), \
             patch.object(rpc_playback, "_exec", mock_exec), \
             patch("asyncio.sleep", AsyncMock()) as mock_sleep:
            res = await rpc_playback.pull_playback_to_deck(plugin)

        self.assertTrue(res["ok"])
        self.assertEqual(res["device"]["id"], "deck-1")
        power_gov.wake_for_playback.assert_awaited_once()
        mock_sleep.assert_awaited()
        mock_exec.assert_awaited_once_with(
            rpc_playback._spotify_api_request,
            "me/player",
            "tok-123",
            "PUT",
            None,
            {"device_ids": ["deck-1"], "play": True},
        )

    async def test_pull_playback_to_deck_starts_librespot_when_no_power_governor(self):
        plugin = _make_plugin(
            _power_governor=None,
            _is_engine_running=MagicMock(return_value=False),
            start_librespot=AsyncMock(return_value={"ok": True}),
        )
        poll_response = {"ok": True, "devices": [{"id": "deck-2", "name": "deckify", "is_active": False}]}
        mock_exec = AsyncMock(return_value={})

        with patch.object(rpc_playback, "get_devices", AsyncMock(return_value=poll_response)), \
             patch.object(rpc_playback, "_exec", mock_exec):
            res = await rpc_playback.pull_playback_to_deck(plugin)

        self.assertTrue(res["ok"])
        self.assertEqual(res["device"]["id"], "deck-2")
        plugin.start_librespot.assert_awaited_once()

    async def test_pull_playback_to_deck_unauthenticated_and_timeout(self):
        unauth_plugin = _make_plugin(_ensure_token=AsyncMock(return_value=None))
        res_unauth = await rpc_playback.pull_playback_to_deck(unauth_plugin)
        self.assertFalse(res_unauth["ok"])
        self.assertIn("Not authenticated", res_unauth["error"])

        timeout_plugin = _make_plugin()
        with patch.object(
            rpc_playback,
            "get_devices",
            AsyncMock(return_value={"ok": True, "devices": [{"id": "pc-1", "name": "Desktop"}]}),
        ) as mock_get_devices, \
             patch("socket.gethostname", return_value="unrelated-host"), \
             patch("asyncio.sleep", AsyncMock()):
            res_timeout = await rpc_playback.pull_playback_to_deck(timeout_plugin)

        self.assertFalse(res_timeout["ok"])
        self.assertIn("did not register", res_timeout["error"])
        self.assertEqual(mock_get_devices.await_count, 10)

    async def test_set_device_volume_clamps_rejects_bool_and_handles_errors(self):
        unauth_plugin = _make_plugin(_ensure_token=AsyncMock(return_value=None))
        res_unauth = await volume.set_device_volume(unauth_plugin, "dev-1", 50)
        self.assertFalse(res_unauth["ok"])

        plugin = _make_plugin()
        res_bool = await volume.set_device_volume(plugin, "dev-1", True)
        self.assertFalse(res_bool["ok"])
        self.assertIn("Invalid", res_bool["error"])

        mock_exec = AsyncMock(return_value={})
        with patch.object(volume, "_exec", mock_exec):
            res_high = await volume.set_device_volume(plugin, " dev-1 ", 150)
            res_low = await volume.set_device_volume(plugin, "dev-2", -10)

        self.assertEqual(res_high, {"ok": True, "volume_percent": 100})
        self.assertEqual(res_low, {"ok": True, "volume_percent": 0})
        mock_exec.assert_any_await(
            volume._spotify_api_request,
            "me/player/volume",
            "tok-123",
            "PUT",
            {"volume_percent": 100, "device_id": "dev-1"},
        )
        mock_exec.assert_any_await(
            volume._spotify_api_request,
            "me/player/volume",
            "tok-123",
            "PUT",
            {"volume_percent": 0, "device_id": "dev-2"},
        )

        http_err = urllib.error.HTTPError(
            url="https://api.spotify.com/v1/me/player/volume",
            code=403,
            msg="Forbidden",
            hdrs=None,
            fp=io.BytesIO(b'{"error":{"message":"Volume control restricted"}}'),
        )
        with patch.object(volume, "_exec", AsyncMock(side_effect=http_err)):
            res_err = await volume.set_device_volume(plugin, "dev-1", 40)

        self.assertFalse(res_err["ok"])
        self.assertIn("Volume control restricted", res_err["error"])


if __name__ == "__main__":
    unittest.main()
