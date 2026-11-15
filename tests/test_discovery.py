import io
import json
import tempfile
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


class TestDiscoveryTracer(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        spotify._reset_rate_limit_breaker()
        self.plugin = make_plugin()

    def test_scopes_version_7_includes_user_top_read(self):
        self.assertEqual(common.CURRENT_SCOPES_VERSION, 7)
        self.assertIn("user-top-read", common.SPOTIFY_SCOPES.split())

    def test_circuit_breaker_opens_fast_fails_and_resets(self):
        err_429 = _http_error(429, {"Retry-After": "2"})
        with patch.object(spotify.urllib.request, "urlopen", side_effect=err_429) as mock_open:
            with self.assertRaises(spotify.SpotifyRateLimitError) as ctx1:
                spotify._spotify_api_request("me/top/tracks", "tok")
            self.assertGreaterEqual(ctx1.exception.retry_after, 5.0)
            self.assertEqual(mock_open.call_count, 1)

            # While breaker is open, _spotify_api_request must fail fast without calling urlopen
            with self.assertRaises(spotify.SpotifyRateLimitError):
                spotify._spotify_api_request("me/top/tracks", "tok")
            self.assertEqual(mock_open.call_count, 1)

        # Reset via helper or 2xx after expiry
        spotify._reset_rate_limit_breaker()
        with patch.object(spotify.urllib.request, "urlopen", return_value=_mock_http_response({"ok": True})):
            res = spotify._spotify_api_request("me/top/tracks", "tok")
            self.assertEqual(res, {"ok": True})

    async def test_get_discovery_feed_happy_path(self):
        def fake_api(endpoint, token, method="GET", params=None, body=None):
            if endpoint == "me/playlists":
                return {
                    "total": 2,
                    "items": [
                        {
                            "id": "mix1",
                            "uri": "spotify:playlist:mix1",
                            "name": "Discover Weekly",
                            "images": [{"url": "https://i.scdn.co/image/mix1"}],
                            "tracks": {"total": 30},
                            "owner": {"id": "spotify"},
                        },
                        {
                            "id": "user1",
                            "uri": "spotify:playlist:user1",
                            "name": "My Playlist",
                            "images": [],
                            "tracks": {"total": 10},
                            "owner": {"id": "user123"},
                        },
                    ],
                }
            if endpoint == "me/top/tracks":
                return {
                    "items": [
                        {
                            "id": "t1",
                            "uri": "spotify:track:t1",
                            "name": "Top Song",
                            "duration_ms": 200000,
                            "artists": [{"id": "ar1", "name": "Artist One"}],
                            "album": {"id": "al1", "name": "Album One", "images": [{"url": "https://i.scdn.co/image/t1"}]},
                        }
                    ]
                }
            if endpoint == "me/top/artists":
                return {
                    "items": [
                        {
                            "id": "ar1",
                            "uri": "spotify:artist:ar1",
                            "name": "Artist One",
                            "genres": ["rock"],
                            "images": [{"url": "https://i.scdn.co/image/ar1"}],
                        }
                    ]
                }
            if endpoint == "browse/new-releases":
                return {
                    "albums": {
                        "items": [
                            {
                                "id": "al2",
                                "uri": "spotify:album:al2",
                                "name": "Fresh Album",
                                "artists": [{"name": "New Artist"}],
                                "images": [{"url": "https://i.scdn.co/image/al2"}],
                                "release_date": "2026-11-01",
                                "total_tracks": 12,
                            }
                        ]
                    }
                }
            return {}

        with patch.object(rpc_library, "_spotify_api_request", side_effect=fake_api):
            res = await rpc_library.get_discovery_feed(self.plugin, "invalid_range")

        self.assertTrue(res["ok"])
        self.assertEqual(res["time_range"], "medium_term")
        self.assertEqual(len(res["made_for_you"]), 1)
        self.assertEqual(res["made_for_you"][0]["name"], "Discover Weekly")
        self.assertEqual(len(res["top_tracks"]), 1)
        self.assertEqual(len(res["top_artists"]), 1)
        self.assertEqual(len(res["new_releases"]), 1)
        self.assertFalse(res["needs_reauth"])
        self.assertFalse(res["rate_limited"])
        self.assertFalse(res["stale"])
        self.plugin._annotate_tracks_liked.assert_awaited_once()
