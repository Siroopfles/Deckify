import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

try:
    from test_token_refresh import main as main_mod
except ImportError:
    from tests.test_token_refresh import main as main_mod

from py_modules import common, engine, rpc_library, rpc_playback


def make_plugin(audio_backend: str = "spotify_client"):
    settings = dict(common.DEFAULT_SETTINGS)
    settings["audio_backend"] = audio_backend
    return SimpleNamespace(
        _settings=settings,
        _playback_speed=1.0,
        _last_media_is_spoken=False,
        _save_settings=MagicMock(),
        _ensure_token=AsyncMock(return_value="tok"),
    )


class TestPodcastSpeedTracer(unittest.IsolatedAsyncioTestCase):
    def test_scopes_version_8_includes_playback_position(self):
        self.assertEqual(common.CURRENT_SCOPES_VERSION, 8)
        self.assertIn("user-read-playback-position", common.SPOTIFY_SCOPES.split())

    def test_allowed_playback_speeds_and_default_setting(self):
        self.assertEqual(
            common.ALLOWED_PLAYBACK_SPEEDS,
            (0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0),
        )
        self.assertEqual(common.DEFAULT_SETTINGS["preferred_podcast_speed"], 1.0)

    def test_cdp_set_playback_speed_validates_speed(self):
        with patch.object(engine, "_cdp_evaluate") as mock_eval:
            res = engine._cdp_set_playback_speed(3.0)
            self.assertFalse(res.get("ok"))
            mock_eval.assert_not_called()

        with patch.object(engine, "_cdp_evaluate", return_value={"ok": True, "speed": 1.5}) as mock_eval:
            res = engine._cdp_set_playback_speed(1.5)
            self.assertTrue(res.get("ok"))
            mock_eval.assert_called_once()
            expr = mock_eval.call_args[0][0]
            self.assertIn("PlayerAPI", expr)
            self.assertIn("setSpeed", expr)
            self.assertIn("1.5", expr)

    async def test_set_playback_speed_spotify_client_success(self):
        plugin = make_plugin("spotify_client")
        with patch.object(rpc_playback, "_cdp_set_playback_speed", return_value={"ok": True, "speed": 1.5}) as mock_cdp, \
             patch.object(rpc_playback.decky, "emit", new_callable=AsyncMock) as mock_emit:
            res = await rpc_playback.set_playback_speed(plugin, 1.5)

        self.assertTrue(res.get("ok"))
        self.assertEqual(res.get("speed"), 1.5)
        mock_cdp.assert_called_once_with(1.5)
        self.assertEqual(plugin._playback_speed, 1.5)
        self.assertEqual(plugin._settings["preferred_podcast_speed"], 1.5)
        plugin._save_settings.assert_called_once()
        mock_emit.assert_awaited_once_with("playback_speed_changed", {"speed": 1.5})

    async def test_set_playback_speed_librespot_unsupported(self):
        plugin = make_plugin("librespot")
        with patch.object(rpc_playback, "_cdp_set_playback_speed") as mock_cdp:
            res = await rpc_playback.set_playback_speed(plugin, 1.5)

        self.assertFalse(res.get("ok"))
        self.assertTrue(res.get("unsupported_backend"))
        self.assertEqual(plugin._playback_speed, 1.0)
        mock_cdp.assert_not_called()
        plugin._save_settings.assert_not_called()

    async def test_set_playback_speed_rejects_invalid_and_non_numeric(self):
        plugin = make_plugin("spotify_client")
        with patch.object(rpc_playback, "_cdp_set_playback_speed") as mock_cdp:
            res_range = await rpc_playback.set_playback_speed(plugin, 3.0)
            res_str = await rpc_playback.set_playback_speed(plugin, "fast")  # type: ignore[arg-type]
            res_none = await rpc_playback.set_playback_speed(plugin, None)  # type: ignore[arg-type]

        for res in (res_range, res_str, res_none):
            self.assertFalse(res.get("ok"))
            self.assertIn("error", res)
        mock_cdp.assert_not_called()
        self.assertEqual(plugin._playback_speed, 1.0)


class TestPodcastPollAndShowEpisodes(unittest.IsolatedAsyncioTestCase):
    async def test_get_show_episodes_sanitizes_and_normalizes(self):
        plugin = make_plugin("spotify_client")
        empty_res = await rpc_library.get_show_episodes(plugin, "   ")
        self.assertFalse(empty_res.get("ok"))

        def fake_api(endpoint, token, method="GET", params=None, body=None):
            if endpoint == "shows/show%2F123%3Fx%3D1":
                return {
                    "name": "Tech Talk",
                    "images": [{"url": "https://i.scdn.co/image/show1"}],
                }
            if endpoint == "shows/show%2F123%3Fx%3D1/episodes":
                self.assertEqual(params.get("market"), "from_token")
                return {
                    "total": 1,
                    "items": [
                        {
                            "id": "ep1",
                            "name": "Episode 1",
                            "uri": "spotify:episode:ep1",
                            "duration_ms": 1800000,
                            "release_date": "2026-11-20",
                            "images": [],
                            "resume_point": {
                                "resume_position_ms": 420000,
                                "fully_played": False,
                            },
                        }
                    ],
                }
            raise AssertionError(f"Unexpected endpoint: {endpoint}")

        with patch.object(rpc_library, "_spotify_api_request", side_effect=fake_api):
            res = await rpc_library.get_show_episodes(plugin, "show/123?x=1", offset=-5)

        self.assertTrue(res.get("ok"))
        self.assertEqual(res.get("offset"), 0)
        self.assertEqual(res.get("total"), 1)
        ep = res["episodes"][0]
        self.assertEqual(ep["id"], "ep1")
        self.assertEqual(ep["show_name"], "Tech Talk")
        self.assertEqual(ep["duration_ms"], 1800000)
        self.assertEqual(ep["resume_position_ms"], 420000)
        self.assertFalse(ep["fully_played"])
        self.assertEqual(ep["image_url"], "https://i.scdn.co/image/show1")

    async def test_poll_player_media_type_and_get_status_playback_speed(self):
        plugin = main_mod.Plugin()
        plugin._settings = dict(common.DEFAULT_SETTINGS)
        plugin._settings["audio_backend"] = "spotify_client"
        plugin._settings["preferred_podcast_speed"] = 1.5
        plugin._access_token = "tok"
        plugin._ensure_token = AsyncMock(return_value="tok")
        plugin._check_tracks_liked = AsyncMock(return_value={})
        plugin._maybe_trigger_local_crossfade = AsyncMock()
        plugin._is_engine_running = MagicMock(return_value=True)
        plugin._is_librespot_running = MagicMock(return_value=False)
        plugin._is_spotify_client_running = MagicMock(return_value=True)

        status = await plugin.get_status()
        self.assertIn("playback_speed", status)
        self.assertEqual(status["playback_speed"], 1.0)

        ep_payload = {
            "is_playing": True,
            "progress_ms": 1000,
            "item": {
                "id": "ep10",
                "type": "episode",
                "uri": "spotify:episode:ep10",
                "name": "Ep 10",
                "duration_ms": 600000,
                "show": {"name": "Pod", "images": [{"url": "https://i.scdn.co/image/pod"}]},
                "images": [{"url": "https://i.scdn.co/image/ep10"}],
            },
        }
        with patch.object(main_mod, "_spotify_api_request", return_value=ep_payload), \
             patch.object(main_mod, "_cdp_set_playback_speed", return_value={"ok": True, "speed": 1.5}) as mock_cdp, \
             patch.object(main_mod.decky, "emit", new_callable=AsyncMock) as mock_emit:
            await plugin._poll_playback()

        meta_calls = [c for c in mock_emit.await_args_list if c.args[0] == "track_metadata"]
        self.assertEqual(len(meta_calls), 1)
        self.assertEqual(meta_calls[0].args[1]["media_type"], "episode")
        self.assertEqual(plugin._playback_speed, 1.5)
        mock_cdp.assert_called_once_with(1.5)

    async def test_poll_player_music_auto_reset_and_podcast_restore(self):
        plugin = main_mod.Plugin()
        plugin._settings = dict(common.DEFAULT_SETTINGS)
        plugin._settings["audio_backend"] = "spotify_client"
        plugin._settings["preferred_podcast_speed"] = 1.5
        plugin._playback_speed = 1.5
        plugin._last_media_is_spoken = True
        plugin._poll_track_id = "ep_prev"
        plugin._access_token = "tok"
        plugin._ensure_token = AsyncMock(return_value="tok")
        plugin._check_tracks_liked = AsyncMock(return_value={"t1": False})
        plugin._maybe_trigger_local_crossfade = AsyncMock()

        music_payload = {
            "is_playing": True,
            "progress_ms": 5000,
            "item": {
                "id": "t1",
                "type": "track",
                "uri": "spotify:track:t1",
                "name": "Song 1",
                "duration_ms": 200000,
                "artists": [{"id": "a1", "name": "Band"}],
                "album": {"id": "al1", "name": "Album", "images": [{"url": "https://i.scdn.co/image/t1"}]},
            },
        }
        with patch.object(main_mod, "_spotify_api_request", return_value=music_payload), \
             patch.object(main_mod, "_cdp_set_playback_speed", return_value={"ok": True, "speed": 1.0}) as mock_cdp, \
             patch.object(main_mod.decky, "emit", new_callable=AsyncMock) as mock_emit:
            await plugin._poll_playback()

        self.assertEqual(plugin._playback_speed, 1.0)
        self.assertEqual(plugin._settings["preferred_podcast_speed"], 1.5)
        mock_cdp.assert_called_once_with(1.0)
        speed_calls = [c for c in mock_emit.await_args_list if c.args[0] == "playback_speed_changed"]
        self.assertEqual(len(speed_calls), 1)
        self.assertEqual(speed_calls[0].args[1], {"speed": 1.0})

        ep_payload = {
            "is_playing": True,
            "progress_ms": 2000,
            "item": {
                "id": "ep_next",
                "type": "episode",
                "uri": "spotify:episode:ep_next",
                "name": "Next Ep",
                "duration_ms": 900000,
                "show": {"name": "Pod", "images": []},
                "images": [],
            },
        }
        with patch.object(main_mod, "_spotify_api_request", return_value=ep_payload), \
             patch.object(main_mod, "_cdp_set_playback_speed", return_value={"ok": True, "speed": 1.5}) as mock_cdp2, \
             patch.object(main_mod.decky, "emit", new_callable=AsyncMock) as mock_emit2:
            await plugin._poll_playback()

        self.assertEqual(plugin._playback_speed, 1.5)
        mock_cdp2.assert_called_once_with(1.5)
        speed_calls2 = [c for c in mock_emit2.await_args_list if c.args[0] == "playback_speed_changed"]
        self.assertEqual(len(speed_calls2), 1)
        self.assertEqual(speed_calls2[0].args[1], {"speed": 1.5})


if __name__ == "__main__":
    unittest.main()
