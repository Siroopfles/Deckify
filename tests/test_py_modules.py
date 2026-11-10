import asyncio
import io
import json
import socket
import ssl
import sys
import tempfile
import time
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, Mock, patch
from urllib.error import HTTPError

with patch.dict("sys.modules", {"decky": SimpleNamespace(
    DECKY_PLUGIN_SETTINGS_DIR=tempfile.gettempdir(),
    DECKY_PLUGIN_DIR=tempfile.gettempdir(),
    DECKY_PLUGIN_RUNTIME_DIR=tempfile.gettempdir(),
    logger=Mock(),
    emit=AsyncMock(),
)}):
    from py_modules import (
        auth,
        common,
        device,
        engine,
        images,
        server,
        spotify,
    )


class PyModulesAuthTests(unittest.TestCase):
    def test_generate_pkce_pair(self):
        verifier, challenge = auth._generate_pkce_pair()
        self.assertIsInstance(verifier, str)
        self.assertIsInstance(challenge, str)
        self.assertGreaterEqual(len(verifier), 43)
        self.assertGreaterEqual(len(challenge), 43)
        self.assertNotIn("=", challenge)

    @patch("urllib.request.urlopen")
    def test_spotify_token_request_success(self, mock_urlopen):
        mock_resp = MagicMock()
        mock_resp.read.return_value = json.dumps({"access_token": "mock-token", "expires_in": 3600}).encode("utf-8")
        mock_resp.__enter__.return_value = mock_resp
        mock_urlopen.return_value = mock_resp

        res = auth._spotify_token_request({"grant_type": "authorization_code", "code": "abc"})
        self.assertEqual(res["access_token"], "mock-token")
        self.assertEqual(res["expires_in"], 3600)
        mock_urlopen.assert_called_once()


class PyModulesCommonTests(unittest.IsolatedAsyncioTestCase):
    def test_settings_load_and_save(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            test_file = f"{tmpdir}/test_settings.json"
            # When file doesn't exist, returns DEFAULT_SETTINGS copy
            s = common._load_settings(test_file)
            self.assertIsInstance(s, dict)
            self.assertEqual(s["audio_quality"], "320")

            # Save custom settings
            s["device_name"] = "Custom Deck"
            s["audio_quality"] = "160"
            common._save_settings(s, test_file)

            loaded = common._load_settings(test_file)
            self.assertEqual(loaded["device_name"], "Custom Deck")
            self.assertEqual(loaded["audio_quality"], "160")
            self.assertEqual(loaded["bitrate"], 160)

    def test_build_deck_command(self):
        cmd = ["echo", "hello"]
        with patch("os.geteuid", return_value=0, create=True):
            deck_cmd, env = common._build_deck_command(cmd, extra_env={"FOO": "BAR"})
            self.assertEqual(deck_cmd[0], "runuser")
            self.assertIn("FOO=BAR", deck_cmd)
            self.assertEqual(env["FOO"], "BAR")

        with patch("os.geteuid", return_value=1000, create=True):
            normal_cmd, normal_env = common._build_deck_command(cmd)
            self.assertEqual(normal_cmd, cmd)
            self.assertIn("HOME", normal_env)

    async def test_exec_async_helper(self):
        def blocking_fn(x, y):
            return x + y
        res = await common._exec(blocking_fn, 5, 7, timeout=2)
        self.assertEqual(res, 12)

        def slow_fn():
            time.sleep(0.5)
        with self.assertRaises(TimeoutError):
            await common._exec(slow_fn, timeout=0.05)


class PyModulesImagesTests(unittest.TestCase):
    def test_validate_image_url_accepts_valid_hosts(self):
        valid_urls = [
            "https://i.scdn.co/image/ab67616d0000b273b069d54e8ff7d47ba849a656",
            "https://mosaic.scdn.co/300/ab67616d0000b273",
            "https://seed-mix-image.spotifycdn.com/v6/img/artist/123/en/default",
        ]
        for url in valid_urls:
            with self.subTest(url=url):
                images._validate_image_url(url)

    def test_validate_image_url_rejects_invalid(self):
        invalid_urls = [
            "http://i.scdn.co/image/123",
            "https://evil.com/image.jpg",
            "https://i.scdn.co:8080/image",
            "ftp://i.scdn.co/image",
            "https://user:pass@i.scdn.co/image",
        ]
        for url in invalid_urls:
            with self.subTest(url=url):
                with self.assertRaises(ValueError):
                    images._validate_image_url(url)

    def test_proxy_spotify_image_url(self):
        self.assertIsNone(images._proxy_spotify_image_url(None))
        self.assertIsNone(images._proxy_spotify_image_url(""))
        self.assertIsNone(images._proxy_spotify_image_url("   "))
        self.assertIsNone(images._proxy_spotify_image_url("https://malicious.org/pic.png"))

        # Already proxied
        already = "http://127.0.0.1:39282/api/image?url=abc"
        self.assertEqual(images._proxy_spotify_image_url(already), already)

        # spotify:image: URI
        sp_img = "spotify:image:ab67616d0000b273"
        proxied = images._proxy_spotify_image_url(sp_img)
        self.assertIn("127.0.0.1:39282/api/image?", proxied)
        self.assertIn("https%3A%2F%2Fi.scdn.co%2Fimage%2Fab67616d0000b273", proxied)

        # spotify:mosaic: URI
        sp_mosaic = "spotify:mosaic:ab67:1234:5678:9abc"
        proxied_mosaic = images._proxy_spotify_image_url(sp_mosaic)
        self.assertIn("127.0.0.1:39282/api/image?", proxied_mosaic)
        self.assertIn("mosaic.scdn.co%2F300%2Fab67123456789abc", proxied_mosaic)

    def test_proxy_folder_tree_images(self):
        raw_tree = [
            {
                "id": "f1",
                "name": "Rock",
                "playlists": [
                    {"id": "p1", "name": "Classic", "image_url": "spotify:image:abcd1234efgh"},
                    {"id": "p2", "name": "Metal", "image_url": None},
                ],
                "subfolders": [
                    {
                        "id": "f2",
                        "name": "Sub",
                        "playlists": [
                            {"id": "p3", "image_url": "https://i.scdn.co/image/xyz"}
                        ]
                    }
                ]
            }
        ]
        result = images._proxy_folder_tree_images(raw_tree)
        self.assertIn("/api/image?", result[0]["playlists"][0]["image_url"])
        self.assertIsNone(result[0]["playlists"][1]["image_url"])
        self.assertIn("/api/image?", result[0]["subfolders"][0]["playlists"][0]["image_url"])


class PyModulesSpotifyTests(unittest.TestCase):
    @patch("urllib.request.urlopen")
    def test_spotify_api_request_success(self, mock_urlopen):
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.read.return_value = b'{"items": [{"id": "1", "name": "Song"}]}'
        mock_resp.__enter__.return_value = mock_resp
        mock_urlopen.return_value = mock_resp

        res = spotify._spotify_api_request("me/player", "fake-token", method="GET", params={"limit": 5})
        self.assertEqual(res["items"][0]["name"], "Song")

    @patch("urllib.request.urlopen")
    def test_spotify_api_request_no_content_204(self, mock_urlopen):
        mock_resp = MagicMock()
        mock_resp.status = 204
        mock_resp.__enter__.return_value = mock_resp
        mock_urlopen.return_value = mock_resp

        res = spotify._spotify_api_request("me/player/pause", "fake-token", method="PUT")
        self.assertIsNone(res)

    @patch("urllib.request.urlopen")
    def test_spotify_api_request_invalid_json(self, mock_urlopen):
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.read.return_value = b'not json'
        mock_resp.__enter__.return_value = mock_resp
        mock_urlopen.return_value = mock_resp

        res = spotify._spotify_api_request("me/player", "fake-token")
        self.assertIsNone(res)

    def test_parse_spotify_error(self):
        err = HTTPError("http://example.com", 400, "Bad Request", {}, io.BytesIO(b'{"error":{"message":"Invalid ID"}}'))
        self.assertEqual(spotify._parse_spotify_error(err), "Invalid ID")

        err_fallback = HTTPError("http://example.com", 500, "Server Error", {}, io.BytesIO(b'broken'))
        self.assertEqual(spotify._parse_spotify_error(err_fallback), "Spotify API error: 500")

    @patch("urllib.request.urlopen")
    def test_fetch_lyrics_sync(self, mock_urlopen):
        mock_resp = MagicMock()
        mock_resp.read.return_value = json.dumps({
            "syncedLyrics": "[00:10.00] Line 1\n[00:15.00] Line 2",
            "plainLyrics": "Line 1\nLine 2",
        }).encode("utf-8")
        mock_resp.__enter__.return_value = mock_resp
        mock_urlopen.return_value = mock_resp

        res = spotify._fetch_lyrics_sync("Song", "Artist", duration_sec=180)
        self.assertTrue(res["ok"])
        self.assertIn("Line 1", res["synced_lyrics"])
        self.assertEqual(res["plain_lyrics"], "Line 1\nLine 2")

    def test_sanitize_track_title(self):
        """Test regex sanitization on common Spotify metadata noise strings."""
        cases = [
            ("Hotel California - 2013 Remaster", "Hotel California"),
            ("Comfortably Numb - 2011 Remastered Version", "Comfortably Numb"),
            ("In the End (Remastered)", "In the End"),
            ("Yesterday (Remastered 2009)", "Yesterday"),
            ("Time [2011 Remaster]", "Time"),
            ("Empire State of Mind (feat. Alicia Keys)", "Empire State of Mind"),
            ("Starboy [feat. Daft Punk]", "Starboy"),
            ("Levitating (featuring Daft Punk)", "Levitating"),
            ("Industry Baby (ft. Jack Harlow)", "Industry Baby"),
            ("Song Title - feat. Artist", "Song Title"),
            ("Song Title (Deluxe Edition)", "Song Title"),
            ("Song Title - Deluxe Edition", "Song Title"),
            ("Song Title (Live at Wembley)", "Song Title"),
            ("Song Title - Live at the BBC", "Song Title"),
            ("Song Title (Radio Edit)", "Song Title"),
            ("Song Title - Single Version", "Song Title"),
            ("Good Riddance (Time of Your Life)", "Good Riddance (Time of Your Life)"),
            ("(Don't Fear) The Reaper", "(Don't Fear) The Reaper"),
            ("Song Title - 2020 Remastered", "Song Title"),
            ("Song Title (Anniversary Edition)", "Song Title"),
            ("Song Title - Bonus Track", "Song Title"),
        ]
        for raw, expected in cases:
            self.assertEqual(spotify._sanitize_track_title(raw), expected, f"Failed on {raw}")

    @patch("urllib.request.urlopen")
    def test_fetch_lyrics_sync_fallback_tiers(self, mock_urlopen):
        """Verify fallback from Tier 1 (404) to Tier 2 and Tier 3 search."""
        spotify._clear_lyrics_cache()

        req_count = 0
        def fake_urlopen(req, timeout=3.5, context=None):
            nonlocal req_count
            req_count += 1
            url = req.full_url if hasattr(req, "full_url") else req.get_full_url()
            if "duration=180" in url:
                raise HTTPError(url, 404, "Not Found", {}, None)
            mock_resp = MagicMock()
            mock_resp.read.return_value = json.dumps({
                "syncedLyrics": "[00:10.00] Fallback line",
                "plainLyrics": "Fallback line",
            }).encode("utf-8")
            mock_resp.__enter__.return_value = mock_resp
            return mock_resp

        mock_urlopen.side_effect = fake_urlopen
        res = spotify._fetch_lyrics_sync("Song (Remastered)", "Artist", duration_sec=180)
        self.assertTrue(res["ok"])
        self.assertIn("Fallback line", res["synced_lyrics"])
        self.assertGreaterEqual(req_count, 2)

    @patch("urllib.request.urlopen")
    def test_fetch_lyrics_sync_search_q_tier(self, mock_urlopen):
        """Verify Tier 3 /api/search?q= candidate ranking and selection."""
        spotify._clear_lyrics_cache()

        def fake_urlopen(req, timeout=3.5, context=None):
            url = req.full_url if hasattr(req, "full_url") else req.get_full_url()
            if "/api/get" in url:
                raise HTTPError(url, 404, "Not Found", {}, None)
            mock_resp = MagicMock()
            mock_resp.read.return_value = json.dumps([
                {
                    "trackName": "Song (Live)",
                    "artistName": "Artist",
                    "duration": 300,
                    "plainLyrics": "Live plain line",
                },
                {
                    "trackName": "Song",
                    "artistName": "Artist",
                    "duration": 182,
                    "syncedLyrics": "[00:10.00] Studio synced line",
                    "plainLyrics": "Studio synced line",
                },
            ]).encode("utf-8")
            mock_resp.__enter__.return_value = mock_resp
            return mock_resp

        mock_urlopen.side_effect = fake_urlopen
        res = spotify._fetch_lyrics_sync("Song", "Artist", duration_sec=180)
        self.assertTrue(res["ok"])
        self.assertIn("Studio synced line", res["synced_lyrics"])

    @patch("urllib.request.urlopen")
    def test_fetch_lyrics_sync_caching(self, mock_urlopen):
        """Verify in-memory LRU cache prevents second network request."""
        spotify._clear_lyrics_cache()

        mock_resp = MagicMock()
        mock_resp.read.return_value = json.dumps({
            "syncedLyrics": "[00:05.00] Cached line",
            "plainLyrics": "Cached line",
        }).encode("utf-8")
        mock_resp.__enter__.return_value = mock_resp
        mock_urlopen.return_value = mock_resp

        res1 = spotify._fetch_lyrics_sync("Cached Track", "Artist", duration_sec=180)
        self.assertTrue(res1["ok"])
        self.assertEqual(mock_urlopen.call_count, 1)

        res2 = spotify._fetch_lyrics_sync("Cached Track", "Artist", duration_sec=180)
        self.assertTrue(res2["ok"])
        self.assertEqual(mock_urlopen.call_count, 1)


class PyModulesDeviceTests(unittest.TestCase):
    def test_resolve_device_hostname(self):
        with patch("socket.gethostname", return_value="deck-machine"):
            self.assertEqual(device.resolve_device_hostname(), "deck-machine")
        with patch("socket.gethostname", side_effect=Exception("error")):
            self.assertEqual(device.resolve_device_hostname(), "Steam Deck")

    def test_get_lan_ip(self):
        with patch("socket.socket") as mock_sock_cls:
            mock_sock = MagicMock()
            mock_sock.getsockname.return_value = ["192.168.1.100", 12345]
            mock_sock_cls.return_value = mock_sock
            self.assertEqual(device._get_lan_ip(), "192.168.1.100")

        with patch("socket.socket", side_effect=Exception("network down")):
            self.assertEqual(device._get_lan_ip(), "127.0.0.1")

    def test_get_mdns_host(self):
        with patch("socket.gethostname", return_value="steamdeck"):
            self.assertEqual(device._get_mdns_host(), "steamdeck.local")
        with patch("socket.gethostname", side_effect=Exception):
            with patch.object(device, "_get_lan_ip", return_value="192.168.1.50"):
                self.assertEqual(device._get_mdns_host(), "192.168.1.50")

    @patch("subprocess.Popen")
    def test_shutdown_system_sync(self, mock_popen):
        device.shutdown_system_sync()
        mock_popen.assert_called_once_with(["systemctl", "poweroff"])

    @patch("ssl.SSLContext")
    @patch("os.path.isfile", return_value=True)
    def test_ensure_ssl_cert_existing(self, mock_isfile, mock_ssl):
        ctx, err = device._ensure_ssl_cert()
        self.assertIsNone(err)
        self.assertIsNotNone(ctx)

    @patch("os.path.isfile", return_value=False)
    @patch("subprocess.run")
    @patch("ssl.SSLContext")
    def test_ensure_ssl_cert_generation(self, mock_ssl, mock_run, mock_isfile):
        mock_proc = MagicMock()
        mock_proc.returncode = 0
        mock_run.return_value = mock_proc
        ctx, err = device._ensure_ssl_cert()
        self.assertIsNone(err)


class PyModulesServerTests(unittest.IsolatedAsyncioTestCase):
    async def test_sse_manager_lifecycle(self):
        mgr = server.SSEManager()
        writer = MagicMock()
        writer.write = Mock()
        writer.drain = AsyncMock()
        writer.close = Mock()
        writer.wait_closed = AsyncMock()

        # Add client with initial status
        await mgr.add_client(writer, initial_data={"status": "ok"})
        self.assertIn(writer, mgr._clients)
        writer.write.assert_called()
        msg = writer.write.call_args[0][0].decode("utf-8")
        self.assertIn("event: status", msg)
        self.assertIn('"status": "ok"', msg)

        # Broadcast update
        await mgr.broadcast("track", {"title": "New Track"})
        last_msg = writer.write.call_args[0][0].decode("utf-8")
        self.assertIn("event: track", last_msg)
        self.assertIn('"title": "New Track"', last_msg)

        # Heartbeat
        await mgr.send_heartbeats()
        self.assertIn(b": keepalive\n\n", [c[0][0] for c in writer.write.call_args_list])

        # Remove client
        await mgr.remove_client(writer)
        self.assertNotIn(writer, mgr._clients)


class PyModulesEngineTests(unittest.TestCase):
    def test_cdp_evaluate_and_call_parsing(self):
        with patch.object(engine, "_cdp_get_page_target", return_value={"webSocketDebuggerUrl": "ws://127.0.0.1:9229/page/1"}):
            with patch.object(engine, "_cdp_call", return_value={"result": {"value": 42}}):
                val = engine._cdp_evaluate("1 + 41")
                self.assertEqual(val, 42)

    def test_cdp_evaluate_positional_timeout_typeguard(self):
        """Test that _cdp_evaluate treats a float passed as 3rd arg as timeout."""
        with patch.object(engine, "_cdp_call", return_value={"result": {"value": 123}}) as mock_call:
            val = engine._cdp_evaluate("expr", 9222, 6.0)
            self.assertEqual(val, 123)
            mock_call.assert_called_once_with(
                "Runtime.evaluate",
                {"expression": "expr", "awaitPromise": True, "returnByValue": True},
                port=9222,
                target_title=None,
                timeout=6.0,
            )

    def test_cdp_get_page_target(self):
        with patch("urllib.request.urlopen") as mock_open:
            mock_resp = MagicMock()
            mock_resp.read.return_value = json.dumps([
                {"title": "Background", "type": "background_page"},
                {"title": "SharedJSContext", "type": "page", "webSocketDebuggerUrl": "ws://127.0.0.1:8080/devtools/page/xyz"},
            ]).encode("utf-8")
            mock_resp.__enter__.return_value = mock_resp
            mock_open.return_value = mock_resp

            target = engine._cdp_get_page_target(port=8080, target_title="SharedJSContext")
            self.assertEqual(target["title"], "SharedJSContext")

            generic = engine._cdp_get_page_target(port=8080)
            self.assertEqual(generic["type"], "page")


if __name__ == "__main__":
    unittest.main()
