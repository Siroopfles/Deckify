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


class PluginAdvancedTests(unittest.IsolatedAsyncioTestCase):
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

    # ── Folder Management & Native Mix ─────────────────────────

    async def test_manage_playlist_folder_lifecycle(self):
        # 1. Create folder
        res_create = await self.plugin.manage_playlist_folder(action="create", name="Rock Classics", playlist_id="p1")
        self.assertTrue(res_create["ok"])
        folders = self.plugin._settings["playlist_folders"]
        self.assertEqual(len(folders), 1)
        folder_id = folders[0]["id"]
        self.assertEqual(folders[0]["name"], "Rock Classics")
        self.assertEqual(folders[0]["playlist_ids"], ["p1"])

        # Create validation: empty name
        err_create = await self.plugin.manage_playlist_folder(action="create", name="  ")
        self.assertFalse(err_create["ok"])

        # 2. Add playlist
        res_add = await self.plugin.manage_playlist_folder(action="add_playlist", folder_id=folder_id, playlist_id="p2")
        self.assertTrue(res_add["ok"])
        self.assertIn("p2", self.plugin._settings["playlist_folders"][0]["playlist_ids"])

        # Add playlist validation: missing args
        err_add = await self.plugin.manage_playlist_folder(action="add_playlist", folder_id="", playlist_id="p3")
        self.assertFalse(err_add["ok"])

        # 3. Rename folder
        res_rename = await self.plugin.manage_playlist_folder(action="rename", folder_id=folder_id, name="Hard Rock")
        self.assertTrue(res_rename["ok"])
        self.assertEqual(self.plugin._settings["playlist_folders"][0]["name"], "Hard Rock")

        # Rename validation: empty name or not found
        err_rename = await self.plugin.manage_playlist_folder(action="rename", folder_id=folder_id, name="")
        self.assertFalse(err_rename["ok"])
        err_rename_nf = await self.plugin.manage_playlist_folder(action="rename", folder_id="fake", name="New")
        self.assertFalse(err_rename_nf["ok"])

        # 4. Remove playlist
        res_rem = await self.plugin.manage_playlist_folder(action="remove_playlist", folder_id=folder_id, playlist_id="p1")
        self.assertTrue(res_rem["ok"])
        self.assertNotIn("p1", self.plugin._settings["playlist_folders"][0]["playlist_ids"])

        # 5. Save folders list directly
        res_save = await self.plugin.manage_playlist_folder(
            action="save",
            folders=[{"id": "saved-1", "name": "Saved Folder", "playlist_ids": ["sp1"]}]
        )
        self.assertTrue(res_save["ok"])
        self.assertEqual(self.plugin._settings["playlist_folders"][0]["id"], "saved-1")

        # 6. Delete folder
        res_del = await self.plugin.manage_playlist_folder(action="delete", folder_id="saved-1")
        self.assertTrue(res_del["ok"])
        self.assertEqual(len(self.plugin._settings["playlist_folders"]), 0)

        # 7. Unknown action
        res_un = await self.plugin.manage_playlist_folder(action="corrupt")
        self.assertFalse(res_un["ok"])

    async def test_set_native_playlist_mix(self):
        # Requires spotify_client backend
        self.plugin._settings["audio_backend"] = "librespot"
        res_err = await self.plugin.set_native_playlist_mix("p123")
        self.assertFalse(res_err["ok"])

        self.plugin._settings["audio_backend"] = "spotify_client"
        self.execute.return_value = {"ok": True, "playlist_id": "mix123"}
        res = await self.plugin.set_native_playlist_mix("spotify:playlist:mix123", enabled=True, play_now=True)
        self.assertTrue(res["ok"])

    # ── Playback Polling ───────────────────────────────────────

    async def test_poll_playback_no_content_stopped(self):
        self.plugin._poll_play_state = "playing"
        self.plugin._poll_track_id = "track-prev"
        self.execute.return_value = None  # 204 No Content

        success = await self.plugin._poll_playback()
        self.assertTrue(success)
        self.assertIsNone(self.plugin._poll_play_state)
        self.assertIsNone(self.plugin._poll_track_id)
        self.emit.assert_awaited_with("librespot_event", {"event": "stopped"})

    async def test_poll_playback_active_track_and_modes(self):
        self.plugin._poll_play_state = "paused"
        self.plugin._poll_track_id = None
        data = {
            "is_playing": True,
            "progress_ms": 15000,
            "shuffle_state": True,
            "repeat_state": "track",
            "context": {"uri": "spotify:album:123"},
            "device": {"id": "dev-deck", "name": "Steam Deck", "volume_percent": 80, "type": "Computer"},
            "item": {
                "id": "trk-active",
                "type": "track",
                "name": "Live Track",
                "duration_ms": 200000,
                "uri": "spotify:track:trk-active",
                "artists": [{"name": "Live Artist"}],
                "album": {"name": "Live Album", "images": [{"url": "https://img.com/live"}]},
            },
        }
        with patch.object(self.plugin, "_check_tracks_liked", new_callable=AsyncMock) as mock_liked:
            mock_liked.return_value = {"trk-active": True}
            self.execute.return_value = data

            success = await self.plugin._poll_playback()
            self.assertTrue(success)
            self.assertTrue(self.plugin._shuffle_state)
            self.assertEqual(self.plugin._repeat_state, "track")
            self.assertEqual(self.plugin._poll_track_id, "trk-active")
            self.assertTrue(self.plugin._is_liked)
            self.assertEqual(self.plugin._poll_play_state, "playing")
            self.assertEqual(self.plugin._active_device["id"], "dev-deck")
            self.assertEqual(self.plugin._poll_volume, 80)

    async def test_poll_playback_active_episode(self):
        data = {
            "is_playing": False,
            "progress_ms": 50000,
            "item": {
                "id": "ep-active",
                "type": "episode",
                "name": "Tech Talk",
                "duration_ms": 600000,
                "uri": "spotify:episode:ep-active",
                "show": {"name": "Tech Show", "images": [{"url": "https://img.com/show"}]},
            },
        }
        self.execute.return_value = data
        success = await self.plugin._poll_playback()
        self.assertTrue(success)
        self.assertEqual(self.plugin._poll_track_id, "ep-active")
        self.assertEqual(self.plugin._track_meta["artist"], "Tech Show")
        self.assertEqual(self.plugin._poll_play_state, "paused")

    # ── Static Files & Image Serving ───────────────────────────

    async def test_serve_image_success_and_error(self):
        writer = MagicMock()
        writer.write = MagicMock()
        writer.drain = AsyncMock()

        self.execute.return_value = ("image/jpeg", b"\xff\xd8\xff...")
        await self.plugin._serve_image(writer, "https://i.scdn.co/image/abc")
        written = writer.write.call_args[0][0]
        self.assertIn(b"200 OK", written)
        self.assertIn(b"image/jpeg", written)

        self.execute.side_effect = RuntimeError("Invalid URL host")
        await self.plugin._serve_image(writer, "https://evil.com/bad.png")
        err_written = writer.write.call_args[0][0]
        self.assertIn(b"502 Bad Gateway", err_written)

    async def test_serve_static_files(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            with patch.object(main, "DASHBOARD_DIR", tmpdir):
                index_path = os.path.join(tmpdir, "index.html")
                with open(index_path, "w", encoding="utf-8") as f:
                    f.write("<html><body>Deckify</body></html>")

                writer = MagicMock()
                writer.write = MagicMock()
                writer.drain = AsyncMock()

                await self.plugin._serve_static(writer, "index.html")
                written = writer.write.call_args[0][0]
                self.assertIn(b"200 OK", written)
                self.assertIn(b"text/html", written)
                self.assertIn(b"Deckify", written)

                # Missing file -> 404
                await self.plugin._serve_static(writer, "missing.js")
                not_found = writer.write.call_args[0][0]
                self.assertIn(b"404 Not Found", not_found)

    # ── Full Dashboard API Routes ──────────────────────────────

    async def test_dashboard_api_routes_suite(self):
        # Test all remaining routes through _handle_dashboard_request
        routes_to_test = [
            ("GET /api/folders HTTP/1.1\r\n\r\n", "get_playlist_folders", {"ok": True}),
            ("GET /api/liked-tracks?offset=0 HTTP/1.1\r\n\r\n", "get_liked_tracks", {"ok": True}),
            ("GET /api/episodes?offset=0 HTTP/1.1\r\n\r\n", "get_saved_episodes", {"ok": True}),
            ("GET /api/albums?offset=0 HTTP/1.1\r\n\r\n", "get_saved_albums", {"ok": True}),
            ("GET /api/albums/alb1/tracks?offset=0 HTTP/1.1\r\n\r\n", "get_album_tracks", {"ok": True}),
            ("GET /api/artists HTTP/1.1\r\n\r\n", "get_followed_artists", {"ok": True}),
            ("GET /api/artists/art1/albums?offset=0 HTTP/1.1\r\n\r\n", "get_artist_albums", {"ok": True}),
            ("GET /api/artists/art1/top-tracks HTTP/1.1\r\n\r\n", "get_artist_top_tracks", {"ok": True}),
            ("GET /api/recently-played?limit=20 HTTP/1.1\r\n\r\n", "get_recently_played", {"ok": True}),
            ("GET /api/queue HTTP/1.1\r\n\r\n", "get_queue", {"ok": True}),
            ("GET /api/devices HTTP/1.1\r\n\r\n", "get_devices", {"ok": True}),
            ("GET /api/client-window/status HTTP/1.1\r\n\r\n", "get_client_window_status", {"ok": True}),
            ("GET /api/gamepad/poll HTTP/1.1\r\n\r\n", "poll_gamepad_events", {"ok": True}),
            ("GET /api/search?q=rock HTTP/1.1\r\n\r\n", "search_spotify", {"ok": True}),
        ]

        for req_raw, target_fn, ret_val in routes_to_test:
            with self.subTest(route=req_raw):
                reader = MagicMock()
                reader.read = AsyncMock(return_value=req_raw.encode("utf-8"))
                writer = MagicMock()
                writer.write = MagicMock()
                writer.drain = AsyncMock()

                with patch.object(self.plugin, target_fn, new_callable=AsyncMock) as mock_target:
                    mock_target.return_value = ret_val
                    await self.plugin._handle_dashboard_request(reader, writer)
                    mock_target.assert_awaited()
                    written = writer.write.call_args[0][0]
                    self.assertIn(b"200 OK", written)

    # ── Process & Backend Management ───────────────────────────

    async def test_backend_process_controls(self):
        # Librespot kill and start
        mock_proc = MagicMock()
        mock_proc.poll.return_value = None
        self.plugin._process = mock_proc

        await self.plugin._kill_librespot()
        mock_proc.terminate.assert_called()

        # Official Spotify client kill
        mock_sp_proc = MagicMock()
        mock_sp_proc.poll.return_value = None
        self.plugin._spotify_client_process = mock_sp_proc

        await self.plugin._kill_spotify_client()
        mock_sp_proc.terminate.assert_called()

    # ── PulseAudio Volume & Audio Stream ───────────────────────

    async def test_pa_volume_and_stream_info(self):
        pactl_output = """
Sink Input #1
        Driver: PipeWire
        application.name = "librespot"
        application.process.id = "1234"
        media.name = "librespot"
        Sample Specification: s16le 2ch 44100Hz
        Resample method: none
        Corked: no
        Volume: front-left: 65536 / 100% / 0.00 dB,   front-right: 65536 / 100% / 0.00 dB
        """
        async def fake_exec(fn, *a, **k):
            return fn(*a)
        self.execute.side_effect = fake_exec

        self.plugin._process = MagicMock(pid=1234)
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = SimpleNamespace(returncode=0, stdout=pactl_output, stderr="")
            await self.plugin._refresh_audio_stream_info()
            self.assertIsNotNone(self.plugin._audio_stream_info)
            self.assertEqual(self.plugin._audio_stream_info.get("format_label"), "16-bit · 44.1 kHz")

            # Test set PA volume
            ok = await self.plugin._set_pa_volume_percent(85)
            self.assertTrue(ok)
            mock_run.assert_called()
