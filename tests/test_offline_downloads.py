import json
import os
import sys
import tempfile
import threading
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(__file__))
from test_token_refresh import main  # noqa: F401
from py_modules import cdp_bridge, common


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


if __name__ == "__main__":
    unittest.main()
