import asyncio
import io
import json
import os
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, Mock, patch
from urllib.error import HTTPError

sys.path.insert(0, os.path.dirname(__file__))
from test_token_refresh import main


class PluginAdvancedTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.plugin = main.Plugin()
        self.plugin._token_refresh_lock = asyncio.Lock()
        self.plugin._access_token = "valid-token"
        self.plugin._refresh_token = "valid-refresh"
        self.plugin._token_expires_at = 9999999999
        self.plugin._settings = dict(main.DEFAULT_SETTINGS)
        self.execute = self.enterContext(patch.object(main, "_exec", new_callable=AsyncMock))
        self.save = self.enterContext(patch.object(main, "_save_settings"))
        self.emit = self.enterContext(patch.object(main.decky, "emit", new_callable=AsyncMock))

    # ── Folder Management & Native Mix ─────────────────────────

    async def test_manage_playlist_folder_lifecycle(self):
        # 1. Create folder
        res_create = await self.plugin.manage_playlist_folder(action="create", name="Rock Classics", playlist_id="p1")
        self.assertTrue(res_create["ok"])
        folders = self.plugin._settings["playlist_folders"]
        self.assertEqual(len(folders), 1)
        folder_id = folders[0]["id"]
        self.assertEqual(folders[0]["name"], "Rock Classics")
        self.assertEqual(folders[0]["playlist_ids"], ["p1"])

        # Create validation: empty name
        err_create = await self.plugin.manage_playlist_folder(action="create", name="  ")
        self.assertFalse(err_create["ok"])

        # 2. Add playlist
        res_add = await self.plugin.manage_playlist_folder(action="add_playlist", folder_id=folder_id, playlist_id="p2")
        self.assertTrue(res_add["ok"])
        self.assertIn("p2", self.plugin._settings["playlist_folders"][0]["playlist_ids"])

        # Add playlist validation: missing args
        err_add = await self.plugin.manage_playlist_folder(action="add_playlist", folder_id="", playlist_id="p3")
        self.assertFalse(err_add["ok"])

        # 3. Rename folder
        res_rename = await self.plugin.manage_playlist_folder(action="rename", folder_id=folder_id, name="Hard Rock")
        self.assertTrue(res_rename["ok"])
        self.assertEqual(self.plugin._settings["playlist_folders"][0]["name"], "Hard Rock")

        # Rename validation: empty name or not found
        err_rename = await self.plugin.manage_playlist_folder(action="rename", folder_id=folder_id, name="")
        self.assertFalse(err_rename["ok"])
        err_rename_nf = await self.plugin.manage_playlist_folder(action="rename", folder_id="fake", name="New")
        self.assertFalse(err_rename_nf["ok"])

        # 4. Remove playlist
        res_rem = await self.plugin.manage_playlist_folder(action="remove_playlist", folder_id=folder_id, playlist_id="p1")
        self.assertTrue(res_rem["ok"])
        self.assertNotIn("p1", self.plugin._settings["playlist_folders"][0]["playlist_ids"])

        # 5. Save folders list directly
        res_save = await self.plugin.manage_playlist_folder(
            action="save",
            folders=[{"id": "saved-1", "name": "Saved Folder", "playlist_ids": ["sp1"]}]
        )
        self.assertTrue(res_save["ok"])
        self.assertEqual(self.plugin._settings["playlist_folders"][0]["id"], "saved-1")

        # 6. Delete folder
        res_del = await self.plugin.manage_playlist_folder(action="delete", folder_id="saved-1")
        self.assertTrue(res_del["ok"])
        self.assertEqual(len(self.plugin._settings["playlist_folders"]), 0)

        # 7. Unknown action
        res_un = await self.plugin.manage_playlist_folder(action="corrupt")
        self.assertFalse(res_un["ok"])

    async def test_set_native_playlist_mix(self):
        # Requires spotify_client backend
        self.plugin._settings["audio_backend"] = "librespot"
        res_err = await self.plugin.set_native_playlist_mix("p123")
        self.assertFalse(res_err["ok"])

        self.plugin._settings["audio_backend"] = "spotify_client"
        self.execute.return_value = {"ok": True, "playlist_id": "mix123"}
        res = await self.plugin.set_native_playlist_mix("spotify:playlist:mix123", enabled=True, play_now=True)
        self.assertTrue(res["ok"])

    # ── Playback Polling ───────────────────────────────────────

    async def test_poll_playback_no_content_stopped(self):
        self.plugin._poll_play_state = "playing"
        self.plugin._poll_track_id = "track-prev"
        self.execute.return_value = None  # 204 No Content

        success = await self.plugin._poll_playback()
        self.assertTrue(success)
        self.assertIsNone(self.plugin._poll_play_state)
        self.assertIsNone(self.plugin._poll_track_id)
        self.emit.assert_awaited_with("librespot_event", {"event": "stopped"})

    async def test_poll_playback_active_track_and_modes(self):
        self.plugin._poll_play_state = "paused"
        self.plugin._poll_track_id = None
        data = {
            "is_playing": True,
            "progress_ms": 15000,
            "shuffle_state": True,
            "repeat_state": "track",
            "context": {"uri": "spotify:album:123"},
            "device": {"id": "dev-deck", "name": "Steam Deck", "volume_percent": 80, "type": "Computer"},
            "item": {
                "id": "trk-active",
                "type": "track",
                "name": "Live Track",
                "duration_ms": 200000,
                "uri": "spotify:track:trk-active",
                "artists": [{"name": "Live Artist"}],
                "album": {"name": "Live Album", "images": [{"url": "https://img.com/live"}]},
            },
        }
        with patch.object(self.plugin, "_check_tracks_liked", new_callable=AsyncMock) as mock_liked:
            mock_liked.return_value = {"trk-active": True}
            self.execute.return_value = data

            success = await self.plugin._poll_playback()
            self.assertTrue(success)
            self.assertTrue(self.plugin._shuffle_state)
            self.assertEqual(self.plugin._repeat_state, "track")
            self.assertEqual(self.plugin._poll_track_id, "trk-active")
            self.assertTrue(self.plugin._is_liked)
            self.assertEqual(self.plugin._poll_play_state, "playing")
            self.assertEqual(self.plugin._active_device["id"], "dev-deck")
            self.assertEqual(self.plugin._poll_volume, 80)

    async def test_poll_playback_active_episode(self):
        data = {
            "is_playing": False,
            "progress_ms": 50000,
            "item": {
                "id": "ep-active",
                "type": "episode",
                "name": "Tech Talk",
                "duration_ms": 600000,
                "uri": "spotify:episode:ep-active",
                "show": {"name": "Tech Show", "images": [{"url": "https://img.com/show"}]},
            },
        }
        self.execute.return_value = data
        success = await self.plugin._poll_playback()
        self.assertTrue(success)
        self.assertEqual(self.plugin._poll_track_id, "ep-active")
        self.assertEqual(self.plugin._track_meta["artist"], "Tech Show")
        self.assertEqual(self.plugin._poll_play_state, "paused")

    # ── Native Features & Backend Controls ─────────────────────

    async def test_native_features_suite(self):
        # 1. Play/Pause toggle
        self.execute.return_value = {"ok": True}
        self.plugin._poll_play_state = "playing"
        res = await self.plugin.control_playback("play_pause")
        self.assertTrue(res["ok"])

        self.plugin._poll_play_state = "paused"
        res2 = await self.plugin.control_playback("play_pause")
        self.assertTrue(res2["ok"])

        # 2. Sleep timer
        status = self.plugin.get_sleep_timer_status()
        self.assertFalse(status["active"])

        set_res = await self.plugin.set_sleep_timer(minutes=15)
        self.assertTrue(set_res["ok"])
        status2 = self.plugin.get_sleep_timer_status()
        self.assertTrue(status2["active"])
        self.assertGreater(status2["remaining_seconds"], 0)

        # Cancel timer
        cancel_res = await self.plugin.set_sleep_timer(minutes=0)
        self.assertTrue(cancel_res["ok"])
        status3 = self.plugin.get_sleep_timer_status()
        self.assertFalse(status3["active"])

        # 3. Playlist management
        self.execute.return_value = {"id": "new-p1", "name": "New Playlist"}
        create_res = await self.plugin.create_playlist("New Playlist", public=False)
        self.assertTrue(create_res["ok"])

        self.execute.return_value = {"snapshot_id": "snap1"}
        rem_res = await self.plugin.remove_track_from_playlist("new-p1", "spotify:track:t1")
        self.assertTrue(rem_res["ok"])

    # ── Process & Backend Management ───────────────────────────

    async def test_backend_process_controls(self):
        # Librespot kill and start
        mock_proc = MagicMock()
        mock_proc.poll.return_value = None
        self.plugin._process = mock_proc

        await self.plugin._kill_librespot()
        mock_proc.terminate.assert_called()

        # Official Spotify client kill
        mock_sp_proc = MagicMock()
        mock_sp_proc.poll.return_value = None
        self.plugin._spotify_client_process = mock_sp_proc

        await self.plugin._kill_spotify_client()
        mock_sp_proc.terminate.assert_called()

    # ── PulseAudio Volume & Audio Stream ───────────────────────

    async def test_pa_volume_and_stream_info(self):
        pactl_output = """
Sink Input #1
        Driver: PipeWire
        application.name = "librespot"
        application.process.id = "1234"
        media.name = "librespot"
        Sample Specification: s16le 2ch 44100Hz
        Resample method: none
        Corked: no
        Volume: front-left: 65536 / 100% / 0.00 dB,   front-right: 65536 / 100% / 0.00 dB
        """
        async def fake_exec(fn, *a, **k):
            return fn(*a)
        self.execute.side_effect = fake_exec

        self.plugin._process = MagicMock(pid=1234)
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = SimpleNamespace(returncode=0, stdout=pactl_output, stderr="")
            await self.plugin._refresh_audio_stream_info()
            self.assertIsNotNone(self.plugin._audio_stream_info)
            self.assertEqual(self.plugin._audio_stream_info.get("format_label"), "16-bit · 44.1 kHz")

            # Test set PA volume
            ok = await self.plugin._set_pa_volume_percent(85)
            self.assertTrue(ok)
            mock_run.assert_called()
