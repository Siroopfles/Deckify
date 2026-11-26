---
status: diagnosed
trigger: "Investigate issue: track-action-modal-playlist-picker-missing-images-and-frequent-sort"
created: 2026-11-26T07:19:33Z
updated: 2026-11-26T07:20:30Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: Confirmed root cause in TrackActionModal.tsx renderPlaylistPickerOverlay and missing usage-frequency persistence/sorting
test: Inspected TrackActionModal.tsx, DeckifyExpandedModal.tsx, PlaylistsTab.tsx, DeckifyImage.tsx, and py_modules/rpc_library.py
expecting: N/A - root cause confirmed
next_action: Return ROOT CAUSE FOUND diagnosis to caller

```yaml
bug_class: Bohrbug
reasoning_checkpoint:
  hypothesis: "renderPlaylistPickerOverlay in TrackActionModal.tsx hardcodes <FaFolder> instead of rendering <DeckifyImage src={pl.image_url}>, and neither TrackActionModal nor DeckifyExpandedModal/rpc_library tracks or sorts by playlist add frequency."
  confirming_evidence:
    - "src/components/common/TrackActionModal.tsx:443-448 renders <FaFolder size={12} ... /> unconditionally for every playlist row even though DeckifyImage is imported on line 18 and pl.image_url is populated by get_playlists (py_modules/rpc_library.py:97)."
    - "src/components/common/TrackActionModal.tsx:411-414 filters args.allUserPlaylists in raw order with no frequency/recency sort, and DeckifyExpandedModal.tsx:1017-1024 (handleAddTrackToPlaylist) / py_modules/rpc_library.py:314 (add_track_to_playlist) do not record playlist selection counts."
  falsification_test: "If TrackActionModal rendered DeckifyImage or sorted by frequency, DeckifyImage or a frequency map/sort comparator would appear in renderPlaylistPickerOverlay or handleAddTrackToPlaylist."
  fix_rationale: "Render <DeckifyImage src={pl.image_url} ... /> (with <FaFolder> fallback when missing) in renderPlaylistPickerOverlay, and persist/increment playlist add counts (e.g. in localStorage or backend settings) on add_track_to_playlist / create_playlist_with_track and sort editablePlaylists by frequency descending (preserving original order on ties)."
  blind_spots: "None for diagnosis; implementation should verify DeckifyImage sizing/layout inside 380px CARD_STYLE and whether frequency should be stored in frontend localStorage vs backend settings.json."
  candidate_causes:
    - "Code: TrackActionModal.tsx omits DeckifyImage in picker rows and omits frequency tracking/sorting."
    - "Data: get_playlists might not return image_url (checked py_modules/rpc_library.py:97 — it DOES return image_url and artwork_url)."
  and_gate: "No — the two reported symptoms are independent omissions in the same feature (image rendering vs frequency sorting), each directly caused by missing code in TrackActionModal / add-to-playlist flow."
```

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: The "Add to Playlist..." picker in TrackActionModal displays playlist cover images (via DeckyImage/CSP proxy) and sorts/surfaces frequently chosen playlists at the top.
actual: "Yes werkt ik mis alleen de plaatjes in de playlist picker modal en ik mis een feuteredat vaak gekozen playlists bovenaanstaan"
errors: None reported
reproduction: Test 5 in UAT
timeline: Discovered during UAT

## Eliminated
<!-- APPEND only - prevents re-investigating -->

- hypothesis: Backend get_playlists omits image_url on PlaylistItem objects
  evidence: py_modules/rpc_library.py:97-98 explicitly populates "image_url": _image_url(images) and "artwork_url": _image_url(images) on every playlist item, and PlaylistsTab.tsx:295 uses pl.image_url with DeckifyImage.
  timestamp: 2026-11-26T07:20:15Z

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-11-26T07:19:51Z
  checked: src/components/common/TrackActionModal.tsx (lines 1-463)
  found: DeckifyImage is imported on line 18 and used in renderTrackActionsHeader (line 194), but renderPlaylistPickerOverlay (lines 442-448) renders <FaFolder size={12} color="var(--deckify-accent, #1DB954)" /> instead of DeckifyImage. Line 412-414 filters args.allUserPlaylists with no sorting.
  implication: Both missing cover images and missing frequent-playlist sorting are direct UI/logic omissions in TrackActionModal (and its add handler).

- timestamp: 2026-11-26T07:20:01Z
  checked: src/components/DeckifyExpandedModal.tsx (lines 1017-1024, 1961-1990) and py_modules/rpc_library.py (lines 60-105, 314-360)
  found: get_playlists returns image_url on every playlist. handleAddTrackToPlaylist calls backendAddTrackToPlaylist and closes the modal without recording any usage count or timestamp.
  implication: There is no existing playlist-add frequency store anywhere in frontend or backend.

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: "1) Missing cover images: TrackActionModal.tsx `renderPlaylistPickerOverlay` (lines 443-448) renders a static `<FaFolder>` icon for each playlist row instead of `<DeckifyImage src={pl.image_url} ... />` (with `<FaFolder>` fallback when `pl.image_url` is absent), even though `DeckifyImage` is already imported and `get_playlists` populates `image_url`. 2) Missing frequent-playlist sorting: `renderPlaylistPickerOverlay` (lines 412-414) filters `allUserPlaylists` in raw API order, and neither `TrackActionModal.tsx`, `DeckifyExpandedModal.tsx:handleAddTrackToPlaylist` (lines 1017-1024), nor `py_modules/rpc_library.py:add_track_to_playlist` records playlist selection frequency or sorts frequently chosen playlists to the top."
fix: 
verification: 
files_changed: []
