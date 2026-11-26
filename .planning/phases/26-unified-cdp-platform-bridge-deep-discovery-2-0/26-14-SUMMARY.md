---
phase: 26-unified-cdp-platform-bridge-deep-discovery-2-0
plan: 14
subsystem: api, ui
tags: [discovery, cache, html-sanitization, cdp, librespot, react, python]

requires:
  - phase: 26-12
    provides: RecentlyPlayedAPI/Pathfinder discovery mix extraction and cdp_bridge HTML-free metadata
  - phase: 26-13
    provides: Non-destructive auto_transfer_and_play(play=False) and surfaced play_tracks retry errors
provides:
  - Backend-keyed _DISCOVERY_CACHE ("made_for_you:{audio_backend}") preventing stale cross-backend cache reuse
  - Reactive DiscoveryTab re-fetch on audioBackend prop change wired from DeckifyExpandedModal
  - HTML tag and entity stripping across rpc_library.py, DiscoveryTab.tsx, and PlaylistsTab.tsx
affects: [discovery, playlists, audio-backend-switching]

actuals:
  tasks: 2
  commits: 2
plan_head_before: cf6825516612123263ff2e737560b5faa23e2fb6
plan_head_after: ca9eb3f99bb7e0c82c9469570c78854e042c2fd4

tech-stack:
  added: []
  patterns:
    - "_strip_html in py_modules/rpc_library.py and stripHtmlTags in DiscoveryTab.tsx (reused by PlaylistsTab.tsx)"
    - "Backend-scoped _DISCOVERY_CACHE key made_for_you:{audio_backend}"

key-files:
  created: []
  modified:
    - py_modules/rpc_library.py
    - src/components/tabs/DiscoveryTab.tsx
    - src/components/tabs/PlaylistsTab.tsx
    - src/components/DeckifyExpandedModal.tsx
    - tests/test_discovery.py
    - src/components/tabs/DiscoveryTab.test.tsx
    - src/components/tabs/PlaylistsTab.test.tsx

key-decisions:
  - "Key _DISCOVERY_CACHE made_for_you section by active audio_backend so switching between spotify_client and librespot immediately serves the active backend's view"
  - "Skip redundant Web API /v1/search fallback in _fetch_made_for_you_section when cdp_active is true"
  - "Wire audioBackend from DeckifyExpandedModal into DiscoveryTab and export shared stripHtmlTags helper for PlaylistsTab"

patterns-established:
  - "Strip HTML tags and unescape entities in both backend RPC formatting and React text rendering"

requirements-completed: [DISC-04]

coverage:
  - id: D1
    description: "get_discovery_feed keys _DISCOVERY_CACHE by audio_backend and skips redundant Web API /v1/search when cdp_active is true"
    requirement: "DISC-04"
    verification:
      - kind: unit
        ref: "tests/test_discovery.py#test_get_discovery_feed_keys_cache_by_audio_backend"
        status: pass
      - kind: unit
        ref: "tests/test_discovery.py#test_fetch_made_for_you_skips_web_search_when_cdp_mixes_present"
        status: pass
    human_judgment: false
  - id: D2
    description: "DiscoveryTab re-fetches get_discovery_feed automatically when audioBackend changes"
    requirement: "DISC-04"
    verification:
      - kind: unit
        ref: "src/components/tabs/DiscoveryTab.test.tsx#re-fetches get_discovery_feed when audioBackend changes and strips HTML tags from subtitles"
        status: pass
    human_judgment: false
  - id: D3
    description: "Playlist descriptions and mix subtitles strip HTML tags and decode entities in rpc_library.py, DiscoveryTab.tsx, and PlaylistsTab.tsx"
    requirement: "DISC-04"
    verification:
      - kind: unit
        ref: "tests/test_discovery.py#test_html_tags_stripped_from_playlist_descriptions_and_subtitles"
        status: pass
      - kind: unit
        ref: "src/components/tabs/PlaylistsTab.test.tsx#strips HTML tags and decodes entities from activePlaylist.description"
        status: pass
    human_judgment: false

duration: 5min
completed: 2026-11-26
status: complete
---

# Phase 26 Plan 14: Discovery Backend Cache Key, Reactive Refresh & HTML Stripping Summary

**Keyed `_DISCOVERY_CACHE` by `audio_backend`, wired `audioBackend`-reactive `DiscoveryTab` refreshes, and stripped HTML tags/entities from playlist descriptions and mix subtitles across backend and frontend.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-11-26T19:25:52Z
- **Completed:** 2026-11-26T19:30:50Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Keyed the `made_for_you` section of `_DISCOVERY_CACHE` by `audio_backend` (`made_for_you:spotify_client` vs `made_for_you:librespot`) and skipped redundant Web API `/v1/search` calls when `cdp_active` is `True`.
- Added `_strip_html` in `py_modules/rpc_library.py` and applied it to `playlist_description` in `get_playlist_tracks` (Web API, CDP, and cached branches) and to `subtitle` in `_format_discovery_playlist` and `cdp_mixes`.
- Added `audioBackend` prop to `DiscoveryTab` (wired from `DeckifyExpandedModal.tsx`), added `audioBackend` to `DiscoveryTab`'s `get_discovery_feed` `useEffect` dependencies, and exported `stripHtmlTags` for `DiscoveryTab.tsx` and `PlaylistsTab.tsx`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Key _DISCOVERY_CACHE by audio_backend and strip HTML tags in rpc_library.py** - `ca3b215` (feat)
2. **Task 2: Re-fetch DiscoveryTab on audioBackend change, strip HTML in DiscoveryTab & PlaylistsTab, and run full suite** - `ca9eb3f` (feat)

## Files Created/Modified
- `py_modules/rpc_library.py` - Added `_strip_html`, keyed `made_for_you` cache by `audio_backend`, and skipped `/v1/search` when `cdp_active` is `True`.
- `src/components/tabs/DiscoveryTab.tsx` - Added `stripHtmlTags`, `audioBackend` prop, and `audioBackend` `useEffect` dependency.
- `src/components/tabs/PlaylistsTab.tsx` - Applied `stripHtmlTags` to `activePlaylist.description`.
- `src/components/DeckifyExpandedModal.tsx` - Passed `audioBackend={audioBackend}` to `<DiscoveryTab />`.
- `tests/test_discovery.py` - Added backend cache key, HTML stripping, and Web search skip tests; updated `test_blends_dj_split_skips_prefetch_and_web_search_fallback` for the `cdp_active` no-search behavior.
- `src/components/tabs/DiscoveryTab.test.tsx` - Added `audioBackend` dependency/re-fetch and subtitle HTML-stripping test.
- `src/components/tabs/PlaylistsTab.test.tsx` - Added `activePlaylist.description` HTML-stripping test.

## Decisions Made
- Wired `audioBackend={audioBackend}` from `DeckifyExpandedModal.tsx` into `<DiscoveryTab />` so the new prop receives live backend switches in production.
- Shared `stripHtmlTags` from `DiscoveryTab.tsx` into `PlaylistsTab.tsx` to avoid duplicating HTML sanitization logic.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Wired `audioBackend` prop from `DeckifyExpandedModal.tsx` to `DiscoveryTab`**
- **Found during:** Task 2 (`DiscoveryTab` `audioBackend` dependency)
- **Issue:** `DeckifyExpandedModal.tsx` computed `audioBackend` but did not pass it to `<DiscoveryTab />`, so `DiscoveryTab` would always receive `undefined` without wiring it.
- **Fix:** Passed `audioBackend={audioBackend}` on `<DiscoveryTab />` in `src/components/DeckifyExpandedModal.tsx`.
- **Files modified:** `src/components/DeckifyExpandedModal.tsx`
- **Verification:** `pnpm run typecheck`, `pnpm test -- --run`, and `pnpm run build` all pass.
- **Committed in:** `ca9eb3f` (part of Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Necessary for `DiscoveryTab` to observe live `audioBackend` changes in the modal. No scope creep.

## Issues Encountered
- Husky pre-commit hook runs the full Python test suite on commit, so Task 1's RED tests could not be committed separately without `--no-verify` and were committed together with the GREEN implementation in `ca3b215`.
- `test_blends_dj_split_skips_prefetch_and_web_search_fallback` in `tests/test_discovery.py` previously relied on `cdp_active=True` calling `/v1/search` to populate `Discover Weekly`, `Release Radar`, and `Daily Mix 1`; updated its `cdp_items` fixture to supply those core mixes directly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 26 UAT gaps G-26-4, G-26-5, and G-26-7 are closed with full Python (782 tests) and frontend (393 tests, `tsc --noEmit`, `rollup -c`) verification passing.
- Ready for Phase 26 verification / UAT round 3.

## Self-Check: PASSED

---
*Phase: 26-unified-cdp-platform-bridge-deep-discovery-2-0*
*Completed: 2026-11-26*
