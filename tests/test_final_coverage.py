import asyncio
import base64
import errno
import inspect
import json
import os
import socket
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
from py_modules import common, device, engine, server


class FinalCoverageTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.plugin = main.Plugin()
        self.plugin._token_refresh_lock = asyncio.Lock()
        self.plugin._access_token = "valid-token"
        self.plugin._refresh_token = "valid-refresh"
        self.plugin._token_expires_at = time.time() + 3600
        self.plugin._settings = dict(main.DEFAULT_SETTINGS)
        self.plugin._sse = MagicMock()
        self.execute = self.enterContext(patch.object(main, "_exec", new_callable=AsyncMock))
        self.save = self.enterContext(patch.object(main, "_save_settings"))
        self.emit = self.enterContext(patch.object(main.decky, "emit", new_callable=AsyncMock))

    # ── PyModules Common Coverage ─────────────────────────────

    def test_common_load_settings_malformed_fields(self):
        with tempfile.NamedTemporaryFile("w+", delete=False) as f:
            f.write(json.dumps({
                "playlist_folders": "not-a-list",
                "spotify_folder_tree": 12345,
                "game_audio_profiles": "not-a-dict",
                "audio_backend": "invalid_backend",
                "audio_quality": "9999",
            }))
            temp_path = f.name
        try:
            cfg = common._load_settings(temp_path)
            self.assertEqual(cfg["playlist_folders"], [])
            self.assertEqual(cfg["spotify_folder_tree"], [])
            self.assertEqual(cfg["game_audio_profiles"], {})
            self.assertEqual(cfg["audio_backend"], "librespot")
            self.assertEqual(cfg["audio_quality"], "320")
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)

    # ── PyModules Server Coverage ─────────────────────────────

    async def test_server_sse_empty_and_dead_clients(self):
        mgr = server.SSEManager()
        # Broadcast with no clients
        await mgr.broadcast("test", {"hello": "world"})
        # Heartbeats with no clients
        await mgr.send_heartbeats()

        # Add mock client that fails on heartbeat write
        dead_writer = MagicMock()
        dead_writer.drain = AsyncMock(side_effect=Exception("Broken pipe"))
        dead_writer.write = MagicMock()
        await mgr.add_client(dead_writer)
        self.assertEqual(len(mgr._clients), 1)

        await mgr.send_heartbeats()
        self.assertEqual(len(mgr._clients), 0)

    # ── PyModules Device Coverage ─────────────────────────────

    async def test_device_suspend_monitor_edge_cases(self):
        mon = device.SuspendResumeMonitor()

        async def fail_sleep():
            mon._running = False
            raise Exception("sleep fail")

        mon.on_sleep = fail_sleep

        # test stop with failing proc terminate
        mock_proc = MagicMock()
        mock_proc.terminate.side_effect = Exception("boom")
        mock_proc.wait = AsyncMock()
        mon._proc = mock_proc
        mon._running = True
        await mon.stop()
        self.assertIsNone(mon._proc)

        # test _monitor_loop when stdout is None
        with patch("os.path.exists", return_value=True), \
             patch("asyncio.create_subprocess_exec") as mock_exec:
            proc_no_out = MagicMock()
            proc_no_out.stdout = None
            mock_exec.return_value = proc_no_out
            mon._running = True
            await mon._monitor_loop()

        # test _monitor_loop when line triggers sleep callback
        with patch("os.path.exists", return_value=True), \
             patch("asyncio.create_subprocess_exec") as mock_exec:
            proc_out = MagicMock()
            proc_out.stdout.readline = AsyncMock(return_value=b"PrepareForSleep=true\n")
            mock_exec.return_value = proc_out
            mon._running = True
            await mon._monitor_loop()
            self.assertFalse(mon._running)

    # ── PyModules Engine Coverage ─────────────────────────────

    def test_engine_cdp_large_frame_and_eval_exceptions(self):
        # Test _cdp_call with > 65535 byte payload and 127 length
        large_params = {"big": "A" * 70000}
        with patch("py_modules.engine._cdp_get_page_target") as mock_tgt, \
             patch("socket.create_connection") as mock_sock_conn:
            mock_tgt.return_value = {"webSocketDebuggerUrl": "ws://127.0.0.1:9222/devtools/page/1"}
            mock_sock = MagicMock()
            msg_payload = b'{"id":1,"result":"ok"}'
            frame = bytearray([0x81, len(msg_payload)]) + msg_payload
            # handshake response, followed by frame, followed by b"" (EOF)
            mock_sock.recv.side_effect = [
                b"HTTP/1.1 101 Switching Protocols\r\n\r\n",
                frame,
                b"",
            ]
            mock_sock_conn.return_value = mock_sock

            res = engine._cdp_call("Test.large", large_params)
            self.assertEqual(res, "ok")

        # Test _inject_steam_gamepad_bridge_sync exception handler
        with patch("py_modules.engine._cdp_evaluate", side_effect=Exception("CDP fail")):
            self.assertFalse(engine._inject_steam_gamepad_bridge_sync())

        # Test _fetch_spotify_cdp_folder_tree exception handler
        with patch("py_modules.engine._cdp_evaluate", side_effect=Exception("CDP fail")):
            self.assertIsNone(engine._fetch_spotify_cdp_folder_tree())

    # ── Official Spotify Client Preferences Coverage ──────────

    def test_write_spotify_client_prefs_multi_user(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            users_dir = os.path.join(tmp_dir, "Users")
            os.makedirs(os.path.join(users_dir, "user1"), exist_ok=True)
            os.makedirs(os.path.join(users_dir, "user2"), exist_ok=True)
            with open(os.path.join(users_dir, "user1", "prefs"), "w") as f:
                f.write('audio.sync_bitrate_4=320\n')

            with patch.object(main, "SPOTIFY_CLIENT_CONFIG_DIR", tmp_dir), \
                 patch("os.geteuid", return_value=0, create=True), \
                 patch("os.chown", create=True) as mock_chown:
                self.plugin._write_spotify_client_prefs()
                self.assertTrue(os.path.exists(os.path.join(tmp_dir, "prefs")))
                self.assertTrue(os.path.exists(os.path.join(users_dir, "user1", "prefs")))
                self.assertTrue(os.path.exists(os.path.join(users_dir, "user2", "prefs")))
                mock_chown.assert_called()

    # ── start_librespot & backend settings ─────────────────────

    async def test_start_librespot_failure(self):
        with patch("os.path.isfile", return_value=True), \
             patch("subprocess.Popen", side_effect=OSError("binary not executable")):
            res = await self.plugin.start_librespot()
            self.assertFalse(res["ok"])
            self.assertIn("binary not executable", res["error"])

    async def test_set_setting_bitrate_and_bounds(self):
        # Bitrate setting
        res_err = await self.plugin.set_setting("bitrate", "invalid")
        self.assertFalse(res_err["ok"])
        res_err2 = await self.plugin.set_setting("bitrate", 500)
        self.assertFalse(res_err2["ok"])
        res_ok = await self.plugin.set_setting("bitrate", "160")
        self.assertTrue(res_ok["ok"])
        self.assertEqual(self.plugin._settings["bitrate"], 160)
        self.assertEqual(self.plugin._settings["audio_quality"], "160")

        # normalisation_pregain clamp & error
        res_clamped = await self.plugin.set_setting("normalisation_pregain", 25.0)
        self.assertTrue(res_clamped["ok"])
        self.assertEqual(self.plugin._settings["normalisation_pregain"], 10.0)
        res_invalid = await self.plugin.set_setting("normalisation_pregain", "not_a_num")
        self.assertFalse(res_invalid["ok"])

        # playlist_folders invalid type
        res_pf_err = await self.plugin.set_setting("playlist_folders", "not_a_list")
        self.assertFalse(res_pf_err["ok"])

    async def test_switch_audio_backend_and_status(self):
        with patch.object(self.plugin, "start_librespot", new_callable=AsyncMock) as m_ls:
            m_ls.return_value = {"ok": True}
            res = await self.plugin.switch_audio_backend("librespot")
            self.assertTrue(res["ok"])

        status = await self.plugin.get_status()
        self.assertIn("running", status)
        self.assertIn("settings", status)

    # ── Playback & Queue Edge Cases ────────────────────────────

    async def test_auto_transfer_and_play_branches(self):
        # 1. No device_id provided, fetch devices succeeds and picks first
        self.execute.side_effect = [
            {"devices": [{"id": "d1", "name": "Deck"}]},  # me/player/devices
            {"ok": True},  # me/player PUT
        ]
        res1 = await self.plugin._auto_transfer_and_play("token", "")
        self.assertTrue(res1["ok"])

        # 2. No device_id provided, fetch devices returns empty list
        self.execute.side_effect = [{"devices": []}]
        res2 = await self.plugin._auto_transfer_and_play("token", "")
        self.assertFalse(res2["ok"])
        self.assertIn("No active device", res2["error"])

        # 3. PUT me/player raises exception
        self.execute.side_effect = Exception("Network error")
        res3 = await self.plugin._auto_transfer_and_play("token", "d1")
        self.assertFalse(res3["ok"])

    async def test_playback_controls_404_and_exceptions(self):
        err_404 = HTTPError("url", 404, "Not Found", {}, None)

        # seek_playback 404 and exception
        self.execute.side_effect = err_404
        r_seek_404 = await self.plugin.seek_playback(1000)
        self.assertFalse(r_seek_404["ok"])
        self.assertIn("No active device", r_seek_404["error"])

        self.execute.side_effect = Exception("Seek fail")
        r_seek_err = await self.plugin.seek_playback(1000)
        self.assertFalse(r_seek_err["ok"])

        # set_shuffle 404 and exception
        self.execute.side_effect = err_404
        r_shuf_404 = await self.plugin.set_shuffle(True, device_id="d1")
        self.assertFalse(r_shuf_404["ok"])

        self.execute.side_effect = Exception("Shuf fail")
        r_shuf_err = await self.plugin.set_shuffle(True)
        self.assertFalse(r_shuf_err["ok"])

        # set_repeat 404 and exception
        self.execute.side_effect = err_404
        r_rep_404 = await self.plugin.set_repeat("track", device_id="d1")
        self.assertFalse(r_rep_404["ok"])

        self.execute.side_effect = Exception("Rep fail")
        r_rep_err = await self.plugin.set_repeat("track")
        self.assertFalse(r_rep_err["ok"])

        # set_volume 404 and exception
        self.execute.side_effect = err_404
        r_vol_404 = await self.plugin.set_volume(50)
        self.assertFalse(r_vol_404["ok"])

        self.execute.side_effect = Exception("Vol fail")
        r_vol_err = await self.plugin.set_volume(50)
        self.assertFalse(r_vol_err["ok"])

        # add_to_queue 404 and exception
        self.execute.side_effect = err_404
        r_q_404 = await self.plugin.add_to_queue("spotify:track:123", device_id="d1")
        self.assertFalse(r_q_404["ok"])

        self.execute.side_effect = Exception("Queue fail")
        r_q_err = await self.plugin.add_to_queue("spotify:track:123")
        self.assertFalse(r_q_err["ok"])

        # transfer_playback exception
        self.execute.side_effect = Exception("Transfer fail")
        r_tf_err = await self.plugin.transfer_playback("d1")
        self.assertFalse(r_tf_err["ok"])

    async def test_get_queue_episode_and_empty(self):
        # Empty queue
        self.execute.return_value = None
        q_empty = await self.plugin.get_queue()
        self.assertTrue(q_empty["ok"])
        self.assertEqual(q_empty["queue"], [])

        # Episode currently playing and in queue
        self.execute.side_effect = [
            {
                "currently_playing": {
                    "type": "episode",
                    "id": "ep1",
                    "name": "Podcast Ep",
                    "show": {"name": "Tech Talk", "images": [{"url": "https://img/ep"}]},
                    "uri": "spotify:episode:ep1",
                    "duration_ms": 300000,
                },
                "queue": [
                    {
                        "type": "episode",
                        "id": "ep2",
                        "name": "Podcast Ep 2",
                        "show": {"name": "Tech Talk"},
                        "uri": "spotify:episode:ep2",
                        "duration_ms": 120000,
                    }
                ],
            },
            [False, False],  # me/library/contains
        ]
        q_ep = await self.plugin.get_queue()
        self.assertTrue(q_ep["ok"])
        self.assertEqual(q_ep["currently_playing"]["artist"], "Tech Talk")

    async def test_toggle_like_track_other_track_and_error(self):
        # Target ID different from poll_track_id, liked=None
        self.plugin._poll_track_id = "poll1"
        self.execute.side_effect = [
            [False],  # me/library/contains
            {"ok": True},  # me/library PUT
        ]
        r1 = await self.plugin.toggle_like_track("spotify:track:other_id")
        self.assertTrue(r1["ok"])
        self.assertEqual(r1["track_id"], "other_id")
        self.assertTrue(r1["is_liked"])

        # Exception during toggle
        self.execute.side_effect = Exception("Toggle error")
        r2 = await self.plugin.toggle_like_track("spotify:track:other_id", liked=True)
        self.assertFalse(r2["ok"])

    async def test_artist_top_tracks_403_fallback(self):
        err_403 = HTTPError("url", 403, "Forbidden", {}, None)
        self.execute.side_effect = [
            err_403,  # top-tracks fails with 403
            {"name": "Artist X"},  # artists/{id}
            {"tracks": {"items": [{"id": "t1", "name": "Song 1", "artists": [{"name": "Artist X"}]}]}},  # search
            [False],  # me/library/contains
        ]
        res = await self.plugin.get_artist_top_tracks("art1")
        self.assertTrue(res["ok"])
        self.assertEqual(len(res["tracks"]), 1)
        self.assertEqual(res["tracks"][0]["name"], "Song 1")

        # Non-403 error re-raised
        err_500 = HTTPError("url", 500, "Server Error", {}, None)
        self.execute.side_effect = err_500
        res_err = await self.plugin.get_artist_top_tracks("art1")
        self.assertFalse(res_err["ok"])

    async def test_search_spotify_and_recommendations(self):
        # Search returning empty data
        self.execute.return_value = None
        s_none = await self.plugin.search_spotify("test")
        self.assertTrue(s_none["ok"])
        self.assertEqual(s_none["tracks"], [])

        # Recommendations with spotify:track: prefix
        self.execute.return_value = {"tracks": [{"id": "rec1", "name": "Rec 1", "artists": [{"name": "A"}]}]}
        rec = await self.plugin.get_track_recommendations("spotify:track:seed123")
        self.assertTrue(rec["ok"])
        self.assertEqual(len(rec["tracks"]), 1)

    async def test_play_tracks_404_auto_transfer_retry(self):
        err_404 = HTTPError("url", 404, "Not Found", {}, None)
        self.execute.side_effect = [
            err_404,  # me/player/play 404
            {"devices": [{"id": "d1"}]},  # devices
            {"ok": True},  # me/player transfer PUT
            {"ok": True},  # me/player/play retry PUT
        ]
        with patch("asyncio.sleep", new_callable=AsyncMock):
            res = await self.plugin.play_tracks(context_uri="spotify:album:123")
            self.assertTrue(res["ok"])

    # ── Official Client Remote Window Status & Gamepad ────────

    async def test_client_window_status_and_joystick_err(self):
        # 1. Client not running
        self.plugin._spotify_client_process = None
        self.execute.return_value = None
        stat1 = await self.plugin.get_client_window_status()
        self.assertFalse(stat1["running"])

        # 2. Client running but target is None (starting up)
        mock_proc = MagicMock()
        mock_proc.poll.return_value = None
        self.plugin._spotify_client_process = mock_proc
        self.execute.return_value = None
        stat2 = await self.plugin.get_client_window_status()
        self.assertTrue(stat2["running"])
        self.assertEqual(stat2["title"], "Starting...")

        # 3. Joystick read OSError closing fd
        with patch("os.path.exists", return_value=True), \
             patch("os.open", return_value=42), \
             patch("os.close") as mock_close, \
             patch("os.read", side_effect=OSError(errno.EBADF, "Bad file descriptor")):
            evs = self.plugin._read_linux_joystick_events()
            self.assertEqual(evs, [])
            mock_close.assert_called()

    # ── Dashboard Server Route Edge Cases ─────────────────────

    async def test_dashboard_routes_and_edge_cases(self):
        # Empty request closes writer
        writer_empty = MagicMock()
        writer_empty.close = MagicMock()
        await self.plugin._handle_dashboard_request(AsyncMock(read=AsyncMock(return_value=b"")), writer_empty)
        writer_empty.close.assert_called()

        # Bad request line (< 2 parts)
        writer_bad = MagicMock()
        writer_bad.write = MagicMock()
        writer_bad.drain = AsyncMock()
        writer_bad.close = MagicMock()
        await self.plugin._handle_dashboard_request(AsyncMock(read=AsyncMock(return_value=b"GARBAGE\r\n")), writer_bad)
        self.assertIn(b"400 Bad Request", writer_bad.write.call_args[0][0])

        # POST without required params: /api/control, /api/volume, /api/search
        for req_bytes, exp_status in [
            (b"POST /api/control HTTP/1.1\r\n\r\n", b"400 Bad Request"),
            (b"POST /api/volume HTTP/1.1\r\n\r\n", b"400 Bad Request"),
            (b"GET /api/search HTTP/1.1\r\n\r\n", b"400 Bad Request"),
        ]:
            writer = MagicMock()
            writer.write = MagicMock()
            writer.drain = AsyncMock()
            writer.close = MagicMock()
            await self.plugin._handle_dashboard_request(AsyncMock(read=AsyncMock(return_value=req_bytes)), writer)
            self.assertIn(exp_status, writer.write.call_args[0][0])

        # Path traversal in _serve_static returns 403
        writer_trav = MagicMock()
        writer_trav.write = MagicMock()
        writer_trav.drain = AsyncMock()
        writer_trav.close = MagicMock()
        await self.plugin._serve_static(writer_trav, "../../secret.txt")
        written = writer_trav.write.call_args[0][0]
        self.assertIn(b"403", written)
        self.assertIn(b"Forbidden", written)

        # Test POST /api/native-mix
        with patch.object(self.plugin, "set_native_playlist_mix", new_callable=AsyncMock) as m_mix:
            m_mix.return_value = {"ok": True}
            writer = MagicMock()
            writer.write = MagicMock()
            writer.drain = AsyncMock()
            writer.close = MagicMock()
            payload = json.dumps({"playlist_id": "pl1", "enabled": True, "play_now": False}).encode()
            req = b"POST /api/native-mix HTTP/1.1\r\nContent-Length: " + str(len(payload)).encode() + b"\r\n\r\n" + payload
            await self.plugin._handle_dashboard_request(AsyncMock(read=AsyncMock(return_value=req)), writer)
            m_mix.assert_awaited()
            self.assertIn(b"200 OK", writer.write.call_args[0][0])

        # Test GET /api/events (SSE)
        writer_sse = MagicMock()
        writer_sse.write = MagicMock()
        writer_sse.drain = AsyncMock()
        self.plugin._sse = MagicMock(add_client=AsyncMock())
        await self.plugin._serve_sse_events(writer_sse)
        self.plugin._sse.add_client.assert_awaited()

        # Test _broadcast_status_sse
        self.plugin._sse.broadcast = AsyncMock()
        await self.plugin._broadcast_status_sse()
        self.plugin._sse.broadcast.assert_awaited()

    # ── Process Monitor & Stale Librespot ──────────────────────

    def test_kill_stale_librespot_process_alive(self):
        with tempfile.NamedTemporaryFile("w+", delete=False) as f:
            f.write("12345\n")
            pid_file = f.name
        try:
            with patch.object(main, "LIBRESPOT_PID_FILE", pid_file), \
                 patch("os.kill") as mock_kill, \
                 patch.object(self.plugin, "_clear_pid") as mock_clear:
                # First call is os.kill(pid, 0) -> alive. Second call is os.kill(pid, 15).
                mock_kill.side_effect = [None, None]
                self.plugin._kill_stale_librespot()
                self.assertEqual(mock_kill.call_count, 2)
                mock_clear.assert_called()
        finally:
            if os.path.exists(pid_file):
                os.remove(pid_file)

    async def test_monitor_wake_gap_for_spotify_client(self):
        self.plugin._settings["audio_backend"] = "spotify_client"
        mock_proc = MagicMock()
        mock_proc.poll.return_value = None
        self.plugin._spotify_client_process = mock_proc

        with patch.object(self.plugin, "_kill_spotify_client", new_callable=AsyncMock) as m_kill, \
             patch.object(self.plugin, "start_spotify_client", new_callable=AsyncMock) as m_start, \
             patch.object(self.plugin, "_refresh_audio_stream_info", new_callable=AsyncMock), \
             patch("time.time") as mock_time, \
             patch("asyncio.sleep", side_effect=asyncio.CancelledError):
            # Advance time by 45s to trigger SUSPEND_THRESHOLD
            mock_time.side_effect = [100.0, 100.0, 145.0, 145.0, 145.0, 145.0]
            try:
                await self.plugin._monitor_process()
            except asyncio.CancelledError:
                pass
            m_kill.assert_awaited()
            m_start.assert_awaited()

    async def test_monitor_crash_auto_restart_failed(self):
        self.plugin._settings["audio_backend"] = "librespot"
        mock_proc = MagicMock()
        mock_proc.poll.return_value = 1
        mock_proc.returncode = 1
        self.plugin._process = mock_proc

        with patch.object(self.plugin, "start_librespot", new_callable=AsyncMock) as m_start, \
             patch.object(self.plugin, "_refresh_audio_stream_info", new_callable=AsyncMock), \
             patch("asyncio.sleep", new_callable=AsyncMock):
            m_start.return_value = {"ok": False, "error": "Crash loop"}
            await self.plugin._monitor_process()
            self.emit.assert_awaited()
            self.assertIn("Auto-restart failed", self.emit.call_args[0][1]["error"])

    # ── OAuth server helper coverage ──────────────────────────

    async def test_handle_auth_redirect_and_missing_client(self):
        # Missing client_id
        writer_err = MagicMock()
        writer_err.write = MagicMock()
        writer_err.drain = AsyncMock()
        writer_err.close = MagicMock()
        await self.plugin._handle_auth_redirect("", writer_err)
        self.assertIn(b"Missing client_id", writer_err.write.call_args[0][0])

        # Valid client_id redirect
        writer_ok = MagicMock()
        writer_ok.write = MagicMock()
        writer_ok.drain = AsyncMock()
        writer_ok.close = MagicMock()
        await self.plugin._handle_auth_redirect("client_id=my_client_id", writer_ok)
        self.assertEqual(self.plugin._settings["spotify_client_id"], "my_client_id")
        self.assertIn(b"302 Found", writer_ok.write.call_args[0][0])

    async def test_dashboard_lifecycle_and_advanced_routes(self):
        # 1. get_dashboard_url when server is None
        self.plugin._dashboard_server = None
        d_err = await self.plugin.get_dashboard_url()
        self.assertFalse(d_err["ok"])

        # 2. _start_dashboard & _stop_dashboard
        with patch("asyncio.start_server", new_callable=AsyncMock) as m_srv:
            mock_server = MagicMock()
            mock_server.wait_closed = AsyncMock()
            m_srv.return_value = mock_server
            await self.plugin._start_dashboard()
            self.assertEqual(self.plugin._dashboard_server, mock_server)
            # calling when already started does nothing
            await self.plugin._start_dashboard()

            await self.plugin._stop_dashboard()
            self.assertIsNone(self.plugin._dashboard_server)

        # 3. Invalid JSON body in POST
        writer = MagicMock(write=MagicMock(), drain=AsyncMock(), close=MagicMock())
        req_bad_json = b"POST /api/folders HTTP/1.1\r\n\r\n{invalid_json}"
        await self.plugin._handle_dashboard_request(AsyncMock(read=AsyncMock(return_value=req_bad_json)), writer)

        # 4. GET /api/playlists
        with patch.object(self.plugin, "get_playlists", new_callable=AsyncMock) as m_pl:
            m_pl.return_value = {"ok": True, "playlists": []}
            w = MagicMock(write=MagicMock(), drain=AsyncMock(), close=MagicMock())
            await self.plugin._handle_dashboard_request(AsyncMock(read=AsyncMock(return_value=b"GET /api/playlists?offset=5 HTTP/1.1\r\n\r\n")), w)
            m_pl.assert_awaited_with(5)

        # 5. GET /api/playlists/p123/tracks
        with patch.object(self.plugin, "get_playlist_tracks", new_callable=AsyncMock) as m_pt:
            m_pt.return_value = {"ok": True, "tracks": []}
            w = MagicMock(write=MagicMock(), drain=AsyncMock(), close=MagicMock())
            await self.plugin._handle_dashboard_request(AsyncMock(read=AsyncMock(return_value=b"GET /api/playlists/p123/tracks?offset=10 HTTP/1.1\r\n\r\n")), w)
            m_pt.assert_awaited_with("p123", 10)

        # 6. POST /api/playlist/add-item
        with patch.object(self.plugin, "add_track_to_playlist", new_callable=AsyncMock) as m_add:
            m_add.return_value = {"ok": True}
            w = MagicMock(write=MagicMock(), drain=AsyncMock(), close=MagicMock())
            body = json.dumps({"playlist_id": "pl99", "track_uri": "spotify:track:t99"}).encode()
            req = b"POST /api/playlist/add-item HTTP/1.1\r\nContent-Length: 50\r\n\r\n" + body
            await self.plugin._handle_dashboard_request(AsyncMock(read=AsyncMock(return_value=req)), w)
            m_add.assert_awaited_with("pl99", "spotify:track:t99")

        # 7. Static file serving (/ and /assets/)
        with patch.object(self.plugin, "_serve_static", new_callable=AsyncMock) as m_stat:
            w1 = MagicMock(close=MagicMock())
            await self.plugin._handle_dashboard_request(AsyncMock(read=AsyncMock(return_value=b"GET / HTTP/1.1\r\n\r\n")), w1)
            m_stat.assert_awaited_with(w1, "index.html")

            w2 = MagicMock(close=MagicMock())
            await self.plugin._handle_dashboard_request(AsyncMock(read=AsyncMock(return_value=b"GET /assets/index.js HTTP/1.1\r\n\r\n")), w2)
            m_stat.assert_awaited_with(w2, "assets/index.js")

        # 8. Timeout and generic Exception handling in _handle_dashboard_request
        w_tmo = MagicMock(close=MagicMock())
        reader_tmo = MagicMock(read=AsyncMock(side_effect=asyncio.TimeoutError))
        await self.plugin._handle_dashboard_request(reader_tmo, w_tmo)
        w_tmo.close.assert_called()

        w_err = MagicMock(write=MagicMock(), drain=AsyncMock(), close=MagicMock())
        reader_err = MagicMock(read=AsyncMock(side_effect=Exception("Critical parse error")))
        await self.plugin._handle_dashboard_request(reader_err, w_err)
        self.assertIn(b"500 Internal Server Error", w_err.write.call_args[0][0])

    async def test_tasks_lifecycle_management(self):
        # 1. Start monitor when already running
        mock_task = asyncio.create_task(asyncio.sleep(10))
        self.plugin._monitor_task = mock_task
        self.plugin._start_monitor()
        self.assertEqual(self.plugin._monitor_task, mock_task)

        # 2. Stop monitor
        await self.plugin._stop_monitor()
        self.assertIsNone(self.plugin._monitor_task)

        # 3. Start api poll when already running
        mock_poll_task = asyncio.create_task(asyncio.sleep(10))
        self.plugin._api_poll_task = mock_poll_task
        self.plugin._start_api_poll()
        self.assertEqual(self.plugin._api_poll_task, mock_poll_task)

        # 4. Stop api poll
        await self.plugin._stop_api_poll()
        self.assertIsNone(self.plugin._api_poll_task)

    async def test_monitor_process_max_crashes_reached(self):
        self.plugin._settings["audio_backend"] = "librespot"
        mock_proc = MagicMock(poll=MagicMock(return_value=1), returncode=1)
        self.plugin._process = mock_proc
        self.plugin._crash_timestamps = [time.time()] * 5

        with patch("asyncio.sleep", new_callable=AsyncMock):
            await self.plugin._monitor_process()
            self.emit.assert_awaited()
            self.assertIn("Auto-restart limit reached", self.emit.call_args[0][1]["error"])

    async def test_steam_gamepad_bridge_worker(self):
        with patch.object(main, "_inject_steam_gamepad_bridge_sync"), \
             patch("asyncio.sleep", side_effect=asyncio.CancelledError):
            try:
                await self.plugin._steam_gamepad_bridge_worker()
            except asyncio.CancelledError:
                pass

    async def test_oauth_connection_and_callback_exceptions(self):
        # 1. OAuth connection timeout
        w_tmo = MagicMock(close=MagicMock())
        r_tmo = MagicMock(read=AsyncMock(side_effect=asyncio.TimeoutError))
        await self.plugin._handle_oauth_connection(r_tmo, w_tmo)
        w_tmo.close.assert_called()

        # 2. OAuth connection exception
        w_exc = MagicMock(write=MagicMock(), drain=AsyncMock(), close=MagicMock())
        r_exc = MagicMock(read=AsyncMock(side_effect=Exception("TLS Handshake failure")))
        await self.plugin._handle_oauth_connection(r_exc, w_exc)
        self.assertIn(b"500 Internal Server Error", w_exc.write.call_args[0][0])

        # 3. OAuth callback exception
        w_cb = MagicMock(write=MagicMock(), drain=AsyncMock(), close=MagicMock())
        self.execute.side_effect = Exception("Token endpoint unreachable")
        await self.plugin._handle_oauth_callback("code=valid_code", w_cb)
        self.assertIn(b"500 Internal Server Error", w_cb.write.call_args[0][0])

