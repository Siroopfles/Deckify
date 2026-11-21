# Phase 21: Dynamic Album-Art Accent Themes & Handheld Battery Eco-Mode - Context

**Gathered:** 2026-11-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can switch between *Classic Spotify Green*, *Dynamic Album Glow* (dominant cover-art accent extracted from proxied artwork and WCAG luminance-clamped to `L >= 55%` for controller focus visibility), and *SteamOS Deck Blue* across the Expanded Modal and in-game HUD (`THEME-01`), and enable Handheld Battery Eco-Mode to automatically suspend non-essential background animations/visualizers during active gameplay on battery and put an idle paused playback engine to sleep after a configurable inactivity timeout (`5–30 min`, automatically bypassed when AC-powered, docked, or running on a Steam Machine/desktop) with transparent wake on the next play command (`ECO-01`).

</domain>

<decisions>
## Implementation Decisions

### Accent Theme Scope & Visuals (`THEME-01`)
- **D-01 (Theme Presets):** Support 3 accent theme modes:
  1. `spotify_green` — *Classic Spotify Green* (`#1DB954`, default)
  2. `dynamic_album` — *Dynamic Album Glow* (extracted from active track's proxied base64 cover art)
  3. `steamos_blue` — *SteamOS Deck Blue* (`#1A9FFF`)
- **D-02 (UI Scope):** Apply the active accent color across **all** accent elements in the Expanded Modal, QAM, and HUD: focus halos, active buttons/pills, progress bars, active icons, `SilentBanner` accent borders/highlights, plus a subtle radial background glow in the Expanded Modal and HUD.
- **D-03 (Fallback Color):** In `dynamic_album` mode, fall back to `#1DB954` (*Classic Spotify Green*) whenever no track is playing, no artwork is available, or the artwork is grayscale/low-saturation.
- **D-04 (Color Extraction & WCAG Clamp):** Extract the dominant accent color on the **frontend** via `<canvas>` downsampling (`32x32` on the already-proxied `data:image/...` base64 URI — zero new Python dependencies) and clamp HSL lightness to `L >= 55%` so controller focus halos and text accents remain WCAG-readable on dark SteamOS surfaces.
- **D-05 (Transitions):** Use a smooth `300–400ms ease` CSS color transition between tracks, automatically switching to **instant** (zero transition cost) when Eco-Mode animation suspension is active on battery.
- **D-06 (Selector Placement):** Place the Accent Theme selector in `SettingsTab` only (keeping the Quick Access Menu compact).

### Battery, Dock & Steam Machine Detection (`ECO-01`)
- **D-07 (Power Source Detection):** Detect battery vs AC/docked state via Linux `/sys/class/power_supply/*` combined with `DockAudioSwitcher` dock status (`is_docked`). **Steam Machine / Desktop safety:** Require an explicit `Battery` supply (`type == "Battery"` and `status == "Discharging"`) to classify as on-battery; if no battery exists (Steam Machine / desktop SteamOS) or sysfs is unavailable, always treat as AC-powered so Eco-Mode sleep and animation suspension never trigger on desktop hardware.
- **D-08 (Defaults & Timeout Range):** Eco-Mode ships **enabled by default** (`eco_mode_enabled: true`) with a **15-minute** default inactivity timeout (`eco_timeout_minutes: 15`), configurable from `5` to `30` minutes in 5-minute steps.
- **D-09 (Sleep Timer Interaction):** Eco-Mode idle sleep applies only while playback is **paused**. If a `SleepTimer` is active and stops/pauses playback, Eco-Mode's inactivity timer starts normally from that paused state.

### Eco-Mode Animation Suspension, Sleep & Wake UX (`ECO-01`)
- **D-10 (Animation Suspension):** While running on battery during active gameplay (and Eco-Mode enabled), suspend non-essential CSS animations, background transitions, and visualizer hooks (exposing a shared state flag for Phase 29's `TvSplitView` spectrum visualizer). `SilentBanner` notifications and controller navigation remain instant and responsive.
- **D-11 (Configurable Engine Sleep Scope):** Make the engine sleep target configurable in `SettingsTab`: default to **Deckify-managed engines only** (`librespot` / `spotifyd`), with an optional toggle/choice to also allow sleeping `spotify_client` if desired.
- **D-12 (Transparent Wake & Status UI):** When the engine enters Eco-Sleep, wake it transparently on the next `play` / `play_tracks` / `quick_play_pinned` command. Display a live Eco-Mode status badge in `SettingsTab` (`On Battery — Active` / `Bypassed (AC / Docked / Desktop)` / `Engine Sleeping`) and a subtle Eco-Sleep indicator in QAM with a quick Play-to-wake action.

### Agent's Discretion
- CSS custom property / React context architecture (`--deckify-accent` or theme context/hook) for propagating the active accent color cleanly without breaking existing component tests.
- Exact `py_modules/eco.py` (or `PowerGovernor`) polling interval and sysfs parsing details.
- Exact settings key names in `py_modules/common.py` and `src/types.ts`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

- `.planning/REQUIREMENTS.md` — `THEME-01`, `ECO-01`
- `.planning/ROADMAP.md` — Phase 21 goal and success criteria
- `src/types.ts` & `py_modules/common.py` — `EngineSettings` and `default_settings` schema
- `py_modules/images.py` — Base64 artwork proxy (`get_image`) used by frontend canvas extraction
- `py_modules/dock.py` — `DockAudioSwitcher` dock/external-DAC status
- `py_modules/engine.py` & `py_modules/resilience.py` — Engine start/stop and transparent wake-on-play patterns
- `src/components/DeckifyExpandedModal.tsx`, `src/components/DeckifyOverlay.tsx`, `src/components/SilentBanner.tsx`, `src/components/tabs/SettingsTab.tsx`, `src/index.tsx` — Hardcoded `#1db954` / `#1DB954` surfaces, QAM, and Settings UI

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/common/DeckifyImage.tsx` & `imgMemoryCache` in `src/index.tsx` — Already proxy Spotify cover art as `data:image/...` base64 URIs, enabling direct `<canvas>` pixel sampling without CORS/CSP issues.
- `py_modules/dock.py` — Already tracks connected dock/USB-DAC/HDMI audio sinks.
- `py_modules/engine.py` & `main.py` — Already handle starting/stopping `librespot` and waking stopped engines inside `play_tracks`.

### Established Patterns
- Steam CEF CSP blocks external image URLs; all artwork is proxied to base64 data URIs.
- Settings persisted atomically via `py_modules/common.py` (`set_setting` RPC) with `copy.deepcopy(default_settings)`.
- `SettingsTab.tsx` uses `@decky/ui` `PanelSection` / `ToggleField` / `SliderField` / compact pills with `width: auto`.

### Integration Points
- Replace hardcoded `#1db954` / `#1DB954` values in modal, HUD, and shared components with dynamic theme accent token/context.
- Hook Eco-Mode power governor into `main.py` background supervision loop and `play`/`play_tracks` wake paths.

</code_context>

<specifics>
## Specific Ideas

- User explicitly noted to account for **Steam Machine** (desktop SteamOS hardware with no battery): must never misidentify missing battery sysfs as "on battery".
- User requested configurable engine sleep scope (Deckify-managed `librespot`/`spotifyd` vs `spotify_client`).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within Phase 21 scope.

</deferred>

---

*Phase: 21-dynamic-album-art-accent-themes-handheld-battery-eco-mode*
*Context gathered: 2026-11-22*
