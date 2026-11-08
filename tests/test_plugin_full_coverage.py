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
        self.plugin._sse = MagicMock()
        self.execute = self.enterContext(patch.object(main, "_exec", new_callable=AsyncMock))
        self.save = self.enterContext(patch.object(main, "_save_settings"))
        self.emit = self.enterContext(patch.object(main.decky, "emit", new_callable=AsyncMock))

    # ── Linux Joystick Events Reader ───────────────────────────

    def test_read_linux_joystick_events(self):
        js_struct = struct.Struct("<IhBB")
        # 1. Button event: time=100, val=1, type=1 (button), num=0 (A button)
        ev_btn_a = js_struct.pack(100, 1, 1, 0)
        # 2. Synthetic init event (ignored because 0x80 bit set)
        ev_init = js_struct.pack(100, 1, 0x81, 0)
        # 3. Axis event: time=100, val=-20000, type=2 (axis), num=0 (left)
        ev_axis_left = js_struct.pack(100, -20000, 2, 0)
        # 4. Axis event: time=100, val=20000, type=2, num=1 (down)
        ev_axis_down = js_struct.pack(100, 20000, 2, 1)
        # 5. Trigger event: time=100, val=20000, type=2, num=2 (lt)
        ev_axis_lt = js_struct.pack(100, 20000, 2, 2)

        data_stream = [
            ev_btn_a,
            ev_init,
            ev_axis_left,
            ev_axis_down,
            ev_axis_lt,
            b"",
            b"",
            b"",
        ]

        def fake_exists(p):
            return p == "/dev/input/js0"

        with patch("os.path.exists", side_effect=fake_exists), \
             patch("os.open", return_value=123), \
             patch("os.read", side_effect=data_stream):
            events = self.plugin._read_linux_joystick_events()
            self.assertIn("a", events)
            self.assertIn("left", events)
            self.assertIn("down", events)
            self.assertIn("lt", events)

    # ── Client Window Input Dispatcher ─────────────────────────

    async def test_send_client_window_input_types(self):
        async def fake_exec(fn, *a, **k):
            if callable(fn):
                return fn(*a)
            return None
        self.execute.side_effect = fake_exec

        with patch.object(main, "_cdp_call") as mock_cdp:
            # 1. Click
            res_click = await self.plugin.send_client_window_input({"type": "click", "x": 50, "y": 75, "button": "left"})
            self.assertTrue(res_click["ok"])
            self.assertGreaterEqual(mock_cdp.call_count, 3)

            # 2. Wheel
            mock_cdp.reset_mock()
            res_wheel = await self.plugin.send_client_window_input({"type": "wheel", "x": 100, "y": 200, "delta_y": 150})
            self.assertTrue(res_wheel["ok"])

            # 3. Text
            mock_cdp.reset_mock()
            res_text = await self.plugin.send_client_window_input({"type": "text", "text": "Hello Spotify"})
            self.assertTrue(res_text["ok"])

            # 4. Key (Enter and Tab)
            mock_cdp.reset_mock()
            res_key = await self.plugin.send_client_window_input({"type": "key", "key": "Enter"})
            self.assertTrue(res_key["ok"])
            res_tab = await self.plugin.send_client_window_input({"type": "key", "key": "Tab"})
            self.assertTrue(res_tab["ok"])

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

    # ── Dashboard Complex Request Endpoints ────────────────────

    async def test_dashboard_post_routes(self):
        routes = [
            ("POST /api/folders HTTP/1.1\r\n\r\n", "manage_playlist_folder"),
            ("POST /api/seek HTTP/1.1\r\n\r\n", "seek_playback"),
            ("POST /api/shuffle HTTP/1.1\r\n\r\n", "set_shuffle"),
            ("POST /api/repeat HTTP/1.1\r\n\r\n", "set_repeat"),
            ("POST /api/like HTTP/1.1\r\n\r\n", "toggle_like_track"),
            ("POST /api/queue HTTP/1.1\r\n\r\n", "add_to_queue"),
            ("POST /api/transfer HTTP/1.1\r\n\r\n", "transfer_playback"),
            ("POST /api/play HTTP/1.1\r\n\r\n", "play_tracks"),
            ("POST /api/native-mix HTTP/1.1\r\n\r\n", "set_native_playlist_mix"),
            ("POST /api/gamepad/push HTTP/1.1\r\n\r\n", "push_gamepad_events"),
        ]

        for req_raw, target_fn in routes:
            with self.subTest(route=req_raw):
                reader = MagicMock()
                reader.read = AsyncMock(return_value=req_raw.encode("utf-8"))
                writer = MagicMock()
                writer.write = MagicMock()
                writer.drain = AsyncMock()

                if hasattr(self.plugin, target_fn):
                    target_attr = getattr(self.plugin, target_fn)
                    if inspect.iscoroutinefunction(target_attr):
                        with patch.object(self.plugin, target_fn, new_callable=AsyncMock) as m_target:
                            m_target.return_value = {"ok": True}
                            await self.plugin._handle_dashboard_request(reader, writer)
                            m_target.assert_awaited()
                    else:
                        with patch.object(self.plugin, target_fn) as m_target:
                            m_target.return_value = {"ok": True}
                            await self.plugin._handle_dashboard_request(reader, writer)
                            m_target.assert_called()
                written = writer.write.call_args[0][0]
                self.assertIn(b"200 OK", written)

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

    def test_close_gamepad_fds(self):
        mock_fd = 999
        self.plugin._js_fds = {"/dev/input/js0": mock_fd}
        self.plugin._js_axis_state = {("/dev/input/js0", 0): 1}

        with patch("os.close") as mock_close:
            self.plugin._close_gamepad_fds()
            mock_close.assert_called_once_with(mock_fd)
            self.assertEqual(len(self.plugin._js_fds), 0)
            self.assertEqual(len(self.plugin._js_axis_state), 0)

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

    async def test_dashboard_settings_post_handling(self):
        body = json.dumps({
            "audio_backend": "librespot",
            "audio_quality": "320",
            "normalisation": True,
            "gapless": True,
            "autoplay": True,
        }).encode("utf-8")
        reader = MagicMock()
        reader.read = AsyncMock(return_value=b"POST /api/settings HTTP/1.1\r\n\r\n" + body)
        writer = MagicMock()
        writer.write = MagicMock()
        writer.drain = AsyncMock()

        await self.plugin._handle_dashboard_request(reader, writer)
        written = writer.write.call_args[0][0]
        self.assertIn(b"200 OK", written)
        self.assertIn(b'"ok": true', written)
