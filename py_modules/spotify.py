from collections import OrderedDict
import json
import re
import threading
import urllib.error
import urllib.parse
import urllib.request

from py_modules.common import SPOTIFY_API_BASE, _API_SSL_CTX


def _spotify_api_request(
    endpoint: str,
    token: str,
    method: str = "GET",
    params: dict | None = None,
    body: dict | None = None,
) -> dict | None:
    url = f"{SPOTIFY_API_BASE}/{endpoint}"
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"
    headers = {"Authorization": f"Bearer {token}"}
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=10, context=_API_SSL_CTX) as resp:
        if resp.status == 204:
            return None
        raw = resp.read()
        if not raw or not raw.strip():
            return None
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return None


def _parse_spotify_error(e: urllib.error.HTTPError) -> str:
    """Extract human-readable message from Spotify API error response."""
    try:
        body = json.loads(e.read())
        return body.get("error", {}).get("message", f"Spotify API error: {e.code}")
    except Exception:
        return f"Spotify API error: {e.code}"


def _parse_spotify_rootlist_folders(raw_bytes: bytes) -> list[dict]:
    """Extract Spotify playlist folder hierarchy (start-group / end-group) from binary/text rootlist cache."""
    if not raw_bytes:
        return []
    text = raw_bytes.decode("utf-8", errors="ignore")
    token_re = re.compile(
        r"spotify:(?:start-group:([A-Za-z0-9]+):([^\s\"'\\:\x00-\x1f]+)"
        r"|end-group:([A-Za-z0-9]+)"
        r"|playlist:([A-Za-z0-9]{22}))"
    )
    folders_by_id: dict[str, dict] = {}
    stack: list[dict] = []
    for m in token_re.finditer(text):
        start_id, encoded_name, end_id, playlist_id = m.groups()
        if start_id and encoded_name:
            name = urllib.parse.unquote_plus(encoded_name).strip() or "Folder"
            folder = folders_by_id.get(start_id)
            if not folder:
                folder = {"id": f"sp-{start_id}", "name": name, "playlist_ids": [], "source": "spotify"}
                folders_by_id[start_id] = folder
            stack.append(folder)
        elif end_id:
            if stack:
                stack.pop()
        elif playlist_id and stack:
            curr = stack[-1]
            if playlist_id not in curr["playlist_ids"]:
                curr["playlist_ids"].append(playlist_id)
    return [f for f in folders_by_id.values() if f["playlist_ids"]]


_LYRICS_CACHE: OrderedDict[str, dict] = OrderedDict()
_CACHE_LOCK = threading.Lock()
_CACHE_MAX_ENTRIES = 100
_LRCLIB_USER_AGENT = "Deckify/0.4.2 (https://github.com/Siroopfles/Deckify)"


def _clear_lyrics_cache() -> None:
    """Clear in-memory LRU lyrics cache (primarily used in test suites)."""
    with _CACHE_LOCK:
        _LYRICS_CACHE.clear()


def _get_cached_lyrics(key: str) -> dict | None:
    with _CACHE_LOCK:
        if key in _LYRICS_CACHE:
            _LYRICS_CACHE.move_to_end(key)
            return dict(_LYRICS_CACHE[key])
    return None


def _put_cached_lyrics(key: str, data: dict) -> None:
    with _CACHE_LOCK:
        _LYRICS_CACHE[key] = dict(data)
        _LYRICS_CACHE.move_to_end(key)
        while len(_LYRICS_CACHE) > _CACHE_MAX_ENTRIES:
            _LYRICS_CACHE.popitem(last=False)


def _sanitize_track_title(title: str) -> str:
    """Sanitize track title by stripping remaster, feat, edition, live, and version descriptors."""
    if not title:
        return ""
    cleaned = title
    # 1. Strip parenthesized or bracketed feat/ft/featuring/with
    cleaned = re.sub(
        r'\s*[\(\[](?:feat\.?|ft\.?|featuring|with)\b[^\)\]]*[\)\]]',
        '',
        cleaned,
        flags=re.IGNORECASE,
    )
    # 2. Strip parenthesized or bracketed descriptors
    cleaned = re.sub(
        r'\s*[\(\[](?:(?:(?:\d{4}(?:\s*-\s*\d{4})?\s+)?remaster(?:ed)?(?:\s+version)?|remastered(?:\s+\d{4})?)|deluxe(?: edition)?|anniversary(?: edition)?|\d+(?:th|st|nd|rd)\s+anniversary(?: edition)?|bonus(?: track)?|live\b[^\)\]]*|radio edit|edit|single|version|mix|original mix|mono|stereo|re-recorded|expanded|acoustic|instrumental|explicit|clean|\d{4}\s+mix)[^\)\]]*[\)\]]',
        '',
        cleaned,
        flags=re.IGNORECASE,
    )
    # 3. Strip trailing ' - feat / ft / featuring / with ...' or inline ' feat. / ft. ...'
    cleaned = re.sub(
        r'\s*-\s*(?:feat\.?|ft\.?|featuring|with)\b.*$',
        '',
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(
        r'\s+(?:feat\.?|ft\.?)\s+.+$',
        '',
        cleaned,
        flags=re.IGNORECASE,
    )
    # 4. Strip trailing hyphen descriptors
    cleaned = re.sub(
        r'\s*-\s*(?:(?:\d{4}(?:\s*-\s*\d{4})?\s+)?remaster(?:ed)?(?:\s+version)?|remastered(?:\s+\d{4})?|deluxe(?: edition)?|anniversary(?: edition)?|\d+(?:th|st|nd|rd)\s+anniversary(?: edition)?|bonus(?: track)?|live\b.*|radio edit|single(?: version)?|album version|original mix|\d{4}\s+mix|mono\b.*|stereo\b.*|re-recorded|acoustic|instrumental).*$',
        '',
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    return cleaned if cleaned else title


def _rank_candidate(item: dict, clean_title: str, artist: str, target_duration: int) -> int:
    """Score search candidate based on lyrics presence, title/artist match, and duration proximity."""
    synced = item.get("syncedLyrics")
    plain = item.get("plainLyrics")
    inst = item.get("instrumental", False)
    if not synced and not plain and not inst:
        return -1
    score = 0
    if synced:
        score += 1000
    elif plain:
        score += 500
    elif inst:
        score += 200

    c_title = (item.get("trackName") or item.get("name") or "").lower().strip()
    c_artist = (item.get("artistName") or "").lower().strip()
    t_clean = clean_title.lower().strip()
    a_clean = artist.lower().strip()

    if c_title == t_clean:
        score += 300
    elif t_clean in c_title or c_title in t_clean:
        score += 100

    if a_clean in c_artist or c_artist in a_clean:
        score += 200

    dur = item.get("duration") or 0
    if target_duration > 0 and dur > 0:
        diff = abs(dur - target_duration)
        score -= min(int(diff), 200)

    return score


def _http_lrclib_request(endpoint: str, params: dict, timeout: float = 3.5):
    """Execute HTTP GET to LRCLIB API with error handling."""
    qs = urllib.parse.urlencode(params)
    url = f"https://lrclib.net{endpoint}?{qs}"
    req = urllib.request.Request(url, headers={"User-Agent": _LRCLIB_USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=_API_SSL_CTX) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        if e.code == 429:
            raise RuntimeError("LRCLIB rate limit exceeded")
        return None
    except Exception:
        return None


def _fetch_lyrics_sync(track_name: str, artist_name: str, duration_sec: int = 0) -> dict:
    """Scrape synced or plain lyrics from LRCLIB with sanitization, search fallback, and caching."""
    t_name = (track_name or "").strip()
    a_name = (artist_name or "").strip()
    if not t_name or not a_name:
        return {"ok": False, "error": "Missing query"}

    try:
        dur_sec = int(float(duration_sec or 0))
    except (ValueError, TypeError):
        dur_sec = 0

    clean_title = _sanitize_track_title(t_name)
    primary_artist = a_name.split(",")[0].strip() if "," in a_name else a_name

    cache_key = f"{a_name.lower()}::{clean_title.lower()}"
    cached = _get_cached_lyrics(cache_key)
    if cached is not None:
        return cached

    def _extract_result(item: dict) -> dict:
        synced = item.get("syncedLyrics")
        plain = item.get("plainLyrics")
        if not synced and not plain and item.get("instrumental"):
            plain = "♪ Instrumental ♪"
        res = {
            "ok": True,
            "synced_lyrics": synced,
            "plain_lyrics": plain,
        }
        _put_cached_lyrics(cache_key, res)
        return res

    def _try_get(title: str, artist: str, dur: int) -> dict | None:
        p = {"track_name": title, "artist_name": artist}
        if dur > 0:
            p["duration"] = dur
        data = _http_lrclib_request("/api/get", p)
        if isinstance(data, dict) and (data.get("syncedLyrics") or data.get("plainLyrics") or data.get("instrumental")):
            return _extract_result(data)
        return None

    def _try_search(query_params: dict) -> dict | None:
        data = _http_lrclib_request("/api/search", query_params)
        if isinstance(data, list) and data:
            best = None
            best_score = -1
            for item in data:
                score = _rank_candidate(item, clean_title, a_name, dur_sec)
                if score > best_score:
                    best_score = score
                    best = item
            if best and best_score >= 0:
                return _extract_result(best)
        return None

    try:
        # Tier 1: exact lookup with sanitized title and artist and duration
        if dur_sec > 0:
            res = _try_get(clean_title, a_name, dur_sec)
            if res:
                return res
            if primary_artist != a_name:
                res = _try_get(clean_title, primary_artist, dur_sec)
                if res:
                    return res

        # Tier 2: lookup with sanitized title and artist (without strict duration constraint)
        res = _try_get(clean_title, a_name, 0)
        if res:
            return res
        if primary_artist != a_name:
            res = _try_get(clean_title, primary_artist, 0)
            if res:
                return res

        # Tier 3: LRCLIB /api/search?q={sanitized_title}+{artist}
        q_str = f"{clean_title} {a_name}".strip()
        res = _try_search({"q": q_str})
        if res:
            return res
        if primary_artist != a_name:
            res = _try_search({"q": f"{clean_title} {primary_artist}".strip()})
            if res:
                return res

        # Tier 4: /api/search?track_name={sanitized_title}&artist_name={artist}
        res = _try_search({"track_name": clean_title, "artist_name": a_name})
        if res:
            return res
        if primary_artist != a_name:
            res = _try_search({"track_name": clean_title, "artist_name": primary_artist})
            if res:
                return res

        # Tier 5: fallback with original unsanitized title if different
        if clean_title != t_name:
            res = _try_get(t_name, a_name, 0)
            if res:
                return res
            res = _try_search({"q": f"{t_name} {a_name}".strip()})
            if res:
                return res
    except RuntimeError as ex:
        return {"ok": False, "error": str(ex)}

    return {"ok": False, "error": "Lyrics not found"}
