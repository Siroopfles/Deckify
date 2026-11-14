---
last_mapped_commit: 10018cbc1c9d1d294640d8866b3902ca56bcd816
last_mapped_at: 2026-11-14
---
# External Integrations

**Analysis Date:** 2026-11-14

## APIs & External Services

**Music Streaming & Playback Control:**
- Spotify Web API (`https://api.spotify.com/v1`) - Playback state polling, play/pause/skip/seek/shuffle/repeat control, device transfer, playlists/folders/albums/artists/podcasts/queue/search, and liked tracks (`py_modules/common.py`, `py_modules/spotify.py`, `py_modules/rpc_playback.py`, `py_modules/rpc_library.py`)
  - SDK/Client: Custom Python `urllib.request` client (`_spotify_api_request` in `py_modules/spotify.py`)
  - Auth: OAuth 2.0 PKCE Bearer access token + refresh token stored in plugin settings (`py_modules/auth.py`)
- Spotify Image CDNs (`https://i.scdn.co/image/`, `https://mosaic.scdn.co/300/`, `*.scdn.co`, `*.spotifycdn.com`, `*.spotifycdn.net`, `*.spotify.com`) - Album, track, artist, and playlist cover art (`py_modules/images.py`)
  - SDK/Client: Custom HTTPS proxy (`_fetch_spotify_image` in `py_modules/images.py`) converting images to Base64 Data URIs to bypass Steam CEF CSP restrictions
- Local Spotify Desktop Client CDP (`http://127.0.0.1:9229/json`) - Optional local Chrome DevTools Protocol bridge for inspecting/controlling the `com.spotify.Client` Flatpak (`py_modules/engine.py`, `py_modules/spotify.py`)

**Lyrics Providers (Cascading Fallback Chain in `py_modules/spotify.py`):**
- Spotify CDP Native Lyrics - Scrapes lyrics DOM from local Spotify Desktop Client when running on port `9229` (`_fetch_spotify_cdp_lyrics`)
- LRCLIB (`https://lrclib.net`) - Primary synced (`.lrc`) and plain-text lyrics API (`_http_lrclib_request`, User-Agent `Deckify/0.3.0`)
- NetEase Cloud Music (`http://music.163.com/api/search/get/web`, `http://music.163.com/api/song/lyric`) - Fallback synced/plain lyrics search (`_fetch_netease_lyrics`)
- Textyl / Musixmatch proxy (`https://api.textyl.co/api/lyrics`) - Fallback synced lyrics (`_fetch_musixmatch_lyrics`)
- lyrics.ovh (`https://api.lyrics.ovh/v1/{artist}/{title}`) - Plain-text lyrics fallback (`_fetch_plain_lyrics_fallback`)

**Steam Game Metadata & Assets:**
- Steam CDN (`https://cdn.cloudflare.steamstatic.com/steam/apps/{app_id}/library_600x900.jpg`, `*.steamstatic.com`, `*.steamcdn-a.akamaihd.net`, `*.steampowered.com`) - Game cover art for Soundtrack bindings (`py_modules/vdf_parser.py`, `py_modules/images.py`)
- Local Steam VDF / ACF files - Reads `libraryfolders.vdf`, `appmanifest_*.acf`, and binary `shortcuts.vdf` to discover installed Steam and Non-Steam games (`py_modules/vdf_parser.py`)

**Distribution & Updates:**
- GitHub Releases API (`https://api.github.com/repos/Siroopfles/Deckify/releases/latest`) - Used by `install.sh` to download `Deckify.tar.gz`

## Data Storage

**Databases:**
- None (no SQL or NoSQL database; uses JSON files and disk caches)

**File Storage:**
- Local filesystem only:
  - User settings & OAuth tokens: `{DECKY_PLUGIN_SETTINGS_DIR}/settings.json` (`py_modules/common.py`)
  - Image disk cache: `{DECKY_PLUGIN_RUNTIME_DIR}/cache/images/` with SHA-256 hashed `.bin` + `.meta` files and 50 MB LRU eviction (`py_modules/images.py`)
  - Self-signed TLS certs: `{DECKY_PLUGIN_RUNTIME_DIR}/cert.pem` and `key.pem` (`py_modules/common.py`, `py_modules/device.py`)
  - Process PIDs: `librespot.pid` and `spotify_client.pid` in `DECKY_PLUGIN_RUNTIME_DIR` (`py_modules/common.py`)

**Caching:**
- In-memory TTL / LRU caches in Python (`OrderedDict` / dicts in `py_modules/spotify.py`, `py_modules/vdf_parser.py`) and frontend image pipeline cache (`src/components/common/imagePipeline.ts`)
- On-disk 50 MB LRU image cache in `py_modules/images.py`

## Authentication & Identity

**Auth Provider:**
- Spotify Accounts OAuth 2.0 (`https://accounts.spotify.com/authorize` and `https://accounts.spotify.com/api/token`)
  - Implementation: Authorization Code Flow with PKCE (`_generate_pkce_pair`, `_spotify_token_request` in `py_modules/auth.py`). Users can supply a custom `spotify_client_id` in settings (`py_modules/common.py`).
  - Scopes (`CURRENT_SCOPES_VERSION = 6`): `user-read-currently-playing`, `user-read-playback-state`, `user-modify-playback-state`, `playlist-read-private`, `playlist-read-collaborative`, `playlist-modify-public`, `playlist-modify-private`, `user-library-read`, `user-library-modify`, `user-follow-read`, `user-read-recently-played`.
  - Local Callback Server: Embedded Python HTTPS server listening on port `39281` (`OAUTH_SERVER_PORT`) with self-signed X.509 certificate for `{hostname}.local` mDNS host (`main.py`, `py_modules/device.py`), paired with QR code display (`qrcode.react`) for mobile authentication.

## Monitoring & Observability

**Error Tracking:**
- None (no external error tracking service)

**Logs:**
- Backend: Decky Loader logger (`decky.logger.info`, `warning`, `error`, `debug` in `main.py` and `py_modules/*.py`)
- Frontend: Browser console (`console.log`, `console.error`) and Decky `toaster.toast` user notifications

## CI/CD & Deployment

**Hosting:**
- GitHub Releases (`Deckify.tar.gz` plugin archive)
- GitHub Pages (`deckify.advinn.co` custom CNAME serving `site/index.html`, `install.sh`, `uninstall.sh`, and `assets/` via `.github/workflows/deploy-pages.yml`)

**CI Pipeline:**
- GitHub Actions:
  - `.github/workflows/ci.yml`: Runs ESLint (`pnpm run lint`), TypeScript (`pnpm run typecheck`), Vitest (`pnpm test`), Python `unittest` (Python 3.11), and Rollup build (`pnpm run build`) on push/PR to `main`.
  - `.github/workflows/release.yml`: On `v*` tags, cross-compiles `librespot` (`v0.8.0`) with Rust/Cargo, builds frontend `dist/index.js`, generates categorized release notes, and packages `Deckify.tar.gz`.
  - `.github/workflows/deploy-pages.yml`: Deploys static landing page and install scripts to GitHub Pages.
- Local dev deploy: `deploy.sh` syncs plugin files over SSH/SCP to the Steam Deck and restarts `plugin_loader`.

## Environment Configuration

**Required env vars:**
- `PULSE_SERVER=unix:/run/user/{DECK_UID}/pulse/native` (constructed in `py_modules/common.py` for `librespot` / `pactl` subprocesses)
- `DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/{DECK_UID}/bus` (`py_modules/common.py`)
- `XDG_RUNTIME_DIR=/run/user/{DECK_UID}` (`py_modules/common.py`)
- `LD_LIBRARY_PATH` is explicitly stripped (`os.environ.pop("LD_LIBRARY_PATH", None)`) to prevent Decky's PyInstaller OpenSSL libraries from breaking `librespot` and `openssl`.

**Secrets location:**
- Spotify OAuth tokens (`access_token`, `refresh_token`) and optional `spotify_client_id` are stored locally in `{DECKY_PLUGIN_SETTINGS_DIR}/settings.json` on the Steam Deck. No `.env` files are used in the repository.

## Webhooks & Callbacks

**Incoming:**
- Local HTTPS OAuth callback endpoint on `https://{mdns_host}:39281` (`main.py`) receiving Spotify OAuth 2.0 authorization codes from the user's browser/phone.

**Outgoing:**
- None

---

*Integration audit: 2026-11-14*
