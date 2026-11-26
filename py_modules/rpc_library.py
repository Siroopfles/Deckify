import base64
import html
import json
import re
import secrets
import time
import urllib.error
import urllib.parse
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
    SpotifyRateLimitError,
    _spotify_api_request,
    _parse_spotify_error,
    _fetch_lyrics_sync,
)
from py_modules import cdp_bridge
from py_modules.cdp_bridge import (
    _classify_discovery_kind,
    cdp_fetch_browse_categories,
    cdp_fetch_discovery_mixes,
    cdp_get_playlist_tracks,
    cdp_search,
    cdp_set_playlist_mix,
    is_spotify_client_running,
    load_discovery_mixes_cache,
    save_discovery_mixes_cache,
)
from py_modules.engine import (
    _cdp_evaluate,
    _cdp_get_liked_tracks,
    _cdp_get_playlist_tracks,
    _cdp_get_saved_episodes,
    _fetch_spotify_cdp_folder_tree,
)
from py_modules.rpc_playback import annotate_tracks_liked


def annotate_offline_metadata(items: list[dict], cache: dict | None = None) -> list[dict]:
    """Attach offline_state, offline_progress, and offline_size_bytes from offline_downloads.json."""
    if not isinstance(items, list):
        return items
    cache_map = cache if isinstance(cache, dict) else cdp_bridge.load_offline_downloads_cache()
    if not isinstance(cache_map, dict):
        cache_map = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        uri = str(item.get("uri") or "").strip()
        entry = cache_map.get(uri) if uri else None
        if isinstance(entry, dict):
            item["offline_state"] = str(entry.get("offline_state") or "not_downloaded")
            try:
                prog = int(round(float(entry.get("progress", entry.get("offline_progress", 0)) or 0)))
            except (TypeError, ValueError):
                prog = 0
            item["offline_progress"] = max(0, min(100, prog))
            try:
                size_bytes = int(entry.get("size_bytes", entry.get("offline_size_bytes", 0)) or 0)
            except (TypeError, ValueError):
                size_bytes = 0
            item["offline_size_bytes"] = max(0, size_bytes)
        else:
            item.setdefault("offline_state", "not_downloaded")
            item.setdefault("offline_progress", 0)
            item.setdefault("offline_size_bytes", 0)
    return items


async def _get_current_user_id(plugin, token: str) -> str:
    """Return cached Spotify user ID, fetching /v1/me once per plugin session."""
    cached = getattr(plugin, "_current_user_id", "")
    if isinstance(cached, str) and cached.strip():
        return cached.strip()
    try:
        me = await _exec(_spotify_api_request, "me", token, "GET")
        uid = str((me or {}).get("id") or "").strip()
        if uid:
            plugin._current_user_id = uid
        return uid
    except Exception:
        return ""


async def get_playlists(plugin, offset: int = 0) -> dict:
    """Fetch current user's playlists."""
    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}
    try:
        data = await _exec(_spotify_api_request, "me/playlists", token, "GET", {"limit": 50, "offset": offset})
        items = data.get("items", []) if data else []
        needs_uid = any(
            not p.get("collaborative")
            and str((p.get("owner") or {}).get("id") or "") not in ("", "spotify")
            for p in items
            if p
        )
        current_user_id = await _get_current_user_id(plugin, token) if needs_uid else ""
        playlists = []
        for p in items:
            if not p:
                continue
            images = p.get("images") or []
            owner_id = str((p.get("owner") or {}).get("id") or "")
            collaborative = bool(p.get("collaborative", False))
            if owner_id == "spotify":
                is_editable = False
            else:
                is_editable = bool(
                    collaborative
                    or (owner_id and current_user_id and owner_id == current_user_id)
                )
            playlists.append({
                "id": p["id"],
                "uri": p.get("uri") or f"spotify:playlist:{p['id']}",
                "name": p.get("name", ""),
                "description": p.get("description") or "",
                "collaborative": collaborative,
                "owner_id": owner_id,
                "is_editable": is_editable,
                "image_url": _image_url(images),
                "artwork_url": _image_url(images),
                "track_count": (p.get("items") or p.get("tracks") or {}).get("total", 0),
            })
        annotate_offline_metadata(playlists)
        total = data.get("total", 0) if data else 0
        return {"ok": True, "playlists": playlists, "total": total, "offset": offset}
    except Exception as e:
        decky.logger.error("get_playlists failed: %s", e)
        return {"ok": False, "error": str(e)}


def _refresh_cached_mix_tracks(pid: str, tracks: list[dict], total: int | None = None) -> None:
    """Refresh cached mix tracks (up to 100) and URIs in discovery_mixes.json when present."""
    if not pid or not tracks:
        return
    try:
        disk_cache = load_discovery_mixes_cache()
        mixes = disk_cache.get("mixes")
        if not isinstance(mixes, list):
            return
        updated = False
        for m in mixes:
            if not isinstance(m, dict):
                continue
            if m.get("id") == pid or str(m.get("uri") or "").endswith(f":{pid}"):
                capped = [dict(t) for t in tracks[:100] if isinstance(t, dict)]
                m["tracks"] = capped
                m["uris"] = [t["uri"] for t in capped if t.get("uri")]
                if total:
                    m["track_count"] = total
                updated = True
                break
        if updated:
            disk_cache["version"] = disk_cache.get("version") or 1
            disk_cache["updated_at"] = int(time.time())
            save_discovery_mixes_cache(disk_cache)
    except Exception as e:
        decky.logger.debug("_refresh_cached_mix_tracks failed for %s: %s", pid, e)


def _get_cached_mix_tracks(pid: str) -> list[dict]:
    """Return cached tracks for an algorithmic mix from discovery_mixes.json, or []."""
    if not pid:
        return []
    disk_cache = load_discovery_mixes_cache()
    mixes = disk_cache.get("mixes")
    if not isinstance(mixes, list):
        return []
    for m in mixes:
        if not isinstance(m, dict):
            continue
        if m.get("id") == pid or str(m.get("uri") or "").endswith(f":{pid}"):
            tracks = m.get("tracks")
            if isinstance(tracks, list) and tracks:
                return [dict(t) for t in tracks if isinstance(t, dict)]
    return []


def _get_cached_mix_meta(pid: str) -> tuple[str, str]:
    """Return (name, description) for a cached algorithmic mix matching pid, or ('', '')."""
    if not pid:
        return "", ""
    disk_cache = load_discovery_mixes_cache()
    mixes = disk_cache.get("mixes")
    if not isinstance(mixes, list):
        return "", ""
    for m in mixes:
        if not isinstance(m, dict):
            continue
        if m.get("id") == pid or str(m.get("uri") or "").endswith(f":{pid}"):
            name = str(m.get("name") or "").strip()
            desc = str(m.get("description") or m.get("subtitle") or "").strip()
            return name, desc
    return "", ""


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
        playlist_name = ""
        playlist_description = ""

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
            if isinstance(data, dict):
                if not playlist_name and isinstance(data.get("name"), str) and data["name"].strip():
                    playlist_name = data["name"].strip()
                if not playlist_description and isinstance(data.get("description"), str) and data["description"].strip():
                    playlist_description = _strip_html(data["description"])
            items_obj = (
                (data.get("items") if "items" in data else data.get("tracks"))
                if isinstance(data, dict)
                else []
            )
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
                added_at = str(item.get("added_at") or "")
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
                    "added_at": added_at,
                })
            cur_offset += len(raw_items)
            if not fetch_all or not raw_items or cur_offset >= total or len(tracks) >= 1000:
                break

        if not tracks and cur_offset == 0:
            if is_spotify_client_running(plugin):
                try:
                    cdp_res = await _exec(_cdp_get_playlist_tracks, pid, offset, fetch_all)
                    if isinstance(cdp_res, dict) and cdp_res.get("ok") and cdp_res.get("tracks"):
                        tracks = cdp_res["tracks"]
                        for ct in tracks:
                            if isinstance(ct, dict) and "added_at" not in ct:
                                ct["added_at"] = str(ct.get("addedAt") or "")
                        total = cdp_res.get("total", len(tracks))
                        if not playlist_name and isinstance(cdp_res.get("playlist_name"), str) and cdp_res["playlist_name"].strip():
                            playlist_name = cdp_res["playlist_name"].strip()
                        if not playlist_description and isinstance(cdp_res.get("playlist_description"), str) and cdp_res["playlist_description"].strip():
                            playlist_description = _strip_html(cdp_res["playlist_description"])
                        _refresh_cached_mix_tracks(pid, tracks, total)
                except Exception as cdp_err:
                    decky.logger.warning("get_playlist_tracks CDP fallback failed: %s", cdp_err)
            if not tracks:
                cached_tracks = _get_cached_mix_tracks(pid)
                if cached_tracks:
                    try:
                        await plugin._annotate_tracks_liked(token, cached_tracks)
                    except Exception as ex:
                        decky.logger.warning("Failed to annotate cached mix tracks liked: %s", ex)
                    cached_name, cached_desc = _get_cached_mix_meta(pid)
                    if not playlist_name and cached_name:
                        playlist_name = cached_name
                    if not playlist_description and cached_desc:
                        playlist_description = _strip_html(cached_desc)
                    resp = {
                        "ok": True,
                        "tracks": cached_tracks,
                        "total": len(cached_tracks),
                        "has_more": False,
                        "cached": True,
                    }
                    if playlist_name:
                        resp["playlist_name"] = playlist_name
                    if playlist_description:
                        resp["playlist_description"] = playlist_description
                    return resp

        try:
            await plugin._annotate_tracks_liked(token, tracks)
        except Exception as ex:
            decky.logger.warning("Failed to annotate tracks liked: %s", ex)
        resp = {"ok": True, "tracks": tracks, "total": total or len(tracks), "offset": offset}
        if playlist_name:
            resp["playlist_name"] = playlist_name
        if playlist_description:
            resp["playlist_description"] = playlist_description
        return resp
    except urllib.error.HTTPError as e:
        if getattr(e, "code", None) in (403, 404) and int(offset) == 0:
            if is_spotify_client_running(plugin):
                try:
                    cdp_res = await _exec(_cdp_get_playlist_tracks, pid, offset, fetch_all)
                    if isinstance(cdp_res, dict) and cdp_res.get("ok"):
                        cdp_tracks = cdp_res.get("tracks") or []
                        for ct in cdp_tracks:
                            if isinstance(ct, dict) and "added_at" not in ct:
                                ct["added_at"] = str(ct.get("addedAt") or "")
                        if cdp_tracks:
                            _refresh_cached_mix_tracks(pid, cdp_tracks, cdp_res.get("total", len(cdp_tracks)))
                        try:
                            await plugin._annotate_tracks_liked(token, cdp_tracks)
                        except Exception:
                            pass
                        resp = {
                            "ok": True,
                            "tracks": cdp_tracks,
                            "total": cdp_res.get("total", len(cdp_tracks)),
                            "offset": offset,
                        }
                        cdp_name = str(cdp_res.get("playlist_name") or "").strip()
                        cdp_desc = _strip_html(cdp_res.get("playlist_description") or "")
                        if cdp_name:
                            resp["playlist_name"] = cdp_name
                        if cdp_desc:
                            resp["playlist_description"] = cdp_desc
                        return resp
                except Exception as cdp_err:
                    decky.logger.warning("get_playlist_tracks CDP %s fallback failed: %s", e.code, cdp_err)
            cached_tracks = _get_cached_mix_tracks(pid)
            if cached_tracks:
                try:
                    await plugin._annotate_tracks_liked(token, cached_tracks)
                except Exception as ex:
                    decky.logger.warning("Failed to annotate cached mix tracks liked: %s", ex)
                cached_name, cached_desc = _get_cached_mix_meta(pid)
                resp = {
                    "ok": True,
                    "tracks": cached_tracks,
                    "total": len(cached_tracks),
                    "has_more": False,
                    "cached": True,
                }
                if cached_name:
                    resp["playlist_name"] = cached_name
                if cached_desc:
                    resp["playlist_description"] = _strip_html(cached_desc)
                return resp
        decky.logger.error("get_playlist_tracks failed: %s", e)
        return {"ok": False, "error": _parse_spotify_error(e)}
    except Exception as e:
        decky.logger.error("get_playlist_tracks failed: %s", e)
        return {"ok": False, "error": str(e)}


async def add_track_to_playlist(plugin, playlist_id: str, track_uri: str) -> dict:
    """Add a track URI to a playlist via Spotify's /playlists/{id}/items endpoint with CDP fallback."""
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
            return {"ok": True, "playlist_id": pid, "track_uri": uri}
        except urllib.error.HTTPError as e:
            if e.code not in (400, 403, 404):
                raise
            try:
                await _exec(
                    _spotify_api_request,
                    f"playlists/{pid}/tracks", token, "POST", None,
                    {"uris": [uri]},
                )
                return {"ok": True, "playlist_id": pid, "track_uri": uri}
            except urllib.error.HTTPError as e2:
                if e2.code in (400, 403, 404) and cdp_bridge.is_spotify_client_running(plugin):
                    cdp_res = await _exec(
                        cdp_bridge.cdp_add_to_playlist,
                        f"spotify:playlist:{pid}",
                        [uri],
                    )
                    if cdp_res.get("ok"):
                        return {"ok": True, "playlist_id": pid, "track_uri": uri, "source": "cdp"}
                    return {"ok": False, "error": cdp_res.get("error") or _parse_spotify_error(e2)}
                raise
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

    try:
        res = await _exec(cdp_set_playlist_mix, pid, enabled, play_now, SPOTIFY_CDP_PORT, 6.0, timeout=7)
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


def _normalize_playlist_id(playlist_id: str) -> str:
    pid = (playlist_id or "").strip()
    if pid.startswith("spotify:playlist:"):
        return pid.split(":")[-1]
    return pid


def _cleanup_deleted_playlist_refs(plugin, pid: str) -> tuple[list, list]:
    """Remove deleted playlist ID/URI from pinned_playlists and playlist_folders on disk."""
    settings = getattr(plugin, "_settings", None)
    if not isinstance(settings, dict):
        return ([], [])
    target_uri = f"spotify:playlist:{pid}"
    targets = {pid, target_uri}

    pinned = settings.get("pinned_playlists")
    if isinstance(pinned, list):
        cleaned_pinned = []
        for entry in pinned:
            if isinstance(entry, str):
                if entry not in targets:
                    cleaned_pinned.append(entry)
            elif isinstance(entry, dict):
                if entry.get("id") not in targets and entry.get("uri") not in targets:
                    cleaned_pinned.append(entry)
            else:
                cleaned_pinned.append(entry)
        settings["pinned_playlists"] = cleaned_pinned

    def _clean_folders(folder_list: list) -> None:
        for folder in folder_list:
            if not isinstance(folder, dict):
                continue
            pids = folder.get("playlist_ids")
            if isinstance(pids, list):
                folder["playlist_ids"] = [x for x in pids if x not in targets]
            nested = folder.get("folders")
            if isinstance(nested, list):
                _clean_folders(nested)

    folders = settings.get("playlist_folders")
    if isinstance(folders, list):
        _clean_folders(folders)

    _save_settings(settings)
    return (
        list(settings.get("pinned_playlists") or []),
        list(settings.get("playlist_folders") or []),
    )


async def create_playlist(plugin, name: str, public: bool = False, description: str = "") -> dict:
    """Create a new playlist in user library with optional description and CDP fallback."""
    clean_name = (name or "").strip()
    if not clean_name:
        return {"ok": False, "error": "Playlist name cannot be empty"}
    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}
    clean_desc = (description or "").strip()
    try:
        res = await _exec(
            _spotify_api_request, "me/playlists", token, "POST", None,
            {"name": clean_name, "public": bool(public), "description": clean_desc},
        )
        res = res or {}
        pid = str(res.get("id") or "")
        uri = str(res.get("uri") or (f"spotify:playlist:{pid}" if pid else ""))
        owner_id = str((res.get("owner") or {}).get("id") or getattr(plugin, "_current_user_id", "") or "")
        images = res.get("images") or []
        playlist_obj = {
            "id": pid,
            "uri": uri,
            "name": res.get("name") or clean_name,
            "description": res.get("description") if res.get("description") is not None else clean_desc,
            "owner_id": owner_id,
            "collaborative": bool(res.get("collaborative", False)),
            "is_editable": True,
            "track_count": ((res.get("items") or res.get("tracks") or {}).get("total", 0)),
            "image_url": _image_url(images) if images else None,
        }
        return {"ok": True, "playlist": playlist_obj}
    except urllib.error.HTTPError as e:
        if e.code in (400, 403, 404) and cdp_bridge.is_spotify_client_running(plugin):
            cdp_res = await _exec(cdp_bridge.cdp_create_playlist, clean_name, clean_desc)
            if cdp_res.get("ok"):
                pid = str(cdp_res.get("id") or "")
                uri = str(cdp_res.get("uri") or (f"spotify:playlist:{pid}" if pid else ""))
                playlist_obj = {
                    "id": pid,
                    "uri": uri,
                    "name": cdp_res.get("name") or clean_name,
                    "description": cdp_res.get("description") if cdp_res.get("description") is not None else clean_desc,
                    "owner_id": str(getattr(plugin, "_current_user_id", "") or ""),
                    "collaborative": False,
                    "is_editable": True,
                    "track_count": 0,
                    "image_url": None,
                }
                return {"ok": True, "playlist": playlist_obj, "source": "cdp"}
            return {"ok": False, "error": cdp_res.get("error") or _parse_spotify_error(e)}
        return {"ok": False, "error": _parse_spotify_error(e)}
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def update_playlist_details(plugin, playlist_id: str, name: str, description: str = "") -> dict:
    """Update playlist name and description via Web API with CDP fallback."""
    clean_name = (name or "").strip()
    if not clean_name:
        return {"ok": False, "error": "Playlist name cannot be empty"}
    pid = _normalize_playlist_id(playlist_id)
    if not pid:
        return {"ok": False, "error": "Missing playlist_id"}
    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}
    clean_desc = (description or "").strip()
    try:
        await _exec(
            _spotify_api_request,
            f"playlists/{pid}",
            token,
            "PUT",
            None,
            {"name": clean_name, "description": clean_desc},
        )
        return {"ok": True, "playlist_id": pid, "name": clean_name, "description": clean_desc}
    except urllib.error.HTTPError as e:
        if e.code in (400, 403, 404) and cdp_bridge.is_spotify_client_running(plugin):
            cdp_res = await _exec(
                cdp_bridge.cdp_update_playlist_details,
                f"spotify:playlist:{pid}",
                clean_name,
                clean_desc,
            )
            if cdp_res.get("ok"):
                return {
                    "ok": True,
                    "playlist_id": pid,
                    "name": clean_name,
                    "description": clean_desc,
                    "source": "cdp",
                }
            return {"ok": False, "error": cdp_res.get("error") or _parse_spotify_error(e)}
        return {"ok": False, "error": _parse_spotify_error(e)}
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def delete_playlist(plugin, playlist_id: str) -> dict:
    """Delete/unfollow a playlist and clean up pinned_playlists and playlist_folders."""
    pid = _normalize_playlist_id(playlist_id)
    if not pid:
        return {"ok": False, "error": "Missing playlist_id"}
    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}
    source = "web_api"
    try:
        await _exec(_spotify_api_request, f"playlists/{pid}/followers", token, "DELETE")
    except urllib.error.HTTPError as e:
        if e.code in (400, 403, 404) and cdp_bridge.is_spotify_client_running(plugin):
            cdp_res = await _exec(cdp_bridge.cdp_delete_playlist, f"spotify:playlist:{pid}")
            if not cdp_res.get("ok"):
                return {"ok": False, "error": cdp_res.get("error") or _parse_spotify_error(e)}
            source = "cdp"
        else:
            return {"ok": False, "error": _parse_spotify_error(e)}
    except Exception as e:
        return {"ok": False, "error": str(e)}

    pinned, folders = _cleanup_deleted_playlist_refs(plugin, pid)
    return {
        "ok": True,
        "playlist_id": pid,
        "pinned_playlists": pinned,
        "folders": folders,
        "source": source,
    }


async def reorder_playlist_tracks(
    plugin,
    playlist_id: str,
    from_index: int,
    to_index: int,
    range_length: int = 1,
    snapshot_id: str = "",
    uid: str = "",
    target_uid: str = "",
) -> dict:
    """Reorder tracks in a playlist via Web API (/items then /tracks) with CDP fallback."""
    pid = _normalize_playlist_id(playlist_id)
    if not pid:
        return {"ok": False, "error": "Missing playlist_id"}
    try:
        src = int(from_index)
        dst = int(to_index)
        length = max(1, int(range_length))
    except (TypeError, ValueError):
        return {"ok": False, "error": "Invalid playlist indices"}
    if src < 0 or dst < 0:
        return {"ok": False, "error": "Playlist indices must be non-negative"}
    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}
    insert_before = dst + 1 if dst > src else dst
    payload: dict = {
        "range_start": src,
        "insert_before": insert_before,
        "range_length": length,
    }
    if snapshot_id:
        payload["snapshot_id"] = str(snapshot_id)

    try:
        try:
            res = await _exec(
                _spotify_api_request, f"playlists/{pid}/items", token, "PUT", None, payload,
            )
            return {"ok": True, "snapshot_id": (res or {}).get("snapshot_id", ""), "insert_before": insert_before}
        except urllib.error.HTTPError as e:
            if e.code not in (400, 403, 404):
                raise
            try:
                res = await _exec(
                    _spotify_api_request, f"playlists/{pid}/tracks", token, "PUT", None, payload,
                )
                return {"ok": True, "snapshot_id": (res or {}).get("snapshot_id", ""), "insert_before": insert_before}
            except urllib.error.HTTPError as e2:
                if (
                    e2.code in (400, 403, 404)
                    and cdp_bridge.is_spotify_client_running(plugin)
                    and uid
                    and target_uid
                ):
                    cdp_res = await _exec(
                        cdp_bridge.cdp_reorder_playlist_track,
                        f"spotify:playlist:{pid}",
                        str(uid),
                        str(target_uid),
                        dst > src,
                    )
                    if cdp_res.get("ok"):
                        return {"ok": True, "insert_before": insert_before, "source": "cdp"}
                    return {"ok": False, "error": cdp_res.get("error") or _parse_spotify_error(e2)}
                raise
    except urllib.error.HTTPError as e:
        return {"ok": False, "error": _parse_spotify_error(e)}
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def remove_track_from_playlist(
    plugin,
    playlist_id: str,
    track_uri: str,
    position: int | None = None,
    uid: str = "",
) -> dict:
    """Remove a track URI (or single instance by position/uid) from a playlist."""
    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}
    pid = _normalize_playlist_id(playlist_id)
    uri = (track_uri or "").strip()
    if uri and not uri.startswith("spotify:"):
        uri = f"spotify:track:{uri}"
    if not pid or not uri:
        return {"ok": False, "error": "Missing playlist_id or track_uri"}

    item_obj: dict = {"uri": uri}
    if position is not None:
        item_obj["positions"] = [int(position)]

    try:
        try:
            await _exec(
                _spotify_api_request, f"playlists/{pid}/items", token, "DELETE", None,
                {"items": [item_obj]},
            )
            return {"ok": True}
        except urllib.error.HTTPError as e:
            if e.code not in (400, 403, 404):
                raise
            try:
                await _exec(
                    _spotify_api_request, f"playlists/{pid}/tracks", token, "DELETE", None,
                    {"tracks": [item_obj]},
                )
                return {"ok": True}
            except urllib.error.HTTPError as e2:
                if e2.code in (400, 403, 404) and cdp_bridge.is_spotify_client_running(plugin):
                    cdp_res = await _exec(
                        cdp_bridge.cdp_remove_from_playlist,
                        f"spotify:playlist:{pid}",
                        uri,
                        str(uid or ""),
                    )
                    if cdp_res.get("ok"):
                        return {"ok": True, "source": "cdp"}
                    return {"ok": False, "error": cdp_res.get("error") or _parse_spotify_error(e2)}
                raise
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
    except urllib.error.HTTPError as e:
        if getattr(e, "code", None) == 403:
            is_spotify_client = (
                plugin._settings.get("audio_backend") == "spotify_client"
                and bool(
                    getattr(plugin, "_spotify_client_process", None)
                    and plugin._spotify_client_process.poll() is None
                )
            )
            if is_spotify_client:
                try:
                    cdp_res = await _exec(_cdp_get_liked_tracks, offset, fetch_all)
                    if isinstance(cdp_res, dict) and cdp_res.get("ok"):
                        return cdp_res
                except Exception as cdp_err:
                    decky.logger.warning("get_liked_tracks CDP fallback failed: %s", cdp_err)
        return {"ok": False, "error": _parse_spotify_error(e)}
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
            {"limit": 50, "offset": offset, "market": "from_token"},
        )
        items = data.get("items", []) if data else []
        missing_duration_ids: list[str] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            ep = item.get("episode") if "episode" in item else item
            if not isinstance(ep, dict):
                continue
            ep_id = ep.get("id")
            ep_name = ep.get("name") or ""
            if not ep_id and not ep_name:
                continue
            show = ep.get("show") or {}
            if not isinstance(show, dict):
                show = {}
            images = ep.get("images") or []
            resume_point = ep.get("resume_point") or {}
            dur_ms = int(ep.get("duration_ms") or 0)
            if dur_ms <= 0 and ep_id:
                missing_duration_ids.append(ep_id)
            episodes.append({
                "id": ep_id,
                "name": ep_name,
                "show_name": show.get("name", ""),
                "uri": ep.get("uri", ""),
                "duration_ms": dur_ms,
                "image_url": _image_url(images),
                "artwork_url": _image_url(images),
                "resume_position_ms": int(resume_point.get("resume_position_ms") or 0),
                "fully_played": bool(resume_point.get("fully_played", False)),
            })
        if len(episodes) < len(items):
            is_spotify_client = (
                plugin._settings.get("audio_backend") == "spotify_client"
                and bool(
                    getattr(plugin, "_spotify_client_process", None)
                    and plugin._spotify_client_process.poll() is None
                )
            )
            if is_spotify_client:
                try:
                    cdp_res = await _exec(_cdp_get_saved_episodes, offset)
                    if isinstance(cdp_res, dict) and cdp_res.get("ok") and cdp_res.get("episodes"):
                        return cdp_res
                except Exception as cdp_err:
                    decky.logger.warning("get_saved_episodes CDP fallback failed: %s", cdp_err)
        if missing_duration_ids:
            try:
                ep_batch = await _exec(
                    _spotify_api_request,
                    "episodes",
                    token,
                    "GET",
                    {"ids": ",".join(missing_duration_ids[:50]), "market": "from_token"},
                )
                dur_map = {}
                for full_ep in (ep_batch or {}).get("episodes") or []:
                    if isinstance(full_ep, dict) and full_ep.get("id"):
                        dur_map[full_ep["id"]] = (
                            int(full_ep.get("duration_ms") or 0),
                            (full_ep.get("show") or {}).get("name", "") if isinstance(full_ep.get("show"), dict) else "",
                        )
                for row in episodes:
                    if row.get("duration_ms", 0) <= 0 and row.get("id") in dur_map:
                        d_ms, s_name = dur_map[row["id"]]
                        if d_ms > 0:
                            row["duration_ms"] = d_ms
                        if not row.get("show_name") and s_name:
                            row["show_name"] = s_name
            except Exception as ex:
                decky.logger.warning("get_saved_episodes duration backfill failed: %s", ex)
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
        annotate_offline_metadata(shows)
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
        annotate_offline_metadata(albums)
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


async def get_show_episodes(plugin, show_id: str, offset: int = 0) -> dict:
    """Fetch episodes for a specified podcast show ID with resume metadata."""
    if not isinstance(show_id, str) or not show_id.strip():
        return {"ok": False, "error": "Invalid show_id"}
    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}
    safe_id = urllib.parse.quote(show_id.strip(), safe="")
    try:
        safe_offset = max(0, int(offset))
    except (TypeError, ValueError):
        safe_offset = 0
    try:
        show_name = ""
        show_images: list = []
        try:
            show_data = await _exec(
                _spotify_api_request, f"shows/{safe_id}", token, "GET", {"market": "from_token"}
            )
            if isinstance(show_data, dict):
                show_name = show_data.get("name", "") or ""
                show_images = show_data.get("images") or []
        except Exception:
            pass

        data = await _exec(
            _spotify_api_request,
            f"shows/{safe_id}/episodes",
            token,
            "GET",
            {"limit": 50, "offset": safe_offset, "market": "from_token"},
        )
        items = data.get("items", []) if isinstance(data, dict) else []
        episodes = []
        for ep in items:
            if not isinstance(ep, dict):
                continue
            ep_id = ep.get("id")
            ep_name = ep.get("name") or ""
            if not ep_id and not ep_name:
                continue
            images = ep.get("images") or show_images
            img_url = _image_url(images)
            resume_point = ep.get("resume_point") or {}
            if not isinstance(resume_point, dict):
                resume_point = {}
            episodes.append({
                "id": ep_id,
                "name": ep_name,
                "show_name": show_name or (ep.get("show") or {}).get("name", ""),
                "uri": ep.get("uri", ""),
                "duration_ms": int(ep.get("duration_ms") or 0),
                "release_date": ep.get("release_date", ""),
                "image_url": img_url,
                "artwork_url": img_url,
                "resume_position_ms": int(resume_point.get("resume_position_ms") or 0),
                "fully_played": bool(resume_point.get("fully_played", False)),
            })
        annotate_offline_metadata(episodes)
        total = data.get("total", len(episodes)) if isinstance(data, dict) else len(episodes)
        return {"ok": True, "episodes": episodes, "total": total, "offset": safe_offset}
    except Exception as e:
        decky.logger.error("get_show_episodes failed: %s", e)
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
        annotate_offline_metadata(albums)
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


async def get_artist_info(plugin, artist_id: str) -> dict:
    """Fetch metadata for a single artist."""
    if not isinstance(artist_id, str) or not artist_id.strip():
        return {"ok": False, "error": "Invalid artist_id"}
    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}
    clean_id = artist_id.strip()
    safe_id = urllib.parse.quote(clean_id, safe="")
    try:
        data = await _exec(_spotify_api_request, f"artists/{safe_id}", token, "GET")
        if not isinstance(data, dict):
            return {"ok": False, "error": "Artist not found"}
        images = data.get("images") or []
        return {
            "ok": True,
            "artist": {
                "id": data.get("id") or clean_id,
                "name": data.get("name", ""),
                "uri": data.get("uri", f"spotify:artist:{clean_id}"),
                "image_url": _image_url(images),
            },
        }
    except Exception as e:
        decky.logger.error("get_artist_info failed: %s", e)
        return {"ok": False, "error": str(e)}


async def get_artist_all_tracks(
    plugin,
    artist_id: str,
    album_offset: int = 0,
    album_limit: int = 3,
) -> dict:
    """Fetch full artist discography tracks paginated across albums."""
    if not isinstance(artist_id, str) or not artist_id.strip():
        return {"ok": False, "error": "Invalid artist_id"}
    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}
    try:
        clamped_limit = max(1, min(int(album_limit), 5))
    except (TypeError, ValueError):
        clamped_limit = 3
    try:
        clamped_offset = max(0, int(album_offset))
    except (TypeError, ValueError):
        clamped_offset = 0

    clean_id = artist_id.strip()
    safe_id = urllib.parse.quote(clean_id, safe="")
    try:
        albums_data = await _exec(
            _spotify_api_request,
            f"artists/{safe_id}/albums",
            token,
            "GET",
            {
                "limit": clamped_limit,
                "offset": clamped_offset,
                "include_groups": "album,single",
            },
        )
        album_items = (albums_data or {}).get("items") or []
        tracks: list[dict] = []
        for alb in album_items:
            if not alb or not isinstance(alb, dict):
                continue
            alb_id = str(alb.get("id") or "").strip()
            if not alb_id:
                continue
            safe_alb_id = urllib.parse.quote(alb_id, safe="")
            alb_name = alb.get("name", "")
            img_url = _image_url(alb.get("images") or [])
            alb_tracks_data = await _exec(
                _spotify_api_request,
                f"albums/{safe_alb_id}/tracks",
                token,
                "GET",
                {"limit": 50},
            )
            for t in (alb_tracks_data or {}).get("items") or []:
                if not t or not isinstance(t, dict):
                    continue
                t_artists = [a for a in (t.get("artists") or []) if isinstance(a, dict)]
                artists_str = ", ".join(a.get("name", "") for a in t_artists if a.get("name"))
                first_artist_id = t_artists[0].get("id", "") if t_artists else clean_id
                tracks.append({
                    "id": t.get("id"),
                    "name": t.get("name", ""),
                    "artist": artists_str,
                    "artist_id": first_artist_id,
                    "album": alb_name,
                    "album_id": alb_id,
                    "uri": t.get("uri", ""),
                    "duration_ms": int(t.get("duration_ms") or 0),
                    "image_url": img_url,
                    "artwork_url": img_url,
                })
        await plugin._annotate_tracks_liked(token, tracks)
        total_albums = int((albums_data or {}).get("total") or 0)
        next_offset = clamped_offset + len(album_items)
        has_more = next_offset < total_albums and len(album_items) > 0
        return {
            "ok": True,
            "tracks": tracks,
            "next_album_offset": next_offset,
            "has_more": has_more,
            "total_albums": total_albums,
        }
    except Exception as e:
        decky.logger.error("get_artist_all_tracks failed: %s", e)
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
    limit: int = 10,
    offset: int = 0,
) -> dict:
    """Multi-entity search across tracks, artists, albums, playlists, shows, and episodes."""
    if not query or not str(query).strip():
        return {
            "ok": True,
            "tracks": [],
            "artists": [],
            "albums": [],
            "playlists": [],
            "shows": [],
            "episodes": [],
        }
    final_limit = 10 if limit <= 0 else max(1, min(int(limit), 10))
    final_offset = max(0, int(offset))

    if cdp_bridge.is_spotify_client_running(plugin):
        try:
            cdp_res = await _exec(cdp_search, query, types, final_limit, final_offset)
            if isinstance(cdp_res, dict) and cdp_res.get("ok") and any(
                cdp_res.get(k) for k in ("tracks", "artists", "albums", "playlists", "shows", "episodes")
            ):
                liked_cache = getattr(plugin, "_liked_cache", None)
                for t in cdp_res.get("tracks") or []:
                    if isinstance(t, dict) and "is_liked" not in t:
                        tid = t.get("id")
                        if isinstance(liked_cache, dict) and tid in liked_cache:
                            t["is_liked"] = bool(liked_cache[tid])
                        elif isinstance(liked_cache, (set, frozenset)) and tid in liked_cache:
                            t["is_liked"] = True
                        else:
                            t["is_liked"] = False
                return cdp_res
        except Exception as cdp_err:
            decky.logger.debug("cdp_search failed, falling back to Web API: %s", cdp_err)

    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}
    try:
        try:
            data = await _exec(
                _spotify_api_request, "search", token, "GET",
                {
                    "q": query,
                    "type": types,
                    "limit": final_limit,
                    "offset": final_offset,
                },
            )
        except Exception as e:
            if "Invalid limit" in str(e) or "400" in str(e) or "403" in str(e):
                data = await _exec(
                    _spotify_api_request, "search", token, "GET",
                    {
                        "q": query,
                        "type": types,
                        "limit": min(final_limit, 10),
                        "offset": final_offset,
                    },
                )
            else:
                raise
        if not data:
            return {
                "ok": True,
                "tracks": [],
                "artists": [],
                "albums": [],
                "playlists": [],
                "shows": [],
                "episodes": [],
            }
        tracks = []
        for t in (data.get("tracks") or {}).get("items") or []:
            if not t or not isinstance(t, dict):
                continue
            artists = ", ".join(a["name"] for a in t.get("artists", []) if isinstance(a, dict) and a.get("name"))
            images = (t.get("album") or {}).get("images") or []
            artist_id = ((t.get("artists") or [{}])[0] or {}).get("id", "")
            album_id = (t.get("album") or {}).get("id", "")
            tracks.append({
                "id": t.get("id"), "name": t.get("name", ""), "artist": artists,
                "album": (t.get("album") or {}).get("name", ""),
                "artist_id": artist_id, "album_id": album_id,
                "uri": t.get("uri", ""),
                "duration_ms": t.get("duration_ms", 0),
                "image_url": _image_url(images),
                "artwork_url": _image_url(images),
            })
        await plugin._annotate_tracks_liked(token, tracks)
        artists_out = []
        for a in (data.get("artists") or {}).get("items") or []:
            if not a or not isinstance(a, dict):
                continue
            images = a.get("images") or []
            raw_img = images[0].get("url") if images and isinstance(images, list) and isinstance(images[0], dict) else None
            a_id = a.get("id", "")
            artists_out.append({
                "id": a_id, "name": a.get("name", ""),
                "uri": a.get("uri", f"spotify:artist:{a_id}"),
                "image_url": _image_url(images) or raw_img,
            })
        albums_out = []
        for a in (data.get("albums") or {}).get("items") or []:
            if not a or not isinstance(a, dict):
                continue
            images = a.get("images") or []
            ar = ", ".join(x["name"] for x in a.get("artists", []) if isinstance(x, dict) and x.get("name"))
            albums_out.append({
                "id": a.get("id"), "name": a.get("name", ""), "artist": ar,
                "image_url": _image_url(images),
                "artwork_url": _image_url(images),
                "track_count": a.get("total_tracks", 0), "uri": a.get("uri", ""),
            })
        playlists_out = []
        for p in (data.get("playlists") or {}).get("items") or []:
            if not p or not isinstance(p, dict):
                continue
            images = p.get("images") or []
            p_id = p.get("id", "")
            playlists_out.append({
                "id": p_id, "name": p.get("name", ""),
                "uri": p.get("uri") or f"spotify:playlist:{p_id}",
                "image_url": _image_url(images),
                "artwork_url": _image_url(images),
                "track_count": (p.get("items") or p.get("tracks") or {}).get("total", 0),
                "owner_id": (p.get("owner") or {}).get("id", ""),
            })
        shows_out = []
        for s in (data.get("shows") or {}).get("items") or []:
            if not s or not isinstance(s, dict):
                continue
            images = s.get("images") or []
            s_id = s.get("id", "")
            shows_out.append({
                "id": s_id,
                "name": s.get("name", ""),
                "publisher": s.get("publisher", ""),
                "image_url": _image_url(images),
                "total_episodes": int(s.get("total_episodes") or 0),
                "uri": s.get("uri") or (f"spotify:show:{s_id}" if s_id else ""),
            })
        episodes_out = []
        for ep in (data.get("episodes") or {}).get("items") or []:
            if not ep or not isinstance(ep, dict):
                continue
            resume_point = ep.get("resume_point") or {}
            if not isinstance(resume_point, dict):
                resume_point = {}
            show_obj = ep.get("show") or {}
            if not isinstance(show_obj, dict):
                show_obj = {}
            images = ep.get("images") or show_obj.get("images") or []
            img_url = _image_url(images)
            episodes_out.append({
                "id": ep.get("id"),
                "name": ep.get("name", ""),
                "show_name": show_obj.get("name", ""),
                "uri": ep.get("uri", ""),
                "duration_ms": int(ep.get("duration_ms") or 0),
                "release_date": ep.get("release_date", ""),
                "image_url": img_url,
                "artwork_url": img_url,
                "resume_position_ms": int(resume_point.get("resume_position_ms") or 0),
                "fully_played": bool(resume_point.get("fully_played", False)),
            })
        return {
            "ok": True,
            "tracks": tracks,
            "artists": artists_out,
            "albums": albums_out,
            "playlists": playlists_out,
            "shows": shows_out,
            "episodes": episodes_out,
        }
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
    track_id: str = "",
    force_refresh: bool = False,
) -> dict:
    """Fetch synchronized or plain lyrics using 5-tier waterfall with provider offset."""
    try:
        return await _exec(
            _fetch_lyrics_sync,
            track_name,
            artist_name,
            duration_sec,
            provider_offset,
            track_id,
            bool(force_refresh),
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


_VALID_DISCOVERY_RANGES = ("short_term", "medium_term", "long_term")
_TOP_TTL_SECONDS = 3600.0
_STATIC_TTL_SECONDS = 14400.0
_DISCOVERY_CACHE: dict[str, dict] = {}


def _clear_discovery_cache() -> None:
    """Clear the in-memory discovery feed TTL cache."""
    _DISCOVERY_CACHE.clear()


def _strip_html(text: str) -> str:
    """Remove HTML tags, unescape HTML entities, and collapse whitespace."""
    if not text:
        return ""
    cleaned = re.sub(r"<[^>]+>", "", str(text))
    cleaned = html.unescape(cleaned)
    return re.sub(r"\s+", " ", cleaned).strip()


def _format_discovery_playlist(p: dict) -> dict:
    images = p.get("images") or []
    img_url = _image_url(images)
    pid = p.get("id", "")
    out = {
        "id": pid,
        "uri": p.get("uri") or (f"spotify:playlist:{pid}" if pid else ""),
        "name": p.get("name", ""),
        "image_url": img_url,
        "artwork_url": img_url,
        "track_count": (p.get("items") or p.get("tracks") or {}).get("total", 0),
        "owner_id": (p.get("owner") or {}).get("id", ""),
    }
    desc = _strip_html(p.get("description") or "")
    if desc:
        out["subtitle"] = desc
    return out


def _format_discovery_track(t: dict) -> dict:
    artists = ", ".join(a.get("name", "") for a in t.get("artists", []))
    album = t.get("album") or {}
    images = album.get("images") or []
    img_url = _image_url(images)
    artist_id = (t.get("artists") or [{}])[0].get("id", "")
    album_id = album.get("id", "")
    return {
        "id": t.get("id"),
        "name": t.get("name", ""),
        "artist": artists,
        "album": album.get("name", ""),
        "artist_id": artist_id,
        "album_id": album_id,
        "uri": t.get("uri", ""),
        "duration_ms": t.get("duration_ms", 0),
        "image_url": img_url,
        "artwork_url": img_url,
    }


def _format_discovery_artist(a: dict) -> dict:
    images = a.get("images") or []
    img_url = _image_url(images)
    aid = a.get("id", "")
    return {
        "id": aid,
        "uri": a.get("uri") or (f"spotify:artist:{aid}" if aid else ""),
        "name": a.get("name", ""),
        "genres": a.get("genres") or [],
        "image_url": img_url,
        "artwork_url": img_url,
    }


def _format_discovery_album(alb: dict) -> dict:
    images = alb.get("images") or []
    img_url = _image_url(images)
    aid = alb.get("id", "")
    artists = ", ".join(a.get("name", "") for a in alb.get("artists", []))
    return {
        "id": aid,
        "uri": alb.get("uri") or (f"spotify:album:{aid}" if aid else ""),
        "name": alb.get("name", ""),
        "artist": artists,
        "image_url": img_url,
        "artwork_url": img_url,
        "release_date": alb.get("release_date", ""),
        "total_tracks": alb.get("total_tracks", 0),
    }


def _mix_sort_key(mix: dict) -> tuple[int, int, str]:
    name = str(mix.get("name") or "").strip().lower()
    subtitle = str(mix.get("subtitle") or "").strip().lower()
    pid = str(mix.get("id") or "").strip()
    if "daylist" in name or "daylist" in subtitle or pid == "37i9dQZF1EP6YuccBxUcC1":
        return (0, 0, name)
    if "discover weekly" in name:
        return (1, 0, name)
    if "release radar" in name:
        return (2, 0, name)
    if "daily mix" in name:
        num = 99
        for part in name.split():
            if part.isdigit():
                num = int(part)
                break
        return (3, num, name)
    if "on repeat" in name:
        return (4, 0, name)
    return (5, 0, name)


def _sort_algorithmic_mixes(mixes: list[dict]) -> list[dict]:
    """Deduplicate algorithmic mixes by URI and sort core Spotify mixes to the front."""
    by_uri: dict[str, dict] = {}
    for raw in mixes:
        if not isinstance(raw, dict):
            continue
        uri = str(raw.get("uri") or "").strip()
        pid = str(raw.get("id") or (uri.split(":")[-1] if ":" in uri else "")).strip()
        if not uri and pid:
            uri = f"spotify:playlist:{pid}"
        if not uri:
            continue
        norm = dict(raw)
        norm["id"] = pid or uri.split(":")[-1]
        norm["uri"] = uri
        if not norm.get("artwork_url") and norm.get("image_url"):
            norm["artwork_url"] = norm["image_url"]
        if not norm.get("image_url") and norm.get("artwork_url"):
            norm["image_url"] = norm["artwork_url"]
        if not norm.get("subtitle"):
            norm["subtitle"] = "Made for you"
        if not norm.get("owner_id") and norm.get("owner"):
            norm["owner_id"] = str(norm["owner"])
        norm.setdefault("type", "playlist")

        existing = by_uri.get(uri)
        if existing is None:
            by_uri[uri] = norm
        else:
            for k in ("image_url", "artwork_url", "subtitle", "tracks", "uris", "track_count", "owner_id"):
                if not existing.get(k) and norm.get(k):
                    existing[k] = norm[k]
    return sorted(by_uri.values(), key=_mix_sort_key)


def _partition_discovery_mixes(mixes: list[dict]) -> tuple[list[dict], list[dict], dict | None]:
    """Classify mixes into (core_mixes, blends, dj) and drop editorial clutter."""
    core_raw: list[dict] = []
    blend_raw: list[dict] = []
    dj_item: dict | None = None

    for raw in mixes:
        if not isinstance(raw, dict):
            continue
        uri = str(raw.get("uri") or "").strip()
        pid = str(raw.get("id") or (uri.split(":")[-1] if ":" in uri else "")).strip()
        name = str(raw.get("name") or "").strip()
        owner = str(raw.get("owner_id") or raw.get("owner") or "").strip()
        subtitle = str(raw.get("subtitle") or raw.get("description") or "").strip()
        kind = str(raw.get("kind") or "").strip().lower()
        if kind not in ("core", "blend", "dj", "editorial"):
            kind = _classify_discovery_kind(pid, uri, name, owner, subtitle)
        if kind == "editorial":
            continue
        item = dict(raw)
        item["kind"] = kind
        if kind == "dj":
            if dj_item is None:
                dj_item = item
            else:
                for k in ("image_url", "artwork_url", "subtitle", "owner_id"):
                    if not dj_item.get(k) and item.get(k):
                        dj_item[k] = item[k]
        elif kind == "blend":
            blend_raw.append(item)
        else:
            core_raw.append(item)

    return _sort_algorithmic_mixes(core_raw)[:15], _sort_algorithmic_mixes(blend_raw)[:15], dj_item


async def _search_missing_core_mixes(
    token: str,
    existing_core: list[dict],
) -> list[dict]:
    """Fallback to Web API /v1/search for non-followed Discover Weekly / Release Radar / Daily Mix."""
    names_lower = [str(m.get("name") or "").lower() for m in existing_core]
    missing_queries = [
        q
        for q, needle in (
            ("Discover Weekly", "discover weekly"),
            ("Release Radar", "release radar"),
            ("Daily Mix", "daily mix"),
            ("Daylist", "daylist"),
            ("On Repeat", "on repeat"),
        )
        if not any(needle in n for n in names_lower)
    ]
    if not missing_queries or not token:
        return []

    found: list[dict] = []
    for query in missing_queries:
        try:
            search_res = await _exec(
                _spotify_api_request,
                "search",
                token,
                "GET",
                {"q": query, "type": "playlist", "limit": 10},
            )
        except SpotifyRateLimitError:
            break
        except Exception as e:
            decky.logger.debug("Web search fallback for %s failed: %s", query, e)
            continue
        pl_items = ((search_res or {}).get("playlists") or {}).get("items") or []
        for p in pl_items:
            if not isinstance(p, dict):
                continue
            owner_id = str((p.get("owner") or {}).get("id") or "").strip().lower()
            if owner_id != "spotify":
                continue
            pid = str(p.get("id") or "")
            uri = str(p.get("uri") or (f"spotify:playlist:{pid}" if pid else ""))
            name = str(p.get("name") or "")
            subtitle = str(p.get("description") or p.get("subtitle") or "")
            if _classify_discovery_kind(pid, uri, name, owner_id, subtitle) != "core":
                continue
            fmt = _format_discovery_playlist(p)
            fmt["kind"] = "core"
            found.append(fmt)
    return found


async def _fetch_made_for_you_section(token: str, plugin=None) -> dict:
    cdp_active = bool(plugin is not None and is_spotify_client_running(plugin))
    cdp_mixes: list[dict] = []
    if cdp_active:
        try:
            cdp_res = await _exec(cdp_fetch_discovery_mixes)
            if isinstance(cdp_res, dict) and cdp_res.get("ok"):
                cdp_mixes = list(cdp_res.get("items") or [])
        except Exception as e:
            decky.logger.debug("cdp_fetch_discovery_mixes failed: %s", e)

    web_mixes: list[dict] = []
    try:
        pl_data = await _exec(
            _spotify_api_request, "me/playlists", token, "GET", {"limit": 50, "offset": 0}
        )
        all_items = list((pl_data or {}).get("items", []))
        total = (pl_data or {}).get("total", 0)
        if total > 50:
            page2 = await _exec(
                _spotify_api_request, "me/playlists", token, "GET", {"limit": 50, "offset": 50}
            )
            all_items.extend((page2 or {}).get("items", []))
        web_mixes = [
            _format_discovery_playlist(p)
            for p in all_items
            if p and (p.get("owner") or {}).get("id") == "spotify"
        ]
    except SpotifyRateLimitError:
        if not cdp_mixes:
            raise
    except Exception as e:
        if not cdp_mixes:
            decky.logger.debug("me/playlists failed in _fetch_made_for_you_section: %s", e)

    disk_cache = load_discovery_mixes_cache()
    cached_mixes = disk_cache.get("mixes") if isinstance(disk_cache.get("mixes"), list) else []
    cached_blends = disk_cache.get("blends") if isinstance(disk_cache.get("blends"), list) else []
    cached_dj = disk_cache.get("dj") if isinstance(disk_cache.get("dj"), dict) else None
    cached_by_uri = {
        m.get("uri"): m
        for m in cached_mixes
        if isinstance(m, dict) and m.get("uri")
    }

    for m in cdp_mixes:
        if isinstance(m, dict):
            if m.get("subtitle"):
                m["subtitle"] = _strip_html(m["subtitle"])
            if m.get("description"):
                m["description"] = _strip_html(m["description"])

    combined = cdp_mixes + web_mixes
    core_pre, _, _ = _partition_discovery_mixes(combined)
    if not cdp_active and (not web_mixes and not cached_mixes):
        extra_core = await _search_missing_core_mixes(token, core_pre)
        if extra_core:
            combined = combined + extra_core

    core_mixes, blends, dj = _partition_discovery_mixes(combined)

    if cdp_active and (core_mixes or blends or dj):
        merged_by_uri: dict[str, dict] = {}
        for cm in cached_mixes:
            if not isinstance(cm, dict) or not cm.get("uri"):
                continue
            cm_uri = str(cm["uri"])
            cm_pid = str(cm.get("id") or (cm_uri.split(":")[-1] if ":" in cm_uri else ""))
            cm_name = str(cm.get("name") or "")
            cm_owner = str(cm.get("owner_id") or cm.get("owner") or "")
            cm_sub = str(cm.get("subtitle") or cm.get("description") or "")
            if _classify_discovery_kind(cm_pid, cm_uri, cm_name, cm_owner, cm_sub) == "core":
                merged_by_uri[cm_uri] = dict(cm)

        for mix in core_mixes:
            uri = mix.get("uri")
            if not uri:
                continue
            fresh = dict(mix)
            prev = cached_by_uri.get(uri)
            if prev and not fresh.get("tracks") and isinstance(prev.get("tracks"), list) and prev["tracks"]:
                fresh["tracks"] = list(prev["tracks"])[:100]
                fresh["uris"] = list(prev.get("uris") or [t.get("uri") for t in fresh["tracks"] if isinstance(t, dict) and t.get("uri")])
            merged_by_uri[uri] = fresh

        merged_core = _sort_algorithmic_mixes(list(merged_by_uri.values()))[:15]

        for mix in merged_core[:12]:
            if not mix.get("tracks"):
                pid = mix.get("id") or mix["uri"].split(":")[-1]
                if pid:
                    try:
                        cdp_tr = await _exec(cdp_get_playlist_tracks, pid, 0, True)
                        if isinstance(cdp_tr, dict) and cdp_tr.get("ok") and cdp_tr.get("tracks"):
                            capped = list(cdp_tr["tracks"])[:100]
                            mix["tracks"] = capped
                            mix["uris"] = [t["uri"] for t in capped if isinstance(t, dict) and t.get("uri")]
                            if not mix.get("track_count"):
                                mix["track_count"] = cdp_tr.get("total") or len(capped)
                    except Exception as e:
                        decky.logger.debug("Eager prefetch for mix %s failed: %s", pid, e)

        effective_blends = blends if blends else cached_blends
        effective_dj = dj if dj is not None else cached_dj
        try:
            cache_payload = {
                "version": 1,
                "updated_at": int(time.time()),
                "mixes": merged_core[:15],
            }
            if effective_blends:
                cache_payload["blends"] = effective_blends[:15]
            if effective_dj is not None:
                cache_payload["dj"] = effective_dj
            save_discovery_mixes_cache(cache_payload)
        except Exception as e:
            decky.logger.warning("Failed to save discovery_mixes.json: %s", e)
        return {
            "made_for_you": merged_core,
            "blends": effective_blends,
            "dj": effective_dj,
            "fallback": False,
        }

    def _with_cached_suffix(entry: dict) -> dict:
        copy_m = dict(entry)
        sub = str(copy_m.get("subtitle") or "Made for you")
        if not sub.endswith(" · Cached"):
            sub = f"{sub} · Cached"
        copy_m["subtitle"] = sub
        return copy_m

    if cached_mixes or cached_blends or cached_dj:
        cached_raw = [_with_cached_suffix(m) for m in cached_mixes if isinstance(m, dict)]
        cached_raw.extend(_with_cached_suffix(b) for b in cached_blends if isinstance(b, dict))
        if isinstance(cached_dj, dict):
            cached_raw.append(dict(cached_dj))
        merged_core, merged_blends, merged_dj = _partition_discovery_mixes(combined + cached_raw)
        if merged_core or merged_blends or merged_dj:
            return {
                "made_for_you": merged_core,
                "blends": merged_blends,
                "dj": merged_dj,
                "fallback": False,
            }

    if core_mixes or blends or dj:
        return {
            "made_for_you": core_mixes,
            "blends": blends,
            "dj": dj,
            "fallback": False,
        }

    recent_data = await _exec(
        _spotify_api_request, "me/player/recently-played", token, "GET", {"limit": 30}
    )
    fallback_items: list[dict] = []
    seen_uris: set[str] = set()
    for item in (recent_data or {}).get("items", []):
        t = item.get("track") or {}
        if not t:
            continue
        album = t.get("album") or {}
        ctx = item.get("context") or {}
        ctx_uri = ctx.get("uri") or ""
        alb_id = album.get("id", "")
        alb_uri = album.get("uri") or (f"spotify:album:{alb_id}" if alb_id else "")
        if not ctx_uri:
            ctx_uri = alb_uri
        if not ctx_uri or ctx_uri in seen_uris:
            continue

        if ctx_uri.startswith("spotify:playlist:"):
            pl_id = ctx_uri.split(":")[-1]
            pl_name = ""
            pl_img = ""
            pl_total = 0
            pl_owner = ""
            try:
                pl_meta = await _exec(
                    _spotify_api_request,
                    f"playlists/{pl_id}",
                    token,
                    "GET",
                    {"fields": "id,name,images,owner(id),tracks(total)"},
                )
                if isinstance(pl_meta, dict) and pl_meta.get("name"):
                    pl_name = pl_meta["name"]
                    pl_img = _image_url(pl_meta.get("images") or [])
                    pl_total = (pl_meta.get("tracks") or {}).get("total", 0)
                    pl_owner = (pl_meta.get("owner") or {}).get("id", "")
            except Exception:
                pass
            if pl_name:
                seen_uris.add(ctx_uri)
                fallback_items.append({
                    "id": pl_id,
                    "uri": ctx_uri,
                    "name": pl_name,
                    "image_url": pl_img or _image_url(album.get("images") or []),
                    "artwork_url": pl_img or _image_url(album.get("images") or []),
                    "track_count": pl_total,
                    "owner_id": pl_owner,
                })
            elif alb_uri and alb_uri not in seen_uris:
                seen_uris.add(alb_uri)
                artists = ", ".join(a.get("name", "") for a in (album.get("artists") or t.get("artists") or []) if a.get("name"))
                img_url = _image_url(album.get("images") or [])
                fallback_items.append({
                    "id": alb_uri.split(":")[-1],
                    "uri": alb_uri,
                    "name": album.get("name") or t.get("name", "Recently Played"),
                    "subtitle": artists,
                    "is_album": True,
                    "image_url": img_url,
                    "artwork_url": img_url,
                    "track_count": album.get("total_tracks", 0),
                    "owner_id": "",
                })
        elif ctx_uri.startswith("spotify:album:"):
            seen_uris.add(ctx_uri)
            artists = ", ".join(a.get("name", "") for a in (album.get("artists") or t.get("artists") or []) if a.get("name"))
            img_url = _image_url(album.get("images") or [])
            fallback_items.append({
                "id": ctx_uri.split(":")[-1],
                "uri": ctx_uri,
                "name": album.get("name") or t.get("name", "Recently Played"),
                "subtitle": artists,
                "is_album": True,
                "image_url": img_url,
                "artwork_url": img_url,
                "track_count": album.get("total_tracks", 0),
                "owner_id": "",
            })
        elif alb_uri and alb_uri not in seen_uris:
            seen_uris.add(alb_uri)
            artists = ", ".join(a.get("name", "") for a in (album.get("artists") or t.get("artists") or []) if a.get("name"))
            img_url = _image_url(album.get("images") or [])
            fallback_items.append({
                "id": alb_uri.split(":")[-1],
                "uri": alb_uri,
                "name": album.get("name") or t.get("name", "Recently Played"),
                "subtitle": artists,
                "is_album": True,
                "image_url": img_url,
                "artwork_url": img_url,
                "track_count": album.get("total_tracks", 0),
                "owner_id": "",
            })

        if len(fallback_items) >= 12:
            break
    return {
        "made_for_you": fallback_items,
        "blends": [],
        "dj": None,
        "fallback": True,
    }


async def _fetch_top_tracks_section(plugin, token: str, valid_range: str) -> tuple[list[dict], bool]:
    try:
        tt_data = await _exec(
            _spotify_api_request,
            "me/top/tracks",
            token,
            "GET",
            {"time_range": valid_range, "limit": 15},
        )
        tracks = [
            _format_discovery_track(t)
            for t in (tt_data or {}).get("items", [])
            if t
        ]
        if tracks:
            await plugin._annotate_tracks_liked(token, tracks)
        return tracks, False
    except urllib.error.HTTPError as e:
        if e.code == 403:
            return [], True
        raise


async def _fetch_top_artists_section(token: str, valid_range: str) -> tuple[list[dict], bool]:
    try:
        ta_data = await _exec(
            _spotify_api_request,
            "me/top/artists",
            token,
            "GET",
            {"time_range": valid_range, "limit": 15},
        )
        artists = [
            _format_discovery_artist(a)
            for a in (ta_data or {}).get("items", [])
            if a
        ]
        return artists, False
    except urllib.error.HTTPError as e:
        if e.code == 403:
            return [], True
        raise


async def _fetch_new_releases_section(token: str) -> list[dict]:
    personalized_albums: dict[str, dict] = {}
    artist_ids: list[str] = []
    try:
        fol_data = await _exec(
            _spotify_api_request, "me/following", token, "GET", {"type": "artist", "limit": 10}
        )
        for a in ((fol_data or {}).get("artists") or {}).get("items") or []:
            if a and a.get("id") and a["id"] not in artist_ids:
                artist_ids.append(a["id"])
    except Exception:
        pass
    if len(artist_ids) < 6:
        try:
            top_a_data = await _exec(
                _spotify_api_request, "me/top/artists", token, "GET", {"time_range": "short_term", "limit": 8}
            )
            for a in (top_a_data or {}).get("items") or []:
                if a and a.get("id") and a["id"] not in artist_ids:
                    artist_ids.append(a["id"])
        except Exception:
            pass
    for aid in artist_ids[:6]:
        try:
            alb_data = await _exec(
                _spotify_api_request,
                f"artists/{aid}/albums",
                token,
                "GET",
                {"include_groups": "album,single", "limit": 4},
            )
            for alb in (alb_data or {}).get("items") or []:
                alb_id = alb.get("id") if isinstance(alb, dict) else None
                if alb_id and alb_id not in personalized_albums:
                    personalized_albums[alb_id] = alb
        except Exception:
            continue
    if personalized_albums:
        sorted_albums = sorted(
            personalized_albums.values(),
            key=lambda a: str(a.get("release_date") or ""),
            reverse=True,
        )[:15]
        return [_format_discovery_album(alb) for alb in sorted_albums]

    nr_items: list[dict] = []
    try:
        nr_data = await _exec(
            _spotify_api_request, "browse/new-releases", token, "GET", {"limit": 15}
        )
        nr_items = ((nr_data or {}).get("albums") or {}).get("items", [])
    except urllib.error.HTTPError as e:
        if e.code not in (403, 404):
            raise
    if not nr_items:
        search_data = await _exec(
            _spotify_api_request,
            "search",
            token,
            "GET",
            {"q": "tag:new", "type": "album", "limit": 10},
        )
        nr_items = ((search_data or {}).get("albums") or {}).get("items", [])
    return [_format_discovery_album(alb) for alb in nr_items if alb]


async def get_discovery_feed(
    plugin,
    time_range: str = "medium_term",
    force_refresh: bool = False,
) -> dict:
    """Aggregate Made For You mixes, Top Tracks, Top Artists, and New Releases with TTL cache."""
    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}

    valid_range = time_range if time_range in _VALID_DISCOVERY_RANGES else "medium_term"
    bypass = bool(force_refresh)

    needs_reauth = False
    rate_limited = False
    stale = False
    retry_after = 0

    async def _get_section(cache_key: str, ttl: float, fetcher):
        nonlocal rate_limited, stale, retry_after
        now = time.monotonic()
        entry = _DISCOVERY_CACHE.get(cache_key)
        if not bypass and entry is not None and now < entry["expires_at"]:
            return entry["data"], entry.get("fallback", False)
        try:
            result = await fetcher()
            if isinstance(result, tuple):
                data, extra_flag = result
            else:
                data, extra_flag = result, False
            _DISCOVERY_CACHE[cache_key] = {
                "data": data,
                "fallback": extra_flag,
                "expires_at": time.monotonic() + ttl,
            }
            return data, extra_flag
        except SpotifyRateLimitError as rl_err:
            rate_limited = True
            retry_after = max(retry_after, int(round(rl_err.retry_after)))
            if entry is not None:
                stale = True
                return entry["data"], entry.get("fallback", False)
            return [], False

    try:
        active_backend = str((getattr(plugin, "_settings", {}) or {}).get("audio_backend", "librespot"))
        made_for_you_data, made_for_you_fallback = await _get_section(
            f"made_for_you:{active_backend}", _STATIC_TTL_SECONDS, lambda: _fetch_made_for_you_section(token, plugin)
        )
        if isinstance(made_for_you_data, dict):
            made_for_you = list(made_for_you_data.get("made_for_you") or [])
            blends = list(made_for_you_data.get("blends") or [])
            dj = made_for_you_data.get("dj")
            made_for_you_fallback = bool(made_for_you_data.get("fallback", made_for_you_fallback))
        else:
            made_for_you = list(made_for_you_data or [])
            blends = []
            dj = None
        top_tracks, reauth_tracks = await _get_section(
            f"top_tracks:{valid_range}",
            _TOP_TTL_SECONDS,
            lambda: _fetch_top_tracks_section(plugin, token, valid_range),
        )
        top_artists, reauth_artists = await _get_section(
            f"top_artists:{valid_range}",
            _TOP_TTL_SECONDS,
            lambda: _fetch_top_artists_section(token, valid_range),
        )
        new_releases, _ = await _get_section(
            "new_releases", _STATIC_TTL_SECONDS, lambda: _fetch_new_releases_section(token)
        )
        needs_reauth = bool(reauth_tracks or reauth_artists)

        return {
            "ok": True,
            "time_range": valid_range,
            "made_for_you": made_for_you,
            "made_for_you_fallback": bool(made_for_you_fallback),
            "blends": blends,
            "dj": dj,
            "cdp_active": bool(is_spotify_client_running(plugin)),
            "top_tracks": top_tracks,
            "top_artists": top_artists,
            "new_releases": new_releases,
            "needs_reauth": needs_reauth,
            "rate_limited": rate_limited,
            "stale": stale,
            "retry_after": retry_after,
        }
    except Exception as e:
        decky.logger.error("get_discovery_feed failed: %s", e)
        return {"ok": False, "error": str(e)}


async def get_search_browse_categories(plugin) -> dict:
    """Fetch live Spotify browse category tiles via CDP when spotify_client is running."""
    if not is_spotify_client_running(plugin):
        return {"ok": True, "categories": []}
    try:
        categories = await _exec(cdp_fetch_browse_categories)
        if not isinstance(categories, list):
            categories = []
        return {"ok": True, "categories": categories}
    except Exception as e:
        decky.logger.debug("get_search_browse_categories failed: %s", e)
        return {"ok": True, "categories": []}
