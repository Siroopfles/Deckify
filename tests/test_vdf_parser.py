import os
import struct
import tempfile
import unittest
import zlib
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

with patch.dict("sys.modules", {"decky": SimpleNamespace(
    DECKY_PLUGIN_SETTINGS_DIR=tempfile.gettempdir(),
    DECKY_PLUGIN_DIR=tempfile.gettempdir(),
    DECKY_PLUGIN_RUNTIME_DIR=tempfile.gettempdir(),
    logger=MagicMock(),
    emit=AsyncMock(),
)}):
    from py_modules import vdf_parser


def _s(key, val):
    return b"\x01" + key.encode() + b"\x00" + val.encode() + b"\x00"


def _i(key, val):
    return b"\x02" + key.encode() + b"\x00" + struct.pack("<i", val)


def _d(key, body):
    return b"\x00" + key.encode() + b"\x00" + body + b"\x08"


def _shortcuts(entries):
    body = b""
    for idx, e in enumerate(entries):
        inner = _i("appid", e["appid"]) if "appid" in e else b""
        inner += _s("AppName", e["name"]) + _s("Exe", e["exe"]) + _s("StartDir", "/tmp")
        inner += _d("tags", _s("0", "fav"))
        body += _d(str(idx), inner)
    return _d("shortcuts", body) + b"\x08"


class TestBinaryVdf(unittest.TestCase):
    def test_parses_shortcuts(self):
        data = _shortcuts([{"appid": -1234567, "name": "Game A", "exe": "/bin/a"}])
        parsed = vdf_parser.parse_binary_vdf(data)
        entry = parsed["shortcuts"]["0"]
        self.assertEqual(entry["AppName"], "Game A")
        self.assertEqual(entry["appid"], -1234567)
        self.assertEqual(entry["tags"], {"0": "fav"})

    def test_types(self):
        data = (_i("a", 5) + b"\x03f\x00" + struct.pack("<f", 1.5)
                + b"\x07q\x00" + struct.pack("<q", 2 ** 40) + _s("s", "x") + b"\x08")
        parsed = vdf_parser.parse_binary_vdf(data)
        self.assertEqual(parsed["a"], 5)
        self.assertAlmostEqual(parsed["f"], 1.5)
        self.assertEqual(parsed["q"], 2 ** 40)
        self.assertEqual(parsed["s"], "x")

    def test_truncated_returns_partial(self):
        data = _s("ok", "yes") + b"\x02broken\x00\x01"
        parsed = vdf_parser.parse_binary_vdf(data)
        self.assertEqual(parsed, {"ok": "yes"})

    def test_garbage_does_not_raise(self):
        self.assertEqual(vdf_parser.parse_binary_vdf(b"\xff\x00\x01"), {})
        self.assertEqual(vdf_parser.parse_binary_vdf(b""), {})


class TestNonSteamAppId(unittest.TestCase):
    def test_crc_top_bit_unsigned(self):
        app_id = vdf_parser.compute_non_steam_appid("/bin/a", "Game A")
        expected = (zlib.crc32(b"/bin/aGame A") | 0x80000000) & 0xFFFFFFFF
        self.assertEqual(app_id, expected)
        self.assertGreater(app_id, 0)
        self.assertTrue(app_id & 0x80000000)

    def test_raw_signed_becomes_unsigned(self):
        app_id = vdf_parser.compute_non_steam_appid("x", "y", -1)
        self.assertEqual(app_id, 0xFFFFFFFF)
        self.assertEqual(vdf_parser.compute_non_steam_appid("x", "y", struct.unpack("<i", struct.pack("<I", 0x80001234))[0]), 0x80001234)


LIB_VDF = '''"libraryfolders"
{
	"0"
	{
		"path"		"/home/deck/.local/share/Steam"
		"apps" { "620" "123" }
	}
	"1"
	{
		"path"		"/run/media/mmcblk0p1"
	}
}
'''

ACF = '''"AppState"
{
	"appid"		"620"
	"name"		"Portal 2"
	"installdir"		"Portal 2"
}
'''


class TestTextVdf(unittest.TestCase):
    def test_libraryfolders(self):
        paths = vdf_parser.parse_libraryfolders_vdf(LIB_VDF)
        self.assertEqual(paths, ["/home/deck/.local/share/Steam", "/run/media/mmcblk0p1"])

    def test_appmanifest(self):
        info = vdf_parser.parse_appmanifest(ACF)
        self.assertEqual(info["app_id"], 620)
        self.assertEqual(info["name"], "Portal 2")
        self.assertIsNone(vdf_parser.parse_appmanifest("garbage"))


class TestInstalledGames(unittest.TestCase):
    def setUp(self):
        vdf_parser._games_cache.update({"ts": 0.0, "games": None})

    def test_discovery_and_cache(self):
        with tempfile.TemporaryDirectory() as root:
            os.makedirs(os.path.join(root, "steamapps"))
            with open(os.path.join(root, "steamapps", "appmanifest_620.acf"), "w") as f:
                f.write(ACF)
            cfg = os.path.join(root, "userdata", "1", "config")
            os.makedirs(cfg)
            with open(os.path.join(cfg, "shortcuts.vdf"), "wb") as f:
                f.write(_shortcuts([{"name": "Alpha", "exe": "/bin/alpha"}]))
            with patch.object(vdf_parser, "_steam_roots", return_value=[root]):
                games = vdf_parser.get_installed_games(force_refresh=True)
                self.assertEqual([g["name"] for g in games], ["Alpha", "Portal 2"])
                self.assertTrue(games[0]["is_non_steam"])
                self.assertTrue(games[0]["app_id"] & 0x80000000)
                self.assertTrue(games[1]["is_steam"])
                # Cached: removing the manifest has no effect inside the TTL
                os.remove(os.path.join(root, "steamapps", "appmanifest_620.acf"))
                self.assertEqual(len(vdf_parser.get_installed_games()), 2)
                self.assertEqual(len(vdf_parser.get_installed_games(force_refresh=True)), 1)

    def test_ttl_expiry(self):
        with patch.object(vdf_parser, "_scan_steam_games", return_value=[]) as scan, \
                patch.object(vdf_parser, "_scan_non_steam_games", return_value=[]):
            vdf_parser.get_installed_games(force_refresh=True)
            vdf_parser.get_installed_games()
            self.assertEqual(scan.call_count, 1)
            vdf_parser._games_cache["ts"] -= 31
            vdf_parser.get_installed_games()
            self.assertEqual(scan.call_count, 2)


if __name__ == "__main__":
    unittest.main()
