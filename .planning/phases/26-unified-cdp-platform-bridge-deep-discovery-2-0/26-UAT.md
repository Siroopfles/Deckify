---
status: diagnosed
phase: 26-unified-cdp-platform-bridge-deep-discovery-2-0
source: [26-VERIFICATION.md]
started: 2026-11-24T18:50:06Z
updated: 2026-11-25T17:56:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Live Official Spotify Client CDP Mix Discovery & Cross-Engine `librespot` Playback
expected: Switch engine to `spotify_client`, open `DiscoveryTab` to verify *Made For You* populates personalized mixes (*Daylist*, *Discover Weekly*, *Release Radar*, *Daily Mixes*), then switch to `librespot` + click *Refresh Feed* and confirm mixes remain with `" · Cached"` subtitles, tracklist browsing works in `PlaylistsTab`, and playback works via direct play, `Y` "Play Now", and Pinned QAM Pills.
result: issue
reported: "Daylist doet het ja, Ik zie alleen heel veel blends... dat is opzich okay maar zou misschien op een andere plek mogen. Discover Weekly, Release radar en Daily mixes zie ik te minsten helemaal niet maar dat kan misschien door de blends komen. Ik zie alleen ook de DJ playlist maar als ik die open werkt hij niet dat is ook de ai van spotify vgm maar kijk ff wat we daarvoor allemaal kunnen implementeren want ik iwl dat wel gebruiken"
severity: major

### 2. Live Tier 1 CDP Station Radio & `SearchTab` Browse Categories / `B`-Button Clear
expected: Verify `librespot` Song/Artist/Album Radio starts without port `9229` delay (falling back to Tier 2/3), `spotify_client` resolves native CDP station tracks, `SearchTab` keeps the 12 Gaming & Mood tiles at the top (with optional `Browse Categories` below on `spotify_client`), and pressing `B` with a non-empty `searchQuery` clears search back to idle (`"A Select · B Clear Search · L1/R1 Tabs"`) before closing on the second `B` press.
result: issue
reported: "Oh als ik op load more klik laad hij bij alles meer moet er niet per een load more balk of beter"
severity: major

## Summary

total: 2
passed: 0
issues: 2
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-26-1
  truth: "Switch engine to spotify_client, open DiscoveryTab to verify Made For You populates personalized mixes (Daylist, Discover Weekly, Release Radar, Daily Mixes), then switch to librespot + click Refresh Feed and confirm mixes remain with ' · Cached' subtitles, tracklist browsing works in PlaylistsTab, and playback works via direct play, Y 'Play Now', and Pinned QAM Pills."
  status: failed
  reason: "User reported: Daylist doet het ja, Ik zie alleen heel veel blends... dat is opzich okay maar zou misschien op een andere plek mogen. Discover Weekly, Release radar en Daily mixes zie ik te minsten helemaal niet maar dat kan misschien door de blends komen. Ik zie alleen ook de DJ playlist maar als ik die open werkt hij niet dat is ook de ai van spotify vgm maar kijk ff wat we daarvoor allemaal kunnen implementeren want ik iwl dat wel gebruiken"
  severity: major
  test: 1
  root_cause: "(a) Blends in Made For You: cdp_fetch_discovery_mixes treats any id starting with 37i9dQZF1 (plus bare 'dj'/'made for' name regex) as a mix with no kind tagging, and DiscoveryTab has only one carousel. (b) DW/RR/Daily Mix missing: HomeAPI (getHome/getSections) and GraphQL ({name:'home'}) probes use non-existent call shapes and swallow errors, so only RootlistAPI (saved library) returns items. (c) DJ broken: DJ (37i9dQZF1EYkqdzj48dyYq) is a dynamic session context with no static tracklist; opening it calls get_playlist_tracks which returns empty."
  artifacts:
    - path: "py_modules/cdp_bridge.py"
      issue: "Broken HomeAPI/GraphQL probes, too-broad owned/name filter, no kind tag, silent error swallowing"
    - path: "py_modules/rpc_library.py"
      issue: "_fetch_made_for_you_section has no split for Blends/DJ, wastes CDP prefetch on DJ/Blends, and get_playlist_tracks has no DJ handling"
    - path: "src/components/tabs/DiscoveryTab.tsx"
      issue: "Single Made For You carousel only; no Your Blends section or play-only DJ card"
  missing:
    - "Tag items by kind (core, blend, dj, editorial) and expose separate made_for_you, blends, and dj fields"
    - "Fix HomeAPI / GraphQL persisted query discovery for non-followed DW/RR/Daily Mixes (with on-device introspection / SearchAPI fallback)"
    - "Add 'Your Blends' carousel and play-only Spotify AI DJ card (CDP PlayerAPI.play on spotify_client, disabled hint on librespot)"
  debug_session: ".planning/debug/discovery-mixes-blends-missing-core-dj.md"

- gap_id: G-26-2
  truth: "SearchTab results support controller-friendly paging: Load More only expands the section the user is browsing, not every result category at once."
  status: failed
  reason: "User reported: Oh als ik op load more klik laad hij bij alles meer moet er niet per een load more balk of beter"
  severity: major
  test: 2
  root_cause: "SearchResultsView in src/components/tabs/SearchTab.tsx renders a single global 'Load More Results' row and useSearchController maintains one shared searchOffset querying all 6 entity types simultaneously, appending items to every category at once."
  artifacts:
    - path: "src/components/tabs/SearchTab.tsx"
      issue: "Single global Load More Results row and shared searchOffset across all 6 result categories"
  missing:
    - "Track per-section offsets/hasMore state and render a per-section Load More row (e.g. Load More Tracks / Playlists / Artists / Albums / Podcasts / Episodes) querying only that singular entity type"
  debug_session: ".planning/debug/search-load-more-all-sections.md"

- gap_id: G-26-3
  truth: "Booting or waking the Steam Machine while Spotify is playing on a phone leaves phone playback uninterrupted."
  status: failed
  reason: "User reported: ik heb een bug dat als ik muziek luister op mijn telefoon dat hij dan pauzeert als mijn steam machine opstart. Ook als ik hem aan zet pauzeert hij weer"
  severity: blocker
  test: 2
  root_cause: "MprisBridge publishes remote phone playback as local PlaybackStatus='Playing' on D-Bus so OS/mpris-proxy Pause/Stop signals call control_playback('pause') on boot/wake; _poll_playback also records was_playing=True bookmarks for remote phone playback and handle_wake_recovery can hijack playback on wake if _fetch_current_player returns None or device is missing; SoundtrackManager._run_launch can also pause remote playback."
  artifacts:
    - path: "py_modules/mpris.py"
      issue: "Reports Playing and forwards OS Pause/Stop to control_playback('pause') even when active device is remote"
    - path: "main.py"
      issue: "_poll_playback saves session bookmark was_playing=True for remote devices and syncs remote Playing state to MprisBridge"
    - path: "py_modules/resilience.py"
      issue: "is_device_dict_local(None) returns True and handle_wake_recovery does not guard against hijacking remote playback when player check is inconclusive"
    - path: "py_modules/soundtrack.py"
      issue: "_run_launch unbound pause policy does not check is_local_device_active before pausing"
  missing:
    - "Guard MprisBridge status & OS Pause/Stop commands with is_local_device_active so remote phone playback is never reported as local Playing or paused by OS signals"
    - "Only snapshot was_playing=True bookmarks when local device is active; avoid wake hijack when remote device is playing or unknown"
    - "Guard SoundtrackManager unbound pause with is_local_device_active"
  debug_session: ".planning/debug/steam-machine-boot-pauses-phone-playback.md"
