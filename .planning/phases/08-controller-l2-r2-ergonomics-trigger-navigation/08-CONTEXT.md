# Phase 8: Controller L2/R2 Ergonomics & Trigger Navigation - Context

**Gathered:** 2026-11-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 8 delivers modal-scoped L2/R2 analog trigger ergonomics and controller navigation fixes inside `DeckifyExpandedModal`. Players can blind-seek playback in `NowPlayingTab` and `LyricsTab` without losing D-pad focus, fast-page through library and list tabs (±N items or alphabetical letter anchors), and rely on working modal controller actions (`Y` options, `X` like, triggers) and reachable sidebar `Back to Steam` navigation. Trigger listeners enforce Schmidt hysteresis (`0.75` activate / `0.25` release) with `300ms` software debounce and are strictly scoped to the open modal so in-game controls are never affected.

</domain>

<decisions>
## Implementation Decisions

### L2/R2 Seeking UX & Feedback
- **D-01 (Accumulate & Debounce):** Rapid consecutive L2/R2 trigger pulls in `NowPlayingTab` and `LyricsTab` accumulate into a single pending delta and debounce for `~250ms` before dispatching one seek RPC, preventing Spotify Web API 429 rate limits and seekbar rubberbanding.
- **D-02 (Floating Seek-Delta Pill + Live Preview):** While seeking, display a subtle floating seek-delta pill (e.g. `+20s` / `-10s`) in the modal and immediately update the seekbar preview position before the RPC resolves.
- **D-03 (Boundary Clamping):** Seeking past track boundaries clamps at `0s` (start) and `duration_ms - 1000` (end), preventing accidental track skips when spamming L2 or R2.
- **D-04 (Configurable Seek Step Slider):** Expose the L2/R2 seek step size as a `SliderField` in `SettingsTab.tsx` (e.g. `5s`–`30s`, default `10s`). **Global convention:** ALL time/seconds-based settings in `SettingsTab.tsx` MUST use sliders (`SliderField`), never steppers/dropdowns.

### Library Fast-Page Behavior
- **D-05 (Smart Paging: ±N Items or Alphabetical Anchors):** L2/R2 jumps by a configurable item step (default `±15` items) in standard/chronological lists, and jumps across alphabetical letter anchors (`A → B → C`) when the active list is sorted A–Z.
- **D-06 (Scroll + Focus Transfer):** After jumping in a list, both scroll the target row into view AND transfer D-pad controller focus to that item so subsequent D-pad navigation continues from the new position instead of snapping back.
- **D-07 (All List Tabs Covered):** L2/R2 fast-paging applies uniformly across all list-based tabs (`LikedSongsTab`, `PlaylistsTab`, `AlbumsTab`, `ArtistsTab`, `QueueTab`, `RecentTab`, `PodcastsTab`, `SoundtracksTab`), `SearchTab` results (when focus is outside the text input), and Playlist/Album/Artist detail tracklists.
- **D-08 (Boundary Clamp + Auto Load More & Short-List Shortcut):** At list boundaries, clamp to the first/last item rather than wrapping around. If R2 is pulled at the end of a paginated list that has more items (`onLoadMore`), trigger loading more items. In short lists (fewer items than the jump step), L2 jumps to the first item and R2 jumps to the last item.
- **D-09 (Floating List Position Pill):** Display the same subtle floating indicator pill when fast-paging in lists (e.g. `16 / 120` or letter `M`) briefly after each jump.
- **D-10 (Content-Focus Guard):** Only trigger list fast-paging when D-pad focus is inside the right-hand content pane; ignore L2/R2 list jumps while focus is in the left `Sidebar`.
- **D-11 (Configurable List Jump Slider):** Expose the library jump step size (`5`–`50` items, default `15`) as a `SliderField` in `SettingsTab.tsx`.

### Trigger Input, Settings & Modal Controller Fixes
- **D-12 (Schmidt Hysteresis + Auto-Repeat):** Analog trigger input enforces Schmidt hysteresis (`0.75` press threshold / `0.25` release reset) and `300ms` software debounce, with hold-to-repeat enabled (holding past `500ms` repeats every `300ms`). Strictly scoped to when `DeckifyExpandedModal` is open. — **Reversibility:** costly — core input hook architecture across `FocusNavController` / `SteamClient.Input`.
- **D-13 (Master Toggle & Context-Aware Hint Bar):** Add a master `L2/R2 Trigger Navigation` toggle (default ON) in `SettingsTab.tsx`, plus a subtle context-aware controller hint bar in the modal footer/header (showing e.g. `L2/R2 Seek` in Now Playing/Lyrics vs `L2/R2 Page` in lists, alongside `X Like · Y Options`) with a `SettingsTab.tsx` toggle to hide/disable the hint bar.
- **D-14 (Sub-Modal & Input Suppression):** Pause/suppress L2/R2 trigger actions whenever `ActionMenu`, `PlaylistPickerModal`, or any text `INPUT`/`TEXTAREA` has focus.

### Folded Todos
- **Fix controller actions (Y options, X like, triggers) in modal** (`2026-11-14-modal-controller-actions-broken.md`): Replace/supplement unreliable `window.addEventListener("vgp_onbuttondown", ...)` in `DeckifyExpandedModal.tsx` with reliable SteamOS GamepadUI controller input handling so `Y` (open `ActionMenu`), `X` (toggle like), and `L2`/`R2` triggers work consistently on focused list rows AND on the current track in `NowPlayingTab` / `LyricsTab`.
- **Fix Back to Steam focus navigation in modal sidebar** (`2026-11-14-sidebar-back-to-steam-navigation.md`): Pin `Back to Steam` as a fixed footer outside the scrollable sidebar tab list in `Sidebar.tsx` / `DeckifyExpandedModal.tsx` so it is always reachable via D-pad Down and D-pad Up reliably returns focus to the tab list.

### the agent's Discretion
- Exact styling, positioning, and fade-out timing (`~800ms–1200ms`) of the floating seek/page indicator pill and context-aware hint bar.
- Exact SteamOS GamepadUI analog trigger event subscription mechanism (`FocusNavController.m_rgGamepadInputSources` / `RegisterForControllerInputMessages` / `GamepadButton` fallback) verified against existing `src/index.tsx` patterns.
- Whether `DeckifyExpandedModal` exposes a shared `jumpToIndex` / ref registry or callback context for tabs to register their scrollable list containers.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing:**

### Frontend Modal, Sidebar & Input Handling
- `src/components/DeckifyExpandedModal.tsx` — Lines 600–690: Existing `handleGamepadAction`, `vgp_onbuttondown` listener, `vgp_oncancel` bubble handler, `focusedTrackRef`, and modal layout.
- `src/components/Sidebar.tsx` — Sidebar tab list and `Back to Steam` button focus/scroll structure.
- `src/index.tsx` — Lines 755–807: Working `FocusNavController.m_rgGamepadInputSources[0].RegisterForGamepadButtonDown` pattern used for global chords.
- `src/hooks/usePlaybackClock.ts` — `getScrubStepMs` and post-seek suppression logic used by `NowPlayingTab`.

### Tabs & Settings
- `src/components/tabs/NowPlayingTab.tsx` — `handleSeekDelta` and playback controls.
- `src/components/tabs/LyricsTab.tsx` — Lyrics view (shares L2/R2 seek behavior with Now Playing).
- `src/components/tabs/LikedSongsTab.tsx`, `PlaylistsTab.tsx`, `AlbumsTab.tsx`, `ArtistsTab.tsx`, `QueueTab.tsx`, `RecentTab.tsx`, `PodcastsTab.tsx`, `SoundtracksTab.tsx`, `SearchTab.tsx` — List views receiving fast-page navigation.
- `src/components/tabs/SettingsTab.tsx` — Existing `SliderField` and `ToggleField` patterns for new trigger navigation settings.
- `src/types.ts` — `EngineSettings` interface for persisting trigger settings.

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` — CTRL-01, CTRL-02, CTRL-03.
- `.planning/ROADMAP.md` — Phase 8 success criteria and plan outlines (08-01, 08-02).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `handleSeekDelta` in `DeckifyExpandedModal.tsx` / `NowPlayingTab.tsx`: Already wires playback seeking with optimistic position updates.
- `usePlaybackClock.ts`: Already implements monotonic clock interpolation and post-seek drift suppression, which pairs cleanly with 250ms accumulated L2/R2 seeking.
- `FocusNavController.m_rgGamepadInputSources[0]` pattern in `src/index.tsx`: Proven working way to receive raw gamepad button/input events in SteamOS GamepadUI CEF.
- `InteractiveRow.tsx`: Already handles `onGamepadFocus` / `onGamepadBlur` and `focusHalo` styling on list rows.

### Established Patterns
- Bubble-phase `vgp_oncancel` listener on modal root (`DeckifyExpandedModal.tsx` line 653) so child sliders/sub-modals intercept B-button cleanly.
- `SliderField` for all time/seconds-based settings in `SettingsTab.tsx`.
- Debounced settings persistence via backend `save_setting` RPC (`py_modules/common.py`).

### Integration Points
- `DeckifyExpandedModal.tsx`: Hosts modal-scoped trigger controller, floating indicator pill, hint bar, and fixed `Back to Steam` sidebar footer.
- `src/components/tabs/SettingsTab.tsx` & `py_modules/common.py`: New settings keys (`trigger_nav_enabled`, `trigger_seek_seconds`, `trigger_page_size`, `show_controller_hints`).
- List tab components: Register row/container refs or receive page-jump handlers so L2/R2 can scroll and focus the target row.

</code_context>

<specifics>
## Specific Ideas

- **All Seconds Settings as Sliders:** User explicitly emphasized that *every* setting in `SettingsTab` measured in seconds must be rendered as a slider (`SliderField`).
- **Floating Pill Consistency:** Use the same lightweight floating pill pattern for both seek deltas (`+20s`) and list jumps (`16 / 120` or `M`).
- **Sidebar Footer Pinning:** Keeping `Back to Steam` pinned outside the scrollable sidebar list guarantees it cannot be lost off-screen or trapped during D-pad scrolling.

</specifics>

<deferred>
## Deferred Ideas

### Reviewed Todos (not folded)
The following pending todos matched `area: ui` / `api` during cross-reference but belong outside Phase 8's controller ergonomics & trigger navigation scope:
- `2026-11-14-ingame-hud-visible-inside-modal.md` — Hide In-Game HUD while Spotify modal is open (HUD / overlay scope)
- `2026-11-14-lyrics-clickable-source-selector.md` — Allow clicking lyrics source directly in Lyrics tab (Lyrics UI polish)
- `2026-11-14-now-playing-quick-add-to-playlist.md` — Add quick Add to Playlist action in Now Playing tab (Now Playing UI feature)
- `2026-11-14-qam-bind-button-focus-highlight.md` — Add visible controller focus highlight to QAM Bind current music button (QAM UI polish)
- `2026-11-14-ingame-hud-autohide-duration-slider.md` — Add slider for In-Game HUD autohide duration (HUD settings)
- `2026-11-14-ingame-hud-autohide-ignores-setting.md` — Respect autohide disabled setting in In-Game HUD (HUD bugfix)
- `2026-11-14-smooth-ducking-attenuation-customizable.md` — Make smooth ducking attenuation mode fully configurable (Phase 6 / Ducking polish)
- `2026-11-14-playlist-play-button-unreliable.md` — Fix Play button reliability inside playlists (Playback / Playlists bugfix)
- `2026-11-14-sidebar-now-playing-like-and-add-to-playlist.md` — Allow liking and adding to playlist from sidebar track (Sidebar feature)
- `2026-11-14-followed-playlist-tracks-not-loading.md` — Fix loading tracks for followed playlists from other users (API bugfix)
- `2026-11-14-non-steam-local-grid-covers.md` — Load local Steam grid artwork for Non-Steam games in SoundtracksTab (Phase 7 polish)
- `2026-11-14-recently-played-realtime-update.md` — Update Recently Played in real time after track ends (Playback / Recent tab)
- `2026-11-14-settings-time-options-to-sliders.md` — Convert time-based settings options to sliders (General Settings UI polish — though Phase 8's own seconds settings already follow this rule)
- `2026-11-14-track-notification-album-cover-crop.md` — Fix album cover sizing in track change notification (Notification polish)
- `2026-11-14-track-notification-sound-toggle.md` — Make track change notification sound configurable (Notification settings)
- `2026-11-14-enable-mix-missing-playlist-id.md` — Fix Enable Mix error missing playlist_id on playlists (API bugfix)
- `2026-11-14-playlist-track-click-stops-after-song.md` — Continue playing playlist queue after selecting a track (Playback bugfix)

</deferred>

---

*Phase: 08-Controller L2/R2 Ergonomics & Trigger Navigation*
*Context gathered: 2026-11-14*
