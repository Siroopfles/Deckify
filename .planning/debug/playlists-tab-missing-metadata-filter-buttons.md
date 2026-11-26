---
status: diagnosed
trigger: "Investigate issue: playlists-tab-missing-metadata-filter-buttons - In PlaylistsTab, typing in the overview filter filters folders and playlists locally. Inside an owned playlist, typing in the track filter filters tracks while hiding the inline ⇅ Grab/Move buttons. User reports missing filter buttons for additional metadata (e.g., owned/editable vs followed, collaborative, folder, artist/album/sort/metadata filters)."
created: 2026-11-26T07:18:21Z
updated: 2026-11-26T08:19:15Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: Confirmed — PlaylistsTab only implements plain TextField name/artist substring filters in both overview and detail views, with no metadata filter button/chip bars or metadata predicates despite PlaylistItem and TrackItem carrying rich metadata.
test: Inspected PlaylistsTab.tsx, types.ts, rpc_library.py, and PodcastsTab.tsx
expecting: Root cause documented for plan-phase --gaps
next_action: Return ROOT CAUSE FOUND diagnosis to caller

```yaml
reasoning_checkpoint:
  hypothesis: "PlaylistsTab lacks metadata filter buttons/chips and broader metadata matching because Phase 27-04 only implemented single TextField inputs matching playlist/folder name in overview and track name/artist in detail view."
  confirming_evidence:
    - "src/components/tabs/PlaylistsTab.tsx:748-751 only renders TextField('Filter playlists & folders') and lines 253-261 / 734 only call matchesQuery(folder.name) and matchesQuery(pl.name)."
    - "src/components/tabs/PlaylistsTab.tsx:656-658 & 676-678 only render TextField('Filter tracks') and filter by matchesQuery(t.name) || matchesQuery(t.artist)."
    - "src/types.ts:81-93 and py_modules/rpc_library.py:89-100 already expose PlaylistItem metadata (is_editable, collaborative, owner_id, description, is_mixed, track_count) and TrackItem metadata (album, duration_ms, is_liked)."
  falsification_test: "If metadata filter buttons existed in PlaylistsTab.tsx, DialogButton/InteractiveRow filter chips and filter state hooks would be present in PlaylistsOverview or renderPlaylistDetailView; none exist."
  fix_rationale: "Adding Focusable horizontal filter chip bars (matching EpisodeFilterBar in PodcastsTab.tsx) for playlist metadata (e.g. All / Editable / Followed / Collaborative / Pinned) and track metadata (e.g. All / Liked, plus album in text search and/or sort/clear controls) directly addresses the missing metadata filter UI."
  blind_spots: "Exact set of metadata chips desired by the user (e.g., whether sort order or folder-only filter is also wanted) is a UX choice for planning."
  candidate_causes:
    - "code: PlaylistsTab.tsx only implemented single TextField name/artist filters and omitted metadata filter chip bars and description/album matching."
    - "data: Checked whether backend omits metadata — refuted; rpc_library.py:get_playlists and get_playlist_tracks already populate is_editable, collaborative, owner_id, description, track_count, album, duration_ms, is_liked."
  and_gate: "no — single code cause in PlaylistsTab.tsx; backend data and @decky/ui filter-bar pattern already exist."
```

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: User can filter playlists and tracks using local text search AND metadata filter buttons/chips in PlaylistsTab.
actual: "Ik kan zoeken enzo maar mis nog meer filter buttons voor meer van de meta data"
errors: None reported
reproduction: Test 4 in UAT
timeline: Discovered during UAT

## Eliminated
<!-- APPEND only - prevents re-investigating -->

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-11-26T08:18:38Z
  checked: src/components/tabs/PlaylistsTab.tsx (PlaylistsOverview, lines 725-752, 253-261)
  found: Overview only has `overviewFilter` state + a single `TextField("Filter playlists & folders")`. `filterFolderTree` and `uncategorized` filter only call `matchesQuery(folder.name, query)` and `matchesQuery(pl.name, query)`. No metadata filter buttons/chips exist for `is_editable`, `collaborative`, `is_mixed`, `pinnedUris`, or `description`/`owner_id`.
  implication: Users cannot filter playlists by ownership, collaborative status, pinned status, or other playlist metadata.

- timestamp: 2026-11-26T08:18:43Z
  checked: src/components/tabs/PlaylistsTab.tsx (renderPlaylistDetailView, lines 652-699, and useGrabWiring, lines 608-615)
  found: Detail view only has `trackFilter` state + a single `TextField("Filter tracks")`, filtering tracks via `matchesQuery(t.name, trackQuery) || matchesQuery(t.artist, trackQuery)`. Does not match `t.album`, and has no metadata filter buttons/chips (e.g., Liked tracks, Clear filter, sort). Grab/Move (`canReorder`) is gated on `!isTrackFilterActive`.
  implication: Users have no metadata filter chips inside playlists and cannot filter tracks by album or liked status.

- timestamp: 2026-11-26T08:18:50Z
  checked: src/types.ts (lines 63-93) and py_modules/rpc_library.py (lines 60-100, 155-265)
  found: Backend already returns `is_editable`, `collaborative`, `owner_id`, `description`, `track_count` on playlists, and `album`, `artist`, `duration_ms`, `is_liked` on tracks.
  implication: Root cause is purely in the frontend UI/filtering logic of `PlaylistsTab.tsx`, not missing backend data.

- timestamp: 2026-11-26T08:18:52Z
  checked: src/components/tabs/PodcastsTab.tsx (EpisodeFilterBar, lines 20-52)
  found: Existing controller-friendly filter chip bar pattern uses `<Focusable flow-children="horizontal" style={{ display: "flex", gap: 8 }}>` with `<DialogButton style={{ width: "auto", minWidth: "auto", minHeight: 36, padding: "4px 16px" }}>`.
  implication: Can reuse the exact same `@decky/ui` `Focusable` + `DialogButton` chip bar pattern in `PlaylistsTab.tsx`.

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: `PlaylistsTab.tsx` only implements single free-text `TextField` filters in both `PlaylistsOverview` (matching `folder.name` and `pl.name` only) and `renderPlaylistDetailView` (matching `t.name` and `t.artist` only). There are no metadata filter button/chip bars (`Focusable flow-children="horizontal"` + `DialogButton` pills) in either view, even though `PlaylistItem` (`is_editable`, `collaborative`, `owner_id`, `description`, `is_mixed`, `track_count`, plus `pinnedUris` / folder membership) and `TrackItem` (`album`, `is_liked`, `duration_ms`) already carry the metadata from `py_modules/rpc_library.py`.
fix:
verification:
files_changed: []
