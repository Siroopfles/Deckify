import json
import re
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


def _fetch_lyrics_sync(track_name: str, artist_name: str, duration_sec: int = 0) -> dict:
    """Scrape synced or plain lyrics from LRCLIB."""
    params = {"track_name": track_name, "artist_name": artist_name}
    if duration_sec > 0:
        params["duration"] = duration_sec
    qs = urllib.parse.urlencode(params)
    url = f"https://lrclib.net/api/get?{qs}"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Deckify/0.4.2 (SteamDeck; DeckyLoader)"},
    )
    with urllib.request.urlopen(req, timeout=5) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        return {
            "ok": True,
            "synced_lyrics": data.get("syncedLyrics"),
            "plain_lyrics": data.get("plainLyrics"),
        }
