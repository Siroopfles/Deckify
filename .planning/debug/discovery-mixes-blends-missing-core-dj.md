---
status: diagnosed
trigger: "UAT Phase 26 Test 1 (G-26-1): Made For You shows Daylist + many Blends, no Discover Weekly / Release Radar / Daily Mixes; DJ playlist shown but broken when opened. User wants Blends elsewhere and wants Spotify AI DJ support."
created: 2026-11-24T19:40:00Z
updated: 2026-11-24T19:55:00Z
---

## Current Focus

hypothesis: CONFIRMED (code-level) — the only CDP source that actually yields items is RootlistAPI (user's saved library), so Made For You == "Spotify-owned playlists the user has in their library" (Daylist if saved, auto-added Blends, auto-added DJ). HomeAPI/GraphQL probes use non-existent call shapes and yield nothing; Web API me/playlists likewise only returns followed playlists. DJ is a dynamic session context with no static tracklist.
bug_class: Bohrbug (deterministic, data-source/logic)
next_action: return ROOT CAUSE FOUND to orchestrator (find_root_cause_only)

## Symptoms

expected: Made For You populates Daylist, Discover Weekly, Release Radar, Daily Mix 1-6 (with artwork); on librespot after Refresh Feed they remain with " · Cached" subtitles; opening/playing works.
actual: "Daylist doet het ja, Ik zie alleen heel veel blends... Discover Weekly, Release radar en Daily mixes zie ik te minsten helemaal niet ... Ik zie alleen ook de DJ playlist maar als ik die open werkt hij niet"
errors: None reported
reproduction: UAT Test 1, on-device Steam Deck, spotify_client engine
started: Discovered during Phase 26 UAT

## Eliminated

- hypothesis: Blends crowd DW/RR/Daily Mixes out of the [:15]/[:12] cap
  evidence: rpc_library.py L1437-1489 — `_sort_algorithmic_mixes` sorts BEFORE slicing; DW=bucket 1, RR=2, Daily Mix=3, Blends/DJ=bucket 5. Any DW/RR/Daily Mix present in `combined` would always sort ahead of Blends and survive the cap. Their absence means they were never collected.
  timestamp: 2026-11-24T19:47:00Z

## Evidence

- timestamp: 2026-11-24T19:42:00Z
  checked: cdp_bridge.py L515-526 pushItem filter
  found: `isSpotifyOwned = owner=='spotify' || id.startsWith('37i9dQZF1') || mixNameRe.test(name)`. Blends (37i9dQZF1EJ...), DJ (37i9dQZF1EYkqdzj48dyYq) and every editorial playlist (37i9dQZF1DX...) all match the id prefix. mixNameRe also contains bare `dj` and `made for` (substring, no word boundary — matches "Djent", any "Made for X").
  implication: No exclusion of Blends/DJ; filter is effectively "any Spotify-generated playlist".

- timestamp: 2026-11-24T19:43:00Z
  checked: cdp_bridge.py L539-554 HomeAPI probe; L556-568 GraphQL probe
  found: Calls `homeApi.getHome({})` / `homeApi.getSections({})` — guessed method names; errors swallowed by `catch (e) {}`. GraphQL probe calls `gql.query({name:'home', variables:{}})` — the real client executes persisted queries via a definition object (operationName + sha256Hash, e.g. Spicetify `GraphQL.Request(Definitions.home, {timeZone, sp_t, facet, sectionItemsLimit})`); a `{name}`-shaped call is not a real signature. It also only runs when items is empty (it never is once anything else populated it, but HomeAPI runs first so it does run) and errors are swallowed.
  implication: Neither home source contributes items; failures are silent (no logging), so nobody noticed.

- timestamp: 2026-11-24T19:44:00Z
  checked: cdp_bridge.py L570-578 RootlistAPI scan
  found: Iterates the user's library rootlist (flatten). Only playlists the user saved/follows exist there. Blends are auto-added to the library on creation; DJ is pinned in library for eligible users; Daylist appears if user saved it. DW / RR / Daily Mixes are NOT in the library unless explicitly followed.
  implication: Observed set (Daylist + many Blends + DJ, no DW/RR/Daily Mix) is exactly the "library-only" signature → confirms RootlistAPI is the sole working source.

- timestamp: 2026-11-24T19:45:00Z
  checked: rpc_library.py L1503-1519 Web API branch
  found: `me/playlists` filtered by owner.id=='spotify'. me/playlists only returns playlists in the user's library (same limitation as Rootlist). Additionally, since 2024-11-27 Spotify blocks algorithmic/editorial (Spotify-owned) playlists for new/Development-Mode apps (GET playlists/{id}[/items] → 404).
  implication: Web API cannot backfill DW/RR/Daily Mix either; cache (L1566-1579) only holds what CDP produced, so librespot "· Cached" mode inherits the same wrong set.

- timestamp: 2026-11-24T19:46:00Z
  checked: src/components/tabs/DiscoveryTab.tsx L444-490
  found: Single "Made For You" carousel; every item → `onOpenPlaylist(mix)`. No Blends section, no type/kind discrimination, no play-only card variant.
  implication: Blends and DJ are rendered as ordinary mix playlists.

- timestamp: 2026-11-24T19:48:00Z
  checked: rpc_library.get_playlist_tracks L119-220 + cdp_get_playlist_tracks L306-375 for DJ id
  found: Web API playlists/{id}/items → 404 (algorithmic restriction) → fallbacks; CDP PlaylistAPI.getContents on the DJ URI returns no static items (DJ is a server-generated, session-based context with voice segments). Result: empty tracks → detail view "doesn't work". Also the eager prefetch in _fetch_made_for_you_section L1543-1555 wastes a CDP call per DJ/Blend.
  implication: DJ needs a play-only card, not a tracklist view.

- timestamp: 2026-11-24T19:50:00Z
  checked: Web research (Spotify community / dev forum)
  found: PUT me/player/play with context_uri spotify:playlist:37i9dQZF1EYkqdzj48dyYq generally fails or behaves unexpectedly via the Web API; GET playlist metadata 404s for third-party apps. DJ is launched from the official client UI (mobile/desktop).
  implication: Only realistic DJ path is through the Official Spotify Client over CDP (PlayerAPI.play with the DJ context, issued from inside the client), playing on that client's device. librespot/spotifyd cannot render DJ (no DJ voice/session protocol).

## Resolution

root_cause: |
  (a) Blends in Made For You: cdp_fetch_discovery_mixes treats any id starting with 37i9dQZF1 (plus bare "dj"/"made for" name regex) as a "mix"; there is no Blend/DJ exclusion or kind tagging, and DiscoveryTab has only one carousel.
  (b) DW/RR/Daily Mix missing: the HomeAPI (getHome/getSections) and GraphQL ({name:'home'}) probes use non-existent call shapes and swallow errors, so the only working source is RootlistAPI (user's saved library) + Web me/playlists (also library-only, and algorithmic playlists are restricted for Dev-Mode apps since Nov 2024). Non-followed DW/RR/Daily Mixes are never collected; sorting/capping is NOT the cause.
  (c) DJ broken: DJ (37i9dQZF1EYkqdzj48dyYq) is a dynamic session context with no static tracklist; opening it calls get_playlist_tracks which returns empty (Web 404 + CDP getContents empty). Web API play of the DJ context is unsupported; librespot cannot play DJ.
fix: (not applied — diagnose-only)
verification: (not applied)
files_changed: []
