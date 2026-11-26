import asyncio
from collections import OrderedDict
import json
import os
import socket
import threading
import time
import urllib.error
import urllib.parse
from py_modules import cdp_bridge
from py_modules.cdp_bridge import (
    cdp_fetch_station_radio_uris,
    cdp_play_context,
    is_spotify_client_running,
    load_discovery_mixes_cache,
)
from py_modules.common import (
    ALLOWED_PLAYBACK_SPEEDS,
    _exec,
    _save_settings,
    decky,
)
from py_modules.eco import read_power_supply_state
from py_modules.engine import _cdp_set_playback_speed, _cdp_toggle_like_track
from py_modules.images import _image_url
from py_modules.spotify import (
    SpotifyRateLimitError,
    _spotify_api_request,
    _parse_spotify_error,
)

_RADIO_CACHE_LOCK = threading.Lock()
_RADIO_CACHE_TTL_S: float = 300.0
_RADIO_CACHE_MAX_SIZE: int = 32
_RADIO_CACHE: OrderedDict[tuple[str, str], tuple[float, list[str], str]] = OrderedDict()


def _reset_radio_cache() -> None:
    """Clear the in-memory start_radio URI cache (for tests)."""
    with _RADIO_CACHE_LOCK:
        _RADIO_CACHE.clear()


async def auto_transfer_and_play(plugin, token: str, device_id: str = "", play: bool = True) -> dict:
    """Attempt automatic playback transfer to available Spotify device."""
    if not device_id:
        try:
            data = await _exec(_spotify_api_request, "me/player/devices", token)
            devices = data.get("devices", []) if data else []
            if devices:
                settings = getattr(plugin, "_settings", {}) or {}
                local_name = ""
                get_dev_name = getattr(plugin, "get_device_name", None)
                if callable(get_dev_name):
                    try:
                        local_name = get_dev_name() or ""
                    except Exception:
                        local_name = ""
                if not local_name:
                    local_name = settings.get("device_name") or socket.gethostname()
                preferred = _match_local_device(devices, local_name)
                if not preferred:
                    preferred = next(
                        (d for d in devices if isinstance(d, dict) and d.get("is_active") and d.get("id")),
                        None,
                    )
                if not preferred:
                    preferred = next(
                        (d for d in devices if isinstance(d, dict) and d.get("id")),
                        devices[0],
                    )
                device_id = preferred.get("id", "") if isinstance(preferred, dict) else ""
                decky.logger.info(
                    "No device_id provided, picked %s (%s)",
                    preferred.get("name") if isinstance(preferred, dict) else None,
                    device_id,
                )
        except Exception as e:
            decky.logger.error("Failed to fetch devices for auto-transfer: %s", e)
    if not device_id:
        return {"ok": False, "error": "No active device — connect via Spotify app first"}
    try:
        decky.logger.info("Auto-transferring playback to %s (play=%s)", device_id, bool(play))
        await _exec(
            _spotify_api_request, "me/player", token, "PUT", None,
            {"device_ids": [device_id], "play": bool(play)},
        )
        if play:
            plugin._poll_play_state = "playing"
        return {"ok": True, "device_id": device_id}
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
    power_gov = getattr(plugin, "_power_governor", None)
    if action == "play" and power_gov is not None:
        is_running = plugin._is_engine_running() if hasattr(plugin, "_is_engine_running") else True
        if getattr(power_gov, "engine_sleeping", False) or not is_running:
            await power_gov.wake_for_playback()
    try:
        await _exec(_spotify_api_request, endpoint, token, method, params)
        if action == "play":
            plugin._poll_play_state = "playing"
        elif action == "pause":
            plugin._poll_play_state = "paused"
        elif action in ("next", "previous"):
            _invalidate_optimistic_queue(plugin)
        mpris_bridge = getattr(plugin, "_mpris_bridge", None)
        if mpris_bridge is not None and hasattr(mpris_bridge, "sync_from_plugin"):
            await mpris_bridge.sync_from_plugin()
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
        mpris_bridge = getattr(plugin, "_mpris_bridge", None)
        if mpris_bridge is not None and hasattr(mpris_bridge, "notify_seeked"):
            await mpris_bridge.notify_seeked(position_ms)
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
        _invalidate_optimistic_queue(plugin)
        await decky.emit("playback_modes", {
            "shuffle_state": plugin._shuffle_state,
            "repeat_state": plugin._repeat_state,
        })
        mpris_bridge = getattr(plugin, "_mpris_bridge", None)
        if mpris_bridge is not None and hasattr(mpris_bridge, "sync_from_plugin"):
            await mpris_bridge.sync_from_plugin()
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
        mpris_bridge = getattr(plugin, "_mpris_bridge", None)
        if mpris_bridge is not None and hasattr(mpris_bridge, "sync_from_plugin"):
            await mpris_bridge.sync_from_plugin()
        return {"ok": True, "repeat_state": plugin._repeat_state}
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {"ok": False, "error": "No active device found"}
        return {"ok": False, "error": _parse_spotify_error(e)}
    except Exception as e:
        decky.logger.error("set_repeat(%s) failed: %s", state, e)
        return {"ok": False, "error": str(e)}


async def check_tracks_liked(plugin, token: str, track_ids: list[str]) -> dict[str, bool]:
    """Batch-check saved status via Spotify's /me/library/contains endpoint with cache."""
    raw_ids = [str(tid).strip().split(":")[-1] for tid in track_ids if tid and str(tid).strip()]
    clean_ids = [tid for tid in dict.fromkeys(raw_ids) if tid]
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

    for i in range(0, len(missing_ids), 40):
        chunk = missing_ids[i:i + 40]
        uris_str = ",".join(f"spotify:track:{tid}" for tid in chunk)
        try:
            res = await _exec(
                _spotify_api_request, "me/library/contains", token, "GET",
                {"uris": uris_str},
            )
            if isinstance(res, list):
                for tid, flag in zip(chunk, res):
                    b_flag = bool(flag)
                    result[tid] = b_flag
                    plugin._liked_cache[tid] = (now, b_flag)
        except Exception as e:
            decky.logger.warning("me/library/contains check failed: %s", e)
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
            _spotify_api_request, "me/library", token, method,
            {"uris": f"spotify:track:{target_id}"},
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
                    cdp_res = await _exec(
                        _cdp_toggle_like_track,
                        f"spotify:track:{target_id}",
                        target_liked,
                    )
                    if isinstance(cdp_res, dict) and cdp_res.get("ok"):
                        plugin._liked_cache[target_id] = (time.time(), target_liked)
                        if target_id == plugin._poll_track_id:
                            plugin._is_liked = target_liked
                            if plugin._track_meta:
                                plugin._track_meta["is_liked"] = target_liked
                                await decky.emit("track_metadata", plugin._track_meta)
                        return {"ok": True, "track_id": target_id, "is_liked": target_liked}
                except Exception as cdp_err:
                    decky.logger.warning(
                        "toggle_like_track(%s) CDP fallback failed: %s",
                        target_id,
                        cdp_err,
                    )
            decky.logger.warning("toggle_like_track(%s) 403 Forbidden: %s", target_id, e)
            return {
                "ok": False,
                "error": "Spotify rejected library access (403 Forbidden). Re-authenticate in Settings or check Spotify Developer Mode allowlist.",
            }
        return {"ok": False, "error": _parse_spotify_error(e)}
    except Exception as e:
        decky.logger.error("toggle_like_track(%s) failed: %s", target_id, e)
        return {"ok": False, "error": str(e)}


def _invalidate_optimistic_queue(plugin) -> None:
    """Clear any cached optimistic queue snapshot and deferred override."""
    if plugin is not None:
        plugin._optimistic_queue_snapshot = None
        plugin._queue_cleared_for_track_id = None
        plugin._pending_queue_override = None


def _get_valid_optimistic_queue(plugin) -> list[dict] | None:
    """Return cached optimistic queue items if within TTL (or active deferred override) and track/shuffle match."""
    if plugin is None:
        return None
    snap = getattr(plugin, "_optimistic_queue_snapshot", None)
    if not isinstance(snap, dict):
        return None
    curr_track_id = getattr(plugin, "_poll_track_id", None)
    pending = getattr(plugin, "_pending_queue_override", None)
    has_active_override = (
        isinstance(pending, dict)
        and bool(curr_track_id)
        and pending.get("for_track_id") == curr_track_id
    )
    if not has_active_override and time.monotonic() >= float(snap.get("expires_at", 0.0)):
        plugin._optimistic_queue_snapshot = None
        return None
    if snap.get("track_id") != curr_track_id:
        plugin._optimistic_queue_snapshot = None
        return None
    if snap.get("shuffle") != getattr(plugin, "_shuffle_state", None):
        plugin._optimistic_queue_snapshot = None
        return None
    return [dict(item) for item in (snap.get("queue") or []) if isinstance(item, dict)]


def _set_optimistic_queue_snapshot(
    plugin,
    queue_items: list[dict],
    ttl_s: float = 15.0,
) -> None:
    """Store an optimistic queue snapshot with a short TTL."""
    if plugin is None:
        return
    plugin._optimistic_queue_snapshot = {
        "queue": [dict(item) for item in (queue_items or []) if isinstance(item, dict)],
        "expires_at": time.monotonic() + float(ttl_s),
        "track_id": getattr(plugin, "_poll_track_id", None),
        "shuffle": getattr(plugin, "_shuffle_state", None),
    }


async def get_queue(plugin) -> dict:
    """Fetch current user queue and currently playing item."""
    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}
    optimistic = _get_valid_optimistic_queue(plugin)
    if optimistic is not None:
        if optimistic and hasattr(plugin, "_annotate_tracks_liked"):
            await plugin._annotate_tracks_liked(token, optimistic)
        return {
            "ok": True,
            "currently_playing": getattr(plugin, "_last_queue_currently_playing", None),
            "queue": optimistic,
            "optimistic": True,
        }
    cleared_for = getattr(plugin, "_queue_cleared_for_track_id", None)
    if cleared_for is not None:
        if cleared_for == getattr(plugin, "_poll_track_id", None):
            return {
                "ok": True,
                "currently_playing": getattr(plugin, "_last_queue_currently_playing", None),
                "queue": [],
                "cleared": True,
            }
        plugin._queue_cleared_for_track_id = None
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
                "uid": str(item.get("uid") or ""),
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
        plugin._last_queue_currently_playing = curr
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
        _invalidate_optimistic_queue(plugin)
        return {"ok": True}
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {"ok": False, "error": "No active device found"}
        return {"ok": False, "error": _parse_spotify_error(e)}
    except Exception as e:
        decky.logger.error("add_to_queue(%s) failed: %s", uri, e)
        return {"ok": False, "error": str(e)}


async def _mutate_queue_via_uri_slice(
    plugin,
    token: str,
    mutated_upcoming: list[dict],
) -> dict:
    """Rebuild active queue via PUT /v1/me/player/play while preserving current track, position, and paused state."""
    player_data = None
    try:
        player_data = await _exec(_spotify_api_request, "me/player", token, "GET")
    except urllib.error.HTTPError as e:
        return {"ok": False, "error": _parse_spotify_error(e)}
    except Exception as e:
        decky.logger.warning("_mutate_queue_via_uri_slice GET me/player failed: %s", e)

    if isinstance(player_data, dict):
        item = player_data.get("item") or {}
        current_track_uri = str(item.get("uri") or getattr(plugin, "_poll_track_uri", "") or "").strip()
        try:
            current_position_ms = max(0, int(player_data.get("progress_ms") or 0))
        except (TypeError, ValueError):
            current_position_ms = 0
        was_paused = not bool(player_data.get("is_playing", False))
    else:
        current_track_uri = str(getattr(plugin, "_poll_track_uri", "") or "").strip()
        current_position_ms = 0
        was_paused = getattr(plugin, "_poll_play_state", "") != "playing"

    if not current_track_uri:
        return {"ok": False, "error": "No active track to preserve during queue update"}

    upcoming_uris = [
        str(t.get("uri") or "").strip()
        for t in (mutated_upcoming or [])
        if isinstance(t, dict) and str(t.get("uri") or "").strip()
    ][:99]

    body = {
        "uris": [current_track_uri, *upcoming_uris],
        "position_ms": current_position_ms,
    }
    try:
        await _exec(_spotify_api_request, "me/player/play", token, "PUT", None, body)
        if was_paused:
            await _exec(_spotify_api_request, "me/player/pause", token, "PUT")
        return {"ok": True}
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {"ok": False, "error": "No active device found"}
        return {"ok": False, "error": _parse_spotify_error(e)}
    except Exception as e:
        decky.logger.error("_mutate_queue_via_uri_slice failed: %s", e)
        return {"ok": False, "error": str(e)}


def _schedule_deferred_queue_override(
    plugin,
    upcoming_tracks: list[dict],
    cleared: bool = False,
) -> None:
    """Record a deferred queue mutation to be applied at the next natural track transition."""
    if plugin is None:
        return
    upcoming_uris = [
        str(t.get("uri") or "").strip()
        for t in (upcoming_tracks or [])
        if isinstance(t, dict) and str(t.get("uri") or "").strip()
    ][:100]
    plugin._pending_queue_override = {
        "for_track_id": getattr(plugin, "_poll_track_id", None),
        "upcoming_uris": upcoming_uris,
        "cleared": bool(cleared),
    }


async def flush_pending_queue_override(plugin, prev_track_id: str | None) -> dict:
    """Apply a deferred queue mutation cleanly when playback naturally transitions from prev_track_id."""
    if plugin is None:
        return {"ok": False, "skipped": True}
    pending = getattr(plugin, "_pending_queue_override", None)
    if not isinstance(pending, dict):
        return {"ok": True, "skipped": True}
    for_track_id = pending.get("for_track_id")
    if not prev_track_id or for_track_id != prev_track_id:
        return {"ok": True, "skipped": True}
    plugin._pending_queue_override = None
    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}
    try:
        if pending.get("cleared"):
            await _exec(_spotify_api_request, "me/player/pause", token, "PUT")
            return {"ok": True, "action": "paused"}
        upcoming_uris = [
            str(u).strip()
            for u in (pending.get("upcoming_uris") or [])
            if str(u).strip()
        ][:100]
        if upcoming_uris:
            await _exec(
                _spotify_api_request,
                "me/player/play",
                token,
                "PUT",
                None,
                {"uris": upcoming_uris},
            )
            return {"ok": True, "action": "play_uris", "count": len(upcoming_uris)}
        return {"ok": True, "skipped": True}
    except urllib.error.HTTPError as e:
        err_msg = _parse_spotify_error(e)
        decky.logger.warning("flush_pending_queue_override HTTP error: %s", err_msg)
        return {"ok": False, "error": err_msg}
    except Exception as e:
        decky.logger.warning("flush_pending_queue_override failed: %s", e)
        return {"ok": False, "error": str(e)}


async def reorder_queue_track(
    plugin,
    from_index: int,
    to_index: int,
    upcoming_tracks: list[dict] | None = None,
) -> dict:
    """Reorder an upcoming queue track via CDP PlayerAPI first, deferring fallback until track transition."""
    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}
    try:
        src_idx = int(from_index)
        dst_idx = int(to_index)
    except (TypeError, ValueError):
        return {"ok": False, "error": "Invalid queue indices"}

    if upcoming_tracks is None:
        q_res = await get_queue(plugin)
        if not q_res.get("ok"):
            return q_res
        items = [dict(t) for t in (q_res.get("queue") or []) if isinstance(t, dict)]
    else:
        items = [dict(t) for t in upcoming_tracks if isinstance(t, dict)]

    if not items or src_idx < 0 or src_idx >= len(items) or dst_idx < 0 or dst_idx >= len(items):
        return {"ok": False, "error": "Queue index out of bounds"}

    if src_idx == dst_idx:
        return {"ok": True, "queue": items}

    mutated = [dict(t) for t in items]
    moved = mutated.pop(src_idx)
    mutated.insert(dst_idx, moved)

    used_cdp = False
    if cdp_bridge.is_spotify_client_running(plugin):
        uid = str(moved.get("uid") or "").strip()
        target_uid = str(items[dst_idx].get("uid") or "").strip()
        cdp_res = await _exec(cdp_bridge.cdp_reorder_queue, src_idx, dst_idx, uid, target_uid)
        used_cdp = bool(isinstance(cdp_res, dict) and cdp_res.get("ok"))

    if not used_cdp:
        if getattr(plugin, "_poll_track_id", None):
            _schedule_deferred_queue_override(plugin, mutated, cleared=False)
        else:
            fallback_res = await _mutate_queue_via_uri_slice(plugin, token, mutated)
            if not fallback_res.get("ok"):
                return fallback_res

    _set_optimistic_queue_snapshot(plugin, mutated)
    return {"ok": True, "queue": mutated}


async def remove_queue_track(
    plugin,
    index: int,
    track_uri: str = "",
    uid: str = "",
    upcoming_tracks: list[dict] | None = None,
) -> dict:
    """Remove a single upcoming queue track via CDP PlayerAPI first, deferring fallback until track transition."""
    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}
    try:
        idx = int(index)
    except (TypeError, ValueError):
        return {"ok": False, "error": "Invalid queue index"}

    if upcoming_tracks is None:
        q_res = await get_queue(plugin)
        if not q_res.get("ok"):
            return q_res
        items = [dict(t) for t in (q_res.get("queue") or []) if isinstance(t, dict)]
    else:
        items = [dict(t) for t in upcoming_tracks if isinstance(t, dict)]

    if not items or idx < 0 or idx >= len(items):
        return {"ok": False, "error": "Queue index out of bounds"}

    mutated = [dict(t) for t in items]
    removed = mutated.pop(idx)
    target_uri = str(track_uri or removed.get("uri") or "").strip()
    target_uid = str(uid or removed.get("uid") or "").strip()

    used_cdp = False
    if cdp_bridge.is_spotify_client_running(plugin) and target_uri:
        cdp_res = await _exec(cdp_bridge.cdp_remove_from_queue, target_uri, target_uid)
        used_cdp = bool(isinstance(cdp_res, dict) and cdp_res.get("ok"))

    if not used_cdp:
        if getattr(plugin, "_poll_track_id", None):
            _schedule_deferred_queue_override(plugin, mutated, cleared=False)
        else:
            fallback_res = await _mutate_queue_via_uri_slice(plugin, token, mutated)
            if not fallback_res.get("ok"):
                return fallback_res

    _set_optimistic_queue_snapshot(plugin, mutated)
    return {"ok": True, "queue": mutated}


async def clear_queue(plugin) -> dict:
    """Clear all upcoming tracks without interrupting the currently playing track."""
    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}

    used_cdp = False
    has_context = False
    if cdp_bridge.is_spotify_client_running(plugin):
        cdp_res = await _exec(cdp_bridge.cdp_clear_queue)
        used_cdp = bool(isinstance(cdp_res, dict) and cdp_res.get("ok"))
        has_context = bool(isinstance(cdp_res, dict) and cdp_res.get("has_context_tracks"))

    if used_cdp and not has_context:
        try:
            player_data = await _exec(_spotify_api_request, "me/player", token, "GET")
            if isinstance(player_data, dict) and player_data.get("context"):
                has_context = True
        except Exception as e:
            decky.logger.warning("clear_queue me/player context check failed: %s", e)

    if not used_cdp or has_context:
        if not used_cdp:
            q_res = await get_queue(plugin)
            if q_res.get("ok") and not (q_res.get("queue") or []):
                plugin._queue_cleared_for_track_id = getattr(plugin, "_poll_track_id", None)
                _set_optimistic_queue_snapshot(plugin, [])
                return {"ok": True, "queue": []}
        if getattr(plugin, "_poll_track_id", None):
            _schedule_deferred_queue_override(plugin, [], cleared=True)
        else:
            fallback_res = await _mutate_queue_via_uri_slice(plugin, token, [])
            if not fallback_res.get("ok"):
                err_msg = str(fallback_res.get("error") or "")
                if not (used_cdp and "No active track" in err_msg):
                    return fallback_res

    plugin._queue_cleared_for_track_id = getattr(plugin, "_poll_track_id", None)
    _set_optimistic_queue_snapshot(plugin, [])
    return {"ok": True, "queue": []}


def _resolve_cached_mix_uris(context_uri: str) -> list[str]:
    """Return cached track URIs for an algorithmic mix from discovery_mixes.json, or []."""
    if not context_uri or not isinstance(context_uri, str):
        return []
    target = context_uri.strip()
    if not target:
        return []
    pid = target.split(":")[-1] if ":" in target else target
    disk_cache = load_discovery_mixes_cache()
    mixes = disk_cache.get("mixes") if isinstance(disk_cache, dict) else None
    if not isinstance(mixes, list):
        return []
    for m in mixes:
        if not isinstance(m, dict):
            continue
        m_uri = str(m.get("uri") or "").strip()
        m_id = str(m.get("id") or "").strip()
        if (
            (m_uri and m_uri == target)
            or (m_id and pid and m_id == pid)
            or (m_uri and pid and m_uri.endswith(f":{pid}"))
        ):
            raw_uris = m.get("uris")
            if not (isinstance(raw_uris, list) and raw_uris) and isinstance(m.get("tracks"), list):
                raw_uris = [t.get("uri") for t in m["tracks"] if isinstance(t, dict) and t.get("uri")]
            clean = [u for u in (raw_uris or []) if isinstance(u, str) and u.strip()]
            if clean:
                return clean
    return []


def _build_uris_body(
    uris: list[str],
    offset_uri: str | None = None,
    position: int = 0,
    position_ms: int | None = None,
) -> dict:
    """Build a PUT /v1/me/player/play body using uris[] without context_uri."""
    body: dict = {}
    if offset_uri and offset_uri in uris:
        idx = uris.index(offset_uri)
        body["uris"] = uris[idx:]
        body["offset"] = {"position": 0}
    else:
        body["uris"] = list(uris)
        if position > 0:
            body["offset"] = {"position": position}
    if position_ms is not None and int(position_ms) > 0:
        body["position_ms"] = int(position_ms)
    return body


async def _try_cdp_play_fallback(plugin, body: dict) -> dict | None:
    """Attempt local CDP PlayerAPI.play fallback when spotify_client is running."""
    if not body or not is_spotify_client_running(plugin):
        return None
    ctx_uri = str(body.get("context_uri") or "").strip()
    uris = [str(u).strip() for u in (body.get("uris") or []) if str(u).strip()]
    try:
        if ctx_uri.startswith("spotify:playlist:"):
            res = await _exec(cdp_play_context, ctx_uri)
            if isinstance(res, dict) and res.get("ok"):
                return {"ok": True}
        elif ctx_uri:
            body_js = f"""
            const uri = {json.dumps(ctx_uri)};
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
            res = await _exec(cdp_bridge.evaluate_with_registry, body_js)
            if isinstance(res, dict) and res.get("ok"):
                return {"ok": True}
        elif uris:
            body_js = f"""
            const uris = {json.dumps(uris)};
            const playerApi = getService('PlayerAPI');
            if (!playerApi || typeof playerApi.play !== 'function') {{
              return {{ ok: false, error: 'PlayerAPI.play unavailable' }};
            }}
            try {{
              await playerApi.play({{ uri: uris[0] }}, {{}}, {{}});
              if (uris.length > 1 && typeof playerApi.addToQueue === 'function') {{
                await playerApi.addToQueue(uris.slice(1).map((u) => ({{ uri: u }})));
              }}
              return {{ ok: true, count: uris.length }};
            }} catch (e) {{
              return {{ ok: false, error: e?.message || String(e) }};
            }}
            """
            res = await _exec(cdp_bridge.evaluate_with_registry, body_js)
            if isinstance(res, dict) and res.get("ok"):
                return {"ok": True}
    except Exception as e:
        decky.logger.warning("CDP playback fallback failed: %s", e)
    return None


async def play_tracks(
    plugin,
    context_uri: str | None = None,
    offset_uri: str | None = None,
    uris: list | None = None,
    position: int = 0,
    position_ms: int | None = None,
) -> dict:
    """Start playback of a context, URI list, or single track."""
    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}
    # Handle flexible argument ordering if uris passed in place of offset_uri
    if isinstance(offset_uri, list):
        uris, offset_uri = offset_uri, None

    body = {}
    tried_cached_mix = False
    if context_uri:
        settings = getattr(plugin, "_settings", {}) or {}
        use_cached_mix = (
            settings.get("audio_backend", "librespot") == "librespot"
            or not is_spotify_client_running(plugin)
        )
        cached_uris = _resolve_cached_mix_uris(context_uri) if (use_cached_mix and not uris) else []
        if cached_uris:
            tried_cached_mix = True
            body = _build_uris_body(cached_uris, offset_uri, position, position_ms)
        else:
            body["context_uri"] = context_uri
            if offset_uri:
                body["offset"] = {"uri": offset_uri}
            elif position > 0:
                body["offset"] = {"position": position}
        plugin._context_uri = context_uri
    elif uris:
        body = _build_uris_body(uris, offset_uri, position, position_ms)
    elif offset_uri and str(offset_uri).strip():
        body["uris"] = [str(offset_uri).strip()]
    if body and position_ms is not None and int(position_ms) > 0:
        body["position_ms"] = int(position_ms)
    power_gov = getattr(plugin, "_power_governor", None)
    if power_gov is not None and getattr(power_gov, "engine_sleeping", False):
        await power_gov.wake_for_playback()

    async def _try_transfer(play_flag: bool) -> dict:
        try:
            return await plugin._auto_transfer_and_play(token, play=play_flag)
        except TypeError:
            return await plugin._auto_transfer_and_play(token)

    try:
        await _exec(
            _spotify_api_request, "me/player/play", token, "PUT", None, body,
        )
        _invalidate_optimistic_queue(plugin)
        return {"ok": True}
    except urllib.error.HTTPError as e:
        if e.code in (403, 404) and body.get("context_uri") and not tried_cached_mix:
            tried_cached_mix = True
            cached_uris = _resolve_cached_mix_uris(context_uri or body["context_uri"])
            if cached_uris:
                body = _build_uris_body(cached_uris, offset_uri, position, position_ms)
                try:
                    await _exec(_spotify_api_request, "me/player/play", token, "PUT", None, body)
                    _invalidate_optimistic_queue(plugin)
                    return {"ok": True}
                except urllib.error.HTTPError as retry_err:
                    e = retry_err
                except Exception as retry_exc:
                    decky.logger.error("play_tracks cached mix retry failed: %s", retry_exc)
                    return {"ok": False, "error": str(retry_exc)}
        if e.code == 404:
            transfer_play = not bool(body)
            transfer_res = await _try_transfer(transfer_play)
            if not transfer_res.get("ok") and power_gov is not None and (
                getattr(power_gov, "engine_sleeping", False)
                or (hasattr(plugin, "_is_engine_running") and not plugin._is_engine_running())
            ):
                await power_gov.wake_for_playback()
                transfer_res = await _try_transfer(transfer_play)
            elif (
                not transfer_res.get("ok")
                and hasattr(plugin, "_is_engine_running")
                and not plugin._is_engine_running()
                and getattr(plugin, "_settings", {}).get("audio_backend", "librespot") == "librespot"
                and hasattr(plugin, "start_librespot")
            ):
                start_res = await plugin.start_librespot()
                if isinstance(start_res, dict) and start_res.get("ok"):
                    for _ in range(4):
                        await asyncio.sleep(0.3)
                        dev_res = await get_devices(plugin)
                        if dev_res.get("devices"):
                            transfer_res = await _try_transfer(transfer_play)
                            break
            if transfer_res.get("ok") and body:
                await asyncio.sleep(0.5)
                target_dev = transfer_res.get("device_id") or ""
                retry_params = {"device_id": target_dev} if target_dev else None
                try:
                    await _exec(
                        _spotify_api_request, "me/player/play", token, "PUT", retry_params, body,
                    )
                    _invalidate_optimistic_queue(plugin)
                    return {"ok": True}
                except urllib.error.HTTPError as retry_err:
                    if retry_err.code in (403, 404) and body.get("context_uri") and not tried_cached_mix:
                        tried_cached_mix = True
                        cached_uris = _resolve_cached_mix_uris(context_uri or body["context_uri"])
                        if cached_uris:
                            body = _build_uris_body(cached_uris, offset_uri, position, position_ms)
                            try:
                                await _exec(
                                    _spotify_api_request,
                                    "me/player/play",
                                    token,
                                    "PUT",
                                    retry_params,
                                    body,
                                )
                                _invalidate_optimistic_queue(plugin)
                                return {"ok": True}
                            except urllib.error.HTTPError as mix_err:
                                retry_err = mix_err
                            except Exception as mix_exc:
                                decky.logger.error("play_tracks retry cached mix failed: %s", mix_exc)
                                return {"ok": False, "error": str(mix_exc)}
                    cdp_res = await _try_cdp_play_fallback(plugin, body)
                    if cdp_res and cdp_res.get("ok"):
                        _invalidate_optimistic_queue(plugin)
                        return {"ok": True}
                    return {"ok": False, "error": _parse_spotify_error(retry_err)}
                except Exception as retry_exc:
                    decky.logger.error("play_tracks retry after transfer failed: %s", retry_exc)
                    return {"ok": False, "error": str(retry_exc)}
            if not transfer_res.get("ok") and body:
                cdp_res = await _try_cdp_play_fallback(plugin, body)
                if cdp_res and cdp_res.get("ok"):
                    _invalidate_optimistic_queue(plugin)
                    return {"ok": True}
            return transfer_res
        if e.code == 403 and body:
            cdp_res = await _try_cdp_play_fallback(plugin, body)
            if cdp_res and cdp_res.get("ok"):
                _invalidate_optimistic_queue(plugin)
                return {"ok": True}
        return {"ok": False, "error": _parse_spotify_error(e)}
    except Exception as e:
        decky.logger.error("play_tracks failed: %s", e)
        return {"ok": False, "error": str(e)}


def _read_dmi_attr(dmi_root: str, attr: str) -> str:
    """Safely read a DMI sysfs attribute, returning empty string on OSError."""
    try:
        with open(os.path.join(dmi_root, attr), "r", encoding="utf-8") as f:
            return f.read().strip().lower()
    except OSError:
        return ""


def detect_host_hardware_label(
    dmi_root: str = "/sys/devices/virtual/dmi/id",
    sysfs_root: str = "/sys/class/power_supply",
) -> str:
    """Detect user-facing hardware label ('Steam Deck', 'Steam Machine', or 'Local Device')."""
    product_name = _read_dmi_attr(dmi_root, "product_name")
    board_name = _read_dmi_attr(dmi_root, "board_name")
    dmi_values = (product_name, board_name)

    if any(token in val for val in dmi_values for token in ("jupiter", "galileo", "steam deck")):
        return "Steam Deck"
    if any(token in val for val in dmi_values for token in ("steam machine", "fremont")):
        return "Steam Machine"

    try:
        has_battery, _ = read_power_supply_state(sysfs_root)
    except OSError:
        return "Local Device"

    return "Steam Machine" if not has_battery else "Local Device"


async def get_devices(plugin) -> dict:
    """Retrieve list of available Spotify Connect devices enriched with local engine metadata."""
    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}
    try:
        data = await _exec(_spotify_api_request, "me/player/devices", token)
        devices = data.get("devices", []) if data else []
        settings = getattr(plugin, "_settings", {}) or {}
        local_hostname = socket.gethostname()
        local_device_name = settings.get("device_name") or local_hostname
        audio_backend = settings.get("audio_backend", "librespot")
        engine_running = plugin._is_engine_running() if hasattr(plugin, "_is_engine_running") else False
        power_gov = getattr(plugin, "_power_governor", None)
        engine_sleeping = bool(getattr(power_gov, "engine_sleeping", False))
        return {
            "ok": True,
            "devices": devices,
            "local_device_name": local_device_name,
            "local_hostname": local_hostname,
            "local_hardware_label": detect_host_hardware_label(),
            "audio_backend": audio_backend,
            "engine_running": engine_running,
            "engine_sleeping": engine_sleeping,
        }
    except Exception as e:
        decky.logger.error("get_devices failed: %s", e)
        return {"ok": False, "error": str(e)}


def _match_local_device(devices: list, local_device_name: str) -> dict | None:
    """Find the local Steam Deck device in a Spotify Connect device list."""
    candidates = {
        c.strip().lower()
        for c in (local_device_name, "deckify", socket.gethostname())
        if isinstance(c, str) and c.strip()
    }
    for dev in devices:
        if not isinstance(dev, dict):
            continue
        name = (dev.get("name") or "").strip().lower()
        if name and name in candidates and dev.get("id"):
            return dev
    return None


async def pull_playback_to_deck(plugin) -> dict:
    """Wake local engine if needed, wait for Spotify Connect registration, and transfer playback."""
    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}

    settings = getattr(plugin, "_settings", {}) or {}
    local_name = settings.get("device_name") or socket.gethostname()
    power_gov = getattr(plugin, "_power_governor", None)
    is_running = plugin._is_engine_running() if hasattr(plugin, "_is_engine_running") else False

    if power_gov is not None and (getattr(power_gov, "engine_sleeping", False) or not is_running):
        await power_gov.wake_for_playback()
    elif not is_running:
        if settings.get("audio_backend", "librespot") == "spotify_client" and hasattr(plugin, "start_spotify_client"):
            await plugin.start_spotify_client()
        else:
            await plugin.start_librespot()

    matched = None
    for attempt in range(10):
        if attempt > 0:
            await asyncio.sleep(0.4)
        dev_res = await get_devices(plugin)
        if not dev_res.get("ok"):
            continue
        matched = _match_local_device(dev_res.get("devices") or [], local_name)
        if matched is not None:
            break

    if matched is None:
        return {"ok": False, "error": "Local Steam Deck device did not register on Spotify Connect"}

    try:
        await _exec(
            _spotify_api_request,
            "me/player",
            token,
            "PUT",
            None,
            {"device_ids": [matched["id"]], "play": True},
        )
        return {"ok": True, "device": matched}
    except urllib.error.HTTPError as e:
        return {"ok": False, "error": _parse_spotify_error(e)}
    except Exception as e:
        decky.logger.error("pull_playback_to_deck failed: %s", e)
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


async def quick_play_pinned(plugin, uri: str, item_type: str = "playlist") -> dict:
    """Auto-wake engine if needed and start playback of a pinned playlist, album, or liked songs."""
    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}
    if not isinstance(uri, str) or not uri.strip():
        return {"ok": False, "error": "Invalid playlist URI"}
    uri = uri.strip()

    power_gov = getattr(plugin, "_power_governor", None)
    is_running = plugin._is_engine_running() if hasattr(plugin, "_is_engine_running") else True
    if power_gov is not None and (getattr(power_gov, "engine_sleeping", False) or not is_running):
        await power_gov.wake_for_playback()
    elif not is_running:
        start_res = await plugin.start_librespot()
        if isinstance(start_res, dict) and start_res.get("ok"):
            for _ in range(4):
                await asyncio.sleep(0.3)
                dev_res = await get_devices(plugin)
                if dev_res.get("devices"):
                    break

    if item_type == "liked_songs" or uri in ("spotify:collection:tracks", "deckify:liked_songs"):
        try:
            data = await _exec(_spotify_api_request, "me/tracks", token, "GET", {"limit": 50})
        except urllib.error.HTTPError as e:
            return {"ok": False, "error": _parse_spotify_error(e)}
        except Exception as e:
            decky.logger.error("quick_play_pinned liked_songs fetch failed: %s", e)
            return {"ok": False, "error": str(e)}
        track_uris = [
            item["track"]["uri"]
            for item in (data.get("items") or [])
            if isinstance(item, dict) and isinstance(item.get("track"), dict) and item["track"].get("uri")
        ]
        if not track_uris:
            return {"ok": False, "error": "No liked songs found"}
        res = await play_tracks(plugin, uris=track_uris)
    else:
        res = await play_tracks(plugin, context_uri=uri)

    if res.get("ok"):
        plugin._poll_play_state = "playing"
        plugin._context_uri = uri
    return res


async def set_playback_speed(plugin, speed: float) -> dict:
    """Validate and apply podcast/audiobook playback speed via Official Spotify Client CDP."""
    if isinstance(speed, bool):
        return {"ok": False, "error": "Unsupported playback speed"}
    try:
        target_speed = float(speed)
    except (TypeError, ValueError):
        return {"ok": False, "error": "Unsupported playback speed"}
    if target_speed not in ALLOWED_PLAYBACK_SPEEDS:
        return {"ok": False, "error": "Unsupported playback speed"}

    if plugin._settings.get("audio_backend") != "spotify_client":
        return {
            "ok": False,
            "unsupported_backend": True,
            "error": "Playback speed requires the Official Spotify Client engine.",
        }

    try:
        res = await _exec(_cdp_set_playback_speed, target_speed)
    except Exception as e:
        decky.logger.error("set_playback_speed(%s) failed: %s", target_speed, e)
        return {"ok": False, "error": str(e)}

    if not isinstance(res, dict) or not res.get("ok"):
        return res if isinstance(res, dict) else {"ok": False, "error": "CDP setSpeed failed"}

    plugin._playback_speed = target_speed
    plugin._settings["preferred_podcast_speed"] = target_speed
    _save_settings(plugin._settings)
    await decky.emit("playback_speed_changed", {"speed": target_speed})
    return {"ok": True, "speed": target_speed}


async def play_ai_dj(
    plugin,
    uri: str = "spotify:playlist:37i9dQZF1EYkqdzj48dyYq",
) -> dict:
    """Start Spotify AI DJ playback via Official Spotify Client CDP PlayerAPI.play."""
    if not is_spotify_client_running(plugin):
        return {
            "ok": False,
            "requires_spotify_client": True,
            "error": "Spotify AI DJ requires the Official Spotify Client engine.",
        }
    clean_uri = str(uri or "spotify:playlist:37i9dQZF1EYkqdzj48dyYq").strip()
    if not clean_uri.startswith("spotify:playlist:"):
        return {"ok": False, "error": "Invalid AI DJ playlist URI"}
    try:
        res = await _exec(cdp_play_context, clean_uri)
    except Exception as e:
        decky.logger.error("play_ai_dj failed: %s", e)
        return {"ok": False, "error": str(e)}
    if isinstance(res, dict) and res.get("ok"):
        return {"ok": True, "uri": clean_uri}
    return res if isinstance(res, dict) else {"ok": False, "error": "Failed to start AI DJ"}


async def _try_cdp_station_radio(
    plugin,
    seed_type: str,
    seed_id: str,
    seed_uri: str = "",
) -> list[str]:
    """Tier 1 CDP station radio via cdp_bridge (0ms fast-fail when spotify_client is inactive)."""
    if (seed_type or "").strip().lower() not in ("track", "artist", "album"):
        return []
    if not is_spotify_client_running(plugin):
        return []
    try:
        uris = await _exec(cdp_fetch_station_radio_uris, seed_type, seed_id, seed_uri)
    except Exception as e:
        decky.logger.warning("_try_cdp_station_radio failed: %s", e)
        return []
    if not isinstance(uris, list):
        return []
    valid = [u for u in uris if isinstance(u, str) and u.startswith("spotify:track:")]
    return _dedupe_uris(valid)[:30]


def _dedupe_uris(uris: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for uri in uris:
        if isinstance(uri, str) and uri.strip() and uri not in seen:
            seen.add(uri)
            out.append(uri)
    return out


def _extract_seed_id(seed_id: str, seed_uri: str) -> str:
    raw = (seed_id or "").strip()
    if not raw and seed_uri:
        raw = seed_uri.strip()
    if raw.startswith("spotify:") and ":" in raw:
        raw = raw.split(":")[-1].strip()
    return raw


def _track_artist_key(track_dict: dict) -> str:
    """Return lowercased primary artist ID or name from a track dict."""
    if not isinstance(track_dict, dict):
        return ""
    artists = track_dict.get("artists")
    if isinstance(artists, list) and artists and isinstance(artists[0], dict):
        aid = artists[0].get("id")
        if isinstance(aid, str) and aid.strip():
            return aid.strip().lower()
        aname = artists[0].get("name")
        if isinstance(aname, str) and aname.strip():
            return aname.strip().lower()
    return ""


def _extract_track_pairs(items: list) -> list[tuple[str, str]]:
    """Extract (uri, artist_key) pairs from track or playlist-track wrapper items."""
    pairs: list[tuple[str, str]] = []
    for item in items or []:
        if not isinstance(item, dict):
            continue
        t = item.get("track") if isinstance(item.get("track"), dict) else item
        uri = t.get("uri")
        if isinstance(uri, str) and uri:
            pairs.append((uri, _track_artist_key(t)))
    return pairs


def _interleave_radio_mix(
    mix_tracks: list[tuple[str, str]],
    seed_artist_uris: list[str],
    seed_artist_keys: set[str],
    album_track_uris: list[str],
    norm_type: str,
) -> list[str]:
    """Interleave multi-artist mix tracks (2:1) with seed-artist tracks and cap single-artist dominance."""
    other_pool: list[tuple[str, str]] = []
    mix_seed_uris: list[str] = []
    for uri, art_key in mix_tracks:
        if art_key and art_key in seed_artist_keys:
            mix_seed_uris.append(uri)
        else:
            other_pool.append((uri, art_key))

    capped_other: list[str] = []
    overflow_other: list[str] = []
    artist_counts: dict[str, int] = {}
    for uri, art_key in other_pool:
        if art_key:
            count = artist_counts.get(art_key, 0)
            if count >= 4:
                overflow_other.append(uri)
                continue
            artist_counts[art_key] = count + 1
        capped_other.append(uri)

    seed_extras = album_track_uris if norm_type == "album" else []
    seed_pool = _dedupe_uris(seed_artist_uris + mix_seed_uris + seed_extras)

    synth_uris: list[str] = []
    o_idx = 0
    s_idx = 0
    while o_idx < len(capped_other) or s_idx < len(seed_pool):
        for _ in range(2):
            if o_idx < len(capped_other):
                synth_uris.append(capped_other[o_idx])
                o_idx += 1
        if s_idx < len(seed_pool):
            synth_uris.append(seed_pool[s_idx])
            s_idx += 1

    if len(_dedupe_uris(synth_uris)) < 15 and overflow_other:
        synth_uris.extend(overflow_other)

    return _dedupe_uris(synth_uris)


async def start_radio(
    plugin,
    seed_type: str,
    seed_id: str,
    seed_uri: str = "",
    seed_name: str = "",
    artist_name: str = "",
) -> dict:
    """Start Song, Artist, or Album Radio via a silent 3-tier waterfall and replace the queue."""
    norm_type = (seed_type or "").strip().lower()
    if norm_type not in ("track", "artist", "album"):
        return {"ok": False, "error": "Invalid radio seed type"}

    clean_id = _extract_seed_id(seed_id, seed_uri)
    if not clean_id:
        return {"ok": False, "error": "Invalid radio seed ID"}

    norm_uri = (seed_uri or "").strip() or f"spotify:{norm_type}:{clean_id}"
    safe_id = urllib.parse.quote(clean_id, safe="")

    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}

    candidate_uris: list[str] = []
    tier_used = ""
    album_track_uris: list[str] = []
    album_track_ids: list[str] = []
    resolved_artist_id = clean_id if norm_type == "artist" else ""
    resolved_artist_name = (artist_name or "").strip()
    resolved_seed_name = (seed_name or "").strip()

    radio_cache_key = (norm_type, safe_id)
    with _RADIO_CACHE_LOCK:
        cached_radio = _RADIO_CACHE.get(radio_cache_key)
        if cached_radio is not None:
            expires_at, cached_uris, cached_tier = cached_radio
            if time.monotonic() < expires_at and cached_uris:
                _RADIO_CACHE.move_to_end(radio_cache_key)
                candidate_uris = list(cached_uris)
                tier_used = cached_tier or "cache"
            else:
                del _RADIO_CACHE[radio_cache_key]

    # Tier 1: CDP station radio hook (stubbed until Phase 26)
    if not candidate_uris:
        try:
            tier1 = await _try_cdp_station_radio(plugin, norm_type, clean_id, norm_uri)
            if isinstance(tier1, list):
                candidate_uris = _dedupe_uris(tier1)
                if candidate_uris:
                    tier_used = "cdp"
        except Exception as e:
            decky.logger.warning("start_radio Tier 1 CDP failed: %s", e)
            candidate_uris = []

    # Tier 2: Web API /v1/recommendations (fallthrough on 403/404/empty)
    if not candidate_uris:
        try:
            rec_params: dict | None = None
            if norm_type == "track":
                rec_params = {"seed_tracks": clean_id, "limit": 25}
            elif norm_type == "artist":
                rec_params = {"seed_artists": clean_id, "limit": 25}
            elif norm_type == "album":
                alb_data = await _exec(
                    _spotify_api_request,
                    f"albums/{safe_id}/tracks",
                    token,
                    "GET",
                    {"limit": 10},
                )
                for item in (alb_data or {}).get("items", []) or []:
                    if not isinstance(item, dict):
                        continue
                    tid = item.get("id")
                    turi = item.get("uri")
                    if isinstance(tid, str) and tid:
                        album_track_ids.append(tid)
                    if isinstance(turi, str) and turi:
                        album_track_uris.append(turi)
                    if not resolved_artist_id and item.get("artists"):
                        first_art = item["artists"][0] if isinstance(item["artists"][0], dict) else {}
                        resolved_artist_id = first_art.get("id", "") or resolved_artist_id
                        resolved_artist_name = resolved_artist_name or first_art.get("name", "")
                if album_track_ids:
                    rec_params = {"seed_tracks": ",".join(album_track_ids[:5]), "limit": 25}

            if rec_params:
                rec_data = await _exec(
                    _spotify_api_request,
                    "recommendations",
                    token,
                    "GET",
                    rec_params,
                )
                rec_uris = [
                    t["uri"]
                    for t in ((rec_data or {}).get("tracks") or [])
                    if isinstance(t, dict) and isinstance(t.get("uri"), str) and t.get("uri")
                ]
                candidate_uris = _dedupe_uris(rec_uris)
                if candidate_uris:
                    tier_used = "recommendations"
        except SpotifyRateLimitError:
            raise
        except Exception as e:
            decky.logger.warning("start_radio Tier 2 recommendations failed: %s", e)
            candidate_uris = []

    # Tier 3: Multi-artist Radio Playlist + Broad/Genre Search + Seed-Artist synthesis fallback
    if not candidate_uris:
        mix_tracks: list[tuple[str, str]] = []
        seed_artist_uris: list[str] = []
        cached_art_info: dict | None = None

        if norm_type == "track" and (not resolved_artist_id or not resolved_artist_name):
            try:
                t_info = await _exec(_spotify_api_request, f"tracks/{safe_id}", token, "GET")
                if isinstance(t_info, dict):
                    resolved_seed_name = resolved_seed_name or (t_info.get("name") or "")
                    artists = t_info.get("artists") or []
                    if artists and isinstance(artists[0], dict):
                        resolved_artist_id = resolved_artist_id or (artists[0].get("id") or "")
                        resolved_artist_name = resolved_artist_name or (artists[0].get("name") or "")
            except SpotifyRateLimitError:
                raise
            except Exception as e:
                decky.logger.warning("start_radio Tier 3 track lookup failed: %s", e)

        # Step A: Radio/Mix Playlist Search
        if norm_type == "artist" or not resolved_seed_name:
            pl_query = f"{resolved_artist_name} radio".strip() if resolved_artist_name else ""
        else:
            pl_query = f"{resolved_seed_name} {resolved_artist_name} radio".strip()

        if pl_query:
            try:
                pl_data = await _exec(
                    _spotify_api_request,
                    "search",
                    token,
                    "GET",
                    {"q": pl_query, "type": "playlist", "limit": 5},
                )
                pl_items = [
                    p
                    for p in ((pl_data or {}).get("playlists", {}).get("items", []) or [])
                    if isinstance(p, dict) and isinstance(p.get("id"), str) and p.get("id", "").strip()
                ]
                chosen_pl = next(
                    (
                        p
                        for p in pl_items
                        if any(kw in (p.get("name") or "").lower() for kw in ("radio", "mix"))
                    ),
                    pl_items[0] if pl_items else None,
                )
                if chosen_pl:
                    safe_pl_id = urllib.parse.quote(chosen_pl["id"].strip(), safe="")
                    pl_tracks_data = await _exec(
                        _spotify_api_request,
                        f"playlists/{safe_pl_id}/tracks",
                        token,
                        "GET",
                        {"limit": 10},
                    )
                    mix_tracks.extend(_extract_track_pairs((pl_tracks_data or {}).get("items", [])))
                    pl_total = (pl_tracks_data or {}).get("total")
                    if len(mix_tracks) < 15 and isinstance(pl_total, int) and pl_total > 10:
                        pl_page2 = await _exec(
                            _spotify_api_request,
                            f"playlists/{safe_pl_id}/tracks",
                            token,
                            "GET",
                            {"limit": 10, "offset": 10},
                        )
                        mix_tracks.extend(_extract_track_pairs((pl_page2 or {}).get("items", [])))
            except SpotifyRateLimitError:
                raise
            except Exception as e:
                decky.logger.warning("start_radio Tier 3 playlist radio failed: %s", e)

        # Step B: Broad + Genre Multi-Artist Track Search
        if len(mix_tracks) < 15:
            if resolved_seed_name and resolved_artist_name and resolved_seed_name.lower() != resolved_artist_name.lower():
                broad_q = f"{resolved_seed_name} {resolved_artist_name}".strip()
            else:
                broad_q = (resolved_seed_name or resolved_artist_name).strip()
            if broad_q:
                try:
                    broad_data = await _exec(
                        _spotify_api_request,
                        "search",
                        token,
                        "GET",
                        {"q": broad_q, "type": "track", "limit": 10},
                    )
                    mix_tracks.extend(
                        _extract_track_pairs(((broad_data or {}).get("tracks") or {}).get("items", []))
                    )
                except SpotifyRateLimitError:
                    raise
                except Exception as e:
                    decky.logger.warning("start_radio Tier 3 broad search failed: %s", e)

        if resolved_artist_id and len(mix_tracks) < 15:
            safe_art_id = urllib.parse.quote(resolved_artist_id.strip(), safe="")
            try:
                if cached_art_info is None:
                    art_info = await _exec(
                        _spotify_api_request,
                        f"artists/{safe_art_id}",
                        token,
                        "GET",
                    )
                    if isinstance(art_info, dict):
                        cached_art_info = art_info
                        if not resolved_artist_name:
                            resolved_artist_name = art_info.get("name", "") or ""
                genres = (cached_art_info or {}).get("genres") or []
                first_genre = next(
                    (g.strip() for g in genres if isinstance(g, str) and g.strip()),
                    "",
                )
                if first_genre:
                    genre_data = await _exec(
                        _spotify_api_request,
                        "search",
                        token,
                        "GET",
                        {"q": f"genre:{first_genre}", "type": "track", "limit": 10},
                    )
                    mix_tracks.extend(
                        _extract_track_pairs(((genre_data or {}).get("tracks") or {}).get("items", []))
                    )
            except SpotifyRateLimitError:
                raise
            except Exception as e:
                decky.logger.warning("start_radio Tier 3 genre search failed: %s", e)

        # Step C: Seed-Artist Pool Fallback
        if resolved_artist_id:
            safe_art_id = urllib.parse.quote(resolved_artist_id.strip(), safe="")
            try:
                top_data = await _exec(
                    _spotify_api_request,
                    f"artists/{safe_art_id}/top-tracks",
                    token,
                    "GET",
                )
                for t in ((top_data or {}).get("tracks") or []):
                    if isinstance(t, dict) and isinstance(t.get("uri"), str) and t.get("uri"):
                        seed_artist_uris.append(t["uri"])
            except SpotifyRateLimitError:
                raise
            except Exception as e:
                decky.logger.warning("start_radio Tier 3 top-tracks failed: %s", e)
                if not resolved_artist_name and cached_art_info is None:
                    try:
                        art_info = await _exec(
                            _spotify_api_request,
                            f"artists/{safe_art_id}",
                            token,
                            "GET",
                        )
                        if isinstance(art_info, dict):
                            cached_art_info = art_info
                            resolved_artist_name = art_info.get("name", "") or ""
                    except SpotifyRateLimitError:
                        raise
                    except Exception as art_err:
                        decky.logger.warning("start_radio Tier 3 artist lookup failed: %s", art_err)

        seed_artist_uris = _dedupe_uris(seed_artist_uris)

        if len(mix_tracks) + len(seed_artist_uris) < 20:
            search_query = f"artist:{resolved_artist_name}" if resolved_artist_name else resolved_seed_name
            if search_query:
                try:
                    search_data = await _exec(
                        _spotify_api_request,
                        "search",
                        token,
                        "GET",
                        {"q": search_query, "type": "track", "limit": 10},
                    )
                    for t in ((search_data or {}).get("tracks") or {}).get("items", []) or []:
                        if isinstance(t, dict) and isinstance(t.get("uri"), str) and t.get("uri"):
                            seed_artist_uris.append(t["uri"])
                    seed_artist_uris = _dedupe_uris(seed_artist_uris)
                except SpotifyRateLimitError:
                    raise
                except Exception as e:
                    decky.logger.warning("start_radio Tier 3 search failed: %s", e)

        if len(mix_tracks) + len(seed_artist_uris) < 20 and resolved_artist_id:
            safe_art_id = urllib.parse.quote(resolved_artist_id.strip(), safe="")
            try:
                albums_data = await _exec(
                    _spotify_api_request,
                    f"artists/{safe_art_id}/albums",
                    token,
                    "GET",
                    {"limit": 1, "include_groups": "album,single"},
                )
                for alb in (albums_data or {}).get("items", []) or []:
                    if not isinstance(alb, dict):
                        continue
                    alb_id = alb.get("id")
                    if not isinstance(alb_id, str) or not alb_id.strip():
                        continue
                    safe_alb_id = urllib.parse.quote(alb_id.strip(), safe="")
                    alb_tracks_data = await _exec(
                        _spotify_api_request,
                        f"albums/{safe_alb_id}/tracks",
                        token,
                        "GET",
                        {"limit": 10},
                    )
                    for t in (alb_tracks_data or {}).get("items", []) or []:
                        if isinstance(t, dict) and isinstance(t.get("uri"), str) and t.get("uri"):
                            seed_artist_uris.append(t["uri"])
                    seed_artist_uris = _dedupe_uris(seed_artist_uris)
                    break
            except SpotifyRateLimitError:
                raise
            except Exception as e:
                decky.logger.warning("start_radio Tier 3 artist albums fallback failed: %s", e)

        if norm_type == "album" and not album_track_uris:
            try:
                alb_data = await _exec(
                    _spotify_api_request,
                    f"albums/{safe_id}/tracks",
                    token,
                    "GET",
                    {"limit": 10},
                )
                for item in (alb_data or {}).get("items", []) or []:
                    if isinstance(item, dict) and isinstance(item.get("uri"), str) and item.get("uri"):
                        album_track_uris.append(item["uri"])
            except SpotifyRateLimitError:
                raise
            except Exception as e:
                decky.logger.warning("start_radio Tier 3 album tracks fallback failed: %s", e)

        # Step D: Interleaved Multi-Artist Assembly
        seed_artist_keys = {
            k.strip().lower()
            for k in (resolved_artist_id, resolved_artist_name)
            if isinstance(k, str) and k.strip()
        }
        candidate_uris = _interleave_radio_mix(
            mix_tracks,
            seed_artist_uris,
            seed_artist_keys,
            album_track_uris,
            norm_type,
        )
        if candidate_uris:
            tier_used = "synthesis"

    if not candidate_uris:
        return {"ok": False, "error": "Could not start radio — please try again."}

    with _RADIO_CACHE_LOCK:
        _RADIO_CACHE[radio_cache_key] = (
            time.monotonic() + _RADIO_CACHE_TTL_S,
            list(candidate_uris),
            tier_used or "synthesis",
        )
        _RADIO_CACHE.move_to_end(radio_cache_key)
        while len(_RADIO_CACHE) > _RADIO_CACHE_MAX_SIZE:
            _RADIO_CACHE.popitem(last=False)

    if norm_type == "track" and norm_uri:
        final_uris = [norm_uri] + [u for u in candidate_uris if u != norm_uri]
        final_uris = final_uris[:30]
    else:
        final_uris = candidate_uris[:30]

    play_res = await play_tracks(plugin, uris=final_uris)
    if not isinstance(play_res, dict) or not play_res.get("ok"):
        return play_res if isinstance(play_res, dict) else {"ok": False, "error": "Playback failed"}

    return {
        "ok": True,
        "count": len(final_uris),
        "tier": tier_used,
        "uris": final_uris,
    }
