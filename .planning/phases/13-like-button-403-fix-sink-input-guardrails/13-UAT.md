---
status: testing
phase: 13-like-button-403-fix-sink-input-guardrails
source: [13-VERIFICATION.md]
started: 2026-11-16T13:21:35+01:00
updated: 2026-11-16T13:21:35+01:00
---

## Current Test

number: 1
name: Live Like/Unlike & CDP Fallback on Steam Deck
expected: |
  Like/unlike tracks in Expanded Modal & QAM in both librespot and spotify_client modes without HTTP 403 errors; heart indicators accurately reflect saved library state, and CDP LibraryAPI fallback works if Web API returns 403 in spotify_client mode.
awaiting: user response

## Tests

### 1. Live Like/Unlike & CDP Fallback on Steam Deck
expected: Like/unlike tracks in Expanded Modal & QAM in both librespot and spotify_client modes without HTTP 403 errors; heart indicators accurately reflect saved library state, and CDP LibraryAPI fallback works if Web API returns 403 in spotify_client mode.
result: [pending]

### 2. Live PipeWire Sink-Input Isolation on Steam Deck
expected: Switch audio output / trigger volume ducking while a game and Steam UI navigation sounds are active; only Spotify/Deckify streams (librespot, com.spotify.client, deckify_eq_out) move or fade, and steamwebhelper, Chromium, and game audio remain untouched.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
