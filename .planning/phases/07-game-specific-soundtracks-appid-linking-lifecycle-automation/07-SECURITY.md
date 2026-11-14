---
phase: 07-game-specific-soundtracks-appid-linking-lifecycle-automation
status: secured
threats_open: 0
threats_closed: 11
asvs_level: 1
verified: 2026-11-14T20:12:43Z
---

# Phase 07 Security Audit

**Verdict:** SECURED (`11/11` threats closed, `threats_open: 0`, ASVS Level 1 verified at L2 boundary depth)

## Threat Verification

| Threat ID | Category | Severity | Disposition | Evidence |
|-----------|----------|----------|-------------|----------|
| T-07-01 | Denial of Service | medium | mitigate | `py_modules/vdf_parser.py:23-71` (`_MAX_DEPTH = 32`, `while pos < length:`, `_read_cstring`, `except (struct.error, IndexError, ValueError)`); `py_modules/vdf_parser.py:24-25,212-226` (30s `_CACHE_TTL` via `time.monotonic()`) |
| T-07-02 | Tampering | high | mitigate | `py_modules/soundtrack.py:16-18,49-59,105-180` (`validate_app_id` rejects bool/non-int/`<=0`/`>0xFFFFFFFF`, `_sanitize_profile` whitelists keys/enums/bounds); `main.py:685-721` (all app_id RPCs call `soundtrack.validate_app_id`) |
| T-07-03 | Information Disclosure | low | mitigate | `py_modules/soundtrack.py:184-205` (`get_player_state` captures only `is_playing`, `context_uri`, `track_uri`, `position_ms`, `volume`; no OAuth tokens or secrets serialized) |
| T-07-04 | Denial of Service | medium | mitigate | `src/components/tabs/PlaylistPickerModal.tsx:72-99` (300ms debounced `search_spotify`); `src/components/tabs/SoundtracksTab.tsx:98-116,164-167` (`useMemo` for `visibleGames`, 500ms `scheduleSave` debounce) |
| T-07-05 | Tampering | medium | mitigate | `src/index.tsx:834-885` (`gameExitDebounceTimer` cleared on re-launch and `onDismount()`); `py_modules/soundtrack.py:236-263` (`_cancel` cancels pending `_launch_task`/`_exit_task` on state transitions) |
| T-07-06 | Information Disclosure | low | mitigate | `src/components/tabs/SoundtracksTab.tsx:251-257` & `src/components/tabs/PlaylistPickerModal.tsx:136` (all game capsules and playlist/album covers routed through `<DeckifyImage>` base64 proxy) |
| T-07-07 | Tampering / SSRF | high | mitigate | `py_modules/images.py:10-44` (`ALLOWED_SPOTIFY_DOMAINS` includes Spotify CDNs + `steamstatic.com`, `steamcdn-a.akamaihd.net`, `steampowered.com`; `_is_allowed_spotify_host` exact/subdomain match; `_validate_image_url` enforces `https`, port `None`/`443`, no user/pass; `_ImageRedirectHandler` validates redirects) |
| T-07-08 | Denial of Service | low | mitigate | `py_modules/images.py:8,47-77,101-118` (10s `timeout=10`, `MAX_IMAGE_BYTES` read cap, 50 MB `MAX_IMAGE_CACHE_BYTES` LRU eviction via `_clean_image_cache_lru`) |
| T-07-09 | Tampering | low | mitigate | `py_modules/rpc_library.py:43,862` (`p.get("uri") or f"spotify:playlist:{p['id']}"`); `src/components/tabs/soundtrackUtils.ts:112-123` (`toSelection` constructs `spotify:album:`/`spotify:playlist:` fallback); `py_modules/soundtrack.py:43-46` (`_clean_uri` requires `spotify:` prefix) |
| T-07-10 | Denial of Service | low | mitigate | `src/index.tsx:837-873` (`Router?.MainRunningApp?.appid` and `SteamClient?.GameSessions?.RegisterForAppLifetimeNotifications` guarded with optional chaining and `try/catch`) |
| T-07-SC | Tampering | high | mitigate | `package.json:27-50` & `py_modules/vdf_parser.py` / `py_modules/soundtrack.py` / `py_modules/images.py` (zero new external npm/pip dependencies; Python stdlib + existing `@decky/ui`/`@decky/api`/`react-icons` only) |
