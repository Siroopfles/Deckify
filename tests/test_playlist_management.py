import io
import json
import os
import sys
import unittest
import urllib.error
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.insert(0, os.path.dirname(__file__))
from test_token_refresh import main  # noqa: F401
from py_modules import cdp_bridge, rpc_library


def _http_error(code: int, body: str = '{"error":{"message":"err"}}') -> urllib.error.HTTPError:
    return urllib.error.HTTPError(
        url="https://api.spotify.com/v1/playlists/p1",
        code=code,
        msg="err",
        hdrs=None,
        fp=io.BytesIO(body.encode("utf-8")),
    )


def _make_plugin(audio_backend: str = "librespot", running: bool = False, settings: dict | None = None):
    proc = MagicMock(poll=MagicMock(return_value=None)) if running else None
    return SimpleNamespace(
        _ensure_token=AsyncMock(return_value="tok_test"),
        _settings=settings if settings is not None else {
            "audio_backend": audio_backend,
            "pinned_playlists": [],
            "playlist_folders": [],
        },
        _spotify_client_process=proc,
    )


class TestPlaylistManagement(unittest.IsolatedAsyncioTestCase):
    async def test_get_playlists_ownership_and_enrichment(self):
        plugin = _make_plugin()

        def fake_api(endpoint, token, method="GET", params=None, body=None):
            if endpoint == "me":
                return {"id": "user_123"}
            if endpoint == "me/playlists":
                return {
                    "total": 4,
                    "items": [
                        {
                            "id": "p_owned",
                            "uri": "spotify:playlist:p_owned",
                            "name": "My Mix",
                            "description": "Owned desc",
                            "collaborative": False,
                            "owner": {"id": "user_123"},
                            "images": [],
                            "items": {"total": 12},
                        },
                        {
                            "id": "p_collab",
                            "uri": "spotify:playlist:p_collab",
                            "name": "Collab Mix",
                            "description": "Friends",
                            "collaborative": True,
                            "owner": {"id": "other_user"},
                            "images": [],
                            "tracks": {"total": 5},
                        },
                        {
                            "id": "p_spotify",
                            "uri": "spotify:playlist:p_spotify",
                            "name": "Discover Weekly",
                            "description": "Algo",
                            "collaborative": False,
                            "owner": {"id": "spotify"},
                            "images": [],
                            "tracks": {"total": 30},
                        },
                        {
                            "id": "p_other",
                            "uri": "spotify:playlist:p_other",
                            "name": "Someone Else",
                            "description": None,
                            "collaborative": False,
                            "owner": {"id": "other_user"},
                            "images": [],
                            "tracks": {"total": 8},
                        },
                    ],
                }
            raise AssertionError(f"Unexpected endpoint: {endpoint}")

        with patch.object(rpc_library, "_spotify_api_request", side_effect=fake_api):
            res = await rpc_library.get_playlists(plugin)

        self.assertTrue(res["ok"])
        by_id = {p["id"]: p for p in res["playlists"]}
        self.assertTrue(by_id["p_owned"]["is_editable"])
        self.assertEqual(by_id["p_owned"]["description"], "Owned desc")
        self.assertEqual(by_id["p_owned"]["owner_id"], "user_123")
        self.assertFalse(by_id["p_owned"]["collaborative"])

        self.assertTrue(by_id["p_collab"]["is_editable"])
        self.assertTrue(by_id["p_collab"]["collaborative"])

        self.assertFalse(by_id["p_spotify"]["is_editable"])
        self.assertFalse(by_id["p_other"]["is_editable"])
        self.assertEqual(by_id["p_other"]["description"], "")

    async def test_create_and_update_playlist_validation_and_cdp_fallback(self):
        plugin = _make_plugin(audio_backend="spotify_client", running=True)

        bad_create = await rpc_library.create_playlist(plugin, "   ")
        self.assertEqual(bad_create, {"ok": False, "error": "Playlist name cannot be empty"})

        bad_update = await rpc_library.update_playlist_details(plugin, "p1", "\t\n")
        self.assertEqual(bad_update, {"ok": False, "error": "Playlist name cannot be empty"})

        # Web API 403 triggers CDP fallback for create_playlist
        with patch.object(rpc_library, "_spotify_api_request", side_effect=_http_error(403)):
            with patch.object(
                cdp_bridge,
                "cdp_create_playlist",
                return_value={"ok": True, "uri": "spotify:playlist:cdp1", "id": "cdp1", "name": "Roadtrip", "description": "Chill"},
            ) as mock_cdp_create:
                res_create = await rpc_library.create_playlist(plugin, " Roadtrip ", False, " Chill ")

        self.assertTrue(res_create["ok"])
        self.assertEqual(res_create["source"], "cdp")
        self.assertEqual(res_create["playlist"]["id"], "cdp1")
        self.assertEqual(res_create["playlist"]["description"], "Chill")
        self.assertTrue(res_create["playlist"]["is_editable"])
        mock_cdp_create.assert_called_once_with("Roadtrip", "Chill")

        # Web API 403 triggers CDP fallback for update_playlist_details
        with patch.object(rpc_library, "_spotify_api_request", side_effect=_http_error(403)):
            with patch.object(
                cdp_bridge,
                "cdp_update_playlist_details",
                return_value={"ok": True, "uri": "spotify:playlist:p1", "name": "Renamed", "description": "New desc"},
            ) as mock_cdp_upd:
                res_upd = await rpc_library.update_playlist_details(plugin, "spotify:playlist:p1", "Renamed", "New desc")

        self.assertTrue(res_upd["ok"])
        self.assertEqual(res_upd["source"], "cdp")
        mock_cdp_upd.assert_called_once_with("spotify:playlist:p1", "Renamed", "New desc")

    async def test_delete_playlist_cleans_pinned_and_folders_idempotently(self):
        settings = {
            "audio_backend": "librespot",
            "pinned_playlists": [
                {"id": "p_del", "uri": "spotify:playlist:p_del", "name": "Delete Me"},
                {"id": "p_keep", "uri": "spotify:playlist:p_keep", "name": "Keep Me"},
            ],
            "playlist_folders": [
                {"id": "f1", "name": "Gaming", "playlist_ids": ["p_del", "spotify:playlist:p_del", "p_keep"]},
            ],
        }
        plugin = _make_plugin(settings=settings)

        with patch.object(rpc_library, "_spotify_api_request", return_value={}) as mock_api:
            with patch.object(rpc_library, "_save_settings") as mock_save:
                res1 = await rpc_library.delete_playlist(plugin, "spotify:playlist:p_del")
                res2 = await rpc_library.delete_playlist(plugin, "p_del")

        self.assertTrue(res1["ok"])
        self.assertTrue(res2["ok"])
        self.assertEqual(len(plugin._settings["pinned_playlists"]), 1)
        self.assertEqual(plugin._settings["pinned_playlists"][0]["id"], "p_keep")
        self.assertEqual(plugin._settings["playlist_folders"][0]["playlist_ids"], ["p_keep"])
        self.assertEqual(mock_save.call_count, 2)
        mock_api.assert_any_call("playlists/p_del/followers", "tok_test", "DELETE")

    async def test_reorder_playlist_tracks_insert_before_and_fallbacks(self):
        plugin = _make_plugin(audio_backend="spotify_client", running=True)
        calls = []

        def fake_api(endpoint, token, method="GET", params=None, body=None):
            calls.append((endpoint, method, body))
            if endpoint.endswith("/items"):
                raise _http_error(404)
            return {"snapshot_id": "snap2"}

        # Moving down (1 -> 3): insert_before = 4
        with patch.object(rpc_library, "_spotify_api_request", side_effect=fake_api):
            res_down = await rpc_library.reorder_playlist_tracks(plugin, "p1", 1, 3, snapshot_id="snap1")
        self.assertTrue(res_down["ok"])
        self.assertEqual(res_down["insert_before"], 4)
        self.assertEqual(calls[1][0], "playlists/p1/tracks")
        self.assertEqual(calls[1][2]["insert_before"], 4)

        # Moving up (3 -> 1): insert_before = 1, plus CDP fallback when both /items and /tracks return 403
        with patch.object(rpc_library, "_spotify_api_request", side_effect=_http_error(403)):
            with patch.object(cdp_bridge, "cdp_reorder_playlist_track", return_value={"ok": True}) as mock_cdp_move:
                res_up = await rpc_library.reorder_playlist_tracks(
                    plugin, "p1", 3, 1, uid="uid_3", target_uid="uid_1"
                )
        self.assertTrue(res_up["ok"])
        self.assertEqual(res_up["source"], "cdp")
        self.assertEqual(res_up["insert_before"], 1)
        mock_cdp_move.assert_called_once_with("spotify:playlist:p1", "uid_3", "uid_1", False)

    async def test_remove_track_single_instance_position_and_cdp_uid_fallback(self):
        plugin = _make_plugin(audio_backend="spotify_client", running=True)
        captured = []

        def fake_items_ok(endpoint, token, method="GET", params=None, body=None):
            captured.append((endpoint, method, body))
            return {"snapshot_id": "s1"}

        with patch.object(rpc_library, "_spotify_api_request", side_effect=fake_items_ok):
            res = await rpc_library.remove_track_from_playlist(
                plugin, "p1", "spotify:track:t1", position=4, uid="u4"
            )
        self.assertTrue(res["ok"])
        self.assertEqual(captured[0], ("playlists/p1/items", "DELETE", {"items": [{"uri": "spotify:track:t1", "positions": [4]}]}))

        # Both /items and /tracks return 403 -> CDP PlaylistAPI.remove with uid
        with patch.object(rpc_library, "_spotify_api_request", side_effect=_http_error(403)):
            with patch.object(cdp_bridge, "cdp_remove_from_playlist", return_value={"ok": True}) as mock_cdp_rem:
                res_cdp = await rpc_library.remove_track_from_playlist(
                    plugin, "p1", "spotify:track:t1", position=4, uid="u4"
                )
        self.assertTrue(res_cdp["ok"])
        self.assertEqual(res_cdp["source"], "cdp")
        mock_cdp_rem.assert_called_once_with("spotify:playlist:p1", "spotify:track:t1", "u4")

    def test_cdp_playlist_helpers_serialize_strings_with_json_dumps(self):
        seen = []

        def fake_eval(expr, port=9229, timeout=4.0):
            seen.append(expr)
            if "createPlaylist" in expr:
                return {"ok": True, "uri": "spotify:playlist:abc", "id": "abc", "name": 'My "Mix"', "description": "Line\n2"}
            return {"ok": True}

        res = cdp_bridge.cdp_create_playlist('My "Mix"', "Line\n2", eval_fn=fake_eval)
        self.assertTrue(res["ok"])
        self.assertIn(json.dumps('My "Mix"'), seen[-1])
        self.assertIn(json.dumps("Line\n2"), seen[-1])

        res_mv = cdp_bridge.cdp_reorder_playlist_track("p1", "u1", "u2", move_after=True, eval_fn=fake_eval)
        self.assertTrue(res_mv["ok"])
        self.assertIn("moveAfter = true", seen[-1])


if __name__ == "__main__":
    unittest.main()
