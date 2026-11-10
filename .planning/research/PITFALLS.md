# Pitfalls Research: Common Pitfalls in Steam Deck & Spotify Plugins

**Domain:** SteamOS Decky Loader & Spotify Audio Integration  
**Researched:** 2026-11-10  
**Confidence:** HIGH  

## Critical Pitfalls

### Pitfall 1: Spotify API Rate Limiting (HTTP 429) & Rapid Image RPC Flooding

**What goes wrong:**
When opening a tab with hundreds of tracks or playlists, spawning 50+ simultaneous image requests over `@decky/api` RPC starves the Python threadpool, delays player status calls, and triggers Spotify HTTP 429 rate limit backoffs.

**Why it happens:**
Frontend components render track lists without batching image requests or concurrency limits.

**How to avoid:**
1. Implement client-side concurrency limiter in `DeckifyImage` (max 4-6 concurrent image RPC fetches).
2. Maintain LRU memory cache in JavaScript so seen images never touch Python twice per session.
3. Keep disk cache in Python with fast atime index.

**Warning signs:**
UI freezing when switching to "Liked Songs" or album views; 429 errors in Decky backend logs.

---

### Pitfall 2: Gamepad Spatial Navigation Trapping & Synthetic Event Failure

**What goes wrong:**
Adding custom keyboard listeners (`onKeyDown`) for `ArrowLeft`/`ArrowRight` on seekbars fails on Steam Deck hardware because GamepadUI's internal spatial navigation captures directional inputs before standard DOM key events fire.

**Why it happens:**
Desktop web browser keyboard assumptions do not translate directly to Steam GamepadUI CEF controller mapping.

**How to avoid:**
Use `@decky/ui` components (`SliderField`, `ProgressBarField`) or wrap interactive controls with explicit `Focusable` containers that handle controller action hooks (`onButtonDown`, `onOKActionDescription`).

**Warning signs:**
Works in desktop browser test with arrow keys, but controller D-pad cannot navigate into or scrub the seek bar on the Steam Deck.

---

### Pitfall 3: Stale Playback State vs. Interpolated UI Ticker Desynchronization

**What goes wrong:**
The displayed playback time jumps backwards, freezes, or fails to tick smoothly every second.

**Why it happens:**
Relying solely on `status.position_ms` from Spotify Web API creates stutter because the Web API only reports a position snapshot from the moment the call occurred. If the UI resets its timer to `status.position_ms` every poll without factoring in elapsed wall-clock time (`Date.now() - timestamp`), the progress counter constantly resets or jerks.

**How to avoid:**
Record the exact timestamp (`fetched_at = Date.now()`) when `status.position_ms` is received. In the 1-second interval, compute:
`currentPosition = isPlaying ? Math.min(duration, basePosition + (Date.now() - fetchedAt)) : basePosition`.

**Warning signs:**
Now Playing timestamp staying static until the song changes or jumping erratically.

---

### Pitfall 4: Queue URI vs. Context URI Mismatch in Spotify Web API

**What goes wrong:**
Clicking an item in the queue either plays a completely different song or restarts the entire album/playlist from track 0.

**Why it happens:**
In Spotify Web API (`PUT /v1/me/player/play`), if you provide `uris: [...]` with an offset, Spotify expects a clean list of track URIs. If the queue tracks come from multiple contexts (e.g. some from a playlist, some from radio, some manually queued via `add_to_queue`), slicing the queue and sending it as a static list breaks context playback.

**How to avoid:**
Inspect track URI structure; if playing from queue, handle individual track jumping via `play_tracks` with exact target URI, or trigger `next` steps if target is upcoming.

---

### Pitfall 5: Pre-Commit Hook Timeouts on Windows / Git Tracking

**What goes wrong:**
Git commits hang or fail with `git commit timed out after 30s` due to Husky running full TypeScript typechecking, Vitest, Rollup build, and 316 Python tests on every commit.

**Why it happens:**
Pre-commit hook runs heavy test suites on all commits, even documentation-only planning commits.

**How to avoid:**
Ensure planning doc updates skip heavy verification hooks (`--no-verify` for docs) or configure `lint-staged` to only trigger typechecks/tests when `.ts`, `.tsx`, or `.py` code changes.

---
*Pitfalls research compiled for Deckify milestone planning.*
