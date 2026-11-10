import asyncio
import subprocess
import time
from py_modules.common import (
    SPOTIFY_CDP_PORT,
    _exec,
    decky,
)
from py_modules.engine import (
    get_spotify_client_auth_status,
)


def get_sleep_timer_status(plugin) -> dict:
    """Return status of active sleep timer."""
    if not plugin._sleep_timer_task or plugin._sleep_timer_task.done():
        return {
            "active": False,
            "remaining_seconds": 0,
            "shutdown_on_finish": False,
            "end_of_track": False,
        }
    rem = max(0, int(plugin._sleep_timer_end - time.time())) if not plugin._sleep_timer_end_of_track else 0
    if plugin._sleep_timer_end_of_track:
        dur = plugin._last_event.get("duration_ms", 0) if plugin._last_event else 0
        pos = plugin._last_event.get("position_ms", 0) if plugin._last_event else 0
        if dur > pos:
            rem = max(0, int((dur - pos) / 1000))
    return {
        "active": True,
        "remaining_seconds": rem,
        "shutdown_on_finish": plugin._sleep_timer_shutdown,
        "end_of_track": plugin._sleep_timer_end_of_track,
    }


async def set_sleep_timer(
    plugin,
    minutes: int | None = None,
    shutdown_on_finish: bool = False,
    end_of_track: bool = False,
) -> dict:
    """Configure or cancel sleep timer."""
    if plugin._sleep_timer_task and not plugin._sleep_timer_task.done():
        plugin._sleep_timer_task.cancel()
        plugin._sleep_timer_task = None

    if (minutes is None or minutes <= 0) and not end_of_track:
        return {"ok": True, "sleep_timer": get_sleep_timer_status(plugin)}

    plugin._sleep_timer_shutdown = bool(shutdown_on_finish)
    plugin._sleep_timer_end_of_track = bool(end_of_track)
    if minutes is not None and minutes > 0:
        plugin._sleep_timer_end = time.time() + (minutes * 60)
    else:
        plugin._sleep_timer_end = 0

    plugin._sleep_timer_initial_track_id = plugin._poll_track_id
    plugin._sleep_timer_task = asyncio.create_task(sleep_timer_worker(plugin))
    return {"ok": True, "sleep_timer": get_sleep_timer_status(plugin)}


async def sleep_timer_worker(plugin):
    """Background worker monitoring sleep timer elapsed duration."""
    try:
        if plugin._sleep_timer_end_of_track:
            start_track = plugin._poll_track_id
            while True:
                await asyncio.sleep(1)
                if plugin._poll_track_id != start_track or plugin._poll_play_state != "playing":
                    break
        else:
            while time.time() < plugin._sleep_timer_end:
                await asyncio.sleep(1)

        decky.logger.info("Sleep timer expired, pausing playback")
        await plugin.control_playback("pause")

        if plugin._sleep_timer_shutdown:
            decky.logger.info("Sleep timer triggering system shutdown")
            await plugin.shutdown_system()
    except asyncio.CancelledError:
        pass
    except Exception as e:
        decky.logger.error("Sleep timer error: %s", e)


async def shutdown_system() -> dict:
    """Power off the Steam Deck / Steam Machine cleanly."""
    try:
        def _poweroff():
            subprocess.Popen(["systemctl", "poweroff"])
        await _exec(_poweroff, timeout=3)
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def get_client_auth_status() -> dict:
    """Query official client authentication and CDP connectivity status."""
    try:
        return await _exec(get_spotify_client_auth_status, SPOTIFY_CDP_PORT, timeout=3)
    except Exception as e:
        return {"ok": False, "running": False, "logged_in": False, "error": str(e)}
