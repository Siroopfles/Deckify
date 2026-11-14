---
status: testing
phase: 09-qam-pinned-playlists-quick-in-game-switch
source: [09-VERIFICATION.md]
started: 2026-11-15T00:04:55+01:00
updated: 2026-11-15T00:04:55+01:00
---

## Current Test

number: 1
name: Pin a playlist or album with a long name (>25 characters) and open the Steam Quick Access Menu (QAM) on Steam Deck
expected: |
  The pill name truncates to a single line with an ellipsis ('...') inside maxWidth: 140px without wrapping to 2 lines or clipping the 20x20px DeckifyImage thumbnail.
awaiting: user response

## Tests

### 1. Pin a playlist or album with a long name (>25 characters) and open the Steam Quick Access Menu (QAM) on Steam Deck
expected: The pill name truncates to a single line with an ellipsis ('...') inside maxWidth: 140px without wrapping to 2 lines or clipping the 20x20px DeckifyImage thumbnail.
result: [pending]

### 2. Scroll horizontally across 4 pinned pills in QAM using D-pad Left/Right, then click a pill while librespot is stopped and a game is running
expected: D-pad Left/Right scrolls the overflowX: auto pill strip cleanly, Bind current music to game shows a visible controller focus highlight, and playback begins within ~2 seconds without leaving the game.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
