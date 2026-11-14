# Phase 10: In-Game HUD Overlay 2.0 (Live Synced Lyrics) - Context

**Gathered:** 2026-11-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a micro-footprint, discrete event-scheduled (`setTimeout`) live synced lyrics line inside the floating Gamescope HUD overlay (`DeckifyOverlay`) beneath the track/artist header, preserving `pointerEvents: "none"` and 60/90 FPS in-game performance, with an overlay lyrics toggle in QAM & SettingsTab, a lyrics latency offset slider (`-2000ms` to `+2000ms`) in SettingsTab, and the four folded HUD/Lyrics todos (autohide disabled fix, hide HUD while Spotify modal is open, autohide duration slider, and clickable lyrics source selector in `LyricsTab`).

</domain>

<decisions>
## Implementation Decisions

### Lyric Line Presentation & Styling
- **D-01:** Render the active synced lyric line as a **fixed-height single line with `text-overflow: ellipsis`** so the HUD never resizes or jumps mid-game.
- **D-02:** Place the lyric row **full-width below the artwork + title/artist header (above the 2px progress bar)** with a subtle top divider, crisp `11px` text, and a smooth `200ms` CSS opacity cross-fade transition.
- **D-03:** During instrumental breaks or before the first lyric timestamp, display a **subtle `♪` / `•••` placeholder** inside the fixed-height slot to keep layout height steady.

### Discrete Event Scheduling & Pause/Seek Sync
- **D-04:** Schedule lyric transitions using **discrete `setTimeout` timers** calculated from the next lyric timestamp minus `(currentPositionMs + overlayLyricsOffsetMs)` rather than continuous millisecond clock polling (`HUD-04`).
- **D-05:** Reschedule immediately on track change, seek, play/pause, or latency offset adjustment.
- **D-06:** During the 3.5s pause grace period, **freeze the active lyric line and dim it slightly (e.g. 50% opacity)**, clearing pending `setTimeout` timers until playback resumes.

### No-Lyrics Fallback & Fetching
- **D-07:** When a track has no synced lyrics (only plain lyrics or none returned by LRCLIB/backend), **show a subtle `"No synced lyrics"` indicator** in the lyric slot.

### Autohide, Modal Visibility & Duration
- **D-08:** Respect `overlay_autohide` strictly: when Auto-hide is **ON**, the HUD still hides after the configured duration even when overlay lyrics are enabled (re-appearing on track change); when Auto-hide is **OFF**, the HUD stays visible continuously.
- **D-09:** Add an **In-Game HUD Auto-hide Duration slider** ranging from **3s to 15s (step 1s, default 6s)** in `SettingsTab.tsx`.
- **D-10:** **Hide the In-Game HUD immediately while the Spotify modal (`/deckify`) is open**, and restore it cleanly upon closing the modal (resetting the autohide timer if autohide is enabled).

### QAM, Settings & LyricsTab Controls
- **D-11:** Expose the **Overlay Lyrics toggle** in both the **Quick Access Menu (`src/index.tsx`)** under Overlay sub-settings and **`SettingsTab.tsx`**.
- **D-12:** Expose the **Lyrics Latency Offset slider (`-2000ms` to `+2000ms`, step `100ms`, default `0ms`)** in **`SettingsTab.tsx`** (keeping QAM compact).
- **D-13:** In **`LyricsTab.tsx`**, render **clickable source pills/tabs** so users can select any lyrics source directly (while keeping `"Try Next Source"` as a fallback cycle).

### the agent's Discretion
- Exact backend settings keys and defaults in `py_modules/common.py` (`overlay_lyrics_enabled`, `overlay_lyrics_offset_ms`, `overlay_autohide_duration_s`).
- Exact mechanism in `src/index.tsx` / `DeckifyOverlayWrapper` to detect `/deckify` modal open/close state and avoid redundant `get_lyrics` RPCs when `overlay_enabled && overlay_lyrics_enabled` is false.
- Exact CSS/inline styling details for the `200ms` cross-fade and subtle `"No synced lyrics"` / `♪` placeholder.

### Folded Todos
- **Respect autohide disabled setting in In-Game HUD** (`2026-11-14-ingame-hud-autohide-ignores-setting.md`): Fix `DeckifyOverlay` / `DeckifyOverlayWrapper` so disabling autohide keeps the HUD visible instead of hiding automatically.
- **Hide In-Game HUD while Spotify modal is open** (`2026-11-14-ingame-hud-visible-inside-modal.md`): Suppress `DeckifyOverlay` whenever the `/deckify` expanded modal is open.
- **Add slider for In-Game HUD autohide duration** (`2026-11-14-ingame-hud-autohide-duration-slider.md`): Add a 3s–15s (step 1s, default 6s) autohide duration slider in `SettingsTab.tsx` and wire it to `DeckifyOverlay`.
- **Allow clicking lyrics source directly in Lyrics tab** (`2026-11-14-lyrics-clickable-source-selector.md`): Make lyrics sources directly clickable via source pills/tabs in `LyricsTab.tsx`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` — `HUD-03`, `HUD-04` requirements and Out of Scope ("Continuous clock ticker in Gamescope HUD")
- `.planning/ROADMAP.md` — Phase 10 goal and success criteria

### Overlay & Frontend Integration
- `src/components/DeckifyOverlay.tsx` — Gamescope floating HUD component (`pointerEvents: "none"`, `autoHide`, `3500ms` pause grace)
- `src/index.tsx` — `DeckifyOverlayWrapper` global mount, status/event listeners, and QAM Overlay sub-settings
- `src/components/tabs/SettingsTab.tsx` — In-Game Overlay settings card
- `src/components/tabs/LyricsTab.tsx` — Lyrics tab UI and source selection
- `src/utils.ts` — `parseLrc` LRC parser returning `SyncedLine[]`

### Backend Settings & Lyrics
- `py_modules/common.py` — `DEFAULT_SETTINGS` and `settings.json` persistence
- `py_modules/spotify.py` — `get_lyrics` / LRCLIB & multi-source lyrics fetching

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `parseLrc` in `src/utils.ts`: Existing LRC timestamp parser producing sorted `SyncedLine[]` (`timeMs`, `text`), already used by `DeckifyExpandedModal.tsx`.
- `DeckifyOverlay` in `src/components/DeckifyOverlay.tsx`: Existing Gamescope HUD component with `pointerEvents: "none"`, `top-left`/`top-right`/`bottom-left`/`bottom-right` positioning, `3500ms` pause grace, and optional `2px` progress bar.
- `backendGetLyrics` / `py_modules/spotify.py`: Existing lyrics RPC returning `synced_lyrics`, `plain_lyrics`, and source metadata.

### Established Patterns
- SteamOS GamepadUI `SliderField` / `ToggleField` / `DialogButton` patterns in `src/components/tabs/SettingsTab.tsx` and `src/index.tsx`.
- `settings_changed` event listener in `DeckifyOverlayWrapper` (`src/index.tsx`) for live HUD updates without polling.
- Strict `pointerEvents: "none"` on `DeckifyOverlay` container so gameplay and touchscreen inputs never stall.

### Integration Points
- `py_modules/common.py`: Persist `overlay_lyrics_enabled` (boolean), `overlay_lyrics_offset_ms` (number, default `0`), and `overlay_autohide_duration_s` (number, default `6`).
- `src/index.tsx`: `DeckifyOverlayWrapper` fetches synced lyrics on track change when `overlay_enabled && overlay_lyrics_enabled`, tracks modal-open state, and passes settings + lyrics props to `DeckifyOverlay`; QAM Overlay section gains the Overlay Lyrics toggle.
- `src/components/DeckifyOverlay.tsx`: Discrete `setTimeout` lyric line scheduler, fixed-height single-line lyric row with `200ms` opacity cross-fade, pause-dimming, `"No synced lyrics"` fallback, and configurable `autoHideDurationMs`.
- `src/components/tabs/SettingsTab.tsx`: Overlay Lyrics toggle, Latency Offset slider (`-2000ms` to `+2000ms`, step `100ms`), and Auto-hide Duration slider (`3s` to `15s`, step `1s`).
- `src/components/tabs/LyricsTab.tsx`: Clickable source pills/tabs.

</code_context>

<specifics>
## Specific Ideas

- Keep QAM compact: expose the Overlay Lyrics toggle in QAM + SettingsTab, and keep the Latency Offset (`-2000ms` to `+2000ms`, `100ms` step) and Auto-hide Duration (`3s` to `15s`, `1s` step) sliders in `SettingsTab.tsx`.
- Show a subtle `"No synced lyrics"` indicator in the HUD when LRCLIB/backend has no synced timestamps, and a subtle `♪` / `•••` placeholder during instrumental breaks.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within Phase 10 scope (plus the 4 user-selected folded todos).

</deferred>

---

*Phase: 10-In-Game HUD Overlay 2.0 (Live Synced Lyrics)*
*Context gathered: 2026-11-15*
