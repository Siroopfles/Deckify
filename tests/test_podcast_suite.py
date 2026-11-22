import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

with patch.dict("sys.modules", {"decky": SimpleNamespace(
    DECKY_PLUGIN_SETTINGS_DIR=tempfile.gettempdir(),
    DECKY_PLUGIN_DIR=tempfile.gettempdir(),
    DECKY_PLUGIN_RUNTIME_DIR=tempfile.gettempdir(),
    logger=MagicMock(),
    emit=AsyncMock(),
)}):
    from py_modules import common, engine, rpc_playback


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


if __name__ == "__main__":
    unittest.main()
