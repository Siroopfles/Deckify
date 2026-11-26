---
status: diagnosed
trigger: "Investigate issue: playlist-delete-modal-b-button-breaks — Pressing B inside the Delete/Unfollow Playlist confirmation modal breaks navigation or closes parent modal"
created: 2026-11-25T20:53:01Z
updated: 2026-11-25T21:55:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: "PlaylistDeleteConfirmModal does not intercept vgp_oncancel / onCancelButton, so pressing B bubbles the cancel event out to DeckifyExpandedModal's attachNav handler (closing the underlying activePlaylist or popping navigationHistory while leaving the delete modal open) or all the way to ModalRoot (closing the entire DeckifyExpandedModal)."
test: "Inspected PlaylistDeleteConfirmModal in src/components/tabs/PlaylistsTab.tsx and vgp_oncancel handling in src/components/DeckifyExpandedModal.tsx"
expecting: "Confirmed: zero vgp_oncancel or onCancelButton handling in PlaylistDeleteConfirmModal and no crud-modal check in attachNav"
next_action: "Return ROOT CAUSE FOUND to parent orchestrator (goal: find_root_cause_only)"

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: Pressing B inside the Delete/Unfollow Playlist confirmation modal closes only the confirmation modal and returns focus to the PlaylistsTab / parent view cleanly.
actual: "Yess werkt allemaal behalve op b drukken als ik delete playlist modal zit en dan b druk gaa het mis"
errors: None reported
reproduction: Test 3 in UAT
timeline: Discovered during UAT

## Eliminated
<!-- APPEND only - prevents re-investigating -->

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-11-25T21:53:18Z
  checked: src/components/tabs/PlaylistsTab.tsx lines 199-246 (PlaylistDeleteConfirmModal) and lines 978-984
  found: PlaylistDeleteConfirmModal renders a backdrop div (modalRef) and Focusable with Cancel (data-testid="playlist-delete-cancel") and Delete/Unfollow (data-testid="playlist-delete-confirm") buttons, plus a focus-restoration useEffect. It does NOT register a vgp_oncancel listener on modalRef nor an onCancelButton prop on Focusable.
  implication: Pressing B while focus is inside PlaylistDeleteConfirmModal dispatches vgp_oncancel which bubbles unhandled out of PlaylistDeleteConfirmModal.

- timestamp: 2026-11-25T21:53:18Z
  checked: src/components/DeckifyExpandedModal.tsx lines 1485-1561 (attachNav vgp_oncancel listener) and line 1586 (ModalRootAny)
  found: attachNav registers a bubble-phase vgp_oncancel listener that checks grabCancelRef, actionTrackRef, actionCollectionRef, navigationHistoryRef, activeAlbumRef, activeArtistRef, activePlaylistRef, activeShowRef, and searchQueryRef. It does NOT check isCrudModalOpen or any cancel ref for PlaylistDeleteConfirmModal. Meanwhile, isCrudModalOpen (set via PlaylistsTab's onModalStateChange at line 1776) is only used at line 1308 to suppress useTriggerNavigation.
  implication: When B is pressed in PlaylistDeleteConfirmModal: (1) if opened from inside a playlist (activePlaylist is set), attachNav pops navigationHistoryRef or calls setActivePlaylist(null), closing the playlist view underneath while confirmDeletePlaylist stays open and previousFocusRef points to an unmounted button; (2) if opened from the Playlists overview via CollectionActionModal (activePlaylist is null), attachNav does not intercept vgp_oncancel at all, so it bubbles to ModalRootAny (onCancel={closeModal}) and closes the entire DeckifyExpandedModal.

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: "PlaylistDeleteConfirmModal (src/components/tabs/PlaylistsTab.tsx:199-246) does not intercept the SteamOS GamepadUI B-button cancel event (vgp_oncancel / onCancelButton), and DeckifyExpandedModal's attachNav vgp_oncancel listener (src/components/DeckifyExpandedModal.tsx:1489-1560) has no check for isCrudModalOpen / PlaylistDeleteConfirmModal. As a result, pressing B inside the Delete/Unfollow Playlist modal bubbles vgp_oncancel past the confirmation modal to attachNav—either closing the underlying activePlaylist / popping navigationHistory while leaving the confirmation modal orphaned, or bubbling to ModalRootAny and closing the entire DeckifyExpandedModal."
fix: ""
verification: ""
files_changed: []
