---
last_mapped_commit: f8defec7206b337ccec032ac6a11b40649e888bd
last_mapped_at: 2026-11-26
---
</Technology Stack>
<External Integrations>
**Analysis Date:** 2026-11-26

## APIs & External Services

**Music & Playback:**
- Spotify Web API (`https://api.spotify.com/v1`) - Playback state, queue, devices, playlists, albums, artists, saved tracks, podcasts/episodes, search, and radio (`py_modules/spotify.py`, `py_modules/common.py`)
  - SDK/Client: Custom Python stdlib `urllib.request` HTTP client (`py_modules/spotify.py`)
  - Auth: OAuth 2.0 PKCE user access token (`Authorization: Bearer <token>`)
- Spotify Image CDN (`https://i.scdn.co/image/`, `https://mosaic.scdn.co/300/`) - Album, playlist, and podcast cover art (`py_modules/images.py`, `py_modules/cdp_bridge.py`)
  - Proxied through `py_modules/images.py` into base64 Data URIs / local cache to comply with Steam CEF Content Security Policy (CSP)
- Steam Store CDN (`https://cdn.cloudflare.steamstatic.com/steam/apps/{app_id}/library_600x900.jpg`) - Game cover art for detected Steam library games in Soundtrack / Game EQ binding (`py_modules/vdf_parser.py`)

**Lyrics Providers (Fallback Chain in `py_modules/spotify.py`):**
- LRCLIB (`https://lrclib.net`) - Primary synced/plain lyrics API (uses `User-Agent: Deckify/0.3.0 (https://github.com/Siroopfles/Deckify)`)
- NetEase Cloud Music (`http://music.163.com/api/search/get/web`, `http://music.163.com/api/song/lyric`) - Secondary synced lyrics fallback
- Textyl (`https://api.textyl.co/api/lyrics`) - Tertiary synced lyrics fallback
- Lyrics.ovh (`https://api.lyrics.ovh/v1/`) - Plain lyrics fallback

**Local Process & IPC Bridges:**
- `librespot` (`bin/librespot`, `v0.8.0`) - Headless Spotify Connect audio engine spawned by `main.py` (`py_modules/engine.py`), reporting track/playback events via `--onevent` shell script (`py_modules/resilience.py`) over Unix domain socket (`onevent.sock`)
- Official Spotify Linux Client (`com.spotify.Client` Flatpak) - Optional audio backend controlled via Chrome DevTools Protocol (CDP) on `http://127.0.0.1:9229/json` and WebSocket (`py_modules/cdp_bridge.py`, `py_modules/engine.py`)
- MPRIS2 D-Bus Service (`org.mpris.MediaPlayer2.deckify` on `DBUS_SESSION_BUS_ADDRESS`) - Pure-Python D-Bus wire-protocol server (`py_modules/mpris.py`) exposing media metadata and playback controls to SteamOS / Linux desktop
- PipeWire / PulseAudio (`pactl`, `pw-cli`, `pipewire`) - Volume control, auto-ducking, dock audio sink switching (`py_modules/volume.py`, `py_modules/dock.py`, `py_modules/device.py`), and 10-band biquad filter-chain EQ (`py_modules/equalizer.py`)
- Linux HID / Input Subsystem (`/dev/hidraw*`, `/dev/input/event*`) - Passive read-only (`O_RDONLY | O_NONBLOCK`) controller watcher for Steam Deck & Triton gamepad chords (`py_modules/input_watch.py`)

## Data Storage

**Databases:**
- None (no SQL/NoSQL database)

**File Storage:**
- Local filesystem JSON and binary cache:
  - `DECKY_PLUGIN_SETTINGS_DIR/settings.json` - Atomic JSON persistence for user preferences, OAuth tokens, pinned playlists, game audio profiles, and chord bindings (`py_modules/common.py`)
  - `DECKY_PLUGIN_RUNTIME_DIR/cache/` - Disk cache for proxied cover art (`py_modules/images.py`)
  - `DECKY_PLUGIN_RUNTIME_DIR/session_bookmark.json` - Saved playback position/context for sleep-wake recovery and travel mode (`py_modules/resilience.py`)
  - `DECKY_PLUGIN_SETTINGS_DIR/eq-filter-chain.conf` - Generated PipeWire filter-chain configuration (`py_modules/equalizer.py`)
  - Steam VDF files (`libraryfolders.vdf`, `appmanifest_*.acf`, `shortcuts.vdf`) - Read-only parsing for installed Steam & non-Steam games (`py_modules/vdf_parser.py`)

**Caching:**
- In-memory TTL caches in Python backend (liked-track status, playback state) and in-memory `Map` image cache in frontend (`src/components/common/DeckifyImage.tsx`, `src/components/common/imagePipeline.ts`)

## Authentication & Identity

**Auth Provider:**
- Spotify OAuth 2.0 with PKCE (`https://accounts.spotify.com/authorize`, `https://accounts.spotify.com/api/token`)
  - Implementation: `py_modules/auth.py` generates PKCE code verifier/challenge; `main.py` runs a temporary local HTTPS callback server on port `39281` (`OAUTH_SERVER_PORT`) with a self-signed TLS certificate (`cert.pem`/`key.pem` generated via `openssl`) and mDNS hostname redirect, or supports manual paste-back / QR code scan (`qrcode.react`)
  - User supplies their own Spotify Developer `client_id` stored in `settings.json`

## Monitoring & Observability

**Error Tracking:**
- None (no external error tracking service)

**Logs:**
- Backend logs via `decky.logger` (`info`, `warning`, `error`, `debug`) to Decky Loader journal/logs (`main.py`, `py_modules/*.py`)
- Frontend logs via `console.log` / `console.error` and user-facing notifications via `@decky/ui` `toaster.toast` and `SilentBanner` (`src/components/SilentBanner.tsx`)

## CI/CD & Deployment

**Hosting:**
- GitHub Releases (`Siroopfles/Deckify`) distributes `Deckify.tar.gz` (bundled `dist/index.js`, `main.py`, `py_modules/`, `plugin.json`, `package.json`, and compiled `bin/librespot`) installed via `install.sh`
- GitHub Pages (`deckify.advinn.co`) hosts static site (`site/index.html`), `assets/`, `install.sh`, and `uninstall.sh`

**CI Pipeline:**
- GitHub Actions:
  - `.github/workflows/ci.yml` - Runs `eslint`, `tsc --noEmit`, `vitest run`, `python3 -m unittest`, and `rollup -c` on push/PR to `main`
  - `.github/workflows/release.yml` - Compiles `librespot` (`v0.8.0`) in Rust, builds frontend, packages `Deckify.tar.gz`, and publishes GitHub Release on `v*` tags
  - `.github/workflows/deploy-pages.yml` - Deploys static site and install scripts to GitHub Pages

## Environment Configuration

**Required env vars:**
- None in `.env` files; runtime relies on Decky Loader injected `decky` paths (`DECKY_PLUGIN_SETTINGS_DIR`, `DECKY_PLUGIN_DIR`, `DECKY_PLUGIN_RUNTIME_DIR`) and Linux user session variables (`PULSE_SERVER`, `DBUS_SESSION_BUS_ADDRESS`, `XDG_RUNTIME_DIR` constructed in `py_modules/common.py`)

**Secrets location:**
- Spotify OAuth `access_token`, `refresh_token`, and `spotify_client_id` are stored locally in `DECKY_PLUGIN_SETTINGS_DIR/settings.json`
- Local OAuth TLS cert/key stored in `DECKY_PLUGIN_RUNTIME_DIR/cert.pem` and `key.pem`

## Webhooks & Callbacks

**Incoming:**
- Local HTTPS OAuth callback endpoint on port `39281` (`OAUTH_SERVER_PORT` in `py_modules/common.py`, handled in `main.py`) receiving Spotify authorization `code` and `state`
- Local Unix domain socket `DECKY_PLUGIN_RUNTIME_DIR/onevent.sock` receiving `librespot` lifecycle events (`started`, `changed`, `playing`, `paused`, `stopped`, etc.) via `curl --unix-socket` (`py_modules/resilience.py`)

**Outgoing:**
- None

---

*Integration audit: 2026-11-26*
