import json
import os
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, Mock, patch
from urllib.error import HTTPError

with patch.dict("sys.modules", {"decky": SimpleNamespace(
    DECKY_PLUGIN_SETTINGS_DIR=tempfile.gettempdir(),
    DECKY_PLUGIN_DIR=tempfile.gettempdir(),
    DECKY_PLUGIN_RUNTIME_DIR=tempfile.gettempdir(),
    logger=Mock(),
    emit=AsyncMock(),
)}):
    from py_modules import common, lyrics_offsets, spotify


class Lyrics2CacheAndOffsetsTests(unittest.TestCase):
    def test_lrc_cache_write_and_hit(self):
        with tempfile.TemporaryDirectory() as tmp_dir, patch.object(spotify, "LYRICS_CACHE_DIR", tmp_dir):
            spotify._clear_lyrics_cache()
            mock_resp = MagicMock()
            mock_resp.read.return_value = json.dumps({
                "syncedLyrics": "[00:10.00] Line 1\n[00:15.00] Line 2",
                "plainLyrics": "Line 1\nLine 2",
            }).encode("utf-8")
            mock_resp.__enter__.return_value = mock_resp

            with patch("py_modules.spotify._fetch_spotify_cdp_lyrics", return_value=None), \
                 patch("urllib.request.urlopen", return_value=mock_resp) as mock_urlopen:
                res1 = spotify._fetch_lyrics_sync(
                    "My Song",
                    "My Artist",
                    180,
                    track_id="4uLU6hMCjMI75M1A2tKUQC",
                )
                self.assertTrue(res1["ok"])
                self.assertFalse(res1["cached"])
                self.assertEqual(res1["source"], "LRCLIB")

                expected_path = os.path.join(tmp_dir, "My Artist - My Song [4uLU6hMCjMI75M1A2tKUQC].lrc")
                self.assertTrue(os.path.isfile(expected_path))
                with open(expected_path, "r", encoding="utf-8") as f:
                    lrc_text = f.read()
                self.assertIn("[ti:My Song]", lrc_text)
                self.assertIn("[ar:My Artist]", lrc_text)
                self.assertIn("[deckify-source:LRCLIB]", lrc_text)
                self.assertIn("[deckify-synced:1]", lrc_text)

                calls_after_first = mock_urlopen.call_count
                # Clear in-memory cache to verify disk .lrc cache hit
                with spotify._CACHE_LOCK:
                    spotify._LYRICS_CACHE.clear()

                res2 = spotify._fetch_lyrics_sync(
                    "My Song",
                    "My Artist",
                    180,
                    track_id="4uLU6hMCjMI75M1A2tKUQC",
                )
                self.assertTrue(res2["ok"])
                self.assertTrue(res2["cached"])
                self.assertEqual(res2["source"], "LRCLIB")
                self.assertIn("[00:10.00] Line 1", res2["synced_lyrics"])
                self.assertEqual(mock_urlopen.call_count, calls_after_first)

    def test_lrc_force_refresh_and_no_negative_cache(self):
        with tempfile.TemporaryDirectory() as tmp_dir, patch.object(spotify, "LYRICS_CACHE_DIR", tmp_dir):
            spotify._clear_lyrics_cache()
            resp1 = MagicMock()
            resp1.read.return_value = json.dumps({
                "syncedLyrics": "[00:05.00] Old Line",
                "plainLyrics": "Old Line",
            }).encode("utf-8")
            resp1.__enter__.return_value = resp1

            resp2 = MagicMock()
            resp2.read.return_value = json.dumps({
                "syncedLyrics": "[00:05.00] Fresh Line",
                "plainLyrics": "Fresh Line",
            }).encode("utf-8")
            resp2.__enter__.return_value = resp2

            with patch.object(spotify, "_fetch_spotify_cdp_lyrics", return_value=None), \
                 patch("urllib.request.urlopen", side_effect=[resp1, resp2]):
                res1 = spotify._fetch_lyrics_sync("Track", "Artist", 180, track_id="trackRefresh1")
                self.assertTrue(res1["ok"])
                self.assertFalse(res1["cached"])

                res2 = spotify._fetch_lyrics_sync(
                    "Track",
                    "Artist",
                    180,
                    track_id="trackRefresh1",
                    force_refresh=True,
                )
                self.assertTrue(res2["ok"])
                self.assertFalse(res2["cached"])
                self.assertIn("Fresh Line", res2["synced_lyrics"])

                lrc_path = os.path.join(tmp_dir, "Artist - Track [trackRefresh1].lrc")
                with open(lrc_path, "r", encoding="utf-8") as f:
                    self.assertIn("Fresh Line", f.read())

            # Miss must never write a negative-cache .lrc file
            with patch("py_modules.spotify._fetch_spotify_cdp_lyrics", return_value=None), \
                 patch("urllib.request.urlopen", side_effect=HTTPError("https://lrclib.net", 404, "Not Found", {}, None)), \
                 patch("py_modules.spotify._fetch_netease_lyrics", return_value=None), \
                 patch("py_modules.spotify._fetch_musixmatch_lyrics", return_value=None), \
                 patch("py_modules.spotify._fetch_plain_lyrics_fallback", return_value=None):
                miss = spotify._fetch_lyrics_sync("Missing Song", "Nobody", 180, track_id="missing123")
                self.assertFalse(miss["ok"])
                self.assertIsNone(spotify._find_lrc_by_track_id("missing123"))

    def test_lrc_path_traversal_guard(self):
        with tempfile.TemporaryDirectory() as tmp_dir, patch.object(spotify, "LYRICS_CACHE_DIR", tmp_dir):
            spotify._clear_lyrics_cache()
            self.assertFalse(spotify._is_safe_lrc_path(os.path.join(tmp_dir, "..", "escape.lrc")))

            mock_resp = MagicMock()
            mock_resp.read.return_value = json.dumps({
                "plainLyrics": "Safe lyrics",
            }).encode("utf-8")
            mock_resp.__enter__.return_value = mock_resp

            with patch("py_modules.spotify._fetch_spotify_cdp_lyrics", return_value=None), \
                 patch("urllib.request.urlopen", return_value=mock_resp):
                res = spotify._fetch_lyrics_sync(
                    "Song:Name?*",
                    "../Bad/Artist",
                    180,
                    track_id="../../etc/passwd",
                )
                self.assertTrue(res["ok"])
                files = os.listdir(tmp_dir)
                self.assertEqual(len(files), 1)
                written = os.path.join(tmp_dir, files[0])
                self.assertTrue(
                    os.path.realpath(written).startswith(os.path.realpath(tmp_dir) + os.sep)
                )
                self.assertNotIn("..", files[0])

    def test_clear_lyrics_cache_removes_lrc(self):
        with tempfile.TemporaryDirectory() as tmp_dir, patch.object(spotify, "LYRICS_CACHE_DIR", tmp_dir):
            lrc_file = os.path.join(tmp_dir, "Artist - Song [abc].lrc")
            json_file = os.path.join(tmp_dir, "legacy.json")
            with open(lrc_file, "w", encoding="utf-8") as f:
                f.write("[00:01.00] Hi\n")
            with open(json_file, "w", encoding="utf-8") as f:
                f.write("{}")
            with spotify._CACHE_LOCK:
                spotify._LYRICS_CACHE["abc"] = {"ok": True}

            spotify._clear_lyrics_cache()
            self.assertFalse(os.path.exists(lrc_file))
            self.assertFalse(os.path.exists(json_file))
            with spotify._CACHE_LOCK:
                self.assertEqual(len(spotify._LYRICS_CACHE), 0)

    def test_lyrics_offsets_atomic_clamp_and_prune(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            offsets_path = os.path.join(tmp_dir, "lyrics_offsets.json")
            self.assertEqual(lyrics_offsets.get_track_offset("abc", path=offsets_path), 0)

            self.assertEqual(lyrics_offsets.set_track_offset("abc", 15000, path=offsets_path), 10000)
            self.assertEqual(lyrics_offsets.set_track_offset("xyz", -25000, path=offsets_path), -10000)
            self.assertEqual(lyrics_offsets.get_track_offset("abc", path=offsets_path), 10000)
            self.assertEqual(lyrics_offsets.get_track_offset("xyz", path=offsets_path), -10000)

            # Prune 0ms entry
            self.assertEqual(lyrics_offsets.set_track_offset("abc", 0, path=offsets_path), 0)
            with open(offsets_path, "r", encoding="utf-8") as f:
                raw = json.load(f)
            self.assertNotIn("abc", raw)
            self.assertEqual(raw.get("xyz"), -10000)

            with self.assertRaises(ValueError):
                lyrics_offsets.set_track_offset("", 500, path=offsets_path)

    def test_backward_compatible_get_lyrics_signature(self):
        with tempfile.TemporaryDirectory() as tmp_dir, patch.object(spotify, "LYRICS_CACHE_DIR", tmp_dir):
            spotify._clear_lyrics_cache()
            mock_resp = MagicMock()
            mock_resp.read.return_value = json.dumps({
                "syncedLyrics": "[00:12.00] Compat line",
                "plainLyrics": "Compat line",
            }).encode("utf-8")
            mock_resp.__enter__.return_value = mock_resp

            with patch("py_modules.spotify._fetch_spotify_cdp_lyrics", return_value=None), \
                 patch("urllib.request.urlopen", return_value=mock_resp) as mock_urlopen:
                res1 = spotify._fetch_lyrics_sync("Compat Song", "Compat Artist", 180)
                self.assertTrue(res1["ok"])
                self.assertFalse(res1["cached"])
                calls_first = mock_urlopen.call_count

                res2 = spotify._fetch_lyrics_sync("Compat Song", "Compat Artist", 180)
                self.assertTrue(res2["ok"])
                self.assertTrue(res2["cached"])
                self.assertEqual(mock_urlopen.call_count, calls_first)

    def test_romanize_settings_defaults_and_validation(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            settings_path = os.path.join(tmp_dir, "settings.json")
            with open(settings_path, "w", encoding="utf-8") as f:
                json.dump({
                    "romanize_lyrics_enabled": "yes",
                    "romanize_display_style": "invalid_style",
                    "romanize_overlay_enabled": 1,
                }, f)
            with patch.object(common, "SETTINGS_FILE", settings_path):
                loaded = common._load_settings()
            self.assertIs(loaded["romanize_lyrics_enabled"], True)
            self.assertEqual(loaded["romanize_display_style"], "dual")
            self.assertIs(loaded["romanize_overlay_enabled"], True)


if __name__ == "__main__":
    unittest.main()
