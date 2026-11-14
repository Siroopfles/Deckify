# Phase 9: QAM Pinned Playlists & Quick In-Game Switch - Context

**Gathered:** 2026-11-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Allow players to pin up to 4 favorite playlists, albums, or Liked Songs from the expanded Library views and trigger playback within 2 seconds directly from compact horizontal pill buttons in the Steam Quick Access Menu (`src/index.tsx`), without opening the full-screen modal. Also clean up and reorganize the QAM mini-player layout so primary playback + pinned playlists sit cleanly at the top while secondary controls are neatly grouped or collapsible underneath.

</domain>

<decisions>
## Implementation Decisions

### QAM Layout & Pill Design
- **D-01:** Reorganize the QAM mini-player (`src/index.tsx`) so compact Now Playing + Transport Controls + Pinned Playlist Pills sit at the top for immediate 1-click D-pad reach, and secondary actions (volume, device selector, settings, Open Library, quick actions) are neatly grouped or collapsible below.
- **D-02:** Place the Pinned Playlist Pills directly below the Transport Controls (Play/Pause/Prev/Next).
- **D-03:** Render each pinned pill as a compact horizontal pill with a square thumbnail (`20x20px`) + truncated single-line name (`text-overflow: ellipsis`).
- **D-04:** Lay out the pills in a single horizontal scrollable row using `<Focusable flow-children="horizontal">` so D-pad Left/Right moves cleanly across the pills.
- **D-05:** Proxy all pinned item cover art through the backend base64 image cache (`py_modules/images.py`) to comply with Steam CEF CSP and avoid UI hitching.

### Pinning Workflow & Capacity
- **D-06:** Maximum of **4** pinned items (`MAX_PINNED_PLAYLISTS = 4`).
- **D-07:** Support pinning Playlists, Albums, and Liked Songs (any playable Spotify context/collection with a URI/type).
- **D-08:** Provide **both** pinning entry points in the Expanded Modal:
  - An `ActionMenu` / `TrackActionModal` (`Y` menu) option (`Pin to QAM` / `Unpin from QAM`) on playable playlist/album/collection rows, plus a visible pin badge/icon on pinned items.
  - A direct Pin/Unpin toggle icon button in the detail-view header of a playlist or album.
- **D-09:** When the user tries to pin a 5th item while 4 items are already pinned, do NOT auto-evict existing pins — show a clear toast notification (e.g., `"Max 4 pinned items — unpin one first"`) and indicate the limit state in the `Y` menu.

### Quick-Switch Playback Behavior
- **D-10:** Clicking a pinned pill in QAM immediately starts playback of that context using the user's current shuffle state (do not force shuffle ON), applies an optimistic UI status update, highlights the currently playing pinned pill with a Spotify green accent, and auto-wakes the local `librespot` / `spotifyd` engine if inactive/sleeping so playback starts within 2 seconds.

### Empty State & Ordering
- **D-11:** When 0 items are pinned, hide the pinned pills section completely in QAM (no extra empty-state noise).
- **D-12:** Maintain pinned items in pin order (with unpinning available from both the `Y` menu and the detail-view header).

### the agent's Discretion
- Exact collapsible/grouped QAM section structure for secondary controls (volume, device, settings, soundtrack quick-bind) as long as Now Playing, Transport, and Pinned Pills stay cleanly at the top and all existing QAM controls remain accessible.
- Exact storage schema under `~/.config/deckify/settings.json` (`py_modules/common.py`) for pinned item metadata (`uri`, `name`, `type`, `image_url`).
- Exact optimistic UI update and rollback handling if quick-play RPC fails.

### Folded Todos
- **Add visible controller focus highlight to QAM Bind current music button** (`2026-11-14-qam-bind-button-focus-highlight.md`): Fix the QAM `"Bind current music to game"` button in `src/index.tsx` so SteamOS GamepadUI's controller focus highlight is clearly visible (use `@decky/ui`'s `ButtonItem` or remove the overriding `borderColor` / add an explicit focus ring style).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

- `.planning/REQUIREMENTS.md` — `QAM-01`, `QAM-02` requirements
- `.planning/ROADMAP.md` — Phase 9 goal and success criteria
- `src/index.tsx` — Quick Access Menu mini-player layout and controls
- `py_modules/common.py` — Settings persistence (`SETTINGS_FILE`, `DEFAULT_SETTINGS`)
- `py_modules/images.py` — Base64 image caching proxy (Steam CEF CSP compliance)
- `py_modules/rpc_playback.py` — Playback start / context play and engine wake RPCs

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `py_modules/images.py`: Existing base64 image cache/proxy used across Deckify to bypass Steam CEF CSP blocking of `https://i.scdn.co/`.
- `src/components/common/TrackActionModal.tsx`: Existing inline controller-focused `Y` action menu overlay pattern.
- `src/components/DeckifyExpandedModal.tsx`: Holds `PlaylistsTab`, `AlbumsTab`, `LikedSongsTab`, and detail views where Pin/Unpin controls integrate.

### Established Patterns
- `<Focusable flow-children="horizontal">` is mandatory for horizontal button rows in SteamOS GamepadUI (using `"row"` causes vertical focus jumps).
- Backend RPC errors return structured `{ ok: false, error }` dicts; frontend surfaces failures via `toaster.toast`.

### Integration Points
- `py_modules/common.py`: Persist `pinned_playlists` in `settings.json` (`DEFAULT_SETTINGS`).
- `src/index.tsx`: Render QAM pinned pills strip directly below Transport Controls and reorganize secondary QAM controls below.
- `src/components/tabs/PlaylistsTab.tsx`, `src/components/tabs/AlbumsTab.tsx`, `src/components/tabs/LikedSongsTab.tsx`: Pin/Unpin action menu & detail header toggle.

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within Phase 9 scope (including QAM mini-player layout cleanup).

</deferred>

---

*Phase: 09-qam-pinned-playlists-quick-in-game-switch*
*Context gathered: 2026-11-14*
