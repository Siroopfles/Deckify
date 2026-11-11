import base64
import json
import secrets
import urllib.error
from py_modules.common import (
    SPOTIFY_CDP_PORT,
    _exec,
    _save_settings,
    decky,
)
from py_modules.images import (
    _image_url,
    _proxy_folder_tree_images,
    _fetch_spotify_image,
)
from py_modules.spotify import (
    _spotify_api_request,
    _parse_spotify_error,
    _fetch_lyrics_sync,
)
from py_modules.engine import (
    _cdp_evaluate,
    _fetch_spotify_cdp_folder_tree,
)
from py_modules.rpc_playback import annotate_tracks_liked


async def get_playlists(plugin, offset: int = 0) -> dict:
    """Fetch current user's playlists."""
    token = await plugin._ensure_token()
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
                "artwork_url": _image_url(images),
                "track_count": (p.get("items") or p.get("tracks") or {}).get("total", 0),
                "owner_id": p.get("owner", {}).get("id", ""),
            })
        total = data.get("total", 0) if data else 0
        return {"ok": True, "playlists": playlists, "total": total, "offset": offset}
    except Exception as e:
        decky.logger.error("get_playlists failed: %s", e)
        return {"ok": False, "error": str(e)}


async def get_playlist_tracks(
    plugin,
    playlist_id: str,
    offset: int = 0,
    fetch_all: bool = False,
    limit: int = 50,
) -> dict:
    """Fetch tracks belonging to a playlist."""
    if not playlist_id or not str(playlist_id).strip():
        return {"ok": False, "error": "Missing playlist_id"}
    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}
    pid = (playlist_id or "").strip()
    if pid.startswith("spotify:playlist:"):
        pid = pid.split(":")[-1]
    try:
        tracks = []
        cur_offset = max(0, int(offset))
        req_limit = 100 if fetch_all else max(1, min(int(limit), 100))
        total = 0

        while True:
            data = None
            try:
                data = await _exec(
                    _spotify_api_request,
                    f"playlists/{pid}/items", token, "GET",
                    {"limit": req_limit, "offset": cur_offset},
                )
            except urllib.error.HTTPError as e:
                if e.code in (400, 403, 404):
                    try:
                        data = await _exec(
                            _spotify_api_request,
                            f"playlists/{pid}/tracks", token, "GET",
                            {"limit": req_limit, "offset": cur_offset},
                        )
                    except Exception:
                        if cur_offset == 0:
                            data = await _exec(_spotify_api_request, f"playlists/{pid}", token, "GET")
                else:
                    raise
            except Exception:
                raise

            if not data:
                break
            items_obj = data.get("items") if isinstance(data, dict) else []
            if isinstance(items_obj, dict):
                raw_items = items_obj.get("items", [])
                total = items_obj.get("total", len(raw_items))
            elif isinstance(items_obj, list):
                raw_items = items_obj
                total = data.get("total", len(raw_items))
            else:
                raw_items = []
                total = 0

            for item in raw_items:
                t = item.get("item") or item.get("track")
                if t is None:
                    continue
                artists = ", ".join(a["name"] for a in t.get("artists", []))
                images = t.get("album", {}).get("images") or []
                img_url = _image_url(images)
                artist_id = (t.get("artists") or [{}])[0].get("id", "")
                album_id = t.get("album", {}).get("id", "")
                tracks.append({
                    "id": t.get("id"),
                    "name": t.get("name", ""),
                    "artist": artists,
                    "album": t.get("album", {}).get("name", ""),
                    "artist_id": artist_id,
                    "album_id": album_id,
                    "uri": t.get("uri", ""),
                    "duration_ms": t.get("duration_ms", 0),
                    "image_url": img_url,
                    "artwork_url": img_url,
                })
            cur_offset += len(raw_items)
            if not fetch_all or not raw_items or cur_offset >= total or len(tracks) >= 1000:
                break

        try:
            await plugin._annotate_tracks_liked(token, tracks)
        except Exception as ex:
            decky.logger.warning("Failed to annotate tracks liked: %s", ex)
        return {"ok": True, "tracks": tracks, "total": total or len(tracks), "offset": offset}
    except Exception as e:
        decky.logger.error("get_playlist_tracks failed: %s", e)
        return {"ok": False, "error": str(e)}


async def add_track_to_playlist(plugin, playlist_id: str, track_uri: str) -> dict:
    """Add a track URI to a playlist via Spotify's /playlists/{id}/items endpoint."""
    token = await plugin._ensure_token()
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


async def sync_native_spotify_folders(plugin) -> list[dict]:
    """Extract recursive playlist folders from Official Spotify Client CDP RootlistAPI (cached across backends) and merge custom folders."""
    custom_folders = [
        dict(f) for f in (plugin._settings.get("playlist_folders") or [])
        if isinstance(f, dict) and f.get("id") and f.get("source") not in ("spotify", "spotify_client")
    ]
    cached_tree = plugin._settings.get("spotify_folder_tree")
    if not isinstance(cached_tree, list):
        cached_tree = []

    try:
        cdp_tree = await _exec(_fetch_spotify_cdp_folder_tree, SPOTIFY_CDP_PORT, timeout=6)
        if isinstance(cdp_tree, list) and len(cdp_tree) > 0:
            proxied_tree = _proxy_folder_tree_images(cdp_tree)
            if proxied_tree != cached_tree:
                plugin._settings["spotify_folder_tree"] = proxied_tree
                _save_settings(plugin._settings)
            cached_tree = proxied_tree
    except Exception as e:
        decky.logger.debug("Live CDP folder sync skipped: %s", e)

    return _proxy_folder_tree_images(cached_tree) + custom_folders


async def get_playlist_folders(plugin) -> dict:
    """Fetch all native and custom playlist folders."""
    folders = await sync_native_spotify_folders(plugin)
    return {"ok": True, "folders": folders}


async def manage_playlist_folder(
    plugin,
    action: str,
    folder_id: str = "",
    name: str = "",
    playlist_id: str = "",
    folders: list | None = None,
) -> dict:
    """Create, rename, delete, or assign playlists to custom folders in Deckify."""
    current: list[dict] = [
        dict(f) for f in (plugin._settings.get("playlist_folders") or [])
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

    plugin._settings["playlist_folders"] = current
    _save_settings(plugin._settings)
    native_tree = _proxy_folder_tree_images(plugin._settings.get("spotify_folder_tree") or [])
    return {"ok": True, "folders": native_tree + current}


async def set_native_playlist_mix(plugin, playlist_id: str, enabled: bool = True, play_now: bool = True) -> dict:
    """Toggle native Spotify playlist mixing via Official Spotify Client CDP PlaylistMixingAPI."""
    pid = (playlist_id or "").strip()
    if pid.startswith("spotify:playlist:"):
        pid = pid.split(":")[-1]
    if not pid:
        return {"ok": False, "error": "Missing playlist_id"}
    uri = f"spotify:playlist:{pid}"

    is_librespot_running = bool(plugin._process and plugin._process.poll() is None)
    active_type = (plugin._active_device.get("type") or "").lower() if hasattr(plugin, "_active_device") and plugin._active_device else ""
    is_web_player = active_type in ("webplayer", "web_player")

    if plugin._settings.get("audio_backend") != "spotify_client" or is_librespot_running or is_web_player:
        if play_now:
            try:
                await plugin.play_tracks(context_uri=uri)
            except Exception as ex:
                decky.logger.warning("Playback fallback for playlist mix failed: %s", ex)
        return {"ok": False, "error": "Native Spotify Mix requires the Official Spotify Client backend"}

    enabled_js = "true" if enabled else "false"
    play_js = "true" if play_now else "false"
    expr = f"""
    (async () => {{
      const mainEl = document.getElementById('main');
      if (!mainEl) return {{ ok: false, error: 'Spotify UI not ready' }};
      const rk = Object.keys(mainEl).find(k => k.startsWith('__reactContainer') || k.startsWith('__reactFiber'));
      const q = [mainEl[rk]];
      const visited = new Set();
      let mixApi = null;
      let playerApi = null;
      while (q.length > 0 && visited.size < 5000) {{
        const curr = q.shift();
        if (!curr || visited.has(curr)) continue;
        visited.add(curr);
        if (curr.memoizedProps?.platform) {{
          const platform = curr.memoizedProps.platform;
          const reg = platform.getRegistry();
          const map = reg._map || reg;
          for (const [k, v] of map.entries()) {{
            const desc = String(k.description);
            if (desc === 'PlaylistMixingAPI') mixApi = v.instance;
            if (desc === 'PlayerAPI') playerApi = v.instance;
          }}
          break;
        }}
        if (curr.child) q.push(curr.child);
        if (curr.sibling) q.push(curr.sibling);
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
        res = await _exec(_cdp_evaluate, expr, SPOTIFY_CDP_PORT, None, 6.0, timeout=7)
        if isinstance(res, dict) and res.get("ok"):
            def _update_mixed(nodes: list[dict]) -> None:
                for folder in nodes:
                    for pl in folder.get("playlists") or []:
                        if pl.get("id") == pid:
                            pl["is_mixed"] = bool(enabled)
                    if folder.get("subfolders"):
                        _update_mixed(folder["subfolders"])

            tree = plugin._settings.get("spotify_folder_tree")
            if isinstance(tree, list):
                _update_mixed(tree)
                _save_settings(plugin._settings)
            return res
        if isinstance(res, dict):
            return res
        return {"ok": False, "error": "Official Spotify Client did not respond over CDP"}
    except Exception as e:
        decky.logger.warning("set_native_playlist_mix failed: %s", e)
        return {"ok": False, "error": str(e)}


async def create_playlist(plugin, name: str, public: bool = False) -> dict:
    """Create a new playlist in user library."""
    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}
    name = (name or "").strip()
    if not name:
        return {"ok": False, "error": "Playlist name cannot be empty"}
    try:
        res = await _exec(
            _spotify_api_request, "me/playlists", token, "POST", None,
            {"name": name, "public": bool(public)},
        )
        return {"ok": True, "playlist": res}
    except urllib.error.HTTPError as e:
        return {"ok": False, "error": _parse_spotify_error(e)}
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def remove_track_from_playlist(plugin, playlist_id: str, track_uri: str) -> dict:
    """Remove a track URI from a playlist."""
    token = await plugin._ensure_token()
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
                _spotify_api_request, f"playlists/{pid}/items", token, "DELETE", None,
                {"items": [{"uri": uri}]},
            )
        except urllib.error.HTTPError as e:
            if e.code in (400, 403, 404):
                await _exec(
                    _spotify_api_request, f"playlists/{pid}/tracks", token, "DELETE", None,
                    {"tracks": [{"uri": uri}]},
                )
            else:
                raise
        return {"ok": True}
    except urllib.error.HTTPError as e:
        return {"ok": False, "error": _parse_spotify_error(e)}
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def get_liked_tracks(plugin, offset: int = 0, fetch_all: bool = True) -> dict:
    """Fetch saved tracks (Liked Songs)."""
    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}
    try:
        tracks = []
        cur_offset = offset
        total = 0
        while True:
            data = await _exec(
                _spotify_api_request, "me/tracks", token, "GET",
                {"limit": 50, "offset": cur_offset},
            )
            items = data.get("items", []) if data else []
            total = data.get("total", 0) if data else 0
            for item in items:
                t = item.get("track")
                if t is None:
                    continue
                artists = ", ".join(a["name"] for a in t.get("artists", []))
                images = t.get("album", {}).get("images") or []
                img_url = _image_url(images)
                artist_id = (t.get("artists") or [{}])[0].get("id", "")
                album_id = t.get("album", {}).get("id", "")
                tracks.append({
                    "id": t.get("id"),
                    "name": t.get("name", ""),
                    "artist": artists,
                    "album": t.get("album", {}).get("name", ""),
                    "artist_id": artist_id,
                    "album_id": album_id,
                    "uri": t.get("uri", ""),
                    "duration_ms": t.get("duration_ms", 0),
                    "image_url": img_url,
                    "artwork_url": img_url,
                    "is_liked": True,
                })
            cur_offset += len(items)
            if not fetch_all or not items or len(tracks) >= total or len(tracks) >= 1000:
                break
        return {"ok": True, "tracks": tracks, "total": total, "offset": offset}
    except Exception as e:
        decky.logger.error("get_liked_tracks failed: %s", e)
        return {"ok": False, "error": str(e)}


async def get_saved_episodes(plugin, offset: int = 0) -> dict:
    """Fetch saved podcast episodes."""
    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}
    try:
        episodes = []
        data = await _exec(
            _spotify_api_request, "me/episodes", token, "GET",
            {"limit": 50, "offset": offset},
        )
        items = data.get("items", []) if data else []
        for item in items:
            ep = item.get("episode")
            if ep is None:
                continue
            images = ep.get("images") or []
            resume_point = ep.get("resume_point") or {}
            episodes.append({
                "id": ep.get("id"),
                "name": ep.get("name", ""),
                "show_name": ep.get("show", {}).get("name", ""),
                "uri": ep.get("uri", ""),
                "duration_ms": ep.get("duration_ms", 0),
                "image_url": _image_url(images),
                "artwork_url": _image_url(images),
                "resume_position_ms": resume_point.get("resume_position_ms", 0),
                "fully_played": bool(resume_point.get("fully_played", False)),
            })
        total = data.get("total", 0) if data else 0
        return {"ok": True, "episodes": episodes, "total": total, "offset": offset}
    except Exception as e:
        decky.logger.error("get_saved_episodes failed: %s", e)
        return {"ok": False, "error": str(e)}


async def get_saved_shows(plugin, offset: int = 0) -> dict:
    """Fetch followed podcast shows."""
    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}
    try:
        shows = []
        data = await _exec(
            _spotify_api_request, "me/shows", token, "GET",
            {"limit": 50, "offset": offset},
        )
        items = data.get("items", []) if data else []
        for item in items:
            show = item.get("show") or item
            if not show:
                continue
            images = show.get("images") or []
            shows.append({
                "id": show.get("id"),
                "name": show.get("name", ""),
                "publisher": show.get("publisher", ""),
                "uri": show.get("uri", ""),
                "total_episodes": show.get("total_episodes", 0),
                "image_url": _image_url(images),
                "artwork_url": _image_url(images),
            })
        total = data.get("total", 0) if data else 0
        return {"ok": True, "shows": shows, "total": total, "offset": offset}
    except Exception as e:
        decky.logger.error("get_saved_shows failed: %s", e)
        return {"ok": False, "error": str(e)}


async def get_saved_albums(plugin, offset: int = 0) -> dict:
    """Fetch saved albums from user library."""
    token = await plugin._ensure_token()
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
                "artwork_url": _image_url(images),
                "track_count": a.get("total_tracks", 0),
                "uri": a.get("uri", ""),
            })
        total = data.get("total", 0) if data else 0
        return {"ok": True, "albums": albums, "total": total, "offset": offset}
    except Exception as e:
        decky.logger.error("get_saved_albums failed: %s", e)
        return {"ok": False, "error": str(e)}


async def get_album_tracks(plugin, album_id: str, offset: int = 0) -> dict:
    """Fetch tracks for a specified album ID."""
    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}
    try:
        album_img = None
        album_name = ""
        try:
            alb_data = await _exec(_spotify_api_request, f"albums/{album_id}", token, "GET")
            if alb_data:
                album_img = _image_url(alb_data.get("images") or [])
                album_name = alb_data.get("name", "")
        except Exception:
            pass

        data = await _exec(
            _spotify_api_request,
            f"albums/{album_id}/tracks", token, "GET",
            {"limit": 50, "offset": offset},
        )
        items = data.get("items", []) if data else []
        tracks = []
        for t in items:
            artists = ", ".join(a["name"] for a in t.get("artists", []))
            artist_id = (t.get("artists") or [{}])[0].get("id", "")
            tracks.append({
                "id": t.get("id"),
                "name": t.get("name", ""),
                "artist": artists,
                "album": album_name,
                "artist_id": artist_id,
                "album_id": album_id,
                "uri": t.get("uri", ""),
                "duration_ms": t.get("duration_ms", 0),
                "image_url": album_img,
                "artwork_url": album_img,
            })
        await plugin._annotate_tracks_liked(token, tracks)
        total = data.get("total", 0) if data else 0
        return {"ok": True, "tracks": tracks, "total": total, "offset": offset}
    except Exception as e:
        decky.logger.error("get_album_tracks failed: %s", e)
        return {"ok": False, "error": str(e)}


async def get_followed_artists(plugin) -> dict:
    """Fetch followed artists from user library."""
    token = await plugin._ensure_token()
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
                "artwork_url": _image_url(images),
            })
        return {"ok": True, "artists": artists}
    except Exception as e:
        decky.logger.error("get_followed_artists failed: %s", e)
        return {"ok": False, "error": str(e)}


async def get_artist_albums(plugin, artist_id: str, offset: int = 0) -> dict:
    """Fetch releases for an artist."""
    token = await plugin._ensure_token()
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
                "artwork_url": _image_url(images),
                "track_count": a.get("total_tracks", 0),
                "uri": a.get("uri", ""),
            })
        total = data.get("total", 0) if data else 0
        return {"ok": True, "albums": albums, "total": total, "offset": offset}
    except Exception as e:
        decky.logger.error("get_artist_albums failed: %s", e)
        return {"ok": False, "error": str(e)}


async def get_artist_top_tracks(plugin, artist_id: str) -> dict:
    """Fetch top tracks for a specified artist."""
    token = await plugin._ensure_token()
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
            artist_id = (t.get("artists") or [{}])[0].get("id", "")
            album_id = t.get("album", {}).get("id", "")
            tracks.append({
                "id": t.get("id"),
                "name": t.get("name", ""),
                "artist": artists,
                "album": t.get("album", {}).get("name", ""),
                "artist_id": artist_id,
                "album_id": album_id,
                "uri": t.get("uri", ""),
                "duration_ms": t.get("duration_ms", 0),
                "image_url": _image_url(images),
                "artwork_url": _image_url(images),
            })
        await plugin._annotate_tracks_liked(token, tracks)
        return {"ok": True, "tracks": tracks}
    except Exception as e:
        decky.logger.error("get_artist_top_tracks failed: %s", e)
        return {"ok": False, "error": str(e)}


async def get_recently_played(plugin, limit: int = 30) -> dict:
    """Fetch user's recently played track list."""
    token = await plugin._ensure_token()
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
            img_url = _image_url(images)
            artist_id = (t.get("artists") or [{}])[0].get("id", "")
            album_id = t.get("album", {}).get("id", "")
            tracks.append({
                "id": t.get("id"),
                "name": t.get("name", ""),
                "artist": artists,
                "album": t.get("album", {}).get("name", ""),
                "artist_id": artist_id,
                "album_id": album_id,
                "uri": uri,
                "duration_ms": t.get("duration_ms", 0),
                "image_url": img_url,
                "artwork_url": img_url,
            })
        await plugin._annotate_tracks_liked(token, tracks)
        return {"ok": True, "tracks": tracks}
    except Exception as e:
        decky.logger.error("get_recently_played failed: %s", e)
        return {"ok": False, "error": str(e)}


async def search_spotify(
    plugin,
    query: str,
    types: str = "track,artist,album,playlist",
    limit: int = 50,
    offset: int = 0,
) -> dict:
    """Multi-entity search across tracks, artists, albums, and playlists."""
    if not query or not str(query).strip():
        return {"ok": True, "tracks": [], "artists": [], "albums": [], "playlists": []}
    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}
    try:
        final_limit = 50 if limit <= 0 else max(1, min(int(limit), 50))
        final_offset = max(0, int(offset))
        try:
            data = await _exec(
                _spotify_api_request, "search", token, "GET",
                {"q": query, "type": types, "limit": final_limit, "offset": final_offset},
            )
        except Exception as e:
            if "Invalid limit" in str(e) or "400" in str(e):
                data = await _exec(
                    _spotify_api_request, "search", token, "GET",
                    {"q": query, "type": types, "limit": min(final_limit, 10), "offset": final_offset},
                )
            else:
                raise
        if not data:
            return {"ok": True, "tracks": [], "artists": [], "albums": [], "playlists": []}
        tracks = []
        for t in data.get("tracks", {}).get("items", []):
            artists = ", ".join(a["name"] for a in t.get("artists", []))
            images = t.get("album", {}).get("images") or []
            artist_id = (t.get("artists") or [{}])[0].get("id", "")
            album_id = t.get("album", {}).get("id", "")
            tracks.append({
                "id": t.get("id"), "name": t.get("name", ""), "artist": artists,
                "album": t.get("album", {}).get("name", ""),
                "artist_id": artist_id, "album_id": album_id,
                "uri": t.get("uri", ""),
                "duration_ms": t.get("duration_ms", 0),
                "image_url": _image_url(images),
                "artwork_url": _image_url(images),
            })
        await plugin._annotate_tracks_liked(token, tracks)
        artists_out = []
        for a in data.get("artists", {}).get("items", []):
            images = a.get("images") or []
            raw_img = images[0].get("url") if images and isinstance(images, list) and isinstance(images[0], dict) else None
            artists_out.append({
                "id": a["id"], "name": a.get("name", ""),
                "uri": a.get("uri", f"spotify:artist:{a['id']}"),
                "image_url": _image_url(images) or raw_img,
            })
        albums_out = []
        for a in data.get("albums", {}).get("items", []):
            images = a.get("images") or []
            ar = ", ".join(x["name"] for x in a.get("artists", []))
            albums_out.append({
                "id": a["id"], "name": a.get("name", ""), "artist": ar,
                "image_url": _image_url(images),
                "artwork_url": _image_url(images),
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
                "artwork_url": _image_url(images),
                "track_count": (p.get("items") or p.get("tracks") or {}).get("total", 0),
                "owner_id": p.get("owner", {}).get("id", ""),
            })
        return {"ok": True, "tracks": tracks, "artists": artists_out, "albums": albums_out, "playlists": playlists_out}
    except Exception as e:
        decky.logger.error("search_spotify failed: %s", e)
        return {"ok": False, "error": str(e)}


async def get_track_recommendations(plugin, seed_track_id: str, limit: int = 25) -> dict:
    """Fetch track recommendations based on a seed track."""
    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}
    clean_seed = (seed_track_id or "").strip()
    if clean_seed.startswith("spotify:track:"):
        clean_seed = clean_seed.split(":")[-1]
    try:
        data = await _exec(
            _spotify_api_request, "recommendations", token, "GET",
            {"seed_tracks": clean_seed, "limit": min(100, max(1, limit))},
        )
        items = data.get("tracks", []) if data else []
        tracks = []
        for t in items:
            artists = ", ".join(a["name"] for a in t.get("artists", []))
            images = t.get("album", {}).get("images") or []
            img_url = _image_url(images)
            tracks.append({
                "id": t.get("id"),
                "name": t.get("name", ""),
                "artist": artists,
                "album": t.get("album", {}).get("name", ""),
                "uri": t.get("uri", ""),
                "duration_ms": t.get("duration_ms", 0),
                "image_url": img_url,
                "artwork_url": img_url,
            })
        await plugin._annotate_tracks_liked(token, tracks)
        return {"ok": True, "tracks": tracks}
    except Exception as e:
        decky.logger.error("get_track_recommendations failed: %s", e)
        return {"ok": False, "error": str(e)}


async def get_lyrics(
    plugin,
    track_name: str,
    artist_name: str,
    duration_sec: int = 0,
    provider_offset: int = 0,
) -> dict:
    """Fetch synchronized or plain lyrics using 5-tier waterfall with provider offset."""
    try:
        return await _exec(
            _fetch_lyrics_sync,
            track_name,
            artist_name,
            duration_sec,
            provider_offset,
            timeout=12,
        )
    except Exception as e:
        decky.logger.warning("get_lyrics failed: %s", e)
        return {"ok": False, "error": str(e)}


async def get_image(url: str) -> dict:
    """Fetch and return base64 Data URI for external image, bypassing CEF CSP restrictions."""
    if not url or not isinstance(url, str):
        return {"ok": False, "error": "No URL provided"}
    try:
        content_type, body = await _exec(_fetch_spotify_image, url, timeout=10)
        b64 = base64.b64encode(body).decode("ascii")
        return {"ok": True, "data_url": f"data:{content_type};base64,{b64}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}
