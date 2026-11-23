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
            if endpoint == "search":
                return {
                    "tracks": {
                        "items": [
                            {"uri": "spotify:track:top-2"},
                            {"uri": "spotify:track:s-1"},
                            {"uri": "spotify:track:s-2"},
                        ]
                    }
                }
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
                return {"tracks": {"items": [{"uri": "spotify:track:synth-1"}, {"uri": "spotify:track:synth-2"}]}}
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


if __name__ == "__main__":
    unittest.main()
