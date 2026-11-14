---
status: diagnosed
trigger: "detail-view-missing-mixing-button: User opened the detail view of a playlist/album in DeckifyExpandedModal (PlaylistsTab / AlbumsTab / LikedSongsTab) during Phase 09 UAT and reported that while Y-menu and Pin/Unpin in detail view work, the \"mixing button\" (likely Shuffle / Play Mixed / Smart Mix button in the detail view header) is now gone."
created: 2026-11-14T23:21:40Z
updated: 2026-11-14T23:23:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: "The detail-view mixing button (Enable Mix / Mix Active in PlaylistsTab.tsx) was NOT deleted in Phase 09-02; it is hidden because (1) it is gated behind audioBackend === 'spotify_client' while Phase 09 UAT ran with audio_backend = 'librespot', and (2) even when spotify_client is active, adding the Pin/Unpin button in b80815c to a non-wrapping flex header alongside an unconstrained long playlist title (>25 chars, UAT Test 1) can push/clip the rightmost Enable Mix button off-screen."
test: "Verified git show b80815c, PlaylistsTab.tsx lines 325-390, DeckifyExpandedModal.tsx lines 891 and 1011-1038, py_modules/rpc_library.py lines 304-310, and 09-UAT.md."
expecting: "Root cause confirmed."
next_action: "Return ROOT CAUSE FOUND to caller."

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: Detail view header retains all existing buttons (Play, Shuffle/Mix, etc.) alongside the new Pin to QAM / Unpin from QAM toggle added in Phase 09.
actual: User reported: "1. Ja werkt, 2. Ja werkt, 3. Y werkt, detailweergave werkt ook maar de mixing button is nu weg?, 4 Yesss"
errors: None reported
reproduction: Test 1 in UAT (Phase 09) — open PlaylistsTab or AlbumsTab detail view in DeckifyExpandedModal.
started: Discovered during UAT after Phase 09 Plan 02 edits to PlaylistsTab.tsx, AlbumsTab.tsx, LikedSongsTab.tsx.

## Eliminated
<!-- APPEND only - prevents re-investigating -->

- hypothesis: "Phase 09 Plan 02 (b80815c / 65039d1) accidentally deleted the Enable Mix button or broke the audioBackend prop in PlaylistsTab.tsx / DeckifyExpandedModal.tsx."
  evidence: "git show b80815c shows PlaylistsTab.tsx lines 375-389 still render the Enable Mix / Mix Active InteractiveRow when audioBackend === 'spotify_client', and DeckifyExpandedModal.tsx lines 891 and 1018 still pass audioBackend and handleToggleMix."
  timestamp: 2026-11-14T23:22:15Z

- hypothesis: "AlbumsTab.tsx or LikedSongsTab.tsx previously had a mixing/shuffle button in their detail view headers that was removed."
  evidence: "git show b6b4b52 on AlbumsTab.tsx and LikedSongsTab.tsx shows neither component ever had a Mix or Shuffle button."
  timestamp: 2026-11-14T23:22:36Z

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-11-14T23:21:53Z
  checked: "git show b80815c -- src/components/tabs/PlaylistsTab.tsx src/components/tabs/AlbumsTab.tsx src/components/tabs/LikedSongsTab.tsx"
  found: "b80815c only inserted the Pin/Unpin InteractiveRow (<FaThumbtack />) into the detail headers; in PlaylistsTab.tsx, {audioBackend === 'spotify_client' && (<InteractiveRow onClick={onToggleMix}>...)} remained intact right after it."
  implication: "The mixing button was not removed from source code."

- timestamp: 2026-11-14T23:22:06Z
  checked: "src/components/DeckifyExpandedModal.tsx lines 891, 1011-1038 and 09-UAT.md"
  found: "audioBackend defaults to 'librespot' (py_modules/common.py:72, DeckifyExpandedModal.tsx:891), and 09-UAT.md Test 2 explicitly states UAT was run with librespot ('while librespot is stopped and a game is running')."
  implication: "When audioBackend is 'librespot', PlaylistsTab.tsx line 375 (audioBackend === 'spotify_client') evaluates to false and omits the Enable Mix button entirely."

- timestamp: 2026-11-14T23:22:40Z
  checked: "src/components/tabs/PlaylistsTab.tsx lines 325-390 and src/components/DeckifyExpandedModal.tsx lines 905-979"
  found: "The detail header Focusable uses display: 'flex', alignItems: 'center', gap: 14 with no flexWrap: 'wrap'. The title container <div><h2>{activePlaylist.name}</h2>...</div> has no minWidth: 0 or overflow: 'hidden', and the action buttons have no flexShrink: 0. Modal root has overflow: 'hidden'."
  implication: "When testing a long playlist name (>25 chars as in UAT Test 1) with the new Pin/Unpin button added in b80815c, the rightmost Enable Mix button can also be pushed/clipped past the right edge of the content pane even when audioBackend === 'spotify_client'."

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: "Two contributing causes (config/state + layout): (1) In src/components/tabs/PlaylistsTab.tsx:375, the Enable Mix / Mix Active button is conditionally rendered only when audioBackend === 'spotify_client' (which is also enforced in py_modules/rpc_library.py:304). During Phase 09 UAT (see 09-UAT.md Test 2), audio_backend was 'librespot' (the default in py_modules/common.py:72), so the button was omitted from the DOM—it was not deleted by Phase 09-02 (commit b80815c). (2) Additionally, in PlaylistsTab.tsx:325-390, the detail header is a non-wrapping flex row where the title <div> lacks minWidth: 0 / overflow: 'hidden' and the header lacks flexWrap: 'wrap'; adding the Pin/Unpin button in b80815c alongside a long playlist name (>25 chars in UAT Test 1) can push/clip the rightmost Enable Mix button even when spotify_client is active."
fix: ""
verification: ""
files_changed: []
