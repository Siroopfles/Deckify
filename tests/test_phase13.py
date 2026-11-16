import asyncio
import os
import sys
import time
import unittest
from unittest.mock import AsyncMock, MagicMock, patch
from urllib.error import HTTPError

sys.path.insert(0, os.path.dirname(__file__))
from test_token_refresh import main
from py_modules import engine, rpc_library, rpc_playback


class TestPhase13LibraryAndGuardrails(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.plugin = main.Plugin()
        self.plugin._token_refresh_lock = asyncio.Lock()
        self.plugin._access_token = "valid-token"
        self.plugin._refresh_token = "valid-refresh"
        self.plugin._token_expires_at = time.time() + 3600
        self.plugin._settings = dict(main.DEFAULT_SETTINGS)
        self.plugin._liked_cache = {}
        self.emit = self.enterContext(patch.object(rpc_playback.decky, "emit", new_callable=AsyncMock))

    async def test_check_tracks_liked_batches_40_uris_and_preserves_cache_ttl(self):
        # 85 IDs including spotify:track: prefixed IDs and a duplicate
        track_ids = [f"id{i}" for i in range(80)]
        track_ids.extend([f"spotify:track:id{i}" for i in range(80, 85)])
        track_ids.append("spotify:track:id0")  # duplicate of id0

        with patch.object(rpc_playback, "_exec", new_callable=AsyncMock) as mock_exec:
            mock_exec.side_effect = [
                [i % 2 == 0 for i in range(40)],
                [i % 2 == 0 for i in range(40)],
                [True, False, True, False, True],
            ]

            res = await rpc_playback.check_tracks_liked(self.plugin, "valid-token", track_ids)

            self.assertEqual(mock_exec.await_count, 3)
            # Verify endpoint and chunk sizes 40, 40, 5
            chunk_sizes = []
            for call in mock_exec.await_args_list:
                args = call.args
                self.assertEqual(args[0], rpc_playback._spotify_api_request)
                self.assertEqual(args[1], "me/library/contains")
                self.assertEqual(args[2], "valid-token")
                self.assertEqual(args[3], "GET")
                uris = args[4]["uris"].split(",")
                chunk_sizes.append(len(uris))
                for u in uris:
                    self.assertTrue(u.startswith("spotify:track:"))
            self.assertEqual(chunk_sizes, [40, 40, 5])

            # Returned dict and _liked_cache are keyed by bare track ID
            self.assertEqual(len(res), 85)
            self.assertTrue(res["id0"])
            self.assertTrue(res["id80"])
            self.assertFalse(res["id81"])
            self.assertIn("id84", self.plugin._liked_cache)
            self.assertNotIn("spotify:track:id84", self.plugin._liked_cache)

            # Subsequent call within 300s TTL hits _liked_cache without network calls
            res_cached = await rpc_playback.check_tracks_liked(
                self.plugin, "valid-token", ["spotify:track:id80", "id81"]
            )
            self.assertEqual(res_cached, {"id80": True, "id81": False})
            self.assertEqual(mock_exec.await_count, 3)

    async def test_toggle_like_track_403_falls_back_to_cdp_when_spotify_client_active(self):
        self.plugin._settings["audio_backend"] = "spotify_client"
        proc = MagicMock()
        proc.poll.return_value = None
        self.plugin._spotify_client_process = proc
        self.plugin._poll_track_id = "track-403"
        self.plugin._is_liked = False
        self.plugin._track_meta = {"track_id": "track-403", "name": "Fallback Song", "is_liked": False}

        err_403 = HTTPError("url", 403, "Forbidden", {}, None)
        with patch.object(rpc_playback, "_exec", new_callable=AsyncMock) as mock_exec:
            mock_exec.side_effect = [err_403, {"ok": True}]

            res = await rpc_playback.toggle_like_track(self.plugin, "spotify:track:track-403", liked=True)

            self.assertTrue(res["ok"])
            self.assertEqual(res["track_id"], "track-403")
            self.assertTrue(res["is_liked"])
            self.assertTrue(self.plugin._is_liked)
            self.assertTrue(self.plugin._track_meta["is_liked"])
            self.assertTrue(self.plugin._liked_cache["track-403"][1])
            self.emit.assert_awaited_once_with("track_metadata", self.plugin._track_meta)

            self.assertEqual(mock_exec.await_count, 2)
            second_call = mock_exec.await_args_list[1].args
            self.assertEqual(second_call[0], engine._cdp_toggle_like_track)
            self.assertEqual(second_call[1], "spotify:track:track-403")
            self.assertTrue(second_call[2])

    async def test_get_liked_tracks_403_falls_back_to_cdp_when_spotify_client_active(self):
        self.plugin._settings["audio_backend"] = "spotify_client"
        proc = MagicMock()
        proc.poll.return_value = None
        self.plugin._spotify_client_process = proc

        err_403 = HTTPError("url", 403, "Forbidden", {}, None)
        cdp_payload = {
            "ok": True,
            "tracks": [
                {
                    "id": "cdp-1",
                    "name": "CDP Liked",
                    "artist": "Artist A",
                    "album": "Album A",
                    "artist_id": "art1",
                    "album_id": "alb1",
                    "uri": "spotify:track:cdp-1",
                    "duration_ms": 180000,
                    "image_url": "https://i.scdn.co/image/abc",
                    "artwork_url": "https://i.scdn.co/image/abc",
                    "is_liked": True,
                }
            ],
            "total": 1,
            "offset": 0,
        }

        with patch.object(rpc_library, "_exec", new_callable=AsyncMock) as mock_exec:
            mock_exec.side_effect = [err_403, cdp_payload]

            res = await rpc_library.get_liked_tracks(self.plugin, offset=0, fetch_all=True)

            self.assertTrue(res["ok"])
            self.assertEqual(res["total"], 1)
            self.assertEqual(res["offset"], 0)
            self.assertEqual(len(res["tracks"]), 1)
            self.assertEqual(res["tracks"][0]["id"], "cdp-1")

            self.assertEqual(mock_exec.await_count, 2)
            first_call = mock_exec.await_args_list[0].args
            self.assertEqual(first_call[1], "me/tracks")
            second_call = mock_exec.await_args_list[1].args
            self.assertEqual(second_call[0], engine._cdp_get_liked_tracks)
            self.assertEqual(second_call[1], 0)
            self.assertTrue(second_call[2])


class TestPhase13SinkInputGuardrails(unittest.TestCase):
    MULTI_STREAM_FIXTURE = (
        "Sink Input #10\n"
        "    Driver: PipeWire\n"
        "    application.name = \"Chromium\"\n"
        "    application.process.binary = \"steamwebhelper\"\n"
        "    application.process.id = \"1001\"\n"
        "    media.name = \"spotify\"\n"
        "Sink Input #11\n"
        "    Driver: PipeWire\n"
        "    application.name = \"Chromium\"\n"
        "    application.process.binary = \"chromium\"\n"
        "    application.process.id = \"1002\"\n"
        "Sink Input #12\n"
        "    Driver: PipeWire\n"
        "    application.name = \"Cyberpunk2077\"\n"
        "    application.process.binary = \"wine64-preloader\"\n"
        "    application.process.id = \"2001\"\n"
        "Sink Input #13\n"
        "    Driver: PipeWire\n"
        "    application.name = \"librespot\"\n"
        "    application.process.id = \"3001\"\n"
        "Sink Input #14\n"
        "    Driver: PipeWire\n"
        "    node.name = \"com.spotify.client\"\n"
        "    application.process.id = \"3002\"\n"
        "Sink Input #15\n"
        "    Driver: PipeWire\n"
        "    node.name = \"deckify_eq_out\"\n"
        "    application.process.id = \"3003\"\n"
    )

    def test_resolve_spotify_sink_input_ids_filters_denylist_and_games(self):
        # Even if steamwebhelper PID were passed or "spotify" appears in its media.name,
        # deny-list must exclude #10 and #11, and game #12 must be ignored.
        ids = engine.resolve_spotify_sink_input_ids(self.MULTI_STREAM_FIXTURE, pids={"1001", "3002"})
        self.assertEqual(ids, ["14", "13", "15"])

    def test_set_pactl_sink_input_moves_only_matched_spotify_streams(self):
        from types import SimpleNamespace

        list_proc = SimpleNamespace(returncode=0, stdout=self.MULTI_STREAM_FIXTURE, stderr="")
        move_proc = SimpleNamespace(returncode=0, stdout="", stderr="")

        with patch("py_modules.engine.subprocess.run", side_effect=[list_proc, move_proc, move_proc, move_proc]) as mock_run:
            ok = engine._set_pactl_sink_input("alsa_output.pci")

        self.assertTrue(ok)
        self.assertEqual(mock_run.call_count, 4)
        moved_cmds = [call.args[0][-3:] for call in mock_run.call_args_list[1:]]
        self.assertEqual(
            moved_cmds,
            [
                ["move-sink-input", "13", "alsa_output.pci"],
                ["move-sink-input", "14", "alsa_output.pci"],
                ["move-sink-input", "15", "alsa_output.pci"],
            ],
        )

    def test_set_pactl_sink_input_zero_match_noop_and_flag_injection_guard(self):
        from types import SimpleNamespace

        no_spotify_stdout = (
            "Sink Input #10\n"
            "    application.name = \"Chromium\"\n"
            "    application.process.binary = \"steamwebhelper\"\n"
            "Sink Input #12\n"
            "    application.name = \"Cyberpunk2077\"\n"
            "    application.process.binary = \"wine64-preloader\"\n"
        )
        list_proc = SimpleNamespace(returncode=0, stdout=no_spotify_stdout, stderr="")

        with patch("py_modules.engine.subprocess.run", return_value=list_proc) as mock_run, \
             patch.object(engine.decky.logger, "debug") as mock_debug:
            ok = engine._set_pactl_sink_input("alsa_output.pci")

        self.assertFalse(ok)
        self.assertEqual(mock_run.call_count, 1)
        mock_debug.assert_called_once()

        # Flag-injection / empty target_sink guard
        with patch("py_modules.engine.subprocess.run") as mock_run_bad:
            self.assertFalse(engine._set_pactl_sink_input("-bad"))
            self.assertFalse(engine._set_pactl_sink_input("   "))
            mock_run_bad.assert_not_called()
