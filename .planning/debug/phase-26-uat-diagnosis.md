---
status: diagnosed
trigger: "Phase 26 UAT gaps (G-26-2, G-26-3) and Test 3 (26-07 Steam Machine Boot/Wake Remote Phone Playback Guardrail) code verification"
created: 2026-11-26T16:00:00Z
updated: 2026-11-26T16:05:00Z
---

## Current Focus

hypothesis: Confirmed root causes for G-26-2 and G-26-3, and completed code verification for Test 3.
test: All relevant files inspected (py_modules/cdp_bridge.py, py_modules/rpc_library.py, py_modules/rpc_playback.py, py_modules/spotify.py, py_modules/resilience.py, py_modules/mpris.py, py_modules/soundtrack.py, main.py, src/components/tabs/NowPlayingTab.tsx, src/components/tabs/SearchTab.tsx, src/components/DeckifyExpandedModal.tsx, src/hooks/usePlaybackStatus.ts, src/index.tsx).
expecting: N/A (diagnosis complete)
next_action: Return structured diagnosis to orchestrator.

## Symptoms

expected: |
  G-26-2: Made For You carousel populates core mixes (Daylist, Discover Weekly, Release Radar, Daily Mixes, On Repeat); opening Daylist shows dynamic custom title & description; NowPlayingTab AI DJ button & speaking indicator behave appropriately; DJ X interlude updates cover art and interlude text ("Welcome", "Up next").
  G-26-3: Start Radio on librespot and SearchTab work without 429 rate limiting; app-wide Spotify Web API requests are properly rate-limited/cached/throttled.
  Test 3: 26-07 remote phone playback guardrail has no remaining bugs in MPRIS2, _poll_playback, handle_wake_recovery, and SoundtrackManager.
actual: |
  G-26-2: Made For You only shows Discover Weekly; Daylist/Release Radar/Daily Mixes/On Repeat missing; AI DJ button visible in NowPlayingTab even when AI DJ is NOT playing; DJ X image/cover and interlude text do not update in NowPlayingTab when DJ X speaks.
  G-26-3: Start Radio errors on librespot; SearchTab not working (429 rate limiting).
  Test 3: Skipped in UAT due to rate limit; code verification requested.
errors: "Spotify API 429 rate limiting on librespot radio and SearchTab"
reproduction: "Phase 26 UAT Tests 1, 2, and Test 3 code inspection"
started: "Phase 26 UAT (after 26-09)"

## Eliminated

## Evidence

- timestamp: 2026-11-26T16:01:00Z
  checked: py_modules/cdp_bridge.py:642-794 (cdp_fetch_discovery_mixes) & py_modules/rpc_library.py:1977-2068 (_fetch_made_for_you_section)
  found: |
    1) classifyKind() in cdp_bridge.py:656-670 only matches coreRe (/\b(daylist|...)\b/i) against `name`. Daylist has a dynamic title (e.g. "chill indie thursday afternoon") that does not contain "daylist" or "mix", so Daylist is classified as "editorial" and dropped at line 684.
    2) HomeAPI / GraphQL / SearchAPI in cdp_bridge.py:708-790 swallow errors into `warnings` (only logged at debug) and fall back to RootlistAPI (which only contains followed/saved playlists like Discover Weekly and Your Blends).
    3) _search_missing_core_mixes() in rpc_library.py:1924-1974 breaks immediately on SpotifyRateLimitError (line 1954), and Web API /v1/search no longer reliably returns personalized mixes.
    4) _fetch_made_for_you_section() at rpc_library.py:2031-2060 overwrites discovery_mixes.json with only the partial core_mixes (Discover Weekly) whenever cdp_active and any blend/mix is present, instead of merging/preserving prior core mixes.
  implication: Explains why Made For You only shows Discover Weekly (while Your Blends renders in its own row) and Daylist cannot be opened.

- timestamp: 2026-11-26T16:02:00Z
  checked: src/components/tabs/NowPlayingTab.tsx:535-570, 710 & NowPlayingTab.test.tsx:595-608
  found: renderAiDjButton() only checks `if (!onPlayAiDj) return null;`. Since DeckifyExpandedModal always passes onPlayAiDj, the "AI DJ" button (and "Requires Official Spotify Client" on librespot) is rendered on every track even when aiDjActive is false.
  implication: Explains why the AI DJ button is always visible in NowPlayingTab when AI DJ is not playing.

- timestamp: 2026-11-26T16:02:30Z
  checked: py_modules/cdp_bridge.py:491-539 (cdp_get_player_state) & main.py:2271-2305 (_poll_playback)
  found: |
    1) cdp_get_player_state() does not extract item images/cover art or interlude metadata/artist/subtitle (e.g. "Welcome", "Up next") from PlayerAPI.getState().
    2) In main.py:2276, `if not is_dj_ctx and currently_playing_type == "unknown"` skips calling cdp_get_player_state when context_uri is already the AI DJ playlist.
    3) In main.py:2291-2304, when item is None during an AI DJ interlude, _poll_playback returns True at line 2304 without updating self._track_meta or emitting track_metadata/librespot_event, leaving the previous track's cover/title/artist on screen.
  implication: Explains why DJ X's cover art and interlude text ("Welcome", "Up next") do not update in NowPlayingTab.

- timestamp: 2026-11-26T16:03:00Z
  checked: App-wide Spotify Web API callers and pollers (py_modules/spotify.py, main.py, py_modules/resilience.py, py_modules/rpc_playback.py, py_modules/rpc_library.py, src/components/DeckifyExpandedModal.tsx, src/components/tabs/SearchTab.tsx)
  found: |
    1) Global 429 circuit breaker in py_modules/spotify.py:26-96 (_BREAKER_BASE_SECONDS=5.0, _BREAKER_MAX_SECONDS=300.0) has NO proactive rate-limiting, request pacing, or GET response cache, and locks out ALL Spotify Web API endpoints app-wide when any single caller triggers 429.
    2) Backend _poll_api_loop (main.py:2585-2605) calls _spotify_api_request("me/player") every 3.0s (POLL_INTERVAL_FAST_S) continuously whenever audio_backend == "spotify_client" (EventServer.is_healthy() returns False at resilience.py:426) or when playing on remote devices (~1,200 req/hr), and keeps hitting me/player whenever the breaker resets.
    3) start_radio Tier 3 on librespot (rpc_playback.py:1250-1469) fires up to 13 sequential Web API requests in a single call, catches generic Exception (swallowing SpotifyRateLimitError), and keeps hammering the API.
    4) SearchTab.tsx:898+913/921 fires duplicate search() calls on tile/history click (immediate runSearch + 350ms debounced useEffect), and rpc_library.py:1535-1591 always calls Web API search + me/library/contains even when spotify_client CDP SearchAPI is available.
    5) DeckifyExpandedModal.tsx:489 polls get_queue() (me/player/queue) every 10s; DeckifyExpandedModal.tsx:898-905 polls get_recently_played() (me/player/recently-played) every 10s + bursts at 0s/3s/8s on track change.
    6) _fetch_made_for_you_section + get_discovery_feed fire multiple search/me/playlists/top/new-releases calls on cache miss.
  implication: Explains why librespot Start Radio and SearchTab hit 429 rate limits and get locked out by the global circuit breaker.

- timestamp: 2026-11-26T16:04:00Z
  checked: Test 3 (26-07) across py_modules/mpris.py, main.py, py_modules/resilience.py, py_modules/soundtrack.py
  found: |
    1) MPRIS2 (mpris.py:1291-1300, 1389-1390): sync_from_plugin() forces PlaybackStatus="Stopped" when not is_local_device_active(); Pause and Stop commands early-return when not is_local_device_active().
    2) _poll_playback (main.py:2454-2467): computes is_local via is_device_dict_local(self, device) and sets was_playing=bool(is_playing and is_local), so remote phone playback never snapshots was_playing=True.
    3) handle_wake_recovery (resilience.py:968-981): checks _fetch_current_player() and yields with held_reason="remote_active" when remote playback is active.
    4) SoundtrackManager (soundtrack.py:503-516): both unbound pause branches check `and resilience.is_local_device_active(self.plugin)` before calling self._pause().
    Minor edge case noted: is_local_device_active() (resilience.py:225-230) returns True when self._active_device is None (e.g. at fresh boot before first _poll_playback).
  implication: Test 3 guardrails are all properly implemented in code.

## Resolution

root_cause: |
  G-26-2: (1) cdp_fetch_discovery_mixes drops Daylist as 'editorial' because Daylist's dynamic title doesn't match coreRe, while HomeAPI/GraphQL/SearchAPI failures are swallowed and Web API _search_missing_core_mixes breaks on 429, leaving only followed mixes (Discover Weekly, Your Blends) and overwriting discovery_mixes.json; (2) NowPlayingTab.renderAiDjButton renders unconditionally whenever onPlayAiDj is provided instead of gating on aiDjActive (or user preference); (3) cdp_get_player_state omits DJ X cover art and interlude title/subtitle, and _poll_playback skips CDP state when already in DJ context and returns early without updating _track_meta when item is None.
  G-26-3: No proactive app-wide rate limiter/cache in _spotify_api_request; global 429 breaker (up to 300s) is tripped and kept open by continuous 3s me/player polling on spotify_client, 13-call unthrottled Tier 3 radio cascades on librespot, duplicate SearchTab queries, and 10s queue/recent pollers.
fix: ""
verification: "Diagnose-only mode; Test 3 code guardrails verified."
files_changed: []
