import asyncio
import math
import os
import subprocess
import tempfile
import time
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
    from py_modules import common, volume
    from py_modules.volume import VolumeFader, VoiceActivityDetector, cosine_ease


class TestVolumeFader(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.mock_plugin = SimpleNamespace(
            _process=SimpleNamespace(pid=12345),
            _spotify_client_process=None,
            _settings=dict(common.DEFAULT_SETTINGS),
            _poll_volume=80,
            _pa_volume_boosted=False,
            _is_playing=True,
        )
        self.fader = VolumeFader(self.mock_plugin)

    def test_cosine_easing_values(self):
        # 0% progress -> 0.0 eased
        self.assertAlmostEqual(cosine_ease(0.0), 0.0, places=5)
        # 50% progress -> 0.5 eased
        self.assertAlmostEqual(cosine_ease(0.5), 0.5, places=5)
        # 100% progress -> 1.0 eased
        self.assertAlmostEqual(cosine_ease(1.0), 1.0, places=5)
        # Clamping behavior
        self.assertAlmostEqual(cosine_ease(-0.5), 0.0, places=5)
        self.assertAlmostEqual(cosine_ease(1.5), 1.0, places=5)
        # Monotonicity check
        prev = 0.0
        for step in range(1, 21):
            curr = cosine_ease(step / 20.0)
            self.assertGreaterEqual(curr, prev)
            prev = curr

    @patch("subprocess.run")
    async def test_resolve_sink_input_id_by_pid(self, mock_run):
        mock_output = (
            "Sink Input #42\n"
            "    Driver: PipeWire\n"
            "    application.process.id = \"12345\"\n"
            "    application.name = \"librespot\"\n"
        )
        mock_run.return_value = SimpleNamespace(returncode=0, stdout=mock_output, stderr="")
        sink_id = await self.fader.resolve_sink_input_id()
        self.assertEqual(sink_id, "42")

    @patch("subprocess.run")
    async def test_resolve_sink_input_id_pid_prioritized_over_earlier_name_match(self, mock_run):
        # Sink #1 has name "spotify" but foreign PID "9999"
        # Sink #2 has name "librespot" and matches our process PID "12345"
        mock_output = (
            "Sink Input #1\n"
            "    Driver: PipeWire\n"
            "    application.name = \"spotify\"\n"
            "    application.process.id = \"9999\"\n"
            "Sink Input #2\n"
            "    Driver: PipeWire\n"
            "    application.name = \"librespot\"\n"
            "    application.process.id = \"12345\"\n"
        )
        mock_run.return_value = SimpleNamespace(returncode=0, stdout=mock_output, stderr="")
        sink_id = await self.fader.resolve_sink_input_id()
        self.assertEqual(sink_id, "2")

    @patch("subprocess.run")
    async def test_resolve_sink_input_id_by_app_name(self, mock_run):
        mock_output = (
            "Sink Input #99\n"
            "    Driver: PipeWire\n"
            "    application.name = \"spotify\"\n"
        )
        mock_run.return_value = SimpleNamespace(returncode=0, stdout=mock_output, stderr="")
        self.mock_plugin._process = None
        sink_id = await self.fader.resolve_sink_input_id()
        self.assertEqual(sink_id, "99")

    @patch("subprocess.run")
    async def test_resolve_sink_input_id_none_when_empty(self, mock_run):
        mock_run.return_value = SimpleNamespace(returncode=0, stdout="", stderr="")
        sink_id = await self.fader.resolve_sink_input_id()
        self.assertIsNone(sink_id)

    @patch("subprocess.run")
    async def test_resolve_sink_input_id_exception_handling(self, mock_run):
        mock_run.side_effect = Exception("pactl list error")
        sink_id = await self.fader.resolve_sink_input_id()
        self.assertIsNone(sink_id)

    @patch("subprocess.run")
    async def test_resolve_sink_input_id_skips_steamwebhelper_and_chromium_for_spotify_client(self, mock_run):
        mock_output = (
            "Sink Input #10\n"
            "    Driver: PipeWire\n"
            "    application.name = \"Chromium\"\n"
            "    application.process.binary = \"steamwebhelper\"\n"
            "    media.name = \"spotify\"\n"
            "Sink Input #11\n"
            "    Driver: PipeWire\n"
            "    application.name = \"Chromium\"\n"
            "    application.process.binary = \"chromium\"\n"
            "Sink Input #12\n"
            "    Driver: PipeWire\n"
            "    application.name = \"Spotify\"\n"
            "    node.name = \"com.spotify.client\"\n"
        )
        mock_run.return_value = SimpleNamespace(returncode=0, stdout=mock_output, stderr="")
        self.mock_plugin._process = None
        sink_id = await self.fader.resolve_sink_input_id()
        self.assertEqual(sink_id, "12")

    @patch("subprocess.run")
    async def test_resolve_sink_input_id_matches_deckify_eq_out(self, mock_run):
        mock_output = (
            "Sink Input #21\n"
            "    Driver: PipeWire\n"
            "    application.name = \"steamwebhelper\"\n"
            "Sink Input #22\n"
            "    Driver: PipeWire\n"
            "    node.name = \"deckify_eq_out\"\n"
        )
        mock_run.return_value = SimpleNamespace(returncode=0, stdout=mock_output, stderr="")
        self.mock_plugin._process = None
        sink_id = await self.fader.resolve_sink_input_id()
        self.assertEqual(sink_id, "22")

    @patch("subprocess.run")
    async def test_apply_sink_volume_failure_handles_gracefully(self, mock_run):
        mock_run.side_effect = Exception("pactl set-volume error")
        res = await self.fader._apply_sink_volume("42", 50.0)
        self.assertFalse(res)

    @patch("subprocess.run")
    async def test_fade_to_pactl_unavailable_fallback(self, mock_run):
        # When pactl is unavailable (returns None sink id), fade_to applies volume directly
        mock_run.return_value = SimpleNamespace(returncode=1, stdout="", stderr="pactl not found")
        with patch.object(self.fader, "_emit_state", new_callable=AsyncMock) as mock_emit:
            await self.fader.fade_to(35.0, 1.0)
            await self.fader._fade_task
            self.assertEqual(self.fader._current_sink_volume, 35.0)
            mock_emit.assert_called_once()

    @patch("subprocess.run")
    async def test_apply_sink_volume_sanitization(self, mock_run):
        mock_run.return_value = SimpleNamespace(returncode=0, stdout="", stderr="")
        # T-06-02: Non-numeric sink ID rejected
        res = await self.fader._apply_sink_volume("42; rm -rf /", 50.0)
        self.assertFalse(res)
        self.assertEqual(mock_run.call_count, 0)

        # Valid numeric ID passes
        res = await self.fader._apply_sink_volume("42", 50.0)
        self.assertTrue(res)
        self.assertEqual(mock_run.call_count, 1)

    @patch("subprocess.run")
    async def test_sink_input_caching_eliminates_repeat_forks(self, mock_run):
        # T-06-01: pactl list sink-inputs must only be called once, then pactl set-sink-input-volume on ticks
        list_output = 'Sink Input #77\napplication.process.id = "12345"\n'
        mock_run.side_effect = [
            SimpleNamespace(returncode=0, stdout=list_output, stderr=""),  # list sink-inputs
            SimpleNamespace(returncode=0, stdout="", stderr=""),  # set volume tick 1
            SimpleNamespace(returncode=0, stdout="", stderr=""),  # set volume tick 2
            SimpleNamespace(returncode=0, stdout="", stderr=""),  # set volume tick 3
        ]

        with patch.object(self.fader, "_emit_state", new_callable=AsyncMock):
            # Run a fast 100ms fade (2-3 ticks)
            await self.fader.fade_to(50.0, 0.1)
            await self.fader._fade_task

        # Verify pactl list sink-inputs was invoked exactly once
        list_calls = [
            call for call in mock_run.call_args_list
            if "list" in call[0][0]
        ]
        self.assertEqual(len(list_calls), 1)

    async def test_fade_interruption_smooth_continuity(self):
        # Interruption safety: cancelling mid-flight does not reset or jump volume
        self.fader._current_sink_volume = 100.0
        self.fader._cached_sink_input_id = "42"

        with patch.object(self.fader, "_apply_sink_volume", new_callable=AsyncMock) as mock_apply, \
             patch.object(self.fader, "_emit_state", new_callable=AsyncMock):
            mock_apply.return_value = True

            # Start a long fade down from 100.0 to 10.0 (over 2.0s)
            await self.fader.fade_to(10.0, 2.0)
            await asyncio.sleep(0.12)  # Let a couple ticks progress

            mid_volume = self.fader._current_sink_volume
            self.assertLess(mid_volume, 100.0)
            self.assertGreater(mid_volume, 10.0)

            # Interrupt with a quick fade back up to 100.0
            await self.fader.fade_to(100.0, 0.08)
            await self.fader._fade_task

            # End volume reached 100.0 smoothly
            self.assertAlmostEqual(self.fader._current_sink_volume, 100.0, delta=1.0)

    @patch("subprocess.run")
    async def test_calculation_mode_fixed_vs_proportional(self, mock_run):
        mock_run.return_value = SimpleNamespace(returncode=0, stdout="", stderr="")

        # 1. Proportional mode (default): 50% attenuation of 80% listening volume -> 40% effective
        self.mock_plugin._settings["ducking_mode"] = "proportional"
        self.mock_plugin._settings["ducking_proportional_pct"] = 50
        with patch.object(self.fader, "fade_to", new_callable=AsyncMock) as mock_fade:
            await self.fader.set_ducking(True, reason="game")
            mock_fade.assert_called_once_with(50.0, 1.0)

        # 2. Fixed mode (D-05): target 25% fixed volume with base listening volume at 80%
        # factor = 25 / 80 = 0.3125, target_sink_vol = 100 * 0.3125 = 31.25
        self.mock_plugin._settings["ducking_mode"] = "fixed"
        self.mock_plugin._settings["auto_ducking_volume"] = 25
        self.mock_plugin._poll_volume = 80
        with patch.object(self.fader, "fade_to", new_callable=AsyncMock) as mock_fade:
            await self.fader.set_ducking(True, reason="game")
            mock_fade.assert_called_once_with(31.25, 1.0)

    @patch("subprocess.run")
    async def test_zero_duration_direct_application(self, mock_run):
        self.fader._cached_sink_input_id = "42"
        with patch.object(self.fader, "_apply_sink_volume", new_callable=AsyncMock) as mock_apply, \
             patch.object(self.fader, "_emit_state", new_callable=AsyncMock) as mock_emit:
            mock_apply.return_value = True
            await self.fader.fade_to(30.0, 0.0)
            await self.fader._fade_task
            self.assertEqual(self.fader._current_sink_volume, 30.0)
            mock_apply.assert_called_once_with("42", 30.0)
            mock_emit.assert_called_once()

    async def test_emit_state(self):
        self.fader._current_sink_volume = 50.0  # 50% of 100 baseline
        self.mock_plugin._poll_volume = 80
        self.fader._duck_reasons.add("game")

        with patch.object(volume.decky, "emit", new_callable=AsyncMock) as mock_emit:
            await self.fader._emit_state()
            mock_emit.assert_called_once_with("ducking_state_changed", {
                "is_ducked": True,
                "effective_volume": 40,  # 80 * (50/100) = 40
                "base_volume": 80,
                "duck_reasons": ["game"],
                "has_game_override": False,
            })

    async def test_boost_pa_volume_synchronizes_fader_volume(self):
        self.mock_plugin._set_pa_volume_percent = AsyncMock(return_value=True)
        self.mock_plugin._volume_fader = self.fader
        self.fader._current_sink_volume = 100.0
        self.fader._target_sink_volume = 100.0
        self.assertFalse(self.fader.is_ducked)

        await volume.boost_pa_volume(self.mock_plugin)
        self.assertTrue(self.mock_plugin._pa_volume_boosted)
        self.assertEqual(self.fader._current_sink_volume, 150.0)
        self.assertEqual(self.fader._target_sink_volume, 150.0)

    def test_effective_volume_with_boosted_pa_volume(self):
        self.mock_plugin._pa_volume_boosted = True
        self.fader._current_sink_volume = 150.0
        self.mock_plugin._poll_volume = 80
        # When unducked at 150% sink vol with 150% baseline -> ratio 1.0 -> 80
        self.assertEqual(self.fader.effective_volume, 80)

        # When ducked to 75% sink vol with 150% baseline -> ratio 0.5 -> 40
        self.fader._current_sink_volume = 75.0
        self.assertEqual(self.fader.effective_volume, 40)

    async def test_sleep_lock_blocks_ducking_fades_and_tracks_reasons(self):
        self.fader.resolve_sink_input_id = AsyncMock(return_value="42")
        self.fader._apply_sink_volume = AsyncMock(return_value=True)

        await self.fader.start_sleep_fade(0.05)

        self.assertTrue(self.fader._sleep_locked)
        self.assertAlmostEqual(self.fader._current_sink_volume, 0.0, places=2)

        with patch.object(self.fader, "fade_to", new_callable=AsyncMock) as mock_fade_to:
            await self.fader.set_ducking(True, reason="game")
            self.assertIn("game", self.fader._duck_reasons)
            mock_fade_to.assert_not_called()
            self.assertAlmostEqual(self.fader._current_sink_volume, 0.0, places=2)

            await self.fader.set_ducking(True, reason="voice")
            self.assertIn("voice", self.fader._duck_reasons)
            await self.fader.set_ducking(False, reason="voice")
            self.assertNotIn("voice", self.fader._duck_reasons)
            self.assertIn("game", self.fader._duck_reasons)
            mock_fade_to.assert_not_called()

    async def test_release_sleep_lock_restores_ducked_or_baseline(self):
        self.fader.resolve_sink_input_id = AsyncMock(return_value="42")
        self.fader._apply_sink_volume = AsyncMock(return_value=True)

        # Case 1: _duck_reasons non-empty -> restores to ducked target (50% of 100 = 50.0)
        await self.fader.start_sleep_fade(0.0)
        await self.fader.set_ducking(True, reason="game")
        await self.fader.release_sleep_lock(0.05, wait=True)

        self.assertFalse(self.fader._sleep_locked)
        self.assertAlmostEqual(self.fader._current_sink_volume, 50.0, places=2)

        # Case 2: _duck_reasons empty -> restores to full baseline (100.0)
        await self.fader.start_sleep_fade(0.0)
        await self.fader.set_ducking(False, reason="game")
        await self.fader.release_sleep_lock(0.0, wait=True)

        self.assertFalse(self.fader._sleep_locked)
        self.assertAlmostEqual(self.fader._current_sink_volume, 100.0, places=2)

    async def test_game_override_ceiling_without_ducking_and_emit_state(self):
        self.fader._cached_sink_input_id = "42"
        with patch.object(self.fader, "fade_to", new_callable=AsyncMock) as mock_fade:
            await self.fader.apply_game_override(
                active_duck=False,
                volume_override=65,
                ducking_override=False,
                ducking_level_override=None,
            )
            mock_fade.assert_awaited_once_with(65.0, 1.0)
        self.assertTrue(self.fader.has_game_override)
        self.assertFalse(self.fader.is_ducked)

        self.fader._current_sink_volume = 65.0
        self.mock_plugin._poll_volume = 80
        with patch.object(volume.decky, "emit", new_callable=AsyncMock) as mock_emit:
            await self.fader._emit_state()
            mock_emit.assert_called_once_with("ducking_state_changed", {
                "is_ducked": False,
                "effective_volume": 52,  # 80 * 0.65
                "base_volume": 80,
                "duck_reasons": [],
                "has_game_override": True,
            })

    async def test_game_override_ceiling_plus_custom_attenuation_and_clamping(self):
        with patch.object(self.fader, "fade_to", new_callable=AsyncMock) as mock_fade:
            await self.fader.apply_game_override(
                active_duck=True,
                volume_override=80,
                ducking_override=True,
                ducking_level_override=40,
            )
            mock_fade.assert_awaited_once()
            self.assertAlmostEqual(mock_fade.await_args.args[0], 48.0, places=5)

        # Out-of-range clamping and bool rejection + float precision retention
        with patch.object(self.fader, "fade_to", new_callable=AsyncMock) as mock_fade:
            await self.fader.apply_game_override(
                active_duck=True,
                volume_override=105,
                ducking_override=True,
                ducking_level_override=99,
            )
            self.assertEqual(self.fader._game_override["volume_override"], 100)
            self.assertEqual(self.fader._game_override["ducking_level_override"], 95)
            self.assertAlmostEqual(mock_fade.await_args.args[0], 5.0, places=5)

        with patch.object(self.fader, "fade_to", new_callable=AsyncMock) as mock_fade:
            await self.fader.apply_game_override(
                active_duck=True,
                volume_override=True,
                ducking_override=True,
                ducking_level_override=-5,
            )
            self.assertIsNone(self.fader._game_override["volume_override"])
            self.assertEqual(self.fader._game_override["ducking_level_override"], 0)
            self.assertAlmostEqual(mock_fade.await_args.args[0], 100.0, places=5)

        # Floating point precision retained before final int rounding
        await self.fader.apply_game_override(
            active_duck=True,
            volume_override=75,
            ducking_override=True,
            ducking_level_override=35,
        )
        self.assertAlmostEqual(self.fader._compute_target_sink_volume(), 48.75, places=5)

    async def test_voice_vad_dips_further_beneath_game_ceiling_and_ducking(self):
        self.mock_plugin._settings["ducking_mode"] = "proportional"
        self.mock_plugin._settings["ducking_proportional_pct"] = 50
        with patch.object(self.fader, "fade_to", new_callable=AsyncMock):
            # Ceiling 80%, no game ducking -> 80.0
            await self.fader.apply_game_override(
                active_duck=False, volume_override=80, ducking_override=False
            )
            self.assertAlmostEqual(self.fader._compute_target_sink_volume(), 80.0, places=5)
            # Voice 50% dips beneath ceiling -> 80 * 0.50 = 40.0
            await self.fader.set_ducking(True, reason="voice")
            self.assertAlmostEqual(self.fader._compute_target_sink_volume(), 40.0, places=5)
            # Deeper game ducking (80% -> factor 0.20 => 16.0) stays at 16.0 even with voice active
            await self.fader.apply_game_override(
                active_duck=True, volume_override=80, ducking_override=True, ducking_level_override=80
            )
            self.assertAlmostEqual(self.fader._compute_target_sink_volume(), 16.0, places=5)

    async def test_clear_game_override_and_set_ducking_idempotency(self):
        with patch.object(self.fader, "fade_to", new_callable=AsyncMock) as mock_fade:
            # Already clean -> no-op
            await self.fader.clear_game_override()
            await self.fader.set_ducking(False, reason="game")
            mock_fade.assert_not_called()

            # Apply then clear -> clears once, second clear is no-op
            await self.fader.apply_game_override(active_duck=True, volume_override=65, ducking_override=True)
            mock_fade.reset_mock()
            await self.fader.clear_game_override()
            mock_fade.assert_awaited_once_with(100.0, 1.5)
            self.assertFalse(self.fader.has_game_override)

            mock_fade.reset_mock()
            await self.fader.clear_game_override()
            await self.fader.set_ducking(False, reason="game")
            mock_fade.assert_not_called()

    async def test_sleep_lock_blocks_game_override_fades_and_restores_on_release(self):
        self.fader.resolve_sink_input_id = AsyncMock(return_value="42")
        self.fader._apply_sink_volume = AsyncMock(return_value=True)

        await self.fader.start_sleep_fade(0.0)
        with patch.object(self.fader, "fade_to", new_callable=AsyncMock) as mock_fade:
            await self.fader.apply_game_override(
                active_duck=True, volume_override=80, ducking_override=True, ducking_level_override=50
            )
            mock_fade.assert_not_called()
            self.assertTrue(self.fader.has_game_override)

        await self.fader.release_sleep_lock(0.0, wait=True)
        # 80% ceiling * 50% duck = 40.0
        self.assertAlmostEqual(self.fader._current_sink_volume, 40.0, places=2)

        await self.fader.start_sleep_fade(0.0)
        with patch.object(self.fader, "fade_to", new_callable=AsyncMock) as mock_fade:
            await self.fader.clear_game_override()
            mock_fade.assert_not_called()
            self.assertFalse(self.fader.has_game_override)

        await self.fader.release_sleep_lock(0.0, wait=True)
        self.assertAlmostEqual(self.fader._current_sink_volume, 100.0, places=2)


class test_volume_fader(TestVolumeFader):
    """Alias for -k test_volume_fader CLI filtering."""
    pass


class TestVoiceActivityDetector(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.mock_plugin = SimpleNamespace(
            _process=SimpleNamespace(pid=12345),
            _spotify_client_process=None,
            _settings=dict(common.DEFAULT_SETTINGS),
            _poll_volume=80,
            _pa_volume_boosted=False,
            _is_playing=True,
            _poll_play_state="playing",
        )
        self.mock_fader = AsyncMock(spec=VolumeFader)
        self.mock_fader.set_ducking = AsyncMock()
        self.vad = VoiceActivityDetector(self.mock_plugin, self.mock_fader)

    @patch("subprocess.run")
    async def test_vad_identifies_active_discord_stream(self, mock_run):
        output = (
            "Source Output #1\n"
            "    Driver: PipeWire\n"
            "    Corked: no\n"
            "    Mute: no\n"
            "    application.name = \"Discord\"\n"
        )
        mock_run.return_value = SimpleNamespace(returncode=0, stdout=output, stderr="")
        active = await self.vad.check_recording_streams()
        self.assertTrue(active)

    @patch("subprocess.run")
    async def test_vad_identifies_other_voice_streams(self, mock_run):
        for app in ("steamcord", "steam", "steamwebhelper", "webrtc"):
            output = (
                f"Source Output #42\n"
                f"    Corked: no\n"
                f"    Mute: no\n"
                f"    application.name = \"{app}\"\n"
            )
            mock_run.return_value = SimpleNamespace(returncode=0, stdout=output, stderr="")
            self.assertTrue(await self.vad.check_recording_streams(), f"Expected {app} to be recognized as voice")

    @patch("subprocess.run")
    async def test_vad_ignores_corked_and_muted_streams(self, mock_run):
        output = (
            "Source Output #1\n"
            "    Corked: yes\n"
            "    Mute: no\n"
            "    application.name = \"Discord\"\n"
            "Source Output #2\n"
            "    Corked: no\n"
            "    Mute: yes\n"
            "    application.name = \"Steam\"\n"
        )
        mock_run.return_value = SimpleNamespace(returncode=0, stdout=output, stderr="")
        active = await self.vad.check_recording_streams()
        self.assertFalse(active)

    @patch("subprocess.run")
    async def test_vad_ignores_non_voice_streams(self, mock_run):
        output = (
            "Source Output #5\n"
            "    Corked: no\n"
            "    Mute: no\n"
            "    application.name = \"OBS Studio\"\n"
        )
        mock_run.return_value = SimpleNamespace(returncode=0, stdout=output, stderr="")
        active = await self.vad.check_recording_streams()
        self.assertFalse(active)

    @patch("subprocess.run")
    async def test_vad_handles_pactl_error_gracefully(self, mock_run):
        mock_run.side_effect = Exception("pactl failure")
        active = await self.vad.check_recording_streams()
        self.assertFalse(active)

    async def test_vad_silence_hold_hysteresis(self):
        # Default hold delay is 1.2s per D-03
        self.mock_plugin._settings["voice_ducking_hold_delay"] = 1.2
        self.vad.check_recording_streams = AsyncMock()

        t0 = 1000.0
        # Step 1: Voice active -> triggers ducking
        with patch("time.monotonic", return_value=t0):
            self.vad.check_recording_streams.return_value = True
            delay = await self.vad._poll_step()
            self.assertEqual(delay, 0.35)
            self.assertTrue(self.vad.is_voice_active)
            self.mock_fader.set_ducking.assert_called_once_with(True, reason="voice")

        # Step 2: Voice ceases, but only 0.8s has elapsed (< 1.2s) -> stays ducked, no release
        self.mock_fader.set_ducking.reset_mock()
        with patch("time.monotonic", return_value=t0 + 0.8):
            self.vad.check_recording_streams.return_value = False
            delay = await self.vad._poll_step()
            self.assertEqual(delay, 0.35)
            self.assertTrue(self.vad.is_voice_active)
            self.mock_fader.set_ducking.assert_not_called()

        # Step 3: Voice ceases, 1.25s has elapsed (>= 1.2s) -> releases ducking
        with patch("time.monotonic", return_value=t0 + 1.25):
            self.vad.check_recording_streams.return_value = False
            delay = await self.vad._poll_step()
            self.assertEqual(delay, 0.35)
            self.assertFalse(self.vad.is_voice_active)
            self.mock_fader.set_ducking.assert_called_once_with(False, reason="voice")

    async def test_vad_power_throttling(self):
        # 1. voice_ducking_enabled is False -> 2.0s sleep
        self.mock_plugin._settings["voice_ducking_enabled"] = False
        delay = await self.vad._poll_step()
        self.assertEqual(delay, 2.0)

        # 2. _is_playing is False -> 1.0s sleep
        self.mock_plugin._settings["voice_ducking_enabled"] = True
        self.mock_plugin._is_playing = False
        self.mock_plugin._poll_play_state = "paused"
        delay = await self.vad._poll_step()
        self.assertEqual(delay, 1.0)

    async def test_vad_clears_ducking_when_playback_paused_during_speech(self):
        self.vad._voice_active = True
        self.mock_plugin._is_playing = False
        self.mock_plugin._poll_play_state = "paused"

        delay = await self.vad._poll_step()
        self.assertEqual(delay, 1.0)
        self.assertFalse(self.vad.is_voice_active)
        self.mock_fader.set_ducking.assert_called_once_with(False, reason="voice")

        # 3. Active playing -> 0.35s sleep
        self.mock_plugin._is_playing = True
        self.mock_plugin._poll_play_state = "playing"
        self.vad.check_recording_streams = AsyncMock(return_value=False)
        delay = await self.vad._poll_step()
        self.assertEqual(delay, 0.35)

    async def test_vad_lifecycle_start_stop(self):
        self.assertIsNone(self.vad._worker_task)
        self.vad.start()
        self.assertIsNotNone(self.vad._worker_task)
        self.assertFalse(self.vad._worker_task.done())
        await self.vad.stop()
        self.assertIsNone(self.vad._worker_task)


class test_vad(TestVoiceActivityDetector):
    """Alias for -k test_vad CLI filtering."""
    pass


if __name__ == "__main__":
    unittest.main()
