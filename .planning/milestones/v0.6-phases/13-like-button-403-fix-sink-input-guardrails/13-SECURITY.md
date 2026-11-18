---
phase: 13
slug: like-button-403-fix-sink-input-guardrails
status: secured
threats_open: 0
asvs_level: 1
audited: "2026-11-16T14:54:50+01:00"
---

# Phase 13 — Security Verification (`13-SECURITY.md`)

**Status:** SECURED (`5/5` threats closed, `threats_open: 0`)

## Threat Verification

| Threat ID | Category | Severity | Disposition | Evidence |
|-----------|----------|----------|-------------|----------|
| T-13-01 | Tampering | medium | mitigate | `py_modules/engine.py:526-531,586-587,625-627` — `_cdp_toggle_like_track` serializes `uri` with `json.dumps(str(uri))` and boolean `liked` to `"true"`/`"false"`; `_cdp_get_liked_tracks` coerces `offset` with `max(0, int(offset))`, boolean `fetch_all` to `"true"`/`"false"`, and hardcodes `const limit = 100;` |
| T-13-02 | Information Disclosure | low | mitigate | `py_modules/rpc_playback.py:189,259-264,271` & `py_modules/rpc_library.py:500,503` — `check_tracks_liked`, `toggle_like_track`, and `get_liked_tracks` log only `target_id` and exception/HTTP error strings via `decky.logger`, never OAuth tokens or Authorization headers |
| T-13-03 | Tampering | medium | mitigate | `py_modules/engine.py:148,200-228` — `_set_pactl_sink_input` rejects non-string, empty, or `-`-prefixed `target_sink`; `resolve_spotify_sink_input_ids` and `_set_pactl_sink_input` both enforce `isdigit()` on `input_id`; commands execute as argument lists via `_build_deck_command` and `subprocess.run(..., shell=False)` |
| T-13-04 | Denial of Service | high | mitigate | `py_modules/engine.py:130,155-195,214-217` & `py_modules/volume.py:198-199` — `resolve_spotify_sink_input_ids` applies `steamwebhelper`/`Chromium` deny-list before PID priority and allowlist (`librespot`, `spotify`, `com.spotify.client`, `deckify_eq_out`); `_set_pactl_sink_input` logs at debug and returns `False` on 0 matches; `VolumeFader.resolve_sink_input_id` delegates to `resolve_spotify_sink_input_ids`. Verified by `tests/test_phase13.py` and `tests/test_volume.py` |
| T-13-SC | Tampering | high | accept | `13-01-SUMMARY.md` & `13-02-SUMMARY.md` (`tech-stack.added: []`) — zero new dependencies added in Phase 13 |

## Unregistered Flags

None.
