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
    fader = SimpleNamespace(
        _sleep_locked=False,
        _cached_sink_input_id="99",
        _game_override=None,
        _duck_reasons=set(),
        apply_game_override=AsyncMock(),
        clear_game_override=AsyncMock(),
    )
    eq_mgr = SimpleNamespace(
        apply_ephemeral_preset=AsyncMock(return_value={"ok": True}),
        clear_ephemeral_override=AsyncMock(return_value={"ok": True}),
    )
    return SimpleNamespace(
        _settings=settings,
        _ensure_token=AsyncMock(return_value="tok"),
        _auto_transfer_and_play=AsyncMock(return_value={"ok": True}),
        _save_settings=MagicMock(),
        _volume_fader=fader,
        _equalizer_manager=eq_mgr,
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
            self.plugin._volume_fader.apply_game_override.assert_awaited_once_with(
                active_duck=True,
                volume_override=33,
                ducking_override=None,
                ducking_level_override=None,
            )
            self.plugin.set_volume.assert_not_called()
            await self.mgr.handle_app_lifecycle(10, False)
            await self.settle()
        self.plugin._volume_fader.clear_game_override.assert_awaited_once()
        self.plugin.set_volume.assert_not_called()


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
        # D-10: no immediate t=0 trigger_ducking; ducking is sequenced post-debounce in _run_launch
        self.plugin.trigger_ducking.assert_not_called()

    async def test_ducking_override_false_skips_duck(self):
        mgr = self.plugin._get_soundtrack_manager()
        mgr.save_profile(77, {"ducking_override": False})
        mgr.handle_app_lifecycle = AsyncMock()
        self.plugin.trigger_ducking = AsyncMock()
        res = await self.plugin.handle_app_lifetime_event(77, True)
        self.assertEqual(res, {"ok": True, "app_id": 77, "running": True})
        mgr.handle_app_lifecycle.assert_awaited_once_with(77, True)
        self.plugin.trigger_ducking.assert_not_called()

    async def test_lifecycle_exit_does_not_immediately_unduck(self):
        mgr = self.plugin._get_soundtrack_manager()
        mgr.handle_app_lifecycle = AsyncMock()
        self.plugin.trigger_ducking = AsyncMock(return_value={"ok": True})
        res = await self.plugin.handle_app_lifetime_event(77, False)
        self.assertEqual(res, {"ok": True, "app_id": 77, "running": False})
        mgr.handle_app_lifecycle.assert_awaited_once_with(77, False)
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

    async def test_save_and_delete_profile_refresh_active_overrides(self):
        mgr = self.plugin._get_soundtrack_manager()
        mgr.refresh_active_overrides = AsyncMock()

        # Inactive game -> does not call refresh_active_overrides
        mgr._active_game_app_id = None
        res_inactive = await self.plugin.save_game_soundtrack_profile(77, {"eq_preset": "gaming"})
        self.assertTrue(res_inactive["ok"])
        mgr.refresh_active_overrides.assert_not_awaited()

        # Active game -> save and delete both immediately refresh active overrides
        mgr._active_game_app_id = 77
        res_save = await self.plugin.save_game_soundtrack_profile(77, {"eq_preset": "bass", "volume_override": 60})
        self.assertTrue(res_save["ok"])
        mgr.refresh_active_overrides.assert_awaited_once_with(77)

        mgr.refresh_active_overrides.reset_mock()
        res_del_other = await self.plugin.delete_game_soundtrack_profile(88)
        self.assertTrue(res_del_other["ok"])
        mgr.refresh_active_overrides.assert_not_awaited()

        res_del = await self.plugin.delete_game_soundtrack_profile(77)
        self.assertTrue(res_del["ok"])
        mgr.refresh_active_overrides.assert_awaited_once_with(77)

    async def test_save_profile_clears_stale_eq_preview_when_not_active_or_failed(self):
        from py_modules import equalizer

        eq_mgr = equalizer.EqualizerManager(self.plugin)
        eq_mgr._preview_active = True
        eq_mgr.clear_preview = AsyncMock(return_value={"ok": True, "restored": True})
        self.plugin._equalizer_manager = eq_mgr
        mgr = self.plugin._get_soundtrack_manager()

        # 1. Game exited mid-edit (_active_game_app_id is None) while _preview_active is True -> clears preview
        mgr._active_game_app_id = None
        res = await self.plugin.save_game_soundtrack_profile(77, {"eq_preset": "custom", "eq_custom_bands": [2.0] * 10})
        self.assertTrue(res["ok"])
        eq_mgr.clear_preview.assert_awaited_once()

        # 2. Invalid app_id while _preview_active is True -> clears preview before returning error
        eq_mgr.clear_preview.reset_mock()
        bad_res = await self.plugin.save_game_soundtrack_profile(-1, {"eq_preset": "bass"})
        self.assertFalse(bad_res["ok"])
        eq_mgr.clear_preview.assert_awaited_once()

        # 3. Active settled game: refresh_active_overrides clears _preview_active -> no duplicate clear_preview
        eq_mgr.clear_preview.reset_mock()
        mgr._active_game_app_id = 77

        async def fake_refresh(_app_id):
            eq_mgr._preview_active = False

        mgr.refresh_active_overrides = AsyncMock(side_effect=fake_refresh)
        res_active = await self.plugin.save_game_soundtrack_profile(77, {"eq_preset": "gaming"})
        self.assertTrue(res_active["ok"])
        mgr.refresh_active_overrides.assert_awaited_once_with(77)
        eq_mgr.clear_preview.assert_not_awaited()

    async def test_trigger_ducking_exit_skips_when_exit_debounce_pending(self):
        mgr = self.plugin._get_soundtrack_manager()
        mgr._exit_task = asyncio.create_task(asyncio.sleep(1.0))
        try:
            self.plugin._volume_fader._duck_reasons.add("game")
            self.plugin._volume_fader._game_override = {"volume_override": 60, "ducking_level_override": None}
            res = await self.plugin.trigger_ducking(False, "game")
            self.assertTrue(res["ok"])
            self.assertEqual(res["skipped"], "exit_debounce_pending")
            self.assertTrue(res["is_ducked"])
            self.assertTrue(res["has_game_override"])
            self.assertIn("game", self.plugin._volume_fader._duck_reasons)

            # Voice release is NOT blocked by game exit debounce
            self.plugin._volume_fader._duck_reasons.add("voice")
            with patch.object(self.plugin._volume_fader, "set_ducking", new_callable=AsyncMock) as mock_set_duck:
                res_voice = await self.plugin.trigger_ducking(False, "voice")
            self.assertTrue(res_voice["ok"])
            self.assertNotIn("skipped", res_voice)
            mock_set_duck.assert_awaited_once_with(False, reason="voice")
        finally:
            mgr._exit_task.cancel()
            try:
                await mgr._exit_task
            except asyncio.CancelledError:
                pass

    async def test_status_and_ducking_state_expose_game_override_and_hide_snapshot(self):
        from py_modules import equalizer

        self.plugin._settings["active_game_override_snapshot"] = {"app_id": 1091500, "eq_preset": "gaming"}
        eq_mgr = equalizer.EqualizerManager(self.plugin)
        eq_mgr._ephemeral_preset = "gaming"
        eq_mgr._ephemeral_app_id = 1091500
        eq_mgr._ephemeral_app_name = "Cyberpunk 2077"
        self.plugin._equalizer_manager = eq_mgr
        self.plugin._soundtrack_manager._active_game_app_id = 1091500
        self.plugin._volume_fader._game_override = {
            "volume_override": 70,
            "ducking_override": None,
            "ducking_level_override": None,
        }

        status = await self.plugin.get_status()
        self.assertNotIn("active_game_override_snapshot", status["settings"])
        self.assertEqual(status["active_game_app_id"], 1091500)
        self.assertEqual(
            status["active_game_override"],
            {"app_id": 1091500, "app_name": "Cyberpunk 2077", "eq_preset": "gaming"},
        )
        dstate = await self.plugin.get_ducking_state()
        self.assertTrue(dstate["has_game_override"])

        # Inactive state
        eq_mgr._ephemeral_preset = None
        self.plugin._soundtrack_manager._active_game_app_id = None
        self.plugin._volume_fader._game_override = None
        status_idle = await self.plugin.get_status()
        self.assertIsNone(status_idle["active_game_app_id"])
        self.assertIsNone(status_idle["active_game_override"])
        dstate_idle = await self.plugin.get_ducking_state()
        self.assertFalse(dstate_idle["has_game_override"])

    async def test_set_setting_rejects_active_game_override_snapshot(self):
        res = await self.plugin.set_setting("active_game_override_snapshot", {"app_id": 999})
        self.assertFalse(res["ok"])
        self.assertIn("managed internally", res["error"])
        self.assertIsNone(self.plugin._settings.get("active_game_override_snapshot"))

    async def test_set_setting_strips_internal_keys_from_event_and_response(self):
        self.plugin._settings.update({
            "active_game_override_snapshot": {"app_id": 1091500, "eq_preset": "gaming"},
            "access_token": "secret-access",
            "refresh_token": "secret-refresh",
            "token_expires_at": 9999999999,
        })
        with patch.object(self.main, "_save_settings"), \
             patch.object(self.main.decky, "emit", new_callable=AsyncMock) as mock_emit:
            res = await self.plugin.set_setting("toast_enabled", False)

        self.assertTrue(res["ok"])
        self.assertIs(res["settings"]["toast_enabled"], False)
        mock_emit.assert_awaited_once()
        event_name, emitted_settings = mock_emit.await_args[0]
        self.assertEqual(event_name, "settings_changed")
        self.assertIs(emitted_settings["toast_enabled"], False)
        for internal_key in (
            "active_game_override_snapshot",
            "access_token",
            "refresh_token",
            "token_expires_at",
        ):
            self.assertNotIn(internal_key, res["settings"])
            self.assertNotIn(internal_key, emitted_settings)
            self.assertIn(internal_key, self.plugin._settings)

    async def test_main_boot_crash_recovery_flat_running_and_sleep_locked(self):
        # 1. Stale snapshot + initial_eq == "flat" -> cleans stale PID, clears snapshot, tears down EQ, fades to baseline
        flat_settings = {
            **self.main.DEFAULT_SETTINGS,
            "eq_preset": "flat",
            "active_game_override_snapshot": {"app_id": 1091500, "eq_preset": "gaming"},
        }
        with patch.object(self.main, "_load_settings", return_value=flat_settings), \
             patch.object(self.main, "_exec", new_callable=AsyncMock), \
             patch.object(self.main, "SuspendResumeMonitor"), \
             patch.object(self.main.volume.VoiceActivityDetector, "start"), \
             patch.object(self.main.dock.DockAudioSwitcher, "start"), \
             patch.object(self.main.dock.DockAudioSwitcher, "evaluate_now", new_callable=AsyncMock), \
             patch.object(self.main.resilience.LibrespotEventServer, "start", new_callable=AsyncMock), \
             patch.object(self.main.mpris.MprisBridge, "start", new_callable=AsyncMock), \
             patch.object(self.plugin, "_sync_native_spotify_folders", new_callable=AsyncMock), \
             patch.object(self.plugin, "start_librespot", new_callable=AsyncMock), \
             patch.object(self.main.equalizer.EqualizerManager, "cleanup_stale_process", new_callable=AsyncMock) as m_clean, \
             patch.object(self.main.equalizer.EqualizerManager, "apply_preset", new_callable=AsyncMock, return_value={"ok": True}) as m_apply, \
             patch.object(self.main.volume.VolumeFader, "fade_to", new_callable=AsyncMock) as m_fade:
            await self.plugin._main()
            m_clean.assert_awaited_once()
            m_apply.assert_awaited_once_with("flat")
            self.assertIsNone(self.plugin._settings["active_game_override_snapshot"])
            m_fade.assert_awaited_once_with(100.0, 0.0)
            self.assertEqual(self.plugin._volume_fader._duck_reasons, set())
            self.assertIsNone(self.plugin._volume_fader._game_override)

        # 2. Same app_id already reported running during startup -> skips crash recovery
        running_settings = {
            **self.main.DEFAULT_SETTINGS,
            "eq_preset": "flat",
            "active_game_override_snapshot": {"app_id": 1091500, "eq_preset": "gaming"},
        }

        async def mark_running():
            self.plugin._soundtrack_manager._active_game_app_id = 1091500

        with patch.object(self.main, "_load_settings", return_value=running_settings), \
             patch.object(self.main, "_exec", new_callable=AsyncMock), \
             patch.object(self.main, "SuspendResumeMonitor"), \
             patch.object(self.main.volume.VoiceActivityDetector, "start"), \
             patch.object(self.main.dock.DockAudioSwitcher, "start"), \
             patch.object(self.main.dock.DockAudioSwitcher, "evaluate_now", new_callable=AsyncMock), \
             patch.object(self.main.resilience.LibrespotEventServer, "start", new_callable=AsyncMock), \
             patch.object(self.main.mpris.MprisBridge, "start", new_callable=AsyncMock), \
             patch.object(self.plugin, "_sync_native_spotify_folders", new_callable=AsyncMock), \
             patch.object(self.plugin, "start_librespot", side_effect=mark_running), \
             patch.object(self.main.equalizer.EqualizerManager, "cleanup_stale_process", new_callable=AsyncMock), \
             patch.object(self.main.equalizer.EqualizerManager, "apply_preset", new_callable=AsyncMock, return_value={"ok": True}) as m_apply, \
             patch.object(self.main.volume.VolumeFader, "fade_to", new_callable=AsyncMock) as m_fade:
            await self.plugin._main()
            self.assertEqual(self.plugin._settings["active_game_override_snapshot"], {"app_id": 1091500, "eq_preset": "gaming"})
            m_apply.assert_not_awaited()
            m_fade.assert_not_awaited()

        # 3. _sleep_locked True -> restores EQ and clears snapshot, but skips VolumeFader fade_to / un-duck
        sleep_settings = {
            **self.main.DEFAULT_SETTINGS,
            "eq_preset": "bass",
            "active_game_override_snapshot": {"app_id": 1091500, "eq_preset": "gaming"},
        }

        async def lock_sleep():
            self.plugin._volume_fader._sleep_locked = True
            self.plugin._volume_fader._duck_reasons.add("game")

        with patch.object(self.main, "_load_settings", return_value=sleep_settings), \
             patch.object(self.main, "_exec", new_callable=AsyncMock), \
             patch.object(self.main, "SuspendResumeMonitor"), \
             patch.object(self.main.volume.VoiceActivityDetector, "start"), \
             patch.object(self.main.dock.DockAudioSwitcher, "start"), \
             patch.object(self.main.dock.DockAudioSwitcher, "evaluate_now", new_callable=AsyncMock), \
             patch.object(self.main.resilience.LibrespotEventServer, "start", new_callable=AsyncMock), \
             patch.object(self.main.mpris.MprisBridge, "start", new_callable=AsyncMock), \
             patch.object(self.plugin, "_sync_native_spotify_folders", new_callable=AsyncMock), \
             patch.object(self.plugin, "start_librespot", side_effect=lock_sleep), \
             patch.object(self.main.equalizer.EqualizerManager, "cleanup_stale_process", new_callable=AsyncMock), \
             patch.object(self.main.equalizer.EqualizerManager, "apply_preset", new_callable=AsyncMock, return_value={"ok": True}) as m_apply, \
             patch.object(self.main.volume.VolumeFader, "fade_to", new_callable=AsyncMock) as m_fade:
            await self.plugin._main()
            self.assertIsNone(self.plugin._settings["active_game_override_snapshot"])
            m_apply.assert_awaited_once_with("bass")
            m_fade.assert_not_awaited()
            self.assertIn("game", self.plugin._volume_fader._duck_reasons)


class TestPerGameAudioProfiles(SoundtrackBase):
    def test_sanitize_profile_phase19_fields_and_boundaries(self):
        self.mgr.save_profile(50, {
            "eq_preset": "GAMING",
            "eq_custom_bands": [15.0, -15.0, 1.236, float("nan"), True, "bad"],
            "ducking_level_override": 99,
            "volume_override": True,
        })
        p = self.mgr.get_profile(50)
        self.assertEqual(p["eq_preset"], "gaming")
        self.assertEqual(p["eq_custom_bands"][:6], [12.0, -12.0, 1.24, 0.0, 0.0, 0.0])
        self.assertEqual(p["ducking_level_override"], 95)
        self.assertIsNone(p["volume_override"])

        # "global" -> None, invalid preset -> None, bool ducking_level_override -> None, -5 -> 0
        self.mgr.save_profile(50, {
            "eq_preset": "global",
            "eq_custom_bands": "not-a-list",
            "ducking_level_override": True,
            "volume_override": -1,
        })
        p2 = self.mgr.get_profile(50)
        self.assertIsNone(p2["eq_preset"])
        self.assertIsNone(p2["eq_custom_bands"])
        self.assertIsNone(p2["ducking_level_override"])
        self.assertEqual(p2["volume_override"], 0)

        self.mgr.save_profile(50, {"eq_preset": "bogus", "ducking_level_override": -5})
        p3 = self.mgr.get_profile(50)
        self.assertIsNone(p3["eq_preset"])
        self.assertEqual(p3["ducking_level_override"], 0)

    async def test_audio_only_profile_and_prompt_switch_apply_overrides(self):
        # 0-playlist audio-only profile while music is already playing -> applies EQ & volume, zero prompt_switch
        self.mgr.save_profile(101, {
            "app_name": "Hades",
            "playlists": [],
            "eq_preset": "bass",
            "volume_override": 65,
            "ducking_override": False,
        })
        with patch.object(self.mgr, "get_player_state", AsyncMock(return_value=snap(playing=True))), \
             patch.object(soundtrack.decky, "emit", new_callable=AsyncMock) as mock_emit:
            await self.mgr.handle_app_lifecycle(101, True)
            await self.settle()

        self.plugin._equalizer_manager.apply_ephemeral_preset.assert_awaited_once_with(
            "bass", custom_bands=None, app_id=101, app_name="Hades"
        )
        self.plugin._volume_fader.apply_game_override.assert_awaited_once_with(
            active_duck=False,
            volume_override=65,
            ducking_override=False,
            ducking_level_override=None,
        )
        self.plugin.play_tracks.assert_not_called()
        self.plugin.set_volume.assert_not_called()
        prompt_calls = [c for c in mock_emit.await_args_list if c.args and c.args[0] == "soundtrack_prompt_switch"]
        self.assertEqual(prompt_calls, [])

        # Linked playlist with always_auto_start=False while music is playing -> prompt_switch AND audio overrides
        self.plugin._equalizer_manager.apply_ephemeral_preset.reset_mock()
        self.plugin._volume_fader.apply_game_override.reset_mock()
        self.mgr.save_profile(102, {
            "app_name": "Elden Ring",
            "playlists": [{"uri": PL_A, "name": "Epic"}],
            "always_auto_start": False,
            "eq_preset": "gaming",
            "volume_override": 70,
            "ducking_level_override": 40,
        })
        with patch.object(self.mgr, "get_player_state", AsyncMock(return_value=snap(playing=True))), \
             patch.object(soundtrack.decky, "emit", new_callable=AsyncMock) as mock_emit:
            await self.mgr.handle_app_lifecycle(102, True)
            await self.settle()

        self.plugin._equalizer_manager.apply_ephemeral_preset.assert_awaited_once()
        self.plugin._volume_fader.apply_game_override.assert_awaited_once_with(
            active_duck=True,
            volume_override=70,
            ducking_override=None,
            ducking_level_override=40,
        )
        prompt_calls = [c for c in mock_emit.await_args_list if c.args and c.args[0] == "soundtrack_prompt_switch"]
        self.assertEqual(len(prompt_calls), 1)

    async def test_launch_and_exit_sequencing_and_snapshot_persistence(self):
        events: list[str] = []

        async def rec_eq(*args, **kwargs):
            events.append("eq_apply")
            return {"ok": True}

        async def rec_fader(*args, **kwargs):
            self.assertIsNone(self.plugin._volume_fader._cached_sink_input_id)
            events.append("fader_apply")

        async def rec_eq_clear():
            events.append("eq_clear")
            return {"ok": True}

        async def rec_fader_clear():
            self.assertIsNone(self.plugin._volume_fader._cached_sink_input_id)
            events.append("fader_clear")

        self.plugin._equalizer_manager.apply_ephemeral_preset = AsyncMock(side_effect=rec_eq)
        self.plugin._volume_fader.apply_game_override = AsyncMock(side_effect=rec_fader)
        self.plugin._equalizer_manager.clear_ephemeral_override = AsyncMock(side_effect=rec_eq_clear)
        self.plugin._volume_fader.clear_game_override = AsyncMock(side_effect=rec_fader_clear)

        self.mgr.save_profile(200, {
            "app_name": "Portal 2",
            "eq_preset": "vocal",
            "volume_override": 75,
        })
        await self.mgr._run_launch(200)
        self.assertEqual(events, ["eq_apply", "fader_apply"])
        self.assertEqual(self.plugin._settings["active_game_override_snapshot"]["app_id"], 200)

        self.plugin._volume_fader._cached_sink_input_id = "123"
        await self.mgr._run_exit(200)
        self.assertEqual(events, ["eq_apply", "fader_apply", "eq_clear", "fader_clear"])
        self.assertIsNone(self.plugin._settings["active_game_override_snapshot"])

    async def test_back_to_back_game_switch_preserves_pre_game_snapshot(self):
        self.mgr.save_profile(301, {
            "app_name": "Game A",
            "playlists": [{"uri": PL_A}],
            "always_auto_start": True,
            "eq_preset": "bass",
            "volume_override": 60,
        })
        self.mgr.save_profile(302, {
            "app_name": "Game B",
            "playlists": [],
            "eq_preset": None,  # Use Global
            "volume_override": 85,
            "ducking_override": False,
        })

        snap_pre = snap(playing=True, ctx="spotify:playlist:orig", track="spotify:track:orig", pos=12345)
        snap_in_a = snap(playing=True, ctx=PL_A, track="spotify:track:gameA", pos=9000)

        with patch.object(self.mgr, "get_player_state", AsyncMock(side_effect=[snap_pre, snap_in_a])):
            await self.mgr.handle_app_lifecycle(301, True)
            await self.settle()
            self.assertEqual(self.mgr._pre_game_snapshot["track_uri"], "spotify:track:orig")

            # Exit Game A, then immediately launch Game B before exit debounce completes
            await self.mgr.handle_app_lifecycle(301, False)
            await self.mgr.handle_app_lifecycle(302, True)
            await self.settle()

        # Pre-Game-A baseline preserved across Game A -> Game B switch (D-12)
        self.assertEqual(self.mgr._pre_game_snapshot["track_uri"], "spotify:track:orig")
        self.plugin._equalizer_manager.clear_ephemeral_override.assert_awaited()
        self.plugin._volume_fader.apply_game_override.assert_awaited_with(
            active_duck=False,
            volume_override=85,
            ducking_override=False,
            ducking_level_override=None,
        )

    async def test_exit_always_restores_eq_and_volume_on_keep_playing_and_manual_pause(self):
        self.mgr.save_profile(401, {
            "playlists": [{"uri": PL_A}],
            "always_auto_start": True,
            "exit_policy": "keep_playing",
            "eq_preset": "gaming",
            "volume_override": 55,
        })
        with patch.object(self.mgr, "get_player_state", AsyncMock(return_value=snap(playing=True))):
            await self.mgr.handle_app_lifecycle(401, True)
            await self.settle()
            self.mgr.record_manual_pause()
            self.plugin.play_tracks.reset_mock()
            await self.mgr.handle_app_lifecycle(401, False)
            await self.settle()

        self.plugin._equalizer_manager.clear_ephemeral_override.assert_awaited_once()
        self.plugin._volume_fader.clear_game_override.assert_awaited_once()
        self.plugin.play_tracks.assert_not_called()
        self.plugin.control_playback.assert_not_called()

    async def test_sleep_locked_exit_restores_eq_and_clears_snapshot_without_unduck_or_play(self):
        self.mgr.save_profile(501, {
            "app_name": "Skyrim",
            "playlists": [{"uri": PL_A}],
            "always_auto_start": True,
            "exit_policy": "restore_snapshot",
            "eq_preset": "custom",
            "eq_custom_bands": [3.0] * 10,
            "volume_override": 65,
        })
        with patch.object(self.mgr, "get_player_state", AsyncMock(return_value=snap(playing=True))):
            await self.mgr.handle_app_lifecycle(501, True)
            await self.settle()
            self.assertIsNotNone(self.plugin._settings["active_game_override_snapshot"])

            self.plugin.play_tracks.reset_mock()
            self.plugin.control_playback.reset_mock()
            self.plugin._volume_fader._sleep_locked = True
            self.plugin._volume_fader._game_override = {"volume_override": 65}
            self.plugin._volume_fader._duck_reasons = {"game"}

            await self.mgr.handle_app_lifecycle(501, False)
            await self.settle()

        self.plugin._equalizer_manager.clear_ephemeral_override.assert_awaited_once()
        self.assertIsNone(self.plugin._settings["active_game_override_snapshot"])
        self.plugin._volume_fader.clear_game_override.assert_not_called()
        self.assertIsNone(self.plugin._volume_fader._game_override)
        self.assertNotIn("game", self.plugin._volume_fader._duck_reasons)
        self.plugin.play_tracks.assert_not_called()
        self.plugin.control_playback.assert_not_called()

    async def test_refresh_active_overrides_hot_applies_only_when_active_and_settled(self):
        self.mgr.save_profile(601, {"app_name": "Hollow Knight", "eq_preset": "bass", "volume_override": 70})
        # Not active -> no-op
        await self.mgr.refresh_active_overrides(601)
        self.plugin._equalizer_manager.apply_ephemeral_preset.assert_not_called()

        # Active and settled -> hot-applies
        self.mgr._active_game_app_id = 601
        await self.mgr.refresh_active_overrides(601)
        self.plugin._equalizer_manager.apply_ephemeral_preset.assert_awaited_once_with(
            "bass", custom_bands=None, app_id=601, app_name="Hollow Knight"
        )
        self.plugin._volume_fader.apply_game_override.assert_awaited_once()

    def test_resolve_app_name_fallback_and_exception_safety(self):
        with patch.object(
            soundtrack.vdf_parser,
            "get_installed_games",
            return_value=[{"app_id": 2429414104, "name": "PCSX2"}],
        ):
            self.assertEqual(self.mgr._resolve_app_name(2429414104, {"app_name": ""}), "PCSX2")
            self.assertEqual(self.mgr._resolve_app_name(2429414104, {"app_name": "Explicit"}), "Explicit")

        # Falls back to persisted profile before vdf_parser
        self.plugin._settings["game_audio_profiles"]["77"] = {"app_id": 77, "app_name": "Persisted Title"}
        with patch.object(soundtrack.vdf_parser, "get_installed_games", side_effect=AssertionError("should not run")):
            self.assertEqual(self.mgr._resolve_app_name(77, {"app_name": ""}), "Persisted Title")

        # Returns "" cleanly if vdf_parser raises
        with patch.object(soundtrack.vdf_parser, "get_installed_games", side_effect=RuntimeError("VDF broken")):
            self.assertEqual(self.mgr._resolve_app_name(999999, {"app_name": ""}), "")

    async def test_save_and_bind_resolve_empty_app_name_including_non_steam_uint32(self):
        non_steam_id = 2429414104
        with patch.object(
            soundtrack.vdf_parser,
            "get_installed_games",
            return_value=[{"app_id": non_steam_id, "name": "PCSX2"}],
        ):
            res_save = self.mgr.save_profile(non_steam_id, {"app_name": "", "eq_preset": "gaming"})
            self.assertTrue(res_save["ok"])
            self.assertEqual(res_save["profile"]["app_name"], "PCSX2")

            # Explicit name overrides fallback; empty bind falls back to existing/vdf_parser
            self.plugin._settings["game_audio_profiles"].pop(str(non_steam_id), None)
            with patch.object(self.mgr, "get_player_state", AsyncMock(return_value=snap(ctx=PL_A))), \
                 patch.object(self.mgr, "_resolve_context_metadata", AsyncMock(return_value=("OST", ""))):
                res_bind = await self.mgr.bind_current_music_to_game(non_steam_id, "")
            self.assertTrue(res_bind["ok"])
            self.assertEqual(res_bind["profile"]["app_name"], "PCSX2")

            # Preserves explicit non-empty name
            res_explicit = self.mgr.save_profile(non_steam_id, {"app_name": "Custom Label"})
            self.assertEqual(res_explicit["profile"]["app_name"], "Custom Label")
            with patch.object(self.mgr, "get_player_state", AsyncMock(return_value=snap(ctx=PL_B))), \
                 patch.object(self.mgr, "_resolve_context_metadata", AsyncMock(return_value=("OST2", ""))):
                res_bind_keep = await self.mgr.bind_current_music_to_game(non_steam_id, "")
            self.assertEqual(res_bind_keep["profile"]["app_name"], "Custom Label")

    async def test_apply_active_audio_profile_self_heals_legacy_empty_app_name(self):
        non_steam_id = 2429414104
        legacy_profile = {
            "app_id": non_steam_id,
            "app_name": "",
            "playlists": [{"uri": PL_A, "name": "Arcade"}],
            "always_auto_start": False,
            "eq_preset": "gaming",
            "volume_override": 75,
        }
        self.plugin._settings["game_audio_profiles"][str(non_steam_id)] = legacy_profile
        self.plugin._save_settings.reset_mock()

        with patch.object(
            soundtrack.vdf_parser,
            "get_installed_games",
            return_value=[{"app_id": non_steam_id, "name": "PCSX2"}],
        ), patch.object(soundtrack.decky, "emit", new_callable=AsyncMock) as mock_emit, \
           patch.object(self.mgr, "get_player_state", AsyncMock(return_value=snap(playing=True))):
            await self.mgr.handle_app_lifecycle(non_steam_id, True)
            await self.settle()

        self.assertEqual(legacy_profile["app_name"], "PCSX2")
        self.plugin._save_settings.assert_called()
        self.plugin._equalizer_manager.apply_ephemeral_preset.assert_awaited_once_with(
            "gaming", custom_bands=None, app_id=non_steam_id, app_name="PCSX2"
        )
        self.assertEqual(
            self.plugin._settings["active_game_override_snapshot"]["app_name"],
            "PCSX2",
        )
        mock_emit.assert_any_await("game_audio_override_changed", {
            "active": True,
            "app_id": non_steam_id,
            "app_name": "PCSX2",
            "eq_preset": "gaming",
        })
        mock_emit.assert_any_await("soundtrack_prompt_switch", {
            "app_id": non_steam_id,
            "app_name": "PCSX2",
        })

    async def test_resolve_app_name_sanitizes_bounds_whitespace_and_bool_app_id(self):
        long_title = "X" * 250
        vdf_long = "  " + ("V" * 240)
        with patch.object(
            soundtrack.vdf_parser,
            "get_installed_games",
            return_value=[
                {"app_id": True, "name": "Bool Spoof"},
                {"app_id": 1, "name": vdf_long},
            ],
        ):
            # Whitespace-only app_name triggers fallback, skips bool app_id==True for app_id=1, and bounds to MAX_STR (200)
            res_ws = self.mgr.save_profile(1, {"app_name": "   \t\n  "})
            self.assertTrue(res_ws["ok"])
            self.assertLessEqual(len(res_ws["profile"]["app_name"]), soundtrack.MAX_STR)
            self.assertEqual(res_ws["profile"]["app_name"], vdf_long[:soundtrack.MAX_STR].strip())

            # Explicit oversized app_name in save_profile and bind_current_music_to_game is bounded to MAX_STR
            res_long = self.mgr.save_profile(1, {"app_name": long_title})
            self.assertEqual(len(res_long["profile"]["app_name"]), soundtrack.MAX_STR)
            self.assertEqual(res_long["profile"]["app_name"], "X" * soundtrack.MAX_STR)

            self.plugin._settings["game_audio_profiles"].pop("1", None)
            with patch.object(self.mgr, "get_player_state", AsyncMock(return_value=snap(ctx=PL_A))), \
                 patch.object(self.mgr, "_resolve_context_metadata", AsyncMock(return_value=("OST", ""))):
                res_bind_ws = await self.mgr.bind_current_music_to_game(1, "   ")
                self.assertEqual(res_bind_ws["profile"]["app_name"], vdf_long[:soundtrack.MAX_STR].strip())

                res_bind_long = await self.mgr.bind_current_music_to_game(1, "B" * 250)
                self.assertEqual(len(res_bind_long["profile"]["app_name"]), soundtrack.MAX_STR)
                self.assertEqual(res_bind_long["profile"]["app_name"], "B" * soundtrack.MAX_STR)


if __name__ == "__main__":
    unittest.main()
