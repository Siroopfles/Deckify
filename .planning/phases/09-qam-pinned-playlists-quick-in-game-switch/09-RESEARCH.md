# Phase 9: QAM Pinned Playlists & Quick In-Game Switch - Research

**Researched:** 2026-11-14
**Domain:** SteamOS GamepadUI Quick Access Menu (Decky Loader `@decky/ui`), Python Backend RPC & Engine Wake, Settings Persistence, Expanded Modal Context Actions
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Reorganize the QAM mini-player (`src/index.tsx`) so compact Now Playing + Transport Controls + Pinned Playlist Pills sit at the top for immediate 1-click D-pad reach, and secondary actions (volume, device selector, settings, Open Library, quick actions) are neatly grouped or collapsible below.
- **D-02:** Place the Pinned Playlist Pills directly below the Transport Controls (Play/Pause/Prev/Next).
- **D-03:** Render each pinned pill as a compact horizontal pill with a square thumbnail (`20x20px`) + truncated single-line name (`text-overflow: ellipsis`).
- **D-04:** Lay out the pills in a single horizontal scrollable row using `<Focusable flow-children="horizontal">` so D-pad Left/Right moves cleanly across the pills.
- **D-05:** Proxy all pinned item cover art through the backend base64 image cache (`py_modules/images.py`) to comply with Steam CEF CSP and avoid UI hitching.
- **D-06:** Maximum of **4** pinned items (`MAX_PINNED_PLAYLISTS = 4`).
- **D-07:** Support pinning Playlists, Albums, and Liked Songs (any playable Spotify context/collection with a URI/type).
- **D-08:** Provide **both** pinning entry points in the Expanded Modal:
  - An `ActionMenu` / `TrackActionModal` (`Y` menu) option (`Pin to QAM` / `Unpin from QAM`) on playable playlist/album/collection rows, plus a visible pin badge/icon on pinned items.
  - A direct Pin/Unpin toggle icon button in the detail-view header of a playlist or album.
- **D-09:** When the user tries to pin a 5th item while 4 items are already pinned, do NOT auto-evict existing pins — show a clear toast notification (e.g., `"Max 4 pinned items — unpin one first"`) and indicate the limit state in the `Y` menu.
- **D-10:** Clicking a pinned pill in QAM immediately starts playback of that context using the user's current shuffle state (do not force shuffle ON), applies an optimistic UI status update, highlights the currently playing pinned pill with a Spotify green accent, and auto-wakes the local `librespot` / `spotifyd` engine if inactive/sleeping so playback starts within 2 seconds.
- **D-11:** When 0 items are pinned, hide the pinned pills section completely in QAM (no extra empty-state noise).
- **D-12:** Maintain pinned items in pin order (with unpinning available from both the `Y` menu and the detail-view header).
- **Folded Todo:** **Add visible controller focus highlight to QAM Bind current music button** (`2026-11-14-qam-bind-button-focus-highlight.md`): Fix the QAM `"Bind current music to game"` button in `src/index.tsx` so SteamOS GamepadUI's controller focus highlight is clearly visible (use `@decky/ui`'s `ButtonItem` or remove the overriding `borderColor` / add an explicit focus ring style).

### the agent's Discretion
- Exact collapsible/grouped QAM section structure for secondary controls (volume, device, settings, soundtrack quick-bind) as long as Now Playing, Transport, and Pinned Pills stay cleanly at the top and all existing QAM controls remain accessible.
- Exact storage schema under `~/.config/deckify/settings.json` (`py_modules/common.py`) for pinned item metadata (`uri`, `name`, `type`, `image_url`).
- Exact optimistic UI update and rollback handling if quick-play RPC fails.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within Phase 9 scope (including QAM mini-player layout cleanup).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **QAM-01** | User can configure 3-4 pinned playlists to display as compact pill buttons in the QAM mini-player. | Persist `pinned_playlists` (max 4, `MAX_PINNED_PLAYLISTS = 4`) in `DEFAULT_SETTINGS` (`py_modules/common.py`) and `main.py:set_setting` + `get_status`; expose Pin/Unpin via `Y` context menu and detail-view header in `PlaylistsTab`, `AlbumsTab`, and `LikedSongsTab`; render horizontal pill strip in `src/index.tsx` with `DeckifyImage` base64 proxy. |
| **QAM-02** | User can click any pinned playlist in the QAM to start playback within 2 seconds without opening the full-screen modal. | Add `quick_play_pinned(uri, item_type)` RPC in `py_modules/rpc_playback.py` / `main.py` that auto-wakes `librespot` / `spotify_client` if stopped, polls briefly for the Connect device if just woken, and starts context/track playback preserving current shuffle state; apply optimistic highlight in `src/index.tsx` with rollback + toast on error. |
</phase_requirements>

## Project Constraints (from GEMINI.md)

- **Steam CEF Content Security Policy:** Steam GamepadUI blocks direct external image URLs (`https://i.scdn.co/`). All pinned item cover art in QAM and the Expanded Modal MUST go through `DeckifyImage` (`src/components/common/DeckifyImage.tsx`) / `py_modules/images.py` base64 proxy `[VERIFIED: py_modules/images.py:10-38]`.
- **SteamOS GamepadUI Navigation:** Horizontal button groups MUST use `<Focusable flow-children="horizontal">` (never `"row"`, which causes vertical focus jumps) `[VERIFIED: 09-CONTEXT.md:71]`.
- **Error Handling Contract:** Backend RPCs must never crash the event loop; catch exceptions and return `{ "ok": False, "error": str(e) }` `[VERIFIED: py_modules/rpc_playback.py:74-77]`. Frontend surfaces failures via `toaster.toast(...)`.
- **Decky Sandbox & Subprocess Isolation:** `LD_LIBRARY_PATH` is stripped in `py_modules/common.py:38`, and `sys.modules.get(__name__)` is used in `main.py`.
- **No New External Dependencies:** Phase 9 uses existing `@decky/ui` (`^4.11.1`), `@decky/api` (`^1.1.3`), `react-icons` (`^5.5.0`), and Python stdlib `[VERIFIED: package.json:27-50]`.

## Summary

Phase 9 adds a fast-switch pinned playlists strip (up to 4 items: Playlists, Albums, or Liked Songs) directly into the Steam Quick Access Menu (`src/index.tsx`) and reorganizes the QAM layout so primary playback controls + pinned pills sit at the very top, while secondary controls (Volume, Bind Current Music, Playback Device, In-Game Overlay settings, Engine toggle, Open Deckify) are neatly grouped/collapsible below.

The codebase already has almost every building block needed:
1. `py_modules/common.py` (`DEFAULT_SETTINGS`, `_load_settings`, `_save_settings`) and `main.py` (`set_setting`, `get_status`) already persist settings to `settings.json` and broadcast `"settings_changed"` events on every update `[VERIFIED: main.py:633-656]`.
2. `py_modules/images.py` and `src/components/common/DeckifyImage.tsx` already provide an LRU-cached, concurrency-throttled base64 image proxy that bypasses Steam CEF CSP `[VERIFIED: src/components/common/DeckifyImage.tsx:49-112]`.
3. `main.py` already tracks `self._context_uri` from `GET /me/player` in `_poll_playback` and includes `"context_uri": self._context_uri` in `get_status()` `[VERIFIED: main.py:525, 1367-1368]`.
4. `py_modules/rpc_playback.py:play_tracks` already handles `context_uri` playback and 404 auto-transfer, and does not override the user's shuffle state `[VERIFIED: py_modules/rpc_playback.py:326-375]`.

**Primary recommendation:** Implement `pinned_playlists` as a validated list (max 4 entries) in `DEFAULT_SETTINGS` + `main.py`, add a `quick_play_pinned` RPC that wakes the audio engine if stopped and handles Liked Songs URIs reliably, add a lightweight `CollectionActionModal` (or extend `TrackActionModal` / `focusedCollectionRef`) for `Y`-button pinning on playlist/album rows plus a `FaThumbtack` header toggle in detail views, and reorganize `src/index.tsx` per `09-UI-SPEC.md`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Pinned list state & validation (`MAX_PINNED_PLAYLISTS = 4`) | API / Backend (`py_modules/common.py`, `main.py`) | Browser / Client (`DeckifyExpandedModal.tsx`, `src/index.tsx`) | Backend owns `settings.json` persistence, schema sanitization, and `"settings_changed"` broadcast. |
| Quick-switch playback & engine auto-wake | API / Backend (`py_modules/rpc_playback.py`, `main.py`) | Browser / Client (`src/index.tsx`) | Backend checks `_is_engine_running()`, spawns `librespot`/`spotify_client` if stopped, waits briefly for Connect device registration, and calls `me/player/play`. |
| Optimistic pill highlight & rollback | Browser / Client (`src/index.tsx`) | — | Instant UI feedback on click (`optimisticContextUri`) without waiting for 3s status poll; rolls back + toasts on RPC error. |
| Cover art CSP proxy & caching | API / Backend (`py_modules/images.py`) | Browser / Client (`DeckifyImage.tsx`) | Steam CEF blocks `i.scdn.co`; `DeckifyImage` fetches base64 data URIs via `get_image` RPC and caches in `imgMemoryCache`. |
| Pin/Unpin UI entry points (`Y` menu + detail header) | Browser / Client (`PlaylistsTab.tsx`, `AlbumsTab.tsx`, `LikedSongsTab.tsx`) | — | Controller-driven modal UI owns focus state and `Y`-button action dispatch. |

## Standard Stack

### Core (Existing — No New Installs)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@decky/ui` | `^4.11.1` | `PanelSection`, `PanelSectionRow`, `Focusable`, `DialogButton`, `ButtonItem`, `ToggleField`, `SliderField`, `DropdownItem` | Official SteamOS GamepadUI primitive library `[VERIFIED: package.json:29]` |
| `@decky/api` | `^1.1.3` | `callable`, `addEventListener`, `toaster.toast` | Official Decky RPC & event bridge `[VERIFIED: package.json:46]` |
| `react-icons/fa` | `^5.5.0` | `FaThumbtack`, `FaMusic`, `FaCompactDisc`, `FaHeart`, `FaChevronDown`, `FaChevronRight`, `FaPlus` | Already bundled icon set `[VERIFIED: package.json:48]` |
| `DeckifyImage` | in-repo | CSP-safe base64 thumbnail rendering with LRU memory cache | Prevents Steam CEF CSP errors and image flicker `[VERIFIED: src/components/common/DeckifyImage.tsx:49]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `DeckifyImage` for QAM thumbnails | Raw `<img src={item.image_url}>` | Blocked by Steam CEF CSP for `https://i.scdn.co/` URLs — forbidden by D-05 and GEMINI.md |
| Dedicated `CollectionActionModal` / extended `TrackActionModal` | Custom inline buttons on every row | Would clutter list rows and break controller `Y`-menu muscle memory (D-08) |

## Package Legitimacy Audit

No new external npm or PyPI packages are installed in Phase 9. All dependencies are already present in `package.json` and Python stdlib.

## Architecture Patterns

### System Architecture Diagram

```text
[Expanded Modal: PlaylistsTab / AlbumsTab / LikedSongsTab]
   │  (Y button on row OR FaThumbtack toggle in detail header)
   ▼
togglePinItem(item) ──(len >= 4 & !pinned)──► toaster.toast("Max 4 pinned items — unpin one first")
   │ (valid)
   ▼
RPC: set_setting("pinned_playlists", nextList)
   │
   ├─► py_modules/common.py:_save_settings() ──► settings.json
   └─► decky.emit("settings_changed", settings)
          │
          ▼
[QAM Mini-Player: src/index.tsx]
   ├─ Top Zone: Now Playing + Seek + Transport + Pinned Pills (<Focusable flow-children="horizontal">)
   │     └─ Thumbnails via <DeckifyImage src={pill.image_url} width={20} height={20} />
   └─ Secondary Zone (grouped/collapsible below): Volume, Bind to Game, Device, Overlay, Engine, Open Deckify
          │
   (User clicks Pinned Pill)
          │
          ├─► Optimistic UI: setOptimisticContextUri(pill.uri)
          └─► RPC: quick_play_pinned(pill.uri, pill.type)
                 │
                 ├─ Engine stopped? ─► start_librespot() / start_spotify_client() + brief Connect device wait
                 ├─ type == "liked_songs"? ─► fetch me/tracks (limit 50) -> play_tracks(uris=...)
                 └─ type == "playlist" | "album"? ─► play_tracks(context_uri=pill.uri)
                       │
                       ├─ ok: true  ─► _poll_playback() confirms context_uri
                       └─ ok: false ─► rollback optimisticContextUri + toaster.toast(error)
```

### Pattern 1: Pinned Item Schema & Validation (`py_modules/common.py`, `main.py`, `src/types.ts`)
- **TypeScript interface (`src/types.ts`):**
  ```ts
  export type PinnedItemType = "playlist" | "album" | "liked_songs";

  export interface PinnedPlaylistItem {
    uri: string;
    name: string;
    type: PinnedItemType;
    image_url?: string | null;
  }
  ```
  Also add `pinned_playlists?: PinnedPlaylistItem[];` to `EngineSettings` (`src/types.ts:143`) and `context_uri?: string | null;` to `StatusResponse` (`src/types.ts:210`).
- **Backend persistence (`py_modules/common.py`):**
  - Add `MAX_PINNED_PLAYLISTS = 4` constant.
  - Add `"pinned_playlists": []` to `DEFAULT_SETTINGS` (`py_modules/common.py:70`).
  - In `_load_settings()` (`py_modules/common.py:139`), sanitize `pinned_playlists`: ensure it is a `list` of `dict`s with non-empty `uri` and `name`, valid `type` in `("playlist", "album", "liked_songs")`, deduplicated by `uri`, and truncated to `[:MAX_PINNED_PLAYLISTS]`.
- **Backend `set_setting` + `get_status` (`main.py`):**
  - Add `"pinned_playlists"` to `public_keys` in `get_status()` (`main.py:493`) so QAM receives `status.settings.pinned_playlists` on every poll and startup.
  - In `set_setting("pinned_playlists", value)` (`main.py:533`): validate `isinstance(value, list)`, reject or cap if `len(value) > MAX_PINNED_PLAYLISTS` (returning `{"ok": False, "error": "Max 4 pinned items — unpin one first"}` if > 4), normalize each entry `{uri, name, type, image_url}`, save, and emit `"settings_changed"`.

### Pattern 2: Quick-Switch Playback with Engine Auto-Wake (`py_modules/rpc_playback.py` & `main.py`)
- Add `quick_play_pinned(plugin, uri: str, item_type: str = "playlist") -> dict` in `py_modules/rpc_playback.py` and expose `@expose` / async method `quick_play_pinned(self, uri: str, item_type: str = "playlist") -> dict` on `Plugin` in `main.py`.
- **Engine Wake Flow (D-10, < 2s target):**
  1. Check `if not plugin._is_engine_running():` -> call `await plugin.start_librespot()` (which delegates to `start_spotify_client()` when `audio_backend == "spotify_client"` `[VERIFIED: main.py:407-408]`).
  2. If we just started the engine, poll `me/player/devices` briefly (e.g., up to 4 attempts × 300ms = 1.2s max) until at least one device is visible, then transfer/play. This avoids a cold-start 404 failure when `librespot` takes ~500–1000ms to register with Spotify Connect `[ASSUMED: librespot registration timing]`.
  3. **Liked Songs (`item_type == "liked_songs"` or `uri in ("spotify:collection:tracks", "deckify:liked_songs")`):**
     Fetch `me/tracks` (`limit=50`) and call `play_tracks(plugin, uris=[...])`. (Spotify's `PUT /v1/me/player/play` does not accept `spotify:collection:tracks` as a `context_uri` — passing track URIs is 100% reliable without needing `user_id`.)
  4. **Playlists & Albums:** Call `play_tracks(plugin, context_uri=uri)`. Note that `play_tracks` does NOT modify `me/player/shuffle`, preserving the user's current shuffle state per D-10.
  5. Update `plugin._poll_play_state = "playing"` and `plugin._context_uri = uri` on success.

### Pattern 3: QAM Layout Reorganization & Pinned Pills (`src/index.tsx`)
Per D-01, D-02, D-03, D-04, D-11, and `09-UI-SPEC.md`:
1. **Primary Top Zone (immediately reachable on QAM open):**
   - Compact Now Playing row (artwork, track name, artist/album, Playing/Paused)
   - Seek slider (`durationSec > 0`)
   - Transport Controls (`Shuffle`, `Prev`, `Play/Pause`, `Next`, `Repeat`, `Like`)
   - **Pinned Playlist Pills** (`pinnedPlaylists.length > 0`, hidden completely when 0 per D-11):
     - Container: `<Focusable flow-children="horizontal" style={{ display: "flex", alignItems: "center", gap: 8, overflowX: "auto", padding: "4px 0", width: "100%" }}>`
     - Each pill: custom `<Focusable>` or `<DialogButton>` with `minHeight: 36`, `maxWidth: 140`, `padding: "4px 8px"`, `borderRadius: 16`, `gap: 8`, `display: "inline-flex"`, `alignItems: "center"`, `flexShrink: 0`, `border: isActive ? "1px solid #1db954" : "1px solid rgba(255,255,255,0.12)"`, `background: isActive ? "rgba(29, 185, 84, 0.16)" : "rgba(255, 255, 255, 0.08)"`, `color: isActive ? "#1db954" : "#fff"`.
     - Thumbnail: `<DeckifyImage src={pill.image_url} width={20} height={20} style={{ borderRadius: 4, flexShrink: 0 }} fallback={<Icon size={12} />} />`.
     - Label: single-line `12px`/`700` with `whiteSpace: "nowrap"`, `overflow: "hidden"`, `textOverflow: "ellipsis"`.
2. **Secondary Zone (grouped & collapsible below Primary Zone):**
   - `Volume` slider (with `DUCKED` badge)
   - `Bind current music to game` button (when `activeGameAppId !== null`) — **Fix folded todo:** Replace the `borderColor: "#1db954"` override on `<DialogButton>` (`src/index.tsx:491-509`) with `@decky/ui`'s `<ButtonItem>` OR a focus-aware `<Focusable>`/`<DialogButton>` without `borderColor` override and with explicit `focusHalo` styling so GamepadUI focus highlight is unmistakably visible.
   - Collapsible "Controls & Settings" group (toggled via an interactive header row with `FaChevronDown`/`FaChevronRight`) containing: `Playback Device` dropdown, `In-Game Overlay (HUD)` toggle & sub-settings, `librespot Engine` / `Spotify Client` toggle, and `Open Deckify (Full Screen)` button.
   - Note: Keep `Open Deckify (Full Screen)` and `Engine` toggle accessible even when no track is playing (or when unauthenticated, keep QR login prompt visible at top).

### Pattern 4: Expanded Modal Pin/Unpin Entry Points (`DeckifyExpandedModal.tsx`, `PlaylistsTab.tsx`, `AlbumsTab.tsx`, `LikedSongsTab.tsx`)
Per D-07, D-08, D-09, D-12:
- **Pinning helper in `DeckifyExpandedModal.tsx`:**
  - Read `pinnedPlaylists` from `settings.pinned_playlists || []` (also listen to `"settings_changed"` or update local `settings` state on `set_setting` response).
  - `isPinned(uri)`: `pinnedPlaylists.some((p) => p.uri === uri)`.
  - `handleTogglePin(item: PinnedPlaylistItem)`:
    - If already pinned: filter out by `uri`, call `backendSetSetting("pinned_playlists", next)`, show toast `"Unpinned from QAM"`.
    - If not pinned and `pinnedPlaylists.length >= 4`: do NOT evict; show toast `"Max 4 pinned items — unpin one first"`.
    - Otherwise: append `item` (maintaining pin order per D-12), call `backendSetSetting("pinned_playlists", next)`, show toast `"Pinned to QAM"`.
- **Entry Point A (`Y` Action Menu on playlist/album rows):**
  - Currently `DeckifyExpandedModal.tsx:740-753` only checks `focusedTrackRef.current` when `Y` is pressed.
  - Add `focusedCollectionRef` (updated via `onFocusCollection` on playlist rows in `PlaylistsTab` and album rows in `AlbumsTab`) and `actionCollection` state. When `Y` is pressed and `focusedCollectionRef.current` is set (and no track is focused), open a lightweight `CollectionActionModal` (styled identically to `TrackActionModal` with `focusHalo` and focus restoration on close) offering:
    - `Play`
    - `Pin to QAM` / `Unpin from QAM` (or disabled-style `Max 4 Pinned — Unpin One First` when `pinnedPlaylists.length >= 4 && !isPinned`, which triggers the limit toast on click)
- **Entry Point B (Detail-View Header Toggle + Row Pin Badges):**
  - `PlaylistsTab.tsx`:
    - On each playlist row (both inside folders at line 160 and uncategorized at line 269): render a `12px` `#1db954` `FaThumbtack` badge when `isPinned(pl.uri)` is true.
    - In the playlist detail header (`src/components/tabs/PlaylistsTab.tsx:294`): add a compact `<InteractiveRow>` with `<FaThumbtack>` + `aria-label` (tinted `#1db954` when pinned, neutral when unpinned) next to `Play Playlist`.
  - `AlbumsTab.tsx`:
    - On each album row (line 44): render `FaThumbtack` badge when `isPinned(alb.uri)` is true.
    - In the album detail header (`src/components/tabs/AlbumsTab.tsx:71`): add the `<FaThumbtack>` toggle button next to `Play Album`.
  - `LikedSongsTab.tsx`:
    - In the Liked Songs header (`src/components/tabs/LikedSongsTab.tsx:31`): wrap header actions in `<Focusable flow-children="horizontal">` and add the `<FaThumbtack>` toggle button for `{ uri: "spotify:collection:tracks", name: "Liked Songs", type: "liked_songs", image_url: null }` next to `Play All`.

### Anti-Patterns to Avoid
- **Direct `<img src="https://i.scdn.co/...">` in QAM:** Steam CEF CSP blocks external CDN URLs. Always use `<DeckifyImage>`.
- **`<Focusable flow-children="row">`:** Causes vertical focus jumps on D-pad Left/Right. Always use `flow-children="horizontal"`.
- **Auto-evicting the oldest pin on 5th pin:** Explicitly forbidden by D-09. Block and toast `"Max 4 pinned items — unpin one first"`.
- **Forcing shuffle ON in `quick_play_pinned`:** Explicitly forbidden by D-10. Preserve the user's current shuffle state.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Image downloading, disk LRU, memory cache, CSP bypass | Custom `fetch` or base64 converter in QAM | `DeckifyImage` + `py_modules/images.py` | Handles domain allowlisting, 50MB disk LRU, concurrency queue, and shimmer skeleton `[VERIFIED: py_modules/images.py:51-120]` |
| Settings file I/O & cross-view sync | Custom JSON file or localStorage | `set_setting("pinned_playlists", ...)` + `decky.emit("settings_changed", ...)` | Atomic save in `settings.json` and automatic event broadcast to QAM `[VERIFIED: main.py:633-655]` |
| Controller focus ring on custom pills/modals | Ad-hoc CSS `:focus` | `InteractiveRow` / `focusHalo` (`src/components/common/InteractiveRow.tsx:4-15`) | SteamOS GamepadUI uses custom focus events (`onFocus`/`onGamepadFocus`), not browser `:focus` alone |

## Common Pitfalls

### Pitfall 1: QAM `Bind current music to game` Focus Highlight Invisible
**What goes wrong:** The `<DialogButton>` at `src/index.tsx:491-505` sets `borderColor: "#1db954"` in inline `style`, which overrides SteamOS GamepadUI's native focus border/highlight, making it impossible to tell when the button has controller focus.
**How to avoid:** Use `<ButtonItem onClick={handleQuickBind}>` or a `<Focusable>`/`<DialogButton>` with explicit `focusHalo` state (`onFocus`/`onGamepadFocus`) and no conflicting `borderColor` override.

### Pitfall 2: Pressing `Y` on Playlist/Album Rows Does Nothing
**What goes wrong:** `DeckifyExpandedModal.tsx:744-746` only reads `focusedTrackRef.current`, which is only populated by `TrackRowItem` (`onFocusTrack`). Playlist and album list rows don't set it.
**How to avoid:** Track `focusedCollectionRef` via `onFocusCollection` on playlist and album `InteractiveRow` items (and clear `focusedTrackRef` / `focusedCollectionRef` appropriately when switching tabs or opening detail views).

### Pitfall 3: `liked_songs` Context URI Fails on `PUT /v1/me/player/play`
**What goes wrong:** Passing `context_uri: "spotify:collection:tracks"` to Spotify's `/me/player/play` returns HTTP 400 Bad Request.
**How to avoid:** In `quick_play_pinned`, detect `item_type == "liked_songs"` (or `uri == "spotify:collection:tracks"`), fetch the user's saved track URIs from `me/tracks?limit=50`, and call `play_tracks(plugin, uris=track_uris)`.

### Pitfall 4: Engine Cold-Start 404 Race (> 2s or Failure)
**What goes wrong:** When `librespot` is stopped, calling `start_librespot()` spawns the process asynchronously; calling `me/player/play` immediately afterwards returns 404 because `librespot` hasn't registered with Spotify Connect yet.
**How to avoid:** When `quick_play_pinned` wakes a stopped engine, poll `me/player/devices` briefly (e.g., up to 4 × 300ms) until a device appears, then issue `play_tracks`.

## Code Examples

### Existing `set_setting` Validation & Broadcast Pattern (`main.py:627-656`)
```python
# Source: main.py:627-656
elif key == "playlist_folders":
    if not isinstance(value, list):
        return {"ok": False, "error": "playlist_folders must be a list"}
...
self._settings[key] = value
_save_settings(self._settings)
await decky.emit("settings_changed", dict(self._settings))
return {"ok": True, "settings": dict(self._settings)}
```

### Existing Horizontal Focusable Row Pattern (`src/components/tabs/PlaylistsTab.tsx:294-296`)
```tsx
// Source: src/components/tabs/PlaylistsTab.tsx:294-296
<Focusable
  flow-children="horizontal"
  style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}
>
```

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `librespot` cold-start Connect registration takes ~0.5–1.5s on Steam Deck hardware | Architecture Patterns (Pattern 2), Pitfall 4 | If registration takes > 1.5s, a 1.2s device poll loop might fall back to the existing 404 retry in `play_tracks` (+0.5s), approaching ~2s |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Rollup build & Vitest | ✓ | v25.1.0 | — |
| pnpm | Package scripts & test runner | ✓ | 10.28.0 | — |
| Python | Backend unit tests (`unittest`) | ✓ | 3.14.0 (`py`) | — |
| Steam Deck / GamepadUI | Live CEF + `librespot` 2s latency test | ✗ (local Windows dev) | — | Manual verification on Steam Deck (`deploy.sh`) |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Frontend Framework | Vitest `5.1.0` `[VERIFIED: package.json:43]` |
| Backend Framework | Python `unittest` (`py -m unittest discover -s tests -p "test_*.py"`) `[VERIFIED: package.json:14]` |
| Quick run command | `pnpm test` (112 tests across 15 files, ~1.3s) |
| Full suite command | `pnpm test && pnpm typecheck && py -m unittest discover -s tests -p "test_*.py"` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| QAM-01 | `pinned_playlists` persistence, max-4 cap, sanitization in `_load_settings` / `set_setting` | unit (Python) | `py -m unittest tests/test_pinned_playlists.py -v` | ❌ Wave 0 |
| QAM-01 | QAM pinned pill strip rendering (0 hidden, 1–4 rendered, `flow-children="horizontal"`, `DeckifyImage`, `Bind` focus fix) | unit (Vitest) | `pnpm test -- src/index.test.tsx` | ✅ (extend `src/index.test.tsx`) |
| QAM-01 | Pin/Unpin in `PlaylistsTab`, `AlbumsTab`, `LikedSongsTab`, max-4 toast without eviction | unit (Vitest) | `pnpm test -- src/components/DeckifyExpandedModal.test.tsx` | ✅ (extend) |
| QAM-02 | `quick_play_pinned` wakes stopped engine, plays playlist/album/liked_songs without forcing shuffle | unit (Python) | `py -m unittest tests/test_pinned_playlists.py -v` | ❌ Wave 0 |
| QAM-02 | Optimistic active pill highlight + rollback & toast on RPC failure | unit (Vitest) | `pnpm test -- src/index.test.tsx` | ✅ (extend) |

### Wave 0 Gaps
- [ ] `tests/test_pinned_playlists.py` — covers `pinned_playlists` settings validation/max-4 cap and `quick_play_pinned` engine wake + playlist/album/liked_songs playback.
- [ ] Extend `src/index.test.tsx` and `src/components/DeckifyExpandedModal.test.tsx` for QAM pill strip, collapsible secondary controls, `Bind` button focus fix, and Pin/Unpin UI flows.

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V4 Access Control | No | Single local `deck` user session; uses existing Spotify OAuth PKCE token |
| V5 Input Validation | Yes | Validate `pinned_playlists` list length (`<= 4`), `type` allowlist (`"playlist" \| "album" \| "liked_songs"`), and `image_url` domain allowlist in `py_modules/images.py:10-38` |

## Sources

### Primary (HIGH confidence)
- In-repo source files read in this session:
  - `py_modules/common.py` (lines 1-293)
  - `py_modules/rpc_playback.py` (lines 1-407)
  - `py_modules/images.py` (lines 1-150)
  - `py_modules/soundtrack.py` (lines 185-235)
  - `main.py` (lines 405-445, 488-570, 625-665, 1331-1410)
  - `src/index.tsx` (lines 1-650)
  - `src/types.ts` (lines 1-250)
  - `src/components/DeckifyExpandedModal.tsx` (lines 730-805, 930-1010)
  - `src/components/common/DeckifyImage.tsx` (lines 1-120)
  - `src/components/common/TrackActionModal.tsx` (lines 1-180)
  - `src/components/common/InteractiveRow.tsx` (lines 1-120)
  - `src/components/tabs/PlaylistsTab.tsx` (lines 1-310)
  - `src/components/tabs/AlbumsTab.tsx` (lines 1-104)
  - `src/components/tabs/LikedSongsTab.tsx` (lines 1-76)
  - `package.json` (lines 1-62)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries and helpers are already in-repo and verified
- Architecture: HIGH — all RPCs, settings persistence, image proxy, and focus patterns verified directly in source
- Pitfalls: HIGH — identified directly from existing `src/index.tsx` (`borderColor` override) and `DeckifyExpandedModal.tsx` (`focusedTrackRef`)

**Research date:** 2026-11-14
**Valid until:** 2026-12-14 (stable in-repo architecture)
