---
status: diagnosed
trigger: "Investigate issue: discovery-missing-made-for-you-mixes-daylist-title-and-ai-dj-now-playing"
created: 2026-11-26T07:26:15Z
updated: 2026-11-26T07:28:30Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: Confirmed root causes for all four reported symptoms across cdp_bridge.py, rpc_library.py, main.py, DeckifyExpandedModal.tsx, and NowPlayingTab.tsx.
test: Completed static code trace of CDP discovery extraction, playlist opening, playback polling, and NowPlayingTab props/UI.
expecting: Root causes documented for gap-closure planning.
next_action: Return diagnosis to parent agent.

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: DiscoveryTab Made For You shows Daylist (with custom title when opened), Discover Weekly, Release Radar, Daily Mixes, On Repeat; AI DJ shows speaking state and an AI DJ button in NowPlayingTab.
actual: "Ik zag gisteren alleen de daylist en ai dj apart. Maar als ik de daylist open pakt hij niet de custom titel die eraan gekoppeld zit. De Ai Dj list als ik die afspeel gaf hij niet aan als ai dj aan het woord was in de now playing tab en er was geen ai dj button op nowplaying om op te klikken. Voor de rest zag ik de andere playlisten niet"
errors: None reported
reproduction: Test 1 in Phase 26 UAT
timeline: Discovered during UAT

## Eliminated
<!-- APPEND only - prevents re-investigating -->

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-11-26T07:27:00Z
  checked: py_modules/cdp_bridge.py (lines 565-752) and py_modules/rpc_library.py (lines 1831-1936)
  found: |
    1) cdp_fetch_discovery_mixes extractHomeSections only checks `home?.sections || home?.items || home?.data?.home?.sectionContainer?.sections?.items` and `entry?.content?.data || entry?.data || entry?.item || entry`. It does not unwrap `home?.home?.sectionContainer...` or GraphQL `PlaylistResponseWrapper` (`node.data` / `ownerV2.data` / `images.items[0].sources`), causing `pushItem` to drop HomeAPI/GraphQL playlist cards when `uri` is nested under `.data`.
    2) SearchAPI fallback in cdp_fetch_discovery_mixes has the same GraphQL `.data` unwrapping gap and `missingCore` omits `on repeat`.
    3) RootlistAPI and Web API `me/playlists` only return user-followed playlists (e.g. Daylist and AI DJ if followed), while Web API `_search_missing_core_mixes` (`/v1/search`) omits personalized `37i9dQZF1E...` algorithmic playlists in Spotify Dev Mode and also omits `on repeat`.
  implication: Non-followed core mixes (Discover Weekly, Release Radar, Daily Mixes, On Repeat) are dropped or never returned, leaving only followed mixes (Daylist and AI DJ).

- timestamp: 2026-11-26T07:27:30Z
  checked: py_modules/cdp_bridge.py (lines 307-376), py_modules/rpc_library.py (lines 155-311), src/components/DeckifyExpandedModal.tsx (lines 427-448)
  found: |
    1) `cdp_get_playlist_tracks` only calls `playlistApi.getContents(uri, ...)` and returns `{ ok, tracks, total, offset }` without fetching or returning playlist metadata (`name` / `title` / `description`).
    2) `get_playlist_tracks` in `rpc_library.py` never returns `playlist_name` / `name` / `description`.
    3) `handleOpenPlaylist` in `DeckifyExpandedModal.tsx` only updates `is_mixed` from `backendGetPlaylistTracks` response, leaving `activePlaylist.name` as the static `"daylist"` string from the discovery card.
  implication: Opening Daylist never updates the header to Daylist's custom dynamic title.

- timestamp: 2026-11-26T07:28:00Z
  checked: main.py (lines 754-790, 2057-2124), src/components/tabs/NowPlayingTab.tsx (lines 1-593), src/components/DeckifyExpandedModal.tsx (lines 1678-1695)
  found: |
    1) `main.py:_poll_playback` line 2058 immediately returns `True` when `data.get("item") is None`, which occurs during Spotify AI DJ voice interludes (`currently_playing_type == "unknown"` with `item: null`), and never queries CDP `PlayerAPI.getState()` or tracks/emits an AI DJ speaking state.
    2) `main.py:get_status` and `StatusResponse` (`src/types.ts`) have no AI DJ active/speaking field.
    3) `NowPlayingTab.tsx` and `DeckifyExpandedModal.tsx` have zero AI DJ references: no AI DJ speaking indicator and no AI DJ button (to start AI DJ or skip to next DJ vibe).
  implication: NowPlayingTab cannot indicate when AI DJ is speaking and has no AI DJ button to click.

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: "Four interrelated Phase 26 gaps: (1) `cdp_fetch_discovery_mixes` in `py_modules/cdp_bridge.py` fails to unwrap Spotify HomeAPI/GraphQL `PlaylistResponseWrapper` (`node.data`, `ownerV2`, `images.items`) and SearchAPI `.data` shapes (and omits `on repeat` and Made For You hub/browse probing), while Web API `/v1/search` in `_search_missing_core_mixes` does not return personalized mixes, leaving only followed mixes (Daylist + AI DJ); (2) `cdp_get_playlist_tracks`, `rpc_library.get_playlist_tracks`, and `DeckifyExpandedModal.handleOpenPlaylist` do not fetch/return/apply playlist metadata (`name`/`description`), so Daylist keeps its static `'daylist'` card title when opened; (3) `main.py:_poll_playback` short-circuits on `item is None` (which happens during AI DJ voice interludes) and neither backend status nor `NowPlayingTab` tracks/displays AI DJ speaking state; (4) `NowPlayingTab` and `DeckifyExpandedModal` do not render or wire an AI DJ button."
fix:
verification:
files_changed: []
