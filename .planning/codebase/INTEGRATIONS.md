---
last_mapped_commit: a61bbf8da7ad74d4ba42198f0c3841b6ef17f7f8
last_mapped_at: 2026-11-10
---
# External Integrations

**Analysis Date:** 2026-11-10

## APIs & External Services

**Spotify Web API:**
- Music playback control, user library management, playlist search, and queue management
  - Endpoints: `https://api.spotify.com/v1/me/player/*`, `me/tracks`, `me/albums`, `me/playlists`, `me/shows`, `search`, `me/player/recently-played`, `me/player/queue`
  - Implementation: `py_modules/spotify.py` and `main.py`
  - Auth: OAuth2 PKCE Authorization Code flow (`https://accounts.spotify.com/authorize` and `https://accounts.spotify.com/api/token`). Tokens refreshed automatically via `refresh_token` in `py_modules/spotify.py`.

**LRCLIB Lyrics API:**
- Realtime synchronized and plain-text lyrics fetching for currently playing tracks
  - Endpoints: `https://lrclib.net/api/get`
  - Implementation: `py_modules/spotify.py` (`fetch_lyrics_from_lrclib`, `_fetch_lyrics_sync`)
  - Auth: None (public REST API with User-Agent header)
  - Features: Automatic track title sanitization (removing "Remastered", "feat.", special characters) with fallback matching.

**Decky Loader Plugin API:**
- Host environment integration on SteamOS
  - SDK: `@decky/api` (frontend), `decky` Python module (backend)
  - Inter-Process Communication (IPC): WebSocket / JSON-RPC bridge provided by Decky Loader daemon (`plugin_loader`).

## Data Storage

**Databases:**
- None (stateless file-based configuration).

**File Storage:**
- Local filesystem only:
  - Settings: `~/.config/deckify/settings.json` (stores tokens, volume preferences, equalizer presets, UI toggles)
  - Image Cache: `~/.cache/deckify/images/` (persists downloaded base64 album/playlist covers to bypass CEF CSP restrictions)
  - Engine Binaries: `~/.local/share/deckify/bin/` or plugin root `bin/` (`librespot`, `spotifyd`)

**Caching:**
- Memory & Disk Caching:
  - Base64 Images: In-memory cache in frontend `DeckifyImage` (`src/components/DeckifyExpandedModal.tsx`) and LRU disk cache in backend `py_modules/images.py`
  - Spotify Likes: In-memory TTL cache (300 seconds) in `main.py` to prevent repeated calls to `me/tracks/contains`
  - Spotify Token: Cached in `settings.json` with expiration timestamp and automatic proactive refresh

## Authentication & Identity

**Auth Provider:**
- Spotify Accounts Service (OAuth 2.0 PKCE)
  - Implementation: `py_modules/spotify.py` and `py_modules/auth.py`
  - User Flow: Displays login URL or QR code generated via `qrcode.react` (`src/index.tsx`), captures redirect callback with authorization code, and exchanges code for access & refresh tokens.

## Monitoring & Observability

**Error Tracking:**
- None (privacy-preserving local logging).

**Logs:**
- Standard Decky Loader logging:
  - Backend: `decky.logger.info()` and `decky.logger.error()` logging to `/tmp/decky-loader.log` and `/home/deck/homebrew/logs/deckify/`
  - Frontend: `console.log` / `console.error` visible via CEF remote debugging port (`localhost:8080`)

## CI/CD & Deployment

**Hosting:**
- GitHub Releases (`Siroopfles/Deckify`)

**CI Pipeline:**
- GitHub Actions (`.github/workflows/release.yml`):
  - Builds TypeScript frontend with pnpm and Rollup
  - Runs Python unittests (`python3 -m unittest discover -s tests`)
  - Runs Vitest frontend test suite (`pnpm test`)
  - Packages plugin zip asset with `plugin.json`, `dist/`, `py_modules/`, `main.py`
  - Creates automated GitHub releases on version tag push

## Environment Configuration

**Required env vars:**
- `DECKY_PLUGIN_SETTINGS_DIR`: Directory path for persistent configuration (provided by Decky Loader)
- `DECKY_PLUGIN_RUNTIME_DIR`: Plugin runtime directory (provided by Decky Loader)
- `LD_LIBRARY_PATH`: Explicitly cleared on backend startup in `main.py` to prevent PyInstaller bundling conflicts with system OpenSSL / PipeWire libraries

**Secrets location:**
- Client ID: Configured in `py_modules/common.py` (public client ID for PKCE flow, no client secret required)
- User Access/Refresh Tokens: Stored locally in user-owned `settings.json` with permissions restricted to `deck` user (UID 1000)

## Webhooks & Callbacks

**Incoming:**
- Local OAuth redirect receiver: `http://localhost:8888/callback` (handled during authentication)

**Outgoing:**
- None

---

*Integration audit: 2026-11-10*
