import unittest
from email.message import Message
from unittest.mock import Mock, patch
from urllib.request import Request

from test_token_refresh import main
from py_modules.images import (
    _validate_image_url,
    _proxy_spotify_image_url,
    _fetch_spotify_image,
    _ImageRedirectHandler,
)

IMAGE = "https://i.scdn.co/image/album-cover"


class ImageTests(unittest.TestCase):
    def test_image_url_direct_https(self):
        source = IMAGE + "?size=300&format=jpeg"
        self.assertEqual(main._image_url([{"url": source}]), source)
        self.assertIsNone(main._image_url([]))

    def test_proxy_spotify_image_url_direct(self):
        uri = "spotify:image:ab67616d0000b273e970b8a4f15d9b626f6ebefc"
        direct = _proxy_spotify_image_url(uri)
        self.assertTrue(direct.startswith("https://i.scdn.co/image/"))
        self.assertNotIn("39282", direct)

        mosaic = "spotify:mosaic:ab67616d0000b273"
        direct_mosaic = _proxy_spotify_image_url(mosaic)
        self.assertTrue(direct_mosaic.startswith("https://mosaic.scdn.co/300/"))

    def test_spotify_cdn_domains(self):
        from py_modules import images
        if not hasattr(images, "ALLOWED_SPOTIFY_DOMAINS"):
            self.skipTest("Waiting for ALLOWED_SPOTIFY_DOMAINS in Task 2")
        valid_urls = [
            "https://i.scdn.co/image/abc",
            "https://mosaic.scdn.co/300/1234",
            "https://image-cdn-ak.spotifycdn.com/image/xyz",
            "https://image-cdn-fa.spotifycdn.com/image/xyz",
            "https://pickasso.spotifycdn.com/image/xyz",
            "https://seeded-session-images.scdn.co/v1/img/track/123",
            "https://image-cdn-ak.spotifycdn.net/image/xyz",
            "https://spotify.com/image/xyz",
            "https://scdn.co/image/xyz",
            "https://spotifycdn.com/image/xyz",
        ]
        for url in valid_urls:
            with self.subTest(url=url):
                _validate_image_url(url)

    def test_mosaic_and_spotify_uri_variations(self):
        from py_modules import images
        if not hasattr(images, "ALLOWED_SPOTIFY_DOMAINS"):
            self.skipTest("Waiting for mosaic normalization in Task 2")
        self.assertEqual(
            _proxy_spotify_image_url("spotify:image:mosaic:abc:def:ghi:jkl"),
            "https://mosaic.scdn.co/300/abcdefghijkl",
        )
        self.assertEqual(
            _proxy_spotify_image_url("spotify:mosaic:abc:def"),
            "https://mosaic.scdn.co/300/abcdef",
        )

    def test_non_spotify_urls_are_rejected_before_fetch(self):
        urls = [
            "http://i.scdn.co/image/a",
            "https://127.0.0.1/a",
            "https://i.scdn.co.example.com/a",
            "https://fake-scdn.co/a",
            "https://scdn.co.attacker.com/a",
            "https://spotifycdn.com.evil.org/a",
            "file:///etc/passwd",
            "https://user:password@i.scdn.co/a",
            "https://i.scdn.co:1337/a",
            "",
        ]
        with patch.object(main.urllib.request, "build_opener") as opener:
            for url in urls:
                with self.subTest(url=url), self.assertRaises(ValueError):
                    _fetch_spotify_image(url)
            opener.assert_not_called()

    def test_redirects_stay_on_spotify_image_hosts(self):
        handler = _ImageRedirectHandler()
        request = Request(IMAGE)
        redirected = handler.redirect_request(
            request, None, 302, "Found", {}, "https://image-cdn-ak.spotifycdn.com/image/a",
        )
        self.assertEqual(redirected.host, "image-cdn-ak.spotifycdn.com")
        with self.assertRaises(ValueError):
            handler.redirect_request(request, None, 302, "Found", {}, "https://localhost/a")

    def test_image_bytes_and_type_are_preserved(self):
        msg = Message()
        msg.set_type("image/jpeg")
        resp = Mock(headers=msg)
        resp.read.return_value = b"\xff\xd8cover\xff\xd9"
        resp.__enter__ = Mock(return_value=resp)
        resp.__exit__ = Mock(return_value=None)
        opener = Mock()
        opener.open.return_value = resp

        with patch("urllib.request.build_opener", return_value=opener):
            content_type, body = _fetch_spotify_image(IMAGE)
            self.assertEqual(content_type, "image/jpeg")
            self.assertEqual(body, b"\xff\xd8cover\xff\xd9")

    def test_html_is_not_forwarded_as_an_image(self):
        msg = Message()
        msg.set_type("text/html")
        resp = Mock(headers=msg)
        resp.read.return_value = b"<html>upstream error</html>"
        resp.__enter__ = Mock(return_value=resp)
        resp.__exit__ = Mock(return_value=None)
        opener = Mock()
        opener.open.return_value = resp

        with patch("urllib.request.build_opener", return_value=opener):
            with self.assertRaises(RuntimeError):
                _fetch_spotify_image(IMAGE + "/html")

    def test_oversized_images_are_rejected(self):
        msg = Message()
        msg.set_type("image/jpeg")
        resp = Mock(headers=msg)
        resp.read.return_value = b"12345"
        resp.__enter__ = Mock(return_value=resp)
        resp.__exit__ = Mock(return_value=None)
        opener = Mock()
        opener.open.return_value = resp

        with patch("urllib.request.build_opener", return_value=opener), \
             patch("py_modules.images._get_max_image_bytes", return_value=4):
            with self.assertRaises(RuntimeError):
                _fetch_spotify_image(IMAGE + "/oversized")

    def test_steam_cdn_domains_are_allowed(self):
        valid_steam_urls = [
            "https://cdn.cloudflare.steamstatic.com/steam/apps/440/library_600x900.jpg",
            "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1091500/library_600x900.jpg",
            "https://steamcdn-a.akamaihd.net/steam/apps/440/header.jpg",
            "https://store.steampowered.com/public/shared/images/header/logo_steam.png",
        ]
        for url in valid_steam_urls:
            with self.subTest(url=url):
                _validate_image_url(url)

    def test_fetch_spotify_image_sends_user_agent(self):
        msg = Message()
        msg.set_type("image/jpeg")
        resp = Mock(headers=msg)
        resp.read.return_value = b"\xff\xd8steam\xff\xd9"
        resp.__enter__ = Mock(return_value=resp)
        resp.__exit__ = Mock(return_value=None)
        opener = Mock()
        opener.open.return_value = resp

        steam_url = "https://cdn.cloudflare.steamstatic.com/steam/apps/440/library_600x900.jpg"
        with patch("urllib.request.build_opener", return_value=opener), \
             patch("os.path.isfile", return_value=False):
            content_type, body = _fetch_spotify_image(steam_url)
            self.assertEqual(content_type, "image/jpeg")
            self.assertEqual(body, b"\xff\xd8steam\xff\xd9")
            opener.open.assert_called_once()
            req_arg = opener.open.call_args[0][0]
            self.assertIsInstance(req_arg, Request)
            self.assertEqual(req_arg.get_header("User-agent"), "Deckify/1.0")


if __name__ == "__main__":
    unittest.main()
