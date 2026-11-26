import io
import json
import os
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.insert(0, os.path.dirname(__file__))

with patch.dict(
    "sys.modules",
    {
        "decky": SimpleNamespace(
            DECKY_PLUGIN_SETTINGS_DIR=tempfile.gettempdir(),
            DECKY_PLUGIN_DIR=tempfile.gettempdir(),
            DECKY_PLUGIN_RUNTIME_DIR=tempfile.gettempdir(),
            logger=MagicMock(),
            emit=AsyncMock(),
        )
    },
):
    from py_modules import resilience, spotify
    from test_token_refresh import main


class _FakeResponse:
    def __init__(self, payload: dict | None, status: int = 200):
        self._payload = payload
        self.status = status

    def read(self) -> bytes:
        if self._payload is None:
            return b""
        return json.dumps(self._payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class TestSpotifyApiRateLimiterAndCache(unittest.TestCase):
    def setUp(self):
        spotify._reset_rate_limit_breaker()

    def tearDown(self):
        spotify._reset_rate_limit_breaker()

    def test_get_cache_hit_and_mutation_invalidation(self):
        calls = 0

        def fake_urlopen(req, timeout=10, context=None):
            nonlocal calls
            calls += 1
            if req.get_method() == "GET":
                return _FakeResponse({"tracks": {"items": [{"id": "t1"}]}})
            return _FakeResponse(None, status=204)

        with patch("urllib.request.urlopen", side_effect=fake_urlopen):
            res1 = spotify._spotify_api_request("search", "tok-1", "GET", {"q": "lofi", "type": "track"})
            res2 = spotify._spotify_api_request("search", "tok-1", "GET", {"type": "track", "q": "lofi"})
            self.assertEqual(res1, res2)
            self.assertEqual(calls, 1)

            # Mutation invalidates cache
            spotify._spotify_api_request("me/player/play", "tok-1", "PUT", body={})
            self.assertEqual(calls, 2)

            # Subsequent GET hits network again
            spotify._spotify_api_request("search", "tok-1", "GET", {"q": "lofi", "type": "track"})
            self.assertEqual(calls, 3)

    def test_get_cache_keys_hash_token_and_isolate_users(self):
        key = spotify._make_get_cache_key("me/player", "secret-bearer-token-123", {"additional_types": "episode"})
        self.assertNotIn("secret-bearer-token-123", str(key))
        key2 = spotify._make_get_cache_key("me/player", "other-token-456", {"additional_types": "episode"})
        self.assertNotEqual(key, key2)

    def test_inflight_get_deduplication(self):
        calls = 0
        barrier = threading.Event()

        def slow_urlopen(req, timeout=10, context=None):
            nonlocal calls
            calls += 1
            time.sleep(0.08)
            return _FakeResponse({"is_playing": True})

        results = []
        errors = []

        def worker():
            try:
                barrier.wait(timeout=2.0)
                results.append(spotify._spotify_api_request("me/player", "tok-dup", "GET"))
            except Exception as exc:
                errors.append(exc)

        with patch("urllib.request.urlopen", side_effect=slow_urlopen):
            threads = [threading.Thread(target=worker) for _ in range(4)]
            for t in threads:
                t.start()
            barrier.set()
            for t in threads:
                t.join(timeout=5.0)

        self.assertEqual(errors, [])
        self.assertEqual(len(results), 4)
        self.assertEqual(calls, 1)

    def test_429_breaker_capped_at_60s(self):
        self.assertEqual(spotify._BREAKER_MAX_SECONDS, 60.0)
        err = urllib.error.HTTPError(
            url="https://api.spotify.com/v1/me/player",
            code=429,
            msg="Too Many Requests",
            hdrs={"Retry-After": "999"},
            fp=io.BytesIO(b""),
        )
        with patch("urllib.request.urlopen", side_effect=err):
            with self.assertRaises(spotify.SpotifyRateLimitError) as ctx:
                spotify._spotify_api_request("me/player", "tok-429", "GET")
        err.close()
        self.assertLessEqual(ctx.exception.retry_after, 60.0)
        self.assertTrue(spotify.is_rate_limit_breaker_open())

    def test_sliding_window_pacer_caps_burst(self):
        with spotify._RATE_LOCK:
            now = time.monotonic()
            for _ in range(spotify._RATE_WINDOW_MAX_REQUESTS):
                spotify._RATE_WINDOW.append(now)

        with patch("time.sleep") as mock_sleep:
            spotify._pace_outgoing_request()
        mock_sleep.assert_called_once()
        slept = mock_sleep.call_args[0][0]
        self.assertGreater(slept, 0.0)
        self.assertLessEqual(slept, spotify._RATE_PACE_MAX_SLEEP_S)


class TestPollIntervalAndLoopBackoff(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        spotify._reset_rate_limit_breaker()

    def tearDown(self):
        spotify._reset_rate_limit_breaker()

    def test_get_poll_interval_backoff_for_spotify_client_and_paused(self):
        plugin = SimpleNamespace(
            _settings={"audio_backend": "spotify_client", "device_name": "Deckify"},
            _poll_play_state="paused",
            _active_device=None,
        )
        server = resilience.LibrespotEventServer(plugin)
        self.assertGreaterEqual(server.get_poll_interval(plugin), 15.0)

        plugin._poll_play_state = "playing"
        self.assertGreaterEqual(server.get_poll_interval(plugin), 15.0)

        plugin._settings["audio_backend"] = "librespot"
        plugin._poll_play_state = "stopped"
        self.assertGreaterEqual(server.get_poll_interval(plugin), 15.0)

    async def test_poll_playback_skips_when_breaker_open_or_cdp_idle(self):
        plugin = main.Plugin()
        plugin._settings = {"audio_backend": "spotify_client"}
        plugin._poll_play_state = "paused"
        plugin._is_spotify_client_running = MagicMock(return_value=True)
        plugin._ensure_token = AsyncMock(return_value="tok-123")

        with patch.object(main, "_cdp_get_player_state", return_value={"ok": True, "is_playing": False}) as mock_cdp, patch.object(
            main, "_spotify_api_request"
        ) as mock_api:
            ok = await plugin._poll_playback()
        self.assertTrue(ok)
        mock_cdp.assert_called_once()
        mock_api.assert_not_called()

        # Now open breaker and verify Web API is skipped even when playing
        plugin._poll_play_state = "playing"
        with patch.object(main, "is_rate_limit_breaker_open", return_value=True), patch.object(
            main, "_spotify_api_request"
        ) as mock_api:
            ok = await plugin._poll_playback()
        self.assertTrue(ok)
        mock_api.assert_not_called()
