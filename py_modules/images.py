import urllib.parse
import urllib.request
from py_modules.common import DASHBOARD_PORT, MAX_IMAGE_BYTES, _API_SSL_CTX


def _validate_image_url(url: str) -> None:
    parsed = urllib.parse.urlsplit(url)
    host = parsed.hostname or ""
    if (
        parsed.scheme != "https"
        or parsed.port not in (None, 443)
        or parsed.username is not None
        or parsed.password is not None
        or not host.endswith((".scdn.co", ".spotifycdn.com"))
    ):
        raise ValueError("Only Spotify HTTPS image URLs are supported")


class _ImageRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        _validate_image_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _get_max_image_bytes() -> int:
    import sys
    main_mod = sys.modules.get("main")
    if main_mod and hasattr(main_mod, "MAX_IMAGE_BYTES"):
        return main_mod.MAX_IMAGE_BYTES
    return MAX_IMAGE_BYTES


def _fetch_spotify_image(url: str) -> tuple[str, bytes]:
    _validate_image_url(url)
    opener = urllib.request.build_opener(
        _ImageRedirectHandler(), urllib.request.HTTPSHandler(context=_API_SSL_CTX),
    )
    with opener.open(url, timeout=10) as response:
        content_type = response.headers.get_content_type()
        if content_type not in ("image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"):
            raise RuntimeError("Spotify returned an unsupported image format")
        max_bytes = _get_max_image_bytes()
        body = response.read(max_bytes + 1)
        if len(body) > max_bytes:
            raise RuntimeError("Spotify image exceeds the size limit")
        return content_type, body


def _proxy_spotify_image_url(raw_url: str | None) -> str | None:
    if not raw_url or not isinstance(raw_url, str):
        return None
    raw = raw_url.strip()
    if not raw:
        return None
    if raw.startswith(f"http://127.0.0.1:{DASHBOARD_PORT}/api/image?"):
        return raw
    if raw.startswith("spotify:image:"):
        img_id = raw.split("spotify:image:", 1)[1].strip()
        if img_id:
            raw = f"https://i.scdn.co/image/{img_id}"
    elif raw.startswith("spotify:mosaic:"):
        parts = [p for p in raw.split(":")[2:] if p]
        if parts:
            raw = f"https://mosaic.scdn.co/300/{''.join(parts[:4])}"
    try:
        _validate_image_url(raw)
    except ValueError:
        return None
    query = urllib.parse.urlencode({"url": raw})
    return f"http://127.0.0.1:{DASHBOARD_PORT}/api/image?{query}"


def _image_url(images: list) -> str | None:
    if not images:
        return None
    return _proxy_spotify_image_url(images[0].get("url"))


def _proxy_folder_tree_images(folders: list[dict]) -> list[dict]:
    """Recursively ensure all playlist image_urls in a folder tree use Deckify's image proxy."""
    out: list[dict] = []
    for folder in folders or []:
        if not isinstance(folder, dict):
            continue
        f_copy = dict(folder)
        if isinstance(f_copy.get("playlists"), list):
            new_pls = []
            for pl in f_copy["playlists"]:
                if isinstance(pl, dict):
                    pl_copy = dict(pl)
                    pl_copy["image_url"] = _proxy_spotify_image_url(pl_copy.get("image_url"))
                    new_pls.append(pl_copy)
            f_copy["playlists"] = new_pls
        if isinstance(f_copy.get("subfolders"), list):
            f_copy["subfolders"] = _proxy_folder_tree_images(f_copy["subfolders"])
        out.append(f_copy)
    return out
