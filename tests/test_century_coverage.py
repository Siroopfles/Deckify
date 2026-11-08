import asyncio
import base64
import errno
import glob
import json
import os
import socket
import struct
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, Mock, patch

sys.path.insert(0, os.path.dirname(__file__))
from test_token_refresh import main
from py_modules import common, device, engine, images, spotify


class CenturyCoverageTests(unittest.IsolatedAsyncioTestCase):
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

    # ── py_modules/images.py ───────────────────────────────────

    def test_images_full_coverage(self):
        # 1. _ImageRedirectHandler.redirect_request
        handler = images._ImageRedirectHandler()
        req = urllib.request.Request("https://i.scdn.co/image/old")
        with patch.object(urllib.request.HTTPRedirectHandler, "redirect_request", return_value="ok"):
            res = handler.redirect_request(req, None, 302, "Found", {}, "https://i.scdn.co/image/new")
            self.assertEqual(res, "ok")

        # 2. _get_max_image_bytes from main
        with patch.dict("sys.modules", {"main": SimpleNamespace(MAX_IMAGE_BYTES=12345)}):
            self.assertEqual(images._get_max_image_bytes(), 12345)

        # 3. _fetch_spotify_image with unsupported format
        mock_resp_unsupported = MagicMock()
        mock_resp_unsupported.headers.get_content_type.return_value = "text/html"
        mock_resp_unsupported.__enter__.return_value = mock_resp_unsupported
        with patch("urllib.request.build_opener") as mock_opener:
            mock_opener.return_value.open.return_value = mock_resp_unsupported
            with self.assertRaises(RuntimeError) as ctx:
                images._fetch_spotify_image("https://i.scdn.co/image/test")
            self.assertIn("unsupported image format", str(ctx.exception))

        # 4. _fetch_spotify_image exceeding size limit
        mock_resp_large = MagicMock()
        mock_resp_large.headers.get_content_type.return_value = "image/jpeg"
        mock_resp_large.read.return_value = b"A" * (images.MAX_IMAGE_BYTES + 2)
        mock_resp_large.__enter__.return_value = mock_resp_large
        with patch("urllib.request.build_opener") as mock_opener:
            mock_opener.return_value.open.return_value = mock_resp_large
            with self.assertRaises(RuntimeError) as ctx:
                images._fetch_spotify_image("https://i.scdn.co/image/test")
            self.assertIn("exceeds the size limit", str(ctx.exception))

        # 5. _fetch_spotify_image valid return
        mock_resp_ok = MagicMock()
        mock_resp_ok.headers.get_content_type.return_value = "image/png"
        mock_resp_ok.read.return_value = b"PNGDATA"
        mock_resp_ok.__enter__.return_value = mock_resp_ok
        with patch("urllib.request.build_opener") as mock_opener:
            mock_opener.return_value.open.return_value = mock_resp_ok
            ctype, body = images._fetch_spotify_image("https://i.scdn.co/image/test")
            self.assertEqual(ctype, "image/png")
            self.assertEqual(body, b"PNGDATA")

        # 6. _proxy_folder_tree_images with non-dict folder item
        tree = [None, "invalid", {"id": "f1", "playlists": [{"id": "p1", "image_url": "https://i.scdn.co/image/1"}]}]
        res_tree = images._proxy_folder_tree_images(tree)
        self.assertEqual(len(res_tree), 1)

    # ── py_modules/spotify.py ──────────────────────────────────

    def test_spotify_full_coverage(self):
        # 1. _spotify_api_request with body and empty response body
        mock_resp = MagicMock(status=200, read=MagicMock(return_value=b"   "))
        mock_resp.__enter__.return_value = mock_resp
        with patch("urllib.request.urlopen", return_value=mock_resp):
            res = spotify._spotify_api_request("test", "token", method="POST", body={"val": 1})
            self.assertIsNone(res)

        # 2. _parse_spotify_rootlist_folders with empty bytes
        self.assertEqual(spotify._parse_spotify_rootlist_folders(b""), [])

    # ── py_modules/device.py ───────────────────────────────────

    async def test_device_monitor_retry_and_eof(self):
        mon = device.SuspendResumeMonitor()
        call_count = 0

        async def mock_sleep(secs):
            nonlocal call_count
            call_count += 1
            mon._running = False

        with patch("os.path.exists", return_value=True), \
             patch("asyncio.create_subprocess_exec", side_effect=Exception("DBus failed")), \
             patch("asyncio.sleep", side_effect=mock_sleep):
            mon._running = True
            await mon._monitor_loop()
            self.assertEqual(call_count, 1)

        # Cover line 132 (EOF break) and line 157 (CancelledError break)
        with patch("os.path.exists", return_value=True), \
             patch("asyncio.create_subprocess_exec") as mock_exec:
            proc = MagicMock()
            proc.stdout.readline = AsyncMock(return_value=b"")
            mock_exec.side_effect = [proc, asyncio.CancelledError()]
            mon._running = True
            await mon._monitor_loop()

    # ── py_modules/engine.py ───────────────────────────────────

    def test_engine_full_coverage(self):
        # 1. _parse_pactl_sink_inputs with invalid Hz rate
        info = engine._parse_pactl_sink_inputs("Sink Input #1\nSample Specification: s16le 2ch notAnIntHz\nResample method: src\nCorked: no\napplication.name = \"librespot\"")
        self.assertIsNotNone(info)
        self.assertEqual(info["application"], "librespot")
        self.assertIn("notAnIntHz", info["format_label"])

        # 2. _cdp_get_page_target fallback to targets[0]
        with patch("urllib.request.urlopen") as mock_url:
            mock_resp = MagicMock(read=MagicMock(return_value=json.dumps([{"type": "background"}]).encode()))
            mock_resp.__enter__.return_value = mock_resp
            mock_url.return_value = mock_resp
            tgt = engine._cdp_get_page_target(target_title="NoMatch")
            self.assertEqual(tgt, {"type": "background"})

        # 3. _cdp_call socket closed during handshake
        with patch("py_modules.engine._cdp_get_page_target", return_value={"webSocketDebuggerUrl": "ws://127.0.0.1:9222/p"}), \
             patch("socket.create_connection") as mock_conn:
            sock = MagicMock()
            sock.recv.return_value = b""  # EOF
            mock_conn.return_value = sock
            self.assertIsNone(engine._cdp_call("Test.method"))

        # 4. _cdp_call frame with plen=126 and < 4 bytes
        with patch("py_modules.engine._cdp_get_page_target", return_value={"webSocketDebuggerUrl": "ws://127.0.0.1:9222/p"}), \
             patch("socket.create_connection") as mock_conn:
            sock = MagicMock()
            sock.recv.side_effect = [
                b"HTTP/1.1 101 Switching Protocols\r\n\r\n",
                bytearray([0x81, 126, 0x00]),  # only 3 bytes
                b"",
            ]
            mock_conn.return_value = sock
            self.assertIsNone(engine._cdp_call("Test.method"))

        # 5. _cdp_call frame with plen=127 and masked
        with patch("py_modules.engine._cdp_get_page_target", return_value={"webSocketDebuggerUrl": "ws://127.0.0.1:9222/p"}), \
             patch("socket.create_connection") as mock_conn:
            sock = MagicMock()
            payload = b'{"id":1,"result":"val127"}'
            plen = len(payload)
            # Masked frame with 8-byte length
            hdr = bytearray([0x81, 0x80 | 127]) + plen.to_bytes(8, "big") + b"1234" + payload
            # Also test plen=127 with < 10 bytes (hits line 189) and len < idx + plen (hits line 195)
            short_127 = bytearray([0x81, 127, 0, 0, 0])
            partial_frame = bytearray([0x81, 126, 0, 50]) + b"short"
            sock.recv.side_effect = [
                b"HTTP/1.1 101 Switching Protocols\r\n\r\n",
                short_127,
                b"",
                b"HTTP/1.1 101 Switching Protocols\r\n\r\n",
                partial_frame,
                b"",
                b"HTTP/1.1 101 Switching Protocols\r\n\r\n",
                hdr,
                b"",
            ]
            sock.close.side_effect = Exception("Close error")
            mock_conn.return_value = sock
            engine._cdp_call("Test.method")
            engine._cdp_call("Test.method")
            engine._cdp_call("Test.method")

        # 6. _cdp_call invalid JSON in frame
        with patch("py_modules.engine._cdp_get_page_target", return_value={"webSocketDebuggerUrl": "ws://127.0.0.1:9222/p"}), \
             patch("socket.create_connection") as mock_conn:
            sock = MagicMock()
            bad_frame = bytearray([0x81, 6]) + b"NOT_JS"
            sock.recv.side_effect = [
                b"HTTP/1.1 101 Switching Protocols\r\n\r\n",
                bad_frame,
                b"",
            ]
            mock_conn.return_value = sock
            self.assertIsNone(engine._cdp_call("Test.method"))

    # ── main.py ───────────────────────────────────────────────

    async def test_main_system_helpers_and_paths(self):
        # 1. _load_settings with malformed config values
        with tempfile.NamedTemporaryFile("w+", delete=False) as f:
            f.write(json.dumps({
                "audio_backend": "invalid",
                "audio_quality": "9999",
                "playlist_folders": 123,
                "spotify_folder_tree": 456,
                "game_audio_profiles": "str",
            }))
            temp_path = f.name
        try:
            with patch.object(main, "SETTINGS_FILE", temp_path):
                cfg = main._load_settings()
            self.assertEqual(cfg["audio_backend"], "librespot")
            self.assertEqual(cfg["audio_quality"], "320")
            self.assertEqual(cfg["playlist_folders"], [])
            self.assertEqual(cfg["spotify_folder_tree"], [])
            self.assertEqual(cfg["game_audio_profiles"], {})
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)

        # 2. _unload and _uninstall with active suspend_monitor and gamepad bridge
        mock_mon = MagicMock(stop=AsyncMock())
        mock_task = MagicMock(done=MagicMock(return_value=False), cancel=MagicMock())
        self.plugin._suspend_monitor = mock_mon
        self.plugin._steam_gamepad_bridge_task = mock_task
        await self.plugin._unload()
        mock_mon.stop.assert_awaited()
        mock_task.cancel.assert_called()

        self.plugin._suspend_monitor = mock_mon
        self.plugin._steam_gamepad_bridge_task = mock_task
        await self.plugin._uninstall()
        mock_mon.stop.assert_awaited()
        mock_task.cancel.assert_called()

        # 3. _on_deck_resume exception handling
        with patch.object(self.plugin, "_ensure_token", side_effect=Exception("Resume token fail")):
            await self.plugin._on_deck_resume()

        # 3. _build_deck_command as root
        with patch("os.geteuid", return_value=0, create=True):
            cmd, env = main._build_deck_command(["flatpak", "run", "spotify"])
            self.assertIn("runuser", cmd[0])
            self.assertIn("deck", cmd)

        # 4. _sync_spotify_client_quality_cdp exception
        mock_spot_proc = MagicMock(poll=MagicMock(return_value=None))
        self.plugin._spotify_client_process = mock_spot_proc
        self.execute.side_effect = Exception("CDP quality fail")
        await self.plugin._sync_spotify_client_quality_cdp("lossless")

        # 5. start_librespot when already running
        mock_ls_running = MagicMock(poll=MagicMock(return_value=None))
        self.plugin._process = mock_ls_running
        res_already = await self.plugin.start_librespot()
        self.assertTrue(res_already["ok"])
        self.assertEqual(res_already["message"], "already running")
        self.plugin._process = None

        # 6. _write_spotify_client_prefs chown exception
        with tempfile.TemporaryDirectory() as tmp_dir:
            with patch.object(main, "SPOTIFY_CLIENT_CONFIG_DIR", tmp_dir), \
                 patch("os.geteuid", return_value=0, create=True), \
                 patch("os.chown", side_effect=OSError("Chown fail"), create=True):
                self.plugin._write_spotify_client_prefs()

    async def test_main_settings_and_playback_branches(self):
        # 1. start_librespot binary not found
        with patch("os.path.isfile", return_value=False):
            res_nobin = await self.plugin.start_librespot()
            self.assertFalse(res_nobin["ok"])
            self.assertIn("not found", res_nobin["error"])

        # 2. set_setting unknown key and invalid audio qualities
        self.assertFalse((await self.plugin.set_setting("unknown_key", "val"))["ok"])
        self.assertFalse((await self.plugin.set_setting("audio_backend", "invalid"))["ok"])
        self.plugin._settings["audio_backend"] = "librespot"
        self.assertFalse((await self.plugin.set_setting("audio_quality", "invalid_q"))["ok"])
        self.plugin._settings["audio_backend"] = "spotify_client"
        self.assertFalse((await self.plugin.set_setting("audio_quality", "invalid_client_q"))["ok"])

        # 3. control_playback 404 when action != "play"
        err_404 = urllib.error.HTTPError("url", 404, "Not Found", {}, None)
        self.execute.side_effect = err_404
        r_ctrl = await self.plugin.control_playback("pause")
        self.assertFalse(r_ctrl["ok"])
        self.assertIn("No active device", r_ctrl["error"])

        # 4. _auto_transfer_and_play me/player/devices throws exception
        self.execute.side_effect = Exception("Device fetch fail")
        r_at_err = await self.plugin._auto_transfer_and_play("token", "")
        self.assertFalse(r_at_err["ok"])

        # 5. _check_tracks_liked empty list and exception
        self.assertEqual(await self.plugin._check_tracks_liked("token", []), {})
        self.execute.side_effect = Exception("me/library error")
        self.assertEqual(await self.plugin._check_tracks_liked("token", ["tid1"]), {})

        # 6. toggle_like_track no active track
        self.plugin._poll_track_id = ""
        r_like_err = await self.plugin.toggle_like_track("")
        self.assertFalse(r_like_err["ok"])

        # 7. toggle_like_track liked is None and target_id == poll_track_id
        self.plugin._poll_track_id = "curr1"
        self.plugin._is_liked = False
        self.plugin._track_meta = {"id": "curr1"}
        self.execute.side_effect = [{"ok": True}]
        r_like_toggle = await self.plugin.toggle_like_track("curr1")
        self.assertTrue(r_like_toggle["ok"])
        self.assertTrue(r_like_toggle["is_liked"])

        # 8. add_to_queue missing uri
        self.assertFalse((await self.plugin.add_to_queue(""))["ok"])

        # 9. get_playlists item None in items
        self.execute.side_effect = [{"items": [None, {"id": "p1", "name": "P1"}], "total": 1}]
        pls = await self.plugin.get_playlists()
        self.assertEqual(len(pls["playlists"]), 1)

        # 10. get_playlist_tracks item has track None
        self.execute.side_effect = [{"items": [{"track": None}, {"track": {"id": "t1", "name": "T1"}}], "total": 1}, [False]]
        pts = await self.plugin.get_playlist_tracks("p1")
        self.assertEqual(len(pts["tracks"]), 1)

        # 11. add_track_to_playlist missing pid/uri and 500 error
        self.assertFalse((await self.plugin.add_track_to_playlist("", ""))["ok"])
        err_500 = urllib.error.HTTPError("url", 500, "Server Error", {}, None)
        self.execute.side_effect = err_500
        r_add_err = await self.plugin.add_track_to_playlist("p1", "t1")
        self.assertFalse(r_add_err["ok"])

        # 12. manage_playlist_folder error branches
        self.assertFalse((await self.plugin.manage_playlist_folder(action="invalid"))["ok"])
        self.assertFalse((await self.plugin.manage_playlist_folder(action="create", name=""))["ok"])
        self.assertFalse((await self.plugin.manage_playlist_folder(action="rename", folder_id=""))["ok"])
        self.assertFalse((await self.plugin.manage_playlist_folder(action="add_playlist", folder_id=""))["ok"])
        self.assertFalse((await self.plugin.manage_playlist_folder(action="add_playlist", folder_id="nonexistent", playlist_id="p1"))["ok"])
        self.assertFalse((await self.plugin.manage_playlist_folder(action="remove_playlist", folder_id=""))["ok"])

        # 13. set_native_playlist_mix missing playlist_id and recursive subfolders
        self.plugin._settings["audio_backend"] = "spotify_client"
        self.assertFalse((await self.plugin.set_native_playlist_mix(""))["ok"])
        self.plugin._settings["spotify_folder_tree"] = [
            {"id": "f1", "subfolders": [{"id": "sf1", "playlists": [{"id": "pl_mix"}]}]}
        ]
        self.execute.side_effect = [{"ok": True}]
        r_mix = await self.plugin.set_native_playlist_mix("pl_mix", enabled=True)
        self.assertTrue(r_mix["ok"])

        # 14. push_gamepad_events string and list (>100 to trigger cap)
        self.assertEqual(self.plugin.push_gamepad_events("a")["pushed"], 1)
        many_events = ["b"] * 105
        res_pushed = self.plugin.push_gamepad_events(many_events)
        self.assertEqual(res_pushed["pushed"], 105)
        self.assertEqual(res_pushed["queued"], 100)
        self.assertEqual((await self.plugin.push_gamepad_event("x"))["pushed"], 1)

        # 15. _read_linux_joystick_events paths removal & OSError
        self.plugin._js_fds["/dev/input/js0"] = 999
        with patch("os.path.exists", return_value=False), patch("os.close"):
            self.plugin._read_linux_joystick_events()
            self.assertNotIn("/dev/input/js0", self.plugin._js_fds)

        with patch("os.path.exists", return_value=True), patch("os.open", side_effect=OSError("Open err")):
            self.plugin._read_linux_joystick_events()

        # 16. poll_gamepad_events joystick exception
        self.plugin._gamepad_queue.clear()
        with patch.object(self.plugin, "_read_linux_joystick_events", side_effect=Exception("JS error")):
            self.assertEqual((await self.plugin.poll_gamepad_events())["events"], [])

        # 17. get_client_window_status CDP call exception
        mock_proc = MagicMock(poll=MagicMock(return_value=None))
        self.plugin._spotify_client_process = mock_proc
        self.execute.side_effect = [
            {"title": "Spot", "url": "https://spotify.com"},  # target
            Exception("Emulation fail"),  # setDeviceMetricsOverride
        ]
        stat = await self.plugin.get_client_window_status()
        self.assertTrue(stat["running"])
        self.assertTrue(stat["logged_in"])

        # 18. send_client_window_input invalid type and key error
        self.assertFalse((await self.plugin.send_client_window_input({"type": "invalid"}))["ok"])
        self.assertFalse((await self.plugin.send_client_window_input({"type": "key"}))["ok"])

        # 19. get_recently_played track None and seen uri
        self.execute.side_effect = [{
            "items": [
                {"track": None},
                {"track": {"id": "t1", "uri": "spotify:track:t1", "name": "T1"}},
                {"track": {"id": "t1", "uri": "spotify:track:t1", "name": "T1_dup"}},
            ]
        }, [False]]
        rp = await self.plugin.get_recently_played()
        self.assertEqual(len(rp["tracks"]), 1)

        # 20. search_spotify with formatting items
        self.execute.side_effect = [{
            "artists": {"items": [{"id": "a1", "name": "Art", "images": []}]},
            "albums": {"items": [{"id": "al1", "name": "Alb", "artists": [{"name": "A"}], "images": []}]},
            "playlists": {"items": [None, {"id": "p1", "name": "Pl", "images": []}]},
        }, []]
        s_res = await self.plugin.search_spotify("test")
        self.assertEqual(len(s_res["artists"]), 1)
        self.assertEqual(len(s_res["albums"]), 1)
        self.assertEqual(len(s_res["playlists"]), 1)

        # 21. play_tracks not authenticated
        self.plugin._access_token = ""
        self.assertFalse((await self.plugin.play_tracks(context_uri="c"))["ok"])
        self.plugin._access_token = "valid"

        # 22. start_oauth ssl failure & OSError
        with patch.object(main, "_ensure_ssl_cert", return_value=(None, "No SSL")):
            self.assertFalse((await self.plugin.start_oauth())["ok"])
        with patch.object(main, "_ensure_ssl_cert", return_value=(MagicMock(), None)), \
             patch("asyncio.start_server", side_effect=OSError("Port bound")):
            self.assertFalse((await self.plugin.start_oauth())["ok"])

        # 23. _start_dashboard exception
        with patch("asyncio.start_server", side_effect=Exception("Dash start fail")):
            await self.plugin._start_dashboard()

        # 24. _handle_dashboard_request image route & stream-info & client-window input
        with patch.object(self.plugin, "_serve_image", new_callable=AsyncMock) as m_img:
            w = MagicMock(close=MagicMock())
            await self.plugin._handle_dashboard_request(AsyncMock(read=AsyncMock(return_value=b"GET /api/image?url=u HTTP/1.1\r\n\r\n")), w)
            m_img.assert_awaited()

        # POST /api/settings with invalid setting error
        w_eng = MagicMock(write=MagicMock(), drain=AsyncMock(), close=MagicMock())
        payload_eng = json.dumps({"audio_quality": "invalid_q"}).encode()
        req_eng = b"POST /api/settings HTTP/1.1\r\nContent-Length: " + str(len(payload_eng)).encode() + b"\r\n\r\n" + payload_eng
        await self.plugin._handle_dashboard_request(AsyncMock(read=AsyncMock(return_value=req_eng)), w_eng)
        self.assertIn(b"200 OK", w_eng.write.call_args[0][0])

        with patch.object(self.plugin, "send_client_window_input", new_callable=AsyncMock) as m_cwi:
            m_cwi.return_value = {"ok": True}
            w = MagicMock(write=MagicMock(), drain=AsyncMock(), close=MagicMock())
            await self.plugin._handle_dashboard_request(AsyncMock(read=AsyncMock(return_value=b"POST /api/client-window/input HTTP/1.1\r\n\r\n{}")), w)
            m_cwi.assert_awaited()

        # 25. _serve_image ValueError handling
        self.execute.side_effect = ValueError("Invalid URL")
        w_img = MagicMock(write=MagicMock(), drain=AsyncMock(), close=MagicMock())
        await self.plugin._serve_image(w_img, "invalid_url")
        self.assertIn(b"400 Bad Request", w_img.write.call_args[0][0])

        # 26. _kill_spotify_client process termination exceptions
        kw = MagicMock(poll=MagicMock(return_value=None))
        kw.terminate.side_effect = Exception("term err")
        kw.kill.side_effect = Exception("kill err")
        self.plugin._kwin_process = kw
        await self.plugin._kill_spotify_client()
        self.assertIsNone(self.plugin._kwin_process)

        # 27. _kill_librespot ProcessLookupError
        ls_proc = MagicMock(poll=MagicMock(return_value=None))
        ls_proc.terminate.side_effect = ProcessLookupError()
        self.plugin._process = ls_proc
        await self.plugin._kill_librespot()
        self.assertIsNone(self.plugin._process)

        # 28. _kill_stale_librespot ProcessLookupError on kill(15)
        with tempfile.NamedTemporaryFile("w+", delete=False) as f:
            f.write("9999\n")
            p_file = f.name
        try:
            with patch.object(main, "LIBRESPOT_PID_FILE", p_file), \
                 patch("os.kill", side_effect=[None, ProcessLookupError()]):
                self.plugin._kill_stale_librespot()
        finally:
            if os.path.exists(p_file):
                os.remove(p_file)

        # 29. _ensure_token expired without refresh and double check after lock
        self.plugin._access_token = "exp"
        self.plugin._token_expires_at = 0
        self.plugin._refresh_token = ""
        self.assertIsNone(await self.plugin._ensure_token())

        # _stop_oauth_server when running
        mock_oauth_srv = MagicMock()
        mock_oauth_srv.wait_closed = AsyncMock()
        self.plugin._oauth_server = mock_oauth_srv
        await self.plugin._stop_oauth_server()
        self.assertIsNone(self.plugin._oauth_server)

        # 30. _poll_playback branches
        # a. Not authenticated
        self.plugin._access_token = ""
        self.assertTrue(await self.plugin._poll_playback())
        self.plugin._access_token = "valid"

        # b. HTTP error 500
        self.plugin._token_expires_at = time.time() + 3600
        self.execute.side_effect = urllib.error.HTTPError("url", 500, "Error", {}, None)
        self.assertTrue(await self.plugin._poll_playback())

        # c. Generic Exception
        self.plugin._token_expires_at = time.time() + 3600
        self.execute.side_effect = Exception("Poll error")
        self.assertFalse(await self.plugin._poll_playback())

        # d. Data present but item is None
        self.execute.side_effect = [{"is_playing": True, "item": None}]
        self.assertTrue(await self.plugin._poll_playback())

    async def test_main_century_final_lines(self):
        # 1. _is_engine_running for spotify_client
        self.plugin._settings["audio_backend"] = "spotify_client"
        mock_sc = MagicMock(poll=MagicMock(return_value=None))
        self.plugin._spotify_client_process = mock_sc
        self.assertTrue(self.plugin._is_engine_running())

        # 2. _load_settings with spotify_client quality branches
        with tempfile.NamedTemporaryFile("w+", delete=False) as f:
            f.write(json.dumps({"audio_backend": "spotify_client", "audio_quality": "unknown_q"}))
            t_path = f.name
        try:
            with patch.object(main, "SETTINGS_FILE", t_path):
                cfg = main._load_settings()
            self.assertEqual(cfg["audio_quality"], "320")
            self.assertEqual(cfg["bitrate"], 320)
        finally:
            if os.path.exists(t_path):
                os.remove(t_path)

        # 3. _write_spotify_client_prefs read failure and mkdir failure
        with tempfile.TemporaryDirectory() as tmp_dir:
            pfile = os.path.join(tmp_dir, "prefs")
            with open(pfile, "w") as f:
                f.write("test")
            with patch.object(main, "SPOTIFY_CLIENT_CONFIG_DIR", tmp_dir), \
                 patch("builtins.open", side_effect=[PermissionError("Denied"), MagicMock()]):
                self.plugin._write_spotify_client_prefs()

        with patch("os.makedirs", side_effect=OSError("MKDIR fail")):
            self.plugin._write_spotify_client_prefs()

        # 4. start_librespot with invalid quality defaulting to 320
        self.plugin._settings["audio_backend"] = "librespot"
        self.plugin._settings["audio_quality"] = "invalid_q"
        with patch("os.path.isfile", return_value=True), \
             patch("subprocess.Popen") as mock_popen:
            mock_proc = MagicMock(pid=1234, poll=MagicMock(return_value=None))
            mock_popen.return_value = mock_proc
            res_start = await self.plugin.start_librespot()
            self.assertTrue(res_start["ok"])

        # 5. get_queue with None items in queue and HTTPError
        self.execute.side_effect = [{"currently_playing": None, "queue": [None]}]
        q_res = await self.plugin.get_queue()
        self.assertEqual(q_res["queue"], [])

        err_400 = urllib.error.HTTPError("url", 400, "Bad Request", {}, None)
        self.execute.side_effect = err_400
        q_err = await self.plugin.get_queue()
        self.assertFalse(q_err["ok"])

        # 6. _sync_native_spotify_folders with cached tree not list and CDP Exception
        self.plugin._settings["spotify_folder_tree"] = "invalid_string"
        self.execute.side_effect = Exception("CDP fail")
        folders = await self.plugin._sync_native_spotify_folders()
        self.assertIsInstance(folders, list)

        # 7. set_native_playlist_mix res is dict not ok and res is None
        self.plugin._settings["audio_backend"] = "spotify_client"
        self.execute.side_effect = [{"ok": False, "error": "Mix error"}]
        self.assertFalse((await self.plugin.set_native_playlist_mix("p1"))["ok"])
        self.execute.side_effect = [None]
        self.assertFalse((await self.plugin.set_native_playlist_mix("p1"))["ok"])
        self.execute.side_effect = Exception("Mix crash")
        self.assertFalse((await self.plugin.set_native_playlist_mix("p1"))["ok"])

        # 8. _steam_gamepad_bridge_worker exception during worker
        with patch.object(main, "_inject_steam_gamepad_bridge_sync", side_effect=Exception("Bridge fail")), \
             patch("asyncio.sleep", side_effect=asyncio.CancelledError):
            try:
                await self.plugin._steam_gamepad_bridge_worker()
            except asyncio.CancelledError:
                pass

        # 9. _read_linux_joystick_events close exceptions
        self.plugin._js_fds["/dev/input/js0"] = 101
        with patch("os.path.exists", return_value=False), patch("os.close", side_effect=Exception("Close fail")):
            self.plugin._read_linux_joystick_events()

        self.plugin._js_fds["/dev/input/js0"] = 102
        with patch("os.path.exists", return_value=True), \
             patch("os.read", side_effect=OSError(errno.EBADF, "Bad fd")), \
             patch("os.close", side_effect=Exception("Close fail")):
            self.plugin._read_linux_joystick_events()

        # 10. poll_gamepad_events extending raw_js
        with patch.object(self.plugin, "_read_linux_joystick_events", return_value=["up", "down"]):
            evs = await self.plugin.poll_gamepad_events()
            self.assertEqual(evs["events"], ["up", "down"])

        # 11. capture_client_window_screenshot with data and with exception
        self.execute.side_effect = [{"data": base64.b64encode(b"IMG").decode("ascii")}]
        ss = await self.plugin.capture_client_window_screenshot()
        self.assertEqual(ss, b"IMG")
        self.execute.side_effect = Exception("Screenshot fail")
        self.assertIsNone(await self.plugin.capture_client_window_screenshot())

        # 12. get_liked_tracks, get_saved_episodes, get_saved_albums with None items
        self.execute.side_effect = [{"items": [{"track": None}, {"track": {"id": "t1", "name": "T1"}}], "total": 1}]
        self.assertEqual(len((await self.plugin.get_liked_tracks())["tracks"]), 1)

        self.execute.side_effect = [{"items": [{"episode": None}, {"episode": {"id": "ep1", "name": "EP1"}}], "total": 1}]
        self.assertEqual(len((await self.plugin.get_saved_episodes())["episodes"]), 1)

        self.execute.side_effect = [{"items": [{"album": None}, {"album": {"id": "a1", "name": "A1"}}], "total": 1}]
        self.assertEqual(len((await self.plugin.get_saved_albums())["albums"]), 1)

        # 13. play_tracks auto-transfer retry PUT throws exception
        err_404 = urllib.error.HTTPError("url", 404, "Not Found", {}, None)
        self.execute.side_effect = [
            err_404,
            {"devices": [{"id": "d1"}]},
            {"ok": True},  # transfer
            Exception("Retry play fail"),
        ]
        with patch("asyncio.sleep", new_callable=AsyncMock):
            r_pt = await self.plugin.play_tracks(context_uri="c")
            self.assertTrue(r_pt["ok"])

        # 14. _get_status_dict with last_event position_ms
        self.plugin._last_event = {"position_ms": 1234}
        st_dict = self.plugin._get_status_dict()
        self.assertEqual(st_dict["librespot_running"], False)

        # 15. _serve_sse_events when self._sse is None
        self.plugin._sse = None
        w_sse = MagicMock(write=MagicMock(), drain=AsyncMock(), close=MagicMock())
        await self.plugin._serve_sse_events(w_sse)
        self.assertIsNotNone(self.plugin._sse)

        # 16. _broadcast_status_sse exception handling
        self.plugin._sse.broadcast = AsyncMock(side_effect=Exception("Broadcast fail"))
        await self.plugin._broadcast_status_sse()

        # 17. _kill_spotify_client process terminate exception
        kw_proc = MagicMock(poll=MagicMock(return_value=None))
        kw_proc.terminate.side_effect = Exception("KW terminate err")
        kw_proc.kill.side_effect = Exception("KW kill err")
        self.plugin._kwin_process = kw_proc
        mock_sc = MagicMock(poll=MagicMock(return_value=None))
        mock_sc.terminate.side_effect = Exception("SC terminate err")
        self.plugin._spotify_client_process = mock_sc
        await self.plugin._kill_spotify_client()
        self.assertIsNone(self.plugin._spotify_client_process)

        # 18. _kill_librespot proc.poll() not None and proc.kill ProcessLookupError
        p_done = MagicMock(poll=MagicMock(return_value=0))
        self.plugin._process = p_done
        await self.plugin._kill_librespot()
        self.assertIsNone(self.plugin._process)

        p_alive = MagicMock(poll=MagicMock(return_value=None))
        p_alive.wait.side_effect = [subprocess.TimeoutExpired("cmd", 5), None]
        p_alive.kill.side_effect = ProcessLookupError()
        self.plugin._process = p_alive
        await self.plugin._kill_librespot()
        self.assertIsNone(self.plugin._process)

        # 19. _kill_stale_librespot ProcessLookupError on alive check
        with tempfile.NamedTemporaryFile("w+", delete=False) as f:
            f.write("5555\n")
            p_file = f.name
        try:
            with patch.object(main, "LIBRESPOT_PID_FILE", p_file), \
                 patch("os.kill", side_effect=ProcessLookupError()):
                self.plugin._kill_stale_librespot()
        finally:
            if os.path.exists(p_file):
                os.remove(p_file)

        # 20. _handle_oauth_connection timeout writer close exception and send_http_response exception
        w_tmo = MagicMock(close=MagicMock(side_effect=Exception("Close fail")))
        r_tmo = MagicMock(read=AsyncMock(side_effect=asyncio.TimeoutError))
        await self.plugin._handle_oauth_connection(r_tmo, w_tmo)

        w_exc = MagicMock(write=MagicMock(), drain=AsyncMock(), close=MagicMock())
        r_exc = MagicMock(read=AsyncMock(side_effect=Exception("TLS fail")))
        with patch.object(self.plugin, "_send_http_response", side_effect=Exception("HTTP resp fail")):
            await self.plugin._handle_oauth_connection(r_exc, w_exc)

        # 21. _boost_pa_volume success
        with patch.object(self.plugin, "_set_pa_volume_percent", new_callable=AsyncMock) as m_pa:
            m_pa.return_value = True
            await self.plugin._boost_pa_volume()
            self.assertTrue(self.plugin._pa_volume_boosted)

        # 22. _monitor_process crash handling for spotify_client and stable reset
        self.plugin._settings["audio_backend"] = "spotify_client"
        mock_proc_crash = MagicMock(poll=MagicMock(return_value=1), returncode=1)
        self.plugin._spotify_client_process = mock_proc_crash
        self.plugin._crash_timestamps = [10.0]

        t_base = 1000.0
        time_seq = [t_base, t_base, t_base + 100.0, t_base + 100.0, t_base + 100.0, t_base + 100.0]
        with patch.object(self.plugin, "start_spotify_client", new_callable=AsyncMock) as m_start_sc, \
             patch.object(self.plugin, "_refresh_audio_stream_info", new_callable=AsyncMock), \
             patch("time.time", side_effect=time_seq), \
             patch("asyncio.sleep", new_callable=AsyncMock):
            m_start_sc.return_value = {"ok": False, "error": "SC crash"}
            await self.plugin._monitor_process()
            self.assertIsNone(self.plugin._spotify_client_process)

        # 23. shutdown_system exception branch
        self.execute.side_effect = Exception("Systemctl fail")
        self.assertFalse((await self.plugin.shutdown_system())["ok"])

        # 24. play_tracks not authenticated & non-404 HTTPError
        self.plugin._access_token = ""
        self.assertFalse((await self.plugin.play_tracks(context_uri="c"))["ok"])
        self.plugin._access_token = "valid"
        self.execute.side_effect = urllib.error.HTTPError("url", 403, "Forbidden", {}, None)
        self.assertFalse((await self.plugin.play_tracks(context_uri="c"))["ok"])

        # 25. GET /api/events in _handle_dashboard_request
        w_events = MagicMock(write=MagicMock(), drain=AsyncMock(), close=MagicMock())
        with patch.object(self.plugin, "_serve_sse_events", new_callable=AsyncMock) as m_sse:
            await self.plugin._handle_dashboard_request(AsyncMock(read=AsyncMock(return_value=b"GET /api/events HTTP/1.1\r\n\r\n")), w_events)
            m_sse.assert_awaited()

        # 26. _start_api_poll task creation & stop
        self.plugin._api_poll_task = None
        self.plugin._start_api_poll()
        self.assertIsNotNone(self.plugin._api_poll_task)
        await self.plugin._stop_api_poll()

        # 27. _ensure_token lock double check
        self.plugin._access_token = "tok_after_lock"
        self.plugin._refresh_token = "ref"
        self.plugin._token_expires_at = 50.0
        with patch("time.time", side_effect=[100.0, 40.0]):
            tok = await self.plugin._ensure_token()
            self.assertEqual(tok, "tok_after_lock")

        # 28. _steam_gamepad_bridge_worker CancelledError break
        self.execute.side_effect = asyncio.CancelledError()
        await self.plugin._steam_gamepad_bridge_worker()

        # 29. capture_client_window_screenshot executing real closure
        with patch.object(main, "_cdp_call", return_value={"data": base64.b64encode(b"SHOT").decode("ascii")}):
            self.execute.side_effect = lambda fn, *a, **kw: fn(*a) if callable(fn) else None
            shot_res = await self.plugin.capture_client_window_screenshot()
            self.assertEqual(shot_res, b"SHOT")
