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
    from py_modules import common, equalizer


class TestEqualizerHelpers(unittest.TestCase):
    def test_eq_presets_and_freqs(self):
        self.assertEqual(len(equalizer.EQ_BAND_FREQS), 10)
        self.assertEqual(
            equalizer.EQ_BAND_FREQS,
            (31.0, 62.0, 125.0, 250.0, 500.0, 1000.0, 2000.0, 4000.0, 8000.0, 16000.0),
        )
        expected_keys = {
            "flat",
            "bass",
            "vocal",
            "gaming",
            "deck_speakers",
            "late_night",
            "custom",
        }
        self.assertEqual(set(equalizer.EQ_PRESETS.keys()), expected_keys)
        for name, curve in equalizer.EQ_PRESETS.items():
            self.assertEqual(len(curve), 10, f"Preset {name} must have 10 bands")
            for val in curve:
                self.assertGreaterEqual(val, -12.0)
                self.assertLessEqual(val, 12.0)

    def test_compute_preamp_db(self):
        self.assertEqual(equalizer.compute_preamp_db(equalizer.EQ_PRESETS["bass"]), -6.0)
        self.assertEqual(equalizer.compute_preamp_db(equalizer.EQ_PRESETS["vocal"]), -4.5)
        self.assertEqual(equalizer.compute_preamp_db([-3.0, -1.5, 0.0] + [0.0] * 7), 0.0)
        self.assertEqual(equalizer.compute_preamp_db([-5.0] * 10), 0.0)

    def test_clamp_eq_bands(self):
        clamped = equalizer.clamp_eq_bands([15.0, -20.0, "bad", 3.5, 0])
        self.assertEqual(len(clamped), 10)
        self.assertEqual(clamped[0], 12.0)
        self.assertEqual(clamped[1], -12.0)
        self.assertEqual(clamped[2], 0.0)
        self.assertEqual(clamped[3], 3.5)
        self.assertEqual(clamped[4:], [0.0] * 6)

    def test_generate_filter_chain_conf(self):
        conf = equalizer.generate_filter_chain_conf(
            equalizer.EQ_PRESETS["bass"], target_sink="alsa_output.pci-0000_04_00.6.analog-stereo"
        )
        self.assertIn('node.name          = "deckify_eq_sink"', conf)
        self.assertIn("priority.session   = 0", conf)
        self.assertIn("priority.driver    = 0", conf)
        self.assertIn('node.name    = "effect_output.deckify_eq"', conf)
        self.assertIn('media.name   = "deckify_eq_out"', conf)
        self.assertIn('target.object = "alsa_output.pci-0000_04_00.6.analog-stereo"', conf)
        self.assertIn("eq_preamp", conf)
        self.assertIn("bq_lowshelf", conf)
        self.assertIn("bq_peaking", conf)
        self.assertIn("bq_highshelf", conf)
        for idx in range(10):
            self.assertIn(f"eq_band_{idx}", conf)

    def test_generate_filter_chain_conf_rejects_flag_sink(self):
        conf = equalizer.generate_filter_chain_conf([0.0] * 10, target_sink="--evil-flag")
        self.assertNotIn("target.object", conf)

    def test_parse_eq_node_id(self):
        dump = json.dumps(
            [
                {"id": 12, "type": "PipeWire:Interface:Link", "info": {"props": {"node.name": "deckify_eq_sink"}}},
                {"id": 0, "type": "PipeWire:Interface:Node", "info": {"props": {"node.name": "deckify_eq_sink"}}},
                {"id": True, "type": "PipeWire:Interface:Node", "info": {"props": {"node.name": "deckify_eq_sink"}}},
                {"id": 99, "type": "PipeWire:Interface:Node", "info": {"props": {"node.name": "other_sink"}}},
                {"id": 147, "type": "PipeWire:Interface:Node", "info": {"props": {"node.name": "deckify_eq_sink"}}},
            ]
        )
        self.assertEqual(equalizer.parse_eq_node_id(dump), 147)
        self.assertIsNone(equalizer.parse_eq_node_id("not-json"))
        self.assertIsNone(equalizer.parse_eq_node_id("[]"))

    def test_build_pw_cli_params(self):
        params = equalizer.build_pw_cli_params(equalizer.EQ_PRESETS["bass"])
        self.assertIn('"eq_preamp:Mult"', params)
        self.assertIn('"eq_band_0:Gain" 5.0', params)
        self.assertIn('"eq_band_1:Gain" 6.0', params)
        self.assertIn('"eq_band_9:Gain" 1.0', params)


class TestCommonSettingsEQ(unittest.TestCase):
    def test_load_settings_accepts_all_7_presets_and_clamps_bands(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            settings_path = os.path.join(tmpdir, "settings.json")
            with patch.object(common, "SETTINGS_FILE", settings_path):
                for preset in ("flat", "bass", "vocal", "gaming", "deck_speakers", "late_night", "custom"):
                    with open(settings_path, "w", encoding="utf-8") as f:
                        json.dump(
                            {
                                "eq_preset": preset,
                                "eq_custom_bands": [20.0, -15.0, 3.5, "invalid"],
                            },
                            f,
                        )
                    loaded = common._load_settings()
                    self.assertEqual(loaded["eq_preset"], preset)
                    self.assertEqual(len(loaded["eq_custom_bands"]), 10)
                    self.assertEqual(loaded["eq_custom_bands"][0], 12.0)
                    self.assertEqual(loaded["eq_custom_bands"][1], -12.0)
                    self.assertEqual(loaded["eq_custom_bands"][2], 3.5)
                    self.assertEqual(loaded["eq_custom_bands"][3], 0.0)

                with open(settings_path, "w", encoding="utf-8") as f:
                    json.dump({"eq_preset": "unknown_preset"}, f)
                loaded = common._load_settings()
                self.assertEqual(loaded["eq_preset"], "flat")


class TestEqualizerManager(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.conf_path = os.path.join(self.tmpdir.name, "eq-filter-chain.conf")
        self.mock_plugin = SimpleNamespace(
            _process=SimpleNamespace(pid=12345),
            _spotify_client_process=None,
            _settings=dict(common.DEFAULT_SETTINGS),
        )
        self.mgr = equalizer.EqualizerManager(self.mock_plugin, conf_path=self.conf_path)

    def tearDown(self):
        self.tmpdir.cleanup()

    async def test_apply_preset_spawns_pipewire_and_flat_tears_down(self):
        fake_proc = MagicMock()
        fake_proc.pid = 5555
        fake_proc.poll.return_value = None

        pw_dump_json = json.dumps(
            [{"id": 222, "type": "PipeWire:Interface:Node", "info": {"props": {"node.name": "deckify_eq_sink"}}}]
        )

        def fake_run(cmd, **kwargs):
            joined = " ".join(cmd)
            if "pactl list short sinks" in joined:
                return SimpleNamespace(returncode=0, stdout="42\tdeckify_eq_sink\tPipeWire\ts32le 2ch 48000Hz\tRUNNING\n", stderr="")
            if "pw-dump" in joined:
                return SimpleNamespace(returncode=0, stdout=pw_dump_json, stderr="")
            if "pw-cli" in joined:
                return SimpleNamespace(returncode=0, stdout="", stderr="")
            if "pactl list sink-inputs" in joined:
                return SimpleNamespace(
                    returncode=0,
                    stdout='Sink Input #10\n    application.process.id = "12345"\n    application.name = "librespot"\n',
                    stderr="",
                )
            if "pactl move-sink-input" in joined:
                return SimpleNamespace(returncode=0, stdout="", stderr="")
            return SimpleNamespace(returncode=0, stdout="", stderr="")

        with patch("subprocess.Popen", return_value=fake_proc) as mock_popen, \
             patch("subprocess.run", side_effect=fake_run) as mock_run:
            res = await self.mgr.apply_preset("bass")
            self.assertTrue(res["ok"])
            self.assertFalse(res["bypassed"])
            self.assertTrue(os.path.exists(self.conf_path))
            mock_popen.assert_called_once()
            popen_cmd = mock_popen.call_args[0][0]
            self.assertIn("pipewire", popen_cmd)
            self.assertIn("-c", popen_cmd)
            self.assertIn(self.conf_path, popen_cmd)
            self.assertNotIn("LD_LIBRARY_PATH", mock_popen.call_args[1].get("env", {}))
            self.assertEqual(self.mgr._node_id, 222)

            # Confirm pw-cli set-param was called
            pw_cli_calls = [c[0][0] for c in mock_run.call_args_list if "pw-cli" in " ".join(c[0][0])]
            self.assertEqual(len(pw_cli_calls), 1)
            self.assertIn("222", pw_cli_calls[0])

            # Now switch to flat -> true bypass teardown
            res_flat = await self.mgr.apply_preset("flat")
            self.assertTrue(res_flat["ok"])
            self.assertTrue(res_flat["bypassed"])
            fake_proc.terminate.assert_called_once()
            self.assertIsNone(self.mgr._process)
            self.assertIsNone(self.mgr._node_id)

    async def test_set_bands_coalesces_pw_cli_and_debounces_save(self):
        fake_proc = MagicMock()
        fake_proc.poll.return_value = None
        self.mgr._process = fake_proc
        self.mgr._node_id = 333

        with patch("subprocess.run", return_value=SimpleNamespace(returncode=0, stdout="", stderr="")) as mock_run, \
             patch.object(equalizer, "_save_settings") as mock_save:
            for val in (1.0, 2.0, 3.0, 4.5):
                res = await self.mgr.set_bands([val] + [0.0] * 9)
                self.assertTrue(res["ok"])

            self.assertEqual(self.mock_plugin._settings["eq_preset"], "custom")
            self.assertEqual(self.mock_plugin._settings["eq_custom_bands"][0], 4.5)

            # Wait ~120ms: pw-cli should have fired once with final value, save should not yet
            await asyncio.sleep(0.12)
            pw_cli_calls = [c[0][0] for c in mock_run.call_args_list if "pw-cli" in " ".join(c[0][0])]
            self.assertEqual(len(pw_cli_calls), 1)
            self.assertIn('"eq_band_0:Gain" 4.5', " ".join(pw_cli_calls[0]))
            self.assertEqual(mock_save.call_count, 0)

            # Wait another ~450ms: debounced _save_settings should have fired once
            await asyncio.sleep(0.45)
            self.assertEqual(mock_save.call_count, 1)

    async def test_crash_fallback_routes_librespot_to_hardware_sink(self):
        fake_proc = MagicMock()
        fake_proc.poll.return_value = 1
        fake_proc.returncode = 1

        with patch("subprocess.Popen", return_value=fake_proc), \
             patch.object(self.mgr, "_route_librespot_to_sink", new_callable=AsyncMock) as mock_route:
            res = await self.mgr.apply_preset("bass")
            self.assertFalse(res["ok"])
            self.assertIn("error", res)
            self.assertIsNone(self.mgr._process)
            mock_route.assert_awaited()


if __name__ == "__main__":
    unittest.main()
