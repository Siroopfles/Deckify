---
status: diagnosed
trigger: "UAT Phase 26 Test 2 (G-26-2): Pressing Load More Results in SearchTab loads more items for every category at once instead of per-section paging."
created: 2026-11-25T17:56:00Z
updated: 2026-11-25T17:56:00Z
---

## Current Focus

hypothesis: CONFIRMED — SearchTab renders a single global "Load More Results" button and maintains one shared `searchOffset`, calling `search_spotify` with all 6 entity types (`track,artist,album,playlist,show,episode`) and merging all categories together.
bug_class: Bohrbug (deterministic UI/controller paging design)
next_action: return ROOT CAUSE FOUND to orchestrator (find_root_cause_only)

## Symptoms

expected: Each result section (Tracks, Playlists, Artists, Albums, Podcasts, Episodes) can load more of only that section (per-section "Load more" row), without D-pad focus jumping across unrelated sections.
actual: "Oh als ik op load more klik laad hij bij alles meer moet er niet per een load more balk of beter"
errors: None reported
reproduction: Test 2 in UAT (SearchTab, any query, press Load More Results)
started: Discovered during Phase 26 UAT

## Evidence

- timestamp: 2026-11-25T17:56:00Z
  checked: src/components/tabs/SearchTab.tsx L579-593, L673, L740-744
  found: `SearchResultsView` renders a single `<InteractiveRow onClick={onLoadMore}>Load More Results</InteractiveRow>` at the bottom of the entire results view. `useSearchController` tracks a single `searchOffset` integer and `handleLoadMore` calls `runSearch(searchQuery, nextOffset)` using `SEARCH_TYPES = "track,artist,album,playlist,show,episode"`. `mergeSearchResults` then appends new items to all 6 categories (`tracks`, `artists`, `albums`, `playlists`, `shows`, `episodes`).
  implication: Clicking Load More expands every section above the button simultaneously, pushing focus/scroll unexpectedly and fetching unnecessary entity types.

- timestamp: 2026-11-25T17:56:00Z
  checked: py_modules/rpc_library.py L1120-1282 (`search_spotify`)
  found: `search_spotify(plugin, query, types, limit, offset)` passes `types` directly to Spotify `GET /v1/search`. Single types (e.g. `"track"`, `"playlist"`, `"artist"`, `"album"`, `"show"`, `"episode"`) are already supported by the backend.
  implication: No breaking backend signature change is required to page a single section, though returning per-type `has_more` or checking `items.length >= SEARCH_PAGE_LIMIT` allows hiding exhausted section buttons.

## Resolution

root_cause: |
  `SearchResultsView` in `src/components/tabs/SearchTab.tsx` (lines 579-593) renders a single global "Load More Results" button, and `useSearchController` (lines 673, 740-744) maintains a single shared `searchOffset` that queries all 6 entity types (`track,artist,album,playlist,show,episode`) and merges results into every category at once.
fix: (not applied — diagnose-only)
verification: (not applied)
files_changed: []
