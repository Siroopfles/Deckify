"""Game-specific soundtrack orchestration (Phase 07).

SoundtrackManager reacts to Steam app lifecycle events: it debounces game
launch/exit, snapshots pre-game playback, starts the configured soundtrack,
and restores the previous listening state when the game exits.
"""
import asyncio
import inspect
import random

from py_modules import vdf_parser
from py_modules.common import _exec, _save_settings, decky
from py_modules.equalizer import EQ_PRESETS, clamp_eq_bands
from py_modules.spotify import _spotify_api_request

VALID_MODES = ("shuffle", "random", "rotation")
VALID_RESUME_MODES = ("remember_position", "fresh_start")
VALID_EXIT_POLICIES = ("restore_snapshot", "pause", "keep_playing")
MAX_APP_ID = 0xFFFFFFFF
MAX_PLAYLISTS = 50
MAX_STR = 200

_PROFILE_DEFAULTS = {
    "app_id": 0,
    "app_name": "",
    "playlists": [],
    "mode": "shuffle",
    "rotation_index": 0,
    "resume_mode": "remember_position",
    "always_auto_start": False,
    "exit_policy": "restore_snapshot",
    "volume_override": None,
    "ducking_override": None,
    "eq_preset": None,
    "eq_custom_bands": None,
    "ducking_level_override": None,
    "last_track_uri": None,
    "last_context_uri": None,
    "last_position_ms": None,
}


def _clean_str(value, default="") -> str:
    if not isinstance(value, str):
        return default
    return value[:MAX_STR]


def _clean_uri(value) -> str | None:
    if isinstance(value, str) and value.startswith("spotify:") and len(value) <= MAX_STR:
        return value
    return None


async def _maybe_await(val):
    if inspect.isawaitable(val):
        return await val
    return val


def validate_app_id(app_id) -> int:
    """Cast and validate a positive unsigned 32-bit app id (T-07-02)."""
    if isinstance(app_id, bool):
        raise ValueError("Invalid app_id")
    try:
        value = int(app_id)
    except (TypeError, ValueError):
        raise ValueError("Invalid app_id")
    if value <= 0 or value > MAX_APP_ID:
        raise ValueError("Invalid app_id")
    return value


class SoundtrackManager:
    def __init__(self, plugin):
        self.plugin = plugin
        self._active_game_app_id: int | None = None
        self._launch_task: asyncio.Task | None = None
        self._exit_task: asyncio.Task | None = None
        self._pre_game_snapshot: dict | None = None
        self._user_paused_in_game = False
        self._playback_altered = False
        self._internal_action = False

    # ── Settings helpers ──────────────────────────────────────

    @property
    def _settings(self) -> dict:
        return self.plugin._settings

    def _persist(self) -> None:
        saver = getattr(self.plugin, "_save_settings", None)
        if callable(saver):
            saver(self._settings)
        else:
            _save_settings(self._settings)

    def _setting_float(self, key: str, default: float) -> float:
        try:
            return max(0.0, float(self._settings.get(key, default)))
        except (TypeError, ValueError):
            return default

    # ── Profile management ────────────────────────────────────

    def get_profiles(self) -> dict:
        profiles = self._settings.get("game_audio_profiles")
        if not isinstance(profiles, dict):
            profiles = {}
            self._settings["game_audio_profiles"] = profiles
        return profiles

    def get_profile(self, app_id: int) -> dict | None:
        profile = self.get_profiles().get(str(app_id))
        return profile if isinstance(profile, dict) else None

    def _sanitize_profile(self, app_id: int, data: dict) -> dict:
        out: dict = {}
        if "app_name" in data:
            out["app_name"] = _clean_str(data["app_name"]).strip()
        if "playlists" in data:
            playlists = []
            raw = data["playlists"] if isinstance(data["playlists"], list) else []
            for item in raw[:MAX_PLAYLISTS]:
                if not isinstance(item, dict):
                    continue
                uri = _clean_uri(item.get("uri"))
                if not uri:
                    continue
                playlists.append({
                    "uri": uri,
                    "name": _clean_str(item.get("name")),
                    "image": item["image"] if isinstance(item.get("image"), str) and len(item["image"]) <= MAX_STR and not item["image"].startswith("http") else "",
                })
            out["playlists"] = playlists
        if data.get("mode") in VALID_MODES:
            out["mode"] = data["mode"]
        if "rotation_index" in data:
            try:
                out["rotation_index"] = max(0, int(data["rotation_index"]))
            except (TypeError, ValueError):
                pass
        if data.get("resume_mode") in VALID_RESUME_MODES:
            out["resume_mode"] = data["resume_mode"]
        if "always_auto_start" in data:
            out["always_auto_start"] = bool(data["always_auto_start"])
        if data.get("exit_policy") in VALID_EXIT_POLICIES:
            out["exit_policy"] = data["exit_policy"]
        if "volume_override" in data:
            vo = data["volume_override"]
            if vo is None or isinstance(vo, bool):
                out["volume_override"] = None
            else:
                try:
                    out["volume_override"] = max(0, min(100, int(vo)))
                except (TypeError, ValueError, OverflowError):
                    out["volume_override"] = None
        if "ducking_override" in data:
            do = data["ducking_override"]
            out["ducking_override"] = None if do is None else bool(do)
        if "eq_preset" in data:
            ep = data["eq_preset"]
            if ep is None:
                out["eq_preset"] = None
            elif isinstance(ep, str):
                norm_ep = ep.strip().lower()
                out["eq_preset"] = None if norm_ep == "global" or norm_ep not in EQ_PRESETS else norm_ep
            else:
                out["eq_preset"] = None
        if "eq_custom_bands" in data:
            eb = data["eq_custom_bands"]
            out["eq_custom_bands"] = clamp_eq_bands(eb) if isinstance(eb, (list, tuple)) else None
        if "ducking_level_override" in data:
            dl = data["ducking_level_override"]
            if dl is None or isinstance(dl, bool):
                out["ducking_level_override"] = None
            else:
                try:
                    out["ducking_level_override"] = max(0, min(95, int(dl)))
                except (TypeError, ValueError, OverflowError):
                    out["ducking_level_override"] = None
        if "last_track_uri" in data:
            out["last_track_uri"] = _clean_uri(data["last_track_uri"])
        if "last_context_uri" in data:
            out["last_context_uri"] = _clean_uri(data["last_context_uri"])
        if "last_position_ms" in data:
            lp = data["last_position_ms"]
            try:
                out["last_position_ms"] = None if lp is None else max(0, int(lp))
            except (TypeError, ValueError):
                out["last_position_ms"] = None
        return out

    def _resolve_app_name(self, app_id: int, profile: dict | None = None) -> str:
        """Resolve a game's display name from profile, persisted store, or VDF discovery."""
        if isinstance(profile, dict):
            name = _clean_str(profile.get("app_name")).strip()
            if name:
                return name
        existing = self.get_profile(app_id)
        if isinstance(existing, dict):
            name = _clean_str(existing.get("app_name")).strip()
            if name:
                return name
        try:
            games = vdf_parser.get_installed_games()
            if isinstance(games, list):
                for game in games:
                    if (
                        isinstance(game, dict)
                        and not isinstance(game.get("app_id"), bool)
                        and game.get("app_id") == app_id
                    ):
                        name = _clean_str(game.get("name")).strip()
                        if name:
                            return name
        except Exception:
            pass
        return ""

    def save_profile(self, app_id: int, profile_data: dict) -> dict:
        try:
            app_id = validate_app_id(app_id)
        except ValueError as e:
            return {"ok": False, "error": str(e)}
        if not isinstance(profile_data, dict):
            return {"ok": False, "error": "profile must be a dict"}
        existing = self.get_profile(app_id) or {}
        merged = {**_PROFILE_DEFAULTS, **existing, **self._sanitize_profile(app_id, profile_data)}
        merged["app_id"] = app_id
        if not _clean_str(merged.get("app_name")).strip():
            merged["app_name"] = self._resolve_app_name(app_id, merged)
        else:
            merged["app_name"] = _clean_str(merged.get("app_name")).strip()
        self.get_profiles()[str(app_id)] = merged
        self._persist()
        return {"ok": True, "profile": dict(merged)}

    def delete_profile(self, app_id: int) -> dict:
        try:
            app_id = validate_app_id(app_id)
        except ValueError as e:
            return {"ok": False, "error": str(e)}
        removed = self.get_profiles().pop(str(app_id), None) is not None
        if removed:
            self._persist()
        return {"ok": True, "removed": removed}

    # ── Spotify helpers ───────────────────────────────────────

    async def get_player_state(self) -> dict | None:
        """Return a minimal playback snapshot (no tokens, T-07-03) or None."""
        try:
            token = await self.plugin._ensure_token()
            if not token:
                return None
            data = await _exec(_spotify_api_request, "me/player", token)
        except Exception as e:
            decky.logger.warning("Soundtrack: player state query failed: %s", e)
            return None
        if not data:
            return None
        item = data.get("item") or {}
        context = data.get("context") or {}
        device = data.get("device") or {}
        return {
            "is_playing": bool(data.get("is_playing")),
            "context_uri": context.get("uri"),
            "track_uri": item.get("uri"),
            "position_ms": int(data.get("progress_ms") or 0),
            "volume": device.get("volume_percent"),
        }

    async def _play(self, **kwargs) -> dict:
        """Start playback; wake the local Connect device on failure (D-12)."""
        res = await self.plugin.play_tracks(**kwargs)
        if isinstance(res, dict) and not res.get("ok"):
            try:
                token = await self.plugin._ensure_token()
                if token:
                    wake = await self.plugin._auto_transfer_and_play(token)
                    if isinstance(wake, dict) and wake.get("ok"):
                        res = await self.plugin.play_tracks(**kwargs)
            except Exception as e:
                decky.logger.warning("Soundtrack: Connect wake-up failed: %s", e)
        return res

    async def _pause(self) -> None:
        self._internal_action = True
        try:
            await self.plugin.control_playback("pause")
        except Exception as e:
            decky.logger.warning("Soundtrack: pause failed: %s", e)
        finally:
            self._internal_action = False

    # ── Lifecycle ─────────────────────────────────────────────

    @staticmethod
    def _pending(task: asyncio.Task | None) -> bool:
        return task is not None and not task.done()

    def _cancel(self, task: asyncio.Task | None) -> None:
        if self._pending(task):
            task.cancel()

    def cancel_all(self) -> None:
        self._cancel(self._launch_task)
        self._cancel(self._exit_task)
        self._launch_task = None
        self._exit_task = None

    async def handle_app_lifecycle(self, app_id: int, running: bool) -> None:
        if running:
            self._cancel(self._exit_task)
            self._cancel(self._launch_task)
            self._exit_task = None
            self._active_game_app_id = app_id
            self._user_paused_in_game = False
            if self._pre_game_snapshot is None:
                state = await self.get_player_state()
                if state is not None:
                    self._pre_game_snapshot = state
                    self._playback_altered = False
            self._launch_task = asyncio.create_task(self._delayed_launch(app_id))
        else:
            self._cancel(self._launch_task)
            self._cancel(self._exit_task)
            self._launch_task = None
            self._exit_task = asyncio.create_task(self._delayed_exit(app_id))

    async def _delayed_launch(self, app_id: int) -> None:
        await asyncio.sleep(self._setting_float("soundtrack_launch_debounce", 3.5))
        await self._run_launch(app_id)

    async def _delayed_exit(self, app_id: int) -> None:
        await asyncio.sleep(self._setting_float("soundtrack_exit_debounce", 3.0))
        await self._run_exit(app_id)

    def resolve_playlist(self, profile: dict) -> str | None:
        """Pick the playlist URI to play according to the profile mode (D-02)."""
        playlists = [p for p in profile.get("playlists", []) if isinstance(p, dict) and p.get("uri")]
        if not playlists:
            return None
        mode = profile.get("mode", "shuffle")
        if mode == "random":
            return random.choice(playlists)["uri"]
        if mode == "rotation":
            idx = int(profile.get("rotation_index", 0) or 0) % len(playlists)
            profile["rotation_index"] = (idx + 1) % len(playlists)
            return playlists[idx]["uri"]
        # shuffle: Spotify cannot merge contexts; play first pool entry with shuffle on
        return playlists[0]["uri"] if len(playlists) == 1 else random.choice(playlists)["uri"]

    async def apply_active_audio_profile(self, app_id: int, profile: dict | None) -> None:
        """Apply per-game ephemeral EQ and local PipeWire VolumeFader overrides in atomic order (D-09, D-10, D-14)."""
        eq_preset = profile.get("eq_preset") if isinstance(profile, dict) else None
        eq_bands = profile.get("eq_custom_bands") if (isinstance(profile, dict) and eq_preset == "custom") else None
        app_name = self._resolve_app_name(app_id, profile)
        if isinstance(profile, dict) and app_name and not _clean_str(profile.get("app_name")).strip():
            profile["app_name"] = app_name
            self._persist()
        vol_override = profile.get("volume_override") if isinstance(profile, dict) else None
        duck_override = profile.get("ducking_override") if isinstance(profile, dict) else None
        duck_level = profile.get("ducking_level_override") if isinstance(profile, dict) else None

        # Step 1: Apply ephemeral EQ (or clear prior game EQ if using global) first (D-10)
        eq_mgr = getattr(self.plugin, "_equalizer_manager", None)
        if eq_mgr is not None:
            if eq_preset and hasattr(eq_mgr, "apply_ephemeral_preset"):
                await _maybe_await(
                    eq_mgr.apply_ephemeral_preset(
                        eq_preset,
                        custom_bands=eq_bands,
                        app_id=app_id,
                        app_name=app_name,
                    )
                )
            elif hasattr(eq_mgr, "clear_ephemeral_override"):
                await _maybe_await(eq_mgr.clear_ephemeral_override())

        # Step 2: Persist crash-recovery snapshot when any game override or game ducking is active (D-14)
        should_duck = (duck_override is True) or (
            duck_override is None and bool(self._settings.get("auto_ducking", True))
        )
        has_ephemeral = (
            eq_preset is not None
            or vol_override is not None
            or duck_override is not None
            or duck_level is not None
            or should_duck
        )
        if has_ephemeral:
            self._settings["active_game_override_snapshot"] = {
                "app_id": app_id,
                "app_name": app_name,
                "eq_preset": eq_preset,
                "volume_override": vol_override,
                "ducking_override": duck_override,
                "ducking_level_override": duck_level,
            }
            self._persist()
        elif self._settings.get("active_game_override_snapshot") is not None:
            self._settings["active_game_override_snapshot"] = None
            self._persist()

        # Step 3: Invalidate cached sink-input ID after EQ sink routing and fade VolumeFader locally (D-05, D-10)
        fader = getattr(self.plugin, "_volume_fader", None)
        if fader is not None:
            fader._cached_sink_input_id = None
            if hasattr(fader, "apply_game_override"):
                await _maybe_await(
                    fader.apply_game_override(
                        active_duck=should_duck,
                        volume_override=vol_override,
                        ducking_override=duck_override,
                        ducking_level_override=duck_level,
                    )
                )

        # Step 4: Notify frontend listeners
        try:
            await decky.emit("game_audio_override_changed", {
                "active": True,
                "app_id": app_id,
                "app_name": app_name,
                "eq_preset": eq_preset,
            })
        except Exception:
            pass

    async def refresh_active_overrides(self, app_id: int) -> None:
        """Hot-apply updated EQ/volume/ducking overrides when editing the running game (D-04, D-08)."""
        if (
            self._active_game_app_id == app_id
            and not self._pending(self._launch_task)
            and not self._pending(self._exit_task)
        ):
            profile = self.get_profile(app_id)
            await self.apply_active_audio_profile(app_id, profile)

    async def _run_launch(self, app_id: int) -> None:
        profile = self.get_profile(app_id)
        persisted = profile is not None
        await self.apply_active_audio_profile(app_id, profile)

        if profile is None:
            default_uri = self._settings.get("soundtrack_default_playlist") or ""
            if default_uri and _clean_uri(default_uri):
                profile = {
                    **_PROFILE_DEFAULTS,
                    "app_id": app_id,
                    "playlists": [{"uri": default_uri, "name": "", "image": ""}],
                    "resume_mode": self._settings.get("soundtrack_default_mode", "remember_position"),
                    "always_auto_start": False,
                }
            else:
                if self._settings.get("soundtrack_unbound_policy") == "pause":
                    snap = self._pre_game_snapshot
                    if snap is None or snap.get("is_playing"):
                        await self._pause()
                        self._playback_altered = True
                return

        if not profile.get("playlists"):
            if not persisted and self._settings.get("soundtrack_unbound_policy") == "pause":
                snap = self._pre_game_snapshot
                if snap is None or snap.get("is_playing"):
                    await self._pause()
                    self._playback_altered = True
            return

        snap = self._pre_game_snapshot
        was_playing = bool(snap and snap.get("is_playing"))
        if was_playing and not profile.get("always_auto_start"):
            try:
                await decky.emit("soundtrack_prompt_switch", {
                    "app_id": app_id,
                    "app_name": profile.get("app_name", ""),
                })
            except Exception:
                pass
            return

        uri = self.resolve_playlist(profile)
        if persisted:
            self._persist()  # rotation_index
        if not uri:
            return

        kwargs: dict = {"context_uri": uri}
        if (
            profile.get("resume_mode") == "remember_position"
            and profile.get("last_track_uri")
            and profile.get("last_context_uri") in (None, uri)
        ):
            kwargs["offset_uri"] = profile["last_track_uri"]
            if profile.get("last_position_ms"):
                kwargs["position_ms"] = int(profile["last_position_ms"])

        res = await self._play(**kwargs)
        if isinstance(res, dict) and res.get("ok"):
            self._playback_altered = True
            if profile.get("mode") == "shuffle":
                try:
                    await self.plugin.set_shuffle(True)
                except Exception:
                    pass

    async def _run_exit(self, app_id: int) -> None:
        snap = self._pre_game_snapshot
        profile = self.get_profile(app_id)
        state = await self.get_player_state() if self._playback_altered else None

        if profile is not None and state and state.get("track_uri") and self._playback_altered:
            profile["last_track_uri"] = state["track_uri"]
            profile["last_position_ms"] = int(state.get("position_ms") or 0)
            if state.get("context_uri"):
                profile["last_context_uri"] = state["context_uri"]
            self._persist()

        # Step 1 (D-13, D-16): Always restore global EQ first
        eq_mgr = getattr(self.plugin, "_equalizer_manager", None)
        if eq_mgr is not None and hasattr(eq_mgr, "clear_ephemeral_override"):
            await _maybe_await(eq_mgr.clear_ephemeral_override())

        # Step 2 (D-14): Clear persisted crash-recovery snapshot
        if self._settings.get("active_game_override_snapshot") is not None:
            self._settings["active_game_override_snapshot"] = None
            self._persist()

        # Step 3 & 4 (D-15, D-16): Invalidate sink-input cache and respect Sleep Timer _sleep_locked
        fader = getattr(self.plugin, "_volume_fader", None)
        if fader is not None:
            fader._cached_sink_input_id = None
        sleep_locked = getattr(fader, "_sleep_locked", False) is True if fader is not None else False

        if sleep_locked:
            if getattr(fader, "_game_override", None) is not None:
                fader._game_override = None
            duck_reasons = getattr(fader, "_duck_reasons", None)
            if isinstance(duck_reasons, set):
                duck_reasons.discard("game")
        else:
            if fader is not None and hasattr(fader, "clear_game_override"):
                await _maybe_await(fader.clear_game_override())

            if self._playback_altered and not self._user_paused_in_game:
                policy = (profile or {}).get("exit_policy", "restore_snapshot")
                if policy == "pause":
                    await self._pause()
                elif policy == "restore_snapshot":
                    if snap and snap.get("is_playing"):
                        kwargs: dict = {}
                        if snap.get("context_uri"):
                            kwargs["context_uri"] = snap["context_uri"]
                            if snap.get("track_uri"):
                                kwargs["offset_uri"] = snap["track_uri"]
                        elif snap.get("track_uri"):
                            kwargs["uris"] = [snap["track_uri"]]
                        if kwargs:
                            if snap.get("position_ms"):
                                kwargs["position_ms"] = int(snap["position_ms"])
                            await self._play(**kwargs)
                    else:
                        await self._pause()

        # Step 5: Notify frontend listeners
        try:
            await decky.emit("game_audio_override_changed", {
                "active": False,
                "app_id": None,
            })
        except Exception:
            pass

        # Step 6: Reset lifecycle state
        self._active_game_app_id = None
        self._pre_game_snapshot = None
        self._user_paused_in_game = False
        self._playback_altered = False

    # ── Misc public API ───────────────────────────────────────

    def ducking_override(self, app_id: int) -> bool | None:
        profile = self.get_profile(app_id)
        return None if not profile else profile.get("ducking_override")

    def record_manual_pause(self) -> None:
        if self._active_game_app_id is not None and not self._internal_action:
            self._user_paused_in_game = True

    async def _resolve_context_metadata(self, context_uri: str) -> tuple[str, str]:
        """Best-effort lookup of playlist/album name and cover image for a Spotify context URI."""
        parts = context_uri.split(":")
        if len(parts) == 3 and parts[0] == "spotify" and parts[1] in ("playlist", "album"):
            kind, item_id = parts[1], parts[2]
            endpoint = f"playlists/{item_id}?fields=name,images" if kind == "playlist" else f"albums/{item_id}"
            try:
                token = await self.plugin._ensure_token()
                if token:
                    data = await _exec(_spotify_api_request, endpoint, token)
                    if isinstance(data, dict):
                        name = str(data.get("name") or "")
                        images = data.get("images") or []
                        image = str(images[0].get("url") or "") if images and isinstance(images[0], dict) else ""
                        return name, image
            except Exception as e:
                decky.logger.warning("Soundtrack: context metadata lookup failed for %s: %s", context_uri, e)
        return "", ""

    async def bind_current_music_to_game(self, app_id: int, app_name: str = "") -> dict:
        try:
            app_id = validate_app_id(app_id)
        except ValueError as e:
            return {"ok": False, "error": str(e)}
        state = await self.get_player_state()
        if not state or not state.get("context_uri"):
            return {"ok": False, "error": "No playlist or album context is currently playing"}
        context_uri = state["context_uri"]
        existing = self.get_profile(app_id) or {}
        existing_playlists = list(existing.get("playlists") or [])
        if not any(p.get("uri") == context_uri for p in existing_playlists):
            name, image = await self._resolve_context_metadata(context_uri)
            existing_playlists.append({"uri": context_uri, "name": name or context_uri, "image": image})
        clean_arg = _clean_str(app_name).strip()
        resolved_name = clean_arg or self._resolve_app_name(app_id, existing)
        return self.save_profile(app_id, {
            "app_name": resolved_name,
            "playlists": existing_playlists,
            "mode": existing.get("mode") or "shuffle",
        })
