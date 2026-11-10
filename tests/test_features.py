import asyncio
import tempfile
import unittest
from unittest.mock import AsyncMock, MagicMock, Mock, patch

from test_token_refresh import main


class DeckifyFeatureTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.plugin = main.Plugin()
        self.plugin._token_refresh_lock = asyncio.Lock()
        self.plugin._access_token = "valid-token"
        self.plugin._refresh_token = "valid-refresh"
        self.plugin._token_expires_at = 9999999999
        self.plugin._settings = dict(main.DEFAULT_SETTINGS)
        self.execute = self.enterContext(patch.object(main, "_exec", new_callable=AsyncMock))
        self.save = self.enterContext(patch.object(main, "_save_settings"))
        self.emit = self.enterContext(patch.object(main.decky, "emit", new_callable=AsyncMock))

    async def test_seek_playback_clamps_and_updates_last_event(self):
        self.plugin._last_event = {"event": "playing", "position_ms": 1000}
        res = await self.plugin.seek_playback(45000, "dev-1")
        self.assertTrue(res["ok"])
        self.assertEqual(res["position_ms"], 45000)
        self.assertEqual(self.plugin._last_event["position_ms"], 45000)
        self.execute.assert_awaited_once_with(
            main._spotify_api_request,
            "me/player/seek",
            "valid-token",
            "PUT",
            {"position_ms": 45000, "device_id": "dev-1"},
        )

    async def test_shuffle_and_repeat_emit_playback_modes(self):
        res_shuf = await self.plugin.set_shuffle(True)
        self.assertTrue(res_shuf["ok"])
        self.assertTrue(self.plugin._shuffle_state)

        res_rep = await self.plugin.set_repeat("track")
        self.assertTrue(res_rep["ok"])
        self.assertEqual(self.plugin._repeat_state, "track")

        bad_rep = await self.plugin.set_repeat("invalid")
        self.assertFalse(bad_rep["ok"])

    async def test_toggle_like_updates_current_track_metadata(self):
        self.plugin._poll_track_id = "track-123"
        self.plugin._is_liked = False
        self.plugin._track_meta = {"track_id": "track-123", "name": "Test Song", "is_liked": False}

        res = await self.plugin.toggle_like_track("track-123", True)
        self.assertTrue(res["ok"])
        self.assertTrue(res["is_liked"])
        self.assertTrue(self.plugin._is_liked)
        self.assertTrue(self.plugin._track_meta["is_liked"])
        self.execute.assert_awaited_once_with(
            main._spotify_api_request,
            "me/tracks",
            "valid-token",
            "PUT",
            {"ids": "track-123"},
        )

    async def test_lossless_only_allowed_for_spotify_client_and_clean_backend_switching(self):
        # 1. With librespot active, lossless must be rejected
        self.plugin._settings["audio_backend"] = "librespot"
        res_reject = await self.plugin.set_setting("audio_quality", "lossless")
        self.assertFalse(res_reject["ok"])
        self.assertIn("Official Spotify Client", res_reject["error"])

        # 2. Switch to spotify_client -> cleanly stops librespot & starts spotify_client
        with patch.object(self.plugin, "start_spotify_client", new_callable=AsyncMock) as start_sc, \
                patch.object(self.plugin, "start_librespot", new_callable=AsyncMock) as start_ls, \
                patch.object(self.plugin, "_write_spotify_client_prefs"), \
                patch.object(self.plugin, "_configure_pipewire_clock", new_callable=AsyncMock):
            res_switch = await self.plugin.set_setting("audio_backend", "spotify_client")
            self.assertTrue(res_switch["ok"])
            self.assertEqual(self.plugin._settings["audio_backend"], "spotify_client")
            start_sc.assert_awaited_once()

            # 3. Now lossless is allowed!
            res_lossless = await self.plugin.set_setting("audio_quality", "lossless")
            self.assertTrue(res_lossless["ok"])
            self.assertEqual(self.plugin._settings["audio_quality"], "lossless")

            # 4. Switching back to librespot cleanly stops spotify_client and resets quality to 320
            res_back = await self.plugin.set_setting("audio_backend", "librespot")
            self.assertTrue(res_back["ok"])
            self.assertEqual(self.plugin._settings["audio_backend"], "librespot")
            self.assertEqual(self.plugin._settings["audio_quality"], "320")
            self.assertEqual(self.plugin._settings["bitrate"], 320)
            start_ls.assert_awaited_once()

    def test_update_spotify_prefs_content_lossless_and_bitrates(self):
        prefs = 'audio.play_bitrate_enumeration=4\nui.track_notifications_enabled=true\n'
        updated = main._update_spotify_prefs_content(prefs, "lossless", True, True)
        self.assertIn("audio.play_bitrate_enumeration=5", updated)
        self.assertIn("audio.play_bitrate_non_metered_enumeration=5", updated)
        self.assertIn("audio.sync_bitrate_enumeration=5", updated)
        self.assertIn("audio.hifi_upgraded=true", updated)
        self.assertIn("audio.gapless_v2=true", updated)
        self.assertIn("audio.normalize_v2=true", updated)

    def test_parse_pactl_sink_inputs_extracts_sample_rate_and_bit_depth(self):
        sample_output = (
            "Sink Input #142\n"
            "\tDriver: PipeWire\n"
            "\tSample Specification: s24le 2ch 44100Hz\n"
            "\tProperties:\n"
            '\t\tapplication.name = "Spotify"\n'
        )
        info = main._parse_pactl_sink_inputs(sample_output)
        self.assertIsNotNone(info)
        self.assertEqual(info["sample_spec"], "s24le 2ch 44100Hz")
        self.assertEqual(info["format_label"], "24-bit · 44.1 kHz")
        self.assertTrue(info["active"])

    async def test_add_track_to_playlist(self):
        self.execute.return_value = {"snapshot_id": "snap-1"}
        res = await self.plugin.add_track_to_playlist("pl-abc", "3n3Ppam7vgaVa1iaRUc9Lp")
        self.assertTrue(res["ok"])
        self.execute.assert_awaited_once_with(
            main._spotify_api_request,
            "playlists/pl-abc/items",
            "valid-token",
            "POST",
            None,
            {"uris": ["spotify:track:3n3Ppam7vgaVa1iaRUc9Lp"]},
        )

    def test_parse_spotify_rootlist_folders_and_manage_folders(self):
        raw_blob = (
            b"header..."
            b"spotify:start-group:f123:Workout%20Mixes\x00"
            b"spotify:playlist:37i9dQZF1DX76Wlfdnj7AP\x00"
            b"spotify:playlist:37i9dQZF1DX0XUsuxWHRQd\x00"
            b"spotify:end-group:f123\x00"
        )
        parsed = main._parse_spotify_rootlist_folders(raw_blob)
        self.assertEqual(len(parsed), 1)
        self.assertEqual(parsed[0]["name"], "Workout Mixes")
        self.assertEqual(
            parsed[0]["playlist_ids"],
            ["37i9dQZF1DX76Wlfdnj7AP", "37i9dQZF1DX0XUsuxWHRQd"],
        )

    async def test_manage_playlist_folder_crud(self):
        with patch.object(self.plugin, "_sync_native_spotify_folders", return_value=[]):
            res_create = await self.plugin.manage_playlist_folder("create", "", "Chill Vibes", "")
            self.assertTrue(res_create["ok"])
            self.assertEqual(len(res_create["folders"]), 1)
            folder_id = res_create["folders"][0]["id"]

            res_add = await self.plugin.manage_playlist_folder("add_playlist", folder_id, "", "pl-99")
            self.assertTrue(res_add["ok"])
            self.assertIn("pl-99", res_add["folders"][0]["playlist_ids"])

            res_rem = await self.plugin.manage_playlist_folder("remove_playlist", folder_id, "", "pl-99")
            self.assertTrue(res_rem["ok"])
            self.assertNotIn("pl-99", res_rem["folders"][0]["playlist_ids"])

            res_del = await self.plugin.manage_playlist_folder("delete", folder_id, "", "")
            self.assertTrue(res_del["ok"])
            self.assertEqual(len(res_del["folders"]), 0)

    async def test_queue_and_add_to_queue(self):
        self.execute.return_value = {
            "currently_playing": {
                "id": "t1",
                "name": "Current Song",
                "artists": [{"name": "Artist A"}],
                "album": {"name": "Album A", "images": []},
                "uri": "spotify:track:t1",
                "duration_ms": 180000,
            },
            "queue": [
                {
                    "id": "t2",
                    "name": "Next Song",
                    "artists": [{"name": "Artist B"}],
                    "album": {"name": "Album B", "images": []},
                    "uri": "spotify:track:t2",
                    "duration_ms": 200000,
                }
            ],
        }
        q_res = await self.plugin.get_queue()
        self.assertTrue(q_res["ok"])
        self.assertEqual(q_res["currently_playing"]["name"], "Current Song")
        self.assertEqual(len(q_res["queue"]), 1)
        self.assertEqual(q_res["queue"][0]["name"], "Next Song")

        add_res = await self.plugin.add_to_queue("spotify:track:t2")
        self.assertTrue(add_res["ok"])

    async def test_librespot_includes_normalisation_flags_and_no_simulated_mix(self):
        self.plugin._settings = {
            **main.DEFAULT_SETTINGS,
            "audio_backend": "librespot",
            "device_name": "SteamMachine",
            "normalisation": True,
            "normalisation_pregain": 1.5,
            "gapless": False,
            "autoplay": True,
        }
        process = Mock(pid=555)
        with tempfile.TemporaryDirectory() as tmpdir, \
                patch.object(main, "CACHE_DIR", tmpdir), \
                patch.object(main.os.path, "isfile", return_value=True), \
                patch.object(main.subprocess, "Popen", return_value=process) as popen, \
                patch.object(self.plugin, "_kill_stale_librespot"), \
                patch.object(self.plugin, "_kill_spotify_client", new_callable=AsyncMock), \
                patch.object(self.plugin, "_configure_pipewire_clock", new_callable=AsyncMock), \
                patch.object(self.plugin, "_write_pid"), \
                patch.object(self.plugin, "_start_monitor"):
            res = await self.plugin.start_librespot()
            self.assertTrue(res["ok"])
            cmd = popen.call_args.args[0]
            self.assertIn("--enable-volume-normalisation", cmd)
            self.assertIn("--disable-gapless", cmd)
            self.assertIn("--autoplay", cmd)
            self.assertEqual(cmd[cmd.index("--autoplay") + 1], "on")
            self.assertFalse(hasattr(self.plugin, "start_mix_play"))
            self.assertFalse(hasattr(self.plugin, "toggle_playlist_mix"))

    async def test_cdp_recursive_folders_sync_and_cache(self):
        fake_cdp_tree = [
            {
                "id": "spotify-folder-111",
                "uri": "spotify:start-group:111:My%20playlists",
                "name": "My playlists",
                "source": "spotify_client",
                "playlist_ids": ["pl_top"],
                "playlists": [
                    {
                        "id": "pl_top",
                        "name": "Top Playlist",
                        "uri": "spotify:playlist:pl_top",
                        "image_url": "spotify:image:ab67706c0000da840000",
                        "track_count": 42,
                        "owner_id": "user1",
                        "can_mix": True,
                        "is_mixed": False,
                    }
                ],
                "subfolders": [
                    {
                        "id": "spotify-folder-222",
                        "uri": "spotify:start-group:222:Genre",
                        "name": "Genre",
                        "source": "spotify_client",
                        "playlist_ids": ["pl_sub"],
                        "playlists": [
                            {
                                "id": "pl_sub",
                                "name": "Drum & Bass",
                                "uri": "spotify:playlist:pl_sub",
                                "image_url": "https://i.scdn.co/image/ab67706c0000da841111",
                                "track_count": 100,
                                "owner_id": "user1",
                                "can_mix": True,
                                "is_mixed": True,
                            }
                        ],
                        "subfolders": [],
                    }
                ],
            }
        ]
        self.execute.return_value = fake_cdp_tree
        res = await self.plugin.get_playlist_folders()
        self.assertTrue(res["ok"])
        self.assertEqual(len(res["folders"]), 1)
        top = res["folders"][0]
        self.assertEqual(top["name"], "My playlists")
        self.assertTrue(top["playlists"][0]["image_url"].startswith("https://i.scdn.co/image/"))
        self.assertEqual(len(top["subfolders"]), 1)
        self.assertEqual(top["subfolders"][0]["name"], "Genre")
        self.assertTrue(top["subfolders"][0]["playlists"][0]["is_mixed"])

        # When CDP is unavailable (e.g. switched back to librespot), cached tree is still returned
        self.execute.return_value = None
        res_cached = await self.plugin.get_playlist_folders()
        self.assertTrue(res_cached["ok"])
        self.assertEqual(len(res_cached["folders"]), 1)
        self.assertEqual(res_cached["folders"][0]["subfolders"][0]["name"], "Genre")

    async def test_native_playlist_mix_requires_spotify_client_backend(self):
        self.plugin._settings["audio_backend"] = "librespot"
        denied = await self.plugin.set_native_playlist_mix("pl_sub", True)
        self.assertFalse(denied["ok"])
        self.assertIn("Official Spotify Client", denied["error"])

        self.plugin._settings["audio_backend"] = "spotify_client"
        self.execute.return_value = {"ok": True, "playlist_id": "pl_sub", "is_mixed": True}
        allowed = await self.plugin.set_native_playlist_mix("pl_sub", True)
        self.assertTrue(allowed["ok"])
        self.assertTrue(allowed["is_mixed"])

    async def test_set_native_playlist_mix_librespot_triggers_fallback_play(self):
        """Verify that librespot active state triggers play_tracks fallback when play_now=True."""
        self.plugin._settings["audio_backend"] = "librespot"
        with patch.object(self.plugin, "play_tracks", new_callable=AsyncMock) as mock_play:
            mock_play.return_value = {"ok": True}
            res = await self.plugin.set_native_playlist_mix("pl_fallback", enabled=True, play_now=True)
            self.assertFalse(res["ok"])
            self.assertIn("Official Spotify Client", res["error"])
            mock_play.assert_awaited_once_with(context_uri="spotify:playlist:pl_fallback")

    async def test_control_playback_play_pause(self):
        self.plugin._poll_play_state = "playing"
        res = await self.plugin.control_playback("play_pause")
        self.assertTrue(res["ok"])
        self.execute.assert_awaited_with(main._spotify_api_request, "me/player/pause", "valid-token", "PUT", None)

        self.plugin._poll_play_state = "paused"
        res = await self.plugin.control_playback("play_pause")
        self.assertTrue(res["ok"])
        self.execute.assert_awaited_with(main._spotify_api_request, "me/player/play", "valid-token", "PUT", None)

    async def test_backend_sleep_timer(self):
        res = await self.plugin.set_sleep_timer(15, shutdown_on_finish=True, end_of_track=False)
        self.assertTrue(res["ok"])
        self.assertTrue(res["sleep_timer"]["active"])
        self.assertAlmostEqual(res["sleep_timer"]["remaining_seconds"], 15 * 60, delta=2)
        self.assertTrue(res["sleep_timer"]["shutdown_on_finish"])

        status = self.plugin.get_sleep_timer_status()
        self.assertTrue(status["active"])

        # Cancel timer
        cancel_res = await self.plugin.set_sleep_timer(None)
        self.assertTrue(cancel_res["ok"])
        self.assertFalse(cancel_res["sleep_timer"]["active"])

    async def test_create_and_remove_playlist_track(self):
        self.execute.side_effect = [
            {"id": "new_pl_id", "name": "Chill Beats"},
            {"snapshot_id": "snap123"},
        ]
        create_res = await self.plugin.create_playlist("Chill Beats", public=True)
        self.assertTrue(create_res["ok"])
        self.assertEqual(create_res["playlist"]["id"], "new_pl_id")

        remove_res = await self.plugin.remove_track_from_playlist("new_pl_id", "spotify:track:1234")
        self.assertTrue(remove_res["ok"])


if __name__ == "__main__":
    unittest.main()
