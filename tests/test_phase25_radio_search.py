import urllib.error
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

try:
    from test_token_refresh import main as main_mod
except ImportError:
    from tests.test_token_refresh import main as main_mod

from py_modules import common, rpc_library, rpc_playback


def make_plugin(audio_backend: str = "spotify_client"):
    settings = dict(common.DEFAULT_SETTINGS)
    settings["audio_backend"] = audio_backend
    return SimpleNamespace(
        _settings=settings,
        _ensure_token=AsyncMock(return_value="tok"),
        _annotate_tracks_liked=AsyncMock(),
    )


class TestStartRadioWaterfall(unittest.IsolatedAsyncioTestCase):
    async def test_tier1_cdp_stub_returns_empty_list(self):
        plugin = make_plugin("spotify_client")
        res = await rpc_playback._try_cdp_station_radio(plugin, "track", "trk-1", "spotify:track:trk-1")
        self.assertEqual(res, [])

    async def test_song_radio_tier2_places_seed_at_index_0_and_caps_at_30(self):
        for backend in ("spotify_client", "librespot"):
            plugin = make_plugin(backend)
            rec_tracks = [{"uri": f"spotify:track:rec-{i}"} for i in range(35)]
            # Include duplicate of seed and another duplicate
            rec_tracks[0] = {"uri": "spotify:track:seed-1"}
            rec_tracks[2] = {"uri": "spotify:track:rec-1"}

            async def fake_exec(fn, endpoint, token, method="GET", params=None, body=None):
                if endpoint == "recommendations":
                    self.assertEqual(params["seed_tracks"], "seed-1")
                    return {"tracks": rec_tracks}
                raise AssertionError(f"Unexpected endpoint: {endpoint}")

            with patch.object(rpc_playback, "_exec", side_effect=fake_exec), \
                 patch.object(rpc_playback, "play_tracks", new_callable=AsyncMock, return_value={"ok": True}) as mock_play:
                res = await rpc_playback.start_radio(
                    plugin,
                    seed_type="track",
                    seed_id="seed-1",
                    seed_uri="spotify:track:seed-1",
                    seed_name="Seed Song",
                    artist_name="Seed Artist",
                )

            self.assertTrue(res.get("ok"), msg=res)
            self.assertEqual(res.get("tier"), "recommendations")
            self.assertEqual(res.get("count"), 30)
            mock_play.assert_awaited_once()
            called_uris = mock_play.call_args.kwargs["uris"]
            self.assertEqual(called_uris[0], "spotify:track:seed-1")
            self.assertEqual(len(called_uris), 30)
            self.assertEqual(len(set(called_uris)), 30)

    async def test_artist_radio_tier2_403_falls_back_silently_to_tier3(self):
        plugin = make_plugin("librespot")
        seen_endpoints = []

        async def fake_exec(fn, endpoint, token, method="GET", params=None, body=None):
            seen_endpoints.append(endpoint)
            if endpoint == "recommendations":
                raise urllib.error.HTTPError("https://api.spotify.com", 403, "Forbidden", {}, None)
            if endpoint == "artists/art-1/top-tracks":
                return {"tracks": [{"uri": "spotify:track:top-1"}, {"uri": "spotify:track:top-2"}]}
            if endpoint == "artists/art-1":
                return {"id": "art-1", "name": "Synth Artist", "genres": []}
            if endpoint == "search":
                if (params or {}).get("type") == "playlist":
                    return {"playlists": {"items": []}}
                self.assertEqual(params["limit"], 10)
                if not str((params or {}).get("q", "")).startswith("artist:"):
                    return {"tracks": {"items": []}}
                return {
                    "tracks": {
                        "items": [
                            {"uri": "spotify:track:top-2"},
                            {"uri": "spotify:track:s-1"},
                            {"uri": "spotify:track:s-2"},
                        ]
                    }
                }
            if endpoint == "artists/art-1/albums":
                return {"items": []}
            raise AssertionError(f"Unexpected endpoint: {endpoint}")

        with patch.object(rpc_playback, "_exec", side_effect=fake_exec), \
             patch.object(rpc_playback, "play_tracks", new_callable=AsyncMock, return_value={"ok": True}) as mock_play:
            res = await rpc_playback.start_radio(
                plugin,
                seed_type="artist",
                seed_id="art-1",
                artist_name="Synth Artist",
            )

        self.assertTrue(res.get("ok"))
        self.assertEqual(res.get("tier"), "synthesis")
        self.assertEqual(
            res.get("uris"),
            ["spotify:track:top-1", "spotify:track:top-2", "spotify:track:s-1", "spotify:track:s-2"],
        )
        self.assertIn("artists/art-1/top-tracks", seen_endpoints)
        self.assertIn("search", seen_endpoints)
        mock_play.assert_awaited_once()

    async def test_track_radio_tier3_top_tracks_403_uses_search_synthesis(self):
        plugin = make_plugin("spotify_client")

        async def fake_exec(fn, endpoint, token, method="GET", params=None, body=None):
            if endpoint == "recommendations":
                return {"tracks": []}
            if endpoint == "tracks/trk-9":
                return {"name": "Track Nine", "artists": [{"id": "art-9", "name": "Artist Nine"}]}
            if endpoint == "artists/art-9/top-tracks":
                raise urllib.error.HTTPError("https://api.spotify.com", 403, "Forbidden", {}, None)
            if endpoint == "search":
                self.assertEqual(params["q"], "artist:Artist Nine")
                self.assertEqual(params["limit"], 10)
                return {"tracks": {"items": [{"uri": "spotify:track:synth-1"}, {"uri": "spotify:track:synth-2"}]}}
            if endpoint == "artists/art-9/albums":
                return {"items": []}
            raise AssertionError(f"Unexpected endpoint: {endpoint}")

        with patch.object(rpc_playback, "_exec", side_effect=fake_exec), \
             patch.object(rpc_playback, "play_tracks", new_callable=AsyncMock, return_value={"ok": True}) as mock_play:
            res = await rpc_playback.start_radio(
                plugin,
                seed_type="track",
                seed_id="spotify:track:trk-9",
            )

        self.assertTrue(res.get("ok"))
        self.assertEqual(res.get("tier"), "synthesis")
        called_uris = mock_play.call_args.kwargs["uris"]
        self.assertEqual(called_uris, ["spotify:track:trk-9", "spotify:track:synth-1", "spotify:track:synth-2"])

    async def test_album_radio_uses_album_tracks_and_falls_back(self):
        plugin = make_plugin("spotify_client")

        async def fake_exec(fn, endpoint, token, method="GET", params=None, body=None):
            if endpoint == "albums/alb-1/tracks":
                return {
                    "items": [
                        {"id": "t1", "uri": "spotify:track:t1", "artists": [{"id": "art-a", "name": "Art A"}]},
                    ]
                }
            if endpoint == "recommendations":
                raise urllib.error.HTTPError("https://api.spotify.com", 404, "Not Found", {}, None)
            if endpoint == "artists/art-a/top-tracks":
                return {"tracks": [{"uri": "spotify:track:t2"}]}
            if endpoint == "search":
                return {"tracks": {"items": []}}
            if endpoint == "artists/art-a/albums":
                return {"items": []}
            raise AssertionError(f"Unexpected endpoint: {endpoint}")

        with patch.object(rpc_playback, "_exec", side_effect=fake_exec), \
             patch.object(rpc_playback, "play_tracks", new_callable=AsyncMock, return_value={"ok": True}) as mock_play:
            res = await rpc_playback.start_radio(plugin, seed_type="album", seed_id="alb-1")

        self.assertTrue(res.get("ok"))
        self.assertEqual(mock_play.call_args.kwargs["uris"], ["spotify:track:t2", "spotify:track:t1"])

    async def test_start_radio_total_failure_returns_error_without_playing(self):
        plugin = make_plugin("spotify_client")

        async def fake_exec(fn, endpoint, token, method="GET", params=None, body=None):
            raise urllib.error.HTTPError("https://api.spotify.com", 403, "Forbidden", {}, None)

        with patch.object(rpc_playback, "_exec", side_effect=fake_exec), \
             patch.object(rpc_playback, "play_tracks", new_callable=AsyncMock) as mock_play:
            res = await rpc_playback.start_radio(
                plugin,
                seed_type="track",
                seed_id="trk-fail",
                seed_uri="spotify:track:trk-fail",
            )

        self.assertFalse(res.get("ok"))
        self.assertIn("Could not start radio", res.get("error", ""))
        mock_play.assert_not_awaited()

    async def test_plugin_start_radio_delegates_to_rpc_playback(self):
        plugin = main_mod.Plugin()
        with patch.object(main_mod.rpc_playback, "start_radio", new_callable=AsyncMock, return_value={"ok": True, "count": 5}) as mock_sr:
            res = await plugin.start_radio("track", "t1", "spotify:track:t1", "Song", "Artist")
        self.assertEqual(res, {"ok": True, "count": 5})
        mock_sr.assert_awaited_once_with(plugin, "track", "t1", "spotify:track:t1", "Song", "Artist")

    async def test_artist_radio_falls_back_to_artist_albums_when_top_tracks_and_search_fail(self):
        plugin = make_plugin("librespot")
        seen_calls = []

        async def fake_exec(fn, endpoint, token, method="GET", params=None, body=None):
            seen_calls.append((endpoint, params))
            if endpoint == "recommendations":
                raise urllib.error.HTTPError("https://api.spotify.com", 403, "Forbidden", {}, None)
            if endpoint == "artists/art-fb/top-tracks":
                raise urllib.error.HTTPError("https://api.spotify.com", 403, "Forbidden", {}, None)
            if endpoint == "search":
                raise urllib.error.HTTPError("https://api.spotify.com", 403, "Forbidden", {}, None)
            if endpoint == "artists/art-fb/albums":
                self.assertEqual(params, {"limit": 1, "include_groups": "album,single"})
                return {"items": [{"id": "alb-fb-1"}]}
            if endpoint == "albums/alb-fb-1/tracks":
                self.assertEqual(params, {"limit": 10})
                return {"items": [{"uri": "spotify:track:fb-1"}, {"uri": "spotify:track:fb-2"}]}
            raise AssertionError(f"Unexpected endpoint: {endpoint}")

        with patch.object(rpc_playback, "_exec", side_effect=fake_exec), \
             patch.object(rpc_playback, "play_tracks", new_callable=AsyncMock, return_value={"ok": True}) as mock_play, \
             patch.object(rpc_playback.decky.logger, "warning") as mock_warn:
            res = await rpc_playback.start_radio(
                plugin,
                seed_type="artist",
                seed_id="art-fb",
                artist_name="Fallback Artist",
            )

        self.assertTrue(res.get("ok"), msg=res)
        self.assertEqual(res.get("tier"), "synthesis")
        self.assertEqual(res.get("uris"), ["spotify:track:fb-1", "spotify:track:fb-2"])
        mock_play.assert_awaited_once_with(plugin, uris=["spotify:track:fb-1", "spotify:track:fb-2"])
        self.assertGreaterEqual(mock_warn.call_count, 3)

    async def test_tier3_playlist_radio_yields_multi_artist_mix(self):
        plugin = make_plugin("librespot")
        seen_endpoints = []

        async def fake_exec(fn, endpoint, token, method="GET", params=None, body=None):
            seen_endpoints.append((endpoint, params))
            if endpoint == "recommendations":
                raise urllib.error.HTTPError("https://api.spotify.com", 403, "Forbidden", {}, None)
            if endpoint == "artists/art-seed/top-tracks":
                raise urllib.error.HTTPError("https://api.spotify.com", 404, "Not Found", {}, None)
            if endpoint == "search" and (params or {}).get("type") == "playlist":
                self.assertEqual(params.get("limit"), 5)
                return {
                    "playlists": {
                        "items": [
                            {"id": "pl-other", "name": "Random Hits"},
                            {"id": "pl-radio", "name": "Seed Artist Radio"},
                        ]
                    }
                }
            if endpoint == "playlists/pl-radio/tracks":
                self.assertEqual((params or {}).get("limit"), 10)
                items = []
                for i in range(6):
                    art = f"art-{i % 3}"
                    items.append({
                        "track": {
                            "uri": f"spotify:track:pl-{i}",
                            "artists": [{"id": art, "name": f"Artist {i % 3}"}],
                        }
                    })
                return {"total": 6, "items": items}
            if endpoint == "search" and (params or {}).get("type") == "track":
                q = (params or {}).get("q", "")
                if q.startswith("artist:"):
                    return {
                        "tracks": {
                            "items": [
                                {"uri": "spotify:track:seed-a", "artists": [{"id": "art-seed", "name": "Seed Artist"}]},
                                {"uri": "spotify:track:seed-b", "artists": [{"id": "art-seed", "name": "Seed Artist"}]},
                            ]
                        }
                    }
                return {"tracks": {"items": []}}
            if endpoint == "artists/art-seed":
                return {"id": "art-seed", "name": "Seed Artist", "genres": []}
            if endpoint == "artists/art-seed/albums":
                return {"items": []}
            raise AssertionError(f"Unexpected endpoint: {endpoint} {params}")

        with patch.object(rpc_playback, "_exec", side_effect=fake_exec), \
             patch.object(rpc_playback, "play_tracks", new_callable=AsyncMock, return_value={"ok": True}) as mock_play:
            res = await rpc_playback.start_radio(
                plugin,
                seed_type="artist",
                seed_id="art-seed",
                artist_name="Seed Artist",
            )

        self.assertTrue(res.get("ok"), msg=res)
        self.assertEqual(res.get("tier"), "synthesis")
        uris = mock_play.call_args.kwargs["uris"]
        self.assertIn("spotify:track:pl-0", uris)
        self.assertIn("spotify:track:seed-a", uris)
        # Interleaved: 2 other-artist tracks before first seed-artist track
        self.assertEqual(uris[:3], ["spotify:track:pl-0", "spotify:track:pl-1", "spotify:track:seed-a"])
        self.assertTrue(any(ep == "playlists/pl-radio/tracks" for ep, _ in seen_endpoints))

    async def test_tier3_broad_and_genre_search_interleaves_and_caps_artist_dominance(self):
        plugin = make_plugin("spotify_client")

        async def fake_exec(fn, endpoint, token, method="GET", params=None, body=None):
            if endpoint == "recommendations":
                raise urllib.error.HTTPError("https://api.spotify.com", 403, "Forbidden", {}, None)
            if endpoint == "tracks/trk-seed":
                return {"name": "Midnight Run", "artists": [{"id": "art-seed", "name": "Seed Artist"}]}
            if endpoint == "artists/art-seed/top-tracks":
                raise urllib.error.HTTPError("https://api.spotify.com", 403, "Forbidden", {}, None)
            if endpoint == "search" and (params or {}).get("type") == "playlist":
                return {"playlists": {"items": []}}
            if endpoint == "search" and (params or {}).get("type") == "track":
                q = (params or {}).get("q", "")
                if q == "Midnight Run Seed Artist":
                    # 6 tracks from dominant-art, plus 2 from art-2
                    items = [
                        {"uri": f"spotify:track:dom-{i}", "artists": [{"id": "dom-art", "name": "Dominant"}]}
                        for i in range(6)
                    ] + [
                        {"uri": "spotify:track:other-1", "artists": [{"id": "art-2", "name": "Other Two"}]},
                        {"uri": "spotify:track:other-2", "artists": [{"id": "art-2", "name": "Other Two"}]},
                    ]
                    return {"tracks": {"items": items}}
                if q == "genre:synthwave":
                    return {
                        "tracks": {
                            "items": [
                                {"uri": f"spotify:track:gen-{i}", "artists": [{"id": f"gen-art-{i}", "name": f"Gen {i}"}]}
                                for i in range(8)
                            ]
                        }
                    }
                if q == "artist:Seed Artist":
                    return {
                        "tracks": {
                            "items": [
                                {"uri": "spotify:track:seed-1", "artists": [{"id": "art-seed", "name": "Seed Artist"}]},
                                {"uri": "spotify:track:seed-2", "artists": [{"id": "art-seed", "name": "Seed Artist"}]},
                            ]
                        }
                    }
            if endpoint == "artists/art-seed":
                return {"id": "art-seed", "name": "Seed Artist", "genres": ["synthwave", "electronic"]}
            if endpoint == "artists/art-seed/albums":
                return {"items": []}
            raise AssertionError(f"Unexpected endpoint: {endpoint} {params}")

        with patch.object(rpc_playback, "_exec", side_effect=fake_exec), \
             patch.object(rpc_playback, "play_tracks", new_callable=AsyncMock, return_value={"ok": True}) as mock_play:
            res = await rpc_playback.start_radio(
                plugin,
                seed_type="track",
                seed_id="trk-seed",
                seed_uri="spotify:track:trk-seed",
            )

        self.assertTrue(res.get("ok"), msg=res)
        uris = mock_play.call_args.kwargs["uris"]
        self.assertEqual(uris[0], "spotify:track:trk-seed")
        # Dominant non-seed artist capped at 4 tracks when >=15 total tracks are available
        dom_count = sum(1 for u in uris if u.startswith("spotify:track:dom-"))
        self.assertLessEqual(dom_count, 4)
        self.assertTrue(any(u.startswith("spotify:track:gen-") for u in uris))
        self.assertIn("spotify:track:seed-1", uris)


class TestArtistDiscographyPagination(unittest.IsolatedAsyncioTestCase):
    async def test_get_artist_all_tracks_paginates_and_annotates(self):
        plugin = make_plugin("spotify_client")

        async def fake_exec(fn, endpoint, token, method="GET", params=None, body=None):
            if endpoint == "artists/art-1/albums":
                self.assertEqual(params["limit"], 3)
                self.assertEqual(params["offset"], 0)
                self.assertEqual(params["include_groups"], "album,single")
                return {
                    "total": 5,
                    "items": [
                        {
                            "id": "alb-1",
                            "name": "Album One",
                            "images": [{"url": "https://i.scdn.co/image/alb1"}],
                        },
                        {
                            "id": "alb-2",
                            "name": "Album Two",
                            "images": [{"url": "https://i.scdn.co/image/alb2"}],
                        },
                        {
                            "id": "alb-3",
                            "name": "Album Three",
                            "images": [{"url": "https://i.scdn.co/image/alb3"}],
                        },
                    ],
                }
            if endpoint.startswith("albums/") and endpoint.endswith("/tracks"):
                alb_id = endpoint.split("/")[1]
                return {
                    "items": [
                        None,
                        {
                            "id": f"trk-{alb_id}",
                            "name": f"Track from {alb_id}",
                            "artists": [{"id": "art-1", "name": "Synth Artist"}],
                            "uri": f"spotify:track:{alb_id}",
                            "duration_ms": 180000,
                        },
                    ]
                }
            raise AssertionError(f"Unexpected endpoint: {endpoint}")

        with patch.object(rpc_library, "_exec", side_effect=fake_exec), \
             patch.object(rpc_library, "_image_url", side_effect=lambda imgs: f"proxy:{imgs[0]['url']}" if imgs else None):
            res = await rpc_library.get_artist_all_tracks(plugin, "art-1", album_offset=0, album_limit=3)

        self.assertTrue(res.get("ok"), msg=res)
        self.assertTrue(res.get("has_more"))
        self.assertEqual(res.get("next_album_offset"), 3)
        self.assertEqual(res.get("total_albums"), 5)
        tracks = res.get("tracks") or []
        self.assertEqual(len(tracks), 3)
        self.assertEqual(tracks[0]["album"], "Album One")
        self.assertEqual(tracks[0]["album_id"], "alb-1")
        self.assertEqual(tracks[0]["image_url"], "proxy:https://i.scdn.co/image/alb1")
        self.assertEqual(tracks[0]["artwork_url"], "proxy:https://i.scdn.co/image/alb1")
        plugin._annotate_tracks_liked.assert_awaited_once()

    async def test_get_artist_all_tracks_quotes_id_clamps_limit_and_validates(self):
        plugin = make_plugin("spotify_client")

        bad_res = await rpc_library.get_artist_all_tracks(plugin, "   ")
        self.assertFalse(bad_res.get("ok"))

        plugin_no_tok = make_plugin("spotify_client")
        plugin_no_tok._ensure_token = AsyncMock(return_value="")
        unauth_res = await rpc_library.get_artist_all_tracks(plugin_no_tok, "art-1")
        self.assertFalse(unauth_res.get("ok"))

        seen = []

        async def fake_exec(fn, endpoint, token, method="GET", params=None, body=None):
            seen.append((endpoint, params))
            return {"total": 0, "items": []}

        with patch.object(rpc_library, "_exec", side_effect=fake_exec):
            res = await rpc_library.get_artist_all_tracks(plugin, "art/1?x=2", album_offset=-5, album_limit=99)

        self.assertTrue(res.get("ok"))
        self.assertFalse(res.get("has_more"))
        self.assertEqual(seen[0][0], "artists/art%2F1%3Fx%3D2/albums")
        self.assertEqual(seen[0][1]["limit"], 5)
        self.assertEqual(seen[0][1]["offset"], 0)

    async def test_get_artist_info_returns_proxied_artist_and_delegates_on_plugin(self):
        plugin = make_plugin("spotify_client")

        async def fake_exec(fn, endpoint, token, method="GET", params=None, body=None):
            self.assertEqual(endpoint, "artists/art%201")
            return {
                "id": "art 1",
                "name": "Artist One",
                "uri": "spotify:artist:art 1",
                "images": [{"url": "https://i.scdn.co/image/art1"}],
            }

        with patch.object(rpc_library, "_exec", side_effect=fake_exec), \
             patch.object(rpc_library, "_image_url", return_value="data:image/jpeg;base64,ABC"):
            res = await rpc_library.get_artist_info(plugin, " art 1 ")

        self.assertTrue(res.get("ok"))
        self.assertEqual(res["artist"]["name"], "Artist One")
        self.assertEqual(res["artist"]["image_url"], "data:image/jpeg;base64,ABC")

        p = main_mod.Plugin()
        with patch.object(main_mod.rpc_library, "get_artist_info", new_callable=AsyncMock, return_value={"ok": True}) as m_info, \
             patch.object(main_mod.rpc_library, "get_artist_all_tracks", new_callable=AsyncMock, return_value={"ok": True}) as m_all:
            await p.get_artist_info("art-1")
            await p.get_artist_all_tracks("art-1", 3, 3)
        m_info.assert_awaited_once_with(p, "art-1")
        m_all.assert_awaited_once_with(p, "art-1", 3, 3)


class TestSearchHistoryAndPodcastSearch(unittest.IsolatedAsyncioTestCase):
    async def test_search_history_default_and_set_setting_validation(self):
        self.assertEqual(common.DEFAULT_SETTINGS["search_history"], [])

        p = main_mod.Plugin()
        p._settings = dict(common.DEFAULT_SETTINGS)

        bad_res = await p.set_setting("search_history", "not-a-list")
        self.assertFalse(bad_res.get("ok"))
        self.assertIn("list", bad_res.get("error", ""))

        raw = [
            "  lofi ",
            "",
            "   ",
            "synthwave",
            "lofi",
            "bad\x00query",
            123,
            "a" * 250,
            "q4",
            "q5",
            "q6",
            "q7",
            "q8",
            "q9",
            "q10",
            "q11",
            "q12",
        ]
        with patch.object(main_mod, "_save_settings"):
            res = await p.set_setting("search_history", raw)

        self.assertTrue(res.get("ok"), msg=res)
        saved = p._settings["search_history"]
        self.assertEqual(len(saved), 10)
        self.assertEqual(saved[0], "lofi")
        self.assertEqual(saved[1], "synthwave")
        self.assertEqual(saved[2], "a" * 200)
        self.assertEqual(saved[-1], "q10")

    async def test_get_status_exposes_search_history(self):
        p = main_mod.Plugin()
        p._settings = dict(common.DEFAULT_SETTINGS)
        p._settings["search_history"] = ["Daft Punk", "Synthwave"]

        status = await p.get_status()
        self.assertEqual(status["settings"].get("search_history"), ["Daft Punk", "Synthwave"])

    async def test_search_spotify_empty_query_returns_empty_arrays(self):
        plugin = make_plugin("spotify_client")
        res = await rpc_library.search_spotify(plugin, "   ")
        self.assertEqual(
            res,
            {
                "ok": True,
                "tracks": [],
                "artists": [],
                "albums": [],
                "playlists": [],
                "shows": [],
                "episodes": [],
            },
        )

    async def test_search_spotify_show_episode_no_market_limit_cap_and_null_guards(self):
        plugin = make_plugin("spotify_client")

        async def fake_exec(fn, endpoint, token, method="GET", params=None, body=None):
            self.assertEqual(endpoint, "search")
            self.assertNotIn("market", params)
            self.assertLessEqual(params["limit"], 10)
            self.assertEqual(params["limit"], 10)
            self.assertIn("show", params["type"])
            self.assertIn("episode", params["type"])
            return {
                "tracks": {"items": [None]},
                "artists": {"items": [None]},
                "albums": {"items": [None]},
                "playlists": {"items": [None]},
                "shows": {
                    "items": [
                        None,
                        {
                            "id": "show-1",
                            "name": "Deck Cast",
                            "publisher": "Valve Fans",
                            "images": [{"url": "https://i.scdn.co/image/show1"}],
                            "total_episodes": 42,
                            "uri": "spotify:show:show-1",
                        },
                    ]
                },
                "episodes": {
                    "items": [
                        None,
                        {
                            "id": "ep-1",
                            "name": "Episode One",
                            "show": {"name": "Deck Cast", "images": [{"url": "https://i.scdn.co/image/ep1"}]},
                            "uri": "spotify:episode:ep-1",
                            "duration_ms": 123000,
                            "release_date": "2026-01-15",
                            "resume_point": {"resume_position_ms": 45000, "fully_played": False},
                        },
                        {
                            "id": "ep-2",
                            "name": "Episode Two",
                            "show": {"name": "Deck Cast"},
                            "uri": "spotify:episode:ep-2",
                            "duration_ms": 60000,
                            "release_date": "2026-01-16",
                        },
                    ]
                },
            }

        with patch.object(rpc_library, "_exec", side_effect=fake_exec), \
             patch.object(rpc_library, "_image_url", side_effect=lambda imgs: f"proxy:{imgs[0]['url']}" if imgs else None):
            res = await rpc_library.search_spotify(
                plugin,
                "deck",
                types="track,artist,album,playlist,show,episode",
                limit=50,
            )

        self.assertTrue(res.get("ok"), msg=res)
        self.assertEqual(len(res["shows"]), 1)
        self.assertEqual(res["shows"][0]["id"], "show-1")
        self.assertEqual(res["shows"][0]["publisher"], "Valve Fans")
        self.assertEqual(res["shows"][0]["total_episodes"], 42)
        self.assertEqual(res["shows"][0]["image_url"], "proxy:https://i.scdn.co/image/show1")

        self.assertEqual(len(res["episodes"]), 2)
        self.assertEqual(res["episodes"][0]["show_name"], "Deck Cast")
        self.assertEqual(res["episodes"][0]["resume_position_ms"], 45000)
        self.assertFalse(res["episodes"][0]["fully_played"])
        self.assertEqual(res["episodes"][0]["image_url"], "proxy:https://i.scdn.co/image/ep1")
        self.assertEqual(res["episodes"][1]["resume_position_ms"], 0)
        self.assertFalse(res["episodes"][1]["fully_played"])


class TestPhase26CdpRadioAndCachedMixPlayback(unittest.IsolatedAsyncioTestCase):
    async def test_try_cdp_station_radio_fast_fails_without_calling_cdp_when_not_running(self):
        for backend in ("librespot", "spotify_client"):
            plugin = make_plugin(backend)
            with patch.object(rpc_playback, "is_spotify_client_running", return_value=False), \
                 patch.object(rpc_playback, "cdp_fetch_station_radio_uris") as mock_cdp:
                res = await rpc_playback._try_cdp_station_radio(
                    plugin, "track", "trk-1", "spotify:track:trk-1"
                )
            self.assertEqual(res, [])
            mock_cdp.assert_not_called()

    async def test_try_cdp_station_radio_resolves_up_to_30_uris_when_running(self):
        plugin = make_plugin("spotify_client")
        raw_uris = [f"spotify:track:cdp-{i}" for i in range(35)]
        raw_uris.insert(1, "spotify:track:cdp-0")  # duplicate
        raw_uris.insert(2, "spotify:episode:not-a-track")  # non-track filtered out

        with patch.object(rpc_playback, "is_spotify_client_running", return_value=True), \
             patch.object(rpc_playback, "cdp_fetch_station_radio_uris", return_value=raw_uris) as mock_cdp:
            res = await rpc_playback._try_cdp_station_radio(
                plugin, "artist", "art-1", "spotify:artist:art-1"
            )

        mock_cdp.assert_called_once_with("artist", "art-1", "spotify:artist:art-1")
        self.assertEqual(len(res), 30)
        self.assertEqual(res[0], "spotify:track:cdp-0")
        self.assertEqual(len(set(res)), 30)
        self.assertTrue(all(u.startswith("spotify:track:") for u in res))

    async def test_play_tracks_librespot_uses_cached_mix_uris_and_slices_offset(self):
        plugin = make_plugin("librespot")
        mix_uri = "spotify:playlist:37i9dQZF1EP06eD0402"
        cached_cache = {
            "version": 1,
            "mixes": [
                {
                    "id": "37i9dQZF1EP06eD0402",
                    "uri": mix_uri,
                    "uris": [
                        "spotify:track:m1",
                        "spotify:track:m2",
                        "spotify:track:m3",
                    ],
                }
            ],
        }
        captured_bodies = []

        def fake_exec(fn, endpoint, token, method="GET", params=None, body=None):
            captured_bodies.append((endpoint, method, body))
            return {}

        with patch.object(rpc_playback, "is_spotify_client_running", return_value=False), \
             patch.object(rpc_playback, "load_discovery_mixes_cache", return_value=cached_cache), \
             patch.object(rpc_playback, "_exec", side_effect=fake_exec):
            res = await rpc_playback.play_tracks(
                plugin,
                context_uri=mix_uri,
                offset_uri="spotify:track:m2",
            )

        self.assertTrue(res.get("ok"), msg=res)
        self.assertEqual(plugin._context_uri, mix_uri)
        self.assertEqual(len(captured_bodies), 1)
        endpoint, method, body = captured_bodies[0]
        self.assertEqual(endpoint, "me/player/play")
        self.assertEqual(method, "PUT")
        self.assertNotIn("context_uri", body)
        self.assertEqual(body["uris"], ["spotify:track:m2", "spotify:track:m3"])
        self.assertEqual(body["offset"], {"position": 0})

    async def test_play_tracks_spotify_client_403_falls_back_to_cached_mix_uris(self):
        plugin = make_plugin("spotify_client")
        mix_uri = "spotify:playlist:37i9dQZF1DXcBWIGoYBM5M"
        cached_cache = {
            "version": 1,
            "mixes": [
                {
                    "id": "37i9dQZF1DXcBWIGoYBM5M",
                    "uri": mix_uri,
                    "uris": ["spotify:track:t1", "spotify:track:t2"],
                }
            ],
        }
        captured_bodies = []

        def fake_exec(fn, endpoint, token, method="GET", params=None, body=None):
            captured_bodies.append(dict(body or {}))
            if len(captured_bodies) == 1:
                raise urllib.error.HTTPError("https://api.spotify.com", 403, "Forbidden", {}, None)
            return {}

        with patch.object(rpc_playback, "is_spotify_client_running", return_value=True), \
             patch.object(rpc_playback, "load_discovery_mixes_cache", return_value=cached_cache), \
             patch.object(rpc_playback, "_exec", side_effect=fake_exec):
            res = await rpc_playback.play_tracks(
                plugin,
                context_uri=mix_uri,
                position=1,
            )

        self.assertTrue(res.get("ok"), msg=res)
        self.assertEqual(len(captured_bodies), 2)
        self.assertIn("context_uri", captured_bodies[0])
        self.assertNotIn("context_uri", captured_bodies[1])
        self.assertEqual(captured_bodies[1]["uris"], ["spotify:track:t1", "spotify:track:t2"])
        self.assertEqual(captured_bodies[1]["offset"], {"position": 1})

    async def test_quick_play_pinned_plays_cached_mix_on_librespot(self):
        plugin = make_plugin("librespot")
        plugin._is_engine_running = lambda: True
        mix_uri = "spotify:playlist:37i9dQZF1E35pinned"
        cached_cache = {
            "version": 1,
            "mixes": [
                {
                    "id": "37i9dQZF1E35pinned",
                    "uri": mix_uri,
                    "uris": ["spotify:track:p1", "spotify:track:p2"],
                }
            ],
        }
        captured_bodies = []

        def fake_exec(fn, endpoint, token, method="GET", params=None, body=None):
            captured_bodies.append(dict(body or {}))
            return {}

        with patch.object(rpc_playback, "is_spotify_client_running", return_value=False), \
             patch.object(rpc_playback, "load_discovery_mixes_cache", return_value=cached_cache), \
             patch.object(rpc_playback, "_exec", side_effect=fake_exec):
            res = await rpc_playback.quick_play_pinned(plugin, mix_uri)

        self.assertTrue(res.get("ok"), msg=res)
        self.assertEqual(plugin._context_uri, mix_uri)
        self.assertEqual(len(captured_bodies), 1)
        self.assertNotIn("context_uri", captured_bodies[0])
        self.assertEqual(captured_bodies[0]["uris"], ["spotify:track:p1", "spotify:track:p2"])


if __name__ == "__main__":
    unittest.main()
