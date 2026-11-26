---
phase: 26-unified-cdp-platform-bridge-deep-discovery-2-0
plan: 11
subsystem: api-resilience
tags: [rate-limit, caching, cdp, search, radio, polling]
dependency-graph:
  requires:
    - phase: 26-unified-cdp-platform-bridge-deep-discovery-2-0
      plan: 10
      provides: Unified CDP bridge and discovery 2.0 foundation
  provides:
    - Proactive sliding-window rate limiter, short-TTL GET cache, and in-flight GET deduplication in py_modules/spotify.py
    - Relaxed 15s-20s poll backoff for spotify_client and paused/idle states in py_modules/resilience.py and main.py
    - Fast-abort 429 propagation and 300s _RADIO_CACHE in py_modules/rpc_playback.py
    - CDP-first SearchAPI (cdp_search) in py_modules/cdp_bridge.py and py_modules/rpc_library.py
    - Deduplicated SearchTab triggers and 30s Queue/Recent polling in frontend
  affects: [spotify-web-api, playback-polling, start-radio, search, queue-tab, recent-tab]
tech-stack:
  added: []
  patterns:
    - Thread-safe OrderedDict TTL cache keyed by SHA-256 token hash
    - threading.Event in-flight GET coalescing
    - Sliding-window request pacer (25 req / 10s, bounded 0.5s sleep)
    - CDP-first SearchAPI with Web API fallback
key-files:
  created:
    - tests/test_spotify.py
    - tests/test_radio_waterfall.py
  modified:
    - py_modules/spotify.py
    - py_modules/resilience.py
    - main.py
    - py_modules/rpc_playback.py
    - py_modules/cdp_bridge.py
    - py_modules/rpc_library.py
    - src/components/tabs/SearchTab.tsx
    - src/components/DeckifyExpandedModal.tsx
    - tests/test_resilience.py
    - tests/test_discovery.py
    - tests/test_cdp_bridge.py
    - tests/test_phase25_radio_search.py
    - src/components/tabs/SearchTab.test.tsx
decisions:
  - "Cap global 429 circuit breaker at 60.0s instead of 300.0s so transient rate limits do not lock out the app for 5 minutes."
  - "Key _GET_CACHE by SHA-256 token hash (16 hex chars) and clear on PUT/POST/DELETE mutations."
  - "Back off LibrespotEventServer.get_poll_interval to 15.0s (playing) / 20.0s (paused) on spotify_client and 20.0s when paused/idle on any backend."
  - "Reuse prefetched_cdp_state within _poll_playback so AI DJ interlude detection does not invoke cdp_get_player_state twice."
  - "Propagate SpotifyRateLimitError immediately out of start_radio Tier 2/3 and cap artists/{id}/albums fallback to limit=1."
requirements-completed: [DISC-04]
status: complete
commits: 3
plan_head_before: 904f852c22a9ea90519a843fc64d263c681cf413
plan_head_after: 5c736b88c4de868345d68aebc9a0a734e1c11744
metrics:
  duration: 11m
  completed: 2026-11-26
---

# Phase 26 Plan 11: Eliminate App-Wide Spotify Web API 429 Rate-Limit Storms Summary

**Proactive sliding-window rate limiting, SHA-256-keyed short-TTL GET caching, in-flight GET coalescing, 15s–30s poll backoff, Tier 3 radio 429 fast-abort + 300s URI caching, and CDP-first `SearchAPI` routing.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-11-26T17:26:50Z
- **Completed:** 2026-11-26T17:37:46Z
- **Tasks:** 3
- **Files modified:** 15 (2 created, 13 modified)

## Accomplishments

1. **Task 1 — Proactive Rate Limiter, GET Cache, Deduplication & Poll Backoff (`59f51cd`)**
   - Added thread-safe `_GET_CACHE` (`OrderedDict`, max 128 entries, keyed by `(endpoint, sorted_params, sha256(token)[:16])` with 2s `me/player` and 15s `search`/`artists/`/`albums/`/`tracks/`/`playlists/` TTLs), invalidated on `PUT`/`POST`/`DELETE`.
   - Added `threading.Event`-based `_INFLIGHT_GETS` coalescing so concurrent identical GETs share a single HTTP call.
   - Added `_RATE_WINDOW` sliding-window pacer (max 25 requests / 10s with bounded 0.5s sleep) and capped `_BREAKER_MAX_SECONDS` at `60.0`s.
   - Updated `LibrespotEventServer.get_poll_interval` to return `15.0`s (playing) / `20.0`s (paused) on `spotify_client` and `20.0`s when paused/idle.
   - Updated `Plugin._poll_playback` to skip `me/player` when `is_rate_limit_breaker_open()` is true or when `cdp_get_player_state` reports local `spotify_client` is idle, reusing `prefetched_cdp_state` for AI DJ interlude checks.

2. **Task 2 — Tier 3 Radio 429 Fast-Abort & Cache + CDP-First SearchAPI (`d87db84`)**
   - Added 300s `_RADIO_CACHE` (`OrderedDict`, max 32 entries) in `py_modules/rpc_playback.py:start_radio`, propagated `SpotifyRateLimitError` out of Tier 2/3 `except` blocks, and capped `artists/{id}/albums` fallback to `limit=1`.
   - Added `cdp_search` in `py_modules/cdp_bridge.py` using `json.dumps(...)` parameter serialization against `SearchAPI` (Threat T-26-17).
   - Wired `py_modules/rpc_library.py:search_spotify` to query `cdp_search` first when `is_spotify_client_running(plugin)` is true, annotating liked status from `_liked_cache` and falling back to `/v1/search` only when CDP is unavailable or empty.

3. **Task 3 — SearchTab Trigger Deduplication & Queue/Recent 30s Polling (`5c736b8`)**
   - Hardened `SearchTab.tsx` `useSearchState` so `skipNextDebounceRef` prevents duplicate 350ms debounced searches on tile, category, and history selections.
   - Relaxed `DeckifyExpandedModal.tsx` `queue` polling to `30000`ms (only while `status?.is_playing` is true) and `recent` polling to `30000`ms with a single `5000`ms track-change refresh.
   - Added Vitest regression test in `src/components/tabs/SearchTab.test.tsx`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated existing unit tests that asserted pre-26-11 polling/backoff/album-limit constants**
- **Found during:** Task 1 & Task 2 pre-commit verification
- **Issue:** `tests/test_resilience.py` (`test_adaptive_polling_20s_vs_3s`), `tests/test_discovery.py` (`test_circuit_breaker_exponential_backoff_retry_after_and_concurrency`), and `tests/test_phase25_radio_search.py` (`test_artist_radio_falls_back_to_artist_albums_when_top_tracks_and_search_fail`) asserted old constants (`3.0s` on `spotify_client`, `300.0s` breaker cap, `limit: 3` on `artists/{id}/albums`).
- **Fix:** Updated those test expectations to match the new 26-11 behavior (`15.0s`/`20.0s` backoff, `60.0s` cap, `limit: 1`).
- **Files modified:** `tests/test_resilience.py`, `tests/test_discovery.py`, `tests/test_phase25_radio_search.py`
- **Commits:** `59f51cd`, `d87db84`

**2. [Rule 1 - Bug] Reused prefetched CDP state in `_poll_playback` to avoid duplicate CDP calls**
- **Found during:** Task 1 verification (`test_poll_playback_emits_dj_x_interlude_metadata_when_context_already_dj`)
- **Issue:** Calling `_cdp_get_player_state` at the top of `_poll_playback` and again inside the `item is None` AI DJ interlude branch caused 2 CDP calls in a single poll cycle.
- **Fix:** Saved `prefetched_cdp_state` from the top-of-method check and reused it in the interlude branch.
- **Files modified:** `main.py`
- **Commit:** `59f51cd`

## Verification

- `py -3 -m unittest discover -s tests -p "test_*.py"` — **761 tests passed** (run via Husky pre-commit on `59f51cd` and `d87db84`)
- `pnpm test -- --run` — **30 test files, 384 tests passed**
- `pnpm run lint` — **0 errors**
- `pnpm run typecheck` — **passed**
- `pnpm run build` — **passed** (`dist/index.js` built)

## Self-Check: PASSED

- Created files exist: `tests/test_spotify.py`, `tests/test_radio_waterfall.py`
- Commits exist in HEAD: `59f51cd`, `d87db84`, `5c736b8`
- All verification gates passed after final edits.
