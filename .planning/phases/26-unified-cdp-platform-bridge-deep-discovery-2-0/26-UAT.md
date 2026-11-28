---
status: diagnosed
phase: 26-unified-cdp-platform-bridge-deep-discovery-2-0
source: [26-VERIFICATION.md, 26-15-SUMMARY.md, 26-16-SUMMARY.md, 26-17-SUMMARY.md]
started: 2026-11-28T12:16:30Z
updated: 2026-11-28T12:30:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Live Official Spotify Client CDP Mix Discovery, Daily Mixes / On Repeat, HTML-Free Daylist & Backend Switching
expected: Op Steam Deck / Steam Machine met spotify_client actief: DiscoveryTab Made For You toont alle 5 core mix families (Daylist, Discover Weekly, Release Radar, Daily Mixes, On Repeat) zonder rauwe HTML tags; switchen naar librespot ververst DiscoveryTab direct met " · Cached" subtitels en speelt Daylist zonder 403 Restriction violated.
result: issue
reported: "Ik zie daylist discover weekly en release radar maar daily mixes en on repeat niet en de html tags staan niet in de desc | Player command failed: Restriction violated bij daylist in librespot ik zie ook ' · Cached' niet staan"
severity: major

### 2. Live SearchTab Gaming & Mood Tiles, Browse Categories Retry & Per-Section Load More
expected: Op Steam Deck / Steam Machine met spotify_client actief: klikken op de 12 Gaming & Mood tiles of een Recent Searches pill toont direct zoekresultaten (geen 'No Results Found'); live Browse Categories verschijnen onder de 12 tiles (en proberen opnieuw bij terugkeer naar idle als leeg); Load More per sectie behoudt D-pad focus en eerste B-druk wist de zoekopdracht.
result: issue
reported: "1. Alles vind wel iets ja | 2. Onder 12 tiles staat helemaal niets | 3. Ja werkt"
severity: minor

### 3. Live Spotify AI DJ Cross-Track Interludes, Progress Bar & Inactive-Device Song Radio
expected: Start Spotify AI DJ en bekijk NowPlayingTab, QAM en DeckifyOverlay bij zowel het eerste als latere DJ X interlude-momenten (Welcome / Up next / vibe); de playback-voortgangsbalk is zichtbaar en loopt mee tijdens interludes, "Next DJ Vibe" blijft zichtbaar tussen nummers, en Song Radio start schoon wanneer SteamMachine/librespot inactief is.
result: issue
reported: "1. Start ja en werkt bij latere momenten alleen update hij niet gelijk met kleine delay en blijft af en toe hangen op dj X momenten als het nummer ook al bezig is | 2. Geen voortgangsbalk zichtbaar bij DJ X momenten | 3. Ja song radio werkt"
severity: major

### 4. Steam Machine Boot / Wake Remote Phone Playback Guardrail
expected: Speel Spotify af op je telefoon en boot of wake de Steam Machine met Deckify actief; telefoon-playback loopt ongestoord door zonder pauze of ongewenste overname.
result: skipped
reason: "User could not test right now (previously passed in round 1)."

## Summary

total: 4
passed: 0
issues: 3
pending: 0
skipped: 1
blocked: 0

## Gaps

- gap_id: G-26-15
  truth: "DiscoveryTab Made For You populates Daily Mixes and On Repeat alongside Daylist, Discover Weekly, and Release Radar"
  status: failed
  reason: "User reported: Ik zie daylist discover weekly en release radar maar daily mixes en on repeat niet"
  severity: major
  test: 1
  root_cause: "RecentlyPlayedAPI/RootlistAPI/me/playlists only return followed or recently played mixes; Pathfinder home query uses stale sha256Hash without client-token; SearchAPI/Web API /v1/search do not return personalized Daily Mixes or On Repeat."
  artifacts:
    - path: "py_modules/cdp_bridge.py"
      issue: "cdp_fetch_discovery_mixes (808-1137) Pathfinder home/HomeAPI/GraphQL/SearchAPI fail to surface unfollowed Daily Mixes and On Repeat"
    - path: "py_modules/rpc_library.py"
      issue: "_search_missing_core_mixes (1972-2023) relies on public /v1/search which omits personalized Made For You mixes"

- gap_id: G-26-16
  truth: "Switching to librespot shows ' · Cached' subtitles in DiscoveryTab and plays Daylist cleanly without 403 Restriction violated"
  status: failed
  reason: "User reported: Player command failed: Restriction violated bij daylist in librespot ik zie ook ' · Cached' niet staan"
  severity: major
  test: 1
  root_cause: "(1) _fetch_made_for_you_section combines combined (web_mixes without ' · Cached') before cached_raw in _partition_discovery_mixes(combined + cached_raw), so _sort_algorithmic_mixes deduplication drops ' · Cached' when web_mixes already has a subtitle; (2) get_playlist_tracks Web API 200 OK path (line 356) never calls _refresh_cached_mix_tracks, and _refresh_cached_mix_tracks silently ignores mixes not already in discovery_mixes.json, leaving _resolve_cached_mix_uris empty on play_tracks."
  artifacts:
    - path: "py_modules/rpc_library.py"
      issue: "_fetch_made_for_you_section (2155-2168), _sort_algorithmic_mixes (1926-1932), get_playlist_tracks (356), _refresh_cached_mix_tracks (143-169)"
    - path: "py_modules/rpc_playback.py"
      issue: "play_tracks (887-903) falls back to context_uri when _resolve_cached_mix_uris returns []"

- gap_id: G-26-17
  truth: "SearchTab renders live Browse Categories below the 12 Gaming & Mood tiles when spotify_client is running"
  status: failed
  reason: "User reported: Onder 12 tiles staat helemaal niets"
  severity: minor
  test: 2
  root_cause: "cdp_fetch_browse_categories (cdp_bridge.py:1227-1404) passes cardRepresentation (missing parent uri/id) into pushCat which drops it, uses a hardcoded Pathfinder browseAll sha256Hash, and shares a 4.0s timeout across sequential fallbacks; get_search_browse_categories has no Web API fallback; SearchTab useBrowseCategories never retries unless hasQuery/travelModeEnabled changes."
  artifacts:
    - path: "py_modules/cdp_bridge.py"
      issue: "cdp_fetch_browse_categories (1227-1404) cardRepresentation uri/id drop + Pathfinder browseAll"
    - path: "py_modules/rpc_library.py"
      issue: "get_search_browse_categories (2496-2507) missing backend Web API fallback"
    - path: "src/components/tabs/SearchTab.tsx"
      issue: "useBrowseCategories (1086-1123) does not re-trigger after empty response"

- gap_id: G-26-18
  truth: "AI DJ clears DJ X interlude metadata immediately when a music track starts and displays an advancing progress bar during DJ X interludes"
  status: failed
  reason: "User reported: blijft af en toe hangen op dj X momenten als het nummer ook al bezig is | Geen voortgangsbalk zichtbaar bij DJ X momenten"
  severity: major
  test: 3
  root_cause: "(1) cdp_get_player_state (cdp_bridge.py:550-562) sets isDjInterlude=true without gating out regular spotify:track:* items with mediaType==='track', and main.py:_poll_playback (2405) enters the interlude branch even when /me/player already has a valid track item, without updating _poll_track_id or emitting ai_dj_state on track return; (2) PlayerAPI.getState() returns duration_ms=0 during DJ X narration (no DOM [data-testid='playback-duration'] fallback), and NowPlayingTab/QAM/usePlaybackStatus hide the progress bar whenever duration_ms <= 0."
  artifacts:
    - path: "py_modules/cdp_bridge.py"
      issue: "cdp_get_player_state (550-574) isDjInterlude false-positive on tracks & missing DOM duration fallback"
    - path: "main.py"
      issue: "_poll_playback (2405-2481) interlude branch overrides valid /me/player track and skips _poll_track_id / ai_dj_state sync"
    - path: "src/components/tabs/NowPlayingTab.tsx"
      issue: "ProgressScrubBar gated on track.duration_ms > 0 (698-705)"
    - path: "src/index.tsx"
      issue: "QAM progress slider gated on durationSec > 0 (1617)"
