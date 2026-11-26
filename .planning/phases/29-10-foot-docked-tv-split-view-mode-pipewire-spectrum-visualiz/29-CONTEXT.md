# Phase 29: 10-Foot Docked TV Split-View Mode & PipeWire Spectrum Visualizer - Context

**Gathered:** 2026-11-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver `TV-01` and `TV-02` for both Steam Deck (docked and handheld) and SteamOS-based Steam Machines:
1. **10-Foot Docked TV Split-View Mode (`TV-01`):** A dedicated 10-foot living-room view (`TvSplitView.tsx`) inside `DeckifyExpandedModal` featuring large cover art with dynamic accent glow, track metadata, progress bar, and transport controls on the left; and 10-foot dual-line romanized karaoke lyrics, interactive Up Next queue preview, and an optional Jam QR badge/card (reusing `JamQrCard`/`JamQrModal`) on the right. Accessible manually from `NowPlayingTab`, with fully customizable auto-activation in `SettingsTab` for both `DockAudioSwitcher` HDMI/USB-DAC dock hotplugs and SteamOS Steam Machines.
2. **16-Band Real-Time PipeWire Spectrum Visualizer (`TV-02`):** An optional, configurable multi-style 16-band audio spectrum visualizer (`parec --monitor-stream` tapped strictly to Deckify's audio stream at 15 Hz via `resolve_spotify_sink_input_ids()`, animated via GPU-composited CSS `scaleY` transforms) that matches the active accent theme and terminates within `<100ms` on modal close, pause, or Eco-Mode activation.

</domain>

<decisions>
## Implementation Decisions

### Entry, Exit & Dock / Steam Machine Auto-Activation (`TV-01`)
- **D-01:** Manual entry into `TvSplitView` is exposed exclusively via a **"TV Mode"** button inside `NowPlayingTab` (no extra modal header pill or dedicated sidebar tab).
- **D-02:** Pressing `B` (`vgp_oncancel`) while in `TvSplitView` exits TV Split-View and returns to `NowPlayingTab` in the normal `DeckifyExpandedModal` (alongside an explicit **"Exit TV Mode"** button in the TV top bar), rather than closing the entire Deckify modal.
- **D-03:** TV Mode auto-activation is **fully customizable** in `SettingsTab`: users can configure whether `TvSplitView` auto-activates on modal open when docked/TV-connected, switches live on `DockAudioSwitcher` hotplug, or stays manual-only.
- **D-04:** Auto-detection supports both **Steam Deck** (`DockAudioSwitcher` HDMI/USB-DAC sink detection) **and SteamOS Steam Machines** (detecting Steam Machine hardware — no battery / no `acp5x` internal speakers — paired with an active HDMI/DisplayPort/USB-DAC sink) so Steam Machine users can use auto-TV mode seamlessly without a dock hotplug event.

### Split-View Layout, Controls & Jam QR (`TV-01`)
- **D-05:** **Left Pane:** Large Cover Art + Dynamic Accent Glow + Track Title/Artist + Playback Progress Bar + Transport Controls (`Prev`, `Play/Pause`, `Next`, `Like`).
- **D-06:** **Right Pane:** 10-foot dual-line romanized karaoke lyrics + interactive **Up Next** queue preview (pressing `A` on an upcoming track jumps to it) + a compact **"Jam QR"** badge/button in the top-right that expands `JamQrCard` or opens `JamQrModal`, plus quick **Romanization** and **Visualizer** toggles in the TV top bar.
- **D-07:** When the current track has no lyrics (instrumental, podcast episode, or offline without cached `.lrc`), the **Up Next** queue preview expands to fill the right pane so there is no dead empty space.

### 16-Band PipeWire Spectrum Visualizer (`TV-02`)
- **D-08:** Enabled by default when `TvSplitView` opens (when playing locally and Eco-Mode permits), with a 1-click toggle in both the TV top bar and `SettingsTab`.
- **D-09:** Support **multiple selectable visualizer styles/placements** (configurable in `SettingsTab` and/or TV top bar — e.g., Left Pane Bars under cover art, Full-Width Bottom Strip, Mirrored Bars), all driven by the same 16-band 15 Hz `scaleY` GPU-composited stream.
- **D-10:** Visualizer bar colors automatically match the active Deckify accent theme (*Dynamic Album Glow*, *Classic Spotify Green*, or *SteamOS Deck Blue*).
- **D-11:** When playback is on a remote Spotify Connect device (no local PipeWire sink-input for Deckify, or `parec` unavailable), hide the spectrum bars cleanly and display a subtle *"Remote device — local spectrum off"* pill.

### Undock, Eco-Mode & OLED Lifecycle (`TV-01`, `TV-02`)
- **D-12:** On Steam Deck undock while `TvSplitView` is open, **auto-exit** back to `NowPlayingTab` only if TV Mode was auto-activated by docking; if the user opened `TvSplitView` manually, keep it open.
- **D-13:** Handheld Battery Eco-Mode suspends the spectrum visualizer only when actively throttling (on battery during gameplay), displaying a subtle *"Eco-Mode active"* pill; on AC power, docked Steam Deck, or Steam Machine (no battery), the visualizer runs freely.
- **D-14:** Closing `TvSplitView`, closing `DeckifyExpandedModal`, pausing playback, or switching engines terminates the `parec` subprocess within `<100ms`; on pause inside `TvSplitView`, the visualizer bars smoothly drop to a flat idle baseline (zero layout shift) and resume automatically on Play.
- **D-15:** Include an optional **"Ambient / Burn-in Guard"** toggle in TV Settings (`SettingsTab`) that slightly dims static UI chrome after 5 minutes of no controller input to protect OLED TVs and Steam Deck OLED panels during long listening sessions.

### the agent's Discretion
- Exact CSS/layout proportions of the 50/50 split grid, font scaling for 10-foot readability, and exact focus-navigation (`flow-children`) order between left transport controls, TV top bar toggles, and interactive Up Next rows.
- Exact FFT / frequency-binning math (e.g., pure-Python or lightweight numpy-free 16-band logarithmic FFT/DFT on 15 Hz `parec` PCM frames) so zero C-extension `LD_LIBRARY_PATH` conflicts occur in Decky's Python sandbox.
- Exact Steam Machine hardware detection heuristic (e.g., checking `/sys/class/power_supply/BAT*` absence + `acp5x` sink absence).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & Requirements
- `.planning/ROADMAP.md` — Phase 29 goal and 3 success criteria
- `.planning/REQUIREMENTS.md` — `TV-01` and `TV-02` requirement definitions
- `.planning/phases/28-cdp-offline-downloads-wi-fi-travel-mode-living-room-spotify/28-CONTEXT.md` — Reusable `<JamQrCard>` / `<JamQrModal>` contract (`D-12`)

### Existing Dock, Audio, Lyrics, Theme & UI Implementation
- `py_modules/dock.py` — `DockAudioSwitcher`, HDMI/USB-DAC sink classification, and hotplug debounce
- `py_modules/common.py` — `DEFAULT_SETTINGS`, `_save_settings`, `_exec`, `LD_LIBRARY_PATH`-safe subprocess patterns
- `main.py` — Background supervision, playback polling, Eco-Mode & dock state push events
- `src/components/common/JamQrModal.tsx` — Reusable `JamQrCard` and `JamQrModal` for Living Room Spotify Jam
- `src/components/tabs/LyricsTab.tsx` — Dual-line CJK romanized lyrics rendering and `.lrc` sync logic
- `src/components/tabs/NowPlayingTab.tsx` — Transport controls and entry point for TV Mode button
- `src/components/tabs/SettingsTab.tsx` — Settings cards, Eco-Mode, Dock, and TV Mode configuration
- `src/components/DeckifyExpandedModal.tsx` — Full-screen modal shell, `vgp_oncancel`, dynamic accent theme, and tab/view routing
- `src/types.ts` — `PluginStatus`, `DeckifySettings`, `Track`, `QueueItem`, `LyricLine`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `py_modules/dock.py`: `DockAudioSwitcher` already classifies HDMI and USB-DAC sinks (`_docked_sink`, `_docked_sink_label`) and debounces hotplugs (`DOCK_HOTPLUG_DEBOUNCE_S = 1.8`).
- `src/components/common/JamQrModal.tsx`: Already exports `JamQrCard` and `JamQrModal` for embedding or opening Jam QR codes directly inside `TvSplitView`.
- `src/components/tabs/LyricsTab.tsx`: Existing dual-line romanization and synced lyric highlighting logic can be shared/reused for 10-foot karaoke lyrics.
- `DeckifyExpandedModal.tsx`: Already computes/applies dynamic album-art accent glow (`THEME-01`) and manages `vgp_oncancel` focus restoration.

### Established Patterns
- Subprocess execution in Python must strip `LD_LIBRARY_PATH` and run blocking I/O off the event loop (`_exec` / `asyncio.create_subprocess_exec`).
- SteamOS GamepadUI horizontal control bars must use `<Focusable flow-children="horizontal">` with `width: "auto"` / `flexShrink: 0`.
- All images must go through the backend Base64 CSP proxy (`fetchImageAsBase64`).
- Animations in `TvSplitView` must use GPU-composited `transform: scaleY(...)` (never layout-thrashing `height` updates at 15 Hz).

### Integration Points
- `main.py` & `py_modules/audio.py` (or new `py_modules/spectrum.py`): `resolve_spotify_sink_input_ids()`, `parec --monitor-stream` lifecycle (`start_spectrum`, `stop_spectrum`), and 15 Hz band emission via Decky events or fast polling.
- `src/components/tabs/NowPlayingTab.tsx`: Add **"TV Mode"** trigger button.
- `src/components/DeckifyExpandedModal.tsx`: Render `TvSplitView` when active, handle `B` exit back to `NowPlayingTab`, and handle customizable dock/Steam Machine auto-activation & undock exit.
- `src/components/tabs/SettingsTab.tsx` & `src/types.ts`: Add TV Mode auto-activation, visualizer enable/style, and Ambient/Burn-in Guard settings.

</code_context>

<specifics>
## Specific Ideas

- User specifically emphasized supporting **both Steam Deck and SteamOS-based Steam Machines** (no battery, no `acp5x` speakers, always HDMI/DP/USB-DAC connected).
- Visualizer must offer **multiple configurable styles/placements** and **automatically match the active Deckify accent theme**.
- TV Settings should include an optional **Ambient / Burn-in Guard** that slightly dims static UI chrome after 5 minutes of no controller input.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

### Reviewed Todos (not folded)
- `2026-11-21-investigate-decky-loader-breakage-after-steam-update.md` — Keyword match on `steam, deck`; unrelated to Phase 29 TV Split-View & PipeWire Spectrum Visualizer.

</deferred>

---

*Phase: 29-10-foot-docked-tv-split-view-mode-pipewire-spectrum-visualiz*
*Context gathered: 2026-11-26*
