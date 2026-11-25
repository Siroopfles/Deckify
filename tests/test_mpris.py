import asyncio
import hashlib
import os
import sys
import tempfile
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

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
    from py_modules import common, images, mpris


class TestDbusCodecAndMetadata(unittest.TestCase):
    def test_settings_defaults_and_sanitization(self):
        self.assertTrue(common.DEFAULT_SETTINGS["mpris_enabled"])
        self.assertTrue(common.DEFAULT_SETTINGS["mpris_auto_proxy"])

        with tempfile.TemporaryDirectory() as tmpdir:
            sfile = os.path.join(tmpdir, "settings.json")
            with open(sfile, "w", encoding="utf-8") as f:
                f.write('{"mpris_enabled": false, "mpris_auto_proxy": 0}')
            loaded = common._load_settings(sfile)
            self.assertFalse(loaded["mpris_enabled"])
            self.assertFalse(loaded["mpris_auto_proxy"])

    def test_marshaller_unmarshaller_round_trip_and_empty_dict_alignment(self):
        # Test primitives: b, u, x, d, s, o, as
        m = mpris.DbusMarshaller()
        m.write_args("buxdsoas", [True, 42, -1234567890123, 0.75, "hello", "/a/b", ["one", "two"]])
        u = mpris.DbusUnmarshaller(bytes(m.buf))
        vals = u.read_args("buxdsoas")
        self.assertEqual(vals[0], True)
        self.assertEqual(vals[1], 42)
        self.assertEqual(vals[2], -1234567890123)
        self.assertAlmostEqual(vals[3], 0.75)
        self.assertEqual(vals[4], "hello")
        self.assertEqual(vals[5], "/a/b")
        self.assertEqual(vals[6], ["one", "two"])

        # Empty a{sv} followed by int64 must maintain 8-byte alignment
        m2 = mpris.DbusMarshaller()
        m2.write_args("a{sv}x", [{}, 987654321])
        u2 = mpris.DbusUnmarshaller(bytes(m2.buf))
        d_empty, num = u2.read_args("a{sv}x")
        self.assertEqual(d_empty, {})
        self.assertEqual(num, 987654321)

        # Populated a{sv}
        m3 = mpris.DbusMarshaller()
        sample_dict = {
            "mpris:trackid": ("o", "/org/mpris/MediaPlayer2/Track/abc"),
            "mpris:length": ("x", 180000000),
            "xesam:title": ("s", "Song Title"),
            "xesam:artist": ("as", ["Artist A", "Artist B"]),
        }
        m3.write("a{sv}", sample_dict)
        u3 = mpris.DbusUnmarshaller(bytes(m3.buf))
        self.assertEqual(u3.read("a{sv}"), sample_dict)

    def test_pack_unpack_dbus_message(self):
        raw = mpris.pack_dbus_message(
            mpris.MSG_METHOD_CALL,
            7,
            {
                mpris.HDR_PATH: mpris.MPRIS_OBJECT_PATH,
                mpris.HDR_INTERFACE: mpris.MPRIS_PLAYER_IFACE,
                mpris.HDR_MEMBER: "Seek",
                mpris.HDR_DESTINATION: mpris.MPRIS_BUS_NAME,
            },
            signature="x",
            args=[5000000],
        )
        decoded = mpris.unpack_dbus_message(raw)
        self.assertEqual(decoded["type"], mpris.MSG_METHOD_CALL)
        self.assertEqual(decoded["serial"], 7)
        self.assertEqual(decoded["fields"][mpris.HDR_MEMBER], "Seek")
        self.assertEqual(decoded["args"], [5000000])

    def test_get_cached_image_file_uri_cached_and_fallback(self):
        cdn_url = "https://i.scdn.co/image/ab67616d0000b2731234567890abcdef"
        url_hash = hashlib.sha256(cdn_url.encode("utf-8")).hexdigest()
        with tempfile.TemporaryDirectory() as tmpdir:
            with patch.object(images, "IMAGE_CACHE_DIR", tmpdir):
                # Uncached -> HTTPS fallback
                self.assertEqual(images.get_cached_image_file_uri(cdn_url), cdn_url)
                self.assertEqual(images.get_cached_image_file_uri(""), "")
                self.assertEqual(images.get_cached_image_file_uri(None), "")

                # Cached -> file:// URI
                bin_path = os.path.join(tmpdir, f"{url_hash}.bin")
                with open(bin_path, "wb") as f:
                    f.write(b"\xff\xd8\xff\xe0test-jpeg")
                expected_uri = Path(bin_path).resolve().as_uri()
                resolved = images.get_cached_image_file_uri(cdn_url)
                self.assertTrue(resolved.startswith("file://"))
                self.assertEqual(resolved, expected_uri)

    def test_format_mpris_track_id_and_build_metadata(self):
        self.assertEqual(mpris.format_mpris_track_id(None), mpris.NO_TRACK_PATH)
        self.assertEqual(mpris.format_mpris_track_id(""), mpris.NO_TRACK_PATH)
        tid = mpris.format_mpris_track_id("spotify:track:4uLU6hMCjMI75M1A2tKUQC")
        self.assertEqual(tid, "/org/mpris/MediaPlayer2/Track/4uLU6hMCjMI75M1A2tKUQC")

        # 32-char hex ID from librespot is normalized to 22-char base62
        hex_tid = mpris.format_mpris_track_id("ba292267a139477c86f108d66f4f9cc5")
        self.assertTrue(hex_tid.startswith("/org/mpris/MediaPlayer2/Track/"))
        self.assertEqual(len(hex_tid.split("/")[-1]), 22)

        meta_empty = mpris.build_mpris_metadata(None)
        self.assertEqual(meta_empty, {"mpris:trackid": ("o", mpris.NO_TRACK_PATH)})

        cdn_url = "https://i.scdn.co/image/testcover"
        with patch.object(images, "get_cached_image_file_uri", return_value="file:///tmp/testcover.bin"):
            meta = mpris.build_mpris_metadata(
                {
                    "track_id": "4uLU6hMCjMI75M1A2tKUQC",
                    "name": "Track One",
                    "artist": "Artist A, Artist B",
                    "album": "Album X",
                    "duration_ms": 215000,
                    "artwork_url": cdn_url,
                }
            )
        self.assertEqual(meta["mpris:trackid"], ("o", "/org/mpris/MediaPlayer2/Track/4uLU6hMCjMI75M1A2tKUQC"))
        self.assertEqual(meta["mpris:length"], ("x", 215000000))
        self.assertEqual(meta["xesam:title"], ("s", "Track One"))
        self.assertEqual(meta["xesam:artist"], ("as", ["Artist A", "Artist B"]))
        self.assertEqual(meta["xesam:album"], ("s", "Album X"))
        self.assertEqual(meta["mpris:artUrl"], ("s", "file:///tmp/testcover.bin"))


class TestMprisDbusSessionProtocol(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.commands = []
        self.server_messages = []
        self.client_to_server_queue = asyncio.Queue()

        async def handle_client(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
            self.bus_reader = reader
            self.bus_writer = writer

        self.server = await asyncio.start_server(handle_client, "127.0.0.1", 0)
        port = self.server.sockets[0].getsockname()[1]
        self.client_reader, self.client_writer = await asyncio.open_connection("127.0.0.1", port)
        # Wait until server accepted
        for _ in range(50):
            if hasattr(self, "bus_reader"):
                break
            await asyncio.sleep(0.01)

    async def asyncTearDown(self):
        if hasattr(self, "session") and self.session:
            await self.session.close()
        try:
            self.bus_writer.close()
        except Exception:
            pass
        self.server.close()
        await self.server.wait_closed()

    async def _run_mock_dbus_daemon(self):
        # 1. SASL EXTERNAL
        auth_line = await self.bus_reader.readline()
        self.assertIn(b"AUTH EXTERNAL", auth_line)
        self.bus_writer.write(b"OK 1234567890abcdef\r\n")
        await self.bus_writer.drain()
        begin_line = await self.bus_reader.readline()
        self.assertEqual(begin_line, b"BEGIN\r\n")

        # 2. Hello
        hello_msg = await mpris.read_dbus_message_from_stream(self.bus_reader)
        self.assertEqual(hello_msg["fields"][mpris.HDR_MEMBER], "Hello")
        self.bus_writer.write(
            mpris.pack_dbus_message(
                mpris.MSG_METHOD_RETURN,
                1,
                {mpris.HDR_REPLY_SERIAL: hello_msg["serial"], mpris.HDR_DESTINATION: ":1.99"},
                signature="s",
                args=[":1.99"],
            )
        )
        await self.bus_writer.drain()

        # 3. RequestName
        req_msg = await mpris.read_dbus_message_from_stream(self.bus_reader)
        self.assertEqual(req_msg["fields"][mpris.HDR_MEMBER], "RequestName")
        self.assertEqual(req_msg["args"][0], mpris.MPRIS_BUS_NAME)
        self.bus_writer.write(
            mpris.pack_dbus_message(
                mpris.MSG_METHOD_RETURN,
                2,
                {mpris.HDR_REPLY_SERIAL: req_msg["serial"], mpris.HDR_DESTINATION: ":1.99"},
                signature="u",
                args=[1],
            )
        )
        await self.bus_writer.drain()

    async def _bus_call(self, serial: int, iface: str, member: str, sig: str = "", args=()):
        self.bus_writer.write(
            mpris.pack_dbus_message(
                mpris.MSG_METHOD_CALL,
                serial,
                {
                    mpris.HDR_PATH: mpris.MPRIS_OBJECT_PATH,
                    mpris.HDR_INTERFACE: iface,
                    mpris.HDR_MEMBER: member,
                    mpris.HDR_SENDER: ":1.50",
                    mpris.HDR_DESTINATION: ":1.99",
                },
                signature=sig,
                args=args,
            )
        )
        await self.bus_writer.drain()
        return await mpris.read_dbus_message_from_stream(self.bus_reader)

    async def test_session_end_to_end_introspect_properties_methods_signals(self):
        async def on_cmd(cmd):
            self.commands.append(cmd)

        self.session = mpris.MprisDbusSession(
            self.client_reader, self.client_writer, on_command=on_cmd, uid=1000
        )
        daemon_task = asyncio.create_task(self._run_mock_dbus_daemon())
        await self.session.register()
        await daemon_task
        self.assertTrue(self.session.bus_registered)
        self.assertEqual(self.session.unique_name, ":1.99")

        # Introspect
        reply = await self._bus_call(10, mpris.DBUS_INTROSPECTABLE_IFACE, "Introspect")
        self.assertEqual(reply["type"], mpris.MSG_METHOD_RETURN)
        self.assertIn("org.mpris.MediaPlayer2.Player", reply["args"][0])

        # Dynamic Position while Playing
        self.session._playback_status = "Playing"
        self.session.update_position_anchor(10_000_000)
        await asyncio.sleep(0.03)
        pos_reply = await self._bus_call(
            11, mpris.DBUS_PROPERTIES_IFACE, "Get", "ss", [mpris.MPRIS_PLAYER_IFACE, "Position"]
        )
        pos_variant = pos_reply["args"][0]
        self.assertEqual(pos_variant[0], "x")
        self.assertGreaterEqual(pos_variant[1], 10_020_000)

        # GetAll
        all_reply = await self._bus_call(
            12, mpris.DBUS_PROPERTIES_IFACE, "GetAll", "s", [mpris.MPRIS_PLAYER_IFACE]
        )
        self.assertEqual(all_reply["args"][0]["PlaybackStatus"], ("s", "Playing"))

        # Properties.Set Volume, Shuffle, LoopStatus
        await self._bus_call(
            13, mpris.DBUS_PROPERTIES_IFACE, "Set", "ssv", [mpris.MPRIS_PLAYER_IFACE, "Volume", ("d", 0.55)]
        )
        await self._bus_call(
            14, mpris.DBUS_PROPERTIES_IFACE, "Set", "ssv", [mpris.MPRIS_PLAYER_IFACE, "Shuffle", ("b", True)]
        )
        await self._bus_call(
            15, mpris.DBUS_PROPERTIES_IFACE, "Set", "ssv", [mpris.MPRIS_PLAYER_IFACE, "LoopStatus", ("s", "Playlist")]
        )

        # All 9 Player methods
        for idx, mname in enumerate(["Play", "Pause", "PlayPause", "Stop", "Next", "Previous"], start=20):
            r = await self._bus_call(idx, mpris.MPRIS_PLAYER_IFACE, mname)
            self.assertEqual(r["type"], mpris.MSG_METHOD_RETURN)

        await self._bus_call(30, mpris.MPRIS_PLAYER_IFACE, "Seek", "x", [5_000_000])
        await self._bus_call(
            31, mpris.MPRIS_PLAYER_IFACE, "SetPosition", "ox", ["/org/mpris/MediaPlayer2/Track/abc", 30_000_000]
        )
        await self._bus_call(32, mpris.MPRIS_PLAYER_IFACE, "OpenUri", "s", ["spotify:track:4uLU6hMCjMI75M1A2tKUQC"])

        methods = [c.get("method") for c in self.commands if c["type"] == "method"]
        self.assertEqual(
            methods,
            ["Play", "Pause", "PlayPause", "Stop", "Next", "Previous", "Seek", "SetPosition", "OpenUri"],
        )
        props_set = [(c.get("property"), c.get("value")) for c in self.commands if c["type"] == "set_property"]
        self.assertEqual(props_set, [("Volume", 0.55), ("Shuffle", True), ("LoopStatus", "Playlist")])

        # Emit PropertiesChanged and Seeked signals
        await self.session.emit_properties_changed({"PlaybackStatus": ("s", "Paused")})
        sig1 = await mpris.read_dbus_message_from_stream(self.bus_reader)
        self.assertEqual(sig1["type"], mpris.MSG_SIGNAL)
        self.assertEqual(sig1["fields"][mpris.HDR_MEMBER], "PropertiesChanged")
        self.assertEqual(sig1["args"][1], {"PlaybackStatus": ("s", "Paused")})

        await self.session.emit_seeked(42_000_000)
        sig2 = await mpris.read_dbus_message_from_stream(self.bus_reader)
        self.assertEqual(sig2["type"], mpris.MSG_SIGNAL)
        self.assertEqual(sig2["fields"][mpris.HDR_MEMBER], "Seeked")
        self.assertEqual(sig2["args"][0], 42_000_000)


class TestMprisBridgeIntegration(unittest.IsolatedAsyncioTestCase):
    def _make_fake_plugin(self):
        plugin = SimpleNamespace(
            _settings=dict(common.DEFAULT_SETTINGS),
            _poll_play_state="playing",
            _poll_track_id="4uLU6hMCjMI75M1A2tKUQC",
            _poll_progress_ms=10000,
            _poll_duration_ms=200000,
            _poll_volume=80,
            _shuffle_state=False,
            _repeat_state="off",
            _last_event=None,
            _track_meta={
                "track_id": "4uLU6hMCjMI75M1A2tKUQC",
                "name": "Never Gonna Give You Up",
                "artist": "Rick Astley",
                "album": "Whenever You Need Somebody",
                "duration_ms": 200000,
                "artwork_url": "https://i.scdn.co/image/rick",
            },
            _volume_fader=None,
            control_playback=AsyncMock(return_value={"ok": True}),
            seek_playback=AsyncMock(return_value={"ok": True}),
            play_tracks=AsyncMock(return_value={"ok": True}),
            set_volume=AsyncMock(return_value={"ok": True}),
            set_shuffle=AsyncMock(return_value={"ok": True}),
            set_repeat=AsyncMock(return_value={"ok": True}),
        )
        return plugin

    async def test_command_routing_and_open_uri_validation(self):
        plugin = self._make_fake_plugin()
        bridge = mpris.MprisBridge(plugin)
        bridge._session = MagicMock()
        bridge._session.emit_seeked = AsyncMock()
        bridge._session.emit_properties_changed = AsyncMock()
        bridge._session.update_position_anchor = MagicMock()

        await bridge.handle_dbus_command({"type": "method", "method": "Play"})
        await bridge.handle_dbus_command({"type": "method", "method": "Pause"})
        await bridge.handle_dbus_command({"type": "method", "method": "PlayPause"})
        await bridge.handle_dbus_command({"type": "method", "method": "Stop"})
        await bridge.handle_dbus_command({"type": "method", "method": "Next"})
        await bridge.handle_dbus_command({"type": "method", "method": "Previous"})
        self.assertEqual(
            [c.args[0] for c in plugin.control_playback.await_args_list],
            ["play", "pause", "play_pause", "pause", "next", "previous"],
        )

        # Seek within track -> seek_playback + Seeked
        bridge._pos_ms = 20000
        bridge._pos_anchor_mono = time.monotonic()
        await bridge.handle_dbus_command({"type": "method", "method": "Seek", "offset_us": 5_000_000})
        plugin.seek_playback.assert_awaited()
        bridge._session.emit_seeked.assert_awaited()

        # Seek past duration -> Next
        bridge._pos_ms = 199000
        bridge._pos_anchor_mono = time.monotonic()
        await bridge.handle_dbus_command({"type": "method", "method": "Seek", "offset_us": 5_000_000})
        self.assertEqual(plugin.control_playback.await_args_list[-1].args[0], "next")

        # SetPosition valid vs mismatched track_id
        plugin.seek_playback.reset_mock()
        await bridge.handle_dbus_command(
            {
                "type": "method",
                "method": "SetPosition",
                "track_id": "/org/mpris/MediaPlayer2/Track/WRONG",
                "position_us": 30_000_000,
            }
        )
        plugin.seek_playback.assert_not_awaited()
        await bridge.handle_dbus_command(
            {
                "type": "method",
                "method": "SetPosition",
                "track_id": "/org/mpris/MediaPlayer2/Track/4uLU6hMCjMI75M1A2tKUQC",
                "position_us": 30_000_000,
            }
        )
        plugin.seek_playback.assert_awaited_once_with(30000)

        # OpenUri validation: reject file://, accept spotify: and https://open.spotify.com/
        await bridge.handle_dbus_command({"type": "method", "method": "OpenUri", "uri": "file:///etc/passwd"})
        plugin.play_tracks.assert_not_awaited()
        await bridge.handle_dbus_command(
            {"type": "method", "method": "OpenUri", "uri": "spotify:track:4uLU6hMCjMI75M1A2tKUQC"}
        )
        plugin.play_tracks.assert_awaited_with(uris=["spotify:track:4uLU6hMCjMI75M1A2tKUQC"])
        await bridge.handle_dbus_command(
            {
                "type": "method",
                "method": "OpenUri",
                "uri": "https://open.spotify.com/album/1ATL5GLyefJaxhQzSPVrLX?si=xyz",
            }
        )
        plugin.play_tracks.assert_awaited_with(context_uri="spotify:album:1ATL5GLyefJaxhQzSPVrLX")

    async def test_volume_fader_safe_coordination_and_mode_writes(self):
        plugin = self._make_fake_plugin()
        fader = MagicMock()
        fader._sleep_locked = True
        fader.is_ducked = True
        fader._duck_reasons = {"game"}
        fader._compute_target_sink_volume = MagicMock(return_value=50.0)
        fader.fade_to = AsyncMock()
        plugin._volume_fader = fader

        bridge = mpris.MprisBridge(plugin)
        bridge._session = MagicMock()
        bridge._session.emit_properties_changed = AsyncMock()
        bridge._session.update_position_anchor = MagicMock()

        # _sleep_locked=True -> Volume write is ignored
        await bridge.handle_dbus_command({"type": "set_property", "property": "Volume", "value": 0.4})
        plugin.set_volume.assert_not_awaited()
        fader.fade_to.assert_not_awaited()

        # _sleep_locked=False & is_ducked=True -> updates volume & recalculates ducked sink target without clearing _duck_reasons
        fader._sleep_locked = False
        await bridge.handle_dbus_command({"type": "set_property", "property": "Volume", "value": 0.5})
        plugin.set_volume.assert_awaited_once_with(50)
        self.assertEqual(plugin._poll_volume, 50)
        fader._compute_target_sink_volume.assert_called_once()
        fader.fade_to.assert_awaited_once_with(50.0, 0.15)
        self.assertEqual(fader._duck_reasons, {"game"})

        # Shuffle and LoopStatus writes
        await bridge.handle_dbus_command({"type": "set_property", "property": "Shuffle", "value": True})
        plugin.set_shuffle.assert_awaited_once_with(True)
        await bridge.handle_dbus_command({"type": "set_property", "property": "LoopStatus", "value": "Track"})
        plugin.set_repeat.assert_awaited_once_with("track")

    async def test_diff_gated_properties_changed_and_pitfall3_guard(self):
        plugin = self._make_fake_plugin()
        bridge = mpris.MprisBridge(plugin)
        bridge._session = MagicMock()
        bridge._session.emit_properties_changed = AsyncMock()
        bridge._session.update_position_anchor = MagicMock()

        with patch.object(images, "get_cached_image_file_uri", return_value="https://i.scdn.co/image/rick"):
            await bridge.sync_from_plugin()
            self.assertEqual(bridge._session.emit_properties_changed.await_count, 1)

            # Routine poll ticks with advancing progress_ms must emit ZERO PropertiesChanged signals
            plugin._poll_progress_ms = 13000
            await bridge.sync_from_plugin()
            plugin._poll_progress_ms = 16000
            await bridge.sync_from_plugin()
            self.assertEqual(bridge._session.emit_properties_changed.await_count, 1)

            # PlaybackStatus change emits only PlaybackStatus
            plugin._poll_play_state = "paused"
            await bridge.sync_from_plugin()
            self.assertEqual(bridge._session.emit_properties_changed.await_count, 2)
            last_changed = bridge._session.emit_properties_changed.await_args_list[-1].args[0]
            self.assertEqual(last_changed, {"PlaybackStatus": ("s", "Paused")})

            # Pitfall 3: new track_id event before _track_meta is enriched keeps old metadata
            plugin._last_event = {"event": "track_changed", "track_id": "NEWTRACK12345678901234"}
            plugin._poll_play_state = "playing"
            await bridge.sync_from_plugin()
            last_changed2 = bridge._session.emit_properties_changed.await_args_list[-1].args[0]
            self.assertNotIn("Metadata", last_changed2)

    async def test_mpris_proxy_supervision_external_vs_managed(self):
        plugin = self._make_fake_plugin()
        bridge = mpris.MprisBridge(plugin)

        # Case 1: pgrep finds existing mpris-proxy -> do NOT spawn
        with patch.object(mpris.shutil, "which", return_value="/usr/bin/mpris-proxy"), \
             patch.object(mpris, "_exec", AsyncMock(return_value=SimpleNamespace(returncode=0))), \
             patch.object(mpris.subprocess, "Popen") as mock_popen:
            await bridge._ensure_mpris_proxy()
            mock_popen.assert_not_called()
            self.assertTrue(bridge._proxy_running)
            self.assertFalse(bridge._proxy_managed)
            await bridge._stop_mpris_proxy()  # Must not kill external proxy

        # Case 2: pgrep returns 1 -> spawn via _build_deck_command with LD_LIBRARY_PATH stripped
        fake_proc = MagicMock()
        with patch.object(mpris.shutil, "which", return_value="/usr/bin/mpris-proxy"), \
             patch.object(mpris, "_exec", AsyncMock(return_value=SimpleNamespace(returncode=1))), \
             patch.dict(os.environ, {"LD_LIBRARY_PATH": "/tmp/pyinstaller"}), \
             patch.object(mpris.subprocess, "Popen", return_value=fake_proc) as mock_popen:
            await bridge._ensure_mpris_proxy()
            mock_popen.assert_called_once()
            spawn_env = mock_popen.call_args.kwargs["env"]
            self.assertNotIn("LD_LIBRARY_PATH", spawn_env)
            self.assertTrue(bridge._proxy_running)
            self.assertTrue(bridge._proxy_managed)

            await bridge._stop_mpris_proxy()
            fake_proc.terminate.assert_called_once()
            self.assertFalse(bridge._proxy_running)

    async def test_main_plugin_mpris_integration(self):
        import main

        p = main.Plugin()
        p._settings = dict(common.DEFAULT_SETTINGS)
        status = await p.get_status()
        self.assertIn("mpris_status", status)
        self.assertIn("mpris_enabled", status["settings"])
        self.assertIn("mpris_auto_proxy", status["settings"])

        mstatus = await p.get_mpris_status()
        self.assertEqual(mstatus["bus_name"], mpris.MPRIS_BUS_NAME)

        with tempfile.TemporaryDirectory() as tmpdir:
            sfile = os.path.join(tmpdir, "settings.json")
            with patch.object(main, "_save_settings") as mock_save, \
                 patch.object(p._mpris_bridge, "on_settings_changed", AsyncMock()) as mock_chg:
                res = await p.set_setting("mpris_enabled", False)
                self.assertTrue(res["ok"])
                mock_save.assert_called_once()
                mock_chg.assert_awaited_once_with("mpris_enabled", False)

    async def test_remote_active_device_suppresses_playing_and_ignores_pause_stop(self):
        plugin = self._make_fake_plugin()
        plugin._poll_play_state = "playing"
        plugin._active_device = {"id": "phone1", "name": "iPhone", "type": "Smartphone"}
        plugin._track_meta = {"track_id": "4uLU6hMCjMI75M1A2tKUQC", "name": "Song", "artist": "Artist"}
        plugin._poll_track_id = "4uLU6hMCjMI75M1A2tKUQC"
        bridge = mpris.MprisBridge(plugin)
        fake_session = MagicMock()
        fake_session.update_position_anchor = MagicMock()
        fake_session.emit_properties_changed = AsyncMock()
        bridge._session = fake_session

        await bridge.sync_from_plugin()
        self.assertEqual(fake_session._playback_status, "Stopped")
        self.assertEqual(fake_session._metadata, {"mpris:trackid": ("o", mpris.NO_TRACK_PATH)})

        await bridge.handle_dbus_command({"type": "method", "method": "Pause"})
        await bridge.handle_dbus_command({"type": "method", "method": "Stop"})
        plugin.control_playback.assert_not_awaited()

        # Local device restores normal Playing status and Pause/Stop forwarding
        plugin._active_device = {"id": "local1", "name": "Deckify", "type": "Computer"}
        await bridge.sync_from_plugin()
        self.assertEqual(fake_session._playback_status, "Playing")
        await bridge.handle_dbus_command({"type": "method", "method": "Pause"})
        plugin.control_playback.assert_awaited_once_with("pause")


if __name__ == "__main__":
    unittest.main()
