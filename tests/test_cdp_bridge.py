import json
import os
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(__file__))
from test_token_refresh import main  # noqa: F401
from py_modules import cdp_bridge


class TestCdpBridge(unittest.TestCase):
    def test_is_spotify_client_running_fast_fail(self):
        self.assertFalse(cdp_bridge.is_spotify_client_running(None))

        librespot_plugin = SimpleNamespace(
            _settings={"audio_backend": "librespot"},
            _spotify_client_process=MagicMock(poll=MagicMock(return_value=None)),
        )
        self.assertFalse(cdp_bridge.is_spotify_client_running(librespot_plugin))

        stopped_plugin = SimpleNamespace(
            _settings={"audio_backend": "spotify_client"},
            _spotify_client_process=MagicMock(poll=MagicMock(return_value=0)),
        )
        self.assertFalse(cdp_bridge.is_spotify_client_running(stopped_plugin))

        none_proc_plugin = SimpleNamespace(
            _settings={"audio_backend": "spotify_client"},
            _spotify_client_process=None,
        )
        self.assertFalse(cdp_bridge.is_spotify_client_running(none_proc_plugin))

        running_plugin = SimpleNamespace(
            _settings={"audio_backend": "spotify_client"},
            _spotify_client_process=MagicMock(poll=MagicMock(return_value=None)),
        )
        self.assertTrue(cdp_bridge.is_spotify_client_running(running_plugin))

    def test_evaluate_with_registry_preamble_and_error_fallback(self):
        self.assertEqual(cdp_bridge.DEFAULT_CDP_TIMEOUT, 4.0)

        captured = {}

        def fake_eval(expr, port=9229, timeout=4.0):
            captured["expr"] = expr
            captured["port"] = port
            captured["timeout"] = timeout
            return {"ok": True, "value": 42}

        res = cdp_bridge.evaluate_with_registry("return { ok: true, value: 42 };", eval_fn=fake_eval)
        self.assertEqual(res, {"ok": True, "value": 42})
        self.assertEqual(captured["timeout"], 4.0)
        self.assertIn("window.__deckifyRegistry", captured["expr"])
        self.assertIn("window.__deckifyRegistryEl === el", captured["expr"])
        self.assertIn("getService", captured["expr"])
        self.assertIn("parseImg", captured["expr"])

        # None result fallback
        res_none = cdp_bridge.evaluate_with_registry("return { ok: true };", eval_fn=lambda *a, **kw: None)
        self.assertFalse(res_none["ok"])
        self.assertIn("error", res_none)

        # Exception fallback
        def raising_eval(*a, **kw):
            raise RuntimeError("socket timeout")

        res_err = cdp_bridge.evaluate_with_registry("return { ok: true };", eval_fn=raising_eval)
        self.assertFalse(res_err["ok"])
        self.assertIn("socket timeout", res_err["error"])

    def test_probes_and_json_dumps_escaping(self):
        # cdp_fetch_discovery_mixes
        mix_payload = {
            "ok": True,
            "items": [
                {
                    "id": "37i9dQZF1EP6YuccBxUyC1",
                    "name": "daylist",
                    "uri": "spotify:playlist:37i9dQZF1EP6YuccBxUyC1",
                    "image_url": "https://i.scdn.co/image/abc",
                    "subtitle": "Made for you",
                    "type": "playlist",
                    "owner": "Spotify",
                }
            ],
        }
        res_mixes = cdp_bridge.cdp_fetch_discovery_mixes(eval_fn=lambda *a, **kw: mix_payload)
        self.assertTrue(res_mixes["ok"])
        self.assertEqual(len(res_mixes["items"]), 1)
        self.assertEqual(res_mixes["items"][0]["name"], "daylist")

        # cdp_fetch_station_radio_uris caps at 30 unique spotify:track: URIs and escapes inputs
        raw_uris = [f"spotify:track:trk{i}" for i in range(40)]
        raw_uris.append("spotify:track:trk0")  # duplicate
        raw_uris.append("spotify:episode:ep1")  # non-track filtered out
        captured_radio = {}

        def fake_radio_eval(expr, port=9229, timeout=4.0):
            captured_radio["expr"] = expr
            return {"ok": True, "uris": raw_uris}

        injected_seed = 'id";alert(1);//'
        uris = cdp_bridge.cdp_fetch_station_radio_uris(
            "track", injected_seed, f"spotify:track:{injected_seed}", eval_fn=fake_radio_eval
        )
        self.assertEqual(len(uris), 30)
        self.assertTrue(all(u.startswith("spotify:track:") for u in uris))
        self.assertIn(json.dumps(injected_seed), captured_radio["expr"])

        # Error fallback returns []
        self.assertEqual(
            cdp_bridge.cdp_fetch_station_radio_uris("track", "t1", eval_fn=lambda *a, **kw: None),
            [],
        )

        # cdp_fetch_browse_categories
        cats_payload = {
            "ok": True,
            "categories": [
                {"id": "gaming", "name": "Gaming", "image_url": "https://i.scdn.co/image/g", "uri": "spotify:genre:gaming"}
            ],
        }
        cats = cdp_bridge.cdp_fetch_browse_categories(eval_fn=lambda *a, **kw: cats_payload)
        self.assertEqual(len(cats), 1)
        self.assertEqual(cats[0]["id"], "gaming")
        self.assertEqual(cdp_bridge.cdp_fetch_browse_categories(eval_fn=lambda *a, **kw: None), [])

        # cdp_set_playlist_mix
        captured_mix = {}

        def fake_mix_eval(expr, port=9229, timeout=6.0):
            captured_mix["expr"] = expr
            return {"ok": True, "playlist_id": "pl1", "uri": "spotify:playlist:pl1", "is_mixed": True}

        mix_res = cdp_bridge.cdp_set_playlist_mix("spotify:playlist:pl1", enabled=True, play_now=False, eval_fn=fake_mix_eval)
        self.assertTrue(mix_res["ok"])
        self.assertTrue(mix_res["is_mixed"])
        self.assertIn(json.dumps("spotify:playlist:pl1"), captured_mix["expr"])

    def test_discovery_mixes_cache_atomic_roundtrip_and_recovery(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            cache_path = os.path.join(tmpdir, "sub", "discovery_mixes.json")
            # Missing file -> {}
            self.assertEqual(cdp_bridge.load_discovery_mixes_cache(cache_path), {})

            # Save & load roundtrip
            sample = {"items": [{"id": "mix1", "name": "Daily Mix 1"}], "updated_at": 12345}
            cdp_bridge.save_discovery_mixes_cache(sample, cache_path)
            self.assertTrue(os.path.exists(cache_path))
            self.assertEqual(cdp_bridge.load_discovery_mixes_cache(cache_path), sample)
            # Ensure no leftover .tmp files
            leftover = [f for f in os.listdir(os.path.dirname(cache_path)) if f.endswith(".tmp")]
            self.assertEqual(leftover, [])

            # Corrupt JSON -> {}
            with open(cache_path, "w", encoding="utf-8") as f:
                f.write("{corrupt json")
            self.assertEqual(cdp_bridge.load_discovery_mixes_cache(cache_path), {})


if __name__ == "__main__":
    unittest.main()
