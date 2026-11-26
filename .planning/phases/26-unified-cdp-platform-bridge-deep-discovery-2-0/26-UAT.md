---
status: diagnosed
phase: 26-unified-cdp-platform-bridge-deep-discovery-2-0
source: [26-VERIFICATION.md]
started: 2026-11-25T18:28:00Z
updated: 2026-11-26T08:28:30Z
---

## Current Test

[testing complete]

## Tests

### 1. Live Official Spotify Client CDP Mix Discovery, Your Blends, AI DJ & Cross-Engine librespot Playback (26-01..26-05)
expected: On Steam Deck with spotify_client running, DiscoveryTab's Made For You carousel populates core mixes (Daylist, Discover Weekly, Release Radar, Daily Mixes, On Repeat) without Blend or editorial clutter; Your Blends renders in its own carousel; Spotify AI DJ plays via CDP PlayerAPI.play on spotify_client and shows 'Requires Official Spotify Client' on librespot; switching backend to librespot and clicking Refresh Feed preserves core mixes with ' · Cached' subtitles.
result: issue
reported: "Ik zag gisteren alleen de daylist en ai dj apart. Maar als ik de daylist open pakt hij niet de custom titel die eraan gekoppeld zit. De Ai Dj list als ik die afspeel gaf hij niet aan als ai dj aan het woord was in de now playing tab en er was geen ai dj button op nowplaying om op te klikken. Voor de rest zag ik de andere playlisten niet"
severity: major

### 2. Live Tier 1 CDP Station Radio, SearchTab Browse Categories, Per-Section Load More & B-Button Clear (26-03, 26-04, 26-06)
expected: Starting Song Radio on spotify_client resolves native station tracks via CDP; on librespot it fast-fails without delay to Tier 2/3. In SearchTab, the 12 Gaming & Mood tiles appear at the top (with optional Browse Categories below on spotify_client), each result category has its own Load More row that expands only that category while keeping D-pad focus inside the section, and pressing B with a non-empty search query clears back to idle and shows 'A Select · B Clear Search · L1/R1 Tabs' before closing on a second B press.
result: skipped
reason: "User could not test yet; requested re-test later and double-check for bugs"

### 3. Steam Machine Boot / Wake Remote Phone Playback Guardrail (26-07 / G-26-3)
expected: Booting or waking the Steam Machine while Spotify is actively playing on a phone leaves phone playback uninterrupted; MPRIS2 does not advertise Playing or forward OS Pause/Stop signals, _poll_playback does not snapshot was_playing=True, handle_wake_recovery yields with remote_active, and SoundtrackManager unbound pause policy skips remote devices.
result: skipped
reason: "User could not test yet"

## Summary

total: 3
passed: 0
issues: 1
pending: 0
skipped: 2
blocked: 0

## Gaps

- gap_id: G-26-1
  truth: "On Steam Deck with spotify_client running, DiscoveryTab's Made For You carousel populates core mixes (Daylist, Discover Weekly, Release Radar, Daily Mixes, On Repeat) without Blend or editorial clutter; Your Blends renders in its own carousel; Spotify AI DJ plays via CDP PlayerAPI.play on spotify_client and shows 'Requires Official Spotify Client' on librespot; switching backend to librespot and clicking Refresh Feed preserves core mixes with ' · Cached' subtitles."
  status: failed
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
