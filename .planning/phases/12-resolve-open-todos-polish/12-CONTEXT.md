# Phase 12: Resolve open todos & polish - Context

**Gathered:** 2026-11-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Resolve all remaining open todos in `.planning/todos/pending/` (20 items) and archive already-resolved debug sessions in `.planning/debug/` (3 items) so the codebase and `.planning/` artifact state are clean for `v0.5` milestone completion.

</domain>

<decisions>
## Implementation Decisions

### Stale Todo & Debug Cleanup
- **D-01:** Verify each of the 3 debug sessions (`detail-view-missing-mixing-button`, `qam-pinned-pills-no-selection-highlight`, `phase10-overlay-lyrics-controls`) and the ~6 already-implemented todos (`ingame-hud-autohide-duration-slider`, `ingame-hud-visible-inside-modal`, `lyrics-clickable-source-selector`, `modal-controller-actions-broken`, `qam-bind-button-focus-highlight`, `settings-time-options-to-sliders`) against current code and tests; move confirmed-done items to `.planning/debug/resolved/` and `.planning/todos/done/`.

### Playlist & Playback Reliability
- **D-02:** Clicking a track inside a playlist (`playlist-track-click-stops-after-song`) must pass the playlist `context_uri` + track offset (respecting current shuffle state) so playback continues through the playlist rather than stopping after one song.
- **D-03:** Investigate and fix followed playlist track loading (`followed-playlist-tracks-not-loading`), Enable Mix `playlist_id` passing (`enable-mix-missing-playlist-id`), and playlist Play button reliability (`playlist-play-button-unreliable`) end-to-end across frontend and backend (`PlaylistsTab.tsx`, `py_modules/rpc_library.py`, `py_modules/rpc_playback.py`).

### Sidebar, Now Playing & Podcasts UX
- **D-04:** Make the sidebar Now Playing card focusable with `Y` (TrackActionModal / Add to Playlist) and `A` / Like support (`sidebar-now-playing-like-and-add-to-playlist`), AND add a quick Add to Playlist button in `NowPlayingTab.tsx` (`now-playing-quick-add-to-playlist`).
- **D-05:** Fix `Back to Steam` focus reachability and escapability in the modal sidebar (`sidebar-back-to-steam-navigation`), render full metadata for all 20 saved podcast episodes (`podcasts-saved-episodes-metadata`), and refresh Recently Played when the active track changes (`recently-played-realtime-update`).

### Notifications, Ducking & Non-Steam Covers
- **D-06:** Add a configurable track-change notification sound toggle (`track-notification-sound-toggle`) passed via `sound` to `toaster.toast`, fix the album cover sizing/crop (`48x48`, `objectFit: cover`) in the track-change notification (`track-notification-album-cover-crop`), and ensure `autoHide === false` keeps the In-Game HUD visible (`ingame-hud-autohide-ignores-setting`).
- **D-07:** Add a custom percentage `SliderField` alongside the existing presets in `SettingsTab.tsx` for smooth ducking attenuation (`smooth-ducking-attenuation-customizable`), and resolve local Steam grid artwork (`userdata/<id>/config/grid/<appId>p.*`) via the base64 image proxy for Non-Steam games in `SoundtracksTab` (`non-steam-local-grid-covers`).

### Folded Todos
All 20 pending todos in `.planning/todos/pending/` and 3 open debug sessions in `.planning/debug/` are folded into Phase 12 scope (either verified & archived if already implemented, or implemented & tested).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & Audit Context
- `.planning/PROJECT.md` — SteamOS CEF CSP (`data:image/...` base64 proxy), GamepadUI `flow-children="horizontal"` spatial navigation, `deck` user space constraints
- `.planning/debug/` — 3 open debug session files (`detail-view-missing-mixing-button.md`, `phase10-overlay-lyrics-controls.md`, `qam-pinned-pills-no-selection-highlight.md`)
- `.planning/todos/pending/` — All 20 pending todo files defining exact scope and problem descriptions

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/modals/TrackActionModal.tsx` & `AddToPlaylistModal` — Existing modals for track Like and Add to Playlist actions
- `src/components/DeckifyOverlay.tsx` & `DeckifyOverlayWrapper` in `src/index.tsx` — Existing HUD overlay and `autoHide` / `modalOpen` handling
- `py_modules/images.py` & `py_modules/vdf_parser.py` — Existing base64 image proxy and Steam VDF/Non-Steam appId discovery
- `src/components/tabs/SettingsTab.tsx` & `py_modules/volume.py` — Existing `SliderField` pattern and `VolumeFader` attenuation settings

### Established Patterns
- Steam CEF Content Security Policy: All local and remote artwork must be served as base64 data URIs via `py_modules/images.py`
- Public settings allowlist in `main.py:get_status()`: Any new setting (e.g., notification sound toggle, custom ducking attenuation %) must be added to `public_keys` and `py_modules/common.py` defaults
- Rate-limit awareness: Recently Played refresh should trigger on discrete track-change events, never via continuous polling

### Integration Points
- `src/index.tsx` — QAM, `DeckifyOverlayWrapper`, and `toaster.toast` track-change notifications
- `src/components/DeckifyExpandedModal.tsx` — Sidebar, `NowPlayingTab`, `PlaylistsTab`, `PodcastsTab`, `RecentTab`, `SoundtracksTab`, `SettingsTab`
- `py_modules/rpc_library.py`, `py_modules/rpc_playback.py`, `py_modules/vdf_parser.py`, `py_modules/images.py`, `main.py` — Backend RPCs and image/VDF helpers

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within Phase 12 todo/polish scope.

</deferred>

---

*Phase: 12-resolve-open-todos-polish*
*Context gathered: 2026-11-15*
