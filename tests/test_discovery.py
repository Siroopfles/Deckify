import io
import json
import tempfile
import threading
import unittest
import urllib.error
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

with patch.dict("sys.modules", {"decky": SimpleNamespace(
    DECKY_PLUGIN_SETTINGS_DIR=tempfile.gettempdir(),
    DECKY_PLUGIN_DIR=tempfile.gettempdir(),
    DECKY_PLUGIN_RUNTIME_DIR=tempfile.gettempdir(),
    logger=MagicMock(),
    emit=AsyncMock(),
)}):
    from py_modules import common, rpc_library, spotify


def make_plugin():
    return SimpleNamespace(
        _settings=dict(common.DEFAULT_SETTINGS),
        _ensure_token=AsyncMock(return_value="tok"),
        _annotate_tracks_liked=AsyncMock(),
    )


def _mock_http_response(payload: dict | None, status: int = 200):
    resp = MagicMock()
    resp.status = status
    resp.read.return_value = json.dumps(payload).encode() if payload is not None else b""
    resp.__enter__ = MagicMock(return_value=resp)
    resp.__exit__ = MagicMock(return_value=False)
    return resp


def _http_error(code: int, headers: dict | None = None):
    return urllib.error.HTTPError(
        url="https://api.spotify.com/v1/test",
        code=code,
        msg="err",
        hdrs=headers or {},
        fp=io.BytesIO(b"{}"),
    )


def _sample_track(tid: str = "t1"):
    return {
        "id": tid,
        "uri": f"spotify:track:{tid}",
        "name": f"Track {tid}",
        "duration_ms": 200000,
        "artists": [{"id": "ar1", "name": "Artist One"}],
        "album": {"id": "al1", "name": "Album One", "images": [{"url": f"https://i.scdn.co/image/{tid}"}]},
    }


def _sample_artist(aid: str = "ar1"):
    return {
        "id": aid,
        "uri": f"spotify:artist:{aid}",
        "name": f"Artist {aid}",
        "genres": ["rock"],
        "images": [{"url": f"https://i.scdn.co/image/{aid}"}],
    }


def _sample_album(alid: str = "al2"):
    return {
        "id": alid,
        "uri": f"spotify:album:{alid}",
        "name": f"Album {alid}",
        "artists": [{"name": "New Artist"}],
        "images": [{"url": f"https://i.scdn.co/image/{alid}"}],
        "release_date": "2026-11-01",
        "total_tracks": 12,
    }


def _sample_mix(mid: str = "mix1", owner: str = "spotify"):
    return {
        "id": mid,
        "uri": f"spotify:playlist:{mid}",
        "name": f"Mix {mid}",
        "images": [{"url": f"https://i.scdn.co/image/{mid}"}],
        "tracks": {"total": 30},
        "owner": {"id": owner},
    }


class TestDiscoveryTracer(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        spotify._reset_rate_limit_breaker()
        if hasattr(rpc_library, "_clear_discovery_cache"):
            rpc_library._clear_discovery_cache()
        self.plugin = make_plugin()

    def test_scopes_version_7_includes_user_top_read(self):
        self.assertEqual(common.CURRENT_SCOPES_VERSION, 8)
        self.assertIn("user-top-read", common.SPOTIFY_SCOPES.split())

    def test_circuit_breaker_opens_fast_fails_and_resets(self):
        err_429 = _http_error(429, {"Retry-After": "2"})
        with patch.object(spotify.urllib.request, "urlopen", side_effect=err_429) as mock_open:
            with self.assertRaises(spotify.SpotifyRateLimitError) as ctx1:
                spotify._spotify_api_request("me/top/tracks", "tok")
            self.assertGreaterEqual(ctx1.exception.retry_after, 5.0)
            self.assertEqual(mock_open.call_count, 1)

            with self.assertRaises(spotify.SpotifyRateLimitError):
                spotify._spotify_api_request("me/top/tracks", "tok")
            self.assertEqual(mock_open.call_count, 1)

        spotify._reset_rate_limit_breaker()
        with patch.object(spotify.urllib.request, "urlopen", return_value=_mock_http_response({"ok": True})):
            res = spotify._spotify_api_request("me/top/tracks", "tok")
            self.assertEqual(res, {"ok": True})

    async def test_get_discovery_feed_happy_path(self):
        def fake_api(endpoint, token, method="GET", params=None, body=None):
            if endpoint == "me/playlists":
                return {"total": 2, "items": [_sample_mix("mix1", "spotify"), _sample_mix("u1", "user123")]}
            if endpoint == "playlists/ctx1":
                return {"id": "ctx1", "name": "Context Mix", "images": [{"url": "https://img/ctx1"}], "tracks": {"total": 20}, "owner": {"id": "u1"}}
            if endpoint == "me/top/tracks":
                return {"items": [_sample_track("t1")]}
            if endpoint == "me/top/artists":
                return {"items": [_sample_artist("ar1")]}
            if endpoint == "browse/new-releases":
                return {"albums": {"items": [_sample_album("al2")]}}
            return {}

        with patch.object(rpc_library, "_spotify_api_request", side_effect=fake_api):
            res = await rpc_library.get_discovery_feed(self.plugin, "invalid_range")

        self.assertTrue(res["ok"])
        self.assertEqual(res["time_range"], "medium_term")
        self.assertEqual(len(res["made_for_you"]), 1)
        self.assertEqual(len(res["top_tracks"]), 1)
        self.assertEqual(len(res["top_artists"]), 1)
        self.assertEqual(len(res["new_releases"]), 1)
        self.assertFalse(res["needs_reauth"])
        self.assertFalse(res["rate_limited"])
        self.assertFalse(res["stale"])
        self.plugin._annotate_tracks_liked.assert_awaited_once()


class TestDiscoveryCacheAndResilience(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        spotify._reset_rate_limit_breaker()
        rpc_library._clear_discovery_cache()
        self.plugin = make_plugin()

    async def test_ttl_cache_boundaries_and_time_range_isolation(self):
        calls = []

        def fake_api(endpoint, token, method="GET", params=None, body=None):
            calls.append((endpoint, dict(params or {})))
            if endpoint == "me/playlists":
                return {"total": 1, "items": [_sample_mix("mix1", "spotify")]}
            if endpoint == "playlists/ctx1":
                return {"id": "ctx1", "name": "Context Mix", "images": [{"url": "https://img/ctx1"}], "tracks": {"total": 20}, "owner": {"id": "u1"}}
            if endpoint == "me/top/tracks":
                return {"items": [_sample_track(f"t_{params['time_range']}")]}
            if endpoint == "me/top/artists":
                return {"items": [_sample_artist(f"a_{params['time_range']}")]}
            if endpoint == "artists/a_short_term/albums":
                return {"items": [_sample_album("al2")]}
            if endpoint == "browse/new-releases":
                return {"albums": {"items": [_sample_album("al2")]}}
            return {}

        now = [1000.0]
        with patch.object(rpc_library.time, "monotonic", side_effect=lambda: now[0]), \
             patch.object(rpc_library, "_spotify_api_request", side_effect=fake_api):
            await rpc_library.get_discovery_feed(self.plugin, "medium_term")
            initial_calls = len(calls)
            self.assertGreaterEqual(initial_calls, 4)

            # Still within 1h (< 4600.0): full cache hit
            now[0] = 4599.0
            await rpc_library.get_discovery_feed(self.plugin, "medium_term")
            self.assertEqual(len(calls), initial_calls)

            # Switch time_range: only top_tracks and top_artists fetched (made_for_you & new_releases stay cached 4h)
            await rpc_library.get_discovery_feed(self.plugin, "short_term")
            self.assertEqual(len(calls), initial_calls + 2)
            self.assertEqual({c[0] for c in calls[initial_calls:]}, {"me/top/tracks", "me/top/artists"})

            # At exact 1h boundary (1000 + 3600 = 4600.0): top_* for medium_term expired, static 4h still valid
            now[0] = 4600.0
            await rpc_library.get_discovery_feed(self.plugin, "medium_term")
            self.assertEqual(len(calls), initial_calls + 4)
            self.assertEqual({c[0] for c in calls[initial_calls + 2:]}, {"me/top/tracks", "me/top/artists"})

            # At exact 4h boundary (1000 + 14400 = 15400.0): all 4 sections refresh
            now[0] = 15400.0
            await rpc_library.get_discovery_feed(self.plugin, "medium_term")
            self.assertGreater(len(calls), initial_calls + 4)
            after_4h_calls = len(calls)

            # force_refresh=True bypasses all caches
            await rpc_library.get_discovery_feed(self.plugin, "medium_term", force_refresh=True)
            self.assertGreater(len(calls), after_4h_calls)

    async def test_made_for_you_pagination_and_jump_back_in_fallback(self):
        # 2 pages of playlists, Spotify mixes on page 2, capped at 15
        def fake_api_paginated(endpoint, token, method="GET", params=None, body=None):
            if endpoint == "me/playlists":
                offset = (params or {}).get("offset", 0)
                if offset == 0:
                    return {"total": 75, "items": [_sample_mix(f"u{i}", "user") for i in range(50)]}
                return {"total": 75, "items": [_sample_mix(f"m{i}", "spotify") for i in range(20)]}
            if endpoint == "playlists/ctx1":
                return {"id": "ctx1", "name": "Context Mix", "images": [{"url": "https://img/ctx1"}], "tracks": {"total": 20}, "owner": {"id": "u1"}}
            if endpoint == "me/top/tracks":
                return {"items": []}
            if endpoint == "me/top/artists":
                return {"items": []}
            if endpoint == "browse/new-releases":
                return {"albums": {"items": []}}
            return {}

        with patch.object(rpc_library, "_spotify_api_request", side_effect=fake_api_paginated):
            res = await rpc_library.get_discovery_feed(self.plugin, "medium_term")
        self.assertFalse(res["made_for_you_fallback"])
        self.assertEqual(len(res["made_for_you"]), 15)

        # Fallback to recently-played deduplicated by context.uri / album uri
        rpc_library._clear_discovery_cache()

        def fake_api_fallback(endpoint, token, method="GET", params=None, body=None):
            if endpoint == "me/playlists":
                return {"total": 1, "items": [_sample_mix("u1", "user")]}
            if endpoint == "me/player/recently-played":
                return {
                    "items": [
                        {"track": _sample_track("t1"), "context": {"uri": "spotify:playlist:ctx1", "type": "playlist"}},
                        {"track": _sample_track("t2"), "context": {"uri": "spotify:playlist:ctx1", "type": "playlist"}},
                        {"track": _sample_track("t3"), "context": None},
                    ]
                }
            if endpoint == "playlists/ctx1":
                return {"id": "ctx1", "name": "Context Mix", "images": [{"url": "https://img/ctx1"}], "tracks": {"total": 20}, "owner": {"id": "u1"}}
            if endpoint == "me/top/tracks":
                return {"items": []}
            if endpoint == "me/top/artists":
                return {"items": []}
            if endpoint == "browse/new-releases":
                return {"albums": {"items": []}}
            return {}

        with patch.object(rpc_library, "_spotify_api_request", side_effect=fake_api_fallback):
            res2 = await rpc_library.get_discovery_feed(self.plugin, "medium_term")
        self.assertTrue(res2["made_for_you_fallback"])
        self.assertEqual(len(res2["made_for_you"]), 2)
        self.assertEqual(res2["made_for_you"][0]["uri"], "spotify:playlist:ctx1")
        self.assertEqual(res2["made_for_you"][1]["uri"], "spotify:album:al1")

    async def test_http_403_top_needs_reauth_and_404_new_releases_fallback(self):
        def fake_api(endpoint, token, method="GET", params=None, body=None):
            if endpoint == "me/playlists":
                return {"total": 1, "items": [_sample_mix("mix1", "spotify")]}
            if endpoint in ("me/top/tracks", "me/top/artists"):
                raise _http_error(403)
            if endpoint == "browse/new-releases":
                raise _http_error(404)
            if endpoint == "search":
                self.assertEqual(params, {"q": "tag:new", "type": "album", "limit": 10})
                return {"albums": {"items": [_sample_album("search_al1")]}}
            return {}

        with patch.object(rpc_library, "_spotify_api_request", side_effect=fake_api):
            res = await rpc_library.get_discovery_feed(self.plugin, "medium_term")

        self.assertTrue(res["ok"])
        self.assertTrue(res["needs_reauth"])
        self.assertEqual(res["top_tracks"], [])
        self.assertEqual(res["top_artists"], [])
        self.assertEqual(len(res["made_for_you"]), 1)
        self.assertEqual(len(res["new_releases"]), 1)
        self.assertEqual(res["new_releases"][0]["id"], "search_al1")

    async def test_429_serves_stale_cache_or_empty_cooldown(self):
        # 1. No cache yet -> ok=True, empty sections, rate_limited=True, stale=False
        with patch.object(
            rpc_library,
            "_spotify_api_request",
            side_effect=spotify.SpotifyRateLimitError("rate limited", retry_after=15.0),
        ):
            res_empty = await rpc_library.get_discovery_feed(self.plugin, "medium_term")
        self.assertTrue(res_empty["ok"])
        self.assertTrue(res_empty["rate_limited"])
        self.assertFalse(res_empty["stale"])
        self.assertEqual(res_empty["retry_after"], 15)
        self.assertEqual(res_empty["made_for_you"], [])

        # 2. Populate cache, then expire it, then hit 429 -> serves stale data with stale=True
        def fake_ok(endpoint, token, method="GET", params=None, body=None):
            if endpoint == "me/playlists":
                return {"total": 1, "items": [_sample_mix("mix1", "spotify")]}
            if endpoint == "playlists/ctx1":
                return {"id": "ctx1", "name": "Context Mix", "images": [{"url": "https://img/ctx1"}], "tracks": {"total": 20}, "owner": {"id": "u1"}}
            if endpoint == "me/top/tracks":
                return {"items": [_sample_track("t1")]}
            if endpoint == "me/top/artists":
                return {"items": [_sample_artist("ar1")]}
            if endpoint == "browse/new-releases":
                return {"albums": {"items": [_sample_album("al2")]}}
            return {}

        now = [100.0]
        with patch.object(rpc_library.time, "monotonic", side_effect=lambda: now[0]), \
             patch.object(rpc_library, "_spotify_api_request", side_effect=fake_ok):
            await rpc_library.get_discovery_feed(self.plugin, "medium_term")

        now[0] = 20000.0  # past both 1h and 4h TTLs
        with patch.object(rpc_library.time, "monotonic", side_effect=lambda: now[0]), \
             patch.object(
                 rpc_library,
                 "_spotify_api_request",
                 side_effect=spotify.SpotifyRateLimitError("open", retry_after=40.0),
             ):
            res_stale = await rpc_library.get_discovery_feed(self.plugin, "medium_term")

        self.assertTrue(res_stale["ok"])
        self.assertTrue(res_stale["rate_limited"])
        self.assertTrue(res_stale["stale"])
        self.assertEqual(res_stale["retry_after"], 40)
        self.assertEqual(len(res_stale["made_for_you"]), 1)
        self.assertEqual(len(res_stale["top_tracks"]), 1)
        self.assertEqual(len(res_stale["top_artists"]), 1)
        self.assertEqual(len(res_stale["new_releases"]), 1)

    def test_circuit_breaker_exponential_backoff_retry_after_and_concurrency(self):
        now = [100.0]
        expected = [5.0, 10.0, 20.0, 40.0, 80.0, 160.0, 300.0, 300.0]
        with patch.object(spotify.time, "monotonic", side_effect=lambda: now[0]):
            for exp in expected:
                with patch.object(spotify.urllib.request, "urlopen", side_effect=_http_error(429, {"Retry-After": "1"})):
                    with self.assertRaises(spotify.SpotifyRateLimitError) as ctx:
                        spotify._spotify_api_request("me/playlists", "tok")
                    self.assertEqual(ctx.exception.retry_after, exp)
                now[0] += exp + 1.0  # advance past cooldown

            # Larger Retry-After (e.g. 120.5 float) respected, capped at 300.0
            spotify._reset_rate_limit_breaker()
            with patch.object(spotify.urllib.request, "urlopen", side_effect=_http_error(429, {"Retry-After": "120.5"})):
                with self.assertRaises(spotify.SpotifyRateLimitError) as ctx_f:
                    spotify._spotify_api_request("me/playlists", "tok")
                self.assertEqual(ctx_f.exception.retry_after, 120.5)

            # Malformed Retry-After falls back safely to 1.0 (so 5.0 base backoff applies)
            spotify._reset_rate_limit_breaker()
            with patch.object(spotify.urllib.request, "urlopen", side_effect=_http_error(429, {"Retry-After": "not-a-num"})):
                with self.assertRaises(spotify.SpotifyRateLimitError) as ctx_bad:
                    spotify._spotify_api_request("me/playlists", "tok")
                self.assertEqual(ctx_bad.exception.retry_after, 5.0)

        # Concurrent 429 + breaker checks under threads do not corrupt state
        spotify._reset_rate_limit_breaker()
        errors = []

        def worker():
            try:
                spotify._spotify_api_request("me/playlists", "tok")
            except spotify.SpotifyRateLimitError as e:
                errors.append(e.retry_after)

        with patch.object(spotify.urllib.request, "urlopen", side_effect=_http_error(429, {"Retry-After": "2"})):
            threads = [threading.Thread(target=worker) for _ in range(8)]
            for t in threads:
                t.start()
            for t in threads:
                t.join()
        self.assertEqual(len(errors), 8)
