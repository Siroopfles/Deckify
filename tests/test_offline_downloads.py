import json
import os
import sys
import tempfile
import threading
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.insert(0, os.path.dirname(__file__))
from test_token_refresh import main  # noqa: F401
from py_modules import cdp_bridge, common, engine, rpc_library


class TestOfflineDownloads(unittest.TestCase):
    def test_default_settings_include_offline_and_travel_keys(self):
        self.assertIn("travel_mode_enabled", common.DEFAULT_SETTINGS)
        self.assertFalse(common.DEFAULT_SETTINGS["travel_mode_enabled"])
        self.assertIn("travel_mode_manual", common.DEFAULT_SETTINGS)
        self.assertFalse(common.DEFAULT_SETTINGS["travel_mode_manual"])
        self.assertIn("travel_mode_auto_enabled", common.DEFAULT_SETTINGS)
        self.assertTrue(common.DEFAULT_SETTINGS["travel_mode_auto_enabled"])
        self.assertEqual(common.DEFAULT_SETTINGS["offline_min_free_gb"], 3.0)
        self.assertEqual(
            common.DEFAULT_SETTINGS["offline_storage_path"],
            common.SPOTIFY_CLIENT_CACHE_DIR,
        )

    def test_clamp_offline_min_free_gb(self):
        self.assertEqual(common.clamp_offline_min_free_gb(3.0), 3.0)
        self.assertEqual(common.clamp_offline_min_free_gb(0.1), 0.5)
        self.assertEqual(common.clamp_offline_min_free_gb(120.0), 50.0)
        self.assertEqual(common.clamp_offline_min_free_gb("invalid"), 3.0)
        self.assertEqual(common.clamp_offline_min_free_gb(None), 3.0)
        self.assertEqual(common.clamp_offline_min_free_gb(True), 3.0)

    def test_get_disk_free_bytes_uses_statvfs_f_bavail_on_posix(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            nested = os.path.join(tmpdir, "missing", "subdir")
            fake_stat = SimpleNamespace(f_bavail=1000, f_bfree=5000, f_frsize=4096)
            with patch.object(os, "statvfs", return_value=fake_stat, create=True) as mock_statvfs:
                free_bytes = common.get_disk_free_bytes(nested)
            mock_statvfs.assert_called_once_with(tmpdir)
            self.assertEqual(free_bytes, 1000 * 4096)

    def test_get_disk_free_bytes_windows_fallback(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            fake_usage = SimpleNamespace(free=8 * (1024 ** 3))
            with patch("py_modules.common.hasattr", return_value=False, create=True):
                with patch("py_modules.common.shutil.disk_usage", return_value=fake_usage) as mock_du:
                    free_bytes = common.get_disk_free_bytes(tmpdir)
            mock_du.assert_called_once_with(tmpdir)
            self.assertEqual(free_bytes, 8 * (1024 ** 3))

    def test_check_disk_guardrail_blocks_below_threshold(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            low_bytes = int(2.5 * (1024 ** 3))
            with patch("py_modules.common.get_disk_free_bytes", return_value=low_bytes):
                res = common.check_disk_guardrail(tmpdir, 3.0)
            self.assertFalse(res["allowed"])
            self.assertEqual(res["free_bytes"], low_bytes)
            self.assertEqual(res["min_free_gb"], 3.0)

            ok_bytes = int(4.5 * (1024 ** 3))
            with patch("py_modules.common.get_disk_free_bytes", return_value=ok_bytes):
                res_ok = common.check_disk_guardrail(tmpdir, 3.0)
            self.assertTrue(res_ok["allowed"])
            self.assertEqual(res_ok["free_bytes"], ok_bytes)

    def test_cdp_set_offline_download_blocked_by_disk_guardrail(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            cache_file = os.path.join(tmpdir, "offline_downloads.json")
            low_bytes = int(1.0 * (1024 ** 3))
            eval_fn = MagicMock()
            with patch("py_modules.common.get_disk_free_bytes", return_value=low_bytes):
                res = cdp_bridge.cdp_set_offline_download(
                    "spotify:playlist:abc",
                    download=True,
                    eval_fn=eval_fn,
                    cache_file=cache_file,
                    storage_path=tmpdir,
                    min_free_gb=3.0,
                )
            self.assertFalse(res["ok"])
            self.assertEqual(res.get("offline_state"), "paused_low_space")
            eval_fn.assert_not_called()

    def test_cdp_set_offline_download_idempotent_and_removal(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            cache_file = os.path.join(tmpdir, "offline_downloads.json")
            ok_bytes = int(10.0 * (1024 ** 3))

            def fake_eval(expr, port=9229, timeout=4.0):
                self.assertIn("OfflineAPI", expr)
                return {"ok": True, "offline_state": "downloading", "progress": 25}

            with patch("py_modules.common.get_disk_free_bytes", return_value=ok_bytes):
                res1 = cdp_bridge.cdp_set_offline_download(
                    "  spotify:playlist:123  ",
                    download=True,
                    item_meta={"name": "Roadtrip", "type": "playlist"},
                    eval_fn=fake_eval,
                    cache_file=cache_file,
                    storage_path=tmpdir,
                )
                res2 = cdp_bridge.cdp_set_offline_download(
                    "spotify:playlist:123",
                    download=True,
                    item_meta={"name": "Roadtrip", "type": "playlist"},
                    eval_fn=fake_eval,
                    cache_file=cache_file,
                    storage_path=tmpdir,
                )
            self.assertTrue(res1["ok"])
            self.assertTrue(res2["ok"])
            cached = cdp_bridge.load_offline_downloads_cache(cache_file)
            self.assertEqual(list(cached.keys()), ["spotify:playlist:123"])
            self.assertEqual(cached["spotify:playlist:123"]["offline_state"], "downloading")
            self.assertEqual(cached["spotify:playlist:123"]["progress"], 25)

            res_rm = cdp_bridge.cdp_set_offline_download(
                "spotify:playlist:123",
                download=False,
                eval_fn=lambda expr, **kw: {"ok": True},
                cache_file=cache_file,
                storage_path=tmpdir,
            )
            self.assertTrue(res_rm["ok"])
            self.assertEqual(cdp_bridge.load_offline_downloads_cache(cache_file), {})

    def test_offline_downloads_cache_concurrent_atomic_writes(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            cache_file = os.path.join(tmpdir, "offline_downloads.json")
            ok_bytes = int(10.0 * (1024 ** 3))
            errors = []

            def worker(idx):
                try:
                    with patch("py_modules.common.get_disk_free_bytes", return_value=ok_bytes):
                        cdp_bridge.cdp_set_offline_download(
                            f"spotify:album:{idx}",
                            download=True,
                            item_meta={"name": f"Album {idx}", "type": "album"},
                            eval_fn=lambda expr, **kw: {"ok": True, "offline_state": "downloaded", "progress": 100},
                            cache_file=cache_file,
                            storage_path=tmpdir,
                        )
                except Exception as exc:
                    errors.append(exc)

            threads = [threading.Thread(target=worker, args=(i,)) for i in range(8)]
            for t in threads:
                t.start()
            for t in threads:
                t.join()

            self.assertEqual(errors, [])
            with open(cache_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            self.assertEqual(len(data), 8)

    def test_cdp_get_offline_status_and_list_normalization(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            cache_file = os.path.join(tmpdir, "offline_downloads.json")
            cdp_bridge.save_offline_downloads_cache(
                {
                    "spotify:playlist:a": {
                        "uri": "spotify:playlist:a",
                        "name": "Mix A",
                        "type": "playlist",
                        "offline_state": "downloading",
                        "progress": 10,
                    }
                },
                cache_file=cache_file,
            )

            def fake_eval(expr, port=9229, timeout=4.0):
                return {
                    "ok": True,
                    "items": [
                        {
                            "uri": "spotify:playlist:a",
                            "offline_state": "downloaded",
                            "progress": 150,
                        },
                        {
                            "uri": "spotify:episode:b",
                            "offline_state": "downloading",
                            "progress": -5,
                        },
                    ],
                }

            status = cdp_bridge.cdp_get_offline_status(eval_fn=fake_eval, cache_file=cache_file)
            self.assertTrue(status["ok"])
            self.assertEqual(status["items"]["spotify:playlist:a"]["progress"], 100)
            self.assertEqual(status["items"]["spotify:playlist:a"]["offline_state"], "downloaded")
            self.assertEqual(status["items"]["spotify:episode:b"]["progress"], 0)
            self.assertEqual(status["items"]["spotify:episode:b"]["offline_state"], "downloading")

            items_list = cdp_bridge.cdp_get_offline_downloads_list(eval_fn=fake_eval, cache_file=cache_file)
            self.assertEqual([i["uri"] for i in items_list], ["spotify:episode:b", "spotify:playlist:a"])

            rm_all = cdp_bridge.cdp_remove_all_offline_downloads(
                eval_fn=lambda expr, **kw: {"ok": True},
                cache_file=cache_file,
            )
            self.assertTrue(rm_all["ok"])
            self.assertEqual(cdp_bridge.load_offline_downloads_cache(cache_file), {})

    def test_validate_and_configure_offline_storage_path(self):
        for bad in ("", "   ", "relative/path", "/tmp/bad\x00path", "/tmp/bad\npath", "/tmp/bad\rpath"):
            ok, resolved, err = engine.validate_offline_storage_path(bad)
            self.assertFalse(ok, f"Expected rejection for {bad!r}")
            self.assertEqual(resolved, "")
            self.assertTrue(err)

        with tempfile.TemporaryDirectory() as tmpdir:
            target = os.path.join(tmpdir, "spotify-offline")
            config_dir = os.path.join(tmpdir, "spotify-config")
            os.makedirs(config_dir, exist_ok=True)
            prefs_file = os.path.join(config_dir, "prefs")
            with open(prefs_file, "w", encoding="utf-8") as f:
                f.write("audio.gapless_v2=true\n")

            runner = MagicMock(return_value=SimpleNamespace(returncode=0, stdout="", stderr=""))
            res = engine.configure_offline_storage_path(
                target,
                runner=runner,
                config_dir=config_dir,
            )
            self.assertTrue(res["success"])
            self.assertEqual(res["path"], os.path.abspath(target))
            self.assertTrue(os.path.isdir(target))
            runner.assert_called_once()
            cmd_arg = runner.call_args[0][0]
            self.assertIsInstance(cmd_arg, list)
            self.assertIn("flatpak", cmd_arg)
            self.assertIn("override", cmd_arg)
            self.assertIn("--user", cmd_arg)
            self.assertIn(f"--filesystem={os.path.abspath(target)}", cmd_arg)
            self.assertNotIn("--filesystem=host", cmd_arg)
            self.assertNotIn("shell", runner.call_args[1])

            with open(prefs_file, "r", encoding="utf-8") as f:
                prefs_text = f.read()
            self.assertIn("audio.gapless_v2=true", prefs_text)
            self.assertIn(f'storage.offline-path="{os.path.abspath(target)}"', prefs_text)


class TestPhase28PluginRPCs(unittest.IsolatedAsyncioTestCase):
    def _make_plugin(self):
        plugin = main.Plugin()
        plugin._settings = dict(common.DEFAULT_SETTINGS)
        plugin._access_token = "tok"
        plugin._refresh_token = "ref"
        plugin._token_expires_at = 9999999999
        plugin._bookmark_manager = plugin._create_bookmark_manager()
        return plugin

    async def test_toggle_offline_download_guardrail_and_delegation(self):
        plugin = self._make_plugin()
        low_guard = {"allowed": False, "free_gb": 1.2, "min_free_gb": 3.0, "free_bytes": 1200}
        ok_guard = {"allowed": True, "free_gb": 10.0, "min_free_gb": 3.0, "free_bytes": 10000}

        with patch.object(main.common, "check_disk_guardrail", return_value=low_guard):
            with patch.object(main.cdp_bridge, "cdp_set_offline_download") as mock_cdp:
                res = await plugin.toggle_offline_download("spotify:playlist:p1", download=True)
        self.assertFalse(res["success"])
        self.assertTrue(res["low_disk_space"])
        mock_cdp.assert_not_called()

        with patch.object(main.common, "check_disk_guardrail", return_value=ok_guard):
            with patch.object(
                main.cdp_bridge,
                "cdp_set_offline_download",
                return_value={"ok": True, "uri": "spotify:playlist:p1", "offline_state": "downloading", "progress": 0},
            ) as mock_cdp:
                res_ok = await plugin.toggle_offline_download("spotify:playlist:p1", download=True)
        self.assertTrue(res_ok["success"])
        self.assertEqual(res_ok["offline_state"], "downloading")
        mock_cdp.assert_called_once()

    async def test_active_download_aborts_on_low_disk_space_during_poll(self):
        plugin = self._make_plugin()
        plugin._ensure_token = AsyncMock(return_value="tok")
        low_guard = {"allowed": False, "free_gb": 1.5, "min_free_gb": 3.0, "free_bytes": 1500}
        cache_data = {
            "spotify:playlist:dl1": {
                "uri": "spotify:playlist:dl1",
                "offline_state": "downloading",
                "progress": 42,
            }
        }
        with patch.object(main, "_spotify_api_request", return_value=None):
            with patch.object(main.cdp_bridge, "load_offline_downloads_cache", return_value=cache_data):
                with patch.object(
                    main.cdp_bridge,
                    "cdp_get_offline_status",
                    return_value={"ok": True, "items": dict(cache_data), "source": "cache"},
                ):
                    with patch.object(main.common, "check_disk_guardrail", return_value=low_guard):
                        with patch.object(
                            main.cdp_bridge,
                            "cdp_set_offline_download",
                            return_value={"ok": True, "offline_state": "not_downloaded"},
                        ) as mock_cancel:
                            with patch.object(main.decky, "emit", new_callable=AsyncMock) as mock_emit:
                                ok = await plugin._poll_playback()
        self.assertTrue(ok)
        mock_cancel.assert_called_once_with("spotify:playlist:dl1", False)
        emitted_events = [c.args[0] for c in mock_emit.call_args_list]
        self.assertIn("low_disk_space", emitted_events)

    async def test_set_travel_mode_persists_and_updates_status(self):
        plugin = self._make_plugin()
        with patch.object(main, "_save_settings") as mock_save:
            with patch.object(main.decky, "emit", new_callable=AsyncMock) as mock_emit:
                res = await plugin.set_travel_mode(enabled=True, manual=True)
        self.assertTrue(res["ok"])
        self.assertTrue(res["travel_mode_enabled"])
        self.assertTrue(res["travel_mode_manual"])
        self.assertTrue(plugin._settings["travel_mode_enabled"])
        self.assertTrue(plugin._settings["travel_mode_manual"])
        mock_save.assert_called()
        mock_emit.assert_any_call(
            "travel_mode_changed",
            {
                "travel_mode_enabled": True,
                "travel_mode_manual": True,
                "travel_mode_auto_enabled": True,
            },
        )
        status = await plugin.get_status()
        self.assertTrue(status["travel_mode_enabled"])
        self.assertTrue(status["travel_mode_manual"])
        self.assertIn("travel_mode_auto_enabled", status)
        self.assertIn("offline_min_free_gb", status)
        self.assertIn("offline_storage_path", status)
        self.assertIn("jam_session", status)

    async def test_jam_rpcs_delegate_to_cdp_bridge(self):
        plugin = self._make_plugin()
        with patch.object(
            main.cdp_bridge,
            "cdp_start_spotify_jam",
            return_value={"ok": True, "active": True, "join_url": "https://spotify.link/jam1"},
        ) as mock_start:
            res_start = await plugin.start_spotify_jam()
        self.assertTrue(res_start["success"])
        self.assertEqual(res_start["join_url"], "https://spotify.link/jam1")
        mock_start.assert_called_once()

        with patch.object(
            main.cdp_bridge,
            "cdp_get_jam_status",
            return_value={"ok": True, "active": True, "participants": [{"name": "Alex"}]},
        ) as mock_status:
            res_status = await plugin.get_jam_status()
        self.assertTrue(res_status["success"])
        self.assertEqual(len(res_status["participants"]), 1)
        mock_status.assert_called_once()

        with patch.object(
            main.cdp_bridge,
            "cdp_end_spotify_jam",
            return_value={"ok": True, "active": False},
        ) as mock_end:
            res_end = await plugin.end_spotify_jam()
        self.assertTrue(res_end["success"])
        self.assertFalse(res_end["active"])
        mock_end.assert_called_once()

    def test_annotate_offline_metadata(self):
        items = [
            {"id": "1", "uri": "spotify:playlist:1"},
            {"id": "2", "uri": "spotify:playlist:2"},
        ]
        cache = {
            "spotify:playlist:1": {
                "uri": "spotify:playlist:1",
                "offline_state": "downloaded",
                "progress": 100,
                "size_bytes": 123456,
            }
        }
        rpc_library.annotate_offline_metadata(items, cache=cache)
        self.assertEqual(items[0]["offline_state"], "downloaded")
        self.assertEqual(items[0]["offline_progress"], 100)
        self.assertEqual(items[0]["offline_size_bytes"], 123456)
        self.assertEqual(items[1]["offline_state"], "not_downloaded")
        self.assertEqual(items[1]["offline_progress"], 0)
        self.assertEqual(items[1]["offline_size_bytes"], 0)


if __name__ == "__main__":
    unittest.main()
