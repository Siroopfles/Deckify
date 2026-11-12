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
    from py_modules.volume import VolumeFader


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
    async def test_set_ducking_active_and_release(self, mock_run):
        mock_run.return_value = SimpleNamespace(returncode=0, stdout="", stderr="")
        self.fader._cached_sink_input_id = "42"

        # Duck (proportional 50% of 100 baseline -> target 50)
        with patch.object(self.fader, "fade_to", new_callable=AsyncMock) as mock_fade:
            await self.fader.set_ducking(True, reason="game")
            self.assertTrue(self.fader.is_ducked)
            self.assertIn("game", self.fader._duck_reasons)
            mock_fade.assert_called_once_with(50.0, 1.0)

        # Release ducking -> restore baseline 100
        with patch.object(self.fader, "fade_to", new_callable=AsyncMock) as mock_fade:
            await self.fader.set_ducking(False, reason="game")
            self.assertFalse(self.fader.is_ducked)
            self.assertEqual(len(self.fader._duck_reasons), 0)
            mock_fade.assert_called_once_with(100.0, 1.5)

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


if __name__ == "__main__":
    unittest.main()
