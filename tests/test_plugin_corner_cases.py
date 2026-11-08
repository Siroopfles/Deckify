import asyncio
import io
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, Mock, patch
from urllib.error import HTTPError

sys.path.insert(0, os.path.dirname(__file__))
from test_token_refresh import main


class PluginCornerCasesTests(unittest.IsolatedAsyncioTestCase):
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

    # ── Token Refresh Edge Cases ───────────────────────────────

    async def test_ensure_token_expired_auth_grant_failure(self):
        # Force expiration
        self.plugin._token_expires_at = time.time() - 100
        self.plugin._token_retry_at = 0

        # Simulate Spotify returning 400 invalid_grant
        err_body = io.BytesIO(b'{"error": "invalid_grant"}')
        http_err = HTTPError("url", 400, "Bad Request", {}, err_body)
        self.execute.side_effect = http_err

        res = await self.plugin._ensure_token()
        self.assertIsNone(res)
        self.assertIsNone(self.plugin._access_token)
        self.assertIsNone(self.plugin._refresh_token)
        self.emit.assert_awaited_with("auth_expired")

    async def test_ensure_token_generic_exception(self):
        self.plugin._token_expires_at = time.time() - 100
        self.plugin._token_retry_at = 0
        self.execute.side_effect = RuntimeError("DNS resolution error")

        res = await self.plugin._ensure_token()
        self.assertIsNone(res)
        self.assertGreater(self.plugin._token_retry_at, time.monotonic())

    async def test_poll_playback_401_resets_expiry(self):
        http_err = HTTPError("url", 401, "Unauthorized", {}, None)
        self.execute.side_effect = http_err

        res = await self.plugin._poll_playback()
        self.assertTrue(res)
        self.assertEqual(self.plugin._token_expires_at, 0)

    # ── Engine Kill Timeout Fallback ───────────────────────────

    async def test_kill_librespot_timeout_sigkill(self):
        proc = MagicMock()
        proc.poll.return_value = None
        # First wait raises TimeoutExpired, second wait returns
        proc.wait.side_effect = [subprocess.TimeoutExpired(cmd="librespot", timeout=5), 0]
        self.plugin._process = proc

        await self.plugin._kill_librespot()
        proc.terminate.assert_called_once()
        proc.kill.assert_called_once()

    async def test_kill_spotify_client_timeout_fallback(self):
        proc = MagicMock()
        proc.poll.return_value = None
        proc.wait.side_effect = [subprocess.TimeoutExpired(cmd="flatpak", timeout=5), 0]
        self.plugin._spotify_client_process = proc

        kw_proc = MagicMock()
        kw_proc.poll.return_value = None
        kw_proc.wait.side_effect = [subprocess.TimeoutExpired(cmd="kwin", timeout=3), 0]
        self.plugin._kwin_process = kw_proc

        await self.plugin._kill_spotify_client()
        proc.kill.assert_called_once()
        kw_proc.kill.assert_called_once()

    # ── Live CDP Quality Sync ──────────────────────────────────

    async def test_sync_spotify_client_quality_cdp(self):
        # When process is None -> early return
        self.plugin._spotify_client_process = None
        await self.plugin._sync_spotify_client_quality_cdp("lossless")
        self.execute.assert_not_called()

        # When process is running
        proc = MagicMock()
        proc.poll.return_value = None
        self.plugin._spotify_client_process = proc

        await self.plugin._sync_spotify_client_quality_cdp("lossless")
        self.execute.assert_called_once()

        self.execute.reset_mock()
        await self.plugin._sync_spotify_client_quality_cdp("96")
        self.execute.assert_called_once()

    # ── Artist Library & Search Null Safety ────────────────────

    async def test_get_artist_albums_and_top_tracks_direct(self):
        self.execute.return_value = {
            "items": [
                {
                    "id": "alb-art-1",
                    "name": "Live in Paris",
                    "artists": [{"name": "Justice"}],
                    "images": [{"url": "https://img.com/live"}],
                    "total_tracks": 10,
                    "uri": "spotify:album:alb-art-1",
                }
            ],
            "total": 1,
        }
        res_alb = await self.plugin.get_artist_albums("art-justice")
        self.assertTrue(res_alb["ok"])
        self.assertEqual(len(res_alb["albums"]), 1)
        self.assertEqual(res_alb["albums"][0]["artist"], "Justice")

        self.execute.return_value = {
            "tracks": [
                {
                    "id": "top-1",
                    "name": "Genesis",
                    "artists": [{"name": "Justice"}],
                    "album": {"name": "Cross", "images": []},
                    "duration_ms": 230000,
                    "uri": "spotify:track:top-1",
                }
            ]
        }
        with patch.object(self.plugin, "_annotate_tracks_liked", new_callable=AsyncMock):
            res_top = await self.plugin.get_artist_top_tracks("art-justice")
            self.assertTrue(res_top["ok"])
            self.assertEqual(len(res_top["tracks"]), 1)

    # ── Dashboard Server Edge Routes & Error Responses ─────────

    async def test_dashboard_client_screenshot_success_and_fail(self):
        # 1. Success -> returns image/jpeg
        reader = MagicMock()
        reader.read = AsyncMock(return_value=b"GET /api/client-window/screenshot HTTP/1.1\r\n\r\n")
        writer = MagicMock()
        writer.write = MagicMock()
        writer.drain = AsyncMock()

        with patch.object(self.plugin, "capture_client_window_screenshot", new_callable=AsyncMock) as m_shot:
            m_shot.return_value = b"\xff\xd8\xffimage_data"
            await self.plugin._handle_dashboard_request(reader, writer)
            written = writer.write.call_args[0][0]
            self.assertIn(b"200 OK", written)
            self.assertIn(b"image/jpeg", written)

            # 2. Unavailable -> 404
            m_shot.return_value = None
            writer.reset_mock()
            await self.plugin._handle_dashboard_request(reader, writer)
            written_err = writer.write.call_args[0][0]
            self.assertIn(b"404 Not Found", written_err)

    async def test_dashboard_spa_fallback_and_timeout(self):
        # SPA routing serves index.html for non-api routes like /library
        reader = MagicMock()
        reader.read = AsyncMock(return_value=b"GET /library HTTP/1.1\r\n\r\n")
        writer = MagicMock()
        with patch.object(self.plugin, "_serve_static", new_callable=AsyncMock) as m_static:
            await self.plugin._handle_dashboard_request(reader, writer)
            m_static.assert_awaited_once_with(writer, "index.html")

        # TimeoutError on reading request closes writer cleanly
        reader_timeout = MagicMock()
        reader_timeout.read = AsyncMock(side_effect=asyncio.TimeoutError())
        writer_timeout = MagicMock()
        await self.plugin._handle_dashboard_request(reader_timeout, writer_timeout)
        writer_timeout.close.assert_called_once()
