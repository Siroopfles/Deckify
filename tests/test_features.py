import asyncio
import tempfile
import unittest
from unittest.mock import AsyncMock, Mock, patch

from test_token_refresh import main


class DeckifyFeatureTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.plugin = main.Plugin()
        self.plugin._token_refresh_lock = asyncio.Lock()
        self.plugin._access_token = "valid-token"
        self.plugin._refresh_token = "valid-refresh"
        self.plugin._token_expires_at = 9999999999
        self.plugin._settings = dict(main.DEFAULT_SETTINGS)
        self.execute = self.enterContext(patch.object(main, "_exec", new_callable=AsyncMock))
        self.save = self.enterContext(patch.object(main, "_save_settings"))
        self.emit = self.enterContext(patch.object(main.decky, "emit", new_callable=AsyncMock))

    async def test_seek_playback_clamps_and_updates_last_event(self):
        self.plugin._last_event = {"event": "playing", "position_ms": 1000}
        res = await self.plugin.seek_playback(45000, "dev-1")
        self.assertTrue(res["ok"])
        self.assertEqual(res["position_ms"], 45000)
        self.assertEqual(self.plugin._last_event["position_ms"], 45000)
        self.execute.assert_awaited_once_with(
            main._spotify_api_request,
            "me/player/seek",
            "valid-token",
            "PUT",
            {"position_ms": 45000, "device_id": "dev-1"},
        )

    async def test_shuffle_and_repeat_emit_playback_modes(self):
        res_shuf = await self.plugin.set_shuffle(True)
        self.assertTrue(res_shuf["ok"])
        self.assertTrue(self.plugin._shuffle_state)

        res_rep = await self.plugin.set_repeat("track")
        self.assertTrue(res_rep["ok"])
        self.assertEqual(self.plugin._repeat_state, "track")

        bad_rep = await self.plugin.set_repeat("invalid")
        self.assertFalse(bad_rep["ok"])

    async def test_toggle_like_updates_current_track_metadata(self):
        self.plugin._poll_track_id = "track-123"
        self.plugin._is_liked = False
        self.plugin._track_meta = {"track_id": "track-123", "name": "Test Song", "is_liked": False}

        res = await self.plugin.toggle_like_track("track-123", True)
        self.assertTrue(res["ok"])
        self.assertTrue(res["is_liked"])
        self.assertTrue(self.plugin._is_liked)
        self.assertTrue(self.plugin._track_meta["is_liked"])

    async def test_queue_and_add_to_queue(self):
        self.execute.return_value = {
            "currently_playing": {
                "id": "t1",
                "name": "Current Song",
                "artists": [{"name": "Artist A"}],
                "album": {"name": "Album A", "images": []},
                "uri": "spotify:track:t1",
                "duration_ms": 180000,
            },
            "queue": [
                {
                    "id": "t2",
                    "name": "Next Song",
                    "artists": [{"name": "Artist B"}],
                    "album": {"name": "Album B", "images": []},
                    "uri": "spotify:track:t2",
                    "duration_ms": 200000,
                }
            ],
        }
        q_res = await self.plugin.get_queue()
        self.assertTrue(q_res["ok"])
        self.assertEqual(q_res["currently_playing"]["name"], "Current Song")
        self.assertEqual(len(q_res["queue"]), 1)
        self.assertEqual(q_res["queue"][0]["name"], "Next Song")

        add_res = await self.plugin.add_to_queue("spotify:track:t2")
        self.assertTrue(add_res["ok"])

    async def test_librespot_includes_mixing_and_normalisation_flags(self):
        self.plugin._settings = {
            **main.DEFAULT_SETTINGS,
            "device_name": "SteamMachine",
            "normalisation": True,
            "normalisation_pregain": 1.5,
            "gapless": False,
            "autoplay": True,
        }
        process = Mock(pid=555)
        with tempfile.TemporaryDirectory() as tmpdir, \
                patch.object(main, "CACHE_DIR", tmpdir), \
                patch.object(main.os.path, "isfile", return_value=True), \
                patch.object(main.subprocess, "Popen", return_value=process) as popen, \
                patch.object(self.plugin, "_kill_stale_librespot"), \
                patch.object(self.plugin, "_write_pid"), \
                patch.object(self.plugin, "_start_monitor"):
            res = await self.plugin.start_librespot()
            self.assertTrue(res["ok"])
            cmd = popen.call_args.args[0]
            self.assertIn("--enable-volume-normalisation", cmd)
            self.assertIn("--disable-gapless", cmd)
            self.assertIn("--autoplay", cmd)
            self.assertEqual(cmd[cmd.index("--autoplay") + 1], "on")

    async def test_mix_settings_validation(self):
        self.assertTrue((await self.plugin.set_setting("mix_mode", "fade"))["ok"])
        self.assertFalse((await self.plugin.set_setting("mix_mode", "invalid"))["ok"])
        self.assertTrue((await self.plugin.set_setting("crossfade_seconds", 99))["ok"])
        self.assertEqual(self.plugin._settings["crossfade_seconds"], 12)


if __name__ == "__main__":
    unittest.main()
