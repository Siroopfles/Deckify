import io
import os
import sys
import tempfile
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
    from py_modules import rpc_playback, spotify


class TestRadioWaterfallRateLimitAndCache(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        spotify._reset_rate_limit_breaker()
        rpc_playback._reset_radio_cache()

    def tearDown(self):
        spotify._reset_rate_limit_breaker()
        rpc_playback._reset_radio_cache()

    def _make_plugin(self):
        return SimpleNamespace(
            _ensure_token=AsyncMock(return_value="tok-radio"),
            _settings={"audio_backend": "librespot"},
            _spotify_client_process=None,
        )

    async def test_tier3_propagates_rate_limit_error_immediately(self):
        plugin = self._make_plugin()
        api_calls = []

        def fake_api(endpoint, token, method="GET", params=None, body=None):
            api_calls.append((endpoint, params))
            if endpoint == "recommendations":
                raise RuntimeError("404 deprecated")
            if endpoint.startswith("tracks/"):
                raise spotify.SpotifyRateLimitError("Rate limited", retry_after=12.0)
            raise AssertionError(f"Unexpected follow-up call after 429: {endpoint}")

        with patch.object(rpc_playback, "_try_cdp_station_radio", AsyncMock(return_value=[])), patch.object(
            rpc_playback, "_spotify_api_request", side_effect=fake_api
        ):
            with self.assertRaises(spotify.SpotifyRateLimitError):
                await rpc_playback.start_radio(
                    plugin,
                    seed_type="track",
                    seed_id="4uLU6hMCjMI75M1A2tKUQC",
                )

        # Must abort right after tracks/{id} 429 without firing search/top-tracks/albums
        self.assertEqual(len(api_calls), 2)
        self.assertEqual(api_calls[0][0], "recommendations")
        self.assertTrue(api_calls[1][0].startswith("tracks/"))

    async def test_radio_cache_hits_on_repeat_and_caps_artist_albums_at_1(self):
        plugin = self._make_plugin()
        api_calls = []

        def fake_api(endpoint, token, method="GET", params=None, body=None):
            api_calls.append((endpoint, params))
            if endpoint == "recommendations":
                raise RuntimeError("404 deprecated")
            if endpoint == "search":
                return {"playlists": {"items": []}, "tracks": {"items": []}}
            if endpoint == "artists/art123/top-tracks":
                return {"tracks": [{"uri": f"spotify:track:t{i}"} for i in range(5)]}
            if endpoint == "artists/art123/albums":
                return {"items": [{"id": "alb1"}, {"id": "alb2"}, {"id": "alb3"}]}
            if endpoint == "albums/alb1/tracks":
                return {"items": [{"uri": f"spotify:track:a{i}"} for i in range(5)]}
            return {}

        with patch.object(rpc_playback, "_try_cdp_station_radio", AsyncMock(return_value=[])), patch.object(
            rpc_playback, "_spotify_api_request", side_effect=fake_api
        ), patch.object(rpc_playback, "play_tracks", AsyncMock(return_value={"ok": True})) as mock_play:
            res1 = await rpc_playback.start_radio(
                plugin,
                seed_type="artist",
                seed_id="art123",
                seed_name="Artist Name",
                artist_name="Artist Name",
            )
            self.assertTrue(res1["ok"])
            first_call_count = len(api_calls)
            album_req = [p for ep, p in api_calls if ep == "artists/art123/albums"]
            self.assertEqual(len(album_req), 1)
            self.assertEqual(album_req[0]["limit"], 1)
            # Only alb1/tracks fetched, never alb2 or alb3
            self.assertFalse(any(ep == "albums/alb2/tracks" for ep, _ in api_calls))

            # Second tap hits _RADIO_CACHE with zero additional Web API calls
            res2 = await rpc_playback.start_radio(
                plugin,
                seed_type="artist",
                seed_id="art123",
                seed_name="Artist Name",
                artist_name="Artist Name",
            )
            self.assertTrue(res2["ok"])
            self.assertEqual(len(api_calls), first_call_count)
            self.assertEqual(mock_play.await_count, 2)

    async def test_start_radio_inactive_device_transfers_play_false_and_retries_play(self):
        plugin = self._make_plugin()
        plugin._auto_transfer_and_play = lambda tok, device_id="", play=True: rpc_playback.auto_transfer_and_play(
            plugin, tok, device_id, play=play
        )
        calls = []
        play_attempts = 0

        def fake_api(endpoint, token, method="GET", params=None, body=None):
            nonlocal play_attempts
            calls.append((method, endpoint, params, body))
            if endpoint == "me/player/play" and method == "PUT":
                play_attempts += 1
                if play_attempts == 1:
                    raise urllib.error.HTTPError(
                        "url",
                        404,
                        "Not Found",
                        {},
                        io.BytesIO(b'{"error":{"status":404,"message":"No active device"}}'),
                    )
                return {}
            if endpoint == "me/player/devices":
                return {"devices": [{"id": "dev-steam", "name": "SteamMachine", "is_active": False}]}
            if endpoint == "me/player" and method == "PUT":
                return {}
            return {}

        radio_uris = [
            "spotify:track:r1",
            "spotify:track:r2",
            "spotify:track:r3",
        ]
        with patch.object(
            rpc_playback, "_try_cdp_station_radio", AsyncMock(return_value=radio_uris)
        ), patch.object(rpc_playback, "_spotify_api_request", side_effect=fake_api), patch.object(
            rpc_playback.asyncio, "sleep", AsyncMock()
        ):
            res = await rpc_playback.start_radio(
                plugin,
                seed_type="track",
                seed_id="seed1",
                seed_uri="spotify:track:seed1",
            )

        self.assertTrue(res.get("ok"), f"Expected ok=True, got {res}")
        transfer_calls = [c for c in calls if c[1] == "me/player" and c[0] == "PUT"]
        self.assertEqual(len(transfer_calls), 1)
        self.assertEqual(transfer_calls[0][3], {"device_ids": ["dev-steam"], "play": False})

        play_calls = [c for c in calls if c[1] == "me/player/play" and c[0] == "PUT"]
        self.assertEqual(len(play_calls), 2)
        self.assertEqual(play_calls[1][2], {"device_id": "dev-steam"})
        self.assertEqual(play_calls[1][3]["uris"][0], "spotify:track:seed1")

    async def test_play_tracks_surfaces_retry_403_restriction_violated(self):
        plugin = self._make_plugin()
        plugin._auto_transfer_and_play = lambda tok, device_id="", play=True: rpc_playback.auto_transfer_and_play(
            plugin, tok, device_id, play=play
        )
        play_attempts = 0

        def fake_api(endpoint, token, method="GET", params=None, body=None):
            nonlocal play_attempts
            if endpoint == "me/player/play" and method == "PUT":
                play_attempts += 1
                if play_attempts == 1:
                    raise urllib.error.HTTPError(
                        "url",
                        404,
                        "Not Found",
                        {},
                        io.BytesIO(b'{"error":{"status":404,"message":"No active device"}}'),
                    )
                raise urllib.error.HTTPError(
                    "url",
                    403,
                    "Forbidden",
                    {},
                    io.BytesIO(b'{"error":{"status":403,"message":"Restriction violated"}}'),
                )
            if endpoint == "me/player/devices":
                return {"devices": [{"id": "dev-lib", "name": "Deckify", "is_active": False}]}
            if endpoint == "me/player" and method == "PUT":
                return {}
            return {}

        with patch.object(rpc_playback, "_spotify_api_request", side_effect=fake_api), patch.object(
            rpc_playback.asyncio, "sleep", AsyncMock()
        ):
            res = await rpc_playback.play_tracks(plugin, uris=["spotify:track:t1"])

        self.assertFalse(res.get("ok"))
        self.assertIn("Restriction violated", res.get("error", ""))


if __name__ == "__main__":
    unittest.main()
