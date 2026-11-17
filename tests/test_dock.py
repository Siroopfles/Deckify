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
    from py_modules import common, dock, volume


PACTL_SINKS_SAMPLE = """Sink #42
\tState: RUNNING
\tName: alsa_output.pci-0000_04_00.6.acp5x.HiFi__hw_acp5x_1__sink
\tDescription: Steam Deck Speakers
Sink #43
\tState: IDLE
\tName: deckify_eq_sink
\tDescription: Deckify Equalizer
Sink #44
\tState: IDLE
\tName: alsa_output.usb-FiiO_K7-00.analog-stereo
\tDescription: FiiO K7 USB DAC
Sink #45
\tState: SUSPENDED
\tName: alsa_output.pci-0000_04_00.1.hdmi-stereo
\tDescription: HDMI / DisplayPort
"""


class TestDockDefaultsAndParsing(unittest.TestCase):
    def test_default_settings_include_dock_keys(self):
        self.assertIs(common.DEFAULT_SETTINGS["dock_auto_switch_enabled"], False)
        self.assertEqual(common.DEFAULT_SETTINGS["dock_target_sink"], "auto")
        self.assertIs(common.DEFAULT_SETTINGS["dock_respect_bluetooth"], True)
        self.assertIs(common.DEFAULT_SETTINGS["dock_pause_on_undock"], False)
        self.assertIs(common.DEFAULT_SETTINGS["dock_toast_enabled"], True)

    def test_parse_pactl_sinks_detailed_excludes_eq_sink(self):
        sinks = dock.parse_pactl_sinks_detailed(
            PACTL_SINKS_SAMPLE,
            default_sink="alsa_output.pci-0000_04_00.6.acp5x.HiFi__hw_acp5x_1__sink",
        )
        names = [s["name"] for s in sinks]
        self.assertNotIn("deckify_eq_sink", names)
        self.assertEqual(len(sinks), 3)
        self.assertEqual(sinks[0]["description"], "Steam Deck Speakers")
        self.assertTrue(sinks[0]["is_default"])
        self.assertEqual(sinks[0]["kind"], "internal")
        self.assertEqual(sinks[1]["kind"], "usb")
        self.assertEqual(sinks[2]["kind"], "hdmi")


class TestDockTracerSlice(unittest.IsolatedAsyncioTestCase):
    async def test_volume_get_audio_sinks_returns_enriched_sinks(self):
        sample_sinks = dock.parse_pactl_sinks_detailed(
            PACTL_SINKS_SAMPLE,
            default_sink="alsa_output.pci-0000_04_00.6.acp5x.HiFi__hw_acp5x_1__sink",
        )
        with patch.object(
            volume,
            "_exec",
            new=AsyncMock(
                return_value=(
                    sample_sinks,
                    "alsa_output.pci-0000_04_00.6.acp5x.HiFi__hw_acp5x_1__sink",
                )
            ),
        ):
            res = await volume.get_audio_sinks()

        self.assertTrue(res["ok"])
        self.assertEqual(len(res["sinks"]), 3)
        self.assertEqual(
            res["sinks"][1],
            {
                "name": "alsa_output.usb-FiiO_K7-00.analog-stereo",
                "description": "FiiO K7 USB DAC",
                "is_default": False,
            },
        )
        self.assertNotIn("deckify_eq_sink", [s["name"] for s in res["sinks"]])

    async def test_dock_usb_and_undock_restores_pre_dock_and_clock(self):
        plugin = SimpleNamespace(
            _settings={
                "dock_auto_switch_enabled": True,
                "dock_target_sink": "auto",
                "dock_respect_bluetooth": True,
                "dock_pause_on_undock": False,
                "dock_toast_enabled": True,
                "bit_perfect_clock": True,
            },
            _equalizer_manager=None,
            _poll_play_state="paused",
            control_playback=AsyncMock(),
        )
        switcher = dock.DockAudioSwitcher(plugin)

        internal_sink = {
            "name": "alsa_output.pci-0000_04_00.6.acp5x.HiFi__hw_acp5x_1__sink",
            "description": "Steam Deck Speakers",
            "is_default": True,
            "kind": "internal",
        }
        usb_sink = {
            "name": "alsa_output.usb-FiiO_K7-00.analog-stereo",
            "description": "FiiO K7 USB DAC",
            "is_default": False,
            "kind": "usb",
        }

        with (
            patch.object(
                dock,
                "_exec",
                new=AsyncMock(return_value=([internal_sink, usb_sink], internal_sink["name"])),
            ),
            patch.object(volume, "set_audio_sink", new=AsyncMock(return_value={"ok": True})) as m_set_sink,
            patch.object(volume, "configure_pipewire_clock", new=AsyncMock()) as m_clock,
            patch.object(dock.decky, "emit", new=AsyncMock()) as m_emit,
        ):
            await switcher.evaluate_now()

        m_set_sink.assert_awaited_once_with(usb_sink["name"], plugin=plugin, is_auto_dock=True)
        m_clock.assert_awaited_once_with(True)
        m_emit.assert_awaited_once_with(
            "dock_audio_switched",
            {
                "action": "docked",
                "sink": usb_sink["name"],
                "sink_label": "FiiO K7 USB DAC",
                "toast_enabled": True,
            },
        )
        self.assertEqual(switcher.get_status_dict()["status"], "docked")

        # Now undock (only internal sink remains)
        with (
            patch.object(
                dock,
                "_exec",
                new=AsyncMock(return_value=([internal_sink], internal_sink["name"])),
            ),
            patch.object(volume, "set_audio_sink", new=AsyncMock(return_value={"ok": True})) as m_set_sink2,
            patch.object(volume, "configure_pipewire_clock", new=AsyncMock()) as m_clock2,
            patch.object(dock.decky, "emit", new=AsyncMock()) as m_emit2,
        ):
            await switcher.evaluate_now()

        m_set_sink2.assert_awaited_once_with(internal_sink["name"], plugin=plugin, is_auto_dock=True)
        m_clock2.assert_awaited_once_with(False)
        m_emit2.assert_awaited_once_with(
            "dock_audio_switched",
            {
                "action": "undocked",
                "sink": internal_sink["name"],
                "sink_label": "Steam Deck Speakers",
                "toast_enabled": True,
            },
        )
        self.assertEqual(switcher.get_status_dict()["status"], "idle")

    async def test_undock_falls_back_to_default_sink_token_when_pre_dock_missing(self):
        plugin = SimpleNamespace(
            _settings={
                "dock_auto_switch_enabled": True,
                "dock_target_sink": "auto",
                "dock_toast_enabled": False,
                "bit_perfect_clock": True,
            },
            _equalizer_manager=None,
        )
        switcher = dock.DockAudioSwitcher(plugin)
        switcher._docked_sink = "alsa_output.usb-FiiO_K7-00.analog-stereo"
        switcher._pre_dock_sink = "alsa_output.removed-device"

        with (
            patch.object(dock, "_exec", new=AsyncMock(return_value=([], ""))),
            patch.object(volume, "set_audio_sink", new=AsyncMock(return_value={"ok": True})) as m_set_sink,
            patch.object(volume, "configure_pipewire_clock", new=AsyncMock()) as m_clock,
            patch.object(dock.decky, "emit", new=AsyncMock()) as m_emit,
        ):
            await switcher.evaluate_now()

        m_set_sink.assert_awaited_once_with("@DEFAULT_SINK@", plugin=plugin, is_auto_dock=True)
        m_clock.assert_awaited_once_with(False)
        m_emit.assert_awaited_once_with(
            "dock_audio_switched",
            {
                "action": "undocked",
                "sink": "@DEFAULT_SINK@",
                "sink_label": "@DEFAULT_SINK@",
                "toast_enabled": False,
            },
        )
