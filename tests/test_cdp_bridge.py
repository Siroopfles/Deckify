import json
import os
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.insert(0, os.path.dirname(__file__))
from test_token_refresh import main  # noqa: F401
from py_modules import cdp_bridge, engine


class TestCdpBridge(unittest.TestCase):
    def test_is_spotify_client_running_fast_fail(self):
        self.assertFalse(cdp_bridge.is_spotify_client_running(None))

        librespot_plugin = SimpleNamespace(
            _settings={"audio_backend": "librespot"},
            _spotify_client_process=MagicMock(poll=MagicMock(return_value=None)),
        )
        self.assertFalse(cdp_bridge.is_spotify_client_running(librespot_plugin))

        stopped_plugin = SimpleNamespace(
            _settings={"audio_backend": "spotify_client"},
            _spotify_client_process=MagicMock(poll=MagicMock(return_value=0)),
        )
        self.assertFalse(cdp_bridge.is_spotify_client_running(stopped_plugin))

        none_proc_plugin = SimpleNamespace(
            _settings={"audio_backend": "spotify_client"},
            _spotify_client_process=None,
        )
        self.assertFalse(cdp_bridge.is_spotify_client_running(none_proc_plugin))

        running_plugin = SimpleNamespace(
            _settings={"audio_backend": "spotify_client"},
            _spotify_client_process=MagicMock(poll=MagicMock(return_value=None)),
        )
        self.assertTrue(cdp_bridge.is_spotify_client_running(running_plugin))

    def test_evaluate_with_registry_preamble_and_error_fallback(self):
        self.assertEqual(cdp_bridge.DEFAULT_CDP_TIMEOUT, 4.0)

        captured = {}

        def fake_eval(expr, port=9229, timeout=4.0):
            captured["expr"] = expr
            captured["port"] = port
            captured["timeout"] = timeout
            return {"ok": True, "value": 42}

        res = cdp_bridge.evaluate_with_registry("return { ok: true, value: 42 };", eval_fn=fake_eval)
        self.assertEqual(res, {"ok": True, "value": 42})
        self.assertEqual(captured["timeout"], 4.0)
        self.assertIn("window.__deckifyRegistry", captured["expr"])
        self.assertIn("window.__deckifyRegistryEl === el", captured["expr"])
        self.assertIn("getService", captured["expr"])
        self.assertIn("parseImg", captured["expr"])

        # None result fallback
        res_none = cdp_bridge.evaluate_with_registry("return { ok: true };", eval_fn=lambda *a, **kw: None)
        self.assertFalse(res_none["ok"])
        self.assertIn("error", res_none)

        # Exception fallback
        def raising_eval(*a, **kw):
            raise RuntimeError("socket timeout")

        res_err = cdp_bridge.evaluate_with_registry("return { ok: true };", eval_fn=raising_eval)
        self.assertFalse(res_err["ok"])
        self.assertIn("socket timeout", res_err["error"])

    def test_probes_and_json_dumps_escaping(self):
        # cdp_fetch_discovery_mixes
        mix_payload = {
            "ok": True,
            "items": [
                {
                    "id": "37i9dQZF1EP6YuccBxUyC1",
                    "name": "daylist",
                    "uri": "spotify:playlist:37i9dQZF1EP6YuccBxUyC1",
                    "image_url": "https://i.scdn.co/image/abc",
                    "subtitle": "Made for you",
                    "type": "playlist",
                    "owner": "Spotify",
                }
            ],
        }
        res_mixes = cdp_bridge.cdp_fetch_discovery_mixes(eval_fn=lambda *a, **kw: mix_payload)
        self.assertTrue(res_mixes["ok"])
        self.assertEqual(len(res_mixes["items"]), 1)
        self.assertEqual(res_mixes["items"][0]["name"], "daylist")

        # cdp_fetch_station_radio_uris caps at 30 unique spotify:track: URIs and escapes inputs
        raw_uris = [f"spotify:track:trk{i}" for i in range(40)]
        raw_uris.append("spotify:track:trk0")  # duplicate
        raw_uris.append("spotify:episode:ep1")  # non-track filtered out
        captured_radio = {}

        def fake_radio_eval(expr, port=9229, timeout=4.0):
            captured_radio["expr"] = expr
            return {"ok": True, "uris": raw_uris}

        injected_seed = 'id";alert(1);//'
        uris = cdp_bridge.cdp_fetch_station_radio_uris(
            "track", injected_seed, f"spotify:track:{injected_seed}", eval_fn=fake_radio_eval
        )
        self.assertEqual(len(uris), 30)
        self.assertTrue(all(u.startswith("spotify:track:") for u in uris))
        self.assertIn(json.dumps(injected_seed), captured_radio["expr"])

        # Error fallback returns []
        self.assertEqual(
            cdp_bridge.cdp_fetch_station_radio_uris("track", "t1", eval_fn=lambda *a, **kw: None),
            [],
        )

        # cdp_fetch_browse_categories
        cats_payload = {
            "ok": True,
            "categories": [
                {"id": "gaming", "name": "Gaming", "image_url": "https://i.scdn.co/image/g", "uri": "spotify:genre:gaming"}
            ],
        }
        cats = cdp_bridge.cdp_fetch_browse_categories(eval_fn=lambda *a, **kw: cats_payload)
        self.assertEqual(len(cats), 1)
        self.assertEqual(cats[0]["id"], "gaming")
        self.assertEqual(cdp_bridge.cdp_fetch_browse_categories(eval_fn=lambda *a, **kw: None), [])

        # cdp_set_playlist_mix
        captured_mix = {}

        def fake_mix_eval(expr, port=9229, timeout=6.0):
            captured_mix["expr"] = expr
            return {"ok": True, "playlist_id": "pl1", "uri": "spotify:playlist:pl1", "is_mixed": True}

        mix_res = cdp_bridge.cdp_set_playlist_mix("spotify:playlist:pl1", enabled=True, play_now=False, eval_fn=fake_mix_eval)
        self.assertTrue(mix_res["ok"])
        self.assertTrue(mix_res["is_mixed"])
        self.assertIn(json.dumps("spotify:playlist:pl1"), captured_mix["expr"])

    def test_discovery_mixes_cache_atomic_roundtrip_and_recovery(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            cache_path = os.path.join(tmpdir, "sub", "discovery_mixes.json")
            # Missing file -> {}
            self.assertEqual(cdp_bridge.load_discovery_mixes_cache(cache_path), {})

            # Save & load roundtrip
            sample = {"items": [{"id": "mix1", "name": "Daily Mix 1"}], "updated_at": 12345}
            cdp_bridge.save_discovery_mixes_cache(sample, cache_path)
            self.assertTrue(os.path.exists(cache_path))
            self.assertEqual(cdp_bridge.load_discovery_mixes_cache(cache_path), sample)
            # Ensure no leftover .tmp files
            leftover = [f for f in os.listdir(os.path.dirname(cache_path)) if f.endswith(".tmp")]
            self.assertEqual(leftover, [])

            # Corrupt JSON -> {}
            with open(cache_path, "w", encoding="utf-8") as f:
                f.write("{corrupt json")
            self.assertEqual(cdp_bridge.load_discovery_mixes_cache(cache_path), {})

    def test_engine_wrappers_delegate_with_patchable_cdp_evaluate(self):
        fake_tree = [{"id": "sp-1", "name": "Folder", "playlists": [], "subfolders": []}]
        with patch.object(engine, "_cdp_evaluate", return_value={"ok": True, "tree": fake_tree}) as mock_eval:
            self.assertEqual(engine._fetch_spotify_cdp_folder_tree(), fake_tree)
            self.assertTrue(mock_eval.called)

        with patch.object(engine, "_cdp_evaluate", return_value={"ok": True}) as mock_eval:
            self.assertEqual(engine._cdp_toggle_like_track("spotify:track:1", True), {"ok": True})
            self.assertTrue(mock_eval.called)

        with patch.object(engine, "_cdp_evaluate", return_value={"ok": True, "tracks": [], "total": 0, "offset": 0}) as mock_eval:
            res = engine._cdp_get_liked_tracks(offset=0, fetch_all=False)
            self.assertTrue(res["ok"])
            self.assertTrue(mock_eval.called)

        with patch.object(engine, "_cdp_evaluate", return_value={"ok": True, "tracks": [], "total": 0, "offset": 0}) as mock_eval:
            res = engine._cdp_get_playlist_tracks("pl1", offset=0, fetch_all=False)
            self.assertTrue(res["ok"])
            self.assertTrue(mock_eval.called)

    def test_discovery_kind_classification_and_cdp_play_context(self):
        # _classify_discovery_kind
        self.assertEqual(
            cdp_bridge._classify_discovery_kind("37i9dQZF1EP6YuccBxUyC1", "spotify:playlist:37i9dQZF1EP6YuccBxUyC1", "daylist", "Spotify"),
            "core",
        )
        self.assertEqual(
            cdp_bridge._classify_discovery_kind("dw1", "spotify:playlist:dw1", "Discover Weekly", "Spotify"),
            "core",
        )
        self.assertEqual(
            cdp_bridge._classify_discovery_kind("rr1", "spotify:playlist:rr1", "Release Radar", "Spotify"),
            "core",
        )
        self.assertEqual(
            cdp_bridge._classify_discovery_kind("dm4", "spotify:playlist:dm4", "Daily Mix 4", "Spotify"),
            "core",
        )
        self.assertEqual(
            cdp_bridge._classify_discovery_kind("or1", "spotify:playlist:or1", "On Repeat", "Spotify"),
            "core",
        )
        self.assertEqual(
            cdp_bridge._classify_discovery_kind("rw1", "spotify:playlist:rw1", "Repeat Rewind", "Spotify"),
            "core",
        )
        self.assertEqual(
            cdp_bridge._classify_discovery_kind("37i9dQZF1EJabc123", "spotify:playlist:37i9dQZF1EJabc123", "Alice + Bob", "Spotify"),
            "blend",
        )
        self.assertEqual(
            cdp_bridge._classify_discovery_kind("bl1", "spotify:playlist:bl1", "Weekend Blend", "Spotify"),
            "blend",
        )
        self.assertEqual(
            cdp_bridge._classify_discovery_kind("37i9dQZF1EYkqdzj48dyYq", "spotify:playlist:37i9dQZF1EYkqdzj48dyYq", "DJ", "Spotify"),
            "dj",
        )
        # Editorial clutter and false-positive substrings like "Djent" must be editorial
        self.assertEqual(
            cdp_bridge._classify_discovery_kind("37i9dQZF1DX1", "spotify:playlist:37i9dQZF1DX1", "Djent", "Spotify"),
            "editorial",
        )
        self.assertEqual(
            cdp_bridge._classify_discovery_kind("37i9dQZF1DX2", "spotify:playlist:37i9dQZF1DX2", "Today's Top Hits", "Spotify"),
            "editorial",
        )
        self.assertEqual(
            cdp_bridge._classify_discovery_kind("37i9dQZF1DX3", "spotify:playlist:37i9dQZF1DX3", "Made for Gaming", "Spotify"),
            "editorial",
        )

        # cdp_fetch_discovery_mixes filters editorial and tags kinds
        payload = {
            "ok": True,
            "warnings": [],
            "items": [
                {"id": "dl1", "name": "daylist", "uri": "spotify:playlist:dl1", "owner": "Spotify"},
                {"id": "37i9dQZF1EJ1", "name": "A + B", "uri": "spotify:playlist:37i9dQZF1EJ1", "owner": "Spotify"},
                {"id": "37i9dQZF1EYkqdzj48dyYq", "name": "DJ", "uri": "spotify:playlist:37i9dQZF1EYkqdzj48dyYq", "owner": "Spotify"},
                {"id": "37i9dQZF1DX9", "name": "Djent", "uri": "spotify:playlist:37i9dQZF1DX9", "owner": "Spotify"},
            ],
        }
        captured_mixes_js = {}

        def fake_mixes_eval(expr, port=9229, timeout=4.0):
            captured_mixes_js["expr"] = expr
            return payload

        res = cdp_bridge.cdp_fetch_discovery_mixes(eval_fn=fake_mixes_eval)
        self.assertTrue(res["ok"])
        self.assertEqual([(it["name"], it["kind"]) for it in res["items"]], [
            ("daylist", "core"),
            ("A + B", "blend"),
            ("DJ", "dj"),
        ])
        self.assertIn("SearchAPI", captured_mixes_js["expr"])
        self.assertIn("getHomeSections", captured_mixes_js["expr"])

        # cdp_play_context validates prefix, escapes URI, and calls PlayerAPI.play
        bad_uri_res = cdp_bridge.cdp_play_context("spotify:track:123", eval_fn=lambda *a, **kw: {"ok": True})
        self.assertFalse(bad_uri_res["ok"])

        captured_play = {}

        def fake_play_eval(expr, port=9229, timeout=4.0):
            captured_play["expr"] = expr
            return {"ok": True, "uri": "spotify:playlist:37i9dQZF1EYkqdzj48dyYq"}

        play_res = cdp_bridge.cdp_play_context("spotify:playlist:37i9dQZF1EYkqdzj48dyYq", eval_fn=fake_play_eval)
        self.assertTrue(play_res["ok"])
        self.assertIn("PlayerAPI", captured_play["expr"])
        self.assertIn(json.dumps("spotify:playlist:37i9dQZF1EYkqdzj48dyYq"), captured_play["expr"])

        with patch.object(engine, "_cdp_evaluate", return_value={"ok": True, "episodes": [], "total": 0, "offset": 0}) as mock_eval:
            res = engine._cdp_get_saved_episodes(offset=0)
            self.assertTrue(res["ok"])
            self.assertTrue(mock_eval.called)

        with patch.object(engine, "_cdp_evaluate", return_value={"ok": True, "speed": 1.5}) as mock_eval:
            res = engine._cdp_set_playback_speed(1.5)
            self.assertEqual(res, {"ok": True, "speed": 1.5})
            self.assertTrue(mock_eval.called)

    def test_discovery_mixes_graphql_unwrap_and_on_repeat(self):
        captured = {}

        def fake_eval(expr, port=9229, timeout=4.0):
            captured["expr"] = expr
            return {"ok": True, "items": [], "warnings": []}

        res = cdp_bridge.cdp_fetch_discovery_mixes(eval_fn=fake_eval)
        self.assertTrue(res["ok"])
        expr = captured["expr"]
        self.assertIn("raw?.data", expr)
        self.assertIn("ownerV2?.data?.name", expr)
        self.assertIn("images?.items?.[0]?.sources", expr)
        self.assertIn("home?.home?.sectionContainer?.sections?.items", expr)
        self.assertIn("'on repeat'", expr)
        self.assertIn("'On Repeat'", expr)

    def test_cdp_get_playlist_tracks_returns_metadata(self):
        captured = {}

        def fake_eval(expr, port=9229, timeout=8.0):
            captured["expr"] = expr
            return {
                "ok": True,
                "tracks": [{"id": "t1", "name": "Song", "uri": "spotify:track:t1"}],
                "total": 1,
                "offset": 0,
                "playlist_name": "chill afternoon mix",
                "playlist_description": "Your Tuesday afternoon vibe",
            }

        res = cdp_bridge.cdp_get_playlist_tracks("37i9dQZF1EP6YuccBxUyC1", eval_fn=fake_eval)
        self.assertTrue(res["ok"])
        self.assertEqual(res["playlist_name"], "chill afternoon mix")
        self.assertEqual(res["playlist_description"], "Your Tuesday afternoon vibe")
        self.assertIn("getMetadata", captured["expr"])
        self.assertIn("playlist_name", captured["expr"])

    def test_cdp_get_player_state(self):
        captured = {}

        def fake_eval(expr, port=9229, timeout=3.0):
            captured["expr"] = expr
            captured["timeout"] = timeout
            return {
                "ok": True,
                "is_playing": True,
                "context_uri": "spotify:playlist:37i9dQZF1EYkqdzj48dyYq",
                "track_uri": "",
                "track_name": "",
                "media_type": "unknown",
                "is_dj_interlude": True,
                "image_url": "https://i.scdn.co/image/djx123",
                "title": "Welcome",
                "subtitle": "DJ X",
            }

        res = cdp_bridge.cdp_get_player_state(eval_fn=fake_eval)
        self.assertEqual(captured["timeout"], 3.0)
        self.assertIn("PlayerAPI", captured["expr"])
        self.assertIn("getState", captured["expr"])
        self.assertIn("is_dj_interlude", captured["expr"])
        self.assertIn("image_url", captured["expr"])
        self.assertIn("metadata?.title", captured["expr"])
        self.assertIn("metadata?.subtitle", captured["expr"])
        self.assertTrue(res["ok"])
        self.assertTrue(res["is_playing"])
        self.assertTrue(res["is_dj_interlude"])
        self.assertEqual(res["context_uri"], "spotify:playlist:37i9dQZF1EYkqdzj48dyYq")
        self.assertEqual(res["image_url"], "https://i.scdn.co/image/djx123")
        self.assertEqual(res["title"], "Welcome")
        self.assertEqual(res["subtitle"], "DJ X")

        err_res = cdp_bridge.cdp_get_player_state(eval_fn=lambda *a, **kw: None)
        self.assertFalse(err_res["ok"])
        self.assertIn("error", err_res)

    def test_daylist_dynamic_title_classified_as_core(self):
        self.assertEqual(
            cdp_bridge._classify_discovery_kind(
                "37i9dQZF1EP6YuccBxUcC1",
                "spotify:playlist:37i9dQZF1EP6YuccBxUcC1",
                "chill indie thursday afternoon",
                "Spotify",
                "",
            ),
            "core",
        )
        self.assertEqual(
            cdp_bridge._classify_discovery_kind(
                "custom_dl",
                "spotify:playlist:custom_dl",
                "chill indie thursday afternoon",
                "Spotify",
                "Your daylist updated throughout the day",
            ),
            "core",
        )

        captured = {}

        def fake_eval(expr, port=9229, timeout=5.0):
            captured["expr"] = expr
            return {
                "ok": True,
                "items": [
                    {
                        "id": "37i9dQZF1EP6YuccBxUcC1",
                        "uri": "spotify:playlist:37i9dQZF1EP6YuccBxUcC1",
                        "name": "chill indie thursday afternoon",
                        "subtitle": "Updated throughout the day",
                        "owner": "Spotify",
                        "image_url": "https://i.scdn.co/image/daylist1",
                    }
                ],
                "warnings": ["HomeAPI: timeout"],
            }

        with patch.object(cdp_bridge.decky.logger, "warning") as mock_warn:
            res = cdp_bridge.cdp_fetch_discovery_mixes(eval_fn=fake_eval)
        self.assertTrue(res["ok"])
        self.assertEqual(len(res["items"]), 1)
        self.assertEqual(res["items"][0]["kind"], "core")
        self.assertEqual(res["items"][0]["name"], "chill indie thursday afternoon")
        self.assertIn("37i9dQZF1EP6YuccBxUcC1", captured["expr"])
        mock_warn.assert_called_once()

    def test_cdp_jam_session_lifecycle_and_deterministic_ordering(self):
        def fake_start(expr, port=9229, timeout=4.0):
            self.assertIn("SocialConnectAPI", expr)
            return {
                "ok": True,
                "active": True,
                "join_url": "https://spotify.link/jam123",
                "is_host": True,
                "guests": [
                    {"id": "u2", "displayName": "Zoe"},
                    {"id": "u1", "displayName": "Alice"},
                ],
            }

        started = cdp_bridge.cdp_start_spotify_jam(eval_fn=fake_start)
        self.assertTrue(started["ok"])
        self.assertTrue(started["active"])
        self.assertEqual(started["join_url"], "https://spotify.link/jam123")
        self.assertTrue(started["is_host"])
        self.assertEqual(started["guest_count"], 2)
        self.assertEqual([g["displayName"] for g in started["guests"]], ["Alice", "Zoe"])

        offline_status = cdp_bridge.cdp_get_jam_status(eval_fn=lambda *a, **kw: None)
        self.assertFalse(offline_status["ok"])
        self.assertFalse(offline_status["active"])
        self.assertIsNone(offline_status["join_url"])
        self.assertEqual(offline_status["guest_count"], 0)

        ended = cdp_bridge.cdp_end_spotify_jam(eval_fn=lambda expr, **kw: {"ok": True, "active": False})
        self.assertTrue(ended["ok"])
        self.assertFalse(ended["active"])

    def test_cdp_search_escapes_query_and_normalizes_results(self):
        captured = {}

        def fake_eval(expr, **kw):
            captured["expr"] = expr
            return {
                "ok": True,
                "tracks": [
                    {
                        "id": "t1",
                        "name": "Track One",
                        "artist": "Artist One",
                        "album": "Album One",
                        "artist_id": "a1",
                        "album_id": "alb1",
                        "uri": "spotify:track:t1",
                        "duration_ms": 180000,
                        "image_url": "https://i.scdn.co/image/abc",
                        "artwork_url": "https://i.scdn.co/image/abc",
                    }
                ],
                "artists": [],
                "albums": [],
                "playlists": [],
                "shows": [],
                "episodes": [],
            }

        res = cdp_bridge.cdp_search('lofi "chill"; alert(1)', types="track", limit=5, offset=0, eval_fn=fake_eval)
        self.assertTrue(res["ok"])
        self.assertEqual(len(res["tracks"]), 1)
        self.assertEqual(res["tracks"][0]["uri"], "spotify:track:t1")
        self.assertIn(json.dumps('lofi "chill"; alert(1)'), captured["expr"])

    def test_rpc_search_spotify_prefers_cdp_on_spotify_client(self):
        import asyncio
        from py_modules import rpc_library

        plugin = SimpleNamespace(
            _settings={"audio_backend": "spotify_client"},
            _spotify_client_process=MagicMock(poll=MagicMock(return_value=None)),
            _liked_cache={"t1": True},
            _ensure_token=AsyncMock(return_value="tok-1"),
        )
        cdp_payload = {
            "ok": True,
            "tracks": [{"id": "t1", "name": "Track One", "uri": "spotify:track:t1"}],
            "artists": [],
            "albums": [],
            "playlists": [],
            "shows": [],
            "episodes": [],
        }

        with patch.object(rpc_library, "cdp_search", return_value=cdp_payload) as mock_cdp, patch.object(
            rpc_library, "_spotify_api_request"
        ) as mock_api:
            res = asyncio.run(rpc_library.search_spotify(plugin, "lofi", "track", 10, 0))

        self.assertTrue(res["ok"])
        self.assertTrue(res["tracks"][0]["is_liked"])
        mock_cdp.assert_called_once()
        mock_api.assert_not_called()

    def test_strip_html_and_playlist_description_sanitization(self):
        self.assertEqual(
            cdp_bridge._strip_html('Here&#39;s some <a href="spotify:playlist:123">bass</a> &amp;   chill'),
            "Here's some bass & chill",
        )
        self.assertEqual(cdp_bridge._strip_html(None), "")

        res = cdp_bridge.cdp_get_playlist_tracks(
            "37i9dQZF1EP6YuccBxUyC1",
            eval_fn=lambda *a, **kw: {
                "ok": True,
                "tracks": [],
                "total": 0,
                "offset": 0,
                "playlist_name": "daylist",
                "playlist_description": 'Your <a href="spotify:playlist:abc">bass</a> &amp; synth vibe',
            },
        )
        self.assertTrue(res["ok"])
        self.assertEqual(res["playlist_description"], "Your bass & synth vibe")

    def test_discovery_mixes_and_browse_categories_use_1_2_95_services(self):
        captured_mixes = {}

        def fake_mixes_eval(expr, port=9229, timeout=4.0):
            captured_mixes["expr"] = expr
            return {
                "ok": True,
                "warnings": [],
                "items": [
                    {
                        "id": "37i9dQZF1EP6YuccBxUcC1",
                        "name": "daylist",
                        "uri": "spotify:playlist:37i9dQZF1EP6YuccBxUcC1",
                        "subtitle": 'Here&#39;s some <a href="spotify:playlist:xyz">bass</a>',
                        "owner": "Spotify",
                    },
                    {
                        "id": "37i9dQZEVXc123",
                        "name": "Release Radar",
                        "uri": "spotify:playlist:37i9dQZEVXc123",
                        "subtitle": "Catch all the latest music",
                        "owner": "Spotify",
                    },
                ],
            }

        res = cdp_bridge.cdp_fetch_discovery_mixes(eval_fn=fake_mixes_eval)
        self.assertTrue(res["ok"])
        self.assertEqual(res["items"][0]["subtitle"], "Here's some bass")
        self.assertEqual(res["items"][1]["kind"], "core")
        expr = captured_mixes["expr"]
        self.assertIn("RecentlyPlayedAPI", expr)
        self.assertIn("RootlistAPI", expr)
        self.assertIn("PlaylistAPI", expr)
        self.assertIn("TokenProvider", expr)
        self.assertIn("pathfinder/v1/query", expr)

        captured_cats = {}

        def fake_cats_eval(expr, port=9229, timeout=4.0):
            captured_cats["expr"] = expr
            return {
                "ok": True,
                "categories": [
                    {
                        "id": "gaming",
                        "name": "Gaming",
                        "image_url": "https://i.scdn.co/image/g1",
                        "uri": "spotify:genre:gaming",
                    }
                ],
            }

        cats = cdp_bridge.cdp_fetch_browse_categories(eval_fn=fake_cats_eval)
        self.assertEqual(len(cats), 1)
        self.assertEqual(cats[0]["id"], "gaming")
        self.assertIn("TokenProvider", captured_cats["expr"])
        self.assertIn("pathfinder/v1/query", captured_cats["expr"])


if __name__ == "__main__":
    unittest.main()
