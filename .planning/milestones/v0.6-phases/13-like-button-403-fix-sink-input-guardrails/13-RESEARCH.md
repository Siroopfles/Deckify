# Phase 13: Like Button 403 Fix & Sink-Input Guardrails - Research

**Researched:** 2026-11-16
**Domain:** Spotify Web API `/v1/me/library`, Official Spotify Client CDP `LibraryAPI`, & PipeWire/PulseAudio Sink-Input Isolation
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** `toggle_like_track` uses `PUT/DELETE /v1/me/library?uris=spotify:track:{id}` as the primary endpoint, and falls back to CDP `LibraryAPI` when Web API returns HTTP 403 and the `spotify_client` backend is active.
- **D-02:** If both Web API and CDP fallback fail (or `spotify_client` is not active on 403), return `{ ok: false, error }` so the frontend displays an actionable error toast and reverts any optimistic heart state.
- **D-03:** `check_tracks_liked` migrates from `/v1/me/tracks/contains` (chunk 50) to `/v1/me/library/contains` with a maximum batch chunk size of 40 URIs (`spotify:track:{id}`), preserving the 300s `_liked_cache` TTL.
- **D-04:** `get_liked_tracks` keeps `GET /v1/me/tracks` as primary for reading Liked Songs, adding a CDP `LibraryAPI` fallback if `GET /v1/me/tracks` returns HTTP 403.
- **D-05:** Shared sink-input resolution (`resolve_spotify_sink_input_ids`) strictly uses an allowlist (`librespot`, `spotify`, `com.spotify.client`, `deckify_eq_out`) combined with an explicit deny-list (`steamwebhelper`, `Chromium`) so game audio and SteamOS UI sounds are never moved or muted.
- **D-06:** When 0 matching Spotify/Deckify sink-inputs are active, `_set_pactl_sink_input` logs at debug level and returns `False` as a safe no-op (never falling back to moving all sink-inputs).

### the agent's Discretion
- Exact CDP `LibraryAPI` method/selector discovery inside `py_modules/engine.py` (following the existing `RootlistAPI`/`PlaylistMixingAPI` React Fiber pattern).
- Exact structure and naming of the shared `resolve_spotify_sink_input_ids()` helper across `py_modules/volume.py` and `py_modules/engine.py`.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LIB-01 | User can like and unlike tracks via `toggle_like_track` and check liked status via `check_tracks_liked` without HTTP 403 errors (migrated from deprecated `/v1/me/tracks` to `/v1/me/library` & `/v1/me/library/contains` with CDP `LibraryAPI` fallback when `spotify_client` is active). | `_spotify_api_request` query-param support (`py_modules/spotify.py:58-59`), `check_tracks_liked` / `toggle_like_track` (`py_modules/rpc_playback.py:156-242`), `get_liked_tracks` (`py_modules/rpc_library.py:442-486`), and CDP React Fiber `Platform.getRegistry()` pattern (`py_modules/engine.py:356-386`, `py_modules/rpc_library.py:320-363`). |
| LIB-02 | Audio sink-input routing (`_set_pactl_sink_input` / `resolve_spotify_sink_input_ids`) strictly targets only Deckify/Spotify streams (`librespot`, `com.spotify.client`, `deckify_eq_out`) and never moves or mutes `steamwebhelper`, `Chromium`, or game audio streams. | `_set_pactl_sink_input` (`py_modules/engine.py:130-155`), `VolumeFader.resolve_sink_input_id` (`py_modules/volume.py:180-235`), and `_build_deck_command` (`py_modules/common.py:326-346`). |
</phase_requirements>

## Project Constraints (from GEMINI.md)

- **PipeWire UI Stream Isolation:** Steam GamepadUI interface sounds run under `steamwebhelper` with application name `"Chromium"`. Any PipeWire/PulseAudio sink-input inspection or manipulation must explicitly ignore `steamwebhelper` and `Chromium` streams to prevent muting Steam UI click sounds in `module-stream-restore`.
- **Process Environment Isolation:** Decky Loader's bundled Python libraries conflict with SteamOS system libraries (`_build_deck_command` in `py_modules/common.py:326-346` runs commands as `DECK_USER` with `XDG_RUNTIME_DIR`, `DBUS_SESSION_BUS_ADDRESS`, `PULSE_SERVER`, `HOME`).
- **Error Handling & RPC Contract:** RPC methods must never crash the main event loop; wrap external network/system calls in `try/except` and return structured `{ "ok": false, "error": ... }` dictionaries.
- **Logging Hygiene:** Never log sensitive user authentication tokens or authorization headers (`decky.logger.info` / `decky.logger.warning` / `decky.logger.error`).
- **Code Style:** 4-space indentation for Python, double quotes preferred, type annotations on function signatures.

## Summary

Phase 13 resolves two foundational reliability bugs before v0.6's Sleep Timer Fade-Out, PipeWire Equalizer, and Docked Audio Switching phases build on top of them. First, Spotify's 2026 Development Mode Web API policy deprecated `/v1/me/tracks` (`PUT`/`DELETE`) and `/v1/me/tracks/contains` (`GET`) in favor of `/v1/me/library` and `/v1/me/library/contains`, returning silent HTTP 403 Forbidden errors on legacy routes. In `py_modules/rpc_playback.py`, `toggle_like_track` and `check_tracks_liked` still target `me/tracks` and `me/tracks/contains` with a 50-item chunk size. Migrating both to `me/library` (`?uris=spotify:track:...`) and `me/library/contains` (chunk size 40) fixes Web API liking, while adding a CDP `LibraryAPI` fallback in `py_modules/engine.py` (for `toggle_like_track` and `get_liked_tracks` when `spotify_client` is active) ensures Official Spotify Client users remain resilient even if Web API returns 403.

Second, `_set_pactl_sink_input` in `py_modules/engine.py:130-155` currently runs `pactl list short sink-inputs` and moves **every** active sink-input to `target_sink`, which hijacks `steamwebhelper` (`Chromium`) UI click sounds and running game audio. Meanwhile, `VolumeFader.resolve_sink_input_id()` in `py_modules/volume.py:180-235` already implements PipeWire block parsing, `steamwebhelper`/`Chromium` exclusion, and PID-first prioritization. Extracting a shared `resolve_spotify_sink_input_ids(stdout: str, pids: set[str] | None = None) -> list[str]` helper in `py_modules/engine.py` and consuming it from both `_set_pactl_sink_input` and `VolumeFader.resolve_sink_input_id()` eliminates duplicated parsing logic and enforces strict stream isolation across all audio routing and volume fading.

**Primary recommendation:** Migrate `check_tracks_liked` (40-URI chunks) and `toggle_like_track` to `me/library` + `me/library/contains` with a `spotify_client` CDP `LibraryAPI` 403 fallback, and centralize sink-input resolution into `resolve_spotify_sink_input_ids()` in `py_modules/engine.py` with allowlist + deny-list filtering.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Spotify `/v1/me/library` API calls & 300s `_liked_cache` | API / Backend (`py_modules/rpc_playback.py`, `py_modules/rpc_library.py`) | Browser / Client (optimistic UI & toast) | Backend owns OAuth Bearer tokens, 403 handling, and rate-limit circuit breaker. |
| CDP `LibraryAPI` fallback | API / Backend (`py_modules/engine.py`) | Official Spotify Client CEF (port 9222) | Backend already owns `_cdp_evaluate` and React Fiber registry traversal. |
| Sink-input resolution & moving (`resolve_spotify_sink_input_ids`, `_set_pactl_sink_input`) | API / Backend (`py_modules/engine.py`, `py_modules/volume.py`) | Host PipeWire / PulseAudio (`pactl`) | Host audio routing runs under `DECK_USER` via `_build_deck_command`. |

## Standard Stack

Zero new npm or Python dependencies are required for Phase 13. All functionality uses Python 3.11+ stdlib (`json`, `subprocess`, `urllib.error`, `urllib.parse`, `time`) and existing Deckify internal modules.

| Module / Utility | Purpose | Source |
|------------------|---------|--------|
| `_spotify_api_request` | Spotify Web API HTTP client with URL query param encoding and 429 breaker | [VERIFIED: `py_modules/spotify.py:40-96`] |
| `_cdp_evaluate` | Evaluates async JS expressions inside Official Spotify Client via CDP | [VERIFIED: `py_modules/engine.py:296-315`] |
| `_build_deck_command` | Wraps `pactl` commands with `DECK_USER` and `PULSE_SERVER` env | [VERIFIED: `py_modules/common.py:326-346`] |
| `unittest` / `IsolatedAsyncioTestCase` | Python standard library async unit testing | [VERIFIED: `tests/test_volume.py:51-104`] |

## Architecture Patterns

### System Architecture Diagram

```text
  [Frontend: QAM / ExpandedModal]
        |  callable("toggle_like_track") / get_liked_tracks / set_audio_sink
        v
  [Backend RPC: rpc_playback.py / rpc_library.py / volume.py]
        |
        +---> (LIB-01) PUT/DELETE /v1/me/library?uris=spotify:track:{id}
        |              GET /v1/me/library/contains?uris=... (max 40 URIs)
        |                 |-- 200/204 --> update _liked_cache (300s TTL)
        |                 |-- 403 & spotify_client active --> CDP LibraryAPI fallback (engine.py)
        |                 '-- 403 & librespot / CDP fail --> return { ok: false, error }
        |
        '---> (LIB-02) _build_deck_command(["pactl", "list", "sink-inputs"])
                          |
                          v
                 resolve_spotify_sink_input_ids(stdout, pids)
                   1. Exclude blocks matching deny-list ("steamwebhelper", "chromium")
                   2. Prioritize exact PID matches (_process.pid / _spotify_client_process.pid)
                   3. Match allowlist ("librespot", "spotify", "com.spotify.client", "deckify_eq_out")
                          |
                          |-- VolumeFader.resolve_sink_input_id() -> ids[0] or None
                          '-- _set_pactl_sink_input(target_sink) -> move each id; 0 ids => debug log + False
```

### Pattern 1: Spotify `/v1/me/library` Migration & `spotify_client` CDP Fallback

**What:**
1. `check_tracks_liked(plugin, token, track_ids)` in `py_modules/rpc_playback.py` (`[VERIFIED: py_modules/rpc_playback.py:156-188]`):
   - Preserves the 300s `_liked_cache` TTL (`(now - plugin._liked_cache[tid][0]) < 300`).
   - Normalizes incoming `track_ids` (stripping `spotify:track:` if present or formatting each as `f"spotify:track:{tid}"` for the `uris` query parameter while keying `result` and `plugin._liked_cache` by bare track ID `tid` so callers like `annotate_tracks_liked` continue to work unchanged).
   - Chunks `missing_ids` into batches of **40** (down from `50` at `py_modules/rpc_playback.py:173-174`).
   - Calls `_exec(_spotify_api_request, "me/library/contains", token, "GET", {"uris": ",".join(f"spotify:track:{tid}" for tid in chunk)})`.
   - Returns `[bool, ...]` mapped back to `tid` in `result` and `_liked_cache`.
2. `toggle_like_track(plugin, track_id, liked)` in `py_modules/rpc_playback.py` (`[VERIFIED: py_modules/rpc_playback.py:200-242]`):
   - Uses `"me/library"` with `params={"uris": f"spotify:track:{target_id}"}` for `PUT` (save) and `DELETE` (remove).
   - Note that `_spotify_api_request` (`py_modules/spotify.py:58-59`) appends `params` as `?{urllib.parse.urlencode(params)}`, producing `PUT /v1/me/library?uris=spotify%3Atrack%3A...` — matching `[CITED: developer.spotify.com]` without sending a JSON body.
   - On `urllib.error.HTTPError` with `code == 403`:
     - Check if `spotify_client` is active: `plugin._settings.get("audio_backend") == "spotify_client"` and `bool(getattr(plugin, "_spotify_client_process", None) and plugin._spotify_client_process.poll() is None)` (or `plugin._is_spotify_client_running()` if present).
     - If active, attempt CDP `LibraryAPI` fallback (`_cdp_toggle_like_track(f"spotify:track:{target_id}", target_liked)` in `py_modules/engine.py`).
     - If CDP succeeds, update `_liked_cache`, `_is_liked`, and emit `track_metadata` identically to the Web API success path.
     - If `spotify_client` is not active OR CDP fallback fails, return `{"ok": False, "error": "Spotify rejected library access (403 Forbidden). Re-authenticate in Settings or check Spotify Developer Mode allowlist."}` (exact string verified by `tests/test_final_coverage.py:310-316`).
3. `get_liked_tracks(plugin, offset, fetch_all)` in `py_modules/rpc_library.py` (`[VERIFIED: py_modules/rpc_library.py:442-486]`):
   - Keeps `GET me/tracks` (`{"limit": 50, "offset": cur_offset}`) as primary.
   - Wraps the `urllib.error.HTTPError` 403 case so that when `spotify_client` is active, it falls back to CDP `LibraryAPI` (`_cdp_get_liked_tracks(offset, fetch_all)` in `py_modules/engine.py`).

### Pattern 2: CDP `LibraryAPI` React Fiber Discovery (`py_modules/engine.py`)

**What:** Reuse the exact React Fiber `platform.getRegistry()._map` traversal already proven in `_fetch_spotify_cdp_folder_tree` (`py_modules/engine.py:358-385`) and `set_native_playlist_mix` (`py_modules/rpc_library.py:320-363`):
```javascript
const mainEl = document.querySelector('#main');
if (!mainEl) return { ok: false, error: 'Spotify UI not ready' };
const rk = Object.keys(mainEl).find(k => k.startsWith('__reactContainer') || k.startsWith('__reactFiber'));
// BFS over curr.child / curr.sibling up to 5000 nodes to find curr.memoizedProps?.platform?.getRegistry() or memoizedProps?.value?._map
```
Look up `LibraryAPI` in `registry._map.entries()` where `(k?.description || String(k)) === 'LibraryAPI'`.
- Because Spotify Desktop Client internal `LibraryAPI` signatures can vary across client builds (`[CITED: spicetify.app]` / `[ASSUMED]`), defend against both `{ uris: [uri] }` and `[uri]` argument forms in `add`/`remove` (e.g., try `await libApi.add({ uris: [uri] })` and if that throws or is rejected, or check `typeof libApi.add === 'function'`, support `libApi.add([uri])` / `libApi.remove({ uris: [uri] })` / `libApi.remove([uri])`).
- For `get_liked_tracks` fallback via `LibraryAPI.getTracks` (`[ASSUMED]`): inspect `typeof libApi.getTracks === 'function'` and normalize returned items (`uri`, `name`, `artists`, `album`, `duration` / `duration_ms`, `images` via `spotify:image:` -> `https://i.scdn.co/image/...` as in `_fetch_spotify_cdp_folder_tree` at `py_modules/engine.py:387-394`).

### Pattern 3: Shared Sink-Input Resolution (`resolve_spotify_sink_input_ids`)

**What:** Place `resolve_spotify_sink_input_ids(stdout: str, pids: set[str] | None = None) -> list[str]` in `py_modules/engine.py` (which `py_modules/volume.py` already imports from at `py_modules/volume.py:14-18`, avoiding any circular imports):
1. Parse `pactl list sink-inputs` output into `(sink_id, block_text)` blocks starting at `"Sink Input #"`, extracting numeric `sink_id` (`parts[1].strip().isdigit()`).
2. **Deny-list filter first:** Skip any block where `"steamwebhelper" in low` OR any line containing `"application.name"` or `"application.process.binary"` also contains `"chromium"`.
3. **Pass 1 (PID priority):** If `pids` is provided, collect `sink_id`s where `any(f'"{p}"' in block for p in pids if p)` in order.
4. **Pass 2 (Allowlist match):** For remaining filtered blocks, check lines containing `"application.name"`, `"media.name"`, `"node.name"`, or `"application.process.binary"` for any allowlist token in `("librespot", "spotify", "com.spotify.client", "deckify_eq_out")`. Append matching `sink_id`s (preserving order, deduplicated).
5. **Consumers:**
   - `VolumeFader.resolve_sink_input_id()` (`py_modules/volume.py:180-235`): calls `_build_deck_command(["pactl", "list", "sink-inputs"])`, passes `res.stdout` and `{_process.pid, _spotify_client_process.pid}` to `resolve_spotify_sink_input_ids()`, and returns `ids[0] if ids else None`.
   - `_set_pactl_sink_input(target_sink: str, pids: set[str] | None = None) -> bool` (`py_modules/engine.py:130-155`): calls `_build_deck_command(["pactl", "list", "sink-inputs"])`, resolves `ids = resolve_spotify_sink_input_ids(proc.stdout, pids)`. If `not ids`, logs at `decky.logger.debug(...)` and returns `False` (D-06). Otherwise moves each `input_id` via `_build_deck_command(["pactl", "move-sink-input", input_id, target_sink])`.

### Anti-Patterns to Avoid
- **Using `pactl list short sink-inputs` in `_set_pactl_sink_input`:** Short output lacks `application.name`, `media.name`, `node.name`, and `application.process.id`, making stream filtering impossible. Always use `pactl list sink-inputs`.
- **Fallback to moving all sink-inputs when 0 Spotify streams match:** Explicitly forbidden by D-06; return `False` cleanly.
- **Chunking `/v1/me/library/contains` at 50:** `/v1/me/library` enforces a 40-URI maximum (`PITFALLS.md:45`, D-03).
- **Sending JSON body `{"ids": ...}` to `/v1/me/library`:** `/v1/me/library` takes `uris` as a comma-separated query parameter (`?uris=spotify:track:...`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP query encoding & 429 circuit breaker | Custom `urllib` calls | `_spotify_api_request` (`py_modules/spotify.py:40-96`) | Already handles `urlencode(params)`, `204 No Content`, SSL context, and exponential 429 backoff. |
| UID 1000 PulseAudio env wrapping | Raw `subprocess.run(["pactl", ...])` with `os.environ` | `_build_deck_command` (`py_modules/common.py:326-346`) | Decky Loader runs as `root` (UID 0); `_build_deck_command` runs as `DECK_USER` with `PULSE_SERVER`. |
| CDP WebSocket & Promise evaluation | New WebSocket client | `_cdp_evaluate` (`py_modules/engine.py:296-315`) | Already handles target discovery, Promise awaiting, and positional timeout typeguard. |

## Common Pitfalls

### Pitfall 1: Breaking Existing Unit Tests Expecting `me/tracks` or 403 Error String
**What goes wrong:** `tests/test_features.py:57-63` asserts `main._spotify_api_request, "me/tracks", "valid-token", "PUT", {"ids": "track-123"}`, and `tests/test_final_coverage.py:310-316` asserts `"403 Forbidden"` and `"Re-authenticate in Settings"` when `toggle_like_track` receives HTTP 403 on default (`librespot`) backend.
**How to avoid:** Update `tests/test_features.py:57-63` to expect `"me/library"` and `{"uris": "spotify:track:track-123"}`, and preserve the exact 403 error message in `py_modules/rpc_playback.py` whenever `spotify_client` is not active or CDP fallback fails.

### Pitfall 2: `check_tracks_liked` Cache Key Mismatch (`spotify:track:id` vs `id`)
**What goes wrong:** If `_liked_cache` is keyed by `spotify:track:{id}` instead of bare `{id}`, `annotate_tracks_liked` (`t.get("id")`) and `toggle_like_track` (`plugin._liked_cache[target_id]`) will miss the cache.
**How to avoid:** Strip any `spotify:track:` prefix when normalizing `clean_ids` for cache lookup/storage, and only prepend `spotify:track:` when building the `uris` query parameter for `me/library/contains`.

### Pitfall 3: `decky` Logger Import in `py_modules/engine.py`
**What goes wrong:** `py_modules/engine.py` currently only imports `SPOTIFY_CDP_PORT` from `py_modules.common` (`py_modules/engine.py:10`). Calling `decky.logger.debug(...)` in `_set_pactl_sink_input` without importing `decky` and `_build_deck_command` will raise `NameError`.
**How to avoid:** Import `decky` and `_build_deck_command` from `py_modules.common` in `py_modules/engine.py`.

### Pitfall 4: `subprocess.run` Mocking in `test_volume.py`
**What goes wrong:** `tests/test_volume.py:51-104` patches `subprocess.run` directly and expects `resolve_sink_input_id()` to call `subprocess.run(cmd, capture_output=True, text=True, env=env)` once.
**How to avoid:** Keep `resolve_spotify_sink_input_ids(stdout, pids)` as a pure string-parsing function and have `VolumeFader.resolve_sink_input_id()` continue invoking `subprocess.run` via `_exec` and passing `res.stdout` to `resolve_spotify_sink_input_ids`.

## Code Examples

### Migrated `check_tracks_liked` (`py_modules/rpc_playback.py`)
```python
# Chunk size 40 per Spotify /v1/me/library/contains limit (D-03)
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
```

### Shared `resolve_spotify_sink_input_ids` (`py_modules/engine.py`)
```python
_DENY_SINK_APPS = ("steamwebhelper",)
_ALLOW_SINK_TOKENS = ("librespot", "spotify", "com.spotify.client", "deckify_eq_out")
_SINK_PROP_KEYS = ("application.name", "media.name", "node.name", "application.process.binary")


def resolve_spotify_sink_input_ids(stdout: str, pids: set[str] | None = None) -> list[str]:
    """Return ordered sink-input IDs matching Spotify/Deckify streams, excluding Steam UI/Chromium."""
    if not stdout:
        return []
    blocks: list[tuple[str, str]] = []
    curr_id: str | None = None
    curr_lines: list[str] = []
    for raw_line in stdout.splitlines():
        line = raw_line.strip()
        if line.startswith("Sink Input #"):
            if curr_id:
                blocks.append((curr_id, "\n".join(curr_lines)))
            parts = line.split("#")
            curr_id = parts[1].strip() if len(parts) > 1 and parts[1].strip().isdigit() else None
            curr_lines = []
        elif curr_id:
            curr_lines.append(line)
    if curr_id:
        blocks.append((curr_id, "\n".join(curr_lines)))

    filtered: list[tuple[str, str, str]] = []
    for sink_id, block in blocks:
        low = block.lower()
        if any(d in low for d in _DENY_SINK_APPS):
            continue
        if any(
            ("application.name" in ln or "application.process.binary" in ln) and "chromium" in ln
            for ln in low.splitlines()
        ):
            continue
        filtered.append((sink_id, block, low))

    matched: list[str] = []
    seen: set[str] = set()
    if pids:
        for sink_id, block, _ in filtered:
            if any(f'"{p}"' in block for p in pids if p) and sink_id not in seen:
                matched.append(sink_id)
                seen.add(sink_id)

    for sink_id, _, low in filtered:
        if sink_id in seen:
            continue
        for ln in low.splitlines():
            if any(k in ln for k in _SINK_PROP_KEYS) and any(t in ln for t in _ALLOW_SINK_TOKENS):
                matched.append(sink_id)
                seen.add(sink_id)
                break
    return matched
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `PUT/DELETE /v1/me/tracks` & `GET /v1/me/tracks/contains` (max 50) | `PUT/DELETE /v1/me/library?uris=...` & `GET /v1/me/library/contains?uris=...` (max 40) | Feb/Mar 2026 | Fixes silent 403 Forbidden on Development Mode apps |
| `pactl list short sink-inputs` moving all streams | `pactl list sink-inputs` + allowlist/deny-list filtering | Phase 13 | Prevents moving/muting `steamwebhelper`, `Chromium`, and games |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Spotify Desktop Client internal `LibraryAPI` exposes `add`, `remove`, and `getTracks` on `Platform.getRegistry()` | Pattern 2 | CDP fallback in `spotify_client` mode would fail gracefully and return `{ ok: false, error }` per D-02; verify method names/arg shapes on live client if needed. |

## Open Questions

None — all architectural choices and fallback behaviors are covered by `13-CONTEXT.md` decisions D-01 through D-06.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python (`py -3`) | Backend & unittest suite | ✓ | 3.14.0 | — |
| `pactl` (PipeWire/PulseAudio) | Live sink-input routing on SteamOS | ✗ (Windows dev host) | — | Mocked via `unittest.mock.patch("subprocess.run")` in unit tests |
| Official Spotify Client CDP (port 9222) | Live CDP `LibraryAPI` fallback | ✗ (Windows dev host) | — | Mocked via `unittest.mock.patch` on `_cdp_evaluate` in unit tests |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Python `unittest` (`IsolatedAsyncioTestCase` / `TestCase`) |
| Config file | None (discovered via `unittest discover -s tests -p "test_*.py"`) |
| Quick run command | `py -3 -m unittest discover -s tests -p "test_volume.py"` and `py -3 -m unittest discover -s tests -p "test_features.py"` |
| Full suite command | `py -3 -m unittest discover -s tests -p "test_*.py"` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LIB-01 | `toggle_like_track` calls `PUT/DELETE me/library` with `uris=spotify:track:...` | unit | `py -3 -m unittest discover -s tests -p "test_features.py"` | ✅ (update existing assertion) |
| LIB-01 | `toggle_like_track` 403 falls back to CDP `LibraryAPI` when `spotify_client` active, and returns `{ ok: false, error }` when `librespot` or CDP fails | unit | `py -3 -m unittest discover -s tests -p "test_final_coverage.py"` | ✅ (extend) |
| LIB-01 | `check_tracks_liked` chunks >40 tracks into batches of 40 on `me/library/contains` | unit | `py -3 -m unittest discover -s tests -p "test_phase13.py"` | ❌ Wave 0 |
| LIB-01 | `get_liked_tracks` falls back to CDP `LibraryAPI` on 403 when `spotify_client` active | unit | `py -3 -m unittest discover -s tests -p "test_phase13.py"` | ❌ Wave 0 |
| LIB-02 | `resolve_spotify_sink_input_ids` & `_set_pactl_sink_input` target only allowlisted streams (`librespot`, `spotify`, `com.spotify.client`, `deckify_eq_out`), exclude `steamwebhelper`/`Chromium`/games, and no-op (`False`) when 0 match | unit | `py -3 -m unittest discover -s tests -p "test_volume.py"` | ✅ (extend) |

### Sampling Rate
- **Per task commit:** `py -3 -m unittest discover -s tests -p "test_volume.py"` / `test_features.py` / `test_phase13.py`
- **Per wave merge:** `py -3 -m unittest discover -s tests -p "test_*.py"`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/test_phase13.py` — covers >40 URI batching in `check_tracks_liked`, CDP `LibraryAPI` fallback in `toggle_like_track` & `get_liked_tracks`, and `resolve_spotify_sink_input_ids` / `_set_pactl_sink_input` guardrails.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Existing OAuth Bearer token via `plugin._ensure_token()`; never log tokens or `Authorization` headers |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes | `json.dumps(uri)` in CDP JS expressions; `input_id.isdigit()` and non-empty non-flag `target_sink` check before `pactl move-sink-input` (`shell=False`) |
| V6 Cryptography | no | — |

### Known Threat Patterns for Python + CDP + `pactl`

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| JS injection in CDP `Runtime.evaluate` expression | Tampering | Serialize `uri` via `json.dumps(uri)` before interpolating into JS template |
| Argument injection into `pactl move-sink-input` | Tampering | Validate `input_id.isdigit()`, reject `target_sink` starting with `-`, pass list args (`shell=False`) |
| OAuth token leakage in error logs | Information Disclosure | Log only `track_id` and HTTP status/parsed error message |

## Sources

### Primary (HIGH confidence)
- Codebase files read this session: `py_modules/rpc_playback.py`, `py_modules/rpc_library.py`, `py_modules/engine.py`, `py_modules/volume.py`, `py_modules/spotify.py`, `py_modules/common.py`, `main.py`, `tests/test_volume.py`, `tests/test_features.py`, `tests/test_final_coverage.py`
- Spotify Web API `/v1/me/library` & `/v1/me/library/contains` (`developer.spotify.com`)

### Secondary (MEDIUM confidence)
- Spicetify `Platform.LibraryAPI` community documentation (`spicetify.app`)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies; existing helpers verified in codebase.
- Architecture: HIGH — patterns directly extend existing `VolumeFader`, `_spotify_api_request`, and `_cdp_evaluate`.
- Pitfalls: HIGH — existing test assertions (`test_features.py`, `test_final_coverage.py`, `test_volume.py`) and cache key conventions verified.

**Research date:** 2026-11-16
**Valid until:** 2026-12-16 (stable internal codebase & 2026 Spotify Web API)
