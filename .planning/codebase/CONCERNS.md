---
last_mapped_commit: a61bbf8da7ad74d4ba42198f0c3841b6ef17f7f8
last_mapped_at: 2026-11-10
---
# Codebase Concerns

**Analysis Date:** 2026-11-10

## Tech Debt

**Monolithic Modal Component (`DeckifyExpandedModal.tsx`):**
- Issue: Contains over 1,600 lines of TSX handling nine different views (Now Playing, Playlists, Liked, Albums, Artists, Recent, Podcasts, Equalizer, Settings), track action menus, and gamepad navigation logic in a single file.
- Files: `src/components/DeckifyExpandedModal.tsx`
- Impact: Increased cognitive load when refactoring; higher risk of regression when modifying tab-specific state or keyboard navigation handlers.
- Fix approach: Refactor views into dedicated subcomponents under `src/components/tabs/` (e.g., `NowPlayingTab.tsx`, `PlaylistsTab.tsx`, `SettingsTab.tsx`).

**Monolithic Backend Entry Point (`main.py`):**
- Issue: Over 2,600 lines combining RPC method routing, PulseAudio volume monitoring, process supervisory loops, and legacy compatibility shims.
- Files: `main.py`
- Impact: Harder to unit test individual background loops in isolation.
- Fix approach: Delegate supervisory loops and volume monitoring helpers into dedicated modules in `py_modules/`.

## Known Bugs & Edge Cases

**Large Library Loading (10,000+ Tracks):**
- Symptoms: Loading Liked Songs or large playlists can take noticeable time or cause temporary UI lag if paginated sequentially without virtualization.
- Files: `src/components/DeckifyExpandedModal.tsx`, `py_modules/spotify.py`
- Trigger: Opening "Liked Songs" tab when the user's Spotify account contains thousands of saved tracks.
- Workaround: Lazy-loading chunk batches (e.g., 50 tracks per batch) and avoiding eager retrieval of full track metadata.

**CEF Content Security Policy Restrictions on Images:**
- Symptoms: Images fail to load and display broken image placeholders when using direct `https://i.scdn.co/` URLs.
- Files: `src/components/DeckifyExpandedModal.tsx`, `py_modules/images.py`
- Trigger: Rendering external Spotify CDN URLs directly in the Steam GamepadUI browser.
- Workaround: Always use the `DeckifyImage` component which transparently requests and caches images as Base64 Data URIs via backend RPC `get_image`.

## Security Considerations

**Token Storage in Settings File:**
- Risk: User Spotify OAuth access and refresh tokens are stored unencrypted in `~/.config/deckify/settings.json`.
- Files: `py_modules/common.py`, `main.py`
- Current mitigation: Settings directory ownership is explicitly enforced to the `deck` user (UID 1000) on startup to prevent cross-user read access.
- Recommendations: Keep token storage local to the user home directory; never commit `settings.json` or logs to version control.

**Local OAuth Redirect Server:**
- Risk: Local HTTP listener on `localhost:8888` during Spotify login flow.
- Files: `py_modules/auth.py`, `main.py`
- Current mitigation: Binds strictly to `127.0.0.1` and closes immediately upon capturing the authorization code.
- Recommendations: Ensure ephemeral port binding or short timeout to avoid leaving open listening sockets.

## Performance Bottlenecks

**Image Caching and Base64 Conversion:**
- Problem: Downloading high-resolution album art and encoding it to Base64 in Python consumes CPU cycles and disk space.
- Files: `py_modules/images.py`, `src/components/DeckifyExpandedModal.tsx`
- Cause: Steam CEF blocks external image URLs, requiring base64 encoding.
- Improvement path: Maintain in-memory LRU cache in React frontend and size limits on disk cache in `~/.cache/deckify/images/` with automatic pruning of covers older than 30 days.

**Spotify API Rate Limits (HTTP 429):**
- Problem: Exceeding Spotify rate limits causes all music operations to fail for the duration of the cooldown period.
- Files: `src/components/DeckifyExpandedModal.tsx`, `py_modules/spotify.py`
- Cause: Continuous polling of multiple endpoints simultaneously.
- Improvement path: Strictly limit interval polling to `get_player_state` on a 1000ms ticker, and load library/queue items only on explicit tab switches or user interaction.

## Fragile Areas

**GamepadUI Spatial Navigation & Focus Trapping:**
- Files: `src/components/DeckifyExpandedModal.tsx`, `src/index.tsx`
- Why fragile: SteamOS GamepadUI uses internal spatial navigation heuristics. Misconfigured `flow-children` attributes or improper event bubbling can cause D-pad focus to unexpectedly escape modal dialogs or jump across background lists.
- Safe modification: Always test controller navigation using a physical gamepad or Steam Deck. Keep `flow-children="horizontal"` for row layouts and ensure action menus call `e.stopPropagation()` and disable pointer/focus events on background lists while open.
- Test coverage: Partially tested via unit tests; primary verification requires live hardware testing on SteamOS.

## Scaling Limits

**Image Disk Cache:**
- Current capacity: Unbounded file accumulation in `~/.cache/deckify/images/`.
- Limit: Can accumulate thousands of small image files after extended music browsing.
- Scaling path: Introduce automated cache eviction in `images.py` keeping total cache size under 100 MB.

## Dependencies at Risk

**`librespot` & `spotifyd` Precompiled Binaries:**
- Risk: Third-party Rust binaries executing headless Spotify Connect playback. May become outdated or break when Spotify updates audio codecs or auth handshakes.
- Impact: Loss of standalone background playback without official Spotify desktop app.
- Migration plan: Maintain fallback support for the official Spotify Flatpak client (`com.spotify.Client`) via virtual display.

## Test Coverage Gaps

**Gamepad Controller Input Events:**
- What's not tested: Live GamepadUI D-pad spatial focus transitions and Steam Quick Chord triggers.
- Files: `src/components/DeckifyExpandedModal.tsx`, `src/index.tsx`
- Risk: UI focus traps or navigation bugs might escape unit test suites.
- Priority: Medium (requires ongoing manual verification on Steam Deck hardware during releases).

---

*Concerns audit: 2026-11-10*
