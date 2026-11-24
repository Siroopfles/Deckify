# Phase 26: Unified CDP Platform Bridge & Deep Discovery 2.0 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-24
**Phase:** 26-Unified CDP Platform Bridge & Deep Discovery 2.0
**Areas discussed:** Algorithmic Mixes & Cross-Engine Caching (DISC-04), Tier 1 Native CDP Station Radio (_try_cdp_station_radio), SearchTab CDP Browse Enrichment & B-Button Clear Behavior, Unified cdp_bridge.py Architecture & Migration Scope

---

## Algorithmic Mixes & Cross-Engine Caching (DISC-04)

### Q1: Mix Discovery & Ordering in "Made For You"
| Option | Description | Selected |
|--------|-------------|----------|
| Prioritized Algorithmic Mixes + Saved Spotify Mixes | Combine CDP Home/Pathfinder + RootlistAPI + Web API `owner.id == "spotify"`, deduplicate by URI, sort core mixes (*Daylist* → *Discover Weekly* → *Release Radar* → *Daily Mix 1–6* → *On Repeat* / other) first, *Jump Back In* fallback only when empty | ✓ |
| Rootlist-Only Mixes | Only show mixes explicitly saved/followed in the user's library | |
| Raw Home Feed Order | Preserve exact raw Home/Rootlist order | |
| You decide | Leave ordering and discovery merging to agent discretion | |

### Q2: Disk Cache Storage & Tracklist Pre-Fetching for `librespot`
| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated `~/.cache/deckify/discovery_mixes.json` with Background Pre-Fetch + On-Open Refresh | Separate cache file keeping `settings.json` lean; pre-fetch top ~10–12 mixes (up to 100 tracks each) during `get_discovery_feed` and refresh on open in `PlaylistsTab` | ✓ |
| Lazy On-Open Caching Only | Only cache tracklist when explicitly opened on `spotify_client` | |
| Store Inside `settings.json` | Store mix metadata and tracklists in `settings.json` | |
| You decide | Leave cache file location and pre-fetch strategy to agent discretion | |

### Q3: Playing Algorithmic Mixes on `librespot` (Direct Play, Drill-Down & QAM Pinning)
| Option | Description | Selected |
|--------|-------------|----------|
| Transparent Cache Fallback in Both `get_playlist_tracks` and `play_tracks` / `quick_play_pinned` | Serve cached tracklists on `403/404` or empty when CDP offline, and fall back to cached `uris` array when `context_uri` playback is blocked on `librespot` | ✓ |
| Drill-Down Tracklist Fallback Only | Only wire cache into `get_playlist_tracks`, not `play_tracks` / `quick_play_pinned` | |
| Always Play Cached Mixes via `uris` on Both Engines | Convert algorithmic mix `context_uri` to `uris` even on `spotify_client` | |
| You decide | Leave playback fallback details to agent discretion | |

### Q4: Cached Mix Indicator & Staleness Behavior on `librespot`
| Option | Description | Selected |
|--------|-------------|----------|
| Seamless Display with Subtle Subtitle / Cache Hint & Live Refresh on `spotify_client` | Keep cached mixes indefinitely on `librespot`, preserve on *Refresh Feed*, and append `" · Cached"` to subtitle when served from disk cache while CDP is offline | ✓ |
| Expire Cached Mixes After 24 Hours | Hide cached mixes on `librespot` after 24h | |
| Identical Display Without `"Cached"` Indicator | Keep mixes indefinitely without any `"Cached"` label | |
| You decide | Leave cache subtitle and refresh behavior to agent discretion | |

**User's choice:** Option 1 across all 4 questions.
**Notes:** User confirmed no further questions were needed for Area 1.

---

## Tier 1 Native CDP Station Radio (`_try_cdp_station_radio`)

### Q1: How Tier 1 CDP Radio Resolves & Plays
| Option | Description | Selected |
|--------|-------------|----------|
| Resolve Radio/Station Track URIs via CDP First | Resolve up to 30 `spotify:track:...` URIs via CDP so `start_radio` prepends seed track on Song Radio, populates `QueueTab`, and falls back silently to Tier 2/3 if empty | ✓ |
| Fire-and-Forget Native `PlayerAPI.play({ uri: "spotify:station:..." })` Only | Bypass `uris` queue and trigger station directly | |
| You decide | Leave exact CDP station resolution to agent discretion | |

### Q2: When to Attempt CDP Radio
| Option | Description | Selected |
|--------|-------------|----------|
| Only When `spotify_client` is Active/Running (`0ms` skip on `librespot`) | Check `spotify_client` running state first; skip CDP immediately when on `librespot` so no socket timeout delay occurs | ✓ |
| Always Attempt Port `9229` Connection | Probe port `9229` even when `librespot` is active | |
| You decide | Leave process check to agent discretion | |

**User's choice:** Option 1 for both questions.

---

## SearchTab CDP Browse Enrichment & `B`-Button Clear Behavior

### Q1: `B`-Button Behavior on Search Results
| Option | Description | Selected |
|--------|-------------|----------|
| Stepwise Back: Detail Page → Search Results → Search Idle Screen → Close Modal | Pop `navigationHistoryRef` back to search results first; if on `SearchTab` with non-empty `searchQuery`, clear query/results back to idle screen; close modal only when `searchQuery` is empty | ✓ |
| Close Modal Immediately | Always close modal on `B` even when search results are open | |
| You decide | Leave `vgp_oncancel` ordering to agent discretion | |

### Q2: Optional CDP Browse Categories vs 12 Gaming & Mood Tiles
| Option | Description | Selected |
|--------|-------------|----------|
| Keep 12 Gaming & Mood Tiles Always at Top + Optional CDP Browse Enrichment | Always keep the 12 curated Gaming & Mood tiles at the top (`0ms`), optionally enriching with CDP Spotify Browse categories/playlists with silent fallback on `librespot` | ✓ |
| Replace 12 Tiles with Spotify Browse Categories on `spotify_client` | Show generic Spotify categories when CDP is active and Gaming & Mood tiles only as fallback | |
| You decide | Leave exact combination to agent discretion | |

**User's choice:** Option 1 for both questions.

---

## Unified `cdp_bridge.py` Architecture & Migration Scope

### Q1: Centralizing Existing React Fiber / `Platform.Registry` Walkers
| Option | Description | Selected |
|--------|-------------|----------|
| Full Centralization in `cdp_bridge.py` with Backwards-Compatible Wrappers in `engine.py` | Route existing CDP functions (`engine.py`, `rpc_library.py`) through `cdp_bridge.py` (`window.__deckifyRegistry`) while preserving existing function names/signatures for tests and callers | ✓ |
| New Phase 26 Functions Only | Leave the 6 existing React Fiber walkers duplicated in `engine.py` and `rpc_library.py` | |
| You decide | Leave migration scope to agent discretion | |

**User's choice:** Option 1.

---

## the agent's Discretion
- Exact internal Spotify CDP API method probes inside `cdp_bridge.py` for Home/Pathfinder mixes, Radio station URI resolution, and Browse categories.
- Exact JSON structure and track count cap inside `~/.cache/deckify/discovery_mixes.json`.
- Visual layout and controller hint bar update for `"B Clear Search"` when `mode === "search"` and `searchQuery` is non-empty.

## Deferred Ideas
None — discussion stayed within phase scope.
