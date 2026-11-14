import json
import os
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
    from py_modules import common, rpc_playback

try:
    from test_token_refresh import main
except ImportError:
    from tests.test_token_refresh import main


class TestPinnedPlaylists(unittest.IsolatedAsyncioTestCase):
    def test_sanitize_pinned_playlists_filters_dedups_and_caps(self):
        raw = [
            "not-a-dict",
            {"uri": "", "name": "Empty URI"},
            {"uri": "spotify:playlist:1", "name": ""},
            {"uri": "spotify:playlist:1", "name": "First", "type": "playlist", "image_url": "https://i.scdn.co/1.jpg"},
            {"uri": "spotify:playlist:1", "name": "Duplicate"},
            {"uri": "spotify:album:2", "name": "Album 2", "type": "album"},
            {"uri": "spotify:collection:tracks", "name": "Liked Songs", "type": "liked_songs"},
            {"uri": "spotify:playlist:4", "name": "Unknown Type", "type": "podcast"},
            {"uri": "spotify:playlist:5", "name": "Fifth Over Cap", "type": "playlist"},
        ]
        sanitized = common._sanitize_pinned_playlists(raw)
        self.assertEqual(len(sanitized), common.MAX_PINNED_PLAYLISTS)
        self.assertEqual([item["uri"] for item in sanitized], [
            "spotify:playlist:1",
            "spotify:album:2",
            "spotify:collection:tracks",
            "spotify:playlist:4",
        ])
        self.assertEqual(sanitized[0]["image_url"], "https://i.scdn.co/1.jpg")
        self.assertIsNone(sanitized[1]["image_url"])
        self.assertEqual(sanitized[2]["type"], "liked_songs")
        self.assertEqual(sanitized[3]["type"], "playlist")

    def test_load_settings_sanitizes_pinned_playlists(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            settings_path = os.path.join(tmpdir, "settings.json")
            with open(settings_path, "w") as f:
                json.dump({
                    "pinned_playlists": [
                        {"uri": "spotify:playlist:a", "name": "A", "type": "playlist"},
                        {"uri": "spotify:playlist:a", "name": "A dup", "type": "playlist"},
                        {"uri": "spotify:playlist:b", "name": "B", "type": "invalid"},
                        {"uri": "spotify:playlist:c", "name": "C", "type": "album"},
                        {"uri": "spotify:playlist:d", "name": "D", "type": "liked_songs"},
                        {"uri": "spotify:playlist:e", "name": "E", "type": "playlist"},
                    ]
                }, f)
            loaded = common._load_settings(settings_path)
            self.assertEqual(len(loaded["pinned_playlists"]), 4)
            self.assertEqual([p["uri"] for p in loaded["pinned_playlists"]], [
                "spotify:playlist:a",
                "spotify:playlist:b",
                "spotify:playlist:c",
                "spotify:playlist:d",
            ])
            self.assertEqual(loaded["pinned_playlists"][1]["type"], "playlist")

    async def test_set_setting_pinned_playlists_accepts_4_and_rejects_5(self):
        plugin = main.Plugin()
        plugin._settings = dict(common.DEFAULT_SETTINGS)

        four_items = [
            {"uri": f"spotify:playlist:{i}", "name": f"Mix {i}", "type": "playlist", "image_url": None}
            for i in range(4)
        ]
        with patch.object(main, "_save_settings") as mock_save, \
             patch.object(main.decky, "emit", new_callable=AsyncMock) as mock_emit:
            res = await plugin.set_setting("pinned_playlists", four_items)
            self.assertTrue(res["ok"])
            self.assertEqual(len(plugin._settings["pinned_playlists"]), 4)
            mock_save.assert_called_once()
            mock_emit.assert_awaited_once_with("settings_changed", dict(plugin._settings))

            five_items = four_items + [
                {"uri": "spotify:playlist:5", "name": "Mix 5", "type": "playlist"}
            ]
            res_reject = await plugin.set_setting("pinned_playlists", five_items)
            self.assertFalse(res_reject["ok"])
            self.assertEqual(res_reject["error"], "Max 4 pinned items — unpin one first")
            # Existing 4 pinned items must not be evicted or modified
            self.assertEqual(len(plugin._settings["pinned_playlists"]), 4)

            res_bad_type = await plugin.set_setting("pinned_playlists", "not-a-list")
            self.assertFalse(res_bad_type["ok"])

    async def test_quick_play_pinned_unauthenticated(self):
        plugin = SimpleNamespace(_ensure_token=AsyncMock(return_value=None))
        res = await rpc_playback.quick_play_pinned(plugin, "spotify:playlist:123", "playlist")
        self.assertEqual(res, {"ok": False, "error": "Not authenticated"})

    async def test_quick_play_pinned_running_engine_preserves_shuffle(self):
        plugin = SimpleNamespace(
            _ensure_token=AsyncMock(return_value="tok"),
            _is_engine_running=MagicMock(return_value=True),
            start_librespot=AsyncMock(),
            set_shuffle=AsyncMock(),
            _poll_play_state=None,
            _context_uri=None,
        )
        with patch.object(rpc_playback, "play_tracks", new_callable=AsyncMock, return_value={"ok": True}) as mock_play:
            res = await rpc_playback.quick_play_pinned(plugin, "spotify:album:abc", "album")
            self.assertTrue(res["ok"])
            plugin.start_librespot.assert_not_awaited()
            plugin.set_shuffle.assert_not_awaited()
            mock_play.assert_awaited_once_with(plugin, context_uri="spotify:album:abc")
            self.assertEqual(plugin._poll_play_state, "playing")
            self.assertEqual(plugin._context_uri, "spotify:album:abc")

    async def test_quick_play_pinned_wakes_stopped_engine_and_polls_devices(self):
        plugin = SimpleNamespace(
            _ensure_token=AsyncMock(return_value="tok"),
            _is_engine_running=MagicMock(return_value=False),
            start_librespot=AsyncMock(return_value={"ok": True}),
            _poll_play_state=None,
            _context_uri=None,
        )
        with patch.object(rpc_playback, "get_devices", new_callable=AsyncMock, side_effect=[
            {"ok": True, "devices": []},
            {"ok": True, "devices": [{"id": "dev1", "name": "Deckify"}]},
        ]) as mock_devs, \
             patch.object(rpc_playback, "play_tracks", new_callable=AsyncMock, return_value={"ok": True}) as mock_play, \
             patch.object(rpc_playback.asyncio, "sleep", new_callable=AsyncMock) as mock_sleep:
            res = await rpc_playback.quick_play_pinned(plugin, "spotify:playlist:xyz", "playlist")
            self.assertTrue(res["ok"])
            plugin.start_librespot.assert_awaited_once()
            self.assertEqual(mock_devs.await_count, 2)
            self.assertEqual(mock_sleep.await_count, 2)
            mock_play.assert_awaited_once_with(plugin, context_uri="spotify:playlist:xyz")

    async def test_quick_play_pinned_liked_songs_fetches_tracks_and_plays_uris(self):
        plugin = SimpleNamespace(
            _ensure_token=AsyncMock(return_value="tok"),
            _is_engine_running=MagicMock(return_value=True),
            _poll_play_state=None,
            _context_uri=None,
        )
        liked_payload = {
            "items": [
                {"track": {"uri": "spotify:track:t1"}},
                {"track": {"uri": "spotify:track:t2"}},
            ]
        }
        with patch.object(rpc_playback, "_exec", new_callable=AsyncMock, return_value=liked_payload) as mock_exec, \
             patch.object(rpc_playback, "play_tracks", new_callable=AsyncMock, return_value={"ok": True}) as mock_play:
            res = await rpc_playback.quick_play_pinned(plugin, "spotify:collection:tracks", "liked_songs")
            self.assertTrue(res["ok"])
            mock_exec.assert_awaited_once_with(
                rpc_playback._spotify_api_request, "me/tracks", "tok", "GET", {"limit": 50}
            )
            mock_play.assert_awaited_once_with(plugin, uris=["spotify:track:t1", "spotify:track:t2"])
            self.assertEqual(plugin._poll_play_state, "playing")
            self.assertEqual(plugin._context_uri, "spotify:collection:tracks")
