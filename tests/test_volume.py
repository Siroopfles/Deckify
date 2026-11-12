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
