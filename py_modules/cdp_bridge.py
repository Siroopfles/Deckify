import json
import os
import re

from py_modules.common import ALLOWED_PLAYBACK_SPEEDS, DECK_HOME, SPOTIFY_CDP_PORT, decky

DEFAULT_CDP_TIMEOUT = 4.0
DISCOVERY_MIXES_CACHE_FILE = os.path.join(DECK_HOME, ".cache", "deckify", "discovery_mixes.json")

_REGISTRY_PREAMBLE_JS = """
const parseImg = (images) => {
  const raw = images?.[0]?.url || (typeof images?.[0] === 'string' ? images[0] : '') || '';
  if (!raw) return null;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  if (raw.startsWith('spotify:image:')) return 'https://i.scdn.co/image/' + raw.split(':')[2];
  if (raw.startsWith('spotify:mosaic:')) return 'https://i.scdn.co/image/' + raw.split(':')[2];
  return null;
};
const isValidRegistry = (reg) => Boolean(reg && (reg._map instanceof Map || typeof reg.entries === 'function'));
const resolveRegistry = () => {
  const el = document.querySelector('#main');
  if (!el) return null;
  if (window.__deckifyRegistry && window.__deckifyRegistryEl === el && isValidRegistry(window.__deckifyRegistry)) {
    return window.__deckifyRegistry;
  }
  const fk = Object.keys(el).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactContainer$'));
  if (!fk) return null;
  const queue = [el[fk]];
  const visited = new Set();
  let registry = null;
  while (queue.length > 0 && !registry && visited.size < 5000) {
    const n = queue.shift();
    if (!n || visited.has(n)) continue;
    visited.add(n);
    const val = n.memoizedProps?.value;
    if (val && val._map instanceof Map) { registry = val; break; }
    if (val && typeof val.getRegistry === 'function') { registry = val.getRegistry(); break; }
    const plat = n.memoizedProps?.platform;
    if (plat && typeof plat.getRegistry === 'function') { registry = plat.getRegistry(); break; }
    if (n.child) queue.push(n.child);
    if (n.sibling) queue.push(n.sibling);
  }
  if (!isValidRegistry(registry)) return null;
  window.__deckifyRegistry = registry;
  window.__deckifyRegistryEl = el;
  return registry;
};
const getService = (name) => {
  const reg = resolveRegistry();
  if (!reg) return null;
  const regMap = reg._map instanceof Map ? reg._map : reg;
  if (!regMap || typeof regMap.entries !== 'function') return null;
  for (const [k, v] of regMap.entries()) {
    if ((k?.description || String(k)) === name) {
      return v?.instance || v;
    }
  }
  return null;
};
"""


def is_spotify_client_running(plugin) -> bool:
    """Return True only when Official Spotify Client backend is selected and running."""
    if plugin is None:
        return False
    settings = getattr(plugin, "_settings", None)
    if not isinstance(settings, dict) or settings.get("audio_backend") != "spotify_client":
        return False
    proc = getattr(plugin, "_spotify_client_process", None)
    return bool(proc is not None and proc.poll() is None)


def load_discovery_mixes_cache(cache_file: str | None = None) -> dict:
    """Load persisted discovery mixes cache from disk, returning {} on missing/corrupt data."""
    target = cache_file or DISCOVERY_MIXES_CACHE_FILE
    if not os.path.exists(target):
        return {}
    try:
        with open(target, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def save_discovery_mixes_cache(data: dict, cache_file: str | None = None) -> None:
    """Atomically persist discovery mixes cache to disk via .tmp + os.replace."""
    target = cache_file or DISCOVERY_MIXES_CACHE_FILE
    parent = os.path.dirname(target)
    if parent:
        os.makedirs(parent, exist_ok=True)
    tmp_path = f"{target}.{os.getpid()}.tmp"
    try:
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(data if isinstance(data, dict) else {}, f, indent=2)
        os.replace(tmp_path, target)
    except Exception:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass
        raise


def evaluate_with_registry(
    body_js: str,
    port: int = SPOTIFY_CDP_PORT,
    timeout: float = DEFAULT_CDP_TIMEOUT,
    eval_fn=None,
) -> dict:
    """Evaluate a JS body with cached Platform.Registry preamble and clean error fallback."""
    if eval_fn is None:
        from py_modules.engine import _cdp_evaluate

        eval_fn = _cdp_evaluate

    expr = f"""
    (async () => {{
      try {{
        {_REGISTRY_PREAMBLE_JS}
        {body_js}
      }} catch (e) {{
        return {{ ok: false, error: String(e?.message || e) }};
      }}
    }})()
    """
    try:
        res = eval_fn(expr, port=port, timeout=timeout)
        if isinstance(res, dict):
            return res
        return {"ok": False, "error": "CDP returned no result"}
    except Exception as e:
        decky.logger.debug("CDP evaluate_with_registry failed: %s", e)
        return {"ok": False, "error": str(e)}


def cdp_fetch_folder_tree(
    port: int = SPOTIFY_CDP_PORT,
    timeout: float = 6.0,
    eval_fn=None,
) -> list[dict] | None:
    """Extract the user's recursive folder & playlist tree from RootlistAPI via CDP."""
    body_js = """
    const rootlistAPI = getService('RootlistAPI');
    if (!rootlistAPI || typeof rootlistAPI.getContents !== 'function') {
      return { ok: false, error: 'RootlistAPI unavailable' };
    }
    const root = await rootlistAPI.getContents({ limit: 5000, flatten: false });
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
    const tree = (root.items || []).filter(i => i.type === 'folder').map(mapFolder).filter(f => f.playlists.length > 0 || f.subfolders.length > 0);
    return { ok: true, tree };
    """
    if eval_fn is None:
        from py_modules.engine import _cdp_evaluate

        eval_fn = _cdp_evaluate

    # Support legacy mocks that return a list directly from _cdp_evaluate
    expr = f"""
    (async () => {{
      try {{
        {_REGISTRY_PREAMBLE_JS}
        {body_js}
      }} catch (e) {{
        return {{ ok: false, error: String(e?.message || e) }};
      }}
    }})()
    """
    try:
        res = eval_fn(expr, port=port, timeout=timeout)
        if isinstance(res, list):
            return res
        if isinstance(res, dict) and res.get("ok") and isinstance(res.get("tree"), list):
            return res["tree"]
    except Exception:
        pass
    return None


def cdp_toggle_like_track(
    uri: str,
    liked: bool = True,
    port: int = SPOTIFY_CDP_PORT,
    timeout: float = 5.0,
    eval_fn=None,
) -> dict:
    """Add or remove a track in Liked Songs via Official Spotify Client CDP LibraryAPI."""
    target_uri_js = json.dumps(str(uri))
    is_liked_js = "true" if liked else "false"
    body_js = f"""
    const targetUri = {target_uri_js};
    const libApi = getService('LibraryAPI');
    if (!libApi) return {{ ok: false, error: 'LibraryAPI not found' }};
    const fn = {is_liked_js} ? libApi.add : libApi.remove;
    if (typeof fn !== 'function') return {{ ok: false, error: 'LibraryAPI method missing' }};
    try {{
      await fn.call(libApi, {{ uris: [targetUri] }});
    }} catch (e1) {{
      await fn.call(libApi, [targetUri]);
    }}
    return {{ ok: true }};
    """
    res = evaluate_with_registry(body_js, port=port, timeout=timeout, eval_fn=eval_fn)
    if res.get("ok"):
        return {"ok": True}
    return {"ok": False, "error": res.get("error") or "CDP LibraryAPI failed"}


def cdp_get_liked_tracks(
    offset: int = 0,
    fetch_all: bool = True,
    limit: int = 100,
    port: int = SPOTIFY_CDP_PORT,
    timeout: float = 8.0,
    eval_fn=None,
) -> dict:
    """Fetch Liked Songs via Official Spotify Client CDP LibraryAPI."""
    safe_offset = max(0, int(offset))
    safe_limit = max(1, min(100, int(limit)))
    fetch_all_js = "true" if fetch_all else "false"
    body_js = f"""
    const libApi = getService('LibraryAPI');
    if (!libApi || typeof libApi.getTracks !== 'function') return {{ ok: false, error: 'LibraryAPI.getTracks not found' }};
    const startOffset = {safe_offset};
    const fetchAll = {fetch_all_js};
    const limit = {safe_limit};
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
    """
    res = evaluate_with_registry(body_js, port=port, timeout=timeout, eval_fn=eval_fn)
    if res.get("ok"):
        return res
    return {"ok": False, "error": res.get("error") or "CDP LibraryAPI failed"}


def cdp_get_playlist_tracks(
    playlist_id: str,
    offset: int = 0,
    fetch_all: bool = True,
    port: int = SPOTIFY_CDP_PORT,
    timeout: float = 8.0,
    eval_fn=None,
) -> dict:
    """Fetch playlist tracks via Official Spotify Client CDP PlaylistAPI."""
    pid = str(playlist_id or "").strip()
    if pid.startswith("spotify:playlist:"):
        pid = pid.split(":")[-1]
    uri_js = json.dumps(f"spotify:playlist:{pid}")
    safe_offset = max(0, int(offset))
    fetch_all_js = "true" if fetch_all else "false"
    body_js = f"""
    const playlistApi = getService('PlaylistAPI');
    if (!playlistApi) return {{ ok: false, error: 'PlaylistAPI not found' }};
    const uri = {uri_js};
    const startOffset = {safe_offset};
    const fetchAll = {fetch_all_js};
    const limit = 100;
    let curOffset = startOffset;
    let total = 0;
    let meta = null;
    let lastPage = null;
    if (typeof playlistApi.getMetadata === 'function') {{
      try {{
        meta = await playlistApi.getMetadata(uri);
      }} catch (e) {{}}
    }}
    const tracks = [];
    while (true) {{
      let page = null;
      if (typeof playlistApi.getContents === 'function') {{
        page = await playlistApi.getContents(uri, {{ offset: curOffset, limit }});
      }} else if (typeof playlistApi.getPlaylist === 'function') {{
        const pl = await playlistApi.getPlaylist(uri, {{}}, {{ offset: curOffset, limit }});
        if (!meta && pl) meta = pl?.metadata || pl;
        page = pl?.contents || pl;
      }} else {{
        return {{ ok: false, error: 'PlaylistAPI.getContents/getPlaylist not found' }};
      }}
      if (page) lastPage = page;
      const items = Array.isArray(page?.items) ? page.items : [];
      total = typeof page?.totalLength === 'number' ? page.totalLength : (typeof page?.total === 'number' ? page.total : items.length);
      for (const entry of items) {{
        const t = entry?.item || entry?.track || entry;
        if (!t || (!t.uri && !t.name)) continue;
        const turi = t.uri || '';
        const tid = t.id || (turi.includes(':') ? turi.split(':').pop() : '');
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
          uri: turi,
          duration_ms: t.duration?.milliseconds ?? t.duration_ms ?? 0,
          image_url: imgUrl,
          artwork_url: imgUrl
        }});
      }}
      curOffset += items.length;
      if (!fetchAll || items.length === 0 || tracks.length >= total || tracks.length >= 1000) break;
    }}
    if (!meta && typeof playlistApi.getPlaylist === 'function') {{
      try {{
        const pl = await playlistApi.getPlaylist(uri, {{}}, {{ offset: startOffset, limit: 1 }});
        meta = pl?.metadata || pl;
      }} catch (e) {{}}
    }}
    const playlistName = String(meta?.name || meta?.title || lastPage?.name || '').trim();
    const playlistDescription = String(meta?.description || lastPage?.description || '').trim();
    return {{ ok: true, tracks, total: total || tracks.length, offset: startOffset, playlist_name: playlistName, playlist_description: playlistDescription }};
    """
    res = evaluate_with_registry(body_js, port=port, timeout=timeout, eval_fn=eval_fn)
    if res.get("ok"):
        return res
    return {"ok": False, "error": res.get("error") or "CDP PlaylistAPI failed"}


def cdp_get_saved_episodes(
    offset: int = 0,
    limit: int = 50,
    port: int = SPOTIFY_CDP_PORT,
    timeout: float = 8.0,
    eval_fn=None,
) -> dict:
    """Fetch Your Episodes (saved podcast episodes) via Official Spotify Client CDP."""
    safe_offset = max(0, int(offset))
    safe_limit = max(1, min(100, int(limit)))
    body_js = f"""
    const libApi = getService('LibraryAPI');
    const playlistApi = getService('PlaylistAPI');
    if (!libApi || !playlistApi || typeof playlistApi.getContents !== 'function') {{
      return {{ ok: false, error: 'LibraryAPI/PlaylistAPI unavailable' }};
    }}
    let yeUri = 'spotify:collection:podcasts:episodes';
    try {{
      const lib = await libApi.getContents({{ limit: 50 }});
      const ye = (lib?.items || []).find(i => i && i.type === 'your-episodes');
      if (ye?.uri) yeUri = ye.uri;
    }} catch (e) {{}}
    const page = await playlistApi.getContents(yeUri, {{ offset: {safe_offset}, limit: {safe_limit} }});
    const items = Array.isArray(page?.items) ? page.items : [];
    const total = typeof page?.totalLength === 'number' ? page.totalLength : items.length;
    const episodes = [];
    for (const ep of items) {{
      if (!ep || (!ep.uri && !ep.name)) continue;
      const uri = ep.uri || '';
      const eid = ep.id || (uri.includes(':') ? uri.split(':').pop() : '');
      const durMs = ep.duration?.milliseconds ?? ep.duration_ms ?? 0;
      const timeLeftMs = ep.playedState?.timeLeft?.milliseconds ?? 0;
      const fullyPlayed = ep.playedState?.state === 'COMPLETED';
      const resumeMs = (!fullyPlayed && durMs > 0 && timeLeftMs > 0 && timeLeftMs < durMs) ? (durMs - timeLeftMs) : 0;
      const imgUrl = parseImg(ep.images || ep.show?.images);
      episodes.push({{
        id: eid,
        name: ep.name || '',
        show_name: ep.show?.name || '',
        uri,
        duration_ms: durMs,
        image_url: imgUrl,
        artwork_url: imgUrl,
        resume_position_ms: resumeMs,
        fully_played: fullyPlayed
      }});
    }}
    return {{ ok: true, episodes, total, offset: {safe_offset} }};
    """
    res = evaluate_with_registry(body_js, port=port, timeout=timeout, eval_fn=eval_fn)
    if res.get("ok"):
        return res
    return {"ok": False, "error": res.get("error") or "CDP Your Episodes failed"}


def cdp_set_playback_speed(
    speed: float,
    port: int = SPOTIFY_CDP_PORT,
    timeout: float = 5.0,
    eval_fn=None,
) -> dict:
    """Set playback speed via Official Spotify Client CDP PlayerAPI.setSpeed."""
    if isinstance(speed, bool):
        return {"ok": False, "error": "Unsupported playback speed"}
    try:
        safe_speed = float(speed)
    except (TypeError, ValueError):
        return {"ok": False, "error": "Unsupported playback speed"}
    if safe_speed not in ALLOWED_PLAYBACK_SPEEDS:
        return {"ok": False, "error": "Unsupported playback speed"}

    body_js = f"""
    const playerApi = getService('PlayerAPI');
    if (!playerApi || typeof playerApi.setSpeed !== 'function') {{
      return {{ ok: false, error: 'PlayerAPI.setSpeed unavailable' }};
    }}
    await playerApi.setSpeed({safe_speed});
    return {{ ok: true, speed: {safe_speed} }};
    """
    res = evaluate_with_registry(body_js, port=port, timeout=timeout, eval_fn=eval_fn)
    if res.get("ok"):
        return res
    return {"ok": False, "error": res.get("error") or "CDP PlayerAPI.setSpeed failed"}


def cdp_set_playlist_mix(
    playlist_id: str,
    enabled: bool = True,
    play_now: bool = True,
    port: int = SPOTIFY_CDP_PORT,
    timeout: float = 6.0,
    eval_fn=None,
) -> dict:
    """Toggle native Spotify playlist mixing via Official Spotify Client CDP PlaylistMixingAPI."""
    pid = str(playlist_id or "").strip()
    if pid.startswith("spotify:playlist:"):
        pid = pid.split(":")[-1]
    if not pid:
        return {"ok": False, "error": "Missing playlist_id"}
    uri = f"spotify:playlist:{pid}"
    enabled_js = "true" if enabled else "false"
    play_js = "true" if play_now else "false"

    body_js = f"""
    const mixApi = getService('PlaylistMixingAPI');
    const playerApi = getService('PlayerAPI');
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
    """
    res = evaluate_with_registry(body_js, port=port, timeout=timeout, eval_fn=eval_fn)
    if res.get("ok"):
        return res
    return {"ok": False, "error": res.get("error") or "Official Spotify Client did not respond over CDP"}


_AI_DJ_PLAYLIST_ID = "37i9dQZF1EYkqdzj48dyYq"
_AI_DJ_NAME_RE = re.compile(r"^(?:spotify\s+)?(?:ai\s+)?dj$", re.IGNORECASE)
_BLEND_NAME_RE = re.compile(r"\bblend\b", re.IGNORECASE)
_CORE_MIX_NAME_RE = re.compile(
    r"\b(daylist|discover weekly|release radar|daily mix(?:\s*\d+)?|on repeat|repeat rewind)\b",
    re.IGNORECASE,
)
_GENERIC_MIX_NAME_RE = re.compile(r"\bmix\b", re.IGNORECASE)


def _classify_discovery_kind(pid: str, uri: str, name: str, owner: str = "") -> str:
    """Classify a discovery playlist as 'dj', 'blend', 'core', or 'editorial'."""
    clean_uri = str(uri or "").strip()
    clean_pid = str(pid or (clean_uri.split(":")[-1] if ":" in clean_uri else "")).strip()
    clean_name = str(name or "").strip()
    clean_owner = str(owner or "").strip().lower()

    if clean_pid == _AI_DJ_PLAYLIST_ID or clean_uri == f"spotify:playlist:{_AI_DJ_PLAYLIST_ID}" or _AI_DJ_NAME_RE.match(clean_name):
        return "dj"
    if clean_pid.startswith("37i9dQZF1EJ") or _BLEND_NAME_RE.search(clean_name):
        return "blend"
    if _CORE_MIX_NAME_RE.search(clean_name):
        return "core"
    if clean_owner == "spotify" and _GENERIC_MIX_NAME_RE.search(clean_name):
        return "core"
    return "editorial"


def cdp_play_context(
    uri: str,
    port: int = SPOTIFY_CDP_PORT,
    timeout: float = DEFAULT_CDP_TIMEOUT,
    eval_fn=None,
) -> dict:
    """Start playback of a Spotify playlist/context URI via CDP PlayerAPI.play."""
    clean_uri = str(uri or "").strip()
    if not clean_uri.startswith("spotify:playlist:"):
        return {"ok": False, "error": "Invalid playlist URI"}

    body_js = f"""
    const uri = {json.dumps(clean_uri)};
    const playerApi = getService('PlayerAPI');
    if (!playerApi || typeof playerApi.play !== 'function') {{
      return {{ ok: false, error: 'PlayerAPI.play unavailable' }};
    }}
    try {{
      await playerApi.play({{ uri }}, {{}}, {{}});
      return {{ ok: true, uri }};
    }} catch (e) {{
      return {{ ok: false, error: e?.message || String(e) }};
    }}
    """
    res = evaluate_with_registry(body_js, port=port, timeout=timeout, eval_fn=eval_fn)
    if res.get("ok"):
        return res
    return {"ok": False, "error": res.get("error") or "CDP PlayerAPI.play failed"}


def cdp_fetch_discovery_mixes(
    port: int = SPOTIFY_CDP_PORT,
    timeout: float = DEFAULT_CDP_TIMEOUT,
    eval_fn=None,
) -> dict:
    """Probe HomeAPI / GraphQL / RootlistAPI / SearchAPI for personalized discovery mixes."""
    body_js = """
    const seen = new Set();
    const items = [];
    const warnings = [];
    const djRe = /^(?:spotify\\s+)?(?:ai\\s+)?dj$/i;
    const blendRe = /\\bblend\\b/i;
    const coreRe = /\\b(daylist|discover weekly|release radar|daily mix(?:\\s*\\d+)?|on repeat|repeat rewind)\\b/i;
    const genericMixRe = /\\bmix\\b/i;
    const classifyKind = (id, uri, name, owner) => {
      if (id === '37i9dQZF1EYkqdzj48dyYq' || uri === 'spotify:playlist:37i9dQZF1EYkqdzj48dyYq' || djRe.test(name)) {
        return 'dj';
      }
      if (id.startsWith('37i9dQZF1EJ') || blendRe.test(name)) {
        return 'blend';
      }
      if (coreRe.test(name)) {
        return 'core';
      }
      if (String(owner).toLowerCase() === 'spotify' && genericMixRe.test(name)) {
        return 'core';
      }
      return 'editorial';
    };
    const pushItem = (raw) => {
      if (!raw || typeof raw !== 'object') return;
      const item = raw?.data && typeof raw.data === 'object' ? raw.data : raw;
      const uri = item.uri || raw.uri || '';
      const id = item.id || (uri.includes(':') ? uri.split(':').pop() : '');
      const name = (item.name || item.title || '').trim();
      if (!uri && !id) return;
      const normUri = uri || (id ? 'spotify:playlist:' + id : '');
      if (!normUri.includes(':playlist:')) return;
      const owner = item.owner?.username || item.owner?.id || item.owner?.name || item.ownerV2?.data?.name || item.ownerV2?.data?.username || item.owner?.data?.name || (typeof item.owner === 'string' ? item.owner : '') || '';
      if (!name || seen.has(normUri)) return;
      const pid = id || normUri.split(':').pop();
      const kind = classifyKind(pid, normUri, name, owner);
      if (kind === 'editorial') return;
      seen.add(normUri);
      items.push({
        id: pid,
        name,
        uri: normUri,
        image_url: parseImg(item.images?.items?.[0]?.sources || item.images || item.coverArt?.sources || item.image),
        subtitle: item.description || item.subtitle || (owner ? 'Made by ' + owner : 'Made for you'),
        type: 'playlist',
        owner: owner || 'Spotify',
        kind
      });
    };
    const extractHomeSections = (home) => {
      const sections = home?.sections || home?.items || home?.home?.sectionContainer?.sections?.items || home?.data?.home?.sectionContainer?.sections?.items || [];
      for (const sec of (Array.isArray(sections) ? sections : [])) {
        const secItems = sec?.items || sec?.sectionItems?.items || sec?.content?.items || [];
        for (const entry of (Array.isArray(secItems) ? secItems : [])) {
          const node = entry?.content?.data?.data || entry?.content?.data || entry?.data?.data || entry?.data || entry?.item?.data || entry?.item || entry;
          pushItem(node);
        }
      }
    };

    const homeApi = getService('HomeAPI');
    if (homeApi) {
      const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return 'UTC'; } })();
      const attempts = [
        () => typeof homeApi.getHome === 'function' ? homeApi.getHome({ timeZone: tz }) : null,
        () => typeof homeApi.getHome === 'function' ? homeApi.getHome({}) : null,
        () => typeof homeApi.getSections === 'function' ? homeApi.getSections({ timeZone: tz }) : null,
        () => typeof homeApi.getSections === 'function' ? homeApi.getSections({}) : null,
        () => typeof homeApi.getHomeSections === 'function' ? homeApi.getHomeSections({ timeZone: tz }) : null,
      ];
      for (const fn of attempts) {
        try {
          const home = await fn();
          if (home) extractHomeSections(home);
        } catch (e) {
          warnings.push('HomeAPI: ' + (e?.message || String(e)));
        }
      }
    }

    const hasCoreMix = (needle) => items.some((it) => it.kind === 'core' && it.name.toLowerCase().includes(needle));
    const missingCore = () => ['discover weekly', 'release radar', 'daily mix', 'daylist', 'on repeat'].filter((n) => !hasCoreMix(n));

    if (missingCore().length > 0) {
      const gql = getService('GraphQL');
      if (gql && typeof gql.query === 'function') {
        try {
          const defs = gql.Definitions || gql.definitions || window.Spicetify?.GraphQL?.Definitions || {};
          const homeDef = defs.home || defs.Home || null;
          if (homeDef) {
            const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return 'UTC'; } })();
            const res = await gql.query(homeDef, { timeZone: tz, sectionItemsLimit: 20 });
            extractHomeSections(res);
          }
        } catch (e) {
          warnings.push('GraphQL: ' + (e?.message || String(e)));
        }
      }
    }

    const rootlistApi = getService('RootlistAPI');
    if (rootlistApi && typeof rootlistApi.getContents === 'function') {
      try {
        const root = await rootlistApi.getContents({ limit: 5000, flatten: true });
        for (const child of (root?.items || [])) {
          if (child?.type === 'playlist') pushItem(child);
        }
      } catch (e) {
        warnings.push('RootlistAPI: ' + (e?.message || String(e)));
      }
    }

    const stillMissing = missingCore();
    if (stillMissing.length > 0) {
      const searchApi = getService('SearchAPI');
      if (searchApi) {
        const queryMap = {
          'discover weekly': 'Discover Weekly',
          'release radar': 'Release Radar',
          'daily mix': 'Daily Mix',
          'daylist': 'Daylist',
          'on repeat': 'On Repeat'
        };
        for (const key of stillMissing) {
          const q = queryMap[key];
          try {
            let res = null;
            if (typeof searchApi.search === 'function') {
              res = await searchApi.search({ searchTerm: q, limit: 10 });
            } else if (typeof searchApi.getSearchResults === 'function') {
              res = await searchApi.getSearchResults({ query: q, limit: 10 });
            } else if (typeof searchApi.searchPlaylists === 'function') {
              res = await searchApi.searchPlaylists(q, { limit: 10 });
            }
            const plList = res?.playlists?.items || res?.playlists || res?.results?.playlists?.items || res?.items || [];
            for (const p of (Array.isArray(plList) ? plList : [])) {
              pushItem(p?.data || p?.item?.data || p?.item || p);
            }
          } catch (e) {
            warnings.push('SearchAPI(' + q + '): ' + (e?.message || String(e)));
          }
        }
      }
    }

    return { ok: true, items, warnings };
    """
    res = evaluate_with_registry(body_js, port=port, timeout=timeout, eval_fn=eval_fn)
    if not res.get("ok"):
        return {"ok": False, "items": [], "error": res.get("error") or "CDP discovery mixes unavailable"}

    warnings = res.get("warnings") or []
    if warnings:
        decky.logger.debug("cdp_fetch_discovery_mixes warnings: %s", warnings)

    raw_items = res.get("items") or []
    normalized = []
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        uri = str(item.get("uri") or "")
        pid = str(item.get("id") or (uri.split(":")[-1] if ":" in uri else ""))
        if not pid and not uri:
            continue
        norm_uri = uri or f"spotify:playlist:{pid}"
        name = str(item.get("name") or "")
        owner = str(item.get("owner") or "Spotify")
        kind = _classify_discovery_kind(pid, norm_uri, name, owner)
        if kind == "editorial":
            continue
        normalized.append(
            {
                "id": pid,
                "name": name,
                "uri": norm_uri,
                "image_url": item.get("image_url"),
                "subtitle": str(item.get("subtitle") or "Made for you"),
                "type": "playlist",
                "owner": owner,
                "kind": kind,
            }
        )
    return {"ok": True, "items": normalized, "warnings": warnings}


def cdp_fetch_station_radio_uris(
    seed_type: str,
    seed_id: str,
    seed_uri: str = "",
    port: int = SPOTIFY_CDP_PORT,
    timeout: float = DEFAULT_CDP_TIMEOUT,
    eval_fn=None,
) -> list[str]:
    """Resolve up to 30 unique spotify:track: URIs for a native Spotify station radio seed."""
    clean_type = str(seed_type or "track").strip()
    clean_id = str(seed_id or "").strip()
    clean_uri = str(seed_uri or (f"spotify:{clean_type}:{clean_id}" if clean_id else "")).strip()
    if not clean_id and not clean_uri:
        return []

    station_uri = f"spotify:station:{clean_type}:{clean_id}" if clean_id else clean_uri
    body_js = f"""
    const seedType = {json.dumps(clean_type)};
    const seedId = {json.dumps(clean_id)};
    const seedUri = {json.dumps(clean_uri)};
    const stationUri = {json.dumps(station_uri)};
    const uris = [];
    const seen = new Set();
    const pushTrack = (u) => {{
      if (typeof u === 'string' && u.startsWith('spotify:track:') && !seen.has(u)) {{
        seen.add(u);
        uris.push(u);
      }}
    }};
    const extractFromPage = (page) => {{
      const items = page?.items || page?.tracks || page?.contents?.items || [];
      for (const entry of (Array.isArray(items) ? items : [])) {{
        const t = entry?.item || entry?.track || entry;
        pushTrack(t?.uri || entry?.uri || '');
      }}
    }};

    const radioApi = getService('RadioAPI');
    if (radioApi) {{
      try {{
        let page = null;
        if (typeof radioApi.getStation === 'function') page = await radioApi.getStation(seedUri);
        else if (typeof radioApi.getPlaylistForSeed === 'function') page = await radioApi.getPlaylistForSeed(seedUri);
        extractFromPage(page);
      }} catch (e) {{}}
    }}

    if (uris.length === 0) {{
      const playlistApi = getService('PlaylistAPI');
      if (playlistApi && typeof playlistApi.getContents === 'function') {{
        try {{
          const page = await playlistApi.getContents(stationUri, {{ offset: 0, limit: 50 }});
          extractFromPage(page);
        }} catch (e) {{}}
      }}
    }}

    if (uris.length === 0) {{
      const gql = getService('GraphQL');
      if (gql && typeof gql.query === 'function') {{
        try {{
          const res = await gql.query({{ name: 'seedToPlaylist', variables: {{ uri: seedUri, seedType, seedId }} }});
          const items = res?.data?.seedToPlaylist?.playlist?.content?.items || [];
          for (const entry of (Array.isArray(items) ? items : [])) {{
            pushTrack(entry?.itemV2?.data?.uri || entry?.uri || '');
          }}
        }} catch (e) {{}}
      }}
    }}

    return {{ ok: true, uris: uris.slice(0, 30) }};
    """
    res = evaluate_with_registry(body_js, port=port, timeout=timeout, eval_fn=eval_fn)
    if not res.get("ok"):
        return []
    raw_uris = res.get("uris") or []
    out: list[str] = []
    seen: set[str] = set()
    for u in raw_uris:
        if isinstance(u, str) and u.startswith("spotify:track:") and u not in seen:
            seen.add(u)
            out.append(u)
            if len(out) >= 30:
                break
    return out


def cdp_fetch_browse_categories(
    port: int = SPOTIFY_CDP_PORT,
    timeout: float = DEFAULT_CDP_TIMEOUT,
    eval_fn=None,
) -> list[dict]:
    """Probe BrowseAPI / HomeAPI for live Spotify browse category tiles."""
    body_js = """
    const categories = [];
    const seen = new Set();
    const pushCat = (c) => {
      if (!c) return;
      const uri = c.uri || '';
      const id = c.id || (uri.includes(':') ? uri.split(':').pop() : '');
      const name = (c.name || c.title || '').trim();
      if (!name || (!id && !uri)) return;
      const key = id || uri;
      if (seen.has(key)) return;
      seen.add(key);
      categories.push({
        id: id || key,
        name,
        image_url: parseImg(c.icons || c.images || c.artwork?.sources || c.image),
        uri: uri || ('spotify:genre:' + id)
      });
    };

    const browseApi = getService('BrowseAPI');
    if (browseApi) {
      try {
        let res = null;
        if (typeof browseApi.getCategories === 'function') res = await browseApi.getCategories({ limit: 30 });
        else if (typeof browseApi.getBrowseCategories === 'function') res = await browseApi.getBrowseCategories({ limit: 30 });
        const list = res?.items || res?.categories?.items || (Array.isArray(res) ? res : []);
        for (const c of list) pushCat(c);
      } catch (e) {}
    }

    if (categories.length === 0) {
      const homeApi = getService('HomeAPI');
      if (homeApi && typeof homeApi.getSections === 'function') {
        try {
          const home = await homeApi.getSections({});
          for (const sec of (home?.sections || [])) {
            for (const entry of (sec?.items || [])) {
              if (entry?.type === 'browse-card' || String(entry?.uri || '').includes(':genre:')) {
                pushCat(entry);
              }
            }
          }
        } catch (e) {}
      }
    }

    return { ok: true, categories };
    """
    res = evaluate_with_registry(body_js, port=port, timeout=timeout, eval_fn=eval_fn)
    if not res.get("ok"):
        return []
    raw_cats = res.get("categories") or []
    out: list[dict] = []
    for c in raw_cats:
        if not isinstance(c, dict):
            continue
        name = str(c.get("name") or "").strip()
        cid = str(c.get("id") or "").strip()
        if not name or not cid:
            continue
        out.append(
            {
                "id": cid,
                "name": name,
                "image_url": c.get("image_url"),
                "uri": str(c.get("uri") or f"spotify:genre:{cid}"),
            }
        )
    return out


def cdp_remove_from_queue(
    uri: str,
    uid: str = "",
    port: int = SPOTIFY_CDP_PORT,
    timeout: float = DEFAULT_CDP_TIMEOUT,
    eval_fn=None,
) -> dict:
    """Remove a single upcoming track from the Spotify client queue via CDP PlayerAPI."""
    target_uri = str(uri or "").strip()
    if not target_uri:
        return {"ok": False, "error": "Missing track URI"}
    target_uri_js = json.dumps(target_uri)
    target_uid_js = json.dumps(str(uid or "").strip())
    body_js = f"""
    const targetUri = {target_uri_js};
    const targetUid = {target_uid_js};
    const playerApi = getService('PlayerAPI');
    if (!playerApi) return {{ ok: false, error: 'PlayerAPI not found' }};
    if (typeof playerApi.removeFromQueue !== 'function') {{
      return {{ ok: false, error: 'removeFromQueue not supported' }};
    }}
    const item = targetUid ? {{ uri: targetUri, uid: targetUid }} : {{ uri: targetUri }};
    await playerApi.removeFromQueue([item]);
    return {{ ok: true }};
    """
    res = evaluate_with_registry(body_js, port=port, timeout=timeout, eval_fn=eval_fn)
    if res.get("ok"):
        return {"ok": True}
    return {"ok": False, "error": res.get("error") or "CDP PlayerAPI removeFromQueue failed"}


def cdp_clear_queue(
    port: int = SPOTIFY_CDP_PORT,
    timeout: float = DEFAULT_CDP_TIMEOUT,
    eval_fn=None,
) -> dict:
    """Clear all upcoming tracks from the Spotify client queue via CDP PlayerAPI."""
    body_js = """
    const playerApi = getService('PlayerAPI');
    if (!playerApi) return { ok: false, error: 'PlayerAPI not found' };
    if (typeof playerApi.clearQueue !== 'function') {
      return { ok: false, error: 'clearQueue not supported' };
    }
    await playerApi.clearQueue();
    return { ok: true };
    """
    res = evaluate_with_registry(body_js, port=port, timeout=timeout, eval_fn=eval_fn)
    if res.get("ok"):
        return {"ok": True}
    return {"ok": False, "error": res.get("error") or "CDP PlayerAPI clearQueue failed"}


def cdp_reorder_queue(
    from_index: int,
    to_index: int,
    uid: str = "",
    target_uid: str = "",
    port: int = SPOTIFY_CDP_PORT,
    timeout: float = DEFAULT_CDP_TIMEOUT,
    eval_fn=None,
) -> dict:
    """Reorder an upcoming track in the Spotify client queue via CDP PlayerAPI."""
    try:
        safe_from = int(from_index)
        safe_to = int(to_index)
    except (TypeError, ValueError):
        return {"ok": False, "error": "Invalid queue indices"}
    if safe_from < 0 or safe_to < 0:
        return {"ok": False, "error": "Queue indices must be non-negative"}
    uid_js = json.dumps(str(uid or "").strip())
    target_uid_js = json.dumps(str(target_uid or "").strip())
    body_js = f"""
    const fromIdx = {safe_from};
    const toIdx = {safe_to};
    const itemUid = {uid_js};
    const targetUid = {target_uid_js};
    const playerApi = getService('PlayerAPI');
    if (!playerApi) return {{ ok: false, error: 'PlayerAPI not found' }};
    if (typeof playerApi.reorderQueue === 'function') {{
      if (itemUid && targetUid) {{
        await playerApi.reorderQueue({{ uid: itemUid }}, {{ uid: targetUid }}, fromIdx, toIdx);
      }} else {{
        await playerApi.reorderQueue(fromIdx, toIdx);
      }}
      return {{ ok: true }};
    }}
    if (playerApi._queue && typeof playerApi._queue.reorder === 'function') {{
      await playerApi._queue.reorder(fromIdx, toIdx);
      return {{ ok: true }};
    }}
    return {{ ok: false, error: 'reorderQueue not supported' }};
    """
    res = evaluate_with_registry(body_js, port=port, timeout=timeout, eval_fn=eval_fn)
    if res.get("ok"):
        return {"ok": True}
    return {"ok": False, "error": res.get("error") or "CDP PlayerAPI reorderQueue failed"}


def _normalize_playlist_uri(playlist_uri: str) -> str:
    val = str(playlist_uri or "").strip()
    if val and not val.startswith("spotify:"):
        return f"spotify:playlist:{val}"
    return val


def cdp_create_playlist(
    name: str,
    description: str = "",
    port: int = SPOTIFY_CDP_PORT,
    timeout: float = DEFAULT_CDP_TIMEOUT,
    eval_fn=None,
) -> dict:
    """Create a playlist via Official Spotify Client CDP RootlistAPI/PlaylistAPI."""
    clean_name = str(name or "").strip()
    if not clean_name:
        return {"ok": False, "error": "Playlist name cannot be empty"}
    clean_desc = str(description or "").strip()
    name_js = json.dumps(clean_name)
    desc_js = json.dumps(clean_desc)
    body_js = f"""
    const playlistName = {name_js};
    const playlistDesc = {desc_js};
    const rootlistApi = getService('RootlistAPI');
    if (!rootlistApi || typeof rootlistApi.createPlaylist !== 'function') {{
      return {{ ok: false, error: 'RootlistAPI.createPlaylist not found' }};
    }}
    const created = await rootlistApi.createPlaylist(playlistName, {{ after: 'end' }});
    const uri = typeof created === 'string' ? created : (created?.uri || '');
    const id = uri.includes(':') ? uri.split(':').pop() : '';
    if (!uri) {{
      return {{ ok: false, error: 'RootlistAPI.createPlaylist returned empty URI' }};
    }}
    if (playlistDesc) {{
      const playlistApi = getService('PlaylistAPI');
      if (playlistApi && typeof playlistApi.updateDetails === 'function') {{
        try {{
          await playlistApi.updateDetails(uri, {{ name: playlistName, description: playlistDesc }});
        }} catch (_e) {{}}
      }}
    }}
    return {{ ok: true, uri, id, name: playlistName, description: playlistDesc }};
    """
    res = evaluate_with_registry(body_js, port=port, timeout=timeout, eval_fn=eval_fn)
    if res.get("ok"):
        return res
    return {"ok": False, "error": res.get("error") or "CDP RootlistAPI createPlaylist failed"}


def cdp_update_playlist_details(
    playlist_uri: str,
    name: str,
    description: str = "",
    port: int = SPOTIFY_CDP_PORT,
    timeout: float = DEFAULT_CDP_TIMEOUT,
    eval_fn=None,
) -> dict:
    """Update playlist name/description via CDP PlaylistAPI.updateDetails or RootlistAPI.renamePlaylist."""
    uri = _normalize_playlist_uri(playlist_uri)
    clean_name = str(name or "").strip()
    if not uri:
        return {"ok": False, "error": "Playlist URI cannot be empty"}
    if not clean_name:
        return {"ok": False, "error": "Playlist name cannot be empty"}
    clean_desc = str(description or "").strip()
    uri_js = json.dumps(uri)
    name_js = json.dumps(clean_name)
    desc_js = json.dumps(clean_desc)
    body_js = f"""
    const uri = {uri_js};
    const playlistName = {name_js};
    const playlistDesc = {desc_js};
    const playlistApi = getService('PlaylistAPI');
    if (playlistApi && typeof playlistApi.updateDetails === 'function') {{
      await playlistApi.updateDetails(uri, {{ name: playlistName, description: playlistDesc }});
      return {{ ok: true, uri, name: playlistName, description: playlistDesc }};
    }}
    const rootlistApi = getService('RootlistAPI');
    if (rootlistApi && typeof rootlistApi.renamePlaylist === 'function') {{
      await rootlistApi.renamePlaylist(uri, playlistName);
      return {{ ok: true, uri, name: playlistName, description: playlistDesc }};
    }}
    return {{ ok: false, error: 'PlaylistAPI.updateDetails and RootlistAPI.renamePlaylist not found' }};
    """
    res = evaluate_with_registry(body_js, port=port, timeout=timeout, eval_fn=eval_fn)
    if res.get("ok"):
        return res
    return {"ok": False, "error": res.get("error") or "CDP PlaylistAPI updateDetails failed"}


def cdp_delete_playlist(
    playlist_uri: str,
    port: int = SPOTIFY_CDP_PORT,
    timeout: float = DEFAULT_CDP_TIMEOUT,
    eval_fn=None,
) -> dict:
    """Delete or unfollow a playlist via Official Spotify Client CDP RootlistAPI.remove."""
    uri = _normalize_playlist_uri(playlist_uri)
    if not uri:
        return {"ok": False, "error": "Playlist URI cannot be empty"}
    uri_js = json.dumps(uri)
    body_js = f"""
    const uri = {uri_js};
    const rootlistApi = getService('RootlistAPI');
    if (!rootlistApi || typeof rootlistApi.remove !== 'function') {{
      return {{ ok: false, error: 'RootlistAPI.remove not found' }};
    }}
    await rootlistApi.remove([{{ uri }}]);
    return {{ ok: true }};
    """
    res = evaluate_with_registry(body_js, port=port, timeout=timeout, eval_fn=eval_fn)
    if res.get("ok"):
        return {"ok": True}
    return {"ok": False, "error": res.get("error") or "CDP RootlistAPI remove failed"}


def cdp_reorder_playlist_track(
    playlist_uri: str,
    uid: str,
    target_uid: str,
    move_after: bool = False,
    port: int = SPOTIFY_CDP_PORT,
    timeout: float = DEFAULT_CDP_TIMEOUT,
    eval_fn=None,
) -> dict:
    """Reorder a track inside a playlist via Official Spotify Client CDP PlaylistAPI.move."""
    uri = _normalize_playlist_uri(playlist_uri)
    item_uid = str(uid or "").strip()
    dest_uid = str(target_uid or "").strip()
    if not uri or not item_uid or not dest_uid:
        return {"ok": False, "error": "Playlist URI, uid, and target_uid are required"}
    uri_js = json.dumps(uri)
    uid_js = json.dumps(item_uid)
    target_uid_js = json.dumps(dest_uid)
    move_after_js = "true" if move_after else "false"
    body_js = f"""
    const playlistUri = {uri_js};
    const uid = {uid_js};
    const targetUid = {target_uid_js};
    const moveAfter = {move_after_js};
    const playlistApi = getService('PlaylistAPI');
    if (!playlistApi || typeof playlistApi.move !== 'function') {{
      return {{ ok: false, error: 'PlaylistAPI.move not found' }};
    }}
    const anchor = moveAfter ? {{ after: targetUid }} : {{ before: targetUid }};
    await playlistApi.move(playlistUri, [{{ uid }}], anchor);
    return {{ ok: true }};
    """
    res = evaluate_with_registry(body_js, port=port, timeout=timeout, eval_fn=eval_fn)
    if res.get("ok"):
        return {"ok": True}
    return {"ok": False, "error": res.get("error") or "CDP PlaylistAPI move failed"}


def cdp_remove_from_playlist(
    playlist_uri: str,
    track_uri: str,
    uid: str = "",
    port: int = SPOTIFY_CDP_PORT,
    timeout: float = DEFAULT_CDP_TIMEOUT,
    eval_fn=None,
) -> dict:
    """Remove a track (or specific instance by uid) from a playlist via CDP PlaylistAPI.remove."""
    uri = _normalize_playlist_uri(playlist_uri)
    t_uri = str(track_uri or "").strip()
    item_uid = str(uid or "").strip()
    if not uri or not t_uri:
        return {"ok": False, "error": "Playlist URI and track URI are required"}
    uri_js = json.dumps(uri)
    track_uri_js = json.dumps(t_uri)
    uid_js = json.dumps(item_uid)
    body_js = f"""
    const playlistUri = {uri_js};
    const trackUri = {track_uri_js};
    const uid = {uid_js};
    const playlistApi = getService('PlaylistAPI');
    if (!playlistApi || typeof playlistApi.remove !== 'function') {{
      return {{ ok: false, error: 'PlaylistAPI.remove not found' }};
    }}
    const entry = uid ? {{ uri: trackUri, uid }} : {{ uri: trackUri }};
    await playlistApi.remove(playlistUri, [entry]);
    return {{ ok: true }};
    """
    res = evaluate_with_registry(body_js, port=port, timeout=timeout, eval_fn=eval_fn)
    if res.get("ok"):
        return {"ok": True}
    return {"ok": False, "error": res.get("error") or "CDP PlaylistAPI remove failed"}


def cdp_add_to_playlist(
    playlist_uri: str,
    track_uris: list[str],
    port: int = SPOTIFY_CDP_PORT,
    timeout: float = DEFAULT_CDP_TIMEOUT,
    eval_fn=None,
) -> dict:
    """Add tracks to a playlist via Official Spotify Client CDP PlaylistAPI.add."""
    uri = _normalize_playlist_uri(playlist_uri)
    clean_uris = [str(u).strip() for u in (track_uris or []) if str(u).strip()]
    if not uri or not clean_uris:
        return {"ok": False, "error": "Playlist URI and track URIs are required"}
    uri_js = json.dumps(uri)
    uris_js = json.dumps(clean_uris)
    body_js = f"""
    const playlistUri = {uri_js};
    const uris = {uris_js};
    const playlistApi = getService('PlaylistAPI');
    if (!playlistApi || typeof playlistApi.add !== 'function') {{
      return {{ ok: false, error: 'PlaylistAPI.add not found' }};
    }}
    await playlistApi.add(playlistUri, uris, {{ after: 'end' }});
    return {{ ok: true }};
    """
    res = evaluate_with_registry(body_js, port=port, timeout=timeout, eval_fn=eval_fn)
    if res.get("ok"):
        return {"ok": True}
    return {"ok": False, "error": res.get("error") or "CDP PlaylistAPI add failed"}
