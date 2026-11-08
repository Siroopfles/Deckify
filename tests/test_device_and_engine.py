import asyncio
import io
import json
import os
import socket
import ssl
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, Mock, patch

from py_modules import common, device, engine, images, server


class DeviceModuleTests(unittest.IsolatedAsyncioTestCase):
    def test_resolve_device_hostname(self):
        with patch("socket.gethostname", return_value="my-steamdeck"):
            self.assertEqual(device.resolve_device_hostname(), "my-steamdeck")
        with patch("socket.gethostname", side_effect=Exception("Failed")):
            self.assertEqual(device.resolve_device_hostname(), "Steam Deck")

    def test_get_lan_ip(self):
        mock_sock = MagicMock()
        mock_sock.getsockname.return_value = ["192.168.1.100", 50000]
        with patch("socket.socket", return_value=mock_sock):
            self.assertEqual(device._get_lan_ip(), "192.168.1.100")

        with patch("socket.socket", side_effect=Exception("No network")):
            self.assertEqual(device._get_lan_ip(), "127.0.0.1")

    def test_get_mdns_host(self):
        with patch("socket.gethostname", return_value="steamdeck"):
            self.assertEqual(device._get_mdns_host(), "steamdeck.local")
        with patch("socket.gethostname", side_effect=Exception("error")):
            with patch.object(device, "_get_lan_ip", return_value="192.168.1.50"):
                self.assertEqual(device._get_mdns_host(), "192.168.1.50")

    def test_ensure_ssl_cert_paths(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            cert_file = os.path.join(tmpdir, "cert.pem")
            key_file = os.path.join(tmpdir, "key.pem")

            with patch.object(device, "SSL_CERT", cert_file), \
                 patch.object(device, "SSL_KEY", key_file):

                # 1. openssl fails (non-zero return code)
                with patch("subprocess.run") as mock_run:
                    mock_run.return_value = SimpleNamespace(returncode=1, stderr="Bad args")
                    ctx, err = device._ensure_ssl_cert()
                    self.assertIsNone(ctx)
                    self.assertIn("openssl failed", err)

                # 2. openssl raises exception
                with patch("subprocess.run", side_effect=Exception("Missing openssl")):
                    ctx, err = device._ensure_ssl_cert()
                    self.assertIsNone(ctx)
                    self.assertIn("Failed to run openssl", err)

                # 3. openssl succeeds and cert loads
                with patch("subprocess.run") as mock_run, \
                     patch("ssl.SSLContext") as mock_ctx_cls:
                    mock_run.return_value = SimpleNamespace(returncode=0, stderr="")
                    # create empty dummy files
                    open(cert_file, "w").close()
                    open(key_file, "w").close()
                    mock_ctx = MagicMock()
                    mock_ctx_cls.return_value = mock_ctx

                    ctx, err = device._ensure_ssl_cert()
                    self.assertIsNotNone(ctx)
                    self.assertIsNone(err)
                    mock_ctx.load_cert_chain.assert_called_once_with(cert_file, key_file)

                # 4. load_cert_chain fails
                with patch("ssl.SSLContext") as mock_ctx_cls:
                    mock_ctx = MagicMock()
                    mock_ctx.load_cert_chain.side_effect = Exception("Corrupt pem")
                    mock_ctx_cls.return_value = mock_ctx

                    ctx, err = device._ensure_ssl_cert()
                    self.assertIsNone(ctx)
                    self.assertIn("Failed to load SSL cert", err)

    def test_shutdown_system_sync(self):
        with patch("subprocess.Popen") as mock_popen:
            device.shutdown_system_sync()
            mock_popen.assert_called_once_with(["systemctl", "poweroff"])

    async def test_suspend_resume_monitor_lifecycle(self):
        on_sleep = AsyncMock()
        on_resume = AsyncMock()
        monitor = device.SuspendResumeMonitor(on_sleep=on_sleep, on_resume=on_resume)

        # Idempotent start
        with patch.object(monitor, "_monitor_loop", new_callable=AsyncMock):
            monitor.start()
            self.assertTrue(monitor._running)
            monitor.start()
            self.assertTrue(monitor._running)

            await monitor.stop()
            self.assertFalse(monitor._running)
            self.assertIsNone(monitor._task)

    async def test_suspend_resume_monitor_loop_busctl_missing(self):
        monitor = device.SuspendResumeMonitor()
        monitor._running = True
        with patch("os.path.exists", return_value=False):
            await monitor._monitor_loop()
            # Exits cleanly when busctl is missing

    async def test_suspend_resume_monitor_loop_events(self):
        on_sleep = AsyncMock()
        on_resume = AsyncMock()
        sync_sleep = Mock()
        monitor = device.SuspendResumeMonitor(on_sleep=on_sleep, on_resume=on_resume)
        monitor._running = True

        mock_proc = MagicMock()
        # Feed 3 lines: prepare for sleep true, prepare for sleep false, then empty (EOF)
        mock_proc.stdout.readline = AsyncMock(side_effect=[
            b"org.freedesktop.login1 Member=PrepareForSleep boolean true\n",
            b"org.freedesktop.login1 Member=PrepareForSleep boolean false\n",
            b"",
        ])

        with patch("os.path.exists", return_value=True), \
             patch("asyncio.create_subprocess_exec", return_value=mock_proc), \
             patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            # Run one iteration of the outer loop then stop
            async def stop_after_read(*args, **kwargs):
                monitor._running = False
            mock_sleep.side_effect = stop_after_read

            await monitor._monitor_loop()
            on_sleep.assert_awaited()
            on_resume.assert_awaited()

        # Test sync callback execution and exception safety
        monitor2 = device.SuspendResumeMonitor(on_sleep=sync_sleep, on_resume=Mock(side_effect=Exception("Boom")))
        monitor2._running = True
        mock_proc2 = MagicMock()
        mock_proc2.stdout.readline = AsyncMock(side_effect=[
            b"PrepareForSleep: true\n",
            b"PrepareForSleep: false\n",
            b"",
        ])
        with patch("os.path.exists", return_value=True), \
             patch("asyncio.create_subprocess_exec", return_value=mock_proc2), \
             patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep2:
            async def stop2(*args, **kwargs):
                monitor2._running = False
            mock_sleep2.side_effect = stop2
            await monitor2._monitor_loop()
            sync_sleep.assert_called()


class EngineModuleTests(unittest.TestCase):
    def test_parse_pactl_sink_inputs_various(self):
        # Empty input
        self.assertIsNone(engine._parse_pactl_sink_inputs(""))

        # No matching spotify / librespot input
        unrelated = """
Sink Input #10
    Driver: PipeWire
    application.name = "firefox"
    Sample Specification: s16le 2ch 48000Hz
"""
        self.assertIsNone(engine._parse_pactl_sink_inputs(unrelated))

        # Spotify Client corked vs active
        corked_sp = """
Sink Input #1
    application.name = "com.spotify.Client"
    Sample Specification: s24le 2ch 44100Hz
    Resample method: soxr
    Corked: yes
"""
        res_corked = engine._parse_pactl_sink_inputs(corked_sp)
        self.assertIsNotNone(res_corked)
        self.assertFalse(res_corked["active"])
        self.assertEqual(res_corked["format_label"], "24-bit · 44.1 kHz")

    def test_cdp_get_page_target(self):
        targets = [
            {"id": "1", "type": "background_page", "title": "bg"},
            {"id": "2", "type": "page", "title": "Main Window", "webSocketDebuggerUrl": "ws://127.0.0.1:9229/page/2"},
        ]
        with patch("urllib.request.urlopen") as mock_open:
            resp = MagicMock()
            resp.read.return_value = json.dumps(targets).encode("utf-8")
            resp.__enter__.return_value = resp
            mock_open.return_value = resp

            # By page type
            t = engine._cdp_get_page_target(9229)
            self.assertEqual(t["id"], "2")

            # By title
            t_title = engine._cdp_get_page_target(9229, target_title="Main Window")
            self.assertEqual(t_title["id"], "2")

        with patch("urllib.request.urlopen", side_effect=Exception("Offline")):
            self.assertIsNone(engine._cdp_get_page_target(9229))

    def test_cdp_call_and_evaluate(self):
        # Target not available -> None
        with patch.object(engine, "_cdp_get_page_target", return_value=None):
            self.assertIsNone(engine._cdp_call("Test.method"))

        target = {"webSocketDebuggerUrl": "ws://127.0.0.1:9229/devtools/page/test"}
        with patch.object(engine, "_cdp_get_page_target", return_value=target):
            mock_sock = MagicMock()
            handshake_resp = b"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n"

            # Construct valid unmasked text frame containing {"id": 1, "result": {"result": {"value": "success"}}}
            msg_bytes = json.dumps({"id": 1, "result": {"result": {"value": "success"}}}).encode("utf-8")
            frame = bytearray([0x81, len(msg_bytes)]) + msg_bytes

            mock_sock.recv.side_effect = [handshake_resp, bytes(frame), b""]

            with patch("socket.create_connection", return_value=mock_sock):
                res = engine._cdp_call("Test.method")
                self.assertIsNotNone(res)
                self.assertEqual(res["result"]["value"], "success")

            # Test evaluate wrapper
            with patch.object(engine, "_cdp_call") as mock_call:
                mock_call.return_value = {"result": {"value": 123}}
                val = engine._cdp_evaluate("1 + 1")
                self.assertEqual(val, 123)

                mock_call.return_value = None
                self.assertIsNone(engine._cdp_evaluate("bad"))

    def test_fetch_spotify_cdp_folder_tree(self):
        fake_tree = [
            {"id": "root-1", "name": "Playlists", "type": "folder", "playlists": [{"id": "pl-1", "name": "Vibes"}]}
        ]
        with patch.object(engine, "_cdp_evaluate", return_value=fake_tree):
            res = engine._fetch_spotify_cdp_folder_tree()
            self.assertEqual(len(res), 1)
            self.assertEqual(res[0]["name"], "Playlists")

    def test_inject_steam_gamepad_bridge_sync(self):
        with patch.object(engine, "_cdp_evaluate", return_value={"ok": True}):
            self.assertTrue(engine._inject_steam_gamepad_bridge_sync())
        with patch.object(engine, "_cdp_evaluate", return_value=None):
            self.assertFalse(engine._inject_steam_gamepad_bridge_sync())


class ServerAndImagesModuleTests(unittest.IsolatedAsyncioTestCase):
    async def test_sse_manager_broadcast_and_pruning(self):
        mgr = server.SSEManager()

        # Client 1: healthy writer
        w1 = MagicMock()
        w1.write = MagicMock()
        w1.drain = AsyncMock()

        # Client 2: broken writer (raises connection reset on drain)
        w2 = MagicMock()
        w2.write = MagicMock()
        w2.drain = AsyncMock(side_effect=ConnectionResetError("Disconnected"))

        await mgr.add_client(w1)
        await mgr.add_client(w2)
        self.assertEqual(len(mgr._clients), 2)

        await mgr.broadcast("test_event", {"hello": "world"})
        # w2 should have been pruned due to error
        self.assertEqual(len(mgr._clients), 1)

        await mgr.remove_client(w1)
        self.assertEqual(len(mgr._clients), 0)

    def test_image_redirect_handler_limits(self):
        handler = images._ImageRedirectHandler()
        req = MagicMock()
        # Invalid host raises ValueError
        with self.assertRaises(ValueError):
            handler.redirect_request(req, None, 302, "Found", {}, "https://evil.com/bad.png")

    def test_fetch_spotify_image_size_limit(self):
        with patch("urllib.request.build_opener") as mock_opener_cls:
            mock_opener = MagicMock()
            mock_resp = MagicMock()
            mock_resp.headers = MagicMock()
            mock_resp.headers.get_content_type.return_value = "image/jpeg"
            # Return body larger than 5MB
            mock_resp.read.return_value = b"x" * (6 * 1024 * 1024)
            mock_resp.__enter__.return_value = mock_resp
            mock_opener.open.return_value = mock_resp
            mock_opener_cls.return_value = mock_opener

            with self.assertRaises(RuntimeError) as cm:
                images._fetch_spotify_image("https://i.scdn.co/image/large")
            self.assertIn("size limit", str(cm.exception))


class AdditionalCoverageTests(unittest.IsolatedAsyncioTestCase):
    def test_settings_load_fallbacks_and_sanitization(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            f = os.path.join(tmpdir, "invalid_settings.json")
            # 1. Invalid backend & quality for librespot
            with open(f, "w") as fp:
                json.dump({
                    "audio_backend": "nonexistent_backend",
                    "audio_quality": "invalid_qual",
                    "device_name": "Steam Deck",
                    "device_name_customized": False,
                }, fp)
            s1 = common._load_settings(f)
            self.assertEqual(s1["audio_backend"], "librespot")
            self.assertEqual(s1["audio_quality"], "320")
            self.assertEqual(s1["device_name"], "")

            # 2. Spotify Client with lossless quality
            with open(f, "w") as fp:
                json.dump({
                    "audio_backend": "spotify_client",
                    "audio_quality": "lossless",
                }, fp)
            s2 = common._load_settings(f)
            self.assertEqual(s2["audio_quality"], "lossless")
            self.assertEqual(s2["bitrate"], 320)

            # 3. Spotify Client with invalid quality
            with open(f, "w") as fp:
                json.dump({
                    "audio_backend": "spotify_client",
                    "audio_quality": "unknown_q",
                }, fp)
            s3 = common._load_settings(f)
            self.assertEqual(s3["audio_quality"], "320")

    async def test_suspend_monitor_stop_with_proc(self):
        mon = device.SuspendResumeMonitor()
        mock_proc = MagicMock()
        mock_proc.terminate = Mock()
        mock_proc.wait = AsyncMock()
        mon._proc = mock_proc
        mon._running = True

        await mon.stop()
        mock_proc.terminate.assert_called_once()
        mock_proc.wait.assert_awaited_once()
        self.assertIsNone(mon._proc)

    def test_cdp_call_extended_payload_lengths(self):
        target = {"webSocketDebuggerUrl": "ws://127.0.0.1:9229/devtools/page/test"}
        with patch.object(engine, "_cdp_get_page_target", return_value=target):
            mock_sock = MagicMock()
            handshake_resp = b"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n"

            msg_bytes = json.dumps({"id": 1, "result": {"result": {"value": "ok"}}}).encode("utf-8")
            # 126 length header response
            frame = bytearray([0x81, 126]) + len(msg_bytes).to_bytes(2, "big") + msg_bytes
            mock_sock.recv.side_effect = [handshake_resp, bytes(frame), b""]

            with patch("socket.create_connection", return_value=mock_sock):
                # Send large params so payload exceeds 126 bytes
                large_params = {"big_data": "x" * 200}
                res = engine._cdp_call("Test.extended", params=large_params)
                self.assertIsNotNone(res)
                self.assertEqual(res["result"]["value"], "ok")
