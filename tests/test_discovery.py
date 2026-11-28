import io
import json
import os
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
    from py_modules import cdp_bridge, common, rpc_library, rpc_playback, spotify


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

        self.assertTrue(res["ok"], res)
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

        self.assertTrue(res["ok"], res)
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
        expected = [5.0, 10.0, 20.0, 40.0, 60.0, 60.0, 60.0, 60.0]
        with patch.object(spotify.time, "monotonic", side_effect=lambda: now[0]):
            for exp in expected:
                with patch.object(spotify.urllib.request, "urlopen", side_effect=_http_error(429, {"Retry-After": "1"})):
                    with self.assertRaises(spotify.SpotifyRateLimitError) as ctx:
                        spotify._spotify_api_request("me/playlists", "tok")
                    self.assertEqual(ctx.exception.retry_after, exp)
                now[0] += exp + 1.0  # advance past cooldown

            # Larger Retry-After (e.g. 120.5 float) capped at 60.0
            spotify._reset_rate_limit_breaker()
            with patch.object(spotify.urllib.request, "urlopen", side_effect=_http_error(429, {"Retry-After": "120.5"})):
                with self.assertRaises(spotify.SpotifyRateLimitError) as ctx_f:
                    spotify._spotify_api_request("me/playlists", "tok")
                self.assertEqual(ctx_f.exception.retry_after, 60.0)

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


class TestDiscoveryAlgorithmicMixes(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        spotify._reset_rate_limit_breaker()
        rpc_library._clear_discovery_cache()
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp_dir.cleanup)
        self.cache_file = os.path.join(self.tmp_dir.name, "discovery_mixes.json")
        patcher = patch.object(cdp_bridge, "DISCOVERY_MIXES_CACHE_FILE", self.cache_file)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.plugin = make_plugin()

    def test_sort_algorithmic_mixes_order_and_dedup(self):
        raw = [
            {"id": "other", "uri": "spotify:playlist:other", "name": "Chill Mix"},
            {"id": "dm3", "uri": "spotify:playlist:dm3", "name": "Daily Mix 3"},
            {"id": "or", "uri": "spotify:playlist:or", "name": "On Repeat"},
            {"id": "rr", "uri": "spotify:playlist:rr", "name": "Release Radar"},
            {"id": "dm1", "uri": "spotify:playlist:dm1", "name": "Daily Mix 1"},
            {"id": "dw", "uri": "spotify:playlist:dw", "name": "Discover Weekly"},
            {"id": "dl", "uri": "spotify:playlist:dl", "name": "daylist"},
            {"id": "dl_dup", "uri": "spotify:playlist:dl", "name": "daylist", "image_url": "https://img/dl"},
        ]
        sorted_mixes = rpc_library._sort_algorithmic_mixes(raw)
        names = [m["name"] for m in sorted_mixes]
        self.assertEqual(
            names,
            ["daylist", "Discover Weekly", "Release Radar", "Daily Mix 1", "Daily Mix 3", "On Repeat", "Chill Mix"],
        )
        self.assertEqual(sorted_mixes[0]["image_url"], "https://img/dl")

    async def test_cdp_mixes_merged_sorted_prefetched_and_persisted(self):
        self.plugin._settings["audio_backend"] = "spotify_client"
        self.plugin._spotify_client_process = SimpleNamespace(poll=lambda: None)

        cdp_items = [
            {"id": "or1", "uri": "spotify:playlist:or1", "name": "On Repeat", "subtitle": "Songs you love", "owner": "Spotify"},
            {"id": "dl1", "uri": "spotify:playlist:dl1", "name": "daylist", "subtitle": "chill tuesday", "owner": "Spotify"},
            {"id": "dw1", "uri": "spotify:playlist:dw1", "name": "Discover Weekly", "subtitle": "Your weekly mixtape", "owner": "Spotify"},
        ]
        long_tracklist = [{"id": f"t{i}", "uri": f"spotify:track:t{i}", "name": f"Track {i}"} for i in range(120)]

        def fake_api(endpoint, token, method="GET", params=None, body=None):
            if endpoint == "me/playlists":
                return {"total": 1, "items": [_sample_mix("rr1", "spotify") | {"name": "Release Radar"}]}
            if endpoint in ("me/top/tracks", "me/top/artists"):
                return {"items": []}
            if endpoint == "browse/new-releases":
                return {"albums": {"items": []}}
            return {}

        with patch.object(rpc_library, "_spotify_api_request", side_effect=fake_api), \
             patch.object(rpc_library, "cdp_fetch_discovery_mixes", return_value={"ok": True, "items": cdp_items}), \
             patch.object(rpc_library, "cdp_get_playlist_tracks", return_value={"ok": True, "tracks": long_tracklist, "total": 120}) as mock_prefetch:
            res = await rpc_library.get_discovery_feed(self.plugin, "medium_term")

        self.assertTrue(res["ok"], res)
        self.assertFalse(res["made_for_you_fallback"])
        self.assertEqual([m["name"] for m in res["made_for_you"]], ["daylist", "Discover Weekly", "Release Radar", "On Repeat"])
        self.assertEqual(mock_prefetch.call_count, 4)

        disk = cdp_bridge.load_discovery_mixes_cache()
        self.assertEqual(disk["version"], 1)
        self.assertIn("updated_at", disk)
        self.assertEqual(len(disk["mixes"]), 4)
        self.assertEqual(len(disk["mixes"][0]["tracks"]), 100)
        self.assertEqual(len(disk["mixes"][0]["uris"]), 100)

    async def test_librespot_preserves_cache_and_appends_cached_subtitle(self):
        # Seed disk cache as if spotify_client had previously populated it
        seeded = {
            "version": 1,
            "updated_at": 1700000000,
            "mixes": [
                {
                    "id": "dl1",
                    "uri": "spotify:playlist:dl1",
                    "name": "daylist",
                    "subtitle": "chill tuesday",
                    "tracks": [{"id": "t1", "uri": "spotify:track:t1", "name": "Track 1"}],
                }
            ],
        }
        cdp_bridge.save_discovery_mixes_cache(seeded)

        # Switch to librespot
        self.plugin._settings["audio_backend"] = "librespot"
        self.plugin._spotify_client_process = None

        def fake_api(endpoint, token, method="GET", params=None, body=None):
            if endpoint == "me/playlists":
                return {"total": 0, "items": []}
            if endpoint in ("me/top/tracks", "me/top/artists"):
                return {"items": []}
            if endpoint == "browse/new-releases":
                return {"albums": {"items": []}}
            return {}

        with patch.object(rpc_library, "_spotify_api_request", side_effect=fake_api), \
             patch.object(rpc_library, "cdp_fetch_discovery_mixes") as mock_cdp_mixes, \
             patch.object(rpc_library, "cdp_get_playlist_tracks") as mock_cdp_tracks:
            res = await rpc_library.get_discovery_feed(self.plugin, "medium_term", force_refresh=True)

        mock_cdp_mixes.assert_not_called()
        mock_cdp_tracks.assert_not_called()
        self.assertTrue(res["ok"], res)
        self.assertFalse(res["made_for_you_fallback"])
        self.assertEqual(len(res["made_for_you"]), 1)
        self.assertEqual(res["made_for_you"][0]["subtitle"], "chill tuesday · Cached")

        # Disk cache must remain untouched
        disk = cdp_bridge.load_discovery_mixes_cache()
        self.assertEqual(disk["updated_at"], 1700000000)
        self.assertEqual(disk["mixes"][0]["subtitle"], "chill tuesday")

    async def test_partial_cdp_probe_merges_with_cached_core_mixes_and_preserves_blends_dj(self):
        seeded = {
            "version": 1,
            "updated_at": 1700000000,
            "mixes": [
                {
                    "id": "37i9dQZF1EP6YuccBxUcC1",
                    "uri": "spotify:playlist:37i9dQZF1EP6YuccBxUcC1",
                    "name": "chill indie thursday afternoon",
                    "subtitle": "Updated throughout the day",
                    "owner_id": "Spotify",
                    "kind": "core",
                    "tracks": [{"id": "t1", "uri": "spotify:track:t1", "name": "Track 1"}],
                },
                {
                    "id": "dw1",
                    "uri": "spotify:playlist:dw1",
                    "name": "Discover Weekly",
                    "subtitle": "Your weekly mixtape",
                    "owner_id": "Spotify",
                    "kind": "core",
                    "tracks": [{"id": "t2", "uri": "spotify:track:t2", "name": "Track 2"}],
                },
            ],
            "blends": [{"id": "bl1", "uri": "spotify:playlist:bl1", "name": "Alex + You Blend", "kind": "blend"}],
            "dj": {"id": "37i9dQZF1EYkqdzj48dyYq", "uri": "spotify:playlist:37i9dQZF1EYkqdzj48dyYq", "name": "DJ", "kind": "dj"},
        }
        cdp_bridge.save_discovery_mixes_cache(seeded)

        self.plugin._settings["audio_backend"] = "spotify_client"
        self.plugin._spotify_client_process = SimpleNamespace(poll=lambda: None)

        # Partial probe returns only Release Radar and omits Daylist, Discover Weekly, blends, and dj
        cdp_items = [
            {"id": "rr1", "uri": "spotify:playlist:rr1", "name": "Release Radar", "subtitle": "New music", "owner": "Spotify"},
        ]

        def fake_api(endpoint, token, method="GET", params=None, body=None):
            if endpoint == "me/playlists":
                return {"total": 0, "items": []}
            if endpoint in ("me/top/tracks", "me/top/artists"):
                return {"items": []}
            if endpoint == "browse/new-releases":
                return {"albums": {"items": []}}
            return {}

        with patch.object(rpc_library, "_spotify_api_request", side_effect=fake_api), \
             patch.object(rpc_library, "cdp_fetch_discovery_mixes", return_value={"ok": True, "items": cdp_items}), \
             patch.object(rpc_library, "cdp_get_playlist_tracks", return_value={"ok": True, "tracks": [{"id": "t3", "uri": "spotify:track:t3", "name": "Track 3"}], "total": 1}):
            res = await rpc_library.get_discovery_feed(self.plugin, "medium_term", force_refresh=True)

        self.assertTrue(res["ok"], res)
        names = [m["name"] for m in res["made_for_you"]]
        self.assertEqual(names, ["chill indie thursday afternoon", "Discover Weekly", "Release Radar"])
        self.assertEqual(len(res["blends"]), 1)
        self.assertEqual(res["blends"][0]["id"], "bl1")
        self.assertIsNotNone(res["dj"])
        self.assertEqual(res["dj"]["id"], "37i9dQZF1EYkqdzj48dyYq")

        disk = cdp_bridge.load_discovery_mixes_cache()
        self.assertEqual([m["id"] for m in disk["mixes"]], ["37i9dQZF1EP6YuccBxUcC1", "dw1", "rr1"])
        self.assertEqual(len(disk["blends"]), 1)
        self.assertEqual(disk["dj"]["id"], "37i9dQZF1EYkqdzj48dyYq")

    async def test_get_search_browse_categories(self):
        # librespot -> 0ms empty list, no CDP call
        self.plugin._settings["audio_backend"] = "librespot"
        with patch.object(rpc_library, "cdp_fetch_browse_categories") as mock_cats:
            res_lib = await rpc_library.get_search_browse_categories(self.plugin)
        self.assertEqual(res_lib, {"ok": True, "categories": []})
        mock_cats.assert_not_called()

        # spotify_client -> returns CDP categories
        self.plugin._settings["audio_backend"] = "spotify_client"
        self.plugin._spotify_client_process = SimpleNamespace(poll=lambda: None)
        cats = [{"id": "gaming", "name": "Gaming", "image_url": "https://img/g", "uri": "spotify:genre:gaming"}]
        with patch.object(rpc_library, "cdp_fetch_browse_categories", return_value=cats):
            res_cdp = await rpc_library.get_search_browse_categories(self.plugin)
        self.assertEqual(res_cdp, {"ok": True, "categories": cats})

    async def test_get_playlist_tracks_serves_cached_mix_on_403_404_librespot(self):
        seeded_tracks = [{"id": "t1", "uri": "spotify:track:t1", "name": "Cached Song"}]
        cdp_bridge.save_discovery_mixes_cache({
            "version": 1,
            "updated_at": 1700000000,
            "mixes": [{
                "id": "dl1",
                "uri": "spotify:playlist:dl1",
                "name": "daylist",
                "tracks": seeded_tracks,
            }],
        })
        self.plugin._settings["audio_backend"] = "librespot"
        self.plugin._spotify_client_process = None

        async def annotate(tok, tracks):
            for t in tracks:
                t["is_liked"] = True

        self.plugin._annotate_tracks_liked = AsyncMock(side_effect=annotate)

        for code in (403, 404):
            with patch.object(rpc_library, "_spotify_api_request", side_effect=_http_error(code)), \
                 patch.object(rpc_library, "_cdp_get_playlist_tracks") as mock_cdp:
                res = await rpc_library.get_playlist_tracks(self.plugin, "dl1", offset=0, fetch_all=False)
            mock_cdp.assert_not_called()
            self.assertTrue(res["ok"], res)
            self.assertTrue(res["cached"])
            self.assertFalse(res["has_more"])
            self.assertEqual(res["total"], 1)
            self.assertEqual(res["tracks"][0]["id"], "t1")
            self.assertTrue(res["tracks"][0]["is_liked"])

    async def test_get_playlist_tracks_live_cdp_refreshes_disk_cache(self):
        cdp_bridge.save_discovery_mixes_cache({
            "version": 1,
            "updated_at": 1700000000,
            "mixes": [{
                "id": "dl1",
                "uri": "spotify:playlist:dl1",
                "name": "daylist",
                "tracks": [{"id": "old", "uri": "spotify:track:old", "name": "Old"}],
            }],
        })
        self.plugin._settings["audio_backend"] = "spotify_client"
        self.plugin._spotify_client_process = SimpleNamespace(poll=lambda: None)
        fresh_tracks = [{"id": f"new{i}", "uri": f"spotify:track:new{i}", "name": f"New {i}"} for i in range(110)]

        with patch.object(rpc_library, "_spotify_api_request", side_effect=_http_error(404)), \
             patch.object(rpc_library, "_cdp_get_playlist_tracks", return_value={"ok": True, "tracks": fresh_tracks, "total": 110}):
            res = await rpc_library.get_playlist_tracks(self.plugin, "spotify:playlist:dl1", offset=0, fetch_all=True)

        self.assertTrue(res["ok"], res)
        self.assertEqual(len(res["tracks"]), 110)
        disk = cdp_bridge.load_discovery_mixes_cache()
        self.assertEqual(len(disk["mixes"][0]["tracks"]), 100)
        self.assertEqual(disk["mixes"][0]["tracks"][0]["id"], "new0")
        self.assertEqual(len(disk["mixes"][0]["uris"]), 100)
        self.assertEqual(disk["mixes"][0]["uris"][0], "spotify:track:new0")

    async def test_blends_dj_split_skips_prefetch_and_web_search_fallback(self):
        self.plugin._settings["audio_backend"] = "spotify_client"
        self.plugin._spotify_client_process = SimpleNamespace(poll=lambda: None)

        cdp_items = [
            {"id": "dl1", "uri": "spotify:playlist:dl1", "name": "daylist", "owner": "Spotify", "kind": "core"},
            {"id": "dw1", "uri": "spotify:playlist:dw1", "name": "Discover Weekly", "owner": "Spotify", "kind": "core"},
            {"id": "rr1", "uri": "spotify:playlist:rr1", "name": "Release Radar", "owner": "Spotify", "kind": "core"},
            {"id": "dm1", "uri": "spotify:playlist:dm1", "name": "Daily Mix 1", "owner": "Spotify", "kind": "core"},
            {"id": "37i9dQZF1EJabc", "uri": "spotify:playlist:37i9dQZF1EJabc", "name": "Alex + Sam", "owner": "Spotify", "kind": "blend"},
            {"id": "37i9dQZF1EYkqdzj48dyYq", "uri": "spotify:playlist:37i9dQZF1EYkqdzj48dyYq", "name": "DJ", "owner": "Spotify", "kind": "dj"},
        ]

        def fake_api(endpoint, token, method="GET", params=None, body=None):
            if endpoint == "me/playlists":
                return {"total": 0, "items": []}
            if endpoint == "search":
                q = (params or {}).get("q", "")
                if q == "Discover Weekly":
                    return {"playlists": {"items": [{"id": "dw1", "uri": "spotify:playlist:dw1", "name": "Discover Weekly", "owner": {"id": "spotify"}, "images": []}]}}
                if q == "Release Radar":
                    return {"playlists": {"items": [{"id": "rr1", "uri": "spotify:playlist:rr1", "name": "Release Radar", "owner": {"id": "spotify"}, "images": []}]}}
                if q == "Daily Mix":
                    return {"playlists": {"items": [{"id": "dm1", "uri": "spotify:playlist:dm1", "name": "Daily Mix 1", "owner": {"id": "spotify"}, "images": []}]}}
                return {"playlists": {"items": []}}
            if endpoint in ("me/top/tracks", "me/top/artists"):
                return {"items": []}
            if endpoint == "browse/new-releases":
                return {"albums": {"items": []}}
            return {}

        prefetched_ids = []

        def fake_prefetch(pid, offset=0, fetch_all=False):
            prefetched_ids.append(pid)
            return {"ok": True, "tracks": [{"id": "t1", "uri": "spotify:track:t1", "name": "T1"}], "total": 1}

        with patch.object(rpc_library, "_spotify_api_request", side_effect=fake_api), \
             patch.object(rpc_library, "cdp_fetch_discovery_mixes", return_value={"ok": True, "items": cdp_items}), \
             patch.object(rpc_library, "cdp_get_playlist_tracks", side_effect=fake_prefetch):
            res = await rpc_library.get_discovery_feed(self.plugin, "medium_term")

        self.assertTrue(res["ok"], res)
        self.assertTrue(res["cdp_active"])
        self.assertEqual([m["name"] for m in res["made_for_you"]], ["daylist", "Discover Weekly", "Release Radar", "Daily Mix 1"])
        self.assertEqual([b["name"] for b in res["blends"]], ["Alex + Sam"])
        self.assertIsNotNone(res["dj"])
        self.assertEqual(res["dj"]["id"], "37i9dQZF1EYkqdzj48dyYq")
        # Blend and DJ must NEVER be prefetched
        self.assertNotIn("37i9dQZF1EJabc", prefetched_ids)
        self.assertNotIn("37i9dQZF1EYkqdzj48dyYq", prefetched_ids)
        self.assertEqual(set(prefetched_ids), {"dl1", "dw1", "rr1", "dm1"})

    async def test_play_ai_dj_engine_gating(self):
        # librespot -> fast-fail requires_spotify_client=True without calling CDP
        self.plugin._settings["audio_backend"] = "librespot"
        self.plugin._spotify_client_process = None
        with patch.object(rpc_playback, "cdp_play_context") as mock_play:
            res_lib = await rpc_playback.play_ai_dj(self.plugin)
        self.assertFalse(res_lib["ok"])
        self.assertTrue(res_lib.get("requires_spotify_client"))
        mock_play.assert_not_called()

        # spotify_client -> calls cdp_play_context
        self.plugin._settings["audio_backend"] = "spotify_client"
        self.plugin._spotify_client_process = SimpleNamespace(poll=lambda: None)
        with patch.object(rpc_playback, "cdp_play_context", return_value={"ok": True, "uri": "spotify:playlist:37i9dQZF1EYkqdzj48dyYq"}) as mock_play:
            res_cdp = await rpc_playback.play_ai_dj(self.plugin)
        self.assertTrue(res_cdp["ok"])
        mock_play.assert_called_once_with("spotify:playlist:37i9dQZF1EYkqdzj48dyYq")

    async def test_search_missing_core_mixes_includes_on_repeat(self):
        queried = []

        def fake_api(endpoint, token, method="GET", params=None, body=None):
            q = (params or {}).get("q", "")
            queried.append(q)
            if q == "On Repeat":
                return {
                    "playlists": {
                        "items": [
                            {
                                "id": "37i9dQZF1Ep123",
                                "uri": "spotify:playlist:37i9dQZF1Ep123",
                                "name": "On Repeat",
                                "owner": {"id": "spotify"},
                                "images": [],
                            }
                        ]
                    }
                }
            return {"playlists": {"items": []}}

        with patch.object(rpc_library, "_spotify_api_request", side_effect=fake_api):
            found = await rpc_library._search_missing_core_mixes("tok", [])

        self.assertIn("On Repeat", queried)
        self.assertTrue(any(m["name"] == "On Repeat" and m["kind"] == "core" for m in found))

    async def test_get_playlist_tracks_forwards_daylist_metadata(self):
        self.plugin._settings["audio_backend"] = "spotify_client"
        self.plugin._spotify_client_process = SimpleNamespace(poll=lambda: None)

        cdp_payload = {
            "ok": True,
            "tracks": [{"id": "t1", "name": "Track 1", "uri": "spotify:track:t1"}],
            "total": 1,
            "offset": 0,
            "playlist_name": "chill afternoon mix",
            "playlist_description": "Dynamic Daylist title",
        }
        with patch.object(rpc_library, "_spotify_api_request", side_effect=_http_error(403)), \
             patch.object(rpc_library, "_cdp_get_playlist_tracks", return_value=cdp_payload), \
             patch.object(rpc_library, "_refresh_cached_mix_tracks"):
            res = await rpc_library.get_playlist_tracks(self.plugin, "37i9dQZF1EP6YuccBxUyC1")

        self.assertTrue(res["ok"], res)
        self.assertEqual(res["playlist_name"], "chill afternoon mix")
        self.assertEqual(res["playlist_description"], "Dynamic Daylist title")

    async def test_get_discovery_feed_keys_cache_by_audio_backend(self):
        rpc_library._clear_discovery_cache()
        self.plugin._settings["audio_backend"] = "spotify_client"
        self.plugin._spotify_client_process = SimpleNamespace(poll=lambda: None)

        cdp_mixes = {
            "ok": True,
            "items": [
                {
                    "id": "37i9dQZF1EP6YuccBxUyC1",
                    "uri": "spotify:playlist:37i9dQZF1EP6YuccBxUyC1",
                    "name": "daylist",
                    "subtitle": "Here is some <a href=\"spotify:playlist:1\">bass</a> &amp; chill",
                    "image_url": "https://i.scdn.co/image/dl",
                    "artwork_url": "https://i.scdn.co/image/dl",
                    "track_count": 50,
                    "owner_id": "spotify",
                    "kind": "core",
                }
            ],
        }

        def fake_api(endpoint, token, method="GET", params=None):
            if endpoint == "me/playlists":
                return {"items": [], "total": 0}
            if endpoint == "me/top/tracks":
                return {"items": []}
            if endpoint == "me/top/artists":
                return {"items": []}
            if endpoint == "browse/new-releases":
                return {"albums": {"items": []}}
            return {}

        with patch.object(rpc_library, "cdp_fetch_discovery_mixes", return_value=cdp_mixes), \
             patch.object(rpc_library, "cdp_get_playlist_tracks", return_value={"ok": False}), \
             patch.object(rpc_library, "_spotify_api_request", side_effect=fake_api), \
             patch.object(rpc_library, "save_discovery_mixes_cache"), \
             patch.object(
                 rpc_library,
                 "load_discovery_mixes_cache",
                 return_value={
                     "mixes": [
                         {
                             "id": "37i9dQZF1EP6YuccBxUyC1",
                             "uri": "spotify:playlist:37i9dQZF1EP6YuccBxUyC1",
                             "name": "daylist",
                             "subtitle": "Here is some bass & chill",
                             "owner_id": "spotify",
                             "kind": "core",
                         }
                     ]
                 },
             ):
            res_cdp = await rpc_library.get_discovery_feed(self.plugin, "medium_term")
            self.assertTrue(res_cdp["ok"])
            self.assertEqual(res_cdp["made_for_you"][0]["subtitle"], "Here is some bass & chill")

            # Switch backend to librespot — must NOT return stale spotify_client cache
            self.plugin._settings["audio_backend"] = "librespot"
            self.plugin._spotify_client_process = None
            res_lib = await rpc_library.get_discovery_feed(self.plugin, "medium_term")

        self.assertTrue(res_lib["ok"])
        self.assertTrue(res_lib["made_for_you"][0]["subtitle"].endswith(" · Cached"))

    async def test_html_tags_stripped_from_playlist_descriptions_and_subtitles(self):
        formatted = rpc_library._format_discovery_playlist({
            "id": "37i9dQZF1EP6YuccBxUyC1",
            "name": "daylist",
            "description": 'Here’s some <a href="spotify:playlist:123">uk garage</a> &amp; <a href="spotify:playlist:456">bass</a>.',
            "owner": {"id": "spotify"},
            "images": [],
            "tracks": {"total": 10},
        })
        self.assertEqual(formatted["subtitle"], "Here’s some uk garage & bass.")

        self.plugin._settings["audio_backend"] = "spotify_client"
        self.plugin._spotify_client_process = SimpleNamespace(poll=lambda: None)
        cdp_payload = {
            "ok": True,
            "tracks": [{"id": "t1", "name": "Track 1", "uri": "spotify:track:t1"}],
            "total": 1,
            "offset": 0,
            "playlist_name": "daylist",
            "playlist_description": 'Late night <a href="spotify:playlist:abc">synthwave</a> &amp; chill',
        }
        with patch.object(rpc_library, "_spotify_api_request", side_effect=_http_error(403)), \
             patch.object(rpc_library, "_cdp_get_playlist_tracks", return_value=cdp_payload), \
             patch.object(rpc_library, "_refresh_cached_mix_tracks"):
            res = await rpc_library.get_playlist_tracks(self.plugin, "37i9dQZF1EP6YuccBxUyC1")

        self.assertTrue(res["ok"], res)
        self.assertEqual(res["playlist_description"], "Late night synthwave & chill")

    async def test_fetch_made_for_you_skips_web_search_when_cdp_mixes_present(self):
        self.plugin._settings["audio_backend"] = "spotify_client"
        self.plugin._spotify_client_process = SimpleNamespace(poll=lambda: None)
        cdp_mixes = {
            "ok": True,
            "items": [
                {
                    "id": "37i9dQZF1EP6YuccBxUyC1",
                    "uri": "spotify:playlist:37i9dQZF1EP6YuccBxUyC1",
                    "name": "daylist",
                    "subtitle": "Daylist",
                    "owner_id": "spotify",
                    "kind": "core",
                },
                {
                    "id": "dw1",
                    "uri": "spotify:playlist:dw1",
                    "name": "Discover Weekly",
                    "owner_id": "spotify",
                    "kind": "core",
                },
                {
                    "id": "rr1",
                    "uri": "spotify:playlist:rr1",
                    "name": "Release Radar",
                    "owner_id": "spotify",
                    "kind": "core",
                },
                {
                    "id": "dm1",
                    "uri": "spotify:playlist:dm1",
                    "name": "Daily Mix 1",
                    "owner_id": "spotify",
                    "kind": "core",
                },
                {
                    "id": "or1",
                    "uri": "spotify:playlist:or1",
                    "name": "On Repeat",
                    "owner_id": "spotify",
                    "kind": "core",
                },
            ],
        }
        with patch.object(rpc_library, "cdp_fetch_discovery_mixes", return_value=cdp_mixes), \
             patch.object(rpc_library, "_spotify_api_request", return_value={"items": [], "total": 0}), \
             patch.object(rpc_library, "load_discovery_mixes_cache", return_value={}), \
             patch.object(rpc_library, "save_discovery_mixes_cache"), \
             patch.object(rpc_library, "cdp_get_playlist_tracks", return_value={"ok": False}), \
             patch.object(rpc_library, "_search_missing_core_mixes", new=AsyncMock(return_value=[])) as mock_search:
            await rpc_library._fetch_made_for_you_section("tok", self.plugin)

        mock_search.assert_not_called()

    async def test_fetch_made_for_you_fills_missing_core_mixes_when_cdp_partial(self):
        self.plugin._settings["audio_backend"] = "spotify_client"
        self.plugin._spotify_client_process = SimpleNamespace(poll=lambda: None)
        cdp_mixes = {
            "ok": True,
            "items": [
                {
                    "id": "37i9dQZF1EP6YuccBxUyC1",
                    "uri": "spotify:playlist:37i9dQZF1EP6YuccBxUyC1",
                    "name": "daylist",
                    "subtitle": "Daylist",
                    "owner_id": "spotify",
                    "kind": "core",
                },
                {
                    "id": "dw1",
                    "uri": "spotify:playlist:dw1",
                    "name": "Discover Weekly",
                    "owner_id": "spotify",
                    "kind": "core",
                },
                {
                    "id": "rr1",
                    "uri": "spotify:playlist:rr1",
                    "name": "Release Radar",
                    "owner_id": "spotify",
                    "kind": "core",
                },
            ],
        }
        extra = [
            {
                "id": "dm1",
                "uri": "spotify:playlist:dm1",
                "name": "Daily Mix 1",
                "owner_id": "spotify",
                "kind": "core",
            },
            {
                "id": "or1",
                "uri": "spotify:playlist:or1",
                "name": "On Repeat",
                "owner_id": "spotify",
                "kind": "core",
            },
        ]
        with patch.object(rpc_library, "cdp_fetch_discovery_mixes", return_value=cdp_mixes), \
             patch.object(rpc_library, "_spotify_api_request", return_value={"items": [], "total": 0}), \
             patch.object(rpc_library, "load_discovery_mixes_cache", return_value={}), \
             patch.object(rpc_library, "save_discovery_mixes_cache"), \
             patch.object(rpc_library, "cdp_get_playlist_tracks", return_value={"ok": False}), \
             patch.object(rpc_library, "_search_missing_core_mixes", new=AsyncMock(return_value=extra)) as mock_search:
            res = await rpc_library._fetch_made_for_you_section("tok", self.plugin)

        mock_search.assert_awaited_once()
        names = [m["name"] for m in res["made_for_you"]]
        self.assertIn("Daily Mix 1", names)
        self.assertIn("On Repeat", names)


class TestAiDjPollAndStatus(unittest.IsolatedAsyncioTestCase):
    async def test_poll_playback_ai_dj_interlude_and_get_status(self):
        import test_token_refresh
        main_mod = test_token_refresh.main

        plugin = main_mod.Plugin()
        plugin._settings = dict(common.DEFAULT_SETTINGS)
        plugin._access_token = "tok"
        plugin._ensure_token = AsyncMock(return_value="tok")
        plugin._is_engine_running = MagicMock(return_value=True)
        plugin._is_librespot_running = MagicMock(return_value=False)
        plugin._is_spotify_client_running = MagicMock(return_value=True)
        plugin._last_event = None
        plugin._track_meta = None

        interlude_payload = {
            "is_playing": True,
            "currently_playing_type": "unknown",
            "item": None,
            "context": {"uri": "spotify:playlist:37i9dQZF1EYkqdzj48dyYq"},
        }
        with patch.object(main_mod, "_spotify_api_request", return_value=interlude_payload), \
             patch.object(main_mod.decky, "emit", new=AsyncMock()):
            ok = await plugin._poll_playback()

        self.assertTrue(ok)
        self.assertTrue(plugin._ai_dj_active)
        self.assertTrue(plugin._ai_dj_speaking)
        self.assertEqual(plugin._poll_play_state, "playing")

        status = await plugin.get_status()
        self.assertTrue(status["ai_dj_active"])
        self.assertTrue(status["ai_dj_speaking"])

        # Also test CDP PlayerAPI.getState fallback when Web API context is absent
        plugin._ai_dj_active = False
        plugin._ai_dj_speaking = False
        unknown_payload = {
            "is_playing": True,
            "currently_playing_type": "unknown",
            "item": None,
            "context": None,
        }
        cdp_state = {
            "ok": True,
            "is_playing": True,
            "context_uri": "spotify:dj:session1",
            "track_uri": "",
            "track_name": "",
            "media_type": "unknown",
            "is_dj_interlude": True,
        }
        with patch.object(main_mod, "_spotify_api_request", return_value=unknown_payload), \
             patch.object(main_mod, "_cdp_get_player_state", return_value=cdp_state), \
             patch.object(main_mod.decky, "emit", new=AsyncMock()):
            ok2 = await plugin._poll_playback()

        self.assertTrue(ok2)
        self.assertTrue(plugin._ai_dj_active)
        self.assertTrue(plugin._ai_dj_speaking)
        self.assertEqual(plugin._context_uri, "spotify:dj:session1")

    async def test_poll_playback_emits_dj_x_interlude_metadata_when_context_already_dj(self):
        import test_token_refresh
        main_mod = test_token_refresh.main

        plugin = main_mod.Plugin()
        plugin._settings = dict(common.DEFAULT_SETTINGS)
        plugin._access_token = "tok"
        plugin._ensure_token = AsyncMock(return_value="tok")
        plugin._is_engine_running = MagicMock(return_value=True)
        plugin._is_librespot_running = MagicMock(return_value=False)
        plugin._is_spotify_client_running = MagicMock(return_value=True)
        plugin._last_event = None
        plugin._track_meta = {"name": "Old Song", "artist": "Old Artist", "track_id": "old1"}

        interlude_payload = {
            "is_playing": True,
            "currently_playing_type": "unknown",
            "item": None,
            "context": {"uri": "spotify:playlist:37i9dQZF1EYkqdzj48dyYq"},
        }
        cdp_state = {
            "ok": True,
            "is_playing": True,
            "context_uri": "spotify:playlist:37i9dQZF1EYkqdzj48dyYq",
            "track_uri": "spotify:track:dj_intro_1",
            "track_name": "",
            "media_type": "unknown",
            "is_dj_interlude": True,
            "image_url": "https://i.scdn.co/image/djx_art",
            "title": "Welcome",
            "subtitle": "Up next: Indie Mix",
        }
        emit_mock = AsyncMock()
        with patch.object(main_mod, "_spotify_api_request", return_value=interlude_payload), \
             patch.object(main_mod, "_cdp_get_player_state", return_value=cdp_state) as mock_cdp, \
             patch.object(main_mod.decky, "emit", new=emit_mock):
            ok = await plugin._poll_playback()

        self.assertTrue(ok)
        mock_cdp.assert_called_once()
        self.assertEqual(plugin._track_meta["name"], "Welcome")
        self.assertEqual(plugin._track_meta["artist"], "Up next: Indie Mix")
        self.assertEqual(plugin._track_meta["image_url"], "https://i.scdn.co/image/djx_art")
        self.assertEqual(plugin._track_meta["media_type"], "dj_interlude")
        emitted_events = [call.args[0] for call in emit_mock.call_args_list]
        self.assertIn("track_metadata", emitted_events)
        self.assertIn("librespot_event", emitted_events)
        meta_call = next(c for c in emit_mock.call_args_list if c.args[0] == "track_metadata")
        self.assertEqual(meta_call.args[1]["name"], "Welcome")
        self.assertEqual(meta_call.args[1]["image_url"], "https://i.scdn.co/image/djx_art")

    async def test_poll_playback_preserves_ai_dj_and_catches_later_interludes(self):
        import test_token_refresh
        main_mod = test_token_refresh.main

        plugin = main_mod.Plugin()
        plugin._settings = dict(common.DEFAULT_SETTINGS)
        plugin._access_token = "tok"
        plugin._ensure_token = AsyncMock(return_value="tok")
        plugin._is_engine_running = MagicMock(return_value=True)
        plugin._is_librespot_running = MagicMock(return_value=False)
        plugin._is_spotify_client_running = MagicMock(return_value=True)
        plugin._last_event = None
        plugin._track_meta = None
        plugin._ai_dj_active = True
        plugin._ai_dj_speaking = False
        plugin._poll_track_id = "track_prev"
        plugin._shuffle_state = False
        plugin._repeat_state = "off"

        # 1) Normal track during AI DJ where Web API omits context (context: None)
        normal_track_payload = {
            "is_playing": True,
            "currently_playing_type": "track",
            "progress_ms": 12000,
            "context": None,
            "item": {
                "id": "track_prev",
                "name": "Normal Song",
                "duration_ms": 180000,
                "uri": "spotify:track:track_prev",
                "type": "track",
                "artists": [{"name": "Artist"}],
                "album": {"name": "Album", "images": []},
            },
        }
        cdp_normal = {
            "ok": True,
            "is_playing": True,
            "context_uri": "",
            "track_uri": "spotify:track:track_prev",
            "track_name": "Normal Song",
            "media_type": "track",
            "is_dj_interlude": False,
            "duration_ms": 180000,
            "position_ms": 12000,
        }
        with patch.object(main_mod, "_spotify_api_request", return_value=normal_track_payload), \
             patch.object(main_mod, "_cdp_get_player_state", return_value=cdp_normal), \
             patch.object(main_mod.decky, "emit", new=AsyncMock()):
            ok1 = await plugin._poll_playback()

        self.assertTrue(ok1)
        self.assertTrue(plugin._ai_dj_active)
        self.assertFalse(plugin._ai_dj_speaking)

        # 2) Later AI DJ interlude where Web API still returns stale previous item
        cdp_later_interlude = {
            "ok": True,
            "is_playing": True,
            "context_uri": "spotify:playlist:37i9dQZF1EYkqdzj48dyYq",
            "track_uri": "spotify:narration:up_next_2",
            "track_name": "DJ X",
            "media_type": "track",
            "is_dj_interlude": True,
            "duration_ms": 22000,
            "position_ms": 6500,
            "image_url": "https://i.scdn.co/image/djx2",
            "title": "Up next: Night Drive",
            "subtitle": "DJ X",
        }
        emit_mock = AsyncMock()
        with patch.object(main_mod, "_spotify_api_request", return_value=normal_track_payload), \
             patch.object(main_mod, "_cdp_get_player_state", return_value=cdp_later_interlude), \
             patch.object(main_mod.decky, "emit", new=emit_mock):
            ok2 = await plugin._poll_playback()

        self.assertTrue(ok2)
        self.assertTrue(plugin._ai_dj_active)
        self.assertTrue(plugin._ai_dj_speaking)
        self.assertEqual(plugin._poll_duration_ms, 22000)
        self.assertEqual(plugin._poll_progress_ms, 6500)
        self.assertEqual(plugin._track_meta["duration_ms"], 22000)
        self.assertEqual(plugin._track_meta["name"], "Up next: Night Drive")

        playing_events = [
            c.args[1] for c in emit_mock.call_args_list
            if c.args[0] == "librespot_event" and c.args[1].get("event") == "playing"
        ]
        self.assertEqual(len(playing_events), 1)
        self.assertEqual(playing_events[0]["position_ms"], 6500)
        self.assertEqual(playing_events[0]["duration_ms"], 22000)

    async def test_poll_playback_clears_dj_x_and_emits_ai_dj_state_when_track_starts(self):
        import test_token_refresh
        main_mod = test_token_refresh.main

        plugin = main_mod.Plugin()
        plugin._settings = dict(common.DEFAULT_SETTINGS)
        plugin._access_token = "tok"
        plugin._ensure_token = AsyncMock(return_value="tok")
        plugin._is_engine_running = MagicMock(return_value=True)
        plugin._is_librespot_running = MagicMock(return_value=False)
        plugin._is_spotify_client_running = MagicMock(return_value=True)
        plugin._last_event = None
        plugin._track_meta = None
        plugin._ai_dj_active = False
        plugin._ai_dj_speaking = False
        plugin._poll_track_id = None
        plugin._shuffle_state = False
        plugin._repeat_state = "off"

        # 1) DJ X interlude active
        interlude_payload = {
            "is_playing": True,
            "currently_playing_type": "unknown",
            "progress_ms": 0,
            "context": {"uri": "spotify:playlist:37i9dQZF1EYkqdzj48dyYq"},
            "item": None,
        }
        cdp_interlude = {
            "ok": True,
            "is_playing": True,
            "context_uri": "spotify:playlist:37i9dQZF1EYkqdzj48dyYq",
            "track_uri": "spotify:narration:seg_1",
            "track_name": "DJ X",
            "media_type": "unknown",
            "is_dj_interlude": True,
            "duration_ms": 19000,
            "position_ms": 2500,
            "image_url": "https://i.scdn.co/image/djx",
            "title": "DJ X",
            "subtitle": "Up next: Electric Feel",
        }
        with patch.object(main_mod, "_spotify_api_request", return_value=interlude_payload), \
             patch.object(main_mod, "_cdp_get_player_state", return_value=cdp_interlude), \
             patch.object(main_mod.decky, "emit", new=AsyncMock()):
            ok1 = await plugin._poll_playback()

        self.assertTrue(ok1)
        self.assertTrue(plugin._ai_dj_active)
        self.assertTrue(plugin._ai_dj_speaking)
        self.assertEqual(plugin._poll_track_id, "spotify:narration:seg_1")

        # 2) Real music track starts on /me/player
        music_payload = {
            "is_playing": True,
            "currently_playing_type": "track",
            "progress_ms": 1500,
            "context": {"uri": "spotify:playlist:37i9dQZF1EYkqdzj48dyYq"},
            "item": {
                "id": "track_music_1",
                "name": "Electric Feel",
                "duration_ms": 229000,
                "uri": "spotify:track:track_music_1",
                "type": "track",
                "artists": [{"name": "MGMT"}],
                "album": {"name": "Oracular Spectacular", "images": []},
            },
        }
        emit_mock = AsyncMock()
        with patch.object(main_mod, "_spotify_api_request", return_value=music_payload), \
             patch.object(main_mod, "_cdp_get_player_state", side_effect=AssertionError("should not query CDP for valid track with ctx")), \
             patch.object(main_mod.decky, "emit", new=emit_mock):
            ok2 = await plugin._poll_playback()

        self.assertTrue(ok2)
        self.assertTrue(plugin._ai_dj_active)
        self.assertFalse(plugin._ai_dj_speaking)
        self.assertEqual(plugin._poll_track_id, "track_music_1")

        dj_events = [c.args[1] for c in emit_mock.call_args_list if c.args[0] == "ai_dj_state"]
        self.assertTrue(any(ev.get("ai_dj_speaking") is False for ev in dj_events))
        meta_events = [c.args[1] for c in emit_mock.call_args_list if c.args[0] == "track_metadata"]
        self.assertTrue(any(ev.get("track_id") == "track_music_1" and ev.get("name") == "Electric Feel" for ev in meta_events))


class TestGapClosureDiscoveryAndPlayback(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.plugin = SimpleNamespace(
            _settings={"audio_backend": "librespot"},
            _spotify_client_process=None,
            _liked_cache={},
            _ensure_token=AsyncMock(return_value="tok-1"),
            _annotate_tracks_liked=AsyncMock(),
            _auto_transfer_and_play=AsyncMock(return_value={"ok": False}),
            _is_engine_running=MagicMock(return_value=True),
            _optimistic_queue_ts=0,
            _optimistic_queue=None,
            _context_uri="",
        )

    async def test_librespot_cached_subtitle_and_uris_beat_web_mixes(self):
        cached = {
            "mixes": [
                {
                    "id": "37i9dQZF1EP6YuccBxUcC1",
                    "uri": "spotify:playlist:37i9dQZF1EP6YuccBxUcC1",
                    "name": "daylist",
                    "subtitle": "synthwave tuesday morning",
                    "owner": "Spotify",
                    "kind": "core",
                    "tracks": [{"id": "t1", "uri": "spotify:track:t1", "name": "Song 1"}],
                    "uris": ["spotify:track:t1"],
                }
            ]
        }
        web_playlists = {
            "items": [
                {
                    "id": "37i9dQZF1EP6YuccBxUcC1",
                    "uri": "spotify:playlist:37i9dQZF1EP6YuccBxUcC1",
                    "name": "daylist",
                    "description": "synthwave tuesday morning",
                    "owner": {"id": "spotify"},
                    "images": [],
                    "tracks": {"total": 50},
                }
            ],
            "total": 1,
        }
        with patch.object(rpc_library, "load_discovery_mixes_cache", return_value=cached), \
             patch.object(rpc_library, "_spotify_api_request", return_value=web_playlists):
            res = await rpc_library._fetch_made_for_you_section("tok-1", self.plugin)

        self.assertFalse(res["fallback"])
        self.assertEqual(len(res["made_for_you"]), 1)
        daylist = res["made_for_you"][0]
        self.assertTrue(daylist["subtitle"].endswith(" · Cached"))
        self.assertEqual(daylist["uris"], ["spotify:track:t1"])

    async def test_get_playlist_tracks_web_api_200_upserts_daylist_cache(self):
        saved_payloads = []
        web_playlist = {
            "name": "daylist",
            "description": "<b>dream pop</b> afternoon",
            "tracks": {
                "total": 1,
                "items": [
                    {
                        "track": {
                            "id": "t99",
                            "name": "Dream Track",
                            "uri": "spotify:track:t99",
                            "duration_ms": 200000,
                            "artists": [{"id": "a1", "name": "Artist"}],
                            "album": {"id": "alb1", "name": "Album", "images": []},
                        }
                    }
                ],
            },
        }
        with patch.object(rpc_library, "_spotify_api_request", return_value=web_playlist), \
             patch.object(rpc_library, "load_discovery_mixes_cache", return_value={"mixes": []}), \
             patch.object(rpc_library, "save_discovery_mixes_cache", side_effect=lambda p: saved_payloads.append(p)):
            res = await rpc_library.get_playlist_tracks(self.plugin, "37i9dQZF1EP6YuccBxUcC1", offset=0, fetch_all=False)

        self.assertTrue(res["ok"], res)
        self.assertEqual(len(saved_payloads), 1)
        mixes = saved_payloads[0]["mixes"]
        self.assertEqual(mixes[0]["id"], "37i9dQZF1EP6YuccBxUcC1")
        self.assertEqual(mixes[0]["uris"], ["spotify:track:t99"])
        self.assertEqual(mixes[0]["subtitle"], "dream pop afternoon")

    async def test_play_tracks_daylist_403_falls_back_to_live_get_playlist_tracks_uris(self):
        from py_modules import rpc_library as mod_rpc_library, rpc_playback

        calls = []

        def fake_api(endpoint, token, method="GET", params=None, body=None):
            calls.append((endpoint, method, body))
            if endpoint == "me/player/play" and body and "context_uri" in body:
                raise _http_error(403)
            return {}

        live_tracks = {"ok": True, "tracks": [{"uri": "spotify:track:dl1"}, {"uri": "spotify:track:dl2"}]}
        with patch.object(rpc_playback, "_resolve_cached_mix_uris", return_value=[]), \
             patch.object(rpc_playback, "_spotify_api_request", side_effect=fake_api), \
             patch.object(mod_rpc_library, "get_playlist_tracks", new=AsyncMock(return_value=live_tracks)) as mock_gpt:
            res = await rpc_playback.play_tracks(
                self.plugin,
                context_uri="spotify:playlist:37i9dQZF1EP6YuccBxUcC1",
            )

        self.assertTrue(res["ok"], res)
        mock_gpt.assert_awaited_once_with(self.plugin, "37i9dQZF1EP6YuccBxUcC1", offset=0, fetch_all=False)
        self.assertEqual(calls[-1][2]["uris"], ["spotify:track:dl1", "spotify:track:dl2"])

    async def test_get_search_browse_categories_falls_back_to_web_api(self):
        self.plugin._settings["audio_backend"] = "spotify_client"
        self.plugin._spotify_client_process = SimpleNamespace(poll=lambda: None)
        web_cats = {
            "categories": {
                "items": [
                    {
                        "id": "gaming",
                        "name": "Gaming",
                        "icons": [{"url": "https://i.scdn.co/image/gaming"}],
                    }
                ]
            }
        }
        with patch.object(rpc_library, "cdp_fetch_browse_categories", return_value=[]), \
             patch.object(rpc_library, "_spotify_api_request", return_value=web_cats) as mock_api:
            res = await rpc_library.get_search_browse_categories(self.plugin)

        self.assertTrue(res["ok"], res)
        mock_api.assert_called_once()
        self.assertEqual(len(res["categories"]), 1)
        self.assertEqual(res["categories"][0]["id"], "gaming")
        self.assertEqual(res["categories"][0]["uri"], "spotify:genre:gaming")
