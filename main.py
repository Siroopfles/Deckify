import asyncio
import base64
import errno
import glob
import hashlib
import json
import os
import re
import secrets
import socket
import ssl
import struct
import subprocess
import time
import urllib.parse
import urllib.request
from html import escape

import decky

# Decky Loader (PyInstaller) injects LD_LIBRARY_PATH pointing to its bundled
# libs which are older than the system's.  Subprocesses like openssl and
# librespot then load the wrong libssl/libcrypto and crash.  Strip it early.
os.environ.pop("LD_LIBRARY_PATH", None)

SETTINGS_FILE = os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, "settings.json")
LIBRESPOT_BIN = os.path.join(decky.DECKY_PLUGIN_DIR, "bin", "librespot")
CACHE_DIR = os.path.join(decky.DECKY_PLUGIN_RUNTIME_DIR, "cache")
LIBRESPOT_PID_FILE = os.path.join(decky.DECKY_PLUGIN_RUNTIME_DIR, "librespot.pid")
SPOTIFY_CLIENT_PID_FILE = os.path.join(decky.DECKY_PLUGIN_RUNTIME_DIR, "spotify_client.pid")
SSL_CERT = os.path.join(decky.DECKY_PLUGIN_RUNTIME_DIR, "cert.pem")
SSL_KEY = os.path.join(decky.DECKY_PLUGIN_RUNTIME_DIR, "key.pem")

VALID_AUDIO_BACKENDS = ("librespot", "spotify_client")
VALID_LIBRESPOT_QUALITIES = ("96", "160", "320")
VALID_SPOTIFY_CLIENT_QUALITIES = ("96", "160", "320", "lossless")

SPOTIFY_FLATPAK_ID = "com.spotify.Client"
SPOTIFY_CDP_PORT = 9229
DECK_USER = "deck"
DECK_UID = 1000
DECK_HOME = "/home/deck"
SPOTIFY_CLIENT_CONFIG_DIR = os.path.join(DECK_HOME, ".var", "app", SPOTIFY_FLATPAK_ID, "config", "spotify")
SPOTIFY_CLIENT_CACHE_DIR = os.path.join(DECK_HOME, ".var", "app", SPOTIFY_FLATPAK_ID, "cache", "spotify")

DEFAULT_SETTINGS = {
    "device_name": "",
    "audio_backend": "librespot",
    "audio_quality": "320",
    "bitrate": 320,
    "bit_perfect_clock": True,
    "spotify_client_id": "",
    "normalisation": True,
    "normalisation_pregain": 0.0,
    "gapless": True,
    "autoplay": True,
    "playlist_folders": [],
    "spotify_folder_tree": [],
}

# PulseAudio socket for root processes (deck user UID 1000)
PULSE_SERVER = "unix:/run/user/1000/pulse/native"
DBUS_SESSION_BUS_ADDRESS = "unix:path=/run/user/1000/bus"
XDG_RUNTIME_DIR = "/run/user/1000"

SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize"
SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token"
SPOTIFY_API_BASE = "https://api.spotify.com/v1"
SPOTIFY_SCOPES = (
    "user-read-currently-playing user-read-playback-state user-modify-playback-state "
    "playlist-read-private playlist-read-collaborative playlist-modify-public "
    "playlist-modify-private user-library-read user-library-modify "
    "user-follow-read user-read-recently-played"
)
CURRENT_SCOPES_VERSION = 6
OAUTH_SERVER_PORT = 39281
DASHBOARD_PORT = 39282
DASHBOARD_DIR = os.path.join(decky.DECKY_PLUGIN_DIR, "dashboard", "dist")
MAX_IMAGE_BYTES = 5 * 1024 * 1024

# SSL context for outgoing HTTPS requests (Spotify API).
# Root environments on SteamOS may not find system CA certs automatically.
_API_SSL_CTX: ssl.SSLContext | None = None
for _ca in ("/etc/ssl/certs/ca-certificates.crt", "/etc/ssl/cert.pem"):
    if os.path.isfile(_ca):
        _API_SSL_CTX = ssl.create_default_context(cafile=_ca)
        break
if _API_SSL_CTX is None:
    _API_SSL_CTX = ssl.create_default_context()


def _validate_image_url(url: str) -> None:
    parsed = urllib.parse.urlsplit(url)
    host = parsed.hostname or ""
    if (parsed.scheme != "https" or parsed.port not in (None, 443)
            or parsed.username is not None or parsed.password is not None
            or not host.endswith((".scdn.co", ".spotifycdn.com"))):
        raise ValueError("Only Spotify HTTPS image URLs are supported")


class _ImageRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        _validate_image_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _fetch_spotify_image(url: str) -> tuple[str, bytes]:
    _validate_image_url(url)
    opener = urllib.request.build_opener(
        _ImageRedirectHandler(), urllib.request.HTTPSHandler(context=_API_SSL_CTX),
    )
    with opener.open(url, timeout=10) as response:
        content_type = response.headers.get_content_type()
        if content_type not in ("image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"):
            raise RuntimeError("Spotify returned an unsupported image format")
        body = response.read(MAX_IMAGE_BYTES + 1)
        if len(body) > MAX_IMAGE_BYTES:
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


def _load_settings() -> dict:
    try:
        with open(SETTINGS_FILE, "r") as f:
            saved = json.load(f)
        for obsolete in ("mix_mode", "crossfade_seconds", "mixed_playlists"):
            saved.pop(obsolete, None)
        merged = {**DEFAULT_SETTINGS, **saved}
        # Older versions saved this fixed default without offering a name editor.
        if merged["device_name"] == "Steam Deck" and not saved.get("device_name_customized"):
            merged["device_name"] = ""
        if merged.get("audio_backend") not in VALID_AUDIO_BACKENDS:
            merged["audio_backend"] = "librespot"
        raw_q = str(merged.get("audio_quality") or merged.get("bitrate", 320)).lower()
        if merged["audio_backend"] == "librespot":
            if raw_q not in VALID_LIBRESPOT_QUALITIES:
                raw_q = "320"
            merged["audio_quality"] = raw_q
            merged["bitrate"] = int(raw_q)
        else:
            if raw_q not in VALID_SPOTIFY_CLIENT_QUALITIES:
                raw_q = "320"
            merged["audio_quality"] = raw_q
            merged["bitrate"] = 320 if raw_q == "lossless" else int(raw_q)
        if not isinstance(merged.get("playlist_folders"), list):
            merged["playlist_folders"] = []
        if not isinstance(merged.get("spotify_folder_tree"), list):
            merged["spotify_folder_tree"] = []
        return merged
    except Exception:
        return dict(DEFAULT_SETTINGS)


def _save_settings(settings: dict) -> None:
    os.makedirs(os.path.dirname(SETTINGS_FILE), exist_ok=True)
    with open(SETTINGS_FILE, "w") as f:
        json.dump(settings, f, indent=2)


def _update_spotify_prefs_content(
    existing_text: str,
    audio_quality: str,
    gapless: bool = True,
    normalisation: bool = True,
) -> str:
    """Update Spotify Desktop Client prefs text with quality, lossless, gapless, and normalization settings."""
    enum_map = {"96": 2, "160": 3, "320": 4, "lossless": 5}
    q_enum = enum_map.get(str(audio_quality).lower(), 4)
    desired = {
        "audio.play_bitrate_enumeration": str(q_enum),
        "audio.play_bitrate_non_metered_enumeration": str(q_enum),
        "audio.sync_bitrate_enumeration": str(q_enum),
        "audio.play_bitrate_non_metered_migrated": "true",
        "audio.hifi_upgraded": "true" if str(audio_quality).lower() == "lossless" else "false",
        "audio.gapless_v2": "true" if gapless else "false",
        "audio.normalize_v2": "true" if normalisation else "false",
    }
    lines = existing_text.splitlines() if existing_text else []
    seen: set[str] = set()
    out_lines: list[str] = []
    for line in lines:
        stripped = line.strip()
        if "=" in stripped and not stripped.startswith("#"):
            k = stripped.split("=", 1)[0].strip()
            if k in desired:
                out_lines.append(f"{k}={desired[k]}")
                seen.add(k)
                continue
        out_lines.append(line)
    for k, v in desired.items():
        if k not in seen:
            out_lines.append(f"{k}={v}")
    return "\n".join(out_lines) + "\n"


def _parse_pactl_sink_inputs(stdout: str) -> dict | None:
    """Parse `pactl list sink-inputs` output for active Spotify or librespot audio stream details."""
    if not stdout:
        return None
    blocks = re.split(r"(?=Sink Input #\d+)", stdout)
    best: dict | None = None
    for block in blocks:
        if not block.strip():
            continue
        low = block.lower()
        is_spotify = "com.spotify.client" in low or '"spotify"' in low
        is_librespot = "librespot" in low
        if not (is_spotify or is_librespot):
            continue
        spec_m = re.search(r"Sample Specification:\s*([^\r\n]+)", block)
        resample_m = re.search(r"Resample method:\s*([^\r\n]+)", block)
        corked_m = re.search(r"Corked:\s*([^\r\n]+)", block)
        sample_spec = spec_m.group(1).strip() if spec_m else ""
        resample_method = resample_m.group(1).strip() if resample_m else ""
        corked = (corked_m.group(1).strip().lower() == "yes") if corked_m else False

        # Format human-readable label e.g. "24-bit · 44.1 kHz" or "32-bit Float · 48.0 kHz"
        parts = sample_spec.split()
        fmt_raw = parts[0] if parts else ""
        rate_raw = parts[2] if len(parts) > 2 else ""
        fmt_map = {
            "s16le": "16-bit",
            "s24le": "24-bit",
            "s24-32le": "24-bit",
            "s32le": "32-bit",
            "float32le": "32-bit Float",
        }
        fmt_str = fmt_map.get(fmt_raw, fmt_raw)
        rate_str = rate_raw
        if rate_raw.endswith("Hz"):
            try:
                hz = int(rate_raw[:-2])
                rate_str = f"{hz / 1000:.1f} kHz"
            except ValueError:
                pass
        label = f"{fmt_str} · {rate_str}".strip(" ·")
        info = {
            "application": "Spotify Client" if is_spotify else "librespot",
            "sample_spec": sample_spec,
            "format_label": label or sample_spec,
            "resample_method": resample_method,
            "active": not corked,
        }
        if not corked:
            return info
        best = info
    return best


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


def _cdp_get_page_target(port: int = SPOTIFY_CDP_PORT) -> dict | None:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/json", timeout=2) as resp:
            targets = json.loads(resp.read())
        for t in targets:
            if t.get("type") == "page" and t.get("webSocketDebuggerUrl"):
                return t
        return targets[0] if targets else None
    except Exception:
        return None


def _cdp_call(method: str, params: dict | None = None, port: int = SPOTIFY_CDP_PORT, timeout: float = 4.0) -> dict | None:
    """Invoke a Chrome DevTools Protocol method on the headless Spotify Client over raw WebSocket."""
    target = _cdp_get_page_target(port)
    if not target or not target.get("webSocketDebuggerUrl"):
        return None
    ws_url = target["webSocketDebuggerUrl"]
    parsed = urllib.parse.urlparse(ws_url)
    host = parsed.hostname or "127.0.0.1"
    ws_port = parsed.port or port
    path = parsed.path or "/"
    sock = socket.create_connection((host, ws_port), timeout=timeout)
    try:
        key = base64.b64encode(os.urandom(16)).decode("ascii")
        handshake = (
            f"GET {path} HTTP/1.1\r\n"
            f"Host: {host}:{ws_port}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n"
        )
        sock.sendall(handshake.encode("ascii"))
        buf = b""
        while b"\r\n\r\n" not in buf:
            chunk = sock.recv(4096)
            if not chunk:
                return None
            buf += chunk
        leftover = buf.split(b"\r\n\r\n", 1)[1]

        payload = json.dumps({"id": 1, "method": method, "params": params or {}}).encode("utf-8")
        mask = os.urandom(4)
        header = bytearray([0x81])
        length = len(payload)
        if length < 126:
            header.append(0x80 | length)
        elif length < 65536:
            header.append(0x80 | 126)
            header.extend(length.to_bytes(2, "big"))
        else:
            header.append(0x80 | 127)
            header.extend(length.to_bytes(8, "big"))
        header.extend(mask)
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        sock.sendall(bytes(header) + masked)

        # Read WebSocket frames until we get JSON message with id=1 (handling multi-frame continuations)
        raw = bytearray(leftover)
        msg_chunks = bytearray()
        while True:
            while len(raw) >= 2:
                b0 = raw[0]
                b1 = raw[1]
                fin = (b0 & 0x80) != 0
                opcode = b0 & 0x0F
                is_masked = (b1 & 0x80) != 0
                plen = b1 & 0x7F
                idx = 2
                if plen == 126:
                    if len(raw) < 4:
                        break
                    plen = int.from_bytes(raw[2:4], "big")
                    idx = 4
                elif plen == 127:
                    if len(raw) < 10:
                        break
                    plen = int.from_bytes(raw[2:10], "big")
                    idx = 10
                if is_masked:
                    idx += 4
                if len(raw) < idx + plen:
                    break
                frame_data = bytes(raw[idx:idx + plen])
                del raw[:idx + plen]
                if opcode in (0, 1, 2):
                    msg_chunks.extend(frame_data)
                    if fin:
                        full_data = bytes(msg_chunks)
                        msg_chunks.clear()
                        try:
                            msg = json.loads(full_data.decode("utf-8", errors="replace"))
                            if msg.get("id") == 1:
                                return msg.get("result")
                        except Exception:
                            pass
            chunk = sock.recv(65536)
            if not chunk:
                break
            raw.extend(chunk)
    finally:
        try:
            sock.close()
        except Exception:
            pass
    return None


def _cdp_evaluate(expression: str, port: int = SPOTIFY_CDP_PORT, timeout: float = 5.0):
    """Evaluate a JavaScript expression inside the running Official Spotify Client via CDP."""
    res = _cdp_call(
        "Runtime.evaluate",
        {"expression": expression, "awaitPromise": True, "returnByValue": True},
        port=port,
        timeout=timeout,
    )
    if isinstance(res, dict):
        return res.get("result", {}).get("value")
    return None


def _fetch_spotify_cdp_folder_tree(port: int = SPOTIFY_CDP_PORT) -> list[dict] | None:
    """Extract the user's complete recursive folder & playlist tree from Spotify's internal RootlistAPI via CDP."""
    expr = """
    (async () => {
      const el = document.querySelector('#main');
      if (!el) return null;
      const fk = Object.keys(el).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactContainer$'));
      if (!fk) return null;
      const queue = [el[fk]];
      const visited = new Set();
      let registry = null;
      while (queue.length > 0 && !registry) {
        const n = queue.shift();
        if (!n || visited.has(n)) continue;
        visited.add(n);
        const val = n.memoizedProps?.value;
        if (val && val._map instanceof Map) { registry = val; break; }
        if (val && typeof val.getRegistry === 'function') { registry = val.getRegistry(); break; }
        if (n.child) queue.push(n.child);
        if (n.sibling) queue.push(n.sibling);
      }
      if (!registry) return null;
      let rootlistAPI = null;
      for (const [k, v] of registry._map.entries()) {
        if ((k?.description || String(k)) === 'RootlistAPI') {
          rootlistAPI = v?.instance || v;
          break;
        }
      }
      if (!rootlistAPI || typeof rootlistAPI.getContents !== 'function') return null;
      const root = await rootlistAPI.getContents({ limit: 5000, flatten: false });
      const parseImg = (images) => {
        const raw = images?.[0]?.url || '';
        if (!raw) return null;
        if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
        if (raw.startsWith('spotify:image:')) return 'https://i.scdn.co/image/' + raw.split(':')[2];
        if (raw.startsWith('spotify:mosaic:')) return 'https://i.scdn.co/image/' + raw.split(':')[2];
        return null;
      };
      const mapFolder = (node) => {
        const uri = node.uri || '';
        const fid = uri.includes(':folder:') ? ('sp-' + uri.split(':folder:')[1]) : ('sp-' + (node.name || 'folder'));
        const subfolders = [];
        const playlists = [];
        const playlist_ids = [];
        for (const child of (node.items || [])) {
          if (child.type === 'folder') {
            const sf = mapFolder(child);
            if (sf.playlists.length > 0 || sf.subfolders.length > 0) {
              subfolders.push(sf);
            }
          } else if (child.type === 'playlist' && child.uri && child.name && child.name.trim() !== '') {
            const pid = child.uri.split(':').pop();
            playlist_ids.push(pid);
            playlists.push({
              id: pid,
              name: child.name,
              uri: child.uri,
              image_url: parseImg(child.images),
              track_count: child.totalLength || 0,
              owner_id: child.owner?.username || child.owner?.id || '',
              can_mix: Boolean(child.canMixPlaylist),
              is_mixed: Array.isArray(child.appliedLenses) && child.appliedLenses.includes('mix')
            });
          }
        }
        return {
          id: fid,
          uri: uri,
          name: node.name || 'Folder',
          source: 'spotify_client',
          playlist_ids,
          playlists,
          subfolders
        };
      };
      return (root.items || []).filter(i => i.type === 'folder').map(mapFolder).filter(f => f.playlists.length > 0 || f.subfolders.length > 0);
    })()
    """
    try:
        res = _cdp_evaluate(expr, port=port, timeout=6.0)
        if isinstance(res, list):
            return res
    except Exception:
        pass
    return None


def _get_lan_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
        finally:
            s.close()
    except Exception:
        return "127.0.0.1"


def _get_mdns_host() -> str:
    try:
        return f"{socket.gethostname()}.local"
    except Exception:
        return _get_lan_ip()


def _ensure_ssl_cert() -> tuple[ssl.SSLContext, None] | tuple[None, str]:
    if not os.path.isfile(SSL_CERT) or not os.path.isfile(SSL_KEY):
        decky.logger.info("SSL cert not found at %s, generating...", SSL_CERT)
        mdns_host = _get_mdns_host()
        os.makedirs(os.path.dirname(SSL_CERT), exist_ok=True)
        try:
            result = subprocess.run([
                "openssl", "req", "-x509", "-newkey", "rsa:2048",
                "-keyout", SSL_KEY, "-out", SSL_CERT,
                "-days", "3650", "-nodes",
                "-subj", f"/CN={mdns_host}",
                "-config", "/dev/null",
            ], capture_output=True, text=True)
            if result.returncode != 0:
                msg = f"openssl failed (code {result.returncode}): {result.stderr.strip()}"
                decky.logger.error(msg)
                return None, msg
        except Exception as e:
            msg = f"Failed to run openssl: {e}"
            decky.logger.error(msg)
            return None, msg
    else:
        decky.logger.info("SSL cert found at %s", SSL_CERT)
    try:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(SSL_CERT, SSL_KEY)
        return ctx, None
    except Exception as e:
        msg = f"Failed to load SSL cert: {e}"
        decky.logger.error(msg)
        return None, msg


def _generate_pkce_pair() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return verifier, challenge


def _spotify_token_request(params: dict) -> dict:
    data = urllib.parse.urlencode(params).encode("utf-8")
    req = urllib.request.Request(
        SPOTIFY_TOKEN_URL, data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(req, timeout=10, context=_API_SSL_CTX) as resp:
        return json.loads(resp.read())


def _spotify_api_request(endpoint: str, token: str, method: str = "GET", params: dict | None = None, body: dict | None = None) -> dict | None:
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


async def _exec(fn, *args, timeout=10):
    """Run blocking I/O in executor with asyncio-level timeout (covers DNS)."""
    try:
        return await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(None, fn, *args),
            timeout=timeout,
        )
    except asyncio.TimeoutError:
        raise TimeoutError(f"Request timed out after {timeout}s")


def _build_deck_command(cmd: list[str], extra_env: dict | None = None) -> tuple[list[str], dict]:
    """Ensure user-level graphical/audio processes run as user `deck` (UID 1000) even when Decky runs as root."""
    env = os.environ.copy()
    env["XDG_RUNTIME_DIR"] = XDG_RUNTIME_DIR
    env["DBUS_SESSION_BUS_ADDRESS"] = DBUS_SESSION_BUS_ADDRESS
    env["PULSE_SERVER"] = PULSE_SERVER
    env["HOME"] = DECK_HOME
    if extra_env:
        env.update(extra_env)
    if hasattr(os, "geteuid") and os.geteuid() == 0:
        env_args = [
            f"XDG_RUNTIME_DIR={XDG_RUNTIME_DIR}",
            f"DBUS_SESSION_BUS_ADDRESS={DBUS_SESSION_BUS_ADDRESS}",
            f"PULSE_SERVER={PULSE_SERVER}",
            f"HOME={DECK_HOME}",
        ]
        if extra_env:
            for k, v in extra_env.items():
                env_args.append(f"{k}={v}")
        return ["runuser", "-u", DECK_USER, "--", "env", *env_args, *cmd], env
    return cmd, env


class Plugin:
    _process: subprocess.Popen | None = None
    _kwin_process: subprocess.Popen | None = None
    _spotify_client_process: subprocess.Popen | None = None
    _virtual_display: str | None = None
    _monitor_task: asyncio.Task | None = None
    _api_poll_task: asyncio.Task | None = None
    _settings: dict = {}
    _last_event: dict | None = None
    # Dashboard server
    _dashboard_server: asyncio.Server | None = None
    _track_meta: dict | None = None
    # OAuth / Spotify API state
    _oauth_server = None
    _pkce_verifier: str | None = None
    _oauth_redirect_uri: str | None = None
    _access_token: str | None = None
    _refresh_token: str | None = None
    _token_expires_at: float = 0
    _token_retry_at: float = 0
    # Playback poll state
    _poll_play_state: str | None = None   # "playing" | "paused" | None
    _poll_track_id: str | None = None
    _poll_volume: int | None = None
    _active_device: dict | None = None  # {id, name, type}
    _shuffle_state: bool = False
    _repeat_state: str = "off"
    _is_liked: bool = False
    _context_uri: str = ""
    _audio_stream_info: dict | None = None
    # Token refresh lock (initialized in _main)
    _token_refresh_lock: asyncio.Lock | None = None
    # Crash auto-restart state
    _crash_timestamps: list = []
    _pa_volume_boosted: bool = False
    _stable_start: float = 0
    # Linux joystick reader state (/dev/input/js*)
    _js_fds: dict[str, int] = {}
    _js_axis_state: dict[tuple[str, int], int] = {}

    # ── Lifecycle ──────────────────────────────────────────────

    async def _main(self):
        self._token_refresh_lock = asyncio.Lock()
        self._crash_timestamps = []
        self._js_fds = {}
        self._js_axis_state = {}
        self._settings = _load_settings()
        # Restore persisted tokens
        self._access_token = self._settings.get("access_token")
        self._refresh_token = self._settings.get("refresh_token")
        self._token_expires_at = self._settings.get("token_expires_at", 0)
        safe_keys = {k: v for k, v in self._settings.items()
                     if k not in ("access_token", "refresh_token", "token_expires_at", "spotify_client_id", "spotify_folder_tree")}
        decky.logger.info("Deckify loaded, settings: %s", safe_keys)
        await self._start_dashboard()
        if self._access_token:
            self._start_api_poll()
        await self._sync_native_spotify_folders()
        await self.start_librespot()

    async def _unload(self):
        decky.logger.info("Deckify unloading")
        self._close_gamepad_fds()
        await self._stop_monitor()
        await self._kill_librespot()
        await self._kill_spotify_client()
        await self._stop_dashboard()
        await self._stop_oauth_server()
        await self._stop_api_poll()

    async def _uninstall(self):
        decky.logger.info("Deckify uninstalling")
        self._close_gamepad_fds()
        await self._stop_monitor()
        await self._kill_librespot()
        await self._kill_spotify_client()
        await self._stop_dashboard()
        await self._stop_oauth_server()
        await self._stop_api_poll()

    async def _migration(self):
        decky.logger.info("Deckify migrating")
        decky.migrate_logs(
            os.path.join(decky.DECKY_USER_HOME, ".config", "deckify", "deckify.log")
        )
        decky.migrate_settings(
            os.path.join(decky.DECKY_HOME, "settings", "deckify.json"),
            os.path.join(decky.DECKY_USER_HOME, ".config", "deckify"),
        )
        decky.migrate_runtime(
            os.path.join(decky.DECKY_HOME, "deckify"),
            os.path.join(decky.DECKY_USER_HOME, ".local", "share", "deckify"),
        )

    # ── Audio Engine management (librespot vs Official Spotify Client) ──

    def _is_engine_running(self) -> bool:
        backend = self._settings.get("audio_backend", "librespot")
        if backend == "spotify_client":
            return (
                self._spotify_client_process is not None
                and self._spotify_client_process.poll() is None
            )
        return self._process is not None and self._process.poll() is None

    async def _configure_pipewire_clock(self, unlock_lossless: bool) -> None:
        """Unlock 44.1kHz/88.2kHz/96kHz in PipeWire when Lossless is active, or restore default 48kHz."""
        rates = "[ 44100 48000 88200 96000 ]" if unlock_lossless else "[ 48000 ]"
        try:
            cmd, env = _build_deck_command(["pw-metadata", "-n", "settings", "0", "clock.allowed-rates", rates])
            await _exec(lambda: subprocess.run(cmd, env=env, capture_output=True, text=True), timeout=5)
            decky.logger.info("PipeWire clock.allowed-rates set to %s", rates)
        except Exception as e:
            decky.logger.warning("Failed to configure PipeWire clock rates: %s", e)

    def _write_spotify_client_prefs(self) -> None:
        """Write audio quality and playback settings to the Official Spotify Client prefs files."""
        try:
            os.makedirs(SPOTIFY_CLIENT_CONFIG_DIR, exist_ok=True)
            quality = str(self._settings.get("audio_quality", "320")).lower()
            gapless = bool(self._settings.get("gapless", True))
            normalisation = bool(self._settings.get("normalisation", True))

            target_files = [os.path.join(SPOTIFY_CLIENT_CONFIG_DIR, "prefs")]
            users_dir = os.path.join(SPOTIFY_CLIENT_CONFIG_DIR, "Users")
            if os.path.isdir(users_dir):
                for user_sub in os.listdir(users_dir):
                    sub_path = os.path.join(users_dir, user_sub)
                    if os.path.isdir(sub_path):
                        target_files.append(os.path.join(sub_path, "prefs"))

            for pfile in target_files:
                existing = ""
                if os.path.isfile(pfile):
                    try:
                        with open(pfile, "r", encoding="utf-8", errors="ignore") as f:
                            existing = f.read()
                    except Exception:
                        pass
                updated = _update_spotify_prefs_content(existing, quality, gapless, normalisation)
                with open(pfile, "w", encoding="utf-8") as f:
                    f.write(updated)
                if hasattr(os, "chown") and hasattr(os, "geteuid") and os.geteuid() == 0:
                    try:
                        os.chown(pfile, DECK_UID, DECK_UID)
                    except Exception:
                        pass
        except Exception as e:
            decky.logger.warning("Failed to write Spotify client prefs: %s", e)

    async def _sync_spotify_client_quality_cdp(self, quality: str) -> None:
        """Apply streaming quality live inside the running Official Spotify Client via SettingsAPI."""
        if not self._spotify_client_process or self._spotify_client_process.poll() is not None:
            return
        enum_map = {"96": 2, "160": 3, "320": 4, "lossless": 5}
        q_enum = enum_map.get(str(quality).lower(), 4)
        expr = f"""
        (async () => {{
          const mainEl = document.getElementById('main');
          if (!mainEl) return false;
          const rk = Object.keys(mainEl).find(k => k.startsWith('__reactContainer'));
          const q = [mainEl[rk]];
          const visited = new Set();
          let reg = null;
          while (q.length > 0 && visited.size < 1000) {{
            const curr = q.shift();
            if (!curr || visited.has(curr)) continue;
            visited.add(curr);
            let m = curr.memoizedState;
            while (m) {{
              if (m.memoizedState && typeof m.memoizedState === 'object') {{
                const val = m.memoizedState;
                if (val._map && val._map instanceof Map) {{ reg = val._map; break; }}
                if (val.value && typeof val.value.getRegistry === 'function') {{ reg = val.value.getRegistry()._map; break; }}
              }}
              m = m.next;
            }}
            if (reg) break;
            if (curr.child) q.push(curr.child);
            if (curr.sibling) q.push(curr.sibling);
          }}
          if (!reg) return false;
          for (const [k, v] of reg.entries()) {{
            if (String(k.description) === 'SettingsAPI') {{
              const s = v.instance;
              if (s.quality && s.quality.streamingQuality && typeof s.quality.streamingQuality.setValue === 'function') {{
                await s.quality.streamingQuality.setValue({q_enum});
                return true;
              }}
            }}
          }}
          return false;
        }})()
        """
        try:
            await _exec(_cdp_evaluate, expr, SPOTIFY_CDP_PORT, 4.0, timeout=5)
        except Exception as e:
            decky.logger.debug("CDP quality sync failed: %s", e)

    async def start_spotify_client(self) -> dict:
        """Start the Official Spotify Linux Client headless in the background (stopping librespot first)."""
        # Cleanly stop librespot so both engines never run simultaneously
        await self._stop_monitor()
        await self._kill_librespot()

        if self._spotify_client_process and self._spotify_client_process.poll() is None:
            return {"ok": True, "message": "already running", "audio_backend": "spotify_client"}

        await self._kill_spotify_client()
        self._write_spotify_client_prefs()

        is_lossless = (
            self._settings.get("audio_quality") == "lossless"
            and bool(self._settings.get("bit_perfect_clock", True))
        )
        await self._configure_pipewire_clock(is_lossless)

        try:
            before_x = set(glob.glob("/tmp/.X11-unix/X*"))
            kwin_cmd, kwin_env = _build_deck_command([
                "kwin_wayland", "--virtual", "--xwayland",
                "--socket", "wayland-spotify",
                "--width", "1280", "--height", "800",
            ])
            self._kwin_process = subprocess.Popen(
                kwin_cmd,
                env=kwin_env,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            # Wait up to 3s for virtual Xwayland socket
            disp = ":2"
            for _ in range(15):
                await asyncio.sleep(0.2)
                after_x = set(glob.glob("/tmp/.X11-unix/X*"))
                new_x = sorted(after_x - before_x)
                if new_x:
                    disp = ":" + new_x[0].split("X")[-1]
                    break
            self._virtual_display = disp

            sp_cmd, sp_env = _build_deck_command(
                [
                    "flatpak", "run",
                    "--nosocket=wayland",
                    f"--env=DISPLAY={disp}",
                    "--command=/app/extra/bin/spotify",
                    SPOTIFY_FLATPAK_ID,
                    f"--remote-debugging-port={SPOTIFY_CDP_PORT}",
                ],
                extra_env={"DISPLAY": disp},
            )
            sp_env.pop("WAYLAND_DISPLAY", None)
            decky.logger.info("Starting Official Spotify Client on virtual display %s", disp)
            self._spotify_client_process = subprocess.Popen(
                sp_cmd,
                env=sp_env,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        except Exception as e:
            msg = f"Failed to start Official Spotify Client: {e}"
            decky.logger.error(msg)
            await self._kill_spotify_client()
            await decky.emit("librespot_status", {"running": False, "error": msg, "audio_backend": "spotify_client"})
            return {"ok": False, "error": msg}

        self._last_event = None
        self._pa_volume_boosted = False
        self._start_monitor()
        await decky.emit("librespot_status", {"running": True, "error": None, "audio_backend": "spotify_client"})
        decky.logger.info("Official Spotify Client started, pid=%d display=%s", self._spotify_client_process.pid, self._virtual_display)
        return {"ok": True, "pid": self._spotify_client_process.pid, "audio_backend": "spotify_client"}

    async def stop_spotify_client(self) -> dict:
        await self._stop_monitor()
        await self._kill_spotify_client()
        self._last_event = None
        await decky.emit("librespot_status", {"running": False, "error": None, "audio_backend": "spotify_client"})
        return {"ok": True}

    async def start_librespot(self) -> dict:
        if self._settings.get("audio_backend") == "spotify_client":
            return await self.start_spotify_client()

        # Ensure Official Spotify Client is cleanly stopped before starting librespot
        await self._kill_spotify_client()
        await self._configure_pipewire_clock(False)

        if self._process and self._process.poll() is None:
            return {"ok": True, "message": "already running", "audio_backend": "librespot"}

        self._kill_stale_librespot()

        if not os.path.isfile(LIBRESPOT_BIN):
            msg = f"librespot binary not found at {LIBRESPOT_BIN}"
            decky.logger.error(msg)
            await decky.emit("librespot_status", {"running": False, "error": msg})
            return {"ok": False, "error": msg}

        os.makedirs(CACHE_DIR, exist_ok=True)

        settings = self._settings
        bitrate_str = str(settings.get("audio_quality", settings.get("bitrate", 320)))
        if bitrate_str not in VALID_LIBRESPOT_QUALITIES:
            bitrate_str = "320"
        cmd = [
            LIBRESPOT_BIN,
            "--name", settings.get("device_name") or socket.gethostname(),
            "--device-type", "computer",
            "--bitrate", bitrate_str,
            "--backend", "pulseaudio",
            "--system-cache", CACHE_DIR,
        ]
        if settings.get("normalisation", True):
            cmd.extend([
                "--enable-volume-normalisation",
                "--normalisation-method", "dynamic",
                "--normalisation-gain-type", "auto",
                "--normalisation-pregain", str(float(settings.get("normalisation_pregain", 0.0))),
            ])
        if not settings.get("gapless", True):
            cmd.append("--disable-gapless")
        if "autoplay" in settings:
            cmd.extend(["--autoplay", "on" if settings.get("autoplay") else "off"])

        env = os.environ.copy()
        env["PULSE_SERVER"] = PULSE_SERVER

        decky.logger.info("Starting librespot: %s", " ".join(cmd))
        try:
            self._process = subprocess.Popen(
                cmd,
                env=env,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        except Exception as e:
            msg = f"Failed to start librespot: {e}"
            decky.logger.error(msg)
            await decky.emit("librespot_status", {"running": False, "error": msg})
            return {"ok": False, "error": msg}

        self._last_event = None
        self._pa_volume_boosted = False
        self._write_pid(self._process.pid)
        self._start_monitor()
        await decky.emit("librespot_status", {"running": True, "error": None, "audio_backend": "librespot"})
        decky.logger.info("librespot started, pid=%d", self._process.pid)
        return {"ok": True, "pid": self._process.pid, "audio_backend": "librespot"}

    async def stop_librespot(self) -> dict:
        await self._stop_monitor()
        await self._kill_librespot()
        await self._kill_spotify_client()
        self._last_event = None
        await decky.emit("librespot_status", {"running": False, "error": None})
        return {"ok": True}

    async def switch_audio_backend(self, backend: str) -> dict:
        """Cleanly shut down the previous backend and start the newly selected backend."""
        return await self.set_setting("audio_backend", backend)

    async def get_status(self) -> dict:
        running = self._is_engine_running()
        is_playing = self._poll_play_state == "playing"
        position_ms = self._last_event.get("position_ms", 0) if self._last_event else 0
        duration_ms = self._last_event.get("duration_ms", 0) if self._last_event else 0
        public_keys = (
            "device_name", "audio_backend", "audio_quality", "bitrate",
            "bit_perfect_clock", "spotify_client_id", "normalisation",
            "normalisation_pregain", "gapless", "autoplay", "playlist_folders",
        )
        return {
            "running": running,
            "binary_found": os.path.isfile(LIBRESPOT_BIN),
            "settings": {k: v for k, v in self._settings.items() if k in public_keys},
            "last_event": self._last_event,
            "track_meta": self._track_meta,
            "volume": self._poll_volume,
            "active_device": self._active_device,
            "is_playing": is_playing,
            "position_ms": position_ms,
            "duration_ms": duration_ms,
            "shuffle_state": self._shuffle_state,
            "repeat_state": self._repeat_state,
            "is_liked": self._is_liked,
            "context_uri": self._context_uri,
            "audio_stream_info": self._audio_stream_info,
        }

    async def get_settings(self) -> dict:
        return dict(self._settings)

    async def set_setting(self, key: str, value) -> dict:
        if key not in DEFAULT_SETTINGS:
            return {"ok": False, "error": f"unknown setting: {key}"}
        backend_changed = False
        quality_changed = False
        if key == "device_name":
            if not isinstance(value, str) or any(ord(char) < 32 or ord(char) == 127 for char in value):
                return {"ok": False, "error": "Device name must be text without control characters"}
            value = value.strip()
            self._settings["device_name_customized"] = True
        elif key == "audio_backend":
            value = str(value).strip().lower()
            if value not in VALID_AUDIO_BACKENDS:
                return {"ok": False, "error": f"Invalid audio_backend: {value}"}
            prev_backend = self._settings.get("audio_backend", "librespot")
            backend_changed = value != prev_backend
            if value == "librespot" and self._settings.get("audio_quality") == "lossless":
                self._settings["audio_quality"] = "320"
                self._settings["bitrate"] = 320
        elif key == "audio_quality":
            value = str(value).strip().lower()
            current_backend = self._settings.get("audio_backend", "librespot")
            if current_backend == "librespot":
                if value == "lossless":
                    return {"ok": False, "error": "Lossless audio requires the Official Spotify Client backend"}
                if value not in VALID_LIBRESPOT_QUALITIES:
                    return {"ok": False, "error": f"Invalid audio_quality for librespot: {value}"}
                self._settings["bitrate"] = int(value)
            else:
                if value not in VALID_SPOTIFY_CLIENT_QUALITIES:
                    return {"ok": False, "error": f"Invalid audio_quality: {value}"}
                self._settings["bitrate"] = 320 if value == "lossless" else int(value)
            quality_changed = True
        elif key == "bitrate":
            try:
                bval = int(value)
            except (TypeError, ValueError):
                return {"ok": False, "error": "bitrate must be 96, 160, or 320"}
            if bval not in (96, 160, 320):
                return {"ok": False, "error": "bitrate must be 96, 160, or 320"}
            value = bval
            self._settings["audio_quality"] = str(bval)
            quality_changed = True
        elif key in ("normalisation", "gapless", "autoplay", "bit_perfect_clock"):
            value = bool(value)
        elif key == "normalisation_pregain":
            try:
                value = max(-10.0, min(10.0, float(value)))
            except (TypeError, ValueError):
                return {"ok": False, "error": "normalisation_pregain must be a number"}
        elif key == "playlist_folders":
            if not isinstance(value, list):
                return {"ok": False, "error": "playlist_folders must be a list"}
        self._settings[key] = value
        _save_settings(self._settings)
        decky.logger.info("Setting updated: %s = %s", key, value)

        if backend_changed:
            # Cleanly stop the old backend and start the new one
            if value == "spotify_client":
                await self.start_spotify_client()
            else:
                await self.start_librespot()
        elif quality_changed and self._settings.get("audio_backend") == "spotify_client":
            self._write_spotify_client_prefs()
            await self._sync_spotify_client_quality_cdp(str(self._settings.get("audio_quality", "320")))
            await self._configure_pipewire_clock(
                self._settings.get("audio_quality") == "lossless"
                and bool(self._settings.get("bit_perfect_clock", True))
            )

        return {"ok": True, "settings": dict(self._settings)}

    # ── Playback control callable methods ────────────────────────

    async def control_playback(self, action: str, device_id: str = "") -> dict:
        decky.logger.info("control_playback: action=%s device_id=%s", action, device_id)
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}

        action_map = {
            "play": ("PUT", "me/player/play"),
            "pause": ("PUT", "me/player/pause"),
            "next": ("POST", "me/player/next"),
            "previous": ("POST", "me/player/previous"),
        }
        if action not in action_map:
            return {"ok": False, "error": f"Unknown action: {action}"}

        method, endpoint = action_map[action]
        params = {"device_id": device_id} if device_id else None
        try:
            await _exec(_spotify_api_request, endpoint, token, method, params)
            return {"ok": True}
        except urllib.error.HTTPError as e:
            if e.code == 404 and action == "play":
                return await self._auto_transfer_and_play(token, device_id)
            if e.code == 404:
                return {"ok": False, "error": "No active device — connect via Spotify app first"}
            return {"ok": False, "error": _parse_spotify_error(e)}
        except Exception as e:
            decky.logger.error("control_playback(%s) failed: %s", action, e)
            return {"ok": False, "error": str(e)}

    async def _auto_transfer_and_play(self, token: str, device_id: str = "") -> dict:
        if not device_id:
            try:
                data = await _exec(_spotify_api_request, "me/player/devices", token)
                devices = data.get("devices", []) if data else []
                if devices:
                    device_id = devices[0]["id"]
                    decky.logger.info("No device_id provided, picked %s (%s)", devices[0].get("name"), device_id)
            except Exception as e:
                decky.logger.error("Failed to fetch devices for auto-transfer: %s", e)
        if not device_id:
            return {"ok": False, "error": "No active device — connect via Spotify app first"}
        try:
            decky.logger.info("Auto-transferring playback to %s", device_id)
            await _exec(
                _spotify_api_request, "me/player", token, "PUT", None,
                {"device_ids": [device_id], "play": True},
            )
            return {"ok": True}
        except Exception as e:
            decky.logger.error("Auto-transfer failed: %s", e)
            return {"ok": False, "error": "No active device — connect via Spotify app first"}

    async def set_volume(self, volume_percent: int) -> dict:
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}

        volume_percent = max(0, min(100, int(volume_percent)))
        try:
            await _exec(
                _spotify_api_request, "me/player/volume", token, "PUT",
                {"volume_percent": volume_percent},
            )
            return {"ok": True}
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return {"ok": False, "error": "No active device found"}
            return {"ok": False, "error": _parse_spotify_error(e)}
        except Exception as e:
            decky.logger.error("set_volume(%d) failed: %s", volume_percent, e)
            return {"ok": False, "error": str(e)}

    async def seek_playback(self, position_ms: int, device_id: str = "") -> dict:
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        position_ms = max(0, int(position_ms))
        params: dict = {"position_ms": position_ms}
        if device_id:
            params["device_id"] = device_id
        try:
            await _exec(_spotify_api_request, "me/player/seek", token, "PUT", params)
            if self._last_event:
                self._last_event["position_ms"] = position_ms
            return {"ok": True, "position_ms": position_ms}
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return {"ok": False, "error": "No active device found"}
            return {"ok": False, "error": _parse_spotify_error(e)}
        except Exception as e:
            decky.logger.error("seek_playback(%d) failed: %s", position_ms, e)
            return {"ok": False, "error": str(e)}

    async def set_shuffle(self, state: bool, device_id: str = "") -> dict:
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        state_bool = bool(state)
        params: dict = {"state": "true" if state_bool else "false"}
        if device_id:
            params["device_id"] = device_id
        try:
            await _exec(_spotify_api_request, "me/player/shuffle", token, "PUT", params)
            self._shuffle_state = state_bool
            await decky.emit("playback_modes", {
                "shuffle_state": self._shuffle_state,
                "repeat_state": self._repeat_state,
            })
            return {"ok": True, "shuffle_state": self._shuffle_state}
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return {"ok": False, "error": "No active device found"}
            return {"ok": False, "error": _parse_spotify_error(e)}
        except Exception as e:
            decky.logger.error("set_shuffle(%s) failed: %s", state, e)
            return {"ok": False, "error": str(e)}

    async def set_repeat(self, state: str, device_id: str = "") -> dict:
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        if state not in ("off", "context", "track"):
            return {"ok": False, "error": f"Invalid repeat state: {state}"}
        params: dict = {"state": state}
        if device_id:
            params["device_id"] = device_id
        try:
            await _exec(_spotify_api_request, "me/player/repeat", token, "PUT", params)
            self._repeat_state = state
            await decky.emit("playback_modes", {
                "shuffle_state": self._shuffle_state,
                "repeat_state": self._repeat_state,
            })
            return {"ok": True, "repeat_state": self._repeat_state}
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return {"ok": False, "error": "No active device found"}
            return {"ok": False, "error": _parse_spotify_error(e)}
        except Exception as e:
            decky.logger.error("set_repeat(%s) failed: %s", state, e)
            return {"ok": False, "error": str(e)}

    async def _check_tracks_liked(self, token: str, track_ids: list[str]) -> dict[str, bool]:
        """Batch-check saved status via Spotify's /me/library/contains endpoint."""
        clean_ids = [tid for tid in dict.fromkeys(track_ids) if tid]
        if not clean_ids:
            return {}
        result: dict[str, bool] = {}
        for i in range(0, len(clean_ids), 40):
            chunk = clean_ids[i:i + 40]
            uris = ",".join(f"spotify:track:{tid}" for tid in chunk)
            try:
                res = await _exec(
                    _spotify_api_request, "me/library/contains", token, "GET",
                    {"uris": uris},
                )
                if isinstance(res, list):
                    for tid, flag in zip(chunk, res):
                        result[tid] = bool(flag)
            except Exception as e:
                decky.logger.warning("me/library/contains check failed: %s", e)
        return result

    async def _annotate_tracks_liked(self, token: str, tracks: list[dict]) -> None:
        ids = [t.get("id") for t in tracks if t.get("id")]
        liked_map = await self._check_tracks_liked(token, ids)
        for t in tracks:
            tid = t.get("id")
            t["is_liked"] = bool(liked_map.get(tid, False)) if tid else False

    async def toggle_like_track(self, track_id: str = "", liked: bool | None = None) -> dict:
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        target_id = (track_id or self._poll_track_id or "").strip()
        if target_id.startswith("spotify:track:"):
            target_id = target_id.split(":")[-1]
        if not target_id:
            return {"ok": False, "error": "No active track"}
        if liked is None:
            if target_id == self._poll_track_id:
                target_liked = not self._is_liked
            else:
                checked = await self._check_tracks_liked(token, [target_id])
                target_liked = not checked.get(target_id, False)
        else:
            target_liked = bool(liked)
        method = "PUT" if target_liked else "DELETE"
        track_uri = f"spotify:track:{target_id}"
        try:
            await _exec(
                _spotify_api_request, "me/library", token, method,
                {"uris": track_uri},
            )
            if target_id == self._poll_track_id:
                self._is_liked = target_liked
                if self._track_meta:
                    self._track_meta["is_liked"] = target_liked
                    await decky.emit("track_metadata", self._track_meta)
            return {"ok": True, "track_id": target_id, "is_liked": target_liked}
        except urllib.error.HTTPError as e:
            return {"ok": False, "error": _parse_spotify_error(e)}
        except Exception as e:
            decky.logger.error("toggle_like_track(%s) failed: %s", target_id, e)
            return {"ok": False, "error": str(e)}

    async def get_queue(self) -> dict:
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        try:
            data = await _exec(_spotify_api_request, "me/player/queue", token, "GET")
            if not data:
                return {"ok": True, "currently_playing": None, "queue": []}

            def _fmt(item: dict | None) -> dict | None:
                if not item:
                    return None
                if item.get("type") == "episode":
                    show = item.get("show") or {}
                    artists = show.get("name", "Podcast")
                    album = ""
                    images = item.get("images") or show.get("images") or []
                else:
                    artists = ", ".join(a["name"] for a in item.get("artists", []))
                    album = item.get("album", {}).get("name", "")
                    images = item.get("album", {}).get("images") or []
                return {
                    "id": item.get("id"),
                    "name": item.get("name", ""),
                    "artist": artists,
                    "album": album,
                    "uri": item.get("uri", ""),
                    "duration_ms": item.get("duration_ms", 0),
                    "image_url": _image_url(images),
                }

            queue_items = []
            for q in (data.get("queue") or [])[:30]:
                formatted = _fmt(q)
                if formatted:
                    queue_items.append(formatted)
            curr = _fmt(data.get("currently_playing"))
            all_to_check = ([curr] if curr else []) + queue_items
            await self._annotate_tracks_liked(token, all_to_check)
            return {
                "ok": True,
                "currently_playing": curr,
                "queue": queue_items,
            }
        except urllib.error.HTTPError as e:
            return {"ok": False, "error": _parse_spotify_error(e)}
        except Exception as e:
            decky.logger.error("get_queue failed: %s", e)
            return {"ok": False, "error": str(e)}

    async def add_to_queue(self, uri: str, device_id: str = "") -> dict:
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        if not uri:
            return {"ok": False, "error": "Missing track URI"}
        params: dict = {"uri": uri}
        if device_id:
            params["device_id"] = device_id
        try:
            await _exec(_spotify_api_request, "me/player/queue", token, "POST", params)
            return {"ok": True}
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return {"ok": False, "error": "No active device found"}
            return {"ok": False, "error": _parse_spotify_error(e)}
        except Exception as e:
            decky.logger.error("add_to_queue(%s) failed: %s", uri, e)
            return {"ok": False, "error": str(e)}

    # ── Playlist / context-play callable methods ─────────────────

    async def get_playlists(self, offset: int = 0) -> dict:
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        try:
            data = await _exec(_spotify_api_request, "me/playlists", token, "GET", {"limit": 50, "offset": offset})
            items = data.get("items", []) if data else []
            playlists = []
            for p in items:
                if not p:
                    continue
                images = p.get("images") or []
                playlists.append({
                    "id": p["id"],
                    "name": p.get("name", ""),
                    "image_url": _image_url(images),
                    "track_count": (p.get("items") or p.get("tracks") or {}).get("total", 0),
                    "owner_id": p.get("owner", {}).get("id", ""),
                })
            total = data.get("total", 0) if data else 0
            return {"ok": True, "playlists": playlists, "total": total, "offset": offset}
        except Exception as e:
            decky.logger.error("get_playlists failed: %s", e)
            return {"ok": False, "error": str(e)}

    async def get_playlist_tracks(self, playlist_id: str, offset: int = 0) -> dict:
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        try:
            data = await _exec(
                _spotify_api_request,
                f"playlists/{playlist_id}/items", token, "GET",
                {"limit": 50, "offset": offset},
            )
            items = data.get("items", []) if data else []
            tracks = []
            for item in items:
                t = item.get("item") or item.get("track")
                if t is None:
                    continue
                artists = ", ".join(a["name"] for a in t.get("artists", []))
                images = t.get("album", {}).get("images") or []
                tracks.append({
                    "id": t.get("id"),
                    "name": t.get("name", ""),
                    "artist": artists,
                    "album": t.get("album", {}).get("name", ""),
                    "uri": t.get("uri", ""),
                    "duration_ms": t.get("duration_ms", 0),
                    "image_url": _image_url(images),
                })
            await self._annotate_tracks_liked(token, tracks)
            total = data.get("total", 0) if data else 0
            return {"ok": True, "tracks": tracks, "total": total, "offset": offset}
        except Exception as e:
            decky.logger.error("get_playlist_tracks failed: %s", e)
            return {"ok": False, "error": str(e)}

    async def add_track_to_playlist(self, playlist_id: str, track_uri: str) -> dict:
        """Add a track URI to a playlist via Spotify's /playlists/{id}/items endpoint."""
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        pid = (playlist_id or "").strip()
        if pid.startswith("spotify:playlist:"):
            pid = pid.split(":")[-1]
        uri = (track_uri or "").strip()
        if uri and not uri.startswith("spotify:"):
            uri = f"spotify:track:{uri}"
        if not pid or not uri:
            return {"ok": False, "error": "Missing playlist_id or track_uri"}
        try:
            try:
                await _exec(
                    _spotify_api_request,
                    f"playlists/{pid}/items", token, "POST", None,
                    {"uris": [uri]},
                )
            except urllib.error.HTTPError as e:
                if e.code in (400, 404):
                    await _exec(
                        _spotify_api_request,
                        f"playlists/{pid}/tracks", token, "POST", None,
                        {"uris": [uri]},
                    )
                else:
                    raise
            return {"ok": True, "playlist_id": pid, "track_uri": uri}
        except urllib.error.HTTPError as e:
            return {"ok": False, "error": _parse_spotify_error(e)}
        except Exception as e:
            decky.logger.error("add_track_to_playlist(%s, %s) failed: %s", pid, uri, e)
            return {"ok": False, "error": str(e)}

    async def _sync_native_spotify_folders(self) -> list[dict]:
        """Extract recursive playlist folders from Official Spotify Client CDP RootlistAPI (cached across backends) and merge custom folders."""
        custom_folders = [
            dict(f) for f in (self._settings.get("playlist_folders") or [])
            if isinstance(f, dict) and f.get("id") and f.get("source") not in ("spotify", "spotify_client")
        ]
        cached_tree = self._settings.get("spotify_folder_tree")
        if not isinstance(cached_tree, list):
            cached_tree = []

        # Attempt live extraction via Official Spotify Client CDP if available
        try:
            cdp_tree = await _exec(_fetch_spotify_cdp_folder_tree, SPOTIFY_CDP_PORT, timeout=6)
            if isinstance(cdp_tree, list) and len(cdp_tree) > 0:
                proxied_tree = _proxy_folder_tree_images(cdp_tree)
                if proxied_tree != cached_tree:
                    self._settings["spotify_folder_tree"] = proxied_tree
                    _save_settings(self._settings)
                cached_tree = proxied_tree
        except Exception as e:
            decky.logger.debug("Live CDP folder sync skipped: %s", e)

        return _proxy_folder_tree_images(cached_tree) + custom_folders

    async def get_playlist_folders(self) -> dict:
        folders = await self._sync_native_spotify_folders()
        return {"ok": True, "folders": folders}

    async def manage_playlist_folder(
        self,
        action: str,
        folder_id: str = "",
        name: str = "",
        playlist_id: str = "",
        folders: list | None = None,
    ) -> dict:
        """Create, rename, delete, or assign playlists to custom folders in Deckify."""
        current: list[dict] = [
            dict(f) for f in (self._settings.get("playlist_folders") or [])
            if isinstance(f, dict) and f.get("id") and f.get("source") not in ("spotify", "spotify_client")
        ]
        act = (action or "").strip().lower()
        if act == "save" and isinstance(folders, list):
            current = [
                {
                    "id": str(f.get("id")),
                    "name": str(f.get("name", "Folder")).strip() or "Folder",
                    "playlist_ids": [str(x) for x in (f.get("playlist_ids") or []) if x],
                }
                for f in folders if isinstance(f, dict) and f.get("id") and f.get("source") not in ("spotify", "spotify_client")
            ]
        elif act == "create":
            clean_name = (name or "").strip()
            if not clean_name:
                return {"ok": False, "error": "Folder name cannot be empty"}
            new_id = f"folder-{secrets.token_hex(4)}"
            current.append({
                "id": new_id,
                "name": clean_name,
                "playlist_ids": [playlist_id] if playlist_id else [],
            })
        elif act == "rename":
            clean_name = (name or "").strip()
            if not clean_name:
                return {"ok": False, "error": "Folder name cannot be empty"}
            for f in current:
                if f["id"] == folder_id:
                    f["name"] = clean_name
                    break
            else:
                return {"ok": False, "error": "Folder not found"}
        elif act == "delete":
            current = [f for f in current if f["id"] != folder_id]
        elif act == "add_playlist":
            if not folder_id or not playlist_id:
                return {"ok": False, "error": "Missing folder_id or playlist_id"}
            for f in current:
                if f["id"] == folder_id:
                    pids = list(f.get("playlist_ids") or [])
                    if playlist_id not in pids:
                        pids.append(playlist_id)
                    f["playlist_ids"] = pids
                    break
            else:
                return {"ok": False, "error": "Folder not found"}
        elif act == "remove_playlist":
            if not folder_id or not playlist_id:
                return {"ok": False, "error": "Missing folder_id or playlist_id"}
            for f in current:
                if f["id"] == folder_id:
                    f["playlist_ids"] = [x for x in (f.get("playlist_ids") or []) if x != playlist_id]
                    break
        else:
            return {"ok": False, "error": f"Unknown folder action: {action}"}

        self._settings["playlist_folders"] = current
        _save_settings(self._settings)
        native_tree = _proxy_folder_tree_images(self._settings.get("spotify_folder_tree") or [])
        return {"ok": True, "folders": native_tree + current}

    async def set_native_playlist_mix(self, playlist_id: str, enabled: bool = True, play_now: bool = True) -> dict:
        """Toggle native Spotify playlist mixing via Official Spotify Client CDP PlaylistMixingAPI."""
        if self._settings.get("audio_backend") != "spotify_client":
            return {"ok": False, "error": "Native Spotify Mix requires the Official Spotify Client backend"}
        pid = (playlist_id or "").strip()
        if pid.startswith("spotify:playlist:"):
            pid = pid.split(":")[-1]
        if not pid:
            return {"ok": False, "error": "Missing playlist_id"}
        uri = f"spotify:playlist:{pid}"
        enabled_js = "true" if enabled else "false"
        play_js = "true" if play_now else "false"
        expr = f"""
        (async () => {{
          const mainEl = document.getElementById('main');
          if (!mainEl) return {{ ok: false, error: 'Spotify UI not ready' }};
          const rk = Object.keys(mainEl).find(k => k.startsWith('__reactContainer'));
          const q = [mainEl[rk]];
          const visited = new Set();
          let reg = null;
          while (q.length > 0 && visited.size < 1000) {{
            const curr = q.shift();
            if (!curr || visited.has(curr)) continue;
            visited.add(curr);
            let m = curr.memoizedState;
            while (m) {{
              if (m.memoizedState && typeof m.memoizedState === 'object') {{
                const val = m.memoizedState;
                if (val._map && val._map instanceof Map) {{ reg = val._map; break; }}
                if (val.value && typeof val.value.getRegistry === 'function') {{ reg = val.value.getRegistry()._map; break; }}
              }}
              m = m.next;
            }}
            if (reg) break;
            if (curr.child) q.push(curr.child);
            if (curr.sibling) q.push(curr.sibling);
          }}
          if (!reg) return {{ ok: false, error: 'Spotify internal registry unavailable' }};
          let mixApi = null;
          let playerApi = null;
          for (const [k, v] of reg.entries()) {{
            const desc = String(k.description);
            if (desc === 'PlaylistMixingAPI') mixApi = v.instance;
            if (desc === 'PlayerAPI') playerApi = v.instance;
          }}
          if (!mixApi) return {{ ok: false, error: 'PlaylistMixingAPI unavailable' }};
          const uri = {json.dumps(uri)};
          const enable = {enabled_js};
          try {{
            if (typeof mixApi.setAutoMix === 'function') await mixApi.setAutoMix(uri, enable);
          }} catch (e) {{}}
          try {{
            if (typeof mixApi.setMixState === 'function') await mixApi.setMixState(uri, enable);
          }} catch (e) {{}}
          if ({play_js} && playerApi && typeof playerApi.play === 'function') {{
            try {{
              await playerApi.play({{ uri }}, {{}}, {{}});
            }} catch (e) {{}}
          }}
          return {{ ok: true, playlist_id: {json.dumps(pid)}, uri, is_mixed: enable }};
        }})()
        """
        try:
            res = await _exec(_cdp_evaluate, expr, SPOTIFY_CDP_PORT, 6.0, timeout=7)
            if isinstance(res, dict) and res.get("ok"):
                # Update cached folder tree is_mixed state if present
                def _update_mixed(nodes: list[dict]) -> None:
                    for folder in nodes:
                        for pl in folder.get("playlists") or []:
                            if pl.get("id") == pid:
                                pl["is_mixed"] = bool(enabled)
                        if folder.get("subfolders"):
                            _update_mixed(folder["subfolders"])

                tree = self._settings.get("spotify_folder_tree")
                if isinstance(tree, list):
                    _update_mixed(tree)
                    _save_settings(self._settings)
                return res
            if isinstance(res, dict):
                return res
            return {"ok": False, "error": "Official Spotify Client did not respond over CDP"}
        except Exception as e:
            decky.logger.warning("set_native_playlist_mix failed: %s", e)
            return {"ok": False, "error": str(e)}

    # ── Official Spotify Client Remote Window (CDP) & Gamepad ────

    def _close_gamepad_fds(self) -> None:
        for path, fd in list(self._js_fds.items()):
            try:
                os.close(fd)
            except Exception:
                pass
        self._js_fds.clear()
        self._js_axis_state.clear()

    async def poll_gamepad_events(self) -> dict:
        """Read queued Linux joystick events (/dev/input/js*) non-blockingly for SteamOS CEF Dashboard navigation."""
        events: list[str] = []
        js_struct = struct.Struct("<IhBB")
        button_map = {
            0: "a",
            1: "b",
            2: "x",
            3: "y",
            4: "lb",
            5: "rb",
            6: "select",
            7: "start",
            11: "up",
            12: "down",
            13: "left",
            14: "right",
        }
        try:
            for idx in range(4):
                path = f"/dev/input/js{idx}"
                if not os.path.exists(path):
                    if path in self._js_fds:
                        try:
                            os.close(self._js_fds.pop(path))
                        except Exception:
                            pass
                    continue
                if path not in self._js_fds:
                    try:
                        self._js_fds[path] = os.open(path, os.O_RDONLY | os.O_NONBLOCK)
                    except OSError:
                        continue
                fd = self._js_fds[path]
                while True:
                    try:
                        chunk = os.read(fd, 8)
                        if not chunk or len(chunk) < 8:
                            break
                        _, val, ev_type, num = js_struct.unpack(chunk)
                        # Ignore synthetic initial state burst (JS_EVENT_INIT = 0x80)
                        if ev_type & 0x80:
                            continue
                        if ev_type == 0x01 and val == 1:
                            mapped = button_map.get(num)
                            if mapped:
                                events.append(mapped)
                        elif ev_type == 0x02:
                            key = (path, num)
                            prev_dir = self._js_axis_state.get(key, 0)
                            if num in (0, 6):  # Left Stick X or D-Pad Hat X
                                cur_dir = -1 if val < -16000 else (1 if val > 16000 else 0)
                                self._js_axis_state[key] = cur_dir
                                if cur_dir != prev_dir and cur_dir != 0:
                                    events.append("left" if cur_dir < 0 else "right")
                            elif num in (1, 7):  # Left Stick Y or D-Pad Hat Y
                                cur_dir = -1 if val < -16000 else (1 if val > 16000 else 0)
                                self._js_axis_state[key] = cur_dir
                                if cur_dir != prev_dir and cur_dir != 0:
                                    events.append("up" if cur_dir < 0 else "down")
                            elif num in (2, 5):  # Left Trigger (2) / Right Trigger (5)
                                cur_dir = 1 if val > 16000 else 0
                                self._js_axis_state[key] = cur_dir
                                if cur_dir != prev_dir and cur_dir == 1:
                                    events.append("lt" if num == 2 else "rt")
                    except OSError as e:
                        if e.errno not in (errno.EAGAIN, errno.EWOULDBLOCK):
                            try:
                                os.close(fd)
                            except Exception:
                                pass
                            self._js_fds.pop(path, None)
                        break
        except Exception as e:
            decky.logger.debug("Gamepad poll error: %s", e)
        return {"ok": True, "events": events}

    async def get_client_window_status(self) -> dict:
        target = await _exec(_cdp_get_page_target, SPOTIFY_CDP_PORT, timeout=3)
        running = (
            (self._spotify_client_process is not None and self._spotify_client_process.poll() is None)
            or target is not None
        )
        if not running:
            return {
                "ok": True,
                "running": False,
                "title": "",
                "url": "",
                "logged_in": False,
                "viewport_width": 1280,
                "viewport_height": 800,
            }
        if not target:
            return {
                "ok": True,
                "running": True,
                "title": "Starting...",
                "url": "",
                "logged_in": False,
                "viewport_width": 1280,
                "viewport_height": 800,
            }
        try:
            await _exec(
                _cdp_call,
                "Emulation.setDeviceMetricsOverride",
                {"width": 1280, "height": 800, "deviceScaleFactor": 1, "mobile": False},
                SPOTIFY_CDP_PORT,
                timeout=2,
            )
        except Exception:
            pass
        title = target.get("title", "")
        url = target.get("url", "")
        logged_in = "login.app.spotify.com" not in url and bool(url)
        return {
            "ok": True,
            "running": True,
            "title": title,
            "url": url,
            "logged_in": logged_in,
            "viewport_width": 1280,
            "viewport_height": 800,
        }

    async def capture_client_window_screenshot(self) -> bytes | None:
        try:
            def _capture():
                _cdp_call(
                    "Emulation.setDeviceMetricsOverride",
                    {"width": 1280, "height": 800, "deviceScaleFactor": 1, "mobile": False},
                    SPOTIFY_CDP_PORT,
                )
                return _cdp_call(
                    "Page.captureScreenshot",
                    {"format": "jpeg", "quality": 80},
                    SPOTIFY_CDP_PORT,
                )

            res = await _exec(_capture, timeout=4)
            if res and res.get("data"):
                return base64.b64decode(res["data"])
        except Exception as e:
            decky.logger.debug("Screenshot capture failed: %s", e)
        return None

    async def send_client_window_input(self, payload: dict) -> dict:
        input_type = str(payload.get("type") or payload.get("action") or "").lower()
        try:
            if input_type == "click":
                x = int(float(payload.get("x", 0)))
                y = int(float(payload.get("y", 0)))
                button = str(payload.get("button", "left"))

                def _do_click():
                    _cdp_call("Input.dispatchMouseEvent", {
                        "type": "mouseMoved", "x": x, "y": y,
                    })
                    _cdp_call("Input.dispatchMouseEvent", {
                        "type": "mousePressed", "x": x, "y": y,
                        "button": button, "clickCount": 1,
                    })
                    _cdp_call("Input.dispatchMouseEvent", {
                        "type": "mouseReleased", "x": x, "y": y,
                        "button": button, "clickCount": 1,
                    })

                await _exec(_do_click, timeout=4)
                return {"ok": True}
            if input_type == "wheel":
                x = int(float(payload.get("x", 640)))
                y = int(float(payload.get("y", 400)))
                raw_dy = payload.get("delta_y") if "delta_y" in payload else payload.get("deltaY", 120)
                delta_y = int(float(raw_dy))
                await _exec(
                    _cdp_call,
                    "Input.dispatchMouseEvent",
                    {"type": "mouseWheel", "x": x, "y": y, "deltaX": 0, "deltaY": delta_y},
                    timeout=4,
                )
                return {"ok": True}
            if input_type == "text":
                text = str(payload.get("text", ""))
                if text:
                    await _exec(_cdp_call, "Input.insertText", {"text": text}, timeout=4)
                return {"ok": True}
            if input_type == "key":
                key_name = str(payload.get("key", "Enter"))
                vk_map = {"Enter": 13, "Backspace": 8, "Tab": 9, "Escape": 27}
                vk = vk_map.get(key_name, 0)

                def _do_key():
                    _cdp_call("Input.dispatchKeyEvent", {
                        "type": "rawKeyDown", "key": key_name,
                        "windowsVirtualKeyCode": vk, "nativeVirtualKeyCode": vk,
                    })
                    if key_name == "Enter":
                        _cdp_call("Input.dispatchKeyEvent", {
                            "type": "char", "text": "\r", "unmodifiedText": "\r",
                        })
                    _cdp_call("Input.dispatchKeyEvent", {
                        "type": "keyUp", "key": key_name,
                        "windowsVirtualKeyCode": vk, "nativeVirtualKeyCode": vk,
                    })

                await _exec(_do_key, timeout=4)
                return {"ok": True}
            return {"ok": False, "error": f"Unknown input type: {input_type}"}
        except Exception as e:
            decky.logger.warning("send_client_window_input failed: %s", e)
            return {"ok": False, "error": str(e)}

    async def get_liked_tracks(self, offset: int = 0) -> dict:
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        try:
            data = await _exec(
                _spotify_api_request, "me/tracks", token, "GET",
                {"limit": 50, "offset": offset},
            )
            items = data.get("items", []) if data else []
            tracks = []
            for item in items:
                t = item.get("track")
                if t is None:
                    continue
                artists = ", ".join(a["name"] for a in t.get("artists", []))
                images = t.get("album", {}).get("images") or []
                tracks.append({
                    "id": t.get("id"),
                    "name": t.get("name", ""),
                    "artist": artists,
                    "album": t.get("album", {}).get("name", ""),
                    "uri": t.get("uri", ""),
                    "duration_ms": t.get("duration_ms", 0),
                    "image_url": _image_url(images),
                    "is_liked": True,
                })
            total = data.get("total", 0) if data else 0
            return {"ok": True, "tracks": tracks, "total": total, "offset": offset}
        except Exception as e:
            decky.logger.error("get_liked_tracks failed: %s", e)
            return {"ok": False, "error": str(e)}

    async def get_saved_episodes(self, offset: int = 0) -> dict:
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        try:
            data = await _exec(
                _spotify_api_request, "me/episodes", token, "GET",
                {"limit": 50, "offset": offset},
            )
            items = data.get("items", []) if data else []
            episodes = []
            for item in items:
                ep = item.get("episode")
                if ep is None:
                    continue
                images = ep.get("images") or []
                episodes.append({
                    "id": ep.get("id"),
                    "name": ep.get("name", ""),
                    "show_name": ep.get("show", {}).get("name", ""),
                    "uri": ep.get("uri", ""),
                    "duration_ms": ep.get("duration_ms", 0),
                    "image_url": _image_url(images),
                })
            total = data.get("total", 0) if data else 0
            return {"ok": True, "episodes": episodes, "total": total, "offset": offset}
        except Exception as e:
            decky.logger.error("get_saved_episodes failed: %s", e)
            return {"ok": False, "error": str(e)}

    async def get_saved_albums(self, offset: int = 0) -> dict:
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        try:
            data = await _exec(
                _spotify_api_request, "me/albums", token, "GET",
                {"limit": 50, "offset": offset},
            )
            items = data.get("items", []) if data else []
            albums = []
            for item in items:
                a = item.get("album")
                if a is None:
                    continue
                images = a.get("images") or []
                artists = ", ".join(ar["name"] for ar in a.get("artists", []))
                albums.append({
                    "id": a["id"],
                    "name": a.get("name", ""),
                    "artist": artists,
                    "image_url": _image_url(images),
                    "track_count": a.get("total_tracks", 0),
                    "uri": a.get("uri", ""),
                })
            total = data.get("total", 0) if data else 0
            return {"ok": True, "albums": albums, "total": total, "offset": offset}
        except Exception as e:
            decky.logger.error("get_saved_albums failed: %s", e)
            return {"ok": False, "error": str(e)}

    async def get_album_tracks(self, album_id: str, offset: int = 0) -> dict:
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        try:
            data = await _exec(
                _spotify_api_request,
                f"albums/{album_id}/tracks", token, "GET",
                {"limit": 50, "offset": offset},
            )
            items = data.get("items", []) if data else []
            tracks = []
            for t in items:
                artists = ", ".join(a["name"] for a in t.get("artists", []))
                tracks.append({
                    "id": t.get("id"),
                    "name": t.get("name", ""),
                    "artist": artists,
                    "album": "",
                    "uri": t.get("uri", ""),
                    "duration_ms": t.get("duration_ms", 0),
                    "image_url": None,
                })
            await self._annotate_tracks_liked(token, tracks)
            total = data.get("total", 0) if data else 0
            return {"ok": True, "tracks": tracks, "total": total, "offset": offset}
        except Exception as e:
            decky.logger.error("get_album_tracks failed: %s", e)
            return {"ok": False, "error": str(e)}

    async def get_followed_artists(self) -> dict:
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        try:
            data = await _exec(
                _spotify_api_request, "me/following", token, "GET",
                {"type": "artist", "limit": 50},
            )
            artists_data = data.get("artists", {}) if data else {}
            items = artists_data.get("items", [])
            artists = []
            for a in items:
                images = a.get("images") or []
                artists.append({
                    "id": a["id"],
                    "name": a.get("name", ""),
                    "image_url": _image_url(images),
                })
            return {"ok": True, "artists": artists}
        except Exception as e:
            decky.logger.error("get_followed_artists failed: %s", e)
            return {"ok": False, "error": str(e)}

    async def get_artist_albums(self, artist_id: str, offset: int = 0) -> dict:
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        try:
            data = await _exec(
                _spotify_api_request,
                f"artists/{artist_id}/albums", token, "GET",
                {"limit": 10, "offset": offset, "include_groups": "album,single"},
            )
            items = data.get("items", []) if data else []
            albums = []
            for a in items:
                images = a.get("images") or []
                ar = ", ".join(x["name"] for x in a.get("artists", []))
                albums.append({
                    "id": a["id"],
                    "name": a.get("name", ""),
                    "artist": ar,
                    "image_url": _image_url(images),
                    "track_count": a.get("total_tracks", 0),
                    "uri": a.get("uri", ""),
                })
            total = data.get("total", 0) if data else 0
            return {"ok": True, "albums": albums, "total": total, "offset": offset}
        except Exception as e:
            decky.logger.error("get_artist_albums failed: %s", e)
            return {"ok": False, "error": str(e)}

    async def get_artist_top_tracks(self, artist_id: str) -> dict:
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        try:
            items = []
            try:
                data = await _exec(
                    _spotify_api_request,
                    f"artists/{artist_id}/top-tracks", token, "GET",
                )
                items = data.get("tracks", []) if data else []
            except urllib.error.HTTPError as e:
                if e.code == 403:
                    artist_info = await _exec(
                        _spotify_api_request, f"artists/{artist_id}", token, "GET",
                    )
                    artist_name = (artist_info or {}).get("name", "")
                    if artist_name:
                        search_data = await _exec(
                            _spotify_api_request, "search", token, "GET",
                            {"q": f"artist:{artist_name}", "type": "track", "limit": 10},
                        )
                        items = (search_data or {}).get("tracks", {}).get("items", [])
                else:
                    raise
            tracks = []
            for t in items:
                artists = ", ".join(a["name"] for a in t.get("artists", []))
                images = t.get("album", {}).get("images") or []
                tracks.append({
                    "id": t.get("id"),
                    "name": t.get("name", ""),
                    "artist": artists,
                    "album": t.get("album", {}).get("name", ""),
                    "uri": t.get("uri", ""),
                    "duration_ms": t.get("duration_ms", 0),
                    "image_url": _image_url(images),
                })
            await self._annotate_tracks_liked(token, tracks)
            return {"ok": True, "tracks": tracks}
        except Exception as e:
            decky.logger.error("get_artist_top_tracks failed: %s", e)
            return {"ok": False, "error": str(e)}

    async def get_recently_played(self, limit: int = 30) -> dict:
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        try:
            data = await _exec(
                _spotify_api_request,
                "me/player/recently-played", token, "GET",
                {"limit": max(1, min(50, int(limit)))},
            )
            items = data.get("items", []) if data else []
            tracks = []
            seen_uris: set[str] = set()
            for item in items:
                t = item.get("track")
                if not t:
                    continue
                uri = t.get("uri", "")
                if uri in seen_uris:
                    continue
                seen_uris.add(uri)
                artists = ", ".join(a["name"] for a in t.get("artists", []))
                images = t.get("album", {}).get("images") or []
                tracks.append({
                    "id": t.get("id"),
                    "name": t.get("name", ""),
                    "artist": artists,
                    "album": t.get("album", {}).get("name", ""),
                    "uri": uri,
                    "duration_ms": t.get("duration_ms", 0),
                    "image_url": _image_url(images),
                })
            await self._annotate_tracks_liked(token, tracks)
            return {"ok": True, "tracks": tracks}
        except Exception as e:
            decky.logger.error("get_recently_played failed: %s", e)
            return {"ok": False, "error": str(e)}

    async def search_spotify(self, query: str, types: str = "track,artist,album,playlist", offset: int = 0) -> dict:
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        try:
            data = await _exec(
                _spotify_api_request, "search", token, "GET",
                {"q": query, "type": types, "limit": 10, "offset": offset},
            )
            if not data:
                return {"ok": True, "tracks": [], "artists": [], "albums": [], "playlists": []}
            tracks = []
            for t in data.get("tracks", {}).get("items", []):
                artists = ", ".join(a["name"] for a in t.get("artists", []))
                images = t.get("album", {}).get("images") or []
                tracks.append({
                    "id": t.get("id"), "name": t.get("name", ""), "artist": artists,
                    "album": t.get("album", {}).get("name", ""), "uri": t.get("uri", ""),
                    "duration_ms": t.get("duration_ms", 0),
                    "image_url": _image_url(images),
                })
            await self._annotate_tracks_liked(token, tracks)
            artists_out = []
            for a in data.get("artists", {}).get("items", []):
                images = a.get("images") or []
                artists_out.append({
                    "id": a["id"], "name": a.get("name", ""),
                    "image_url": _image_url(images),
                })
            albums_out = []
            for a in data.get("albums", {}).get("items", []):
                images = a.get("images") or []
                ar = ", ".join(x["name"] for x in a.get("artists", []))
                albums_out.append({
                    "id": a["id"], "name": a.get("name", ""), "artist": ar,
                    "image_url": _image_url(images),
                    "track_count": a.get("total_tracks", 0), "uri": a.get("uri", ""),
                })
            playlists_out = []
            for p in data.get("playlists", {}).get("items", []):
                if p is None:
                    continue
                images = p.get("images") or []
                playlists_out.append({
                    "id": p["id"], "name": p.get("name", ""),
                    "image_url": _image_url(images),
                    "track_count": (p.get("items") or p.get("tracks") or {}).get("total", 0),
                    "owner_id": p.get("owner", {}).get("id", ""),
                })
            return {"ok": True, "tracks": tracks, "artists": artists_out, "albums": albums_out, "playlists": playlists_out}
        except Exception as e:
            decky.logger.error("search_spotify failed: %s", e)
            return {"ok": False, "error": str(e)}

    async def play_tracks(self, context_uri: str | None = None, offset_uri: str | None = None, uris: list | None = None, position: int = 0) -> dict:
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        body = {}
        if context_uri:
            body["context_uri"] = context_uri
            if offset_uri:
                body["offset"] = {"uri": offset_uri}
            self._context_uri = context_uri
        elif uris:
            body["uris"] = uris
            if position > 0:
                body["offset"] = {"position": position}
        try:
            await _exec(
                _spotify_api_request, "me/player/play", token, "PUT", None, body,
            )
            return {"ok": True}
        except urllib.error.HTTPError as e:
            if e.code == 404:
                transfer_res = await self._auto_transfer_and_play(token)
                if transfer_res.get("ok") and body:
                    try:
                        await asyncio.sleep(0.5)
                        await _exec(_spotify_api_request, "me/player/play", token, "PUT", None, body)
                        return {"ok": True}
                    except Exception:
                        pass
                return transfer_res
            return {"ok": False, "error": _parse_spotify_error(e)}
        except Exception as e:
            decky.logger.error("play_tracks failed: %s", e)
            return {"ok": False, "error": str(e)}

    # ── Device callable methods ─────────────────────────────────

    async def get_devices(self) -> dict:
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        try:
            data = await _exec(_spotify_api_request, "me/player/devices", token)
            devices = data.get("devices", []) if data else []
            return {"ok": True, "devices": devices}
        except Exception as e:
            decky.logger.error("get_devices failed: %s", e)
            return {"ok": False, "error": str(e)}

    async def transfer_playback(self, device_id: str) -> dict:
        token = await self._ensure_token()
        if not token:
            return {"ok": False, "error": "Not authenticated"}
        try:
            await _exec(
                _spotify_api_request, "me/player", token, "PUT", None,
                {"device_ids": [device_id]},
            )
            return {"ok": True}
        except urllib.error.HTTPError as e:
            return {"ok": False, "error": _parse_spotify_error(e)}
        except Exception as e:
            decky.logger.error("transfer_playback failed: %s", e)
            return {"ok": False, "error": str(e)}

    # ── OAuth callable methods ─────────────────────────────────

    async def start_oauth(self) -> dict:
        await self._stop_oauth_server()

        ssl_ctx, ssl_err = _ensure_ssl_cert()
        if not ssl_ctx:
            return {"ok": False, "error": f"Failed to create SSL certificate: {ssl_err}"}

        mdns_host = _get_mdns_host()
        base_url = f"https://{mdns_host}:{OAUTH_SERVER_PORT}"
        self._oauth_redirect_uri = f"{base_url}/callback"

        try:
            self._oauth_server = await asyncio.start_server(
                self._handle_oauth_connection, "0.0.0.0", OAUTH_SERVER_PORT,
                ssl=ssl_ctx,
            )
        except OSError as e:
            return {"ok": False, "error": f"Cannot start OAuth server: {e}"}

        decky.logger.info("OAuth started, landing URL: %s", base_url)
        return {"ok": True, "landing_url": base_url}

    async def get_auth_status(self) -> dict:
        if self._access_token and self._refresh_token:
            saved_version = self._settings.get("scopes_version", 0)
            needs_reauth = saved_version < CURRENT_SCOPES_VERSION
            return {"authenticated": True, "needs_reauth": needs_reauth}
        return {"authenticated": False, "needs_reauth": False}

    async def logout_spotify(self) -> dict:
        await self._stop_api_poll()
        self._access_token = None
        self._refresh_token = None
        self._token_expires_at = 0
        self._poll_play_state = None
        self._poll_track_id = None
        self._poll_volume = None
        self._active_device = None
        self._settings["spotify_client_id"] = ""
        for key in ("access_token", "refresh_token", "token_expires_at"):
            self._settings.pop(key, None)
        _save_settings(self._settings)
        decky.logger.info("Spotify logged out, tokens and client_id cleared")
        return {"ok": True}

    async def get_dashboard_url(self) -> dict:
        if self._dashboard_server is None:
            return {"ok": False, "error": "Dashboard server is unavailable"}
        return {"ok": True, "url": f"http://127.0.0.1:{DASHBOARD_PORT}"}

    # ── Dashboard server ──────────────────────────────────────

    async def _start_dashboard(self):
        if self._dashboard_server:
            return
        try:
            self._dashboard_server = await asyncio.start_server(
                self._handle_dashboard_request, "127.0.0.1", DASHBOARD_PORT,
            )
            decky.logger.info("Dashboard server started on port %d", DASHBOARD_PORT)
        except Exception as e:
            decky.logger.error("Failed to start dashboard server: %s", e)

    async def _stop_dashboard(self):
        if self._dashboard_server:
            self._dashboard_server.close()
            await self._dashboard_server.wait_closed()
            self._dashboard_server = None
            decky.logger.info("Dashboard server stopped")

    async def _handle_dashboard_request(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        try:
            data = await asyncio.wait_for(reader.read(65536), timeout=10)
            if not data:
                writer.close()
                return

            request_line = data.decode("utf-8", errors="replace").split("\r\n")[0]
            parts = request_line.split(" ")
            if len(parts) < 2:
                await self._send_json(writer, 400, {"error": "Bad request"})
                return

            method, raw_path = parts[0], parts[1]
            parsed = urllib.parse.urlparse(raw_path)
            path = parsed.path
            qs = urllib.parse.parse_qs(parsed.query)

            # Parse JSON body for POST requests
            body_json = None
            if method == "POST":
                raw_str = data.decode("utf-8", errors="replace")
                header_body = raw_str.split("\r\n\r\n", 1)
                if len(header_body) > 1 and header_body[1].strip():
                    try:
                        body_json = json.loads(header_body[1])
                    except (json.JSONDecodeError, ValueError) as e:
                        decky.logger.warning("Dashboard POST body JSON parse failed: %s", e)

            # CORS preflight
            if method == "OPTIONS":
                header = "HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\nConnection: close\r\n\r\n"
                writer.write(header.encode())
                await writer.drain()
                writer.close()
                return

            # API routes
            if path == "/api/status":
                await self._api_status(writer)
            elif path == "/api/image" and method == "GET":
                await self._serve_image(writer, qs.get("url", [""])[0])
            elif path == "/api/control" and method == "POST":
                action = qs.get("action", [None])[0]
                if not action:
                    await self._send_json(writer, 400, {"error": "Missing action param"})
                else:
                    result = await self.control_playback(action)
                    await self._send_json(writer, 200, result)
            elif path == "/api/volume" and method == "POST":
                value = qs.get("value", [None])[0]
                if value is None:
                    await self._send_json(writer, 400, {"error": "Missing value param"})
                else:
                    result = await self.set_volume(int(value))
                    await self._send_json(writer, 200, result)
            elif path == "/api/playlists" and method == "GET":
                offset = int(qs.get("offset", [0])[0])
                result = await self.get_playlists(offset)
                await self._send_json(writer, 200, result)
            elif path.startswith("/api/playlists/") and path.endswith("/tracks") and method == "GET":
                playlist_id = path.split("/")[3]
                offset = int(qs.get("offset", [0])[0])
                result = await self.get_playlist_tracks(playlist_id, offset)
                await self._send_json(writer, 200, result)
            elif path == "/api/playlist/add-item" and method == "POST":
                b = body_json or {}
                pid = str(b.get("playlist_id") or qs.get("playlist_id", [""])[0])
                uri = str(b.get("track_uri") or b.get("uri") or qs.get("track_uri", [""])[0])
                result = await self.add_track_to_playlist(pid, uri)
                await self._send_json(writer, 200, result)
            elif path == "/api/folders" and method == "GET":
                result = await self.get_playlist_folders()
                await self._send_json(writer, 200, result)
            elif path == "/api/folders" and method == "POST":
                b = body_json or {}
                result = await self.manage_playlist_folder(
                    action=str(b.get("action", "create")),
                    folder_id=str(b.get("folder_id", "")),
                    name=str(b.get("name", "")),
                    playlist_id=str(b.get("playlist_id", "")),
                    folders=b.get("folders"),
                )
                await self._send_json(writer, 200, result)
            elif path == "/api/liked-tracks" and method == "GET":
                offset = int(qs.get("offset", [0])[0])
                result = await self.get_liked_tracks(offset)
                await self._send_json(writer, 200, result)
            elif path == "/api/episodes" and method == "GET":
                offset = int(qs.get("offset", [0])[0])
                result = await self.get_saved_episodes(offset)
                await self._send_json(writer, 200, result)
            elif path == "/api/albums" and method == "GET":
                offset = int(qs.get("offset", [0])[0])
                result = await self.get_saved_albums(offset)
                await self._send_json(writer, 200, result)
            elif path.startswith("/api/albums/") and path.endswith("/tracks") and method == "GET":
                album_id = path.split("/")[3]
                offset = int(qs.get("offset", [0])[0])
                result = await self.get_album_tracks(album_id, offset)
                await self._send_json(writer, 200, result)
            elif path == "/api/artists" and method == "GET":
                result = await self.get_followed_artists()
                await self._send_json(writer, 200, result)
            elif path.startswith("/api/artists/") and path.endswith("/albums") and method == "GET":
                artist_id = path.split("/")[3]
                offset = int(qs.get("offset", [0])[0])
                result = await self.get_artist_albums(artist_id, offset)
                await self._send_json(writer, 200, result)
            elif path.startswith("/api/artists/") and path.endswith("/top-tracks") and method == "GET":
                artist_id = path.split("/")[3]
                result = await self.get_artist_top_tracks(artist_id)
                await self._send_json(writer, 200, result)
            elif path == "/api/recently-played" and method == "GET":
                limit = int(qs.get("limit", [30])[0])
                result = await self.get_recently_played(limit)
                await self._send_json(writer, 200, result)
            elif path == "/api/seek" and method == "POST":
                b = body_json or {}
                pos = b.get("position_ms") if "position_ms" in b else qs.get("position_ms", [0])[0]
                result = await self.seek_playback(int(pos))
                await self._send_json(writer, 200, result)
            elif path == "/api/shuffle" and method == "POST":
                b = body_json or {}
                raw_state = b.get("state") if "state" in b else qs.get("state", ["false"])[0]
                state_bool = raw_state if isinstance(raw_state, bool) else str(raw_state).lower() == "true"
                result = await self.set_shuffle(state_bool)
                await self._send_json(writer, 200, result)
            elif path == "/api/repeat" and method == "POST":
                b = body_json or {}
                state_str = str(b.get("state") or qs.get("state", ["off"])[0])
                result = await self.set_repeat(state_str)
                await self._send_json(writer, 200, result)
            elif path == "/api/like" and method == "POST":
                b = body_json or {}
                track_id = str(b.get("track_id") or qs.get("track_id", [""])[0])
                liked = b.get("liked")
                result = await self.toggle_like_track(track_id, liked)
                await self._send_json(writer, 200, result)
            elif path == "/api/queue" and method == "GET":
                result = await self.get_queue()
                await self._send_json(writer, 200, result)
            elif path == "/api/queue" and method == "POST":
                b = body_json or {}
                uri = str(b.get("uri") or qs.get("uri", [""])[0])
                result = await self.add_to_queue(uri)
                await self._send_json(writer, 200, result)
            elif path == "/api/devices" and method == "GET":
                result = await self.get_devices()
                await self._send_json(writer, 200, result)
            elif path == "/api/transfer" and method == "POST":
                b = body_json or {}
                device_id = str(b.get("device_id") or qs.get("device_id", [""])[0])
                result = await self.transfer_playback(device_id)
                await self._send_json(writer, 200, result)
            elif path in ("/api/settings", "/api/mix") and method == "POST":
                b = body_json or {}
                last_err = None
                # Process audio_backend first so audio_quality validation sees the updated backend
                ordered_keys = (
                    "audio_backend", "audio_quality", "bitrate",
                    "bit_perfect_clock", "normalisation", "gapless", "autoplay",
                )
                for k in ordered_keys:
                    if k in b:
                        res = await self.set_setting(k, b[k])
                        if not res.get("ok"):
                            last_err = res.get("error")
                await self._send_json(writer, 200, {
                    "ok": last_err is None,
                    "error": last_err,
                    "audio_backend": self._settings.get("audio_backend", "librespot"),
                    "audio_quality": self._settings.get("audio_quality", "320"),
                    "bitrate": self._settings.get("bitrate", 320),
                    "bit_perfect_clock": self._settings.get("bit_perfect_clock", True),
                    "normalisation": self._settings.get("normalisation", True),
                    "gapless": self._settings.get("gapless", True),
                    "autoplay": self._settings.get("autoplay", True),
                })
            elif path == "/api/client-window/status" and method == "GET":
                result = await self.get_client_window_status()
                await self._send_json(writer, 200, result)
            elif path == "/api/client-window/screenshot" and method == "GET":
                img = await self.capture_client_window_screenshot()
                if not img:
                    await self._send_json(writer, 404, {"error": "Spotify Client window unavailable"})
                else:
                    header = (
                        "HTTP/1.1 200 OK\r\n"
                        "Content-Type: image/jpeg\r\n"
                        f"Content-Length: {len(img)}\r\n"
                        "Cache-Control: no-store\r\n"
                        "Access-Control-Allow-Origin: *\r\n"
                        "Connection: close\r\n\r\n"
                    )
                    writer.write(header.encode() + img)
                    await writer.drain()
                    writer.close()
            elif path == "/api/client-window/input" and method == "POST":
                result = await self.send_client_window_input(body_json or {})
                await self._send_json(writer, 200, result)
            elif path == "/api/native-mix" and method == "POST":
                b = body_json or {}
                pid = str(b.get("playlist_id") or qs.get("playlist_id", [""])[0])
                raw_en = b.get("enabled") if "enabled" in b else qs.get("enabled", ["true"])[0]
                enabled = raw_en if isinstance(raw_en, bool) else str(raw_en).lower() == "true"
                raw_play = b.get("play_now") if "play_now" in b else True
                play_now = raw_play if isinstance(raw_play, bool) else str(raw_play).lower() == "true"
                result = await self.set_native_playlist_mix(pid, enabled=enabled, play_now=play_now)
                await self._send_json(writer, 200, result)
            elif path == "/api/gamepad/poll" and method == "GET":
                result = await self.poll_gamepad_events()
                await self._send_json(writer, 200, result)
            elif path == "/api/search" and method == "GET":
                q = qs.get("q", [""])[0]
                if not q:
                    await self._send_json(writer, 400, {"error": "Missing q param"})
                else:
                    offset = int(qs.get("offset", [0])[0])
                    result = await self.search_spotify(q, offset=offset)
                    await self._send_json(writer, 200, result)
            elif path == "/api/play" and method == "POST":
                b = body_json or {}
                context_uri = b.get("context_uri") or qs.get("context_uri", [None])[0]
                offset_uri = b.get("offset_uri") or qs.get("offset_uri", [None])[0]
                uris = b.get("uris")
                position = b.get("position", 0)
                result = await self.play_tracks(context_uri, offset_uri, uris, position)
                await self._send_json(writer, 200, result)
            # Static files
            elif path == "/" or path == "/index.html":
                await self._serve_static(writer, "index.html")
            elif path.startswith("/assets/"):
                await self._serve_static(writer, path.lstrip("/"))
            else:
                # SPA fallback: serve index.html for non-API, non-asset paths
                await self._serve_static(writer, "index.html")
        except asyncio.TimeoutError:
            try:
                writer.close()
            except Exception:
                pass
        except Exception as e:
            decky.logger.error("Dashboard request error: %s", e)
            try:
                await self._send_json(writer, 500, {"error": str(e)})
            except Exception:
                pass

    async def _serve_image(self, writer: asyncio.StreamWriter, url: str):
        try:
            content_type, body = await _exec(_fetch_spotify_image, url)
        except ValueError as error:
            await self._send_json(writer, 400, {"error": str(error)})
            return
        except Exception as error:
            decky.logger.warning("Cover image download failed: %s", error)
            await self._send_json(writer, 502, {"error": "Cover image is unavailable"})
            return
        header = (
            "HTTP/1.1 200 OK\r\n"
            f"Content-Type: {content_type}\r\nContent-Length: {len(body)}\r\n"
            "Cache-Control: public, max-age=86400\r\n"
            "Connection: close\r\n\r\n"
        )
        writer.write(header.encode() + body)
        await writer.drain()
        writer.close()

    async def _api_status(self, writer: asyncio.StreamWriter):
        running = self._is_engine_running()
        is_playing = self._poll_play_state == "playing"

        # Estimate position from last event
        position_ms = 0
        if self._last_event:
            position_ms = self._last_event.get("position_ms", 0)

        data = {
            "authenticated": self._access_token is not None,
            "librespot_running": running,
            "audio_backend": self._settings.get("audio_backend", "librespot"),
            "audio_quality": self._settings.get("audio_quality", "320"),
            "audio_stream_info": self._audio_stream_info,
            "play_state": self._poll_play_state,
            "track": self._track_meta,
            "position_ms": position_ms,
            "is_playing": is_playing,
            "volume": self._poll_volume,
            "shuffle_state": self._shuffle_state,
            "repeat_state": self._repeat_state,
            "is_liked": self._is_liked,
            "context_uri": self._context_uri,
            "active_device": self._active_device,
            "engine_settings": {
                "audio_backend": self._settings.get("audio_backend", "librespot"),
                "audio_quality": self._settings.get("audio_quality", "320"),
                "bitrate": self._settings.get("bitrate", 320),
                "bit_perfect_clock": self._settings.get("bit_perfect_clock", True),
                "normalisation": self._settings.get("normalisation", True),
                "gapless": self._settings.get("gapless", True),
                "autoplay": self._settings.get("autoplay", True),
            },
        }
        await self._send_json(writer, 200, data)

    async def _send_json(self, writer: asyncio.StreamWriter, status: int, data: dict):
        reason = {200: "OK", 204: "No Content", 400: "Bad Request", 404: "Not Found", 500: "Internal Server Error", 502: "Bad Gateway"}.get(status, "OK")
        body = json.dumps(data).encode()
        header = f"HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\nContent-Length: {len(body)}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n"
        writer.write(header.encode() + body)
        await writer.drain()
        writer.close()

    async def _serve_static(self, writer: asyncio.StreamWriter, rel_path: str):
        file_path = os.path.join(DASHBOARD_DIR, rel_path)
        # Path traversal check
        if not os.path.abspath(file_path).startswith(os.path.abspath(DASHBOARD_DIR)):
            await self._send_json(writer, 403, {"error": "Forbidden"})
            return
        if not os.path.isfile(file_path):
            await self._send_json(writer, 404, {"error": "Not found"})
            return

        mime_map = {
            ".html": "text/html; charset=utf-8",
            ".js": "application/javascript",
            ".css": "text/css",
            ".svg": "image/svg+xml",
            ".png": "image/png",
            ".ico": "image/x-icon",
            ".json": "application/json",
        }
        ext = os.path.splitext(file_path)[1]
        content_type = mime_map.get(ext, "application/octet-stream")

        loop = asyncio.get_event_loop()
        body = await loop.run_in_executor(None, self._read_file, file_path)
        cache = "Cache-Control: public, max-age=31536000, immutable\r\n" if rel_path.startswith("assets/") else ""
        header = f"HTTP/1.1 200 OK\r\nContent-Type: {content_type}\r\nContent-Length: {len(body)}\r\n{cache}Connection: close\r\n\r\n"
        writer.write(header.encode() + body)
        await writer.drain()
        writer.close()

    @staticmethod
    def _read_file(path: str) -> bytes:
        with open(path, "rb") as f:
            return f.read()

    # ── Internal helpers ───────────────────────────────────────

    async def _kill_spotify_client(self):
        """Cleanly terminate the Official Spotify Client Flatpak and its virtual KWin display."""
        sp_proc = self._spotify_client_process
        self._spotify_client_process = None
        if sp_proc and sp_proc.poll() is None:
            decky.logger.info("Stopping Official Spotify Client pid=%d", sp_proc.pid)
            try:
                sp_proc.terminate()
                sp_proc.wait(timeout=3)
            except Exception:
                try:
                    sp_proc.kill()
                except Exception:
                    pass
        try:
            cmd, env = _build_deck_command(["flatpak", "kill", SPOTIFY_FLATPAK_ID])
            await _exec(lambda: subprocess.run(cmd, env=env, capture_output=True), timeout=4)
        except Exception:
            pass

        kw_proc = self._kwin_process
        self._kwin_process = None
        self._virtual_display = None
        if kw_proc and kw_proc.poll() is None:
            try:
                kw_proc.terminate()
                kw_proc.wait(timeout=3)
            except Exception:
                try:
                    kw_proc.kill()
                except Exception:
                    pass

    async def _kill_librespot(self):
        proc = self._process
        if proc is None:
            return
        self._process = None

        if proc.poll() is not None:
            self._clear_pid()
            return

        decky.logger.info("Stopping librespot pid=%d", proc.pid)
        try:
            proc.terminate()
        except ProcessLookupError:
            self._clear_pid()
            return

        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            decky.logger.warning("librespot did not exit, sending SIGKILL")
            try:
                proc.kill()
            except ProcessLookupError:
                pass
            proc.wait(timeout=3)
        self._clear_pid()

    def _kill_stale_librespot(self):
        """Kill orphan librespot left by a previous plugin instance via PID file."""
        try:
            with open(LIBRESPOT_PID_FILE, "r") as f:
                old_pid = int(f.read().strip())
        except (FileNotFoundError, ValueError):
            return
        try:
            os.kill(old_pid, 0)  # check alive
        except ProcessLookupError:
            self._clear_pid()
            return
        decky.logger.info("Killing stale librespot pid=%d", old_pid)
        try:
            os.kill(old_pid, 15)  # SIGTERM
        except ProcessLookupError:
            pass
        self._clear_pid()

    @staticmethod
    def _write_pid(pid: int):
        os.makedirs(os.path.dirname(LIBRESPOT_PID_FILE), exist_ok=True)
        with open(LIBRESPOT_PID_FILE, "w") as f:
            f.write(str(pid))

    @staticmethod
    def _clear_pid():
        try:
            os.remove(LIBRESPOT_PID_FILE)
        except FileNotFoundError:
            pass

    def _start_monitor(self):
        if self._monitor_task and not self._monitor_task.done():
            return
        self._monitor_task = asyncio.get_event_loop().create_task(
            self._monitor_process()
        )

    def _start_api_poll(self):
        if self._api_poll_task and not self._api_poll_task.done():
            return
        self._api_poll_task = asyncio.get_event_loop().create_task(
            self._poll_api_loop()
        )

    async def _stop_api_poll(self):
        task = self._api_poll_task
        if task and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        self._api_poll_task = None

    async def _stop_monitor(self):
        task = self._monitor_task
        if task and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        self._monitor_task = None

    # ── OAuth / Spotify API helpers ──────────────────────────

    async def _handle_oauth_connection(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        try:
            data = await asyncio.wait_for(reader.read(4096), timeout=10)
            if not data:
                writer.close()
                return

            request_line = data.decode("utf-8", errors="replace").split("\r\n")[0]
            parts = request_line.split(" ")
            if len(parts) < 2:
                await self._send_http_response(writer, 400, "Bad request")
                return

            path = parts[1]
            parsed = urllib.parse.urlparse(path)

            # Ignore favicon and other irrelevant requests
            if parsed.path == "/favicon.ico":
                await self._send_http_response(writer, 404, "Not found")
                return

            if parsed.path == "/callback":
                await self._handle_oauth_callback(parsed.query, writer)
            elif parsed.path == "/auth":
                await self._handle_auth_redirect(parsed.query, writer)
            else:
                await self._send_landing_page(writer)
        except asyncio.TimeoutError:
            decky.logger.debug("OAuth connection timed out (no data received)")
            try:
                writer.close()
            except Exception:
                pass
        except Exception as e:
            decky.logger.error("OAuth connection error [%s]: %s", type(e).__name__, e)
            try:
                await self._send_http_response(writer, 500, f"Error: {e}")
            except Exception:
                pass

    async def _handle_oauth_callback(self, query: str, writer: asyncio.StreamWriter):
        try:
            qs = urllib.parse.parse_qs(query)
            code = qs.get("code", [None])[0]
            if not code:
                await self._send_http_response(writer, 400, "Missing code parameter.")
                return

            client_id = self._settings.get("spotify_client_id", "").strip()
            token_data = await _exec(_spotify_token_request, {
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": self._oauth_redirect_uri,
                "client_id": client_id,
                "code_verifier": self._pkce_verifier,
            })

            self._access_token = token_data["access_token"]
            self._refresh_token = token_data.get("refresh_token")
            self._token_expires_at = time.time() + token_data.get("expires_in", 3600) - 60
            self._token_retry_at = 0
            self._settings["access_token"] = self._access_token
            self._settings["refresh_token"] = self._refresh_token
            self._settings["token_expires_at"] = self._token_expires_at
            self._settings["scopes_version"] = CURRENT_SCOPES_VERSION
            _save_settings(self._settings)

            html = (
                '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">'
                '<title>Deckify</title></head>'
                '<body style="background:#121212;color:#fff;display:flex;justify-content:center;'
                'align-items:center;min-height:100vh;margin:0;font-family:-apple-system,sans-serif">'
                '<div style="text-align:center">'
                '<h2 style="color:#1DB954">Authorization Successful</h2>'
                '<p style="color:#b3b3b3">You can close this page and return to your Steam Deck.</p>'
                '</div></body></html>'
            )
            await self._send_html(writer, 200, html)
            self._start_api_poll()
            await decky.emit("oauth_complete", {"authenticated": True})
            decky.logger.info("OAuth complete, tokens saved")
        except Exception as e:
            decky.logger.error("OAuth callback error: %s", e)
            await self._send_http_response(writer, 500, f"Error: {e}")
        finally:
            await self._stop_oauth_server()

    async def _send_landing_page(self, writer: asyncio.StreamWriter):
        client_id = self._settings.get("spotify_client_id", "").strip()
        redirect_uri = self._oauth_redirect_uri or ""
        html = (
            '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">'
            '<title>Deckify - Spotify Login</title></head>'
            '<body style="background:#121212;color:#fff;display:flex;justify-content:center;'
            'align-items:center;min-height:100vh;margin:0;font-family:-apple-system,sans-serif">'
            '<div style="text-align:center;padding:24px;max-width:400px">'
            '<h1 style="font-size:28px;margin-bottom:8px">Deckify</h1>'
            '<p style="color:#b3b3b3;margin-bottom:24px">Connect your Spotify account to your Steam Deck</p>'
            '<form action="/auth" method="get" style="text-align:left">'
            '<label style="display:block;color:#b3b3b3;font-size:14px;margin-bottom:6px">Spotify Client ID</label>'
            f'<input name="client_id" type="text" required value="{escape(client_id, quote=True)}"'
            ' placeholder="e.g. a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"'
            ' style="width:100%;padding:12px;border:1px solid #333;border-radius:8px;'
            'background:#1a1a1a;color:#fff;font-size:14px;box-sizing:border-box;margin-bottom:16px">'
            '<p style="color:#666;font-size:12px;margin:0 0 16px">'
            'Redirect URI for your Spotify App settings:<br>'
            f'<code style="color:#999;word-break:break-all">{escape(redirect_uri)}</code></p>'
            '<button type="submit" style="width:100%;padding:14px;border:none;border-radius:24px;'
            'background:#1DB954;color:#fff;font-size:16px;font-weight:600;cursor:pointer">Continue</button>'
            '</form>'
            '<p style="color:#666;font-size:11px;margin-top:24px">'
            'Create an app at <span style="color:#999">developer.spotify.com</span></p>'
            '</div></body></html>'
        )
        await self._send_html(writer, 200, html)

    async def _handle_auth_redirect(self, query: str, writer: asyncio.StreamWriter):
        qs = urllib.parse.parse_qs(query)
        client_id = (qs.get("client_id", [""])[0]).strip()
        if not client_id:
            await self._send_http_response(writer, 400, "Missing client_id")
            return
        self._settings["spotify_client_id"] = client_id
        _save_settings(self._settings)
        decky.logger.info("Client ID saved from web form")
        await self._redirect_to_spotify(client_id, writer)

    async def _redirect_to_spotify(self, client_id: str, writer: asyncio.StreamWriter):
        verifier, challenge = _generate_pkce_pair()
        self._pkce_verifier = verifier
        params = urllib.parse.urlencode({
            "client_id": client_id,
            "response_type": "code",
            "redirect_uri": self._oauth_redirect_uri,
            "scope": SPOTIFY_SCOPES,
            "code_challenge_method": "S256",
            "code_challenge": challenge,
        })
        auth_url = f"{SPOTIFY_AUTH_URL}?{params}"
        header = f"HTTP/1.1 302 Found\r\nLocation: {auth_url}\r\nConnection: close\r\n\r\n"
        writer.write(header.encode("utf-8"))
        await writer.drain()
        writer.close()

    async def _send_html(self, writer: asyncio.StreamWriter, status: int, html: str):
        reason = {200: "OK", 400: "Bad Request", 500: "Internal Server Error"}.get(status, "OK")
        encoded = html.encode("utf-8")
        header = (
            f"HTTP/1.1 {status} {reason}\r\n"
            f"Content-Type: text/html; charset=utf-8\r\n"
            f"Content-Length: {len(encoded)}\r\n"
            f"Connection: close\r\n\r\n"
        )
        writer.write(header.encode("utf-8") + encoded)
        await writer.drain()
        writer.close()

    async def _send_http_response(self, writer: asyncio.StreamWriter, status: int, body: str):
        html = f"<html><body><h2>{body}</h2></body></html>"
        await self._send_html(writer, status, html)

    async def _stop_oauth_server(self):
        if self._oauth_server:
            self._oauth_server.close()
            await self._oauth_server.wait_closed()
            self._oauth_server = None
            decky.logger.info("OAuth callback server stopped")

    async def _ensure_token(self) -> str | None:
        if not self._access_token:
            return None
        if time.time() < self._token_expires_at:
            return self._access_token
        if not self._refresh_token:
            return None
        async with self._token_refresh_lock:
            # Double-check after acquiring lock — another coroutine may have refreshed
            if time.time() < self._token_expires_at:
                return self._access_token
            if not self._refresh_token or time.monotonic() < self._token_retry_at:
                return None
            try:
                client_id = self._settings.get("spotify_client_id", "").strip()
                token_data = await _exec(_spotify_token_request, {
                    "grant_type": "refresh_token",
                    "refresh_token": self._refresh_token,
                    "client_id": client_id,
                })
                self._access_token = token_data["access_token"]
                if "refresh_token" in token_data:
                    self._refresh_token = token_data["refresh_token"]
                self._token_expires_at = time.time() + token_data.get("expires_in", 3600) - 60
                self._settings["access_token"] = self._access_token
                self._settings["refresh_token"] = self._refresh_token
                self._settings["token_expires_at"] = self._token_expires_at
                _save_settings(self._settings)
                decky.logger.info("Token refreshed successfully")
                return self._access_token
            except urllib.error.HTTPError as e:
                self._token_retry_at = time.monotonic() + 30
                try:
                    error = json.loads(e.read()).get("error")
                except (ValueError, AttributeError, OSError):
                    error = None
                if e.code in (400, 401) and error in ("invalid_grant", "invalid_client"):
                    self._access_token = None
                    self._refresh_token = None
                    self._token_expires_at = 0
                    for key in ("access_token", "refresh_token", "token_expires_at"):
                        self._settings.pop(key, None)
                    _save_settings(self._settings)
                    decky.logger.warning("Spotify authorization expired (%s); reconnect required", error)
                    await decky.emit("auth_expired")
                else:
                    decky.logger.error("Token refresh failed: HTTP %s; retrying in 30s", e.code)
                return None
            except Exception as e:
                self._token_retry_at = time.monotonic() + 30
                decky.logger.error("Token refresh failed: %s", e)
                return None

    async def _poll_playback(self) -> bool:
        """Poll GET /me/player and emit events. Returns True if API call succeeded."""
        token = await self._ensure_token()
        if not token:
            return True  # not a network issue

        try:
            data = await _exec(_spotify_api_request, "me/player", token, "GET", {"additional_types": "episode"})
        except urllib.error.HTTPError as e:
            if e.code == 401:
                self._token_expires_at = 0  # force refresh on next call
                return True
            decky.logger.warning("Poll playback API error: %s", e.code)
            return True  # API reachable, not a network issue
        except Exception as e:
            decky.logger.warning("Poll playback failed: %s", e)
            return False

        # 204 No Content → no active playback
        if data is None:
            if self._poll_play_state is not None:
                self._poll_play_state = None
                self._poll_track_id = None
                event = {"event": "stopped"}
                self._last_event = event
                await decky.emit("librespot_event", event)
            return True

        item = data.get("item")
        if item is None:
            return True

        is_playing = data.get("is_playing", False)
        progress_ms = data.get("progress_ms", 0)
        track_id = item.get("id", "")
        duration_ms = item.get("duration_ms", 0)
        ctx = data.get("context") or {}
        self._context_uri = ctx.get("uri", "") if isinstance(ctx, dict) else ""

        shuffle_state = bool(data.get("shuffle_state", False))
        repeat_state = data.get("repeat_state", "off")
        if shuffle_state != self._shuffle_state or repeat_state != self._repeat_state:
            self._shuffle_state = shuffle_state
            self._repeat_state = repeat_state
            await decky.emit("playback_modes", {
                "shuffle_state": self._shuffle_state,
                "repeat_state": self._repeat_state,
            })

        if track_id != self._poll_track_id:
            self._poll_track_id = track_id
            is_liked = False
            if track_id and item.get("type") != "episode":
                checked = await self._check_tracks_liked(token, [track_id])
                is_liked = bool(checked.get(track_id, False))
            self._is_liked = is_liked

            if item.get("type") == "episode":
                show = item.get("show") or {}
                artist = show.get("name") or "Unknown"
                album_name = ""
                images = item.get("images") or show.get("images") or []
            else:
                album = item.get("album") or {}
                artist = ", ".join(a["name"] for a in item.get("artists", [])) or "Unknown"
                album_name = album.get("name", "")
                images = album.get("images") or []
            artwork_url = _image_url(images)
            meta = {
                "track_id": track_id,
                "name": item.get("name", "Unknown"),
                "artist": artist,
                "album": album_name,
                "artwork_url": artwork_url,
                "duration_ms": duration_ms,
                "uri": item.get("uri", ""),
                "is_liked": is_liked,
            }
            self._track_meta = meta
            await decky.emit("track_metadata", meta)

        new_state = "playing" if is_playing else "paused"
        if is_playing:
            # Always emit playing with latest position so frontend re-anchors
            event = {
                "event": "playing",
                "track_id": track_id,
                "position_ms": progress_ms,
                "duration_ms": duration_ms,
            }
            self._last_event = event
            await decky.emit("librespot_event", event)
        elif new_state != self._poll_play_state:
            event = {
                "event": "paused",
                "track_id": track_id,
                "position_ms": progress_ms,
                "duration_ms": duration_ms,
            }
            self._last_event = event
            await decky.emit("librespot_event", event)
        self._poll_play_state = new_state

        device = data.get("device", {})
        if device.get("id"):
            new_device = {
                "id": device["id"],
                "name": device.get("name", "Unknown"),
                "type": device.get("type", "unknown"),
            }
            prev_id = self._active_device.get("id") if self._active_device else None
            self._active_device = new_device
            if device["id"] != prev_id:
                await decky.emit("device_changed", new_device)
        volume_percent = device.get("volume_percent")
        if volume_percent is not None and volume_percent != self._poll_volume:
            self._poll_volume = volume_percent
            event = {"event": "volume_set", "volume": volume_percent}
            self._last_event = event
            await decky.emit("librespot_event", event)

        return True

    async def _refresh_audio_stream_info(self) -> None:
        """Inspect PipeWire/PulseAudio sink-inputs to report live sample rate and bit depth."""
        try:
            env = os.environ.copy()
            env["PULSE_SERVER"] = PULSE_SERVER
            res = await _exec(
                lambda: subprocess.run(
                    ["pactl", "list", "sink-inputs"],
                    capture_output=True, text=True, env=env,
                ),
                timeout=4,
            )
            self._audio_stream_info = _parse_pactl_sink_inputs(res.stdout)
        except Exception:
            pass

    async def _set_pa_volume_percent(self, percent: int) -> bool:
        """Set librespot's PulseAudio sink-input volume percentage."""
        if not self._process:
            return False
        pid = self._process.pid
        try:
            env = os.environ.copy()
            env["PULSE_SERVER"] = PULSE_SERVER

            def _list_sinks():
                return subprocess.run(
                    ["pactl", "list", "sink-inputs"],
                    capture_output=True, text=True, env=env,
                )

            result = await _exec(_list_sinks)
            sink_input_id = None
            current_id = None
            for line in result.stdout.splitlines():
                line = line.strip()
                if line.startswith("Sink Input #"):
                    current_id = line.split("#")[1]
                elif "application.process.id" in line and f'"{pid}"' in line:
                    sink_input_id = current_id
                    break
            if sink_input_id:
                def _set_vol():
                    return subprocess.run(
                        ["pactl", "set-sink-input-volume", sink_input_id, f"{int(percent)}%"],
                        capture_output=True, text=True, env=env,
                    )
                await _exec(_set_vol)
                return True
        except Exception as e:
            decky.logger.warning("Failed to set PA volume to %d%%: %s", percent, e)
        return False

    async def _boost_pa_volume(self):
        """Set librespot's PulseAudio sink-input to 150% for audible volume."""
        if await self._set_pa_volume_percent(150):
            decky.logger.info("PA volume boosted to 150%%")
            self._pa_volume_boosted = True

    async def _monitor_process(self):
        """Monitor active audio engine health and detect system sleep/wake."""
        self._stable_start = time.time()
        last_tick = time.time()
        MAX_CRASHES = 5
        CRASH_WINDOW = 600  # 10 minutes
        STABLE_THRESHOLD = 60  # seconds before resetting crash counter
        SUSPEND_THRESHOLD = 30  # a 3s tick taking >30s means system was suspended

        try:
            while True:
                now = time.time()
                elapsed = now - last_tick
                last_tick = now

                backend = self._settings.get("audio_backend", "librespot")
                active_proc = self._spotify_client_process if backend == "spotify_client" else self._process

                if elapsed > SUSPEND_THRESHOLD and active_proc and active_proc.poll() is None:
                    decky.logger.info(
                        "System wake detected (gap=%.0fs), restarting %s", elapsed, backend,
                    )
                    if backend == "spotify_client":
                        await self._kill_spotify_client()
                        await self.start_spotify_client()
                    else:
                        await self._kill_librespot()
                        await self.start_librespot()
                    self._crash_timestamps.clear()
                    self._stable_start = time.time()
                    last_tick = time.time()
                    continue

                if active_proc and active_proc.poll() is not None:
                    rc = active_proc.returncode
                    if backend == "spotify_client":
                        self._spotify_client_process = None
                    else:
                        self._process = None
                    msg = f"{backend} exited unexpectedly (code {rc})"
                    decky.logger.error(msg)

                    now = time.time()
                    if now - self._stable_start >= STABLE_THRESHOLD:
                        self._crash_timestamps.clear()
                    self._crash_timestamps = [
                        t for t in self._crash_timestamps if now - t < CRASH_WINDOW
                    ]
                    if len(self._crash_timestamps) < MAX_CRASHES:
                        self._crash_timestamps.append(now)
                        attempt = len(self._crash_timestamps)
                        delay = min(2 ** attempt, 30)
                        decky.logger.info(
                            "Auto-restart attempt %d/%d in %ds",
                            attempt, MAX_CRASHES, delay,
                        )
                        await decky.emit("librespot_status", {
                            "running": False,
                            "error": f"Crashed (code {rc}), restarting in {delay}s...",
                            "auto_restarting": True,
                        })
                        await asyncio.sleep(delay)
                        result = (
                            await self.start_spotify_client()
                            if backend == "spotify_client"
                            else await self.start_librespot()
                        )
                        if result.get("ok"):
                            self._stable_start = time.time()
                            continue
                        else:
                            await decky.emit("librespot_status", {
                                "running": False,
                                "error": f"Auto-restart failed: {result.get('error', 'unknown')}",
                            })
                            break
                    else:
                        decky.logger.error("Max auto-restart attempts reached")
                        await decky.emit("librespot_status", {
                            "running": False,
                            "error": f"Crashed (code {rc}). Auto-restart limit reached — restart manually.",
                        })
                        break

                if backend == "librespot" and not self._pa_volume_boosted:
                    await self._boost_pa_volume()
                elif backend == "spotify_client" and not self._settings.get("spotify_folder_tree"):
                    await self._sync_native_spotify_folders()
                    await self._sync_spotify_client_quality_cdp(str(self._settings.get("audio_quality", "320")))

                await self._refresh_audio_stream_info()
                await asyncio.sleep(3)
        except asyncio.CancelledError:
            pass

    async def _poll_api_loop(self):
        """Poll Spotify Web API for playback state, independent of librespot process."""
        try:
            while True:
                await self._poll_playback()
                await asyncio.sleep(3)
        except asyncio.CancelledError:
            pass
