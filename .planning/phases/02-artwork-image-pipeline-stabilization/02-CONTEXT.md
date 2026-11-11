# Phase 2: Artwork & Image Pipeline Stabilization - Context

**Gathered:** 2026-11-11  
**Status:** Ready for planning  

<domain>
## Phase Boundary

Eliminate missing cover art and images across all SteamOS GamepadUI views (playlists, albums, artists, tracks, podcasts, HUD overlay) by:
1. Expanding backend image URL domain validation in `py_modules/images.py` to cover all Spotify CDN hosts (`i.scdn.co`, `image-cdn-ak.spotifycdn.com`, `image-cdn-fa.spotifycdn.com`, `mosaic.scdn.co`, etc.).
2. Implementing a robust client-side concurrency-throttling request queue in `DeckifyImage.tsx` (max 4-6 parallel active RPC calls) combined with an in-memory LRU cache (~200 items) and backend disk caching.
3. Providing smooth visual feedback with subtle skeleton shimmer during loading and a standardized Deckify music note fallback icon when artwork is unavailable or fails to load.

</domain>

<decisions>
## Implementation Decisions

### CDN Domain Validation & Backend Image Proxy
- **D-01:** Expand `_validate_image_url` in `py_modules/images.py` to allow all valid Spotify image CDN hostnames and subdomains (`*.scdn.co`, `*.spotifycdn.com`, including `mosaic.scdn.co`, `i.scdn.co`, `image-cdn-ak.spotifycdn.com`, `image-cdn-fa.spotifycdn.com`, etc.) without throwing 400 Bad Request or dropping mosaic artwork.
- **D-02:** Retain backend disk caching in `~/.cache/deckify/images/` using MD5 URL hashes so covers are fetched over the network only once per image URI.

### Frontend Concurrency Throttling & Caching
- **D-03:** Implement a client-side request worker queue in `DeckifyImage.tsx` with a concurrency limit of 4-6 simultaneous `get_image` RPC requests. When navigating or scrolling through massive lists (e.g. 500-track playlists), excess requests wait in the priority queue rather than overloading Steam CEF and the Python backend event loop.
- **D-04:** Maintain a frontend JavaScript in-memory LRU cache (capacity: 200 base64 images) to provide instantaneous rendering when scrolling back up or switching between tabs without hitting the RPC bridge.

### Loading State & Fallback Visuals
- **D-05:** Show a subtle dark pulsing skeleton shimmer (`#1a1a1a` to `#2a2a2a`) while an image is actively loading.
- **D-06:** Fallback state: When artwork is missing (`image_url` is null/empty) or fetching fails after retry, render a clean, neutral Deckify music note SVG icon (`react-icons/fi` `FiMusic` or similar) with low-contrast styling matching SteamOS GamepadUI.

### Quality & Regression Guardrails
- **D-07:** Retain 100% backend unit test coverage in `tests/test_images.py` and `tests/test_plugin_api.py`, adding tests for new CDN patterns and mosaic URLs.
- **D-08:** Verify frontend typecheck (`pnpm typecheck`), Vitest unit tests (`pnpm test`), and Rollup bundling (`pnpm build`).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture & Conventions
- `.planning/codebase/ARCHITECTURE.md` — Image Retrieval Flow (CSP Proxy) and CEF constraints
- `.planning/codebase/CONVENTIONS.md` — Error handling and async RPC conventions
- `py_modules/images.py` — Existing image proxy, disk caching, and URL validator
- `src/components/common/DeckifyImage.tsx` — Current frontend image component

### Requirements
- `.planning/REQUIREMENTS.md` — Requirements IMG-01 and IMG-02

</canonical_refs>
