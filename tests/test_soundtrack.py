import asyncio
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

with patch.dict("sys.modules", {"decky": SimpleNamespace(
    DECKY_PLUGIN_SETTINGS_DIR=tempfile.gettempdir(),
    DECKY_PLUGIN_DIR=tempfile.gettempdir(),
    DECKY_PLUGIN_RUNTIME_DIR=tempfile.gettempdir(),
    logger=MagicMock(),
    emit=AsyncMock(),
)}):
    from py_modules import common, soundtrack
    from py_modules.soundtrack import SoundtrackManager

PL_A = "spotify:playlist:aaa"
PL_B = "spotify:playlist:bbb"
PL_C = "spotify:playlist:ccc"


def make_plugin():
    settings = dict(common.DEFAULT_SETTINGS)
    settings["game_audio_profiles"] = {}
    settings["soundtrack_launch_debounce"] = 0.05
    settings["soundtrack_exit_debounce"] = 0.05
    return SimpleNamespace(
        _settings=settings,
        _ensure_token=AsyncMock(return_value="tok"),
        _auto_transfer_and_play=AsyncMock(return_value={"ok": True}),
        _save_settings=MagicMock(),
        _volume_fader=MagicMock(),
        play_tracks=AsyncMock(return_value={"ok": True}),
        control_playback=AsyncMock(return_value={"ok": True}),
        set_shuffle=AsyncMock(return_value={"ok": True}),
        set_volume=AsyncMock(return_value={"ok": True}),
    )


def snap(playing=True, ctx="spotify:playlist:pre", track="spotify:track:pre", pos=42000, vol=70):
    return {"is_playing": playing, "context_uri": ctx, "track_uri": track, "position_ms": pos, "volume": vol}


class SoundtrackBase(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.plugin = make_plugin()
        self.mgr = SoundtrackManager(self.plugin)

    async def settle(self):
        await asyncio.sleep(0.2)


class TestProfiles(SoundtrackBase):
    def test_save_get_delete(self):
        res = self.mgr.save_profile(100, {"app_name": "G", "playlists": [{"uri": PL_A, "name": "A"}], "mode": "random"})
        self.assertTrue(res["ok"])
        self.assertEqual(self.mgr.get_profile(100)["mode"], "random")
        self.assertIn("100", self.mgr.get_profiles())
        self.plugin._save_settings.assert_called()
        self.assertTrue(self.mgr.delete_profile(100)["removed"])
        self.assertIsNone(self.mgr.get_profile(100))

    def test_validation(self):
        for bad in (0, -5, "abc", None, 2 ** 33, True):
            self.assertFalse(self.mgr.save_profile(bad, {})["ok"])
        self.mgr.save_profile(5, {"mode": "bogus", "exit_policy": "x", "playlists": [{"uri": "http://evil"}, {"uri": PL_A}],
                                  "volume_override": 500, "unknown_key": 1})
        p = self.mgr.get_profile(5)
        self.assertEqual(p["mode"], "shuffle")
        self.assertEqual(p["exit_policy"], "restore_snapshot")
        self.assertEqual([x["uri"] for x in p["playlists"]], [PL_A])
        self.assertEqual(p["volume_override"], 100)
        self.assertNotIn("unknown_key", p)

    def test_save_preserves_resume_state(self):
        self.mgr.save_profile(7, {"last_track_uri": "spotify:track:x", "last_position_ms": 1000})
        self.mgr.save_profile(7, {"mode": "random"})
        self.assertEqual(self.mgr.get_profile(7)["last_position_ms"], 1000)


class TestMultiPlaylist(SoundtrackBase):
    def profile(self, mode, **kw):
        return {"playlists": [{"uri": PL_A}, {"uri": PL_B}, {"uri": PL_C}], "mode": mode, **kw}

    def test_rotation(self):
        p = self.profile("rotation")
        picks = [self.mgr.resolve_playlist(p) for _ in range(4)]
        self.assertEqual(picks, [PL_A, PL_B, PL_C, PL_A])
        self.assertEqual(p["rotation_index"], 1)

    def test_random(self):
        with patch("py_modules.soundtrack.random.choice", side_effect=lambda seq: seq[1]):
            self.assertEqual(self.mgr.resolve_playlist(self.profile("random")), PL_B)

    def test_shuffle_single_and_pool(self):
        self.assertEqual(self.mgr.resolve_playlist({"playlists": [{"uri": PL_A}], "mode": "shuffle"}), PL_A)
        self.assertIn(self.mgr.resolve_playlist(self.profile("shuffle")), (PL_A, PL_B, PL_C))

    def test_empty(self):
        self.assertIsNone(self.mgr.resolve_playlist({"playlists": [], "mode": "random"}))


class TestLifecycle(SoundtrackBase):
    async def test_launch_snapshot_and_debounced_play(self):
        self.mgr.save_profile(10, {"playlists": [{"uri": PL_A}], "always_auto_start": True, "mode": "random"})
        with patch.object(self.mgr, "get_player_state", AsyncMock(return_value=snap())):
            await self.mgr.handle_app_lifecycle(10, True)
            self.assertEqual(self.mgr._pre_game_snapshot["position_ms"], 42000)
            self.assertEqual(self.mgr._pre_game_snapshot["context_uri"], "spotify:playlist:pre")
            self.plugin.play_tracks.assert_not_called()  # still inside debounce
            await self.settle()
        self.plugin.play_tracks.assert_awaited_once()
        self.assertEqual(self.plugin.play_tracks.await_args.kwargs["context_uri"], PL_A)

    async def test_rapid_exit_relaunch_cancels(self):
        self.mgr.save_profile(10, {"playlists": [{"uri": PL_A}], "always_auto_start": True, "mode": "random"})
        with patch.object(self.mgr, "get_player_state", AsyncMock(return_value=snap(playing=False))):
            await self.mgr.handle_app_lifecycle(10, True)
            first = self.mgr._launch_task
            await self.mgr.handle_app_lifecycle(10, False)
            self.assertTrue(first.cancelled() or first.cancelling() or not first.done())
            await self.mgr.handle_app_lifecycle(10, True)
            await self.settle()
        self.assertEqual(self.plugin.play_tracks.await_count, 1)  # no duplicates, no exit restore
        self.assertIsNotNone(self.mgr._active_game_app_id)

    async def test_prompt_when_already_playing(self):
        self.mgr.save_profile(10, {"playlists": [{"uri": PL_A}], "always_auto_start": False})
        with patch.object(self.mgr, "get_player_state", AsyncMock(return_value=snap())), \
                patch.object(soundtrack.decky, "emit", new_callable=AsyncMock) as emit:
            await self.mgr.handle_app_lifecycle(10, True)
            await self.settle()
        self.plugin.play_tracks.assert_not_called()
        emit.assert_any_await("soundtrack_prompt_switch", {"app_id": 10, "app_name": ""})

    async def test_resume_position_on_launch(self):
        self.mgr.save_profile(10, {"playlists": [{"uri": PL_A}], "always_auto_start": True, "mode": "random",
                                   "last_track_uri": "spotify:track:t9", "last_position_ms": 5555, "last_context_uri": PL_A})
        with patch.object(self.mgr, "get_player_state", AsyncMock(return_value=snap(playing=False))):
            await self.mgr.handle_app_lifecycle(10, True)
            await self.settle()
        kw = self.plugin.play_tracks.await_args.kwargs
        self.assertEqual((kw["offset_uri"], kw["position_ms"]), ("spotify:track:t9", 5555))

    async def test_exit_saves_position_and_restores_snapshot(self):
        self.mgr.save_profile(10, {"playlists": [{"uri": PL_A}], "always_auto_start": True, "mode": "random"})
        states = [snap(), {"is_playing": True, "context_uri": PL_A, "track_uri": "spotify:track:g1", "position_ms": 9999, "volume": 70}]
        with patch.object(self.mgr, "get_player_state", AsyncMock(side_effect=states)):
            await self.mgr.handle_app_lifecycle(10, True)
            await self.settle()
            self.plugin.play_tracks.reset_mock()
            await self.mgr.handle_app_lifecycle(10, False)
            await self.settle()
        p = self.mgr.get_profile(10)
        self.assertEqual((p["last_track_uri"], p["last_position_ms"]), ("spotify:track:g1", 9999))
        kw = self.plugin.play_tracks.await_args.kwargs
        self.assertEqual(kw["context_uri"], "spotify:playlist:pre")
        self.assertEqual(kw["offset_uri"], "spotify:track:pre")
        self.assertEqual(kw["position_ms"], 42000)
        self.assertIsNone(self.mgr._active_game_app_id)
        self.assertIsNone(self.mgr._pre_game_snapshot)

    async def test_manual_pause_prevents_restore(self):
        self.mgr.save_profile(10, {"playlists": [{"uri": PL_A}], "always_auto_start": True, "mode": "random"})
        with patch.object(self.mgr, "get_player_state", AsyncMock(return_value=snap())):
            await self.mgr.handle_app_lifecycle(10, True)
            await self.settle()
            self.plugin.play_tracks.reset_mock()
            self.mgr.record_manual_pause()
            await self.mgr.handle_app_lifecycle(10, False)
            await self.settle()
        self.plugin.play_tracks.assert_not_called()
        self.plugin.control_playback.assert_not_called()

    async def test_manual_pause_ignored_without_game(self):
        self.mgr.record_manual_pause()
        self.assertFalse(self.mgr._user_paused_in_game)

    async def test_exit_policy_pause(self):
        self.mgr.save_profile(10, {"playlists": [{"uri": PL_A}], "always_auto_start": True, "exit_policy": "pause"})
        with patch.object(self.mgr, "get_player_state", AsyncMock(return_value=snap())):
            await self.mgr.handle_app_lifecycle(10, True)
            await self.settle()
            await self.mgr.handle_app_lifecycle(10, False)
            await self.settle()
        self.plugin.control_playback.assert_awaited_with("pause")

    async def test_exit_snapshot_not_playing_pauses(self):
        self.mgr.save_profile(10, {"playlists": [{"uri": PL_A}]})
        with patch.object(self.mgr, "get_player_state", AsyncMock(return_value=snap(playing=False))):
            await self.mgr.handle_app_lifecycle(10, True)
            await self.settle()
            self.plugin.play_tracks.reset_mock()
            await self.mgr.handle_app_lifecycle(10, False)
            await self.settle()
        self.plugin.play_tracks.assert_not_called()
        self.plugin.control_playback.assert_awaited_with("pause")

    async def test_connect_wakeup_on_failure(self):
        self.mgr.save_profile(10, {"playlists": [{"uri": PL_A}], "always_auto_start": True})
        self.plugin.play_tracks = AsyncMock(side_effect=[{"ok": False, "error": "No device"}, {"ok": True}])
        with patch.object(self.mgr, "get_player_state", AsyncMock(return_value=snap(playing=False))):
            await self.mgr.handle_app_lifecycle(10, True)
            await self.settle()
        self.plugin._auto_transfer_and_play.assert_awaited_once()
        self.assertEqual(self.plugin.play_tracks.await_count, 2)

    async def test_volume_override_applied_and_reverted(self):
        self.mgr.save_profile(10, {"playlists": [{"uri": PL_A}], "always_auto_start": True, "volume_override": 33})
        with patch.object(self.mgr, "get_player_state", AsyncMock(return_value=snap(vol=70))):
            await self.mgr.handle_app_lifecycle(10, True)
            await self.settle()
            self.plugin.set_volume.assert_awaited_with(33)
            await self.mgr.handle_app_lifecycle(10, False)
            await self.settle()
        self.plugin.set_volume.assert_awaited_with(70)


class TestUnbound(SoundtrackBase):
    async def test_keep_playing_noop(self):
        with patch.object(self.mgr, "get_player_state", AsyncMock(return_value=snap())):
            await self.mgr.handle_app_lifecycle(99, True)
            await self.settle()
            await self.mgr.handle_app_lifecycle(99, False)
            await self.settle()
        self.plugin.play_tracks.assert_not_called()
        self.plugin.control_playback.assert_not_called()

    async def test_pause_policy_pauses_and_restores(self):
        self.plugin._settings["soundtrack_unbound_policy"] = "pause"
        with patch.object(self.mgr, "get_player_state", AsyncMock(return_value=snap())):
            await self.mgr.handle_app_lifecycle(99, True)
            await self.settle()
            self.plugin.control_playback.assert_awaited_with("pause")
            await self.mgr.handle_app_lifecycle(99, False)
            await self.settle()
        self.plugin.play_tracks.assert_awaited()
        self.assertEqual(self.plugin.play_tracks.await_args.kwargs["context_uri"], "spotify:playlist:pre")

    async def test_default_playlist_fallback(self):
        self.plugin._settings["soundtrack_default_playlist"] = PL_C
        with patch.object(self.mgr, "get_player_state", AsyncMock(return_value=snap(playing=False))):
            await self.mgr.handle_app_lifecycle(99, True)
            await self.settle()
        self.assertEqual(self.plugin.play_tracks.await_args.kwargs["context_uri"], PL_C)

    def test_ducking_override(self):
        self.mgr.save_profile(5, {"ducking_override": False})
        self.assertIs(self.mgr.ducking_override(5), False)
        self.assertIsNone(self.mgr.ducking_override(6))


class TestBindAndCancel(SoundtrackBase):
    async def test_bind_current_music(self):
        with patch.object(self.mgr, "get_player_state", AsyncMock(return_value=snap(ctx=PL_B))):
            res = await self.mgr.bind_current_music_to_game(12, "Game")
        self.assertTrue(res["ok"])
        self.assertEqual(self.mgr.get_profile(12)["playlists"][0]["uri"], PL_B)
        with patch.object(self.mgr, "get_player_state", AsyncMock(return_value=None)):
            self.assertFalse((await self.mgr.bind_current_music_to_game(12))["ok"])
        self.assertFalse((await self.mgr.bind_current_music_to_game(-1))["ok"])

    async def test_cancel_all(self):
        self.mgr.save_profile(10, {"playlists": [{"uri": PL_A}], "always_auto_start": True})
        with patch.object(self.mgr, "get_player_state", AsyncMock(return_value=snap(playing=False))):
            await self.mgr.handle_app_lifecycle(10, True)
        self.mgr.cancel_all()
        await self.settle()
        self.plugin.play_tracks.assert_not_called()


class TestSettingsSanitize(unittest.TestCase):
    def test_load_settings_bounds(self):
        import json
        import os
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "s.json")
            with open(path, "w") as f:
                json.dump({"soundtrack_launch_debounce": 99, "soundtrack_exit_debounce": "x",
                           "soundtrack_unbound_policy": "boom", "soundtrack_default_mode": 3}, f)
            s = common._load_settings(path)
        self.assertEqual(s["soundtrack_launch_debounce"], 10.0)
        self.assertEqual(s["soundtrack_exit_debounce"], 3.0)
        self.assertEqual(s["soundtrack_unbound_policy"], "keep_playing")
        self.assertEqual(s["soundtrack_default_mode"], "remember_position")


class TestPluginRpc(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        from test_token_refresh import main
        self.main = main
        self.plugin = main.Plugin()
        self.plugin._settings = dict(main.DEFAULT_SETTINGS)
        self.plugin._settings["game_audio_profiles"] = {}
        self.enterContext(patch.object(main, "_save_settings"))
        self.enterContext(patch.object(main.decky, "emit", new_callable=AsyncMock))

    async def test_save_get_delete_via_rpc(self):
        res = await self.plugin.save_game_soundtrack_profile("123", {"playlists": [{"uri": PL_A}]})
        self.assertTrue(res["ok"])
        self.assertIn("123", await self.plugin.get_game_soundtrack_profiles())
        self.assertTrue((await self.plugin.delete_game_soundtrack_profile(123))["ok"])
        self.assertEqual(await self.plugin.get_game_soundtrack_profiles(), {})

    async def test_rejects_bad_app_ids(self):
        for bad in (-1, 0, "x", None, 2 ** 40):
            self.assertFalse((await self.plugin.save_game_soundtrack_profile(bad, {}))["ok"])
            self.assertFalse((await self.plugin.handle_app_lifetime_event(bad, True))["ok"])
            self.assertFalse((await self.plugin.delete_game_soundtrack_profile(bad))["ok"])
            self.assertFalse((await self.plugin.bind_current_music_to_game(bad))["ok"])

    async def test_lifecycle_event_routes_and_ducks(self):
        mgr = self.plugin._get_soundtrack_manager()
        mgr.handle_app_lifecycle = AsyncMock()
        self.plugin.trigger_ducking = AsyncMock(return_value={"ok": True})
        res = await self.plugin.handle_app_lifetime_event("77", 1)
        self.assertEqual(res, {"ok": True, "app_id": 77, "running": True})
        mgr.handle_app_lifecycle.assert_awaited_once_with(77, True)
        self.plugin.trigger_ducking.assert_awaited_once_with(True, "game", 77)

    async def test_ducking_override_false_skips_duck(self):
        mgr = self.plugin._get_soundtrack_manager()
        mgr.save_profile(77, {"ducking_override": False})
        mgr.handle_app_lifecycle = AsyncMock()
        self.plugin.trigger_ducking = AsyncMock()
        await self.plugin.handle_app_lifetime_event(77, True)
        self.plugin.trigger_ducking.assert_not_called()

    async def test_manual_pause_hooked_in_control_playback(self):
        mgr = self.plugin._get_soundtrack_manager()
        mgr._active_game_app_id = 5
        with patch.object(self.main.rpc_playback, "control_playback", AsyncMock(return_value={"ok": True})):
            await self.plugin.control_playback("pause")
        self.assertTrue(mgr._user_paused_in_game)

    async def test_play_tracks_sends_position_ms(self):
        self.plugin._access_token = "t"
        self.plugin._token_expires_at = 9999999999
        self.plugin._token_refresh_lock = asyncio.Lock()
        with patch.object(self.main, "_exec", new_callable=AsyncMock) as ex:
            await self.plugin.play_tracks(context_uri=PL_A, offset_uri="spotify:track:x", position_ms=12345)
        body = ex.await_args.args[-1]
        self.assertEqual(body["position_ms"], 12345)
        self.assertEqual(body["offset"], {"uri": "spotify:track:x"})
        with patch.object(self.main, "_exec", new_callable=AsyncMock) as ex:
            await self.plugin.play_tracks(context_uri=PL_A)
        self.assertNotIn("position_ms", ex.await_args.args[-1])


    async def test_get_playlists_and_search_include_uri(self):
        from py_modules import rpc_library

        fake_plugin = MagicMock()
        fake_plugin._ensure_token = AsyncMock(return_value="tok")
        fake_plugin._annotate_tracks_liked = AsyncMock()

        playlists_resp = {
            "items": [
                {"id": "pl1", "name": "With URI", "uri": "spotify:playlist:pl1", "images": [], "tracks": {"total": 5}, "owner": {"id": "u1"}},
                {"id": "pl2", "name": "Without URI", "images": [], "tracks": {"total": 3}, "owner": {"id": "u1"}},
            ],
            "total": 2,
        }
        with patch("py_modules.rpc_library._spotify_api_request", return_value=playlists_resp):
            res = await rpc_library.get_playlists(fake_plugin, offset=0)
        self.assertTrue(res["ok"])
        self.assertEqual(res["playlists"][0]["uri"], "spotify:playlist:pl1")
        self.assertEqual(res["playlists"][1]["uri"], "spotify:playlist:pl2")

        search_resp = {
            "tracks": {"items": []},
            "artists": {"items": []},
            "albums": {"items": []},
            "playlists": {
                "items": [
                    {"id": "sp1", "name": "Search PL", "images": [], "tracks": {"total": 8}, "owner": {"id": "u2"}},
                ]
            },
        }
        with patch("py_modules.rpc_library._spotify_api_request", return_value=search_resp):
            sres = await rpc_library.search_spotify(fake_plugin, "synthwave", "playlist", 20)
        self.assertTrue(sres["ok"])
        self.assertEqual(sres["playlists"][0]["uri"], "spotify:playlist:sp1")

    async def test_bind_current_music_appends_and_resolves_name(self):
        mgr = self.plugin._get_soundtrack_manager()
        mgr.save_profile(1245620, {
            "app_name": "Elden Ring",
            "playlists": [{"uri": "spotify:playlist:existing", "name": "Existing", "image": ""}],
            "mode": "rotation",
        })
        mgr.get_player_state = AsyncMock(return_value={
            "is_playing": True,
            "context_uri": "spotify:playlist:new123",
            "track_uri": "spotify:track:t1",
            "position_ms": 1000,
            "volume": 80,
        })
        self.plugin._ensure_token = AsyncMock(return_value="tok")
        mock_api = lambda *a, **kw: {
            "name": "Boss Music",
            "images": [{"url": "https://i.scdn.co/image/boss"}],
        }
        with patch.dict(mgr._resolve_context_metadata.__globals__, {"_spotify_api_request": mock_api}):
            res = await mgr.bind_current_music_to_game(1245620, "Elden Ring")
        self.assertTrue(res["ok"])
        pls = res["profile"]["playlists"]
        self.assertEqual(len(pls), 2)
        self.assertEqual(pls[0]["uri"], "spotify:playlist:existing")
        self.assertEqual(pls[1], {
            "uri": "spotify:playlist:new123",
            "name": "Boss Music",
            "image": "",
        })
        self.assertEqual(res["profile"]["mode"], "rotation")


if __name__ == "__main__":
    unittest.main()
