---
last_mapped_commit: 10018cbc1c9d1d294640d8866b3902ca56bcd816
last_mapped_at: 2026-11-14
---
# Codebase Concerns

**Analysis Date:** 2026-11-14

## Tech Debt

**Monolithic `Plugin` God Class (`main.py`):**
- Issue: `main.py` spans 1,574 lines and concentrates Decky RPC routing, OAuth HTTP server handling, `librespot`/Flatpak process supervision, CDP quality sync, PipeWire clock configuration, and playback polling into a single `Plugin` class with ~35 mutable class/instance attributes.
- Files: `main.py`
- Impact: High coupling makes lifecycle state transitions (`_main`, `_unload`, `_on_deck_sleep`, `_on_deck_resume`) hard to reason about, and class-level default attributes can leak across test or reload boundaries if not reset in `__init__` and `_main`.
- Fix approach: Extract OAuth HTTP server (`_handle_oauth_*`, `_send_landing_page`, `_redirect_to_spotify`), process supervision (`start_librespot`, `start_spotify_client`, `_monitor_process`), and playback polling (`_poll_playback`, `_poll_api_loop`) into dedicated modules under `py_modules/` analogous to `py_modules/volume.py` and `py_modules/soundtrack.py`.

**Oversized `DeckifyExpandedModal` Component (`src/components/DeckifyExpandedModal.tsx`):**
- Issue: `DeckifyExpandedModal` is 1,152 lines total with the primary component function spanning 972 lines and a cyclomatic complexity of 51 (ESLint limits: 80 lines, complexity 15), managing 25+ `useState` hooks, RPC callables, drill-down navigation, lyrics syncing, and modal overlays in one component.
- Files: `src/components/DeckifyExpandedModal.tsx`, `src/components/tabs/SettingsTab.tsx`, `src/index.tsx`
- Impact: High cognitive load, frequent ESLint warnings (`max-lines-per-function`, `complexity`, `no-empty`, `@typescript-eslint/no-explicit-any`), and elevated risk of stale closures or focus-state regressions when modifying any tab.
- Fix approach: Move library/drill-down data fetching and state into custom hooks (e.g., `useLibraryData`, `useLyricsSync`) and let individual tab components own their own RPC callables and local loading state.

**Pervasive Broad Exception Swallowing (`except Exception` / `catch {}`):**
- Issue: Over 100 `except Exception:` blocks across `main.py`, `py_modules/rpc_library.py`, `py_modules/rpc_playback.py`, `py_modules/volume.py`, `py_modules/spotify.py`, `py_modules/device.py`, `py_modules/engine.py`, and `py_modules/images.py` silently `pass` or return fallback values, while frontend components (`src/components/DeckifyExpandedModal.tsx`, `src/components/tabs/SettingsTab.tsx`) use empty `catch {}` blocks.
- Files: `main.py`, `py_modules/rpc_library.py`, `py_modules/spotify.py`, `py_modules/images.py`, `src/components/DeckifyExpandedModal.tsx`, `src/components/tabs/SettingsTab.tsx`
- Impact: Real bugs (e.g., disk permission errors, malformed JSON, unexpected API errors) are masked instead of surfaced in logs or UI diagnostics.
- Fix approach: Narrow exception catches to expected types (`OSError`, `urllib.error.URLError`, `json.JSONDecodeError`, `TimeoutError`) and log unexpected exceptions with context via `decky.logger.warning` or `decky.logger.error`.

**Extensive `any` Type Escapes in Frontend Code:**
- Issue: Widespread use of `any` across `src/index.tsx`, `src/steamMenu.tsx`, `src/components/DeckifyExpandedModal.tsx`, and test mocks (`src/components/DeckifyExpandedModal.test.tsx`, `src/index.test.tsx`) bypasses TypeScript `strict: true` guarantees in `tsconfig.json`.
- Files: `src/index.tsx`, `src/steamMenu.tsx`, `src/components/DeckifyExpandedModal.tsx`, `tsconfig.json`
- Impact: Breaking changes in Decky RPC payloads or `@decky/ui` props are not caught at compile time (`pnpm run typecheck`).
- Fix approach: Define typed interfaces in `src/types.ts` for event payloads (`track_metadata`, `librespot_event`, `ducking_state_changed`, `soundtrack_prompt_switch`) and Decky/SteamClient globals in `src/types.d.ts`.

## Known Bugs

**Missing `import time` in `py_modules/spotify.py`:**
- Symptoms: When Spotify Web API returns HTTP 429 (Too Many Requests), `_spotify_api_request` attempts `time.sleep(min(retry_after, 2))` and raises `NameError: name 'time' is not defined` instead of backing off and re-raising `urllib.error.HTTPError`.
- Files: `py_modules/spotify.py` (line 46)
- Trigger: Any Spotify API call in `_spotify_api_request` receiving an HTTP 429 response.
- Workaround: None; add `import time` to `py_modules/spotify.py`.

## Security Considerations

**Plaintext OAuth Tokens Persisted in Settings File:**
- Risk: Spotify `access_token` and `refresh_token` are stored in plaintext JSON inside `settings.json` (`_save_settings` in `py_modules/common.py`) without restricting file permissions (`chmod 0o600`), and `main.py` runs with `_root` privileges (`plugin.json`).
- Files: `main.py` (lines 131-133, 1171-1175), `py_modules/common.py` (lines 234-238), `plugin.json` (line 4)
- Current mitigation: `main.py` strips sensitive keys when logging settings (`safe_keys` on lines 134-135), and `uninstall.sh --purge` removes settings directories.
- Recommendations: Set restrictive `0o600` permissions on `settings.json` (owned by `DECK_UID`) when writing tokens, or separate credentials into a dedicated `0o600` token file.

**Missing OAuth `state` Parameter & Unescaped HTTP Error Responses:**
- Risk: The PKCE OAuth flow in `main.py` (`_redirect_to_spotify` / `_handle_oauth_callback`) does not generate or validate a `state` parameter against CSRF/login-swap attacks on the local callback server (`OAUTH_SERVER_PORT = 39281`). Additionally, `_send_http_response` interpolates `body` directly into HTML without `html.escape()`, so `_handle_oauth_callback` passing `f"Error: {e}"` can reflect unescaped error text as HTML.
- Files: `main.py` (lines 1150-1195, 1237-1269)
- Current mitigation: `_send_landing_page` uses `html.escape()` for `client_id` and `redirect_uri`, and the OAuth server is short-lived and stopped in `finally`.
- Recommendations: Generate a per-flow random `state` token via `secrets.token_urlsafe(16)`, verify it on `/callback`, and wrap `body` with `escape(body)` inside `_send_http_response`.

**Plugin Runs as Root (`_root` Flag) & Uses Unpinned `StrictHostKeyChecking=no` in Dev Scripts:**
- Risk: `plugin.json` declares `"flags": ["_root"]`, so any subprocess or file write bug in `main.py` executes with root privileges unless explicitly wrapped in `_build_deck_command`. Separately, `deploy.sh` passes `-o StrictHostKeyChecking=no` to `ssh` and `scp`.
- Files: `plugin.json` (line 4), `py_modules/common.py` (lines 273-293), `deploy.sh` (lines 53, 81)
- Current mitigation: `_build_deck_command` drops to `DECK_USER` for GUI/audio subprocesses; `images.py` enforces an HTTPS domain allowlist (`ALLOWED_SPOTIFY_DOMAINS`) and 5 MB limit (`MAX_IMAGE_BYTES`).
- Recommendations: Audit all `subprocess.run`/`Popen` calls (e.g., `pactl` in `py_modules/volume.py`, `openssl` in `py_modules/device.py`) to ensure least-privilege execution and explicit `chown` where needed.

## Performance Bottlenecks

**Continuous 3-Second Polling Loops on Backend and Frontend:**
- Problem: `main.py` runs `_monitor_process` every 3s (spawning `pactl list sink-inputs` via `_refresh_audio_stream_info` on every tick) and `_poll_api_loop` every 3s (calling Spotify `me/player`), while `src/index.tsx` also runs `setInterval` polling (`get_status` / `get_sleep_timer_status`) every few seconds.
- Files: `main.py` (lines 1472-1574), `py_modules/volume.py` (lines 115-130), `src/index.tsx` (lines 175, 693)
- Cause: Periodic polling is used instead of purely event-driven updates for PipeWire stream info and fallback playback sync.
- Improvement path: Skip `_refresh_audio_stream_info` subprocess spawning when `_is_playing` is `False`, and rely on `decky.emit` push events (`track_metadata`, `librespot_event`, `settings_changed`) to reduce frontend polling frequency.

**Synchronous Blocking HTTP & Subprocess Calls Inside `_exec` Thread Pool:**
- Problem: All Spotify API calls (`py_modules/spotify.py`), image downloads (`py_modules/images.py`), CDP WebSocket calls (`py_modules/engine.py`), and `pactl` invocations (`py_modules/volume.py`) use blocking `urllib.request.urlopen` / `socket` / `subprocess.run` wrapped in `loop.run_in_executor(None, ...)` with a 10s default timeout.
- Files: `py_modules/common.py` (lines 249-270), `py_modules/spotify.py`, `py_modules/engine.py`, `py_modules/images.py`
- Cause: Standard-library-only constraint avoids third-party async HTTP/WebSocket dependencies (`aiohttp`, `websockets`).
- Improvement path: Reuse HTTP connections or bound concurrent image/track fetches in `rpc_library.py` so bulk playlist/album loads do not saturate Python's default `ThreadPoolExecutor`.

## Fragile Areas

**SteamOS GamepadUI React Fiber Monkey-Patching (`src/steamMenu.tsx`):**
- Files: `src/steamMenu.tsx` (lines 32-149)
- Why fragile: Traverses Steam's internal React Fiber tree (`getReactRoot`, `MainNavMenuContainer`), mutates `parent.type` and `parent.alternate.type`, and inspects hardcoded nested structure (`result?.props?.children?.props?.children?.[0]`) to inject a Deckify entry into the Steam menu.
- Safe modification: Always test against the target SteamOS GamepadUI build and ensure `s.dispose()` cleanly restores `original` and `innerOriginal` references.
- Test coverage: No dedicated unit test file exists for `src/steamMenu.tsx`.

**Official Spotify Client CDP React Fiber Traversal (`main.py` & `py_modules/engine.py`):**
- Files: `main.py` (lines 275-322), `py_modules/engine.py` (lines 174-441), `py_modules/spotify.py` (lines 250-271)
- Why fragile: `_sync_spotify_client_quality_cdp`, `get_spotify_client_auth_status`, and `_fetch_spotify_cdp_folder_tree` inject raw JavaScript over a hand-rolled RFC 6455 WebSocket client (`_cdp_call`) on `SPOTIFY_CDP_PORT` (`9229`), walking `__reactContainer` fibers and `SettingsAPI` / `PlatformAPI` internals of the `com.spotify.Client` Flatpak. Any Spotify Desktop client update can silently break quality syncing, auth detection, or folder tree extraction.
- Safe modification: Keep CDP failures non-fatal and guarded with fallbacks (`prefs` file writes in `_write_spotify_client_prefs` and rootlist cache parsing in `_parse_spotify_rootlist_folders`).
- Test coverage: Tested with mocked targets/responses in `tests/test_device_and_engine.py`, not against live `com.spotify.Client` builds.

**Raw Virtual Wayland / Xwayland Spawning (`main.py`):**
- Files: `main.py` (lines 343-384)
- Why fragile: `start_spotify_client` launches `kwin_wayland --virtual --xwayland` and polls `/tmp/.X11-unix/X*` for up to 3 seconds (`disp = ":2"` fallback) to discover the new Xwayland display socket. Race conditions with other X11/Xwayland sessions on the Deck can bind the wrong display.
- Safe modification: Prefer deterministic display allocation or verify the PID/ownership of the newly created X11 socket before launching Flatpak.
- Test coverage: Process launch is mocked in unit tests (`tests/test_device_and_engine.py`, `tests/test_plugin_lifecycle.py`).

## Scaling Limits

**Disk Image Cache & Lyrics Cache Growth:**
- Current capacity: `IMAGE_CACHE_DIR` enforces a 50 MB LRU limit (`MAX_IMAGE_CACHE_BYTES = 50 * 1024 * 1024` in `py_modules/images.py:8`) and `_LYRICS_CACHE` caps in-memory entries at 100 (`_CACHE_MAX_ENTRIES = 100` in `py_modules/spotify.py:92`).
- Limit: Disk-persisted lyrics JSON files in `LYRICS_CACHE_DIR` (`py_modules/spotify.py:13, 141-148`) have no LRU eviction or size cap and grow unboundedly over time. Additionally, `_clean_image_cache_lru` scans the entire `IMAGE_CACHE_DIR` synchronously on every cache write and relies on `st_atime`, which may be disabled on `noatime`/`relatime` filesystems.
- Scaling path: Add a file-count/size cap to `LYRICS_CACHE_DIR` and use `st_mtime` (updating mtime on cache hit) instead of `st_atime` for reliable LRU eviction on SteamOS filesystems.

**`settings.json` Bloat from `spotify_folder_tree`:**
- Current capacity: `spotify_folder_tree` is stored directly inside `settings.json` (`DEFAULT_SETTINGS` in `py_modules/common.py:82`).
- Limit: Users with large Spotify libraries and nested playlist folders cause `settings.json` to be rewritten in full on every single setting change (`_save_settings_impl` uses non-atomic `open(..., "w")` + `json.dump`).
- Scaling path: Move `spotify_folder_tree` to `CACHE_DIR` and use atomic write-and-replace (`tempfile` + `os.replace`) in `_save_settings_impl` to prevent `settings.json` corruption on power loss.

## Dependencies at Risk

**External `librespot` Binary & `com.spotify.Client` Flatpak:**
- Risk: `Deckify` depends on a prebuilt `bin/librespot` binary (not tracked in `package.json` or Python manifests) and optionally the `com.spotify.Client` Flatpak (`SPOTIFY_FLATPAK_ID`) plus host tools (`pactl`, `pw-metadata`, `kwin_wayland`, `openssl`, `busctl`). SteamOS updates or Spotify protocol/Flatpak changes can break audio engines without any package-manager version pin.
- Impact: Playback engine startup, lossless PipeWire clock switching, or audio sink routing fails on host updates.
- Migration plan: Document exact supported `librespot` build versions in release workflows (`.github/workflows/release.yml`) and add startup capability checks reporting clear user-facing diagnostics.

## Missing Critical Features

**Atomic Settings Persistence:**
- Problem: `_save_settings_impl` in `py_modules/common.py:234-238` truncates and writes `settings.json` directly (`with open(target_file, "w") as f: json.dump(...)`) without writing to a temporary file and atomically renaming.
- Blocks: Crash-safe persistence of OAuth tokens and game soundtrack profiles on battery loss or hard reboot on Steam Deck.

## Test Coverage Gaps

**Untested Frontend Tab Components & Hooks:**
- What's not tested: Only a subset of `src/` has colocated unit tests (`DeckifyExpandedModal.test.tsx`, `DeckifyOverlay.test.tsx`, `SettingsTab.test.tsx`, `SoundtracksTab.test.tsx`, `QueueTab.test.tsx`, `PlaylistPickerModal.test.tsx`, `TrackActionModal.test.tsx`, `Sidebar.test.tsx`, `InteractiveRow.test.tsx`, `DeckifyImage.test.ts`, `index.test.tsx`, `usePlaybackClock.test.ts`, `listNavigation.test.ts`, `triggerController.test.ts`, `utils.test.ts`). The remaining 13+ files—including `src/steamMenu.tsx`, `src/hooks/usePlaybackStatus.ts`, `src/hooks/useTriggerNavigation.ts`, `src/components/common/imagePipeline.ts`, `src/components/tabs/NowPlayingTab.tsx`, `PlaylistsTab.tsx`, `LikedSongsTab.tsx`, `AlbumsTab.tsx`, `ArtistsTab.tsx`, `PodcastsTab.tsx`, `SearchTab.tsx`, `LyricsTab.tsx`, `RecentTab.tsx`, and `DevicesTab.tsx`—lack dedicated unit tests.
- Files: `src/steamMenu.tsx`, `src/hooks/usePlaybackStatus.ts`, `src/hooks/useTriggerNavigation.ts`, `src/components/common/imagePipeline.ts`, `src/components/tabs/*.tsx`
- Risk: Regressions in Steam Menu React Fiber injection, D-pad/trigger navigation, or tab drill-down behavior go undetected in CI (`pnpm test`).
- Priority: High (especially `src/steamMenu.tsx`, `src/hooks/useTriggerNavigation.ts`, and `src/components/common/imagePipeline.ts`).

**Heavy Mocking in Backend Tests vs. Real Host Integration:**
- What's not tested: Python tests in `tests/test_*.py` run on CI (`ubuntu-latest`) with mocked `subprocess`, `decky`, and `urllib.request`, so real SteamOS `pactl`/`pw-metadata` output variations, `busctl` suspend/resume signals, and live `com.spotify.Client` CDP responses are not exercised end-to-end.
- Files: `tests/test_device_and_engine.py`, `tests/test_volume.py`, `tests/test_plugin_lifecycle.py`
- Risk: Subtle parsing or environment bugs on SteamOS 3.5+ only surface on physical hardware.
- Priority: Medium.

---

*Concerns audit: 2026-11-14*
