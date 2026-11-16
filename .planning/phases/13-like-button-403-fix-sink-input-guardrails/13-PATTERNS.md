# Phase 13: Like Button 403 Fix & Sink-Input Guardrails - Pattern Map

**Mapped:** 2026-11-16
**Files analyzed:** 8
**Analogs found:** 8 / 8

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `py_modules/rpc_playback.py` | service / RPC handler | request-response | `py_modules/rpc_playback.py` (`check_tracks_liked`, `toggle_like_track`) & `py_modules/rpc_library.py` (`get_artist_top_tracks` 403 fallback) | exact |
| `py_modules/rpc_library.py` | service / RPC handler | request-response | `py_modules/rpc_library.py` (`get_liked_tracks`, `set_native_playlist_mix`) | exact |
| `py_modules/engine.py` | service / process & CDP | request-response / system-I/O | `py_modules/engine.py` (`_fetch_spotify_cdp_folder_tree`) & `py_modules/volume.py` (`VolumeFader.resolve_sink_input_id`) | exact |
| `py_modules/volume.py` | service / audio fader | system-I/O | `py_modules/volume.py` (`VolumeFader.resolve_sink_input_id`) | exact |
| `tests/test_features.py` | test | unit (async) | `tests/test_features.py` (`DeckifyFeatureTests.test_toggle_like_updates_current_track_metadata`) | exact |
| `tests/test_final_coverage.py` | test | unit (async) | `tests/test_final_coverage.py` (`test_toggle_like_track_403_forbidden`) | exact |
| `tests/test_volume.py` | test | unit (async) | `tests/test_volume.py` (`TestVolumeFader.test_resolve_sink_input_id_*`) | exact |
| `tests/test_phase13.py` | test (new) | unit (async & sync) | `tests/test_volume.py` + `tests/test_final_coverage.py` | exact |

## Pattern Assignments

### `py_modules/rpc_playback.py` (service / RPC handler, request-response)

**Analog:** `py_modules/rpc_playback.py` (lines 1-13, 156-242)

**Imports pattern** (`py_modules/rpc_playback.py` lines 1-13):
```python
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
```
Add `from py_modules.engine import _cdp_toggle_like_track` (alongside existing `py_modules.*` imports) for the `spotify_client` 403 fallback.

**Batch-check & TTL cache pattern** (`py_modules/rpc_playback.py` lines 156-188):
- Normalize `clean_ids` (strip `spotify:track:` prefix if present so `_liked_cache` keys remain bare track IDs).
- Preserve 300s TTL check: `(now - plugin._liked_cache[tid][0]) < 300`.
- Change chunk size from `50` to `40` (per D-03) and endpoint from `"me/tracks/contains"` (`{"ids": ...}`) to `"me/library/contains"` (`{"uris": ",".join(f"spotify:track:{tid}" for tid in chunk)}`).

**Mutation & 403 fallback pattern** (`py_modules/rpc_playback.py` lines 200-242):
- Primary call:
```python
await _exec(
    _spotify_api_request, "me/library", token, method,
    {"uris": f"spotify:track:{target_id}"},
)
```
- On `urllib.error.HTTPError` with `getattr(e, "code", None) == 403`:
  - Check if `spotify_client` is active: `plugin._settings.get("audio_backend") == "spotify_client"` and `bool(getattr(plugin, "_spotify_client_process", None) and plugin._spotify_client_process.poll() is None)`.
  - If active, call `await _exec(_cdp_toggle_like_track, f"spotify:track:{target_id}", target_liked)`.
  - On CDP success (`res.get("ok")`), update `plugin._liked_cache[target_id]`, `plugin._is_liked`, and `await decky.emit("track_metadata", plugin._track_meta)` identically to lines 224-231.
  - Otherwise return the exact 403 error contract (lines 235-238):
```python
return {
    "ok": False,
    "error": "Spotify rejected library access (403 Forbidden). Re-authenticate in Settings or check Spotify Developer Mode allowlist.",
}
```

---

### `py_modules/rpc_library.py` (service / RPC handler, request-response)

**Analog:** `py_modules/rpc_library.py` (lines 1-28, 320-365, 442-487)

**Imports pattern** (`py_modules/rpc_library.py` lines 23-26):
```python
from py_modules.engine import (
    _cdp_evaluate,
    _fetch_spotify_cdp_folder_tree,
)
```
Extend this import block with `_cdp_get_liked_tracks` (from `py_modules.engine`).

**Core pattern & 403 fallback** (`py_modules/rpc_library.py` lines 442-487):
- Keep `GET me/tracks` (`{"limit": 50, "offset": cur_offset}`) as primary in `get_liked_tracks`.
- Catch `urllib.error.HTTPError as e` before `except Exception as e:` (lines 484-486):
  - If `getattr(e, "code", None) == 403` and `spotify_client` is active (`plugin._settings.get("audio_backend") == "spotify_client"` and running `_spotify_client_process`), call `await _exec(_cdp_get_liked_tracks, offset, fetch_all)` and return `{"ok": True, "tracks": ..., "total": ..., "offset": offset}` if successful.
  - Otherwise return `{"ok": False, "error": _parse_spotify_error(e)}` (matching `py_modules/rpc_playback.py` line 239).

---

### `py_modules/engine.py` (service / process & CDP, request-response & system-I/O)

**Analog 1 (CDP React Fiber traversal):** `py_modules/engine.py` (`_fetch_spotify_cdp_folder_tree`, lines 356-394) & `py_modules/rpc_library.py` (`set_native_playlist_mix`, lines 320-365)

**Imports pattern** (`py_modules/engine.py` line 10):
```python
from py_modules.common import SPOTIFY_CDP_PORT, _build_deck_command, decky
```
(Currently line 10 only imports `SPOTIFY_CDP_PORT`; add `_build_deck_command` and `decky` so `_set_pactl_sink_input` can wrap `pactl` with `DECK_USER` env and log at `decky.logger.debug`.)

**CDP React Fiber `LibraryAPI` pattern** (`py_modules/engine.py` lines 358-394):
```javascript
const el = document.querySelector('#main');
if (!el) return null;
const fk = Object.keys(el).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactContainer$'));
if (!fk) return null;
const queue = [el[fk]];
const visited = new Set();
let registry = null;
while (queue.length > 0 && !registry) {
  const n = queue.shift();
  if (!n || visited.has(n)) continue;
  visited.add(n);
  const val = n.memoizedProps?.value;
  if (val && val._map instanceof Map) { registry = val; break; }
  if (val && typeof val.getRegistry === 'function') { registry = val.getRegistry(); break; }
  if (n.memoizedProps?.platform && typeof n.memoizedProps.platform.getRegistry === 'function') {
    registry = n.memoizedProps.platform.getRegistry();
    break;
  }
  if (n.child) queue.push(n.child);
  if (n.sibling) queue.push(n.sibling);
}
```
- Also note `visited.size < 5000` guard from `py_modules/rpc_library.py` line 329.
- Lookup in `registry._map.entries()`: `(k?.description || String(k)) === 'LibraryAPI'`, extracting `v?.instance || v`.
- Serialize `uri` with `json.dumps(uri)` before interpolating into JS template (ASVS V5).
- Evaluate via `_cdp_evaluate(expr, port=port, timeout=5.0)` (lines 296-315).

**Analog 2 (Sink-input block parsing & filtering):** `py_modules/volume.py` (`VolumeFader.resolve_sink_input_id`, lines 180-235) and `py_modules/engine.py` (`_set_pactl_sink_input`, lines 130-155)
- Extract pure helper `resolve_spotify_sink_input_ids(stdout: str, pids: set[str] | None = None) -> list[str]` in `py_modules/engine.py`:
  - Parse `"Sink Input #"` blocks (lines 198-212 of `py_modules/volume.py`).
  - Deny-list filter first: exclude `"steamwebhelper"` and lines with `("application.name" in ln or "application.process.binary" in ln) and "chromium" in ln`.
  - Pass 1: exact PID match (`f'"{p}"' in block`).
  - Pass 2: allowlist tokens `("librespot", "spotify", "com.spotify.client", "deckify_eq_out")` on lines containing `("application.name", "media.name", "node.name", "application.process.binary")`.
- Update `_set_pactl_sink_input(target_sink: str, pids: set[str] | None = None) -> bool`:
  - Validate `target_sink` is non-empty and does not start with `"-"` (argument injection guard).
  - Run `_build_deck_command(["pactl", "list", "sink-inputs"])` with `env=env, capture_output=True, text=True, timeout=3`.
  - Resolve `ids = resolve_spotify_sink_input_ids(proc.stdout, pids)`.
  - If `not ids`: `decky.logger.debug("No matching Spotify/Deckify sink-inputs found; skipping move to %s", target_sink)` and `return False` (D-06).
  - For each `input_id` in `ids` (verifying `input_id.isdigit()`): run `_build_deck_command(["pactl", "move-sink-input", input_id, target_sink])` with `env=env, capture_output=True, timeout=3`.

---

### `py_modules/volume.py` (service / audio fader, system-I/O)

**Analog:** `py_modules/volume.py` (lines 14-18, 180-235)

**Imports pattern** (`py_modules/volume.py` lines 14-18):
```python
from py_modules.engine import (
    _parse_pactl_sink_inputs,
    _get_pactl_sinks,
    _set_pactl_sink_input,
    resolve_spotify_sink_input_ids,
)
```

**Core pattern** (`py_modules/volume.py` lines 180-235):
- Keep `_build_deck_command(["pactl", "list", "sink-inputs"])` and `_exec(lambda: subprocess.run(cmd, capture_output=True, text=True, env=env), timeout=3)` in `VolumeFader.resolve_sink_input_id()` so existing `subprocess.run` mocks in `tests/test_volume.py` remain intact.
- Collect `pids` from `self.plugin._process.pid` and `self.plugin._spotify_client_process.pid` (lines 191-195).
- Delegate parsing & filtering to `ids = resolve_spotify_sink_input_ids(res.stdout, pids)` and `return ids[0] if ids else None`.

---

### `tests/test_features.py` (test, unit async)

**Analog:** `tests/test_features.py` (lines 1-20, 47-63)

**Test setup & assertion pattern** (`tests/test_features.py` lines 47-63):
```python
self.execute.assert_awaited_once_with(
    main._spotify_api_request,
    "me/library",
    "valid-token",
    "PUT",
    {"uris": "spotify:track:track-123"},
)
```
Update lines 59 and 62 from `"me/tracks"` / `{"ids": "track-123"}` to `"me/library"` / `{"uris": "spotify:track:track-123"}`.

---

### `tests/test_final_coverage.py` (test, unit async)

**Analog:** `tests/test_final_coverage.py` (lines 293-323)

**403 & error handling test pattern** (`tests/test_final_coverage.py` lines 310-322):
- Preserve existing `test_toggle_like_track_403_forbidden` (which runs on default `librespot` backend and asserts `"403 Forbidden"` and `"Re-authenticate in Settings"`).
- Extend with a case where `audio_backend == "spotify_client"` and `_spotify_client_process.poll()` is `None`, verifying CDP fallback is attempted and returns `{ ok: False, error }` if CDP also fails.

---

### `tests/test_volume.py` (test, unit async)

**Analog:** `tests/test_volume.py` (lines 1-21, 51-104)

**Mocking & `decky` stub pattern** (`tests/test_volume.py` lines 11-20, 51-80):
```python
with patch.dict("sys.modules", {"decky": SimpleNamespace(
    DECKY_PLUGIN_SETTINGS_DIR=tempfile.gettempdir(),
    DECKY_PLUGIN_DIR=tempfile.gettempdir(),
    DECKY_PLUGIN_RUNTIME_DIR=tempfile.gettempdir(),
    logger=MagicMock(),
    emit=AsyncMock(),
)}):
    from py_modules import common, volume
    from py_modules.volume import VolumeFader, VoiceActivityDetector, cosine_ease
```
Extend `TestVolumeFader` with `@patch("subprocess.run")` tests verifying `steamwebhelper`, `Chromium`, and game audio (`wine64-preloader` / `Cyberpunk2077`) are excluded while `com.spotify.client` and `deckify_eq_out` are matched.

---

### `tests/test_phase13.py` (test [new], unit async & sync)

**Analog:** `tests/test_volume.py` (lines 11-20) + `tests/test_final_coverage.py` (lines 293-323)

**Structure to copy:**
- Use `from test_token_refresh import main` (like `tests/test_features.py` line 6) or `decky` `patch.dict("sys.modules", ...)` (like `tests/test_volume.py` lines 11-19).
- Subclass `unittest.IsolatedAsyncioTestCase` for async RPC tests (`check_tracks_liked` 40-URI chunking, `toggle_like_track` CDP fallback when `spotify_client` is active, `get_liked_tracks` 403 CDP fallback) and `unittest.TestCase` for pure `resolve_spotify_sink_input_ids` / `_set_pactl_sink_input` unit tests.

## Shared Patterns

### Spotify Web API Error Handling & Structured RPC Returns
**Source:** `py_modules/rpc_playback.py` (lines 232-242)
**Apply to:** `py_modules/rpc_playback.py`, `py_modules/rpc_library.py`
```python
except urllib.error.HTTPError as e:
    if getattr(e, "code", None) == 403:
        decky.logger.warning("...", target_id, e)
        return {
            "ok": False,
            "error": "Spotify rejected library access (403 Forbidden). Re-authenticate in Settings or check Spotify Developer Mode allowlist.",
        }
    return {"ok": False, "error": _parse_spotify_error(e)}
except Exception as e:
    decky.logger.error("...", e)
    return {"ok": False, "error": str(e)}
```

### PipeWire UI Stream Isolation & `DECK_USER` Subprocess Execution
**Source:** `py_modules/common.py` (`_build_deck_command`), `py_modules/volume.py` (lines 183-188, 214-220)
**Apply to:** `py_modules/engine.py`, `py_modules/volume.py`
- Always execute `pactl` via `cmd, env = _build_deck_command([...])` and pass `env=env` (never bare `subprocess.run(["pactl", ...])`).
- Always filter out `steamwebhelper` and `Chromium` before any PID or allowlist matching.

### CDP React Fiber `Platform.getRegistry()` Discovery
**Source:** `py_modules/engine.py` (lines 358-385), `py_modules/rpc_library.py` (lines 320-347)
**Apply to:** `py_modules/engine.py` (`_cdp_toggle_like_track`, `_cdp_get_liked_tracks`)
- Traverse `#main` React Fiber (`__reactFiber$` / `__reactContainer$`) with `visited` set and `< 5000` node cap, locate `registry._map`, and extract `LibraryAPI`.

## No Analog Found

None — every file and behavior in Phase 13 has a direct, existing analog in the repository.

## Metadata

**Analog search scope:** `py_modules/`, `tests/`
**Files scanned:** 9
**Pattern extraction date:** 2026-11-16
