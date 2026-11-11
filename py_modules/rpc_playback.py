import asyncio
import time
import urllib.error
from py_modules.common import (
    _exec,
    decky,
)
from py_modules.images import _image_url
from py_modules.spotify import (
    _spotify_api_request,
    _parse_spotify_error,
)


async def auto_transfer_and_play(plugin, token: str, device_id: str = "") -> dict:
    """Attempt automatic playback transfer to available Spotify device."""
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
        plugin._poll_play_state = "playing"
        return {"ok": True}
    except Exception as e:
        decky.logger.error("Auto-transfer failed: %s", e)
        return {"ok": False, "error": "No active device — connect via Spotify app first"}


async def control_playback(plugin, action: str, device_id: str = "") -> dict:
    """Control playback actions (play, pause, play_pause, next, previous)."""
    decky.logger.info("control_playback: action=%s device_id=%s", action, device_id)
    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}

    if action == "play_pause":
        action = "pause" if plugin._poll_play_state == "playing" else "play"

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
        if action == "play":
            plugin._poll_play_state = "playing"
        elif action == "pause":
            plugin._poll_play_state = "paused"
        return {"ok": True}
    except urllib.error.HTTPError as e:
        if e.code == 404 and action == "play":
            return await plugin._auto_transfer_and_play(token, device_id)
        if e.code == 404:
            return {"ok": False, "error": "No active device — connect via Spotify app first"}
        return {"ok": False, "error": _parse_spotify_error(e)}
    except Exception as e:
        decky.logger.error("control_playback(%s) failed: %s", action, e)
        return {"ok": False, "error": str(e)}


async def seek_playback(plugin, position_ms: int, device_id: str = "") -> dict:
    """Seek to a target position in ms."""
    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}
    position_ms = max(0, int(position_ms))
    params: dict = {"position_ms": position_ms}
    if device_id:
        params["device_id"] = device_id
    try:
        await _exec(_spotify_api_request, "me/player/seek", token, "PUT", params)
        if plugin._last_event:
            plugin._last_event["position_ms"] = position_ms
        return {"ok": True, "position_ms": position_ms}
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {"ok": False, "error": "No active device found"}
        return {"ok": False, "error": _parse_spotify_error(e)}
    except Exception as e:
        decky.logger.error("seek_playback(%d) failed: %s", position_ms, e)
        return {"ok": False, "error": str(e)}


async def set_shuffle(plugin, state: bool, device_id: str = "") -> dict:
    """Toggle shuffle state."""
    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}
    state_bool = bool(state)
    params: dict = {"state": "true" if state_bool else "false"}
    if device_id:
        params["device_id"] = device_id
    try:
        await _exec(_spotify_api_request, "me/player/shuffle", token, "PUT", params)
        plugin._shuffle_state = state_bool
        await decky.emit("playback_modes", {
            "shuffle_state": plugin._shuffle_state,
            "repeat_state": plugin._repeat_state,
        })
        return {"ok": True, "shuffle_state": plugin._shuffle_state}
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {"ok": False, "error": "No active device found"}
        return {"ok": False, "error": _parse_spotify_error(e)}
    except Exception as e:
        decky.logger.error("set_shuffle(%s) failed: %s", state, e)
        return {"ok": False, "error": str(e)}


async def set_repeat(plugin, state: str, device_id: str = "") -> dict:
    """Set repeat mode (off, context, track)."""
    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}
    if state not in ("off", "context", "track"):
        return {"ok": False, "error": f"Invalid repeat state: {state}"}
    params: dict = {"state": state}
    if device_id:
        params["device_id"] = device_id
    try:
        await _exec(_spotify_api_request, "me/player/repeat", token, "PUT", params)
        plugin._repeat_state = state
        await decky.emit("playback_modes", {
            "shuffle_state": plugin._shuffle_state,
            "repeat_state": plugin._repeat_state,
        })
        return {"ok": True, "repeat_state": plugin._repeat_state}
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {"ok": False, "error": "No active device found"}
        return {"ok": False, "error": _parse_spotify_error(e)}
    except Exception as e:
        decky.logger.error("set_repeat(%s) failed: %s", state, e)
        return {"ok": False, "error": str(e)}


async def check_tracks_liked(plugin, token: str, track_ids: list[str]) -> dict[str, bool]:
    """Batch-check saved status via Spotify's /me/tracks/contains endpoint with cache."""
    clean_ids = [tid for tid in dict.fromkeys(track_ids) if tid]
    if not clean_ids:
        return {}
    result: dict[str, bool] = {}
    missing_ids: list[str] = []
    now = time.time()
    for tid in clean_ids:
        if tid in plugin._liked_cache and (now - plugin._liked_cache[tid][0]) < 300:
            result[tid] = plugin._liked_cache[tid][1]
        else:
            missing_ids.append(tid)

    if not missing_ids:
        return result

    for i in range(0, len(missing_ids), 50):
        chunk = missing_ids[i:i + 50]
        ids_str = ",".join(chunk)
        try:
            res = await _exec(
                _spotify_api_request, "me/tracks/contains", token, "GET",
                {"ids": ids_str},
            )
            if isinstance(res, list):
                for tid, flag in zip(chunk, res):
                    b_flag = bool(flag)
                    result[tid] = b_flag
                    plugin._liked_cache[tid] = (now, b_flag)
        except Exception as e:
            decky.logger.warning("me/tracks/contains check failed: %s", e)
    return result


async def annotate_tracks_liked(plugin, token: str, tracks: list[dict]) -> None:
    """Enrich a track collection with is_liked flags."""
    ids = [t.get("id") for t in tracks if t.get("id")]
    liked_map = await plugin._check_tracks_liked(token, ids)
    for t in tracks:
        tid = t.get("id")
        t["is_liked"] = bool(liked_map.get(tid, False)) if tid else False


async def toggle_like_track(plugin, track_id: str = "", liked: bool | None = None) -> dict:
    """Save or remove track from user's Liked Songs library."""
    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}
    target_id = (track_id or plugin._poll_track_id or "").strip()
    if target_id.startswith("spotify:track:"):
        target_id = target_id.split(":")[-1]
    if not target_id:
        return {"ok": False, "error": "No active track"}
    if liked is None:
        if target_id == plugin._poll_track_id:
            target_liked = not plugin._is_liked
        else:
            checked = await plugin._check_tracks_liked(token, [target_id])
            target_liked = not checked.get(target_id, False)
    else:
        target_liked = bool(liked)
    method = "PUT" if target_liked else "DELETE"
    try:
        await _exec(
            _spotify_api_request, "me/tracks", token, method,
            {"ids": target_id},
        )
        now = time.time()
        plugin._liked_cache[target_id] = (now, target_liked)
        if target_id == plugin._poll_track_id:
            plugin._is_liked = target_liked
            if plugin._track_meta:
                plugin._track_meta["is_liked"] = target_liked
                await decky.emit("track_metadata", plugin._track_meta)
        return {"ok": True, "track_id": target_id, "is_liked": target_liked}
    except urllib.error.HTTPError as e:
        return {"ok": False, "error": _parse_spotify_error(e)}
    except Exception as e:
        decky.logger.error("toggle_like_track(%s) failed: %s", target_id, e)
        return {"ok": False, "error": str(e)}


async def get_queue(plugin) -> dict:
    """Fetch current user queue and currently playing item."""
    token = await plugin._ensure_token()
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
                artist_id = ""
                album_id = ""
            else:
                artists = ", ".join(a["name"] for a in item.get("artists", []))
                album = item.get("album", {}).get("name", "")
                images = item.get("album", {}).get("images") or []
                artist_id = (item.get("artists") or [{}])[0].get("id", "")
                album_id = item.get("album", {}).get("id", "")
            return {
                "id": item.get("id"),
                "name": item.get("name", ""),
                "artist": artists,
                "album": album,
                "artist_id": artist_id,
                "album_id": album_id,
                "uri": item.get("uri", ""),
                "duration_ms": item.get("duration_ms", 0),
                "image_url": _image_url(images),
                "artwork_url": _image_url(images),
            }

        queue_items = []
        for q in (data.get("queue") or [])[:30]:
            formatted = _fmt(q)
            if formatted:
                queue_items.append(formatted)
        curr = _fmt(data.get("currently_playing"))
        all_to_check = ([curr] if curr else []) + queue_items
        await plugin._annotate_tracks_liked(token, all_to_check)
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


async def add_to_queue(plugin, uri: str, device_id: str = "") -> dict:
    """Add a track to the end of user's active playback queue."""
    token = await plugin._ensure_token()
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


async def play_tracks(
    plugin,
    context_uri: str | None = None,
    offset_uri: str | None = None,
    uris: list | None = None,
    position: int = 0,
) -> dict:
    """Start playback of a context, URI list, or single track."""
    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}
    # Handle flexible argument ordering if uris passed in place of offset_uri
    if isinstance(offset_uri, list):
        uris, offset_uri = offset_uri, None

    body = {}
    if context_uri:
        body["context_uri"] = context_uri
        if offset_uri:
            body["offset"] = {"uri": offset_uri}
        plugin._context_uri = context_uri
    elif uris:
        body["uris"] = uris
        if position > 0:
            body["offset"] = {"position": position}
    elif offset_uri and str(offset_uri).strip():
        body["uris"] = [str(offset_uri).strip()]
    try:
        await _exec(
            _spotify_api_request, "me/player/play", token, "PUT", None, body,
        )
        return {"ok": True}
    except urllib.error.HTTPError as e:
        if e.code == 404:
            transfer_res = await plugin._auto_transfer_and_play(token)
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


async def get_devices(plugin) -> dict:
    """Retrieve list of available Spotify Connect devices."""
    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}
    try:
        data = await _exec(_spotify_api_request, "me/player/devices", token)
        devices = data.get("devices", []) if data else []
        return {"ok": True, "devices": devices}
    except Exception as e:
        decky.logger.error("get_devices failed: %s", e)
        return {"ok": False, "error": str(e)}


async def transfer_playback(plugin, device_id: str) -> dict:
    """Transfer active playback to designated device ID."""
    token = await plugin._ensure_token()
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
