---
status: complete
phase: 09-qam-pinned-playlists-quick-in-game-switch
source: [09-VERIFICATION.md]
started: 2026-11-15T00:04:55+01:00
updated: 2026-11-14T23:39:34.916Z
---

## Current Test

[testing complete]

## Tests

### 1. Pin a playlist or album with a long name (>25 characters) and open the Steam Quick Access Menu (QAM) on Steam Deck
expected: The pill name truncates to a single line with an ellipsis ('...') inside maxWidth: 140px without wrapping to 2 lines or clipping the 20x20px DeckifyImage thumbnail.
result: pass

### 2. Scroll horizontally across 4 pinned pills in QAM using D-pad Left/Right, then click a pill while librespot is stopped and a game is running
expected: D-pad Left/Right scrolls the overflowX: auto pill strip cleanly, Bind current music to game shows a visible controller focus highlight, and playback begins within ~2 seconds without leaving the game.
result: pass

## Summary

total: 2
passed: 2
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-09-1
  truth: "The pill name truncates to a single line with an ellipsis ('...') inside maxWidth: 140px without wrapping to 2 lines or clipping the 20x20px DeckifyImage thumbnail."
  status: resolved
  resolved_by: 09-03-PLAN.md
  resolved_at: 2026-11-15
  reason: "User reported: 1. Ja werkt, 2. Ja werkt, 3. Y werkt, detailweergave werkt ook maar de mixing button is nu weg?, 4 Yesss"
  severity: major
  test: 1
  root_cause: "PlaylistsTab.tsx:375 gates the Enable Mix / Mix Active button on audioBackend === 'spotify_client' (omitted when librespot is active), and the detail header flex row (lines 325-390) lacks minWidth: 0 / overflow: hidden on the title container and flexShrink: 0 on action buttons so long playlist names alongside the new Pin/Unpin button can push/clip the rightmost Mix button."
  artifacts:
    - path: "src/components/tabs/PlaylistsTab.tsx"
      issue: "Mix button gated on audioBackend === 'spotify_client' without disabled/info state on librespot, and detail header flex row lacks minWidth: 0 / flexShrink: 0 / flexWrap"
  missing:
    - "Harden PlaylistsTab.tsx detail header flex layout (minWidth: 0 + overflow/ellipsis on title container, flexShrink: 0 on action buttons, or flexWrap: wrap) so Pin/Unpin never pushes Mix off-screen"
    - "Clarify or preserve visible Mix state on non-spotify_client backends (or show disabled/tooltip indicator) if appropriate"
  debug_session: ".planning/debug/detail-view-missing-mixing-button.md"
- gap_id: G-09-2
  truth: "D-pad Left/Right scrolls the overflowX: auto pill strip cleanly, Bind current music to game shows a visible controller focus highlight, and playback begins within ~2 seconds without leaving the game."
  status: resolved
  resolved_by: 09-03-PLAN.md
  resolved_at: 2026-11-15
  reason: "User reported: Yes werkt ik zie alleen geen selection highlight op de playlists wel op de bind button"
  severity: major
  test: 2
  root_cause: "In src/index.tsx (lines 660-677), the pinned playlist pills use @decky/ui DialogButton with inline border, background, and color styles that override SteamOS GamepadUI's .gpfocus CSS highlight, and the overflowX: auto strip has 0px horizontal padding (padding: '4px 0') which clips edge focus rings."
  artifacts:
    - path: "src/index.tsx"
      issue: "Pinned playlist DialogButton inline border/background/color overrides mask .gpfocus highlight; overflowX: auto container has 0px horizontal padding"
  missing:
    - "Replace inline-styled DialogButton pills with a focus-tracked PinnedPill component (using Focusable noFocusRing + onFocus/onBlur/onGamepadFocus/onGamepadBlur + focusHalo/visible border+boxShadow) or remove inline style overrides"
    - "Add horizontal padding (e.g. padding: '4px 4px') on the overflowX: auto pill strip container so edge focus rings are not clipped"
  debug_session: ".planning/debug/qam-pinned-pills-no-selection-highlight.md"

## Deferred Follow-Ups

- test: 2
  idea: "QAM UX/styling verbeteren en ooit kijken naar hoe Steamcord is gemaakt en hoe zij dit aanpakken"
  deferred_at: 2026-11-15
