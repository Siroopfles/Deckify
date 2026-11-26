---
status: diagnosed
trigger: "Investigate issue: radio-fails-to-start (UAT Test 4)"
created: 2026-11-23T20:46:20Z
updated: 2026-11-23T20:48:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

bug_class: Bohrbug
hypothesis: start_radio fails deterministically in Spotify Development Mode because Tier 1 is stubbed, Tier 2 (/v1/recommendations) returns 404/403, Tier 3 (/v1/artists/{id}/top-tracks) returns 403, and Tier 3 (/v1/search) hardcodes limit=25 which exceeds Spotify Dev Mode's max search limit of 10 (returning 400/403) with no limit=10 retry or album-tracks fallback, and all exceptions are silently swallowed.
test: Inspected py_modules/rpc_playback.py, py_modules/rpc_library.py, frontend callers, and live Steam Deck log /home/deck/homebrew/logs/Deckify/2026-11-23 21.34.10.log
expecting: Confirmed root cause across all tiers of start_radio
next_action: Return structured ROOT CAUSE FOUND diagnosis to orchestrator

candidate_causes:
  - "code: py_modules/rpc_playback.py:start_radio hardcodes limit=25 in Tier 3 /v1/search (line 863) without limit=10 fallback, has no artists/{id}/albums fallback when top-tracks fails, and silently swallows all Tier 2/3 exceptions without logging."
  - "environment/config: Spotify Web API Development Mode deprecates/blocks /v1/recommendations (404/403), blocks /v1/artists/{id}/top-tracks (403), and caps /v1/search limit at 10 (400/403 on limit > 10)."
and_gate: "yes — failure requires both Spotify Development Mode API restrictions (blocking Tier 2 recommendations, Tier 3 top-tracks, and /v1/search limit > 10) AND start_radio lacking a limit=10 search retry / album-discography fallback and silently swallowing errors."

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: Starting Song Radio plays the seed track immediately and replaces the upcoming queue; Artist Radio and Album Radio start radio playback with a single toast on success.
actual: Start ook niet
errors: None reported
reproduction: Test 4 in UAT
started: Discovered during UAT

## Eliminated
<!-- APPEND only - prevents re-investigating -->

- hypothesis: Frontend-to-backend RPC wiring mismatch in TrackActionModal / ArtistsTab / AlbumsTab / DeckifyExpandedModal
  evidence: DeckifyExpandedModal.tsx:70 declares callable<[string, string, string, string, string], ...>("start_radio") matching main.py:1451 start_radio(self, seed_type, seed_id, seed_uri="", seed_name="", artist_name=""), and TrackActionModal.tsx:252, ArtistsTab.tsx:106, AlbumsTab.tsx:140 all invoke the corresponding handlers.
  timestamp: 2026-11-23T20:47:30Z

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-11-23T20:46:40Z
  checked: py_modules/rpc_playback.py lines 688-897 (start_radio and helpers)
  found: |
    - Tier 1 (_try_cdp_station_radio, line 695) is a stub returning [].
    - Tier 2 (lines 760-808) calls GET /v1/recommendations with limit=25; exceptions caught silently at line 807.
    - Tier 3 (lines 826-850) calls GET /v1/artists/{safe_art_id}/top-tracks; exceptions caught silently at line 838.
    - Tier 3 (lines 854-870) calls GET /v1/search with {"q": search_query, "type": "track", "limit": 25} (line 863); exceptions caught silently at line 869 with no retry at limit=10 and no fallback to artists/{id}/albums.
    - Line 879-880 returns {"ok": False, "error": "Could not start radio — please try again."} when candidate_uris is empty.
  implication: In Spotify Development Mode, all 3 tiers fail silently for track and artist seeds, and album seeds only fall back to the first 5 tracks of the album itself (if albums/{id}/tracks succeeds).

- timestamp: 2026-11-23T20:46:50Z
  checked: py_modules/rpc_library.py lines 881-907 and 1094-1142
  found: |
    - get_artist_top_tracks (line 895) explicitly catches HTTPError 403 on artists/{id}/top-tracks and falls back to /v1/search with limit=10 (line 903).
    - search_spotify (lines 1124, 1130-1140) sends limit=50 and only retries with limit=10 if "Invalid limit" in str(e) or "400" in str(e).
  implication: Codebase already has evidence that /v1/artists/{id}/top-tracks returns 403 in Dev Mode and /v1/search is capped at limit=10, but start_radio was not written with those Dev Mode constraints.

- timestamp: 2026-11-23T20:46:58Z
  checked: Live Steam Deck log /home/deck/homebrew/logs/Deckify/2026-11-23 21.34.10.log via SSH (<STEAM_MACHINE_IP>)
  found: |
    - Multiple "[ERROR]: search_spotify failed: HTTP Error 403: Forbidden" entries during UAT (21:37:41 - 21:38:34).
    - Zero log entries for start_radio because start_radio catches all exceptions silently without decky.logger calls.
  implication: Confirms the Steam Deck is running against a Spotify Development Mode app where /v1/search with limit > 10 returns HTTP 403 Forbidden (bypassing search_spotify's 400-only retry and silently failing in start_radio).

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: "Spotify Development Mode blocks Tier 2 (/v1/recommendations -> 404/403), blocks Tier 3 (/v1/artists/{id}/top-tracks -> 403), and rejects Tier 3 (/v1/search with limit=25 -> 400/403 because Dev Mode caps search limit at 10); combined with start_radio in py_modules/rpc_playback.py having Tier 1 stubbed, no limit=10 retry or artist-albums fallback in Tier 3, and silent exception swallowing that leaves candidate_uris empty."
fix:
verification:
files_changed: []
