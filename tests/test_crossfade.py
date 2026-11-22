import json
import os
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

try:
    from test_token_refresh import main
except ImportError:
    from tests.test_token_refresh import main

from py_modules import common, engine
from py_modules.volume import VolumeFader


class TestCrossfade(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.plugin = main.Plugin()
        self.plugin._settings = dict(common.DEFAULT_SETTINGS)
        self.plugin._process = None
        self.plugin._spotify_client_process = None
        self.plugin._poll_play_state = "paused"
        self.plugin._poll_volume = 80
        self.plugin._pa_volume_boosted = False
        self.plugin._last_event = None
        self.plugin._active_device = None
        self.plugin._equalizer_manager = None
        self.plugin._soundtrack_manager = None
        self.plugin._dock_switcher = None
        self.plugin._mpris_bridge = None
        self.plugin._power_governor = None
        self.plugin._volume_fader = VolumeFader(self.plugin)
        self.plugin._crossfade_out_track_id = None

    def test_load_settings_preserves_crossfade_seconds_and_defaults_to_zero(self):
        self.assertIn("crossfade_seconds", common.DEFAULT_SETTINGS)
        self.assertEqual(common.DEFAULT_SETTINGS["crossfade_seconds"], 0)

        with tempfile.TemporaryDirectory() as tmpdir:
            settings_path = os.path.join(tmpdir, "settings.json")
            # Default when missing
            loaded_default = common._load_settings(settings_path)
            self.assertEqual(loaded_default["crossfade_seconds"], 0)

            # Preserved when saved
            with open(settings_path, "w", encoding="utf-8") as f:
                json.dump({"crossfade_seconds": 7, "mix_mode": "legacy"}, f)
            loaded_saved = common._load_settings(settings_path)
            self.assertEqual(loaded_saved["crossfade_seconds"], 7)
            self.assertNotIn("mix_mode", loaded_saved)

    async def test_set_setting_crossfade_validation_clamping_and_spotify_client_sync(self):
        with patch.object(main, "_save_settings") as mock_save, \
             patch.object(self.plugin, "_write_spotify_client_prefs") as mock_prefs, \
             patch.object(self.plugin, "_sync_spotify_client_crossfade_cdp", new=AsyncMock()) as mock_cdp:
            # Reject booleans
            res_true = await self.plugin.set_setting("crossfade_seconds", True)
            self.assertFalse(res_true["ok"])
            res_false = await self.plugin.set_setting("crossfade_seconds", False)
            self.assertFalse(res_false["ok"])

            # Reject non-integers
            res_str = await self.plugin.set_setting("crossfade_seconds", "invalid")
            self.assertFalse(res_str["ok"])

            # Clamp below 0 -> 0
            res_low = await self.plugin.set_setting("crossfade_seconds", -5)
            self.assertTrue(res_low["ok"])
            self.assertEqual(self.plugin._settings["crossfade_seconds"], 0)

            # Clamp above 12 -> 12
            res_high = await self.plugin.set_setting("crossfade_seconds", 25)
            self.assertTrue(res_high["ok"])
            self.assertEqual(self.plugin._settings["crossfade_seconds"], 12)

            # Exposed in get_status().settings
            status = await self.plugin.get_status()
            self.assertEqual(status["settings"]["crossfade_seconds"], 12)

            # librespot does not trigger spotify_client sync
            mock_prefs.assert_not_called()
            mock_cdp.assert_not_awaited()

            # spotify_client triggers prefs + CDP sync
            self.plugin._settings["audio_backend"] = "spotify_client"
            res_sc = await self.plugin.set_setting("crossfade_seconds", 6)
            self.assertTrue(res_sc["ok"])
            self.assertEqual(self.plugin._settings["crossfade_seconds"], 6)
            mock_save.assert_called()
            mock_prefs.assert_called_once()
            mock_cdp.assert_awaited_once_with(6)

    def test_update_spotify_prefs_content_writes_crossfade_keys(self):
        updated_on = engine._update_spotify_prefs_content(
            "audio.crossfade_v2=false\n",
            "320",
            gapless=True,
            normalisation=True,
            crossfade_seconds=6,
        )
        self.assertIn("audio.crossfade_v2=true", updated_on)
        self.assertIn("audio.crossfade.time_v2=6000", updated_on)

        updated_off = engine._update_spotify_prefs_content(
            updated_on,
            "320",
            gapless=True,
            normalisation=True,
            crossfade_seconds=0,
        )
        self.assertIn("audio.crossfade_v2=false", updated_off)
        self.assertIn("audio.crossfade.time_v2=0", updated_off)

    async def test_volume_fader_crossfade_respects_sleep_lock_and_target_volume(self):
        fader = self.plugin._volume_fader
        fader.fade_to = AsyncMock()
        fader._game_override = {"volume_override": 60}
        fader._duck_reasons.add("game")
        expected_target = fader._compute_target_sink_volume()

        # Sleep lock blocks both fade-out and fade-in
        fader._sleep_locked = True
        await fader.trigger_crossfade_out(4.0)
        await fader.trigger_crossfade_in(2.0)
        fader.fade_to.assert_not_awaited()
        self.assertFalse(fader._crossfade_active)

        # Unlocked: fade-out to 0.0, fade-in to _compute_target_sink_volume()
        fader._sleep_locked = False
        await fader.trigger_crossfade_out(4.0)
        self.assertTrue(fader._crossfade_active)
        fader.fade_to.assert_awaited_with(0.0, 4.0)

        await fader.trigger_crossfade_in(2.0)
        self.assertFalse(fader._crossfade_active)
        fader.fade_to.assert_awaited_with(expected_target, 2.0)

    async def test_maybe_trigger_local_crossfade_never_ducks_librespot(self):
        self.plugin._settings["audio_backend"] = "librespot"
        self.plugin._settings["crossfade_seconds"] = 5
        fader = self.plugin._volume_fader
        fader.trigger_crossfade_out = AsyncMock(
            side_effect=lambda _d: setattr(fader, "_crossfade_active", True)
        )
        fader.trigger_crossfade_in = AsyncMock(
            side_effect=lambda _d: setattr(fader, "_crossfade_active", False)
        )

        # Far from end: no fade
        await self.plugin._maybe_trigger_local_crossfade("track_a", True, 10000, 180000)
        fader.trigger_crossfade_out.assert_not_awaited()

        # Near track end on librespot: never ducks/mutes audio
        await self.plugin._maybe_trigger_local_crossfade("track_a", True, 176500, 180000)
        await self.plugin._maybe_trigger_local_crossfade("track_a", True, 178500, 180000)
        fader.trigger_crossfade_out.assert_not_awaited()
        self.assertIsNone(self.plugin._crossfade_out_track_id)

        # Stale _crossfade_active state is safely restored via trigger_crossfade_in(1.0)
        fader._crossfade_active = True
        self.plugin._crossfade_out_track_id = "track_a"
        await self.plugin._maybe_trigger_local_crossfade("track_b", True, 500, 200000)
        fader.trigger_crossfade_in.assert_awaited_once_with(1.0)
        self.assertIsNone(self.plugin._crossfade_out_track_id)


if __name__ == "__main__":
    unittest.main()
