import asyncio
import json
import os
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

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
