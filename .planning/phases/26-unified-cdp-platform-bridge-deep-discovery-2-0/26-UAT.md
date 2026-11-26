---
status: diagnosed
phase: 26-unified-cdp-platform-bridge-deep-discovery-2-0
source: [26-VERIFICATION.md, 26-10-SUMMARY.md, 26-11-SUMMARY.md, 26-12-SUMMARY.md, 26-13-SUMMARY.md, 26-14-SUMMARY.md]
started: 2026-11-26T20:12:30Z
updated: 2026-11-26T19:33:13.377Z
---

## Current Test

[testing complete]

## Tests

### 1. Live Official Spotify Client CDP Mix Discovery, Your Blends, AI DJ & Cross-Engine librespot Playback (26-01..26-05, 26-08..26-10, 26-12..26-14)
expected: On Steam Machine / Steam Deck with spotify_client running, DiscoveryTab's Made For You carousel populates core mixes (Daylist, Discover Weekly, Release Radar, Daily Mixes, On Repeat) without Blend or editorial clutter; opening Daylist shows its dynamic custom title & clean description without HTML tags; Your Blends renders in its own carousel; the AI DJ button in NowPlayingTab is hidden when AI DJ is not active and visible during AI DJ playback with DJ X interlude cover art & live Welcome / Up next / vibe title & subtitle updates; switching backend to librespot re-fetches DiscoveryTab with ' · Cached' subtitles and plays Daylist cleanly without 403 Restriction violated.
result: issue
reported: "Daylist en discover weekly en release radar zie ik de rest niet | Ik zie zie tekst in de daylist desc en title goed. | Ik zie alleeen de dj mode is als de next up moment van de dj is werkt niet altijd voornamelijk die later na paar nummers is | Ohja en geen playbackbar tijdens weclcome next up events"
severity: major

### 2. Live Tier 1 CDP Station Radio, SearchTab Browse Categories, Per-Section Load More & B-Button Clear (26-03, 26-04, 26-06, 26-11, 26-12, 26-13)
expected: Starting Song Radio on spotify_client resolves native station tracks via CDP and starts playback cleanly (even if SteamMachine starts inactive); on librespot it works without 429 rate-limit storms. In SearchTab, the 12 Gaming & Mood tiles appear at the top (with live Browse Categories below on spotify_client), searching works cleanly via CDP on spotify_client, each result category has its own Load More row that expands only that category while keeping D-pad focus inside the section, and pressing B with a non-empty search query clears back to idle and shows 'A Select · B Clear Search · L1/R1 Tabs' before closing on a second B press.
result: issue
reported: "De search 12 mood bars werken niet vinden niks | Load more werkt bij alles ja | B werkt | Ik zie alleen de browse live catogories nog niet :("
severity: major

### 3. Steam Machine Boot / Wake Remote Phone Playback Guardrail (26-07)
expected: Booting or waking the Steam Machine while Spotify is actively playing on a phone leaves phone playback uninterrupted; MPRIS2 does not advertise Playing or forward OS Pause/Stop signals, _poll_playback does not snapshot was_playing=True, handle_wake_recovery yields with remote_active, and SoundtrackManager unbound pause policy skips remote devices.
result: pass

## Summary

total: 3
passed: 1
issues: 2
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-26-10
  truth: "DiscoveryTab Made For You carousel populates all core mixes (Daylist, Discover Weekly, Release Radar, Daily Mixes, On Repeat)"
  status: failed
  reason: "User reported: Daylist en discover weekly en release radar zie ik de rest niet"
  severity: major
  test: 1
  root_cause: "Three compounding defects: (1) cdp_fetch_discovery_mixes relies on RecentlyPlayedAPI/RootlistAPI (which omit unfollowed Daily Mixes and On Repeat) and its Pathfinder home query yields no sections on Spotify 1.2.95.453; (2) cdp_fetch_discovery_mixes SearchAPI fallback omits query/types and does not unwrap searchV2; (3) Plan 26-14 disabled _search_missing_core_mixes whenever cdp_active is True."
  artifacts:
    - path: "py_modules/cdp_bridge.py"
      issue: "cdp_fetch_discovery_mixes Pathfinder home query (890-945) and SearchAPI call/unwrapping (986-1017)"
    - path: "py_modules/rpc_library.py"
      issue: "_fetch_made_for_you_section (2080) skips _search_missing_core_mixes whenever cdp_active is True"
  missing:
    - "Align cdp_fetch_discovery_mixes SearchAPI fallback with cdp_search_spotify (query/types + searchV2 unwrapping) and only skip _search_missing_core_mixes when all 5 core mix families are present"
  debug_session: .planning/debug/g-26-10-missing-daily-mixes-on-repeat.md

- gap_id: G-26-11
  truth: "AI DJ interlude displays live DJ X 'Welcome' / 'Up next' / vibe title & subtitle updates reliably, including later interludes after several tracks"
  status: failed
  reason: "User reported: Ik zie alleeen de dj mode is als de next up moment van de dj is werkt niet altijd voornamelijk die later na paar nummers is"
  severity: major
  test: 1
  root_cause: "main.py:_poll_playback overwrites _ai_dj_active from Web API context (which is often null during AI DJ tracks) and gates _cdp_get_player_state too narrowly (missing later interludes when Web API still holds previous track or non-unknown type); cdp_get_player_state has narrow isDjContext/isDjInterlude checks and DOM fallback only runs when !title || !subtitle; usePlaybackStatus.ts does not subscribe to ai_dj_state."
  artifacts:
    - path: "main.py"
      issue: "_poll_playback (2346-2452) Web API gating & _ai_dj_active overwrite"
    - path: "py_modules/cdp_bridge.py"
      issue: "cdp_get_player_state (547-620) narrow isDjContext, isDjInterlude, and DOM fallback"
    - path: "src/hooks/usePlaybackStatus.ts"
      issue: "subscribeDeckyPlaybackEvents (88-122) missing ai_dj_state listener"
  missing:
    - "Query _cdp_get_player_state directly when AI DJ is active or spotify_client is running, broaden isDjContext/isDjInterlude/DOM extraction in cdp_get_player_state, and subscribe to ai_dj_state in usePlaybackStatus.ts"
  debug_session: .planning/debug/g-26-11-ai-dj-later-interludes.md

- gap_id: G-26-12
  truth: "Playback progress bar is visible and updates during AI DJ 'Welcome' / 'Up next' interlude events"
  status: failed
  reason: "User reported: Ohja en geen playbackbar tijdens weclcome next up events"
  severity: minor
  test: 1
  root_cause: "cdp_get_player_state() does not extract duration_ms or position_ms from PlayerAPI.getState(), and main.py:_poll_playback() hardcodes duration_ms: 0 in interlude_meta and returns True early before updating _poll_progress_ms/_poll_duration_ms/_last_event or emitting librespot_event playing, causing all progress bars (which gate on duration_ms > 0) to stay hidden."
  artifacts:
    - path: "py_modules/cdp_bridge.py"
      issue: "cdp_get_player_state (530-649) omits duration_ms and position_ms"
    - path: "main.py"
      issue: "_poll_playback interlude branch (2391-2424) hardcodes duration_ms: 0 and returns early"
  missing:
    - "Extract duration_ms and position_ms in cdp_get_player_state and populate _poll_progress_ms/_poll_duration_ms/_last_event + librespot_event playing in _poll_playback"
  debug_session: .planning/debug/g-26-12-ai-dj-playbackbar-missing.md

- gap_id: G-26-13
  truth: "Clicking any of the 12 Gaming & Mood tiles in SearchTab returns matching search/category results"
  status: failed
  reason: "User reported: De search 12 mood bars werken niet vinden niks"
  severity: major
  test: 2
  root_cause: "In useSearchController (SearchTab.tsx), handleSelectTile/handleSelectHistory calls resetPaging() (epoch=N+1), setSearchQuery(tile.query), and runSearch(tile.query). When React commits searchQuery, useEffect (883-905) calls resetPaging() at line 892 (epoch=N+2) BEFORE checking skipNextDebounceRef.current === searchQuery at line 899, causing runSearch to abort on epoch mismatch (N+2 !== N+1) and discard its results."
  artifacts:
    - path: "src/components/tabs/SearchTab.tsx"
      issue: "useSearchController useEffect (883-905) calls resetPaging() before checking skipNextDebounceRef.current === searchQuery"
  missing:
    - "Check skipNextDebounceRef.current === searchQuery and return early before calling resetPaging() in useSearchController's useEffect"
  debug_session: .planning/debug/g-26-13-search-mood-tiles-empty.md

- gap_id: G-26-14
  truth: "SearchTab renders live Browse Categories below the 12 Mood tiles when spotify_client is running"
  status: failed
  reason: "User reported: Ik zie alleen de browse live catogories nog niet :("
  severity: minor
  test: 2
  root_cause: "cdp_fetch_browse_categories (py_modules/cdp_bridge.py:1149-1282) silently returns [] on Spotify 1.2.95.453 because Cosmos.post is not unwrapped from {status, body}, raw fetch omits client-token and uses an unverified sha256Hash, extractBrowseNodes misses cardRepresentation, and there is no REST /v1/browse/categories fallback; SearchTab.tsx:1000-1028 also latches fetchedBrowseRef=true on empty results."
  artifacts:
    - path: "py_modules/cdp_bridge.py"
      issue: "cdp_fetch_browse_categories (1149-1282) Pathfinder/Cosmos/fetch silent failure"
    - path: "src/components/tabs/SearchTab.tsx"
      issue: "fetchedBrowseRef (999-1028) latches true even when get_search_browse_categories returns []"
  missing:
    - "Add REST /v1/browse/categories fallback using TokenProvider.loadToken(), unwrap Cosmos/cardRepresentation responses, and allow SearchTab to retry when previous categories were empty"
  debug_session: .planning/debug/g-26-14-browse-categories-missing.md
