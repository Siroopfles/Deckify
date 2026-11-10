from collections import OrderedDict
import hashlib
import json
import os
import re
import threading
import urllib.error
import urllib.parse
import urllib.request

from py_modules.common import CACHE_DIR, SPOTIFY_API_BASE, SPOTIFY_CDP_PORT, _API_SSL_CTX

LYRICS_CACHE_DIR = os.path.join(CACHE_DIR, "lyrics")


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
    try:
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
    except urllib.error.HTTPError as e:
        if e.code == 429:
            retry_after = int(e.headers.get("Retry-After", 1))
            time.sleep(min(retry_after, 2))
        raise


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
_LRCLIB_USER_AGENT = "Deckify/0.3.0 (https://github.com/Siroopfles/Deckify)"


def _clear_lyrics_cache() -> None:
    """Clear in-memory and on-disk lyrics cache."""
    with _CACHE_LOCK:
        _LYRICS_CACHE.clear()
    if os.path.isdir(LYRICS_CACHE_DIR):
        try:
            for f in os.scandir(LYRICS_CACHE_DIR):
                if f.is_file() and f.name.endswith(".json"):
                    try:
                        os.remove(f.path)
                    except OSError:
                        pass
        except Exception:
            pass


def _get_cached_lyrics(key: str) -> dict | None:
    with _CACHE_LOCK:
        if key in _LYRICS_CACHE:
            _LYRICS_CACHE.move_to_end(key)
            return dict(_LYRICS_CACHE[key])

    # Check disk cache
    h = hashlib.sha256(key.encode("utf-8")).hexdigest()
    disk_file = os.path.join(LYRICS_CACHE_DIR, f"{h}.json")
    if os.path.isfile(disk_file):
        try:
            with open(disk_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            with _CACHE_LOCK:
                _LYRICS_CACHE[key] = dict(data)
                _LYRICS_CACHE.move_to_end(key)
            return data
        except Exception:
            pass
    return None


def _put_cached_lyrics(key: str, data: dict) -> None:
    with _CACHE_LOCK:
        _LYRICS_CACHE[key] = dict(data)
        _LYRICS_CACHE.move_to_end(key)
        while len(_LYRICS_CACHE) > _CACHE_MAX_ENTRIES:
            _LYRICS_CACHE.popitem(last=False)

    try:
        os.makedirs(LYRICS_CACHE_DIR, exist_ok=True)
        h = hashlib.sha256(key.encode("utf-8")).hexdigest()
        disk_file = os.path.join(LYRICS_CACHE_DIR, f"{h}.json")
        with open(disk_file, "w", encoding="utf-8") as f:
            json.dump(data, f)
    except Exception:
        pass


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


# 1. Spotify CDP Native Lyrics
def _fetch_spotify_cdp_lyrics() -> dict | None:
    try:
        from py_modules.engine import _cdp_evaluate
        expr = """
        (async () => {
          try {
            const lines = Array.from(document.querySelectorAll('[data-testid="lyrics-line"], .lyrics-lyricsContent-lyric'));
            if (!lines || lines.length === 0) return null;
            const text = lines.map(el => el.textContent.trim()).filter(Boolean).join('\\n');
            if (text) {
              return { plainLyrics: text, syncedLyrics: null };
            }
          } catch {}
          return null;
        })()
        """
        val = _cdp_evaluate(expr, port=SPOTIFY_CDP_PORT, timeout=2.5)
        if isinstance(val, dict) and (val.get("syncedLyrics") or val.get("plainLyrics")):
            return val
    except Exception:
        pass
    return None


# 3. NetEase Cloud Music API
def _fetch_netease_lyrics(clean_title: str, artist: str) -> dict | None:
    try:
        query = urllib.parse.quote(f"{clean_title} {artist}".strip())
        search_url = f"http://music.163.com/api/search/get/web?s={query}&type=1&offset=0&total=true&limit=5"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": "http://music.163.com",
        }
        req = urllib.request.Request(search_url, headers=headers)
        with urllib.request.urlopen(req, timeout=3.5) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="ignore"))

        songs = data.get("result", {}).get("songs", [])
        if not songs:
            return None
        song_id = songs[0].get("id")
        if not song_id:
            return None

        lyric_url = f"http://music.163.com/api/song/lyric?os=pc&id={song_id}&lv=-1&kv=-1&tv=-1"
        l_req = urllib.request.Request(lyric_url, headers=headers)
        with urllib.request.urlopen(l_req, timeout=3.5) as l_resp:
            l_data = json.loads(l_resp.read().decode("utf-8", errors="ignore"))

        lrc_text = l_data.get("lrc", {}).get("lyric", "")
        if not lrc_text:
            return None

        # Check if synced LRC format [mm:ss.xx]
        if re.search(r"\[\d{2}:\d{2}\.\d{2,3}\]", lrc_text):
            return {"syncedLyrics": lrc_text, "plainLyrics": None}
        return {"syncedLyrics": None, "plainLyrics": lrc_text}
    except Exception:
        return None


# 4. Musixmatch LRC fallback
def _fetch_musixmatch_lyrics(clean_title: str, artist: str) -> dict | None:
    try:
        # Query public lyrics proxy
        q = urllib.parse.urlencode({"track_name": clean_title, "artist_name": artist})
        url = f"https://api.textyl.co/api/lyrics?{q}"
        req = urllib.request.Request(url, headers={"User-Agent": _LRCLIB_USER_AGENT})
        with urllib.request.urlopen(req, timeout=3.5, context=_API_SSL_CTX) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="ignore"))
        if isinstance(data, list) and data:
            # Array of {time: seconds, text: string}
            lines = []
            for item in data:
                t = float(item.get("time", 0))
                m = int(t // 60)
                s = int(t % 60)
                ms = int((t - int(t)) * 100)
                lines.append(f"[{m:02d}:{s:02d}.{ms:02d}]{item.get('text', '')}")
            if lines:
                return {"syncedLyrics": "\n".join(lines), "plainLyrics": None}
    except Exception:
        pass
    return None


# 5. Plain-text fallback (lyrics.ovh)
def _fetch_plain_lyrics_fallback(clean_title: str, artist: str) -> dict | None:
    try:
        a_enc = urllib.parse.quote(artist)
        t_enc = urllib.parse.quote(clean_title)
        url = f"https://api.lyrics.ovh/v1/{a_enc}/{t_enc}"
        req = urllib.request.Request(url, headers={"User-Agent": _LRCLIB_USER_AGENT})
        with urllib.request.urlopen(req, timeout=3.5, context=_API_SSL_CTX) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="ignore"))
        lyrics = data.get("lyrics")
        if lyrics and lyrics.strip():
            return {"syncedLyrics": None, "plainLyrics": lyrics.strip()}
    except Exception:
        pass
    return None


def _fetch_lyrics_sync(
    track_name: str,
    artist_name: str,
    duration_sec: int = 0,
    provider_offset: int = 0,
    *args,
    **kwargs,
) -> dict:
    """Multi-source lyrics waterfall with 5 tiers, provider offset, and disk caching."""
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

    cache_key = f"{a_name.lower()}::{clean_title.lower()}::{provider_offset}"
    if provider_offset == 0:
        cached = _get_cached_lyrics(f"{a_name.lower()}::{clean_title.lower()}::0")
        if cached is not None:
            return cached

    # Waterfall Providers
    # 0: Spotify CDP
    # 1: LRCLIB
    # 2: NetEase
    # 3: Musixmatch
    # 4: Lyrics.ovh

    # Step 1: Spotify Native CDP
    if provider_offset <= 0:
        cdp_res = _fetch_spotify_cdp_lyrics()
        if cdp_res and (cdp_res.get("syncedLyrics") or cdp_res.get("plainLyrics")):
            out = {
                "ok": True,
                "synced_lyrics": cdp_res.get("syncedLyrics"),
                "plain_lyrics": cdp_res.get("plainLyrics"),
                "source": "Spotify",
            }
            _put_cached_lyrics(cache_key, out)
            return out

    # Step 2: LRCLIB
    if provider_offset <= 1:
        def _try_get_lrclib(title: str, artist: str, dur: int) -> dict | None:
            p = {"track_name": title, "artist_name": artist}
            if dur > 0:
                p["duration"] = dur
            data = _http_lrclib_request("/api/get", p)
            if isinstance(data, dict) and (data.get("syncedLyrics") or data.get("plainLyrics") or data.get("instrumental")):
                return data
            return None

        def _try_search_lrclib(query_params: dict) -> dict | None:
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
                    return best
            return None

        lrclib_item = None
        if dur_sec > 0:
            lrclib_item = _try_get_lrclib(clean_title, a_name, dur_sec)
            if not lrclib_item and primary_artist != a_name:
                lrclib_item = _try_get_lrclib(clean_title, primary_artist, dur_sec)

        if not lrclib_item:
            lrclib_item = _try_get_lrclib(clean_title, a_name, 0)
            if not lrclib_item and primary_artist != a_name:
                lrclib_item = _try_get_lrclib(clean_title, primary_artist, 0)

        if not lrclib_item:
            lrclib_item = _try_search_lrclib({"q": f"{clean_title} {a_name}".strip()})

        if not lrclib_item and clean_title != t_name:
            lrclib_item = _try_get_lrclib(t_name, a_name, 0) or _try_search_lrclib({"q": f"{t_name} {a_name}".strip()})

        if lrclib_item and (lrclib_item.get("syncedLyrics") or lrclib_item.get("plainLyrics") or lrclib_item.get("instrumental")):
            synced = lrclib_item.get("syncedLyrics")
            plain = lrclib_item.get("plainLyrics")
            if not synced and not plain and lrclib_item.get("instrumental"):
                plain = "♪ Instrumental ♪"
            out = {
                "ok": True,
                "synced_lyrics": synced,
                "plain_lyrics": plain,
                "source": "LRCLIB",
            }
            _put_cached_lyrics(cache_key, out)
            return out

    # Step 3: NetEase Cloud Music
    if provider_offset <= 2:
        ne_res = _fetch_netease_lyrics(clean_title, a_name)
        if not ne_res and primary_artist != a_name:
            ne_res = _fetch_netease_lyrics(clean_title, primary_artist)
        if ne_res and (ne_res.get("syncedLyrics") or ne_res.get("plainLyrics")):
            out = {
                "ok": True,
                "synced_lyrics": ne_res.get("syncedLyrics"),
                "plain_lyrics": ne_res.get("plainLyrics"),
                "source": "NetEase",
            }
            _put_cached_lyrics(cache_key, out)
            return out

    # Step 4: Musixmatch fallback
    if provider_offset <= 3:
        mm_res = _fetch_musixmatch_lyrics(clean_title, a_name)
        if not mm_res and primary_artist != a_name:
            mm_res = _fetch_musixmatch_lyrics(clean_title, primary_artist)
        if mm_res and (mm_res.get("syncedLyrics") or mm_res.get("plainLyrics")):
            out = {
                "ok": True,
                "synced_lyrics": mm_res.get("syncedLyrics"),
                "plain_lyrics": mm_res.get("plainLyrics"),
                "source": "Musixmatch",
            }
            _put_cached_lyrics(cache_key, out)
            return out

    # Step 5: Plain-text fallback (Lyrics.ovh)
    ovh_res = _fetch_plain_lyrics_fallback(clean_title, primary_artist)
    if ovh_res and ovh_res.get("plainLyrics"):
        out = {
            "ok": True,
            "synced_lyrics": None,
            "plain_lyrics": ovh_res.get("plainLyrics"),
            "source": "Lyrics.ovh",
        }
        _put_cached_lyrics(cache_key, out)
        return out

    return {"ok": False, "error": "Lyrics not found"}
