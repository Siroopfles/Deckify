# Phase 24: Podcast & Audiobook Power Suite - Context

**Gathered:** 2026-11-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the Podcast & Audiobook Power Suite (`POD-01`, `POD-02`): `0.5x`–`2.0x` playback speed controls in `NowPlayingTab` and the Quick Access Menu (with automatic `1.0x` reset on music tracks), `-15s` / `+15s` smart-skip transport and `L2`/`R2` trigger adaptation, and per-episode resume progress bars, *"Played"* / remaining-time badges, and *All* / *Unplayed* / *In Progress* filtering in `PodcastsTab`.

</domain>

<decisions>
## Implementation Decisions

### Playback Speed Controls & Steps
- **D-01:** Supported playback speed options are `0.5x`, `0.75x`, `1.0x`, `1.25x`, `1.5x`, `1.75x`, and `2.0x` (explicitly including `0.5x` alongside `0.75x`–`2.0x`).
- **D-02:** In `NowPlayingTab`, expose playback speed via a controller-friendly `@decky/ui` `Dropdown` selector (listing `0.5x` through `2.0x`) when a podcast episode or audiobook is playing.
- **D-03:** In the Quick Access Menu (QAM), expose a compact single-button cycle pill/control (`1.0x` → `1.25x` → `1.5x` → `1.75x` → `2.0x` → `0.5x` → `0.75x` → `1.0x`) when a podcast episode or audiobook is playing.

### Speed Persistence & Music Auto-Reset
- **D-04:** Remember the user's last selected podcast/audiobook playback speed across episodes so the next podcast episode continues at the chosen speed.
- **D-05:** Automatically reset active playback speed to `1.0x` whenever a standard music track starts playing, while preserving the user's preferred podcast speed so it is restored automatically the next time a podcast episode or audiobook plays.

### -15s / +15s Smart-Skip & L2/R2 Triggers
- **D-06:** When a podcast episode or audiobook is playing, `NowPlayingTab` replaces the Previous Track / Next Track transport buttons with dedicated `-15s` / `+15s` smart-skip buttons.
- **D-07:** In `DeckifyExpandedModal`, `L2` and `R2` controller triggers adapt during podcast/audiobook playback to perform `-15s` / `+15s` smart-skip seeks (instead of standard ±10s music seeking), with monotonic clock progression (`usePlaybackClock`) staying synchronized.

### PodcastsTab Progress Bars, Badges & Filtering
- **D-08:** Render a thin green resume progress bar at the bottom of each episode row based on `resume_point` / `duration_ms`, paired with a `"Played"` badge when fully played or a remaining-time badge (e.g., `"12m left"`) when in progress.
- **D-09:** Provide *All*, *Unplayed*, and *In Progress* filter pills in `PodcastsTab` for **both** opened podcast shows and the *Saved Episodes* list.

### the agent's Discretion
- Exact backend mechanism for applying playback speed (`spotify_client` CDP vs `librespot` / engine capability & graceful fallback).
- Exact visual styling of the thin green progress bar, `"Played"` / `"Xm left"` badge, and filter pills within `PodcastsTab.tsx` (following existing `@decky/ui` / `InteractiveRow` conventions).
- Exact QAM placement of the compact speed cycle control when podcast/audiobook playback is active.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & Requirements
- `.planning/ROADMAP.md` — Phase 24 goal and success criteria
- `.planning/REQUIREMENTS.md` — `POD-01`, `POD-02`

### Existing Podcast, Transport & Trigger Implementation
- `src/components/tabs/PodcastsTab.tsx` — Saved shows, show episodes view, and saved episodes list
- `src/components/tabs/NowPlayingTab.tsx` — Primary playback transport controls
- `src/components/DeckifyExpandedModal.tsx` — `useTriggerNavigation` (`L2`/`R2` seek handling) and `usePlaybackClock`
- `src/index.tsx` — Quick Access Menu (`QuickAccessMenu`) playback controls
- `py_modules/engine.py` — `_cdp_get_saved_episodes` and Spotify Client CDP / `librespot` engine integration
- `py_modules/spotify.py` — Spotify Web API podcast/episode endpoints (`resume_point`)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/tabs/PodcastsTab.tsx`: Renders `savedShows`, `savedEpisodes`, and opened show episodes using `InteractiveRow` and `Focusable`.
- `src/components/DeckifyExpandedModal.tsx`: Already routes `L2`/`R2` triggers through `useTriggerNavigation` and tracks live position via `usePlaybackClock`.
- `py_modules/engine.py`: Already has `_cdp_get_saved_episodes` for fetching saved episodes via Official Spotify Client CDP.

### Established Patterns
- Horizontal pill/filter bars MUST use `<Focusable flow-children="horizontal">` for SteamOS GamepadUI D-pad navigation.
- `@decky/ui` `Dropdown` is used for multi-option selectors in GamepadUI modals/tabs.
- RPC methods return `{ "ok": bool, ... }` dictionaries and offload blocking I/O via `_exec()`.

### Integration Points
- `src/types.ts`: `EpisodeItem` / `PlaybackState` types for `resume_point`, `media_type` / `type`, and `playback_speed`.
- `main.py` & `py_modules/engine.py`: Playback speed RPC + auto-reset on music track transition.

</code_context>

<specifics>
## Specific Ideas

- Include `0.5x` in the playback speed options (`0.5x`, `0.75x`, `1.0x`, `1.25x`, `1.5x`, `1.75x`, `2.0x`) using a `Dropdown` in `NowPlayingTab` and a compact cycle button in QAM.
- Remember podcast speed across episodes, reset to `1.0x` on music, and restore podcast speed when returning to podcasts.

</specifics>
