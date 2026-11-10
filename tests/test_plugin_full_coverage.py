import asyncio
import inspect
import io
import json
import os
import struct
import sys
import tempfile
import time
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, Mock, patch
from urllib.error import HTTPError

sys.path.insert(0, os.path.dirname(__file__))
from test_token_refresh import main


class PluginFullCoverageTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.plugin = main.Plugin()
        self.plugin._token_refresh_lock = asyncio.Lock()
        self.plugin._access_token = "valid-token"
        self.plugin._refresh_token = "valid-refresh"
        self.plugin._token_expires_at = 9999999999
        self.plugin._settings = dict(main.DEFAULT_SETTINGS)
        self.execute = self.enterContext(patch.object(main, "_exec", new_callable=AsyncMock))
        self.save = self.enterContext(patch.object(main, "_save_settings"))
        self.emit = self.enterContext(patch.object(main.decky, "emit", new_callable=AsyncMock))

    # ── OAuth Connection Routing ───────────────────────────────

    async def test_handle_oauth_connection_routing(self):
        # 1. Empty data -> closes writer
        reader_empty = MagicMock()
        reader_empty.read = AsyncMock(return_value=b"")
        writer_empty = MagicMock()
        await self.plugin._handle_oauth_connection(reader_empty, writer_empty)
        writer_empty.close.assert_called_once()

        # 2. Bad request line (< 2 parts)
        reader_bad = MagicMock()
        reader_bad.read = AsyncMock(return_value=b"GARBAGE\r\n")
        writer_bad = MagicMock()
        writer_bad.write = MagicMock()
        writer_bad.drain = AsyncMock()
        await self.plugin._handle_oauth_connection(reader_bad, writer_bad)
        written = writer_bad.write.call_args[0][0]
        self.assertIn(b"400 Bad Request", written)

        # 3. Favicon.ico
        reader_fav = MagicMock()
        reader_fav.read = AsyncMock(return_value=b"GET /favicon.ico HTTP/1.1\r\n\r\n")
        writer_fav = MagicMock()
        writer_fav.write = MagicMock()
        writer_fav.drain = AsyncMock()
        await self.plugin._handle_oauth_connection(reader_fav, writer_fav)
        written_fav = writer_fav.write.call_args[0][0]
        self.assertIn(b"404", written_fav)
        self.assertIn(b"Not found", written_fav)

        # 4. /callback route
        reader_cb = MagicMock()
        reader_cb.read = AsyncMock(return_value=b"GET /callback?code=test HTTP/1.1\r\n\r\n")
        writer_cb = MagicMock()
        with patch.object(self.plugin, "_handle_oauth_callback", new_callable=AsyncMock) as m_cb:
            await self.plugin._handle_oauth_connection(reader_cb, writer_cb)
            m_cb.assert_awaited_once_with("code=test", writer_cb)

        # 5. /auth route
        reader_auth = MagicMock()
        reader_auth.read = AsyncMock(return_value=b"GET /auth?client_id=123 HTTP/1.1\r\n\r\n")
        writer_auth = MagicMock()
        with patch.object(self.plugin, "_handle_auth_redirect", new_callable=AsyncMock) as m_auth:
            await self.plugin._handle_oauth_connection(reader_auth, writer_auth)
            m_auth.assert_awaited_once_with("client_id=123", writer_auth)

        # 6. /landing page route
        reader_land = MagicMock()
        reader_land.read = AsyncMock(return_value=b"GET / HTTP/1.1\r\n\r\n")
        writer_land = MagicMock()
        with patch.object(self.plugin, "_send_landing_page", new_callable=AsyncMock) as m_land:
            await self.plugin._handle_oauth_connection(reader_land, writer_land)
            m_land.assert_awaited_once_with(writer_land)

    # ── System Wake Gap Detection in Monitor Process ───────────

    async def test_monitor_process_wake_gap_detection(self):
        active_proc = MagicMock()
        active_proc.poll.return_value = None
        self.plugin._process = active_proc
        self.plugin._settings["audio_backend"] = "librespot"

        times = [1000.0, 1000.0, 1050.0]  # Jump from 1000 to 1050 (elapsed = 50s > 30s)
        def fake_time():
            if times:
                return times.pop(0)
            raise asyncio.CancelledError()

        with patch("time.time", side_effect=fake_time), \
             patch("asyncio.sleep", new_callable=AsyncMock), \
             patch.object(self.plugin, "_kill_librespot", new_callable=AsyncMock) as m_kill, \
             patch.object(self.plugin, "start_librespot", new_callable=AsyncMock) as m_start:
            try:
                await self.plugin._monitor_process()
            except asyncio.CancelledError:
                pass
            m_kill.assert_awaited_once()
            m_start.assert_awaited_once()

    # ── Spotify Client Prefs & PipeWire Configuration ──────────

    async def test_configure_pipewire_and_prefs(self):
        async def fake_exec(fn, *a, **k):
            return fn(*a)
        self.execute.side_effect = fake_exec

        # 1. PipeWire clock configuration
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = SimpleNamespace(returncode=0)
            await self.plugin._configure_pipewire_clock(True)
            mock_run.assert_called_once()
            cmd_called = mock_run.call_args[0][0]
            self.assertIn("clock.allowed-rates", cmd_called)

        # 2. Write Spotify client prefs
        with tempfile.TemporaryDirectory() as tmpdir:
            config_dir = os.path.join(tmpdir, "spotify_config")
            with patch.object(main, "SPOTIFY_CLIENT_CONFIG_DIR", config_dir):
                self.plugin._settings["audio_quality"] = "lossless"
                self.plugin._settings["gapless"] = True
                self.plugin._settings["normalisation"] = True
                self.plugin._write_spotify_client_prefs()

                prefs_file = os.path.join(config_dir, "prefs")
                self.assertTrue(os.path.isfile(prefs_file))
                with open(prefs_file, "r", encoding="utf-8") as f:
                    content = f.read()
                self.assertIn("audio.sync_bitrate_enumeration=5", content)
                self.assertIn("audio.gapless_v2=true", content)

    # ── Playlist Fallback & Native Folders ─────────────────────

    async def test_add_track_to_playlist_items_fallback(self):
        # First call (playlists/{pid}/items) raises 404, fallback (playlists/{pid}/tracks) succeeds
        err_404 = HTTPError("url", 404, "Not Found", {}, None)
        self.execute.side_effect = [err_404, {"ok": True}]

        res = await self.plugin.add_track_to_playlist("spotify:playlist:fallback_pl", "spotify:track:track1")
        self.assertTrue(res["ok"])
        self.assertEqual(res["playlist_id"], "fallback_pl")
        self.assertEqual(self.execute.await_count, 2)

    async def test_sync_native_spotify_folders_cdp(self):
        cdp_tree = [
            {"id": "cdp_f1", "name": "Vocal Trance", "playlists": [{"id": "pl1", "image_url": "https://img"}]}
        ]
        self.execute.return_value = cdp_tree
        folders = await self.plugin._sync_native_spotify_folders()
        self.assertGreaterEqual(len(folders), 1)
        self.assertEqual(folders[0]["name"], "Vocal Trance")

    def test_pid_file_lifecycle(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            pid_file = os.path.join(tmpdir, "test.pid")
            with patch.object(main, "LIBRESPOT_PID_FILE", pid_file):
                main.Plugin._write_pid(4321)
                self.assertTrue(os.path.isfile(pid_file))
                with open(pid_file, "r") as f:
                    self.assertEqual(f.read().strip(), "4321")

                main.Plugin._clear_pid()
                self.assertFalse(os.path.isfile(pid_file))
                # Idempotent second clear
                main.Plugin._clear_pid()
