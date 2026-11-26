import html
import json
import os
import re
import threading
import time

from py_modules.common import (
    ALLOWED_PLAYBACK_SPEEDS,
    DECK_HOME,
    SPOTIFY_CDP_PORT,
    SPOTIFY_CLIENT_CACHE_DIR,
    check_disk_guardrail,
    decky,
)

DEFAULT_CDP_TIMEOUT = 4.0
DISCOVERY_MIXES_CACHE_FILE = os.path.join(DECK_HOME, ".cache", "deckify", "discovery_mixes.json")
OFFLINE_DOWNLOADS_CACHE_FILE = os.path.join(DECK_HOME, ".cache", "deckify", "offline_downloads.json")
_OFFLINE_CACHE_LOCK = threading.Lock()


def _strip_html(text: str | None) -> str:
    """Strip HTML tags and decode HTML entities, normalizing whitespace."""
    if text is None:
        return ""
    cleaned = re.sub(r"<[^>]+>", "", str(text))
    cleaned = html.unescape(cleaned)
    return re.sub(r"\s+", " ", cleaned).strip()

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


def wait_for_cdp_ready(
    port: int = SPOTIFY_CDP_PORT,
    timeout: float = 12.0,
    poll_interval: float = 0.5,
    eval_fn=None,
) -> dict:
    """Poll Spotify CDP Platform.Registry until core services are available or timeout expires."""
    deadline = time.monotonic() + max(0.0, float(timeout))
    probe_js = (
        "return { ok: true, ready: Boolean(getService('OfflineAPI') || "
        "getService('PlayerAPI') || getService('SocialConnectAPI') || getService('PlaylistAPI')) };"
    )
    while True:
        res = evaluate_with_registry(probe_js, port=port, timeout=2.0, eval_fn=eval_fn)
        if isinstance(res, dict) and res.get("ok") and res.get("ready"):
            return {"ok": True, "ready": True}
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return {"ok": False, "ready": False, "error": "Spotify CDP Platform.Registry not ready"}
        if poll_interval > 0:
            time.sleep(min(float(poll_interval), remaining))


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
          artwork_url: imgUrl,
          added_at: String(entry?.addedAt || entry?.added_at || t?.addedAt || t?.added_at || '')
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
        res["playlist_description"] = _strip_html(res.get("playlist_description"))
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


def cdp_get_player_state(
    port: int = SPOTIFY_CDP_PORT,
    timeout: float = 3.0,
    eval_fn=None,
) -> dict:
    """Query Official Spotify Client CDP PlayerAPI.getState() for AI DJ interlude detection."""
    body_js = """
    const playerApi = getService('PlayerAPI');
    if (!playerApi || typeof playerApi.getState !== 'function') {
      return { ok: false, error: 'PlayerAPI.getState unavailable' };
    }
    const state = await playerApi.getState();
    if (!state || typeof state !== 'object') {
      return { ok: false, error: 'PlayerAPI.getState returned empty state' };
    }
    const ctxUri = String(state.context?.uri || '');
    const trackUri = String(state.item?.uri || '');
    const trackName = String(state.item?.name || '');
    const mediaType = String(state.item?.type || '');
    const isPlaying = !state.isPaused;
    const isDjContext = ctxUri.includes('37i9dQZF1EYkqdzj48dyYq') || ctxUri.startsWith('spotify:dj:');
    const itemMeta = state.item?.metadata || {};
    const ctxMeta = state.context?.metadata || {};
    const isDjInterlude = Boolean(
      isDjContext &&
      isPlaying &&
      (
        mediaType === 'unknown' ||
        !trackUri ||
        trackUri.startsWith('spotify:narration:') ||
        Boolean(itemMeta.is_dj_interlude) ||
        String(ctxMeta.is_context_loading || '') === 'true' ||
        ['dj', 'dj x', 'spotify ai dj'].includes(trackName.trim().toLowerCase()) ||
        Boolean(itemMeta.narration_title || itemMeta.dj_vibe || itemMeta.vibe_name)
      )
    );
    const durationMs = Math.max(
      0,
      Math.round(
        Number(
          state.duration ??
          state.item?.duration?.milliseconds ??
          state.item?.duration_ms ??
          itemMeta.duration ??
          0
        ) || 0
      )
    );
    let rawPositionMs = Number(state.positionAsOfTimestamp ?? state.position ?? 0) || 0;
    if (!state.isPaused && typeof state.timestamp === 'number' && state.timestamp > 0) {
      rawPositionMs += Math.max(0, Date.now() - Number(state.timestamp));
    }
    const positionMs = durationMs > 0
      ? Math.max(0, Math.min(durationMs, Math.round(rawPositionMs)))
      : Math.max(0, Math.round(rawPositionMs));
    const rawImg =
      state.item?.images ||
      state.item?.album?.images ||
      itemMeta.image_url ||
      itemMeta.image_xlarge_url ||
      itemMeta.image_large_url ||
      ctxMeta.image_url ||
      ctxMeta.image_xlarge_url ||
      ctxMeta.image_large_url;
    const imageUrl = String((typeof rawImg === 'string' ? parseImg([rawImg]) : parseImg(rawImg)) || '');

    const nextEntry = (Array.isArray(state.nextItems) && state.nextItems[0]) || (Array.isArray(state.future) && state.future[0]) || null;
    const nextName = String(nextEntry?.name || nextEntry?.metadata?.title || '').trim();
    const nextArtist = String(
      (Array.isArray(nextEntry?.artists) ? nextEntry.artists.map((a) => a?.name).filter(Boolean).join(', ') : '') ||
      nextEntry?.metadata?.subtitle ||
      ''
    ).trim();
    const upNextText = nextName ? ('Up next: ' + nextName + (nextArtist ? ' — ' + nextArtist : '')) : '';

    let title = String(
      itemMeta.title ||
      itemMeta.narration_title ||
      itemMeta.dj_vibe ||
      itemMeta.vibe_name ||
      ctxMeta.title ||
      state.item?.name ||
      ''
    ).trim();
    let subtitle = String(
      itemMeta.subtitle ||
      itemMeta.context_description ||
      ctxMeta.context_description ||
      ctxMeta.subtitle ||
      (Array.isArray(state.item?.artists) ? state.item.artists.map((a) => a?.name).filter(Boolean).join(', ') : '') ||
      upNextText ||
      ''
    ).trim();

    const hasExplicitItemTitle = Boolean(
      String(itemMeta.title || itemMeta.narration_title || itemMeta.dj_vibe || itemMeta.vibe_name || '').trim()
    );
    const hasExplicitItemSub = Boolean(
      String(itemMeta.subtitle || itemMeta.context_description || '').trim()
    );

    if (isDjContext && (isDjInterlude || !trackUri || !title || !subtitle)) {
      try {
        const widget = document.querySelector('[data-testid="now-playing-widget"]');
        if (widget) {
          const trackEl = widget.querySelector('[data-testid="context-item-info-title"], a[href*="/track/"], [data-testid="now-playing-track-name"]');
          const artistEl = widget.querySelector('[data-testid="context-item-info-subtitles"], a[href*="/artist/"], [data-testid="now-playing-artist"]');
          const domTitle = String(trackEl?.textContent || '').trim();
          const domSub = String(artistEl?.textContent || '').trim();
          if (domTitle && (!title || (isDjInterlude && !hasExplicitItemTitle))) {
            title = domTitle;
          }
          if (domSub && (!subtitle || (isDjInterlude && !hasExplicitItemSub))) {
            subtitle = domSub;
          }
          if (!title) {
            const aria = String(widget.getAttribute('aria-label') || '').trim();
            if (aria) title = aria;
          }
        }
        if (!title && typeof document.title === 'string') {
          const docTitle = document.title.trim();
          if (docTitle && docTitle !== 'Spotify' && docTitle !== 'Spotify Premium') {
            title = docTitle;
          }
        }
      } catch (e) {}
    }

    if (isDjInterlude || (isDjContext && !trackUri)) {
      if (!title) title = 'DJ X';
      if (!subtitle) subtitle = upNextText || 'Spotify AI DJ';
    }

    return {
      ok: true,
      is_playing: isPlaying,
      context_uri: ctxUri,
      track_uri: trackUri,
      track_name: trackName,
      media_type: mediaType,
      is_dj_interlude: isDjInterlude,
      duration_ms: durationMs,
      position_ms: positionMs,
      image_url: imageUrl,
      title,
      subtitle
    };
    """
    res = evaluate_with_registry(body_js, port=port, timeout=timeout, eval_fn=eval_fn)
    if res.get("ok"):
        return {
            "ok": True,
            "is_playing": bool(res.get("is_playing", False)),
            "context_uri": str(res.get("context_uri") or ""),
            "track_uri": str(res.get("track_uri") or ""),
            "track_name": str(res.get("track_name") or ""),
            "media_type": str(res.get("media_type") or ""),
            "is_dj_interlude": bool(res.get("is_dj_interlude", False)),
            "duration_ms": max(0, int(res.get("duration_ms") or 0)),
            "position_ms": max(0, int(res.get("position_ms") or 0)),
            "image_url": str(res.get("image_url") or ""),
            "title": _strip_html(res.get("title") or ""),
            "subtitle": _strip_html(res.get("subtitle") or ""),
        }
    return {"ok": False, "error": res.get("error") or "CDP PlayerAPI.getState failed"}


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


_DAYLIST_PLAYLIST_ID = "37i9dQZF1EP6YuccBxUcC1"
_DAYLIST_SUBTITLE_RE = re.compile(r"\bdaylist\b|updated throughout the day", re.IGNORECASE)


def _classify_discovery_kind(
    pid: str, uri: str, name: str, owner: str = "", subtitle: str = ""
) -> str:
    """Classify a discovery playlist as 'dj', 'blend', 'core', or 'editorial'."""
    clean_uri = str(uri or "").strip()
    clean_pid = str(pid or (clean_uri.split(":")[-1] if ":" in clean_uri else "")).strip()
    clean_name = str(name or "").strip()
    clean_owner = str(owner or "").strip().lower()
    clean_subtitle = str(subtitle or "").strip()

    if clean_pid == _AI_DJ_PLAYLIST_ID or clean_uri == f"spotify:playlist:{_AI_DJ_PLAYLIST_ID}" or _AI_DJ_NAME_RE.match(clean_name):
        return "dj"
    if clean_pid.startswith("37i9dQZF1EJ") or _BLEND_NAME_RE.search(clean_name):
        return "blend"
    if (
        clean_pid == _DAYLIST_PLAYLIST_ID
        or clean_uri == f"spotify:playlist:{_DAYLIST_PLAYLIST_ID}"
        or _CORE_MIX_NAME_RE.search(clean_name)
        or _DAYLIST_SUBTITLE_RE.search(clean_subtitle)
    ):
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
    """Probe RecentlyPlayedAPI / RootlistAPI / TokenProvider Pathfinder (with legacy fallbacks) for personalized discovery mixes."""
    body_js = """
    const seen = new Set();
    const items = [];
    const warnings = [];
    const djRe = /^(?:spotify\\s+)?(?:ai\\s+)?dj$/i;
    const blendRe = /\\bblend\\b/i;
    const coreRe = /\\b(daylist|discover weekly|release radar|daily mix(?:\\s*\\d+)?|on repeat|repeat rewind)\\b/i;
    const genericMixRe = /\\bmix\\b/i;
    const stripTags = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/\\s+/g, ' ').trim();
    const classifyKind = (id, uri, name, owner, subtitle) => {
      if (id === '37i9dQZF1EYkqdzj48dyYq' || uri === 'spotify:playlist:37i9dQZF1EYkqdzj48dyYq' || djRe.test(name)) {
        return 'dj';
      }
      if (id.startsWith('37i9dQZF1EJ') || blendRe.test(name)) {
        return 'blend';
      }
      if (
        id === '37i9dQZF1EP6YuccBxUcC1' ||
        uri === 'spotify:playlist:37i9dQZF1EP6YuccBxUcC1' ||
        coreRe.test(name) ||
        /\\bdaylist\\b/i.test(subtitle || '') ||
        /updated throughout the day/i.test(subtitle || '')
      ) {
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
      const owner = item.owner?.username || item.owner?.id || item.owner?.name || item.ownerV2?.data?.name || item.ownerV2?.data?.username || item.owner?.data?.name || item.owner_id || (typeof item.owner === 'string' ? item.owner : '') || '';
      if (!name || seen.has(normUri)) return;
      const pid = id || normUri.split(':').pop();
      const rawSubtitle = stripTags(item.description || item.subtitle || '');
      const kind = classifyKind(pid, normUri, name, owner, rawSubtitle);
      if (kind === 'editorial') return;
      seen.add(normUri);
      items.push({
        id: pid,
        name,
        uri: normUri,
        image_url: parseImg(item.images?.items?.[0]?.sources || item.images || item.coverArt?.sources || item.image),
        subtitle: rawSubtitle || (owner ? 'Made by ' + owner : 'Made for you'),
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

    const playlistApi = getService('PlaylistAPI');
    const recentlyPlayedApi = getService('RecentlyPlayedAPI');
    if (recentlyPlayedApi) {
      try {
        let rp = null;
        if (typeof recentlyPlayedApi.getContexts === 'function') {
          rp = await recentlyPlayedApi.getContexts({ limit: 50 });
        } else if (typeof recentlyPlayedApi.getRecentlyPlayed === 'function') {
          rp = await recentlyPlayedApi.getRecentlyPlayed({ limit: 50 });
        }
        const ctxList = rp?.items || rp?.contexts || (Array.isArray(rp) ? rp : []);
        for (const ctx of ctxList) {
          const cUri = ctx?.uri || ctx?.context?.uri || '';
          if (!cUri.includes(':playlist:') || seen.has(cUri)) continue;
          let node = ctx?.metadata || ctx?.playlist || ctx;
          if ((!node?.name || !node?.images) && playlistApi && typeof playlistApi.getMetadata === 'function') {
            try {
              const meta = await playlistApi.getMetadata(cUri);
              if (meta) node = meta;
            } catch (e) {}
          }
          if (node && !node.uri) node = Object.assign({}, node, { uri: cUri });
          pushItem(node);
        }
      } catch (e) {
        warnings.push('RecentlyPlayedAPI: ' + (e?.message || String(e)));
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

    const hasCoreMix = (needle) => items.some((it) => {
      if (it.kind !== 'core') return false;
      if (it.name.toLowerCase().includes(needle)) return true;
      if (needle === 'daylist') {
        return it.id === '37i9dQZF1EP6YuccBxUcC1' || (it.subtitle || '').toLowerCase().includes('daylist');
      }
      return false;
    });
    const missingCore = () => ['discover weekly', 'release radar', 'daily mix', 'daylist', 'on repeat'].filter((n) => !hasCoreMix(n));

    const unwrapJson = (raw) => {
      let val = raw;
      if (val && typeof val === 'object' && 'body' in val && val.body !== undefined) {
        val = val.body;
      }
      if (typeof val === 'string') {
        try { val = JSON.parse(val); } catch (e) { return null; }
      }
      return val && typeof val === 'object' ? val : null;
    };
    const hasHomeSections = (d) => {
      const s = d?.sections || d?.items || d?.home?.sectionContainer?.sections?.items || d?.data?.home?.sectionContainer?.sections?.items || [];
      return Array.isArray(s) && s.length > 0;
    };

    if (missingCore().length > 0) {
      const tokenProvider = getService('TokenProvider');
      const cosmos = getService('Cosmos');
      const reqBuilder = getService('RequestBuilder');
      let accessToken = '';
      if (tokenProvider && typeof tokenProvider.loadToken === 'function') {
        try {
          const tok = await tokenProvider.loadToken();
          accessToken = tok?.accessToken || tok?.token || (typeof tok === 'string' ? tok : '');
        } catch (e) {
          warnings.push('TokenProvider: ' + (e?.message || String(e)));
        }
      }
      if (accessToken || cosmos || reqBuilder) {
        const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return 'UTC'; } })();
        const homePayload = {
          operationName: 'home',
          variables: { timeZone: tz, sp_t: '', facet: '', sectionItemsLimit: 20 },
          extensions: {
            persistedQuery: {
              version: 1,
              sha256Hash: '3782a4e26466d66eb035e67d0b0245e3d199b885e6a408446c496215a0214536'
            }
          }
        };
        let pfData = null;
        if (cosmos && typeof cosmos.post === 'function') {
          try {
            const raw = await cosmos.post('https://api-partner.spotify.com/pathfinder/v1/query', homePayload);
            const parsed = unwrapJson(raw);
            if (parsed && hasHomeSections(parsed)) pfData = parsed;
          } catch (e) {
            warnings.push('Pathfinder(home/cosmos): ' + (e?.message || String(e)));
          }
        }
        if (!pfData && reqBuilder && typeof reqBuilder.build === 'function') {
          try {
            const resp = await reqBuilder.build()
              .withHost('https://api-partner.spotify.com')
              .withPath('/pathfinder/v1/query')
              .withMethod('POST')
              .withBody(homePayload)
              .send();
            const parsed = unwrapJson(resp);
            if (parsed && hasHomeSections(parsed)) pfData = parsed;
          } catch (e) {
            warnings.push('Pathfinder(home/reqBuilder): ' + (e?.message || String(e)));
          }
        }
        if (!pfData && accessToken) {
          try {
            const resp = await fetch('https://api-partner.spotify.com/pathfinder/v1/query', {
              method: 'POST',
              headers: {
                'Authorization': 'Bearer ' + accessToken,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(homePayload)
            });
            if (resp && resp.ok) {
              const parsed = unwrapJson(await resp.json());
              if (parsed) pfData = parsed;
            }
          } catch (e) {
            warnings.push('Pathfinder(home/fetch): ' + (e?.message || String(e)));
          }
        }
        if (pfData) extractHomeSections(pfData);
      }
    }

    if (missingCore().length > 0) {
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
    }

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
              res = await searchApi.search({ query: q, searchTerm: q, limit: 10, offset: 0, types: ['PLAYLIST'] });
            } else if (typeof searchApi.getSearchResults === 'function') {
              res = await searchApi.getSearchResults({ query: q, limit: 10 });
            } else if (typeof searchApi.searchPlaylists === 'function') {
              res = await searchApi.searchPlaylists(q, { limit: 10 });
            }
            const root = res?.searchV2 || res?.data?.searchV2 || res || {};
            const plList = root?.playlists?.items || res?.playlists?.items || res?.playlists || res?.results?.playlists?.items || res?.items || [];
            for (const p of (Array.isArray(plList) ? plList : [])) {
              const pObj = p?.data || p?.item?.data || p?.item || p;
              if (!pObj || typeof pObj !== 'object') continue;
              pushItem(Object.assign({}, pObj, {
                owner_id: pObj?.ownerV2?.data?.username || pObj?.owner?.id || '',
                images: pObj?.images?.items?.[0]?.sources || pObj?.images
              }));
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
        subtitle = _strip_html(item.get("subtitle") or "")
        kind = _classify_discovery_kind(pid, norm_uri, name, owner, subtitle)
        if kind == "editorial":
            continue
        normalized.append(
            {
                "id": pid,
                "name": name,
                "uri": norm_uri,
                "image_url": item.get("image_url"),
                "subtitle": subtitle or "Made for you",
                "type": "playlist",
                "owner": owner,
                "kind": kind,
            }
        )
    if warnings:
        if len(normalized) <= 2:
            decky.logger.warning("cdp_fetch_discovery_mixes warnings (items=%d): %s", len(normalized), warnings)
        else:
            decky.logger.debug("cdp_fetch_discovery_mixes warnings: %s", warnings)
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
    """Probe TokenProvider Pathfinder / Cosmos (with legacy fallbacks) for live Spotify browse category tiles."""
    body_js = """
    const categories = [];
    const seen = new Set();
    const pushCat = (c) => {
      if (!c || typeof c !== 'object') return;
      const node = c?.data && typeof c.data === 'object' ? c.data : c;
      const uri = node.uri || c.uri || '';
      const id = node.id || (uri.includes(':') ? uri.split(':').pop() : '');
      const name = String(node.name || node.title?.transformedLabel || node.title || '').trim();
      if (!name || (!id && !uri)) return;
      const key = id || uri;
      if (seen.has(key)) return;
      seen.add(key);
      categories.push({
        id: id || key,
        name,
        image_url: parseImg(node.icons || node.images || node.artwork?.sources || node.image?.sources || node.image),
        uri: uri || ('spotify:genre:' + id)
      });
    };

    const tokenProvider = getService('TokenProvider');
    const cosmos = getService('Cosmos');
    const reqBuilder = getService('RequestBuilder');
    let accessToken = '';
    if (tokenProvider && typeof tokenProvider.loadToken === 'function') {
      try {
        const tok = await tokenProvider.loadToken();
        accessToken = tok?.accessToken || tok?.token || (typeof tok === 'string' ? tok : '');
      } catch (e) {}
    }

    const unwrapJson = (raw) => {
      let val = raw;
      if (val && typeof val === 'object' && 'body' in val && val.body !== undefined) {
        val = val.body;
      }
      if (typeof val === 'string') {
        try { val = JSON.parse(val); } catch (e) { return null; }
      }
      return val && typeof val === 'object' ? val : null;
    };

    const extractBrowseNodes = (pfData) => {
      const browseSections = pfData?.data?.browseStart?.sections?.items || pfData?.browseStart?.sections?.items || pfData?.data?.browse?.sections?.items || pfData?.browse?.sections?.items || pfData?.sections || [];
      for (const sec of (Array.isArray(browseSections) ? browseSections : [])) {
        const secItems = sec?.sectionItems?.items || sec?.items || [];
        for (const entry of (Array.isArray(secItems) ? secItems : [])) {
          const rawCard = entry?.content?.data?.data || entry?.content?.data || entry?.data?.data || entry?.data || entry;
          const card = rawCard?.cardRepresentation || entry?.content?.data?.data?.cardRepresentation || entry?.content?.data?.cardRepresentation || rawCard?.data?.cardRepresentation || rawCard;
          if (!card || typeof card !== 'object') continue;
          if (card?.uri?.includes(':genre:') || card?.uri?.includes(':page:') || entry?.content?.__typename === 'BrowseSectionContainerWrapper' || card?.__typename === 'BrowseCategory' || card?.artwork || card?.title || rawCard?.cardRepresentation) {
            pushCat(card);
          }
        }
      }
    };

    if (accessToken || cosmos || reqBuilder) {
      const browsePayload = {
        operationName: 'browseAll',
        variables: { pagePagination: { offset: 0, limit: 30 }, sectionPagination: { offset: 0, limit: 30 } },
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash: '3644f08c4f1d2e838e3d93f933104c51a995736e61a998448025d36d1d05b9df'
          }
        }
      };
      if (cosmos && typeof cosmos.post === 'function') {
        try {
          const raw = await cosmos.post('https://api-partner.spotify.com/pathfinder/v1/query', browsePayload);
          const parsed = unwrapJson(raw);
          if (parsed) extractBrowseNodes(parsed);
        } catch (e) {}
      }
      if (categories.length === 0 && reqBuilder && typeof reqBuilder.build === 'function') {
        try {
          const resp = await reqBuilder.build()
            .withHost('https://api-partner.spotify.com')
            .withPath('/pathfinder/v1/query')
            .withMethod('POST')
            .withBody(browsePayload)
            .send();
          const parsed = unwrapJson(resp);
          if (parsed) extractBrowseNodes(parsed);
        } catch (e) {}
      }
      if (categories.length === 0 && accessToken) {
        try {
          const resp = await fetch('https://api-partner.spotify.com/pathfinder/v1/query', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + accessToken,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(browsePayload)
          });
          if (resp && resp.ok) {
            const parsed = unwrapJson(await resp.json());
            if (parsed) extractBrowseNodes(parsed);
          }
        } catch (e) {}
      }
    }

    if (categories.length === 0) {
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

    if (categories.length === 0 && accessToken) {
      try {
        const resp = await fetch('https://api.spotify.com/v1/browse/categories?limit=30', {
          headers: { 'Authorization': 'Bearer ' + accessToken }
        });
        if (resp && resp.ok) {
          const data = unwrapJson(await resp.json());
          for (const c of (data?.categories?.items || [])) {
            pushCat(c);
          }
        }
      } catch (e) {}
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
        name = _strip_html(c.get("name") or "").strip()
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
    const collectUpcoming = (obj) => {{
      if (!obj || typeof obj !== 'object') return [];
      const next = Array.isArray(obj.nextTracks) ? obj.nextTracks : [];
      const future = Array.isArray(obj.futureTracks)
        ? obj.futureTracks
        : (Array.isArray(obj.future) ? obj.future : []);
      return next.concat(future);
    }};
    const readUpcoming = async () => {{
      if (typeof playerApi.getQueue === 'function') {{
        try {{
          const q = await playerApi.getQueue();
          if (q && typeof q === 'object') return collectUpcoming(q);
        }} catch (e) {{}}
      }}
      if (typeof playerApi.getState === 'function') {{
        try {{
          const st = await playerApi.getState();
          if (st && typeof st === 'object') return collectUpcoming(st);
        }} catch (e) {{}}
      }}
      return null;
    }};
    const beforeUpcoming = await readUpcoming();
    let matchedUid = targetUid;
    if (beforeUpcoming !== null) {{
      const match = beforeUpcoming.find((t) => {{
        if (!t) return false;
        if (targetUid) return String(t.uid || '') === targetUid;
        return String(t.uri || t.contextTrack?.uri || '') === targetUri;
      }});
      if (!match) {{
        return {{ ok: false, error: 'Track not in next_tracks' }};
      }}
      if (!matchedUid && match.uid) {{
        matchedUid = String(match.uid);
      }}
    }}
    const item = matchedUid ? {{ uri: targetUri, uid: matchedUid }} : {{ uri: targetUri }};
    await playerApi.removeFromQueue([item]);
    if (beforeUpcoming !== null) {{
      const afterUpcoming = await readUpcoming();
      if (afterUpcoming !== null && afterUpcoming.length >= beforeUpcoming.length) {{
        return {{ ok: false, error: 'removeFromQueue did not shrink next_tracks' }};
      }}
    }}
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
    let hasContextTracks = false;
    if (typeof playerApi.getQueue === 'function') {
      try {
        const q = await playerApi.getQueue();
        const next = Array.isArray(q?.nextTracks) ? q.nextTracks : [];
        const future = Array.isArray(q?.futureTracks) ? q.futureTracks : [];
        if (future.length > 0 || next.length > 0) {
          hasContextTracks = true;
        }
      } catch (e) {}
    }
    if (!hasContextTracks && typeof playerApi.getState === 'function') {
      try {
        const st = await playerApi.getState();
        const next = Array.isArray(st?.nextTracks) ? st.nextTracks : [];
        const future = Array.isArray(st?.future) ? st.future : (Array.isArray(st?.futureTracks) ? st.futureTracks : []);
        if (future.length > 0 || next.length > 0 || Boolean(st?.context?.uri)) {
          hasContextTracks = true;
        }
      } catch (e) {}
    }
    return { ok: true, hasContextTracks };
    """
    res = evaluate_with_registry(body_js, port=port, timeout=timeout, eval_fn=eval_fn)
    if res.get("ok"):
        return {"ok": True, "has_context_tracks": bool(res.get("hasContextTracks"))}
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


_VALID_OFFLINE_STATES = frozenset({"not_downloaded", "downloading", "downloaded", "paused_low_space"})


def _normalize_offline_progress(raw) -> int:
    try:
        val = int(round(float(raw)))
    except (TypeError, ValueError):
        return 0
    return max(0, min(100, val))


def _normalize_offline_state(raw, progress: int = 0) -> str:
    s = str(raw or "").strip().lower()
    if s in _VALID_OFFLINE_STATES:
        return s
    if s in ("available", "complete", "completed", "synced", "offline", "yes"):
        return "downloaded"
    if s in ("in_progress", "syncing", "pending", "queued", "waiting"):
        return "downloading"
    if s in ("paused", "low_space", "paused_low_space"):
        return "paused_low_space"
    if progress >= 100:
        return "downloaded"
    if progress > 0:
        return "downloading"
    return "not_downloaded"


def load_offline_downloads_cache(cache_file: str | None = None) -> dict:
    """Load persisted offline downloads cache from disk, returning {} on missing/corrupt data."""
    target = cache_file or OFFLINE_DOWNLOADS_CACHE_FILE
    if not os.path.exists(target):
        return {}
    try:
        with open(target, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _write_offline_cache_unlocked(data: dict, target: str) -> bool:
    parent = os.path.dirname(target)
    if parent:
        os.makedirs(parent, exist_ok=True)
    tmp_path = f"{target}.{os.getpid()}.{threading.get_ident()}.tmp"
    try:
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(data if isinstance(data, dict) else {}, f, indent=2)
        os.replace(tmp_path, target)
        return True
    except Exception as e:
        decky.logger.error("Failed to save offline downloads cache %s: %s", target, e)
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass
        return False


def save_offline_downloads_cache(data: dict, cache_file: str | None = None) -> bool:
    """Atomically persist offline downloads cache to disk via .tmp + os.replace."""
    target = cache_file or OFFLINE_DOWNLOADS_CACHE_FILE
    with _OFFLINE_CACHE_LOCK:
        return _write_offline_cache_unlocked(data, target)


def _update_offline_cache_entry(
    uri: str,
    entry: dict | None,
    cache_file: str | None = None,
) -> bool:
    target = cache_file or OFFLINE_DOWNLOADS_CACHE_FILE
    with _OFFLINE_CACHE_LOCK:
        current = load_offline_downloads_cache(target)
        if entry is None:
            current.pop(uri, None)
        else:
            existing = current.get(uri) if isinstance(current.get(uri), dict) else {}
            merged = {**existing, **entry, "uri": uri}
            current[uri] = merged
        return _write_offline_cache_unlocked(current, target)


def cdp_set_offline_download(
    uri: str,
    download: bool,
    item_meta: dict | None = None,
    port: int = SPOTIFY_CDP_PORT,
    timeout: float = DEFAULT_CDP_TIMEOUT,
    eval_fn=None,
    cache_file: str | None = None,
    storage_path: str | None = None,
    min_free_gb: float = 3.0,
) -> dict:
    """Toggle offline download for a playlist, album, or episode via Official Spotify Client CDP OfflineAPI."""
    norm_uri = str(uri or "").strip()
    if not norm_uri:
        return {"ok": False, "error": "URI is required"}

    if download:
        guardrail = check_disk_guardrail(storage_path or SPOTIFY_CLIENT_CACHE_DIR, min_free_gb)
        if not guardrail.get("allowed", False):
            return {
                "ok": False,
                "uri": norm_uri,
                "offline_state": "paused_low_space",
                "guardrail": guardrail,
                "error": (
                    f"Insufficient disk space: {guardrail.get('free_gb')} GB free "
                    f"(minimum {guardrail.get('min_free_gb')} GB required)"
                ),
            }

    uri_js = json.dumps(norm_uri)
    want_js = "true" if download else "false"
    body_js = f"""
    const uri = {uri_js};
    const want = {want_js};
    const offlineApi = getService('OfflineAPI');
    const playlistApi = getService('PlaylistAPI');
    const albumApi = getService('AlbumAPI');
    const showApi = getService('ShowAPI');

    if (want) {{
      if (offlineApi && typeof offlineApi.addDownload === 'function') {{
        await offlineApi.addDownload(uri);
        return {{ ok: true, offline_state: 'downloading', progress: 0 }};
      }}
      if (offlineApi && typeof offlineApi.sync === 'function') {{
        await offlineApi.sync(uri);
        return {{ ok: true, offline_state: 'downloading', progress: 0 }};
      }}
      if (offlineApi && typeof offlineApi.setOffline === 'function') {{
        await offlineApi.setOffline(uri, true);
        return {{ ok: true, offline_state: 'downloading', progress: 0 }};
      }}
      if (offlineApi && typeof offlineApi.download === 'function') {{
        await offlineApi.download(uri);
        return {{ ok: true, offline_state: 'downloading', progress: 0 }};
      }}
      if (uri.includes(':playlist:') && playlistApi) {{
        if (typeof playlistApi.setOffline === 'function') {{
          await playlistApi.setOffline(uri, true);
          return {{ ok: true, offline_state: 'downloading', progress: 0 }};
        }}
        if (typeof playlistApi.makeAvailableOffline === 'function') {{
          await playlistApi.makeAvailableOffline(uri);
          return {{ ok: true, offline_state: 'downloading', progress: 0 }};
        }}
      }}
      if (uri.includes(':album:') && albumApi) {{
        if (typeof albumApi.setOffline === 'function') {{
          await albumApi.setOffline(uri, true);
          return {{ ok: true, offline_state: 'downloading', progress: 0 }};
        }}
        if (typeof albumApi.makeAvailableOffline === 'function') {{
          await albumApi.makeAvailableOffline(uri);
          return {{ ok: true, offline_state: 'downloading', progress: 0 }};
        }}
      }}
      if ((uri.includes(':episode:') || uri.includes(':show:')) && showApi) {{
        if (typeof showApi.setOffline === 'function') {{
          await showApi.setOffline(uri, true);
          return {{ ok: true, offline_state: 'downloading', progress: 0 }};
        }}
        if (typeof showApi.makeAvailableOffline === 'function') {{
          await showApi.makeAvailableOffline(uri);
          return {{ ok: true, offline_state: 'downloading', progress: 0 }};
        }}
      }}
      return {{ ok: false, error: 'OfflineAPI.addDownload not found' }};
    }} else {{
      if (offlineApi && typeof offlineApi.removeDownload === 'function') {{
        await offlineApi.removeDownload(uri);
        return {{ ok: true, offline_state: 'not_downloaded', progress: 0 }};
      }}
      if (offlineApi && typeof offlineApi.unsync === 'function') {{
        await offlineApi.unsync(uri);
        return {{ ok: true, offline_state: 'not_downloaded', progress: 0 }};
      }}
      if (offlineApi && typeof offlineApi.setOffline === 'function') {{
        await offlineApi.setOffline(uri, false);
        return {{ ok: true, offline_state: 'not_downloaded', progress: 0 }};
      }}
      if (offlineApi && typeof offlineApi.remove === 'function') {{
        await offlineApi.remove(uri);
        return {{ ok: true, offline_state: 'not_downloaded', progress: 0 }};
      }}
      if (uri.includes(':playlist:') && playlistApi && typeof playlistApi.setOffline === 'function') {{
        await playlistApi.setOffline(uri, false);
        return {{ ok: true, offline_state: 'not_downloaded', progress: 0 }};
      }}
      if (uri.includes(':album:') && albumApi && typeof albumApi.setOffline === 'function') {{
        await albumApi.setOffline(uri, false);
        return {{ ok: true, offline_state: 'not_downloaded', progress: 0 }};
      }}
      if ((uri.includes(':episode:') || uri.includes(':show:')) && showApi && typeof showApi.setOffline === 'function') {{
        await showApi.setOffline(uri, false);
        return {{ ok: true, offline_state: 'not_downloaded', progress: 0 }};
      }}
      return {{ ok: false, error: 'OfflineAPI.removeDownload not found' }};
    }}
    """
    res = evaluate_with_registry(body_js, port=port, timeout=timeout, eval_fn=eval_fn)
    if not res.get("ok"):
        return {
            "ok": False,
            "uri": norm_uri,
            "error": res.get("error") or "CDP OfflineAPI request failed",
        }

    if download:
        progress = _normalize_offline_progress(res.get("progress", 0))
        state = _normalize_offline_state(res.get("offline_state") or "downloading", progress)
        if state == "not_downloaded":
            state = "downloading"
        meta = dict(item_meta) if isinstance(item_meta, dict) else {}
        entry = {
            **meta,
            "uri": norm_uri,
            "offline_state": state,
            "progress": progress,
        }
        _update_offline_cache_entry(norm_uri, entry, cache_file=cache_file)
        return {"ok": True, "uri": norm_uri, "offline_state": state, "progress": progress}

    _update_offline_cache_entry(norm_uri, None, cache_file=cache_file)
    return {"ok": True, "uri": norm_uri, "offline_state": "not_downloaded", "progress": 0}


def cdp_get_offline_status(
    uris: list[str] | None = None,
    port: int = SPOTIFY_CDP_PORT,
    timeout: float = DEFAULT_CDP_TIMEOUT,
    eval_fn=None,
    cache_file: str | None = None,
) -> dict:
    """Query offline download status from CDP OfflineAPI and merge with offline_downloads.json cache."""
    filter_uris = [str(u).strip() for u in (uris or []) if str(u).strip()]
    uris_js = json.dumps(filter_uris)
    body_js = f"""
    const uris = {uris_js};
    const offlineApi = getService('OfflineAPI');
    if (!offlineApi) {{
      return {{ ok: false, error: 'OfflineAPI not found' }};
    }}
    let raw = null;
    if (typeof offlineApi.getDownloadStatus === 'function') {{
      raw = await offlineApi.getDownloadStatus(uris.length ? uris : undefined);
    }} else if (typeof offlineApi.getOfflineStatus === 'function') {{
      raw = await offlineApi.getOfflineStatus(uris.length ? uris : undefined);
    }} else if (typeof offlineApi.getDownloads === 'function') {{
      raw = await offlineApi.getDownloads();
    }} else if (typeof offlineApi.getStatus === 'function') {{
      raw = await offlineApi.getStatus();
    }} else {{
      return {{ ok: false, error: 'OfflineAPI status method not found' }};
    }}
    const list = Array.isArray(raw) ? raw : (raw?.items || raw?.downloads || []);
    return {{ ok: true, items: Array.isArray(list) ? list : [] }};
    """
    cached = load_offline_downloads_cache(cache_file=cache_file)
    merged: dict[str, dict] = {}
    for k, v in cached.items():
        if isinstance(v, dict):
            prog = _normalize_offline_progress(v.get("progress", 0))
            st = _normalize_offline_state(v.get("offline_state"), prog)
            merged[k] = {**v, "uri": k, "progress": prog, "offline_state": st}

    res = evaluate_with_registry(body_js, port=port, timeout=timeout, eval_fn=eval_fn)
    source = "cache"
    if res.get("ok") and isinstance(res.get("items"), list):
        source = "cdp"
        for item in res["items"]:
            if not isinstance(item, dict):
                continue
            item_uri = str(item.get("uri") or "").strip()
            if not item_uri:
                continue
            prog = _normalize_offline_progress(item.get("progress", item.get("percent", 0)))
            st = _normalize_offline_state(
                item.get("offline_state") or item.get("status") or item.get("state"),
                prog,
            )
            prev = merged.get(item_uri, {})
            merged[item_uri] = {
                **prev,
                **item,
                "uri": item_uri,
                "progress": prog,
                "offline_state": st,
            }
        save_offline_downloads_cache(merged, cache_file=cache_file)

    if filter_uris:
        merged = {u: merged[u] for u in filter_uris if u in merged}

    return {"ok": True, "items": merged, "source": source}


def cdp_get_offline_downloads_list(
    port: int = SPOTIFY_CDP_PORT,
    timeout: float = DEFAULT_CDP_TIMEOUT,
    eval_fn=None,
    cache_file: str | None = None,
) -> list[dict]:
    """Return a deterministic list of offline download entries sorted by URI."""
    res = cdp_get_offline_status(None, port=port, timeout=timeout, eval_fn=eval_fn, cache_file=cache_file)
    items = res.get("items") if isinstance(res, dict) else {}
    if not isinstance(items, dict):
        return []
    return [items[k] for k in sorted(items.keys()) if isinstance(items[k], dict)]


def cdp_remove_all_offline_downloads(
    port: int = SPOTIFY_CDP_PORT,
    timeout: float = DEFAULT_CDP_TIMEOUT,
    eval_fn=None,
    cache_file: str | None = None,
) -> dict:
    """Remove all offline downloads via CDP OfflineAPI and clear offline_downloads.json."""
    cached = load_offline_downloads_cache(cache_file=cache_file)
    cached_uris = sorted(cached.keys())
    uris_js = json.dumps(cached_uris)
    body_js = f"""
    const uris = {uris_js};
    const offlineApi = getService('OfflineAPI');
    const playlistApi = getService('PlaylistAPI');
    if (offlineApi && typeof offlineApi.removeAllDownloads === 'function') {{
      await offlineApi.removeAllDownloads();
      return {{ ok: true, removed_count: uris.length }};
    }}
    let removed = 0;
    for (const u of uris) {{
      try {{
        if (offlineApi && typeof offlineApi.removeDownload === 'function') {{
          await offlineApi.removeDownload(u);
          removed++;
        }} else if (offlineApi && typeof offlineApi.unsync === 'function') {{
          await offlineApi.unsync(u);
          removed++;
        }} else if (u.includes(':playlist:') && playlistApi && typeof playlistApi.setOffline === 'function') {{
          await playlistApi.setOffline(u, false);
          removed++;
        }}
      }} catch (_e) {{}}
    }}
    return {{ ok: true, removed_count: removed }};
    """
    res = evaluate_with_registry(body_js, port=port, timeout=timeout, eval_fn=eval_fn)
    save_offline_downloads_cache({}, cache_file=cache_file)
    if res.get("ok"):
        return {"ok": True, "removed_count": int(res.get("removed_count", len(cached_uris)))}
    return {
        "ok": False,
        "removed_count": len(cached_uris),
        "error": res.get("error") or "CDP OfflineAPI removeAllDownloads failed",
    }


def _normalize_jam_guests(raw_guests) -> list[dict]:
    if not isinstance(raw_guests, list):
        return []
    cleaned = [g for g in raw_guests if isinstance(g, dict)]
    return sorted(
        cleaned,
        key=lambda g: (
            str(g.get("displayName") or g.get("username") or g.get("id") or "").lower(),
            str(g.get("id") or ""),
        ),
    )


def _normalize_jam_response(res: dict, default_error: str) -> dict:
    if not isinstance(res, dict) or not res.get("ok"):
        return {
            "ok": False,
            "active": False,
            "join_url": None,
            "guest_count": 0,
            "is_host": False,
            "guests": [],
            "error": (res.get("error") if isinstance(res, dict) else None) or default_error,
        }
    guests = _normalize_jam_guests(res.get("guests"))
    guest_count = res.get("guest_count")
    if not isinstance(guest_count, int) or guest_count < 0:
        guest_count = len(guests)
    join_url = res.get("join_url") or None
    if isinstance(join_url, str):
        join_url = join_url.strip() or None
    else:
        join_url = None
    return {
        "ok": True,
        "active": bool(join_url and res.get("active", True)),
        "join_url": join_url,
        "guest_count": guest_count,
        "is_host": bool(res.get("is_host", False)),
        "guests": guests,
        "error": None,
    }


_EXTRACT_JAM_JOIN_URL_JS = """
const extractJoinUrl = (sess) => {
  const val = (
    sess?.joinUrl ||
    sess?.shareUrl ||
    sess?.url ||
    sess?.join_url ||
    sess?.inviteUrl ||
    sess?.invite_url ||
    sess?.link ||
    sess?.session?.joinUrl ||
    sess?.session?.shareUrl ||
    sess?.session?.url ||
    sess?.session?.inviteUrl ||
    sess?.data?.joinUrl ||
    sess?.data?.shareUrl ||
    null
  );
  return (typeof val === 'string' && val.trim()) ? val.trim() : null;
};
"""


def cdp_start_spotify_jam(
    port: int = SPOTIFY_CDP_PORT,
    timeout: float = DEFAULT_CDP_TIMEOUT,
    eval_fn=None,
) -> dict:
    """Start or resume a Spotify Jam session via CDP SocialConnectAPI / JamDevicesAPI."""
    body_js = f"""
    {_EXTRACT_JAM_JOIN_URL_JS}
    const social = getService('SocialConnectAPI');
    const jamDevices = getService('JamDevicesAPI');
    const sessionSvc = getService('Session');
    let sess = null;
    if (social && typeof social.createSession === 'function') {{
      sess = await social.createSession();
    }} else if (social && typeof social.startJam === 'function') {{
      sess = await social.startJam();
    }} else if (jamDevices && typeof jamDevices.startSession === 'function') {{
      sess = await jamDevices.startSession();
    }} else if (sessionSvc && typeof sessionSvc.createSession === 'function') {{
      sess = await sessionSvc.createSession();
    }} else {{
      return {{ ok: false, error: 'SocialConnectAPI Jam start method not found' }};
    }}
    let joinUrl = extractJoinUrl(sess);
    if (!joinUrl && social && typeof social.getShareUrl === 'function') {{
      const shared = await social.getShareUrl();
      joinUrl = (typeof shared === 'string' && shared.trim()) ? shared.trim() : extractJoinUrl(shared);
    }}
    if (!joinUrl && social && typeof social.getJoinUrl === 'function') {{
      const joined = await social.getJoinUrl();
      joinUrl = (typeof joined === 'string' && joined.trim()) ? joined.trim() : extractJoinUrl(joined);
    }}
    if (!joinUrl && jamDevices && typeof jamDevices.getShareUrl === 'function') {{
      const shared = await jamDevices.getShareUrl();
      joinUrl = (typeof shared === 'string' && shared.trim()) ? shared.trim() : extractJoinUrl(shared);
    }}
    for (let attempt = 0; !joinUrl && attempt < 6; attempt++) {{
      await new Promise((r) => setTimeout(r, 400));
      let polled = null;
      if (social && typeof social.getSession === 'function') {{
        polled = await social.getSession();
      }} else if (social && typeof social.getCurrentSession === 'function') {{
        polled = await social.getCurrentSession();
      }} else if (jamDevices && typeof jamDevices.getSession === 'function') {{
        polled = await jamDevices.getSession();
      }}
      if (polled) {{
        sess = polled;
        joinUrl = extractJoinUrl(sess);
      }}
    }}
    const guests = Array.isArray(sess?.guests) ? sess.guests : (Array.isArray(sess?.participants) ? sess.participants : []);
    return {{
      ok: true,
      active: Boolean(joinUrl && (sess?.active ?? true)),
      join_url: joinUrl,
      guest_count: typeof sess?.guestCount === 'number' ? sess.guestCount : guests.length,
      is_host: Boolean(sess?.isHost ?? sess?.is_host ?? true),
      guests,
    }};
    """
    res = evaluate_with_registry(body_js, port=port, timeout=max(float(timeout), 6.0), eval_fn=eval_fn)
    norm = _normalize_jam_response(res, "CDP SocialConnectAPI start failed")
    if norm.get("ok") and not norm.get("join_url"):
        return {
            "ok": False,
            "active": False,
            "join_url": None,
            "guest_count": 0,
            "is_host": False,
            "guests": [],
            "error": "Spotify Jam started but no invite URL was returned",
        }
    return norm


def cdp_get_jam_status(
    port: int = SPOTIFY_CDP_PORT,
    timeout: float = DEFAULT_CDP_TIMEOUT,
    eval_fn=None,
) -> dict:
    """Query current Spotify Jam session state via CDP SocialConnectAPI / JamDevicesAPI."""
    body_js = f"""
    {_EXTRACT_JAM_JOIN_URL_JS}
    const social = getService('SocialConnectAPI');
    const jamDevices = getService('JamDevicesAPI');
    let sess = null;
    if (social && typeof social.getSession === 'function') {{
      sess = await social.getSession();
    }} else if (social && typeof social.getCurrentSession === 'function') {{
      sess = await social.getCurrentSession();
    }} else if (jamDevices && typeof jamDevices.getSession === 'function') {{
      sess = await jamDevices.getSession();
    }} else {{
      return {{ ok: false, error: 'SocialConnectAPI Jam status method not found' }};
    }}
    if (!sess) {{
      return {{ ok: true, active: false, join_url: null, guest_count: 0, is_host: false, guests: [] }};
    }}
    const joinUrl = extractJoinUrl(sess);
    const guests = Array.isArray(sess?.guests) ? sess.guests : (Array.isArray(sess?.participants) ? sess.participants : []);
    return {{
      ok: true,
      active: Boolean(joinUrl && (sess?.active ?? true)),
      join_url: joinUrl,
      guest_count: typeof sess?.guestCount === 'number' ? sess.guestCount : guests.length,
      is_host: Boolean(sess?.isHost ?? sess?.is_host ?? false),
      guests,
    }};
    """
    res = evaluate_with_registry(body_js, port=port, timeout=timeout, eval_fn=eval_fn)
    return _normalize_jam_response(res, "CDP SocialConnectAPI status failed")


def cdp_end_spotify_jam(
    port: int = SPOTIFY_CDP_PORT,
    timeout: float = DEFAULT_CDP_TIMEOUT,
    eval_fn=None,
) -> dict:
    """End or leave an active Spotify Jam session via CDP SocialConnectAPI / JamDevicesAPI."""
    body_js = """
    const social = getService('SocialConnectAPI');
    const jamDevices = getService('JamDevicesAPI');
    if (social && typeof social.endSession === 'function') {
      await social.endSession();
      return { ok: true, active: false };
    }
    if (social && typeof social.leaveSession === 'function') {
      await social.leaveSession();
      return { ok: true, active: false };
    }
    if (jamDevices && typeof jamDevices.endSession === 'function') {
      await jamDevices.endSession();
      return { ok: true, active: false };
    }
    return { ok: false, error: 'SocialConnectAPI Jam end method not found' };
    """
    res = evaluate_with_registry(body_js, port=port, timeout=timeout, eval_fn=eval_fn)
    if isinstance(res, dict) and res.get("ok"):
        return {"ok": True, "active": False, "error": None}
    return {
        "ok": False,
        "active": False,
        "error": (res.get("error") if isinstance(res, dict) else None) or "CDP SocialConnectAPI end failed",
    }


def cdp_search(
    query: str,
    types: str = "track,artist,album,playlist",
    limit: int = 10,
    offset: int = 0,
    port: int = SPOTIFY_CDP_PORT,
    timeout: float = DEFAULT_CDP_TIMEOUT,
    eval_fn=None,
) -> dict:
    """Query Spotify desktop SearchAPI over CDP and normalize into rpc_library.search_spotify shape."""
    q_json = json.dumps(str(query or ""))
    types_json = json.dumps(str(types or "track,artist,album,playlist"))
    limit_json = json.dumps(max(1, min(int(limit or 10), 20)))
    offset_json = json.dumps(max(0, int(offset or 0)))
    body_js = (
        f"const q = {q_json};\n"
        f"const typesStr = {types_json};\n"
        f"const limit = {limit_json};\n"
        f"const offset = {offset_json};\n"
        """
    const searchApi = getService('SearchAPI');
    if (!searchApi) return { ok: false, error: 'SearchAPI unavailable' };
    let res = null;
    if (typeof searchApi.search === 'function') {
      res = await searchApi.search({ query: q, searchTerm: q, limit, offset, types: typesStr.split(',') });
    } else if (typeof searchApi.getSearchResults === 'function') {
      res = await searchApi.getSearchResults(q, { limit, offset });
    } else {
      return { ok: false, error: 'SearchAPI.search method not found' };
    }
    const root = res?.searchV2 || res?.data?.searchV2 || res || {};
    const unwrap = (node) => {
      if (!node) return null;
      if (node.item?.data) return node.item.data;
      if (node.data) return node.data;
      return node;
    };
    const uriToId = (u) => (typeof u === 'string' && u.includes(':') ? u.split(':').pop() : '');

    const rawTracks = root?.tracksV2?.items || root?.tracks?.items || [];
    const tracks = [];
    for (const raw of rawTracks) {
      const t = unwrap(raw);
      if (!t || (!t.uri && !t.id)) continue;
      const uri = t.uri || (t.id ? 'spotify:track:' + t.id : '');
      const id = t.id || uriToId(uri);
      const artistsList = t.artists?.items || t.artists || [];
      const firstArtist = artistsList[0]?.profile?.name ? { name: artistsList[0].profile.name, id: uriToId(artistsList[0].uri) } : (artistsList[0] || {});
      const artistStr = artistsList.map((a) => a?.profile?.name || a?.name || '').filter(Boolean).join(', ');
      const albumObj = t.albumOfTrack || t.album || {};
      const img = parseImg(albumObj?.coverArt?.sources || albumObj?.images || t.images);
      tracks.push({
        id,
        name: t.name || '',
        artist: artistStr,
        album: albumObj?.name || '',
        artist_id: firstArtist?.id || uriToId(firstArtist?.uri) || '',
        album_id: albumObj?.id || uriToId(albumObj?.uri) || '',
        uri,
        duration_ms: Number(t.duration?.totalMilliseconds ?? t.duration_ms ?? 0),
        image_url: img,
        artwork_url: img,
      });
    }

    const rawArtists = root?.artists?.items || [];
    const artists = [];
    for (const raw of rawArtists) {
      const a = unwrap(raw);
      if (!a) continue;
      const uri = a.uri || (a.id ? 'spotify:artist:' + a.id : '');
      const id = a.id || uriToId(uri);
      const img = parseImg(a.visuals?.avatarImage?.sources || a.images);
      artists.push({
        id,
        name: a.profile?.name || a.name || '',
        uri,
        image_url: img,
      });
    }

    const rawAlbums = root?.albumsV2?.items || root?.albums?.items || [];
    const albums = [];
    for (const raw of rawAlbums) {
      const a = unwrap(raw);
      if (!a) continue;
      const uri = a.uri || (a.id ? 'spotify:album:' + a.id : '');
      const id = a.id || uriToId(uri);
      const artistsList = a.artists?.items || a.artists || [];
      const artistStr = artistsList.map((x) => x?.profile?.name || x?.name || '').filter(Boolean).join(', ');
      const img = parseImg(a.coverArt?.sources || a.images);
      albums.push({
        id,
        name: a.name || '',
        artist: artistStr,
        image_url: img,
        artwork_url: img,
        track_count: Number(a.total_tracks ?? a.tracks?.totalCount ?? 0),
        uri,
      });
    }

    const rawPlaylists = root?.playlists?.items || [];
    const playlists = [];
    for (const raw of rawPlaylists) {
      const p = unwrap(raw);
      if (!p) continue;
      const uri = p.uri || (p.id ? 'spotify:playlist:' + p.id : '');
      const id = p.id || uriToId(uri);
      const img = parseImg(p.images?.items?.[0]?.sources || p.images);
      playlists.push({
        id,
        name: p.name || '',
        uri,
        image_url: img,
        artwork_url: img,
        track_count: Number(p.items?.total ?? p.tracks?.total ?? p.content?.totalCount ?? 0),
        owner_id: p.ownerV2?.data?.username || p.owner?.id || '',
      });
    }

    const rawShows = root?.shows?.items || root?.podcasts?.items || [];
    const shows = [];
    for (const raw of rawShows) {
      const s = unwrap(raw);
      if (!s) continue;
      const uri = s.uri || (s.id ? 'spotify:show:' + s.id : '');
      const id = s.id || uriToId(uri);
      const img = parseImg(s.coverArt?.sources || s.images);
      shows.push({
        id,
        name: s.name || '',
        publisher: s.publisher?.name || s.publisher || '',
        image_url: img,
        total_episodes: Number(s.total_episodes ?? 0),
        uri,
      });
    }

    const rawEpisodes = root?.episodes?.items || [];
    const episodes = [];
    for (const raw of rawEpisodes) {
      const ep = unwrap(raw);
      if (!ep) continue;
      const uri = ep.uri || (ep.id ? 'spotify:episode:' + ep.id : '');
      const id = ep.id || uriToId(uri);
      const img = parseImg(ep.coverArt?.sources || ep.images);
      episodes.push({
        id,
        name: ep.name || '',
        show_name: ep.podcastV2?.data?.name || ep.show?.name || '',
        uri,
        duration_ms: Number(ep.duration?.totalMilliseconds ?? ep.duration_ms ?? 0),
        release_date: ep.releaseDate?.isoString || ep.release_date || '',
        image_url: img,
        artwork_url: img,
        resume_position_ms: Number(ep.playedState?.playPositionMilliseconds ?? ep.resume_point?.resume_position_ms ?? 0),
        fully_played: Boolean(ep.playedState?.state === 'PLAYED' || ep.resume_point?.fully_played),
      });
    }

    return { ok: true, tracks, artists, albums, playlists, shows, episodes };
    """
    )
    res = evaluate_with_registry(body_js, port=port, timeout=timeout, eval_fn=eval_fn)
    if isinstance(res, dict) and res.get("ok"):
        return {
            "ok": True,
            "tracks": res.get("tracks") or [],
            "artists": res.get("artists") or [],
            "albums": res.get("albums") or [],
            "playlists": res.get("playlists") or [],
            "shows": res.get("shows") or [],
            "episodes": res.get("episodes") or [],
        }
    return {
        "ok": False,
        "error": (res.get("error") if isinstance(res, dict) else None) or "CDP SearchAPI failed",
    }
