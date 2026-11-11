---
phase: 02-artwork-image-pipeline-stabilization
plan: "01"
subsystem: artwork-pipeline
tags:
  - images
  - cdn
  - lru-cache
  - concurrency-queue
  - shimmer
  - fallback
requires: []
provides:
  - IMG-01
  - IMG-02
affects:
  - DeckifyImage
  - py_modules.images
tech-stack:
  added: []
  patterns:
    - ImageLruCache
    - ImageRequestQueue
    - Base64 CSP Proxy
key-files:
  created:
    - src/components/common/DeckifyImage.test.ts
    - src/components/common/imagePipeline.ts
  modified:
    - py_modules/images.py
    - src/components/common/DeckifyImage.tsx
    - tests/test_images.py
decisions:
  - Broadened Spotify CDN domain validation to *.scdn.co, *.spotifycdn.com, *.spotifycdn.net, *.spotify.com.
  - Normalized both spotify:mosaic: and spotify:image:mosaic: to mosaic.scdn.co/300/{hashes}.
  - Implemented 4-worker concurrency limit in frontend ImageRequestQueue to prevent RPC thread starvation.
  - Implemented 200-capacity ImageLruCache in frontend to prevent CEF memory bloat.
  - Added skeleton shimmer during image loading and neutral FaMusic fallback on errors or missing artwork.
metrics:
  duration: 15m
  completed_date: "2026-11-11"
status: complete
actuals:
  tokens: 18000
  tasks: 3
  commits: 3
  plan_head_before: cb8cef61e84c9b59b2eba5fa6ae79e877274a8bb
  plan_head_after: cd215aa7e06a70821984f27552e75ee326e95a0c
---

# Phase 02 Plan 01: Artwork & Image Pipeline Stabilization Summary

Hardened and stabilized the Deckify artwork and image loading pipeline across all SteamOS GamepadUI views, resolving missing covers, RPC event loop saturation, and browser heap bloat.

## Overview of Implemented Capabilities

### 1. Backend CDN Hostname Whitelisting & Mosaic Normalization (IMG-01)
- Broadened `_validate_image_url` in [`py_modules/images.py`](file:///C:/Users/djdje/Deckify/py_modules/images.py) to support all valid Spotify image CDN domains (`scdn.co`, `spotifycdn.com`, `spotifycdn.net`, `spotify.com`) and subdomains (`i.scdn.co`, `mosaic.scdn.co`, `image-cdn-ak.spotifycdn.com`, `image-cdn-fa.spotifycdn.com`, `pickasso.spotifycdn.com`, `seeded-session-images.scdn.co`, `image-cdn-ak.spotifycdn.net`).
- Implemented `_is_allowed_spotify_host` with strict dot-prefixed domain boundary checking (`host == domain or host.endswith("." + domain)`), lowercasing the host and strictly rejecting suffix-spoofed attacker domains (e.g., `fake-scdn.co`, `scdn.co.attacker.com`).
- Extended `_proxy_spotify_image_url` to properly normalize both `spotify:image:mosaic:` and `spotify:mosaic:` URI formats into `https://mosaic.scdn.co/300/{hashes}`.
- Retained backend disk caching in `~/.cache/deckify/images/` with 50 MB LRU cleanup.

### 2. Frontend Concurrency Worker Queue & Bounded LRU Cache (IMG-02)
- Implemented and exported `ImageLruCache` with a bounded capacity of 200 items in [`src/components/common/imagePipeline.ts`](file:///C:/Users/djdje/Deckify/src/components/common/imagePipeline.ts) (re-exported by [`src/components/common/DeckifyImage.tsx`](file:///C:/Users/djdje/Deckify/src/components/common/DeckifyImage.tsx)), replacing unbounded JavaScript `Map` usage to prevent CEF memory bloat when scrolling massive playlists.
- Implemented and exported `ImageRequestQueue` with a concurrency limit of 4 simultaneous active RPC calls (`imgRequestQueue = new ImageRequestQueue(4)`), preventing Python event loop starvation during rapid browsing.
- Maintained request deduplication via `imgPending: Map<string, Promise<string | null>>` so concurrent component renders requesting identical URLs share a single worker promise.

### 3. Loading Shimmer & Low-Contrast Fallback (IMG-02)
- Added dark pulsing skeleton shimmer (`#1a1a1a` to `#2a2a2a`) using CSS keyframes animation while an image is actively loading.
- Standardized fallback presentation to a neutral, low-contrast `FaMusic` music note icon from `react-icons/fa` on missing or failed artwork states, matching SteamOS GamepadUI styling without breaking layout geometry.

### 4. Comprehensive Test Coverage
- Expanded [`tests/test_images.py`](file:///C:/Users/djdje/Deckify/tests/test_images.py) with `test_spotify_cdn_domains`, `test_mosaic_and_spotify_uri_variations`, and comprehensive SSRF / spoofing rejection tests. All 318 backend unit tests pass.
- Created [`src/components/common/DeckifyImage.test.ts`](file:///C:/Users/djdje/Deckify/src/components/common/DeckifyImage.test.ts) testing `ImageLruCache` item insertion, LRU eviction, recency refreshing, clearing, `ImageRequestQueue` concurrency limit (max 4), FIFO ordering, error isolation, and request deduplication. All 18 Vitest tests pass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking Issue] Separated non-React queue/cache helpers to `imagePipeline.ts` for Vitest execution**
- **Found during:** Task 3 verification
- **Issue:** Direct Vitest import of `DeckifyImage.tsx` attempted to load `react/jsx-dev-runtime`. In the Decky Loader environment, React is an external global provided by Steam CEF (`@decky/rollup`) and not a bundled local runtime package in `node_modules`.
- **Fix:** Extracted pure TypeScript primitives (`ImageLruCache`, `ImageRequestQueue`, `imgMemoryCache`, `imgRequestQueue`, `imgPending`, `fetchWithQueueAndCache`) into `src/components/common/imagePipeline.ts` and re-exported them from `DeckifyImage.tsx`. Mocked `@decky/api` in Vitest tests.
- **Files modified:** `src/components/common/imagePipeline.ts`, `src/components/common/DeckifyImage.tsx`, `src/components/common/DeckifyImage.test.ts`
- **Commit:** `cd215aa`

## Known Stubs

None. All classes and functions are fully implemented with zero placeholders.

## Self-Check: PASSED

- [x] All 5 files exist on disk:
  - `py_modules/images.py`
  - `src/components/common/DeckifyImage.tsx`
  - `src/components/common/DeckifyImage.test.ts`
  - `src/components/common/imagePipeline.ts`
  - `tests/test_images.py`
- [x] All 3 task commits exist in git history:
  - `cfde58b`: `test(02-01): create automated test harness stubs for image pipeline`
  - `d0d76f9`: `feat(02-01): expand backend CDN domain whitelisting and mosaic URI normalization`
  - `cd215aa`: `feat(02-01): implement frontend request queue, in-memory LRU cache, shimmer, and fallback`
- [x] All 318 backend unit tests pass.
- [x] All 18 Vitest unit tests pass.
- [x] TypeScript typecheck passes (`tsc --noEmit`).
- [x] Rollup bundle compiles cleanly (`rollup -c`).
