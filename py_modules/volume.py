import os
import subprocess
import urllib.error
from py_modules.common import (
    PULSE_SERVER,
    _exec,
    _build_deck_command,
    _save_settings,
    decky,
)
from py_modules.engine import (
    _parse_pactl_sink_inputs,
    _get_pactl_sinks,
    _set_pactl_sink_input,
)
from py_modules.spotify import (
    _spotify_api_request,
    _parse_spotify_error,
)


async def set_volume(plugin, volume_percent: int) -> dict:
    """Set Spotify playback volume (0-100%)."""
    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}

    volume_percent = max(0, min(100, int(volume_percent)))
    try:
        await _exec(
            _spotify_api_request, "me/player/volume", token, "PUT",
            {"volume_percent": volume_percent},
        )
        return {"ok": True}
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {"ok": False, "error": "No active device found"}
        return {"ok": False, "error": _parse_spotify_error(e)}
    except Exception as e:
        decky.logger.error("set_volume(%d) failed: %s", volume_percent, e)
        return {"ok": False, "error": str(e)}


async def set_pa_volume_percent(plugin, percent: int) -> bool:
    """Set librespot's PulseAudio sink-input volume percentage."""
    if not plugin._process:
        return False
    pid = plugin._process.pid
    try:
        env = os.environ.copy()
        env["PULSE_SERVER"] = PULSE_SERVER

        def _list_sinks():
            return subprocess.run(
                ["pactl", "list", "sink-inputs"],
                capture_output=True, text=True, env=env,
            )

        result = await _exec(_list_sinks)
        sink_input_id = None
        current_id = None
        for line in result.stdout.splitlines():
            line = line.strip()
            if line.startswith("Sink Input #"):
                current_id = line.split("#")[1]
            elif "application.process.id" in line and f'"{pid}"' in line:
                sink_input_id = current_id
                break
        if sink_input_id:
            def _set_vol():
                return subprocess.run(
                    ["pactl", "set-sink-input-volume", sink_input_id, f"{int(percent)}%"],
                    capture_output=True, text=True, env=env,
                )
            await _exec(_set_vol)
            return True
    except Exception as e:
        decky.logger.warning("Failed to set PA volume to %d%%: %s", percent, e)
    return False


async def boost_pa_volume(plugin):
    """Set librespot's PulseAudio sink-input to 150% for audible volume."""
    if await plugin._set_pa_volume_percent(150):
        decky.logger.info("PA volume boosted to 150%%")
        plugin._pa_volume_boosted = True


async def apply_equalizer_preset(plugin, preset: str) -> None:
    """Persist and emit equalizer preset change."""
    decky.logger.info("Applying EQ preset: %s", preset)
    plugin._settings["eq_preset"] = preset
    _save_settings(plugin._settings)
    await decky.emit("eq_preset_changed", {"preset": preset})


async def configure_pipewire_clock(unlock_lossless: bool) -> None:
    """Unlock 44.1kHz/88.2kHz/96kHz in PipeWire when Lossless is active, or restore default 48kHz."""
    rates = "[ 44100 48000 88200 96000 ]" if unlock_lossless else "[ 48000 ]"
    try:
        cmd, env = _build_deck_command(["pw-metadata", "-n", "settings", "0", "clock.allowed-rates", rates])
        await _exec(lambda: subprocess.run(cmd, env=env, capture_output=True, text=True), timeout=5)
        decky.logger.info("PipeWire clock.allowed-rates set to %s", rates)
    except Exception as e:
        decky.logger.warning("Failed to configure PipeWire clock rates: %s", e)


async def refresh_audio_stream_info(plugin) -> None:
    """Inspect PipeWire/PulseAudio sink-inputs to report live sample rate and bit depth."""
    try:
        env = os.environ.copy()
        env["PULSE_SERVER"] = PULSE_SERVER
        res = await _exec(
            lambda: subprocess.run(
                ["pactl", "list", "sink-inputs"],
                capture_output=True, text=True, env=env,
            ),
            timeout=4,
        )
        plugin._audio_stream_info = _parse_pactl_sink_inputs(res.stdout)
    except Exception:
        pass


async def get_audio_sinks() -> dict:
    """List available audio output sinks via pactl."""
    try:
        sinks = await _exec(_get_pactl_sinks, timeout=3)
        return {"ok": True, "sinks": sinks}
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def set_audio_sink(sink_name: str) -> dict:
    """Switch active sink input to specified sink name."""
    if not sink_name or not isinstance(sink_name, str):
        return {"ok": False, "error": "Missing sink_name"}
    try:
        ok = await _exec(_set_pactl_sink_input, sink_name.strip(), timeout=4)
        return {"ok": ok}
    except Exception as e:
        return {"ok": False, "error": str(e)}
