import asyncio
import json
import os
import sys
import tempfile
import time
import unittest
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
    from py_modules import common, resilience


class TestResilienceNormalizationAndSettings(unittest.TestCase):
    def test_normalize_spotify_id_hex_to_base62_and_zero_padding(self):
        # 32-char all-zero hex -> 22 zeros
        self.assertEqual(resilience.normalize_spotify_id("0" * 32), "0" * 22)

        # Small hex value -> leading zero padded to 22 chars
        padded = resilience.normalize_spotify_id("0000000000000000000000000000003e")
        self.assertEqual(len(padded), 22)
        self.assertEqual(padded, "0" * 20 + "10")

        # Standard 32-char hex ID -> 22-char Base62
        hex_id = "ba292267a139477c86f108d66f4f9cc5"
        b62 = resilience.normalize_spotify_id(hex_id)
        self.assertEqual(len(b62), 22)
        # Idempotent when passed again
        self.assertEqual(resilience.normalize_spotify_id(b62), b62)

    def test_normalize_spotify_id_strips_uri_prefixes_and_handles_empty(self):
        b62 = "4uLU6hMCjMI75M1A2tKUQC"
        self.assertEqual(resilience.normalize_spotify_id(f"spotify:track:{b62}"), b62)
        self.assertEqual(resilience.normalize_spotify_id(f"spotify:episode:{b62}"), b62)
        self.assertEqual(resilience.normalize_spotify_id(""), "")
        self.assertEqual(resilience.normalize_spotify_id(None), "")

    def test_write_onevent_emitter_creates_posix_sh_without_python(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            script_path = os.path.join(tmpdir, "librespot-event.sh")
            returned_path = resilience.write_onevent_emitter(script_path)
            self.assertEqual(returned_path, script_path)
            self.assertTrue(os.path.isfile(script_path))
            with open(script_path, "r", encoding="utf-8") as f:
                content = f.read()
            self.assertTrue(content.startswith("#!/bin/sh\n"))
            self.assertNotIn("python", content.lower())
            self.assertIn("PLAYER_EVENT=${PLAYER_EVENT}", content)
            self.assertIn("UNIX-CONNECT:", content)

    def test_default_settings_and_load_settings_clamping(self):
        self.assertIs(common.DEFAULT_SETTINGS["resilience_auto_resume"], True)
        self.assertEqual(common.DEFAULT_SETTINGS["resilience_bookmark_expiry_hours"], 12)
        self.assertIs(common.DEFAULT_SETTINGS["resilience_bookmark_never_expires"], False)
        self.assertIs(common.DEFAULT_SETTINGS["resilience_toast_enabled"], True)
        self.assertIs(common.DEFAULT_SETTINGS["resilience_prompt_held_enabled"], True)

        with tempfile.TemporaryDirectory() as tmpdir:
            sf = os.path.join(tmpdir, "settings.json")

            # Clamp 0 -> 1
            with open(sf, "w", encoding="utf-8") as f:
                json.dump({"resilience_bookmark_expiry_hours": 0, "resilience_auto_resume": 0}, f)
            loaded = common._load_settings_impl(sf)
            self.assertEqual(loaded["resilience_bookmark_expiry_hours"], 1)
            self.assertIs(loaded["resilience_auto_resume"], False)

            # Clamp 25 -> 24
            with open(sf, "w", encoding="utf-8") as f:
                json.dump({"resilience_bookmark_expiry_hours": 25}, f)
            loaded = common._load_settings_impl(sf)
            self.assertEqual(loaded["resilience_bookmark_expiry_hours"], 24)

            # Invalid -> 12
            with open(sf, "w", encoding="utf-8") as f:
                json.dump({"resilience_bookmark_expiry_hours": "not-a-number"}, f)
            loaded = common._load_settings_impl(sf)
            self.assertEqual(loaded["resilience_bookmark_expiry_hours"], 12)


class TestLibrespotEventServer(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.plugin = SimpleNamespace(
            _settings={"audio_backend": "librespot", "device_name": "Deckify"},
            _poll_play_state=None,
            _poll_track_id=None,
            _poll_progress_ms=0,
            _poll_duration_ms=0,
            _poll_updated_at=0.0,
            _poll_volume=None,
            _last_event=None,
            _active_device=None,
            _poll_wake_event=asyncio.Event(),
            _is_librespot_running=MagicMock(return_value=True),
            _poll_playback=AsyncMock(return_value=True),
        )

    async def test_parse_key_value_json_and_http_post_payloads(self):
        hex_id = "ba292267a139477c86f108d66f4f9cc5"
        expected_b62 = resilience.normalize_spotify_id(hex_id)

        kv_raw = (
            f"PLAYER_EVENT=changed\n"
            f"TRACK_ID={hex_id}\n"
            f"POSITION_MS=-50\n"
            f"DURATION_MS=210000\n"
            f"VOLUME=32768\n"
        )
        ev1 = resilience.parse_onevent_payload(kv_raw)
        self.assertIsNotNone(ev1)
        self.assertEqual(ev1["event"], "track_changed")
        self.assertEqual(ev1["track_id"], expected_b62)
        self.assertEqual(ev1["position_ms"], 0)
        self.assertEqual(ev1["duration_ms"], 210000)
        self.assertEqual(ev1["volume"], 50)

        json_raw = json.dumps(
            {
                "PLAYER_EVENT": "started",
                "TRACK_ID": f"spotify:track:{expected_b62}",
                "POSITION_MS": 12500,
                "DURATION_MS": 180000,
                "VOLUME": 85,
            }
        )
        ev2 = resilience.parse_onevent_payload(json_raw)
        self.assertEqual(ev2["event"], "playing")
        self.assertEqual(ev2["track_id"], expected_b62)
        self.assertEqual(ev2["position_ms"], 12500)
        self.assertEqual(ev2["volume"], 85)

        http_raw = (
            b"POST / HTTP/1.1\r\nHost: localhost\r\nContent-Length: 42\r\n\r\n"
            b"PLAYER_EVENT=position_correction\nPOSITION_MS=44000\n"
        )
        ev3 = resilience.parse_onevent_payload(http_raw)
        self.assertEqual(ev3["event"], "seeked")
        self.assertEqual(ev3["position_ms"], 44000)

    async def test_synchronous_state_update_before_decky_emit(self):
        server = resilience.LibrespotEventServer(self.plugin, debounce_s=0.05)
        observed_during_emit = {}

        async def inspect_on_emit(event_name, payload):
            if event_name == "librespot_event":
                observed_during_emit["play_state"] = self.plugin._poll_play_state
                observed_during_emit["progress_ms"] = self.plugin._poll_progress_ms
                observed_during_emit["duration_ms"] = self.plugin._poll_duration_ms
                observed_during_emit["last_event"] = self.plugin._last_event

        with patch.object(resilience.decky, "emit", side_effect=inspect_on_emit):
            await server.process_payload(
                "PLAYER_EVENT=playing\nTRACK_ID=4uLU6hMCjMI75M1A2tKUQC\nPOSITION_MS=3200\nDURATION_MS=195000\n"
            )
            await server.stop()

        self.assertEqual(observed_during_emit["play_state"], "playing")
        self.assertEqual(observed_during_emit["progress_ms"], 3200)
        self.assertEqual(observed_during_emit["duration_ms"], 195000)
        self.assertIsNotNone(observed_during_emit["last_event"])
        self.assertEqual(observed_during_emit["last_event"]["event"], "playing")

    async def test_debounced_enrichment_cancels_prior_tasks_on_rapid_skip(self):
        server = resilience.LibrespotEventServer(self.plugin, debounce_s=0.08)
        with patch.object(resilience.decky, "emit", new_callable=AsyncMock):
            await server.process_payload("PLAYER_EVENT=track_changed\nTRACK_ID=1111111111111111111111\n")
            first_task = server._debounce_task
            await asyncio.sleep(0.02)
            await server.process_payload("PLAYER_EVENT=track_changed\nTRACK_ID=2222222222222222222222\n")
            second_task = server._debounce_task
            await asyncio.sleep(0.02)
            await server.process_payload("PLAYER_EVENT=track_changed\nTRACK_ID=3333333333333333333333\n")
            # Duplicate identical track should not cancel or re-trigger
            third_task = server._debounce_task
            await server.process_payload("PLAYER_EVENT=playing\nTRACK_ID=3333333333333333333333\n")
            self.assertIs(server._debounce_task, third_task)

            await asyncio.sleep(0)
            self.assertTrue(first_task.cancelled())
            self.assertTrue(second_task.cancelled())
            self.plugin._poll_playback.assert_not_awaited()

            await asyncio.sleep(0.12)
            self.plugin._poll_playback.assert_awaited_once()
            await server.stop()

    async def test_adaptive_polling_20s_vs_3s(self):
        server = resilience.LibrespotEventServer(self.plugin)
        server._server = MagicMock()
        server._running = True
        server._unhealthy = False

        # Healthy local librespot -> 20.0s
        self.assertTrue(server.is_healthy(self.plugin))
        self.assertEqual(server.get_poll_interval(self.plugin), 20.0)

        # Remote active device -> 3.0s
        self.plugin._active_device = {"id": "rem-1", "name": "Living Room TV", "type": "CastVideo"}
        self.assertEqual(server.get_poll_interval(self.plugin), 3.0)

        # Local active device -> 20.0s
        self.plugin._active_device = {"id": "loc-1", "name": "Deckify", "type": "Computer"}
        self.assertEqual(server.get_poll_interval(self.plugin), 20.0)

        # spotify_client backend -> 3.0s
        self.plugin._settings["audio_backend"] = "spotify_client"
        self.assertFalse(server.is_healthy(self.plugin))
        self.assertEqual(server.get_poll_interval(self.plugin), 3.0)

        # Unhealthy --onevent -> 3.0s and wakes poll loop
        self.plugin._settings["audio_backend"] = "librespot"
        self.plugin._poll_wake_event.clear()
        server.mark_unhealthy()
        self.assertTrue(self.plugin._poll_wake_event.is_set())
        self.assertEqual(server.get_poll_interval(self.plugin), 3.0)


class TestSessionBookmarkManager(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.bookmark_path = os.path.join(self.tmpdir.name, "session_bookmark.json")
        self.plugin = SimpleNamespace(
            _settings={
                "audio_backend": "librespot",
                "device_name": "Deckify",
                "resilience_auto_resume": True,
                "resilience_bookmark_expiry_hours": 12,
                "resilience_bookmark_never_expires": False,
                "resilience_toast_enabled": True,
                "resilience_prompt_held_enabled": True,
            },
            _access_token="valid-token",
            _refresh_token="valid-refresh",
            _poll_play_state="playing",
            _poll_track_id="4uLU6hMCjMI75M1A2tKUQC",
            _poll_progress_ms=64000,
            _poll_duration_ms=210000,
            _context_uri="spotify:playlist:37i9dQZF1DXcBWIGoYBM5M",
            _track_meta={
                "name": "Never Gonna Give You Up",
                "artist": "Rick Astley",
                "uri": "spotify:track:4uLU6hMCjMI75M1A2tKUQC",
            },
            _last_event={"event": "playing"},
            _active_device={"id": "local-1", "name": "Deckify", "type": "Computer"},
            _process=MagicMock(poll=MagicMock(return_value=None)),
            _is_librespot_running=MagicMock(return_value=True),
            _ensure_token=AsyncMock(return_value="valid-token"),
            _kill_librespot=AsyncMock(),
            start_librespot=AsyncMock(return_value={"ok": True}),
            _poll_playback=AsyncMock(return_value=True),
            get_devices=AsyncMock(return_value={"devices": [{"id": "local-1", "name": "Deckify"}]}),
            _fetch_current_player=AsyncMock(return_value=None),
            play_tracks=AsyncMock(return_value={"ok": True}),
        )
        self.plugin._event_server = resilience.LibrespotEventServer(self.plugin)

    def tearDown(self):
        self.tmpdir.cleanup()

    def test_atomic_bookmark_persistence_and_corrupt_json_fallback(self):
        mgr = resilience.SessionBookmarkManager(self.plugin, bookmark_file=self.bookmark_path)
        snap = mgr.snapshot_from_state(force=True)
        self.assertIsNotNone(snap)
        self.assertEqual(snap["track_uri"], "spotify:track:4uLU6hMCjMI75M1A2tKUQC")
        self.assertEqual(snap["context_uri"], "spotify:playlist:37i9dQZF1DXcBWIGoYBM5M")
        self.assertEqual(snap["position_ms"], 64000)
        self.assertTrue(snap["was_playing"])
        self.assertTrue(os.path.isfile(self.bookmark_path))

        # Reload into fresh manager instance
        mgr2 = resilience.SessionBookmarkManager(self.plugin, bookmark_file=self.bookmark_path)
        loaded = mgr2.load_bookmark()
        self.assertIsNotNone(loaded)
        self.assertEqual(loaded["track_uri"], "spotify:track:4uLU6hMCjMI75M1A2tKUQC")
        self.assertEqual(loaded["position_ms"], 64000)

        # Corrupt JSON on disk falls back safely to None without raising
        with open(self.bookmark_path, "w", encoding="utf-8") as f:
            f.write("{truncated: [corrupt")
        mgr3 = resilience.SessionBookmarkManager(self.plugin, bookmark_file=self.bookmark_path)
        self.assertIsNone(mgr3.load_bookmark())

    async def test_d01_was_playing_false_does_not_auto_play_on_wake(self):
        mgr = resilience.SessionBookmarkManager(self.plugin, bookmark_file=self.bookmark_path)
        mgr.snapshot_from_state(was_playing=False, position_ms=30000, force=True)

        with patch.object(resilience.decky, "emit", new_callable=AsyncMock):
            res = await mgr.handle_wake_recovery(source="dbus")

        self.assertTrue(res["ok"])
        self.assertFalse(res["restored"])
        self.assertEqual(res["reason"], "was_paused")
        self.plugin.play_tracks.assert_not_awaited()

    async def test_d02_wifi_grace_window_4s_buffer_aware_detection(self):
        mgr = resilience.SessionBookmarkManager(
            self.plugin,
            bookmark_file=self.bookmark_path,
            wifi_grace_s=4.0,
        )
        mgr.snapshot_from_state(was_playing=True, position_ms=42000, force=True)

        with patch.object(resilience.decky, "emit", new_callable=AsyncMock), \
             patch("time.monotonic") as mock_mono:
            # 1. Transient Wi-Fi blip (< 4.0s) while librespot buffer continues playing
            mock_mono.return_value = 100.0
            await mgr.on_poll_network_result(False)
            self.assertEqual(mgr._wifi_drop_started_at, 100.0)

            mock_mono.return_value = 102.5  # 2.5s < 4.0s grace window
            res_blip = await mgr.on_poll_network_result(True)
            self.assertTrue(res_blip["grace_window_recovered"])
            self.assertIsNone(mgr._wifi_drop_started_at)
            self.plugin._kill_librespot.assert_not_awaited()
            self.plugin.play_tracks.assert_not_awaited()

            # 2. Sustained Wi-Fi drop (>= 4.0s) triggers full recovery and bookmark restore
            mock_mono.return_value = 200.0
            await mgr.on_poll_network_result(False)
            mock_mono.return_value = 204.5  # 4.5s >= 4.0s grace window
            await mgr.on_poll_network_result(False)
            self.assertTrue(mgr._network_lost_session)

            mock_mono.return_value = 205.0
            res_recover = await mgr.on_poll_network_result(True)
            self.assertTrue(res_recover["restored"])
            self.plugin._kill_librespot.assert_awaited_once()
            self.plugin.start_librespot.assert_awaited_once()
            self.plugin.play_tracks.assert_awaited_once_with(
                context_uri="spotify:playlist:37i9dQZF1DXcBWIGoYBM5M",
                offset_uri="spotify:track:4uLU6hMCjMI75M1A2tKUQC",
                position_ms=42000,
            )

    async def test_d06_remote_active_device_yields_and_holds_bookmark(self):
        mgr = resilience.SessionBookmarkManager(self.plugin, bookmark_file=self.bookmark_path)
        mgr.snapshot_from_state(was_playing=True, position_ms=55000, force=True)

        # Remote device is actively playing on /v1/me/player
        self.plugin._fetch_current_player = AsyncMock(
            return_value={
                "is_playing": True,
                "device": {"id": "phone-1", "name": "Pixel 9 Pro", "type": "Smartphone"},
            }
        )

        with patch.object(resilience.decky, "emit", new_callable=AsyncMock):
            res = await mgr.handle_wake_recovery(source="dbus")

        self.assertTrue(res["ok"])
        self.assertFalse(res["restored"])
        self.assertTrue(res["held"])
        self.assertEqual(res["held_reason"], "remote_active")
        self.assertEqual(mgr.get_status_dict()["held_reason"], "remote_active")
        self.assertIsNotNone(mgr.get_status_dict()["held_bookmark"])
        self.plugin.play_tracks.assert_not_awaited()

    async def test_d07_expiry_never_expires_and_manual_restore_dismiss(self):
        mgr = resilience.SessionBookmarkManager(
            self.plugin,
            bookmark_file=self.bookmark_path,
            cooldown_s=0.0,
        )
        # Saved 15 hours ago (> 12h default expiry)
        expired_ts = time.time() - (15 * 3600)
        mgr.snapshot_from_state(was_playing=True, position_ms=88000, saved_at=expired_ts, force=True)

        with patch.object(resilience.decky, "emit", new_callable=AsyncMock):
            # 1. Expired bookmark is held with held_reason="expired"
            res_exp = await mgr.handle_wake_recovery(source="dbus")
            self.assertFalse(res_exp["restored"])
            self.assertTrue(res_exp["held"])
            self.assertEqual(res_exp["held_reason"], "expired")
            self.plugin.play_tracks.assert_not_awaited()

            # 2. Manual restore_held_bookmark succeeds regardless of expiry
            res_manual = await mgr.restore_held_bookmark()
            self.assertTrue(res_manual["ok"])
            self.assertTrue(res_manual["restored"])
            self.assertIsNone(mgr._held_bookmark)
            self.assertIsNone(mgr._held_reason)
            self.plugin.play_tracks.assert_awaited_once_with(
                context_uri="spotify:playlist:37i9dQZF1DXcBWIGoYBM5M",
                offset_uri="spotify:track:4uLU6hMCjMI75M1A2tKUQC",
                position_ms=88000,
            )

            # 3. With resilience_bookmark_never_expires=True, 15h-old bookmark auto-resumes
            self.plugin.play_tracks.reset_mock()
            self.plugin._settings["resilience_bookmark_never_expires"] = True
            mgr.snapshot_from_state(was_playing=True, position_ms=91000, saved_at=expired_ts, force=True)
            mgr._last_recovery_ts = 0.0
            res_never = await mgr.handle_wake_recovery(source="dbus")
            self.assertTrue(res_never["restored"])
            self.plugin.play_tracks.assert_awaited_once()

            # 4. dismiss_held_bookmark clears held state
            mgr._held_bookmark = {"track_uri": "spotify:track:4uLU6hMCjMI75M1A2tKUQC"}
            mgr._held_reason = "expired"
            await mgr.dismiss_held_bookmark()
            self.assertIsNone(mgr._held_bookmark)
            self.assertIsNone(mgr._held_reason)

    async def test_unified_recovery_lock_and_cooldown_prevent_dual_restart(self):
        mgr = resilience.SessionBookmarkManager(
            self.plugin,
            bookmark_file=self.bookmark_path,
            cooldown_s=10.0,
        )
        mgr.snapshot_from_state(was_playing=True, position_ms=15000, force=True)

        async def slow_kill():
            await asyncio.sleep(0.05)

        self.plugin._kill_librespot.side_effect = slow_kill

        with patch.object(resilience.decky, "emit", new_callable=AsyncMock):
            # Fire dbus (_on_deck_resume) and watchdog (_monitor_process) concurrently
            r1, r2 = await asyncio.gather(
                mgr.handle_wake_recovery(source="dbus"),
                mgr.handle_wake_recovery(source="watchdog"),
            )

        # Exactly one recovery executed; the second was skipped by the 10s cooldown
        restored_count = sum(1 for r in (r1, r2) if r.get("restored"))
        skipped_count = sum(1 for r in (r1, r2) if r.get("skipped") == "cooldown")
        self.assertEqual(restored_count, 1)
        self.assertEqual(skipped_count, 1)
        self.plugin._kill_librespot.assert_awaited_once()
        self.plugin.start_librespot.assert_awaited_once()
        self.plugin.play_tracks.assert_awaited_once()

    async def test_plugin_resilience_rpcs_and_status_integration(self):
        from test_token_refresh import main

        plugin = main.Plugin()
        plugin._settings = dict(main.DEFAULT_SETTINGS)
        plugin._bookmark_manager = resilience.SessionBookmarkManager(plugin, bookmark_file=self.bookmark_path)
        plugin._event_server = resilience.LibrespotEventServer(plugin)
        plugin._event_server._server = MagicMock()
        plugin._event_server._running = True
        plugin._process = MagicMock(poll=MagicMock(return_value=None))

        status = await plugin.get_status()
        self.assertIn("resilience_status", status)
        self.assertEqual(status["resilience_status"]["polling_mode"], "onevent")
        self.assertEqual(status["resilience_status"]["poll_interval_s"], 20.0)
        self.assertTrue(status["settings"]["resilience_auto_resume"])
        self.assertEqual(status["settings"]["resilience_bookmark_expiry_hours"], 12)

        with patch.object(main, "_save_settings"):
            res_set = await plugin.set_setting("resilience_bookmark_expiry_hours", 8)
            self.assertTrue(res_set["ok"])
            self.assertEqual(plugin._settings["resilience_bookmark_expiry_hours"], 8)

            res_bad = await plugin.set_setting("resilience_bookmark_expiry_hours", "invalid")
            self.assertFalse(res_bad["ok"])

        plugin._bookmark_manager._held_bookmark = {
            "track_uri": "spotify:track:4uLU6hMCjMI75M1A2tKUQC",
            "context_uri": "spotify:playlist:37i9dQZF1DXcBWIGoYBM5M",
            "position_ms": 12000,
            "was_playing": True,
        }
        plugin._bookmark_manager._held_reason = "remote_active"

        r_status = await plugin.get_resilience_status()
        self.assertEqual(r_status["held_reason"], "remote_active")

        with patch.object(resilience.rpc_playback, "play_tracks", new_callable=AsyncMock) as m_play, \
             patch.object(plugin, "get_devices", new_callable=AsyncMock) as m_devs, \
             patch.object(resilience.decky, "emit", new_callable=AsyncMock):
            m_play.return_value = {"ok": True}
            m_devs.return_value = {"devices": [{"id": "d1", "name": "Deckify"}]}
            r_restore = await plugin.restore_bookmark()
            self.assertTrue(r_restore["ok"])
            self.assertTrue(r_restore["restored"])
            m_play.assert_awaited_once()

        plugin._bookmark_manager._held_bookmark = {"track_uri": "spotify:track:4uLU6hMCjMI75M1A2tKUQC"}
        plugin._bookmark_manager._held_reason = "expired"
        with patch.object(resilience.decky, "emit", new_callable=AsyncMock):
            r_dismiss = await plugin.dismiss_bookmark()
            self.assertTrue(r_dismiss["ok"])
            self.assertIsNone(plugin._bookmark_manager._held_bookmark)

