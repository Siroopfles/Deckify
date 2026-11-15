# Phase 12: Resolve Open Todos & Polish - Research

**Researched:** 2026-11-15
**Domain:** Steam Deck Decky Loader Plugin (TypeScript/React 19 + Python 3.11+ RPC + SteamOS GamepadUI / PipeWire)
**Confidence:** HIGH

## Summary

Phase 12 resolves all 20 pending todos in `.planning/todos/pending/` and archives the 3 diagnosed debug sessions in `.planning/debug/`. Every single one of the 23 items was audited directly against the current codebase, git history, and test suites (`145` Vitest tests passing, `453` Python unittest tests passing, `tsc --noEmit` 0 errors, `eslint` 0 errors).

The audit reveals three distinct buckets:
1. **Already Resolved / Implemented (8 items):** All 3 debug sessions (`detail-view-missing-mixing-button`, `phase10-overlay-lyrics-controls`, `qam-pinned-pills-no-selection-highlight`) and 5 pending todos (`ingame-hud-autohide-duration-slider`, `ingame-hud-visible-inside-modal`, `lyrics-clickable-source-selector`, `modal-controller-actions-broken`, `qam-bind-button-focus-highlight`) are 100% implemented and covered by tests; they only need verification and archival to `.planning/debug/resolved/` and `.planning/todos/done/`.
2. **Partially Implemented (2 items):** `settings-time-options-to-sliders` (HUD autohide duration, lyrics offset, and trigger seek step are sliders, while ducking fade-down/fade-up/voice-hold durations in `SettingsTab.tsx:507-604` remain preset buttons despite `main.py:597-601` already supporting float `0.5–3.0`s) and `ingame-hud-autohide-ignores-setting` (`autoHide === false` works during playback via `DeckifyOverlay.tsx:90-94`, but pause-grace hiding or track-change `isPlaying` blips should be verified/hardened).
3. **Open — Needs Implementation / Fix (13 items):** Concrete root causes were pinpointed in `py_modules/rpc_library.py`, `py_modules/rpc_playback.py`, `py_modules/vdf_parser.py`, `py_modules/common.py`, `main.py`, `src/index.tsx`, `src/components/DeckifyExpandedModal.tsx`, `src/components/common/Sidebar.tsx`, `src/components/tabs/PlaylistsTab.tsx`, `src/components/tabs/NowPlayingTab.tsx`, `src/components/tabs/PodcastsTab.tsx`, and `src/components/tabs/SettingsTab.tsx`.

**Primary recommendation:** Group Phase 12 into 4 clean execution waves/plans: (1) Archive verified debug/done items, (2) Playlist & Playback reliability fixes, (3) Sidebar, Now Playing, Podcasts & Recently Played UX fixes, and (4) Notifications, Overlay, Ducking Sliders & Non-Steam Grid Covers.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Verify each of the 3 debug sessions (`detail-view-missing-mixing-button`, `qam-pinned-pills-no-selection-highlight`, `phase10-overlay-lyrics-controls`) and the ~6 already-implemented todos (`ingame-hud-autohide-duration-slider`, `ingame-hud-visible-inside-modal`, `lyrics-clickable-source-selector`, `modal-controller-actions-broken`, `qam-bind-button-focus-highlight`, `settings-time-options-to-sliders`) against current code and tests; move confirmed-done items to `.planning/debug/resolved/` and `.planning/todos/done/`.
- **D-02:** Clicking a track inside a playlist (`playlist-track-click-stops-after-song`) must pass the playlist `context_uri` + track offset (respecting current shuffle state) so playback continues through the playlist rather than stopping after one song.
- **D-03:** Investigate and fix followed playlist track loading (`followed-playlist-tracks-not-loading`), Enable Mix `playlist_id` passing (`enable-mix-missing-playlist-id`), and playlist Play button reliability (`playlist-play-button-unreliable`) end-to-end across frontend and backend (`PlaylistsTab.tsx`, `py_modules/rpc_library.py`, `py_modules/rpc_playback.py`).
- **D-04:** Make the sidebar Now Playing card focusable with `Y` (TrackActionModal / Add to Playlist) and `A` / Like support (`sidebar-now-playing-like-and-add-to-playlist`), AND add a quick Add to Playlist button in `NowPlayingTab.tsx` (`now-playing-quick-add-to-playlist`).
- **D-05:** Fix `Back to Steam` focus reachability and escapability in the modal sidebar (`sidebar-back-to-steam-navigation`), render full metadata for all 20 saved podcast episodes (`podcasts-saved-episodes-metadata`), and refresh Recently Played when the active track changes (`recently-played-realtime-update`).
- **D-06:** Add a configurable track-change notification sound toggle (`track-notification-sound-toggle`) passed via `sound` to `toaster.toast`, fix the album cover sizing/crop (`48x48`, `objectFit: cover`) in the track-change notification (`track-notification-album-cover-crop`), and ensure `autoHide === false` keeps the In-Game HUD visible (`ingame-hud-autohide-ignores-setting`).
- **D-07:** Add a custom percentage `SliderField` alongside the existing presets in `SettingsTab.tsx` for smooth ducking attenuation (`smooth-ducking-attenuation-customizable`), and resolve local Steam grid artwork (`userdata/<id>/config/grid/<appId>p.*`) via the base64 image proxy for Non-Steam games in `SoundtracksTab` (`non-steam-local-grid-covers`).

### the agent's Discretion
None — all 20 pending todos and 3 debug sessions are explicitly scoped by D-01 through D-07.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within Phase 12 todo/polish scope.
</user_constraints>

## Project Constraints (from GEMINI.md)

- **Steam CEF Content Security Policy:** Steam GamepadUI blocks direct external image URLs (`https://i.scdn.co/`, local `file://` paths). All artwork—including toast notification covers and Non-Steam local grid covers—must be served as `data:image/...;base64,...` URIs via `py_modules/images.py` / `DeckifyImage` (`[VERIFIED: GEMINI.md]`).
- **SteamOS GamepadUI Navigation:** Horizontal button groups MUST use `flow-children="horizontal"` (`[VERIFIED: GEMINI.md]`). Focusable custom elements must use `@decky/ui` `Focusable` / `InteractiveRow` with `focusHalo` and never trap D-pad focus.
- **Public Settings Allowlist:** Any new setting key (e.g., `toast_sound_enabled`) MUST be added to `DEFAULT_SETTINGS` in `py_modules/common.py`, validated in `main.py:set_setting()`, and included in `public_keys` in `main.py:get_status()` (`[VERIFIED: main.py:494-517]`).
- **Rate-Limit Awareness:** Never poll heavy Spotify endpoints (like `me/player/recently-played`) continuously; refresh only on discrete track-change events (`[VERIFIED: GEMINI.md]`).
- **RPC Error Handling:** Backend RPCs must catch exceptions and return `{ "ok": False, "error": str(e) }`; frontend callers must check `res?.ok` rather than assuming success (`[VERIFIED: GEMINI.md]`).

---

## Complete Audit of All 23 Items (3 Debug Sessions + 20 Pending Todos)

### Bucket 1: Already Resolved / Implemented (Verify & Archive)

| Item | Type | Status | Codebase Evidence |
|------|------|--------|-------------------|
| `detail-view-missing-mixing-button.md` | Debug | **Resolved** | `PlaylistsTab.tsx:325-404` hardened flex header (`minWidth: 0`, `overflow: "hidden"`, `flexShrink: 0` on buttons); `Enable Mix` intentionally gated on `audioBackend === "spotify_client"` (`PlaylistsTab.tsx:388`). `[VERIFIED: src/components/tabs/PlaylistsTab.tsx:325-404]` |
| `phase10-overlay-lyrics-controls.md` | Debug | **Resolved** | `main.py:494-509` `public_keys` now includes `overlay_lyrics_enabled`, `overlay_lyrics_offset_ms`, `overlay_autohide_duration_s`, `trigger_*`, `show_controller_hints`; `src/index.tsx:888` merges `s.settings`. `[VERIFIED: main.py:494-509]` |
| `qam-pinned-pills-no-selection-highlight.md` | Debug | **Resolved** | `src/index.tsx:105-150,757` replaced `<DialogButton>` with focus-tracked `PinnedPill` using `Focusable` + `focusHalo(focused)`. `[VERIFIED: src/index.tsx:105-115]` |
| `ingame-hud-autohide-duration-slider.md` | Todo | **Implemented** | `SettingsTab.tsx:705-716` renders `SliderField` (3–15s); `common.py:107` & `main.py:503,592-596` persist and validate `overlay_autohide_duration_s`. `[VERIFIED: src/components/tabs/SettingsTab.tsx:705-716]` |
| `ingame-hud-visible-inside-modal.md` | Todo | **Implemented** | `src/index.tsx:865-878,983` tracks `modalOpen` via `modalOpenListeners` and passes `visible={Boolean(settings.overlay_enabled) && !modalOpen}`. `[VERIFIED: src/index.tsx:983]` |
| `lyrics-clickable-source-selector.md` | Todo | **Implemented** | `LyricsTab.tsx:7-13,66-90` renders clickable `LYRICS_SOURCES` pills wired to `onSelectLyricsSource` (`DeckifyExpandedModal.tsx:369-376,1030`). `[VERIFIED: src/components/tabs/LyricsTab.tsx:66-90]` |
| `modal-controller-actions-broken.md` | Todo | **Implemented** | `DeckifyExpandedModal.tsx:720-871` wires `useTriggerNavigation` (`L2`/`R2`/`L1`/`R1`/`Y`/`X`), `InteractiveRow` exposes `data-deckify-focused`, and `TrackActionModal` manages focus transfer/restore. `[VERIFIED: src/components/DeckifyExpandedModal.tsx:827-871]` |
| `qam-bind-button-focus-highlight.md` | Todo | **Implemented** | `src/index.tsx:464` uses `<ButtonItem onClick={handleQuickBind}>` with native SteamOS focus highlight. `[VERIFIED: src/index.tsx:464]` |

### Bucket 2: Open / Partially Implemented (Needs Code Changes)

| Todo | Root Cause | Target Files & Lines |
|------|------------|----------------------|
| `enable-mix-missing-playlist-id.md` | `DeckifyExpandedModal.tsx:400` passes `activePlaylist.uri` (can be `undefined` when opened from folder/search); `rpc_library.py:298-299` returns `Missing playlist_id` if empty. | `src/components/DeckifyExpandedModal.tsx:400`, `src/components/tabs/PlaylistsTab.tsx`, `py_modules/rpc_library.py:293-300` |
| `followed-playlist-tracks-not-loading.md` | `rpc_library.py:84-100` tries `playlists/{pid}/items` first, falls back to `playlists/{pid}/tracks`, then `playlists/{pid}`—but line 107 only reads `data.get("items")`, missing `data.get("tracks", {}).get("items")` when `/playlists/{pid}` is returned! | `py_modules/rpc_library.py:59-150` |
| `playlist-play-button-unreliable.md` | (1) `PlaylistsTab.tsx:349` passes `activePlaylist.uri` without `id` fallback; (2) `DeckifyExpandedModal.tsx:461-471` ignores `res.ok` and always toasts `"Playback started"`; (3) `rpc_playback.py:326-375` (`play_tracks`) does not wake stopped `librespot` (unlike `quick_play_pinned`). | `src/components/tabs/PlaylistsTab.tsx:349`, `src/components/DeckifyExpandedModal.tsx:461-471`, `py_modules/rpc_playback.py:326-375` |
| `playlist-track-click-stops-after-song.md` | `PlaylistsTab.tsx:410-420` omits `allTracks` on `TrackRowItem` and relies on `activePlaylist.uri`; if `activePlaylist.uri` is missing/falsy, `handlePlayTrack` falls back to `body["uris"] = [uri]` (single track!). Also `play_tracks` should pass `offset: {"position": position}` or `{"uri": offset_uri}` with `context_uri`. | `src/components/tabs/PlaylistsTab.tsx:410-420`, `src/components/DeckifyExpandedModal.tsx:461-471`, `py_modules/rpc_playback.py:342-355` |
| `sidebar-back-to-steam-navigation.md` | `Sidebar.tsx:113-188` places `Back to Steam (B)` in a separate `<div style={{ flexShrink: 0 }}>` below a scrollable `<div style={{ overflowY: "auto" }}><Focusable>` and a non-focusable Now Playing `<div>`, causing spatial nav to miss or trap focus. | `src/components/common/Sidebar.tsx:89-189` |
| `sidebar-now-playing-like-and-add-to-playlist.md` | `Sidebar.tsx:138-164` renders Now Playing as a plain `<div>` (not focusable). Needs `InteractiveRow`/`Focusable` calling `onFocusTrack(track)` + `A`/`Y`/`X` support, and `DeckifyExpandedModal.tsx:834,854` must allow `Y`/`X` when `focusedTrackRef.current` is set even in `engine`/`devices` mode. | `src/components/common/Sidebar.tsx:138-164`, `src/components/DeckifyExpandedModal.tsx:834-867,982-987` |
| `now-playing-quick-add-to-playlist.md` | `NowPlayingTab.tsx:229-267` has Like (`RoundBtn`) but no Add to Playlist button. Add a `RoundBtn` calling `onOpenActions(track)` / `AddToPlaylistModal`. | `src/components/tabs/NowPlayingTab.tsx:21-33,229-267`, `src/components/DeckifyExpandedModal.tsx:1008-1022` |
| `podcasts-saved-episodes-metadata.md` | `rpc_library.py:497-513` assumes `item.get("episode")` & `ep.get("show")`; `PodcastsTab.tsx:72-102` lacks `flexShrink: 0` on `InteractiveRow`/`DeckifyImage` and `minWidth: 0` on the text container, causing rows to collapse/clip. | `py_modules/rpc_library.py:485-518`, `src/components/tabs/PodcastsTab.tsx:65-106` |
| `recently-played-realtime-update.md` | `DeckifyExpandedModal.tsx:261-267` only calls `loadRecent()` on `mode === "recent"` entry, never when `track?.track_id` changes while viewing `RecentTab`. | `src/components/DeckifyExpandedModal.tsx:261-275` |
| `track-notification-sound-toggle.md` | `src/index.tsx:1095` hardcodes `sound: 0 as any` with no setting. Need `toast_sound_enabled` in `common.py`, `main.py` (`public_keys` + `set_setting`), `types.ts`, `SettingsTab.tsx`, and `toaster.toast` (`playSound` + `sound`). | `py_modules/common.py:99`, `main.py:499,585`, `src/types.ts`, `src/components/tabs/SettingsTab.tsx`, `src/index.tsx:1084-1104` |
| `track-notification-album-cover-crop.md` | `src/index.tsx:1097-1099` passes raw `https://i.scdn.co/...` `artwork` (blocked by Steam CEF CSP!) at `width={28} height={28}` (sits in top-left corner of 48x48 toast slot). Must proxy via `backendGetImageBase64(artwork)` and render `48x48` with `objectFit: "cover"`. | `src/index.tsx:1084-1104` |
| `ingame-hud-autohide-ignores-setting.md` | **Partially Fixed** in Phase 10 (`69db064` + `8560f06`). `autoHide === false` stays visible during playback (`DeckifyOverlay.tsx:90-94`), but `pauseTimerRef` (`DeckifyOverlay.tsx:97-101`) still hides after 3.5s if `isPlaying` briefly flickers `false` on track change. | `src/components/DeckifyOverlay.tsx:69-108` |
| `smooth-ducking-attenuation-customizable.md` | Backend already supports `ducking_proportional_pct` (10–90%) and `auto_ducking_volume` (0–100%) in `common.py`, `main.py`, `volume.py`. `SettingsTab.tsx:477-504` only shows mode preset buttons with no `SliderField`. | `src/components/tabs/SettingsTab.tsx:477-504` |
| `settings-time-options-to-sliders.md` | **Partially Implemented**: `Auto-Hide Duration`, `Lyrics Latency Offset`, and `Seek Step` are `SliderField`s, but `Fade Down Speed`, `Fade Up Speed`, and `Silence Hold Delay` (`SettingsTab.tsx:507-604`) are still preset buttons despite `main.py:597-601` already validating `0.5–3.0` floats. | `src/components/tabs/SettingsTab.tsx:507-604` |
| `non-steam-local-grid-covers.md` | `py_modules/vdf_parser.py:207` sets `"icon_url": ""` for Non-Steam games. Must check `userdata/<id>/config/grid/<app_id>p.*` / `<app_id>.*` / `icon` and return a `data:image/...;base64,...` URI (bypassing Steam CEF CSP). | `py_modules/vdf_parser.py:178-209`, `py_modules/images.py` |

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Playlist/Episode Web API fetching & fallback parsing | API / Backend (`py_modules/rpc_library.py`) | Browser / Client (`PlaylistsTab`, `PodcastsTab`) | Backend owns Spotify OAuth token, HTTP 429 circuit breaker, and response normalization. |
| Playback start, engine auto-wake & context/offset | API / Backend (`py_modules/rpc_playback.py`) | Browser / Client (`DeckifyExpandedModal.tsx`) | Backend owns `librespot` lifecycle and `me/player/play` body construction. |
| Local Steam grid cover discovery & base64 encoding | API / Backend (`py_modules/vdf_parser.py`, `images.py`) | Browser / Client (`DeckifyImage`) | Filesystem access and Steam CEF CSP bypass (`data:` URI) must happen in Python. |
| Sidebar focus flow, Now Playing actions, Ducking/Toast UI | Browser / Client (`Sidebar.tsx`, `NowPlayingTab.tsx`, `SettingsTab.tsx`, `src/index.tsx`) | API / Backend (`main.py` settings allowlist) | Spatial navigation (`flow-children`), `toaster.toast`, and `SliderField` live in React; settings persistence/allowlist lives in `main.py`. |

---

## Standard Stack

### Core (Existing Project Stack — No New Packages Required)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.x | Decky plugin UI components | Provided by Decky Loader runtime (`[VERIFIED: package.json]`) |
| `@decky/ui` | 4.11.1 | `Focusable`, `SliderField`, `ToggleField`, `ButtonItem`, `ModalRoot` | Official SteamOS GamepadUI primitives (`[VERIFIED: package.json]`) |
| `@decky/api` | 1.1.3 | `callable`, `toaster.toast` (`ToastData.sound`, `ToastData.playSound`), `addEventListener` | Official Decky RPC & toast bridge (`[VERIFIED: node_modules/@decky/api/dist/types.d.ts:15-37]`) |
| `react-icons` | 5.5.0 | `FaPlus`, `FaHeart`, `FaSpotify`, `FaGamepad`, etc. | Existing icon set (`[VERIFIED: package.json]`) |
| Python stdlib | 3.11+ / 3.14 | `base64`, `mimetypes`, `os`, `glob`, `urllib` | Zero external Python dependencies on SteamOS (`[VERIFIED: GEMINI.md]`) |

**Installation:** None — Phase 12 requires zero new npm or PyPI packages.

---

## Architecture Patterns

### Pattern 1: Playlist Context Playback with Shuffle & Offset (`D-02`, `D-03`)
**What:** Always pass a normalized `context_uri` (`spotify:playlist:<id>`) plus `offset_uri` (or `position` fallback) when clicking a track in a playlist, and wake `librespot` if stopped.
**Example:**
```typescript
// PlaylistsTab.tsx — normalize URI even if playlist came from folder/search without .uri
const playlistUri = activePlaylist.uri || (activePlaylist.id ? `spotify:playlist:${activePlaylist.id}` : "");
// Pass allTracks={playlistTracks} and contextUri={playlistUri} to TrackRowItem
```
```python
# py_modules/rpc_playback.py — play_tracks
if context_uri:
    body["context_uri"] = context_uri
    if offset_uri:
        body["offset"] = {"uri": offset_uri}
    elif position > 0:
        body["offset"] = {"position": position}
    plugin._context_uri = context_uri
```

### Pattern 2: Followed Playlist Track Loading Fallback (`D-03`)
**What:** Spotify's `playlists/{pid}/tracks` is the standard endpoint; when falling back to `playlists/{pid}` (full playlist object), tracks live at `data["tracks"]["items"]`, not `data["items"]`.
**Example:**
```python
# py_modules/rpc_library.py:107
items_obj = data.get("items") if isinstance(data, dict) and "items" in data else (
    data.get("tracks") if isinstance(data, dict) else []
)
```

### Pattern 3: Non-Steam Local Grid Cover Base64 Proxy (`D-07`)
**What:** In `py_modules/vdf_parser.py:_scan_non_steam_games()`, check `os.path.join(os.path.dirname(path), "grid")` for `<app_id>p.{png,jpg,jpeg,webp}` and `<app_id>.{png,jpg,jpeg,webp}` (and `lower.get("icon")` if it is an existing image file), read up to `MAX_IMAGE_BYTES`, and encode as `data:<mime>;base64,<b64>`. `DeckifyImage` passes `data:` URIs straight through without extra RPC calls (`[VERIFIED: src/components/common/DeckifyImage.tsx:59,75]`).

### Pattern 4: Track Change Toast Cover + Sound (`D-06`)
**What:** Convert `meta.artwork_url` via `backendGetImageBase64` when it is an `https://` URL, render `48x48` with `objectFit: "cover"`, and pass `playSound` + `sound` from `toast_sound_enabled`.
**Example:**
```tsx
// src/index.tsx
const soundEnabled = Boolean(curStatus?.settings?.toast_sound_enabled);
let logoSrc = artwork && artwork.startsWith("data:") ? artwork : "";
if (artwork && !logoSrc) {
  const imgRes = await backendGetImageBase64(artwork).catch(() => null);
  if (imgRes?.ok && imgRes.data_url) logoSrc = imgRes.data_url;
}
toaster.toast({
  title: meta.name,
  body: meta.artist ? `${meta.artist}` : "Deckify",
  duration: 3500,
  sound: soundEnabled ? 1 : 0,
  playSound: soundEnabled,
  onClick: openExpandedView,
  logo: logoSrc ? (
    <img src={logoSrc} width={48} height={48} style={{ width: 48, height: 48, borderRadius: 6, objectFit: "cover", display: "block" }} />
  ) : (
    <FaSpotify color="#1db954" size={32} />
  ),
} as any);
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Add to Playlist modal | Custom playlist picker in `NowPlayingTab` or `Sidebar` | Existing `TrackActionModal` + `AddToPlaylistModal` (`DeckifyExpandedModal.tsx:1209-1255`) | Already handles focus transfer/restore, `Y`/`B` close, and `backendAddTrackToPlaylist`. |
| Custom range slider | Custom D-pad arrow-key div | `@decky/ui` `SliderField` (`SettingsTab.tsx:705-730`) | Handles GamepadUI left/right increment, `showValue`, and native focus ring. |
| External image fetching in CEF | Direct `<img src="https://...">` in `toaster.toast` | `backendGetImageBase64` (`py_modules/images.py`) | Steam CEF CSP blocks `i.scdn.co` URLs unless base64-proxied. |

---

## Common Pitfalls

### Pitfall 1: Missing `public_keys` Entry in `main.py:get_status()`
**What goes wrong:** New settings (like `toast_sound_enabled`) save to `settings.json` but revert in UI on the next 4s `get_status()` poll.
**How to avoid:** Add `toast_sound_enabled` to `DEFAULT_SETTINGS` (`py_modules/common.py`), `set_setting` (`main.py:585`), AND `public_keys` (`main.py:494-509`).

### Pitfall 2: `TrackRowItem` Fallback to Single-Track Playback
**What goes wrong:** Clicking a track in a playlist plays only that single song and stops.
**Why it happens:** If `contextUri` is falsy AND `allTracks` is omitted, `handlePlayTrack` sends `{"uris": [track.uri]}` (a 1-track queue).
**How to avoid:** Always normalize `activePlaylist.uri || \`spotify:playlist:${activePlaylist.id}\`` AND pass `allTracks={playlistTracks}` to `TrackRowItem`.

### Pitfall 3: Sidebar Spatial Navigation Boundary Trap
**What goes wrong:** D-pad Down from `Settings` skips `Back to Steam (B)` or D-pad Up from `Back to Steam (B)` cannot re-enter the scrollable sidebar list.
**How to avoid:** Keep `SidebarBtn`s, the focusable Now Playing card, and `Back to Steam (B)` in a clean vertical `Focusable` flow without trapping focus inside an isolated footer `div`, and ensure `InteractiveRow` / `SidebarBtn` heights don't collapse (`flexShrink: 0`).

### Pitfall 4: `DeckifyExpandedModal` `Y`/`X` Blocked in `engine`/`devices` Mode
**What goes wrong:** Focusing the Sidebar Now Playing card while viewing Settings (`mode === "engine"`) and pressing `Y` or `X` does nothing because `DeckifyExpandedModal.tsx:834,854` skips `engine` and `devices` modes.
**How to avoid:** Allow `Y` and `X` when `focusedTrackRef.current` is non-null regardless of `mode`.

---

## Validation Architecture

### Test Framework & Commands
| Check | Command | Baseline (Verified 2026-11-15) |
|-------|---------|--------------------------------|
| TypeScript check | `pnpm run typecheck` | Pass (0 errors) |
| ESLint | `pnpm run lint` | Pass (0 errors, 559 warnings) |
| Frontend tests | `npx vitest run` | 16 files, 145 tests passed |
| Backend tests | `py -3 -m unittest discover -s tests -p "test_*.py"` | 453 tests passed |
| Production bundle | `pnpm run build` | Must pass before phase completion |

### Phase Requirements / Todo → Test Map
| Todo / Fix | Test Type | Target Test File | What to Assert |
|------------|-----------|------------------|----------------|
| `enable-mix-missing-playlist-id` | unit | `tests/test_py_modules.py` + `DeckifyExpandedModal.test.tsx` | `set_native_playlist_mix` accepts `spotify:playlist:<id>` and raw `<id>`; modal falls back to `activePlaylist.id` when `uri` is absent. |
| `followed-playlist-tracks-not-loading` | unit | `tests/test_py_modules.py` | `get_playlist_tracks` parses `data["tracks"]["items"]` when falling back to `playlists/{pid}` for followed playlists. |
| `playlist-play-button-unreliable` & `playlist-track-click-stops-after-song` | unit | `tests/test_py_modules.py` + `DeckifyExpandedModal.test.tsx` | `play_tracks` wakes stopped `librespot` / passes `context_uri` + `offset`; `PlaylistsTab` passes `allTracks` & normalized `contextUri`; `handlePlayTrack` surfaces errors. |
| `sidebar-back-to-steam-navigation` & `sidebar-now-playing-like-and-add-to-playlist` | unit | `src/components/common/Sidebar.test.tsx` + `DeckifyExpandedModal.test.tsx` | Sidebar Now Playing card is focusable, triggers `onFocusTrack`, `A`/`Y`/`X` work even when `mode === "engine"`; `Back to Steam (B)` is reachable/escapable. |
| `now-playing-quick-add-to-playlist` | unit | `src/components/DeckifyExpandedModal.test.tsx` | `NowPlayingTab` renders quick Add to Playlist button and opens `TrackActionModal`. |
| `podcasts-saved-episodes-metadata` | unit | `tests/test_py_modules.py` + `DeckifyExpandedModal.test.tsx` | `get_saved_episodes` handles missing `show`/direct `episode` items; `PodcastsTab` renders all 20 episodes with `flexShrink: 0` & `minWidth: 0`. |
| `recently-played-realtime-update` | unit | `src/components/DeckifyExpandedModal.test.tsx` | Changing `track_id` while `mode === "recent"` triggers `backendGetRecentlyPlayed`. |
| `track-notification-sound-toggle` & `track-notification-album-cover-crop` | unit | `src/index.test.tsx` + `src/components/tabs/SettingsTab.test.tsx` + `tests/test_py_modules.py` | `toast_sound_enabled` in `public_keys`; `toaster.toast` receives `playSound`/`sound`, proxied base64 logo, and `48x48` `objectFit: "cover"`. |
| `ingame-hud-autohide-ignores-setting` | unit | `src/components/DeckifyOverlay.test.tsx` | `autoHide === false` stays visible across track transitions and does not hide unexpectedly. |
| `smooth-ducking-attenuation-customizable` & `settings-time-options-to-sliders` | unit | `src/components/tabs/SettingsTab.test.tsx` | `SliderField`s for `ducking_proportional_pct` (10–90), `auto_ducking_volume`, and ducking fade/hold durations persist via `backendSetSetting`. |
| `non-steam-local-grid-covers` | unit | `tests/test_vdf_parser.py` | `_scan_non_steam_games` resolves `<app_id>p.png` / `<app_id>.jpg` from `userdata/*/config/grid/` as `data:image/...;base64,...`. |

### Sampling Rate
- **Per task commit:** `pnpm run typecheck && npx vitest run` (for TS tasks) or `py -3 -m unittest discover -s tests -p "test_*.py"` (for Python tasks)
- **Phase gate:** Full suite (`pnpm run typecheck && pnpm run lint && npx vitest run && py -3 -m unittest discover -s tests -p "test_*.py" && pnpm run build`) green before `/gsd-verify-work`

### Wave 0 Gaps
None — Vitest (`src/**/*.test.ts*`) and Python `unittest` (`tests/test_*.py`) infrastructure is already in place and passing.

---

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | Validate `toast_sound_enabled` as `bool` in `main.py:set_setting()`; bound local grid image reads to `MAX_IMAGE_BYTES` (`5 MiB`) and allowed extensions (`.png`, `.jpg`, `.jpeg`, `.webp`) under `<steam_root>/userdata/*/config/grid/` to prevent path traversal or memory exhaustion. |
| V6 Cryptography / CSP | yes | Serve all remote & local cover art as `data:image/...;base64,...` URIs; never bypass Steam CEF CSP with `file://` or unproxied `https://` URLs. |

---

## Sources

### Primary (HIGH confidence)
- Codebase direct reads: `main.py`, `py_modules/common.py`, `py_modules/rpc_library.py`, `py_modules/rpc_playback.py`, `py_modules/vdf_parser.py`, `py_modules/images.py`, `py_modules/volume.py`, `src/index.tsx`, `src/components/DeckifyExpandedModal.tsx`, `src/components/DeckifyOverlay.tsx`, `src/components/common/Sidebar.tsx`, `src/components/common/InteractiveRow.tsx`, `src/components/common/TrackRowItem.tsx`, `src/components/common/DeckifyImage.tsx`, `src/components/tabs/PlaylistsTab.tsx`, `src/components/tabs/NowPlayingTab.tsx`, `src/components/tabs/PodcastsTab.tsx`, `src/components/tabs/LyricsTab.tsx`, `src/components/tabs/SettingsTab.tsx`, `node_modules/@decky/api/dist/types.d.ts`
- Test runs executed in session: `pnpm run typecheck`, `pnpm run lint`, `npx vitest run`, `py -3 -m unittest discover -s tests -p "test_*.py"`

## Metadata

**Confidence breakdown:**
- Audit of 23 items: HIGH — every todo and debug file was read and cross-checked against exact source lines.
- Root causes & fixes: HIGH — all target files, RPC signatures, and `@decky/api` types were directly inspected.
- Validation Architecture: HIGH — baseline commands all ran and passed in this session.

**Research date:** 2026-11-15
**Valid until:** 2026-12-15 (stable internal codebase)
