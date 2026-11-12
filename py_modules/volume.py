import asyncio
import math
import os
import subprocess
import time
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


class VolumeFader:
    """Asynchronous non-blocking volume fader using cosine easing over PipeWire sink inputs."""

    def __init__(self, plugin):
        self.plugin = plugin
        self._fade_task: asyncio.Task | None = None
        self._current_sink_volume: float = 150.0 if getattr(plugin, "_pa_volume_boosted", False) else 100.0
        self._target_sink_volume: float = self._current_sink_volume
        self._cached_sink_input_id: str | None = None
        self._duck_reasons: set[str] = set()

    @property
    def is_ducked(self) -> bool:
        return len(self._duck_reasons) > 0

    @property
    def effective_volume(self) -> int:
        baseline = 150.0 if getattr(self.plugin, "_pa_volume_boosted", False) else 100.0
        ratio = (self._current_sink_volume / baseline) if baseline > 0 else 1.0
        base_vol = getattr(self.plugin, "_poll_volume", 80) or 80
        return max(0, min(100, int(round(base_vol * ratio))))

    async def resolve_sink_input_id(self) -> str | None:
        """Find the active Spotify/librespot PipeWire sink input ID."""
        try:
            cmd, env = _build_deck_command(["pactl", "list", "sink-inputs"])
            res = await _exec(
                lambda: subprocess.run(cmd, capture_output=True, text=True, env=env),
                timeout=3,
            )
            if not res or res.returncode != 0 or not res.stdout:
                return None

            pids = set()
            if getattr(self.plugin, "_process", None) and hasattr(self.plugin._process, "pid"):
                pids.add(str(self.plugin._process.pid))
            if getattr(self.plugin, "_spotify_client_process", None) and hasattr(self.plugin._spotify_client_process, "pid"):
                pids.add(str(self.plugin._spotify_client_process.pid))

            current_id = None
            for raw_line in res.stdout.splitlines():
                line = raw_line.strip()
                if line.startswith("Sink Input #"):
                    parts = line.split("#")
                    if len(parts) > 1 and parts[1].strip().isdigit():
                        current_id = parts[1].strip()
                    else:
                        current_id = None
                elif current_id:
                    if any(f'"{p}"' in line for p in pids if p):
                        return current_id
                    low = line.lower()
                    if ("application.name" in low or "media.name" in low) and ("librespot" in low or "spotify" in low):
                        return current_id
        except Exception as e:
            decky.logger.warning("Failed to resolve sink input ID: %s", e)
        return None

    async def _apply_sink_volume(self, sink_input_id: str, percent: float) -> bool:
        """Apply volume percentage directly to the cached sink input."""
        # T-06-02: validate sink_input_id strictly numeric digits, clamp percent 0-150
        if not sink_input_id or not str(sink_input_id).isdigit():
            return False
        clamped_pct = max(0.0, min(150.0, float(percent)))
        try:
            cmd, env = _build_deck_command([
                "pactl", "set-sink-input-volume", str(sink_input_id), f"{int(round(clamped_pct))}%"
            ])
            res = await _exec(
                lambda: subprocess.run(cmd, capture_output=True, text=True, env=env),
                timeout=2,
            )
            return res is not None and res.returncode == 0
        except Exception:
            return False

    async def set_ducking(self, active: bool, reason: str = "game") -> None:
        """Coordinate ducking state changes from game lifecycle or voice chat."""
        if active:
            self._duck_reasons.add(reason)
        else:
            self._duck_reasons.discard(reason)

        target_should_duck = len(self._duck_reasons) > 0
        settings = getattr(self.plugin, "_settings", {})

        baseline_sink_vol = 150.0 if getattr(self.plugin, "_pa_volume_boosted", False) else 100.0

        if target_should_duck:
            duration = float(settings.get("duck_fade_down_duration", 1.0))
            mode = settings.get("ducking_mode", "proportional")

            if mode == "proportional":
                attenuation_pct = float(settings.get("ducking_proportional_pct", 50))
                factor = max(0.05, 1.0 - (attenuation_pct / 100.0))
            else:
                fixed_vol = float(settings.get("auto_ducking_volume", 25))
                base_spotify_vol = float(getattr(self.plugin, "_poll_volume", 80) or 80)
                factor = min(1.0, fixed_vol / max(1.0, base_spotify_vol))

            target_sink_vol = baseline_sink_vol * factor
        else:
            duration = float(settings.get("duck_fade_up_duration", 1.5))
            target_sink_vol = baseline_sink_vol

        await self.fade_to(target_sink_vol, duration)

    async def fade_to(self, target_sink_volume: float, duration_sec: float) -> None:
        """Fade volume smoothly using cosine easing curve."""
        if self._fade_task and not self._fade_task.done():
            self._fade_task.cancel()
            try:
                await self._fade_task
            except asyncio.CancelledError:
                pass

        self._fade_task = asyncio.create_task(
            self._execute_fade(target_sink_volume, duration_sec)
        )

    async def _execute_fade(self, target_vol: float, duration_sec: float) -> None:
        start_vol = self._current_sink_volume
        self._target_sink_volume = target_vol

        if not self._cached_sink_input_id:
            self._cached_sink_input_id = await self.resolve_sink_input_id()

        if not self._cached_sink_input_id or duration_sec <= 0:
            self._current_sink_volume = target_vol
            if self._cached_sink_input_id:
                await self._apply_sink_volume(self._cached_sink_input_id, target_vol)
            await self._emit_state()
            return

        start_time = time.monotonic()
        step_interval = 0.05  # 50ms time slices (D-01)

        try:
            while True:
                now = time.monotonic()
                elapsed = now - start_time
                progress = min(1.0, elapsed / duration_sec) if duration_sec > 0 else 1.0

                eased = 0.5 * (1.0 - math.cos(math.pi * progress))
                self._current_sink_volume = start_vol + (target_vol - start_vol) * eased

                if self._cached_sink_input_id:
                    ok = await self._apply_sink_volume(self._cached_sink_input_id, self._current_sink_volume)
                    if not ok:
                        self._cached_sink_input_id = await self.resolve_sink_input_id()

                await self._emit_state()

                if progress >= 1.0:
                    break
                await asyncio.sleep(step_interval)
        except asyncio.CancelledError:
            # Leave self._current_sink_volume at the last reached level to prevent clicks/jumps
            raise

    async def _emit_state(self) -> None:
        baseline = 150.0 if getattr(self.plugin, "_pa_volume_boosted", False) else 100.0
        ratio = (self._current_sink_volume / baseline) if baseline > 0 else 1.0
        base_vol = getattr(self.plugin, "_poll_volume", 80) or 80
        effective_vol = max(0, min(100, int(round(base_vol * ratio))))

        await decky.emit("ducking_state_changed", {
            "is_ducked": self.is_ducked,
            "effective_volume": effective_vol,
            "base_volume": base_vol,
            "duck_reasons": list(self._duck_reasons),
        })

