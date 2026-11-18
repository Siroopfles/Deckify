# Phase 13: Like Button 403 Fix & Sink-Input Guardrails - Context

**Gathered:** 2026-11-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Migrate track liking, unliking, and liked-status checks in `py_modules/rpc_playback.py` from deprecated `/v1/me/tracks` endpoints to `/v1/me/library` and `/v1/me/library/contains` (with CDP `LibraryAPI` fallback when `spotify_client` is active), and harden `_set_pactl_sink_input` (`py_modules/engine.py`) + shared sink-input resolution (`py_modules/volume.py`) so only Deckify/Spotify streams (`librespot`, `spotify`, `com.spotify.client`, `deckify_eq_out`) are ever moved or faded, never `steamwebhelper`, `Chromium`, or game audio.

</domain>

<decisions>
## Implementation Decisions

### Spotify Library Endpoint & Fallback
- **D-01:** `toggle_like_track` uses `PUT/DELETE /v1/me/library?uris=spotify:track:{id}` as the primary endpoint, and falls back to CDP `LibraryAPI` when Web API returns HTTP 403 and the `spotify_client` backend is active.
- **D-02:** If both Web API and CDP fallback fail (or `spotify_client` is not active on 403), return `{ ok: false, error }` so the frontend displays an actionable error toast and reverts any optimistic heart state.

### Liked Cache & Batching
- **D-03:** `check_tracks_liked` migrates from `/v1/me/tracks/contains` (chunk 50) to `/v1/me/library/contains` with a maximum batch chunk size of 40 URIs (`spotify:track:{id}`), preserving the 300s `_liked_cache` TTL.
- **D-04:** `get_liked_tracks` keeps `GET /v1/me/tracks` as primary for reading Liked Songs, adding a CDP `LibraryAPI` fallback if `GET /v1/me/tracks` returns HTTP 403.

### Sink-Input Stream Targeting
- **D-05:** Shared sink-input resolution (`resolve_spotify_sink_input_ids`) strictly uses an allowlist (`librespot`, `spotify`, `com.spotify.client`, `deckify_eq_out`) combined with an explicit deny-list (`steamwebhelper`, `Chromium`) so game audio and SteamOS UI sounds are never moved or muted.
- **D-06:** When 0 matching Spotify/Deckify sink-inputs are active, `_set_pactl_sink_input` logs at debug level and returns `False` as a safe no-op (never falling back to moving all sink-inputs).

### the agent's Discretion
- Exact CDP `LibraryAPI` method/selector discovery inside `py_modules/engine.py` (following the existing `RootlistAPI`/`PlaylistMixingAPI` React Fiber pattern).
- Exact structure and naming of the shared `resolve_spotify_sink_input_ids()` helper across `py_modules/volume.py` and `py_modules/engine.py`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & Research Context
- `.planning/REQUIREMENTS.md` — `LIB-01` and `LIB-02` acceptance requirements
- `.planning/ROADMAP.md` — Phase 13 goal and success criteria
- `.planning/research/SUMMARY.md` — v0.6 research synthesis and Phase 13 guardrails
- `.planning/research/PITFALLS.md` — Spotify `/v1/me/library` 40-item batch limit & `_set_pactl_sink_input` Steam UI protection

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `py_modules/rpc_playback.py`: `check_tracks_liked`, `annotate_tracks_liked`, `toggle_like_track`, `get_liked_tracks`
- `py_modules/engine.py`: `_set_pactl_sink_input`, `_cdp_evaluate` (existing CDP React Fiber helper)
- `py_modules/volume.py`: `VolumeFader` and sink-input resolution logic

### Established Patterns
- PipeWire UI Stream Isolation (`GEMINI.md`): `steamwebhelper` / `Chromium` streams must always be ignored.
- Phase 08-04 Like 403 toast handling: frontend already surfaces `toggle_like_track` error messages via Decky toaster.

### Integration Points
- `py_modules/rpc_playback.py` ↔ `py_modules/engine.py` (CDP `LibraryAPI` fallback)
- `py_modules/engine.py` ↔ `py_modules/volume.py` (shared `resolve_spotify_sink_input_ids()` used by both `_set_pactl_sink_input` and `VolumeFader`)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches within the locked decisions above.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 13-like-button-403-fix-sink-input-guardrails*
*Context gathered: 2026-11-16*
