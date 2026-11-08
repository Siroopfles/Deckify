import base64
import json
import os
import re
import socket
import urllib.parse
import urllib.request

from py_modules.common import SPOTIFY_CDP_PORT, STEAM_CEF_PORT


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
    """Invoke a Chrome DevTools Protocol method on the headless Spotify Client or Steam CEF over raw WebSocket."""
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
    """Evaluate a JavaScript expression inside the running Official Spotify Client or Steam CEF via CDP."""
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


def _inject_steam_gamepad_bridge_sync() -> bool:
    """Inject controller event bridge into Steam's SharedJSContext via CDP port 8080."""
    expr = """
    (() => {
      if (window.__deckify_steam_gamepad_bridge_installed) {
        return { ok: true, already: true };
      }
      const fc = window.FocusNavController;
      const src = fc && fc.m_rgGamepadInputSources && fc.m_rgGamepadInputSources[0];
      if (!src || !src.RegisterForGamepadButtonDown) {
        return { ok: false, error: "no_src" };
      }
      const buttonMap = {
        1: "a",
        2: "b",
        3: "x",
        4: "y",
        5: "lb",
        6: "rb",
        7: "lt",
        8: "rt",
        9: "up",
        10: "down",
        11: "left",
        12: "right",
        13: "select",
        14: "start"
      };
      window.__deckify_steam_gamepad_bridge_installed = true;
      src.RegisterForGamepadButtonDown((btn, srcType, ctrlIdx, isRepeat) => {
        const isDir = btn >= 9 && btn <= 12;
        if (isRepeat && !isDir) return;
        const mapped = buttonMap[btn];
        if (!mapped) return;
        fetch("http://127.0.0.1:39282/api/gamepad/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ events: [mapped] })
        }).catch(() => {});
      });
      return { ok: true, installed: true };
    })()
    """
    try:
        val = _cdp_evaluate(expr, port=STEAM_CEF_PORT, target_title="SharedJSContext", timeout=3.0)
        return isinstance(val, dict) and val.get("ok") is True
    except Exception:
        return False
