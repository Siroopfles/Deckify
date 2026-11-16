import base64
import json
import os
import re
import socket
import subprocess
import urllib.parse
import urllib.request

from py_modules.common import SPOTIFY_CDP_PORT, _build_deck_command, decky


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


def _get_pactl_sinks() -> list[dict]:
    """Retrieve available audio output sinks via pactl."""
    try:
        proc = subprocess.run(
            ["pactl", "list", "short", "sinks"],
            capture_output=True,
            text=True,
            timeout=3,
        )
        if proc.returncode != 0:
            return []
        sinks = []
        for line in proc.stdout.splitlines():
            parts = line.strip().split("\t")
            if len(parts) >= 2:
                sinks.append({
                    "id": parts[0],
                    "name": parts[1],
                    "module": parts[2] if len(parts) > 2 else "",
                    "spec": parts[3] if len(parts) > 3 else "",
                    "state": parts[4] if len(parts) > 4 else "",
                })
        return sinks
    except Exception:
        return []


_SPOTIFY_SINK_ALLOWLIST = ("librespot", "spotify", "com.spotify.client", "deckify_eq_out")


def resolve_spotify_sink_input_ids(stdout: str, pids: set[str] | None = None) -> list[str]:
    """Resolve active Spotify/Deckify sink-input IDs with strict deny-list and allowlist filtering."""
    if not stdout:
        return []

    blocks: list[tuple[str, str]] = []
    curr_id: str | None = None
    curr_lines: list[str] = []
    for raw_line in stdout.splitlines():
        line = raw_line.strip()
        if line.startswith("Sink Input #"):
            if curr_id is not None:
                blocks.append((curr_id, "\n".join(curr_lines)))
            parts = line.split("#", 1)
            candidate = parts[1].strip() if len(parts) > 1 else ""
            curr_id = candidate if candidate.isdigit() else None
            curr_lines = []
        elif curr_id is not None:
            curr_lines.append(line)
    if curr_id is not None:
        blocks.append((curr_id, "\n".join(curr_lines)))

    # Deny-list filter first: never match Steam UI (steamwebhelper / Chromium)
    filtered_blocks: list[tuple[str, str, str]] = []
    for sink_id, block in blocks:
        low = block.lower()
        if "steamwebhelper" in low:
            continue
        if any(
            ("application.name" in line or "application.process.binary" in line)
            and "chromium" in line
            for line in low.splitlines()
        ):
            continue
        filtered_blocks.append((sink_id, block, low))

    matched: list[str] = []
    seen: set[str] = set()

    # Pass 1: exact PID priority
    if pids:
        for sink_id, block, _ in filtered_blocks:
            if any(f'"{p}"' in block for p in pids if p):
                if sink_id not in seen:
                    seen.add(sink_id)
                    matched.append(sink_id)

    # Pass 2: allowlist fallback on remaining filtered blocks
    for sink_id, _, low in filtered_blocks:
        if sink_id in seen:
            continue
        for line in low.splitlines():
            if (
                "application.name" in line
                or "media.name" in line
                or "node.name" in line
                or "application.process.binary" in line
            ) and any(token in line for token in _SPOTIFY_SINK_ALLOWLIST):
                seen.add(sink_id)
                matched.append(sink_id)
                break

    return matched


def _set_pactl_sink_input(target_sink: str, pids: set[str] | None = None) -> bool:
    """Move active Spotify/Deckify sink inputs to target_sink without touching Steam UI or game audio."""
    if not isinstance(target_sink, str) or not target_sink.strip() or target_sink.strip().startswith("-"):
        return False
    target = target_sink.strip()
    try:
        cmd, env = _build_deck_command(["pactl", "list", "sink-inputs"])
        proc = subprocess.run(
            cmd,
            env=env,
            capture_output=True,
            text=True,
            timeout=3,
        )
        if proc.returncode != 0:
            return False
        ids = resolve_spotify_sink_input_ids(proc.stdout, pids)
        if not ids:
            decky.logger.debug("No matching Spotify/Deckify sink-inputs found for target %s", target)
            return False
        success = True
        for input_id in ids:
            if not input_id.isdigit():
                continue
            move_cmd, move_env = _build_deck_command(["pactl", "move-sink-input", input_id, target])
            m_proc = subprocess.run(
                move_cmd,
                env=move_env,
                capture_output=True,
                timeout=3,
            )
            if m_proc.returncode != 0:
                success = False
        return success
    except Exception:
        return False


def _cdp_get_page_target(port: int = SPOTIFY_CDP_PORT, target_title: str | None = None) -> dict | None:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/json", timeout=2) as resp:
            targets = json.loads(resp.read())
        if target_title:
            for t in targets:
                if t.get("title") == target_title and t.get("webSocketDebuggerUrl"):
                    return t
        for t in targets:
            if t.get("type") == "page" and t.get("webSocketDebuggerUrl"):
                return t
        return targets[0] if targets else None
    except Exception:
        return None


def _cdp_call(
    method: str,
    params: dict | None = None,
    port: int = SPOTIFY_CDP_PORT,
    target_title: str | None = None,
    timeout: float = 4.0,
) -> dict | None:
    """Invoke a Chrome DevTools Protocol method on the headless Spotify Client over raw WebSocket."""
    target = _cdp_get_page_target(port, target_title=target_title)
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

        # Read WebSocket frames until we get JSON message with id=1
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

                # Reply to Ping (0x9) with masked Pong (0xA)
                if opcode == 0x9:
                    pong_mask = os.urandom(4)
                    pong_len = len(frame_data)
                    pong_hdr = bytearray([0x8A])
                    if pong_len < 126:
                        pong_hdr.append(0x80 | pong_len)
                    elif pong_len < 65536:
                        pong_hdr.append(0x80 | 126)
                        pong_hdr.extend(pong_len.to_bytes(2, "big"))
                    else:
                        pong_hdr.append(0x80 | 127)
                        pong_hdr.extend(pong_len.to_bytes(8, "big"))
                    pong_hdr.extend(pong_mask)
                    pong_masked = bytes(b ^ pong_mask[i % 4] for i, b in enumerate(frame_data))
                    sock.sendall(bytes(pong_hdr) + pong_masked)
                    continue

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


def _cdp_evaluate(
    expression: str,
    port: int = SPOTIFY_CDP_PORT,
    target_title: str | None = None,
    timeout: float = 5.0,
):
    """Evaluate a JavaScript expression inside the running Official Spotify Client via CDP."""
    if isinstance(target_title, (int, float)):
        timeout = float(target_title)
        target_title = None
    res = _cdp_call(
        "Runtime.evaluate",
        {"expression": expression, "awaitPromise": True, "returnByValue": True},
        port=port,
        target_title=target_title,
        timeout=timeout,
    )
    if isinstance(res, dict) and "result" in res:
        return res["result"].get("value")
    return None


def get_spotify_client_auth_status(port: int = SPOTIFY_CDP_PORT) -> dict:
    """Inspect headless Official Spotify Client state via CDP for login and auth status."""
    expr = """
    (() => {
      try {
        const mainEl = document.querySelector('#main');
        const userProfileEl = document.querySelector('[data-testid="user-widget-link"]') ||
                              document.querySelector('[data-testid="username-element"]') ||
                              document.querySelector('button[aria-label*="Profile"]');
        const loginBtn = document.querySelector('[data-testid="login-button"]') ||
                         document.querySelector('a[href*="/login"]');
        const authUrl = loginBtn ? (loginBtn.href || window.location.href) : null;
        const loggedIn = !!(mainEl || userProfileEl) && !loginBtn;
        return {
          running: true,
          logged_in: loggedIn,
          auth_url: authUrl,
          title: document.title || ""
        };
      } catch (e) {
        return { running: true, logged_in: false, error: String(e) };
      }
    })()
    """
    try:
        val = _cdp_evaluate(expr, port=port, timeout=3.0)
        if isinstance(val, dict):
            return {
                "ok": True,
                "running": True,
                "logged_in": val.get("logged_in", False),
                "auth_url": val.get("auth_url"),
            }
    except Exception:
        pass
    return {"ok": False, "running": False, "logged_in": False, "auth_url": None}


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


def _cdp_toggle_like_track(
    uri: str, liked: bool, port: int = SPOTIFY_CDP_PORT
) -> dict:
    """Add or remove a track in Liked Songs via Official Spotify Client CDP LibraryAPI."""
    target_uri_js = json.dumps(str(uri))
    is_liked_js = "true" if liked else "false"
    expr = f"""
    (async () => {{
      try {{
        const targetUri = {target_uri_js};
        const el = document.querySelector('#main');
        if (!el) return {{ ok: false, error: 'Spotify UI root not found' }};
        const fk = Object.keys(el).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactContainer$'));
        if (!fk) return {{ ok: false, error: 'React fiber root not found' }};
        const queue = [el[fk]];
        const visited = new Set();
        let registry = null;
        while (queue.length > 0 && !registry && visited.size < 5000) {{
          const n = queue.shift();
          if (!n || visited.has(n)) continue;
          visited.add(n);
          const val = n.memoizedProps?.value;
          if (val && val._map instanceof Map) {{ registry = val; break; }}
          if (val && typeof val.getRegistry === 'function') {{ registry = val.getRegistry(); break; }}
          if (n.child) queue.push(n.child);
          if (n.sibling) queue.push(n.sibling);
        }}
        if (!registry || !(registry._map instanceof Map)) return {{ ok: false, error: 'Platform registry not found' }};
        let libApi = null;
        for (const [k, v] of registry._map.entries()) {{
          if ((k?.description || String(k)) === 'LibraryAPI') {{
            libApi = v?.instance || v;
            break;
          }}
        }}
        if (!libApi) return {{ ok: false, error: 'LibraryAPI not found' }};
        const fn = {is_liked_js} ? libApi.add : libApi.remove;
        if (typeof fn !== 'function') return {{ ok: false, error: 'LibraryAPI method missing' }};
        try {{
          await fn.call(libApi, {{ uris: [targetUri] }});
        }} catch (e1) {{
          await fn.call(libApi, [targetUri]);
        }}
        return {{ ok: true }};
      }} catch (e) {{
        return {{ ok: false, error: String(e) }};
      }}
    }})()
    """
    try:
        res = _cdp_evaluate(expr, port=port, timeout=5.0)
        if isinstance(res, dict) and res.get("ok"):
            return {"ok": True}
        if isinstance(res, dict):
            return {"ok": False, "error": res.get("error") or "CDP LibraryAPI failed"}
        return {"ok": False, "error": "CDP LibraryAPI returned no result"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def _cdp_get_liked_tracks(
    offset: int = 0, fetch_all: bool = True, port: int = SPOTIFY_CDP_PORT
) -> dict:
    """Fetch Liked Songs via Official Spotify Client CDP LibraryAPI."""
    safe_offset = max(0, int(offset))
    fetch_all_js = "true" if fetch_all else "false"
    expr = f"""
    (async () => {{
      try {{
        const el = document.querySelector('#main');
        if (!el) return {{ ok: false, error: 'Spotify UI root not found' }};
        const fk = Object.keys(el).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactContainer$'));
        if (!fk) return {{ ok: false, error: 'React fiber root not found' }};
        const queue = [el[fk]];
        const visited = new Set();
        let registry = null;
        while (queue.length > 0 && !registry && visited.size < 5000) {{
          const n = queue.shift();
          if (!n || visited.has(n)) continue;
          visited.add(n);
          const val = n.memoizedProps?.value;
          if (val && val._map instanceof Map) {{ registry = val; break; }}
          if (val && typeof val.getRegistry === 'function') {{ registry = val.getRegistry(); break; }}
          if (n.child) queue.push(n.child);
          if (n.sibling) queue.push(n.sibling);
        }}
        if (!registry || !(registry._map instanceof Map)) return {{ ok: false, error: 'Platform registry not found' }};
        let libApi = null;
        for (const [k, v] of registry._map.entries()) {{
          if ((k?.description || String(k)) === 'LibraryAPI') {{
            libApi = v?.instance || v;
            break;
          }}
        }}
        if (!libApi || typeof libApi.getTracks !== 'function') return {{ ok: false, error: 'LibraryAPI.getTracks not found' }};
        const parseImg = (images) => {{
          const raw = images?.[0]?.url || '';
          if (!raw) return null;
          if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
          if (raw.startsWith('spotify:image:')) return 'https://i.scdn.co/image/' + raw.split(':')[2];
          if (raw.startsWith('spotify:mosaic:')) return 'https://i.scdn.co/image/' + raw.split(':')[2];
          return null;
        }};
        const startOffset = {safe_offset};
        const fetchAll = {fetch_all_js};
        const limit = 100;
        let curOffset = startOffset;
        let total = 0;
        const tracks = [];
        while (true) {{
          const page = await libApi.getTracks({{ offset: curOffset, limit }});
          const items = Array.isArray(page?.items) ? page.items : [];
          total = typeof page?.totalLength === 'number' ? page.totalLength : (typeof page?.total === 'number' ? page.total : items.length);
          for (const t of items) {{
            if (!t) continue;
            const uri = t.uri || '';
            const tid = t.id || (uri.includes(':') ? uri.split(':').pop() : '');
            const artists = Array.isArray(t.artists) ? t.artists.map(a => a?.name || '').filter(Boolean).join(', ') : '';
            const artistUri = t.artists?.[0]?.uri || '';
            const artistId = t.artists?.[0]?.id || (artistUri.includes(':') ? artistUri.split(':').pop() : '');
            const albumUri = t.album?.uri || '';
            const albumId = t.album?.id || (albumUri.includes(':') ? albumUri.split(':').pop() : '');
            const imgUrl = parseImg(t.album?.images || t.images);
            tracks.push({{
              id: tid,
              name: t.name || '',
              artist: artists,
              album: t.album?.name || '',
              artist_id: artistId,
              album_id: albumId,
              uri: uri,
              duration_ms: t.duration?.milliseconds ?? t.duration_ms ?? 0,
              image_url: imgUrl,
              artwork_url: imgUrl,
              is_liked: true
            }});
          }}
          curOffset += items.length;
          if (!fetchAll || items.length === 0 || tracks.length >= total || tracks.length >= 1000) break;
        }}
        return {{ ok: true, tracks, total, offset: startOffset }};
      }} catch (e) {{
        return {{ ok: false, error: String(e) }};
      }}
    }})()
    """
    try:
        res = _cdp_evaluate(expr, port=port, timeout=8.0)
        if isinstance(res, dict) and res.get("ok"):
            return res
        if isinstance(res, dict):
            return {"ok": False, "error": res.get("error") or "CDP LibraryAPI failed"}
        return {"ok": False, "error": "CDP LibraryAPI returned no result"}
    except Exception as e:
        return {"ok": False, "error": str(e)}
