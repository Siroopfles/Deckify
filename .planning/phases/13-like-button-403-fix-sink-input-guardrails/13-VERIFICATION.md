---
phase: 13-like-button-403-fix-sink-input-guardrails
verified: 2026-11-18T18:58:00Z
status: human_needed
score: 8/8 must-haves verified
covered_files:
  - ".planning/phases/13-like-button-403-fix-sink-input-guardrails/13-01-PLAN.md"
  - ".planning/phases/13-like-button-403-fix-sink-input-guardrails/13-01-SUMMARY.md"
  - ".planning/phases/13-like-button-403-fix-sink-input-guardrails/13-02-PLAN.md"
  - ".planning/phases/13-like-button-403-fix-sink-input-guardrails/13-02-SUMMARY.md"
  - "py_modules/engine.py"
  - "py_modules/rpc_library.py"
  - "py_modules/rpc_playback.py"
  - "py_modules/volume.py"
  - "tests/test_features.py"
  - "tests/test_final_coverage.py"
  - "tests/test_phase13.py"
  - "tests/test_volume.py"
covered_digest: "v4:sha256:80d9f9492abb60fb8ce5287e9ba10c6815f0acfef0da7f60e139a33b9d7b0378"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 8/8
  gaps_closed: []
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Like/unlike tracks in Expanded Modal & QAM on Steam Deck (both librespot and spotify_client modes)"
    expected: "Liking/unliking succeeds without HTTP 403 errors, heart indicator updates accurately, and in spotify_client mode CDP LibraryAPI fallback saves/unsaves if Web API returns 403."
    why_human: "Requires live Spotify Web API OAuth session and running Official Spotify Desktop Client CEF instance with CDP enabled on SteamOS."
  - test: "Switch audio output / trigger volume ducking while a game and Steam UI sounds are active on Steam Deck"
    expected: "Only Spotify/Deckify streams (librespot, com.spotify.client, deckify_eq_out, effect_output.deckify_eq) move or fade; steamwebhelper, Chromium, and active game audio remain untouched."
    why_human: "Requires live SteamOS PipeWire/PulseAudio daemon with concurrent game, steamwebhelper, and Spotify sink-inputs."
---

# Phase 13: Like Button 403 Fix & Sink-Input Guardrails Verification Report

**Phase Goal:** Users can reliably like/unlike tracks without HTTP 403 errors, and Deckify audio routing strictly isolates Spotify/Deckify streams from Steam UI and game audio.
**Verified:** 2026-11-18T18:58:00Z
**Status:** human_needed
**Re-verification:** Yes — refreshed stale covered-input fingerprint and aligned frontmatter `status: human_needed` with pending human verification items after subsequent milestone phases.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `toggle_like_track` sends `PUT`/`DELETE` to `/v1/me/library` with `?uris=spotify:track:{id}` and updates `_liked_cache`, `_is_liked`, and `track_metadata` without HTTP 403 on valid tokens (D-01) | ✓ VERIFIED | [rpc_playback.py](file:///C:/Users/djdje/Deckify/py_modules/rpc_playback.py#L214-L245) calls `_spotify_api_request("me/library", token, method, {"uris": f"spotify:track:{target_id}"})` and updates cache/state; tested in `tests/test_features.py`. |
| 2 | When Web API returns HTTP 403 and `spotify_client` is active, `toggle_like_track` and `get_liked_tracks` fall back to CDP `LibraryAPI` via `py_modules/engine.py` (D-01, D-04) | ✓ VERIFIED | [rpc_playback.py](file:///C:/Users/djdje/Deckify/py_modules/rpc_playback.py#L246-L275) invokes `_cdp_toggle_like_track`; [rpc_library.py](file:///C:/Users/djdje/Deckify/py_modules/rpc_library.py#L532-L548) invokes `_cdp_get_liked_tracks`; both helpers implemented in [engine.py](file:///C:/Users/djdje/Deckify/py_modules/engine.py#L556-L710) and tested in `tests/test_phase13.py`. |
| 3 | When both Web API and CDP fallback fail, or `librespot` is active on 403, `toggle_like_track` returns `{ ok: False, error }` with the actionable 403 error message (D-02) | ✓ VERIFIED | [rpc_playback.py](file:///C:/Users/djdje/Deckify/py_modules/rpc_playback.py#L276-L280) returns actionable 403 message; tested in `tests/test_final_coverage.py`. |
| 4 | `check_tracks_liked` queries `/v1/me/library/contains` in chunks of at most 40 `spotify:track:{id}` URIs while preserving bare track ID keys and the 300s `_liked_cache` TTL (D-03) | ✓ VERIFIED | [rpc_playback.py](file:///C:/Users/djdje/Deckify/py_modules/rpc_playback.py#L169-L202) normalizes IDs, checks 300s TTL, chunks by 40, and calls `"me/library/contains"`; tested with 85+ tracks in `tests/test_phase13.py`. |
| 5 | `resolve_spotify_sink_input_ids` strictly filters out `steamwebhelper` and `Chromium` blocks before matching PIDs or allowlisted tokens (`librespot`, `spotify`, `com.spotify.client`, `deckify_eq_out`) (D-05) | ✓ VERIFIED | [engine.py](file:///C:/Users/djdje/Deckify/py_modules/engine.py#L130-L219) applies deny-list first, then PID priority, then allowlist; tested in `tests/test_phase13.py`. |
| 6 | `VolumeFader.resolve_sink_input_id` delegates parsing and filtering to `resolve_spotify_sink_input_ids` while preserving UID 1000 `_build_deck_command` execution (D-05) | ✓ VERIFIED | [volume.py](file:///C:/Users/djdje/Deckify/py_modules/volume.py#L231-L252) runs `pactl list sink-inputs` via `_build_deck_command` and calls `resolve_spotify_sink_input_ids`; tested in `tests/test_volume.py`. |
| 7 | `_set_pactl_sink_input` uses `pactl list sink-inputs` and `resolve_spotify_sink_input_ids` to move only matched Deckify/Spotify streams, never `steamwebhelper`, `Chromium`, or game audio (D-05) | ✓ VERIFIED | [engine.py](file:///C:/Users/djdje/Deckify/py_modules/engine.py#L222-L265) resolves IDs via `resolve_spotify_sink_input_ids` and validates `input_id.isdigit()` and `target_sink`; tested in `tests/test_phase13.py`. |
| 8 | When 0 matching sink-inputs are active, `_set_pactl_sink_input` logs at debug level and returns `False` as a safe no-op without moving any streams (D-06) | ✓ VERIFIED | [engine.py](file:///C:/Users/djdje/Deckify/py_modules/engine.py#L249-L251) logs via `decky.logger.debug` and returns `False`; tested in `tests/test_phase13.py`. |

**Score:** 8/8 truths verified (0 present, behavior-unverified)

### Advisory (New Scope, Unevidenced)

None.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `py_modules/engine.py` | `_cdp_toggle_like_track`, `_cdp_get_liked_tracks`, `resolve_spotify_sink_input_ids`, `_set_pactl_sink_input` | ✓ VERIFIED | All 4 functions present, substantive, and wired (lines 147-265, 556-710). |
| `py_modules/rpc_playback.py` | Migrated `check_tracks_liked` (40-URI chunks) and `toggle_like_track` (`/v1/me/library` + CDP fallback) | ✓ VERIFIED | Both functions migrated and wired to `engine._cdp_toggle_like_track` (lines 169-280). |
| `py_modules/rpc_library.py` | `get_liked_tracks` with CDP `LibraryAPI` 403 fallback | ✓ VERIFIED | Keeps `GET me/tracks` primary and falls back to `engine._cdp_get_liked_tracks` on 403 in `spotify_client` mode (lines 490-548). |
| `py_modules/volume.py` | `VolumeFader.resolve_sink_input_id` consuming `resolve_spotify_sink_input_ids` | ✓ VERIFIED | Imports and delegates to `resolve_spotify_sink_input_ids` (lines 231-252). |
| `tests/test_phase13.py` | Unit tests for `LIB-01` and `LIB-02` | ✓ VERIFIED | Covers 85-URI (40/40/5) batching, CDP 403 fallbacks, multi-stream deny-list/allowlist isolation, 0-match no-op, and flag-injection guard. |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `py_modules/rpc_playback.py` | `py_modules/engine.py` | `_exec(_cdp_toggle_like_track, ...)` on 403 in `spotify_client` mode | ✓ WIRED | Verified at [rpc_playback.py](file:///C:/Users/djdje/Deckify/py_modules/rpc_playback.py#L257-L261). |
| `py_modules/rpc_library.py` | `py_modules/engine.py` | `_exec(_cdp_get_liked_tracks, ...)` on 403 in `spotify_client` mode | ✓ WIRED | Verified at [rpc_library.py](file:///C:/Users/djdje/Deckify/py_modules/rpc_library.py#L543). |
| `py_modules/volume.py` | `py_modules/engine.py` | `resolve_spotify_sink_input_ids(res.stdout, pids)` | ✓ WIRED | Verified at [volume.py](file:///C:/Users/djdje/Deckify/py_modules/volume.py#L248). |
| `py_modules/engine.py` | `py_modules/common.py` | `_build_deck_command` and `decky.logger.debug` | ✓ WIRED | Verified at [engine.py](file:///C:/Users/djdje/Deckify/py_modules/engine.py#L233-L256). |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Phase 13 unit tests | `py -3 -m unittest discover -s tests -p "test_phase13.py"` | `Ran 6 tests in 0.147s — OK` | ✓ PASS |
| Volume fader & sink-input isolation tests | `py -3 -m unittest discover -s tests -p "test_volume.py"` | `Ran 58 tests in 4.872s — OK` | ✓ PASS |
| Feature tests (incl. like metadata) | `py -3 -m unittest discover -s tests -p "test_features.py"` | `Ran 28 tests in 1.929s — OK` | ✓ PASS |
| Final coverage tests (incl. 403 error path) | `py -3 -m unittest discover -s tests -p "test_final_coverage.py"` | `Ran 22 tests in 1.343s — OK` | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| `LIB-01` | `13-01-PLAN.md` | Like/unlike via `/v1/me/library` & batch check via `/v1/me/library/contains` (max 40 URIs) with CDP `LibraryAPI` 403 fallback | ✓ SATISFIED | `py_modules/rpc_playback.py`, `py_modules/rpc_library.py`, `py_modules/engine.py`, `tests/test_phase13.py`, `tests/test_features.py`, `tests/test_final_coverage.py`. |
| `LIB-02` | `13-02-PLAN.md` | Sink-input routing strictly targets `librespot`, `spotify`, `com.spotify.client`, `deckify_eq_out` and never `steamwebhelper`, `Chromium`, or game audio | ✓ SATISFIED | `py_modules/engine.py`, `py_modules/volume.py`, `tests/test_volume.py`, `tests/test_phase13.py`. |

### Anti-Patterns Found

None. No `TBD`, `FIXME`, `XXX`, `TODO`, `HACK`, `PLACEHOLDER`, or stub implementations found in modified files.

### Human Verification Required

1. **Live Like/Unlike & CDP Fallback on Steam Deck**
   - **Test:** In SteamOS GamepadUI, like and unlike tracks from both the Expanded Modal and Quick Access Menu (test in `librespot` mode and `spotify_client` mode).
   - **Expected:** Track liking/unliking completes without HTTP 403 errors, heart indicators reflect saved state, and `spotify_client` mode falls back to CDP `LibraryAPI` if Web API returns 403.
   - **Why human:** Requires live Spotify Web API OAuth tokens and a running Official Spotify Desktop Client CEF instance with CDP on Steam Deck.

2. **Live PipeWire Sink-Input Isolation on Steam Deck**
   - **Test:** With a game running and Steam UI navigation sounds active, switch audio output or trigger volume ducking in Deckify.
   - **Expected:** Only Spotify/Deckify streams (`librespot`, `com.spotify.client`, `deckify_eq_out`, `effect_output.deckify_eq`) are moved or faded; `steamwebhelper`, `Chromium`, and game audio streams remain unaffected.
   - **Why human:** Requires live SteamOS PipeWire/PulseAudio daemon with concurrent game, `steamwebhelper`, and Spotify sink-inputs.

---

_Verified: 2026-11-18T18:58:00Z_
_Verifier: the agent (gsd-verifier)_
