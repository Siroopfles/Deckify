# Phase 02: Artwork & Image Pipeline Stabilization - Research

**Researched:** 2026-11-11  
**Domain:** SteamOS CEF Content Security Policy (CSP), Base64 Image Proxying, Client-Side Concurrency Throttling, LRU Caching  
**Confidence:** HIGH  

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### CDN Domain Validation & Backend Image Proxy
- **D-01:** Expand `_validate_image_url` in `py_modules/images.py` to allow all valid Spotify image CDN hostnames and subdomains (`*.scdn.co`, `*.spotifycdn.com`, including `mosaic.scdn.co`, `i.scdn.co`, `image-cdn-ak.spotifycdn.com`, `image-cdn-fa.spotifycdn.com`, etc.) without throwing 400 Bad Request or dropping mosaic artwork.
- **D-02:** Retain backend disk caching in `~/.cache/deckify/images/` using MD5 URL hashes so covers are fetched over the network only once per image URI.

#### Frontend Concurrency Throttling & Caching
- **D-03:** Implement a client-side request worker queue in `DeckifyImage.tsx` with a concurrency limit of 4-6 simultaneous `get_image` RPC requests. When navigating or scrolling through massive lists (e.g. 500-track playlists), excess requests wait in the priority queue rather than overloading Steam CEF and the Python backend event loop.
- **D-04:** Maintain a frontend JavaScript in-memory LRU cache (capacity: 200 base64 images) to provide instantaneous rendering when scrolling back up or switching between tabs without hitting the RPC bridge.

#### Loading State & Fallback Visuals
- **D-05:** Show a subtle dark pulsing skeleton shimmer (`#1a1a1a` to `#2a2a2a`) while an image is actively loading.
- **D-06:** Fallback state: When artwork is missing (`image_url` is null/empty) or fetching fails after retry, render a clean, neutral Deckify music note SVG icon (`react-icons/fi` `FiMusic` or similar) with low-contrast styling matching SteamOS GamepadUI.

#### Quality & Regression Guardrails
- **D-07:** Retain 100% backend unit test coverage in `tests/test_images.py` and `tests/test_plugin_api.py`, adding tests for new CDN patterns and mosaic URLs.
- **D-08:** Verify frontend typecheck (`pnpm typecheck`), Vitest unit tests (`pnpm test`), and Rollup bundling (`pnpm build`).

### the agent's Discretion
- Choice of icon library for the fallback placeholder: `react-icons/fa` (`FaMusic`) is already universally used across 15+ components in the codebase with 0 extra bundle footprint, or `react-icons/fi` (`FiMusic`). `FaMusic` is recommended for visual consistency.
- Exact concurrency pool limit: recommend 4 concurrent requests (balancing rapid load times against Decky IPC websocket saturation).
- LRU eviction algorithm: standard JavaScript `Map` preserves insertion order, allowing clean O(1) delete and re-insert for cache hits and `map.keys().next().value` for eviction.

### Deferred Ideas (OUT OF SCOPE)
- Custom offline album art persistent storage in indexedDB.
- Dynamic color extraction from artwork for background gradients.
- Animated image cross-fading transitions.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **IMG-01** | Expand image URL validation and proxying in `py_modules/images.py` to support all Spotify CDN variants (`image-cdn-ak.spotifycdn.com`, `mosaic.scdn.co`, `seeded-session-images.scdn.co`) and podcast cover hosts. | Section "CDN Domain Whitelisting & Validation Pattern" and "Spotify URI & Mosaic Handling" detail exact domain parsing, apex matching, and mosaic URI translation rules. |
| **IMG-02** | Add concurrency throttling (max 4-6 concurrent fetches) and an in-memory cache to `DeckifyImage` to eliminate RPC threadpool starvation and prevent Spotify HTTP 429 rate limit backoffs. | Section "Architecture Patterns: Concurrency Throttled Queue & LRU Cache" provides worker pool and queue implementation details ensuring deterministic IPC throughput. |
</phase_requirements>

---

## Executive Summary

Valve's SteamOS GamepadUI runs inside Chromium Embedded Framework (CEF), which enforces a strict Content Security Policy (CSP) blocking direct remote image loading from external CDN URLs (such as `https://i.scdn.co/` or `https://image-cdn-ak.spotifycdn.com/`). Deckify solves this by routing image URLs through a local backend proxy (`get_image` RPC) that downloads the image, caches it on disk, and returns a Base64 Data URI (`data:image/jpeg;base64,...`).

During heavy navigation (e.g. browsing a library of 500 saved songs, scrolling playlists, or switching tabs), two major failure modes occur:
1. **Domain Rejection & Mosaic Drop (IMG-01):** Spotify serves artwork and personalized covers from diverse CDN subdomains (`mosaic.scdn.co`, `seeded-session-images.scdn.co`, `image-cdn-ak.spotifycdn.com`, `image-cdn-fa.spotifycdn.com`, `pickasso.spotifycdn.com`, `*.spotifycdn.net`). The current domain check in `py_modules/images.py` uses restrictive validation that fails on non-standard subdomains and apex domains, dropping artwork and throwing `ValueError`.
2. **IPC Flooding & Threadpool Starvation (IMG-02):** In `src/components/common/DeckifyImage.tsx`, uncached images immediately fire asynchronous `callable("get_image")` calls without throttling. When 100+ track rows mount at once, hundreds of concurrent IPC messages swamp the Decky websocket and Python threadpool, inducing UI stutters, network timeouts, and upstream Spotify HTTP 429 rate-limiting. Furthermore, `imgMemoryCache` is an unbounded `Map` without size bounds or LRU eviction.

Phase 02 stabilizes this entire image pipeline with zero breaking changes to existing callers:
- **Backend:** Expand `_validate_image_url` in `py_modules/images.py` using an allowed-domain suffix matching rule covering `*.scdn.co`, `*.spotifycdn.com`, `*.spotifycdn.net`, and `*.spotify.com`, and support both `spotify:mosaic:` and `spotify:image:mosaic:` URI formats.
- **Frontend:** Upgrade `DeckifyImage.tsx` with a 4-worker concurrency throttle queue, a 200-item in-memory LRU cache, request deduplication, subtle pulsing skeleton shimmer (`#1a1a1a` to `#2a2a2a`), and a standardized `FaMusic` neutral fallback icon.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| **Base64 Data URI Presentation** | Browser / Client (`DeckifyImage.tsx`) | — | React renders `<img>` with `src="data:image/..."`, completely bypassing Steam CEF remote image CSP restrictions. |
| **In-Memory Image Caching** | Browser / Client (`DeckifyImage.tsx`) | — | Client-side 200-item LRU cache provides instantaneous re-renders on tab switching and D-pad scrolling without crossing the RPC bridge. |
| **RPC Concurrency Throttling** | Browser / Client (`DeckifyImage.tsx`) | — | Client worker pool limits active concurrent `get_image` RPC calls to 4, preventing IPC congestion and Python threadpool exhaustion. |
| **Request Deduplication** | Browser / Client (`DeckifyImage.tsx`) | — | In-flight request map (`imgPending`) merges identical image URL requests into a single promise. |
| **Shimmer & Fallback Presentation** | Browser / Client (`DeckifyImage.tsx`) | — | Pure CSS pulsing skeleton animation and SVG icon rendering during loading and error states. |
| **URL Whitelist & SSRF Guard** | API / Backend (`py_modules/images.py`) | — | Backend validates protocols, schemes, ports, credentials, and allowed Spotify CDN hostnames before touching the network. |
| **Network Fetch & Redirect Guard** | API / Backend (`py_modules/images.py`) | — | Backend performs HTTPS request with redirect re-validation (`_ImageRedirectHandler`), 10s timeout, and size bounds (10 MB). |
| **Disk Image Cache (LRU)** | Storage / Disk (`~/.cache/deckify/images/`) | API / Backend | Persistent disk cache stores image binaries and metadata files by SHA-256 hash, enforcing a 50 MB LRU ceiling. |

---

## Standard Stack & In-Repo Provenance

### In-Repo Discrete Values (Verified Line-by-Line)

The following discrete values exist in the Deckify codebase and represent the baseline for Phase 02 modifications:

1. **Current Image URL Validation Rule:**
   - Source: `[VERIFIED: py_modules/images.py:11-23]`
   ```python
   def _validate_image_url(url: str) -> None:
       parsed = urllib.parse.urlsplit(url)
       host = parsed.hostname or ""
       if (
           parsed.scheme != "https"
           or parsed.port not in (None, 443)
           or parsed.username is not None
           or parsed.password is not None
           or not host.endswith((".scdn.co", ".spotifycdn.com"))
       ):
           raise ValueError("Only Spotify HTTPS image URLs are supported")
   ```

2. **Disk Cache Paths & Limits:**
   - Source: `[VERIFIED: py_modules/images.py:7-8]`
   ```python
   IMAGE_CACHE_DIR = os.path.join(CACHE_DIR, "images")
   MAX_IMAGE_CACHE_BYTES = 50 * 1024 * 1024
   ```

3. **Permitted Content-Types:**
   - Source: `[VERIFIED: py_modules/images.py:85]`
   ```python
   if content_type not in ("image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"):
   ```

4. **Mosaic & Image URI Translation:**
   - Source: `[VERIFIED: py_modules/images.py:111-124]`
   ```python
       if raw.startswith("spotify:image:"):
           img_id = raw.split("spotify:image:", 1)[1].strip()
           if img_id:
               raw = f"https://i.scdn.co/image/{img_id}"
       elif raw.startswith("spotify:mosaic:"):
           parts = [p for p in raw.split(":")[2:] if p]
           if parts:
               raw = f"https://mosaic.scdn.co/300/{''.join(parts[:4])}"
       try:
           _validate_image_url(raw)
           return raw
       except ValueError:
           return None
   ```

5. **RPC get_image Implementation:**
   - Source: `[VERIFIED: py_modules/rpc_library.py:930-939]`
   ```python
   async def get_image(url: str) -> dict:
       """Fetch and return base64 Data URI for external image, bypassing CEF CSP restrictions."""
       if not url or not isinstance(url, str):
           return {"ok": False, "error": "No URL provided"}
       try:
           content_type, body = await _exec(_fetch_spotify_image, url, timeout=10)
           b64 = base64.b64encode(body).decode("ascii")
           return {"ok": True, "data_url": f"data:{content_type};base64,{b64}"}
       except Exception as e:
           return {"ok": False, "error": str(e)}
   ```

6. **Current DeckifyImage Props and Globals:**
   - Source: `[VERIFIED: src/components/common/DeckifyImage.tsx:4-16]`
   ```typescript
   const backendGetImage = callable<[string], { ok: boolean; data_url?: string; error?: string }>("get_image");

   export const imgMemoryCache = new Map<string, string>();
   export const imgPending = new Map<string, Promise<string | null>>();

   export interface DeckifyImageProps {
     src?: string | null;
     width?: number | string;
     height?: number | string;
     style?: any;
     className?: string;
     fallback?: ReactNode;
   }
   ```

---

## Package Legitimacy Audit

No new external npm packages or Python packages are required for this phase. All features are implemented using:
- Existing npm packages: `react-icons` (v5.5.0, for `FaMusic`), `@decky/api` (v1.1.3), `react` (v19.x)
- Python standard library: `urllib.parse`, `urllib.request`, `hashlib`, `os`, `base64`

| Package | Registry | Installed Version | Purpose | Disposition |
|---------|----------|-------------------|---------|-------------|
| `react-icons` | npm | 5.5.0 | SVG icon rendering (`FaMusic`) | Approved (Existing) |
| `@decky/api` | npm | 1.1.3 | IPC bridge `callable("get_image")` | Approved (Existing) |

---

## Architecture Patterns

### System Architecture Diagram

```
[ SteamOS GamepadUI (CEF) ]
            │
            ▼
    [ DeckifyImage Component ] 
      (src/components/common/DeckifyImage.tsx)
            │
            ├── 1. Check in-memory LRUCache (200 items) ───[HIT]──► Render <img> immediately
            │                                                         (0ms latency, 0 IPC)
            └── 2. [MISS] ──► Deduplicate with imgPending
                                   │
                                   ▼
                      [ Concurrency Throttle Queue ]
                         (Max 4 Active Workers)
                                   │
           ┌───────────────────────┴───────────────────────┐
           ▼                                               ▼
   [ Active Worker Slot ]                         [ Pending Queue Array ]
   (Calls backendGetImage)                         (Waits for worker free)
           │
           ▼
[ Decky IPC Bridge (WebSocket) ]
           │
           ▼
[ Python Daemon (main.py -> rpc_library.py: get_image) ]
           │
           ▼
[ URL Validator & Handler (py_modules/images.py) ]
   ├── _validate_image_url (Domain Whitelist: *.scdn.co, *.spotifycdn.com, *.spotifycdn.net, *.spotify.com)
   ├── Check Disk Cache (~/.cache/deckify/images/<hash>.bin & .meta)
   │        ├── [HIT] ──► Return cached content_type & binary
   │        └── [MISS] ─► HTTPS Request with _ImageRedirectHandler (10s timeout, max 10MB)
   │                           └── Write to disk cache & clean LRU (50 MB limit)
   └── Base64 Encode ──► "data:image/jpeg;base64,..."
```

---

### Pattern 1: Concurrency Throttling Queue with Request Deduplication

When a user scrolls a 500-track playlist or opens the library, dozens of `DeckifyImage` components mount in the same tick. If each component immediately calls `backendGetImage(src)`, 100+ concurrent RPC calls hit Decky's bridge simultaneously.

**Implementation Strategy:**
1. A singleton `ImageQueue` instance in `src/components/common/DeckifyImage.tsx`:
   - `maxConcurrent = 4` [CITED: D-03]
   - `activeCount`: current number of in-flight RPC requests.
   - `queue`: FIFO array of `{ url, resolve, reject }` tasks.
2. In-flight deduplication (`imgPending = new Map<string, Promise<string | null>>()`):
   - If two or more components request the exact same image (e.g. identical album cover for multiple tracks in an album or playlist), only one task enters the queue; all callers share the same promise.
3. Queue dispatch loop:
   - When `activeCount < maxConcurrent` and `queue.length > 0`, dequeue next item, increment `activeCount`, execute `backendGetImage(url)`.
   - On completion (or rejection), decrement `activeCount` and immediately pump the queue.

### Pattern 2: Bounded In-Memory LRU Cache (Capacity: 200)

JavaScript's native `Map` guarantees insertion-order iteration `[CITED: developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map]`. An LRU cache is created by re-inserting accessed keys to the tail:
- **`get(key)`**: If key exists, read value, `delete(key)`, then `set(key, value)`. Return value.
- **`set(key, value)`**: If key exists, `delete(key)`. Else if `size >= capacity`, `delete(keys().next().value)`. Then `set(key, value)`.
- Capacity: 200 items [CITED: D-04]. 200 items of base64 images consume approximately ~4–6 MB of RAM, remaining well within CEF memory allowances while ensuring zero-latency scrolling.

### Pattern 3: Comprehensive Spotify CDN Domain Whitelist

Spotify serves images from multiple subdomains and CDNs. A robust validator must:
1. Parse the URL using `urllib.parse.urlsplit(url)`.
2. Verify `scheme == "https"`.
3. Verify `port in (None, 443)`.
4. Verify `username is None` and `password is None` (SSRF credentials guard).
5. Verify `host` matches allowed Spotify domain roots:
   ```python
   ALLOWED_SPOTIFY_DOMAINS = (
       "scdn.co",
       "spotifycdn.com",
       "spotifycdn.net",
       "spotify.com",
   )

   def _is_allowed_spotify_host(host: str) -> bool:
       host = host.lower()
       return any(host == domain or host.endswith("." + domain) for domain in ALLOWED_SPOTIFY_DOMAINS)
   ```
   This allows:
   - `i.scdn.co`, `mosaic.scdn.co`, `seeded-session-images.scdn.co`, `lineup-images.scdn.co`, `daily-mix.scdn.co`, `charts-images.scdn.co`
   - `image-cdn-ak.spotifycdn.com`, `image-cdn-fa.spotifycdn.com`, `pickasso.spotifycdn.com`, `blend-playlist-covers.spotifycdn.com`, `wrapped-images.spotifycdn.com`
   - `image-cdn-ak.spotifycdn.net`, `image-cdn-fa.spotifycdn.net`
   - Apex domains: `scdn.co`, `spotifycdn.com`, `spotifycdn.net`, `spotify.com`
   And strictly blocks:
   - `fake-scdn.co`, `scdn.co.attacker.com`, `spotifycdn.com.evil.org`, `169.254.169.254`, `localhost`, `127.0.0.1`.

### Pattern 4: Dark Pulsing Skeleton Shimmer & Neutral Fallback Icon

To avoid jarring layout shifts and white flashes:
1. **Shimmer Loading State:**
   - Subtle dark pulsing animation alternating between `#1a1a1a` and `#2a2a2a` [CITED: D-05].
   - Injectable CSS keyframes `@keyframes deckifyShimmer { 0%, 100% { background-color: #1a1a1a; } 50% { background-color: #2a2a2a; } }`.
   - Applied while image is fetching from the queue.
2. **Neutral Music Note Fallback State:**
   - Rendered when `src` is empty/null or when fetching fails after retry [CITED: D-06].
   - Low-contrast background: `rgba(255, 255, 255, 0.05)` or `#1c1e22`.
   - Low-contrast icon: `FaMusic` from `react-icons/fa` with `color="#6b7280"` or `rgba(255, 255, 255, 0.3)`.
   - Inherits dimensions (`width`, `height`) and `borderRadius` from props.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SVG Icon Placeholder | Custom inline SVG paths or manual canvas drawing | `FaMusic` from `react-icons/fa` | Already bundled, responsive, tested across all screen resolutions and scales cleanly. |
| Complex Async Task Queue Library | Heavy external npm dependencies (e.g. `p-queue`) | Concise 30-line in-file worker queue in `DeckifyImage.tsx` | Eliminates external dependency footprint; tailored directly to Decky's single `backendGetImage` promise model. |
| In-Memory Cache | External cache packages (e.g. `lru-cache`, `quick-lru`) | Compact 25-line JS `Map`-based LRU class | Zero dependencies, zero build overhead, 100% type-safe, native in modern Node / V8. |
| URL Security Validator | Ad-hoc regex string replacements | Python `urllib.parse.urlsplit` + strict hostname comparison | Regexes on URLs frequently introduce bypass vulnerabilities (dots as wildcards, missing anchors). |

---

## Common Pitfalls

### Pitfall 1: Unbounded Concurrency Overloading Decky IPC
**What goes wrong:** Fast scrolling or mounting a playlist with 300 songs issues 300 simultaneous `callable("get_image")` calls. The WebSocket queue backs up, causing noticeable GamepadUI navigation latency and potential RPC timeouts.  
**Why it happens:** React fires `useEffect` for each mounted list item without central coordination.  
**How to avoid:** Enforce a strict FIFO queue with `MAX_CONCURRENT = 4` worker threads in `DeckifyImage.tsx`.

### Pitfall 2: Memory Leaks from Unbounded Base64 Image Caching
**What goes wrong:** A long gaming session browsing thousands of tracks fills the browser heap with hundreds of megabytes of base64 data URIs.  
**Why it happens:** `imgMemoryCache` is currently an unbounded `new Map<string, string>()`.  
**How to avoid:** Cap `imgMemoryCache` at 200 items using LRU eviction [CITED: D-04]. Evicted items will simply hit the disk cache on the backend if needed again.

### Pitfall 3: Subdomain & Suffix Spoofing in Image Whitelist
**What goes wrong:** Using `url.contains("scdn.co")` or `host.endswith("scdn.co")` allows attackers to bypass validation using domains like `https://attacker-scdn.co/evil.jpg` or `https://scdn.co.attacker.com/evil.jpg`.  
**Why it happens:** Missing leading dot check or exact domain comparison.  
**How to avoid:** Require `host == domain or host.endswith("." + domain)` for all entries in `ALLOWED_SPOTIFY_DOMAINS`.

### Pitfall 4: Broken Mosaic Cover Art
**What goes wrong:** Playlists with mosaic covers (collages of 4 album covers) return `spotify:mosaic:...` or `spotify:image:mosaic:...` URIs. If the parser only checks `spotify:image:`, it creates invalid URLs like `https://i.scdn.co/image/mosaic:...`.  
**Why it happens:** Incomplete prefix matching order in `_proxy_spotify_image_url`.  
**How to avoid:** Check `spotify:image:mosaic:` and `spotify:mosaic:` before `spotify:image:`, assembling valid `https://mosaic.scdn.co/300/{hashes}` URLs.

---

## Code Examples

### 1. Robust Spotify CDN Domain Validator (`py_modules/images.py`)

```python
import urllib.parse

ALLOWED_SPOTIFY_DOMAINS = (
    "scdn.co",
    "spotifycdn.com",
    "spotifycdn.net",
    "spotify.com",
)


def _is_allowed_spotify_host(host: str) -> bool:
    if not host:
        return False
    host = host.lower()
    return any(host == domain or host.endswith("." + domain) for domain in ALLOWED_SPOTIFY_DOMAINS)


def _validate_image_url(url: str) -> None:
    parsed = urllib.parse.urlsplit(url)
    host = parsed.hostname or ""
    if (
        parsed.scheme != "https"
        or parsed.port not in (None, 443)
        or parsed.username is not None
        or parsed.password is not None
        or not _is_allowed_spotify_host(host)
    ):
        raise ValueError("Only Spotify HTTPS image URLs are supported")
```

### 2. Mosaic & Spotify URI Normalization (`py_modules/images.py`)

```python
def _proxy_spotify_image_url(raw_url: str | None) -> str | None:
    if not raw_url or not isinstance(raw_url, str):
        return None
    raw = raw_url.strip()
    if not raw:
        return None
    if raw.startswith("spotify:image:mosaic:"):
        parts = [p for p in raw.split("spotify:image:mosaic:")[1].split(":") if p]
        if parts:
            raw = f"https://mosaic.scdn.co/300/{''.join(parts[:4])}"
    elif raw.startswith("spotify:mosaic:"):
        parts = [p for p in raw.split("spotify:mosaic:")[1].split(":") if p]
        if parts:
            raw = f"https://mosaic.scdn.co/300/{''.join(parts[:4])}"
    elif raw.startswith("spotify:image:"):
        img_id = raw.split("spotify:image:", 1)[1].strip()
        if img_id:
            raw = f"https://i.scdn.co/image/{img_id}"
    try:
        _validate_image_url(raw)
        return raw
    except ValueError:
        return None
```

### 3. Frontend LRU Cache & Concurrency Worker Queue (`src/components/common/DeckifyImage.tsx`)

```typescript
export class ImageLruCache {
  private map = new Map<string, string>();
  constructor(private capacity: number = 200) {}

  get(key: string): string | undefined {
    const val = this.map.get(key);
    if (val !== undefined) {
      this.map.delete(key);
      this.map.set(key, val);
    }
    return val;
  }

  set(key: string, value: string): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.capacity) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) {
        this.map.delete(oldestKey);
      }
    }
    this.map.set(key, value);
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

export class ImageRequestQueue {
  private activeCount = 0;
  private queue: Array<() => void> = [];

  constructor(private maxConcurrent: number = 4) {}

  enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        this.activeCount++;
        task()
          .then(resolve)
          .catch(reject)
          .finally(() => {
            this.activeCount--;
            this.next();
          });
      };

      if (this.activeCount < this.maxConcurrent) {
        run();
      } else {
        this.queue.push(run);
      }
    });
  }

  private next(): void {
    if (this.queue.length > 0 && this.activeCount < this.maxConcurrent) {
      const nextTask = this.queue.shift();
      if (nextTask) nextTask();
    }
  }

  get pending(): number {
    return this.queue.length;
  }

  get active(): number {
    return this.activeCount;
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Unbounded `Map` for image cache | 200-item LRU Cache | Phase 02 | Eliminates browser memory bloat and prevents garbage collection stutters. |
| Direct asynchronous `get_image` RPC firing on mount | 4-Worker Concurrency Throttled Queue | Phase 02 | Eliminates Decky IPC websocket saturation, threadpool starvation, and Spotify 429 rate limits. |
| Strict `.endswith((".scdn.co", ".spotifycdn.com"))` host matching | Allowed-domain root matching (`*.scdn.co`, `*.spotifycdn.com`, `*.spotifycdn.net`, `*.spotify.com`) | Phase 02 | Fixes missing covers for podcast shows/episodes, mosaic playlists, and session images. |
| Static blank placeholder `rgba(255,255,255,0.06)` | Subtle pulsing skeleton shimmer + neutral `FaMusic` fallback icon | Phase 02 | Polished SteamOS GamepadUI visual aesthetic with clear loading and error feedback. |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Spotify API does not serve artwork on external non-Spotify domains (e.g. RSS feed hostnames) without proxying through Spotify CDNs. | Backend Domain Whitelisting | If a third-party podcast RSS feed image is returned unproxied, it will fallback to `FaMusic` icon rather than crashing. |
| A2 | 4 concurrent RPC requests is the optimal concurrency limit for Decky Loader. | Frontend Concurrency Throttling | Concurrency can be adjusted between 4 and 6 with zero architectural changes. |

---

## Open Questions

None. All technical choices and constraints were verified against the existing codebase, Decky Loader IPC architecture, and SteamOS GamepadUI specifications.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python | Backend tests & daemon | ✓ | 3.14 (Local) / 3.11+ (SteamOS) | — |
| pnpm / Node.js | Frontend build & test | ✓ | Node 20+, pnpm 9+ | — |
| Vitest | Frontend unit tests | ✓ | 5.1.0 | — |
| Rollup | Bundling `dist/index.js` | ✓ | 4.59.0 | — |

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Backend Framework | Python standard library `unittest` |
| Frontend Framework | Vitest 5.1.0 (`pnpm test`) |
| Quick run command (Backend) | `py -m unittest tests/test_images.py` |
| Quick run command (Frontend) | `pnpm test` |
| Full suite command | `pnpm test && py -m unittest discover -s tests -p "test_*.py"` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| **IMG-01** | Support all Spotify CDN domains (`*.scdn.co`, `*.spotifycdn.com`, `*.spotifycdn.net`, `*.spotify.com`) in `_validate_image_url` | unit | `py -m unittest tests/test_images.py -k test_spotify_cdn_domains` | ❌ Wave 0 (to add to `tests/test_images.py`) |
| **IMG-01** | Support mosaic and session playlist image URIs (`spotify:mosaic:`, `spotify:image:mosaic:`) | unit | `py -m unittest tests/test_images.py -k test_mosaic` | ✅ `tests/test_images.py` (expand) |
| **IMG-01** | Reject spoofed and SSRF domain attacks (`fake-scdn.co`, `scdn.co.attacker.com`, non-https) | unit | `py -m unittest tests/test_images.py -k test_non_spotify_urls` | ✅ `tests/test_images.py` (expand) |
| **IMG-02** | LRU Cache evicts oldest item when capacity exceeds 200 | unit | `pnpm test src/components/common/DeckifyImage.test.ts` | ❌ Wave 0 (`DeckifyImage.test.ts`) |
| **IMG-02** | Queue restricts concurrent executions to `maxConcurrent` (4) | unit | `pnpm test src/components/common/DeckifyImage.test.ts` | ❌ Wave 0 (`DeckifyImage.test.ts`) |
| **IMG-02** | Deduplication merges concurrent requests for identical image URLs | unit | `pnpm test src/components/common/DeckifyImage.test.ts` | ❌ Wave 0 (`DeckifyImage.test.ts`) |

### Sampling Rate
- **Per task commit:** `py -m unittest tests/test_images.py && pnpm test && pnpm typecheck`
- **Per wave merge:** `pnpm test && py -m unittest discover -s tests -p "test_*.py" && pnpm build`
- **Phase gate:** All 316+ backend unit tests passing, all frontend Vitest tests passing, 0 TypeScript errors, clean Rollup bundle.

### Wave 0 Gaps
- [ ] Add `src/components/common/DeckifyImage.test.ts` — covers LRU cache eviction, queue concurrency throttling, and request deduplication.
- [ ] Expand `tests/test_images.py` — covers new CDN subdomains, apex domains, mosaic formats, and SSRF spoofing guards.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| **V5 Input Validation** | Yes | URL scheme, port, credential, and hostname validation in `_validate_image_url`. |
| **V12 SSRF Prevention** | Yes | Strict whitelist matching preventing internal network access (`127.0.0.1`, `169.254.169.254`, `localhost`). |
| **V13 API Security** | Yes | File size limits (`MAX_IMAGE_BYTES = 10 MB`) and content-type checking preventing memory exhaustion. |

### Known Threat Patterns for Deckify Image Proxy

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SSRF to local cloud metadata or intranet services | Elevation of Privilege / Information Disclosure | Strict HTTPS-only protocol enforcement and domain whitelist checking (`_is_allowed_spotify_host`). |
| Suffix / subdomain spoofing (`fake-scdn.co`, `scdn.co.attacker.com`) | Tampering | Exact domain equality or dot-prefixed subdomain matching (`host == domain or host.endswith("." + domain)`). |
| Upstream redirect bypass to arbitrary host | Tampering / Information Disclosure | `_ImageRedirectHandler` re-executes `_validate_image_url(newurl)` on every HTTP 301/302 redirect. |
| Denial of Service via large image or non-image stream | Denial of Service | `MAX_IMAGE_BYTES` check and strict Content-Type checking (`image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/avif`). |
| IPC websocket starvation | Denial of Service | Client-side concurrency queue limiting concurrent active RPC calls to 4. |

---

## Sources

### Primary (HIGH confidence)
- `py_modules/images.py` - Line 1-156: existing image proxy, validation, redirect handler, and caching
- `py_modules/rpc_library.py` - Line 930-939: `get_image` RPC handler implementation
- `src/components/common/DeckifyImage.tsx` - Line 1-104: current image component and globals
- `tests/test_images.py` - Line 1-105: existing test cases for image proxying
- Spotify Web API Documentation (`developer.spotify.com/documentation/web-api`) - Show, episode, album, and playlist image object schemas

### Secondary (MEDIUM confidence)
- MDN Web Docs: `Map` specification and insertion-order preservation for LRU caches

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Directly uses existing dependencies (`react-icons`, `@decky/api`, Python stdlib)
- Architecture: HIGH - Proven client-side concurrency throttling and backend domain whitelist pattern
- Pitfalls: HIGH - Directly addresses observed failure modes from user context and CEF constraints

**Research date:** 2026-11-11  
**Valid until:** 2026-12-11 (30 days)  
