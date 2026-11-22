import asyncio
import os
import struct
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch


class TestInputWatchParsing(unittest.TestCase):
    def test_parse_valve_hidraw_report_deck_and_triton(self):
        from py_modules import input_watch

        # Report 0x09 (Steam Deck 0x1205): 64-byte report, buttons at offset 8 (<II)
        # buttons_0: bit 7 = A (1), bit 13 = STEAM (27), bit 15 = L5 (24)
        # buttons_1: bit 9 = L4 (23), bit 18 = QAM (28)
        b0 = (1 << 7) | (1 << 13) | (1 << 15)
        b1 = (1 << 9) | (1 << 18)
        deck_report = bytearray(64)
        deck_report[0] = 0x09
        struct.pack_into("<II", deck_report, 8, b0, b1)

        parsed = input_watch.parse_valve_hidraw_report(bytes(deck_report))
        self.assertEqual(parsed, (b0, b1))

        transitions = input_watch.diff_valve_button_masks(0, 0, b0, b1)
        pressed_ids = {btn for btn, pressed in transitions if pressed}
        self.assertEqual(pressed_ids, {1, 27, 24, 23, 28})

        # Release L5 (bit 15) and QAM (bit 18 in b1)
        b0_next = (1 << 7) | (1 << 13)
        b1_next = 1 << 9
        transitions_rel = input_watch.diff_valve_button_masks(b0, b1, b0_next, b1_next)
        self.assertEqual(set(transitions_rel), {(24, False), (28, False)})

        # Report 0x45 / 0x47 (Triton 0x1302..0x1305): buttons at offset 8
        for rid in (0x45, 0x47):
            triton_report = bytearray(32)
            triton_report[0] = rid
            struct.pack_into("<II", triton_report, 8, 1 << 4, 1 << 10)  # Y (4), R4 (25)
            self.assertEqual(
                input_watch.parse_valve_hidraw_report(bytes(triton_report)),
                (1 << 4, 1 << 10),
            )

        # Report 0x42 (Triton BLE/short): buttons at offset 2, rear paddles at b0 bits 18/8/17/7
        ble_report = bytearray(16)
        ble_report[0] = 0x42
        struct.pack_into("<II", ble_report, 2, (1 << 5) | (1 << 18) | (1 << 8) | (1 << 17) | (1 << 7), 1 << 18)
        parsed_42 = input_watch.parse_valve_hidraw_report(bytes(ble_report))
        self.assertEqual(
            parsed_42,
            ((1 << 5) | (1 << 18) | (1 << 8) | (1 << 17) | (1 << 7), 1 << 18),
        )
        tr_42 = input_watch.diff_valve_button_masks(0, 0, parsed_42[0], parsed_42[1], report_id=0x42)
        self.assertEqual({btn for btn, pressed in tr_42 if pressed}, {2, 23, 24, 25, 26})

        # Short or unknown report IDs return None without raising
        self.assertIsNone(input_watch.parse_valve_hidraw_report(b""))
        self.assertIsNone(input_watch.parse_valve_hidraw_report(b"\x09" + b"\x00" * 10))
        self.assertIsNone(input_watch.parse_valve_hidraw_report(b"\x42" + b"\x00" * 5))
        self.assertIsNone(input_watch.parse_valve_hidraw_report(b"\x99" + b"\x00" * 63))

    def test_parse_evdev_event_key_and_abs_hat(self):
        from py_modules import input_watch

        hat_state: dict[int, int | None] = {}

        # EV_KEY (1): BTN_SOUTH (304) down -> A (1, True)
        raw_down = struct.pack("<qqHHi", 100, 200, 1, 304, 1)
        self.assertEqual(input_watch.parse_evdev_event(raw_down, hat_state), [(1, True)])

        # EV_KEY (1): auto-repeat (value == 2) ignored
        raw_repeat = struct.pack("<qqHHi", 100, 300, 1, 304, 2)
        self.assertEqual(input_watch.parse_evdev_event(raw_repeat, hat_state), [])

        # EV_KEY (1): BTN_SOUTH (304) up -> A (1, False)
        raw_up = struct.pack("<qqHHi", 100, 400, 1, 304, 0)
        self.assertEqual(input_watch.parse_evdev_event(raw_up, hat_state), [(1, False)])

        # EV_KEY (1): BTN_TRIGGER_HAPPY1..4 (704..707) -> L4(23), R4(25), L5(24), R5(26)
        for code, expected_btn in ((704, 23), (705, 25), (706, 24), (707, 26)):
            raw = struct.pack("<qqHHi", 0, 0, 1, code, 1)
            self.assertEqual(input_watch.parse_evdev_event(raw, hat_state), [(expected_btn, True)])

        # EV_ABS (3): ABS_HAT0X (16) -> -1 (DIR_LEFT=11), +1 (DIR_RIGHT=12), 0 (release)
        self.assertEqual(
            input_watch.parse_evdev_event(struct.pack("<qqHHi", 0, 0, 3, 16, -1), hat_state),
            [(11, True)],
        )
        self.assertEqual(
            input_watch.parse_evdev_event(struct.pack("<qqHHi", 0, 0, 3, 16, 1), hat_state),
            [(11, False), (12, True)],
        )
        self.assertEqual(
            input_watch.parse_evdev_event(struct.pack("<qqHHi", 0, 0, 3, 16, 0), hat_state),
            [(12, False)],
        )

        # EV_ABS (3): ABS_HAT0Y (17) -> -1 (DIR_UP=9), +1 (DIR_DOWN=10), 0 (release)
        self.assertEqual(
            input_watch.parse_evdev_event(struct.pack("<qqHHi", 0, 0, 3, 17, -1), hat_state),
            [(9, True)],
        )
        self.assertEqual(
            input_watch.parse_evdev_event(struct.pack("<qqHHi", 0, 0, 3, 17, 0), hat_state),
            [(9, False)],
        )

        # Malformed length ignored
        self.assertEqual(input_watch.parse_evdev_event(b"\x00" * 16, hat_state), [])


class TestControllerInputWatcher(unittest.IsolatedAsyncioTestCase):
    def _create_sysfs_tree(self, root: str, *, include_hidraw: bool = True, include_virtual_evdev: bool = True, include_third_party_evdev: bool = True):
        if include_hidraw:
            h_dev = os.path.join(root, "class", "hidraw", "hidraw2", "device")
            os.makedirs(h_dev, exist_ok=True)
            with open(os.path.join(h_dev, "uevent"), "w") as f:
                f.write("DRIVER=hid-generic\nHID_ID=0003:000028DE:00001205\n")

        if include_virtual_evdev:
            e_dev = os.path.join(root, "class", "input", "event5", "device")
            os.makedirs(os.path.join(e_dev, "id"), exist_ok=True)
            os.makedirs(os.path.join(e_dev, "capabilities"), exist_ok=True)
            with open(os.path.join(e_dev, "uevent"), "w") as f:
                f.write("PRODUCT=3/28de/11ff/111\nNAME=\"Microsoft X-Box 360 pad\"\n")
            with open(os.path.join(e_dev, "id", "vendor"), "w") as f:
                f.write("28de\n")
            with open(os.path.join(e_dev, "id", "product"), "w") as f:
                f.write("11ff\n")

        if include_third_party_evdev:
            e3_dev = os.path.join(root, "class", "input", "event7", "device")
            os.makedirs(os.path.join(e3_dev, "id"), exist_ok=True)
            os.makedirs(os.path.join(e3_dev, "capabilities"), exist_ok=True)
            with open(os.path.join(e3_dev, "uevent"), "w") as f:
                f.write("PRODUCT=5/054c/0ce6/100\nNAME=\"DualSense Wireless Controller\"\n")
            with open(os.path.join(e3_dev, "id", "vendor"), "w") as f:
                f.write("054c\n")
            with open(os.path.join(e3_dev, "id", "product"), "w") as f:
                f.write("0ce6\n")
            # Bit 304 (0x130) set in 64-bit word 4: 1 << (304 % 64) = 1 << 48
            words = [0, 0, 0, 0, 1 << 48]
            cap_str = " ".join(f"{w:x}" for w in reversed(words))
            with open(os.path.join(e3_dev, "capabilities", "key"), "w") as f:
                f.write(cap_str + "\n")

    async def test_discovery_skips_virtual_pad_when_hidraw_active(self):
        from py_modules import input_watch

        with tempfile.TemporaryDirectory() as tmpdir:
            self._create_sysfs_tree(tmpdir, include_hidraw=True, include_virtual_evdev=True, include_third_party_evdev=True)
            watcher = input_watch.ControllerInputWatcher(
                on_button_event=AsyncMock(),
                sysfs_root=tmpdir,
            )
            discovered = watcher.discover_devices()
            paths = {d.path: d.kind for d in discovered}
            self.assertIn("/dev/hidraw2", paths)
            self.assertEqual(paths["/dev/hidraw2"], "hidraw")
            self.assertNotIn("/dev/input/event5", paths)
            self.assertIn("/dev/input/event7", paths)
            self.assertEqual(paths["/dev/input/event7"], "evdev")

    async def test_discovery_includes_virtual_pad_when_no_hidraw(self):
        from py_modules import input_watch

        with tempfile.TemporaryDirectory() as tmpdir:
            self._create_sysfs_tree(tmpdir, include_hidraw=False, include_virtual_evdev=True, include_third_party_evdev=False)
            watcher = input_watch.ControllerInputWatcher(
                on_button_event=AsyncMock(),
                sysfs_root=tmpdir,
            )
            discovered = watcher.discover_devices()
            paths = {d.path: d.kind for d in discovered}
            self.assertIn("/dev/input/event5", paths)

    async def test_open_readonly_handles_errors_and_deduplicates(self):
        from py_modules import input_watch

        events: list[tuple[int, bool, str]] = []

        async def on_btn(btn: int, pressed: bool, source: str):
            events.append((btn, pressed, source))

        with tempfile.TemporaryDirectory() as tmpdir:
            self._create_sysfs_tree(tmpdir, include_hidraw=True, include_virtual_evdev=False, include_third_party_evdev=False)
            watcher = input_watch.ControllerInputWatcher(
                on_button_event=on_btn,
                sysfs_root=tmpdir,
            )

            # PermissionError on os.open should not raise
            with patch("py_modules.input_watch.os.open", side_effect=PermissionError("denied")):
                watcher.rescan()
            self.assertEqual(len(watcher._open_devices), 0)

            # Successful open uses O_RDONLY | O_NONBLOCK
            loop = asyncio.get_running_loop()
            with patch("py_modules.input_watch.os.open", return_value=42) as mock_open, \
                 patch("py_modules.input_watch.os.close") as mock_close, \
                 patch.object(loop, "add_reader", create=True), \
                 patch.object(loop, "remove_reader", create=True):
                watcher.rescan()
                mock_open.assert_called_once_with("/dev/hidraw2", os.O_RDONLY | getattr(os, "O_NONBLOCK", 0o4000))
                self.assertIn("/dev/hidraw2", watcher._open_devices)

                # Emit deduplication within 30ms
                with patch("py_modules.input_watch.time.monotonic", side_effect=[100.000, 100.010, 100.050]):
                    await watcher._emit_transition(27, True, "hidraw")
                    await watcher._emit_transition(27, True, "evdev")   # suppressed (10ms)
                    await watcher._emit_transition(27, True, "hidraw")  # allowed (50ms)

                self.assertEqual(events, [(27, True, "hidraw"), (27, True, "hidraw")])

                # Disabled watcher suppresses emission
                watcher.set_enabled(False)
                await watcher._emit_transition(1, True, "hidraw")
                self.assertEqual(len(events), 2)

                watcher.set_enabled(True)
                await watcher.stop()
                mock_close.assert_called_with(42)
                self.assertEqual(len(watcher._open_devices), 0)


class TestPluginInputWatcherLifecycle(unittest.IsolatedAsyncioTestCase):
    async def test_main_and_unload_manage_input_watcher(self):
        try:
            from test_token_refresh import main
        except ImportError:
            from tests.test_token_refresh import main

        plugin = main.Plugin()
        mock_watcher = MagicMock()
        mock_watcher.start = AsyncMock()
        mock_watcher.stop = AsyncMock()
        mock_watcher.set_enabled = MagicMock()

        with patch.object(main, "_load_settings", return_value={"gamepad_chords_enabled": False}), \
             patch.object(main, "SuspendResumeMonitor") as mock_suspend, \
             patch.object(main.volume, "VolumeFader"), \
             patch.object(main.volume, "VoiceActivityDetector") as mock_vad, \
             patch.object(main.soundtrack, "SoundtrackManager"), \
             patch.object(main.equalizer, "EqualizerManager") as mock_eq, \
             patch.object(main.dock, "DockAudioSwitcher") as mock_dock, \
             patch.object(main.resilience, "SessionBookmarkManager"), \
             patch.object(main.resilience, "LibrespotEventServer") as mock_ev, \
             patch.object(main.mpris, "MprisBridge") as mock_mpris, \
             patch.object(main, "_save_settings"), \
             patch.object(plugin, "_sync_native_spotify_folders", new_callable=AsyncMock), \
             patch.object(plugin, "start_librespot", new_callable=AsyncMock), \
             patch.object(plugin, "_stop_monitor", new_callable=AsyncMock), \
             patch.object(plugin, "_kill_librespot", new_callable=AsyncMock), \
             patch.object(plugin, "_kill_spotify_client", new_callable=AsyncMock), \
             patch.object(plugin, "_stop_oauth_server", new_callable=AsyncMock), \
             patch.object(plugin, "_stop_api_poll", new_callable=AsyncMock), \
             patch.object(main.input_watch, "ControllerInputWatcher", return_value=mock_watcher) as mock_cls:
            mock_suspend.return_value.stop = AsyncMock()
            mock_vad.return_value.stop = AsyncMock()
            mock_eq.return_value.cleanup_stale_process = AsyncMock()
            mock_eq.return_value.unload = AsyncMock()
            mock_dock.return_value.evaluate_now = AsyncMock()
            mock_dock.return_value.stop = AsyncMock()
            mock_ev.return_value.start = AsyncMock()
            mock_ev.return_value.stop = AsyncMock()
            mock_mpris.return_value.start = AsyncMock()
            mock_mpris.return_value.stop = AsyncMock()

            await plugin._main()
            mock_cls.assert_called_once()
            mock_watcher.set_enabled.assert_called_once_with(False)
            mock_watcher.start.assert_awaited_once()
            self.assertIs(plugin._input_watcher, mock_watcher)

            await plugin._unload()
            mock_watcher.stop.assert_awaited_once()
            self.assertIsNone(plugin._input_watcher)

    async def test_set_setting_resume_and_controller_input_emit(self):
        try:
            from test_token_refresh import main
        except ImportError:
            from tests.test_token_refresh import main

        plugin = main.Plugin()
        plugin._settings = {"gamepad_chords_enabled": True}
        mock_watcher = MagicMock()
        mock_watcher.set_enabled = MagicMock()
        mock_watcher.rescan = MagicMock()
        plugin._input_watcher = mock_watcher

        with patch.object(main, "_save_settings"), \
             patch.object(main.decky, "emit", new_callable=AsyncMock) as mock_emit:
            res = await plugin.set_setting("gamepad_chords_enabled", False)
            self.assertTrue(res["ok"])
            mock_watcher.set_enabled.assert_called_once_with(False)

            res2 = await plugin.set_setting("gamepad_chords_enabled", True)
            self.assertTrue(res2["ok"])
            mock_watcher.set_enabled.assert_called_with(True)

            plugin._bookmark_manager = MagicMock()
            plugin._bookmark_manager.handle_wake_recovery = AsyncMock()
            with patch.object(plugin, "_refresh_audio_stream_info", new_callable=AsyncMock):
                await plugin._on_deck_resume()
            mock_watcher.rescan.assert_called_once()

            await plugin._on_controller_input_event(27, True, "hidraw")
            mock_emit.assert_any_await(
                "controller_input",
                {"button": 27, "pressed": True, "source": "hidraw"},
            )

        # Error isolation: decky.emit raising must not propagate
        with patch.object(main.decky, "emit", new_callable=AsyncMock, side_effect=RuntimeError("ipc down")):
            await plugin._on_controller_input_event(1, False, "evdev")


if __name__ == "__main__":
    unittest.main()
