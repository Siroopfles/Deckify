import asyncio
import io
import json
import os
import sys
import tempfile
import time
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, Mock, patch

sys.path.insert(0, os.path.dirname(__file__))
from test_token_refresh import main


class PluginLifecycleTests(unittest.IsolatedAsyncioTestCase):
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

    # ── Startup & Teardown ─────────────────────────────────────

    async def test_main_lifecycle(self):
        with patch.object(main, "_load_settings", return_value={"access_token": "valid"}), \
             patch.object(self.plugin, "_start_dashboard", new_callable=AsyncMock) as m_dash, \
             patch.object(self.plugin, "_steam_gamepad_bridge_worker", new_callable=AsyncMock), \
             patch.object(self.plugin, "_start_api_poll") as m_poll, \
             patch.object(self.plugin, "_sync_native_spotify_folders", new_callable=AsyncMock) as m_folders, \
             patch.object(self.plugin, "start_librespot", new_callable=AsyncMock) as m_librespot, \
             patch.object(main, "SuspendResumeMonitor"):
            await self.plugin._main()
            m_dash.assert_awaited_once()
            m_poll.assert_called_once()
            m_folders.assert_awaited_once()
            m_librespot.assert_awaited_once()

    async def test_unload_and_uninstall(self):
        with patch.object(self.plugin, "_stop_monitor", new_callable=AsyncMock) as m_mon, \
             patch.object(self.plugin, "_kill_librespot", new_callable=AsyncMock) as m_klib, \
             patch.object(self.plugin, "_kill_spotify_client", new_callable=AsyncMock) as m_ksp, \
             patch.object(self.plugin, "_stop_dashboard", new_callable=AsyncMock) as m_dash, \
             patch.object(self.plugin, "_stop_oauth_server", new_callable=AsyncMock) as m_oauth, \
             patch.object(self.plugin, "_stop_api_poll", new_callable=AsyncMock) as m_poll:
            await self.plugin._unload()
            m_mon.assert_awaited_once()
            m_klib.assert_awaited_once()
            m_ksp.assert_awaited_once()
            m_dash.assert_awaited_once()
            m_oauth.assert_awaited_once()
            m_poll.assert_awaited_once()

            await self.plugin._uninstall()

    # ── Engine Startup & Switching ─────────────────────────────

    async def test_start_spotify_client_already_running(self):
        proc = MagicMock()
        proc.poll.return_value = None
        self.plugin._spotify_client_process = proc

        res = await self.plugin.start_spotify_client()
        self.assertTrue(res["ok"])
        self.assertEqual(res["message"], "already running")

    async def test_start_spotify_client_launch(self):
        with patch("subprocess.Popen") as mock_popen, \
             patch("glob.glob", side_effect=[["/tmp/.X11-unix/X0"], ["/tmp/.X11-unix/X0", "/tmp/.X11-unix/X2"]]), \
             patch("asyncio.sleep", new_callable=AsyncMock), \
             patch.object(self.plugin, "_write_spotify_client_prefs"), \
             patch.object(self.plugin, "_configure_pipewire_clock", new_callable=AsyncMock):
            mock_proc = MagicMock()
            mock_proc.pid = 9999
            mock_proc.poll.return_value = None
            mock_popen.return_value = mock_proc

            res = await self.plugin.start_spotify_client()
            self.assertTrue(res["ok"])
            self.assertEqual(res["pid"], 9999)
            self.assertEqual(self.plugin._virtual_display, ":2")

    async def test_start_spotify_client_failure(self):
        with patch("subprocess.Popen", side_effect=RuntimeError("Cannot spawn kwin")), \
             patch.object(self.plugin, "_write_spotify_client_prefs"), \
             patch.object(self.plugin, "_configure_pipewire_clock", new_callable=AsyncMock):
            res = await self.plugin.start_spotify_client()
            self.assertFalse(res["ok"])
            self.assertIn("Cannot spawn kwin", res["error"])

    async def test_stop_spotify_client(self):
        with patch.object(self.plugin, "_kill_spotify_client", new_callable=AsyncMock) as m_kill:
            res = await self.plugin.stop_spotify_client()
            self.assertTrue(res["ok"])
            m_kill.assert_awaited_once()

    async def test_start_librespot_branches(self):
        # 1. When backend is spotify_client, delegates
        self.plugin._settings["audio_backend"] = "spotify_client"
        with patch.object(self.plugin, "start_spotify_client", new_callable=AsyncMock) as m_sp:
            m_sp.return_value = {"ok": True}
            res = await self.plugin.start_librespot()
            self.assertTrue(res["ok"])
            m_sp.assert_awaited_once()

        # 2. When backend is librespot but binary missing
        self.plugin._settings["audio_backend"] = "librespot"
        with patch("os.path.isfile", return_value=False):
            res_no_bin = await self.plugin.start_librespot()
            self.assertFalse(res_no_bin["ok"])
            self.assertIn("not found", res_no_bin["error"])

        # 3. Successful launch
        with patch("os.path.isfile", return_value=True), \
             patch("os.access", return_value=True), \
             patch("subprocess.Popen") as mock_popen, \
             patch.object(self.plugin, "_kill_stale_librespot"):
            mock_proc = MagicMock()
            mock_proc.pid = 5555
            mock_proc.poll.return_value = None
            mock_popen.return_value = mock_proc

            res_ok = await self.plugin.start_librespot()
            self.assertTrue(res_ok["ok"])
            self.assertEqual(res_ok["pid"], 5555)

    async def test_stop_librespot(self):
        with patch.object(self.plugin, "_kill_librespot", new_callable=AsyncMock) as m_kill:
            res = await self.plugin.stop_librespot()
            self.assertTrue(res["ok"])
            m_kill.assert_awaited_once()

    # ── Process Crash & Auto-Restart Monitor ────────────────────

    async def test_monitor_process_crash_and_max_limit(self):
        crashed_proc = MagicMock()
        crashed_proc.poll.return_value = 1
        crashed_proc.returncode = 1
        self.plugin._process = crashed_proc
        self.plugin._settings["audio_backend"] = "librespot"

        async def mock_start():
            # Reset crashed proc so next tick triggers another crash
            self.plugin._process = crashed_proc
            return {"ok": True}

        async def fake_sleep(duration):
            if len(self.plugin._crash_timestamps) >= 5:
                raise asyncio.CancelledError()

        with patch("asyncio.sleep", side_effect=fake_sleep), \
             patch.object(self.plugin, "start_librespot", side_effect=mock_start), \
             patch.object(self.plugin, "_boost_pa_volume", new_callable=AsyncMock), \
             patch.object(self.plugin, "_refresh_audio_stream_info", new_callable=AsyncMock):
            await self.plugin._monitor_process()

        self.assertGreaterEqual(len(self.plugin._crash_timestamps), 5)

    async def test_poll_api_loop_cancellation(self):
        async def fake_sleep(d):
            raise asyncio.CancelledError()

        with patch.object(self.plugin, "_poll_playback", new_callable=AsyncMock) as m_poll, \
             patch("asyncio.sleep", side_effect=fake_sleep):
            await self.plugin._poll_api_loop()
            m_poll.assert_awaited_once()

    # ── OAuth Server & Connection Handlers ──────────────────────

    async def test_oauth_flow_methods(self):
        self.plugin._dashboard_server = MagicMock()
        # 1. start_oauth
        with patch.object(main, "_ensure_ssl_cert", return_value=(MagicMock(), None)), \
             patch("asyncio.start_server", new_callable=AsyncMock) as mock_srv:
            res = await self.plugin.start_oauth()
            self.assertTrue(res["ok"])
            self.assertIn("landing_url", res)
            mock_srv.assert_awaited_once()

        # 2. get_auth_status
        status = await self.plugin.get_auth_status()
        self.assertTrue(status["authenticated"])

        # 3. logout_spotify
        with patch.object(self.plugin, "_stop_api_poll", new_callable=AsyncMock):
            res_logout = await self.plugin.logout_spotify()
            self.assertTrue(res_logout["ok"])
            self.assertIsNone(self.plugin._access_token)

        # 4. get_dashboard_url
        dash = await self.plugin.get_dashboard_url()
        self.assertTrue(dash["ok"])
        self.assertIn("39282", dash["url"])

    async def test_handle_oauth_callback(self):
        writer = MagicMock()
        writer.write = MagicMock()
        writer.drain = AsyncMock()

        # Missing code query
        await self.plugin._handle_oauth_callback("", writer)
        written = writer.write.call_args[0][0]
        self.assertIn(b"400 Bad Request", written)

        # Successful code exchange
        self.execute.return_value = {
            "access_token": "new-token",
            "refresh_token": "new-refresh",
            "expires_in": 3600,
        }
        with patch.object(self.plugin, "_start_api_poll"):
            await self.plugin._handle_oauth_callback("code=my_auth_code", writer)
            self.assertEqual(self.plugin._access_token, "new-token")
            ok_written = writer.write.call_args[0][0]
            self.assertIn(b"Authorization Successful", ok_written)

    async def test_send_landing_page_and_redirects(self):
        writer = MagicMock()
        writer.write = MagicMock()
        writer.drain = AsyncMock()

        await self.plugin._send_landing_page(writer)
        written = writer.write.call_args[0][0]
        self.assertIn(b"Connect your Spotify account", written)

        await self.plugin._redirect_to_spotify("test_client_id", writer)
        redir_written = writer.write.call_args[0][0]
        self.assertIn(b"302 Found", redir_written)
        self.assertIn(b"Location: https://accounts.spotify.com/authorize", redir_written)

    # ── Client Window Screenshot & Input ───────────────────────

    async def test_client_window_operations(self):
        # 1. Status
        self.execute.return_value = {"title": "Spotify", "url": "https://open.spotify.com"}
        st = await self.plugin.get_client_window_status()
        self.assertTrue(st["ok"])
        self.assertTrue(st["logged_in"])

        # 2. Screenshot
        import base64
        fake_img_b64 = base64.b64encode(b"\xff\xd8\xffdummy").decode("ascii")
        self.execute.return_value = {"data": fake_img_b64}
        shot = await self.plugin.capture_client_window_screenshot()
        self.assertIsNotNone(shot)
        self.assertTrue(shot.startswith(b"\xff\xd8\xff"))

        # 3. Input click & key
        self.execute.return_value = {}
        click_res = await self.plugin.send_client_window_input({"type": "click", "x": 100, "y": 200})
        self.assertTrue(click_res["ok"])

        key_res = await self.plugin.send_client_window_input({"type": "key", "key": "Space"})
        self.assertTrue(key_res["ok"])

        bad_res = await self.plugin.send_client_window_input({"type": "unknown"})
        self.assertFalse(bad_res["ok"])
