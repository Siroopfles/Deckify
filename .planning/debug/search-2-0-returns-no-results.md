---
status: diagnosed
trigger: "search-2-0-returns-no-results: Opening SearchTab with empty query shows Recent Searches pills (Y/x delete + Clear All) and 12 Gaming & Mood tiles in 3x4 horizontal rows; selecting a tile runs a curated search with Playlists first without opening SteamOS virtual keyboard."
created: 2026-11-23T20:43:46Z
updated: 2026-11-23T20:46:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

bug_class: Bohrbug (deterministic)
hypothesis: "search_spotify in py_modules/rpc_library.py passes market='from_token' on GET /v1/search, which requires the user-read-private OAuth scope that is absent from SPOTIFY_SCOPES in py_modules/common.py, causing Spotify to reject every search with HTTP 403 Insufficient client scope."
test: "Confirmed against live Steam Deck logs and direct /v1/search parameter matrix."
expecting: "Confirmed root cause."
next_action: "Return ROOT CAUSE FOUND to orchestrator (goal: find_root_cause_only)."
candidate_causes:
  - "code: py_modules/rpc_library.py passes market='from_token' to /v1/search; SearchTab.tsx leaves searchResults={} on !res.ok so UI shows 'No Results Found'."
  - "config/auth: py_modules/common.py SPOTIFY_SCOPES omits 'user-read-private' required by Spotify for market='from_token'."
and_gate: "yes — passing market='from_token' in rpc_library.py AND omitting 'user-read-private' from SPOTIFY_SCOPES in common.py together cause HTTP 403 Insufficient client scope on every search."

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: Opening SearchTab with empty query shows Recent Searches pills (Y/x delete + Clear All) and 12 Gaming & Mood tiles in 3x4 horizontal rows; selecting a tile runs a curated search with Playlists first without opening SteamOS virtual keyboard.
actual: Ik kan uberhaupt niks zoeken hij vind helemaal niks dus kan het moeilijk testen allemaal
errors: None reported
reproduction: Test 3 in UAT
started: Discovered during UAT

## Eliminated
<!-- APPEND only - prevents re-investigating -->

- hypothesis: "multi-type search with show,episode causes Spotify /v1/search to fail or return empty"
  evidence: "Direct test on Steam Deck with type=track,artist,album,playlist,show,episode, limit=10, no market returned HTTP 200 with 10 items per type."
  timestamp: 2026-11-23T20:45:46Z

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-11-23T20:44:13Z
  checked: py_modules/rpc_library.py:1094-1258 (search_spotify) and git show 455011f
  found: Commit 455011f added "market": "from_token" to both the primary _spotify_api_request("search", ...) call (line 1126) and the 400/Invalid limit fallback call (line 1138).
  implication: Every /v1/search call now sends market=from_token.

- timestamp: 2026-11-23T20:44:19Z
  checked: src/components/tabs/SearchTab.tsx:531-538, 590-605, 609, 636
  found: SearchTab initializes searchLimit=25. When backendSearchSpotify returns {ok: false}, executeSearchQuery calls onError() (toast only) and leaves searchResults as {}, causing SearchResultsView (!loadingSearch && !visibleAny) to render "No Results Found".
  implication: Backend 4xx errors appear to the user as "No Results Found" ("hij vind helemaal niks").

- timestamp: 2026-11-23T20:44:57Z
  checked: Steam Deck log /home/deck/homebrew/logs/Deckify/2026-11-23 21.34.10.log
  found: 10 consecutive "[ERROR]: search_spotify failed: HTTP Error 403: Forbidden" entries during UAT at 21:37:41-21:38:34.
  implication: search_spotify is failing with HTTP 403 Forbidden on the Steam Deck, not 400 or empty results.

- timestamp: 2026-11-23T20:45:08Z
  checked: py_modules/common.py:188-195 (SPOTIFY_SCOPES)
  found: SPOTIFY_SCOPES contains user-read-currently-playing, user-read-playback-state, user-modify-playback-state, playlist-read-private, playlist-read-collaborative, playlist-modify-public, playlist-modify-private, user-library-read, user-library-modify, user-follow-read, user-read-recently-played, user-top-read, user-read-playback-position. It does NOT include "user-read-private".
  implication: Spotify Web API requires user-read-private when market=from_token is specified.

- timestamp: 2026-11-23T20:45:46Z
  checked: Live Spotify /v1/search parameter matrix on Steam Deck using active access_token
  found: |
    curr_25_market_all6 (limit=25, market=from_token, 6 types) -> 403 {"error": {"status": 403, "message": "Insufficient client scope"}}
    lim10_market_all6 (limit=10, market=from_token, 6 types) -> 403 {"error": {"status": 403, "message": "Insufficient client scope"}}
    lim25_nomarket_all6 (limit=25, no market, 6 types) -> 400 {"error": {"status": 400, "message": "Invalid limit"}}
    lim10_nomarket_all6 (limit=10, no market, 6 types) -> 200 {'tracks': 10, 'artists': 10, 'albums': 10, 'playlists': 10, 'shows': 10, 'episodes': 10}
    lim10_nomarket_4types (limit=10, no market, 4 types) -> 200 {'tracks': 10, 'artists': 10, 'albums': 10, 'playlists': 10}
  implication: Removing market="from_token" and using limit <= 10 immediately restores HTTP 200 with all 6 entity types populated.

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: "search_spotify in py_modules/rpc_library.py sends market='from_token' on GET /v1/search while SPOTIFY_SCOPES in py_modules/common.py omits 'user-read-private', causing Spotify to reject every search with HTTP 403 ('Insufficient client scope'); additionally, SearchTab.tsx sends limit=25 (exceeding Spotify Dev Mode's limit=10 cap, which returns HTTP 400 'Invalid limit' when market is omitted) and renders 'No Results Found' when res.ok is false."
fix: ""
verification: ""
files_changed: []
