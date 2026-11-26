import json
import os
import sys
import time
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.insert(0, os.path.dirname(__file__))
from test_token_refresh import main  # noqa: F401
from py_modules import cdp_bridge, rpc_playback


def _make_plugin(backend: str = "librespot", running: bool = True) -> SimpleNamespace:
    proc = MagicMock(poll=MagicMock(return_value=None if running else 0))
    return SimpleNamespace(
        _settings={"audio_backend": backend},
        _spotify_client_process=proc if backend == "spotify_client" else None,
        _ensure_token=AsyncMock(return_value="tok_test"),
        _annotate_tracks_liked=AsyncMock(return_value=None),
        _poll_track_id="track_curr",
        _poll_track_uri="spotify:track:curr",
        _poll_play_state="playing",
        _shuffle_state=False,
        _repeat_state="off",
        _last_event=None,
        _optimistic_queue_snapshot=None,
        _last_queue_currently_playing=None,
        _power_governor=None,
        _mpris_bridge=None,
    )


class TestCdpQueueHelpers(unittest.TestCase):
    def test_cdp_remove_from_queue_escapes_and_handles_missing_player_api(self):
        captured = {}

        def fake_eval(expr, port=9229, timeout=4.0):
            captured["expr"] = expr
            return {"ok": True}

        uri = 'spotify:track:abc"123'
        uid = 'uid\'with"quotes'
        res = cdp_bridge.cdp_remove_from_queue(uri, uid=uid, eval_fn=fake_eval)
        self.assertEqual(res, {"ok": True})
        self.assertIn(json.dumps(uri), captured["expr"])
        self.assertIn(json.dumps(uid), captured["expr"])
        self.assertIn("removeFromQueue", captured["expr"])

        res_missing = cdp_bridge.cdp_remove_from_queue(
            uri, eval_fn=lambda *a, **kw: {"ok": False, "error": "PlayerAPI not found"}
        )
        self.assertFalse(res_missing["ok"])
        self.assertIn("PlayerAPI", res_missing["error"])

        res_empty = cdp_bridge.cdp_remove_from_queue("", eval_fn=fake_eval)
        self.assertFalse(res_empty["ok"])

        self.assertIn("nextTracks", captured["expr"])
        self.assertIn("Track not in next_tracks", captured["expr"])

        res_not_in_next = cdp_bridge.cdp_remove_from_queue(
            uri,
            eval_fn=lambda *a, **kw: {"ok": False, "error": "Track not in next_tracks"},
        )
        self.assertFalse(res_not_in_next["ok"])
        self.assertEqual(res_not_in_next["error"], "Track not in next_tracks")

    def test_cdp_clear_queue_and_reorder_queue_validation(self):
        captured = {}

        def fake_eval(expr, port=9229, timeout=4.0):
            captured["expr"] = expr
            return {"ok": True, "hasContextTracks": True}

        res_clear = cdp_bridge.cdp_clear_queue(eval_fn=fake_eval)
        self.assertEqual(res_clear, {"ok": True, "has_context_tracks": True})
        self.assertIn("clearQueue", captured["expr"])
        self.assertIn("hasContextTracks", captured["expr"])

        res_clear_empty = cdp_bridge.cdp_clear_queue(eval_fn=lambda *a, **kw: {"ok": True})
        self.assertEqual(res_clear_empty, {"ok": True, "has_context_tracks": False})

        res_reorder = cdp_bridge.cdp_reorder_queue(
            1, 3, uid='u"1', target_uid='u"3', eval_fn=fake_eval
        )
        self.assertEqual(res_reorder, {"ok": True})
        self.assertIn("reorderQueue", captured["expr"])
        self.assertIn(json.dumps('u"1'), captured["expr"])
        self.assertIn(json.dumps('u"3'), captured["expr"])

        res_unsupported = cdp_bridge.cdp_reorder_queue(
            0, 1, eval_fn=lambda *a, **kw: {"ok": False, "error": "reorderQueue not supported"}
        )
        self.assertFalse(res_unsupported["ok"])
        self.assertIn("reorderQueue", res_unsupported["error"])

        self.assertFalse(cdp_bridge.cdp_reorder_queue(-1, 2, eval_fn=fake_eval)["ok"])
        self.assertFalse(cdp_bridge.cdp_reorder_queue("bad", 2, eval_fn=fake_eval)["ok"])

    def test_cdp_remove_from_queue_checks_future_tracks_and_captures_uid(self):
        captured = {}

        def fake_eval(expr, port=9229, timeout=4.0):
            captured["expr"] = expr
            return {"ok": True}

        res = cdp_bridge.cdp_remove_from_queue("spotify:track:abc", eval_fn=fake_eval)
        self.assertEqual(res, {"ok": True})
        self.assertIn("futureTracks", captured["expr"])
        self.assertIn("future", captured["expr"])
        self.assertIn("matchedUid", captured["expr"])

    def test_cdp_clear_queue_checks_active_context_uri(self):
        captured = {}

        def fake_eval(expr, port=9229, timeout=4.0):
            captured["expr"] = expr
            return {"ok": True, "hasContextTracks": True}

        res = cdp_bridge.cdp_clear_queue(eval_fn=fake_eval)
        self.assertEqual(res, {"ok": True, "has_context_tracks": True})
        self.assertIn("context?.uri", captured["expr"])


class TestQueueStudioRpc(unittest.IsolatedAsyncioTestCase):
    async def test_reorder_spotify_client_tries_cdp_then_falls_back_to_uri_slice(self):
        plugin = _make_plugin(backend="spotify_client", running=True)
        upcoming = [
            {"id": "t1", "uri": "spotify:track:t1", "uid": "u1", "name": "One"},
            {"id": "t2", "uri": "spotify:track:t2", "uid": "u2", "name": "Two"},
            {"id": "t3", "uri": "spotify:track:t3", "uid": "u3", "name": "Three"},
        ]
        api_calls = []

        def fake_api(endpoint, token, method="GET", params=None, body=None):
            api_calls.append((method, endpoint, body))
            if method == "GET" and endpoint == "me/player":
                return {
                    "is_playing": True,
                    "progress_ms": 42000,
                    "item": {"uri": "spotify:track:curr"},
                }
            return {}

        with (
            patch.object(
                cdp_bridge,
                "cdp_reorder_queue",
                return_value={"ok": False, "error": "reorderQueue not supported"},
            ) as mock_cdp,
            patch.object(rpc_playback, "_spotify_api_request", side_effect=fake_api),
        ):
            res = await rpc_playback.reorder_queue_track(plugin, 0, 2, upcoming_tracks=upcoming)

        self.assertTrue(res["ok"])
        mock_cdp.assert_called_once()
        self.assertEqual([t["id"] for t in res["queue"]], ["t2", "t3", "t1"])
        self.assertIn(
            (
                "PUT",
                "me/player/play",
                {
                    "uris": [
                        "spotify:track:curr",
                        "spotify:track:t2",
                        "spotify:track:t3",
                        "spotify:track:t1",
                    ],
                    "position_ms": 42000,
                },
            ),
            api_calls,
        )
        # Should NOT call pause because is_playing was True
        self.assertFalse(any(ep == "me/player/pause" for _, ep, _ in api_calls))

    async def test_remove_and_clear_on_librespot_preserve_paused_state(self):
        plugin = _make_plugin(backend="librespot")
        upcoming = [
            {"id": "t1", "uri": "spotify:track:t1", "name": "One"},
            {"id": "t2", "uri": "spotify:track:t2", "name": "Two"},
        ]
        api_calls = []

        def fake_api(endpoint, token, method="GET", params=None, body=None):
            api_calls.append((method, endpoint, body))
            if method == "GET" and endpoint == "me/player":
                return {
                    "is_playing": False,
                    "progress_ms": 15000,
                    "item": {"uri": "spotify:track:curr"},
                }
            if method == "GET" and endpoint == "me/player/queue":
                return {
                    "currently_playing": {"id": "curr", "uri": "spotify:track:curr", "name": "Curr", "artists": []},
                    "queue": [{"id": "t2", "uri": "spotify:track:t2", "name": "Two", "artists": []}],
                }
            return {}

        with patch.object(rpc_playback, "_spotify_api_request", side_effect=fake_api):
            rm_res = await rpc_playback.remove_queue_track(plugin, 0, upcoming_tracks=upcoming)
            self.assertTrue(rm_res["ok"])
            self.assertEqual([t["id"] for t in rm_res["queue"]], ["t2"])
            self.assertIn(
                (
                    "PUT",
                    "me/player/play",
                    {"uris": ["spotify:track:curr", "spotify:track:t2"], "position_ms": 15000},
                ),
                api_calls,
            )
            self.assertIn(("PUT", "me/player/pause", None), api_calls)

            api_calls.clear()
            clr_res = await rpc_playback.clear_queue(plugin)
            self.assertTrue(clr_res["ok"])
            self.assertEqual(clr_res["queue"], [])
            self.assertIn(
                (
                    "PUT",
                    "me/player/play",
                    {"uris": ["spotify:track:curr"], "position_ms": 15000},
                ),
                api_calls,
            )
            self.assertIn(("PUT", "me/player/pause", None), api_calls)

    async def test_bounds_and_empty_clear_idempotency(self):
        plugin = _make_plugin(backend="librespot")
        oob_rm = await rpc_playback.remove_queue_track(plugin, 5, upcoming_tracks=[])
        self.assertFalse(oob_rm["ok"])
        oob_re = await rpc_playback.reorder_queue_track(plugin, 0, 1, upcoming_tracks=[{"uri": "spotify:track:1"}])
        self.assertFalse(oob_re["ok"])

        api_calls = []

        def empty_queue_api(endpoint, token, method="GET", params=None, body=None):
            api_calls.append((method, endpoint))
            if method == "GET" and endpoint == "me/player/queue":
                return {"currently_playing": None, "queue": []}
            return {}

        with patch.object(rpc_playback, "_spotify_api_request", side_effect=empty_queue_api):
            res = await rpc_playback.clear_queue(plugin)
        self.assertEqual(res, {"ok": True, "queue": []})
        self.assertFalse(any(ep == "me/player/play" for _, ep in api_calls))

    async def test_optimistic_queue_snapshot_ttl_and_invalidation(self):
        plugin = _make_plugin(backend="librespot")
        snap_items = [{"id": "t2", "uri": "spotify:track:t2", "name": "Two"}]
        rpc_playback._set_optimistic_queue_snapshot(plugin, snap_items, ttl_s=4.5)

        with patch.object(
            rpc_playback,
            "_spotify_api_request",
            side_effect=AssertionError("should not hit Spotify queue API while snapshot is valid"),
        ):
            q1 = await rpc_playback.get_queue(plugin)
            self.assertTrue(q1["ok"])
            self.assertEqual([t["id"] for t in q1["queue"]], ["t2"])

        # Track change invalidates snapshot
        plugin._poll_track_id = "track_next"
        self.assertIsNone(rpc_playback._get_valid_optimistic_queue(plugin))

        # Shuffle change invalidates snapshot
        plugin._poll_track_id = "track_curr"
        rpc_playback._set_optimistic_queue_snapshot(plugin, snap_items, ttl_s=4.5)
        plugin._shuffle_state = True
        self.assertIsNone(rpc_playback._get_valid_optimistic_queue(plugin))

        # Expired TTL invalidates snapshot
        plugin._shuffle_state = False
        rpc_playback._set_optimistic_queue_snapshot(plugin, snap_items, ttl_s=4.5)
        plugin._optimistic_queue_snapshot["expires_at"] = time.monotonic() - 1.0
        self.assertIsNone(rpc_playback._get_valid_optimistic_queue(plugin))

        # play_tracks, add_to_queue, and control_playback("next") invalidate snapshot
        with patch.object(rpc_playback, "_spotify_api_request", return_value={}):
            rpc_playback._set_optimistic_queue_snapshot(plugin, snap_items, ttl_s=4.5)
            await rpc_playback.add_to_queue(plugin, "spotify:track:t9")
            self.assertIsNone(plugin._optimistic_queue_snapshot)

            rpc_playback._set_optimistic_queue_snapshot(plugin, snap_items, ttl_s=4.5)
            await rpc_playback.play_tracks(plugin, uris=["spotify:track:t9"])
            self.assertIsNone(plugin._optimistic_queue_snapshot)

            rpc_playback._set_optimistic_queue_snapshot(plugin, snap_items, ttl_s=4.5)
            await rpc_playback.control_playback(plugin, "next")
            self.assertIsNone(plugin._optimistic_queue_snapshot)

    async def test_remove_queue_track_cdp_not_in_next_tracks_falls_back_to_uri_slice(self):
        plugin = _make_plugin(backend="spotify_client", running=True)
        upcoming = [
            {"id": "t1", "uri": "spotify:track:t1", "uid": "u1", "name": "One"},
            {"id": "t2", "uri": "spotify:track:t2", "uid": "u2", "name": "Two"},
        ]
        api_calls = []

        def fake_api(endpoint, token, method="GET", params=None, body=None):
            api_calls.append((method, endpoint, body))
            if method == "GET" and endpoint == "me/player":
                return {
                    "is_playing": True,
                    "progress_ms": 12000,
                    "item": {"uri": "spotify:track:curr"},
                }
            return {}

        with (
            patch.object(
                cdp_bridge,
                "cdp_remove_from_queue",
                return_value={"ok": False, "error": "Track not in next_tracks"},
            ) as mock_cdp,
            patch.object(rpc_playback, "_spotify_api_request", side_effect=fake_api),
        ):
            res = await rpc_playback.remove_queue_track(plugin, 0, upcoming_tracks=upcoming)

        self.assertTrue(res["ok"])
        mock_cdp.assert_called_once_with("spotify:track:t1", "u1")
        self.assertEqual([t["id"] for t in res["queue"]], ["t2"])
        self.assertIn(
            (
                "PUT",
                "me/player/play",
                {"uris": ["spotify:track:curr", "spotify:track:t2"], "position_ms": 12000},
            ),
            api_calls,
        )
        # Optimistic snapshot TTL should be >= 15s
        self.assertGreater(
            plugin._optimistic_queue_snapshot["expires_at"] - time.monotonic(),
            10.0,
        )

    async def test_clear_queue_context_fallback_and_persistent_suppression(self):
        plugin = _make_plugin(backend="spotify_client", running=True)
        api_calls = []

        def fake_api(endpoint, token, method="GET", params=None, body=None):
            api_calls.append((method, endpoint, body))
            if method == "GET" and endpoint == "me/player":
                return {
                    "is_playing": True,
                    "progress_ms": 5000,
                    "item": {"uri": "spotify:track:curr"},
                }
            if method == "GET" and endpoint == "me/player/queue":
                return {
                    "currently_playing": {"id": "curr", "uri": "spotify:track:curr", "name": "Curr", "artists": []},
                    "queue": [
                        {"id": "auto1", "uid": "u_auto", "uri": "spotify:track:auto1", "name": "Autoplay", "artists": []}
                    ],
                }
            return {}

        with (
            patch.object(
                cdp_bridge,
                "cdp_clear_queue",
                return_value={"ok": True, "has_context_tracks": True},
            ) as mock_cdp,
            patch.object(rpc_playback, "_spotify_api_request", side_effect=fake_api),
        ):
            clr_res = await rpc_playback.clear_queue(plugin)

        self.assertEqual(clr_res, {"ok": True, "queue": []})
        mock_cdp.assert_called_once()
        self.assertIn(
            ("PUT", "me/player/play", {"uris": ["spotify:track:curr"], "position_ms": 5000}),
            api_calls,
        )
        self.assertEqual(plugin._queue_cleared_for_track_id, "track_curr")
        self.assertGreater(
            plugin._optimistic_queue_snapshot["expires_at"] - time.monotonic(),
            10.0,
        )

        # Even after 15s optimistic snapshot expires, get_queue suppresses Autoplay for same track
        plugin._optimistic_queue_snapshot["expires_at"] = time.monotonic() - 1.0
        with patch.object(
            rpc_playback,
            "_spotify_api_request",
            side_effect=AssertionError("should suppress get_queue while _queue_cleared_for_track_id matches"),
        ):
            q_suppressed = await rpc_playback.get_queue(plugin)
        self.assertTrue(q_suppressed["ok"])
        self.assertEqual(q_suppressed["queue"], [])
        self.assertTrue(q_suppressed.get("cleared"))

        # Track change clears _queue_cleared_for_track_id and fetches queue with uid
        plugin._poll_track_id = "track_next"
        with patch.object(rpc_playback, "_spotify_api_request", side_effect=fake_api):
            q_after_track = await rpc_playback.get_queue(plugin)
        self.assertTrue(q_after_track["ok"])
        self.assertIsNone(plugin._queue_cleared_for_track_id)
        self.assertEqual(len(q_after_track["queue"]), 1)
        self.assertEqual(q_after_track["queue"][0]["uid"], "u_auto")

        # add_to_queue also clears _queue_cleared_for_track_id
        plugin._poll_track_id = "track_curr"
        plugin._queue_cleared_for_track_id = "track_curr"
        with patch.object(rpc_playback, "_spotify_api_request", return_value={}):
            await rpc_playback.add_to_queue(plugin, "spotify:track:new")
        self.assertIsNone(plugin._queue_cleared_for_track_id)

    async def test_clear_queue_checks_me_player_context_when_cdp_reports_false(self):
        plugin = _make_plugin(backend="spotify_client", running=True)
        api_calls = []

        def fake_api_with_context(endpoint, token, method="GET", params=None, body=None):
            api_calls.append((method, endpoint, body))
            if method == "GET" and endpoint == "me/player":
                return {
                    "is_playing": True,
                    "progress_ms": 8000,
                    "context": {"uri": "spotify:playlist:abc"},
                    "item": {"uri": "spotify:track:curr"},
                }
            return {}

        with (
            patch.object(
                cdp_bridge,
                "cdp_clear_queue",
                return_value={"ok": True, "has_context_tracks": False},
            ),
            patch.object(rpc_playback, "_spotify_api_request", side_effect=fake_api_with_context),
        ):
            res = await rpc_playback.clear_queue(plugin)

        self.assertEqual(res, {"ok": True, "queue": []})
        self.assertIn(
            ("PUT", "me/player/play", {"uris": ["spotify:track:curr"], "position_ms": 8000}),
            api_calls,
        )

        # When me/player has no context, clear_queue should not stutter via PUT me/player/play
        api_calls.clear()

        def fake_api_no_context(endpoint, token, method="GET", params=None, body=None):
            api_calls.append((method, endpoint, body))
            if method == "GET" and endpoint == "me/player":
                return {
                    "is_playing": True,
                    "progress_ms": 8000,
                    "context": None,
                    "item": {"uri": "spotify:track:curr"},
                }
            return {}

        with (
            patch.object(
                cdp_bridge,
                "cdp_clear_queue",
                return_value={"ok": True, "has_context_tracks": False},
            ),
            patch.object(rpc_playback, "_spotify_api_request", side_effect=fake_api_no_context),
        ):
            res_no_ctx = await rpc_playback.clear_queue(plugin)

        self.assertEqual(res_no_ctx, {"ok": True, "queue": []})
        self.assertFalse(any(ep == "me/player/play" for _, ep, _ in api_calls))


if __name__ == "__main__":
    unittest.main()
