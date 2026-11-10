import hashlib
import os
import urllib.parse
import urllib.request
from py_modules.common import CACHE_DIR, MAX_IMAGE_BYTES, _API_SSL_CTX

IMAGE_CACHE_DIR = os.path.join(CACHE_DIR, "images")
MAX_IMAGE_CACHE_BYTES = 50 * 1024 * 1024


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
    return MAX_IMAGE_BYTES


def _clean_image_cache_lru() -> None:
    """Enforce 50 MB LRU limit on disk image cache."""
    if not os.path.isdir(IMAGE_CACHE_DIR):
        return
    try:
        entries = []
        total_size = 0
        for entry in os.scandir(IMAGE_CACHE_DIR):
            if entry.is_file():
                stat = entry.stat()
                total_size += stat.st_size
                entries.append((stat.st_atime, stat.st_size, entry.path))
        if total_size <= MAX_IMAGE_CACHE_BYTES:
            return
        # Sort oldest accessed first
        entries.sort(key=lambda x: x[0])
        for _, size, path in entries:
            try:
                os.remove(path)
                total_size -= size
                if total_size <= MAX_IMAGE_CACHE_BYTES * 0.8:
                    break
            except OSError:
                pass
    except Exception:
        pass


def _fetch_spotify_image(url: str) -> tuple[str, bytes]:
    _validate_image_url(url)
    # Check disk cache
    url_hash = hashlib.sha256(url.encode("utf-8")).hexdigest()
    cache_path = os.path.join(IMAGE_CACHE_DIR, f"{url_hash}.bin")
    meta_path = os.path.join(IMAGE_CACHE_DIR, f"{url_hash}.meta")
    if os.path.isfile(cache_path) and os.path.isfile(meta_path):
        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                content_type = f.read().strip()
            with open(cache_path, "rb") as f:
                body = f.read()
            # Update atime
            os.utime(cache_path, None)
            return content_type, body
        except Exception:
            pass

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

        try:
            os.makedirs(IMAGE_CACHE_DIR, exist_ok=True)
            with open(meta_path, "w", encoding="utf-8") as f:
                f.write(content_type)
            with open(cache_path, "wb") as f:
                f.write(body)
            _clean_image_cache_lru()
        except Exception:
            pass

        return content_type, body


def _proxy_spotify_image_url(raw_url: str | None) -> str | None:
    if not raw_url or not isinstance(raw_url, str):
        return None
    raw = raw_url.strip()
    if not raw:
        return None
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
        return raw
    except ValueError:
        return None


def _image_url(images: list) -> str | None:
    if not images:
        return None
    candidates = [img for img in images if isinstance(img, dict) and img.get("url")]
    if not candidates:
        return None
    medium = next((img for img in candidates if img.get("height") in (300, 240, 320)), None)
    selected = medium or candidates[0]
    raw = selected.get("url")
    return _proxy_spotify_image_url(raw) or raw


def _proxy_folder_tree_images(folders: list[dict]) -> list[dict]:
    """Recursively ensure all playlist image_urls in a folder tree use direct valid HTTPS image URLs."""
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
