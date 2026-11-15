---
phase: 11-home-discovery-hub-tab
plan: 01
subsystem: api
tags: [spotify, circuit-breaker, ttl-cache, oauth, python, rpc]

# Dependency graph
requires: []
provides:
  - "Thread-safe HTTP 429 exponential-backoff circuit breaker (SpotifyRateLimitError) in py_modules/spotify.py"
  - "OAuth scope v7 bump (CURRENT_SCOPES_VERSION = 7 with user-top-read) in py_modules/common.py"
  - "Section-isolated TTL-cached get_discovery_feed RPC in py_modules/rpc_library.py and main.py"
affects: [11-02]

# Actuals (#2632)
actuals:
  tokens: 42342
  tasks: 2
  commits: 2
plan_head_before: ffe27a55ae45d9492ba6a363ef04bf90998616f7
plan_head_after: b269c37cc154301b5789ea26338e9800b78bdb1a

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Global threading.Lock + time.monotonic() exponential-backoff HTTP 429 circuit breaker"
    - "Section-isolated in-memory TTL cache (1h top_*, 4h mixes/new_releases) with stale fallback"

key-files:
  created:
    - tests/test_discovery.py
  modified:
    - py_modules/common.py
    - py_modules/spotify.py
    - py_modules/rpc_library.py
    - main.py

key-decisions:
  - "Replaced blocking time.sleep in _spotify_api_request with fast-fail SpotifyRateLimitError circuit breaker (5s base, 300s cap)"
  - "Kept 1h TTL for top_tracks/top_artists per time_range and 4h TTL for made_for_you and new_releases so time_range switches do not invalidate static sections"
  - "Isolated HTTP 403 on /me/top/* as needs_reauth=True and HTTP 403/404 on /browse/new-releases with search?q=tag:new&type=album&limit=10 fallback"

patterns-established:
  - "SpotifyRateLimitError fast-fail + stale-cache serving in RPC handlers"

requirements-completed: [DISC-02, DISC-03]

coverage:
  - id: D1
    description: "Global thread-safe HTTP 429 exponential-backoff circuit breaker in py_modules/spotify.py (5s base, 300s cap, Retry-After parsing, reset on 2xx)"
    requirement: "DISC-03"
    verification:
      - kind: unit
        ref: "tests/test_discovery.py#TestDiscoveryCacheAndResilience.test_circuit_breaker_exponential_backoff_retry_after_and_concurrency"
        status: pass
    human_judgment: false
  - id: D2
    description: "OAuth scope v7 bump (CURRENT_SCOPES_VERSION = 7, user-top-read) in py_modules/common.py"
    requirement: "DISC-02"
    verification:
      - kind: unit
        ref: "tests/test_discovery.py#TestDiscoveryTracer.test_scopes_version_7_includes_user_top_read"
        status: pass
    human_judgment: false
  - id: D3
    description: "Section-isolated 1h/4h TTL cache, 403/404 Dev Mode fallbacks, Made For You pagination + Jump Back In fallback, and stale-cache 429 resilience in get_discovery_feed"
    requirement: "DISC-02"
    verification:
      - kind: unit
        ref: "tests/test_discovery.py#TestDiscoveryCacheAndResilience"
        status: pass
    human_judgment: false

# Metrics
duration: 5min
completed: 2026-11-15
status: complete
---

# Phase 11 Plan 01: Discovery Backend Pipeline Summary

**Hardened Spotify Web API client with a global thread-safe HTTP 429 exponential-backoff circuit breaker, OAuth scope v7 (`user-top-read`), and section-isolated 1h/4h TTL-cached `get_discovery_feed` RPC with Dev Mode 403/404 and stale-cache fallbacks.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-11-15T11:51:13Z
- **Completed:** 2026-11-15T11:56:13Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Fixed the missing `import time` bug in `py_modules/spotify.py` and replaced blocking `time.sleep` on 429 with a thread-safe (`_BREAKER_LOCK`) `time.monotonic()` exponential-backoff circuit breaker (`5s` base up to `300s` cap) raising `SpotifyRateLimitError`.
- Bumped `CURRENT_SCOPES_VERSION` from `6` to `7` and appended `user-top-read` to `SPOTIFY_SCOPES` in `py_modules/common.py`.
- Implemented `get_discovery_feed(time_range, force_refresh)` in `py_modules/rpc_library.py` and exposed `Plugin.get_discovery_feed` in `main.py`, with 1h (`top_tracks:{range}`, `top_artists:{range}`) and 4h (`made_for_you`, `new_releases`) TTL caching, `me/playlists` 2-page scan + Jump Back In `recently-played` fallback, `403` `needs_reauth` isolation, `browse/new-releases` `403`/`404` search fallback, and stale-cache serving on `SpotifyRateLimitError`.
- Created `tests/test_discovery.py` with 8 unit tests covering all behaviors; full Python test suite (452 tests) and frontend test suite (136 tests) pass.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end Discovery backend tracer — 429 circuit breaker, scope v7, and get_discovery_feed RPC** - `c7c78e9` (feat)
2. **Task 2: Expand get_discovery_feed with section-isolated 1h/4h TTL cache, 403/404 fallbacks, and stale-cache resilience** - `b269c37` (feat)

## Files Created/Modified
- `py_modules/common.py` - Added `user-top-read` to `SPOTIFY_SCOPES` and bumped `CURRENT_SCOPES_VERSION = 7`
- `py_modules/spotify.py` - Added `import time`, `SpotifyRateLimitError`, `_reset_rate_limit_breaker`, and thread-safe 429 circuit breaker in `_spotify_api_request`
- `py_modules/rpc_library.py` - Added `_DISCOVERY_CACHE`, `_clear_discovery_cache`, section fetchers, and `get_discovery_feed`
- `main.py` - Exposed `Plugin.get_discovery_feed` RPC method
- `tests/test_discovery.py` - Unit tests for 429 circuit breaker, scope v7, TTL cache boundaries, 403/404 fallbacks, and stale-cache resilience

## Decisions Made
- Replaced blocking `time.sleep` in `_spotify_api_request` with fast-fail `SpotifyRateLimitError` circuit breaker (`5.0s` base, `300.0s` cap) so executor threads never stall on 429s.
- Kept `1h` (`3600.0s`) TTL per `time_range` for `top_tracks`/`top_artists` and `4h` (`14400.0s`) TTL for `made_for_you` and `new_releases` so switching time ranges does not invalidate static sections.
- Isolated HTTP 403 on `/me/top/*` to `needs_reauth=True` and HTTP 403/404 on `/browse/new-releases` to `search?q=tag:new&type=album&limit=10`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Initial tracer test run revealed `patch.dict("sys.modules", {"decky": ...})` removes `py_modules.rpc_library` from `sys.modules` upon exiting the `with` block, causing `patch("py_modules.rpc_library....")` to re-import a separate module instance. Switched `tests/test_discovery.py` to `patch.object(...)` on the imported module objects, resolving the issue cleanly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Backend `get_discovery_feed` RPC and 429 circuit breaker are complete and verified; ready for Plan 11-02 (`DiscoveryTab.tsx`, `Sidebar.tsx`, `DeckifyExpandedModal.tsx`).

## Self-Check: PASSED
- Verified files exist: `py_modules/common.py`, `py_modules/spotify.py`, `py_modules/rpc_library.py`, `main.py`, `tests/test_discovery.py`
- Verified commits exist in `HEAD`: `c7c78e9`, `b269c37`

---
*Phase: 11-home-discovery-hub-tab*
*Completed: 2026-11-15*
