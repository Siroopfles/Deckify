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
    from py_modules import common, engine, equalizer, volume


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

        # Boundary values, rounding to 2 decimals, bool/NaN/Inf rejection
        edge = equalizer.clamp_eq_bands([12.1, -12.1, 1.236, float("nan"), float("inf"), True, -12.0, 12.0])
        self.assertEqual(edge[:8], [12.0, -12.0, 1.24, 0.0, 0.0, 0.0, -12.0, 12.0])

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

    def test_load_settings_validates_active_game_override_snapshot(self):
        self.assertIn("active_game_override_snapshot", common.DEFAULT_SETTINGS)
        self.assertIsNone(common.DEFAULT_SETTINGS["active_game_override_snapshot"])
        self.assertTrue(common.EQ_PID_FILE.endswith("eq.pid"))
        self.assertEqual(equalizer.EQ_PID_FILE, common.EQ_PID_FILE)

        with tempfile.TemporaryDirectory() as tmpdir:
            settings_path = os.path.join(tmpdir, "settings.json")
            with patch.object(common, "SETTINGS_FILE", settings_path):
                valid_snap = {"app_id": 1091500, "eq_preset": "gaming"}
                with open(settings_path, "w", encoding="utf-8") as f:
                    json.dump({"active_game_override_snapshot": valid_snap}, f)
                self.assertEqual(common._load_settings()["active_game_override_snapshot"], valid_snap)

                for bad in ("bad", 123, {"app_id": True}, {"app_id": 0}, {"app_id": -5}, {"app_id": 2 ** 33}, {}):
                    with open(settings_path, "w", encoding="utf-8") as f:
                        json.dump({"active_game_override_snapshot": bad}, f)
                    self.assertIsNone(common._load_settings()["active_game_override_snapshot"], f"Expected None for {bad}")


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
            self.assertTrue(os.path.exists(self.mgr.pid_path))

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
            self.assertFalse(os.path.exists(self.mgr.pid_path))

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

    async def test_ephemeral_preset_isolation_and_clear_restores_global(self):
        self.mock_plugin._settings["eq_preset"] = "vocal"
        self.mock_plugin._settings["eq_custom_bands"] = [1.0] * 10
        applied: list[tuple[str, list[float] | None]] = []

        async def fake_apply(preset, custom_bands=None):
            applied.append((preset, custom_bands))
            return {"ok": True, "preset": preset}

        with patch.object(self.mgr, "apply_preset", side_effect=fake_apply) as mock_apply:
            res = await self.mgr.apply_ephemeral_preset("gaming", app_id=1091500, app_name="Cyberpunk 2077")
            self.assertTrue(res["ok"])
            self.assertTrue(self.mgr.has_ephemeral_override)
            self.assertEqual(
                self.mgr.get_active_override_info(),
                {"app_id": 1091500, "app_name": "Cyberpunk 2077", "eq_preset": "gaming"},
            )
            # Global settings untouched
            self.assertEqual(self.mock_plugin._settings["eq_preset"], "vocal")
            self.assertEqual(self.mock_plugin._settings["eq_custom_bands"], [1.0] * 10)

            # Repeated identical call is idempotent
            res2 = await self.mgr.apply_ephemeral_preset("gaming", app_id=1091500, app_name="Cyberpunk 2077")
            self.assertTrue(res2["ok"])
            self.assertEqual(mock_apply.await_count, 1)

            # Custom ephemeral bands stay isolated from global custom bands
            custom_curve = [4.0, 2.0] + [0.0] * 8
            await self.mgr.apply_ephemeral_preset("custom", custom_bands=custom_curve, app_id=1091500, app_name="Cyberpunk 2077")
            self.assertEqual(self.mock_plugin._settings["eq_custom_bands"], [1.0] * 10)
            self.assertEqual(applied[-1], ("custom", custom_curve))

            # Clear restores global preset ("vocal")
            await self.mgr.clear_ephemeral_override()
            self.assertFalse(self.mgr.has_ephemeral_override)
            self.assertIsNone(self.mgr.get_active_override_info())
            self.assertEqual(applied[-1], ("vocal", None))

            # Repeated clear is idempotent
            before = mock_apply.await_count
            res_noop = await self.mgr.clear_ephemeral_override()
            self.assertEqual(res_noop, {"ok": True, "restored": False})
            self.assertEqual(mock_apply.await_count, before)

    async def test_settings_tab_global_isolation_during_game_override(self):
        self.mock_plugin._equalizer_manager = self.mgr
        self.mock_plugin._settings["eq_preset"] = "flat"
        self.mgr._ephemeral_preset = "gaming"
        self.mgr._ephemeral_app_id = 1091500

        with patch.object(self.mgr, "apply_preset", new_callable=AsyncMock) as mock_apply, \
             patch.object(volume, "_save_settings") as mock_vol_save, \
             patch.object(equalizer, "_save_settings") as mock_eq_save, \
             patch.object(volume.decky, "emit", new_callable=AsyncMock):
            res = await volume.apply_equalizer_preset(self.mock_plugin, "vocal")
            self.assertTrue(res["ok"])
            self.assertTrue(res.get("deferred_by_game_override"))
            self.assertEqual(self.mock_plugin._settings["eq_preset"], "vocal")
            mock_vol_save.assert_called_once()
            mock_apply.assert_not_awaited()

            res_bands = await self.mgr.set_bands([3.0] * 10)
            self.assertTrue(res_bands["ok"])
            self.assertTrue(res_bands.get("deferred_by_game_override"))
            self.assertEqual(self.mock_plugin._settings["eq_preset"], "custom")
            self.assertEqual(self.mock_plugin._settings["eq_custom_bands"], [3.0] * 10)
            mock_apply.assert_not_awaited()
            await asyncio.sleep(0.55)
            self.assertEqual(mock_eq_save.call_count, 1)

            # Once game exits, clear_ephemeral_override restores the updated global "custom" preset
            await self.mgr.clear_ephemeral_override()
            mock_apply.assert_awaited_once_with("custom")

    async def test_preview_bands_and_clear_preview_restore_and_idempotency(self):
        fake_proc = MagicMock()
        fake_proc.poll.return_value = None
        self.mgr._process = fake_proc
        self.mgr._node_id = 333
        self.mock_plugin._settings["eq_preset"] = "flat"
        self.mock_plugin._settings["eq_custom_bands"] = [0.0] * 10

        with patch("subprocess.run", return_value=SimpleNamespace(returncode=0, stdout="", stderr="")) as mock_run, \
             patch.object(equalizer, "_save_settings") as mock_save, \
             patch.object(self.mgr, "apply_preset", new_callable=AsyncMock, return_value={"ok": True}) as mock_apply:
            res = await self.mgr.preview_bands([6.0, -3.0] + [0.0] * 8)
            self.assertTrue(res["ok"])
            self.assertTrue(self.mgr._preview_active)
            # Global settings untouched
            self.assertEqual(self.mock_plugin._settings["eq_preset"], "flat")
            self.assertEqual(self.mock_plugin._settings["eq_custom_bands"], [0.0] * 10)
            await asyncio.sleep(0.12)
            mock_save.assert_not_called()
            pw_cli_calls = [c[0][0] for c in mock_run.call_args_list if "pw-cli" in " ".join(c[0][0])]
            self.assertEqual(len(pw_cli_calls), 1)

            # Clear preview restores global preset when no game override
            await self.mgr.clear_preview()
            self.assertFalse(self.mgr._preview_active)
            mock_apply.assert_awaited_once_with("flat")

            # Repeated clear_preview is a no-op
            mock_apply.reset_mock()
            res2 = await self.mgr.clear_preview()
            self.assertEqual(res2, {"ok": True, "restored": False})
            mock_apply.assert_not_awaited()

            # When ephemeral override is active, clear_preview restores ephemeral override
            self.mgr._ephemeral_preset = "custom"
            self.mgr._ephemeral_bands = [2.0] * 10
            await self.mgr.preview_bands([5.0] * 10)
            await self.mgr.clear_preview()
            mock_apply.assert_awaited_once_with("custom", custom_bands=[2.0] * 10)

    async def test_route_librespot_to_eq_preserves_ephemeral_override(self):
        self.mock_plugin._settings["eq_preset"] = "flat"
        self.mgr._ephemeral_preset = "custom"
        self.mgr._ephemeral_bands = [2.5] * 10
        with patch.object(self.mgr, "apply_preset", new_callable=AsyncMock, return_value={"ok": True}) as mock_apply:
            ok = await self.mgr.route_librespot_to_eq()
            self.assertTrue(ok)
            mock_apply.assert_awaited_once_with("custom", custom_bands=[2.5] * 10)

    async def test_eq_pid_lifecycle_and_cleanup_stale_process(self):
        with open(self.mgr.pid_path, "w", encoding="utf-8") as f:
            f.write("98765")
        with patch("os.kill") as mock_kill, \
             patch.object(self.mgr, "_fallback_to_hardware_sink", new_callable=AsyncMock) as mock_fb:
            await self.mgr.cleanup_stale_process()
            mock_fb.assert_awaited_once()
            self.assertEqual(mock_kill.call_args_list[0][0], (98765, 0))
            self.assertEqual(mock_kill.call_args_list[1][0], (98765, 15))
            self.assertFalse(os.path.exists(self.mgr.pid_path))

        # Corrupted 0 / -1 PIDs must never call os.kill
        for bad_pid in ("0", "-1"):
            with open(self.mgr.pid_path, "w", encoding="utf-8") as f:
                f.write(bad_pid)
            with patch("os.kill") as mock_kill:
                await self.mgr.cleanup_stale_process()
                mock_kill.assert_not_called()
                self.assertFalse(os.path.exists(self.mgr.pid_path))

    async def test_cleanup_stale_process_verifies_proc_cmdline_before_sigterm(self):
        import builtins
        import io

        orig_exists = os.path.exists
        orig_open = builtins.open
        cmdline_target = "/proc/98765/cmdline"

        # 1. Recycled PID belonging to unrelated process -> skip SIGTERM, clear pid
        with open(self.mgr.pid_path, "w", encoding="utf-8") as f:
            f.write("98765")

        def fake_open_other(path, mode="r", *args, **kwargs):
            if path == cmdline_target:
                return io.BytesIO(b"/usr/lib/systemd/systemd\x00--user\x00")
            return orig_open(path, mode, *args, **kwargs)

        with patch("os.kill") as mock_kill, \
             patch("os.path.exists", side_effect=lambda p: True if p == cmdline_target else orig_exists(p)), \
             patch("builtins.open", side_effect=fake_open_other), \
             patch.object(self.mgr, "_fallback_to_hardware_sink", new_callable=AsyncMock) as mock_fb:
            await self.mgr.cleanup_stale_process()
            mock_fb.assert_not_awaited()
            self.assertEqual(mock_kill.call_args_list, [unittest.mock.call(98765, 0)])
            self.assertFalse(os.path.exists(self.mgr.pid_path))

        # 2. Matching pipewire process -> fallback and send SIGTERM
        with open(self.mgr.pid_path, "w", encoding="utf-8") as f:
            f.write("98765")

        def fake_open_pipewire(path, mode="r", *args, **kwargs):
            if path == cmdline_target:
                return io.BytesIO(b"pipewire\x00-c\x00/home/deck/.config/deckify/eq-filter-chain.conf\x00")
            return orig_open(path, mode, *args, **kwargs)

        with patch("os.kill") as mock_kill, \
             patch("os.path.exists", side_effect=lambda p: True if p == cmdline_target else orig_exists(p)), \
             patch("builtins.open", side_effect=fake_open_pipewire), \
             patch.object(self.mgr, "_fallback_to_hardware_sink", new_callable=AsyncMock) as mock_fb:
            await self.mgr.cleanup_stale_process()
            mock_fb.assert_awaited_once()
            self.assertEqual(
                mock_kill.call_args_list,
                [unittest.mock.call(98765, 0), unittest.mock.call(98765, 15)],
            )
            self.assertFalse(os.path.exists(self.mgr.pid_path))

        # 3. OSError reading /proc/{pid}/cmdline -> skip SIGTERM, clear pid
        with open(self.mgr.pid_path, "w", encoding="utf-8") as f:
            f.write("98765")

        def fake_open_err(path, mode="r", *args, **kwargs):
            if path == cmdline_target:
                raise OSError("proc vanished")
            return orig_open(path, mode, *args, **kwargs)

        with patch("os.kill") as mock_kill, \
             patch("os.path.exists", side_effect=lambda p: True if p == cmdline_target else orig_exists(p)), \
             patch("builtins.open", side_effect=fake_open_err), \
             patch.object(self.mgr, "_fallback_to_hardware_sink", new_callable=AsyncMock) as mock_fb:
            await self.mgr.cleanup_stale_process()
            mock_fb.assert_not_awaited()
            self.assertEqual(mock_kill.call_args_list, [unittest.mock.call(98765, 0)])
            self.assertFalse(os.path.exists(self.mgr.pid_path))

    async def test_clear_ephemeral_override_flat_migrates_sink_before_stop(self):
        fake_proc = MagicMock()
        fake_proc.poll.return_value = None
        self.mgr._process = fake_proc
        self.mgr._ephemeral_preset = "gaming"
        self.mock_plugin._settings["eq_preset"] = "flat"
        order: list[str] = []

        async def rec_fb():
            order.append("fallback")

        async def rec_stop():
            order.append("stop")
            self.mgr._process = None

        with patch.object(self.mgr, "_fallback_to_hardware_sink", side_effect=rec_fb), \
             patch.object(self.mgr, "stop", side_effect=rec_stop):
            res = await self.mgr.clear_ephemeral_override()
            self.assertTrue(res["ok"])
            self.assertEqual(order, ["fallback", "stop"])

    async def test_preview_bands_cancelled_by_clear_preview_during_startup_does_not_flush(self):
        self.mock_plugin._settings["eq_preset"] = "bass"
        fake_proc = MagicMock()
        fake_proc.poll.return_value = None
        start_entered = asyncio.Event()
        release_start = asyncio.Event()
        applied_bands: list[list[float]] = []

        async def slow_start(bands):
            start_entered.set()
            await release_start.wait()
            self.mgr._process = fake_proc
            self.mgr._node_id = 444
            return {"ok": True}

        async def rec_pw_cli(bands):
            applied_bands.append(list(bands))
            return True

        with patch.object(self.mgr, "_start_process", side_effect=slow_start), \
             patch.object(self.mgr, "_route_librespot_to_sink", new_callable=AsyncMock, return_value=True), \
             patch.object(self.mgr, "_route_eq_output_to_sink", new_callable=AsyncMock, return_value=True), \
             patch.object(self.mgr, "_apply_pw_cli_params", side_effect=rec_pw_cli):
            preview_task = asyncio.create_task(self.mgr.preview_bands([8.0] + [0.0] * 9))
            await start_entered.wait()
            clear_task = asyncio.create_task(self.mgr.clear_preview())
            await asyncio.sleep(0)
            release_start.set()
            preview_res, clear_res = await asyncio.gather(preview_task, clear_task)
            await asyncio.sleep(0.12)

        self.assertEqual(preview_res, {"ok": True, "preview": False, "cancelled": True})
        self.assertTrue(clear_res["ok"])
        self.assertFalse(self.mgr._preview_active)
        self.assertEqual(applied_bands, [equalizer.EQ_PRESETS["bass"]])

    async def test_preview_bands_and_set_bands_cancelled_by_apply_ephemeral_preset_during_startup(self):
        fake_proc = MagicMock()
        fake_proc.poll.return_value = None
        start_entered = asyncio.Event()
        release_start = asyncio.Event()
        applied_bands: list[list[float]] = []

        async def slow_start(bands):
            start_entered.set()
            await release_start.wait()
            self.mgr._process = fake_proc
            self.mgr._node_id = 445
            return {"ok": True}

        async def rec_pw_cli(bands):
            applied_bands.append(list(bands))
            return True

        with patch.object(self.mgr, "_start_process", side_effect=slow_start), \
             patch.object(self.mgr, "_route_librespot_to_sink", new_callable=AsyncMock, return_value=True), \
             patch.object(self.mgr, "_apply_pw_cli_params", side_effect=rec_pw_cli):
            preview_task = asyncio.create_task(self.mgr.preview_bands([9.0] + [0.0] * 9))
            await start_entered.wait()
            ephem_task = asyncio.create_task(
                self.mgr.apply_ephemeral_preset("gaming", app_id=77, app_name="TestGame")
            )
            await asyncio.sleep(0)
            release_start.set()
            preview_res, ephem_res = await asyncio.gather(preview_task, ephem_task)
            await asyncio.sleep(0.12)

        self.assertEqual(preview_res, {"ok": True, "preview": False, "cancelled": True})
        self.assertTrue(ephem_res["ok"])
        self.assertFalse(self.mgr._preview_active)
        self.assertEqual(applied_bands, [equalizer.EQ_PRESETS["gaming"]])

        # Now test set_bands startup race against apply_ephemeral_preset + apply_preset cancelling active throttle
        self.mgr._process = None
        self.mgr._ephemeral_preset = None
        applied_bands.clear()
        start_entered.clear()
        release_start.clear()
        with patch.object(self.mgr, "_start_process", side_effect=slow_start), \
             patch.object(self.mgr, "_route_librespot_to_sink", new_callable=AsyncMock, return_value=True), \
             patch.object(self.mgr, "_apply_pw_cli_params", side_effect=rec_pw_cli), \
             patch.object(equalizer, "_save_settings"):
            set_task = asyncio.create_task(self.mgr.set_bands([7.0] + [0.0] * 9))
            await start_entered.wait()
            ephem_task2 = asyncio.create_task(
                self.mgr.apply_ephemeral_preset("vocal", app_id=77, app_name="TestGame")
            )
            await asyncio.sleep(0)
            release_start.set()
            set_res, _ = await asyncio.gather(set_task, ephem_task2)
            await asyncio.sleep(0.12)
            self.assertTrue(set_res.get("deferred_by_game_override"))
            self.assertEqual(applied_bands, [equalizer.EQ_PRESETS["vocal"]])

            # Non-flat apply_preset cancels an already-scheduled _throttle_task
            self.mgr._ephemeral_preset = None
            applied_bands.clear()
            await self.mgr.preview_bands([10.0] + [0.0] * 9)
            await self.mgr.apply_preset("bass")
            await asyncio.sleep(0.12)
            self.assertEqual(applied_bands, [equalizer.EQ_PRESETS["bass"]])
            if self.mgr._save_task and not self.mgr._save_task.done():
                self.mgr._save_task.cancel()


class TestSinkIsolationAndVolumeEQ(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.mock_plugin = SimpleNamespace(
            _process=SimpleNamespace(pid=12345),
            _spotify_client_process=None,
            _settings=dict(common.DEFAULT_SETTINGS),
        )

    def test_resolve_spotify_sink_input_ids_isolation_modes(self):
        pactl_out = (
            "Sink Input #11\n"
            '    application.process.id = "99999"\n'
            '    application.name = "steamwebhelper"\n'
            "Sink Input #12\n"
            '    application.process.id = "12345"\n'
            '    application.name = "Chromium"\n'
            "Sink Input #21\n"
            '    application.process.id = "12345"\n'
            '    application.name = "librespot"\n'
            "Sink Input #22\n"
            '    application.process.id = "55555"\n'
            '    node.name = "effect_output.deckify_eq"\n'
            '    media.name = "deckify_eq_out"\n'
        )
        # Default: both librespot and eq_out, never steamwebhelper/Chromium
        self.assertEqual(engine.resolve_spotify_sink_input_ids(pactl_out, {"12345"}), ["21", "22"])
        # librespot-only (include_eq_output=False)
        self.assertEqual(
            engine.resolve_spotify_sink_input_ids(pactl_out, {"12345"}, include_eq_output=False),
            ["21"],
        )
        # eq_output_only=True
        self.assertEqual(
            engine.resolve_spotify_sink_input_ids(pactl_out, {"12345"}, eq_output_only=True),
            ["22"],
        )

    def test_set_pactl_sink_input_rejects_flag_or_empty(self):
        self.assertFalse(engine._set_pactl_sink_input("-bad-sink"))
        self.assertFalse(engine._set_pactl_sink_input("   "))

    async def test_volume_set_audio_sink_eq_active_vs_flat(self):
        eq_mgr = equalizer.EqualizerManager(self.mock_plugin)
        eq_mgr._process = MagicMock()
        eq_mgr._process.poll.return_value = None
        self.mock_plugin._equalizer_manager = eq_mgr

        pactl_out = (
            "Sink Input #21\n"
            '    application.process.id = "12345"\n'
            '    application.name = "librespot"\n'
            "Sink Input #22\n"
            '    application.process.id = "55555"\n'
            '    node.name = "effect_output.deckify_eq"\n'
            '    media.name = "deckify_eq_out"\n'
        )
        moved: list[tuple[str, str]] = []

        def fake_run(cmd, **kwargs):
            joined = " ".join(cmd)
            if "pactl list sink-inputs" in joined:
                return SimpleNamespace(returncode=0, stdout=pactl_out, stderr="")
            if "pactl move-sink-input" in joined:
                moved.append((cmd[-2], cmd[-1]))
                return SimpleNamespace(returncode=0, stdout="", stderr="")
            return SimpleNamespace(returncode=0, stdout="", stderr="")

        with patch("subprocess.run", side_effect=fake_run):
            res = await volume.set_audio_sink("hdmi_sink", plugin=self.mock_plugin)
            self.assertTrue(res["ok"])
            self.assertIn(("21", "deckify_eq_sink"), moved)
            self.assertIn(("22", "hdmi_sink"), moved)
            self.assertNotIn(("21", "hdmi_sink"), moved)

            # Now flat / inactive EQ
            moved.clear()
            eq_mgr._process = None
            res_flat = await volume.set_audio_sink("alsa_sink", plugin=self.mock_plugin)
            self.assertTrue(res_flat["ok"])
            self.assertIn(("21", "alsa_sink"), moved)

    async def test_apply_equalizer_preset_delegates_persists_and_emits(self):
        eq_mgr = MagicMock()
        eq_mgr.apply_preset = AsyncMock(return_value={"ok": True, "preset": "vocal", "bypassed": False})
        self.mock_plugin._equalizer_manager = eq_mgr

        with patch.object(volume, "_save_settings") as mock_save, \
             patch.object(volume.decky, "emit", new_callable=AsyncMock) as mock_emit:
            res = await volume.apply_equalizer_preset(self.mock_plugin, "vocal")
            self.assertTrue(res["ok"])
            eq_mgr.apply_preset.assert_awaited_once_with("vocal")
            self.assertEqual(self.mock_plugin._settings["eq_preset"], "vocal")
            mock_save.assert_called_once()
            mock_emit.assert_awaited_once_with("eq_preset_changed", {"preset": "vocal"})


from test_token_refresh import main

class TestMainEqualizerIntegration(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.plugin = main.Plugin()
        self.plugin._token_refresh_lock = asyncio.Lock()
        self.plugin._settings = dict(common.DEFAULT_SETTINGS)
        self.plugin._equalizer_manager = MagicMock()
        self.plugin._equalizer_manager.apply_preset = AsyncMock(return_value={"ok": True})
        self.plugin._equalizer_manager.set_bands = AsyncMock(return_value={"ok": True, "preset": "custom", "bands": [0.0] * 10})
        self.plugin._equalizer_manager.preview_bands = AsyncMock(return_value={"ok": True, "preview": True, "bands": [0.0] * 10})
        self.plugin._equalizer_manager.clear_preview = AsyncMock(return_value={"ok": True})
        self.plugin._equalizer_manager.unload = AsyncMock()
        self.plugin._equalizer_manager.on_librespot_started = AsyncMock(return_value=True)

    async def test_set_setting_eq_preset_accepts_all_7_presets_and_rejects_unknown(self):
        with patch.object(main, "_save_settings"), \
             patch.object(main.volume, "_save_settings"), \
             patch.object(main.decky, "emit", new_callable=AsyncMock):
            for preset in ("flat", "bass", "vocal", "gaming", "deck_speakers", "late_night", "custom"):
                res = await self.plugin.set_setting("eq_preset", preset)
                self.assertTrue(res["ok"], f"Expected ok for preset {preset}, got {res}")

            bad = await self.plugin.set_setting("eq_preset", "nonexistent")
            self.assertFalse(bad["ok"])

    async def test_set_eq_bands_validates_and_delegates(self):
        bad_type = await self.plugin.set_eq_bands("not-a-list")
        self.assertFalse(bad_type["ok"])
        bad_len = await self.plugin.set_eq_bands([1.0, 2.0])
        self.assertFalse(bad_len["ok"])
        bad_elem = await self.plugin.set_eq_bands(["bad"] + [0.0] * 9)
        self.assertFalse(bad_elem["ok"])

        good = await self.plugin.set_eq_bands([15.0, -15.0] + [1.5] * 8)
        self.assertTrue(good["ok"])
        self.plugin._equalizer_manager.set_bands.assert_awaited_once_with([12.0, -12.0] + [1.5] * 8)

    async def test_set_audio_sink_passes_plugin_self(self):
        with patch.object(main.volume, "set_audio_sink", new_callable=AsyncMock, return_value={"ok": True}) as mock_sink:
            res = await self.plugin.set_audio_sink("alsa_output.test")
            self.assertTrue(res["ok"])
            mock_sink.assert_awaited_once_with("alsa_output.test", plugin=self.plugin)

    async def test_unload_and_start_librespot_lifecycle(self):
        self.plugin._soundtrack_manager = MagicMock()
        self.plugin._sleep_timer_task = None
        self.plugin._suspend_monitor = None
        self.plugin._voice_detector = None
        self.plugin._volume_fader = None
        with patch.object(self.plugin, "_stop_monitor", new_callable=AsyncMock), \
             patch.object(self.plugin, "_kill_librespot", new_callable=AsyncMock), \
             patch.object(self.plugin, "_kill_spotify_client", new_callable=AsyncMock), \
             patch.object(self.plugin, "_stop_oauth_server", new_callable=AsyncMock), \
             patch.object(self.plugin, "_stop_api_poll", new_callable=AsyncMock):
            eq_mgr = self.plugin._equalizer_manager
            await self.plugin._unload()
            eq_mgr.unload.assert_awaited_once()
            self.assertIsNone(self.plugin._equalizer_manager)

        # Test start_librespot routes to EQ when eq_preset != "flat"
        self.plugin._equalizer_manager = MagicMock()
        self.plugin._equalizer_manager.on_librespot_started = AsyncMock(return_value=True)
        self.plugin._settings["eq_preset"] = "bass"
        fake_proc = MagicMock()
        fake_proc.pid = 7777
        fake_proc.poll.return_value = None
        with patch.object(self.plugin, "_kill_spotify_client", new_callable=AsyncMock), \
             patch.object(self.plugin, "_configure_pipewire_clock", new_callable=AsyncMock), \
             patch.object(self.plugin, "_kill_stale_librespot"), \
             patch("os.path.isfile", return_value=True), \
             patch("os.makedirs"), \
             patch("subprocess.Popen", return_value=fake_proc), \
             patch.object(self.plugin, "_write_pid"), \
             patch.object(self.plugin, "_start_monitor"), \
             patch.object(main.decky, "emit", new_callable=AsyncMock):
            res = await self.plugin.start_librespot()
            self.assertTrue(res["ok"])
            self.plugin._equalizer_manager.on_librespot_started.assert_awaited_once()

    async def test_get_status_includes_eq_custom_bands(self):
        custom = [4.5, 2.0, 0.5, -2.5, -3.5, -3.0, -1.5, 1.0, 2.5, 2.0]
        self.plugin._settings["eq_preset"] = "custom"
        self.plugin._settings["eq_custom_bands"] = custom
        status = await self.plugin.get_status()
        self.assertEqual(status["settings"]["eq_preset"], "custom")
        self.assertEqual(status["settings"]["eq_custom_bands"], custom)

    async def test_preview_eq_bands_validates_clamps_and_isolates_settings(self):
        self.plugin._settings["eq_preset"] = "flat"
        self.plugin._settings["eq_custom_bands"] = [0.0] * 10

        for invalid in (
            "not-a-list",
            [1.0, 2.0],
            [True] + [0.0] * 9,
            [float("nan")] + [0.0] * 9,
            ["bad"] + [0.0] * 9,
        ):
            res = await self.plugin.preview_eq_bands(invalid)
            self.assertFalse(res["ok"], f"Expected validation failure for {invalid}")
        self.plugin._equalizer_manager.preview_bands.assert_not_awaited()

        good = await self.plugin.preview_eq_bands([15.0, -15.0] + [1.5] * 8)
        self.assertTrue(good["ok"])
        self.plugin._equalizer_manager.preview_bands.assert_awaited_once_with([12.0, -12.0] + [1.5] * 8)
        self.assertEqual(self.plugin._settings["eq_preset"], "flat")
        self.assertEqual(self.plugin._settings["eq_custom_bands"], [0.0] * 10)

    async def test_clear_eq_preview_delegates_and_handles_uninitialized_or_errors(self):
        res = await self.plugin.clear_eq_preview()
        self.assertTrue(res["ok"])
        self.plugin._equalizer_manager.clear_preview.assert_awaited_once()

        self.plugin._equalizer_manager.clear_preview = AsyncMock(side_effect=RuntimeError("pw failure"))
        err_res = await self.plugin.clear_eq_preview()
        self.assertFalse(err_res["ok"])
        self.assertIn("pw failure", err_res["error"])

        self.plugin._equalizer_manager = None
        uninit_clear = await self.plugin.clear_eq_preview()
        self.assertFalse(uninit_clear["ok"])
        uninit_preview = await self.plugin.preview_eq_bands([0.0] * 10)
        self.assertFalse(uninit_preview["ok"])

    async def test_start_librespot_routes_ephemeral_override_when_global_flat(self):
        self.plugin._settings["eq_preset"] = "flat"
        self.plugin._equalizer_manager = MagicMock()
        self.plugin._equalizer_manager.has_ephemeral_override = True
        self.plugin._equalizer_manager.on_librespot_started = AsyncMock(return_value=True)
        fake_proc = MagicMock()
        fake_proc.pid = 8888
        fake_proc.poll.return_value = None

        with patch.object(self.plugin, "_kill_spotify_client", new_callable=AsyncMock), \
             patch.object(self.plugin, "_configure_pipewire_clock", new_callable=AsyncMock), \
             patch.object(self.plugin, "_kill_stale_librespot"), \
             patch("os.path.isfile", return_value=True), \
             patch("os.makedirs"), \
             patch("subprocess.Popen", return_value=fake_proc), \
             patch.object(self.plugin, "_write_pid"), \
             patch.object(self.plugin, "_start_monitor"), \
             patch.object(main.decky, "emit", new_callable=AsyncMock):
            res = await self.plugin.start_librespot()
            self.assertTrue(res["ok"])
            self.plugin._equalizer_manager.on_librespot_started.assert_awaited_once()

            # When global is flat and no ephemeral override, on_librespot_started is skipped
            self.plugin._process = None
            self.plugin._equalizer_manager.has_ephemeral_override = False
            self.plugin._equalizer_manager.on_librespot_started.reset_mock()
            res2 = await self.plugin.start_librespot()
            self.assertTrue(res2["ok"])
            self.plugin._equalizer_manager.on_librespot_started.assert_not_awaited()

    async def test_get_status_exposes_active_game_app_id_and_override(self):
        self.plugin._soundtrack_manager._active_game_app_id = None
        self.plugin._equalizer_manager.has_ephemeral_override = False
        idle = await self.plugin.get_status()
        self.assertIsNone(idle["active_game_app_id"])
        self.assertIsNone(idle["active_game_override"])

        info = {"app_id": 1091500, "app_name": "Cyberpunk 2077", "eq_preset": "gaming"}
        self.plugin._soundtrack_manager._active_game_app_id = 1091500
        self.plugin._equalizer_manager.has_ephemeral_override = True
        self.plugin._equalizer_manager.get_active_override_info = MagicMock(return_value=info)
        active = await self.plugin.get_status()
        self.assertEqual(active["active_game_app_id"], 1091500)
        self.assertEqual(active["active_game_override"], info)


if __name__ == "__main__":
    unittest.main()
