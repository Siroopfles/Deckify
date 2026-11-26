---
status: complete
phase: 26-unified-cdp-platform-bridge-deep-discovery-2-0
source: [26-VERIFICATION.md, 26-08-SUMMARY.md, 26-09-SUMMARY.md]
started: 2026-11-25T18:28:00Z
updated: 2026-11-26T15:11:53.200Z
---

## Current Test

[testing complete]

## Tests

### 1. Live Official Spotify Client CDP Mix Discovery, Your Blends, AI DJ & Cross-Engine librespot Playback (26-01..26-05, 26-08..26-09)
expected: On Steam Deck with spotify_client running, DiscoveryTab's Made For You carousel populates core mixes (Daylist, Discover Weekly, Release Radar, Daily Mixes, On Repeat) without Blend or editorial clutter; opening Daylist shows its dynamic custom title & description; Your Blends renders in its own carousel; Spotify AI DJ plays via CDP PlayerAPI.play on spotify_client, NowPlayingTab shows an AI DJ button and speaking indicator during AI DJ interludes, and shows 'Requires Official Spotify Client' on librespot; switching backend to librespot and clicking Refresh Feed preserves core mixes with ' · Cached' subtitles.
result: issue
reported: "Bij Made for you staat alleen de Discover Weekly. De rest ontbreekt allemaal. Blend staat wel in aparte rij. Kan daylist niet openen omdat ik die niet zie dus. Ik zie in de now playing tab een ai dj button maar ook als de AI dj playlist niet afgespeelt word zie ik die ook... dat is niet goed. Ook word het plaatje enzo niet geupdate als DJ X aan het word is naar het plaatje van dj x en staat er bijvoorbeeld niet \"Welcome\" of \"up next\" of iets anders wat er in de spotify client wel staat. Met Librespot geeft hij aan dat hij de official client nodig heeft"
severity: major

### 2. Live Tier 1 CDP Station Radio, SearchTab Browse Categories, Per-Section Load More & B-Button Clear (26-03, 26-04, 26-06)
expected: Starting Song Radio on spotify_client resolves native station tracks via CDP; on librespot it fast-fails without delay to Tier 2/3. In SearchTab, the 12 Gaming & Mood tiles appear at the top (with optional Browse Categories below on spotify_client), each result category has its own Load More row that expands only that category while keeping D-pad focus inside the section, and pressing B with a non-empty search query clears back to idle and shows 'A Select · B Clear Search · L1/R1 Tabs' before closing on a second B press.
result: issue
reported: "Start radio werkt op spotify client, op libre geeft hij error maar ik denk dat ik te veel api request gestuurd heb naar spotify. Search tab doet het ook even nog niet ofzo maar misschien ook door api rate limit? Dat b drukken met search werkt wel. Misschien moeten we ff gaan kijken waar alle api request vandaan komen en of dat meer gelimit kan worden maar ik denk dan heel de aplicatie breed"
severity: major

### 3. Steam Machine Boot / Wake Remote Phone Playback Guardrail (26-07 / G-26-3)
expected: Booting or waking the Steam Machine while Spotify is actively playing on a phone leaves phone playback uninterrupted; MPRIS2 does not advertise Playing or forward OS Pause/Stop signals, _poll_playback does not snapshot was_playing=True, handle_wake_recovery yields with remote_active, and SoundtrackManager unbound pause policy skips remote devices.
result: skipped
reason: "Cannot test right now due to API rate limit; requested code/debug check"

## Summary

total: 3
passed: 0
issues: 2
pending: 0
skipped: 1
blocked: 0

## Gaps

- gap_id: G-26-1
  truth: "On Steam Deck with spotify_client running, DiscoveryTab's Made For You carousel populates core mixes (Daylist, Discover Weekly, Release Radar, Daily Mixes, On Repeat) without Blend or editorial clutter; Your Blends renders in its own carousel; Spotify AI DJ plays via CDP PlayerAPI.play on spotify_client and shows 'Requires Official Spotify Client' on librespot; switching backend to librespot and clicking Refresh Feed preserves core mixes with ' · Cached' subtitles."
  status: resolved
  resolved_by: 26-09-PLAN.md
  resolved_at: 2026-11-26
  reason: "User reported: Ik zag gisteren alleen de daylist en ai dj apart. Maar als ik de daylist open pakt hij niet de custom titel die eraan gekoppeld zit. De Ai Dj list als ik die afspeel gaf hij niet aan als ai dj aan het woord was in de now playing tab en er was geen ai dj button op nowplaying om op te klikken. Voor de rest zag ik de andere playlisten niet"
  severity: major
  test: 1
  root_cause: "Four interrelated Phase 26 gaps: (1) cdp_fetch_discovery_mixes in py_modules/cdp_bridge.py does not unwrap GraphQL PlaylistResponseWrapper nodes (node.data / ownerV2.data / images.items) and omits 'on repeat', dropping HomeAPI/SearchAPI core mixes; (2) cdp_get_playlist_tracks and rpc_library.get_playlist_tracks do not return playlist name/description, and handleOpenPlaylist in DeckifyExpandedModal.tsx only updates is_mixed; (3) _poll_playback in main.py short-circuits when item is None during AI DJ voice interludes without querying CDP PlayerAPI.getState() or exposing AI DJ speaking state in get_status; (4) NowPlayingTab.tsx and DeckifyExpandedModal.tsx have no AI DJ button or speaking indicator."
  artifacts:
    - path: "py_modules/cdp_bridge.py"
      issue: "extractHomeSections/SearchAPI miss GraphQL .data unwrapping and 'on repeat'; cdp_get_playlist_tracks omits playlist metadata; no CDP AI DJ state/nudge helper."
    - path: "py_modules/rpc_library.py"
      issue: "Core mix checks omit 'on repeat'; get_playlist_tracks does not return playlist_name/description."
    - path: "main.py"
      issue: "_poll_playback returns early when item is None during AI DJ voice interludes; get_status omits AI DJ active/speaking state."
    - path: "src/components/DeckifyExpandedModal.tsx"
      issue: "handleOpenPlaylist does not update activePlaylist.name/description; no AI DJ handler passed to NowPlayingTab."
    - path: "src/components/tabs/NowPlayingTab.tsx"
      issue: "Missing AI DJ speaking indicator and AI DJ button."
  missing:
    - "Unwrap GraphQL ResponseWrapper nodes and include 'on repeat' in cdp_fetch_discovery_mixes and rpc_library."
    - "Return playlist_name/description from cdp_get_playlist_tracks and get_playlist_tracks and update activePlaylist in handleOpenPlaylist."
    - "Detect AI DJ speaking state in _poll_playback / get_status and render an AI DJ speaking indicator and AI DJ button in NowPlayingTab."
  debug_session: ".planning/debug/discovery-missing-made-for-you-mixes-daylist-title-and-ai-dj-now-playing.md"

- gap_id: G-26-2
  truth: "On Steam Deck with spotify_client running, DiscoveryTab's Made For You carousel populates core mixes (Daylist, Discover Weekly, Release Radar, Daily Mixes, On Repeat) without Blend or editorial clutter; opening Daylist shows its dynamic custom title & description; Your Blends renders in its own carousel; Spotify AI DJ plays via CDP PlayerAPI.play on spotify_client, NowPlayingTab shows an AI DJ button and speaking indicator during AI DJ interludes, and shows 'Requires Official Spotify Client' on librespot."
  status: failed
  reason: "User reported: Bij Made for you staat alleen de Discover Weekly. De rest ontbreekt allemaal. Blend staat wel in aparte rij. Kan daylist niet openen omdat ik die niet zie dus. Ik zie in de now playing tab een ai dj button maar ook als de AI dj playlist niet afgespeelt word zie ik die ook... dat is niet goed. Ook word het plaatje enzo niet geupdate als DJ X aan het word is naar het plaatje van dj x en staat er bijvoorbeeld niet \"Welcome\" of \"up next\" of iets anders wat er in de spotify client wel staat. Met Librespot geeft hij aan dat hij de official client nodig heeft"
  severity: major
  test: 1
  artifacts: []
  missing: []

- gap_id: G-26-3
  truth: "Starting Song Radio on spotify_client resolves native station tracks via CDP; on librespot it fast-fails without delay to Tier 2/3. In SearchTab, the 12 Gaming & Mood tiles appear at the top (with optional Browse Categories below on spotify_client), each result category has its own Load More row that expands only that category while keeping D-pad focus inside the section, and pressing B with a non-empty search query clears back to idle and shows 'A Select · B Clear Search · L1/R1 Tabs' before closing on a second B press."
  status: failed
  reason: "User reported: Start radio werkt op spotify client, op libre geeft hij error maar ik denk dat ik te veel api request gestuurd heb naar spotify. Search tab doet het ook even nog niet ofzo maar misschien ook door api rate limit? Dat b drukken met search werkt wel. Misschien moeten we ff gaan kijken waar alle api request vandaan komen en of dat meer gelimit kan worden maar ik denk dan heel de aplicatie breed"
  severity: major
  test: 2
  artifacts: []
  missing: []
