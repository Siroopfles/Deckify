"""Real-time PipeWire filter-chain 10-band biquad equalizer for Deckify."""

import asyncio
import json
import os
import subprocess
from typing import Any

from py_modules.common import (
    _build_deck_command,
    _exec,
    _save_settings,
    decky,
)
from py_modules.engine import _set_pactl_sink_input

EQ_BAND_FREQS: tuple[float, ...] = (
    31.0,
    62.0,
    125.0,
    250.0,
    500.0,
    1000.0,
    2000.0,
    4000.0,
    8000.0,
    16000.0,
)

EQ_SINK_NAME = "deckify_eq_sink"
EQ_OUTPUT_NODE_NAME = "effect_output.deckify_eq"
EQ_OUTPUT_MEDIA_NAME = "deckify_eq_out"

_SETTINGS_DIR = getattr(decky, "DECKY_PLUGIN_SETTINGS_DIR", None) or os.path.expanduser("~/.config/deckify")
EQ_CONF_PATH = os.path.join(_SETTINGS_DIR, "eq-filter-chain.conf")

EQ_PRESETS: dict[str, list[float]] = {
    "flat": [0.0] * 10,
    "bass": [5.0, 6.0, 4.5, 2.0, 0.0, 0.0, 0.5, 1.0, 1.5, 1.0],
    "vocal": [-2.0, -1.5, -1.0, 0.0, 1.5, 3.5, 4.5, 3.5, 1.5, 0.0],
    "gaming": [2.5, 2.0, 0.5, -2.5, -3.5, -3.0, -1.5, 1.0, 2.5, 2.0],
    "deck_speakers": [0.0, 1.5, 4.0, 2.5, -2.0, 0.0, 1.5, 3.0, 3.5, 2.0],
    "late_night": [4.0, 3.5, 2.0, 0.0, -0.5, -1.0, -1.5, -1.0, 2.0, 3.0],
    "custom": [0.0] * 10,
}

_PW_CLI_THROTTLE_S = 0.075
_SAVE_DEBOUNCE_S = 0.5


def clamp_eq_bands(bands: Any) -> list[float]:
    """Normalize input to exactly 10 floats clamped to [-12.0, 12.0]."""
    raw = list(bands) if isinstance(bands, (list, tuple)) else []
    result: list[float] = []
    for idx in range(10):
        if idx < len(raw):
            try:
                val = float(raw[idx])
                if val != val:  # NaN guard
                    val = 0.0
            except (TypeError, ValueError):
                val = 0.0
        else:
            val = 0.0
        result.append(round(max(-12.0, min(12.0, val)), 2))
    return result


def compute_preamp_db(bands: list[float]) -> float:
    """Compute automatic negative preamp headroom: -max(0.0, max(bands))."""
    if not bands:
        return 0.0
    max_gain = max(float(b) for b in bands)
    if max_gain <= 0.0:
        return 0.0
    return -max_gain


def _compute_preamp_mult(bands: list[float]) -> float:
    preamp_db = compute_preamp_db(bands)
    return round(10.0 ** (preamp_db / 20.0), 6)


def _is_valid_sink_name(sink_name: str | None) -> bool:
    if not isinstance(sink_name, str):
        return False
    stripped = sink_name.strip()
    if not stripped or stripped.startswith("-"):
        return False
    if any(ch in stripped for ch in ('"', "'", "\n", "\r", "{", "}")):
        return False
    return True


def generate_filter_chain_conf(bands: list[float], target_sink: str | None = None) -> str:
    """Generate PipeWire libpipewire-module-filter-chain config for 10-band ISO EQ."""
    clamped = clamp_eq_bands(bands)
    mult = _compute_preamp_mult(clamped)

    node_lines = [
        f'                    {{ type = builtin name = eq_preamp label = linear     control = {{ "Mult" = {mult} "Add" = 0.0 }} }}'
    ]
    for idx, (freq, gain) in enumerate(zip(EQ_BAND_FREQS, clamped)):
        if idx == 0:
            label = "bq_lowshelf "
            q_val = 0.707
        elif idx == 9:
            label = "bq_highshelf"
            q_val = 0.707
        else:
            label = "bq_peaking  "
            q_val = 1.414
        node_lines.append(
            f'                    {{ type = builtin name = eq_band_{idx} label = {label} '
            f'control = {{ "Freq" = {freq:<7} "Q" = {q_val} "Gain" = {gain} }} }}'
        )

    link_lines = ['                    { output = "eq_preamp:Out" input = "eq_band_0:In" }']
    for idx in range(9):
        link_lines.append(
            f'                    {{ output = "eq_band_{idx}:Out" input = "eq_band_{idx + 1}:In" }}'
        )

    target_line = ""
    if _is_valid_sink_name(target_sink):
        target_line = f'\n                target.object = "{target_sink.strip()}"'

    nodes_block = "\n".join(node_lines)
    links_block = "\n".join(link_lines)

    return (
        "context.properties = {\n"
        "    log.level = 0\n"
        "}\n\n"
        "context.spa-libs = {\n"
        "    audio.convert.* = audioconvert/libspa-audioconvert\n"
        "    support.*       = support/libspa-support\n"
        "}\n\n"
        "context.modules = [\n"
        "    { name = libpipewire-module-protocol-native }\n"
        "    { name = libpipewire-module-client-node }\n"
        "    { name = libpipewire-module-adapter }\n"
        "    {\n"
        "        name = libpipewire-module-filter-chain\n"
        "        args = {\n"
        '            node.description = "Deckify Equalizer"\n'
        '            media.name       = "Deckify Equalizer"\n'
        "            filter.graph = {\n"
        "                nodes = [\n"
        f"{nodes_block}\n"
        "                ]\n"
        "                links = [\n"
        f"{links_block}\n"
        "                ]\n"
        "            }\n"
        "            audio.channels = 2\n"
        "            audio.position = [ FL FR ]\n"
        "            capture.props = {\n"
        f'                node.name          = "{EQ_SINK_NAME}"\n'
        '                media.class        = "Audio/Sink"\n'
        "                priority.session   = 0\n"
        "                priority.driver    = 0\n"
        "                node.pause-on-idle = true\n"
        "            }\n"
        "            playback.props = {\n"
        f'                node.name    = "{EQ_OUTPUT_NODE_NAME}"\n'
        f'                media.name   = "{EQ_OUTPUT_MEDIA_NAME}"\n'
        f"                node.passive = true{target_line}\n"
        "            }\n"
        "        }\n"
        "    }\n"
        "]\n"
    )


def parse_eq_node_id(pw_dump_stdout: str, target_name: str = EQ_SINK_NAME) -> int | None:
    """Extract positive integer PipeWire node ID for target_name from pw-dump JSON."""
    if not pw_dump_stdout:
        return None
    try:
        objects = json.loads(pw_dump_stdout)
    except (ValueError, TypeError):
        return None
    if not isinstance(objects, list):
        return None
    for obj in objects:
        if not isinstance(obj, dict):
            continue
        if obj.get("type") != "PipeWire:Interface:Node":
            continue
        props = obj.get("info", {}).get("props", {})
        if isinstance(props, dict) and props.get("node.name") == target_name:
            node_id = obj.get("id")
            if isinstance(node_id, int) and not isinstance(node_id, bool) and node_id > 0:
                return node_id
    return None


def build_pw_cli_params(bands: list[float]) -> str:
    """Format pw-cli set-param Props payload with eq_preamp:Mult and eq_band_0..9:Gain."""
    clamped = clamp_eq_bands(bands)
    mult = _compute_preamp_mult(clamped)
    tokens = [f'"eq_preamp:Mult" {mult}']
    for idx, gain in enumerate(clamped):
        tokens.append(f'"eq_band_{idx}:Gain" {round(float(gain), 2)}')
    return "{ params = [ " + " ".join(tokens) + " ] }"


class EqualizerManager:
    """Manages an isolated pipewire -c filter-chain child process for Deckify EQ."""

    def __init__(self, plugin: Any, conf_path: str | None = None):
        self.plugin = plugin
        self.conf_path = conf_path or EQ_CONF_PATH
        self._process: subprocess.Popen | None = None
        self._node_id: int | None = None
        self._target_hardware_sink: str | None = None
        self._throttle_task: asyncio.Task | None = None
        self._save_task: asyncio.Task | None = None
        self._pending_bands: list[float] | None = None
        self._lock = asyncio.Lock()

    @property
    def is_active(self) -> bool:
        return self._process is not None and self._process.poll() is None

    def _get_player_pids(self) -> set[str]:
        pids: set[str] = set()
        for attr in ("_process", "_spotify_client_process"):
            proc = getattr(self.plugin, attr, None)
            if proc is not None and getattr(proc, "pid", None):
                pids.add(str(proc.pid))
        return pids

    def _deck_cmd(self, args: list[str]) -> tuple[list[str], dict]:
        cmd, env = _build_deck_command(args)
        env.pop("LD_LIBRARY_PATH", None)
        return cmd, env

    async def _route_librespot_to_sink(self, target_sink: str) -> bool:
        pids = self._get_player_pids()
        try:
            return await _exec(
                _set_pactl_sink_input,
                target_sink,
                pids,
                False,
                False,
                timeout=4,
            )
        except TypeError:
            return await _exec(_set_pactl_sink_input, target_sink, pids, timeout=4)

    async def _route_eq_output_to_sink(self, target_sink: str) -> bool:
        try:
            return await _exec(
                _set_pactl_sink_input,
                target_sink,
                None,
                True,
                True,
                timeout=4,
            )
        except TypeError:
            return False

    async def _wait_for_eq_sink(self, timeout_s: float = 2.0) -> bool:
        deadline = asyncio.get_running_loop().time() + timeout_s
        while asyncio.get_running_loop().time() < deadline:
            if not self.is_active:
                return False
            cmd, env = self._deck_cmd(["pactl", "list", "short", "sinks"])
            try:
                res = await _exec(
                    lambda: subprocess.run(cmd, env=env, capture_output=True, text=True, timeout=2),
                    timeout=3,
                )
                if res.returncode == 0 and EQ_SINK_NAME in (res.stdout or ""):
                    return True
            except Exception:
                pass
            await asyncio.sleep(0.05)
        return False

    async def _discover_node_id(self) -> int | None:
        cmd, env = self._deck_cmd(["pw-dump"])
        try:
            res = await _exec(
                lambda: subprocess.run(cmd, env=env, capture_output=True, text=True, timeout=3),
                timeout=4,
            )
            if res.returncode == 0:
                self._node_id = parse_eq_node_id(res.stdout, EQ_SINK_NAME)
                return self._node_id
        except Exception as e:
            decky.logger.warning("Failed to discover EQ PipeWire node ID: %s", e)
        return None

    async def _apply_pw_cli_params(self, bands: list[float]) -> bool:
        if not self.is_active:
            return False
        if not self._node_id:
            await self._discover_node_id()
        if not self._node_id:
            return False
        payload = build_pw_cli_params(bands)
        cmd, env = self._deck_cmd(["pw-cli", "set-param", str(self._node_id), "Props", payload])
        try:
            res = await _exec(
                lambda: subprocess.run(cmd, env=env, capture_output=True, text=True, timeout=3),
                timeout=4,
            )
            return res.returncode == 0
        except Exception as e:
            decky.logger.warning("pw-cli set-param failed: %s", e)
            return False

    async def _start_process(self, bands: list[float]) -> dict:
        conf_dir = os.path.dirname(self.conf_path)
        if conf_dir:
            os.makedirs(conf_dir, exist_ok=True)
        conf_content = generate_filter_chain_conf(bands, target_sink=self._target_hardware_sink)
        with open(self.conf_path, "w", encoding="utf-8") as f:
            f.write(conf_content)

        cmd, env = self._deck_cmd(["pipewire", "-c", self.conf_path])
        try:
            self._process = subprocess.Popen(
                cmd,
                env=env,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
            )
        except Exception as e:
            self._process = None
            await self._fallback_to_hardware_sink()
            return {"ok": False, "error": f"Failed to spawn pipewire -c: {e}"}

        ready = await self._wait_for_eq_sink(timeout_s=2.0)
        if not ready or not self.is_active:
            code = self._process.poll() if self._process else None
            await self.stop()
            await self._fallback_to_hardware_sink()
            return {"ok": False, "error": f"PipeWire filter-chain failed to register {EQ_SINK_NAME} (exit={code})"}

        await self._discover_node_id()
        return {"ok": True}

    async def _resolve_hardware_sink(self) -> str:
        if self._target_hardware_sink:
            return self._target_hardware_sink
        cmd, env = self._deck_cmd(["pactl", "get-default-sink"])
        try:
            res = await _exec(
                lambda: subprocess.run(cmd, env=env, capture_output=True, text=True, timeout=2),
                timeout=3,
            )
            sink = (res.stdout or "").strip() if res.returncode == 0 else ""
            if sink and sink != EQ_SINK_NAME and _is_valid_sink_name(sink):
                return sink
        except Exception:
            pass
        return "@DEFAULT_SINK@"

    async def _fallback_to_hardware_sink(self) -> None:
        fallback_sink = await self._resolve_hardware_sink()
        try:
            await self._route_librespot_to_sink(fallback_sink)
        except Exception:
            pass

    def _resolve_preset_bands(self, preset: str) -> list[float]:
        if preset == "custom":
            return clamp_eq_bands(self.plugin._settings.get("eq_custom_bands"))
        return list(EQ_PRESETS[preset])

    async def apply_preset(self, preset: str) -> dict:
        """Apply an EQ preset (flat performs true bypass teardown)."""
        if preset not in EQ_PRESETS:
            return {"ok": False, "error": f"Invalid eq_preset: {preset}"}

        async with self._lock:
            if preset == "flat":
                # Move librespot back to hardware sink BEFORE destroying deckify_eq_sink
                # so PipeWire does not cork/stop active playback during teardown.
                was_active = self.is_active
                if was_active:
                    await self._fallback_to_hardware_sink()
                    await asyncio.sleep(0.05)
                await self.stop()
                if not was_active:
                    await self._fallback_to_hardware_sink()
                return {"ok": True, "preset": "flat", "bypassed": True}

            bands = self._resolve_preset_bands(preset)
            if not self.is_active:
                start_res = await self._start_process(bands)
                if not start_res.get("ok"):
                    return start_res

            await self._apply_pw_cli_params(bands)
            await self._route_librespot_to_sink(EQ_SINK_NAME)
            if self._target_hardware_sink:
                await self._route_eq_output_to_sink(self._target_hardware_sink)
            return {"ok": True, "preset": preset, "bypassed": False}

    async def _throttled_pw_cli_flush(self) -> None:
        try:
            await asyncio.sleep(_PW_CLI_THROTTLE_S)
            bands = self._pending_bands
            if bands is not None and self.is_active:
                await self._apply_pw_cli_params(bands)
        except asyncio.CancelledError:
            pass

    async def _debounced_save_settings(self) -> None:
        try:
            await asyncio.sleep(_SAVE_DEBOUNCE_S)
            _save_settings(self.plugin._settings)
        except asyncio.CancelledError:
            pass

    async def set_bands(self, bands: list[float]) -> dict:
        """Update 10-band custom EQ gains with ~75ms pw-cli coalescing and 500ms save debounce."""
        clamped = clamp_eq_bands(bands)
        self.plugin._settings["eq_preset"] = "custom"
        self.plugin._settings["eq_custom_bands"] = clamped

        if not self.is_active:
            async with self._lock:
                if not self.is_active:
                    start_res = await self._start_process(clamped)
                    if not start_res.get("ok"):
                        return start_res
                    await self._route_librespot_to_sink(EQ_SINK_NAME)
                    if self._target_hardware_sink:
                        await self._route_eq_output_to_sink(self._target_hardware_sink)

        self._pending_bands = clamped
        if self._throttle_task is None or self._throttle_task.done():
            self._throttle_task = asyncio.create_task(self._throttled_pw_cli_flush())

        if self._save_task is not None and not self._save_task.done():
            self._save_task.cancel()
        self._save_task = asyncio.create_task(self._debounced_save_settings())

        return {"ok": True, "preset": "custom", "bands": clamped}

    async def on_sink_changed(self, sink_name: str) -> dict:
        """Handle hardware sink switch while preserving librespot -> deckify_eq_sink isolation."""
        if not _is_valid_sink_name(sink_name):
            return {"ok": False, "error": "Invalid sink_name"}
        target = sink_name.strip()
        self._target_hardware_sink = target
        if self.is_active:
            await self._route_librespot_to_sink(EQ_SINK_NAME)
            ok = await self._route_eq_output_to_sink(target)
            return {"ok": ok, "isolated": True}
        ok = await self._route_librespot_to_sink(target)
        return {"ok": ok, "isolated": False}

    async def route_librespot_to_eq(self) -> bool:
        """Ensure EQ is running for non-flat presets and route librespot into deckify_eq_sink."""
        preset = self.plugin._settings.get("eq_preset", "flat")
        if preset == "flat":
            return False
        if not self.is_active:
            res = await self.apply_preset(preset)
            return bool(res.get("ok"))
        return await self._route_librespot_to_sink(EQ_SINK_NAME)

    async def on_librespot_started(self) -> bool:
        return await self.route_librespot_to_eq()

    async def stop(self) -> None:
        """Terminate the isolated pipewire -c filter-chain process."""
        if self._throttle_task is not None and not self._throttle_task.done():
            self._throttle_task.cancel()
        self._throttle_task = None

        proc = self._process
        self._process = None
        self._node_id = None
        if proc is not None and proc.poll() is None:
            try:
                proc.terminate()
                await _exec(proc.wait, timeout=1.0)
            except Exception:
                try:
                    proc.kill()
                except Exception:
                    pass

    async def unload(self) -> None:
        """Cleanly cancel pending tasks and stop the filter-chain process on plugin unload."""
        if self._save_task is not None and not self._save_task.done():
            self._save_task.cancel()
            try:
                _save_settings(self.plugin._settings)
            except Exception:
                pass
        self._save_task = None
        await self.stop()
