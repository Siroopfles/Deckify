---
status: diagnosed
phase: 25-universal-artist-album-drill-down-instant-radio-search-2-0
source: [25-VERIFICATION.md]
started: 2026-11-23T20:36:00Z
updated: 2026-11-23T20:43:39.178Z
---

## Current Test

[testing complete]

## Tests

### 1. Long artist names, album titles, episode titles, and search history pills truncation in SteamOS GamepadUI
expected: Ellipsis truncation (minWidth: 0, overflow: hidden, textOverflow: ellipsis, whiteSpace: nowrap; maxWidth: 220 on history pills) prevents action buttons from clipping off-screen at 1280x800.
result: pass

### 2. ArtistsTab multi-section scroll and B-button focus restoration in SteamOS GamepadUI
expected: Drilling into an Artist from NowPlayingTab/QueueTab/SearchTab, scrolling through Top Tracks / Albums & Singles / All Tracks, and pressing B restores the exact originating tab, scrollTop, and focused item.
result: pass

### 3. SearchTab 7 filter chips and 3x4 Gaming & Mood tile grid D-pad navigation without virtual keyboard
expected: Opening SearchTab with empty query shows Recent Searches pills (Y/x delete + Clear All) and 12 Gaming & Mood tiles in 3x4 horizontal rows; selecting a tile runs a curated search with Playlists first without opening SteamOS virtual keyboard.
result: issue
reported: "Ik kan uberhaupt niks zoeken hij vind helemaal niks dus kan het moeilijk testen allemaal"
severity: blocker

### 4. Live 3-tier Song/Artist/Album Radio on both spotify_client and librespot
expected: Starting Song Radio plays the seed track immediately and replaces the upcoming queue; Artist Radio and Album Radio start radio playback with a single toast on success.
result: issue
reported: "Start ook niet"
severity: blocker

## Summary

total: 4
passed: 2
issues: 2
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-25-3
  truth: "Opening SearchTab with empty query shows Recent Searches pills (Y/x delete + Clear All) and 12 Gaming & Mood tiles in 3x4 horizontal rows; selecting a tile runs a curated search with Playlists first without opening SteamOS virtual keyboard."
  status: failed
  reason: "User reported: Ik kan uberhaupt niks zoeken hij vind helemaal niks dus kan het moeilijk testen allemaal"
  severity: blocker
  test: 3
  root_cause: "search_spotify in py_modules/rpc_library.py sends market='from_token' on GET /v1/search while SPOTIFY_SCOPES omits user-read-private, causing HTTP 403 Insufficient client scope on every search; additionally SearchTab searchLimit=25 exceeds Spotify Dev Mode's limit<=10 cap (HTTP 400 Invalid limit) and SearchTab shows 'No Results Found' on !res.ok instead of an error."
  artifacts:
    - path: "py_modules/rpc_library.py"
      issue: "search_spotify passes market='from_token' on both primary and fallback requests and defaults limit=50"
    - path: "py_modules/common.py"
      issue: "SPOTIFY_SCOPES omits user-read-private"
    - path: "src/components/tabs/SearchTab.tsx"
      issue: "Initializes searchLimit=25 (exceeding Dev Mode limit=10) and renders No Results Found on !res.ok"
  missing:
    - "Remove market='from_token' from search_spotify in py_modules/rpc_library.py"
    - "Cap/default searchLimit to 10 in SearchTab.tsx and paginate via offset instead of limit > 10"
    - "Surface an explicit error state/banner in SearchTab.tsx when search_spotify returns ok: false"
  debug_session: ".planning/debug/search-2-0-returns-no-results.md"

- gap_id: G-25-4
  truth: "Starting Song Radio plays the seed track immediately and replaces the upcoming queue; Artist Radio and Album Radio start radio playback with a single toast on success."
  status: failed
  reason: "User reported: Start ook niet"
  severity: blocker
  test: 4
  root_cause: "Spotify Development Mode blocks Tier 2 (/v1/recommendations -> 404/403), blocks Tier 3 (/v1/artists/{id}/top-tracks -> 403), and rejects Tier 3 (/v1/search with limit=25 -> 400/403 because Dev Mode caps search limit at 10); start_radio in py_modules/rpc_playback.py has Tier 1 stubbed, no limit=10 cap or artists/{id}/albums fallback in Tier 3, and silently swallows exceptions."
  artifacts:
    - path: "py_modules/rpc_playback.py"
      issue: "start_radio hardcodes limit=25 on /v1/search, lacks artists/{id}/albums fallback, and silently swallows Tier 2/3 exceptions"
  missing:
    - "Cap Tier 3 /v1/search limit to 10 in start_radio"
    - "Add artists/{id}/albums + albums/{id}/tracks fallback (limit=10) in start_radio Tier 3 when top-tracks and search fail or return too few tracks"
    - "Log Tier 2/3 fallback exceptions at debug/warning level instead of silently swallowing them"
  debug_session: ".planning/debug/radio-fails-to-start.md"
