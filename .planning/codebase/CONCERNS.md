---
last_mapped_commit: f8defec7206b337ccec032ac6a11b40649e888bd
last_mapped_at: 2026-11-26
---
</Testing Patterns>
<Codebase Concerns>
**Analysis Date:** 2026-11-26

## Tech Debt

**Monolithic Frontend & Backend Files:**
- Issue: Core UI and backend modules have grown past 1,500–2,600 lines, concentrating unrelated responsibilities (state management, RPC wiring, rendering, and event handling) in single files.
- Files: `src/components/DeckifyExpandedModal.tsx` (2,618 lines), `src/components/tabs/SettingsTab.tsx` (2,379 lines), `main.py` (2,606 lines), `py_modules/rpc_library.py` (2,275 lines), `src/index.tsx` (2,253 lines), `py_modules/cdp_bridge.py` (1,828 lines), `py_modules/mpris.py` (1,534 lines), `py_modules/rpc_playback.py` (1,361 lines)
- Impact: High cognitive load, merge conflicts, and 82 `max-lines-per-function` + 30 `complexity` ESLint warnings across `src/`.
- Fix approach: Extract tab-specific hooks/controllers out of `DeckifyExpandedModal.tsx` and `SettingsTab.tsx`, and split `Plugin` RPC methods in `main.py` into focused service adapters.

**Widespread Type Safety Suppressions (`any`) & Lint Warnings:**
- Issue: `pnpm run lint` reports 911 warnings (0 errors): 757 `@typescript-eslint/no-explicit-any`, 82 `max-lines-per-function`, 33 `no-empty`, 30 `complexity`, 4 `react-hooks/exhaustive-deps`, 3 `max-depth`, and 2 `max-params`.
- Files: `src/components/DeckifyExpandedModal.tsx`, `src/index.tsx`, `src/steamMenu.tsx`, `src/utils/listNavigation.ts`, `src/components/DeckifyExpandedModal.test.tsx`
- Impact: Weakens compile-time guarantees at the `@decky/api` RPC boundary and SteamOS global interfaces, masking shape mismatches until runtime.
- Fix approach: Define strict interfaces in `src/types.ts` for all `callable(...)` RPC payloads and `SteamClient` globals, and progressively tighten `@typescript-eslint/no-explicit-any` and `no-empty` rules in `eslint.config.js`.

**Silent Exception Swallowing:**
- Issue: Broad `except Exception:` blocks in Python and empty `catch {}` / `catch (e) {}` blocks in TypeScript and injected CDP JavaScript discard errors without logging or telemetry.
- Files: `main.py`, `py_modules/cdp_bridge.py`, `py_modules/common.py`, `py_modules/device.py`, `src/index.tsx`, `src/steamMenu.tsx`
- Impact: Failures in CDP scraping, audio sink switching, or SteamClient subscriptions fail silently, making field diagnostics difficult.
- Fix approach: Log unexpected exceptions via `decky.logger.debug`/`warning` with context, and narrow `except` clauses to expected exception types.

**Non-Atomic Settings Persistence:**
- Issue: `_save_settings_impl` writes `settings.json` directly via `open(target_file, "w")` rather than writing to a temporary file and atomically replacing via `os.replace()`.
- Files: `py_modules/common.py` (lines 534–538)
- Impact: A mid-write crash, Steam Deck battery loss, or concurrent save can truncate or corrupt `settings.json`, wiping user preferences and OAuth tokens.
- Fix approach: Adopt the atomic `.tmp` + `os.replace()` pattern already used in `py_modules/cdp_bridge.py` (`save_discovery_mixes_cache`).

**Custom Hand-Rolled D-Bus Wire Protocol:**
- Issue: MPRIS2 integration implements raw D-Bus binary marshaling/unmarshaling and socket framing manually rather than using an established D-Bus library.
- Files: `py_modules/mpris.py` (1,534 lines)
- Impact: Increases maintenance burden and risk of subtle protocol edge cases across SteamOS D-Bus updates.
- Fix approach: Keep comprehensive wire-protocol unit tests (`tests/test_mpris.py`) or evaluate a lightweight pure-Python D-Bus dependency if Decky packaging permits.

## Known Bugs

**Continuous Polling of Rate-Limited Spotify Endpoints in Modal Tabs:**
- Issue: `DeckifyExpandedModal.tsx` polls `loadQueue` every 10 seconds while `mode === "queue"` and polls `loadRecent` every 10 seconds (plus 3s and 8s post-track-change timers) while `mode === "recent"`.
- Files: `src/components/DeckifyExpandedModal.tsx` (lines 486–491, 893–911)
- Impact: Violates the architectural constraint against polling heavy Spotify Web API endpoints (`me/player/queue`, `me/player/recently-played`), increasing the risk of HTTP 429 rate limiting during extended browsing.
- Fix approach: Trigger queue/recent refreshes only on explicit tab entry, user pull/refresh, or debounced track-change events rather than recurring `setInterval` loops.

## Security Considerations

**Plaintext OAuth Token Storage with Default File Permissions:**
- Risk: `access_token` and `refresh_token` are persisted in plaintext inside `settings.json` via `_save_settings_impl` without enforcing restrictive file permissions (`0o600`).
- Files: `main.py` (lines 2040–2041, 2171), `py_modules/common.py` (lines 534–538)
- Current mitigation: `_INTERNAL_SETTING_KEYS` in `main.py` (lines 82–87) filters token keys out of frontend settings payloads.
- Recommendations: Restrict `settings.json` (or a dedicated token file) to `0o600` on creation/write and avoid mixing long-lived credentials with general UI preferences.

**OAuth Callback Server Binds All Network Interfaces (`0.0.0.0`):**
- Risk: `start_oauth` binds `asyncio.start_server` on `"0.0.0.0"` port `39281` (`OAUTH_SERVER_PORT`) with a self-signed TLS certificate (`SSL_CERT`, `SSL_KEY`). While required for mobile QR-code OAuth callbacks over LAN, the listener accepts connections from any host on the local network while active.
- Files: `main.py` (lines 1802–1823), `py_modules/common.py` (lines 52–53, 203)
- Current mitigation: Server is stopped via `_stop_oauth_server()` on callback completion, logout, and plugin unload (`main.py` lines 318, 369, 2064).
- Recommendations: Enforce a short auto-expiry timeout on `_oauth_server` if the user abandons QR login, and validate PKCE/state parameters strictly on `/callback`.

**Unencrypted Plain HTTP Lyrics Fallback:**
- Risk: `_fetch_netease_lyrics` sends track title and artist queries over unencrypted `http://music.163.com/api/...` without TLS.
- Files: `py_modules/spotify.py` (lines 501–535)
- Current mitigation: Only non-sensitive track/artist search strings are sent, with a 3.5s timeout.
- Recommendations: Upgrade to `https://` if supported by the endpoint or gate fallback behind an explicit user setting.

## Performance Bottlenecks

**Gamescope Composition Polling Loop (`500ms`):**
- Problem: `useGamescopeNotificationComposition` runs a `setInterval` every `500ms` calling `SteamClient.Window.SetComposition(1, [], 0)` for the entire duration any HUD overlay or banner is visible.
- Files: `src/index.tsx` (lines 1858–1895)
- Cause: Workaround to keep Gamescope notification composition active when Steam overlay state changes.
- Improvement path: Rely on `RegisterForOverlayActivated` and visibility state transitions, increasing the safety interval or removing continuous polling if SteamOS 3.5+ retains composition state.

**In-Memory Base64 Image Caching in CEF:**
- Problem: `imgMemoryCache` (`ImageLruCache` with capacity 200) stores full Base64 data URLs in the Steam GamepadUI renderer heap, while `DeckifyImage` proxies external URLs via `get_image` RPC (`ImageRequestQueue` max 4 concurrent).
- Files: `src/components/common/imagePipeline.ts` (lines 5–48), `py_modules/images.py` (lines 8–120)
- Cause: Steam CEF Content Security Policy blocks direct `https://i.scdn.co/` `<img>` loads, forcing Base64 RPC proxying.
- Improvement path: Monitor renderer memory usage during large playlist/album scrolling and consider evicting oversized data URLs or capping `ImageLruCache` by total byte size rather than item count alone.

**Python Test Suite Execution & Resource Warnings:**
- Problem: Running the full Python `unittest` suite emits `ResourceWarning: unclosed <ssl.SSLSocket ...>` and `ResourceWarning: Implicitly cleaning up <HTTPError ...>` and exhibits slow asyncio runner teardown on Windows when time/sleep mocks interact with `asyncio.runners.Runner`.
- Files: `tests/test_discovery.py`, `tests/test_resilience.py`, `tests/test_volume.py`
- Cause: Mocked `urllib.request.urlopen` / `HTTPError` responses and mocked clocks not always closed or isolated from `loop.time()`.
- Improvement path: Close mock `HTTPError` objects cleanly in `finally`/context managers and avoid patching global wall-clock functions that `asyncio` event loops read internally.

## Fragile Areas

**Spotify Desktop React Fiber Scraping via CDP:**
- Files: `py_modules/cdp_bridge.py` (lines 20–70, `_REGISTRY_PREAMBLE_JS`), `py_modules/engine.py` (lines 282–330)
- Why fragile: Traverses `#main` DOM React Fiber internals (`__reactFiber$` / `__reactContainer$`, `n.memoizedProps?.value`, `reg._map`) up to 5,000 nodes over Chrome DevTools Protocol port `9229`. Any Spotify Flatpak client update that changes React version, container ID, or internal service registry shape can silently break discovery mixes, offline downloads, Jam, and playback speed control.
- Safe modification: Keep fallback paths (`load_discovery_mixes_cache`, `load_offline_downloads_cache`), bound traversal depth, and validate all extracted fields before returning to RPC callers.
- Test coverage: Unit-tested with mocked CDP responses in `tests/test_cdp_bridge.py`, but not verified against live Spotify Flatpak builds in CI.

**SteamOS GamepadUI `MainNavMenuContainer` Monkey-Patching:**
- Files: `src/steamMenu.tsx` (lines 32–100)
- Why fragile: Hooks into `#root` via `findInReactTree(getReactRoot(root), ...)` to wrap `MainNavMenuContainer` render output and splice Deckify entries into Steam's internal navigation array. Any Valve GamepadUI update renaming `navID` or changing menu item props breaks the entry point.
- Safe modification: Guard every property access (`node?.return?.type`, `Array.isArray(items)`), preserve `ownedItem()` cleanup, and avoid throwing inside the wrapped render function.
- Test coverage: `src/steamMenu.tsx` currently has no dedicated unit test file.

**Undocumented `SteamClient` Globals & Controller Input Subscriptions:**
- Files: `src/index.tsx` (lines 594–655, 1851–1895, 2192)
- Why fragile: Relies on undocumented `window.SteamClient.Input.RegisterForControllerInputMessages`, `RegisterForControllerStateChanges`, `SteamClient.System.RegisterForOnResumeFromSuspend`, `SteamClient.Overlay.RegisterForOverlayActivated`, and `SteamClient.GameSessions` with runtime `try/catch` fallbacks.
- Safe modification: Maintain multi-tier fallback registration (`RegisterForControllerInputMessages` -> `RegisterForControllerStateChanges` -> backend `input_watch.py`) and test resume-from-suspend re-subscription paths.
- Test coverage: Covered in `src/index.test.tsx` with mocked `SteamClient` globals.

## Scaling Limits

**Image Disk Cache:**
- Current capacity: Capped at 50 MB (`MAX_IMAGE_CACHE_BYTES = 50 * 1024 * 1024`) in `py_modules/images.py` (lines 9, 52–77), using `stat.st_atime` for LRU eviction and explicit `os.utime()` on cache hits.
- Limit: Heavy library browsing (>1,500–2,000 unique album/playlist covers) triggers frequent cache churn and re-downloads from Spotify CDN.
- Scaling path: Make `MAX_IMAGE_CACHE_BYTES` configurable or store explicit access timestamps in metadata if target filesystems mount with `noatime`.

**Spotify Web API Rate Limits:**
- Current capacity: Single-user OAuth PKCE client (`SPOTIFY_API_BASE`) polling playback state and executing on-demand library/playlist/search requests.
- Limit: Concurrent UI actions plus `10s` polling in `Queue` and `Recent` tabs (`DeckifyExpandedModal.tsx` lines 489, 898) can trigger HTTP 429 `Retry-After` throttling.
- Scaling path: Eliminate background polling in non-playback modal tabs and centralize request deduplication/backoff in `py_modules/spotify.py`.

## Dependencies at Risk

**`librespot` / Official Spotify Flatpak (`com.spotify.Client`):**
- Risk: `librespot` relies on reverse-engineered Spotify Connect protocols, and `com.spotify.Client` Flatpak updates can alter CDP/React internals or audio stream behavior.
- Impact: Headless playback, audio quality switching, or CDP-backed features (offline downloads, Jam, lossless) can break independently of Deckify releases.
- Migration plan: Maintain dual-backend abstraction (`VALID_AUDIO_BACKENDS = ("librespot", "spotify_client")` in `py_modules/common.py`) so users can switch engines when one breaks upstream.

**React 19 Types vs Decky Loader Runtime:**
- Risk: `package.json` pins `@types/react` `19.2.14` and `@types/react-dom` `19.2.3` while `pnpm.peerDependencyRules.ignoreMissing` suppresses missing `react`/`react-dom` peer dependencies (provided globally by Decky Loader).
- Impact: Type definitions may diverge from the exact React runtime version shipped by SteamOS GamepadUI.
- Migration plan: Validate built bundles (`dist/index.js`) on target SteamOS Decky Loader versions before release.

## Missing Critical Features

**Automated CI/CD Pipeline:**
- Problem: No `.github/workflows/` CI configuration was detected in the repository; quality gates rely on local Husky pre-commit `lint-staged` (`eslint`) and manual `pnpm test` / `unittest` runs.
- Blocks: Automated regression verification for TypeScript typechecking, Vitest, Python `unittest`, and Rollup production builds on pull requests.

## Test Coverage Gaps

**Untested Frontend Modules & Tab Components:**
- What's not tested: 17 non-test TypeScript files in `src/` lack corresponding `*.test.ts(x)` files: `src/steamMenu.tsx`, `src/bannerBus.ts`, `src/utils/themeBus.ts`, `src/hooks/useGrabMoveOrder.ts`, `src/hooks/usePlaybackStatus.ts`, `src/hooks/useTriggerNavigation.ts`, `src/components/common/CollectionActionModal.tsx`, `src/components/common/EqBandFaders.tsx`, `src/components/common/OfflineStatusUI.tsx`, `src/components/common/TrackRowItem.tsx`, `src/components/common/imagePipeline.ts`, `src/components/tabs/AlbumsTab.tsx`, `src/components/tabs/ArtistsTab.tsx`, `src/components/tabs/LikedSongsTab.tsx`, `src/components/tabs/RecentTab.tsx`, `src/components/tabs/soundtrackUtils.ts`, and `src/types.ts`.
- Files: `src/steamMenu.tsx`, `src/hooks/usePlaybackStatus.ts`, `src/hooks/useTriggerNavigation.ts`, `src/components/common/imagePipeline.ts`
- Risk: Regressions in Steam menu injection, playback status polling hooks, trigger navigation, or image request queueing can go undetected by `vitest run` (currently 30 files, 382 tests).
- Priority: High for `src/steamMenu.tsx`, `src/hooks/usePlaybackStatus.ts`, and `src/components/common/imagePipeline.ts`; Medium for individual library tab views.

---

*Concerns audit: 2026-11-26*
