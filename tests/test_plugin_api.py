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


class PluginApiTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.plugin = main.Plugin()
        self.plugin._token_refresh_lock = asyncio.Lock()
        self.plugin._access_token = "valid-token"
        self.plugin._refresh_token = "valid-refresh"
        self.plugin._token_expires_at = 9999999999
        self.plugin._settings = dict(main.DEFAULT_SETTINGS)
        self.plugin._sse = MagicMock()
        self.execute = self.enterContext(patch.object(main, "_exec", new_callable=AsyncMock))
        self.save = self.enterContext(patch.object(main, "_save_settings"))
        self.emit = self.enterContext(patch.object(main.decky, "emit", new_callable=AsyncMock))

    # ── Playback & Queue Controls ──────────────────────────────

    async def test_control_playback_play_with_active_device(self):
        self.plugin._active_device = {"id": "dev1", "name": "Deck"}
        self.execute.return_value = {}
        res = await self.plugin.control_playback("play", "dev1")
        self.assertTrue(res["ok"])
        self.execute.assert_awaited_once_with(
            main._spotify_api_request,
            "me/player/play",
            "valid-token",
            "PUT",
            {"device_id": "dev1"},
        )

    async def test_control_playback_play_auto_transfer_success(self):
        self.plugin._active_device = None
        self.execute.side_effect = HTTPError("url", 404, "Not Found", {}, None)
        with patch.object(self.plugin, "_auto_transfer_and_play", new_callable=AsyncMock) as mock_transfer:
            mock_transfer.return_value = {"ok": True}
            res = await self.plugin.control_playback("play")
            self.assertTrue(res["ok"])
            mock_transfer.assert_awaited_once()

    async def test_control_playback_pause(self):
        self.plugin._active_device = {"id": "dev1"}
        self.execute.return_value = {}
        res = await self.plugin.control_playback("pause")
        self.assertTrue(res["ok"])

    async def test_control_playback_next_and_previous(self):
        self.execute.return_value = {}
        res_next = await self.plugin.control_playback("next")
        self.assertTrue(res_next["ok"])
        res_prev = await self.plugin.control_playback("previous")
        self.assertTrue(res_prev["ok"])

    async def test_control_playback_invalid_action(self):
        res = await self.plugin.control_playback("explode")
        self.assertFalse(res["ok"])
        self.assertIn("Unknown action", res["error"])

    async def test_control_playback_error_handling(self):
        self.execute.side_effect = RuntimeError("Network down")
        res = await self.plugin.control_playback("play")
        self.assertFalse(res["ok"])
        self.assertIn("Network down", res["error"])

    async def test_set_volume_clamps_and_updates(self):
        self.execute.return_value = {}
        res = await self.plugin.set_volume(150)
        self.assertTrue(res["ok"])
        self.execute.assert_awaited_with(
            main._spotify_api_request,
            "me/player/volume",
            "valid-token",
            "PUT",
            {"volume_percent": 100},
        )

        res_neg = await self.plugin.set_volume(-10)
        self.assertTrue(res_neg["ok"])
        self.execute.assert_awaited_with(
            main._spotify_api_request,
            "me/player/volume",
            "valid-token",
            "PUT",
            {"volume_percent": 0},
        )

    async def test_get_queue_formats_items(self):
        self.execute.return_value = {
            "currently_playing": {
                "id": "t1",
                "name": "Track 1",
                "uri": "spotify:track:t1",
                "duration_ms": 180000,
                "artists": [{"name": "Artist 1"}],
                "album": {"name": "Album 1", "images": [{"url": "https://img.com/1"}]},
            },
            "queue": [
                {
                    "id": "t2",
                    "name": "Track 2",
                    "uri": "spotify:track:t2",
                    "duration_ms": 200000,
                    "artists": [{"name": "Artist 2"}],
                    "album": {"name": "Album 2", "images": []},
                }
            ],
        }
        res = await self.plugin.get_queue()
        self.assertTrue(res["ok"])
        self.assertEqual(res["currently_playing"]["id"], "t1")
        self.assertEqual(len(res["queue"]), 1)
        self.assertEqual(res["queue"][0]["name"], "Track 2")

    async def test_add_to_queue(self):
        self.execute.return_value = {}
        res = await self.plugin.add_to_queue("spotify:track:123", "dev1")
        self.assertTrue(res["ok"])
        self.execute.assert_awaited_once_with(
            main._spotify_api_request,
            "me/player/queue",
            "valid-token",
            "POST",
            {"uri": "spotify:track:123", "device_id": "dev1"},
        )

    # ── Playlists & Tracks ─────────────────────────────────────

    async def test_get_playlists_paginated(self):
        self.execute.return_value = {
            "items": [
                {
                    "id": "p1",
                    "name": "Chill Vibes",
                    "uri": "spotify:playlist:p1",
                    "images": [{"url": "https://img/p1"}],
                    "tracks": {"total": 42},
                    "owner": {"id": "user1"},
                }
            ],
            "total": 1,
            "limit": 50,
            "offset": 0,
        }
        res = await self.plugin.get_playlists(offset=0)
        self.assertTrue(res["ok"])
        self.assertEqual(len(res["playlists"]), 1)
        self.assertEqual(res["playlists"][0]["name"], "Chill Vibes")

    async def test_get_playlist_tracks_fetch_all(self):
        page1 = {
            "items": [
                {
                    "track": {
                        "id": "trk1",
                        "name": "Song 1",
                        "uri": "spotify:track:trk1",
                        "duration_ms": 100000,
                        "artists": [{"name": "Artist A"}],
                        "album": {"name": "Album A", "images": []},
                    }
                }
            ],
            "total": 2,
            "limit": 100,
            "offset": 0,
        }
        page2 = {
            "items": [
                {
                    "track": {
                        "id": "trk2",
                        "name": "Song 2",
                        "uri": "spotify:track:trk2",
                        "duration_ms": 120000,
                        "artists": [{"name": "Artist B"}],
                        "album": {"name": "Album B", "images": []},
                    }
                }
            ],
            "total": 2,
            "limit": 100,
            "offset": 100,
        }
        with patch.object(self.plugin, "_check_tracks_liked", new_callable=AsyncMock) as mock_liked:
            mock_liked.return_value = {"trk1": True, "trk2": False}
            self.execute.side_effect = [page1, page2]
            res = await self.plugin.get_playlist_tracks("p1", fetch_all=True)
            self.assertTrue(res["ok"])
            self.assertEqual(len(res["tracks"]), 2)
            self.assertTrue(res["tracks"][0]["is_liked"])
            self.assertFalse(res["tracks"][1]["is_liked"])

    async def test_get_liked_tracks_pagination(self):
        page = {
            "items": [
                {
                    "track": {
                        "id": "lk1",
                        "name": "Liked Song",
                        "uri": "spotify:track:lk1",
                        "duration_ms": 90000,
                        "artists": [{"name": "Liked Artist"}],
                        "album": {"name": "Album L", "images": []},
                    }
                }
            ],
            "total": 1,
            "limit": 50,
            "offset": 0,
        }
        self.execute.return_value = page
        res = await self.plugin.get_liked_tracks(fetch_all=False)
        self.assertTrue(res["ok"])
        self.assertEqual(len(res["tracks"]), 1)
        self.assertTrue(res["tracks"][0]["is_liked"])

    async def test_get_saved_episodes(self):
        self.execute.return_value = {
            "items": [
                {
                    "episode": {
                        "id": "ep1",
                        "name": "Podcast Ep 1",
                        "uri": "spotify:episode:ep1",
                        "duration_ms": 1800000,
                        "show": {"name": "Good Podcast"},
                        "images": [{"url": "https://img/ep1"}],
                    }
                }
            ],
            "total": 1,
            "limit": 50,
            "offset": 0,
        }
        res = await self.plugin.get_saved_episodes()
        self.assertTrue(res["ok"])
        self.assertEqual(len(res["episodes"]), 1)
        self.assertEqual(res["episodes"][0]["name"], "Podcast Ep 1")

    async def test_get_saved_albums_and_album_tracks(self):
        self.execute.return_value = {
            "items": [
                {
                    "album": {
                        "id": "alb1",
                        "name": "Greatest Hits",
                        "uri": "spotify:album:alb1",
                        "artists": [{"name": "Star"}],
                        "images": [],
                        "total_tracks": 12,
                    }
                }
            ],
            "total": 1,
        }
        res_alb = await self.plugin.get_saved_albums()
        self.assertTrue(res_alb["ok"])
        self.assertEqual(len(res_alb["albums"]), 1)

        self.execute.return_value = {
            "items": [
                {
                    "id": "atrk1",
                    "name": "Hit 1",
                    "uri": "spotify:track:atrk1",
                    "duration_ms": 200000,
                    "artists": [{"name": "Star"}],
                }
            ],
            "total": 1,
        }
        with patch.object(self.plugin, "_annotate_tracks_liked", new_callable=AsyncMock):
            res_atrks = await self.plugin.get_album_tracks("alb1")
            self.assertTrue(res_atrks["ok"])
            self.assertEqual(len(res_atrks["tracks"]), 1)

    async def test_get_followed_artists_and_top_tracks(self):
        self.execute.return_value = {
            "artists": {
                "items": [
                    {
                        "id": "art1",
                        "name": "Daft Punk",
                        "uri": "spotify:artist:art1",
                        "images": [],
                    }
                ]
            }
        }
        res_arts = await self.plugin.get_followed_artists()
        self.assertTrue(res_arts["ok"])
        self.assertEqual(len(res_arts["artists"]), 1)

        self.execute.return_value = {
            "tracks": [
                {
                    "id": "top1",
                    "name": "One More Time",
                    "uri": "spotify:track:top1",
                    "duration_ms": 320000,
                    "artists": [{"name": "Daft Punk"}],
                    "album": {"name": "Discovery", "images": []},
                }
            ]
        }
        with patch.object(self.plugin, "_annotate_tracks_liked", new_callable=AsyncMock):
            res_top = await self.plugin.get_artist_top_tracks("art1")
            self.assertTrue(res_top["ok"])
            self.assertEqual(len(res_top["tracks"]), 1)

    async def test_get_recently_played_and_search(self):
        self.execute.return_value = {
            "items": [
                {
                    "track": {
                        "id": "rec1",
                        "name": "Recent Song",
                        "uri": "spotify:track:rec1",
                        "duration_ms": 150000,
                        "artists": [{"name": "Artist R"}],
                        "album": {"name": "Album R", "images": []},
                    },
                    "played_at": "2026-11-08T12:00:00Z",
                }
            ]
        }
        with patch.object(self.plugin, "_annotate_tracks_liked", new_callable=AsyncMock):
            res_rec = await self.plugin.get_recently_played(limit=10)
            self.assertTrue(res_rec["ok"])
            self.assertEqual(len(res_rec["tracks"]), 1)

        self.execute.return_value = {
            "tracks": {"items": [{"id": "s1", "name": "Searched Song"}]},
            "artists": {"items": []},
            "albums": {"items": []},
            "playlists": {"items": []},
        }
        with patch.object(self.plugin, "_annotate_tracks_liked", new_callable=AsyncMock):
            res_search = await self.plugin.search_spotify("test")
            self.assertTrue(res_search["ok"])
            self.assertEqual(len(res_search["tracks"]), 1)

    async def test_get_track_recommendations(self):
        self.execute.return_value = {
            "tracks": [
                {
                    "id": "rec_trk1",
                    "name": "Recommended Song",
                    "uri": "spotify:track:rec_trk1",
                    "duration_ms": 210000,
                    "artists": [{"name": "Reco Artist"}],
                    "album": {"name": "Reco Album", "images": []},
                }
            ]
        }
        with patch.object(self.plugin, "_annotate_tracks_liked", new_callable=AsyncMock):
            res = await self.plugin.get_track_recommendations("seed123")
            self.assertTrue(res["ok"])
            self.assertEqual(len(res["tracks"]), 1)

    async def test_get_lyrics(self):
        async def fake_exec(fn, *a, **k):
            return fn(*a)
        self.execute.side_effect = fake_exec

        lrclib_payload = {
            "syncedLyrics": "[00:10.00] Line one\n[00:15.00] Line two",
            "plainLyrics": "Line one\nLine two",
        }
        with patch("urllib.request.urlopen") as mock_open:
            mock_resp = MagicMock()
            mock_resp.read.return_value = json.dumps(lrclib_payload).encode("utf-8")
            mock_resp.__enter__.return_value = mock_resp
            mock_open.return_value = mock_resp

            res = await self.plugin.get_lyrics("Line one", "Singer", 180)
            self.assertTrue(res["ok"])
            self.assertEqual(res["plain_lyrics"], "Line one\nLine two")
            self.assertIn("Line one", res["synced_lyrics"])

        with patch("urllib.request.urlopen", side_effect=Exception("Not found")):
            res_nf = await self.plugin.get_lyrics("Missing", "Nobody")
            self.assertFalse(res_nf["ok"])

    async def test_play_tracks(self):
        self.execute.return_value = {}
        # Context URI mode
        res_ctx = await self.plugin.play_tracks(context_uri="spotify:album:123", offset_uri="spotify:track:456")
        self.assertTrue(res_ctx["ok"])
        self.execute.assert_awaited_with(
            main._spotify_api_request,
            "me/player/play",
            "valid-token",
            "PUT",
            None,
            {"context_uri": "spotify:album:123", "offset": {"uri": "spotify:track:456"}},
        )

        # URIs list mode
        res_uris = await self.plugin.play_tracks(uris=["spotify:track:1", "spotify:track:2"], position=5000)
        self.assertTrue(res_uris["ok"])
        self.execute.assert_awaited_with(
            main._spotify_api_request,
            "me/player/play",
            "valid-token",
            "PUT",
            None,
            {"uris": ["spotify:track:1", "spotify:track:2"], "offset": {"position": 5000}},
        )

    async def test_get_devices_and_transfer_playback(self):
        self.execute.return_value = {
            "devices": [
                {"id": "d1", "name": "Deck", "is_active": True, "type": "Computer"},
                {"id": "d2", "name": "Phone", "is_active": False, "type": "Smartphone"},
            ]
        }
        res_devs = await self.plugin.get_devices()
        self.assertTrue(res_devs["ok"])
        self.assertEqual(len(res_devs["devices"]), 2)

        self.execute.return_value = {}
        res_trans = await self.plugin.transfer_playback("d2")
        self.assertTrue(res_trans["ok"])
        self.execute.assert_awaited_with(
            main._spotify_api_request,
            "me/player",
            "valid-token",
            "PUT",
            None,
            {"device_ids": ["d2"]},
        )

    # ── Settings & Audio Profiles ──────────────────────────────

    async def test_settings_get_and_set(self):
        s = await self.plugin.get_settings()
        self.assertIsInstance(s, dict)

        # Test audio profiles
        prof_res = await self.plugin.set_setting("game_audio_profiles", {"game_123": 45})
        self.assertTrue(prof_res["ok"])
        self.assertEqual(self.plugin._settings["game_audio_profiles"]["game_123"], 45)

        # Test auto ducking
        duck_res = await self.plugin.set_setting("auto_ducking", False)
        self.assertTrue(duck_res["ok"])
        self.assertFalse(self.plugin._settings["auto_ducking"])

        vol_res = await self.plugin.set_setting("auto_ducking_volume", 20)
        self.assertTrue(vol_res["ok"])
        self.assertEqual(self.plugin._settings["auto_ducking_volume"], 20)

        # Test toasts
        toast_res = await self.plugin.set_setting("toast_enabled", False)
        self.assertTrue(toast_res["ok"])
        self.assertFalse(self.plugin._settings["toast_enabled"])

        pos_res = await self.plugin.set_setting("toast_position", "bottom_left")
        self.assertTrue(pos_res["ok"])
        self.assertEqual(self.plugin._settings["toast_position"], "bottom_left")

    async def test_set_setting_device_name(self):
        res = await self.plugin.set_setting("device_name", "Gamer Deck")
        self.assertTrue(res["ok"])
        self.assertEqual(self.plugin._settings["device_name"], "Gamer Deck")
        self.assertTrue(self.plugin._settings["device_name_customized"])

    async def test_set_setting_audio_backend(self):
        with patch.object(self.plugin, "start_spotify_client", new_callable=AsyncMock) as mock_start:
            mock_start.return_value = {"ok": True}
            res = await self.plugin.set_setting("audio_backend", "spotify_client")
            self.assertTrue(res["ok"])
            mock_start.assert_awaited_once()

    # ── Power & Lifecycle ──────────────────────────────────────

    async def test_shutdown_system(self):
        async def fake_exec(fn, *a, **k):
            return fn(*a)
        self.execute.side_effect = fake_exec
        with patch("subprocess.Popen") as mock_popen:
            res = await self.plugin.shutdown_system()
            self.assertTrue(res["ok"])
            mock_popen.assert_called_once()

    # ── Lifecycle & Suspend ────────────────────────────────────

    async def test_on_deck_sleep_and_resume(self):
        await self.plugin._on_deck_sleep()

        with patch.object(self.plugin, "_ensure_token", new_callable=AsyncMock) as m_token, \
             patch.object(self.plugin, "_poll_playback", new_callable=AsyncMock) as m_poll, \
             patch.object(self.plugin, "_refresh_audio_stream_info", new_callable=AsyncMock) as m_audio:
            await self.plugin._on_deck_resume()
            m_token.assert_awaited_once()
            m_poll.assert_awaited_once()
            m_audio.assert_awaited_once()
            self.emit.assert_awaited_with("deck_resumed")

    async def test_migration(self):
        setattr(main.decky, "DECKY_USER_HOME", "/home/deck")
        setattr(main.decky, "DECKY_HOME", "/home/deck")
        with patch.object(main.decky, "migrate_logs", create=True) as m_logs, \
             patch.object(main.decky, "migrate_settings", create=True) as m_settings, \
             patch.object(main.decky, "migrate_runtime", create=True) as m_runtime:
            await self.plugin._migration()
            m_logs.assert_called_once()
            m_settings.assert_called_once()
            m_runtime.assert_called_once()

    # ── Native Audio Sinks & CDP Auth Status ───────────────────

    async def test_audio_sinks_and_cdp_status(self):
        self.execute.return_value = [{"name": "speakers", "description": "Speakers"}]
        sinks = await self.plugin.get_audio_sinks()
        self.assertTrue(sinks["ok"])
        self.assertEqual(len(sinks["sinks"]), 1)

        self.execute.return_value = True
        res = await self.plugin.set_audio_sink("speakers")
        self.assertTrue(res["ok"])

        self.execute.return_value = {"authenticated": True, "running": True}
        cdp_status = await self.plugin.get_spotify_client_auth_status()
        self.assertTrue(cdp_status["authenticated"])
