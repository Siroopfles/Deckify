# Phase 13: Like Button 403 Fix & Sink-Input Guardrails - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-16
**Phase:** 13-like-button-403-fix-sink-input-guardrails
**Areas discussed:** Spotify Library Endpoint & Fallback, Liked Cache & Batching, Sink-Input Stream Targeting

---

## Spotify Library Endpoint & Fallback

| Option | Description | Selected |
|--------|-------------|----------|
| Primary `/v1/me/library`, fallback to CDP `LibraryAPI` if 403 and `spotify_client` active | Fast Web API first, seamless local CDP fallback for Flatpak client | ✓ |
| CDP `LibraryAPI` first when `spotify_client` active | Avoids Web API call when Flatpak client is running | |
| `/v1/me/library` only (no CDP fallback) | Simpler, relies purely on Spotify Web API | |

| Option | Description | Selected |
|--------|-------------|----------|
| Show actionable toast on 403/failure and revert optimistic heart | Keeps UI honest if both Web API and CDP fail | ✓ |
| Silent log only on 403 | Avoids toast popup if user has read-only Dev Mode | |

**User's choice:** Primary `/v1/me/library` with CDP `LibraryAPI` fallback on 403, and actionable error toast + revert on failure.

---

## Liked Cache & Batching

| Option | Description | Selected |
|--------|-------------|----------|
| Chunk at 40 URIs on `/v1/me/library/contains` and keep 300s TTL cache | Matches Spotify's 40-item limit on the new endpoint | ✓ |
| Chunk at 20 URIs | Extra conservative payload size | |
| You decide | Let planner pick the safest batch size | |

| Option | Description | Selected |
|--------|-------------|----------|
| Keep `GET /v1/me/tracks` for Liked Songs list, add CDP `LibraryAPI` fallback only if 403 | `GET /v1/me/tracks` still works for reading saved tracks; fallback covers Dev Mode | ✓ |
| Leave `GET /v1/me/tracks` untouched | Only fix `check_tracks_liked` and `toggle_like_track` | |

**User's choice:** Chunk at 40 URIs with 300s TTL cache, and add CDP `LibraryAPI` 403 fallback to `get_liked_tracks`.

---

## Sink-Input Stream Targeting

| Option | Description | Selected |
|--------|-------------|----------|
| Target allowlist only (`librespot`, `spotify`, `com.spotify.client`, `deckify_eq_out`) + explicit `steamwebhelper`/`Chromium` deny-list | Reuses `VolumeFader` matching and protects game/Steam UI audio | ✓ |
| Target by active engine PID only | Stricter, but misses child/EQ virtual sink streams | |

| Option | Description | Selected |
|--------|-------------|----------|
| Return `false` / no-op with debug log if 0 matching streams found | Guarantees Steam UI & games are never moved by mistake | ✓ |
| Return `true` no-op silently | Same safety, no log entry | |

**User's choice:** Allowlist + deny-list targeting, and return `false` no-op with debug log when 0 matching streams are active.

---

## the agent's Discretion
- Exact CDP `LibraryAPI` discovery inside `py_modules/engine.py`.
- Shared `resolve_spotify_sink_input_ids()` helper structure across `py_modules/volume.py` and `py_modules/engine.py`.

## Deferred Ideas
None.
