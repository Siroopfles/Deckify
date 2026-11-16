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
            "fading": False,
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
        "fading": bool(getattr(plugin, "_sleep_timer_fading", False)),
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
        try:
            await plugin._sleep_timer_task
        except asyncio.CancelledError:
            pass
        plugin._sleep_timer_task = None

    plugin._sleep_timer_fading = False

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
    fader = getattr(plugin, "_volume_fader", None)
    did_fade = False
    try:
        if plugin._sleep_timer_end_of_track:
            start_track = plugin._poll_track_id
            while True:
                await asyncio.sleep(1)
                if plugin._poll_track_id != start_track or plugin._poll_play_state != "playing":
                    break
        else:
            settings = getattr(plugin, "_settings", {})
            fade_enabled = bool(settings.get("sleep_timer_fade_enabled", True))
            fade_duration = max(5, min(120, int(settings.get("sleep_timer_fade_duration", 30))))

            if fade_enabled and fader is not None:
                while time.time() < (plugin._sleep_timer_end - fade_duration):
                    await asyncio.sleep(
                        min(1.0, max(0.05, (plugin._sleep_timer_end - fade_duration) - time.time()))
                    )
                actual_fade = max(0.0, min(float(fade_duration), plugin._sleep_timer_end - time.time()))
                plugin._sleep_timer_fading = True
                await fader.start_sleep_fade(actual_fade)
                plugin._sleep_timer_fading = False
                did_fade = True
            else:
                while time.time() < plugin._sleep_timer_end:
                    await asyncio.sleep(1)

        decky.logger.info("Sleep timer expired, pausing playback")
        await plugin.control_playback("pause")

        if did_fade and fader is not None:
            await asyncio.sleep(1.2)
            await fader.release_sleep_lock(0.0, wait=True)

        if plugin._sleep_timer_shutdown:
            decky.logger.info("Sleep timer triggering system shutdown")
            await plugin.shutdown_system()
    except asyncio.CancelledError:
        plugin._sleep_timer_fading = False
        if fader is not None and getattr(fader, "_sleep_locked", False):
            await fader.release_sleep_lock(0.5, wait=False)
    except Exception as e:
        plugin._sleep_timer_fading = False
        decky.logger.error("Sleep timer error: %s", e)
        if fader is not None and getattr(fader, "_sleep_locked", False):
            await fader.release_sleep_lock(0.0, wait=False)


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
