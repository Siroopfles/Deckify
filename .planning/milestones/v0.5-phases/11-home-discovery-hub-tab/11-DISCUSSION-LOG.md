# Phase 11: Home & Discovery Hub Tab - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-15
**Phase:** 11-home-discovery-hub-tab
**Areas discussed:** Tab Placement & Landing, Carousels & Made For You Mixes, Item Interactions & Time-Range Filters, 429 Circuit Breaker & Cache TTL

---

## Tab Placement & Landing

### Question 1: Sidebar placement and label
| Option | Description | Selected |
|--------|-------------|----------|
| "Discovery" right after Now Playing/Lyrics (or top of Browse section) | Keeps Now Playing as the #1 sidebar item | ✓ |
| "Home" at the very top of the sidebar (above Now Playing) | Spotify-style Home-first layout | |
| "Discovery" grouped with Search & Recent | Keeps playback tabs at top and exploration below | |

### Question 2: Default modal landing tab
| Option | Description | Selected |
|--------|-------------|----------|
| Keep Now Playing as default when a track is active, open Discovery when nothing is playing | Context-aware default landing | ✓ |
| Always open on Discovery/Home when opening the modal | Always Discovery first | |
| Always keep Now Playing as the default tab | Manual navigation only | |

**User's choice:** Recommended options for both.

---

## Carousels & Made For You Mixes

### Question 1: Layout and section order
| Option | Description | Selected |
|--------|-------------|----------|
| Time-of-day greeting + Made For You mixes + Top Tracks + Top Artists + New Releases | Horizontal carousels | ✓ |
| Top Tracks + Top Artists first, followed by Made For You mixes and New Releases | Personal stats first | |
| You decide | Agent discretion | |

### Question 2: Made For You mixes sourcing
| Option | Description | Selected |
|--------|-------------|----------|
| Match Spotify-owned mixes from user's library (Discover Weekly, Release Radar, Daily Mix, Daylist) + Jump Back In fallback if none followed | Avoids deprecated editorial endpoints | ✓ |
| Only show Made For You mixes if user follows them in me/playlists | Hide section if empty | |
| You decide | Agent discretion | |

### Question 3: Carousel card styling
| Option | Description | Selected |
|--------|-------------|----------|
| Square artwork cards (~120-130px) with 2-line title + subtitle, showing 10-15 items per horizontal carousel | Standard horizontal shelf | ✓ |
| Compact wide cards (similar to TrackRowItem) with smaller 48px artwork | Row-style cards | |
| You decide | Agent discretion | |

### Question 4: `user-top-read` OAuth scope bump
| Option | Description | Selected |
|--------|-------------|----------|
| Bump CURRENT_SCOPES_VERSION to add user-top-read and show a clean "Re-authenticate for Top Tracks/Artists" card if 403 occurs | Graceful re-auth prompt | ✓ |
| Only show New Releases & Made For You without requesting user-top-read | Skip Top Tracks/Artists scope | |

**User's choice:** Recommended options for all 4 questions.

---

## Item Interactions & Time-Range Filters

### Question 1: Time-range filter pills
| Option | Description | Selected |
|--------|-------------|----------|
| Shared time-range pill bar (4 Weeks / 6 Months / All Time) updating both Top Tracks and Top Artists together (default 6 Months) | Single shared filter | ✓ |
| Separate time-range pills on Top Tracks and Top Artists independently | Per-section filters | |
| No pills — always show medium_term (6 Months) | Fixed range | |

### Question 2: Card click (`A` button) behavior
| Option | Description | Selected |
|--------|-------------|----------|
| Top Track = play immediately (with Top Tracks queue); Top Artist = drill into Artist view; Mix/Album = drill into Playlist/Album view (Y menu for quick-play / Pin to QAM) | Drill-down for lists/artists, instant play for tracks | ✓ |
| Every card starts playback immediately on click (no drill-down) | Instant play only | |
| You decide | Agent discretion | |

**User's choice:** `"Recommended maar ik wil ook dat het mogelijk is om de lijst te openen"` (Confirmed: drill-down into Playlist/Album tracklist on `A`, with `Y` menu for quick-play / Pin to QAM).

---

## 429 Circuit Breaker & Cache TTL

### Question 1: Cache TTL & manual refresh
| Option | Description | Selected |
|--------|-------------|----------|
| 1h cache for Top Tracks/Artists (per time range), 4h cache for New Releases & Made For You mixes, plus a compact Refresh button in header | Tiered TTL + manual refresh | ✓ |
| 6h cache across all discovery sections with no manual refresh button | Long static TTL | |
| 1h cache across all discovery sections with manual refresh button | Uniform 1h TTL | |

### Question 2: HTTP 429 circuit breaker & UI fallback
| Option | Description | Selected |
|--------|-------------|----------|
| Exponential backoff circuit breaker in spotify.py (respecting Retry-After); DiscoveryTab serves stale cached data with a subtle banner when open | Graceful stale-cache degradation | ✓ |
| Show a blocking error card with countdown until circuit breaker resets | Hard error state | |
| You decide | Agent discretion | |

**User's choice:** Recommended options for both.

---

## Agent's Discretion

- Exact circuit breaker backoff schedule, failure-threshold window, and stale-cache fallback metadata shape.
- Exact icon choice in `Sidebar.tsx` and horizontal scroll/focus restoration details in `DiscoveryTab.tsx`.
- Reusing `TrackActionModal` / `CollectionActionModal` for `Y`-button context actions on Discovery cards.

## Deferred Ideas

None.
