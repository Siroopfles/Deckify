# Phase 11: Home & Discovery Hub Tab - Research

**Researched:** 2026-11-15
**Domain:** SteamOS GamepadUI React (`@decky/ui`, `@decky/api`) + Python Spotify Web API client & in-memory TTL caching
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Add `"Discovery"` in `Sidebar.tsx` right after Now Playing / Lyrics (top of the Browse section), keeping Now Playing as the #1 sidebar item.
- **D-02:** When opening `DeckifyExpandedModal`, keep **Now Playing** as the default tab when a track is active, and open **Discovery** when nothing is playing.
- **D-03:** Render `DiscoveryTab.tsx` with a **time-of-day contextual greeting header** (`Good morning` / `Good afternoon` / `Good evening`) followed by horizontal carousels in this order: **Made For You mixes**, **Top Tracks**, **Top Artists**, and **New Releases**.
- **D-04:** Populate **Made For You mixes** by matching Spotify-owned mixes (`owner.id == "spotify"`: Discover Weekly, Release Radar, Daily Mix, Daylist) from the user's library (`me/playlists`), with a **Jump Back In** (recently played contexts) fallback if the user follows no Spotify mixes.
- **D-05:** Render carousel items as **square artwork cards (~120–130px)** with 2-line title + subtitle, showing 10–15 items per horizontal `<Focusable flow-children="horizontal">` carousel, with all external images proxied through `<DeckifyImage src={url} />`.
- **D-06:** Bump `CURRENT_SCOPES_VERSION` (from `6` to `7`) in `py_modules/auth.py` / `py_modules/common.py` to include `user-top-read` — **Reversibility:** `costly` — bumping `CURRENT_SCOPES_VERSION` triggers a one-time re-authentication prompt for existing users; if a session has not yet re-authenticated and `/me/top/*` returns HTTP 403, render a clean `"Re-authenticate to unlock Top Tracks & Top Artists"` card in those sections while keeping Made For You and New Releases working.
- **D-07:** Render a **shared time-range pill bar** (`4 Weeks` / `6 Months` / `All Time`, mapping to `short_term` / `medium_term` / `long_term`, defaulting to `6 Months`) that updates both Top Tracks and Top Artists together.
- **D-08:** Card press (`A` button) behavior by item type:
  - **Top Track:** Play immediately (passing the Top Tracks URIs sequence so Next/Prev works).
  - **Top Artist:** Drill into the Artist detail view.
  - **Mix / Playlist / Album:** Drill into the Playlist / Album tracklist view (so the user can browse/open the list), while the `Y` action menu provides quick **Play** and **Pin to QAM** actions.
- **D-09:** Cache discovery feeds in memory with **1-hour TTL** for Top Tracks & Top Artists (keyed per `time_range`) and **4-hour TTL** for New Releases & Made For You mixes, plus a compact **Refresh** button in the `DiscoveryTab` header to bypass cache on demand.
- **D-10:** Implement a global **exponential-backoff HTTP 429 circuit breaker** in `py_modules/spotify.py` (respecting `Retry-After` headers, capping backoff, and failing fast while open). When the circuit breaker is open or an upstream 429 occurs, serve **stale cached discovery data** if available alongside a subtle `"Rate limited — showing cached feed"` banner (or a friendly cooldown notice if no cached data exists yet).

### the agent's Discretion
- Exact circuit breaker backoff schedule, failure-threshold window, and stale-cache fallback metadata shape in `py_modules/spotify.py` / `py_modules/rpc_library.py`.
- Exact icon choice in `Sidebar.tsx` and horizontal scroll/focus restoration details in `DiscoveryTab.tsx`.
- Whether `Y` action menu on Top Tracks reuses `TrackActionModal` (Like, Add to Queue, Add to Playlist) and `CollectionActionModal` for mixes/albums.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within Phase 11 scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DISC-01 | User can navigate to a dedicated "Discovery" / "Made For You" tab in the expanded modal to browse personalized Spotify recommendations. | `ViewMode` + `ALL_MODES` registration in `src/types.ts`, `Sidebar.tsx` placement after `Lyrics`, and `DeckifyExpandedModal.tsx` non-blocking initial-tab resolution (`now_playing` when active, `discovery` when idle). |
| DISC-02 | User can browse and play their Top Tracks, Top Artists (short/medium/long term), personalized algorithmic mixes (Discover Weekly, Release Radar), and New Releases. | `get_discovery_feed` RPC in `py_modules/rpc_library.py` + `main.py` aggregating `me/playlists` (`owner.id == "spotify"` with `me/player/recently-played` Jump Back In fallback), `me/top/tracks`, `me/top/artists`, and `browse/new-releases` (with Dev Mode `search?q=tag:new&type=album` fallback); `DiscoveryTab.tsx` horizontal `<Focusable flow-children="horizontal">` carousels with `128px` `<DeckifyImage>` cards, `A` play/drill-down, and `Y` `TrackActionModal` / `CollectionActionModal`. |
| DISC-03 | Discovery feed requests are cached with an in-memory TTL and protected by an HTTP 429 rate-limit circuit breaker. | Global thread-safe 429 circuit breaker in `py_modules/spotify.py:_spotify_api_request` (fixing missing `import time` and replacing blocking sleep with fast-fail cooldown state) + per-section in-memory TTL cache (`1h` for `me/top/*` keyed by `time_range`, `4h` for Made For You & New Releases) with stale-cache fallback on 429/open breaker. |
</phase_requirements>

## Project Constraints (from GEMINI.md)

- **Steam CEF Content Security Policy:** Steam GamepadUI blocks direct external image URLs (`https://i.scdn.co/`). All artwork MUST render via `<DeckifyImage src={url} />` (`src/components/common/DeckifyImage.tsx`).
- **SteamOS GamepadUI Navigation:** Horizontal containers MUST use `<Focusable flow-children="horizontal">` (never `flow-children="row"`, which causes vertical focus jumps).
- **Rate Limiting:** Continuous polling is strictly restricted to `me/player`; discovery endpoints must be fetched on demand with in-memory TTL caching.
- **Process/Sandbox Isolation:** No duplicate `py_modules` under `bin/`; RPC methods must catch exceptions and return structured `{ "ok": False, "error": ... }` dicts without crashing the event loop.
- **Testing & Linting Gates:** TypeScript (`tsc --noEmit`), ESLint (`eslint src/`), Vitest (`vitest run`), and Python `unittest` (`py -m unittest discover -s tests -p "test_*.py"`) must all pass.

## Summary

Phase 11 adds a personalized `"Discovery"` hub tab to `DeckifyExpandedModal` (`Sidebar.tsx`, `DiscoveryTab.tsx`) backed by a new `get_discovery_feed(time_range, force_refresh)` RPC in `py_modules/rpc_library.py` / `main.py` and a global HTTP 429 exponential-backoff circuit breaker in `py_modules/spotify.py`. No new external npm or Python dependencies are required; the entire implementation builds on existing Deckify primitives (`DeckifyImage`, `InteractiveRow`, `focusHalo`, `TrackActionModal`, `CollectionActionModal`, `_spotify_api_request`).

Two critical technical findings shape the implementation plan:
1. **Spotify Web API 2024–2026 Development Mode restrictions:** Spotify removed `GET /browse/new-releases` (and capped `GET /search` to `limit=10`) for standard Development Mode apps, returning HTTP `403` or `404`. Because Deckify users authenticate with their own Spotify Developer apps in Development Mode, `get_discovery_feed` must isolate each section's fetch, treat `403` on `/me/top/*` as a `"needs_reauth"` section flag (for users who haven't re-authed after `CURRENT_SCOPES_VERSION` bumps from `6` to `7`), and fall back to `GET /search?q=tag:new&type=album&limit=10` if `GET /browse/new-releases` fails with `403`/`404`.
2. **Existing `py_modules/spotify.py` 429 bug & `DeckifyExpandedModal` test coupling:** `py_modules/spotify.py:44-46` currently calls `time.sleep(min(retry_after, 2))` without `import time` at the top of the module, which raises `NameError` on a real 429. Replacing that with a thread-safe exponential-backoff circuit breaker (`SpotifyRateLimitError` / `Retry-After` aware) fixes the bug and protects all Spotify Web API calls uniformly. On the frontend, `DeckifyExpandedModal.test.tsx:427` relies on `mode` being the first `useState` call (`stateValues[0]`), so `D-02` (defaulting to `discovery` when nothing is playing) must keep `useState<ViewMode>("now_playing")` as the initial state and switch to `"discovery"` in a one-shot `useEffect` once `status` resolves as idle.

**Primary recommendation:** Implement the global 429 circuit breaker in `py_modules/spotify.py` and section-isolated TTL cache + `get_discovery_feed` RPC in `py_modules/rpc_library.py` first (Plan 01), then wire `ViewMode`, `Sidebar.tsx`, `DiscoveryTab.tsx`, and `DeckifyExpandedModal.tsx` (Plan 02).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| HTTP 429 exponential-backoff circuit breaker | API / Backend (`py_modules/spotify.py`) | — | Centralizes rate-limit protection for all Spotify Web API calls across RPCs. |
| Discovery feed aggregation & TTL cache | API / Backend (`py_modules/rpc_library.py`) | RPC Bridge (`main.py`) | Keeps `1h`/`4h` in-memory cache, `owner.id == "spotify"` filtering, and `needs_reauth` / `stale` metadata off the CEF renderer. |
| OAuth scope version bump (`user-top-read`) | API / Backend (`py_modules/common.py`) | — | `CURRENT_SCOPES_VERSION = 7` drives `get_auth_status().needs_reauth` automatically (`main.py:982`). |
| Horizontal carousels, D-pad focus & `scrollIntoView` | Browser / Client (`src/components/tabs/DiscoveryTab.tsx`) | `DeckifyExpandedModal.tsx` | SteamOS GamepadUI spatial navigation (`flow-children="horizontal"`) and focus tracking live in React. |
| Cover art CSP proxying | Browser / Client (`DeckifyImage.tsx`) | API / Backend (`py_modules/images.py`) | Existing LRU-cached base64 proxy bypasses Steam CEF CSP for all card artwork. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@decky/ui` | `^4.11.1` `[VERIFIED: package.json:29]` | `Focusable`, `ModalRoot` spatial navigation primitives | Official SteamOS GamepadUI component library |
| `@decky/api` | `^1.1.3` `[VERIFIED: package.json:46]` | `callable` RPC bridge to Python backend | Official Decky Loader IPC mechanism |
| `react-icons` | `^5.5.0` `[VERIFIED: package.json:48]` | `FaCompass` / `FaSyncAlt` / `FaPlay` icons | Already bundled; matches `Sidebar.tsx` (`react-icons/fa`) |
| Python stdlib (`urllib.request`, `time`, `threading`) | Python 3.11+ / 3.14 `[VERIFIED: local python 3.14.0]` | HTTP client, monotonic timestamps, thread-safe breaker & TTL cache | Zero external runtime dependencies in Decky Python sandbox |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `DeckifyImage` | In-repo `[VERIFIED: src/components/common/DeckifyImage.tsx]` | Base64 CSP image proxy | Every artwork card in `DiscoveryTab.tsx` |
| `TrackActionModal` & `CollectionActionModal` | In-repo `[VERIFIED: src/components/common/TrackActionModal.tsx, CollectionActionModal.tsx]` | `Y`-button controller action overlays | `Y` press on Top Tracks (`TrackActionModal`) and Mixes/Albums (`CollectionActionModal`) |
| `focusHalo` | In-repo `[VERIFIED: src/components/common/InteractiveRow.tsx:4-15]` | Unified green/white controller focus ring | Carousel cards, time-range pills, and `Refresh Feed` button |

**Installation:** No new packages required (`pnpm install` / `pip install` not needed).

## Package Legitimacy Audit

No external packages are installed in Phase 11. All functionality uses existing dependencies in `package.json` and the Python standard library.

## Architecture Patterns

### System Architecture Diagram

```text
┌───────────────────────────────────────────────────────────────────────────┐
│ Browser / Steam CEF (DeckifyExpandedModal + DiscoveryTab)                 │
│                                                                           │
│  Sidebar ("discovery") ──▶ DiscoveryTab (greeting, 4W/6M/All, Refresh)    │
│                               │                                           │
│                               ├── A on Track ──▶ handlePlayTrack(allUris) │
│                               ├── A on Artist ─▶ handleOpenArtist(art)    │
│                               ├── A on Mix/Alb ─▶ handleOpenPlaylist/Album│
│                               └── Y on Card ───▶ TrackActionModal /       │
│                                                  CollectionActionModal    │
└───────────────────────────────┬───────────────────────────────────────────┘
                                │ callable("get_discovery_feed")
                                ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ Backend RPC (main.py ──▶ py_modules/rpc_library.py)                       │
│                                                                           │
│  get_discovery_feed(time_range, force_refresh)                            │
│    ├── Check section TTL caches (1h top_*, 4h mixes & new_releases)       │
│    ├── If cache valid & !force_refresh ──▶ return cached sections         │
│    └── Else fetch per-section via _spotify_api_request:                   │
│          ├── me/playlists (owner.id=="spotify") ─▶ fallback recently-played│
│          ├── me/top/tracks?time_range=...  (403 ─▶ needs_reauth flag)     │
│          ├── me/top/artists?time_range=... (403 ─▶ needs_reauth flag)     │
│          └── browse/new-releases (403/404 ─▶ search?q=tag:new&type=album) │
│                │                                                          │
│                ▼ on SpotifyRateLimitError (429 / open breaker)            │
│          Serve stale cache + { rate_limited: true, stale: true }          │
└───────────────────────────────┬───────────────────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ Spotify HTTP Client (py_modules/spotify.py)                               │
│                                                                           │
│  _spotify_api_request()                                                   │
│    ├── Pre-flight: if time.monotonic() < _breaker_open_until ──▶ fail fast│
│    ├── Success: reset consecutive 429 count & breaker                     │
│    └── HTTP 429: compute max(Retry-After, exp backoff capped at 300s),    │
│                  open breaker, raise SpotifyRateLimitError                │
└───────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```text
py_modules/
├── common.py                 # Bump CURRENT_SCOPES_VERSION = 7, add user-top-read to SPOTIFY_SCOPES
├── spotify.py                # Add import time, SpotifyRateLimitError, global 429 circuit breaker
└── rpc_library.py            # Add _DISCOVERY_CACHE + get_discovery_feed(plugin, time_range, force_refresh)
main.py                       # Expose async def get_discovery_feed(self, time_range="medium_term", force_refresh=False)
src/
├── types.ts                  # Add "discovery" to ViewMode & ALL_MODES; add DiscoveryFeedResponse types
└── components/
    ├── common/Sidebar.tsx    # Add Discovery SidebarBtn right after Lyrics
    ├── DeckifyExpandedModal.tsx  # Wire "discovery" tab, idle default-tab effect, Y-button focus refs
    └── tabs/DiscoveryTab.tsx # New Discovery hub view with 4 horizontal carousels
```

### Pattern 1: Global Exponential-Backoff HTTP 429 Circuit Breaker (`py_modules/spotify.py`)
**What:** A thread-safe circuit breaker guarding `_spotify_api_request` using `time.monotonic()` and `threading.Lock()`.
**When to use:** Every Spotify Web API call passes through `_spotify_api_request` (`py_modules/spotify.py:16-48`), which runs inside `_exec` thread-pool executors.
**Design details:**
- Define `class SpotifyRateLimitError(RuntimeError)` with `retry_after: float` attribute so callers (`rpc_library.py`) can distinguish rate limits from generic errors and serve stale cache.
- Maintain module-level state under `_BREAKER_LOCK = threading.Lock()`:
  - `_breaker_failures: int = 0`
  - `_breaker_open_until: float = 0.0` (monotonic timestamp)
  - Helper `_reset_rate_limit_breaker()` for unit tests and clean resets on HTTP 2xx.
- **Pre-flight check:** Before `urllib.request.urlopen`, check if `now < _breaker_open_until`. If open, immediately raise `SpotifyRateLimitError(retry_after=remaining)` without hitting the network.
- **On HTTP 429:** Read `Retry-After` header (default `1`, parse safely via `float`/`int`), increment `_breaker_failures`, compute exponential backoff `min(300.0, max(retry_after, 5.0 * (2 ** min(_breaker_failures - 1, 6))))` (5s → 10s → 20s → 40s → 80s → 160s → 300s cap), set `_breaker_open_until = time.monotonic() + cooldown`, and raise `SpotifyRateLimitError(retry_after=cooldown)`.
- **On HTTP 2xx/204:** Reset `_breaker_failures = 0` and `_breaker_open_until = 0.0`.

### Pattern 2: Section-Isolated In-Memory TTL Cache (`py_modules/rpc_library.py`)
**What:** Per-section TTL cache with `1h` (`3600s`) for `top_tracks:{time_range}` and `top_artists:{time_range}`, and `4h` (`14400s`) for `made_for_you` and `new_releases`.
**Why section-isolated:**
- `time_range` changes (`short_term`, `medium_term`, `long_term`) only invalidate/query `top_tracks` and `top_artists`; `made_for_you` and `new_releases` remain cached for 4 hours.
- If `/me/top/*` returns HTTP 403 (`needs_reauth`), `made_for_you` and `new_releases` still populate and render.
- If `SpotifyRateLimitError` is raised (either 429 or open breaker), return the stale cached data for any section that has it, setting `stale: True` and `rate_limited: True` (plus `retry_after` seconds) in the RPC response.
- Always validate `time_range` against `("short_term", "medium_term", "long_term")`, defaulting invalid inputs to `"medium_term"`.

### Pattern 3: Horizontal Carousel Focus & `scrollIntoView` (`DiscoveryTab.tsx`)
**What:** Each carousel uses `<Focusable flow-children="horizontal" style={{ display: "flex", gap: 16, overflowX: "auto", padding: "6px 4px 10px" }}>`.
**Card focus handling:** Each `128px × 128px` card is a `<Focusable noFocusRing>` with:
- `onClick` / `onActivate` for `A`-button action (`onPlayTrack`, `onOpenArtist`, `onOpenPlaylist`, `onOpenAlbum`)
- `onFocus` / `onGamepadFocus` calling `el.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" })` AND updating `onFocusTrack` / `onFocusCollection` so pressing `Y` opens `TrackActionModal` or `CollectionActionModal` for the currently focused card.
- `focusHalo(focused)` (`0 0 0 2px #fff, 0 0 12px rgba(29, 185, 84, 0.7)`) and `padding: "6px 4px 10px"` on the horizontal strip so the `2px` ring + `12px` glow are never clipped by `overflowX: "auto"`.

### Pattern 4: Non-Breaking Default Tab Selection (`DeckifyExpandedModal.tsx`)
**What:** `D-02` requires opening `"now_playing"` when a track is active and `"discovery"` when nothing is playing.
**How:** Keep `const [mode, setMode] = useState<ViewMode>("now_playing");` (`DeckifyExpandedModal.tsx:91`) unchanged so existing unit tests (`DeckifyExpandedModal.test.tsx:427` mocking `stateValues[0]`) remain intact. Add a `hasResolvedInitialModeRef = useRef(false)` and a `useEffect` watching `status`:
```typescript
useEffect(() => {
  if (hasResolvedInitialModeRef.current || !status) return;
  hasResolvedInitialModeRef.current = true;
  const activeTrack = status.track_meta || status.track;
  if (!activeTrack?.name) {
    setMode("discovery");
  }
}, [status]);
```
This also handles the fact that `status` from `usePlaybackStatus()` is `null` on frame 0 while the initial RPC resolves.

### Anti-Patterns to Avoid
- **Using `flow-children="row"` on horizontal carousels:** Causes SteamOS GamepadUI spatial navigation to jump vertically instead of horizontally. Always use `flow-children="horizontal"`.
- **Blocking `time.sleep` inside `_spotify_api_request`:** Stalls Decky's thread-pool executor and causes UI hangs on 429s. Fail fast with `SpotifyRateLimitError` and serve stale cache.
- **Polling `get_discovery_feed` on an interval:** Violates rate-limit constraints; fetch only on tab mount, `time_range` change, or explicit `Refresh Feed` click.
- **Rendering raw `https://i.scdn.co/...` `<img>` tags:** Blocked by Steam CEF CSP; always use `<DeckifyImage src={url} />`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSP image proxying & LRU cache | Custom fetch/base64 hook | `<DeckifyImage src={url} />` (`src/components/common/DeckifyImage.tsx`) | Already handles concurrency throttling (`maxConcurrent: 4`) and LRU caching. |
| Controller `Y` action menus | New modal components | `TrackActionModal` & `CollectionActionModal` (`src/components/common/`) | Already handle focus capture/restoration, Pin to QAM, Like, Queue, Add to Playlist. |
| Controller focus ring styling | Custom inline box-shadow math | `focusHalo(focused)` (`src/components/common/InteractiveRow.tsx:4-15`) | Exact `#fff` + `#1DB954` glow spec from `11-UI-SPEC.md`. |
| Re-authentication prompt in QAM | Custom token-version checker | `CURRENT_SCOPES_VERSION = 7` in `py_modules/common.py:130` | `main.py:982` (`saved_version < CURRENT_SCOPES_VERSION`) automatically drives `needs_reauth` in QAM QR flow. |

## Common Pitfalls

### Pitfall 1: Missing `import time` in `py_modules/spotify.py`
**What goes wrong:** `py_modules/spotify.py:46` currently calls `time.sleep(min(retry_after, 2))` without `import time` anywhere in the file (`Select-String` confirmed 0 matches), which raises `NameError` whenever Spotify returns HTTP 429.
**How to avoid:** Add `import time` at the top of `py_modules/spotify.py` and replace `time.sleep(...)` with the non-blocking circuit breaker.

### Pitfall 2: Spotify Web API 2026 Development Mode Deprecation of `/browse/new-releases`
**What goes wrong:** Spotify's 2024–2026 Web API changes removed `GET /browse/new-releases` (and capped `GET /search` at `limit=10`) for standard Development Mode apps, returning HTTP `403 Forbidden` or `404`. Every Deckify user uses their own Spotify Developer app in Development Mode.
**How to avoid:** Try `GET /browse/new-releases` with `{"limit": 15}`; if it raises `HTTPError` with `403` or `404` (or returns empty), fall back to `GET /search` with `{"q": "tag:new", "type": "album", "limit": 10}` (respecting the Dev Mode limit cap already handled in `py_modules/rpc_library.py:811-815`). Never let a `403` on `/browse/new-releases` fail the entire `get_discovery_feed` response.

### Pitfall 3: Existing `CURRENT_SCOPES_VERSION` & `DeckifyExpandedModal` Unit Tests
**What goes wrong:**
1. Changing `CURRENT_SCOPES_VERSION` from `6` to `7` or adding `"discovery"` to `ALL_MODES` (`src/types.ts:19-33`) could affect tests asserting exact `ALL_MODES` length or `scopes_version`.
2. Changing the `useState` call order in `DeckifyExpandedModal.tsx` will break `DeckifyExpandedModal.test.tsx:427` (`stateValues[0] = "now_playing"`).
**How to avoid:** Keep `useState<ViewMode>("now_playing")` as the first `useState` in `DeckifyExpandedModal.tsx`, and run `pnpm test` and `py -m unittest discover -s tests -p "test_*.py"` immediately after edits.

### Pitfall 4: `me/playlists` Pagination & Jump Back In Deduplication
**What goes wrong:** `me/playlists?limit=50` may miss Spotify-owned mixes if a user has >50 playlists, or `me/player/recently-played` returns duplicate context URIs (e.g. 10 tracks from the same album).
**How to avoid:** Fetch up to 2 pages (`offset=0` and `offset=50`) of `me/playlists` if `total > 50` when scanning for `owner.id == "spotify"` mixes (Discover Weekly, Release Radar, Daily Mix, Daylist), and deduplicate `recently-played` contexts by `context.uri` while resolving their metadata/artwork from the track's album or playlist.

### Pitfall 5: `L2`/`R2` Trigger Navigation & `Y`-Button Ref Clearing
**What goes wrong:** Switching from a Top Track card to a Mix card without clearing `focusedTrackRef.current` causes `Y` to open `TrackActionModal` for the previous track instead of `CollectionActionModal` for the focused mix.
**How to avoid:** Follow the exact pattern in `DeckifyExpandedModal.tsx:1044-1045`: when `onFocusCollection(c)` is called with a non-null collection, set `focusedTrackRef.current = null`; when `onFocusTrack(t)` is called with a non-null track, set `focusedCollectionRef.current = null`. Also clear both refs when `time_range` changes or `DiscoveryTab` unmounts.

## Code Examples

### Backend: Circuit Breaker Skeleton (`py_modules/spotify.py`)
```python
# Source: py_modules/spotify.py:16-48 pattern + Phase 11 circuit breaker design
import threading
import time

class SpotifyRateLimitError(RuntimeError):
    def __init__(self, message: str, retry_after: float = 5.0):
        super().__init__(message)
        self.retry_after = retry_after

_BREAKER_LOCK = threading.Lock()
_BREAKER_FAILURES = 0
_BREAKER_OPEN_UNTIL = 0.0
_BREAKER_BASE_SECONDS = 5.0
_BREAKER_MAX_SECONDS = 300.0

def _reset_rate_limit_breaker() -> None:
    global _BREAKER_FAILURES, _BREAKER_OPEN_UNTIL
    with _BREAKER_LOCK:
        _BREAKER_FAILURES = 0
        _BREAKER_OPEN_UNTIL = 0.0
```

### Backend: `CURRENT_SCOPES_VERSION` Bump (`py_modules/common.py`)
```python
# Source: py_modules/common.py:124-130 (current values verified)
SPOTIFY_SCOPES = (
    "user-read-currently-playing user-read-playback-state user-modify-playback-state "
    "playlist-read-private playlist-read-collaborative playlist-modify-public "
    "playlist-modify-private user-library-read user-library-modify "
    "user-follow-read user-read-recently-played user-top-read"
)
CURRENT_SCOPES_VERSION = 7
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `time.sleep(min(retry_after, 2))` on 429 | Global exponential-backoff circuit breaker + stale cache | Phase 11 | Eliminates executor stalls and `NameError` on 429; keeps UI responsive |
| `GET /browse/new-releases` assumed always available | Try `/browse/new-releases`, fall back to `/search?q=tag:new&type=album&limit=10` | Spotify 2024–2026 Dev Mode changes `[CITED: developer.spotify.com]` | Prevents empty/broken New Releases carousel for Dev Mode users |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `GET /search?q=tag:new&type=album&limit=10` returns recent album releases in Spotify Development Mode when `/browse/new-releases` returns 403/404 | Common Pitfalls / Architecture | Low — if `tag:new` returns empty, New Releases degrades cleanly without blocking other carousels (`UI-SPEC.md` partial state) |

## Open Questions

1. **Exact `Sidebar.tsx` icon for Discovery**
   - What we know: `Sidebar.tsx` imports from `react-icons/fa`.
   - Recommendation: Use `FaCompass` from `react-icons/fa` (standard discovery/explore icon, agent discretion per `CONTEXT.md`).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js / pnpm | Frontend build, lint, Vitest | ✓ | pnpm 10.28.0 `[VERIFIED: pnpm --version]` | — |
| Vitest | Frontend unit tests | ✓ | 5.1.0 `[VERIFIED: package.json:43]` | — |
| TypeScript (`tsc`) | Typechecking | ✓ | 5.9.3 `[VERIFIED: package.json:41]` | — |
| Python | Backend unit tests | ✓ | 3.14.0 (`py` launcher) `[VERIFIED: py --version]` | — |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Frontend Framework | Vitest 5.1.0 (`pnpm test`) |
| Backend Framework | Python `unittest` (`py -m unittest discover -s tests -p "test_*.py"`) |
| Typecheck | `pnpm typecheck` (`tsc --noEmit`) |
| Lint | `pnpm lint` (`eslint src/`) |
| Quick run command | `pnpm test && py -m unittest tests/test_discovery.py` |
| Full suite command | `pnpm typecheck && pnpm lint && pnpm test && py -m unittest discover -s tests -p "test_*.py"` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DISC-01 | `"discovery"` in `ViewMode` / `ALL_MODES`, `Sidebar` placement, idle default tab | unit | `pnpm test` | ❌ Wave 0 (`src/components/tabs/DiscoveryTab.test.tsx`, `DeckifyExpandedModal.test.tsx`) |
| DISC-02 | `get_discovery_feed` aggregates Made For You (`owner.id == "spotify"` + Jump Back In fallback), Top Tracks/Artists (`time_range`), New Releases (+ 403/404 fallback), and 403 `needs_reauth` handling | unit | `py -m unittest tests/test_discovery.py` | ❌ Wave 0 (`tests/test_discovery.py`) |
| DISC-03 | 429 exponential-backoff circuit breaker (`Retry-After`, cap, fast-fail, reset on 2xx) + 1h/4h TTL cache + stale fallback | unit | `py -m unittest tests/test_discovery.py` | ❌ Wave 0 (`tests/test_discovery.py`) |

### Sampling Rate
- **Per task commit:** `pnpm test` (frontend tasks) or `py -m unittest tests/test_discovery.py` (backend tasks)
- **Per wave merge:** `pnpm typecheck && pnpm lint && pnpm test && py -m unittest discover -s tests -p "test_*.py"`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/test_discovery.py` — covers `DISC-02` and `DISC-03` (circuit breaker, TTL cache, stale fallback, `needs_reauth`, `CURRENT_SCOPES_VERSION == 7`, `get_discovery_feed`)
- [ ] `src/components/tabs/DiscoveryTab.test.tsx` — covers `DISC-01` and `DISC-02` (greeting, time-range pills, carousels, 403 re-auth card, 429 stale banner, `A`/`Y` actions)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | OAuth PKCE `CURRENT_SCOPES_VERSION = 7` (`user-top-read`), tokens never logged |
| V3 Session Management | no | Existing PKCE refresh flow in `main.py` unchanged |
| V4 Access Control | yes | Handle HTTP 403 on `/me/top/*` gracefully with re-auth prompt; never expose bearer tokens in RPC error payloads |
| V5 Input Validation | yes | Whitelist `time_range` against `("short_term", "medium_term", "long_term")` in `get_discovery_feed`; sanitize `force_refresh` as `bool` |
| V6 Cryptography | no | Existing SSL context `_API_SSL_CTX` unchanged |

### Known Threat Patterns for Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| External CDN URL injection in CEF | Tampering / CSP Violation | Proxy all artwork URLs through `<DeckifyImage>` / `get_image` |
| Unbounded retry storm on HTTP 429 | Denial of Service (self/API ban) | Global exponential-backoff circuit breaker (`300s` cap) + in-memory TTL cache |

## Sources

### Primary (HIGH confidence)
- In-repo files inspected directly: `py_modules/spotify.py:1-150`, `py_modules/common.py:101-160`, `py_modules/rpc_library.py:25-60,740-941`, `main.py:965-1010`, `src/types.ts:1-120`, `src/components/common/Sidebar.tsx:1-160`, `src/components/DeckifyExpandedModal.tsx:60-105,235-315,445-485,675-775,900-980`, `src/components/common/InteractiveRow.tsx:1-105`, `src/components/common/TrackActionModal.tsx:1-105`, `src/components/common/CollectionActionModal.tsx:1-105`, `package.json:1-62`

### Secondary (MEDIUM confidence)
- [Spotify Developer Documentation / Web API Updates](https://developer.spotify.com) — `GET /me/top/{type}` (`user-top-read`, `short_term`/`medium_term`/`long_term`) and 2024–2026 Development Mode restrictions on `GET /browse/new-releases` and `GET /search` (`limit=10`).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies; all primitives verified in-repo
- Architecture: HIGH — all integration points, line numbers, and test constraints verified
- Pitfalls: HIGH — missing `import time` in `py_modules/spotify.py` and Spotify Dev Mode `/browse/new-releases` restriction both identified proactively

**Research date:** 2026-11-15
**Valid until:** 2026-12-15 (30 days; stable stack, monitor Spotify Web API Dev Mode announcements)
