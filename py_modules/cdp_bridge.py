import json
import os

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
    const tracks = [];
    while (true) {{
      let page = null;
      if (typeof playlistApi.getContents === 'function') {{
        page = await playlistApi.getContents(uri, {{ offset: curOffset, limit }});
      }} else if (typeof playlistApi.getPlaylist === 'function') {{
        const pl = await playlistApi.getPlaylist(uri, {{}}, {{ offset: curOffset, limit }});
        page = pl?.contents || pl;
      }} else {{
        return {{ ok: false, error: 'PlaylistAPI.getContents/getPlaylist not found' }};
      }}
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
    return {{ ok: true, tracks, total: total || tracks.length, offset: startOffset }};
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


def cdp_fetch_discovery_mixes(
    port: int = SPOTIFY_CDP_PORT,
    timeout: float = DEFAULT_CDP_TIMEOUT,
    eval_fn=None,
) -> dict:
    """Probe HomeAPI / GraphQL / RootlistAPI for Spotify-owned personalized discovery mixes."""
    body_js = """
    const seen = new Set();
    const items = [];
    const mixNameRe = /(daylist|discover weekly|release radar|daily mix|on repeat|repeat rewind|dj|made for)/i;
    const pushItem = (raw) => {
      if (!raw) return;
      const uri = raw.uri || '';
      const id = raw.id || (uri.includes(':') ? uri.split(':').pop() : '');
      const name = (raw.name || raw.title || '').trim();
      if (!uri && !id) return;
      const normUri = uri || (id ? 'spotify:playlist:' + id : '');
      if (!normUri.includes(':playlist:')) return;
      const owner = raw.owner?.username || raw.owner?.id || raw.owner?.name || raw.owner || '';
      const isSpotifyOwned = String(owner).toLowerCase() === 'spotify' || id.startsWith('37i9dQZF1') || mixNameRe.test(name);
      if (!isSpotifyOwned || !name || seen.has(normUri)) return;
      seen.add(normUri);
      items.push({
        id: id || normUri.split(':').pop(),
        name,
        uri: normUri,
        image_url: parseImg(raw.images || raw.coverArt?.sources || raw.image),
        subtitle: raw.description || raw.subtitle || (owner ? 'Made by ' + owner : 'Made for you'),
        type: 'playlist',
        owner: owner || 'Spotify'
      });
    };

    const homeApi = getService('HomeAPI');
    if (homeApi) {
      try {
        let home = null;
        if (typeof homeApi.getHome === 'function') home = await homeApi.getHome({});
        else if (typeof homeApi.getSections === 'function') home = await homeApi.getSections({});
        const sections = home?.sections || home?.data?.home?.sectionContainer?.sections?.items || [];
        for (const sec of (Array.isArray(sections) ? sections : [])) {
          const secItems = sec?.items || sec?.sectionItems?.items || [];
          for (const entry of (Array.isArray(secItems) ? secItems : [])) {
            const node = entry?.content?.data || entry?.data || entry;
            pushItem(node);
          }
        }
      } catch (e) {}
    }

    const gql = getService('GraphQL');
    if (gql && typeof gql.query === 'function' && items.length === 0) {
      try {
        const res = await gql.query({ name: 'home', variables: {} });
        const sections = res?.data?.home?.sectionContainer?.sections?.items || [];
        for (const sec of (Array.isArray(sections) ? sections : [])) {
          const secItems = sec?.sectionItems?.items || [];
          for (const entry of (Array.isArray(secItems) ? secItems : [])) {
            pushItem(entry?.content?.data || entry?.data || entry);
          }
        }
      } catch (e) {}
    }

    const rootlistApi = getService('RootlistAPI');
    if (rootlistApi && typeof rootlistApi.getContents === 'function') {
      try {
        const root = await rootlistApi.getContents({ limit: 5000, flatten: true });
        for (const child of (root?.items || [])) {
          if (child?.type === 'playlist') pushItem(child);
        }
      } catch (e) {}
    }

    return { ok: true, items };
    """
    res = evaluate_with_registry(body_js, port=port, timeout=timeout, eval_fn=eval_fn)
    if not res.get("ok"):
        return {"ok": False, "items": [], "error": res.get("error") or "CDP discovery mixes unavailable"}

    raw_items = res.get("items") or []
    normalized = []
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        uri = str(item.get("uri") or "")
        pid = str(item.get("id") or (uri.split(":")[-1] if ":" in uri else ""))
        if not pid and not uri:
            continue
        normalized.append(
            {
                "id": pid,
                "name": str(item.get("name") or ""),
                "uri": uri or f"spotify:playlist:{pid}",
                "image_url": item.get("image_url"),
                "subtitle": str(item.get("subtitle") or "Made for you"),
                "type": "playlist",
                "owner": str(item.get("owner") or "Spotify"),
            }
        )
    return {"ok": True, "items": normalized}


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
