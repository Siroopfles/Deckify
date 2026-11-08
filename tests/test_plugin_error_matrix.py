import asyncio
import io
import json
import os
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, Mock, patch
from urllib.error import HTTPError

sys.path.insert(0, os.path.dirname(__file__))
from test_token_refresh import main


class PluginErrorMatrixTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.plugin = main.Plugin()
        self.plugin._token_refresh_lock = asyncio.Lock()
        self.plugin._access_token = "valid-token"
        self.plugin._refresh_token = "valid-refresh"
        self.plugin._token_expires_at = 9999999999
        self.plugin._settings = dict(main.DEFAULT_SETTINGS)
        self.plugin._sse = MagicMock()
        self.execute = self.enterContext(patch.object(main, "_exec", new_callable=AsyncMock))
        self.save = self.enterContext(patch.object(main, "_save_settings"))
        self.emit = self.enterContext(patch.object(main.decky, "emit", new_callable=AsyncMock))

    async def test_all_api_methods_unauthenticated_error(self):
        # Force _ensure_token to return None
        with patch.object(self.plugin, "_ensure_token", new_callable=AsyncMock, return_value=None):
            methods = [
                ("control_playback", ["play"]),
                ("set_volume", [50]),
                ("seek_playback", [1000]),
                ("set_shuffle", [True]),
                ("set_repeat", ["track"]),
                ("toggle_like_track", ["t1"]),
                ("get_queue", []),
                ("add_to_queue", ["spotify:track:1"]),
                ("get_playlists", []),
                ("get_playlist_tracks", ["p1"]),
                ("add_track_to_playlist", ["p1", "spotify:track:1"]),
                ("get_liked_tracks", []),
                ("get_saved_episodes", []),
                ("get_saved_albums", []),
                ("get_album_tracks", ["a1"]),
                ("get_followed_artists", []),
                ("get_artist_albums", ["art1"]),
                ("get_artist_top_tracks", ["art1"]),
                ("get_recently_played", []),
                ("search_spotify", ["query"]),
                ("get_track_recommendations", ["seed1"]),
                ("play_tracks", []),
                ("get_devices", []),
                ("transfer_playback", ["d1"]),
            ]
            for fn_name, args in methods:
                with self.subTest(method=fn_name):
                    fn = getattr(self.plugin, fn_name)
                    res = await fn(*args)
                    self.assertFalse(res["ok"])
                    self.assertEqual(res["error"], "Not authenticated")

    async def test_all_api_methods_http_error(self):
        err_body = io.BytesIO(b'{"error": {"message": "Rate limit exceeded", "status": 429}}')
        http_err = HTTPError("url", 429, "Too Many Requests", {}, err_body)
        self.execute.side_effect = http_err

        methods = [
            ("control_playback", ["play"]),
            ("set_volume", [50]),
            ("seek_playback", [1000]),
            ("set_shuffle", [True]),
            ("set_repeat", ["track"]),
            ("toggle_like_track", ["t1", True]),
            ("add_to_queue", ["spotify:track:1"]),
            ("transfer_playback", ["d1"]),
        ]
        for fn_name, args in methods:
            with self.subTest(method=fn_name):
                fn = getattr(self.plugin, fn_name)
                res = await fn(*args)
                self.assertFalse(res["ok"])

    async def test_all_api_methods_generic_exception(self):
        self.execute.side_effect = RuntimeError("Socket timeout")

        methods = [
            ("get_queue", []),
            ("get_playlists", []),
            ("get_playlist_tracks", ["p1"]),
            ("add_track_to_playlist", ["p1", "t1"]),
            ("get_liked_tracks", []),
            ("get_saved_episodes", []),
            ("get_saved_albums", []),
            ("get_album_tracks", ["a1"]),
            ("get_followed_artists", []),
            ("get_artist_albums", ["art1"]),
            ("get_artist_top_tracks", ["art1"]),
            ("get_recently_played", []),
            ("search_spotify", ["q"]),
            ("get_track_recommendations", ["s1"]),
            ("play_tracks", []),
            ("get_devices", []),
        ]
        for fn_name, args in methods:
            with self.subTest(method=fn_name):
                fn = getattr(self.plugin, fn_name)
                res = await fn(*args)
                self.assertFalse(res["ok"])
                self.assertIn("Socket timeout", res["error"])
