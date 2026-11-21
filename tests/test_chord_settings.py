import copy
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
    from py_modules import common

try:
    from test_token_refresh import main
except ImportError:
    from tests.test_token_refresh import main


class TestChordSettings(unittest.IsolatedAsyncioTestCase):
    def test_defaults_have_silent_banner_and_eight_chord_actions(self):
        self.assertIs(common.DEFAULT_SETTINGS["silent_banner_enabled"], True)
        bindings = common.DEFAULT_SETTINGS["gamepad_chord_bindings"]
        self.assertEqual(tuple(bindings.keys()), common.CHORD_ACTION_IDS)
        self.assertEqual(
            bindings,
            {
                "previous": [11, 27],
                "next": [12, 27],
                "play_pause": [1, 27],
                "volume_up": [9, 27],
                "volume_down": [10, 27],
                "toggle_like": [],
                "cycle_pinned": [],
                "toggle_lyrics": [],
            },
        )

    def test_load_settings_and_helpers_return_deep_copies(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            missing_path = os.path.join(tmpdir, "does_not_exist.json")
            corrupt_path = os.path.join(tmpdir, "corrupt.json")
            partial_path = os.path.join(tmpdir, "partial.json")
            with open(corrupt_path, "w") as f:
                f.write("{invalid json")
            with open(partial_path, "w") as f:
                json.dump({"device_name": "Deck"}, f)

            for path in (missing_path, corrupt_path, partial_path):
                loaded = common._load_settings(path)
                loaded["gamepad_chord_bindings"]["previous"].append(99)
                loaded["gamepad_chord_bindings"]["toggle_like"].append(4)
                loaded["eq_custom_bands"][0] = 9.0
                loaded["pinned_playlists"].append({"uri": "x"})

                self.assertEqual(common.DEFAULT_CHORD_BINDINGS["previous"], [11, 27])
                self.assertEqual(common.DEFAULT_CHORD_BINDINGS["toggle_like"], [])
                self.assertEqual(common.DEFAULT_SETTINGS["gamepad_chord_bindings"]["previous"], [11, 27])
                self.assertEqual(common.DEFAULT_SETTINGS["gamepad_chord_bindings"]["toggle_like"], [])
                self.assertEqual(common.DEFAULT_SETTINGS["eq_custom_bands"], [0.0] * 10)
                self.assertEqual(common.DEFAULT_SETTINGS["pinned_playlists"], [])

        sanitized = common._sanitize_chord_bindings(None)
        sanitized["next"].append(99)
        self.assertEqual(common.DEFAULT_CHORD_BINDINGS["next"], [12, 27])

        validated, err = common._validate_chord_bindings({"toggle_like": [4]})
        self.assertIsNone(err)
        validated["previous"].append(99)
        validated["toggle_like"].append(88)
        self.assertEqual(common.DEFAULT_CHORD_BINDINGS["previous"], [11, 27])

    async def test_get_status_exposes_silent_banner_and_chord_bindings(self):
        plugin = main.Plugin()
        plugin._settings = copy.deepcopy(common.DEFAULT_SETTINGS)
        plugin._settings["silent_banner_enabled"] = False
        plugin._settings["gamepad_chord_bindings"]["toggle_like"] = [4]

        status = await plugin.get_status()
        self.assertIn("silent_banner_enabled", status["settings"])
        self.assertIn("gamepad_chord_bindings", status["settings"])
        self.assertIs(status["settings"]["silent_banner_enabled"], False)
        self.assertEqual(status["settings"]["gamepad_chord_bindings"]["toggle_like"], [4])

    async def test_set_setting_silent_banner_enabled_coerces_saves_and_emits(self):
        plugin = main.Plugin()
        plugin._settings = copy.deepcopy(common.DEFAULT_SETTINGS)

        with patch.object(main, "_save_settings") as mock_save, patch.object(
            main.decky, "emit", new_callable=AsyncMock
        ) as mock_emit:
            res = await plugin.set_setting("silent_banner_enabled", False)
            self.assertTrue(res["ok"])
            self.assertIs(plugin._settings["silent_banner_enabled"], False)
            self.assertIs(res["settings"]["silent_banner_enabled"], False)
            mock_save.assert_called_once()
            mock_emit.assert_awaited_once()
            self.assertEqual(mock_emit.await_args.args[0], "settings_changed")
            self.assertIs(mock_emit.await_args.args[1]["silent_banner_enabled"], False)

            res2 = await plugin.set_setting("silent_banner_enabled", 1)
            self.assertTrue(res2["ok"])
            self.assertIs(plugin._settings["silent_banner_enabled"], True)

    async def test_set_setting_gamepad_chord_bindings_accepts_normalizes_and_preserves_partial(self):
        plugin = main.Plugin()
        plugin._settings = copy.deepcopy(common.DEFAULT_SETTINGS)

        with patch.object(main, "_save_settings") as mock_save, patch.object(
            main.decky, "emit", new_callable=AsyncMock
        ) as mock_emit:
            # Partial update with bare button, 4-button chord, 28->27 normalization + dedupe/sort, and unbind []
            res = await plugin.set_setting(
                "gamepad_chord_bindings",
                {
                    "toggle_like": [4],
                    "cycle_pinned": [25, 23, 4, 1],
                    "toggle_lyrics": [28, 4, 27, 4],
                    "volume_down": [],
                },
            )
            self.assertTrue(res["ok"])
            saved = plugin._settings["gamepad_chord_bindings"]
            self.assertEqual(saved["toggle_like"], [4])
            self.assertEqual(saved["cycle_pinned"], [1, 4, 23, 25])
            self.assertEqual(saved["toggle_lyrics"], [4, 27])
            self.assertEqual(saved["volume_down"], [])
            # Omitted keys preserved from existing settings
            self.assertEqual(saved["previous"], [11, 27])
            self.assertEqual(saved["next"], [12, 27])
            self.assertEqual(saved["play_pause"], [1, 27])
            self.assertEqual(saved["volume_up"], [9, 27])
            mock_save.assert_called_once()
            mock_emit.assert_awaited_once()
            self.assertEqual(mock_emit.await_args.args[0], "settings_changed")

    async def test_set_setting_gamepad_chord_bindings_rejects_invalid_and_reserved_without_mutation(self):
        plugin = main.Plugin()
        plugin._settings = copy.deepcopy(common.DEFAULT_SETTINGS)
        original_snapshot = copy.deepcopy(plugin._settings)

        invalid_payloads = [
            "not-a-dict",
            ["not-a-dict"],
            {"unknown_action": [4]},
            {"toggle_like": 4},
            {"toggle_like": [True]},
            {"toggle_like": [False]},
            {"toggle_like": ["X"]},
            {"toggle_like": [-1]},
            {"toggle_like": [29]},
            {"toggle_like": [1, 2, 4, 23, 24]},
            {"toggle_like": [27, 3]},
            {"toggle_like": [28, 6]},
            {"toggle_like": [13, 5]},
            {"toggle_like": [14, 3]},
            {"toggle_like": [27, 5]},
            {"toggle_like": [11, 27]},  # duplicates existing previous
            {"toggle_like": [28, 1]},   # normalizes to [1, 27], duplicates play_pause
            {"toggle_like": [23], "cycle_pinned": [23]},  # cross-action duplicate in payload
        ]

        with patch.object(main, "_save_settings") as mock_save, patch.object(
            main.decky, "emit", new_callable=AsyncMock
        ) as mock_emit:
            for payload in invalid_payloads:
                res = await plugin.set_setting("gamepad_chord_bindings", payload)
                self.assertFalse(res["ok"], f"Expected rejection for {payload!r}")
                self.assertTrue(res.get("error"))
                self.assertEqual(plugin._settings, original_snapshot)
            mock_save.assert_not_called()
            mock_emit.assert_not_awaited()

    def test_load_settings_recovers_from_corrupt_disk_chord_settings(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            settings_path = os.path.join(tmpdir, "settings.json")

            # Non-dict gamepad_chord_bindings & invalid silent_banner_enabled
            with open(settings_path, "w") as f:
                json.dump(
                    {
                        "silent_banner_enabled": "not-a-bool",
                        "gamepad_chord_bindings": "corrupt",
                    },
                    f,
                )
            loaded = common._load_settings(settings_path)
            self.assertIs(loaded["silent_banner_enabled"], True)
            self.assertEqual(loaded["gamepad_chord_bindings"], common.DEFAULT_CHORD_BINDINGS)

            # Corrupt entries, bool entries, reserved chords, and cross-action duplicates
            with open(settings_path, "w") as f:
                json.dump(
                    {
                        "silent_banner_enabled": False,
                        "gamepad_chord_bindings": {
                            "previous": [True, 11],       # bool -> fallback default [11, 27]
                            "next": [27, 3],              # reserved -> fallback default [12, 27]
                            "play_pause": [28, 1],        # valid, normalizes -> [1, 27]
                            "volume_up": [1, 27],         # duplicates play_pause -> reset []
                            "volume_down": [1, 2, 3, 4, 5],  # >4 -> fallback default [10, 27]
                            "toggle_like": [13, 5],       # reserved -> fallback default []
                            "cycle_pinned": ["X"],        # non-int -> fallback default []
                            "toggle_lyrics": [24],        # valid bare button -> [24]
                        },
                    },
                    f,
                )
            loaded2 = common._load_settings(settings_path)
            self.assertIs(loaded2["silent_banner_enabled"], False)
            self.assertEqual(
                loaded2["gamepad_chord_bindings"],
                {
                    "previous": [11, 27],
                    "next": [12, 27],
                    "play_pause": [1, 27],
                    "volume_up": [],
                    "volume_down": [10, 27],
                    "toggle_like": [],
                    "cycle_pinned": [],
                    "toggle_lyrics": [24],
                },
            )

    async def test_silent_banner_position_defaults_load_validation_and_get_status(self):
        self.assertEqual(common.DEFAULT_SETTINGS["silent_banner_position"], "top-right")

        with tempfile.TemporaryDirectory() as tmpdir:
            norm_path = os.path.join(tmpdir, "norm.json")
            with open(norm_path, "w") as f:
                json.dump({"silent_banner_position": "bottom_left"}, f)
            self.assertEqual(common._load_settings(norm_path)["silent_banner_position"], "bottom-left")

            bad_path = os.path.join(tmpdir, "bad.json")
            with open(bad_path, "w") as f:
                json.dump({"silent_banner_position": "center"}, f)
            self.assertEqual(common._load_settings(bad_path)["silent_banner_position"], "top-right")

        plugin = main.Plugin()
        plugin._settings = copy.deepcopy(common.DEFAULT_SETTINGS)

        with patch.object(main, "_save_settings") as mock_save, patch.object(
            main.decky, "emit", new_callable=AsyncMock
        ) as mock_emit:
            res = await plugin.set_setting("silent_banner_position", "bottom_right")
            self.assertTrue(res["ok"])
            self.assertEqual(plugin._settings["silent_banner_position"], "bottom-right")
            self.assertEqual(res["settings"]["silent_banner_position"], "bottom-right")
            mock_save.assert_called_once()
            mock_emit.assert_awaited_once()

            bad_res = await plugin.set_setting("silent_banner_position", "middle")
            self.assertFalse(bad_res["ok"])
            self.assertIn("Invalid silent_banner_position", bad_res.get("error", ""))
            self.assertEqual(plugin._settings["silent_banner_position"], "bottom-right")

        status = await plugin.get_status()
        self.assertEqual(status["settings"]["silent_banner_position"], "bottom-right")


if __name__ == "__main__":
    unittest.main()
